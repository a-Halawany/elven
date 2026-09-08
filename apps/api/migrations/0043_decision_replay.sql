-- 0043 · Phase 6, P6-M3 — Decision Replay with executable snapshot semantics
-- (PHASE6_BUILD_PLAN.md §3 replay row; F5; §6a rules 5 and 6).
--
-- A replay reconstructs five layers from the records that existed at each moment,
-- each under its own exact cut-off, never through a current projection:
--   known     — evidence the package and its runs cite: recorded_at ≤ known_at and,
--               where the object carries an observation time, ≤ observed_through
--   believed  — claims, forecasts and assumptions at the cited version with the state
--               they had at known_at; branch states under both clocks
--   tested    — the cited runs' immutable digests (completed_at ≤ decided_at), the twin
--               versions they ran on (admitted_at ≤ decided_at) and the reproduction
--               verdicts with reproduced_at ≤ decided_at
--   decided   — the version and digest, dissent and approvals recorded ≤ decided_at, the
--               commitment and the policy and audit records of the commit
--   observed  — strictly what was recorded after decided_at and at or before as_of
-- Availability is reported apart from history: a later CORRECTION leaves the cited
-- version in its layer; a WITHDRAWAL, a governed deletion or an unreadable object is
-- reported unavailable with its reason and nothing later is substituted. The content
-- digest covers the layers and the cut-offs; the invocation (reader, instant,
-- availability at that instant) is stored beside it in the RPL record.
--
--   §1  the commitment's policy decision id; revocation after commitment as a record
--   §2  decision.replays (append-only) and the replay.recorded event
--   §3  decision.replay_layers — the reconstruction
--   §4  decision.record_replay; RPL@v1; decision.replay → ['RPL']
-- ============================================================

-- ============================================================
-- 1. The commit's own policy decision, bound on the commitment row.
-- ============================================================
ALTER TABLE decision.commitments ADD COLUMN policy_decision_id uuid;

CREATE OR REPLACE FUNCTION decision.commit_package(
  p_commitment_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_committer uuid, p_version_digest text, p_header_digest text,
  p_title text, p_statement text, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, graph, simulation, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p record; v record; v_quorum int; v_live int; v_approvals jsonb; v_dec uuid; c jsonb; v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.commit']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF public.eye_op_class() IS DISTINCT FROM 'C3' THEN
    RAISE EXCEPTION 'commitment rejected: decision.commit requires a C3 authority context; this context is %', coalesce(public.eye_op_class(), 'unclassed') USING ERRCODE = '42501';
  END IF;
  IF public.eye_bound_action() IS DISTINCT FROM 'decision.commit' THEN
    RAISE EXCEPTION 'commitment rejected: the context is bound to %, not decision.commit', public.eye_bound_action() USING ERRCODE = '42501';
  END IF;
  IF p_committer IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'commitment rejected: a commitment is made by the acting principal, never on behalf of another' USING ERRCODE = '42501';
  END IF;
  IF NOT decision.is_active_human(p_committer, p_tenant) THEN RAISE EXCEPTION 'commitment rejected: only a named, active human principal commits' USING ERRCODE = '42501'; END IF;
  IF NOT decision.holds_role(p_committer, p_tenant, p_domain, 'decision_authority') THEN
    RAISE EXCEPTION 'commitment rejected: principal % does not hold decision_authority at this scope', p_committer USING ERRCODE = '42501';
  END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'commitment rejected: no such package in this domain' USING ERRCODE = '23503'; END IF;
  IF p.committed_version IS NOT NULL THEN RAISE EXCEPTION 'commitment rejected: package is already committed at version %', p.committed_version USING ERRCODE = '22023'; END IF;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'commitment rejected: no such version' USING ERRCODE = '23503'; END IF;
  IF v.state <> 'approved' THEN RAISE EXCEPTION 'commitment rejected: version % is %, not approved', p_version, v.state USING ERRCODE = '22023'; END IF;
  IF p_version_digest IS DISTINCT FROM v.version_digest THEN
    RAISE EXCEPTION 'commitment rejected: the digest committed (%) is not the digest of version % (%)', p_version_digest, p_version, v.version_digest USING ERRCODE = '22023';
  END IF;
  v_quorum := (v.approver_policy ->> 'quorum')::int;
  SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('approval_id', approval_id, 'approver', approver_principal_id)), '[]'::jsonb)
    INTO v_live, v_approvals FROM decision.live_approvals(p_package_id, p_version);
  IF v_live < v_quorum THEN
    RAISE EXCEPTION 'commitment rejected: quorum is % distinct eligible humans; % live approval(s) stand now (expired, revoked or re-digested approvals do not count)', v_quorum, v_live USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM decision.live_approvals(p_package_id, p_version) la WHERE la.approver_principal_id = p_committer) THEN
    RAISE EXCEPTION 'commitment rejected: the committing authority cannot be one of the approvers' USING ERRCODE = '42501';
  END IF;
  v_dec := p.decision_object_id;
  INSERT INTO graph.strategy_current (strategy_object_id, scope, tenant_id, domain_id, object_type, object_version, title, statement, status, verification_state, parent_objective_id, owner_principal_id, correlation_id)
  VALUES (p_commitment_id, 'DOMAIN', p_tenant, p_domain, 'CMT', 1, p_title, p_statement, 'active', 'not_applicable', NULL, p_committer, p_correlation);
  INSERT INTO graph.strategy_events (event_id, scope, tenant_id, domain_id, strategy_object_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_commitment_id, 'strategy.declared', p_committer,
          jsonb_build_object('object_type', 'CMT', 'title', p_title, 'version', 1, 'status', 'active', 'via', 'decision.commit', 'package_id', p_package_id, 'package_version', p_version), p_correlation);
  INSERT INTO graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_commitment_id, 'CMT', 'strategy', v_dec, format('the commitment executes decision %s (package %s v%s)', v_dec, p_package_id, p_version), 'active', p_committer, p_correlation);
  FOR c IN SELECT DISTINCT x FROM decision.options o, jsonb_array_elements(o.consequences) x WHERE o.package_id = p_package_id AND o.version = p_version AND o.key = (v.choice ->> 'option_key') AND (x ->> 'kind') = 'run' LOOP
    INSERT INTO graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_commitment_id, 'CMT', 'run', (c ->> 'id')::uuid, format('the chosen option %s rests on this run', v.choice ->> 'option_key'), 'active', p_committer, p_correlation)
    ON CONFLICT DO NOTHING;
  END LOOP;
  IF v.baseline_run_id IS NOT NULL THEN
    INSERT INTO graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_commitment_id, 'CMT', 'run', v.baseline_run_id, 'the common baseline the options were compared against', 'active', p_committer, p_correlation)
    ON CONFLICT DO NOTHING;
  END IF;
  -- ONE instant is the decision: the commitment, decided_at and the committed event carry it, so a replay's decided layer closes exactly there.
  INSERT INTO decision.commitments (commitment_id, scope, tenant_id, domain_id, package_id, version, committed_by, version_digest, approvals, op_class, bound_action, header_digest, policy_decision_id, committed_at, correlation_id)
  VALUES (p_commitment_id, 'DOMAIN', p_tenant, p_domain, p_package_id, p_version, p_committer, p_version_digest, v_approvals, public.eye_op_class(), public.eye_bound_action(), p_header_digest, public.eye_policy_decision(), v_now, p_correlation);
  UPDATE decision.package_versions SET state = 'committed' WHERE package_id = p_package_id AND version = p_version;
  UPDATE decision.packages_current SET state = 'committed', committed_version = p_version, decided_at = v_now WHERE package_id = p_package_id;
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, occurred_at, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'package.committed', p_committer,
          jsonb_build_object('version', p_version, 'commitment_id', p_commitment_id, 'version_digest', p_version_digest, 'approvals', v_approvals, 'op_class', public.eye_op_class(), 'policy_decision_id', public.eye_policy_decision(), 'choice', v.choice), v_now, p_correlation);
  RETURN jsonb_build_object('commitment_id', p_commitment_id, 'approvals', v_approvals, 'op_class', public.eye_op_class(), 'decided_at', v_now, 'policy_decision_id', public.eye_policy_decision());
