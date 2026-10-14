-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0115 §PG — CP-6 B107: THE PRODUCT-GOVERNANCE WORKSPACE (F-P7-F-12 the product governance workspace; F-P7D-25's exception service,
-- conflict register, change control and governance registry). Applies ALONE on top of 0001–0114 + the prelude (0115 §0). Nothing earlier is
-- re-declared; every object here is new and prefixed `ws_` (the module/PDP block `workspace`), except the ONE shared PLATFORM-signing port
-- `governance.record_platform_signature` that every part may call after the fold (its TS twin: src/governance/workspace/platform-signing.ts).
--
--   §PG.1 THE SHARED PLATFORM SIGNATURE PORT — a named human's Ed25519 signature (the SignatureService key path) recorded in the prelude's
--         governance.signatures under the CALLER's bound action.
--   §PG.2 THE PRODUCT BASELINE (PR-01-001/-002/-005, CAP-AU-01/-02, ADR-005): the capability inventory read from the capability ARTIFACTS
--         (§RG imports them), ONE accountable owner per capability with its domain boundary, the DECISION-RIGHTS matrix (CAP-AU-03: propose /
--         review / approve / operate / audit; singular approver; separation of duties; delegation) and the SIGNED baseline decision — which is
--         also the executive baseline attestation (IA-72-006 / DP-72-006): it binds the exact scope tuple, the exception ageing and the
--         conformance trend. HELD while authority is unresolved (an orphan or duplicate capability, a lapsed owner, no signed rights, an open
--         conflict) — the disputed state preserved and shown, never represented as resolved.
--   §PG.3 THE ONE EXCEPTION REGISTRY (V03-T-451/-453, ES-02-004, DAT-GV-08, CAP-AU-10): every V03-T-453 field; an INDEPENDENT approver (never
--         the proposer, never the owner, never the owner of the component whose authority the exception expands); constitutional
--         boundaries unwaivable (a closed list); EXPIRY → `expired` and every affected artifact (the release candidate, a data release) HELD
--         (governance.holds `exception_expired`) until a renewal with CURRENT evidence is approved independently (or the exception is closed on
--         its exit criteria); ageing; REPEATS → a remediation review that holds further approvals on the contract until decided. The
--         repository's EXCEPTIONS.md and the C15 SCX records are NOT here: read-only, reported by the workspace (src/governance/workspace/
--         repository-registers.ts) — never governed, renewed, closed or expired by the product.
--   §PG.4 THE CONFLICT REGISTER (FEX-32, IA-02-005, DP-02-005): a conflict HOLDS every affected release at the LAST CONFORMANT candidate,
--         selects the highest authority, exposes the impacted requirements and journeys; resolved only by the governing authority (SIGNED
--         `conflict_resolution`) by closure (the highest authority prevails) or amendment (an approved change proposal) — and the trace closes
--         (the prevailing artifact `governs` every impacted one; the superseded meaning linked `supersedes`).
--   §PG.5 CHANGE PROPOSALS (ES-72-003, PR-72-002/-003): consumer impact, compatibility, migration, replay, rollback and evidence plans required
--         BEFORE approval; the deterministic impact (dependents through the live links, ordered, digested — recomputed at approval: a changed
--         impact is stale); constitutional, identity-altering or cross-volume change needs the authority CHAIN (product authority AND
--         independent assurance); a subject under an open conflict or hold is held (IA-72-005, PR-72-005). SIGNED `change_approval`.
--   §PG.6 THE GOVERNANCE REGISTRY (ES-72-001/-005, IA-72-001/-002, INF-DL-08, DP-72-001/-002, DAT-GV-06): decision records, standards,
--         technical debt (decision-active risk with objectives, customers, consequences, owner, due date, investment, VERIFIED closure) and
--         deprecations — accountable owner, approving authority, lifecycle, version, effective time, dependencies, review cadence, supersession,
--         controlled amendment, retirement proof; THE POSTURE (declared vs observed, every dimension conformant | non_conformant | unknown —
--         never inferred healthy) and its versioned snapshots.
--
-- THREE CLAIMS, never mixed: CONSTRUCTION (this migration, its ports and phase6-workspace-b107); DEMONSTRATED OPERATION (the act — every
-- record here `claim = 'demonstration'`, the CHECK admits nothing else); REAL ACCEPTANCE (named product owners and independent release
-- authorities, executive attestation in production: H3 / R1) — never claimed, and no row here can carry it.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §PG.0 VOCABULARIES AND INTERNAL HELPERS ──────────────────────────────────────────────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS governance.ws_ref_seq;

/* The constitutional boundaries no ordinary exception may waive (EXCEPTIONS.md's rigor rule + the product's own): closed list. */
CREATE OR REPLACE FUNCTION governance.ws_constitutional_invariants() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  'human_authority', 'provenance', 'temporal_truth', 'tenant_isolation', 'append_only_audit', 'tamper_detection', 'fail_closed_authorization',
  'explainability', 'claim_separation', 'separation_of_duties', 'supply_chain_authorization'] $$;
/* The governed act classes a decision-rights matrix covers (besides capability keys), and the duties. */
CREATE OR REPLACE FUNCTION governance.ws_act_classes() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  'baseline', 'decision_rights', 'exception', 'conflict', 'change', 'record', 'release'] $$;
CREATE OR REPLACE FUNCTION governance.ws_duties() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['propose', 'review', 'approve', 'operate', 'audit'] $$;
/* The classes a baseline's rights must cover with an approver before it can be signed. */
CREATE OR REPLACE FUNCTION governance.ws_required_classes() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['baseline', 'exception', 'change', 'conflict'] $$;
CREATE OR REPLACE FUNCTION governance.ws_governance_roles() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  'product_authority', 'design_system_authority', 'independent_assurance', 'operations_authority', 'conformance_steward'] $$;
/* THE AUTHORITY RANK (the declared rule a conflict uses to select the highest authority; the owner may revise): the artifact's authority
   class (constitutional 1 · controlling 2 · normative 3 · informative 4 · anything else / none 5), then the controlling volume (V0 before V9),
   then the earliest effective time. */
CREATE OR REPLACE FUNCTION governance.ws_authority_rank(p_class text) RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE lower(coalesce(p_class, '')) WHEN 'constitutional' THEN 1 WHEN 'controlling' THEN 2 WHEN 'normative' THEN 3 WHEN 'informative' THEN 4 ELSE 5 END $$;
GRANT EXECUTE ON FUNCTION governance.ws_constitutional_invariants(), governance.ws_act_classes(), governance.ws_duties(), governance.ws_required_classes(),
  governance.ws_governance_roles(), governance.ws_authority_rank(text) TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION governance.ws_next_ref(p_prefix text) RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$ SELECT p_prefix || '-' || lpad(nextval('governance.ws_ref_seq')::text, 4, '0') $$;
REVOKE ALL ON FUNCTION governance.ws_next_ref(text) FROM PUBLIC;

