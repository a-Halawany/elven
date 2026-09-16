-- 0076 — CP-6 B16: the GOVERNED IMPORT of a partner's signed export package (the exchange partner, the import ledger, admission
-- through objects.admit_version under retention.import.admit), the VERSIONED relationship closure (Codex B15-F1 — the code's; here the
-- register's clause) and the HELD RECIPIENTS of a revoked package (Codex B14-F1) (2026-09-16).
--
-- THE GAP. (a) A customer export leaves this installation as a signed package and reaches a transfer station or an https endpoint;
-- nothing could take such a package IN. DP-47-001/002/003/006 and DZ-17 name the round trip — export → import → re-export with identity,
-- temporal truth, provenance, corrections, policy labels and graph links preserved — ES-53-004 the signed import of the disconnected
-- modes, DP-47-005 the refusal that keeps the request and the evidence. (b) Codex B14-F1: retention.export_recipients (0074 §3) named
-- the destinations with a delivery in state delivered or acknowledged — so a destination whose only delivery was MISMATCHED (the recipient
-- holds the bytes and denied the exchange), or FAILED after the bytes were on the wire (a non-2xx answer, a redirect answered after the
-- body, a timeout, a receipt that was not a JSON object, a station write whose files could not be removed), was never told of a
-- revocation. (c) Codex B15-F1: links.json carried one version per claim id, so an edge naming another version could be read as based
-- on the carried one — the closure is re-cut by exact (object_id, object_version) pair in the code (eye-customer-export-links/2); nothing
-- of it lives here beyond the register's clause.
--
-- THE MECHANISM.
-- (D1) AN IMPORT IS ITS OWN LEDGER — retention.imports / import_items / import_events — with its own two-person gate: OPENED by a steward
--   (the package quarantined as vault blobs, the checks run, the row VERIFIED or QUARANTINED with the ordered checks, every item planned
--   with the NEW id this installation mints, the origin's own exclusions settled at once), APPROVED by the retention authority on the
--   package digest (never the opener), ADMITTED by a steward (never the approver) through dedicated ports under the canonical-write
--   action retention.import.admit, WITHDRAWN with a reason from any state before admitted — the evidence kept; the canonical rows an
--   interrupted admission already wrote stand (append-only). The transitions are the trigger's; nothing else about a row changes; no
--   import is left in admitting for good: a withdrawal closes it.
-- (D2) THE EXCHANGE PARTNER (retention.exchange_partners): a package is admitted only when its key belongs to a declared, active partner
--   of the importing domain — a partner IS a key (an Ed25519 SPKI whose id is the first 16 hex of sha256(DER), as 0073's signing keys)
--   bound to an INTAKE SOURCE CONTRACT of the domain (an active upload contract with confirmed rights): the imported manifests are
--   recorded under it, its classification ceiling is the import's policy gate, its retention and licence (contract ->
--   authority_and_rights) travel with the admission. Retired once, the history kept.
-- (D3) IDENTITY: every imported record, claim version, entity, edge, identifier and manifest gets a NEW id minted here (an object id is
--   never caller-chosen — Gate-2.2 C6); version NUMBERS are preserved; the original identity travels as digest-bound provenance inside
--   the payload (imported_from — the import forms EVD@v2, ENT@v2, EVT@v2, REL@v2, ASM@v2 and CLM@v3 admit that one added property) and in
--   the item map (origin_ref and the origin object id → what was admitted). Reuse is by origin OBJECT id (rii_reuse_object): a version
--   already admitted from an earlier package is reused, never minted twice.
-- (D4) THE ADMISSION PORTS write what the acquisition lifecycle and the graph's own ports would not let an import say: the record's
--   manifest under the intake contract with custody.imported; the claim's lineage with the ORIGIN's run, method and call (no run of this
--   domain produced it — the admitting decision is this operation's); the entity with its recorded lifecycle state; the identifier system
--   (the domain's own declaration stands when one exists) and the identifier (one entity per authoritative identifier — 0024 §3's rule
--   re-asserted); the edge with the recorded instants and STATE (asserted, retracted or superseded: temporal truth; never rebased onto
--   another claim version; the domain's active ontology gating the predicate) — every event in the graph's existing vocabulary, one
--   microsecond of record time apart, so the projection rebuild (0065) derives the same states.
-- (D5) THE QUARANTINE LIFECYCLE: an import's bytes are inventoried by the import ledger, not by blob_manifests; a withdrawal tombstones
--   them after its commit and records import.evidence_tombstoned; a quarantined or withdrawn import whose bytes outlive the quarantine
--   TTL is listed by retention.import_quarantine_expired for the sweeper, which tombstones and marks (mark_import_quarantine_swept).
-- (D6) HELD RECIPIENTS (B14-F1): retention.export_delivery_held classifies a delivery by what is PROVEN — 'confirmed' (delivered,
--   acknowledged, mismatched: the recipient holds the bytes), 'possible' (failed after the bytes may have reached the wire: a receipt that
--   was not a JSON object; a transport failure with an answer status, a timeout, a transport or size failure, an unclassified egress or the
--   request known sent; a redirect answered after the body; a station write with files left behind), NULL (nothing is known to have
--   reached: the credential unbound, the destination retired, the egress refused before connecting, the name unresolved or the TLS
--   handshake failed without the request sent, a station write with nothing left). Wire-uncertain windows are classified conservatively
--   as 'possible', never as proven. retention.export_recipients is re-declared on it (the strongest level per destination, the latest
--   delivery at that level, `held` in the answer); revoke_export's recipients, begin_revocation_notice's answer and refusal and
--   record_revocation_notice's delivery gate and event carry `held`. No column is added: held is inside the notice (digest-bound) and in
--   the events.
-- (D7) The register: L3-I04's binding text gains the B16 clause; the counts stay (26 bound, 24 partial, 0 unbound).
--
--   §1 held recipients (D6): retention.export_delivery_held; retention.export_recipients DROPPED in its 0074 form and declared with held;
--      retention.revoke_export, retention.begin_revocation_notice and retention.record_revocation_notice re-declared (0074's bodies with
--      the lines named at each).
--   §2 the versioned closure (B15-F1): nothing in SQL — the closure is the code's; verify_action (0075) unchanged.
--   §3 the exchange partner (D2): retention.exchange_partners (retire-only; RLS), retention.declare_exchange_partner,
--      retention.retire_exchange_partner.
--   §4 the import ledger (D1, D3, D4, D5): retention.imports (the transition trigger), retention.import_items (settled once),
--      retention.import_events (append-only), the writer retention.import_event and the two readers import_admitting / import_item_staged
--      (no grant — C18's rule); the ports record_import, approve_import, begin_import_admission, record_imported_manifest,
--      record_imported_lineage, record_imported_entity, record_imported_identifier_system, record_imported_identifier,
--      record_imported_edge, mark_import_item, record_import_event, finish_import_admission, withdraw_import, import_origin_state,
--      import_quarantine_expired, mark_import_quarantine_swept.
--   §5 vocabularies and registry data: custody.imported; the canonical-write action retention.import.admit; the import forms in
--      objects.schema_registry.
--   §6 the interface register.
--
-- The refusals: 'retention import rejected: …' and the class-suffixed 'retention import rejected (dependency|ontology|identifier|
-- contract_changed|duplicate): …' (42501 → 403 for "recorded by the acting principal", "the opener of an import", "the approver of an
-- import", "no policy decision"; 23503 → 404 for "no such …" and the dependency and identifier absences; 22023 → 409 for the record's
-- state, the digest, the classes; 422 otherwise), 'exchange partner rejected: …' likewise, and 'retention notice rejected: …' as 0074
-- left it — added to the mapper (observation-errors.ts).

-- ============================================================
-- §1 held recipients (D6, Codex B14-F1)
-- ============================================================
-- WHAT IS PROVEN about a delivery, from its state, its failure class and the recorded failure (the receipt column of a failed row carries
-- {failure: {class, egress, message, status, request_sent, files_left, …}} — export-delivery.service.ts): the recipient HOLDS the bytes
-- (delivered, acknowledged, mismatched → 'confirmed'); the bytes MAY have reached it ('possible' — the endpoint answered with a body that
-- was not a JSON object; a transport failure with an answer status, a timeout, a transport or size failure, an egress the classifier could
-- not name or the request known to have been sent; a redirect answered after the body; a station write that left files behind); or
-- NOTHING is known to have reached it (NULL — the credential unbound, the destination retired, the egress refused before connecting, the
-- name unresolved or the TLS handshake failed with the request not known sent, a station write with nothing left). Rows written before
-- B16 carry no request_sent: its absence is unknown, which the rule reads as it says above. Pure over its arguments.
CREATE OR REPLACE FUNCTION retention.export_delivery_held(p_state text, p_failure_class text, p_receipt jsonb) RETURNS text
IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE
    WHEN p_state IN ('delivered', 'acknowledged', 'mismatched') THEN 'confirmed'
    WHEN p_state IS DISTINCT FROM 'failed' THEN NULL
    WHEN p_failure_class = 'receipt_invalid' THEN 'possible'
    WHEN p_failure_class = 'transport' AND (
           (p_receipt -> 'failure' ->> 'status') ~ '^[0-9]+$'
        OR (p_receipt -> 'failure' ->> 'egress') IN ('timeout', 'transport_failure', 'response_too_large', 'decompressed_too_large')
        OR (p_receipt -> 'failure' ->> 'egress') IS NULL
        OR (p_receipt -> 'failure' -> 'request_sent') = 'true'::jsonb) THEN 'possible'
    WHEN p_failure_class = 'egress_refused' AND (p_receipt -> 'failure' ->> 'egress') = 'redirect_not_followed' THEN 'possible'
    WHEN p_failure_class = 'write_failed' AND jsonb_typeof(p_receipt -> 'failure' -> 'files_left') = 'array' AND jsonb_array_length(p_receipt -> 'failure' -> 'files_left') > 0 THEN 'possible'
    ELSE NULL
  END
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION retention.export_delivery_held(text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.export_delivery_held(text,text,jsonb) TO eye_app, eye_commit;

-- THE DESTINATIONS THAT HOLD OR MAY HOLD a package: distinct destinations with a delivery export_delivery_held classifies, each at its
-- STRONGEST level (confirmed before possible) with the latest delivery at that level — the revoke act's list of whom to notify, and the
-- gate of begin_revocation_notice. DROPPED in its 0074 form (RETURNS TABLE changes — the 0074 precedent for declare_export_destination)
-- and declared one column longer: held.
DROP FUNCTION retention.export_recipients(uuid);
CREATE OR REPLACE FUNCTION retention.export_recipients(p_action_id uuid)
RETURNS TABLE (destination_id uuid, destination_key text, kind text, recipient text, delivery_id uuid, attempt int, delivery_state text, retired_at timestamptz, held text)
STABLE SET search_path = retention, pg_catalog, pg_temp AS $$
  SELECT DISTINCT ON (d.destination_id) d.destination_id, x.destination_key, x.kind, x.recipient, d.delivery_id, d.attempt, d.state, x.retired_at, h.held
    FROM retention.export_deliveries d
    JOIN retention.export_destinations x ON x.destination_id = d.destination_id
    CROSS JOIN LATERAL (SELECT retention.export_delivery_held(d.state, d.failure_class, d.receipt) AS held) h
   WHERE d.action_id = p_action_id AND h.held IS NOT NULL
   ORDER BY d.destination_id, (h.held = 'confirmed') DESC, d.delivered_at DESC, d.attempt DESC;
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION retention.export_recipients(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.export_recipients(uuid) TO eye_app, eye_commit;

-- revoke_export re-declared (0074 §4's body): the recipients carry held. The row and the event unchanged.
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
  SELECT coalesce(jsonb_agg(jsonb_build_object('destination_id', q.destination_id, 'destination_key', q.destination_key, 'kind', q.kind, 'recipient', q.recipient, 'delivery_id', q.delivery_id, 'attempt', q.attempt, 'delivery_state', q.delivery_state, 'retired_at', q.retired_at, 'held', q.held) ORDER BY q.destination_key), '[]'::jsonb)
    INTO v_recipients FROM retention.export_recipients(p_action_id) q;
  RETURN jsonb_build_object('action_id', p_action_id, 'locator_prefix', x.locator_prefix, 'package_digest', x.package_digest, 'revoked_at', clock_timestamp(), 'recipients', v_recipients);
END $$ LANGUAGE plpgsql;

-- begin_revocation_notice re-declared (0074 §3's body): the gate is export_recipients — a destination that holds or may hold the package —
-- with the refusal naming what is proven when nothing is; the answer's delivery carries held.
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
  IF NOT FOUND THEN
    RAISE EXCEPTION 'retention notice rejected: destination % never received the package of % — nothing is known to have reached it (credential unbound, the egress refused before connecting, the name unresolved or the TLS handshake failed); nothing to notify', dst.destination_key, p_action_id USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(retention.lock_key_export_deliveries(p_action_id));
  SELECT 1 + count(*)::int INTO v_attempt FROM retention.export_revocation_notices n WHERE n.action_id = p_action_id AND n.destination_id = p_destination_id;
  RETURN jsonb_build_object('notice_id', gen_random_uuid(), 'attempt', v_attempt, 'package', to_jsonb(x), 'destination', to_jsonb(dst),
                            'delivery', jsonb_build_object('delivery_id', r.delivery_id, 'attempt', r.attempt, 'state', r.delivery_state, 'held', r.held));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.begin_revocation_notice(uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.begin_revocation_notice(uuid,uuid,uuid,uuid,uuid,uuid) TO eye_commit;

-- record_revocation_notice re-declared (0074 §3's body): the delivery the notice concerns is one the destination received OR MAY HOLD
-- (export_delivery_held not null), and the event carries the delivery's state and held. Every other line as 0074 left it.
CREATE OR REPLACE FUNCTION retention.record_revocation_notice(
  p_notice_id uuid, p_action_id uuid, p_tenant uuid, p_domain uuid, p_destination_id uuid, p_delivery_id uuid, p_attempt int, p_state text, p_notice jsonb, p_notice_digest text,
  p_receipt jsonb, p_receipt_digest text, p_failure_class text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a retention.actions_current%ROWTYPE; x retention.export_packages%ROWTYPE; dst retention.export_destinations%ROWTYPE; d retention.export_deliveries%ROWTYPE; n retention.export_revocation_notices%ROWTYPE; i RECORD; m RECORD; v_evd uuid; v_obs uuid; v_at timestamptz; v_next int; v_event text; v_details jsonb; v_other boolean;
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
  -- B16 (D6): the delivery is one the destination received or may hold — what export_delivery_held proves, not the state alone.
  SELECT * INTO d FROM retention.export_deliveries q WHERE q.delivery_id = p_delivery_id AND q.action_id = p_action_id AND q.destination_id = p_destination_id
                                                       AND retention.export_delivery_held(q.state, q.failure_class, q.receipt) IS NOT NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'retention notice rejected: delivery % is not a delivery of % that % received or may hold', p_delivery_id, p_action_id, dst.destination_key USING ERRCODE = '22023';
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
                                  'package_digest', x.package_digest, 'archive_digest', x.archive_digest, 'notice_digest', p_notice_digest, 'receipt_digest', p_receipt_digest, 'failure_class', p_failure_class, 'revoked_at', x.revoked_at,
                                  'held', retention.export_delivery_held(d.state, d.failure_class, d.receipt), 'delivery_state', d.state);
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

-- ============================================================
-- §2 the versioned closure (Codex B15-F1)
-- ============================================================
-- Nothing in SQL: links.json becomes eye-customer-export-links/2 in the code (retention.service.ts linksOf — every exact
-- (object_id, object_version) a resolving lineage row or an included edge names is exported; membership by pair; an excluded required
-- version recorded with its dependent edges), the verifier and the import validate by pair; verify_action (0075) counts the file as before.
-- The register's clause (§6) carries it.

-- ============================================================
-- §3 the exchange partner (D2)
-- ============================================================
-- A PARTNER is the party whose key signs the packages this domain accepts: its Ed25519 public key (the PEM recorded, the id the first 16
-- hex of sha256(the SPKI DER) — the shape 0073 §2 fixed for the tenant's own signing keys), who signs (the party) and why this domain
-- accepts its packages (the purpose), and the INTAKE SOURCE CONTRACT of this domain the imported manifests are recorded under — an
-- ACTIVE upload contract with CONFIRMED rights, whose classification ceiling is the import's policy gate and whose retention and licence
-- travel with the admission. One active partner per key and per partner key in a domain (a retired one may be declared again as a new
-- row). Retired once, the row kept; a retired partner's key resolves no import (the open finds it among the ACTIVE partners) and an
-- admission begun after its retirement is refused (contract_changed).
CREATE TABLE retention.exchange_partners (
  partner_id              uuid PRIMARY KEY,
  scope                   text NOT NULL,
  tenant_id               uuid NOT NULL,
  domain_id               uuid NOT NULL,
  partner_key             text NOT NULL CHECK (partner_key ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  party                   text NOT NULL CHECK (length(btrim(party)) >= 1),
  purpose                 text NOT NULL CHECK (length(btrim(purpose)) >= 1),
  key_id                  text NOT NULL CHECK (key_id ~ '^ed25519:[0-9a-f]{16}$'),
  algorithm               text NOT NULL CHECK (algorithm = 'Ed25519'),
  public_key_pem          text NOT NULL,
  intake_source_id        uuid NOT NULL,
  intake_contract_version int NOT NULL CHECK (intake_contract_version >= 1),
  declared_by             uuid NOT NULL,
  declared_at             timestamptz NOT NULL DEFAULT clock_timestamp(),
  retired_by              uuid,
  retired_at              timestamptz,
  retire_reason           text,
  correlation_id          uuid NOT NULL,
  CONSTRAINT rxpt_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT rxpt_retire_pair CHECK ((retired_by IS NULL) = (retired_at IS NULL) AND (retired_at IS NULL) = (retire_reason IS NULL) AND (retired_at IS NULL OR length(btrim(retire_reason)) >= 8))
);
CREATE UNIQUE INDEX rxpt_key_active ON retention.exchange_partners (tenant_id, domain_id, key_id) WHERE retired_at IS NULL;
CREATE UNIQUE INDEX rxpt_partner_key_active ON retention.exchange_partners (tenant_id, domain_id, partner_key) WHERE retired_at IS NULL;
CREATE INDEX rxpt_domain ON retention.exchange_partners (tenant_id, domain_id, declared_at);
-- The retirement is the ONE change a partner row takes, once (0074 §2's rule for a destination).
CREATE OR REPLACE FUNCTION retention.exchange_partners_retire_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'table retention.exchange_partners is append-only (ADR-P0-07): DELETE prohibited' USING ERRCODE = '42501'; END IF;
  IF OLD.retired_at IS NOT NULL OR NEW.retired_at IS NULL
     OR NEW.partner_id IS DISTINCT FROM OLD.partner_id OR NEW.scope IS DISTINCT FROM OLD.scope OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.domain_id IS DISTINCT FROM OLD.domain_id
     OR NEW.partner_key IS DISTINCT FROM OLD.partner_key OR NEW.party IS DISTINCT FROM OLD.party OR NEW.purpose IS DISTINCT FROM OLD.purpose
     OR NEW.key_id IS DISTINCT FROM OLD.key_id OR NEW.algorithm IS DISTINCT FROM OLD.algorithm OR NEW.public_key_pem IS DISTINCT FROM OLD.public_key_pem
     OR NEW.intake_source_id IS DISTINCT FROM OLD.intake_source_id OR NEW.intake_contract_version IS DISTINCT FROM OLD.intake_contract_version
     OR NEW.declared_by IS DISTINCT FROM OLD.declared_by OR NEW.declared_at IS DISTINCT FROM OLD.declared_at OR NEW.correlation_id IS DISTINCT FROM OLD.correlation_id THEN
    RAISE EXCEPTION 'an exchange partner is retired once; nothing else about it changes' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rxpt_retire_only BEFORE UPDATE OR DELETE ON retention.exchange_partners FOR EACH ROW EXECUTE FUNCTION retention.exchange_partners_retire_only();
ALTER TABLE retention.exchange_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention.exchange_partners FORCE ROW LEVEL SECURITY;
CREATE POLICY retention_isolation ON retention.exchange_partners
  USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
REVOKE ALL ON retention.exchange_partners FROM PUBLIC;
GRANT SELECT ON retention.exchange_partners TO eye_app, eye_commit;

-- THE DECLARATION (retention.partner.declare — the platform's, the tenant's or the domain's administrator; human-gated): the key's shape
-- and its id (as declare_export_signing_key checks them — the body decodes to the 44-byte Ed25519 SubjectPublicKeyInfo, the id the first
-- 16 hex of its sha256), the party, the purpose, the intake contract (present in this domain; an active upload contract with confirmed
-- rights — else the refusal names what it is), then, under the domain's partner lock, no active partner already holding the key and no
-- active partner under the partner key (the partial unique indexes are the backstop). Returns the row.
CREATE OR REPLACE FUNCTION retention.declare_exchange_partner(
  p_partner_id uuid, p_tenant uuid, p_domain uuid, p_partner_key text, p_party text, p_purpose text, p_key_id text, p_algorithm text, p_public_key_pem text,
  p_intake_source_id uuid, p_intake_contract_version int, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE xp retention.exchange_partners%ROWTYPE; s observation.source_contracts_current%ROWTYPE; v_body text; v_der bytea; v_holder text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.partner.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'exchange partner rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_partner_id IS NULL THEN RAISE EXCEPTION 'exchange partner rejected: the partner id is the one the declaration minted' USING ERRCODE = '22023'; END IF;
  IF p_partner_key IS NULL OR p_partner_key !~ '^[a-z0-9][a-z0-9-]{1,63}$' THEN RAISE EXCEPTION 'exchange partner rejected: the partner key is 2 to 64 characters of a-z, 0-9 and -, starting with a letter or a digit' USING ERRCODE = '22023'; END IF;
  IF coalesce(length(btrim(p_party)), 0) < 1 THEN RAISE EXCEPTION 'exchange partner rejected: the party names who signs' USING ERRCODE = '22023'; END IF;
  IF coalesce(length(btrim(p_purpose)), 0) < 1 THEN RAISE EXCEPTION 'exchange partner rejected: the purpose says why this domain accepts the party''s packages' USING ERRCODE = '22023'; END IF;
  IF p_algorithm IS DISTINCT FROM 'Ed25519' THEN RAISE EXCEPTION 'exchange partner rejected: the algorithm is Ed25519' USING ERRCODE = '22023'; END IF;
  IF p_public_key_pem IS NULL OR p_public_key_pem !~ '^-----BEGIN PUBLIC KEY-----\n([A-Za-z0-9+/=]+\n)+-----END PUBLIC KEY-----\n?$' THEN
    RAISE EXCEPTION 'exchange partner rejected: the public key is an Ed25519 SPKI PEM whose id is ed25519:<the first 16 hex of sha256(the SPKI DER)>' USING ERRCODE = '22023';
  END IF;
  v_body := regexp_replace(p_public_key_pem, '-----(BEGIN|END) PUBLIC KEY-----|\s', '', 'g');
  IF v_body !~ '^[A-Za-z0-9+/]+={0,2}$' OR length(v_body) % 4 <> 0 THEN
    RAISE EXCEPTION 'exchange partner rejected: the public key is an Ed25519 SPKI PEM whose id is ed25519:<the first 16 hex of sha256(the SPKI DER)>' USING ERRCODE = '22023';
  END IF;
  v_der := decode(v_body, 'base64');
  IF length(v_der) <> 44 OR substring(v_der from 1 for 12) <> '\x302a300506032b6570032100'::bytea THEN
    RAISE EXCEPTION 'exchange partner rejected: the public key is an Ed25519 SPKI PEM whose id is ed25519:<the first 16 hex of sha256(the SPKI DER)>' USING ERRCODE = '22023';
  END IF;
  IF p_key_id IS DISTINCT FROM 'ed25519:' || left(encode(sha256(v_der), 'hex'), 16) THEN
    RAISE EXCEPTION 'exchange partner rejected: the public key is an Ed25519 SPKI PEM whose id is ed25519:<the first 16 hex of sha256(the SPKI DER)>' USING ERRCODE = '22023';
  END IF;
  IF p_intake_source_id IS NULL OR p_intake_contract_version IS NULL OR p_intake_contract_version < 1 THEN RAISE EXCEPTION 'exchange partner rejected: the intake source is named by its id and its contract version' USING ERRCODE = '22023'; END IF;
  SELECT * INTO s FROM observation.source_contracts_current c WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.source_id = p_intake_source_id AND c.contract_version = p_intake_contract_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'exchange partner rejected: no such intake source %@% in this domain', p_intake_source_id, p_intake_contract_version USING ERRCODE = '23503'; END IF;
  IF s.connector_kind <> 'upload' OR s.lifecycle_state <> 'active' OR s.rights_state <> 'confirmed' THEN
    RAISE EXCEPTION 'exchange partner rejected: the intake source %@% is not an active upload contract with confirmed rights (it is %, %, rights %)', s.source_key, s.contract_version, s.connector_kind, s.lifecycle_state, s.rights_state USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('retention.exchange_partners:' || p_tenant::text || ':' || p_domain::text, 0));
  SELECT y.partner_key INTO v_holder FROM retention.exchange_partners y WHERE y.tenant_id = p_tenant AND y.domain_id = p_domain AND y.key_id = p_key_id AND y.retired_at IS NULL;
  IF v_holder IS NOT NULL THEN RAISE EXCEPTION 'exchange partner rejected: key % is already declared by partner % (retire it to declare it again)', p_key_id, v_holder USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM retention.exchange_partners y WHERE y.tenant_id = p_tenant AND y.domain_id = p_domain AND y.partner_key = p_partner_key AND y.retired_at IS NULL) THEN
    RAISE EXCEPTION 'exchange partner rejected: % is already declared in this domain (retire it to declare it again)', p_partner_key USING ERRCODE = '22023';
  END IF;
  INSERT INTO retention.exchange_partners (partner_id, scope, tenant_id, domain_id, partner_key, party, purpose, key_id, algorithm, public_key_pem, intake_source_id, intake_contract_version, declared_by, declared_at, correlation_id)
  VALUES (p_partner_id, 'DOMAIN', p_tenant, p_domain, p_partner_key, p_party, p_purpose, p_key_id, 'Ed25519', p_public_key_pem, p_intake_source_id, p_intake_contract_version, p_actor, clock_timestamp(), p_correlation)
  RETURNING * INTO xp;
  RETURN to_jsonb(xp);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.declare_exchange_partner(uuid,uuid,uuid,text,text,text,text,text,text,uuid,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.declare_exchange_partner(uuid,uuid,uuid,text,text,text,text,text,text,uuid,int,uuid,uuid) TO eye_commit;

-- THE RETIREMENT (retention.partner.retire): once, with a reason; the row kept. Returns the row after.
CREATE OR REPLACE FUNCTION retention.retire_exchange_partner(p_partner_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE xp retention.exchange_partners%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.partner.retire']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'exchange partner rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'exchange partner rejected: a reason of 8+ characters' USING ERRCODE = '22023'; END IF;
  SELECT * INTO xp FROM retention.exchange_partners y WHERE y.partner_id = p_partner_id AND y.tenant_id = p_tenant AND y.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'exchange partner rejected: no such partner % in this domain', p_partner_id USING ERRCODE = '23503'; END IF;
  IF xp.retired_at IS NOT NULL THEN RAISE EXCEPTION 'exchange partner rejected: % is retired', xp.partner_key USING ERRCODE = '22023'; END IF;
  UPDATE retention.exchange_partners SET retired_at = clock_timestamp(), retired_by = p_actor, retire_reason = p_reason WHERE partner_id = p_partner_id RETURNING * INTO xp;
  RETURN to_jsonb(xp);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.retire_exchange_partner(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.retire_exchange_partner(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

-- ============================================================
-- §4 the import ledger (D1, D3, D4, D5)
-- ============================================================
-- AN IMPORT: what came in (the intake — inline or a transfer station; the origin the manifest states; the exchange block delivery.json
-- or the presented one; the archive's digest and size; the package digest RECOMPUTED by the chain — NULL when it could not be; the
-- quarantine locators of manifest.json and links.json), what was found (verified with the ordered checks, or quarantined with them —
-- rim_verified: quarantined ⇔ not verified, every state beyond ⇔ verified; a verified import names the partner whose key signed it
-- (rim_verified_partner) and the digest its chain recomputed (rim_verified_digest)), and the gate it moved through (opened → approved
-- → admitting → admitted; withdrawn from any state before admitted, admitting included — an interrupted admission is closed by a
-- withdrawal, never left for good). One LIVE import of a package per domain (rim_live_package: a quarantined or withdrawn row does not
-- hold the digest). The state moves by the trigger's transitions alone.
CREATE TABLE retention.imports (
  import_id          uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  partner_id         uuid,
  intake             jsonb NOT NULL CHECK (jsonb_typeof(intake) = 'object'),
  origin             jsonb NOT NULL CHECK (jsonb_typeof(origin) = 'object'),
  exchange           jsonb CHECK (exchange IS NULL OR jsonb_typeof(exchange) = 'object'),
  archive_digest     text NOT NULL CHECK (archive_digest ~ '^[0-9a-f]{64}$'),
  archive_size       bigint NOT NULL CHECK (archive_size >= 0),
  package_digest     text CHECK (package_digest IS NULL OR package_digest ~ '^[0-9a-f]{64}$'),
  manifest_locator   text,
  links_locator      text,
  state              text NOT NULL CHECK (state IN ('quarantined', 'verified', 'approved', 'admitting', 'admitted', 'withdrawn')),
  verified           boolean NOT NULL,
  checks             jsonb NOT NULL CHECK (jsonb_typeof(checks) = 'array'),
  counts             jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(counts) = 'object'),
  opened_by          uuid NOT NULL,
  opened_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  approved_by        uuid,
  approved_at        timestamptz,
  approval_rationale text,
  admitted_by        uuid,
  admitted_at        timestamptz,
  attempts           int NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  withdrawn_by       uuid,
  withdrawn_at       timestamptz,
  withdraw_reason    text,
  correlation_id     uuid NOT NULL,
  CONSTRAINT rim_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT rim_verified CHECK ((state = 'quarantined' AND NOT verified) OR (state IN ('verified', 'approved', 'admitting', 'admitted') AND verified) OR state = 'withdrawn'),
  CONSTRAINT rim_verified_partner CHECK (verified = false OR partner_id IS NOT NULL),
  CONSTRAINT rim_verified_digest CHECK (verified = false OR package_digest IS NOT NULL),
  CONSTRAINT rim_approved CHECK ((approved_at IS NULL) = (approved_by IS NULL) AND (approved_at IS NULL) = (approval_rationale IS NULL) AND (state IN ('quarantined', 'verified') OR state = 'withdrawn' OR approved_at IS NOT NULL)),
  CONSTRAINT rim_admitted CHECK ((state = 'admitted') = (admitted_at IS NOT NULL) AND (admitted_at IS NULL) = (admitted_by IS NULL)),
  CONSTRAINT rim_withdrawn CHECK ((state = 'withdrawn') = (withdrawn_at IS NOT NULL) AND (withdrawn_at IS NULL) = (withdrawn_by IS NULL) AND (withdrawn_at IS NULL) = (withdraw_reason IS NULL))
);
CREATE UNIQUE INDEX rim_live_package ON retention.imports (tenant_id, domain_id, package_digest) WHERE state NOT IN ('quarantined', 'withdrawn');
CREATE INDEX rim_domain ON retention.imports (tenant_id, domain_id, opened_at);
CREATE INDEX rim_quarantine ON retention.imports (opened_at) WHERE state IN ('quarantined', 'withdrawn');
-- THE TRANSITIONS: verified → approved (the approver, the instant, the rationale); approved → admitting and admitting → admitting (the
-- attempt counted, nothing else); admitting → admitted (the admitter, the instant, the counts); quarantined, verified, approved or
-- admitting → withdrawn (who, when, why — verified and the attempts untouched: what was found stays found). Every other column is
-- compared whole (the row as JSON minus the columns the move owns), so nothing else about an import changes; DELETE is refused.
CREATE OR REPLACE FUNCTION retention.imports_transitions_only() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_old jsonb; v_new jsonb; v_ok boolean := false;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'table retention.imports is append-only (ADR-P0-07): DELETE prohibited' USING ERRCODE = '42501'; END IF;
  v_old := to_jsonb(OLD); v_new := to_jsonb(NEW);
  IF OLD.state = 'verified' AND NEW.state = 'approved' THEN
    v_ok := OLD.approved_at IS NULL AND NEW.approved_by IS NOT NULL AND NEW.approved_at IS NOT NULL AND length(btrim(coalesce(NEW.approval_rationale, ''))) >= 8
            AND (v_new - ARRAY['state', 'approved_by', 'approved_at', 'approval_rationale']) = (v_old - ARRAY['state', 'approved_by', 'approved_at', 'approval_rationale']);
  ELSIF OLD.state IN ('approved', 'admitting') AND NEW.state = 'admitting' THEN
    v_ok := NEW.attempts = OLD.attempts + 1 AND (v_new - ARRAY['state', 'attempts']) = (v_old - ARRAY['state', 'attempts']);
  ELSIF OLD.state = 'admitting' AND NEW.state = 'admitted' THEN
    v_ok := OLD.admitted_at IS NULL AND NEW.admitted_by IS NOT NULL AND NEW.admitted_at IS NOT NULL AND jsonb_typeof(NEW.counts) = 'object'
            AND (v_new - ARRAY['state', 'admitted_by', 'admitted_at', 'counts']) = (v_old - ARRAY['state', 'admitted_by', 'admitted_at', 'counts']);
  ELSIF OLD.state IN ('quarantined', 'verified', 'approved', 'admitting') AND NEW.state = 'withdrawn' THEN
    v_ok := OLD.withdrawn_at IS NULL AND NEW.withdrawn_by IS NOT NULL AND NEW.withdrawn_at IS NOT NULL AND length(btrim(coalesce(NEW.withdraw_reason, ''))) >= 8
            AND (v_new - ARRAY['state', 'withdrawn_by', 'withdrawn_at', 'withdraw_reason']) = (v_old - ARRAY['state', 'withdrawn_by', 'withdrawn_at', 'withdraw_reason']);
  END IF;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'an import moves by its governed acts alone (verified → approved → admitting → admitted; quarantined, verified, approved or admitting → withdrawn); nothing else about it changes' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rim_transitions_only BEFORE UPDATE OR DELETE ON retention.imports FOR EACH ROW EXECUTE FUNCTION retention.imports_transitions_only();
ALTER TABLE retention.imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention.imports FORCE ROW LEVEL SECURITY;
CREATE POLICY retention_isolation ON retention.imports
  USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
REVOKE ALL ON retention.imports FROM PUBLIC;
GRANT SELECT ON retention.imports TO eye_app, eye_commit;

-- THE ITEMS — the plan and the map: one row per thing the package carries (a record or claim version '<object_id>@<version>', an entity,
-- an edge, an identifier system, an identifier) or excluded ('excluded:<kind>:<ref>' — the origin's own exclusions, settled at the open
-- with the gate origin_excluded), with what the package said (origin), where its bytes wait (staged: the quarantine locator, digest, size
-- and file of a record), the ids this installation minted for it (planned), and — once the admission reaches it — what became of it:
-- admitted (what was admitted), reused (a version already admitted from an earlier package: rii_reuse and rii_reuse_object, by origin
-- reference and by origin OBJECT id), excluded or refused with the gate and the reason. Settled once (rii_settled: staged ⇔ not yet
-- settled); the dependency order is the admission's order.
CREATE TABLE retention.import_items (
  item_id          uuid PRIMARY KEY,
  import_id        uuid NOT NULL REFERENCES retention.imports (import_id),
  scope            text NOT NULL,
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  kind             text NOT NULL CHECK (kind IN ('record', 'claim', 'entity', 'identifier_system', 'identifier', 'edge', 'exclusion')),
  origin_ref       text NOT NULL CHECK (length(origin_ref) >= 1),
  origin_object_id uuid,
  origin           jsonb NOT NULL CHECK (jsonb_typeof(origin) = 'object'),
  staged           jsonb CHECK (staged IS NULL OR jsonb_typeof(staged) = 'object'),
  planned          jsonb NOT NULL CHECK (jsonb_typeof(planned) = 'object'),
  disposition      text NOT NULL CHECK (disposition IN ('staged', 'admitted', 'reused', 'excluded', 'refused')),
  gate             text,
  reason           text,
  admitted         jsonb CHECK (admitted IS NULL OR jsonb_typeof(admitted) = 'object'),
  dependency_order int NOT NULL,
  admitted_at      timestamptz,
  correlation_id   uuid NOT NULL,
  CONSTRAINT rii_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT rii_gate CHECK (gate IS NULL OR gate IN ('ceiling', 'content', 'header', 'schema', 'oversize', 'integrity', 'dependency', 'ontology', 'identifier', 'record', 'evidence', 'redaction', 'origin_excluded', 'duplicate')),
  CONSTRAINT rii_settled CHECK ((disposition = 'staged') = (admitted_at IS NULL)),
  CONSTRAINT rii_outcome CHECK ((disposition IN ('excluded', 'refused')) = (gate IS NOT NULL) AND (disposition NOT IN ('excluded', 'refused') OR reason IS NOT NULL) AND (disposition NOT IN ('admitted', 'reused') OR admitted IS NOT NULL)),
  CONSTRAINT rii_unique UNIQUE (import_id, kind, origin_ref)
);
CREATE INDEX rii_import ON retention.import_items (import_id, dependency_order);
CREATE INDEX rii_reuse ON retention.import_items (tenant_id, domain_id, kind, origin_ref) WHERE disposition IN ('admitted', 'reused');
CREATE INDEX rii_reuse_object ON retention.import_items (tenant_id, domain_id, kind, origin_object_id) WHERE disposition IN ('admitted', 'reused');
CREATE OR REPLACE FUNCTION retention.import_items_settle_once() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'table retention.import_items is append-only (ADR-P0-07): DELETE prohibited' USING ERRCODE = '42501'; END IF;
  IF OLD.disposition <> 'staged' OR NEW.disposition NOT IN ('admitted', 'reused', 'excluded', 'refused') OR NEW.admitted_at IS NULL
     OR (to_jsonb(NEW) - ARRAY['disposition', 'gate', 'reason', 'admitted', 'admitted_at']) <> (to_jsonb(OLD) - ARRAY['disposition', 'gate', 'reason', 'admitted', 'admitted_at']) THEN
    RAISE EXCEPTION 'an import item is settled once — admitted, reused, excluded or refused, with its gate, reason and outcome; nothing else about it changes' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rii_settle_once BEFORE UPDATE OR DELETE ON retention.import_items FOR EACH ROW EXECUTE FUNCTION retention.import_items_settle_once();
ALTER TABLE retention.import_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention.import_items FORCE ROW LEVEL SECURITY;
CREATE POLICY retention_isolation ON retention.import_items
  USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
REVOKE ALL ON retention.import_items FROM PUBLIC;
GRANT SELECT ON retention.import_items TO eye_app, eye_commit;

-- THE EVENTS — what happened to an import and by whom: opened; verified or quarantined (the checks); approved (the digest, the
-- rationale); the admission started (the attempt), each batch admitted, admitted (the counts), finalized (the quarantine copies of the
-- admitted records tombstoned after the commit), failed (an attempt's fault, the import still admitting); withdrawn (the reason, what
-- stood); the evidence tombstoned (a withdrawal's or the sweeper's completion). Append-only; RLS as retention's other tables.
CREATE TABLE retention.import_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  import_id          uuid NOT NULL,
  event              text NOT NULL CHECK (event IN ('import.opened', 'import.verified', 'import.quarantined', 'import.approved', 'import.admission_started', 'import.batch_admitted', 'import.admitted', 'import.finalized', 'import.failed', 'import.withdrawn', 'import.evidence_tombstoned')),
  actor_principal_id uuid,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT rie_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX rie_import ON retention.import_events (import_id, occurred_at);
CREATE TRIGGER rie_append_only BEFORE UPDATE OR DELETE ON retention.import_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
ALTER TABLE retention.import_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention.import_events FORCE ROW LEVEL SECURITY;
CREATE POLICY retention_isolation ON retention.import_events
  USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
REVOKE ALL ON retention.import_events FROM PUBLIC;
GRANT SELECT ON retention.import_events TO eye_app, eye_commit;

-- The ledger's writer — retention.event's shape (0066 §4): no authority check of its own and no EXECUTE grant (C18); called only from the
-- SECURITY DEFINER ports below, each with its own assert_authority.
CREATE OR REPLACE FUNCTION retention.import_event(p_import_id uuid, p_tenant uuid, p_domain uuid, p_event text, p_actor uuid, p_details jsonb, p_correlation uuid) RETURNS void
SET search_path = retention, pg_catalog, pg_temp AS $$
  INSERT INTO retention.import_events (event_id, scope, tenant_id, domain_id, import_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_import_id, p_event, p_actor, coalesce(p_details, '{}'::jsonb), p_correlation);
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION retention.import_event(uuid,uuid,uuid,text,uuid,jsonb,uuid) FROM PUBLIC;

-- The two readers the admission ports share (no grant — internal): the import of this domain in state ADMITTING, its row locked FOR
-- SHARE for the batch (a concurrent withdrawal waits for the batch's commit and the next batch finds the import withdrawn — C3); and
-- the item of the import, still STAGED and of the kind the port admits, locked FOR UPDATE.
CREATE OR REPLACE FUNCTION retention.import_admitting(p_import_id uuid, p_tenant uuid, p_domain uuid) RETURNS retention.imports
SET search_path = retention, pg_catalog, pg_temp AS $$
DECLARE i retention.imports%ROWTYPE;
BEGIN
  SELECT * INTO i FROM retention.imports x WHERE x.import_id = p_import_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention import rejected: no such import % in this domain', p_import_id USING ERRCODE = '23503'; END IF;
  IF i.state <> 'admitting' THEN RAISE EXCEPTION 'retention import rejected: import % is %, not admitting — only an admission in progress records what it admits', p_import_id, i.state USING ERRCODE = '22023'; END IF;
  RETURN i;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.import_admitting(uuid,uuid,uuid) FROM PUBLIC;
CREATE OR REPLACE FUNCTION retention.import_item_staged(p_item_id uuid, p_import_id uuid, p_kind text) RETURNS retention.import_items
SET search_path = retention, pg_catalog, pg_temp AS $$
DECLARE t retention.import_items%ROWTYPE;
BEGIN
  SELECT * INTO t FROM retention.import_items x WHERE x.item_id = p_item_id AND x.import_id = p_import_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention import rejected: no such item % of import % in this domain', p_item_id, p_import_id USING ERRCODE = '23503'; END IF;
  IF p_kind IS NOT NULL AND t.kind <> p_kind THEN RAISE EXCEPTION 'retention import rejected: item % of import % is a %, not a %', p_item_id, p_import_id, t.kind, p_kind USING ERRCODE = '22023'; END IF;
  IF t.disposition <> 'staged' THEN RAISE EXCEPTION 'retention import rejected: item % of import % is %, not staged', p_item_id, p_import_id, t.disposition USING ERRCODE = '22023'; END IF;
  RETURN t;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.import_item_staged(uuid,uuid,text) FROM PUBLIC;

-- THE OPEN (retention.import.open — the steward or the domain's administrator): the row as the service found it — VERIFIED when every
-- check passed, else QUARANTINED — with the ordered checks, the items of the plan (staged with the ids minted for them; the origin's own
-- exclusions settled at once — C9), and the events import.opened then import.verified (the checks) or import.quarantined (the failed
-- checks). The belts: a verified import names the partner whose key signed it and the digest its chain recomputed (C8); a named partner
-- is an active partner of this domain; ONE live import of a package per domain — the service checks first, this is the concurrent one,
-- under a per-digest transaction lock (the partial unique index is the backstop). A quarantined import records everything and refuses
-- nothing: the request and the evidence are preserved (DP-47-005). Returns the row.
CREATE OR REPLACE FUNCTION retention.record_import(
  p_import_id uuid, p_tenant uuid, p_domain uuid, p_partner_id uuid, p_intake jsonb, p_origin jsonb, p_exchange jsonb, p_archive_digest text, p_archive_size bigint,
  p_package_digest text, p_manifest_locator text, p_links_locator text, p_verified boolean, p_checks jsonb, p_counts jsonb, p_items jsonb, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i retention.imports%ROWTYPE; xp retention.exchange_partners%ROWTYPE; live retention.imports%ROWTYPE; it jsonb; v_kind text; v_disposition text; v_n int := 0; v_excluded int := 0;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.import.open']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'retention import rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_import_id IS NULL THEN RAISE EXCEPTION 'retention import rejected: the import id is the one the open minted' USING ERRCODE = '22023'; END IF;
  IF p_intake IS NULL OR jsonb_typeof(p_intake) <> 'object' OR (p_intake ->> 'kind') IS NULL OR (p_intake ->> 'kind') NOT IN ('inline', 'station') THEN RAISE EXCEPTION 'retention import rejected: the intake is inline or station' USING ERRCODE = '22023'; END IF;
  IF p_origin IS NULL OR jsonb_typeof(p_origin) <> 'object' THEN RAISE EXCEPTION 'retention import rejected: the origin is what the manifest states, as a JSON object' USING ERRCODE = '22023'; END IF;
  IF p_exchange IS NOT NULL AND jsonb_typeof(p_exchange) <> 'object' THEN RAISE EXCEPTION 'retention import rejected: the exchange block is a JSON object' USING ERRCODE = '22023'; END IF;
  IF p_archive_digest IS NULL OR p_archive_digest !~ '^[0-9a-f]{64}$' OR p_archive_size IS NULL OR p_archive_size < 0 THEN RAISE EXCEPTION 'retention import rejected: the archive is recorded with its sha-256 hex and its size' USING ERRCODE = '22023'; END IF;
  IF p_package_digest IS NOT NULL AND p_package_digest !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'retention import rejected: the package digest is the sha-256 hex the chain recomputed' USING ERRCODE = '22023'; END IF;
  IF p_manifest_locator IS NOT NULL AND (p_manifest_locator <> p_tenant::text || '/' || p_domain::text || '/' || split_part(p_manifest_locator, '/', 3) OR split_part(p_manifest_locator, '/', 3) = '' OR array_length(string_to_array(p_manifest_locator, '/'), 1) <> 3)
     OR p_links_locator IS NOT NULL AND (p_links_locator <> p_tenant::text || '/' || p_domain::text || '/' || split_part(p_links_locator, '/', 3) OR split_part(p_links_locator, '/', 3) = '' OR array_length(string_to_array(p_links_locator, '/'), 1) <> 3) THEN
    RAISE EXCEPTION 'retention import rejected: a quarantine locator''s scope segments are this domain''s' USING ERRCODE = '42501';
  END IF;
  IF p_verified IS NULL OR p_checks IS NULL OR jsonb_typeof(p_checks) <> 'array' OR jsonb_array_length(p_checks) = 0 THEN RAISE EXCEPTION 'retention import rejected: an import records its ordered checks and whether they all passed' USING ERRCODE = '22023'; END IF;
  IF p_counts IS NOT NULL AND jsonb_typeof(p_counts) <> 'object' THEN RAISE EXCEPTION 'retention import rejected: the counts are a JSON object' USING ERRCODE = '22023'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN RAISE EXCEPTION 'retention import rejected: the items are a list' USING ERRCODE = '22023'; END IF;
  IF p_verified AND p_package_digest IS NULL THEN RAISE EXCEPTION 'retention import rejected: a verified import records the package digest its chain recomputed' USING ERRCODE = '22023'; END IF;
  -- C8: a verified import names the partner whose key signed it; a named partner is an active partner of this domain.
  IF p_verified AND p_partner_id IS NULL THEN RAISE EXCEPTION 'retention import rejected: a verified import names the partner whose key signed it' USING ERRCODE = '22023'; END IF;
  IF p_partner_id IS NOT NULL THEN
    SELECT * INTO xp FROM retention.exchange_partners y WHERE y.partner_id = p_partner_id AND y.tenant_id = p_tenant AND y.domain_id = p_domain FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'retention import rejected: no such partner % in this domain', p_partner_id USING ERRCODE = '23503'; END IF;
    IF xp.retired_at IS NOT NULL THEN RAISE EXCEPTION 'retention import rejected (contract_changed): partner % was retired at %', xp.partner_key, xp.retired_at USING ERRCODE = '22023'; END IF;
  END IF;
  -- The duplicate belt: one LIVE import of a package per domain, serialised per digest (the service refused first — check 13; this is the race).
  IF p_verified THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('retention.imports:' || p_tenant::text || ':' || p_domain::text || ':' || p_package_digest, 0));
    SELECT * INTO live FROM retention.imports y WHERE y.tenant_id = p_tenant AND y.domain_id = p_domain AND y.package_digest = p_package_digest AND y.state NOT IN ('quarantined', 'withdrawn') LIMIT 1;
    IF FOUND THEN RAISE EXCEPTION 'retention import rejected (duplicate): package % is already imported into this domain as import % (state %)', p_package_digest, live.import_id, live.state USING ERRCODE = '22023'; END IF;
  END IF;
  INSERT INTO retention.imports (import_id, scope, tenant_id, domain_id, partner_id, intake, origin, exchange, archive_digest, archive_size, package_digest, manifest_locator, links_locator, state, verified, checks, counts, opened_by, opened_at, correlation_id)
  VALUES (p_import_id, 'DOMAIN', p_tenant, p_domain, p_partner_id, p_intake, p_origin, p_exchange, p_archive_digest, p_archive_size, p_package_digest, p_manifest_locator, p_links_locator,
          CASE WHEN p_verified THEN 'verified' ELSE 'quarantined' END, p_verified, p_checks, coalesce(p_counts, '{}'::jsonb), p_actor, clock_timestamp(), p_correlation)
  RETURNING * INTO i;
  FOR it IN SELECT e FROM jsonb_array_elements(p_items) e LOOP
    v_n := v_n + 1;
    v_kind := it ->> 'kind'; v_disposition := it ->> 'disposition';
    IF jsonb_typeof(it) <> 'object' OR (it ->> 'item_id') IS NULL OR (it ->> 'item_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'retention import rejected: item % carries no item id', v_n USING ERRCODE = '22023';
    END IF;
    IF v_kind IS NULL OR v_kind NOT IN ('record', 'claim', 'entity', 'identifier_system', 'identifier', 'edge', 'exclusion') THEN
      RAISE EXCEPTION 'retention import rejected: item %: the kind is record, claim, entity, identifier_system, identifier, edge or exclusion', v_n USING ERRCODE = '22023';
    END IF;
    IF coalesce(length(it ->> 'origin_ref'), 0) < 1 THEN RAISE EXCEPTION 'retention import rejected: item %: the origin reference names what the package carried', v_n USING ERRCODE = '22023'; END IF;
    IF jsonb_typeof(it -> 'origin') IS DISTINCT FROM 'object' OR jsonb_typeof(it -> 'planned') IS DISTINCT FROM 'object' OR (it ? 'staged' AND jsonb_typeof(it -> 'staged') NOT IN ('object', 'null')) THEN
      RAISE EXCEPTION 'retention import rejected: item %: origin and planned are JSON objects and staged, when present, is one', v_n USING ERRCODE = '22023';
    END IF;
    IF (it ->> 'dependency_order') IS NULL OR (it ->> 'dependency_order') !~ '^-?[0-9]{1,9}$' THEN RAISE EXCEPTION 'retention import rejected: item %: the dependency order is an integer', v_n USING ERRCODE = '22023'; END IF;
    IF (it ->> 'origin_object_id') IS NOT NULL AND (it ->> 'origin_object_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'retention import rejected: item %: the origin object id is a uuid', v_n USING ERRCODE = '22023'; END IF;
    IF v_disposition IS NULL OR v_disposition NOT IN ('staged', 'excluded') THEN RAISE EXCEPTION 'retention import rejected: item %: at the open an item is staged or excluded', v_n USING ERRCODE = '22023'; END IF;
    IF v_disposition = 'excluded' AND ((it ->> 'gate') IS NULL OR coalesce(length(btrim(it ->> 'reason')), 0) < 1) THEN RAISE EXCEPTION 'retention import rejected: item %: an item excluded at the open carries its gate and the reason', v_n USING ERRCODE = '22023'; END IF;
    IF v_disposition = 'staged' AND ((it ->> 'gate') IS NOT NULL OR (it ->> 'reason') IS NOT NULL) THEN RAISE EXCEPTION 'retention import rejected: item %: a staged item carries no gate and no reason yet', v_n USING ERRCODE = '22023'; END IF;
    INSERT INTO retention.import_items (item_id, import_id, scope, tenant_id, domain_id, kind, origin_ref, origin_object_id, origin, staged, planned, disposition, gate, reason, admitted, dependency_order, admitted_at, correlation_id)
    VALUES ((it ->> 'item_id')::uuid, p_import_id, 'DOMAIN', p_tenant, p_domain, v_kind, it ->> 'origin_ref', (it ->> 'origin_object_id')::uuid, it -> 'origin',
            CASE WHEN jsonb_typeof(it -> 'staged') = 'object' THEN it -> 'staged' END, it -> 'planned', v_disposition, it ->> 'gate', it ->> 'reason', NULL, (it ->> 'dependency_order')::int,
            CASE WHEN v_disposition = 'excluded' THEN clock_timestamp() END, p_correlation);
    IF v_disposition = 'excluded' THEN v_excluded := v_excluded + 1; END IF;
  END LOOP;
  PERFORM retention.import_event(p_import_id, p_tenant, p_domain, 'import.opened', p_actor,
    jsonb_build_object('intake', p_intake, 'origin', p_origin, 'exchange', p_exchange, 'partner_id', p_partner_id, 'partner_key', xp.partner_key, 'archive_digest', p_archive_digest, 'archive_size', p_archive_size,
                       'package_digest', p_package_digest, 'counts', coalesce(p_counts, '{}'::jsonb), 'items', v_n, 'excluded_at_open', v_excluded), p_correlation);
  IF p_verified THEN
    PERFORM retention.import_event(p_import_id, p_tenant, p_domain, 'import.verified', p_actor, jsonb_build_object('checks', p_checks, 'package_digest', p_package_digest, 'partner_key', xp.partner_key), p_correlation);
  ELSE
    PERFORM retention.import_event(p_import_id, p_tenant, p_domain, 'import.quarantined', p_actor,
      jsonb_build_object('failed', (SELECT coalesce(jsonb_agg(c), '[]'::jsonb) FROM jsonb_array_elements(p_checks) c WHERE c -> 'ok' = 'false'::jsonb), 'checks', jsonb_array_length(p_checks), 'package_digest', p_package_digest), p_correlation);
  END IF;
  RETURN to_jsonb(i);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.record_import(uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb,text,bigint,text,text,text,boolean,jsonb,jsonb,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.record_import(uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb,text,bigint,text,text,text,boolean,jsonb,jsonb,jsonb,uuid,uuid) TO eye_commit;

-- THE APPROVAL (retention.import.approve — the retention authority or the tenant's administrator; human-gated): on the package digest the
-- approver read (a different digest is refused), never the opener, a VERIFIED import only, with a rationale; the row locked FOR UPDATE.
-- Returns the row after.
CREATE OR REPLACE FUNCTION retention.approve_import(p_import_id uuid, p_tenant uuid, p_domain uuid, p_package_digest text, p_rationale text, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i retention.imports%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.import.approve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'retention import rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF coalesce(length(btrim(p_rationale)), 0) < 8 THEN RAISE EXCEPTION 'retention import rejected: a rationale of 8+ characters' USING ERRCODE = '22023'; END IF;
  SELECT * INTO i FROM retention.imports x WHERE x.import_id = p_import_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention import rejected: no such import % in this domain', p_import_id USING ERRCODE = '23503'; END IF;
  IF p_actor = i.opened_by THEN RAISE EXCEPTION 'retention import rejected: the opener of an import does not approve it' USING ERRCODE = '42501'; END IF;
  IF i.state <> 'verified' THEN RAISE EXCEPTION 'retention import rejected: import % is %, not verified — only a verified import is approved', p_import_id, i.state USING ERRCODE = '22023'; END IF;
  IF p_package_digest IS DISTINCT FROM i.package_digest THEN RAISE EXCEPTION 'retention import rejected: the digest approved (%) is not the package''s (%)', coalesce(p_package_digest, '<none>'), i.package_digest USING ERRCODE = '22023'; END IF;
  UPDATE retention.imports SET state = 'approved', approved_by = p_actor, approved_at = clock_timestamp(), approval_rationale = p_rationale WHERE import_id = p_import_id RETURNING * INTO i;
  PERFORM retention.import_event(p_import_id, p_tenant, p_domain, 'import.approved', p_actor, jsonb_build_object('package_digest', p_package_digest, 'rationale', p_rationale), p_correlation);
  RETURN to_jsonb(i);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.approve_import(uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.approve_import(uuid,uuid,uuid,text,text,uuid,uuid) TO eye_commit;

-- THE BEGINNING OF AN ADMISSION (retention.import.admit — the steward or the domain's administrator; human-gated; never the approver):
-- an APPROVED import, or one already ADMITTING (a later call resumes from the staged items); the partner (locked FOR SHARE) still active
-- and its intake contract still an active upload contract with confirmed rights — else contract_changed, nothing admitted; the state
-- admitting and the attempt counted; the event. Returns the row, the partner, the contract's terms the admission applies (the ceiling,
-- the residency, the retention and the licence of authority_and_rights — C7) and the count of staged items.
CREATE OR REPLACE FUNCTION retention.begin_import_admission(p_import_id uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i retention.imports%ROWTYPE; xp retention.exchange_partners%ROWTYPE; s observation.source_contracts_current%ROWTYPE; v_staged int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.import.admit']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'retention import rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO i FROM retention.imports x WHERE x.import_id = p_import_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention import rejected: no such import % in this domain', p_import_id USING ERRCODE = '23503'; END IF;
  IF p_actor = i.approved_by THEN RAISE EXCEPTION 'retention import rejected: the approver of an import does not admit it' USING ERRCODE = '42501'; END IF;
  IF i.state NOT IN ('approved', 'admitting') THEN RAISE EXCEPTION 'retention import rejected: import % is %, not approved — only an approved import is admitted', p_import_id, i.state USING ERRCODE = '22023'; END IF;
  SELECT * INTO xp FROM retention.exchange_partners y WHERE y.partner_id = i.partner_id AND y.tenant_id = p_tenant AND y.domain_id = p_domain FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention import rejected: no such partner % in this domain', i.partner_id USING ERRCODE = '23503'; END IF;
  IF xp.retired_at IS NOT NULL THEN RAISE EXCEPTION 'retention import rejected (contract_changed): partner % was retired at %', xp.partner_key, xp.retired_at USING ERRCODE = '22023'; END IF;
  SELECT * INTO s FROM observation.source_contracts_current c WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.source_id = xp.intake_source_id AND c.contract_version = xp.intake_contract_version;
  IF NOT FOUND OR s.connector_kind <> 'upload' OR s.lifecycle_state <> 'active' OR s.rights_state <> 'confirmed' THEN
    RAISE EXCEPTION 'retention import rejected (contract_changed): the intake source %@% is %, rights %', coalesce(s.source_key, xp.intake_source_id::text), xp.intake_contract_version, coalesce(s.lifecycle_state, 'absent'), coalesce(s.rights_state, 'unknown') USING ERRCODE = '22023';
  END IF;
  UPDATE retention.imports SET state = 'admitting', attempts = attempts + 1 WHERE import_id = p_import_id RETURNING * INTO i;
  SELECT count(*)::int INTO v_staged FROM retention.import_items t WHERE t.import_id = p_import_id AND t.disposition = 'staged';
  PERFORM retention.import_event(p_import_id, p_tenant, p_domain, 'import.admission_started', p_actor, jsonb_build_object('attempt', i.attempts, 'staged', v_staged, 'partner_key', xp.partner_key, 'intake_source', s.source_key || '@' || s.contract_version::text), p_correlation);
  RETURN jsonb_build_object('import', to_jsonb(i), 'partner', to_jsonb(xp),
    'contract', jsonb_build_object('source_id', s.source_id, 'contract_version', s.contract_version, 'source_key', s.source_key, 'classification_ceiling', s.classification_ceiling, 'residency', s.residency,
                                   'retention_profile', s.contract -> 'authority_and_rights' ->> 'retention', 'rights_state', s.rights_state, 'licence', s.contract -> 'authority_and_rights' ->> 'licence',
                                   'lifecycle_state', s.lifecycle_state, 'connector_kind', s.connector_kind),
    'staged', v_staged);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.begin_import_admission(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.begin_import_admission(uuid,uuid,uuid,uuid,uuid) TO eye_commit;

-- THE RECORD'S MANIFEST (retention.import.admit; the import admitting, the item a staged record): the evidence copy the service made from
-- the quarantine blob (vault evidence, the locator's scope segments this domain's — observation.record_manifest's rule), recorded under
-- the partner's INTAKE CONTRACT (no other source; no run of this domain acquired it: run_id NULL; no legal hold of its own), with the
-- classification, residency and retention the header and the contract fixed; custody.imported — the manifest, the EVD object the plan
-- minted for it, the intake contract, the digest verified, the origin (tenant, domain, action, object, version, manifest, package digest)
-- and the package file. The canonical EVD version is admitted by the caller through objects.admit_version in the same write.
CREATE OR REPLACE FUNCTION retention.record_imported_manifest(
  p_manifest_id uuid, p_tenant uuid, p_domain uuid, p_import_id uuid, p_item_id uuid, p_locator text, p_content_digest text, p_byte_length bigint, p_media_type_declared text, p_media_type_sniffed text,
  p_active_content_risk boolean, p_classification text, p_residency text, p_retention_profile text, p_source_id uuid, p_contract_version int, p_acquisition_mode text, p_origin jsonb, p_actor uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = retention, observation, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i retention.imports%ROWTYPE; t retention.import_items%ROWTYPE; xp retention.exchange_partners%ROWTYPE; v_evd uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.import.admit']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'retention import rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  i := retention.import_admitting(p_import_id, p_tenant, p_domain);
  t := retention.import_item_staged(p_item_id, p_import_id, 'record');
  IF p_manifest_id IS NULL THEN RAISE EXCEPTION 'retention import rejected: the manifest id is the one the plan minted' USING ERRCODE = '22023'; END IF;
  IF p_locator IS NULL OR p_locator <> p_tenant::text || '/' || p_domain::text || '/' || split_part(p_locator, '/', 3) OR split_part(p_locator, '/', 3) = '' OR array_length(string_to_array(p_locator, '/'), 1) <> 3 THEN
    RAISE EXCEPTION 'retention import rejected: the evidence locator''s scope segments are this domain''s' USING ERRCODE = '42501';
  END IF;
  IF p_content_digest IS NULL OR p_content_digest !~ '^[0-9a-f]{64}$' OR p_byte_length IS NULL OR p_byte_length < 0 THEN RAISE EXCEPTION 'retention import rejected: an imported manifest records the bytes'' sha-256 hex and their length' USING ERRCODE = '22023'; END IF;
  IF p_acquisition_mode IS NULL OR p_acquisition_mode NOT IN ('replay', 'live') THEN RAISE EXCEPTION 'retention import rejected: the acquisition mode is replay or live' USING ERRCODE = '22023'; END IF;
  IF coalesce(p_classification, '') = '' OR coalesce(p_residency, '') = '' OR coalesce(p_retention_profile, '') = '' THEN RAISE EXCEPTION 'retention import rejected: an imported manifest carries its classification, residency and retention profile' USING ERRCODE = '22023'; END IF;
  IF p_origin IS NULL OR jsonb_typeof(p_origin) <> 'object' THEN RAISE EXCEPTION 'retention import rejected: the origin of an imported manifest is a JSON object' USING ERRCODE = '22023'; END IF;
  IF (p_origin ->> 'new_object_id') IS NOT NULL AND (p_origin ->> 'new_object_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'retention import rejected: the origin''s new_object_id is the EVD object id the plan minted' USING ERRCODE = '22023'; END IF;
  SELECT * INTO xp FROM retention.exchange_partners y WHERE y.partner_id = i.partner_id;
  IF p_source_id IS DISTINCT FROM xp.intake_source_id OR p_contract_version IS DISTINCT FROM xp.intake_contract_version THEN
    RAISE EXCEPTION 'retention import rejected: an imported manifest is recorded under the partner''s intake contract %@%, not %@%', xp.intake_source_id, xp.intake_contract_version, coalesce(p_source_id::text, '<none>'), coalesce(p_contract_version::text, '<none>') USING ERRCODE = '22023';
  END IF;
  v_evd := (p_origin ->> 'new_object_id')::uuid;
  INSERT INTO observation.blob_manifests (manifest_id, scope, tenant_id, domain_id, vault, locator, content_digest, byte_length, media_type_declared, media_type_sniffed, active_content_risk, classification, residency, retention_profile, legal_hold, source_id, contract_version, run_id, acquisition_mode, correlation_id)
  VALUES (p_manifest_id, 'DOMAIN', p_tenant, p_domain, 'evidence', p_locator, p_content_digest, p_byte_length, p_media_type_declared, p_media_type_sniffed, coalesce(p_active_content_risk, false), p_classification, p_residency, p_retention_profile, false, p_source_id, p_contract_version, NULL, p_acquisition_mode, p_correlation);
  INSERT INTO observation.custody_events (event_id, scope, tenant_id, domain_id, manifest_id, obs_object_id, evd_object_id, source_id, contract_version, run_id, event, actor, content_digest, digest_verified, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_manifest_id, NULL, v_evd, p_source_id, p_contract_version, NULL, 'custody.imported', 'principal:' || p_actor::text, p_content_digest, true,
          jsonb_build_object('import_id', p_import_id, 'partner_key', xp.partner_key, 'item_id', p_item_id, 'origin', p_origin, 'file', coalesce(p_origin ->> 'file', (p_origin ->> 'manifest_id') || '.bin'), 'locator', p_locator, 'byte_length', p_byte_length), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.record_imported_manifest(uuid,uuid,uuid,uuid,uuid,text,text,bigint,text,text,boolean,text,text,text,uuid,int,text,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.record_imported_manifest(uuid,uuid,uuid,uuid,uuid,text,text,bigint,text,text,boolean,text,text,text,uuid,int,text,jsonb,uuid,uuid) TO eye_commit;

-- THE CLAIM'S LINEAGE (retention.import.admit; the import admitting): the closure's lineage row for a claim version this write admitted,
-- with the ORIGIN's run, method, call and mode (no run or method of this domain produced it — N5: imported claims are not reviewable or
-- correctable through the review path), the evidence by the PAIR rule (the EVD admitted here whose bytes digest is the row's — D8), the
-- byte span and the confidence. The admitting decision is this operation's (never an argument — 0023 §5's rule); the retrieval decision
-- and audit seq are the origin's when carried, else this operation's decision and 0: the origin's retrieval is not replayable here.
CREATE OR REPLACE FUNCTION retention.record_imported_lineage(
  p_claim uuid, p_version bigint, p_tenant uuid, p_domain uuid, p_claim_type text, p_run_id uuid, p_method_id uuid, p_call_id uuid, p_mode text, p_evidence uuid, p_evidence_digest text,
  p_start int, p_end int, p_confidence numeric, p_retrieval_decision uuid, p_retrieval_seq bigint, p_import_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = retention, observation, objects, intelligence, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i retention.imports%ROWTYPE; v_type text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.import.admit']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF public.eye_policy_decision() IS NULL THEN RAISE EXCEPTION 'retention import rejected: no policy decision is established for this operation' USING ERRCODE = '42501'; END IF;
  i := retention.import_admitting(p_import_id, p_tenant, p_domain);
  IF p_claim IS NULL OR p_version IS NULL OR p_version < 1 THEN RAISE EXCEPTION 'retention import rejected: the lineage names the claim version it belongs to' USING ERRCODE = '22023'; END IF;
  IF p_claim_type IS NULL OR p_claim_type NOT IN ('ENT', 'EVT', 'CLM', 'REL', 'ASM') THEN RAISE EXCEPTION 'retention import rejected: the claim type is ENT, EVT, CLM, REL or ASM' USING ERRCODE = '22023'; END IF;
  IF p_run_id IS NULL OR p_method_id IS NULL OR p_mode IS NULL OR p_mode NOT IN ('replay', 'local-live') THEN RAISE EXCEPTION 'retention import rejected: the lineage of claim %@% names its origin run, method and mode', p_claim, p_version USING ERRCODE = '22023'; END IF;
  IF p_evidence IS NULL OR p_evidence_digest IS NULL OR p_evidence_digest !~ '^[0-9a-f]{64}$' OR p_start IS NULL OR p_end IS NULL OR p_start < 0 OR p_end < p_start OR p_confidence IS NULL OR p_confidence < 0 OR p_confidence > 1 THEN
    RAISE EXCEPTION 'retention import rejected: the lineage of claim %@% names the evidence, its digest, a byte span and a confidence in [0, 1]', p_claim, p_version USING ERRCODE = '22023';
  END IF;
  SELECT o.object_type INTO v_type FROM objects.canonical_objects o WHERE o.object_id = p_claim AND o.object_version = p_version AND o.tenant_id = p_tenant AND o.domain_id = p_domain;
  IF v_type IS NULL THEN RAISE EXCEPTION 'retention import rejected (dependency): claim %@% is not admitted in this domain', p_claim, p_version USING ERRCODE = '23503'; END IF;
  IF v_type <> p_claim_type THEN RAISE EXCEPTION 'retention import rejected: claim %@% is a %, not a %', p_claim, p_version, v_type, p_claim_type USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = p_evidence AND o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.object_type = 'EVD' AND o.payload ->> 'content_digest' = p_evidence_digest) THEN
    RAISE EXCEPTION 'retention import rejected (dependency): evidence % is not admitted in this domain under digest %', p_evidence, p_evidence_digest USING ERRCODE = '23503';
  END IF;
  INSERT INTO intelligence.claim_lineage (claim_object_id, claim_version, scope, tenant_id, domain_id, claim_type, run_id, method_id, call_id, mode, evidence_object_id, evidence_digest, byte_start, byte_end, confidence, retrieval_decision_id, retrieval_audit_seq, admission_decision_id, correlation_id)
  VALUES (p_claim, p_version, 'DOMAIN', p_tenant, p_domain, p_claim_type, p_run_id, p_method_id, p_call_id, p_mode, p_evidence, p_evidence_digest, p_start, p_end, p_confidence,
          coalesce(p_retrieval_decision, public.eye_policy_decision()), coalesce(p_retrieval_seq, 0), public.eye_policy_decision(), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.record_imported_lineage(uuid,bigint,uuid,uuid,text,uuid,uuid,uuid,text,uuid,text,int,int,numeric,uuid,bigint,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.record_imported_lineage(uuid,bigint,uuid,uuid,text,uuid,uuid,uuid,text,uuid,text,int,int,numeric,uuid,bigint,uuid,uuid) TO eye_commit;

-- THE ENTITY (retention.import.admit; the import admitting, the item a staged entity): the row under the id the plan minted, with the
-- type (one this installation records — else the ontology gate), the names and the lifecycle state the origin recorded; a superseded
-- entity names its successor and a split one its origin ONLY as admitted entities of this domain (the caller remaps a carried one;
-- an absent one is a dependency refusal — N5); entity.created, then entity.superseded or entity.retired one microsecond later when the
-- state says so — the vocabulary the projection rebuild (0065) derives the state from; never a new event kind.
CREATE OR REPLACE FUNCTION retention.record_imported_entity(
  p_entity_id uuid, p_tenant uuid, p_domain uuid, p_import_id uuid, p_item_id uuid, p_entity_type text, p_canonical_name text, p_normalized_name text, p_lifecycle_state text,
  p_split_from uuid, p_superseded_by uuid, p_origin jsonb, p_actor uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = retention, observation, graph, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i retention.imports%ROWTYPE; t retention.import_items%ROWTYPE; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.import.admit']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'retention import rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  i := retention.import_admitting(p_import_id, p_tenant, p_domain);
  t := retention.import_item_staged(p_item_id, p_import_id, 'entity');
  IF p_entity_id IS NULL THEN RAISE EXCEPTION 'retention import rejected: the entity id is the one the plan minted' USING ERRCODE = '22023'; END IF;
  IF p_entity_type IS NULL OR p_entity_type NOT IN ('organization', 'place', 'asset', 'product', 'vessel', 'route', 'person', 'other') THEN
    RAISE EXCEPTION 'retention import rejected (ontology): entity type % is not among the types this installation records', coalesce(p_entity_type, '<none>') USING ERRCODE = '22023';
  END IF;
  IF coalesce(length(p_canonical_name), 0) NOT BETWEEN 1 AND 512 OR coalesce(length(p_normalized_name), 0) < 1 THEN RAISE EXCEPTION 'retention import rejected: an entity carries its canonical name (1 to 512 characters) and its normalised form' USING ERRCODE = '22023'; END IF;
  IF p_lifecycle_state IS NULL OR p_lifecycle_state NOT IN ('active', 'superseded', 'retired') THEN RAISE EXCEPTION 'retention import rejected: the lifecycle state of an entity is active, superseded or retired' USING ERRCODE = '22023'; END IF;
  IF p_origin IS NULL OR jsonb_typeof(p_origin) <> 'object' THEN RAISE EXCEPTION 'retention import rejected: the origin of an imported entity is a JSON object' USING ERRCODE = '22023'; END IF;
  IF p_lifecycle_state = 'superseded' AND p_superseded_by IS NULL THEN RAISE EXCEPTION 'retention import rejected (dependency): entity % is superseded by an entity that is not carried', p_entity_id USING ERRCODE = '23503'; END IF;
  IF p_superseded_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM graph.entities_current e WHERE e.entity_id = p_superseded_by AND e.tenant_id = p_tenant AND e.domain_id = p_domain) THEN
    RAISE EXCEPTION 'retention import rejected (dependency): the successor % of entity % is not an admitted entity of this domain', p_superseded_by, p_entity_id USING ERRCODE = '23503';
  END IF;
  IF p_split_from IS NOT NULL AND NOT EXISTS (SELECT 1 FROM graph.entities_current e WHERE e.entity_id = p_split_from AND e.tenant_id = p_tenant AND e.domain_id = p_domain) THEN
    RAISE EXCEPTION 'retention import rejected (dependency): the origin % of the split entity % is not an admitted entity of this domain', p_split_from, p_entity_id USING ERRCODE = '23503';
  END IF;
  INSERT INTO graph.entities_current (entity_id, scope, tenant_id, domain_id, entity_type, canonical_name, normalized_name, lifecycle_state, split_from, superseded_by, created_at, updated_at, created_by, correlation_id)
  VALUES (p_entity_id, 'DOMAIN', p_tenant, p_domain, p_entity_type, p_canonical_name, p_normalized_name, p_lifecycle_state, p_split_from, p_superseded_by, v_at, v_at, p_actor, p_correlation);
  INSERT INTO graph.entity_events (event_id, scope, tenant_id, domain_id, entity_id, event, occurred_at, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_entity_id, 'entity.created', v_at, p_actor,
          jsonb_build_object('imported', true, 'import_id', p_import_id, 'item_id', p_item_id, 'origin', p_origin, 'entity_type', p_entity_type, 'canonical_name', p_canonical_name, 'normalized_name', p_normalized_name, 'split_from', p_split_from), p_correlation);
  IF p_lifecycle_state IN ('superseded', 'retired') THEN
    -- The recorded state follows its creation by one microsecond of record time: the ledger's order is the derivation's order whatever the clock's resolution.
    INSERT INTO graph.entity_events (event_id, scope, tenant_id, domain_id, entity_id, event, occurred_at, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_entity_id, CASE WHEN p_lifecycle_state = 'superseded' THEN 'entity.superseded' ELSE 'entity.retired' END, v_at + interval '1 microsecond', p_actor,
            jsonb_build_object('imported', true, 'import_id', p_import_id, 'item_id', p_item_id, 'origin', p_origin, 'superseded_by', p_superseded_by, 'reason', 'the lifecycle state the origin recorded'), p_correlation);
  END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.record_imported_entity(uuid,uuid,uuid,uuid,uuid,text,text,text,text,uuid,uuid,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.record_imported_entity(uuid,uuid,uuid,uuid,uuid,text,text,text,text,uuid,uuid,jsonb,uuid,uuid) TO eye_commit;

-- THE IDENTIFIER SYSTEM (retention.import.admit; the import admitting): the closure's system, registered here when this domain has none
-- under the key ('registered'); the domain's OWN declaration stands when one exists ('existed' — its authority and its authoritative
-- flag are the domain's, never overwritten by a package).
CREATE OR REPLACE FUNCTION retention.record_imported_identifier_system(p_tenant uuid, p_domain uuid, p_import_id uuid, p_system_key text, p_authority text, p_description text, p_is_authoritative boolean, p_actor uuid, p_correlation uuid)
RETURNS text
SECURITY DEFINER SET search_path = retention, observation, graph, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i retention.imports%ROWTYPE; v_inserted int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.import.admit']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'retention import rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  i := retention.import_admitting(p_import_id, p_tenant, p_domain);
  IF p_system_key IS NULL OR p_system_key !~ '^[a-z0-9][a-z0-9_.:-]{1,63}$' THEN RAISE EXCEPTION 'retention import rejected (identifier): the identifier system key is 2 to 64 characters of a-z, 0-9, _ . : and -, starting with a letter or a digit' USING ERRCODE = '22023'; END IF;
  IF coalesce(length(p_authority), 0) < 2 THEN RAISE EXCEPTION 'retention import rejected (identifier): identifier system % names the authority that issues it', p_system_key USING ERRCODE = '22023'; END IF;
  IF p_is_authoritative IS NULL THEN RAISE EXCEPTION 'retention import rejected (identifier): identifier system % says whether it is authoritative', p_system_key USING ERRCODE = '22023'; END IF;
  INSERT INTO graph.identifier_systems (scope, tenant_id, domain_id, system_key, authority, description, is_authoritative, registered_by, correlation_id)
  VALUES ('DOMAIN', p_tenant, p_domain, p_system_key, p_authority, coalesce(p_description, ''), p_is_authoritative, p_actor, p_correlation)
  ON CONFLICT (tenant_id, domain_id, system_key) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN CASE WHEN v_inserted = 1 THEN 'registered' ELSE 'existed' END;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.record_imported_identifier_system(uuid,uuid,uuid,text,text,text,boolean,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.record_imported_identifier_system(uuid,uuid,uuid,text,text,text,boolean,uuid,uuid) TO eye_commit;

-- THE IDENTIFIER (retention.import.admit; the import admitting, the item a staged identifier): attached to an admitted entity of this
-- domain under a system registered here, with its source claim and evidence named (the remapped ids when carried; a reference, not a
-- foreign key — 0024 §3's shape); ONE ENTITY PER IDENTIFIER — a (system, value) that already identifies ANOTHER entity is refused
-- (23505, as graph.attach_identifier), the same entity is 'already'; else the row, entity.identified, 'identified'.
CREATE OR REPLACE FUNCTION retention.record_imported_identifier(
  p_identifier_id uuid, p_tenant uuid, p_domain uuid, p_import_id uuid, p_item_id uuid, p_entity_id uuid, p_system_key text, p_value text, p_claim_object_id uuid, p_evidence_object_id uuid, p_origin jsonb, p_actor uuid, p_correlation uuid
) RETURNS text
SECURITY DEFINER SET search_path = retention, observation, graph, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i retention.imports%ROWTYPE; t retention.import_items%ROWTYPE; v_auth boolean; v_holder uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.import.admit']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'retention import rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  i := retention.import_admitting(p_import_id, p_tenant, p_domain);
  t := retention.import_item_staged(p_item_id, p_import_id, 'identifier');
  IF p_identifier_id IS NULL THEN RAISE EXCEPTION 'retention import rejected: the identifier id is the one the plan minted' USING ERRCODE = '22023'; END IF;
  IF coalesce(length(p_value), 0) NOT BETWEEN 1 AND 256 THEN RAISE EXCEPTION 'retention import rejected (identifier): an identifier value is 1 to 256 characters' USING ERRCODE = '22023'; END IF;
  IF p_claim_object_id IS NULL OR p_evidence_object_id IS NULL THEN RAISE EXCEPTION 'retention import rejected (identifier): identifier % % names its source claim and evidence', coalesce(p_system_key, '<none>'), p_value USING ERRCODE = '22023'; END IF;
  IF p_origin IS NULL OR jsonb_typeof(p_origin) <> 'object' THEN RAISE EXCEPTION 'retention import rejected: the origin of an imported identifier is a JSON object' USING ERRCODE = '22023'; END IF;
  IF p_entity_id IS NULL OR NOT EXISTS (SELECT 1 FROM graph.entities_current e WHERE e.entity_id = p_entity_id AND e.tenant_id = p_tenant AND e.domain_id = p_domain) THEN
    RAISE EXCEPTION 'retention import rejected (dependency): entity % is not an admitted entity of this domain', coalesce(p_entity_id::text, '<none>') USING ERRCODE = '23503';
  END IF;
  SELECT s.is_authoritative INTO v_auth FROM graph.identifier_systems s WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.system_key = p_system_key;
  IF v_auth IS NULL THEN RAISE EXCEPTION 'retention import rejected (identifier): no identifier system % is registered in this domain', coalesce(p_system_key, '<none>') USING ERRCODE = '23503'; END IF;
  SELECT x.entity_id INTO v_holder FROM graph.entity_identifiers x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.system_key = p_system_key AND x.identifier_value = p_value;
  IF v_holder IS NOT NULL AND v_holder <> p_entity_id THEN RAISE EXCEPTION 'retention import rejected (identifier): % % already identifies a different entity', p_system_key, p_value USING ERRCODE = '23505'; END IF;
  IF v_holder = p_entity_id THEN RETURN 'already'; END IF;
  INSERT INTO graph.entity_identifiers (identifier_id, scope, tenant_id, domain_id, entity_id, system_key, identifier_value, source_claim_object_id, source_evidence_object_id, recorded_by, correlation_id)
  VALUES (p_identifier_id, 'DOMAIN', p_tenant, p_domain, p_entity_id, p_system_key, p_value, p_claim_object_id, p_evidence_object_id, p_actor, p_correlation);
  INSERT INTO graph.entity_events (event_id, scope, tenant_id, domain_id, entity_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_entity_id, 'entity.identified', p_actor,
          jsonb_build_object('imported', true, 'import_id', p_import_id, 'item_id', p_item_id, 'origin', p_origin, 'system_key', p_system_key, 'value', p_value, 'is_authoritative', v_auth, 'claim_object_id', p_claim_object_id), p_correlation);
  RETURN 'identified';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.record_imported_identifier(uuid,uuid,uuid,uuid,uuid,uuid,text,text,uuid,uuid,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.record_imported_identifier(uuid,uuid,uuid,uuid,uuid,uuid,text,text,uuid,uuid,jsonb,uuid,uuid) TO eye_commit;

-- THE EDGE (retention.import.admit; the import admitting, the item a staged edge): the relationship AS THE ORIGIN RECORDED IT — its world
-- time (valid_from/to), its record time (asserted_at; retracted_at with the reason; superseded_at with the successor) and its STATE —
-- under the id the plan minted, between admitted entities of this domain, on the EXACT claim version admitted here (never rebased onto
-- another version — Codex B15-F1) and the evidence by the pair rule; the predicate gated by the domain's active ontology version exactly
-- as graph.assert_edge (0068 §1) gates it; the origin's method and run kept (no run of this domain derived it). edge.asserted, then
-- edge.retracted or edge.superseded one microsecond later when the state says so (0065's derivation); nothing else of the graph is touched:
-- an imported edge supersedes no edge of this domain.
CREATE OR REPLACE FUNCTION retention.record_imported_edge(
  p_edge_id uuid, p_tenant uuid, p_domain uuid, p_import_id uuid, p_item_id uuid, p_subject uuid, p_predicate text, p_object uuid, p_valid_from timestamptz, p_valid_to timestamptz,
  p_asserted_at timestamptz, p_retracted_at timestamptz, p_superseded_at timestamptz, p_state text, p_claim uuid, p_claim_version bigint, p_evidence uuid, p_evidence_digest text,
  p_method_id uuid, p_run_id uuid, p_mode text, p_confidence numeric, p_superseded_by uuid, p_retraction_reason text, p_origin jsonb, p_actor uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = retention, observation, objects, graph, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i retention.imports%ROWTYPE; t retention.import_items%ROWTYPE; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.import.admit']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'retention import rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  i := retention.import_admitting(p_import_id, p_tenant, p_domain);
  t := retention.import_item_staged(p_item_id, p_import_id, 'edge');
  IF p_edge_id IS NULL THEN RAISE EXCEPTION 'retention import rejected: the edge id is the one the plan minted' USING ERRCODE = '22023'; END IF;
  IF p_predicate IS NULL OR length(p_predicate) NOT BETWEEN 2 AND 128 THEN RAISE EXCEPTION 'retention import rejected: the predicate of edge % is 2 to 128 characters', p_edge_id USING ERRCODE = '22023'; END IF;
  -- The ontology gate (0066 §7, as graph.assert_edge applies it): a domain with an ACTIVE ontology version admits only the predicates it declares.
  IF EXISTS (SELECT 1 FROM graph.ontology_versions v WHERE v.tenant_id = p_tenant AND v.domain_id = p_domain AND v.state = 'active')
     AND NOT EXISTS (SELECT 1 FROM graph.ontology_versions v, jsonb_array_elements(v.predicates) pr WHERE v.tenant_id = p_tenant AND v.domain_id = p_domain AND v.state = 'active' AND pr ->> 'predicate' = p_predicate) THEN
    RAISE EXCEPTION 'retention import rejected (ontology): predicate % is not in the domain''s active ontology version', p_predicate USING ERRCODE = '22023';
  END IF;
  IF p_subject IS NULL OR p_object IS NULL
     OR NOT EXISTS (SELECT 1 FROM graph.entities_current e WHERE e.entity_id = p_subject AND e.tenant_id = p_tenant AND e.domain_id = p_domain)
     OR NOT EXISTS (SELECT 1 FROM graph.entities_current e WHERE e.entity_id = p_object AND e.tenant_id = p_tenant AND e.domain_id = p_domain) THEN
    RAISE EXCEPTION 'retention import rejected (dependency): both ends of edge % must be admitted entities of this domain', p_edge_id USING ERRCODE = '23503';
  END IF;
  IF p_subject = p_object THEN RAISE EXCEPTION 'retention import rejected: edge % relates an entity to itself', p_edge_id USING ERRCODE = '22023'; END IF;
  IF p_valid_from IS NULL OR (p_valid_to IS NOT NULL AND p_valid_to <= p_valid_from) THEN RAISE EXCEPTION 'retention import rejected: edge % carries a valid_from, and a valid_to after it when it has one', p_edge_id USING ERRCODE = '22023'; END IF;
  IF p_asserted_at IS NULL THEN RAISE EXCEPTION 'retention import rejected: edge % carries the instant the origin asserted it', p_edge_id USING ERRCODE = '22023'; END IF;
  IF p_state IS NULL OR p_state NOT IN ('asserted', 'retracted', 'superseded') THEN RAISE EXCEPTION 'retention import rejected: the state of edge % is asserted, retracted or superseded', p_edge_id USING ERRCODE = '22023'; END IF;
  IF p_state = 'retracted' AND (p_retracted_at IS NULL OR coalesce(length(btrim(p_retraction_reason)), 0) < 8) THEN RAISE EXCEPTION 'retention import rejected: a retracted edge (%) carries the instant of its retraction and a reason of 8+ characters', p_edge_id USING ERRCODE = '22023'; END IF;
  IF p_state <> 'retracted' AND (p_retracted_at IS NOT NULL OR p_retraction_reason IS NOT NULL) THEN RAISE EXCEPTION 'retention import rejected: only a retracted edge (%) carries a retraction', p_edge_id USING ERRCODE = '22023'; END IF;
  IF p_state = 'superseded' AND (p_superseded_by IS NULL OR p_superseded_at IS NULL) THEN RAISE EXCEPTION 'retention import rejected (dependency): edge % is superseded by an edge that is not carried', p_edge_id USING ERRCODE = '23503'; END IF;
  IF p_state <> 'superseded' AND (p_superseded_by IS NOT NULL OR p_superseded_at IS NOT NULL) THEN RAISE EXCEPTION 'retention import rejected: only a superseded edge (%) names its successor', p_edge_id USING ERRCODE = '22023'; END IF;
  IF p_superseded_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM graph.edges_current e WHERE e.edge_id = p_superseded_by AND e.tenant_id = p_tenant AND e.domain_id = p_domain) THEN
    RAISE EXCEPTION 'retention import rejected (dependency): the successor % of edge % is not an admitted edge of this domain', p_superseded_by, p_edge_id USING ERRCODE = '23503';
  END IF;
  IF p_claim IS NULL OR p_claim_version IS NULL OR p_claim_version < 1 THEN RAISE EXCEPTION 'retention import rejected: edge % names the claim version it rests on', p_edge_id USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = p_claim AND o.object_version = p_claim_version AND o.tenant_id = p_tenant AND o.domain_id = p_domain) THEN
    RAISE EXCEPTION 'retention import rejected (dependency): claim %@% is not admitted in this domain; an edge is never rebased onto another version', p_claim, p_claim_version USING ERRCODE = '23503';
  END IF;
  IF p_evidence IS NULL OR p_evidence_digest IS NULL OR p_evidence_digest !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'retention import rejected: edge % names the evidence bytes it rests on by object id and digest', p_edge_id USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = p_evidence AND o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.object_type = 'EVD' AND o.payload ->> 'content_digest' = p_evidence_digest) THEN
    RAISE EXCEPTION 'retention import rejected (dependency): evidence % is not admitted in this domain under digest %', p_evidence, p_evidence_digest USING ERRCODE = '23503';
  END IF;
  IF p_mode IS NULL OR p_mode NOT IN ('replay', 'local-live') OR p_confidence IS NULL OR p_confidence < 0 OR p_confidence > 1 THEN RAISE EXCEPTION 'retention import rejected: edge % carries its mode (replay or local-live) and a confidence in [0, 1]', p_edge_id USING ERRCODE = '22023'; END IF;
  IF p_origin IS NULL OR jsonb_typeof(p_origin) <> 'object' THEN RAISE EXCEPTION 'retention import rejected: the origin of an imported edge is a JSON object' USING ERRCODE = '22023'; END IF;
  INSERT INTO graph.edges_current (edge_id, scope, tenant_id, domain_id, subject_entity_id, predicate, object_entity_id, valid_from, valid_to, asserted_at, retracted_at, state, claim_object_id, claim_version, evidence_object_id, evidence_digest,
                                   method_id, run_id, mode, confidence, asserted_by, retracted_by, retraction_reason, superseded_by, superseded_at, correlation_id)
  VALUES (p_edge_id, 'DOMAIN', p_tenant, p_domain, p_subject, p_predicate, p_object, p_valid_from, p_valid_to, p_asserted_at, p_retracted_at, p_state, p_claim, p_claim_version, p_evidence, p_evidence_digest,
          p_method_id, p_run_id, p_mode, p_confidence, p_actor, CASE WHEN p_state = 'retracted' THEN p_actor END, p_retraction_reason, p_superseded_by, p_superseded_at, p_correlation);
  INSERT INTO graph.edge_events (event_id, scope, tenant_id, domain_id, edge_id, event, occurred_at, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_edge_id, 'edge.asserted', v_at, p_actor,
          jsonb_build_object('imported', true, 'import_id', p_import_id, 'item_id', p_item_id, 'origin', p_origin, 'predicate', p_predicate, 'subject', p_subject, 'object', p_object, 'valid_from', p_valid_from, 'valid_to', p_valid_to,
                             'mode', p_mode, 'claim_object_id', p_claim, 'claim_version', p_claim_version, 'asserted_at', p_asserted_at, 'review_state', 'imported'), p_correlation);
  IF p_state = 'retracted' THEN
    INSERT INTO graph.edge_events (event_id, scope, tenant_id, domain_id, edge_id, event, occurred_at, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_edge_id, 'edge.retracted', v_at + interval '1 microsecond', p_actor,
            jsonb_build_object('imported', true, 'import_id', p_import_id, 'origin', p_origin, 'reason', p_retraction_reason, 'retracted_at', p_retracted_at), p_correlation);
  ELSIF p_state = 'superseded' THEN
    INSERT INTO graph.edge_events (event_id, scope, tenant_id, domain_id, edge_id, event, occurred_at, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_edge_id, 'edge.superseded', v_at + interval '1 microsecond', p_actor,
            jsonb_build_object('imported', true, 'import_id', p_import_id, 'origin', p_origin, 'superseded_by', p_superseded_by, 'superseded_at', p_superseded_at, 'claim_object_id', p_claim, 'reason', 'the state the origin recorded'), p_correlation);
  END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.record_imported_edge(uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,text,uuid,bigint,uuid,text,uuid,uuid,text,numeric,uuid,text,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.record_imported_edge(uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,text,uuid,bigint,uuid,text,uuid,uuid,text,numeric,uuid,text,jsonb,uuid,uuid) TO eye_commit;

-- THE ITEM'S OUTCOME (retention.import.admit; the import admitting, the item staged): admitted or reused with what was admitted (the ids,
-- the version, the digest, the manifest and locator of a record), excluded or refused with the gate and the reason. Settled once (the
-- trigger).
CREATE OR REPLACE FUNCTION retention.mark_import_item(p_item_id uuid, p_import_id uuid, p_tenant uuid, p_domain uuid, p_disposition text, p_gate text, p_reason text, p_admitted jsonb, p_actor uuid, p_correlation uuid)
RETURNS void
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i retention.imports%ROWTYPE; t retention.import_items%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.import.admit']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'retention import rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  i := retention.import_admitting(p_import_id, p_tenant, p_domain);
  t := retention.import_item_staged(p_item_id, p_import_id, NULL);
  IF p_disposition IS NULL OR p_disposition NOT IN ('admitted', 'reused', 'excluded', 'refused') THEN RAISE EXCEPTION 'retention import rejected: an item is settled as admitted, reused, excluded or refused' USING ERRCODE = '22023'; END IF;
  IF p_disposition IN ('excluded', 'refused') AND (p_gate IS NULL OR p_gate NOT IN ('ceiling', 'content', 'header', 'schema', 'oversize', 'integrity', 'dependency', 'ontology', 'identifier', 'record', 'evidence', 'redaction', 'origin_excluded', 'duplicate') OR coalesce(length(btrim(p_reason)), 0) < 1) THEN
    RAISE EXCEPTION 'retention import rejected: an excluded or refused item names its gate (ceiling, content, header, schema, oversize, integrity, dependency, ontology, identifier, record, evidence, redaction, origin_excluded or duplicate) and the reason' USING ERRCODE = '22023';
  END IF;
  IF p_disposition IN ('admitted', 'reused') AND (p_gate IS NOT NULL OR p_admitted IS NULL OR jsonb_typeof(p_admitted) <> 'object') THEN
    RAISE EXCEPTION 'retention import rejected: an admitted or reused item records what was admitted, as a JSON object, and no gate' USING ERRCODE = '22023';
  END IF;
  UPDATE retention.import_items SET disposition = p_disposition, gate = p_gate, reason = p_reason, admitted = p_admitted, admitted_at = clock_timestamp() WHERE item_id = p_item_id;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.mark_import_item(uuid,uuid,uuid,uuid,text,text,text,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.mark_import_item(uuid,uuid,uuid,uuid,text,text,text,jsonb,uuid,uuid) TO eye_commit;

-- THE EVENTS A CALLER RECORDS (retention.import.admit, retention.import.withdraw): import.batch_admitted and import.failed on an
-- admission in progress; import.finalized after the admission (the quarantine copies of the admitted records tombstoned after the
-- commit — re-run idempotently, each run a fact); import.evidence_tombstoned after a withdrawal (its copies tombstoned after the commit;
-- a quarantined import's copies are the sweeper's — mark_import_quarantine_swept). Every other event is a port's own.
CREATE OR REPLACE FUNCTION retention.record_import_event(p_import_id uuid, p_tenant uuid, p_domain uuid, p_event text, p_details jsonb, p_actor uuid, p_correlation uuid)
RETURNS void
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i retention.imports%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.import.admit', 'retention.import.withdraw']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'retention import rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_event IS NULL OR p_event NOT IN ('import.batch_admitted', 'import.finalized', 'import.failed', 'import.evidence_tombstoned') THEN
    RAISE EXCEPTION 'retention import rejected: the events a caller records are import.batch_admitted, import.finalized, import.failed and import.evidence_tombstoned' USING ERRCODE = '22023';
  END IF;
  IF p_details IS NOT NULL AND jsonb_typeof(p_details) <> 'object' THEN RAISE EXCEPTION 'retention import rejected: the details of an event are a JSON object' USING ERRCODE = '22023'; END IF;
  SELECT * INTO i FROM retention.imports x WHERE x.import_id = p_import_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention import rejected: no such import % in this domain', p_import_id USING ERRCODE = '23503'; END IF;
  IF p_event IN ('import.batch_admitted', 'import.failed') AND i.state <> 'admitting' THEN RAISE EXCEPTION 'retention import rejected: import % is %, not admitting — % is an admission''s event', p_import_id, i.state, p_event USING ERRCODE = '22023'; END IF;
  IF p_event = 'import.finalized' AND i.state <> 'admitted' THEN RAISE EXCEPTION 'retention import rejected: import % is %, not admitted — import.finalized follows an admission', p_import_id, i.state USING ERRCODE = '22023'; END IF;
  IF p_event = 'import.evidence_tombstoned' AND i.state <> 'withdrawn' THEN RAISE EXCEPTION 'retention import rejected: import % is %, not withdrawn — import.evidence_tombstoned follows a withdrawal (a quarantined import''s evidence is swept by the sweeper)', p_import_id, i.state USING ERRCODE = '22023'; END IF;
  PERFORM retention.import_event(p_import_id, p_tenant, p_domain, p_event, p_actor, p_details, p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.record_import_event(uuid,uuid,uuid,text,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.record_import_event(uuid,uuid,uuid,text,jsonb,uuid,uuid) TO eye_commit;

-- THE FINISH (retention.import.admit; never the approver): every item settled — a staged item left is refused with the count — the state
-- admitted with the admitter, the instant and the counts (the ledger's own by disposition, the caller's beside them); the event. Returns
-- the row after.
CREATE OR REPLACE FUNCTION retention.finish_import_admission(p_import_id uuid, p_tenant uuid, p_domain uuid, p_counts jsonb, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i retention.imports%ROWTYPE; v_staged int; v_counts jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.import.admit']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'retention import rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_counts IS NOT NULL AND jsonb_typeof(p_counts) <> 'object' THEN RAISE EXCEPTION 'retention import rejected: the counts are a JSON object' USING ERRCODE = '22023'; END IF;
  SELECT * INTO i FROM retention.imports x WHERE x.import_id = p_import_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention import rejected: no such import % in this domain', p_import_id USING ERRCODE = '23503'; END IF;
  IF p_actor = i.approved_by THEN RAISE EXCEPTION 'retention import rejected: the approver of an import does not admit it' USING ERRCODE = '42501'; END IF;
  IF i.state <> 'admitting' THEN RAISE EXCEPTION 'retention import rejected: import % is %, not admitting — only an admission in progress is finished', p_import_id, i.state USING ERRCODE = '22023'; END IF;
  SELECT count(*)::int INTO v_staged FROM retention.import_items t WHERE t.import_id = p_import_id AND t.disposition = 'staged';
  IF v_staged > 0 THEN RAISE EXCEPTION 'retention import rejected: % item(s) of import % are still staged', v_staged, p_import_id USING ERRCODE = '22023'; END IF;
  SELECT coalesce(jsonb_object_agg(q.disposition, q.n), '{}'::jsonb) INTO v_counts FROM (SELECT t.disposition, count(*)::int AS n FROM retention.import_items t WHERE t.import_id = p_import_id GROUP BY t.disposition) q;
  v_counts := v_counts || coalesce(p_counts, '{}'::jsonb);
  UPDATE retention.imports SET state = 'admitted', admitted_by = p_actor, admitted_at = clock_timestamp(), counts = v_counts WHERE import_id = p_import_id RETURNING * INTO i;
  PERFORM retention.import_event(p_import_id, p_tenant, p_domain, 'import.admitted', p_actor, jsonb_build_object('counts', v_counts, 'attempts', i.attempts), p_correlation);
  RETURN to_jsonb(i);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.finish_import_admission(uuid,uuid,uuid,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.finish_import_admission(uuid,uuid,uuid,jsonb,uuid,uuid) TO eye_commit;

-- THE WITHDRAWAL (retention.import.withdraw — the steward or the domain's administrator): from quarantined, verified, approved or
-- ADMITTING (C3 — an interrupted admission is closed, never left), with a reason; the row's findings untouched; the event states what
-- stood — the canonical rows, manifests, lineage, entities, identifiers and edges an admission already wrote are append-only and stand —
-- and the counts by disposition (the staged items are never admitted). The quarantine copies are tombstoned after the commit
-- (import.evidence_tombstoned through record_import_event). Returns the row after.
CREATE OR REPLACE FUNCTION retention.withdraw_import(p_import_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i retention.imports%ROWTYPE; v_from text; v_counts jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.import.withdraw']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'retention import rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'retention import rejected: a reason of 8+ characters' USING ERRCODE = '22023'; END IF;
  SELECT * INTO i FROM retention.imports x WHERE x.import_id = p_import_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention import rejected: no such import % in this domain', p_import_id USING ERRCODE = '23503'; END IF;
  IF i.state NOT IN ('quarantined', 'verified', 'approved', 'admitting') THEN RAISE EXCEPTION 'retention import rejected: import % is %, not withdrawable — an admitted import stands and a withdrawn one is withdrawn', p_import_id, i.state USING ERRCODE = '22023'; END IF;
  v_from := i.state;
  SELECT coalesce(jsonb_object_agg(q.disposition, q.n), '{}'::jsonb) INTO v_counts FROM (SELECT t.disposition, count(*)::int AS n FROM retention.import_items t WHERE t.import_id = p_import_id GROUP BY t.disposition) q;
  UPDATE retention.imports SET state = 'withdrawn', withdrawn_by = p_actor, withdrawn_at = clock_timestamp(), withdraw_reason = p_reason WHERE import_id = p_import_id RETURNING * INTO i;
  PERFORM retention.import_event(p_import_id, p_tenant, p_domain, 'import.withdrawn', p_actor,
    jsonb_build_object('reason', p_reason, 'from_state', v_from, 'attempts', i.attempts,
                       'admitted', coalesce((v_counts ->> 'admitted')::int, 0), 'reused', coalesce((v_counts ->> 'reused')::int, 0), 'refused', coalesce((v_counts ->> 'refused')::int, 0),
                       'excluded', coalesce((v_counts ->> 'excluded')::int, 0), 'staged', coalesce((v_counts ->> 'staged')::int, 0),
                       'statement', CASE WHEN v_from = 'admitting'
                                         THEN 'the canonical rows, manifests, lineage, entities, identifiers and edges this admission already wrote stand — the ledger is append-only; the staged items are not admitted; the quarantine copies are tombstoned after this commit'
                                         ELSE 'nothing of the package was admitted; the quarantine copies are tombstoned after this commit' END), p_correlation);
  RETURN to_jsonb(i);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.withdraw_import(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.withdraw_import(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

-- THE ORIGIN'S STATE (retention.import.open): what this installation knows of the package a caller presents — the definer (the migrate
-- superuser, BYPASSRLS — 0013) reads retention.export_packages across domains. Only facts about a package whose digest the caller holds
-- (C2, N13): {known: true, revoked_at, expires_at} when the origin action's package is recorded here under the SAME digest; {known: false,
-- digest_mismatch: true} when the action is this tenant's own and its package digests otherwise (the caller may see its own tenant's
-- packages); {known: false} for everything else — another tenant's action, whatever its digest, is not disclosed to exist. Never the
-- archive digest.
CREATE OR REPLACE FUNCTION retention.import_origin_state(p_tenant uuid, p_domain uuid, p_origin_tenant uuid, p_origin_domain uuid, p_action_id uuid, p_package_digest text)
RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x retention.export_packages%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.import.open']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_origin_tenant IS NULL OR p_origin_domain IS NULL OR p_action_id IS NULL OR p_package_digest IS NULL OR p_package_digest !~ '^[0-9a-f]{64}$' THEN RETURN jsonb_build_object('known', false); END IF;
  SELECT * INTO x FROM retention.export_packages e WHERE e.action_id = p_action_id AND e.tenant_id = p_origin_tenant AND e.domain_id = p_origin_domain;
  IF NOT FOUND THEN RETURN jsonb_build_object('known', false); END IF;
  IF x.package_digest <> p_package_digest THEN
    IF p_origin_tenant = p_tenant THEN RETURN jsonb_build_object('known', false, 'digest_mismatch', true); END IF;
    RETURN jsonb_build_object('known', false);
  END IF;
  RETURN jsonb_build_object('known', true, 'revoked_at', x.revoked_at, 'expires_at', x.expires_at);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.import_origin_state(uuid,uuid,uuid,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.import_origin_state(uuid,uuid,uuid,uuid,uuid,text) TO eye_commit;

-- THE SWEEPER'S INVENTORY (C5; D5): the quarantined imports opened, and the withdrawn imports withdrawn, longer ago than the quarantine
-- TTL, whose evidence has not been tombstoned (no import.evidence_tombstoned in the ledger — the withdrawal's own step, or an earlier
-- sweep), with every quarantine locator the import holds (its records' staged copies, manifest.json, links.json). The definer reads
-- across domains — the product's internal inventory, granted to the sweeper's role; no authority assertion, as export_recipients: it
-- discloses ids and locators to the product itself and changes nothing. Oldest first; the caller bounds its own page (a sweep is per
-- domain and filters to its own — a limit here would let another domain's backlog starve it).
CREATE OR REPLACE FUNCTION retention.import_quarantine_expired(p_older_than interval)
RETURNS TABLE (import_id uuid, tenant_id uuid, domain_id uuid, locators text[])
SECURITY DEFINER STABLE SET search_path = retention, pg_catalog, pg_temp AS $$
  SELECT i.import_id, i.tenant_id, i.domain_id,
         (SELECT coalesce(array_agg(q.l ORDER BY q.l), '{}'::text[]) FROM (
            SELECT DISTINCT it.staged ->> 'quarantine_locator' AS l FROM retention.import_items it WHERE it.import_id = i.import_id AND (it.staged ->> 'quarantine_locator') IS NOT NULL
            UNION SELECT i.manifest_locator WHERE i.manifest_locator IS NOT NULL
            UNION SELECT i.links_locator WHERE i.links_locator IS NOT NULL) q)
    FROM retention.imports i
   WHERE ((i.state = 'quarantined' AND i.opened_at < now() - p_older_than) OR (i.state = 'withdrawn' AND i.withdrawn_at < now() - p_older_than))
     AND NOT EXISTS (SELECT 1 FROM retention.import_events e WHERE e.import_id = i.import_id AND e.event = 'import.evidence_tombstoned')
   ORDER BY i.opened_at;
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION retention.import_quarantine_expired(interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.import_quarantine_expired(interval) TO eye_app, eye_commit;

-- THE SWEEP'S MARK (C5): the sweeper tombstoned the quarantine copies of a quarantined or withdrawn import — import.evidence_tombstoned
-- with the count of locators the ledger holds, recorded once (a second call is a no-op: the sweep completes, it never repeats a fact).
-- The actor and the correlation are the context's when one is established, else the import's own correlation.
CREATE OR REPLACE FUNCTION retention.mark_import_quarantine_swept(p_import_id uuid)
RETURNS void
SECURITY DEFINER SET search_path = retention, public, pg_catalog, pg_temp AS $$
DECLARE i retention.imports%ROWTYPE; v_locators int;
BEGIN
  SELECT * INTO i FROM retention.imports x WHERE x.import_id = p_import_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention import rejected: no such import %', p_import_id USING ERRCODE = '23503'; END IF;
  IF i.state NOT IN ('quarantined', 'withdrawn') THEN RAISE EXCEPTION 'retention import rejected: import % is %; only a quarantined or withdrawn import''s evidence is swept', p_import_id, i.state USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM retention.import_events e WHERE e.import_id = p_import_id AND e.event = 'import.evidence_tombstoned') THEN RETURN; END IF;
  SELECT count(*)::int INTO v_locators FROM (
    SELECT DISTINCT it.staged ->> 'quarantine_locator' AS l FROM retention.import_items it WHERE it.import_id = p_import_id AND (it.staged ->> 'quarantine_locator') IS NOT NULL
    UNION SELECT i.manifest_locator WHERE i.manifest_locator IS NOT NULL
    UNION SELECT i.links_locator WHERE i.links_locator IS NOT NULL) q;
  PERFORM retention.import_event(p_import_id, i.tenant_id, i.domain_id, 'import.evidence_tombstoned', public.eye_principal(),
    jsonb_build_object('locators', v_locators, 'by', 'sweeper', 'state', i.state), coalesce(public.eye_correlation(), i.correlation_id));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.mark_import_quarantine_swept(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.mark_import_quarantine_swept(uuid) TO eye_app, eye_commit;

-- ============================================================
-- §5 vocabularies and registry data
-- ============================================================
-- custody.imported: a record's manifest recorded here from a partner's package under the intake contract (0074 §3's list, one longer).
ALTER TABLE observation.custody_events DROP CONSTRAINT custody_events_event_check;
ALTER TABLE observation.custody_events ADD CONSTRAINT custody_events_event_check CHECK (event IN (
  'custody.acquired', 'custody.quarantined', 'custody.verified', 'custody.candidate_verified', 'custody.admitted', 'custody.finalized',
  'custody.retrieved', 'custody.tombstoned', 'custody.integrity_failed', 'custody.archived', 'custody.exported', 'custody.restored', 'custody.delivered', 'custody.revocation_notified', 'custody.imported'));

-- The canonical-write action of the admission (0023 §9's precedent): objects.admit_version admits, under retention.import.admit, the
-- record and the claim types a package carries and nothing else — never an SRC, an OBS, or a type another port owns.
INSERT INTO observation.canonical_write_actions (action, object_types, rationale) VALUES
  ('retention.import.admit', ARRAY['EVD','ENT','EVT','CLM','REL','ASM'], 'The governed import admits a partner''s exported records and the claims, entities and edges of their closure under ids this installation mints; it may not touch observation state')
ON CONFLICT (action) DO NOTHING;

-- THE IMPORT FORMS (D3): EVD@v2, ENT@v2, EVT@v2, REL@v2, ASM@v2 from the v1 rows and CLM@v3 from CLM@v2 — each the base schema with ONE
-- property added, imported_from (eye-import-provenance/1: the import, the partner, the instant, the origin package with its signature,
-- the origin object by id, version, type, schema and canonical digest, and the origin's 43-field header and payload VERBATIM), nothing
-- required beyond what the base requires; compatibility additive. Written from the registered rows, each insert counted — a base row
-- absent is a real failure here, never a silent substitution (0023 §9's lesson).
DO $$
DECLARE
  v_imported_from jsonb := '{
    "type": "object",
    "additionalProperties": false,
    "required": ["format","import_id","partner_key","imported_at","package","object","header","payload"],
    "properties": {
      "format": { "const": "eye-import-provenance/1" },
      "import_id": { "type": "string" },
      "partner_key": { "type": "string" },
      "imported_at": { "type": "string" },
      "package": { "type": "object" },
      "object": { "type": "object" },
      "header": { "type": "object" },
      "payload": { "type": "object" }
    }
  }'::jsonb;
  v_n int; t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['EVD', 'ENT', 'EVT', 'REL', 'ASM'] LOOP
    INSERT INTO objects.schema_registry (object_type, schema_version, json_schema, compatibility)
    SELECT r.object_type, 'v2', jsonb_set(r.json_schema, '{properties,imported_from}', v_imported_from, true), 'additive'
      FROM objects.schema_registry r WHERE r.object_type = t AND r.schema_version = 'v1';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 1 THEN RAISE EXCEPTION 'migration 0076: the import form %@v2 could not be written from %@v1 (% row(s))', t, t, v_n; END IF;
  END LOOP;
  INSERT INTO objects.schema_registry (object_type, schema_version, json_schema, compatibility)
  SELECT 'CLM', 'v3', jsonb_set(r.json_schema, '{properties,imported_from}', v_imported_from, true), 'additive'
    FROM objects.schema_registry r WHERE r.object_type = 'CLM' AND r.schema_version = 'v2';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION 'migration 0076: the import form CLM@v3 could not be written from CLM@v2 (% row(s))', v_n; END IF;
  SELECT count(*) INTO v_n FROM objects.schema_registry r
   WHERE (r.object_type, r.schema_version) IN (('EVD', 'v2'), ('ENT', 'v2'), ('EVT', 'v2'), ('REL', 'v2'), ('ASM', 'v2'), ('CLM', 'v3'))
     AND r.json_schema -> 'properties' -> 'imported_from' -> 'properties' -> 'format' ->> 'const' = 'eye-import-provenance/1';
  IF v_n <> 6 THEN RAISE EXCEPTION 'migration 0076: expected the six import forms to carry imported_from; found %', v_n; END IF;
END $$;

-- ============================================================
-- §6 the interface register
-- ============================================================
UPDATE objects.interface_register SET bound_to = bound_to || '; B16 (0076): the governed import (retention.imports / import_items / import_events; the exchange partner; quarantine → verification → approval → admission through objects.admit_version under retention.import.admit; custody.imported), the versioned closure (links/2) and held recipients (retention.export_delivery_held)'
  WHERE interface_id = 'L3-I04';
DO $$
DECLARE v_bound int; v_partial int; v_unbound int;
BEGIN
  SELECT count(*) FILTER (WHERE binding_state = 'bound'), count(*) FILTER (WHERE binding_state = 'partial'), count(*) FILTER (WHERE binding_state = 'unbound') INTO v_bound, v_partial, v_unbound FROM objects.interface_register;
  IF (v_bound, v_partial, v_unbound) <> (26, 24, 0) THEN
    RAISE EXCEPTION 'interface register after 0076: expected 26 bound, 24 partial, 0 unbound; found %, %, %', v_bound, v_partial, v_unbound;
  END IF;
END $$;
