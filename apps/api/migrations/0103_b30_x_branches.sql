-- ═════════════════════════════════════════════════════════════════════
-- section `branches` (§BR) — CP-6 B30 part `branches` (F-P5-03 complete): the branch-aware state store (checkpoint restore; a branch
-- merged back into `actual` only through a merge whose DIVERGING keys — computed here from the two admitted heads and the branch's fork
-- point — are each reconciled by the twin's owner); component-level confidence aggregation; staleness by age and by dependency uncertainty;
-- the last VALIDATED snapshot frozen as the served state with its freshness warning and an EXPIRY (a historical snapshot past its expiry is
-- refused for runs — FEX-14); the `scenario` element kind's basis rule (ADR-0011 V4); the ontology/policy revision a commit records
-- (V03-T-196; read by the admit in TS). Every figure a harness or an act seeds here is SYNTHETIC.
--
-- Forward only. The prelude's objects (§0: the attention classes twin.reconciliation / twin.freshness, the subject kinds twin / twin_branch,
-- the element kind `scenario`) are USED, never re-declared. No existing function is re-declared: the merge's draft, its grounding and its
-- admission go through the EXISTING ports (twin.open_version / twin.ground_element / twin.admit_version), each under its own bound action in
-- its own governed write from TS; the merge's own record moves to `merged` in the SAME transaction as the admission, by the AFTER UPDATE
-- trigger tbr_merge_admitted (which also refuses an admission on `actual` that does not carry the reconciled plan while a merge completes).
-- No event is added to twin.twin_events, simulation.run_events or simulation.experiment_events: the lifecycle lives in twin.branch_events.
-- Default-off: every gate below acts only on a twin that has a merge, a freeze or a scenario element — none of which exists before B30.
-- ═════════════════════════════════════════════════════════════════════

-- §BR.1 THE TABLES ────────────────────────────────────────────────────

/* The freshness SLO of a twin, versioned and append-only (the highest version stands), set by the twin's owner: the maximum age of the
   head in days (age = the database's day minus the version's world cut-off observed_through, else its record cut-off known_at), the
   per-key maximum age ({key prefix: days}), and how many hours before a freeze's expiry it is announced as nearing. */
CREATE TABLE twin.freshness_policies (
  twin_id            uuid NOT NULL REFERENCES twin.twins_current (twin_id),
  version            int  NOT NULL CHECK (version >= 1),
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  max_age_days       int  NOT NULL CHECK (max_age_days BETWEEN 0 AND 3650),
  key_max_age        jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(key_max_age) = 'object'),
  near_expiry_hours  int  NOT NULL DEFAULT 24 CHECK (near_expiry_hours BETWEEN 1 AND 720),
  note               text NOT NULL CHECK (length(btrim(note)) BETWEEN 8 AND 2000),
  set_by             uuid NOT NULL,
  set_at             timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  PRIMARY KEY (twin_id, version),
  CONSTRAINT tbr_fp_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE TRIGGER tbr_fp_append_only BEFORE UPDATE OR DELETE ON twin.freshness_policies FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* A request to merge branch X of a twin back into `actual`. The DIVERGING keys are the server's, computed at opening from the two admitted
   heads and the branch's fork point (a key the branch changed — against its fork point — that differs from actual's head; `conflict` when
   actual changed it too). State: open → reconciled (every diverging key resolved) → completing (the owner's completion: the plan is fixed,
   actual is held) → merged (the admission of the plan on actual, same transaction); or refused (the owner) / withdrawn (the opener or the
   owner). */
CREATE TABLE twin.branch_merges (
  merge_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  twin_id            uuid NOT NULL REFERENCES twin.twins_current (twin_id),
  source_branch      text NOT NULL CHECK (source_branch ~ '^[a-z][a-z0-9-]{0,40}$' AND source_branch <> 'actual'),
  target_branch      text NOT NULL DEFAULT 'actual' CHECK (target_branch = 'actual'),
  source_version     int  NOT NULL,
  target_version     int  NOT NULL,
  base_version       int,
  diverging          jsonb NOT NULL CHECK (jsonb_typeof(diverging) = 'array' AND jsonb_array_length(diverging) >= 1),
  state              text NOT NULL CHECK (state IN ('open', 'reconciled', 'completing', 'merged', 'refused', 'withdrawn')),
  reason             text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  opened_by          uuid NOT NULL,
  opened_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  completing_by      uuid,
  completing_at      timestamptz,
  merged_version     int,
  merged_at          timestamptz,
  closed_by          uuid,
  closed_at          timestamptz,
  close_reason       text,
  correlation_id     uuid NOT NULL,
  CONSTRAINT tbr_bm_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT tbr_bm_completing_bound CHECK ((completing_at IS NULL) = (completing_by IS NULL)),
  CONSTRAINT tbr_bm_merged_bound CHECK ((state = 'merged') = (merged_version IS NOT NULL AND merged_at IS NOT NULL)),
  CONSTRAINT tbr_bm_closed_bound CHECK ((state IN ('refused', 'withdrawn')) = (closed_at IS NOT NULL AND closed_by IS NOT NULL AND close_reason IS NOT NULL)),
  FOREIGN KEY (twin_id, source_version) REFERENCES twin.twin_versions (twin_id, version),
  FOREIGN KEY (twin_id, target_version) REFERENCES twin.twin_versions (twin_id, version)
);
CREATE UNIQUE INDEX tbr_bm_one_live ON twin.branch_merges (twin_id, source_branch) WHERE state IN ('open', 'reconciled', 'completing');
CREATE UNIQUE INDEX tbr_bm_one_completing ON twin.branch_merges (twin_id) WHERE state = 'completing';
CREATE INDEX tbr_bm_twin ON twin.branch_merges (twin_id, opened_at);

/* The owner's resolution of one diverging key, append-only (a later ordinal supersedes an earlier one until completion): keep_target
   (actual's value stands), take_branch (the branch's element is taken — never a SCENARIO element: a scenario value does not become actual
   state), reconciled (a value the owner states, of kind assumed or estimated, with its typed citations — evidence or an assumption). */
CREATE TABLE twin.merge_resolutions (
  merge_id           uuid NOT NULL REFERENCES twin.branch_merges (merge_id),
  key                text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_.-]*(:[A-Za-z0-9_.-]+)?$'),
  ordinal            int  NOT NULL CHECK (ordinal >= 1),
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  resolution         text NOT NULL CHECK (resolution IN ('keep_target', 'take_branch', 'reconciled')),
  kind               text CHECK (kind IS NULL OR kind IN ('assumed', 'estimated')),
  value              jsonb,
  unit               text,
  citations          jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (twin.citations_ok(citations)),
  note               text NOT NULL CHECK (length(btrim(note)) BETWEEN 8 AND 2000),
  resolved_by        uuid NOT NULL,
  resolved_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  PRIMARY KEY (merge_id, key, ordinal),
  CONSTRAINT tbr_mr_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT tbr_mr_reconciled CHECK ((resolution = 'reconciled') = (kind IS NOT NULL AND value IS NOT NULL AND jsonb_array_length(citations) >= 1)),
  CONSTRAINT tbr_mr_reconciled_basis CHECK (resolution <> 'reconciled'
    OR (twin.citation_count(citations, 'evidence') + twin.citation_count(citations, 'assumption') >= 1 AND twin.citation_count(citations, 'claim') = 0))
);
CREATE TRIGGER tbr_mr_append_only BEFORE UPDATE OR DELETE ON twin.merge_resolutions FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* The last VALIDATED (fit) snapshot of a branch frozen as the twin's SERVED state (a degraded mode: the head is not served while the freeze
   stands), with its freshness WARNING and an EXPIRY instant; lifted by the owner with a reason. One standing freeze per twin. */
CREATE TABLE twin.snapshot_freezes (
  freeze_id          uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  twin_id            uuid NOT NULL REFERENCES twin.twins_current (twin_id),
  branch_id          text NOT NULL CHECK (branch_id ~ '^[a-z][a-z0-9-]{0,40}$'),
  version            int  NOT NULL,
  validation_id      uuid NOT NULL,
  warning            text NOT NULL CHECK (length(btrim(warning)) BETWEEN 8 AND 1000),
  expires_at         timestamptz NOT NULL,
  frozen_by          uuid NOT NULL,
  frozen_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  lifted_by          uuid,
  lifted_at          timestamptz,
  lift_reason        text,
  correlation_id     uuid NOT NULL,
  CONSTRAINT tbr_sf_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT tbr_sf_expiry_after CHECK (expires_at > frozen_at),
  CONSTRAINT tbr_sf_lifted_bound CHECK ((lifted_at IS NULL) = (lifted_by IS NULL) AND (lifted_at IS NULL) = (lift_reason IS NULL)),
  FOREIGN KEY (twin_id, version) REFERENCES twin.twin_versions (twin_id, version)
);
CREATE UNIQUE INDEX tbr_sf_one_standing ON twin.snapshot_freezes (twin_id) WHERE lifted_at IS NULL;
CREATE INDEX tbr_sf_version ON twin.snapshot_freezes (twin_id, version);

/* The part's ledger (append-only). subject_id: the merge, the freeze, or the twin (a policy, a checkpoint restore, a freshness breach). */
CREATE TABLE twin.branch_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  twin_id            uuid NOT NULL,
  subject_id         uuid NOT NULL,
  event              text NOT NULL CHECK (event IN ('merge.opened', 'merge.key_resolved', 'merge.reconciled', 'merge.completing', 'merge.merged', 'merge.refused',
                                                    'merge.withdrawn', 'checkpoint.restored', 'snapshot.frozen', 'snapshot.lifted', 'freshness.policy_set',
                                                    'freshness.breached', 'freeze.expiring', 'freeze.expired')),
  actor_principal_id uuid,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT tbr_be_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX tbr_be_twin ON twin.branch_events (twin_id, occurred_at);
