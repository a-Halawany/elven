-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0116 — B107-F: ACCEPTANCE DECIDED AT THE REQUEST (the bounded review of 8396481). 0001–0115 are applied and frozen and untouched.
--
-- THE DEFECT (reproduced through governed paths, phase6-acceptance-b107 "B107-F" with B107F_REPRO=1 on 8396481 — evidence/cp6/
-- b107f-acceptance-repro.txt): governance.ar_gate and governance.ar_scope answered from the STORED state and effective scope of the record
-- in force. Between a relevant evidence item's expiry (or the end of the acceptance period) and the next reconciliation by the tick's timer
-- or sweep, an enforced capability stayed available to the affected role — a gated request reached its handler — and the accepted-scope
-- read said `accepted`. AR5's proof ran the tick before asking, so it never saw the window.
--
-- THE CORRECTION: one read-only function, governance.ar_current, derives what is in force NOW from the record and its CURRENT findings
-- (governance.ar_findings, unchanged, on the database clock): a period ended → lapsed (nothing in force); suspended or lapsed as stored; any
-- finding — stored or current — → constrained, the effective scope = the accepted scope minus what the affected evidence items cover (FEX-31,
-- the same rule _ar_constrain applies); otherwise accepted. The gate and the accepted-scope read are re-declared (copied whole from 0115 §AR.9
-- and §AR.10, the changes marked B107-F) to answer from it. Neither writes: the reconciliation that records the state, opens the expansion
-- hold and raises attention stays the timer's and the sweep's (0115, unchanged). A request refused here never reaches its handler.
-- Unchanged: ar_findings, _ar_constrain, ar_sweep, ar_timer (with the act-found old-timer correction), the ports, the expansion check of
-- ar_propose (it reads the holds the reconciliation opens), the claim CHECK (`demonstration` only).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

/* WHAT IS IN FORCE NOW for one version (read-only; under the caller's read scope — ar_findings asserts it): {state, effective_scope,
   current_findings, reconciled}. `reconciled` = the stored state already says so (nothing new for the timer or the sweep to record). */
