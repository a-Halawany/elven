-- 0106 — B30-F concurrency (2026-10-06): the estimate's approval and the constraint contract's mutations SERIALIZE on one lock.
--
-- 0104 made an approval re-check the constraint contract (every pinned set live at its pinned version and digest; no newly applicable
-- set declared or versioned after the proposal). Those re-checks read simulation.constraint_sets / constraint_set_versions WITHOUT any
-- lock shared with the mutations: version and retirement lock the SET ROW (constraint_set_for_change … FOR UPDATE) and a declaration
-- inserts a NEW row no read can lock. Under READ COMMITTED an approval running while a version, a retirement or a declaration was in
-- flight read the old contract and COMMITTED; the mutation then committed with an instant taken at its START (v_at := clock_timestamp()
-- in DECLARE) — before the approval — so the record showed a contract change preceding an approval that never saw it (phase6-estimation
-- -b30 ES9, the before-mode reproduction). Each of the three statements also read with its own snapshot, so a version committing between
-- them could give the approval a torn view.
--
-- THE DESIGN (the narrowest that covers declaration): ONE transaction-scoped advisory lock per (tenant, domain) contract,
-- simulation.constraint_contract_key — the retention.lock_key_domain idiom (0071) —
--   · the APPROVAL takes it SHARED before the first contract read (approvals never wait on each other);
--   · DECLARE, VERSION and RETIRE take it EXCLUSIVE before any read, and take their recorded instant AFTER it.
-- Under READ COMMITTED every statement after the lock sees what committed before it: an approval waiting on an in-flight mutation reads
-- the mutated contract and is REFUSED by 0104's checks (estimate rejected (contract), 409 — governed; the proposal and its history kept);
-- a mutation waiting on an in-flight approval records an instant after the approval. Lock order is one-way (advisory, then the set row),
-- so the mutations cannot deadlock with each other or with an approval (which takes no set-row lock).
--
-- 0104 and 0105 are applied and frozen and are not edited. Re-declared here, each copied whole from its live definition with the change
-- marked `-- 0106`: simulation.declare_constraint_set, simulation.version_constraint_set, simulation.retire_constraint_set (0092 §D.2),
-- twin.decide_estimate (0104). Grants are kept by CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION simulation.constraint_contract_key(p_tenant uuid, p_domain uuid) RETURNS bigint
IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT hashtextextended('simulation.constraint_contract:' || p_tenant::text || ':' || p_domain::text, 0);
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION simulation.constraint_contract_key(uuid, uuid) FROM PUBLIC;

/* The contract's lock, transaction-scoped: EXCLUSIVE for a mutation (declare, version, retire), SHARED for an approval's re-check. */
CREATE OR REPLACE FUNCTION simulation.lock_constraint_contract(p_tenant uuid, p_domain uuid, p_exclusive boolean) RETURNS void
SET search_path = simulation, pg_catalog, pg_temp AS $$
BEGIN
  IF p_tenant IS NULL OR p_domain IS NULL THEN
    RAISE EXCEPTION 'constraint contract lock: a tenant and a domain are required' USING ERRCODE = '22023';
  END IF;
  IF p_exclusive THEN PERFORM pg_advisory_xact_lock(simulation.constraint_contract_key(p_tenant, p_domain));
  ELSE PERFORM pg_advisory_xact_lock_shared(simulation.constraint_contract_key(p_tenant, p_domain)); END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.lock_constraint_contract(uuid, uuid, boolean) FROM PUBLIC;

