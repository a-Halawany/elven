-- 0108 §CX — CP-6 B25 part `context` (2026-10-06): GROUNDED CONTEXT, THE FROZEN INFORMATION SET, REPLAY, THE ENVIRONMENT
-- (F-P4-03: V00-T-009, L6-C02, V03-T-319, AI-48-002, V03-T-127's lineage; the carried F-P5-03 environment, V03-T-196).
-- A part file: folded by the integrator into 0108 after §0 (apply order §CX, §MR, §EN). Forward only; the prelude's objects are used,
-- never re-declared (prediction.issue_forecast stays §0's). Every object here carries the part's prefix (`pcx_`) or is named in MAP §CX.
--
--   §CX.1 the tables: prediction.information_sets (the frozen manifest; append-only — frozen once, never edited),
--         prediction.information_set_events (the set's ledger), prediction.forecast_replays (the replay ledger; REPRODUCED | DIVERGED)
--   §CX.2 prediction.pcx_ts (the canonical instant text a manifest digests) and prediction.pcx_grounding_context — the ASSEMBLER's
--         read (INVOKER, STABLE: the caller's row security does the scoping): the series' evidence versions known at the cut-off, the
--         subject's graph context AS OF the cut-off (both time axes), the twin snapshot served at the cut-off (or EXACTLY the pinned
--         version on a replay), the assumptions as of the cut-off, the policy versions in force, and the DB-level coverage gaps
--   §CX.3 the port prediction.freeze_information_set (prediction.information_set.freeze, and the issuing actions that freeze through
--         the CONTEXT_FREEZER seam inside their own transaction)
--   §CX.4 the pin: trigger pcx_fct_information_set on forecasts_current (BEFORE INSERT / UPDATE OF information_set_id) — a non-null
--         information_set_id names a frozen set of the same tenant/domain whose request matches the forecast (series, subject, known_at)
--         and whose evidence contains every evidence version the forecast cites; a pin never changes. pcx_fct_information_set_pinned
--         (AFTER INSERT, only when a set is named) ledgers forecast.information_set_frozen. DEFAULT-OFF: a forecast naming no set (every
--         existing caller) passes untouched and writes nothing more.
--   §CX.5 the port prediction.record_forecast_replay (prediction.forecast.replay): the outcome is DERIVED here from the digests the
--         replay recomputed (REPRODUCED only when the manifest and the output digests both equal the original's and nothing diverged)
--   §CX.6 row security and grants (the 0081 loop idiom: prediction_isolation; SELECT to eye_app, eye_commit; no UPDATE/DELETE grant)
--
-- Refusal family (CLASS form, anchored in observation-errors.ts' /* B25 context */ block): `information set rejected (<class>)` and
-- `forecast replay rejected (<class>)` — actor → 403; unknown_* → 404; state, stale, duplicate → 409; contract, mismatch, incomplete,
-- ungrounded → 422.

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §CX.1 the tables
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/* THE FROZEN INFORMATION SET (V03-T-319, AI-48-002): what a forecast could know at its cut-off, pinned. The request (series, subject,
   target, known_at, observed_through, assumptions), the evidence versions known then, the graph context as of then and the revision head
   at the freeze, the twin snapshot served then, the features assembled from them (each with its source and digest), the assumptions with
   their versions, the policy versions in force, the named coverage gaps, and the digest of the canonical manifest (sha-256 of its JCS
   form, computed by assembler@N). Frozen once: the row is append-only (no draft state exists). */
CREATE TABLE prediction.information_sets (
  information_set_id uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  series_key         text NOT NULL,
  subject_entity_id  uuid,
  target_key         text,
  known_at           timestamptz NOT NULL,
  observed_through   date,
  request            jsonb NOT NULL CHECK (jsonb_typeof(request) = 'object'),
  evidence           jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'array' AND jsonb_array_length(evidence) >= 1),
  graph              jsonb NOT NULL CHECK (jsonb_typeof(graph) = 'object'),
  twin               jsonb CHECK (twin IS NULL OR jsonb_typeof(twin) = 'object'),
  features           jsonb NOT NULL CHECK (jsonb_typeof(features) = 'array'),
  assumptions        jsonb NOT NULL CHECK (jsonb_typeof(assumptions) = 'array'),
  policy             jsonb NOT NULL CHECK (jsonb_typeof(policy) = 'object'),
  coverage_gaps      jsonb NOT NULL CHECK (jsonb_typeof(coverage_gaps) = 'array'),
  manifest           jsonb NOT NULL CHECK (jsonb_typeof(manifest) = 'object'),
  manifest_digest    text NOT NULL CHECK (manifest_digest ~ '^[0-9a-f]{64}$'),
  assembler_version  text NOT NULL CHECK (assembler_version ~ '^assembler@[0-9]+$'),
  revision_head      bigint NOT NULL CHECK (revision_head >= 0),
  twin_id            uuid,
  twin_version       int,
  state              text NOT NULL DEFAULT 'frozen' CHECK (state = 'frozen'),
  frozen_via         text NOT NULL CHECK (frozen_via LIKE 'prediction.%'),
  frozen_by          uuid NOT NULL,
  frozen_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT pcx_is_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT pcx_is_twin_pair CHECK ((twin_id IS NULL) = (twin_version IS NULL) AND (twin_id IS NULL) = (twin IS NULL)),
  CONSTRAINT pcx_is_cutoffs CHECK (observed_through IS NULL OR observed_through <= (known_at AT TIME ZONE 'UTC')::date),
  CONSTRAINT pcx_is_frozen_after_cutoff CHECK (frozen_at >= known_at)
);
CREATE INDEX pcx_is_series ON prediction.information_sets (tenant_id, domain_id, series_key, frozen_at DESC);
CREATE INDEX pcx_is_digest ON prediction.information_sets (manifest_digest);
CREATE TRIGGER pcx_is_append_only BEFORE UPDATE OR DELETE ON prediction.information_sets FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE prediction.information_sets IS 'B25 §CX (0108; V03-T-319, AI-48-002, L6-C02): the FROZEN information set of a forecast — the request, the evidence versions known at the cut-off, the graph context as of the cut-off and the domain''s revision head at the freeze, the twin snapshot served at the cut-off, the assembled features (key, source, digest, scalar value), the assumptions with their versions, the policy versions in force, the named coverage gaps and the sha-256 of the canonical (JCS) manifest under assembler@N. Append-only: frozen once, never edited. A forecast pins one through information_set_id (trigger pcx_fct_information_set).';

CREATE TABLE prediction.information_set_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  information_set_id uuid NOT NULL REFERENCES prediction.information_sets (information_set_id),
  event              text NOT NULL CHECK (event IN ('information_set.frozen', 'information_set.pinned', 'information_set.replayed')),
  forecast_id        uuid,
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_principal_id uuid NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id     uuid NOT NULL,
  CONSTRAINT pcx_ise_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT pcx_ise_forecast_named CHECK (event = 'information_set.frozen' OR forecast_id IS NOT NULL)
);
CREATE INDEX pcx_ise_set ON prediction.information_set_events (information_set_id, occurred_at);
CREATE TRIGGER pcx_ise_append_only BEFORE UPDATE OR DELETE ON prediction.information_set_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* THE REPLAY LEDGER (F-P4-03 "replay of the frozen set"): one row per replay — the original and the replayed manifest digests, output
   digests and environment digests, what diverged (named), the FRESH grounding beside it (what a grounding at the replay's instant would
   pin — reported, never substituted), and the outcome the port derived. */
CREATE TABLE prediction.forecast_replays (
  replay_id                    uuid PRIMARY KEY,
  scope                        text NOT NULL,
  tenant_id                    uuid NOT NULL,
  domain_id                    uuid NOT NULL,
  forecast_id                  uuid NOT NULL,
  information_set_id           uuid NOT NULL REFERENCES prediction.information_sets (information_set_id),
  outcome                      text NOT NULL CHECK (outcome IN ('REPRODUCED', 'DIVERGED')),
  original_manifest_digest     text NOT NULL CHECK (original_manifest_digest ~ '^[0-9a-f]{64}$'),
  replayed_manifest_digest     text NOT NULL CHECK (replayed_manifest_digest ~ '^[0-9a-f]{64}$'),
  original_output_digest       text NOT NULL CHECK (original_output_digest ~ '^[0-9a-f]{64}$'),
  replayed_output_digest       text CHECK (replayed_output_digest IS NULL OR replayed_output_digest ~ '^[0-9a-f]{64}$'),
  original_environment_digest  text CHECK (original_environment_digest IS NULL OR original_environment_digest ~ '^[0-9a-f]{64}$'),
  replayed_environment_digest  text CHECK (replayed_environment_digest IS NULL OR replayed_environment_digest ~ '^[0-9a-f]{64}$'),
  environment_match            boolean NOT NULL,
  diverged                     jsonb NOT NULL CHECK (jsonb_typeof(diverged) = 'array'),
  fresh                        jsonb CHECK (fresh IS NULL OR jsonb_typeof(fresh) = 'object'),
  detail                       jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(detail) = 'object'),
  replayed_by                  uuid NOT NULL,
  replayed_at                  timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id               uuid NOT NULL,
  CONSTRAINT pcx_rpl_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT pcx_rpl_outcome_bound CHECK ((outcome = 'REPRODUCED') = (replayed_manifest_digest = original_manifest_digest
                                          AND replayed_output_digest IS NOT DISTINCT FROM original_output_digest AND jsonb_array_length(diverged) = 0))
);
CREATE INDEX pcx_rpl_forecast ON prediction.forecast_replays (forecast_id, replayed_at DESC);
CREATE TRIGGER pcx_rpl_append_only BEFORE UPDATE OR DELETE ON prediction.forecast_replays FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE prediction.forecast_replays IS 'B25 §CX (0108; F-P4-03): the replay of a grounded forecast from its frozen information set — the pinned evidence versions re-read, the graph re-read as of the pinned cut-off, the pinned twin version re-read, the features re-assembled, the method re-run; REPRODUCED only when the manifest and output digests equal the original''s; DIVERGED names what diverged. The environments are compared and reported (environment_match), never hidden; the fresh grounding at the replay''s instant is reported beside it.';

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §CX.2 the assembler's read
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/* The canonical text of an instant inside a manifest: UTC, microseconds, `Z` — one spelling, whatever the session's time zone. */
CREATE OR REPLACE FUNCTION prediction.pcx_ts(p timestamptz) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE WHEN p IS NULL THEN NULL ELSE to_char(p AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END
$$;
REVOKE ALL ON FUNCTION prediction.pcx_ts(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.pcx_ts(timestamptz) TO eye_app, eye_commit;

/* THE GROUNDING CONTEXT of a series at a cut-off — the database half of assembler@1 (the TypeScript half shapes the features and digests
   the manifest). INVOKER and STABLE: every table is read under the caller's own row security (no tenant or domain argument to guard — the
   N-01 rule's better form). Both time axes are the cut-off: what was BELIEVED at known_at about what HELD at known_at.
     p_twin   null: resolve the twin of the series' subject (a twin whose boundary names the subject entity) and pin the version it SERVED at
              the cut-off (twin.served_state — the frozen snapshot when one stood, else actual's admitted head); {twin_id, version}: read
              EXACTLY that version (the replay's pin), wherever the twin stands now.
   A graph partition withdrawn under B20 is not read (its rows may be poisoned): the context says so as a coverage gap and carries no edges.
   Policy tables this caller cannot read are coverage gaps, never errors. */
CREATE OR REPLACE FUNCTION prediction.pcx_grounding_context(p_series_key text, p_known_at timestamptz, p_assumptions uuid[], p_twin jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = prediction, graph, twin, objects, observation, simulation, executive, public, pg_catalog, pg_temp AS $$
DECLARE
  s prediction.series_registry%ROWTYPE;
  v_subject jsonb := NULL; v_edges jsonb := '[]'::jsonb; v_events jsonb := '[]'::jsonb; v_neigh uuid[] := ARRAY[]::uuid[];
  v_edge_ids uuid[] := ARRAY[]::uuid[]; v_edge_total int := 0; v_evidence jsonb; v_twin jsonb := NULL; v_gaps jsonb := '[]'::jsonb;
  v_assumptions jsonb := '[]'::jsonb; v_unknown jsonb := '[]'::jsonb; v_policy jsonb := '{}'::jsonb; v_head bigint := 0; v_head_at timestamptz;
  v_withdrawn text[] := ARRAY[]::text[]; v_twin_id uuid; v_twin_ver int; v_mode text := 'pinned'; v_served jsonb; t record; a uuid;
  v_ver bigint; v_state text; v_part jsonb; v_hp regclass;
BEGIN
  SELECT * INTO s FROM prediction.series_registry r WHERE r.series_key = p_series_key;
  IF NOT FOUND THEN RETURN jsonb_build_object('series', NULL); END IF;

  SELECT h.head, h.updated_at INTO v_head, v_head_at FROM graph.revision_heads h WHERE h.tenant_id = s.tenant_id AND h.domain_id = s.domain_id;
  v_head := coalesce(v_head, 0);

  -- THE EVIDENCE known at the cut-off: per evidence object the latest version recorded by then (the series assembly's own rule,
  -- prediction.capabilities evidenceVersionsKnownAt), a withdrawn one excluded; the digest is the BYTES digest the forecast cites.
  SELECT coalesce(jsonb_agg(jsonb_build_object('evidence_object_id', x.object_id, 'evidence_version', x.object_version,
                                               'evidence_digest', x.content_digest, 'recorded_at', prediction.pcx_ts(x.recorded_at))
                            ORDER BY x.object_id, x.object_version), '[]'::jsonb)
    INTO v_evidence
    FROM (SELECT DISTINCT ON (e.object_id) e.object_id::text AS object_id, e.object_version::int AS object_version,
                 e.payload ->> 'content_digest' AS content_digest, e.recorded_at, e.lifecycle_state
            FROM objects.canonical_objects e
           WHERE e.object_type = 'EVD'
             AND EXISTS (SELECT 1 FROM observation.source_contracts_current c
                          WHERE c.source_key = s.source_key AND e.provenance_ref LIKE 'SRC:' || c.source_id::text || '@%')
             AND e.recorded_at <= p_known_at
           ORDER BY e.object_id, e.object_version DESC) x
   WHERE x.lifecycle_state <> 'withdrawn';

  -- B20: a withdrawn partition is not read.
  BEGIN
    SELECT coalesce(array_agg(p.projection ORDER BY p.projection), ARRAY[]::text[]) INTO v_withdrawn
      FROM graph.projection_partitions p
     WHERE p.tenant_id = s.tenant_id AND p.domain_id = s.domain_id AND p.state = 'withdrawn' AND p.projection IN ('entities_current', 'edges_current');
  EXCEPTION WHEN insufficient_privilege THEN
    v_gaps := v_gaps || jsonb_build_array(jsonb_build_object('key', 'graph.partitions', 'required', false, 'reason', 'the graph''s partition state is not readable by this caller; the graph context was read without it'));
  END;

  IF s.subject_entity_id IS NULL THEN
    v_gaps := v_gaps || jsonb_build_array(jsonb_build_object('key', 'graph.subject', 'required', false,
      'reason', 'the series names no subject entity: no graph context and no twin snapshot can be grounded on it'));
  ELSIF 'entities_current' = ANY (v_withdrawn) OR 'edges_current' = ANY (v_withdrawn) THEN
    v_gaps := v_gaps || jsonb_build_array(jsonb_build_object('key', 'graph.context', 'required', false,
      'reason', format('the graph partition(s) %s are WITHDRAWN (B20) at the freeze: the subject''s graph context is not read from a withdrawn projection', array_to_string(v_withdrawn, ', '))));
  ELSE
    SELECT jsonb_build_object('entity_id', e.entity_id, 'entity_type', e.entity_type, 'created_at', prediction.pcx_ts(e.created_at),
             'lifecycle', coalesce((SELECT CASE ev.event WHEN 'entity.superseded' THEN 'superseded' WHEN 'entity.retired' THEN 'retired' ELSE 'active' END
                                      FROM graph.entity_events ev WHERE ev.entity_id = e.entity_id AND ev.occurred_at <= p_known_at
                                       AND ev.event IN ('entity.created', 'entity.superseded', 'entity.retired')
                                     ORDER BY ev.occurred_at DESC, ev.event_id DESC LIMIT 1), 'active'))
      INTO v_subject
      FROM graph.entities_current e WHERE e.entity_id = s.subject_entity_id AND e.created_at <= p_known_at;
    IF v_subject IS NULL THEN
      v_gaps := v_gaps || jsonb_build_array(jsonb_build_object('key', 'graph.subject', 'required', true,
        'reason', format('the series'' subject entity %s is not readable as it stood at %s', s.subject_entity_id, prediction.pcx_ts(p_known_at))));
    ELSE
      -- THE EDGES touching the subject, visible at the cut-off on BOTH axes (the edges service's visibleAt, in SQL); bounded at 2,000.
      WITH vis AS (
        SELECT g.* FROM graph.edges_current g
         WHERE (g.subject_entity_id = s.subject_entity_id OR g.object_entity_id = s.subject_entity_id)
           AND g.asserted_at <= p_known_at AND (g.retracted_at IS NULL OR g.retracted_at > p_known_at)
           AND (g.superseded_at IS NULL OR g.superseded_at > p_known_at)
           AND g.valid_from <= p_known_at AND (g.valid_to IS NULL OR g.valid_to > p_known_at)
         ORDER BY g.edge_id LIMIT 2001)
      SELECT coalesce(jsonb_agg(jsonb_build_object('edge_id', v.edge_id, 'subject_entity_id', v.subject_entity_id, 'predicate', v.predicate,
                                  'object_entity_id', v.object_entity_id, 'valid_from', prediction.pcx_ts(v.valid_from), 'valid_to', prediction.pcx_ts(v.valid_to),
                                  'asserted_at', prediction.pcx_ts(v.asserted_at), 'claim_object_id', v.claim_object_id, 'claim_version', v.claim_version,
                                  'evidence_object_id', v.evidence_object_id, 'evidence_digest', v.evidence_digest, 'confidence', v.confidence)
                                ORDER BY v.edge_id) FILTER (WHERE v.rn <= 2000), '[]'::jsonb),
             coalesce(array_agg(v.edge_id ORDER BY v.edge_id) FILTER (WHERE v.rn <= 2000), ARRAY[]::uuid[]),
             coalesce(array_agg(DISTINCT CASE WHEN v.subject_entity_id = s.subject_entity_id THEN v.object_entity_id ELSE v.subject_entity_id END)
                        FILTER (WHERE v.rn <= 2000), ARRAY[]::uuid[]),
             count(*)
        INTO v_edges, v_edge_ids, v_neigh, v_edge_total
        FROM (SELECT vis.*, row_number() OVER (ORDER BY vis.edge_id) AS rn FROM vis) v;
      IF v_edge_total > 2000 THEN
        v_gaps := v_gaps || jsonb_build_array(jsonb_build_object('key', 'graph.edges', 'required', false,
          'reason', 'more than 2,000 edges touch the subject at the cut-off: the context carries the first 2,000 by id'));
      END IF;
      -- THE EVENTS recorded by the cut-off: the subject's and its neighbours' entity events, and the visible edges' events.
      SELECT coalesce(jsonb_agg(jsonb_build_object('event_id', q.event_id, 'of', q.of, 'id', q.id, 'event', q.event, 'occurred_at', prediction.pcx_ts(q.occurred_at))
                                ORDER BY q.occurred_at, q.event_id), '[]'::jsonb)
        INTO v_events
        FROM (SELECT ev.event_id, 'entity'::text AS of, ev.entity_id AS id, ev.event, ev.occurred_at FROM graph.entity_events ev
               WHERE ev.entity_id = ANY (v_neigh || s.subject_entity_id) AND ev.occurred_at <= p_known_at
              UNION ALL
              SELECT ee.event_id, 'edge', ee.edge_id, ee.event, ee.occurred_at FROM graph.edge_events ee
               WHERE ee.edge_id = ANY (v_edge_ids) AND ee.occurred_at <= p_known_at) q;
    END IF;
  END IF;

  -- THE TWIN SNAPSHOT: the pin (a replay), or the subject's twin as served at the cut-off.
  IF p_twin IS NOT NULL AND jsonb_typeof(p_twin) = 'object' THEN
    v_twin_id := (p_twin ->> 'twin_id')::uuid; v_twin_ver := (p_twin ->> 'version')::int; v_mode := 'pinned';
  ELSIF s.subject_entity_id IS NOT NULL THEN
    FOR t IN SELECT x.twin_id FROM twin.twins_current x WHERE x.boundary @> jsonb_build_array(s.subject_entity_id::text) ORDER BY x.declared_at, x.twin_id LOOP
      v_served := twin.served_state(t.twin_id, p_known_at);
      IF v_served IS NOT NULL AND (v_served ->> 'version') IS NOT NULL THEN
        v_twin_id := t.twin_id; v_twin_ver := (v_served ->> 'version')::int; v_mode := v_served ->> 'mode';
        IF v_mode = 'frozen' AND coalesce((v_served ->> 'expired')::boolean, false) THEN
          v_gaps := v_gaps || jsonb_build_array(jsonb_build_object('key', 'twin.snapshot', 'required', false,
            'reason', format('the twin''s served state at the cut-off is a frozen snapshot (v%s) whose expiry had passed', v_twin_ver)));
        END IF;
        EXIT;
      END IF;
    END LOOP;
    IF v_twin_id IS NULL THEN
      v_gaps := v_gaps || jsonb_build_array(jsonb_build_object('key', 'twin.snapshot', 'required', false,
        'reason', 'no twin of the subject served an admitted version at the cut-off: the forecast is grounded without a twin snapshot'));
    END IF;
  END IF;
  IF v_twin_id IS NOT NULL THEN
    SELECT jsonb_build_object('twin_id', tv.twin_id, 'version', tv.version, 'branch_id', tv.branch_id, 'mode', v_mode,
             'state_set_digest', tv.state_set_digest, 'header_digest', tv.header_digest, 'known_at', prediction.pcx_ts(tv.known_at),
             'observed_through', tv.observed_through::text, 'admitted_at', prediction.pcx_ts(tv.admitted_at), 'synthetic', tv.synthetic_state,
             'elements', coalesce((SELECT jsonb_agg(jsonb_build_object('key', se.key, 'kind', se.kind, 'value', se.value, 'unit', se.unit,
                                                                      'health', se.health, 'confidence', se.confidence) ORDER BY se.key)
                                     FROM twin.state_elements se WHERE se.twin_id = tv.twin_id AND se.version = tv.version), '[]'::jsonb))
      INTO v_twin
      FROM twin.twin_versions tv WHERE tv.twin_id = v_twin_id AND tv.version = v_twin_ver AND tv.state = 'admitted';
    IF v_twin IS NULL THEN
      v_gaps := v_gaps || jsonb_build_array(jsonb_build_object('key', 'twin.snapshot', 'required', p_twin IS NOT NULL,
        'reason', format('twin %s v%s is not readable as an admitted version by this caller', v_twin_id, v_twin_ver)));
    END IF;
  END IF;

  -- THE ASSUMPTIONS as of the cut-off: the version recorded by then and the verification state its events say it had then.
  FOREACH a IN ARRAY coalesce(p_assumptions, ARRAY[]::uuid[]) LOOP
    IF NOT EXISTS (SELECT 1 FROM graph.strategy_current sc WHERE sc.strategy_object_id = a AND sc.object_type = 'ASU') THEN
      v_unknown := v_unknown || to_jsonb(a::text); CONTINUE;
    END IF;
    SELECT max(o.object_version) INTO v_ver FROM objects.canonical_objects o WHERE o.object_id = a AND o.object_type = 'ASU' AND o.recorded_at <= p_known_at;
    SELECT CASE ev.event WHEN 'assumption.verified' THEN 'verified' WHEN 'assumption.invalidated' THEN 'invalidated' ELSE 'unverified' END INTO v_state
      FROM graph.strategy_events ev WHERE ev.strategy_object_id = a AND ev.event IN ('assumption.verified', 'assumption.unverified', 'assumption.invalidated')
       AND ev.occurred_at <= p_known_at ORDER BY ev.occurred_at DESC, ev.event_id DESC LIMIT 1;
    v_assumptions := v_assumptions || jsonb_build_array(jsonb_build_object('id', a, 'version', v_ver, 'verification_state', coalesce(v_state, 'unverified')));
    IF v_ver IS NULL THEN
      v_gaps := v_gaps || jsonb_build_array(jsonb_build_object('key', 'assumption.' || a::text, 'required', false,
        'reason', 'the assumption had no recorded version at the cut-off (declared later): it is cited, not grounded'));
    END IF;
    v_state := NULL;
  END LOOP;

  -- THE POLICY VERSIONS in force (ontology active at the freeze; attention and decision-use policy as of the cut-off; §MR's horizon
  -- policy when its table exists — read generically, the latest row of the domain).
  BEGIN
    SELECT jsonb_build_object('version_id', o.version_id, 'namespace', o.namespace, 'version', o.version) INTO v_part
      FROM graph.ontology_versions o WHERE o.tenant_id = s.tenant_id AND o.domain_id = s.domain_id AND o.state = 'active' ORDER BY o.namespace, o.version DESC LIMIT 1;
    v_policy := v_policy || jsonb_build_object('ontology', v_part);
  EXCEPTION WHEN insufficient_privilege OR undefined_table OR undefined_column THEN
    v_gaps := v_gaps || jsonb_build_array(jsonb_build_object('key', 'policy.ontology', 'required', false, 'reason', 'the ontology version is not readable by this caller'));
  END;
  BEGIN
    SELECT jsonb_build_object('policy_id', p.policy_id, 'version', p.version, 'rules_digest', p.rules_digest) INTO v_part
      FROM executive.attention_policies p WHERE p.tenant_id = s.tenant_id AND p.domain_id = s.domain_id AND p.effective_at <= p_known_at
       AND (p.superseded_at IS NULL OR p.superseded_at > p_known_at) ORDER BY p.version DESC LIMIT 1;
    v_policy := v_policy || jsonb_build_object('attention_policy', v_part);
  EXCEPTION WHEN insufficient_privilege OR undefined_table OR undefined_column THEN
    v_gaps := v_gaps || jsonb_build_array(jsonb_build_object('key', 'policy.attention', 'required', false, 'reason', 'the attention policy is not readable by this caller'));
  END;
  BEGIN
    SELECT jsonb_build_object('policy_id', p.policy_id, 'version', p.version, 'require_decision_use', p.require_decision_use) INTO v_part
      FROM simulation.decision_use_policies p WHERE p.tenant_id = s.tenant_id AND p.domain_id = s.domain_id AND p.set_at <= p_known_at ORDER BY p.version DESC LIMIT 1;
    v_policy := v_policy || jsonb_build_object('decision_use_policy', v_part);
  EXCEPTION WHEN insufficient_privilege OR undefined_table OR undefined_column THEN
    v_gaps := v_gaps || jsonb_build_array(jsonb_build_object('key', 'policy.decision_use', 'required', false, 'reason', 'the decision-use policy is not readable by this caller'));
  END;
  v_hp := to_regclass('prediction.horizon_policies');
  IF v_hp IS NOT NULL THEN
    BEGIN
      EXECUTE 'SELECT to_jsonb(p) FROM prediction.horizon_policies p WHERE p.tenant_id = $1 AND p.domain_id = $2 ORDER BY (to_jsonb(p) ->> ''version'')::int DESC NULLS LAST LIMIT 1'
        INTO v_part USING s.tenant_id, s.domain_id;
      v_policy := v_policy || jsonb_build_object('horizon_policy', CASE WHEN v_part IS NULL THEN NULL ELSE
        jsonb_strip_nulls(jsonb_build_object('policy_id', v_part -> 'policy_id', 'version', v_part -> 'version', 'state', v_part -> 'state')) END);
    EXCEPTION WHEN insufficient_privilege OR undefined_column OR invalid_text_representation THEN
      v_gaps := v_gaps || jsonb_build_array(jsonb_build_object('key', 'policy.horizon', 'required', false, 'reason', 'the horizon policy is not readable by this caller'));
    END;
  END IF;

  RETURN jsonb_build_object(
    'series', jsonb_build_object('series_key', s.series_key, 'source_key', s.source_key, 'subject_entity_id', s.subject_entity_id, 'unit', s.unit,
                                 'seasonality_days', s.seasonality_days, 'parser_ref', s.parser_ref),
    'known_at', prediction.pcx_ts(p_known_at), 'revision_head', v_head, 'revision_updated_at', prediction.pcx_ts(v_head_at),
    'evidence', v_evidence, 'subject', v_subject, 'edges', v_edges, 'edge_total', v_edge_total, 'neighbours', to_jsonb(v_neigh), 'events', v_events,
    'twin', v_twin, 'assumptions', v_assumptions, 'unknown_assumptions', v_unknown, 'policy', v_policy, 'gaps', v_gaps,
    'withdrawn_partitions', to_jsonb(v_withdrawn));
END $$;
REVOKE ALL ON FUNCTION prediction.pcx_grounding_context(text, timestamptz, uuid[], jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.pcx_grounding_context(text, timestamptz, uuid[], jsonb) TO eye_app, eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §CX.3 the freeze port
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/* FREEZE an information set (prediction.information_set.freeze — and the issuing actions that freeze inside their own transaction through
   the CONTEXT_FREEZER seam: prediction.forecast.issue (the grounded issue), prediction.portfolio.issue (§MR), prediction.ensemble.issue
   (§EN)). The manifest is assembled and digested by assembler@N in the same transaction; the port VERIFIES what it can bind: the acting
   principal, the cut-offs against the database's instant, the series, the request the manifest carries, every assumption an ASU of the
   domain, every pinned evidence version (id, version, bytes digest, recorded by the cut-off), the revision head (the domain's head now —
   a graph commit between the read and the freeze is a stale manifest), the twin pin (an admitted version with those digests), and no
   REQUIRED coverage gap. Then the row and its ledger event. */
CREATE OR REPLACE FUNCTION prediction.freeze_information_set(
  p_set_id uuid, p_tenant uuid, p_domain uuid, p_request jsonb, p_manifest jsonb, p_manifest_digest text, p_assembler_version text,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, graph, twin, objects, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_action text; v_known timestamptz; v_through date; v_series text; v_subject uuid; v_head bigint; e jsonb; a text;
        v_twin jsonb; v_now timestamptz := clock_timestamp(); v_reg prediction.series_registry%ROWTYPE; g jsonb;
BEGIN
  v_action := observation.assert_authority(ARRAY['prediction.information_set.freeze', 'prediction.forecast.issue', 'prediction.portfolio.issue', 'prediction.ensemble.issue']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'information set rejected (actor): the acting principal % is not the bound principal; a set is frozen by whoever acts', p_actor USING ERRCODE = '42501';
  END IF;
  IF p_set_id IS NULL OR p_request IS NULL OR jsonb_typeof(p_request) <> 'object' OR p_manifest IS NULL OR jsonb_typeof(p_manifest) <> 'object'
     OR coalesce(p_manifest_digest, '') !~ '^[0-9a-f]{64}$' OR coalesce(p_assembler_version, '') !~ '^assembler@[0-9]+$' THEN
    RAISE EXCEPTION 'information set rejected (contract): a set names its id, an object request, an object manifest, a sha-256 manifest digest and the assembler version (assembler@N)' USING ERRCODE = '22023';
  END IF;
  v_series := p_request ->> 'series_key';
  BEGIN
    v_known := (p_request ->> 'known_at')::timestamptz; v_through := (p_request ->> 'observed_through')::date;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow OR invalid_text_representation THEN
    RAISE EXCEPTION 'information set rejected (contract): known_at is an instant and observed_through a day (or null)' USING ERRCODE = '22023';
  END;
  IF v_series IS NULL OR v_known IS NULL THEN
    RAISE EXCEPTION 'information set rejected (contract): the request names the series and the cut-off (known_at)' USING ERRCODE = '22023';
  END IF;
  IF v_known > v_now THEN
    RAISE EXCEPTION 'information set rejected (contract): the cut-off % is later than the database''s instant %; a set freezes what was known, never what will be', v_known, v_now USING ERRCODE = '22023';
  END IF;
  IF v_through IS NOT NULL AND v_through > (v_known AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION 'information set rejected (contract): observed_through % is after the cut-off''s day; nothing observed after what was known can be in the set', v_through USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_reg FROM prediction.series_registry r WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.series_key = v_series;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'information set rejected (unknown_series): series % is not registered in this domain', v_series USING ERRCODE = '23503';
  END IF;
  v_subject := (p_request ->> 'subject_entity_id')::uuid;
  IF v_subject IS DISTINCT FROM v_reg.subject_entity_id THEN
    RAISE EXCEPTION 'information set rejected (mismatch): the request''s subject % is not series %''s subject %', v_subject, v_series, v_reg.subject_entity_id USING ERRCODE = '22023';
  END IF;
  IF p_manifest -> 'request' IS DISTINCT FROM p_request THEN
    RAISE EXCEPTION 'information set rejected (mismatch): the manifest''s request is not the request frozen' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM prediction.information_sets x WHERE x.information_set_id = p_set_id) THEN
    RAISE EXCEPTION 'information set rejected (duplicate): information set % is already frozen; a set is frozen once', p_set_id USING ERRCODE = '23505';
  END IF;
  FOR a IN SELECT jsonb_array_elements_text(coalesce(p_request -> 'assumptions', '[]'::jsonb)) LOOP
    IF NOT EXISTS (SELECT 1 FROM graph.strategy_current sc WHERE sc.strategy_object_id = a::uuid AND sc.object_type = 'ASU'
                    AND sc.tenant_id = p_tenant AND sc.domain_id = p_domain) THEN
      RAISE EXCEPTION 'information set rejected (unknown_assumption): % is not an assumption (ASU) of this domain', a USING ERRCODE = '23503';
    END IF;
  END LOOP;
  -- the REQUIRED inputs: the evidence (at least one version, each bound exactly) and no required coverage gap
  IF jsonb_typeof(p_manifest -> 'evidence') IS DISTINCT FROM 'array' OR jsonb_array_length(p_manifest -> 'evidence') = 0 THEN
    RAISE EXCEPTION 'information set rejected (incomplete): no evidence version of series % was known at %; the required input is unreadable', v_series, v_known USING ERRCODE = '22023';
  END IF;
  FOR g IN SELECT * FROM jsonb_array_elements(coalesce(p_manifest -> 'coverage_gaps', '[]'::jsonb)) LOOP
    IF (g ->> 'required') = 'true' THEN
      RAISE EXCEPTION 'information set rejected (incomplete): the required input % is unreadable — %', g ->> 'key', g ->> 'reason' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  FOR e IN SELECT * FROM jsonb_array_elements(p_manifest -> 'evidence') LOOP
    IF NOT EXISTS (SELECT 1 FROM objects.canonical_objects o
                    WHERE o.object_id = (e ->> 'evidence_object_id')::uuid AND o.object_version = (e ->> 'evidence_version')::bigint
                      AND o.object_type = 'EVD' AND o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.recorded_at <= v_known
                      AND o.payload ->> 'content_digest' = e ->> 'evidence_digest') THEN
      RAISE EXCEPTION 'information set rejected (mismatch): evidence %@% (digest %) is not an evidence version of this domain recorded by the cut-off',
        e ->> 'evidence_object_id', e ->> 'evidence_version', left(coalesce(e ->> 'evidence_digest', '-'), 12) USING ERRCODE = '22023';
    END IF;
  END LOOP;
  SELECT h.head INTO v_head FROM graph.revision_heads h WHERE h.tenant_id = p_tenant AND h.domain_id = p_domain;
  v_head := coalesce(v_head, 0);
  IF (p_manifest #>> '{graph,revision_head}') IS NULL OR (p_manifest #>> '{graph,revision_head}')::bigint <> v_head THEN
    RAISE EXCEPTION 'information set rejected (stale): the manifest pins graph revision % but the domain''s head is %; a graph commit landed between the read and the freeze — assemble again',
      coalesce(p_manifest #>> '{graph,revision_head}', '-'), v_head USING ERRCODE = '23514';
  END IF;
  v_twin := CASE WHEN jsonb_typeof(p_manifest -> 'twin') = 'object' THEN p_manifest -> 'twin' ELSE NULL END;
  IF v_twin IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM twin.twin_versions tv WHERE tv.twin_id = (v_twin ->> 'twin_id')::uuid AND tv.version = (v_twin ->> 'version')::int
         AND tv.tenant_id = p_tenant AND tv.domain_id = p_domain AND tv.state = 'admitted'
         AND tv.state_set_digest = v_twin ->> 'state_set_digest' AND tv.header_digest = v_twin ->> 'header_digest') THEN
    RAISE EXCEPTION 'information set rejected (mismatch): the twin pin %@v% is not an admitted version of this domain with those digests', v_twin ->> 'twin_id', v_twin ->> 'version' USING ERRCODE = '22023';
  END IF;

  INSERT INTO prediction.information_sets (
    information_set_id, scope, tenant_id, domain_id, series_key, subject_entity_id, target_key, known_at, observed_through, request,
    evidence, graph, twin, features, assumptions, policy, coverage_gaps, manifest, manifest_digest, assembler_version, revision_head,
    twin_id, twin_version, frozen_via, frozen_by, frozen_at, correlation_id
  ) VALUES (
    p_set_id, 'DOMAIN', p_tenant, p_domain, v_series, v_subject, p_request ->> 'target_key', v_known, v_through, p_request,
    p_manifest -> 'evidence', coalesce(p_manifest -> 'graph', '{}'::jsonb), v_twin, coalesce(p_manifest -> 'features', '[]'::jsonb),
    coalesce(p_manifest -> 'assumptions', '[]'::jsonb), coalesce(p_manifest -> 'policy', '{}'::jsonb), coalesce(p_manifest -> 'coverage_gaps', '[]'::jsonb),
    p_manifest, p_manifest_digest, p_assembler_version, v_head, (v_twin ->> 'twin_id')::uuid, (v_twin ->> 'version')::int,
    v_action, p_actor, v_now, p_correlation);
  INSERT INTO prediction.information_set_events (event_id, scope, tenant_id, domain_id, information_set_id, event, forecast_id, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_set_id, 'information_set.frozen', NULL, p_actor,
          jsonb_build_object('manifest_digest', p_manifest_digest, 'revision_head', v_head, 'via', v_action, 'assembler_version', p_assembler_version,
                             'twin', CASE WHEN v_twin IS NULL THEN NULL ELSE jsonb_build_object('twin_id', v_twin -> 'twin_id', 'version', v_twin -> 'version') END,
                             'evidence', jsonb_array_length(p_manifest -> 'evidence'), 'coverage_gaps', jsonb_array_length(coalesce(p_manifest -> 'coverage_gaps', '[]'::jsonb))),
          p_correlation);
  RETURN jsonb_build_object('information_set_id', p_set_id, 'manifest_digest', p_manifest_digest, 'revision_head', v_head, 'known_at', v_known,
                            'frozen_at', v_now, 'frozen_via', v_action, 'twin', v_twin IS NOT NULL);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.freeze_information_set(uuid, uuid, uuid, jsonb, jsonb, text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.freeze_information_set(uuid, uuid, uuid, jsonb, jsonb, text, text, uuid, uuid, uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §CX.4 the pin on the forecast row (default-off)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION prediction.pcx_fct_information_set() RETURNS trigger
SECURITY DEFINER SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE s prediction.information_sets%ROWTYPE; v_missing jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.information_set_id IS DISTINCT FROM OLD.information_set_id THEN
      RAISE EXCEPTION 'information set rejected (state): forecast % pinned information set % at issue; a pin is never changed — issue a new forecast', OLD.forecast_id, coalesce(OLD.information_set_id::text, 'none')
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.information_set_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO s FROM prediction.information_sets x WHERE x.information_set_id = NEW.information_set_id AND x.tenant_id = NEW.tenant_id AND x.domain_id = NEW.domain_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'information set rejected (unknown_information_set): % is no frozen information set of this domain', NEW.information_set_id USING ERRCODE = '23503';
  END IF;
  IF s.series_key <> NEW.series_key OR s.subject_entity_id IS DISTINCT FROM NEW.subject_entity_id OR s.known_at <> NEW.known_at THEN
    RAISE EXCEPTION 'information set rejected (mismatch): set % was frozen for series % (subject %, known at %), not for this forecast''s series % (subject %, known at %)',
      s.information_set_id, s.series_key, coalesce(s.subject_entity_id::text, 'none'), s.known_at, NEW.series_key, coalesce(NEW.subject_entity_id::text, 'none'), NEW.known_at
      USING ERRCODE = '22023';
  END IF;
  SELECT r INTO v_missing FROM jsonb_array_elements(NEW.evidence_refs) r
   WHERE NOT s.evidence @> jsonb_build_array(jsonb_build_object('evidence_object_id', r ->> 'evidence_object_id',
                                                               'evidence_version', (r ->> 'evidence_version')::int, 'evidence_digest', r ->> 'evidence_digest'))
   LIMIT 1;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'information set rejected (mismatch): the forecast cites evidence %@% which set % did not pin; a grounded forecast reads only its frozen evidence',
      v_missing ->> 'evidence_object_id', v_missing ->> 'evidence_version', s.information_set_id USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.pcx_fct_information_set() FROM PUBLIC;
CREATE TRIGGER pcx_fct_information_set BEFORE INSERT OR UPDATE OF information_set_id ON prediction.forecasts_current
  FOR EACH ROW EXECUTE FUNCTION prediction.pcx_fct_information_set();

/* The pin's ledger: only a forecast that names a set writes it (the forecast's own forecast.information_set_frozen and the set's
   information_set.pinned) — a legacy issue writes nothing more. */
CREATE OR REPLACE FUNCTION prediction.pcx_fct_information_set_pinned() RETURNS trigger
SECURITY DEFINER SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE s prediction.information_sets%ROWTYPE;
BEGIN
  SELECT * INTO s FROM prediction.information_sets x WHERE x.information_set_id = NEW.information_set_id;
  INSERT INTO prediction.forecast_events (event_id, scope, tenant_id, domain_id, forecast_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', NEW.tenant_id, NEW.domain_id, NEW.forecast_id, 'forecast.information_set_frozen', NEW.issued_by,
          jsonb_build_object('information_set_id', s.information_set_id, 'manifest_digest', s.manifest_digest, 'revision_head', s.revision_head,
                             'twin', CASE WHEN s.twin_id IS NULL THEN NULL ELSE jsonb_build_object('twin_id', s.twin_id, 'version', s.twin_version) END,
                             'environment_digest', NEW.environment_digest),
          NEW.correlation_id);
  INSERT INTO prediction.information_set_events (event_id, scope, tenant_id, domain_id, information_set_id, event, forecast_id, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', NEW.tenant_id, NEW.domain_id, s.information_set_id, 'information_set.pinned', NEW.forecast_id, NEW.issued_by,
          jsonb_build_object('horizon', NEW.horizon_code, 'method', NEW.method, 'environment_digest', NEW.environment_digest), NEW.correlation_id);
  RETURN NULL;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.pcx_fct_information_set_pinned() FROM PUBLIC;
CREATE TRIGGER pcx_fct_information_set_pinned AFTER INSERT ON prediction.forecasts_current
  FOR EACH ROW WHEN (NEW.information_set_id IS NOT NULL) EXECUTE FUNCTION prediction.pcx_fct_information_set_pinned();

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §CX.5 the replay port
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/* RECORD a replay (prediction.forecast.replay). The service re-read the pinned inputs, re-assembled the manifest and re-ran the method;
   the port binds what it was handed to what is stored (the forecast, its pin, the frozen manifest digest, the recorded environment) and
   DERIVES the outcome: REPRODUCED only when the replayed manifest and output digests equal the original's and nothing diverged. */
CREATE OR REPLACE FUNCTION prediction.record_forecast_replay(
  p_replay_id uuid, p_tenant uuid, p_domain uuid, p_forecast_id uuid, p_information_set_id uuid,
  p_original_manifest_digest text, p_replayed_manifest_digest text, p_original_output_digest text, p_replayed_output_digest text,
  p_original_environment_digest text, p_replayed_environment_digest text, p_diverged jsonb, p_fresh jsonb, p_detail jsonb,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, observation, public, pg_catalog, pg_temp AS $$
DECLARE f prediction.forecasts_current%ROWTYPE; s prediction.information_sets%ROWTYPE; v_outcome text; v_match boolean; v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.forecast.replay']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'forecast replay rejected (actor): the acting principal % is not the bound principal', p_actor USING ERRCODE = '42501';
  END IF;
  SELECT * INTO f FROM prediction.forecasts_current x WHERE x.forecast_id = p_forecast_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'forecast replay rejected (unknown_forecast): no forecast % in this domain', p_forecast_id USING ERRCODE = '23503';
  END IF;
  IF f.information_set_id IS NULL THEN
    RAISE EXCEPTION 'forecast replay rejected (ungrounded): forecast % was issued without a frozen information set, so nothing pins what it knew — replay needs a grounded forecast (POST …/prediction/forecasts/issue-grounded)', p_forecast_id
      USING ERRCODE = '22023';
  END IF;
  IF p_information_set_id IS DISTINCT FROM f.information_set_id THEN
    RAISE EXCEPTION 'forecast replay rejected (mismatch): forecast % pins information set %, not %', p_forecast_id, f.information_set_id, coalesce(p_information_set_id::text, 'none') USING ERRCODE = '22023';
  END IF;
  SELECT * INTO s FROM prediction.information_sets x WHERE x.information_set_id = f.information_set_id;
  IF coalesce(p_original_manifest_digest, '') <> s.manifest_digest THEN
    RAISE EXCEPTION 'forecast replay rejected (stale): the original manifest digest handed (%) is not the frozen set''s (%)', left(coalesce(p_original_manifest_digest, '-'), 12), left(s.manifest_digest, 12) USING ERRCODE = '23514';
  END IF;
  IF p_original_environment_digest IS DISTINCT FROM f.environment_digest THEN
    RAISE EXCEPTION 'forecast replay rejected (stale): the original environment digest handed is not the one forecast % recorded', p_forecast_id USING ERRCODE = '23514';
  END IF;
  IF coalesce(p_replayed_manifest_digest, '') !~ '^[0-9a-f]{64}$' OR coalesce(p_original_output_digest, '') !~ '^[0-9a-f]{64}$'
     OR (p_replayed_output_digest IS NOT NULL AND p_replayed_output_digest !~ '^[0-9a-f]{64}$')
     OR (p_replayed_environment_digest IS NOT NULL AND p_replayed_environment_digest !~ '^[0-9a-f]{64}$')
     OR p_diverged IS NULL OR jsonb_typeof(p_diverged) <> 'array' OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_diverged) d WHERE jsonb_typeof(d) <> 'object' OR NOT (d ? 'what'))
     OR (p_fresh IS NOT NULL AND jsonb_typeof(p_fresh) <> 'object') THEN
    RAISE EXCEPTION 'forecast replay rejected (contract): a replay hands sha-256 digests, the divergences as [{what, …}] and the fresh grounding as an object' USING ERRCODE = '22023';
  END IF;
  IF (p_replayed_manifest_digest <> p_original_manifest_digest OR p_replayed_output_digest IS DISTINCT FROM p_original_output_digest)
     AND jsonb_array_length(p_diverged) = 0 THEN
    RAISE EXCEPTION 'forecast replay rejected (contract): the digests differ but no divergence is named; a replay that diverged says what diverged' USING ERRCODE = '22023';
  END IF;
  v_outcome := CASE WHEN p_replayed_manifest_digest = p_original_manifest_digest AND p_replayed_output_digest IS NOT DISTINCT FROM p_original_output_digest
                         AND jsonb_array_length(p_diverged) = 0 THEN 'REPRODUCED' ELSE 'DIVERGED' END;
  v_match := p_replayed_environment_digest IS NOT DISTINCT FROM p_original_environment_digest;
  INSERT INTO prediction.forecast_replays (
    replay_id, scope, tenant_id, domain_id, forecast_id, information_set_id, outcome, original_manifest_digest, replayed_manifest_digest,
    original_output_digest, replayed_output_digest, original_environment_digest, replayed_environment_digest, environment_match, diverged,
    fresh, detail, replayed_by, replayed_at, correlation_id
  ) VALUES (
    p_replay_id, 'DOMAIN', p_tenant, p_domain, p_forecast_id, s.information_set_id, v_outcome, p_original_manifest_digest, p_replayed_manifest_digest,
    p_original_output_digest, p_replayed_output_digest, p_original_environment_digest, p_replayed_environment_digest, v_match, p_diverged,
    p_fresh, coalesce(p_detail, '{}'::jsonb), p_actor, v_now, p_correlation);
  INSERT INTO prediction.forecast_events (event_id, scope, tenant_id, domain_id, forecast_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_forecast_id, 'forecast.replayed', p_actor,
          jsonb_build_object('replay_id', p_replay_id, 'outcome', v_outcome, 'information_set_id', s.information_set_id, 'environment_match', v_match,
                             'diverged', (SELECT coalesce(jsonb_agg(d -> 'what'), '[]'::jsonb) FROM jsonb_array_elements(p_diverged) d)),
          p_correlation);
  INSERT INTO prediction.information_set_events (event_id, scope, tenant_id, domain_id, information_set_id, event, forecast_id, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, s.information_set_id, 'information_set.replayed', p_forecast_id, p_actor,
          jsonb_build_object('replay_id', p_replay_id, 'outcome', v_outcome), p_correlation);
  RETURN jsonb_build_object('replay_id', p_replay_id, 'forecast_id', p_forecast_id, 'information_set_id', s.information_set_id, 'outcome', v_outcome,
                            'environment_match', v_match, 'replayed_at', v_now);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.record_forecast_replay(uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, text, jsonb, jsonb, jsonb, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.record_forecast_replay(uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, text, jsonb, jsonb, jsonb, uuid, uuid, uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §CX.6 row security and grants (the 0081 loop idiom; the prediction schema's isolation policy text, 0029:420-425)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['information_sets', 'information_set_events', 'forecast_replays'] LOOP
    EXECUTE format('REVOKE ALL ON prediction.%I FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE prediction.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE prediction.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY prediction_isolation ON prediction.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON prediction.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;