CREATE OR REPLACE FUNCTION governance.ar_current(p_record uuid, p_version int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE r governance.acceptance_records%ROWTYPE; v_f jsonb; v_new jsonb := '[]'::jsonb; x jsonb; v_state text; v_eff jsonb;
BEGIN
  SELECT * INTO r FROM governance.acceptance_records a WHERE a.record_id = p_record AND a.version = p_version;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_f := governance.ar_findings(p_record, p_version);
  FOR x IN SELECT * FROM jsonb_array_elements(v_f) LOOP
    IF NOT (r.constrained_reasons @> jsonb_build_array(jsonb_build_object('kind', x ->> 'kind', 'ref', x ->> 'ref'))) THEN v_new := v_new || jsonb_build_array(x); END IF;
  END LOOP;
  IF r.state IN ('suspended', 'lapsed') THEN
    v_state := r.state; v_eff := NULL;
  ELSIF EXISTS (SELECT 1 FROM jsonb_array_elements(v_f) f WHERE f ->> 'kind' = 'period_ended') THEN
    v_state := 'lapsed'; v_eff := NULL;
  ELSIF r.state = 'constrained' OR jsonb_array_length(v_f) > 0 THEN
    v_state := 'constrained';
    v_eff := governance.ar_effective_scope(r.scope_tuple, (SELECT coalesce(jsonb_agg(f), '[]'::jsonb) FROM jsonb_array_elements(r.constrained_reasons || v_new) f
                                                            WHERE f ->> 'kind' IN ('evidence_expired', 'evidence_failed')));
  ELSE
    v_state := r.state; v_eff := coalesce(r.effective_scope, r.scope_tuple);
  END IF;
  RETURN jsonb_build_object('state', v_state, 'effective_scope', v_eff, 'current_findings', v_f, 'new_findings', v_new,
                            'reconciled', v_state = r.state AND jsonb_array_length(v_new) = 0);
END $$;
REVOKE ALL ON FUNCTION governance.ar_current(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ar_current(uuid, int) TO eye_app, eye_commit;

/* THE GATE's answer for one request (read under the request's own evidence context): the enforced capability its action falls under, and
   whether that capability is accepted HERE for the caller's roles and the request's consequence class — accepted or constrained within the
   effective scope; suspended, lapsed, withdrawn or never accepted refuses. B107-F: the state and the effective scope are what is in force NOW
   (governance.ar_current — an item expired or the period ended since the last reconciliation counts at once), never the stored state alone. */
CREATE OR REPLACE FUNCTION governance.ar_gate(p_tenant uuid, p_domain uuid, p_action text, p_roles text[], p_class text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = governance, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_cap text; r governance.acceptance_records%ROWTYPE; v_eff jsonb; c jsonb; v_state text;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the acceptance gate');
  SELECT e.capability_key INTO v_cap FROM governance.acceptance_enforcement e, unnest(e.action_prefixes) px
   WHERE e.enforced AND e.version = (SELECT max(x.version) FROM governance.acceptance_enforcement x WHERE x.capability_key = e.capability_key)
     AND (p_action = px OR (right(px, 1) = '.' AND starts_with(p_action, px)))
   ORDER BY length(px) DESC LIMIT 1;
  IF v_cap IS NULL THEN RETURN jsonb_build_object('gated', false, 'available', true); END IF;
  SELECT * INTO r FROM governance.acceptance_records a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.subject_key = v_cap AND a.kind IN ('capability', 'operational')
     AND a.state IN ('accepted', 'constrained', 'suspended', 'lapsed') ORDER BY (a.kind = 'capability') DESC, a.accepted_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('gated', true, 'available', false, 'capability', v_cap, 'state', 'not_accepted',
                              'reason', format('%s is not accepted for this domain — an acceptance names its exact scope (the capability is marked enforce_acceptance)', v_cap));
  END IF;
  -- B107-F: what is in force NOW, not the stored state
  c := governance.ar_current(r.record_id, r.version);
  v_state := c ->> 'state';
  IF v_state IN ('suspended', 'lapsed') THEN
    RETURN jsonb_build_object('gated', true, 'available', false, 'capability', v_cap, 'state', v_state, 'record_id', r.record_id, 'version', r.version, 'reconciled', c -> 'reconciled',
                              'reason', format('%s is %s in this domain (record %s v%s) — nothing of it is in force until it is re-accepted', v_cap, v_state, r.record_id, r.version));
  END IF;
  v_eff := c -> 'effective_scope';
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_eff -> 'roles') x WHERE x = ANY (coalesce(p_roles, '{}'::text[]))) THEN
    RETURN jsonb_build_object('gated', true, 'available', false, 'capability', v_cap, 'state', v_state, 'record_id', r.record_id, 'version', r.version, 'reconciled', c -> 'reconciled',
                              'reason', format('%s is %s here for the roles %s only — the caller''s roles are outside the %s scope', v_cap, v_state,
                                               coalesce((SELECT string_agg(x, ', ') FROM jsonb_array_elements_text(v_eff -> 'roles') x), 'none'), CASE WHEN v_state = 'constrained' THEN 'constrained' ELSE 'accepted' END));
  END IF;
  IF governance.ar_class_rank(coalesce(p_class, 'C0')) > governance.ar_class_rank(v_eff ->> 'consequence_class') THEN
    RETURN jsonb_build_object('gated', true, 'available', false, 'capability', v_cap, 'state', v_state, 'record_id', r.record_id, 'version', r.version, 'reconciled', c -> 'reconciled',
                              'reason', format('%s is accepted here up to consequence class %s — this request is %s', v_cap, v_eff ->> 'consequence_class', p_class));
  END IF;
  RETURN jsonb_build_object('gated', true, 'available', true, 'capability', v_cap, 'state', v_state, 'record_id', r.record_id, 'version', r.version, 'reconciled', c -> 'reconciled',
                            'reason', format('%s is %s here (record %s v%s)', v_cap, v_state, r.record_id, r.version));
END $$;
REVOKE ALL ON FUNCTION governance.ar_gate(uuid, uuid, text, text[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ar_gate(uuid, uuid, text, text[], text) TO eye_app, eye_commit;

/* THE ACCEPTED-SCOPE READ (FEX-31, CAP-AU-11 "resolve acceptance evidence to exact scope and versions"): the subject's state HERE — accepted,
   constrained (with the effective scope and what was removed), suspended, lapsed, proposed only, or NOT ACCEPTED — the unmet obligations of a
   proposal, the evidence with its age and validity, the open holds, whether expansion is held in this tenant, the gate's marking. Nothing is
   shown accepted by inference: no record in force reads not_accepted. B107-F: the state, the effective scope and what was removed are what is
   in force NOW (governance.ar_current); `current_findings` and `reconciled` say whether the timer or the sweep has yet recorded it — the
   stored reasons stay under `record.reasons`, and `expansion_held` is the hold the reconciliation opens (what ar_propose reads). */
CREATE OR REPLACE FUNCTION governance.ar_scope(p_tenant uuid, p_domain uuid, p_subject_key text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = governance, observation, public, pg_catalog, pg_temp AS $$
DECLARE r governance.acceptance_records%ROWTYPE; p governance.acceptance_records%ROWTYPE; v_now timestamptz := clock_timestamp(); v_held boolean; v_enf jsonb; v_ev jsonb; c jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the accepted scope');
  SELECT * INTO r FROM governance.acceptance_records a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.subject_key = p_subject_key
     AND a.state IN ('accepted', 'constrained', 'suspended', 'lapsed') ORDER BY (a.kind = 'capability') DESC, a.accepted_at DESC LIMIT 1;
  SELECT * INTO p FROM governance.acceptance_records a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.subject_key = p_subject_key AND a.state = 'proposed'
   ORDER BY a.proposed_at DESC LIMIT 1;
  v_held := EXISTS (SELECT 1 FROM governance.holds h JOIN governance.acceptance_records x ON x.record_id = h.source_artifact
                     WHERE h.lifted_at IS NULL AND h.reason_kind = 'acceptance_constrained' AND x.tenant_id = p_tenant AND x.subject_key = p_subject_key);
  SELECT jsonb_build_object('enforced', e.enforced, 'prefixes', to_jsonb(e.action_prefixes), 'version', e.version) INTO v_enf FROM governance.acceptance_enforcement e
   WHERE e.capability_key = p_subject_key ORDER BY e.version DESC LIMIT 1;
  IF r.record_id IS NOT NULL THEN
    SELECT jsonb_agg(jsonb_build_object('evidence_id', e.evidence_id, 'kind', e.kind, 'title', e.title, 'captured_at', e.captured_at, 'valid_until', e.valid_until,
                                        'age_days', round(extract(epoch FROM v_now - e.captured_at) / 86400.0, 2), 'current', e.valid_until > v_now AND e.outcome <> 'failed', 'covers', e.covers) ORDER BY e.valid_until)
      INTO v_ev FROM governance.acceptance_evidence e WHERE e.evidence_id IN (SELECT (x ->> 'evidence_id')::uuid FROM jsonb_array_elements(r.evidence) x);
    c := governance.ar_current(r.record_id, r.version);   -- B107-F
  END IF;
  RETURN jsonb_build_object(
    'subject', p_subject_key, 'tenant', p_tenant, 'domain', p_domain, 'read_at', v_now,
    'state', CASE WHEN r.record_id IS NOT NULL THEN c ->> 'state' WHEN p.record_id IS NOT NULL THEN 'proposed_only' ELSE 'not_accepted' END,
    'record', CASE WHEN r.record_id IS NULL THEN NULL ELSE jsonb_build_object('record_id', r.record_id, 'version', r.version, 'kind', r.kind, 'digest', r.digest, 'accepted_at', r.accepted_at,
                                                                              'constrained_at', r.constrained_at, 'reasons', r.constrained_reasons, 'stored_state', r.state, 'claim', r.claim) END,
    'accepted_scope', r.scope_tuple, 'effective_scope', c -> 'effective_scope',
    'removed', c -> 'effective_scope' -> 'removed', 'evidence', v_ev,
    'current_findings', c -> 'current_findings', 'reconciled', c -> 'reconciled',
    'proposal', CASE WHEN p.record_id IS NULL THEN NULL ELSE jsonb_build_object('record_id', p.record_id, 'version', p.version, 'digest', p.digest,
                  'unmet', (SELECT coalesce(jsonb_agg(o), '[]'::jsonb) FROM unnest(p.obligations) o WHERE NOT EXISTS (SELECT 1 FROM governance.acceptance_attestations a WHERE a.record_id = p.record_id AND a.version = p.version AND a.obligation = o AND a.decision = 'attest'))) END,
    'expansion_held', v_held, 'enforcement', v_enf,
    'boundary', 'scope-specific: this answer is for this tenant and domain only; claim = demonstration — real acceptance is R2');
END $$;
REVOKE ALL ON FUNCTION governance.ar_scope(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ar_scope(uuid, uuid, text) TO eye_app, eye_commit;
