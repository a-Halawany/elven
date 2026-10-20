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
      RAISE EXCEPTION 'publisher key rejected (state): key % was retired at % — a rotation replaces an active key', old.fingerprint, graph.pv_iso(old.retired_at) USING ERRCODE = '55000';
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
    RAISE EXCEPTION 'publisher key rejected (state): key % was retired at % (%)', k.fingerprint, graph.pv_iso(k.retired_at), k.retire_reason USING ERRCODE = '55000';
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
    RAISE EXCEPTION 'evidence attribute rejected (unchanged): % of EVD % v% is already %', p_attribute, p_evd, p_version, p_value::text USING ERRCODE = '55000';
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
    RAISE EXCEPTION 'transformation rule rejected (state): rule % is %; only a proposed rule is decided', r.rule_id, r.state USING ERRCODE = '55000';
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
    RAISE EXCEPTION 'transformation rule rejected (state): rule % is %; only an approved rule is retired', r.rule_id, r.state USING ERRCODE = '55000';
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
