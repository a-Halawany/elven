-- 0071 — CP-6 B11 CLOSURE: Codex's bounded review of the B11 candidate 1e3e4be (2026-09-14), finding B11-F1 — overlapping
-- archive actions could lose committed evidence bytes.
--
--   §1 the manifests an execution MOVES or REMOVES are locked for the whole transaction — retention.lock_key_manifest,
--      retention.lock_key_domain, retention.holds_advisory, retention.holds_manifest_lock; retention.begin_execution
--      re-declared: after the approval checks and BEFORE the kind-specific re-checks read any state, the execution takes the
--      domain's MOVERS lock (shared) and then each executable manifest's transaction-scoped advisory lock in a canonical order —
--      exclusive for an archive or a deletion, shared for a customer export, whose bytes are read while the package builds; an
--      execution naming more than 256 manifests takes the domain's movers lock EXCLUSIVELY instead (one lock, not thousands:
--      the cluster's lock table is finite — max_locks_per_transaction × the connections);
--   §2 observation.archive_blob re-declared: a move is recorded only for a manifest THIS transaction holds — fail closed for
--      any caller that ever bypasses begin_execution's lock.
--
-- THE FINDING (B11-F1). Two approved archive actions overlapped on a manifest P; action A also named a manifest Q whose bytes
-- could not be copied. A copied P into the archive tier (`copyBlob` created the file) and was interrupted before recording the
-- move; B found that identical copy in place (created: false), recorded its move, committed and removed the hot copy — P now
-- served from the archive under B's committed record. A resumed, failed on Q, rolled back and ran its cleanup, which removed
-- every archive copy A had created: P, adopted by B. P's bytes were gone from both tiers under a committed record; retrieval
-- failed with `missing`. Nothing serialised the two executions on the shared manifest: begin_execution locked each ACTION row,
-- archive_blob read the tier and inserted, and the cleanup ran after the rollback, outside any lock.
--
-- THE CLOSURE. (a) The lock: begin_execution takes, for the transaction, the advisory lock of every manifest the action will
-- move or remove — before any re-check reads their state and before any byte is copied. A second execution naming the same
-- manifest WAITS at its start, with nothing copied and nothing recorded, until the first commits or rolls back. (b) Ownership
-- through the cleanup boundary: a copy is STAGED under its creating execution ATTEMPT's own name (`<locator>.staging-<attempt_id>`
-- in the archive root; every execution of an action is its own attempt) and published under the locator by the controller only
-- AFTER the commit that recorded the move — so a copy whose record did not commit is adoptable by no other execution, and a
-- rollback removes only the file bearing its own attempt's name (a second attempt of the same action, admitted after the first's
-- backend was lost, owns its own; the first's late cleanup cannot touch it).
-- No lock has to survive to the removal for the removal to be safe: a transaction's locks end with its backend and at a
-- top-level abort (PostgreSQL releases them at the abort itself, not at the client's ROLLBACK), and the executor's cleanup
-- depends on neither. The execution still runs in a subtransaction (a savepoint after the locks), so a statement cancelled or
-- timed out mid-record aborts only that: the cleanup runs on a transaction still open, its locks still held (a courtesy to
-- the record, not a requirement of the removal), and the pipeline's rollback and the controller's pause follow as for any
-- failure. (c) The port fails closed: archive_blob refuses to record a move for a manifest the transaction does not hold. (d) The published copy is the served one; a copy
-- recorded but not yet published — the instant after the commit, or a publish that failed and awaits its retry — is found by
-- every reader of the archive tier under the manifest's digest (VaultService.readArchived), the hot copy staying in place
-- until the publish succeeds (a pending residual, retried by the execute route, which publishes any staged copy under the
-- manifest's digest before it removes; a successful publish retires the other staged copies of the locator). A deletion
-- retires staged copies with the bytes. An execution that finds the manifest archived under its lock (the recording action
-- committed before it began) reads the committed copy — published, or still staged, in which case it publishes it there and
-- then by a rename — stages nothing and removes nothing of another's; the serial control and the already-committed-copy
-- control (A9 of the B11 harness) keep their behaviour; the failure record (the pause with its class, the approvals revoked)
-- and the retry stay — the retry from the executed items themselves (a crash between the commit and the post-commit work
-- leaves no residual row to key on), publishing any staged copy under the digest, copying the kept hot copy again when none
-- publishes, leaving a manifest tombstoned since to its deletion. Proven at the governed
-- boundary by apps/api/test/int/phase6-retention-b11-closure.test.ts: Codex's interleaving reproduced on the unfixed executor
-- (evidence/cp6/b11-closure-repro-before.txt) and closed here — with a hold INSIDE the cleanup, a backend terminated after the
-- copy, and a statement cancelled mid-record, each leaving the adopting action's bytes whole.
--
-- The lock keys: namespaced 64-bit hashes (hashtextextended) of the manifest id and of the domain, held as transaction-scoped
-- advisory locks — no table privilege, no row-level-security interaction, released at COMMIT or ROLLBACK and never before. Every
-- execution takes the domain lock first, then the manifest locks in one canonical order (by ref), so no two executions can wait on
-- each other in a cycle; a deadlock PostgreSQL still detected (40P01) or a lock it could not grant (55P03) is answered by the
-- controller as an infrastructure pause of the action, retried by its normal route.
--
-- The executor's verdict survives the loss of its connection: the controller keeps the rolled-back execution's class and
-- reason even when the ROLLBACK itself fails, and records the pause on a fresh connection.

-- ============================================================
-- §1 the manifests an execution moves or removes are locked for the transaction
-- ============================================================
CREATE OR REPLACE FUNCTION retention.lock_key_manifest(p_manifest_id uuid) RETURNS bigint
IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT hashtextextended('observation.blob_manifests:' || p_manifest_id::text, 0);
$$ LANGUAGE sql;
-- The domain's MOVERS lock: shared by every execution that moves, removes or reads bytes of the domain's manifests; exclusive to one
-- that names more manifests than the per-manifest scheme should pin (the threshold below).
CREATE OR REPLACE FUNCTION retention.lock_key_domain(p_tenant uuid, p_domain uuid) RETURNS bigint
IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT hashtextextended('retention.movers:' || p_tenant::text || ':' || p_domain::text, 0);
$$ LANGUAGE sql;
-- Does THIS backend hold the advisory lock of the given 64-bit key, granted, in the given mode? pg_locks shows a 64-bit advisory key
-- as classid = its high 32 bits, objid = its low 32 bits, objsubid = 1 (the two-key form uses objsubid = 2 and is not used here).
CREATE OR REPLACE FUNCTION retention.holds_advisory(p_key bigint, p_mode text) RETURNS boolean
STABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM pg_locks l
     WHERE l.locktype = 'advisory' AND l.pid = pg_backend_pid() AND l.granted AND l.objsubid = 1
       AND l.classid = ((p_key >> 32) & 4294967295)::oid AND l.objid = (p_key & 4294967295)::oid AND l.mode = p_mode);
$$ LANGUAGE sql;
-- Does THIS transaction hold the manifest for a MOVE: the domain's movers lock exclusively (a large execution), or the movers lock
-- shared together with the manifest's own lock exclusively?
CREATE OR REPLACE FUNCTION retention.holds_manifest_lock(p_tenant uuid, p_domain uuid, p_manifest_id uuid) RETURNS boolean
STABLE SET search_path = retention, pg_catalog, pg_temp AS $$
  SELECT retention.holds_advisory(retention.lock_key_domain(p_tenant, p_domain), 'ExclusiveLock')
      OR (retention.holds_advisory(retention.lock_key_domain(p_tenant, p_domain), 'ShareLock')
          AND retention.holds_advisory(retention.lock_key_manifest(p_manifest_id), 'ExclusiveLock'));
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION retention.lock_key_manifest(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION retention.lock_key_domain(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION retention.holds_advisory(bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION retention.holds_manifest_lock(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retention.lock_key_manifest(uuid) TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION retention.lock_key_domain(uuid, uuid) TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION retention.holds_advisory(bigint, text) TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION retention.holds_manifest_lock(uuid, uuid, uuid) TO eye_app, eye_commit;

-- begin_execution (0070 §5) re-declared with the lock block; every other line as 0070 left it.
CREATE OR REPLACE FUNCTION retention.begin_execution(p_action_id uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a retention.actions_current%ROWTYPE; v_live int; v_withdrawn text; v_tombstoned text; m RECORD; v_versions bigint[]; v_dependents jsonb; v_names text := ''; v_n int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.action.execute']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO a FROM retention.actions_current x WHERE x.action_id = p_action_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention execution rejected: % is not an action of this domain', p_action_id USING ERRCODE = '23503'; END IF;
  IF a.state <> 'approved' THEN RAISE EXCEPTION 'retention execution rejected: % is % — only an approved action executes', p_action_id, a.state USING ERRCODE = '22023'; END IF;
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'retention execution rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF a.kind NOT IN ('deletion', 'log_floor', 'review', 'archive', 'customer_export') THEN RAISE EXCEPTION 'retention execution rejected: a % action has no executor in this release', a.kind USING ERRCODE = '22023'; END IF;
  SELECT count(*) INTO v_live FROM retention.approvals ap WHERE ap.action_id = p_action_id AND ap.scope_digest = a.scope_digest AND ap.revoked_at IS NULL AND ap.expires_at > clock_timestamp();
  IF v_live < 1 THEN RAISE EXCEPTION 'retention execution rejected: no live approval on the resolved scope' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM retention.approvals ap WHERE ap.action_id = p_action_id AND ap.approver_principal_id = p_actor AND ap.revoked_at IS NULL) THEN
    RAISE EXCEPTION 'retention execution rejected: an approver of the action does not execute it' USING ERRCODE = '42501';
  END IF;
  -- B11-F1 (0071 §1): THE MANIFESTS THIS EXECUTION MOVES OR REMOVES ARE LOCKED for the transaction — before any re-check below reads their
  -- state and before any byte is copied. Every execution takes the domain's MOVERS lock first, then the manifests' own locks in one canonical
  -- order (by ref), so two executions never wait on each other in a cycle. An archive or a deletion holds the movers lock shared and each
  -- executable manifest exclusively; a customer export, which reads the bytes of its manifests while it builds, holds both shared (two exports
  -- build together; an archive or a deletion of the same manifest waits for the export to commit). An execution naming MORE THAN 256 manifests
  -- — whatever its kind — takes the movers lock exclusively and no manifest lock: one entry in the cluster's finite lock table instead of
  -- thousands, at the price of serialising the domain's movers for its duration — every other execution waits at its start, with nothing copied
  -- and nothing recorded. The locks are held until the transaction ends; the archive copies an execution stages carry its own attempt's name,
  -- so no lock has to survive to their removal.
  IF a.kind IN ('archive', 'deletion', 'customer_export') THEN
    SELECT count(*) INTO v_n FROM retention.scope_items si WHERE si.action_id = p_action_id AND si.item_kind = 'manifest' AND si.disposition = 'execute';
    IF v_n > 256 THEN
      PERFORM pg_advisory_xact_lock(retention.lock_key_domain(p_tenant, p_domain));
    ELSE
      PERFORM pg_advisory_xact_lock_shared(retention.lock_key_domain(p_tenant, p_domain));
      FOR m IN SELECT si.ref FROM retention.scope_items si WHERE si.action_id = p_action_id AND si.item_kind = 'manifest' AND si.disposition = 'execute' ORDER BY si.ref LOOP
        IF a.kind = 'customer_export' THEN PERFORM pg_advisory_xact_lock_shared(retention.lock_key_manifest(m.ref::uuid));
        ELSE PERFORM pg_advisory_xact_lock(retention.lock_key_manifest(m.ref::uuid));
        END IF;
      END LOOP;
    END IF;
  END IF;
  -- An ARCHIVE or an EXPORT of a manifest tombstoned since the approval: there are no bytes to move or to package; the scope is resolved again (the tombstoned manifest leaves it).
  IF a.kind IN ('archive', 'customer_export') THEN
    SELECT string_agg(si.ref, ', ' ORDER BY si.dependency_order) INTO v_tombstoned
      FROM retention.scope_items si
     WHERE si.action_id = p_action_id AND si.item_kind = 'manifest' AND si.disposition = 'execute'
       AND EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = si.ref::uuid);
    IF v_tombstoned IS NOT NULL THEN
      RAISE EXCEPTION 'retention execution rejected (scope_changed): manifest(s) in the approved scope were tombstoned since the approval — %; the scope is resolved again', v_tombstoned USING ERRCODE = '22023';
    END IF;
  END IF;
  -- The export's DATA-RIGHTS gate re-checked AT EXECUTION (the rights may have been withdrawn since the approval): the executor rolls back and
  -- pauses (authority_disputed). The contract rows are locked FOR SHARE first, so a withdrawal that commits inside the package build is impossible:
  -- it either committed before this read (refused here) or waits behind the export's commit (the package was built under confirmed rights).
  IF a.kind = 'customer_export' THEN
    PERFORM 1 FROM observation.source_contracts_current s
      WHERE (s.source_id, s.contract_version) IN (SELECT bm.source_id, bm.contract_version FROM retention.scope_items si JOIN observation.blob_manifests bm ON bm.manifest_id = si.ref::uuid
                                                    WHERE si.action_id = p_action_id AND si.item_kind = 'manifest' AND si.disposition = 'execute')
      FOR SHARE;
    SELECT string_agg(DISTINCT bm.source_id::text || '@' || bm.contract_version || ' (' || s.rights_state || ')', ', ') INTO v_withdrawn
      FROM retention.scope_items si JOIN observation.blob_manifests bm ON bm.manifest_id = si.ref::uuid
      JOIN observation.source_contracts_current s ON s.source_id = bm.source_id AND s.contract_version = bm.contract_version
     WHERE si.action_id = p_action_id AND si.item_kind = 'manifest' AND si.disposition = 'execute' AND s.rights_state <> 'confirmed';
    IF v_withdrawn IS NOT NULL THEN
      RAISE EXCEPTION 'retention execution rejected (rights_changed): the rights of a source in the approved scope are no longer confirmed — %; the scope is resolved again', v_withdrawn USING ERRCODE = '22023';
    END IF;
  END IF;
  -- A DELETION's SAFE SCOPE re-proven at execution (V03-T-100): the references are computed as the resolution computed them (the versions
  -- naming the manifest, the manifest's digest); any dependent now means the bytes are load-bearing and the tombstone is refused before it is written.
  IF a.kind = 'deletion' THEN
    FOR m IN SELECT si.ref, si.details FROM retention.scope_items si WHERE si.action_id = p_action_id AND si.item_kind = 'manifest' AND si.disposition = 'execute' ORDER BY si.dependency_order LOOP
      CONTINUE WHEN (m.details ->> 'evd_object_id') IS NULL;
      SELECT coalesce(array_agg(o.object_version ORDER BY o.object_version), ARRAY[]::bigint[]) INTO v_versions FROM objects.canonical_objects o
       WHERE o.object_id = (m.details ->> 'evd_object_id')::uuid AND o.object_type = 'EVD' AND (o.payload ->> 'manifest_id')::uuid = m.ref::uuid;
      v_dependents := retention.load_bearing_references(p_tenant, p_domain, (m.details ->> 'evd_object_id')::uuid, v_versions, m.details ->> 'content_digest');
      IF jsonb_array_length(v_dependents) > 0 THEN
        v_names := v_names || CASE WHEN v_names = '' THEN '' ELSE '; ' END || 'manifest ' || m.ref || ' ← ' || (SELECT string_agg((d ->> 'kind') || ':' || (d ->> 'ref'), ', ') FROM jsonb_array_elements(v_dependents) d);
      END IF;
    END LOOP;
    IF v_names <> '' THEN
      RAISE EXCEPTION 'retention execution rejected (references_changed): a live reference was created on the approved scope since it was resolved — %; the scope is resolved again', v_names USING ERRCODE = '22023';
    END IF;
  END IF;
  UPDATE retention.actions_current SET state = 'executing' WHERE action_id = p_action_id;
  PERFORM retention.event(p_action_id, p_tenant, p_domain, 'execution.started', p_actor, jsonb_build_object('scope_digest', a.scope_digest), p_correlation);
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('item_id', i.item_id, 'item_kind', i.item_kind, 'ref', i.ref, 'disposition', i.disposition, 'hold_id', i.hold_id, 'details', i.details) ORDER BY i.dependency_order), '[]'::jsonb)
            FROM retention.scope_items i WHERE i.action_id = p_action_id);
END $$ LANGUAGE plpgsql;

-- ============================================================
-- §2 the archive port records a move only under the manifest's lock
-- ============================================================
-- archive_blob (0070 §2) re-declared with one more refusal; every other line as 0070 left it.
CREATE OR REPLACE FUNCTION observation.archive_blob(
  p_record_id uuid, p_tenant uuid, p_domain uuid, p_manifest_id uuid, p_action_id uuid, p_content_digest text, p_actor uuid, p_correlation uuid
) RETURNS boolean
SECURITY DEFINER SET search_path = observation, objects, retention, ctx, public, pg_catalog, pg_temp AS $$
DECLARE m observation.blob_manifests%ROWTYPE; v_evd uuid; v_obs uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.action.execute']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'archive rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO m FROM observation.blob_manifests x WHERE x.manifest_id = p_manifest_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.vault = 'evidence';
  IF NOT FOUND THEN RAISE EXCEPTION 'archive rejected: no such evidence manifest in this domain' USING ERRCODE = '23503'; END IF;
  IF EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = p_manifest_id) THEN
    RAISE EXCEPTION 'archive refused: manifest % is tombstoned; there are no bytes to move', p_manifest_id USING ERRCODE = '22023';
  END IF;
  IF p_content_digest IS DISTINCT FROM m.content_digest THEN
    RAISE EXCEPTION 'archive refused: the digest verified on the archive copy (%) is not the manifest''s (%)', coalesce(p_content_digest, '<none>'), m.content_digest USING ERRCODE = 'P0R02';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM retention.actions_current a JOIN retention.scope_items i ON i.action_id = a.action_id
                  WHERE a.action_id = p_action_id AND a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.state = 'executing' AND a.kind = 'archive'
                    AND i.item_kind = 'manifest' AND i.ref = p_manifest_id::text AND i.disposition = 'execute') THEN
    RAISE EXCEPTION 'archive refused: no executing archive action names manifest % as an executable item', p_manifest_id USING ERRCODE = '42501';
  END IF;
  -- B11-F1 (0071 §2): the move is recorded only under the manifest's lock, which begin_execution took for this transaction — fail closed otherwise.
  IF NOT retention.holds_manifest_lock(p_tenant, p_domain, p_manifest_id) THEN
    RAISE EXCEPTION 'archive refused: manifest % is not locked by this execution (begin_execution takes the manifest''s lock; a move is recorded only under it)', p_manifest_id USING ERRCODE = '55P03';
  END IF;
  IF observation.manifest_tier(p_manifest_id) = 'archive' THEN RETURN false; END IF;
  INSERT INTO observation.blob_tier_records (record_id, scope, tenant_id, domain_id, manifest_id, from_tier, tier, action_id, content_digest, moved_by, correlation_id)
  VALUES (p_record_id, 'DOMAIN', p_tenant, p_domain, p_manifest_id, 'hot', 'archive', p_action_id, m.content_digest, p_actor, p_correlation);
  SELECT o.object_id, (o.payload ->> 'obs_object_id')::uuid INTO v_evd, v_obs FROM objects.canonical_objects o
   WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.object_type = 'EVD' AND (o.payload ->> 'manifest_id')::uuid = p_manifest_id ORDER BY o.object_version DESC LIMIT 1;
  INSERT INTO observation.custody_events (event_id, scope, tenant_id, domain_id, manifest_id, obs_object_id, evd_object_id, source_id, contract_version, run_id, event, actor, content_digest, digest_verified, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_manifest_id, v_obs, v_evd, m.source_id, m.contract_version, m.run_id, 'custody.archived', 'principal:' || p_actor::text, m.content_digest, true,
          jsonb_build_object('action_id', p_action_id, 'from_tier', 'hot', 'to_tier', 'archive', 'tier_record_id', p_record_id, 'locator', m.locator), p_correlation);
  RETURN true;
END $$ LANGUAGE plpgsql;
