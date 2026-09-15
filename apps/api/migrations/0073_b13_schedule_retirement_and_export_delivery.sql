-- 0073 — CP-6 B13: the governed SCHEDULE RETIREMENT; the customer export's DELIVERY — the package download, the destination and
-- its receipt, the key-based signature (2026-09-16).
--
-- THE GAP. After B11 a customer export ends in the vault's export namespace: its "destination" is a directory of the product, its
-- signature a digest chain, its receipt nobody's — V03-T-047's gate list (approval, redaction, format, DESTINATION, data rights, audit,
-- revocation) is whole only inside the product; DP-47-002's controlled state names "destination, receipt, and expiry" and DP-47-005
-- requires RECIPIENT ACKNOWLEDGEMENT before closure; DZ-17, DPD-19, LR-23, SC-24 and NZ-20 name a SIGNED package and a transfer
-- station; V4 ES-53-004 the disconnected path with receipt checks; V9 CMP-102 the delivery receipt. And a schedule, once declared,
-- could not be retired by a governed act (the harnesses retire by a raw UPDATE).
--
-- THE MECHANISM. (D1) A schedule is retired by its own governed act, its history kept: retention.schedules gains retired_at/by/reason,
-- retention.retire_schedule moves active → retired once; a new append-only ledger retention.schedule_events records the declaration and
-- the retirement; a retired schedule opens nothing (evaluate_schedules reads state = 'active' — 0072 §7, unchanged). (D2) What a customer
-- downloads and what a destination receives is ONE file — a deterministic ustar tar of the package's files (built in process, mtime the
-- manifest's built_at) — whose sha256, the ARCHIVE DIGEST, is recorded on the package row at the build and re-verified before every
-- download and delivery. (D3) Key-based signing is the scheme eye-customer-export/2: the tenant's signing keys are TENANT rows
-- (retention.export_signing_keys — the PUBLIC key recorded, the private key a credential BY REFERENCE EYE_EXPORT_SIGNING_KEY_<NAME>
-- resolved from the deployment at use, never recorded); the active key is the latest non-retired one; a package built while a key is
-- active carries a 64-byte Ed25519 signature over the ASCII hex of its package digest, named by key id; the record port admits /1 only
-- while the tenant has no active key. (D4) A package EXPIRES: expires_at = built_at + the action's selector.expires_after (1 hour … 1 year,
-- default 30 days — one floor, checked here at the open and at the schedule's declaration and in TS alike); an expired package is neither
-- downloaded nor delivered; a revocation still records. (D5) A DESTINATION is a declared exchange party of the domain — a TRANSFER
-- STATION (a directory outside the vault's roots the product writes packages into and reads receipts from: the disconnected path) or an
-- https endpoint (the production kind; its bearer credential BY REFERENCE EYE_DST_<NAME>, carried at egress and never recorded) — with a
-- recipient (who receives) and a purpose; retired once, its history kept. (D6) A DELIVERY is a governed, human-gated act on a VERIFIED,
-- unrevoked, unexpired package, the rights of every exported source re-checked, recorded with what the destination answered: begin
-- (the gates, before anything leaves; the attempt serialised under the action's row lock and its own advisory lock — C6), record (the
-- row and the action event — delivered, delivery_failed, acknowledged or mismatched — and custody.delivered per exported manifest; a
-- FAILED delivery is a recorded fact), acknowledge (a delivered row moves to acknowledged when the recipient's receipt names the same
-- archive AND package digests and verified true, to mismatched otherwise — the exchange DENIED with the request and evidence preserved,
-- DP-47-005; a receipt naming another delivery is refused — C7). (D7) The download is a governed, audited read: the port
-- retention.record_export_download writes the event export.downloaded on the action. (D9) Custody: custody.delivered. (D10) No new
-- interface is bound: L3-I04's binding text gains the B13 clause, the counts stay (26 bound, 24 partial, 0 unbound).
--
--   §1 the schedule retirement: the three columns and their pair check (C10); retention.schedule_events (append-only; RLS); the writer
--      retention.schedule_event (no grant — C18's rule); retention.retire_schedule; retention.declare_schedule re-declared (0072 §7's body +
--      the export expiry floor on a customer_export selector (C3) + the declared event); retention.tier_state re-declared (0072 §1's body +
--      retired_at in the schedule entries).
--   §2 the export package's archive_digest, expires_at and signing_key_id (NULL for the packages built before B13), the revoke-only trigger
--      protecting them too; the events export.delivered / export.delivery_failed / export.acknowledged / export.mismatched / export.downloaded
--      and custody.delivered; retention.export_signing_keys (TENANT rows — C1) and its ports retention.declare_export_signing_key,
--      retention.retire_export_signing_key, retention.active_export_signing_key; the expiry floor retention.admissible_export_expiry;
--      retention.open_action re-declared (0072 §3's body + the floor — C3); retention.record_export_package DROPPED in its 12-argument form
--      and declared with p_archive_digest and p_signing_key_id (0070 §3's body + the scheme /2 admission, the expiry from ONE instant — C5);
--      retention.record_export_download.
--   §3 the destinations: retention.export_destinations, retention.declare_export_destination, retention.retire_export_destination.
--   §4 the deliveries: retention.export_deliveries (append-only except the acknowledgement), retention.lock_key_export_deliveries,
--      retention.begin_export_delivery, retention.record_export_delivery, retention.acknowledge_export_delivery.
--   §5 retention.revoke_export re-declared verbatim (0070 §3): a revoked package's deliveries stay recorded; no notice reaches the destination
--      (recorded honestly as remaining).
--   §6 the interface register: L3-I04's binding text gains the B13 clause (counts unchanged: 26 bound, 24 partial, 0 unbound).
--
-- The refusals: every port asserts its action; the messages carry the prefixes the mapper routes (observation-errors.ts) — 'retention
-- schedule rejected: …', 'export signing key rejected: …', 'export destination rejected: …', 'retention delivery rejected: …' (42501 → 403
-- for "recorded by the acting principal"; 23503 → 404 for "no such …" / "… has no export package" / "… is not a schedule of this domain";
-- 22023 → 409 for the record's state, 422 otherwise) and the existing 'export rejected: …' / 'retention action rejected: …' families.

-- ============================================================
-- §1 the schedule retirement
-- ============================================================
-- A schedule is retired by its own governed act, its history kept (D1): the row, its last_evaluation, the actions it opened and their
-- events stay untouched; a retired schedule opens nothing. The pair check is among the three new columns only (C10): the B11/B12
-- harnesses retire schedules by a raw UPDATE of state alone, and such rows keep a NULL retired_at; no trigger on retention.schedules.
ALTER TABLE retention.schedules ADD COLUMN retired_at timestamptz;
ALTER TABLE retention.schedules ADD COLUMN retired_by uuid;
ALTER TABLE retention.schedules ADD COLUMN retire_reason text;
ALTER TABLE retention.schedules ADD CONSTRAINT rsch_retire_pair CHECK ((retired_by IS NULL) = (retired_at IS NULL) AND (retired_at IS NULL OR length(btrim(retire_reason)) >= 8));

-- THE SCHEDULE LEDGER: what happened to a schedule and by whom — its declaration (the selector, the profile, the due-after, the owner) and
-- its retirement (the reason, the last evaluation it made). Append-only; RLS as retention's other tables.
CREATE TABLE retention.schedule_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  schedule_id        uuid NOT NULL,
  event              text NOT NULL CHECK (event IN ('schedule.declared', 'schedule.retired')),
  actor_principal_id uuid,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT rse_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX rse_schedule ON retention.schedule_events (schedule_id, occurred_at);
CREATE TRIGGER rse_append_only BEFORE UPDATE OR DELETE ON retention.schedule_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
ALTER TABLE retention.schedule_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention.schedule_events FORCE ROW LEVEL SECURITY;
CREATE POLICY retention_isolation ON retention.schedule_events
  USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
REVOKE ALL ON retention.schedule_events FROM PUBLIC;
GRANT SELECT ON retention.schedule_events TO eye_app, eye_commit;

-- The ledger's writer — retention.event's shape (0066 §4): no authority check of its own and no EXECUTE grant (C18); called only from the
-- SECURITY DEFINER ports below, each with its own assert_authority.
CREATE OR REPLACE FUNCTION retention.schedule_event(p_schedule_id uuid, p_tenant uuid, p_domain uuid, p_event text, p_actor uuid, p_details jsonb, p_correlation uuid) RETURNS void
SET search_path = retention, pg_catalog, pg_temp AS $$
  INSERT INTO retention.schedule_events (event_id, scope, tenant_id, domain_id, schedule_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_schedule_id, p_event, p_actor, coalesce(p_details, '{}'::jsonb), p_correlation);
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION retention.schedule_event(uuid,uuid,uuid,text,uuid,jsonb,uuid) FROM PUBLIC;

-- THE RETIREMENT (retention.schedule.retire — the declare rule's holders, human-gated by the PDP): active → retired once, the reason on
-- the row and in the ledger; a retired schedule refused (409), a schedule not of this domain refused (404). Returns the row after.
CREATE OR REPLACE FUNCTION retention.retire_schedule(p_schedule_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s retention.schedules%ROWTYPE; v_at timestamptz;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.schedule.retire']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'retention schedule rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'retention schedule rejected: a reason of 8+ characters' USING ERRCODE = '22023'; END IF;
  SELECT * INTO s FROM retention.schedules x WHERE x.schedule_id = p_schedule_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention schedule rejected: % is not a schedule of this domain', p_schedule_id USING ERRCODE = '23503'; END IF;
  IF s.state = 'retired' THEN RAISE EXCEPTION 'retention schedule rejected: % is retired', p_schedule_id USING ERRCODE = '22023'; END IF;
  v_at := clock_timestamp();
  UPDATE retention.schedules SET state = 'retired', retired_at = v_at, retired_by = p_actor, retire_reason = p_reason WHERE schedule_id = p_schedule_id RETURNING * INTO s;
  PERFORM retention.schedule_event(p_schedule_id, p_tenant, p_domain, 'schedule.retired', p_actor,
    jsonb_build_object('reason', p_reason, 'action_kind', s.action_kind, 'target_kind', s.target_kind, 'retention_profile', s.retention_profile, 'last_evaluated_at', s.last_evaluated_at, 'last_evaluation', s.last_evaluation), p_correlation);
  RETURN to_jsonb(s);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.retire_schedule(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.retire_schedule(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

-- ONE EXPIRY FLOOR (D4; C3): an export's expires_after is an interval spelled as a dueAfter — '<n> <unit>' — between 1 hour and 1 year,
-- the same regex and floor validateOpenAction applies in TS (no configuration, no test-only branch). The regex is checked BEFORE the
-- cast (a bad cast is 22007 — a crash, not a refusal) and the cast is guarded (a number of years beyond the interval's range overflows
-- with 22008/22015 — the same crash); the caller raises its own refusal on false.
CREATE OR REPLACE FUNCTION retention.admissible_export_expiry(p_text text) RETURNS boolean
IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE v interval;
BEGIN
  IF p_text IS NULL OR p_text !~ '^\d+ (seconds?|minutes?|hours?|days?|months?|years?)$' THEN RETURN false; END IF;
  BEGIN
    v := p_text::interval;
  EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format OR interval_field_overflow THEN RETURN false;
  END;
  RETURN v BETWEEN interval '1 hour' AND interval '1 year';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.admissible_export_expiry(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.admissible_export_expiry(text) TO eye_app, eye_commit;

-- declare_schedule (0072 §7) re-declared with two additions: a customer_export selector's expires_after — carried into every export the
-- schedule opens (evaluate_schedules copies the selector's keys) — is validated against the one floor (C3); and the declaration is
-- written to the schedule ledger (D1). Every other line as 0072 left it.
CREATE OR REPLACE FUNCTION retention.declare_schedule(p_schedule_id uuid, p_tenant uuid, p_domain uuid, p_retention_profile text, p_target_kind text, p_action_kind text, p_due_after interval, p_selector jsonb, p_owner uuid, p_actor uuid, p_correlation uuid)
RETURNS void
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_selector jsonb := coalesce(p_selector, '{}'::jsonb);
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.schedule.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_action_kind = 'restore' THEN RAISE EXCEPTION 'retention schedule rejected: a restore is opened on demand (an action naming the manifests), not by a schedule' USING ERRCODE = '22023'; END IF;
  IF p_due_after IS NULL OR p_due_after < interval '0' THEN RAISE EXCEPTION 'retention schedule rejected: due_after is a non-negative interval' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(v_selector) <> 'object' THEN RAISE EXCEPTION 'retention schedule rejected: the selector is an object' USING ERRCODE = '22023'; END IF;
  IF v_selector ? 'manifest_ids' OR v_selector ? 'manifest_id' THEN RAISE EXCEPTION 'retention schedule rejected: a schedule selects by retention profile and source; a chosen object set (manifest_ids) or a single manifest is an action''s selector' USING ERRCODE = '22023'; END IF;
  IF p_action_kind = 'customer_export' THEN
    IF coalesce(v_selector ->> 'classification_ceiling', '') NOT IN ('public', 'internal', 'confidential', 'restricted') THEN RAISE EXCEPTION 'retention schedule rejected: a customer_export schedule names its classification_ceiling (public, internal, confidential, restricted)' USING ERRCODE = '22023'; END IF;
    IF coalesce(v_selector ->> 'destination', 'export') <> 'export' THEN RAISE EXCEPTION 'retention schedule rejected: the export destination is the export namespace of the vault (destination export)' USING ERRCODE = '22023'; END IF;
    -- B13 (D4; C3): the expiry the opened exports will carry — the one floor.
    IF (v_selector ? 'expires_after') AND NOT retention.admissible_export_expiry(v_selector ->> 'expires_after') THEN RAISE EXCEPTION 'retention schedule rejected: expires_after is between 1 hour and 1 year' USING ERRCODE = '22023'; END IF;
    v_selector := v_selector || jsonb_build_object('destination', 'export');
  END IF;
  INSERT INTO retention.schedules (schedule_id, scope, tenant_id, domain_id, retention_profile, target_kind, action_kind, due_after, selector, owner_principal_id, declared_by, correlation_id)
  VALUES (p_schedule_id, 'DOMAIN', p_tenant, p_domain, p_retention_profile, p_target_kind, p_action_kind, p_due_after, v_selector, coalesce(p_owner, p_actor), p_actor, p_correlation);
  PERFORM retention.schedule_event(p_schedule_id, p_tenant, p_domain, 'schedule.declared', p_actor,
    jsonb_build_object('retention_profile', p_retention_profile, 'target_kind', p_target_kind, 'action_kind', p_action_kind, 'due_after', p_due_after::text, 'selector', v_selector, 'owner_principal_id', coalesce(p_owner, p_actor)), p_correlation);
END $$ LANGUAGE plpgsql;

-- tier_state (0072 §1) re-declared: the schedule entries carry retired_at (D1). Every other line as 0072 left it.
CREATE OR REPLACE FUNCTION retention.tier_state(p_tenant uuid, p_domain uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE pol RECORD; v_tiers jsonb; v_awaiting int; v_moves jsonb; v_used bigint; v_resets timestamptz; v_actions jsonb; v_pending int; v_schedules jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.read']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO pol FROM retention.current_tier_policy(p_tenant, p_domain);
  SELECT jsonb_build_object('hot', jsonb_build_object('manifests', count(*) FILTER (WHERE t.tier = 'hot'), 'bytes', coalesce(sum(m.byte_length) FILTER (WHERE t.tier = 'hot'), 0)::bigint),
                            'archive', jsonb_build_object('manifests', count(*) FILTER (WHERE t.tier = 'archive'), 'bytes', coalesce(sum(m.byte_length) FILTER (WHERE t.tier = 'archive'), 0)::bigint)),
         count(*) FILTER (WHERE t.tier = 'hot' AND EXISTS (SELECT 1 FROM observation.blob_tier_records r WHERE r.manifest_id = m.manifest_id))
    INTO v_tiers, v_awaiting
    FROM observation.blob_manifests m
    CROSS JOIN LATERAL (SELECT observation.manifest_tier(m.manifest_id) AS tier) t
   WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain AND m.vault = 'evidence'
     AND NOT EXISTS (SELECT 1 FROM observation.blob_tombstones x WHERE x.manifest_id = m.manifest_id);
  SELECT jsonb_build_object('archived', jsonb_build_object('count', count(*) FILTER (WHERE r.tier = 'archive'), 'bytes', coalesce(sum(bm.byte_length) FILTER (WHERE r.tier = 'archive'), 0)::bigint),
                            'restored', jsonb_build_object('count', count(*) FILTER (WHERE r.tier = 'hot'), 'bytes', coalesce(sum(bm.byte_length) FILTER (WHERE r.tier = 'hot'), 0)::bigint)),
         coalesce(sum(bm.byte_length), 0)::bigint, min(r.moved_at) + interval '1 day'
    INTO v_moves, v_used, v_resets
    FROM observation.blob_tier_records r JOIN observation.blob_manifests bm ON bm.manifest_id = r.manifest_id
   WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.moved_at > clock_timestamp() - interval '1 day';
  SELECT count(DISTINCT ri.action_id) INTO v_pending FROM retention.residual_inventory ri WHERE ri.tenant_id = p_tenant AND ri.domain_id = p_domain AND ri.kind = 'bytes_present' AND ri.status = 'pending';
  SELECT jsonb_build_object('executing', count(*) FILTER (WHERE a.state = 'executing'),
                            'paused_retry', count(*) FILTER (WHERE a.state = 'paused' AND a.disposition = 'retry'),
                            'paused_human_review', count(*) FILTER (WHERE a.state = 'paused' AND a.disposition = 'human_review'),
                            'escalated', count(*) FILTER (WHERE a.state = 'paused' AND a.escalated_at IS NOT NULL),
                            'pending_bytes_residuals', v_pending)
    INTO v_actions FROM retention.actions_current a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain;
  SELECT coalesce(jsonb_agg(jsonb_build_object('schedule_id', s.schedule_id, 'action_kind', s.action_kind, 'target_kind', s.target_kind, 'retention_profile', s.retention_profile, 'due_after', s.due_after::text,
                                               'state', s.state, 'last_evaluated_at', s.last_evaluated_at, 'last_evaluation', s.last_evaluation, 'retired_at', s.retired_at) ORDER BY s.declared_at, s.schedule_id), '[]'::jsonb)
    INTO v_schedules FROM retention.schedules s WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain;
  RETURN jsonb_build_object(
    'policy', jsonb_build_object('declared', pol.declared, 'policy_id', pol.policy_id, 'version', pol.version, 'budget_bytes_per_day', pol.budget_bytes_per_day,
                                 'max_opens_per_evaluation', pol.max_opens_per_evaluation, 'max_attempts', pol.max_attempts,
                                 'escalate_after', pol.escalate_after::text, 'restore_hot_for', pol.restore_hot_for::text),
    'tiers', v_tiers,
    'moves_24h', v_moves,
    'budget', jsonb_build_object('bytes_per_day', pol.budget_bytes_per_day, 'used_24h', v_used,
                                 'remaining', CASE WHEN pol.budget_bytes_per_day IS NULL THEN NULL ELSE greatest(pol.budget_bytes_per_day - v_used, 0) END,
                                 'window_resets_at', v_resets),
    'actions', v_actions,
    'restored_awaiting_rearchive', v_awaiting,
    'schedules', v_schedules);
END $$ LANGUAGE plpgsql;

-- ============================================================
-- §2 the export package's archive digest, expiry and signing key; the signing keys; the download event
-- ============================================================
-- Three columns on the package row (D2, D3, D4), NULL for the packages built before B13: archive_digest — the sha256 of the deterministic
-- tar of the package's files, recorded once at the build and re-verified before every download and delivery; expires_at — built_at plus
-- the action's expires_after (NULL = never, for the old rows); signing_key_id — the tenant's active key at the build (NULL for a
-- digest-chain package). The revoke-only trigger protects them too.
ALTER TABLE retention.export_packages ADD COLUMN archive_digest text CHECK (archive_digest IS NULL OR archive_digest ~ '^[0-9a-f]{64}$');
ALTER TABLE retention.export_packages ADD COLUMN expires_at timestamptz;
ALTER TABLE retention.export_packages ADD COLUMN signing_key_id text;
CREATE OR REPLACE FUNCTION retention.export_packages_revoke_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'table retention.export_packages is append-only (ADR-P0-07): DELETE prohibited' USING ERRCODE = '42501'; END IF;
  IF OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL
     OR NEW.action_id IS DISTINCT FROM OLD.action_id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.domain_id IS DISTINCT FROM OLD.domain_id
     OR NEW.destination IS DISTINCT FROM OLD.destination OR NEW.locator_prefix IS DISTINCT FROM OLD.locator_prefix OR NEW.scope_digest IS DISTINCT FROM OLD.scope_digest
     OR NEW.approval_id IS DISTINCT FROM OLD.approval_id OR NEW.classification_ceiling IS DISTINCT FROM OLD.classification_ceiling OR NEW.object_count IS DISTINCT FROM OLD.object_count
     OR NEW.excluded_count IS DISTINCT FROM OLD.excluded_count OR NEW.byte_total IS DISTINCT FROM OLD.byte_total OR NEW.manifest_digest IS DISTINCT FROM OLD.manifest_digest
     OR NEW.package_digest IS DISTINCT FROM OLD.package_digest OR NEW.signature IS DISTINCT FROM OLD.signature OR NEW.built_by IS DISTINCT FROM OLD.built_by
     OR NEW.built_at IS DISTINCT FROM OLD.built_at OR NEW.correlation_id IS DISTINCT FROM OLD.correlation_id
     OR NEW.archive_digest IS DISTINCT FROM OLD.archive_digest OR NEW.expires_at IS DISTINCT FROM OLD.expires_at OR NEW.signing_key_id IS DISTINCT FROM OLD.signing_key_id THEN
    RAISE EXCEPTION 'an export package is revoked once; nothing else about it changes' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

-- The events of the delivery (D6) and the download (D7) on the action; custody.delivered per exported manifest (D9).
ALTER TABLE retention.action_events DROP CONSTRAINT action_events_event_check;
ALTER TABLE retention.action_events ADD CONSTRAINT action_events_event_check CHECK (event IN ('action.opened', 'scope.resolved', 'action.held', 'action.paused', 'approval.recorded', 'approval.revoked', 'execution.started', 'execution.item', 'execution.finished', 'residual.recorded', 'verification.passed', 'verification.residuals', 'action.withdrawn', 'action.rejected', 'action.failed', 'export.built', 'export.revoked', 'action.escalated', 'export.delivered', 'export.delivery_failed', 'export.acknowledged', 'export.mismatched', 'export.downloaded'));
ALTER TABLE observation.custody_events DROP CONSTRAINT custody_events_event_check;
ALTER TABLE observation.custody_events ADD CONSTRAINT custody_events_event_check CHECK (event IN (
  'custody.acquired', 'custody.quarantined', 'custody.verified', 'custody.candidate_verified', 'custody.admitted', 'custody.finalized',
  'custody.retrieved', 'custody.tombstoned', 'custody.integrity_failed', 'custody.archived', 'custody.exported', 'custody.restored', 'custody.delivered'));

-- THE SIGNING KEYS of a tenant (D3; C1): TENANT rows — observation.scope_ok admits DOMAIN rows only and assert_scope refuses a NULL domain,
-- so the table carries its own scope check (scope 'TENANT', a tenant, no domain) and its own isolation (the tenant's rows); the ports
-- take the ROUTE's domain for the scope assertion alone. The PUBLIC key is recorded (SPKI PEM); the private key is a credential by
-- REFERENCE — EYE_EXPORT_SIGNING_KEY_<NAME>, resolved from the process environment at the build, never recorded, never logged. The
-- key id is 'ed25519:' + the first 16 hex of sha256(the SPKI DER). A key is retired once, its row kept: a package signed by a retired
-- key still verifies against the recorded public key, and the read routes say the key is retired. The purpose — demonstration or
-- production — is declared and shown everywhere the signature is shown.
CREATE TABLE retention.export_signing_keys (
  key_id          text NOT NULL CHECK (key_id ~ '^ed25519:[0-9a-f]{16}$'),
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid,
  algorithm       text NOT NULL CHECK (algorithm = 'Ed25519'),
  public_key_pem  text NOT NULL,
  credential_ref  text NOT NULL CHECK (credential_ref ~ '^EYE_EXPORT_SIGNING_KEY_[A-Z0-9_]{1,64}$'),
  purpose         text NOT NULL CHECK (purpose IN ('demonstration', 'production')),
  declared_by     uuid NOT NULL,
  declared_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  retired_by      uuid,
  retired_at      timestamptz,
  retire_reason   text,
  correlation_id  uuid NOT NULL,
  PRIMARY KEY (tenant_id, key_id),
  CONSTRAINT rsk_scope CHECK (scope = 'TENANT' AND tenant_id IS NOT NULL AND domain_id IS NULL),
  CONSTRAINT rsk_retire_pair CHECK ((retired_by IS NULL) = (retired_at IS NULL) AND (retired_at IS NULL OR length(btrim(retire_reason)) >= 8))
);
CREATE INDEX rsk_active ON retention.export_signing_keys (tenant_id, declared_at DESC) WHERE retired_at IS NULL;
-- The retirement is the ONE change a key row takes, once (the shape of retention.export_packages_revoke_only).
CREATE OR REPLACE FUNCTION retention.export_signing_keys_retire_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'table retention.export_signing_keys is append-only (ADR-P0-07): DELETE prohibited' USING ERRCODE = '42501'; END IF;
  IF OLD.retired_at IS NOT NULL OR NEW.retired_at IS NULL
     OR NEW.key_id IS DISTINCT FROM OLD.key_id OR NEW.scope IS DISTINCT FROM OLD.scope OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.domain_id IS DISTINCT FROM OLD.domain_id
     OR NEW.algorithm IS DISTINCT FROM OLD.algorithm OR NEW.public_key_pem IS DISTINCT FROM OLD.public_key_pem OR NEW.credential_ref IS DISTINCT FROM OLD.credential_ref
     OR NEW.purpose IS DISTINCT FROM OLD.purpose OR NEW.declared_by IS DISTINCT FROM OLD.declared_by OR NEW.declared_at IS DISTINCT FROM OLD.declared_at
     OR NEW.correlation_id IS DISTINCT FROM OLD.correlation_id THEN
    RAISE EXCEPTION 'an export signing key is retired once; nothing else about it changes' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rsk_retire_only BEFORE UPDATE OR DELETE ON retention.export_signing_keys FOR EACH ROW EXECUTE FUNCTION retention.export_signing_keys_retire_only();
ALTER TABLE retention.export_signing_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention.export_signing_keys FORCE ROW LEVEL SECURITY;
CREATE POLICY retention_isolation ON retention.export_signing_keys USING (tenant_id = public.eye_tenant());
REVOKE ALL ON retention.export_signing_keys FROM PUBLIC;
GRANT SELECT ON retention.export_signing_keys TO eye_app, eye_commit;

-- THE DECLARATION (retention.signing_key.declare — the platform's or the tenant's administrator; human-gated): the server resolved the
-- reference, derived the public key and the key id; the port checks the shapes it can — the reference's name (never its value), the
-- purpose, the PEM's form, that its body is the 44-byte Ed25519 SubjectPublicKeyInfo (RFC 8410: the 12-byte algorithm prefix, then the
-- 32-byte key) and that the key id is the first 16 hex of its sha256 — and records the row once: a key already declared for the tenant
-- is refused (409); a retired key stays retired (a new key is a new declaration). Returns the row.
CREATE OR REPLACE FUNCTION retention.declare_export_signing_key(p_key_id text, p_tenant uuid, p_domain uuid, p_algorithm text, p_public_key_pem text, p_credential_ref text, p_purpose text, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE k retention.export_signing_keys%ROWTYPE; v_body text; v_der bytea; v_at timestamptz;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.signing_key.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'export signing key rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_algorithm IS DISTINCT FROM 'Ed25519' THEN RAISE EXCEPTION 'export signing key rejected: the algorithm is Ed25519' USING ERRCODE = '22023'; END IF;
  IF p_credential_ref IS NULL OR p_credential_ref !~ '^EYE_EXPORT_SIGNING_KEY_[A-Z0-9_]{1,64}$' THEN RAISE EXCEPTION 'export signing key rejected: the credential reference is EYE_EXPORT_SIGNING_KEY_<NAME> (the private key stays in the deployment; it is never recorded)' USING ERRCODE = '22023'; END IF;
  IF p_purpose IS NULL OR p_purpose NOT IN ('demonstration', 'production') THEN RAISE EXCEPTION 'export signing key rejected: the purpose is demonstration or production' USING ERRCODE = '22023'; END IF;
  IF p_public_key_pem IS NULL OR p_public_key_pem !~ '^-----BEGIN PUBLIC KEY-----\n([A-Za-z0-9+/=]+\n)+-----END PUBLIC KEY-----\n?$' THEN RAISE EXCEPTION 'export signing key rejected: the public key is an Ed25519 SubjectPublicKeyInfo in PEM' USING ERRCODE = '22023'; END IF;
  v_body := regexp_replace(p_public_key_pem, '-----(BEGIN|END) PUBLIC KEY-----|\s', '', 'g');
  IF v_body !~ '^[A-Za-z0-9+/]+={0,2}$' OR length(v_body) % 4 <> 0 THEN RAISE EXCEPTION 'export signing key rejected: the public key is an Ed25519 SubjectPublicKeyInfo in PEM' USING ERRCODE = '22023'; END IF;
  v_der := decode(v_body, 'base64');
  IF length(v_der) <> 44 OR substring(v_der from 1 for 12) <> '\x302a300506032b6570032100'::bytea THEN RAISE EXCEPTION 'export signing key rejected: the public key is an Ed25519 SubjectPublicKeyInfo in PEM' USING ERRCODE = '22023'; END IF;
  IF p_key_id IS DISTINCT FROM 'ed25519:' || left(encode(sha256(v_der), 'hex'), 16) THEN RAISE EXCEPTION 'export signing key rejected: the key id is ed25519:<the first 16 hex of sha256(the SPKI DER)>' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM retention.export_signing_keys x WHERE x.tenant_id = p_tenant AND x.key_id = p_key_id) THEN RAISE EXCEPTION 'export signing key rejected: % is already declared', p_key_id USING ERRCODE = '22023'; END IF;
  v_at := clock_timestamp();
  INSERT INTO retention.export_signing_keys (key_id, scope, tenant_id, domain_id, algorithm, public_key_pem, credential_ref, purpose, declared_by, declared_at, correlation_id)
  VALUES (p_key_id, 'TENANT', p_tenant, NULL, 'Ed25519', p_public_key_pem, p_credential_ref, p_purpose, p_actor, v_at, p_correlation) RETURNING * INTO k;
  RETURN to_jsonb(k);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.declare_export_signing_key(text,uuid,uuid,text,text,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.declare_export_signing_key(text,uuid,uuid,text,text,text,text,uuid,uuid) TO eye_commit;

-- THE RETIREMENT (retention.signing_key.retire): once, with a reason; the row kept. Returns the row after.
CREATE OR REPLACE FUNCTION retention.retire_export_signing_key(p_key_id text, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE k retention.export_signing_keys%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.signing_key.retire']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'export signing key rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'export signing key rejected: a reason of 8+ characters' USING ERRCODE = '22023'; END IF;
  SELECT * INTO k FROM retention.export_signing_keys x WHERE x.tenant_id = p_tenant AND x.key_id = p_key_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'export signing key rejected: no such key % of this tenant', coalesce(p_key_id, '<none>') USING ERRCODE = '23503'; END IF;
  IF k.retired_at IS NOT NULL THEN RAISE EXCEPTION 'export signing key rejected: % is retired', p_key_id USING ERRCODE = '22023'; END IF;
  UPDATE retention.export_signing_keys SET retired_at = clock_timestamp(), retired_by = p_actor, retire_reason = p_reason WHERE tenant_id = p_tenant AND key_id = p_key_id RETURNING * INTO k;
  RETURN to_jsonb(k);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.retire_export_signing_key(text,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.retire_export_signing_key(text,uuid,uuid,text,uuid,uuid) TO eye_commit;

-- THE ACTIVE KEY of a tenant: its latest non-retired key by declared_at (NULL when none). Read by the export build (the scheme it signs
-- under), by record_export_package (the /2 admission) and by begin_export_delivery (C8's gate).
CREATE OR REPLACE FUNCTION retention.active_export_signing_key(p_tenant uuid) RETURNS text
STABLE SET search_path = retention, pg_catalog, pg_temp AS $$
  SELECT k.key_id FROM retention.export_signing_keys k WHERE k.tenant_id = p_tenant AND k.retired_at IS NULL ORDER BY k.declared_at DESC, k.key_id DESC LIMIT 1;
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION retention.active_export_signing_key(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.active_export_signing_key(uuid) TO eye_app, eye_commit;

-- open_action (0072 §3) re-declared with one check inside the customer export's branch: a selector's expires_after is validated against
-- the one floor (D4; C3) — the regex before the cast, then the bounds. Every other line as 0072 left it.
CREATE OR REPLACE FUNCTION retention.open_action(p_action_id uuid, p_tenant uuid, p_domain uuid, p_kind text, p_target_kind text, p_selector jsonb, p_retention_profile text, p_schedule_id uuid, p_actor uuid, p_correlation uuid)
RETURNS void
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.action.open', 'retention.schedule.evaluate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_selector IS NULL OR jsonb_typeof(p_selector) <> 'object' THEN RAISE EXCEPTION 'retention action rejected: the selector is an object' USING ERRCODE = '22023'; END IF;
  IF p_target_kind = 'log_partition' AND p_kind <> 'log_floor' THEN RAISE EXCEPTION 'retention action rejected: the log partition takes the log_floor action' USING ERRCODE = '22023'; END IF;
  IF p_target_kind = 'evidence' AND p_kind NOT IN ('review', 'deletion', 'archive', 'customer_export', 'restore') THEN RAISE EXCEPTION 'retention action rejected: % is not an evidence action', p_kind USING ERRCODE = '22023'; END IF;
  IF p_target_kind = 'log_partition' AND (p_selector ->> 'partition_key') IS DISTINCT FROM ('tenant:' || p_tenant::text) THEN
    RAISE EXCEPTION 'retention action rejected: the log partition of this tenant is tenant:%', p_tenant USING ERRCODE = '22023';
  END IF;
  IF p_target_kind = 'evidence' THEN
    IF (p_selector ? 'manifest_ids') AND p_kind NOT IN ('archive', 'customer_export', 'restore') THEN RAISE EXCEPTION 'retention action rejected: a chosen object set (manifest_ids) is an archive''s or a customer export''s selector, or a restore''s' USING ERRCODE = '22023'; END IF;
    IF (p_selector ? 'manifest_ids') AND (jsonb_typeof(p_selector -> 'manifest_ids') <> 'array' OR jsonb_array_length(p_selector -> 'manifest_ids') NOT BETWEEN 1 AND 200) THEN RAISE EXCEPTION 'retention action rejected: manifest_ids is an array of 1 to 200 ids' USING ERRCODE = '22023'; END IF;
    IF (p_selector ->> 'manifest_id') IS NULL AND (p_selector ->> 'source_id') IS NULL AND NOT (p_selector ? 'manifest_ids') THEN RAISE EXCEPTION 'retention action rejected: an evidence selector names a manifest_id, a source_id or manifest_ids' USING ERRCODE = '22023'; END IF;
    IF p_kind = 'customer_export' THEN
      IF coalesce(p_selector ->> 'classification_ceiling', '') NOT IN ('public', 'internal', 'confidential', 'restricted') THEN RAISE EXCEPTION 'retention action rejected: a customer export names its classification ceiling (public, internal, confidential, restricted)' USING ERRCODE = '22023'; END IF;
      IF coalesce(p_selector ->> 'destination', 'export') <> 'export' THEN RAISE EXCEPTION 'retention action rejected: the export destination is the export namespace of the vault (destination export)' USING ERRCODE = '22023'; END IF;
      -- B13 (D4; C3): the package's expiry — an interval spelled as a dueAfter between 1 hour and 1 year (absent: the record port's 30 days).
      IF (p_selector ? 'expires_after') AND NOT retention.admissible_export_expiry(p_selector ->> 'expires_after') THEN RAISE EXCEPTION 'retention action rejected: expires_after is between 1 hour and 1 year' USING ERRCODE = '22023'; END IF;
    END IF;
  END IF;
  INSERT INTO retention.actions_current (action_id, scope, tenant_id, domain_id, kind, target_kind, selector, schedule_id, retention_profile, opened_by, correlation_id)
  VALUES (p_action_id, 'DOMAIN', p_tenant, p_domain, p_kind, p_target_kind, CASE WHEN p_kind = 'customer_export' THEN p_selector || jsonb_build_object('destination', 'export') ELSE p_selector END, p_schedule_id, p_retention_profile, p_actor, p_correlation);
  PERFORM retention.event(p_action_id, p_tenant, p_domain, 'action.opened', p_actor, jsonb_build_object('kind', p_kind, 'target_kind', p_target_kind, 'selector', p_selector, 'schedule_id', p_schedule_id), p_correlation);
END $$ LANGUAGE plpgsql;

-- record_export_package (0070 §3) — its 12-argument form DROPPED (the capabilities file is its only caller) and declared with two more
-- parameters, p_archive_digest and p_signing_key_id (C5). 0070's body plus: the ONE instant v_at from which built_at and expires_at are
-- both taken (expires_at = v_at + the ACTION's selector.expires_after — the approved record — or 30 days); the scheme admission — /1
-- (eye-digest-chain/1) refused while the tenant has an active signing key (a package is never silently downgraded to the digest chain once
-- a key is declared), /2 (eye-customer-export/2) admitted when its key_id is the parameter and the tenant's active key, its algorithm
-- Ed25519 and its signature the base64 of 64 bytes — the SHAPE checked before the decode; the archive digest sha-256 hex; the three
-- recorded and returned (they travel in the execution row's evidence — C4). The signature block's other checks unchanged.
DROP FUNCTION retention.record_export_package(uuid,uuid,uuid,uuid,text,text,jsonb,int,int,bigint,uuid,uuid);
CREATE OR REPLACE FUNCTION retention.record_export_package(
  p_action_id uuid, p_tenant uuid, p_domain uuid, p_approval_id uuid, p_manifest_digest text, p_package_digest text, p_signature jsonb,
  p_object_count int, p_excluded_count int, p_byte_total bigint, p_archive_digest text, p_signing_key_id text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a retention.actions_current%ROWTYPE; i RECORD; m RECORD; v_evd uuid; v_obs uuid; v_prefix text; v_execute int; v_at timestamptz; v_expires timestamptz; v_scheme text; v_active text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.action.execute']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'export rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO a FROM retention.actions_current x WHERE x.action_id = p_action_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention execution rejected: % is not an action of this domain', p_action_id USING ERRCODE = '23503'; END IF;
  IF a.state <> 'executing' OR a.kind <> 'customer_export' THEN RAISE EXCEPTION 'export rejected: % is not an executing customer export', p_action_id USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM retention.approvals ap WHERE ap.approval_id = p_approval_id AND ap.action_id = p_action_id AND ap.scope_digest = a.scope_digest AND ap.revoked_at IS NULL AND ap.expires_at > clock_timestamp()) THEN
    RAISE EXCEPTION 'export rejected: approval % is not a live approval on the resolved scope of %', p_approval_id, p_action_id USING ERRCODE = '42501';
  END IF;
  IF p_manifest_digest !~ '^[0-9a-f]{64}$' OR p_package_digest !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'export rejected: the manifest and package digests are sha-256 hex' USING ERRCODE = '22023'; END IF;
  IF p_archive_digest IS NULL OR p_archive_digest !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'export rejected: the archive digest is sha-256 hex' USING ERRCODE = '22023'; END IF;
  -- B13 (D3; C5): the scheme. The tenant's active key decides which scheme a package built now may carry.
  v_scheme := p_signature ->> 'scheme';
  v_active := retention.active_export_signing_key(p_tenant);
  IF p_signature IS NULL OR jsonb_typeof(p_signature) <> 'object' OR v_scheme IS NULL OR v_scheme NOT IN ('eye-digest-chain/1', 'eye-customer-export/2') THEN
    RAISE EXCEPTION 'export rejected: the signature scheme is eye-digest-chain/1 or eye-customer-export/2' USING ERRCODE = '22023';
  END IF;
  IF v_scheme = 'eye-digest-chain/1' THEN
    IF v_active IS NOT NULL THEN RAISE EXCEPTION 'export rejected: the tenant has an active signing key; the package carries scheme eye-customer-export/2' USING ERRCODE = '22023'; END IF;
    IF p_signing_key_id IS NOT NULL THEN RAISE EXCEPTION 'export rejected: a digest-chain package names no signing key' USING ERRCODE = '22023'; END IF;
  ELSE
    IF p_signing_key_id IS NULL OR p_signature ->> 'key_id' IS DISTINCT FROM p_signing_key_id OR p_signing_key_id IS DISTINCT FROM v_active THEN
      RAISE EXCEPTION 'export rejected: a key-based signature names the tenant''s active signing key (% is not %)', coalesce(p_signature ->> 'key_id', '<none>'), coalesce(v_active, '<none>') USING ERRCODE = '22023';
    END IF;
    IF p_signature ->> 'algorithm' IS DISTINCT FROM 'Ed25519' THEN RAISE EXCEPTION 'export rejected: a key-based signature''s algorithm is Ed25519' USING ERRCODE = '22023'; END IF;
    IF (p_signature ->> 'signature') IS NULL OR (p_signature ->> 'signature') !~ '^[A-Za-z0-9+/]{86}==$' THEN RAISE EXCEPTION 'export rejected: a key-based signature is the base64 of 64 bytes' USING ERRCODE = '22023'; END IF;
    IF length(decode(p_signature ->> 'signature', 'base64')) <> 64 THEN RAISE EXCEPTION 'export rejected: a key-based signature is the base64 of 64 bytes' USING ERRCODE = '22023'; END IF;
  END IF;
  IF p_signature ->> 'package_digest' IS DISTINCT FROM p_package_digest
     OR p_signature #>> '{bound_to,scope_digest}' IS DISTINCT FROM a.scope_digest
     OR p_signature #>> '{bound_to,approval_id}' IS DISTINCT FROM p_approval_id::text
     OR p_signature #>> '{bound_to,action_id}' IS DISTINCT FROM p_action_id::text THEN
    RAISE EXCEPTION 'export rejected: the signature block binds the package digest to this action, its resolved scope and the live approval' USING ERRCODE = '22023';
  END IF;
  SELECT count(*)::int INTO v_execute FROM retention.scope_items si WHERE si.action_id = p_action_id AND si.item_kind = 'manifest' AND si.disposition = 'execute';
  IF p_object_count IS DISTINCT FROM v_execute THEN
    RAISE EXCEPTION 'export rejected: the package lists % object(s); the approved scope executes %', p_object_count, v_execute USING ERRCODE = '22023';
  END IF;
  -- A tombstoned manifest never enters a recorded package, and a package is never recorded for a source whose rights are no longer confirmed:
  -- begin_execution checked both before the build; the record checks them again at its own instant (the build reads up to 200 blobs).
  IF EXISTS (SELECT 1 FROM retention.scope_items si JOIN observation.blob_tombstones t ON t.manifest_id = si.ref::uuid
              WHERE si.action_id = p_action_id AND si.item_kind = 'manifest' AND si.disposition = 'execute') THEN
    RAISE EXCEPTION 'retention execution rejected (scope_changed): a manifest in the approved scope was tombstoned during the build — %; the scope is resolved again',
      (SELECT string_agg(si.ref, ', ') FROM retention.scope_items si JOIN observation.blob_tombstones t ON t.manifest_id = si.ref::uuid WHERE si.action_id = p_action_id AND si.item_kind = 'manifest' AND si.disposition = 'execute') USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM retention.scope_items si JOIN observation.blob_manifests bm ON bm.manifest_id = si.ref::uuid
              JOIN observation.source_contracts_current s ON s.source_id = bm.source_id AND s.contract_version = bm.contract_version
              WHERE si.action_id = p_action_id AND si.item_kind = 'manifest' AND si.disposition = 'execute' AND s.rights_state <> 'confirmed') THEN
    RAISE EXCEPTION 'retention execution rejected (rights_changed): the rights of a source in the approved scope are no longer confirmed at the record of the package; the scope is resolved again' USING ERRCODE = '22023';
  END IF;
  v_prefix := p_tenant::text || '/' || p_domain::text || '/' || p_action_id::text || '/';
  -- B13 (D4; C5): built_at and expires_at from ONE instant; the interval from the ACTION's selector (validated at the open, or at the schedule's declaration).
  v_at := clock_timestamp();
  v_expires := v_at + coalesce(NULLIF(a.selector ->> 'expires_after', '')::interval, interval '30 days');
  INSERT INTO retention.export_packages (action_id, scope, tenant_id, domain_id, destination, locator_prefix, scope_digest, approval_id, classification_ceiling, object_count, excluded_count, byte_total, manifest_digest, package_digest, signature, built_by, built_at, correlation_id, archive_digest, expires_at, signing_key_id)
  VALUES (p_action_id, 'DOMAIN', p_tenant, p_domain, 'export', v_prefix, a.scope_digest, p_approval_id, a.selector ->> 'classification_ceiling', p_object_count, coalesce(p_excluded_count, 0), p_byte_total, p_manifest_digest, p_package_digest, p_signature, p_actor, v_at, p_correlation, p_archive_digest, v_expires, p_signing_key_id);
  FOR i IN SELECT si.ref FROM retention.scope_items si WHERE si.action_id = p_action_id AND si.item_kind = 'manifest' AND si.disposition = 'execute' ORDER BY si.dependency_order LOOP
    SELECT bm.manifest_id, bm.source_id, bm.contract_version, bm.run_id, bm.content_digest, bm.locator INTO m FROM observation.blob_manifests bm WHERE bm.manifest_id = i.ref::uuid;
    SELECT o.object_id, (o.payload ->> 'obs_object_id')::uuid INTO v_evd, v_obs FROM objects.canonical_objects o
     WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.object_type = 'EVD' AND (o.payload ->> 'manifest_id')::uuid = m.manifest_id ORDER BY o.object_version DESC LIMIT 1;
    INSERT INTO observation.custody_events (event_id, scope, tenant_id, domain_id, manifest_id, obs_object_id, evd_object_id, source_id, contract_version, run_id, event, actor, content_digest, digest_verified, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, m.manifest_id, v_obs, v_evd, m.source_id, m.contract_version, m.run_id, 'custody.exported', 'principal:' || p_actor::text, m.content_digest, true,
            jsonb_build_object('action_id', p_action_id, 'package_digest', p_package_digest, 'destination', 'export', 'locator_prefix', v_prefix, 'file', m.manifest_id::text || '.bin'), p_correlation);
  END LOOP;
  PERFORM retention.event(p_action_id, p_tenant, p_domain, 'export.built', p_actor, jsonb_build_object('approval_id', p_approval_id, 'manifest_digest', p_manifest_digest, 'package_digest', p_package_digest, 'objects', p_object_count, 'excluded', coalesce(p_excluded_count, 0), 'bytes', p_byte_total, 'locator_prefix', v_prefix,
                                                                                              'archive_digest', p_archive_digest, 'signing_key_id', p_signing_key_id, 'scheme', v_scheme, 'expires_at', v_expires), p_correlation);
  RETURN jsonb_build_object('action_id', p_action_id, 'locator_prefix', v_prefix, 'package_digest', p_package_digest, 'manifest_digest', p_manifest_digest, 'objects', p_object_count, 'excluded', coalesce(p_excluded_count, 0), 'bytes', p_byte_total,
                            'archive_digest', p_archive_digest, 'signing_key_id', p_signing_key_id, 'expires_at', v_expires);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.record_export_package(uuid,uuid,uuid,uuid,text,text,jsonb,int,int,bigint,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.record_export_package(uuid,uuid,uuid,uuid,text,text,jsonb,int,int,bigint,text,text,uuid,uuid) TO eye_commit;

-- THE DOWNLOAD's record (D7; retention.export.download — the stewards, the authority, the administrators and the auditor; audited): the
-- controller rebuilt the tar from the package's files and compared its digest with the record before serving it; this port writes the
-- event export.downloaded on the action with the reader and the digest served — through a governed WRITE, the bytes answered beside it.
-- Its own re-checks (the package present, not revoked, not expired, the digest the recorded one) guard a caller that skipped the read.
-- SECURITY DEFINER with its own assert_authority, calling retention.event internally (C18).
CREATE OR REPLACE FUNCTION retention.record_export_download(p_action_id uuid, p_tenant uuid, p_domain uuid, p_archive_digest text, p_actor uuid, p_correlation uuid)
RETURNS void
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x retention.export_packages%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.export.download']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'export rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO x FROM retention.export_packages e WHERE e.action_id = p_action_id AND e.tenant_id = p_tenant AND e.domain_id = p_domain FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'export rejected: % has no export package in this domain', p_action_id USING ERRCODE = '23503'; END IF;
  IF x.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'export rejected: the package of % was revoked at %', p_action_id, x.revoked_at USING ERRCODE = '22023'; END IF;
  IF x.expires_at IS NOT NULL AND x.expires_at <= clock_timestamp() THEN RAISE EXCEPTION 'export rejected: the package of % expired at %', p_action_id, x.expires_at USING ERRCODE = '22023'; END IF;
  IF p_archive_digest IS NULL OR p_archive_digest IS DISTINCT FROM x.archive_digest THEN RAISE EXCEPTION 'export rejected: the archive served (%) is not the recorded archive of % (%)', coalesce(p_archive_digest, '<none>'), p_action_id, coalesce(x.archive_digest, '<none — built before B13>') USING ERRCODE = '22023'; END IF;
  PERFORM retention.event(p_action_id, p_tenant, p_domain, 'export.downloaded', p_actor,
    jsonb_build_object('reader', p_actor, 'archive_digest', p_archive_digest, 'package_digest', x.package_digest, 'manifest_digest', x.manifest_digest, 'signing_key_id', x.signing_key_id, 'scheme', x.signature ->> 'scheme', 'expires_at', x.expires_at, 'bytes', x.byte_total), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.record_export_download(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.record_export_download(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

-- ============================================================
-- §3 the destinations
-- ============================================================
-- A DESTINATION is a declared exchange party of the domain (D5): a TRANSFER STATION — an absolute directory path outside the vault's
-- roots (the controller realpaths it and re-checks the containment at declaration and before every write and read — C13) the product
-- writes packages into (package.tar, package.sig, delivery.json under <endpoint>/<tenant>/<domain>/<action>/) and reads receipt.json
-- from: the disconnected path of ES-53-004 and NZ-20 — or an https endpoint, the production kind, delivered by the delivery egress with
-- its bearer credential BY REFERENCE (EYE_DST_<NAME>: the name recorded, the value carried at egress from the process environment,
-- never recorded). The recipient names the exchange identity — who receives; the purpose why. The destination key is unique per domain
-- among the ACTIVE destinations (a retired key may be declared again as a new row). Retired once, the row kept.
CREATE TABLE retention.export_destinations (
  destination_id   uuid PRIMARY KEY,
  scope            text NOT NULL,
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  destination_key  text NOT NULL CHECK (destination_key ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  kind             text NOT NULL CHECK (kind IN ('transfer_station', 'https')),
  endpoint         text NOT NULL,
  credential_ref   text CHECK (credential_ref IS NULL OR credential_ref ~ '^EYE_DST_[A-Z0-9_]{1,64}$'),
  recipient        text NOT NULL CHECK (length(btrim(recipient)) >= 1),
  purpose          text NOT NULL CHECK (length(btrim(purpose)) >= 1),
  declared_by      uuid NOT NULL,
  declared_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  retired_by       uuid,
  retired_at       timestamptz,
  retire_reason    text,
  correlation_id   uuid NOT NULL,
  CONSTRAINT rds_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT rds_endpoint CHECK ((kind = 'transfer_station' AND endpoint ~ '^/') OR (kind = 'https' AND endpoint ~ '^https://')),
  CONSTRAINT rds_credential CHECK (credential_ref IS NULL OR kind = 'https'),
  CONSTRAINT rds_retire_pair CHECK ((retired_by IS NULL) = (retired_at IS NULL) AND (retired_at IS NULL OR length(btrim(retire_reason)) >= 8))
);
CREATE UNIQUE INDEX rds_active_key ON retention.export_destinations (tenant_id, domain_id, destination_key) WHERE retired_at IS NULL;
-- The retirement is the ONE change a destination row takes, once.
CREATE OR REPLACE FUNCTION retention.export_destinations_retire_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'table retention.export_destinations is append-only (ADR-P0-07): DELETE prohibited' USING ERRCODE = '42501'; END IF;
  IF OLD.retired_at IS NOT NULL OR NEW.retired_at IS NULL
     OR NEW.destination_id IS DISTINCT FROM OLD.destination_id OR NEW.scope IS DISTINCT FROM OLD.scope OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.domain_id IS DISTINCT FROM OLD.domain_id
     OR NEW.destination_key IS DISTINCT FROM OLD.destination_key OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.endpoint IS DISTINCT FROM OLD.endpoint OR NEW.credential_ref IS DISTINCT FROM OLD.credential_ref
     OR NEW.recipient IS DISTINCT FROM OLD.recipient OR NEW.purpose IS DISTINCT FROM OLD.purpose OR NEW.declared_by IS DISTINCT FROM OLD.declared_by OR NEW.declared_at IS DISTINCT FROM OLD.declared_at
     OR NEW.correlation_id IS DISTINCT FROM OLD.correlation_id THEN
    RAISE EXCEPTION 'an export destination is retired once; nothing else about it changes' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rds_retire_only BEFORE UPDATE OR DELETE ON retention.export_destinations FOR EACH ROW EXECUTE FUNCTION retention.export_destinations_retire_only();
ALTER TABLE retention.export_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention.export_destinations FORCE ROW LEVEL SECURITY;
CREATE POLICY retention_isolation ON retention.export_destinations
  USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
REVOKE ALL ON retention.export_destinations FROM PUBLIC;
GRANT SELECT ON retention.export_destinations TO eye_app, eye_commit;

-- THE DECLARATION (retention.destination.declare — the schedule declare rule's holders; human-gated): the key's shape and its uniqueness
-- among the domain's active destinations (under a per-key transaction lock; the partial unique index is the backstop), the kind, the
-- endpoint's shape by kind (an absolute path for a transfer station — its existence and its position outside the vault's roots are
-- the controller's checks; an https URL for https), the credential reference's name for an https destination only. Returns the row.
CREATE OR REPLACE FUNCTION retention.declare_export_destination(
  p_destination_id uuid, p_tenant uuid, p_domain uuid, p_destination_key text, p_kind text, p_endpoint text, p_credential_ref text, p_recipient text, p_purpose text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE d retention.export_destinations%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.destination.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'export destination rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_destination_key IS NULL OR p_destination_key !~ '^[a-z0-9][a-z0-9-]{1,63}$' THEN RAISE EXCEPTION 'export destination rejected: the destination key is 2 to 64 characters of a-z, 0-9 and -, starting with a letter or a digit' USING ERRCODE = '22023'; END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('transfer_station', 'https') THEN RAISE EXCEPTION 'export destination rejected: the kind is transfer_station or https' USING ERRCODE = '22023'; END IF;
  IF p_kind = 'transfer_station' AND (p_endpoint IS NULL OR p_endpoint !~ '^/' OR length(p_endpoint) > 4096) THEN RAISE EXCEPTION 'export destination rejected: a transfer station''s endpoint is an absolute directory path' USING ERRCODE = '22023'; END IF;
  IF p_kind = 'https' AND (p_endpoint IS NULL OR p_endpoint !~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[^[:space:]]*)?$') THEN RAISE EXCEPTION 'export destination rejected: an https destination''s endpoint is an https:// URL' USING ERRCODE = '22023'; END IF;
  IF p_credential_ref IS NOT NULL AND p_kind <> 'https' THEN RAISE EXCEPTION 'export destination rejected: a credential reference is declared for an https destination only' USING ERRCODE = '22023'; END IF;
  IF p_credential_ref IS NOT NULL AND p_credential_ref !~ '^EYE_DST_[A-Z0-9_]{1,64}$' THEN RAISE EXCEPTION 'export destination rejected: the credential reference is EYE_DST_<NAME> (the value stays in the deployment; it is never recorded)' USING ERRCODE = '22023'; END IF;
  IF coalesce(length(btrim(p_recipient)), 0) < 1 THEN RAISE EXCEPTION 'export destination rejected: the recipient names who receives' USING ERRCODE = '22023'; END IF;
  IF coalesce(length(btrim(p_purpose)), 0) < 1 THEN RAISE EXCEPTION 'export destination rejected: the purpose says why the destination receives' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('retention.export_destinations:' || p_tenant::text || ':' || p_domain::text || ':' || p_destination_key, 0));
  IF EXISTS (SELECT 1 FROM retention.export_destinations x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.destination_key = p_destination_key AND x.retired_at IS NULL) THEN
    RAISE EXCEPTION 'export destination rejected: % is already declared in this domain (retire it to declare it again)', p_destination_key USING ERRCODE = '22023';
  END IF;
  INSERT INTO retention.export_destinations (destination_id, scope, tenant_id, domain_id, destination_key, kind, endpoint, credential_ref, recipient, purpose, declared_by, declared_at, correlation_id)
  VALUES (p_destination_id, 'DOMAIN', p_tenant, p_domain, p_destination_key, p_kind, p_endpoint, p_credential_ref, p_recipient, p_purpose, p_actor, clock_timestamp(), p_correlation) RETURNING * INTO d;
  RETURN to_jsonb(d);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.declare_export_destination(uuid,uuid,uuid,text,text,text,text,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.declare_export_destination(uuid,uuid,uuid,text,text,text,text,text,text,uuid,uuid) TO eye_commit;

-- THE RETIREMENT (retention.destination.retire): once, with a reason; the row kept; its deliveries stay recorded. Returns the row after.
CREATE OR REPLACE FUNCTION retention.retire_export_destination(p_destination_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE d retention.export_destinations%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.destination.retire']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'export destination rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'export destination rejected: a reason of 8+ characters' USING ERRCODE = '22023'; END IF;
  SELECT * INTO d FROM retention.export_destinations x WHERE x.destination_id = p_destination_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'export destination rejected: no such destination % in this domain', p_destination_id USING ERRCODE = '23503'; END IF;
  IF d.retired_at IS NOT NULL THEN RAISE EXCEPTION 'export destination rejected: % is retired', d.destination_key USING ERRCODE = '22023'; END IF;
  UPDATE retention.export_destinations SET retired_at = clock_timestamp(), retired_by = p_actor, retire_reason = p_reason WHERE destination_id = p_destination_id RETURNING * INTO d;
  RETURN to_jsonb(d);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.retire_export_destination(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.retire_export_destination(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

-- ============================================================
-- §4 the deliveries
-- ============================================================
-- A DELIVERY (D6) is recorded whatever came of it — delivered (the package reached the destination; a transfer station's recipient answers
-- later), acknowledged (the receipt names the same archive and package digests and verified true), mismatched (it names other digests or
-- verified false: the exchange DENIED, the request and the evidence preserved — DP-47-005) or failed (with its class; a FAILED delivery
-- is a recorded fact, not a rolled-back one). Append-only except the acknowledgement: a delivered row moves once to acknowledged or
-- mismatched with the receipt, its digest and the instant; nothing else about a row changes. The attempt is 1 + the count of this
-- action's deliveries to this destination, computed under the action's row lock and the action's delivery lock (C6) and unique.
CREATE TABLE retention.export_deliveries (
  delivery_id     uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  action_id       uuid NOT NULL,
  destination_id  uuid NOT NULL,
  attempt         int NOT NULL CHECK (attempt >= 1),
  state           text NOT NULL CHECK (state IN ('delivered', 'acknowledged', 'failed', 'mismatched')),
  archive_digest  text NOT NULL CHECK (archive_digest ~ '^[0-9a-f]{64}$'),
  package_digest  text NOT NULL CHECK (package_digest ~ '^[0-9a-f]{64}$'),
  signing_key_id  text,
  receipt         jsonb CHECK (receipt IS NULL OR jsonb_typeof(receipt) = 'object'),
  receipt_digest  text CHECK (receipt_digest IS NULL OR receipt_digest ~ '^[0-9a-f]{64}$'),
  failure_class   text CHECK (failure_class IS NULL OR failure_class IN ('destination_retired', 'credential_unbound', 'egress_refused', 'transport', 'receipt_invalid', 'write_failed')),
  delivered_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  acknowledged_at timestamptz,
  delivered_by    uuid NOT NULL,
  correlation_id  uuid NOT NULL,
  CONSTRAINT rxd_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT rxd_attempt UNIQUE (action_id, destination_id, attempt),
  CONSTRAINT rxd_failure CHECK ((state = 'failed') = (failure_class IS NOT NULL)),
  CONSTRAINT rxd_receipt CHECK ((receipt IS NULL) = (receipt_digest IS NULL) AND (state = 'delivered' OR receipt IS NOT NULL)),
  CONSTRAINT rxd_acknowledged CHECK ((state IN ('acknowledged', 'mismatched')) = (acknowledged_at IS NOT NULL))
);
CREATE INDEX rxd_action ON retention.export_deliveries (action_id, delivered_at);
CREATE OR REPLACE FUNCTION retention.export_deliveries_acknowledge_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'table retention.export_deliveries is append-only (ADR-P0-07): DELETE prohibited' USING ERRCODE = '42501'; END IF;
  IF OLD.state <> 'delivered' OR NEW.state NOT IN ('acknowledged', 'mismatched') OR OLD.acknowledged_at IS NOT NULL OR NEW.acknowledged_at IS NULL OR NEW.receipt IS NULL
     OR NEW.delivery_id IS DISTINCT FROM OLD.delivery_id OR NEW.scope IS DISTINCT FROM OLD.scope OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.domain_id IS DISTINCT FROM OLD.domain_id
     OR NEW.action_id IS DISTINCT FROM OLD.action_id OR NEW.destination_id IS DISTINCT FROM OLD.destination_id OR NEW.attempt IS DISTINCT FROM OLD.attempt
     OR NEW.archive_digest IS DISTINCT FROM OLD.archive_digest OR NEW.package_digest IS DISTINCT FROM OLD.package_digest OR NEW.signing_key_id IS DISTINCT FROM OLD.signing_key_id
     OR NEW.failure_class IS DISTINCT FROM OLD.failure_class OR NEW.delivered_at IS DISTINCT FROM OLD.delivered_at OR NEW.delivered_by IS DISTINCT FROM OLD.delivered_by
     OR NEW.correlation_id IS DISTINCT FROM OLD.correlation_id THEN
    RAISE EXCEPTION 'a delivery is acknowledged once (acknowledged or mismatched, with the receipt); nothing else about it changes' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rxd_acknowledge_only BEFORE UPDATE OR DELETE ON retention.export_deliveries FOR EACH ROW EXECUTE FUNCTION retention.export_deliveries_acknowledge_only();
ALTER TABLE retention.export_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention.export_deliveries FORCE ROW LEVEL SECURITY;
CREATE POLICY retention_isolation ON retention.export_deliveries
  USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
REVOKE ALL ON retention.export_deliveries FROM PUBLIC;
GRANT SELECT ON retention.export_deliveries TO eye_app, eye_commit;

-- The action's DELIVERY lock (C6): a transaction-scoped advisory lock, held from begin_export_delivery to the commit, under which the attempt
-- is computed and the row recorded — the key as 0071 §1's lock keys are made.
CREATE OR REPLACE FUNCTION retention.lock_key_export_deliveries(p_action_id uuid) RETURNS bigint
IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT hashtextextended('retention.export_deliveries:' || p_action_id::text, 0);
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION retention.lock_key_export_deliveries(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.lock_key_export_deliveries(uuid) TO eye_app, eye_commit;

-- THE BEGINNING (retention.export.deliver — the retention authority and the administrators; human-gated): THE GATES BEFORE ANYTHING
-- LEAVES — the action a customer export in state VERIFIED (the product's own verification passed; an executed one is refused: verify the
-- package first), its package present, not revoked, not expired; the destination of this domain and active; the rights of every exported
-- source still confirmed (rights_changed — the same prefix the execute route maps); the signing-key gate (C8): a package carrying no
-- key-based signature while the tenant now has an active key is refused (build the export again) — a package signed by a key retired
-- since IS deliverable, the key's current state returned for the receipt file. The action row is locked FOR UPDATE and the action's
-- delivery lock taken BEFORE the attempt is computed (C6). Allocates the delivery id; returns it, the attempt, the package row, the
-- destination row (endpoint, kind, credential_ref — the NAME — recipient, purpose) and the signing key (key_id, state, retired_at,
-- public_key_pem, purpose; null for a digest-chain package) for the executor, which runs INSIDE the same governed write and records the
-- outcome through record_export_delivery.
CREATE OR REPLACE FUNCTION retention.begin_export_delivery(p_action_id uuid, p_tenant uuid, p_domain uuid, p_destination_id uuid, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a retention.actions_current%ROWTYPE; x retention.export_packages%ROWTYPE; dst retention.export_destinations%ROWTYPE; k retention.export_signing_keys%ROWTYPE; v_active text; v_attempt int; v_key jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.export.deliver', 'retention.export.acknowledge']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'retention delivery rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO a FROM retention.actions_current y WHERE y.action_id = p_action_id AND y.tenant_id = p_tenant AND y.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention delivery rejected: % has no export package in this domain', p_action_id USING ERRCODE = '23503'; END IF;
  IF a.kind <> 'customer_export' THEN RAISE EXCEPTION 'retention delivery rejected: % is a %, not a customer export', p_action_id, a.kind USING ERRCODE = '22023'; END IF;
  SELECT * INTO x FROM retention.export_packages e WHERE e.action_id = p_action_id AND e.tenant_id = p_tenant AND e.domain_id = p_domain FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention delivery rejected: % has no export package in this domain', p_action_id USING ERRCODE = '23503'; END IF;
  IF a.state <> 'verified' THEN RAISE EXCEPTION 'retention delivery rejected: % is %, not verified — verify the package first', p_action_id, a.state USING ERRCODE = '22023'; END IF;
  IF x.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'retention delivery rejected: the package of % was revoked at %', p_action_id, x.revoked_at USING ERRCODE = '22023'; END IF;
  IF x.expires_at IS NOT NULL AND x.expires_at <= clock_timestamp() THEN RAISE EXCEPTION 'retention delivery rejected: the package of % expired at %', p_action_id, x.expires_at USING ERRCODE = '22023'; END IF;
  IF x.archive_digest IS NULL THEN RAISE EXCEPTION 'retention delivery rejected: the package of % was built before its archive digest was recorded (B13); build the export again', p_action_id USING ERRCODE = '22023'; END IF;
  SELECT * INTO dst FROM retention.export_destinations z WHERE z.destination_id = p_destination_id AND z.tenant_id = p_tenant AND z.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention delivery rejected: no such destination % in this domain', p_destination_id USING ERRCODE = '23503'; END IF;
  IF dst.retired_at IS NOT NULL THEN RAISE EXCEPTION 'retention delivery rejected: destination % is retired', dst.destination_key USING ERRCODE = '22023'; END IF;
  -- The rights of every exported source, re-checked at the delivery as at the build (0070 §3): a withdrawal since refuses the exchange.
  IF EXISTS (SELECT 1 FROM retention.scope_items si JOIN observation.blob_manifests bm ON bm.manifest_id = si.ref::uuid
              JOIN observation.source_contracts_current s ON s.source_id = bm.source_id AND s.contract_version = bm.contract_version
              WHERE si.action_id = p_action_id AND si.item_kind = 'manifest' AND si.disposition = 'execute' AND s.rights_state <> 'confirmed') THEN
    RAISE EXCEPTION 'retention delivery rejected (rights_changed): the rights of a source in the exported scope are no longer confirmed; the package is not delivered' USING ERRCODE = '22023';
  END IF;
  -- C8: the only signing-key gate at delivery.
  v_active := retention.active_export_signing_key(p_tenant);
  IF x.signing_key_id IS NULL AND v_active IS NOT NULL THEN
    RAISE EXCEPTION 'retention delivery rejected: the package carries no key-based signature and the tenant now has an active key; build the export again' USING ERRCODE = '22023';
  END IF;
  IF x.signing_key_id IS NOT NULL THEN
    SELECT * INTO k FROM retention.export_signing_keys y WHERE y.tenant_id = p_tenant AND y.key_id = x.signing_key_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'retention delivery rejected: the package''s signing key % is not recorded for this tenant', x.signing_key_id USING ERRCODE = '22023'; END IF;
    v_key := jsonb_build_object('key_id', k.key_id, 'state', CASE WHEN k.retired_at IS NULL THEN 'active' ELSE 'retired' END, 'retired_at', k.retired_at, 'public_key_pem', k.public_key_pem, 'purpose', k.purpose, 'algorithm', k.algorithm);
  END IF;
  -- C6: the attempt under the action's delivery lock (transaction-scoped; record_export_delivery requires it).
  PERFORM pg_advisory_xact_lock(retention.lock_key_export_deliveries(p_action_id));
  SELECT 1 + count(*)::int INTO v_attempt FROM retention.export_deliveries e WHERE e.action_id = p_action_id AND e.destination_id = p_destination_id;
  RETURN jsonb_build_object('delivery_id', gen_random_uuid(), 'attempt', v_attempt, 'package', to_jsonb(x), 'destination', to_jsonb(dst), 'signing_key', v_key);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.begin_export_delivery(uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.begin_export_delivery(uuid,uuid,uuid,uuid,uuid,uuid) TO eye_commit;

-- THE RECORD: the delivery row with what the destination answered (the receipt as received, or the failure) and the action event —
-- export.delivered | export.delivery_failed | export.acknowledged (the response already acknowledges) | export.mismatched (both sides
-- named) — and, for a delivery that reached the destination (delivered, acknowledged), custody.delivered per exported manifest (D9).
-- The digests and the key are the package's recorded ones; the attempt is the next one (computed by begin under the lock this port
-- requires — fail closed for a caller that bypassed it). Returns the row.
CREATE OR REPLACE FUNCTION retention.record_export_delivery(
  p_delivery_id uuid, p_action_id uuid, p_tenant uuid, p_domain uuid, p_destination_id uuid, p_attempt int, p_state text, p_archive_digest text, p_package_digest text, p_signing_key_id text,
  p_receipt jsonb, p_receipt_digest text, p_failure_class text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a retention.actions_current%ROWTYPE; x retention.export_packages%ROWTYPE; dst retention.export_destinations%ROWTYPE; d retention.export_deliveries%ROWTYPE; i RECORD; m RECORD; v_evd uuid; v_obs uuid; v_at timestamptz; v_next int; v_event text; v_details jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.export.deliver', 'retention.export.acknowledge']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'retention delivery rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_delivery_id IS NULL THEN RAISE EXCEPTION 'retention delivery rejected: the delivery id is the one begin_export_delivery allocated' USING ERRCODE = '22023'; END IF;
  IF p_state IS NULL OR p_state NOT IN ('delivered', 'acknowledged', 'failed', 'mismatched') THEN RAISE EXCEPTION 'retention delivery rejected: the state is delivered, acknowledged, failed or mismatched' USING ERRCODE = '22023'; END IF;
  IF (p_state = 'failed') <> (p_failure_class IS NOT NULL) OR (p_failure_class IS NOT NULL AND p_failure_class NOT IN ('destination_retired', 'credential_unbound', 'egress_refused', 'transport', 'receipt_invalid', 'write_failed')) THEN
    RAISE EXCEPTION 'retention delivery rejected: a failed delivery names its failure class (destination_retired, credential_unbound, egress_refused, transport, receipt_invalid or write_failed) and no other delivery does' USING ERRCODE = '22023';
  END IF;
  IF p_receipt IS NOT NULL AND jsonb_typeof(p_receipt) <> 'object' THEN RAISE EXCEPTION 'retention delivery rejected: the receipt is a JSON object' USING ERRCODE = '22023'; END IF;
  IF (p_receipt IS NULL) <> (p_receipt_digest IS NULL) OR (p_receipt_digest IS NOT NULL AND p_receipt_digest !~ '^[0-9a-f]{64}$') THEN RAISE EXCEPTION 'retention delivery rejected: a receipt is recorded with the sha-256 hex of its canonical JSON' USING ERRCODE = '22023'; END IF;
  IF p_state <> 'delivered' AND p_receipt IS NULL THEN RAISE EXCEPTION 'retention delivery rejected: an acknowledged, mismatched or failed delivery records what the destination answered, or the failure' USING ERRCODE = '22023'; END IF;
  SELECT * INTO a FROM retention.actions_current y WHERE y.action_id = p_action_id AND y.tenant_id = p_tenant AND y.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention delivery rejected: % has no export package in this domain', p_action_id USING ERRCODE = '23503'; END IF;
  SELECT * INTO x FROM retention.export_packages e WHERE e.action_id = p_action_id AND e.tenant_id = p_tenant AND e.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention delivery rejected: % has no export package in this domain', p_action_id USING ERRCODE = '23503'; END IF;
  IF p_archive_digest IS DISTINCT FROM x.archive_digest OR p_package_digest IS DISTINCT FROM x.package_digest OR p_signing_key_id IS DISTINCT FROM x.signing_key_id THEN
    RAISE EXCEPTION 'retention delivery rejected: a delivery records the package''s recorded archive digest, package digest and signing key' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO dst FROM retention.export_destinations z WHERE z.destination_id = p_destination_id AND z.tenant_id = p_tenant AND z.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention delivery rejected: no such destination % in this domain', p_destination_id USING ERRCODE = '23503'; END IF;
  IF NOT retention.holds_advisory(retention.lock_key_export_deliveries(p_action_id), 'ExclusiveLock') THEN
    RAISE EXCEPTION 'retention delivery rejected: the deliveries of % are not serialised by this transaction (begin_export_delivery takes the action''s delivery lock; a delivery is recorded only under it)', p_action_id USING ERRCODE = '55P03';
  END IF;
  SELECT 1 + count(*)::int INTO v_next FROM retention.export_deliveries e WHERE e.action_id = p_action_id AND e.destination_id = p_destination_id;
  IF p_attempt IS DISTINCT FROM v_next THEN RAISE EXCEPTION 'retention delivery rejected: attempt % is not the next attempt (%) of % to %', p_attempt, v_next, p_action_id, dst.destination_key USING ERRCODE = '22023'; END IF;
  v_at := clock_timestamp();
  INSERT INTO retention.export_deliveries (delivery_id, scope, tenant_id, domain_id, action_id, destination_id, attempt, state, archive_digest, package_digest, signing_key_id, receipt, receipt_digest, failure_class, delivered_at, acknowledged_at, delivered_by, correlation_id)
  VALUES (p_delivery_id, 'DOMAIN', p_tenant, p_domain, p_action_id, p_destination_id, p_attempt, p_state, p_archive_digest, p_package_digest, p_signing_key_id, p_receipt, p_receipt_digest, p_failure_class, v_at,
          CASE WHEN p_state IN ('acknowledged', 'mismatched') THEN v_at END, p_actor, p_correlation) RETURNING * INTO d;
  v_event := CASE p_state WHEN 'delivered' THEN 'export.delivered' WHEN 'acknowledged' THEN 'export.acknowledged' WHEN 'mismatched' THEN 'export.mismatched' ELSE 'export.delivery_failed' END;
  v_details := jsonb_build_object('delivery_id', p_delivery_id, 'destination_id', p_destination_id, 'destination_key', dst.destination_key, 'kind', dst.kind, 'recipient', dst.recipient, 'attempt', p_attempt, 'state', p_state,
                                  'archive_digest', p_archive_digest, 'package_digest', p_package_digest, 'signing_key_id', p_signing_key_id, 'receipt_digest', p_receipt_digest, 'failure_class', p_failure_class);
  IF p_state = 'failed' THEN v_details := v_details || jsonb_build_object('failure', p_receipt); END IF;
  IF p_state = 'mismatched' THEN
    v_details := v_details || jsonb_build_object('expected', jsonb_build_object('archive_digest', p_archive_digest, 'package_digest', p_package_digest),
                                                 'received', jsonb_build_object('archive_digest', p_receipt ->> 'archive_digest', 'package_digest', p_receipt ->> 'package_digest', 'verified', p_receipt -> 'verified'));
  END IF;
  PERFORM retention.event(p_action_id, p_tenant, p_domain, v_event, p_actor, v_details, p_correlation);
  IF p_state IN ('delivered', 'acknowledged') THEN
    FOR i IN SELECT si.ref FROM retention.scope_items si WHERE si.action_id = p_action_id AND si.item_kind = 'manifest' AND si.disposition = 'execute' ORDER BY si.dependency_order LOOP
      SELECT bm.manifest_id, bm.source_id, bm.contract_version, bm.run_id, bm.content_digest, bm.locator INTO m FROM observation.blob_manifests bm WHERE bm.manifest_id = i.ref::uuid;
      SELECT o.object_id, (o.payload ->> 'obs_object_id')::uuid INTO v_evd, v_obs FROM objects.canonical_objects o
       WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.object_type = 'EVD' AND (o.payload ->> 'manifest_id')::uuid = m.manifest_id ORDER BY o.object_version DESC LIMIT 1;
      INSERT INTO observation.custody_events (event_id, scope, tenant_id, domain_id, manifest_id, obs_object_id, evd_object_id, source_id, contract_version, run_id, event, actor, content_digest, digest_verified, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, m.manifest_id, v_obs, v_evd, m.source_id, m.contract_version, m.run_id, 'custody.delivered', 'principal:' || p_actor::text, m.content_digest, true,
              jsonb_build_object('action_id', p_action_id, 'delivery_id', p_delivery_id, 'destination_key', dst.destination_key, 'recipient', dst.recipient, 'state', p_state, 'attempt', p_attempt, 'archive_digest', p_archive_digest, 'file', m.manifest_id::text || '.bin'), p_correlation);
    END LOOP;
  END IF;
  RETURN to_jsonb(d);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.record_export_delivery(uuid,uuid,uuid,uuid,uuid,int,text,text,text,text,jsonb,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.record_export_delivery(uuid,uuid,uuid,uuid,uuid,int,text,text,text,text,jsonb,text,text,uuid,uuid) TO eye_commit;

-- THE ACKNOWLEDGEMENT (retention.export.acknowledge — the same holders; human-gated; the collect act reads receipt.json from the transfer
-- station, the acknowledge act takes a receipt presented out of band): a DELIVERED row moves once — to acknowledged when the receipt names
-- the same archive_digest AND package_digest and verified true; to mismatched when it names other digests or verified false (the exchange
-- DENIED, the request and evidence preserved — DP-47-005; the event carries both sides). A row not delivered is refused (409). A receipt
-- naming ANOTHER delivery is refused, the row untouched (C7: a stale receipt.json of an earlier attempt is refused by that binding); a
-- receipt without a delivery_id is admitted (an out-of-band receipt — the collect act requires the id before calling). Returns the row after.
CREATE OR REPLACE FUNCTION retention.acknowledge_export_delivery(p_delivery_id uuid, p_tenant uuid, p_domain uuid, p_receipt jsonb, p_receipt_digest text, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE d retention.export_deliveries%ROWTYPE; dst retention.export_destinations%ROWTYPE; v_state text; v_at timestamptz; v_details jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.export.deliver', 'retention.export.acknowledge']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'retention delivery rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_receipt IS NULL OR jsonb_typeof(p_receipt) <> 'object' THEN RAISE EXCEPTION 'retention delivery rejected: the receipt is a JSON object' USING ERRCODE = '22023'; END IF;
  IF p_receipt_digest IS NULL OR p_receipt_digest !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'retention delivery rejected: a receipt is recorded with the sha-256 hex of its canonical JSON' USING ERRCODE = '22023'; END IF;
  SELECT * INTO d FROM retention.export_deliveries e WHERE e.delivery_id = p_delivery_id AND e.tenant_id = p_tenant AND e.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention delivery rejected: no such delivery % in this domain', p_delivery_id USING ERRCODE = '23503'; END IF;
  IF d.state <> 'delivered' THEN RAISE EXCEPTION 'retention delivery rejected: delivery % is not delivered — it is %; only a delivered delivery is acknowledged', p_delivery_id, d.state USING ERRCODE = '22023'; END IF;
  IF (p_receipt ? 'delivery_id') AND (p_receipt ->> 'delivery_id') IS DISTINCT FROM p_delivery_id::text THEN
    RAISE EXCEPTION 'retention delivery rejected: the receipt names delivery %, not %', coalesce(p_receipt ->> 'delivery_id', '<null>'), p_delivery_id USING ERRCODE = '22023';
  END IF;
  SELECT * INTO dst FROM retention.export_destinations z WHERE z.destination_id = d.destination_id;
  v_state := CASE WHEN (p_receipt ->> 'archive_digest') = d.archive_digest AND (p_receipt ->> 'package_digest') = d.package_digest AND (p_receipt -> 'verified') = 'true'::jsonb THEN 'acknowledged' ELSE 'mismatched' END;
  v_at := clock_timestamp();
  UPDATE retention.export_deliveries SET state = v_state, receipt = p_receipt, receipt_digest = p_receipt_digest, acknowledged_at = v_at WHERE delivery_id = p_delivery_id RETURNING * INTO d;
  v_details := jsonb_build_object('delivery_id', p_delivery_id, 'destination_id', d.destination_id, 'destination_key', dst.destination_key, 'recipient', dst.recipient, 'attempt', d.attempt, 'state', v_state,
                                  'archive_digest', d.archive_digest, 'package_digest', d.package_digest, 'signing_key_id', d.signing_key_id, 'receipt_digest', p_receipt_digest, 'receipt_id', p_receipt ->> 'receipt_id', 'receipt_recipient', p_receipt ->> 'recipient');
  IF v_state = 'mismatched' THEN
    v_details := v_details || jsonb_build_object('expected', jsonb_build_object('archive_digest', d.archive_digest, 'package_digest', d.package_digest),
                                                 'received', jsonb_build_object('archive_digest', p_receipt ->> 'archive_digest', 'package_digest', p_receipt ->> 'package_digest', 'verified', p_receipt -> 'verified'));
  END IF;
  PERFORM retention.event(d.action_id, p_tenant, p_domain, CASE WHEN v_state = 'acknowledged' THEN 'export.acknowledged' ELSE 'export.mismatched' END, p_actor, v_details, p_correlation);
  RETURN to_jsonb(d);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.acknowledge_export_delivery(uuid,uuid,uuid,jsonb,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.acknowledge_export_delivery(uuid,uuid,uuid,jsonb,text,uuid,uuid) TO eye_commit;

-- ============================================================
-- §5 revoke_export re-declared verbatim: a revoked package's deliveries stay recorded
-- ============================================================
-- 0070 §3's body, unchanged. A revocation records; it sends NOTHING to a destination: the recipient's copy is out of the product's custody,
-- the revocation is recorded on the package row and the read route says so, the deliveries the package had stay on the ledger as the
-- facts they are — a revocation NOTICE to the destination is recorded honestly as remaining. A revoked package is refused by the download
-- and by begin_export_delivery.
CREATE OR REPLACE FUNCTION retention.revoke_export(p_action_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x retention.export_packages%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.export.revoke']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'retention revocation rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'retention revocation rejected: a reason of 8+ characters' USING ERRCODE = '22023'; END IF;
  SELECT * INTO x FROM retention.export_packages e WHERE e.action_id = p_action_id AND e.tenant_id = p_tenant AND e.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention revocation rejected: % has no export package in this domain', p_action_id USING ERRCODE = '23503'; END IF;
  IF x.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'retention revocation rejected: the package of % was revoked at %', p_action_id, x.revoked_at USING ERRCODE = '22023'; END IF;
  UPDATE retention.export_packages SET revoked_by = p_actor, revoked_at = clock_timestamp(), revoke_reason = p_reason WHERE action_id = p_action_id;
  PERFORM retention.event(p_action_id, p_tenant, p_domain, 'export.revoked', p_actor, jsonb_build_object('reason', p_reason, 'package_digest', x.package_digest, 'locator_prefix', x.locator_prefix), p_correlation);
  RETURN jsonb_build_object('action_id', p_action_id, 'locator_prefix', x.locator_prefix, 'package_digest', x.package_digest, 'revoked_at', clock_timestamp());
END $$ LANGUAGE plpgsql;

-- ============================================================
-- §6 the interface register
-- ============================================================
UPDATE objects.interface_register SET bound_to = bound_to || '; B13 (0073): the customer export''s delivery — the package''s deterministic archive (its digest recorded at the build), a key-based signature (retention.export_signing_keys: the public key recorded, the private key by reference), an expiry, the governed download (retention.record_export_download), declared destinations (retention.export_destinations: a transfer station or an https endpoint) and the delivery ledger with the recipient''s receipt (retention.export_deliveries: begin, record, acknowledge); a schedule''s governed retirement (retention.retire_schedule, retention.schedule_events)'
  WHERE interface_id = 'L3-I04';
DO $$
DECLARE v_bound int; v_partial int; v_unbound int;
BEGIN
  SELECT count(*) FILTER (WHERE binding_state = 'bound'), count(*) FILTER (WHERE binding_state = 'partial'), count(*) FILTER (WHERE binding_state = 'unbound') INTO v_bound, v_partial, v_unbound FROM objects.interface_register;
  IF (v_bound, v_partial, v_unbound) <> (26, 24, 0) THEN
    RAISE EXCEPTION 'interface register after 0073: expected 26 bound, 24 partial, 0 unbound; found %, %, %', v_bound, v_partial, v_unbound;
  END IF;
END $$;