END $$ LANGUAGE plpgsql;

/* A revocation after commitment is recorded — it is observed history — and moves nothing: the commitment stands. */
CREATE OR REPLACE FUNCTION decision.revoke_approval(
  p_approval_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a record; v record; v_live int; v_quorum int; v_state text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.approve.revoke']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO a FROM decision.approvals x WHERE x.approval_id = p_approval_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'revocation rejected: no such approval in this domain' USING ERRCODE = '23503'; END IF;
  IF a.approver_principal_id IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'revocation rejected: only the approver revokes their own approval' USING ERRCODE = '42501'; END IF;
  IF a.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'revocation rejected: approval is already revoked' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 4 THEN RAISE EXCEPTION 'revocation rejected: a reason is required' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = a.package_id AND x.version = a.version FOR UPDATE;
  UPDATE decision.approvals SET revoked_at = clock_timestamp(), revoked_reason = p_reason WHERE approval_id = p_approval_id;
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, a.package_id, 'approval.revoked', a.approver_principal_id,
          jsonb_build_object('version', a.version, 'approval_id', p_approval_id, 'reason', p_reason, 'after_commitment', v.state = 'committed'), p_correlation);
  v_quorum := (v.approver_policy ->> 'quorum')::int;
  SELECT count(*) INTO v_live FROM decision.live_approvals(a.package_id, a.version);
  v_state := v.state;
  IF v.state = 'approved' AND v_live < v_quorum THEN
    v_state := 'under_review';
    UPDATE decision.package_versions SET state = 'under_review' WHERE package_id = a.package_id AND version = a.version;
    UPDATE decision.packages_current SET state = 'under_review' WHERE package_id = a.package_id;
  END IF;
  RETURN jsonb_build_object('state', v_state, 'live_approvals', v_live, 'quorum', v_quorum);
END $$ LANGUAGE plpgsql;

-- ============================================================
-- 2. Replays.
-- ============================================================
ALTER TABLE decision.package_events DROP CONSTRAINT package_events_event_check;
ALTER TABLE decision.package_events ADD CONSTRAINT package_events_event_check CHECK (event IN (
  'package.declared', 'version.opened', 'option.set', 'terms.set', 'choice.set', 'dissent.recorded', 'version.proposed',
  'review.recorded', 'version.approved', 'approval.revoked', 'version.rejected', 'package.committed', 'package.withdrawn',
  'outcome.recorded', 'package.closed', 'commit.refused', 'replay.recorded', 'condition.breached', 'review.overdue'));