/* Is the principal an active human? */
CREATE OR REPLACE FUNCTION governance.ws_is_human(p uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM identity.principals x WHERE x.id = p AND x.kind = 'human' AND x.status = 'active') $$;
REVOKE ALL ON FUNCTION governance.ws_is_human(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ws_is_human(uuid) TO eye_app, eye_commit;

/* A principal's display name (vendor-side registries name their people; read through a definer, as products.catalog_principal_name does for a tenant). */
CREATE OR REPLACE FUNCTION governance.ws_principal_name(p uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT x.display_name FROM identity.principals x WHERE x.id = p $$;
REVOKE ALL ON FUNCTION governance.ws_principal_name(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ws_principal_name(uuid) TO eye_app, eye_commit;

/* REGISTER an object of this part as a PLATFORM artifact (artifact_id = the object's id): a new version, the previous one superseded. */
CREATE OR REPLACE FUNCTION governance.ws_register(p_id uuid, p_kind text, p_key text, p_title text, p_owner uuid, p_owner_role text, p_authority_class text, p_volume text,
                                                  p_lifecycle text, p_attributes jsonb, p_digest text, p_actor uuid, p_correlation uuid) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE v int;
BEGIN
  SELECT coalesce(max(a.version), 0) INTO v FROM governance.artifacts a WHERE a.artifact_id = p_id;
  UPDATE governance.artifacts SET superseded_at = clock_timestamp() WHERE artifact_id = p_id AND superseded_at IS NULL;
  INSERT INTO governance.artifacts (artifact_id, version, scope, kind, external_key, title, owner_principal_id, owner_role, authority_class, controlling_volume, lifecycle, attributes, source,
                                    digest, recorded_by, correlation_id)
  VALUES (p_id, v + 1, 'PLATFORM', p_kind, p_key, left(p_title, 500), p_owner, p_owner_role, p_authority_class, p_volume, p_lifecycle, coalesce(p_attributes, '{}'::jsonb),
          jsonb_build_object('part', '§PG', 'claim', 'demonstration'), p_digest, p_actor, p_correlation);
  RETURN v + 1;
END $$;
REVOKE ALL ON FUNCTION governance.ws_register(uuid, text, text, text, uuid, text, text, text, text, jsonb, text, uuid, uuid) FROM PUBLIC;

/* LINK two artifacts (PLATFORM) unless the same live link stands; returns the link id (new or standing). */
CREATE OR REPLACE FUNCTION governance.ws_link(p_from uuid, p_to uuid, p_relation text, p_attributes jsonb, p_actor uuid, p_correlation uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE v uuid;
BEGIN
  IF p_from = p_to THEN RETURN NULL; END IF;
  SELECT l.link_id INTO v FROM governance.links_live l WHERE l.from_artifact = p_from AND l.to_artifact = p_to AND l.relation = p_relation AND l.scope = 'PLATFORM' LIMIT 1;
  IF v IS NOT NULL THEN RETURN v; END IF;
  v := gen_random_uuid();
  INSERT INTO governance.links (link_id, scope, from_artifact, to_artifact, relation, attributes, recorded_by, correlation_id)
  VALUES (v, 'PLATFORM', p_from, p_to, p_relation, coalesce(p_attributes, '{}'::jsonb) || jsonb_build_object('part', '§PG'), p_actor, p_correlation);
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION governance.ws_link(uuid, uuid, text, jsonb, uuid, uuid) FROM PUBLIC;

/* OPEN a hold on a subject artifact (PLATFORM) unless the same hold (subject + source + reason kind) is open; returns the hold id. */
CREATE OR REPLACE FUNCTION governance.ws_open_hold(p_subject uuid, p_reason_kind text, p_source uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE v uuid;
BEGIN
  SELECT h.hold_id INTO v FROM governance.holds h WHERE h.subject_artifact = p_subject AND h.reason_kind = p_reason_kind AND h.source_artifact IS NOT DISTINCT FROM p_source AND h.lifted_at IS NULL LIMIT 1;
  IF v IS NOT NULL THEN RETURN v; END IF;
  v := gen_random_uuid();
  INSERT INTO governance.holds (hold_id, scope, subject_artifact, reason_kind, source_artifact, reason, opened_by, correlation_id)
  VALUES (v, 'PLATFORM', p_subject, p_reason_kind, p_source, p_reason, p_actor, p_correlation);
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION governance.ws_open_hold(uuid, text, uuid, text, uuid, uuid) FROM PUBLIC;

/* LIFT every open hold a source opened for a reason kind (never deleted: lifted_at / lifted_by / lift_reason); returns the lifted holds. */
CREATE OR REPLACE FUNCTION governance.ws_lift_holds(p_source uuid, p_reason_kind text, p_lift_reason text, p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE v jsonb;
BEGIN
  WITH l AS (
    UPDATE governance.holds h SET lifted_at = clock_timestamp(), lifted_by = p_actor, lift_reason = p_lift_reason
     WHERE h.source_artifact = p_source AND h.reason_kind = p_reason_kind AND h.lifted_at IS NULL
    RETURNING h.hold_id, h.subject_artifact)
  SELECT coalesce(jsonb_agg(jsonb_build_object('hold_id', l.hold_id, 'subject', l.subject_artifact) ORDER BY l.subject_artifact), '[]'::jsonb) INTO v FROM l;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION governance.ws_lift_holds(uuid, text, text, uuid) FROM PUBLIC;

/* Validate a list of evidence items: each {kind, ref, digest (64 hex), captured_at (≤ now), valid_until (optional, > captured_at)}.
   p_current: every item captured within the last p_days and still valid now, and (p_after) captured after that instant. Raises in the
   noun's class form: (evidence) 422, (stale) 409. Returns the normalised list. */
CREATE OR REPLACE FUNCTION governance.ws_evidence(p_noun text, p_items jsonb, p_current boolean, p_days int, p_after timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE e jsonb; v_out jsonb := '[]'::jsonb; v_cap timestamptz; v_until timestamptz;
BEGIN
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION '% rejected (evidence): at least one evidence item {kind, ref, digest, captured_at, valid_until?} is named', p_noun USING ERRCODE = '22023';
  END IF;
  FOR e IN SELECT x FROM jsonb_array_elements(p_items) x LOOP
    IF jsonb_typeof(e) <> 'object' OR length(btrim(coalesce(e ->> 'kind', ''))) < 2 OR length(btrim(coalesce(e ->> 'ref', ''))) < 2 OR coalesce(e ->> 'digest', '') !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION '% rejected (evidence): an evidence item names its kind, its reference and its digest (64 hex)', p_noun USING ERRCODE = '22023';
    END IF;
    BEGIN
      v_cap := (e ->> 'captured_at')::timestamptz;
      v_until := CASE WHEN e ? 'valid_until' AND e ->> 'valid_until' IS NOT NULL THEN (e ->> 'valid_until')::timestamptz END;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION '% rejected (evidence): captured_at and valid_until are instants', p_noun USING ERRCODE = '22023';
    END;
    IF v_cap IS NULL OR v_cap > clock_timestamp() + interval '1 minute' THEN
      RAISE EXCEPTION '% rejected (evidence): % was captured at an instant not yet reached (or none)', p_noun, e ->> 'ref' USING ERRCODE = '22023';
    END IF;
    IF v_until IS NOT NULL AND v_until <= v_cap THEN RAISE EXCEPTION '% rejected (evidence): % is valid until before it was captured', p_noun, e ->> 'ref' USING ERRCODE = '22023'; END IF;
    IF p_current THEN
      IF v_cap < clock_timestamp() - make_interval(days => p_days) OR (v_until IS NOT NULL AND v_until <= clock_timestamp()) OR (p_after IS NOT NULL AND v_cap < p_after) THEN
        RAISE EXCEPTION '% rejected (stale): % is not current evidence (captured %, valid until %; current means captured within % days%, still valid)', p_noun, e ->> 'ref', v_cap,
          coalesce(v_until::text, 'open'), p_days, CASE WHEN p_after IS NULL THEN '' ELSE ' and after ' || p_after::text END USING ERRCODE = '23505';
      END IF;
    END IF;
    v_out := v_out || jsonb_build_object('kind', btrim(e ->> 'kind'), 'ref', btrim(e ->> 'ref'), 'digest', e ->> 'digest', 'captured_at', v_cap, 'valid_until', v_until);
  END LOOP;
  RETURN v_out;
END $$;
REVOKE ALL ON FUNCTION governance.ws_evidence(text, jsonb, boolean, int, timestamptz) FROM PUBLIC;

/* Every id names a CURRENT artifact (any of p_kinds, or any kind when NULL); raises (unknown_artifact) 404. */
CREATE OR REPLACE FUNCTION governance.ws_assert_artifacts(p_noun text, p_ids uuid[], p_kinds text[], p_what text) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE v uuid;
BEGIN
  FOREACH v IN ARRAY coalesce(p_ids, '{}') LOOP
    IF NOT EXISTS (SELECT 1 FROM governance.artifacts a WHERE a.artifact_id = v AND a.superseded_at IS NULL AND (p_kinds IS NULL OR a.kind = ANY (p_kinds))) THEN
      RAISE EXCEPTION '% rejected (unknown_artifact): % names %, which is not a current % artifact', p_noun, p_what, v, coalesce(array_to_string(p_kinds, ' / '), 'governance') USING ERRCODE = '23503';
    END IF;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION governance.ws_assert_artifacts(text, uuid[], text[], text) FROM PUBLIC;

-- §PG.1 THE SHARED PLATFORM SIGNATURE PORT ─────────────────────────────────────────────────────────────────────────────────────────────────
/* RECORD a PLATFORM signature (the prelude's governance.signatures): the CALLER's bound action asserted (each part passes the action of the act
   the signature belongs to), PLATFORM scope, the signer is the acting principal — an active HUMAN holding p_signer_role at PLATFORM; the bytes
   are the TS signer's (platform-signing.ts — Ed25519 over the ASCII hex of the subject digest, the key by reference
   EYE_EXECUTIVE_SIGNING_KEY_<NAME>, the SignatureService path). One per signer per subject version. The deciding port then verifies the row
   (subject, version, digest, signer, bound action) before it acts — the signer never decides who may sign what. */
CREATE OR REPLACE FUNCTION governance.record_platform_signature(p_signature_id uuid, p_action text, p_kind text, p_subject_id uuid, p_subject_version int, p_subject_digest text,
                                                                p_key_id text, p_signature text, p_signer_role text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, observation, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY[p_action]);
  IF public.eye_scope() IS DISTINCT FROM 'PLATFORM' THEN RAISE EXCEPTION 'signature rejected (authority): a platform signature is recorded at PLATFORM scope' USING ERRCODE = '42501'; END IF;
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'signature rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT governance.ws_is_human(p_actor) THEN RAISE EXCEPTION 'signature rejected (actor): a named human signs; an agent never does' USING ERRCODE = '42501'; END IF;
  IF NOT governance.holds_role(p_actor, NULL, NULL, ARRAY[p_signer_role]) THEN
    RAISE EXCEPTION 'signature rejected (authority): the signer holds % at PLATFORM', coalesce(p_signer_role, '<none>') USING ERRCODE = '42501';
  END IF;
  IF NOT (p_kind = ANY (governance.signature_kinds())) THEN RAISE EXCEPTION 'signature rejected (kind): % is not a platform signature kind', p_kind USING ERRCODE = '22023'; END IF;
  IF coalesce(p_subject_digest, '') !~ '^[0-9a-f]{64}$' OR coalesce(p_key_id, '') !~ '^ed25519:[0-9a-f]{16}$' OR coalesce(p_signature, '') !~ '^[A-Za-z0-9+/]{86}==$' THEN
    RAISE EXCEPTION 'signature rejected (format): a 64-hex subject digest, an ed25519 key id and a 64-byte signature' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM governance.signatures s WHERE s.subject_kind = p_kind AND s.subject_id = p_subject_id AND s.subject_version = p_subject_version AND s.signer = p_actor) THEN
    RAISE EXCEPTION 'signature rejected (state): % %/% is already signed by this principal', p_kind, p_subject_id, p_subject_version USING ERRCODE = '22023';
  END IF;
  INSERT INTO governance.signatures (signature_id, scope, subject_kind, subject_id, subject_version, subject_digest, signer, signer_role, key_id, algorithm, signature, bound_action, correlation_id)
  VALUES (p_signature_id, 'PLATFORM', p_kind, p_subject_id, p_subject_version, p_subject_digest, p_actor, p_signer_role, p_key_id, 'ed25519', p_signature, p_action, p_correlation);
  RETURN jsonb_build_object('signature_id', p_signature_id, 'subject_kind', p_kind, 'subject_id', p_subject_id, 'subject_version', p_subject_version, 'subject_digest', p_subject_digest,
                            'signer', p_actor, 'signer_role', p_signer_role, 'key_id', p_key_id, 'signed_at', clock_timestamp());
END $$;
REVOKE ALL ON FUNCTION governance.record_platform_signature(uuid, text, text, uuid, int, text, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.record_platform_signature(uuid, text, text, uuid, int, text, text, text, text, uuid, uuid) TO eye_commit;

/* The deciding port's check: the signature row exists for exactly this subject version, digest, signer and action. */
CREATE OR REPLACE FUNCTION governance.ws_signed(p_signature uuid, p_kind text, p_subject uuid, p_version int, p_digest text, p_actor uuid, p_action text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
  SELECT p_signature IS NOT NULL AND EXISTS (SELECT 1 FROM governance.signatures s WHERE s.signature_id = p_signature AND s.subject_kind = p_kind AND s.subject_id = p_subject
           AND s.subject_version = p_version AND s.subject_digest = p_digest AND s.signer = p_actor AND s.bound_action = p_action) $$;
REVOKE ALL ON FUNCTION governance.ws_signed(uuid, text, uuid, int, text, uuid, text) FROM PUBLIC;

/* The signatures of a subject (an invoker read: PLATFORM rows are readable by every authenticated context). */
CREATE OR REPLACE FUNCTION governance.platform_signature_of(p_kind text, p_subject uuid, p_version int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = governance, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('signature_id', s.signature_id, 'signer', s.signer, 'signer_role', s.signer_role, 'key_id', s.key_id, 'algorithm', s.algorithm,
                                               'signature', s.signature, 'subject_digest', s.subject_digest, 'bound_action', s.bound_action, 'signed_at', s.signed_at) ORDER BY s.signed_at), '[]'::jsonb)
    FROM governance.signatures s WHERE s.subject_kind = p_kind AND s.subject_id = p_subject AND s.subject_version = p_version $$;
GRANT EXECUTE ON FUNCTION governance.platform_signature_of(text, uuid, int) TO eye_app, eye_commit;

-- §PG.2 THE PRODUCT BASELINE: owners, decision rights, the signed baseline decision ────────────────────────────────────────────────────────
/* ONE accountable owner per capability (ADR-005): a named active human holding the stated role at PLATFORM, the capability's domain boundary;
   a new assignment supersedes the old (versioned, never edited). */
CREATE TABLE governance.ws_capability_owners (
  capability_id      uuid NOT NULL,
  version            int  NOT NULL CHECK (version >= 1),
  scope              text NOT NULL DEFAULT 'PLATFORM' CHECK (scope = 'PLATFORM'),
  capability_key     text NOT NULL,
  owner_principal_id uuid NOT NULL,
  owner_role         text NOT NULL REFERENCES identity.roles (code),
  domain_boundary    text NOT NULL CHECK (length(btrim(domain_boundary)) BETWEEN 3 AND 200),
  reason             text NOT NULL CHECK (length(btrim(reason)) >= 8),
  assigned_by        uuid NOT NULL,
  assigned_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  superseded_at      timestamptz,
  correlation_id     uuid NOT NULL,
  PRIMARY KEY (capability_id, version)
);
CREATE UNIQUE INDEX wco_one_owner ON governance.ws_capability_owners (capability_id) WHERE superseded_at IS NULL;

/* THE DECISION-RIGHTS MATRIX (CAP-AU-03): rows {subject (an act class or a capability key), duty, role, principal?, delegate?: {to, until}};
   versioned; SIGNED (`decision_rights`) by the product authority — never the proposer. */
CREATE TABLE governance.ws_decision_rights (
  matrix_id       uuid NOT NULL,
  version         int  NOT NULL CHECK (version >= 1),
  scope           text NOT NULL DEFAULT 'PLATFORM' CHECK (scope = 'PLATFORM'),
  ref             text NOT NULL,
  rows            jsonb NOT NULL CHECK (jsonb_typeof(rows) = 'array'),
  digest          text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  state           text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'approved', 'rejected', 'superseded')),
  proposed_by     uuid NOT NULL,
  proposed_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_by      uuid,
  decided_at      timestamptz,
  decision_reason text,
  signature_id    uuid,
  claim           text NOT NULL DEFAULT 'demonstration' CHECK (claim = 'demonstration'),
  correlation_id  uuid NOT NULL,
  PRIMARY KEY (matrix_id, version)
);
CREATE UNIQUE INDEX wdr_one_open ON governance.ws_decision_rights (matrix_id) WHERE state = 'proposed';
CREATE UNIQUE INDEX wdr_one_approved ON governance.ws_decision_rights ((true)) WHERE state = 'approved';

/* THE BASELINE: the inventory, owners and boundaries, the rights, the exception ageing and conformance trend, the scope tuple, the gaps —
   SIGNED (`baseline_decision`) by the product authority; the signed decision is the executive baseline attestation. */
CREATE TABLE governance.ws_baselines (
  baseline_id     uuid NOT NULL,
  version         int  NOT NULL CHECK (version >= 1),
  scope           text NOT NULL DEFAULT 'PLATFORM' CHECK (scope = 'PLATFORM'),
  ref             text NOT NULL,
  title           text NOT NULL CHECK (length(btrim(title)) BETWEEN 8 AND 300),
  inventory       jsonb NOT NULL,
  domains         jsonb NOT NULL,
  rights          jsonb,
  exceptions      jsonb NOT NULL,
  conflicts       jsonb NOT NULL,
  holds           jsonb NOT NULL,
  trend           jsonb NOT NULL,
  scope_tuple     jsonb NOT NULL,
  gaps            jsonb NOT NULL,
  digest          text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  state           text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'signed', 'rejected', 'superseded')),
  proposed_by     uuid NOT NULL,
  proposed_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_by      uuid,
  decided_at      timestamptz,
  decision_reason text,
  signature_id    uuid,
  claim           text NOT NULL DEFAULT 'demonstration' CHECK (claim = 'demonstration'),
  correlation_id  uuid NOT NULL,
  PRIMARY KEY (baseline_id, version)
);
CREATE UNIQUE INDEX wbl_one_open ON governance.ws_baselines (baseline_id) WHERE state = 'proposed';
CREATE UNIQUE INDEX wbl_one_signed ON governance.ws_baselines ((true)) WHERE state = 'signed';

/* The current approved decision-rights matrix, or NULL. */
CREATE OR REPLACE FUNCTION governance.ws_rights_current() RETURNS governance.ws_decision_rights
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
  SELECT r FROM governance.ws_decision_rights r WHERE r.state = 'approved' LIMIT 1 $$;
REVOKE ALL ON FUNCTION governance.ws_rights_current() FROM PUBLIC;

/* RESOLVE a duty on a subject against the approved matrix: {governed: bool, matrix, rows: [{role, principal, delegate, delegate_live}]}.
   Not governed (no approved matrix, or no row for the subject/duty) → the port's own role rule applies (stated, never hidden). */
CREATE OR REPLACE FUNCTION governance.ws_rights_resolve(p_subject text, p_duty text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE m governance.ws_decision_rights; v jsonb;
BEGIN
  m := governance.ws_rights_current();
  IF m.matrix_id IS NULL THEN RETURN jsonb_build_object('governed', false, 'reason', 'no approved decision-rights matrix: the port''s own role rule applies'); END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('role', r ->> 'role', 'principal', r -> 'principal', 'delegate', r -> 'delegate',
           'delegate_live', (r -> 'delegate') IS NOT NULL AND jsonb_typeof(r -> 'delegate') = 'object' AND (r -> 'delegate' ->> 'until')::date >= (clock_timestamp() AT TIME ZONE 'UTC')::date)), '[]'::jsonb)
    INTO v FROM jsonb_array_elements(m.rows) r WHERE r ->> 'subject' = p_subject AND r ->> 'duty' = p_duty;
  IF jsonb_array_length(v) = 0 THEN
    RETURN jsonb_build_object('governed', false, 'matrix', jsonb_build_object('matrix_id', m.matrix_id, 'version', m.version), 'reason', format('the approved matrix %s v%s has no %s row for %s: the port''s own role rule applies', m.ref, m.version, p_duty, p_subject));
  END IF;
  RETURN jsonb_build_object('governed', true, 'matrix', jsonb_build_object('matrix_id', m.matrix_id, 'version', m.version, 'ref', m.ref), 'rows', v);
END $$;
REVOKE ALL ON FUNCTION governance.ws_rights_resolve(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ws_rights_resolve(text, text) TO eye_app, eye_commit;

/* THE RIGHTS CHECK every deciding port makes: when the approved matrix governs (subject, duty), the actor is the row's named principal (or
   its LIVE delegate), or — on a row naming no principal — a holder of the row's role at PLATFORM. Raises (authority) 403. */
CREATE OR REPLACE FUNCTION governance.ws_assert_rights(p_noun text, p_subject text, p_duty text, p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE r jsonb := governance.ws_rights_resolve(p_subject, p_duty); x jsonb;
BEGIN
  IF NOT (r ->> 'governed')::boolean THEN RETURN r; END IF;
  FOR x IN SELECT y FROM jsonb_array_elements(r -> 'rows') y LOOP
    IF jsonb_typeof(x -> 'principal') = 'string' THEN
      IF (x ->> 'principal')::uuid = p_actor AND governance.holds_role(p_actor, NULL, NULL, ARRAY[x ->> 'role']) THEN RETURN r || jsonb_build_object('via', 'named'); END IF;
      IF (x ->> 'delegate_live')::boolean AND (x -> 'delegate' ->> 'to')::uuid = p_actor AND governance.holds_role(p_actor, NULL, NULL, ARRAY[x ->> 'role']) THEN
        RETURN r || jsonb_build_object('via', 'delegate', 'delegate_until', x -> 'delegate' ->> 'until');
      END IF;
    ELSIF governance.holds_role(p_actor, NULL, NULL, ARRAY[x ->> 'role']) THEN
      RETURN r || jsonb_build_object('via', 'role');
    END IF;
  END LOOP;
  RAISE EXCEPTION '% rejected (authority): the approved decision-rights matrix % v% assigns % of % to %', p_noun, r -> 'matrix' ->> 'ref', r -> 'matrix' ->> 'version', p_duty, p_subject,
    (SELECT string_agg(CASE WHEN jsonb_typeof(y -> 'principal') = 'string' THEN format('%s (%s%s)', y ->> 'role', governance.ws_principal_name((y ->> 'principal')::uuid),
                              CASE WHEN (y ->> 'delegate_live')::boolean THEN ', delegated to ' || governance.ws_principal_name((y -> 'delegate' ->> 'to')::uuid) || ' until ' || (y -> 'delegate' ->> 'until') ELSE '' END)
                            ELSE y ->> 'role' END, ' or ') FROM jsonb_array_elements(r -> 'rows') y) USING ERRCODE = '42501';
END $$;
REVOKE ALL ON FUNCTION governance.ws_assert_rights(text, text, text, uuid) FROM PUBLIC;

/* ASSIGN the accountable owner of a capability (the product authority; human-gated): a named active human holding owner_role at PLATFORM. */
CREATE OR REPLACE FUNCTION governance.ws_assign_owner(p_capability uuid, p_owner uuid, p_owner_role text, p_domain_boundary text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE a governance.artifacts%ROWTYPE; v int; prev uuid;
BEGIN
  PERFORM governance.assert_platform('governance.baseline.owner.assign', p_actor, 'product baseline');
  IF NOT governance.ws_is_human(p_actor) THEN RAISE EXCEPTION 'product baseline rejected (actor): an accountable owner is assigned by a named human' USING ERRCODE = '42501'; END IF;
  IF NOT governance.holds_role(p_actor, NULL, NULL, ARRAY['product_authority']) THEN RAISE EXCEPTION 'product baseline rejected (authority): the product authority assigns capability owners' USING ERRCODE = '42501'; END IF;
  SELECT * INTO a FROM governance.artifacts x WHERE x.artifact_id = p_capability AND x.superseded_at IS NULL AND x.kind = 'capability';
  IF NOT FOUND THEN RAISE EXCEPTION 'product baseline rejected (unknown_capability): % is not a current capability artifact', p_capability USING ERRCODE = '23503'; END IF;
  IF NOT governance.ws_is_human(p_owner) THEN RAISE EXCEPTION 'product baseline rejected (owner): an accountable owner is a named active human (ADR-005)' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.roles r WHERE r.code = p_owner_role) OR NOT governance.holds_role(p_owner, NULL, NULL, ARRAY[p_owner_role]) THEN
    RAISE EXCEPTION 'product baseline rejected (owner): the owner holds % at PLATFORM', coalesce(p_owner_role, '<none>') USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_domain_boundary, ''))) < 3 THEN RAISE EXCEPTION 'product baseline rejected (domain): the capability''s domain boundary is named' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'product baseline rejected (reason): an assignment states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT o.owner_principal_id INTO prev FROM governance.ws_capability_owners o WHERE o.capability_id = p_capability AND o.superseded_at IS NULL FOR UPDATE;
  SELECT coalesce(max(o.version), 0) INTO v FROM governance.ws_capability_owners o WHERE o.capability_id = p_capability;
  UPDATE governance.ws_capability_owners SET superseded_at = clock_timestamp() WHERE capability_id = p_capability AND superseded_at IS NULL;
  INSERT INTO governance.ws_capability_owners (capability_id, version, capability_key, owner_principal_id, owner_role, domain_boundary, reason, assigned_by, correlation_id)
  VALUES (p_capability, v + 1, a.external_key, p_owner, p_owner_role, btrim(p_domain_boundary), btrim(p_reason), p_actor, p_correlation);
  PERFORM governance.ledger(NULL, NULL, 'capability', p_capability, v + 1, 'baseline.owner_assigned', p_actor,
            jsonb_build_object('capability_key', a.external_key, 'owner', p_owner, 'owner_role', p_owner_role, 'domain_boundary', btrim(p_domain_boundary), 'previous_owner', prev, 'reason', btrim(p_reason)), p_correlation);
  RETURN jsonb_build_object('capability_id', p_capability, 'capability_key', a.external_key, 'version', v + 1, 'owner', p_owner, 'owner_name', governance.ws_principal_name(p_owner),
                            'owner_role', p_owner_role, 'domain_boundary', btrim(p_domain_boundary), 'previous_owner', prev);
END $$;
REVOKE ALL ON FUNCTION governance.ws_assign_owner(uuid, uuid, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ws_assign_owner(uuid, uuid, text, text, text, uuid, uuid) TO eye_commit;

/* VALIDATE a decision-rights matrix's rows; returns the normalised rows (sorted) or raises in the class form:
   (rows) the vocabulary; (singular) one approve row per subject; (separation_of_duties) the approver's role never the proposer's, the
   auditor's role never the approver's, proposer's or operator's, a named principal never in two of propose/approve/audit for one subject;
   (delegation) only approve/review delegate, to an active human holding the row's role, never the row's own principal, at most 90 days. */
CREATE OR REPLACE FUNCTION governance.ws_rights_rows(p_rows jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = governance, identity, pg_catalog, pg_temp AS $$
DECLARE r jsonb; v_out jsonb := '[]'::jsonb; s text; v_roles text[]; v_pp text[];
BEGIN
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) = 0 OR jsonb_array_length(p_rows) > 500 THEN
    RAISE EXCEPTION 'decision rights rejected (rows): a matrix is a non-empty list of rows (at most 500)' USING ERRCODE = '22023';
  END IF;
  FOR r IN SELECT x FROM jsonb_array_elements(p_rows) x LOOP
    IF jsonb_typeof(r) <> 'object' OR coalesce(r ->> 'subject', '') = '' OR NOT ((r ->> 'duty') = ANY (governance.ws_duties())) OR NOT EXISTS (SELECT 1 FROM identity.roles x WHERE x.code = r ->> 'role') THEN
      RAISE EXCEPTION 'decision rights rejected (rows): each row names a subject, a duty (%) and a known role', array_to_string(governance.ws_duties(), ' | ') USING ERRCODE = '22023';
    END IF;
    IF NOT ((r ->> 'subject') = ANY (governance.ws_act_classes()))
       AND NOT EXISTS (SELECT 1 FROM governance.artifacts a WHERE a.kind = 'capability' AND a.superseded_at IS NULL AND a.external_key = r ->> 'subject') THEN
      RAISE EXCEPTION 'decision rights rejected (unknown_subject): % is neither an act class (%) nor a current capability''s key', r ->> 'subject', array_to_string(governance.ws_act_classes(), ', ') USING ERRCODE = '23503';
    END IF;
    IF r ? 'principal' AND jsonb_typeof(r -> 'principal') = 'string' THEN
      IF NOT governance.ws_is_human((r ->> 'principal')::uuid) OR NOT governance.holds_role((r ->> 'principal')::uuid, NULL, NULL, ARRAY[r ->> 'role']) THEN
        RAISE EXCEPTION 'decision rights rejected (rows): the named principal of % / % is an active human holding % at PLATFORM', r ->> 'subject', r ->> 'duty', r ->> 'role' USING ERRCODE = '22023';
      END IF;
    END IF;
    IF r ? 'delegate' AND jsonb_typeof(r -> 'delegate') = 'object' THEN
      IF NOT ((r ->> 'duty') IN ('approve', 'review')) OR jsonb_typeof(r -> 'principal') IS DISTINCT FROM 'string' THEN
        RAISE EXCEPTION 'decision rights rejected (delegation): only a named principal''s approve or review duty is delegated' USING ERRCODE = '22023';
      END IF;
      IF NOT governance.ws_is_human((r -> 'delegate' ->> 'to')::uuid) OR NOT governance.holds_role((r -> 'delegate' ->> 'to')::uuid, NULL, NULL, ARRAY[r ->> 'role'])
         OR (r -> 'delegate' ->> 'to') = (r ->> 'principal') THEN
        RAISE EXCEPTION 'decision rights rejected (delegation): the delegate of % / % is another active human holding %', r ->> 'subject', r ->> 'duty', r ->> 'role' USING ERRCODE = '22023';
      END IF;
      IF coalesce(r -> 'delegate' ->> 'until', '') !~ '^\d{4}-\d{2}-\d{2}$' OR (r -> 'delegate' ->> 'until')::date < (clock_timestamp() AT TIME ZONE 'UTC')::date
         OR (r -> 'delegate' ->> 'until')::date > (clock_timestamp() AT TIME ZONE 'UTC')::date + 90 THEN
        RAISE EXCEPTION 'decision rights rejected (delegation): a delegation runs until a day (YYYY-MM-DD) from today to 90 days ahead' USING ERRCODE = '22023';
      END IF;
    END IF;
    v_out := v_out || jsonb_build_object('subject', r ->> 'subject', 'duty', r ->> 'duty', 'role', r ->> 'role',
                                         'principal', CASE WHEN jsonb_typeof(r -> 'principal') = 'string' THEN r -> 'principal' ELSE 'null'::jsonb END,
                                         'delegate', CASE WHEN jsonb_typeof(r -> 'delegate') = 'object' THEN jsonb_build_object('to', r -> 'delegate' ->> 'to', 'until', r -> 'delegate' ->> 'until') ELSE 'null'::jsonb END);
  END LOOP;
  FOR s IN SELECT DISTINCT x ->> 'subject' FROM jsonb_array_elements(v_out) x LOOP
    IF (SELECT count(*) FROM jsonb_array_elements(v_out) x WHERE x ->> 'subject' = s AND x ->> 'duty' = 'approve') > 1 THEN
      RAISE EXCEPTION 'decision rights rejected (singular): % has more than one approve row — decision rights are singular', s USING ERRCODE = '22023';
    END IF;
    IF (SELECT count(*) FROM jsonb_array_elements(v_out) x WHERE x ->> 'subject' = s AND x ->> 'duty' = 'audit') > 0 AND (SELECT count(*) FROM jsonb_array_elements(v_out) x WHERE x ->> 'subject' = s AND x ->> 'duty' = 'approve') = 0 THEN
      RAISE EXCEPTION 'decision rights rejected (singular): % is audited but has no approver', s USING ERRCODE = '22023';
    END IF;
    SELECT array_agg(x ->> 'role') INTO v_roles FROM jsonb_array_elements(v_out) x WHERE x ->> 'subject' = s AND x ->> 'duty' = 'approve';
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_out) x WHERE x ->> 'subject' = s AND x ->> 'duty' = 'propose' AND x ->> 'role' = ANY (coalesce(v_roles, '{}'))) THEN
      RAISE EXCEPTION 'decision rights rejected (separation_of_duties): % — the approving role also proposes', s USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_out) x JOIN jsonb_array_elements(v_out) y ON y ->> 'subject' = s AND y ->> 'duty' IN ('approve', 'propose', 'operate') AND y ->> 'role' = x ->> 'role'
                WHERE x ->> 'subject' = s AND x ->> 'duty' = 'audit') THEN
      RAISE EXCEPTION 'decision rights rejected (separation_of_duties): % — the auditing role also proposes, approves or operates', s USING ERRCODE = '42501';
    END IF;
    SELECT array_agg(DISTINCT x ->> 'principal') INTO v_pp FROM jsonb_array_elements(v_out) x WHERE x ->> 'subject' = s AND x ->> 'duty' IN ('propose', 'approve', 'audit') AND jsonb_typeof(x -> 'principal') = 'string'
      GROUP BY x ->> 'principal' HAVING count(DISTINCT x ->> 'duty') > 1 LIMIT 1;
    IF v_pp IS NOT NULL THEN RAISE EXCEPTION 'decision rights rejected (separation_of_duties): % — one named principal holds two of propose / approve / audit', s USING ERRCODE = '42501'; END IF;
  END LOOP;
  RETURN (SELECT jsonb_agg(x ORDER BY x ->> 'subject', array_position(governance.ws_duties(), x ->> 'duty'), x ->> 'role', coalesce(x ->> 'principal', '')) FROM jsonb_array_elements(v_out) x);
END $$;
REVOKE ALL ON FUNCTION governance.ws_rights_rows(jsonb) FROM PUBLIC;

