-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0117 — B107-G: THE EXPANSION RESTRICTION READ FROM WHAT IS IN FORCE NOW, AT THE PROPOSAL AND AT THE ACTIVATION (the bounded review of
-- ef90bb0). 0001–0116 are applied or committed and untouched.
--
-- THE DEFECT (a SOURCE finding, then reproduced through governed paths — phase6-acceptance-b107 "B107-G" with B107G_REPRO=1 on ef90bb0,
-- evidence/cp6/b107g-expansion-repro.txt): governance.ar_propose refused a proposal beyond the previously accepted scope only when the
-- reconciliation had opened the `acceptance_constrained` hold, and governance.ar_attest never re-checked the restriction before the final
-- acceptance, the supersession and the hold lifting. So (a) after a relevant item expired and before any tick, a WIDER version was proposed,
-- accepted, and the newly admitted role reached the handler; (b) a wider version proposed while the original was current was activated by
-- its final attestation after the original's evidence expired; (c) the same even after the tick had reconciled — the hold was lifted.
-- PR-71-005 / ES-71-004: remediation and RE-ACCEPTANCE of the accepted scope before expansion.
--
-- THE CORRECTION: one internal guard, governance._ar_expansion_guard, reads every version in force of the subject in the tenant as it stands
-- NOW (the stored state, or what its current findings make it — the rule of 0116's ar_current, over the internal findings read
-- governance._ar_findings so another domain's record can be judged without that domain's read scope): while one is constrained, suspended
-- or lapsed, another scope is held and the same record may not expand beyond that version's accepted scope. ar_propose calls it where the
-- hold-only loop was; ar_attest calls it at the ACTIVATION (the last attestation) — a refusal rolls the attestation back: nothing recorded,
-- activated, superseded or lifted. Same-scope re-acceptance over renewed evidence passes (the recovery); expansion from a CURRENT acceptance
-- passes. ar_propose, ar_attest and ar_findings are re-declared whole (copied from 0115 §AR.5/§AR.6/§AR.7, the changes marked B107-G).
-- Unchanged: ar_current/ar_gate/ar_scope (0116), _ar_constrain, the sweep, the timer, the claim CHECK.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

/* What a record in force no longer meets (internal — no read-scope assertion; definer ports only). The body of 0115's ar_findings. */
CREATE OR REPLACE FUNCTION governance._ar_findings(p_record uuid, p_version int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE r governance.acceptance_records%ROWTYPE; v_now timestamptz := clock_timestamp(); v_today date := (clock_timestamp() AT TIME ZONE 'UTC')::date; v jsonb := '[]'::jsonb; x jsonb; e governance.acceptance_evidence%ROWTYPE;
BEGIN
  SELECT * INTO r FROM governance.acceptance_records a WHERE a.record_id = p_record AND a.version = p_version;
  IF NOT FOUND THEN RETURN '[]'::jsonb; END IF;
  FOR x IN SELECT * FROM jsonb_array_elements(r.evidence) LOOP
    SELECT * INTO e FROM governance.acceptance_evidence a WHERE a.evidence_id = (x ->> 'evidence_id')::uuid;
    IF e.valid_until <= v_now THEN
      v := v || jsonb_build_array(jsonb_build_object('kind', 'evidence_expired', 'ref', e.evidence_id, 'evidence_kind', e.kind, 'title', e.title, 'valid_until', e.valid_until, 'covers', e.covers));
    ELSIF e.outcome = 'failed' OR EXISTS (SELECT 1 FROM governance.acceptance_evidence f WHERE f.renews = e.evidence_id AND f.outcome = 'failed') THEN
      v := v || jsonb_build_array(jsonb_build_object('kind', 'evidence_failed', 'ref', e.evidence_id, 'evidence_kind', e.kind, 'title', e.title, 'covers', e.covers,
                                                     'failure', (SELECT f.evidence_id FROM governance.acceptance_evidence f WHERE f.renews = e.evidence_id AND f.outcome = 'failed' LIMIT 1)));
    END IF;
  END LOOP;
  FOR x IN SELECT * FROM jsonb_array_elements(r.conditions) LOOP
    IF (x ->> 'due')::date < v_today AND NOT EXISTS (SELECT 1 FROM governance.acceptance_condition_events c WHERE c.record_id = p_record AND c.version = p_version AND c.condition_key = x ->> 'key') THEN
      v := v || jsonb_build_array(jsonb_build_object('kind', 'condition_overdue', 'ref', x ->> 'key', 'due', x ->> 'due', 'text', x ->> 'text'));
    END IF;
  END LOOP;
  IF r.operational IS NOT NULL AND (r.operational ->> 'review_date')::date < v_today THEN
    v := v || jsonb_build_array(jsonb_build_object('kind', 'review_due', 'ref', 'review_date', 'due', r.operational ->> 'review_date'));
  END IF;
  IF (r.scope_tuple -> 'period' ->> 'to')::date < v_today THEN
    v := v || jsonb_build_array(jsonb_build_object('kind', 'period_ended', 'ref', 'period', 'ended', r.scope_tuple -> 'period' ->> 'to'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM governance.artifacts a WHERE a.artifact_id = r.subject_artifact AND a.superseded_at IS NULL AND a.digest = r.subject_digest AND a.lifecycle IN ('active', 'proposed')) THEN
    v := v || jsonb_build_array(jsonb_build_object('kind', 'capability_changed', 'ref', r.subject_key, 'accepted_digest', r.subject_digest,
                                                   'current', (SELECT jsonb_build_object('version', a.version, 'digest', a.digest, 'lifecycle', a.lifecycle) FROM governance.artifacts a WHERE a.artifact_id = r.subject_artifact AND a.superseded_at IS NULL)));
  END IF;
  FOR x IN SELECT * FROM jsonb_array_elements(r.exceptions) LOOP
    IF NOT EXISTS (SELECT 1 FROM governance.artifacts a WHERE a.artifact_id = (x ->> 'artifact_id')::uuid AND a.superseded_at IS NULL AND a.lifecycle = 'active'
                    AND coalesce((a.attributes ->> 'expires_at')::timestamptz, 'infinity'::timestamptz) > v_now)
       OR EXISTS (SELECT 1 FROM governance.holds h WHERE h.lifted_at IS NULL AND h.reason_kind = 'exception_expired' AND (h.source_artifact = (x ->> 'artifact_id')::uuid OR h.subject_artifact = (x ->> 'artifact_id')::uuid)) THEN
      v := v || jsonb_build_array(jsonb_build_object('kind', 'exception_expired', 'ref', x ->> 'key'));
    END IF;
  END LOOP;
  IF r.kind = 'release' AND EXISTS (SELECT 1 FROM governance.holds h WHERE h.subject_artifact = r.subject_artifact AND h.lifted_at IS NULL) THEN
    v := v || jsonb_build_array(jsonb_build_object('kind', 'release_held', 'ref', r.subject_key,
                                                   'holds', (SELECT jsonb_agg(h.reason_kind) FROM governance.holds h WHERE h.subject_artifact = r.subject_artifact AND h.lifted_at IS NULL)));
  END IF;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION governance._ar_findings(uuid, int) FROM PUBLIC;


/* B107-G — THE EXPANSION RESTRICTION as it stands NOW (internal; definer ports only). For every version in force of the subject in the tenant
   (other than the one being proposed or activated): its state now — suspended or lapsed as stored; a period ended → lapsed; any finding,
   stored or current → constrained. While one is not plainly accepted: ANOTHER scope (record) is held; the SAME record may not expand beyond
   that version's accepted scope (ar_expansion) — re-accept the accepted scope first (PR-71-005, ES-71-004). */
CREATE OR REPLACE FUNCTION governance._ar_expansion_guard(p_tenant uuid, p_record uuid, p_subject uuid, p_subject_key text, p_scope jsonb, p_act text, p_version int) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE v governance.acceptance_records%ROWTYPE; v_f jsonb; v_state text; v_exp jsonb; v_why text;
BEGIN
  FOR v IN SELECT r.* FROM governance.acceptance_records r WHERE r.tenant_id = p_tenant AND r.subject_artifact = p_subject
             AND r.state IN ('accepted', 'constrained', 'suspended', 'lapsed') ORDER BY r.accepted_at, r.record_id LOOP
    v_f := governance._ar_findings(v.record_id, v.version);
    v_state := CASE WHEN v.state IN ('suspended', 'lapsed') THEN v.state
                    WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_f) f WHERE f ->> 'kind' = 'period_ended') THEN 'lapsed'
                    WHEN v.state = 'constrained' OR jsonb_array_length(v_f) > 0 THEN 'constrained' ELSE v.state END;
    CONTINUE WHEN v_state = 'accepted';
    v_why := coalesce((SELECT string_agg(DISTINCT e ->> 'kind', ', ') FROM jsonb_array_elements(v.constrained_reasons || v_f) e), v_state);
    IF v.record_id <> p_record THEN
      IF p_act = 'record' THEN
        RAISE EXCEPTION 'acceptance record rejected (held): % is % in another scope (record % — %) — expansion to a new scope is held until it is re-accepted (ES-71-004)',
          p_subject_key, v_state, v.record_id, v_why USING ERRCODE = '23505';
      END IF;
      RAISE EXCEPTION 'acceptance attestation rejected (held): % is % in another scope (record % — %) — the activation of version % is held until that scope is re-accepted (ES-71-004)',
        p_subject_key, v_state, v.record_id, v_why, p_version USING ERRCODE = '23505';
    END IF;
    v_exp := governance.ar_expansion(v.scope_tuple, p_scope);
    IF jsonb_array_length(v_exp) > 0 THEN
      IF p_act = 'record' THEN
        RAISE EXCEPTION 'acceptance record rejected (held): the re-acceptance of % expands beyond its previously accepted scope (%) — re-accept the accepted scope first (ES-71-004)',
          p_subject_key, (SELECT string_agg(e, ', ') FROM jsonb_array_elements_text(v_exp) e) USING ERRCODE = '23505';
      END IF;
      RAISE EXCEPTION 'acceptance attestation rejected (held): % — version % expands beyond the scope in force (%) while version % is % (%) — re-accept the accepted scope first (PR-71-005, ES-71-004)',
        p_subject_key, p_version, (SELECT string_agg(e, ', ') FROM jsonb_array_elements_text(v_exp) e), v.version, v_state, v_why USING ERRCODE = '23505';
    END IF;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION governance._ar_expansion_guard(uuid, uuid, uuid, text, jsonb, text, int) FROM PUBLIC;