CREATE INDEX tbr_be_subject ON twin.branch_events (subject_id, occurred_at);
CREATE TRIGGER tbr_be_append_only BEFORE UPDATE OR DELETE ON twin.branch_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- RLS and grants: the 0032:634-639 idiom (policy twin_isolation; GRANT SELECT TO eye_app, eye_commit). The definer ports write.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['freshness_policies', 'branch_merges', 'merge_resolutions', 'snapshot_freezes', 'branch_events'] LOOP
    EXECUTE format('REVOKE ALL ON twin.%I FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE twin.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE twin.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY twin_isolation ON twin.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON twin.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- §BR.2 THE SCENARIO ELEMENT KIND'S BASIS RULE (ADR-0011 V4) ──────────
/* A scenario element is a value of a SCENARIO, kept apart from observed, estimated, assumed, predicted and simulated state: it cites the
   scenario branch it belongs to — today through the branch's ASSUMPTION (an ASU linked to the scenario branch in prediction.scenario_assumptions;
   the route verifies the link), or a `scenario` citation should the citation kinds ever admit one. NOT VALID is unnecessary: no row has the
   kind before B30. */
ALTER TABLE twin.state_elements ADD CONSTRAINT tbr_scenario_basis
  CHECK (kind <> 'scenario' OR twin.citation_count(citations, 'assumption') + twin.citation_count(citations, 'scenario') >= 1);

-- §BR.3 HELPERS (internal; no grant) ───────────────────────────────────

/* The latest admitted version on a branch (NULL: none). */
CREATE OR REPLACE FUNCTION twin.tbr_head(p_twin uuid, p_branch text) RETURNS int
LANGUAGE sql STABLE SET search_path = twin, pg_catalog, pg_temp AS $$
  SELECT max(v.version) FROM twin.twin_versions v WHERE v.twin_id = p_twin AND v.branch_id = p_branch AND v.state = 'admitted'
$$;
/* A version's elements as {key: {kind, value, unit}} — what a merge compares. */
CREATE OR REPLACE FUNCTION twin.tbr_element_map(p_twin uuid, p_version int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = twin, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_object_agg(e.key, jsonb_build_object('kind', e.kind, 'value', e.value, 'unit', e.unit)), '{}'::jsonb)
    FROM twin.state_elements e WHERE e.twin_id = p_twin AND e.version = p_version
$$;
/* The branch's fork point: the version its first version forked from (NULL: the branch was not forked). */
CREATE OR REPLACE FUNCTION twin.tbr_fork_base(p_twin uuid, p_branch text) RETURNS int
LANGUAGE sql STABLE SET search_path = twin, pg_catalog, pg_temp AS $$
  SELECT v.forked_from_version FROM twin.twin_versions v WHERE v.twin_id = p_twin AND v.branch_id = p_branch ORDER BY v.version LIMIT 1
$$;
/* THE DIVERGING KEYS between a branch head (source) and actual's head (target), against the branch's fork point (base): a key DIVERGES when
   the branch changed it (source ≠ base) and it differs from actual (source ≠ target); a key only actual changed is not the branch's and
   keeps actual's value. change: changed | added (only in the branch) | removed (the branch dropped it); conflict: actual changed it too. */
CREATE OR REPLACE FUNCTION twin.tbr_diverging(p_twin uuid, p_source int, p_target int, p_base int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = twin, pg_catalog, pg_temp AS $$
  WITH s AS (SELECT twin.tbr_element_map(p_twin, p_source) m), t AS (SELECT twin.tbr_element_map(p_twin, p_target) m),
       b AS (SELECT CASE WHEN p_base IS NULL THEN NULL ELSE twin.tbr_element_map(p_twin, p_base) END m),
       k AS (SELECT DISTINCT x AS key FROM s, t, LATERAL (SELECT jsonb_object_keys(s.m) UNION SELECT jsonb_object_keys(t.m)) y(x))
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'key', k.key,
           'change', CASE WHEN t.m -> k.key IS NULL THEN 'added' WHEN s.m -> k.key IS NULL THEN 'removed' ELSE 'changed' END,
           'conflict', b.m IS NOT NULL AND (t.m -> k.key) IS DISTINCT FROM (b.m -> k.key),
           'source', s.m -> k.key, 'target', t.m -> k.key, 'base', b.m -> k.key) ORDER BY k.key), '[]'::jsonb)
    FROM k, s, t, b
   WHERE (s.m -> k.key) IS DISTINCT FROM (t.m -> k.key)
     AND (b.m IS NULL OR (s.m -> k.key) IS DISTINCT FROM (b.m -> k.key))
$$;
/* The current resolution of each key of a merge (the highest ordinal). */
CREATE OR REPLACE FUNCTION twin.tbr_resolutions(p_merge uuid) RETURNS SETOF twin.merge_resolutions
LANGUAGE sql STABLE SET search_path = twin, pg_catalog, pg_temp AS $$
  SELECT DISTINCT ON (r.key) r.* FROM twin.merge_resolutions r WHERE r.merge_id = p_merge ORDER BY r.key, r.ordinal DESC
$$;
/* THE PLAN of a merge: the state actual must hold after it, {key: {kind, value, unit}} — actual's head, except each diverging key as
   resolved (keep_target: actual's; take_branch: the branch's, or absent when the branch removed it; reconciled: the owner's value). */
