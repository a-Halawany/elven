-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0123 — CP-6 B40: THE SOURCE PLATFORM — the source registry, contract stewardship, rights lifecycle and revocation impact (F-P1-01); the
-- evidence vault's authenticity, evidence attributes and obligation inheritance (F-P1-02); intake inspection, quarantine and the intake review
-- queue (F-P1-03); acquisition-time policy — rate, backoff, robots, licence, residency, window (F-P1-04); the isolated connector cell, the
-- published adapter SDK and the egress gateway (F-P1-12). 0001–0122 are applied or committed and untouched.
--
-- §0 PRELUDE (the integrator): what the parts would otherwise each declare, declared ONCE —
--   §0.1 THE VOCABULARIES, widened in one place (every CHECK below keeps every value it had; the historic rows satisfy each new CHECK):
--        observation.source_contracts_current.connector_kind     + adapter (an SRC@v4 contract binding an approved adapter package, §CR)
--        observation.source_contract_events.event                 + contract.rights_changed, contract.evaluated, contract.stewardship_changed,
--                                                                   contract.customer_approved, contract.requalification_required,
--                                                                   contract.requalified, contract.credential_rotated
--        observation.acquisition_incomplete_ranges.reason_class   + rate_limited, window_closed, robots_disallowed, residency_refused — and
--                                                                   observation.stream_incomplete (0084, its only writer's check) re-declared WHOLE
--        observation.quarantine_current.reason_class              its FIRST CHECK: every historic value (path_traversal, expansion_limit,
--                                                                   entry_limit, compression_ratio, malformed_archive, type_mismatch, oversize —
--                                                                   the content verdict classes — and schema_drift) plus active_content, macro,
--                                                                   embedded_file, hidden_instruction, malware_verdict, inspection_unavailable,
--                                                                   inspection_failed, inspection_incomplete, duplicate, quality, rights,
--                                                                   policy_prohibited, residency_conflict, destination_identity_changed,
--                                                                   unknown_signer, response_anomaly; NULL stays admitted
--        observation.custody_events.event                         + custody.inspected, custody.authenticity_recorded
--        observation.source_impact_markers                        + cause (health — the default, every existing row — | rights)
--        observation.inspection_outcome (a DOMAIN, new)           clean | detected | unavailable | failed | incomplete — DESIGN D2: ONLY clean
--                                                                   admits; §IN's verdict ledger types its outcome with it
--   §0.2 THE USE-REFUSAL STUBS (DESIGN D4, D6): objects._lineage_usable re-declared WHOLE, once, from its last definition (0121:942, B82 ev),
--        adding ONE call per evidence version it already walks — observation._b40_use_refusal(tenant, domain, evd, version, state), which
--        dispatches to observation._rg_use_refusal (§RG: rights) and observation._va_use_refusal (§VA: authenticity). Both return NULL here:
--        nothing new is refused until the parts replace their stub WHOLE (same signature, volatility, security, grants).
--   §0.3 SRC@v4 in objects.schema_registry — the combined contract schema (source-contract.ts SrcV4*: acquisition_policy, authenticity,
--        content_policy, economics, stewardship, evidence_attributes; adapter for the adapter kind). v1–v3 untouched, no back-fill (D8).
--   No role (D14), no permission, no binding, no object type; the PDP rules are TypeScript (pdp.service.ts, the `/* B40 <part> */` blocks
--   reserved before the `observation.` collection prefix rule, D15).
--
-- THE PARTS, each in its own section of this file at the fold (their own files 0123_b40_x_<part>.sql while they are built):
--   §RG  registry, stewardship, rights lifecycle     source_candidates (+ events), source_evaluations, change_rights, rights_revocation_impact,
--        and revocation impact                        source_change_impact, the customer approval; _rg_use_refusal (replacing §0's stub)
--   §VA  vault authenticity, attributes, inheritance publisher_keys (+ events), evidence_authenticity, evidence_attributes, transformation
--                                                     rules (+ events), objects.inherited_obligations, graph.ev_evidence_state and
--                                                     graph.provenance_strength re-declared WHOLE (only §VA), _va_use_refusal (replacing §0's stub)
--   §IN  inspection, quarantine, the review queue    inspection_verdicts (outcome observation.inspection_outcome; the engine identity — image
--                                                     digest, engine version, signature-database versions / build times / digests), upload
--                                                     approvals (+ events), duplicate links, quality scores, close_quarantine_case re-declared WHOLE
--   §AP  acquisition-time policy                     acquisition_authorizations, the robots cache
--   §CR  the connector cell, the SDK, the gateway    adapter_packages (+ events), egress_receipts, connector_requalifications (+ events),
--                                                     credential rotations; transition_contract re-declared WHOLE
-- FOLDED in the order §0, §RG, §VA, §IN, §AP, §CR (§AC has no SQL).
--
-- THE PRINCIPLES (binding on every part): connectivity is not authority; a v1–v3 contract behaves exactly as before (D8); a scan that is not
-- clean never admits (D2); a failed signature is admitted MARKED and refused at decision-active use, an unknown signer quarantined (D6);
-- withdrawn rights — the source contract's OR the rights terms' — refuse decision-active use through the lineage from current state, a read
-- stays possible (D4, D9); no header field, no back-fill — side ledgers only (D11, D22); every approval is a second person, never an agent.
-- THREE CLAIMS: construction (this migration and its harnesses); demonstrated operation (the act — SYNTHETIC personas, `claim =
-- 'demonstration'`); real acceptance (B111's shared recording path, then H3/R2) — never claimed.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §0.1 THE VOCABULARIES ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE observation.source_contracts_current DROP CONSTRAINT source_contracts_current_connector_kind_check,
  ADD CONSTRAINT source_contracts_current_connector_kind_check CHECK (connector_kind IN ('upload', 'rss', 'rest', 'adapter'));

ALTER TABLE observation.source_contract_events DROP CONSTRAINT source_contract_events_event_check,
  ADD CONSTRAINT source_contract_events_event_check CHECK (event IN (
    'contract.registered', 'contract.approved', 'contract.activated', 'contract.suspended', 'contract.reactivated', 'contract.retired',
    'contract.superseded', 'contract.rejected',
    -- B40 §0
    'contract.rights_changed', 'contract.evaluated', 'contract.stewardship_changed', 'contract.customer_approved',
    'contract.requalification_required', 'contract.requalified', 'contract.credential_rotated'));

ALTER TABLE observation.acquisition_incomplete_ranges DROP CONSTRAINT acquisition_incomplete_ranges_reason_class_check,
  ADD CONSTRAINT acquisition_incomplete_ranges_reason_class_check CHECK (reason_class IN (
    'publisher_gap', 'quarantined', 'interrupted', 'budget', 'refused',
    'rate_limited', 'window_closed', 'robots_disallowed', 'residency_refused'));   -- B40 §0 (§AP)

ALTER TABLE observation.quarantine_current ADD CONSTRAINT q_current_reason_class CHECK (reason_class IS NULL OR reason_class IN (
    -- historic: the content verdict classes (content-controls.ts ContentVerdictClass) and the declared-schema check
    'path_traversal', 'expansion_limit', 'entry_limit', 'compression_ratio', 'malformed_archive', 'type_mismatch', 'oversize', 'schema_drift',
    -- B40 §0: §IN (content policy, engines, the review reasons), §VA (unknown signer), §AP (rights, residency, response anomaly), §CR (identity)
    'active_content', 'macro', 'embedded_file', 'hidden_instruction', 'malware_verdict', 'inspection_unavailable', 'inspection_failed',
    'inspection_incomplete', 'duplicate', 'quality', 'rights', 'policy_prohibited', 'residency_conflict', 'destination_identity_changed',
    'unknown_signer', 'response_anomaly',
    -- B40 integration (§IN, SP-22): an upload HELD for a second person's approval — not prohibited by policy, waiting for a person (§IN built
    -- it on policy_prohibited; the integrator gives it its own class). The CHECK is new in 0123, so every historic row stays valid.
    'approval_required'));

ALTER TABLE observation.custody_events DROP CONSTRAINT custody_events_event_check,
  ADD CONSTRAINT custody_events_event_check CHECK (event IN (
    'custody.acquired', 'custody.quarantined', 'custody.verified', 'custody.candidate_verified', 'custody.admitted', 'custody.finalized',
    'custody.retrieved', 'custody.tombstoned', 'custody.integrity_failed', 'custody.archived', 'custody.exported', 'custody.restored',
    'custody.delivered', 'custody.revocation_notified', 'custody.imported', 'custody.retrieval_degraded',
    'custody.inspected', 'custody.authenticity_recorded',      -- B40 §0 (§IN, §VA)
    'custody.quarantine_closed'));                            -- B40 integration (§AC's finding): a rejected or expired case's custody chain ends in its own entry

-- the cause of an impact marker: a source's HEALTH (every marker so far, B22/B24/B28) or its RIGHTS (§RG's withdrawal, D4)
ALTER TABLE observation.source_impact_markers ADD COLUMN cause text NOT NULL DEFAULT 'health' CONSTRAINT sim_cause CHECK (cause IN ('health', 'rights'));

-- the scan outcome of one engine on one item (DESIGN D2): ONLY clean admits; detected, unavailable, failed and incomplete fail closed
CREATE DOMAIN observation.inspection_outcome AS text CHECK (VALUE IN ('clean', 'detected', 'unavailable', 'failed', 'incomplete'));
COMMENT ON DOMAIN observation.inspection_outcome IS 'B40 §0 (DESIGN D2): one engine''s scan outcome on one item — clean | detected | unavailable | failed | incomplete. Only clean admits; an unavailable, failed or incomplete scan is never a clean verdict (fail closed → quarantine).';

-- observation.stream_incomplete — 0084:685 (B23), its LAST definition, copied WHOLE; the one change is the widened class list (marked B40 §0)
-- Internal: one explicit incomplete range, and its ledger row.
CREATE OR REPLACE FUNCTION observation.stream_incomplete(
  p_stream observation.acquisition_streams, p_run uuid, p_from text, p_to text, p_class text, p_detail text, p_seq int, p_correlation uuid
) RETURNS uuid
SECURITY DEFINER SET search_path = observation, public, pg_catalog, pg_temp AS $$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
  IF p_class IS NULL OR p_class NOT IN ('publisher_gap', 'quarantined', 'interrupted', 'budget', 'refused', 'rate_limited', 'window_closed', 'robots_disallowed', 'residency_refused') THEN   -- B40 §0: + rate_limited, window_closed, robots_disallowed, residency_refused
    RAISE EXCEPTION 'acquisition stream rejected (range): % is not an incomplete-range class (publisher_gap | quarantined | interrupted | budget | refused | rate_limited | window_closed | robots_disallowed | residency_refused)',
      coalesce(p_class, '<none>') USING ERRCODE = '22023';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_from = '' OR p_to = '' OR p_from > p_to THEN
    RAISE EXCEPTION 'acquisition stream rejected (range): an incomplete range names its bounds in order (from %, to %)',
      coalesce(p_from, '<none>'), coalesce(p_to, '<none>') USING ERRCODE = '22023';
  END IF;
  INSERT INTO observation.acquisition_incomplete_ranges (
    range_id, scope, tenant_id, domain_id, stream_id, source_id, range_from, range_to, reason_class, detail,
    declared_seq, declared_by_run, correlation_id
  ) VALUES (v_id, 'DOMAIN', p_stream.tenant_id, p_stream.domain_id, p_stream.stream_id, p_stream.source_id, p_from, p_to,
            p_class, left(coalesce(nullif(p_detail, ''), p_class), 1000), p_seq, p_run, p_correlation);
  PERFORM observation.stream_event(p_stream, p_run, 'range.incomplete', p_seq,
    jsonb_build_object('range_id', v_id, 'range_from', p_from, 'range_to', p_to, 'reason_class', p_class, 'detail', left(coalesce(p_detail, ''), 1000)),
    p_correlation);
  RETURN v_id;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.stream_incomplete(observation.acquisition_streams, uuid, text, text, text, text, int, uuid) FROM PUBLIC;

-- §0.2 THE USE-REFUSAL STUBS ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- INTERNAL (the 0120 §0.1 hook idiom): STABLE, invoker, a fixed search path, no runtime grant — reachable only from objects._lineage_usable,
-- itself reached only from the SECURITY DEFINER ports (option, publication, export, gate), which run as the owner. Each answers NULL (no
-- refusal) or { "class": <class>, "detail": <text> }; _lineage_usable raises `object use rejected (<class>): …` (22023 → 409, mapped centrally:
-- observation-errors.ts B40 §0). The class is one of the declared ones — the dispatcher refuses any other (a part cannot invent a refusal class
-- the central mapping does not know).
--
-- §RG fills observation._rg_use_refusal (DESIGN D4, the owner's word): evidence acquired under REVOKED rights is refused at a decision-active
-- use, from CURRENT database state, with BOTH rights sources counted — p_contract_rights_state, the rights_state of the source CONTRACT
-- version the evidence was admitted under (graph.ev_evidence_state's `contract_rights_state`), AND p_terms_rights_state, the rights-TERMS
-- records' state (0121's terms-derived `rights_state`, which _lineage_usable already refuses as rights_expired when expired / withdrawn).
-- An in-force terms record never bypasses a separately revoked applicable contract, and vice versa. Its class: rights_withdrawn.
-- §VA fills observation._va_use_refusal (DESIGN D6): an evidence version recorded authenticity FAILED is refused at a decision-active use (it
-- stays admitted and readable, shown weak). Its class: authenticity_failed.
CREATE OR REPLACE FUNCTION observation._rg_use_refusal(p_tenant uuid, p_domain uuid, p_evd uuid, p_version int,
                                                       p_source uuid, p_contract_version int,
                                                       p_contract_rights_state text, p_terms_rights_state text) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = observation, pg_catalog, pg_temp AS $$
BEGIN
  -- B40 §0: the stub. §RG replaces this function WHOLE (D4: the contract's rights AND the rights terms, both from current state).
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION observation._rg_use_refusal(uuid, uuid, uuid, int, uuid, int, text, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION observation._va_use_refusal(p_tenant uuid, p_domain uuid, p_evd uuid, p_version int) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = observation, pg_catalog, pg_temp AS $$
BEGIN
  -- B40 §0: the stub. §VA replaces this function WHOLE (D6: authenticity_failed refused at a decision-active use).
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION observation._va_use_refusal(uuid, uuid, uuid, int) FROM PUBLIC;

-- the dispatcher — §0's, never re-declared by a part: the evidence state _lineage_usable already computed (graph.ev_evidence_state) names the
-- source, the contract version and both rights states; the first refusal wins (rights before authenticity)
CREATE OR REPLACE FUNCTION observation._b40_use_refusal(p_tenant uuid, p_domain uuid, p_evd uuid, p_version int, p_state jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = observation, pg_catalog, pg_temp AS $$
DECLARE r jsonb;
BEGIN
  r := observation._rg_use_refusal(p_tenant, p_domain, p_evd, p_version,
         (p_state #>> '{evidence,source_id}')::uuid, (p_state #>> '{evidence,contract_version}')::int,
         p_state ->> 'contract_rights_state', p_state ->> 'rights_state');
  IF r IS NULL THEN r := observation._va_use_refusal(p_tenant, p_domain, p_evd, p_version); END IF;
  IF r IS NOT NULL AND (r ->> 'class' IS NULL OR r ->> 'class' NOT IN ('rights_withdrawn', 'authenticity_failed')) THEN
    RAISE EXCEPTION 'B40 use refusal: % is not a declared refusal class (rights_withdrawn | authenticity_failed)', coalesce(r ->> 'class', '<none>') USING ERRCODE = 'XX000';
  END IF;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION observation._b40_use_refusal(uuid, uuid, uuid, int, jsonb) FROM PUBLIC;

-- objects._lineage_usable — 0121:942 (B82 ev), its LAST definition, copied WHOLE (signature, STABLE, invoker, search path, grants); the one
-- addition, marked `-- B40 §0`, is the dispatcher's call per evidence version AFTER every existing check (refusals only added)
/* THE HOOK — §PV's stub (0120 §0.1) re-declared WHOLE: the same signature, STABLE, invoker, the same search path; read-only. Consequential use
   (a package option, a publication, a gate act) and EXPORT refuse a product whose current mark is UNFIT, or one resting — through the
   provenance agent's constructed edges, eight steps at most — on a version whose current mark is unfit. No mark is no refusal: the hook reads
   the governed record, it never evaluates (a STABLE caller cannot record what an evaluation finds).
   B82 ev (UX-26-004): AFTER the B50 checks, unchanged, the EVIDENCE the use rests on — the object itself (an EVD), a claim's lineage evidence,
   the header's evidence_refs, the constructed upstream (the same eight steps) — is refused when its bytes failed integrity after the last
   verified custody (integrity_failed), when its tier's root was unreachable at the last retrieval or the bytes were governed-deleted
   (inaccessible), or when the rights terms of its source contract version expired or were withdrawn (rights_expired). Refusals only added.
   B40 §0: then observation._b40_use_refusal — §RG's rights_withdrawn (the contract's rights or the terms', D4) and §VA's authenticity_failed
   (D6); NULL in §0. */
CREATE OR REPLACE FUNCTION objects._lineage_usable(p_type text, p_id uuid, p_version int, p_use text) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = objects, pg_catalog, pg_temp AS $$
DECLARE m record;
        o record; ev record; st jsonb;   -- B82 ev
        r jsonb;                         -- B40 §0
BEGIN
  -- B50 pv: the product's own current mark
  SELECT fm.mark_id, fm.verdict, fm.reasons, fm.route, fm.marked_at INTO m FROM graph.product_fitness_marks fm
   WHERE fm.object_id = p_id AND fm.object_version = p_version ORDER BY fm.marked_at DESC, fm.mark_id DESC LIMIT 1;
  IF FOUND AND m.verdict = 'unfit' THEN
    RAISE EXCEPTION 'object use rejected (unfit): % % v% is marked unfit (%) by mark % at %; it is not used for %; the mark routed it to %',
      p_type, p_id, p_version, array_to_string(m.reasons, ', '), m.mark_id, to_char(m.marked_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), p_use, m.route USING ERRCODE = '22023';
  END IF;
  -- B50 pv: an upstream version (the constructed lineage edges) whose current mark is unfit
  WITH RECURSIVE up(id, version, depth, path) AS (
    SELECT e.upstream_id, e.upstream_version, 1, ARRAY[e.upstream_id::text || '@' || e.upstream_version] FROM graph.provenance_edges e WHERE e.dependent_id = p_id AND e.dependent_version = p_version
    UNION
    SELECT e.upstream_id, e.upstream_version, u.depth + 1, u.path || (e.upstream_id::text || '@' || e.upstream_version) FROM up u JOIN graph.provenance_edges e ON e.dependent_id = u.id AND e.dependent_version = u.version
     WHERE u.depth < 8 AND NOT ((e.upstream_id::text || '@' || e.upstream_version) = ANY (u.path)))
  SELECT x.mark_id, x.object_type, x.object_id, x.object_version, x.reasons, x.route INTO m
    FROM (SELECT DISTINCT u.id, u.version FROM up u) u2
    CROSS JOIN LATERAL (SELECT fm.* FROM graph.product_fitness_marks fm WHERE fm.object_id = u2.id AND fm.object_version = u2.version ORDER BY fm.marked_at DESC, fm.mark_id DESC LIMIT 1) x
   WHERE x.verdict = 'unfit' ORDER BY x.marked_at, x.mark_id LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'object use rejected (unfit): % % v% rests on % % v%, marked unfit (%) by mark %; it is not used for % until the upstream mark is lifted (routed to %)',
      p_type, p_id, p_version, m.object_type, m.object_id, m.object_version, array_to_string(m.reasons, ', '), m.mark_id, p_use, m.route USING ERRCODE = '22023';
  END IF;
  -- B82 ev: the evidence this use rests on (the object itself, a claim's lineage evidence, the header's evidence_refs, the constructed upstream)
  SELECT x.tenant_id, x.domain_id, x.evidence_refs INTO o FROM objects.canonical_objects x                                         -- B82 ev
   WHERE x.object_type = p_type AND x.object_id = p_id AND x.object_version = p_version LIMIT 1;                                    -- B82 ev
  IF FOUND AND o.tenant_id IS NOT NULL AND o.domain_id IS NOT NULL THEN                                                            -- B82 ev
    FOR ev IN                                                                                                                      -- B82 ev
      WITH RECURSIVE up(id, version, type, depth, path) AS (
        SELECT e.upstream_id, e.upstream_version, e.upstream_type, 1, ARRAY[e.upstream_id::text || '@' || e.upstream_version] FROM graph.provenance_edges e WHERE e.dependent_id = p_id AND e.dependent_version = p_version
        UNION
        SELECT e.upstream_id, e.upstream_version, e.upstream_type, u.depth + 1, u.path || (e.upstream_id::text || '@' || e.upstream_version) FROM up u JOIN graph.provenance_edges e ON e.dependent_id = u.id AND e.dependent_version = u.version
         WHERE u.depth < 8 AND NOT ((e.upstream_id::text || '@' || e.upstream_version) = ANY (u.path)))
      SELECT DISTINCT y.id, y.version FROM (
        SELECT p_id AS id, p_version AS version WHERE p_type = 'EVD'
        UNION ALL
        SELECT l.evidence_object_id, (SELECT max(e2.object_version) FROM objects.canonical_objects e2 WHERE e2.object_type = 'EVD' AND e2.object_id = l.evidence_object_id
                                         AND e2.tenant_id = o.tenant_id AND e2.domain_id = o.domain_id AND e2.payload ->> 'content_digest' = l.evidence_digest)
          FROM intelligence.claim_lineage l WHERE l.claim_object_id = p_id AND l.claim_version = p_version
        UNION ALL
        SELECT (z.r ->> 'id')::uuid, coalesce((z.r ->> 'version')::int, (SELECT max(e3.object_version) FROM objects.canonical_objects e3 WHERE e3.object_type = 'EVD' AND e3.object_id = (z.r ->> 'id')::uuid
                                                                           AND e3.tenant_id = o.tenant_id AND e3.domain_id = o.domain_id))
          FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(o.evidence_refs) = 'array' THEN o.evidence_refs ELSE '[]'::jsonb END) t(v) CROSS JOIN LATERAL (SELECT graph.pv_ref(t.v) AS r) z
         WHERE z.r ->> 'form' = 'typed' AND z.r ->> 'type' = 'EVD'
        UNION ALL
        SELECT u.id, u.version FROM up u WHERE u.type = 'EVD') y
       WHERE y.id IS NOT NULL AND y.version IS NOT NULL
       LIMIT 200
    LOOP                                                                                                                           -- B82 ev
      st := graph.ev_evidence_state(o.tenant_id, o.domain_id, ev.id, ev.version::int, NULL::int, NULL::int, clock_timestamp());                   -- B82 ev
      IF (st ->> 'integrity_failed')::boolean THEN                                                                                 -- B82 ev
        RAISE EXCEPTION 'object use rejected (integrity_failed): % % v% rests on EVD % v%, whose bytes failed integrity after their last verified custody (%); it is not used for % until the bytes verify again',
          p_type, p_id, p_version, ev.id, ev.version, st ->> 'detail', p_use USING ERRCODE = '22023';
      END IF;
      IF (st ->> 'tombstoned')::boolean OR (st ->> 'unreachable')::boolean THEN                                                     -- B82 ev
        RAISE EXCEPTION 'object use rejected (inaccessible): % % v% rests on EVD % v%, whose bytes cannot be reached (%); it is not used for % while they cannot be verified',
          p_type, p_id, p_version, ev.id, ev.version, st ->> 'detail', p_use USING ERRCODE = '22023';
      END IF;
      IF st ->> 'rights_state' IN ('expired', 'withdrawn') THEN                                                                     -- B82 ev
        RAISE EXCEPTION 'object use rejected (rights_expired): % % v% rests on EVD % v%, whose source''s rights terms are % (%); it is not used for % until rights are declared again',
          p_type, p_id, p_version, ev.id, ev.version, st ->> 'rights_state', st #>> '{rights,expiry_statement}', p_use USING ERRCODE = '22023';
      END IF;
      r := observation._b40_use_refusal(o.tenant_id, o.domain_id, ev.id, ev.version::int, st);                                     -- B40 §0
      IF r IS NOT NULL THEN                                                                                                         -- B40 §0
        RAISE EXCEPTION 'object use rejected (%): % % v% rests on EVD % v%, %; it is not used for %',
          r ->> 'class', p_type, p_id, p_version, ev.id, ev.version, r ->> 'detail', p_use USING ERRCODE = '22023';
      END IF;                                                                                                                       -- B40 §0
    END LOOP;                                                                                                                      -- B82 ev
  END IF;                                                                                                                          -- B82 ev
  RETURN;
END $$;
REVOKE ALL ON FUNCTION objects._lineage_usable(text, uuid, int, text) FROM PUBLIC;

-- §0.3 SRC@v4 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- The v3 schema (0070 §1) plus the six v4 blocks (required) and `adapter` (required exactly for connector_kind adapter); additive.
INSERT INTO objects.schema_registry (object_type, schema_version, json_schema, compatibility) VALUES
('SRC', 'v4', '{
  "$schema": "https://json-schema.org/draft/2020-12/schema", "type": "object", "additionalProperties": false, "required": ["source_key", "name", "publisher", "authority_class", "connector_kind", "acquisition_mode", "data_origin", "identity", "authority_and_rights", "security_and_operations", "lifecycle", "acquisition_policy", "authenticity", "content_policy", "economics", "stewardship", "evidence_attributes"], "allOf": [{"if": {"properties": {"connector_kind": {"const": "adapter"}}, "required": ["connector_kind"]}, "then": {"required": ["adapter"]}, "else": {"not": {"required": ["adapter"]}}}],
  "properties": {
    "source_key": {"type": "string", "minLength": 2, "maxLength": 128},
    "name": {"type": "string", "minLength": 2, "maxLength": 256},
    "publisher": {"type": "string", "minLength": 2, "maxLength": 256},
    "authority_class": {"enum": ["authoritative", "observational"]},
    "connector_kind": {"enum": ["upload", "rss", "rest", "adapter"]},
    "acquisition_mode": {"enum": ["replay", "live"]},
    "data_origin": {"enum": ["real", "synthetic"]},
    "identity": {
      "type": "object", "additionalProperties": false, "required": ["source_identity", "publisher_identity", "endpoints", "scheme_allowlist", "cadence_seconds"],
      "properties": {
        "source_identity": {"type": "string", "minLength": 2},
        "publisher_identity": {"type": "string", "minLength": 2},
        "endpoints": {"type": "array", "items": {"type": "string"}},
        "scheme_allowlist": {"type": "array", "items": {"enum": ["https"]}},
        "cadence_seconds": {"type": "integer", "minimum": 60},
        "jitter_seconds": {"type": "integer", "minimum": 0},
        "collection_window": {"type": ["string", "null"]}
      }
    },
    "authority_and_rights": {
      "type": "object", "additionalProperties": false, "required": ["owner", "steward", "authority", "legal_basis", "rights_state", "licence", "permitted_use", "robots_policy", "purposes", "classification_ceiling", "residency", "retention", "deletion_obligation"],
      "properties": {
        "owner": {"type": "string"},
        "steward": {"type": "string"},
        "attribution": {"type": ["string", "null"], "maxLength": 512},
        "authority": {"type": "string"},
        "legal_basis": {"type": "string"},
        "rights_state": {"enum": ["confirmed", "pending", "withdrawn"]},
        "licence": {"type": "string"},
        "permitted_use": {"type": "array", "items": {"type": "string"}},
        "robots_policy": {"type": "string"},
        "purposes": {"type": "array", "minItems": 1, "items": {"type": "string"}},
        "classification_ceiling": {"type": "string"},
        "residency": {"type": "string"},
        "retention": {"type": "string"},
        "deletion_obligation": {"type": "string"}
      }
    },
    "security_and_operations": {
      "type": "object", "additionalProperties": false, "required": ["credential_ref", "authentication_method", "authenticity_method", "budgets", "expected_schema", "freshness_expectation", "coverage_expectations", "correction_channel"],
      "properties": {
        "credential_ref": {"type": ["string", "null"]},
        "credential_header": {"type": ["string", "null"], "pattern": "^[A-Za-z0-9-]{1,64}$"},
        "authentication_method": {"type": "string"},
        "authenticity_method": {
          "type": "object", "additionalProperties": false, "required": ["transport_endpoint", "byte_integrity", "source_origin", "content_authenticity"],
          "properties": {
            "transport_endpoint": {"type": "string"},
            "byte_integrity": {"type": "string"},
            "source_origin": {"type": "string"},
            "content_authenticity": {"type": "string"}
          }
        },
        "budgets": {
          "type": "object", "additionalProperties": false, "required": ["max_requests_per_run", "max_bytes_per_run", "max_concurrency", "timeout_ms", "max_retries"],
          "properties": {
            "max_requests_per_run": {"type": "integer", "minimum": 1},
            "max_bytes_per_run": {"type": "integer", "minimum": 1},
            "max_concurrency": {"type": "integer", "minimum": 1},
            "timeout_ms": {"type": "integer", "minimum": 100},
            "max_retries": {"type": "integer", "minimum": 0},
            "cost_units": {"type": "number", "minimum": 0}
          }
        },
        "expected_schema": {
          "type": "object", "additionalProperties": false, "required": ["media_types", "required_fields", "drift_tolerance"],
          "properties": {
            "media_types": {"type": "array", "items": {"type": "string"}},
            "required_fields": {"type": "array", "items": {"type": "string"}},
            "drift_tolerance": {"type": "integer", "minimum": 0},
            "max_bytes": {"type": "integer", "minimum": 1}
          }
        },
        "freshness_expectation": {
          "type": "object", "additionalProperties": false, "required": ["threshold_seconds", "expected_interval"],
          "properties": {
            "threshold_seconds": {"type": "integer", "minimum": 1},
            "expected_interval": {"type": "string"}
          }
        },
        "coverage_expectations": {
          "type": "object", "additionalProperties": false, "required": ["universe_version", "denominator_derivation"],
          "properties": {
            "universe_version": {"type": "string"},
            "denominator_derivation": {"type": "string"},
            "expected_items_per_window": {"type": ["integer", "null"]},
            "not_applicable_dimensions": {"type": "array", "items": {"type": "string"}},
            "not_applicable_reason": {"type": ["string", "null"]}
          }
        },
        "correction_channel": {"type": "string"},
        "replay_set": {"type": "string"},
        "backfill": {
          "type": "object", "additionalProperties": false, "required": ["strategy", "endpoint", "from"],
          "properties": {
            "strategy": {"enum": ["period-range", "arcgis-offset"]},
            "endpoint": {"type": "string"},
            "from": {"type": "string", "pattern": "^\\d{4}-\\d{2}-\\d{2}$"},
            "to": {"type": ["string", "null"]},
            "window_days": {"type": "integer", "minimum": 1, "maximum": 3660},
            "start_param": {"type": "string"},
            "end_param": {"type": "string"},
            "page_size": {"type": "integer", "minimum": 1, "maximum": 10000},
            "order_by": {"type": "string"},
            "time_field": {"type": "string"},
            "where": {"type": "string"}
          }
        }
      }
    },
    "lifecycle": {
      "type": "object", "additionalProperties": false, "required": ["contract_version", "effective_from"],
      "properties": {
        "contract_version": {"type": "integer", "minimum": 1},
        "effective_from": {"type": "string"},
        "effective_to": {"type": ["string", "null"]},
        "supersedes_version": {"type": ["integer", "null"]}
      }
    },
    "separation_of_duties": {"type": "object", "additionalProperties": true},
    "acquisition_policy": {
      "type": "object", "additionalProperties": false, "required": ["rate", "backoff", "robots", "window", "residency_check"],
      "properties": {
        "rate": {
          "type": "object", "additionalProperties": false, "required": ["requests", "per_seconds", "burst"],
          "properties": {
            "requests": {"type": "integer", "minimum": 1, "maximum": 100000},
            "per_seconds": {"type": "integer", "minimum": 1, "maximum": 86400},
            "burst": {"type": "integer", "minimum": 1, "maximum": 100000}
          }
        },
        "backoff": {
          "type": "object", "additionalProperties": false, "required": ["schedule_seconds", "max_attempts", "honour_retry_after"],
          "properties": {
            "schedule_seconds": {"type": "array", "minItems": 1, "maxItems": 20, "items": {"type": "integer", "minimum": 1, "maximum": 86400}},
            "max_attempts": {"type": "integer", "minimum": 1, "maximum": 21},
            "honour_retry_after": {"type": "boolean"}
          }
        },
        "robots": {
          "type": "object", "additionalProperties": false, "required": ["mode"],
          "properties": {
            "mode": {"enum": ["evaluate", "not_applicable"]},
            "reason": {"type": ["string", "null"], "maxLength": 1000}
          }
        },
        "window": {
          "type": "object", "additionalProperties": false, "required": ["days", "hours_utc", "blackout"],
          "properties": {
            "days": {"type": "array", "minItems": 1, "maxItems": 7, "uniqueItems": true, "items": {"enum": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]}},
            "hours_utc": {
              "type": "object", "additionalProperties": false, "required": ["from", "to"],
              "properties": {
                "from": {"type": "integer", "minimum": 0, "maximum": 23},
                "to": {"type": "integer", "minimum": 1, "maximum": 24}
              }
            },
            "blackout": {"type": "array", "items": {"type": "object", "additionalProperties": false, "required": ["from", "to", "reason"], "properties": {"from": {"type": "string"}, "to": {"type": "string"}, "reason": {"type": "string", "minLength": 3}}}}
          }
        },
        "residency_check": {"enum": ["enforce", "record"]}
      }
    },
    "authenticity": {
      "type": "object", "additionalProperties": false, "required": ["scheme", "key_refs", "tls_spki_pins"],
      "properties": {
        "scheme": {"enum": ["none", "ed25519_detached", "jws"]},
        "key_refs": {"type": "array", "items": {"type": "string", "minLength": 2, "maxLength": 128}},
        "tls_spki_pins": {"type": "array", "items": {"type": "string", "pattern": "^[A-Za-z0-9+/]{43}=$"}}
      }
    },
    "content_policy": {
      "type": "object", "additionalProperties": false, "required": ["scan_engines", "active_content", "macros", "embedded_files", "hidden_instructions", "auto_admit"],
      "properties": {
        "scan_engines": {"type": "array", "minItems": 1, "uniqueItems": true, "items": {"enum": ["content-inspector", "clamav"]}},
        "active_content": {"enum": ["quarantine", "admit_opaque"]},
        "macros": {"enum": ["quarantine", "admit_opaque"]},
        "embedded_files": {"enum": ["quarantine", "admit_opaque"]},
        "hidden_instructions": {"enum": ["quarantine", "admit_opaque"]},
        "admit_opaque_reason": {"type": ["string", "null"], "maxLength": 1000},
        "auto_admit": {
          "type": "object", "additionalProperties": false, "required": ["mode"],
          "properties": {
            "mode": {"enum": ["never", "within_limits"]},
            "max_bytes": {"type": ["integer", "null"], "minimum": 1},
            "media_types": {"type": "array", "items": {"type": "string"}}
          }
        }
      }
    },
    "economics": {
      "type": "object", "additionalProperties": false, "required": ["cost_per_run", "budget_per_period", "period", "currency", "owner"],
      "properties": {
        "cost_per_run": {"type": "number", "minimum": 0},
        "budget_per_period": {"type": "number", "minimum": 0},
        "period": {"enum": ["day", "week", "month", "quarter", "year"]},
        "currency": {"type": "string", "pattern": "^[A-Z]{3}$"},
        "owner": {"type": "string", "minLength": 2}
      }
    },
    "stewardship": {
      "type": "object", "additionalProperties": false, "required": ["steward", "review_due"],
      "properties": {
        "steward": {"type": "string", "minLength": 2},
        "review_due": {"type": "string", "pattern": "^\\d{4}-\\d{2}-\\d{2}$"}
      }
    },
    "adapter": {
      "type": "object", "additionalProperties": false, "required": ["package_id", "version", "digest"],
      "properties": {
        "package_id": {"type": "string", "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"},
        "version": {"type": "string", "pattern": "^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(-[0-9A-Za-z.-]+)?$"},
        "digest": {"type": "string", "pattern": "^[0-9a-f]{64}$"}
      }
    },
    "evidence_attributes": {
      "type": "object", "additionalProperties": false, "required": ["geographic_scope", "language", "sensitivity"],
      "properties": {
        "geographic_scope": {"type": "array", "minItems": 1, "items": {"type": "string", "minLength": 2}},
        "language": {"type": "string", "pattern": "^(und|[a-z]{2,3}(-[A-Za-z0-9]{2,8})*)$"},
        "sensitivity": {"enum": ["none", "commercial", "personal", "special_category"]}
      }
    }
  }
}'::jsonb, 'additive');


-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §RG — the source registry, contract stewardship, the rights lifecycle and revocation impact (F-P1-01)
-- FOLDED by the integrator from 0123_b40_x_rg.sql (b40/rg), verbatim below unless a line is marked `-- B40 integration`.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0123 §RG — CP-6 B40 part §RG: THE SOURCE REGISTRY, CONTRACT STEWARDSHIP, THE RIGHTS LIFECYCLE AND REVOCATION IMPACT (F-P1-01).
-- Folded into 0123 after §0 (the order §0, §RG, §VA, §IN, §AP, §CR). Applies ALONE on 0001–0122 + 0123 §0 on a fresh database. Nothing
-- applied or committed is edited; every function re-declared here is copied WHOLE from its LAST definition, the change marked `-- B40 rg`.
--
--   §RG.1  the ledgers — source_candidates (+ events: discovery, JRN-02's first stage), source_evaluations (the evaluation record an
--          SRC@v4 approval reads, D5), source_rights_changes (narrow / withdraw / restore, append-only), source_customer_approvals (D13),
--          source_stewardship (versioned), source_incidents (+ events, PER-11: owned by a collection manager). FORCE RLS (the 0121 idiom),
--          SELECT to eye_app / eye_commit, no write grant; append-only where marked.
--   §RG.2  the internals (no grant): the SRC@v4 test, the outstanding withdrawal, THE IMPACT (B28's source_derived_products + the claims
--          through intelligence.claim_lineage + B50's forward impact — options, briefings, publications, strategy dependencies, constructed
--          edges — each with its owner), the owner routing (an attention item to each product's owner), the shared withdrawal.
--   §RG.3  the ports — discovery (propose / decline / promote), evaluation, approve_source re-declared WHOLE (0022:811: an SRC@v4 contract is
--          approved only on a recorded evaluation of that version recommending approval; no version is approved while the source's rights
--          stand withdrawn), observation.change_rights (narrow, withdraw, restore — DESIGN D4), set_rights_state re-declared WHOLE (0022:956:
--          the v1–v3 route re-pointed — a withdrawal through it IS the rights lifecycle's; a lifecycle withdrawal is not lifted by it),
--          the customer approval, stewardship, source incidents.
--   §RG.4  the reads — the registry read (evaluations, customer approvals, rights changes, stewardship, incidents, economics against the
--          run meter, "not recorded before B40" for v1–v3), the candidates, observation.rights_revocation_impact, observation.source_change_impact
--          (CAP-OB-02: the preview before a rights change or a new contract version).
--   §RG.5  observation._rg_use_refusal — §0's stub REPLACED WHOLE (DESIGN D4, the owner's word): evidence is refused at every decision-active
--          use while EITHER rights source of the contract version it was admitted under stands withdrawn — the source CONTRACT's rights
--          (graph.ev_evidence_state's contract_rights_state) or the rights TERMS (its rights_state) — counted from CURRENT database state
--          (the dispatcher's state is computed in the refusing statement; a missing contract state is read again here, never assumed fine).
--   §RG.6  the wiring — observation.mark_source_impact re-declared WHOLE (0088:603: a marker set while the source's rights stand withdrawn, or
--          by an event declaring cause rights, carries cause `rights`; a marker whose cause changes is re-set, never rewritten); and
--          observation.upsert_scheduler_entry re-declared WHOLE (0022:1594: the rights acts may remove and restore a schedule entry).
--
-- REFUSAL NOUNS (the CLASS form `<noun> rejected (<class>): …`; NOT mapped centrally yet — the integrator maps them in observation-errors.ts):
--   `source candidate`, `source evaluation`, `source approval`, `rights change`, `customer approval`, `stewardship`, `source incident`,
--   `source registry` (the reads). Classes: actor / authority / separation_of_duties (42501 → 403) · unknown_* (23503 → 404) · state /
--   stale / duplicate (23514 / 23505 → 409) · the rest (22023 → 422). The use refusal is §0's `object use rejected (rights_withdrawn)` (409,
--   mapped by §0).
-- THREE CLAIMS: CONSTRUCTION (this file and phase6-registry-b40); DEMONSTRATED OPERATION (the act — SYNTHETIC personas, `claim =
-- 'demonstration'`); REAL ACCEPTANCE (B111's shared non-demonstration recording path, then H3/R2) — never claimed here.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §RG.1 THE LEDGERS ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

-- DISCOVERY (JRN-02 "Discover → rights → contract → validate → approve → collect → monitor"): a proposed source — how it was found, its
-- publisher, its terms, the purposes it is proposed for, the proposer's assessment — before any contract exists. Promoted to a DRAFT
-- SRC@v4 contract (registered in the promotion's own transaction) or declined. The row is the candidate's projection; its events are the log.
CREATE TABLE observation.source_candidates (
  candidate_id        uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  name                text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 256),
  publisher           text NOT NULL CHECK (length(btrim(publisher)) BETWEEN 2 AND 256),
  how_found           text NOT NULL CHECK (length(btrim(how_found)) BETWEEN 8 AND 2000),
  terms_url           text CHECK (terms_url IS NULL OR (terms_url ~ '^https://[^[:space:]]{3,}$' AND length(terms_url) <= 2000)),
  proposed_purposes   jsonb NOT NULL CHECK (jsonb_typeof(proposed_purposes) = 'array'),
  assessment          text NOT NULL CHECK (length(btrim(assessment)) BETWEEN 8 AND 4000),
  state               text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'promoted', 'declined')),
  proposed_by         uuid NOT NULL,
  proposed_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  promoted_source_id  uuid,
  promoted_contract_version int,
  decided_by          uuid,
  decided_at          timestamptz,
  decision_reason     text,
  request_id          uuid NOT NULL UNIQUE,
  correlation_id      uuid NOT NULL,
  CONSTRAINT osc_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT osc_promoted CHECK ((state = 'promoted') = (promoted_source_id IS NOT NULL AND promoted_contract_version IS NOT NULL)),
  CONSTRAINT osc_decided CHECK ((state = 'proposed') = (decided_by IS NULL))
);
COMMENT ON TABLE observation.source_candidates IS 'B40 §RG (JRN-02, V00-T-032, V01-T-009): a DISCOVERED source before any contract — how it was found, the publisher, the terms URL, the proposed purposes, the proposer''s assessment; proposed by a domain analyst or collection manager, promoted to a draft SRC@v4 contract (prefilled) or declined. The projection of source_candidate_events.';
CREATE INDEX osc_domain ON observation.source_candidates (tenant_id, domain_id, state, proposed_at DESC);

CREATE TABLE observation.source_candidate_events (
  event_id            uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  candidate_id        uuid NOT NULL REFERENCES observation.source_candidates (candidate_id),
  event               text NOT NULL CHECK (event IN ('candidate.proposed', 'candidate.promoted', 'candidate.declined')),
  actor               uuid NOT NULL,
  occurred_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  details             jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  correlation_id      uuid NOT NULL,
  CONSTRAINT osce_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX osce_candidate ON observation.source_candidate_events (candidate_id, occurred_at);
CREATE TRIGGER osce_append_only BEFORE UPDATE OR DELETE ON observation.source_candidate_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- THE EVALUATION RECORD (DP-09-006, PR-09-001/-002, D5): before approval, a collection manager who did not register the version records the
-- authority, the rights and purpose evidence, the coverage fit against the declared universe, the cost, the risks, the contract tests and a
-- recommendation. An SRC@v4 contract is approved only on the LATEST evaluation of that version recommending approval (approve_source).
CREATE TABLE observation.source_evaluations (
  evaluation_id       uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  source_id           uuid NOT NULL,
  contract_version    int  NOT NULL CHECK (contract_version >= 1),
  authority           text NOT NULL CHECK (length(btrim(authority)) BETWEEN 8 AND 2000),
  rights_evidence     text NOT NULL CHECK (length(btrim(rights_evidence)) BETWEEN 8 AND 2000),
  coverage_fit        text NOT NULL CHECK (length(btrim(coverage_fit)) BETWEEN 8 AND 2000),
  cost                text NOT NULL CHECK (length(btrim(cost)) BETWEEN 2 AND 1000),
  risks               jsonb NOT NULL CHECK (jsonb_typeof(risks) = 'array'),
  contract_tests      jsonb NOT NULL CHECK (jsonb_typeof(contract_tests) = 'array'),
  recommendation      text NOT NULL CHECK (recommendation IN ('approve', 'reject', 'revise')),
  reason              text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  change_impact       jsonb,                                    -- the preview of a version that supersedes another (CAP-OB-02); NULL for a first version
  evaluated_by        uuid NOT NULL,
  evaluated_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  request_id          uuid NOT NULL UNIQUE,
  correlation_id      uuid NOT NULL,
  CONSTRAINT ose_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
COMMENT ON TABLE observation.source_evaluations IS 'B40 §RG (DP-09-006, PR-09-001/-002, D5): the evaluation of one source contract version before approval — authority, rights and purpose evidence, coverage fit, cost, risks, contract tests, a recommendation; by a collection manager who is not the registrar. An SRC@v4 contract is approved only on the latest evaluation recommending approval. Append-only.';
CREATE INDEX ose_version ON observation.source_evaluations (source_id, contract_version, evaluated_at DESC);
CREATE TRIGGER ose_append_only BEFORE UPDATE OR DELETE ON observation.source_evaluations FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- THE RIGHTS LIFECYCLE (L1-C01, FEX-02, R-09, DESIGN D4): every narrowing, withdrawal and restoration of a source's rights, with its reason,
-- its evidence, what it changed on each contract version (and what each was before), the impact it saw, what it opened (a retention action
-- for a declared deletion obligation, a source incident), and — for a restoration — the withdrawal it reverses. History is never rewritten.
CREATE TABLE observation.source_rights_changes (
  change_id           uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  source_id           uuid NOT NULL,
  contract_version    int  NOT NULL CHECK (contract_version >= 1),   -- the version the actor read (the source's latest)
  operation           text NOT NULL CHECK (operation IN ('narrow', 'withdraw', 'restore')),
  via                 text NOT NULL CHECK (via IN ('rights_lifecycle', 'rights_route')),
  reason              text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  evidence            text CHECK (evidence IS NULL OR length(btrim(evidence)) BETWEEN 8 AND 4000),
  purposes_before     jsonb,
  purposes_after      jsonb,
  affected            jsonb NOT NULL CHECK (jsonb_typeof(affected) = 'array'),
  suspended_version   int,
  reactivated_version int,
  deletion_obligation text,
  retention_action_id uuid,
  incident_id         uuid,
  reverses            uuid REFERENCES observation.source_rights_changes (change_id),
  impact              jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(impact) = 'object'),
  attention_items     jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(attention_items) = 'array'),
  actor               uuid NOT NULL,
  recorded_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  request_id          uuid NOT NULL UNIQUE,
  correlation_id      uuid NOT NULL,
  CONSTRAINT osrc_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT osrc_restore_reverses CHECK ((operation = 'restore') = (reverses IS NOT NULL)),
  CONSTRAINT osrc_evidence CHECK (operation = 'narrow' OR evidence IS NOT NULL OR via = 'rights_route')
);
COMMENT ON TABLE observation.source_rights_changes IS 'B40 §RG (L1-C01, FEX-02, R-09, DESIGN D4): the rights lifecycle of a source — narrowed purposes, a withdrawal (every contract version withdrawn, an active one suspended, the schedule removed, the impact recorded, its owners routed, a declared deletion obligation opening a retention action, a source incident opened) and a restoration (the versions a withdrawal withdrew restored to what they were, the suspended version resumed when nothing moved since). Append-only.';
CREATE INDEX osrc_source ON observation.source_rights_changes (tenant_id, domain_id, source_id, recorded_at DESC);
CREATE TRIGGER osrc_append_only BEFORE UPDATE OR DELETE ON observation.source_rights_changes FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- CUSTOMER APPROVAL (DP-09-006, D13): the TENANT's customer sponsor or tenant administrator records the customer's approval of a source's use
-- for the tenant — never the registrar or the approver of that version. A record the admission cites, not a gate on collection; its claim
-- is construction or demonstration (the scope-bound acceptance is B111's, then H3/R2).
CREATE TABLE observation.source_customer_approvals (
  approval_id         uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  source_id           uuid NOT NULL,
  contract_version    int  NOT NULL CHECK (contract_version >= 1),
  decision            text NOT NULL CHECK (decision IN ('approve', 'decline')),
  scope_statement     text NOT NULL CHECK (length(btrim(scope_statement)) BETWEEN 8 AND 1000),
  reason              text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  claim               text NOT NULL CHECK (claim IN ('construction', 'demonstration')),
  approved_by         uuid NOT NULL,
  approved_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  request_id          uuid NOT NULL UNIQUE,
  correlation_id      uuid NOT NULL,
  CONSTRAINT osca_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
COMMENT ON TABLE observation.source_customer_approvals IS 'B40 §RG (DP-09-006, D13): the customer''s approval (or decline) of a source''s use for the tenant, by the tenant''s customer sponsor or tenant administrator — never the registrar or the approver; a record the admission cites, not a gate; claim construction | demonstration (real acceptance is never recorded here). Append-only.';
CREATE INDEX osca_version ON observation.source_customer_approvals (source_id, contract_version, approved_at DESC);
CREATE TRIGGER osca_append_only BEFORE UPDATE OR DELETE ON observation.source_customer_approvals FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- STEWARDSHIP (L1-C01): who stewards the source, in what state, when it is next reviewed — versioned per source.
CREATE TABLE observation.source_stewardship (
  source_id           uuid NOT NULL,
  version             int  NOT NULL CHECK (version >= 1),
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  steward_principal_id uuid NOT NULL,
  state               text NOT NULL CHECK (state IN ('assigned', 'under_review', 'lapsed')),
  review_due          date NOT NULL,
  reason              text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  changed_by          uuid NOT NULL,
  changed_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  request_id          uuid NOT NULL UNIQUE,
  correlation_id      uuid NOT NULL,
  PRIMARY KEY (source_id, version),
  CONSTRAINT oss_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
COMMENT ON TABLE observation.source_stewardship IS 'B40 §RG (L1-C01): the stewardship of a source — the steward (a named data steward or collection manager), the state (assigned | under_review | lapsed) and the review due date; one version per change, by a data steward or collection manager. Append-only.';
CREATE TRIGGER oss_append_only BEFORE UPDATE OR DELETE ON observation.source_stewardship FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- SOURCE INCIDENTS (PER-11: the collection manager owns the operational response): an incident on a source, owned by a collection manager.
CREATE TABLE observation.source_incidents (
  incident_id         uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  source_id           uuid NOT NULL,
  kind                text NOT NULL CHECK (kind IN ('outage', 'rights', 'quality', 'access', 'manipulation', 'other')),
  statement           text NOT NULL CHECK (length(btrim(statement)) BETWEEN 8 AND 2000),
  owner_principal_id  uuid NOT NULL,
  state               text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'resolved')),
  opened_by           uuid NOT NULL,
  opened_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  rights_change_id    uuid,
  resolved_by         uuid,
  resolved_at         timestamptz,
  resolution          text,
  request_id          uuid NOT NULL UNIQUE,
  correlation_id      uuid NOT NULL,
  CONSTRAINT osi_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT osi_resolved CHECK ((state = 'resolved') = (resolved_at IS NOT NULL AND resolved_by IS NOT NULL AND resolution IS NOT NULL))
);
COMMENT ON TABLE observation.source_incidents IS 'B40 §RG (PER-11): an incident on a source (outage, rights, quality, access, manipulation, other), OWNED by a collection manager; opened by a collection manager or domain analyst (a rights withdrawal opens one owned by the withdrawing manager), resolved by its owner or another collection manager. The projection of source_incident_events.';
CREATE INDEX osi_source ON observation.source_incidents (tenant_id, domain_id, source_id, state, opened_at DESC);

CREATE TABLE observation.source_incident_events (
  event_id            uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  incident_id         uuid NOT NULL REFERENCES observation.source_incidents (incident_id),
  event               text NOT NULL CHECK (event IN ('incident.opened', 'incident.resolved')),
  actor               uuid NOT NULL,
  occurred_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  details             jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  correlation_id      uuid NOT NULL,
  CONSTRAINT osie_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX osie_incident ON observation.source_incident_events (incident_id, occurred_at);
CREATE TRIGGER osie_append_only BEFORE UPDATE OR DELETE ON observation.source_incident_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

REVOKE ALL ON observation.source_candidates, observation.source_candidate_events, observation.source_evaluations, observation.source_rights_changes,
              observation.source_customer_approvals, observation.source_stewardship, observation.source_incidents, observation.source_incident_events FROM PUBLIC;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['source_candidates', 'source_candidate_events', 'source_evaluations', 'source_rights_changes', 'source_customer_approvals',
                           'source_stewardship', 'source_incidents', 'source_incident_events'] LOOP
    EXECUTE format('ALTER TABLE observation.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE observation.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY org_isolation ON observation.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON observation.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- §RG.2 THE INTERNALS (no runtime grant; reached only from the definer ports and reads below, which run as the owner) ──────────────────────

/* Is this contract version SRC@v4? — its SRC canonical object's schema (registration admits it as SRC@v4 exactly when it carries the v4
   blocks or the adapter kind: source-contract.ts schemaRefOf). A v1–v3 version keeps every rule it had (D7/D8). */
CREATE OR REPLACE FUNCTION observation._rg_is_v4(p_source uuid, p_contract_version int) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = observation, objects, pg_catalog, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM observation.source_contracts_current s JOIN objects.canonical_objects o
                   ON o.object_type = 'SRC' AND o.object_id = s.src_object_id AND o.object_version = s.src_object_version AND o.tenant_id = s.tenant_id
                  WHERE s.source_id = p_source AND s.contract_version = p_contract_version AND o.schema_ref = 'SRC@v4')
$$;
REVOKE ALL ON FUNCTION observation._rg_is_v4(uuid, int) FROM PUBLIC;

/* The OUTSTANDING withdrawal of a source: its latest withdraw or restore is a withdraw (a row of NULLs otherwise). */
CREATE OR REPLACE FUNCTION observation._rg_outstanding_withdrawal(p_tenant uuid, p_domain uuid, p_source uuid) RETURNS observation.source_rights_changes
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
  SELECT x.* FROM (SELECT c.* FROM observation.source_rights_changes c
                    WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.source_id = p_source AND c.operation IN ('withdraw', 'restore')
                    ORDER BY c.recorded_at DESC, c.change_id DESC LIMIT 1) x
   WHERE x.operation = 'withdraw'
$$;
REVOKE ALL ON FUNCTION observation._rg_outstanding_withdrawal(uuid, uuid, uuid) FROM PUBLIC;

/* A principal in words (the display name, or the id) — for the reads; never an evidence value. */
CREATE OR REPLACE FUNCTION observation._rg_who(p uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN p IS NULL THEN NULL ELSE coalesce(
    (SELECT jsonb_build_object('id', x.id, 'name', x.display_name, 'kind', x.kind) FROM identity.principals x WHERE x.id = p),
    jsonb_build_object('id', p, 'name', NULL, 'kind', NULL)) END
$$;
REVOKE ALL ON FUNCTION observation._rg_who(uuid) FROM PUBLIC;

/* THE IMPACT of a source (FEX-02, PR-09-005, CAP-OB-02): what rests on its evidence today, each with its OWNER —
     evidence   the EVD objects and versions held under each contract version (provenance SRC:<source>@<version>);
     products   B28's observation.source_derived_products (issued forecasts of its series, the open warnings on them, the active scenarios on
                them, the valid runs bound to those scenarios, the active assumptions resting on a claim from its evidence, the packages
                citing any of these) — each with its title, state and owner;
     claims     the claims whose lineage reads the source's evidence (intelligence.claim_lineage) — refs, owner, the evidence they rest on;
                never the claim's content (D9);
     forward    B50's forward impact over the source's evidence (graph.pv_downstream's buckets, taken over the whole set): package options
                citing it, briefings and publications sourced on it, declared strategy dependencies on it, constructed provenance edges;
     owners     every named owner with how many of the above are theirs; markers the source's active impact markers (cause health | rights).
   Bounded: 200 products, 200 claims, 50 per forward bucket — every count is the full count. */
CREATE OR REPLACE FUNCTION observation._rg_impact(p_tenant uuid, p_domain uuid, p_source uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = observation, objects, intelligence, prediction, simulation, decision, graph, executive, identity, pg_catalog, pg_temp AS $$
DECLARE v_ev uuid[]; v_evidence jsonb; v_products jsonb; v_np int; v_claims jsonb; v_nc int; v_forward jsonb; v_owners jsonb; v_markers jsonb; v_name text; v_n int;
BEGIN
  SELECT s.name INTO v_name FROM observation.source_contracts_current s WHERE s.source_id = p_source AND s.tenant_id = p_tenant AND s.domain_id = p_domain ORDER BY s.contract_version DESC LIMIT 1;
  v_ev := ARRAY(SELECT DISTINCT e.object_id FROM objects.canonical_objects e
                  WHERE e.object_type = 'EVD' AND e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.provenance_ref LIKE 'SRC:' || p_source::text || '@%');
  SELECT jsonb_build_object('objects', cardinality(v_ev), 'versions', coalesce(sum(g.n_v), 0),
           'by_contract_version', coalesce(jsonb_agg(jsonb_build_object('contract_version', g.cv, 'objects', g.n_o, 'versions', g.n_v) ORDER BY g.cv), '[]'::jsonb))
    INTO v_evidence
    FROM (SELECT nullif(split_part(e.provenance_ref, '@', 2), '')::int AS cv, count(DISTINCT e.object_id) n_o, count(*) n_v FROM objects.canonical_objects e
           WHERE e.object_type = 'EVD' AND e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.provenance_ref LIKE 'SRC:' || p_source::text || '@%' GROUP BY 1) g;
  -- the derived products (B28), each with its title, state and owner
  WITH d AS (SELECT * FROM observation.source_derived_products(p_tenant, p_domain, p_source)),
       t AS (SELECT d.subject_kind AS kind, d.subject_id AS id, d.via,
                    CASE d.subject_kind
                      WHEN 'forecast' THEN (SELECT coalesce(f.label, f.series_key) FROM prediction.forecasts_current f WHERE f.forecast_id = d.subject_id)
                      WHEN 'warning' THEN (SELECT w.title FROM prediction.warnings_current w WHERE w.warning_id = d.subject_id)
                      WHEN 'scenario' THEN (SELECT s.title FROM prediction.scenarios_current s WHERE s.scenario_id = d.subject_id)
                      WHEN 'run' THEN (SELECT r.run_kind || ' run' || coalesce(' · ' || r.component, '') FROM simulation.runs_current r WHERE r.run_id = d.subject_id)
                      WHEN 'assumption' THEN (SELECT g.title FROM graph.strategy_current g WHERE g.strategy_object_id = d.subject_id)
                      WHEN 'package' THEN (SELECT p.title FROM decision.packages_current p WHERE p.package_id = d.subject_id) END AS title,
                    CASE d.subject_kind
                      WHEN 'forecast' THEN (SELECT f.state FROM prediction.forecasts_current f WHERE f.forecast_id = d.subject_id)
                      WHEN 'warning' THEN (SELECT w.state FROM prediction.warnings_current w WHERE w.warning_id = d.subject_id)
                      WHEN 'scenario' THEN (SELECT s.state FROM prediction.scenarios_current s WHERE s.scenario_id = d.subject_id)
                      WHEN 'run' THEN (SELECT r.state FROM simulation.runs_current r WHERE r.run_id = d.subject_id)
                      WHEN 'assumption' THEN (SELECT g.status FROM graph.strategy_current g WHERE g.strategy_object_id = d.subject_id)
                      WHEN 'package' THEN (SELECT p.state FROM decision.packages_current p WHERE p.package_id = d.subject_id) END AS state,
                    CASE d.subject_kind
                      WHEN 'forecast' THEN (SELECT f.issued_by FROM prediction.forecasts_current f WHERE f.forecast_id = d.subject_id)
                      WHEN 'warning' THEN (SELECT coalesce(w.routed_to, w.raised_by) FROM prediction.warnings_current w WHERE w.warning_id = d.subject_id)
                      WHEN 'scenario' THEN (SELECT s.owner_principal_id FROM prediction.scenarios_current s WHERE s.scenario_id = d.subject_id)
                      WHEN 'run' THEN (SELECT r.operator_principal_id FROM simulation.runs_current r WHERE r.run_id = d.subject_id)
                      WHEN 'assumption' THEN (SELECT g.owner_principal_id FROM graph.strategy_current g WHERE g.strategy_object_id = d.subject_id)
                      WHEN 'package' THEN (SELECT p.owner_principal_id FROM decision.packages_current p WHERE p.package_id = d.subject_id) END AS owner
               FROM d)
  SELECT count(*)::int,
         coalesce((SELECT jsonb_agg(jsonb_build_object('kind', x.kind, 'id', x.id, 'via', x.via, 'title', x.title, 'state', x.state, 'owner', observation._rg_who(x.owner))
                                    ORDER BY x.kind, x.title, x.id) FROM (SELECT * FROM t ORDER BY kind, title, id LIMIT 200) x), '[]'::jsonb)
    INTO v_np, v_products FROM t;
  -- the claims through the lineage (refs and owners only — never the content, D9)
  WITH cl AS (SELECT DISTINCT ON (l.claim_object_id) l.claim_object_id, l.claim_version, l.claim_type, l.evidence_object_id
                FROM intelligence.claim_lineage l
               WHERE l.tenant_id = p_tenant AND l.domain_id = p_domain AND l.evidence_object_id IN (SELECT unnest(v_ev))
               ORDER BY l.claim_object_id, l.claim_version DESC),
       o AS (SELECT cl.*, (SELECT graph.pv_owner(c.accountable_owner) FROM objects.canonical_objects c
                            WHERE c.object_id = cl.claim_object_id AND c.object_version = cl.claim_version AND c.tenant_id = p_tenant AND c.domain_id = p_domain LIMIT 1) AS owner
               FROM cl)
  SELECT count(*)::int,
         coalesce((SELECT jsonb_agg(jsonb_build_object('kind', 'claim', 'type', x.claim_type, 'id', x.claim_object_id, 'version', x.claim_version, 'ref', x.claim_type || ':' || x.claim_object_id || '@' || x.claim_version,
                                                       'evidence_id', x.evidence_object_id, 'owner', observation._rg_who(x.owner)) ORDER BY x.claim_object_id)
                     FROM (SELECT * FROM o ORDER BY claim_object_id LIMIT 200) x), '[]'::jsonb)
    INTO v_nc, v_claims FROM o;
  -- B50's forward impact, taken over the source's whole evidence set
  SELECT jsonb_build_object(
    'options', jsonb_build_object(
       'count', (SELECT count(*) FROM decision.options op WHERE op.tenant_id = p_tenant AND op.domain_id = p_domain
                  AND EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(op.consequences) = 'array' THEN op.consequences ELSE '[]'::jsonb END) c
                               WHERE (c ->> 'id') ~* '^[0-9a-f-]{36}$' AND (c ->> 'id')::uuid IN (SELECT unnest(v_ev)))),
       'items', coalesce((SELECT jsonb_agg(z ORDER BY z ->> 'ref') FROM (
          SELECT jsonb_build_object('kind', 'option', 'ref', 'DPK:' || op.package_id || '@' || op.version, 'package_id', op.package_id, 'version', op.version, 'option', op.key,
                                    'title', (SELECT p.title FROM decision.packages_current p WHERE p.package_id = op.package_id),
                                    'owner', observation._rg_who((SELECT p.owner_principal_id FROM decision.packages_current p WHERE p.package_id = op.package_id))) z
            FROM decision.options op WHERE op.tenant_id = p_tenant AND op.domain_id = p_domain
             AND EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(op.consequences) = 'array' THEN op.consequences ELSE '[]'::jsonb END) c
                          WHERE (c ->> 'id') ~* '^[0-9a-f-]{36}$' AND (c ->> 'id')::uuid IN (SELECT unnest(v_ev)))
           ORDER BY op.package_id, op.version, op.key LIMIT 50) q), '[]'::jsonb)),
    'briefings', jsonb_build_object('items', coalesce((SELECT jsonb_agg(jsonb_build_object('kind', 'briefing', 'ref', 'BRF:' || b.object_id || '@' || b.object_version) ORDER BY b.object_id, b.object_version) FROM (
          SELECT b.object_id, b.object_version FROM objects.canonical_objects b WHERE b.object_type = 'BRF' AND b.tenant_id = p_tenant AND b.domain_id = p_domain
             AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(b.source_object_ids, '[]'::jsonb) || coalesce(b.evidence_refs, '[]'::jsonb)) s
                          WHERE substring(s FROM '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')::uuid IN (SELECT unnest(v_ev)))
           ORDER BY b.object_id, b.object_version LIMIT 50) b), '[]'::jsonb)),
    'publications', jsonb_build_object('items', coalesce((SELECT jsonb_agg(jsonb_build_object('kind', 'publication', 'ref', 'PUB:' || pv.publication_id || ' v' || pv.version, 'state', pv.state) ORDER BY pv.publication_id, pv.version)
          FROM (SELECT pv.* FROM executive.publication_versions pv WHERE pv.tenant_id = p_tenant AND pv.domain_id = p_domain AND pv.source_id IN (SELECT unnest(v_ev))
                 ORDER BY pv.publication_id, pv.version LIMIT 50) pv), '[]'::jsonb)),
    'strategy', jsonb_build_object('items', coalesce((SELECT jsonb_agg(jsonb_build_object('kind', 'strategy_dependency', 'ref', d.dependent_type || ':' || d.dependent_object_id, 'rationale', d.rationale) ORDER BY d.dependent_object_id)
          FROM (SELECT d.* FROM graph.dependencies d WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.state = 'active' AND d.depends_on_id IN (SELECT unnest(v_ev))
                 ORDER BY d.dependent_object_id LIMIT 50) d), '[]'::jsonb)),
    'constructed', jsonb_build_object('count', (SELECT count(*) FROM graph.provenance_edges e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.upstream_id IN (SELECT unnest(v_ev))),
          'items', coalesce((SELECT jsonb_agg(jsonb_build_object('kind', 'constructed', 'ref', e.dependent_type || ':' || e.dependent_id || '@' || e.dependent_version, 'basis', e.basis) ORDER BY e.dependent_id)
          FROM (SELECT e.* FROM graph.provenance_edges e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.upstream_id IN (SELECT unnest(v_ev))
                 ORDER BY e.dependent_id LIMIT 50) e), '[]'::jsonb)))
    INTO v_forward;
  -- the owners (named humans, with how many of the products, claims and options are theirs)
  WITH o AS (SELECT (x ->> 'id')::uuid AS owner FROM jsonb_array_elements(v_products) p CROSS JOIN LATERAL (SELECT p -> 'owner' AS x) y WHERE (y.x ->> 'id') IS NOT NULL
             UNION ALL SELECT (c #>> '{owner,id}')::uuid FROM jsonb_array_elements(v_claims) c WHERE (c #>> '{owner,id}') IS NOT NULL
             UNION ALL SELECT (op #>> '{owner,id}')::uuid FROM jsonb_array_elements(v_forward #> '{options,items}') op WHERE (op #>> '{owner,id}') IS NOT NULL)
  SELECT coalesce(jsonb_agg(observation._rg_who(owner) || jsonb_build_object('items', n) ORDER BY n DESC, owner), '[]'::jsonb) INTO v_owners
    FROM (SELECT owner, count(*) n FROM o GROUP BY owner) g;
  SELECT coalesce(jsonb_agg(jsonb_build_object('marker_id', m.marker_id, 'kind', m.subject_kind, 'id', m.subject_id, 'health_state', m.health_state, 'cause', m.cause, 'set_at', m.set_at) ORDER BY m.set_at, m.marker_id), '[]'::jsonb)
    INTO v_markers FROM observation.source_impact_markers m WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain AND m.source_id = p_source AND m.state = 'active';
  v_n := v_np + v_nc + coalesce((v_forward #>> '{options,count}')::int, 0) + jsonb_array_length(v_forward #> '{briefings,items}') + jsonb_array_length(v_forward #> '{publications,items}')
         + jsonb_array_length(v_forward #> '{strategy,items}') + coalesce((v_forward #>> '{constructed,count}')::int, 0);
  RETURN jsonb_build_object('source_id', p_source, 'source_name', v_name, 'evidence', v_evidence,
    'products', v_products, 'products_count', v_np, 'claims', v_claims, 'claims_count', v_nc, 'forward', v_forward, 'owners', v_owners, 'markers', v_markers,
    'resting', v_n,
    'statement', CASE WHEN v_n = 0 THEN 'nothing rests on it yet: no product, claim, option, briefing, publication or dependency names this source''s evidence'
                      ELSE format('%s product(s), %s claim(s) and %s further reference(s) rest on this source''s evidence (%s evidence object(s))', v_np, v_nc,
                                  v_n - v_np - v_nc, v_evidence ->> 'objects') END);
END $$;
REVOKE ALL ON FUNCTION observation._rg_impact(uuid, uuid, uuid) FROM PUBLIC;

/* ONE ATTENTION ITEM PER RESTING PRODUCT, to its OWNER (PR-09-005's remediation routing; the B82 trust-investigation idiom): class
   source.coverage_loss under the domain's attention policy, the cause the rights change; a product without a named human owner is routed to
   the class's roles. Once per (product, change). Returns what was routed. */
CREATE OR REPLACE FUNCTION observation._rg_route_owners(p_tenant uuid, p_domain uuid, p_source uuid, p_change uuid, p_impact jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, executive, identity, pg_catalog, pg_temp AS $$
DECLARE x jsonb; v_kind text; v_id uuid; v_owner uuid; pol executive.attention_policies%ROWTYPE; v_eval jsonb; v_route jsonb; v_state text; v_item uuid; v_out jsonb := '[]'::jsonb; v_title text;
BEGIN
  SELECT * INTO pol FROM executive.attention_policies a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.state = 'active';
  FOR x IN SELECT e FROM jsonb_array_elements(coalesce(p_impact -> 'products', '[]'::jsonb) || coalesce(p_impact -> 'claims', '[]'::jsonb)) e LOOP
    v_kind := CASE x ->> 'kind' WHEN 'assumption' THEN 'strategy_object' ELSE x ->> 'kind' END;
    IF v_kind NOT IN ('forecast', 'warning', 'scenario', 'run', 'strategy_object', 'package', 'claim') THEN CONTINUE; END IF;
    v_id := (x ->> 'id')::uuid;
    v_owner := (x #>> '{owner,id}')::uuid;
    v_owner := CASE WHEN v_owner IS NOT NULL AND EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = v_owner AND p.kind = 'human' AND p.status = 'active' AND (p.tenant_id = p_tenant OR p.scope = 'PLATFORM')) THEN v_owner END;
    IF EXISTS (SELECT 1 FROM executive.attention_items i WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.signal_class = 'source.coverage_loss' AND i.subject_id = v_id AND i.cause_event_id = p_change) THEN CONTINUE; END IF;
    v_eval := executive.evaluate_attention(CASE WHEN pol.policy_id IS NULL THEN NULL ELSE pol.rules END, 'source.coverage_loss',
                jsonb_build_object('consequence', 'C2', 'confidence', 1, 'hours_to_window', NULL, 'affected_products', 1, 'health_state', 'suspended')) || jsonb_build_object('policy_version', pol.version);
    v_route := executive.attention_route(pol.rules, 'source.coverage_loss', v_eval ->> 'outcome', v_owner, p_tenant, p_domain);
    v_state := v_route ->> 'state';
    v_item := gen_random_uuid();
    v_title := left(format('Rights withdrawn on %s — your %s %s rests on its evidence', coalesce(p_impact ->> 'source_name', p_source::text), replace(x ->> 'kind', '_', ' '),
                           coalesce(x ->> 'title', x ->> 'ref', v_id::text)), 512);
    INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state,
                                           owner_principal_id, route_roles, policy_id, policy_version, evaluation, details, due_at, escalations, correlation_id)
    VALUES (v_item, 'DOMAIN', p_tenant, p_domain, 'source.coverage_loss', v_kind, v_id, p_change, 'SourceRightsWithdrawn', v_title, v_eval ->> 'outcome', v_state, v_owner,
            CASE WHEN v_owner IS NULL AND jsonb_array_length(coalesce(v_route -> 'route_roles', '[]'::jsonb)) = 0 THEN ARRAY['collection_manager']
                 ELSE ARRAY(SELECT jsonb_array_elements_text(v_route -> 'route_roles')) END,
            pol.policy_id, pol.version, v_eval,
            jsonb_build_object('source_id', p_source, 'rights_change_id', p_change, 'cause', 'rights', 'product', x, 'statement', 'the rights of a source this product rests on were withdrawn; its decision-active use is refused until they are restored'),
            (v_route ->> 'due_at')::timestamptz, coalesce((v_route ->> 'escalations')::int, 0), p_correlation);
    PERFORM executive.attention_event(v_item, p_tenant, p_domain,
              CASE v_state WHEN 'open' THEN 'item.routed' WHEN 'escalated' THEN 'item.escalated' WHEN 'unrouted' THEN 'item.unrouted' ELSE 'item.deprioritized' END,
              p_actor, jsonb_build_object('outcome', v_eval ->> 'outcome', 'policy_version', pol.version, 'owner', v_owner, 'route_roles', v_route -> 'route_roles',
                                          'cause_event_id', p_change, 'cause_event_type', 'SourceRightsWithdrawn'), p_correlation);
    v_out := v_out || jsonb_build_object('item_id', v_item, 'kind', x ->> 'kind', 'id', v_id, 'owner', v_owner, 'state', v_state);
  END LOOP;
  RETURN v_out;
END $$;
REVOKE ALL ON FUNCTION observation._rg_route_owners(uuid, uuid, uuid, uuid, jsonb, uuid, uuid) FROM PUBLIC;

/* THE WITHDRAWAL (DESIGN D4) — shared by observation.change_rights and the v1–v3 route (observation.set_rights_state): EVERY contract version
   of the source not already withdrawn is withdrawn (rights_state → withdrawn; an ACTIVE version suspended — fail closed, the 0022 rule),
   each with its contract.rights_changed event (and contract.suspended for the suspension); the schedule entry REMOVED (the route removes the
   Redis job in the same operation); the impact recorded and each resting product's owner routed an attention item; a DECLARED deletion
   obligation opens a B9 retention action (kind deletion, the source's evidence; approved by the retention authority and executed by the
   steward — never here); a source incident (kind rights) opened, owned by the withdrawing collection manager. The caller has checked the
   authority, the scope, the person and the request. */
CREATE OR REPLACE FUNCTION observation._rg_withdraw(p_change uuid, p_request_id uuid, p_tenant uuid, p_domain uuid, p_source uuid, p_named_version int,
                                                    p_reason text, p_evidence text, p_deletion text, p_actor uuid, p_via text, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, retention, pg_catalog, pg_temp AS $$
DECLARE r observation.source_contracts_current%ROWTYPE; v_affected jsonb := '[]'::jsonb; v_suspended int; v_impact jsonb; v_action uuid; v_incident uuid;
        v_items jsonb; v_removed int; v_retention text; v_name text; ch observation.source_rights_changes%ROWTYPE;
BEGIN
  IF (observation._rg_outstanding_withdrawal(p_tenant, p_domain, p_source)).change_id IS NOT NULL THEN
    RAISE EXCEPTION 'rights change rejected (state): the rights of source % are already withdrawn; a restoration lifts the withdrawal', p_source USING ERRCODE = '23514';
  END IF;
  v_impact := observation._rg_impact(p_tenant, p_domain, p_source);
  FOR r IN SELECT * FROM observation.source_contracts_current s WHERE s.source_id = p_source AND s.tenant_id = p_tenant AND s.domain_id = p_domain ORDER BY s.contract_version FOR UPDATE LOOP
    v_name := r.name;
    v_retention := r.contract #>> '{authority_and_rights,retention}';
    IF r.rights_state = 'withdrawn' THEN
      v_affected := v_affected || jsonb_build_object('contract_version', r.contract_version, 'prior_rights', 'withdrawn', 'prior_lifecycle', r.lifecycle_state, 'changed', false);
      CONTINUE;
    END IF;
    UPDATE observation.source_contracts_current
       SET rights_state = 'withdrawn',
           lifecycle_state = CASE WHEN lifecycle_state = 'active' THEN 'suspended' ELSE lifecycle_state END,
           updated_at = clock_timestamp()
     WHERE source_id = r.source_id AND contract_version = r.contract_version;
    INSERT INTO observation.source_contract_events (event_id, scope, tenant_id, domain_id, source_id, contract_version, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, r.source_id, r.contract_version, 'contract.rights_changed', p_actor,
            jsonb_build_object('operation', 'withdraw', 'change_id', p_change, 'from', r.rights_state, 'to', 'withdrawn', 'reason', btrim(p_reason), 'evidence', p_evidence, 'via', p_via,
                               'kind', 'rights_update', 'rights_state', 'withdrawn'), p_correlation);
    IF r.lifecycle_state = 'active' THEN
      -- the v1–v3 route writes its own recorded suspension event (set_rights_state, unchanged); the lifecycle writes this one
      IF p_via <> 'rights_route' THEN
        INSERT INTO observation.source_contract_events (event_id, scope, tenant_id, domain_id, source_id, contract_version, event, actor_principal_id, details, correlation_id)
        VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, r.source_id, r.contract_version, 'contract.suspended', p_actor,
                jsonb_build_object('from', 'active', 'to', 'suspended', 'reason', 'rights withdrawn: ' || btrim(p_reason), 'kind', 'rights_withdrawal', 'change_id', p_change), p_correlation);
      END IF;
      v_suspended := r.contract_version;
    END IF;
    v_affected := v_affected || jsonb_build_object('contract_version', r.contract_version, 'prior_rights', r.rights_state, 'prior_lifecycle', r.lifecycle_state,
                                                   'lifecycle_after', CASE WHEN r.lifecycle_state = 'active' THEN 'suspended' ELSE r.lifecycle_state END, 'changed', true);
  END LOOP;
  IF jsonb_array_length(v_affected) = 0 THEN
    RAISE EXCEPTION 'rights change rejected (unknown_source): source % is not recorded in this domain', p_source USING ERRCODE = '23503';
  END IF;
  -- the schedule: removed (collection is prohibited from this instant; the route removes the Redis job in the same operation)
  UPDATE observation.scheduler_entries SET status = 'removed', removed_at = clock_timestamp()
   WHERE source_id = p_source AND tenant_id = p_tenant AND domain_id = p_domain AND status = 'scheduled';
  GET DIAGNOSTICS v_removed = ROW_COUNT;
  -- a declared deletion obligation opens a B9 retention action over the source's evidence (never executed here)
  IF p_deletion IS NOT NULL AND length(btrim(p_deletion)) > 0 THEN
    IF length(btrim(p_deletion)) < 8 OR length(p_deletion) > 1000 THEN
      RAISE EXCEPTION 'rights change rejected (deletion_obligation): a deletion obligation, when the withdrawal carries one, says what must be deleted and by when (8 to 1000 characters)' USING ERRCODE = '22023';
    END IF;
    v_action := gen_random_uuid();
    INSERT INTO retention.actions_current (action_id, scope, tenant_id, domain_id, kind, target_kind, selector, schedule_id, retention_profile, opened_by, correlation_id)
    VALUES (v_action, 'DOMAIN', p_tenant, p_domain, 'deletion', 'evidence',
            jsonb_build_object('source_id', p_source, 'reason', 'rights withdrawn — the declared deletion obligation: ' || btrim(p_deletion), 'rights_change_id', p_change),
            NULL, v_retention, p_actor, p_correlation);
    PERFORM retention.event(v_action, p_tenant, p_domain, 'action.opened', p_actor,
              jsonb_build_object('kind', 'deletion', 'target_kind', 'evidence', 'selector', jsonb_build_object('source_id', p_source), 'schedule_id', NULL,
                                 'opened_by', 'the rights withdrawal', 'rights_change_id', p_change, 'deletion_obligation', btrim(p_deletion)), p_correlation);
  END IF;
  -- the source incident (PER-11): kind rights, owned by the withdrawing collection manager
  v_incident := gen_random_uuid();
  INSERT INTO observation.source_incidents (incident_id, scope, tenant_id, domain_id, source_id, kind, statement, owner_principal_id, opened_by, rights_change_id, request_id, correlation_id)
  VALUES (v_incident, 'DOMAIN', p_tenant, p_domain, p_source, 'rights', left('Rights withdrawn: ' || btrim(p_reason), 2000), p_actor, p_actor, p_change, gen_random_uuid(), p_correlation);
  INSERT INTO observation.source_incident_events (event_id, scope, tenant_id, domain_id, incident_id, event, actor, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, v_incident, 'incident.opened', p_actor, jsonb_build_object('kind', 'rights', 'rights_change_id', p_change, 'owner', p_actor), p_correlation);
  -- the owners of what rests on it
  v_items := observation._rg_route_owners(p_tenant, p_domain, p_source, p_change, v_impact, p_actor, p_correlation);
  INSERT INTO observation.source_rights_changes (change_id, scope, tenant_id, domain_id, source_id, contract_version, operation, via, reason, evidence, affected, suspended_version,
                                                 deletion_obligation, retention_action_id, incident_id, impact, attention_items, actor, request_id, correlation_id)
  VALUES (p_change, 'DOMAIN', p_tenant, p_domain, p_source, p_named_version, 'withdraw', p_via, btrim(p_reason), nullif(btrim(coalesce(p_evidence, '')), ''), v_affected, v_suspended,
          nullif(btrim(coalesce(p_deletion, '')), ''), v_action, v_incident, v_impact, v_items, p_actor, p_request_id, p_correlation)
  RETURNING * INTO ch;
  RETURN jsonb_build_object('change_id', ch.change_id, 'operation', 'withdraw', 'source_id', p_source, 'source_name', v_name, 'contract_version', p_named_version, 'affected', v_affected,
    'suspended_version', v_suspended, 'schedule', CASE WHEN v_removed > 0 THEN 'removed' ELSE 'none_scheduled' END, 'retention_action_id', v_action, 'incident_id', v_incident,
    'deletion_obligation', ch.deletion_obligation,
    -- B40 integration: what the route announces as RetentionActionDue@v1 (the event an opened action carries — retention.service.ts dueEvent)
    'retention_action', CASE WHEN v_action IS NULL THEN NULL ELSE jsonb_build_object('action_id', v_action, 'kind', 'deletion', 'target_kind', 'evidence',   -- B40 integration
      'selector', jsonb_build_object('source_id', p_source, 'reason', 'rights withdrawn — the declared deletion obligation: ' || btrim(p_deletion), 'rights_change_id', p_change),  -- B40 integration
      'retention_profile', v_retention, 'opened_by', p_actor) END,                                                                          -- B40 integration
    'deletion_statement', CASE WHEN v_action IS NULL THEN 'no deletion obligation was declared with the withdrawal: no retention action was opened'
                               ELSE 'a retention action (deletion of the source''s evidence) was opened; it waits for the retention authority''s approval and is executed by the steward — never automatically' END,
    'impact', v_impact, 'attention_items', v_items, 'recorded_at', ch.recorded_at, 'replayed', false);
END $$;
REVOKE ALL ON FUNCTION observation._rg_withdraw(uuid, uuid, uuid, uuid, uuid, int, text, text, text, uuid, text, uuid) FROM PUBLIC;

-- §RG.3 THE PORTS ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/* The acting principal is the one the route names (never an act on behalf of another). */
CREATE OR REPLACE FUNCTION observation._rg_actor(p_noun text, p_actor uuid) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
DECLARE v uuid := public.eye_principal();
BEGIN
  IF v IS NULL OR p_actor IS NULL OR p_actor IS DISTINCT FROM v THEN
    RAISE EXCEPTION '% rejected (actor): the act is recorded under the acting principal, never on behalf of another', p_noun USING ERRCODE = '42501';
  END IF;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION observation._rg_actor(text, uuid) FROM PUBLIC;

-- DISCOVERY: PROPOSE (a domain analyst or collection manager) ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION observation.propose_source_candidate(
  p_request_id uuid, p_tenant uuid, p_domain uuid, p_name text, p_publisher text, p_how_found text, p_terms_url text, p_purposes jsonb, p_assessment text,
  p_actor uuid, p_correlation uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; c observation.source_candidates%ROWTYPE; v_problem text; v_id uuid := gen_random_uuid();
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.source.discover']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := observation._rg_actor('source candidate', p_actor);
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'source candidate rejected (request): a proposal carries its request id' USING ERRCODE = '22023'; END IF;
  SELECT * INTO c FROM observation.source_candidates x WHERE x.request_id = p_request_id;
  IF FOUND THEN
    IF c.proposed_by IS DISTINCT FROM v_actor OR c.tenant_id IS DISTINCT FROM p_tenant OR c.domain_id IS DISTINCT FROM p_domain THEN
      RAISE EXCEPTION 'source candidate rejected (duplicate): request % already recorded another act; a new proposal takes a new request id', p_request_id USING ERRCODE = '23505';
    END IF;
    RETURN to_jsonb(c) || jsonb_build_object('replayed', true);
  END IF;
  PERFORM governance.assert_approver('source candidate', v_actor, p_tenant, p_domain, ARRAY['domain_analyst', 'collection_manager'], NULL, NULL, 'proposing a discovered source');
  IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 2 AND 256 THEN RAISE EXCEPTION 'source candidate rejected (name): the source is named (2 to 256 characters)' USING ERRCODE = '22023'; END IF;
  IF p_publisher IS NULL OR length(btrim(p_publisher)) NOT BETWEEN 2 AND 256 THEN RAISE EXCEPTION 'source candidate rejected (publisher): the publisher is named (2 to 256 characters)' USING ERRCODE = '22023'; END IF;
  IF p_how_found IS NULL OR length(btrim(p_how_found)) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'source candidate rejected (how_found): how the source was found is stated (8 to 2000 characters)' USING ERRCODE = '22023'; END IF;
  IF p_terms_url IS NOT NULL AND (p_terms_url !~ '^https://[^[:space:]]{3,}$' OR length(p_terms_url) > 2000) THEN RAISE EXCEPTION 'source candidate rejected (terms_url): the terms are an https address, or none yet' USING ERRCODE = '22023'; END IF;
  v_problem := observation.rt_list_problem(p_purposes, 'proposed purposes', 1);
  IF v_problem IS NOT NULL THEN RAISE EXCEPTION 'source candidate rejected (purposes): %', v_problem USING ERRCODE = '22023'; END IF;
  IF p_assessment IS NULL OR length(btrim(p_assessment)) NOT BETWEEN 8 AND 4000 THEN RAISE EXCEPTION 'source candidate rejected (assessment): the proposer''s assessment is stated (8 to 4000 characters)' USING ERRCODE = '22023'; END IF;
  INSERT INTO observation.source_candidates (candidate_id, scope, tenant_id, domain_id, name, publisher, how_found, terms_url, proposed_purposes, assessment, proposed_by, request_id, correlation_id)
  VALUES (v_id, 'DOMAIN', p_tenant, p_domain, btrim(p_name), btrim(p_publisher), btrim(p_how_found), p_terms_url, observation.rt_list(p_purposes), btrim(p_assessment), v_actor, p_request_id, p_correlation)
  RETURNING * INTO c;
  INSERT INTO observation.source_candidate_events (event_id, scope, tenant_id, domain_id, candidate_id, event, actor, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, v_id, 'candidate.proposed', v_actor, jsonb_build_object('name', c.name, 'publisher', c.publisher, 'terms_url', c.terms_url, 'purposes', c.proposed_purposes), p_correlation);
  RETURN to_jsonb(c) || jsonb_build_object('replayed', false);
END $$;
REVOKE ALL ON FUNCTION observation.propose_source_candidate(uuid, uuid, uuid, text, text, text, text, jsonb, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.propose_source_candidate(uuid, uuid, uuid, text, text, text, text, jsonb, text, uuid, uuid) TO eye_commit;

-- DISCOVERY: DECLINE (the proposer, or a collection manager) ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION observation.decline_source_candidate(p_tenant uuid, p_domain uuid, p_candidate uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; c observation.source_candidates%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.source.discover']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := observation._rg_actor('source candidate', p_actor);
  SELECT * INTO c FROM observation.source_candidates x WHERE x.candidate_id = p_candidate AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'source candidate rejected (unknown_candidate): candidate % is not recorded in this domain', p_candidate USING ERRCODE = '23503'; END IF;
  IF c.proposed_by IS DISTINCT FROM v_actor THEN
    PERFORM governance.assert_approver('source candidate', v_actor, p_tenant, p_domain, ARRAY['collection_manager'], NULL, NULL, 'declining another person''s candidate');
  ELSE
    PERFORM governance.assert_approver('source candidate', v_actor, p_tenant, p_domain, ARRAY['domain_analyst', 'collection_manager'], NULL, NULL, 'declining a candidate');
  END IF;
  IF c.state <> 'proposed' THEN RAISE EXCEPTION 'source candidate rejected (state): candidate % is %, only a proposed candidate is declined', p_candidate, c.state USING ERRCODE = '23514'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'source candidate rejected (reason): a decline states its reason (8 to 2000 characters)' USING ERRCODE = '22023'; END IF;
  UPDATE observation.source_candidates SET state = 'declined', decided_by = v_actor, decided_at = clock_timestamp(), decision_reason = btrim(p_reason) WHERE candidate_id = p_candidate RETURNING * INTO c;
  INSERT INTO observation.source_candidate_events (event_id, scope, tenant_id, domain_id, candidate_id, event, actor, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_candidate, 'candidate.declined', v_actor, jsonb_build_object('reason', btrim(p_reason)), p_correlation);
  RETURN to_jsonb(c);
END $$;
REVOKE ALL ON FUNCTION observation.decline_source_candidate(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.decline_source_candidate(uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

-- DISCOVERY: PROMOTE — in the REGISTRATION's own transaction (observation.source.register): the candidate names the draft SRC@v4 contract
-- version the same registrar has just registered from it. ──────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION observation.promote_source_candidate(p_tenant uuid, p_domain uuid, p_candidate uuid, p_source_id uuid, p_contract_version int, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; c observation.source_candidates%ROWTYPE; s observation.source_contracts_current%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.source.register']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := observation._rg_actor('source candidate', p_actor);
  SELECT * INTO c FROM observation.source_candidates x WHERE x.candidate_id = p_candidate AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'source candidate rejected (unknown_candidate): candidate % is not recorded in this domain', p_candidate USING ERRCODE = '23503'; END IF;
  IF c.state <> 'proposed' THEN RAISE EXCEPTION 'source candidate rejected (state): candidate % is %, only a proposed candidate is promoted', p_candidate, c.state USING ERRCODE = '23514'; END IF;
  SELECT * INTO s FROM observation.source_contracts_current x WHERE x.source_id = p_source_id AND x.contract_version = p_contract_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'source candidate rejected (unknown_source): source % v% is not recorded in this domain', p_source_id, p_contract_version USING ERRCODE = '23503'; END IF;
  IF s.lifecycle_state <> 'draft' OR s.registrar_principal_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'source candidate rejected (state): a candidate is promoted to the draft its promoter has just registered (source % v% is %, registered by another)', p_source_id, p_contract_version, s.lifecycle_state USING ERRCODE = '23514';
  END IF;
  IF NOT observation._rg_is_v4(p_source_id, p_contract_version) THEN
    RAISE EXCEPTION 'source candidate rejected (contract): a candidate is promoted to an SRC@v4 contract (the acquisition policy, authenticity, content policy, economics, stewardship and evidence attributes declared)' USING ERRCODE = '22023';
  END IF;
  UPDATE observation.source_candidates SET state = 'promoted', promoted_source_id = p_source_id, promoted_contract_version = p_contract_version, decided_by = v_actor, decided_at = clock_timestamp(),
         decision_reason = 'promoted to a draft SRC@v4 contract' WHERE candidate_id = p_candidate RETURNING * INTO c;
  INSERT INTO observation.source_candidate_events (event_id, scope, tenant_id, domain_id, candidate_id, event, actor, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_candidate, 'candidate.promoted', v_actor, jsonb_build_object('source_id', p_source_id, 'contract_version', p_contract_version, 'source_key', s.source_key), p_correlation);
  RETURN to_jsonb(c);
END $$;
REVOKE ALL ON FUNCTION observation.promote_source_candidate(uuid, uuid, uuid, uuid, int, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.promote_source_candidate(uuid, uuid, uuid, uuid, int, uuid, uuid) TO eye_commit;

-- THE EVALUATION (a collection manager who is not the registrar; never an agent) ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION observation.record_source_evaluation(
  p_request_id uuid, p_tenant uuid, p_domain uuid, p_source_id uuid, p_contract_version int,
  p_authority text, p_rights_evidence text, p_coverage_fit text, p_cost text, p_risks jsonb, p_contract_tests jsonb, p_recommendation text, p_reason text,
  p_actor uuid, p_correlation uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; s observation.source_contracts_current%ROWTYPE; e observation.source_evaluations%ROWTYPE; v_problem text; v_impact jsonb; v_tests jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.source.evaluate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := observation._rg_actor('source evaluation', p_actor);
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'source evaluation rejected (request): an evaluation carries its request id' USING ERRCODE = '22023'; END IF;
  SELECT * INTO e FROM observation.source_evaluations x WHERE x.request_id = p_request_id;
  IF FOUND THEN
    IF e.evaluated_by IS DISTINCT FROM v_actor OR e.source_id IS DISTINCT FROM p_source_id OR e.contract_version IS DISTINCT FROM p_contract_version THEN
      RAISE EXCEPTION 'source evaluation rejected (duplicate): request % already recorded another act; a new evaluation takes a new request id', p_request_id USING ERRCODE = '23505';
    END IF;
    RETURN to_jsonb(e) || jsonb_build_object('replayed', true);
  END IF;
  SELECT * INTO s FROM observation.source_contracts_current x WHERE x.source_id = p_source_id AND x.contract_version = p_contract_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'source evaluation rejected (unknown_source): source % v% is not recorded in this domain', p_source_id, p_contract_version USING ERRCODE = '23503'; END IF;
  -- WHO (D5): a named collection manager — never the registrar of this version, never an agent
  PERFORM governance.assert_approver('source evaluation', v_actor, p_tenant, p_domain, ARRAY['collection_manager'], s.registrar_principal_id, NULL, 'evaluating a source contract');
  IF s.lifecycle_state <> 'draft' THEN
    RAISE EXCEPTION 'source evaluation rejected (state): source % v% is %; a contract is evaluated before its approval (a draft)', p_source_id, p_contract_version, s.lifecycle_state USING ERRCODE = '23514';
  END IF;
  IF p_authority IS NULL OR length(btrim(p_authority)) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'source evaluation rejected (authority): the publisher''s authority is assessed (8 to 2000 characters)' USING ERRCODE = '22023'; END IF;
  IF p_rights_evidence IS NULL OR length(btrim(p_rights_evidence)) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'source evaluation rejected (rights_evidence): the rights and purpose evidence is stated (8 to 2000 characters)' USING ERRCODE = '22023'; END IF;
  IF p_coverage_fit IS NULL OR length(btrim(p_coverage_fit)) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'source evaluation rejected (coverage_fit): the coverage fit against the declared universe is stated (8 to 2000 characters)' USING ERRCODE = '22023'; END IF;
  IF p_cost IS NULL OR length(btrim(p_cost)) NOT BETWEEN 2 AND 1000 THEN RAISE EXCEPTION 'source evaluation rejected (cost): the cost is stated (2 to 1000 characters)' USING ERRCODE = '22023'; END IF;
  v_problem := observation.rt_list_problem(coalesce(p_risks, '[]'::jsonb), 'risks', 0);
  IF v_problem IS NOT NULL THEN RAISE EXCEPTION 'source evaluation rejected (risks): %', v_problem USING ERRCODE = '22023'; END IF;
  IF p_contract_tests IS NULL OR jsonb_typeof(p_contract_tests) <> 'array' OR jsonb_array_length(p_contract_tests) > 50
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_contract_tests) t WHERE jsonb_typeof(t) <> 'object' OR length(btrim(coalesce(t ->> 'name', ''))) NOT BETWEEN 2 AND 200
                  OR coalesce(t ->> 'outcome', '') NOT IN ('pass', 'fail', 'not_run')) THEN
    RAISE EXCEPTION 'source evaluation rejected (contract_tests): the contract tests are a list (at most 50) of { name, outcome: pass | fail | not_run, note }' USING ERRCODE = '22023';
  END IF;
  v_tests := (SELECT coalesce(jsonb_agg(jsonb_build_object('name', btrim(t ->> 'name'), 'outcome', t ->> 'outcome', 'note', nullif(btrim(coalesce(t ->> 'note', '')), '')) ORDER BY o), '[]'::jsonb)
                FROM jsonb_array_elements(p_contract_tests) WITH ORDINALITY AS x(t, o));
  IF p_recommendation IS NULL OR p_recommendation NOT IN ('approve', 'reject', 'revise') THEN RAISE EXCEPTION 'source evaluation rejected (recommendation): the recommendation is approve, reject or revise' USING ERRCODE = '22023'; END IF;
  IF p_recommendation = 'approve' AND EXISTS (SELECT 1 FROM jsonb_array_elements(v_tests) t WHERE t ->> 'outcome' = 'fail') THEN
    RAISE EXCEPTION 'source evaluation rejected (contract_tests): an evaluation recommending approval records no failed contract test (fix the contract, or recommend revise)' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'source evaluation rejected (reason): the recommendation states its reason (8 to 2000 characters)' USING ERRCODE = '22023'; END IF;
  -- CAP-OB-02: a version superseding another records the change preview it was evaluated against
  IF (s.contract #>> '{lifecycle,supersedes_version}') IS NOT NULL THEN
    v_impact := observation._rg_change_preview(p_tenant, p_domain, p_source_id, jsonb_build_object('operation', 'new_version', 'contract_version', p_contract_version));
  END IF;
  INSERT INTO observation.source_evaluations (evaluation_id, scope, tenant_id, domain_id, source_id, contract_version, authority, rights_evidence, coverage_fit, cost, risks, contract_tests,
                                             recommendation, reason, change_impact, evaluated_by, request_id, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_source_id, p_contract_version, btrim(p_authority), btrim(p_rights_evidence), btrim(p_coverage_fit), btrim(p_cost),
          observation.rt_list(coalesce(p_risks, '[]'::jsonb)), v_tests, p_recommendation, btrim(p_reason), v_impact, v_actor, p_request_id, p_correlation)
  RETURNING * INTO e;
  INSERT INTO observation.source_contract_events (event_id, scope, tenant_id, domain_id, source_id, contract_version, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_source_id, p_contract_version, 'contract.evaluated', v_actor,
          jsonb_build_object('evaluation_id', e.evaluation_id, 'recommendation', e.recommendation, 'registrar', s.registrar_principal_id,
                             'tests', jsonb_build_object('pass', (SELECT count(*) FROM jsonb_array_elements(v_tests) t WHERE t ->> 'outcome' = 'pass'),
                                                         'fail', (SELECT count(*) FROM jsonb_array_elements(v_tests) t WHERE t ->> 'outcome' = 'fail'),
                                                         'not_run', (SELECT count(*) FROM jsonb_array_elements(v_tests) t WHERE t ->> 'outcome' = 'not_run')),
                             'change_impact', CASE WHEN v_impact IS NULL THEN NULL ELSE jsonb_build_object('resting', v_impact #> '{impact,resting}', 'statement', v_impact ->> 'statement') END),
          p_correlation);
  RETURN to_jsonb(e) || jsonb_build_object('replayed', false);
END $$;

-- observation.approve_source — 0022:811, its LAST definition, copied WHOLE (signature, security, search path, grants); the additions, marked
-- `-- B40 rg`: (1) an SRC@v4 contract is APPROVED only on the latest recorded evaluation of THIS version recommending approval (D5; a
-- rejection needs none; v1–v3 keep their path exactly — e2e phase1 #1–#3); (2) no version of a source whose rights stand withdrawn through
-- the rights lifecycle is approved (a new version never lifts a withdrawal — the restoration does, D4); (3) the approval event names the
-- evaluation it read.
CREATE OR REPLACE FUNCTION observation.approve_source(
  p_source_id uuid, p_contract_version int, p_tenant uuid, p_domain uuid,
  p_decision text, p_reason text, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = observation, ctx, identity, public, pg_catalog, pg_temp AS $$
DECLARE v_row observation.source_contracts_current%ROWTYPE;
        v_approver uuid := public.eye_principal();
        v_has_role boolean;
        v_eval observation.source_evaluations%ROWTYPE;   -- B40 rg
        v_eval_id uuid;                                  -- B40 rg
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.source.approve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'approval rejected: decision must be approve or reject' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM observation.source_contracts_current
   WHERE source_id = p_source_id AND contract_version = p_contract_version
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'approval rejected: no such source contract version' USING ERRCODE = '23503';
  END IF;
  IF v_row.lifecycle_state <> 'draft' THEN
    RAISE EXCEPTION 'approval rejected: contract is %, only a draft can be approved', v_row.lifecycle_state
      USING ERRCODE = '23514';
  END IF;
  IF v_approver IS NULL OR v_approver = v_row.registrar_principal_id THEN
    RAISE EXCEPTION 'approval rejected: the registrar of a source contract may never approve it (separation of duties)'
      USING ERRCODE = '42501';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM identity.role_bindings b
     WHERE b.principal_id = v_approver AND b.revoked_at IS NULL
       AND b.role_code = 'collection_manager'
       AND b.tenant_id = p_tenant AND (b.domain_id = p_domain OR b.scope = 'TENANT')
  ) INTO v_has_role;
  IF NOT v_has_role THEN
    RAISE EXCEPTION 'approval rejected: approval requires the collection_manager role in this domain'
      USING ERRCODE = '42501';
  END IF;
  -- B40 rg (D5): an SRC@v4 contract is approved only on the LATEST evaluation of this version, recommending approval
  IF p_decision = 'approve' AND observation._rg_is_v4(p_source_id, p_contract_version) THEN                                         -- B40 rg
    SELECT * INTO v_eval FROM observation.source_evaluations e                                                                         -- B40 rg
     WHERE e.source_id = p_source_id AND e.contract_version = p_contract_version AND e.tenant_id = p_tenant AND e.domain_id = p_domain  -- B40 rg
     ORDER BY e.evaluated_at DESC, e.evaluation_id DESC LIMIT 1;                                                                       -- B40 rg
    IF NOT FOUND THEN                                                                                                                  -- B40 rg
      RAISE EXCEPTION 'source approval rejected (unevaluated): source % v% is an SRC@v4 contract with no recorded evaluation; a collection manager who did not register it records the evaluation (authority, rights and purpose evidence, coverage fit, cost, risks, contract tests) first',
        p_source_id, p_contract_version USING ERRCODE = '23514';                                                                       -- B40 rg
    END IF;                                                                                                                            -- B40 rg
    IF v_eval.recommendation <> 'approve' THEN                                                                                         -- B40 rg
      RAISE EXCEPTION 'source approval rejected (evaluation): the latest evaluation of source % v% (at %) recommends %, not approval',
        p_source_id, p_contract_version, to_char(v_eval.evaluated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), v_eval.recommendation USING ERRCODE = '23514'; -- B40 rg
    END IF;                                                                                                                            -- B40 rg
    v_eval_id := v_eval.evaluation_id;                                                                                                 -- B40 rg
  END IF;                                                                                                                              -- B40 rg
  -- B40 rg (D4): a new version never lifts a withdrawal of the source's rights; the restoration does
  IF p_decision = 'approve' AND (observation._rg_outstanding_withdrawal(p_tenant, p_domain, p_source_id)).change_id IS NOT NULL THEN  -- B40 rg
    RAISE EXCEPTION 'source approval rejected (rights_withdrawn): the rights of source % stand withdrawn; no version of it is approved until they are restored through the rights lifecycle',
      p_source_id USING ERRCODE = '23514';                                                                                             -- B40 rg
  END IF;                                                                                                                              -- B40 rg

  IF p_decision = 'approve' THEN
    UPDATE observation.source_contracts_current
       SET lifecycle_state = 'approved', approver_principal_id = v_approver, updated_at = clock_timestamp()
     WHERE source_id = p_source_id AND contract_version = p_contract_version;
  ELSE
    UPDATE observation.source_contracts_current
       SET lifecycle_state = 'retired', approver_principal_id = v_approver, updated_at = clock_timestamp()
     WHERE source_id = p_source_id AND contract_version = p_contract_version;
  END IF;

  INSERT INTO observation.source_contract_events (
    event_id, scope, tenant_id, domain_id, source_id, contract_version,
    event, actor_principal_id, details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_source_id, p_contract_version,
    CASE WHEN p_decision = 'approve' THEN 'contract.approved' ELSE 'contract.rejected' END,
    v_approver,
    jsonb_build_object('registrar', v_row.registrar_principal_id, 'reason', p_reason)
      || CASE WHEN v_eval_id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('evaluation_id', v_eval_id) END,   -- B40 rg
    p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.approve_source(uuid,int,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.approve_source(uuid,int,uuid,uuid,text,text,uuid,uuid) TO eye_commit;

/* THE RESTORATION (DESIGN D4) — shared by observation.change_rights (p_resume true) and the v1–v3 route (observation.set_rights_state,
   p_resume false: that route never reactivated a contract, and still does not): the OUTSTANDING withdrawal reversed — each version it
   withdrew returns to the rights it had (a version whose rights moved otherwise since is left as it is, said so), each with its
   contract.rights_changed event; with p_resume, the version it suspended RESUMES when nothing moved on it since (still suspended, no other
   version active, its rights confirmed or its mode replay, its approver recorded — otherwise the reactivation is the collection manager's
   transition, said so); the withdrawal's rights incident resolved; the retention action it opened is NOT withdrawn here (the retention
   authority decides it). The caller has checked the authority, the scope, the person, the request and that a withdrawal stands. */
CREATE OR REPLACE FUNCTION observation._rg_restore(p_change uuid, p_request_id uuid, p_tenant uuid, p_domain uuid, p_source uuid, p_named_version int,
                                                   p_reason text, p_evidence text, p_actor uuid, p_via text, p_resume boolean, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
DECLARE w observation.source_rights_changes%ROWTYPE; ch observation.source_rights_changes%ROWTYPE; a jsonb; r observation.source_contracts_current%ROWTYPE;
        v_affected jsonb := '[]'::jsonb; v_reactivated int; v_note text; v_impact jsonb;
BEGIN
  w := observation._rg_outstanding_withdrawal(p_tenant, p_domain, p_source);
  FOR a IN SELECT x FROM jsonb_array_elements(w.affected) x WHERE (x ->> 'changed')::boolean LOOP
    SELECT * INTO r FROM observation.source_contracts_current x WHERE x.source_id = p_source AND x.contract_version = (a ->> 'contract_version')::int FOR UPDATE;
    IF NOT FOUND OR r.rights_state <> 'withdrawn' THEN
      v_affected := v_affected || jsonb_build_object('contract_version', (a ->> 'contract_version')::int, 'restored_to', NULL, 'changed', false, 'note', 'its rights were changed otherwise since the withdrawal');
      CONTINUE;
    END IF;
    UPDATE observation.source_contracts_current SET rights_state = a ->> 'prior_rights', updated_at = clock_timestamp() WHERE source_id = r.source_id AND contract_version = r.contract_version;
    INSERT INTO observation.source_contract_events (event_id, scope, tenant_id, domain_id, source_id, contract_version, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, r.source_id, r.contract_version, 'contract.rights_changed', p_actor,
            jsonb_build_object('operation', 'restore', 'change_id', p_change, 'reverses', w.change_id, 'from', 'withdrawn', 'to', a ->> 'prior_rights', 'reason', btrim(p_reason), 'evidence', p_evidence,
                               'via', p_via, 'kind', 'rights_update', 'rights_state', a ->> 'prior_rights'), p_correlation);
    v_affected := v_affected || jsonb_build_object('contract_version', r.contract_version, 'restored_to', a ->> 'prior_rights', 'changed', true);
  END LOOP;
  IF w.suspended_version IS NOT NULL AND p_resume THEN
    SELECT * INTO r FROM observation.source_contracts_current x WHERE x.source_id = p_source AND x.contract_version = w.suspended_version FOR UPDATE;
    IF FOUND AND r.lifecycle_state = 'suspended' AND r.approver_principal_id IS NOT NULL AND (r.rights_state = 'confirmed' OR r.acquisition_mode = 'replay')
       AND NOT EXISTS (SELECT 1 FROM observation.source_contracts_current o WHERE o.source_id = p_source AND o.lifecycle_state = 'active')
       AND NOT EXISTS (SELECT 1 FROM observation.source_contract_events e WHERE e.source_id = p_source AND e.contract_version = w.suspended_version AND e.occurred_at > w.recorded_at
                         AND e.event NOT IN ('contract.rights_changed', 'contract.evaluated', 'contract.stewardship_changed', 'contract.customer_approved')) THEN
      UPDATE observation.source_contracts_current SET lifecycle_state = 'active', updated_at = clock_timestamp() WHERE source_id = p_source AND contract_version = w.suspended_version;
      INSERT INTO observation.source_contract_events (event_id, scope, tenant_id, domain_id, source_id, contract_version, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_source, w.suspended_version, 'contract.reactivated', p_actor,
              jsonb_build_object('from', 'suspended', 'to', 'active', 'reason', 'rights restored: ' || btrim(p_reason), 'kind', 'rights_restoration', 'change_id', p_change), p_correlation);
      v_reactivated := w.suspended_version;
    ELSE
      v_note := format('contract version %s was not resumed (it is %s, or something moved on it since the withdrawal): its reactivation is the collection manager''s transition', w.suspended_version, coalesce(r.lifecycle_state, 'not recorded'));
    END IF;
  ELSIF w.suspended_version IS NOT NULL THEN
    v_note := format('contract version %s stays suspended: the source rights route never reactivates a contract (the collection manager''s transition does)', w.suspended_version);
  END IF;
  IF w.incident_id IS NOT NULL THEN
    UPDATE observation.source_incidents SET state = 'resolved', resolved_by = p_actor, resolved_at = clock_timestamp(), resolution = left('Rights restored: ' || btrim(p_reason), 2000)
     WHERE incident_id = w.incident_id AND state = 'open';
    IF FOUND THEN
      INSERT INTO observation.source_incident_events (event_id, scope, tenant_id, domain_id, incident_id, event, actor, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, w.incident_id, 'incident.resolved', p_actor, jsonb_build_object('rights_change_id', p_change, 'reverses', w.change_id), p_correlation);
    END IF;
  END IF;
  v_impact := observation._rg_impact(p_tenant, p_domain, p_source);
  INSERT INTO observation.source_rights_changes (change_id, scope, tenant_id, domain_id, source_id, contract_version, operation, via, reason, evidence, affected, reactivated_version, reverses, impact,
                                                 actor, request_id, correlation_id)
  VALUES (p_change, 'DOMAIN', p_tenant, p_domain, p_source, p_named_version, 'restore', p_via, btrim(p_reason), nullif(btrim(coalesce(p_evidence, '')), ''), v_affected, v_reactivated, w.change_id, v_impact,
          p_actor, p_request_id, p_correlation)
  RETURNING * INTO ch;
  RETURN to_jsonb(ch) || jsonb_build_object('replayed', false, 'reactivated', v_reactivated IS NOT NULL, 'note', v_note,
    'retention_action_id', w.retention_action_id,
    'retention_statement', CASE WHEN w.retention_action_id IS NULL THEN NULL ELSE 'the retention action the withdrawal opened is not withdrawn here: the retention authority decides it' END,
    'statement', 'the contract rights are restored; a rights-terms record withdrawn separately is restored only by a new terms version (and a terms restoration never lifts a contract withdrawal)');
END $$;
REVOKE ALL ON FUNCTION observation._rg_restore(uuid, uuid, uuid, uuid, uuid, int, text, text, uuid, text, boolean, uuid) FROM PUBLIC;

-- THE RIGHTS LIFECYCLE — observation.change_rights (DESIGN D4; L1-C01, FEX-02, R-09) ──────────────────────────────────────────────────────
/* A named COLLECTION MANAGER (never an agent) narrows the purposes of the source's latest contract version, WITHDRAWS the source's rights
   (observation._rg_withdraw), or RESTORES them — a restoration reverses the outstanding withdrawal: each version it withdrew returns to the
   rights it had (a version restored otherwise since is left as it is), the version it suspended is RESUMED when nothing moved on it since
   (still suspended, no other version active, its rights confirmed or its mode replay, its approver recorded — otherwise the reactivation is
   the collection manager's transition, stated), the rights incident resolved; the restoration carries its EVIDENCE. A withdrawal and a
   restoration state their reason and evidence; the actor names the version they read (the latest — stale otherwise). A request id replays
   its recorded change. Also served for the v1–v3 rights route (action observation.source.rights), re-pointed here. */
CREATE OR REPLACE FUNCTION observation.change_rights(
  p_request_id uuid, p_tenant uuid, p_domain uuid, p_source_id uuid, p_contract_version int, p_operation text, p_purposes jsonb,
  p_reason text, p_evidence text, p_deletion_obligation text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; ch observation.source_rights_changes%ROWTYPE; w observation.source_rights_changes%ROWTYPE; s observation.source_contracts_current%ROWTYPE;
        v_latest int; v_change uuid := gen_random_uuid(); v_problem text; v_after jsonb; v_affected jsonb := '[]'::jsonb; a jsonb; r observation.source_contracts_current%ROWTYPE;
        v_reactivated int; v_note text; v_impact jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.source.change_rights', 'observation.source.rights']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := observation._rg_actor('rights change', p_actor);
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'rights change rejected (request): a rights change carries its request id' USING ERRCODE = '22023'; END IF;
  SELECT * INTO ch FROM observation.source_rights_changes x WHERE x.request_id = p_request_id;
  IF FOUND THEN
    IF ch.actor IS DISTINCT FROM v_actor OR ch.source_id IS DISTINCT FROM p_source_id OR ch.operation IS DISTINCT FROM p_operation OR ch.tenant_id IS DISTINCT FROM p_tenant OR ch.domain_id IS DISTINCT FROM p_domain THEN
      RAISE EXCEPTION 'rights change rejected (duplicate): request % already recorded another act; a new change takes a new request id', p_request_id USING ERRCODE = '23505';
    END IF;
    RETURN to_jsonb(ch) || jsonb_build_object('replayed', true);
  END IF;
  PERFORM governance.assert_approver('rights change', v_actor, p_tenant, p_domain, ARRAY['collection_manager'], NULL, NULL, 'changing a source''s rights');
  IF p_operation IS NULL OR p_operation NOT IN ('narrow', 'withdraw', 'restore') THEN
    RAISE EXCEPTION 'rights change rejected (operation): the operation is narrow, withdraw or restore' USING ERRCODE = '22023';
  END IF;
  SELECT max(x.contract_version) INTO v_latest FROM observation.source_contracts_current x WHERE x.source_id = p_source_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF v_latest IS NULL THEN RAISE EXCEPTION 'rights change rejected (unknown_source): source % is not recorded in this domain', p_source_id USING ERRCODE = '23503'; END IF;
  IF p_contract_version IS DISTINCT FROM v_latest THEN
    RAISE EXCEPTION 'rights change rejected (stale): source % is at contract version %; this change read %', p_source_id, v_latest, coalesce(p_contract_version::text, 'no version') USING ERRCODE = '23514';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 8 AND 2000 THEN
    RAISE EXCEPTION 'rights change rejected (reason): a rights change states its reason (8 to 2000 characters)' USING ERRCODE = '22023';
  END IF;
  -- one rights act at a time per source
  PERFORM pg_advisory_xact_lock(hashtextextended('observation.source_rights:' || p_tenant || ':' || p_domain || ':' || p_source_id, 0));

  IF p_operation = 'withdraw' THEN
    IF p_evidence IS NULL OR length(btrim(p_evidence)) NOT BETWEEN 8 AND 4000 THEN
      RAISE EXCEPTION 'rights change rejected (evidence): a withdrawal cites its evidence — the publisher''s notice, the ended agreement (8 to 4000 characters)' USING ERRCODE = '22023';
    END IF;
    RETURN observation._rg_withdraw(v_change, p_request_id, p_tenant, p_domain, p_source_id, p_contract_version, p_reason, p_evidence, p_deletion_obligation, v_actor, 'rights_lifecycle', p_correlation);
  END IF;

  IF p_operation = 'narrow' THEN
    SELECT * INTO s FROM observation.source_contracts_current x WHERE x.source_id = p_source_id AND x.contract_version = v_latest FOR UPDATE;
    IF s.rights_state = 'withdrawn' THEN
      RAISE EXCEPTION 'rights change rejected (state): the rights of source % are withdrawn; nothing is narrowed until they are restored', p_source_id USING ERRCODE = '23514';
    END IF;
    v_problem := observation.rt_list_problem(p_purposes, 'purposes', 1);
    IF v_problem IS NOT NULL THEN RAISE EXCEPTION 'rights change rejected (purposes): %', v_problem USING ERRCODE = '22023'; END IF;
    v_after := observation.rt_list(p_purposes);
    IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_after) p WHERE NOT (s.purposes ? p)) OR jsonb_array_length(v_after) >= jsonb_array_length(s.purposes) THEN
      RAISE EXCEPTION 'rights change rejected (purposes): narrowing keeps a strict subset of the purposes in force (%); a wider purpose is a new contract version', s.purposes USING ERRCODE = '22023';
    END IF;
    UPDATE observation.source_contracts_current SET purposes = v_after, updated_at = clock_timestamp() WHERE source_id = p_source_id AND contract_version = v_latest;
    INSERT INTO observation.source_contract_events (event_id, scope, tenant_id, domain_id, source_id, contract_version, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_source_id, v_latest, 'contract.rights_changed', v_actor,
            jsonb_build_object('operation', 'narrow', 'change_id', v_change, 'purposes_before', s.purposes, 'purposes_after', v_after,
                               'dropped', (SELECT coalesce(jsonb_agg(p), '[]'::jsonb) FROM jsonb_array_elements_text(s.purposes) p WHERE NOT (v_after ? p)), 'reason', btrim(p_reason), 'evidence', p_evidence), p_correlation);
    v_impact := observation._rg_impact(p_tenant, p_domain, p_source_id);
    INSERT INTO observation.source_rights_changes (change_id, scope, tenant_id, domain_id, source_id, contract_version, operation, via, reason, evidence, purposes_before, purposes_after, affected, impact,
                                                   actor, request_id, correlation_id)
    VALUES (v_change, 'DOMAIN', p_tenant, p_domain, p_source_id, v_latest, 'narrow', 'rights_lifecycle', btrim(p_reason), nullif(btrim(coalesce(p_evidence, '')), ''), s.purposes, v_after,
            jsonb_build_array(jsonb_build_object('contract_version', v_latest, 'purposes_before', s.purposes, 'purposes_after', v_after, 'changed', true)), v_impact, v_actor, p_request_id, p_correlation)
    RETURNING * INTO ch;
    RETURN to_jsonb(ch) || jsonb_build_object('replayed', false, 'statement', 'collection under a dropped purpose is refused at the revalidation from now on; the evidence already held keeps its record');
  END IF;

  -- RESTORE: the outstanding withdrawal reversed, with evidence (observation._rg_restore; the suspended version resumed when nothing moved)
  IF (observation._rg_outstanding_withdrawal(p_tenant, p_domain, p_source_id)).change_id IS NULL THEN
    RAISE EXCEPTION 'rights change rejected (state): the rights of source % stand no withdrawal of the rights lifecycle; there is nothing to restore', p_source_id USING ERRCODE = '23514';
  END IF;
  IF p_evidence IS NULL OR length(btrim(p_evidence)) NOT BETWEEN 8 AND 4000 THEN
    RAISE EXCEPTION 'rights change rejected (evidence): a restoration cites its evidence — the renewed licence, the publisher''s confirmation (8 to 4000 characters)' USING ERRCODE = '22023';
  END IF;
  RETURN observation._rg_restore(v_change, p_request_id, p_tenant, p_domain, p_source_id, v_latest, p_reason, p_evidence, v_actor, 'rights_lifecycle', true, p_correlation);
END $$;
REVOKE ALL ON FUNCTION observation.change_rights(uuid, uuid, uuid, uuid, int, text, jsonb, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.change_rights(uuid, uuid, uuid, uuid, int, text, jsonb, text, text, text, uuid, uuid) TO eye_commit;

-- observation.set_rights_state — 0022:956, its LAST definition, copied WHOLE (signature, security, search path, grants); the v1–v3 rights
-- route RE-POINTED to the rights lifecycle (marked `-- B40 rg`), by a collection manager: a WITHDRAWAL through it is the lifecycle's
-- withdrawal when none stands (every version, the suspension, the schedule removed, the impact, the owners, the incident —
-- observation._rg_withdraw, via 'rights_route'); a CONFIRMATION (or pending) of a version the lifecycle withdrew is the lifecycle's
-- restoration (observation._rg_restore, via 'rights_route' — without the reactivation, which this route never made). Then the route's own
-- recorded effect, exactly as before: the named version's update and its event (the mislabelled 'contract.registered' of a confirmation kept).
CREATE OR REPLACE FUNCTION observation.set_rights_state(
  p_source_id uuid, p_contract_version int, p_tenant uuid, p_domain uuid,
  p_rights_state text, p_evidence text, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid := public.eye_principal(); v_latest int;   -- B40 rg
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.source.rights']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_rights_state NOT IN ('confirmed', 'pending', 'withdrawn') THEN
    RAISE EXCEPTION 'rights update rejected: unknown rights state %', p_rights_state USING ERRCODE = '22023';
  END IF;
  -- B40 rg: the route RE-POINTED to the rights lifecycle (D4) — a withdrawal through it IS the lifecycle's (when none stands), a           -- B40 rg
  -- confirmation or pending of a version the lifecycle withdrew IS the lifecycle's restoration (never a reactivation); then the route's      -- B40 rg
  -- own recorded effect below, exactly as before (its update and its event)                                                                  -- B40 rg
  IF NOT EXISTS (SELECT 1 FROM observation.source_contracts_current x WHERE x.source_id = p_source_id AND x.contract_version = p_contract_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain) THEN  -- B40 rg
    RAISE EXCEPTION 'rights update rejected: no such source contract version' USING ERRCODE = '23503';                               -- B40 rg
  END IF;                                                                                                                              -- B40 rg
  IF p_rights_state = 'withdrawn' OR ((SELECT x.rights_state FROM observation.source_contracts_current x WHERE x.source_id = p_source_id AND x.contract_version = p_contract_version) = 'withdrawn'
                                      AND (observation._rg_outstanding_withdrawal(p_tenant, p_domain, p_source_id)).change_id IS NOT NULL) THEN   -- B40 rg
    PERFORM governance.assert_approver('rights change', v_actor, p_tenant, p_domain, ARRAY['collection_manager'], NULL, NULL, 'changing a source''s rights');  -- B40 rg
    PERFORM pg_advisory_xact_lock(hashtextextended('observation.source_rights:' || p_tenant || ':' || p_domain || ':' || p_source_id, 0));  -- B40 rg
    SELECT max(x.contract_version) INTO v_latest FROM observation.source_contracts_current x WHERE x.source_id = p_source_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;  -- B40 rg
    IF p_rights_state = 'withdrawn' THEN                                                                                               -- B40 rg
      IF (observation._rg_outstanding_withdrawal(p_tenant, p_domain, p_source_id)).change_id IS NULL THEN                             -- B40 rg
        PERFORM observation._rg_withdraw(gen_random_uuid(), gen_random_uuid(), p_tenant, p_domain, p_source_id, v_latest,             -- B40 rg
          'rights withdrawn through the source rights route', nullif(btrim(coalesce(p_evidence, '')), ''), NULL, v_actor, 'rights_route', p_correlation);  -- B40 rg
      END IF;                                                                                                                          -- B40 rg
    ELSE                                                                                                                               -- B40 rg
      PERFORM observation._rg_restore(gen_random_uuid(), gen_random_uuid(), p_tenant, p_domain, p_source_id, v_latest,               -- B40 rg
        'rights ' || p_rights_state || ' through the source rights route', nullif(btrim(coalesce(p_evidence, '')), ''), v_actor, 'rights_route', false, p_correlation);  -- B40 rg
    END IF;                                                                                                                            -- B40 rg
  END IF;                                                                                                                              -- B40 rg
  UPDATE observation.source_contracts_current
     SET rights_state = p_rights_state,
         -- §7 fail-closed: withdrawn rights immediately deactivate an active contract.
         lifecycle_state = CASE WHEN p_rights_state = 'withdrawn' AND lifecycle_state = 'active'
                                THEN 'suspended' ELSE lifecycle_state END,
         updated_at = clock_timestamp()
   WHERE source_id = p_source_id AND contract_version = p_contract_version;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rights update rejected: no such source contract version' USING ERRCODE = '23503';
  END IF;
  INSERT INTO observation.source_contract_events (
    event_id, scope, tenant_id, domain_id, source_id, contract_version,
    event, actor_principal_id, details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_source_id, p_contract_version,
    CASE WHEN p_rights_state = 'withdrawn' THEN 'contract.suspended' ELSE 'contract.registered' END,
    public.eye_principal(),
    jsonb_build_object('rights_state', p_rights_state, 'evidence', p_evidence, 'kind', 'rights_update'),
    p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.set_rights_state(uuid,int,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.set_rights_state(uuid,int,uuid,uuid,text,text,uuid,uuid) TO eye_commit;

-- CUSTOMER APPROVAL (D13) ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION observation.record_customer_approval(
  p_request_id uuid, p_tenant uuid, p_domain uuid, p_source_id uuid, p_contract_version int, p_decision text, p_scope_statement text, p_reason text, p_claim text,
  p_actor uuid, p_correlation uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; s observation.source_contracts_current%ROWTYPE; a observation.source_customer_approvals%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.source.customer_approve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := observation._rg_actor('customer approval', p_actor);
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'customer approval rejected (request): a customer approval carries its request id' USING ERRCODE = '22023'; END IF;
  SELECT * INTO a FROM observation.source_customer_approvals x WHERE x.request_id = p_request_id;
  IF FOUND THEN
    IF a.approved_by IS DISTINCT FROM v_actor OR a.source_id IS DISTINCT FROM p_source_id OR a.contract_version IS DISTINCT FROM p_contract_version THEN
      RAISE EXCEPTION 'customer approval rejected (duplicate): request % already recorded another act', p_request_id USING ERRCODE = '23505';
    END IF;
    RETURN to_jsonb(a) || jsonb_build_object('replayed', true);
  END IF;
  -- WHO (D13): the tenant's customer sponsor or tenant administrator — a named human; never the registrar or the approver of this version
  PERFORM governance.assert_approver('customer approval', v_actor, p_tenant, p_domain, ARRAY['customer_sponsor', 'tenant_admin'], NULL, NULL, 'approving a source''s use for the tenant');
  IF NOT EXISTS (SELECT 1 FROM identity.role_bindings b JOIN identity.principals p ON p.id = b.principal_id
                  WHERE b.principal_id = v_actor AND b.revoked_at IS NULL AND b.role_code IN ('customer_sponsor', 'tenant_admin') AND b.scope = 'TENANT' AND b.tenant_id = p_tenant AND p.status = 'active') THEN
    RAISE EXCEPTION 'customer approval rejected (authority): the customer''s approval is the act of the tenant''s customer sponsor or tenant administrator (a TENANT binding)' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO s FROM observation.source_contracts_current x WHERE x.source_id = p_source_id AND x.contract_version = p_contract_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'customer approval rejected (unknown_source): source % v% is not recorded in this domain', p_source_id, p_contract_version USING ERRCODE = '23503'; END IF;
  IF v_actor = s.registrar_principal_id OR v_actor IS NOT DISTINCT FROM s.approver_principal_id THEN
    RAISE EXCEPTION 'customer approval rejected (separation_of_duties): the customer''s approval is never recorded by the registrar or the approver of the contract' USING ERRCODE = '42501';
  END IF;
  IF s.lifecycle_state NOT IN ('approved', 'active', 'suspended') THEN
    RAISE EXCEPTION 'customer approval rejected (state): source % v% is %; the customer approves the use of an approved contract', p_source_id, p_contract_version, s.lifecycle_state USING ERRCODE = '23514';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('approve', 'decline') THEN RAISE EXCEPTION 'customer approval rejected (decision): the decision is approve or decline' USING ERRCODE = '22023'; END IF;
  IF p_scope_statement IS NULL OR length(btrim(p_scope_statement)) NOT BETWEEN 8 AND 1000 THEN RAISE EXCEPTION 'customer approval rejected (scope_statement): the use approved for the tenant is stated (8 to 1000 characters)' USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'customer approval rejected (reason): the decision states its reason (8 to 2000 characters)' USING ERRCODE = '22023'; END IF;
  IF p_claim IS NULL OR p_claim NOT IN ('construction', 'demonstration') THEN
    RAISE EXCEPTION 'customer approval rejected (claim): the record claims construction or demonstration — real acceptance is recorded on B111''s shared path, never here' USING ERRCODE = '22023';
  END IF;
  INSERT INTO observation.source_customer_approvals (approval_id, scope, tenant_id, domain_id, source_id, contract_version, decision, scope_statement, reason, claim, approved_by, request_id, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_source_id, p_contract_version, p_decision, btrim(p_scope_statement), btrim(p_reason), p_claim, v_actor, p_request_id, p_correlation)
  RETURNING * INTO a;
  INSERT INTO observation.source_contract_events (event_id, scope, tenant_id, domain_id, source_id, contract_version, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_source_id, p_contract_version, 'contract.customer_approved', v_actor,
          jsonb_build_object('approval_id', a.approval_id, 'decision', a.decision, 'scope_statement', a.scope_statement, 'claim', a.claim), p_correlation);
  RETURN to_jsonb(a) || jsonb_build_object('replayed', false);
END $$;
REVOKE ALL ON FUNCTION observation.record_customer_approval(uuid, uuid, uuid, uuid, int, text, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.record_customer_approval(uuid, uuid, uuid, uuid, int, text, text, text, text, uuid, uuid) TO eye_commit;

-- STEWARDSHIP (L1-C01) ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION observation.change_stewardship(
  p_request_id uuid, p_tenant uuid, p_domain uuid, p_source_id uuid, p_expected_version int, p_steward uuid, p_state text, p_review_due date, p_reason text,
  p_actor uuid, p_correlation uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, governance, onboarding, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; st observation.source_stewardship%ROWTYPE; v_prev int; v_latest int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.source.stewardship']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := observation._rg_actor('stewardship', p_actor);
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'stewardship rejected (request): a stewardship change carries its request id' USING ERRCODE = '22023'; END IF;
  SELECT * INTO st FROM observation.source_stewardship x WHERE x.request_id = p_request_id;
  IF FOUND THEN
    IF st.changed_by IS DISTINCT FROM v_actor OR st.source_id IS DISTINCT FROM p_source_id THEN
      RAISE EXCEPTION 'stewardship rejected (duplicate): request % already recorded another act', p_request_id USING ERRCODE = '23505';
    END IF;
    RETURN to_jsonb(st) || jsonb_build_object('replayed', true);
  END IF;
  PERFORM governance.assert_approver('stewardship', v_actor, p_tenant, p_domain, ARRAY['data_steward', 'collection_manager'], NULL, NULL, 'changing a source''s stewardship');
  SELECT max(x.contract_version) INTO v_latest FROM observation.source_contracts_current x WHERE x.source_id = p_source_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF v_latest IS NULL THEN RAISE EXCEPTION 'stewardship rejected (unknown_source): source % is not recorded in this domain', p_source_id USING ERRCODE = '23503'; END IF;
  IF p_steward IS NULL OR onboarding.principal_kind(p_steward) IS DISTINCT FROM 'human' OR NOT governance.holds_role(p_steward, p_tenant, p_domain, ARRAY['data_steward', 'collection_manager']) THEN
    RAISE EXCEPTION 'stewardship rejected (steward): the steward is a named, active data steward or collection manager of this domain' USING ERRCODE = '22023';
  END IF;
  IF p_state IS NULL OR p_state NOT IN ('assigned', 'under_review', 'lapsed') THEN RAISE EXCEPTION 'stewardship rejected (state_value): the stewardship state is assigned, under_review or lapsed' USING ERRCODE = '22023'; END IF;
  IF p_review_due IS NULL OR p_review_due < date '2000-01-01' THEN RAISE EXCEPTION 'stewardship rejected (review_due): the next review is a date' USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'stewardship rejected (reason): the change states its reason (8 to 2000 characters)' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('observation.source_stewardship:' || p_source_id, 0));
  SELECT max(x.version) INTO v_prev FROM observation.source_stewardship x WHERE x.source_id = p_source_id;
  IF coalesce(p_expected_version, -1) IS DISTINCT FROM coalesce(v_prev, 0) THEN
    RAISE EXCEPTION 'stewardship rejected (stale): the stewardship of source % is at version %; this change read %', p_source_id, coalesce(v_prev, 0), coalesce(p_expected_version::text, 'no version') USING ERRCODE = '23514';
  END IF;
  INSERT INTO observation.source_stewardship (source_id, version, scope, tenant_id, domain_id, steward_principal_id, state, review_due, reason, changed_by, request_id, correlation_id)
  VALUES (p_source_id, coalesce(v_prev, 0) + 1, 'DOMAIN', p_tenant, p_domain, p_steward, p_state, p_review_due, btrim(p_reason), v_actor, p_request_id, p_correlation)
  RETURNING * INTO st;
  INSERT INTO observation.source_contract_events (event_id, scope, tenant_id, domain_id, source_id, contract_version, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_source_id, v_latest, 'contract.stewardship_changed', v_actor,
          jsonb_build_object('stewardship_version', st.version, 'steward', p_steward, 'state', p_state, 'review_due', p_review_due, 'reason', btrim(p_reason)), p_correlation);
  RETURN to_jsonb(st) || jsonb_build_object('replayed', false);
END $$;
REVOKE ALL ON FUNCTION observation.change_stewardship(uuid, uuid, uuid, uuid, int, uuid, text, date, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.change_stewardship(uuid, uuid, uuid, uuid, int, uuid, text, date, text, uuid, uuid) TO eye_commit;

-- SOURCE INCIDENTS (PER-11) ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION observation.open_source_incident(
  p_request_id uuid, p_tenant uuid, p_domain uuid, p_source_id uuid, p_kind text, p_statement text, p_owner uuid, p_actor uuid, p_correlation uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, governance, onboarding, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; i observation.source_incidents%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.source.incident']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := observation._rg_actor('source incident', p_actor);
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'source incident rejected (request): an incident carries its request id' USING ERRCODE = '22023'; END IF;
  SELECT * INTO i FROM observation.source_incidents x WHERE x.request_id = p_request_id;
  IF FOUND THEN
    IF i.opened_by IS DISTINCT FROM v_actor OR i.source_id IS DISTINCT FROM p_source_id THEN
      RAISE EXCEPTION 'source incident rejected (duplicate): request % already recorded another act', p_request_id USING ERRCODE = '23505';
    END IF;
    RETURN to_jsonb(i) || jsonb_build_object('replayed', true);
  END IF;
  PERFORM governance.assert_approver('source incident', v_actor, p_tenant, p_domain, ARRAY['collection_manager', 'domain_analyst'], NULL, NULL, 'opening a source incident');
  IF NOT EXISTS (SELECT 1 FROM observation.source_contracts_current x WHERE x.source_id = p_source_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain) THEN
    RAISE EXCEPTION 'source incident rejected (unknown_source): source % is not recorded in this domain', p_source_id USING ERRCODE = '23503';
  END IF;
  -- PER-11: the collection manager owns the operational response
  IF p_owner IS NULL OR onboarding.principal_kind(p_owner) IS DISTINCT FROM 'human' OR NOT governance.holds_role(p_owner, p_tenant, p_domain, ARRAY['collection_manager']) THEN
    RAISE EXCEPTION 'source incident rejected (owner): a source incident is owned by a named collection manager of this domain' USING ERRCODE = '22023';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('outage', 'rights', 'quality', 'access', 'manipulation', 'other') THEN RAISE EXCEPTION 'source incident rejected (kind): the kind is outage, rights, quality, access, manipulation or other' USING ERRCODE = '22023'; END IF;
  IF p_statement IS NULL OR length(btrim(p_statement)) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'source incident rejected (statement): the incident is stated (8 to 2000 characters)' USING ERRCODE = '22023'; END IF;
  INSERT INTO observation.source_incidents (incident_id, scope, tenant_id, domain_id, source_id, kind, statement, owner_principal_id, opened_by, request_id, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_source_id, p_kind, btrim(p_statement), p_owner, v_actor, p_request_id, p_correlation)
  RETURNING * INTO i;
  INSERT INTO observation.source_incident_events (event_id, scope, tenant_id, domain_id, incident_id, event, actor, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, i.incident_id, 'incident.opened', v_actor, jsonb_build_object('kind', p_kind, 'owner', p_owner), p_correlation);
  RETURN to_jsonb(i) || jsonb_build_object('replayed', false);
END $$;
REVOKE ALL ON FUNCTION observation.open_source_incident(uuid, uuid, uuid, uuid, text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.open_source_incident(uuid, uuid, uuid, uuid, text, text, uuid, uuid, uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION observation.resolve_source_incident(p_tenant uuid, p_domain uuid, p_incident uuid, p_resolution text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; i observation.source_incidents%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.source.incident']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := observation._rg_actor('source incident', p_actor);
  SELECT * INTO i FROM observation.source_incidents x WHERE x.incident_id = p_incident AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'source incident rejected (unknown_incident): incident % is not recorded in this domain', p_incident USING ERRCODE = '23503'; END IF;
  -- the owner, or another collection manager of the domain (never an agent)
  PERFORM governance.assert_approver('source incident', v_actor, p_tenant, p_domain, ARRAY['collection_manager'], NULL, NULL, 'resolving a source incident');
  IF i.state <> 'open' THEN RAISE EXCEPTION 'source incident rejected (state): incident % is %', p_incident, i.state USING ERRCODE = '23514'; END IF;
  IF p_resolution IS NULL OR length(btrim(p_resolution)) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'source incident rejected (resolution): the resolution is stated (8 to 2000 characters)' USING ERRCODE = '22023'; END IF;
  UPDATE observation.source_incidents SET state = 'resolved', resolved_by = v_actor, resolved_at = clock_timestamp(), resolution = btrim(p_resolution) WHERE incident_id = p_incident RETURNING * INTO i;
  INSERT INTO observation.source_incident_events (event_id, scope, tenant_id, domain_id, incident_id, event, actor, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_incident, 'incident.resolved', v_actor, jsonb_build_object('resolution', btrim(p_resolution), 'owner', i.owner_principal_id), p_correlation);
  RETURN to_jsonb(i);
END $$;
REVOKE ALL ON FUNCTION observation.resolve_source_incident(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.resolve_source_incident(uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

-- §RG.4 THE READS ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/* THE CHANGE PREVIEW (CAP-OB-02) — internal: what a rights change or a new contract version would do, before it is made.
   p_change: { operation: withdraw | restore | narrow | new_version, purposes?: [...] (narrow), contract_version?: int (new_version: the
   registered draft compared with the version it supersedes) }. */
CREATE OR REPLACE FUNCTION observation._rg_change_preview(p_tenant uuid, p_domain uuid, p_source uuid, p_change jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
DECLARE v_op text := p_change ->> 'operation'; s observation.source_contracts_current%ROWTYPE; n observation.source_contracts_current%ROWTYPE; p observation.source_contracts_current%ROWTYPE;
        w observation.source_rights_changes%ROWTYPE; v_impact jsonb; v_versions jsonb; v_out jsonb; v_sched text; v_after jsonb; v_diff jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO s FROM observation.source_contracts_current x WHERE x.source_id = p_source AND x.tenant_id = p_tenant AND x.domain_id = p_domain ORDER BY x.contract_version DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'source registry rejected (unknown_source): source % is not recorded in this domain', p_source USING ERRCODE = '23503'; END IF;
  IF v_op IS NULL OR v_op NOT IN ('withdraw', 'restore', 'narrow', 'new_version') THEN
    RAISE EXCEPTION 'source registry rejected (operation): the change previewed is withdraw, restore, narrow or new_version' USING ERRCODE = '22023';
  END IF;
  v_impact := observation._rg_impact(p_tenant, p_domain, p_source);
  w := observation._rg_outstanding_withdrawal(p_tenant, p_domain, p_source);
  SELECT status INTO v_sched FROM observation.scheduler_entries x WHERE x.source_id = p_source;
  SELECT coalesce(jsonb_agg(jsonb_build_object('contract_version', x.contract_version, 'lifecycle', x.lifecycle_state, 'rights_state', x.rights_state, 'purposes', x.purposes,
           'after', CASE v_op
             WHEN 'withdraw' THEN jsonb_build_object('rights_state', 'withdrawn', 'lifecycle', CASE WHEN x.lifecycle_state = 'active' THEN 'suspended' ELSE x.lifecycle_state END)
             WHEN 'restore' THEN coalesce((SELECT jsonb_build_object('rights_state', a ->> 'prior_rights', 'lifecycle', CASE WHEN x.contract_version = w.suspended_version THEN 'active (when nothing moved on it since)' ELSE x.lifecycle_state END)
                                             FROM jsonb_array_elements(w.affected) a WHERE (a ->> 'contract_version')::int = x.contract_version AND (a ->> 'changed')::boolean), jsonb_build_object('rights_state', x.rights_state, 'lifecycle', x.lifecycle_state))
             ELSE jsonb_build_object('rights_state', x.rights_state, 'lifecycle', x.lifecycle_state) END) ORDER BY x.contract_version), '[]'::jsonb)
    INTO v_versions FROM observation.source_contracts_current x WHERE x.source_id = p_source AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  v_out := jsonb_build_object('source_id', p_source, 'source_name', s.name, 'operation', v_op, 'latest_version', s.contract_version, 'versions', v_versions, 'impact', v_impact,
                              'outstanding_withdrawal', CASE WHEN w.change_id IS NULL THEN NULL ELSE jsonb_build_object('change_id', w.change_id, 'recorded_at', w.recorded_at, 'reason', w.reason) END,
                              'deletion_obligation_declared', s.contract #>> '{authority_and_rights,deletion_obligation}');
  IF v_op = 'withdraw' THEN
    RETURN v_out || jsonb_build_object('schedule', CASE WHEN v_sched = 'scheduled' THEN 'removed' ELSE 'none_scheduled' END, 'possible', w.change_id IS NULL,
      'statement', CASE WHEN w.change_id IS NOT NULL THEN 'the rights already stand withdrawn' ELSE
        'collection stops, the schedule is removed, every resting product is marked (cause rights) and its owner routed an item, and the decision-active use of the source''s evidence is refused until the rights are restored; nothing is deleted unless a deletion obligation is declared with the withdrawal' END);
  ELSIF v_op = 'restore' THEN
    RETURN v_out || jsonb_build_object('possible', w.change_id IS NOT NULL, 'statement', CASE WHEN w.change_id IS NULL THEN 'nothing to restore: the rights stand no withdrawal of the rights lifecycle'
      ELSE 'each version the withdrawal withdrew returns to the rights it had; the version it suspended resumes when nothing moved on it since; a rights-terms record withdrawn separately stays withdrawn' END);
  ELSIF v_op = 'narrow' THEN
    v_after := CASE WHEN jsonb_typeof(p_change -> 'purposes') = 'array' THEN observation.rt_list(p_change -> 'purposes') ELSE NULL END;
    RETURN v_out || jsonb_build_object('purposes_before', s.purposes, 'purposes_after', v_after,
      'dropped', CASE WHEN v_after IS NULL THEN NULL ELSE (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM jsonb_array_elements_text(s.purposes) x WHERE NOT (v_after ? x)) END,
      'possible', v_after IS NOT NULL AND s.rights_state <> 'withdrawn',
      'statement', 'collection under a dropped purpose is refused from the next revalidation; evidence already held keeps its record');
  END IF;
  -- new_version: the registered draft against the version it supersedes
  SELECT * INTO n FROM observation.source_contracts_current x WHERE x.source_id = p_source AND x.contract_version = (p_change ->> 'contract_version')::int AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'source registry rejected (unknown_version): source % has no contract version %', p_source, coalesce(p_change ->> 'contract_version', '<none>') USING ERRCODE = '23503'; END IF;
  SELECT * INTO p FROM observation.source_contracts_current x WHERE x.source_id = p_source AND x.contract_version = (n.contract #>> '{lifecycle,supersedes_version}')::int;
  IF FOUND THEN
    IF n.purposes IS DISTINCT FROM p.purposes THEN v_diff := v_diff || jsonb_build_object('field', 'purposes', 'before', p.purposes, 'after', n.purposes,
         'dropped', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM jsonb_array_elements_text(p.purposes) x WHERE NOT (n.purposes ? x))); END IF;
    IF n.rights_state IS DISTINCT FROM p.rights_state THEN v_diff := v_diff || jsonb_build_object('field', 'rights_state', 'before', p.rights_state, 'after', n.rights_state); END IF;
    IF n.residency IS DISTINCT FROM p.residency THEN v_diff := v_diff || jsonb_build_object('field', 'residency', 'before', p.residency, 'after', n.residency); END IF;
    IF n.classification_ceiling IS DISTINCT FROM p.classification_ceiling THEN v_diff := v_diff || jsonb_build_object('field', 'classification_ceiling', 'before', p.classification_ceiling, 'after', n.classification_ceiling); END IF;
    IF n.endpoints IS DISTINCT FROM p.endpoints THEN v_diff := v_diff || jsonb_build_object('field', 'endpoints', 'before', p.endpoints, 'after', n.endpoints); END IF;
    IF n.acquisition_mode IS DISTINCT FROM p.acquisition_mode THEN v_diff := v_diff || jsonb_build_object('field', 'acquisition_mode', 'before', p.acquisition_mode, 'after', n.acquisition_mode); END IF;
    IF n.connector_kind IS DISTINCT FROM p.connector_kind THEN v_diff := v_diff || jsonb_build_object('field', 'connector_kind', 'before', p.connector_kind, 'after', n.connector_kind); END IF;
    IF n.cadence_seconds IS DISTINCT FROM p.cadence_seconds THEN v_diff := v_diff || jsonb_build_object('field', 'cadence_seconds', 'before', p.cadence_seconds, 'after', n.cadence_seconds); END IF;
    IF (n.contract #> '{authority_and_rights,deletion_obligation}') IS DISTINCT FROM (p.contract #> '{authority_and_rights,deletion_obligation}') THEN
      v_diff := v_diff || jsonb_build_object('field', 'deletion_obligation', 'before', p.contract #> '{authority_and_rights,deletion_obligation}', 'after', n.contract #> '{authority_and_rights,deletion_obligation}'); END IF;
  END IF;
  RETURN v_out || jsonb_build_object('contract_version', n.contract_version, 'supersedes', CASE WHEN p.source_id IS NULL THEN NULL ELSE p.contract_version END, 'changes', v_diff,
    'statement', CASE WHEN p.source_id IS NULL THEN 'a first version: nothing rests on an earlier one'
                      WHEN jsonb_array_length(v_diff) = 0 THEN 'no consequential field changes against the version it supersedes'
                      ELSE format('%s consequential field(s) change against version %s; what rests on the source is listed', jsonb_array_length(v_diff), p.contract_version) END);
END $$;
REVOKE ALL ON FUNCTION observation._rg_change_preview(uuid, uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION observation.record_source_evaluation(uuid, uuid, uuid, uuid, int, text, text, text, text, jsonb, jsonb, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.record_source_evaluation(uuid, uuid, uuid, uuid, int, text, text, text, text, jsonb, jsonb, text, text, uuid, uuid) TO eye_commit;

/* THE REVOCATION IMPACT READ (FEX-02, PR-09-005): what rests on the source's evidence, each with its owner, its markers, and the rights
   lifecycle's outstanding withdrawal. Reads scope-guarded (assert_read_scope); the PDP admits observation.rights.impact.read. */
CREATE OR REPLACE FUNCTION observation.rights_revocation_impact(p_tenant uuid, p_domain uuid, p_source_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
DECLARE w observation.source_rights_changes%ROWTYPE; s observation.source_contracts_current%ROWTYPE;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the revocation impact of a source');
  SELECT * INTO s FROM observation.source_contracts_current x WHERE x.source_id = p_source_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain ORDER BY x.contract_version DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'source registry rejected (unknown_source): source % is not recorded in this domain', p_source_id USING ERRCODE = '23503'; END IF;
  w := observation._rg_outstanding_withdrawal(p_tenant, p_domain, p_source_id);
  RETURN observation._rg_impact(p_tenant, p_domain, p_source_id) || jsonb_build_object(
    'latest_version', s.contract_version, 'rights_state', s.rights_state, 'lifecycle_state', s.lifecycle_state,
    'withdrawal', CASE WHEN w.change_id IS NULL THEN NULL ELSE jsonb_build_object('change_id', w.change_id, 'recorded_at', w.recorded_at, 'reason', w.reason, 'evidence', w.evidence,
                         'actor', observation._rg_who(w.actor), 'retention_action_id', w.retention_action_id, 'incident_id', w.incident_id, 'attention_items', w.attention_items,
                         'impact_at_withdrawal', jsonb_build_object('resting', w.impact -> 'resting', 'statement', w.impact ->> 'statement')) END,
    'use', CASE WHEN w.change_id IS NULL AND s.rights_state <> 'withdrawn' THEN 'the decision-active use of this source''s evidence is not refused for its contract rights (the rights terms are judged separately)'
                ELSE 'the decision-active use of this source''s evidence is REFUSED (rights_withdrawn) until the rights are restored; reading stays as it was' END,
    'as_of', graph.pv_iso(clock_timestamp()));
END $$;
REVOKE ALL ON FUNCTION observation.rights_revocation_impact(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.rights_revocation_impact(uuid, uuid, uuid) TO eye_app, eye_commit;

/* THE CHANGE PREVIEW READ (CAP-OB-02): before a rights change or a new contract version. */
CREATE OR REPLACE FUNCTION observation.source_change_impact(p_tenant uuid, p_domain uuid, p_source_id uuid, p_change jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the change preview of a source');
  RETURN observation._rg_change_preview(p_tenant, p_domain, p_source_id, coalesce(p_change, '{}'::jsonb)) || jsonb_build_object('as_of', graph.pv_iso(clock_timestamp()));
END $$;
REVOKE ALL ON FUNCTION observation.source_change_impact(uuid, uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.source_change_impact(uuid, uuid, uuid, jsonb) TO eye_app, eye_commit;

/* THE ECONOMICS against the run meter (PR-09-001/-002): the SRC@v4 economics of the latest version that declares them, the runs recorded
   in the current period (collection_runs_current — the run meter's record), their cost and the budget left. A v1–v3 source declares none. */
CREATE OR REPLACE FUNCTION observation._rg_economics(p_tenant uuid, p_domain uuid, p_source uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
DECLARE s observation.source_contracts_current%ROWTYPE; e jsonb; v_from timestamptz; v_runs int; v_cost numeric; v_budget numeric;
BEGIN
  SELECT * INTO s FROM observation.source_contracts_current x WHERE x.source_id = p_source AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.contract ? 'economics'
   ORDER BY x.contract_version DESC LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('declared', false, 'statement', 'no economics declared (an SRC@v1–v3 contract — not recorded before B40)'); END IF;
  e := s.contract -> 'economics';
  v_from := date_trunc(e ->> 'period', clock_timestamp());
  SELECT count(*)::int INTO v_runs FROM observation.collection_runs_current r WHERE r.source_id = p_source AND r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.started_at >= v_from;
  v_cost := v_runs * (e ->> 'cost_per_run')::numeric; v_budget := (e ->> 'budget_per_period')::numeric;
  RETURN jsonb_build_object('declared', true, 'contract_version', s.contract_version, 'period', e ->> 'period', 'period_from', graph.pv_iso(v_from), 'currency', e ->> 'currency', 'owner', e ->> 'owner',
    'cost_per_run', (e ->> 'cost_per_run')::numeric, 'budget_per_period', v_budget, 'runs', v_runs, 'cost', v_cost, 'remaining', v_budget - v_cost, 'over_budget', v_cost > v_budget,
    'basis', 'runs recorded in the current period (the run meter''s record) × the declared cost per run');
END $$;
REVOKE ALL ON FUNCTION observation._rg_economics(uuid, uuid, uuid) FROM PUBLIC;

/* THE REGISTRY READ of one source: per contract version its schema, whether B40's records apply (a v1–v3 version reads "not recorded before
   B40" where it has none), the evaluations, the customer approvals; the rights lifecycle, the stewardship, the incidents, the candidate it
   was promoted from, the economics against the run meter, the active markers. Metadata only — no evidence content (D9). */
CREATE OR REPLACE FUNCTION observation.source_registry_read(p_tenant uuid, p_domain uuid, p_source_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = observation, objects, pg_catalog, pg_temp AS $$
DECLARE v_versions jsonb; w observation.source_rights_changes%ROWTYPE; v_st jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the registry record of a source');
  IF NOT EXISTS (SELECT 1 FROM observation.source_contracts_current x WHERE x.source_id = p_source_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain) THEN
    RAISE EXCEPTION 'source registry rejected (unknown_source): source % is not recorded in this domain', p_source_id USING ERRCODE = '23503';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'contract_version', s.contract_version, 'schema_ref', o.schema_ref, 'v4', o.schema_ref = 'SRC@v4', 'lifecycle_state', s.lifecycle_state, 'rights_state', s.rights_state,
      'purposes', s.purposes, 'registrar', observation._rg_who(s.registrar_principal_id), 'approver', observation._rg_who(s.approver_principal_id),
      'economics', s.contract -> 'economics', 'stewardship_declared', s.contract -> 'stewardship', 'deletion_obligation', s.contract #>> '{authority_and_rights,deletion_obligation}',
      'evaluations', (SELECT coalesce(jsonb_agg(to_jsonb(e) - 'tenant_id' - 'domain_id' - 'scope' || jsonb_build_object('evaluator', observation._rg_who(e.evaluated_by)) ORDER BY e.evaluated_at DESC), '[]'::jsonb)
                        FROM observation.source_evaluations e WHERE e.source_id = s.source_id AND e.contract_version = s.contract_version AND e.tenant_id = p_tenant AND e.domain_id = p_domain),
      'customer_approvals', (SELECT coalesce(jsonb_agg(to_jsonb(a) - 'tenant_id' - 'domain_id' - 'scope' || jsonb_build_object('approver', observation._rg_who(a.approved_by)) ORDER BY a.approved_at DESC), '[]'::jsonb)
                        FROM observation.source_customer_approvals a WHERE a.source_id = s.source_id AND a.contract_version = s.contract_version AND a.tenant_id = p_tenant AND a.domain_id = p_domain),
      'approval_gate', CASE WHEN o.schema_ref = 'SRC@v4' THEN 'an SRC@v4 contract is approved only on its latest evaluation recommending approval'
                            ELSE 'an SRC@v1–v3 contract keeps its recorded path (registrar ≠ approver); its evaluation, customer approval and economics are not recorded before B40' END)
      ORDER BY s.contract_version DESC), '[]'::jsonb)
    INTO v_versions
    FROM observation.source_contracts_current s
    LEFT JOIN objects.canonical_objects o ON o.object_type = 'SRC' AND o.object_id = s.src_object_id AND o.object_version = s.src_object_version AND o.tenant_id = s.tenant_id
   WHERE s.source_id = p_source_id AND s.tenant_id = p_tenant AND s.domain_id = p_domain;
  w := observation._rg_outstanding_withdrawal(p_tenant, p_domain, p_source_id);
  SELECT to_jsonb(x) - 'tenant_id' - 'domain_id' - 'scope' || jsonb_build_object('steward', observation._rg_who(x.steward_principal_id), 'review_overdue', x.review_due < current_date)
    INTO v_st FROM observation.source_stewardship x WHERE x.source_id = p_source_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain ORDER BY x.version DESC LIMIT 1;
  RETURN jsonb_build_object('source_id', p_source_id, 'versions', v_versions,
    'rights_changes', (SELECT coalesce(jsonb_agg(jsonb_build_object('change_id', c.change_id, 'operation', c.operation, 'via', c.via, 'contract_version', c.contract_version, 'reason', c.reason,
                          'evidence', c.evidence, 'purposes_before', c.purposes_before, 'purposes_after', c.purposes_after, 'affected', c.affected, 'suspended_version', c.suspended_version,
                          'reactivated_version', c.reactivated_version, 'deletion_obligation', c.deletion_obligation, 'retention_action_id', c.retention_action_id, 'incident_id', c.incident_id,
                          'reverses', c.reverses, 'resting', c.impact -> 'resting', 'impact_statement', c.impact ->> 'statement', 'attention_items', jsonb_array_length(c.attention_items),
                          'actor', observation._rg_who(c.actor), 'recorded_at', c.recorded_at) ORDER BY c.recorded_at DESC), '[]'::jsonb)
                        FROM observation.source_rights_changes c WHERE c.source_id = p_source_id AND c.tenant_id = p_tenant AND c.domain_id = p_domain),
    'outstanding_withdrawal', CASE WHEN w.change_id IS NULL THEN NULL ELSE jsonb_build_object('change_id', w.change_id, 'recorded_at', w.recorded_at, 'reason', w.reason) END,
    'stewardship', v_st,
    'stewardship_history', (SELECT coalesce(jsonb_agg(to_jsonb(x) - 'tenant_id' - 'domain_id' - 'scope' || jsonb_build_object('steward', observation._rg_who(x.steward_principal_id)) ORDER BY x.version DESC), '[]'::jsonb)
                             FROM observation.source_stewardship x WHERE x.source_id = p_source_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain),
    'incidents', (SELECT coalesce(jsonb_agg(to_jsonb(i) - 'tenant_id' - 'domain_id' - 'scope' || jsonb_build_object('owner', observation._rg_who(i.owner_principal_id)) ORDER BY i.opened_at DESC), '[]'::jsonb)
                   FROM observation.source_incidents i WHERE i.source_id = p_source_id AND i.tenant_id = p_tenant AND i.domain_id = p_domain),
    'candidate', (SELECT to_jsonb(c) - 'tenant_id' - 'domain_id' - 'scope' || jsonb_build_object('proposer', observation._rg_who(c.proposed_by))
                    FROM observation.source_candidates c WHERE c.promoted_source_id = p_source_id AND c.tenant_id = p_tenant AND c.domain_id = p_domain LIMIT 1),
    'economics', observation._rg_economics(p_tenant, p_domain, p_source_id),
    'markers', (SELECT coalesce(jsonb_agg(jsonb_build_object('marker_id', m.marker_id, 'kind', m.subject_kind, 'id', m.subject_id, 'health_state', m.health_state, 'cause', m.cause, 'set_at', m.set_at) ORDER BY m.set_at), '[]'::jsonb)
                  FROM observation.source_impact_markers m WHERE m.source_id = p_source_id AND m.tenant_id = p_tenant AND m.domain_id = p_domain AND m.state = 'active'),
    'as_of', graph.pv_iso(clock_timestamp()));
END $$;
REVOKE ALL ON FUNCTION observation.source_registry_read(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.source_registry_read(uuid, uuid, uuid) TO eye_app, eye_commit;

/* THE CANDIDATES of the domain (discovery), newest first, with the source each was promoted to. */
CREATE OR REPLACE FUNCTION observation.source_candidates_read(p_tenant uuid, p_domain uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the source candidates of a domain');
  RETURN jsonb_build_object('candidates', (SELECT coalesce(jsonb_agg(to_jsonb(c) - 'tenant_id' - 'domain_id' - 'scope' || jsonb_build_object('proposer', observation._rg_who(c.proposed_by), 'decider', observation._rg_who(c.decided_by),
                              'source_name', (SELECT s.name FROM observation.source_contracts_current s WHERE s.source_id = c.promoted_source_id AND s.contract_version = c.promoted_contract_version),
                              'events', (SELECT coalesce(jsonb_agg(jsonb_build_object('event', e.event, 'actor', observation._rg_who(e.actor), 'at', e.occurred_at, 'details', e.details) ORDER BY e.occurred_at), '[]'::jsonb)
                                           FROM observation.source_candidate_events e WHERE e.candidate_id = c.candidate_id)) ORDER BY c.proposed_at DESC), '[]'::jsonb)
                              FROM (SELECT * FROM observation.source_candidates x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain ORDER BY x.proposed_at DESC LIMIT 200) c),
                            'as_of', graph.pv_iso(clock_timestamp()));
END $$;
REVOKE ALL ON FUNCTION observation.source_candidates_read(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.source_candidates_read(uuid, uuid) TO eye_app, eye_commit;

-- §RG.5 THE USE REFUSAL — §0's stub REPLACED WHOLE (same signature, STABLE, invoker, search path, REVOKE ALL FROM PUBLIC) ──────────────
/* DESIGN D4 (the owner's word): evidence acquired under REVOKED rights is refused at every decision-active use (an option, a publication, an
   export, a gate act — objects._lineage_usable through §0's dispatcher), from CURRENT database state. BOTH rights sources of the contract
   version the evidence was admitted under count, each on its own:
     the source CONTRACT's rights (p_contract_rights_state — graph.ev_evidence_state's `contract_rights_state`, read in the refusing statement)
       withdrawn → refused, whatever the rights terms say (an in-force terms record never bypasses a revoked contract);
     the rights TERMS (p_terms_rights_state — 0121's terms-derived state) withdrawn → refused, whatever the contract says (a confirmed
       contract never bypasses withdrawn terms; _lineage_usable already refuses this as rights_expired before it asks — counted here too, so
       the rule holds whichever check runs first).
   A contract state the dispatcher did not carry (NULL for evidence naming a source) is READ AGAIN from the projection now, never assumed in
   force. Evidence naming no source contract is not this hook's question. Recovery is only through the governed restoration of the
   applicable rights (change_rights restore; a new rights-terms version) — this function reads state, it records nothing. */
CREATE OR REPLACE FUNCTION observation._rg_use_refusal(p_tenant uuid, p_domain uuid, p_evd uuid, p_version int,
                                                       p_source uuid, p_contract_version int,
                                                       p_contract_rights_state text, p_terms_rights_state text) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = observation, pg_catalog, pg_temp AS $$
DECLARE v_contract text := p_contract_rights_state;   -- B40 rg
BEGIN
  -- B40 rg (D4): both rights sources, from current state
  IF p_source IS NULL OR p_contract_version IS NULL THEN RETURN NULL; END IF;
  IF v_contract IS NULL THEN
    SELECT s.rights_state INTO v_contract FROM observation.source_contracts_current s
     WHERE s.source_id = p_source AND s.contract_version = p_contract_version AND s.tenant_id = p_tenant AND s.domain_id = p_domain;
  END IF;
  IF v_contract = 'withdrawn' THEN
    RETURN jsonb_build_object('class', 'rights_withdrawn',
      'detail', format('whose source contract (%s v%s) has its rights WITHDRAWN%s; it is refused until the contract rights are restored through the rights lifecycle (an in-force rights-terms record does not lift a contract withdrawal)',
                       p_source, p_contract_version, CASE WHEN p_terms_rights_state IS NULL THEN '' ELSE format(' (its rights terms read %s)', p_terms_rights_state) END));
  END IF;
  IF p_terms_rights_state = 'withdrawn' THEN
    RETURN jsonb_build_object('class', 'rights_withdrawn',
      'detail', format('whose rights terms (source %s v%s) are WITHDRAWN (the contract rights read %s); it is refused until a new rights-terms version is declared in force (a confirmed contract does not lift a terms withdrawal)',
                       p_source, p_contract_version, coalesce(v_contract, 'not recorded')));
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION observation._rg_use_refusal(uuid, uuid, uuid, int, uuid, int, text, text) FROM PUBLIC;

-- §RG.6 THE WIRING ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

-- observation.mark_source_impact — 0088:603 (B28 §R4), its LAST definition, copied WHOLE (signature, security, search path, grants); the
-- one change, marked `-- B40 rg`: the CAUSE of a marker set now — `rights` when the event that set it declares `cause: rights` (the rights
-- lifecycle's SourceHealthChanged) or the source's rights stand withdrawn and the state is `suspended`; `health` otherwise (D4). A marker
-- whose cause changes is cleared and set again (history kept; nothing rewritten in place), as a changed health state is.
CREATE OR REPLACE FUNCTION observation.mark_source_impact(p_tenant uuid, p_domain uuid, p_source_id uuid, p_health_state text, p_reason text, p_event_id uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE d record; v_set jsonb := '[]'::jsonb; v_kept jsonb := '[]'::jsonb; v_changed jsonb := '[]'::jsonb; v_cleared jsonb := '[]'::jsonb; m observation.source_impact_markers%ROWTYPE; v_degraded boolean;
        rm observation.coverage_remediations%ROWTYPE; v_remediated jsonb := '[]'::jsonb; v_rclosure jsonb; v_rat timestamptz; /* B28 (0088) remediation */
        v_cause text := 'health';   -- B40 rg
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.source_health.subscription.apply']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_health_state IS NULL OR p_health_state NOT IN ('healthy', 'active', 'degraded', 'failed', 'suspended', 'unknown') THEN
    RAISE EXCEPTION 'source impact rejected: % is not a source health state', coalesce(p_health_state, '<none>') USING ERRCODE = '22023';
  END IF;
  v_degraded := p_health_state IN ('degraded', 'failed', 'suspended', 'unknown');
  -- B40 rg (D4): the cause — the event's declaration (the rights lifecycle's SourceHealthChanged), or a suspension while the rights stand withdrawn
  IF v_degraded AND (EXISTS (SELECT 1 FROM objects.object_outbox ob WHERE ob.id = p_event_id AND ob.payload ->> 'cause' = 'rights')                     -- B40 rg
                     OR (p_health_state = 'suspended' AND (observation._rg_outstanding_withdrawal(p_tenant, p_domain, p_source_id)).change_id IS NOT NULL)) THEN  -- B40 rg
    v_cause := 'rights';                                                                                                                             -- B40 rg
  END IF;                                                                                                                                            -- B40 rg
  IF v_degraded THEN
    FOR d IN SELECT * FROM observation.source_derived_products(p_tenant, p_domain, p_source_id) LOOP
      SELECT * INTO m FROM observation.source_impact_markers x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.source_id = p_source_id AND x.subject_kind = d.subject_kind AND x.subject_id = d.subject_id AND x.state = 'active';
      IF FOUND AND m.health_state = p_health_state AND m.cause = v_cause THEN v_kept := v_kept || jsonb_build_object('kind', d.subject_kind, 'id', d.subject_id); CONTINUE; END IF;   -- B40 rg: and the same cause
      IF FOUND THEN
        -- B24 (0086 §I): the source's health CHANGED between two non-healthy states (degraded → suspended, or back): the old marker is
        -- cleared with the new state recorded and a new marker set — so a gate reads the CURRENT state, and an acknowledgement given
        -- for the old marker does not carry to the new one (history kept; nothing rewritten in place).
        -- B40 rg: likewise when the CAUSE changed (health ↔ rights).
        UPDATE observation.source_impact_markers SET state = 'cleared', cleared_at = clock_timestamp(), cleared_by_event = p_event_id, cleared_state = p_health_state
         WHERE marker_id = m.marker_id;
        v_changed := v_changed || jsonb_build_object('kind', d.subject_kind, 'id', d.subject_id, 'from', m.health_state, 'to', p_health_state, 'cause_from', m.cause, 'cause_to', v_cause);  -- B40 rg: the causes
      END IF;
      INSERT INTO observation.source_impact_markers (marker_id, scope, tenant_id, domain_id, source_id, subject_kind, subject_id, health_state, reason, set_by_event, correlation_id, cause)  -- B40 rg: cause
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_source_id, d.subject_kind, d.subject_id, p_health_state, p_reason, p_event_id, p_correlation, v_cause);                -- B40 rg: cause
      v_set := v_set || jsonb_build_object('kind', d.subject_kind, 'id', d.subject_id, 'via', d.via, 'cause', v_cause);   -- B40 rg: cause
    END LOOP;
  ELSE
    FOR m IN SELECT * FROM observation.source_impact_markers x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.source_id = p_source_id AND x.state = 'active' FOR UPDATE LOOP
      UPDATE observation.source_impact_markers SET state = 'cleared', cleared_at = clock_timestamp(), cleared_by_event = p_event_id, cleared_state = p_health_state WHERE marker_id = m.marker_id;
      v_cleared := v_cleared || jsonb_build_object('kind', m.subject_kind, 'id', m.subject_id);
    END LOOP;
    /* B28 (0088) remediation — the source RECOVERED (healthy | active): its open remediation closes `closed_recovered`, automatically, naming
       the health event that recovered it; the gap's window ends here. A redelivery finds none open and closes nothing more. */
    FOR rm IN SELECT * FROM observation.coverage_remediations x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.source_id = p_source_id AND x.state IN ('open', 'in_progress') FOR UPDATE LOOP
      v_rat := clock_timestamp();
      v_rclosure := jsonb_build_object('kind', 'recovered', 'by', p_actor, 'at', v_rat, 'automatic', true, 'health_event', p_event_id,
                                       'health', jsonb_build_object('state', p_health_state, 'at', v_rat, 'basis', 'the source-health subscriber', 'ref', p_event_id), 'note', p_reason);
      UPDATE observation.coverage_remediations SET state = 'closed_recovered', closure = v_rclosure, closed_at = v_rat, gap_to = greatest(v_rat, gap_from),
             gap = jsonb_set(gap, '{window,to}', to_jsonb(greatest(v_rat, gap_from))), updated_at = v_rat
       WHERE remediation_id = rm.remediation_id;
      INSERT INTO observation.coverage_remediation_events (event_id, scope, tenant_id, domain_id, remediation_id, event, actor_principal_id, details, occurred_at, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, rm.remediation_id, 'remediation.closed', p_actor,
              jsonb_build_object('from_state', rm.state, 'state', 'closed_recovered', 'closure', v_rclosure), v_rat, p_correlation);
      v_remediated := v_remediated || jsonb_build_object('remediation_id', rm.remediation_id, 'from_state', rm.state, 'state', 'closed_recovered');
    END LOOP;
    /* end B28 remediation */
  END IF;
  RETURN jsonb_build_object('source_id', p_source_id, 'health_state', p_health_state, 'degraded', v_degraded, 'set', v_set, 'kept', v_kept, 'changed', v_changed, 'cleared', v_cleared,
                            /* B28 (0088) remediation */ 'remediations_closed', v_remediated /* end B28 remediation */,
                            'cause', v_cause /* B40 rg */);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.mark_source_impact(uuid,uuid,uuid,text,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.mark_source_impact(uuid,uuid,uuid,text,text,uuid,uuid,uuid) TO eye_commit;

-- observation.upsert_scheduler_entry — 0022:1594, its LAST definition, copied WHOLE; the one change, marked `-- B40 rg`: the rights acts
-- (observation.source.change_rights, and the v1–v3 rights route observation.source.rights) may remove the schedule entry of a withdrawn
-- source and restore that of a resumed one (the route keeps the Redis job and this row in step, inside the same governed operation).
CREATE OR REPLACE FUNCTION observation.upsert_scheduler_entry(
  p_source_id uuid, p_tenant uuid, p_domain uuid, p_contract_version int,
  p_scheduler_id text, p_queue text, p_cadence int, p_jitter int, p_status text
) RETURNS void
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  -- Registering an agent for an ALREADY ACTIVE source is the moment its schedule
  -- becomes possible, so that action establishes a schedule too. Without it a
  -- source activated before its agent existed would stay active with nothing
  -- scheduled to collect it.
  PERFORM observation.assert_authority(ARRAY[
    'observation.source.transition', 'observation.schedule.set', 'observation.agent.register',
    'observation.source.change_rights', 'observation.source.rights']);   -- B40 rg: the rights acts remove / restore the schedule
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_status = 'scheduled' AND p_cadence < 60 THEN
    RAISE EXCEPTION 'schedule rejected: the local profile enforces a 60-second minimum polling interval (requested %s)',
      p_cadence USING ERRCODE = '23514';
  END IF;
  INSERT INTO observation.scheduler_entries (
    source_id, scope, tenant_id, domain_id, contract_version, scheduler_id, queue_name,
    cadence_seconds, jitter_seconds, status, removed_at
  ) VALUES (
    p_source_id, 'DOMAIN', p_tenant, p_domain, p_contract_version, p_scheduler_id, p_queue,
    greatest(p_cadence, 60), p_jitter, p_status,
    CASE WHEN p_status = 'removed' THEN clock_timestamp() END)
  ON CONFLICT (source_id) DO UPDATE
    SET contract_version = EXCLUDED.contract_version, scheduler_id = EXCLUDED.scheduler_id,
        queue_name = EXCLUDED.queue_name, cadence_seconds = EXCLUDED.cadence_seconds,
        jitter_seconds = EXCLUDED.jitter_seconds, status = EXCLUDED.status,
        removed_at = EXCLUDED.removed_at;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.upsert_scheduler_entry(uuid,uuid,uuid,int,text,text,int,int,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.upsert_scheduler_entry(uuid,uuid,uuid,int,text,text,int,int,text) TO eye_commit;


-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §VA — the evidence vault's authenticity, evidence attributes and obligation inheritance (F-P1-02)
-- FOLDED by the integrator from 0123_b40_x_va.sql (b40/va), verbatim below unless a line is marked `-- B40 integration`.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0123 §VA — CP-6 B40, part `va` (folded into 0123 after §0 and §RG): THE EVIDENCE VAULT'S AUTHENTICITY, EVIDENCE ATTRIBUTES AND
-- OBLIGATION INHERITANCE (F-P1-02: L1-C06, V00-T-033, ES-29-002, V02-T-038; re-verified V00-T-120, V00-T-122, L1-C05, L1-I05, EVD, ES-29-004,
-- AI-39-003). Applies ALONE on 0001–0122 + 0123 §0; 0001–0122 and 0123 §0 untouched.
--
--   observation.publisher_keys (+ _events)   THE ANCHORS a source's content is verified against: an Ed25519 public key (SPKI PEM; its
--                                            fingerprint ed25519:<the first 16 hex of sha256(DER)>, the shape 0073 / 0076 fixed) or a TLS SPKI
--                                            pin (sha256, base64), per source, under the contract's key reference, with a validity window;
--                                            DECLARED and RETIRED by a named data steward or collection manager (human-gated; never an agent —
--                                            governance.assert_approver re-checks the person and the role); retire-only; a rotation names the
--                                            key it replaces (`rotated_from` — B17's idiom) and retires it in the same act.
--   observation.evidence_authenticity        THE OUTCOME per admitted EVD version (or per quarantine case): verified | failed | unsigned |
--                                            unavailable (| unknown_signer for a quarantined item), the scheme, the key, the presented
--                                            signature and its digest — written by the authenticate stage's `record` inside the admission /
--                                            quarantine transaction (observation.record_evidence_authenticity; + custody.authenticity_recorded).
--                                            DESIGN D6: a FAILED signature is ADMITTED marked, an UNKNOWN signer quarantined (the stage).
--   observation._va_use_refusal              §0's stub REPLACED WHOLE (the same signature, STABLE, invoker, search path, no grant): an evidence
--                                            version recorded FAILED is refused at a decision-active use (`authenticity_failed`, 409) — it stays
--                                            admitted and readable (D9: no read changes), and reads weak.
--   graph.ev_evidence_state                  re-declared WHOLE from 0121 (§VA only): + `authenticity` (the recorded outcome, or "not recorded"),
--                                            a FAILED version carries the reason `authenticity_failed` and reads `unverifiable`. Its
--                                            `contract_rights_state` and `rights_state` unchanged (§RG's refusal reads them).
--   graph.px_strength_of                     re-declared WHOLE from 0121 (§VA only): the computation graph.provenance_strength and
--                                            graph.trust_envelope share — a FAILED evidence version on the path is WEAK (`authenticity_failed`),
--                                            an unavailable check PARTIAL. graph.provenance_strength itself is unchanged (it delegates here), so
--                                            the read and the envelope agree. The strength rule's version string is kept (no evidence before B40
--                                            carries a row, so every earlier answer is unchanged); the new reasons name their rule
--                                            (b40-va-authenticity-1).
--   observation.evidence_attributes          A SIDE LEDGER per EVD version (DESIGN D11, D22 — no header field, no back-fill): geographic scope,
--                                            language, sensitivity and the licence (by reference to the rights terms in force at admission, else
--                                            the contract's licence), from SRC@v4 `evidence_attributes` at intake; a data steward's override
--                                            with a reason supersedes (append-only). A version admitted before B40 reads "not recorded".
--   objects.transformation_rules (+ _events) THE TRANSFORMATION-RULE REGISTER (ES-29-002): a rule that lets a derived object of named types
--                                            carry a LESS restrictive obligation than it inherits (classification, residency, rights,
--                                            sensitivity, licence), with its rationale; PROPOSED by a data steward, APPROVED or rejected by the
--                                            privacy officer — never its proposer, never an agent; retired by the privacy officer.
--   objects.inherited_obligations            THE READ: the most restrictive obligations a product version inherits through its recorded lineage
--                                            (graph.pv_closure: claim lineage, constructed edges, evidence refs) — classification, residency,
--                                            rights terms, sensitivity, licence — each with the inputs that impose it, compared with the
--                                            product's own header and the approved rules (satisfied | relaxed_by_rule | not_satisfied |
--                                            carried); D22's meaningful NULL kept (the header basis read from objects.version_operations).
--                                            Location / model / agent / side-effect policy dimensions are B62's (F-P7D-04) — stated.
--   retention.tenant_register                THE PER-TENANT RETENTION REGISTER (V02-T-038): every domain's schedules with the evidence under
--                                            each, the overdue and the next expiry, the open actions and the active holds; the profiles no
--                                            active schedule governs. A TENANT read (an auditor, the tenant administrator, the retention
--                                            authority).
--   observation.authenticity_measure         AUTHENTICITY AS A MEASURED COVERAGE DIMENSION (L1-C06): a source's recorded outcomes in a window.
--
-- READS: STABLE, SECURITY DEFINER, a fixed search path, observation.assert_read_scope FIRST, every row within the caller's tenant (and
-- domain); REVOKE ALL FROM PUBLIC; EXECUTE to eye_app and eye_commit. ONE intake read is not guarded by a bound context:
-- observation.publisher_keys_for_intake — the authenticate stage runs between fetch and admission with no request context (the 0076
-- sweeper's precedent for a definer read the API process calls); it answers PUBLIC key material only (no evidence, no content).
-- ACTS: SECURITY DEFINER, observation.assert_authority on the bound action, the scope asserted, the acting principal = public.eye_principal(),
-- the person and the role re-checked in the port (governance.assert_approver), a request id replayed by the same person answers what it
-- recorded; EXECUTE to eye_commit only. TABLES: FORCE RLS (the 0121 idiom), SELECT to eye_app and eye_commit, no write grant; append-only, or
-- retire-only / state-guarded where the comment says so.
--
-- REFUSAL NOUNS (CLASS form; NOT mapped centrally yet — the integrator maps them in observation-errors.ts): `publisher key`,
-- `evidence authenticity`, `evidence attribute`, `transformation rule`, `obligations`, `retention register` — 403 actor | authority |
-- separation_of_duties · 404 unknown_* · 409 state | stale | duplicate | unchanged · 422 the rest. `object use rejected
-- (authenticity_failed)` is §0's (409, mapped).
--
-- THREE CLAIMS: CONSTRUCTION (this file, the stage and phase6-authenticity-b40 — every row there SYNTHETIC); DEMONSTRATED OPERATION (the act —
-- F. Aydın declares the customs publisher's key; SYNTHETIC personas, `claim = 'demonstration'`); REAL ACCEPTANCE — never claimed.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §VA.1 THE PUBLISHER KEYS ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE observation.publisher_keys (
  key_id          uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  source_id       uuid NOT NULL,
  key_ref         text NOT NULL CHECK (key_ref ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$'),
  kind            text NOT NULL CHECK (kind IN ('signing_key', 'tls_spki_pin')),
  algorithm       text NOT NULL,
  public_key_pem  text,
  fingerprint     text NOT NULL,
  valid_from      timestamptz NOT NULL,
  valid_to        timestamptz,
  reason          text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  rotated_from    uuid REFERENCES observation.publisher_keys (key_id),
  declared_by     uuid NOT NULL,
  declared_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  retired_by      uuid,
  retired_at      timestamptz,
  retire_reason   text,
  request_id      uuid NOT NULL UNIQUE,
  correlation_id  uuid NOT NULL,
  CONSTRAINT opk_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT opk_material CHECK ((kind = 'signing_key' AND algorithm = 'Ed25519' AND public_key_pem IS NOT NULL AND fingerprint ~ '^ed25519:[0-9a-f]{16}$')
                              OR (kind = 'tls_spki_pin' AND algorithm = 'sha256-spki' AND public_key_pem IS NULL AND fingerprint ~ '^[A-Za-z0-9+/]{43}=$')),
  CONSTRAINT opk_validity CHECK (valid_to IS NULL OR valid_to > valid_from),
  CONSTRAINT opk_retire_pair CHECK ((retired_by IS NULL) = (retired_at IS NULL) AND (retired_at IS NULL) = (retire_reason IS NULL)
                                    AND (retired_at IS NULL OR length(btrim(retire_reason)) >= 8))
);
COMMENT ON TABLE observation.publisher_keys IS 'B40 §VA (L1-C06; DESIGN D6): the publisher key anchors of a source — an Ed25519 signing key (SPKI PEM, fingerprint ed25519:<16 hex>) or a TLS SPKI pin — with its validity, declared and retired by a named data steward or collection manager (human-gated); retire-only; a rotation names rotated_from. A retired key verifies nothing new.';
CREATE UNIQUE INDEX opk_fingerprint_active ON observation.publisher_keys (tenant_id, domain_id, source_id, fingerprint) WHERE retired_at IS NULL;
CREATE INDEX opk_source ON observation.publisher_keys (tenant_id, domain_id, source_id, declared_at);
CREATE OR REPLACE FUNCTION observation.publisher_keys_retire_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'table observation.publisher_keys is append-only (ADR-P0-07): DELETE prohibited' USING ERRCODE = '42501'; END IF;
  IF OLD.retired_at IS NOT NULL OR NEW.retired_at IS NULL
     OR (to_jsonb(NEW) - ARRAY['retired_by', 'retired_at', 'retire_reason']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['retired_by', 'retired_at', 'retire_reason']) THEN
    RAISE EXCEPTION 'a publisher key is retired once; nothing else about it changes' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER opk_retire_only BEFORE UPDATE OR DELETE ON observation.publisher_keys FOR EACH ROW EXECUTE FUNCTION observation.publisher_keys_retire_only();

CREATE TABLE observation.publisher_key_events (
  event_id        uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  key_id          uuid NOT NULL REFERENCES observation.publisher_keys (key_id),
  source_id       uuid NOT NULL,
  event           text NOT NULL CHECK (event IN ('key.declared', 'key.retired', 'key.rotated')),
  actor           uuid NOT NULL,
  occurred_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  details         jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  correlation_id  uuid NOT NULL,
  CONSTRAINT opke_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
COMMENT ON TABLE observation.publisher_key_events IS 'B40 §VA: the ledger of the publisher-key acts (declared, retired, rotated) — who, when, why; append-only.';
CREATE INDEX opke_key ON observation.publisher_key_events (key_id, occurred_at);
CREATE TRIGGER opke_append_only BEFORE UPDATE OR DELETE ON observation.publisher_key_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- §VA.2 THE AUTHENTICITY LEDGER ──────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE observation.evidence_authenticity (
  record_id        uuid PRIMARY KEY,
  scope            text NOT NULL,
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  source_id        uuid NOT NULL,
  contract_version int  NOT NULL CHECK (contract_version >= 1),
  run_id           uuid,
  evd_object_id    uuid,
  evd_version      int,
  case_id          uuid,
  manifest_id      uuid,
  content_digest   text CHECK (content_digest IS NULL OR content_digest ~ '^[0-9a-f]{64}$'),
  item_key         text,
  outcome          text NOT NULL CHECK (outcome IN ('verified', 'failed', 'unsigned', 'unavailable', 'unknown_signer')),
  scheme           text NOT NULL CHECK (scheme IN ('none', 'ed25519_detached', 'jws')),
  key_id           uuid REFERENCES observation.publisher_keys (key_id),
  key_fingerprint  text,
  key_ref          text,
  signature        text CHECK (signature IS NULL OR length(signature) BETWEEN 8 AND 8192),
  signature_digest text CHECK (signature_digest IS NULL OR signature_digest ~ '^[0-9a-f]{64}$'),
  detail           jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(detail) = 'object'),
  recorded_by      uuid,
  recorded_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id   uuid NOT NULL,
  CONSTRAINT oea_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  -- exactly one subject: an admitted EVD version, or a quarantine case (an unknown signer is never admitted — D6)
  CONSTRAINT oea_subject CHECK ((evd_object_id IS NOT NULL AND evd_version IS NOT NULL AND evd_version >= 1 AND case_id IS NULL AND outcome <> 'unknown_signer')
                             OR (evd_object_id IS NULL AND evd_version IS NULL AND case_id IS NOT NULL)),
  -- verified names the key that verified it; a scheme of none is unsigned; a presented signature carries its digest
  CONSTRAINT oea_verified_key CHECK (outcome <> 'verified' OR (key_id IS NOT NULL AND scheme <> 'none')),
  CONSTRAINT oea_none_unsigned CHECK (scheme <> 'none' OR outcome = 'unsigned'),
  CONSTRAINT oea_signature_digest CHECK ((signature IS NULL) = (signature_digest IS NULL))
);
COMMENT ON TABLE observation.evidence_authenticity IS 'B40 §VA (L1-C06, AI-39-003; DESIGN D6, D11): the content-authenticity outcome per admitted EVD version (verified | failed | unsigned | unavailable) or per quarantine case (unknown_signer) — the scheme, the key, the presented signature — recorded by the authenticate stage inside the admission / quarantine transaction. A side ledger: the EVD@v1 payload keeps its enum (content_authenticity verified only for verified). Append-only; no back-fill.';
CREATE UNIQUE INDEX oea_version ON observation.evidence_authenticity (evd_object_id, evd_version) WHERE evd_object_id IS NOT NULL;
CREATE UNIQUE INDEX oea_case ON observation.evidence_authenticity (case_id) WHERE case_id IS NOT NULL;
CREATE INDEX oea_source ON observation.evidence_authenticity (tenant_id, domain_id, source_id, recorded_at);
CREATE TRIGGER oea_append_only BEFORE UPDATE OR DELETE ON observation.evidence_authenticity FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- §VA.3 THE EVIDENCE ATTRIBUTES ──────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE observation.evidence_attributes (
  attribute_id     uuid PRIMARY KEY,
  scope            text NOT NULL,
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  evd_object_id    uuid NOT NULL,
  evd_version      int  NOT NULL CHECK (evd_version >= 1),
  source_id        uuid,
  contract_version int,
  attribute        text NOT NULL CHECK (attribute IN ('geographic_scope', 'language', 'sensitivity', 'licence')),
  value            jsonb NOT NULL,
  basis            text NOT NULL CHECK (basis IN ('source_contract', 'steward')),
  basis_ref        text NOT NULL CHECK (length(btrim(basis_ref)) >= 3),
  reason           text CHECK (reason IS NULL OR length(btrim(reason)) BETWEEN 8 AND 2000),
  supersedes       uuid REFERENCES observation.evidence_attributes (attribute_id),
  recorded_by      uuid NOT NULL,
  recorded_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  request_id       uuid UNIQUE,
  correlation_id   uuid NOT NULL,
  CONSTRAINT oeat_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT oeat_steward_reason CHECK (basis <> 'steward' OR (reason IS NOT NULL AND request_id IS NOT NULL))
);
COMMENT ON TABLE observation.evidence_attributes IS 'B40 §VA (V00-T-033, EVD; DESIGN D11, D22): the evidence attributes of an EVD version — geographic scope, language, sensitivity, licence — each a value with its basis (the SRC@v4 declaration at intake, or a data steward''s override with a reason, which supersedes). A side ledger: no header field, no back-fill (a version admitted before B40 reads "not recorded"). Append-only.';
CREATE INDEX oeat_version ON observation.evidence_attributes (evd_object_id, evd_version, attribute, recorded_at);
CREATE TRIGGER oeat_append_only BEFORE UPDATE OR DELETE ON observation.evidence_attributes FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- §VA.4 THE TRANSFORMATION-RULE REGISTER ─────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE objects.transformation_rules (
  rule_id          uuid PRIMARY KEY,
  scope            text NOT NULL,
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  obligation       text NOT NULL CHECK (obligation IN ('classification', 'residency', 'rights', 'sensitivity', 'licence')),
  transformation   text NOT NULL CHECK (transformation ~ '^[a-z][a-z0-9_]{2,40}$'),
  from_value       text NOT NULL CHECK (length(btrim(from_value)) BETWEEN 1 AND 200),
  to_value         text NOT NULL CHECK (length(btrim(to_value)) BETWEEN 1 AND 200),
  object_types     text[] NOT NULL CHECK (cardinality(object_types) BETWEEN 1 AND 20),
  rationale        text NOT NULL CHECK (length(btrim(rationale)) BETWEEN 20 AND 4000),
  state            text NOT NULL CHECK (state IN ('proposed', 'approved', 'rejected', 'retired')),
  proposed_by      uuid NOT NULL,
  proposed_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_by       uuid,
  decided_at       timestamptz,
  decision_reason  text,
  retired_by       uuid,
  retired_at       timestamptz,
  retire_reason    text,
  request_id       uuid NOT NULL UNIQUE,
  correlation_id   uuid NOT NULL,
  CONSTRAINT otr_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT otr_decided CHECK ((state = 'proposed') = (decided_at IS NULL) AND (decided_at IS NULL) = (decided_by IS NULL) AND (decided_at IS NULL) = (decision_reason IS NULL)),
  CONSTRAINT otr_retired CHECK ((state = 'retired') = (retired_at IS NOT NULL) AND (retired_at IS NULL) = (retired_by IS NULL) AND (retired_at IS NULL) = (retire_reason IS NULL)),
  CONSTRAINT otr_not_self CHECK (decided_by IS NULL OR decided_by <> proposed_by)
);
COMMENT ON TABLE objects.transformation_rules IS 'B40 §VA (ES-29-002): the TRANSFORMATION-RULE register — a rule that lets a derived object of the named types carry a less restrictive obligation (from_value → to_value) than it inherits, with its rationale; proposed by a data steward, approved or rejected by the privacy officer (never the proposer, never an agent), retired by the privacy officer. Only an APPROVED rule relaxes anything (objects.inherited_obligations). The state moves by the trigger''s transitions alone.';
CREATE INDEX otr_domain ON objects.transformation_rules (tenant_id, domain_id, obligation, state);
CREATE OR REPLACE FUNCTION objects.transformation_rules_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'table objects.transformation_rules is append-only (ADR-P0-07): DELETE prohibited' USING ERRCODE = '42501'; END IF;
  IF NOT ((OLD.state = 'proposed' AND NEW.state IN ('approved', 'rejected')) OR (OLD.state = 'approved' AND NEW.state = 'retired'))
     OR (to_jsonb(NEW) - ARRAY['state', 'decided_by', 'decided_at', 'decision_reason', 'retired_by', 'retired_at', 'retire_reason'])
        IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['state', 'decided_by', 'decided_at', 'decision_reason', 'retired_by', 'retired_at', 'retire_reason'])
     OR (OLD.state <> 'proposed' AND (NEW.decided_by, NEW.decided_at, NEW.decision_reason) IS DISTINCT FROM (OLD.decided_by, OLD.decided_at, OLD.decision_reason)) THEN
    RAISE EXCEPTION 'a transformation rule moves proposed → approved | rejected, and approved → retired; nothing else about it changes' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER otr_transition BEFORE UPDATE OR DELETE ON objects.transformation_rules FOR EACH ROW EXECUTE FUNCTION objects.transformation_rules_transition();

CREATE TABLE objects.transformation_rule_events (
  event_id        uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  rule_id         uuid NOT NULL REFERENCES objects.transformation_rules (rule_id),
  event           text NOT NULL CHECK (event IN ('rule.proposed', 'rule.approved', 'rule.rejected', 'rule.retired')),
  actor           uuid NOT NULL,
  occurred_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  details         jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  correlation_id  uuid NOT NULL,
  CONSTRAINT otre_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
COMMENT ON TABLE objects.transformation_rule_events IS 'B40 §VA: the ledger of the transformation-rule acts (proposed, approved, rejected, retired); append-only.';
CREATE INDEX otre_rule ON objects.transformation_rule_events (rule_id, occurred_at);
CREATE TRIGGER otre_append_only BEFORE UPDATE OR DELETE ON objects.transformation_rule_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- the RLS idiom of 0121 / 0122: FORCE, the caller's tenant and (unless TENANT-bound) domain; SELECT to the runtime roles, no write grant
REVOKE ALL ON observation.publisher_keys, observation.publisher_key_events, observation.evidence_authenticity, observation.evidence_attributes,
              objects.transformation_rules, objects.transformation_rule_events FROM PUBLIC;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['observation.publisher_keys', 'observation.publisher_key_events', 'observation.evidence_authenticity', 'observation.evidence_attributes',
                           'objects.transformation_rules', 'objects.transformation_rule_events'] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY va_isolation ON %s
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON %s TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- §VA.5 THE HELPERS (internal; no runtime grant) ─────────────────────────────────────────────────────────────────────────────────────────
/* The acting principal: the bound one, named by the route — never on behalf of another. */
CREATE OR REPLACE FUNCTION observation.va_actor(p_noun text, p_actor uuid) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
DECLARE v uuid := public.eye_principal();
BEGIN
  IF v IS NULL OR p_actor IS NULL OR p_actor IS DISTINCT FROM v THEN
    RAISE EXCEPTION '% rejected (actor): the act is recorded under the acting principal, never on behalf of another', p_noun USING ERRCODE = '42501';
  END IF;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION observation.va_actor(text, uuid) FROM PUBLIC;

/* A key as every read gives it, with its state at the instant: retired | not_yet_valid | expired | in_force. */
CREATE OR REPLACE FUNCTION observation.pk_json(k observation.publisher_keys, p_at timestamptz) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = observation, graph, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN k.key_id IS NULL THEN NULL ELSE jsonb_build_object(
    'key_id', k.key_id, 'source_id', k.source_id, 'key_ref', k.key_ref, 'kind', k.kind, 'algorithm', k.algorithm, 'fingerprint', k.fingerprint,
    'public_key_pem', k.public_key_pem, 'valid_from', graph.pv_iso(k.valid_from), 'valid_to', graph.pv_iso(k.valid_to), 'reason', k.reason,
    'rotated_from', k.rotated_from, 'declared_by', k.declared_by, 'declared_at', graph.pv_iso(k.declared_at),
    'retired_by', k.retired_by, 'retired_at', graph.pv_iso(k.retired_at), 'retire_reason', k.retire_reason,
    'state', CASE WHEN k.retired_at IS NOT NULL THEN 'retired' WHEN p_at < k.valid_from THEN 'not_yet_valid'
                  WHEN k.valid_to IS NOT NULL AND k.valid_to <= p_at THEN 'expired' ELSE 'in_force' END) END
$$;
REVOKE ALL ON FUNCTION observation.pk_json(observation.publisher_keys, timestamptz) FROM PUBLIC;

/* The sensitivity rank the inheritance folds by (an unknown word is the most restrictive). */
CREATE OR REPLACE FUNCTION objects.sensitivity_rank(p text) RETURNS int
IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE p WHEN 'none' THEN 0 WHEN 'commercial' THEN 1 WHEN 'personal' THEN 2 WHEN 'special_category' THEN 3 ELSE 3 END;
$$ LANGUAGE sql;
GRANT EXECUTE ON FUNCTION objects.sensitivity_rank(text) TO eye_app, eye_commit;

-- §VA.6 DECLARE / RETIRE A PUBLISHER KEY (observation.authenticity.key.declare / .retire — human-gated) ───────────────────────────────────
/* A named data steward or collection manager declares a key of a source recorded in this domain: an Ed25519 signing key (its PEM checked
   to be the 44-byte Ed25519 SubjectPublicKeyInfo; the fingerprint COMPUTED here — ed25519:<the first 16 hex of sha256(DER)>) or a TLS SPKI
   pin (sha256 of the SPKI, base64). The validity starts at p_valid_from (now when none) and ends at p_valid_to (none: open). A key already
   active for the source is refused (duplicate). A ROTATION names the active key it replaces (p_rotated_from — the same source and kind),
   which is retired in the same act. The request id replays. */
CREATE OR REPLACE FUNCTION observation.declare_publisher_key(
  p_request_id uuid, p_tenant uuid, p_domain uuid, p_source_id uuid, p_key_ref text, p_kind text, p_public_key_pem text, p_pin text,
  p_valid_from timestamptz, p_valid_to timestamptz, p_rotated_from uuid, p_reason text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; k observation.publisher_keys%ROWTYPE; old observation.publisher_keys%ROWTYPE; v_body text; v_der bytea; v_fp text;
        v_from timestamptz; v_at timestamptz := clock_timestamp(); v_id uuid := gen_random_uuid();
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.authenticity.key.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := observation.va_actor('publisher key', p_actor);
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'publisher key rejected (request): a declaration carries its request id (the command identity a retry reuses)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO k FROM observation.publisher_keys x WHERE x.request_id = p_request_id;
  IF FOUND THEN
    IF k.declared_by IS DISTINCT FROM v_actor OR k.tenant_id IS DISTINCT FROM p_tenant OR k.domain_id IS DISTINCT FROM p_domain OR k.source_id IS DISTINCT FROM p_source_id THEN
      RAISE EXCEPTION 'publisher key rejected (duplicate): request % already recorded another act; a new declaration takes a new request id', p_request_id USING ERRCODE = '23505';
    END IF;
    RETURN observation.pk_json(k, v_at) || jsonb_build_object('replayed', true);
  END IF;
  -- WHO: a named active person holding data_steward or collection_manager here (never an agent, never a system)
  PERFORM governance.assert_approver('publisher key', v_actor, p_tenant, p_domain, ARRAY['data_steward', 'collection_manager'], NULL, NULL, 'declaring a publisher''s key');
  IF p_source_id IS NULL OR NOT EXISTS (SELECT 1 FROM observation.source_contracts_current s WHERE s.source_id = p_source_id AND s.tenant_id = p_tenant AND s.domain_id = p_domain) THEN
    RAISE EXCEPTION 'publisher key rejected (unknown_source): source % is not recorded in this domain', coalesce(p_source_id::text, '<none>') USING ERRCODE = '23503';
  END IF;
  IF p_key_ref IS NULL OR p_key_ref !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$' THEN
    RAISE EXCEPTION 'publisher key rejected (key_ref): the key reference is 2 to 128 characters of letters, digits and . _ : - (the name the contract''s authenticity.key_refs uses)' USING ERRCODE = '22023';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('signing_key', 'tls_spki_pin') THEN
    RAISE EXCEPTION 'publisher key rejected (kind): a key is a signing_key (an Ed25519 public key) or a tls_spki_pin (the sha256 of a TLS SubjectPublicKeyInfo, base64)' USING ERRCODE = '22023';
  END IF;
  IF p_kind = 'signing_key' THEN
    IF p_pin IS NOT NULL OR p_public_key_pem IS NULL OR p_public_key_pem !~ '^-----BEGIN PUBLIC KEY-----\n([A-Za-z0-9+/=]+\n)+-----END PUBLIC KEY-----\n?$' THEN
      RAISE EXCEPTION 'publisher key rejected (key): a signing key is an Ed25519 SubjectPublicKeyInfo in PEM (-----BEGIN PUBLIC KEY-----), and nothing else' USING ERRCODE = '22023';
    END IF;
    v_body := regexp_replace(p_public_key_pem, '-----(BEGIN|END) PUBLIC KEY-----|\s', '', 'g');
    IF v_body !~ '^[A-Za-z0-9+/]+={0,2}$' OR length(v_body) % 4 <> 0 THEN
      RAISE EXCEPTION 'publisher key rejected (key): a signing key is an Ed25519 SubjectPublicKeyInfo in PEM (-----BEGIN PUBLIC KEY-----), and nothing else' USING ERRCODE = '22023';
    END IF;
    v_der := decode(v_body, 'base64');
    IF length(v_der) <> 44 OR substring(v_der from 1 for 12) <> '\x302a300506032b6570032100'::bytea THEN
      RAISE EXCEPTION 'publisher key rejected (key): a signing key is an Ed25519 SubjectPublicKeyInfo in PEM (-----BEGIN PUBLIC KEY-----), and nothing else' USING ERRCODE = '22023';
    END IF;
    v_fp := 'ed25519:' || left(encode(sha256(v_der), 'hex'), 16);
  ELSE
    IF p_public_key_pem IS NOT NULL OR p_pin IS NULL OR p_pin !~ '^[A-Za-z0-9+/]{43}=$' THEN
      RAISE EXCEPTION 'publisher key rejected (key): a TLS SPKI pin is the base64 sha256 of the endpoint''s SubjectPublicKeyInfo (44 characters, ending in =), with no PEM' USING ERRCODE = '22023';
    END IF;
    v_fp := p_pin;
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'publisher key rejected (reason): a reason of 8 to 2000 characters says where the key comes from (the publisher''s notice, its key page, the exchange)' USING ERRCODE = '22023';
  END IF;
  v_from := coalesce(p_valid_from, v_at);
  IF p_valid_to IS NOT NULL AND p_valid_to <= v_from THEN
    RAISE EXCEPTION 'publisher key rejected (validity): the validity ends (%) after it starts (%)', p_valid_to, v_from USING ERRCODE = '22023';
  END IF;
  -- one act at a time per source; the partial unique index is the backstop
  PERFORM pg_advisory_xact_lock(hashtextextended('observation.publisher_keys:' || p_tenant || ':' || p_domain || ':' || p_source_id, 0));
  IF EXISTS (SELECT 1 FROM observation.publisher_keys x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.source_id = p_source_id AND x.fingerprint = v_fp AND x.retired_at IS NULL) THEN
    RAISE EXCEPTION 'publisher key rejected (duplicate): key % is already declared for this source (retire it to declare it again)', v_fp USING ERRCODE = '23505';
  END IF;
  IF p_rotated_from IS NOT NULL THEN
    SELECT * INTO old FROM observation.publisher_keys x WHERE x.key_id = p_rotated_from AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'publisher key rejected (unknown_key): key % is not recorded in this domain', p_rotated_from USING ERRCODE = '23503'; END IF;
    IF old.source_id IS DISTINCT FROM p_source_id OR old.kind IS DISTINCT FROM p_kind THEN
      RAISE EXCEPTION 'publisher key rejected (rotation): a rotation replaces a key of the same source and kind (key % is a % of source %)', old.fingerprint, old.kind, old.source_id USING ERRCODE = '22023';
    END IF;
    IF old.retired_at IS NOT NULL THEN
      RAISE EXCEPTION 'publisher key rejected (state): key % was retired at % — a rotation replaces an active key', old.fingerprint, graph.pv_iso(old.retired_at) USING ERRCODE = '23514';  -- B40 integration: 23514 (the mapped refusal SQLSTATE; 55000 is outside the observation mapper)
    END IF;
  END IF;
  INSERT INTO observation.publisher_keys (key_id, scope, tenant_id, domain_id, source_id, key_ref, kind, algorithm, public_key_pem, fingerprint, valid_from, valid_to, reason,
                                          rotated_from, declared_by, declared_at, request_id, correlation_id)
  VALUES (v_id, 'DOMAIN', p_tenant, p_domain, p_source_id, p_key_ref, p_kind, CASE WHEN p_kind = 'signing_key' THEN 'Ed25519' ELSE 'sha256-spki' END,
          CASE WHEN p_kind = 'signing_key' THEN p_public_key_pem END, v_fp, v_from, p_valid_to, btrim(p_reason), p_rotated_from, v_actor, v_at, p_request_id, p_correlation)
  RETURNING * INTO k;
  INSERT INTO observation.publisher_key_events (event_id, scope, tenant_id, domain_id, key_id, source_id, event, actor, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, k.key_id, k.source_id, 'key.declared', v_actor,
          jsonb_build_object('key_ref', k.key_ref, 'kind', k.kind, 'fingerprint', k.fingerprint, 'valid_from', graph.pv_iso(k.valid_from), 'valid_to', graph.pv_iso(k.valid_to),
                             'rotated_from', k.rotated_from, 'reason', k.reason), p_correlation);
  IF p_rotated_from IS NOT NULL THEN
    UPDATE observation.publisher_keys SET retired_at = v_at, retired_by = v_actor, retire_reason = format('rotated to key %s (%s): %s', k.fingerprint, k.key_ref, btrim(p_reason))
     WHERE key_id = p_rotated_from;
    INSERT INTO observation.publisher_key_events (event_id, scope, tenant_id, domain_id, key_id, source_id, event, actor, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_rotated_from, p_source_id, 'key.rotated', v_actor,
            jsonb_build_object('rotated_to', k.key_id, 'fingerprint', old.fingerprint, 'to_fingerprint', k.fingerprint, 'reason', btrim(p_reason)), p_correlation);
  END IF;
  RETURN observation.pk_json(k, v_at) || jsonb_build_object('replayed', false);
END $$;
REVOKE ALL ON FUNCTION observation.declare_publisher_key(uuid, uuid, uuid, uuid, text, text, text, text, timestamptz, timestamptz, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.declare_publisher_key(uuid, uuid, uuid, uuid, text, text, text, text, timestamptz, timestamptz, uuid, text, uuid, uuid) TO eye_commit;

/* The retirement (a mistyped key, a compromised one, a key the publisher withdrew): once, with a reason; the row kept. A retired key verifies
   nothing admitted after it — an item signed only with it reads as an unknown signer and is quarantined (D6). The act BINDS the fingerprint
   the person reviewed (p_fingerprint): the key the id names must be that key (stale otherwise) — the command review's binding, server-enforced. */
CREATE OR REPLACE FUNCTION observation.retire_publisher_key(p_tenant uuid, p_domain uuid, p_key_id uuid, p_fingerprint text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; k observation.publisher_keys%ROWTYPE; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.authenticity.key.retire']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := observation.va_actor('publisher key', p_actor);
  PERFORM governance.assert_approver('publisher key', v_actor, p_tenant, p_domain, ARRAY['data_steward', 'collection_manager'], NULL, NULL, 'retiring a publisher''s key');
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'publisher key rejected (reason): a retirement states its reason (8 to 2000 characters)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO k FROM observation.publisher_keys x WHERE x.key_id = p_key_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'publisher key rejected (unknown_key): key % is not recorded in this domain', coalesce(p_key_id::text, '<none>') USING ERRCODE = '23503'; END IF;
  IF p_fingerprint IS DISTINCT FROM k.fingerprint THEN
    RAISE EXCEPTION 'publisher key rejected (stale): the retirement names key % (%); the key you reviewed is %', p_key_id, k.fingerprint, coalesce(p_fingerprint, '<none>') USING ERRCODE = '23514';
  END IF;
  IF k.retired_at IS NOT NULL THEN
    RAISE EXCEPTION 'publisher key rejected (state): key % was retired at % (%)', k.fingerprint, graph.pv_iso(k.retired_at), k.retire_reason USING ERRCODE = '23514';  -- B40 integration: 23514 (the mapped refusal SQLSTATE; 55000 is outside the observation mapper)
  END IF;
  UPDATE observation.publisher_keys SET retired_at = v_at, retired_by = v_actor, retire_reason = btrim(p_reason) WHERE key_id = p_key_id RETURNING * INTO k;
  INSERT INTO observation.publisher_key_events (event_id, scope, tenant_id, domain_id, key_id, source_id, event, actor, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, k.key_id, k.source_id, 'key.retired', v_actor, jsonb_build_object('fingerprint', k.fingerprint, 'reason', k.retire_reason), p_correlation);
  RETURN observation.pk_json(k, v_at);
END $$;
REVOKE ALL ON FUNCTION observation.retire_publisher_key(uuid, uuid, uuid, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.retire_publisher_key(uuid, uuid, uuid, text, text, uuid, uuid) TO eye_commit;

-- §VA.7 THE INTAKE READ (the authenticate stage; no request context) ─────────────────────────────────────────────────────────────────────
/* The source's keys that are not retired, with their validity — PUBLIC key material only (the PEM of a public key, a pin, a fingerprint), never
   evidence. The stage runs between fetch and admission, outside any request (the lifecycle's run), so this definer read is granted to the
   API's runtime role without a bound context (the 0076 sweeper's precedent). The stage decides "in force" at the item's instant. */
CREATE OR REPLACE FUNCTION observation.publisher_keys_for_intake(p_tenant uuid, p_domain uuid, p_source_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = observation, graph, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('key_id', k.key_id, 'key_ref', k.key_ref, 'kind', k.kind, 'algorithm', k.algorithm, 'fingerprint', k.fingerprint,
                                               'public_key_pem', k.public_key_pem, 'valid_from', graph.pv_iso(k.valid_from), 'valid_to', graph.pv_iso(k.valid_to))
                            ORDER BY k.declared_at, k.key_id), '[]'::jsonb)
    FROM observation.publisher_keys k
   WHERE k.tenant_id = p_tenant AND k.domain_id = p_domain AND k.source_id = p_source_id AND k.retired_at IS NULL
$$;
REVOKE ALL ON FUNCTION observation.publisher_keys_for_intake(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.publisher_keys_for_intake(uuid, uuid, uuid) TO eye_app, eye_commit;

-- §VA.8 THE RECORD PORTS (inside the admission / quarantine transaction) ──────────────────────────────────────────────────────────────────
/* THE AUTHENTICITY OUTCOME of one item, recorded by the authenticate stage's `record` beside the record it describes: an admitted EVD version
   (observation.item.admit) or a quarantine case (observation.item.quarantine). The subject is checked to exist in this domain, the key to be
   one of the source's; + `custody.authenticity_recorded` through the custody port. p_rec: { source_id, contract_version, run_id,
   evd_object_id, evd_version | case_id, manifest_id, content_digest, item_key, outcome, scheme, key_id, signature, detail, actor,
   agent_principal_id, agent_version, code_digest, connector, connector_version, method_ref }. Returns the record id. */
CREATE OR REPLACE FUNCTION observation.record_evidence_authenticity(p_tenant uuid, p_domain uuid, p_rec jsonb, p_correlation uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
DECLARE v_id uuid := gen_random_uuid(); v_source uuid; v_cv int; v_evd uuid; v_ver int; v_case uuid; v_outcome text; v_scheme text; v_key uuid;
        k observation.publisher_keys%ROWTYPE; v_sig text; v_manifest uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.item.admit', 'observation.item.quarantine']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_rec IS NULL OR jsonb_typeof(p_rec) <> 'object' THEN RAISE EXCEPTION 'evidence authenticity rejected (record): the record is an object' USING ERRCODE = '22023'; END IF;
  v_source := (p_rec ->> 'source_id')::uuid; v_cv := (p_rec ->> 'contract_version')::int;
  v_evd := NULLIF(p_rec ->> 'evd_object_id', '')::uuid; v_ver := NULLIF(p_rec ->> 'evd_version', '')::int; v_case := NULLIF(p_rec ->> 'case_id', '')::uuid;
  v_outcome := p_rec ->> 'outcome'; v_scheme := p_rec ->> 'scheme'; v_key := NULLIF(p_rec ->> 'key_id', '')::uuid; v_sig := NULLIF(p_rec ->> 'signature', '');
  v_manifest := NULLIF(p_rec ->> 'manifest_id', '')::uuid;
  IF v_outcome IS NULL OR v_outcome NOT IN ('verified', 'failed', 'unsigned', 'unavailable', 'unknown_signer') THEN
    RAISE EXCEPTION 'evidence authenticity rejected (outcome): % is not an outcome (verified | failed | unsigned | unavailable | unknown_signer)', coalesce(v_outcome, '<none>') USING ERRCODE = '22023';
  END IF;
  IF v_scheme IS NULL OR v_scheme NOT IN ('none', 'ed25519_detached', 'jws') THEN
    RAISE EXCEPTION 'evidence authenticity rejected (scheme): % is not a scheme (none | ed25519_detached | jws)', coalesce(v_scheme, '<none>') USING ERRCODE = '22023';
  END IF;
  IF v_source IS NULL OR v_cv IS NULL OR NOT EXISTS (SELECT 1 FROM observation.source_contracts_current s WHERE s.source_id = v_source AND s.contract_version = v_cv AND s.tenant_id = p_tenant AND s.domain_id = p_domain) THEN
    RAISE EXCEPTION 'evidence authenticity rejected (unknown_source): source %@% is not recorded in this domain', coalesce(v_source::text, '<none>'), coalesce(v_cv::text, '?') USING ERRCODE = '23503';
  END IF;
  IF v_evd IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_type = 'EVD' AND o.object_id = v_evd AND o.object_version = v_ver AND o.tenant_id = p_tenant AND o.domain_id = p_domain) THEN
      RAISE EXCEPTION 'evidence authenticity rejected (unknown_evidence): EVD % v% is not recorded in this domain', v_evd, coalesce(v_ver::text, '?') USING ERRCODE = '23503';
    END IF;
  ELSIF v_case IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM observation.quarantine_current q WHERE q.case_id = v_case AND q.tenant_id = p_tenant AND q.domain_id = p_domain) THEN
      RAISE EXCEPTION 'evidence authenticity rejected (unknown_case): quarantine case % is not recorded in this domain', v_case USING ERRCODE = '23503';
    END IF;
  ELSE
    RAISE EXCEPTION 'evidence authenticity rejected (subject): an outcome describes an admitted EVD version or a quarantine case' USING ERRCODE = '22023';
  END IF;
  IF v_key IS NOT NULL THEN
    SELECT * INTO k FROM observation.publisher_keys x WHERE x.key_id = v_key AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.source_id = v_source;
    IF NOT FOUND THEN RAISE EXCEPTION 'evidence authenticity rejected (unknown_key): key % is not a key of source %', v_key, v_source USING ERRCODE = '23503'; END IF;
  END IF;
  INSERT INTO observation.evidence_authenticity (record_id, scope, tenant_id, domain_id, source_id, contract_version, run_id, evd_object_id, evd_version, case_id, manifest_id,
                                                 content_digest, item_key, outcome, scheme, key_id, key_fingerprint, key_ref, signature, signature_digest, detail, recorded_by, correlation_id)
  VALUES (v_id, 'DOMAIN', p_tenant, p_domain, v_source, v_cv, NULLIF(p_rec ->> 'run_id', '')::uuid, v_evd, v_ver, v_case, v_manifest,
          NULLIF(p_rec ->> 'content_digest', ''), left(p_rec ->> 'item_key', 1000), v_outcome, v_scheme, v_key, k.fingerprint, k.key_ref, v_sig,
          CASE WHEN v_sig IS NULL THEN NULL ELSE encode(sha256(convert_to(v_sig, 'UTF8')), 'hex') END,
          CASE WHEN jsonb_typeof(p_rec -> 'detail') = 'object' THEN p_rec -> 'detail' ELSE '{}'::jsonb END, public.eye_principal(), p_correlation);
  PERFORM observation.append_custody(gen_random_uuid(), p_tenant, p_domain, v_manifest, NULL::uuid, v_evd, v_source, v_cv, NULLIF(p_rec ->> 'run_id', '')::uuid,
    'custody.authenticity_recorded', coalesce(p_rec ->> 'actor', 'principal:' || public.eye_principal()::text), NULLIF(p_rec ->> 'agent_principal_id', '')::uuid,
    p_rec ->> 'agent_version', p_rec ->> 'code_digest', p_rec ->> 'connector', p_rec ->> 'connector_version', p_rec ->> 'method_ref',
    NULLIF(p_rec ->> 'content_digest', ''), NULL::boolean,
    jsonb_build_object('record_id', v_id, 'outcome', v_outcome, 'scheme', v_scheme, 'key_fingerprint', k.fingerprint, 'case_id', v_case, 'evd_version', v_ver,
                       'signature_digest', CASE WHEN v_sig IS NULL THEN NULL ELSE encode(sha256(convert_to(v_sig, 'UTF8')), 'hex') END), p_correlation);
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION observation.record_evidence_authenticity(uuid, uuid, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.record_evidence_authenticity(uuid, uuid, jsonb, uuid) TO eye_commit;

/* THE EVIDENCE ATTRIBUTES of an admitted EVD version from its SRC@v4 contract (observation.item.admit, in the admission): geographic scope,
   language and sensitivity as the contract version declares them (read HERE from the recorded contract — never from the caller), and the
   licence by reference to the rights terms in force at admission (observation.rt_current), else the contract's own licence. A contract that
   declares no evidence_attributes (SRC@v1–v3) records nothing (no inference, no back-fill). Idempotent per version. Returns the rows written. */
CREATE OR REPLACE FUNCTION observation.record_evidence_attributes(p_tenant uuid, p_domain uuid, p_evd uuid, p_version int, p_correlation uuid) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
DECLARE e objects.canonical_objects%ROWTYPE; s observation.source_contracts_current%ROWTYPE; v_src uuid; v_cv int; ea jsonb; rt observation.rights_terms; v_lic jsonb;
        v_actor uuid := public.eye_principal(); v_at timestamptz := clock_timestamp(); v_ref text; v_n int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.item.admit']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO e FROM objects.canonical_objects o WHERE o.object_type = 'EVD' AND o.object_id = p_evd AND o.object_version = p_version AND o.tenant_id = p_tenant AND o.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'evidence attribute rejected (unknown_evidence): EVD % v% is not recorded in this domain', p_evd, p_version USING ERRCODE = '23503'; END IF;
  IF EXISTS (SELECT 1 FROM observation.evidence_attributes a WHERE a.evd_object_id = p_evd AND a.evd_version = p_version AND a.basis = 'source_contract') THEN RETURN 0; END IF;
  IF coalesce(e.provenance_ref, '') !~* '^SRC:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@[1-9][0-9]{0,8}$' THEN RETURN 0; END IF;
  v_src := substring(e.provenance_ref from 5 for 36)::uuid; v_cv := split_part(e.provenance_ref, '@', 2)::int;
  SELECT * INTO s FROM observation.source_contracts_current c WHERE c.source_id = v_src AND c.contract_version = v_cv AND c.tenant_id = p_tenant AND c.domain_id = p_domain;
  IF NOT FOUND OR jsonb_typeof(s.contract -> 'evidence_attributes') IS DISTINCT FROM 'object' THEN RETURN 0; END IF;
  ea := s.contract -> 'evidence_attributes';
  v_ref := 'SRC:' || v_src || '@' || v_cv;
  rt := observation.rt_current(p_tenant, p_domain, v_src, v_cv);
  v_lic := CASE WHEN rt.terms_id IS NOT NULL
    THEN jsonb_build_object('terms', 'RTT:' || rt.terms_id || '@' || rt.version, 'state', observation.rt_state(rt, v_at), 'purposes', rt.purposes, 'prohibited_uses', rt.prohibited_uses,
                            'statement', 'the rights terms in force at admission')
    ELSE jsonb_build_object('contract_licence', s.contract #>> '{authority_and_rights,licence}', 'permitted_use', coalesce(s.contract #> '{authority_and_rights,permitted_use}', '[]'::jsonb),
                            'statement', 'no rights terms declared for the contract version at admission — the contract''s own licence stands') END;
  INSERT INTO observation.evidence_attributes (attribute_id, scope, tenant_id, domain_id, evd_object_id, evd_version, source_id, contract_version, attribute, value, basis, basis_ref,
                                               recorded_by, recorded_at, correlation_id)
  SELECT gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_evd, p_version, v_src, v_cv, a.k, a.v, 'source_contract',
         CASE WHEN a.k = 'licence' AND rt.terms_id IS NOT NULL THEN 'RTT:' || rt.terms_id || '@' || rt.version ELSE v_ref END, v_actor, v_at, p_correlation
    FROM (VALUES ('geographic_scope', ea -> 'geographic_scope'), ('language', ea -> 'language'), ('sensitivity', ea -> 'sensitivity'), ('licence', v_lic)) a(k, v)
   WHERE a.v IS NOT NULL AND jsonb_typeof(a.v) <> 'null';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION observation.record_evidence_attributes(uuid, uuid, uuid, int, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.record_evidence_attributes(uuid, uuid, uuid, int, uuid) TO eye_commit;

-- §VA.9 THE STEWARD'S OVERRIDE OF AN ATTRIBUTE (observation.evidence.attribute.set — human-gated) ────────────────────────────────────────
/* A named data steward sets one attribute of an EVD version with a reason; it SUPERSEDES the current value (the earlier row kept). The value:
   geographic_scope a list of 1–50 places (2–120 characters each); language a BCP 47 tag (und for undetermined); sensitivity none |
   commercial | personal | special_category; licence { statement (≥ 3), terms? (RTT:<id>@<v>) }. The request id replays. */
CREATE OR REPLACE FUNCTION observation.ea_value_problem(p_attribute text, p_value jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE p_attribute
    WHEN 'geographic_scope' THEN CASE WHEN jsonb_typeof(p_value) <> 'array' OR jsonb_array_length(p_value) NOT BETWEEN 1 AND 50
                                           OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_value) x WHERE jsonb_typeof(x) <> 'string' OR length(btrim(x #>> '{}')) NOT BETWEEN 2 AND 120)
                                      THEN 'geographic_scope is a list of 1 to 50 places, each 2 to 120 characters' END
    WHEN 'language' THEN CASE WHEN jsonb_typeof(p_value) <> 'string' OR (p_value #>> '{}') !~ '^(und|[a-z]{2,3}(-[A-Za-z0-9]{2,8})*)$'
                              THEN 'language is a BCP 47 tag (en, de-DE, und for undetermined)' END
    WHEN 'sensitivity' THEN CASE WHEN jsonb_typeof(p_value) <> 'string' OR (p_value #>> '{}') NOT IN ('none', 'commercial', 'personal', 'special_category')
                                 THEN 'sensitivity is none, commercial, personal or special_category' END
    WHEN 'licence' THEN CASE WHEN jsonb_typeof(p_value) <> 'object' OR coalesce(length(btrim(p_value ->> 'statement')), 0) < 3
                                  OR (p_value ? 'terms' AND coalesce(p_value ->> 'terms', '') !~* '^RTT:[0-9a-f-]{36}@[1-9][0-9]{0,8}$')
                             THEN 'licence is { statement (3 or more characters), terms (RTT:<id>@<version>, optional) }' END
    ELSE 'the attribute is geographic_scope, language, sensitivity or licence' END
$$;
REVOKE ALL ON FUNCTION observation.ea_value_problem(text, jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION observation.set_evidence_attribute(
  p_request_id uuid, p_tenant uuid, p_domain uuid, p_evd uuid, p_version int, p_attribute text, p_value jsonb, p_reason text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; a observation.evidence_attributes%ROWTYPE; cur observation.evidence_attributes%ROWTYPE; e objects.canonical_objects%ROWTYPE; v_problem text;
        v_src uuid; v_cv int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.evidence.attribute.set']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := observation.va_actor('evidence attribute', p_actor);
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'evidence attribute rejected (request): an override carries its request id' USING ERRCODE = '22023'; END IF;
  SELECT * INTO a FROM observation.evidence_attributes x WHERE x.request_id = p_request_id;
  IF FOUND THEN
    IF a.recorded_by IS DISTINCT FROM v_actor OR a.evd_object_id IS DISTINCT FROM p_evd OR a.evd_version IS DISTINCT FROM p_version OR a.attribute IS DISTINCT FROM p_attribute OR a.tenant_id IS DISTINCT FROM p_tenant THEN
      RAISE EXCEPTION 'evidence attribute rejected (duplicate): request % already recorded another act', p_request_id USING ERRCODE = '23505';
    END IF;
    RETURN to_jsonb(a) || jsonb_build_object('replayed', true);
  END IF;
  PERFORM governance.assert_approver('evidence attribute', v_actor, p_tenant, p_domain, ARRAY['data_steward'], NULL, NULL, 'setting an evidence attribute');
  SELECT * INTO e FROM objects.canonical_objects o WHERE o.object_type = 'EVD' AND o.object_id = p_evd AND o.object_version = p_version AND o.tenant_id = p_tenant AND o.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'evidence attribute rejected (unknown_evidence): EVD % v% is not recorded in this domain', coalesce(p_evd::text, '<none>'), coalesce(p_version::text, '?') USING ERRCODE = '23503'; END IF;
  IF p_attribute IS NULL OR p_attribute NOT IN ('geographic_scope', 'language', 'sensitivity', 'licence') THEN
    RAISE EXCEPTION 'evidence attribute rejected (attribute): % is not an evidence attribute (geographic_scope | language | sensitivity | licence)', coalesce(p_attribute, '<none>') USING ERRCODE = '22023';
  END IF;
  v_problem := observation.ea_value_problem(p_attribute, p_value);
  IF v_problem IS NOT NULL THEN RAISE EXCEPTION 'evidence attribute rejected (value): %', v_problem USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'evidence attribute rejected (reason): an override states its reason (8 to 2000 characters)' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('observation.evidence_attributes:' || p_evd || ':' || p_version, 0));
  SELECT * INTO cur FROM observation.evidence_attributes x WHERE x.evd_object_id = p_evd AND x.evd_version = p_version AND x.attribute = p_attribute ORDER BY x.recorded_at DESC, x.attribute_id DESC LIMIT 1;
  IF cur.attribute_id IS NOT NULL AND cur.value = p_value THEN
    RAISE EXCEPTION 'evidence attribute rejected (unchanged): % of EVD % v% is already %', p_attribute, p_evd, p_version, p_value::text USING ERRCODE = '23514';  -- B40 integration: 23514 (the mapped refusal SQLSTATE; 55000 is outside the observation mapper)
  END IF;
  IF coalesce(e.provenance_ref, '') ~* '^SRC:[0-9a-f-]{36}@[1-9][0-9]{0,8}$' THEN v_src := substring(e.provenance_ref from 5 for 36)::uuid; v_cv := split_part(e.provenance_ref, '@', 2)::int; END IF;
  INSERT INTO observation.evidence_attributes (attribute_id, scope, tenant_id, domain_id, evd_object_id, evd_version, source_id, contract_version, attribute, value, basis, basis_ref, reason,
                                               supersedes, recorded_by, request_id, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_evd, p_version, v_src, v_cv, p_attribute, p_value, 'steward', 'principal:' || v_actor, btrim(p_reason),
          cur.attribute_id, v_actor, p_request_id, p_correlation)
  RETURNING * INTO a;
  RETURN to_jsonb(a) || jsonb_build_object('replayed', false, 'superseded', CASE WHEN cur.attribute_id IS NULL THEN NULL ELSE to_jsonb(cur) END);
END $$;
REVOKE ALL ON FUNCTION observation.set_evidence_attribute(uuid, uuid, uuid, uuid, int, text, jsonb, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.set_evidence_attribute(uuid, uuid, uuid, uuid, int, text, jsonb, text, uuid, uuid) TO eye_commit;

-- §VA.10 THE USE REFUSAL — §0's stub REPLACED WHOLE (DESIGN D6) ────────────────────────────────────────────────────────────────────────────
/* INTERNAL (§0's hook idiom, unchanged: STABLE, invoker, the same search path, no runtime grant — reachable only from objects._lineage_usable
   through §0's dispatcher). An evidence version whose publisher signature FAILED at admission is refused at a decision-active use (a package
   option, a publication, an export, a gate act) — from the CURRENT ledger, no reconciliation tick. It stays admitted and readable (D9: no read
   changes) and shown weak (graph.px_strength_of). Unsigned, unavailable and not-recorded versions are not refused (content authenticity
   unknown is the honest default for most sources). */
CREATE OR REPLACE FUNCTION observation._va_use_refusal(p_tenant uuid, p_domain uuid, p_evd uuid, p_version int) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = observation, pg_catalog, pg_temp AS $$
DECLARE a record;
BEGIN
  -- B40 va: §0's stub replaced (D6) — the recorded FAILED outcome of this version refuses its decision-active use
  SELECT x.scheme, x.key_ref, x.recorded_at, x.record_id INTO a FROM observation.evidence_authenticity x
   WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.evd_object_id = p_evd AND x.evd_version = p_version AND x.outcome = 'failed'
   ORDER BY x.recorded_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('class', 'authenticity_failed',
    'detail', format('whose publisher signature FAILED verification at its admission (%s%s, recorded %s, authenticity record %s) — admitted marked and readable, never established as the publisher''s content',
                     a.scheme, coalesce(', key reference ' || a.key_ref, ''), to_char(a.recorded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), a.record_id));
END $$;
REVOKE ALL ON FUNCTION observation._va_use_refusal(uuid, uuid, uuid, int) FROM PUBLIC;

-- §VA.11 graph.ev_evidence_state — 0121:649 (B82 ev), its LAST definition, copied WHOLE; the additions marked `-- B40 va` ─────────────────────
CREATE OR REPLACE FUNCTION graph.ev_evidence_state(p_tenant uuid, p_domain uuid, p_id uuid, p_version int, p_span_start int, p_span_end int, p_at timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, observation, objects, pg_catalog, pg_temp AS $$
DECLARE
  e objects.canonical_objects; m observation.blob_manifests%ROWTYPE; v_has_m boolean := false; v_manifest uuid; v_digest text; v_len bigint; v_media text;
  v_last_ok timestamptz; v_failed timestamptz; v_last_read text; v_failed_flag boolean := false; v_unreachable boolean := false; v_tomb boolean := false;
  v_tier text := 'hot'; v_src uuid; v_cv int; rt observation.rights_terms; v_rights_state text; v_contract_rights text;
  v_corrected_by text; v_withdrawn_since int; v_events int; v_last_at timestamptz; v_outcome text := 'resolved'; v_reasons text[] := '{}'; v_detail text[] := '{}';
  v_digest_ok boolean; v_start bigint; v_end bigint; v_artifact_ok boolean := true;
  au observation.evidence_authenticity%ROWTYPE; v_auth jsonb; v_auth_failed boolean := false;   -- B40 va
BEGIN
  SELECT * INTO e FROM objects.canonical_objects o
   WHERE o.object_type = 'EVD' AND o.object_id = p_id AND o.object_version = p_version AND o.tenant_id = p_tenant AND o.domain_id = p_domain;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ref', 'EVD:' || p_id || '@' || p_version, 'evidence', NULL, 'digest_ok', NULL, 'custody', NULL, 'rights', NULL, 'tier', NULL,
      'correction', jsonb_build_object('correction_of', NULL, 'corrected_by', NULL), 'outcome', 'inaccessible', 'reasons', jsonb_build_array('not_recorded'),
      'integrity_failed', false, 'unreachable', false, 'tombstoned', false, 'rights_state', NULL,
      'detail', format('evidence %s v%s is not recorded in this domain (or is not visible to this reader)', p_id, p_version));
  END IF;
  v_digest := e.payload ->> 'content_digest';
  v_len := CASE WHEN (e.payload ->> 'byte_length') ~ '^[0-9]{1,15}$' THEN (e.payload ->> 'byte_length')::bigint END;
  v_media := coalesce(e.payload ->> 'media_type_sniffed', e.payload ->> 'media_type_declared');
  IF coalesce(e.payload ->> 'manifest_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN v_manifest := (e.payload ->> 'manifest_id')::uuid; END IF;
  IF v_manifest IS NOT NULL THEN
    SELECT * INTO m FROM observation.blob_manifests b WHERE b.manifest_id = v_manifest AND b.tenant_id = p_tenant AND b.domain_id = p_domain;
    v_has_m := FOUND;
  END IF;
  IF v_len IS NULL AND v_has_m THEN v_len := m.byte_length; END IF;
  -- custody (B21.2's rows and phase 1's; the B50 reading of "established", plus a retrieval that verified the digest)
  SELECT count(*)::int, max(c.occurred_at) INTO v_events, v_last_at FROM observation.custody_events c
   WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND (c.evd_object_id = p_id OR (v_manifest IS NOT NULL AND c.manifest_id = v_manifest));
  SELECT max(c.occurred_at) INTO v_last_ok FROM observation.custody_events c
   WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND (c.evd_object_id = p_id OR (v_manifest IS NOT NULL AND c.manifest_id = v_manifest))
     AND (c.event IN ('custody.admitted', 'custody.imported', 'custody.restored', 'custody.verified', 'custody.finalized') OR (c.event = 'custody.retrieved' AND c.digest_verified IS TRUE))
     AND (c.content_digest IS NULL OR c.content_digest = v_digest);
  SELECT max(c.occurred_at) INTO v_failed FROM observation.custody_events c
   WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND (c.evd_object_id = p_id OR (v_manifest IS NOT NULL AND c.manifest_id = v_manifest))
     AND (c.event = 'custody.integrity_failed' OR c.digest_verified IS FALSE);
  v_failed_flag := v_failed IS NOT NULL AND (v_last_ok IS NULL OR v_failed >= v_last_ok);
  SELECT c.event INTO v_last_read FROM observation.custody_events c
   WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND (c.evd_object_id = p_id OR (v_manifest IS NOT NULL AND c.manifest_id = v_manifest))
     AND c.event IN ('custody.retrieved', 'custody.retrieval_degraded', 'custody.integrity_failed')
   ORDER BY c.occurred_at DESC, c.event_id DESC LIMIT 1;
  v_unreachable := v_last_read IS NOT DISTINCT FROM 'custody.retrieval_degraded';
  v_tomb := v_manifest IS NOT NULL AND EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = v_manifest);
  IF v_manifest IS NOT NULL THEN
    SELECT CASE WHEN tr.tier = 'archive' THEN 'archived' ELSE 'hot' END INTO v_tier FROM observation.blob_tier_records tr
     WHERE tr.manifest_id = v_manifest ORDER BY tr.moved_at DESC, tr.record_id DESC LIMIT 1;
    v_tier := coalesce(v_tier, 'hot');
  END IF;
  -- the rights terms of the source contract version the evidence was collected under (provenance_ref SRC:<id>@<contract version>)
  IF coalesce(e.provenance_ref, '') ~* '^SRC:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@[1-9][0-9]{0,8}$' THEN
    v_src := substring(e.provenance_ref from 5 for 36)::uuid; v_cv := split_part(e.provenance_ref, '@', 2)::int;
    rt := observation.rt_current(p_tenant, p_domain, v_src, v_cv);
    v_rights_state := observation.rt_state(rt, p_at);
    SELECT s.rights_state INTO v_contract_rights FROM observation.source_contracts_current s WHERE s.source_id = v_src AND s.contract_version = v_cv AND s.tenant_id = p_tenant AND s.domain_id = p_domain;
  END IF;
  -- B40 va: the content authenticity recorded at this version's admission (observation.evidence_authenticity; DESIGN D6) — a side ledger,
  -- never a header field; a version admitted before B40, or under a contract declaring no signature scheme, has no row and says so
  SELECT * INTO au FROM observation.evidence_authenticity x
   WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.evd_object_id = p_id AND x.evd_version = p_version ORDER BY x.recorded_at DESC LIMIT 1;   -- B40 va
  v_auth_failed := au.record_id IS NOT NULL AND au.outcome = 'failed';                                                                                -- B40 va
  v_auth := CASE WHEN au.record_id IS NULL                                                                                                            -- B40 va
    THEN jsonb_build_object('outcome', 'not_recorded', 'detail', 'no authenticity outcome is recorded for this version — admitted before B40, or under a source contract that declares no publisher signature scheme: content authenticity unknown')
    ELSE jsonb_build_object('outcome', au.outcome, 'scheme', au.scheme, 'key_id', au.key_id, 'key_fingerprint', au.key_fingerprint, 'key_ref', au.key_ref,
                            'recorded_at', graph.pv_iso(au.recorded_at), 'detail', au.detail ->> 'statement') END;                                     -- B40 va
  -- a later correction of this version; a withdrawal (this version, or a later one)
  SELECT 'EVD:' || x.object_id || '@' || x.object_version INTO v_corrected_by FROM objects.canonical_objects x
   WHERE x.object_type = 'EVD' AND x.object_id = p_id AND x.object_version > p_version AND x.correction_of IN (p_id::text || '@' || p_version, 'EVD:' || p_id::text || '@' || p_version)
   ORDER BY x.object_version LIMIT 1;
  SELECT min(x.object_version) INTO v_withdrawn_since FROM objects.canonical_objects x
   WHERE x.object_type = 'EVD' AND x.object_id = p_id AND x.object_version >= p_version AND x.lifecycle_state IN ('withdrawn', 'deleted');
  -- the span: the cited bytes within the evidence's bytes (the whole object when the citation names no span)
  v_start := coalesce(p_span_start, 0); v_end := coalesce(p_span_end, v_len);
  -- THE FINDINGS (every one kept; the outcome is the worst)
  IF v_tomb THEN v_reasons := v_reasons || text 'tombstoned'; v_detail := v_detail || text 'the bytes were governed-deleted (tombstoned); the record remains'; END IF;
  IF v_unreachable THEN v_reasons := v_reasons || text 'tier_unreachable'; v_detail := v_detail || text 'the last retrieval found the tier''s root unreachable (EYE-DEG-001); nothing about the bytes was verified or refuted since'; END IF;
  IF NOT v_has_m THEN
    v_artifact_ok := false; v_reasons := v_reasons || text 'no_manifest'; v_detail := v_detail || text 'no blob manifest is recorded for these bytes in this domain';
  ELSIF m.content_digest IS DISTINCT FROM v_digest THEN
    v_artifact_ok := false; v_reasons := v_reasons || text 'digest_mismatch'; v_detail := v_detail || format('the manifest records bytes digest %s…; the evidence names %s…', left(m.content_digest, 12), left(coalesce(v_digest, '<none>'), 12));
  END IF;
  IF v_failed_flag THEN
    v_reasons := v_reasons || text 'integrity_failed';
    v_detail := v_detail || format('the bytes failed integrity at %s, after the last verified custody%s', graph.pv_iso(v_failed), CASE WHEN v_last_ok IS NULL THEN '' ELSE ' at ' || graph.pv_iso(v_last_ok) END);
  END IF;
  IF e.payload ? 'authenticity' AND coalesce(e.payload #>> '{authenticity,byte_integrity}', '') <> 'verified' THEN
    v_artifact_ok := false; v_reasons := v_reasons || text 'byte_integrity_unverified'; v_detail := v_detail || format('byte integrity is recorded as %s, not verified', coalesce(e.payload #>> '{authenticity,byte_integrity}', '<unstated>'));
  END IF;
  IF v_start < 0 OR v_end IS NULL OR v_end < v_start OR (v_len IS NOT NULL AND v_end > v_len) THEN
    v_artifact_ok := false; v_reasons := v_reasons || text 'span_out_of_range';
    v_detail := v_detail || format('the cited span %s–%s does not lie within the %s recorded bytes', v_start, coalesce(v_end::text, '?'), coalesce(v_len::text, 'unknown number of'));
  END IF;
  IF v_rights_state IN ('expired', 'withdrawn') THEN
    v_reasons := v_reasons || ('rights_' || v_rights_state);
    v_detail := v_detail || format('the rights terms of its source contract (v%s) are %s (%s)', rt.version, v_rights_state, observation.rt_json(rt, p_at) ->> 'expiry_statement');
  END IF;
  IF v_auth_failed THEN                                                                                                                                -- B40 va
    v_reasons := v_reasons || text 'authenticity_failed';
    v_detail := v_detail || format('authenticity failed — its publisher signature (%s) did not verify at admission (%s): admitted marked, never established as the publisher''s content',
                                   au.scheme, graph.pv_iso(au.recorded_at));
  END IF;                                                                                                                                              -- B40 va
  IF v_withdrawn_since IS NOT NULL THEN
    v_reasons := v_reasons || text 'withdrawn';
    v_detail := v_detail || CASE WHEN v_withdrawn_since = p_version THEN 'this version is withdrawn' ELSE format('withdrawn since v%s', v_withdrawn_since) END;
  END IF;
  IF v_corrected_by IS NOT NULL THEN v_reasons := v_reasons || text 'corrected'; v_detail := v_detail || format('corrected since by %s', v_corrected_by); END IF;
  v_outcome := CASE
    WHEN v_tomb OR v_unreachable THEN 'inaccessible'
    WHEN v_failed_flag OR NOT v_artifact_ok OR v_auth_failed THEN 'unverifiable'   -- B40 va: a failed publisher signature is unverifiable content, never resolved
    WHEN v_rights_state IN ('expired', 'withdrawn') THEN 'rights_expired'
    WHEN v_withdrawn_since IS NOT NULL THEN 'withdrawn'
    WHEN v_corrected_by IS NOT NULL THEN 'corrected'
    ELSE 'resolved' END;
  v_digest_ok := CASE WHEN NOT v_has_m THEN NULL WHEN m.content_digest IS DISTINCT FROM v_digest OR v_failed_flag THEN false ELSE true END;
  RETURN jsonb_build_object(
    'ref', 'EVD:' || p_id || '@' || p_version,
    'evidence', jsonb_build_object('id', p_id, 'version', p_version, 'digest', v_digest, 'byte_start', v_start, 'byte_end', v_end, 'media_type', v_media, 'byte_length', v_len,
                                   'content_digest', e.content_digest, 'lifecycle', e.lifecycle_state, 'truth_state', e.truth_state, 'synthetic', e.synthetic_state,
                                   'recorded_at', graph.pv_iso(e.recorded_at), 'source_id', v_src, 'contract_version', v_cv,
                                   'fragment', CASE WHEN e.payload ? 'fragment' THEN (e.payload -> 'fragment') || jsonb_build_object('parent_evd_id', e.payload ->> 'parent_evd_id') END),
    'digest_ok', v_digest_ok,
    'custody', jsonb_build_object('events', coalesce(v_events, 0), 'last_event_at', graph.pv_iso(v_last_at), 'last_verified_at', graph.pv_iso(v_last_ok), 'last_failed_at', graph.pv_iso(v_failed),
                                  'state', CASE WHEN v_failed_flag THEN 'integrity_failed' WHEN v_last_ok IS NULL THEN 'not_established' ELSE 'intact' END),
    'rights', observation.rt_json(rt, p_at), 'contract_rights_state', v_contract_rights,
    'tier', CASE WHEN v_manifest IS NULL THEN NULL ELSE v_tier END,
    'correction', jsonb_build_object('correction_of', CASE WHEN e.correction_of IS NULL THEN NULL ELSE 'EVD:' || regexp_replace(e.correction_of, '^EVD:', '') END, 'corrected_by', v_corrected_by),
    'outcome', v_outcome, 'reasons', to_jsonb(v_reasons), 'detail', CASE WHEN cardinality(v_detail) = 0 THEN NULL ELSE array_to_string(v_detail, '; ') END,
    'integrity_failed', v_failed_flag, 'unreachable', v_unreachable, 'tombstoned', v_tomb, 'rights_state', v_rights_state,
    'authenticity', v_auth);   -- B40 va
END $$;
REVOKE ALL ON FUNCTION graph.ev_evidence_state(uuid, uuid, uuid, int, int, int, timestamptz) FROM PUBLIC;


-- §VA.12 graph.px_strength_of — 0121 §PX.2, its LAST definition, copied WHOLE; the additions marked `-- B40 va` ──────────────────────────────
/* (0121 §PX.2, unchanged) The strength of one graph.explain answer: every finding kept as a reason (code, detail, node_id) and the strength
   the WORST of them (0 strong · 1 partial · 2 weak · 3 broken):
     BROKEN   an integrity gap — broken custody or an unverifiable artifact anywhere on the backward path;
     WEAK     an unresolved reference (unresolved_citation), another gap, an UNFIT fitness mark on the product or an input;
     PARTIAL  the walk truncated at its bounds, a withdrawn or corrected input, an approval no signature binds (unsigned_human_step), a
              model call without its recorded weights digest (undigested_model_call);
     STRONG   none of these. Never a number: the reasons are the answer.
   B40 va (DESIGN D6): + WEAK an evidence version on the path whose publisher signature FAILED at admission (authenticity_failed); + PARTIAL
   one whose check could not be made (authenticity_unavailable). graph.provenance_strength and graph.trust_envelope both read this. */
CREATE OR REPLACE FUNCTION graph.px_strength_of(p_tenant uuid, p_domain uuid, x jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, objects, pg_catalog, pg_temp AS $$
DECLARE g jsonb; n jsonb; v_reasons jsonb := '[]'::jsonb; v_level int := 0; v_i int := 0; v_root text := x ->> 'ref'; v_ref jsonb; v_uuid uuid; v_later record;
        c record; y record; v_seen text[] := '{}';
        au record;   -- B40 va
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
      -- B40 va (DESIGN D6): an evidence version on the path — the product's own, or an input — whose publisher signature FAILED at admission
      -- is WEAK (admitted marked, never established as the publisher's); one whose check could not be made is PARTIAL. No row (before B40,
      -- or a contract with no signature scheme) adds nothing: content authenticity unknown is the honest default, not a finding.
      IF c.object_type = 'EVD' THEN
        SELECT x.outcome, x.scheme, x.recorded_at INTO au FROM observation.evidence_authenticity x
         WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.evd_object_id = c.object_id AND x.evd_version = c.object_version ORDER BY x.recorded_at DESC LIMIT 1;
        IF FOUND AND au.outcome = 'failed' THEN
          v_level := greatest(v_level, 2);
          v_reasons := v_reasons || jsonb_build_object('code', 'authenticity_failed', 'node_id', n ->> 'node_id', 'rule', 'b40-va-authenticity-1',
            'detail', format('%s: authenticity failed — its publisher signature (%s) did not verify at admission (%s); admitted marked, not established as the publisher''s', n ->> 'ref', au.scheme, graph.pv_iso(au.recorded_at)));
        ELSIF FOUND AND au.outcome = 'unavailable' THEN
          v_level := greatest(v_level, 1);
          v_reasons := v_reasons || jsonb_build_object('code', 'authenticity_unavailable', 'node_id', n ->> 'node_id', 'rule', 'b40-va-authenticity-1',
            'detail', format('%s: its publisher signature could not be checked at admission (%s) — neither verified nor refuted', n ->> 'ref', graph.pv_iso(au.recorded_at)));
        END IF;
      END IF;
      -- end B40 va
      -- an UNFIT mark (the latest) on the product or on an input — never on the product's OWN earlier version (a correction's original: the
      -- correction is what remedies it; act rehearsal finding — a correction of an UNFIT claim could never read better than WEAK)
      SELECT fm.verdict, fm.reasons, fm.marked_at INTO y FROM graph.product_fitness_marks fm
       WHERE fm.object_id = c.object_id AND fm.object_version = c.object_version AND fm.tenant_id = p_tenant ORDER BY fm.marked_at DESC LIMIT 1;
      IF FOUND AND y.verdict = 'unfit' AND ((n ->> 'ref') = v_root OR (graph.pv_ref(v_root) ->> 'id') <> c.object_id::text) THEN
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


-- §VA.13 THE READS ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* THE KEY REGISTER of the domain (or of one source): each source with its contract versions' declared scheme, key references and pins, its
   keys (state at the instant), the key ledger and its recorded outcomes. Metadata only (D9). */
CREATE OR REPLACE FUNCTION observation.publisher_keys_read(p_tenant uuid, p_domain uuid, p_source_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = observation, graph, pg_catalog, pg_temp AS $$
DECLARE v_at timestamptz := clock_timestamp(); v_out jsonb := '[]'::jsonb; s record;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the publisher keys of a source');
  IF p_source_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM observation.source_contracts_current x WHERE x.source_id = p_source_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain) THEN
    RAISE EXCEPTION 'publisher key rejected (unknown_source): source % is not recorded in this domain', p_source_id USING ERRCODE = '23503';
  END IF;
  FOR s IN SELECT x.source_id, (array_agg(x.source_key ORDER BY x.contract_version DESC))[1] AS source_key, (array_agg(x.name ORDER BY x.contract_version DESC))[1] AS name
             FROM observation.source_contracts_current x
            WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND (p_source_id IS NULL OR x.source_id = p_source_id)
            GROUP BY x.source_id ORDER BY 3, 1 LOOP
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'source_id', s.source_id, 'source_key', s.source_key, 'name', s.name,
      'versions', (SELECT coalesce(jsonb_agg(jsonb_build_object('contract_version', c.contract_version, 'lifecycle_state', c.lifecycle_state, 'connector_kind', c.connector_kind,
                       'v4', jsonb_typeof(c.contract -> 'authenticity') = 'object',
                       'scheme', CASE WHEN jsonb_typeof(c.contract -> 'authenticity') = 'object' THEN c.contract #>> '{authenticity,scheme}' END,
                       'key_refs', coalesce(c.contract #> '{authenticity,key_refs}', '[]'::jsonb), 'tls_spki_pins', coalesce(c.contract #> '{authenticity,tls_spki_pins}', '[]'::jsonb),
                       'content_authenticity_statement', c.contract #>> '{security_and_operations,authenticity_method,content_authenticity}') ORDER BY c.contract_version DESC), '[]'::jsonb)
                     FROM observation.source_contracts_current c WHERE c.source_id = s.source_id AND c.tenant_id = p_tenant AND c.domain_id = p_domain),
      'keys', (SELECT coalesce(jsonb_agg(observation.pk_json(k, v_at) ORDER BY k.declared_at DESC, k.key_id), '[]'::jsonb) FROM observation.publisher_keys k
                WHERE k.source_id = s.source_id AND k.tenant_id = p_tenant AND k.domain_id = p_domain),
      'events', (SELECT coalesce(jsonb_agg(jsonb_build_object('event', e.event, 'key_id', e.key_id, 'actor', e.actor, 'at', graph.pv_iso(e.occurred_at), 'details', e.details)
                   ORDER BY e.occurred_at DESC, e.event_id), '[]'::jsonb) FROM observation.publisher_key_events e WHERE e.source_id = s.source_id AND e.tenant_id = p_tenant AND e.domain_id = p_domain),
      'outcomes', (SELECT jsonb_build_object('verified', count(*) FILTER (WHERE a.outcome = 'verified'), 'failed', count(*) FILTER (WHERE a.outcome = 'failed'),
                          'unsigned', count(*) FILTER (WHERE a.outcome = 'unsigned'), 'unavailable', count(*) FILTER (WHERE a.outcome = 'unavailable'),
                          'unknown_signer', count(*) FILTER (WHERE a.outcome = 'unknown_signer'), 'last_recorded_at', graph.pv_iso(max(a.recorded_at)))
                     FROM observation.evidence_authenticity a WHERE a.source_id = s.source_id AND a.tenant_id = p_tenant AND a.domain_id = p_domain)));
  END LOOP;
  RETURN jsonb_build_object('sources', v_out, 'as_of', graph.pv_iso(v_at));
END $$;
REVOKE ALL ON FUNCTION observation.publisher_keys_read(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.publisher_keys_read(uuid, uuid, uuid) TO eye_app, eye_commit;

/* ONE EVIDENCE OBJECT'S AUTHENTICITY AND ATTRIBUTES, per version: the recorded outcome (with its key — state at the instant — and the
   presented signature's digest, never the content) or the statement why none is recorded; the current attributes with their basis and the
   override history, or "not recorded". Metadata only (D9: no bytes, no payload content). */
CREATE OR REPLACE FUNCTION observation.evidence_authenticity_read(p_tenant uuid, p_domain uuid, p_evd uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = observation, graph, pg_catalog, pg_temp AS $$
DECLARE v_at timestamptz := clock_timestamp(); v_out jsonb := '[]'::jsonb; o record; a observation.evidence_authenticity%ROWTYPE; k observation.publisher_keys%ROWTYPE;
        s observation.source_contracts_current%ROWTYPE; v_src uuid; v_cv int; v_v4 boolean;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the authenticity of an evidence object');
  IF p_evd IS NULL OR NOT EXISTS (SELECT 1 FROM objects.canonical_objects x WHERE x.object_type = 'EVD' AND x.object_id = p_evd AND x.tenant_id = p_tenant AND x.domain_id = p_domain) THEN
    RAISE EXCEPTION 'evidence authenticity rejected (unknown_evidence): EVD % is not recorded in this domain', coalesce(p_evd::text, '<none>') USING ERRCODE = '23503';
  END IF;
  FOR o IN SELECT x.object_version, x.provenance_ref, x.recorded_at, x.payload #>> '{authenticity,content_authenticity}' AS payload_ca FROM objects.canonical_objects x
            WHERE x.object_type = 'EVD' AND x.object_id = p_evd AND x.tenant_id = p_tenant AND x.domain_id = p_domain ORDER BY x.object_version DESC LOOP
    v_src := NULL; v_cv := NULL; s := NULL; a := NULL; k := NULL;
    IF coalesce(o.provenance_ref, '') ~* '^SRC:[0-9a-f-]{36}@[1-9][0-9]{0,8}$' THEN
      v_src := substring(o.provenance_ref from 5 for 36)::uuid; v_cv := split_part(o.provenance_ref, '@', 2)::int;
      SELECT * INTO s FROM observation.source_contracts_current c WHERE c.source_id = v_src AND c.contract_version = v_cv AND c.tenant_id = p_tenant AND c.domain_id = p_domain;
    END IF;
    v_v4 := jsonb_typeof(s.contract -> 'authenticity') = 'object';
    SELECT * INTO a FROM observation.evidence_authenticity x WHERE x.evd_object_id = p_evd AND x.evd_version = o.object_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain ORDER BY x.recorded_at DESC LIMIT 1;
    IF a.key_id IS NOT NULL THEN SELECT * INTO k FROM observation.publisher_keys x WHERE x.key_id = a.key_id; END IF;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'version', o.object_version, 'source_id', v_src, 'contract_version', v_cv, 'v4', coalesce(v_v4, false),
      'scheme', CASE WHEN v_v4 THEN s.contract #>> '{authenticity,scheme}' END, 'payload_content_authenticity', o.payload_ca,
      'authenticity', CASE WHEN a.record_id IS NULL THEN jsonb_build_object('outcome', 'not_recorded',
            'statement', CASE WHEN coalesce(v_v4, false) THEN 'no authenticity outcome is recorded for this version'
                              ELSE 'not recorded before B40 — the source contract version declares no publisher signature scheme (content authenticity unknown)' END)
          ELSE jsonb_build_object('record_id', a.record_id, 'outcome', a.outcome, 'scheme', a.scheme, 'key', observation.pk_json(k, v_at), 'key_fingerprint', a.key_fingerprint,
                                  'key_ref', a.key_ref, 'signature_digest', a.signature_digest, 'detail', a.detail, 'recorded_at', graph.pv_iso(a.recorded_at)) END,
      'attributes', (SELECT CASE WHEN count(*) = 0 THEN jsonb_build_object('recorded', false,
                              'statement', CASE WHEN coalesce(v_v4, false) THEN 'no evidence attributes are recorded for this version'
                                                ELSE 'not recorded before B40 — the source contract version declares no evidence attributes' END)
                       ELSE jsonb_build_object('recorded', true,
                         'current', (SELECT jsonb_object_agg(c.attribute, jsonb_build_object('value', c.value, 'basis', c.basis, 'basis_ref', c.basis_ref, 'reason', c.reason,
                                        'recorded_by', c.recorded_by, 'recorded_at', graph.pv_iso(c.recorded_at), 'attribute_id', c.attribute_id))
                                       FROM (SELECT DISTINCT ON (y.attribute) y.* FROM observation.evidence_attributes y WHERE y.evd_object_id = p_evd AND y.evd_version = o.object_version
                                              AND y.tenant_id = p_tenant AND y.domain_id = p_domain ORDER BY y.attribute, y.recorded_at DESC, y.attribute_id DESC) c),
                         'history', jsonb_agg(jsonb_build_object('attribute_id', z.attribute_id, 'attribute', z.attribute, 'value', z.value, 'basis', z.basis, 'basis_ref', z.basis_ref,
                                        'reason', z.reason, 'supersedes', z.supersedes, 'recorded_by', z.recorded_by, 'recorded_at', graph.pv_iso(z.recorded_at)) ORDER BY z.recorded_at, z.attribute_id)) END
                       FROM observation.evidence_attributes z WHERE z.evd_object_id = p_evd AND z.evd_version = o.object_version AND z.tenant_id = p_tenant AND z.domain_id = p_domain)));
  END LOOP;
  RETURN jsonb_build_object('evd_object_id', p_evd, 'versions', v_out, 'as_of', graph.pv_iso(v_at));
END $$;
REVOKE ALL ON FUNCTION observation.evidence_authenticity_read(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.evidence_authenticity_read(uuid, uuid, uuid) TO eye_app, eye_commit;

/* AUTHENTICITY AS A MEASURED COVERAGE DIMENSION (L1-C06): a source's recorded outcomes for the versions admitted in [p_from, p_to). A source
   with no recorded outcome answers recorded = 0 (the coverage dimension stays unknown, never inferred). A NULL tenant / domain is the bound
   context's (the coverage measurement runs under its own DOMAIN-bound operation); outside the caller's read scope it answers NULL. */
CREATE OR REPLACE FUNCTION observation.authenticity_measure(p_tenant uuid, p_domain uuid, p_source_id uuid, p_from timestamptz, p_to timestamptz) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = observation, graph, pg_catalog, pg_temp AS $$
  WITH sc AS (SELECT coalesce(p_tenant, public.eye_tenant()) AS t, coalesce(p_domain, public.eye_domain()) AS d)
  SELECT CASE WHEN NOT observation.read_scope_ok(sc.t, sc.d) THEN NULL ELSE (
    SELECT jsonb_build_object('recorded', count(*), 'verified', count(*) FILTER (WHERE a.outcome = 'verified'), 'failed', count(*) FILTER (WHERE a.outcome = 'failed'),
           'unsigned', count(*) FILTER (WHERE a.outcome = 'unsigned'), 'unavailable', count(*) FILTER (WHERE a.outcome = 'unavailable'),
           'schemes', coalesce(jsonb_agg(DISTINCT a.scheme), '[]'::jsonb), 'last_recorded_at', graph.pv_iso(max(a.recorded_at)))
      FROM observation.evidence_authenticity a
     WHERE a.tenant_id = sc.t AND a.domain_id = sc.d AND a.source_id = p_source_id AND a.evd_object_id IS NOT NULL
       AND a.recorded_at >= p_from AND a.recorded_at < p_to) END
    FROM sc
$$;
REVOKE ALL ON FUNCTION observation.authenticity_measure(uuid, uuid, uuid, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.authenticity_measure(uuid, uuid, uuid, timestamptz, timestamptz) TO eye_app, eye_commit;

-- §VA.14 THE TRANSFORMATION-RULE PORTS ──────────────────────────────────────────────────────────────────────────────────────────────────────
/* The DIGEST of a rule's immutable content (what a person reviews before deciding or retiring it; the acts bind it — stale otherwise). */
CREATE OR REPLACE FUNCTION objects.tr_digest(r objects.transformation_rules) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = objects, pg_catalog, pg_temp AS $$
  SELECT encode(sha256(convert_to(jsonb_build_object('rule_id', r.rule_id, 'tenant_id', r.tenant_id, 'domain_id', r.domain_id, 'obligation', r.obligation,
    'transformation', r.transformation, 'from_value', r.from_value, 'to_value', r.to_value, 'object_types', to_jsonb(r.object_types), 'rationale', r.rationale,
    'proposed_by', r.proposed_by)::text, 'UTF8')), 'hex')
$$;
REVOKE ALL ON FUNCTION objects.tr_digest(objects.transformation_rules) FROM PUBLIC;

CREATE OR REPLACE FUNCTION objects.tr_json(r objects.transformation_rules) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = objects, graph, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('rule_id', r.rule_id, 'digest', objects.tr_digest(r), 'obligation', r.obligation, 'transformation', r.transformation, 'from_value', r.from_value, 'to_value', r.to_value,
    'object_types', to_jsonb(r.object_types), 'rationale', r.rationale, 'state', r.state, 'proposed_by', r.proposed_by, 'proposed_at', graph.pv_iso(r.proposed_at),
    'decided_by', r.decided_by, 'decided_at', graph.pv_iso(r.decided_at), 'decision_reason', r.decision_reason,
    'retired_by', r.retired_by, 'retired_at', graph.pv_iso(r.retired_at), 'retire_reason', r.retire_reason)
$$;
REVOKE ALL ON FUNCTION objects.tr_json(objects.transformation_rules) FROM PUBLIC;

/* PROPOSE (objects.transformation_rule.propose — a named data steward, human-gated): the obligation, the transformation, the inherited value
   it applies to and the value the derived object may carry instead — a RELAXATION (for classification and sensitivity, a lower rank; a rule
   that tightens nothing it inherits is refused), the object types, the rationale. Nothing is relaxed until the privacy officer approves. */
CREATE OR REPLACE FUNCTION objects.propose_transformation_rule(
  p_request_id uuid, p_tenant uuid, p_domain uuid, p_obligation text, p_transformation text, p_from text, p_to text, p_object_types text[], p_rationale text,
  p_actor uuid, p_correlation uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = objects, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; r objects.transformation_rules%ROWTYPE; t text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['objects.transformation_rule.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := observation.va_actor('transformation rule', p_actor);
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'transformation rule rejected (request): a proposal carries its request id' USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM objects.transformation_rules x WHERE x.request_id = p_request_id;
  IF FOUND THEN
    IF r.proposed_by IS DISTINCT FROM v_actor OR r.tenant_id IS DISTINCT FROM p_tenant OR r.domain_id IS DISTINCT FROM p_domain THEN
      RAISE EXCEPTION 'transformation rule rejected (duplicate): request % already recorded another act', p_request_id USING ERRCODE = '23505';
    END IF;
    RETURN objects.tr_json(r) || jsonb_build_object('replayed', true);
  END IF;
  PERFORM governance.assert_approver('transformation rule', v_actor, p_tenant, p_domain, ARRAY['data_steward'], NULL, NULL, 'proposing a transformation rule');
  IF p_obligation IS NULL OR p_obligation NOT IN ('classification', 'residency', 'rights', 'sensitivity', 'licence') THEN
    RAISE EXCEPTION 'transformation rule rejected (obligation): % is not an obligation (classification | residency | rights | sensitivity | licence)', coalesce(p_obligation, '<none>') USING ERRCODE = '22023';
  END IF;
  IF p_transformation IS NULL OR p_transformation !~ '^[a-z][a-z0-9_]{2,40}$' THEN
    RAISE EXCEPTION 'transformation rule rejected (transformation): the transformation is named in lower case (aggregation, anonymisation, summary …)' USING ERRCODE = '22023';
  END IF;
  IF coalesce(length(btrim(p_from)), 0) NOT BETWEEN 1 AND 200 OR coalesce(length(btrim(p_to)), 0) NOT BETWEEN 1 AND 200 OR btrim(p_from) = btrim(p_to) THEN
    RAISE EXCEPTION 'transformation rule rejected (values): a rule names the inherited value it applies to and a different value the derived object may carry (1 to 200 characters each)' USING ERRCODE = '22023';
  END IF;
  IF p_obligation = 'classification' AND (btrim(p_from) NOT IN ('public', 'internal', 'confidential', 'restricted') OR btrim(p_to) NOT IN ('public', 'internal', 'confidential', 'restricted')
       OR decision.classification_rank(btrim(p_to)) >= decision.classification_rank(btrim(p_from))) THEN
    RAISE EXCEPTION 'transformation rule rejected (relaxation): a classification rule lowers a classification (public < internal < confidential < restricted); % → % does not' , p_from, p_to USING ERRCODE = '22023';
  END IF;
  IF p_obligation = 'sensitivity' AND (btrim(p_from) NOT IN ('none', 'commercial', 'personal', 'special_category') OR btrim(p_to) NOT IN ('none', 'commercial', 'personal', 'special_category')
       OR objects.sensitivity_rank(btrim(p_to)) >= objects.sensitivity_rank(btrim(p_from))) THEN
    RAISE EXCEPTION 'transformation rule rejected (relaxation): a sensitivity rule lowers a sensitivity (none < commercial < personal < special_category); % → % does not', p_from, p_to USING ERRCODE = '22023';
  END IF;
  IF p_object_types IS NULL OR cardinality(p_object_types) NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'transformation rule rejected (object_types): a rule names the derived object types it applies to (1 to 20 three-capital types)' USING ERRCODE = '22023';
  END IF;
  FOREACH t IN ARRAY p_object_types LOOP
    IF t IS NULL OR t !~ '^[A-Z]{3}$' OR t IN ('EVD', 'OBS', 'SRC') THEN
      RAISE EXCEPTION 'transformation rule rejected (object_types): % is not a derived object type (three capitals; never EVD, OBS or SRC — evidence is not derived)', coalesce(t, '<none>') USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF p_rationale IS NULL OR length(btrim(p_rationale)) < 20 OR length(p_rationale) > 4000 THEN
    RAISE EXCEPTION 'transformation rule rejected (rationale): a rationale of 20 to 4000 characters says why the transformation removes what the obligation protects' USING ERRCODE = '22023';
  END IF;
  INSERT INTO objects.transformation_rules (rule_id, scope, tenant_id, domain_id, obligation, transformation, from_value, to_value, object_types, rationale, state, proposed_by, request_id, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_obligation, p_transformation, btrim(p_from), btrim(p_to), (SELECT array_agg(DISTINCT x ORDER BY x) FROM unnest(p_object_types) x),
          btrim(p_rationale), 'proposed', v_actor, p_request_id, p_correlation)
  RETURNING * INTO r;
  INSERT INTO objects.transformation_rule_events (event_id, scope, tenant_id, domain_id, rule_id, event, actor, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, r.rule_id, 'rule.proposed', v_actor, jsonb_build_object('obligation', r.obligation, 'from', r.from_value, 'to', r.to_value, 'types', to_jsonb(r.object_types)), p_correlation);
  RETURN objects.tr_json(r) || jsonb_build_object('replayed', false);
END $$;
REVOKE ALL ON FUNCTION objects.propose_transformation_rule(uuid, uuid, uuid, text, text, text, text, text[], text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.propose_transformation_rule(uuid, uuid, uuid, text, text, text, text, text[], text, uuid, uuid) TO eye_commit;

/* DECIDE (objects.transformation_rule.decide — the privacy officer, human-gated; never the proposer, never an agent): approve or reject a
   proposed rule with a reason, on the DIGEST of the rule the person reviewed (stale otherwise). */
CREATE OR REPLACE FUNCTION objects.decide_transformation_rule(p_tenant uuid, p_domain uuid, p_rule_id uuid, p_digest text, p_decision text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = objects, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; r objects.transformation_rules%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['objects.transformation_rule.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := observation.va_actor('transformation rule', p_actor);
  SELECT * INTO r FROM objects.transformation_rules x WHERE x.rule_id = p_rule_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'transformation rule rejected (unknown_rule): rule % is not recorded in this domain', coalesce(p_rule_id::text, '<none>') USING ERRCODE = '23503'; END IF;
  PERFORM governance.assert_approver('transformation rule', v_actor, p_tenant, p_domain, ARRAY['privacy_officer'], r.proposed_by, NULL, 'deciding a transformation rule');
  IF p_decision IS NULL OR p_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'transformation rule rejected (decision): the decision is approve or reject' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'transformation rule rejected (reason): a decision states its reason (8 to 2000 characters)' USING ERRCODE = '22023';
  END IF;
  IF p_digest IS DISTINCT FROM objects.tr_digest(r) THEN
    RAISE EXCEPTION 'transformation rule rejected (stale): rule % is recorded with digest %; the rule you reviewed is %', r.rule_id, objects.tr_digest(r), coalesce(p_digest, '<none>') USING ERRCODE = '23514';
  END IF;
  IF r.state <> 'proposed' THEN
    RAISE EXCEPTION 'transformation rule rejected (state): rule % is %; only a proposed rule is decided', r.rule_id, r.state USING ERRCODE = '23514';  -- B40 integration: 23514 (the mapped refusal SQLSTATE; 55000 is outside the observation mapper)
  END IF;
  UPDATE objects.transformation_rules SET state = CASE p_decision WHEN 'approve' THEN 'approved' ELSE 'rejected' END, decided_by = v_actor, decided_at = clock_timestamp(),
         decision_reason = btrim(p_reason) WHERE rule_id = r.rule_id RETURNING * INTO r;
  INSERT INTO objects.transformation_rule_events (event_id, scope, tenant_id, domain_id, rule_id, event, actor, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, r.rule_id, 'rule.' || r.state, v_actor, jsonb_build_object('reason', r.decision_reason), p_correlation);
  RETURN objects.tr_json(r);
END $$;
REVOKE ALL ON FUNCTION objects.decide_transformation_rule(uuid, uuid, uuid, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.decide_transformation_rule(uuid, uuid, uuid, text, text, text, uuid, uuid) TO eye_commit;

/* RETIRE (objects.transformation_rule.retire — the privacy officer, human-gated): an approved rule stops relaxing anything; the row kept; on
   the digest of the rule the person reviewed. */
CREATE OR REPLACE FUNCTION objects.retire_transformation_rule(p_tenant uuid, p_domain uuid, p_rule_id uuid, p_digest text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = objects, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; r objects.transformation_rules%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['objects.transformation_rule.retire']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := observation.va_actor('transformation rule', p_actor);
  PERFORM governance.assert_approver('transformation rule', v_actor, p_tenant, p_domain, ARRAY['privacy_officer'], NULL, NULL, 'retiring a transformation rule');
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'transformation rule rejected (reason): a retirement states its reason (8 to 2000 characters)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO r FROM objects.transformation_rules x WHERE x.rule_id = p_rule_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'transformation rule rejected (unknown_rule): rule % is not recorded in this domain', coalesce(p_rule_id::text, '<none>') USING ERRCODE = '23503'; END IF;
  IF p_digest IS DISTINCT FROM objects.tr_digest(r) THEN
    RAISE EXCEPTION 'transformation rule rejected (stale): rule % is recorded with digest %; the rule you reviewed is %', r.rule_id, objects.tr_digest(r), coalesce(p_digest, '<none>') USING ERRCODE = '23514';
  END IF;
  IF r.state <> 'approved' THEN
    RAISE EXCEPTION 'transformation rule rejected (state): rule % is %; only an approved rule is retired', r.rule_id, r.state USING ERRCODE = '23514';  -- B40 integration: 23514 (the mapped refusal SQLSTATE; 55000 is outside the observation mapper)
  END IF;
  UPDATE objects.transformation_rules SET state = 'retired', retired_by = v_actor, retired_at = clock_timestamp(), retire_reason = btrim(p_reason) WHERE rule_id = r.rule_id RETURNING * INTO r;
  INSERT INTO objects.transformation_rule_events (event_id, scope, tenant_id, domain_id, rule_id, event, actor, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, r.rule_id, 'rule.retired', v_actor, jsonb_build_object('reason', r.retire_reason), p_correlation);
  RETURN objects.tr_json(r);
END $$;
REVOKE ALL ON FUNCTION objects.retire_transformation_rule(uuid, uuid, uuid, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.retire_transformation_rule(uuid, uuid, uuid, text, text, uuid, uuid) TO eye_commit;

/* THE REGISTER (read): the domain's rules, newest first, each with its ledger. */
CREATE OR REPLACE FUNCTION objects.transformation_rules_read(p_tenant uuid, p_domain uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = objects, graph, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the transformation-rule register');
  RETURN jsonb_build_object('rules', (SELECT coalesce(jsonb_agg(objects.tr_json(r) || jsonb_build_object('events',
            (SELECT coalesce(jsonb_agg(jsonb_build_object('event', e.event, 'actor', e.actor, 'at', graph.pv_iso(e.occurred_at), 'details', e.details) ORDER BY e.occurred_at, e.event_id), '[]'::jsonb)
               FROM objects.transformation_rule_events e WHERE e.rule_id = r.rule_id)) ORDER BY r.proposed_at DESC, r.rule_id), '[]'::jsonb)
         FROM objects.transformation_rules r WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain), 'as_of', graph.pv_iso(clock_timestamp()));
END $$;
REVOKE ALL ON FUNCTION objects.transformation_rules_read(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.transformation_rules_read(uuid, uuid) TO eye_app, eye_commit;

-- §VA.15 MOST-RESTRICTIVE INHERITANCE (the read) ───────────────────────────────────────────────────────────────────────────────────────────
/* What a product version inherits through its RECORDED lineage (graph.pv_closure — claim lineage, the constructed edges, the header's evidence
   references; 8 steps, 200 objects; truncation stated), folded MOST RESTRICTIVE: classification (the highest rank — an input's own header; an
   evidence version also its source contract's ceiling), residency (every distinct profile stated by an input: one → it; several → conflicting —
   no single residency satisfies them), rights (the rights terms of every evidence source: the union of prohibited uses, the purposes every
   input permits, any terms or contract rights expired or withdrawn), sensitivity (the highest of the evidence attributes; unrecorded stated),
   licence (every licence that applies). Each obligation is compared with the product's OWN header and the APPROVED transformation rules:
   satisfied (the header carries it, or something stricter) · relaxed_by_rule (an approved rule for this type permits the header's value, cited)
   · not_satisfied (the header carries less and no approved rule permits it) · carried (no header field states it — D22's meaningful NULL, or
   no header field exists: the obligation travels in this read and the side ledgers, never an invented header value) · conflicting · none (no
   input states one). The header basis (objects.version_operations) is quoted. A READ: it refuses nothing and writes nothing. */
CREATE OR REPLACE FUNCTION objects.inherited_obligations(p_tenant uuid, p_domain uuid, p_type text, p_id uuid, p_version int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = objects, observation, graph, pg_catalog, pg_temp AS $$
DECLARE
  root objects.canonical_objects%ROWTYPE; cl jsonb; ob jsonb; c objects.canonical_objects%ROWTYPE; s observation.source_contracts_current%ROWTYPE; rt observation.rights_terms;
  v_at timestamptz := clock_timestamp(); v_inputs jsonb := '[]'::jsonb; v_src uuid; v_cv int; v_rt_state text; v_sens text; v_lic jsonb;
  v_cls text := NULL; v_cls_from jsonb := '[]'::jsonb; v_res jsonb := '{}'::jsonb; v_prohibited jsonb := '[]'::jsonb; v_purposes jsonb := NULL; v_rights_bad jsonb := '[]'::jsonb;
  v_rights_from jsonb := '[]'::jsonb; v_sens_max text := NULL; v_sens_from jsonb := '[]'::jsonb; v_sens_unrecorded int := 0; v_lic_all jsonb := '[]'::jsonb; v_evd int := 0;
  v_obl jsonb := '[]'::jsonb; v_status text; v_rule objects.transformation_rules%ROWTYPE; v_basis jsonb; v_key text; v_res_keys text[]; v_violations int := 0;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the inherited obligations of a product');
  IF p_type IS NULL OR p_type !~ '^[A-Z]{3}$' OR p_id IS NULL OR p_version IS NULL OR p_version < 1 THEN
    RAISE EXCEPTION 'obligations rejected (subject): an inheritance read names a recorded product as type (three capitals), id and version' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO root FROM objects.canonical_objects o WHERE o.object_type = p_type AND o.object_id = p_id AND o.object_version = p_version AND o.tenant_id = p_tenant AND o.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'obligations rejected (unknown_object): % % v% is not recorded in this domain', p_type, p_id, p_version USING ERRCODE = '23503'; END IF;
  cl := graph.pv_closure(p_tenant, p_domain, p_type, p_id, p_version, 8, 200);
  FOR ob IN SELECT x FROM jsonb_array_elements(coalesce(cl -> 'objects', '[]'::jsonb)) x LOOP
    CONTINUE WHEN (ob ->> 'key') = (p_type || ':' || p_id || '@' || p_version);
    SELECT * INTO c FROM objects.canonical_objects o WHERE o.object_type = ob ->> 'type' AND o.object_id = (ob ->> 'id')::uuid AND o.object_version = (ob ->> 'version')::int
       AND o.tenant_id = p_tenant AND o.domain_id = p_domain;
    CONTINUE WHEN NOT FOUND;
    v_key := c.object_type || ':' || c.object_id || '@' || c.object_version;
    -- classification: the input's own header (an evidence version's is its source contract's ceiling at admission)
    IF v_cls IS NULL OR decision.classification_rank(c.classification) > decision.classification_rank(v_cls) THEN v_cls := c.classification; v_cls_from := jsonb_build_array(v_key);
    ELSIF decision.classification_rank(c.classification) = decision.classification_rank(v_cls) AND jsonb_array_length(v_cls_from) < 10 THEN v_cls_from := v_cls_from || to_jsonb(v_key); END IF;
    s := NULL; rt := NULL; v_rt_state := NULL; v_sens := NULL; v_lic := NULL;
    IF c.object_type = 'EVD' THEN
      v_evd := v_evd + 1;
      IF coalesce(c.provenance_ref, '') ~* '^SRC:[0-9a-f-]{36}@[1-9][0-9]{0,8}$' THEN
        v_src := substring(c.provenance_ref from 5 for 36)::uuid; v_cv := split_part(c.provenance_ref, '@', 2)::int;
        SELECT * INTO s FROM observation.source_contracts_current x WHERE x.source_id = v_src AND x.contract_version = v_cv AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
        rt := observation.rt_current(p_tenant, p_domain, v_src, v_cv);
        v_rt_state := observation.rt_state(rt, v_at);
      END IF;
      -- residency: the contract's
      IF s.residency IS NOT NULL THEN v_res := jsonb_set(v_res, ARRAY[s.residency], coalesce(v_res -> s.residency, '[]'::jsonb) || to_jsonb(v_key)); END IF;
      -- rights: the terms (prohibited uses, purposes), and any expiry / withdrawal of the terms or of the contract's own rights
      IF rt.terms_id IS NOT NULL THEN
        v_prohibited := (SELECT coalesce(jsonb_agg(DISTINCT p), '[]'::jsonb) FROM (SELECT jsonb_array_elements_text(v_prohibited) p UNION SELECT jsonb_array_elements_text(rt.prohibited_uses)) u);
        v_purposes := CASE WHEN v_purposes IS NULL THEN rt.purposes
                           ELSE (SELECT coalesce(jsonb_agg(p), '[]'::jsonb) FROM jsonb_array_elements_text(v_purposes) p WHERE p IN (SELECT jsonb_array_elements_text(rt.purposes))) END;
        IF jsonb_array_length(v_rights_from) < 20 THEN v_rights_from := v_rights_from || to_jsonb(v_key || ' (RTT:' || rt.terms_id || '@' || rt.version || ', ' || v_rt_state || ')'); END IF;
      END IF;
      IF v_rt_state IN ('expired', 'withdrawn') THEN v_rights_bad := v_rights_bad || to_jsonb(v_key || ': rights terms ' || v_rt_state); END IF;
      IF s.rights_state IS NOT NULL AND s.rights_state <> 'confirmed' THEN v_rights_bad := v_rights_bad || to_jsonb(v_key || ': contract rights ' || s.rights_state); END IF;
      -- sensitivity and licence: the evidence attributes (the current value of each)
      SELECT a.value #>> '{}' INTO v_sens FROM observation.evidence_attributes a WHERE a.evd_object_id = c.object_id AND a.evd_version = c.object_version AND a.attribute = 'sensitivity'
       ORDER BY a.recorded_at DESC, a.attribute_id DESC LIMIT 1;
      IF v_sens IS NULL THEN v_sens_unrecorded := v_sens_unrecorded + 1;
      ELSIF v_sens_max IS NULL OR objects.sensitivity_rank(v_sens) > objects.sensitivity_rank(v_sens_max) THEN v_sens_max := v_sens; v_sens_from := jsonb_build_array(v_key);
      ELSIF v_sens = v_sens_max AND jsonb_array_length(v_sens_from) < 10 THEN v_sens_from := v_sens_from || to_jsonb(v_key); END IF;
      SELECT a.value INTO v_lic FROM observation.evidence_attributes a WHERE a.evd_object_id = c.object_id AND a.evd_version = c.object_version AND a.attribute = 'licence'
       ORDER BY a.recorded_at DESC, a.attribute_id DESC LIMIT 1;
      v_lic := coalesce(v_lic, CASE WHEN s.source_id IS NOT NULL THEN jsonb_build_object('contract_licence', s.contract #>> '{authority_and_rights,licence}', 'statement', 'the source contract''s licence (no evidence attribute recorded)') END);
      IF v_lic IS NOT NULL AND NOT (v_lic_all @> jsonb_build_array(v_lic)) AND jsonb_array_length(v_lic_all) < 20 THEN v_lic_all := v_lic_all || jsonb_build_array(v_lic); END IF;
    ELSE
      IF coalesce(c.residency_profile, '') <> '' THEN v_res := jsonb_set(v_res, ARRAY[c.residency_profile], coalesce(v_res -> c.residency_profile, '[]'::jsonb) || to_jsonb(v_key)); END IF;
      IF coalesce(c.rights_profile, '') <> '' AND jsonb_array_length(v_rights_from) < 20 THEN v_rights_from := v_rights_from || to_jsonb(v_key || ' (rights profile ' || c.rights_profile || ')'); END IF;
    END IF;
    IF jsonb_array_length(v_inputs) < 200 THEN v_inputs := v_inputs || to_jsonb(v_key); END IF;
  END LOOP;
  SELECT w.header_basis INTO v_basis FROM objects.version_operations w WHERE w.object_id = p_id AND w.object_version = p_version;

  -- CLASSIFICATION
  v_rule := NULL;
  IF v_cls IS NULL THEN v_status := 'none';
  ELSIF decision.classification_rank(root.classification) >= decision.classification_rank(v_cls) THEN v_status := 'satisfied';
  ELSE
    SELECT * INTO v_rule FROM objects.transformation_rules r WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.state = 'approved' AND r.obligation = 'classification'
       AND r.from_value = v_cls AND r.to_value = root.classification AND p_type = ANY (r.object_types) ORDER BY r.decided_at DESC LIMIT 1;
    v_status := CASE WHEN v_rule.rule_id IS NOT NULL THEN 'relaxed_by_rule' ELSE 'not_satisfied' END;
  END IF;
  v_obl := v_obl || jsonb_build_object('obligation', 'classification', 'inherited', v_cls, 'imposed_by', v_cls_from, 'header', root.classification, 'status', v_status,
    'rule', CASE WHEN v_rule.rule_id IS NULL THEN NULL ELSE objects.tr_json(v_rule) END,
    'detail', CASE v_status WHEN 'none' THEN 'no input carries a classification' WHEN 'satisfied' THEN format('the header carries %s, at least %s', root.classification, v_cls)
                            WHEN 'relaxed_by_rule' THEN format('the header carries %s below the inherited %s — permitted by the approved %s rule %s', root.classification, v_cls, v_rule.transformation, v_rule.rule_id)
                            ELSE format('the header carries %s, LESS restrictive than the inherited %s, and no approved transformation rule permits it', root.classification, v_cls) END);
  -- RESIDENCY
  v_res_keys := ARRAY(SELECT jsonb_object_keys(v_res) ORDER BY 1);
  v_rule := NULL;
  IF cardinality(v_res_keys) = 0 THEN v_status := 'none';
  ELSIF cardinality(v_res_keys) > 1 THEN v_status := 'conflicting';
  ELSIF root.residency_profile IS NULL THEN v_status := 'carried';
  ELSIF root.residency_profile = v_res_keys[1] THEN v_status := 'satisfied';
  ELSE
    SELECT * INTO v_rule FROM objects.transformation_rules r WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.state = 'approved' AND r.obligation = 'residency'
       AND r.from_value = v_res_keys[1] AND r.to_value = root.residency_profile AND p_type = ANY (r.object_types) ORDER BY r.decided_at DESC LIMIT 1;
    v_status := CASE WHEN v_rule.rule_id IS NOT NULL THEN 'relaxed_by_rule' ELSE 'not_satisfied' END;
  END IF;
  v_obl := v_obl || jsonb_build_object('obligation', 'residency', 'inherited', CASE WHEN cardinality(v_res_keys) = 1 THEN to_jsonb(v_res_keys[1]) ELSE to_jsonb(v_res_keys) END,
    'imposed_by', v_res, 'header', root.residency_profile, 'status', v_status, 'rule', CASE WHEN v_rule.rule_id IS NULL THEN NULL ELSE objects.tr_json(v_rule) END,
    'detail', CASE v_status WHEN 'none' THEN 'no input states a residency' WHEN 'conflicting' THEN format('the inputs state %s residencies (%s) — no single residency satisfies them; a person resolves it', cardinality(v_res_keys), array_to_string(v_res_keys, ', '))
                            WHEN 'carried' THEN format('the header''s residency is a meaningful NULL (D22) — the inherited %s travels with this read and the header basis', v_res_keys[1])
                            WHEN 'satisfied' THEN format('the header carries %s', root.residency_profile)
                            WHEN 'relaxed_by_rule' THEN format('the header carries %s instead of the inherited %s — permitted by the approved rule %s', root.residency_profile, v_res_keys[1], v_rule.rule_id)
                            ELSE format('the header carries %s, not the inherited %s, and no approved transformation rule permits it', root.residency_profile, v_res_keys[1]) END);
  -- RIGHTS
  v_obl := v_obl || jsonb_build_object('obligation', 'rights', 'inherited', jsonb_build_object('prohibited_uses', v_prohibited, 'permitted_purposes', v_purposes, 'withdrawn_or_expired', v_rights_bad),
    'imposed_by', v_rights_from, 'header', root.rights_profile,
    'status', CASE WHEN jsonb_array_length(v_rights_bad) > 0 THEN 'withdrawn' WHEN jsonb_array_length(v_rights_from) = 0 THEN 'none' WHEN root.rights_profile IS NULL THEN 'carried' ELSE 'satisfied' END,
    'rule', NULL,
    'detail', CASE WHEN jsonb_array_length(v_rights_bad) > 0 THEN format('rights on the path are withdrawn or expired: %s — a decision-active use is refused by the lineage hook', (SELECT string_agg(x, '; ') FROM jsonb_array_elements_text(v_rights_bad) x))
                   WHEN jsonb_array_length(v_rights_from) = 0 THEN 'no rights terms or rights profile is declared on the path — the source contracts'' own rights stand'
                   WHEN root.rights_profile IS NULL THEN 'the header''s rights profile is a meaningful NULL (D22) — the inherited terms travel with this read'
                   ELSE format('the header carries rights profile %s; the inherited terms apply beside it', root.rights_profile) END);
  -- SENSITIVITY (no header field — D11 / D22: the side ledger carries it)
  v_rule := NULL;
  IF v_sens_max IS NOT NULL THEN
    SELECT * INTO v_rule FROM objects.transformation_rules r WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.state = 'approved' AND r.obligation = 'sensitivity'
       AND r.from_value = v_sens_max AND p_type = ANY (r.object_types) ORDER BY objects.sensitivity_rank(r.to_value), r.decided_at DESC LIMIT 1;
  END IF;
  v_obl := v_obl || jsonb_build_object('obligation', 'sensitivity', 'inherited', v_sens_max, 'imposed_by', v_sens_from, 'header', NULL,
    'status', CASE WHEN v_sens_max IS NULL THEN 'none' WHEN v_rule.rule_id IS NOT NULL THEN 'relaxed_by_rule' ELSE 'carried' END,
    'rule', CASE WHEN v_rule.rule_id IS NULL THEN NULL ELSE objects.tr_json(v_rule) END, 'unrecorded_evidence', v_sens_unrecorded,
    'detail', CASE WHEN v_sens_max IS NULL THEN format('no evidence on the path records a sensitivity (%s evidence version(s) admitted before B40 or under SRC@v1–v3 — not recorded)', v_sens_unrecorded)
                   WHEN v_rule.rule_id IS NOT NULL THEN format('the inherited %s may be carried as %s by a %s under the approved %s rule %s', v_sens_max, v_rule.to_value, p_type, v_rule.transformation, v_rule.rule_id)
                   ELSE format('the inherited sensitivity %s travels with this product (no header field states it; the evidence attributes are its record)%s', v_sens_max,
                               CASE WHEN v_sens_unrecorded > 0 THEN format('; %s evidence version(s) record none', v_sens_unrecorded) ELSE '' END) END);
  -- LICENCE
  v_obl := v_obl || jsonb_build_object('obligation', 'licence', 'inherited', v_lic_all, 'imposed_by', '[]'::jsonb, 'header', NULL,
    'status', CASE WHEN jsonb_array_length(v_lic_all) = 0 THEN 'none' ELSE 'carried' END, 'rule', NULL,
    'detail', CASE WHEN jsonb_array_length(v_lic_all) = 0 THEN 'no evidence on the path names a licence' ELSE format('%s licence(s) on the path apply to this product together', jsonb_array_length(v_lic_all)) END);
  SELECT count(*) INTO v_violations FROM jsonb_array_elements(v_obl) x WHERE x ->> 'status' IN ('not_satisfied', 'conflicting', 'withdrawn');
  RETURN jsonb_build_object('ref', p_type || ':' || p_id || '@' || p_version, 'rule_version', 'b40-va-inherit-1', 'as_of', graph.pv_iso(v_at),
    'inputs', jsonb_build_object('objects', jsonb_array_length(v_inputs), 'evidence', v_evd, 'refs', v_inputs, 'truncated', coalesce((cl ->> 'truncated')::boolean, false),
                                 'method', 'graph.pv_closure (8 steps, 200 objects)'),
    'obligations', v_obl, 'open_findings', v_violations,
    'header_basis', CASE WHEN v_basis IS NULL THEN jsonb_build_object('statement', 'recorded before B50 — no header basis is recorded for this version') ELSE v_basis -> 'controls' END,
    'limitations', jsonb_build_array('the location, model, agent and side-effect policy dimensions are B62''s (F-P7D-04) — not folded here',
                                     'a read: the write paths do not consult it yet; a not_satisfied finding is shown, never silently corrected'));
END $$;
REVOKE ALL ON FUNCTION objects.inherited_obligations(uuid, uuid, text, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.inherited_obligations(uuid, uuid, text, uuid, int) TO eye_app, eye_commit;

-- §VA.16 THE PER-TENANT RETENTION REGISTER (V02-T-038) ──────────────────────────────────────────────────────────────────────────────────────
/* A TENANT read (retention.register.read; the caller TENANT-bound — an auditor, the tenant administrator, the retention authority): for every
   domain of the tenant, every schedule (active and retired, with its retirement) — the evidence under it (the evidence manifests of its
   profile, and of its source when it names one; tombstoned ones apart), the OVERDUE (due and not under an open action of its kind), the NEXT
   EXPIRY (the earliest due instant still ahead), the open actions it opened and the active legal holds on its evidence; then the profiles NO
   active schedule governs (their evidence count and oldest). Metadata only: no bytes, no payload. */
CREATE OR REPLACE FUNCTION retention.tenant_register(p_tenant uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = retention, observation, tenancy, graph, pg_catalog, pg_temp AS $$
DECLARE v_at timestamptz := clock_timestamp(); v_domains jsonb := '[]'::jsonb; d record; v_sched jsonb; v_unsched jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, NULL, 'the tenant retention register');
  IF public.eye_scope() IS DISTINCT FROM 'TENANT' AND NOT coalesce((SELECT r.rolbypassrls OR r.rolsuper FROM pg_catalog.pg_roles r WHERE r.rolname = session_user), false) THEN
    RAISE EXCEPTION 'retention register rejected (scope): the tenant register is read at TENANT scope' USING ERRCODE = '42501';
  END IF;
  FOR d IN SELECT x.id, x.name, x.status, x.retention_profile FROM tenancy.domains x WHERE x.tenant_id = p_tenant ORDER BY x.name, x.id LOOP
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'schedule_id', s.schedule_id, 'retention_profile', s.retention_profile, 'target_kind', s.target_kind, 'action_kind', s.action_kind,
             'due_after', s.due_after::text, 'selector', s.selector, 'state', s.state, 'owner_principal_id', s.owner_principal_id,
             'declared_at', graph.pv_iso(s.declared_at), 'retired_at', graph.pv_iso(s.retired_at), 'last_evaluated_at', graph.pv_iso(s.last_evaluated_at),
             'evidence', m.n, 'tombstoned', m.tomb, 'overdue', m.overdue, 'next_expiry', graph.pv_iso(m.next_due), 'held', m.held,
             'open_actions', (SELECT count(*) FROM retention.actions_current a WHERE a.schedule_id = s.schedule_id AND a.state NOT IN ('withdrawn', 'rejected', 'failed', 'verified', 'verified_with_residuals')))
           ORDER BY s.state, s.declared_at), '[]'::jsonb)
      INTO v_sched
      FROM retention.schedules s
      CROSS JOIN LATERAL (
        SELECT count(*) FILTER (WHERE NOT q.tomb) AS n, count(*) FILTER (WHERE q.tomb) AS tomb,
               count(*) FILTER (WHERE NOT q.tomb AND s.target_kind = 'evidence' AND q.due <= v_at AND NOT q.under_action) AS overdue,
               min(q.due) FILTER (WHERE NOT q.tomb AND s.target_kind = 'evidence' AND q.due > v_at) AS next_due,
               count(*) FILTER (WHERE NOT q.tomb AND q.held) AS held
          FROM (SELECT bm.manifest_id, bm.created_at + s.due_after AS due,
                       EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = bm.manifest_id) AS tomb,
                       EXISTS (SELECT 1 FROM observation.legal_holds h WHERE h.manifest_id = bm.manifest_id AND h.lifted_at IS NULL) AS held,
                       EXISTS (SELECT 1 FROM retention.actions_current a WHERE a.tenant_id = p_tenant AND a.domain_id = d.id AND a.kind = s.action_kind
                                 AND a.state NOT IN ('withdrawn', 'rejected', 'failed', 'verified', 'verified_with_residuals') AND a.selector ->> 'manifest_id' = bm.manifest_id::text) AS under_action
                  FROM observation.blob_manifests bm
                 WHERE s.target_kind = 'evidence' AND bm.tenant_id = p_tenant AND bm.domain_id = d.id AND bm.vault = 'evidence' AND bm.retention_profile = s.retention_profile
                   AND (s.selector ->> 'source_id' IS NULL OR bm.source_id = (s.selector ->> 'source_id')::uuid)) q) m
     WHERE s.tenant_id = p_tenant AND s.domain_id = d.id;
    SELECT coalesce(jsonb_agg(jsonb_build_object('retention_profile', u.retention_profile, 'evidence', u.n, 'oldest', graph.pv_iso(u.oldest),
                                                 'statement', 'no active schedule governs this profile — its evidence is retained until a schedule or an action reaches it') ORDER BY u.retention_profile), '[]'::jsonb)
      INTO v_unsched
      FROM (SELECT bm.retention_profile, count(*) AS n, min(bm.created_at) AS oldest FROM observation.blob_manifests bm
             WHERE bm.tenant_id = p_tenant AND bm.domain_id = d.id AND bm.vault = 'evidence'
               AND NOT EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = bm.manifest_id)
               AND NOT EXISTS (SELECT 1 FROM retention.schedules s WHERE s.tenant_id = p_tenant AND s.domain_id = d.id AND s.state = 'active' AND s.target_kind = 'evidence' AND s.retention_profile = bm.retention_profile)
             GROUP BY bm.retention_profile) u;
    v_domains := v_domains || jsonb_build_array(jsonb_build_object('domain_id', d.id, 'name', d.name, 'status', d.status, 'default_retention_profile', d.retention_profile,
      'schedules', v_sched, 'unscheduled_profiles', v_unsched,
      'holds', (SELECT count(*) FROM observation.legal_holds h WHERE h.tenant_id = p_tenant AND h.domain_id = d.id AND h.lifted_at IS NULL),
      'evidence', (SELECT count(*) FROM observation.blob_manifests bm WHERE bm.tenant_id = p_tenant AND bm.domain_id = d.id AND bm.vault = 'evidence'
                     AND NOT EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = bm.manifest_id))));
  END LOOP;
  RETURN jsonb_build_object('tenant_id', p_tenant, 'domains', v_domains, 'as_of', graph.pv_iso(v_at),
    'statement', 'the evidence under each schedule is counted by its manifests (bytes digest-verified on every read); the overdue are due and not yet under an open action — the schedule evaluation opens them');
END $$;
REVOKE ALL ON FUNCTION retention.tenant_register(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.tenant_register(uuid) TO eye_app, eye_commit;

-- §VA.17 (B40 integration) graph.px_facet — 0121 §PX.6, its LAST definition, copied WHOLE; the addition marked `-- B40 integration` ──────────
/* The trust envelope (graph.trust_envelope) derives its facets from px_facet, which read every evidence version's state through
   graph.ev_evidence_state but not its AUTHENTICITY (§VA.11 adds it there): a claim resting on evidence whose publisher signature FAILED read
   WEAK (px_strength_of) and yet its envelope stayed determinate. The CUSTODY facet — the facet of each evidence version's own record — now
   FAILS for a version recorded authenticity `failed` (D6), with the recorded statement, so the envelope reads TRUST INDETERMINATE with that
   reason. `unsigned`, `unavailable` and `not_recorded` change nothing here (content authenticity unknown is not a failure). */
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
        ELSIF s #>> '{authenticity,outcome}' = 'failed' THEN                                                                                    -- B40 integration (§VA, D6)
          v_failed := v_failed + 1; IF cardinality(v_detail) < 5 THEN v_detail := v_detail || format('%s: authenticity failed — %s', n ->> 'ref',      -- B40 integration
            coalesce(s #>> '{authenticity,detail}', 'its publisher signature did not verify at admission (admitted marked, never established as the publisher''s content)')); END IF;   -- B40 integration
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



-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §IN — intake inspection, quarantine and the intake review queue (F-P1-03)
-- FOLDED by the integrator from 0123_b40_x_in.sql (b40/in), verbatim below unless a line is marked `-- B40 integration`.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0123 §IN — CP-6 B40: INTAKE INSPECTION, QUARANTINE AND THE INTAKE REVIEW QUEUE (F-P1-03). Applies ALONE on 0001–0122 + 0123 §0; folded into
-- 0123_b40_source_platform.sql at the integration (order §0, §RG, §VA, §IN, §AP, §CR). 0001–0122 and 0123 §0 are untouched.
--
--   §IN.1 observation.inspection_verdicts    EVERY engine's verdict on every inspected item, as EVIDENCE beside the record it describes (the
--                                             admission's EVD version or the quarantine case): the engine identity (engine, engine version, the
--                                             OCI image digest, the rule-set digest, the SIGNATURE DATABASES — each name, version, build time and
--                                             digest — and the engine configuration: the database source and update policy named explicitly), the
--                                             outcome (observation.inspection_outcome, §0: clean | detected | unavailable | failed | incomplete) and
--                                             the findings — codes, classes, byte offsets and lengths, NEVER content (D9). Append-only. DESIGN D2:
--                                             an item PASSES only when every engine answered clean — the record port refuses a "pass" carrying any
--                                             other outcome (the rule held in the database, not only in TypeScript).
--   §IN.2 observation.intake_assessments     one row per inspected item: the review reason (safety | authenticity | policy | duplicate | quality |
--                                             rights | integrity | schema | identity), the DUPLICATE state (none | same_digest — the bytes of an
--                                             admitted evidence version of this domain | same_item_other_digest — the source's item key admitted
--                                             before with other bytes), the QUALITY score (completeness, parse confidence, duplication), the upload
--                                             facts (manual upload, the uploader), and the CONSUMER NOTICE (a case opened on a source that products
--                                             rest on — observation.source_derived_products, B22/B28). Append-only. No back-fill: an earlier item has
--                                             no row and every read says "not recorded before B40".
--   §IN.3 observation.upload_approvals       THE UPLOAD APPROVAL WORKFLOW (SP-22): an upload of an SRC@v4 contract outside its auto_admit rule is
--          (+ observation.upload_approval_events)  held — its bytes stay in the quarantine volume under a case — until a SECOND PERSON, never the
--                                             uploader, never an agent, approves or declines it (observation.decide_upload); the release itself is
--                                             the existing quarantine review (close_quarantine_case requires the approval).
--   §IN.4 observation.close_quarantine_case  re-declared WHOLE from its last definition (0022:1403): the reviewer is a named human (never an
--                                             agent); for a MANUAL UPLOAD (the case's run is the operator-upload connector) the reviewer is never
--                                             the uploader (DESIGN D9b — a collected item keeps today's rule, so the hosted journey 8's same-manager
--                                             collect-and-discard stays green); a held upload is released only once approved. Every earlier
--                                             refusal keeps its text; the new ones are in the class form `quarantine review rejected (<class>): …`.
--   §IN.5 the reads                          observation.intake_review_queue (the queue: every case of the domain with its reason, verdicts,
--                                             duplicate state, quality, approval and notice — the two stale eye_demo cases visible and untouched,
--                                             D16: "past expiry, not expired by the sweeper"), observation.intake_case_read (the case's WHY: the
--                                             verdicts with their engine identity and findings, never content — the excerpt is a separate read
--                                             under observation.evidence.retrieve, D9), observation.inspection_verdicts_read (an evidence version's
--                                             verdicts — the evidence page's list). Guarded by observation.assert_read_scope.
-- PDP (pdp.service.ts /* B40 in */): observation.inspection.read (observation.read's human readers — metadata only, D9), observation.upload.approve
-- (collection_manager / domain_admin, human-gated). The record port runs under the admission's and the quarantine's own actions
-- (observation.item.admit / observation.item.quarantine — the collection agent's, unchanged). No role (D14), no CHECK widened (§0's vocabularies).
-- THREE CLAIMS: construction (this file and its harnesses); demonstrated operation (§AC's act on SYNTHETIC personas); real acceptance (B111's
-- shared recording path, then H3/R2) — never claimed. The ClamAV image is NOT admitted (DESIGN "D2 — the admission result"): the clamd engine's
-- verdicts recorded here come from the adapter against an engine the deployment configures; EXC-P1-001 stays OPEN (the owner closes it).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §IN.0 HELPERS (internal: no runtime grant; reached from the definer ports below, which run as the owner) ───────────────────────────────────

/* The review reason a quarantine class falls under (PR-16-001 / CAP-OB-11): the queue's grouping. Every historic class and every §0 class is
   named; an unknown class reads `other` (never guessed into a category). */
CREATE OR REPLACE FUNCTION observation.intake_review_reason(p_class text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE
    WHEN p_class IS NULL THEN NULL
    WHEN p_class IN ('active_content', 'macro', 'embedded_file', 'hidden_instruction', 'malware_verdict', 'inspection_unavailable', 'inspection_failed',
                     'inspection_incomplete') THEN 'safety'
    WHEN p_class = 'unknown_signer' THEN 'authenticity'
    WHEN p_class IN ('policy_prohibited', 'residency_conflict', 'approval_required') THEN 'policy'   -- B40 integration: + approval_required (SP-22)
    WHEN p_class = 'duplicate' THEN 'duplicate'
    WHEN p_class = 'quality' THEN 'quality'
    WHEN p_class = 'rights' THEN 'rights'
    WHEN p_class IN ('path_traversal', 'expansion_limit', 'entry_limit', 'compression_ratio', 'malformed_archive', 'type_mismatch', 'oversize') THEN 'integrity'
    WHEN p_class = 'schema_drift' THEN 'schema'
    WHEN p_class IN ('destination_identity_changed', 'response_anomaly') THEN 'identity'
    ELSE 'other' END
$$;
REVOKE ALL ON FUNCTION observation.intake_review_reason(text) FROM PUBLIC;

/* The findings of one verdict carry codes, classes, offsets, lengths and a short detail — NEVER content (D9). A finding with any other key, a
   negative offset or a detail over 240 characters is refused by the table's CHECK. */
CREATE OR REPLACE FUNCTION observation.iv_findings_ok(p jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT jsonb_typeof(p) = 'array' AND jsonb_array_length(p) <= 200 AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(p) f
     WHERE jsonb_typeof(f) <> 'object'
        OR NOT (f ? 'code') OR jsonb_typeof(f -> 'code') <> 'string' OR length(f ->> 'code') NOT BETWEEN 1 AND 160
        OR EXISTS (SELECT 1 FROM jsonb_object_keys(f) k WHERE k NOT IN ('code', 'class', 'offset', 'length', 'detail'))
        OR (f ? 'offset' AND (jsonb_typeof(f -> 'offset') <> 'number' OR (f ->> 'offset')::numeric < 0))
        OR (f ? 'length' AND (jsonb_typeof(f -> 'length') <> 'number' OR (f ->> 'length')::numeric < 0))
        OR (f ? 'detail' AND (jsonb_typeof(f -> 'detail') <> 'string' OR length(f ->> 'detail') > 240))
        OR (f ? 'class' AND jsonb_typeof(f -> 'class') <> 'string'))
$$;
REVOKE ALL ON FUNCTION observation.iv_findings_ok(jsonb) FROM PUBLIC;

/* The signature databases an engine reported (or the deployment declared and the engine confirmed): each { name, version, buildTime, digest },
   the unknown parts null — never inferred. */
CREATE OR REPLACE FUNCTION observation.iv_databases_ok(p jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT jsonb_typeof(p) = 'array' AND jsonb_array_length(p) <= 32 AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(p) d
     WHERE jsonb_typeof(d) <> 'object' OR jsonb_typeof(d -> 'name') <> 'string'
        OR EXISTS (SELECT 1 FROM jsonb_object_keys(d) k WHERE k NOT IN ('name', 'version', 'buildTime', 'digest'))
        OR (d -> 'digest' IS NOT NULL AND jsonb_typeof(d -> 'digest') <> 'null' AND (d ->> 'digest') !~ '^[0-9a-f]{64}$'))
$$;
REVOKE ALL ON FUNCTION observation.iv_databases_ok(jsonb) FROM PUBLIC;

/* The OPERATOR who uploaded the item of a run, or NULL when the run is not a manual upload: the operator-upload connector's run records its
   trigger on run.started (`principal:<uuid>`, orchestrator.collectNow). A scheduled or "Collect now" run of any other connector is not an
   upload (D9b: the reviewer ≠ uploader rule applies to manual uploads only). */
CREATE OR REPLACE FUNCTION observation.in_uploader_of_run(p_run uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN e.details #>> '{trigger,by}' ~ '^principal:[0-9a-fA-F-]{36}$' THEN substr(e.details #>> '{trigger,by}', 11)::uuid END
    FROM observation.collection_run_events e
   WHERE e.run_id = p_run AND e.event = 'run.started' AND e.connector = 'collection.upload'
   ORDER BY e.occurred_at LIMIT 1
$$;
REVOKE ALL ON FUNCTION observation.in_uploader_of_run(uuid) FROM PUBLIC;

-- §IN.1 THE VERDICT LEDGER ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE observation.inspection_verdicts (
  verdict_id           uuid PRIMARY KEY,
  scope                text NOT NULL,
  tenant_id            uuid NOT NULL,
  domain_id            uuid NOT NULL,
  source_id            uuid NOT NULL,
  contract_version     int  NOT NULL,
  run_id               uuid,
  item_key             text NOT NULL,
  content_digest       text NOT NULL CHECK (content_digest ~ '^[0-9a-f]{64}$'),
  record_point         text NOT NULL CHECK (record_point IN ('admitted', 'quarantined')),
  evd_object_id        uuid,
  evd_version          int,
  case_id              uuid,
  manifest_id          uuid NOT NULL,
  engine               text NOT NULL CHECK (engine ~ '^[a-z][a-z0-9-]{1,40}$'),
  engine_version       text CHECK (engine_version IS NULL OR length(engine_version) BETWEEN 1 AND 120),
  image_digest         text CHECK (image_digest IS NULL OR image_digest ~ '^sha256:[0-9a-f]{64}$'),
  rule_set_digest      text CHECK (rule_set_digest IS NULL OR rule_set_digest ~ '^[0-9a-f]{64}$'),
  signature_databases  jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (observation.iv_databases_ok(signature_databases)),
  engine_config        jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(engine_config) = 'object'),
  outcome              observation.inspection_outcome NOT NULL,
  findings             jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (observation.iv_findings_ok(findings)),
  detail               text CHECK (detail IS NULL OR length(detail) <= 500),
  started_at           timestamptz NOT NULL,
  finished_at          timestamptz NOT NULL,
  decision             text NOT NULL CHECK (decision IN ('pass', 'quarantine')),
  decision_class       text,
  recorded_by          uuid NOT NULL,
  recorded_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id       uuid NOT NULL,
  CONSTRAINT iv_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT iv_point_bound CHECK ((record_point = 'admitted') = (evd_object_id IS NOT NULL AND evd_version IS NOT NULL)
                                   AND (record_point = 'quarantined') = (case_id IS NOT NULL)),
  CONSTRAINT iv_decision_bound CHECK ((decision = 'pass') = (decision_class IS NULL)),
  -- DESIGN D2 held by the row itself: an item that PASSED was scanned clean by this engine; an admitted item never carries another outcome
  CONSTRAINT iv_pass_is_clean CHECK (decision = 'quarantine' OR outcome = 'clean'),
  CONSTRAINT iv_admitted_passed CHECK (record_point = 'quarantined' OR decision = 'pass'),
  CONSTRAINT iv_time_order CHECK (finished_at >= started_at)
);
COMMENT ON TABLE observation.inspection_verdicts IS 'B40 §IN (F-P1-03; DESIGN D2): every inspection engine''s verdict on every inspected item of an SRC@v4 contract, recorded as evidence beside the admission (EVD version) or the quarantine case it describes — the engine identity (engine, version, image digest, rule-set digest, signature databases with versions / build times / digests, the configuration naming the database source and update policy), the outcome (clean | detected | unavailable | failed | incomplete; only clean passes) and the findings (codes, classes, offsets — never content, D9). Append-only; no back-fill.';
CREATE INDEX iv_evd ON observation.inspection_verdicts (evd_object_id, evd_version) WHERE evd_object_id IS NOT NULL;
CREATE INDEX iv_case ON observation.inspection_verdicts (case_id) WHERE case_id IS NOT NULL;
CREATE INDEX iv_source ON observation.inspection_verdicts (tenant_id, domain_id, source_id, recorded_at DESC);
CREATE TRIGGER iv_append_only BEFORE UPDATE OR DELETE ON observation.inspection_verdicts FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- §IN.2 THE ASSESSMENT OF EACH INSPECTED ITEM ──────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE observation.intake_assessments (
  assessment_id        uuid PRIMARY KEY,
  scope                text NOT NULL,
  tenant_id            uuid NOT NULL,
  domain_id            uuid NOT NULL,
  source_id            uuid NOT NULL,
  contract_version     int  NOT NULL,
  run_id               uuid,
  item_key             text NOT NULL,
  content_digest       text NOT NULL CHECK (content_digest ~ '^[0-9a-f]{64}$'),
  scanned_digest_verified boolean NOT NULL,
  record_point         text NOT NULL CHECK (record_point IN ('admitted', 'quarantined')),
  evd_object_id        uuid,
  evd_version          int,
  case_id              uuid,
  manifest_id          uuid NOT NULL,
  decision             text NOT NULL CHECK (decision IN ('pass', 'quarantine')),
  decision_class       text,
  review_reason        text CHECK (review_reason IS NULL OR review_reason IN ('safety', 'authenticity', 'policy', 'duplicate', 'quality', 'rights', 'integrity',
                                                                              'schema', 'identity', 'other')),
  engines_required     jsonb NOT NULL CHECK (jsonb_typeof(engines_required) = 'array'),
  content_rules        jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(content_rules) = 'object'),
  duplicate_state      text NOT NULL CHECK (duplicate_state IN ('none', 'same_digest', 'same_item_other_digest')),
  duplicate_of         jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(duplicate_of) = 'array'),
  quality_score        numeric(4, 3) NOT NULL CHECK (quality_score BETWEEN 0 AND 1),
  quality              jsonb NOT NULL CHECK (jsonb_typeof(quality) = 'object'),
  manual_upload        boolean NOT NULL,
  uploader_principal_id uuid,
  consumer_notice      jsonb,
  recorded_by          uuid NOT NULL,
  recorded_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id       uuid NOT NULL,
  CONSTRAINT ia_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT ia_point_bound CHECK ((record_point = 'admitted') = (evd_object_id IS NOT NULL AND evd_version IS NOT NULL)
                                   AND (record_point = 'quarantined') = (case_id IS NOT NULL)),
  CONSTRAINT ia_decision_bound CHECK ((decision = 'pass') = (decision_class IS NULL)),
  CONSTRAINT ia_upload_bound CHECK (manual_upload OR uploader_principal_id IS NULL),
  CONSTRAINT ia_notice_on_case CHECK (consumer_notice IS NULL OR record_point = 'quarantined')
);
COMMENT ON TABLE observation.intake_assessments IS 'B40 §IN (PR-16-001/-002, CAP-OB-11, DP-16-001): one row per inspected item of an SRC@v4 contract — the review reason, the duplicate state (same digest admitted in this domain / the source''s item key admitted with other bytes), the quality score (completeness, parse confidence, duplication), the manual-upload facts and the consumer notice (a case opened on a source products rest on). Append-only; earlier items read "not recorded before B40".';
CREATE UNIQUE INDEX ia_case_once ON observation.intake_assessments (case_id) WHERE case_id IS NOT NULL;
CREATE UNIQUE INDEX ia_evd_once ON observation.intake_assessments (evd_object_id, evd_version) WHERE evd_object_id IS NOT NULL;
CREATE INDEX ia_source ON observation.intake_assessments (tenant_id, domain_id, source_id, recorded_at DESC);
CREATE TRIGGER ia_append_only BEFORE UPDATE OR DELETE ON observation.intake_assessments FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- §IN.3 THE UPLOAD APPROVAL WORKFLOW (SP-22) ───────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE observation.upload_approvals (
  approval_id          uuid PRIMARY KEY,
  scope                text NOT NULL,
  tenant_id            uuid NOT NULL,
  domain_id            uuid NOT NULL,
  source_id            uuid NOT NULL,
  contract_version     int  NOT NULL,
  case_id              uuid NOT NULL UNIQUE,
  manifest_id          uuid NOT NULL,
  item_key             text NOT NULL,
  content_digest       text NOT NULL CHECK (content_digest ~ '^[0-9a-f]{64}$'),
  byte_length          bigint NOT NULL CHECK (byte_length >= 0),
  media_type           text,
  requester_principal_id uuid NOT NULL,
  purpose              text NOT NULL CHECK (length(btrim(purpose)) BETWEEN 1 AND 200),
  rule                 jsonb NOT NULL CHECK (jsonb_typeof(rule) = 'object'),
  held_because         text NOT NULL CHECK (length(btrim(held_because)) BETWEEN 8 AND 500),
  state                text NOT NULL CHECK (state IN ('pending', 'approved', 'declined', 'expired')),
  requested_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_by           uuid,
  decided_at           timestamptz,
  decision_reason      text CHECK (decision_reason IS NULL OR length(btrim(decision_reason)) BETWEEN 8 AND 2000),
  correlation_id       uuid NOT NULL,
  CONSTRAINT ua_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT ua_decided_bound CHECK ((state = 'pending') = (decided_at IS NULL)
                                     AND (state IN ('approved', 'declined')) = (decided_by IS NOT NULL)),
  -- the second person (SP-22, PR-16-003): never the requester — held by the row too
  CONSTRAINT ua_second_person CHECK (decided_by IS NULL OR decided_by <> requester_principal_id)
);
COMMENT ON TABLE observation.upload_approvals IS 'B40 §IN (SP-22, PR-16-003): an operator upload of an SRC@v4 contract outside its auto_admit rule, held in the quarantine volume under its case until a second person (never the uploader, never an agent) approves or declines it; the release is the existing quarantine review. The row''s state moves only through observation.decide_upload and observation.close_quarantine_case; every move is in observation.upload_approval_events.';
CREATE INDEX ua_pending ON observation.upload_approvals (tenant_id, domain_id, requested_at DESC) WHERE state = 'pending';

CREATE TABLE observation.upload_approval_events (
  event_id             uuid PRIMARY KEY,
  scope                text NOT NULL,
  tenant_id            uuid NOT NULL,
  domain_id            uuid NOT NULL,
  approval_id          uuid NOT NULL REFERENCES observation.upload_approvals (approval_id),
  event                text NOT NULL CHECK (event IN ('upload.held', 'upload.approved', 'upload.declined', 'upload.expired')),
  actor                uuid NOT NULL,
  details              jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  occurred_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id       uuid NOT NULL,
  CONSTRAINT uae_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
COMMENT ON TABLE observation.upload_approval_events IS 'B40 §IN: the ledger of the upload approval workflow — held, approved, declined, expired — who and why; append-only.';
CREATE INDEX uae_approval ON observation.upload_approval_events (approval_id, occurred_at);
CREATE TRIGGER uae_append_only BEFORE UPDATE OR DELETE ON observation.upload_approval_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

REVOKE ALL ON observation.inspection_verdicts, observation.intake_assessments, observation.upload_approvals, observation.upload_approval_events FROM PUBLIC;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['inspection_verdicts', 'intake_assessments', 'upload_approvals', 'upload_approval_events'] LOOP
    EXECUTE format('ALTER TABLE observation.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE observation.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY oin_isolation ON observation.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON observation.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- §IN.1/§IN.2/§IN.3 THE RECORD PORT ─────────────────────────────────────────────────────────────────────────────────────────────────────────
/* Called by the inspect stage's `record` inside the admission transaction (the EVD version written) or the quarantine transaction (the case
   opened) — under that transaction's own action (observation.item.admit / observation.item.quarantine, the collection agent's). It writes
   every engine's verdict, the item's assessment (duplicate state and the quality computed HERE from the domain's records), the custody entry
   `custody.inspected` (the manifest, the digest the engines scanned, verified against the stored digest), the consumer notice when a case
   opens on a source products rest on, and — for a held upload — the pending upload approval. D2 in the database: a `pass` with any verdict
   other than clean is refused; a pass at the quarantined point names no class; an admission never records a quarantine decision. */
CREATE OR REPLACE FUNCTION observation.record_inspection(
  p_tenant uuid, p_domain uuid, p_source uuid, p_contract_version int, p_run uuid, p_point jsonb, p_decision text, p_decision_class text,
  p_verdicts jsonb, p_assessment jsonb, p_correlation uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, objects, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid := public.eye_principal(); v_kind text := p_point ->> 'kind'; v_evd uuid; v_ver int; v_case uuid; v_manifest uuid;
        v_item text := p_point ->> 'itemKey'; v_digest text := p_point ->> 'contentDigest'; v_q observation.quarantine_current%ROWTYPE;
        v jsonb; v_count int := 0; v_dup text := 'none'; v_dup_of jsonb := '[]'::jsonb; v_dup_score numeric; v_completeness numeric;
        v_parse numeric; v_score numeric; v_uploader uuid; v_upload boolean := false; v_notice jsonb := NULL; v_products jsonb;
        v_assessment uuid := gen_random_uuid(); v_approval uuid := NULL; v_verified boolean; v_evd_obs uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.item.admit', 'observation.item.quarantine']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'inspection verdict rejected (actor): a verdict is recorded under the acting principal of the run' USING ERRCODE = '42501';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('pass', 'quarantine') THEN
    RAISE EXCEPTION 'inspection verdict rejected (decision): the decision is pass | quarantine (got %)', coalesce(p_decision, '<none>') USING ERRCODE = '22023';
  END IF;
  IF (p_decision = 'pass') <> (p_decision_class IS NULL) THEN
    RAISE EXCEPTION 'inspection verdict rejected (decision): a quarantine decision names its class and a pass names none' USING ERRCODE = '22023';
  END IF;
  IF v_digest IS NULL OR v_digest !~ '^[0-9a-f]{64}$' OR v_item IS NULL OR length(v_item) = 0 THEN
    RAISE EXCEPTION 'inspection verdict rejected (point): the record point names the item key and its content digest' USING ERRCODE = '22023';
  END IF;
  IF p_verdicts IS NULL OR jsonb_typeof(p_verdicts) <> 'array' OR jsonb_array_length(p_verdicts) = 0 THEN
    RAISE EXCEPTION 'inspection verdict rejected (verdicts): an inspected item carries at least one engine verdict' USING ERRCODE = '22023';
  END IF;
  -- DESIGN D2: ONLY clean passes — the database refuses a pass that any engine did not answer clean (the stage's rule, held twice)
  IF p_decision = 'pass' AND EXISTS (SELECT 1 FROM jsonb_array_elements(p_verdicts) x WHERE x ->> 'outcome' IS DISTINCT FROM 'clean') THEN
    RAISE EXCEPTION 'inspection verdict rejected (state): an item passes only when every engine answered clean; an unavailable, failed, incomplete or detected scan is never a pass (D2)'
      USING ERRCODE = '23514';
  END IF;
  -- THE RECORD POINT: the admission's EVD version, or the quarantine case — each of THIS source, tenant and domain
  IF v_kind = 'admitted' THEN
    IF p_decision <> 'pass' THEN
      RAISE EXCEPTION 'inspection verdict rejected (state): an admitted item records a pass; a quarantine decision never reaches an admission' USING ERRCODE = '23514';
    END IF;
    v_evd := (p_point ->> 'evdObjectId')::uuid; v_ver := (p_point ->> 'evdVersion')::int; v_manifest := (p_point ->> 'manifestId')::uuid;
    SELECT (o.payload ->> 'obs_object_id')::uuid INTO v_evd_obs FROM objects.canonical_objects o
     WHERE o.object_type = 'EVD' AND o.object_id = v_evd AND o.object_version = v_ver AND o.tenant_id = p_tenant AND o.domain_id = p_domain
       AND o.payload ->> 'manifest_id' = v_manifest::text AND o.payload ->> 'content_digest' = v_digest;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'inspection verdict rejected (unknown_evidence): EVD % v% with this manifest and digest is not recorded in this domain', coalesce(v_evd::text, '<none>'), coalesce(v_ver::text, '<none>')
        USING ERRCODE = '23503';
    END IF;
  ELSIF v_kind = 'quarantined' THEN
    v_case := (p_point ->> 'caseId')::uuid; v_manifest := (p_point ->> 'manifestId')::uuid;
    SELECT * INTO v_q FROM observation.quarantine_current q
     WHERE q.case_id = v_case AND q.tenant_id = p_tenant AND q.domain_id = p_domain AND q.source_id = p_source AND q.contract_version = p_contract_version;
    IF NOT FOUND OR v_q.manifest_id IS DISTINCT FROM v_manifest OR v_q.content_digest IS DISTINCT FROM v_digest THEN
      RAISE EXCEPTION 'inspection verdict rejected (unknown_case): quarantine case % with this manifest and digest is not open for this source in this domain', coalesce(v_case::text, '<none>')
        USING ERRCODE = '23503';
    END IF;
  ELSE
    RAISE EXCEPTION 'inspection verdict rejected (point): the record point is admitted | quarantined (got %)', coalesce(v_kind, '<none>') USING ERRCODE = '22023';
  END IF;

  -- every engine's verdict, WITH its identity (the table's CHECKs refuse content in findings and a malformed identity)
  FOR v IN SELECT x FROM jsonb_array_elements(p_verdicts) x LOOP
    INSERT INTO observation.inspection_verdicts (verdict_id, scope, tenant_id, domain_id, source_id, contract_version, run_id, item_key, content_digest,
      record_point, evd_object_id, evd_version, case_id, manifest_id, engine, engine_version, image_digest, rule_set_digest, signature_databases,
      engine_config, outcome, findings, detail, started_at, finished_at, decision, decision_class, recorded_by, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_source, p_contract_version, p_run, v_item, v_digest,
      v_kind, v_evd, v_ver, v_case, v_manifest, v ->> 'engine', v ->> 'engineVersion', v ->> 'imageDigest', v ->> 'ruleSetDigest',
      coalesce(v -> 'signatureDatabases', '[]'::jsonb), coalesce(v -> 'engineConfig', '{}'::jsonb), (v ->> 'outcome')::observation.inspection_outcome,
      coalesce(v -> 'findings', '[]'::jsonb), left(v ->> 'detail', 500), (v ->> 'startedAt')::timestamptz, (v ->> 'finishedAt')::timestamptz,
      p_decision, p_decision_class, v_actor, p_correlation);
    v_count := v_count + 1;
  END LOOP;

  -- THE DUPLICATE STATE, from this domain's records (never from the run's own claim): the same bytes already admitted as evidence; or the
  -- source's same item key admitted before with other bytes
  SELECT coalesce(jsonb_agg(jsonb_build_object('kind', 'manifest', 'manifest_id', m.manifest_id, 'source_id', m.source_id) ORDER BY m.created_at), '[]'::jsonb)
    INTO v_dup_of
    FROM (SELECT m.* FROM observation.blob_manifests m
           WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain AND m.vault = 'evidence' AND m.content_digest = v_digest
             AND m.manifest_id IS DISTINCT FROM CASE WHEN v_kind = 'admitted' THEN v_manifest END
           ORDER BY m.created_at LIMIT 5) m;
  IF jsonb_array_length(v_dup_of) > 0 THEN
    v_dup := 'same_digest';
  ELSE
    SELECT coalesce(jsonb_agg(jsonb_build_object('kind', 'evidence', 'evd_object_id', a.evd_object_id, 'item_key', a.item_key) ORDER BY a.first_seen_at), '[]'::jsonb)
      INTO v_dup_of
      FROM (SELECT a.* FROM observation.acquisition_attempts a
             WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.source_id = p_source AND a.item_key = v_item AND a.outcome = 'admitted'
               AND a.evd_object_id IS NOT NULL AND a.evd_object_id IS DISTINCT FROM v_evd
               AND EXISTS (SELECT 1 FROM objects.canonical_objects e WHERE e.object_type = 'EVD' AND e.object_id = a.evd_object_id
                             AND e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.payload ->> 'content_digest' <> v_digest)
             ORDER BY a.first_seen_at LIMIT 5) a;
    IF jsonb_array_length(v_dup_of) > 0 THEN v_dup := 'same_item_other_digest'; END IF;
  END IF;
  -- THE QUALITY SCORE: completeness and parse confidence measured by the stage (0..1), duplication from the state above; their mean, stated
  v_completeness := least(greatest(coalesce((p_assessment #>> '{quality,completeness}')::numeric, 0), 0), 1);
  v_parse := least(greatest(coalesce((p_assessment #>> '{quality,parse_confidence}')::numeric, 0), 0), 1);
  v_dup_score := CASE v_dup WHEN 'none' THEN 1 WHEN 'same_item_other_digest' THEN 0.5 ELSE 0 END;
  v_score := round((v_completeness + v_parse + v_dup_score) / 3, 3);
  v_verified := (p_assessment ->> 'scannedDigest') = v_digest;

  -- THE MANUAL UPLOAD: the operator who uploaded (the run's trigger on the operator-upload connector)
  v_uploader := observation.in_uploader_of_run(p_run);
  v_upload := (SELECT e.connector = 'collection.upload' FROM observation.collection_run_events e WHERE e.run_id = p_run AND e.event = 'run.started' LIMIT 1);
  v_upload := coalesce(v_upload, false);

  -- THE CONSUMER NOTICE (PR-16-005): a case opened on a source that products rest on — the products counted by kind, for the steward and the
  -- collection managers (B22/B28's walk, unchanged)
  IF v_kind = 'quarantined' THEN
    SELECT coalesce(jsonb_object_agg(k.subject_kind, k.n), '{}'::jsonb) INTO v_products
      FROM (SELECT d.subject_kind, count(*) n FROM observation.source_derived_products(p_tenant, p_domain, p_source) d GROUP BY d.subject_kind) k;
    IF v_products <> '{}'::jsonb THEN
      v_notice := jsonb_build_object('products', v_products,
                                     'product_count', (SELECT sum(x::int) FROM jsonb_each_text(v_products) t(k, x)),
                                     'notify_roles', jsonb_build_array('collection_manager', 'data_steward'),
                                     'steward', (SELECT c.contract #>> '{stewardship,steward}' FROM observation.source_contracts_current c
                                                  WHERE c.source_id = p_source AND c.contract_version = p_contract_version LIMIT 1),
                                     'statement', 'a case opened on a source that products rest on: they are not refreshed from this item until it is reviewed');
    END IF;
  END IF;

  INSERT INTO observation.intake_assessments (assessment_id, scope, tenant_id, domain_id, source_id, contract_version, run_id, item_key, content_digest,
    scanned_digest_verified, record_point, evd_object_id, evd_version, case_id, manifest_id, decision, decision_class, review_reason, engines_required,
    content_rules, duplicate_state, duplicate_of, quality_score, quality, manual_upload, uploader_principal_id, consumer_notice, recorded_by, correlation_id)
  VALUES (v_assessment, 'DOMAIN', p_tenant, p_domain, p_source, p_contract_version, p_run, v_item, v_digest,
    v_verified, v_kind, v_evd, v_ver, v_case, v_manifest, p_decision, p_decision_class, observation.intake_review_reason(p_decision_class),
    coalesce(p_assessment -> 'enginesRequired', '[]'::jsonb), coalesce(p_assessment -> 'contentRules', '{}'::jsonb), v_dup, v_dup_of, v_score,
    jsonb_build_object('completeness', v_completeness, 'parse_confidence', v_parse, 'duplication', v_dup_score,
                       'basis', coalesce(p_assessment #> '{quality,basis}', '[]'::jsonb), 'method', 'mean of completeness, parse confidence and duplication (B40 §IN v1)'),
    v_upload, CASE WHEN v_upload THEN v_uploader END, v_notice, v_actor, p_correlation);

  -- THE CUSTODY ENTRY: the bytes the engines scanned, verified against the stored digest (custody.inspected, §0's event)
  INSERT INTO observation.custody_events (event_id, scope, tenant_id, domain_id, manifest_id, obs_object_id, evd_object_id, source_id, contract_version,
    run_id, event, actor, agent_principal_id, content_digest, digest_verified, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, v_manifest, v_evd_obs, v_evd, p_source, p_contract_version, p_run, 'custody.inspected',
    'principal:' || v_actor::text, v_actor, v_digest, v_verified,
    jsonb_build_object('record_point', v_kind, 'case_id', v_case, 'decision', p_decision, 'decision_class', p_decision_class,
                       'engines', (SELECT jsonb_agg(jsonb_build_object('engine', x ->> 'engine', 'engine_version', x ->> 'engineVersion', 'outcome', x ->> 'outcome'))
                                     FROM jsonb_array_elements(p_verdicts) x),
                       'assessment_id', v_assessment),
    p_correlation);

  -- THE HELD UPLOAD (SP-22): the pending approval a second person decides
  IF v_kind = 'quarantined' AND (p_assessment #>> '{hold,kind}') = 'upload_approval' THEN
    IF NOT v_upload OR v_uploader IS NULL THEN
      RAISE EXCEPTION 'inspection verdict rejected (state): an upload held for approval names its uploader (the run is not an operator upload)' USING ERRCODE = '23514';
    END IF;
    v_approval := gen_random_uuid();
    INSERT INTO observation.upload_approvals (approval_id, scope, tenant_id, domain_id, source_id, contract_version, case_id, manifest_id, item_key,
      content_digest, byte_length, media_type, requester_principal_id, purpose, rule, held_because, state, correlation_id)
    VALUES (v_approval, 'DOMAIN', p_tenant, p_domain, p_source, p_contract_version, v_case, v_manifest, v_item, v_digest,
      coalesce(v_q.byte_length, 0), coalesce(v_q.declared_type, v_q.sniffed_type), v_uploader,
      left(coalesce(nullif(btrim(p_assessment #>> '{hold,purpose}'), ''), 'observation'), 200),
      coalesce(p_assessment #> '{hold,rule}', '{}'::jsonb), left(coalesce(p_assessment #>> '{hold,because}', 'outside the contract''s auto-admit rule'), 500),
      'pending', p_correlation);
    INSERT INTO observation.upload_approval_events (event_id, scope, tenant_id, domain_id, approval_id, event, actor, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, v_approval, 'upload.held', v_actor,
            jsonb_build_object('case_id', v_case, 'requester', v_uploader, 'because', p_assessment #>> '{hold,because}'), p_correlation);
  END IF;

  RETURN jsonb_build_object('verdicts', v_count, 'assessment_id', v_assessment, 'duplicate_state', v_dup, 'quality_score', v_score,
                            'approval_id', v_approval, 'consumer_notice', v_notice IS NOT NULL);
END $$;
REVOKE ALL ON FUNCTION observation.record_inspection(uuid, uuid, uuid, int, uuid, jsonb, text, text, jsonb, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.record_inspection(uuid, uuid, uuid, int, uuid, jsonb, text, text, jsonb, jsonb, uuid) TO eye_commit;

-- §IN.3 THE APPROVAL ACT ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* A SECOND PERSON decides a held upload: a named active human holding collection_manager (or domain_admin) here, never the uploader (the
   requester), never an agent (governance.assert_approver: the class form, 403). Approve → the case may be released by the quarantine review;
   decline → the case may be rejected (the route does both, each through its own governed write). Pending only (409 state). */
CREATE OR REPLACE FUNCTION observation.decide_upload(
  p_approval_id uuid, p_tenant uuid, p_domain uuid, p_decision text, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid := public.eye_principal(); a observation.upload_approvals%ROWTYPE; v_state text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.upload.approve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF v_actor IS NULL OR p_actor IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'upload approval rejected (actor): the decision is recorded under the acting principal, never on behalf of another' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO a FROM observation.upload_approvals u WHERE u.approval_id = p_approval_id AND u.tenant_id = p_tenant AND u.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'upload approval rejected (unknown_approval): no held upload % in this domain', coalesce(p_approval_id::text, '<none>') USING ERRCODE = '23503';
  END IF;
  PERFORM governance.assert_approver('upload approval', v_actor, p_tenant, p_domain, ARRAY['collection_manager', 'domain_admin'], a.requester_principal_id, NULL,
                                     'deciding an operator upload held outside the contract''s auto-admit rule');
  IF p_decision IS NULL OR p_decision NOT IN ('approve', 'decline') THEN
    RAISE EXCEPTION 'upload approval rejected (decision): the decision is approve | decline' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN
    RAISE EXCEPTION 'upload approval rejected (reason): a decision carries a reason of at least 8 characters' USING ERRCODE = '22023';
  END IF;
  IF a.state <> 'pending' THEN
    RAISE EXCEPTION 'upload approval rejected (state): the upload is already %', a.state USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM observation.quarantine_current q WHERE q.case_id = a.case_id AND q.state = 'open') THEN
    RAISE EXCEPTION 'upload approval rejected (state): the held upload''s quarantine case is no longer open' USING ERRCODE = '23514';
  END IF;
  v_state := CASE p_decision WHEN 'approve' THEN 'approved' ELSE 'declined' END;
  UPDATE observation.upload_approvals SET state = v_state, decided_by = v_actor, decided_at = clock_timestamp(), decision_reason = btrim(p_reason)
   WHERE approval_id = a.approval_id;
  INSERT INTO observation.upload_approval_events (event_id, scope, tenant_id, domain_id, approval_id, event, actor, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, a.approval_id, 'upload.' || v_state, v_actor,
          jsonb_build_object('case_id', a.case_id, 'requester', a.requester_principal_id, 'reason', btrim(p_reason)), p_correlation);
  RETURN jsonb_build_object('approval_id', a.approval_id, 'case_id', a.case_id, 'state', v_state, 'decided_by', v_actor, 'requester', a.requester_principal_id);
END $$;
REVOKE ALL ON FUNCTION observation.decide_upload(uuid, uuid, uuid, text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.decide_upload(uuid, uuid, uuid, text, text, uuid, uuid, uuid) TO eye_commit;

-- §IN.4 observation.close_quarantine_case — 0022:1403, its LAST definition (no later migration re-declares it), copied WHOLE: the signature,
-- SECURITY DEFINER, the search path and the grants unchanged; every existing refusal keeps its text. The additions are marked `-- B40 in`.
CREATE OR REPLACE FUNCTION observation.close_quarantine_case(
  p_case_id uuid, p_tenant uuid, p_domain uuid, p_outcome text, p_reason text,
  p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = observation, ctx, identity, public, pg_catalog, pg_temp AS $$
DECLARE v_row observation.quarantine_current%ROWTYPE; v_actor uuid := public.eye_principal(); v_has_role boolean;
        v_uploader uuid; v_approval observation.upload_approvals%ROWTYPE; v_held boolean := false;   -- B40 in
        v_auth observation.evidence_authenticity%ROWTYPE; v_rel record; v_rel_ver int; v_scheme text;                                       -- B40 integration
BEGIN
  IF p_outcome = 'expired' THEN
    PERFORM observation.assert_authority(ARRAY['observation.sweeper.reconcile']);
  ELSE
    PERFORM observation.assert_authority(ARRAY['observation.quarantine.review']);
  END IF;
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_outcome NOT IN ('admitted', 'rejected', 'expired') THEN
    RAISE EXCEPTION 'quarantine close rejected: unknown outcome %', p_outcome USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM observation.quarantine_current
   WHERE case_id = p_case_id AND tenant_id = p_tenant AND domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'quarantine close rejected: no such case' USING ERRCODE = '23503';
  END IF;
  IF v_row.state <> 'open' THEN
    RAISE EXCEPTION 'quarantine close rejected: case is already %', v_row.state USING ERRCODE = '23514';
  END IF;
  IF p_outcome <> 'expired' THEN
    IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN
      RAISE EXCEPTION 'quarantine close rejected: a release or rejection requires a recorded reason'
        USING ERRCODE = '23514';
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM identity.role_bindings b
       WHERE b.principal_id = v_actor AND b.revoked_at IS NULL
         AND b.role_code = 'collection_manager'
         AND b.tenant_id = p_tenant AND (b.domain_id = p_domain OR b.scope = 'TENANT')
    ) INTO v_has_role;
    IF NOT v_has_role THEN
      RAISE EXCEPTION 'quarantine close rejected: review requires the collection_manager role in this domain'
        USING ERRCODE = '42501';
    END IF;
    -- B40 in: the reviewer is a named human — an agent never releases or rejects a quarantined item
    IF onboarding.principal_kind(v_actor) IS DISTINCT FROM 'human' THEN                                                                      -- B40 in
      RAISE EXCEPTION 'quarantine review rejected (actor): releasing or rejecting a quarantined item is a named human''s act; an agent or a system never reviews'  -- B40 in
        USING ERRCODE = '42501';                                                                                                            -- B40 in
    END IF;                                                                                                                                 -- B40 in
    -- B40 in (DESIGN D9b): a MANUAL UPLOAD is never reviewed by the operator who uploaded it; a collected item keeps the rule above
    v_uploader := observation.in_uploader_of_run(v_row.run_id);                                                                             -- B40 in
    IF v_uploader IS NOT NULL AND v_uploader = v_actor THEN                                                                                 -- B40 in
      RAISE EXCEPTION 'quarantine review rejected (separation_of_duties): the operator who uploaded this item never reviews its quarantine case; a second person releases or rejects it (D9b)'  -- B40 in
        USING ERRCODE = '42501';                                                                                                            -- B40 in
    END IF;                                                                                                                                 -- B40 in
  END IF;

  -- B40 in (SP-22): a held upload is RELEASED only once a second person approved it; a rejection or an expiry closes its approval too
  SELECT * INTO v_approval FROM observation.upload_approvals u WHERE u.case_id = p_case_id FOR UPDATE;                                       -- B40 in
  v_held := FOUND;                                                                                                                          -- B40 in
  IF v_held AND p_outcome = 'admitted' AND v_approval.state <> 'approved' THEN                                                              -- B40 in
    RAISE EXCEPTION 'quarantine review rejected (held): the upload awaits a second person''s approval (approval %, %); it is released only once approved', v_approval.approval_id, v_approval.state  -- B40 in
      USING ERRCODE = '23514';                                                                                                              -- B40 in
  END IF;                                                                                                                                   -- B40 in
  IF v_held AND v_approval.state = 'pending' AND p_outcome IN ('rejected', 'expired') THEN                                                  -- B40 in
    UPDATE observation.upload_approvals                                                                                                     -- B40 in
       SET state = CASE p_outcome WHEN 'rejected' THEN 'declined' ELSE 'expired' END, decided_at = clock_timestamp(),                       -- B40 in
           decided_by = CASE WHEN p_outcome = 'rejected' THEN v_actor END,                                                                   -- B40 in
           decision_reason = CASE WHEN p_outcome = 'rejected' THEN btrim(p_reason) END                                                       -- B40 in
     WHERE approval_id = v_approval.approval_id;                                                                                            -- B40 in
    INSERT INTO observation.upload_approval_events (event_id, scope, tenant_id, domain_id, approval_id, event, actor, details, correlation_id)  -- B40 in
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, v_approval.approval_id,                                                       -- B40 in
            CASE p_outcome WHEN 'rejected' THEN 'upload.declined' ELSE 'upload.expired' END,                                                -- B40 in
            coalesce(v_actor, v_approval.requester_principal_id),                                                                           -- B40 in
            jsonb_build_object('case_id', p_case_id, 'by', CASE WHEN p_outcome = 'expired' THEN 'sweeper' ELSE 'quarantine review' END, 'reason', p_reason),  -- B40 in
            p_correlation);                                                                                                                 -- B40 in
  END IF;                                                                                                                                   -- B40 in

  UPDATE observation.quarantine_current
     SET state = p_outcome, closed_at = clock_timestamp(),
         review_actor = CASE WHEN p_outcome = 'expired' THEN 'sweeper'
                             ELSE 'principal:' || v_actor::text END,
         review_reason = p_reason
   WHERE case_id = p_case_id;

  INSERT INTO observation.quarantine_events (
    event_id, scope, tenant_id, domain_id, case_id, event, actor, verdict, reason_class, details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_case_id,
    CASE p_outcome WHEN 'admitted' THEN 'case.admitted'
                   WHEN 'rejected' THEN 'case.rejected'
                   ELSE 'case.expired' END,
    CASE WHEN p_outcome = 'expired' THEN 'sweeper' ELSE 'principal:' || v_actor::text END,
    p_outcome, v_row.reason_class,
    jsonb_build_object('reason', p_reason, 'opened_by_run', v_row.run_id)
      || CASE WHEN v_uploader IS NOT NULL THEN jsonb_build_object('uploaded_by', v_uploader, 'reviewer_is_not_uploader', true) ELSE '{}'::jsonb END   -- B40 in
      || CASE WHEN v_held THEN jsonb_build_object('upload_approval', v_approval.approval_id) ELSE '{}'::jsonb END,                                    -- B40 in
    p_correlation);

  -- B40 integration (§AC's finding): a REJECTED or EXPIRED case's custody chain ends in its own entry (it stopped at custody.inspected): the
  -- quarantined bytes' digest, the case, the outcome and the reason — never the content. A release ends in the admission's custody.admitted.
  IF p_outcome IN ('rejected', 'expired') THEN                                                                                               -- B40 integration
    PERFORM observation.append_custody(gen_random_uuid(), p_tenant, p_domain, v_row.manifest_id, NULL::uuid, NULL::uuid, v_row.source_id,  -- B40 integration
      v_row.contract_version, v_row.run_id, 'custody.quarantine_closed',                                                                     -- B40 integration
      'principal:' || coalesce(v_actor::text, 'unknown'), NULL::uuid, NULL, NULL,                                                          -- B40 integration (the reviewer, or the sweeper's principal on expiry)
      'quarantine.close', '1.0.0', 'quarantine-close@1.0.0', v_row.content_digest, NULL::boolean,                                            -- B40 integration
      jsonb_build_object('case_id', p_case_id, 'outcome', p_outcome, 'reason_class', v_row.reason_class, 'reason', p_reason), p_correlation);  -- B40 integration
  END IF;                                                                                                                                    -- B40 integration

  -- B40 integration (§VA × §IN, DESIGN D6): releasing an UNKNOWN-SIGNER case records the authenticity of the EVD version the release admitted
  -- (the release's custody.admitted, written before this close in the same transaction) as `unavailable` — the signer was never established,
  -- the content is not verified — never silently none; the case's own row (unknown_signer) is kept. A release that admitted nothing refuses.
  IF p_outcome = 'admitted' THEN                                                                                                            -- B40 integration
    SELECT * INTO v_auth FROM observation.evidence_authenticity x WHERE x.case_id = p_case_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;  -- B40 integration
    IF v_row.reason_class = 'unknown_signer' OR v_auth.outcome = 'unknown_signer' THEN                                                      -- B40 integration
      SELECT c.evd_object_id, c.manifest_id, c.content_digest INTO v_rel FROM observation.custody_events c                                  -- B40 integration
       WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.event = 'custody.admitted' AND c.details ->> 'released_from_case' = p_case_id::text  -- B40 integration
       ORDER BY c.occurred_at DESC LIMIT 1;                                                                                                 -- B40 integration
      IF v_rel.evd_object_id IS NULL THEN                                                                                                   -- B40 integration
        RAISE EXCEPTION 'quarantine review rejected (state): the release of unknown-signer case % admitted no evidence version — its authenticity cannot be recorded', p_case_id  -- B40 integration
          USING ERRCODE = '23514';                                                                                                          -- B40 integration
      END IF;                                                                                                                               -- B40 integration
      SELECT max(o.object_version)::int INTO v_rel_ver FROM objects.canonical_objects o                                                     -- B40 integration
       WHERE o.object_type = 'EVD' AND o.object_id = v_rel.evd_object_id AND o.tenant_id = p_tenant AND o.domain_id = p_domain;             -- B40 integration
      SELECT coalesce(v_auth.scheme, NULLIF(s.contract #>> '{authenticity,scheme}', 'none'), 'ed25519_detached') INTO v_scheme             -- B40 integration
        FROM observation.source_contracts_current s WHERE s.source_id = v_row.source_id AND s.contract_version = v_row.contract_version;    -- B40 integration
      INSERT INTO observation.evidence_authenticity (record_id, scope, tenant_id, domain_id, source_id, contract_version, run_id, evd_object_id, evd_version,  -- B40 integration
                                                     manifest_id, content_digest, item_key, outcome, scheme, signature, signature_digest, detail, recorded_by, correlation_id)  -- B40 integration
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, v_row.source_id, v_row.contract_version, v_row.run_id, v_rel.evd_object_id, coalesce(v_rel_ver, 1),  -- B40 integration
              v_rel.manifest_id, v_rel.content_digest, v_row.item_key, 'unavailable', coalesce(v_scheme, 'ed25519_detached'), v_auth.signature, v_auth.signature_digest,  -- B40 integration
              jsonb_build_object('statement', 'released by a person from an unknown-signer quarantine case — the signer was never established: content authenticity NOT verified',  -- B40 integration
                                 'released_from_case', p_case_id, 'case_outcome', coalesce(v_auth.outcome, 'unknown_signer'), 'release_reason', p_reason),  -- B40 integration
              v_actor, p_correlation);                                                                                                      -- B40 integration
      PERFORM observation.append_custody(gen_random_uuid(), p_tenant, p_domain, v_rel.manifest_id, NULL::uuid, v_rel.evd_object_id, v_row.source_id,  -- B40 integration
        v_row.contract_version, v_row.run_id, 'custody.authenticity_recorded', 'principal:' || v_actor::text, NULL::uuid, NULL, NULL,       -- B40 integration
        'quarantine.release', '1.0.0', 'quarantine-release@1.0.0', v_rel.content_digest, NULL::boolean,                                     -- B40 integration
        jsonb_build_object('outcome', 'unavailable', 'scheme', coalesce(v_scheme, 'ed25519_detached'), 'case_id', p_case_id, 'evd_version', coalesce(v_rel_ver, 1),  -- B40 integration
                           'signature_digest', v_auth.signature_digest), p_correlation);                                                    -- B40 integration
    END IF;                                                                                                                                 -- B40 integration
  END IF;                                                                                                                                   -- B40 integration
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.close_quarantine_case(uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.close_quarantine_case(uuid,uuid,uuid,text,text,uuid,uuid) TO eye_commit;

-- §IN.5 THE READS (metadata only — D9; guarded by the caller's bound tenant and domain) ──────────────────────────────────────────────────────
/* One verdict row as the readers see it (identity, outcome, findings without content). */
CREATE OR REPLACE FUNCTION observation.iv_json(v observation.inspection_verdicts) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = observation, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('verdict_id', v.verdict_id, 'engine', v.engine, 'engine_version', v.engine_version, 'image_digest', v.image_digest,
    'rule_set_digest', v.rule_set_digest, 'signature_databases', v.signature_databases, 'engine_config', v.engine_config, 'outcome', v.outcome,
    'findings', v.findings, 'detail', v.detail, 'started_at', v.started_at, 'finished_at', v.finished_at, 'decision', v.decision,
    'decision_class', v.decision_class, 'record_point', v.record_point, 'evd_object_id', v.evd_object_id, 'evd_version', v.evd_version,
    'case_id', v.case_id, 'recorded_at', v.recorded_at)
$$;
REVOKE ALL ON FUNCTION observation.iv_json(observation.inspection_verdicts) FROM PUBLIC;

CREATE OR REPLACE FUNCTION observation.ia_json(a observation.intake_assessments) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = observation, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN a.assessment_id IS NULL THEN NULL ELSE jsonb_build_object('assessment_id', a.assessment_id, 'decision', a.decision,
    'decision_class', a.decision_class, 'review_reason', a.review_reason, 'engines_required', a.engines_required, 'content_rules', a.content_rules,
    'duplicate_state', a.duplicate_state, 'duplicate_of', a.duplicate_of, 'quality_score', a.quality_score, 'quality', a.quality,
    'manual_upload', a.manual_upload, 'uploader', a.uploader_principal_id, 'consumer_notice', a.consumer_notice,
    'scanned_digest_verified', a.scanned_digest_verified, 'recorded_at', a.recorded_at) END
$$;
REVOKE ALL ON FUNCTION observation.ia_json(observation.intake_assessments) FROM PUBLIC;

CREATE OR REPLACE FUNCTION observation.ua_json(u observation.upload_approvals) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = observation, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN u.approval_id IS NULL THEN NULL ELSE jsonb_build_object('approval_id', u.approval_id, 'state', u.state, 'requester', u.requester_principal_id,
    'purpose', u.purpose, 'rule', u.rule, 'held_because', u.held_because, 'requested_at', u.requested_at, 'decided_by', u.decided_by,
    'decided_at', u.decided_at, 'decision_reason', u.decision_reason, 'media_type', u.media_type, 'byte_length', u.byte_length) END
$$;
REVOKE ALL ON FUNCTION observation.ua_json(observation.upload_approvals) FROM PUBLIC;

/* THE INTAKE REVIEW QUEUE (PR-16-001/-002, CAP-OB-11): the domain's cases (open by default; `all` for every state), newest first, each with its
   reason (class and review reason), the verdicts in brief, the duplicate state and quality (or "not recorded before B40"), the manual-upload
   facts (`you_uploaded`: the caller is the uploader — the review is a second person's), the held upload, the consumer notice, and the expiry
   (`past_expiry`: an open case past its expiry the sweeper has not expired — D16, shown, never touched). */
CREATE OR REPLACE FUNCTION observation.intake_review_queue(p_tenant uuid, p_domain uuid, p_state text, p_limit int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
DECLARE v_caller uuid := public.eye_principal(); v_now timestamptz := clock_timestamp(); v_cases jsonb; v_counts jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.inspection.read']);
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the intake review queue');
  IF p_state IS NOT NULL AND p_state NOT IN ('open', 'admitted', 'rejected', 'expired', 'all') THEN
    RAISE EXCEPTION 'intake review rejected (state): the queue lists open | admitted | rejected | expired | all cases' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(jsonb_agg(x.j ORDER BY x.opened_at DESC, x.case_id), '[]'::jsonb) INTO v_cases FROM (
    SELECT q.opened_at, q.case_id, jsonb_build_object(
      'case_id', q.case_id, 'source_id', q.source_id, 'source_key', c.source_key, 'source_name', c.contract ->> 'name', 'contract_version', q.contract_version,
      'schema_ref', CASE WHEN c.contract ? 'content_policy' THEN 'SRC@v4' ELSE 'SRC@v1–v3' END,
      'connector_kind', c.connector_kind, 'item_key', q.item_key, 'state', q.state, 'opened_at', q.opened_at, 'expires_at', q.expires_at, 'closed_at', q.closed_at,
      'past_expiry', q.state = 'open' AND q.expires_at < v_now,
      'expiry_statement', CASE WHEN q.state = 'open' AND q.expires_at < v_now THEN 'past expiry ' || to_char(q.expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') || ' — not expired by the sweeper'
                               WHEN q.state = 'open' THEN 'expires ' || to_char(q.expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') ELSE NULL END,
      'reason_class', q.reason_class, 'reason', q.reason, 'review_reason', observation.intake_review_reason(q.reason_class),
      'declared_type', q.declared_type, 'sniffed_type', q.sniffed_type, 'byte_length', q.byte_length, 'content_digest', q.content_digest,
      'review_actor', q.review_actor, 'review_reason_text', q.review_reason,
      'verdicts', (SELECT coalesce(jsonb_agg(jsonb_build_object('engine', v.engine, 'engine_version', v.engine_version, 'outcome', v.outcome,
                                                                 'finding_codes', (SELECT coalesce(jsonb_agg(DISTINCT f ->> 'code'), '[]'::jsonb) FROM jsonb_array_elements(v.findings) f))
                                             ORDER BY v.engine), '[]'::jsonb)
                     FROM observation.inspection_verdicts v WHERE v.case_id = q.case_id),
      'assessment', observation.ia_json(a),
      'recorded', a.assessment_id IS NOT NULL,
      'not_recorded_statement', CASE WHEN a.assessment_id IS NULL THEN 'inspection, duplicate state and quality not recorded before B40 (or for a v1–v3 contract)' END,
      'manual_upload', coalesce(a.manual_upload, observation.in_uploader_of_run(q.run_id) IS NOT NULL),
      'uploader', coalesce(a.uploader_principal_id, observation.in_uploader_of_run(q.run_id)),
      'you_uploaded', v_caller IS NOT NULL AND coalesce(a.uploader_principal_id, observation.in_uploader_of_run(q.run_id)) = v_caller,
      'upload_approval', observation.ua_json(u)) AS j
      FROM observation.quarantine_current q
      LEFT JOIN observation.source_contracts_current c ON c.source_id = q.source_id AND c.contract_version = q.contract_version
      LEFT JOIN observation.intake_assessments a ON a.case_id = q.case_id
      LEFT JOIN observation.upload_approvals u ON u.case_id = q.case_id
     WHERE q.tenant_id = p_tenant AND q.domain_id = p_domain AND (coalesce(p_state, 'open') = 'all' OR q.state = coalesce(p_state, 'open'))
     ORDER BY q.opened_at DESC, q.case_id LIMIT least(greatest(coalesce(p_limit, 100), 1), 500)) x;
  SELECT jsonb_build_object(
    'open', count(*) FILTER (WHERE q.state = 'open'),
    'past_expiry', count(*) FILTER (WHERE q.state = 'open' AND q.expires_at < v_now),
    'held_uploads', (SELECT count(*) FROM observation.upload_approvals u WHERE u.tenant_id = p_tenant AND u.domain_id = p_domain AND u.state = 'pending'),
    'by_review_reason', (SELECT coalesce(jsonb_object_agg(r, n), '{}'::jsonb) FROM (SELECT coalesce(observation.intake_review_reason(q2.reason_class), 'unclassified') r, count(*) n
                            FROM observation.quarantine_current q2 WHERE q2.tenant_id = p_tenant AND q2.domain_id = p_domain AND q2.state = 'open' GROUP BY 1) t))
    INTO v_counts FROM observation.quarantine_current q WHERE q.tenant_id = p_tenant AND q.domain_id = p_domain;
  RETURN jsonb_build_object('cases', v_cases, 'counts', v_counts, 'as_of', v_now, 'state', coalesce(p_state, 'open'));
END $$;
REVOKE ALL ON FUNCTION observation.intake_review_queue(uuid, uuid, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.intake_review_queue(uuid, uuid, text, int) TO eye_app, eye_commit;

/* THE CASE'S WHY: the case, its verdicts with their engine identity and findings (codes, offsets — never content), the assessment, the held
   upload and its events, the case's events, and the custody of its manifest. The excerpt of the bytes is NOT here (D9: it is a read of the
   bytes, under observation.evidence.retrieve — the route's own decision). */
CREATE OR REPLACE FUNCTION observation.intake_case_read(p_tenant uuid, p_domain uuid, p_case uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
DECLARE v_caller uuid := public.eye_principal(); q observation.quarantine_current%ROWTYPE; a observation.intake_assessments%ROWTYPE;
        u observation.upload_approvals%ROWTYPE; v_uploader uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.inspection.read']);
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'an intake case');
  SELECT * INTO q FROM observation.quarantine_current x WHERE x.case_id = p_case AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'intake review rejected (unknown_case): no quarantine case % in this domain', coalesce(p_case::text, '<none>') USING ERRCODE = '23503';
  END IF;
  SELECT * INTO a FROM observation.intake_assessments x WHERE x.case_id = p_case;
  SELECT * INTO u FROM observation.upload_approvals x WHERE x.case_id = p_case;
  v_uploader := coalesce(a.uploader_principal_id, observation.in_uploader_of_run(q.run_id));
  RETURN jsonb_build_object(
    'case', jsonb_build_object('case_id', q.case_id, 'source_id', q.source_id, 'contract_version', q.contract_version, 'run_id', q.run_id,
      'manifest_id', q.manifest_id, 'item_key', q.item_key, 'state', q.state, 'opened_at', q.opened_at, 'expires_at', q.expires_at, 'closed_at', q.closed_at,
      'past_expiry', q.state = 'open' AND q.expires_at < clock_timestamp(),
      'reason_class', q.reason_class, 'reason', q.reason, 'review_reason', observation.intake_review_reason(q.reason_class),
      'declared_type', q.declared_type, 'sniffed_type', q.sniffed_type, 'byte_length', q.byte_length, 'content_digest', q.content_digest,
      'review_actor', q.review_actor, 'review_reason_text', q.review_reason),
    'source', (SELECT jsonb_build_object('source_key', c.source_key, 'name', c.contract ->> 'name', 'connector_kind', c.connector_kind,
                                          'schema_ref', CASE WHEN c.contract ? 'content_policy' THEN 'SRC@v4' ELSE 'SRC@v1–v3' END,
                                          'content_policy', c.contract -> 'content_policy')
                 FROM observation.source_contracts_current c WHERE c.source_id = q.source_id AND c.contract_version = q.contract_version),
    'verdicts', (SELECT coalesce(jsonb_agg(observation.iv_json(v) ORDER BY v.engine, v.recorded_at), '[]'::jsonb) FROM observation.inspection_verdicts v WHERE v.case_id = p_case),
    'assessment', observation.ia_json(a),
    'not_recorded_statement', CASE WHEN a.assessment_id IS NULL THEN 'inspection verdicts, duplicate state and quality not recorded before B40 (or for a v1–v3 contract)' END,
    'manual_upload', v_uploader IS NOT NULL, 'uploader', v_uploader, 'you_uploaded', v_caller IS NOT NULL AND v_uploader = v_caller,
    'upload_approval', observation.ua_json(u),
    'upload_approval_events', (SELECT coalesce(jsonb_agg(jsonb_build_object('event', e.event, 'actor', e.actor, 'details', e.details, 'occurred_at', e.occurred_at) ORDER BY e.occurred_at), '[]'::jsonb)
                                 FROM observation.upload_approval_events e WHERE e.approval_id = u.approval_id),
    'events', (SELECT coalesce(jsonb_agg(jsonb_build_object('event', e.event, 'actor', e.actor, 'verdict', e.verdict, 'reason_class', e.reason_class, 'occurred_at', e.occurred_at,
                                                           'details', e.details) ORDER BY e.occurred_at), '[]'::jsonb)
                 FROM observation.quarantine_events e WHERE e.case_id = p_case),
    'custody', (SELECT coalesce(jsonb_agg(jsonb_build_object('event', c.event, 'actor', c.actor, 'occurred_at', c.occurred_at, 'content_digest', c.content_digest,
                                                            'digest_verified', c.digest_verified) ORDER BY c.occurred_at), '[]'::jsonb)
                  FROM observation.custody_events c WHERE c.manifest_id = q.manifest_id));
END $$;
REVOKE ALL ON FUNCTION observation.intake_case_read(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.intake_case_read(uuid, uuid, uuid) TO eye_app, eye_commit;

/* AN EVIDENCE VERSION'S VERDICTS (the evidence page's list — mounted by the integrator): the engines that passed it, with their identity; an
   earlier version reads "not recorded before B40". */
CREATE OR REPLACE FUNCTION observation.inspection_verdicts_read(p_tenant uuid, p_domain uuid, p_evd uuid, p_version int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
DECLARE a observation.intake_assessments%ROWTYPE; v_list jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.inspection.read']);
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the inspection verdicts of an evidence version');
  SELECT coalesce(jsonb_agg(observation.iv_json(v) ORDER BY v.engine, v.recorded_at), '[]'::jsonb) INTO v_list
    FROM observation.inspection_verdicts v
   WHERE v.tenant_id = p_tenant AND v.domain_id = p_domain AND v.evd_object_id = p_evd AND (p_version IS NULL OR v.evd_version = p_version);
  SELECT * INTO a FROM observation.intake_assessments x
   WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.evd_object_id = p_evd AND (p_version IS NULL OR x.evd_version = p_version)
   ORDER BY x.evd_version DESC LIMIT 1;
  RETURN jsonb_build_object('evd_object_id', p_evd, 'evd_version', p_version, 'verdicts', v_list, 'assessment', observation.ia_json(a),
    'statement', CASE WHEN jsonb_array_length(v_list) = 0 THEN 'no inspection verdict recorded: not recorded before B40, or the contract is v1–v3 (its recorded rule)' END);
END $$;
REVOKE ALL ON FUNCTION observation.inspection_verdicts_read(uuid, uuid, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.inspection_verdicts_read(uuid, uuid, uuid, int) TO eye_app, eye_commit;


-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §AP — acquisition-time policy: rate, backoff, robots, licence, residency, window (F-P1-04)
-- FOLDED by the integrator from 0123_b40_x_ap.sql (b40/ap), verbatim below unless a line is marked `-- B40 integration`.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0123 §AP — CP-6 B40: ACQUISITION-TIME POLICY (F-P1-04: L1-I02, V03-T-072, V03-T-073, V03-T-266, ES-31-007, V04-T-019, DP-10-005).
-- Applies ALONE on 0001–0122 + 0123 §0 (folded into 0123 by the integrator after §RG, §VA, §IN, in the order §0, §RG, §VA, §IN, §AP, §CR).
--
-- WHAT AN SRC@v4 CONTRACT'S `acquisition_policy` NOW DOES, from current database state, before and during egress:
--   §AP.1 THE RESIDENCY DECLARATION of the local/dev profile — observation.ap_residency_regions(profile): the regions a deployment profile
--         admits at ingress. ONE profile is declared ('local-dev' admits EU — the jurisdiction every eye_demo contract declares); a profile
--         this function does not know admits NOTHING (a conflict, never a silent pass). The PLATFORM-wide residency / sovereignty policy is
--         B62's (F-P7D-06), not this row's.
--   §AP.2 THE ACQUISITION AUTHORIZATION — observation.acquisition_authorizations: one per run of an SRC@v4 contract, the record the run cites
--         (V03-T-266, 30.1): the contract version, the purpose, the rights in force (the contract's AND the rights terms' — D4's two sources),
--         the licence verdict (purposes ∈ the terms' purposes, prohibited uses, expiry), the credential REFERENCE (never a value — B11), the
--         rate, the residency verdict (contract vs the domain's profile), the collection window, the robots verdict per endpoint, the
--         backoff hold in force; the decision (proceed | refuse) and the refusal class (rights | licence | residency_refused | window_closed |
--         robots_disallowed | policy | unavailable). Append-only; one per run (UNIQUE run_id). A v1–v3 contract records none (D8: "not
--         recorded before SRC@v4").
--   §AP.3 THE ROBOTS CACHE — observation.acquisition_robots: robots.txt fetched through the SAME vetted client (or the replay set's recorded
--         answer), PER CONTRACT VERSION and origin, its parsed groups kept (never the raw text beyond its digest and length); an `unavailable`
--         fetch is recorded and never used as a cache entry (the next run fetches again). RFC 9309: a 4xx answer is "no robots file" (allowed),
--         a 5xx or a transport failure is unreachable — the run is refused `unavailable` (fail closed).
--   §AP.4 THE RATE-LIMITED INTERVALS AND THE CONTRACT'S BACKOFF — observation.acquisition_rate_limits: every rate-limited attempt — the
--         publisher's 429 (with its Retry-After: honoured, absent or unparsed), the contract's own bucket exhausted beyond the in-run wait, or
--         the source unavailable (a transport failure / an execution fault of a v4 contract, recorded by the scheduler) — with the attempt
--         number (consecutive since the source's last FINISHED run), the contract schedule's delay, the delay applied (never sooner than the
--         publisher asked, never longer than the contract's bound), the HOLD [interval_from, interval_to) during which collection of the
--         source is refused before egress, and whether an automatic retry is planned (the contract's max_attempts) — the coverage gap made
--         explicit instead of silent (DP-10-005). Append-only; RESOLVED is derived at read time (a later finished run of the source), so no
--         row is ever rewritten.
--   §AP.5 THE RESPONSE FINGERPRINTS — observation.acquisition_response_fingerprints: per poll key, the media type, the root shape and the size
--         of each response that passed §AP's ingress check (never content — D9); a response whose identity or shape departs from the last one
--         is an ANOMALY (`response_anomaly`, DP-10-005's manipulation / duplicate detection) and is quarantined by the ingress composition.
--   §AP.6 THE PORTS. The run's own machinery writes these records — the authorize and throttle stages inside a run, the collection worker
--         after one — under the BOUNDED MACHINE CAPABILITY the scheduler already holds (observation.issue_schedule_capability, mode schedule,
--         class scheduler — the 0038/0039 idiom the B1/B6/B7 consumers reuse), every in-run write FENCED BY THE RUN'S LEASE
--         (observation.assert_run_holds_source, 0056): only the run that holds the source may record its authorization, its robots fetch, its
--         rate limit or a fingerprint. No human act is added (§AP has no consequential command); the attribution of a run's record is the run's
--         own agent principal (collection_runs_current), never a client-supplied one.
--   §AP.7 THE READ — observation.acquisition_policy_read(tenant, domain, source): the declaration per contract version (or "not declared before
--         SRC@v4"), the authorizations, the robots cache, the rate-limited intervals with their derived resolution, the stream form's explicit
--         incomplete ranges of the source (every class; rate_limited among them) — the acquisition page and the coverage panel. Bound to the
--         exact action observation.acquisition.read (pdp.service.ts, /* B40 ap */) and the caller's read scope. METADATA ONLY (D9): no evidence
--         content, no credential value, no robots text.
--
-- NOT HERE (stated): no CHECK widened (the incomplete-range classes and the quarantine classes are §0's); no role (D14); no header field (D11);
-- no change to the command form's or the stream form's ports (a stream run's rate-limited segment is declared through 0084's own
-- declare path with §0's widened class); the lifecycle's call sites are the prelude's.
-- THREE CLAIMS: CONSTRUCTION (this file, the stages and phase6-acquisition-policy-b40); DEMONSTRATED OPERATION (the act, SYNTHETIC — the
-- port-authority replay set with its planted 429 + Retry-After, DESIGN D10); REAL ACCEPTANCE — never claimed (a synthetic or loopback
-- publisher demonstrates the software, never a real publisher's throttling).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §AP.1 THE RESIDENCY DECLARATION ─────────────────────────────────────────────────────────────────────────────────────────────────────────
/* The regions a deployment residency profile admits at ingress. Declared, not inferred: an unknown profile admits nothing. */
CREATE OR REPLACE FUNCTION observation.ap_residency_regions(p_profile text) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE p_profile
           -- the local/dev profile (every tenant and domain of the demonstration): EU-resident data only — the jurisdiction every
           -- registered contract declares. B62 (F-P7D-06) owns the platform-wide residency and sovereignty policy.
           WHEN 'local-dev' THEN ARRAY['EU']::text[]
           ELSE NULL END
$$;
REVOKE ALL ON FUNCTION observation.ap_residency_regions(text) FROM PUBLIC;
COMMENT ON FUNCTION observation.ap_residency_regions(text) IS 'B40 §AP (V03-T-072): the regions a deployment residency profile admits at ingress — local-dev admits EU; an undeclared profile admits nothing (NULL). Internal (no runtime grant).';

-- §AP.2 THE ACQUISITION AUTHORIZATIONS ────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE observation.acquisition_authorizations (
  authorization_id    uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  source_id           uuid NOT NULL,
  contract_version    int  NOT NULL CHECK (contract_version >= 1),
  run_id              uuid NOT NULL UNIQUE,
  form                text NOT NULL CHECK (form IN ('command', 'stream')),
  purpose_id          text NOT NULL CHECK (length(purpose_id) BETWEEN 1 AND 200),
  decision            text NOT NULL CHECK (decision IN ('proceed', 'refuse')),
  refusal_class       text CHECK (refusal_class IS NULL OR refusal_class IN (
                        'rights', 'licence', 'residency_refused', 'window_closed', 'robots_disallowed', 'policy', 'unavailable')),
  reason              text NOT NULL CHECK (length(reason) BETWEEN 1 AND 1000),
  rights              jsonb NOT NULL CHECK (jsonb_typeof(rights) = 'object'),
  licence             jsonb NOT NULL CHECK (jsonb_typeof(licence) = 'object'),
  -- B11: the credential REFERENCE the contract names (or NULL: none) — never a value
  credential_ref      text CHECK (credential_ref IS NULL OR length(credential_ref) BETWEEN 1 AND 200),
  rate                jsonb NOT NULL CHECK (jsonb_typeof(rate) = 'object'),
  residency           jsonb NOT NULL CHECK (jsonb_typeof(residency) = 'object'),
  collection_window   jsonb NOT NULL CHECK (jsonb_typeof(collection_window) = 'object'),
  robots              jsonb NOT NULL CHECK (jsonb_typeof(robots) = 'object'),
  backoff             jsonb NOT NULL CHECK (jsonb_typeof(backoff) = 'object'),
  -- the run's own agent principal (collection_runs_current), never a client-supplied actor
  agent_principal_id  uuid NOT NULL,
  decided_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT aqa_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT aqa_refusal CHECK ((decision = 'refuse') = (refusal_class IS NOT NULL))
);
CREATE INDEX aqa_source ON observation.acquisition_authorizations (tenant_id, domain_id, source_id, decided_at DESC);
CREATE TRIGGER aqa_append_only BEFORE UPDATE OR DELETE ON observation.acquisition_authorizations FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE observation.acquisition_authorizations IS 'B40 §AP (V03-T-266 30.1, L1-I02, ES-31-007): the acquisition authorization of one run of an SRC@v4 contract — contract version, purpose, rights (contract + terms), licence, credential reference, rate, residency, window, robots, backoff hold — and its decision; the record the run cites. Append-only, one per run.';

-- §AP.3 THE ROBOTS CACHE ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE observation.acquisition_robots (
  robots_id           uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  source_id           uuid NOT NULL,
  contract_version    int  NOT NULL CHECK (contract_version >= 1),
  -- scheme://host[:port] — robots.txt is per origin
  origin              text NOT NULL CHECK (origin ~ '^https?://[^/?#]+$' AND length(origin) <= 300),
  outcome             text NOT NULL CHECK (outcome IN ('fetched', 'no_robots_file', 'unavailable')),
  http_status         int CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  content_digest      text CHECK (content_digest IS NULL OR content_digest ~ '^[0-9a-f]{64}$'),
  byte_length         int CHECK (byte_length IS NULL OR byte_length >= 0),
  -- the parsed groups: [{ agents: [..], rules: [{ allow, path }] }] — never the raw text
  rules               jsonb NOT NULL CHECK (jsonb_typeof(rules) = 'array'),
  via                 text NOT NULL CHECK (via IN ('replay', 'live')),
  detail              text NOT NULL CHECK (length(detail) BETWEEN 1 AND 500),
  run_id              uuid NOT NULL,
  fetched_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT aqr_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT aqr_fetched_bound CHECK ((outcome = 'fetched') = (content_digest IS NOT NULL))
);
CREATE INDEX aqr_cache ON observation.acquisition_robots (source_id, contract_version, origin, fetched_at DESC);
CREATE TRIGGER aqr_append_only BEFORE UPDATE OR DELETE ON observation.acquisition_robots FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE observation.acquisition_robots IS 'B40 §AP (V03-T-073): robots.txt fetched through the vetted client (or the replay set), cached PER CONTRACT VERSION and origin as parsed groups (digest and length, never the text); an unavailable fetch is recorded and never served as a cache entry. Append-only.';

-- §AP.4 THE RATE-LIMITED INTERVALS ────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE observation.acquisition_rate_limits (
  rate_limit_id          uuid PRIMARY KEY,
  scope                  text NOT NULL,
  tenant_id              uuid NOT NULL,
  domain_id              uuid NOT NULL,
  source_id              uuid NOT NULL,
  contract_version       int  NOT NULL CHECK (contract_version >= 1),
  -- the run that met it (NULL only for an execution fault before any run was opened)
  run_id                 uuid,
  origin                 text NOT NULL CHECK (origin IN ('publisher_429', 'contract_rate', 'unavailable')),
  -- the request's URL, redacted (no userinfo, no query values) — NULL for an unavailable source
  endpoint               text CHECK (endpoint IS NULL OR length(endpoint) <= 500),
  http_status            int CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  retry_after_raw        text CHECK (retry_after_raw IS NULL OR length(retry_after_raw) <= 64),
  retry_after_seconds    int CHECK (retry_after_seconds IS NULL OR retry_after_seconds >= 0),
  -- honoured: the publisher's Retry-After set (or lengthened) the hold · absent: none given · unparsed: given and unreadable (the schedule
  -- applies, never sooner) · not_honoured: the contract declares honour_retry_after false · own_bucket: the contract's own rate
  retry_after_state      text NOT NULL CHECK (retry_after_state IN ('honoured', 'absent', 'unparsed', 'not_honoured', 'own_bucket')),
  attempt                int NOT NULL CHECK (attempt >= 1),
  max_attempts           int NOT NULL CHECK (max_attempts BETWEEN 1 AND 21),
  schedule_delay_seconds int NOT NULL CHECK (schedule_delay_seconds BETWEEN 1 AND 86400),
  applied_delay_seconds  int NOT NULL CHECK (applied_delay_seconds BETWEEN 1 AND 86400),
  interval_from          timestamptz NOT NULL,
  interval_to            timestamptz NOT NULL,
  exhausted              boolean NOT NULL,
  retry_planned          boolean NOT NULL,
  detail                 text NOT NULL CHECK (length(detail) BETWEEN 1 AND 1000),
  declared_at            timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id         uuid NOT NULL,
  CONSTRAINT aqrl_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT aqrl_interval CHECK (interval_to > interval_from),
  CONSTRAINT aqrl_never_sooner CHECK (applied_delay_seconds >= schedule_delay_seconds
                                      AND (retry_after_state <> 'honoured' OR retry_after_seconds IS NULL OR applied_delay_seconds >= least(retry_after_seconds, 86400))),
  CONSTRAINT aqrl_planned CHECK (NOT (exhausted AND retry_planned)),
  CONSTRAINT aqrl_run_bound CHECK (run_id IS NOT NULL OR origin = 'unavailable')
);
CREATE INDEX aqrl_source ON observation.acquisition_rate_limits (source_id, contract_version, declared_at DESC);
CREATE INDEX aqrl_run ON observation.acquisition_rate_limits (run_id) WHERE run_id IS NOT NULL;
CREATE TRIGGER aqrl_append_only BEFORE UPDATE OR DELETE ON observation.acquisition_rate_limits FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE observation.acquisition_rate_limits IS 'B40 §AP (DP-10-005, V03-T-073): every rate-limited or unavailable attempt of an SRC@v4 source — the publisher''s 429 and Retry-After, the contract''s own bucket, the source unavailable — with the contract''s backoff (attempt, schedule delay, applied delay, never sooner than asked, bounded), the HOLD interval and whether a retry is planned. The coverage gap made explicit. Append-only; resolution is derived at read time.';

-- §AP.5 THE RESPONSE FINGERPRINTS ─────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE observation.acquisition_response_fingerprints (
  fingerprint_id      uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  source_id           uuid NOT NULL,
  contract_version    int  NOT NULL CHECK (contract_version >= 1),
  run_id              uuid NOT NULL,
  poll_key            text NOT NULL CHECK (length(poll_key) BETWEEN 1 AND 500),
  media_type          text CHECK (media_type IS NULL OR length(media_type) <= 120),
  -- json-object | json-array | json-scalar | xml | text | binary
  root_type           text NOT NULL CHECK (root_type IN ('json-object', 'json-array', 'json-scalar', 'xml', 'text', 'binary')),
  keys_digest         text CHECK (keys_digest IS NULL OR keys_digest ~ '^[0-9a-f]{64}$'),
  key_count           int CHECK (key_count IS NULL OR key_count >= 0),
  byte_length         int NOT NULL CHECK (byte_length >= 0),
  content_digest      text NOT NULL CHECK (content_digest ~ '^[0-9a-f]{64}$'),
  verdict             text NOT NULL CHECK (verdict IN ('baseline', 'consistent', 'anomaly')),
  anomaly             jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(anomaly) = 'array'),
  observed_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT aqrf_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT aqrf_anomaly CHECK ((verdict = 'anomaly') = (jsonb_array_length(anomaly) > 0))
);
CREATE INDEX aqrf_poll ON observation.acquisition_response_fingerprints (source_id, poll_key, observed_at DESC);
CREATE TRIGGER aqrf_append_only BEFORE UPDATE OR DELETE ON observation.acquisition_response_fingerprints FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE observation.acquisition_response_fingerprints IS 'B40 §AP (DP-10-005): the identity and shape of each response of an SRC@v4 source per poll key (media type, root type, top-level key set digest, size, content digest — never content); an anomaly against the last consistent one is quarantined (response_anomaly). Append-only.';

REVOKE ALL ON observation.acquisition_authorizations, observation.acquisition_robots, observation.acquisition_rate_limits,
              observation.acquisition_response_fingerprints FROM PUBLIC;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['acquisition_authorizations', 'acquisition_robots', 'acquisition_rate_limits', 'acquisition_response_fingerprints'] LOOP
    EXECUTE format('ALTER TABLE observation.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE observation.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY ap_isolation ON observation.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON observation.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- §AP.6 THE PORTS ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* Internal: the run named is a run of this source and contract version in this scope (its projection row), and — for an in-run write — it
   holds the source's lease right now (0056). Answers the run's agent principal. */
CREATE OR REPLACE FUNCTION observation._ap_run(p_tenant uuid, p_domain uuid, p_source uuid, p_version int, p_run uuid, p_effect text, p_fenced boolean)
RETURNS uuid
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_agent uuid;
BEGIN
  SELECT r.agent_principal_id INTO v_agent FROM observation.collection_runs_current r
   WHERE r.run_id = p_run AND r.source_id = p_source AND r.contract_version = p_version AND r.tenant_id = p_tenant AND r.domain_id = p_domain;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'acquisition policy rejected (unknown_run): run % is not a run of source % contract version % in this domain', p_run, p_source, p_version
      USING ERRCODE = '23503';
  END IF;
  IF p_fenced THEN PERFORM observation.assert_run_holds_source(p_source, p_run, p_effect); END IF;
  RETURN v_agent;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation._ap_run(uuid, uuid, uuid, int, uuid, text, boolean) FROM PUBLIC;

/* Internal: the consecutive rate-limited / unavailable attempts of a source's contract version since its last FINISHED run (any version). */
CREATE OR REPLACE FUNCTION observation._ap_consecutive(p_source uuid, p_version int) RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
  SELECT count(*)::int FROM observation.acquisition_rate_limits l
   WHERE l.source_id = p_source AND l.contract_version = p_version
     AND l.declared_at > coalesce((SELECT max(r.finished_at) FROM observation.collection_runs_current r
                                    WHERE r.source_id = p_source AND r.state = 'finished'), '-infinity'::timestamptz)
$$;
REVOKE ALL ON FUNCTION observation._ap_consecutive(uuid, int) FROM PUBLIC;

/* Internal: the hold in force for a source's contract version (the latest rate-limited interval still open, not resolved by a later finished run). */
CREATE OR REPLACE FUNCTION observation._ap_hold(p_source uuid, p_version int, p_at timestamptz) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('rate_limit_id', l.rate_limit_id, 'origin', l.origin, 'attempt', l.attempt, 'max_attempts', l.max_attempts,
           'interval_from', l.interval_from, 'until', l.interval_to, 'applied_delay_seconds', l.applied_delay_seconds,
           'retry_after_seconds', l.retry_after_seconds, 'retry_after_state', l.retry_after_state, 'exhausted', l.exhausted, 'retry_planned', l.retry_planned)
    FROM observation.acquisition_rate_limits l
   WHERE l.source_id = p_source AND l.contract_version = p_version AND l.interval_to > p_at
     AND l.declared_at > coalesce((SELECT max(r.finished_at) FROM observation.collection_runs_current r
                                    WHERE r.source_id = p_source AND r.state = 'finished'), '-infinity'::timestamptz)
   ORDER BY l.interval_to DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION observation._ap_hold(uuid, int, timestamptz) FROM PUBLIC;

/* The facts the AUTHORIZE stage decides from, read from CURRENT state inside the run (fenced by its lease): the contract version (rights,
   lifecycle, mode, residency, purposes, effective period, the credential REFERENCE, the v4 acquisition policy), the rights terms in force
   (0121's rt_current — D4's second source), the domain's residency profile and the regions it admits, the robots cache of this contract
   version, the backoff hold in force and the instant. */
CREATE OR REPLACE FUNCTION observation.ap_run_inputs(p_tenant uuid, p_domain uuid, p_source uuid, p_version int, p_run uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = observation, ctx, tenancy, graph, public, pg_catalog, pg_temp AS $$
DECLARE c observation.source_contracts_current; t observation.rights_terms; v_at timestamptz := clock_timestamp(); v_profile text; v_profile_of text;
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  PERFORM observation._ap_run(p_tenant, p_domain, p_source, p_version, p_run, 'acquisition authorization', true);
  SELECT * INTO c FROM observation.source_contracts_current x
   WHERE x.source_id = p_source AND x.contract_version = p_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  t := observation.rt_current(p_tenant, p_domain, p_source, p_version);
  SELECT d.residency_profile INTO v_profile FROM tenancy.domains d WHERE d.id = p_domain AND d.tenant_id = p_tenant;
  v_profile_of := 'domain';
  IF v_profile IS NULL THEN
    SELECT tt.residency_profile INTO v_profile FROM tenancy.tenants tt WHERE tt.id = p_tenant;
    v_profile_of := 'tenant';
  END IF;
  RETURN jsonb_build_object(
    'at', v_at,
    'contract', jsonb_build_object('contract_version', c.contract_version, 'lifecycle_state', c.lifecycle_state, 'rights_state', c.rights_state,
      'acquisition_mode', c.acquisition_mode, 'residency', c.residency, 'classification_ceiling', c.classification_ceiling, 'purposes', c.purposes,
      'effective_to', c.effective_to, 'connector_kind', c.connector_kind,
      'credential_ref', c.contract #>> '{security_and_operations,credential_ref}',
      'licence', c.contract #>> '{authority_and_rights,licence}',
      'acquisition_policy', c.contract -> 'acquisition_policy'),
    'terms', CASE WHEN t.terms_id IS NULL THEN NULL ELSE jsonb_build_object(
      'terms_id', t.terms_id, 'version', t.version, 'state', observation.rt_state(t, v_at), 'recorded_state', t.state, 'expires_at', t.expires_at,
      'purposes', t.purposes, 'prohibited_uses', t.prohibited_uses) END,
    'residency', jsonb_build_object('profile', v_profile, 'profile_of', v_profile_of,
      'regions', to_jsonb(observation.ap_residency_regions(v_profile))),
    'robots', (SELECT coalesce(jsonb_agg(jsonb_build_object('origin', x.origin, 'outcome', x.outcome, 'rules', x.rules, 'robots_id', x.robots_id,
                                   'fetched_at', x.fetched_at, 'http_status', x.http_status) ORDER BY x.origin), '[]'::jsonb)
                 FROM (SELECT DISTINCT ON (r.origin) r.* FROM observation.acquisition_robots r
                        WHERE r.source_id = p_source AND r.contract_version = p_version AND r.tenant_id = p_tenant AND r.domain_id = p_domain
                          AND r.outcome IN ('fetched', 'no_robots_file')
                        ORDER BY r.origin, r.fetched_at DESC) x),
    'hold', observation._ap_hold(p_source, p_version, v_at),
    'consecutive', observation._ap_consecutive(p_source, p_version));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.ap_run_inputs(uuid, uuid, uuid, int, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.ap_run_inputs(uuid, uuid, uuid, int, uuid) TO eye_commit;

/* The run's acquisition authorization — once per run (a second is refused: the run cites ONE). The record's verdict blocks are the stage's;
   the port binds the scope, the run, its lease and its agent, and the decision's shape. */
CREATE OR REPLACE FUNCTION observation.record_acquisition_authorization(
  p_id uuid, p_tenant uuid, p_domain uuid, p_source uuid, p_version int, p_run uuid, p_form text, p_purpose text,
  p_decision text, p_refusal_class text, p_reason text, p_record jsonb, p_correlation uuid
) RETURNS uuid
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_agent uuid;
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  v_agent := observation._ap_run(p_tenant, p_domain, p_source, p_version, p_run, 'acquisition authorization', true);
  IF p_record IS NULL OR jsonb_typeof(p_record) <> 'object' THEN
    RAISE EXCEPTION 'acquisition authorization rejected (record): the authorization names its verdicts as an object' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM observation.acquisition_authorizations a WHERE a.run_id = p_run) THEN
    RAISE EXCEPTION 'acquisition authorization rejected (duplicate): run % already cites its authorization', p_run USING ERRCODE = '23505';
  END IF;
  INSERT INTO observation.acquisition_authorizations (
    authorization_id, scope, tenant_id, domain_id, source_id, contract_version, run_id, form, purpose_id, decision, refusal_class, reason,
    rights, licence, credential_ref, rate, residency, collection_window, robots, backoff, agent_principal_id, correlation_id
  ) VALUES (
    p_id, 'DOMAIN', p_tenant, p_domain, p_source, p_version, p_run, p_form, p_purpose, p_decision, p_refusal_class, left(p_reason, 1000),
    coalesce(p_record -> 'rights', '{}'::jsonb), coalesce(p_record -> 'licence', '{}'::jsonb), p_record ->> 'credential_ref',
    coalesce(p_record -> 'rate', '{}'::jsonb), coalesce(p_record -> 'residency', '{}'::jsonb), coalesce(p_record -> 'window', '{}'::jsonb),
    coalesce(p_record -> 'robots', '{}'::jsonb), coalesce(p_record -> 'backoff', '{}'::jsonb), v_agent, p_correlation);
  RETURN p_id;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.record_acquisition_authorization(uuid, uuid, uuid, uuid, int, uuid, text, text, text, text, text, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.record_acquisition_authorization(uuid, uuid, uuid, uuid, int, uuid, text, text, text, text, text, jsonb, uuid) TO eye_commit;

/* One robots.txt fetch (or its failure) for an origin of this contract version, by the run that holds the source. */
CREATE OR REPLACE FUNCTION observation.record_robots_fetch(
  p_id uuid, p_tenant uuid, p_domain uuid, p_source uuid, p_version int, p_run uuid, p_origin text, p_outcome text, p_status int,
  p_digest text, p_bytes int, p_rules jsonb, p_via text, p_detail text, p_correlation uuid
) RETURNS uuid
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  PERFORM observation._ap_run(p_tenant, p_domain, p_source, p_version, p_run, 'robots fetch', true);
  INSERT INTO observation.acquisition_robots (
    robots_id, scope, tenant_id, domain_id, source_id, contract_version, origin, outcome, http_status, content_digest, byte_length, rules, via,
    detail, run_id, correlation_id
  ) VALUES (p_id, 'DOMAIN', p_tenant, p_domain, p_source, p_version, p_origin, p_outcome, p_status, p_digest, p_bytes, coalesce(p_rules, '[]'::jsonb),
            p_via, left(p_detail, 500), p_run, p_correlation);
  RETURN p_id;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.record_robots_fetch(uuid, uuid, uuid, uuid, int, uuid, text, text, int, text, int, jsonb, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.record_robots_fetch(uuid, uuid, uuid, uuid, int, uuid, text, text, int, text, int, jsonb, text, text, uuid) TO eye_commit;

/* ES-31-007: the rights RE-CHECKED BEFORE EVERY REQUEST, from current state — the contract version (lifecycle, rights, effective period) and
   the rights terms in force (withdrawn → rights; expired → licence). Answers { ok, class, reason }; refuses nothing itself. */
CREATE OR REPLACE FUNCTION observation.ap_rights_now(p_tenant uuid, p_domain uuid, p_source uuid, p_version int, p_run uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c observation.source_contracts_current; t observation.rights_terms; v_at timestamptz := clock_timestamp(); v_state text;
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  PERFORM observation._ap_run(p_tenant, p_domain, p_source, p_version, p_run, 'request', true);
  SELECT * INTO c FROM observation.source_contracts_current x
   WHERE x.source_id = p_source AND x.contract_version = p_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF c.lifecycle_state <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'class', 'policy', 'reason', format('the contract version is %s, not active, at this request', c.lifecycle_state), 'at', v_at);
  END IF;
  IF c.rights_state = 'withdrawn' OR (c.rights_state <> 'confirmed' AND c.acquisition_mode = 'live') THEN
    RETURN jsonb_build_object('ok', false, 'class', 'rights', 'reason', format('the contract''s rights are %s at this request', c.rights_state), 'at', v_at);
  END IF;
  IF c.effective_to IS NOT NULL AND c.effective_to <= v_at THEN
    RETURN jsonb_build_object('ok', false, 'class', 'licence', 'reason', 'the contract''s effective period ended before this request', 'at', v_at);
  END IF;
  t := observation.rt_current(p_tenant, p_domain, p_source, p_version);
  v_state := observation.rt_state(t, v_at);
  IF v_state = 'withdrawn' THEN
    RETURN jsonb_build_object('ok', false, 'class', 'rights', 'reason', format('the rights terms (v%s) are withdrawn at this request', t.version), 'at', v_at);
  END IF;
  IF v_state = 'expired' THEN
    RETURN jsonb_build_object('ok', false, 'class', 'licence', 'reason', format('the rights terms (v%s) expired at %s', t.version, t.expires_at), 'at', v_at);
  END IF;
  RETURN jsonb_build_object('ok', true, 'class', NULL, 'reason', CASE WHEN t.terms_id IS NULL THEN 'contract rights confirmed; no rights terms declared'
                                                                      ELSE format('contract rights %s; rights terms v%s in force', c.rights_state, t.version) END, 'at', v_at);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.ap_rights_now(uuid, uuid, uuid, int, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.ap_rights_now(uuid, uuid, uuid, int, uuid) TO eye_commit;

/* The attempt number the NEXT rate-limited record of this source's contract version would carry (consecutive since its last finished run). */
CREATE OR REPLACE FUNCTION observation.ap_next_attempt(p_tenant uuid, p_domain uuid, p_source uuid, p_version int) RETURNS int
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  IF NOT EXISTS (SELECT 1 FROM observation.source_contracts_current x WHERE x.source_id = p_source AND x.contract_version = p_version
                   AND x.tenant_id = p_tenant AND x.domain_id = p_domain) THEN
    RAISE EXCEPTION 'acquisition policy rejected (unknown_source): source % contract version % is not recorded in this domain', p_source, p_version USING ERRCODE = '23503';
  END IF;
  RETURN observation._ap_consecutive(p_source, p_version) + 1;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.ap_next_attempt(uuid, uuid, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.ap_next_attempt(uuid, uuid, uuid, int) TO eye_commit;

/* One rate-limited (or unavailable) attempt and its hold. In-run origins (publisher_429, contract_rate) are written by the run that holds
   the source; `unavailable` is written by the scheduler after the run ended (or faulted). The attempt number must be the next one (stale
   otherwise: another record landed between the read and this write); the delays are the stage's arithmetic, bounded here. */
CREATE OR REPLACE FUNCTION observation.record_rate_limit(
  p_id uuid, p_tenant uuid, p_domain uuid, p_source uuid, p_version int, p_run uuid, p_origin text, p_endpoint text, p_status int,
  p_retry_after_raw text, p_retry_after_seconds int, p_retry_after_state text, p_attempt int, p_max_attempts int,
  p_schedule_delay int, p_applied_delay int, p_from timestamptz, p_exhausted boolean, p_retry_planned boolean, p_detail text, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_expected int; v_from timestamptz := coalesce(p_from, clock_timestamp());
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  IF p_origin IN ('publisher_429', 'contract_rate') THEN
    PERFORM observation._ap_run(p_tenant, p_domain, p_source, p_version, p_run, 'rate limit record', true);
  ELSIF p_origin = 'unavailable' THEN
    IF p_run IS NOT NULL THEN PERFORM observation._ap_run(p_tenant, p_domain, p_source, p_version, p_run, 'rate limit record', false); END IF;
    IF NOT EXISTS (SELECT 1 FROM observation.source_contracts_current x WHERE x.source_id = p_source AND x.contract_version = p_version
                     AND x.tenant_id = p_tenant AND x.domain_id = p_domain) THEN
      RAISE EXCEPTION 'acquisition policy rejected (unknown_source): source % contract version % is not recorded in this domain', p_source, p_version USING ERRCODE = '23503';
    END IF;
  ELSE
    RAISE EXCEPTION 'acquisition policy rejected (origin): % is not a rate-limit origin (publisher_429 | contract_rate | unavailable)', coalesce(p_origin, '<none>') USING ERRCODE = '22023';
  END IF;
  -- one source, one run at a time (0051): the attempt count is read and written under the source's lease row's order
  PERFORM 1 FROM observation.source_run_leases WHERE source_id = p_source FOR UPDATE;
  v_expected := observation._ap_consecutive(p_source, p_version) + 1;
  IF p_attempt IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'acquisition policy rejected (stale): attempt % was computed; the next attempt of this source is %', p_attempt, v_expected USING ERRCODE = '40001';
  END IF;
  INSERT INTO observation.acquisition_rate_limits (
    rate_limit_id, scope, tenant_id, domain_id, source_id, contract_version, run_id, origin, endpoint, http_status, retry_after_raw,
    retry_after_seconds, retry_after_state, attempt, max_attempts, schedule_delay_seconds, applied_delay_seconds, interval_from, interval_to,
    exhausted, retry_planned, detail, correlation_id
  ) VALUES (
    p_id, 'DOMAIN', p_tenant, p_domain, p_source, p_version, p_run, p_origin, left(p_endpoint, 500), p_status, left(p_retry_after_raw, 64),
    p_retry_after_seconds, p_retry_after_state, p_attempt, p_max_attempts, p_schedule_delay, p_applied_delay, v_from,
    v_from + make_interval(secs => p_applied_delay), p_exhausted, p_retry_planned, left(p_detail, 1000), p_correlation);
  RETURN jsonb_build_object('rate_limit_id', p_id, 'attempt', p_attempt, 'interval_from', v_from, 'until', v_from + make_interval(secs => p_applied_delay),
                            'exhausted', p_exhausted, 'retry_planned', p_retry_planned);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.record_rate_limit(uuid, uuid, uuid, uuid, int, uuid, text, text, int, text, int, text, int, int, int, int, timestamptz, boolean, boolean, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.record_rate_limit(uuid, uuid, uuid, uuid, int, uuid, text, text, int, text, int, text, int, int, int, int, timestamptz, boolean, boolean, text, uuid) TO eye_commit;

/* The scheduler's question after a run (or a fault): is the contract v4, what is its backoff, how did the run end, and did the run record a
   rate-limited attempt? Technical facts only (no evidence, no contract body beyond the backoff). */
CREATE OR REPLACE FUNCTION observation.ap_after_run(p_tenant uuid, p_domain uuid, p_source uuid, p_version int, p_run uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c observation.source_contracts_current; r observation.collection_runs_current; l observation.acquisition_rate_limits;
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  SELECT * INTO c FROM observation.source_contracts_current x
   WHERE x.source_id = p_source AND x.contract_version = p_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'acquisition policy rejected (unknown_source): source % contract version % is not recorded in this domain', p_source, p_version USING ERRCODE = '23503';
  END IF;
  IF p_run IS NOT NULL THEN
    SELECT * INTO r FROM observation.collection_runs_current x WHERE x.run_id = p_run AND x.source_id = p_source;
    SELECT * INTO l FROM observation.acquisition_rate_limits x WHERE x.run_id = p_run ORDER BY x.declared_at DESC LIMIT 1;
  END IF;
  RETURN jsonb_build_object(
    'v4', c.contract ? 'acquisition_policy',
    'lifecycle_state', c.lifecycle_state,
    'backoff', c.contract #> '{acquisition_policy,backoff}',
    'run', CASE WHEN r.run_id IS NULL THEN NULL ELSE jsonb_build_object('state', r.state, 'failure_reason', r.failure_reason, 'finished_at', r.finished_at) END,
    'rate_limit', CASE WHEN l.rate_limit_id IS NULL THEN NULL ELSE jsonb_build_object('rate_limit_id', l.rate_limit_id, 'origin', l.origin, 'attempt', l.attempt,
       'until', l.interval_to, 'applied_delay_seconds', l.applied_delay_seconds, 'exhausted', l.exhausted, 'retry_planned', l.retry_planned) END,
    'next_attempt', observation._ap_consecutive(p_source, p_version) + 1,
    'hold', observation._ap_hold(p_source, p_version, clock_timestamp()));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.ap_after_run(uuid, uuid, uuid, int, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.ap_after_run(uuid, uuid, uuid, int, uuid) TO eye_commit;

/* The last CONSISTENT (or baseline) fingerprint of a poll key — what the next response is compared with. */
CREATE OR REPLACE FUNCTION observation.ap_last_fingerprint(p_tenant uuid, p_domain uuid, p_source uuid, p_version int, p_run uuid, p_poll_key text) RETURNS jsonb
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  PERFORM observation._ap_run(p_tenant, p_domain, p_source, p_version, p_run, 'response check', true);
  RETURN (SELECT jsonb_build_object('fingerprint_id', f.fingerprint_id, 'media_type', f.media_type, 'root_type', f.root_type, 'keys_digest', f.keys_digest,
                   'key_count', f.key_count, 'byte_length', f.byte_length, 'content_digest', f.content_digest, 'observed_at', f.observed_at)
            FROM observation.acquisition_response_fingerprints f
           WHERE f.source_id = p_source AND f.tenant_id = p_tenant AND f.domain_id = p_domain AND f.poll_key = p_poll_key AND f.verdict <> 'anomaly'
           ORDER BY f.observed_at DESC LIMIT 1);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.ap_last_fingerprint(uuid, uuid, uuid, int, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.ap_last_fingerprint(uuid, uuid, uuid, int, uuid, text) TO eye_commit;

CREATE OR REPLACE FUNCTION observation.record_response_fingerprint(
  p_id uuid, p_tenant uuid, p_domain uuid, p_source uuid, p_version int, p_run uuid, p_poll_key text, p_media_type text, p_root_type text,
  p_keys_digest text, p_key_count int, p_bytes int, p_digest text, p_verdict text, p_anomaly jsonb, p_correlation uuid
) RETURNS uuid
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  PERFORM observation._ap_run(p_tenant, p_domain, p_source, p_version, p_run, 'response check', true);
  INSERT INTO observation.acquisition_response_fingerprints (
    fingerprint_id, scope, tenant_id, domain_id, source_id, contract_version, run_id, poll_key, media_type, root_type, keys_digest, key_count,
    byte_length, content_digest, verdict, anomaly, correlation_id
  ) VALUES (p_id, 'DOMAIN', p_tenant, p_domain, p_source, p_version, p_run, left(p_poll_key, 500), left(p_media_type, 120), p_root_type, p_keys_digest,
            p_key_count, p_bytes, p_digest, p_verdict, coalesce(p_anomaly, '[]'::jsonb), p_correlation);
  RETURN p_id;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.record_response_fingerprint(uuid, uuid, uuid, uuid, int, uuid, text, text, text, text, int, int, text, text, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.record_response_fingerprint(uuid, uuid, uuid, uuid, int, uuid, text, text, text, text, int, int, text, text, jsonb, uuid) TO eye_commit;

-- §AP.7 THE READ ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* The acquisition page and the coverage panel: per contract version of the source (newest first) its acquisition policy (or "not declared
   before SRC@v4"); the latest 50 authorizations; the robots cache; the rate-limited intervals (latest 100) each with its derived resolution
   (resolved by the first FINISHED run of the source after the hold ended — or still open); the stream form's explicit incomplete ranges of
   the source (latest 100, every class). Metadata only (D9): no evidence content, no credential value, no robots text. */
CREATE OR REPLACE FUNCTION observation.acquisition_policy_read(p_tenant uuid, p_domain uuid, p_source uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, ctx, graph, public, pg_catalog, pg_temp AS $$
DECLARE v_at timestamptz := clock_timestamp(); v_name text; v_key text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.acquisition.read']);
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the acquisition policy of a source');
  SELECT x.name, x.source_key INTO v_name, v_key FROM observation.source_contracts_current x
   WHERE x.source_id = p_source AND x.tenant_id = p_tenant AND x.domain_id = p_domain ORDER BY x.contract_version DESC LIMIT 1;
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'acquisition policy rejected (unknown_source): source % is not recorded in this domain', coalesce(p_source::text, '<none>') USING ERRCODE = '23503';
  END IF;
  RETURN jsonb_build_object(
    'source_id', p_source, 'source_key', v_key, 'source_name', v_name, 'as_of', graph.pv_iso(v_at),
    'versions', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'contract_version', c.contract_version, 'lifecycle_state', c.lifecycle_state, 'rights_state', c.rights_state, 'acquisition_mode', c.acquisition_mode,
        'residency', c.residency, 'connector_kind', c.connector_kind, 'schema', CASE WHEN c.contract ? 'acquisition_policy' THEN 'SRC@v4' ELSE 'SRC@v1–v3' END,
        'acquisition_policy', c.contract -> 'acquisition_policy',
        'statement', CASE WHEN c.contract ? 'acquisition_policy' THEN 'the contract''s acquisition policy is enforced before and during egress'
                          ELSE 'not declared before SRC@v4 — this contract version keeps its recorded behaviour (no rate, robots, window or residency evaluation)' END,
        'credential_ref', c.contract #>> '{security_and_operations,credential_ref}')
        ORDER BY c.contract_version DESC), '[]'::jsonb)
        FROM observation.source_contracts_current c WHERE c.source_id = p_source AND c.tenant_id = p_tenant AND c.domain_id = p_domain),
    'authorizations', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'authorization_id', a.authorization_id, 'contract_version', a.contract_version, 'run_id', a.run_id, 'form', a.form, 'purpose_id', a.purpose_id,
        'decision', a.decision, 'refusal_class', a.refusal_class, 'reason', a.reason, 'rights', a.rights, 'licence', a.licence,
        'credential_ref', a.credential_ref, 'rate', a.rate, 'residency', a.residency, 'window', a.collection_window, 'robots', a.robots, 'backoff', a.backoff,
        'agent_principal_id', a.agent_principal_id, 'decided_at', graph.pv_iso(a.decided_at)) ORDER BY a.decided_at DESC), '[]'::jsonb)
        FROM (SELECT * FROM observation.acquisition_authorizations x WHERE x.source_id = p_source AND x.tenant_id = p_tenant AND x.domain_id = p_domain
               ORDER BY x.decided_at DESC LIMIT 50) a),
    'robots', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'contract_version', r.contract_version, 'origin', r.origin, 'outcome', r.outcome, 'http_status', r.http_status, 'content_digest', r.content_digest,
        'byte_length', r.byte_length, 'groups', jsonb_array_length(r.rules), 'rules', r.rules, 'via', r.via, 'detail', r.detail, 'run_id', r.run_id,
        'fetched_at', graph.pv_iso(r.fetched_at)) ORDER BY r.fetched_at DESC), '[]'::jsonb)
        FROM (SELECT * FROM observation.acquisition_robots x WHERE x.source_id = p_source AND x.tenant_id = p_tenant AND x.domain_id = p_domain
               ORDER BY x.fetched_at DESC LIMIT 50) r),
    'rate_limited', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'rate_limit_id', l.rate_limit_id, 'contract_version', l.contract_version, 'run_id', l.run_id, 'origin', l.origin, 'endpoint', l.endpoint,
        'http_status', l.http_status, 'retry_after_raw', l.retry_after_raw, 'retry_after_seconds', l.retry_after_seconds, 'retry_after_state', l.retry_after_state,
        'attempt', l.attempt, 'max_attempts', l.max_attempts, 'schedule_delay_seconds', l.schedule_delay_seconds, 'applied_delay_seconds', l.applied_delay_seconds,
        'interval_from', graph.pv_iso(l.interval_from), 'interval_to', graph.pv_iso(l.interval_to), 'exhausted', l.exhausted, 'retry_planned', l.retry_planned,
        'detail', l.detail, 'declared_at', graph.pv_iso(l.declared_at),
        'state', CASE WHEN res.run_id IS NOT NULL THEN 'resolved' WHEN l.interval_to > v_at THEN 'holding' ELSE 'open' END,
        'resolved_by_run', res.run_id, 'resolved_at', graph.pv_iso(res.finished_at)) ORDER BY l.declared_at DESC), '[]'::jsonb)
        FROM (SELECT * FROM observation.acquisition_rate_limits x WHERE x.source_id = p_source AND x.tenant_id = p_tenant AND x.domain_id = p_domain
               ORDER BY x.declared_at DESC LIMIT 100) l
        LEFT JOIN LATERAL (SELECT r.run_id, r.finished_at FROM observation.collection_runs_current r
                            WHERE r.source_id = l.source_id AND r.state = 'finished' AND r.finished_at >= l.declared_at
                            ORDER BY r.finished_at LIMIT 1) res ON true),
    'incomplete_ranges', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'range_id', i.range_id, 'stream_id', i.stream_id, 'range_from', i.range_from, 'range_to', i.range_to, 'reason_class', i.reason_class,
        'detail', i.detail, 'declared_at', graph.pv_iso(i.declared_at), 'resolved_at', graph.pv_iso(i.resolved_at),
        'state', CASE WHEN i.resolved_by_seq IS NULL THEN 'open' ELSE 'resolved' END) ORDER BY i.declared_at DESC), '[]'::jsonb)
        FROM (SELECT * FROM observation.acquisition_incomplete_ranges x WHERE x.source_id = p_source AND x.tenant_id = p_tenant AND x.domain_id = p_domain
               ORDER BY x.declared_at DESC LIMIT 100) i),
    'hold', (SELECT observation._ap_hold(p_source, (SELECT max(c.contract_version) FROM observation.source_contracts_current c
                                                      WHERE c.source_id = p_source AND c.lifecycle_state = 'active'), v_at)));
END $$;
REVOKE ALL ON FUNCTION observation.acquisition_policy_read(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.acquisition_policy_read(uuid, uuid, uuid) TO eye_app, eye_commit;


-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §CR — the connector cell, the published adapter SDK and the egress gateway (F-P1-12)
-- FOLDED by the integrator from 0123_b40_x_cr.sql (b40/cr), verbatim below unless a line is marked `-- B40 integration`.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0123 §CR — CP-6 B40: THE CONNECTOR CELL, THE PUBLISHED ADAPTER SDK AND THE EGRESS GATEWAY (F-P1-12: L1-C02, V03-T-440, IA-28-001,
-- IA-28-003, IA-28-005, IA-47-001, IA-47-003, IA-47-005, INF-PF-12, RU-11, DP-14-003, DAT-IN-02). The part's own file while it is built;
-- the integrator folds it into 0123 in the order §0, §RG, §VA, §IN, §AP, §CR. Applies ALONE on 0001–0122 + 0123 §0.
--
-- WHAT THIS SECTION ADDS
--   observation.adapter_packages (+ observation.adapter_package_events)   THE ADAPTER PACKAGE REGISTER (DP-14-003, D12): a customer-written
--        adapter's manifest (name, semver, entry, declared destinations, purposes, data classes, the author, the cell protocol) and its
--        PACKAGE DIGEST (sha256 over "<file>\0<sha256>\n" for its files sorted by name — the digest the SDK defines), each file's bytes held
--        by the vault (the evidence root's own blobs, digest-verified on store and re-verified on every load); REGISTERED by a named
--        collection manager, APPROVED (or rejected) by a SECOND person — a domain admin or another collection manager — never the
--        registrant, never an agent, never an external collaborator. The identity and digest of a package never change; the decision is
--        taken once.
--   observation.egress_receipts                                            THE TRANSFER RECEIPTS (IA-28-001): one per request a connector cell
--        asked the egress gateway for — the destination (host, the resolved and pinned addresses, the TLS SPKI, or the replay set), the
--        purpose and data class, the request and response digests and byte counts, whether the gateway injected a credential (by
--        REFERENCE; the value never reaches the cell or the record), the decision (allowed | refused | blocked) and its class. Written by
--        the run's own agent while its run holds the source's lease (0051); append-only.
--   observation.egress_destination_pins                                    the destination identity first seen per (source, contract version,
--        host) — the TLS SPKI and the address set — so a later run compares (IA-28-005); a contract may DECLARE its pins instead
--        (SRC@v4 authenticity.tls_spki_pins). Append-only.
--   observation.connector_requalifications (+ …_events)                    REQUALIFICATION (IA-47-005): opened when a cell's run is failed
--        closed for its own behaviour (an unregistered destination, a changed destination identity, a package whose bytes do not verify)
--        or when its credential is rotated — the contract SUSPENDED (cursor, checkpoint and custody untouched); SUBMITTED by a collection
--        manager with the package now to be in force (a NEW digest when the cell's own behaviour was the cause) and the CONTRACT TESTS the API ran in a cell; APPROVED
--        by a second person (≠ the submitter, never an agent). Reactivation is refused while one is open.
--   observation.connector_credential_bindings                              THE CREDENTIAL ROTATION of an adapter contract: a new binding
--        version names a new credential REFERENCE (the B11 form EYE_SRC_*; never a value), the previous one is revoked, the contract is
--        suspended and requalification required. The gateway injects the binding in force.
--   observation.transition_contract                                       re-declared WHOLE from 0022:883 (its last definition): activation
--        (approved → active, suspended → active) is refused while a requalification is open, and an adapter contract activates only on its
--        package in force — approved, digest and version as bound. Every other transition, text and check is unchanged (v1–v3: D8).
--   ports  register_adapter_package · decide_adapter_package · connector_cell_binding (the run's read) · record_egress_receipts ·
--          connector_suspend_for_requalification · submit_requalification · decide_requalification · rotate_connector_credential ·
--          connector_register_read · egress_receipts_read
--   No role (D14); no evidence-content permission (D9: receipts carry digests and byte counts, never bytes); no header field (D11).
--
-- WHAT IS NOT CLAIMED (D3): the cell is a child process under Node 24's permission model (no fs write, no child process, no worker, no
-- addon; fs read of its package only; the environment stripped, no credential). Its only INTENDED egress is the gateway's loopback socket,
-- but the permission model has no network switch: a direct socket is not prevented by the OS here. Network-level denial is B103 / B109,
-- then R1 — stated, never claimed.
-- THREE CLAIMS: CONSTRUCTION (this file, phase6-connector-cell-b40, egress-gateway-b40); DEMONSTRATED OPERATION (the act — SYNTHETIC
-- personas, `claim = 'demonstration'`); REAL ACCEPTANCE (B111's shared recording path, then H3/R2) — never claimed.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §CR.1 THE ADAPTER PACKAGE REGISTER ──────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE observation.adapter_packages (
  package_id       uuid PRIMARY KEY,
  scope            text NOT NULL,
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  name             text NOT NULL CHECK (name ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  version          text NOT NULL CHECK (version ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?$'),
  package_digest   text NOT NULL CHECK (package_digest ~ '^[0-9a-f]{64}$'),
  manifest         jsonb NOT NULL CHECK (jsonb_typeof(manifest) = 'object'),
  files            jsonb NOT NULL CHECK (jsonb_typeof(files) = 'array' AND jsonb_array_length(files) BETWEEN 1 AND 64),
  byte_length      bigint NOT NULL CHECK (byte_length >= 1),
  author           text NOT NULL CHECK (length(btrim(author)) BETWEEN 2 AND 256),
  protocol         text NOT NULL,
  sdk_version      text NOT NULL,
  state            text NOT NULL CHECK (state IN ('registered', 'approved', 'rejected')),
  registered_by    uuid NOT NULL,
  registered_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_by       uuid,
  decided_at       timestamptz,
  decision_reason  text,
  request_id       uuid NOT NULL UNIQUE,
  correlation_id   uuid NOT NULL,
  CONSTRAINT oap_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT oap_decided CHECK ((state = 'registered') = (decided_by IS NULL) AND (decided_by IS NULL) = (decided_at IS NULL)),
  CONSTRAINT oap_second_person CHECK (decided_by IS NULL OR decided_by <> registered_by),
  CONSTRAINT oap_version_once UNIQUE (tenant_id, domain_id, name, version)
);
COMMENT ON TABLE observation.adapter_packages IS 'B40 §CR (D12; DP-14-003): the adapter package register — a customer-written adapter''s manifest and package digest (sha256 over "<file>\0<sha256>\n" for its files sorted by name), each file a vault blob re-verified on every load; registered by a collection manager, approved or rejected ONCE by a second person (a domain admin or another collection manager; never the registrant, an agent or an external collaborator). Identity and digest are immutable.';
CREATE INDEX oap_domain ON observation.adapter_packages (tenant_id, domain_id, name, registered_at DESC);

/* The package row is immutable but for its ONE decision (registered → approved | rejected): the guard refuses any other change and any delete. */
CREATE OR REPLACE FUNCTION observation.oap_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = observation, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'adapter package rejected (state): a registered package is never deleted' USING ERRCODE = '23514';
  END IF;
  IF OLD.state <> 'registered' OR NEW.state NOT IN ('approved', 'rejected')
     OR (NEW.package_id, NEW.scope, NEW.tenant_id, NEW.domain_id, NEW.name, NEW.version, NEW.package_digest, NEW.manifest, NEW.files, NEW.byte_length,
         NEW.author, NEW.protocol, NEW.sdk_version, NEW.registered_by, NEW.registered_at, NEW.request_id, NEW.correlation_id)
        IS DISTINCT FROM
        (OLD.package_id, OLD.scope, OLD.tenant_id, OLD.domain_id, OLD.name, OLD.version, OLD.package_digest, OLD.manifest, OLD.files, OLD.byte_length,
         OLD.author, OLD.protocol, OLD.sdk_version, OLD.registered_by, OLD.registered_at, OLD.request_id, OLD.correlation_id) THEN
    RAISE EXCEPTION 'adapter package rejected (state): a package''s identity and digest never change, and its decision is taken once' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION observation.oap_guard() FROM PUBLIC;
CREATE TRIGGER oap_guard BEFORE UPDATE OR DELETE ON observation.adapter_packages FOR EACH ROW EXECUTE FUNCTION observation.oap_guard();

CREATE TABLE observation.adapter_package_events (
  event_id        uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  package_id      uuid NOT NULL REFERENCES observation.adapter_packages (package_id),
  event           text NOT NULL CHECK (event IN ('adapter.registered', 'adapter.approved', 'adapter.rejected')),
  actor           uuid NOT NULL,
  occurred_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  details         jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  correlation_id  uuid NOT NULL,
  CONSTRAINT oape_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
COMMENT ON TABLE observation.adapter_package_events IS 'B40 §CR: the ledger of the adapter package acts (registered, approved, rejected) — who, when, why; append-only.';
CREATE INDEX oape_package ON observation.adapter_package_events (package_id, occurred_at);
CREATE TRIGGER oape_append_only BEFORE UPDATE OR DELETE ON observation.adapter_package_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- §CR.2 THE TRANSFER RECEIPTS AND THE DESTINATION PINS ──────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE observation.egress_receipts (
  receipt_id           uuid PRIMARY KEY,
  scope                text NOT NULL,
  tenant_id            uuid NOT NULL,
  domain_id            uuid NOT NULL,
  source_id            uuid NOT NULL,
  contract_version     int  NOT NULL CHECK (contract_version >= 1),
  run_id               uuid NOT NULL,
  seq                  int  NOT NULL CHECK (seq BETWEEN 1 AND 100000),
  package_id           uuid,
  package_digest       text CHECK (package_digest IS NULL OR package_digest ~ '^[0-9a-f]{64}$'),
  requested_at         timestamptz NOT NULL,
  method               text NOT NULL CHECK (length(method) BETWEEN 1 AND 16),
  url_redacted         text NOT NULL CHECK (length(url_redacted) BETWEEN 1 AND 2048),
  host                 text NOT NULL CHECK (length(host) BETWEEN 1 AND 255),
  purpose              text CHECK (purpose IS NULL OR length(purpose) <= 200),
  data_class           text CHECK (data_class IS NULL OR length(data_class) <= 200),
  decision             text NOT NULL CHECK (decision IN ('allowed', 'refused', 'blocked')),
  refusal_class        text CHECK (refusal_class IS NULL OR refusal_class IN (
                         'cell_token', 'request', 'scheme', 'method', 'unregistered_destination', 'purpose', 'data_class', 'budget', 'throttle',
                         'destination_identity_changed', 'address_not_public', 'dns_failure', 'tls_failure', 'timeout', 'transport', 'response_too_large',
                         'replay_missing', 'contract_test')),
  reason               text CHECK (reason IS NULL OR length(reason) <= 1000),
  request_digest       text NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
  request_bytes        int  NOT NULL CHECK (request_bytes >= 0),
  response_status      int  CHECK (response_status IS NULL OR response_status BETWEEN 100 AND 599),
  response_digest      text CHECK (response_digest IS NULL OR response_digest ~ '^[0-9a-f]{64}$'),
  response_bytes       bigint CHECK (response_bytes IS NULL OR response_bytes >= 0),
  destination          jsonb NOT NULL CHECK (jsonb_typeof(destination) = 'object' AND destination ->> 'mode' IN ('live', 'replay', 'none')),
  credential_injected  boolean NOT NULL,
  credential_ref       text CHECK (credential_ref IS NULL OR credential_ref ~ '^EYE_SRC_[A-Z0-9_]{1,64}$'),
  correlation_id       uuid NOT NULL,
  recorded_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT oer_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT oer_class CHECK ((decision = 'allowed') = (refusal_class IS NULL)),
  CONSTRAINT oer_answer CHECK (decision = 'allowed' OR response_digest IS NULL),
  CONSTRAINT oer_credential CHECK (credential_injected = (credential_ref IS NOT NULL)),
  CONSTRAINT oer_run_seq UNIQUE (run_id, seq)
);
COMMENT ON TABLE observation.egress_receipts IS 'B40 §CR (IA-28-001, IA-28-005): one transfer receipt per request a connector cell asked the egress gateway for — destination identity (resolved/pinned addresses + TLS SPKI, or the replay set), purpose, data class, request/response digests and bytes, the credential by REFERENCE when the gateway injected one, the decision and its class. Written by the run''s own agent under the source''s run lease; append-only. Never bytes (D9).';
CREATE INDEX oer_source ON observation.egress_receipts (tenant_id, domain_id, source_id, recorded_at DESC);
CREATE INDEX oer_run ON observation.egress_receipts (run_id, seq);
CREATE TRIGGER oer_append_only BEFORE UPDATE OR DELETE ON observation.egress_receipts FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE observation.egress_destination_pins (
  scope             text NOT NULL,
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  source_id         uuid NOT NULL,
  contract_version  int  NOT NULL,
  host              text NOT NULL,
  tls_spki_sha256   text NOT NULL CHECK (tls_spki_sha256 ~ '^[A-Za-z0-9+/]{43}=$'),
  addresses         jsonb NOT NULL CHECK (jsonb_typeof(addresses) = 'array'),
  first_receipt_id  uuid NOT NULL REFERENCES observation.egress_receipts (receipt_id),
  pinned_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (source_id, contract_version, host),
  CONSTRAINT oep_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
COMMENT ON TABLE observation.egress_destination_pins IS 'B40 §CR (IA-28-005): the identity a destination first presented to the gateway for one contract version (TLS SPKI sha256, the address set) — the record a later request is compared with; a change of SPKI blocks the request before it is sent. A contract may declare its pins instead (SRC@v4 authenticity.tls_spki_pins). Append-only.';
CREATE TRIGGER oep_append_only BEFORE UPDATE OR DELETE ON observation.egress_destination_pins FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- §CR.3 REQUALIFICATION AND THE CREDENTIAL BINDINGS ─────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE observation.connector_requalifications (
  requalification_id  uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  source_id           uuid NOT NULL,
  contract_version    int  NOT NULL CHECK (contract_version >= 1),
  cause               text NOT NULL CHECK (cause IN ('unregistered_destination', 'destination_identity_changed', 'package_integrity', 'credential_rotated')),
  cause_detail        text NOT NULL CHECK (length(btrim(cause_detail)) BETWEEN 3 AND 1000),
  cause_run_id        uuid,
  cause_receipt_id    uuid REFERENCES observation.egress_receipts (receipt_id),
  opened_by           uuid NOT NULL,
  opened_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  digest_at_opening   text CHECK (digest_at_opening IS NULL OR digest_at_opening ~ '^[0-9a-f]{64}$'),
  state               text NOT NULL CHECK (state IN ('required', 'submitted', 'approved', 'rejected')),
  package_id          uuid REFERENCES observation.adapter_packages (package_id),
  package_version     text,
  package_digest      text CHECK (package_digest IS NULL OR package_digest ~ '^[0-9a-f]{64}$'),
  contract_tests      jsonb CHECK (contract_tests IS NULL OR jsonb_typeof(contract_tests) = 'object'),
  submitted_by        uuid,
  submitted_at        timestamptz,
  submit_reason       text,
  decided_by          uuid,
  decided_at          timestamptz,
  decision_reason     text,
  correlation_id      uuid NOT NULL,
  CONSTRAINT oqr_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT oqr_submitted CHECK (state = 'required' OR (submitted_by IS NOT NULL AND contract_tests IS NOT NULL)),
  CONSTRAINT oqr_decided CHECK ((state IN ('approved', 'rejected')) = (decided_by IS NOT NULL)),
  CONSTRAINT oqr_second_person CHECK (decided_by IS NULL OR decided_by <> submitted_by)
);
COMMENT ON TABLE observation.connector_requalifications IS 'B40 §CR (IA-47-005): a connector''s requalification — opened when its run was failed closed for its own behaviour (an unregistered destination, a changed destination identity, a package whose bytes do not verify) or its credential was rotated (the contract suspended, cursor and custody intact); submitted by a collection manager with the package in force and the contract tests the API ran in a cell; approved or rejected by a second person. Reactivation is refused while one is open. The state is a projection of the append-only events.';
CREATE UNIQUE INDEX oqr_one_open ON observation.connector_requalifications (source_id, contract_version) WHERE state IN ('required', 'submitted', 'rejected');
CREATE INDEX oqr_domain ON observation.connector_requalifications (tenant_id, domain_id, opened_at DESC);

CREATE TABLE observation.connector_requalification_events (
  event_id            uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  requalification_id  uuid NOT NULL REFERENCES observation.connector_requalifications (requalification_id),
  event               text NOT NULL CHECK (event IN ('requalification.required', 'requalification.submitted', 'requalification.approved', 'requalification.rejected')),
  actor               uuid NOT NULL,
  occurred_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  details             jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  request_id          uuid UNIQUE,
  correlation_id      uuid NOT NULL,
  CONSTRAINT oqre_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
COMMENT ON TABLE observation.connector_requalification_events IS 'B40 §CR: the ledger of every requalification act (required, submitted, approved, rejected) — who, when, the package and the tests; append-only.';
CREATE INDEX oqre_req ON observation.connector_requalification_events (requalification_id, occurred_at);
CREATE TRIGGER oqre_append_only BEFORE UPDATE OR DELETE ON observation.connector_requalification_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE observation.connector_credential_bindings (
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  source_id          uuid NOT NULL,
  contract_version   int  NOT NULL CHECK (contract_version >= 1),
  binding_version    int  NOT NULL CHECK (binding_version >= 1),
  credential_ref     text NOT NULL CHECK (credential_ref ~ '^EYE_SRC_[A-Z0-9_]{1,64}$'),
  credential_header  text NOT NULL CHECK (credential_header ~ '^[A-Za-z0-9-]{1,64}$'),
  state              text NOT NULL CHECK (state IN ('in_force', 'revoked')),
  rotated_from       int,
  reason             text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  bound_by           uuid NOT NULL,
  bound_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_by         uuid,
  revoked_at         timestamptz,
  requalification_id uuid REFERENCES observation.connector_requalifications (requalification_id),
  request_id         uuid NOT NULL UNIQUE,
  correlation_id     uuid NOT NULL,
  PRIMARY KEY (source_id, contract_version, binding_version),
  CONSTRAINT occb_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT occb_rotated CHECK ((binding_version = 1 AND rotated_from IS NULL) OR (binding_version > 1 AND rotated_from = binding_version - 1)),
  CONSTRAINT occb_revoked CHECK ((state = 'revoked') = (revoked_at IS NOT NULL) AND (revoked_at IS NULL) = (revoked_by IS NULL))
);
COMMENT ON TABLE observation.connector_credential_bindings IS 'B40 §CR (IA-47-005): the credential binding versions of an adapter contract — a REFERENCE (EYE_SRC_*; never a value) and the header the gateway injects it in. A rotation adds the next version and revokes the one in force (the only change a row ever takes), suspends the contract and opens a requalification. Version 1 is the first rotation away from the contract''s own credential_ref.';
CREATE UNIQUE INDEX occb_one_in_force ON observation.connector_credential_bindings (source_id, contract_version) WHERE state = 'in_force';

CREATE OR REPLACE FUNCTION observation.occb_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = observation, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.state <> 'in_force' OR NEW.state <> 'revoked'
     OR (to_jsonb(NEW) - 'state' - 'revoked_by' - 'revoked_at') IS DISTINCT FROM (to_jsonb(OLD) - 'state' - 'revoked_by' - 'revoked_at') THEN
    RAISE EXCEPTION 'credential rotation rejected (state): a credential binding is never edited or deleted; it is revoked once, by the next rotation' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION observation.occb_guard() FROM PUBLIC;
CREATE TRIGGER occb_guard BEFORE UPDATE OR DELETE ON observation.connector_credential_bindings FOR EACH ROW EXECUTE FUNCTION observation.occb_guard();

/* The requalification row changes only along its state machine (required|rejected → submitted → approved|rejected), its identity never. */
CREATE OR REPLACE FUNCTION observation.oqr_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = observation, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'requalification rejected (state): a requalification is never deleted' USING ERRCODE = '23514';
  END IF;
  IF (NEW.requalification_id, NEW.scope, NEW.tenant_id, NEW.domain_id, NEW.source_id, NEW.contract_version, NEW.cause, NEW.cause_detail, NEW.cause_run_id,
      NEW.cause_receipt_id, NEW.opened_by, NEW.opened_at, NEW.digest_at_opening, NEW.correlation_id)
     IS DISTINCT FROM
     (OLD.requalification_id, OLD.scope, OLD.tenant_id, OLD.domain_id, OLD.source_id, OLD.contract_version, OLD.cause, OLD.cause_detail, OLD.cause_run_id,
      OLD.cause_receipt_id, OLD.opened_by, OLD.opened_at, OLD.digest_at_opening, OLD.correlation_id)
     OR NOT ((OLD.state IN ('required', 'rejected') AND NEW.state = 'submitted') OR (OLD.state = 'submitted' AND NEW.state IN ('approved', 'rejected'))) THEN
    RAISE EXCEPTION 'requalification rejected (state): % → % is not a requalification step, and a requalification''s cause never changes', OLD.state, NEW.state USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION observation.oqr_guard() FROM PUBLIC;
CREATE TRIGGER oqr_guard BEFORE UPDATE OR DELETE ON observation.connector_requalifications FOR EACH ROW EXECUTE FUNCTION observation.oqr_guard();

REVOKE ALL ON observation.adapter_packages, observation.adapter_package_events, observation.egress_receipts, observation.egress_destination_pins,
              observation.connector_requalifications, observation.connector_requalification_events, observation.connector_credential_bindings FROM PUBLIC;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['adapter_packages', 'adapter_package_events', 'egress_receipts', 'egress_destination_pins', 'connector_requalifications',
                           'connector_requalification_events', 'connector_credential_bindings'] LOOP
    EXECUTE format('ALTER TABLE observation.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE observation.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY oqr_isolation ON observation.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON observation.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- §CR.4 THE HELPERS (internal; no runtime grant) ───────────────────────────────────────────────────────────────────────────────────────────
/* The acting principal: the bound principal and the actor the route names are one. */
CREATE OR REPLACE FUNCTION observation.cr_actor(p_noun text, p_actor uuid) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
DECLARE v uuid := public.eye_principal();
BEGIN
  IF v IS NULL OR p_actor IS NULL OR p_actor IS DISTINCT FROM v THEN
    RAISE EXCEPTION '% rejected (actor): the act is recorded under the acting principal, never on behalf of another', p_noun USING ERRCODE = '42501';
  END IF;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION observation.cr_actor(text, uuid) FROM PUBLIC;

/* A named human holding one of p_roles here (governance.assert_approver: never an agent; never the proposer) — and NEVER an external
   collaborator of the domain, whatever else they hold (D12: a partner's people neither register nor approve a package nor requalify one). */
CREATE OR REPLACE FUNCTION observation.cr_assert_person(p_noun text, p_actor uuid, p_tenant uuid, p_domain uuid, p_roles text[], p_proposer uuid, p_what text) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = observation, governance, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM governance.assert_approver(p_noun, p_actor, p_tenant, p_domain, p_roles, p_proposer, NULL, p_what);
  IF governance.holds_role(p_actor, p_tenant, p_domain, ARRAY['external_collaborator']) THEN
    RAISE EXCEPTION '% rejected (authority): % is never the act of an external collaborator (the adapter''s author or a partner''s person)', p_noun, p_what USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION observation.cr_assert_person(text, uuid, uuid, uuid, text[], uuid, text) FROM PUBLIC;

/* The agent of THIS source: the acting principal is the active collection agent registered for the source (the cell's run acts as it). */
CREATE OR REPLACE FUNCTION observation.cr_assert_source_agent(p_noun text, p_tenant uuid, p_domain uuid, p_source uuid) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
DECLARE v uuid := public.eye_principal();
BEGIN
  IF v IS NULL OR NOT EXISTS (SELECT 1 FROM observation.agents a WHERE a.principal_id = v AND a.source_id = p_source AND a.tenant_id = p_tenant
                                                                   AND a.domain_id = p_domain AND a.status = 'active') THEN
    RAISE EXCEPTION '% rejected (actor): only the active collection agent of source % records this — the cell''s own run, under its lease', p_noun, coalesce(p_source::text, '<none>') USING ERRCODE = '42501';
  END IF;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION observation.cr_assert_source_agent(text, uuid, uuid, uuid) FROM PUBLIC;

/* The run that holds the source's lease now (0051) — the run a cell's receipts and suspension belong to; refused otherwise. */
CREATE OR REPLACE FUNCTION observation.cr_assert_lease(p_noun text, p_tenant uuid, p_domain uuid, p_source uuid, p_cv int, p_run uuid) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
BEGIN
  IF p_run IS NULL OR NOT EXISTS (SELECT 1 FROM observation.source_run_leases l WHERE l.source_id = p_source AND l.run_id = p_run AND l.tenant_id = p_tenant
                                                                                 AND l.domain_id = p_domain AND l.contract_version = p_cv) THEN
    RAISE EXCEPTION '% rejected (held): run % does not hold the run lease of source % v% — a cell records only for the run it serves, while that run holds the lease',
      p_noun, coalesce(p_run::text, '<none>'), coalesce(p_source::text, '<none>'), coalesce(p_cv::text, '<none>') USING ERRCODE = '23514';
  END IF;
END $$;
REVOKE ALL ON FUNCTION observation.cr_assert_lease(text, uuid, uuid, uuid, int, uuid) FROM PUBLIC;

/* The package digest the SDK defines (@eye/connector-sdk packageDigest): sha256 over "<file>\0<sha256>\n" for the files sorted by name. */
CREATE OR REPLACE FUNCTION observation.cr_package_digest(p_files jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  -- built as bytea: a text value cannot hold the NUL separator
  SELECT encode(sha256(coalesce(string_agg(convert_to(f ->> 'file', 'UTF8') || '\x00'::bytea || convert_to((f ->> 'sha256') || chr(10), 'UTF8'), ''::bytea
                                           ORDER BY convert_to(f ->> 'file', 'UTF8')), ''::bytea)), 'hex')
    FROM jsonb_array_elements(p_files) f
$$;
REVOKE ALL ON FUNCTION observation.cr_package_digest(jsonb) FROM PUBLIC;

/* The package IN FORCE for one adapter contract version: the package of its latest APPROVED requalification, else the one its contract
   binds (SRC@v4 `adapter`). NULL for a contract of another kind. */
CREATE OR REPLACE FUNCTION observation.cr_package_in_force(p_tenant uuid, p_domain uuid, p_source uuid, p_cv int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
DECLARE c record; q record;
BEGIN
  SELECT s.connector_kind, s.contract -> 'adapter' AS ad INTO c FROM observation.source_contracts_current s
   WHERE s.source_id = p_source AND s.contract_version = p_cv AND s.tenant_id = p_tenant AND s.domain_id = p_domain;
  IF NOT FOUND OR c.connector_kind <> 'adapter' THEN RETURN NULL; END IF;
  SELECT r.requalification_id, r.package_id, r.package_version, r.package_digest INTO q FROM observation.connector_requalifications r
   WHERE r.source_id = p_source AND r.contract_version = p_cv AND r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.state = 'approved' AND r.package_id IS NOT NULL
   ORDER BY r.decided_at DESC, r.requalification_id DESC LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('package_id', q.package_id, 'version', q.package_version, 'digest', q.package_digest, 'via', 'requalification', 'requalification_id', q.requalification_id);
  END IF;
  RETURN jsonb_build_object('package_id', c.ad ->> 'package_id', 'version', c.ad ->> 'version', 'digest', c.ad ->> 'digest', 'via', 'contract', 'requalification_id', NULL);
END $$;
REVOKE ALL ON FUNCTION observation.cr_package_in_force(uuid, uuid, uuid, int) FROM PUBLIC;

/* Why a package in force cannot run (NULL: it can): unknown in this domain, not approved, or not the version / digest bound. */
CREATE OR REPLACE FUNCTION observation.cr_package_problem(p_tenant uuid, p_domain uuid, p_in_force jsonb) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
DECLARE p observation.adapter_packages%ROWTYPE;
BEGIN
  IF p_in_force IS NULL OR p_in_force ->> 'package_id' IS NULL THEN RETURN 'the contract binds no adapter package'; END IF;
  SELECT * INTO p FROM observation.adapter_packages x WHERE x.package_id = (p_in_force ->> 'package_id')::uuid AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RETURN format('adapter package %s is not registered in this domain', p_in_force ->> 'package_id'); END IF;
  IF p.state <> 'approved' THEN RETURN format('adapter package %s %s is %s, not approved by a second person', p.name, p.version, p.state); END IF;
  IF p.package_digest IS DISTINCT FROM p_in_force ->> 'digest' OR p.version IS DISTINCT FROM p_in_force ->> 'version' THEN
    RETURN format('adapter package %s is %s with digest %s, not the %s / %s the contract binds', p.package_id, p.version, p.package_digest, p_in_force ->> 'version', p_in_force ->> 'digest');
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION observation.cr_package_problem(uuid, uuid, jsonb) FROM PUBLIC;

/* The open requalification of a contract version (required, submitted or rejected — not yet approved), or NULL. */
CREATE OR REPLACE FUNCTION observation.cr_open_requalification(p_source uuid, p_cv int) RETURNS observation.connector_requalifications
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
  SELECT r.* FROM observation.connector_requalifications r
   WHERE r.source_id = p_source AND r.contract_version = p_cv AND r.state IN ('required', 'submitted', 'rejected') LIMIT 1
$$;
REVOKE ALL ON FUNCTION observation.cr_open_requalification(uuid, int) FROM PUBLIC;

CREATE OR REPLACE FUNCTION observation.cr_package_json(p observation.adapter_packages) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = observation, graph, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN p.package_id IS NULL THEN NULL ELSE jsonb_build_object(
    'package_id', p.package_id, 'name', p.name, 'version', p.version, 'package_digest', p.package_digest, 'manifest', p.manifest, 'files', p.files,
    'byte_length', p.byte_length, 'author', p.author, 'protocol', p.protocol, 'sdk_version', p.sdk_version, 'state', p.state,
    'registered_by', p.registered_by, 'registered_at', graph.pv_iso(p.registered_at), 'decided_by', p.decided_by, 'decided_at', graph.pv_iso(p.decided_at),
    'decision_reason', p.decision_reason) END
$$;
REVOKE ALL ON FUNCTION observation.cr_package_json(observation.adapter_packages) FROM PUBLIC;

CREATE OR REPLACE FUNCTION observation.cr_requalification_json(r observation.connector_requalifications) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = observation, graph, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN r.requalification_id IS NULL THEN NULL ELSE jsonb_build_object(
    'requalification_id', r.requalification_id, 'source_id', r.source_id, 'contract_version', r.contract_version, 'cause', r.cause, 'cause_detail', r.cause_detail,
    'cause_run_id', r.cause_run_id, 'cause_receipt_id', r.cause_receipt_id, 'opened_by', r.opened_by, 'opened_at', graph.pv_iso(r.opened_at),
    'digest_at_opening', r.digest_at_opening, 'state', r.state, 'package_id', r.package_id, 'package_version', r.package_version, 'package_digest', r.package_digest,
    'contract_tests', r.contract_tests, 'submitted_by', r.submitted_by, 'submitted_at', graph.pv_iso(r.submitted_at), 'submit_reason', r.submit_reason,
    'decided_by', r.decided_by, 'decided_at', graph.pv_iso(r.decided_at), 'decision_reason', r.decision_reason) END
$$;
REVOKE ALL ON FUNCTION observation.cr_requalification_json(observation.connector_requalifications) FROM PUBLIC;

/* Suspend an ACTIVE contract version (the 0022 transition's effect and event, inline: the port that calls this holds its own action) and
   open — or rejoin — its requalification. Cursor, checkpoint and custody are not touched; the schedule stays and a scheduled run is cancelled
   at its pre-egress revalidation (the contract is not active), exactly as for a rights withdrawal on 0022's path. */
CREATE OR REPLACE FUNCTION observation.cr_suspend_and_open(p_tenant uuid, p_domain uuid, p_source uuid, p_cv int, p_actor uuid, p_cause text, p_detail text,
                                                          p_run uuid, p_receipt uuid, p_digest text, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
DECLARE v_row observation.source_contracts_current%ROWTYPE; r observation.connector_requalifications%ROWTYPE; v_suspended boolean := false; v_new boolean := false;
BEGIN
  SELECT * INTO v_row FROM observation.source_contracts_current WHERE source_id = p_source AND contract_version = p_cv AND tenant_id = p_tenant AND domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'connector suspension rejected (unknown_source): source % v% is not recorded in this domain', coalesce(p_source::text, '<none>'), coalesce(p_cv::text, '<none>') USING ERRCODE = '23503';
  END IF;
  IF v_row.lifecycle_state = 'active' THEN
    UPDATE observation.source_contracts_current SET lifecycle_state = 'suspended', updated_at = clock_timestamp()
     WHERE source_id = p_source AND contract_version = p_cv;
    INSERT INTO observation.source_contract_events (event_id, scope, tenant_id, domain_id, source_id, contract_version, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_source, p_cv, 'contract.suspended', p_actor,
            jsonb_build_object('from', 'active', 'to', 'suspended', 'reason', p_detail, 'cause', p_cause, 'run_id', p_run, 'receipt_id', p_receipt,
                               'kind', 'connector_requalification', 'cursor_and_custody', 'unchanged'), p_correlation);
    v_suspended := true;
  END IF;
  r := observation.cr_open_requalification(p_source, p_cv);
  IF r.requalification_id IS NULL THEN
    INSERT INTO observation.connector_requalifications (requalification_id, scope, tenant_id, domain_id, source_id, contract_version, cause, cause_detail, cause_run_id,
                                                        cause_receipt_id, opened_by, digest_at_opening, state, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_source, p_cv, p_cause, left(btrim(p_detail), 1000), p_run, p_receipt, p_actor, p_digest, 'required', p_correlation)
    RETURNING * INTO r;
    v_new := true;
  END IF;
  INSERT INTO observation.connector_requalification_events (event_id, scope, tenant_id, domain_id, requalification_id, event, actor, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, r.requalification_id, 'requalification.required', p_actor,
          jsonb_build_object('cause', p_cause, 'detail', left(btrim(p_detail), 1000), 'run_id', p_run, 'receipt_id', p_receipt, 'suspended', v_suspended, 'joined_open', NOT v_new), p_correlation);
  INSERT INTO observation.source_contract_events (event_id, scope, tenant_id, domain_id, source_id, contract_version, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_source, p_cv, 'contract.requalification_required', p_actor,
          jsonb_build_object('requalification_id', r.requalification_id, 'cause', p_cause, 'detail', left(btrim(p_detail), 1000), 'run_id', p_run, 'receipt_id', p_receipt), p_correlation);
  RETURN jsonb_build_object('requalification', observation.cr_requalification_json(r), 'suspended', v_suspended,
                            'contract_state', CASE WHEN v_suspended THEN 'suspended' ELSE v_row.lifecycle_state END, 'opened', v_new);
END $$;
REVOKE ALL ON FUNCTION observation.cr_suspend_and_open(uuid, uuid, uuid, int, uuid, text, text, uuid, uuid, text, uuid) FROM PUBLIC;

-- §CR.5 THE PACKAGE PORTS ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* REGISTER: a named collection manager registers a package — its manifest (the package's own adapter.json, parsed by the API from the
   bytes it stores) and its files (name, sha256, byte length, the vault locator). The digest is RECOMPUTED here from the files; the manifest
   is checked (name, semver, an .mjs entry among the files, at least one declared destination host, purposes, data classes, the protocol). */
CREATE OR REPLACE FUNCTION observation.register_adapter_package(
  p_request_id uuid, p_tenant uuid, p_domain uuid, p_manifest jsonb, p_files jsonb, p_package_digest text, p_protocol text, p_sdk_version text,
  p_actor uuid, p_correlation uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; p observation.adapter_packages%ROWTYPE; v_digest text; v_name text; v_version text; v_entry text; v_bytes bigint;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.adapter.register']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := observation.cr_actor('adapter package', p_actor);
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'adapter package rejected (request): a registration carries its request id (the command identity a retry reuses)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO p FROM observation.adapter_packages x WHERE x.request_id = p_request_id;
  IF FOUND THEN
    IF p.registered_by IS DISTINCT FROM v_actor OR p.package_digest IS DISTINCT FROM p_package_digest OR p.tenant_id <> p_tenant OR p.domain_id <> p_domain THEN
      RAISE EXCEPTION 'adapter package rejected (duplicate): request % already registered another package; a new registration takes a new request id', p_request_id USING ERRCODE = '23505';
    END IF;
    RETURN observation.cr_package_json(p) || jsonb_build_object('replayed', true);
  END IF;
  PERFORM observation.cr_assert_person('adapter package', v_actor, p_tenant, p_domain, ARRAY['collection_manager'], NULL, 'registering an adapter package');
  IF p_manifest IS NULL OR jsonb_typeof(p_manifest) <> 'object' THEN
    RAISE EXCEPTION 'adapter package rejected (manifest): the package carries its manifest (adapter.json) as an object' USING ERRCODE = '22023';
  END IF;
  v_name := p_manifest ->> 'name'; v_version := p_manifest ->> 'version'; v_entry := p_manifest ->> 'entry';
  IF v_name IS NULL OR v_name !~ '^[a-z0-9][a-z0-9-]{1,63}$' THEN
    RAISE EXCEPTION 'adapter package rejected (manifest): name is 2 to 64 lower-case letters, digits and hyphens' USING ERRCODE = '22023';
  END IF;
  IF v_version IS NULL OR v_version !~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?$' THEN
    RAISE EXCEPTION 'adapter package rejected (manifest): version is a semantic version (major.minor.patch)' USING ERRCODE = '22023';
  END IF;
  IF p_files IS NULL OR jsonb_typeof(p_files) <> 'array' OR jsonb_array_length(p_files) NOT BETWEEN 1 AND 64
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_files) f WHERE jsonb_typeof(f) <> 'object' OR coalesce(f ->> 'file', '') !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'
                  OR coalesce(f ->> 'sha256', '') !~ '^[0-9a-f]{64}$' OR coalesce(f ->> 'locator', '') = '' OR (f ->> 'byte_length') IS NULL OR (f ->> 'byte_length')::bigint < 1)
     OR (SELECT count(DISTINCT f ->> 'file') FROM jsonb_array_elements(p_files) f) <> jsonb_array_length(p_files) THEN
    RAISE EXCEPTION 'adapter package rejected (files): a package is 1 to 64 files, each named once (letters, digits, dot, underscore, hyphen; no directory), with its sha256, byte length and vault locator' USING ERRCODE = '22023';
  END IF;
  IF v_entry IS NULL OR v_entry !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.mjs$' OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_files) f WHERE f ->> 'file' = v_entry) THEN
    RAISE EXCEPTION 'adapter package rejected (manifest): entry names an .mjs file of the package (the module the cell imports)' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_files) f WHERE f ->> 'file' = 'adapter.json') THEN
    RAISE EXCEPTION 'adapter package rejected (manifest): the package carries its manifest as adapter.json' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_manifest -> 'declared_destinations') <> 'array' OR jsonb_array_length(p_manifest -> 'declared_destinations') NOT BETWEEN 1 AND 32
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_manifest -> 'declared_destinations') d WHERE jsonb_typeof(d) <> 'string'
                  OR (d #>> '{}') !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$') THEN
    RAISE EXCEPTION 'adapter package rejected (destinations): declared_destinations names 1 to 32 host names (lower case, no scheme, no port) — the only hosts the package may ask the gateway for' USING ERRCODE = '22023';
  END IF;
  IF observation.rt_list_problem(p_manifest -> 'purposes', 'purposes', 1) IS NOT NULL OR observation.rt_list_problem(p_manifest -> 'data_classes', 'data classes', 1) IS NOT NULL THEN
    RAISE EXCEPTION 'adapter package rejected (manifest): purposes and data_classes each name 1 to 20 short statements (what the package collects, and for what)' USING ERRCODE = '22023';
  END IF;
  IF coalesce(btrim(p_manifest ->> 'author'), '') = '' OR length(p_manifest ->> 'author') > 256 THEN
    RAISE EXCEPTION 'adapter package rejected (manifest): author names who wrote the package (2 to 256 characters)' USING ERRCODE = '22023';
  END IF;
  IF p_protocol IS NULL OR p_manifest ->> 'protocol' IS DISTINCT FROM p_protocol THEN
    RAISE EXCEPTION 'adapter package rejected (protocol): the manifest speaks %, the cell speaks % — a package is registered for the cell protocol it runs under',
      coalesce(p_manifest ->> 'protocol', '<none>'), coalesce(p_protocol, '<none>') USING ERRCODE = '22023';
  END IF;
  v_digest := observation.cr_package_digest(p_files);
  IF p_package_digest IS DISTINCT FROM v_digest THEN
    RAISE EXCEPTION 'adapter package rejected (digest): the files digest to %, not the % presented', v_digest, coalesce(p_package_digest, '<none>') USING ERRCODE = '22023';
  END IF;
  SELECT sum((f ->> 'byte_length')::bigint) INTO v_bytes FROM jsonb_array_elements(p_files) f;
  IF EXISTS (SELECT 1 FROM observation.adapter_packages x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.name = v_name AND x.version = v_version) THEN
    RAISE EXCEPTION 'adapter package rejected (duplicate): % % is already registered in this domain; a change is a new version', v_name, v_version USING ERRCODE = '23505';
  END IF;
  INSERT INTO observation.adapter_packages (package_id, scope, tenant_id, domain_id, name, version, package_digest, manifest, files, byte_length, author, protocol,
                                            sdk_version, state, registered_by, request_id, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, v_name, v_version, v_digest, p_manifest, p_files, v_bytes, btrim(p_manifest ->> 'author'), p_protocol,
          coalesce(p_sdk_version, 'unknown'), 'registered', v_actor, p_request_id, p_correlation)
  RETURNING * INTO p;
  INSERT INTO observation.adapter_package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p.package_id, 'adapter.registered', v_actor,
          jsonb_build_object('name', v_name, 'version', v_version, 'package_digest', v_digest, 'author', p.author, 'declared_destinations', p_manifest -> 'declared_destinations'), p_correlation);
  RETURN observation.cr_package_json(p) || jsonb_build_object('replayed', false);
END $$;
REVOKE ALL ON FUNCTION observation.register_adapter_package(uuid, uuid, uuid, jsonb, jsonb, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.register_adapter_package(uuid, uuid, uuid, jsonb, jsonb, text, text, text, uuid, uuid) TO eye_commit;

/* DECIDE: a SECOND person — a domain admin or another collection manager, never the registrant, never an agent, never an external
   collaborator — approves or rejects a registered package, once, with a reason. The decision BINDS the digest the decider reviewed
   (p_expected_digest): a package is decided only as the bytes that were shown (server-enforced; a package's digest never changes, and a
   decision naming another digest is refused stale). */
CREATE OR REPLACE FUNCTION observation.decide_adapter_package(
  p_request_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_decision text, p_reason text, p_expected_digest text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; p observation.adapter_packages%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.adapter.approve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := observation.cr_actor('adapter package', p_actor);
  IF p_decision IS NULL OR p_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'adapter package rejected (decision): the decision is approve or reject' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO p FROM observation.adapter_packages x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'adapter package rejected (unknown_package): package % is not registered in this domain', coalesce(p_package_id::text, '<none>') USING ERRCODE = '23503';
  END IF;
  PERFORM observation.cr_assert_person('adapter package', v_actor, p_tenant, p_domain, ARRAY['domain_admin', 'collection_manager'], p.registered_by,
                                       'deciding an adapter package (a second person: never its registrant)');
  IF p.state <> 'registered' THEN
    IF p.decided_by = v_actor AND p.state = (CASE p_decision WHEN 'approve' THEN 'approved' ELSE 'rejected' END)
       AND EXISTS (SELECT 1 FROM observation.adapter_package_events e WHERE e.package_id = p.package_id AND e.details ->> 'request_id' = p_request_id::text) THEN
      RETURN observation.cr_package_json(p) || jsonb_build_object('replayed', true);
    END IF;
    RAISE EXCEPTION 'adapter package rejected (state): % % is % since %; a decision is taken once (a change is a new version)', p.name, p.version, p.state, graph.pv_iso(p.decided_at) USING ERRCODE = '23514';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'adapter package rejected (reason): a decision states its reason in 8 to 2000 characters (what was reviewed)' USING ERRCODE = '22023';
  END IF;
  IF p_expected_digest IS DISTINCT FROM p.package_digest THEN
    RAISE EXCEPTION 'adapter package rejected (stale): % % digests to %; the decision reviewed %', p.name, p.version, p.package_digest, coalesce(p_expected_digest, 'no digest') USING ERRCODE = '23514';
  END IF;
  UPDATE observation.adapter_packages SET state = CASE p_decision WHEN 'approve' THEN 'approved' ELSE 'rejected' END, decided_by = v_actor, decided_at = clock_timestamp(),
         decision_reason = btrim(p_reason)
   WHERE package_id = p.package_id RETURNING * INTO p;
  INSERT INTO observation.adapter_package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p.package_id, CASE p_decision WHEN 'approve' THEN 'adapter.approved' ELSE 'adapter.rejected' END, v_actor,
          jsonb_build_object('reason', p.decision_reason, 'registered_by', p.registered_by, 'package_digest', p.package_digest, 'request_id', p_request_id), p_correlation);
  RETURN observation.cr_package_json(p) || jsonb_build_object('replayed', false);
END $$;
REVOKE ALL ON FUNCTION observation.decide_adapter_package(uuid, uuid, uuid, uuid, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.decide_adapter_package(uuid, uuid, uuid, uuid, text, text, text, uuid, uuid) TO eye_commit;

-- §CR.6 THE RUN'S READ, THE RECEIPTS AND THE SUSPENSION (the cell's own agent, under its lease) ───────────────────────────────────────────
/* What one run of an adapter contract may do: the contract (its kind, mode, registered destination hosts, purposes, declared pins, its
   credential reference), the package IN FORCE (the row, its files and locators — the bytes are read and re-verified by the API), the
   credential binding in force, the open requalification, the recorded pins. Read under observation.adapter.load (the source's agent and
   the managers); the read scope asserted. */
CREATE OR REPLACE FUNCTION observation.connector_cell_binding(p_tenant uuid, p_domain uuid, p_source uuid, p_cv int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = observation, graph, pg_catalog, pg_temp AS $$
DECLARE c observation.source_contracts_current%ROWTYPE; v_force jsonb; p observation.adapter_packages%ROWTYPE; b observation.connector_credential_bindings%ROWTYPE;
        q observation.connector_requalifications%ROWTYPE;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the connector cell''s binding of a source');
  SELECT * INTO c FROM observation.source_contracts_current x WHERE x.source_id = p_source AND x.contract_version = p_cv AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'connector cell rejected (unknown_source): source % v% is not recorded in this domain', coalesce(p_source::text, '<none>'), coalesce(p_cv::text, '<none>') USING ERRCODE = '23503';
  END IF;
  v_force := observation.cr_package_in_force(p_tenant, p_domain, p_source, p_cv);
  IF v_force IS NOT NULL AND v_force ->> 'package_id' IS NOT NULL THEN
    SELECT * INTO p FROM observation.adapter_packages x WHERE x.package_id = (v_force ->> 'package_id')::uuid AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  END IF;
  SELECT * INTO b FROM observation.connector_credential_bindings x WHERE x.source_id = p_source AND x.contract_version = p_cv AND x.state = 'in_force';
  q := observation.cr_open_requalification(p_source, p_cv);
  RETURN jsonb_build_object(
    'source_id', c.source_id, 'contract_version', c.contract_version, 'source_key', c.source_key, 'connector_kind', c.connector_kind,
    'acquisition_mode', c.acquisition_mode, 'lifecycle_state', c.lifecycle_state, 'rights_state', c.rights_state,
    'replay_set', coalesce(c.contract #>> '{security_and_operations,replay_set}', c.source_key),
    'lease', (SELECT jsonb_build_object('run_id', l.run_id, 'contract_version', l.contract_version, 'acquired_at', graph.pv_iso(l.acquired_at))
                FROM observation.source_run_leases l WHERE l.source_id = p_source AND l.tenant_id = p_tenant AND l.domain_id = p_domain),
    'endpoints', coalesce(c.contract #> '{identity,endpoints}', '[]'::jsonb), 'purposes', coalesce(c.contract #> '{authority_and_rights,purposes}', '[]'::jsonb),
    'classification_ceiling', c.classification_ceiling, 'declared_pins', coalesce(c.contract #> '{authenticity,tls_spki_pins}', '[]'::jsonb),
    'contract_credential', CASE WHEN c.contract #>> '{security_and_operations,credential_ref}' IS NULL THEN NULL
                                ELSE jsonb_build_object('ref', c.contract #>> '{security_and_operations,credential_ref}',
                                                        'header', coalesce(c.contract #>> '{security_and_operations,credential_header}', 'authorization')) END,
    'package_in_force', v_force, 'package', observation.cr_package_json(p), 'package_problem', CASE WHEN v_force IS NULL THEN NULL ELSE observation.cr_package_problem(p_tenant, p_domain, v_force) END,
    'credential_binding', CASE WHEN b.source_id IS NULL THEN NULL ELSE jsonb_build_object('binding_version', b.binding_version, 'ref', b.credential_ref, 'header', b.credential_header) END,
    'open_requalification', observation.cr_requalification_json(q),
    'pins', (SELECT coalesce(jsonb_agg(jsonb_build_object('host', x.host, 'tls_spki_sha256', x.tls_spki_sha256, 'addresses', x.addresses, 'first_receipt_id', x.first_receipt_id,
                                                          'pinned_at', graph.pv_iso(x.pinned_at)) ORDER BY x.host), '[]'::jsonb)
               FROM observation.egress_destination_pins x WHERE x.source_id = p_source AND x.contract_version = p_cv AND x.tenant_id = p_tenant AND x.domain_id = p_domain));
END $$;
REVOKE ALL ON FUNCTION observation.connector_cell_binding(uuid, uuid, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.connector_cell_binding(uuid, uuid, uuid, int) TO eye_app, eye_commit;

/* THE RECEIPTS of one run, written by the source's active agent while the run holds the source's lease; a live allowed answer whose host
   has no pin yet pins the identity it presented (first use). The receipts are written whole or not at all. */
CREATE OR REPLACE FUNCTION observation.record_egress_receipts(p_tenant uuid, p_domain uuid, p_source uuid, p_cv int, p_run uuid, p_receipts jsonb, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
DECLARE x jsonb; v_n int := 0; v_pins int := 0; v_id uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.egress.record']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM observation.cr_assert_source_agent('egress receipt', p_tenant, p_domain, p_source);
  PERFORM observation.cr_assert_lease('egress receipt', p_tenant, p_domain, p_source, p_cv, p_run);
  IF p_receipts IS NULL OR jsonb_typeof(p_receipts) <> 'array' OR jsonb_array_length(p_receipts) > 10000 THEN
    RAISE EXCEPTION 'egress receipt rejected (request): the receipts are a list of at most 10000' USING ERRCODE = '22023';
  END IF;
  FOR x IN SELECT r FROM jsonb_array_elements(p_receipts) r LOOP
    v_id := coalesce((x ->> 'receipt_id')::uuid, gen_random_uuid());
    INSERT INTO observation.egress_receipts (receipt_id, scope, tenant_id, domain_id, source_id, contract_version, run_id, seq, package_id, package_digest, requested_at,
      method, url_redacted, host, purpose, data_class, decision, refusal_class, reason, request_digest, request_bytes, response_status, response_digest, response_bytes,
      destination, credential_injected, credential_ref, correlation_id)
    VALUES (v_id, 'DOMAIN', p_tenant, p_domain, p_source, p_cv, p_run, (x ->> 'seq')::int, (x ->> 'package_id')::uuid, x ->> 'package_digest', (x ->> 'requested_at')::timestamptz,
      x ->> 'method', x ->> 'url_redacted', x ->> 'host', x ->> 'purpose', x ->> 'data_class', x ->> 'decision', x ->> 'refusal_class', left(x ->> 'reason', 1000),
      x ->> 'request_digest', (x ->> 'request_bytes')::int, (x ->> 'response_status')::int, x ->> 'response_digest', (x ->> 'response_bytes')::bigint,
      coalesce(x -> 'destination', '{"mode": "none"}'::jsonb), coalesce((x ->> 'credential_injected')::boolean, false), x ->> 'credential_ref', p_correlation);
    v_n := v_n + 1;
    IF x ->> 'decision' = 'allowed' AND x #>> '{destination,mode}' = 'live' AND x #>> '{destination,tls_spki_sha256}' IS NOT NULL THEN
      INSERT INTO observation.egress_destination_pins (scope, tenant_id, domain_id, source_id, contract_version, host, tls_spki_sha256, addresses, first_receipt_id)
      VALUES ('DOMAIN', p_tenant, p_domain, p_source, p_cv, x ->> 'host', x #>> '{destination,tls_spki_sha256}', coalesce(x #> '{destination,addresses}', '[]'::jsonb), v_id)
      ON CONFLICT (source_id, contract_version, host) DO NOTHING;
      IF FOUND THEN v_pins := v_pins + 1; END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('recorded', v_n, 'pinned', v_pins, 'run_id', p_run);
END $$;
REVOKE ALL ON FUNCTION observation.record_egress_receipts(uuid, uuid, uuid, int, uuid, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.record_egress_receipts(uuid, uuid, uuid, int, uuid, jsonb, uuid) TO eye_commit;

/* THE SUSPENSION a cell's own run records when it failed closed for the connector's behaviour: the cause is proven by a REFUSED or BLOCKED
   receipt of THIS run (an unregistered destination, a changed identity) or names a package whose bytes did not verify; the contract is
   suspended (cursor, checkpoint, custody untouched) and its requalification opened (or joined). */
CREATE OR REPLACE FUNCTION observation.connector_suspend_for_requalification(p_tenant uuid, p_domain uuid, p_source uuid, p_cv int, p_run uuid, p_cause text, p_detail text,
                                                                           p_receipt uuid, p_digest text, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; r observation.egress_receipts%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.connector.suspend']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := observation.cr_assert_source_agent('connector suspension', p_tenant, p_domain, p_source);
  PERFORM observation.cr_assert_lease('connector suspension', p_tenant, p_domain, p_source, p_cv, p_run);
  IF p_cause IS NULL OR p_cause NOT IN ('unregistered_destination', 'destination_identity_changed', 'package_integrity') THEN
    RAISE EXCEPTION 'connector suspension rejected (cause): a cell''s run suspends its connector for an unregistered destination, a changed destination identity or a package whose bytes do not verify' USING ERRCODE = '22023';
  END IF;
  IF p_cause <> 'package_integrity' THEN
    SELECT * INTO r FROM observation.egress_receipts x WHERE x.receipt_id = p_receipt AND x.run_id = p_run AND x.source_id = p_source;
    IF NOT FOUND OR r.decision = 'allowed' OR r.refusal_class IS DISTINCT FROM p_cause THEN
      RAISE EXCEPTION 'connector suspension rejected (evidence): the suspension cites a % receipt of run % — none is recorded', p_cause, p_run USING ERRCODE = '22023';
    END IF;
  END IF;
  IF p_detail IS NULL OR length(btrim(p_detail)) < 3 THEN
    RAISE EXCEPTION 'connector suspension rejected (detail): the suspension says what the cell did' USING ERRCODE = '22023';
  END IF;
  RETURN observation.cr_suspend_and_open(p_tenant, p_domain, p_source, p_cv, v_actor, p_cause, p_detail, p_run, p_receipt, p_digest, p_correlation);
END $$;
REVOKE ALL ON FUNCTION observation.connector_suspend_for_requalification(uuid, uuid, uuid, int, uuid, text, text, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.connector_suspend_for_requalification(uuid, uuid, uuid, int, uuid, text, text, uuid, text, uuid) TO eye_commit;

-- §CR.7 REQUALIFICATION AND ROTATION (human, a second person) ─────────────────────────────────────────────────────────────────────────────
/* SUBMIT: a named collection manager submits the open requalification with the package now to be in force (approved, of the same name
   as the one in force; a NEW digest when the cause was the connector's behaviour) and the contract tests the API ran in a cell — which
   must have passed. A package whose bytes did not verify (package_integrity) or a rotated credential requalifies the same digest once the
   bytes verify again / the new reference is bound; a connector suspended for its OWN behaviour needs a new digest. */
CREATE OR REPLACE FUNCTION observation.submit_requalification(p_request_id uuid, p_tenant uuid, p_domain uuid, p_requalification_id uuid, p_package_id uuid,
                                                             p_contract_tests jsonb, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; r observation.connector_requalifications%ROWTYPE; p observation.adapter_packages%ROWTYPE; v_force jsonb; cur observation.adapter_packages%ROWTYPE;
        v_kind text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.connector.requalification.submit']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := observation.cr_actor('requalification', p_actor);
  IF p_request_id IS NOT NULL AND EXISTS (SELECT 1 FROM observation.connector_requalification_events e WHERE e.request_id = p_request_id) THEN
    SELECT r2.* INTO r FROM observation.connector_requalifications r2 JOIN observation.connector_requalification_events e ON e.requalification_id = r2.requalification_id
     WHERE e.request_id = p_request_id;
    IF r.requalification_id IS DISTINCT FROM p_requalification_id OR r.submitted_by IS DISTINCT FROM v_actor THEN
      RAISE EXCEPTION 'requalification rejected (duplicate): request % already recorded another act', p_request_id USING ERRCODE = '23505';
    END IF;
    RETURN observation.cr_requalification_json(r) || jsonb_build_object('replayed', true);
  END IF;
  PERFORM observation.cr_assert_person('requalification', v_actor, p_tenant, p_domain, ARRAY['collection_manager'], NULL, 'submitting a connector''s requalification');
  SELECT * INTO r FROM observation.connector_requalifications x WHERE x.requalification_id = p_requalification_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'requalification rejected (unknown_requalification): requalification % is not recorded in this domain', coalesce(p_requalification_id::text, '<none>') USING ERRCODE = '23503';
  END IF;
  IF r.state NOT IN ('required', 'rejected') THEN
    RAISE EXCEPTION 'requalification rejected (state): requalification % is %; only a required or rejected one is submitted', r.requalification_id, r.state USING ERRCODE = '23514';
  END IF;
  SELECT s.connector_kind INTO v_kind FROM observation.source_contracts_current s WHERE s.source_id = r.source_id AND s.contract_version = r.contract_version;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'requalification rejected (reason): a submission states what changed in 8 to 2000 characters' USING ERRCODE = '22023';
  END IF;
  IF p_contract_tests IS NULL OR jsonb_typeof(p_contract_tests) <> 'object' OR p_contract_tests ->> 'outcome' IS DISTINCT FROM 'pass' THEN
    RAISE EXCEPTION 'requalification rejected (contract_tests): the contract tests the API ran in a cell did not pass (%); the package is not submitted', coalesce(p_contract_tests ->> 'summary', p_contract_tests ->> 'outcome', 'not run') USING ERRCODE = '22023';
  END IF;
  IF v_kind = 'adapter' THEN
    SELECT * INTO p FROM observation.adapter_packages x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'requalification rejected (unknown_package): package % is not registered in this domain', coalesce(p_package_id::text, '<none>') USING ERRCODE = '23503';
    END IF;
    IF p.state <> 'approved' THEN
      RAISE EXCEPTION 'requalification rejected (package): % % is %; a requalification submits an approved package (a second person reviewed its code)', p.name, p.version, p.state USING ERRCODE = '22023';
    END IF;
    v_force := observation.cr_package_in_force(p_tenant, p_domain, r.source_id, r.contract_version);
    SELECT * INTO cur FROM observation.adapter_packages x WHERE x.package_id = (v_force ->> 'package_id')::uuid;
    IF cur.package_id IS NOT NULL AND cur.name <> p.name THEN
      RAISE EXCEPTION 'requalification rejected (package): the contract runs %; a requalification moves it to another version of the same package, not to %', cur.name, p.name USING ERRCODE = '22023';
    END IF;
    IF r.cause IN ('unregistered_destination', 'destination_identity_changed') AND p.package_digest = r.digest_at_opening THEN
      RAISE EXCEPTION 'requalification rejected (package): the connector was suspended for its own behaviour (%); the same package digest % cannot requalify it — a new digest is required', r.cause, p.package_digest USING ERRCODE = '22023';
    END IF;
  ELSIF p_package_id IS NOT NULL THEN
    RAISE EXCEPTION 'requalification rejected (package): only an adapter contract binds a package' USING ERRCODE = '22023';
  END IF;
  UPDATE observation.connector_requalifications SET state = 'submitted', package_id = p.package_id, package_version = p.version, package_digest = p.package_digest,
         contract_tests = p_contract_tests, submitted_by = v_actor, submitted_at = clock_timestamp(), submit_reason = btrim(p_reason),
         decided_by = NULL, decided_at = NULL, decision_reason = NULL
   WHERE requalification_id = r.requalification_id RETURNING * INTO r;
  INSERT INTO observation.connector_requalification_events (event_id, scope, tenant_id, domain_id, requalification_id, event, actor, details, request_id, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, r.requalification_id, 'requalification.submitted', v_actor,
          jsonb_build_object('package_id', r.package_id, 'package_version', r.package_version, 'package_digest', r.package_digest, 'contract_tests', p_contract_tests,
                             'reason', r.submit_reason), p_request_id, p_correlation);
  RETURN observation.cr_requalification_json(r) || jsonb_build_object('replayed', false);
END $$;
REVOKE ALL ON FUNCTION observation.submit_requalification(uuid, uuid, uuid, uuid, uuid, jsonb, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.submit_requalification(uuid, uuid, uuid, uuid, uuid, jsonb, text, uuid, uuid) TO eye_commit;

/* DECIDE: a SECOND person — a domain admin or a collection manager, never the submitter, never an agent, never an external collaborator —
   approves (the contract records contract.requalified; the package becomes the one in force) or rejects (it may be submitted again). The
   decision BINDS the package digest the decider reviewed (server-enforced: a resubmission with another package makes it stale). */
CREATE OR REPLACE FUNCTION observation.decide_requalification(p_request_id uuid, p_tenant uuid, p_domain uuid, p_requalification_id uuid, p_decision text, p_reason text,
                                                             p_expected_digest text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; r observation.connector_requalifications%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.connector.requalification.approve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := observation.cr_actor('requalification', p_actor);
  IF p_decision IS NULL OR p_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'requalification rejected (decision): the decision is approve or reject' USING ERRCODE = '22023';
  END IF;
  IF p_request_id IS NOT NULL AND EXISTS (SELECT 1 FROM observation.connector_requalification_events e WHERE e.request_id = p_request_id) THEN
    SELECT r2.* INTO r FROM observation.connector_requalifications r2 JOIN observation.connector_requalification_events e ON e.requalification_id = r2.requalification_id
     WHERE e.request_id = p_request_id;
    IF r.requalification_id IS DISTINCT FROM p_requalification_id OR r.decided_by IS DISTINCT FROM v_actor THEN
      RAISE EXCEPTION 'requalification rejected (duplicate): request % already recorded another act', p_request_id USING ERRCODE = '23505';
    END IF;
    RETURN observation.cr_requalification_json(r) || jsonb_build_object('replayed', true);
  END IF;
  SELECT * INTO r FROM observation.connector_requalifications x WHERE x.requalification_id = p_requalification_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'requalification rejected (unknown_requalification): requalification % is not recorded in this domain', coalesce(p_requalification_id::text, '<none>') USING ERRCODE = '23503';
  END IF;
  PERFORM observation.cr_assert_person('requalification', v_actor, p_tenant, p_domain, ARRAY['domain_admin', 'collection_manager'], r.submitted_by,
                                       'deciding a connector''s requalification (a second person: never its submitter)');
  IF r.state <> 'submitted' THEN
    RAISE EXCEPTION 'requalification rejected (state): requalification % is %; only a submitted one is decided', r.requalification_id, r.state USING ERRCODE = '23514';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'requalification rejected (reason): a decision states its reason in 8 to 2000 characters (what was reviewed)' USING ERRCODE = '22023';
  END IF;
  IF p_expected_digest IS DISTINCT FROM r.package_digest THEN
    RAISE EXCEPTION 'requalification rejected (stale): requalification % submits package digest %; the decision reviewed %', r.requalification_id, coalesce(r.package_digest, 'none'),
      coalesce(p_expected_digest, 'no digest') USING ERRCODE = '23514';
  END IF;
  UPDATE observation.connector_requalifications SET state = CASE p_decision WHEN 'approve' THEN 'approved' ELSE 'rejected' END, decided_by = v_actor,
         decided_at = clock_timestamp(), decision_reason = btrim(p_reason)
   WHERE requalification_id = r.requalification_id RETURNING * INTO r;
  INSERT INTO observation.connector_requalification_events (event_id, scope, tenant_id, domain_id, requalification_id, event, actor, details, request_id, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, r.requalification_id, CASE p_decision WHEN 'approve' THEN 'requalification.approved' ELSE 'requalification.rejected' END,
          v_actor, jsonb_build_object('reason', r.decision_reason, 'submitted_by', r.submitted_by, 'package_digest', r.package_digest), p_request_id, p_correlation);
  IF p_decision = 'approve' THEN
    INSERT INTO observation.source_contract_events (event_id, scope, tenant_id, domain_id, source_id, contract_version, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, r.source_id, r.contract_version, 'contract.requalified', v_actor,
            jsonb_build_object('requalification_id', r.requalification_id, 'cause', r.cause, 'package_id', r.package_id, 'package_version', r.package_version,
                               'package_digest', r.package_digest, 'submitted_by', r.submitted_by, 'reason', r.decision_reason), p_correlation);
  END IF;
  RETURN observation.cr_requalification_json(r) || jsonb_build_object('replayed', false);
END $$;
REVOKE ALL ON FUNCTION observation.decide_requalification(uuid, uuid, uuid, uuid, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.decide_requalification(uuid, uuid, uuid, uuid, text, text, text, uuid, uuid) TO eye_commit;

/* ROTATE: a named collection manager binds a NEW credential reference to an adapter contract version (the next binding version), the one
   in force is revoked, `contract.credential_rotated` is recorded, the contract is suspended and its requalification opened (or joined). The
   gateway injects only the binding in force; the value is never written anywhere. */
CREATE OR REPLACE FUNCTION observation.rotate_connector_credential(p_request_id uuid, p_tenant uuid, p_domain uuid, p_source uuid, p_cv int, p_ref text, p_header text,
                                                                  p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; c observation.source_contracts_current%ROWTYPE; prev observation.connector_credential_bindings%ROWTYPE; b observation.connector_credential_bindings%ROWTYPE;
        v_version int; v_out jsonb; v_force jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.connector.credential.rotate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := observation.cr_actor('credential rotation', p_actor);
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'credential rotation rejected (request): a rotation carries its request id' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO b FROM observation.connector_credential_bindings x WHERE x.request_id = p_request_id;
  IF FOUND THEN
    IF b.bound_by IS DISTINCT FROM v_actor OR b.source_id IS DISTINCT FROM p_source OR b.contract_version IS DISTINCT FROM p_cv OR b.credential_ref IS DISTINCT FROM p_ref THEN
      RAISE EXCEPTION 'credential rotation rejected (duplicate): request % already recorded another rotation', p_request_id USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('binding_version', b.binding_version, 'ref', b.credential_ref, 'header', b.credential_header, 'replayed', true);
  END IF;
  PERFORM observation.cr_assert_person('credential rotation', v_actor, p_tenant, p_domain, ARRAY['collection_manager'], NULL, 'rotating a connector''s credential');
  SELECT * INTO c FROM observation.source_contracts_current x WHERE x.source_id = p_source AND x.contract_version = p_cv AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'credential rotation rejected (unknown_source): source % v% is not recorded in this domain', coalesce(p_source::text, '<none>'), coalesce(p_cv::text, '<none>') USING ERRCODE = '23503';
  END IF;
  IF c.connector_kind <> 'adapter' THEN
    RAISE EXCEPTION 'credential rotation rejected (kind): a % contract carries its credential reference in its own document (B11) — a rotation is a new contract version; the gateway''s binding is an adapter contract''s', c.connector_kind USING ERRCODE = '22023';
  END IF;
  IF c.lifecycle_state IN ('retired', 'superseded', 'draft') THEN
    RAISE EXCEPTION 'credential rotation rejected (state): source % v% is %; a credential is rotated on an approved, active or suspended contract', p_source, p_cv, c.lifecycle_state USING ERRCODE = '23514';
  END IF;
  IF p_ref IS NULL OR p_ref !~ '^EYE_SRC_[A-Z0-9_]{1,64}$' THEN
    RAISE EXCEPTION 'credential rotation rejected (reference): a credential is named by its deployment reference EYE_SRC_<NAME>, never by its value' USING ERRCODE = '22023';
  END IF;
  IF p_header IS NULL OR p_header !~ '^[A-Za-z0-9-]{1,64}$' THEN
    RAISE EXCEPTION 'credential rotation rejected (header): the header the gateway injects is 1 to 64 letters, digits or hyphens' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'credential rotation rejected (reason): a rotation states why in 8 to 2000 characters (the exposure, the expiry, the schedule)' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('observation.credential:' || p_source || ':' || p_cv, 0));
  SELECT * INTO prev FROM observation.connector_credential_bindings x WHERE x.source_id = p_source AND x.contract_version = p_cv AND x.state = 'in_force';
  IF (prev.source_id IS NOT NULL AND prev.credential_ref = p_ref) OR (prev.source_id IS NULL AND c.contract #>> '{security_and_operations,credential_ref}' = p_ref) THEN
    RAISE EXCEPTION 'credential rotation rejected (reference): % is the reference in force; a rotation binds a new one', p_ref USING ERRCODE = '22023';
  END IF;
  v_version := CASE WHEN prev.source_id IS NULL THEN 1 ELSE prev.binding_version + 1 END;
  IF prev.source_id IS NOT NULL THEN
    UPDATE observation.connector_credential_bindings SET state = 'revoked', revoked_by = v_actor, revoked_at = clock_timestamp()
     WHERE source_id = p_source AND contract_version = p_cv AND binding_version = prev.binding_version;
  END IF;
  v_force := observation.cr_package_in_force(p_tenant, p_domain, p_source, p_cv);
  v_out := observation.cr_suspend_and_open(p_tenant, p_domain, p_source, p_cv, v_actor, 'credential_rotated',
             format('credential rotated to binding v%s (%s); the previous %s revoked', v_version, p_ref,
                    CASE WHEN prev.source_id IS NULL THEN 'contract reference ' || coalesce(c.contract #>> '{security_and_operations,credential_ref}', '(none)') ELSE 'binding v' || prev.binding_version END),
             NULL, NULL, v_force ->> 'digest', p_correlation);
  INSERT INTO observation.connector_credential_bindings (scope, tenant_id, domain_id, source_id, contract_version, binding_version, credential_ref, credential_header, state,
                                                         rotated_from, reason, bound_by, requalification_id, request_id, correlation_id)
  VALUES ('DOMAIN', p_tenant, p_domain, p_source, p_cv, v_version, p_ref, p_header, 'in_force', CASE WHEN v_version > 1 THEN v_version - 1 END, btrim(p_reason), v_actor,
          (v_out #>> '{requalification,requalification_id}')::uuid, p_request_id, p_correlation)
  RETURNING * INTO b;
  INSERT INTO observation.source_contract_events (event_id, scope, tenant_id, domain_id, source_id, contract_version, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_source, p_cv, 'contract.credential_rotated', v_actor,
          jsonb_build_object('binding_version', v_version, 'credential_ref', p_ref, 'credential_header', p_header, 'revoked_binding_version', prev.binding_version,
                             'revoked_contract_reference', CASE WHEN prev.source_id IS NULL THEN c.contract #>> '{security_and_operations,credential_ref}' END,
                             'reason', btrim(p_reason), 'requalification_id', v_out #>> '{requalification,requalification_id}'), p_correlation);
  RETURN jsonb_build_object('binding_version', b.binding_version, 'ref', b.credential_ref, 'header', b.credential_header, 'revoked_binding_version', prev.binding_version,
                            'requalification', v_out -> 'requalification', 'suspended', v_out -> 'suspended', 'contract_state', v_out -> 'contract_state', 'replayed', false);
END $$;
REVOKE ALL ON FUNCTION observation.rotate_connector_credential(uuid, uuid, uuid, uuid, int, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.rotate_connector_credential(uuid, uuid, uuid, uuid, int, text, text, text, uuid, uuid) TO eye_commit;

-- §CR.8 THE READS (eye_app, eye_commit; the read scope asserted) ──────────────────────────────────────────────────────────────────────────
/* The connectors register: every package (with its ledger), every adapter contract version with its package in force and why it can or
   cannot run, every requalification (with its ledger), every credential binding (references only). */
CREATE OR REPLACE FUNCTION observation.connector_register_read(p_tenant uuid, p_domain uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = observation, graph, pg_catalog, pg_temp AS $$
DECLARE v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the connectors register');
  RETURN jsonb_build_object(
    'packages', (SELECT coalesce(jsonb_agg(observation.cr_package_json(p) || jsonb_build_object('events',
                   (SELECT coalesce(jsonb_agg(jsonb_build_object('event', e.event, 'actor', e.actor, 'at', graph.pv_iso(e.occurred_at), 'details', e.details) ORDER BY e.occurred_at, e.event_id), '[]'::jsonb)
                      FROM observation.adapter_package_events e WHERE e.package_id = p.package_id)) ORDER BY p.name, p.registered_at), '[]'::jsonb)
                   FROM observation.adapter_packages p WHERE p.tenant_id = p_tenant AND p.domain_id = p_domain),
    'contracts', (SELECT coalesce(jsonb_agg(jsonb_build_object('source_id', s.source_id, 'contract_version', s.contract_version, 'source_key', s.source_key, 'name', s.name,
                     'lifecycle_state', s.lifecycle_state, 'acquisition_mode', s.acquisition_mode, 'endpoints', coalesce(s.contract #> '{identity,endpoints}', '[]'::jsonb),
                     'package_in_force', observation.cr_package_in_force(p_tenant, p_domain, s.source_id, s.contract_version),
                     'package_problem', observation.cr_package_problem(p_tenant, p_domain, observation.cr_package_in_force(p_tenant, p_domain, s.source_id, s.contract_version)),
                     'open_requalification', (SELECT observation.cr_requalification_json(q) FROM observation.cr_open_requalification(s.source_id, s.contract_version) q WHERE q.requalification_id IS NOT NULL))
                   ORDER BY s.source_key, s.contract_version), '[]'::jsonb)
                   FROM observation.source_contracts_current s WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.connector_kind = 'adapter'),
    'requalifications', (SELECT coalesce(jsonb_agg(observation.cr_requalification_json(r) || jsonb_build_object('events',
                   (SELECT coalesce(jsonb_agg(jsonb_build_object('event', e.event, 'actor', e.actor, 'at', graph.pv_iso(e.occurred_at), 'details', e.details) ORDER BY e.occurred_at, e.event_id), '[]'::jsonb)
                      FROM observation.connector_requalification_events e WHERE e.requalification_id = r.requalification_id)) ORDER BY r.opened_at DESC), '[]'::jsonb)
                   FROM observation.connector_requalifications r WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain),
    'credential_bindings', (SELECT coalesce(jsonb_agg(jsonb_build_object('source_id', b.source_id, 'contract_version', b.contract_version, 'binding_version', b.binding_version,
                     'ref', b.credential_ref, 'header', b.credential_header, 'state', b.state, 'rotated_from', b.rotated_from, 'reason', b.reason, 'bound_by', b.bound_by,
                     'bound_at', graph.pv_iso(b.bound_at), 'revoked_by', b.revoked_by, 'revoked_at', graph.pv_iso(b.revoked_at), 'requalification_id', b.requalification_id)
                   ORDER BY b.source_id, b.contract_version, b.binding_version), '[]'::jsonb)
                   FROM observation.connector_credential_bindings b WHERE b.tenant_id = p_tenant AND b.domain_id = p_domain),
    'as_of', graph.pv_iso(v_at));
END $$;
REVOKE ALL ON FUNCTION observation.connector_register_read(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.connector_register_read(uuid, uuid) TO eye_app, eye_commit;

/* The transfer receipts, newest first (optionally of one source or one run): every field but bytes — the digests, sizes, destinations and
   decisions — with the counts by decision and class. */
CREATE OR REPLACE FUNCTION observation.egress_receipts_read(p_tenant uuid, p_domain uuid, p_source uuid, p_run uuid, p_limit int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = observation, graph, pg_catalog, pg_temp AS $$
DECLARE v_limit int := least(greatest(coalesce(p_limit, 200), 1), 1000);
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the egress receipts');
  RETURN jsonb_build_object(
    'receipts', (SELECT coalesce(jsonb_agg(jsonb_build_object('receipt_id', r.receipt_id, 'source_id', r.source_id, 'contract_version', r.contract_version, 'run_id', r.run_id,
                    'seq', r.seq, 'package_id', r.package_id, 'package_digest', r.package_digest, 'requested_at', graph.pv_iso(r.requested_at), 'method', r.method,
                    'url_redacted', r.url_redacted, 'host', r.host, 'purpose', r.purpose, 'data_class', r.data_class, 'decision', r.decision, 'refusal_class', r.refusal_class,
                    'reason', r.reason, 'request_digest', r.request_digest, 'request_bytes', r.request_bytes, 'response_status', r.response_status,
                    'response_digest', r.response_digest, 'response_bytes', r.response_bytes, 'destination', r.destination, 'credential_injected', r.credential_injected,
                    'credential_ref', r.credential_ref, 'recorded_at', graph.pv_iso(r.recorded_at), 'source_key', s.source_key)
                  ORDER BY r.recorded_at DESC, r.run_id, r.seq DESC), '[]'::jsonb)
                  FROM (SELECT * FROM observation.egress_receipts x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND (p_source IS NULL OR x.source_id = p_source)
                          AND (p_run IS NULL OR x.run_id = p_run) ORDER BY x.recorded_at DESC, x.seq DESC LIMIT v_limit) r
                  LEFT JOIN LATERAL (SELECT s2.source_key FROM observation.source_contracts_current s2 WHERE s2.source_id = r.source_id AND s2.contract_version = r.contract_version) s ON true),
    'counts', (SELECT coalesce(jsonb_object_agg(k, n), '{}'::jsonb) FROM (SELECT x.decision || coalesce(':' || x.refusal_class, '') k, count(*) n FROM observation.egress_receipts x
                 WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND (p_source IS NULL OR x.source_id = p_source) AND (p_run IS NULL OR x.run_id = p_run) GROUP BY 1) t),
    'limit', v_limit, 'as_of', graph.pv_iso(clock_timestamp()));
END $$;
REVOKE ALL ON FUNCTION observation.egress_receipts_read(uuid, uuid, uuid, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.egress_receipts_read(uuid, uuid, uuid, uuid, int) TO eye_app, eye_commit;

-- §CR.9 observation.transition_contract — 0022:883, its LAST definition, copied WHOLE; the additions are marked `-- B40 cr` ───────────────
/*
 * Lifecycle transitions. The permitted state machine lives here rather than in
 * application code, so a second caller cannot invent a transition:
 *   draft → approved (approve_source only)
 *   approved → active | retired
 *   active → suspended | retired | superseded
 *   suspended → active (reactivate) | retired
 * Activation additionally requires CONFIRMED rights (D2) and an approver.
 * B40 cr (IA-47-005, DP-14-003): activation is refused while the contract version's connector requalification is open (required,
 * submitted or rejected — not yet approved by a second person), and an ADAPTER contract activates only on its package in force: approved,
 * the version and digest it binds. A v1–v3 contract has no requalification and no package: it transitions exactly as before (D8).
 */
CREATE OR REPLACE FUNCTION observation.transition_contract(
  p_source_id uuid, p_contract_version int, p_tenant uuid, p_domain uuid,
  p_target text, p_reason text, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_row observation.source_contracts_current%ROWTYPE; v_ok boolean;
        v_req observation.connector_requalifications%ROWTYPE; v_problem text;   -- B40 cr
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.source.transition']);
  PERFORM observation.assert_scope(p_tenant, p_domain);

  SELECT * INTO v_row FROM observation.source_contracts_current
   WHERE source_id = p_source_id AND contract_version = p_contract_version FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transition rejected: no such source contract version' USING ERRCODE = '23503';
  END IF;

  v_ok := CASE
    WHEN v_row.lifecycle_state = 'approved'  AND p_target IN ('active', 'retired')                 THEN true
    WHEN v_row.lifecycle_state = 'active'    AND p_target IN ('suspended', 'retired', 'superseded') THEN true
    WHEN v_row.lifecycle_state = 'suspended' AND p_target IN ('active', 'retired')                 THEN true
    ELSE false END;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'transition rejected: % → % is not a permitted source-contract transition',
      v_row.lifecycle_state, p_target USING ERRCODE = '23514';
  END IF;
  IF p_target = 'active' THEN
    -- Unconfirmed rights block LIVE acquisition only; frozen replay exercises no
    -- publisher's reuse terms. The unconfirmed state remains on the source and is
    -- surfaced as an attention item regardless of which mode it runs in.
    IF v_row.rights_state <> 'confirmed' AND v_row.acquisition_mode = 'live' THEN
      RAISE EXCEPTION 'activation rejected: rights are % and this contract acquires LIVE; a live contract may not be activated on unconfirmed rights',
        v_row.rights_state USING ERRCODE = '23514';
    END IF;
    IF v_row.rights_state = 'withdrawn' THEN
      RAISE EXCEPTION 'activation rejected: rights have been withdrawn' USING ERRCODE = '23514';
    END IF;
    IF v_row.approver_principal_id IS NULL THEN
      RAISE EXCEPTION 'activation rejected: contract has no approver' USING ERRCODE = '23514';
    END IF;
    -- B40 cr: an open requalification holds the contract version (IA-47-005) — a second person approves it before reactivation
    v_req := observation.cr_open_requalification(p_source_id, p_contract_version);                                            -- B40 cr
    IF v_req.requalification_id IS NOT NULL THEN                                                                                 -- B40 cr
      RAISE EXCEPTION 'transition rejected (held): source % v% is held for requalification % (%, %); it is activated again once a second person approves a requalified connector',
        p_source_id, p_contract_version, v_req.requalification_id, v_req.cause, v_req.state USING ERRCODE = '23514';             -- B40 cr
    END IF;                                                                                                                      -- B40 cr
    -- B40 cr: an adapter contract runs only its package in force — approved by a second person, the version and digest bound (D12)
    IF v_row.connector_kind = 'adapter' THEN                                                                                     -- B40 cr
      v_problem := observation.cr_package_problem(v_row.tenant_id, v_row.domain_id,                                              -- B40 cr
                     observation.cr_package_in_force(v_row.tenant_id, v_row.domain_id, p_source_id, p_contract_version));        -- B40 cr
      IF v_problem IS NOT NULL THEN                                                                                              -- B40 cr
        RAISE EXCEPTION 'transition rejected (held): source % v% cannot be activated — %', p_source_id, p_contract_version, v_problem USING ERRCODE = '23514';  -- B40 cr
      END IF;                                                                                                                    -- B40 cr
    END IF;                                                                                                                      -- B40 cr
  END IF;

  UPDATE observation.source_contracts_current
     SET lifecycle_state = p_target,
         effective_from = CASE WHEN p_target = 'active' AND effective_from IS NULL
                               THEN clock_timestamp() ELSE effective_from END,
         effective_to   = CASE WHEN p_target IN ('retired', 'superseded')
                               THEN clock_timestamp() ELSE effective_to END,
         updated_at = clock_timestamp()
   WHERE source_id = p_source_id AND contract_version = p_contract_version;

  INSERT INTO observation.source_contract_events (
    event_id, scope, tenant_id, domain_id, source_id, contract_version,
    event, actor_principal_id, details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_source_id, p_contract_version,
    CASE p_target
      WHEN 'active'     THEN CASE WHEN v_row.lifecycle_state = 'suspended'
                                  THEN 'contract.reactivated' ELSE 'contract.activated' END
      WHEN 'suspended'  THEN 'contract.suspended'
      WHEN 'retired'    THEN 'contract.retired'
      WHEN 'superseded' THEN 'contract.superseded' END,
    public.eye_principal(),
    jsonb_build_object('from', v_row.lifecycle_state, 'to', p_target, 'reason', p_reason),
    p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.transition_contract(uuid,int,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.transition_contract(uuid,int,uuid,uuid,text,text,uuid,uuid) TO eye_commit;
