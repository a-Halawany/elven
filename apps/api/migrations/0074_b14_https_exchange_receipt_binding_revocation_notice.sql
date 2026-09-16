-- 0074 — CP-6 B14: the HTTPS exchange proven, the receipt's binding to its delivery (Codex B13-F1), the destination's trust anchor,
-- and the REVOCATION NOTICE to every destination that received a package (2026-09-16).
--
-- THE GAP. (a) B13's record port admits, for the initial answer of an https destination, a receipt whose delivery_id names ANOTHER
-- delivery: the classifier (receiptState) looked at the two digests and `verified` alone, so an endpoint answering with the receipt of
-- an earlier attempt acknowledged the new one (Codex B13-F1, reproduced against the candidate). The acknowledge port had the binding
-- from the start ("the receipt names delivery %, not %"); the initial record did not. (b) An https destination's certificate could be
-- verified against the deployment's trust store only — a customer endpoint on its own PKI (the on-premise and disconnected modes of
-- ES-53-004) had no declared anchor. (c) A revocation recorded and refused what followed, but sent NOTHING to the destinations that
-- held the package (0073 §5 "recorded honestly as remaining"; ES-29-005 "revocation context", ES-29-002 "recipient revocation",
-- ES-08-004 "revocable … with explicit source and recipient obligations", DP-47-005 "preserve the request and evidence").
--
-- THE MECHANISM. (D1) THE BINDING, consistently: a receipt that names a delivery_id other than the delivery it answers is NOT that
-- delivery's receipt. The record port refuses the states acknowledged and mismatched for such a receipt (the acknowledge port's rule and
-- message); it admits the state delivered WITH the receipt kept as evidence (the row's receipt column — the constraint rxd_receipt
-- allows a delivered row to carry one — and the event export.delivered carrying the body under `received` with
-- receipt_binding = 'names_other_delivery'), the exchange left open for the recipient's proper acknowledgement through the existing
-- acknowledge route. The TS classifier applies the same rule before the port (export-delivery.service.ts receiptState). Nothing else
-- of B13's receipt contract changes: a receipt without a delivery_id is still classified by its digests and `verified` (the
-- out-of-band case); no new identity or authentication contract is invented here.
-- (D2) THE TRUST ANCHOR: retention.export_destinations gains trust_anchor_pem — one or more PEM certificates the https destination's
-- server certificate must chain to (NULL: the deployment's trust store). Declared with the destination by the domain's administrator,
-- shown by fingerprint. TLS verification stays what it was (rejectUnauthorized never disabled; the hostname checked against the
-- certificate through SNI): the anchor NARROWS trust to the declared party, it never widens it. A transfer station carries none.
-- (D3) THE REVOCATION NOTICE: a new append-only ledger retention.export_revocation_notices — one row per attempt to tell a destination
-- that received the package (a delivery in state delivered or acknowledged) that it is revoked, with what was sent (the notice: the
-- package's digests, the deliveries it concerns, the reason, the instant, the OBLIGATION — destroy every copy and confirm), what came
-- back (the recipient's receipt) and the state: notified (a station's recipient answers later; an https answer that does not
-- acknowledge), acknowledged (the receipt names this notice — or none — and the package digest and copies_destroyed: true),
-- mismatched (it names another package or copies_destroyed: false — the obligation refused, the evidence kept), failed with its class
-- (the delivery's classes: credential_unbound, egress_refused, transport, receipt_invalid, write_failed). The ports mirror the
-- delivery's: begin_revocation_notice (the gates: the package REVOKED, the destination one that RECEIVED it — else nothing to notify —
-- under the action's delivery lock; the attempt numbered per action and destination), record_revocation_notice (under the lock; the
-- row, the action event export.revocation_notified | export.revocation_notice_failed | export.revocation_acknowledged |
-- export.revocation_mismatched; custody.revocation_notified per exported manifest when the notice reached the destination),
-- acknowledge_revocation_notice (a notified row moves once; a receipt naming another notice refused). The revoke act sends the first
-- notice to every such destination INSIDE its governed write, after the revocation is recorded (a failed notice is a recorded fact; the
-- revocation stands); a further attempt is the act retention.export.notify (the deliver rule's holders, human-gated). A transfer
-- station receives revocation.json in the action's directory and answers revocation-receipt.json (collected by the product); the
-- product's own package.tar and package.sig at the station are removed after the commit (the bytes it placed there — the recipient's
-- copies are the recipient's obligation). An https destination receives the notice as a JSON POST under the same egress and credential
-- rules as the delivery (the header x-eye-notice: revocation), its answer the receipt.
-- (D4) revoke_export re-declared: the answer names the destinations that received the package (distinct, with their kind), so the act
-- knows whom to notify; the row and the event unchanged.
--
-- The refusals: 'retention notice rejected: …' (42501 → 403 for "recorded by the acting principal"; 23503 → 404 for "no such …";
-- 22023 → 409 for the record's state, 422 otherwise) added to the mapper (observation-errors.ts); 'export destination rejected: …' as
-- before with the anchor's shape.

-- ============================================================
-- §1 the receipt's binding (D1)
-- ============================================================
-- record_export_delivery re-declared: 0073 §4's body with the binding — a receipt naming another delivery admits the state delivered
-- only, and the event export.delivered then carries the body and the binding's verdict. Every other line as 0073 left it.
CREATE OR REPLACE FUNCTION retention.record_export_delivery(
  p_delivery_id uuid, p_action_id uuid, p_tenant uuid, p_domain uuid, p_destination_id uuid, p_attempt int, p_state text, p_archive_digest text, p_package_digest text, p_signing_key_id text,
  p_receipt jsonb, p_receipt_digest text, p_failure_class text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a retention.actions_current%ROWTYPE; x retention.export_packages%ROWTYPE; dst retention.export_destinations%ROWTYPE; d retention.export_deliveries%ROWTYPE; i RECORD; m RECORD; v_evd uuid; v_obs uuid; v_at timestamptz; v_next int; v_event text; v_details jsonb; v_other boolean;
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
  -- D1: the binding. A receipt that names another delivery is not this delivery's: it neither acknowledges nor denies this exchange.
  v_other := p_receipt IS NOT NULL AND (p_receipt ? 'delivery_id') AND (p_receipt ->> 'delivery_id') IS DISTINCT FROM p_delivery_id::text;
  IF v_other AND p_state IN ('acknowledged', 'mismatched') THEN
    RAISE EXCEPTION 'retention delivery rejected: the receipt names delivery %, not %', coalesce(p_receipt ->> 'delivery_id', '<null>'), p_delivery_id USING ERRCODE = '22023';
  END IF;
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
  -- D1: a delivered row that carries an answer keeps the answer in the ledger too — the evidence of what the destination said, and why it did not close the exchange.
  IF p_state = 'delivered' AND p_receipt IS NOT NULL THEN
    v_details := v_details || jsonb_build_object('received', p_receipt, 'receipt_binding', CASE WHEN v_other THEN 'names_other_delivery' ELSE 'unverified' END,
                                                 'receipt_names_delivery', CASE WHEN v_other THEN p_receipt ->> 'delivery_id' END);
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

-- ============================================================
-- §2 the destination's trust anchor (D2)
-- ============================================================
-- One or more PEM certificates (a chain root, or the endpoint's own certificate when it is self-issued) the https destination's server
-- certificate must chain to; NULL means the deployment's trust store. A transfer station carries none. The shape is checked here; the
-- controller parses every block with node's X509Certificate before the port is called.
ALTER TABLE retention.export_destinations ADD COLUMN trust_anchor_pem text;
ALTER TABLE retention.export_destinations ADD CONSTRAINT rds_trust_anchor CHECK (trust_anchor_pem IS NULL OR (kind = 'https' AND trust_anchor_pem ~ '^-----BEGIN CERTIFICATE-----' AND length(trust_anchor_pem) <= 65536));

-- declare_export_destination DROPPED in its 11-argument form and declared with p_trust_anchor_pem (0073 §3's body + the anchor).
DROP FUNCTION retention.declare_export_destination(uuid,uuid,uuid,text,text,text,text,text,text,uuid,uuid);
CREATE OR REPLACE FUNCTION retention.declare_export_destination(
  p_destination_id uuid, p_tenant uuid, p_domain uuid, p_destination_key text, p_kind text, p_endpoint text, p_credential_ref text, p_recipient text, p_purpose text, p_trust_anchor_pem text, p_actor uuid, p_correlation uuid
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
  IF p_trust_anchor_pem IS NOT NULL AND p_kind <> 'https' THEN RAISE EXCEPTION 'export destination rejected: a trust anchor is declared for an https destination only' USING ERRCODE = '22023'; END IF;
  IF p_trust_anchor_pem IS NOT NULL AND (p_trust_anchor_pem !~ '^-----BEGIN CERTIFICATE-----' OR length(p_trust_anchor_pem) > 65536) THEN RAISE EXCEPTION 'export destination rejected: the trust anchor is one or more PEM certificates (at most 64 KiB)' USING ERRCODE = '22023'; END IF;
  IF coalesce(length(btrim(p_recipient)), 0) < 1 THEN RAISE EXCEPTION 'export destination rejected: the recipient names who receives' USING ERRCODE = '22023'; END IF;
  IF coalesce(length(btrim(p_purpose)), 0) < 1 THEN RAISE EXCEPTION 'export destination rejected: the purpose says why the destination receives' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('retention.export_destinations:' || p_tenant::text || ':' || p_domain::text || ':' || p_destination_key, 0));
  IF EXISTS (SELECT 1 FROM retention.export_destinations x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.destination_key = p_destination_key AND x.retired_at IS NULL) THEN
    RAISE EXCEPTION 'export destination rejected: % is already declared in this domain (retire it to declare it again)', p_destination_key USING ERRCODE = '22023';
  END IF;
  INSERT INTO retention.export_destinations (destination_id, scope, tenant_id, domain_id, destination_key, kind, endpoint, credential_ref, recipient, purpose, trust_anchor_pem, declared_by, declared_at, correlation_id)
  VALUES (p_destination_id, 'DOMAIN', p_tenant, p_domain, p_destination_key, p_kind, p_endpoint, p_credential_ref, p_recipient, p_purpose, p_trust_anchor_pem, p_actor, clock_timestamp(), p_correlation) RETURNING * INTO d;
  RETURN to_jsonb(d);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.declare_export_destination(uuid,uuid,uuid,text,text,text,text,text,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.declare_export_destination(uuid,uuid,uuid,text,text,text,text,text,text,text,uuid,uuid) TO eye_commit;

-- The retire-only trigger re-declared: the anchor is among the columns that never change (0073 §3's rule, one column longer).
CREATE OR REPLACE FUNCTION retention.export_destinations_retire_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'table retention.export_destinations is append-only (ADR-P0-07): DELETE prohibited' USING ERRCODE = '42501'; END IF;
  IF OLD.retired_at IS NOT NULL OR NEW.retired_at IS NULL
     OR NEW.destination_id IS DISTINCT FROM OLD.destination_id OR NEW.scope IS DISTINCT FROM OLD.scope OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.domain_id IS DISTINCT FROM OLD.domain_id
     OR NEW.destination_key IS DISTINCT FROM OLD.destination_key OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.endpoint IS DISTINCT FROM OLD.endpoint OR NEW.credential_ref IS DISTINCT FROM OLD.credential_ref
     OR NEW.recipient IS DISTINCT FROM OLD.recipient OR NEW.purpose IS DISTINCT FROM OLD.purpose OR NEW.trust_anchor_pem IS DISTINCT FROM OLD.trust_anchor_pem
     OR NEW.declared_by IS DISTINCT FROM OLD.declared_by OR NEW.declared_at IS DISTINCT FROM OLD.declared_at
     OR NEW.correlation_id IS DISTINCT FROM OLD.correlation_id THEN
    RAISE EXCEPTION 'an export destination is retired once; nothing else about it changes' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

-- ============================================================
-- §3 the revocation notices (D3)
-- ============================================================
ALTER TABLE retention.action_events DROP CONSTRAINT action_events_event_check;
ALTER TABLE retention.action_events ADD CONSTRAINT action_events_event_check CHECK (event IN ('action.opened', 'scope.resolved', 'action.held', 'action.paused', 'approval.recorded', 'approval.revoked', 'execution.started', 'execution.item', 'execution.finished', 'residual.recorded', 'verification.passed', 'verification.residuals', 'action.withdrawn', 'action.rejected', 'action.failed', 'export.built', 'export.revoked', 'action.escalated', 'export.delivered', 'export.delivery_failed', 'export.acknowledged', 'export.mismatched', 'export.downloaded',
  'export.revocation_notified', 'export.revocation_notice_failed', 'export.revocation_acknowledged', 'export.revocation_mismatched'));
ALTER TABLE observation.custody_events DROP CONSTRAINT custody_events_event_check;
ALTER TABLE observation.custody_events ADD CONSTRAINT custody_events_event_check CHECK (event IN (
  'custody.acquired', 'custody.quarantined', 'custody.verified', 'custody.candidate_verified', 'custody.admitted', 'custody.finalized',
  'custody.retrieved', 'custody.tombstoned', 'custody.integrity_failed', 'custody.archived', 'custody.exported', 'custody.restored', 'custody.delivered', 'custody.revocation_notified'));

-- A NOTICE is recorded whatever came of it — notified (the notice reached the destination; a station's recipient answers later; an https
-- answer that neither acknowledges nor denies), acknowledged (the receipt names this notice — or no notice — and the package digest, and
-- copies_destroyed true), mismatched (it names another package or copies_destroyed false: the obligation refused, the evidence kept) or
-- failed with its class (a FAILED notice is a recorded fact; the revocation stands regardless). Append-only except the acknowledgement:
-- a notified row moves once to acknowledged or mismatched with the receipt, its digest and the instant. The attempt is 1 + the count of
-- this action's notices to this destination, computed under the action's delivery lock (C6) and unique. The delivery_id names the latest
-- delivery the destination received (delivered or acknowledged) — what the recipient holds.
CREATE TABLE retention.export_revocation_notices (
  notice_id       uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  action_id       uuid NOT NULL,
  destination_id  uuid NOT NULL,
  delivery_id     uuid NOT NULL,
  attempt         int NOT NULL CHECK (attempt >= 1),
  state           text NOT NULL CHECK (state IN ('notified', 'acknowledged', 'failed', 'mismatched')),
  package_digest  text NOT NULL CHECK (package_digest ~ '^[0-9a-f]{64}$'),
  archive_digest  text NOT NULL CHECK (archive_digest ~ '^[0-9a-f]{64}$'),
  notice          jsonb NOT NULL CHECK (jsonb_typeof(notice) = 'object'),
  notice_digest   text NOT NULL CHECK (notice_digest ~ '^[0-9a-f]{64}$'),
  receipt         jsonb CHECK (receipt IS NULL OR jsonb_typeof(receipt) = 'object'),
  receipt_digest  text CHECK (receipt_digest IS NULL OR receipt_digest ~ '^[0-9a-f]{64}$'),
  failure_class   text CHECK (failure_class IS NULL OR failure_class IN ('destination_retired', 'credential_unbound', 'egress_refused', 'transport', 'receipt_invalid', 'write_failed')),
  notified_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  acknowledged_at timestamptz,
  notified_by     uuid NOT NULL,
  correlation_id  uuid NOT NULL,
  CONSTRAINT rxn_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT rxn_attempt UNIQUE (action_id, destination_id, attempt),
  CONSTRAINT rxn_failure CHECK ((state = 'failed') = (failure_class IS NOT NULL)),
  CONSTRAINT rxn_receipt CHECK ((receipt IS NULL) = (receipt_digest IS NULL) AND (state = 'notified' OR receipt IS NOT NULL)),
  CONSTRAINT rxn_acknowledged CHECK ((state IN ('acknowledged', 'mismatched')) = (acknowledged_at IS NOT NULL))
);
CREATE INDEX rxn_action ON retention.export_revocation_notices (action_id, notified_at);
CREATE OR REPLACE FUNCTION retention.export_revocation_notices_acknowledge_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'table retention.export_revocation_notices is append-only (ADR-P0-07): DELETE prohibited' USING ERRCODE = '42501'; END IF;
  IF OLD.state <> 'notified' OR NEW.state NOT IN ('acknowledged', 'mismatched') OR OLD.acknowledged_at IS NOT NULL OR NEW.acknowledged_at IS NULL OR NEW.receipt IS NULL
     OR NEW.notice_id IS DISTINCT FROM OLD.notice_id OR NEW.scope IS DISTINCT FROM OLD.scope OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.domain_id IS DISTINCT FROM OLD.domain_id
     OR NEW.action_id IS DISTINCT FROM OLD.action_id OR NEW.destination_id IS DISTINCT FROM OLD.destination_id OR NEW.delivery_id IS DISTINCT FROM OLD.delivery_id OR NEW.attempt IS DISTINCT FROM OLD.attempt
     OR NEW.package_digest IS DISTINCT FROM OLD.package_digest OR NEW.archive_digest IS DISTINCT FROM OLD.archive_digest OR NEW.notice IS DISTINCT FROM OLD.notice OR NEW.notice_digest IS DISTINCT FROM OLD.notice_digest
     OR NEW.failure_class IS DISTINCT FROM OLD.failure_class OR NEW.notified_at IS DISTINCT FROM OLD.notified_at OR NEW.notified_by IS DISTINCT FROM OLD.notified_by
     OR NEW.correlation_id IS DISTINCT FROM OLD.correlation_id THEN
    RAISE EXCEPTION 'a revocation notice is acknowledged once (acknowledged or mismatched, with the receipt); nothing else about it changes' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rxn_acknowledge_only BEFORE UPDATE OR DELETE ON retention.export_revocation_notices FOR EACH ROW EXECUTE FUNCTION retention.export_revocation_notices_acknowledge_only();
ALTER TABLE retention.export_revocation_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention.export_revocation_notices FORCE ROW LEVEL SECURITY;
CREATE POLICY retention_isolation ON retention.export_revocation_notices
  USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
REVOKE ALL ON retention.export_revocation_notices FROM PUBLIC;
GRANT SELECT ON retention.export_revocation_notices TO eye_app, eye_commit;

-- THE DESTINATIONS THAT RECEIVED a package: distinct destinations with a delivery in state delivered or acknowledged, each with the latest
-- such delivery (what the recipient holds) — the revoke act's list of whom to notify, and the gate of begin_revocation_notice.
CREATE OR REPLACE FUNCTION retention.export_recipients(p_action_id uuid) RETURNS TABLE (destination_id uuid, destination_key text, kind text, recipient text, delivery_id uuid, attempt int, delivery_state text, retired_at timestamptz)
STABLE SET search_path = retention, pg_catalog, pg_temp AS $$
  SELECT DISTINCT ON (d.destination_id) d.destination_id, x.destination_key, x.kind, x.recipient, d.delivery_id, d.attempt, d.state, x.retired_at
    FROM retention.export_deliveries d JOIN retention.export_destinations x ON x.destination_id = d.destination_id
   WHERE d.action_id = p_action_id AND d.state IN ('delivered', 'acknowledged')
   ORDER BY d.destination_id, d.delivered_at DESC, d.attempt DESC;
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION retention.export_recipients(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.export_recipients(uuid) TO eye_app, eye_commit;

-- THE BEGINNING (retention.export.revoke — the revoke act's own first notices — or retention.export.notify — a further attempt, human-gated):
-- the gates before anything leaves — the action a customer export whose package is REVOKED (a notice of an unrevoked package is refused:
-- there is nothing to tell), the destination of this domain (a retired destination is still notified: it received the package — the
-- delivery port refuses a retired one, this one does not), the destination one that RECEIVED the package (else "nothing to notify");
-- the action row locked FOR UPDATE and the action's delivery lock taken before the attempt is computed (C6). Allocates the notice id;
-- returns it, the attempt, the package row (revoked_at, revoke_reason, the digests), the destination row and the delivery the recipient
-- holds, for the executor, which runs INSIDE the same governed write and records through record_revocation_notice.
CREATE OR REPLACE FUNCTION retention.begin_revocation_notice(p_action_id uuid, p_tenant uuid, p_domain uuid, p_destination_id uuid, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a retention.actions_current%ROWTYPE; x retention.export_packages%ROWTYPE; dst retention.export_destinations%ROWTYPE; r RECORD; v_attempt int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.export.revoke', 'retention.export.notify']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'retention notice rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO a FROM retention.actions_current y WHERE y.action_id = p_action_id AND y.tenant_id = p_tenant AND y.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention notice rejected: % has no export package in this domain', p_action_id USING ERRCODE = '23503'; END IF;
  IF a.kind <> 'customer_export' THEN RAISE EXCEPTION 'retention notice rejected: % is a %, not a customer export', p_action_id, a.kind USING ERRCODE = '22023'; END IF;
  SELECT * INTO x FROM retention.export_packages e WHERE e.action_id = p_action_id AND e.tenant_id = p_tenant AND e.domain_id = p_domain FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention notice rejected: % has no export package in this domain', p_action_id USING ERRCODE = '23503'; END IF;
  IF x.revoked_at IS NULL THEN RAISE EXCEPTION 'retention notice rejected: the package of % is not revoked; a revocation notice tells a destination of a revocation', p_action_id USING ERRCODE = '22023'; END IF;
  IF x.archive_digest IS NULL THEN RAISE EXCEPTION 'retention notice rejected: the package of % was built before its archive digest was recorded (B13); it was never delivered', p_action_id USING ERRCODE = '22023'; END IF;
  SELECT * INTO dst FROM retention.export_destinations z WHERE z.destination_id = p_destination_id AND z.tenant_id = p_tenant AND z.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention notice rejected: no such destination % in this domain', p_destination_id USING ERRCODE = '23503'; END IF;
  SELECT * INTO r FROM retention.export_recipients(p_action_id) q WHERE q.destination_id = p_destination_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention notice rejected: destination % never received the package of % — nothing to notify', dst.destination_key, p_action_id USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(retention.lock_key_export_deliveries(p_action_id));
  SELECT 1 + count(*)::int INTO v_attempt FROM retention.export_revocation_notices n WHERE n.action_id = p_action_id AND n.destination_id = p_destination_id;
  RETURN jsonb_build_object('notice_id', gen_random_uuid(), 'attempt', v_attempt, 'package', to_jsonb(x), 'destination', to_jsonb(dst),
                            'delivery', jsonb_build_object('delivery_id', r.delivery_id, 'attempt', r.attempt, 'state', r.delivery_state));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.begin_revocation_notice(uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.begin_revocation_notice(uuid,uuid,uuid,uuid,uuid,uuid) TO eye_commit;

-- THE RECORD: the notice row with what was sent, what the destination answered (or the failure) and the action event; custody.revocation_notified
-- per exported manifest when the notice reached the destination (notified, acknowledged). The binding as D1's: a receipt naming another notice
-- admits the state notified only. The attempt is the next one, computed under the lock this port requires. Returns the row.
CREATE OR REPLACE FUNCTION retention.record_revocation_notice(
  p_notice_id uuid, p_action_id uuid, p_tenant uuid, p_domain uuid, p_destination_id uuid, p_delivery_id uuid, p_attempt int, p_state text, p_notice jsonb, p_notice_digest text,
  p_receipt jsonb, p_receipt_digest text, p_failure_class text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a retention.actions_current%ROWTYPE; x retention.export_packages%ROWTYPE; dst retention.export_destinations%ROWTYPE; n retention.export_revocation_notices%ROWTYPE; i RECORD; m RECORD; v_evd uuid; v_obs uuid; v_at timestamptz; v_next int; v_event text; v_details jsonb; v_other boolean;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.export.revoke', 'retention.export.notify']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'retention notice rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_notice_id IS NULL THEN RAISE EXCEPTION 'retention notice rejected: the notice id is the one begin_revocation_notice allocated' USING ERRCODE = '22023'; END IF;
  IF p_state IS NULL OR p_state NOT IN ('notified', 'acknowledged', 'failed', 'mismatched') THEN RAISE EXCEPTION 'retention notice rejected: the state is notified, acknowledged, failed or mismatched' USING ERRCODE = '22023'; END IF;
  IF (p_state = 'failed') <> (p_failure_class IS NOT NULL) OR (p_failure_class IS NOT NULL AND p_failure_class NOT IN ('destination_retired', 'credential_unbound', 'egress_refused', 'transport', 'receipt_invalid', 'write_failed')) THEN
    RAISE EXCEPTION 'retention notice rejected: a failed notice names its failure class and no other notice does' USING ERRCODE = '22023';
  END IF;
  IF p_notice IS NULL OR jsonb_typeof(p_notice) <> 'object' OR p_notice_digest IS NULL OR p_notice_digest !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'retention notice rejected: the notice is a JSON object recorded with the sha-256 hex of its canonical JSON' USING ERRCODE = '22023'; END IF;
  IF p_receipt IS NOT NULL AND jsonb_typeof(p_receipt) <> 'object' THEN RAISE EXCEPTION 'retention notice rejected: the receipt is a JSON object' USING ERRCODE = '22023'; END IF;
  IF (p_receipt IS NULL) <> (p_receipt_digest IS NULL) OR (p_receipt_digest IS NOT NULL AND p_receipt_digest !~ '^[0-9a-f]{64}$') THEN RAISE EXCEPTION 'retention notice rejected: a receipt is recorded with the sha-256 hex of its canonical JSON' USING ERRCODE = '22023'; END IF;
  IF p_state <> 'notified' AND p_receipt IS NULL THEN RAISE EXCEPTION 'retention notice rejected: an acknowledged, mismatched or failed notice records what the destination answered, or the failure' USING ERRCODE = '22023'; END IF;
  v_other := p_receipt IS NOT NULL AND (p_receipt ? 'notice_id') AND (p_receipt ->> 'notice_id') IS DISTINCT FROM p_notice_id::text;
  IF v_other AND p_state IN ('acknowledged', 'mismatched') THEN
    RAISE EXCEPTION 'retention notice rejected: the receipt names notice %, not %', coalesce(p_receipt ->> 'notice_id', '<null>'), p_notice_id USING ERRCODE = '22023';
  END IF;
  SELECT * INTO a FROM retention.actions_current y WHERE y.action_id = p_action_id AND y.tenant_id = p_tenant AND y.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention notice rejected: % has no export package in this domain', p_action_id USING ERRCODE = '23503'; END IF;
  SELECT * INTO x FROM retention.export_packages e WHERE e.action_id = p_action_id AND e.tenant_id = p_tenant AND e.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention notice rejected: % has no export package in this domain', p_action_id USING ERRCODE = '23503'; END IF;
  IF x.revoked_at IS NULL THEN RAISE EXCEPTION 'retention notice rejected: the package of % is not revoked', p_action_id USING ERRCODE = '22023'; END IF;
  SELECT * INTO dst FROM retention.export_destinations z WHERE z.destination_id = p_destination_id AND z.tenant_id = p_tenant AND z.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention notice rejected: no such destination % in this domain', p_destination_id USING ERRCODE = '23503'; END IF;
  IF NOT EXISTS (SELECT 1 FROM retention.export_deliveries d WHERE d.delivery_id = p_delivery_id AND d.action_id = p_action_id AND d.destination_id = p_destination_id AND d.state IN ('delivered', 'acknowledged')) THEN
    RAISE EXCEPTION 'retention notice rejected: delivery % is not a delivery of % that % received', p_delivery_id, p_action_id, dst.destination_key USING ERRCODE = '22023';
  END IF;
  IF NOT retention.holds_advisory(retention.lock_key_export_deliveries(p_action_id), 'ExclusiveLock') THEN
    RAISE EXCEPTION 'retention notice rejected: the notices of % are not serialised by this transaction (begin_revocation_notice takes the action''s delivery lock; a notice is recorded only under it)', p_action_id USING ERRCODE = '55P03';
  END IF;
  SELECT 1 + count(*)::int INTO v_next FROM retention.export_revocation_notices q WHERE q.action_id = p_action_id AND q.destination_id = p_destination_id;
  IF p_attempt IS DISTINCT FROM v_next THEN RAISE EXCEPTION 'retention notice rejected: attempt % is not the next attempt (%) of % to %', p_attempt, v_next, p_action_id, dst.destination_key USING ERRCODE = '22023'; END IF;
  v_at := clock_timestamp();
  INSERT INTO retention.export_revocation_notices (notice_id, scope, tenant_id, domain_id, action_id, destination_id, delivery_id, attempt, state, package_digest, archive_digest, notice, notice_digest, receipt, receipt_digest, failure_class, notified_at, acknowledged_at, notified_by, correlation_id)
  VALUES (p_notice_id, 'DOMAIN', p_tenant, p_domain, p_action_id, p_destination_id, p_delivery_id, p_attempt, p_state, x.package_digest, x.archive_digest, p_notice, p_notice_digest, p_receipt, p_receipt_digest, p_failure_class, v_at,
          CASE WHEN p_state IN ('acknowledged', 'mismatched') THEN v_at END, p_actor, p_correlation) RETURNING * INTO n;
  v_event := CASE p_state WHEN 'notified' THEN 'export.revocation_notified' WHEN 'acknowledged' THEN 'export.revocation_acknowledged' WHEN 'mismatched' THEN 'export.revocation_mismatched' ELSE 'export.revocation_notice_failed' END;
  v_details := jsonb_build_object('notice_id', p_notice_id, 'destination_id', p_destination_id, 'destination_key', dst.destination_key, 'kind', dst.kind, 'recipient', dst.recipient, 'delivery_id', p_delivery_id, 'attempt', p_attempt, 'state', p_state,
                                  'package_digest', x.package_digest, 'archive_digest', x.archive_digest, 'notice_digest', p_notice_digest, 'receipt_digest', p_receipt_digest, 'failure_class', p_failure_class, 'revoked_at', x.revoked_at);
  IF p_state = 'failed' THEN v_details := v_details || jsonb_build_object('failure', p_receipt); END IF;
  IF p_state = 'mismatched' THEN v_details := v_details || jsonb_build_object('received', p_receipt); END IF;
  IF p_state = 'notified' AND p_receipt IS NOT NULL THEN
    v_details := v_details || jsonb_build_object('received', p_receipt, 'receipt_binding', CASE WHEN v_other THEN 'names_other_notice' ELSE 'unverified' END, 'receipt_names_notice', CASE WHEN v_other THEN p_receipt ->> 'notice_id' END);
  END IF;
  PERFORM retention.event(p_action_id, p_tenant, p_domain, v_event, p_actor, v_details, p_correlation);
  IF p_state IN ('notified', 'acknowledged') THEN
    FOR i IN SELECT si.ref FROM retention.scope_items si WHERE si.action_id = p_action_id AND si.item_kind = 'manifest' AND si.disposition = 'execute' ORDER BY si.dependency_order LOOP
      SELECT bm.manifest_id, bm.source_id, bm.contract_version, bm.run_id, bm.content_digest, bm.locator INTO m FROM observation.blob_manifests bm WHERE bm.manifest_id = i.ref::uuid;
      SELECT o.object_id, (o.payload ->> 'obs_object_id')::uuid INTO v_evd, v_obs FROM objects.canonical_objects o
       WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.object_type = 'EVD' AND (o.payload ->> 'manifest_id')::uuid = m.manifest_id ORDER BY o.object_version DESC LIMIT 1;
      INSERT INTO observation.custody_events (event_id, scope, tenant_id, domain_id, manifest_id, obs_object_id, evd_object_id, source_id, contract_version, run_id, event, actor, content_digest, digest_verified, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, m.manifest_id, v_obs, v_evd, m.source_id, m.contract_version, m.run_id, 'custody.revocation_notified', 'principal:' || p_actor::text, m.content_digest, true,
              jsonb_build_object('action_id', p_action_id, 'notice_id', p_notice_id, 'delivery_id', p_delivery_id, 'destination_key', dst.destination_key, 'recipient', dst.recipient, 'state', p_state, 'attempt', p_attempt, 'package_digest', x.package_digest, 'file', m.manifest_id::text || '.bin'), p_correlation);
    END LOOP;
  END IF;
  RETURN to_jsonb(n);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.record_revocation_notice(uuid,uuid,uuid,uuid,uuid,uuid,int,text,jsonb,text,jsonb,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.record_revocation_notice(uuid,uuid,uuid,uuid,uuid,uuid,int,text,jsonb,text,jsonb,text,text,uuid,uuid) TO eye_commit;

-- THE ACKNOWLEDGEMENT (retention.export.notify / retention.export.acknowledge — the collect act reads revocation-receipt.json from the
-- transfer station; the acknowledge act takes a receipt presented out of band): a NOTIFIED row moves once — to acknowledged when the
-- receipt names the package digest and copies_destroyed true; to mismatched otherwise (the obligation refused or another package named;
-- the event carries both sides). A row not notified is refused (409). A receipt naming ANOTHER notice is refused, the row untouched; a
-- receipt without a notice_id is admitted (out of band). Returns the row after.
CREATE OR REPLACE FUNCTION retention.acknowledge_revocation_notice(p_notice_id uuid, p_tenant uuid, p_domain uuid, p_receipt jsonb, p_receipt_digest text, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE n retention.export_revocation_notices%ROWTYPE; dst retention.export_destinations%ROWTYPE; v_state text; v_at timestamptz; v_details jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.export.notify', 'retention.export.acknowledge']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'retention notice rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_receipt IS NULL OR jsonb_typeof(p_receipt) <> 'object' THEN RAISE EXCEPTION 'retention notice rejected: the receipt is a JSON object' USING ERRCODE = '22023'; END IF;
  IF p_receipt_digest IS NULL OR p_receipt_digest !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'retention notice rejected: a receipt is recorded with the sha-256 hex of its canonical JSON' USING ERRCODE = '22023'; END IF;
  SELECT * INTO n FROM retention.export_revocation_notices q WHERE q.notice_id = p_notice_id AND q.tenant_id = p_tenant AND q.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention notice rejected: no such notice % in this domain', p_notice_id USING ERRCODE = '23503'; END IF;
  IF n.state <> 'notified' THEN RAISE EXCEPTION 'retention notice rejected: notice % is not notified — it is %; only a notified notice is acknowledged', p_notice_id, n.state USING ERRCODE = '22023'; END IF;
  IF (p_receipt ? 'notice_id') AND (p_receipt ->> 'notice_id') IS DISTINCT FROM p_notice_id::text THEN
    RAISE EXCEPTION 'retention notice rejected: the receipt names notice %, not %', coalesce(p_receipt ->> 'notice_id', '<null>'), p_notice_id USING ERRCODE = '22023';
  END IF;
  SELECT * INTO dst FROM retention.export_destinations z WHERE z.destination_id = n.destination_id;
  v_state := CASE WHEN (p_receipt ->> 'package_digest') = n.package_digest AND (p_receipt -> 'copies_destroyed') = 'true'::jsonb THEN 'acknowledged' ELSE 'mismatched' END;
  v_at := clock_timestamp();
  UPDATE retention.export_revocation_notices SET state = v_state, receipt = p_receipt, receipt_digest = p_receipt_digest, acknowledged_at = v_at WHERE notice_id = p_notice_id RETURNING * INTO n;
  v_details := jsonb_build_object('notice_id', p_notice_id, 'destination_id', n.destination_id, 'destination_key', dst.destination_key, 'recipient', dst.recipient, 'delivery_id', n.delivery_id, 'attempt', n.attempt, 'state', v_state,
                                  'package_digest', n.package_digest, 'archive_digest', n.archive_digest, 'receipt_digest', p_receipt_digest, 'receipt_id', p_receipt ->> 'receipt_id', 'receipt_recipient', p_receipt ->> 'recipient');
  IF v_state = 'mismatched' THEN
    v_details := v_details || jsonb_build_object('expected', jsonb_build_object('package_digest', n.package_digest, 'copies_destroyed', true),
                                                 'received', jsonb_build_object('package_digest', p_receipt ->> 'package_digest', 'copies_destroyed', p_receipt -> 'copies_destroyed'));
  END IF;
  PERFORM retention.event(n.action_id, p_tenant, p_domain, CASE WHEN v_state = 'acknowledged' THEN 'export.revocation_acknowledged' ELSE 'export.revocation_mismatched' END, p_actor, v_details, p_correlation);
  RETURN to_jsonb(n);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.acknowledge_revocation_notice(uuid,uuid,uuid,jsonb,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.acknowledge_revocation_notice(uuid,uuid,uuid,jsonb,text,uuid,uuid) TO eye_commit;

-- ============================================================
-- §4 revoke_export re-declared (D4): the answer names the destinations that received the package
-- ============================================================
-- 0070 §3's body (0073 §5), the answer one key longer: `recipients` — the destinations with a delivered or acknowledged delivery, each with
-- the latest delivery it holds — so the revoke act sends the first notice to each inside the same write. The row and the event unchanged.
CREATE OR REPLACE FUNCTION retention.revoke_export(p_action_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x retention.export_packages%ROWTYPE; v_recipients jsonb;
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
  SELECT coalesce(jsonb_agg(jsonb_build_object('destination_id', q.destination_id, 'destination_key', q.destination_key, 'kind', q.kind, 'recipient', q.recipient, 'delivery_id', q.delivery_id, 'attempt', q.attempt, 'delivery_state', q.delivery_state, 'retired_at', q.retired_at) ORDER BY q.destination_key), '[]'::jsonb)
    INTO v_recipients FROM retention.export_recipients(p_action_id) q;
  RETURN jsonb_build_object('action_id', p_action_id, 'locator_prefix', x.locator_prefix, 'package_digest', x.package_digest, 'revoked_at', clock_timestamp(), 'recipients', v_recipients);
END $$ LANGUAGE plpgsql;

-- ============================================================
-- §5 the interface register
-- ============================================================
UPDATE objects.interface_register SET bound_to = bound_to || '; B14 (0074): the receipt bound to its delivery at the initial record (a receipt naming another delivery neither acknowledges nor denies), the destination''s trust anchor, the revocation notice to every destination that received a package (retention.export_revocation_notices: begin, record, acknowledge; retention.export_recipients)'
  WHERE interface_id = 'L3-I04';
DO $$
DECLARE v_bound int; v_partial int; v_unbound int;
BEGIN
  SELECT count(*) FILTER (WHERE binding_state = 'bound'), count(*) FILTER (WHERE binding_state = 'partial'), count(*) FILTER (WHERE binding_state = 'unbound') INTO v_bound, v_partial, v_unbound FROM objects.interface_register;
  IF (v_bound, v_partial, v_unbound) <> (26, 24, 0) THEN
    RAISE EXCEPTION 'interface register after 0074: expected 26 bound, 24 partial, 0 unbound; found %, %, %', v_bound, v_partial, v_unbound;
  END IF;
END $$;