/* PROPOSE a decision-rights matrix version (the product authority or the conformance steward). */
CREATE OR REPLACE FUNCTION governance.ws_propose_rights(p_matrix uuid, p_rows jsonb, p_expected_version int, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE v_cur int; v_rows jsonb; v_digest text; v_ref text;
BEGIN
  PERFORM governance.assert_platform('governance.rights.propose', p_actor, 'decision rights');
  IF NOT governance.holds_role(p_actor, NULL, NULL, ARRAY['product_authority', 'conformance_steward']) THEN
    RAISE EXCEPTION 'decision rights rejected (authority): a matrix is proposed by the product authority or the conformance steward' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('governance.ws_decision_rights:' || p_matrix::text, 0));
  SELECT coalesce(max(r.version), 0), max(r.ref) INTO v_cur, v_ref FROM governance.ws_decision_rights r WHERE r.matrix_id = p_matrix;
  IF p_expected_version IS DISTINCT FROM v_cur THEN
    RAISE EXCEPTION 'decision rights rejected (stale): the matrix is at version % (expected %)', v_cur, coalesce(p_expected_version::text, '<none>') USING ERRCODE = '23505';
  END IF;
  v_rows := governance.ws_rights_rows(p_rows);
  v_ref := coalesce(v_ref, governance.ws_next_ref('PDR'));
  v_digest := governance.digest(jsonb_build_object('matrix_id', p_matrix, 'version', v_cur + 1, 'rows', v_rows));
  UPDATE governance.ws_decision_rights SET state = 'superseded' WHERE matrix_id = p_matrix AND state = 'proposed';
  INSERT INTO governance.ws_decision_rights (matrix_id, version, ref, rows, digest, proposed_by, correlation_id) VALUES (p_matrix, v_cur + 1, v_ref, v_rows, v_digest, p_actor, p_correlation);
  IF v_cur = 0 THEN  -- a later version is registered when decided (the approved matrix's artifact stays current until then)
    PERFORM governance.ws_register(p_matrix, 'baseline', v_ref, 'Decision-rights matrix ' || v_ref || ' (propose / review / approve / operate / audit)', p_actor, 'product_authority', 'controlling', 'V8',
              'proposed', jsonb_build_object('object', 'decision_rights', 'version', v_cur + 1, 'rows', jsonb_array_length(v_rows)), v_digest, p_actor, p_correlation);
  END IF;
  PERFORM governance.ledger(NULL, NULL, 'decision_rights', p_matrix, v_cur + 1, 'rights.proposed', p_actor, jsonb_build_object('digest', v_digest, 'rows', jsonb_array_length(v_rows)), p_correlation);
  RETURN jsonb_build_object('matrix_id', p_matrix, 'ref', v_ref, 'version', v_cur + 1, 'state', 'proposed', 'digest', v_digest, 'rows', v_rows);
END $$;
REVOKE ALL ON FUNCTION governance.ws_propose_rights(uuid, jsonb, int, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ws_propose_rights(uuid, jsonb, int, uuid, uuid) TO eye_commit;

/* DECIDE (approve | reject) a matrix version — the product authority (the approver test: never the proposer), on the exact digest; APPROVE is
   SIGNED (`decision_rights`); an approved matrix supersedes the previous one; when one is in force, its own `decision_rights` approve row governs. */
CREATE OR REPLACE FUNCTION governance.ws_decide_rights(p_matrix uuid, p_version int, p_decision text, p_digest text, p_reason text, p_signature uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE m governance.ws_decision_rights%ROWTYPE; v_via jsonb;
BEGIN
  PERFORM governance.assert_platform('governance.rights.decide', p_actor, 'decision rights');
  SELECT * INTO m FROM governance.ws_decision_rights x WHERE x.matrix_id = p_matrix AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'decision rights rejected (unknown_matrix): no decision-rights matrix %/v%', p_matrix, p_version USING ERRCODE = '23503'; END IF;
  PERFORM governance.assert_approver('decision rights', p_actor, NULL, NULL, ARRAY['product_authority'], m.proposed_by, NULL, 'deciding the decision-rights matrix');
  v_via := governance.ws_assert_rights('decision rights', 'decision_rights', 'approve', p_actor);
  IF m.state <> 'proposed' THEN RAISE EXCEPTION 'decision rights rejected (state): version % is %', p_version, m.state USING ERRCODE = '23505'; END IF;
  IF p_digest IS DISTINCT FROM m.digest THEN RAISE EXCEPTION 'decision rights rejected (stale): the decision names a digest other than version %''s', p_version USING ERRCODE = '23505'; END IF;
  IF p_decision NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'decision rights rejected (decision): approve or reject' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'decision rights rejected (reason): a decision states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_decision = 'approve' THEN
    IF NOT governance.ws_signed(p_signature, 'decision_rights', p_matrix, p_version, m.digest, p_actor, 'governance.rights.decide') THEN
      RAISE EXCEPTION 'decision rights rejected (signature): approval carries the decider''s signature over the matrix digest' USING ERRCODE = '22023';
    END IF;
    UPDATE governance.ws_decision_rights SET state = 'superseded' WHERE state = 'approved';
  END IF;
  UPDATE governance.ws_decision_rights SET state = CASE WHEN p_decision = 'approve' THEN 'approved' ELSE 'rejected' END, decided_by = p_actor, decided_at = clock_timestamp(),
         decision_reason = btrim(p_reason), signature_id = CASE WHEN p_decision = 'approve' THEN p_signature END
   WHERE matrix_id = p_matrix AND version = p_version;
  PERFORM governance.ws_register(p_matrix, 'baseline', m.ref, 'Decision-rights matrix ' || m.ref || ' (propose / review / approve / operate / audit)', p_actor, 'product_authority', 'controlling', 'V8',
            CASE WHEN p_decision = 'approve' THEN 'active' ELSE 'retired' END, jsonb_build_object('object', 'decision_rights', 'version', p_version, 'state', CASE WHEN p_decision = 'approve' THEN 'approved' ELSE 'rejected' END),
            m.digest, p_actor, p_correlation);
  PERFORM governance.ledger(NULL, NULL, 'decision_rights', p_matrix, p_version, CASE WHEN p_decision = 'approve' THEN 'rights.approved' ELSE 'rights.rejected' END, p_actor,
            jsonb_build_object('digest', m.digest, 'reason', btrim(p_reason), 'signature_id', p_signature, 'rights_via', v_via), p_correlation);
  RETURN jsonb_build_object('matrix_id', p_matrix, 'ref', m.ref, 'version', p_version, 'state', CASE WHEN p_decision = 'approve' THEN 'approved' ELSE 'rejected' END, 'digest', m.digest, 'signature_id', p_signature);
END $$;
REVOKE ALL ON FUNCTION governance.ws_decide_rights(uuid, int, text, text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ws_decide_rights(uuid, int, text, text, text, uuid, uuid, uuid) TO eye_commit;

-- §PG.3 THE ONE EXCEPTION REGISTRY ───────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE governance.ws_exceptions (
  exception_id          uuid NOT NULL,
  version               int  NOT NULL CHECK (version >= 1),
  scope                 text NOT NULL DEFAULT 'PLATFORM' CHECK (scope = 'PLATFORM'),
  ref                   text NOT NULL,
  renewal_of            int,
  class                 text NOT NULL DEFAULT 'product' CHECK (class = 'product'),
  title                 text NOT NULL CHECK (length(btrim(title)) BETWEEN 8 AND 300),
  requirement_ref       text NOT NULL CHECK (length(btrim(requirement_ref)) BETWEEN 3 AND 200),
  requirement_artifact  uuid,
  contract_key          text NOT NULL CHECK (length(btrim(contract_key)) BETWEEN 3 AND 200),
  system_scope          uuid[] NOT NULL,
  customer_scope        jsonb NOT NULL CHECK (jsonb_typeof(customer_scope) = 'object'),
  reason                text NOT NULL CHECK (length(btrim(reason)) >= 20),
  evidence              jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'array'),
  risk                  jsonb NOT NULL CHECK (jsonb_typeof(risk) = 'object'),
  affected_invariants   text[] NOT NULL,
  compensating_controls jsonb NOT NULL CHECK (jsonb_typeof(compensating_controls) = 'array'),
  owner_principal_id    uuid NOT NULL,
  expands_authority     boolean NOT NULL,
  removes_control       boolean NOT NULL,
  approver_roles        text[] NOT NULL,
  starts_at             timestamptz NOT NULL,
  expires_at            timestamptz NOT NULL,
  monitoring            text NOT NULL CHECK (length(btrim(monitoring)) >= 8),
  exit_criteria         text NOT NULL CHECK (length(btrim(exit_criteria)) >= 8),
  remediation_plan      text NOT NULL CHECK (length(btrim(remediation_plan)) >= 8),
  affected_artifacts    uuid[] NOT NULL,
  state                 text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'approved', 'rejected', 'withdrawn', 'expired', 'closed', 'superseded')),
  digest                text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  proposed_by           uuid NOT NULL,
  proposed_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_by            uuid,
  decided_role          text,
  decided_at            timestamptz,
  decision_reason       text,
  signature_id          uuid,
  expired_at            timestamptz,
  closed_by             uuid,
  closed_at             timestamptz,
  close_reason          text,
  exit_evidence         jsonb,
  claim                 text NOT NULL DEFAULT 'demonstration' CHECK (claim = 'demonstration'),
  correlation_id        uuid NOT NULL,
  PRIMARY KEY (exception_id, version),
  CONSTRAINT wex_window CHECK (expires_at > starts_at AND expires_at <= starts_at + interval '366 days')
);
CREATE UNIQUE INDEX wex_one_open ON governance.ws_exceptions (exception_id) WHERE state = 'proposed';
CREATE INDEX wex_contract ON governance.ws_exceptions (contract_key);
CREATE INDEX wex_expiry ON governance.ws_exceptions (expires_at) WHERE state = 'approved';

/* REPEATS (V03-T-451): a review opened when a contract accumulates REPEAT_THRESHOLD (3) distinct exceptions, or one exception's third period
   (a second renewal); while it is open, no exception on the contract is approved; decided by the product authority — remediation (a plan, an
   owner, a due day) or a formal change review (a change proposal). */
CREATE TABLE governance.ws_exception_reviews (
  review_id       uuid PRIMARY KEY,
  scope           text NOT NULL DEFAULT 'PLATFORM' CHECK (scope = 'PLATFORM'),
  ref             text NOT NULL,
  contract_key    text NOT NULL,
  trigger         text NOT NULL CHECK (trigger IN ('repeated_exceptions', 'repeated_renewal')),
  exceptions      uuid[] NOT NULL,
  state           text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'remediation', 'change_review')),
  opened_by       uuid NOT NULL,
  opened_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_by      uuid,
  decided_at      timestamptz,
  decision_reason text,
  remediation     jsonb,
  change_proposal uuid,
  correlation_id  uuid NOT NULL
);
CREATE UNIQUE INDEX wer_one_open ON governance.ws_exception_reviews (contract_key) WHERE state = 'open';
CREATE OR REPLACE FUNCTION governance.ws_repeat_threshold() RETURNS int LANGUAGE sql IMMUTABLE AS $$ SELECT 3 $$;
GRANT EXECUTE ON FUNCTION governance.ws_repeat_threshold() TO eye_app, eye_commit;
/* Evidence is CURRENT for a renewal or a closure when captured within this many days (and after the prior approval). */
CREATE OR REPLACE FUNCTION governance.ws_evidence_currency_days() RETURNS int LANGUAGE sql IMMUTABLE AS $$ SELECT 30 $$;
GRANT EXECUTE ON FUNCTION governance.ws_evidence_currency_days() TO eye_app, eye_commit;

/* The customer scope, validated: {"all": true} or {"tenants": [uuid…], "domains": [{"tenant", "domain"}…]} naming known tenants / domains. */
CREATE OR REPLACE FUNCTION governance.ws_customer_scope(p jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = governance, tenancy, pg_catalog, pg_temp AS $$
DECLARE x jsonb; v_t jsonb := '[]'::jsonb; v_d jsonb := '[]'::jsonb;
BEGIN
  IF jsonb_typeof(p) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'governance exception rejected (customer_scope): the customer scope is an object' USING ERRCODE = '22023'; END IF;
  IF coalesce((p ->> 'all')::boolean, false) THEN RETURN jsonb_build_object('all', true, 'tenants', '[]'::jsonb, 'domains', '[]'::jsonb); END IF;
  FOR x IN SELECT y FROM jsonb_array_elements(coalesce(p -> 'tenants', '[]'::jsonb)) y LOOP
    IF NOT EXISTS (SELECT 1 FROM tenancy.tenants t WHERE t.id::text = x #>> '{}') THEN RAISE EXCEPTION 'governance exception rejected (unknown_tenant): % is not a tenant', x #>> '{}' USING ERRCODE = '23503'; END IF;
    v_t := v_t || to_jsonb(x #>> '{}');
  END LOOP;
  FOR x IN SELECT y FROM jsonb_array_elements(coalesce(p -> 'domains', '[]'::jsonb)) y LOOP
    IF NOT EXISTS (SELECT 1 FROM tenancy.domains d WHERE d.id::text = x ->> 'domain' AND d.tenant_id::text = x ->> 'tenant') THEN
      RAISE EXCEPTION 'governance exception rejected (unknown_domain): % is not a domain of %', x ->> 'domain', x ->> 'tenant' USING ERRCODE = '23503';
    END IF;
    v_d := v_d || jsonb_build_object('tenant', x ->> 'tenant', 'domain', x ->> 'domain');
  END LOOP;
  IF jsonb_array_length(v_t) + jsonb_array_length(v_d) = 0 THEN
    RAISE EXCEPTION 'governance exception rejected (customer_scope): the customer scope names all customers or at least one tenant or domain' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('all', false, 'tenants', v_t, 'domains', v_d);
END $$;
REVOKE ALL ON FUNCTION governance.ws_customer_scope(jsonb) FROM PUBLIC;

/* Does an exception's customer scope cover a domain? */
CREATE OR REPLACE FUNCTION governance.ws_scope_covers(p_scope jsonb, p_tenant uuid, p_domain uuid) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce((p_scope ->> 'all')::boolean, false)
      OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(p_scope -> 'tenants', '[]'::jsonb)) t WHERE t = p_tenant::text)
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(p_scope -> 'domains', '[]'::jsonb)) d WHERE d ->> 'tenant' = p_tenant::text AND d ->> 'domain' = p_domain::text) $$;
GRANT EXECUTE ON FUNCTION governance.ws_scope_covers(jsonb, uuid, uuid) TO eye_app, eye_commit;

/* The owners of the components an exception's system scope names (ES-02-004: none of them approves it). */
CREATE OR REPLACE FUNCTION governance.ws_scope_owners(p_scope uuid[]) RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
  SELECT coalesce(array_agg(DISTINCT a.owner_principal_id) FILTER (WHERE a.owner_principal_id IS NOT NULL), '{}') FROM governance.artifacts a
   WHERE a.artifact_id = ANY (coalesce(p_scope, '{}')) AND a.superseded_at IS NULL $$;
