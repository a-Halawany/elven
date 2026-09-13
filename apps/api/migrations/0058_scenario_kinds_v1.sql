-- ============================================================
-- 0058 · The eight scenario kinds of Volume 0 chapter 14, as a VERSIONED vocabulary;
--        a branch's divergence from the baseline and its own assumptions, declared.
--
-- C-022 (Volume 0 ch. 14): the product "shall support baseline, upside, downside,
-- disruption, stress, adversarial, counterfactual, and user-defined scenarios".
-- Acceptance unit AU-PRD-0021 (audit/acceptance-units/group-b): those kinds "can be
-- created with explicit divergence logic and per-branch assumptions". 0029 admitted three
-- kinds and nothing else; the register scheduled the rest as P4 completion work (S5).
--
-- THE VOCABULARY IS VERSIONED, NOT INLINED. `prediction.scenario_kind_versions` holds the
-- kinds a branch may carry, by version; a branch records the version it was declared
-- under, so a later change to the set is a new version and never a silent rewrite of
-- what an existing branch means. Version 1 is the eight of Volume 0.
--
-- DIVERGENCE AND ASSUMPTIONS. Every branch carries its OWN assumption set (`assumptions`:
-- an array of {statement, basis?} objects, each statement at least 2 characters). The
-- five kinds this migration adds say HOW they diverge from the baseline in prose
-- (`divergence`, at least 8 characters); upside and downside keep 0029's rule, under which
-- their divergence is the indicator that flips them (a non-baseline branch must name one),
-- and may add the prose. A user-defined kind names itself (`kind_label`, 2–64 characters).
-- Existing rows predate the rule and keep their nulls: the divergence constraint is
-- added NOT VALID, so it binds every branch declared from now on and rewrites nothing.
--
-- Forward only: the three kinds of 0029 keep their meaning and their rows; the SCN
-- canonical object takes schema v2 (backward-compatible: v1 documents validate under it).
-- ============================================================

CREATE TABLE prediction.scenario_kind_versions (
  version     int PRIMARY KEY,
  kinds       text[] NOT NULL,
  adopted_at  timestamptz NOT NULL DEFAULT clock_timestamp(),
  source      text NOT NULL
);
-- A vocabulary is not tenant data, but every prediction table is under FORCED row-level
-- security (D8): the policy here says so explicitly — readable in every scope, writable by
-- migrations alone.
ALTER TABLE prediction.scenario_kind_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction.scenario_kind_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY scenario_kind_versions_shared ON prediction.scenario_kind_versions FOR SELECT USING (true);
GRANT SELECT ON prediction.scenario_kind_versions TO eye_app, eye_commit;
INSERT INTO prediction.scenario_kind_versions (version, kinds, source) VALUES
  (1, ARRAY['baseline','upside','downside','disruption','stress','adversarial','counterfactual','user-defined'],
   'Volume 0 chapter 14 (C-022): baseline, upside, downside, disruption, stress, adversarial, counterfactual, user-defined');

ALTER TABLE prediction.branches_current
  DROP CONSTRAINT branches_current_kind_check,
  ADD CONSTRAINT branches_current_kind_check
    CHECK (kind IN ('baseline','upside','downside','disruption','stress','adversarial','counterfactual','user-defined')),
  ADD COLUMN kind_vocabulary_version int NOT NULL DEFAULT 1 REFERENCES prediction.scenario_kind_versions(version),
  ADD COLUMN kind_label text,
  ADD COLUMN divergence text,
  ADD COLUMN assumptions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD CONSTRAINT branches_kind_label_only_user_defined
    CHECK ((kind = 'user-defined' AND kind_label IS NOT NULL AND length(btrim(kind_label)) BETWEEN 2 AND 64)
        OR (kind <> 'user-defined' AND kind_label IS NULL)),
  ADD CONSTRAINT branches_assumptions_are_a_list CHECK (jsonb_typeof(assumptions) = 'array');