CREATE TABLE decision.replays (
  replay_id          uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  package_id         uuid NOT NULL,
  version            int  NOT NULL,
  known_at           timestamptz NOT NULL,
  observed_through   date,
  decided_at         timestamptz NOT NULL,
  as_of              timestamptz NOT NULL,
  content_digest     text NOT NULL CHECK (content_digest ~ '^[0-9a-f]{64}$'),
  header_digest      text NOT NULL CHECK (header_digest ~ '^[0-9a-f]{64}$'),
  reader_principal_id uuid NOT NULL,
  purpose            text NOT NULL,
  unavailable        jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(unavailable) = 'array'),
  summary            jsonb NOT NULL DEFAULT '{}'::jsonb,
  replayed_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT drp_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT drp_version FOREIGN KEY (package_id, version) REFERENCES decision.package_versions(package_id, version),
  CONSTRAINT drp_as_of_after_decision CHECK (as_of >= decided_at)
);
CREATE INDEX drp_package_idx ON decision.replays (package_id, version, replayed_at);
CREATE TRIGGER drp_append_only BEFORE UPDATE OR DELETE ON decision.replays
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- ============================================================
-- 3. The reconstruction.
-- ============================================================
/* A timestamp as UTC text, so a replay's content does not depend on the session's time zone. */
CREATE OR REPLACE FUNCTION decision.iso(p timestamptz) RETURNS text
IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE WHEN p IS NULL THEN NULL ELSE to_char(p AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END;
$$ LANGUAGE sql;
GRANT EXECUTE ON FUNCTION decision.iso(timestamptz) TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION decision.replay_layers(p_package_id uuid, p_version int, p_as_of timestamptz) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, graph, simulation, twin, prediction, observation, objects, policy, audit, identity, public, pg_catalog, pg_temp AS $$
DECLARE
  p record; v record; c record;
  v_tenant uuid := public.eye_tenant(); v_domain uuid := public.eye_domain();
  v_known timestamptz; v_obs date; v_dec timestamptz; v_asof timestamptz;
  v_known_l jsonb; v_believed jsonb; v_tested jsonb; v_decided jsonb; v_observed jsonb; v_excluded jsonb; v_unavailable jsonb;
  v_content jsonb; v_digest text;
  v_run_ids uuid[]; v_branches uuid[]; v_indicators uuid[]; v_twin_versions jsonb;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'replay rejected: no authority context' USING ERRCODE = '42501'; END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = v_tenant AND (public.eye_scope() = 'TENANT' OR x.domain_id = v_domain);
  IF NOT FOUND THEN RAISE EXCEPTION 'replay rejected: no authorized package matches' USING ERRCODE = '23503'; END IF;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'replay rejected: no such version' USING ERRCODE = '23503'; END IF;
  SELECT * INTO c FROM decision.commitments x WHERE x.package_id = p_package_id AND x.version = p_version;
  IF NOT FOUND OR p.decided_at IS NULL THEN
    RAISE EXCEPTION 'replay rejected: version % of package % is %, not committed; a replay reconstructs what a DECISION was taken with', p_version, p_package_id, v.state USING ERRCODE = '22023';
  END IF;
  v_known := v.known_at; v_obs := v.observed_through; v_dec := p.decided_at; v_asof := coalesce(p_as_of, clock_timestamp());
  IF v_asof < v_dec THEN RAISE EXCEPTION 'replay rejected: as_of (%) is before decided_at (%); the observed layer starts at the decision', decision.iso(v_asof), decision.iso(v_dec) USING ERRCODE = '22023'; END IF;

  -- The citations: the options' consequences, and what the cited runs' twin versions were grounded on.
  CREATE TEMP TABLE IF NOT EXISTS rp_cites (kind text, object_type text, id uuid, version int, digest text, via text) ON COMMIT DROP;
  DELETE FROM rp_cites;
  INSERT INTO rp_cites
    SELECT DISTINCT x ->> 'kind',
           CASE x ->> 'kind' WHEN 'run' THEN 'SIM' WHEN 'forecast' THEN 'FCT' WHEN 'claim' THEN 'CLM' WHEN 'evidence' THEN 'EVD' WHEN 'assumption' THEN 'ASU' WHEN 'warning' THEN 'WRN' END,
           (x ->> 'id')::uuid, (x ->> 'version')::int, x ->> 'digest', 'option:' || o.key
      FROM decision.options o, jsonb_array_elements(o.consequences) x
     WHERE o.package_id = p_package_id AND o.version = p_version;
  SELECT coalesce(array_agg(DISTINCT id), ARRAY[]::uuid[]) INTO v_run_ids FROM rp_cites WHERE kind = 'run';
  INSERT INTO rp_cites
    SELECT DISTINCT ON ((x ->> 'id'), (x ->> 'version')) x ->> 'kind',
           CASE x ->> 'kind' WHEN 'run' THEN 'SIM' WHEN 'forecast' THEN 'FCT' WHEN 'claim' THEN 'CLM' WHEN 'evidence' THEN 'EVD' WHEN 'assumption' THEN 'ASU' END,
           (x ->> 'id')::uuid, (x ->> 'version')::int, NULL, 'twin:' || r.twin_id || '@' || r.twin_version || ':' || e.key
      FROM simulation.runs_current r
      JOIN twin.state_elements e ON e.twin_id = r.twin_id AND e.version = r.twin_version
      CROSS JOIN LATERAL jsonb_array_elements(e.citations) x
     WHERE r.run_id = ANY (v_run_ids) AND (x ->> 'kind') IN ('evidence', 'claim', 'forecast', 'assumption')
       AND NOT EXISTS (SELECT 1 FROM rp_cites q WHERE q.id = (x ->> 'id')::uuid AND q.version IS NOT DISTINCT FROM (x ->> 'version')::int)
     ORDER BY (x ->> 'id'), (x ->> 'version'), r.twin_id, r.twin_version, e.key;
  -- The branches and indicators the version watches, and the branches its runs were bound to.
  SELECT coalesce(array_agg(DISTINCT b), ARRAY[]::uuid[]) INTO v_branches FROM (
    SELECT (m ->> 'branch_id')::uuid b FROM jsonb_array_elements(v.monitoring_conditions) m WHERE (m ->> 'kind') = 'warning' AND (m ->> 'branch_id') IS NOT NULL
    UNION SELECT r.scenario_branch_id FROM simulation.runs_current r WHERE r.run_id = ANY (v_run_ids) AND r.scenario_branch_id IS NOT NULL) s;
  SELECT coalesce(array_agg(DISTINCT (m ->> 'indicator_id')::uuid), ARRAY[]::uuid[]) INTO v_indicators
    FROM jsonb_array_elements(v.monitoring_conditions) m WHERE (m ->> 'kind') = 'indicator' AND (m ->> 'indicator_id') IS NOT NULL;

  -- ── excluded: cited versions that cannot enter their layer under the cut-offs (part of the content) ──
  SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'layer', x ->> 'id', (x ->> 'version')::int), '[]'::jsonb) INTO v_excluded FROM (
    SELECT jsonb_build_object('layer', CASE WHEN q.object_type = 'EVD' THEN 'known' ELSE 'believed' END, 'id', q.id, 'version', q.version, 'via', q.via,
                              'reason', CASE WHEN o.recorded_at > v_known THEN 'recorded after known_at'
                                             ELSE 'event after observed_through' END,
                              'recorded_at', decision.iso(o.recorded_at)) x
      FROM rp_cites q JOIN objects.canonical_objects o ON o.object_id = q.id AND o.object_version = q.version
     WHERE q.object_type IN ('EVD', 'CLM', 'FCT', 'ASU', 'WRN')
       AND (o.recorded_at > v_known OR (v_obs IS NOT NULL AND o.event_time IS NOT NULL AND o.event_time::date > v_obs))
    UNION ALL
    SELECT jsonb_build_object('layer', 'tested', 'id', r.run_id, 'version', 1, 'via', 'run',
                              'reason', CASE WHEN r.state <> 'completed' THEN 'not completed' ELSE 'completed after decided_at' END, 'recorded_at', decision.iso(r.completed_at)) x
      FROM simulation.runs_current r WHERE r.run_id = ANY (v_run_ids) AND (r.state <> 'completed' OR r.completed_at > v_dec)) s;

  -- ── unavailable: reported at THIS instant, apart from the content ──
  SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'layer', x ->> 'id', (x ->> 'version')::int), '[]'::jsonb) INTO v_unavailable FROM (
    SELECT jsonb_build_object('layer', CASE WHEN q.object_type = 'EVD' THEN 'known' WHEN q.object_type = 'SIM' THEN 'tested' ELSE 'believed' END, 'id', q.id, 'version', q.version, 'via', q.via,
                              'reason', 'not accessible to the reader or not recorded') x
      FROM rp_cites q WHERE q.object_type <> 'SIM' AND NOT EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = q.id AND o.object_version = q.version
                                                                     AND o.tenant_id = v_tenant AND (public.eye_scope() = 'TENANT' OR o.domain_id = v_domain))
    UNION ALL
    SELECT jsonb_build_object('layer', CASE WHEN q.object_type = 'EVD' THEN 'known' ELSE 'believed' END, 'id', q.id, 'version', q.version, 'via', q.via,
                              'reason', 'withdrawn', 'at', decision.iso(w.recorded_at), 'by_version', w.object_version, 'withdrawal_reason', w.withdrawal_reason) x
      FROM rp_cites q JOIN LATERAL (SELECT * FROM objects.canonical_objects o2 WHERE o2.object_id = q.id AND o2.object_version > q.version AND o2.lifecycle_state = 'withdrawn' ORDER BY o2.object_version LIMIT 1) w ON true
     WHERE q.object_type <> 'SIM'
    UNION ALL
    SELECT jsonb_build_object('layer', CASE WHEN q.object_type = 'EVD' THEN 'known' ELSE 'believed' END, 'id', q.id, 'version', q.version, 'via', q.via,
                              'reason', 'withdrawn', 'at', NULL, 'by_version', q.version, 'withdrawal_reason', o.withdrawal_reason) x
      FROM rp_cites q JOIN objects.canonical_objects o ON o.object_id = q.id AND o.object_version = q.version
     WHERE q.object_type <> 'SIM' AND o.lifecycle_state IN ('withdrawn', 'deleted')
       AND NOT EXISTS (SELECT 1 FROM objects.canonical_objects o2 WHERE o2.object_id = q.id AND o2.object_version > q.version AND o2.lifecycle_state = 'withdrawn')
    UNION ALL
    SELECT jsonb_build_object('layer', 'known', 'id', q.id, 'version', q.version, 'via', q.via, 'reason', 'governed-deleted', 'at', decision.iso(t.tombstoned_at), 'tombstone_reason', t.reason) x
      FROM rp_cites q JOIN objects.canonical_objects o ON o.object_id = q.id AND o.object_version = q.version
      JOIN observation.blob_tombstones t ON t.manifest_id = (o.payload ->> 'manifest_id')::uuid
     WHERE q.object_type = 'EVD') s;

  -- ── known ── (history: the cited version as it was recorded; availability is reported apart, in `unavailable`)
  SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'id', (x ->> 'version')::int), '[]'::jsonb) INTO v_known_l FROM (
    SELECT jsonb_build_object('id', q.id, 'version', q.version, 'digest', o.content_digest, 'cited_digest', q.digest, 'via', q.via, 'object_type', o.object_type,
                              'recorded_at', decision.iso(o.recorded_at), 'observation_time', decision.iso(o.observation_time), 'event_time', decision.iso(o.event_time),
                              'truth_state', o.truth_state, 'synthetic_state', o.synthetic_state, 'classification', o.classification, 'rights_profile', o.rights_profile,
                              'provenance_ref', o.provenance_ref, 'correction_of', o.correction_of) x
      FROM rp_cites q JOIN objects.canonical_objects o ON o.object_id = q.id AND o.object_version = q.version
     WHERE q.object_type = 'EVD' AND o.recorded_at <= v_known
       AND (v_obs IS NULL OR o.event_time IS NULL OR o.event_time::date <= v_obs)) s;

  -- ── believed ──
  SELECT jsonb_build_object(
    'claims', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'id', (x ->> 'version')::int) FROM (
        SELECT jsonb_build_object('id', q.id, 'version', q.version, 'digest', o.content_digest, 'via', q.via, 'truth_state', o.truth_state, 'recorded_at', decision.iso(o.recorded_at), 'synthetic_state', o.synthetic_state) x
          FROM rp_cites q JOIN objects.canonical_objects o ON o.object_id = q.id AND o.object_version = q.version
         WHERE q.object_type = 'CLM' AND o.recorded_at <= v_known AND (v_obs IS NULL OR o.event_time IS NULL OR o.event_time::date <= v_obs)) s), '[]'::jsonb),
    'forecasts', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'id', (x ->> 'version')::int) FROM (
        SELECT jsonb_build_object('id', q.id, 'version', q.version, 'digest', o.content_digest, 'via', q.via, 'truth_state', o.truth_state, 'quality_state', o.quality_state,
                                  'validation_state', o.payload ->> 'validation_state', 'recorded_at', decision.iso(o.recorded_at), 'synthetic_state', o.synthetic_state) x
          FROM rp_cites q JOIN objects.canonical_objects o ON o.object_id = q.id AND o.object_version = q.version
         WHERE q.object_type = 'FCT' AND o.recorded_at <= v_known AND (v_obs IS NULL OR o.event_time IS NULL OR o.event_time::date <= v_obs)) s), '[]'::jsonb),
    'assumptions', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'id', (x ->> 'version')::int) FROM (
        SELECT jsonb_build_object('id', q.id, 'version', q.version, 'digest', o.content_digest, 'via', q.via, 'truth_state', o.truth_state, 'recorded_at', decision.iso(o.recorded_at),
                                  'verification_at_known_at', coalesce((SELECT e.details ->> 'state' FROM graph.strategy_events e WHERE e.strategy_object_id = q.id AND e.event LIKE 'assumption.%' AND e.occurred_at <= v_known ORDER BY e.occurred_at DESC LIMIT 1), 'unverified')) x
          FROM rp_cites q JOIN objects.canonical_objects o ON o.object_id = q.id AND o.object_version = q.version
         WHERE q.object_type = 'ASU' AND o.recorded_at <= v_known) s), '[]'::jsonb),
    'warnings', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'id', (x ->> 'version')::int) FROM (
        SELECT jsonb_build_object('id', q.id, 'version', q.version, 'digest', o.content_digest, 'via', q.via, 'truth_state', o.truth_state, 'recorded_at', decision.iso(o.recorded_at)) x
          FROM rp_cites q JOIN objects.canonical_objects o ON o.object_id = q.id AND o.object_version = q.version
         WHERE q.object_type = 'WRN' AND o.recorded_at <= v_known) s), '[]'::jsonb),
    'branches', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'branch_id') FROM (
        SELECT jsonb_build_object('branch_id', b.branch_id, 'scenario_id', b.scenario_id, 'name', b.name, 'kind', b.kind, 'state_as_of', prediction.branch_state_as_of(b.branch_id, v_known, v_obs),
                                  'known_at', decision.iso(v_known), 'observed_through', v_obs) x
          FROM prediction.branches_current b WHERE b.branch_id = ANY (v_branches) AND b.added_at <= v_known) s), '[]'::jsonb),
    'twins', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'twin_id') FROM (
        SELECT DISTINCT jsonb_build_object('twin_id', t.twin_id, 'title', t.title, 'validation_status', t.validation ->> 'status', 'limitations', t.validation -> 'limitations', 'behaviour_model_ref', t.behaviour_model_ref) x
          FROM simulation.runs_current r JOIN twin.twins_current t ON t.twin_id = r.twin_id WHERE r.run_id = ANY (v_run_ids) AND t.declared_at <= v_known) s), '[]'::jsonb)
  ) INTO v_believed;

  -- ── tested ──
  SELECT jsonb_build_object(
    'runs', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'run_id') FROM (
        SELECT jsonb_build_object('run_id', r.run_id, 'run_kind', r.run_kind, 'control_run_id', r.control_run_id, 'twin_id', r.twin_id, 'twin_version', r.twin_version, 'branch_id', r.branch_id,
                                  'known_at', decision.iso(r.known_at), 'observed_through', r.observed_through, 'inputs_digest', r.inputs_digest, 'initial_state_digest', r.initial_state_digest,
                                  'outputs_digest', r.outputs_digest, 'implementation_digest', r.implementation_digest, 'environment_digest', r.environment_digest, 'header_digest', r.header_digest,
                                  'outside_envelope', r.outside_envelope, 'completed_at', decision.iso(r.completed_at), 'interventions', r.interventions) x
          FROM simulation.runs_current r WHERE r.run_id = ANY (v_run_ids) AND r.state = 'completed' AND r.completed_at <= v_dec) s), '[]'::jsonb),
    'reproductions', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'reproduced_at', x ->> 'reproduction_id') FROM (
        SELECT jsonb_build_object('reproduction_id', rp.reproduction_id, 'run_id', rp.run_id, 'verdict', rp.verdict, 'expected_digest', rp.expected_digest, 'actual_digest', rp.actual_digest,
                                  'environment_matches', rp.environment_matches, 'cold_process', rp.cold_process, 'reproduced_at', decision.iso(rp.reproduced_at)) x
          FROM simulation.reproductions rp WHERE rp.run_id = ANY (v_run_ids) AND rp.reproduced_at <= v_dec) s), '[]'::jsonb),
    'twin_versions', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'twin_id', (x ->> 'version')::int) FROM (
        SELECT DISTINCT jsonb_build_object('twin_id', tv.twin_id, 'version', tv.version, 'branch_id', tv.branch_id, 'state_set_digest', tv.state_set_digest, 'header_digest', tv.header_digest,
                                  'known_at', decision.iso(tv.known_at), 'observed_through', tv.observed_through, 'admitted_at', decision.iso(tv.admitted_at), 'completeness', tv.completeness, 'synthetic_state', tv.synthetic_state,
                                  'verification_at_decided_at', coalesce((SELECT CASE WHEN e.event = 'version.unverified' THEN 'unverified' ELSE 'verified' END FROM twin.twin_events e
                                                                           WHERE e.twin_id = tv.twin_id AND (e.details ->> 'version')::int = tv.version AND e.event IN ('version.unverified', 'version.reverified') AND e.occurred_at <= v_dec
                                                                           ORDER BY e.occurred_at DESC LIMIT 1), 'verified')) x
          FROM simulation.runs_current r JOIN twin.twin_versions tv ON tv.twin_id = r.twin_id AND tv.version = r.twin_version
         WHERE r.run_id = ANY (v_run_ids) AND tv.state = 'admitted' AND tv.admitted_at <= v_dec) s), '[]'::jsonb)
  ) INTO v_tested;

  -- ── decided ──
  SELECT jsonb_build_object(
    'version', jsonb_build_object('package_id', v.package_id, 'version', v.version, 'version_digest', v.version_digest, 'header_digest', v.header_digest, 'known_at', decision.iso(v.known_at),
                                  'observed_through', v.observed_through, 'proposed_at', decision.iso(v.proposed_at), 'proposed_by', v.proposed_by, 'choice', v.choice, 'objectives', v.objectives,
                                  'approver_policy', v.approver_policy, 'monitoring_conditions', v.monitoring_conditions, 'baseline_run_id', v.baseline_run_id, 'synthetic_state', v.synthetic_state, 'supersedes', v.supersedes),
    'decision_object_id', p.decision_object_id,
    'options', coalesce((SELECT jsonb_agg(jsonb_build_object('key', o.key, 'title', o.title, 'kind', o.kind, 'simulated', o.simulated, 'unsimulated_reason', o.unsimulated_reason, 'consequences', o.consequences, 'uncertainty', o.uncertainty) ORDER BY o.key)
                         FROM decision.options o WHERE o.package_id = p_package_id AND o.version = p_version), '[]'::jsonb),
    'dissent', coalesce((SELECT jsonb_agg(jsonb_build_object('dissent_id', d.dissent_id, 'principal_id', d.principal_id, 'position', d.position, 'rationale', d.rationale, 'citation', d.citation, 'recorded_at', decision.iso(d.recorded_at)) ORDER BY d.recorded_at, d.dissent_id)
                         FROM decision.dissent d WHERE d.package_id = p_package_id AND d.version = p_version AND d.recorded_at <= v_dec), '[]'::jsonb),
    'approvals', coalesce((SELECT jsonb_agg(jsonb_build_object('approval_id', a.approval_id, 'approver', a.approver_principal_id, 'decision', a.decision, 'version_digest', a.version_digest, 'eligible_by', a.eligible_by,
                                                               'expires_at', decision.iso(a.expires_at), 'recorded_at', decision.iso(a.recorded_at), 'header_digest', a.header_digest,
                                                               'revoked_before_decision', a.revoked_at IS NOT NULL AND a.revoked_at <= v_dec) ORDER BY a.recorded_at, a.approval_id)
                           FROM decision.approvals a WHERE a.package_id = p_package_id AND a.version = p_version AND a.recorded_at <= v_dec), '[]'::jsonb),
    'commitment', jsonb_build_object('commitment_id', c.commitment_id, 'committed_by', c.committed_by, 'version_digest', c.version_digest, 'approvals', c.approvals, 'op_class', c.op_class, 'bound_action', c.bound_action,
                                     'header_digest', c.header_digest, 'committed_at', decision.iso(c.committed_at), 'decided_at', decision.iso(v_dec), 'policy_decision_id', c.policy_decision_id),
    'policy', (SELECT jsonb_build_object('policy_decision_id', pd.id, 'decision', pd.decision, 'obligations', pd.obligations, 'consequence_class', pd.consequence_class, 'action', pd.action, 'recorded_at', decision.iso(pd.created_at))
                 FROM policy.policy_decisions pd WHERE pd.id = c.policy_decision_id),
    'audit', (SELECT jsonb_build_object('partition_id', ae.partition_id, 'audit_seq', ae.audit_seq, 'row_hash', ae.row_hash, 'occurred_at', ae.occurred_at, 'outcome', ae.outcome)
                FROM audit.audit_events ae WHERE ae.correlation_id = c.correlation_id AND ae.action = 'decision.commit' AND ae.outcome = 'success' ORDER BY ae.audit_seq LIMIT 1)
  ) INTO v_decided;

  -- ── observed: strictly (decided_at, as_of] ──
  SELECT jsonb_build_object(
    'later_versions', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'recorded_at', x ->> 'id', (x ->> 'version')::int) FROM (
        SELECT DISTINCT jsonb_build_object('id', o2.object_id, 'version', o2.object_version, 'object_type', o2.object_type, 'lifecycle_state', o2.lifecycle_state, 'truth_state', o2.truth_state, 'correction_of', o2.correction_of,
                                  'withdrawal_reason', o2.withdrawal_reason, 'digest', o2.content_digest, 'recorded_at', decision.iso(o2.recorded_at), 'cited_version', q.version) x
          FROM rp_cites q JOIN objects.canonical_objects o2 ON o2.object_id = q.id AND o2.object_version > q.version
         WHERE q.object_type <> 'SIM' AND o2.recorded_at > v_dec AND o2.recorded_at <= v_asof) s), '[]'::jsonb),
    'tombstones', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'at', x ->> 'id') FROM (
        SELECT DISTINCT jsonb_build_object('id', q.id, 'version', q.version, 'reason', t.reason, 'at', decision.iso(t.tombstoned_at)) x
          FROM rp_cites q JOIN objects.canonical_objects o ON o.object_id = q.id AND o.object_version = q.version
          JOIN observation.blob_tombstones t ON t.manifest_id = (o.payload ->> 'manifest_id')::uuid
         WHERE q.object_type = 'EVD' AND t.tombstoned_at > v_dec AND t.tombstoned_at <= v_asof) s), '[]'::jsonb),
    'reproductions', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'reproduced_at', x ->> 'reproduction_id') FROM (
        SELECT jsonb_build_object('reproduction_id', rp.reproduction_id, 'run_id', rp.run_id, 'verdict', rp.verdict, 'actual_digest', rp.actual_digest, 'reason', rp.reason, 'reproduced_at', decision.iso(rp.reproduced_at)) x
          FROM simulation.reproductions rp WHERE rp.run_id = ANY (v_run_ids) AND rp.reproduced_at > v_dec AND rp.reproduced_at <= v_asof) s), '[]'::jsonb),
    'reconciliations', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'recorded_at', x ->> 'reconciliation_id') FROM (
        SELECT jsonb_build_object('reconciliation_id', rc.reconciliation_id, 'twin_id', rc.twin_id, 'key', rc.key, 'from_version', rc.from_version, 'from_kind', rc.from_kind, 'from_value', rc.from_value,
                                  'against_version', rc.against_version, 'against_value', rc.against_value, 'difference', rc.difference, 'note', rc.note, 'recorded_at', decision.iso(rc.recorded_at)) x
          FROM twin.reconciliations rc
         WHERE rc.recorded_at > v_dec AND rc.recorded_at <= v_asof
           AND EXISTS (SELECT 1 FROM jsonb_array_elements(rc.from_citations) fc WHERE (fc ->> 'kind') = 'run' AND (fc ->> 'id')::uuid = ANY (v_run_ids))) s), '[]'::jsonb),
    'outcomes', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'recorded_at', x ->> 'id') FROM (
        SELECT DISTINCT jsonb_build_object('id', s.strategy_object_id, 'title', s.title, 'statement', s.statement, 'status', s.status, 'recorded_at', decision.iso(d.created_at), 'depends_on', d.depends_on_id) x
          FROM graph.dependencies d JOIN graph.strategy_current s ON s.strategy_object_id = d.dependent_object_id AND s.object_type = 'OUT'
         WHERE d.dependent_type = 'OUT' AND d.depends_on_id IN (c.commitment_id, p.decision_object_id) AND d.created_at > v_dec AND d.created_at <= v_asof) s), '[]'::jsonb),
    'warnings', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'raised_at', x ->> 'warning_id') FROM (
        SELECT jsonb_build_object('warning_id', w.warning_id, 'title', w.title, 'state', w.state, 'branch_id', w.branch_id, 'indicator_id', w.indicator_id, 'routed_to', w.routed_to,
                                  'raised_at', decision.iso(w.raised_at), 'response_window_closes_at', decision.iso(w.response_window_closes_at)) x
          FROM prediction.warnings_current w
         WHERE (w.branch_id = ANY (v_branches) OR w.indicator_id = ANY (v_indicators)) AND w.raised_at > v_dec AND w.raised_at <= v_asof) s), '[]'::jsonb),
    'branch_flips', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'occurred_at', x ->> 'event_id') FROM (
        SELECT jsonb_build_object('event_id', e.event_id, 'branch_id', e.branch_id, 'event', e.event, 'occurred_at', decision.iso(e.occurred_at), 'details', e.details) x
          FROM prediction.scenario_events e WHERE e.branch_id = ANY (v_branches) AND e.event IN ('branch.flipped', 'branch.closed') AND e.occurred_at > v_dec AND e.occurred_at <= v_asof) s), '[]'::jsonb),
    'approval_revocations', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'revoked_at', x ->> 'approval_id') FROM (
        SELECT jsonb_build_object('approval_id', a.approval_id, 'approver', a.approver_principal_id, 'revoked_at', decision.iso(a.revoked_at), 'reason', a.revoked_reason) x
          FROM decision.approvals a WHERE a.package_id = p_package_id AND a.version = p_version AND a.revoked_at > v_dec AND a.revoked_at <= v_asof) s), '[]'::jsonb),
    'assumption_events', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'occurred_at', x ->> 'event_id') FROM (
        SELECT jsonb_build_object('event_id', e.event_id, 'assumption_id', e.strategy_object_id, 'event', e.event, 'state', e.details ->> 'state', 'reason', e.details ->> 'reason', 'occurred_at', decision.iso(e.occurred_at)) x
          FROM graph.strategy_events e WHERE e.strategy_object_id IN (SELECT id FROM rp_cites WHERE object_type = 'ASU') AND e.event LIKE 'assumption.%' AND e.occurred_at > v_dec AND e.occurred_at <= v_asof) s), '[]'::jsonb),
    'twin_events', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'occurred_at', x ->> 'event_id') FROM (
        SELECT DISTINCT jsonb_build_object('event_id', e.event_id, 'twin_id', e.twin_id, 'event', e.event, 'version', (e.details ->> 'version')::int, 'occurred_at', decision.iso(e.occurred_at)) x
          FROM twin.twin_events e JOIN simulation.runs_current r ON r.twin_id = e.twin_id AND (e.details ->> 'version')::int = r.twin_version
         WHERE r.run_id = ANY (v_run_ids) AND e.event IN ('version.unverified', 'version.reverified') AND e.occurred_at > v_dec AND e.occurred_at <= v_asof) s), '[]'::jsonb),
    'package_events', coalesce((SELECT jsonb_agg(x ORDER BY x ->> 'occurred_at', x ->> 'event_id') FROM (
        SELECT jsonb_build_object('event_id', e.event_id, 'event', e.event, 'actor', e.actor_principal_id, 'occurred_at', decision.iso(e.occurred_at), 'details', e.details) x
          FROM decision.package_events e WHERE e.package_id = p_package_id AND e.event NOT IN ('replay.recorded') AND e.occurred_at > v_dec AND e.occurred_at <= v_asof) s), '[]'::jsonb)
  ) INTO v_observed;

  v_content := jsonb_build_object(
    'package_id', p_package_id, 'version', p_version,
    'cutoffs', jsonb_build_object('known_at', decision.iso(v_known), 'observed_through', v_obs, 'decided_at', decision.iso(v_dec), 'as_of', decision.iso(v_asof)),
    'known', v_known_l, 'believed', v_believed, 'tested', v_tested, 'decided', v_decided, 'observed', v_observed, 'excluded', v_excluded);
  v_digest := encode(sha256(convert_to(v_content::text, 'UTF8')), 'hex');
  RETURN jsonb_build_object('content', v_content, 'content_digest', v_digest, 'unavailable', v_unavailable,
                            'summary', jsonb_build_object('known', jsonb_array_length(v_known_l), 'claims', jsonb_array_length(v_believed -> 'claims'), 'forecasts', jsonb_array_length(v_believed -> 'forecasts'),
                                                          'assumptions', jsonb_array_length(v_believed -> 'assumptions'), 'branches', jsonb_array_length(v_believed -> 'branches'),
                                                          'runs', jsonb_array_length(v_tested -> 'runs'), 'reproductions', jsonb_array_length(v_tested -> 'reproductions'),
                                                          'dissent', jsonb_array_length(v_decided -> 'dissent'), 'approvals', jsonb_array_length(v_decided -> 'approvals'),
                                                          'excluded', jsonb_array_length(v_excluded), 'unavailable', jsonb_array_length(v_unavailable)));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.replay_layers(uuid, int, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.replay_layers(uuid, int, timestamptz) TO eye_app, eye_commit;

-- ============================================================
-- 4. Recording a replay.
-- ============================================================
CREATE OR REPLACE FUNCTION decision.record_replay(
  p_replay_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_as_of timestamptz, p_content_digest text, p_header_digest text,
  p_reader uuid, p_purpose text, p_unavailable jsonb, p_summary jsonb, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v record; p record;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.replay']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_reader IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'replay rejected: a replay is recorded for the reading principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND OR p.decided_at IS NULL THEN RAISE EXCEPTION 'replay rejected: the package is not committed' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'replay rejected: no such version' USING ERRCODE = '23503'; END IF;
  INSERT INTO decision.replays (replay_id, scope, tenant_id, domain_id, package_id, version, known_at, observed_through, decided_at, as_of, content_digest, header_digest, reader_principal_id, purpose, unavailable, summary, correlation_id)
  VALUES (p_replay_id, 'DOMAIN', p_tenant, p_domain, p_package_id, p_version, v.known_at, v.observed_through, p.decided_at, p_as_of, p_content_digest, p_header_digest, p_reader, p_purpose, coalesce(p_unavailable, '[]'::jsonb), coalesce(p_summary, '{}'::jsonb), p_correlation);
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'replay.recorded', p_reader,
          jsonb_build_object('version', p_version, 'replay_id', p_replay_id, 'as_of', p_as_of, 'content_digest', p_content_digest, 'unavailable', jsonb_array_length(coalesce(p_unavailable, '[]'::jsonb))), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.record_replay(uuid,uuid,uuid,uuid,int,timestamptz,text,text,uuid,text,jsonb,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.record_replay(uuid,uuid,uuid,uuid,int,timestamptz,text,text,uuid,text,jsonb,jsonb,uuid,uuid) TO eye_commit;

INSERT INTO observation.canonical_write_actions (action, object_types, rationale) VALUES
  ('decision.replay', ARRAY['RPL'], 'A replay admits its own record and nothing else')
ON CONFLICT (action) DO NOTHING;

INSERT INTO objects.schema_registry (object_type, schema_version, json_schema, compatibility) VALUES
('RPL', 'v1', '{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["package_id","version","cutoffs","content_digest","content","invocation"],
  "properties": {
    "package_id": { "type": "string" },
    "version": { "type": "integer", "minimum": 1 },
    "cutoffs": { "type": "object", "required": ["known_at","decided_at","as_of"] },
    "content_digest": { "type": "string", "pattern": "^[0-9a-f]{64}$" },
    "content": { "type": "object", "required": ["known","believed","tested","decided","observed","excluded"] },
    "invocation": { "type": "object", "required": ["reader","purpose","replayed_at","unavailable"] }
  }
}'::jsonb, 'backward')
ON CONFLICT DO NOTHING;

ALTER TABLE decision.replays ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision.replays FORCE ROW LEVEL SECURITY;
CREATE POLICY decision_isolation ON decision.replays
  USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
GRANT SELECT ON decision.replays TO eye_app, eye_commit;