REVOKE ALL ON FUNCTION governance.ws_scope_owners(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ws_scope_owners(uuid[]) TO eye_app, eye_commit;  -- a read of PLATFORM artifact owners (readable by every context)

/* PROPOSE an exception (new: expected version 0) or its RENEWAL (expected = the current version, which is approved or expired). Every
   V03-T-453 field; constitutional boundaries refused; renewal evidence CURRENT (captured within 30 days, after the prior approval, still
   valid). A proposal that makes its contract a repeat opens the remediation review. */
CREATE OR REPLACE FUNCTION governance.ws_propose_exception(p_exception uuid, p_body jsonb, p_expected_version int, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, identity, public, pg_catalog, pg_temp AS $$
DECLARE cur governance.ws_exceptions%ROWTYPE; v_cur int; v_ref text; v_scope jsonb; v_evidence jsonb; v_inv text[]; v_bad text[]; v_sys uuid[]; v_aff uuid[]; v_owner uuid;
        v_starts timestamptz; v_expires timestamptz; v_req uuid; v_risk jsonb; v_controls jsonb; v_roles text[]; v_digest text; v_version int; v_contract text;
        v_count int; v_review jsonb := NULL; v_rid uuid; v_list uuid[]; v_exp boolean; v_rem boolean;
BEGIN
  PERFORM governance.assert_platform('governance.exception.propose', p_actor, 'governance exception');
  IF NOT governance.holds_role(p_actor, NULL, NULL, governance.ws_governance_roles()) THEN
    RAISE EXCEPTION 'governance exception rejected (authority): an exception is proposed by a holder of a product-governance role' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_body) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'governance exception rejected (body): the exception is an object' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('governance.ws_exceptions:' || p_exception::text, 0));
  SELECT coalesce(max(e.version), 0) INTO v_cur FROM governance.ws_exceptions e WHERE e.exception_id = p_exception;
  IF p_expected_version IS DISTINCT FROM v_cur THEN
    RAISE EXCEPTION 'governance exception rejected (stale): the exception is at version % (expected %)', v_cur, coalesce(p_expected_version::text, '<none>') USING ERRCODE = '23505';
  END IF;
  IF v_cur > 0 THEN
    SELECT * INTO cur FROM governance.ws_exceptions e WHERE e.exception_id = p_exception AND e.version = v_cur;
    IF cur.state NOT IN ('approved', 'expired') THEN
      RAISE EXCEPTION 'governance exception rejected (state): only an approved or expired exception is renewed (version % is %)', v_cur, cur.state USING ERRCODE = '23505';
    END IF;
  END IF;
  -- the fields (a renewal may restate them; the identity — contract, requirement, system scope — stays the exception's)
  v_contract := btrim(coalesce(p_body ->> 'contractKey', cur.contract_key, ''));
  IF v_cur > 0 AND v_contract IS DISTINCT FROM cur.contract_key THEN RAISE EXCEPTION 'governance exception rejected (identity): a renewal keeps its contract (%)', cur.contract_key USING ERRCODE = '22023'; END IF;
  IF length(v_contract) < 3 THEN RAISE EXCEPTION 'governance exception rejected (contract): the contract the exception is against is named (contractKey)' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_body ->> 'requirementRef', cur.requirement_ref, ''))) < 3 THEN RAISE EXCEPTION 'governance exception rejected (requirement): the unmet requirement is named (requirementRef)' USING ERRCODE = '22023'; END IF;
  v_req := CASE WHEN p_body ? 'requirementArtifact' AND jsonb_typeof(p_body -> 'requirementArtifact') = 'string' THEN (p_body ->> 'requirementArtifact')::uuid ELSE cur.requirement_artifact END;
  IF v_req IS NOT NULL THEN PERFORM governance.ws_assert_artifacts('governance exception', ARRAY[v_req], ARRAY['requirement'], 'requirementArtifact'); END IF;
  v_sys := CASE WHEN p_body ? 'systemScope' THEN ARRAY(SELECT DISTINCT x::uuid FROM jsonb_array_elements_text(p_body -> 'systemScope') x ORDER BY 1) ELSE cur.system_scope END;
  IF cardinality(coalesce(v_sys, '{}')) = 0 THEN RAISE EXCEPTION 'governance exception rejected (system_scope): the system scope names at least one component / unit / interface artifact' USING ERRCODE = '22023'; END IF;
  PERFORM governance.ws_assert_artifacts('governance exception', v_sys, ARRAY['component', 'deployable_unit', 'interface', 'schema', 'policy_bundle', 'data_product', 'capability'], 'systemScope');
  v_aff := CASE WHEN p_body ? 'affectedArtifacts' THEN ARRAY(SELECT DISTINCT x::uuid FROM jsonb_array_elements_text(p_body -> 'affectedArtifacts') x ORDER BY 1) ELSE cur.affected_artifacts END;
  v_aff := coalesce(v_aff, '{}');
  PERFORM governance.ws_assert_artifacts('governance exception', v_aff, ARRAY['release_candidate', 'data_product', 'capability', 'deployable_unit'], 'affectedArtifacts');
  v_scope := governance.ws_customer_scope(coalesce(p_body -> 'customerScope', cur.customer_scope));
  v_inv := CASE WHEN p_body ? 'affectedInvariants' THEN ARRAY(SELECT DISTINCT lower(btrim(x)) FROM jsonb_array_elements_text(p_body -> 'affectedInvariants') x ORDER BY 1) ELSE cur.affected_invariants END;
  v_bad := ARRAY(SELECT x FROM unnest(coalesce(v_inv, '{}')) x WHERE x = ANY (governance.ws_constitutional_invariants()));
  IF cardinality(v_bad) > 0 THEN
    RAISE EXCEPTION 'governance exception rejected (constitutional): % cannot be waived through an ordinary exception — it is a constitutional boundary (amend only through the authority chain)', array_to_string(v_bad, ', ') USING ERRCODE = '22023';
  END IF;
  v_risk := coalesce(p_body -> 'risk', cur.risk);
  IF jsonb_typeof(v_risk) IS DISTINCT FROM 'object' OR NOT ((v_risk ->> 'level') IN ('low', 'medium', 'high', 'critical')) OR length(btrim(coalesce(v_risk ->> 'statement', ''))) < 12 THEN
    RAISE EXCEPTION 'governance exception rejected (risk): the risk is {level: low | medium | high | critical, statement (12+ characters)}' USING ERRCODE = '22023';
  END IF;
  v_controls := coalesce(p_body -> 'compensatingControls', cur.compensating_controls);
  IF jsonb_typeof(v_controls) IS DISTINCT FROM 'array' OR jsonb_array_length(v_controls) = 0
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_controls) c WHERE jsonb_typeof(c) <> 'string' OR length(btrim(c #>> '{}')) < 8) THEN
    RAISE EXCEPTION 'governance exception rejected (controls): at least one compensating control is stated (8+ characters each)' USING ERRCODE = '22023';
  END IF;
  v_owner := CASE WHEN jsonb_typeof(p_body -> 'owner') = 'string' THEN (p_body ->> 'owner')::uuid ELSE cur.owner_principal_id END;
  IF v_owner IS NULL OR NOT governance.ws_is_human(v_owner) THEN RAISE EXCEPTION 'governance exception rejected (owner): the exception''s owner is a named active human' USING ERRCODE = '22023'; END IF;
  v_exp := coalesce((p_body ->> 'expandsAuthority')::boolean, cur.expands_authority, false);
  v_rem := coalesce((p_body ->> 'removesControl')::boolean, cur.removes_control, false);
  v_starts := coalesce((p_body ->> 'startsAt')::timestamptz, clock_timestamp());
  v_expires := (p_body ->> 'expiresAt')::timestamptz;
  IF v_expires IS NULL OR v_expires <= clock_timestamp() OR v_expires <= v_starts OR v_expires > v_starts + interval '366 days' THEN
    RAISE EXCEPTION 'governance exception rejected (expiry): an exception expires at a named instant after now and its start, within 366 days ("later" is not an expiry)' USING ERRCODE = '22023';
  END IF;
  IF v_starts < clock_timestamp() - interval '1 day' THEN RAISE EXCEPTION 'governance exception rejected (start): an exception starts now or later (never back-dated)' USING ERRCODE = '22023'; END IF;
  FOR v_ref IN SELECT k FROM unnest(ARRAY['title', 'reason', 'monitoring', 'exitCriteria', 'remediationPlan']) k LOOP
    IF length(btrim(coalesce(p_body ->> v_ref, CASE v_ref WHEN 'title' THEN cur.title WHEN 'reason' THEN cur.reason WHEN 'monitoring' THEN cur.monitoring WHEN 'exitCriteria' THEN cur.exit_criteria ELSE cur.remediation_plan END, ''))) < (CASE v_ref WHEN 'reason' THEN 20 ELSE 8 END) THEN
      RAISE EXCEPTION 'governance exception rejected (%): % is stated (% + characters)', lower(v_ref), v_ref, CASE v_ref WHEN 'reason' THEN 20 ELSE 8 END USING ERRCODE = '22023';
    END IF;
  END LOOP;
  -- the evidence: named on a new exception; CURRENT on a renewal (captured within 30 days, after the prior approval, still valid)
  v_evidence := governance.ws_evidence('governance exception', p_body -> 'evidence', v_cur > 0, governance.ws_evidence_currency_days(), CASE WHEN v_cur > 0 THEN cur.decided_at END);
  v_roles := CASE WHEN v_exp OR v_rem THEN ARRAY['independent_assurance'] ELSE ARRAY['independent_assurance', 'product_authority'] END;
  v_version := v_cur + 1;
  v_ref := CASE WHEN v_cur > 0 THEN cur.ref ELSE governance.ws_next_ref('GEX') END;
  v_digest := governance.digest(jsonb_build_object('exception_id', p_exception, 'version', v_version, 'title', btrim(coalesce(p_body ->> 'title', cur.title)),
               'requirement_ref', btrim(coalesce(p_body ->> 'requirementRef', cur.requirement_ref)), 'requirement_artifact', v_req, 'contract_key', v_contract, 'system_scope', to_jsonb(v_sys),
               'customer_scope', v_scope, 'reason', btrim(coalesce(p_body ->> 'reason', cur.reason)), 'evidence', v_evidence, 'risk', v_risk, 'affected_invariants', to_jsonb(coalesce(v_inv, '{}')),
               'compensating_controls', v_controls, 'owner', v_owner, 'expands_authority', v_exp, 'removes_control', v_rem, 'approver_roles', to_jsonb(v_roles), 'starts_at', v_starts,
               'expires_at', v_expires, 'monitoring', btrim(coalesce(p_body ->> 'monitoring', cur.monitoring)), 'exit_criteria', btrim(coalesce(p_body ->> 'exitCriteria', cur.exit_criteria)),
               'remediation_plan', btrim(coalesce(p_body ->> 'remediationPlan', cur.remediation_plan)), 'affected_artifacts', to_jsonb(v_aff), 'renewal_of', CASE WHEN v_cur > 0 THEN v_cur END));
  INSERT INTO governance.ws_exceptions (exception_id, version, ref, renewal_of, title, requirement_ref, requirement_artifact, contract_key, system_scope, customer_scope, reason, evidence, risk,
                                        affected_invariants, compensating_controls, owner_principal_id, expands_authority, removes_control, approver_roles, starts_at, expires_at, monitoring,
                                        exit_criteria, remediation_plan, affected_artifacts, digest, proposed_by, correlation_id)
  VALUES (p_exception, v_version, v_ref, CASE WHEN v_cur > 0 THEN v_cur END, btrim(coalesce(p_body ->> 'title', cur.title)), btrim(coalesce(p_body ->> 'requirementRef', cur.requirement_ref)), v_req,
          v_contract, v_sys, v_scope, btrim(coalesce(p_body ->> 'reason', cur.reason)), v_evidence, v_risk, coalesce(v_inv, '{}'), v_controls, v_owner, v_exp, v_rem, v_roles, v_starts, v_expires,
          btrim(coalesce(p_body ->> 'monitoring', cur.monitoring)), btrim(coalesce(p_body ->> 'exitCriteria', cur.exit_criteria)), btrim(coalesce(p_body ->> 'remediationPlan', cur.remediation_plan)),
          v_aff, v_digest, p_actor, p_correlation);
  IF v_cur = 0 THEN  -- a renewal is registered when decided (the exception's artifact keeps its standing until then)
    PERFORM governance.ws_register(p_exception, 'exception', v_ref, btrim(coalesce(p_body ->> 'title', cur.title)), v_owner, NULL, NULL, NULL, 'proposed',
              jsonb_build_object('version', v_version, 'state', 'proposed', 'contract_key', v_contract, 'expires_at', v_expires, 'class', 'product'), v_digest, p_actor, p_correlation);
    FOR v_rid IN SELECT unnest(v_sys) LOOP PERFORM governance.ws_link(p_exception, v_rid, 'excepts', jsonb_build_object('scope', 'system'), p_actor, p_correlation); END LOOP;
    IF v_req IS NOT NULL THEN PERFORM governance.ws_link(p_exception, v_req, 'excepts', jsonb_build_object('scope', 'requirement'), p_actor, p_correlation); END IF;
    FOR v_rid IN SELECT unnest(v_aff) LOOP PERFORM governance.ws_link(p_exception, v_rid, 'covers', jsonb_build_object('scope', 'affected promotion'), p_actor, p_correlation); END LOOP;
  END IF;
  -- REPEATS (V03-T-451): the contract's distinct live-or-proposed exceptions, or this exception's third period
  SELECT count(DISTINCT e.exception_id), array_agg(DISTINCT e.exception_id) INTO v_count, v_list FROM governance.ws_exceptions e
   WHERE e.contract_key = v_contract AND e.state IN ('proposed', 'approved', 'expired', 'closed', 'superseded');
  IF (v_cur = 0 AND v_count >= governance.ws_repeat_threshold()) OR v_version >= 3 THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('governance.ws_exception_reviews:' || v_contract, 0));
    SELECT jsonb_build_object('review_id', r.review_id, 'ref', r.ref, 'state', r.state, 'existing', true) INTO v_review FROM governance.ws_exception_reviews r WHERE r.contract_key = v_contract AND r.state = 'open';
    IF v_review IS NULL THEN
      v_rid := gen_random_uuid();
      INSERT INTO governance.ws_exception_reviews (review_id, ref, contract_key, trigger, exceptions, opened_by, correlation_id)
      VALUES (v_rid, governance.ws_next_ref('GRR'), v_contract, CASE WHEN v_cur = 0 THEN 'repeated_exceptions' ELSE 'repeated_renewal' END, v_list, p_actor, p_correlation);
      PERFORM governance.ledger(NULL, NULL, 'governance_exception', v_rid, 1, 'exception.review_opened', p_actor,
                jsonb_build_object('contract_key', v_contract, 'trigger', CASE WHEN v_cur = 0 THEN 'repeated_exceptions' ELSE 'repeated_renewal' END, 'exceptions', to_jsonb(v_list),
                                   'rule', 'repeated exceptions are architecture evidence: remediation or formal change review — they never quietly redefine the baseline'), p_correlation);
      SELECT jsonb_build_object('review_id', r.review_id, 'ref', r.ref, 'state', r.state, 'existing', false) INTO v_review FROM governance.ws_exception_reviews r WHERE r.review_id = v_rid;
    END IF;
  END IF;
  PERFORM governance.ledger(NULL, NULL, 'governance_exception', p_exception, v_version, CASE WHEN v_cur = 0 THEN 'exception.proposed' ELSE 'exception.renewal_proposed' END, p_actor,
            jsonb_build_object('digest', v_digest, 'contract_key', v_contract, 'expires_at', v_expires, 'approver_roles', to_jsonb(v_roles), 'renewal_of', CASE WHEN v_cur > 0 THEN v_cur END,
                               'review', v_review), p_correlation);
  RETURN jsonb_build_object('exception_id', p_exception, 'ref', v_ref, 'version', v_version, 'state', 'proposed', 'digest', v_digest, 'approver_roles', to_jsonb(v_roles),
                            'renewal_of', CASE WHEN v_cur > 0 THEN v_cur END, 'review', v_review, 'expires_at', v_expires);
END $$;
REVOKE ALL ON FUNCTION governance.ws_propose_exception(uuid, jsonb, int, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ws_propose_exception(uuid, jsonb, int, uuid, uuid) TO eye_commit;

/* DECIDE (approve | reject) an exception version — INDEPENDENTLY: a named human holding one of the version's approver roles, never the
   proposer, never the owner, never an owner of a component the exception expands (ES-02-004); the decision-rights matrix's `exception`
   approve row when one governs; on the exact digest; HELD while a remediation review on the contract is open; refused once the window has
   passed; evidence still valid. APPROVE is SIGNED (`exception_approval`). A RENEWAL's approval supersedes the prior version and LIFTS the
   holds its expiry opened (the affected promotion released) and closes its attention items. */
CREATE OR REPLACE FUNCTION governance.ws_decide_exception(p_exception uuid, p_version int, p_decision text, p_digest text, p_reason text, p_signature uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, executive, public, pg_catalog, pg_temp AS $$
DECLARE e governance.ws_exceptions%ROWTYPE; v_owners uuid[]; v_review governance.ws_exception_reviews%ROWTYPE; v_lifted jsonb := '[]'::jsonb; v_role text; v_via jsonb; v_items jsonb := '[]'::jsonb; d record;
BEGIN
  PERFORM governance.assert_platform('governance.exception.decide', p_actor, 'governance exception');
  SELECT * INTO e FROM governance.ws_exceptions x WHERE x.exception_id = p_exception AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'governance exception rejected (unknown_exception): no exception %/v%', p_exception, p_version USING ERRCODE = '23503'; END IF;
  v_owners := governance.ws_scope_owners(e.system_scope);
  IF p_actor = ANY (v_owners) AND (e.expands_authority OR e.removes_control) THEN
    RAISE EXCEPTION 'governance exception rejected (separation_of_duties): you own a component whose authority this exception expands or whose independent control it removes — no component owner approves it (ES-02-004)' USING ERRCODE = '42501';
  END IF;
  IF p_actor = e.owner_principal_id THEN
    RAISE EXCEPTION 'governance exception rejected (separation_of_duties): the exception''s owner never approves it (independent approver)' USING ERRCODE = '42501';
  END IF;
  PERFORM governance.assert_approver('governance exception', p_actor, NULL, NULL, e.approver_roles, e.proposed_by, array_append(v_owners, e.owner_principal_id), 'approving an exception');
  v_via := governance.ws_assert_rights('governance exception', 'exception', 'approve', p_actor);
  IF e.state <> 'proposed' THEN RAISE EXCEPTION 'governance exception rejected (state): version % is %', p_version, e.state USING ERRCODE = '23505'; END IF;
  IF p_digest IS DISTINCT FROM e.digest THEN RAISE EXCEPTION 'governance exception rejected (stale): the decision names a digest other than version %''s', p_version USING ERRCODE = '23505'; END IF;
  IF p_decision NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'governance exception rejected (decision): approve or reject' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'governance exception rejected (reason): a decision states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT r.code INTO v_role FROM identity.role_bindings b JOIN identity.roles r ON r.code = b.role_code
   WHERE b.principal_id = p_actor AND b.revoked_at IS NULL AND b.scope = 'PLATFORM' AND b.role_code = ANY (e.approver_roles) ORDER BY array_position(e.approver_roles, b.role_code) LIMIT 1;
  IF p_decision = 'approve' THEN
    SELECT * INTO v_review FROM governance.ws_exception_reviews r WHERE r.contract_key = e.contract_key AND r.state = 'open';
    IF FOUND THEN
      RAISE EXCEPTION 'governance exception rejected (held): the repeated exceptions against % are under remediation review % — no exception on the contract is approved until the product authority decides it (V03-T-451)', e.contract_key, v_review.ref USING ERRCODE = '23505';
    END IF;
    IF e.expires_at <= clock_timestamp() THEN
      RAISE EXCEPTION 'governance exception rejected (expired): version % expired at % before it was approved — propose a renewal with current evidence', p_version, e.expires_at USING ERRCODE = '23505';
    END IF;
    PERFORM governance.ws_evidence('governance exception', e.evidence, true, 366, NULL);
    IF NOT governance.ws_signed(p_signature, 'exception_approval', p_exception, p_version, e.digest, p_actor, 'governance.exception.decide') THEN
      RAISE EXCEPTION 'governance exception rejected (signature): approval carries the approver''s signature over the exception digest' USING ERRCODE = '22023';
    END IF;
    IF e.renewal_of IS NOT NULL THEN
      UPDATE governance.ws_exceptions SET state = 'superseded' WHERE exception_id = p_exception AND version = e.renewal_of AND state IN ('approved', 'expired');
      v_lifted := governance.ws_lift_holds(p_exception, 'exception_expired', format('renewed: %s v%s approved by %s with current evidence', e.ref, p_version, governance.ws_principal_name(p_actor)), p_actor);
      FOR d IN SELECT DISTINCT i.tenant_id, i.domain_id FROM executive.attention_items i WHERE i.subject_id = p_exception AND i.signal_class = 'governance.exception' AND i.state <> 'closed' LOOP
        v_items := v_items || executive.b33_close_items(d.tenant_id, d.domain_id, 'governance.exception', 'governance_exception', p_exception, format('%s renewed (v%s approved)', e.ref, p_version), p_actor, p_correlation);
      END LOOP;
    END IF;
  END IF;
  UPDATE governance.ws_exceptions SET state = CASE WHEN p_decision = 'approve' THEN 'approved' ELSE 'rejected' END, decided_by = p_actor, decided_role = v_role, decided_at = clock_timestamp(),
         decision_reason = btrim(p_reason), signature_id = CASE WHEN p_decision = 'approve' THEN p_signature END
   WHERE exception_id = p_exception AND version = p_version;
  PERFORM governance.ws_register(p_exception, 'exception', e.ref, e.title, e.owner_principal_id, NULL, NULL, NULL, CASE WHEN p_decision = 'approve' THEN 'active' ELSE 'retired' END,
            jsonb_build_object('version', p_version, 'state', CASE WHEN p_decision = 'approve' THEN 'approved' ELSE 'rejected' END, 'contract_key', e.contract_key, 'expires_at', e.expires_at, 'class', 'product'),
            e.digest, p_actor, p_correlation);
  PERFORM governance.ledger(NULL, NULL, 'governance_exception', p_exception, p_version, CASE WHEN p_decision = 'approve' THEN (CASE WHEN e.renewal_of IS NULL THEN 'exception.approved' ELSE 'exception.renewed' END) ELSE 'exception.rejected' END,
            p_actor, jsonb_build_object('digest', e.digest, 'reason', btrim(p_reason), 'role', v_role, 'signature_id', p_signature, 'holds_lifted', v_lifted, 'items_closed', v_items, 'rights_via', v_via), p_correlation);
  RETURN jsonb_build_object('exception_id', p_exception, 'ref', e.ref, 'version', p_version, 'state', CASE WHEN p_decision = 'approve' THEN 'approved' ELSE 'rejected' END, 'digest', e.digest,
                            'decided_role', v_role, 'signature_id', p_signature, 'holds_lifted', v_lifted, 'expires_at', e.expires_at);
END $$;
REVOKE ALL ON FUNCTION governance.ws_decide_exception(uuid, int, text, text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ws_decide_exception(uuid, int, text, text, text, uuid, uuid, uuid) TO eye_commit;

/* WITHDRAW an open proposal (its proposer or its owner). */
CREATE OR REPLACE FUNCTION governance.ws_withdraw_exception(p_exception uuid, p_version int, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE e governance.ws_exceptions%ROWTYPE;
BEGIN
  PERFORM governance.assert_platform('governance.exception.withdraw', p_actor, 'governance exception');
  SELECT * INTO e FROM governance.ws_exceptions x WHERE x.exception_id = p_exception AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'governance exception rejected (unknown_exception): no exception %/v%', p_exception, p_version USING ERRCODE = '23503'; END IF;
  IF p_actor NOT IN (e.proposed_by, e.owner_principal_id) THEN RAISE EXCEPTION 'governance exception rejected (ownership): a proposal is withdrawn by its proposer or its owner' USING ERRCODE = '42501'; END IF;
  IF e.state <> 'proposed' THEN RAISE EXCEPTION 'governance exception rejected (state): version % is %', p_version, e.state USING ERRCODE = '23505'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'governance exception rejected (reason): a withdrawal states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  UPDATE governance.ws_exceptions SET state = 'withdrawn', decided_by = p_actor, decided_at = clock_timestamp(), decision_reason = btrim(p_reason) WHERE exception_id = p_exception AND version = p_version;
  PERFORM governance.ledger(NULL, NULL, 'governance_exception', p_exception, p_version, 'exception.withdrawn', p_actor, jsonb_build_object('reason', btrim(p_reason)), p_correlation);
  RETURN jsonb_build_object('exception_id', p_exception, 'ref', e.ref, 'version', p_version, 'state', 'withdrawn');
END $$;
REVOKE ALL ON FUNCTION governance.ws_withdraw_exception(uuid, int, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ws_withdraw_exception(uuid, int, text, uuid, uuid) TO eye_commit;

/* CLOSE an approved or expired exception on its EXIT CRITERIA (verified closure): an approver of the exception (never its owner or proposer),
   on current exit evidence; the holds its expiry opened are lifted (the requirement is met — nothing is excepted any more). */
CREATE OR REPLACE FUNCTION governance.ws_close_exception(p_exception uuid, p_version int, p_exit_evidence jsonb, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, executive, public, pg_catalog, pg_temp AS $$
DECLARE e governance.ws_exceptions%ROWTYPE; v_ev jsonb; v_lifted jsonb; d record;
BEGIN
  PERFORM governance.assert_platform('governance.exception.close', p_actor, 'governance exception');
  SELECT * INTO e FROM governance.ws_exceptions x WHERE x.exception_id = p_exception AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'governance exception rejected (unknown_exception): no exception %/v%', p_exception, p_version USING ERRCODE = '23503'; END IF;
  PERFORM governance.assert_approver('governance exception', p_actor, NULL, NULL, e.approver_roles, e.proposed_by, array_append(governance.ws_scope_owners(e.system_scope), e.owner_principal_id), 'closing an exception on its exit criteria');
  IF e.state NOT IN ('approved', 'expired') THEN RAISE EXCEPTION 'governance exception rejected (state): version % is % — only an approved or expired exception is closed', p_version, e.state USING ERRCODE = '23505'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'governance exception rejected (reason): a closure states how the exit criteria are met (8+ characters)' USING ERRCODE = '22023'; END IF;
  v_ev := governance.ws_evidence('governance exception', p_exit_evidence, true, governance.ws_evidence_currency_days(), e.decided_at);
  UPDATE governance.ws_exceptions SET state = 'closed', closed_by = p_actor, closed_at = clock_timestamp(), close_reason = btrim(p_reason), exit_evidence = v_ev WHERE exception_id = p_exception AND version = p_version;
  v_lifted := governance.ws_lift_holds(p_exception, 'exception_expired', format('closed: %s v%s exit criteria met (verified by %s)', e.ref, p_version, governance.ws_principal_name(p_actor)), p_actor);
  FOR d IN SELECT DISTINCT i.tenant_id, i.domain_id FROM executive.attention_items i WHERE i.subject_id = p_exception AND i.signal_class = 'governance.exception' AND i.state <> 'closed' LOOP
    PERFORM executive.b33_close_items(d.tenant_id, d.domain_id, 'governance.exception', 'governance_exception', p_exception, format('%s closed on its exit criteria', e.ref), p_actor, p_correlation);
  END LOOP;
  PERFORM governance.ws_register(p_exception, 'exception', e.ref, e.title, e.owner_principal_id, NULL, NULL, NULL, 'retired',
            jsonb_build_object('version', p_version, 'state', 'closed', 'contract_key', e.contract_key, 'class', 'product'), e.digest, p_actor, p_correlation);
  PERFORM governance.ledger(NULL, NULL, 'governance_exception', p_exception, p_version, 'exception.closed', p_actor,
            jsonb_build_object('reason', btrim(p_reason), 'exit_evidence', v_ev, 'holds_lifted', v_lifted), p_correlation);
  RETURN jsonb_build_object('exception_id', p_exception, 'ref', e.ref, 'version', p_version, 'state', 'closed', 'holds_lifted', v_lifted);
END $$;
REVOKE ALL ON FUNCTION governance.ws_close_exception(uuid, int, jsonb, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ws_close_exception(uuid, int, jsonb, text, uuid, uuid) TO eye_commit;

/* THE EXPIRY SWEEP (idempotent; nothing written when nothing expired): every approved exception past its expiry → `expired`, every affected
   artifact HELD (`exception_expired`) until a renewal with current evidence or a closure. Run by the conformance steward at PLATFORM
   (governance.exception.sweep) or by the ATTENTION TICK in a domain (executive.attention.tick: the PLATFORM rows through this definer port,
   and — the tick's own domain only — a `governance.exception` attention item for each expired exception whose customer scope covers it). */
CREATE OR REPLACE FUNCTION governance.ws_sweep_exceptions(p_action text, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, executive, observation, public, pg_catalog, pg_temp AS $$
DECLARE e record; a uuid; v_expired jsonb := '[]'::jsonb; v_holds jsonb; v_items jsonb := '[]'::jsonb; v_ev uuid; v_item jsonb;
BEGIN
  IF p_action = 'executive.attention.tick' THEN
    PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
    PERFORM observation.assert_scope(p_tenant, p_domain);
    IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'governance exception rejected (actor): the sweep is recorded under the acting principal' USING ERRCODE = '42501'; END IF;
  ELSIF p_action = 'governance.exception.sweep' THEN
    PERFORM governance.assert_platform('governance.exception.sweep', p_actor, 'governance exception');
    IF NOT governance.holds_role(p_actor, NULL, NULL, ARRAY['conformance_steward']) THEN
      RAISE EXCEPTION 'governance exception rejected (authority): the vendor-side sweep is the conformance steward''s' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'governance exception rejected (action): the sweep runs under governance.exception.sweep or executive.attention.tick' USING ERRCODE = '42501';
  END IF;
  FOR e IN SELECT x.exception_id, x.version, x.ref, x.title, x.expires_at, x.affected_artifacts, x.contract_key FROM governance.ws_exceptions x
            WHERE x.state = 'approved' AND x.expires_at <= clock_timestamp() ORDER BY x.expires_at, x.exception_id FOR UPDATE SKIP LOCKED LOOP
    UPDATE governance.ws_exceptions SET state = 'expired', expired_at = clock_timestamp() WHERE exception_id = e.exception_id AND version = e.version;
    v_holds := '[]'::jsonb;
    FOREACH a IN ARRAY e.affected_artifacts LOOP
      v_holds := v_holds || to_jsonb(governance.ws_open_hold(a, 'exception_expired', e.exception_id,
                   format('exception %s v%s (%s) expired at %s — the affected promotion is held until a renewal with current evidence is approved independently, or the exception is closed on its exit criteria',
                          e.ref, e.version, e.contract_key, e.expires_at), p_actor, p_correlation));
    END LOOP;
    PERFORM governance.ws_register(e.exception_id, 'exception', e.ref, e.title, (SELECT owner_principal_id FROM governance.ws_exceptions WHERE exception_id = e.exception_id AND version = e.version),
              NULL, NULL, NULL, 'deprecated', jsonb_build_object('version', e.version, 'state', 'expired', 'contract_key', e.contract_key, 'expires_at', e.expires_at, 'class', 'product'),
              (SELECT digest FROM governance.ws_exceptions WHERE exception_id = e.exception_id AND version = e.version), p_actor, p_correlation);
    PERFORM governance.ledger(NULL, NULL, 'governance_exception', e.exception_id, e.version, 'exception.expired', p_actor,
              jsonb_build_object('expires_at', e.expires_at, 'holds', v_holds, 'via', p_action), p_correlation);
    v_expired := v_expired || jsonb_build_object('exception_id', e.exception_id, 'ref', e.ref, 'version', e.version, 'expires_at', e.expires_at, 'holds', v_holds);
  END LOOP;
  IF p_action = 'executive.attention.tick' THEN
    FOR e IN SELECT x.exception_id, x.version, x.ref, x.title, x.expires_at, x.owner_principal_id FROM governance.ws_exceptions x
              WHERE x.state = 'expired' AND governance.ws_scope_covers(x.customer_scope, p_tenant, p_domain) ORDER BY x.expires_at LOOP
      SELECT g.event_id INTO v_ev FROM governance.events g WHERE g.subject_id = e.exception_id AND g.version = e.version AND g.event = 'exception.expired' ORDER BY g.occurred_at LIMIT 1;
      CONTINUE WHEN v_ev IS NULL;  -- the item is keyed on the expiry event (one item per expiry per domain, never re-raised)
      v_item := executive.b33_raise_routed(p_tenant, p_domain, 'governance.exception', 'governance_exception', e.exception_id,
                  format('Exception %s expired — the affected promotion is held until renewal with current evidence', e.ref),
                  jsonb_build_array(format('expired at %s', e.expires_at)), NULL, v_ev, 'governance.exception_expired',
                  jsonb_build_object('ref', e.ref, 'version', e.version, 'title', e.title, 'workspace', '/admin/governance'), NULL, p_actor, p_correlation);
      IF NOT coalesce((v_item ->> 'existing')::boolean, false) THEN v_items := v_items || v_item; END IF;
    END LOOP;
  END IF;
  RETURN jsonb_build_object('expired', v_expired, 'items_raised', v_items, 'via', p_action, 'swept_at', clock_timestamp());
END $$;
REVOKE ALL ON FUNCTION governance.ws_sweep_exceptions(text, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ws_sweep_exceptions(text, uuid, uuid, uuid, uuid) TO eye_commit;

/* DECIDE a remediation review (the product authority, never its opener): `remediation` (a plan, an accountable owner — a named human —, a due
   day) or `change_review` (a change proposal of this registry). Exceptions on the contract may be approved again only after this. */
CREATE OR REPLACE FUNCTION governance.ws_decide_review(p_review uuid, p_decision text, p_body jsonb, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE r governance.ws_exception_reviews%ROWTYPE; v_rem jsonb := NULL; v_cp uuid := NULL;
BEGIN
  PERFORM governance.assert_platform('governance.remediation.decide', p_actor, 'governance exception');
  SELECT * INTO r FROM governance.ws_exception_reviews x WHERE x.review_id = p_review FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'governance exception rejected (unknown_review): no remediation review %', p_review USING ERRCODE = '23503'; END IF;
  PERFORM governance.assert_approver('governance exception', p_actor, NULL, NULL, ARRAY['product_authority'], r.opened_by, NULL, 'deciding a remediation review');
  IF r.state <> 'open' THEN RAISE EXCEPTION 'governance exception rejected (state): review % is %', r.ref, r.state USING ERRCODE = '23505'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'governance exception rejected (reason): a decision states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_decision = 'remediation' THEN
    IF length(btrim(coalesce(p_body ->> 'plan', ''))) < 20 OR coalesce(p_body ->> 'dueOn', '') !~ '^\d{4}-\d{2}-\d{2}$' OR jsonb_typeof(p_body -> 'owner') <> 'string'
       OR NOT governance.ws_is_human((p_body ->> 'owner')::uuid) OR (p_body ->> 'dueOn')::date < (clock_timestamp() AT TIME ZONE 'UTC')::date THEN
      RAISE EXCEPTION 'governance exception rejected (remediation): a remediation names its plan (20+ characters), its accountable owner (a named human) and its due day (today or later)' USING ERRCODE = '22023';
    END IF;
    v_rem := jsonb_build_object('plan', btrim(p_body ->> 'plan'), 'owner', p_body ->> 'owner', 'due_on', p_body ->> 'dueOn');
  ELSIF p_decision = 'change_review' THEN
    v_cp := CASE WHEN jsonb_typeof(p_body -> 'changeProposal') = 'string' THEN (p_body ->> 'changeProposal')::uuid END;
    IF v_cp IS NULL OR NOT EXISTS (SELECT 1 FROM governance.ws_change_proposals c WHERE c.proposal_id = v_cp) THEN
      RAISE EXCEPTION 'governance exception rejected (unknown_proposal): a formal change review names a change proposal of this registry' USING ERRCODE = '23503';
    END IF;
  ELSE
    RAISE EXCEPTION 'governance exception rejected (decision): remediation or change_review' USING ERRCODE = '22023';
  END IF;
  UPDATE governance.ws_exception_reviews SET state = p_decision, decided_by = p_actor, decided_at = clock_timestamp(), decision_reason = btrim(p_reason), remediation = v_rem, change_proposal = v_cp
   WHERE review_id = p_review;
  PERFORM governance.ledger(NULL, NULL, 'governance_exception', p_review, 1, 'exception.review_decided', p_actor,
            jsonb_build_object('contract_key', r.contract_key, 'decision', p_decision, 'remediation', v_rem, 'change_proposal', v_cp, 'reason', btrim(p_reason)), p_correlation);
  RETURN jsonb_build_object('review_id', p_review, 'ref', r.ref, 'contract_key', r.contract_key, 'state', p_decision, 'remediation', v_rem, 'change_proposal', v_cp);
END $$;
REVOKE ALL ON FUNCTION governance.ws_decide_review(uuid, text, jsonb, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ws_decide_review(uuid, text, jsonb, text, uuid, uuid) TO eye_commit;

/* THE AGEING (a read): per exception — the effective state on the database clock (an approved exception past its expiry reads
   `expired (sweep pending)`: never shown in force), age, days to expiry, periods, renewals; and the totals and buckets. */
CREATE OR REPLACE FUNCTION governance.ws_exception_ageing() RETURNS jsonb
LANGUAGE sql STABLE SET search_path = governance, pg_catalog, pg_temp AS $$
  WITH cur AS (
    SELECT DISTINCT ON (e.exception_id) e.* FROM governance.ws_exceptions e WHERE e.state NOT IN ('withdrawn') ORDER BY e.exception_id, e.version DESC),
  firsts AS (SELECT e.exception_id, min(e.starts_at) AS first_start, count(*) FILTER (WHERE e.renewal_of IS NOT NULL AND e.state IN ('approved', 'expired', 'closed', 'superseded')) AS renewals
              FROM governance.ws_exceptions e GROUP BY e.exception_id),
  xr AS (
    SELECT c.exception_id, c.ref, c.version, c.contract_key, c.title,
           CASE WHEN c.state = 'approved' AND c.expires_at <= clock_timestamp() THEN 'expired (sweep pending)' ELSE c.state END AS effective_state,
           c.expires_at, floor(extract(epoch FROM (clock_timestamp() - f.first_start)) / 86400)::int AS age_days,
           CASE WHEN c.state = 'approved' THEN floor(extract(epoch FROM (c.expires_at - clock_timestamp())) / 86400)::int END AS days_to_expiry, f.renewals
      FROM cur c JOIN firsts f ON f.exception_id = c.exception_id)
  SELECT jsonb_build_object(
    'rows', coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.expires_at) FROM xr r), '[]'::jsonb),
    'totals', jsonb_build_object(
      'in_force', (SELECT count(*) FROM xr r WHERE r.effective_state = 'approved'),
      'expired', (SELECT count(*) FROM xr r WHERE r.effective_state IN ('expired', 'expired (sweep pending)')),
      'proposed', (SELECT count(*) FROM xr r WHERE r.effective_state = 'proposed'),
      'closed', (SELECT count(*) FROM xr r WHERE r.effective_state = 'closed'),
      'expiring_14d', (SELECT count(*) FROM xr r WHERE r.effective_state = 'approved' AND r.days_to_expiry < 14),
      'renewals', (SELECT coalesce(sum(r.renewals), 0) FROM xr r),
      'mean_age_days_open', (SELECT round(avg(r.age_days)::numeric, 1) FROM xr r WHERE r.effective_state IN ('approved', 'expired', 'expired (sweep pending)', 'proposed'))),
    'buckets', jsonb_build_object(
      '0-30', (SELECT count(*) FROM xr r WHERE r.effective_state NOT IN ('closed', 'rejected') AND r.age_days <= 30),
      '31-90', (SELECT count(*) FROM xr r WHERE r.effective_state NOT IN ('closed', 'rejected') AND r.age_days BETWEEN 31 AND 90),
      '91-180', (SELECT count(*) FROM xr r WHERE r.effective_state NOT IN ('closed', 'rejected') AND r.age_days BETWEEN 91 AND 180),
      '>180', (SELECT count(*) FROM xr r WHERE r.effective_state NOT IN ('closed', 'rejected') AND r.age_days > 180)),
    'read_at', clock_timestamp()) $$;
GRANT EXECUTE ON FUNCTION governance.ws_exception_ageing() TO eye_app, eye_commit;

-- §PG.5 (declared before the conflict register, which names change proposals) CHANGE PROPOSALS ────────────────────────────────────────────
CREATE TABLE governance.ws_change_proposals (
  proposal_id     uuid NOT NULL,
  version         int  NOT NULL CHECK (version >= 1),
  scope           text NOT NULL DEFAULT 'PLATFORM' CHECK (scope = 'PLATFORM'),
  ref             text NOT NULL,
  title           text NOT NULL CHECK (length(btrim(title)) BETWEEN 8 AND 300),
  change_class    text NOT NULL CHECK (change_class IN ('interface', 'object', 'policy', 'model', 'agent', 'workflow', 'deployment', 'requirement', 'capability', 'baseline', 'data_contract')),
  subjects        uuid[] NOT NULL,
  description     text NOT NULL CHECK (length(btrim(description)) >= 20),
  plans           jsonb NOT NULL CHECK (jsonb_typeof(plans) = 'object'),
  missing_plans   text[] NOT NULL,
  builders        uuid[] NOT NULL,
  alters_identity boolean NOT NULL,
  cross_volume    boolean NOT NULL,
  constitutional  boolean NOT NULL,
  required_roles  text[] NOT NULL,
  impact          jsonb NOT NULL,
  impact_digest   text NOT NULL CHECK (impact_digest ~ '^[0-9a-f]{64}$'),
  digest          text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  state           text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'approved', 'rejected', 'withdrawn', 'superseded')),
  proposed_by     uuid NOT NULL,
  proposed_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_at      timestamptz,
  decision_reason text,
  claim           text NOT NULL DEFAULT 'demonstration' CHECK (claim = 'demonstration'),
  correlation_id  uuid NOT NULL,
  PRIMARY KEY (proposal_id, version)
);
CREATE UNIQUE INDEX wcp_one_open ON governance.ws_change_proposals (proposal_id) WHERE state = 'proposed';
CREATE TABLE governance.ws_change_approvals (
  proposal_id    uuid NOT NULL,
  version        int  NOT NULL,
  approver       uuid NOT NULL,
  scope          text NOT NULL DEFAULT 'PLATFORM' CHECK (scope = 'PLATFORM'),
  role           text NOT NULL,
  decision       text NOT NULL CHECK (decision IN ('approve', 'reject')),
  reason         text NOT NULL,
  signature_id   uuid,
  decided_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id uuid NOT NULL,
  PRIMARY KEY (proposal_id, version, approver),
  CONSTRAINT wca_signed CHECK (decision = 'reject' OR signature_id IS NOT NULL)
);
CREATE TRIGGER wca_append_only BEFORE UPDATE OR DELETE ON governance.ws_change_approvals FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* THE PLANS a change carries before approval (ES-72-003). */
CREATE OR REPLACE FUNCTION governance.ws_change_plans() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['consumer_impact', 'compatibility', 'migration', 'replay', 'rollback', 'evidence'] $$;
GRANT EXECUTE ON FUNCTION governance.ws_change_plans() TO eye_app, eye_commit;

/* THE DETERMINISTIC IMPACT of changing the subjects: every artifact that depends on them through the LIVE links (a link from → to reads "from
   depends on to" for every relation but supersedes / owned_by / conflicts_with / governs — `governs` reads the other way: a governing artifact
   is not a dependent of what it governs), transitively to depth 6, each at its shortest depth, ordered
   (depth, kind, external key, id) and digested — the same links, the same impact digest. (An invoker read: PLATFORM rows are readable by
   every authenticated context.) §RG's impact explorer is the registry's own; this is the change proposal's binding of it. */
CREATE OR REPLACE FUNCTION governance.ws_impact(p_subjects uuid[]) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = governance, pg_catalog, pg_temp AS $$
  WITH RECURSIVE walk(artifact_id, depth, via, relation) AS (
    SELECT s, 0, NULL::uuid, NULL::text FROM unnest(coalesce(p_subjects, '{}')) s
    UNION ALL
    SELECT l.from_artifact, w.depth + 1, w.artifact_id, l.relation FROM walk w JOIN governance.links_live l ON l.to_artifact = w.artifact_id
     WHERE w.depth < 6 AND l.relation NOT IN ('supersedes', 'owned_by', 'conflicts_with', 'governs')),
  best AS (SELECT DISTINCT ON (w.artifact_id) w.artifact_id, w.depth, w.via, w.relation FROM walk w WHERE w.depth > 0 AND NOT (w.artifact_id = ANY (coalesce(p_subjects, '{}')))
            ORDER BY w.artifact_id, w.depth, w.via, w.relation),
  deps AS (SELECT b.artifact_id, b.depth, b.via, b.relation, a.kind, a.external_key, a.title, a.version FROM best b
             LEFT JOIN governance.artifacts a ON a.artifact_id = b.artifact_id AND a.superseded_at IS NULL),
  listed AS (SELECT coalesce(jsonb_agg(jsonb_build_object('artifact_id', r.artifact_id, 'version', r.version, 'kind', coalesce(r.kind, 'unregistered'), 'key', r.external_key, 'title', r.title,
                                                          'depth', r.depth, 'via', r.via, 'relation', r.relation) ORDER BY r.depth, coalesce(r.kind, 'zzz'), r.external_key, r.artifact_id), '[]'::jsonb) AS l FROM deps r)
  SELECT jsonb_build_object('subjects', to_jsonb(ARRAY(SELECT DISTINCT s FROM unnest(coalesce(p_subjects, '{}')) s ORDER BY 1)), 'dependents', l.l,
                            'by_kind', coalesce((SELECT jsonb_object_agg(k, n) FROM (SELECT x ->> 'kind' AS k, count(*) AS n FROM jsonb_array_elements(l.l) x GROUP BY 1) q), '{}'::jsonb),
                            'count', jsonb_array_length(l.l),
                            'digest', governance.digest(jsonb_build_object('subjects', to_jsonb(ARRAY(SELECT DISTINCT s FROM unnest(coalesce(p_subjects, '{}')) s ORDER BY 1)), 'dependents', l.l)))
    FROM listed l $$;
GRANT EXECUTE ON FUNCTION governance.ws_impact(uuid[]) TO eye_app, eye_commit;

/* PROPOSE a change (any product-governance role; an AGENT may draft — it never approves): the class, the subject artifacts, the six plans (a
   proposal may be incomplete — what is missing is listed; it is NOT approvable until complete), the declared builders, identity / cross-volume /
   constitutional reach (cross-volume is also derived: the subjects span volumes), the impact computed and digested. */
CREATE OR REPLACE FUNCTION governance.ws_propose_change(p_proposal uuid, p_body jsonb, p_expected_version int, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE v_cur int; v_ref text; v_subjects uuid[]; v_plans jsonb := '{}'::jsonb; v_missing text[] := '{}'; k text; v_builders uuid[]; v_cross boolean; v_const boolean; v_ident boolean;
        v_roles text[]; v_impact jsonb; v_digest text; v_class text; v_s uuid;
BEGIN
  PERFORM governance.assert_platform('governance.change.propose', p_actor, 'change proposal');
  IF NOT governance.holds_role(p_actor, NULL, NULL, governance.ws_governance_roles()) THEN
    RAISE EXCEPTION 'change proposal rejected (authority): a change is proposed by a holder of a product-governance role' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_body) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'change proposal rejected (body): the proposal is an object' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('governance.ws_change_proposals:' || p_proposal::text, 0));
  SELECT coalesce(max(c.version), 0), max(c.ref) INTO v_cur, v_ref FROM governance.ws_change_proposals c WHERE c.proposal_id = p_proposal;
  IF p_expected_version IS DISTINCT FROM v_cur THEN
    RAISE EXCEPTION 'change proposal rejected (stale): the proposal is at version % (expected %)', v_cur, coalesce(p_expected_version::text, '<none>') USING ERRCODE = '23505';
  END IF;
  IF v_cur > 0 AND EXISTS (SELECT 1 FROM governance.ws_change_proposals c WHERE c.proposal_id = p_proposal AND c.version = v_cur AND c.state IN ('approved', 'rejected', 'withdrawn')) THEN
    RAISE EXCEPTION 'change proposal rejected (state): the proposal is decided — a new change is a new proposal' USING ERRCODE = '23505';
  END IF;
  v_class := p_body ->> 'changeClass';
  IF NOT (coalesce(v_class, '') IN ('interface', 'object', 'policy', 'model', 'agent', 'workflow', 'deployment', 'requirement', 'capability', 'baseline', 'data_contract')) THEN
    RAISE EXCEPTION 'change proposal rejected (class): the change class is interface, object, policy, model, agent, workflow, deployment, requirement, capability, baseline or data_contract' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_body ->> 'title', ''))) < 8 OR length(btrim(coalesce(p_body ->> 'description', ''))) < 20 THEN
    RAISE EXCEPTION 'change proposal rejected (description): a title (8+) and a description (20+ characters)' USING ERRCODE = '22023';
  END IF;
  v_subjects := ARRAY(SELECT DISTINCT x::uuid FROM jsonb_array_elements_text(coalesce(p_body -> 'subjects', '[]'::jsonb)) x ORDER BY 1);
  IF cardinality(v_subjects) = 0 THEN RAISE EXCEPTION 'change proposal rejected (subjects): the change names the artifacts it changes' USING ERRCODE = '22023'; END IF;
  PERFORM governance.ws_assert_artifacts('change proposal', v_subjects, NULL, 'subjects');
  FOREACH k IN ARRAY governance.ws_change_plans() LOOP
    IF length(btrim(coalesce(p_body -> 'plans' ->> k, ''))) >= 20 THEN v_plans := v_plans || jsonb_build_object(k, btrim(p_body -> 'plans' ->> k));
    ELSE v_missing := v_missing || k; END IF;
  END LOOP;
  v_builders := ARRAY(SELECT DISTINCT x::uuid FROM jsonb_array_elements_text(coalesce(p_body -> 'builders', '[]'::jsonb)) x ORDER BY 1);
  v_ident := coalesce((p_body ->> 'altersIdentity')::boolean, false);
  v_const := coalesce((p_body ->> 'constitutional')::boolean, false);
  v_cross := coalesce((p_body ->> 'crossVolume')::boolean, false)
             OR (SELECT count(DISTINCT a.controlling_volume) FROM governance.artifacts a WHERE a.artifact_id = ANY (v_subjects) AND a.superseded_at IS NULL AND a.controlling_volume IS NOT NULL) > 1;
  v_roles := CASE WHEN v_ident OR v_const OR v_cross THEN ARRAY['product_authority', 'independent_assurance'] ELSE ARRAY['product_authority'] END;
  v_impact := governance.ws_impact(v_subjects);
  v_ref := coalesce(v_ref, governance.ws_next_ref('GCP'));
  v_digest := governance.digest(jsonb_build_object('proposal_id', p_proposal, 'version', v_cur + 1, 'title', btrim(p_body ->> 'title'), 'class', v_class, 'subjects', to_jsonb(v_subjects),
               'description', btrim(p_body ->> 'description'), 'plans', v_plans, 'builders', to_jsonb(v_builders), 'alters_identity', v_ident, 'cross_volume', v_cross, 'constitutional', v_const,
               'required_roles', to_jsonb(v_roles), 'impact_digest', v_impact ->> 'digest'));
  UPDATE governance.ws_change_proposals SET state = 'superseded' WHERE proposal_id = p_proposal AND state = 'proposed';
  INSERT INTO governance.ws_change_proposals (proposal_id, version, ref, title, change_class, subjects, description, plans, missing_plans, builders, alters_identity, cross_volume, constitutional,
                                              required_roles, impact, impact_digest, digest, proposed_by, correlation_id)
  VALUES (p_proposal, v_cur + 1, v_ref, btrim(p_body ->> 'title'), v_class, v_subjects, btrim(p_body ->> 'description'), v_plans, v_missing, v_builders, v_ident, v_cross, v_const, v_roles,
          v_impact, v_impact ->> 'digest', v_digest, p_actor, p_correlation);
  PERFORM governance.ws_register(p_proposal, 'change_proposal', v_ref, btrim(p_body ->> 'title'), p_actor, NULL, NULL, NULL, 'proposed',
            jsonb_build_object('version', v_cur + 1, 'class', v_class, 'missing_plans', to_jsonb(v_missing), 'impact_count', v_impact -> 'count'), v_digest, p_actor, p_correlation);
  FOREACH v_s IN ARRAY v_subjects LOOP PERFORM governance.ws_link(p_proposal, v_s, 'governs', jsonb_build_object('as', 'changes'), p_actor, p_correlation); END LOOP;
  PERFORM governance.ledger(NULL, NULL, 'change_proposal', p_proposal, v_cur + 1, 'change.proposed', p_actor,
            jsonb_build_object('digest', v_digest, 'class', v_class, 'missing_plans', to_jsonb(v_missing), 'impact_digest', v_impact ->> 'digest', 'impact_count', v_impact -> 'count',
                               'required_roles', to_jsonb(v_roles)), p_correlation);
  RETURN jsonb_build_object('proposal_id', p_proposal, 'ref', v_ref, 'version', v_cur + 1, 'state', 'proposed', 'digest', v_digest, 'missing_plans', to_jsonb(v_missing),
                            'approvable', cardinality(v_missing) = 0, 'required_roles', to_jsonb(v_roles), 'cross_volume', v_cross, 'impact', v_impact);
END $$;
REVOKE ALL ON FUNCTION governance.ws_propose_change(uuid, jsonb, int, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ws_propose_change(uuid, jsonb, int, uuid, uuid) TO eye_commit;

/* DECIDE a change version (approve | reject): a named human holding a required role not yet given by another approver (the authority chain:
   product authority, plus independent assurance for constitutional / identity-altering / cross-volume change); never the proposer or a declared
   builder; the matrix's `change` approve row (the product authority's step) or review row (independent assurance's step) when it governs; on the exact digest; REFUSED while a plan is missing (ES-72-003), when the
   impact moved since the proposal (stale), or while a subject is under an open conflict or hold (held). APPROVE is SIGNED (`change_approval`);
   the change is approved when every required role has approved; one reject rejects. */
CREATE OR REPLACE FUNCTION governance.ws_decide_change(p_proposal uuid, p_version int, p_decision text, p_digest text, p_reason text, p_signature uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE c governance.ws_change_proposals%ROWTYPE; v_open text[]; v_role text; v_impact jsonb; v_done text[]; v_state text; v_blocking jsonb; v_via jsonb;
BEGIN
  PERFORM governance.assert_platform('governance.change.decide', p_actor, 'change proposal');
  SELECT * INTO c FROM governance.ws_change_proposals x WHERE x.proposal_id = p_proposal AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'change proposal rejected (unknown_proposal): no change proposal %/v%', p_proposal, p_version USING ERRCODE = '23503'; END IF;
  SELECT array_agg(a.role) INTO v_done FROM governance.ws_change_approvals a WHERE a.proposal_id = p_proposal AND a.version = p_version AND a.decision = 'approve';
  v_open := ARRAY(SELECT r FROM unnest(c.required_roles) r WHERE NOT (r = ANY (coalesce(v_done, '{}'))));
  IF EXISTS (SELECT 1 FROM governance.ws_change_approvals a WHERE a.proposal_id = p_proposal AND a.version = p_version AND a.approver = p_actor) THEN
    RAISE EXCEPTION 'change proposal rejected (separation_of_duties): you have already decided version % — each required role is a distinct named approver', p_version USING ERRCODE = '42501';
  END IF;
  PERFORM governance.assert_approver('change proposal', p_actor, NULL, NULL, CASE WHEN cardinality(v_open) = 0 THEN c.required_roles ELSE v_open END, c.proposed_by, c.builders, 'approving a change');
  SELECT b.role_code INTO v_role FROM identity.role_bindings b WHERE b.principal_id = p_actor AND b.revoked_at IS NULL AND b.scope = 'PLATFORM'
     AND b.role_code = ANY (CASE WHEN cardinality(v_open) = 0 THEN c.required_roles ELSE v_open END) ORDER BY array_position(c.required_roles, b.role_code) LIMIT 1;
  -- the matrix: the product authority's step is the `change` APPROVE row (singular); independent assurance's step in the chain is its REVIEW row
  v_via := governance.ws_assert_rights('change proposal', 'change', CASE WHEN v_role = 'independent_assurance' THEN 'review' ELSE 'approve' END, p_actor);
  IF c.state <> 'proposed' THEN RAISE EXCEPTION 'change proposal rejected (state): version % is %', p_version, c.state USING ERRCODE = '23505'; END IF;
  IF p_digest IS DISTINCT FROM c.digest THEN RAISE EXCEPTION 'change proposal rejected (stale): the decision names a digest other than version %''s', p_version USING ERRCODE = '23505'; END IF;
  IF p_decision NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'change proposal rejected (decision): approve or reject' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'change proposal rejected (reason): a decision states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_decision = 'approve' THEN
    IF cardinality(c.missing_plans) > 0 THEN
      RAISE EXCEPTION 'change proposal rejected (plans): % — a change carries its consumer impact, compatibility, migration, replay, rollback and evidence plans before approval (ES-72-003)', array_to_string(c.missing_plans, ', ') || ' missing' USING ERRCODE = '22023';
    END IF;
    v_impact := governance.ws_impact(c.subjects);
    IF v_impact ->> 'digest' IS DISTINCT FROM c.impact_digest THEN
      RAISE EXCEPTION 'change proposal rejected (stale): the impact moved since the proposal (% then, % now) — re-propose with the current impact', c.impact ->> 'count', v_impact ->> 'count' USING ERRCODE = '23505';
    END IF;
    SELECT jsonb_agg(jsonb_build_object('subject', h.subject_artifact, 'reason_kind', h.reason_kind, 'reason', h.reason)) INTO v_blocking FROM governance.holds h
     WHERE h.lifted_at IS NULL AND h.subject_artifact = ANY (c.subjects);
    IF v_blocking IS NULL THEN
      SELECT jsonb_agg(jsonb_build_object('conflict', k.ref, 'state', k.state)) INTO v_blocking FROM governance.ws_conflicts k WHERE k.state = 'open' AND k.conflicting && c.subjects;
    END IF;
    IF v_blocking IS NOT NULL THEN
      RAISE EXCEPTION 'change proposal rejected (held): a subject of the change is under an open conflict or hold — constrained until it is resolved (%)', v_blocking::text USING ERRCODE = '23505';
    END IF;
    IF NOT governance.ws_signed(p_signature, 'change_approval', p_proposal, p_version, c.digest, p_actor, 'governance.change.decide') THEN
      RAISE EXCEPTION 'change proposal rejected (signature): approval carries the approver''s signature over the proposal digest' USING ERRCODE = '22023';
    END IF;
  END IF;
  INSERT INTO governance.ws_change_approvals (proposal_id, version, approver, role, decision, reason, signature_id, correlation_id)
  VALUES (p_proposal, p_version, p_actor, coalesce(v_role, 'unknown'), p_decision, btrim(p_reason), CASE WHEN p_decision = 'approve' THEN p_signature END, p_correlation);
  v_done := CASE WHEN p_decision = 'approve' THEN array_append(coalesce(v_done, '{}'), v_role) ELSE v_done END;
  v_state := CASE WHEN p_decision = 'reject' THEN 'rejected'
                  WHEN NOT EXISTS (SELECT 1 FROM unnest(c.required_roles) r WHERE NOT (r = ANY (v_done))) THEN 'approved' ELSE 'proposed' END;
  IF v_state <> 'proposed' THEN
    UPDATE governance.ws_change_proposals SET state = v_state, decided_at = clock_timestamp(), decision_reason = btrim(p_reason) WHERE proposal_id = p_proposal AND version = p_version;
    PERFORM governance.ws_register(p_proposal, 'change_proposal', c.ref, c.title, c.proposed_by, NULL, NULL, NULL, CASE WHEN v_state = 'approved' THEN 'active' ELSE 'retired' END,
              jsonb_build_object('version', p_version, 'class', c.change_class, 'state', v_state), c.digest, p_actor, p_correlation);
  END IF;
  PERFORM governance.ledger(NULL, NULL, 'change_proposal', p_proposal, p_version, CASE p_decision WHEN 'reject' THEN 'change.rejected' ELSE (CASE WHEN v_state = 'approved' THEN 'change.approved' ELSE 'change.approval_recorded' END) END,
            p_actor, jsonb_build_object('digest', c.digest, 'role', v_role, 'reason', btrim(p_reason), 'signature_id', p_signature, 'awaiting', to_jsonb(ARRAY(SELECT r FROM unnest(c.required_roles) r WHERE NOT (r = ANY (coalesce(v_done, '{}'))))),
                                        'rights_via', v_via), p_correlation);
  RETURN jsonb_build_object('proposal_id', p_proposal, 'ref', c.ref, 'version', p_version, 'state', v_state, 'role', v_role, 'digest', c.digest,
                            'awaiting', to_jsonb(ARRAY(SELECT r FROM unnest(c.required_roles) r WHERE NOT (r = ANY (coalesce(v_done, '{}'))))));
END $$;
REVOKE ALL ON FUNCTION governance.ws_decide_change(uuid, int, text, text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ws_decide_change(uuid, int, text, text, text, uuid, uuid, uuid) TO eye_commit;

-- §PG.4 THE CONFLICT REGISTER ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE governance.ws_conflicts (
  conflict_id       uuid PRIMARY KEY,
  scope             text NOT NULL DEFAULT 'PLATFORM' CHECK (scope = 'PLATFORM'),
  ref               text NOT NULL,
  kind              text NOT NULL CHECK (kind IN ('cross_volume', 'requirement', 'authority_unresolved', 'dependency_unresolved', 'data_contract')),
  title             text NOT NULL CHECK (length(btrim(title)) BETWEEN 8 AND 300),
  description       text NOT NULL CHECK (length(btrim(description)) >= 20),
  conflicting       uuid[] NOT NULL,
  ranking           jsonb NOT NULL,
  highest_authority uuid NOT NULL,
  impacted          uuid[] NOT NULL,
  affected_releases uuid[] NOT NULL,
  last_conformant   uuid,
  holds             jsonb NOT NULL,
  digest            text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  state             text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'resolved')),
  raised_by         uuid NOT NULL,
  raised_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  resolved_by       uuid,
  resolved_at       timestamptz,
  resolution        jsonb,
  signature_id      uuid,
  claim             text NOT NULL DEFAULT 'demonstration' CHECK (claim = 'demonstration'),
  correlation_id    uuid NOT NULL
);

/* RAISE a conflict (the conformance steward, the product authority or independent assurance — an agent may raise: holding is the conservative
   direction): two or more controlling artifacts (one for an unresolved authority / dependency), the impacted requirements and journeys, the
   highest authority SELECTED by the declared rank, every affected release candidate (named, or linked to a conflicting / impacted artifact)
   HELD (`conflict`), and the LAST CONFORMANT candidate recorded (the newest current candidate outside the conflict with no open hold). */
CREATE OR REPLACE FUNCTION governance.ws_raise_conflict(p_conflict uuid, p_body jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE v_kind text; v_conf uuid[]; v_imp uuid[]; v_rel uuid[]; v_rank jsonb; v_high uuid; v_last uuid; v_holds jsonb := '[]'::jsonb; v_ref text; v_digest text; a uuid;
BEGIN
  PERFORM governance.assert_platform('governance.conflict.raise', p_actor, 'conformance conflict');
  IF NOT governance.holds_role(p_actor, NULL, NULL, ARRAY['conformance_steward', 'product_authority', 'independent_assurance']) THEN
    RAISE EXCEPTION 'conformance conflict rejected (authority): a conflict is raised by the conformance steward, the product authority or independent assurance' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM governance.ws_conflicts c WHERE c.conflict_id = p_conflict) THEN RAISE EXCEPTION 'conformance conflict rejected (duplicate): % is already raised', p_conflict USING ERRCODE = '23505'; END IF;
  v_kind := p_body ->> 'kind';
  IF NOT (coalesce(v_kind, '') IN ('cross_volume', 'requirement', 'authority_unresolved', 'dependency_unresolved', 'data_contract')) THEN
    RAISE EXCEPTION 'conformance conflict rejected (kind): cross_volume, requirement, authority_unresolved, dependency_unresolved or data_contract' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_body ->> 'title', ''))) < 8 OR length(btrim(coalesce(p_body ->> 'description', ''))) < 20 THEN
    RAISE EXCEPTION 'conformance conflict rejected (description): a title (8+) and a description (20+ characters)' USING ERRCODE = '22023';
  END IF;
  v_conf := ARRAY(SELECT DISTINCT x::uuid FROM jsonb_array_elements_text(coalesce(p_body -> 'conflicting', '[]'::jsonb)) x ORDER BY 1);
  IF cardinality(v_conf) < (CASE WHEN v_kind IN ('authority_unresolved', 'dependency_unresolved') THEN 1 ELSE 2 END) THEN
    RAISE EXCEPTION 'conformance conflict rejected (conflicting): a conflict names two or more controlling artifacts (one for an unresolved authority or dependency)' USING ERRCODE = '22023';
  END IF;
  PERFORM governance.ws_assert_artifacts('conformance conflict', v_conf, NULL, 'conflicting');
  v_imp := ARRAY(SELECT DISTINCT x::uuid FROM jsonb_array_elements_text(coalesce(p_body -> 'impacted', '[]'::jsonb)) x ORDER BY 1);
  PERFORM governance.ws_assert_artifacts('conformance conflict', v_imp, ARRAY['requirement', 'journey', 'capability', 'component', 'interface', 'schema', 'data_product'], 'impacted');
  PERFORM governance.ws_assert_artifacts('conformance conflict',
            ARRAY(SELECT DISTINCT x::uuid FROM jsonb_array_elements_text(coalesce(p_body -> 'affectedReleases', '[]'::jsonb)) x), ARRAY['release_candidate'], 'affectedReleases');
  SELECT jsonb_agg(jsonb_build_object('artifact_id', a2.artifact_id, 'key', a2.external_key, 'kind', a2.kind, 'authority_class', a2.authority_class, 'controlling_volume', a2.controlling_volume,
                                      'rank', governance.ws_authority_rank(a2.authority_class), 'effective_from', a2.effective_from)
                   ORDER BY governance.ws_authority_rank(a2.authority_class), coalesce(a2.controlling_volume, 'V~'), a2.effective_from, a2.artifact_id)
    INTO v_rank FROM governance.artifacts a2 WHERE a2.artifact_id = ANY (v_conf) AND a2.superseded_at IS NULL;
  v_high := (v_rank -> 0 ->> 'artifact_id')::uuid;
  v_rel := ARRAY(SELECT DISTINCT r FROM (
             SELECT x::uuid AS r FROM jsonb_array_elements_text(coalesce(p_body -> 'affectedReleases', '[]'::jsonb)) x
             UNION SELECT CASE WHEN l.from_artifact = ANY (v_conf || v_imp) THEN l.to_artifact ELSE l.from_artifact END
               FROM governance.links_live l WHERE (l.from_artifact = ANY (v_conf || v_imp) OR l.to_artifact = ANY (v_conf || v_imp))) q
            WHERE EXISTS (SELECT 1 FROM governance.artifacts ra WHERE ra.artifact_id = q.r AND ra.kind = 'release_candidate' AND ra.superseded_at IS NULL) ORDER BY 1);
  SELECT ra.artifact_id INTO v_last FROM governance.artifacts ra WHERE ra.kind = 'release_candidate' AND ra.superseded_at IS NULL AND ra.lifecycle IN ('active', 'proposed')
     AND NOT (ra.artifact_id = ANY (v_rel)) AND NOT EXISTS (SELECT 1 FROM governance.holds h WHERE h.subject_artifact = ra.artifact_id AND h.lifted_at IS NULL)
   ORDER BY ra.effective_from DESC, ra.artifact_id LIMIT 1;
  v_ref := governance.ws_next_ref('GCF');
  FOREACH a IN ARRAY v_rel LOOP
    v_holds := v_holds || to_jsonb(governance.ws_open_hold(a, 'conflict', p_conflict,
                 format('conformance conflict %s (%s): the release is held at the last conformant candidate%s until the governing authority resolves it and the trace closes',
                        v_ref, v_kind, CASE WHEN v_last IS NULL THEN ' (none recorded)' ELSE ' ' || (SELECT external_key FROM governance.artifacts WHERE artifact_id = v_last AND superseded_at IS NULL) END),
                 p_actor, p_correlation));
  END LOOP;
  v_digest := governance.digest(jsonb_build_object('conflict_id', p_conflict, 'kind', v_kind, 'title', btrim(p_body ->> 'title'), 'description', btrim(p_body ->> 'description'),
               'conflicting', to_jsonb(v_conf), 'ranking', v_rank, 'highest_authority', v_high, 'impacted', to_jsonb(v_imp), 'affected_releases', to_jsonb(v_rel), 'last_conformant', v_last));
  INSERT INTO governance.ws_conflicts (conflict_id, ref, kind, title, description, conflicting, ranking, highest_authority, impacted, affected_releases, last_conformant, holds, digest, raised_by, correlation_id)
  VALUES (p_conflict, v_ref, v_kind, btrim(p_body ->> 'title'), btrim(p_body ->> 'description'), v_conf, v_rank, v_high, v_imp, v_rel, v_last, v_holds, v_digest, p_actor, p_correlation);
  PERFORM governance.ws_register(p_conflict, 'conflict', v_ref, btrim(p_body ->> 'title'), NULL, 'product_authority', NULL, NULL, 'active',
            jsonb_build_object('state', 'open', 'kind', v_kind, 'highest_authority', v_high, 'last_conformant', v_last), v_digest, p_actor, p_correlation);
  FOREACH a IN ARRAY v_conf LOOP PERFORM governance.ws_link(p_conflict, a, 'conflicts_with', jsonb_build_object('rank', (SELECT x -> 'rank' FROM jsonb_array_elements(v_rank) x WHERE (x ->> 'artifact_id')::uuid = a)), p_actor, p_correlation); END LOOP;
  FOREACH a IN ARRAY v_imp LOOP PERFORM governance.ws_link(p_conflict, a, 'covers', jsonb_build_object('as', 'impacted'), p_actor, p_correlation); END LOOP;
  PERFORM governance.ledger(NULL, NULL, 'conflict', p_conflict, 1, 'conflict.raised', p_actor,
            jsonb_build_object('digest', v_digest, 'kind', v_kind, 'highest_authority', v_high, 'affected_releases', to_jsonb(v_rel), 'last_conformant', v_last, 'holds', v_holds), p_correlation);
  RETURN jsonb_build_object('conflict_id', p_conflict, 'ref', v_ref, 'state', 'open', 'digest', v_digest, 'ranking', v_rank, 'highest_authority', v_high, 'affected_releases', to_jsonb(v_rel),
                            'last_conformant', v_last, 'holds', v_holds);
END $$;
REVOKE ALL ON FUNCTION governance.ws_raise_conflict(uuid, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ws_raise_conflict(uuid, jsonb, uuid, uuid) TO eye_commit;

/* RESOLVE a conflict (the product authority — the governing authority; never its raiser; the matrix's `conflict` approve row), on the
   conflict's digest, SIGNED (`conflict_resolution`): CLOSURE — the highest authority prevails; AMENDMENT — another artifact prevails only through
   an APPROVED change proposal whose subjects include the highest-authority artifact (explicit amendment). THE TRACE CLOSES: the prevailing
   artifact `governs` every impacted artifact, and `supersedes` each other conflicting one (in the conflict's meaning); the holds lifted. */
CREATE OR REPLACE FUNCTION governance.ws_resolve_conflict(p_conflict uuid, p_body jsonb, p_digest text, p_signature uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE c governance.ws_conflicts%ROWTYPE; v_mode text; v_prev uuid; v_cp uuid; v_links jsonb := '[]'::jsonb; v_lifted jsonb; a uuid; v_res jsonb; v_via jsonb;
BEGIN
  PERFORM governance.assert_platform('governance.conflict.resolve', p_actor, 'conformance conflict');
  SELECT * INTO c FROM governance.ws_conflicts x WHERE x.conflict_id = p_conflict FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'conformance conflict rejected (unknown_conflict): no conflict %', p_conflict USING ERRCODE = '23503'; END IF;
  PERFORM governance.assert_approver('conformance conflict', p_actor, NULL, NULL, ARRAY['product_authority'], c.raised_by, NULL, 'resolving a conformance conflict');
  v_via := governance.ws_assert_rights('conformance conflict', 'conflict', 'approve', p_actor);
  IF c.state <> 'open' THEN RAISE EXCEPTION 'conformance conflict rejected (state): % is %', c.ref, c.state USING ERRCODE = '23505'; END IF;
  IF p_digest IS DISTINCT FROM c.digest THEN RAISE EXCEPTION 'conformance conflict rejected (stale): the resolution names a digest other than the conflict''s' USING ERRCODE = '23505'; END IF;
  v_mode := p_body ->> 'mode';
  v_prev := CASE WHEN jsonb_typeof(p_body -> 'prevailing') = 'string' THEN (p_body ->> 'prevailing')::uuid END;
  IF length(btrim(coalesce(p_body ->> 'rationale', ''))) < 20 THEN RAISE EXCEPTION 'conformance conflict rejected (rationale): a resolution states its rationale (20+ characters)' USING ERRCODE = '22023'; END IF;
  IF v_prev IS NULL OR NOT (v_prev = ANY (c.conflicting)) THEN RAISE EXCEPTION 'conformance conflict rejected (prevailing): the prevailing artifact is one of the conflicting artifacts' USING ERRCODE = '22023'; END IF;
  IF v_mode = 'closure' THEN
    IF v_prev IS DISTINCT FROM c.highest_authority THEN
      RAISE EXCEPTION 'conformance conflict rejected (authority_chain): closure keeps the highest authority (%); another artifact prevails only by explicit amendment (an approved change proposal)',
        (SELECT external_key FROM governance.artifacts WHERE artifact_id = c.highest_authority AND superseded_at IS NULL) USING ERRCODE = '22023';
    END IF;
  ELSIF v_mode = 'amendment' THEN
    v_cp := CASE WHEN jsonb_typeof(p_body -> 'changeProposal') = 'string' THEN (p_body ->> 'changeProposal')::uuid END;
    IF v_cp IS NULL OR NOT EXISTS (SELECT 1 FROM governance.ws_change_proposals p WHERE p.proposal_id = v_cp AND p.state = 'approved' AND c.highest_authority = ANY (p.subjects)) THEN
      RAISE EXCEPTION 'conformance conflict rejected (amendment): an amendment names an APPROVED change proposal that changes the highest-authority artifact' USING ERRCODE = '22023';
    END IF;
  ELSE
    RAISE EXCEPTION 'conformance conflict rejected (mode): closure or amendment' USING ERRCODE = '22023';
  END IF;
  IF NOT governance.ws_signed(p_signature, 'conflict_resolution', p_conflict, 1, c.digest, p_actor, 'governance.conflict.resolve') THEN
    RAISE EXCEPTION 'conformance conflict rejected (signature): a resolution carries the governing authority''s signature over the conflict digest' USING ERRCODE = '22023';
  END IF;
  FOREACH a IN ARRAY c.impacted LOOP
    v_links := v_links || jsonb_build_object('from', v_prev, 'to', a, 'relation', 'governs', 'link_id', governance.ws_link(v_prev, a, 'governs', jsonb_build_object('conflict', c.ref), p_actor, p_correlation));
  END LOOP;
  FOREACH a IN ARRAY c.conflicting LOOP
    IF a <> v_prev THEN
      v_links := v_links || jsonb_build_object('from', v_prev, 'to', a, 'relation', 'supersedes', 'link_id', governance.ws_link(v_prev, a, 'supersedes', jsonb_build_object('conflict', c.ref, 'mode', v_mode), p_actor, p_correlation));
    END IF;
  END LOOP;
  v_lifted := governance.ws_lift_holds(p_conflict, 'conflict', format('resolved: %s by %s (%s) — the trace closed', c.ref, governance.ws_principal_name(p_actor), v_mode), p_actor);
  v_res := jsonb_build_object('mode', v_mode, 'prevailing', v_prev, 'change_proposal', v_cp, 'rationale', btrim(p_body ->> 'rationale'), 'trace', v_links, 'trace_closed', true, 'holds_lifted', v_lifted);
  UPDATE governance.ws_conflicts SET state = 'resolved', resolved_by = p_actor, resolved_at = clock_timestamp(), resolution = v_res, signature_id = p_signature WHERE conflict_id = p_conflict;
  PERFORM governance.ws_register(p_conflict, 'conflict', c.ref, c.title, p_actor, 'product_authority', NULL, NULL, 'retired',
            jsonb_build_object('state', 'resolved', 'kind', c.kind, 'mode', v_mode, 'prevailing', v_prev), c.digest, p_actor, p_correlation);
  PERFORM governance.ledger(NULL, NULL, 'conflict', p_conflict, 1, 'conflict.resolved', p_actor, v_res || jsonb_build_object('signature_id', p_signature, 'rights_via', v_via), p_correlation);
  RETURN jsonb_build_object('conflict_id', p_conflict, 'ref', c.ref, 'state', 'resolved', 'resolution', v_res, 'signature_id', p_signature);
END $$;
REVOKE ALL ON FUNCTION governance.ws_resolve_conflict(uuid, jsonb, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ws_resolve_conflict(uuid, jsonb, text, uuid, uuid, uuid) TO eye_commit;

-- §PG.2 (cont.) THE BASELINE PROPOSAL AND DECISION ─────────────────────────────────────────────────────────────────────────────────────────
/* THE INVENTORY READ (the baseline's raw material and the workspace's): every current capability artifact with its accountable owner (and
   the owner's standing: active, or LAPSED when the owner is no longer an active human holding the role), grouped by domain boundary; the
   orphans (no owner), the duplicates (two capabilities of one normalised title in one boundary), the lapsed. */
CREATE OR REPLACE FUNCTION governance.ws_inventory() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
  WITH caps AS (
    SELECT a.artifact_id, a.version, a.external_key, a.title, a.authority_class, a.controlling_volume, a.lifecycle, a.attributes ->> 'domain' AS declared_domain,
           o.owner_principal_id, o.owner_role, o.domain_boundary, o.version AS owner_version,
           CASE WHEN o.owner_principal_id IS NULL THEN 'orphan'
                WHEN NOT governance.ws_is_human(o.owner_principal_id) OR NOT governance.holds_role(o.owner_principal_id, NULL, NULL, ARRAY[o.owner_role]) THEN 'lapsed'
                ELSE 'owned' END AS standing
      FROM governance.artifacts a LEFT JOIN governance.ws_capability_owners o ON o.capability_id = a.artifact_id AND o.superseded_at IS NULL
     WHERE a.kind = 'capability' AND a.superseded_at IS NULL AND a.lifecycle IN ('proposed', 'active')),
  dup AS (SELECT lower(regexp_replace(btrim(c.title), '\s+', ' ', 'g')) AS t, coalesce(c.domain_boundary, c.declared_domain, '') AS d, array_agg(c.external_key ORDER BY c.external_key) AS keys
            FROM caps c GROUP BY 1, 2 HAVING count(*) > 1)
  SELECT jsonb_build_object(
    'capabilities', coalesce((SELECT jsonb_agg(jsonb_build_object('capability_id', c.artifact_id, 'version', c.version, 'key', c.external_key, 'title', c.title, 'authority_class', c.authority_class,
                                 'controlling_volume', c.controlling_volume, 'lifecycle', c.lifecycle, 'domain_boundary', coalesce(c.domain_boundary, c.declared_domain), 'owner', c.owner_principal_id,
                                 'owner_name', governance.ws_principal_name(c.owner_principal_id), 'owner_role', c.owner_role, 'owner_version', c.owner_version, 'standing', c.standing)
                               ORDER BY c.external_key) FROM caps c), '[]'::jsonb),
    'domains', coalesce((SELECT jsonb_agg(jsonb_build_object('domain_boundary', d.b, 'capabilities', d.n) ORDER BY d.b) FROM
                          (SELECT coalesce(c.domain_boundary, c.declared_domain, '(no boundary)') AS b, count(*) AS n FROM caps c GROUP BY 1) d), '[]'::jsonb),
    'orphans', coalesce((SELECT jsonb_agg(c.external_key ORDER BY c.external_key) FROM caps c WHERE c.standing = 'orphan'), '[]'::jsonb),
    'lapsed', coalesce((SELECT jsonb_agg(c.external_key ORDER BY c.external_key) FROM caps c WHERE c.standing = 'lapsed'), '[]'::jsonb),
    'duplicates', coalesce((SELECT jsonb_agg(jsonb_build_object('title', d.t, 'domain_boundary', d.d, 'keys', to_jsonb(d.keys)) ORDER BY d.t) FROM dup d), '[]'::jsonb),
    'count', (SELECT count(*) FROM caps)) $$;
REVOKE ALL ON FUNCTION governance.ws_inventory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ws_inventory() TO eye_app, eye_commit;

/* THE CONFORMANCE TREND (the baseline binds it): holds and conflicts opened / lifted, exceptions expired, in the last 30 and 90 days. */
CREATE OR REPLACE FUNCTION governance.ws_trend() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
  SELECT jsonb_object_agg(w.label, jsonb_build_object(
    'holds_opened', (SELECT count(*) FROM governance.holds h WHERE h.opened_at >= clock_timestamp() - w.span),
    'holds_lifted', (SELECT count(*) FROM governance.holds h WHERE h.lifted_at >= clock_timestamp() - w.span),
    'holds_open_now', (SELECT count(*) FROM governance.holds h WHERE h.lifted_at IS NULL),
    'conflicts_raised', (SELECT count(*) FROM governance.ws_conflicts c WHERE c.raised_at >= clock_timestamp() - w.span),
    'conflicts_resolved', (SELECT count(*) FROM governance.ws_conflicts c WHERE c.resolved_at >= clock_timestamp() - w.span),
    'exceptions_expired', (SELECT count(*) FROM governance.ws_exceptions e WHERE e.expired_at >= clock_timestamp() - w.span)))
    FROM (VALUES ('30d', interval '30 days'), ('90d', interval '90 days')) w(label, span) $$;
REVOKE ALL ON FUNCTION governance.ws_trend() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ws_trend() TO eye_app, eye_commit;

/* The baseline's SCOPE TUPLE (PR-01-006 / PR-72-006 / IA-72-006): exactly what the decision is bound to. */
CREATE OR REPLACE FUNCTION governance.ws_scope_keys() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  'capability_version', 'journeys', 'roles', 'tenant_or_domain', 'deployment_profile', 'entitlement', 'data_versions', 'model_versions', 'configuration_digest', 'consequence_class', 'period'] $$;
GRANT EXECUTE ON FUNCTION governance.ws_scope_keys() TO eye_app, eye_commit;

/* PROPOSE a baseline version (the product authority or the conformance steward): assembled HERE from the registries — the inventory, the
   boundaries, the approved rights (or its absence), the exception ageing, the open conflicts and holds, the trend — with the scope tuple; the
   GAPS recorded (what would hold the signature). A proposal with gaps is allowed: the disputed state is preserved and shown. */
CREATE OR REPLACE FUNCTION governance.ws_propose_baseline(p_baseline uuid, p_title text, p_scope jsonb, p_expected_version int, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE v_cur int; v_ref text; v_inv jsonb; m governance.ws_decision_rights; v_rights jsonb := NULL; v_exc jsonb; v_conf jsonb; v_holds jsonb; v_trend jsonb; v_gaps jsonb := '[]'::jsonb;
        v_digest text; k text; v_missing text[];
BEGIN
  PERFORM governance.assert_platform('governance.baseline.propose', p_actor, 'product baseline');
  IF NOT governance.holds_role(p_actor, NULL, NULL, ARRAY['product_authority', 'conformance_steward']) THEN
    RAISE EXCEPTION 'product baseline rejected (authority): a baseline is proposed by the product authority or the conformance steward' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(p_title, ''))) < 8 THEN RAISE EXCEPTION 'product baseline rejected (title): a baseline has a title (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(p_scope) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'product baseline rejected (scope): the scope tuple is an object' USING ERRCODE = '22023'; END IF;
  FOREACH k IN ARRAY governance.ws_scope_keys() LOOP
    IF NOT (p_scope ? k) OR p_scope -> k IS NULL OR p_scope -> k = 'null'::jsonb OR (jsonb_typeof(p_scope -> k) = 'string' AND length(btrim(p_scope ->> k)) = 0)
       OR (jsonb_typeof(p_scope -> k) = 'array' AND jsonb_array_length(p_scope -> k) = 0) THEN
      v_missing := array_append(v_missing, k);
    END IF;
  END LOOP;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'product baseline rejected (scope): the decision is bound to the exact %; missing: %', array_to_string(governance.ws_scope_keys(), ', '), array_to_string(v_missing, ', ') USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_scope ->> 'configuration_digest', '') !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'product baseline rejected (scope): configuration_digest is 64 hex' USING ERRCODE = '22023'; END IF;
  IF NOT (coalesce(p_scope ->> 'consequence_class', '') ~ '^C[0-4]$') THEN RAISE EXCEPTION 'product baseline rejected (scope): consequence_class is C0–C4' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('governance.ws_baselines:' || p_baseline::text, 0));
  SELECT coalesce(max(b.version), 0), max(b.ref) INTO v_cur, v_ref FROM governance.ws_baselines b WHERE b.baseline_id = p_baseline;
  IF p_expected_version IS DISTINCT FROM v_cur THEN
    RAISE EXCEPTION 'product baseline rejected (stale): the baseline is at version % (expected %)', v_cur, coalesce(p_expected_version::text, '<none>') USING ERRCODE = '23505';
  END IF;
  v_inv := governance.ws_inventory();
  m := governance.ws_rights_current();
  IF m.matrix_id IS NOT NULL THEN v_rights := jsonb_build_object('matrix_id', m.matrix_id, 'ref', m.ref, 'version', m.version, 'digest', m.digest, 'signature_id', m.signature_id); END IF;
  v_exc := governance.ws_exception_ageing();
  SELECT coalesce(jsonb_agg(jsonb_build_object('conflict_id', c.conflict_id, 'ref', c.ref, 'kind', c.kind, 'raised_at', c.raised_at) ORDER BY c.raised_at), '[]'::jsonb) INTO v_conf
    FROM governance.ws_conflicts c WHERE c.state = 'open';
  SELECT coalesce(jsonb_agg(jsonb_build_object('hold_id', h.hold_id, 'subject', h.subject_artifact, 'reason_kind', h.reason_kind, 'opened_at', h.opened_at) ORDER BY h.opened_at, h.hold_id), '[]'::jsonb) INTO v_holds
    FROM governance.holds h WHERE h.lifted_at IS NULL AND h.scope = 'PLATFORM';
  v_trend := governance.ws_trend();
  IF (v_inv ->> 'count')::int = 0 THEN v_gaps := v_gaps || jsonb_build_object('gap', 'no_capabilities', 'detail', 'no capability artifact is registered (§RG imports the V8 capability inventory)'); END IF;
  IF jsonb_array_length(v_inv -> 'orphans') > 0 THEN v_gaps := v_gaps || jsonb_build_object('gap', 'orphans', 'detail', v_inv -> 'orphans'); END IF;
  IF jsonb_array_length(v_inv -> 'lapsed') > 0 THEN v_gaps := v_gaps || jsonb_build_object('gap', 'lapsed_owners', 'detail', v_inv -> 'lapsed'); END IF;
  IF jsonb_array_length(v_inv -> 'duplicates') > 0 THEN v_gaps := v_gaps || jsonb_build_object('gap', 'duplicates', 'detail', v_inv -> 'duplicates'); END IF;
  IF v_rights IS NULL THEN v_gaps := v_gaps || jsonb_build_object('gap', 'no_decision_rights', 'detail', 'no approved, signed decision-rights matrix');
  ELSE
    SELECT array_agg(c) INTO v_missing FROM unnest(governance.ws_required_classes()) c
     WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(m.rows) r WHERE r ->> 'subject' = c AND r ->> 'duty' = 'approve');
    IF v_missing IS NOT NULL THEN v_gaps := v_gaps || jsonb_build_object('gap', 'rights_uncovered', 'detail', to_jsonb(v_missing)); END IF;
  END IF;
  IF jsonb_array_length(v_conf) > 0 THEN v_gaps := v_gaps || jsonb_build_object('gap', 'open_conflicts', 'detail', v_conf); END IF;
  v_ref := coalesce(v_ref, governance.ws_next_ref('PBL'));
  v_digest := governance.digest(jsonb_build_object('baseline_id', p_baseline, 'version', v_cur + 1, 'title', btrim(p_title), 'inventory', v_inv -> 'capabilities', 'domains', v_inv -> 'domains',
               'rights', v_rights, 'exceptions', v_exc - 'read_at', 'conflicts', v_conf, 'holds', v_holds, 'trend', v_trend, 'scope', p_scope, 'gaps', v_gaps));
  UPDATE governance.ws_baselines SET state = 'superseded' WHERE baseline_id = p_baseline AND state = 'proposed';
  INSERT INTO governance.ws_baselines (baseline_id, version, ref, title, inventory, domains, rights, exceptions, conflicts, holds, trend, scope_tuple, gaps, digest, proposed_by, correlation_id)
  VALUES (p_baseline, v_cur + 1, v_ref, btrim(p_title), v_inv, v_inv -> 'domains', v_rights, v_exc - 'read_at', v_conf, v_holds, v_trend, p_scope, v_gaps, v_digest, p_actor, p_correlation);
  IF v_cur = 0 THEN  -- a later version is registered when decided (the signed baseline's artifact stays current until then)
    PERFORM governance.ws_register(p_baseline, 'baseline', v_ref, btrim(p_title), p_actor, 'product_authority', 'controlling', 'V8', 'proposed',
              jsonb_build_object('object', 'product_baseline', 'version', v_cur + 1, 'capabilities', v_inv -> 'count', 'gaps', jsonb_array_length(v_gaps)), v_digest, p_actor, p_correlation);
  END IF;
  PERFORM governance.ledger(NULL, NULL, 'baseline', p_baseline, v_cur + 1, 'baseline.proposed', p_actor, jsonb_build_object('digest', v_digest, 'capabilities', v_inv -> 'count', 'gaps', v_gaps), p_correlation);
  RETURN jsonb_build_object('baseline_id', p_baseline, 'ref', v_ref, 'version', v_cur + 1, 'state', 'proposed', 'digest', v_digest, 'gaps', v_gaps, 'signable', jsonb_array_length(v_gaps) = 0,
                            'capabilities', v_inv -> 'count');
END $$;
REVOKE ALL ON FUNCTION governance.ws_propose_baseline(uuid, text, jsonb, int, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ws_propose_baseline(uuid, text, jsonb, int, uuid, uuid) TO eye_commit;

/* DECIDE (sign | reject) a baseline version — the product authority (never the proposer; the matrix's `baseline` approve row), on the exact
   digest; SIGN is refused HELD while the version records gaps or the registry moved since (an open conflict now, an owner lapsed now): the
   unresolved authority holds the release of the baseline (PR-01-005). SIGNED (`baseline_decision`): the executive baseline attestation —
   construction / demonstration only (`claim = demonstration`); the real executive attestation is H3. The previous signed baseline superseded;
   the capabilities linked `part_of` the baseline. */
CREATE OR REPLACE FUNCTION governance.ws_decide_baseline(p_baseline uuid, p_version int, p_decision text, p_digest text, p_reason text, p_signature uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE b governance.ws_baselines%ROWTYPE; v_now jsonb; v_held jsonb := '[]'::jsonb; x jsonb; v_via jsonb;
BEGIN
  PERFORM governance.assert_platform('governance.baseline.decide', p_actor, 'product baseline');
  SELECT * INTO b FROM governance.ws_baselines y WHERE y.baseline_id = p_baseline AND y.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'product baseline rejected (unknown_baseline): no baseline %/v%', p_baseline, p_version USING ERRCODE = '23503'; END IF;
  PERFORM governance.assert_approver('product baseline', p_actor, NULL, NULL, ARRAY['product_authority'], b.proposed_by, NULL, 'signing the product baseline');
  v_via := governance.ws_assert_rights('product baseline', 'baseline', 'approve', p_actor);
  IF b.state <> 'proposed' THEN RAISE EXCEPTION 'product baseline rejected (state): version % is %', p_version, b.state USING ERRCODE = '23505'; END IF;
  IF p_digest IS DISTINCT FROM b.digest THEN RAISE EXCEPTION 'product baseline rejected (stale): the decision names a digest other than version %''s', p_version USING ERRCODE = '23505'; END IF;
  IF p_decision NOT IN ('sign', 'reject') THEN RAISE EXCEPTION 'product baseline rejected (decision): sign or reject' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'product baseline rejected (reason): a decision states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_decision = 'sign' THEN
    IF jsonb_array_length(b.gaps) > 0 THEN
      RAISE EXCEPTION 'product baseline rejected (held): authority is unresolved — % — the baseline is held, the disputed state preserved; resolve through the authority chain and propose again',
        (SELECT string_agg(g ->> 'gap', ', ') FROM jsonb_array_elements(b.gaps) g) USING ERRCODE = '23505';
    END IF;
    v_now := governance.ws_inventory();
    IF jsonb_array_length(v_now -> 'orphans') + jsonb_array_length(v_now -> 'lapsed') + jsonb_array_length(v_now -> 'duplicates') > 0
       OR EXISTS (SELECT 1 FROM governance.ws_conflicts c WHERE c.state = 'open')
       OR (governance.ws_rights_current()).digest IS DISTINCT FROM (b.rights ->> 'digest')
       OR (v_now -> 'capabilities') IS DISTINCT FROM (b.inventory -> 'capabilities') THEN
      RAISE EXCEPTION 'product baseline rejected (stale): the registry moved since version % was proposed (owners, rights, capabilities or conflicts) — propose again on the current state', p_version USING ERRCODE = '23505';
    END IF;
    IF NOT governance.ws_signed(p_signature, 'baseline_decision', p_baseline, p_version, b.digest, p_actor, 'governance.baseline.decide') THEN
      RAISE EXCEPTION 'product baseline rejected (signature): signing carries the product authority''s signature over the baseline digest' USING ERRCODE = '22023';
    END IF;
    UPDATE governance.ws_baselines SET state = 'superseded' WHERE state = 'signed';
  END IF;
  UPDATE governance.ws_baselines SET state = CASE WHEN p_decision = 'sign' THEN 'signed' ELSE 'rejected' END, decided_by = p_actor, decided_at = clock_timestamp(), decision_reason = btrim(p_reason),
         signature_id = CASE WHEN p_decision = 'sign' THEN p_signature END WHERE baseline_id = p_baseline AND version = p_version;
  PERFORM governance.ws_register(p_baseline, 'baseline', b.ref, b.title, p_actor, 'product_authority', 'controlling', 'V8', CASE WHEN p_decision = 'sign' THEN 'active' ELSE 'retired' END,
            jsonb_build_object('object', 'product_baseline', 'version', p_version, 'state', CASE WHEN p_decision = 'sign' THEN 'signed' ELSE 'rejected' END), b.digest, p_actor, p_correlation);
  IF p_decision = 'sign' THEN
    FOR x IN SELECT y FROM jsonb_array_elements(b.inventory -> 'capabilities') y LOOP
      PERFORM governance.ws_link((x ->> 'capability_id')::uuid, p_baseline, 'part_of', jsonb_build_object('baseline_version', p_version), p_actor, p_correlation);
    END LOOP;
  END IF;
  PERFORM governance.ledger(NULL, NULL, 'baseline', p_baseline, p_version, CASE WHEN p_decision = 'sign' THEN 'baseline.signed' ELSE 'baseline.rejected' END, p_actor,
            jsonb_build_object('digest', b.digest, 'reason', btrim(p_reason), 'signature_id', p_signature, 'rights_via', v_via, 'claim', 'demonstration',
                               'attestation', 'the signed baseline decision is the executive baseline attestation of this construction — the real attestation is H3'), p_correlation);
  RETURN jsonb_build_object('baseline_id', p_baseline, 'ref', b.ref, 'version', p_version, 'state', CASE WHEN p_decision = 'sign' THEN 'signed' ELSE 'rejected' END, 'digest', b.digest,
                            'signature_id', p_signature, 'claim', 'demonstration');
END $$;
REVOKE ALL ON FUNCTION governance.ws_decide_baseline(uuid, int, text, text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ws_decide_baseline(uuid, int, text, text, text, uuid, uuid, uuid) TO eye_commit;

-- §PG.6 THE GOVERNANCE REGISTRY ────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE governance.ws_records (
  record_id          uuid NOT NULL,
  version            int  NOT NULL CHECK (version >= 1),
  scope              text NOT NULL DEFAULT 'PLATFORM' CHECK (scope = 'PLATFORM'),
  ref                text NOT NULL,
  kind               text NOT NULL CHECK (kind IN ('decision_record', 'standard', 'debt', 'deprecation')),
  title              text NOT NULL CHECK (length(btrim(title)) BETWEEN 8 AND 300),
  statement          text NOT NULL CHECK (length(btrim(statement)) >= 20),
  owner_principal_id uuid NOT NULL,
  approving_role     text NOT NULL,
  dependencies       uuid[] NOT NULL,
  review_cadence_days int NOT NULL CHECK (review_cadence_days BETWEEN 1 AND 730),
  supersedes_record  uuid,
  details            jsonb NOT NULL CHECK (jsonb_typeof(details) = 'object'),
  state              text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'active', 'rejected', 'superseded', 'closed', 'retired')),
  effective_from     timestamptz,
  next_review_due    date,
  last_reviewed_at   timestamptz,
  reviews            int NOT NULL DEFAULT 0,
  digest             text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  proposed_by        uuid NOT NULL,
  proposed_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_by         uuid,
  decided_at         timestamptz,
  decision_reason    text,
  closure            jsonb,
  closed_by          uuid,
  closed_at          timestamptz,
  claim              text NOT NULL DEFAULT 'demonstration' CHECK (claim = 'demonstration'),
  correlation_id     uuid NOT NULL,
  PRIMARY KEY (record_id, version)
);
CREATE UNIQUE INDEX wrc_one_open ON governance.ws_records (record_id) WHERE state = 'proposed';
CREATE UNIQUE INDEX wrc_one_active ON governance.ws_records (record_id) WHERE state = 'active';

/* PROPOSE a record version (any product-governance role): a new record (expected 0) or a CONTROLLED AMENDMENT (expected = the current version;
   the active version stays in force until the amendment is approved). ES-72-001's fields; a debt (ES-72-005) carries its affected objectives,
   customers, consequences, due day and investment; a deprecation its subject artifact, sunset day and migration path. */
CREATE OR REPLACE FUNCTION governance.ws_propose_record(p_record uuid, p_body jsonb, p_expected_version int, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE v_cur int; v_ref text; v_kind text; v_prev governance.ws_records%ROWTYPE; v_owner uuid; v_role text; v_deps uuid[]; v_cad int; v_sup uuid; v_det jsonb := '{}'::jsonb; v_digest text;
BEGIN
  PERFORM governance.assert_platform('governance.record.propose', p_actor, 'governance record');
  IF NOT governance.holds_role(p_actor, NULL, NULL, governance.ws_governance_roles()) THEN
    RAISE EXCEPTION 'governance record rejected (authority): a record is proposed by a holder of a product-governance role' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_body) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'governance record rejected (body): the record is an object' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('governance.ws_records:' || p_record::text, 0));
  SELECT coalesce(max(r.version), 0), max(r.ref) INTO v_cur, v_ref FROM governance.ws_records r WHERE r.record_id = p_record;
  IF p_expected_version IS DISTINCT FROM v_cur THEN
    RAISE EXCEPTION 'governance record rejected (stale): the record is at version % (expected %)', v_cur, coalesce(p_expected_version::text, '<none>') USING ERRCODE = '23505';
  END IF;
  IF v_cur > 0 THEN
    SELECT * INTO v_prev FROM governance.ws_records r WHERE r.record_id = p_record AND r.version = v_cur;
    IF v_prev.state IN ('closed', 'retired', 'rejected') AND NOT EXISTS (SELECT 1 FROM governance.ws_records r WHERE r.record_id = p_record AND r.state = 'active') THEN
      RAISE EXCEPTION 'governance record rejected (state): % is % — a new record is a new record', v_prev.ref, v_prev.state USING ERRCODE = '23505';
    END IF;
  END IF;
  v_kind := coalesce(p_body ->> 'kind', v_prev.kind);
  IF v_cur > 0 AND v_kind IS DISTINCT FROM v_prev.kind THEN RAISE EXCEPTION 'governance record rejected (kind): an amendment keeps its kind (%)', v_prev.kind USING ERRCODE = '22023'; END IF;
  IF NOT (coalesce(v_kind, '') IN ('decision_record', 'standard', 'debt', 'deprecation')) THEN RAISE EXCEPTION 'governance record rejected (kind): decision_record, standard, debt or deprecation' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_body ->> 'title', ''))) < 8 OR length(btrim(coalesce(p_body ->> 'statement', ''))) < 20 THEN
    RAISE EXCEPTION 'governance record rejected (statement): a title (8+) and a statement (20+ characters)' USING ERRCODE = '22023';
  END IF;
  v_owner := CASE WHEN jsonb_typeof(p_body -> 'owner') = 'string' THEN (p_body ->> 'owner')::uuid ELSE v_prev.owner_principal_id END;
  IF v_owner IS NULL OR NOT governance.ws_is_human(v_owner) THEN RAISE EXCEPTION 'governance record rejected (owner): the accountable owner is a named active human' USING ERRCODE = '22023'; END IF;
  v_role := coalesce(p_body ->> 'approvingRole', v_prev.approving_role);
  IF NOT (coalesce(v_role, '') = ANY (governance.ws_governance_roles())) OR v_role = 'conformance_steward' THEN
    RAISE EXCEPTION 'governance record rejected (approving_role): the approving authority is product_authority, design_system_authority, independent_assurance or operations_authority' USING ERRCODE = '22023';
  END IF;
  v_deps := CASE WHEN p_body ? 'dependencies' THEN ARRAY(SELECT DISTINCT x::uuid FROM jsonb_array_elements_text(p_body -> 'dependencies') x ORDER BY 1) ELSE coalesce(v_prev.dependencies, '{}') END;
  PERFORM governance.ws_assert_artifacts('governance record', v_deps, NULL, 'dependencies');
  v_cad := coalesce((p_body ->> 'reviewCadenceDays')::int, v_prev.review_cadence_days);
  IF v_cad IS NULL OR v_cad NOT BETWEEN 1 AND 730 THEN RAISE EXCEPTION 'governance record rejected (cadence): a review cadence of 1–730 days' USING ERRCODE = '22023'; END IF;
  v_sup := CASE WHEN jsonb_typeof(p_body -> 'supersedesRecord') = 'string' THEN (p_body ->> 'supersedesRecord')::uuid ELSE v_prev.supersedes_record END;
  IF v_sup IS NOT NULL AND NOT EXISTS (SELECT 1 FROM governance.ws_records r WHERE r.record_id = v_sup AND r.state = 'active' AND r.record_id <> p_record) THEN
    RAISE EXCEPTION 'governance record rejected (unknown_record): supersedesRecord names an active record of this registry' USING ERRCODE = '23503';
  END IF;
  IF v_kind = 'debt' THEN
    IF jsonb_typeof(p_body -> 'details' -> 'affectedObjectives') <> 'array' OR jsonb_array_length(p_body -> 'details' -> 'affectedObjectives') = 0
       OR jsonb_typeof(p_body -> 'details' -> 'customers') <> 'array' OR length(btrim(coalesce(p_body -> 'details' ->> 'consequences', ''))) < 12
       OR coalesce(p_body -> 'details' ->> 'dueOn', '') !~ '^\d{4}-\d{2}-\d{2}$' OR length(btrim(coalesce(p_body -> 'details' ->> 'investment', ''))) < 3 THEN
      RAISE EXCEPTION 'governance record rejected (debt): a debt names its affected objectives, customers (a list, possibly empty), consequences (12+), due day and investment — decision-active risk (ES-72-005)' USING ERRCODE = '22023';
    END IF;
    v_det := jsonb_build_object('affected_objectives', p_body -> 'details' -> 'affectedObjectives', 'customers', p_body -> 'details' -> 'customers', 'consequences', btrim(p_body -> 'details' ->> 'consequences'),
                                'due_on', p_body -> 'details' ->> 'dueOn', 'investment', btrim(p_body -> 'details' ->> 'investment'));
  ELSIF v_kind = 'deprecation' THEN
    IF jsonb_typeof(p_body -> 'details' -> 'subject') <> 'string' OR coalesce(p_body -> 'details' ->> 'sunsetOn', '') !~ '^\d{4}-\d{2}-\d{2}$' OR length(btrim(coalesce(p_body -> 'details' ->> 'migration', ''))) < 12 THEN
      RAISE EXCEPTION 'governance record rejected (deprecation): a deprecation names its subject artifact, sunset day and migration path (12+)' USING ERRCODE = '22023';
    END IF;
    PERFORM governance.ws_assert_artifacts('governance record', ARRAY[(p_body -> 'details' ->> 'subject')::uuid], NULL, 'details.subject');
    v_det := jsonb_build_object('subject', p_body -> 'details' ->> 'subject', 'sunset_on', p_body -> 'details' ->> 'sunsetOn', 'migration', btrim(p_body -> 'details' ->> 'migration'));
  ELSE
    v_det := CASE WHEN jsonb_typeof(p_body -> 'details') = 'object' THEN p_body -> 'details' ELSE '{}'::jsonb END;
  END IF;
  v_ref := coalesce(v_ref, governance.ws_next_ref(CASE v_kind WHEN 'decision_record' THEN 'GDR' WHEN 'standard' THEN 'GST' WHEN 'debt' THEN 'GTD' ELSE 'GDP' END));
  v_digest := governance.digest(jsonb_build_object('record_id', p_record, 'version', v_cur + 1, 'kind', v_kind, 'title', btrim(p_body ->> 'title'), 'statement', btrim(p_body ->> 'statement'),
               'owner', v_owner, 'approving_role', v_role, 'dependencies', to_jsonb(v_deps), 'review_cadence_days', v_cad, 'supersedes_record', v_sup, 'details', v_det));
  UPDATE governance.ws_records SET state = 'superseded' WHERE record_id = p_record AND state = 'proposed';
  INSERT INTO governance.ws_records (record_id, version, ref, kind, title, statement, owner_principal_id, approving_role, dependencies, review_cadence_days, supersedes_record, details, digest, proposed_by, correlation_id)
  VALUES (p_record, v_cur + 1, v_ref, v_kind, btrim(p_body ->> 'title'), btrim(p_body ->> 'statement'), v_owner, v_role, v_deps, v_cad, v_sup, v_det, v_digest, p_actor, p_correlation);
  PERFORM governance.ledger(NULL, NULL, 'governance_record', p_record, v_cur + 1, CASE WHEN v_cur = 0 THEN 'record.proposed' ELSE 'record.amendment_proposed' END, p_actor,
            jsonb_build_object('digest', v_digest, 'kind', v_kind, 'approving_role', v_role), p_correlation);
  RETURN jsonb_build_object('record_id', p_record, 'ref', v_ref, 'version', v_cur + 1, 'kind', v_kind, 'state', 'proposed', 'digest', v_digest, 'approving_role', v_role);
