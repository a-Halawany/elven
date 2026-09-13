-- 0061_warning_levels_v1.sql — CP-6 batch B2: warning levels.
--
-- The decision (register R-4 (1)): four levels — low, normal, high, critical — derived by a
-- VERSIONED rule from the consequence class, stating impact and response urgency; confidence and
-- the C0–C4 authority class kept explicit and distinct: a label never changes decision authority.
--
--   §1  The class of the consequence a branch's flip reaches (Volume 5 ch. 58: C0 informational,
--       C1 bounded analytical, C2 material advisory, C3 consequential decision support, C4 safety-,
--       mission-, rights- or system-critical), DECLARED by the human who declares the branch.
--       NULL = declared before this migration, or not stated: a warning raised from such a branch
--       records its class as ASSUMED by the derivation's absent-class rule, never as declared.
--   §2  Warning level derivation v1 — a versioned record, readable everywhere, writable by
--       migrations alone, never rewritten: consequence class → level, urgency, response, impact.
--       The absent-class rule is part of the version (C2 assumed: Volume 5 p. 132 "risk class
--       missing or disputed → apply the more restrictive plausible class"; DP-63-005 "assume the
--       safer consequence class"; a warning advises and executes nothing, so C2 is the more
--       restrictive plausible class — C3/C4 are never assumed, that would manufacture urgency).
--   §3  A warning records the class and its source, the level, the derivation version, the urgency
--       and — beside them, never read by the derivation — the C0–C4 class of the AUTHORITY CONTEXT
--       the raise ran under (public.eye_op_class(), the 0042/0043 precedent). The port derives the
--       level itself and REFUSES a caller whose canonical object disagrees (0031's timeliness
--       pattern), and the six columns are immutable: a changed derivation is a new version for the
--       warnings raised after it. Nothing here is read by the PDP or by any port that decides
--       authority; acknowledgement and commitment rules are untouched.
--   §4  SCN v3 (the branch's class) and WRN v2 (the level; and the timing and controls the payload
--       has carried since 0030/0031, which the stale v1 forbade) registered backward-compatibly.
-- Forward only.

