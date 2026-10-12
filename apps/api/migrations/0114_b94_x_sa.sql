-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0114 §SA — CP-6 B94 part §SA: THE SHARED-RESPONSIBILITY MATRIX AND THE ACCOUNTABLE-OWNER REGISTRY (IA-04-001/-002/-003/-005), GOVERNED SUPPORT
-- ACCESS (PR-69-003, PER-20 — request, approval, the three-layer lapse, the logged diagnostic reads), CUSTOMER-CONTROL DRILLS, THE JOINT
-- EXERCISE AND THE ADMISSION RECORD (IA-04-006), the reads of the CUSTOMER CONTROL CENTER (CAP-TR-12). Applies alone on 0001–0113 + the prelude
-- (0114_b94_onboarding_implementation_service.sql §0); it re-declares NO earlier function.
--
-- THE PATTERN is B34/B34-F's expiring collaborator grant (0090 §W5, 0091 §3–§7): a purpose-bound grant, an expiry TIMER (support_access.expiry,
-- fired by the attention tick's workflow-timers step through the WorkflowTimerRegistry), a SWEEP (the after-tick hook `support-access`) and
-- the IDENTITY revocation of what the ended grant left live (the engineer's sessions — revoked by the identity authority, never written here).
-- Three layers: (1) the engineer's sessions revoked with the grant's end; (2) `service.live_grant` (the prelude's) asked FIRST by every port
-- acting for an engineer, against the database clock — an expired grant is dead before any sweep; (3) the timer + the sweep marking it lapsed.
-- THE SUPPORT ENGINEER is a persistent vendor principal whose only live bindings are `support_engineer` (DOMAIN) — provisioned by the tenant
-- administrator through the Phase 0 principals route (identity.principal.create, one role at creation). A grant never adds a binding
-- (IA-04-003); a principal who also holds a customer role is refused support access (its customer roles could reach what the grant may not).
--
-- THREE CLAIMS, never mixed: CONSTRUCTION (this file, its ports and the harness phase6-support-b94); DEMONSTRATED OPERATION (the act on
-- SYNTHETIC NORDWERK personas — T. Richter's approval, the SYNTHETIC vendor engineer); REAL CUSTOMER ACCEPTANCE / PRODUCTION ADMISSION (R1/R2 —
-- an admission record signed here is construction evidence, never a production admission; IA-04-004 parity is B111).
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §SA.1 COLUMNS ON THE PRELUDE'S TABLES (added, never redefined) ────────────────────────────────────────────────────────────────────────────
-- The grant: the request's DIGEST (the approver decides on it — stale → 409), its expiry timer and review task, the consequence preview the
-- approver saw. The matrix: the tenant contract's support_boundary recorded AT APPROVAL (a later change is drift — never a matrix change).
ALTER TABLE service.support_grants ADD COLUMN request_digest text CHECK (request_digest ~ '^[0-9a-f]{64}$'),
                                   ADD COLUMN expiry_timer_id uuid,
                                   ADD COLUMN review_task_id uuid,
                                   ADD COLUMN preview jsonb;
CREATE UNIQUE INDEX ssg_one_open ON service.support_grants (tenant_id, domain_id, case_id, engineer_principal_id) WHERE state IN ('requested', 'approved');
ALTER TABLE service.responsibility_matrices ADD COLUMN support_boundary jsonb,
                                            ADD COLUMN row_count int;

-- §SA.2 THE VOCABULARY, THE GAP SUBJECT ──────────────────────────────────────────────────────────────────────────────────────────────────
/* The responsibility keys every part uses (the prelude's §0 list) with their ACCOUNTABLE owner role. A vocabulary key keeps its owner role (a
   different owner is a different responsibility — a new key); a new key is the matrix's own. */
CREATE OR REPLACE FUNCTION service.responsibility_vocabulary() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$ SELECT jsonb_build_object(
  'domain.operation', 'domain_admin', 'risk.ownership', 'risk_owner', 'data.migration', 'onboarding_authority', 'support.access', 'domain_admin',
  'evidence.custody', 'data_steward', 'decision.ownership', 'decision_owner') $$;
GRANT EXECUTE ON FUNCTION service.responsibility_vocabulary() TO eye_app, eye_commit;
/* The subject of a responsibility GAP's attention item: one stable id per (domain, responsibility) — the item stays visible until the gap is
   filled (IA-04-005); '*matrix*' names the gap of a domain with no approved matrix at all. */
CREATE OR REPLACE FUNCTION service.gap_subject(p_tenant uuid, p_domain uuid, p_key text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT md5('b94.sa.gap:' || p_tenant::text || ':' || p_domain::text || ':' || p_key)::uuid $$;
GRANT EXECUTE ON FUNCTION service.gap_subject(uuid, uuid, text) TO eye_app, eye_commit;

-- §SA.3 THE TABLES ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* RECONCILIATION (IA-04-002): desired (the signed matrix version) vs observed (live bindings, live grants, the attention policy's routes, the
   domain's agents, the contract's support_boundary). One row per CHANGE of the observed state (the digest), append-only. */
CREATE TABLE service.reconciliation_events (
  event_id          uuid PRIMARY KEY,
  scope             text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  deployment_profile text NOT NULL DEFAULT 'local-dev' CHECK (deployment_profile IN ('local-dev', 'saas', 'private-cloud', 'on-premise')),
  matrix_id         uuid,
  matrix_version    int,
  desired_digest    text CHECK (desired_digest ~ '^[0-9a-f]{64}$'),
  observed          jsonb NOT NULL CHECK (jsonb_typeof(observed) = 'object'),
  observed_digest   text NOT NULL CHECK (observed_digest ~ '^[0-9a-f]{64}$'),
  findings          jsonb NOT NULL CHECK (jsonb_typeof(findings) = 'array'),
  gaps              int NOT NULL CHECK (gaps >= 0),
  drift             int NOT NULL CHECK (drift >= 0),
  items             jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_by       uuid NOT NULL,
  recorded_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id    uuid NOT NULL,
  CONSTRAINT sre_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX sre_domain ON service.reconciliation_events (tenant_id, domain_id, deployment_profile, recorded_at DESC);
CREATE TRIGGER sre_append_only BEFORE UPDATE OR DELETE ON service.reconciliation_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* A CUSTOMER-CONTROL DRILL (CAP-TR-12): the customer exercising its own control — revoke a live grant and PROVE the next act is refused (the
   live-grant test every port asks, probed for every action × object of the grant's scope), or prove an expired grant refused before any
   sweep. Append-only, with its evidence. */
CREATE TABLE service.control_drills (
  drill_id          uuid PRIMARY KEY,
  scope             text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  kind              text NOT NULL CHECK (kind IN ('revoke_live_grant', 'expired_grant_refused')),
  grant_id          uuid NOT NULL REFERENCES service.support_grants (grant_id),
  reason            text NOT NULL CHECK (length(btrim(reason)) >= 8),
  outcome           text NOT NULL CHECK (outcome IN ('passed', 'failed')),
  evidence          jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'object'),
  run_by            uuid NOT NULL,
  run_at            timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id    uuid NOT NULL,
  CONSTRAINT scd_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE TRIGGER scd_append_only BEFORE UPDATE OR DELETE ON service.control_drills FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* A JOINT OPERATING EXERCISE (IA-04-006): customer and vendor participants, what was exercised, the outcome. On SYNTHETIC personas it is a
   demonstration (claim); a real joint exercise for production admission is R1. Append-only. */
CREATE TABLE service.joint_exercises (
  exercise_id       uuid PRIMARY KEY,
  scope             text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  title             text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 200),
  scenario          text NOT NULL CHECK (length(btrim(scenario)) >= 12),
  held_on           date NOT NULL,
  customer_participants uuid[] NOT NULL CHECK (cardinality(customer_participants) >= 1),
  vendor_participants   uuid[] NOT NULL CHECK (cardinality(vendor_participants) >= 1),
  outcome           text NOT NULL CHECK (outcome IN ('completed', 'completed_with_findings', 'failed')),
  findings          text,
  evidence_refs     jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence_refs) = 'array'),
  claim             text NOT NULL DEFAULT 'demonstration' CHECK (claim IN ('demonstration')),
  recorded_by       uuid NOT NULL,
  recorded_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id    uuid NOT NULL,
  CONSTRAINT sjx_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE TRIGGER sjx_append_only BEFORE UPDATE OR DELETE ON service.joint_exercises FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* THE ADMISSION RECORD (IA-04-006): the signed matrix, the support-grant ledger (privileged access) and its access log, the drills, the joint
   exercises — each bound to the configuration BASELINE DIGEST (text: §ON's table may not be on this branch), the deployment profile and the
   period; digested; SIGNED by the onboarding authority (`admission_record`). PRODUCTION ADMISSION ITSELF IS R1 — this record is construction
   evidence (a demonstration on SYNTHETIC personas), stated on the row. Versioned per admission_id. */
CREATE TABLE service.admission_records (
  admission_id      uuid NOT NULL,
  version           int NOT NULL CHECK (version >= 1),
  scope             text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  deployment_profile text NOT NULL CHECK (deployment_profile IN ('local-dev', 'saas', 'private-cloud', 'on-premise')),
  period_from       date NOT NULL,
  period_to         date NOT NULL,
  baseline_digest   text NOT NULL CHECK (baseline_digest ~ '^[0-9a-f]{64}$'),
  matrix            jsonb NOT NULL CHECK (jsonb_typeof(matrix) = 'object'),
  grant_ledger      jsonb NOT NULL CHECK (jsonb_typeof(grant_ledger) = 'object'),
  drills            jsonb NOT NULL CHECK (jsonb_typeof(drills) = 'array'),
  exercises         jsonb NOT NULL CHECK (jsonb_typeof(exercises) = 'array'),
  digest            text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  state             text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'signed', 'rejected', 'superseded')),
  production_admission text NOT NULL DEFAULT 'R1: production admission is external — this record is construction evidence (a demonstration on SYNTHETIC personas)',
  proposed_by       uuid NOT NULL,
  proposed_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_by        uuid,
  decided_at        timestamptz,
  decision_reason   text,
  signature_id      uuid,
  correlation_id    uuid NOT NULL,
  PRIMARY KEY (admission_id, version),
  CONSTRAINT sar_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT sar_period CHECK (period_to >= period_from),
  CONSTRAINT sar_decided CHECK (state IN ('proposed', 'superseded') OR (decided_by IS NOT NULL AND decided_at IS NOT NULL)),
  CONSTRAINT sar_sod CHECK (decided_by IS NULL OR decided_by <> proposed_by),
  CONSTRAINT sar_signed CHECK (state <> 'signed' OR signature_id IS NOT NULL)
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['service.reconciliation_events', 'service.control_drills', 'service.joint_exercises', 'service.admission_records'] LOOP
    EXECUTE format('REVOKE ALL ON %s FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$CREATE POLICY domain_isolation ON %s USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()))$f$, t);
    EXECUTE format('GRANT SELECT ON %s TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- §SA.4 INTERNAL HELPERS ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* The acting principal is the route's (every port). */
CREATE OR REPLACE FUNCTION service._sa_actor(p_noun text, p_actor uuid) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = public, pg_catalog, pg_temp AS $$
BEGIN
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION '% rejected (actor): recorded by the acting principal', p_noun USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION service._sa_actor(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service._sa_actor(text, uuid) TO eye_commit;

/* Is the principal a support engineer (any live support_engineer binding in the tenant)? */
CREATE OR REPLACE FUNCTION service._is_support_engineer(p_principal uuid, p_tenant uuid) RETURNS boolean
STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM identity.role_bindings b WHERE b.principal_id = p_principal AND b.tenant_id = p_tenant AND b.role_code = 'support_engineer' AND b.revoked_at IS NULL)
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION service._is_support_engineer(uuid, uuid) FROM PUBLIC;

/* Raise a responsibility.gap item for (domain, key) unless one is already open (the gap stays ONE visible item until filled); internal. */
CREATE OR REPLACE FUNCTION service._raise_gap(p_tenant uuid, p_domain uuid, p_key text, p_resolution jsonb, p_cause uuid, p_cause_type text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, executive, pg_catalog, pg_temp AS $$
DECLARE v_subject uuid := service.gap_subject(p_tenant, p_domain, p_key); v_open uuid;
BEGIN
  SELECT i.item_id INTO v_open FROM executive.attention_items i
   WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.signal_class = 'responsibility.gap' AND i.subject_id = v_subject AND i.state <> 'closed' LIMIT 1;
  IF v_open IS NOT NULL THEN RETURN jsonb_build_object('item_id', v_open, 'existing', true, 'key', p_key); END IF;
  RETURN executive.b33_raise_routed(p_tenant, p_domain, 'responsibility.gap', 'responsibility_matrix', v_subject,
           CASE WHEN p_key = '*matrix*' THEN 'No approved responsibility matrix for the domain — no accountable owner can be resolved'
                ELSE format('No unambiguous accountable owner: %s (%s)', p_key, coalesce(p_resolution ->> 'state', 'undeclared')) END,
           jsonb_build_array(jsonb_build_object('responsibility', p_key, 'state', p_resolution ->> 'state', 'reason', p_resolution ->> 'reason',
                                                'escalation_path', p_resolution ->> 'escalation_path')),
           NULL, p_cause, p_cause_type,
           jsonb_build_object('responsibility', p_key, 'resolution', p_resolution, 'rule', 'IA-04-005: the dependent act stops; the gap stays visible until filled — never inferred'),
           jsonb_build_object('consequence', 'C2', 'confidence', 1, 'hours_to_window', 24), p_actor, p_correlation) || jsonb_build_object('key', p_key);
END $$;
REVOKE ALL ON FUNCTION service._raise_gap(uuid, uuid, text, jsonb, uuid, text, uuid, uuid) FROM PUBLIC;

/* THE END OF A GRANT (revoked | lapsed | withdrawn): the state, the timer (cancelled unless it is the one being fired), the open review task
   cancelled, the support.access items closed, the ledger event. The engineer's SESSIONS are the identity authority's: the route revokes them
   next and the after-tick hook `support-access` revokes whatever service._support_access_pending still finds. Internal. */
CREATE OR REPLACE FUNCTION service._end_support_grant(p_grant uuid, p_tenant uuid, p_domain uuid, p_state text, p_reason text, p_cancel_timer boolean, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, executive, onboarding, pg_catalog, pg_temp AS $$
DECLARE g service.support_grants%ROWTYPE; v_items jsonb; v_tasks jsonb := '{}'::jsonb;
BEGIN
  SELECT * INTO g FROM service.support_grants x WHERE x.grant_id = p_grant AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  UPDATE service.support_grants SET state = p_state, ended_at = clock_timestamp(), ended_by = p_actor, end_reason = btrim(p_reason) WHERE grant_id = p_grant;
  IF p_cancel_timer AND g.expiry_timer_id IS NOT NULL THEN
    UPDATE executive.workflow_timers SET cancelled_at = clock_timestamp() WHERE timer_id = g.expiry_timer_id AND fired_at IS NULL AND cancelled_at IS NULL;
  END IF;
  IF g.state = 'requested' THEN
    v_tasks := executive._cancel_human_tasks(p_tenant, p_domain, jsonb_build_object('kind', 'support_grant', 'id', p_grant), ARRAY['support.access_review'],
                                             format('the support grant was %s before a decision', p_state), p_actor, p_correlation);
  END IF;
  v_items := executive.b33_close_items(p_tenant, p_domain, 'support.access', 'support_grant', p_grant, format('the support grant is %s: %s', p_state, btrim(p_reason)), p_actor, p_correlation);
  PERFORM onboarding.ledger('service', p_tenant, p_domain, 'support_grant', p_grant, NULL, 'grant.' || p_state, p_actor,
            jsonb_build_object('reason', btrim(p_reason), 'engineer', g.engineer_principal_id, 'case_id', g.case_id, 'prior_state', g.state, 'expires_at', g.expires_at,
                               'items_closed', v_items, 'tasks', v_tasks, 'access', 'the engineer''s sessions are revoked by the identity authority next'), p_correlation);
  RETURN jsonb_build_object('grant_id', p_grant, 'state', p_state, 'engineer', g.engineer_principal_id, 'prior_state', g.state, 'ended_reason', btrim(p_reason));
END $$;
REVOKE ALL ON FUNCTION service._end_support_grant(uuid, uuid, uuid, text, text, boolean, uuid, uuid) FROM PUBLIC;

/* ACCESS STILL TO REVOKE (the 0091 §7 idiom): the engineers of this domain's ENDED grants (revoked, lapsed, withdrawn after approval) who still
   hold an active session ISSUED BEFORE the grant ended. A session opened afterwards is a new sign-in (no grant is live for it unless a new
   one is approved). Internal; read by the sweep and the revoke routes. */
CREATE OR REPLACE FUNCTION service._support_access_pending(p_tenant uuid, p_domain uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = service, identity, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('principal', x.engineer_principal_id, 'grant_id', x.grant_id, 'grant_state', x.state) ORDER BY x.ended_at), '[]'::jsonb)
    FROM (SELECT DISTINCT ON (g.engineer_principal_id) g.engineer_principal_id, g.grant_id, g.state, g.ended_at
            FROM service.support_grants g
           WHERE g.tenant_id = p_tenant AND g.domain_id = p_domain AND g.state IN ('revoked', 'lapsed', 'withdrawn') AND g.decided_at IS NOT NULL AND g.ended_at IS NOT NULL
             AND EXISTS (SELECT 1 FROM identity.sessions s WHERE s.principal_id = g.engineer_principal_id AND s.status = 'active' AND s.expires_at > clock_timestamp()
                                                            AND s.issued_at < g.ended_at)
           ORDER BY g.engineer_principal_id, g.ended_at DESC LIMIT 200) x
$$;
REVOKE ALL ON FUNCTION service._support_access_pending(uuid, uuid) FROM PUBLIC;

-- §SA.5 THE RESPONSIBILITY MATRIX (IA-04-001/-003) ─────────────────────────────────────────────────────────────────────────────────────────
/* PROPOSE a matrix version (the implementation lead or the domain admin): the rows validated (roles exist; a vocabulary key keeps its owner
   role; a vendor role never owns nor holds customer authority; the paths stated; a named owner an active principal of the tenant), digested.
   A change is a NEW version (expected_version guards the race); an open proposal is decided before the next. A support engineer never
   writes a matrix (IA-04-003). Opens the authority's review task. */
CREATE OR REPLACE FUNCTION service.propose_matrix(p_matrix uuid, p_tenant uuid, p_domain uuid, p_programme uuid, p_profile text, p_rows jsonb, p_expected_version int,
                                                  p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, identity, onboarding, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_id uuid; v_cur int; v_open service.responsibility_matrices%ROWTYPE; r jsonb; v_keys text[] := '{}'; v_key text; v_vocab jsonb := service.responsibility_vocabulary();
        v_rows jsonb := '[]'::jsonb; v_digest text; v_version int; v_task jsonb; v_profile text := coalesce(p_profile, 'local-dev'); v_ev uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.matrix.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service._sa_actor('responsibility matrix', p_actor);
  IF service._is_support_engineer(p_actor, p_tenant) THEN
    RAISE EXCEPTION 'responsibility matrix rejected (authority): a support engineer never writes a responsibility matrix (IA-04-003: no silent transfer through a support action)' USING ERRCODE = '42501';
  END IF;
  IF NOT onboarding.holds_role(p_actor, p_tenant, p_domain, ARRAY['implementation_lead', 'domain_admin']) THEN
    RAISE EXCEPTION 'responsibility matrix rejected (authority): a matrix is proposed by the implementation lead or the domain administrator' USING ERRCODE = '42501';
  END IF;
  IF v_profile NOT IN ('local-dev', 'saas', 'private-cloud', 'on-premise') THEN RAISE EXCEPTION 'responsibility matrix rejected (profile): % is not a deployment profile', v_profile USING ERRCODE = '22023'; END IF;
  IF p_programme IS NOT NULL AND NOT EXISTS (SELECT 1 FROM onboarding.programmes x WHERE x.programme_id = p_programme AND x.tenant_id = p_tenant AND x.superseded_at IS NULL) THEN
    RAISE EXCEPTION 'responsibility matrix rejected (unknown_programme): no onboarding programme % in this tenant', p_programme USING ERRCODE = '23503';
  END IF;
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) = 0 OR jsonb_array_length(p_rows) > 60 THEN
    RAISE EXCEPTION 'responsibility matrix rejected (rows): a matrix declares 1–60 responsibilities' USING ERRCODE = '22023';
  END IF;
  FOR r IN SELECT x FROM jsonb_array_elements(p_rows) x LOOP
    v_key := r ->> 'key';
    IF v_key IS NULL OR v_key !~ '^[a-z][a-z0-9_.-]{2,62}$' THEN RAISE EXCEPTION 'responsibility matrix rejected (row): % is not a responsibility key', coalesce(v_key, '<none>') USING ERRCODE = '22023'; END IF;
    IF v_key = ANY (v_keys) THEN RAISE EXCEPTION 'responsibility matrix rejected (row): % is declared twice', v_key USING ERRCODE = '22023'; END IF;
    v_keys := v_keys || v_key;
    IF length(btrim(coalesce(r ->> 'title', ''))) NOT BETWEEN 4 AND 200 THEN RAISE EXCEPTION 'responsibility matrix rejected (row): % has a title (4–200 characters)', v_key USING ERRCODE = '22023'; END IF;
    IF NOT EXISTS (SELECT 1 FROM identity.roles x WHERE x.code = r ->> 'owner_role') OR NOT EXISTS (SELECT 1 FROM identity.roles x WHERE x.code = r ->> 'operator_role')
       OR NOT EXISTS (SELECT 1 FROM identity.roles x WHERE x.code = r ->> 'customer_authority') THEN
      RAISE EXCEPTION 'responsibility matrix rejected (row): % names its owner role, operator role and customer authority among the roles that exist', v_key USING ERRCODE = '22023';
    END IF;
    IF v_vocab ? v_key AND (v_vocab ->> v_key) IS DISTINCT FROM (r ->> 'owner_role') THEN
      RAISE EXCEPTION 'responsibility matrix rejected (vocabulary): % is owned by % in the shared vocabulary — a different owner is a different responsibility (a new key)', v_key, v_vocab ->> v_key USING ERRCODE = '22023';
    END IF;
    IF (r ->> 'owner_role') = 'support_engineer' OR (r ->> 'customer_authority') = 'support_engineer' THEN
      RAISE EXCEPTION 'responsibility matrix rejected (row): % — a vendor support engineer never owns a responsibility nor holds the customer''s authority', v_key USING ERRCODE = '22023';
    END IF;
    FOREACH v_key IN ARRAY ARRAY['access_path', 'evidence_producer', 'escalation_path'] LOOP
      IF length(btrim(coalesce(r ->> v_key, ''))) < 4 THEN RAISE EXCEPTION 'responsibility matrix rejected (row): % states its % (4+ characters)', r ->> 'key', v_key USING ERRCODE = '22023'; END IF;
    END LOOP;
    IF nullif(r ->> 'owner_principal_id', '') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = (r ->> 'owner_principal_id')::uuid AND p.tenant_id = p_tenant AND p.status = 'active') THEN
      RAISE EXCEPTION 'responsibility matrix rejected (row): % names an owner who is not an active principal of the tenant', r ->> 'key' USING ERRCODE = '22023';
    END IF;
    v_rows := v_rows || jsonb_build_object('key', r ->> 'key', 'title', btrim(r ->> 'title'), 'owner_role', r ->> 'owner_role', 'owner_principal_id', nullif(r ->> 'owner_principal_id', ''),
                                           'operator_role', r ->> 'operator_role', 'customer_authority', r ->> 'customer_authority', 'access_path', btrim(r ->> 'access_path'),
                                           'evidence_producer', btrim(r ->> 'evidence_producer'), 'escalation_path', btrim(r ->> 'escalation_path'));
  END LOOP;
  -- the matrix of (tenant, domain, profile): one id, versions under it
  SELECT x.matrix_id, max(x.version) INTO v_id, v_cur FROM service.responsibility_matrices x
   WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.deployment_profile = v_profile GROUP BY x.matrix_id ORDER BY max(x.version) DESC LIMIT 1;
  IF v_id IS NOT NULL AND p_matrix IS NOT NULL AND p_matrix <> v_id THEN
    RAISE EXCEPTION 'responsibility matrix rejected (duplicate): the domain''s % matrix is %', v_profile, v_id USING ERRCODE = '23505';
  END IF;
  v_id := coalesce(v_id, p_matrix, gen_random_uuid()); v_cur := coalesce(v_cur, 0);
  IF p_expected_version IS DISTINCT FROM v_cur THEN
    RAISE EXCEPTION 'responsibility matrix rejected (stale): the matrix is at version % (expected %)', v_cur, coalesce(p_expected_version::text, '<none>') USING ERRCODE = '23505';
  END IF;
  SELECT * INTO v_open FROM service.responsibility_matrices x WHERE x.matrix_id = v_id AND x.state = 'proposed' LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'responsibility matrix rejected (state): version % is proposed and awaits the customer authority''s decision', v_open.version USING ERRCODE = '23505'; END IF;
  v_version := v_cur + 1;
  SELECT jsonb_agg(x ORDER BY x ->> 'key') INTO v_rows FROM jsonb_array_elements(v_rows) x;
  v_digest := onboarding.digest(jsonb_build_object('matrix_id', v_id, 'version', v_version, 'tenant_id', p_tenant, 'domain_id', p_domain, 'profile', v_profile,
                                                   'programme_id', p_programme, 'rows', v_rows));
  INSERT INTO service.responsibility_matrices (matrix_id, version, tenant_id, domain_id, programme_id, deployment_profile, state, digest, proposed_by, correlation_id, row_count)
  VALUES (v_id, v_version, p_tenant, p_domain, p_programme, v_profile, 'proposed', v_digest, p_actor, p_correlation, jsonb_array_length(v_rows));
  INSERT INTO service.responsibility_rows (matrix_id, version, responsibility_key, tenant_id, domain_id, title, owner_role, owner_principal_id, operator_role, customer_authority,
                                           access_path, evidence_producer, escalation_path)
  SELECT v_id, v_version, x ->> 'key', p_tenant, p_domain, x ->> 'title', x ->> 'owner_role', (x ->> 'owner_principal_id')::uuid, x ->> 'operator_role', x ->> 'customer_authority',
         x ->> 'access_path', x ->> 'evidence_producer', x ->> 'escalation_path' FROM jsonb_array_elements(v_rows) x;
  v_task := executive._open_human_task(gen_random_uuid(), p_tenant, p_domain, 'onboarding.approve', format('b94-sa:matrix:%s:%s', v_id, v_version),
              jsonb_build_object('kind', 'responsibility_matrix', 'id', v_id, 'version', v_version, 'digest', v_digest), format('Decide the responsibility matrix v%s', v_version),
              NULL, ARRAY['onboarding_authority'], jsonb_build_object('approver', 'a named human onboarding authority, not the proposer, never an implementation lead'),
              NULL, '{}'::jsonb, NULL, NULL, p_actor, p_correlation);
  v_ev := onboarding.ledger('service', p_tenant, p_domain, 'responsibility_matrix', v_id, v_version, 'matrix.proposed', p_actor,
            jsonb_build_object('digest', v_digest, 'profile', v_profile, 'rows', jsonb_array_length(v_rows), 'programme_id', p_programme, 'task', v_task), p_correlation);
  RETURN jsonb_build_object('matrix_id', v_id, 'version', v_version, 'state', 'proposed', 'digest', v_digest, 'profile', v_profile, 'rows', v_rows, 'task', v_task, 'event_id', v_ev);
END $$;
REVOKE ALL ON FUNCTION service.propose_matrix(uuid, uuid, uuid, uuid, text, jsonb, int, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.propose_matrix(uuid, uuid, uuid, uuid, text, jsonb, int, uuid, uuid) TO eye_commit;

/* DECIDE a proposed version (the onboarding authority — the approver test: a named human, never the proposer, never an implementation lead,
   never an agent — on the EXACT digest; stale → 409). APPROVE needs the signature recorded under this action first (SignatureService, subject
   `responsibility_matrix`, the version's digest, the decider) — named here and verified; the prior approved version is superseded (keeps its
   signature); the contract's support_boundary at approval is recorded on the version. REJECT records the reason. */
CREATE OR REPLACE FUNCTION service.decide_matrix(p_matrix uuid, p_version int, p_tenant uuid, p_domain uuid, p_decision text, p_digest text, p_reason text, p_signature uuid,
                                                 p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, identity, onboarding, executive, commercial, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE m service.responsibility_matrices%ROWTYPE; v_prior int; v_boundary jsonb; v_tasks jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.matrix.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service._sa_actor('responsibility matrix', p_actor);
  SELECT * INTO m FROM service.responsibility_matrices x WHERE x.matrix_id = p_matrix AND x.version = p_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'responsibility matrix rejected (unknown_matrix): no matrix %/v% in this domain', p_matrix, p_version USING ERRCODE = '23503'; END IF;
  PERFORM onboarding.assert_approver('responsibility matrix', p_actor, p_tenant, p_domain, ARRAY['onboarding_authority'], m.proposed_by, 'deciding a responsibility matrix');
  IF m.state <> 'proposed' THEN RAISE EXCEPTION 'responsibility matrix rejected (state): version % is %', p_version, m.state USING ERRCODE = '23505'; END IF;
  IF p_digest IS DISTINCT FROM m.digest THEN
    RAISE EXCEPTION 'responsibility matrix rejected (stale): the decision names digest % but version % is %', left(coalesce(p_digest, '<none>'), 12), p_version, left(m.digest, 12) USING ERRCODE = '23505';
  END IF;
  IF p_decision NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'responsibility matrix rejected (decision): approve or reject' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'responsibility matrix rejected (reason): a decision states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  v_tasks := executive._resolve_human_tasks(p_tenant, p_domain, jsonb_build_object('kind', 'responsibility_matrix', 'id', p_matrix, 'version', p_version), ARRAY['onboarding.approve'],
                                            p_decision || 'd', p_matrix, p_actor, p_correlation);
  IF p_decision = 'reject' THEN
    UPDATE service.responsibility_matrices SET state = 'rejected', decided_by = p_actor, decided_at = clock_timestamp(), decision_reason = btrim(p_reason) WHERE matrix_id = p_matrix AND version = p_version;
    PERFORM onboarding.ledger('service', p_tenant, p_domain, 'responsibility_matrix', p_matrix, p_version, 'matrix.rejected', p_actor,
              jsonb_build_object('digest', m.digest, 'reason', btrim(p_reason), 'tasks', v_tasks), p_correlation);
    RETURN jsonb_build_object('matrix_id', p_matrix, 'version', p_version, 'state', 'rejected', 'digest', m.digest);
  END IF;
  IF p_signature IS NULL OR NOT EXISTS (SELECT 1 FROM executive.signatures s WHERE s.signature_id = p_signature AND s.subject_kind = 'responsibility_matrix' AND s.subject_id = p_matrix
                                                   AND s.subject_version = p_version AND s.subject_digest = m.digest AND s.signer = p_actor AND s.bound_action = 'service.matrix.decide') THEN
    RAISE EXCEPTION 'responsibility matrix rejected (signature): the approval carries the decider''s signature over the version''s digest' USING ERRCODE = '22023';
  END IF;
  SELECT x.version INTO v_prior FROM service.responsibility_matrices x WHERE x.matrix_id = p_matrix AND x.state = 'approved' FOR UPDATE;
  IF v_prior IS NOT NULL THEN UPDATE service.responsibility_matrices SET state = 'superseded' WHERE matrix_id = p_matrix AND version = v_prior; END IF;
  -- the tenant contract's support boundary NOW (descriptive: a later change is drift, never a matrix change — IA-04-003)
  SELECT jsonb_build_object('contract_id', c.contract_id, 'version', c.version, 'tier', c.support_boundary ->> 'tier', 'digest', onboarding.digest(c.support_boundary)) INTO v_boundary
    FROM commercial.contracts c WHERE c.tenant_id = p_tenant AND c.status = 'active' ORDER BY c.effective_from DESC, c.version DESC LIMIT 1;
  UPDATE service.responsibility_matrices SET state = 'approved', decided_by = p_actor, decided_at = clock_timestamp(), decision_reason = btrim(p_reason), signature_id = p_signature,
         support_boundary = v_boundary WHERE matrix_id = p_matrix AND version = p_version;
  PERFORM onboarding.ledger('service', p_tenant, p_domain, 'responsibility_matrix', p_matrix, p_version, 'matrix.approved', p_actor,
            jsonb_build_object('digest', m.digest, 'signature_id', p_signature, 'supersedes', v_prior, 'reason', btrim(p_reason), 'support_boundary', v_boundary, 'tasks', v_tasks), p_correlation);
  RETURN jsonb_build_object('matrix_id', p_matrix, 'version', p_version, 'state', 'approved', 'digest', m.digest, 'signature_id', p_signature, 'supersedes', v_prior, 'support_boundary', v_boundary);
END $$;
REVOKE ALL ON FUNCTION service.decide_matrix(uuid, int, uuid, uuid, text, text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.decide_matrix(uuid, int, uuid, uuid, text, text, text, uuid, uuid, uuid) TO eye_commit;

-- §SA.6 THE OWNER REGISTRY AND RECONCILIATION (IA-04-002/-005) ─────────────────────────────────────────────────────────────────────────────
/* THE OBSERVED STATE (a definer read, guarded by the read scope): the approved matrix (desired) and, per row, the owner resolved LIVE plus
   the holders of its operator role and customer authority; the support engineers and their other roles; the live grants; the attention
   policy's routes for the support and gap classes; the domain's agents and whether their owners are live; the tenant contract's support
   boundary. Nothing volatile (no read instant) — its digest changes only when the state does. */
CREATE OR REPLACE FUNCTION service.observe_responsibility(p_tenant uuid, p_domain uuid, p_profile text DEFAULT 'local-dev') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = service, identity, executive, commercial, onboarding, pg_catalog, pg_temp AS $$
DECLARE m service.responsibility_matrices%ROWTYPE; v_rows jsonb := '[]'::jsonb; v_pol executive.attention_policies%ROWTYPE; v_routes jsonb := '{}'::jsonb; c text;
        v_holders int; v_roles jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the observed responsibility state of a domain');
  SELECT * INTO m FROM service.responsibility_matrices x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.deployment_profile = coalesce(p_profile, 'local-dev') AND x.state = 'approved';
  IF FOUND THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'key', r.responsibility_key, 'title', r.title, 'owner_role', r.owner_role, 'owner_principal_id', r.owner_principal_id, 'operator_role', r.operator_role,
             'customer_authority', r.customer_authority, 'escalation_path', r.escalation_path,
             'resolution', service.owner_resolution(p_tenant, p_domain, r.responsibility_key, m.deployment_profile) - 'title',
             'operator_holders', (SELECT count(DISTINCT b.principal_id) FROM identity.role_bindings b JOIN identity.principals p ON p.id = b.principal_id
                                   WHERE b.role_code = r.operator_role AND b.revoked_at IS NULL AND p.status = 'active' AND b.tenant_id = p_tenant AND (b.scope = 'TENANT' OR b.domain_id = p_domain)),
             'authority_holders', (SELECT count(DISTINCT b.principal_id) FROM identity.role_bindings b JOIN identity.principals p ON p.id = b.principal_id
                                    WHERE b.role_code = r.customer_authority AND b.revoked_at IS NULL AND p.status = 'active' AND b.tenant_id = p_tenant AND (b.scope = 'TENANT' OR b.domain_id = p_domain)))
             ORDER BY r.responsibility_key), '[]'::jsonb) INTO v_rows
      FROM service.responsibility_rows r WHERE r.matrix_id = m.matrix_id AND r.version = m.version;
  END IF;
  SELECT * INTO v_pol FROM executive.attention_policies a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.state = 'active';
  FOREACH c IN ARRAY ARRAY['support.access', 'responsibility.gap'] LOOP
    v_roles := CASE WHEN v_pol.policy_id IS NULL THEN NULL ELSE v_pol.rules -> 'classes' -> c -> 'route_roles' END;
    SELECT count(DISTINCT b.principal_id) INTO v_holders FROM identity.role_bindings b JOIN identity.principals p ON p.id = b.principal_id
     WHERE v_roles IS NOT NULL AND b.role_code IN (SELECT jsonb_array_elements_text(v_roles)) AND b.revoked_at IS NULL AND p.status = 'active' AND p.kind = 'human'
       AND b.tenant_id = p_tenant AND (b.scope = 'TENANT' OR b.domain_id = p_domain);
    v_routes := v_routes || jsonb_build_object(c, jsonb_build_object('route_roles', v_roles, 'holders', v_holders));
  END LOOP;
  RETURN jsonb_build_object(
    'profile', coalesce(p_profile, 'local-dev'),
    'matrix', CASE WHEN m.matrix_id IS NULL THEN NULL ELSE jsonb_build_object('matrix_id', m.matrix_id, 'version', m.version, 'digest', m.digest, 'signature_id', m.signature_id,
                                                                              'support_boundary', m.support_boundary) END,
    'rows', v_rows,
    'vocabulary', service.responsibility_vocabulary(),
    'engineers', (SELECT coalesce(jsonb_agg(jsonb_build_object('principal', e.principal_id,
                    'other_roles', (SELECT coalesce(jsonb_agg(DISTINCT b2.role_code ORDER BY b2.role_code), '[]'::jsonb) FROM identity.role_bindings b2
                                     WHERE b2.principal_id = e.principal_id AND b2.revoked_at IS NULL AND b2.tenant_id = p_tenant AND b2.role_code <> 'support_engineer'))
                    ORDER BY e.principal_id), '[]'::jsonb)
                    FROM (SELECT DISTINCT b.principal_id FROM identity.role_bindings b JOIN identity.principals p ON p.id = b.principal_id
                           WHERE b.role_code = 'support_engineer' AND b.revoked_at IS NULL AND p.status = 'active' AND b.tenant_id = p_tenant AND b.domain_id = p_domain) e),
    'live_grants', (SELECT coalesce(jsonb_agg(jsonb_build_object('grant_id', g.grant_id, 'engineer', g.engineer_principal_id, 'case_id', g.case_id,
                      'engineer_holds_role', onboarding.holds_role(g.engineer_principal_id, p_tenant, p_domain, ARRAY['support_engineer'])) ORDER BY g.grant_id), '[]'::jsonb)
                      FROM service.support_grants g WHERE g.tenant_id = p_tenant AND g.domain_id = p_domain AND g.state = 'approved' AND clock_timestamp() < g.expires_at),
    'routes', jsonb_build_object('policy_version', v_pol.version) || v_routes,
    'agents', (SELECT coalesce(jsonb_agg(jsonb_build_object('agent_id', a.agent_id, 'kind', a.agent_kind, 'owner', a.owner_principal_id,
                 'owner_active', decision.is_active_human(a.owner_principal_id, p_tenant),
                 'escalation_active', a.escalation_principal_id IS NULL OR decision.is_active_human(a.escalation_principal_id, p_tenant)) ORDER BY a.agent_id), '[]'::jsonb)
                 FROM executive.agents a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.status = 'active'),
    'support_boundary', (SELECT jsonb_build_object('contract_id', c2.contract_id, 'version', c2.version, 'tier', c2.support_boundary ->> 'tier', 'digest', onboarding.digest(c2.support_boundary))
                           FROM commercial.contracts c2 WHERE c2.tenant_id = p_tenant AND c2.status = 'active' ORDER BY c2.effective_from DESC, c2.version DESC LIMIT 1));
END $$;
REVOKE ALL ON FUNCTION service.observe_responsibility(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.observe_responsibility(uuid, uuid, text) TO eye_app, eye_commit;

/* RECORD a reconciliation (the after-tick hook `responsibility-reconcile` or a person's "reconcile now"): the observation READ FIRST in its
   own governed read and its findings computed (support-logic.ts) are recorded ONLY WHEN THE OBSERVED DIGEST CHANGED. The gaps are decided
   HERE, live, from owner_resolution (never from the caller's findings): every declared responsibility not `resolved` — and a domain with no
   approved matrix — keeps ONE open `responsibility.gap` item; a gap filled closes its item. An observation of a superseded matrix is stale. */
CREATE OR REPLACE FUNCTION service.record_reconciliation(p_event uuid, p_tenant uuid, p_domain uuid, p_profile text, p_observed jsonb, p_findings jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, executive, onboarding, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE m service.responsibility_matrices%ROWTYPE; v_digest text; v_last service.reconciliation_events%ROWTYPE; r service.responsibility_rows%ROWTYPE; v_res jsonb;
        v_raised jsonb := '[]'::jsonb; v_closed jsonb := '[]'::jsonb; v_gaps int := 0; v_drift int; v_profile text := coalesce(p_profile, 'local-dev'); x jsonb; v_subject uuid; v_closed_one jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.responsibility.reconcile']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service._sa_actor('accountable owner', p_actor);
  IF jsonb_typeof(p_observed) IS DISTINCT FROM 'object' OR jsonb_typeof(p_findings) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'accountable owner rejected (observation): an observed state (object) and its findings (array)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO m FROM service.responsibility_matrices x2 WHERE x2.tenant_id = p_tenant AND x2.domain_id = p_domain AND x2.deployment_profile = v_profile AND x2.state = 'approved';
  IF ((p_observed -> 'matrix' ->> 'version')::int) IS DISTINCT FROM m.version OR ((p_observed -> 'matrix' ->> 'matrix_id')::uuid) IS DISTINCT FROM m.matrix_id THEN
    RAISE EXCEPTION 'accountable owner rejected (stale): the observation read matrix v% but v% is approved now — read again', coalesce(p_observed -> 'matrix' ->> 'version', '<none>'),
      coalesce(m.version::text, '<none>') USING ERRCODE = '23505';
  END IF;
  v_digest := onboarding.digest(p_observed);
  SELECT * INTO v_last FROM service.reconciliation_events e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.deployment_profile = v_profile ORDER BY e.recorded_at DESC LIMIT 1;
  IF v_last.event_id IS NOT NULL AND v_last.observed_digest = v_digest THEN
    RETURN jsonb_build_object('recorded', false, 'unchanged', true, 'event_id', v_last.event_id, 'observed_digest', v_digest, 'since', v_last.recorded_at);
  END IF;
  -- THE GAPS, decided live
  IF m.matrix_id IS NULL THEN
    v_gaps := 1;
    v_raised := v_raised || service._raise_gap(p_tenant, p_domain, '*matrix*', jsonb_build_object('state', 'undeclared', 'reason', 'the domain has no approved responsibility matrix'),
                                              p_event, 'reconciliation.recorded', p_actor, p_correlation);
  ELSE
    v_closed := v_closed || executive.b33_close_items(p_tenant, p_domain, 'responsibility.gap', 'responsibility_matrix', service.gap_subject(p_tenant, p_domain, '*matrix*'),
                                                      format('matrix v%s approved', m.version), p_actor, p_correlation);
    FOR r IN SELECT * FROM service.responsibility_rows rr WHERE rr.matrix_id = m.matrix_id AND rr.version = m.version ORDER BY rr.responsibility_key LOOP
      v_res := service.owner_resolution(p_tenant, p_domain, r.responsibility_key, v_profile);
      v_subject := service.gap_subject(p_tenant, p_domain, r.responsibility_key);
      IF v_res ->> 'state' = 'resolved' THEN
        v_closed_one := executive.b33_close_items(p_tenant, p_domain, 'responsibility.gap', 'responsibility_matrix', v_subject,
                          format('filled: %s holds %s', v_res -> 'principals' ->> 0, r.owner_role), p_actor, p_correlation);
        v_closed := v_closed || v_closed_one;
      ELSE
        v_gaps := v_gaps + 1;
        v_raised := v_raised || service._raise_gap(p_tenant, p_domain, r.responsibility_key, v_res, p_event, 'reconciliation.recorded', p_actor, p_correlation);
      END IF;
    END LOOP;
  END IF;
  SELECT count(*) INTO v_drift FROM jsonb_array_elements(p_findings) f WHERE coalesce(f ->> 'class', '') = 'drift';
  INSERT INTO service.reconciliation_events (event_id, tenant_id, domain_id, deployment_profile, matrix_id, matrix_version, desired_digest, observed, observed_digest, findings, gaps, drift, items,
                                             recorded_by, correlation_id)
  VALUES (p_event, p_tenant, p_domain, v_profile, m.matrix_id, m.version, m.digest, p_observed, v_digest, p_findings, v_gaps, v_drift,
          jsonb_build_object('raised', v_raised, 'closed', v_closed), p_actor, p_correlation);
  PERFORM onboarding.ledger('service', p_tenant, p_domain, 'reconciliation', p_event, m.version, 'reconciliation.recorded', p_actor,
            jsonb_build_object('observed_digest', v_digest, 'desired_digest', m.digest, 'gaps', v_gaps, 'drift', v_drift, 'raised', v_raised, 'closed', v_closed), p_correlation);
  RETURN jsonb_build_object('recorded', true, 'event_id', p_event, 'observed_digest', v_digest, 'desired_digest', m.digest, 'matrix_version', m.version, 'gaps', v_gaps, 'drift', v_drift,
                            'raised', v_raised, 'closed', v_closed);
END $$;
REVOKE ALL ON FUNCTION service.record_reconciliation(uuid, uuid, uuid, text, jsonb, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.record_reconciliation(uuid, uuid, uuid, text, jsonb, jsonb, uuid, uuid) TO eye_commit;

-- §SA.7 SUPPORT ACCESS (PR-69-003, PER-20) ─────────────────────────────────────────────────────────────────────────────────────────────────
/* REQUEST (the support engineer, for one case): purpose, object scope (named source ids of this domain), action scope ⊆ grant_actions(),
   duration 15 min – 24 h. The engineer is an active HUMAN holding support_engineer in the domain and NO customer role in the tenant (a
   grant never widens what its holder reaches; a member's roles would). Digested; the domain admin's review task and a `support.access` item
   (named to the accountable owner of support.access when resolved) opened. */
CREATE OR REPLACE FUNCTION service.request_support_grant(p_grant uuid, p_tenant uuid, p_domain uuid, p_case uuid, p_purpose text, p_object_scope jsonb, p_actions text[], p_minutes int,
                                                         p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, identity, onboarding, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c service.cases%ROWTYPE; v_sources uuid[]; v_actions text[]; v_digest text; v_other text[]; v_task jsonb; v_item jsonb; v_owner jsonb; v_ev uuid; s uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.grant.request']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service._sa_actor('support grant', p_actor);
  IF onboarding.principal_kind(p_actor) IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION 'support grant rejected (actor): support access is requested by a named human support engineer, never an agent' USING ERRCODE = '42501';
  END IF;
  IF NOT onboarding.holds_role(p_actor, p_tenant, p_domain, ARRAY['support_engineer']) THEN
    RAISE EXCEPTION 'support grant rejected (authority): support access is requested by a support engineer of the domain' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(array_agg(DISTINCT b.role_code ORDER BY b.role_code), '{}') INTO v_other FROM identity.role_bindings b
   WHERE b.principal_id = p_actor AND b.tenant_id = p_tenant AND b.revoked_at IS NULL AND b.role_code <> 'support_engineer';
  IF cardinality(v_other) > 0 THEN
    RAISE EXCEPTION 'support grant rejected (access): a support engineer holds no customer role (this principal also holds %) — support access never rides on a member''s roles', array_to_string(v_other, ', ') USING ERRCODE = '42501';
  END IF;
  SELECT * INTO c FROM service.cases x WHERE x.case_id = p_case AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'support grant rejected (unknown_case): no case % in this domain', p_case USING ERRCODE = '23503'; END IF;
  IF c.state = 'closed' THEN RAISE EXCEPTION 'support grant rejected (state): case % is closed', c.case_ref USING ERRCODE = '23505'; END IF;
  IF length(btrim(coalesce(p_purpose, ''))) < 12 THEN RAISE EXCEPTION 'support grant rejected (purpose): a grant states its purpose (12+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_minutes IS NULL OR p_minutes < 15 OR p_minutes > 1440 THEN RAISE EXCEPTION 'support grant rejected (duration): a grant lasts 15 minutes to 24 hours (asked %)', coalesce(p_minutes::text, '<none>') USING ERRCODE = '22023'; END IF;
  SELECT array_agg(DISTINCT a ORDER BY a) INTO v_actions FROM unnest(coalesce(p_actions, '{}')) a;
  IF v_actions IS NULL OR NOT (v_actions <@ service.grant_actions()) THEN
    RAISE EXCEPTION 'support grant rejected (actions): the action scope is a non-empty subset of % ', array_to_string(service.grant_actions(), ', ') USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_object_scope) IS DISTINCT FROM 'object' OR jsonb_typeof(p_object_scope -> 'sources') IS DISTINCT FROM 'array' OR jsonb_array_length(p_object_scope -> 'sources') = 0
     OR (SELECT count(*) FROM jsonb_object_keys(p_object_scope)) <> 1 THEN
    RAISE EXCEPTION 'support grant rejected (objects): the object scope names the sources it may read: {"sources": [id, …]}' USING ERRCODE = '22023';
  END IF;
  BEGIN
    SELECT array_agg(DISTINCT x::uuid ORDER BY x::uuid) INTO v_sources FROM jsonb_array_elements_text(p_object_scope -> 'sources') x;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'support grant rejected (objects): a source is named by its id' USING ERRCODE = '22023';
  END;
  FOREACH s IN ARRAY v_sources LOOP
    IF NOT EXISTS (SELECT 1 FROM observation.source_contracts_current sc WHERE sc.source_id = s AND sc.tenant_id = p_tenant AND sc.domain_id = p_domain) THEN
      RAISE EXCEPTION 'support grant rejected (unknown_source): % is not a source of this domain', s USING ERRCODE = '23503';
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM service.support_grants g WHERE g.tenant_id = p_tenant AND g.domain_id = p_domain AND g.case_id = p_case AND g.engineer_principal_id = p_actor
               AND (g.state = 'requested' OR (g.state = 'approved' AND clock_timestamp() < g.expires_at))) THEN
    RAISE EXCEPTION 'support grant rejected (duplicate): this engineer already holds an open grant for case %', c.case_ref USING ERRCODE = '23505';
  END IF;
  v_digest := onboarding.digest(jsonb_build_object('grant_id', p_grant, 'case_id', p_case, 'engineer', p_actor, 'purpose', btrim(p_purpose), 'sources', to_jsonb(v_sources),
                                                   'actions', to_jsonb(v_actions), 'minutes', p_minutes));
  INSERT INTO service.support_grants (grant_id, tenant_id, domain_id, case_id, engineer_principal_id, purpose, object_scope, action_scope, duration_minutes, state, request_digest, correlation_id)
  VALUES (p_grant, p_tenant, p_domain, p_case, p_actor, btrim(p_purpose), jsonb_build_object('sources', to_jsonb(v_sources)), v_actions, p_minutes, 'requested', v_digest, p_correlation);
  v_ev := onboarding.ledger('service', p_tenant, p_domain, 'support_grant', p_grant, NULL, 'grant.requested', p_actor,
            jsonb_build_object('case_id', p_case, 'case_ref', c.case_ref, 'purpose', btrim(p_purpose), 'sources', to_jsonb(v_sources), 'actions', to_jsonb(v_actions), 'minutes', p_minutes,
                               'request_digest', v_digest), p_correlation);
  v_task := executive._open_human_task(gen_random_uuid(), p_tenant, p_domain, 'support.access_review', format('b94-sa:grant:%s', p_grant),
              jsonb_build_object('kind', 'support_grant', 'id', p_grant, 'case_id', p_case, 'digest', v_digest), format('Review support access for %s (%s min)', c.case_ref, p_minutes),
              NULL, ARRAY['domain_admin'], jsonb_build_object('approver', 'a named human domain administrator — the accountable owner of support.access; never the engineer'),
              NULL, '{}'::jsonb, NULL, NULL, p_actor, p_correlation);
  UPDATE service.support_grants SET review_task_id = (v_task ->> 'task_id')::uuid WHERE grant_id = p_grant;
  v_owner := service.owner_resolution(p_tenant, p_domain, 'support.access');
  v_item := executive.b33_raise_routed(p_tenant, p_domain, 'support.access', 'support_grant', p_grant, format('Support access requested for %s — awaiting the customer''s decision', c.case_ref),
              jsonb_build_array(jsonb_build_object('purpose', btrim(p_purpose), 'minutes', p_minutes, 'actions', to_jsonb(v_actions), 'owner', v_owner ->> 'state')),
              CASE WHEN v_owner ->> 'state' = 'resolved' THEN (v_owner -> 'principals' ->> 0)::uuid END, v_ev, 'grant.requested',
              jsonb_build_object('case_id', p_case, 'request_digest', v_digest), NULL, p_actor, p_correlation);
  RETURN jsonb_build_object('grant_id', p_grant, 'state', 'requested', 'case_id', p_case, 'case_ref', c.case_ref, 'purpose', btrim(p_purpose), 'object_scope', jsonb_build_object('sources', to_jsonb(v_sources)),
                            'action_scope', to_jsonb(v_actions), 'duration_minutes', p_minutes, 'request_digest', v_digest, 'task', v_task, 'item', v_item, 'owner', v_owner);
END $$;
REVOKE ALL ON FUNCTION service.request_support_grant(uuid, uuid, uuid, uuid, text, jsonb, text[], int, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.request_support_grant(uuid, uuid, uuid, uuid, text, jsonb, text[], int, uuid, uuid) TO eye_commit;

/* DECIDE (approve | deny) — the domain administrator: the approver test (a named human, never the engineer, never an implementation lead,
   never an agent), on the request's EXACT digest (stale → 409). APPROVE is HELD while the accountable owner of `support.access` is not
   `resolved` (IA-04-005: the act stops, the gap is raised and stays visible) and is the RESOLVED OWNER's act; the window starts now; the
   `support_access.expiry` timer is scheduled; the review task resolved and the support.access item closed; the preview the approver saw is
   recorded. A held approval is ANSWERED (held: true) so that its gap item and ledger event commit — the route then refuses 409 `held`. */
CREATE OR REPLACE FUNCTION service.decide_support_grant(p_grant uuid, p_tenant uuid, p_domain uuid, p_decision text, p_digest text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, identity, onboarding, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE g service.support_grants%ROWTYPE; c service.cases%ROWTYPE; v_owner jsonb; v_timer uuid; v_tasks jsonb; v_items jsonb; v_gap jsonb; v_ev uuid; v_preview jsonb; v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.grant.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service._sa_actor('support grant', p_actor);
  SELECT * INTO g FROM service.support_grants x WHERE x.grant_id = p_grant AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'support grant rejected (unknown_grant): no grant % in this domain', p_grant USING ERRCODE = '23503'; END IF;
  PERFORM onboarding.assert_approver('support grant', p_actor, p_tenant, p_domain, ARRAY['domain_admin'], g.engineer_principal_id, 'deciding support access');
  IF g.state <> 'requested' THEN RAISE EXCEPTION 'support grant rejected (state): the grant is %', g.state USING ERRCODE = '23505'; END IF;
  IF p_digest IS DISTINCT FROM g.request_digest THEN
    RAISE EXCEPTION 'support grant rejected (stale): the decision names digest % but the request is %', left(coalesce(p_digest, '<none>'), 12), left(g.request_digest, 12) USING ERRCODE = '23505';
  END IF;
  IF p_decision NOT IN ('approve', 'deny') THEN RAISE EXCEPTION 'support grant rejected (decision): approve or deny' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'support grant rejected (reason): a decision states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO c FROM service.cases x WHERE x.case_id = g.case_id;
  IF p_decision = 'deny' THEN
    UPDATE service.support_grants SET state = 'denied', decided_by = p_actor, decided_at = v_now, decision_reason = btrim(p_reason) WHERE grant_id = p_grant;
    v_tasks := executive._resolve_human_tasks(p_tenant, p_domain, jsonb_build_object('kind', 'support_grant', 'id', p_grant), ARRAY['support.access_review'], 'denied', p_grant, p_actor, p_correlation);
    v_items := executive.b33_close_items(p_tenant, p_domain, 'support.access', 'support_grant', p_grant, 'support access denied by the customer', p_actor, p_correlation);
    PERFORM onboarding.ledger('service', p_tenant, p_domain, 'support_grant', p_grant, NULL, 'grant.denied', p_actor,
              jsonb_build_object('reason', btrim(p_reason), 'request_digest', g.request_digest, 'tasks', v_tasks, 'items_closed', v_items), p_correlation);
    RETURN jsonb_build_object('grant_id', p_grant, 'state', 'denied', 'decided_by', p_actor, 'request_digest', g.request_digest);
  END IF;
  IF c.state = 'closed' THEN RAISE EXCEPTION 'support grant rejected (state): case % is closed — no access for a closed case', c.case_ref USING ERRCODE = '23505'; END IF;
  -- IA-04-005: no unambiguous accountable owner of support access → HOLD (the gap raised and kept visible; nothing approved)
  v_owner := service.owner_resolution(p_tenant, p_domain, 'support.access');
  IF v_owner ->> 'state' IS DISTINCT FROM 'resolved' THEN
    v_ev := onboarding.ledger('service', p_tenant, p_domain, 'support_grant', p_grant, NULL, 'grant.held', p_actor,
              jsonb_build_object('blocking', jsonb_build_array(jsonb_build_object('responsibility', 'support.access', 'state', v_owner ->> 'state', 'reason', v_owner ->> 'reason')),
                                 'request_digest', g.request_digest), p_correlation);
    v_gap := service._raise_gap(p_tenant, p_domain, 'support.access', v_owner, v_ev, 'grant.held', p_actor, p_correlation);
    RETURN jsonb_build_object('grant_id', p_grant, 'state', 'requested', 'held', true, 'owner', v_owner, 'gap', v_gap,
                              'blocking', jsonb_build_array(jsonb_build_object('responsibility', 'support.access', 'state', v_owner ->> 'state', 'reason', v_owner ->> 'reason',
                                                                               'escalation_path', v_owner ->> 'escalation_path')));
  END IF;
  IF NOT (p_actor = ANY (ARRAY(SELECT jsonb_array_elements_text(v_owner -> 'principals'))::uuid[])) OR (v_owner ->> 'owner_principal_id' IS NOT NULL AND (v_owner ->> 'owner_principal_id')::uuid <> p_actor) THEN
    RAISE EXCEPTION 'support grant rejected (authority): support access is approved by the accountable owner of support.access (%), not by another administrator', v_owner -> 'principals' ->> 0 USING ERRCODE = '42501';
  END IF;
  v_preview := jsonb_build_object('case_ref', c.case_ref, 'severity', c.severity, 'purpose', g.purpose, 'object_scope', g.object_scope, 'action_scope', to_jsonb(g.action_scope),
                                  'starts_at', v_now, 'expires_at', v_now + make_interval(mins => g.duration_minutes), 'duration_minutes', g.duration_minutes,
                                  'cannot', 'mutate customer decisions, evidence, policy or source state; read evidence content; read another source',
                                  'lapse', 'the session revoked with the grant; every port asks live_grant on the database clock; the support_access.expiry timer and the sweep mark it lapsed');
  v_timer := executive._schedule_timer(gen_random_uuid(), p_tenant, p_domain, 'grant', p_grant, 'support_access.expiry', v_now + make_interval(mins => g.duration_minutes),
                                       jsonb_build_object('support_grant', p_grant, 'engineer', g.engineer_principal_id), p_actor, p_correlation);
  UPDATE service.support_grants SET state = 'approved', decided_by = p_actor, decided_at = v_now, decision_reason = btrim(p_reason), starts_at = v_now,
         expires_at = v_now + make_interval(mins => g.duration_minutes), expiry_timer_id = v_timer, preview = v_preview WHERE grant_id = p_grant;
  v_tasks := executive._resolve_human_tasks(p_tenant, p_domain, jsonb_build_object('kind', 'support_grant', 'id', p_grant), ARRAY['support.access_review'], 'approved', p_grant, p_actor, p_correlation);
  v_items := executive.b33_close_items(p_tenant, p_domain, 'support.access', 'support_grant', p_grant, 'support access approved by the accountable owner', p_actor, p_correlation);
  v_items := v_items || executive.b33_close_items(p_tenant, p_domain, 'responsibility.gap', 'responsibility_matrix', service.gap_subject(p_tenant, p_domain, 'support.access'),
                                                  'the accountable owner of support.access is resolved and approved', p_actor, p_correlation);
  PERFORM onboarding.ledger('service', p_tenant, p_domain, 'support_grant', p_grant, NULL, 'grant.approved', p_actor,
            jsonb_build_object('reason', btrim(p_reason), 'request_digest', g.request_digest, 'preview', v_preview, 'timer', v_timer, 'owner', v_owner, 'tasks', v_tasks, 'items_closed', v_items), p_correlation);
  RETURN jsonb_build_object('grant_id', p_grant, 'state', 'approved', 'decided_by', p_actor, 'starts_at', v_now, 'expires_at', v_now + make_interval(mins => g.duration_minutes),
                            'expiry_timer_id', v_timer, 'preview', v_preview, 'request_digest', g.request_digest, 'held', false);
END $$;
REVOKE ALL ON FUNCTION service.decide_support_grant(uuid, uuid, uuid, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.decide_support_grant(uuid, uuid, uuid, text, text, text, uuid, uuid) TO eye_commit;

/* REVOKE (the domain administrator — a named human, never the engineer): immediate; the timer cancelled; the engineer's sessions revoked by
   the route next (identity authority). WITHDRAW (the engineer, its own requested or approved grant). */
CREATE OR REPLACE FUNCTION service.revoke_support_grant(p_grant uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, onboarding, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE g service.support_grants%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.grant.revoke']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service._sa_actor('support grant', p_actor);
  SELECT * INTO g FROM service.support_grants x WHERE x.grant_id = p_grant AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'support grant rejected (unknown_grant): no grant % in this domain', p_grant USING ERRCODE = '23503'; END IF;
  PERFORM onboarding.assert_approver('support grant', p_actor, p_tenant, p_domain, ARRAY['domain_admin'], g.engineer_principal_id, 'revoking support access');
  IF g.state <> 'approved' THEN RAISE EXCEPTION 'support grant rejected (state): only an approved grant is revoked (the grant is %)', g.state USING ERRCODE = '23505'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'support grant rejected (reason): a revocation states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  RETURN service._end_support_grant(p_grant, p_tenant, p_domain, 'revoked', p_reason, true, p_actor, p_correlation);
END $$;
REVOKE ALL ON FUNCTION service.revoke_support_grant(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.revoke_support_grant(uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION service.withdraw_support_grant(p_grant uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, onboarding, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE g service.support_grants%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.grant.withdraw']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service._sa_actor('support grant', p_actor);
  SELECT * INTO g FROM service.support_grants x WHERE x.grant_id = p_grant AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'support grant rejected (unknown_grant): no grant % in this domain', p_grant USING ERRCODE = '23503'; END IF;
  IF g.engineer_principal_id <> p_actor THEN RAISE EXCEPTION 'support grant rejected (ownership): only the requesting engineer withdraws a grant' USING ERRCODE = '42501'; END IF;
  IF g.state NOT IN ('requested', 'approved') THEN RAISE EXCEPTION 'support grant rejected (state): the grant is %', g.state USING ERRCODE = '23505'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'support grant rejected (reason): a withdrawal states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  RETURN service._end_support_grant(p_grant, p_tenant, p_domain, 'withdrawn', p_reason, true, p_actor, p_correlation);
END $$;
REVOKE ALL ON FUNCTION service.withdraw_support_grant(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.withdraw_support_grant(uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

/* THE LAPSE, LAYER 3 — (a) the `support_access.expiry` timer's handler (the tick's workflow-timers step, under executive.attention.tick): the
   grant named by the timer lapses (skipped when it already ended); (b) THE SWEEP (the after-tick hook `support-access`, its own governed
   write service.grant.sweep): every approved grant past its expiry lapses whatever happened to its timer; then the engineers still holding a
   session from before their grant ended are read for the identity authority. */
CREATE OR REPLACE FUNCTION service.lapse_support_grant(p_timer uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t executive.workflow_timers%ROWTYPE; g service.support_grants%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service._sa_actor('support grant', p_actor);
  SELECT * INTO t FROM executive.workflow_timers x WHERE x.timer_id = p_timer AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND OR t.kind <> 'support_access.expiry' OR t.owner_kind <> 'grant' THEN
    RAISE EXCEPTION 'support grant rejected (unknown_timer): % is not a support access expiry of this domain', p_timer USING ERRCODE = '23503';
  END IF;
  SELECT * INTO g FROM service.support_grants x WHERE x.grant_id = t.owner_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('skipped', true, 'reason', 'no support grant names this timer'); END IF;
  IF g.state <> 'approved' THEN RETURN jsonb_build_object('skipped', true, 'grant_id', g.grant_id, 'reason', format('the grant is already %s', g.state)); END IF;
  IF g.expires_at > clock_timestamp() THEN RETURN jsonb_build_object('skipped', true, 'grant_id', g.grant_id, 'reason', 'the grant has not expired'); END IF;
  RETURN service._end_support_grant(g.grant_id, p_tenant, p_domain, 'lapsed', 'the grant expired (support_access.expiry timer)', false, p_actor, p_correlation) || jsonb_build_object('via', 'timer');
END $$;
REVOKE ALL ON FUNCTION service.lapse_support_grant(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.lapse_support_grant(uuid, uuid, uuid, uuid, uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION service.sweep_support_grants(p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE g record; v_out jsonb := '[]'::jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.grant.sweep']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service._sa_actor('support grant', p_actor);
  FOR g IN SELECT x.grant_id FROM service.support_grants x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'approved' AND x.expires_at <= clock_timestamp()
            ORDER BY x.expires_at FOR UPDATE SKIP LOCKED LOOP
    v_out := v_out || (service._end_support_grant(g.grant_id, p_tenant, p_domain, 'lapsed', 'the grant expired (sweep)', true, p_actor, p_correlation) || jsonb_build_object('via', 'sweep'));
  END LOOP;
  RETURN jsonb_build_object('lapsed', v_out, 'access_pending', service._support_access_pending(p_tenant, p_domain));
END $$;
REVOKE ALL ON FUNCTION service.sweep_support_grants(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.sweep_support_grants(uuid, uuid, uuid, uuid) TO eye_commit;

/* What the identity authority still has to revoke (the revoke and drill routes read it after their own end). */
CREATE OR REPLACE FUNCTION service.support_access_pending(p_tenant uuid, p_domain uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = service, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.grant.sweep', 'service.grant.revoke', 'service.drill.run', 'service.grant.withdraw']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  RETURN service._support_access_pending(p_tenant, p_domain);
END $$;
REVOKE ALL ON FUNCTION service.support_access_pending(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.support_access_pending(uuid, uuid) TO eye_commit;

/* THE DIAGNOSTIC READS (the engineer's ONLY reads — support.diagnose.source | .runs | .health | .schedule, each its own exact PDP rule): the
   LIVE GRANT asked FIRST (for the case, the act, the named source — the database clock), EVERY attempt LOGGED in service.access_log with its
   grant (allowed) or without one (refused, with why). Reads only the named source's contract STATE (never its endpoints or contract body),
   recent runs, health transitions and scheduler state — never evidence content, never another source. A refusal is ANSWERED (refused: true)
   so the log row commits; the route then refuses 403 `access`. */
CREATE OR REPLACE FUNCTION service.diagnose(p_tenant uuid, p_domain uuid, p_case uuid, p_source uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_bound text := public.eye_bound_action(); v_act text; v_grant uuid; v_why text; v_data jsonb; v_log uuid; gg service.support_grants%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['support.diagnose.source', 'support.diagnose.runs', 'support.diagnose.health', 'support.diagnose.schedule']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service._sa_actor('support access', p_actor);
  v_act := 'diagnose.' || split_part(v_bound, '.', 3);
  v_grant := service.live_grant(p_tenant, p_domain, p_actor, p_case, v_act, p_source);
  IF v_grant IS NULL THEN
    -- why: the most recent grant of this engineer for the case says it
    SELECT * INTO gg FROM service.support_grants g WHERE g.tenant_id = p_tenant AND g.domain_id = p_domain AND g.engineer_principal_id = p_actor AND (p_case IS NULL OR g.case_id = p_case)
     ORDER BY coalesce(g.decided_at, g.requested_at) DESC LIMIT 1;
    v_why := CASE WHEN gg.grant_id IS NULL THEN 'no support grant for this engineer and case'
                  WHEN gg.state = 'approved' AND clock_timestamp() >= gg.expires_at THEN format('grant %s expired at %s', gg.grant_id, gg.expires_at)
                  WHEN gg.state <> 'approved' THEN format('grant %s is %s', gg.grant_id, gg.state)
                  WHEN NOT (v_act = ANY (gg.action_scope)) THEN format('%s is outside grant %s''s action scope', v_act, gg.grant_id)
                  ELSE format('source %s is outside grant %s''s object scope', p_source, gg.grant_id) END;
    v_log := service.log_access(p_tenant, p_domain, gg.grant_id, p_actor, v_bound, 'source', p_source::text, 'refused',
                                jsonb_build_object('why', v_why, 'case_id', p_case, 'grant_state', gg.state), p_correlation);
    RETURN jsonb_build_object('refused', true, 'reason', v_why, 'log_id', v_log, 'grant_id', gg.grant_id);
  END IF;
  v_data := CASE v_act
    WHEN 'diagnose.source' THEN (SELECT jsonb_build_object('source_id', s.source_id, 'contract_version', s.contract_version, 'source_key', s.source_key, 'name', s.name, 'publisher', s.publisher,
                                   'connector_kind', s.connector_kind, 'acquisition_mode', s.acquisition_mode, 'lifecycle_state', s.lifecycle_state, 'rights_state', s.rights_state,
                                   'cadence_seconds', s.cadence_seconds, 'freshness_threshold_seconds', s.freshness_threshold_seconds, 'effective_from', s.effective_from, 'updated_at', s.updated_at)
                                 FROM observation.source_contracts_current s WHERE s.source_id = p_source AND s.tenant_id = p_tenant AND s.domain_id = p_domain ORDER BY s.contract_version DESC LIMIT 1)
    WHEN 'diagnose.runs' THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('run_id', r.run_id, 'contract_version', r.contract_version, 'state', r.state, 'started_at', r.started_at, 'finished_at', r.finished_at,
                                   'items_fetched', r.items_fetched, 'items_admitted', r.items_admitted, 'items_quarantined', r.items_quarantined, 'items_noop', r.items_noop,
                                   'failure_reason', r.failure_reason) ORDER BY r.started_at DESC), '[]'::jsonb)
                               FROM (SELECT * FROM observation.collection_runs_current r0 WHERE r0.source_id = p_source AND r0.tenant_id = p_tenant AND r0.domain_id = p_domain
                                      ORDER BY r0.started_at DESC LIMIT 20) r)
    WHEN 'diagnose.health' THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('prior_state', hh.prior_state, 'new_state', hh.new_state, 'evaluated_at', hh.evaluated_at, 'reason', hh.reason,
                                   'lag_class', hh.lag_class, 'calc_version', hh.calc_version) ORDER BY hh.evaluated_at DESC), '[]'::jsonb)
                                 FROM (SELECT * FROM observation.source_health_events h0 WHERE h0.source_id = p_source AND h0.tenant_id = p_tenant AND h0.domain_id = p_domain
                                        ORDER BY h0.evaluated_at DESC LIMIT 20) hh)
    ELSE jsonb_build_object(
           'entries', (SELECT coalesce(jsonb_agg(jsonb_build_object('scheduler_id', e.scheduler_id, 'contract_version', e.contract_version, 'queue_name', e.queue_name, 'cadence_seconds', e.cadence_seconds,
                         'status', e.status, 'created_at', e.created_at, 'removed_at', e.removed_at) ORDER BY e.created_at DESC), '[]'::jsonb)
                         FROM observation.scheduler_entries e WHERE e.source_id = p_source AND e.tenant_id = p_tenant AND e.domain_id = p_domain),
           'attempts', (SELECT coalesce(jsonb_agg(jsonb_build_object('attempt_id', a.attempt_id, 'trigger', a.trigger, 'started_at', a.started_at, 'finished_at', a.finished_at, 'outcome', a.outcome,
                          'reason', a.reason, 'run_id', a.run_id) ORDER BY a.started_at DESC), '[]'::jsonb)
                          FROM (SELECT * FROM observation.scheduled_attempts a0 WHERE a0.source_id = p_source AND a0.tenant_id = p_tenant AND a0.domain_id = p_domain
                                 ORDER BY a0.started_at DESC LIMIT 20) a))
  END;
  v_log := service.log_access(p_tenant, p_domain, v_grant, p_actor, v_bound, 'source', p_source::text, 'allowed', jsonb_build_object('case_id', p_case), p_correlation);
  RETURN jsonb_build_object('refused', false, 'grant_id', v_grant, 'log_id', v_log, 'action', v_bound, 'source_id', p_source, 'data', v_data,
                            'never', 'evidence content, another source, or any write');
END $$;
REVOKE ALL ON FUNCTION service.diagnose(uuid, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.diagnose(uuid, uuid, uuid, uuid, uuid, uuid) TO eye_commit;

-- §SA.8 CUSTOMER-CONTROL DRILLS, THE JOINT EXERCISE, THE ADMISSION RECORD (CAP-TR-12, IA-04-006) ─────────────────────────────────────────────
/* A DRILL (the domain administrator — a named human, never the engineer): `revoke_live_grant` revokes a LIVE grant and probes the live-grant
   test for every action × named object of its scope (and the case acts with no object) — every probe must answer no grant (passed); each
   probe logged refused with the drill's id. `expired_grant_refused` probes a grant past its expiry (swept or not) the same way. */
CREATE OR REPLACE FUNCTION service.run_control_drill(p_drill uuid, p_tenant uuid, p_domain uuid, p_kind text, p_grant uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, onboarding, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE g service.support_grants%ROWTYPE; v_before uuid; v_end jsonb; a text; s text; v_probe uuid; v_probes jsonb := '[]'::jsonb; v_live int := 0; v_outcome text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.drill.run']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service._sa_actor('control drill', p_actor);
  IF p_kind NOT IN ('revoke_live_grant', 'expired_grant_refused') THEN RAISE EXCEPTION 'control drill rejected (kind): revoke_live_grant or expired_grant_refused' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'control drill rejected (reason): a drill states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO g FROM service.support_grants x WHERE x.grant_id = p_grant AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'control drill rejected (unknown_grant): no grant % in this domain', p_grant USING ERRCODE = '23503'; END IF;
  PERFORM onboarding.assert_approver('control drill', p_actor, p_tenant, p_domain, ARRAY['domain_admin'], g.engineer_principal_id, 'running a customer-control drill');
  IF p_kind = 'revoke_live_grant' THEN
    v_before := service.live_grant(p_tenant, p_domain, g.engineer_principal_id, g.case_id, g.action_scope[1], CASE WHEN g.action_scope[1] LIKE 'diagnose.%' THEN (g.object_scope -> 'sources' ->> 0)::uuid END);
    IF g.state <> 'approved' OR clock_timestamp() >= g.expires_at OR v_before IS NULL THEN
      RAISE EXCEPTION 'control drill rejected (state): revoke_live_grant needs a LIVE grant (the grant is %)', CASE WHEN g.state = 'approved' THEN 'expired' ELSE g.state END USING ERRCODE = '23505';
    END IF;
    v_end := service._end_support_grant(p_grant, p_tenant, p_domain, 'revoked', 'customer-control drill: ' || btrim(p_reason), true, p_actor, p_correlation);
  ELSE
    IF NOT (g.state = 'lapsed' OR (g.state = 'approved' AND clock_timestamp() >= g.expires_at)) THEN
      RAISE EXCEPTION 'control drill rejected (state): expired_grant_refused needs a grant past its expiry (the grant is %)', g.state USING ERRCODE = '23505';
    END IF;
  END IF;
  FOREACH a IN ARRAY g.action_scope LOOP
    IF a LIKE 'diagnose.%' THEN
      FOR s IN SELECT jsonb_array_elements_text(g.object_scope -> 'sources') LOOP
        v_probe := service.live_grant(p_tenant, p_domain, g.engineer_principal_id, g.case_id, a, s::uuid);
        v_live := v_live + CASE WHEN v_probe IS NULL THEN 0 ELSE 1 END;
        PERFORM service.log_access(p_tenant, p_domain, p_grant, g.engineer_principal_id, 'support.' || a, 'source', s, CASE WHEN v_probe IS NULL THEN 'refused' ELSE 'allowed' END,
                                   jsonb_build_object('drill', p_drill, 'probe', true, 'by', p_actor), p_correlation);
        v_probes := v_probes || jsonb_build_object('action', a, 'object', s, 'live_grant', v_probe);
      END LOOP;
    ELSE
      v_probe := service.live_grant(p_tenant, p_domain, g.engineer_principal_id, g.case_id, a, NULL);
      v_live := v_live + CASE WHEN v_probe IS NULL THEN 0 ELSE 1 END;
      PERFORM service.log_access(p_tenant, p_domain, p_grant, g.engineer_principal_id, 'service.' || a, 'case', g.case_id::text, CASE WHEN v_probe IS NULL THEN 'refused' ELSE 'allowed' END,
                                 jsonb_build_object('drill', p_drill, 'probe', true, 'by', p_actor), p_correlation);
      v_probes := v_probes || jsonb_build_object('action', a, 'object', NULL, 'live_grant', v_probe);
    END IF;
  END LOOP;
  v_outcome := CASE WHEN v_live = 0 THEN 'passed' ELSE 'failed' END;
  INSERT INTO service.control_drills (drill_id, tenant_id, domain_id, kind, grant_id, reason, outcome, evidence, run_by, correlation_id)
  VALUES (p_drill, p_tenant, p_domain, p_kind, p_grant, btrim(p_reason), v_outcome,
          jsonb_build_object('live_before', v_before, 'ended', v_end, 'probes', v_probes, 'live_after', v_live, 'engineer', g.engineer_principal_id, 'expires_at', g.expires_at), p_actor, p_correlation);
  PERFORM onboarding.ledger('service', p_tenant, p_domain, 'control_drill', p_drill, NULL, 'drill.run', p_actor,
            jsonb_build_object('kind', p_kind, 'grant_id', p_grant, 'outcome', v_outcome, 'probes', jsonb_array_length(v_probes), 'live_after', v_live), p_correlation);
  RETURN jsonb_build_object('drill_id', p_drill, 'kind', p_kind, 'grant_id', p_grant, 'outcome', v_outcome, 'probes', v_probes, 'engineer', g.engineer_principal_id, 'ended', v_end);
END $$;
REVOKE ALL ON FUNCTION service.run_control_drill(uuid, uuid, uuid, text, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.run_control_drill(uuid, uuid, uuid, text, uuid, text, uuid, uuid) TO eye_commit;

/* A JOINT EXERCISE recorded (the domain administrator or the onboarding authority, a named human): customer participants (active humans of the
   tenant, no support engineer) and vendor participants (support engineers of the domain), held on a day not in the future. */
CREATE OR REPLACE FUNCTION service.record_joint_exercise(p_exercise uuid, p_tenant uuid, p_domain uuid, p_title text, p_scenario text, p_held_on date, p_customer uuid[], p_vendor uuid[],
                                                         p_outcome text, p_findings text, p_evidence jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, onboarding, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.exercise.record']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service._sa_actor('admission record', p_actor);
  PERFORM onboarding.assert_approver('admission record', p_actor, p_tenant, p_domain, ARRAY['domain_admin', 'onboarding_authority'], NULL, 'recording a joint operating exercise');
  IF length(btrim(coalesce(p_title, ''))) NOT BETWEEN 4 AND 200 OR length(btrim(coalesce(p_scenario, ''))) < 12 THEN
    RAISE EXCEPTION 'admission record rejected (exercise): a joint exercise has a title and a scenario (12+ characters)' USING ERRCODE = '22023';
  END IF;
  IF p_held_on IS NULL OR p_held_on > (clock_timestamp() AT TIME ZONE 'UTC')::date THEN RAISE EXCEPTION 'admission record rejected (exercise): an exercise was held on a day not in the future' USING ERRCODE = '22023'; END IF;
  IF p_outcome NOT IN ('completed', 'completed_with_findings', 'failed') THEN RAISE EXCEPTION 'admission record rejected (exercise): the outcome is completed, completed_with_findings or failed' USING ERRCODE = '22023'; END IF;
  IF cardinality(coalesce(p_customer, '{}')) = 0 OR cardinality(coalesce(p_vendor, '{}')) = 0 THEN
    RAISE EXCEPTION 'admission record rejected (exercise): a JOINT exercise names customer and vendor participants' USING ERRCODE = '22023';
  END IF;
  FOREACH x IN ARRAY p_customer LOOP
    IF NOT decision.is_active_human(x, p_tenant) OR service._is_support_engineer(x, p_tenant) THEN
      RAISE EXCEPTION 'admission record rejected (exercise): customer participant % is not an active human member of the tenant', x USING ERRCODE = '22023';
    END IF;
  END LOOP;
  FOREACH x IN ARRAY p_vendor LOOP
    IF NOT onboarding.holds_role(x, p_tenant, p_domain, ARRAY['support_engineer']) THEN
      RAISE EXCEPTION 'admission record rejected (exercise): vendor participant % is not a support engineer of the domain', x USING ERRCODE = '22023';
    END IF;
  END LOOP;
  INSERT INTO service.joint_exercises (exercise_id, tenant_id, domain_id, title, scenario, held_on, customer_participants, vendor_participants, outcome, findings, evidence_refs, recorded_by, correlation_id)
  VALUES (p_exercise, p_tenant, p_domain, btrim(p_title), btrim(p_scenario), p_held_on, p_customer, p_vendor, p_outcome, nullif(btrim(coalesce(p_findings, '')), ''), coalesce(p_evidence, '[]'::jsonb),
          p_actor, p_correlation);
  PERFORM onboarding.ledger('service', p_tenant, p_domain, 'joint_exercise', p_exercise, NULL, 'exercise.recorded', p_actor,
            jsonb_build_object('title', btrim(p_title), 'held_on', p_held_on, 'outcome', p_outcome, 'claim', 'demonstration'), p_correlation);
  RETURN jsonb_build_object('exercise_id', p_exercise, 'held_on', p_held_on, 'outcome', p_outcome, 'claim', 'demonstration');
END $$;
REVOKE ALL ON FUNCTION service.record_joint_exercise(uuid, uuid, uuid, text, text, date, uuid[], uuid[], text, text, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.record_joint_exercise(uuid, uuid, uuid, text, text, date, uuid[], uuid[], text, text, jsonb, uuid, uuid) TO eye_commit;

/* PROPOSE an admission record (the implementation lead or the domain administrator): HELD (409) unless the profile's approved matrix is
   SIGNED, at least one drill in the period PASSED and at least one named joint exercise was held in the period. The grant ledger of the
   period (every grant, its window and end) and its access-log counts are assembled and digested; the record binds the baseline digest, the
   profile and the period. A newer version supersedes an open proposal. */
CREATE OR REPLACE FUNCTION service.propose_admission(p_admission uuid, p_tenant uuid, p_domain uuid, p_profile text, p_from date, p_to date, p_baseline_digest text, p_exercises uuid[],
                                                     p_expected_version int, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, onboarding, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE m service.responsibility_matrices%ROWTYPE; v_cur int; v_matrix jsonb; v_ledger jsonb; v_drills jsonb; v_ex jsonb; v_digest text; v_version int; v_blocking jsonb := '[]'::jsonb;
        v_lo timestamptz; v_hi timestamptz; v_profile text := coalesce(p_profile, 'local-dev');
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.admission.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service._sa_actor('admission record', p_actor);
  IF NOT onboarding.holds_role(p_actor, p_tenant, p_domain, ARRAY['implementation_lead', 'domain_admin']) OR service._is_support_engineer(p_actor, p_tenant) THEN
    RAISE EXCEPTION 'admission record rejected (authority): an admission record is assembled by the implementation lead or the domain administrator' USING ERRCODE = '42501';
  END IF;
  IF coalesce(p_baseline_digest, '') !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'admission record rejected (baseline): the record binds the configuration baseline''s digest (64 hex)' USING ERRCODE = '22023'; END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to > (clock_timestamp() AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION 'admission record rejected (period): a period from ≤ to, ending no later than today' USING ERRCODE = '22023';
  END IF;
  v_lo := (p_from::timestamp AT TIME ZONE 'UTC'); v_hi := ((p_to + 1)::timestamp AT TIME ZONE 'UTC');
  SELECT coalesce(max(a.version), 0) INTO v_cur FROM service.admission_records a WHERE a.admission_id = p_admission;
  IF EXISTS (SELECT 1 FROM service.admission_records a WHERE a.admission_id = p_admission AND (a.tenant_id <> p_tenant OR a.domain_id <> p_domain)) THEN
    RAISE EXCEPTION 'admission record rejected (unknown_admission): % is not an admission record of this domain', p_admission USING ERRCODE = '23503';
  END IF;
  IF p_expected_version IS DISTINCT FROM v_cur THEN
    RAISE EXCEPTION 'admission record rejected (stale): the record is at version % (expected %)', v_cur, coalesce(p_expected_version::text, '<none>') USING ERRCODE = '23505';
  END IF;
  SELECT * INTO m FROM service.responsibility_matrices x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.deployment_profile = v_profile AND x.state = 'approved';
  IF m.matrix_id IS NULL OR m.signature_id IS NULL THEN
    v_blocking := v_blocking || jsonb_build_object('item', 'signed_matrix', 'reason', format('no signed responsibility matrix for %s', v_profile));
  ELSE
    v_matrix := jsonb_build_object('matrix_id', m.matrix_id, 'version', m.version, 'digest', m.digest, 'signature_id', m.signature_id, 'decided_by', m.decided_by, 'decided_at', m.decided_at);
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('drill_id', d.drill_id, 'kind', d.kind, 'grant_id', d.grant_id, 'outcome', d.outcome, 'run_at', d.run_at) ORDER BY d.run_at), '[]'::jsonb) INTO v_drills
    FROM service.control_drills d WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.run_at >= v_lo AND d.run_at < v_hi;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_drills) d WHERE d ->> 'outcome' = 'passed') THEN
    v_blocking := v_blocking || jsonb_build_object('item', 'control_drill', 'reason', 'no customer-control drill passed in the period');
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('exercise_id', e.exercise_id, 'title', e.title, 'held_on', e.held_on, 'outcome', e.outcome, 'claim', e.claim) ORDER BY e.held_on), '[]'::jsonb) INTO v_ex
    FROM service.joint_exercises e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.exercise_id = ANY (coalesce(p_exercises, '{}')) AND e.held_on BETWEEN p_from AND p_to;
  IF jsonb_array_length(v_ex) = 0 OR jsonb_array_length(v_ex) <> cardinality(coalesce(p_exercises, '{}')) THEN
    v_blocking := v_blocking || jsonb_build_object('item', 'joint_exercise', 'reason', 'every named joint exercise is of this domain and held in the period (at least one)');
  END IF;
  IF jsonb_array_length(v_blocking) > 0 THEN
    RAISE EXCEPTION 'admission record rejected (held): %', (SELECT string_agg(b ->> 'reason', '; ') FROM jsonb_array_elements(v_blocking) b) USING ERRCODE = '23505';
  END IF;
  SELECT jsonb_build_object(
      'grants', coalesce(jsonb_agg(jsonb_build_object('grant_id', g.grant_id, 'case_id', g.case_id, 'engineer', g.engineer_principal_id, 'state', g.state, 'purpose', g.purpose,
                  'action_scope', to_jsonb(g.action_scope), 'object_scope', g.object_scope, 'requested_at', g.requested_at, 'decided_by', g.decided_by, 'starts_at', g.starts_at,
                  'expires_at', g.expires_at, 'ended_at', g.ended_at, 'end_reason', g.end_reason, 'request_digest', g.request_digest) ORDER BY g.requested_at), '[]'::jsonb),
      'access_log', (SELECT jsonb_build_object('allowed', count(*) FILTER (WHERE l.outcome = 'allowed'), 'refused', count(*) FILTER (WHERE l.outcome = 'refused'))
                       FROM service.access_log l WHERE l.tenant_id = p_tenant AND l.domain_id = p_domain AND l.at >= v_lo AND l.at < v_hi))
    INTO v_ledger FROM service.support_grants g WHERE g.tenant_id = p_tenant AND g.domain_id = p_domain AND g.requested_at >= v_lo AND g.requested_at < v_hi;
  v_ledger := v_ledger || jsonb_build_object('digest', onboarding.digest(v_ledger));
  v_version := v_cur + 1;
  v_digest := onboarding.digest(jsonb_build_object('admission_id', p_admission, 'version', v_version, 'profile', v_profile, 'period', jsonb_build_array(p_from, p_to),
                                                   'baseline_digest', p_baseline_digest, 'matrix', v_matrix, 'grant_ledger', v_ledger, 'drills', v_drills, 'exercises', v_ex));
  UPDATE service.admission_records SET state = 'superseded' WHERE admission_id = p_admission AND state = 'proposed';
  INSERT INTO service.admission_records (admission_id, version, tenant_id, domain_id, deployment_profile, period_from, period_to, baseline_digest, matrix, grant_ledger, drills, exercises, digest,
                                         proposed_by, correlation_id)
  VALUES (p_admission, v_version, p_tenant, p_domain, v_profile, p_from, p_to, p_baseline_digest, v_matrix, v_ledger, v_drills, v_ex, v_digest, p_actor, p_correlation);
  PERFORM onboarding.ledger('service', p_tenant, p_domain, 'admission_record', p_admission, v_version, 'admission.proposed', p_actor,
            jsonb_build_object('digest', v_digest, 'profile', v_profile, 'period', jsonb_build_array(p_from, p_to), 'baseline_digest', p_baseline_digest, 'grants', jsonb_array_length(v_ledger -> 'grants'),
                               'drills', jsonb_array_length(v_drills), 'exercises', jsonb_array_length(v_ex)), p_correlation);
  RETURN jsonb_build_object('admission_id', p_admission, 'version', v_version, 'state', 'proposed', 'digest', v_digest, 'matrix', v_matrix, 'grant_ledger', v_ledger, 'drills', v_drills,
                            'exercises', v_ex, 'production_admission', 'R1: production admission is external — this record is construction evidence');
END $$;
REVOKE ALL ON FUNCTION service.propose_admission(uuid, uuid, uuid, text, date, date, text, uuid[], int, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.propose_admission(uuid, uuid, uuid, text, date, date, text, uuid[], int, uuid, uuid) TO eye_commit;

/* DECIDE (sign | reject) — the onboarding authority (the approver test), on the exact digest; SIGN needs the decider's signature over the
   digest recorded under this action (subject `admission_record`); a prior signed version is superseded. */
CREATE OR REPLACE FUNCTION service.decide_admission(p_admission uuid, p_version int, p_tenant uuid, p_domain uuid, p_decision text, p_digest text, p_reason text, p_signature uuid,
                                                    p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, onboarding, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a service.admission_records%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.admission.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service._sa_actor('admission record', p_actor);
  SELECT * INTO a FROM service.admission_records x WHERE x.admission_id = p_admission AND x.version = p_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'admission record rejected (unknown_admission): no admission record %/v% in this domain', p_admission, p_version USING ERRCODE = '23503'; END IF;
  PERFORM onboarding.assert_approver('admission record', p_actor, p_tenant, p_domain, ARRAY['onboarding_authority'], a.proposed_by, 'signing an admission record');
  IF a.state <> 'proposed' THEN RAISE EXCEPTION 'admission record rejected (state): version % is %', p_version, a.state USING ERRCODE = '23505'; END IF;
  IF p_digest IS DISTINCT FROM a.digest THEN RAISE EXCEPTION 'admission record rejected (stale): the decision names a digest other than version %''s', p_version USING ERRCODE = '23505'; END IF;
  IF p_decision NOT IN ('sign', 'reject') THEN RAISE EXCEPTION 'admission record rejected (decision): sign or reject' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'admission record rejected (reason): a decision states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_decision = 'reject' THEN
    UPDATE service.admission_records SET state = 'rejected', decided_by = p_actor, decided_at = clock_timestamp(), decision_reason = btrim(p_reason) WHERE admission_id = p_admission AND version = p_version;
  ELSE
    IF p_signature IS NULL OR NOT EXISTS (SELECT 1 FROM executive.signatures s WHERE s.signature_id = p_signature AND s.subject_kind = 'admission_record' AND s.subject_id = p_admission
                                                     AND s.subject_version = p_version AND s.subject_digest = a.digest AND s.signer = p_actor AND s.bound_action = 'service.admission.decide') THEN
      RAISE EXCEPTION 'admission record rejected (signature): signing carries the decider''s signature over the record''s digest' USING ERRCODE = '22023';
    END IF;
    UPDATE service.admission_records SET state = 'superseded' WHERE admission_id = p_admission AND state = 'signed';
    UPDATE service.admission_records SET state = 'signed', decided_by = p_actor, decided_at = clock_timestamp(), decision_reason = btrim(p_reason), signature_id = p_signature
     WHERE admission_id = p_admission AND version = p_version;
  END IF;
  PERFORM onboarding.ledger('service', p_tenant, p_domain, 'admission_record', p_admission, p_version, CASE WHEN p_decision = 'sign' THEN 'admission.signed' ELSE 'admission.rejected' END, p_actor,
            jsonb_build_object('digest', a.digest, 'reason', btrim(p_reason), 'signature_id', p_signature, 'production_admission', 'R1'), p_correlation);
  RETURN jsonb_build_object('admission_id', p_admission, 'version', p_version, 'state', CASE WHEN p_decision = 'sign' THEN 'signed' ELSE 'rejected' END, 'digest', a.digest, 'signature_id', p_signature,
                            'production_admission', 'R1: production admission is external — this signed record is construction evidence');
END $$;
REVOKE ALL ON FUNCTION service.decide_admission(uuid, int, uuid, uuid, text, text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.decide_admission(uuid, int, uuid, uuid, text, text, text, uuid, uuid, uuid) TO eye_commit;