/* What a record in force no longer meets (IA-71-002, DP-71-002), under the caller's read scope — B107-G: the body moved to governance._ar_findings
   (internal, for the expansion guard), unchanged; this public read asserts the scope and returns it. */
CREATE OR REPLACE FUNCTION governance.ar_findings(p_record uuid, p_version int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE r governance.acceptance_records%ROWTYPE;
BEGIN
  SELECT * INTO r FROM governance.acceptance_records a WHERE a.record_id = p_record AND a.version = p_version;
  IF NOT FOUND THEN RETURN '[]'::jsonb; END IF;
  PERFORM observation.assert_read_scope(r.tenant_id, r.domain_id, 'an acceptance record''s findings');
  RETURN governance._ar_findings(p_record, p_version);
END $$;
REVOKE ALL ON FUNCTION governance.ar_findings(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ar_findings(uuid, int) TO eye_app, eye_commit;

/* PROPOSE — copied whole from 0115 §AR.5; B107-G: the expansion restriction through governance._ar_expansion_guard. */
CREATE OR REPLACE FUNCTION governance.ar_propose(p_record uuid, p_tenant uuid, p_domain uuid, p_kind text, p_title text, p_subject_key text, p_scope jsonb, p_obligations text[],
                                                 p_evidence uuid[], p_conditions jsonb, p_exceptions uuid[], p_operational jsonb, p_builders uuid[], p_expected_version int,
                                                 p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, observation, public, pg_catalog, pg_temp AS $$
DECLARE
  v_now timestamptz := clock_timestamp(); v_today date := (clock_timestamp() AT TIME ZONE 'UTC')::date;
  subj governance.artifacts%ROWTYPE; v_cur int; v_version int; v_scope jsonb; v_blank text; v_from date; v_to date; k text; x jsonb; o text;
  v_items jsonb := '[]'::jsonb; v_conditions jsonb := '[]'::jsonb; v_exceptions jsonb := '[]'::jsonb; v_builders uuid[]; v_digest text; v_open int;
  v_held jsonb; v_prior governance.acceptance_records%ROWTYPE; v_exp jsonb; v_matrix jsonb; v_kinds text[]; v_task jsonb; v_tasks jsonb := '[]'::jsonb;
  v_subject_kinds text[]; v_obligations text[]; v_operational jsonb := NULL; v_slot text; v_dup uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['governance.acceptance.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM governance._ar_actor('acceptance record', p_actor);
  IF p_kind IS NULL OR NOT (p_kind = ANY (governance.ar_kinds())) THEN
    RAISE EXCEPTION 'acceptance record rejected (kind): % is not a record kind (capability, operational, release, design)', coalesce(p_kind, '<none>') USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_title, ''))) < 4 THEN RAISE EXCEPTION 'acceptance record rejected (title): a record has a title (4+ characters)' USING ERRCODE = '22023'; END IF;

  -- THE SUBJECT (the shared core's artifact: a capability — §RG's registry —, a release candidate — §CM's —, a design component or pattern — §DG's)
  v_subject_kinds := CASE p_kind WHEN 'release' THEN ARRAY['release_candidate'] WHEN 'design' THEN ARRAY['design_component', 'pattern', 'design_asset'] ELSE ARRAY['capability'] END;
  SELECT * INTO subj FROM governance.artifacts a WHERE a.kind = ANY (v_subject_kinds) AND a.external_key = p_subject_key AND a.superseded_at IS NULL AND a.scope = 'PLATFORM'
   ORDER BY a.effective_from DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'acceptance record rejected (unknown_subject): no current % artifact %', array_to_string(v_subject_kinds, ' or '), coalesce(p_subject_key, '<none>') USING ERRCODE = '23503';
  END IF;
  IF subj.lifecycle NOT IN ('active', 'proposed') THEN
    RAISE EXCEPTION 'acceptance record rejected (state): % % is %', subj.kind, subj.external_key, subj.lifecycle USING ERRCODE = '23505';
  END IF;

  -- THE SCOPE TUPLE (PAT-48, ADR-023, PR-71-002, IA-71-003, DP-71-003): exact and complete; the tenant and domain are the route's
  IF jsonb_typeof(p_scope) <> 'object' THEN RAISE EXCEPTION 'acceptance record rejected (scope): the scope is an object' USING ERRCODE = '22023'; END IF;
  v_blank := governance.ar_blanket(p_scope);
  IF v_blank IS NOT NULL THEN
    RAISE EXCEPTION 'acceptance record rejected (blanket): % is a blanket value — acceptance binds an exact scope (PAT-48: no blanket acceptance)', v_blank USING ERRCODE = '22023';
  END IF;
  FOREACH k IN ARRAY ARRAY['capability_version', 'journeys', 'roles', 'deployment_profile', 'entitlement', 'data_versions', 'model_versions', 'configuration_digest', 'consequence_class', 'period'] LOOP
    IF NOT (p_scope ? k) THEN RAISE EXCEPTION 'acceptance record rejected (scope): the scope names its % (the tuple is exact: capability version, journeys, roles, deployment profile, entitlement, data and model versions, configuration digest, consequence class, period)', k USING ERRCODE = '22023'; END IF;
  END LOOP;
  IF jsonb_typeof(p_scope -> 'journeys') <> 'array' OR jsonb_typeof(p_scope -> 'roles') <> 'array' THEN
    RAISE EXCEPTION 'acceptance record rejected (scope): journeys and roles are lists' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(p_scope -> 'roles') r WHERE NOT EXISTS (SELECT 1 FROM identity.roles x WHERE x.code = r)) THEN
    RAISE EXCEPTION 'acceptance record rejected (scope): every role in scope is a role of the product (%)', (SELECT string_agg(r, ', ') FROM jsonb_array_elements_text(p_scope -> 'roles') r WHERE NOT EXISTS (SELECT 1 FROM identity.roles x WHERE x.code = r)) USING ERRCODE = '22023';
  END IF;
  IF (p_scope ->> 'deployment_profile') NOT IN ('local-dev', 'saas', 'private-cloud', 'on-premise') THEN
    RAISE EXCEPTION 'acceptance record rejected (scope): the deployment profile is local-dev, saas, private-cloud or on-premise' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_scope -> 'data_versions') <> 'object' OR jsonb_typeof(p_scope -> 'model_versions') <> 'object' OR (SELECT count(*) FROM jsonb_object_keys(p_scope -> 'data_versions')) = 0 THEN
    RAISE EXCEPTION 'acceptance record rejected (scope): data versions (non-empty) and model versions are objects {name: version}' USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_scope ->> 'configuration_digest', '') !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'acceptance record rejected (scope): the configuration digest is 64 hex' USING ERRCODE = '22023'; END IF;
  IF governance.ar_class_rank(p_scope ->> 'consequence_class') IS NULL THEN RAISE EXCEPTION 'acceptance record rejected (scope): the consequence class is C0–C4' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_scope ->> 'capability_version', ''))) < 1 OR length(btrim(coalesce(p_scope ->> 'entitlement', ''))) < 2 THEN
    RAISE EXCEPTION 'acceptance record rejected (scope): the capability version and the entitlement are named' USING ERRCODE = '22023';
  END IF;
  BEGIN
    v_from := (p_scope -> 'period' ->> 'from')::date; v_to := (p_scope -> 'period' ->> 'to')::date;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'acceptance record rejected (period): the period is {from, to} as days' USING ERRCODE = '22023';
  END;
  IF v_from IS NULL OR v_to IS NULL OR v_to < v_from OR v_to < v_today OR v_to - v_from > 366 THEN
    RAISE EXCEPTION 'acceptance record rejected (period): a period from ≤ to, not ended, at most 366 days — acceptance is time-bounded' USING ERRCODE = '22023';
  END IF;
  IF p_kind = 'operational' THEN
    FOREACH k IN ARRAY governance.ar_operational_scope_keys() LOOP
      IF jsonb_typeof(p_scope -> k) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'acceptance record rejected (scope): an operational acceptance names its % (a non-empty list — IA-71-003, DP-71-003)', k USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END IF;
  v_scope := (p_scope - 'tenant' - 'domain' - 'capability' - 'release') || jsonb_build_object('tenant', p_tenant, 'domain', p_domain, 'capability', CASE WHEN p_kind = 'release' THEN NULL ELSE subj.external_key END);
  IF p_kind = 'release' THEN
    v_scope := v_scope || jsonb_build_object('release', jsonb_build_object('candidate_id', subj.artifact_id, 'version', subj.version, 'key', subj.external_key, 'digest', subj.digest,
                                                                            'identity', subj.attributes));
  END IF;

  -- THE OBLIGATIONS (ES-71-002, PR-71-003)
  v_obligations := ARRAY(SELECT DISTINCT unnest(coalesce(p_obligations, '{}'::text[]) || governance.ar_min_obligations(p_kind)) ORDER BY 1);
  FOREACH o IN ARRAY v_obligations LOOP
    IF NOT (o = ANY (governance.ar_obligations())) THEN RAISE EXCEPTION 'acceptance record rejected (obligation): % is not an obligation (%)', o, array_to_string(governance.ar_obligations(), ', ') USING ERRCODE = '22023'; END IF;
  END LOOP;

  -- THE EVIDENCE (current, passed or recorded, of this domain; covers within scope); missing or stale refuses (PR-71-005)
  IF cardinality(coalesce(p_evidence, '{}'::uuid[])) = 0 THEN RAISE EXCEPTION 'acceptance record rejected (evidence_missing): acceptance is evidence-bound — name the evidence items' USING ERRCODE = '22023'; END IF;
  FOR x IN SELECT to_jsonb(e) FROM governance.acceptance_evidence e WHERE e.evidence_id = ANY (p_evidence) AND e.tenant_id = p_tenant AND e.domain_id = p_domain ORDER BY e.kind, e.recorded_at LOOP
    IF (x ->> 'valid_until')::timestamptz <= v_now THEN
      RAISE EXCEPTION 'acceptance record rejected (stale): evidence % (%) expired at % — renew it first', x ->> 'evidence_id', x ->> 'kind', x ->> 'valid_until' USING ERRCODE = '23505';
    END IF;
    IF x ->> 'outcome' = 'failed' OR EXISTS (SELECT 1 FROM governance.acceptance_evidence f WHERE f.renews = (x ->> 'evidence_id')::uuid AND f.outcome = 'failed') THEN
      RAISE EXCEPTION 'acceptance record rejected (evidence_failed): evidence % (%) records a failure — remediate and retest', x ->> 'evidence_id', x ->> 'kind' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(x -> 'covers' -> 'journeys', '[]'::jsonb)) j WHERE NOT ((v_scope -> 'journeys') ? j))
       OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(x -> 'covers' -> 'roles', '[]'::jsonb)) r WHERE NOT ((v_scope -> 'roles') ? r)) THEN
      RAISE EXCEPTION 'acceptance record rejected (scope): evidence % covers journeys or roles outside the declared scope', x ->> 'evidence_id' USING ERRCODE = '22023';
    END IF;
    v_items := v_items || jsonb_build_array(jsonb_build_object('evidence_id', x -> 'evidence_id', 'kind', x -> 'kind', 'title', x -> 'title', 'digest', x -> 'digest',
                                                               'subject_kind', x -> 'subject_kind', 'subject_digest', x -> 'subject_digest', 'covers', x -> 'covers',
                                                               'captured_at', x -> 'captured_at', 'valid_until', x -> 'valid_until', 'recorded_by', x -> 'recorded_by'));
  END LOOP;
  IF jsonb_array_length(v_items) <> cardinality(ARRAY(SELECT DISTINCT unnest(p_evidence))) THEN
    RAISE EXCEPTION 'acceptance record rejected (unknown_evidence): % of the named evidence items are not items of this domain', cardinality(ARRAY(SELECT DISTINCT unnest(p_evidence))) - jsonb_array_length(v_items) USING ERRCODE = '23503';
  END IF;
  v_kinds := ARRAY(SELECT DISTINCT i ->> 'kind' FROM jsonb_array_elements(v_items) i);
  IF p_kind IN ('capability', 'release') AND NOT ('test_report' = ANY (v_kinds) OR 'journey_evidence' = ANY (v_kinds)) THEN
    RAISE EXCEPTION 'acceptance record rejected (evidence_missing): a % acceptance needs current test or journey evidence (PR-71-006)', p_kind USING ERRCODE = '22023';
  END IF;

  -- THE CONDITIONS: the proposer's, plus an OPEN condition for every absent evidence slot (never a silent pass)
  IF jsonb_typeof(coalesce(p_conditions, '[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'acceptance record rejected (condition): conditions are a list' USING ERRCODE = '22023'; END IF;
  FOR x IN SELECT * FROM jsonb_array_elements(coalesce(p_conditions, '[]'::jsonb)) LOOP
    IF coalesce(x ->> 'key', '') !~ '^[a-z][a-z0-9_.:-]{1,60}$' OR length(btrim(coalesce(x ->> 'text', ''))) < 8 THEN
      RAISE EXCEPTION 'acceptance record rejected (condition): a condition has a key and a text (8+ characters)' USING ERRCODE = '22023';
    END IF;
    BEGIN
      IF (x ->> 'due')::date < v_today OR (x ->> 'due')::date > v_to THEN
        RAISE EXCEPTION 'acceptance record rejected (condition): condition % is due within the period (by %)', x ->> 'key', v_to USING ERRCODE = '22023';
      END IF;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow OR invalid_text_representation THEN
      RAISE EXCEPTION 'acceptance record rejected (condition): condition % names its due day', x ->> 'key' USING ERRCODE = '22023';
    END;
    IF x ->> 'due' IS NULL THEN RAISE EXCEPTION 'acceptance record rejected (condition): condition % names its due day — conditions are time-bounded', x ->> 'key' USING ERRCODE = '22023'; END IF;
    IF v_conditions @> jsonb_build_array(jsonb_build_object('key', x ->> 'key')) THEN RAISE EXCEPTION 'acceptance record rejected (condition): condition key % is named twice', x ->> 'key' USING ERRCODE = '22023'; END IF;
    v_conditions := v_conditions || jsonb_build_array(jsonb_build_object('key', x ->> 'key', 'text', btrim(x ->> 'text'), 'due', x ->> 'due', 'source', 'proposer'));
  END LOOP;
  FOREACH v_slot IN ARRAY governance.ar_slots(p_kind) LOOP
    IF NOT (v_slot = ANY (v_kinds)) THEN
      v_conditions := v_conditions || jsonb_build_array(jsonb_build_object('key', 'slot:' || v_slot, 'text', format('no current %s evidence was named — an open condition until it is recorded and closed', replace(v_slot, '_', ' ')),
                                                                           'due', least(v_to, v_today + 30), 'source', 'slot', 'slot', v_slot));
    END IF;
  END LOOP;
  IF jsonb_array_length(v_conditions) > 0 AND governance.ar_class_rank(v_scope ->> 'consequence_class') > governance.ar_class_rank('C2') THEN
    RAISE EXCEPTION 'acceptance record rejected (conditional): a conditional acceptance (% open conditions) is consequence-limited to C2 (ES-71-004) — close the conditions or lower the class', jsonb_array_length(v_conditions) USING ERRCODE = '22023';
  END IF;

  -- THE OPERATIONAL PART (ES-71-001, IA-71-002, DP-71-002, DAT-DL-08): owners, open risks, constraints, support model, monitoring, review date, withdrawal criteria
  IF p_kind = 'operational' THEN
    IF jsonb_typeof(p_operational) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'acceptance record rejected (operational): an operational acceptance states its operating terms' USING ERRCODE = '22023'; END IF;
    IF jsonb_typeof(p_operational -> 'owners') <> 'array' OR jsonb_array_length(p_operational -> 'owners') = 0
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_operational -> 'owners') w WHERE length(btrim(coalesce(w ->> 'responsibility', ''))) < 3 OR NOT EXISTS (SELECT 1 FROM identity.roles r WHERE r.code = w ->> 'role')) THEN
      RAISE EXCEPTION 'acceptance record rejected (operational): the owners are a list of {responsibility, role} naming roles of the product' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(p_operational -> 'open_risks') <> 'array' OR jsonb_typeof(p_operational -> 'constraints') <> 'array'
       OR jsonb_typeof(p_operational -> 'withdrawal_criteria') <> 'array' OR jsonb_array_length(p_operational -> 'withdrawal_criteria') = 0 THEN
      RAISE EXCEPTION 'acceptance record rejected (operational): open risks and constraints are lists; the withdrawal criteria are a non-empty list' USING ERRCODE = '22023';
    END IF;
    IF length(btrim(coalesce(p_operational ->> 'monitoring', ''))) < 8 THEN RAISE EXCEPTION 'acceptance record rejected (operational): the monitoring is stated (8+ characters)' USING ERRCODE = '22023'; END IF;
    IF (p_operational ->> 'review_date') IS NULL OR (p_operational ->> 'review_date')::date < v_today OR (p_operational ->> 'review_date')::date > v_to THEN
      RAISE EXCEPTION 'acceptance record rejected (operational): the review date falls within the period' USING ERRCODE = '22023';
    END IF;
    -- the support model: B94's approved responsibility matrix of this profile (referenced, never rewritten); absent → an open condition
    SELECT jsonb_build_object('matrix_id', m.matrix_id, 'version', m.version, 'digest', m.digest, 'profile', m.deployment_profile) INTO v_matrix
      FROM service.responsibility_matrices m WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain AND m.deployment_profile = v_scope ->> 'deployment_profile' AND m.state = 'approved'
     ORDER BY m.version DESC LIMIT 1;
    IF v_matrix IS NULL THEN
      v_conditions := v_conditions || jsonb_build_array(jsonb_build_object('key', 'support_model', 'text', 'no approved responsibility matrix (the support model) for this profile — an open condition', 'due', least(v_to, v_today + 30), 'source', 'slot'));
    END IF;
    v_operational := jsonb_build_object('owners', p_operational -> 'owners', 'open_risks', p_operational -> 'open_risks', 'constraints', p_operational -> 'constraints',
                                        'monitoring', btrim(p_operational ->> 'monitoring'), 'review_date', p_operational ->> 'review_date', 'withdrawal_criteria', p_operational -> 'withdrawal_criteria',
                                        'support_model', v_matrix, 'evidence_versions', (SELECT jsonb_object_agg(i ->> 'evidence_id', i ->> 'digest') FROM jsonb_array_elements(v_items) i));
  ELSIF p_operational IS NOT NULL AND p_operational <> '{}'::jsonb THEN
    RAISE EXCEPTION 'acceptance record rejected (operational): operating terms belong to an operational acceptance' USING ERRCODE = '22023';
  END IF;

  -- THE LINKED EXCEPTIONS (ES-68-004): §PG's registry, read through the shared core; an expired or held one refuses
  FOR x IN SELECT to_jsonb(a) FROM governance.artifacts a WHERE a.artifact_id = ANY (coalesce(p_exceptions, '{}'::uuid[])) AND a.superseded_at IS NULL AND a.kind = 'exception' LOOP
    IF x ->> 'lifecycle' <> 'active' OR coalesce((x -> 'attributes' ->> 'expires_at')::timestamptz, 'infinity'::timestamptz) <= v_now
       OR EXISTS (SELECT 1 FROM governance.holds h WHERE h.lifted_at IS NULL AND h.reason_kind = 'exception_expired' AND (h.source_artifact = (x ->> 'artifact_id')::uuid OR h.subject_artifact = (x ->> 'artifact_id')::uuid)) THEN
      RAISE EXCEPTION 'acceptance record rejected (expired): exception % is % — renew it with current evidence before it is carried into an acceptance', x ->> 'external_key',
        CASE WHEN x ->> 'lifecycle' <> 'active' THEN x ->> 'lifecycle' ELSE 'expired' END USING ERRCODE = '23505';
    END IF;
    v_exceptions := v_exceptions || jsonb_build_array(jsonb_build_object('artifact_id', x -> 'artifact_id', 'key', x -> 'external_key', 'version', x -> 'version', 'digest', x -> 'digest',
                                                                         'expires_at', x -> 'attributes' -> 'expires_at'));
  END LOOP;
  IF jsonb_array_length(v_exceptions) <> cardinality(ARRAY(SELECT DISTINCT unnest(coalesce(p_exceptions, '{}'::uuid[])))) THEN
    RAISE EXCEPTION 'acceptance record rejected (unknown_exception): a named exception is not a current exception of the registry' USING ERRCODE = '23503';
  END IF;

  -- A RELEASE CANDIDATE HELD (an expired exception, a conflict, stale evidence — §PG / §CM) is never accepted (FEX-32, V03-T-453)
  IF p_kind = 'release' THEN
    SELECT jsonb_agg(jsonb_build_object('reason_kind', h.reason_kind, 'reason', h.reason)) INTO v_held FROM governance.holds h WHERE h.subject_artifact = subj.artifact_id AND h.lifted_at IS NULL;
    IF v_held IS NOT NULL THEN
      RAISE EXCEPTION 'acceptance record rejected (held): release candidate % is held — %', subj.external_key, (SELECT string_agg(e ->> 'reason_kind' || ': ' || (e ->> 'reason'), '; ') FROM jsonb_array_elements(v_held) e) USING ERRCODE = '23505';
    END IF;
  END IF;

  -- THE VERSION and THE EXPANSION HOLD (ES-71-004)
  SELECT coalesce(max(r.version), 0) INTO v_cur FROM governance.acceptance_records r WHERE r.record_id = p_record;
  IF EXISTS (SELECT 1 FROM governance.acceptance_records r WHERE r.record_id = p_record AND (r.tenant_id <> p_tenant OR r.domain_id <> p_domain OR r.kind <> p_kind OR r.subject_artifact <> subj.artifact_id)) THEN
    RAISE EXCEPTION 'acceptance record rejected (unknown_record): % is not a % record of % in this domain', p_record, p_kind, p_subject_key USING ERRCODE = '23503';
  END IF;
  IF v_cur IS DISTINCT FROM coalesce(p_expected_version, 0) THEN
    RAISE EXCEPTION 'acceptance record rejected (stale): the record is at version % (expected %)', v_cur, coalesce(p_expected_version::text, '0') USING ERRCODE = '23505';
  END IF;
  SELECT r.record_id INTO v_dup FROM governance.acceptance_records r
   WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.kind = p_kind AND r.subject_artifact = subj.artifact_id AND r.record_id <> p_record
     AND r.state IN ('proposed', 'accepted', 'constrained', 'suspended', 'lapsed') LIMIT 1;
  IF v_dup IS NOT NULL THEN
    RAISE EXCEPTION 'acceptance record rejected (duplicate): record % already governs % here — propose its next version', v_dup, subj.external_key USING ERRCODE = '23505';
  END IF;
  -- B107-G: the EXPANSION restriction read from what is in force NOW (a record no longer meeting its evidence counts before any tick), not from the hold alone
  PERFORM governance._ar_expansion_guard(p_tenant, p_record, subj.artifact_id, subj.external_key, v_scope, 'record', NULL);

  -- THE BUILDERS (never attesters): declared, the subject's declared builders, the recorders of its build and test evidence
  v_builders := ARRAY(SELECT DISTINCT b FROM unnest(coalesce(p_builders, '{}'::uuid[])
                        || ARRAY(SELECT (j #>> '{}')::uuid FROM jsonb_array_elements(coalesce(subj.attributes -> 'builders', '[]'::jsonb)) j WHERE (j #>> '{}') ~ '^[0-9a-f-]{36}$')
                        || ARRAY(SELECT (i ->> 'recorded_by')::uuid FROM jsonb_array_elements(v_items) i WHERE i ->> 'kind' IN ('build', 'test_report', 'release_candidate'))) b ORDER BY 1);

  v_version := v_cur + 1;
  v_digest := governance.digest(jsonb_build_object('record_id', p_record, 'version', v_version, 'kind', p_kind, 'title', btrim(p_title), 'subject', jsonb_build_object('artifact_id', subj.artifact_id,
                'version', subj.version, 'key', subj.external_key, 'digest', subj.digest), 'scope', v_scope, 'obligations', to_jsonb(v_obligations), 'evidence', v_items,
                'conditions', v_conditions, 'exceptions', v_exceptions, 'operational', v_operational, 'builders', to_jsonb(v_builders), 'claim', 'demonstration'));
  UPDATE governance.acceptance_records SET state = 'superseded', ended_by = p_actor, ended_at = v_now, end_reason = format('superseded by proposed version %s', v_version)
   WHERE record_id = p_record AND state IN ('proposed', 'withheld');
  INSERT INTO governance.acceptance_records (record_id, version, tenant_id, domain_id, kind, title, subject_artifact, subject_key, subject_digest, scope_tuple, obligations, evidence,
                                            conditions, exceptions, operational, builders, digest, proposed_by, correlation_id)
  VALUES (p_record, v_version, p_tenant, p_domain, p_kind, btrim(p_title), subj.artifact_id, subj.external_key, subj.digest, v_scope, v_obligations, v_items, v_conditions, v_exceptions,
          v_operational, v_builders, v_digest, p_actor, p_correlation);

  -- the shared core: the record is an artifact; it covers its subject; its evidence evidences it; its exceptions except it
  PERFORM governance._ar_artifact(p_record, p_tenant, p_domain, 'acceptance_record', 'ACC-' || p_record::text, btrim(p_title) || ' (claim: demonstration)', 'proposed',
                                  jsonb_build_object('kind', p_kind, 'version', v_version, 'subject', subj.external_key, 'state', 'proposed', 'claim', 'demonstration'),
                                  governance.digest(jsonb_build_object('record', v_digest, 'state', 'proposed')), p_actor, p_correlation);
  PERFORM governance._ar_link(p_tenant, p_domain, p_record, subj.artifact_id, 'covers', jsonb_build_object('kind', p_kind), p_actor, p_correlation);
  FOR x IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    PERFORM governance._ar_link(p_tenant, p_domain, (x ->> 'evidence_id')::uuid, p_record, 'evidences', jsonb_build_object('version', v_version), p_actor, p_correlation);
  END LOOP;
  FOR x IN SELECT * FROM jsonb_array_elements(v_exceptions) LOOP
    PERFORM governance._ar_link(p_tenant, p_domain, (x ->> 'artifact_id')::uuid, p_record, 'excepts', jsonb_build_object('version', v_version), p_actor, p_correlation);
  END LOOP;

  -- the attestations awaited: one governance.attest task per obligation (candidate roles; the port decides who)
  FOREACH o IN ARRAY v_obligations LOOP
    v_task := executive._open_human_task(gen_random_uuid(), p_tenant, p_domain, 'governance.attest', format('attest:%s:%s:%s', p_record, v_version, o),
                jsonb_build_object('kind', 'acceptance_record', 'id', p_record, 'version', v_version, 'obligation', o),
                format('Attest the %s obligation of "%s" v%s', replace(o, '_', ' '), btrim(p_title), v_version), NULL, governance.ar_obligation_roles(o),
                jsonb_build_object('rule', 'a named human holding the obligation''s role; never the proposer, never a builder, never an agent; one person per obligation'),
                NULL, '{}'::jsonb, NULL, NULL, p_actor, p_correlation);
    v_tasks := v_tasks || jsonb_build_array(jsonb_build_object('obligation', o, 'task_id', v_task -> 'task_id'));
  END LOOP;
  PERFORM governance.ledger(p_tenant, p_domain, 'acceptance_record', p_record, v_version, 'acceptance.proposed', p_actor,
                            jsonb_build_object('kind', p_kind, 'subject', subj.external_key, 'digest', v_digest, 'obligations', to_jsonb(v_obligations),
                                               'evidence', (SELECT jsonb_agg(i -> 'evidence_id') FROM jsonb_array_elements(v_items) i), 'conditions', jsonb_array_length(v_conditions),
                                               'exceptions', jsonb_array_length(v_exceptions), 'claim', 'demonstration'), p_correlation);
  RETURN jsonb_build_object('record_id', p_record, 'version', v_version, 'state', 'proposed', 'kind', p_kind, 'digest', v_digest, 'scope', v_scope, 'obligations', to_jsonb(v_obligations),
                            'evidence', v_items, 'conditions', v_conditions, 'exceptions', v_exceptions, 'operational', v_operational, 'builders', to_jsonb(v_builders), 'tasks', v_tasks,
                            'claim', 'demonstration', 'real_acceptance', 'R2: acceptance by named independent and customer authorities is external');
END $$;
REVOKE ALL ON FUNCTION governance.ar_propose(uuid, uuid, uuid, text, text, text, jsonb, text[], uuid[], jsonb, uuid[], jsonb, uuid[], int, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ar_propose(uuid, uuid, uuid, text, text, text, jsonb, text[], uuid[], jsonb, uuid[], jsonb, uuid[], int, uuid, uuid) TO eye_commit;

/* ATTEST — copied whole from 0115 §AR.6; B107-G: the activation re-checks the expansion restriction. */
CREATE OR REPLACE FUNCTION governance.ar_attest(p_record uuid, p_version int, p_tenant uuid, p_domain uuid, p_obligation text, p_decision text, p_digest text, p_reason text,
                                                p_signature uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, observation, public, pg_catalog, pg_temp AS $$
DECLARE
  r governance.acceptance_records%ROWTYPE; v_now timestamptz := clock_timestamp(); v_role text; v_att uuid := gen_random_uuid(); v_missing text[]; x jsonb;
  v_state text := 'proposed'; v_lifted jsonb := '[]'::jsonb; v_closed jsonb; v_next timestamptz; v_timer uuid; v_held text; v_roles int; v_prior int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['governance.acceptance.attest']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM governance._ar_actor('acceptance attestation', p_actor);
  SELECT * INTO r FROM governance.acceptance_records x2 WHERE x2.record_id = p_record AND x2.version = p_version AND x2.tenant_id = p_tenant AND x2.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'acceptance attestation rejected (unknown_record): no acceptance record %/v% in this domain', p_record, p_version USING ERRCODE = '23503'; END IF;
  IF p_obligation IS NULL OR NOT (p_obligation = ANY (r.obligations)) THEN
    RAISE EXCEPTION 'acceptance attestation rejected (obligation): % is not an obligation of version % (%)', coalesce(p_obligation, '<none>'), p_version, array_to_string(r.obligations, ', ') USING ERRCODE = '22023';
  END IF;
  PERFORM governance.assert_approver('acceptance attestation', p_actor, p_tenant, p_domain, governance.ar_obligation_roles(p_obligation), r.proposed_by, r.builders,
                                     format('attesting the %s obligation', replace(p_obligation, '_', ' ')));
  IF p_obligation = 'customer' AND NOT EXISTS (SELECT 1 FROM identity.principals x2 WHERE x2.id = p_actor AND x2.tenant_id = p_tenant) THEN
    RAISE EXCEPTION 'acceptance attestation rejected (authority): the customer''s obligation is attested by a member of the customer''s own tenant' USING ERRCODE = '42501';
  END IF;
  IF r.state <> 'proposed' THEN RAISE EXCEPTION 'acceptance attestation rejected (state): version % is %', p_version, r.state USING ERRCODE = '23505'; END IF;
  IF p_digest IS DISTINCT FROM r.digest THEN RAISE EXCEPTION 'acceptance attestation rejected (stale): the attestation names a digest other than version %''s', p_version USING ERRCODE = '23505'; END IF;
  IF p_decision NOT IN ('attest', 'withhold') THEN RAISE EXCEPTION 'acceptance attestation rejected (decision): attest or withhold' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'acceptance attestation rejected (reason): an attestation states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM governance.acceptance_attestations a WHERE a.record_id = p_record AND a.version = p_version AND a.obligation = p_obligation) THEN
    RAISE EXCEPTION 'acceptance attestation rejected (duplicate): the % obligation of version % is already attested', p_obligation, p_version USING ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM governance.acceptance_attestations a WHERE a.record_id = p_record AND a.version = p_version AND a.attester = p_actor) THEN
    RAISE EXCEPTION 'acceptance attestation rejected (separation_of_duties): one named human attests ONE obligation — no single person accepts on behalf of the independent authorities (ES-71-002)' USING ERRCODE = '42501';
  END IF;
  SELECT b.role_code INTO v_role FROM identity.role_bindings b WHERE b.principal_id = p_actor AND b.revoked_at IS NULL AND b.role_code = ANY (governance.ar_obligation_roles(p_obligation))
     AND (b.scope = 'PLATFORM' OR (b.scope = 'TENANT' AND b.tenant_id = p_tenant) OR (b.scope = 'DOMAIN' AND b.domain_id = p_domain)) ORDER BY b.role_code LIMIT 1;

  IF p_decision = 'withhold' THEN
    INSERT INTO governance.acceptance_attestations (attestation_id, tenant_id, domain_id, record_id, version, obligation, decision, attester, attester_role, record_digest, reason, correlation_id)
    VALUES (v_att, p_tenant, p_domain, p_record, p_version, p_obligation, 'withhold', p_actor, v_role, r.digest, btrim(p_reason), p_correlation);
    UPDATE governance.acceptance_records SET state = 'withheld', ended_by = p_actor, ended_at = v_now, end_reason = format('the %s obligation was withheld: %s', p_obligation, btrim(p_reason))
     WHERE record_id = p_record AND version = p_version;
    PERFORM executive._resolve_human_tasks(p_tenant, p_domain, jsonb_build_object('kind', 'acceptance_record', 'id', p_record, 'version', p_version), ARRAY['governance.attest'], 'withheld', v_att, p_actor, p_correlation);
    PERFORM governance._ar_artifact(p_record, p_tenant, p_domain, 'acceptance_record', 'ACC-' || p_record::text, r.title || ' (claim: demonstration)', 'retired',
                                    jsonb_build_object('kind', r.kind, 'version', p_version, 'subject', r.subject_key, 'state', 'withheld', 'claim', 'demonstration'),
                                    governance.digest(jsonb_build_object('record', r.digest, 'state', 'withheld')), p_actor, p_correlation);
    PERFORM governance.ledger(p_tenant, p_domain, 'acceptance_record', p_record, p_version, 'acceptance.withheld', p_actor,
                              jsonb_build_object('obligation', p_obligation, 'reason', btrim(p_reason), 'attestation_id', v_att), p_correlation);
    RETURN jsonb_build_object('record_id', p_record, 'version', p_version, 'state', 'withheld', 'obligation', p_obligation, 'attestation_id', v_att,
                              'unmet', to_jsonb(r.obligations), 'claim', 'demonstration');
  END IF;

  -- ATTEST: the evidence current, the exceptions unexpired, the release candidate unheld, the customer's verification before the customer
  FOR x IN SELECT * FROM jsonb_array_elements(r.evidence) LOOP
    IF EXISTS (SELECT 1 FROM governance.acceptance_evidence e WHERE e.evidence_id = (x ->> 'evidence_id')::uuid AND (e.valid_until <= v_now OR e.outcome = 'failed'))
       OR EXISTS (SELECT 1 FROM governance.acceptance_evidence f WHERE f.renews = (x ->> 'evidence_id')::uuid AND f.outcome = 'failed') THEN
      RAISE EXCEPTION 'acceptance attestation rejected (stale): evidence % (%) is no longer current — renew it and propose a new version', x ->> 'evidence_id', x ->> 'kind' USING ERRCODE = '23505';
    END IF;
  END LOOP;
  FOR x IN SELECT * FROM jsonb_array_elements(r.exceptions) LOOP
    IF NOT EXISTS (SELECT 1 FROM governance.artifacts a WHERE a.artifact_id = (x ->> 'artifact_id')::uuid AND a.superseded_at IS NULL AND a.lifecycle = 'active'
                    AND coalesce((a.attributes ->> 'expires_at')::timestamptz, 'infinity'::timestamptz) > v_now)
       OR EXISTS (SELECT 1 FROM governance.holds h WHERE h.lifted_at IS NULL AND h.reason_kind = 'exception_expired' AND (h.source_artifact = (x ->> 'artifact_id')::uuid OR h.subject_artifact = (x ->> 'artifact_id')::uuid)) THEN
      RAISE EXCEPTION 'acceptance attestation rejected (expired): linked exception % expired — it is renewed with current evidence first', x ->> 'key' USING ERRCODE = '23505';
    END IF;
  END LOOP;
  IF r.kind = 'release' THEN
    SELECT string_agg(h.reason_kind || ': ' || h.reason, '; ') INTO v_held FROM governance.holds h WHERE h.subject_artifact = r.subject_artifact AND h.lifted_at IS NULL;
    IF v_held IS NOT NULL THEN RAISE EXCEPTION 'acceptance attestation rejected (held): release candidate % is held — %', r.subject_key, v_held USING ERRCODE = '23505'; END IF;
  END IF;
  IF p_obligation = 'customer' AND NOT EXISTS (SELECT 1 FROM governance.acceptance_verifications v WHERE v.record_id = p_record AND v.version = p_version AND v.outcome = 'verified') THEN
    RAISE EXCEPTION 'acceptance attestation rejected (state): the customer VERIFIES version % before attesting it (JRN-24: customer verify → attest)', p_version USING ERRCODE = '23505';
  END IF;
  IF p_signature IS NULL OR NOT EXISTS (SELECT 1 FROM executive.signatures s WHERE s.signature_id = p_signature AND s.subject_kind = 'acceptance_attestation' AND s.subject_id = p_record
                                                AND s.subject_version = p_version AND s.subject_digest = r.digest AND s.signer = p_actor AND s.bound_action = 'governance.acceptance.attest') THEN
    RAISE EXCEPTION 'acceptance attestation rejected (signature): an attestation carries the attester''s signature over the version''s digest' USING ERRCODE = '22023';
  END IF;
  INSERT INTO governance.acceptance_attestations (attestation_id, tenant_id, domain_id, record_id, version, obligation, decision, attester, attester_role, record_digest, signature_id, reason, correlation_id)
  VALUES (v_att, p_tenant, p_domain, p_record, p_version, p_obligation, 'attest', p_actor, v_role, r.digest, p_signature, btrim(p_reason), p_correlation);
  PERFORM executive._resolve_human_tasks(p_tenant, p_domain, jsonb_build_object('kind', 'acceptance_record', 'id', p_record, 'version', p_version, 'obligation', p_obligation),
                                         ARRAY['governance.attest'], 'attested', v_att, p_actor, p_correlation);
  PERFORM governance.ledger(p_tenant, p_domain, 'acceptance_record', p_record, p_version, 'acceptance.attested', p_actor,
                            jsonb_build_object('obligation', p_obligation, 'role', v_role, 'signature_id', p_signature, 'attestation_id', v_att), p_correlation);

  v_missing := ARRAY(SELECT o FROM unnest(r.obligations) o WHERE NOT EXISTS (SELECT 1 FROM governance.acceptance_attestations a WHERE a.record_id = p_record AND a.version = p_version AND a.obligation = o AND a.decision = 'attest'));
  IF cardinality(v_missing) = 0 THEN
    -- B107-G: the activation re-checks the expansion restriction as it stands NOW — a pending version never bypasses a restriction that applied before it
    PERFORM governance._ar_expansion_guard(p_tenant, p_record, r.subject_artifact, r.subject_key, r.scope_tuple, 'attestation', p_version);
    SELECT count(DISTINCT a.attester_role) INTO v_roles FROM governance.acceptance_attestations a WHERE a.record_id = p_record AND a.version = p_version AND a.decision = 'attest';
    IF v_roles < 2 THEN
      RAISE EXCEPTION 'acceptance attestation rejected (separation_of_duties): one role never accepts every obligation (ES-71-002)' USING ERRCODE = '42501';
    END IF;
    -- ACCEPTED: exactly this scope; the prior version superseded; the expansion hold lifted; the attention closed; the next expiry timer
    SELECT count(*) INTO v_prior FROM governance.acceptance_records p WHERE p.record_id = p_record AND p.version <> p_version AND p.state IN ('accepted', 'constrained', 'suspended', 'lapsed');
    UPDATE governance.acceptance_records SET state = 'superseded', ended_by = p_actor, ended_at = v_now, end_reason = format('re-accepted as version %s over renewed evidence', p_version)
     WHERE record_id = p_record AND version <> p_version AND state IN ('accepted', 'constrained', 'suspended', 'lapsed');
    v_state := 'accepted';
    SELECT min(t) INTO v_next FROM (
      SELECT (e ->> 'valid_until')::timestamptz AS t FROM jsonb_array_elements(r.evidence) e
      UNION ALL SELECT ((c ->> 'due')::date + 1)::timestamptz FROM jsonb_array_elements(r.conditions) c
      UNION ALL SELECT ((r.scope_tuple -> 'period' ->> 'to')::date + 1)::timestamptz
      UNION ALL SELECT ((r.operational ->> 'review_date')::date + 1)::timestamptz WHERE r.operational IS NOT NULL) s;
    v_timer := executive._schedule_timer(gen_random_uuid(), p_tenant, p_domain, 'acceptance_record', p_record, 'acceptance.evidence_expiry', greatest(v_next, v_now),
                                         jsonb_build_object('version', p_version, 'digest', r.digest), p_actor, p_correlation);
    UPDATE governance.acceptance_records SET state = 'accepted', accepted_at = v_now, effective_scope = r.scope_tuple, expiry_timer_id = v_timer WHERE record_id = p_record AND version = p_version;
    WITH l AS (UPDATE governance.holds h SET lifted_at = v_now, lifted_by = p_actor, lift_reason = format('re-accepted: version %s accepted over renewed evidence by every obligation', p_version)
                WHERE h.source_artifact = p_record AND h.lifted_at IS NULL AND h.reason_kind = 'acceptance_constrained' RETURNING h.hold_id)
    SELECT coalesce(jsonb_agg(l.hold_id), '[]'::jsonb) INTO v_lifted FROM l;
    v_closed := executive.b33_close_items(p_tenant, p_domain, 'governance.acceptance', 'acceptance_record', p_record, format('version %s accepted for its exact scope', p_version), p_actor, p_correlation);
    PERFORM governance._ar_artifact(p_record, p_tenant, p_domain, 'acceptance_record', 'ACC-' || p_record::text, r.title || ' (claim: demonstration)', 'active',
                                    jsonb_build_object('kind', r.kind, 'version', p_version, 'subject', r.subject_key, 'state', 'accepted', 'claim', 'demonstration'),
                                    governance.digest(jsonb_build_object('record', r.digest, 'state', 'accepted')), p_actor, p_correlation);
    PERFORM governance.ledger(p_tenant, p_domain, 'acceptance_record', p_record, p_version, CASE WHEN v_prior > 0 THEN 'acceptance.reaccepted' ELSE 'acceptance.accepted' END, p_actor,
                              jsonb_build_object('digest', r.digest, 'scope', r.scope_tuple, 'holds_lifted', v_lifted, 'items_closed', v_closed, 'timer_id', v_timer, 'next_check', v_next,
                                                 'claim', 'demonstration'), p_correlation);
  END IF;
  RETURN jsonb_build_object('record_id', p_record, 'version', p_version, 'state', v_state, 'obligation', p_obligation, 'attestation_id', v_att, 'signature_id', p_signature,
                            'unmet', to_jsonb(v_missing), 'holds_lifted', v_lifted, 'claim', 'demonstration',
                            'real_acceptance', 'R2: acceptance by named independent and customer authorities is external');
END $$;
REVOKE ALL ON FUNCTION governance.ar_attest(uuid, int, uuid, uuid, text, text, text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ar_attest(uuid, int, uuid, uuid, text, text, text, text, uuid, uuid, uuid) TO eye_commit;