-- ============================================================
-- §1 The consequence class on a branch; the port replaced (0058's rules unchanged).
-- ============================================================
ALTER TABLE prediction.branches_current
  ADD COLUMN consequence_class text CHECK (consequence_class IN ('C0','C1','C2','C3','C4'));
COMMENT ON COLUMN prediction.branches_current.consequence_class IS
  'The class of the consequence this branch''s flip reaches (Volume 5 ch. 58, C0–C4), declared by the branch''s declarer. NULL: declared before 0061 or not stated — a warning from this branch is classed by the absent-class rule of the current warning level derivation and says so.';

DROP FUNCTION IF EXISTS prediction.add_branch(uuid,uuid,uuid,uuid,text,text,text,uuid,text,uuid,text,int,text,timestamptz,text,text,jsonb,uuid,uuid,uuid);
CREATE OR REPLACE FUNCTION prediction.add_branch(
  p_branch_id uuid, p_tenant uuid, p_domain uuid, p_scenario_id uuid, p_name text, p_kind text,
  p_statement text, p_indicator_id uuid, p_signpost text, p_owner uuid, p_review_cadence text,
  p_response_hours int, p_consequence text, p_consequence_class text, p_decision_deadline timestamptz,
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
  -- 0061: the class of the consequence, when declared, is one of Volume 5's five.
  IF p_consequence_class IS NOT NULL AND p_consequence_class NOT IN ('C0','C1','C2','C3','C4') THEN
    RAISE EXCEPTION 'branch rejected: consequence class % is not one of C0–C4 (Volume 5 ch. 58)', p_consequence_class USING ERRCODE = '23514';
  END IF;
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
    owner_principal_id, review_cadence, response_window_hours, consequence, consequence_class, state, correlation_id, decision_deadline,
    kind_vocabulary_version, kind_label, divergence, assumptions
  ) VALUES (
    p_branch_id, 'DOMAIN', p_tenant, p_domain, p_scenario_id, p_name, p_kind, p_statement, p_indicator_id,
    p_signpost, p_owner, p_review_cadence, coalesce(p_response_hours, 72), p_consequence, p_consequence_class, 'open', p_correlation,
    p_decision_deadline, 1, p_kind_label, p_divergence, p_assumptions);
  INSERT INTO prediction.scenario_events (
    event_id, scope, tenant_id, domain_id, scenario_id, branch_id, event, actor_principal_id, details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_scenario_id, p_branch_id, 'branch.added', p_actor,
    jsonb_build_object('name', p_name, 'kind', p_kind, 'kind_label', p_kind_label, 'kind_vocabulary_version', 1,
                       'indicator_id', p_indicator_id, 'owner', p_owner, 'decision_deadline', p_decision_deadline,
                       'consequence_class', p_consequence_class, 'divergence', p_divergence, 'assumptions', p_assumptions),
    p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.add_branch(uuid,uuid,uuid,uuid,text,text,text,uuid,text,uuid,text,int,text,text,timestamptz,text,text,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.add_branch(uuid,uuid,uuid,uuid,text,text,text,uuid,text,uuid,text,int,text,text,timestamptz,text,text,jsonb,uuid,uuid,uuid) TO eye_commit;

-- ============================================================
-- §2 Warning level derivation v1 — a versioned record.
-- ============================================================
CREATE TABLE prediction.warning_level_versions (
  version           int PRIMARY KEY,
  adopted_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  source            text NOT NULL,
  absent_class_rule text NOT NULL
);
CREATE TABLE prediction.warning_level_derivations (
  version           int  NOT NULL REFERENCES prediction.warning_level_versions(version),
  consequence_class text NOT NULL CHECK (consequence_class IN ('C0','C1','C2','C3','C4')),
  level             text NOT NULL CHECK (level IN ('low','normal','high','critical')),
  urgency           text NOT NULL CHECK (urgency IN ('routine','prompt','urgent','immediate')),
  response          text NOT NULL CHECK (response IN ('acknowledge','acknowledge-and-act','act')),
  impact            text NOT NULL CHECK (length(btrim(impact)) >= 8),
  basis             text NOT NULL,
  PRIMARY KEY (version, consequence_class)
);
-- Reference data under FORCED RLS (0058's vocabulary pattern): readable in every scope, writable by migrations alone, never rewritten.
ALTER TABLE prediction.warning_level_versions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction.warning_level_versions    FORCE ROW LEVEL SECURITY;
ALTER TABLE prediction.warning_level_derivations ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction.warning_level_derivations FORCE ROW LEVEL SECURITY;
CREATE POLICY warning_level_versions_shared    ON prediction.warning_level_versions    FOR SELECT USING (true);
CREATE POLICY warning_level_derivations_shared ON prediction.warning_level_derivations FOR SELECT USING (true);
GRANT SELECT ON prediction.warning_level_versions, prediction.warning_level_derivations TO eye_app, eye_commit;
CREATE TRIGGER wlv_append_only BEFORE UPDATE OR DELETE ON prediction.warning_level_versions    FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TRIGGER wld_append_only BEFORE UPDATE OR DELETE ON prediction.warning_level_derivations FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

INSERT INTO prediction.warning_level_versions (version, source, absent_class_rule) VALUES
  (1, 'Volume 5 ch. 58 p. 131 (C0–C4 consequence classes); Volume 9 Appendix M p. 184 (NOT-01..32 priority and response columns; NOT-06 consequence-based; NOT-07 warning escalation high or critical); Volume 4 ch. 47 p. 112–113 (no manufactured urgency) and SLO-016 p. 183; Volume 8 ch. 26 p. 64–65 (PR-26-003/-005); delivery register R-4 (1), 2026-09-10',
      'C2 assumed: Volume 5 p. 132 "risk class missing or disputed → apply the more restrictive plausible class and block expansion until adjudicated"; DP-63-005 "assume the safer consequence class". A warning advises and executes nothing, so the plausible classes are C1 and C2 and the more restrictive is C2; C3/C4 are never assumed (a consequential decision or a critical exposure rests on a branch only when a human declares it). Recorded as consequence_class_source = assumed; the declarer adjudicates by declaring the class on a new scenario.');
INSERT INTO prediction.warning_level_derivations (version, consequence_class, level, urgency, response, impact, basis) VALUES
  (1, 'C0', 'low',      'routine',   'acknowledge',         'informational: nothing rests on it; the flip is reported for the record',                                          'V9 NOT-01 Low / informational only; D6 keeps the response window (0029)'),
  (1, 'C1', 'low',      'routine',   'acknowledge',         'bounded analytical: an analysis changes; no decision is owed',                                                    'V9 NOT-09 Low / analyst queue; C1 bounded analytical'),
  (1, 'C2', 'normal',   'prompt',    'acknowledge',         'material advisory: informs a decision an accountable owner may take; the response window is the product',        'V9 NOT-02/03 Normal / acknowledge; V4 SLO-016 material warnings reach the owner inside the window'),
  (1, 'C3', 'high',     'urgent',    'acknowledge-and-act', 'consequential decision support: a consequential (C3) decision rests on it; the deadline is the decision''s',       'V9 NOT-04/23/24 High; NOT-07 warning escalation high or critical — acknowledge and act'),
  (1, 'C4', 'critical', 'immediate', 'act',                 'safety-, mission-, rights- or system-critical: harm a wrong or late response cannot undo',                        'V9 NOT-11/27/28 Critical / act; NOT-07 redundant verified channels');

CREATE OR REPLACE FUNCTION prediction.current_warning_level_version() RETURNS int
STABLE SET search_path = prediction, pg_catalog, pg_temp AS $$ SELECT max(version) FROM prediction.warning_level_versions $$ LANGUAGE sql;

-- THE ONE DERIVATION: used by the service to build the canonical object and by the port to verify it,
-- so the object and the row cannot disagree and no copy of the table lives in application code.
CREATE OR REPLACE FUNCTION prediction.derive_warning_level(p_class text, p_version int DEFAULT NULL)
RETURNS TABLE (out_version int, out_level text, out_urgency text, out_response text, out_impact text)
STABLE SET search_path = prediction, pg_catalog, pg_temp AS $$
DECLARE v_version int := coalesce(p_version, prediction.current_warning_level_version()); v_n int;
BEGIN
  IF p_class IS NULL OR p_class NOT IN ('C0','C1','C2','C3','C4') THEN
    RAISE EXCEPTION 'derivation refused: consequence class % is not one of C0–C4', coalesce(p_class, '<null>') USING ERRCODE = '22023';
  END IF;
  SELECT count(*) INTO v_n FROM prediction.warning_level_derivations d WHERE d.version = v_version;
  IF v_n <> 5 THEN
    RAISE EXCEPTION 'derivation refused: warning level derivation v% is incomplete (% of 5 classes)', v_version, v_n USING ERRCODE = '22023';
  END IF;
  RETURN QUERY SELECT d.version, d.level, d.urgency, d.response, d.impact
    FROM prediction.warning_level_derivations d WHERE d.version = v_version AND d.consequence_class = p_class;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.current_warning_level_version() FROM PUBLIC;
REVOKE ALL ON FUNCTION prediction.derive_warning_level(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.current_warning_level_version() TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION prediction.derive_warning_level(text, int) TO eye_app, eye_commit;

-- ============================================================
-- §3 The warning carries its level; the raise port derives and verifies it.
-- ============================================================
ALTER TABLE prediction.warnings_current
  ADD COLUMN consequence_class        text CHECK (consequence_class IN ('C0','C1','C2','C3','C4')),
  ADD COLUMN consequence_class_source text CHECK (consequence_class_source IN ('declared','assumed')),
  ADD COLUMN level                    text CHECK (level IN ('low','normal','high','critical')),
  ADD COLUMN level_version            int  REFERENCES prediction.warning_level_versions(version),
  ADD COLUMN urgency                  text CHECK (urgency IN ('routine','prompt','urgent','immediate')),
  ADD COLUMN op_class                 text CHECK (op_class IN ('C0','C1','C2','C3','C4')),
  ADD CONSTRAINT wrn_level_coherent CHECK (
       (level IS NULL AND level_version IS NULL AND urgency IS NULL AND consequence_class IS NULL AND consequence_class_source IS NULL AND op_class IS NULL)
    OR (level IS NOT NULL AND level_version IS NOT NULL AND urgency IS NOT NULL AND consequence_class IS NOT NULL AND consequence_class_source IS NOT NULL AND op_class IS NOT NULL));
-- Binds rows raised from now on; a warning raised before a derivation existed keeps NULL and the record says so (0030/0058 precedent: nothing rewritten to look compliant).
ALTER TABLE prediction.warnings_current ADD CONSTRAINT wrn_level_derived CHECK (level IS NOT NULL) NOT VALID;
CREATE INDEX wrn_level ON prediction.warnings_current (tenant_id, domain_id, level, state);
COMMENT ON COLUMN prediction.warnings_current.consequence_class IS 'C0–C4 class of the consequence the flip reaches: the branch''s declaration (source = declared) or the derivation version''s absent-class rule (source = assumed). The derivation input; never the authority class.';
COMMENT ON COLUMN prediction.warnings_current.level IS 'low | normal | high | critical — derived at raise time from consequence_class under level_version; a DISPLAY label read by no PDP rule and no port that decides authority.';
COMMENT ON COLUMN prediction.warnings_current.urgency IS 'routine | prompt | urgent | immediate — the response urgency the same derivation states.';
COMMENT ON COLUMN prediction.warnings_current.op_class IS 'The C0–C4 class of the AUTHORITY CONTEXT the raise operation ran under (public.eye_op_class(), the policy decision''s consequence_class). Recorded beside the label; the label never changes it.';

CREATE OR REPLACE FUNCTION prediction.warning_level_immutable() RETURNS trigger
SECURITY DEFINER SET search_path = prediction, pg_catalog, pg_temp AS $$
BEGIN
  IF NEW.level IS DISTINCT FROM OLD.level OR NEW.level_version IS DISTINCT FROM OLD.level_version
     OR NEW.urgency IS DISTINCT FROM OLD.urgency OR NEW.consequence_class IS DISTINCT FROM OLD.consequence_class
     OR NEW.consequence_class_source IS DISTINCT FROM OLD.consequence_class_source OR NEW.op_class IS DISTINCT FROM OLD.op_class THEN
    RAISE EXCEPTION 'warning rejected: level, urgency, consequence class and authority class are derived at raise time and never rewritten; a changed derivation is a new version for the warnings raised after it' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER wrn_level_immutable BEFORE UPDATE ON prediction.warnings_current FOR EACH ROW EXECUTE FUNCTION prediction.warning_level_immutable();

DROP FUNCTION prediction.raise_warning(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,text,numeric,timestamptz,timestamptz,uuid,uuid,timestamptz,text,timestamptz,boolean,boolean,jsonb,uuid,uuid,uuid);
CREATE OR REPLACE FUNCTION prediction.raise_warning(
  p_warning_id uuid, p_tenant uuid, p_domain uuid, p_branch_id uuid, p_indicator_id uuid, p_forecast_id uuid,
  p_title text, p_evidence jsonb, p_consequence text, p_confidence numeric,
  p_opens_at timestamptz, p_closes_at timestamptz, p_routed_to uuid,
  p_flip_event_id uuid, p_raised_as_of timestamptz, p_timing_mode text, p_decision_deadline timestamptz,
  p_timely boolean, p_decision_missed boolean, p_controls jsonb,
  p_consequence_class text, p_consequence_class_source text, p_level text, p_level_version int, p_urgency text, p_op_class text,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = prediction, graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_declared text; v_found boolean; v_class text; v_source text; d record; v_op text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.warning.raise']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF NOT EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = p_routed_to AND p.status = 'active'
                   AND p.tenant_id = p_tenant) THEN
    RAISE EXCEPTION 'warning rejected: it must route to a named, active principal in this tenant' USING ERRCODE = '23503';
  END IF;
  -- The deadline and the timeliness must agree: raised at or after the deadline is a missed decision, never timely.
  IF p_decision_deadline IS NOT NULL AND p_raised_as_of >= p_decision_deadline AND (p_timely IS DISTINCT FROM false OR p_decision_missed IS DISTINCT FROM true) THEN
    RAISE EXCEPTION 'warning rejected: raised at or after its decision deadline but not recorded as a missed decision' USING ERRCODE = '22023';
  END IF;
  IF p_decision_deadline IS NOT NULL AND p_raised_as_of < p_decision_deadline AND p_timely IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'warning rejected: raised before its decision deadline but not recorded as timely' USING ERRCODE = '22023';
  END IF;
  -- THE CLASS IS THE BRANCH'S DECLARATION, OR ASSUMED BY THE VERSION'S RULE — never the caller's choice.
  IF p_branch_id IS NOT NULL THEN
    SELECT b.consequence_class, true INTO v_declared, v_found FROM prediction.branches_current b
     WHERE b.branch_id = p_branch_id AND b.tenant_id = p_tenant AND b.domain_id = p_domain;
    IF v_found IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'warning rejected: no such branch in this domain' USING ERRCODE = '23503';
    END IF;
    v_class := coalesce(v_declared, 'C2');
    v_source := CASE WHEN v_declared IS NULL THEN 'assumed' ELSE 'declared' END;
  ELSE
    IF p_consequence_class IS NULL THEN
      RAISE EXCEPTION 'warning rejected: a warning that rests on no branch must declare its consequence class' USING ERRCODE = '22023';
    END IF;
    v_class := p_consequence_class; v_source := 'declared';
  END IF;
  IF p_consequence_class IS DISTINCT FROM v_class OR p_consequence_class_source IS DISTINCT FROM v_source THEN
    RAISE EXCEPTION 'warning rejected: consequence class %/% disagrees with the branch''s declaration (% %)',
      coalesce(p_consequence_class, '<null>'), coalesce(p_consequence_class_source, '<null>'), v_class, v_source USING ERRCODE = '22023';
  END IF;
  -- THE LEVEL IS DERIVED HERE; what the caller wrote into the canonical object must agree, or nothing is admitted.
  SELECT * INTO d FROM prediction.derive_warning_level(v_class, NULL);
  IF p_level IS DISTINCT FROM d.out_level OR p_level_version IS DISTINCT FROM d.out_version OR p_urgency IS DISTINCT FROM d.out_urgency THEN
    RAISE EXCEPTION 'warning rejected: level % (v%) urgency % disagrees with derivation v% for class %: level %, urgency %',
      coalesce(p_level, '<null>'), coalesce(p_level_version::text, '<null>'), coalesce(p_urgency, '<null>'), d.out_version, v_class, d.out_level, d.out_urgency USING ERRCODE = '22023';
  END IF;
  -- THE AUTHORITY CLASS IS THE CONTEXT'S, recorded beside the label (0042/0043 precedent); the label is not consulted.
  v_op := public.eye_op_class();
  IF v_op IS NULL OR v_op NOT IN ('C0','C1','C2','C3','C4') THEN
    RAISE EXCEPTION 'warning rejected: raised outside a classed authority context (%)', coalesce(v_op, 'none') USING ERRCODE = '42501';
  END IF;
  IF p_op_class IS DISTINCT FROM v_op THEN
    RAISE EXCEPTION 'warning rejected: the recorded authority class % is not the context''s %', coalesce(p_op_class, '<null>'), v_op USING ERRCODE = '22023';
  END IF;
  -- ONE WARNING PER FLIP. A second raise for the same flip is refused by the unique index.
  INSERT INTO prediction.warnings_current (
    warning_id, scope, tenant_id, domain_id, branch_id, indicator_id, forecast_id, title, evidence,
    consequence, confidence, response_window_opens_at, response_window_closes_at, routed_to,
    raised_by, state, correlation_id, flip_event_id, raised_as_of, timing_mode, decision_deadline, timely,
    decision_missed, controls, consequence_class, consequence_class_source, level, level_version, urgency, op_class
  ) VALUES (
    p_warning_id, 'DOMAIN', p_tenant, p_domain, p_branch_id, p_indicator_id, p_forecast_id, p_title,
    p_evidence, p_consequence, p_confidence, p_opens_at, p_closes_at, p_routed_to, p_actor, 'raised',
    p_correlation, p_flip_event_id, coalesce(p_raised_as_of, clock_timestamp()), coalesce(p_timing_mode, 'live'),
    p_decision_deadline, p_timely, coalesce(p_decision_missed, false), coalesce(p_controls, '{}'::jsonb),
    v_class, v_source, d.out_level, d.out_version, d.out_urgency, v_op);
  INSERT INTO prediction.warning_events (
    event_id, scope, tenant_id, domain_id, warning_id, event, actor_principal_id, details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_warning_id, 'warning.raised', p_actor,
    jsonb_build_object('routed_to', p_routed_to, 'closes_at', p_closes_at, 'branch_id', p_branch_id,
                       'confidence', p_confidence, 'title', p_title, 'flip_event_id', p_flip_event_id,
                       'raised_as_of', p_raised_as_of, 'timing_mode', p_timing_mode,
                       'decision_deadline', p_decision_deadline, 'timely', p_timely,
                       'decision_missed', coalesce(p_decision_missed, false),
                       'consequence_class', v_class, 'consequence_class_source', v_source,
                       'level', d.out_level, 'level_version', d.out_version, 'urgency', d.out_urgency, 'response', d.out_response,
                       'op_class', v_op),
    p_correlation);
  IF p_branch_id IS NOT NULL THEN
    UPDATE prediction.branches_current SET warning_state = 'raised' WHERE branch_id = p_branch_id;
    INSERT INTO graph.dependencies (
      dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type,
      depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id
    ) VALUES (
      gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_warning_id, 'WRN', 'strategy',
      (SELECT s.scenario_id FROM prediction.branches_current b JOIN prediction.scenarios_current s USING (scenario_id)
        WHERE b.branch_id = p_branch_id),
      'the warning was raised because this scenario''s branch flipped', 'active', p_actor, p_correlation)
    ON CONFLICT DO NOTHING;
  END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.raise_warning(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,text,numeric,timestamptz,timestamptz,uuid,uuid,timestamptz,text,timestamptz,boolean,boolean,jsonb,text,text,text,int,text,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.raise_warning(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,text,numeric,timestamptz,timestamptz,uuid,uuid,timestamptz,text,timestamptz,boolean,boolean,jsonb,text,text,text,int,text,text,uuid,uuid,uuid) TO eye_commit;

-- ============================================================
-- §4 SCN v3 (the branch's class) and WRN v2 (the level; the timing and controls the payload has
--    carried since 0030/0031). Backward: every earlier document validates.
-- ============================================================
INSERT INTO objects.schema_registry (object_type, schema_version, json_schema, compatibility) VALUES
('SCN', 'v3', '{
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
                                  "consequence_class": { "enum": ["C0","C1","C2","C3","C4",null] },
                                  "decision_deadline": { "type": ["string","null"] } } } },
    "controls": { "type": "object" }
  }
}'::jsonb, 'backward'),
('WRN', 'v2', '{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["title","evidence","consequence","confidence","response_window","routed_to"],
  "properties": {
    "title": { "type": "string", "minLength": 2 },
    "branch_id": { "type": ["string","null"] },
    "indicator_id": { "type": ["string","null"] },
    "forecast_id": { "type": ["string","null"] },
    "flip_event_id": { "type": ["string","null"] },
    "evidence": { "type": "array", "minItems": 1 },
    "consequence": { "type": "string", "minLength": 8 },
    "consequence_class": { "enum": ["C0","C1","C2","C3","C4"] },
    "consequence_class_source": { "enum": ["declared","assumed"] },
    "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
    "timing": { "type": "object", "required": ["mode","raised_as_of","recorded_at"],
                "properties": { "mode": { "enum": ["live","replay"] }, "raised_as_of": { "type": "string" }, "recorded_at": { "type": "string" },
                                "decision_deadline": { "type": ["string","null"] }, "timely": { "type": ["boolean","null"] }, "decision_missed": { "type": "boolean" } } },
    "response_window": { "type": "object", "required": ["opens_at","closes_at"],
                         "properties": { "opens_at": { "type": "string" }, "closes_at": { "type": "string" } } },
    "routed_to": { "type": "string" },
    "controls": { "type": "object" },
    "level": { "type": "object", "required": ["value","version","urgency","response"],
               "properties": { "value": { "enum": ["low","normal","high","critical"] }, "version": { "type": "integer", "minimum": 1 },
                               "urgency": { "enum": ["routine","prompt","urgent","immediate"] },
                               "response": { "enum": ["acknowledge","acknowledge-and-act","act"] }, "impact": { "type": "string" } } },
    "authority": { "type": "object", "required": ["op_class"], "properties": { "op_class": { "enum": ["C0","C1","C2","C3","C4"] } } }
  }
}'::jsonb, 'backward');