CREATE OR REPLACE FUNCTION twin.tbr_merge_expected(p_merge uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = twin, pg_catalog, pg_temp AS $$
DECLARE m twin.branch_merges%ROWTYPE; v_out jsonb; v_src jsonb; r twin.merge_resolutions%ROWTYPE;
BEGIN
  SELECT * INTO m FROM twin.branch_merges x WHERE x.merge_id = p_merge;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_out := twin.tbr_element_map(m.twin_id, m.target_version);
  v_src := twin.tbr_element_map(m.twin_id, m.source_version);
  FOR r IN SELECT * FROM twin.tbr_resolutions(p_merge) LOOP
    IF r.resolution = 'take_branch' THEN
      v_out := CASE WHEN v_src -> r.key IS NULL THEN v_out - r.key ELSE jsonb_set(v_out, ARRAY[r.key], v_src -> r.key) END;
    ELSIF r.resolution = 'reconciled' THEN
      v_out := jsonb_set(v_out, ARRAY[r.key], jsonb_build_object('kind', r.kind, 'value', r.value, 'unit', r.unit));
    END IF;
  END LOOP;
  RETURN v_out;
END $$;
/* The keys of a merge not yet resolved. */
CREATE OR REPLACE FUNCTION twin.tbr_unresolved(p_merge uuid) RETURNS text[]
LANGUAGE sql STABLE SET search_path = twin, pg_catalog, pg_temp AS $$
  SELECT coalesce(array_agg(d ->> 'key' ORDER BY d ->> 'key'), ARRAY[]::text[])
    FROM twin.branch_merges m, jsonb_array_elements(m.diverging) d
   WHERE m.merge_id = p_merge AND NOT EXISTS (SELECT 1 FROM twin.merge_resolutions r WHERE r.merge_id = m.merge_id AND r.key = d ->> 'key')
$$;
/* The ledger row. */
CREATE OR REPLACE FUNCTION twin.tbr_event(p_tenant uuid, p_domain uuid, p_twin uuid, p_subject uuid, p_event text, p_actor uuid, p_details jsonb, p_correlation uuid,
                                          p_event_id uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SET search_path = twin, pg_catalog, pg_temp AS $$
DECLARE v uuid := coalesce(p_event_id, gen_random_uuid());
BEGIN
  INSERT INTO twin.branch_events (event_id, scope, tenant_id, domain_id, twin_id, subject_id, event, actor_principal_id, details, correlation_id)
  VALUES (v, 'DOMAIN', p_tenant, p_domain, p_twin, p_subject, p_event, p_actor, coalesce(p_details, '{}'::jsonb), p_correlation);
  RETURN v;
END $$;
/* THE NOTICE (the 0099 sio_notify idiom): an attention item of the class owned by a named person (open when an active human, else unrouted),
   its cause the branch_events row. */
CREATE OR REPLACE FUNCTION twin.tbr_notify(p_tenant uuid, p_domain uuid, p_class text, p_subject_kind text, p_subject uuid, p_title text, p_reasons jsonb, p_owner uuid,
                                           p_cause_event uuid, p_cause_type text, p_details jsonb, p_due interval, p_actor uuid, p_correlation uuid) RETURNS uuid
SECURITY DEFINER SET search_path = executive, identity, decision, pg_catalog, pg_temp AS $$
DECLARE v_item uuid := gen_random_uuid(); v_state text; v_due timestamptz := clock_timestamp() + p_due;
BEGIN
  v_state := CASE WHEN p_owner IS NOT NULL AND decision.is_active_human(p_owner, p_tenant) THEN 'open' ELSE 'unrouted' END;
  INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state, owner_principal_id, route_roles, evaluation, details, due_at, escalations, correlation_id)
  VALUES (v_item, 'DOMAIN', p_tenant, p_domain, p_class, p_subject_kind, p_subject, p_cause_event, p_cause_type, left(p_title, 512), 'material', v_state, p_owner, '{}'::text[],
          jsonb_build_object('outcome', 'material', 'reasons', p_reasons, 'policy_version', NULL, 'dimensions', jsonb_build_object('consequence', 'C2', 'confidence', 1)),
          coalesce(p_details, '{}'::jsonb) || jsonb_build_object('synthetic', true), v_due, 0, p_correlation);
  PERFORM executive.attention_event(v_item, p_tenant, p_domain, CASE v_state WHEN 'open' THEN 'item.routed' ELSE 'item.unrouted' END, p_actor,
            jsonb_build_object('outcome', 'material', 'reasons', p_reasons, 'policy_version', NULL, 'owner', p_owner, 'route_roles', '[]'::jsonb, 'due_at', v_due,
                               'cause_event_id', p_cause_event, 'cause_event_type', p_cause_type, 'unrouted', v_state = 'unrouted'), p_correlation);
  RETURN v_item;
END $$ LANGUAGE plpgsql;
/* The twin of this domain, locked for the act (or the refusal in the caller's family). */
CREATE OR REPLACE FUNCTION twin.tbr_twin(p_twin uuid, p_tenant uuid, p_domain uuid, p_noun text) RETURNS twin.twins_current
LANGUAGE plpgsql SET search_path = twin, pg_catalog, pg_temp AS $$
DECLARE t twin.twins_current%ROWTYPE;
BEGIN
  SELECT * INTO t FROM twin.twins_current x WHERE x.twin_id = p_twin AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION '% rejected (unknown_twin): % is not a twin of this domain', p_noun, p_twin USING ERRCODE = '23503'; END IF;
  RETURN t;
END $$;
/* The acting principal is the context's, and is the twin's OWN owner. */
CREATE OR REPLACE FUNCTION twin.tbr_assert_owner(t twin.twins_current, p_actor uuid, p_noun text, p_what text) RETURNS void
LANGUAGE plpgsql SET search_path = twin, public, pg_catalog, pg_temp AS $$
BEGIN
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION '% rejected (actor): recorded by the acting principal', p_noun USING ERRCODE = '42501';
  END IF;
  IF t.owner_principal_id IS DISTINCT FROM p_actor THEN
    RAISE EXCEPTION '% rejected (ownership): % is the act of the twin''s own owner (%), not of another holder of the role', p_noun, p_what, t.owner_principal_id USING ERRCODE = '42501';
  END IF;
END $$;
/* The head's age (days, by the database's day) against the twin's current policy: the shape version_freshness and the sweep share. */
CREATE OR REPLACE FUNCTION twin.tbr_age(p_twin uuid, p_version int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = twin, pg_catalog, pg_temp AS $$
  WITH v AS (SELECT * FROM twin.twin_versions x WHERE x.twin_id = p_twin AND x.version = p_version),
       p AS (SELECT * FROM twin.freshness_policies f WHERE f.twin_id = p_twin ORDER BY f.version DESC LIMIT 1),
       d AS (SELECT (clock_timestamp() AT TIME ZONE 'UTC')::date AS today)
  SELECT jsonb_build_object(
           'version', v.version, 'branch_id', v.branch_id, 'verification_state', v.verification_state,
           'basis', CASE WHEN v.observed_through IS NULL THEN 'known_at' ELSE 'observed_through' END,
           'reference_day', coalesce(v.observed_through, (v.known_at AT TIME ZONE 'UTC')::date),
           'today', d.today,
           'age_days', d.today - coalesce(v.observed_through, (v.known_at AT TIME ZONE 'UTC')::date),
           'policy', CASE WHEN p.twin_id IS NULL THEN NULL ELSE jsonb_build_object('version', p.version, 'max_age_days', p.max_age_days, 'key_max_age', p.key_max_age,
                                                                                    'near_expiry_hours', p.near_expiry_hours) END,
           'state', CASE WHEN p.twin_id IS NULL THEN 'unknown'
                         WHEN d.today - coalesce(v.observed_through, (v.known_at AT TIME ZONE 'UTC')::date) > p.max_age_days THEN 'stale' ELSE 'fresh' END,
           'stale_by_days', CASE WHEN p.twin_id IS NULL THEN NULL
                                 ELSE greatest(0, d.today - coalesce(v.observed_through, (v.known_at AT TIME ZONE 'UTC')::date) - p.max_age_days) END)
    FROM v CROSS JOIN d LEFT JOIN p ON true
$$;
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['twin.tbr_head(uuid,text)', 'twin.tbr_element_map(uuid,int)', 'twin.tbr_fork_base(uuid,text)', 'twin.tbr_diverging(uuid,int,int,int)',
                           'twin.tbr_resolutions(uuid)', 'twin.tbr_merge_expected(uuid)', 'twin.tbr_unresolved(uuid)',
                           'twin.tbr_event(uuid,uuid,uuid,uuid,text,uuid,jsonb,uuid,uuid)',
                           'twin.tbr_notify(uuid,uuid,text,text,uuid,text,jsonb,uuid,uuid,text,jsonb,interval,uuid,uuid)',
                           'twin.tbr_twin(uuid,uuid,uuid,text)', 'twin.tbr_assert_owner(twin.twins_current,uuid,text,text)', 'twin.tbr_age(uuid,int)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
  END LOOP;
END $$;
-- the reads below are INVOKER (eye_app / eye_commit): they call the pure helpers under the caller's own row security
GRANT EXECUTE ON FUNCTION twin.tbr_head(uuid,text), twin.tbr_element_map(uuid,int), twin.tbr_fork_base(uuid,text), twin.tbr_diverging(uuid,int,int,int),
                          twin.tbr_resolutions(uuid), twin.tbr_merge_expected(uuid), twin.tbr_unresolved(uuid), twin.tbr_age(uuid,int) TO eye_app, eye_commit;

-- §BR.4 THE PORTS ─────────────────────────────────────────────────────

/* THE FRESHNESS POLICY (twin.freshness.policy): the twin's own owner sets the next version. key_max_age: {key prefix: days}. */
CREATE OR REPLACE FUNCTION twin.set_freshness_policy(
  p_twin uuid, p_tenant uuid, p_domain uuid, p_max_age_days int, p_key_max_age jsonb, p_near_expiry_hours int, p_note text,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t twin.twins_current%ROWTYPE; v_version int; k text; v jsonb; p twin.freshness_policies%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.freshness.policy']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  t := twin.tbr_twin(p_twin, p_tenant, p_domain, 'freshness policy');
  PERFORM twin.tbr_assert_owner(t, p_actor, 'freshness policy', 'a freshness policy');
  IF p_max_age_days IS NULL OR p_max_age_days < 0 OR p_max_age_days > 3650 THEN
    RAISE EXCEPTION 'freshness policy rejected (max_age): the head''s maximum age is a whole number of days in [0, 3650]' USING ERRCODE = '22023';
  END IF;
  IF p_key_max_age IS NULL OR jsonb_typeof(p_key_max_age) <> 'object' THEN
    RAISE EXCEPTION 'freshness policy rejected (key_max_age): the per-key maximum ages are an object {key prefix: days}' USING ERRCODE = '22023';
  END IF;
  FOR k, v IN SELECT * FROM jsonb_each(p_key_max_age) LOOP
    IF k !~ '^[a-z][a-z0-9_.-]*(:[A-Za-z0-9_.-]+)?$' OR jsonb_typeof(v) <> 'number' OR (v #>> '{}') !~ '^[0-9]+$' OR (v #>> '{}')::int > 3650 THEN
      RAISE EXCEPTION 'freshness policy rejected (key_max_age): % must name a key prefix and a whole number of days in [0, 3650]', k USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF coalesce(p_near_expiry_hours, 24) NOT BETWEEN 1 AND 720 THEN
    RAISE EXCEPTION 'freshness policy rejected (near_expiry): a freeze is announced 1 to 720 hours before it expires' USING ERRCODE = '22023';
  END IF;
  IF p_note IS NULL OR length(btrim(p_note)) NOT BETWEEN 8 AND 2000 THEN
    RAISE EXCEPTION 'freshness policy rejected (note): a policy says why (8 to 2000 characters)' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(max(f.version), 0) + 1 INTO v_version FROM twin.freshness_policies f WHERE f.twin_id = p_twin;
  INSERT INTO twin.freshness_policies (twin_id, version, scope, tenant_id, domain_id, max_age_days, key_max_age, near_expiry_hours, note, set_by, correlation_id)
  VALUES (p_twin, v_version, 'DOMAIN', p_tenant, p_domain, p_max_age_days, p_key_max_age, coalesce(p_near_expiry_hours, 24), btrim(p_note), p_actor, p_correlation)
  RETURNING * INTO p;
  PERFORM twin.tbr_event(p_tenant, p_domain, p_twin, p_twin, 'freshness.policy_set', p_actor,
    jsonb_build_object('version', v_version, 'max_age_days', p_max_age_days, 'key_max_age', p_key_max_age, 'near_expiry_hours', p.near_expiry_hours), p_correlation, p_event_id);
  RETURN to_jsonb(p) - 'scope' - 'tenant_id' - 'domain_id';
END $$ LANGUAGE plpgsql;

/* OPEN A MERGE (twin.branch.merge): a holder of the action asks to merge branch X back into actual; the server computes the diverging keys from
   the two admitted heads and the branch's fork point and routes twin.reconciliation to the twin's owner. */
CREATE OR REPLACE FUNCTION twin.open_merge(
  p_merge_id uuid, p_twin uuid, p_tenant uuid, p_domain uuid, p_source_branch text, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t twin.twins_current%ROWTYPE; v_src int; v_tgt int; v_base int; v_div jsonb; m twin.branch_merges%ROWTYPE; v_ev uuid; v_item uuid; v_live uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.branch.merge']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'branch merge rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  t := twin.tbr_twin(p_twin, p_tenant, p_domain, 'branch merge');
  PERFORM 1 FROM twin.twins_current x WHERE x.twin_id = p_twin FOR UPDATE;
  IF p_source_branch IS NULL OR p_source_branch !~ '^[a-z][a-z0-9-]{0,40}$' OR p_source_branch = 'actual' THEN
    RAISE EXCEPTION 'branch merge rejected (branch): a merge takes a branch other than actual back into actual' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 8 AND 2000 THEN
    RAISE EXCEPTION 'branch merge rejected (reason): a merge says why (8 to 2000 characters)' USING ERRCODE = '22023';
  END IF;
  v_src := twin.tbr_head(p_twin, p_source_branch);
  IF v_src IS NULL THEN RAISE EXCEPTION 'branch merge rejected (unknown_branch): branch % of this twin has no admitted version', p_source_branch USING ERRCODE = '23503'; END IF;
  v_tgt := twin.tbr_head(p_twin, 'actual');
  IF v_tgt IS NULL THEN RAISE EXCEPTION 'branch merge rejected (unknown_branch): actual has no admitted version to merge into' USING ERRCODE = '23503'; END IF;
  SELECT x.merge_id INTO v_live FROM twin.branch_merges x WHERE x.twin_id = p_twin AND x.source_branch = p_source_branch AND x.state IN ('open', 'reconciled', 'completing');
  IF FOUND THEN RAISE EXCEPTION 'branch merge rejected (duplicate): branch % already has merge % in progress', p_source_branch, v_live USING ERRCODE = '23505'; END IF;
  v_base := twin.tbr_fork_base(p_twin, p_source_branch);
  v_div := twin.tbr_diverging(p_twin, v_src, v_tgt, v_base);
  IF jsonb_array_length(v_div) = 0 THEN
    RAISE EXCEPTION 'branch merge rejected (state): branch % (v%) changes nothing that differs from actual (v%); there is nothing to merge', p_source_branch, v_src, v_tgt USING ERRCODE = '22023';
  END IF;
  INSERT INTO twin.branch_merges (merge_id, scope, tenant_id, domain_id, twin_id, source_branch, source_version, target_version, base_version, diverging, state, reason, opened_by, correlation_id)
  VALUES (p_merge_id, 'DOMAIN', p_tenant, p_domain, p_twin, p_source_branch, v_src, v_tgt, v_base, v_div, 'open', btrim(p_reason), p_actor, p_correlation)
  RETURNING * INTO m;
  v_ev := twin.tbr_event(p_tenant, p_domain, p_twin, p_merge_id, 'merge.opened', p_actor,
    jsonb_build_object('source_branch', p_source_branch, 'source_version', v_src, 'target_version', v_tgt, 'base_version', v_base,
                       'diverging_keys', (SELECT jsonb_agg(d -> 'key') FROM jsonb_array_elements(v_div) d), 'reason', btrim(p_reason)), p_correlation, p_event_id);
  v_item := twin.tbr_notify(p_tenant, p_domain, 'twin.reconciliation', 'twin_branch', p_merge_id,
    format('Merge of branch %s into actual awaits reconciliation of %s diverging key(s) — %s', p_source_branch, jsonb_array_length(v_div), t.title),
    jsonb_build_array('merge_requires_reconciliation'), t.owner_principal_id, v_ev, 'twin.branch_merge.opened',
    jsonb_build_object('twin_id', p_twin, 'merge_id', p_merge_id, 'source_branch', p_source_branch, 'diverging', jsonb_array_length(v_div)), interval '3 days', p_actor, p_correlation);
  RETURN (to_jsonb(m) - 'scope' - 'tenant_id' - 'domain_id') || jsonb_build_object('unresolved', to_jsonb(twin.tbr_unresolved(p_merge_id)), 'attention_item_id', v_item);
END $$ LANGUAGE plpgsql;

/* RESOLVE ONE DIVERGING KEY (twin.branch.reconcile): the twin's own owner — keep_target | take_branch | reconciled (value, kind assumed or
   estimated, the typed citations of exact objects of this domain, evidence or an assumption). The last key resolved moves the merge to
   reconciled. A resolution may be re-stated (a later ordinal) until the merge completes. */
CREATE OR REPLACE FUNCTION twin.resolve_merge_key(
  p_merge uuid, p_tenant uuid, p_domain uuid, p_key text, p_resolution text, p_kind text, p_value jsonb, p_unit text, p_citations jsonb, p_note text,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, objects, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE m twin.branch_merges%ROWTYPE; t twin.twins_current%ROWTYPE; d jsonb; c jsonb; v_ord int; v_unres text[];
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.branch.reconcile']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO m FROM twin.branch_merges x WHERE x.merge_id = p_merge AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'branch merge rejected (unknown_merge): % is not a merge of this domain', p_merge USING ERRCODE = '23503'; END IF;
  t := twin.tbr_twin(m.twin_id, p_tenant, p_domain, 'branch merge');
  PERFORM twin.tbr_assert_owner(t, p_actor, 'branch merge', 'reconciling a merge');
  IF m.state NOT IN ('open', 'reconciled') THEN
    RAISE EXCEPTION 'branch merge rejected (state): merge % is %; a key is resolved while the merge is open or reconciled', p_merge, m.state USING ERRCODE = '2F002';
  END IF;
  SELECT x INTO d FROM jsonb_array_elements(m.diverging) x WHERE x ->> 'key' = p_key;
  IF d IS NULL THEN RAISE EXCEPTION 'branch merge rejected (unknown_key): % is not a diverging key of merge %', p_key, p_merge USING ERRCODE = '23503'; END IF;
  IF p_resolution IS NULL OR p_resolution NOT IN ('keep_target', 'take_branch', 'reconciled') THEN
    RAISE EXCEPTION 'branch merge rejected (resolution): a key is resolved keep_target, take_branch or reconciled' USING ERRCODE = '22023';
  END IF;
  IF p_note IS NULL OR length(btrim(p_note)) NOT BETWEEN 8 AND 2000 THEN
    RAISE EXCEPTION 'branch merge rejected (note): a resolution says why (8 to 2000 characters)' USING ERRCODE = '22023';
  END IF;
  IF p_resolution = 'take_branch' AND (d -> 'source' ->> 'kind') = 'scenario' THEN
    RAISE EXCEPTION 'branch merge rejected (scenario): % is a SCENARIO value on branch %; a scenario value does not become actual state — keep actual''s value or reconcile it with evidence', p_key, m.source_branch USING ERRCODE = '22023';
  END IF;
  IF p_resolution <> 'reconciled' THEN
    IF p_value IS NOT NULL OR p_kind IS NOT NULL OR coalesce(jsonb_array_length(p_citations), 0) > 0 THEN
      RAISE EXCEPTION 'branch merge rejected (resolution): only a reconciled key states a value, a kind and citations' USING ERRCODE = '22023';
    END IF;
  ELSE
    IF p_kind IS NULL OR p_kind NOT IN ('assumed', 'estimated') THEN
      RAISE EXCEPTION 'branch merge rejected (kind): a reconciled value is assumed or estimated — the owner''s judgement, never observed' USING ERRCODE = '22023';
    END IF;
    IF p_value IS NULL OR jsonb_typeof(p_value) = 'null' THEN RAISE EXCEPTION 'branch merge rejected (value): a reconciled key states its value' USING ERRCODE = '22023'; END IF;
    IF NOT twin.citations_ok(p_citations) OR jsonb_array_length(p_citations) = 0 OR twin.citation_count(p_citations, 'claim') > 0
       OR twin.citation_count(p_citations, 'evidence') + twin.citation_count(p_citations, 'assumption') = 0 THEN
      RAISE EXCEPTION 'branch merge rejected (citations): a reconciled value cites the evidence or the assumption it rests on — exact {kind, id, version, digest}' USING ERRCODE = '22023';
    END IF;
    FOR c IN SELECT * FROM jsonb_array_elements(p_citations) LOOP
      IF (c ->> 'kind') <> 'entity' AND NOT EXISTS (SELECT 1 FROM objects.canonical_objects o
           WHERE o.object_id = (c ->> 'id')::uuid AND o.object_version = (c ->> 'version')::int AND o.content_digest = (c ->> 'digest')
             AND o.tenant_id = p_tenant AND o.domain_id = p_domain) THEN
        RAISE EXCEPTION 'branch merge rejected (unknown_citation): % %@% is not an exact object of this domain', c ->> 'kind', c ->> 'id', c ->> 'version' USING ERRCODE = '23503';
      END IF;
    END LOOP;
  END IF;
  SELECT coalesce(max(r.ordinal), 0) + 1 INTO v_ord FROM twin.merge_resolutions r WHERE r.merge_id = p_merge AND r.key = p_key;
  INSERT INTO twin.merge_resolutions (merge_id, key, ordinal, scope, tenant_id, domain_id, resolution, kind, value, unit, citations, note, resolved_by, correlation_id)
  VALUES (p_merge, p_key, v_ord, 'DOMAIN', p_tenant, p_domain, p_resolution, CASE WHEN p_resolution = 'reconciled' THEN p_kind END,
          CASE WHEN p_resolution = 'reconciled' THEN p_value END, CASE WHEN p_resolution = 'reconciled' THEN p_unit END,
          CASE WHEN p_resolution = 'reconciled' THEN p_citations ELSE '[]'::jsonb END, btrim(p_note), p_actor, p_correlation);
  PERFORM twin.tbr_event(p_tenant, p_domain, m.twin_id, p_merge, 'merge.key_resolved', p_actor,
    jsonb_build_object('key', p_key, 'ordinal', v_ord, 'resolution', p_resolution, 'conflict', d -> 'conflict', 'change', d -> 'change'), p_correlation, p_event_id);
  v_unres := twin.tbr_unresolved(p_merge);
  IF cardinality(v_unres) = 0 AND m.state = 'open' THEN
    UPDATE twin.branch_merges SET state = 'reconciled' WHERE merge_id = p_merge;
    PERFORM twin.tbr_event(p_tenant, p_domain, m.twin_id, p_merge, 'merge.reconciled', p_actor,
      jsonb_build_object('keys', jsonb_array_length(m.diverging)), p_correlation);
  END IF;
  RETURN (SELECT (to_jsonb(x) - 'scope' - 'tenant_id' - 'domain_id') || jsonb_build_object('unresolved', to_jsonb(v_unres), 'key', p_key, 'ordinal', v_ord)
            FROM twin.branch_merges x WHERE x.merge_id = p_merge);
END $$ LANGUAGE plpgsql;

/* COMPLETE A MERGE (twin.branch.merge): the twin's own owner. REFUSED while any diverging key is unresolved — merging the branch back is
   refused until reconciliation — and when either head moved since the merge was opened (stale: open a new merge), or actual has an open draft.
   It FIXES the plan (completing) and answers it: the draft to open on actual (carrying actual's head except the keys the plan changes), the
   elements to ground (the branch's, or the owner's reconciled values), the state actual must then hold. The draft, its grounding and its
   admission are the EXISTING ports' acts (TS, each its own governed write); the admission of the plan moves the merge to merged
   (tbr_merge_admitted). A second call by the same owner while completing answers the same plan (a resumed completion). */
CREATE OR REPLACE FUNCTION twin.complete_merge(p_merge uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE m twin.branch_merges%ROWTYPE; t twin.twins_current%ROWTYPE; v_unres text[]; v_draft int; v_expected jsonb; v_target jsonb; v_except text[]; v_ground jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.branch.merge']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO m FROM twin.branch_merges x WHERE x.merge_id = p_merge AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'branch merge rejected (unknown_merge): % is not a merge of this domain', p_merge USING ERRCODE = '23503'; END IF;
  t := twin.tbr_twin(m.twin_id, p_tenant, p_domain, 'branch merge');
  PERFORM twin.tbr_assert_owner(t, p_actor, 'branch merge', 'completing a merge');
  IF m.state NOT IN ('open', 'reconciled', 'completing') THEN
    RAISE EXCEPTION 'branch merge rejected (state): merge % is %', p_merge, m.state USING ERRCODE = '2F002';
  END IF;
  v_unres := twin.tbr_unresolved(p_merge);
  IF cardinality(v_unres) > 0 THEN
    RAISE EXCEPTION 'branch merge rejected (unreconciled): merging branch % back into actual is refused until reconciliation — % of % diverging key(s) unresolved: %',
      m.source_branch, cardinality(v_unres), jsonb_array_length(m.diverging), array_to_string(v_unres, ', ') USING ERRCODE = '2F002';
  END IF;
  IF twin.tbr_head(m.twin_id, m.source_branch) IS DISTINCT FROM m.source_version OR twin.tbr_head(m.twin_id, 'actual') IS DISTINCT FROM m.target_version THEN
    RAISE EXCEPTION 'branch merge rejected (stale): the heads moved since merge % was opened (branch % v% → v%, actual v% → v%); withdraw it and open a new merge',
      p_merge, m.source_branch, m.source_version, twin.tbr_head(m.twin_id, m.source_branch), m.target_version, twin.tbr_head(m.twin_id, 'actual') USING ERRCODE = '2F002';
  END IF;
  SELECT v.version INTO v_draft FROM twin.twin_versions v WHERE v.twin_id = m.twin_id AND v.branch_id = 'actual' AND v.state = 'draft';
  IF m.state <> 'completing' THEN
    IF v_draft IS NOT NULL THEN
      RAISE EXCEPTION 'branch merge rejected (state): actual has an open draft v%; admit or withdraw it before the merge is completed', v_draft USING ERRCODE = '2F002';
    END IF;
    UPDATE twin.branch_merges SET state = 'completing', completing_by = p_actor, completing_at = clock_timestamp() WHERE merge_id = p_merge;
    PERFORM twin.tbr_event(p_tenant, p_domain, m.twin_id, p_merge, 'merge.completing', p_actor,
      jsonb_build_object('target_version', m.target_version, 'source_version', m.source_version), p_correlation, p_event_id);
  ELSIF m.completing_by IS DISTINCT FROM p_actor THEN
    RAISE EXCEPTION 'branch merge rejected (state): merge % is being completed by %', p_merge, m.completing_by USING ERRCODE = '2F002';
  END IF;
  v_expected := twin.tbr_merge_expected(p_merge);
  v_target := twin.tbr_element_map(m.twin_id, m.target_version);
  SELECT coalesce(array_agg(k ORDER BY k), ARRAY[]::text[]) INTO v_except
    FROM (SELECT jsonb_object_keys(v_target) k) x WHERE (v_expected -> k) IS DISTINCT FROM (v_target -> k);
  SELECT coalesce(jsonb_agg(jsonb_build_object('key', r.key, 'resolution', r.resolution, 'kind', r.kind, 'value', r.value, 'unit', r.unit, 'citations', r.citations) ORDER BY r.key), '[]'::jsonb)
    INTO v_ground
    FROM twin.tbr_resolutions(p_merge) r
   WHERE (r.resolution = 'take_branch' AND v_expected ? r.key) OR r.resolution = 'reconciled';
  RETURN (SELECT (to_jsonb(x) - 'scope' - 'tenant_id' - 'domain_id') FROM twin.branch_merges x WHERE x.merge_id = p_merge)
         || jsonb_build_object('plan', jsonb_build_object('carry_from', m.target_version, 'except', to_jsonb(v_except), 'ground', v_ground, 'expected', v_expected,
                                                          'open_draft', v_draft));
END $$ LANGUAGE plpgsql;

/* CLOSE A MERGE (twin.branch.merge): refused — the twin's own owner declines it; withdrawn — its opener or the owner. A completing merge is
   released this way too (actual is no longer held). */
CREATE OR REPLACE FUNCTION twin.close_merge(p_merge uuid, p_tenant uuid, p_domain uuid, p_outcome text, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE m twin.branch_merges%ROWTYPE; t twin.twins_current%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.branch.merge']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'branch merge rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO m FROM twin.branch_merges x WHERE x.merge_id = p_merge AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'branch merge rejected (unknown_merge): % is not a merge of this domain', p_merge USING ERRCODE = '23503'; END IF;
  t := twin.tbr_twin(m.twin_id, p_tenant, p_domain, 'branch merge');
  IF p_outcome IS NULL OR p_outcome NOT IN ('refused', 'withdrawn') THEN
    RAISE EXCEPTION 'branch merge rejected (outcome): a merge is closed refused or withdrawn' USING ERRCODE = '22023';
  END IF;
  IF p_outcome = 'refused' AND t.owner_principal_id IS DISTINCT FROM p_actor THEN
    RAISE EXCEPTION 'branch merge rejected (ownership): only the twin''s own owner (%) refuses a merge', t.owner_principal_id USING ERRCODE = '42501';
  END IF;
  IF p_outcome = 'withdrawn' AND p_actor IS DISTINCT FROM m.opened_by AND p_actor IS DISTINCT FROM t.owner_principal_id THEN
    RAISE EXCEPTION 'branch merge rejected (ownership): a merge is withdrawn by its opener or the twin''s own owner' USING ERRCODE = '42501';
  END IF;
  IF m.state NOT IN ('open', 'reconciled', 'completing') THEN
    RAISE EXCEPTION 'branch merge rejected (state): merge % is already %', p_merge, m.state USING ERRCODE = '2F002';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 8 AND 2000 THEN
    RAISE EXCEPTION 'branch merge rejected (reason): closing a merge says why (8 to 2000 characters)' USING ERRCODE = '22023';
  END IF;
  UPDATE twin.branch_merges SET state = p_outcome, closed_by = p_actor, closed_at = clock_timestamp(), close_reason = btrim(p_reason) WHERE merge_id = p_merge;
  PERFORM twin.tbr_event(p_tenant, p_domain, m.twin_id, p_merge, CASE p_outcome WHEN 'refused' THEN 'merge.refused' ELSE 'merge.withdrawn' END, p_actor,
    jsonb_build_object('prior_state', m.state, 'reason', btrim(p_reason)), p_correlation, p_event_id);
  RETURN (SELECT to_jsonb(x) - 'scope' - 'tenant_id' - 'domain_id' FROM twin.branch_merges x WHERE x.merge_id = p_merge);
END $$ LANGUAGE plpgsql;

/* RESTORE A CHECKPOINT (twin.branch.restore): records — with its reason — that the draft the twin's own owner just opened on a branch (through
   the existing open port, carrying from a named EARLIER admitted version) restores that checkpoint. The port verifies the facts: the draft is
   an open draft of this branch opened by the actor, its opening carried from the named version, and that version is admitted and older than
   the branch's head (or the branch has no head). */
CREATE OR REPLACE FUNCTION twin.restore_checkpoint(
  p_twin uuid, p_tenant uuid, p_domain uuid, p_branch text, p_from_version int, p_draft_version int, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t twin.twins_current%ROWTYPE; d twin.twin_versions%ROWTYPE; f twin.twin_versions%ROWTYPE; v_head int; v_carried text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.branch.restore']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  t := twin.tbr_twin(p_twin, p_tenant, p_domain, 'checkpoint restore');
  PERFORM twin.tbr_assert_owner(t, p_actor, 'checkpoint restore', 'restoring a checkpoint');
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 8 AND 2000 THEN
    RAISE EXCEPTION 'checkpoint restore rejected (reason): a restore says why (8 to 2000 characters)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO f FROM twin.twin_versions v WHERE v.twin_id = p_twin AND v.version = p_from_version;
  IF NOT FOUND OR f.state <> 'admitted' THEN
    RAISE EXCEPTION 'checkpoint restore rejected (unknown_checkpoint): version % is not an admitted version of this twin', p_from_version USING ERRCODE = '23503';
  END IF;
  SELECT * INTO d FROM twin.twin_versions v WHERE v.twin_id = p_twin AND v.version = p_draft_version;
  IF NOT FOUND OR d.state <> 'draft' OR d.branch_id <> p_branch OR d.opened_by <> p_actor THEN
    RAISE EXCEPTION 'checkpoint restore rejected (state): version % is not an open draft of branch % opened by the acting principal', p_draft_version, p_branch USING ERRCODE = '2F002';
  END IF;
  SELECT e.details ->> 'carried_from' INTO v_carried FROM twin.twin_events e
   WHERE e.twin_id = p_twin AND e.event = 'version.opened' AND (e.details ->> 'version')::int = p_draft_version ORDER BY e.occurred_at DESC LIMIT 1;
  IF v_carried IS NULL OR v_carried::int <> p_from_version THEN
    RAISE EXCEPTION 'checkpoint restore rejected (state): draft v% did not carry from v% (it carried from %)', p_draft_version, p_from_version, coalesce(v_carried, 'nothing') USING ERRCODE = '2F002';
  END IF;
  v_head := twin.tbr_head(p_twin, p_branch);
  IF v_head IS NOT NULL AND p_from_version >= v_head THEN
    RAISE EXCEPTION 'checkpoint restore rejected (checkpoint): v% is not earlier than the head v% of branch %; a restore returns to an earlier checkpoint', p_from_version, v_head, p_branch USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM twin.branch_events b WHERE b.twin_id = p_twin AND b.event = 'checkpoint.restored' AND (b.details ->> 'draft_version')::int = p_draft_version) THEN
    RAISE EXCEPTION 'checkpoint restore rejected (duplicate): draft v% is already recorded as a restore', p_draft_version USING ERRCODE = '23505';
  END IF;
  PERFORM twin.tbr_event(p_tenant, p_domain, p_twin, p_twin, 'checkpoint.restored', p_actor,
    jsonb_build_object('branch_id', p_branch, 'from_version', p_from_version, 'from_branch', f.branch_id, 'draft_version', p_draft_version, 'head_version', v_head,
                       'reason', btrim(p_reason)), p_correlation, p_event_id);
  RETURN jsonb_build_object('twin_id', p_twin, 'branch_id', p_branch, 'from_version', p_from_version, 'from_branch', f.branch_id, 'draft_version', p_draft_version,
                            'head_version', v_head, 'reason', btrim(p_reason));
END $$ LANGUAGE plpgsql;

/* FREEZE THE LAST VALIDATED SNAPSHOT (twin.snapshot.freeze): the twin's own owner; the version is the branch's LAST admitted version found FIT
   (twin.validate_version — a person other than the owner); a warning and an expiry instant (after now, within a year) are required. */
CREATE OR REPLACE FUNCTION twin.freeze_snapshot(
  p_freeze_id uuid, p_twin uuid, p_tenant uuid, p_domain uuid, p_branch text, p_version int, p_warning text, p_expires_at timestamptz,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t twin.twins_current%ROWTYPE; v twin.twin_versions%ROWTYPE; v_branch text := coalesce(p_branch, 'actual'); f twin.snapshot_freezes%ROWTYPE; v_standing uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.snapshot.freeze']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  t := twin.tbr_twin(p_twin, p_tenant, p_domain, 'snapshot');
  PERFORM twin.tbr_assert_owner(t, p_actor, 'snapshot', 'freezing the served snapshot');
  PERFORM 1 FROM twin.twins_current x WHERE x.twin_id = p_twin FOR UPDATE;
  SELECT x.freeze_id INTO v_standing FROM twin.snapshot_freezes x WHERE x.twin_id = p_twin AND x.lifted_at IS NULL;
  IF FOUND THEN RAISE EXCEPTION 'snapshot rejected (duplicate): freeze % already stands on this twin; lift it first', v_standing USING ERRCODE = '23505'; END IF;
  SELECT * INTO v FROM twin.twin_versions x WHERE x.twin_id = p_twin AND x.branch_id = v_branch AND x.state = 'admitted' AND x.fitness_state = 'fit'
   ORDER BY x.version DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'snapshot rejected (state): branch % has no admitted version validated fit; only a validated snapshot is frozen', v_branch USING ERRCODE = '2F002';
  END IF;
  IF p_version IS NOT NULL AND p_version <> v.version THEN
    RAISE EXCEPTION 'snapshot rejected (state): v% is not the last validated snapshot of branch % (v% is)', p_version, v_branch, v.version USING ERRCODE = '2F002';
  END IF;
  IF p_warning IS NULL OR length(btrim(p_warning)) NOT BETWEEN 8 AND 1000 THEN
    RAISE EXCEPTION 'snapshot rejected (warning): a frozen snapshot carries its freshness warning (8 to 1000 characters)' USING ERRCODE = '22023';
  END IF;
  IF p_expires_at IS NULL OR p_expires_at <= clock_timestamp() OR p_expires_at > clock_timestamp() + interval '365 days' THEN
    RAISE EXCEPTION 'snapshot rejected (expiry): a frozen snapshot expires after now and within a year' USING ERRCODE = '22023';
  END IF;
  INSERT INTO twin.snapshot_freezes (freeze_id, scope, tenant_id, domain_id, twin_id, branch_id, version, validation_id, warning, expires_at, frozen_by, correlation_id)
  VALUES (p_freeze_id, 'DOMAIN', p_tenant, p_domain, p_twin, v_branch, v.version, v.fitness_validation_id, btrim(p_warning), p_expires_at, p_actor, p_correlation)
  RETURNING * INTO f;
  PERFORM twin.tbr_event(p_tenant, p_domain, p_twin, p_freeze_id, 'snapshot.frozen', p_actor,
    jsonb_build_object('branch_id', v_branch, 'version', v.version, 'validation_id', v.fitness_validation_id, 'expires_at', p_expires_at,
                       'head_version', twin.tbr_head(p_twin, v_branch)), p_correlation, p_event_id);
  RETURN to_jsonb(f) - 'scope' - 'tenant_id' - 'domain_id';
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION twin.lift_freeze(p_freeze_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE f twin.snapshot_freezes%ROWTYPE; t twin.twins_current%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.snapshot.freeze']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO f FROM twin.snapshot_freezes x WHERE x.freeze_id = p_freeze_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'snapshot rejected (unknown_freeze): % is not a freeze of this domain', p_freeze_id USING ERRCODE = '23503'; END IF;
  t := twin.tbr_twin(f.twin_id, p_tenant, p_domain, 'snapshot');
  PERFORM twin.tbr_assert_owner(t, p_actor, 'snapshot', 'lifting a freeze');
  IF f.lifted_at IS NOT NULL THEN RAISE EXCEPTION 'snapshot rejected (state): freeze % was lifted at %', p_freeze_id, f.lifted_at USING ERRCODE = '2F002'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 8 AND 2000 THEN
    RAISE EXCEPTION 'snapshot rejected (reason): lifting a freeze says why (8 to 2000 characters)' USING ERRCODE = '22023';
  END IF;
  UPDATE twin.snapshot_freezes SET lifted_by = p_actor, lifted_at = clock_timestamp(), lift_reason = btrim(p_reason) WHERE freeze_id = p_freeze_id RETURNING * INTO f;
  PERFORM twin.tbr_event(p_tenant, p_domain, f.twin_id, p_freeze_id, 'snapshot.lifted', p_actor,
    jsonb_build_object('version', f.version, 'expired', f.expires_at <= f.lifted_at, 'reason', btrim(p_reason)), p_correlation, p_event_id);
  RETURN to_jsonb(f) - 'scope' - 'tenant_id' - 'domain_id';
END $$ LANGUAGE plpgsql;

/* THE TICK STEP `twin-freshness` (executive.attention.tick): for each twin of the domain with a freshness policy, its actual head past the SLO
   → freshness.breached + twin.freshness to the owner, once per (head version, policy version); each standing freeze past its expiry →
   freeze.expired, or within the policy's near-expiry hours (24 without a policy) → freeze.expiring — each once. */
CREATE OR REPLACE FUNCTION twin.freshness_sweep(p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x record; a jsonb; v_head int; v_ev uuid; v_item uuid; v_out jsonb := '[]'::jsonb; v_seen int := 0; v_breach int := 0; v_freeze int := 0; v_hours int; v_kind text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  FOR x IN SELECT t.twin_id, t.title, t.owner_principal_id FROM twin.twins_current t
            WHERE t.tenant_id = p_tenant AND t.domain_id = p_domain AND EXISTS (SELECT 1 FROM twin.freshness_policies f WHERE f.twin_id = t.twin_id)
            ORDER BY t.declared_at, t.twin_id LOOP
    v_seen := v_seen + 1;
    v_head := twin.tbr_head(x.twin_id, 'actual');
    IF v_head IS NULL THEN CONTINUE; END IF;
    a := twin.tbr_age(x.twin_id, v_head);
    IF a ->> 'state' <> 'stale' THEN CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM twin.branch_events b WHERE b.twin_id = x.twin_id AND b.event = 'freshness.breached'
                AND (b.details ->> 'version')::int = v_head AND (b.details ->> 'policy_version')::int = (a -> 'policy' ->> 'version')::int) THEN CONTINUE; END IF;
    v_ev := twin.tbr_event(p_tenant, p_domain, x.twin_id, x.twin_id, 'freshness.breached', p_actor,
      jsonb_build_object('version', v_head, 'policy_version', (a -> 'policy' ->> 'version')::int, 'age_days', a -> 'age_days', 'max_age_days', a -> 'policy' -> 'max_age_days',
                         'basis', a -> 'basis', 'reference_day', a -> 'reference_day'), p_correlation);
    v_item := twin.tbr_notify(p_tenant, p_domain, 'twin.freshness', 'twin', x.twin_id,
      format('%s: the served snapshot v%s is %s days stale (freshness SLO %s days)', x.title, v_head, a ->> 'age_days', a -> 'policy' ->> 'max_age_days'),
      jsonb_build_array('freshness_slo_breached'), x.owner_principal_id, v_ev, 'twin.freshness.breached',
      jsonb_build_object('twin_id', x.twin_id, 'version', v_head, 'age_days', a -> 'age_days', 'max_age_days', a -> 'policy' -> 'max_age_days'), interval '1 day', p_actor, p_correlation);
    v_breach := v_breach + 1;
    v_out := v_out || jsonb_build_object('twin_id', x.twin_id, 'kind', 'freshness.breached', 'version', v_head, 'attention_item_id', v_item);
  END LOOP;
  FOR x IN SELECT f.*, t.title, t.owner_principal_id FROM twin.snapshot_freezes f JOIN twin.twins_current t ON t.twin_id = f.twin_id
            WHERE f.tenant_id = p_tenant AND f.domain_id = p_domain AND f.lifted_at IS NULL ORDER BY f.frozen_at, f.freeze_id LOOP
    SELECT p.near_expiry_hours INTO v_hours FROM twin.freshness_policies p WHERE p.twin_id = x.twin_id ORDER BY p.version DESC LIMIT 1;
    v_kind := CASE WHEN x.expires_at <= clock_timestamp() THEN 'freeze.expired'
                   WHEN x.expires_at <= clock_timestamp() + make_interval(hours => coalesce(v_hours, 24)) THEN 'freeze.expiring' END;
    IF v_kind IS NULL OR EXISTS (SELECT 1 FROM twin.branch_events b WHERE b.subject_id = x.freeze_id AND b.event = v_kind) THEN CONTINUE; END IF;
    v_ev := twin.tbr_event(p_tenant, p_domain, x.twin_id, x.freeze_id, v_kind, p_actor,
      jsonb_build_object('version', x.version, 'expires_at', x.expires_at), p_correlation);
    v_item := twin.tbr_notify(p_tenant, p_domain, 'twin.freshness', 'twin', x.twin_id,
      format('%s: the frozen snapshot v%s %s at %s', x.title, x.version, CASE v_kind WHEN 'freeze.expired' THEN 'expired' ELSE 'expires' END, to_char(x.expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI "UTC"')),
      jsonb_build_array(CASE v_kind WHEN 'freeze.expired' THEN 'frozen_snapshot_expired' ELSE 'frozen_snapshot_nearing_expiry' END), x.owner_principal_id, v_ev, 'twin.' || v_kind,
      jsonb_build_object('twin_id', x.twin_id, 'freeze_id', x.freeze_id, 'version', x.version, 'expires_at', x.expires_at), interval '1 day', p_actor, p_correlation);
    v_freeze := v_freeze + 1;
    v_out := v_out || jsonb_build_object('twin_id', x.twin_id, 'kind', v_kind, 'freeze_id', x.freeze_id, 'attention_item_id', v_item);
  END LOOP;
  RETURN jsonb_build_object('considered', v_seen, 'breaches', v_breach, 'freezes', v_freeze, 'raised', v_out);
END $$ LANGUAGE plpgsql;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['twin.set_freshness_policy(uuid,uuid,uuid,int,jsonb,int,text,uuid,uuid,uuid)',
                           'twin.open_merge(uuid,uuid,uuid,uuid,text,text,uuid,uuid,uuid)',
                           'twin.resolve_merge_key(uuid,uuid,uuid,text,text,text,jsonb,text,jsonb,text,uuid,uuid,uuid)',
                           'twin.complete_merge(uuid,uuid,uuid,uuid,uuid,uuid)',
                           'twin.close_merge(uuid,uuid,uuid,text,text,uuid,uuid,uuid)',
                           'twin.restore_checkpoint(uuid,uuid,uuid,text,int,int,text,uuid,uuid,uuid)',
                           'twin.freeze_snapshot(uuid,uuid,uuid,uuid,text,int,text,timestamptz,uuid,uuid,uuid)',
                           'twin.lift_freeze(uuid,uuid,uuid,text,uuid,uuid,uuid)',
                           'twin.freshness_sweep(uuid,uuid,uuid,uuid)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO eye_commit', f);
  END LOOP;
END $$;

-- §BR.5 THE READS (INVOKER: the caller's own row security decides what is seen) ─────────

/* FRESHNESS of a version: the age by the database's day against the twin's policy; per element, staleness by age (expired — valid_to before
   today; stale — judged stale at carry, or older than its key's maximum age); and the DEPENDENCY uncertainty — each live upstream twin (through
   twin.twin_links) with its head, its verification state, its own freshness, and whether this version cites an older upstream version. */
CREATE OR REPLACE FUNCTION twin.version_freshness(p_twin uuid, p_version int) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = twin, pg_catalog, pg_temp AS $$
DECLARE a jsonb; v twin.twin_versions%ROWTYPE; v_today date := (clock_timestamp() AT TIME ZONE 'UTC')::date; v_ref date; v_keys jsonb; v_elements jsonb; v_up jsonb; v_dep text;
BEGIN
  SELECT * INTO v FROM twin.twin_versions x WHERE x.twin_id = p_twin AND x.version = p_version;
  IF NOT FOUND THEN RETURN NULL; END IF;
  a := twin.tbr_age(p_twin, p_version);
  v_ref := (a ->> 'reference_day')::date;
  v_keys := coalesce(a -> 'policy' -> 'key_max_age', '{}'::jsonb);
  SELECT coalesce(jsonb_agg(z ORDER BY z ->> 'key'), '[]'::jsonb) INTO v_elements FROM (
    SELECT jsonb_build_object('key', e.key, 'kind', e.kind, 'health', e.health, 'valid_from', e.valid_from, 'valid_to', e.valid_to,
             'age_days', v_today - coalesce(e.valid_from, v_ref),
             'max_age_days', mk.days,
             'state', CASE WHEN e.valid_to IS NOT NULL AND e.valid_to < v_today THEN 'expired'
                           WHEN e.health = 'stale' THEN 'stale'
                           WHEN mk.days IS NOT NULL AND v_today - coalesce(e.valid_from, v_ref) > mk.days THEN 'stale'
                           WHEN mk.days IS NULL AND e.valid_to IS NULL THEN 'unbounded'
                           ELSE 'fresh' END) z
      FROM twin.state_elements e
      LEFT JOIN LATERAL (SELECT (k.value #>> '{}')::int AS days FROM jsonb_each(v_keys) k
                          WHERE e.key = k.key OR split_part(e.key, ':', 1) = k.key OR split_part(e.key, ':', 1) LIKE k.key || '.%'
                          ORDER BY length(k.key) DESC LIMIT 1) mk ON true
     WHERE e.twin_id = p_twin AND e.version = p_version) q;
  SELECT coalesce(jsonb_agg(u ORDER BY u ->> 'title'), '[]'::jsonb) INTO v_up FROM (
    SELECT jsonb_build_object('twin_id', l.upstream_twin_id, 'title', ut.title, 'link_id', l.link_id, 'head_version', h.head,
             'cited_version', cv.cited,
             'behind', cv.cited IS NOT NULL AND h.head IS NOT NULL AND cv.cited < h.head,
             'verification_state', CASE WHEN h.head IS NULL THEN NULL ELSE (twin.tbr_age(l.upstream_twin_id, h.head) ->> 'verification_state') END,
             'freshness', CASE WHEN h.head IS NULL THEN 'no_head' ELSE (twin.tbr_age(l.upstream_twin_id, h.head) ->> 'state') END,
             'age_days', CASE WHEN h.head IS NULL THEN NULL ELSE (twin.tbr_age(l.upstream_twin_id, h.head) -> 'age_days') END) u
      FROM twin.twin_links l
      JOIN twin.twins_current ut ON ut.twin_id = l.upstream_twin_id
      CROSS JOIN LATERAL (SELECT twin.tbr_head(l.upstream_twin_id, 'actual') AS head) h
      CROSS JOIN LATERAL (SELECT max((c ->> 'version')::int) AS cited FROM twin.state_elements e, jsonb_array_elements(e.citations) c
                           WHERE e.twin_id = p_twin AND e.version = p_version AND c ->> 'kind' = 'twin' AND (c ->> 'id')::uuid = l.upstream_twin_id) cv
     WHERE l.downstream_twin_id = p_twin AND l.state = 'live') q;
  v_dep := CASE WHEN jsonb_array_length(v_up) = 0 THEN 'none'
                WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_up) u WHERE u ->> 'freshness' IN ('stale', 'no_head') OR u ->> 'verification_state' = 'unverified'
                                                                      OR (u ->> 'behind')::boolean) THEN 'uncertain'
                ELSE 'certain' END;
  RETURN a || jsonb_build_object(
    'twin_id', p_twin, 'state_of_version', v.state, 'known_at', v.known_at, 'observed_through', v.observed_through, 'fitness_state', v.fitness_state,
    'elements', v_elements,
    'stale_elements', (SELECT count(*) FROM jsonb_array_elements(v_elements) z WHERE z ->> 'state' IN ('stale', 'expired')),
    'dependency', jsonb_build_object('state', v_dep, 'upstream', v_up,
                                     'rule', 'uncertain when an upstream twin has no admitted head, is stale against its own policy, is unverified, or this version cites an older upstream version than its head'),
    'method', 'freshness@1 — age = the database''s day − observed_through (else the day of known_at); stale when age > the policy''s max_age_days; an element is expired when valid_to is before today, stale when judged stale at carry or older than its key''s max age (from valid_from, else the version''s reference day), unbounded with no validity end and no key policy');
END $$;

/* COMPONENT-LEVEL CONFIDENCE: the elements grouped by component (the key's first segment: inventory, shipment, terms, …) and by kind; per group
   the weakest link (minimum) and the mean of the STATED confidences, the coverage (stated / elements) and the unhealthy count. Nothing imputed. */
CREATE OR REPLACE FUNCTION twin.confidence_rollup(p_twin uuid, p_version int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = twin, pg_catalog, pg_temp AS $$
  WITH e AS (SELECT e.key, e.kind, e.health, e.confidence, split_part(split_part(e.key, ':', 1), '.', 1) AS component
               FROM twin.state_elements e WHERE e.twin_id = p_twin AND e.version = p_version),
       agg AS (SELECT 'component' AS grp_by, component AS grp, count(*) n, count(confidence) stated, min(confidence) weakest, avg(confidence) mean,
                      count(*) FILTER (WHERE health <> 'complete') unhealthy, jsonb_agg(DISTINCT kind) kinds
                 FROM e GROUP BY component
               UNION ALL
               SELECT 'kind', kind, count(*), count(confidence), min(confidence), avg(confidence), count(*) FILTER (WHERE health <> 'complete'), jsonb_build_array(kind)
                 FROM e GROUP BY kind)
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM twin.twin_versions v WHERE v.twin_id = p_twin AND v.version = p_version) THEN NULL ELSE jsonb_build_object(
    'twin_id', p_twin, 'version', p_version,
    'overall', (SELECT jsonb_build_object('elements', count(*), 'stated', count(confidence), 'weakest', min(confidence), 'mean', round(avg(confidence), 4),
                                          'coverage', CASE WHEN count(*) = 0 THEN NULL ELSE round(count(confidence)::numeric / count(*), 4) END,
                                          'unhealthy', count(*) FILTER (WHERE health <> 'complete')) FROM e),
    'components', coalesce((SELECT jsonb_agg(jsonb_build_object('component', grp, 'elements', n, 'stated', stated, 'weakest', weakest, 'mean', round(mean, 4),
                                                             'coverage', round(stated::numeric / n, 4), 'unhealthy', unhealthy, 'kinds', kinds) ORDER BY grp)
                              FROM agg WHERE grp_by = 'component'), '[]'::jsonb),
    'kinds', coalesce((SELECT jsonb_agg(jsonb_build_object('kind', grp, 'elements', n, 'stated', stated, 'weakest', weakest, 'mean', round(mean, 4),
                                                        'coverage', round(stated::numeric / n, 4), 'unhealthy', unhealthy) ORDER BY grp)
                         FROM agg WHERE grp_by = 'kind'), '[]'::jsonb),
    'method', 'confidence-rollup@1 — per group (component = the key''s first segment; and per kind): weakest = the minimum and mean = the mean of the STATED element confidences; coverage = stated / elements; an element without a stated confidence is counted, never imputed; unhealthy = elements whose health is not complete') END
$$;

/* THE SERVED STATE at an instant (default: the database's now): the frozen snapshot when a freeze stood then — with its warning, its expiry,
   whether it had expired (a run on it is then refused: tbr_frozen_expiry) and the head it stands in for — else actual's head as admitted by
   then, with its freshness. */
CREATE OR REPLACE FUNCTION twin.served_state(p_twin uuid, p_as_of timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = twin, pg_catalog, pg_temp AS $$
DECLARE v_at timestamptz := coalesce(p_as_of, clock_timestamp()); f twin.snapshot_freezes%ROWTYPE; v_head int; v_hours int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM twin.twins_current t WHERE t.twin_id = p_twin) THEN RETURN NULL; END IF;
  SELECT max(v.version) INTO v_head FROM twin.twin_versions v
   WHERE v.twin_id = p_twin AND v.branch_id = 'actual' AND v.state = 'admitted' AND v.admitted_at <= v_at;
  SELECT * INTO f FROM twin.snapshot_freezes x WHERE x.twin_id = p_twin AND x.frozen_at <= v_at AND (x.lifted_at IS NULL OR x.lifted_at > v_at)
   ORDER BY x.frozen_at DESC LIMIT 1;
  IF FOUND THEN
    SELECT p.near_expiry_hours INTO v_hours FROM twin.freshness_policies p WHERE p.twin_id = p_twin ORDER BY p.version DESC LIMIT 1;
    RETURN jsonb_build_object('twin_id', p_twin, 'as_of', v_at, 'mode', 'frozen', 'version', f.version, 'branch_id', f.branch_id, 'freeze_id', f.freeze_id,
      'validation_id', f.validation_id, 'warning', f.warning, 'expires_at', f.expires_at, 'expired', f.expires_at <= v_at,
      'nearing_expiry', f.expires_at > v_at AND f.expires_at <= v_at + make_interval(hours => coalesce(v_hours, 24)),
      'runs_allowed', f.expires_at > v_at, 'frozen_by', f.frozen_by, 'frozen_at', f.frozen_at, 'head_version', v_head,
      'freshness', twin.tbr_age(p_twin, f.version));
  END IF;
  RETURN jsonb_build_object('twin_id', p_twin, 'as_of', v_at, 'mode', CASE WHEN v_head IS NULL THEN 'none' ELSE 'head' END, 'version', v_head, 'branch_id', 'actual',
    'head_version', v_head, 'runs_allowed', v_head IS NOT NULL, 'freshness', CASE WHEN v_head IS NULL THEN NULL ELSE twin.tbr_age(p_twin, v_head) END);
END $$;

/* THE REVISIONS A COMMIT RECORDS (V03-T-196): the domain's active ontology version, the twin's freshness policy version and the domain's
   decision-use policy version, as they stand when the admit reads them — written into the TWN header (ontology_ref, freshness_state). */
CREATE OR REPLACE FUNCTION twin.commit_revisions(p_twin uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = twin, graph, simulation, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'ontology', (SELECT jsonb_build_object('version_id', o.version_id, 'namespace', o.namespace, 'version', o.version)
                   FROM graph.ontology_versions o WHERE o.tenant_id = t.tenant_id AND o.domain_id = t.domain_id AND o.state = 'active' ORDER BY o.namespace LIMIT 1),
    'freshness_policy', (SELECT jsonb_build_object('version', f.version, 'max_age_days', f.max_age_days) FROM twin.freshness_policies f WHERE f.twin_id = t.twin_id ORDER BY f.version DESC LIMIT 1),
    'decision_use_policy', (SELECT jsonb_build_object('version', p.version, 'require_decision_use', p.require_decision_use)
                              FROM simulation.decision_use_policies p WHERE p.tenant_id = t.tenant_id AND p.domain_id = t.domain_id ORDER BY p.version DESC LIMIT 1))
    FROM twin.twins_current t WHERE t.twin_id = p_twin
$$;

REVOKE ALL ON FUNCTION twin.version_freshness(uuid,int), twin.confidence_rollup(uuid,int), twin.served_state(uuid,timestamptz), twin.commit_revisions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.version_freshness(uuid,int), twin.confidence_rollup(uuid,int), twin.served_state(uuid,timestamptz), twin.commit_revisions(uuid) TO eye_app, eye_commit;

-- §BR.6 THE GATES (triggers; default-off) ─────────────────────────────

/* A historical (frozen) snapshot used past its EXPIRY is refused for runs (FEX-14): a run opened on a version frozen by a standing freeze
   whose expiry has passed. */
CREATE OR REPLACE FUNCTION twin.tbr_frozen_expiry() RETURNS trigger
SECURITY DEFINER SET search_path = twin, pg_catalog, pg_temp AS $$
DECLARE f twin.snapshot_freezes%ROWTYPE;
BEGIN
  SELECT * INTO f FROM twin.snapshot_freezes x WHERE x.twin_id = NEW.twin_id AND x.version = NEW.twin_version AND x.lifted_at IS NULL AND x.expires_at <= clock_timestamp()
   ORDER BY x.frozen_at DESC LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'snapshot rejected (stale): v% is the frozen snapshot of freeze %, which expired at %; a historical snapshot past its expiry is not used for runs — lift the freeze or run on a current version',
      NEW.twin_version, f.freeze_id, f.expires_at USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER tbr_frozen_expiry BEFORE INSERT ON simulation.runs_current FOR EACH ROW EXECUTE FUNCTION twin.tbr_frozen_expiry();

/* THE MERGE'S ADMISSION: an admission on actual while a merge of this twin is COMPLETING must carry its plan (every key's kind, value and
   unit as tbr_merge_expected) — then the merge is merged in the same transaction; otherwise the admission is refused (actual is held). */
CREATE OR REPLACE FUNCTION twin.tbr_merge_admitted() RETURNS trigger
SECURITY DEFINER SET search_path = twin, pg_catalog, pg_temp AS $$
DECLARE m twin.branch_merges%ROWTYPE; v_expected jsonb; v_have jsonb; v_diff text[];
BEGIN
  SELECT * INTO m FROM twin.branch_merges x WHERE x.twin_id = NEW.twin_id AND x.state = 'completing' FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  v_expected := twin.tbr_merge_expected(m.merge_id);
  v_have := twin.tbr_element_map(NEW.twin_id, NEW.version);
  SELECT coalesce(array_agg(k ORDER BY k), ARRAY[]::text[]) INTO v_diff
    FROM (SELECT jsonb_object_keys(v_expected) k UNION SELECT jsonb_object_keys(v_have)) x WHERE (v_expected -> k) IS DISTINCT FROM (v_have -> k);
  IF cardinality(v_diff) > 0 OR NEW.supersedes IS DISTINCT FROM m.target_version THEN
    RAISE EXCEPTION 'branch merge rejected (state): actual is held by merge % (branch %) being completed; v% does not carry its reconciled plan (differs on: %)',
      m.merge_id, m.source_branch, NEW.version, CASE WHEN cardinality(v_diff) = 0 THEN 'the version it supersedes' ELSE array_to_string(v_diff, ', ') END USING ERRCODE = '2F002';
  END IF;
  UPDATE twin.branch_merges SET state = 'merged', merged_version = NEW.version, merged_at = clock_timestamp() WHERE merge_id = m.merge_id;
  PERFORM twin.tbr_event(m.tenant_id, m.domain_id, m.twin_id, m.merge_id, 'merge.merged', public.eye_principal(),
    jsonb_build_object('merged_version', NEW.version, 'source_branch', m.source_branch, 'source_version', m.source_version, 'target_version', m.target_version,
                       'state_set_digest', NEW.state_set_digest), m.correlation_id);
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER tbr_merge_admitted AFTER UPDATE OF state ON twin.twin_versions
  FOR EACH ROW WHEN (OLD.state = 'draft' AND NEW.state = 'admitted' AND NEW.branch_id = 'actual') EXECUTE FUNCTION twin.tbr_merge_admitted();

/* NO MERGE AROUND THE MERGE: a draft opened on actual carrying from a version of a branch whose merge is in progress is refused — merging that
   branch back goes through its merge, refused until reconciliation. (Carry across branches stays open for every branch with no merge.) */
CREATE OR REPLACE FUNCTION twin.tbr_merge_bypass() RETURNS trigger
SECURITY DEFINER SET search_path = twin, pg_catalog, pg_temp AS $$
DECLARE v_from text; m twin.branch_merges%ROWTYPE;
BEGIN
  IF NEW.details ->> 'branch_id' IS DISTINCT FROM 'actual' OR NEW.details ->> 'carried_from' IS NULL THEN RETURN NEW; END IF;
  SELECT v.branch_id INTO v_from FROM twin.twin_versions v WHERE v.twin_id = NEW.twin_id AND v.version = (NEW.details ->> 'carried_from')::int;
  IF v_from IS NULL OR v_from = 'actual' THEN RETURN NEW; END IF;
  SELECT * INTO m FROM twin.branch_merges x WHERE x.twin_id = NEW.twin_id AND x.source_branch = v_from AND x.state IN ('open', 'reconciled', 'completing');
  IF FOUND THEN
    RAISE EXCEPTION 'branch merge rejected (unreconciled): branch % has merge % in progress (%); merging it back into actual goes through the merge, refused until reconciliation',
      v_from, m.merge_id, m.state USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER tbr_merge_bypass BEFORE INSERT ON twin.twin_events
  FOR EACH ROW WHEN (NEW.event = 'version.opened') EXECUTE FUNCTION twin.tbr_merge_bypass();

REVOKE ALL ON FUNCTION twin.tbr_frozen_expiry(), twin.tbr_merge_admitted(), twin.tbr_merge_bypass() FROM PUBLIC;
