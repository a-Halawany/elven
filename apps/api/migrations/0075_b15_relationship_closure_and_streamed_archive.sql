-- 0075 — CP-6 B15: the RELATIONSHIP CLOSURE in the customer export (graph links) and the STREAMED archive for larger packages (2026-09-16).
--
-- THE GAP. DP-47-003 ("exports preserve identity, temporal truth, provenance, corrections, policy labels, GRAPH LINKS, and manifest
-- integrity"), DP-47-002 ("object and RELATIONSHIP CLOSURE"), DP-47-006 ("LARGE-SCALE export, relationship closure, checksum and
-- signature verification"), AU-COM-0058: a package carried the exported records and their bytes, nothing of the knowledge derived from
-- them, and its archive was built in memory under a 256 MiB ceiling.
--
-- THE MECHANISM (the code's; this migration carries the one rule the database asserts). (D1) THE CLOSURE: the build writes links.json —
-- the claims whose lineage names the exported records (the latest canonical version of each, with its lineage rows), the graph's edges
-- asserted on them (every state as recorded) and the entities those edges connect with their identifiers, under the export's
-- classification ceiling (a claim above it EXCLUDED with the gate, and the edges that name it) — and names it in the manifest's
-- package.links (file, links_digest = sha256 of the file, byte_length, format, the counts): INSIDE the package digest chain, since
-- `package` is covered. The execution ledger records the closure (port retention.export_links). The verifier checks the file's digest
-- and size, its format and counts, and the closure's consistency (every claim's lineage names an exported record; every edge names an
-- included claim, included entities and an exported record). (D2) THE STREAMED ARCHIVE: the archive digest is taken at the build by
-- streaming over the files as written; the stream route (POST …/export/stream) serves the tar raw with its length after a disk pass
-- verified the digest; the station write and the https delivery stream it likewise; the streamed ceiling is 64 GiB, the in-memory JSON
-- download keeps its 256 MiB; the customer's verifier scans a tar block by block in constant memory.
--
-- THE RULE HERE: verify_action's package check (0070 §6 → 0072 §6) counts the files of the package directory against the record —
-- manifest.json + one per object; a package with a closure holds one more, links.json, which must be present and digest to what the
-- manifest names. Re-declared with that line; every other line as 0072 left it. The observer (retention.service.ts) reports
-- links_named, links_present and links_digest_ok beside files_present.

CREATE OR REPLACE FUNCTION retention.verify_action(p_action_id uuid, p_tenant uuid, p_domain uuid, p_observed jsonb, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a retention.actions_current%ROWTYPE; i RECORD; xp retention.export_packages%ROWTYPE; v_pass boolean; v_all boolean := true; v_checks jsonb := '[]'::jsonb; v_floor bigint; v_pending int; v_state text; ob jsonb; v_done boolean; v_tier text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.action.verify']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO a FROM retention.actions_current x WHERE x.action_id = p_action_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention verification rejected: % is not an action of this domain', p_action_id USING ERRCODE = '23503'; END IF;
  IF a.state <> 'executed' THEN RAISE EXCEPTION 'retention verification rejected: % is % — only an executed action is verified', p_action_id, a.state USING ERRCODE = '22023'; END IF;
  FOR i IN SELECT * FROM retention.scope_items x WHERE x.action_id = p_action_id ORDER BY x.dependency_order LOOP
    ob := coalesce(p_observed -> i.ref, '{}'::jsonb);
    v_done := EXISTS (SELECT 1 FROM retention.executions e WHERE e.action_id = p_action_id AND e.item_id = i.item_id AND e.outcome = 'done');
    IF i.item_kind = 'manifest' AND i.disposition = 'execute' AND a.kind = 'review' THEN
      -- B9-F3: a REVIEW's contract is PRESERVATION — the manifest untouched (no tombstone), its bytes present, and the review recorded.
      v_pass := NOT EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = i.ref::uuid) AND coalesce((ob ->> 'bytes_present')::boolean, false) = true
                AND EXISTS (SELECT 1 FROM retention.executions e WHERE e.action_id = p_action_id AND e.item_id = i.item_id AND e.outcome = 'done');
      INSERT INTO retention.verifications (verification_id, scope, tenant_id, domain_id, action_id, check_name, expected, observed, passed, verified_by)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest ' || i.ref || ': reviewed — untouched, its bytes present', jsonb_build_object('tombstone', false, 'bytes_present', true, 'reviewed', true),
              jsonb_build_object('tombstone', EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = i.ref::uuid), 'bytes_present', ob -> 'bytes_present', 'reviewed', EXISTS (SELECT 1 FROM retention.executions e WHERE e.action_id = p_action_id AND e.item_id = i.item_id AND e.outcome = 'done')), v_pass, p_actor);
    ELSIF i.item_kind = 'manifest' AND i.disposition = 'execute' AND a.kind = 'archive' THEN
      -- The ARCHIVE contract: no tombstone; the tier recorded as archive; the bytes present in the archive tier under the manifest's digest; the hot copy gone; the move recorded.
      v_tier := observation.manifest_tier(i.ref::uuid);
      v_pass := NOT EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = i.ref::uuid) AND v_tier = 'archive'
                AND coalesce((ob ->> 'bytes_present')::boolean, true) = false
                AND coalesce((ob ->> 'archive_present')::boolean, false) = true AND coalesce((ob ->> 'archive_digest_ok')::boolean, false) = true AND v_done;
      INSERT INTO retention.verifications (verification_id, scope, tenant_id, domain_id, action_id, check_name, expected, observed, passed, verified_by)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest ' || i.ref || ': archived — bytes in the archive tier under the manifest''s digest, absent from the hot tier, the tier recorded',
              jsonb_build_object('tombstone', false, 'tier', 'archive', 'bytes_present', false, 'archive_present', true, 'archive_digest_ok', true, 'archived', true),
              jsonb_build_object('tombstone', EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = i.ref::uuid), 'tier', v_tier, 'bytes_present', ob -> 'bytes_present', 'archive_present', ob -> 'archive_present', 'archive_digest_ok', ob -> 'archive_digest_ok', 'archived', v_done, 'hold_id', i.hold_id), v_pass, p_actor);
    ELSIF i.item_kind = 'manifest' AND i.disposition = 'execute' AND a.kind = 'restore' THEN
      -- The RESTORE contract (B12, D3): no tombstone; the tier recorded as hot; the bytes present in the hot tier under the manifest's digest; the archive copy gone; no staged copy in either root; the move recorded.
      v_tier := observation.manifest_tier(i.ref::uuid);
      v_pass := NOT EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = i.ref::uuid) AND v_tier = 'hot'
                AND coalesce((ob ->> 'bytes_present')::boolean, false) = true AND coalesce((ob ->> 'hot_digest_ok')::boolean, false) = true
                AND coalesce((ob ->> 'archive_present')::boolean, true) = false AND coalesce((ob ->> 'staged_copies')::boolean, true) = false AND v_done;
      INSERT INTO retention.verifications (verification_id, scope, tenant_id, domain_id, action_id, check_name, expected, observed, passed, verified_by)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest ' || i.ref || ': restored — bytes in the hot tier under the manifest''s digest, absent from the archive tier, no staged copy, the tier recorded',
              jsonb_build_object('tombstone', false, 'tier', 'hot', 'bytes_present', true, 'hot_digest_ok', true, 'archive_present', false, 'staged_copies', false, 'restored', true),
              jsonb_build_object('tombstone', EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = i.ref::uuid), 'tier', v_tier, 'bytes_present', ob -> 'bytes_present', 'hot_digest_ok', ob -> 'hot_digest_ok', 'archive_present', ob -> 'archive_present', 'staged_copies', ob -> 'staged_copies', 'restored', v_done, 'hold_id', i.hold_id), v_pass, p_actor);
    ELSIF i.item_kind = 'manifest' AND i.disposition = 'execute' AND a.kind = 'customer_export' THEN
      -- The EXPORT contract is the PACKAGE's: the object's file present in the package under the manifest's digest and the export recorded.
      -- The source's state NOW (a tombstone, its bytes present in its tier) is observed and recorded beside it, not required: an export left
      -- the source untouched at its execution (no executor of an export removes anything), and a governed deletion of the source afterwards
      -- is its own record — it must not leave the export unverifiable for good.
      v_pass := coalesce((ob ->> 'export_present')::boolean, false) = true AND coalesce((ob ->> 'export_digest_ok')::boolean, false) = true AND v_done;
      INSERT INTO retention.verifications (verification_id, scope, tenant_id, domain_id, action_id, check_name, expected, observed, passed, verified_by)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest ' || i.ref || ': exported — listed in the package with its bytes present under the manifest''s digest (the source''s present state recorded, not required)',
              jsonb_build_object('export_present', true, 'export_digest_ok', true, 'exported', true),
              jsonb_build_object('export_present', ob -> 'export_present', 'export_digest_ok', ob -> 'export_digest_ok', 'exported', v_done, 'hold_id', i.hold_id,
                                 'source_now', jsonb_build_object('tombstone', EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = i.ref::uuid), 'bytes_present', ob -> 'bytes_present')), v_pass, p_actor);
    ELSIF i.item_kind = 'manifest' AND i.disposition = 'execute' THEN
      -- The deletion check (0066/0068 verbatim): tombstoned and bytes_present false — the observer reports the manifest's CURRENT tier, so a deletion of archived bytes verifies against the archive root.
      v_pass := EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = i.ref::uuid) AND coalesce((ob ->> 'bytes_present')::boolean, true) = false;
      INSERT INTO retention.verifications (verification_id, scope, tenant_id, domain_id, action_id, check_name, expected, observed, passed, verified_by)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest ' || i.ref || ': tombstoned and its bytes gone', jsonb_build_object('tombstone', true, 'bytes_present', false),
              jsonb_build_object('tombstone', EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = i.ref::uuid), 'bytes_present', ob -> 'bytes_present'), v_pass, p_actor);
    ELSIF i.item_kind = 'manifest' AND i.disposition = 'held' THEN
      v_pass := NOT EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = i.ref::uuid) AND coalesce((ob ->> 'bytes_present')::boolean, false) = true;
      INSERT INTO retention.verifications (verification_id, scope, tenant_id, domain_id, action_id, check_name, expected, observed, passed, verified_by)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'manifest ' || i.ref || ': held — untouched, its bytes present', jsonb_build_object('tombstone', false, 'bytes_present', true),
              jsonb_build_object('tombstone', EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = i.ref::uuid), 'bytes_present', ob -> 'bytes_present', 'hold_id', i.hold_id), v_pass, p_actor);
    ELSIF i.item_kind = 'outbox_range' THEN
      SELECT p.retained_from_seq INTO v_floor FROM objects.outbox_partitions p WHERE p.partition_key = a.selector ->> 'partition_key';
      v_pass := v_floor >= (a.selector ->> 'to_seq')::bigint; -- a later action may have moved the floor further (B9 review)
      INSERT INTO retention.verifications (verification_id, scope, tenant_id, domain_id, action_id, check_name, expected, observed, passed, verified_by)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'the retained floor of ' || (a.selector ->> 'partition_key') || ' stands at to_seq or beyond', jsonb_build_object('retained_from_seq', (a.selector ->> 'to_seq')::bigint), jsonb_build_object('retained_from_seq', v_floor), v_pass, p_actor);
    ELSE
      CONTINUE;
    END IF;
    v_all := v_all AND v_pass;
    v_checks := v_checks || jsonb_build_object('item', i.ref, 'kind', i.item_kind, 'disposition', i.disposition, 'passed', v_pass);
  END LOOP;
  IF a.kind = 'customer_export' THEN
    -- The PACKAGE: manifest.json present, its file digest and the package digest as recorded, every listed object present and nothing unlisted, not revoked;
    -- B15: when the manifest names a relationship closure (package.links), links.json present with the digest the manifest names.
    SELECT * INTO xp FROM retention.export_packages e WHERE e.action_id = p_action_id;
    ob := coalesce(p_observed -> '__package__', '{}'::jsonb);
    v_pass := xp.action_id IS NOT NULL AND xp.revoked_at IS NULL AND coalesce((ob ->> 'manifest_present')::boolean, false) = true
              AND ob ->> 'manifest_digest' = xp.manifest_digest AND ob ->> 'package_digest' = xp.package_digest
              AND coalesce((ob ->> 'objects_listed')::int, -1) = xp.object_count
              -- B15 (D1): a package with a relationship closure holds one more file — links.json, named by the manifest, present and digesting to what the manifest names.
              AND coalesce((ob ->> 'files_present')::int, -1) = xp.object_count + 1 + CASE WHEN coalesce((ob ->> 'links_named')::boolean, false) THEN 1 ELSE 0 END
              AND (NOT coalesce((ob ->> 'links_named')::boolean, false) OR (coalesce((ob ->> 'links_present')::boolean, false) AND coalesce((ob ->> 'links_digest_ok')::boolean, false)));
    INSERT INTO retention.verifications (verification_id, scope, tenant_id, domain_id, action_id, check_name, expected, observed, passed, verified_by)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_action_id, 'the export package: manifest.json present with the recorded digests, every listed object present and nothing unlisted, the relationship closure it names present with its digest, not revoked',
            jsonb_build_object('manifest_present', true, 'manifest_digest', xp.manifest_digest, 'package_digest', xp.package_digest, 'objects_listed', xp.object_count,
                               'files_present', xp.object_count + 1 + CASE WHEN coalesce((ob ->> 'links_named')::boolean, false) THEN 1 ELSE 0 END,
                               'links_present', coalesce((ob ->> 'links_named')::boolean, false), 'links_digest_ok', coalesce((ob ->> 'links_named')::boolean, false), 'revoked', false),
            ob || jsonb_build_object('revoked', xp.revoked_at IS NOT NULL, 'recorded', xp.action_id IS NOT NULL), coalesce(v_pass, false), p_actor);
    v_all := v_all AND coalesce(v_pass, false);
    v_checks := v_checks || jsonb_build_object('item', '__package__', 'kind', 'export_package', 'disposition', 'execute', 'passed', coalesce(v_pass, false));
  END IF;
  IF NOT v_all THEN
    UPDATE retention.actions_current SET failure_class = 'infrastructure', disposition = 'retry', failure_reason = 'a verification check failed; the action stays executed until it passes' WHERE action_id = p_action_id;
    PERFORM retention.event(p_action_id, p_tenant, p_domain, 'action.failed', p_actor, jsonb_build_object('checks', v_checks, 'verification', 'failed'), p_correlation);
    RETURN jsonb_build_object('state', 'executed', 'verified', false, 'checks', v_checks);
  END IF;
  -- A bytes residual the executor recorded (the vault refused the removal after the record committed) closes when the bytes are observed gone (B9 review).
  -- B12 (C5): a RESTORE's residual is the archive copy's removal — it closes when the archive copy is observed gone; every other kind's closes on bytes_present.
  UPDATE retention.residual_inventory ri SET status = 'retained_by_policy', note = coalesce(ri.note, '') || '; bytes observed gone at verification ' || clock_timestamp()::text
   WHERE ri.action_id = p_action_id AND ri.kind = 'bytes_present' AND ri.status = 'pending'
     AND coalesce(((p_observed -> ri.ref) ->> CASE WHEN a.kind = 'restore' THEN 'archive_present' ELSE 'bytes_present' END)::boolean, true) = false;
  SELECT count(*) INTO v_pending FROM retention.residual_inventory ri WHERE ri.action_id = p_action_id AND ri.status = 'pending';
  v_state := CASE WHEN v_pending > 0 THEN 'verified_with_residuals' ELSE 'verified' END;
  UPDATE retention.actions_current
     SET state = v_state, verified_at = clock_timestamp(), closed_at = clock_timestamp(), failure_class = NULL, disposition = NULL, failure_reason = NULL,
         residual_summary = (SELECT coalesce(jsonb_agg(jsonb_build_object('kind', ri.kind, 'ref', ri.ref, 'count', ri.count, 'status', ri.status, 'note', ri.note)), '[]'::jsonb) FROM retention.residual_inventory ri WHERE ri.action_id = p_action_id)
   WHERE action_id = p_action_id;
  PERFORM retention.event(p_action_id, p_tenant, p_domain, CASE WHEN v_pending > 0 THEN 'verification.residuals' ELSE 'verification.passed' END, p_actor, jsonb_build_object('checks', v_checks, 'residuals_pending', v_pending), p_correlation);
  RETURN jsonb_build_object('state', v_state, 'verified', true, 'checks', v_checks,
    'scope_digest', a.scope_digest, 'kind', a.kind, 'target_kind', a.target_kind, 'selector', a.selector,
    'authorized_by', (SELECT coalesce(jsonb_agg(ap.approval_id), '[]'::jsonb) FROM retention.approvals ap WHERE ap.action_id = p_action_id AND ap.revoked_at IS NULL),
    'executed', (SELECT count(*) FROM retention.executions e WHERE e.action_id = p_action_id AND e.outcome = 'done'),
    'held', (SELECT count(*) FROM retention.scope_items si WHERE si.action_id = p_action_id AND si.disposition = 'held'),
    'excluded', (SELECT count(*) FROM retention.scope_items si WHERE si.action_id = p_action_id AND si.disposition = 'excluded'),
    'residual', (SELECT coalesce(jsonb_agg(jsonb_build_object('kind', ri.kind, 'count', ri.count, 'status', ri.status)), '[]'::jsonb) FROM retention.residual_inventory ri WHERE ri.action_id = p_action_id));
END $$ LANGUAGE plpgsql;

-- The interface register: the binding text of L3-I04 gains the clause; the counts stay (asserted).
UPDATE objects.interface_register SET bound_to = bound_to || '; B15 (0075): the relationship closure in the export (links.json — claims by lineage, edges, entities — under the ceiling, inside the digest chain; retention.export_links in the execution ledger) and the streamed archive (the stream route, the streamed station write and https delivery, the streaming verifier)'
  WHERE interface_id = 'L3-I04';
DO $$
DECLARE v_bound int; v_partial int; v_unbound int;
BEGIN
  SELECT count(*) FILTER (WHERE binding_state = 'bound'), count(*) FILTER (WHERE binding_state = 'partial'), count(*) FILTER (WHERE binding_state = 'unbound') INTO v_bound, v_partial, v_unbound FROM objects.interface_register;
  IF (v_bound, v_partial, v_unbound) <> (26, 24, 0) THEN
    RAISE EXCEPTION 'interface register after 0075: expected 26 bound, 24 partial, 0 unbound; found %, %, %', v_bound, v_partial, v_unbound;
  END IF;
END $$;