END $$;
REVOKE ALL ON FUNCTION governance.ws_propose_record(uuid, jsonb, int, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ws_propose_record(uuid, jsonb, int, uuid, uuid) TO eye_commit;

/* DECIDE (approve | reject) a record version: a named human holding the record's approving role (never the proposer, never its owner — the
   owner is accountable, the authority approves); on the exact digest. APPROVE: the version becomes ACTIVE (effective now, next review due
   after the cadence), the prior active version superseded (controlled amendment), a superseded record retired with the supersession linked. */
CREATE OR REPLACE FUNCTION governance.ws_decide_record(p_record uuid, p_version int, p_decision text, p_digest text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE r governance.ws_records%ROWTYPE; v_kind text; d uuid; v_via jsonb;
BEGIN
  PERFORM governance.assert_platform('governance.record.decide', p_actor, 'governance record');
  SELECT * INTO r FROM governance.ws_records x WHERE x.record_id = p_record AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'governance record rejected (unknown_record): no record %/v%', p_record, p_version USING ERRCODE = '23503'; END IF;
  PERFORM governance.assert_approver('governance record', p_actor, NULL, NULL, ARRAY[r.approving_role], r.proposed_by, ARRAY[r.owner_principal_id], 'approving a governance record');
  v_via := governance.ws_assert_rights('governance record', 'record', 'approve', p_actor);
  IF r.state <> 'proposed' THEN RAISE EXCEPTION 'governance record rejected (state): version % is %', p_version, r.state USING ERRCODE = '23505'; END IF;
  IF p_digest IS DISTINCT FROM r.digest THEN RAISE EXCEPTION 'governance record rejected (stale): the decision names a digest other than version %''s', p_version USING ERRCODE = '23505'; END IF;
  IF p_decision NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'governance record rejected (decision): approve or reject' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'governance record rejected (reason): a decision states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  v_kind := CASE r.kind WHEN 'standard' THEN 'standard' ELSE 'decision_record' END;
  IF p_decision = 'approve' THEN
    UPDATE governance.ws_records SET state = 'superseded' WHERE record_id = p_record AND state = 'active';
    UPDATE governance.ws_records SET state = 'active', effective_from = clock_timestamp(), next_review_due = (clock_timestamp() AT TIME ZONE 'UTC')::date + r.review_cadence_days,
           decided_by = p_actor, decided_at = clock_timestamp(), decision_reason = btrim(p_reason) WHERE record_id = p_record AND version = p_version;
    PERFORM governance.ws_register(p_record, v_kind, r.ref, r.title, r.owner_principal_id, r.approving_role, 'normative', NULL, 'active',
              jsonb_build_object('record_kind', r.kind, 'version', p_version, 'review_cadence_days', r.review_cadence_days, 'details', r.details), r.digest, p_actor, p_correlation);
    FOREACH d IN ARRAY r.dependencies LOOP PERFORM governance.ws_link(p_record, d, 'depends_on', '{}'::jsonb, p_actor, p_correlation); END LOOP;
    IF r.supersedes_record IS NOT NULL THEN
      UPDATE governance.ws_records SET state = 'retired', closure = jsonb_build_object('mode', 'superseded', 'by', p_record, 'by_ref', r.ref), closed_by = p_actor, closed_at = clock_timestamp()
       WHERE record_id = r.supersedes_record AND state = 'active';
      PERFORM governance.ws_link(p_record, r.supersedes_record, 'supersedes', '{}'::jsonb, p_actor, p_correlation);
    END IF;
    IF r.kind = 'deprecation' THEN PERFORM governance.ws_link(p_record, (r.details ->> 'subject')::uuid, 'governs', jsonb_build_object('as', 'deprecation'), p_actor, p_correlation); END IF;
  ELSE
    UPDATE governance.ws_records SET state = 'rejected', decided_by = p_actor, decided_at = clock_timestamp(), decision_reason = btrim(p_reason) WHERE record_id = p_record AND version = p_version;
  END IF;
  PERFORM governance.ledger(NULL, NULL, 'governance_record', p_record, p_version, CASE WHEN p_decision = 'approve' THEN 'record.approved' ELSE 'record.rejected' END, p_actor,
            jsonb_build_object('digest', r.digest, 'reason', btrim(p_reason), 'rights_via', v_via), p_correlation);
  RETURN jsonb_build_object('record_id', p_record, 'ref', r.ref, 'version', p_version, 'state', CASE WHEN p_decision = 'approve' THEN 'active' ELSE 'rejected' END, 'digest', r.digest,
                            'next_review_due', CASE WHEN p_decision = 'approve' THEN ((clock_timestamp() AT TIME ZONE 'UTC')::date + r.review_cadence_days) END);
END $$;
REVOKE ALL ON FUNCTION governance.ws_decide_record(uuid, int, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ws_decide_record(uuid, int, text, text, text, uuid, uuid) TO eye_commit;

/* RECORD A REVIEW of an active record (its owner or a holder of its approving role — a named human): the cadence honoured, the next review due. */
CREATE OR REPLACE FUNCTION governance.ws_review_record(p_record uuid, p_version int, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE r governance.ws_records%ROWTYPE; v_next date;
BEGIN
  PERFORM governance.assert_platform('governance.record.review', p_actor, 'governance record');
  SELECT * INTO r FROM governance.ws_records x WHERE x.record_id = p_record AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'governance record rejected (unknown_record): no record %/v%', p_record, p_version USING ERRCODE = '23503'; END IF;
  IF NOT governance.ws_is_human(p_actor) THEN RAISE EXCEPTION 'governance record rejected (actor): a review is a named human''s act' USING ERRCODE = '42501'; END IF;
  IF p_actor <> r.owner_principal_id AND NOT governance.holds_role(p_actor, NULL, NULL, ARRAY[r.approving_role]) THEN
    RAISE EXCEPTION 'governance record rejected (authority): a review is the owner''s or the approving authority''s (%)', r.approving_role USING ERRCODE = '42501';
  END IF;
  IF r.state <> 'active' THEN RAISE EXCEPTION 'governance record rejected (state): only an active record is reviewed (version % is %)', p_version, r.state USING ERRCODE = '23505'; END IF;
  IF length(btrim(coalesce(p_note, ''))) < 12 THEN RAISE EXCEPTION 'governance record rejected (note): a review states what was found (12+ characters)' USING ERRCODE = '22023'; END IF;
  v_next := (clock_timestamp() AT TIME ZONE 'UTC')::date + r.review_cadence_days;
  UPDATE governance.ws_records SET last_reviewed_at = clock_timestamp(), next_review_due = v_next, reviews = reviews + 1 WHERE record_id = p_record AND version = p_version;
  PERFORM governance.ledger(NULL, NULL, 'governance_record', p_record, p_version, 'record.reviewed', p_actor,
            jsonb_build_object('note', btrim(p_note), 'next_review_due', v_next, 'was_due', r.next_review_due, 'overdue', r.next_review_due < (clock_timestamp() AT TIME ZONE 'UTC')::date), p_correlation);
  RETURN jsonb_build_object('record_id', p_record, 'ref', r.ref, 'version', p_version, 'next_review_due', v_next, 'reviews', r.reviews + 1);
END $$;
REVOKE ALL ON FUNCTION governance.ws_review_record(uuid, int, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ws_review_record(uuid, int, text, uuid, uuid) TO eye_commit;

/* CLOSE an active record: a debt by VERIFIED CLOSURE (`verified_closure` — current evidence, verified by a holder of the approving role who is
   neither the owner nor the proposer); any record by RETIREMENT PROOF (`retirement` — current evidence and, optionally, its successor
   artifact). The artifact retired; the evidence kept with the record. */
CREATE OR REPLACE FUNCTION governance.ws_close_record(p_record uuid, p_version int, p_mode text, p_evidence jsonb, p_successor uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE r governance.ws_records%ROWTYPE; v_ev jsonb; v_closure jsonb;
BEGIN
  PERFORM governance.assert_platform('governance.record.close', p_actor, 'governance record');
  SELECT * INTO r FROM governance.ws_records x WHERE x.record_id = p_record AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'governance record rejected (unknown_record): no record %/v%', p_record, p_version USING ERRCODE = '23503'; END IF;
  PERFORM governance.assert_approver('governance record', p_actor, NULL, NULL, ARRAY[r.approving_role], r.proposed_by, ARRAY[r.owner_principal_id],
            CASE WHEN p_mode = 'verified_closure' THEN 'verifying a debt''s closure' ELSE 'retiring a governance record' END);
  IF r.state <> 'active' THEN RAISE EXCEPTION 'governance record rejected (state): only an active record is closed (version % is %)', p_version, r.state USING ERRCODE = '23505'; END IF;
  IF p_mode NOT IN ('verified_closure', 'retirement') THEN RAISE EXCEPTION 'governance record rejected (mode): verified_closure or retirement' USING ERRCODE = '22023'; END IF;
  IF p_mode = 'verified_closure' AND r.kind <> 'debt' THEN RAISE EXCEPTION 'governance record rejected (mode): a verified closure closes a debt; other records are retired with proof' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 12 THEN RAISE EXCEPTION 'governance record rejected (reason): a closure states what was verified (12+ characters)' USING ERRCODE = '22023'; END IF;
  v_ev := governance.ws_evidence('governance record', p_evidence, true, governance.ws_evidence_currency_days(), NULL);
  IF p_successor IS NOT NULL THEN PERFORM governance.ws_assert_artifacts('governance record', ARRAY[p_successor], NULL, 'successor'); END IF;
  v_closure := jsonb_build_object('mode', p_mode, 'evidence', v_ev, 'successor', p_successor, 'reason', btrim(p_reason), 'verified_by', p_actor);
  UPDATE governance.ws_records SET state = CASE WHEN p_mode = 'verified_closure' THEN 'closed' ELSE 'retired' END, closure = v_closure, closed_by = p_actor, closed_at = clock_timestamp()
   WHERE record_id = p_record AND version = p_version;
  PERFORM governance.ws_register(p_record, CASE r.kind WHEN 'standard' THEN 'standard' ELSE 'decision_record' END, r.ref, r.title, r.owner_principal_id, r.approving_role, 'normative', NULL, 'retired',
            jsonb_build_object('record_kind', r.kind, 'version', p_version, 'closure', p_mode), r.digest, p_actor, p_correlation);
  IF p_successor IS NOT NULL THEN PERFORM governance.ws_link(p_successor, p_record, 'supersedes', jsonb_build_object('as', 'retirement successor'), p_actor, p_correlation); END IF;
  PERFORM governance.ledger(NULL, NULL, 'governance_record', p_record, p_version, CASE WHEN p_mode = 'verified_closure' THEN 'record.closure_verified' ELSE 'record.retired' END, p_actor, v_closure, p_correlation);
  RETURN jsonb_build_object('record_id', p_record, 'ref', r.ref, 'version', p_version, 'state', CASE WHEN p_mode = 'verified_closure' THEN 'closed' ELSE 'retired' END, 'closure', v_closure);
END $$;
REVOKE ALL ON FUNCTION governance.ws_close_record(uuid, int, text, jsonb, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ws_close_record(uuid, int, text, jsonb, uuid, text, uuid, uuid) TO eye_commit;

/* THE POSTURE (IA-72-002 / DP-72-002: declared vs observed): every dimension `conformant` | `non_conformant` | `unknown` — UNKNOWN where nothing
   is declared (never inferred healthy) — with what makes it so. */
CREATE OR REPLACE FUNCTION governance.ws_posture() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE v_inv jsonb := governance.ws_inventory(); v_age jsonb := governance.ws_exception_ageing(); m governance.ws_decision_rights := governance.ws_rights_current();
        v_dims jsonb := '{}'::jsonb; n_over int; n_debt int; n_rec int; n_conf int; n_holds int; v_signed boolean; v_today date := (clock_timestamp() AT TIME ZONE 'UTC')::date;
BEGIN
  v_signed := EXISTS (SELECT 1 FROM governance.ws_baselines b WHERE b.state = 'signed');
  v_dims := v_dims || jsonb_build_object('baseline', jsonb_build_object('state', CASE WHEN v_signed THEN 'conformant' WHEN EXISTS (SELECT 1 FROM governance.ws_baselines) THEN 'non_conformant' ELSE 'unknown' END,
              'detail', CASE WHEN v_signed THEN (SELECT jsonb_build_object('ref', b.ref, 'version', b.version, 'signed_at', b.decided_at) FROM governance.ws_baselines b WHERE b.state = 'signed')
                             ELSE to_jsonb('no signed product baseline'::text) END));
  v_dims := v_dims || jsonb_build_object('ownership', jsonb_build_object('state', CASE WHEN (v_inv ->> 'count')::int = 0 THEN 'unknown'
                 WHEN jsonb_array_length(v_inv -> 'orphans') + jsonb_array_length(v_inv -> 'lapsed') + jsonb_array_length(v_inv -> 'duplicates') > 0 THEN 'non_conformant' ELSE 'conformant' END,
              'capabilities', v_inv -> 'count', 'orphans', v_inv -> 'orphans', 'lapsed', v_inv -> 'lapsed', 'duplicates', v_inv -> 'duplicates'));
  v_dims := v_dims || jsonb_build_object('decision_rights', jsonb_build_object('state', CASE WHEN m.matrix_id IS NULL THEN 'unknown' ELSE 'conformant' END,
              'detail', CASE WHEN m.matrix_id IS NULL THEN to_jsonb('no approved decision-rights matrix'::text) ELSE jsonb_build_object('ref', m.ref, 'version', m.version) END));
  v_dims := v_dims || jsonb_build_object('exceptions', jsonb_build_object('state', CASE WHEN NOT EXISTS (SELECT 1 FROM governance.ws_exceptions) THEN 'unknown'
                 WHEN (v_age -> 'totals' ->> 'expired')::int > 0 THEN 'non_conformant' ELSE 'conformant' END, 'totals', v_age -> 'totals', 'buckets', v_age -> 'buckets',
              'open_reviews', (SELECT count(*) FROM governance.ws_exception_reviews r WHERE r.state = 'open')));
  SELECT count(*) INTO n_conf FROM governance.ws_conflicts c WHERE c.state = 'open';
  v_dims := v_dims || jsonb_build_object('conflicts', jsonb_build_object('state', CASE WHEN n_conf > 0 THEN 'non_conformant' WHEN EXISTS (SELECT 1 FROM governance.ws_conflicts) THEN 'conformant' ELSE 'unknown' END, 'open', n_conf));
  SELECT count(*) INTO n_rec FROM governance.ws_records r WHERE r.state = 'active';
  SELECT count(*) INTO n_over FROM governance.ws_records r WHERE r.state = 'active' AND r.next_review_due < v_today;
  SELECT count(*) INTO n_debt FROM governance.ws_records r WHERE r.state = 'active' AND r.kind = 'debt' AND (r.details ->> 'due_on')::date < v_today;
  v_dims := v_dims || jsonb_build_object('records', jsonb_build_object('state', CASE WHEN n_rec = 0 THEN 'unknown' WHEN n_over + n_debt > 0 THEN 'non_conformant' ELSE 'conformant' END,
              'active', n_rec, 'reviews_overdue', n_over, 'debt_past_due', n_debt));
  SELECT count(*) INTO n_holds FROM governance.holds h WHERE h.lifted_at IS NULL AND h.scope = 'PLATFORM';
  v_dims := v_dims || jsonb_build_object('holds', jsonb_build_object('state', CASE WHEN n_holds > 0 THEN 'non_conformant' WHEN EXISTS (SELECT 1 FROM governance.holds h WHERE h.scope = 'PLATFORM') THEN 'conformant' ELSE 'unknown' END,
              'open', n_holds));
  RETURN jsonb_build_object('dimensions', v_dims,
    'summary', (SELECT jsonb_object_agg(s, n) FROM (SELECT d.value ->> 'state' AS s, count(*) AS n FROM jsonb_each(v_dims) d GROUP BY 1) q),
    'rule', 'a dimension is conformant only on a declaration and an observation that agree; unknown where nothing is declared — never inferred healthy, complete, current, authorized or recovered',
    'read_at', clock_timestamp());
END $$;
REVOKE ALL ON FUNCTION governance.ws_posture() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ws_posture() TO eye_app, eye_commit;

/* THE POSTURE SNAPSHOTS (append-only): the observed state VERSIONED — recorded by the conformance steward only when it changed. */
CREATE TABLE governance.ws_posture_snapshots (
  snapshot_id    uuid PRIMARY KEY,
  scope          text NOT NULL DEFAULT 'PLATFORM' CHECK (scope = 'PLATFORM'),
  seq            int  NOT NULL UNIQUE,
  posture        jsonb NOT NULL,
  digest         text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  recorded_by    uuid NOT NULL,
  recorded_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id uuid NOT NULL
);
CREATE TRIGGER wps_append_only BEFORE UPDATE OR DELETE ON governance.ws_posture_snapshots FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE OR REPLACE FUNCTION governance.ws_record_posture(p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE v jsonb; v_digest text; v_last text; v_seq int; v_id uuid := gen_random_uuid();
BEGIN
  PERFORM governance.assert_platform('governance.posture.record', p_actor, 'governance record');
  IF NOT governance.holds_role(p_actor, NULL, NULL, ARRAY['conformance_steward']) THEN
    RAISE EXCEPTION 'governance record rejected (authority): the posture is recorded by the conformance steward' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('governance.ws_posture_snapshots', 0));
  v := governance.ws_posture() - 'read_at';
  v_digest := governance.digest(v);
  SELECT s.digest, s.seq INTO v_last, v_seq FROM governance.ws_posture_snapshots s ORDER BY s.seq DESC LIMIT 1;
  IF v_last = v_digest THEN RETURN jsonb_build_object('recorded', false, 'seq', v_seq, 'digest', v_digest, 'reason', 'the observed posture is unchanged since the last snapshot'); END IF;
  INSERT INTO governance.ws_posture_snapshots (snapshot_id, seq, posture, digest, recorded_by, correlation_id) VALUES (v_id, coalesce(v_seq, 0) + 1, v, v_digest, p_actor, p_correlation);
  PERFORM governance.ledger(NULL, NULL, 'posture', v_id, coalesce(v_seq, 0) + 1, 'posture.recorded', p_actor, jsonb_build_object('digest', v_digest, 'summary', v -> 'summary'), p_correlation);
  RETURN jsonb_build_object('recorded', true, 'snapshot_id', v_id, 'seq', coalesce(v_seq, 0) + 1, 'digest', v_digest, 'posture', v);
END $$;
REVOKE ALL ON FUNCTION governance.ws_record_posture(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ws_record_posture(uuid, uuid) TO eye_commit;

-- §PG.7 RLS AND GRANTS (the prelude's idiom: PLATFORM rows readable by every authenticated context; SELECT only; the definer ports write) ──
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['governance.ws_capability_owners', 'governance.ws_decision_rights', 'governance.ws_baselines', 'governance.ws_exceptions', 'governance.ws_exception_reviews',
                           'governance.ws_change_proposals', 'governance.ws_change_approvals', 'governance.ws_conflicts', 'governance.ws_records', 'governance.ws_posture_snapshots'] LOOP
    EXECUTE format('REVOKE ALL ON %s FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$CREATE POLICY governance_visibility ON %s USING ((scope = 'PLATFORM' AND public.eye_scope() <> 'NONE') OR public.eye_scope() = 'PLATFORM')$f$, t);
    EXECUTE format('GRANT SELECT ON %s TO eye_app, eye_commit', t);
  END LOOP;
END $$;
