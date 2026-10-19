-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0121 §PX — CP-6 B82, part `px` (folded into 0121 after §0, §TS, §EV, §GM): THE PROVENANCE TRAIL'S STRENGTH, THE TRUST ENVELOPE, THE
-- RECORDED VERIFICATIONS, THE ATTESTATIONS AND THE TRUST INVESTIGATION (F-P7-E-07: ch27 + ch57 — UX-57-001…005, CMP-022, CMP-029, WS-18,
-- UX-27-004/005; F-P7-E-01: C-047).
--
--   graph.provenance_strength   §0's stub RE-DECLARED WHOLE (same signature, volatility, security, search path, return type and grants):
--                               strong | partial | weak | broken WITH ITS REASONS, from graph.explain (B50, method b50-pv-explain-1): the
--                               gaps (an integrity gap — broken custody, an unverifiable artifact — is BROKEN; an unresolved reference
--                               WEAK), truncation, unresolved citations, unsigned human steps (an approval no signature binds), undigested
--                               model calls (a gateway call without its weights digest), withdrawn and corrected inputs, an UNFIT mark.
--                               A malformed subject stays `provenance rejected (subject)` (22023 → 422); an object not recorded in the
--                               caller's domain is now `provenance rejected (unknown_object)` (23503 → 404). Rule b82-px-strength-1.
--   graph.trust_envelope        the READ of a product version's trust as FACETS, NEVER A SCORE (signature, lineage, custody, policy,
--                               evaluation, correction, rights, freshness — each verified | failed | unavailable | not_checked with its
--                               words), the provenance strength, the attestations, the recorded verifications, the open investigations,
--                               TRUST INDETERMINATE when a facet failed or could not be verified (with the constrained use), and the
--                               DIGEST that binds what was shown (an attestation names it). Rule b82-px-envelope-1.
--   graph.trust_verifications   APPEND-ONLY: one recorded "verify again" — the subject version, the facet, the outcome verified | failed |
--                               unavailable (a verification that cannot be made is UNAVAILABLE, never FAILED), what was examined, the
--                               verifier, the subject's digest. Port graph.verify_trust (graph.trust.verify; a named person).
--   graph.trust_attestations    APPEND-ONLY (+ graph.trust_attestation_events): a PERSON's recorded, withdrawable statement "I inspected
--                               these facets of this version" (DESIGN D11) — NEVER an approval, never a release, it enables NO command;
--                               never an agent's, never the producer's or the owner's (the 0042 separation copied); it binds the envelope
--                               digest the attester read (a changed envelope refuses it: stale). Ports graph.attest_trust /
--                               graph.withdraw_trust_attestation (graph.trust.attest / graph.trust.withdraw).
--   graph.open_trust_investigation   an INVESTIGATION raises ONE attention item of the new class `trust_investigation` (the class list and
--                               the CHECK widened BY UNION — 0120 §TL's idiom), routed to the product's accountable owner under the domain's
--                               attention policy; nothing in the product changes (graph.trust.investigate; a named person).
--   graph.trust_overview        the READ the Trust and Governance workspace (/graph/trust, WS-18) draws: provenance strength by product,
--                               models (gateway calls), agents (agent runs), data rights, policy denials, exceptions (gate overrides),
--                               open challenges and appeals, investigations, attestations, verifications.
--   graph.px_signatures         the subject's recorded signatures (the verifier's input; eye_commit only).
--
-- THE HUMAN-AUTHORITY BOUNDARY (UX-27-004, UX-57-004): an indicator informs, an accountable person decides. No command anywhere reads a
-- facet, a strength or an attestation to become eligible; display truth never derives DECIDED from confidence. Every act here is a named
-- human's (the PDP's human gate and the port's own re-check); an agent is refused.
--
-- Refusal nouns (CLASS form; mapped centrally, observation-errors.ts B82 block): `trust verification`, `trust attestation`,
-- `trust investigation` — 403 actor|authority|separation_of_duties · 404 unknown_* · 409 state|stale|duplicate · 422 the rest. The reads keep
-- B50's `provenance` noun (subject → 422, unknown_object → 404).
--
-- Applies ALONE on 0001–0120 + 0121 §0 (+ §TS, §EV, §GM — §EV's graph.ev_evidence_state is read for custody and rights). No role gains a
-- permission it held not before (D9): the PDP rows graph.trust.* are this part's own actions (`/* B82 px */` in pdp.service.ts).
--
-- THREE CLAIMS, never mixed: CONSTRUCTION (this file and phase6-trust-b82 — every row there SYNTHETIC); DEMONSTRATED OPERATION (the act —
-- E. Lindqvist verifies, attests and investigates; SYNTHETIC personas); REAL ACCEPTANCE (UX-27-006 / UX-57-006: B111's shared recording
-- path, then H3) — never claimed.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §PX.1 THE CONSTANTS ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION graph.px_strength_rule() RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'b82-px-strength-1' $$;
CREATE OR REPLACE FUNCTION graph.px_envelope_rule() RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'b82-px-envelope-1' $$;
CREATE OR REPLACE FUNCTION graph.px_facets() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['signature', 'lineage', 'custody', 'policy', 'evaluation', 'correction', 'rights', 'freshness'] $$;
CREATE OR REPLACE FUNCTION graph.px_attention_class() RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'trust_investigation' $$;
/* Who may verify, attest and investigate (re-checked in the ports; the PDP rows name the same roles). An AUDITOR holds at TENANT. */
CREATE OR REPLACE FUNCTION graph.px_verifiers() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['auditor', 'record_authority', 'data_steward', 'knowledge_owner', 'method_steward', 'domain_analyst', 'domain_admin', 'decision_approver', 'privacy_officer'] $$;
CREATE OR REPLACE FUNCTION graph.px_attesters() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['auditor', 'record_authority', 'data_steward', 'knowledge_owner', 'method_steward', 'domain_analyst', 'decision_approver', 'risk_owner'] $$;
CREATE OR REPLACE FUNCTION graph.px_investigators() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['auditor', 'record_authority', 'data_steward', 'knowledge_owner', 'method_steward', 'domain_analyst', 'decision_approver', 'risk_owner',
               'decision_owner', 'decision_authority', 'executive', 'domain_admin', 'forecast_owner', 'strategy_owner'] $$;
GRANT EXECUTE ON FUNCTION graph.px_strength_rule(), graph.px_envelope_rule(), graph.px_facets(), graph.px_attention_class(),
                          graph.px_verifiers(), graph.px_attesters(), graph.px_investigators() TO eye_app, eye_commit;

-- §PX.2 THE STRENGTH OF AN EXPLANATION (internal; the read below and the envelope share it) ─────────────────────────────────────────────
/* The strength of one graph.explain answer: every finding kept as a reason (code, detail, node_id) and the strength the WORST of them
   (0 strong · 1 partial · 2 weak · 3 broken):
     BROKEN   an integrity gap — broken custody or an unverifiable artifact anywhere on the backward path;
     WEAK     an unresolved reference (unresolved_citation), another gap, an UNFIT fitness mark on the product or an input;
     PARTIAL  the walk truncated at its bounds, a withdrawn or corrected input, an approval no signature binds (unsigned_human_step), a
              model call without its recorded weights digest (undigested_model_call);
     STRONG   none of these. Never a number: the reasons are the answer. */
CREATE OR REPLACE FUNCTION graph.px_strength_of(p_tenant uuid, p_domain uuid, x jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, objects, pg_catalog, pg_temp AS $$
DECLARE g jsonb; n jsonb; v_reasons jsonb := '[]'::jsonb; v_level int := 0; v_i int := 0; v_root text := x ->> 'ref'; v_ref jsonb; v_uuid uuid; v_later record;
        c record; y record; v_seen text[] := '{}';
BEGIN
  -- (1) the gaps, each kept (B50's closure never drops one)
  FOR g IN SELECT * FROM jsonb_array_elements(coalesce(x -> 'gaps', '[]'::jsonb)) LOOP
    v_i := v_i + 1;
    IF g ->> 'kind' IN ('broken_custody', 'unverifiable_artifact') THEN
      v_level := greatest(v_level, 3);
      v_reasons := v_reasons || jsonb_build_object('code', 'gap', 'node_id', 'gap:' || v_i, 'detail', format('BROKEN — %s at %s: %s', replace(g ->> 'kind', '_', ' '), g ->> 'at', g ->> 'reason'));
    ELSIF g ->> 'kind' = 'incomplete_lineage' THEN
      v_level := greatest(v_level, 2);
      v_reasons := v_reasons || jsonb_build_object('code', 'unresolved_citation', 'node_id', 'gap:' || v_i, 'detail', format('%s (at %s)', g ->> 'reason', g ->> 'at'));
    ELSE
      v_level := greatest(v_level, 2);
      v_reasons := v_reasons || jsonb_build_object('code', 'gap', 'node_id', 'gap:' || v_i, 'detail', format('%s at %s: %s', replace(coalesce(g ->> 'kind', 'gap'), '_', ' '), g ->> 'at', g ->> 'reason'));
    END IF;
  END LOOP;
  -- (2) truncation
  IF coalesce((x ->> 'truncated')::boolean, false) THEN
    v_level := greatest(v_level, 1);
    v_reasons := v_reasons || jsonb_build_object('code', 'truncated', 'node_id', NULL,
      'detail', format('the backward walk reached its bounds after %s objects (max depth %s, max nodes %s) — what lies beyond is not examined', x ->> 'examined', x #>> '{bounds,max_depth}', x #>> '{bounds,max_nodes}'));
  END IF;
  -- (3) the nodes: model calls, approvals, the inputs
  FOR n IN SELECT * FROM jsonb_array_elements(coalesce(x -> 'nodes', '[]'::jsonb)) LOOP
    EXIT WHEN jsonb_array_length(v_reasons) >= 60;
    IF n ->> 'kind' = 'model_call' AND coalesce(n ->> 'ref', '') ~* '^gateway:[0-9a-f-]{36}$' THEN
      SELECT gc.model_id, gc.model_weights_digest, gc.prompt_version INTO y FROM intelligence.gateway_calls gc WHERE gc.call_id = substring(n ->> 'ref' from 9)::uuid AND gc.tenant_id = p_tenant;
      IF NOT FOUND OR coalesce(y.model_weights_digest, '') = '' THEN
        v_level := greatest(v_level, 1);
        v_reasons := v_reasons || jsonb_build_object('code', 'undigested_model_call', 'node_id', n ->> 'node_id',
          'detail', CASE WHEN NOT FOUND THEN format('the model call %s is not recorded — the model, its weights and its prompt cannot be named', n ->> 'ref')
                         ELSE format('model %s (prompt %s) is recorded without its weights digest — the exact model cannot be re-identified', y.model_id, coalesce(y.prompt_version, 'unrecorded')) END);
      END IF;
    ELSIF n ->> 'kind' = 'approval' AND n ->> 'outcome' = 'ok' AND coalesce(n ->> 'ref', '') ~* '^approval:[0-9a-f-]{36}$' THEN
      v_uuid := substring(n ->> 'ref' from 10)::uuid;
      IF NOT EXISTS (SELECT 1 FROM executive.signatures s WHERE s.subject_id = v_uuid AND s.tenant_id = p_tenant) THEN
        v_level := greatest(v_level, 1);
        v_reasons := v_reasons || jsonb_build_object('code', 'unsigned_human_step', 'node_id', n ->> 'node_id',
          'detail', format('%s — no signature binds this approval to the version it approved', n ->> 'label'));
      END IF;
    ELSIF n ->> 'node_id' LIKE 'obj:%' THEN
      v_ref := graph.pv_ref(n ->> 'ref');
      CONTINUE WHEN v_ref ->> 'form' <> 'typed' OR v_ref ->> 'version' IS NULL OR (n ->> 'ref') = ANY (v_seen);
      v_seen := v_seen || (n ->> 'ref');
      SELECT o.object_type, o.object_id, o.object_version, o.lifecycle_state, o.truth_state INTO c FROM objects.canonical_objects o
       WHERE o.object_type = v_ref ->> 'type' AND o.object_id = (v_ref ->> 'id')::uuid AND o.object_version = (v_ref ->> 'version')::int AND o.tenant_id = p_tenant;
      CONTINUE WHEN NOT FOUND;
      -- an UNFIT mark (the latest) on the product or on an input
      SELECT fm.verdict, fm.reasons, fm.marked_at INTO y FROM graph.product_fitness_marks fm
       WHERE fm.object_id = c.object_id AND fm.object_version = c.object_version AND fm.tenant_id = p_tenant ORDER BY fm.marked_at DESC LIMIT 1;
      IF FOUND AND y.verdict = 'unfit' THEN
        v_level := greatest(v_level, 2);
        v_reasons := v_reasons || jsonb_build_object('code', 'unfit', 'node_id', n ->> 'node_id',
          'detail', format('%s is marked UNFIT (%s) at %s', n ->> 'ref', array_to_string(y.reasons, ', '), graph.pv_iso(y.marked_at)));
      END IF;
      -- the product itself, and its own earlier versions (a correction's original): their correction or withdrawal is its display truth, not its provenance
      CONTINUE WHEN (n ->> 'ref') = v_root OR (graph.pv_ref(v_root) ->> 'id') = c.object_id::text;
      IF c.lifecycle_state IN ('withdrawn', 'deleted') OR c.truth_state = 'withdrawn' THEN
        v_level := greatest(v_level, 1);
        v_reasons := v_reasons || jsonb_build_object('code', 'withdrawn_input', 'node_id', n ->> 'node_id', 'detail', format('the input %s is WITHDRAWN', n ->> 'ref'));
        CONTINUE;
      END IF;
      SELECT o.object_version, o.lifecycle_state, o.truth_state, o.correction_of, o.withdrawal_reason INTO v_later FROM objects.canonical_objects o
       WHERE o.object_id = c.object_id AND o.object_type = c.object_type AND o.tenant_id = p_tenant AND o.object_version > c.object_version
         AND (o.truth_state = 'withdrawn' OR o.lifecycle_state = 'withdrawn' OR o.correction_of IN (c.object_id::text || '@' || c.object_version, c.object_type || ':' || c.object_id::text || '@' || c.object_version))
       ORDER BY o.object_version LIMIT 1;
      IF FOUND THEN
        v_level := greatest(v_level, 1);
        IF v_later.truth_state = 'withdrawn' OR v_later.lifecycle_state = 'withdrawn' THEN
          v_reasons := v_reasons || jsonb_build_object('code', 'withdrawn_input', 'node_id', n ->> 'node_id',
            'detail', format('the input %s was withdrawn since (v%s%s) — the product rests on a version no longer current', n ->> 'ref', v_later.object_version, coalesce(': ' || v_later.withdrawal_reason, '')));
        ELSE
          v_reasons := v_reasons || jsonb_build_object('code', 'corrected_input', 'node_id', n ->> 'node_id',
            'detail', format('the input %s was corrected since by v%s (the original preserved)', n ->> 'ref', v_later.object_version));
        END IF;
      ELSIF c.lifecycle_state IN ('corrected', 'superseded') THEN
        v_level := greatest(v_level, 1);
        v_reasons := v_reasons || jsonb_build_object('code', 'corrected_input', 'node_id', n ->> 'node_id', 'detail', format('the input %s is %s', n ->> 'ref', upper(c.lifecycle_state)));
      END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object(
    'ref', v_root,
    'strength', CASE v_level WHEN 0 THEN 'strong' WHEN 1 THEN 'partial' WHEN 2 THEN 'weak' ELSE 'broken' END,
    'reasons', v_reasons, 'rule_version', graph.px_strength_rule(), 'as_of', graph.pv_iso(clock_timestamp()),
    'basis', format('graph.explain (%s): %s nodes, %s gaps, %s; strength is the worst finding — broken (integrity gap), weak (unresolved reference, other gap, unfit), partial (truncated, withdrawn or corrected input, unsigned approval, undigested model call)',
                    x ->> 'method', jsonb_array_length(coalesce(x -> 'nodes', '[]'::jsonb)), jsonb_array_length(coalesce(x -> 'gaps', '[]'::jsonb)),
                    CASE WHEN coalesce((x ->> 'truncated')::boolean, false) THEN 'truncated' ELSE 'not truncated' END));
END $$;
REVOKE ALL ON FUNCTION graph.px_strength_of(uuid, uuid, jsonb) FROM PUBLIC;

-- §PX.3 graph.provenance_strength — §0's stub RE-DECLARED WHOLE ──────────────────────────────────────────────────────────────────────────
/* A READ (the 0120 idiom): STABLE, SECURITY DEFINER, the SAME fixed search path, the caller's scope asserted first (`read rejected (scope)`),
   the subject's shape checked (`provenance rejected (subject)` 22023 → 422). B82 px: the object is looked up in the caller's tenant AND
   domain (`provenance rejected (unknown_object)` 23503 → 404 — another scope's object is as unknown as one never recorded); the strength is
   graph.explain's, read through graph.px_strength_of. The answer keeps the stub's shape (ProvenanceStrengthRow) and adds `basis`. */
CREATE OR REPLACE FUNCTION graph.provenance_strength(p_tenant uuid, p_domain uuid, p_type text, p_id uuid, p_version int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, objects, observation, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the provenance strength of a product');
  IF p_type IS NULL OR p_type !~ '^[A-Z]{3}$' OR p_id IS NULL OR p_version IS NULL OR p_version < 1 THEN
    RAISE EXCEPTION 'provenance rejected (subject): a provenance-strength read names a recorded product as type (three capitals), id and version' USING ERRCODE = '22023';
  END IF;
  -- B82 px: the strength is computed (rule b82-px-strength-1) — §0's stub answered `unknown` without looking
  IF NOT EXISTS (SELECT 1 FROM objects.canonical_objects c WHERE c.object_type = p_type AND c.object_id = p_id AND c.object_version = p_version
                    AND c.tenant_id = p_tenant AND c.domain_id = p_domain) THEN
    RAISE EXCEPTION 'provenance rejected (unknown_object): % % v% is not recorded in this domain', p_type, p_id, p_version USING ERRCODE = '23503';
  END IF;
  RETURN graph.px_strength_of(p_tenant, p_domain, graph.explain(p_tenant, p_domain, p_type, p_id, p_version));
  -- end B82 px
END $$;
REVOKE ALL ON FUNCTION graph.provenance_strength(uuid, uuid, text, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.provenance_strength(uuid, uuid, text, uuid, int) TO eye_app, eye_commit;

-- §PX.4 THE LEDGERS ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE graph.trust_verifications (
  verification_id     uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  subject_type        text NOT NULL CHECK (subject_type ~ '^[A-Z]{3}$'),
  subject_id          uuid NOT NULL,
  subject_version     int  NOT NULL CHECK (subject_version >= 1),
  subject_digest      text NOT NULL,
  facet               text NOT NULL CHECK (facet = ANY (graph.px_facets())),
  outcome             text NOT NULL CHECK (outcome IN ('verified', 'failed', 'unavailable')),
  detail              text NOT NULL CHECK (length(btrim(detail)) BETWEEN 4 AND 4000),
  examined            jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(examined) = 'object'),
  rule_version        text NOT NULL,
  verifier            uuid NOT NULL,
  verified_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  request_id          uuid NOT NULL UNIQUE,
  correlation_id      uuid NOT NULL,
  CONSTRAINT gtv_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
COMMENT ON TABLE graph.trust_verifications IS 'B82 §PX (UX-57-002/003): one recorded verification of one facet of one product version — the outcome the SERVER computed (verified | failed | unavailable; a verification that cannot be made is unavailable, never failed), what was examined, the verifier, the subject digest. Append-only.';
CREATE INDEX gtv_subject ON graph.trust_verifications (tenant_id, subject_id, subject_version, facet, verified_at DESC);
CREATE TRIGGER gtv_append_only BEFORE UPDATE OR DELETE ON graph.trust_verifications FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE graph.trust_attestations (
  attestation_id      uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  subject_type        text NOT NULL CHECK (subject_type ~ '^[A-Z]{3}$'),
  subject_id          uuid NOT NULL,
  subject_version     int  NOT NULL CHECK (subject_version >= 1),
  subject_digest      text NOT NULL,
  envelope_digest     text NOT NULL CHECK (envelope_digest ~ '^[0-9a-f]{64}$'),
  facets              text[] NOT NULL CHECK (cardinality(facets) >= 1 AND facets <@ graph.px_facets()),
  statement           text NOT NULL CHECK (length(btrim(statement)) BETWEEN 16 AND 2000),
  attested_by         uuid NOT NULL,
  attested_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  request_id          uuid NOT NULL UNIQUE,
  correlation_id      uuid NOT NULL,
  CONSTRAINT gta_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
COMMENT ON TABLE graph.trust_attestations IS 'B82 §PX (UX-57-003/004, DESIGN D11): a PERSON''s recorded statement that they inspected the named facets of one product version, bound to the envelope digest they read — never an approval or a release, never an agent''s, never the producer''s or owner''s; it enables no command. Withdrawn through graph.trust_attestation_events. Append-only.';
CREATE INDEX gta_subject ON graph.trust_attestations (tenant_id, subject_id, subject_version, attested_at DESC);
CREATE TRIGGER gta_append_only BEFORE UPDATE OR DELETE ON graph.trust_attestations FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE graph.trust_attestation_events (
  event_id            uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  attestation_id      uuid NOT NULL REFERENCES graph.trust_attestations (attestation_id),
  event               text NOT NULL CHECK (event IN ('trust.attested', 'trust.attestation_withdrawn')),
  actor_principal_id  uuid NOT NULL,
  reason              text,
  details             jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  request_id          uuid NOT NULL UNIQUE,
  occurred_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT gtae_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT gtae_reason CHECK (event <> 'trust.attestation_withdrawn' OR length(btrim(coalesce(reason, ''))) BETWEEN 8 AND 2000)
);
CREATE UNIQUE INDEX gtae_one_withdrawal ON graph.trust_attestation_events (attestation_id) WHERE event = 'trust.attestation_withdrawn';
CREATE INDEX gtae_attestation ON graph.trust_attestation_events (attestation_id, occurred_at);
CREATE TRIGGER gtae_append_only BEFORE UPDATE OR DELETE ON graph.trust_attestation_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* RLS (the 0120 graph idiom): within the bound tenant, and the bound domain for a DOMAIN context. SELECT only; the ports write. */
REVOKE ALL ON graph.trust_verifications, graph.trust_attestations, graph.trust_attestation_events FROM PUBLIC;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['trust_verifications', 'trust_attestations', 'trust_attestation_events'] LOOP
    EXECUTE format('ALTER TABLE graph.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE graph.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY graph_isolation ON graph.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON graph.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- §PX.5 THE ROWS AS THE SEAM STATES THEM ─────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION graph.px_attestation_row(a graph.trust_attestations) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = graph, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('attestation_id', a.attestation_id, 'subject', a.subject_type || ':' || a.subject_id || '@' || a.subject_version,
    'facets', to_jsonb(a.facets), 'statement', a.statement, 'attested_by', a.attested_by, 'attested_at', graph.pv_iso(a.attested_at),
    'envelope_digest', a.envelope_digest, 'subject_digest', a.subject_digest,
    'withdrawn_at', graph.pv_iso(w.occurred_at), 'withdrawn_by', w.actor_principal_id, 'withdraw_reason', w.reason,
    'state', CASE WHEN w.event_id IS NULL THEN 'standing' ELSE 'withdrawn' END,
    'kind', 'a recorded statement of inspection — not an approval, not a release; it enables no command')
  FROM (SELECT 1) one LEFT JOIN graph.trust_attestation_events w ON w.attestation_id = a.attestation_id AND w.event = 'trust.attestation_withdrawn'
$$;
REVOKE ALL ON FUNCTION graph.px_attestation_row(graph.trust_attestations) FROM PUBLIC;

CREATE OR REPLACE FUNCTION graph.px_verification_row(v graph.trust_verifications) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = graph, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('verification_id', v.verification_id, 'subject', v.subject_type || ':' || v.subject_id || '@' || v.subject_version, 'facet', v.facet,
    'outcome', v.outcome, 'detail', v.detail, 'examined', v.examined, 'subject_digest', v.subject_digest, 'rule_version', v.rule_version,
    'verifier', v.verifier, 'verified_at', graph.pv_iso(v.verified_at))
$$;
REVOKE ALL ON FUNCTION graph.px_verification_row(graph.trust_verifications) FROM PUBLIC;

-- §PX.6 THE FACETS (computed by the server from stored rows; never the caller's) ─────────────────────────────────────────────────────────
/* One facet of one product version, LIVE, from its explanation `x`: {facet, outcome, detail, examined}. `signature` is not computed here
   (its verification needs the deployment's key — the service verifies, graph.verify_trust records); a read shows the latest recorded one.
     lineage     the backward closure: no gap and not truncated → verified; an integrity gap or an unresolved reference → failed; only
                 truncated → unavailable (nothing beyond the bounds was verified or refuted)
     custody     every evidence version on the path (§EV's graph.ev_evidence_state): integrity failed or custody not established → failed;
                 a tier unreachable or the bytes tombstoned → unavailable; no evidence on the path → not_checked
     rights      the rights terms of each evidence's source contract: expired or withdrawn → failed; all in force → verified; none
                 declared → not_checked (the source contract's own rights stand)
     correction  the product or an input corrected or withdrawn since → failed; else verified
     policy      the policy decisions on the production path (a claim's retrieval and admission decisions): a denial or an EXPIRED decision
                 → failed; all allowed → verified; none recorded → not_checked
     evaluation  a forecast's latest fitness assessment, else the product's latest fitness mark: fit → verified, unfit → failed, none →
                 not_checked
     freshness   the header's freshness assessment: stale → failed; assessed / current → verified; none → not_checked */
CREATE OR REPLACE FUNCTION graph.px_facet(p_tenant uuid, p_domain uuid, o objects.canonical_objects, x jsonb, p_facet text, p_at timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, objects, observation, pg_catalog, pg_temp AS $$
DECLARE n jsonb; g jsonb; v_ref jsonb; s jsonb; v_out text; v_detail text[] := '{}'; v_failed int := 0; v_unavail int := 0; v_ok int := 0; v_none int := 0; y record;
        v_integrity int := 0; v_unres int := 0; v_ex jsonb := '{}'::jsonb; v_root text := x ->> 'ref';
BEGIN
  IF p_facet = 'lineage' THEN
    FOR g IN SELECT * FROM jsonb_array_elements(coalesce(x -> 'gaps', '[]'::jsonb)) LOOP
      IF g ->> 'kind' IN ('broken_custody', 'unverifiable_artifact') THEN v_integrity := v_integrity + 1; ELSE v_unres := v_unres + 1; END IF;
      IF cardinality(v_detail) < 5 THEN v_detail := v_detail || format('%s at %s: %s', replace(g ->> 'kind', '_', ' '), g ->> 'at', g ->> 'reason'); END IF;
    END LOOP;
    v_ex := jsonb_build_object('examined', x -> 'examined', 'gaps', jsonb_array_length(coalesce(x -> 'gaps', '[]'::jsonb)), 'truncated', x -> 'truncated', 'method', x -> 'method');
    IF v_integrity + v_unres > 0 THEN
      RETURN jsonb_build_object('facet', p_facet, 'outcome', 'failed', 'examined', v_ex,
        'detail', format('%s gap(s) on the backward path (%s integrity, %s unresolved): %s', v_integrity + v_unres, v_integrity, v_unres, array_to_string(v_detail, '; ')));
    ELSIF coalesce((x ->> 'truncated')::boolean, false) THEN
      RETURN jsonb_build_object('facet', p_facet, 'outcome', 'unavailable', 'examined', v_ex,
        'detail', format('the walk reached its bounds after %s objects — nothing beyond them was verified or refuted', x ->> 'examined'));
    END IF;
    RETURN jsonb_build_object('facet', p_facet, 'outcome', 'verified', 'examined', v_ex, 'detail', format('%s object(s) on the backward path resolve; no gap recorded', x ->> 'examined'));
  ELSIF p_facet IN ('custody', 'rights') THEN
    FOR n IN SELECT * FROM jsonb_array_elements(coalesce(x -> 'nodes', '[]'::jsonb)) LOOP
      CONTINUE WHEN n ->> 'node_id' NOT LIKE 'obj:EVD:%';
      v_ref := graph.pv_ref(n ->> 'ref');
      CONTINUE WHEN v_ref ->> 'version' IS NULL;
      s := graph.ev_evidence_state(p_tenant, p_domain, (v_ref ->> 'id')::uuid, (v_ref ->> 'version')::int, NULL, NULL, p_at);
      IF p_facet = 'custody' THEN
        IF (s ->> 'integrity_failed')::boolean OR s #>> '{custody,state}' = 'not_established' OR (s ->> 'digest_ok') = 'false' THEN
          v_failed := v_failed + 1; IF cardinality(v_detail) < 5 THEN v_detail := v_detail || format('%s: custody %s%s', n ->> 'ref', replace(coalesce(s #>> '{custody,state}', 'unknown'), '_', ' '), coalesce(' — ' || (s ->> 'detail'), '')); END IF;
        ELSIF (s ->> 'unreachable')::boolean OR (s ->> 'tombstoned')::boolean THEN
          v_unavail := v_unavail + 1; IF cardinality(v_detail) < 5 THEN v_detail := v_detail || format('%s: %s', n ->> 'ref', coalesce(s ->> 'detail', 'the bytes cannot be reached')); END IF;
        ELSE v_ok := v_ok + 1; END IF;
      ELSE
        IF s ->> 'rights_state' IN ('expired', 'withdrawn') THEN
          v_failed := v_failed + 1; IF cardinality(v_detail) < 5 THEN v_detail := v_detail || format('%s: rights %s (%s)', n ->> 'ref', s ->> 'rights_state', coalesce(s #>> '{rights,expiry_statement}', '')); END IF;
        ELSIF s ->> 'rights_state' = 'in_force' THEN v_ok := v_ok + 1;
        ELSE v_none := v_none + 1; END IF;
      END IF;
    END LOOP;
    v_ex := jsonb_build_object('evidence', v_ok + v_failed + v_unavail + v_none, 'verified', v_ok, 'failed', v_failed, 'unavailable', v_unavail, 'none_declared', v_none);
    IF v_ok + v_failed + v_unavail + v_none = 0 THEN
      RETURN jsonb_build_object('facet', p_facet, 'outcome', 'not_checked', 'examined', v_ex, 'detail', 'no evidence version lies on the backward path — nothing to check');
    ELSIF v_failed > 0 THEN
      RETURN jsonb_build_object('facet', p_facet, 'outcome', 'failed', 'examined', v_ex, 'detail', format('%s of %s evidence version(s) fail: %s', v_failed, v_ok + v_failed + v_unavail + v_none, array_to_string(v_detail, '; ')));
    ELSIF v_unavail > 0 THEN
      RETURN jsonb_build_object('facet', p_facet, 'outcome', 'unavailable', 'examined', v_ex, 'detail', format('%s evidence version(s) could not be checked: %s', v_unavail, array_to_string(v_detail, '; ')));
    ELSIF p_facet = 'rights' AND v_ok = 0 THEN
      RETURN jsonb_build_object('facet', p_facet, 'outcome', 'not_checked', 'examined', v_ex, 'detail', format('no rights terms are declared for the %s evidence version(s) on the path — the source contracts'' own rights stand', v_none));
    END IF;
    RETURN jsonb_build_object('facet', p_facet, 'outcome', 'verified', 'examined', v_ex,
      'detail', CASE WHEN p_facet = 'custody' THEN format('custody established and intact for %s evidence version(s)', v_ok)
                     ELSE format('rights terms in force for %s evidence version(s)%s', v_ok, CASE WHEN v_none > 0 THEN format('; %s with no terms declared', v_none) ELSE '' END) END);
  ELSIF p_facet = 'correction' THEN
    SELECT c.object_version, c.lifecycle_state, c.truth_state INTO y FROM objects.canonical_objects c
     WHERE c.object_id = o.object_id AND c.object_type = o.object_type AND c.tenant_id = p_tenant AND c.object_version > o.object_version
       AND (c.truth_state = 'withdrawn' OR c.lifecycle_state = 'withdrawn' OR c.correction_of IN (o.object_id::text || '@' || o.object_version, o.object_type || ':' || o.object_id::text || '@' || o.object_version))
     ORDER BY c.object_version LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('facet', p_facet, 'outcome', 'failed', 'examined', jsonb_build_object('later_version', y.object_version),
        'detail', format('this version is %s by v%s — read the later version for any current use', CASE WHEN y.truth_state = 'withdrawn' OR y.lifecycle_state = 'withdrawn' THEN 'withdrawn' ELSE 'corrected' END, y.object_version));
    END IF;
    SELECT count(*) FILTER (WHERE r ->> 'code' IN ('withdrawn_input', 'corrected_input')) AS k,
           string_agg(r ->> 'detail', '; ') FILTER (WHERE r ->> 'code' IN ('withdrawn_input', 'corrected_input')) AS d INTO y
      FROM jsonb_array_elements(graph.px_strength_of(p_tenant, p_domain, x) -> 'reasons') r;
    IF y.k > 0 THEN
      RETURN jsonb_build_object('facet', p_facet, 'outcome', 'failed', 'examined', jsonb_build_object('inputs_changed', y.k), 'detail', format('%s input(s) changed since: %s', y.k, left(y.d, 1200)));
    END IF;
    RETURN jsonb_build_object('facet', p_facet, 'outcome', 'verified', 'examined', '{}'::jsonb, 'detail', 'no correction or withdrawal is recorded on this version or on its inputs');
  ELSIF p_facet = 'policy' THEN
    FOR n IN SELECT * FROM jsonb_array_elements(coalesce(x -> 'nodes', '[]'::jsonb)) LOOP
      CONTINUE WHEN n ->> 'kind' <> 'policy_decision' OR coalesce(n ->> 'ref', '') !~* '^policy:[0-9a-f-]{36}$' OR n ->> 'label' LIKE 'denied:%';
      SELECT d.decision, d.action, d.expires_at INTO y FROM policy.policy_decisions d WHERE d.id = substring(n ->> 'ref' from 8)::uuid;
      CONTINUE WHEN NOT FOUND;
      IF y.decision NOT IN ('allow', 'allow_with_obligations') THEN
        v_failed := v_failed + 1; IF cardinality(v_detail) < 5 THEN v_detail := v_detail || format('%s: %s', y.action, y.decision); END IF;
      ELSIF y.expires_at IS NOT NULL AND y.expires_at <= p_at THEN
        v_failed := v_failed + 1; IF cardinality(v_detail) < 5 THEN v_detail := v_detail || format('%s: allowed, EXPIRED at %s', y.action, graph.pv_iso(y.expires_at)); END IF;
      ELSE v_ok := v_ok + 1; END IF;
    END LOOP;
    v_ex := jsonb_build_object('decisions', v_ok + v_failed, 'allowed', v_ok, 'failed', v_failed);
    IF v_ok + v_failed = 0 THEN
      RETURN jsonb_build_object('facet', p_facet, 'outcome', 'not_checked', 'examined', v_ex, 'detail', 'no policy decision is recorded on the production path (retrieval and admission of its claims)');
    ELSIF v_failed > 0 THEN
      RETURN jsonb_build_object('facet', p_facet, 'outcome', 'failed', 'examined', v_ex, 'detail', format('%s policy decision(s) on the production path deny or have expired: %s', v_failed, array_to_string(v_detail, '; ')));
    END IF;
    RETURN jsonb_build_object('facet', p_facet, 'outcome', 'verified', 'examined', v_ex, 'detail', format('%s policy decision(s) on the production path allowed and in force', v_ok));
  ELSIF p_facet = 'evaluation' THEN
    IF o.object_type = 'FCT' THEN
      SELECT fa.verdict, fa.fitness_class, fa.rule_version, fa.assessed_at INTO y FROM prediction.forecast_fitness_assessments fa
       WHERE fa.forecast_id = o.object_id AND fa.tenant_id = p_tenant ORDER BY fa.assessed_at DESC LIMIT 1;
      IF FOUND THEN
        RETURN jsonb_build_object('facet', p_facet, 'outcome', CASE y.verdict WHEN 'fit' THEN 'verified' WHEN 'unfit' THEN 'failed' ELSE 'unavailable' END,
          'examined', jsonb_build_object('rule_version', y.rule_version, 'assessed_at', graph.pv_iso(y.assessed_at)),
          'detail', format('forecast fitness %s%s under %s at %s', y.verdict, coalesce(' (' || y.fitness_class || ')', ''), y.rule_version, graph.pv_iso(y.assessed_at)));
      END IF;
    END IF;
    SELECT fm.verdict, fm.reasons, fm.rule_version, fm.marked_at INTO y FROM graph.product_fitness_marks fm
     WHERE fm.object_id = o.object_id AND fm.object_version = o.object_version AND fm.tenant_id = p_tenant ORDER BY fm.marked_at DESC LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('facet', p_facet, 'outcome', CASE y.verdict WHEN 'fit' THEN 'verified' WHEN 'unfit' THEN 'failed' ELSE 'unavailable' END,
        'examined', jsonb_build_object('rule_version', y.rule_version, 'marked_at', graph.pv_iso(y.marked_at)),
        'detail', format('fitness mark %s%s under %s at %s', y.verdict, CASE WHEN cardinality(y.reasons) > 0 THEN ' (' || array_to_string(y.reasons, ', ') || ')' ELSE '' END, y.rule_version, graph.pv_iso(y.marked_at)));
    END IF;
    RETURN jsonb_build_object('facet', p_facet, 'outcome', 'not_checked', 'examined', '{}'::jsonb, 'detail', 'not evaluated — no fitness assessment or mark is recorded for this version');
  ELSIF p_facet = 'freshness' THEN
    IF o.freshness_state IS NULL OR jsonb_typeof(o.freshness_state) <> 'object' THEN
      RETURN jsonb_build_object('facet', p_facet, 'outcome', 'not_checked', 'examined', '{}'::jsonb, 'detail', 'no freshness assessment is recorded on this version');
    ELSIF o.freshness_state ->> 'state' = 'stale' THEN
      RETURN jsonb_build_object('facet', p_facet, 'outcome', 'failed', 'examined', o.freshness_state,
        'detail', format('STALE under %s%s', coalesce(o.freshness_state ->> 'method', 'its method'), coalesce(format(' — stale by %s day(s)', o.freshness_state ->> 'stale_by_days'), '')));
    END IF;
    RETURN jsonb_build_object('facet', p_facet, 'outcome', 'verified', 'examined', o.freshness_state,
      'detail', format('%s under %s%s', coalesce(o.freshness_state ->> 'state', 'assessed'), coalesce(o.freshness_state ->> 'method', 'its method'), coalesce(' as of ' || (o.freshness_state ->> 'as_of'), '')));
  END IF;
  RETURN jsonb_build_object('facet', p_facet, 'outcome', 'not_checked', 'examined', '{}'::jsonb, 'detail', 'not computed by a read');
END $$;
REVOKE ALL ON FUNCTION graph.px_facet(uuid, uuid, objects.canonical_objects, jsonb, text, timestamptz) FROM PUBLIC;

/* The subject's recorded signatures (the version's own, and — for a decision package version — its approvals'): the verifier's input. */
CREATE OR REPLACE FUNCTION graph.px_signatures(p_tenant uuid, p_domain uuid, p_type text, p_id uuid, p_version int) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = graph, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('signature_id', s.signature_id, 'subject_kind', s.subject_kind, 'subject_id', s.subject_id, 'subject_version', s.subject_version,
                                               'subject_digest', s.subject_digest, 'signer', s.signer, 'key_id', s.key_id, 'algorithm', s.algorithm, 'signature', s.signature,
                                               'bound_action', s.bound_action, 'signed_at', graph.pv_iso(s.signed_at)) ORDER BY s.signed_at, s.signature_id), '[]'::jsonb)
    FROM executive.signatures s
   WHERE s.tenant_id = p_tenant
     AND ((s.subject_id = p_id AND (s.subject_version IS NULL OR s.subject_version = p_version))
          OR (p_type = 'DPK' AND s.subject_id IN (SELECT a.approval_id FROM decision.approvals a WHERE a.package_id = p_id AND a.version = p_version)))
$$;
REVOKE ALL ON FUNCTION graph.px_signatures(uuid, uuid, text, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.px_signatures(uuid, uuid, text, uuid, int) TO eye_commit;

-- §PX.7 THE TRUST ENVELOPE (the read) ───────────────────────────────────────────────────────────────────────────────────────────────────
/* FACETS, NEVER A SCORE. Each facet: {facet, outcome, detail, checked_at, checked_by, basis, examined} — `basis` says whether the read
   computed it now (`computed`) or shows the latest RECORDED verification (`recorded`; the signature facet always — its key is the
   server's); a later recorded verification of a computed facet is listed under `verifications`. TRUST INDETERMINATE when any facet FAILED
   or could NOT be verified (unavailable), or the provenance is BROKEN: the reasons, the constrained use and the routes (verify again,
   open an investigation). The DIGEST binds the subject, its digest, every facet's outcome and words, the strength and its reason codes, and
   the attestations' ids and states — an attestation names it. STABLE; the caller's scope first. */
CREATE OR REPLACE FUNCTION graph.trust_envelope(p_tenant uuid, p_domain uuid, p_type text, p_id uuid, p_version int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, objects, observation, pg_catalog, pg_temp AS $$
DECLARE o objects.canonical_objects; x jsonb; v_now timestamptz := clock_timestamp(); f text; v_facets jsonb := '[]'::jsonb; v_row jsonb; rv graph.trust_verifications%ROWTYPE;
        v_strength jsonb; v_att jsonb; v_ver jsonb; v_inv jsonb; v_reasons jsonb := '[]'::jsonb; v_digest text; v_ref text;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the trust envelope of a product');
  IF p_type IS NULL OR p_type !~ '^[A-Z]{3}$' OR p_id IS NULL OR p_version IS NULL OR p_version < 1 THEN
    RAISE EXCEPTION 'provenance rejected (subject): a trust envelope names a recorded product as type (three capitals), id and version' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO o FROM objects.canonical_objects c WHERE c.object_type = p_type AND c.object_id = p_id AND c.object_version = p_version AND c.tenant_id = p_tenant AND c.domain_id = p_domain;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'provenance rejected (unknown_object): % % v% is not recorded in this domain', p_type, p_id, p_version USING ERRCODE = '23503';
  END IF;
  v_ref := p_type || ':' || p_id || '@' || p_version;
  x := graph.explain(p_tenant, p_domain, p_type, p_id, p_version);
  v_strength := graph.px_strength_of(p_tenant, p_domain, x);
  FOREACH f IN ARRAY graph.px_facets() LOOP
    SELECT * INTO rv FROM graph.trust_verifications t WHERE t.tenant_id = p_tenant AND t.domain_id = p_domain AND t.subject_id = p_id AND t.subject_version = p_version AND t.facet = f
     ORDER BY t.verified_at DESC, t.verification_id DESC LIMIT 1;
    IF f = 'signature' THEN
      IF rv.verification_id IS NULL THEN
        v_row := jsonb_build_object('facet', f, 'outcome', 'not_checked', 'examined', jsonb_build_object('signatures', jsonb_array_length(graph.px_signatures(p_tenant, p_domain, p_type, p_id, p_version))),
          'detail', CASE WHEN jsonb_array_length(graph.px_signatures(p_tenant, p_domain, p_type, p_id, p_version)) = 0 THEN 'no signature is recorded on this version'
                         ELSE 'not verified yet — a signature is verified on request with the deployment''s key (verify again)' END,
          'checked_at', NULL, 'checked_by', NULL, 'basis', 'recorded');
      ELSE
        v_row := jsonb_build_object('facet', f, 'outcome', rv.outcome, 'detail', rv.detail, 'examined', rv.examined, 'checked_at', graph.pv_iso(rv.verified_at), 'checked_by', rv.verifier, 'basis', 'recorded');
      END IF;
    ELSE
      v_row := graph.px_facet(p_tenant, p_domain, o, x, f, v_now) || jsonb_build_object('checked_at', graph.pv_iso(v_now), 'checked_by', NULL, 'basis', 'computed');
      IF rv.verification_id IS NOT NULL THEN
        v_row := v_row || jsonb_build_object('recorded', jsonb_build_object('outcome', rv.outcome, 'detail', rv.detail, 'verified_at', graph.pv_iso(rv.verified_at), 'verifier', rv.verifier));
      END IF;
    END IF;
    v_facets := v_facets || v_row;
    IF v_row ->> 'outcome' IN ('failed', 'unavailable') THEN
      v_reasons := v_reasons || jsonb_build_object('facet', f, 'outcome', v_row ->> 'outcome', 'detail', v_row ->> 'detail');
    END IF;
  END LOOP;
  IF v_strength ->> 'strength' = 'broken' THEN
    v_reasons := v_reasons || jsonb_build_object('facet', 'provenance', 'outcome', 'broken', 'detail', 'the provenance is BROKEN — an integrity gap on the backward path');
  END IF;
  SELECT coalesce(jsonb_agg(graph.px_attestation_row(a) ORDER BY a.attested_at DESC), '[]'::jsonb) INTO v_att FROM graph.trust_attestations a
   WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.subject_id = p_id AND a.subject_version = p_version;
  SELECT coalesce(jsonb_agg(graph.px_verification_row(t) ORDER BY t.verified_at DESC), '[]'::jsonb) INTO v_ver FROM (
    SELECT * FROM graph.trust_verifications t0 WHERE t0.tenant_id = p_tenant AND t0.domain_id = p_domain AND t0.subject_id = p_id AND t0.subject_version = p_version
     ORDER BY t0.verified_at DESC LIMIT 20) t;
  SELECT coalesce(jsonb_agg(jsonb_build_object('item_id', i.item_id, 'state', i.state, 'title', i.title, 'owner', i.owner_principal_id, 'facet', i.details ->> 'facet',
                                               'opened_at', graph.pv_iso(i.created_at)) ORDER BY i.created_at DESC), '[]'::jsonb) INTO v_inv
    FROM executive.attention_items i WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.signal_class = graph.px_attention_class() AND i.subject_id = p_id
     AND i.details ->> 'version' = p_version::text AND i.state NOT IN ('closed', 'resolved');
  v_digest := encode(sha256(convert_to(jsonb_build_object(
      'subject', v_ref, 'subject_digest', o.content_digest, 'rule', graph.px_envelope_rule(),
      'facets', (SELECT jsonb_agg(jsonb_build_object('facet', e ->> 'facet', 'outcome', e ->> 'outcome', 'detail', e ->> 'detail')) FROM jsonb_array_elements(v_facets) e),
      'strength', v_strength ->> 'strength', 'reasons', (SELECT coalesce(jsonb_agg(r ->> 'code'), '[]'::jsonb) FROM jsonb_array_elements(v_strength -> 'reasons') r),
      'attestations', (SELECT coalesce(jsonb_agg(jsonb_build_array(a ->> 'attestation_id', a ->> 'state')), '[]'::jsonb) FROM jsonb_array_elements(v_att) a))::text, 'UTF8')), 'hex');
  RETURN jsonb_build_object(
    'subject', v_ref, 'subject_digest', o.content_digest, 'title', left(coalesce(o.payload ->> 'title', o.payload ->> 'statement', o.payload ->> 'subject', o.payload ->> 'label', o.object_type || ' ' || o.object_id::text), 200),
    'owner', o.accountable_owner, 'facets', v_facets, 'provenance', v_strength, 'attestations', v_att, 'verifications', v_ver, 'investigations', v_inv,
    'indeterminate', jsonb_array_length(v_reasons) > 0, 'reasons', v_reasons,
    'constrained_use', CASE WHEN jsonb_array_length(v_reasons) > 0
                            THEN 'TRUST INDETERMINATE — not for a decision-active use until each failing or unverifiable facet is verified again or investigated; the failing evidence is kept as recorded'
                            END,
    'routes', jsonb_build_object('verify', 'graph.trust.verify', 'investigate', 'graph.trust.investigate', 'attest', 'graph.trust.attest',
                                 'note', 'an indicator informs; an accountable person decides — no command reads these facets to become eligible'),
    'rule_version', graph.px_envelope_rule(), 'digest', v_digest, 'as_of', graph.pv_iso(v_now));
END $$;
REVOKE ALL ON FUNCTION graph.trust_envelope(uuid, uuid, text, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.trust_envelope(uuid, uuid, text, uuid, int) TO eye_app, eye_commit;

-- §PX.8 THE PORTS ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* The acting PERSON: the bound principal, named by the route, an ACTIVE HUMAN holding one of the roles at a covering scope (an auditor at
   TENANT counts) — re-checked here, the PDP's human gate not trusted alone. */
CREATE OR REPLACE FUNCTION graph.px_actor(p_noun text, p_actor uuid, p_tenant uuid, p_domain uuid, p_roles text[], p_what text) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, identity, governance, pg_catalog, pg_temp AS $$
DECLARE v uuid := public.eye_principal();
BEGIN
  IF v IS NULL OR p_actor IS DISTINCT FROM v THEN
    RAISE EXCEPTION '% rejected (actor): the act is recorded under the acting principal, never on behalf of another', p_noun USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = v AND p.kind = 'human' AND p.status = 'active') THEN
    RAISE EXCEPTION '% rejected (actor): % is a named person''s act — an agent or a system never verifies, attests or investigates trust', p_noun, p_what USING ERRCODE = '42501';
  END IF;
  IF NOT governance.holds_role(v, p_tenant, p_domain, p_roles) THEN
    RAISE EXCEPTION '% rejected (authority): % is the act of a %', p_noun, p_what, array_to_string(p_roles, ', ') USING ERRCODE = '42501';
  END IF;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION graph.px_actor(text, uuid, uuid, uuid, text[], text) FROM PUBLIC;

/* The subject version, recorded in the caller's domain, or the refusal under the noun. */
CREATE OR REPLACE FUNCTION graph.px_subject(p_noun text, p_tenant uuid, p_domain uuid, p_type text, p_id uuid, p_version int) RETURNS objects.canonical_objects
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, objects, pg_catalog, pg_temp AS $$
DECLARE o objects.canonical_objects;
BEGIN
  IF p_type IS NULL OR p_type !~ '^[A-Z]{3}$' OR p_id IS NULL OR p_version IS NULL OR p_version < 1 THEN
    RAISE EXCEPTION '% rejected (subject): the subject is a recorded product named by type (three capitals), id and version', p_noun USING ERRCODE = '22023';
  END IF;
  SELECT * INTO o FROM objects.canonical_objects c WHERE c.object_type = p_type AND c.object_id = p_id AND c.object_version = p_version AND c.tenant_id = p_tenant AND c.domain_id = p_domain;
  IF NOT FOUND THEN
    RAISE EXCEPTION '% rejected (unknown_object): % % v% is not recorded in this domain', p_noun, p_type, p_id, p_version USING ERRCODE = '23503';
  END IF;
  RETURN o;
END $$;
REVOKE ALL ON FUNCTION graph.px_subject(text, uuid, uuid, text, uuid, int) FROM PUBLIC;

/* VERIFY AGAIN one facet of one product version (graph.trust.verify): the SERVER computes the outcome from stored rows (px_facet) — for
   `signature` the service hands the verifier's outcome per recorded signature (the key is the deployment's) and the port checks it names
   EXACTLY the subject's recorded signatures (none omitted, none foreign): any failed → failed; else any unavailable → unavailable (never
   failed); all verified → verified; none recorded → unavailable ("nothing to verify"). Recorded append-only; a request id replayed by the
   same person answers the recorded verification. */
CREATE OR REPLACE FUNCTION graph.verify_trust(p_request_id uuid, p_tenant uuid, p_domain uuid, p_type text, p_id uuid, p_version int, p_facet text, p_signatures jsonb,
                                              p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, objects, observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; o objects.canonical_objects; r graph.trust_verifications%ROWTYPE; v jsonb; v_rec jsonb; v_given text[]; v_have text[]; v_failed int; v_unavail int; v_n int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.trust.verify']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := graph.px_actor('trust verification', p_actor, p_tenant, p_domain, graph.px_verifiers(), 'verifying the trust of a product');
  IF p_request_id IS NULL OR p_correlation IS NULL THEN
    RAISE EXCEPTION 'trust verification rejected (request): a verification carries its request id (the command identity a retry reuses) and its correlation' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO r FROM graph.trust_verifications t WHERE t.request_id = p_request_id;
  IF FOUND THEN
    IF r.verifier IS DISTINCT FROM v_actor OR r.subject_id IS DISTINCT FROM p_id OR r.subject_version IS DISTINCT FROM p_version OR r.facet IS DISTINCT FROM p_facet THEN
      RAISE EXCEPTION 'trust verification rejected (duplicate): request % already recorded another verification; a new verification takes a new request id', p_request_id USING ERRCODE = '23505';
    END IF;
    RETURN graph.px_verification_row(r) || jsonb_build_object('replayed', true);
  END IF;
  IF p_facet IS NULL OR NOT (p_facet = ANY (graph.px_facets())) THEN
    RAISE EXCEPTION 'trust verification rejected (facet): the facet is one of %', array_to_string(graph.px_facets(), ', ') USING ERRCODE = '22023';
  END IF;
  o := graph.px_subject('trust verification', p_tenant, p_domain, p_type, p_id, p_version);
  IF p_facet = 'signature' THEN
    v_rec := graph.px_signatures(p_tenant, p_domain, p_type, p_id, p_version);
    IF p_signatures IS NULL OR jsonb_typeof(p_signatures) <> 'array'
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_signatures) e WHERE jsonb_typeof(e) <> 'object' OR coalesce(e ->> 'outcome', '') NOT IN ('verified', 'failed', 'unavailable')
                                                                       OR coalesce(e ->> 'signature_id', '') !~* '^[0-9a-f-]{36}$') THEN
      RAISE EXCEPTION 'trust verification rejected (signatures): a signature verification carries the verifier''s outcome (verified, failed, unavailable) for each recorded signature' USING ERRCODE = '22023';
    END IF;
    SELECT coalesce(array_agg(lower(e ->> 'signature_id') ORDER BY lower(e ->> 'signature_id')), '{}') INTO v_given FROM jsonb_array_elements(p_signatures) e;
    SELECT coalesce(array_agg(lower(e ->> 'signature_id') ORDER BY lower(e ->> 'signature_id')), '{}') INTO v_have FROM jsonb_array_elements(v_rec) e;
    IF v_given IS DISTINCT FROM v_have THEN
      RAISE EXCEPTION 'trust verification rejected (signatures): the verification names % signature(s); % are recorded on % — every recorded signature is verified, none other', cardinality(v_given), cardinality(v_have), p_type || ':' || p_id || '@' || p_version USING ERRCODE = '22023';
    END IF;
    SELECT count(*) FILTER (WHERE e ->> 'outcome' = 'failed'), count(*) FILTER (WHERE e ->> 'outcome' = 'unavailable'), count(*) INTO v_failed, v_unavail, v_n FROM jsonb_array_elements(p_signatures) e;
    v := jsonb_build_object('facet', 'signature',
      'outcome', CASE WHEN v_n = 0 THEN 'unavailable' WHEN v_failed > 0 THEN 'failed' WHEN v_unavail > 0 THEN 'unavailable' ELSE 'verified' END,
      'detail', CASE WHEN v_n = 0 THEN 'no signature is recorded on this version — nothing to verify'
                     ELSE format('%s signature(s): %s', v_n, (SELECT string_agg(format('%s %s%s', left(e ->> 'signature_id', 8), upper(e ->> 'outcome'), coalesce(' — ' || (e ->> 'reason'), '')), '; ') FROM jsonb_array_elements(p_signatures) e)) END,
      'examined', jsonb_build_object('signatures', p_signatures));
  ELSE
    IF p_signatures IS NOT NULL AND jsonb_typeof(p_signatures) <> 'null' THEN
      RAISE EXCEPTION 'trust verification rejected (signatures): only the signature facet carries the verifier''s outcomes; % is computed by the server', p_facet USING ERRCODE = '22023';
    END IF;
    v := graph.px_facet(p_tenant, p_domain, o, graph.explain(p_tenant, p_domain, p_type, p_id, p_version), p_facet, clock_timestamp());
    IF v ->> 'outcome' = 'not_checked' THEN
      v := v || jsonb_build_object('outcome', 'unavailable', 'detail', 'nothing to verify — ' || (v ->> 'detail'));
    END IF;
  END IF;
  INSERT INTO graph.trust_verifications (verification_id, scope, tenant_id, domain_id, subject_type, subject_id, subject_version, subject_digest, facet, outcome, detail, examined,
                                         rule_version, verifier, request_id, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_type, p_id, p_version, o.content_digest, p_facet, v ->> 'outcome', left(v ->> 'detail', 4000), coalesce(v -> 'examined', '{}'::jsonb),
          graph.px_envelope_rule(), v_actor, p_request_id, p_correlation)
  RETURNING * INTO r;
  PERFORM governance.ledger(p_tenant, p_domain, 'trust_verification', r.verification_id, p_version, 'trust.verified', v_actor,
                            jsonb_build_object('subject', p_type || ':' || p_id || '@' || p_version, 'facet', p_facet, 'outcome', r.outcome), p_correlation);
  RETURN graph.px_verification_row(r) || jsonb_build_object('replayed', false);
END $$;
REVOKE ALL ON FUNCTION graph.verify_trust(uuid, uuid, uuid, text, uuid, int, text, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.verify_trust(uuid, uuid, uuid, text, uuid, int, text, jsonb, uuid, uuid) TO eye_commit;

/* The producers of a product version (the people who made it): its accountable owner, the people named on it (human_refs), and — for a
   decision package version — the human authors of recommendations on it. The attester is none of them (the 0042 separation copied). */
CREATE OR REPLACE FUNCTION graph.px_producers(o objects.canonical_objects) RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = graph, pg_catalog, pg_temp AS $$
  SELECT coalesce(array_agg(DISTINCT u) FILTER (WHERE u IS NOT NULL), '{}') FROM (
    SELECT graph.pv_owner(o.accountable_owner) u
    UNION ALL SELECT CASE WHEN h.v ~* '^(principal:)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN regexp_replace(h.v, '^principal:', '')::uuid END
      FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(o.human_refs) = 'array' THEN o.human_refs ELSE '[]'::jsonb END) h(v)
    UNION ALL SELECT r.author_principal_id FROM decision.recommendations r
      WHERE o.object_type = 'DPK' AND r.package_id = o.object_id AND r.version = o.object_version AND r.author_kind = 'human' AND r.tenant_id = o.tenant_id) s
$$;
REVOKE ALL ON FUNCTION graph.px_producers(objects.canonical_objects) FROM PUBLIC;

/* ATTEST (graph.trust.attest): a named person records that they inspected the named facets of this version, against the envelope digest
   they read. NEVER an approval: nothing reads an attestation to admit a command. Refused: an agent (actor); a role outside the attesters
   (authority); the producer or the owner (separation_of_duties); a changed envelope (stale — read it again); the same person's standing
   attestation of the same facets of the same version (duplicate). */
CREATE OR REPLACE FUNCTION graph.attest_trust(p_request_id uuid, p_tenant uuid, p_domain uuid, p_type text, p_id uuid, p_version int, p_facets text[], p_statement text,
                                              p_envelope_digest text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, objects, observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; o objects.canonical_objects; a graph.trust_attestations%ROWTYPE; v_env jsonb; v_facets text[];
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.trust.attest']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := graph.px_actor('trust attestation', p_actor, p_tenant, p_domain, graph.px_attesters(), 'attesting what was inspected of a product');
  IF p_request_id IS NULL OR p_correlation IS NULL THEN
    RAISE EXCEPTION 'trust attestation rejected (request): an attestation carries its request id and its correlation' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO a FROM graph.trust_attestations t WHERE t.request_id = p_request_id;
  IF FOUND THEN
    IF a.attested_by IS DISTINCT FROM v_actor OR a.subject_id IS DISTINCT FROM p_id OR a.subject_version IS DISTINCT FROM p_version THEN
      RAISE EXCEPTION 'trust attestation rejected (duplicate): request % already recorded another act; a new attestation takes a new request id', p_request_id USING ERRCODE = '23505';
    END IF;
    RETURN graph.px_attestation_row(a) || jsonb_build_object('replayed', true);
  END IF;
  o := graph.px_subject('trust attestation', p_tenant, p_domain, p_type, p_id, p_version);
  IF v_actor = ANY (graph.px_producers(o)) THEN
    RAISE EXCEPTION 'trust attestation rejected (separation_of_duties): an attestation is never made by the product''s producer or owner — an independent person inspects it' USING ERRCODE = '42501';
  END IF;
  SELECT array_agg(DISTINCT f ORDER BY f) INTO v_facets FROM unnest(coalesce(p_facets, '{}')) f;
  IF v_facets IS NULL OR NOT (v_facets <@ graph.px_facets()) THEN
    RAISE EXCEPTION 'trust attestation rejected (facets): an attestation names the facets inspected, among %', array_to_string(graph.px_facets(), ', ') USING ERRCODE = '22023';
  END IF;
  IF p_statement IS NULL OR length(btrim(p_statement)) < 16 OR length(btrim(p_statement)) > 2000 THEN
    RAISE EXCEPTION 'trust attestation rejected (statement): the statement says what was inspected and how, in 16 to 2000 characters' USING ERRCODE = '22023';
  END IF;
  IF p_envelope_digest IS NULL OR p_envelope_digest !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'trust attestation rejected (digest): an attestation names the envelope digest the attester read (64 hex)' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('graph.trust.attest:' || p_id::text || '@' || p_version, 0));
  v_env := graph.trust_envelope(p_tenant, p_domain, p_type, p_id, p_version);
  IF v_env ->> 'digest' IS DISTINCT FROM p_envelope_digest THEN
    RAISE EXCEPTION 'trust attestation rejected (stale): the trust envelope of % changed since it was read (now %…) — read it again before attesting', p_type || ':' || p_id || '@' || p_version, left(v_env ->> 'digest', 12) USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM graph.trust_attestations t WHERE t.subject_id = p_id AND t.subject_version = p_version AND t.attested_by = v_actor AND t.facets = v_facets AND t.tenant_id = p_tenant
               AND NOT EXISTS (SELECT 1 FROM graph.trust_attestation_events w WHERE w.attestation_id = t.attestation_id AND w.event = 'trust.attestation_withdrawn')) THEN
    RAISE EXCEPTION 'trust attestation rejected (duplicate): your attestation of these facets of this version stands — withdraw it first to record another' USING ERRCODE = '23505';
  END IF;
  INSERT INTO graph.trust_attestations (attestation_id, scope, tenant_id, domain_id, subject_type, subject_id, subject_version, subject_digest, envelope_digest, facets, statement,
                                        attested_by, request_id, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_type, p_id, p_version, o.content_digest, p_envelope_digest, v_facets, btrim(p_statement), v_actor, p_request_id, p_correlation)
  RETURNING * INTO a;
  INSERT INTO graph.trust_attestation_events (event_id, scope, tenant_id, domain_id, attestation_id, event, actor_principal_id, details, request_id, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, a.attestation_id, 'trust.attested', v_actor,
          jsonb_build_object('subject', p_type || ':' || p_id || '@' || p_version, 'facets', to_jsonb(v_facets), 'envelope_digest', p_envelope_digest,
                             'indeterminate', v_env -> 'indeterminate'), gen_random_uuid(), p_correlation);
  RETURN graph.px_attestation_row(a) || jsonb_build_object('replayed', false, 'indeterminate_when_attested', v_env -> 'indeterminate');
END $$;
REVOKE ALL ON FUNCTION graph.attest_trust(uuid, uuid, uuid, text, uuid, int, text[], text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.attest_trust(uuid, uuid, uuid, text, uuid, int, text[], text, text, uuid, uuid) TO eye_commit;

/* WITHDRAW one's own attestation (graph.trust.withdraw), with the reason; the attestation stays on record, marked withdrawn. */
CREATE OR REPLACE FUNCTION graph.withdraw_trust_attestation(p_request_id uuid, p_tenant uuid, p_domain uuid, p_attestation uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, objects, observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; a graph.trust_attestations%ROWTYPE; e graph.trust_attestation_events%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.trust.withdraw']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := graph.px_actor('trust attestation', p_actor, p_tenant, p_domain, graph.px_attesters(), 'withdrawing an attestation');
  IF p_request_id IS NULL OR p_correlation IS NULL THEN
    RAISE EXCEPTION 'trust attestation rejected (request): a withdrawal carries its request id and its correlation' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO e FROM graph.trust_attestation_events w WHERE w.request_id = p_request_id;
  IF FOUND THEN
    IF e.actor_principal_id IS DISTINCT FROM v_actor OR e.attestation_id IS DISTINCT FROM p_attestation OR e.event <> 'trust.attestation_withdrawn' THEN
      RAISE EXCEPTION 'trust attestation rejected (duplicate): request % already recorded another act', p_request_id USING ERRCODE = '23505';
    END IF;
    SELECT * INTO a FROM graph.trust_attestations t WHERE t.attestation_id = p_attestation;
    RETURN graph.px_attestation_row(a) || jsonb_build_object('replayed', true);
  END IF;
  SELECT * INTO a FROM graph.trust_attestations t WHERE t.attestation_id = p_attestation AND t.tenant_id = p_tenant AND t.domain_id = p_domain;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'trust attestation rejected (unknown_attestation): no attestation % in this domain', coalesce(p_attestation::text, '<none>') USING ERRCODE = '23503';
  END IF;
  IF a.attested_by IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'trust attestation rejected (actor): an attestation is withdrawn only by the person who made it' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(btrim(p_reason)) > 2000 THEN
    RAISE EXCEPTION 'trust attestation rejected (reason): a withdrawal says why, in 8 to 2000 characters' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM graph.trust_attestation_events w WHERE w.attestation_id = p_attestation AND w.event = 'trust.attestation_withdrawn') THEN
    RAISE EXCEPTION 'trust attestation rejected (state): the attestation is already withdrawn' USING ERRCODE = '23514';
  END IF;
  INSERT INTO graph.trust_attestation_events (event_id, scope, tenant_id, domain_id, attestation_id, event, actor_principal_id, reason, details, request_id, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_attestation, 'trust.attestation_withdrawn', v_actor, btrim(p_reason),
          jsonb_build_object('subject', a.subject_type || ':' || a.subject_id || '@' || a.subject_version), p_request_id, p_correlation);
  RETURN graph.px_attestation_row(a) || jsonb_build_object('replayed', false);
END $$;
REVOKE ALL ON FUNCTION graph.withdraw_trust_attestation(uuid, uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.withdraw_trust_attestation(uuid, uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

-- §PX.9 THE INVESTIGATION (an attention item of the class `trust_investigation`) ─────────────────────────────────────────────────────────
/* THE VOCABULARY, WIDENED BY UNION (0120 §TL's idiom): the class list and the CHECK are read as they stand and re-stated with the class
   appended — so every earlier widening is kept. The subject kind `canonical_object` exists since 0120 §TL. */
DO $$
DECLARE v_classes text[]; v_def text; v_vals text[];
BEGIN
  v_classes := executive.attention_signal_classes();
  IF NOT ('trust_investigation' = ANY (v_classes)) THEN
    v_classes := v_classes || ARRAY['trust_investigation'];   -- B82 px: the trust investigation (UX-57-003)
    EXECUTE format('CREATE OR REPLACE FUNCTION executive.attention_signal_classes() RETURNS text[] LANGUAGE sql IMMUTABLE AS $f$ SELECT ARRAY[%s] $f$',
                   (SELECT string_agg(quote_literal(c), ', ' ORDER BY n) FROM unnest(v_classes) WITH ORDINALITY u(c, n)));
  END IF;
  SELECT pg_get_constraintdef(c.oid) INTO v_def FROM pg_constraint c WHERE c.conrelid = 'executive.attention_items'::regclass AND c.conname = 'attention_items_signal_class_check';
  SELECT array_agg(r.m[1] ORDER BY r.n) INTO v_vals FROM regexp_matches(v_def, '''([^'']+)''', 'g') WITH ORDINALITY r(m, n);
  IF NOT ('trust_investigation' = ANY (v_vals)) THEN
    v_vals := v_vals || ARRAY['trust_investigation'];
    ALTER TABLE executive.attention_items DROP CONSTRAINT attention_items_signal_class_check;
    EXECUTE format('ALTER TABLE executive.attention_items ADD CONSTRAINT attention_items_signal_class_check CHECK (signal_class IN (%s))',
                   (SELECT string_agg(quote_literal(c), ', ' ORDER BY n) FROM unnest(v_vals) WITH ORDINALITY u(c, n)));
  END IF;
END $$;

/* OPEN AN INVESTIGATION (graph.trust.investigate): a named person asks the product's owner to investigate its trust — optionally one facet
   — with a note. ONE item per (product version, facet) while open: a repeat answers the item it made (`repeated`). Owned by the accountable
   owner when that owner is an active person of the tenant (else the knowledge owner and the data steward are routed), evaluated under the
   domain's ACTIVE attention policy (no rule for the class: abstained → deprioritized, still visible and owned). The envelope as read is kept
   in the item. Nothing in the product changes. */
CREATE OR REPLACE FUNCTION graph.open_trust_investigation(p_item_id uuid, p_tenant uuid, p_domain uuid, p_type text, p_id uuid, p_version int, p_facet text, p_note text,
                                                          p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, executive, identity, governance, observation, objects, public, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; o objects.canonical_objects; v_env jsonb; v_cause uuid; v_owner uuid; x executive.attention_items%ROWTYPE; pol executive.attention_policies%ROWTYPE;
        v_eval jsonb; v_route jsonb; v_state text; v_ref text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.trust.investigate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := graph.px_actor('trust investigation', p_actor, p_tenant, p_domain, graph.px_investigators(), 'opening a trust investigation');
  IF p_item_id IS NULL OR p_correlation IS NULL THEN
    RAISE EXCEPTION 'trust investigation rejected (request): the request names its item id and its correlation' USING ERRCODE = '22023';
  END IF;
  IF p_facet IS NOT NULL AND NOT (p_facet = ANY (graph.px_facets() || ARRAY['provenance'])) THEN
    RAISE EXCEPTION 'trust investigation rejected (facet): the facet is one of %, provenance — or none (the whole envelope)', array_to_string(graph.px_facets(), ', ') USING ERRCODE = '22023';
  END IF;
  IF p_note IS NULL OR length(btrim(p_note)) < 8 OR length(p_note) > 2000 THEN
    RAISE EXCEPTION 'trust investigation rejected (reason): the request says what the owner should investigate (8 to 2000 characters)' USING ERRCODE = '22023';
  END IF;
  o := graph.px_subject('trust investigation', p_tenant, p_domain, p_type, p_id, p_version);
  v_ref := p_type || ':' || p_id || '@' || p_version;
  v_cause := md5('trust:' || v_ref || '|' || coalesce(p_facet, '*'))::uuid;
  SELECT * INTO x FROM executive.attention_items i WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.signal_class = graph.px_attention_class() AND i.subject_id = p_id
     AND i.cause_event_id = v_cause AND i.state NOT IN ('closed', 'resolved');
  IF FOUND THEN
    RETURN jsonb_build_object('item_id', x.item_id, 'repeated', true, 'state', x.state, 'outcome', x.outcome, 'owner', x.owner_principal_id, 'route_roles', to_jsonb(x.route_roles),
                              'ref', v_ref, 'facet', p_facet, 'title', x.title);
  END IF;
  v_env := graph.trust_envelope(p_tenant, p_domain, p_type, p_id, p_version);
  v_owner := graph.pv_owner(o.accountable_owner);
  v_owner := CASE WHEN v_owner IS NOT NULL AND EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = v_owner AND p.kind = 'human' AND p.status = 'active' AND (p.tenant_id = p_tenant OR p.scope = 'PLATFORM')) THEN v_owner END;
  SELECT * INTO pol FROM executive.attention_policies a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.state = 'active';
  v_eval := executive.evaluate_attention(CASE WHEN pol.policy_id IS NULL THEN NULL ELSE pol.rules END, graph.px_attention_class(),
                                         jsonb_build_object('consequence', 'C2', 'confidence', 1)) || jsonb_build_object('policy_version', pol.version);
  v_route := executive.attention_route(pol.rules, graph.px_attention_class(), v_eval ->> 'outcome', v_owner, p_tenant, p_domain);
  v_state := v_route ->> 'state';
  INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state,
                                         owner_principal_id, route_roles, policy_id, policy_version, evaluation, details, due_at, escalations, correlation_id)
  VALUES (p_item_id, 'DOMAIN', p_tenant, p_domain, graph.px_attention_class(), 'canonical_object', p_id, v_cause, 'TrustInvestigationOpened',
          left(format('Investigate the trust of %s v%s%s: %s', p_type, p_version, coalesce(' (' || p_facet || ')', ''), btrim(p_note)), 512),
          v_eval ->> 'outcome', v_state, v_owner,
          CASE WHEN v_owner IS NULL AND jsonb_array_length(coalesce(v_route -> 'route_roles', '[]'::jsonb)) = 0 THEN ARRAY['knowledge_owner', 'data_steward']
               ELSE ARRAY(SELECT jsonb_array_elements_text(v_route -> 'route_roles')) END,
          pol.policy_id, pol.version, v_eval,
          jsonb_build_object('ref', v_ref, 'type', p_type, 'id', p_id, 'version', p_version, 'facet', p_facet, 'note', btrim(p_note), 'requested_by', v_actor,
                             'accountable_owner', o.accountable_owner, 'envelope_digest', v_env ->> 'digest', 'indeterminate', v_env -> 'indeterminate',
                             'reasons', v_env -> 'reasons', 'strength', v_env #>> '{provenance,strength}', 'rule_version', graph.px_envelope_rule()),
          (v_route ->> 'due_at')::timestamptz, (v_route ->> 'escalations')::int, p_correlation);
  PERFORM executive.attention_event(p_item_id, p_tenant, p_domain,
            CASE v_state WHEN 'open' THEN 'item.routed' WHEN 'escalated' THEN 'item.escalated' WHEN 'unrouted' THEN 'item.unrouted' ELSE 'item.deprioritized' END,
            v_actor, jsonb_build_object('outcome', v_eval ->> 'outcome', 'reasons', v_eval -> 'reasons', 'policy_version', pol.version, 'owner', v_owner, 'route_roles', v_route -> 'route_roles',
                                        'due_at', v_route -> 'due_at', 'cause_event_id', v_cause, 'cause_event_type', 'TrustInvestigationOpened', 'facet', p_facet), p_correlation);
  SELECT * INTO x FROM executive.attention_items i WHERE i.item_id = p_item_id;
  RETURN jsonb_build_object('item_id', x.item_id, 'repeated', false, 'state', x.state, 'outcome', x.outcome, 'owner', x.owner_principal_id, 'route_roles', to_jsonb(x.route_roles),
                            'ref', v_ref, 'facet', p_facet, 'title', x.title, 'envelope_digest', v_env ->> 'digest', 'evaluation', v_eval);
END $$;
REVOKE ALL ON FUNCTION graph.open_trust_investigation(uuid, uuid, uuid, text, uuid, int, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.open_trust_investigation(uuid, uuid, uuid, text, uuid, int, text, text, uuid, uuid) TO eye_commit;

-- §PX.10 THE TRUST AND GOVERNANCE WORKSPACE'S READ (WS-18, /graph/trust) ─────────────────────────────────────────────────────────────────
/* p_scope (every member optional): `types` (object types of the products listed; default DPK, BRF, FCT, SIM), `limit` (products, 1–25,
   default 12), `days` (the window of the counts, 1–365, default 30). Each product's provenance strength is computed (graph.explain per
   product — bounded by `limit`); the rest are counts and lists of what is recorded: models (gateway calls by model, prompt and runtime with
   their outcomes and whether the weights digest is recorded), agents (agent runs by kind and version with their outcomes), data rights
   (the rights terms of the domain by state), policy denials (by action), exceptions (gate overrides in force), open contest (knowledge and
   simulation challenges, appeals), trust investigations, attestations, verifications. STABLE; the caller's scope first. */
CREATE OR REPLACE FUNCTION graph.trust_overview(p_tenant uuid, p_domain uuid, p_scope jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, objects, observation, pg_catalog, pg_temp AS $$
DECLARE v_scope jsonb := coalesce(p_scope, '{}'::jsonb); v_types text[] := ARRAY['DPK', 'BRF', 'FCT', 'SIM']; v_limit int := 12; v_days int := 30; v_since timestamptz; v_now timestamptz := clock_timestamp();
        v_products jsonb := '[]'::jsonb; o record; s jsonb; v_models jsonb; v_agents jsonb; v_rights jsonb; v_denials jsonb; v_exc jsonb; v_contest jsonb; v_inv jsonb; v_att jsonb; v_ver jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the trust and governance overview');
  IF jsonb_typeof(v_scope) <> 'object' OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_scope) k WHERE k NOT IN ('types', 'limit', 'days')) THEN
    RAISE EXCEPTION 'provenance rejected (overview_scope): the overview is asked by types, limit and days only' USING ERRCODE = '22023';
  END IF;
  IF v_scope ? 'types' THEN
    IF jsonb_typeof(v_scope -> 'types') <> 'array' OR jsonb_array_length(v_scope -> 'types') NOT BETWEEN 1 AND 12
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_scope -> 'types') e WHERE jsonb_typeof(e) <> 'string' OR (e #>> '{}') !~ '^[A-Z]{3}$') THEN
      RAISE EXCEPTION 'provenance rejected (overview_scope): types is a list of 1 to 12 object types (three capitals)' USING ERRCODE = '22023';
    END IF;
    SELECT array_agg(e #>> '{}') INTO v_types FROM jsonb_array_elements(v_scope -> 'types') e;
  END IF;
  IF v_scope ? 'limit' THEN
    IF jsonb_typeof(v_scope -> 'limit') <> 'number' OR (v_scope ->> 'limit') !~ '^[0-9]+$' OR (v_scope ->> 'limit')::int NOT BETWEEN 1 AND 25 THEN
      RAISE EXCEPTION 'provenance rejected (overview_scope): limit is 1 to 25 products' USING ERRCODE = '22023';
    END IF;
    v_limit := (v_scope ->> 'limit')::int;
  END IF;
  IF v_scope ? 'days' THEN
    IF jsonb_typeof(v_scope -> 'days') <> 'number' OR (v_scope ->> 'days') !~ '^[0-9]+$' OR (v_scope ->> 'days')::int NOT BETWEEN 1 AND 365 THEN
      RAISE EXCEPTION 'provenance rejected (overview_scope): days is 1 to 365' USING ERRCODE = '22023';
    END IF;
    v_days := (v_scope ->> 'days')::int;
  END IF;
  v_since := v_now - make_interval(days => v_days);
  -- the products: the latest version of the most recently recorded products of the asked types, each with its provenance strength
  FOR o IN SELECT * FROM (SELECT DISTINCT ON (c.object_id) c.object_type, c.object_id, c.object_version, c.recorded_at, c.lifecycle_state, c.truth_state, c.accountable_owner,
                  left(coalesce(c.payload ->> 'title', c.payload ->> 'statement', c.payload ->> 'subject', c.payload ->> 'label', c.object_type || ' ' || c.object_id::text), 160) AS title
             FROM objects.canonical_objects c WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.object_type = ANY (v_types)
            ORDER BY c.object_id, c.object_version DESC) z ORDER BY z.recorded_at DESC, z.object_id LIMIT v_limit LOOP
    s := graph.px_strength_of(p_tenant, p_domain, graph.explain(p_tenant, p_domain, o.object_type, o.object_id, o.object_version::int));
    v_products := v_products || jsonb_build_object('ref', o.object_type || ':' || o.object_id || '@' || o.object_version, 'type', o.object_type, 'id', o.object_id, 'version', o.object_version,
      'title', o.title, 'lifecycle', o.lifecycle_state, 'truth_state', o.truth_state, 'owner', o.accountable_owner, 'recorded_at', graph.pv_iso(o.recorded_at),
      'strength', s ->> 'strength', 'reasons', s -> 'reasons',
      'attestations', (SELECT count(*) FROM graph.trust_attestations a WHERE a.subject_id = o.object_id AND a.subject_version = o.object_version AND a.tenant_id = p_tenant
                         AND NOT EXISTS (SELECT 1 FROM graph.trust_attestation_events w WHERE w.attestation_id = a.attestation_id AND w.event = 'trust.attestation_withdrawn')));
  END LOOP;
  SELECT coalesce(jsonb_agg(jsonb_build_object('model', q.model_id, 'prompt_version', q.prompt_version, 'runtime_version', q.runtime_version, 'calls', q.n, 'outcomes', q.outcomes,
             'weights_digest_recorded', q.digested, 'last_at', graph.pv_iso(q.last_at)) ORDER BY q.n DESC, q.model_id), '[]'::jsonb) INTO v_models FROM (
    SELECT r.model_id, r.prompt_version, r.runtime_version, sum(r.n)::int n, jsonb_object_agg(r.outcome, r.n) outcomes, bool_and(r.digested) digested, max(r.last_at) last_at FROM (
      SELECT g.model_id, g.prompt_version, g.runtime_version, coalesce(g.outcome, 'unrecorded') outcome, count(*) n, bool_and(coalesce(g.model_weights_digest, '') <> '') digested, max(g.occurred_at) last_at
        FROM intelligence.gateway_calls g WHERE g.tenant_id = p_tenant AND g.domain_id = p_domain AND g.occurred_at >= v_since GROUP BY 1, 2, 3, 4) r
     GROUP BY 1, 2, 3 ORDER BY sum(r.n) DESC LIMIT 25) q;
  SELECT coalesce(jsonb_agg(jsonb_build_object('agent', q.agent_kind, 'version', q.agent_version, 'runs', q.n, 'outcomes', q.outcomes, 'last_at', graph.pv_iso(q.last_at)) ORDER BY q.n DESC, q.agent_kind), '[]'::jsonb) INTO v_agents FROM (
    SELECT r.agent_kind, r.agent_version, sum(r.n)::int n, jsonb_object_agg(r.outcome, r.n) outcomes, max(r.last_at) last_at FROM (
      SELECT ar.agent_kind, ar.agent_version, coalesce(ar.outcome, 'running') outcome, count(*) n, max(ar.started_at) last_at FROM executive.agent_runs ar
       WHERE ar.tenant_id = p_tenant AND ar.domain_id = p_domain AND ar.started_at >= v_since GROUP BY 1, 2, 3) r GROUP BY 1, 2 LIMIT 25) q;
  SELECT jsonb_build_object('in_force', count(*) FILTER (WHERE observation.rt_state(t, v_now) = 'in_force'), 'expired', count(*) FILTER (WHERE observation.rt_state(t, v_now) = 'expired'),
                            'withdrawn', count(*) FILTER (WHERE observation.rt_state(t, v_now) = 'withdrawn'),
                            'not_in_force', coalesce(jsonb_agg(observation.rt_json(t, v_now)) FILTER (WHERE observation.rt_state(t, v_now) <> 'in_force'), '[]'::jsonb))
    INTO v_rights FROM (SELECT DISTINCT ON (r.source_id, r.contract_version) r.* FROM observation.rights_terms r WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain
                         ORDER BY r.source_id, r.contract_version, r.version DESC) t;
  SELECT coalesce(jsonb_agg(jsonb_build_object('action', q.action, 'decision', q.decision, 'count', q.n, 'last_at', graph.pv_iso(q.last_at), 'last_reason', q.reason) ORDER BY q.n DESC, q.action), '[]'::jsonb) INTO v_denials FROM (
    SELECT d.action, d.decision, count(*) n, max(d.created_at) last_at, (array_agg(left(d.reason, 200) ORDER BY d.created_at DESC))[1] reason FROM policy.policy_decisions d
     WHERE d.tenant_id = p_tenant AND (d.domain_id = p_domain OR d.domain_id IS NULL) AND d.decision IN ('deny', 'indeterminate') AND d.created_at >= v_since
     GROUP BY d.action, d.decision ORDER BY count(*) DESC LIMIT 25) q;
  SELECT coalesce(jsonb_agg(jsonb_build_object('override_id', g.override_id, 'package', 'DPK:' || g.package_id || '@' || g.version, 'kind', g.kind, 'granted_by', g.granted_by,
             'granted_at', graph.pv_iso(g.granted_at), 'expires_at', graph.pv_iso(g.expires_at), 'review_due_at', graph.pv_iso(g.review_due_at), 'reviewed', g.reviewed_at IS NOT NULL,
             'rationale', left(g.rationale, 300)) ORDER BY g.granted_at DESC), '[]'::jsonb) INTO v_exc
    FROM decision.gate_overrides g WHERE g.tenant_id = p_tenant AND g.domain_id = p_domain AND (g.expires_at IS NULL OR g.expires_at > v_now);
  SELECT jsonb_build_object(
    'knowledge_challenges', (SELECT coalesce(jsonb_agg(jsonb_build_object('challenge_id', k.challenge_id, 'subject', k.subject_type || ':' || k.subject_id || '@' || k.subject_version, 'state', k.state,
                               'opened_at', graph.pv_iso(k.opened_at), 'grounds', left(k.grounds, 200)) ORDER BY k.opened_at DESC), '[]'::jsonb)
                               FROM (SELECT * FROM graph.knowledge_challenges k0 WHERE k0.tenant_id = p_tenant AND k0.domain_id = p_domain AND k0.state IN ('open', 'under_review') ORDER BY k0.opened_at DESC LIMIT 25) k),
    'simulation_challenges', (SELECT count(*) FROM simulation.challenges sc WHERE sc.tenant_id = p_tenant AND sc.domain_id = p_domain AND sc.state IN ('open', 'rerun_requested')),
    'appeals', (SELECT count(*) FROM decision.appeal_cases ac WHERE ac.tenant_id = p_tenant AND ac.domain_id = p_domain AND ac.state IN ('opened', 'under_review'))) INTO v_contest;
  SELECT coalesce(jsonb_agg(jsonb_build_object('item_id', i.item_id, 'ref', i.details ->> 'ref', 'facet', i.details ->> 'facet', 'state', i.state, 'owner', i.owner_principal_id,
             'route_roles', to_jsonb(i.route_roles), 'title', i.title, 'opened_at', graph.pv_iso(i.created_at)) ORDER BY i.created_at DESC), '[]'::jsonb) INTO v_inv
    FROM (SELECT * FROM executive.attention_items i0 WHERE i0.tenant_id = p_tenant AND i0.domain_id = p_domain AND i0.signal_class = graph.px_attention_class() ORDER BY i0.created_at DESC LIMIT 25) i;
  SELECT coalesce(jsonb_agg(graph.px_attestation_row(a) ORDER BY a.attested_at DESC), '[]'::jsonb) INTO v_att
    FROM (SELECT * FROM graph.trust_attestations a0 WHERE a0.tenant_id = p_tenant AND a0.domain_id = p_domain ORDER BY a0.attested_at DESC LIMIT 25) a;
  SELECT coalesce(jsonb_agg(graph.px_verification_row(t) ORDER BY t.verified_at DESC), '[]'::jsonb) INTO v_ver
    FROM (SELECT * FROM graph.trust_verifications t0 WHERE t0.tenant_id = p_tenant AND t0.domain_id = p_domain ORDER BY t0.verified_at DESC LIMIT 25) t;
  RETURN jsonb_build_object(
    'products', v_products, 'models', v_models, 'agents', v_agents, 'rights', v_rights, 'policy_denials', v_denials, 'exceptions', v_exc, 'contest', v_contest,
    'investigations', v_inv, 'attestations', v_att, 'verifications', v_ver,
    'window', jsonb_build_object('days', v_days, 'since', graph.pv_iso(v_since)), 'types', to_jsonb(v_types), 'limit', v_limit,
    'statement', 'Facets and records, never a trust score: each product''s provenance strength with its reasons, and the models, agents, rights, denials, exceptions, contest, investigations, attestations and verifications as recorded. An attestation is a person''s statement of inspection, never an approval.',
    'rule_version', graph.px_envelope_rule(), 'strength_rule', graph.px_strength_rule(), 'as_of', graph.pv_iso(v_now));
END $$;
REVOKE ALL ON FUNCTION graph.trust_overview(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.trust_overview(uuid, uuid, jsonb) TO eye_app, eye_commit;