CREATE OR REPLACE FUNCTION simulation.declare_constraint_set(
  p_set_id uuid, p_tenant uuid, p_domain uuid, p_set_key text, p_title text, p_steward uuid, p_constraints jsonb, p_note text,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_at timestamptz := clock_timestamp(); v_steward uuid := coalesce(p_steward, p_actor); v_digest text; v_existing uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.constraint.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM simulation.lock_constraint_contract(p_tenant, p_domain, true); v_at := clock_timestamp();   -- 0106: the contract, exclusively, BEFORE any read; the instant AFTER the lock
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'constraint set rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF v_steward <> p_actor AND NOT executive.holds_any_role(p_actor, p_tenant, p_domain, ARRAY['domain_admin']) THEN
    RAISE EXCEPTION 'constraint set rejected (steward): a constraint steward declares the sets they steward; naming another steward is the domain administrator''s act' USING ERRCODE = '42501';
  END IF;
  IF NOT executive.holds_any_role(v_steward, p_tenant, p_domain, ARRAY['constraint_steward', 'domain_admin']) THEN
    RAISE EXCEPTION 'constraint set rejected (steward_role): the steward % holds neither constraint_steward nor domain_admin in this domain', v_steward USING ERRCODE = '22023';
  END IF;
  IF p_set_key IS NULL OR p_set_key !~ '^[a-z][a-z0-9-]{2,60}$' THEN RAISE EXCEPTION 'constraint set rejected (key): a set key is 3–61 lower-case letters, digits and dashes' USING ERRCODE = '22023'; END IF;
  IF coalesce(length(btrim(p_title)), 0) NOT BETWEEN 3 AND 200 THEN RAISE EXCEPTION 'constraint set rejected (title): a set has a title (3–200 characters)' USING ERRCODE = '22023'; END IF;
  IF coalesce(length(btrim(p_note)), 0) < 3 THEN RAISE EXCEPTION 'constraint set rejected (note): a version says why it is declared (at least 3 characters)' USING ERRCODE = '22023'; END IF;
  IF NOT simulation.constraints_ok(p_constraints) THEN
    RAISE EXCEPTION 'constraint set rejected (constraints): 1–200 uniquely keyed constraints of kind topology, conservation or business_rule, each with its fields' USING ERRCODE = '22023';
  END IF;
  SELECT s.set_id INTO v_existing FROM simulation.constraint_sets s WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.set_key = p_set_key;
  IF v_existing IS NOT NULL THEN RAISE EXCEPTION 'constraint set rejected (duplicate): the key % names set % in this domain (a new version is declared on it)', p_set_key, v_existing USING ERRCODE = '23505'; END IF;
  v_digest := encode(sha256(convert_to(p_constraints::text, 'UTF8')), 'hex');
  INSERT INTO simulation.constraint_sets (set_id, scope, tenant_id, domain_id, set_key, title, steward_principal_id, state, current_version, declared_by, declared_at, correlation_id)
  VALUES (p_set_id, 'DOMAIN', p_tenant, p_domain, p_set_key, btrim(p_title), v_steward, 'live', 1, p_actor, v_at, p_correlation);
  INSERT INTO simulation.constraint_set_versions (set_id, version, scope, tenant_id, domain_id, constraints, digest, note, declared_by, declared_at, correlation_id)
  VALUES (p_set_id, 1, 'DOMAIN', p_tenant, p_domain, p_constraints, v_digest, btrim(p_note), p_actor, v_at, p_correlation);
  INSERT INTO simulation.constraint_set_events (event_id, scope, tenant_id, domain_id, set_id, event, version, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_set_id, 'set.declared', 1, p_actor,
          jsonb_build_object('set_key', p_set_key, 'steward', v_steward, 'digest', v_digest, 'constraints', jsonb_array_length(p_constraints)), p_correlation);
  RETURN jsonb_build_object('set_id', p_set_id, 'set_key', p_set_key, 'title', btrim(p_title), 'steward_principal_id', v_steward, 'state', 'live', 'version', 1,
                            'digest', v_digest, 'constraints', p_constraints, 'declared_by', p_actor, 'declared_at', v_at);
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION simulation.version_constraint_set(
  p_set_id uuid, p_tenant uuid, p_domain uuid, p_expected_version int, p_constraints jsonb, p_note text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, observation, public, pg_catalog, pg_temp AS $$
DECLARE s simulation.constraint_sets%ROWTYPE; v_at timestamptz := clock_timestamp(); v_digest text; v_prior text; v_version int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.constraint.version']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM simulation.lock_constraint_contract(p_tenant, p_domain, true); v_at := clock_timestamp();   -- 0106: the contract, exclusively, BEFORE any read; the instant AFTER the lock
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'constraint set rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  s := simulation.constraint_set_for_change(p_set_id, p_tenant, p_domain, p_actor, 'version');
  IF p_expected_version IS DISTINCT FROM s.current_version THEN
    RAISE EXCEPTION 'constraint set rejected (stale_version): set % is at version %, not % — read it and version on the current one', s.set_key, s.current_version, p_expected_version USING ERRCODE = '22023';
  END IF;
  IF coalesce(length(btrim(p_note)), 0) < 3 THEN RAISE EXCEPTION 'constraint set rejected (note): a version says why it is declared (at least 3 characters)' USING ERRCODE = '22023'; END IF;
  IF NOT simulation.constraints_ok(p_constraints) THEN
    RAISE EXCEPTION 'constraint set rejected (constraints): 1–200 uniquely keyed constraints of kind topology, conservation or business_rule, each with its fields' USING ERRCODE = '22023';
  END IF;
  v_digest := encode(sha256(convert_to(p_constraints::text, 'UTF8')), 'hex');
  SELECT v.digest INTO v_prior FROM simulation.constraint_set_versions v WHERE v.set_id = p_set_id AND v.version = s.current_version;
  IF v_prior = v_digest THEN RAISE EXCEPTION 'constraint set rejected (unchanged): version % of set % already holds these constraints (digest %)', s.current_version, s.set_key, v_digest USING ERRCODE = '22023'; END IF;
  v_version := s.current_version + 1;
  INSERT INTO simulation.constraint_set_versions (set_id, version, scope, tenant_id, domain_id, constraints, digest, note, declared_by, declared_at, correlation_id)
  VALUES (p_set_id, v_version, 'DOMAIN', p_tenant, p_domain, p_constraints, v_digest, btrim(p_note), p_actor, v_at, p_correlation);
  UPDATE simulation.constraint_sets SET current_version = v_version WHERE set_id = p_set_id;
  INSERT INTO simulation.constraint_set_events (event_id, scope, tenant_id, domain_id, set_id, event, version, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_set_id, 'set.versioned', v_version, p_actor,
          jsonb_build_object('set_key', s.set_key, 'prior_version', s.current_version, 'prior_digest', v_prior, 'digest', v_digest, 'note', btrim(p_note),
                             'by_steward', p_actor = s.steward_principal_id), p_correlation);
  RETURN jsonb_build_object('set_id', p_set_id, 'set_key', s.set_key, 'title', s.title, 'steward_principal_id', s.steward_principal_id, 'state', 'live', 'version', v_version,
                            'prior_version', s.current_version, 'digest', v_digest, 'constraints', p_constraints, 'declared_by', p_actor, 'declared_at', v_at);
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION simulation.retire_constraint_set(p_set_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, observation, public, pg_catalog, pg_temp AS $$
DECLARE s simulation.constraint_sets%ROWTYPE; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.constraint.retire']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM simulation.lock_constraint_contract(p_tenant, p_domain, true); v_at := clock_timestamp();   -- 0106: the contract, exclusively, BEFORE any read; the instant AFTER the lock
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'constraint set rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  s := simulation.constraint_set_for_change(p_set_id, p_tenant, p_domain, p_actor, 'retire');
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'constraint set rejected (reason): a retirement states its reason (at least 8 characters)' USING ERRCODE = '22023'; END IF;
  UPDATE simulation.constraint_sets SET state = 'retired', retired_by = p_actor, retired_at = v_at, retire_reason = btrim(p_reason) WHERE set_id = p_set_id;
  INSERT INTO simulation.constraint_set_events (event_id, scope, tenant_id, domain_id, set_id, event, version, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_set_id, 'set.retired', s.current_version, p_actor, jsonb_build_object('set_key', s.set_key, 'reason', btrim(p_reason)), p_correlation);
  RETURN jsonb_build_object('set_id', p_set_id, 'set_key', s.set_key, 'state', 'retired', 'version', s.current_version, 'retired_by', p_actor, 'retired_at', v_at, 'retire_reason', btrim(p_reason));
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION twin.decide_estimate(p_estimate_id uuid, p_tenant uuid, p_domain uuid, p_decision text, p_note text, p_new_version integer, p_actor uuid, p_correlation uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'twin', 'observation', 'simulation', 'ctx', 'public', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE x twin.estimates%ROWTYPE; v_owner uuid; nv twin.twin_versions%ROWTYPE; el twin.state_elements%ROWTYPE; v_note text := nullif(btrim(coalesce(p_note, '')), '');
        v_pin jsonb; v_set simulation.constraint_sets%ROWTYPE; v_cur_digest text; v_pinned text[]; v_selected text[]; v_late record;   -- 0104
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.estimate.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM twin.tes_assert_actor('estimate', p_actor);
  SELECT * INTO x FROM twin.estimates e WHERE e.estimate_id = p_estimate_id AND e.tenant_id = p_tenant AND e.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'estimate rejected (unknown_estimate): % is not an estimate of this domain', p_estimate_id USING ERRCODE = '23503'; END IF;
  SELECT owner_principal_id INTO v_owner FROM twin.twins_current WHERE twin_id = x.twin_id;
  IF v_owner IS DISTINCT FROM p_actor THEN
    RAISE EXCEPTION 'estimate rejected (ownership): an estimate of twin % is decided by the twin''s owner', x.twin_id USING ERRCODE = '42501';
  END IF;
  IF x.proposed_by = p_actor THEN
    RAISE EXCEPTION 'estimate rejected (separation_of_duties): the proposer of estimate % does not decide it', p_estimate_id USING ERRCODE = '42501';
  END IF;
  IF x.state <> 'proposed' THEN RAISE EXCEPTION 'estimate rejected (state): estimate % is %, not proposed', p_estimate_id, x.state USING ERRCODE = '22023'; END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('approved', 'declined') THEN RAISE EXCEPTION 'estimate rejected (decision): a decision is approved or declined' USING ERRCODE = '22023'; END IF;
  IF p_decision = 'declined' THEN
    IF coalesce(length(v_note), 0) < 8 THEN RAISE EXCEPTION 'estimate rejected (note): a declined estimate states its reason (at least 8 characters)' USING ERRCODE = '22023'; END IF;
    IF p_new_version IS NOT NULL THEN RAISE EXCEPTION 'estimate rejected (decision): a declined estimate opens no snapshot' USING ERRCODE = '22023'; END IF;
    UPDATE twin.estimates SET state = 'declined', decided_by = p_actor, decided_at = clock_timestamp(), decision_note = v_note WHERE estimate_id = p_estimate_id;
    PERFORM twin.tes_event(p_tenant, p_domain, x.twin_id, x.key, NULL, p_estimate_id, NULL, 'estimate.declined', p_actor, jsonb_build_object('note', v_note), p_correlation);
    RETURN jsonb_build_object('estimate_id', p_estimate_id, 'state', 'declined', 'twin_id', x.twin_id, 'key', x.key, 'note', v_note);
  END IF;
  -- APPROVAL: the validation before publish
  IF x.constraint_outcome <> 'satisfied' THEN
    RAISE EXCEPTION 'estimate rejected (constraint): the constraint check before publish is % (%); an estimate is published only on a satisfied check — propose again once it is',
      x.constraint_outcome, coalesce((SELECT string_agg(v ->> 'message', '; ') FROM jsonb_array_elements(x.constraint_check -> 'violations') v), x.constraint_check ->> 'reason', 'no applicable constraint') USING ERRCODE = '22023';
  END IF;
  -- 0104 (B30 publication concern, 2026-10-04): THE CONSTRAINT CONTRACT AT PUBLICATION. The stored check above is the proposal's HISTORY (kept
  -- as it was); the approval publishes only under the SAME live contract: every set version the proposal was checked against is still the live,
  -- current version of a live set (the digest compared), and no set the primary estimator selects came to apply after the proposal unpinned.
  -- A changed contract refuses the approval — and with it the whole transaction (the draft, the grounding and the admission roll back).
  IF p_decision = 'approved' THEN
    PERFORM simulation.lock_constraint_contract(x.tenant_id, x.domain_id, false);   -- 0106: the contract, SHARED, before any of the reads below
    FOR v_pin IN SELECT * FROM jsonb_array_elements(coalesce(x.constraint_check -> 'pins', '[]'::jsonb)) LOOP
      SELECT * INTO v_set FROM simulation.constraint_sets s WHERE s.set_id = (v_pin ->> 'set_id')::uuid AND s.tenant_id = x.tenant_id AND s.domain_id = x.domain_id;
      IF NOT FOUND OR v_set.state <> 'live' THEN
        RAISE EXCEPTION 'estimate rejected (contract): constraint set % (v%) that estimate % was checked against is %; propose again under the live contract',
          v_pin ->> 'set_key', v_pin ->> 'version', p_estimate_id, coalesce(v_set.state, 'not found') USING ERRCODE = '22023';
      END IF;
      SELECT v.digest INTO v_cur_digest FROM simulation.constraint_set_versions v WHERE v.set_id = v_set.set_id AND v.version = v_set.current_version;
      IF v_set.current_version IS DISTINCT FROM (v_pin ->> 'version')::int OR v_cur_digest IS DISTINCT FROM v_pin ->> 'digest' THEN
        RAISE EXCEPTION 'estimate rejected (contract): constraint set % was v% when estimate % was checked and is v% now; propose again under the live contract',
          v_pin ->> 'set_key', v_pin ->> 'version', p_estimate_id, v_set.current_version USING ERRCODE = '22023';
      END IF;
    END LOOP;
    v_pinned := ARRAY(SELECT p ->> 'set_key' FROM jsonb_array_elements(coalesce(x.constraint_check -> 'pins', '[]'::jsonb)) p);
    SELECT e.constraint_sets INTO v_selected FROM twin.estimators e
     WHERE e.estimator_id = (x.primary_estimator ->> 'estimator_id')::uuid AND e.version = (x.primary_estimator ->> 'version')::int;
    SELECT s.set_key, s.current_version INTO v_late FROM simulation.constraint_sets s JOIN simulation.constraint_set_versions v ON v.set_id = s.set_id AND v.version = s.current_version
     WHERE s.tenant_id = x.tenant_id AND s.domain_id = x.domain_id AND s.state = 'live' AND NOT (s.set_key = ANY (v_pinned))
       AND (coalesce(cardinality(v_selected), 0) = 0 OR s.set_key = ANY (v_selected))
       AND v.declared_at > x.proposed_at
       AND EXISTS (SELECT 1 FROM jsonb_array_elements(v.constraints) c WHERE NOT (c ? 'applies_to') OR c -> 'applies_to' ? 'run_input')
     ORDER BY s.set_key LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'estimate rejected (contract): constraint set % (v%) came to apply after estimate % was checked; propose again under the live contract',
        v_late.set_key, v_late.current_version, p_estimate_id USING ERRCODE = '22023';
    END IF;
  END IF;
  IF x.range_check ->> 'verdict' = 'outside' THEN
    RAISE EXCEPTION 'estimate rejected (range): % % is outside the declared bounds [%, %]', x.proposed_value, x.unit, coalesce(x.range_check ->> 'min', '−∞'), coalesce(x.range_check ->> 'max', '∞') USING ERRCODE = '22023';
  END IF;
  IF x.ambiguous AND coalesce(length(v_note), 0) < 8 THEN
    RAISE EXCEPTION 'estimate rejected (note): an ambiguous estimate (%) is approved with the owner''s note (at least 8 characters)',
      (SELECT string_agg(r, '; ') FROM jsonb_array_elements_text(x.ambiguity_reasons) r) USING ERRCODE = '22023';
  END IF;
  IF p_new_version IS NULL THEN RAISE EXCEPTION 'estimate rejected (decision): an approval names the snapshot it opened' USING ERRCODE = '22023'; END IF;
  SELECT * INTO nv FROM twin.twin_versions v WHERE v.twin_id = x.twin_id AND v.version = p_new_version;
  IF NOT FOUND OR nv.state <> 'admitted' OR nv.branch_id <> 'actual' THEN
    RAISE EXCEPTION 'estimate rejected (snapshot): version % of twin % is not an admitted version on actual', p_new_version, x.twin_id USING ERRCODE = '22023';
  END IF;
  IF nv.opened_by IS DISTINCT FROM p_actor OR NOT EXISTS (SELECT 1 FROM twin.twin_events te WHERE te.twin_id = x.twin_id AND te.event = 'version.admitted'
                                                           AND (te.details ->> 'version')::int = p_new_version AND te.correlation_id = p_correlation AND te.actor_principal_id = p_actor) THEN
    RAISE EXCEPTION 'estimate rejected (snapshot): version % was not opened and admitted by the approver in this approval', p_new_version USING ERRCODE = '22023';
  END IF;
  IF nv.supersedes IS DISTINCT FROM x.head_version THEN
    RAISE EXCEPTION 'estimate rejected (stale): estimate % was computed against v% of the twin; the head moved to v% — propose again on the current head', p_estimate_id,
      coalesce(x.head_version::text, 'none'), coalesce(nv.supersedes::text, 'none') USING ERRCODE = '22023';
  END IF;
  SELECT * INTO el FROM twin.state_elements s WHERE s.twin_id = x.twin_id AND s.version = p_new_version AND s.key = x.key;
  IF NOT FOUND OR el.kind <> 'estimated' OR jsonb_typeof(el.value) <> 'number' OR (el.value #>> '{}')::numeric <> x.proposed_value OR el.unit IS DISTINCT FROM x.unit THEN
    RAISE EXCEPTION 'estimate rejected (snapshot): version % does not carry % as the estimated value % %', p_new_version, x.key, x.proposed_value, x.unit USING ERRCODE = '22023';
  END IF;
  UPDATE twin.estimates SET state = 'approved', decided_by = p_actor, decided_at = clock_timestamp(), decision_note = v_note, applied_version = p_new_version WHERE estimate_id = p_estimate_id;
  PERFORM twin.tes_event(p_tenant, p_domain, x.twin_id, x.key, NULL, p_estimate_id, NULL, 'estimate.approved', p_actor,
    jsonb_build_object('applied_version', p_new_version, 'supersedes', nv.supersedes, 'element_id', el.element_id, 'value', x.proposed_value, 'unit', x.unit, 'note', v_note,
                       'state_set_digest', nv.state_set_digest, 'material', x.material, 'ambiguous', x.ambiguous), p_correlation);
  RETURN jsonb_build_object('estimate_id', p_estimate_id, 'state', 'approved', 'twin_id', x.twin_id, 'key', x.key, 'value', x.proposed_value, 'unit', x.unit,
                            'applied_version', p_new_version, 'supersedes', nv.supersedes, 'element_id', el.element_id, 'note', v_note);
END $function$;
