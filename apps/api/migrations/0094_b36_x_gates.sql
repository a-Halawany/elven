-- 0094 §G — CP-6 B36 part `gates` (2026-09-30): THE HUMAN GATE COMPLETED (F-P6-04 completes; ADR-003; JRN-17 sign, distribute; PER-01).
-- Built on the §0 prelude (0094_b36_strategic_planning_home_briefing_publishing.sql — the roles board_member / executive_operator, the
-- signature executive.signatures / record_signature / signature_of, the uniform gate states executive.gate_states, the widened
-- decision.package_events vocabulary) and on 0090 §G (the ledgers, the typed conditions, the distinct acts, overrides, delegation, the
-- board class, the preview, the controls). Nothing of the prelude is re-declared. What is here:
--   §G0 THE VALIDATED FIELDS — package_versions.missing_information / expected_effects (first-class, validated when set and again at
--       the proposal: version.fields_validated; a malformed field refused naming the field); the port decision.set_version_fields (under
--       decision.package.terms, on a draft) and decision.validate_version_fields_at_propose (under decision.package.propose).
--   §G1 THE LEDGERS — decision.recusals, decision.challenges (a transition with its resolution), decision.pdp_denials (a denial as a
--       versioned object linked to the replay), decision.distributions (the decision record distributed after commitment: recipients,
--       channels, receipts).
--   §G2 THE SIGNATURE beyond the audit chain — decision.signature_subject (the read: what would be signed now), decision.sign_approval and
--       decision.sign_decision (the approval's digest is the approval row's header digest; the decision's is the committed version's header
--       digest; the Ed25519 row is executive.record_signature's, written by SignatureService under the same bound action in the same
--       transaction; the port binds the row to the subject as it stands — a stale digest is refused and the row rolls back with it).
--   §G3 RECUSAL — decision.recuse_approver (the approver's own act; the standing approval voided; the quorum re-evaluated; a package that
--       loses its quorum returns to review); a recused approver's later approval refused by decision.approvals_refuse_recused.
--   §G4 CHALLENGE — decision.challenge_decision (a room member or the tenant's auditor, before or after commitment; the gate state reads
--       `challenged`), decision.resolve_challenge (the owner, never the challenger: upheld → the version superseded through the withdrawal
--       chain's own effects (0078/0090 withdraw_package) before commitment, `reopen_required` recorded after it; dismissed → the state
--       returns); a commitment on a challenged version is HELD by decision.commitments_refuse_challenged.
--   §G5 THE PDP DENIAL OBJECT — decision.record_pdp_denial (called by the pipeline's denial path under the EVIDENCE context bound to the
--       denied decision.* action) and the read decision.pdp_denials_of (the replay lists them beside its content).
--   §G6 DISTRIBUTION — decision.distribute_decision (after commitment; the record digested; the room's members and the named recipients;
--       in_app always, email / sms / teams SYNTHETIC through the B34 local sinks; an external collaborator never a recipient),
--       decision._record_distribution_receipt (internal), decision.distributions_of.
--   §G7 THE UNIFORM GATE STATE (ADR-003) — decision.gate_state_of (a version), observation.source_gate_state_of (a source contract's
--       activation states, 0022), graph.merge_gate_state_of (a resolution's states, 0024) — one vocabulary, executive.gate_states.
--   §G8 THE BOARD — decision.board_surface (the board member's read), decision.board_gate_check (the class and the standing before the
--       board's own acts decision.board.approve / .reject / .defer), the canonical-write registration of the board's approval.
--   §G9 THE RE-DECLARATIONS (this part alone; each copied whole with ONE change) — decision.record_approval (0090:4485) admits the board's
--       bound actions; decision.gate_act (0090:3916) admits decision.board.defer.
-- Refusals are a FAMILY `<noun> rejected (<class>): …` (the challenge's noun is `decision challenge`: `challenge rejected` is B9's review challenge); the classes actor / ownership / authority / separation / class / recused answer 403,
-- unknown_* 404, state / stale_digest 409, the rest 422 (apps/api/src/observation/observation-errors.ts, the B36 gates block).
-- Every figure a harness seeds is SYNTHETIC. Forward-only; 0084–0093 untouched.

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §G0 THE VALIDATED FIELDS OF A VERSION (l3)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
ALTER TABLE decision.package_versions
  ADD COLUMN missing_information jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(missing_information) = 'array'),
  ADD COLUMN expected_effects    jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(expected_effects) = 'array');
COMMENT ON COLUMN decision.package_versions.missing_information IS 'B36 (0094 §G0): what the decision still lacks — [{what, owner, needed_by}], validated by decision.validate_version_fields; set on a draft, re-validated at the proposal (version.fields_validated).';
COMMENT ON COLUMN decision.package_versions.expected_effects IS 'B36 (0094 §G0): the effects the choice is expected to have — [{effect, measure, direction, horizon, basis}], validated by decision.validate_version_fields.';

/* The validator: the two lists normalised, or a refusal NAMING THE FIELD. missing_information: [{what (4..400 chars), owner (a principal
   id), needed_by (a day)}]; expected_effects: [{effect (4..400), measure (2..120: a measure key or id), direction (up | down | flat),
   horizon (30d | 90d | 12m | 36m — the §0 horizon vocabulary), basis (4..1000)}]; at most 20 each. */
