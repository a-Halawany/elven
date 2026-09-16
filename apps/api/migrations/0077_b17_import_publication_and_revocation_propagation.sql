-- 0077 — CP-6 B17: imported knowledge PUBLISHED to the importing domain's subscribers (nothing in SQL — the events are the
-- code's, through the outbox of the write that made the change), the origin's REVOCATION PROPAGATED into the importing domains
-- of the tenant (the importer as a recipient on the origin's ledger; the SIGNED notice; retention.import.revoke — every copy an
-- admitted import holds destroyed and the receipt answered), and the REVIEW GATE on an imported claim (2026-09-16).
--
-- THE GAP. B16 (0076) left two omissions stated in the import service's own header: (a) no ObservationRecorded / GraphChanged is
-- published for imported knowledge — a twin bounded by an imported entity, a strategy resting on an imported claim, the retrieval
-- check, the memory mappings: none of the domain's subscribers learns that the graph grew; (b) "the origin's later revocation of
-- an admitted package is the partner's notice, not a propagation" — the origin's revoke act reached the destinations that held
-- the bytes (0074 §3, 0076 §1) and stopped there: an importing domain of the same tenant, holding the records, the claim versions,
-- the entities and the edges under ids of its own, was never told, never destroyed anything and never answered. And (c) an
-- imported claim version could be challenged through intelligence.request_review as if a run of this domain had produced it.
--
-- THE MECHANISM.
-- (D1) THE EVENTS are the code's: ONE GraphChanged/import.admitted from the graph write that finishes an admission and ONE
--   ObservationRecorded per admitted record from its batch write, through the pipeline's outbox; ONE GraphChanged/import.revoked
--   from the write that finishes a revocation attempt, with the walk the invalidation uses. No row of this migration carries them;
--   the register's clauses (§9) do.
-- (D2) AN IMPORTER IS A RECIPIENT on the origin's ledger (§1): retention.export_revocation_notices takes an importer notice —
--   destination_id and delivery_id NULL, importer {tenant_id, domain_id, import_id} set (rxn_recipient: exactly one of the two
--   shapes) — the same signed notice a destination receives, recorded notified and answered once (acknowledged | mismatched) by the
--   importing domain's own write through retention.answer_import_notice; a notice already answered, or none recorded, is answered by
--   a NEW attempt row recorded answered at once. The origin finds its importers by retention.imports_of_package — the tenant's own
--   domains (D14 of the design): another tenant's import on this installation is a foreign recipient and takes the station path.
-- (D3) THE STATES revoking and revoked (§2): admitted → revoking (an attempt counted; again for a resumed attempt) → revoked once
--   every copy held from THIS delivery is destroyed or accounted for by another live import; a manifest under a LEGAL HOLD keeps
--   the import revoking with import.revocation_held naming the refused items — the steward retries when the hold is lifted.
--   `revoked` never stands over a copy still held: that would be the lie of Codex C3. A revoked import keeps its package digest
--   occupied (rim_live_package): a revoked package is not re-imported.
-- (D4) THE ITEM MAP IS THE REFERENCE COUNT (§3): each admitted or reused item takes its revocation outcome once on the row
--   (revocation, revoked_at — retracted, retired, withdrawn, tombstoned, left, refused; refused again only after a hold is lifted);
--   a copy a LATER live import reused is LEFT with held_by (it falls with that import's revocation); a destroyed copy is never
--   reused again (the reuse lookups read the live partial indexes rii_reuse_live / rii_reuse_object_live — a later package carrying
--   the same objects admits them afresh under new ids).
-- (D5) THE DESTRUCTION (§7) speaks the graph's existing vocabulary and nothing new: an imported edge asserted → retracted
--   (edge.retracted), an imported entity active → retired (entity.retired — its identifiers stay: facts of a retired entity the
--   memory-mappings subscriber proposes on), a claim version withdrawn by a new version through objects.admit_version (lifecycle and
--   truth state withdrawn; its lineage carried onto the withdrawn version so the pair rule holds), a record withdrawn, tombstoned
--   (observation.tombstone_blob now admits retention.import.revoke; the hold refusal P0R01 is the one refusal that keeps the record
--   whole) and custody.tombstoned. The attempts on one import serialise on its advisory lock (Codex C14): every port of the
--   revocation takes it after its authority checks, so a second attempt finds the first's items settled.
-- (D6) THE SOURCE of a revocation is verified before anything is destroyed: kind origin — the origin package's own record on this
--   installation, revoked under the import's digest; kind station — the origin's SIGNED notice, verified by the service against the
--   import's partner (or a partner of the same party under a rotated key, re-checked here) and bound by the port to the import's
--   package and action. An unverified notice destroys nothing.
-- (D7) THE REVIEW GATE (§8): intelligence.request_review refuses a claim whose latest version carries imported_from — an imported
--   claim version is corrected at its origin and re-imported; it is not reviewed here.
-- (D8) The register: L1-I03 and L3-I04 gain the B17 clauses; the counts stay (26 bound, 24 partial, 0 unbound).
--
--   §1 the origin's ledger: an importer as a recipient (rxn_recipient, rxn_importer_attempt, rxn_importer; the acknowledge trigger).
--   §2 the import ledger: the states revoking and revoked (the columns, the constraints, the transition trigger).
--   §3 the items: the revocation outcome (the columns, rii_revoked, rii_pending_revocation, the live reuse indexes; the settle trigger).
--   §4 the events (the vocabulary; record_import_event re-declared; the readers import_revoking / import_item_revocable — no grant).
--   §5 the origin finds its importers (imports_of_package; revoke_export re-declared with importers).
--   §6 the importer notice on the origin ledger (begin_import_revocation_notice, record_import_revocation_notice;
--      acknowledge_revocation_notice re-declared importer-aware).
--   §7 the revocation in the importing domain (begin_import_revocation, retract_imported_edge, retire_imported_entity,
--      mark_import_item_revoked, record_import_withdrawal_lineage, record_import_revocation_custody, finish_import_revocation,
--      answer_import_notice — internal, record_import_revocation_receipt).
--   §8 the authorities that admit the revocation, and the review gate (the canonical-write action retention.import.revoke;
--      observation.tombstone_blob; intelligence.request_review; begin_import_admission re-declared with the contract's authority class).
--   §9 the interface register.
--
-- The refusals: 'retention import rejected: …' as 0076 left it (42501 → 403 for "recorded by the acting principal", "no policy
-- decision"; 23503 → 404 for "no such …"; 22023 → 409 for the record's state — "import … is …, not …", "was revoked at", "still
-- pending" — and 422 otherwise), 'retention notice rejected: …' as 0074 left it, 'challenge rejected: …' as 0066 left it — the new
-- texts added to the mapper (observation-errors.ts).

-- ============================================================
-- §1 the origin's ledger: an importer as a recipient (D2)
-- ============================================================
-- A notice to an IMPORTER names no destination and no delivery (the importing domain holds the package as an admitted import, not
-- as a delivered file): destination_id and delivery_id become nullable, importer carries {tenant_id, domain_id, import_id}, and
-- rxn_recipient admits exactly the two shapes — a destination with its delivery, or an importer. rxn_attempt (action, destination,
-- attempt) stays: NULL destination ids are distinct; an importer's attempts are unique by import id (rxn_importer_attempt).
ALTER TABLE retention.export_revocation_notices ALTER COLUMN destination_id DROP NOT NULL;
ALTER TABLE retention.export_revocation_notices ALTER COLUMN delivery_id DROP NOT NULL;
ALTER TABLE retention.export_revocation_notices ADD COLUMN importer jsonb CHECK (importer IS NULL OR jsonb_typeof(importer) = 'object');
ALTER TABLE retention.export_revocation_notices ADD CONSTRAINT rxn_recipient CHECK ((destination_id IS NULL) <> (importer IS NULL) AND (destination_id IS NULL) = (delivery_id IS NULL));
CREATE UNIQUE INDEX rxn_importer_attempt ON retention.export_revocation_notices (action_id, (importer ->> 'import_id'), attempt) WHERE importer IS NOT NULL;
CREATE INDEX rxn_importer ON retention.export_revocation_notices ((importer ->> 'import_id')) WHERE importer IS NOT NULL;

-- The acknowledge trigger re-declared (0074 §3's body): the importer is one more column the one move never touches. The trigger,
-- the RLS policy and the grants are unchanged.
CREATE OR REPLACE FUNCTION retention.export_revocation_notices_acknowledge_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'table retention.export_revocation_notices is append-only (ADR-P0-07): DELETE prohibited' USING ERRCODE = '42501'; END IF;
  IF OLD.state <> 'notified' OR NEW.state NOT IN ('acknowledged', 'mismatched') OR OLD.acknowledged_at IS NOT NULL OR NEW.acknowledged_at IS NULL OR NEW.receipt IS NULL
     OR NEW.notice_id IS DISTINCT FROM OLD.notice_id OR NEW.scope IS DISTINCT FROM OLD.scope OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.domain_id IS DISTINCT FROM OLD.domain_id
     OR NEW.action_id IS DISTINCT FROM OLD.action_id OR NEW.destination_id IS DISTINCT FROM OLD.destination_id OR NEW.delivery_id IS DISTINCT FROM OLD.delivery_id OR NEW.attempt IS DISTINCT FROM OLD.attempt
     OR NEW.importer IS DISTINCT FROM OLD.importer
     OR NEW.package_digest IS DISTINCT FROM OLD.package_digest OR NEW.archive_digest IS DISTINCT FROM OLD.archive_digest OR NEW.notice IS DISTINCT FROM OLD.notice OR NEW.notice_digest IS DISTINCT FROM OLD.notice_digest
     OR NEW.failure_class IS DISTINCT FROM OLD.failure_class OR NEW.notified_at IS DISTINCT FROM OLD.notified_at OR NEW.notified_by IS DISTINCT FROM OLD.notified_by
     OR NEW.correlation_id IS DISTINCT FROM OLD.correlation_id THEN
    RAISE EXCEPTION 'a revocation notice is acknowledged once (acknowledged or mismatched, with the receipt); nothing else about it changes' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

-- ============================================================
-- §2 the import ledger: the states revoking and revoked (D3)
-- ============================================================
-- An admitted import moves to REVOKING when its origin's revocation reaches it (the attempt counted, as an admission's are) and to
-- REVOKED — who, when, the revocation (the source, the counts, the attempts) — once no item of it is refused. rim_revoked: revoked ⇔
-- the revocation recorded; a revoking import has counted at least one attempt. The revocation's origin, its notice and its
-- verification live on the events and the items, never as columns of their own.
ALTER TABLE retention.imports ADD COLUMN revoked_by uuid, ADD COLUMN revoked_at timestamptz,
  ADD COLUMN revocation jsonb CHECK (revocation IS NULL OR jsonb_typeof(revocation) = 'object'),
  ADD COLUMN revocation_attempts int NOT NULL DEFAULT 0 CHECK (revocation_attempts >= 0);
ALTER TABLE retention.imports DROP CONSTRAINT imports_state_check;
ALTER TABLE retention.imports ADD CONSTRAINT imports_state_check CHECK (state IN ('quarantined', 'verified', 'approved', 'admitting', 'admitted', 'withdrawn', 'revoking', 'revoked'));
ALTER TABLE retention.imports DROP CONSTRAINT rim_verified;
ALTER TABLE retention.imports ADD CONSTRAINT rim_verified CHECK ((state = 'quarantined' AND NOT verified) OR (state IN ('verified', 'approved', 'admitting', 'admitted', 'revoking', 'revoked') AND verified) OR state = 'withdrawn');
ALTER TABLE retention.imports DROP CONSTRAINT rim_admitted;
ALTER TABLE retention.imports ADD CONSTRAINT rim_admitted CHECK ((state IN ('admitted', 'revoking', 'revoked')) = (admitted_at IS NOT NULL) AND (admitted_at IS NULL) = (admitted_by IS NULL));
ALTER TABLE retention.imports ADD CONSTRAINT rim_revoked CHECK ((state = 'revoked') = (revoked_at IS NOT NULL) AND (revoked_at IS NULL) = (revoked_by IS NULL) AND (revoked_at IS NULL) = (revocation IS NULL) AND (state <> 'revoking' OR revocation_attempts >= 1));

-- THE TRANSITIONS re-declared (0076 §4's body) with two moves added: admitted or revoking → revoking (the revocation attempt
-- counted, nothing else); revoking → revoked (who, when, the revocation). Every other column is compared whole, as before.
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
  ELSIF OLD.state IN ('admitted', 'revoking') AND NEW.state = 'revoking' THEN
    v_ok := OLD.revoked_at IS NULL AND NEW.revocation_attempts = OLD.revocation_attempts + 1
            AND (v_new - ARRAY['state', 'revocation_attempts']) = (v_old - ARRAY['state', 'revocation_attempts']);
  ELSIF OLD.state = 'revoking' AND NEW.state = 'revoked' THEN
    v_ok := OLD.revoked_at IS NULL AND NEW.revoked_by IS NOT NULL AND NEW.revoked_at IS NOT NULL AND NEW.revocation IS NOT NULL AND jsonb_typeof(NEW.revocation) = 'object'
            AND (v_new - ARRAY['state', 'revoked_by', 'revoked_at', 'revocation']) = (v_old - ARRAY['state', 'revoked_by', 'revoked_at', 'revocation']);
  END IF;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'an import moves by its governed acts alone (verified → approved → admitting → admitted → revoking → revoked; quarantined, verified, approved or admitting → withdrawn); nothing else about it changes' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

-- ============================================================
-- §3 the items: the revocation outcome (D4)
-- ============================================================
-- An admitted or reused item records what the revocation made of it — revocation {outcome, …} and revoked_at — once, and once more
-- only when the earlier outcome was refused (a hold since lifted). rii_pending_revocation is the finish's pending count. The LIVE
-- reuse indexes (Codex C2) are what the service's reuse lookups read from B17 on: an item whose copy was destroyed is never reused
-- — a later package carrying the same objects admits them afresh under new ids (the 0076 indexes stay for the ledger's readers).
ALTER TABLE retention.import_items ADD COLUMN revoked_at timestamptz,
  ADD COLUMN revocation jsonb CHECK (revocation IS NULL OR jsonb_typeof(revocation) = 'object');
ALTER TABLE retention.import_items ADD CONSTRAINT rii_revoked CHECK ((revoked_at IS NULL) = (revocation IS NULL) AND (revoked_at IS NULL OR disposition IN ('admitted', 'reused')));
CREATE INDEX rii_pending_revocation ON retention.import_items (import_id) WHERE disposition IN ('admitted', 'reused') AND revoked_at IS NULL;
CREATE INDEX rii_reuse_live ON retention.import_items (tenant_id, domain_id, kind, origin_ref) WHERE disposition IN ('admitted', 'reused') AND revoked_at IS NULL;
CREATE INDEX rii_reuse_object_live ON retention.import_items (tenant_id, domain_id, kind, origin_object_id) WHERE disposition IN ('admitted', 'reused') AND revoked_at IS NULL;

-- The settle trigger re-declared (0076 §4's body): the revocation outcome is the second move a settled item takes, once — and
-- again only when the earlier outcome was refused; the settle from staged is as before, with the revocation columns untouched.
CREATE OR REPLACE FUNCTION retention.import_items_settle_once() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'table retention.import_items is append-only (ADR-P0-07): DELETE prohibited' USING ERRCODE = '42501'; END IF;
  -- B17 (0077): a settled admitted or reused item takes its REVOCATION outcome once — and once more only when the earlier outcome was refused (a hold since lifted).
  IF OLD.disposition IN ('admitted', 'reused') AND NEW.disposition = OLD.disposition AND NEW.revocation IS NOT NULL AND NEW.revoked_at IS NOT NULL
     AND (OLD.revoked_at IS NULL OR (OLD.revocation ->> 'outcome') = 'refused')
     AND (to_jsonb(NEW) - ARRAY['revocation', 'revoked_at']) = (to_jsonb(OLD) - ARRAY['revocation', 'revoked_at']) THEN
    RETURN NEW;
  END IF;
  IF OLD.disposition <> 'staged' OR NEW.disposition NOT IN ('admitted', 'reused', 'excluded', 'refused') OR NEW.admitted_at IS NULL OR NEW.revoked_at IS NOT NULL
     OR (to_jsonb(NEW) - ARRAY['disposition', 'gate', 'reason', 'admitted', 'admitted_at']) <> (to_jsonb(OLD) - ARRAY['disposition', 'gate', 'reason', 'admitted', 'admitted_at']) THEN
    RAISE EXCEPTION 'an import item is settled once — admitted, reused, excluded or refused, with its gate, reason and outcome — and revoked once; nothing else about it changes' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

-- ============================================================
-- §4 the events
-- ============================================================
-- The revocation's events: notified (the origin's notice reached this ledger — the one cross-domain write, §6), started (an
-- attempt), each batch revoked, held (a legal hold refused items; the state stays revoking), revoked (every copy destroyed or
-- accounted for), the copies destroyed or refused (the receipt after the bytes went), a notice refused (unverified — nothing
-- destroyed), an attempt failed (an infrastructure fault; the import still revoking).
ALTER TABLE retention.import_events DROP CONSTRAINT import_events_event_check;
ALTER TABLE retention.import_events ADD CONSTRAINT import_events_event_check CHECK (event IN (
  'import.opened', 'import.verified', 'import.quarantined', 'import.approved', 'import.admission_started', 'import.batch_admitted', 'import.admitted', 'import.finalized', 'import.failed', 'import.withdrawn', 'import.evidence_tombstoned',
  'import.revocation_notified', 'import.revocation_started', 'import.batch_revoked', 'import.revocation_held', 'import.revoked', 'import.copies_destroyed', 'import.copies_refused', 'import.revocation_refused', 'import.revocation_failed'));

-- THE EVENTS A CALLER RECORDS re-declared (0076 §4's body): the revocation's authority admitted; import.batch_revoked and
-- import.revocation_failed on a revocation in progress; import.revocation_refused on an admitted, revoking or revoked import (an
-- unverified notice is a recorded refusal — nothing destroyed). Every other line as 0076 left it.
CREATE OR REPLACE FUNCTION retention.record_import_event(p_import_id uuid, p_tenant uuid, p_domain uuid, p_event text, p_details jsonb, p_actor uuid, p_correlation uuid)
RETURNS void
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i retention.imports%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.import.admit', 'retention.import.withdraw', 'retention.import.revoke']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'retention import rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_event IS NULL OR p_event NOT IN ('import.batch_admitted', 'import.finalized', 'import.failed', 'import.evidence_tombstoned', 'import.batch_revoked', 'import.revocation_failed', 'import.revocation_refused') THEN
    RAISE EXCEPTION 'retention import rejected: the events a caller records are import.batch_admitted, import.finalized, import.failed, import.evidence_tombstoned, import.batch_revoked, import.revocation_failed and import.revocation_refused' USING ERRCODE = '22023';
  END IF;
  IF p_details IS NOT NULL AND jsonb_typeof(p_details) <> 'object' THEN RAISE EXCEPTION 'retention import rejected: the details of an event are a JSON object' USING ERRCODE = '22023'; END IF;
  SELECT * INTO i FROM retention.imports x WHERE x.import_id = p_import_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention import rejected: no such import % in this domain', p_import_id USING ERRCODE = '23503'; END IF;
  IF p_event IN ('import.batch_admitted', 'import.failed') AND i.state <> 'admitting' THEN RAISE EXCEPTION 'retention import rejected: import % is %, not admitting — % is an admission''s event', p_import_id, i.state, p_event USING ERRCODE = '22023'; END IF;
  IF p_event = 'import.finalized' AND i.state <> 'admitted' THEN RAISE EXCEPTION 'retention import rejected: import % is %, not admitted — import.finalized follows an admission', p_import_id, i.state USING ERRCODE = '22023'; END IF;
  IF p_event = 'import.evidence_tombstoned' AND i.state <> 'withdrawn' THEN RAISE EXCEPTION 'retention import rejected: import % is %, not withdrawn — import.evidence_tombstoned follows a withdrawal (a quarantined import''s evidence is swept by the sweeper)', p_import_id, i.state USING ERRCODE = '22023'; END IF;
  IF p_event IN ('import.batch_revoked', 'import.revocation_failed') AND i.state <> 'revoking' THEN RAISE EXCEPTION 'retention import rejected: import % is %, not revoking — % is a revocation''s event', p_import_id, i.state, p_event USING ERRCODE = '22023'; END IF;
  IF p_event = 'import.revocation_refused' AND i.state NOT IN ('admitted', 'revoking', 'revoked') THEN RAISE EXCEPTION 'retention import rejected: import % is %, not admitted — a revocation notice is refused on an admitted import', p_import_id, i.state USING ERRCODE = '22023'; END IF;
  PERFORM retention.import_event(p_import_id, p_tenant, p_domain, p_event, p_actor, p_details, p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.record_import_event(uuid,uuid,uuid,text,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.record_import_event(uuid,uuid,uuid,text,jsonb,uuid,uuid) TO eye_commit;

-- The two readers the revocation ports share (no grant — internal, beside 0076's import_admitting / import_item_staged): the
-- import of this domain in state REVOKING, locked FOR SHARE for the batch; and the item a revocation acts on — of the import, of
-- the kind, ADMITTED or REUSED, not yet revoked or revoked with the outcome refused (retried) — locked FOR UPDATE. An item another
-- attempt settled is refused "was revoked at": the service reads that text as settled, not as a failure (Codex C14).
CREATE OR REPLACE FUNCTION retention.import_revoking(p_import_id uuid, p_tenant uuid, p_domain uuid) RETURNS retention.imports
SET search_path = retention, pg_catalog, pg_temp AS $$
DECLARE i retention.imports%ROWTYPE;
BEGIN
  SELECT * INTO i FROM retention.imports x WHERE x.import_id = p_import_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention import rejected: no such import % in this domain', p_import_id USING ERRCODE = '23503'; END IF;
  IF i.state <> 'revoking' THEN RAISE EXCEPTION 'retention import rejected: import % is %, not revoking — only a revocation in progress destroys what it admitted', p_import_id, i.state USING ERRCODE = '22023'; END IF;
  RETURN i;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.import_revoking(uuid,uuid,uuid) FROM PUBLIC;
CREATE OR REPLACE FUNCTION retention.import_item_revocable(p_item_id uuid, p_import_id uuid, p_kind text) RETURNS retention.import_items
SET search_path = retention, pg_catalog, pg_temp AS $$
DECLARE t retention.import_items%ROWTYPE;
BEGIN
  SELECT * INTO t FROM retention.import_items x WHERE x.item_id = p_item_id AND x.import_id = p_import_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention import rejected: no such item % of import % in this domain', p_item_id, p_import_id USING ERRCODE = '23503'; END IF;
  IF p_kind IS NOT NULL AND t.kind <> p_kind THEN RAISE EXCEPTION 'retention import rejected: item % of import % is a %, not a %', p_item_id, p_import_id, t.kind, p_kind USING ERRCODE = '22023'; END IF;
  IF t.disposition NOT IN ('admitted', 'reused') THEN RAISE EXCEPTION 'retention import rejected: item % of import % is %, not admitted — nothing of it is destroyed', p_item_id, p_import_id, t.disposition USING ERRCODE = '22023'; END IF;
  IF t.revoked_at IS NOT NULL AND coalesce(t.revocation ->> 'outcome', '') <> 'refused' THEN RAISE EXCEPTION 'retention import rejected: item % of import % was revoked at % (%)', p_item_id, p_import_id, t.revoked_at, coalesce(t.revocation ->> 'outcome', '?') USING ERRCODE = '22023'; END IF;
  RETURN t;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.import_item_revocable(uuid,uuid,text) FROM PUBLIC;

-- ============================================================
-- §5 the origin finds its importers (D2)
-- ============================================================
-- THE IMPORTERS OF A PACKAGE (retention.export.revoke / .notify / .read): the admitted, revoking or revoked imports of THIS
-- package — by the origin's action and the package digest — in the tenant's own domains, which the definer reads across (D14 of
-- the design: no principal holds authority across tenants, so another tenant's import on this installation is a foreign recipient
-- and takes the station path). Nothing for a digest that is not one.
CREATE OR REPLACE FUNCTION retention.imports_of_package(p_origin_tenant uuid, p_origin_domain uuid, p_action_id uuid, p_package_digest text)
RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.export.revoke', 'retention.export.notify', 'retention.read']);
  PERFORM observation.assert_scope(p_origin_tenant, p_origin_domain);
  IF p_action_id IS NULL OR p_package_digest IS NULL OR p_package_digest !~ '^[0-9a-f]{64}$' THEN RETURN '[]'::jsonb; END IF;
  -- D14: the tenant's own domains — the definer reads retention.imports across them; another tenant's import is a foreign recipient (the station path).
  SELECT coalesce(jsonb_agg(jsonb_build_object('tenant_id', i.tenant_id, 'domain_id', i.domain_id, 'import_id', i.import_id, 'state', i.state, 'partner_key', xp.partner_key, 'partner_id', i.partner_id,
                                                'admitted_at', i.admitted_at, 'admitted_by', i.admitted_by, 'revoked_at', i.revoked_at, 'revocation_attempts', i.revocation_attempts, 'counts', i.counts) ORDER BY i.admitted_at, i.import_id), '[]'::jsonb)
    INTO v
    FROM retention.imports i LEFT JOIN retention.exchange_partners xp ON xp.partner_id = i.partner_id
   WHERE i.tenant_id = p_origin_tenant AND i.package_digest = p_package_digest AND i.state IN ('admitted', 'revoking', 'revoked')
     AND (i.origin ->> 'action_id') = p_action_id::text AND (i.origin ->> 'tenant_id') = p_origin_tenant::text AND (i.origin ->> 'domain_id') = p_origin_domain::text;
  RETURN v;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.imports_of_package(uuid,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.imports_of_package(uuid,uuid,uuid,text) TO eye_commit;

-- revoke_export re-declared (0076 §1's body): the answer one key longer — importers, the tenant's own domains holding the package
-- as an admitted import, so the revoke act notifies each and executes the revocation there. The row and the event unchanged.
CREATE OR REPLACE FUNCTION retention.revoke_export(p_action_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x retention.export_packages%ROWTYPE; v_recipients jsonb; v_importers jsonb;
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
  v_importers := retention.imports_of_package(p_tenant, p_domain, p_action_id, x.package_digest);
  RETURN jsonb_build_object('action_id', p_action_id, 'locator_prefix', x.locator_prefix, 'package_digest', x.package_digest, 'revoked_at', clock_timestamp(), 'recipients', v_recipients, 'importers', v_importers);
END $$ LANGUAGE plpgsql;

-- ============================================================
-- §6 the importer notice on the origin ledger (D2)
-- ============================================================
-- THE BEGINNING of an importer notice (retention.export.revoke / .notify): the action a customer export whose package is REVOKED
-- and delivered (the archive digest recorded), the import an admitted (or revoking, or revoked) copy of THIS package in a domain of
-- this tenant (the definer reads across them), the attempt allocated under the action's delivery lock. Returns the notice id, the
-- attempt, the package and the importer.
CREATE OR REPLACE FUNCTION retention.begin_import_revocation_notice(p_action_id uuid, p_tenant uuid, p_domain uuid, p_import_id uuid, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a retention.actions_current%ROWTYPE; x retention.export_packages%ROWTYPE; i retention.imports%ROWTYPE; xp retention.exchange_partners%ROWTYPE; v_attempt int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.export.revoke', 'retention.export.notify']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'retention notice rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO a FROM retention.actions_current y WHERE y.action_id = p_action_id AND y.tenant_id = p_tenant AND y.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention notice rejected: % has no export package in this domain', p_action_id USING ERRCODE = '23503'; END IF;
  IF a.kind <> 'customer_export' THEN RAISE EXCEPTION 'retention notice rejected: % is a %, not a customer export', p_action_id, a.kind USING ERRCODE = '22023'; END IF;
  SELECT * INTO x FROM retention.export_packages e WHERE e.action_id = p_action_id AND e.tenant_id = p_tenant AND e.domain_id = p_domain FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention notice rejected: % has no export package in this domain', p_action_id USING ERRCODE = '23503'; END IF;
  IF x.revoked_at IS NULL THEN RAISE EXCEPTION 'retention notice rejected: the package of % is not revoked; a revocation notice tells a recipient of a revocation', p_action_id USING ERRCODE = '22023'; END IF;
  IF x.archive_digest IS NULL THEN RAISE EXCEPTION 'retention notice rejected: the package of % was built before its archive digest was recorded (B13); it was never delivered', p_action_id USING ERRCODE = '22023'; END IF;
  -- D14: an admitted import of THIS package in a domain of this tenant (the definer reads across the tenant's domains).
  SELECT * INTO i FROM retention.imports q WHERE q.import_id = p_import_id AND q.tenant_id = p_tenant AND q.state IN ('admitted', 'revoking', 'revoked')
                                              AND q.package_digest = x.package_digest AND (q.origin ->> 'action_id') = p_action_id::text;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention notice rejected: import % holds no admitted copy of the package of % in this tenant; nothing to notify', p_import_id, p_action_id USING ERRCODE = '22023'; END IF;
  SELECT * INTO xp FROM retention.exchange_partners z WHERE z.partner_id = i.partner_id;
  PERFORM pg_advisory_xact_lock(retention.lock_key_export_deliveries(p_action_id));
  SELECT 1 + count(*)::int INTO v_attempt FROM retention.export_revocation_notices n WHERE n.action_id = p_action_id AND (n.importer ->> 'import_id') = p_import_id::text;
  RETURN jsonb_build_object('notice_id', gen_random_uuid(), 'attempt', v_attempt, 'package', to_jsonb(x),
                            'importer', jsonb_build_object('tenant_id', i.tenant_id, 'domain_id', i.domain_id, 'import_id', i.import_id, 'state', i.state, 'partner_key', xp.partner_key, 'admitted_at', i.admitted_at, 'admitted_by', i.admitted_by, 'counts', i.counts));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.begin_import_revocation_notice(uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.begin_import_revocation_notice(uuid,uuid,uuid,uuid,uuid,uuid) TO eye_commit;

-- THE RECORD of an importer notice: state notified (the execution and its receipt follow through answer_import_notice); the row with importer set and
-- no destination; the origin's event and custody rows as record_revocation_notice writes them; and — the same installation — the IMPORTING ledger's own
-- event import.revocation_notified, written by the definer across domains (the one cross-domain write of the batch: the notice IS the importer's fact).
CREATE OR REPLACE FUNCTION retention.record_import_revocation_notice(
  p_notice_id uuid, p_action_id uuid, p_tenant uuid, p_domain uuid, p_import_id uuid, p_attempt int, p_notice jsonb, p_notice_digest text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a retention.actions_current%ROWTYPE; x retention.export_packages%ROWTYPE; i retention.imports%ROWTYPE; n retention.export_revocation_notices%ROWTYPE; it RECORD; m RECORD; v_evd uuid; v_obs uuid; v_at timestamptz; v_next int; v_recipient text; v_importer jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.export.revoke', 'retention.export.notify']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'retention notice rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_notice_id IS NULL THEN RAISE EXCEPTION 'retention notice rejected: the notice id is the one begin_import_revocation_notice allocated' USING ERRCODE = '22023'; END IF;
  IF p_notice IS NULL OR jsonb_typeof(p_notice) <> 'object' OR p_notice_digest IS NULL OR p_notice_digest !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'retention notice rejected: the notice is a JSON object recorded with the sha-256 hex of its canonical JSON' USING ERRCODE = '22023'; END IF;
  SELECT * INTO a FROM retention.actions_current y WHERE y.action_id = p_action_id AND y.tenant_id = p_tenant AND y.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention notice rejected: % has no export package in this domain', p_action_id USING ERRCODE = '23503'; END IF;
  SELECT * INTO x FROM retention.export_packages e WHERE e.action_id = p_action_id AND e.tenant_id = p_tenant AND e.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention notice rejected: % has no export package in this domain', p_action_id USING ERRCODE = '23503'; END IF;
  IF x.revoked_at IS NULL THEN RAISE EXCEPTION 'retention notice rejected: the package of % is not revoked', p_action_id USING ERRCODE = '22023'; END IF;
  SELECT * INTO i FROM retention.imports q WHERE q.import_id = p_import_id AND q.tenant_id = p_tenant AND q.state IN ('admitted', 'revoking', 'revoked') AND q.package_digest = x.package_digest AND (q.origin ->> 'action_id') = p_action_id::text;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention notice rejected: import % holds no admitted copy of the package of % in this tenant; nothing to notify', p_import_id, p_action_id USING ERRCODE = '22023'; END IF;
  IF NOT retention.holds_advisory(retention.lock_key_export_deliveries(p_action_id), 'ExclusiveLock') THEN
    RAISE EXCEPTION 'retention notice rejected: the notices of % are not serialised by this transaction (begin_import_revocation_notice takes the action''s delivery lock; a notice is recorded only under it)', p_action_id USING ERRCODE = '55P03';
  END IF;
  SELECT 1 + count(*)::int INTO v_next FROM retention.export_revocation_notices q WHERE q.action_id = p_action_id AND (q.importer ->> 'import_id') = p_import_id::text;
  IF p_attempt IS DISTINCT FROM v_next THEN RAISE EXCEPTION 'retention notice rejected: attempt % is not the next attempt (%) of % to import %', p_attempt, v_next, p_action_id, p_import_id USING ERRCODE = '22023'; END IF;
  v_at := clock_timestamp();
  v_importer := jsonb_build_object('tenant_id', i.tenant_id, 'domain_id', i.domain_id, 'import_id', i.import_id);
  v_recipient := 'import:' || i.tenant_id::text || '/' || i.domain_id::text || '/' || i.import_id::text;
  INSERT INTO retention.export_revocation_notices (notice_id, scope, tenant_id, domain_id, action_id, destination_id, delivery_id, importer, attempt, state, package_digest, archive_digest, notice, notice_digest, receipt, receipt_digest, failure_class, notified_at, acknowledged_at, notified_by, correlation_id)
  VALUES (p_notice_id, 'DOMAIN', p_tenant, p_domain, p_action_id, NULL, NULL, v_importer, p_attempt, 'notified', x.package_digest, x.archive_digest, p_notice, p_notice_digest, NULL, NULL, NULL, v_at, NULL, p_actor, p_correlation) RETURNING * INTO n;
  PERFORM retention.event(p_action_id, p_tenant, p_domain, 'export.revocation_notified', p_actor,
    jsonb_build_object('notice_id', p_notice_id, 'importer', v_importer, 'recipient', v_recipient, 'kind', 'importer', 'attempt', p_attempt, 'state', 'notified', 'package_digest', x.package_digest, 'archive_digest', x.archive_digest,
                       'notice_digest', p_notice_digest, 'revoked_at', x.revoked_at, 'held', 'confirmed', 'import_state', i.state), p_correlation);
  FOR it IN SELECT si.ref FROM retention.scope_items si WHERE si.action_id = p_action_id AND si.item_kind = 'manifest' AND si.disposition = 'execute' ORDER BY si.dependency_order LOOP
    SELECT bm.manifest_id, bm.source_id, bm.contract_version, bm.run_id, bm.content_digest, bm.locator INTO m FROM observation.blob_manifests bm WHERE bm.manifest_id = it.ref::uuid;
    SELECT o.object_id, (o.payload ->> 'obs_object_id')::uuid INTO v_evd, v_obs FROM objects.canonical_objects o
     WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.object_type = 'EVD' AND (o.payload ->> 'manifest_id')::uuid = m.manifest_id ORDER BY o.object_version DESC LIMIT 1;
    INSERT INTO observation.custody_events (event_id, scope, tenant_id, domain_id, manifest_id, obs_object_id, evd_object_id, source_id, contract_version, run_id, event, actor, content_digest, digest_verified, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, m.manifest_id, v_obs, v_evd, m.source_id, m.contract_version, m.run_id, 'custody.revocation_notified', 'principal:' || p_actor::text, m.content_digest, true,
            jsonb_build_object('action_id', p_action_id, 'notice_id', p_notice_id, 'importer', v_importer, 'recipient', v_recipient, 'state', 'notified', 'attempt', p_attempt, 'package_digest', x.package_digest, 'file', m.manifest_id::text || '.bin'), p_correlation);
  END LOOP;
  PERFORM retention.import_event(i.import_id, i.tenant_id, i.domain_id, 'import.revocation_notified', p_actor,
    jsonb_build_object('notice_id', p_notice_id, 'attempt', p_attempt, 'action_id', p_action_id, 'origin', jsonb_build_object('tenant_id', p_tenant, 'domain_id', p_domain), 'package_digest', x.package_digest, 'archive_digest', x.archive_digest,
                       'revoked_at', x.revoked_at, 'reason', x.revoke_reason, 'notice_digest', p_notice_digest, 'signed', (p_notice -> 'signature') IS NOT NULL AND jsonb_typeof(p_notice -> 'signature') = 'object', 'by', 'origin'), p_correlation);
  RETURN to_jsonb(n);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.record_import_revocation_notice(uuid,uuid,uuid,uuid,uuid,int,jsonb,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.record_import_revocation_notice(uuid,uuid,uuid,uuid,uuid,int,jsonb,text,uuid,uuid) TO eye_commit;

-- acknowledge_revocation_notice re-declared (0074 §3's body) importer-aware: the destination lookup finds nothing for an importer
-- notice (its destination_id is NULL), so the event names the importer and the recipient the notice itself states — the collect and
-- acknowledge acts on an importer notice are thereby possible (the origin's authority may present a receipt out of band). Every
-- other line as 0074 left it.
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
  v_details := jsonb_build_object('notice_id', p_notice_id, 'destination_id', n.destination_id, 'destination_key', dst.destination_key, 'importer', n.importer, 'recipient', coalesce(dst.recipient, n.notice ->> 'recipient'), 'delivery_id', n.delivery_id, 'attempt', n.attempt, 'state', v_state,
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
-- §7 the revocation in the importing domain (D3, D4, D5, D6)
-- ============================================================
-- Every port below takes the import's advisory lock — 'retention.import.revoke:<import_id>' — after its authority checks (Codex C14):
-- the attempts on one import serialise, a batch of one attempt never interleaves with another's, and a second attempt finds the
-- first's items settled ("was revoked at" — the service reads it as settled). `p_revocation` is the source block begin returns minus
-- the notice itself, plus the notice id — what the events and the reasons name.

-- THE BEGINNING (retention.import.revoke — the tenant's retention authority or administrator acting across the tenant, or the importing domain's
-- steward or administrator; human-gated): the import ADMITTED (or REVOKING: an attempt resumed); the SOURCE of the revocation established —
-- kind origin: the origin package's own record here (the definer reads retention.export_packages across the tenant's domains) revoked under the
-- import's package digest; kind station: the origin's SIGNED notice the service verified against the import's partner before this call (the port
-- re-checks the binding: the notice names the import's package and action, the verification names the import's partner or — Codex C7, the same
-- party under a rotated key — a partner of this domain whose party is the import's partner's); the state moved to revoking with the attempt
-- counted; the event import.revocation_started. A REVOKED import answers {kind: 'retried'} and moves nothing — with pending_notice_id (the latest
-- notified importer notice of this import on the origin ledger; NULL for a foreign origin) and last_receipt_event (whether the latest attempt's
-- receipt was recorded), so the service's retry answers an outstanding notice (Codex C5). Returns the import, the source as recorded and the
-- pending count.
CREATE OR REPLACE FUNCTION retention.begin_import_revocation(p_import_id uuid, p_tenant uuid, p_domain uuid, p_source jsonb, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i retention.imports%ROWTYPE; x retention.export_packages%ROWTYPE; n retention.export_revocation_notices%ROWTYPE; xp retention.exchange_partners%ROWTYPE; v_kind text; v_notice jsonb; v_source jsonb; v_pending int; v_origin_tenant uuid; v_origin_domain uuid; v_action uuid; v_vpartner uuid; v_pending_notice uuid; v_receipt boolean;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.import.revoke']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'retention import rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_source IS NULL OR jsonb_typeof(p_source) <> 'object' OR coalesce(p_source ->> 'kind', '') NOT IN ('origin', 'station') THEN RAISE EXCEPTION 'retention import rejected: the source of a revocation is origin (this installation''s record) or station (the origin''s signed notice)' USING ERRCODE = '22023'; END IF;
  v_kind := p_source ->> 'kind';
  PERFORM pg_advisory_xact_lock(hashtext('retention.import.revoke:' || p_import_id::text));
  SELECT * INTO i FROM retention.imports q WHERE q.import_id = p_import_id AND q.tenant_id = p_tenant AND q.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention import rejected: no such import % in this domain', p_import_id USING ERRCODE = '23503'; END IF;
  v_origin_tenant := NULLIF(i.origin ->> 'tenant_id', '')::uuid; v_origin_domain := NULLIF(i.origin ->> 'domain_id', '')::uuid; v_action := NULLIF(i.origin ->> 'action_id', '')::uuid;
  IF i.state = 'revoked' THEN
    -- C5: the retry's facts — an outstanding importer notice on the origin ledger (this tenant's origin only) and whether the latest attempt's receipt was recorded.
    IF v_origin_tenant = p_tenant AND v_action IS NOT NULL THEN
      SELECT q.notice_id INTO v_pending_notice FROM retention.export_revocation_notices q WHERE q.action_id = v_action AND (q.importer ->> 'import_id') = p_import_id::text AND q.state = 'notified' ORDER BY q.attempt DESC LIMIT 1;
    END IF;
    v_receipt := EXISTS (SELECT 1 FROM retention.import_events e WHERE e.import_id = p_import_id AND e.event IN ('import.copies_destroyed', 'import.copies_refused') AND (e.details ->> 'attempt') = i.revocation_attempts::text);
    RETURN jsonb_build_object('kind', 'retried', 'import', to_jsonb(i), 'pending', 0, 'pending_notice_id', v_pending_notice, 'last_receipt_event', v_receipt);
  END IF;
  IF i.state NOT IN ('admitted', 'revoking') THEN RAISE EXCEPTION 'retention import rejected: import % is %, not admitted — only an admitted import is revoked', p_import_id, i.state USING ERRCODE = '22023'; END IF;
  IF v_kind = 'origin' THEN
    IF v_origin_tenant IS DISTINCT FROM p_tenant THEN RAISE EXCEPTION 'retention import rejected: the origin of import % is not a domain of this tenant on this installation; present the origin''s signed notice from the station (source station)', p_import_id USING ERRCODE = '22023'; END IF;
    SELECT * INTO x FROM retention.export_packages e WHERE e.action_id = v_action AND e.tenant_id = v_origin_tenant AND e.domain_id = v_origin_domain;
    IF NOT FOUND OR x.package_digest IS DISTINCT FROM i.package_digest THEN RAISE EXCEPTION 'retention import rejected: the origin package of import % (action %) is not recorded on this installation under the import''s digest', p_import_id, v_action USING ERRCODE = '22023'; END IF;
    IF x.revoked_at IS NULL THEN RAISE EXCEPTION 'retention import rejected: the origin package of import % (action %) is not revoked', p_import_id, v_action USING ERRCODE = '22023'; END IF;
    SELECT * INTO n FROM retention.export_revocation_notices q WHERE q.action_id = v_action AND (q.importer ->> 'import_id') = p_import_id::text AND q.state = 'notified' ORDER BY q.attempt DESC LIMIT 1;
    v_notice := CASE WHEN FOUND THEN n.notice ELSE NULL END;
    v_source := jsonb_build_object('kind', 'origin', 'action_id', v_action, 'origin', jsonb_build_object('tenant_id', v_origin_tenant, 'domain_id', v_origin_domain), 'package_digest', x.package_digest, 'archive_digest', x.archive_digest,
                                   'revoked_at', x.revoked_at, 'reason', x.revoke_reason, 'notice_id', CASE WHEN FOUND THEN n.notice_id ELSE NULL END, 'notice_attempt', CASE WHEN FOUND THEN n.attempt ELSE NULL END, 'notice', v_notice);
  ELSE
    v_notice := p_source -> 'notice';
    IF v_notice IS NULL OR jsonb_typeof(v_notice) <> 'object' THEN RAISE EXCEPTION 'retention import rejected: a station source carries the origin''s revocation notice' USING ERRCODE = '22023'; END IF;
    IF (v_notice ->> 'package_digest') IS DISTINCT FROM i.package_digest THEN RAISE EXCEPTION 'retention import rejected: the revocation notice names package %, not the import''s %', coalesce(v_notice ->> 'package_digest', '<none>'), i.package_digest USING ERRCODE = '22023'; END IF;
    IF (v_notice ->> 'action_id') IS DISTINCT FROM v_action::text OR (v_notice ->> 'tenant_id') IS DISTINCT FROM v_origin_tenant::text OR (v_notice ->> 'domain_id') IS DISTINCT FROM v_origin_domain::text THEN
      RAISE EXCEPTION 'retention import rejected: the revocation notice names action %, not the import''s origin %', coalesce(v_notice ->> 'action_id', '<none>'), v_action USING ERRCODE = '22023';
    END IF;
    IF (p_source -> 'verification' ->> 'verified') IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'retention import rejected: the revocation notice is not verified against the import''s partner (%)', coalesce(p_source -> 'verification' ->> 'reason', 'unverified') USING ERRCODE = '22023';
    END IF;
    -- C7: the verifying partner is the import's, or a partner of this domain under the SAME party (the origin organisation's rotated key) — re-checked here.
    v_vpartner := NULLIF(p_source -> 'verification' ->> 'partner_id', '')::uuid;
    IF v_vpartner IS DISTINCT FROM i.partner_id THEN
      SELECT * INTO xp FROM retention.exchange_partners z WHERE z.partner_id = i.partner_id;
      IF v_vpartner IS NULL OR NOT FOUND OR NOT EXISTS (SELECT 1 FROM retention.exchange_partners z WHERE z.partner_id = v_vpartner AND z.tenant_id = p_tenant AND z.domain_id = p_domain AND z.party = xp.party) THEN
        RAISE EXCEPTION 'retention import rejected: the revocation notice is not verified against the import''s partner (verified against partner %, which is neither the import''s partner % nor a partner of this domain under the same party)', coalesce(v_vpartner::text, '<none>'), i.partner_id USING ERRCODE = '22023';
      END IF;
    END IF;
    v_source := jsonb_build_object('kind', 'station', 'destination_key', p_source ->> 'destination_key', 'action_id', v_action, 'origin', jsonb_build_object('tenant_id', v_origin_tenant, 'domain_id', v_origin_domain),
                                   'package_digest', i.package_digest, 'archive_digest', v_notice ->> 'archive_digest', 'revoked_at', v_notice ->> 'revoked_at', 'reason', v_notice ->> 'reason',
                                   'notice_id', v_notice ->> 'notice_id', 'notice_attempt', v_notice -> 'attempt', 'notice', v_notice, 'verification', p_source -> 'verification');
  END IF;
  UPDATE retention.imports SET state = 'revoking', revocation_attempts = revocation_attempts + 1 WHERE import_id = p_import_id RETURNING * INTO i;
  SELECT count(*)::int INTO v_pending FROM retention.import_items t WHERE t.import_id = p_import_id AND t.disposition IN ('admitted', 'reused') AND (t.revoked_at IS NULL OR (t.revocation ->> 'outcome') = 'refused');
  PERFORM retention.import_event(p_import_id, p_tenant, p_domain, 'import.revocation_started', p_actor, jsonb_build_object('attempt', i.revocation_attempts, 'source', v_source - 'notice', 'notice_digest', CASE WHEN v_notice IS NULL THEN NULL ELSE canon.sha256_hex(canon.jcs(v_notice)) END, 'pending', v_pending), p_correlation);
  RETURN jsonb_build_object('kind', 'begin', 'import', to_jsonb(i), 'source', v_source, 'pending', v_pending);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.begin_import_revocation(uuid,uuid,uuid,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.begin_import_revocation(uuid,uuid,uuid,jsonb,uuid,uuid) TO eye_commit;

-- AN IMPORTED EDGE RETRACTED (the edge this import CREATED — a reused edge is left by the service): state asserted → retracted at record time
-- with the actor and the reason naming the revocation; edge.retracted with details.imported and details.revoked (0065's derivation: the last state
-- event); an edge the origin recorded retracted or superseded is left as it is (outcome left); an edge another LIVE import reused (Codex C9) is
-- left with held_by — it falls with that import's revocation. The item's outcome recorded.
CREATE OR REPLACE FUNCTION retention.retract_imported_edge(p_item_id uuid, p_import_id uuid, p_tenant uuid, p_domain uuid, p_revocation jsonb, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, graph, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i retention.imports%ROWTYPE; t retention.import_items%ROWTYPE; e graph.edges_current%ROWTYPE; v_edge uuid; v_at timestamptz := clock_timestamp(); v_reason text; v_outcome text; v_held_by jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.import.revoke']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'retention import rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_revocation IS NULL OR jsonb_typeof(p_revocation) <> 'object' THEN RAISE EXCEPTION 'retention import rejected: the revocation an item is destroyed under is a JSON object' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('retention.import.revoke:' || p_import_id::text));
  i := retention.import_revoking(p_import_id, p_tenant, p_domain);
  t := retention.import_item_revocable(p_item_id, p_import_id, 'edge');
  IF t.disposition <> 'admitted' THEN RAISE EXCEPTION 'retention import rejected: item % of import % is reused, not this import''s; it is left', p_item_id, p_import_id USING ERRCODE = '22023'; END IF;
  v_edge := NULLIF(t.admitted ->> 'edge_id', '')::uuid;
  SELECT * INTO e FROM graph.edges_current q WHERE q.edge_id = v_edge AND q.tenant_id = p_tenant AND q.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention import rejected: edge % of item % is not an edge of this domain', v_edge, p_item_id USING ERRCODE = '23503'; END IF;
  -- C9: a copy another LIVE import holds (a later package reused this item) is left; it falls with that import's revocation.
  SELECT coalesce(jsonb_agg(DISTINCT i2.import_id), '[]'::jsonb) INTO v_held_by FROM retention.import_items t2 JOIN retention.imports i2 ON i2.import_id = t2.import_id
   WHERE t2.disposition = 'reused' AND (t2.planned -> 'reuse' ->> 'item_id') = p_item_id::text AND i2.state = 'admitted';
  v_reason := format('the origin revoked the package this edge was imported from (import %s; action %s; notice %s): %s', p_import_id, p_revocation ->> 'action_id', coalesce(p_revocation ->> 'notice_id', 'none recorded'), coalesce(p_revocation ->> 'reason', 'no reason stated'));
  IF jsonb_array_length(v_held_by) > 0 THEN
    v_outcome := 'left';
    v_reason := 'held under import ' || (SELECT string_agg(h, ', ') FROM jsonb_array_elements_text(v_held_by) h) || ' (admitted, not revoked)';
  ELSIF e.state = 'asserted' THEN
    UPDATE graph.edges_current SET state = 'retracted', retracted_at = v_at, retracted_by = p_actor, retraction_reason = v_reason WHERE edge_id = v_edge;
    INSERT INTO graph.edge_events (event_id, scope, tenant_id, domain_id, edge_id, event, occurred_at, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, v_edge, 'edge.retracted', v_at, p_actor,
            jsonb_build_object('imported', true, 'import_id', p_import_id, 'item_id', p_item_id, 'revoked', p_revocation, 'reason', v_reason, 'retracted_at', v_at, 'claim_object_id', e.claim_object_id, 'claim_version', e.claim_version), p_correlation);
    v_outcome := 'retracted';
  ELSE
    v_outcome := 'left';
    v_reason := 'already ' || e.state || ' as the origin recorded';
  END IF;
  UPDATE retention.import_items SET revocation = jsonb_build_object('outcome', v_outcome, 'edge_id', v_edge, 'state_before', e.state, 'state', CASE WHEN v_outcome = 'retracted' THEN 'retracted' ELSE e.state END, 'notice_id', p_revocation ->> 'notice_id', 'reason', v_reason)
                                                 || CASE WHEN jsonb_array_length(v_held_by) > 0 THEN jsonb_build_object('held_by', v_held_by) ELSE '{}'::jsonb END, revoked_at = v_at
   WHERE item_id = p_item_id;
  RETURN jsonb_build_object('outcome', v_outcome, 'edge_id', v_edge, 'state_before', e.state, 'subject_entity_id', e.subject_entity_id, 'object_entity_id', e.object_entity_id, 'predicate', e.predicate, 'claim_object_id', e.claim_object_id, 'valid_from', e.valid_from, 'valid_to', e.valid_to, 'asserted_at', e.asserted_at, 'retracted_at', CASE WHEN v_outcome = 'retracted' THEN v_at ELSE e.retracted_at END, 'reason', v_reason, 'held_by', v_held_by);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.retract_imported_edge(uuid,uuid,uuid,uuid,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.retract_imported_edge(uuid,uuid,uuid,uuid,jsonb,uuid,uuid) TO eye_commit;

-- AN IMPORTED ENTITY RETIRED (the entity this import CREATED — one reused by an authoritative identifier, N4, is left by the service): lifecycle
-- active → retired with entity.retired (the vocabulary the rebuild derives from, 0065:1305); an entity already superseded or retired as the origin
-- recorded is left; an entity another LIVE import reused by this item (Codex C9) is left with held_by. Its identifiers STAY: facts of a retired
-- entity (the memory-mappings subscriber proposes what to do with them, D10 of the design).
CREATE OR REPLACE FUNCTION retention.retire_imported_entity(p_item_id uuid, p_import_id uuid, p_tenant uuid, p_domain uuid, p_revocation jsonb, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, graph, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i retention.imports%ROWTYPE; t retention.import_items%ROWTYPE; e graph.entities_current%ROWTYPE; v_entity uuid; v_at timestamptz := clock_timestamp(); v_reason text; v_outcome text; v_held_by jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.import.revoke']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'retention import rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_revocation IS NULL OR jsonb_typeof(p_revocation) <> 'object' THEN RAISE EXCEPTION 'retention import rejected: the revocation an item is destroyed under is a JSON object' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('retention.import.revoke:' || p_import_id::text));
  i := retention.import_revoking(p_import_id, p_tenant, p_domain);
  t := retention.import_item_revocable(p_item_id, p_import_id, 'entity');
  IF t.disposition <> 'admitted' THEN RAISE EXCEPTION 'retention import rejected: item % of import % is reused, not this import''s; it is left', p_item_id, p_import_id USING ERRCODE = '22023'; END IF;
  v_entity := NULLIF(t.admitted ->> 'entity_id', '')::uuid;
  SELECT * INTO e FROM graph.entities_current q WHERE q.entity_id = v_entity AND q.tenant_id = p_tenant AND q.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention import rejected: entity % of item % is not an entity of this domain', v_entity, p_item_id USING ERRCODE = '23503'; END IF;
  -- C9: a copy another LIVE import holds (a later package reused this item) is left; it falls with that import's revocation.
  SELECT coalesce(jsonb_agg(DISTINCT i2.import_id), '[]'::jsonb) INTO v_held_by FROM retention.import_items t2 JOIN retention.imports i2 ON i2.import_id = t2.import_id
   WHERE t2.disposition = 'reused' AND (t2.planned -> 'reuse' ->> 'item_id') = p_item_id::text AND i2.state = 'admitted';
  v_reason := format('the origin revoked the package this entity was imported from (import %s; action %s; notice %s): %s', p_import_id, p_revocation ->> 'action_id', coalesce(p_revocation ->> 'notice_id', 'none recorded'), coalesce(p_revocation ->> 'reason', 'no reason stated'));
  IF jsonb_array_length(v_held_by) > 0 THEN
    v_outcome := 'left';
    v_reason := 'held under import ' || (SELECT string_agg(h, ', ') FROM jsonb_array_elements_text(v_held_by) h) || ' (admitted, not revoked)';
  ELSIF e.lifecycle_state = 'active' THEN
    UPDATE graph.entities_current SET lifecycle_state = 'retired', updated_at = v_at WHERE entity_id = v_entity;
    INSERT INTO graph.entity_events (event_id, scope, tenant_id, domain_id, entity_id, event, occurred_at, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, v_entity, 'entity.retired', v_at, p_actor,
            jsonb_build_object('imported', true, 'import_id', p_import_id, 'item_id', p_item_id, 'revoked', p_revocation, 'reason', v_reason, 'identifiers_kept', true), p_correlation);
    v_outcome := 'retired';
  ELSE
    v_outcome := 'left';
    v_reason := 'already ' || e.lifecycle_state || ' as the origin recorded';
  END IF;
  UPDATE retention.import_items SET revocation = jsonb_build_object('outcome', v_outcome, 'entity_id', v_entity, 'lifecycle_before', e.lifecycle_state, 'notice_id', p_revocation ->> 'notice_id', 'reason', v_reason)
                                                 || CASE WHEN jsonb_array_length(v_held_by) > 0 THEN jsonb_build_object('held_by', v_held_by) ELSE '{}'::jsonb END, revoked_at = v_at
   WHERE item_id = p_item_id;
  RETURN jsonb_build_object('outcome', v_outcome, 'entity_id', v_entity, 'canonical_name', e.canonical_name, 'lifecycle_before', e.lifecycle_state, 'lifecycle_state', CASE WHEN v_outcome = 'retired' THEN 'retired' ELSE e.lifecycle_state END, 'reason', v_reason, 'held_by', v_held_by);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.retire_imported_entity(uuid,uuid,uuid,uuid,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.retire_imported_entity(uuid,uuid,uuid,uuid,jsonb,uuid,uuid) TO eye_commit;

-- THE OUTCOME OF EVERY OTHER ITEM: withdrawn (a claim version — after objects.admit_version wrote the withdrawn version and the lineage was carried),
-- tombstoned (a record — after its withdrawn version, its tombstone and its custody row), left (a reused row; an identifier or identifier system, which
-- are facts of the domain and stay; a record or claim another live import holds — Codex C9, held_by in the details), refused (a legal hold — retried
-- when lifted). The details are the caller's record (the versions, the tombstone, the hold, the manifest, the locator); the outcome is this port's word.
CREATE OR REPLACE FUNCTION retention.mark_import_item_revoked(p_item_id uuid, p_import_id uuid, p_tenant uuid, p_domain uuid, p_outcome text, p_details jsonb, p_actor uuid, p_correlation uuid)
RETURNS void
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i retention.imports%ROWTYPE; t retention.import_items%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.import.revoke']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'retention import rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_outcome IS NULL OR p_outcome NOT IN ('withdrawn', 'tombstoned', 'left', 'refused') THEN RAISE EXCEPTION 'retention import rejected: a revocation outcome is withdrawn, tombstoned, left or refused' USING ERRCODE = '22023'; END IF;
  IF p_details IS NOT NULL AND jsonb_typeof(p_details) <> 'object' THEN RAISE EXCEPTION 'retention import rejected: the details of a revocation outcome are a JSON object' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('retention.import.revoke:' || p_import_id::text));
  i := retention.import_revoking(p_import_id, p_tenant, p_domain);
  t := retention.import_item_revocable(p_item_id, p_import_id, NULL);
  UPDATE retention.import_items SET revocation = coalesce(p_details, '{}'::jsonb) || jsonb_build_object('outcome', p_outcome), revoked_at = clock_timestamp() WHERE item_id = p_item_id;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.mark_import_item_revoked(uuid,uuid,uuid,uuid,text,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.mark_import_item_revoked(uuid,uuid,uuid,uuid,text,jsonb,uuid,uuid) TO eye_commit;

-- THE LINEAGE CARRIED ONTO A WITHDRAWN CLAIM VERSION (D12 of the design): every lineage row of the version withdrawn is copied to the withdrawn
-- version — the origin's run, method, call and mode kept, the evidence pair kept — under this operation's admission decision, so the pair rule
-- holds for the withdrawn version as for every other (a re-export's closure, the reassessment's provenance path). Returns the rows copied.
CREATE OR REPLACE FUNCTION retention.record_import_withdrawal_lineage(p_claim uuid, p_from_version bigint, p_to_version bigint, p_tenant uuid, p_domain uuid, p_import_id uuid, p_correlation uuid)
RETURNS int
SECURITY DEFINER SET search_path = retention, observation, objects, intelligence, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i retention.imports%ROWTYPE; v_n int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.import.revoke']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF public.eye_policy_decision() IS NULL THEN RAISE EXCEPTION 'retention import rejected: no policy decision is established for this operation' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('retention.import.revoke:' || p_import_id::text));
  i := retention.import_revoking(p_import_id, p_tenant, p_domain);
  IF p_claim IS NULL OR p_from_version IS NULL OR p_to_version IS NULL OR p_to_version <= p_from_version THEN RAISE EXCEPTION 'retention import rejected: the lineage is carried from the withdrawn version onto the version that withdraws it' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = p_claim AND o.object_version = p_to_version AND o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.lifecycle_state = 'withdrawn') THEN
    RAISE EXCEPTION 'retention import rejected (dependency): claim %@% is not a withdrawn version of this domain', p_claim, p_to_version USING ERRCODE = '23503';
  END IF;
  INSERT INTO intelligence.claim_lineage (claim_object_id, claim_version, scope, tenant_id, domain_id, claim_type, run_id, method_id, call_id, mode, evidence_object_id, evidence_digest, byte_start, byte_end, confidence, retrieval_decision_id, retrieval_audit_seq, admission_decision_id, correlation_id)
  SELECT l.claim_object_id, p_to_version, l.scope, l.tenant_id, l.domain_id, l.claim_type, l.run_id, l.method_id, l.call_id, l.mode, l.evidence_object_id, l.evidence_digest, l.byte_start, l.byte_end, l.confidence, l.retrieval_decision_id, l.retrieval_audit_seq, public.eye_policy_decision(), p_correlation
    FROM intelligence.claim_lineage l WHERE l.claim_object_id = p_claim AND l.claim_version = p_from_version AND l.tenant_id = p_tenant AND l.domain_id = p_domain;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RAISE EXCEPTION 'retention import rejected (dependency): claim %@% has no lineage row to carry onto its withdrawn version', p_claim, p_from_version USING ERRCODE = '23503'; END IF;
  RETURN v_n;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.record_import_withdrawal_lineage(uuid,bigint,bigint,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.record_import_withdrawal_lineage(uuid,bigint,bigint,uuid,uuid,uuid,uuid) TO eye_commit;

-- THE CUSTODY ROW of a tombstoned imported record (custody.tombstoned, the vocabulary 0074:186-188): written here directly, as record_imported_manifest
-- writes custody.imported (0076:765-767) — observation.append_custody's authority list is the observation's own (0022:1346-1348).
CREATE OR REPLACE FUNCTION retention.record_import_revocation_custody(p_manifest_id uuid, p_tenant uuid, p_domain uuid, p_import_id uuid, p_item_id uuid, p_evd_object_id uuid, p_details jsonb, p_actor uuid, p_correlation uuid)
RETURNS void
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i retention.imports%ROWTYPE; m observation.blob_manifests%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.import.revoke']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'retention import rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_details IS NOT NULL AND jsonb_typeof(p_details) <> 'object' THEN RAISE EXCEPTION 'retention import rejected: the details of a custody row are a JSON object' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('retention.import.revoke:' || p_import_id::text));
  i := retention.import_revoking(p_import_id, p_tenant, p_domain);
  SELECT * INTO m FROM observation.blob_manifests q WHERE q.manifest_id = p_manifest_id AND q.tenant_id = p_tenant AND q.domain_id = p_domain FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention import rejected: no such manifest % in this domain', p_manifest_id USING ERRCODE = '23503'; END IF;
  INSERT INTO observation.custody_events (event_id, scope, tenant_id, domain_id, manifest_id, obs_object_id, evd_object_id, source_id, contract_version, run_id, event, actor, content_digest, digest_verified, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_manifest_id, NULL, p_evd_object_id, m.source_id, m.contract_version, NULL, 'custody.tombstoned', 'principal:' || p_actor::text, m.content_digest, NULL,
          coalesce(p_details, '{}'::jsonb) || jsonb_build_object('import_id', p_import_id, 'item_id', p_item_id, 'locator', m.locator), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.record_import_revocation_custody(uuid,uuid,uuid,uuid,uuid,uuid,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.record_import_revocation_custody(uuid,uuid,uuid,uuid,uuid,uuid,jsonb,uuid,uuid) TO eye_commit;

-- THE FINISH of an attempt: every admitted or reused item settled by this or an earlier attempt (a pending one is refused with the count); no item
-- refused → state revoked — every copy held from THIS delivery destroyed or accounted for by another live import (counts.held_by_other, Codex C9:
-- a held copy is another delivery's; it falls with that import's revocation) — with the actor, the instant and the revocation (the source, the
-- counts, the attempts); a refused item (a legal hold) → the state stays revoking and import.revocation_held names them (the steward retries when
-- the hold is lifted). Returns the row after, complete or not.
CREATE OR REPLACE FUNCTION retention.finish_import_revocation(p_import_id uuid, p_tenant uuid, p_domain uuid, p_revocation jsonb, p_counts jsonb, p_refused jsonb, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i retention.imports%ROWTYPE; v_pending int; v_refused int; v_held int; v_counts jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.import.revoke']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'retention import rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_revocation IS NULL OR jsonb_typeof(p_revocation) <> 'object' THEN RAISE EXCEPTION 'retention import rejected: the revocation recorded on an import is a JSON object' USING ERRCODE = '22023'; END IF;
  IF (p_counts IS NOT NULL AND jsonb_typeof(p_counts) <> 'object') OR (p_refused IS NOT NULL AND jsonb_typeof(p_refused) <> 'array') THEN RAISE EXCEPTION 'retention import rejected: the counts are a JSON object and the refused items a JSON array' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('retention.import.revoke:' || p_import_id::text));
  SELECT * INTO i FROM retention.imports x WHERE x.import_id = p_import_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention import rejected: no such import % in this domain', p_import_id USING ERRCODE = '23503'; END IF;
  IF i.state <> 'revoking' THEN RAISE EXCEPTION 'retention import rejected: import % is %, not revoking — only a revocation in progress is finished', p_import_id, i.state USING ERRCODE = '22023'; END IF;
  SELECT count(*)::int INTO v_pending FROM retention.import_items t WHERE t.import_id = p_import_id AND t.disposition IN ('admitted', 'reused') AND t.revoked_at IS NULL;
  IF v_pending > 0 THEN RAISE EXCEPTION 'retention import rejected: % item(s) of import % are still pending revocation', v_pending, p_import_id USING ERRCODE = '22023'; END IF;
  SELECT count(*)::int INTO v_refused FROM retention.import_items t WHERE t.import_id = p_import_id AND t.disposition IN ('admitted', 'reused') AND (t.revocation ->> 'outcome') = 'refused';
  -- C9: the copies left because another live import holds them, counted apart from the rest of the left.
  SELECT count(*)::int INTO v_held FROM retention.import_items t WHERE t.import_id = p_import_id AND t.disposition IN ('admitted', 'reused') AND (t.revocation ->> 'outcome') = 'left'
                                                                 AND jsonb_typeof(t.revocation -> 'held_by') = 'array' AND jsonb_array_length(t.revocation -> 'held_by') > 0;
  SELECT coalesce(jsonb_object_agg(q.outcome, q.n), '{}'::jsonb) INTO v_counts FROM (SELECT t.revocation ->> 'outcome' AS outcome, count(*)::int AS n FROM retention.import_items t WHERE t.import_id = p_import_id AND t.revoked_at IS NOT NULL GROUP BY 1) q;
  v_counts := v_counts || jsonb_build_object('held_by_other', v_held) || coalesce(p_counts, '{}'::jsonb);
  IF v_refused = 0 THEN
    UPDATE retention.imports SET state = 'revoked', revoked_by = p_actor, revoked_at = clock_timestamp(), revocation = p_revocation || jsonb_build_object('counts', v_counts, 'attempts', i.revocation_attempts, 'completed_at', clock_timestamp()) WHERE import_id = p_import_id RETURNING * INTO i;
    PERFORM retention.import_event(p_import_id, p_tenant, p_domain, 'import.revoked', p_actor, jsonb_build_object('counts', v_counts, 'attempts', i.revocation_attempts, 'revocation', p_revocation,
                                                                                                                   'statement', CASE WHEN v_held > 0 THEN 'every copy held from this delivery is destroyed or accounted for by another live import of this domain; the held copies fall with that import''s revocation'
                                                                                                                                     ELSE 'every copy held from this delivery is destroyed' END), p_correlation);
  ELSE
    PERFORM retention.import_event(p_import_id, p_tenant, p_domain, 'import.revocation_held', p_actor, jsonb_build_object('counts', v_counts, 'attempts', i.revocation_attempts, 'refused', coalesce(p_refused, '[]'::jsonb), 'revocation', p_revocation,
                                                                                                                       'statement', 'a legal hold takes precedence over the origin''s revocation; the held copies stay until the hold is lifted and the revocation is retried'), p_correlation);
  END IF;
  RETURN jsonb_build_object('import', to_jsonb(i), 'complete', v_refused = 0, 'counts', v_counts, 'refused', coalesce(p_refused, '[]'::jsonb));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.finish_import_revocation(uuid,uuid,uuid,jsonb,jsonb,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.finish_import_revocation(uuid,uuid,uuid,jsonb,jsonb,jsonb,uuid,uuid) TO eye_commit;

-- THE IMPORTER'S ANSWER on the ORIGIN'S ledger (internal; called by record_import_revocation_receipt — the importing domain's write): the latest
-- notified importer notice of this import moves once to acknowledged | mismatched with the receipt (the acknowledge trigger's one move); a notice
-- already answered, or none recorded (the steward acted on the origin's record alone), is answered by a NEW attempt row recorded acknowledged |
-- mismatched at once (D2) — the copied notice stripped of its signature and marked unsigned: a ledger record written by the importing domain's
-- answer, never sent, never signed (Codex N1); the origin's event in either case. A foreign origin (not a domain of this tenant) or an origin
-- package unknown here is not answered: {answered: false, reason} — the station receipt is the answer there.
CREATE OR REPLACE FUNCTION retention.answer_import_notice(p_import_id uuid, p_tenant uuid, p_domain uuid, p_receipt jsonb, p_receipt_digest text, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SET search_path = retention, observation, canon, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i retention.imports%ROWTYPE; x retention.export_packages%ROWTYPE; n retention.export_revocation_notices%ROWTYPE; v_state text; v_at timestamptz; v_attempt int; v_notice jsonb; v_importer jsonb; v_recipient text; v_details jsonb; v_id uuid;
BEGIN
  SELECT * INTO i FROM retention.imports q WHERE q.import_id = p_import_id AND q.tenant_id = p_tenant AND q.domain_id = p_domain;
  IF NOT FOUND THEN RETURN jsonb_build_object('answered', false, 'reason', 'no such import'); END IF;
  IF NULLIF(i.origin ->> 'tenant_id', '')::uuid IS DISTINCT FROM p_tenant THEN RETURN jsonb_build_object('answered', false, 'reason', 'the origin is not a domain of this tenant on this installation; the station receipt is the answer'); END IF;
  SELECT * INTO x FROM retention.export_packages e WHERE e.action_id = NULLIF(i.origin ->> 'action_id', '')::uuid AND e.tenant_id = p_tenant AND e.domain_id = NULLIF(i.origin ->> 'domain_id', '')::uuid AND e.package_digest = i.package_digest;
  IF NOT FOUND THEN RETURN jsonb_build_object('answered', false, 'reason', 'no origin package record under the import''s digest'); END IF;
  PERFORM pg_advisory_xact_lock(retention.lock_key_export_deliveries(x.action_id));
  v_state := CASE WHEN (p_receipt ->> 'package_digest') = x.package_digest AND (p_receipt -> 'copies_destroyed') = 'true'::jsonb THEN 'acknowledged' ELSE 'mismatched' END;
  v_at := clock_timestamp();
  v_importer := jsonb_build_object('tenant_id', i.tenant_id, 'domain_id', i.domain_id, 'import_id', i.import_id);
  v_recipient := 'import:' || i.tenant_id::text || '/' || i.domain_id::text || '/' || i.import_id::text;
  SELECT * INTO n FROM retention.export_revocation_notices q WHERE q.action_id = x.action_id AND (q.importer ->> 'import_id') = p_import_id::text ORDER BY q.attempt DESC LIMIT 1 FOR UPDATE;
  IF FOUND AND n.state = 'notified' THEN
    UPDATE retention.export_revocation_notices SET state = v_state, receipt = p_receipt, receipt_digest = p_receipt_digest, acknowledged_at = v_at WHERE notice_id = n.notice_id RETURNING * INTO n;
  ELSE
    v_attempt := CASE WHEN FOUND THEN n.attempt + 1 ELSE 1 END;
    -- N1: the copied notice without its signature; the row says what it is — a ledger record, not a notice sent.
    v_notice := (coalesce(n.notice, jsonb_build_object('notice', 'revocation', 'action_id', x.action_id, 'tenant_id', x.tenant_id, 'domain_id', x.domain_id, 'recipient', v_recipient, 'delivery', jsonb_build_object('import_id', i.import_id, 'state', 'admitted', 'held', 'confirmed'),
                                                        'package_digest', x.package_digest, 'archive_digest', x.archive_digest, 'signing_key_id', x.signing_key_id, 'revoked_at', x.revoked_at, 'reason', x.revoke_reason,
                                                        'statement', 'no notice was recorded for this importer; the importing domain answered on the origin''s record alone')) - ARRAY['signature', 'unsigned'])
                || jsonb_build_object('answered_by_importer', true, 'attempt', v_attempt, 'notice_id', gen_random_uuid(), 'unsigned', 'a ledger record written by the importing domain''s answer; not sent, not signed');
    v_id := (v_notice ->> 'notice_id')::uuid;
    INSERT INTO retention.export_revocation_notices (notice_id, scope, tenant_id, domain_id, action_id, destination_id, delivery_id, importer, attempt, state, package_digest, archive_digest, notice, notice_digest, receipt, receipt_digest, failure_class, notified_at, acknowledged_at, notified_by, correlation_id)
    VALUES (v_id, 'DOMAIN', x.tenant_id, x.domain_id, x.action_id, NULL, NULL, v_importer, v_attempt, v_state, x.package_digest, x.archive_digest, v_notice, canon.sha256_hex(canon.jcs(v_notice)), p_receipt, p_receipt_digest, NULL, v_at, v_at, p_actor, p_correlation) RETURNING * INTO n;
  END IF;
  v_details := jsonb_build_object('notice_id', n.notice_id, 'importer', v_importer, 'recipient', v_recipient, 'kind', 'importer', 'attempt', n.attempt, 'state', v_state, 'package_digest', x.package_digest, 'archive_digest', x.archive_digest,
                                  'receipt_digest', p_receipt_digest, 'receipt_id', p_receipt ->> 'receipt_id', 'copies_destroyed', p_receipt -> 'copies_destroyed', 'refused', p_receipt -> 'refused', 'held_by', p_receipt -> 'held_by', 'answered_by', 'the importing domain (retention.import.revoke)');
  IF v_state = 'mismatched' THEN v_details := v_details || jsonb_build_object('expected', jsonb_build_object('package_digest', x.package_digest, 'copies_destroyed', true), 'received', jsonb_build_object('package_digest', p_receipt ->> 'package_digest', 'copies_destroyed', p_receipt -> 'copies_destroyed')); END IF;
  PERFORM retention.event(x.action_id, x.tenant_id, x.domain_id, CASE WHEN v_state = 'acknowledged' THEN 'export.revocation_acknowledged' ELSE 'export.revocation_mismatched' END, p_actor, v_details, p_correlation);
  RETURN jsonb_build_object('answered', true, 'notice_id', n.notice_id, 'attempt', n.attempt, 'state', v_state, 'action_id', x.action_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.answer_import_notice(uuid,uuid,uuid,jsonb,text,uuid,uuid) FROM PUBLIC;

-- THE RECEIPT of a revocation attempt, recorded by the importing domain after the bytes went (or did not): import.copies_destroyed (every copy gone:
-- the receipt says copies_destroyed true) or import.copies_refused (a hold, bytes a removal left, or copies another live import holds — the refused
-- manifests, the locators and the holders named); the origin's notice answered when the origin is here (answer_import_notice). A retry's receipt
-- (the import already revoked) answers an outstanding notice the same way (Codex C5). Returns the event and the answer.
CREATE OR REPLACE FUNCTION retention.record_import_revocation_receipt(p_import_id uuid, p_tenant uuid, p_domain uuid, p_receipt jsonb, p_receipt_digest text, p_bytes jsonb, p_station jsonb, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, canon, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i retention.imports%ROWTYPE; v_event text; v_answer jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.import.revoke']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'retention import rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_receipt IS NULL OR jsonb_typeof(p_receipt) <> 'object' OR p_receipt_digest IS NULL OR p_receipt_digest !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'retention import rejected: the receipt is a JSON object recorded with the sha-256 hex of its canonical JSON' USING ERRCODE = '22023'; END IF;
  IF (p_bytes IS NOT NULL AND jsonb_typeof(p_bytes) <> 'object') OR (p_station IS NOT NULL AND jsonb_typeof(p_station) <> 'object') THEN RAISE EXCEPTION 'retention import rejected: the bytes and the station receipt of a revocation are JSON objects' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('retention.import.revoke:' || p_import_id::text));
  SELECT * INTO i FROM retention.imports x WHERE x.import_id = p_import_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention import rejected: no such import % in this domain', p_import_id USING ERRCODE = '23503'; END IF;
  IF i.state NOT IN ('revoking', 'revoked') THEN RAISE EXCEPTION 'retention import rejected: import % is %, not revoking or revoked — a receipt answers a revocation', p_import_id, i.state USING ERRCODE = '22023'; END IF;
  v_event := CASE WHEN (p_receipt -> 'copies_destroyed') = 'true'::jsonb THEN 'import.copies_destroyed' ELSE 'import.copies_refused' END;
  PERFORM retention.import_event(p_import_id, p_tenant, p_domain, v_event, p_actor, jsonb_build_object('receipt', p_receipt, 'receipt_digest', p_receipt_digest, 'bytes', coalesce(p_bytes, '{}'::jsonb), 'station', p_station, 'attempt', i.revocation_attempts), p_correlation);
  v_answer := retention.answer_import_notice(p_import_id, p_tenant, p_domain, p_receipt, p_receipt_digest, p_actor, p_correlation);
  RETURN jsonb_build_object('event', v_event, 'answered', v_answer);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.record_import_revocation_receipt(uuid,uuid,uuid,jsonb,text,jsonb,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.record_import_revocation_receipt(uuid,uuid,uuid,jsonb,text,jsonb,jsonb,uuid,uuid) TO eye_commit;

-- ============================================================
-- §8 the authorities that admit the revocation, and the review gate (D5, D7)
-- ============================================================
-- The canonical-write action of the revocation (0023 §9's precedent, 0076 §5's row beside it): objects.admit_version admits, under
-- retention.import.revoke, the withdrawn versions of the record and claim types a package carries and nothing else.
INSERT INTO observation.canonical_write_actions (action, object_types, rationale) VALUES
  ('retention.import.revoke', ARRAY['EVD','ENT','EVT','CLM','REL','ASM'], 'The origin''s revocation of an admitted import withdraws the imported records and claim versions by a new version of each (lifecycle and truth state withdrawn); it admits no other type and touches no observation state')
ON CONFLICT (action) DO NOTHING;

-- The tombstone port re-declared (0066 §4's body verbatim) admits the revocation: an imported record's bytes go under
-- retention.import.revoke — the legal-hold refusal (P0R01), the insert and the return unchanged. The grants stand (0022).
CREATE OR REPLACE FUNCTION observation.tombstone_blob(
  p_tombstone_id uuid, p_tenant uuid, p_domain uuid, p_manifest_id uuid,
  p_reason text, p_correlation uuid
) RETURNS boolean
SECURITY DEFINER SET search_path = observation, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_inserted boolean;
BEGIN
  PERFORM observation.assert_authority(ARRAY[
    'observation.item.admit', 'observation.sweeper.reconcile', 'observation.quarantine.review', 'retention.action.execute', 'retention.import.revoke']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF NOT EXISTS (SELECT 1 FROM observation.blob_manifests
                  WHERE manifest_id = p_manifest_id AND tenant_id = p_tenant AND domain_id = p_domain) THEN
    RAISE EXCEPTION 'tombstone rejected: no such manifest in this domain' USING ERRCODE = '23503';
  END IF;
  -- 0066 §4 (AU-MEM-0060): a LEGAL HOLD takes precedence over any deletion — the manifest's flag, or an unlifted hold row.
  IF EXISTS (SELECT 1 FROM observation.blob_manifests m WHERE m.manifest_id = p_manifest_id AND m.legal_hold)
     OR EXISTS (SELECT 1 FROM observation.legal_holds h WHERE h.lifted_at IS NULL
                 AND (h.manifest_id = p_manifest_id
                      OR h.evd_object_id IN (SELECT o.object_id FROM objects.canonical_objects o WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.object_type = 'EVD' AND (o.payload ->> 'manifest_id')::uuid = p_manifest_id))) THEN
    RAISE EXCEPTION 'tombstone refused: manifest % is under a legal hold (hold %); the hold takes precedence over deletion', p_manifest_id,
      (SELECT h.hold_id FROM observation.legal_holds h WHERE h.lifted_at IS NULL AND (h.manifest_id = p_manifest_id OR h.evd_object_id IN (SELECT o.object_id FROM objects.canonical_objects o WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.object_type = 'EVD' AND (o.payload ->> 'manifest_id')::uuid = p_manifest_id)) ORDER BY h.placed_at LIMIT 1) USING ERRCODE = 'P0R01';
  END IF;
  INSERT INTO observation.blob_tombstones (
    tombstone_id, scope, tenant_id, domain_id, manifest_id, reason, actor_principal_id, correlation_id
  ) VALUES (p_tombstone_id, 'DOMAIN', p_tenant, p_domain, p_manifest_id, p_reason,
            public.eye_principal(), p_correlation)
  ON CONFLICT (manifest_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END $$ LANGUAGE plpgsql;

-- A CHALLENGE re-declared (0066 §5's body) with ONE gate after the claim-existence check (D7): a claim whose LATEST version carries
-- imported_from is not reviewed here — an imported claim version is corrected at its origin and re-imported (the import service's
-- statement made a gate). Everything else as 0066 left it; the grant re-stated.
CREATE OR REPLACE FUNCTION intelligence.request_review(p_case_id uuid, p_tenant uuid, p_domain uuid, p_claim_object_id uuid, p_claim_version bigint, p_reason text, p_actor uuid, p_correlation uuid)
RETURNS void
SECURITY DEFINER SET search_path = intelligence, observation, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_run uuid; v_method uuid; v_conf numeric;
BEGIN
  PERFORM observation.assert_authority(ARRAY['intelligence.review.request']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'a challenge states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = p_claim_object_id AND o.object_version = p_claim_version AND o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.object_type IN ('ENT', 'EVT', 'CLM', 'REL', 'ASM')) THEN
    RAISE EXCEPTION 'challenge rejected: no claim %@% in this domain', p_claim_object_id, p_claim_version USING ERRCODE = '23503';
  END IF;
  -- B17 (0077, D7): an imported claim (its latest version carries imported_from) is corrected at its origin and re-imported; it is not reviewed here.
  IF EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = p_claim_object_id AND o.tenant_id = p_tenant AND o.domain_id = p_domain
              AND o.object_version = (SELECT max(o2.object_version) FROM objects.canonical_objects o2 WHERE o2.object_id = p_claim_object_id AND o2.tenant_id = p_tenant AND o2.domain_id = p_domain)
              AND jsonb_typeof(o.payload -> 'imported_from') = 'object') THEN
    RAISE EXCEPTION 'challenge rejected: claim % is imported (import %); an imported claim version is corrected at its origin and re-imported; it is not reviewed here', p_claim_object_id,
      (SELECT o.payload -> 'imported_from' ->> 'import_id' FROM objects.canonical_objects o WHERE o.object_id = p_claim_object_id AND o.tenant_id = p_tenant AND o.domain_id = p_domain ORDER BY o.object_version DESC LIMIT 1) USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM intelligence.review_current r WHERE r.claim_object_id = p_claim_object_id AND r.claim_version = p_claim_version AND r.state = 'queued') THEN
    RAISE EXCEPTION 'challenge rejected: claim %@% is already queued for review', p_claim_object_id, p_claim_version USING ERRCODE = '23505';
  END IF;
  SELECT l.run_id, l.method_id, l.confidence INTO v_run, v_method, v_conf FROM intelligence.claim_lineage l WHERE l.claim_object_id = p_claim_object_id AND l.claim_version = p_claim_version LIMIT 1;
  IF v_run IS NULL THEN RAISE EXCEPTION 'challenge rejected: claim %@% has no lineage (no run to review it under)', p_claim_object_id, p_claim_version USING ERRCODE = '23503'; END IF;
  INSERT INTO intelligence.review_current (case_id, scope, tenant_id, domain_id, claim_object_id, claim_version, run_id, method_id, queued_reason, confidence, state, correlation_id)
  VALUES (p_case_id, 'DOMAIN', p_tenant, p_domain, p_claim_object_id, p_claim_version, v_run, v_method, 'challenged', v_conf, 'queued', p_correlation);
  INSERT INTO intelligence.review_events (event_id, scope, tenant_id, domain_id, case_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_case_id, 'case.queued', p_actor, jsonb_build_object('reason', 'challenged', 'challenge', p_reason, 'claim_object_id', p_claim_object_id, 'claim_version', p_claim_version), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION intelligence.request_review(uuid,uuid,uuid,uuid,bigint,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION intelligence.request_review(uuid,uuid,uuid,uuid,bigint,text,uuid,uuid) TO eye_commit;

-- begin_import_admission re-declared (0076 §4's body): the contract block carries the intake contract's authority_class — the
-- ObservationRecorded of an imported record states it (D1; Codex C10). Nothing else changes.
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
                                   'lifecycle_state', s.lifecycle_state, 'connector_kind', s.connector_kind, 'authority_class', s.authority_class),
    'staged', v_staged);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION retention.begin_import_admission(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.begin_import_admission(uuid,uuid,uuid,uuid,uuid) TO eye_commit;

-- ============================================================
-- §9 the interface register (D8)
-- ============================================================
-- L1-I03 stays partial (no registered consumer — 0065); the GraphChanged kinds need no SQL: graph.subscriptions_matching and
-- subscription_delivery_receive filter on the subscription's own change_kinds list, never a vocabulary (0063, 0064).
UPDATE objects.interface_register SET bound_to = bound_to || '; B17 (0077): ObservationRecorded per record the governed import admits (acquisition_mode import, run_id null, the intake contract''s source and authority class, imported {import_id, partner_key, origin}) — published, not consumed'
  WHERE interface_id = 'L1-I03';
UPDATE objects.interface_register SET bound_to = bound_to || '; B17 (0077): imported knowledge published to the importing domain''s subscribers (GraphChanged import.admitted from the graph write; ObservationRecorded per record batch); the origin''s revocation propagated into the importing domains of the tenant (retention.imports_of_package, the importer notice on retention.export_revocation_notices, retention.import.revoke: edges retracted, entities retired, versions withdrawn, bytes tombstoned, GraphChanged import.revoked with the walk; the signed notice eye-revocation-notice/1; a legal hold holds the revocation)'
  WHERE interface_id = 'L3-I04';
DO $$
DECLARE v_bound int; v_partial int; v_unbound int;
BEGIN
  SELECT count(*) FILTER (WHERE binding_state = 'bound'), count(*) FILTER (WHERE binding_state = 'partial'), count(*) FILTER (WHERE binding_state = 'unbound') INTO v_bound, v_partial, v_unbound FROM objects.interface_register;
  IF (v_bound, v_partial, v_unbound) <> (26, 24, 0) THEN
    RAISE EXCEPTION 'interface register after 0077: expected 26 bound, 24 partial, 0 unbound; found %, %, %', v_bound, v_partial, v_unbound;
  END IF;
END $$;