-- Binds new rows only: the branches of 0029–0057 were declared before divergence was asked for.
ALTER TABLE prediction.branches_current
  ADD CONSTRAINT branches_divergence_declared
    CHECK (kind IN ('baseline','upside','downside') OR (divergence IS NOT NULL AND length(btrim(divergence)) >= 8)) NOT VALID;
COMMENT ON COLUMN prediction.branches_current.kind_vocabulary_version IS 'the scenario_kind_versions row the kind was declared under';
COMMENT ON COLUMN prediction.branches_current.divergence IS 'how this branch diverges from the baseline (prose; required for the disruption, stress, adversarial, counterfactual and user-defined kinds; upside and downside diverge by their flip indicator and may add it)';
COMMENT ON COLUMN prediction.branches_current.assumptions IS 'the branch''s own assumption set: [{statement, basis?}]';

-- The port, replaced: three more inputs, validated here so no caller can skip them.
DROP FUNCTION IF EXISTS prediction.add_branch(uuid,uuid,uuid,uuid,text,text,text,uuid,text,uuid,text,int,text,timestamptz,uuid,uuid,uuid);
CREATE OR REPLACE FUNCTION prediction.add_branch(
  p_branch_id uuid, p_tenant uuid, p_domain uuid, p_scenario_id uuid, p_name text, p_kind text,
  p_statement text, p_indicator_id uuid, p_signpost text, p_owner uuid, p_review_cadence text,
  p_response_hours int, p_consequence text, p_decision_deadline timestamptz,
  p_kind_label text, p_divergence text, p_assumptions jsonb,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_kinds text[]; v_a jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.scenario.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT kinds INTO v_kinds FROM prediction.scenario_kind_versions WHERE version = 1;
  IF p_kind IS NULL OR NOT (p_kind = ANY (v_kinds)) THEN
    RAISE EXCEPTION 'branch rejected: kind % is not in scenario kind vocabulary v1 (%)', coalesce(p_kind, '<null>'), array_to_string(v_kinds, ', ')
      USING ERRCODE = '23514';
  END IF;
  IF p_kind = 'user-defined' AND (p_kind_label IS NULL OR length(btrim(p_kind_label)) NOT BETWEEN 2 AND 64) THEN
    RAISE EXCEPTION 'branch rejected: a user-defined kind names itself (kind_label, 2-64 characters)' USING ERRCODE = '23514';
  END IF;
  IF p_kind <> 'user-defined' AND p_kind_label IS NOT NULL THEN
    RAISE EXCEPTION 'branch rejected: kind_label belongs to a user-defined kind only' USING ERRCODE = '23514';
  END IF;
  IF p_kind NOT IN ('baseline','upside','downside') AND (p_divergence IS NULL OR length(btrim(p_divergence)) < 8) THEN
    RAISE EXCEPTION 'branch rejected: a % branch says how it diverges from the baseline (divergence, at least 8 characters)', p_kind USING ERRCODE = '23514';
  END IF;
  IF p_divergence IS NOT NULL AND length(btrim(p_divergence)) < 8 THEN
    RAISE EXCEPTION 'branch rejected: divergence, when given, is at least 8 characters' USING ERRCODE = '23514';
  END IF;
  IF p_assumptions IS NULL OR jsonb_typeof(p_assumptions) <> 'array' THEN
    RAISE EXCEPTION 'branch rejected: assumptions is a list' USING ERRCODE = '23514';
  END IF;
  FOR v_a IN SELECT * FROM jsonb_array_elements(p_assumptions) LOOP
    IF jsonb_typeof(v_a) <> 'object' OR jsonb_typeof(v_a -> 'statement') <> 'string' OR length(btrim(v_a ->> 'statement')) < 2 THEN
      RAISE EXCEPTION 'branch rejected: every assumption is an object with a statement of at least 2 characters' USING ERRCODE = '23514';
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM prediction.scenarios_current s WHERE s.scenario_id = p_scenario_id
                   AND s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.state = 'active') THEN
    RAISE EXCEPTION 'branch rejected: no active scenario % in this domain', p_scenario_id USING ERRCODE = '23503';
  END IF;
  IF p_indicator_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM prediction.indicators_current i
      WHERE i.indicator_id = p_indicator_id AND i.tenant_id = p_tenant AND i.domain_id = p_domain) THEN
    RAISE EXCEPTION 'branch rejected: no such indicator in this domain' USING ERRCODE = '23503';
  END IF;
  INSERT INTO prediction.branches_current (
    branch_id, scope, tenant_id, domain_id, scenario_id, name, kind, statement, indicator_id, signpost,
    owner_principal_id, review_cadence, response_window_hours, consequence, state, correlation_id, decision_deadline,
    kind_vocabulary_version, kind_label, divergence, assumptions
  ) VALUES (
    p_branch_id, 'DOMAIN', p_tenant, p_domain, p_scenario_id, p_name, p_kind, p_statement, p_indicator_id,
    p_signpost, p_owner, p_review_cadence, coalesce(p_response_hours, 72), p_consequence, 'open', p_correlation,
    p_decision_deadline, 1, p_kind_label, p_divergence, p_assumptions);
  INSERT INTO prediction.scenario_events (
    event_id, scope, tenant_id, domain_id, scenario_id, branch_id, event, actor_principal_id, details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_scenario_id, p_branch_id, 'branch.added', p_actor,
    jsonb_build_object('name', p_name, 'kind', p_kind, 'kind_label', p_kind_label, 'kind_vocabulary_version', 1,
                       'indicator_id', p_indicator_id, 'owner', p_owner, 'decision_deadline', p_decision_deadline,
                       'divergence', p_divergence, 'assumptions', p_assumptions),
    p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.add_branch(uuid,uuid,uuid,uuid,text,text,text,uuid,text,uuid,text,int,text,timestamptz,text,text,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.add_branch(uuid,uuid,uuid,uuid,text,text,text,uuid,text,uuid,text,int,text,timestamptz,text,text,jsonb,uuid,uuid,uuid) TO eye_commit;

-- SCN v2: the eight kinds, the label, the divergence and the assumptions on a branch.
-- Backward: every v1 document validates under v2 (the new properties are optional and the
-- v1 kinds are a subset of the v2 enum).
INSERT INTO objects.schema_registry (object_type, schema_version, json_schema, compatibility) VALUES
('SCN', 'v2', '{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["title","statement","owner","review_cadence","branches"],
  "properties": {
    "title": { "type": "string", "minLength": 2 },
    "statement": { "type": "string", "minLength": 2 },
    "forecast_id": { "type": ["string","null"] },
    "subject_entity_id": { "type": ["string","null"] },
    "owner": { "type": "string" },
    "review_cadence": { "type": "string" },
    "kind_vocabulary_version": { "type": "integer", "minimum": 1 },
    "branches": { "type": "array", "minItems": 1, "items": { "type": "object",
                  "required": ["branch_id","name","kind","statement","owner","consequence"],
                  "properties": { "branch_id": { "type": "string" }, "name": { "type": "string" },
                                  "kind": { "enum": ["baseline","upside","downside","disruption","stress","adversarial","counterfactual","user-defined"] },
                                  "kind_label": { "type": ["string","null"], "minLength": 2, "maxLength": 64 },
                                  "divergence": { "type": ["string","null"] },
                                  "assumptions": { "type": "array", "items": { "type": "object", "required": ["statement"],
                                                   "properties": { "statement": { "type": "string", "minLength": 2 }, "basis": { "type": ["string","null"] } } } },
                                  "statement": { "type": "string" },
                                  "indicator": { "type": ["object","null"] }, "signpost": { "type": ["string","null"] },
                                  "owner": { "type": "string" }, "review_cadence": { "type": "string" },
                                  "response_window_hours": { "type": "integer" }, "consequence": { "type": "string" },
                                  "decision_deadline": { "type": ["string","null"] } } } },
    "controls": { "type": "object" }
  }
}'::jsonb, 'backward');