CREATE OR REPLACE FUNCTION decision.validate_version_fields(p_missing jsonb, p_effects jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE x jsonb; i int := 0; v_m jsonb := '[]'::jsonb; v_e jsonb := '[]'::jsonb; v_day date;
BEGIN
  IF p_missing IS NULL OR jsonb_typeof(p_missing) <> 'array' OR jsonb_array_length(p_missing) > 20 THEN
    RAISE EXCEPTION 'version fields rejected (missing_information): a list of at most 20 {what, owner, needed_by}' USING ERRCODE = '22023';
  END IF;
  IF p_effects IS NULL OR jsonb_typeof(p_effects) <> 'array' OR jsonb_array_length(p_effects) > 20 THEN
    RAISE EXCEPTION 'version fields rejected (expected_effects): a list of at most 20 {effect, measure, direction, horizon, basis}' USING ERRCODE = '22023';
  END IF;
  FOR x IN SELECT value FROM jsonb_array_elements(p_missing) LOOP
    IF jsonb_typeof(x) <> 'object' THEN RAISE EXCEPTION 'version fields rejected (missing_information[%]): an item is an object {what, owner, needed_by}', i USING ERRCODE = '22023'; END IF;
    IF coalesce(length(btrim(x ->> 'what')), 0) NOT BETWEEN 4 AND 400 THEN RAISE EXCEPTION 'version fields rejected (missing_information[%].what): says what is missing (4 to 400 characters)', i USING ERRCODE = '22023'; END IF;
    IF (x ->> 'owner') IS NULL OR (x ->> 'owner') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'version fields rejected (missing_information[%].owner): names the principal who will supply it', i USING ERRCODE = '22023';
    END IF;
    IF (x ->> 'needed_by') IS NULL OR (x ->> 'needed_by') !~ '^\d{4}-\d{2}-\d{2}' THEN RAISE EXCEPTION 'version fields rejected (missing_information[%].needed_by): names the day it is needed by', i USING ERRCODE = '22023'; END IF;
    BEGIN v_day := left(x ->> 'needed_by', 10)::date; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'version fields rejected (missing_information[%].needed_by): names the day it is needed by', i USING ERRCODE = '22023'; END;
    v_m := v_m || jsonb_build_array(jsonb_build_object('what', btrim(x ->> 'what'), 'owner', x ->> 'owner', 'needed_by', to_char(v_day, 'YYYY-MM-DD')));
    i := i + 1;
  END LOOP;
  i := 0;
  FOR x IN SELECT value FROM jsonb_array_elements(p_effects) LOOP
    IF jsonb_typeof(x) <> 'object' THEN RAISE EXCEPTION 'version fields rejected (expected_effects[%]): an item is an object {effect, measure, direction, horizon, basis}', i USING ERRCODE = '22023'; END IF;
    IF coalesce(length(btrim(x ->> 'effect')), 0) NOT BETWEEN 4 AND 400 THEN RAISE EXCEPTION 'version fields rejected (expected_effects[%].effect): says the effect expected (4 to 400 characters)', i USING ERRCODE = '22023'; END IF;
    IF coalesce(length(btrim(x ->> 'measure')), 0) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'version fields rejected (expected_effects[%].measure): names the measure it shows on (2 to 120 characters)', i USING ERRCODE = '22023'; END IF;
    IF (x ->> 'direction') IS NULL OR (x ->> 'direction') NOT IN ('up', 'down', 'flat') THEN RAISE EXCEPTION 'version fields rejected (expected_effects[%].direction): up, down or flat', i USING ERRCODE = '22023'; END IF;
    IF (x ->> 'horizon') IS NULL OR (x ->> 'horizon') NOT IN ('30d', '90d', '12m', '36m') THEN RAISE EXCEPTION 'version fields rejected (expected_effects[%].horizon): 30d, 90d, 12m or 36m', i USING ERRCODE = '22023'; END IF;
    IF coalesce(length(btrim(x ->> 'basis')), 0) NOT BETWEEN 4 AND 1000 THEN RAISE EXCEPTION 'version fields rejected (expected_effects[%].basis): states the basis of the expectation (4 to 1000 characters)', i USING ERRCODE = '22023'; END IF;
    v_e := v_e || jsonb_build_array(jsonb_build_object('effect', btrim(x ->> 'effect'), 'measure', btrim(x ->> 'measure'), 'direction', x ->> 'direction', 'horizon', x ->> 'horizon', 'basis', btrim(x ->> 'basis')));
    i := i + 1;
  END LOOP;
  RETURN jsonb_build_object('missing_information', v_m, 'expected_effects', v_e);
END $$;
GRANT EXECUTE ON FUNCTION decision.validate_version_fields(jsonb, jsonb) TO eye_app, eye_commit;

/* The fields are set on a DRAFT by the version's author or the package owner, under the terms' own bound action; validated before they are
   stored (a malformed field is never written). */
CREATE OR REPLACE FUNCTION decision.set_version_fields(
  p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_missing jsonb, p_effects jsonb, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p record; v record; v_ok jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.package.terms']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'version fields rejected (actor): set by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'version fields rejected (unknown_package): no such package in this domain' USING ERRCODE = '23503'; END IF;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'version fields rejected (unknown_version): no such version % of package %', p_version, p_package_id USING ERRCODE = '23503'; END IF;
  IF p_actor NOT IN (v.author_principal_id, p.owner_principal_id) THEN RAISE EXCEPTION 'version fields rejected (ownership): the version''s author or the package owner sets its fields' USING ERRCODE = '42501'; END IF;
  IF v.state <> 'draft' THEN RAISE EXCEPTION 'version fields rejected (state): version % is %; the fields of a proposed version are immutable — a change is a new version', p_version, v.state USING ERRCODE = '22023'; END IF;
  v_ok := decision.validate_version_fields(coalesce(p_missing, '[]'::jsonb), coalesce(p_effects, '[]'::jsonb));
  UPDATE decision.package_versions SET missing_information = v_ok -> 'missing_information', expected_effects = v_ok -> 'expected_effects' WHERE package_id = p_package_id AND version = p_version;
  RETURN jsonb_build_object('package_id', p_package_id, 'version', p_version) || v_ok;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.set_version_fields(uuid, uuid, uuid, int, jsonb, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.set_version_fields(uuid, uuid, uuid, int, jsonb, jsonb, uuid, uuid) TO eye_commit;

/* At the PROPOSAL (the propose route calls this before decision.propose_version, under the same bound action): the stored fields are
   validated again and the validation recorded — version.fields_validated with the counts and a digest of the two lists. */
CREATE OR REPLACE FUNCTION decision.validate_version_fields_at_propose(
  p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v record; v_ok jsonb; v_digest text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.package.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'version fields rejected (unknown_version): no such version % of package % in this domain', p_version, p_package_id USING ERRCODE = '23503'; END IF;
  v_ok := decision.validate_version_fields(v.missing_information, v.expected_effects);
  v_digest := encode(sha256(convert_to(v_ok::text, 'UTF8')), 'hex');
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'version.fields_validated', p_actor,
          jsonb_build_object('version', p_version, 'missing_information', jsonb_array_length(v_ok -> 'missing_information'), 'expected_effects', jsonb_array_length(v_ok -> 'expected_effects'), 'fields_digest', v_digest), p_correlation);
  RETURN jsonb_build_object('version', p_version, 'fields_digest', v_digest, 'missing_information', jsonb_array_length(v_ok -> 'missing_information'), 'expected_effects', jsonb_array_length(v_ok -> 'expected_effects'));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.validate_version_fields_at_propose(uuid, uuid, uuid, int, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.validate_version_fields_at_propose(uuid, uuid, uuid, int, uuid, uuid, uuid) TO eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §G1 THE LEDGERS
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- A RECUSAL: the approver's own withdrawal from a version — the reason, the approval it voided, the quorum before and after.
CREATE TABLE decision.recusals (
  recusal_id            uuid PRIMARY KEY,
  scope                 text NOT NULL,
  tenant_id             uuid NOT NULL,
  domain_id             uuid NOT NULL,
  package_id            uuid NOT NULL,
  version               int  NOT NULL,
  approver_principal_id uuid NOT NULL,
  reason                text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  voided_approval_id    uuid,
  quorum                int  NOT NULL,
  live_before           int  NOT NULL,
  live_after            int  NOT NULL,
  state_before          text NOT NULL,
  state_after           text NOT NULL,
  recused_at            timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id        uuid NOT NULL,
  CONSTRAINT drc_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT drc_version FOREIGN KEY (package_id, version) REFERENCES decision.package_versions (package_id, version),
  CONSTRAINT drc_once UNIQUE (package_id, version, approver_principal_id)
);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON decision.recusals FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- A CHALLENGE is a transition with a resolution: raised by a room member or the tenant's auditor, before or after the commitment; the
-- version's gate reads `challenged` while it is open; resolved ONCE by the package owner (upheld | dismissed) — the only change the row admits.
CREATE TABLE decision.challenges (
  challenge_id             uuid PRIMARY KEY,
  scope                    text NOT NULL,
  tenant_id                uuid NOT NULL,
  domain_id                uuid NOT NULL,
  package_id               uuid NOT NULL,
  version                  int  NOT NULL,
  challenger_principal_id  uuid NOT NULL,
  standing                 text NOT NULL CHECK (standing IN ('member', 'auditor')),
  reason                   text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 4000),
  after_commitment         boolean NOT NULL,
  version_state_at_raise   text NOT NULL,
  package_state_at_raise   text NOT NULL,
  raised_at                timestamptz NOT NULL DEFAULT clock_timestamp(),
  resolution               text CHECK (resolution IS NULL OR resolution IN ('upheld', 'dismissed')),
  resolved_by              uuid,
  resolved_at              timestamptz,
  resolution_note          text,
  effect                   jsonb,
  correlation_id           uuid NOT NULL,
  CONSTRAINT dch_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dch_version FOREIGN KEY (package_id, version) REFERENCES decision.package_versions (package_id, version),
  CONSTRAINT dch_resolved_once CHECK ((resolved_at IS NULL) = (resolved_by IS NULL) AND (resolved_at IS NULL) = (resolution IS NULL) AND (resolved_at IS NULL) = (resolution_note IS NULL) AND (resolved_at IS NULL) = (effect IS NULL))
);
CREATE UNIQUE INDEX dch_one_open ON decision.challenges (package_id, version) WHERE resolved_at IS NULL;
CREATE INDEX dch_version_idx ON decision.challenges (package_id, version, raised_at);
CREATE OR REPLACE FUNCTION decision.challenges_resolve_only() RETURNS trigger
SET search_path = decision, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'challenges are append-only: DELETE prohibited' USING ERRCODE = '2F002'; END IF;
  IF OLD.resolved_at IS NOT NULL THEN RAISE EXCEPTION 'challenge % is resolved and immutable', OLD.challenge_id USING ERRCODE = '2F002'; END IF;
  IF NEW.resolved_at IS NULL OR (to_jsonb(NEW) - 'resolution' - 'resolved_by' - 'resolved_at' - 'resolution_note' - 'effect') <> (to_jsonb(OLD) - 'resolution' - 'resolved_by' - 'resolved_at' - 'resolution_note' - 'effect') THEN
    RAISE EXCEPTION 'challenge % changes only by its resolution, once', OLD.challenge_id USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER dch_resolve_only BEFORE UPDATE OR DELETE ON decision.challenges FOR EACH ROW EXECUTE FUNCTION decision.challenges_resolve_only();

-- A PDP DENIAL as a versioned object: who tried what on which target, the policy decision that refused it (policy.decisions), the reason
-- and the bundle, and the package version at the time when the target names a package — linked to the replay by package and version.
CREATE TABLE decision.pdp_denials (
  denial_id           uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  principal_id        uuid NOT NULL,
  action              text NOT NULL CHECK (action LIKE 'decision.%'),
  object_type         text,
  object_id           uuid,
  package_id          uuid,
  package_version     int,
  policy_decision_id  uuid NOT NULL,
  decision            text NOT NULL CHECK (decision IN ('deny', 'indeterminate')),
  reason              text NOT NULL,
  rule                text NOT NULL,
  denied_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT dpd_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX dpd_package_idx ON decision.pdp_denials (package_id, package_version, denied_at);
CREATE INDEX dpd_principal_idx ON decision.pdp_denials (tenant_id, domain_id, principal_id, denied_at);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON decision.pdp_denials FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- A DISTRIBUTION of the decision record after commitment: one row per recipient on one channel of one distribution act; the record and its
-- digest repeated on every row (what was delivered is what is read back). in_app is placed at once (the record stands on the recipient's
-- decisions surface); email / sms / teams are SYNTHETIC (the B34 local sinks, 0090 §0.5): queued by the port, delivered or failed by the
-- adapter in the same write. A queued row moves ONCE to delivered | failed; nothing else of the row changes.
CREATE TABLE decision.distributions (
  delivery_id            uuid PRIMARY KEY,
  distribution_id        uuid NOT NULL,
  scope                  text NOT NULL,
  tenant_id              uuid NOT NULL,
  domain_id              uuid NOT NULL,
  package_id             uuid NOT NULL,
  version                int  NOT NULL,
  commitment_id          uuid NOT NULL,
  record                 jsonb NOT NULL CHECK (jsonb_typeof(record) = 'object'),
  record_digest          text NOT NULL CHECK (record_digest ~ '^[0-9a-f]{64}$'),
  recipient_principal_id uuid NOT NULL,
  recipient_basis        text NOT NULL CHECK (recipient_basis IN ('room_owner', 'room_member', 'named')),
  channel                text NOT NULL CHECK (channel IN ('in_app', 'email', 'sms', 'teams')),
  state                  text NOT NULL CHECK (state IN ('queued', 'delivered', 'failed')),
  receipt                jsonb,
  provider_ref           text,
  error                  text,
  synthetic_state        boolean NOT NULL,
  distributed_by         uuid NOT NULL,
  distributed_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  attempted_at           timestamptz,
  correlation_id         uuid NOT NULL,
  CONSTRAINT ddi_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT ddi_version FOREIGN KEY (package_id, version) REFERENCES decision.package_versions (package_id, version),
  CONSTRAINT ddi_once UNIQUE (distribution_id, recipient_principal_id, channel),
  CONSTRAINT ddi_synthetic CHECK (synthetic_state = (channel <> 'in_app')),
  CONSTRAINT ddi_placed CHECK (state <> 'delivered' OR jsonb_typeof(receipt) = 'object'),
  CONSTRAINT ddi_failed CHECK (state <> 'failed' OR error IS NOT NULL),
  CONSTRAINT ddi_attempted CHECK ((state = 'queued') = (attempted_at IS NULL))
);
CREATE INDEX ddi_version_idx ON decision.distributions (package_id, version, distributed_at);
CREATE INDEX ddi_recipient_idx ON decision.distributions (tenant_id, domain_id, recipient_principal_id, distributed_at);
CREATE OR REPLACE FUNCTION decision.distributions_transition() RETURNS trigger
SET search_path = decision, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'distributions are append-only: DELETE prohibited' USING ERRCODE = '2F002'; END IF;
  IF OLD.state <> 'queued' THEN RAISE EXCEPTION 'distribution row % is % and immutable', OLD.delivery_id, OLD.state USING ERRCODE = '2F002'; END IF;
  IF NEW.state NOT IN ('delivered', 'failed') OR (to_jsonb(NEW) - 'state' - 'receipt' - 'provider_ref' - 'error' - 'attempted_at') <> (to_jsonb(OLD) - 'state' - 'receipt' - 'provider_ref' - 'error' - 'attempted_at') THEN
    RAISE EXCEPTION 'distribution row % changes only by its attempt, once (queued → delivered | failed)', OLD.delivery_id USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER ddi_transition BEFORE UPDATE OR DELETE ON decision.distributions FOR EACH ROW EXECUTE FUNCTION decision.distributions_transition();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['recusals', 'challenges', 'pdp_denials', 'distributions'] LOOP
    EXECUTE format('REVOKE ALL ON decision.%I FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE decision.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE decision.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY decision_isolation ON decision.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON decision.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §G2 THE SIGNATURE beyond the audit chain (k1)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
/* WHAT WOULD BE SIGNED NOW (an invoker read under the caller's RLS): for kind `approval`, the approval row's header digest (the APR
   canonical header, the approver's own record) — subject {approval_id, 1}; for kind `decision`, the committed version's header digest
   (the DPK canonical header of the version the commitment was made on) — subject {package_id, version}. NULL when the subject is not
   visible, or not in the state that is signed (an approval must stand; a decision must be committed). */
CREATE OR REPLACE FUNCTION decision.signature_subject(p_kind text, p_package_id uuid, p_version int, p_approval_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = decision, executive, pg_catalog, pg_temp AS $$
  SELECT CASE
    WHEN p_kind = 'approval' THEN (
      SELECT jsonb_build_object('kind', 'approval', 'subject_id', a.approval_id, 'subject_version', 1, 'digest', a.header_digest, 'signer_expected', a.approver_principal_id,
                                'standing', a.revoked_at IS NULL AND a.decision = 'approve', 'signatures', executive.signature_of('approval', a.approval_id, 1))
        FROM decision.approvals a WHERE a.approval_id = p_approval_id AND a.package_id = p_package_id AND a.version = p_version)
    WHEN p_kind = 'decision' THEN (
      SELECT jsonb_build_object('kind', 'decision', 'subject_id', v.package_id, 'subject_version', v.version, 'digest', v.header_digest,
                                'committed', v.state = 'committed' AND c.commitment_id IS NOT NULL, 'committed_by', c.committed_by, 'signatures', executive.signature_of('decision', v.package_id, v.version))
        FROM decision.package_versions v LEFT JOIN decision.commitments c ON c.package_id = v.package_id AND c.version = v.version
       WHERE v.package_id = p_package_id AND v.version = p_version)
    ELSE NULL END
$$;
GRANT EXECUTE ON FUNCTION decision.signature_subject(text, uuid, int, uuid) TO eye_app, eye_commit;

/* THE APPROVAL SIGNED by its approver: the Ed25519 row (executive.signatures, written by SignatureService through executive.record_signature
   under THIS bound action, decision.sign.approval, in the same transaction) is bound here to the approval as it stands — its digest must be
   the approval's header digest now (a stale one is refused: the row rolls back with the refusal), the signer the approval's approver, the
   approval standing. Recorded as gate.signed. */
CREATE OR REPLACE FUNCTION decision.sign_approval(
  p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_approval_id uuid, p_signature_id uuid, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a record; s record;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.sign.approval']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'signature rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO a FROM decision.approvals x WHERE x.approval_id = p_approval_id AND x.package_id = p_package_id AND x.version = p_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'signature rejected (unknown_approval): no such approval % on version % of package % in this domain', p_approval_id, p_version, p_package_id USING ERRCODE = '23503'; END IF;
  IF a.approver_principal_id <> p_actor THEN RAISE EXCEPTION 'signature rejected (actor): an approval is signed by its approver, never by another' USING ERRCODE = '42501'; END IF;
  IF a.decision <> 'approve' OR a.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'signature rejected (state): approval % is % — only a standing approval is signed', p_approval_id, CASE WHEN a.revoked_at IS NOT NULL THEN 'revoked' ELSE a.decision END USING ERRCODE = '22023'; END IF;
  IF a.header_digest IS NULL THEN RAISE EXCEPTION 'signature rejected (state): approval % carries no header digest to sign', p_approval_id USING ERRCODE = '22023'; END IF;
  SELECT * INTO s FROM executive.signatures x WHERE x.signature_id = p_signature_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'signature rejected (unknown_signature): no signature % was recorded in this transaction', p_signature_id USING ERRCODE = '23503'; END IF;
  IF s.subject_kind <> 'approval' OR s.subject_id <> p_approval_id OR s.subject_version <> 1 OR s.signer <> p_actor OR s.bound_action <> 'decision.sign.approval' THEN
    RAISE EXCEPTION 'signature rejected (state): signature % is not this approver''s signature over approval %', p_signature_id, p_approval_id USING ERRCODE = '22023';
  END IF;
  IF s.subject_digest IS DISTINCT FROM a.header_digest THEN
    RAISE EXCEPTION 'signature rejected (stale_digest): the digest signed (%) is not the approval''s digest now (%); read it again and sign what stands', s.subject_digest, a.header_digest USING ERRCODE = '22023';
  END IF;
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'gate.signed', p_actor,
          jsonb_build_object('version', p_version, 'kind', 'approval', 'approval_id', p_approval_id, 'signature_id', p_signature_id, 'key_id', s.key_id, 'subject_digest', s.subject_digest, 'signed_at', s.signed_at), p_correlation);
  RETURN jsonb_build_object('kind', 'approval', 'package_id', p_package_id, 'version', p_version, 'approval_id', p_approval_id, 'signature_id', p_signature_id, 'key_id', s.key_id, 'signer', p_actor, 'subject_digest', s.subject_digest, 'signed_at', s.signed_at);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.sign_approval(uuid, uuid, uuid, int, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.sign_approval(uuid, uuid, uuid, int, uuid, uuid, uuid, uuid, uuid) TO eye_commit;

/* THE DECISION SIGNED after its commitment, by the package owner or the committing authority (JRN-17 sign): the row (under
   decision.sign.decision) bound to the committed version's header digest as it stands. Recorded as gate.signed. */
CREATE OR REPLACE FUNCTION decision.sign_decision(
  p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_signature_id uuid, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p record; v record; c record; s record;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.sign.decision']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'signature rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'signature rejected (actor): only a named, active member signs a decision' USING ERRCODE = '42501'; END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'signature rejected (unknown_package): no such package in this domain' USING ERRCODE = '23503'; END IF;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'signature rejected (unknown_version): no such version % of package %', p_version, p_package_id USING ERRCODE = '23503'; END IF;
  SELECT * INTO c FROM decision.commitments x WHERE x.package_id = p_package_id AND x.version = p_version;
  IF v.state <> 'committed' OR NOT FOUND THEN RAISE EXCEPTION 'signature rejected (state): version % is %, not committed; a decision is signed after its commitment', p_version, v.state USING ERRCODE = '22023'; END IF;
  IF p_actor <> p.owner_principal_id AND p_actor <> c.committed_by THEN
    RAISE EXCEPTION 'signature rejected (actor): a decision is signed by the package owner or the authority who committed it' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO s FROM executive.signatures x WHERE x.signature_id = p_signature_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'signature rejected (unknown_signature): no signature % was recorded in this transaction', p_signature_id USING ERRCODE = '23503'; END IF;
  IF s.subject_kind <> 'decision' OR s.subject_id <> p_package_id OR s.subject_version <> p_version OR s.signer <> p_actor OR s.bound_action <> 'decision.sign.decision' THEN
    RAISE EXCEPTION 'signature rejected (state): signature % is not this principal''s signature over version % of package %', p_signature_id, p_version, p_package_id USING ERRCODE = '22023';
  END IF;
  IF s.subject_digest IS DISTINCT FROM v.header_digest THEN
    RAISE EXCEPTION 'signature rejected (stale_digest): the digest signed (%) is not the committed version''s digest (%); read it again and sign what stands', s.subject_digest, v.header_digest USING ERRCODE = '22023';
  END IF;
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'gate.signed', p_actor,
          jsonb_build_object('version', p_version, 'kind', 'decision', 'commitment_id', c.commitment_id, 'signature_id', p_signature_id, 'key_id', s.key_id, 'subject_digest', s.subject_digest, 'signed_at', s.signed_at), p_correlation);
  RETURN jsonb_build_object('kind', 'decision', 'package_id', p_package_id, 'version', p_version, 'commitment_id', c.commitment_id, 'signature_id', p_signature_id, 'key_id', s.key_id, 'signer', p_actor, 'subject_digest', s.subject_digest, 'signed_at', s.signed_at);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.sign_decision(uuid, uuid, uuid, int, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.sign_decision(uuid, uuid, uuid, int, uuid, uuid, uuid, uuid) TO eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §G3 RECUSAL (l1)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
/* The approver's OWN act on an open version: the recusal recorded, the approver's standing approval VOIDED (a revocation on the approval
   row — the one change it admits — with the reason `recused: …`), the quorum re-evaluated: an approved version that loses its quorum
   returns to under_review (the gate state reads review_requested). A recused approver never approves the version again (the trigger below). */
CREATE OR REPLACE FUNCTION decision.recuse_approver(
  p_recusal_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p record; v record; a record; v_quorum int; v_before int; v_after int; v_to text; v_voided uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.recuse']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'recusal rejected (actor): a recusal is the approver''s own act, never on behalf of another' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'recusal rejected (actor): only a named, active member recuses' USING ERRCODE = '42501'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(p_reason) > 2000 THEN RAISE EXCEPTION 'recusal rejected (reason): a recusal states its reason (8 to 2000 characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'recusal rejected (unknown_package): no such package in this domain' USING ERRCODE = '23503'; END IF;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'recusal rejected (unknown_version): no such version % of package %', p_version, p_package_id USING ERRCODE = '23503'; END IF;
  IF v.state NOT IN ('proposed', 'under_review', 'approved', 'deferred', 'information_requested') OR p.state IN ('withdrawn', 'closed') THEN
    RAISE EXCEPTION 'recusal rejected (state): version % is % (the package is %); an approver recuses from a version at the gate, not yet committed', p_version, v.state, p.state USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM decision.recusals r WHERE r.package_id = p_package_id AND r.version = p_version AND r.approver_principal_id = p_actor) THEN
    RAISE EXCEPTION 'recusal rejected (state): principal % is already recused from version %', p_actor, p_version USING ERRCODE = '22023';
  END IF;
  IF decision.approver_eligibility(p_actor, p_tenant, p_domain, v.approver_policy) IS NULL
     AND NOT EXISTS (SELECT 1 FROM decision.approvals a2 WHERE a2.package_id = p_package_id AND a2.version = p_version AND a2.approver_principal_id = p_actor) THEN
    RAISE EXCEPTION 'recusal rejected (authority): principal % is neither an approver the policy admits nor one with a record on version %', p_actor, p_version USING ERRCODE = '42501';
  END IF;
  v_quorum := (v.approver_policy ->> 'quorum')::int;
  SELECT count(*) INTO v_before FROM decision.live_approvals(p_package_id, p_version);
  FOR a IN SELECT * FROM decision.approvals x WHERE x.package_id = p_package_id AND x.version = p_version AND x.approver_principal_id = p_actor AND x.revoked_at IS NULL ORDER BY x.recorded_at LOOP
    UPDATE decision.approvals SET revoked_at = clock_timestamp(), revoked_reason = 'recused: ' || btrim(p_reason) WHERE approval_id = a.approval_id;
    v_voided := a.approval_id;
    INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_package_id, 'approval.revoked', p_actor,
            jsonb_build_object('version', p_version, 'approval_id', a.approval_id, 'reason', 'recused: ' || btrim(p_reason), 'recusal_id', p_recusal_id, 'after_commitment', false), p_correlation);
  END LOOP;
  SELECT count(*) INTO v_after FROM decision.live_approvals(p_package_id, p_version);
  v_to := v.state;
  IF v.state = 'approved' AND v_after < v_quorum THEN
    v_to := 'under_review';
    UPDATE decision.package_versions SET state = v_to WHERE package_id = p_package_id AND version = p_version;
    IF p.current_version = p_version THEN UPDATE decision.packages_current SET state = v_to WHERE package_id = p_package_id; END IF;
  END IF;
  INSERT INTO decision.recusals (recusal_id, scope, tenant_id, domain_id, package_id, version, approver_principal_id, reason, voided_approval_id, quorum, live_before, live_after, state_before, state_after, correlation_id)
  VALUES (p_recusal_id, 'DOMAIN', p_tenant, p_domain, p_package_id, p_version, p_actor, btrim(p_reason), v_voided, v_quorum, v_before, v_after, v.state, v_to, p_correlation);
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'gate.recused', p_actor,
          jsonb_strip_nulls(jsonb_build_object('version', p_version, 'recusal_id', p_recusal_id, 'reason', btrim(p_reason), 'voided_approval_id', v_voided, 'quorum', v_quorum, 'live_before', v_before, 'live_after', v_after,
                             'from_state', v.state, 'to_state', v_to, 'quorum_lost', v.state = 'approved' AND v_to <> 'approved')), p_correlation);
  RETURN jsonb_strip_nulls(jsonb_build_object('recusal_id', p_recusal_id, 'package_id', p_package_id, 'version', p_version, 'voided_approval_id', v_voided, 'quorum', v_quorum, 'live_before', v_before, 'live_after', v_after,
                            'from_state', v.state, 'to_state', v_to, 'quorum_lost', v.state = 'approved' AND v_to <> 'approved'));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.recuse_approver(uuid, uuid, uuid, uuid, int, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.recuse_approver(uuid, uuid, uuid, uuid, int, text, uuid, uuid, uuid) TO eye_commit;

/* A recused approver's later approval on the version is refused at the row — whatever port inserts it (record_approval, re-declared in §G9
   for the board's actions, is not otherwise touched). */
CREATE OR REPLACE FUNCTION decision.approvals_refuse_recused() RETURNS trigger
SET search_path = decision, pg_catalog, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM decision.recusals r WHERE r.package_id = NEW.package_id AND r.version = NEW.version AND r.approver_principal_id = NEW.approver_principal_id) THEN
    RAISE EXCEPTION 'approval rejected (recused): principal % recused from version % of package %; a recused approver does not approve it', NEW.approver_principal_id, NEW.version, NEW.package_id USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER dap_refuse_recused BEFORE INSERT ON decision.approvals FOR EACH ROW EXECUTE FUNCTION decision.approvals_refuse_recused();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §G4 CHALLENGE as an explicit transition (l2)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
/* A room member of the package (executive.is_member: the room's owner or a live member) or the tenant's AUDITOR challenges a version,
   before or after its commitment, with a reason. One challenge is open at a time; while it is open the gate reads `challenged` and a
   commitment is HELD (decision.commitments_refuse_challenged). Recorded as gate.challenged. */
CREATE OR REPLACE FUNCTION decision.challenge_decision(
  p_challenge_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p record; v record; v_room uuid; v_standing text; v_open uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.challenge']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'decision challenge rejected (actor): a challenge is the acting principal''s own' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'decision challenge rejected (actor): only a named, active member challenges a decision' USING ERRCODE = '42501'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(p_reason) > 4000 THEN RAISE EXCEPTION 'decision challenge rejected (reason): a challenge states its reason (8 to 4000 characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'decision challenge rejected (unknown_package): no such package in this domain' USING ERRCODE = '23503'; END IF;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'decision challenge rejected (unknown_version): no such version % of package %', p_version, p_package_id USING ERRCODE = '23503'; END IF;
  SELECT r.room_id INTO v_room FROM executive.rooms_current r WHERE r.package_id = p_package_id;
  IF v_room IS NOT NULL AND executive.is_member(v_room, p_actor) THEN v_standing := 'member';
  ELSIF decision.holds_role(p_actor, p_tenant, p_domain, 'auditor') THEN v_standing := 'auditor';
  ELSE RAISE EXCEPTION 'decision challenge rejected (authority): principal % is neither a member of the package''s room nor the tenant''s auditor', p_actor USING ERRCODE = '42501';
  END IF;
  IF v.state IN ('draft', 'rejected', 'superseded') OR p.state IN ('withdrawn', 'closed') THEN
    RAISE EXCEPTION 'decision challenge rejected (state): version % is % (the package is %); a challenge is raised on a version at the gate or committed', p_version, v.state, p.state USING ERRCODE = '22023';
  END IF;
  SELECT c.challenge_id INTO v_open FROM decision.challenges c WHERE c.package_id = p_package_id AND c.version = p_version AND c.resolved_at IS NULL;
  IF v_open IS NOT NULL THEN RAISE EXCEPTION 'decision challenge rejected (state): challenge % is already open on version %; it is resolved before another is raised', v_open, p_version USING ERRCODE = '22023'; END IF;
  INSERT INTO decision.challenges (challenge_id, scope, tenant_id, domain_id, package_id, version, challenger_principal_id, standing, reason, after_commitment, version_state_at_raise, package_state_at_raise, correlation_id)
  VALUES (p_challenge_id, 'DOMAIN', p_tenant, p_domain, p_package_id, p_version, p_actor, v_standing, btrim(p_reason), v.state = 'committed', v.state, p.state, p_correlation);
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'gate.challenged', p_actor,
          jsonb_build_object('version', p_version, 'challenge_id', p_challenge_id, 'standing', v_standing, 'reason', btrim(p_reason), 'after_commitment', v.state = 'committed', 'version_state', v.state), p_correlation);
  RETURN jsonb_build_object('challenge_id', p_challenge_id, 'package_id', p_package_id, 'version', p_version, 'standing', v_standing, 'after_commitment', v.state = 'committed', 'gate_state', 'challenged');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.challenge_decision(uuid, uuid, uuid, uuid, int, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.challenge_decision(uuid, uuid, uuid, uuid, int, text, uuid, uuid, uuid) TO eye_commit;

/* The PACKAGE OWNER resolves a challenge — never its challenger. UPHELD before the commitment: the version leaves the gate through the
   withdrawal chain's own effects (0078 §…/0090 §G9 withdraw_package: the open versions superseded, their gate tasks cancelled, the package
   withdrawn, package.withdrawn recorded — the chain B18 declared, applied here under the resolution's own action). UPHELD after the
   commitment: the commitment STANDS (D5: a withdrawn package over a standing commitment would be a lie) and the effect recorded is
   `reopen_required` — the owner reopens the package on a recorded cause (decision.package.reopen, 0078). DISMISSED: the state returns. */
CREATE OR REPLACE FUNCTION decision.resolve_challenge(
  p_tenant uuid, p_domain uuid, p_challenge_id uuid, p_resolution text, p_note text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c record; p record; v record; v_effect jsonb; v_sup int; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.challenge.resolve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'challenge resolution rejected (actor): resolved by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_resolution IS NULL OR p_resolution NOT IN ('upheld', 'dismissed') THEN RAISE EXCEPTION 'challenge resolution rejected (resolution): a challenge is upheld or dismissed' USING ERRCODE = '22023'; END IF;
  IF p_note IS NULL OR length(btrim(p_note)) < 8 OR length(p_note) > 4000 THEN RAISE EXCEPTION 'challenge resolution rejected (note): the resolution says why (8 to 4000 characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO c FROM decision.challenges x WHERE x.challenge_id = p_challenge_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'challenge resolution rejected (unknown_challenge): no such challenge in this domain' USING ERRCODE = '23503'; END IF;
  IF c.resolved_at IS NOT NULL THEN RAISE EXCEPTION 'challenge resolution rejected (state): challenge % was % at %', p_challenge_id, c.resolution, c.resolved_at USING ERRCODE = '22023'; END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = c.package_id FOR UPDATE;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = c.package_id AND x.version = c.version FOR UPDATE;
  IF p.owner_principal_id <> p_actor THEN RAISE EXCEPTION 'challenge resolution rejected (ownership): the package owner resolves a challenge on it' USING ERRCODE = '42501'; END IF;
  IF c.challenger_principal_id = p_actor THEN RAISE EXCEPTION 'challenge resolution rejected (separation): the challenger never resolves their own challenge' USING ERRCODE = '42501'; END IF;
  IF p_resolution = 'dismissed' THEN
    v_effect := jsonb_build_object('kind', 'none', 'version_state', v.state, 'package_state', p.state);
  ELSIF v.state = 'committed' OR p.committed_version IS NOT NULL THEN
    v_effect := jsonb_build_object('kind', 'reopen_required', 'version_state', v.state, 'package_state', p.state, 'committed_version', p.committed_version,
                                   'note', 'the commitment stands; the owner reopens the package on a recorded cause (decision.package.reopen)');
  ELSE
    /* the withdrawal chain's effects on an uncommitted package (0090 §G9 withdraw_package, under this action) */
    FOR v_sup IN UPDATE decision.package_versions SET state = 'superseded'
     WHERE package_id = c.package_id AND state IN ('proposed', 'under_review', 'approved', 'deferred', 'information_requested') RETURNING version LOOP
      PERFORM executive._cancel_human_tasks(p_tenant, p_domain, decision.gate_subject(c.package_id, v_sup), ARRAY['gate.approve', 'gate.review', 'gate.ready_review', 'gate.delegated_approval'],
                                            format('challenge %s upheld: version %s withdrawn', p_challenge_id, v_sup), p_actor, p_correlation);
    END LOOP;
    PERFORM executive._cancel_human_tasks(p_tenant, p_domain, jsonb_build_object('id', c.package_id), ARRAY['gate.approve', 'gate.review', 'gate.ready_review', 'gate.delegated_approval'],
                                          format('the package was withdrawn: challenge %s upheld', p_challenge_id), p_actor, p_correlation);
    UPDATE decision.packages_current SET state = 'withdrawn' WHERE package_id = c.package_id;
    INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, c.package_id, 'package.withdrawn', p_actor, jsonb_build_object('reason', 'challenge upheld: ' || btrim(p_note), 'challenge_id', p_challenge_id), p_correlation);
    v_effect := jsonb_build_object('kind', 'withdrawn', 'version_state', 'superseded', 'package_state', 'withdrawn');
  END IF;
  UPDATE decision.challenges SET resolution = p_resolution, resolved_by = p_actor, resolved_at = v_at, resolution_note = btrim(p_note), effect = v_effect WHERE challenge_id = p_challenge_id;
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, c.package_id, 'gate.challenge_resolved', p_actor,
          jsonb_build_object('version', c.version, 'challenge_id', p_challenge_id, 'resolution', p_resolution, 'note', btrim(p_note), 'effect', v_effect, 'challenger', c.challenger_principal_id), p_correlation);
  RETURN jsonb_build_object('challenge_id', p_challenge_id, 'package_id', c.package_id, 'version', c.version, 'resolution', p_resolution, 'resolved_at', v_at, 'effect', v_effect);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.resolve_challenge(uuid, uuid, uuid, text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.resolve_challenge(uuid, uuid, uuid, text, text, uuid, uuid, uuid) TO eye_commit;

/* THE HOLD: a commitment on a version with an open challenge is refused at the row, whatever port writes it (commit_package is not touched). */
CREATE OR REPLACE FUNCTION decision.commitments_refuse_challenged() RETURNS trigger
SET search_path = decision, pg_catalog, pg_temp AS $$
DECLARE v_open uuid;
BEGIN
  SELECT c.challenge_id INTO v_open FROM decision.challenges c WHERE c.package_id = NEW.package_id AND c.version = NEW.version AND c.resolved_at IS NULL;
  IF v_open IS NOT NULL THEN
    RAISE EXCEPTION 'commitment rejected (challenged): challenge % is open on version % of package %; the commitment is held until the owner resolves it', v_open, NEW.version, NEW.package_id USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER dcm_refuse_challenged BEFORE INSERT ON decision.commitments FOR EACH ROW EXECUTE FUNCTION decision.commitments_refuse_challenged();

/* The open challenge of a version (an invoker read; NULL when none). */
CREATE OR REPLACE FUNCTION decision.open_challenge_of(p_package_id uuid, p_version int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = decision, pg_catalog, pg_temp AS $$
  SELECT to_jsonb(c) - 'scope' - 'tenant_id' - 'domain_id' FROM decision.challenges c WHERE c.package_id = p_package_id AND c.version = p_version AND c.resolved_at IS NULL LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION decision.open_challenge_of(uuid, int) TO eye_app, eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §G5 THE PDP DENIAL as a versioned object linked to the replay (l5)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
/* Called by the pipeline's DENIAL path (apps/api/src/pipeline/pipeline.service.ts recordDenial) for a denied or indeterminate decision.*
   action, under the EVIDENCE context ctx.issue_evidence minted for that very request: the context's mode is `evidence`, its bound action
   the denied action, its subject the denied principal — the port reads all three from the context, never from the caller's word. The
   policy decision named is the one policy.commit_decision wrote in the same transaction. When the target names a package (DPK; an APR or
   a CMT resolves to its package where the row exists), the package's current version at the time is kept and gate.denied is recorded on it. */
CREATE OR REPLACE FUNCTION decision.record_pdp_denial(
  p_denial_id uuid, p_action text, p_object_type text, p_object_id uuid, p_policy_decision_id uuid, p_decision text, p_reason text, p_bundle text, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_tenant uuid := public.eye_tenant(); v_domain uuid := public.eye_domain(); v_principal uuid := public.eye_principal(); v_pkg uuid; v_ver int;
BEGIN
  IF public.eye_ctx_mode() IS DISTINCT FROM 'evidence' THEN RAISE EXCEPTION 'pdp denial rejected (context): a denial is recorded under the evidence context of the refused request (mode %)', coalesce(public.eye_ctx_mode(), '<none>') USING ERRCODE = '42501'; END IF;
  IF public.eye_bound_action() IS DISTINCT FROM p_action THEN RAISE EXCEPTION 'pdp denial rejected (context): the evidence context is bound to %, not %', coalesce(public.eye_bound_action(), '<none>'), p_action USING ERRCODE = '42501'; END IF;
  IF v_principal IS NULL OR v_tenant IS NULL OR v_domain IS NULL THEN RAISE EXCEPTION 'pdp denial rejected (context): the evidence context names no principal, tenant and domain' USING ERRCODE = '42501'; END IF;
  IF p_action IS NULL OR p_action NOT LIKE 'decision.%' THEN RAISE EXCEPTION 'pdp denial rejected (action): % is not a decision.* action', coalesce(p_action, '<none>') USING ERRCODE = '22023'; END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('deny', 'indeterminate') THEN RAISE EXCEPTION 'pdp denial rejected (decision): a denial is deny or indeterminate' USING ERRCODE = '22023'; END IF;
  IF p_object_type = 'DPK' AND p_object_id IS NOT NULL THEN
    SELECT x.package_id, x.current_version INTO v_pkg, v_ver FROM decision.packages_current x WHERE x.package_id = p_object_id AND x.tenant_id = v_tenant AND x.domain_id = v_domain;
  ELSIF p_object_type = 'APR' AND p_object_id IS NOT NULL THEN
    SELECT a.package_id, a.version INTO v_pkg, v_ver FROM decision.approvals a WHERE a.approval_id = p_object_id AND a.tenant_id = v_tenant AND a.domain_id = v_domain;
  ELSIF p_object_type = 'CMT' AND p_object_id IS NOT NULL THEN
    SELECT c.package_id, c.version INTO v_pkg, v_ver FROM decision.commitments c WHERE c.commitment_id = p_object_id AND c.tenant_id = v_tenant AND c.domain_id = v_domain;
  END IF;
  INSERT INTO decision.pdp_denials (denial_id, scope, tenant_id, domain_id, principal_id, action, object_type, object_id, package_id, package_version, policy_decision_id, decision, reason, rule, correlation_id)
  VALUES (p_denial_id, 'DOMAIN', v_tenant, v_domain, v_principal, p_action, p_object_type, p_object_id, v_pkg, v_ver, p_policy_decision_id, p_decision, left(coalesce(p_reason, ''), 2000), coalesce(p_bundle, ''), p_correlation);
  IF v_pkg IS NOT NULL THEN
    INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', v_tenant, v_domain, v_pkg, 'gate.denied', v_principal,
            jsonb_strip_nulls(jsonb_build_object('version', v_ver, 'denial_id', p_denial_id, 'action', p_action, 'object_type', p_object_type, 'object_id', p_object_id, 'policy_decision_id', p_policy_decision_id, 'decision', p_decision, 'reason', left(coalesce(p_reason, ''), 400))), p_correlation);
  END IF;
  RETURN jsonb_strip_nulls(jsonb_build_object('denial_id', p_denial_id, 'principal', v_principal, 'action', p_action, 'package_id', v_pkg, 'package_version', v_ver, 'policy_decision_id', p_policy_decision_id));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.record_pdp_denial(uuid, text, text, uuid, uuid, text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.record_pdp_denial(uuid, text, text, uuid, uuid, text, text, text, uuid) TO eye_commit;

/* The denials of a package's versions (an invoker read; the replay lists them beside its content; the panel shows "denied: <who> tried <what> — <rule>"). */
CREATE OR REPLACE FUNCTION decision.pdp_denials_of(p_package_id uuid, p_version int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = decision, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(d) - 'scope' - 'tenant_id' - 'domain_id' ORDER BY d.denied_at, d.denial_id), '[]'::jsonb)
    FROM decision.pdp_denials d WHERE d.package_id = p_package_id AND (p_version IS NULL OR d.package_version = p_version)
$$;
GRANT EXECUTE ON FUNCTION decision.pdp_denials_of(uuid, int) TO eye_app, eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §G6 THE DISTRIBUTION of the decision after commitment (k2; JRN-17 distribute)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
/* The DECISION RECORD: the committed version (its digests, the choice), the commitment, the signatures on the approvals and on the
   decision, the approval conditions in force in monitoring and the controls in force at the decision instant — digested. */
CREATE OR REPLACE FUNCTION decision.decision_record(p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = decision, executive, pg_catalog, pg_temp AS $$
DECLARE p record; v record; c record; v_rec jsonb;
BEGIN
  IF p_tenant IS DISTINCT FROM public.eye_tenant() OR NOT (public.eye_scope() = 'TENANT' OR p_domain = public.eye_domain()) THEN
    RAISE EXCEPTION 'decision record rejected: outside the caller''s scope' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p_version;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO c FROM decision.commitments x WHERE x.package_id = p_package_id AND x.version = p_version;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_rec := jsonb_build_object(
    'package_id', p_package_id, 'version', p_version, 'title', p.title, 'statement', p.statement, 'decision_object_id', p.decision_object_id, 'decision_class', p.decision_class, 'owner', p.owner_principal_id,
    'version_digest', v.version_digest, 'header_digest', v.header_digest, 'choice', v.choice, 'objectives', v.objectives, 'reversibility', v.reversibility,
    'missing_information', v.missing_information, 'expected_effects', v.expected_effects, 'synthetic_state', v.synthetic_state,
    'commitment', jsonb_build_object('commitment_id', c.commitment_id, 'committed_by', c.committed_by, 'committed_at', c.committed_at, 'op_class', c.op_class, 'bound_action', c.bound_action, 'policy_decision_id', c.policy_decision_id, 'approvals', c.approvals),
    'signatures', jsonb_build_object(
      'approvals', (SELECT coalesce(jsonb_agg(jsonb_build_object('approval_id', x ->> 'approval_id', 'approver', x ->> 'approver', 'signatures', executive.signature_of('approval', (x ->> 'approval_id')::uuid, 1))), '[]'::jsonb) FROM jsonb_array_elements(c.approvals) x),
      'decision', executive.signature_of('decision', p_package_id, p_version)),
    'conditions_in_force', decision.approval_conditions_status(p_tenant, p_domain, p_package_id, p_version, 'monitor') - 'evaluated_at',
    'controls_in_force', decision.control_decisions_as_of(p_tenant, p_domain, c.committed_at));
  RETURN jsonb_build_object('record', v_rec, 'digest', encode(sha256(convert_to(v_rec::text, 'UTF8')), 'hex'));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.decision_record(uuid, uuid, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.decision_record(uuid, uuid, uuid, int) TO eye_app, eye_commit;

/* DISTRIBUTE: by the package owner or the authority who committed it, after the commitment. The recipients are the package's room (its
   owner and live members) and the named ones; every recipient is a named, active MEMBER (decision.is_active_human — an external
   collaborator is never one, named or not). in_app is always a channel: placed at once (the record stands on the recipient's decisions
   surface — decision.distributions_of). email / sms / teams are SYNTHETIC — queued here, carried by the B34 adapters to the LOCAL sinks
   in the same write (DistributionService), their receipts recorded by decision._record_distribution_receipt. Recorded as decision.distributed. */
CREATE OR REPLACE FUNCTION decision.distribute_decision(
  p_distribution_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_channels text[], p_recipients uuid[], p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p record; v record; c record; v_rec jsonb; v_room uuid; v_ch text; v_channels text[]; r record; v_rows jsonb := '[]'::jsonb; v_id uuid; v_n int := 0; v_rcpt uuid;
        v_recipients jsonb := '[]'::jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.distribute']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'distribution rejected (actor): distributed by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'distribution rejected (actor): only a named, active member distributes a decision' USING ERRCODE = '42501'; END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'distribution rejected (unknown_package): no such package in this domain' USING ERRCODE = '23503'; END IF;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'distribution rejected (unknown_version): no such version % of package %', p_version, p_package_id USING ERRCODE = '23503'; END IF;
  SELECT * INTO c FROM decision.commitments x WHERE x.package_id = p_package_id AND x.version = p_version;
  IF v.state <> 'committed' OR NOT FOUND THEN RAISE EXCEPTION 'distribution rejected (state): version % is %, not committed; the decision record is distributed after its commitment', p_version, v.state USING ERRCODE = '22023'; END IF;
  IF p_actor <> p.owner_principal_id AND p_actor <> c.committed_by AND NOT decision.holds_role(p_actor, p_tenant, p_domain, 'decision_authority') THEN
    RAISE EXCEPTION 'distribution rejected (authority): the package owner or a decision authority distributes the decision record' USING ERRCODE = '42501';
  END IF;
  v_channels := ARRAY['in_app'];
  FOREACH v_ch IN ARRAY coalesce(p_channels, ARRAY[]::text[]) LOOP
    IF v_ch NOT IN ('in_app', 'email', 'sms', 'teams') THEN RAISE EXCEPTION 'distribution rejected (channel): % is not a channel (in_app, and the SYNTHETIC email, sms, teams)', v_ch USING ERRCODE = '22023'; END IF;
    IF NOT (v_ch = ANY (v_channels)) THEN v_channels := v_channels || v_ch; END IF;
  END LOOP;
  FOREACH v_rcpt IN ARRAY coalesce(p_recipients, ARRAY[]::uuid[]) LOOP
    IF NOT decision.is_active_human(v_rcpt, p_tenant) THEN
      RAISE EXCEPTION 'distribution rejected (recipient): % is not a named, active member of this tenant (an external collaborator is never a recipient)', v_rcpt USING ERRCODE = '22023';
    END IF;
  END LOOP;
  SELECT r2.room_id INTO v_room FROM executive.rooms_current r2 WHERE r2.package_id = p_package_id;
  v_rec := decision.decision_record(p_tenant, p_domain, p_package_id, p_version);
  FOR r IN
    SELECT q.principal_id, (ARRAY['room_owner', 'room_member', 'named'])[min(q.rank)] AS basis FROM (
      SELECT rm.owner_principal_id AS principal_id, 1 AS rank FROM executive.rooms_current rm WHERE rm.room_id = v_room
      UNION ALL SELECT m.principal_id, 2 FROM executive.room_members m WHERE m.room_id = v_room AND m.removed_at IS NULL
      UNION ALL SELECT x, 3 FROM unnest(coalesce(p_recipients, ARRAY[]::uuid[])) x) q
     WHERE decision.is_active_human(q.principal_id, p_tenant) GROUP BY q.principal_id ORDER BY q.principal_id
  LOOP
    v_recipients := v_recipients || jsonb_build_object('principal_id', r.principal_id, 'basis', r.basis);
    FOREACH v_ch IN ARRAY v_channels LOOP
      v_id := gen_random_uuid();
      INSERT INTO decision.distributions (delivery_id, distribution_id, scope, tenant_id, domain_id, package_id, version, commitment_id, record, record_digest, recipient_principal_id, recipient_basis, channel, state, receipt, synthetic_state, distributed_by, attempted_at, correlation_id)
      VALUES (v_id, p_distribution_id, 'DOMAIN', p_tenant, p_domain, p_package_id, p_version, c.commitment_id, v_rec -> 'record', v_rec ->> 'digest', r.principal_id, r.basis, v_ch,
              CASE WHEN v_ch = 'in_app' THEN 'delivered' ELSE 'queued' END,
              CASE WHEN v_ch = 'in_app' THEN jsonb_build_object('channel', 'in_app', 'proof', 'the decision record stands on the recipient''s decisions surface (decision.distributions_of)', 'placed_at', clock_timestamp()) END,
              v_ch <> 'in_app', p_actor, CASE WHEN v_ch = 'in_app' THEN clock_timestamp() END, p_correlation);
      v_rows := v_rows || jsonb_build_object('delivery_id', v_id, 'recipient', r.principal_id, 'basis', r.basis, 'channel', v_ch, 'state', CASE WHEN v_ch = 'in_app' THEN 'delivered' ELSE 'queued' END, 'synthetic', v_ch <> 'in_app');
      v_n := v_n + 1;
    END LOOP;
  END LOOP;
  IF jsonb_array_length(v_recipients) = 0 THEN RAISE EXCEPTION 'distribution rejected (recipients): no recipient — the package has no room with members and none is named' USING ERRCODE = '22023'; END IF;
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'decision.distributed', p_actor,
          jsonb_build_object('version', p_version, 'distribution_id', p_distribution_id, 'commitment_id', c.commitment_id, 'record_digest', v_rec ->> 'digest', 'recipients', v_recipients, 'channels', to_jsonb(v_channels), 'rows', v_n,
                             'synthetic_channels', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM unnest(v_channels) x WHERE x <> 'in_app')), p_correlation);
  RETURN jsonb_build_object('distribution_id', p_distribution_id, 'package_id', p_package_id, 'version', p_version, 'commitment_id', c.commitment_id, 'record_digest', v_rec ->> 'digest', 'record', v_rec -> 'record',
                            'recipients', v_recipients, 'channels', to_jsonb(v_channels), 'rows', v_rows);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.distribute_decision(uuid, uuid, uuid, uuid, int, text[], uuid[], uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.distribute_decision(uuid, uuid, uuid, uuid, int, text[], uuid[], uuid, uuid, uuid) TO eye_commit;

/* INTERNAL (the same write, the same bound action): a queued synthetic row moves once to delivered (with the adapter's receipt) or failed. */
CREATE OR REPLACE FUNCTION decision._record_distribution_receipt(
  p_delivery_id uuid, p_tenant uuid, p_domain uuid, p_state text, p_receipt jsonb, p_provider_ref text, p_error text
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE d record;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.distribute']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_state IS NULL OR p_state NOT IN ('delivered', 'failed') THEN RAISE EXCEPTION 'distribution rejected (receipt): an attempt comes to delivered or failed' USING ERRCODE = '22023'; END IF;
  SELECT * INTO d FROM decision.distributions x WHERE x.delivery_id = p_delivery_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'distribution rejected (unknown_delivery): no such distribution row in this domain' USING ERRCODE = '23503'; END IF;
  IF d.state <> 'queued' THEN RAISE EXCEPTION 'distribution rejected (state): row % is % already', p_delivery_id, d.state USING ERRCODE = '22023'; END IF;
  UPDATE decision.distributions SET state = p_state, receipt = CASE WHEN p_state = 'delivered' THEN coalesce(p_receipt, '{}'::jsonb) || jsonb_build_object('synthetic', true) ELSE p_receipt END,
         provider_ref = p_provider_ref, error = CASE WHEN p_state = 'failed' THEN left(coalesce(p_error, 'the channel reported a failure without a reason'), 500) END, attempted_at = clock_timestamp()
   WHERE delivery_id = p_delivery_id;
  RETURN jsonb_build_object('delivery_id', p_delivery_id, 'channel', d.channel, 'recipient', d.recipient_principal_id, 'state', p_state, 'synthetic', true);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision._record_distribution_receipt(uuid, uuid, uuid, text, jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision._record_distribution_receipt(uuid, uuid, uuid, text, jsonb, text, text) TO eye_commit;

/* The distributions of a version — every recipient, channel and receipt (an invoker read; a recipient sees theirs under RLS like anyone of the domain). */
CREATE OR REPLACE FUNCTION decision.distributions_of(p_package_id uuid, p_version int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = decision, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(d) - 'scope' - 'tenant_id' - 'domain_id' - 'record' ORDER BY d.distributed_at, d.recipient_principal_id, d.channel), '[]'::jsonb)
    FROM decision.distributions d WHERE d.package_id = p_package_id AND d.version = p_version
$$;
GRANT EXECUTE ON FUNCTION decision.distributions_of(uuid, int) TO eye_app, eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §G7 ONE UNIFORM HUMAN-GATE PRODUCT STATE (l6; ADR-003; the vocabulary is §0's executive.gate_states)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
/* A DECISION VERSION's gate state, from its state and its events: withdrawn (the package withdrawn, the version superseded) > challenged (an
   open challenge) > overridden (a live override of this digest) > the version's state — draft → drafted; proposed / under_review →
   review_requested, or `recused` when the last act on the version was a recusal that left it short of its quorum; approved and committed →
   approved; rejected → rejected; deferred; information_requested. `since` and `by` are the latest recorded event on the version. */
CREATE OR REPLACE FUNCTION decision.gate_state_of(p_package_id uuid, p_version int) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = decision, executive, pg_catalog, pg_temp AS $$
DECLARE p record; v record; v_state text; v_basis text; e record; v_last text;
BEGIN
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p_version;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT x.event INTO v_last FROM decision.package_events x WHERE x.package_id = p_package_id AND (x.details ->> 'version') = p_version::text
     AND x.event IN ('gate.recused', 'review.recorded', 'version.approved', 'version.resumed', 'version.proposed') ORDER BY x.occurred_at DESC, x.event_id DESC LIMIT 1;
  IF p.state = 'withdrawn' OR v.state = 'superseded' THEN v_state := 'withdrawn'; v_basis := 'package ' || p.state || ', version ' || v.state;
  ELSIF EXISTS (SELECT 1 FROM decision.challenges c WHERE c.package_id = p_package_id AND c.version = p_version AND c.resolved_at IS NULL) THEN v_state := 'challenged'; v_basis := 'an open challenge';
  ELSIF v.state IN ('proposed', 'under_review', 'approved') AND EXISTS (SELECT 1 FROM decision.gate_overrides o WHERE o.package_id = p_package_id AND o.version = p_version AND o.expires_at > clock_timestamp() AND o.version_digest = v.version_digest) THEN
    v_state := 'overridden'; v_basis := 'a live override';
  ELSE
    v_state := CASE v.state WHEN 'draft' THEN 'drafted' WHEN 'proposed' THEN 'review_requested' WHEN 'under_review' THEN 'review_requested' WHEN 'approved' THEN 'approved' WHEN 'committed' THEN 'approved'
                            WHEN 'rejected' THEN 'rejected' WHEN 'deferred' THEN 'deferred' WHEN 'information_requested' THEN 'information_requested' ELSE 'drafted' END;
    IF v.state IN ('proposed', 'under_review') AND v_last = 'gate.recused' THEN v_state := 'recused'; END IF;
    v_basis := 'version ' || v.state || CASE WHEN v_last IS NOT NULL THEN ', last act ' || v_last ELSE '' END;
  END IF;
  SELECT x.occurred_at AS at, x.actor_principal_id AS actor, x.event INTO e FROM decision.package_events x WHERE x.package_id = p_package_id AND (x.details ->> 'version') = p_version::text
   ORDER BY x.occurred_at DESC, x.event_id DESC LIMIT 1;
  RETURN jsonb_build_object('kind', 'decision', 'id', p_package_id, 'version', p_version, 'state', v_state, 'basis', v_basis,
                            'since', coalesce(e.at, v.proposed_at, v.opened_at), 'by', coalesce(e.actor, v.proposed_by, v.author_principal_id), 'last_event', e.event,
                            'terminal', (SELECT g.terminal FROM executive.gate_states g WHERE g.state = v_state));
END $$;
GRANT EXECUTE ON FUNCTION decision.gate_state_of(uuid, int) TO eye_app, eye_commit;

/* A SOURCE CONTRACT's activation states (0022 observation.source_contracts_current: draft | approved | active | suspended | retired |
   superseded, with rights confirmed | pending | withdrawn) mapped to the same vocabulary: rights withdrawn → rejected; draft with rights
   pending → information_requested; draft → review_requested; approved / active → approved; suspended → deferred; retired / superseded →
   withdrawn. The latest contract version of the source, under the caller's RLS. */
CREATE OR REPLACE FUNCTION observation.source_gate_state_of(p_source_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = observation, executive, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('kind', 'source', 'id', s.source_id, 'version', s.contract_version,
           'state', CASE WHEN s.rights_state = 'withdrawn' THEN 'rejected'
                         WHEN s.lifecycle_state = 'draft' AND s.rights_state = 'pending' THEN 'information_requested'
                         WHEN s.lifecycle_state = 'draft' THEN 'review_requested'
                         WHEN s.lifecycle_state IN ('approved', 'active') THEN 'approved'
                         WHEN s.lifecycle_state = 'suspended' THEN 'deferred'
                         ELSE 'withdrawn' END,
           'basis', 'lifecycle ' || s.lifecycle_state || ', rights ' || s.rights_state, 'since', s.updated_at, 'by', coalesce(s.approver_principal_id, s.registrar_principal_id),
           'terminal', (SELECT g.terminal FROM executive.gate_states g WHERE g.state = CASE WHEN s.rights_state = 'withdrawn' THEN 'rejected' WHEN s.lifecycle_state = 'draft' AND s.rights_state = 'pending' THEN 'information_requested'
                                                                                            WHEN s.lifecycle_state = 'draft' THEN 'review_requested' WHEN s.lifecycle_state IN ('approved', 'active') THEN 'approved'
                                                                                            WHEN s.lifecycle_state = 'suspended' THEN 'deferred' ELSE 'withdrawn' END))
    FROM observation.source_contracts_current s WHERE s.source_id = p_source_id ORDER BY s.contract_version DESC LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION observation.source_gate_state_of(uuid) TO eye_app, eye_commit;

/* A MERGE (an entity resolution, 0024 graph.resolutions_current: proposed | accepted | rejected | superseded) mapped: proposed →
   review_requested; accepted → approved; rejected → rejected; superseded → withdrawn. */
CREATE OR REPLACE FUNCTION graph.merge_gate_state_of(p_resolution_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = graph, executive, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('kind', 'merge', 'id', r.resolution_id, 'version', 1,
           'state', CASE r.state WHEN 'proposed' THEN 'review_requested' WHEN 'accepted' THEN 'approved' WHEN 'rejected' THEN 'rejected' ELSE 'withdrawn' END,
           'basis', 'resolution ' || r.state || ' (' || r.method || ')', 'since', coalesce(r.decided_at, r.proposed_at), 'by', coalesce(r.decided_by, r.proposer_principal_id),
           'terminal', (SELECT g.terminal FROM executive.gate_states g WHERE g.state = CASE r.state WHEN 'proposed' THEN 'review_requested' WHEN 'accepted' THEN 'approved' WHEN 'rejected' THEN 'rejected' ELSE 'withdrawn' END))
    FROM graph.resolutions_current r WHERE r.resolution_id = p_resolution_id
$$;
GRANT EXECUTE ON FUNCTION graph.merge_gate_state_of(uuid) TO eye_app, eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §G8 THE BOARD / GOVERNING BODY (l4; PER-01; the role board_member is §0's)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
/* THE BOARD SURFACE: the board-class packages of the domain (0090 §G6 reserve_board_class) with their current version, the uniform gate
   state, the board's approvals (live, recused), the signatures, the open challenge and the reader's own standing on each. An invoker read
   under the caller's RLS; the route's action decision.board.read is the board member's, the executive's, the authority's and the auditor's. */
CREATE OR REPLACE FUNCTION decision.board_surface(p_tenant uuid, p_domain uuid, p_actor uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = decision, executive, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'package_id', p.package_id, 'title', p.title, 'statement', p.statement, 'state', p.state, 'decision_class', p.decision_class, 'board', p.board,
    'current_version', p.current_version, 'committed_version', p.committed_version, 'decided_at', p.decided_at, 'owner', p.owner_principal_id, 'synthetic_state', p.synthetic_state,
    'gate', decision.gate_state_of(p.package_id, coalesce(p.current_version, 1)),
    'version', (SELECT jsonb_build_object('version', v.version, 'state', v.state, 'version_digest', v.version_digest, 'header_digest', v.header_digest, 'approver_policy', v.approver_policy, 'choice', v.choice,
                                          'missing_information', v.missing_information, 'expected_effects', v.expected_effects, 'proposed_at', v.proposed_at)
                  FROM decision.package_versions v WHERE v.package_id = p.package_id AND v.version = coalesce(p.current_version, 1)),
    'approvals', (SELECT coalesce(jsonb_agg(jsonb_build_object('approval_id', a.approval_id, 'approver', a.approver_principal_id, 'decision', a.decision, 'recorded_at', a.recorded_at, 'revoked_at', a.revoked_at,
                                                             'live', EXISTS (SELECT 1 FROM decision.live_approvals(p.package_id, a.version) la WHERE la.approval_id = a.approval_id),
                                                             'recused', EXISTS (SELECT 1 FROM decision.recusals r WHERE r.package_id = a.package_id AND r.version = a.version AND r.approver_principal_id = a.approver_principal_id),
                                                             'signatures', executive.signature_of('approval', a.approval_id, 1)) ORDER BY a.recorded_at), '[]'::jsonb)
                    FROM decision.approvals a WHERE a.package_id = p.package_id AND a.version = coalesce(p.current_version, 1)),
    'own_approval', (SELECT a.decision FROM decision.approvals a WHERE a.package_id = p.package_id AND a.version = coalesce(p.current_version, 1) AND a.approver_principal_id = p_actor AND a.revoked_at IS NULL ORDER BY a.recorded_at DESC LIMIT 1),
    'own_recusal', EXISTS (SELECT 1 FROM decision.recusals r WHERE r.package_id = p.package_id AND r.version = coalesce(p.current_version, 1) AND r.approver_principal_id = p_actor),
    'decision_signatures', executive.signature_of('decision', p.package_id, coalesce(p.committed_version, p.current_version, 1)),
    'open_challenge', decision.open_challenge_of(p.package_id, coalesce(p.current_version, 1)),
    'quorum', greatest(coalesce((p.board ->> 'quorum')::int, 2), coalesce((SELECT (v.approver_policy ->> 'quorum')::int FROM decision.package_versions v WHERE v.package_id = p.package_id AND v.version = coalesce(p.current_version, 1)), 0)),
    'live_approvals', (SELECT count(*) FROM decision.live_approvals(p.package_id, coalesce(p.current_version, 1)))
  ) ORDER BY p.declared_at DESC), '[]'::jsonb)
  FROM decision.packages_current p WHERE p.tenant_id = p_tenant AND p.domain_id = p_domain AND p.decision_class = 'board'
$$;
GRANT EXECUTE ON FUNCTION decision.board_surface(uuid, uuid, uuid) TO eye_app, eye_commit;

/* THE CLASS AND THE STANDING before a board act: the acting principal holds board_member here, and the package is a BOARD decision — a
   board member decides a standard package NEVER (the PDP admits a board member no standard action; and here the class is judged again).
   Called by the board routes under their own bound actions before the act itself (record_approval / gate_act, re-declared in §G9 to
   admit them). */
CREATE OR REPLACE FUNCTION decision.board_gate_check(p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_act text, p_actor uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p record; v record;
BEGIN
  IF p_act IS NULL OR p_act NOT IN ('approve', 'reject', 'defer') THEN RAISE EXCEPTION 'board decision rejected (act): a board member approves, rejects or defers' USING ERRCODE = '22023'; END IF;
  PERFORM observation.assert_authority(ARRAY['decision.board.' || p_act]);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'board decision rejected (actor): a board act is the acting principal''s own' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) OR NOT decision.holds_role(p_actor, p_tenant, p_domain, 'board_member') THEN
    RAISE EXCEPTION 'board decision rejected (authority): a named, active board member decides a board-class package' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'board decision rejected (unknown_package): no such package in this domain' USING ERRCODE = '23503'; END IF;
  IF p.decision_class <> 'board' THEN
    RAISE EXCEPTION 'board decision rejected (class): package % is a standard decision; a board member decides a board-class package only, through its gate', p_package_id USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'board decision rejected (unknown_version): no such version % of package %', p_version, p_package_id USING ERRCODE = '23503'; END IF;
  RETURN jsonb_build_object('package_id', p_package_id, 'version', p_version, 'act', p_act, 'decision_class', p.decision_class, 'board', p.board, 'version_digest', v.version_digest, 'version_state', v.state);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.board_gate_check(uuid, uuid, uuid, int, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.board_gate_check(uuid, uuid, uuid, int, text, uuid) TO eye_commit;

/* The board's approval and rejection admit an APR canonical record like decision.approve (0042:337). */
INSERT INTO observation.canonical_write_actions (action, object_types, rationale) VALUES
  ('decision.board.approve', ARRAY['APR'], 'B36 (0094 §G8): a board member''s approval of a board-class package admits an approval record and nothing else'),
  ('decision.board.reject',  ARRAY['APR'], 'B36 (0094 §G8): a board member''s rejection of a board-class package admits an approval record (decision reject) and nothing else')
ON CONFLICT (action) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §G9 THE RE-DECLARATIONS (this part alone; each copied WHOLE with ONE change, marked /* B36 (0094) gates */)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- decision.record_approval — 0090 §G9 line 4485, copied whole; the ONE change: the bound actions asserted admit the board's
-- decision.board.approve and decision.board.reject (the board member reaches this port only through decision.board_gate_check).
CREATE OR REPLACE FUNCTION decision.record_approval(
  p_approval_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_approver uuid, p_decision text, p_version_digest text,
  p_rationale text, p_conditions jsonb, p_header_digest text, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v record; p record; v_elig text; v_quorum int; v_live int; v_expires timestamptz; v_state text;
        v_conds jsonb; v_deleg decision.approval_delegations%ROWTYPE; /* B34 (0090) gates */
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.approve', /* B36 (0094) gates */ 'decision.board.approve', 'decision.board.reject' /* end B36 gates */]);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_approver IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'approval rejected: an approval is recorded by the approving principal, never on behalf of another' USING ERRCODE = '42501';
  END IF;
  IF NOT decision.is_active_human(p_approver, p_tenant) THEN RAISE EXCEPTION 'approval rejected: only a named, active human principal approves' USING ERRCODE = '42501'; END IF;
  IF p_decision NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'approval rejected: decision is approve or reject' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'approval rejected: no such package version in this domain' USING ERRCODE = '23503'; END IF;
  IF v.state NOT IN ('proposed', 'under_review', 'approved') THEN
    RAISE EXCEPTION 'approval rejected: version % is %; only a proposed version is approved', p_version, v.state USING ERRCODE = '22023';
  END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id;
  IF p_version_digest IS DISTINCT FROM v.version_digest THEN
    RAISE EXCEPTION 'approval rejected: the digest approved (%) is not the digest of version % (%); an approval signs what was read', p_version_digest, p_version, v.version_digest USING ERRCODE = '22023';
  END IF;
  IF p_approver = v.author_principal_id OR p_approver = v.proposed_by OR p_approver = p.owner_principal_id OR p_approver::text = (v.choice ->> 'action_owner') THEN
    RAISE EXCEPTION 'approval rejected: self-approval is forbidden — the author, proposer, owner and action owner of a version cannot approve it' USING ERRCODE = '42501';
  END IF;
  /* B34 (0090) gates: the TYPED conditions validated (a plain string stays a note); a board decision reserved (PER-01) */
  v_conds := decision.validate_approval_conditions(p_tenant, p_domain, coalesce(p_conditions, '[]'::jsonb));
  v_elig := decision.approver_eligibility(p_approver, p_tenant, p_domain, v.approver_policy);
  /* B34 (0090) gates: the DELEGATE of an eligible approver approves under `delegation:<id>` while the delegation lives (never a board's) */
  IF v_elig IS NULL THEN
    SELECT * INTO v_deleg FROM decision.approval_delegations d
     WHERE d.package_id = p_package_id AND d.delegate_principal_id = p_approver AND d.ended_at IS NULL AND d.starts_at <= clock_timestamp() AND d.expires_at > clock_timestamp()
       AND decision.approver_eligibility(d.delegator_principal_id, p_tenant, p_domain, v.approver_policy) IS NOT NULL
     ORDER BY d.created_at LIMIT 1;
    IF FOUND THEN
      IF p.decision_class = 'board' THEN RAISE EXCEPTION 'approval rejected (board): a board decision''s approval is never delegated' USING ERRCODE = '42501'; END IF;
      IF EXISTS (SELECT 1 FROM decision.approvals a WHERE a.package_id = p_package_id AND a.version = p_version AND a.approver_principal_id = v_deleg.delegator_principal_id AND a.revoked_at IS NULL) THEN
        RAISE EXCEPTION 'approval rejected (delegation): the delegator % already has a live record on version %; one authority signs once', v_deleg.delegator_principal_id, p_version USING ERRCODE = '22023';
      END IF;
      v_elig := 'delegation:' || v_deleg.delegation_id::text;
    END IF;
  ELSIF EXISTS (SELECT 1 FROM decision.approvals a WHERE a.package_id = p_package_id AND a.version = p_version AND a.revoked_at IS NULL AND a.eligible_by LIKE 'delegation:%'
                  AND EXISTS (SELECT 1 FROM decision.approval_delegations d WHERE d.delegation_id = substr(a.eligible_by, 12)::uuid AND d.delegator_principal_id = p_approver)) THEN
    RAISE EXCEPTION 'approval rejected (delegation): your delegate already signed version % on your behalf; one authority signs once', p_version USING ERRCODE = '22023';
  END IF;
  /* end B34 gates */
  IF v_elig IS NULL THEN RAISE EXCEPTION 'approval rejected: principal % is not an eligible approver under this version''s policy', p_approver USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM decision.approvals a WHERE a.package_id = p_package_id AND a.version = p_version AND a.approver_principal_id = p_approver AND a.revoked_at IS NULL) THEN
    RAISE EXCEPTION 'approval rejected: this approver already has a live record on version %; revoke it first', p_version USING ERRCODE = '22023';
  END IF;
  v_expires := clock_timestamp() + make_interval(days => coalesce((v.approver_policy ->> 'expires_after_days')::int, 14));
  INSERT INTO decision.approvals (approval_id, scope, tenant_id, domain_id, package_id, version, approver_principal_id, decision, version_digest, rationale, conditions, eligible_by, expires_at, header_digest, correlation_id)
  VALUES (p_approval_id, 'DOMAIN', p_tenant, p_domain, p_package_id, p_version, p_approver, p_decision, p_version_digest, p_rationale, v_conds, v_elig, v_expires, p_header_digest, p_correlation);
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'review.recorded', p_approver,
          jsonb_build_object('version', p_version, 'approval_id', p_approval_id, 'decision', p_decision, 'version_digest', p_version_digest, 'eligible_by', v_elig, 'expires_at', v_expires), p_correlation);
  v_quorum := (v.approver_policy ->> 'quorum')::int;
  IF p_decision = 'reject' THEN
    UPDATE decision.package_versions SET state = 'rejected' WHERE package_id = p_package_id AND version = p_version;
    UPDATE decision.packages_current SET state = 'rejected' WHERE package_id = p_package_id;
    INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_package_id, 'version.rejected', p_approver, jsonb_build_object('version', p_version, 'approval_id', p_approval_id), p_correlation);
    /* B34 (0090) gates: the version's gate tasks end with it */
    PERFORM executive._cancel_human_tasks(p_tenant, p_domain, decision.gate_subject(p_package_id, p_version), ARRAY['gate.approve', 'gate.review', 'gate.ready_review'],
                                          'the version was rejected by an approver', p_approver, p_correlation);
    RETURN jsonb_build_object('state', 'rejected', 'live_approvals', 0, 'quorum', v_quorum, 'expires_at', v_expires, 'eligible_by', v_elig);
  END IF;
  SELECT count(*) INTO v_live FROM decision.live_approvals(p_package_id, p_version);
  IF v_live >= v_quorum THEN v_state := 'approved'; ELSE v_state := 'under_review'; END IF;
  IF v.state <> v_state THEN
    UPDATE decision.package_versions SET state = v_state WHERE package_id = p_package_id AND version = p_version;
    UPDATE decision.packages_current SET state = v_state WHERE package_id = p_package_id;
    IF v_state = 'approved' THEN
      INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_package_id, 'version.approved', p_approver,
              jsonb_build_object('version', p_version, 'quorum', v_quorum, 'live_approvals', v_live, 'approvals', (SELECT coalesce(jsonb_agg(approval_id), '[]'::jsonb) FROM decision.live_approvals(p_package_id, p_version))), p_correlation);
    END IF;
  END IF;
  /* B34 (0090) gates: the approval resolves the delegate's task; the quorum resolves the version's gate.approve task */
  IF v_elig LIKE 'delegation:%' THEN
    PERFORM executive._resolve_human_tasks(p_tenant, p_domain, jsonb_build_object('delegation_id', substr(v_elig, 12)::uuid), ARRAY['gate.delegated_approval'], 'approved', p_approval_id, p_approver, p_correlation);
  END IF;
  IF v_state = 'approved' THEN
    PERFORM executive._resolve_human_tasks(p_tenant, p_domain, decision.gate_subject(p_package_id, p_version), ARRAY['gate.approve'], 'quorum', p_approval_id, p_approver, p_correlation);
  END IF;
  RETURN jsonb_build_object('state', v_state, 'live_approvals', v_live, 'quorum', v_quorum, 'expires_at', v_expires, 'eligible_by', v_elig);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.record_approval(uuid,uuid,uuid,uuid,int,uuid,text,text,text,jsonb,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.record_approval(uuid,uuid,uuid,uuid,int,uuid,text,text,text,jsonb,text,uuid,uuid) TO eye_commit;
-- decision.gate_act — 0090 §G3 line 3916, copied whole; the ONE change: the bound action asserted admits decision.board.<act> beside
-- decision.gate.<act> (the board member's defer; the port's standing, gate_standing, admits it as an approver the board policy names).
CREATE OR REPLACE FUNCTION decision.gate_act(
  p_action_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_action text, p_rationale text, p_next_review_at timestamptz,
  p_info_request text, p_package_digest text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p record; v record; v_to text; v_standing text; v_ip jsonb; v_task jsonb; v_task_id uuid; v_live int; v_quorum int; v_event text; v_open text[] := ARRAY['proposed', 'under_review', 'approved'];
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('review', 'acknowledge', 'ready', 'defer', 'reject', 'request_information', 'resume') THEN
    RAISE EXCEPTION 'gate rejected (action): % is not a gate act (review, acknowledge, ready, defer, reject, request_information, resume)', coalesce(p_action, '<none>') USING ERRCODE = '22023';
  END IF;
  PERFORM observation.assert_authority(ARRAY['decision.gate.' || p_action, /* B36 (0094) gates */ 'decision.board.' || p_action /* end B36 gates */]);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'gate rejected: a gate act is the acting principal''s own, never on behalf of another' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'gate rejected: only a named, active member acts at the gate' USING ERRCODE = '42501'; END IF;
  IF p_rationale IS NULL OR length(btrim(p_rationale)) < 8 OR length(p_rationale) > 4000 THEN
    RAISE EXCEPTION 'gate rejected (rationale): a gate act states its rationale (8 to 4000 characters)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'gate rejected: no such package in this domain' USING ERRCODE = '23503'; END IF;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'gate rejected: no such version % of package %', p_version, p_package_id USING ERRCODE = '23503'; END IF;
  IF p.state IN ('withdrawn', 'closed') OR v.state NOT IN ('proposed', 'under_review', 'approved', 'deferred', 'information_requested') THEN
    RAISE EXCEPTION 'gate rejected (state): version % is % (the package is %); the gate acts on a proposed version not yet committed, rejected or superseded', p_version, v.state, p.state USING ERRCODE = '22023';
  END IF;
  v_to := v.state;
  IF p_action IN ('review', 'acknowledge') THEN
    v_event := CASE p_action WHEN 'review' THEN 'gate.reviewed' ELSE 'gate.acknowledged' END;
  ELSIF p_action = 'ready' THEN
    IF NOT (v.state = ANY (v_open)) THEN RAISE EXCEPTION 'gate rejected (state): version % is %; decision-ready is marked on a proposed, reviewed or approved version', p_version, v.state USING ERRCODE = '22023'; END IF;
    IF p_actor IN (v.author_principal_id, p.owner_principal_id) OR p_actor = v.proposed_by OR p_actor::text = (v.choice ->> 'action_owner')
       OR EXISTS (SELECT 1 FROM decision.approvals a WHERE a.package_id = p_package_id AND a.version = p_version AND a.approver_principal_id = p_actor AND a.revoked_at IS NULL) THEN
      RAISE EXCEPTION 'gate rejected (independence): the reviewer who marks a version decision-ready is independent — not its author, proposer, owner, action owner nor an approver of it' USING ERRCODE = '42501';
    END IF;
    v_ip := decision.information_package(p_tenant, p_domain, p_package_id, p_version);
    IF p_package_digest IS NULL OR p_package_digest IS DISTINCT FROM (v_ip ->> 'digest') THEN
      RAISE EXCEPTION 'gate rejected (stale_package): the information package read (%) is not the package now (%); read it again', coalesce(p_package_digest, '<none>'), v_ip ->> 'digest' USING ERRCODE = '22023';
    END IF;
    v_event := 'version.ready';
  ELSE
    v_standing := decision.gate_standing(p_actor, p_tenant, p_domain, p_package_id, p_version);
    IF v_standing IS NULL THEN
      RAISE EXCEPTION 'gate rejected (authority): principal % is neither the package owner, an approver the policy admits, nor a decision authority', p_actor USING ERRCODE = '42501';
    END IF;
    IF p_action IN ('defer', 'request_information') THEN
      IF NOT (v.state = ANY (v_open)) THEN RAISE EXCEPTION 'gate rejected (state): version % is already %; resume it first', p_version, v.state USING ERRCODE = '22023'; END IF;
      IF p_next_review_at IS NULL OR p_next_review_at <= clock_timestamp() OR p_next_review_at > clock_timestamp() + interval '180 days' THEN
        RAISE EXCEPTION 'gate rejected (next_review): a % names its next review, in the future and within 180 days', replace(p_action, '_', ' ') USING ERRCODE = '22023';
      END IF;
      IF p_action = 'request_information' AND (p_info_request IS NULL OR length(btrim(p_info_request)) < 8) THEN
        RAISE EXCEPTION 'gate rejected (info_request): a request for information says what is asked (8+ characters)' USING ERRCODE = '22023';
      END IF;
      v_to := CASE p_action WHEN 'defer' THEN 'deferred' ELSE 'information_requested' END;
      v_event := CASE p_action WHEN 'defer' THEN 'version.deferred' ELSE 'version.information_requested' END;
      v_task := executive._open_human_task(gen_random_uuid(), p_tenant, p_domain, 'gate.review', 'gate.review:' || p_action_id::text, decision.gate_subject(p_package_id, p_version),
        format('%s: review %s version %s by %s', CASE p_action WHEN 'defer' THEN 'Deferred' ELSE 'Information requested' END, p.title, p_version, to_char(p_next_review_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')),
        CASE p_action WHEN 'defer' THEN p_actor ELSE p.owner_principal_id END, '{}', jsonb_build_object('gate_action_id', p_action_id), p_next_review_at,
        jsonb_build_object('principal', p.owner_principal_id, 'max_escalations', 1, 'extend_minutes', 1440), NULL, p_action, p_actor, p_correlation);
      v_task_id := (v_task ->> 'task_id')::uuid;
    ELSIF p_action = 'reject' THEN
      v_to := 'rejected'; v_event := 'version.rejected_by_owner';
    ELSE -- resume
      IF v.state NOT IN ('deferred', 'information_requested') THEN RAISE EXCEPTION 'gate rejected (state): version % is %; only a deferred or information-requested version resumes', p_version, v.state USING ERRCODE = '22023'; END IF;
      v_quorum := (v.approver_policy ->> 'quorum')::int;
      SELECT count(*) INTO v_live FROM decision.live_approvals(p_package_id, p_version);
      v_to := CASE WHEN v_live >= v_quorum THEN 'approved' WHEN v_live > 0 THEN 'under_review' ELSE 'proposed' END;
      v_event := 'version.resumed';
      PERFORM executive._resolve_human_tasks(p_tenant, p_domain, decision.gate_subject(p_package_id, p_version), ARRAY['gate.review'], 'resumed', p_action_id, p_actor, p_correlation);
    END IF;
  END IF;
  INSERT INTO decision.gate_actions (action_id, scope, tenant_id, domain_id, package_id, version, action, actor_principal_id, rationale, next_review_at, info_request, information_package_digest, from_state, to_state, task_id, correlation_id)
  VALUES (p_action_id, 'DOMAIN', p_tenant, p_domain, p_package_id, p_version, p_action, p_actor, btrim(p_rationale),
          CASE WHEN p_action IN ('defer', 'request_information') THEN p_next_review_at END, CASE WHEN p_action = 'request_information' THEN btrim(p_info_request) END,
          CASE WHEN p_action = 'ready' THEN p_package_digest END, v.state, v_to, v_task_id, p_correlation);
  IF v_to <> v.state THEN
    UPDATE decision.package_versions SET state = v_to WHERE package_id = p_package_id AND version = p_version;
    IF p.current_version = p_version THEN UPDATE decision.packages_current SET state = v_to WHERE package_id = p_package_id; END IF;
  END IF;
  IF p_action = 'reject' THEN
    PERFORM executive._cancel_human_tasks(p_tenant, p_domain, decision.gate_subject(p_package_id, p_version), ARRAY['gate.approve', 'gate.review', 'gate.ready_review', 'gate.delegated_approval'],
                                          'the version was rejected at the gate', p_actor, p_correlation);
  ELSIF p_action = 'ready' THEN
    PERFORM executive._resolve_human_tasks(p_tenant, p_domain, decision.gate_subject(p_package_id, p_version), ARRAY['gate.ready_review'], 'ready', p_action_id, p_actor, p_correlation);
  END IF;
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, v_event, p_actor,
          jsonb_strip_nulls(jsonb_build_object('version', p_version, 'action_id', p_action_id, 'action', p_action, 'rationale', btrim(p_rationale), 'from_state', v.state, 'to_state', v_to,
                             'next_review_at', CASE WHEN p_action IN ('defer', 'request_information') THEN p_next_review_at END, 'info_request', CASE WHEN p_action = 'request_information' THEN btrim(p_info_request) END,
                             'information_package_digest', CASE WHEN p_action = 'ready' THEN p_package_digest END, 'standing', v_standing, 'task_id', v_task_id)), p_correlation);
  RETURN jsonb_strip_nulls(jsonb_build_object('action_id', p_action_id, 'package_id', p_package_id, 'version', p_version, 'action', p_action, 'from_state', v.state, 'to_state', v_to,
                            'next_review_at', CASE WHEN p_action IN ('defer', 'request_information') THEN p_next_review_at END, 'task_id', v_task_id, 'standing', v_standing, 'event', v_event));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.gate_act(uuid, uuid, uuid, uuid, int, text, text, timestamptz, text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.gate_act(uuid, uuid, uuid, uuid, int, text, text, timestamptz, text, text, uuid, uuid, uuid) TO eye_commit;
