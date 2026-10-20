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
    'unknown_signer', 'response_anomaly'));

ALTER TABLE observation.custody_events DROP CONSTRAINT custody_events_event_check,
  ADD CONSTRAINT custody_events_event_check CHECK (event IN (
    'custody.acquired', 'custody.quarantined', 'custody.verified', 'custody.candidate_verified', 'custody.admitted', 'custody.finalized',
    'custody.retrieved', 'custody.tombstoned', 'custody.integrity_failed', 'custody.archived', 'custody.exported', 'custody.restored',
    'custody.delivered', 'custody.revocation_notified', 'custody.imported', 'custody.retrieval_degraded',
    'custody.inspected', 'custody.authenticity_recorded'));   -- B40 §0 (§IN, §VA)

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
