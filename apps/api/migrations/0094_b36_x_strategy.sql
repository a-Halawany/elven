-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- section `strategy`
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0094 §S — CP-6 B36 part `strategy` (2026-09-30): THE SCORE AND THE STRATEGY GRAPH COMPLETED — F-P6-08 (f)(g)(h) and F-P6-09 (a)–(e).
-- Built on the §0 prelude (executive.record_signature / signature_of with the subject kind `health_snapshot`; executive.current_context;
-- the attention class `strategy.detection` and the subject kind `strategy_object`). Forward-only; 0089–0093 untouched; every
-- re-declaration below names the line it copies and carries ONE change.
--
--   §S1 THE HEALTH INPUT CONTRACT WITH OWNERS (f): executive.health_inputs — one row per component of a definition: the input's OWNER
--       (derived from the input's own object: the measure's MSR owner, the indicator's owner, the exposure's owner, the objective's
--       owner for the four new classes — never assigned by hand), the value the score last read or the owner last stated, its as-of and
--       digest; executive.health_input_edits (append-only: who, when, from → to, reason) written by executive.set_health_input — the
--       OWNER-CORRECTION route (the input's owner only: `health input rejected (ownership)`; a reason required). THE ANTI-GAMING MEASURE:
--       an owner edit inside the definition's policy window (owner_edit_window_days — the new column, set from the model's optional key)
--       BEFORE a favourable change of the component's dimension is FLAGGED on the change (health_score_changes.owner_edit_flag, the edit
--       ids) and counted per owner by executive.owner_edit_analysis (a read; it also feeds §S6's gamed_measure detection).
--   §S2 FOUR MORE SCORE INPUTS (g): the contract's kinds gain capability (the share of an objective's supporting capabilities an active
--       initiative builds), execution (the share of the objective's commitment items delivered by their due instant), outcome (the share
--       of recorded outcomes met on the decisions resting on it) and quality (the share of the objective's measures approved AND fresh);
--       executive.health_measure_inputs re-declared with the four branches unioned (0089 line 4494, ONE change).
--   §S3 EXCEPTIONS AS RECORDED OBJECTS (g): executive.health_exceptions — a component EXCLUDED or its freshness bound RELAXED for a
--       period, REQUESTED by a named human and APPROVED (or refused) by ANOTHER holding the executive's authority, with a reason and an
--       expiry; the score names the exceptions in force at its instant; an unapproved or expired exception has no effect.
--   §S4 THE SNAPSHOT APPROVAL (h): executive.health_snapshot_approvals — the executive's acceptance of a CURRENT snapshot on the digest
--       previewed (executive.preview_health_snapshot_approval: the digest, the consequence, the flags, the exceptions), SIGNED beyond the
--       audit chain (§0 record_signature, kind health_snapshot — the TypeScript signer under the same bound action).
--   §S5 THE COMPUTATION re-declared (0089 line 4266, ONE block): the owner-stated readings joined to the contract rows, the exceptions in
--       force applied to the model, the owner-edit flag on each favourable change, the input register refreshed.
--   §S6 REVOCABLE AUTHORITY ACTS (b): graph.strategy_authority_acts gains revoked_at / revoked_by / revocation_reason (a forward-only
--       trigger replaces the append-only one: the three fields set once, nothing else changes); graph.revoke_authority_act (the act's
--       issuer or a domain administrator; a reason; a lapsed act is not revoked — 409); every read that judges an act "in force" —
--       graph.measure_freshness (line 2853), graph.strategy_detections (line 3010), graph.alignment_gaps (line 3116) — re-declared with
--       ONE change: the revocation predicate beside each `recorded_at <= p_at`; graph.record_strategy_authority_act (line 2883) with ONE
--       change: a revoked act is no duplicate.
--   §S7 THE DETECTIONS RAISED ON A SCHEDULE (c): graph.strategy_detections (the TABLE; the 0089 read of the same name keeps its "as of
--       this read" role) — stale_measure, gamed_measure, lost_linkage, owner_missing, each ONCE per (kind, subject, cause) and ROUTED by
--       the same call as an attention item of class strategy.detection to the object's owner under the active attention policy;
--       graph.raise_strategy_detections is the attention tick's step `strategy-detections` (order 50; executive.attention.tick).
--   §S8 THE PLAN LINKS (d): graph.strategy_plan_links — the initiatives Part P declares against an objective, read only when
--       executive.initiatives exists (to_regclass), never declared here.
--   §S9 RLS and the grants.
-- NOT HERE (stated): GraphChanged on alignment / measure / owner changes is the strategy routes' outbox event (the TypeScript, part
-- `strategy`: the change kinds strategy.alignment_changed / strategy.measure_changed / strategy.owner_changed); no SQL vocabulary lists
-- change kinds (a subscription filters on its own change_kinds list — 0063). Every figure the harness seeds is SYNTHETIC.

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §S1 THE HEALTH INPUT CONTRACT WITH OWNERS
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- executive.health_input_kinds re-declared (0089 line 3503, whole; ONE change: the four new classes)
CREATE OR REPLACE FUNCTION executive.health_input_kinds() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['indicator', 'measure', 'risk', 'opportunity', /* B36 (0094 §S2) */ 'capability', 'execution', 'outcome', 'quality'] $$;
GRANT EXECUTE ON FUNCTION executive.health_input_kinds() TO eye_app, eye_commit;

-- THE POLICY WINDOW of the anti-gaming measure: a parameter of the DEFINITION (the column), taken from the model's optional key
-- owner_edit_window_days at proposal (7 days when the model is silent) — so two people approve it with the rest of the model.
ALTER TABLE executive.health_score_definitions ADD COLUMN owner_edit_window_days numeric NOT NULL DEFAULT 7 CHECK (owner_edit_window_days > 0 AND owner_edit_window_days <= 366);
CREATE OR REPLACE FUNCTION executive.health_definition_window() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF jsonb_typeof(NEW.model -> 'owner_edit_window_days') = 'number' THEN NEW.owner_edit_window_days := (NEW.model ->> 'owner_edit_window_days')::numeric; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER xhsd_window BEFORE INSERT ON executive.health_score_definitions FOR EACH ROW EXECUTE FUNCTION executive.health_definition_window();
-- executive.validate_health_model re-declared (0089 lines 3568–3673, whole; ONE change: the optional top-level key owner_edit_window_days admitted and bounded (0, 366])
CREATE OR REPLACE FUNCTION executive.validate_health_model(p_model jsonb) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path = executive, pg_catalog, pg_temp AS $$
DECLARE d jsonb; c jsonb; b jsonb; k text; v_prev numeric; v_last numeric; v_sum numeric; v_dims text[] := '{}'; v_comps text[] := '{}'; v_inputs text[] := '{}';
        v_bkeys text[]; v_key text; v_n int; v_w numeric; v_worst numeric; v_best numeric;
BEGIN
  IF p_model IS NULL OR jsonb_typeof(p_model) <> 'object' THEN RAISE EXCEPTION 'health definition rejected: the model is an object {dimensions, components, min_coverage, change_points, min_confidence?}' USING ERRCODE = '22023'; END IF;
  FOR k IN SELECT jsonb_object_keys(p_model) LOOP
    IF k NOT IN ('dimensions', 'components', 'min_coverage', 'min_confidence', 'change_points', /* B36 (0094 §S1) */ 'owner_edit_window_days') THEN RAISE EXCEPTION 'health definition rejected: unknown key % (the model carries dimensions, components, min_coverage, change_points and optionally min_confidence and owner_edit_window_days)', k USING ERRCODE = '22023'; END IF;
  END LOOP;
  /* B36 (0094 §S1): the anti-gaming policy window, when the model states it */
  IF p_model ? 'owner_edit_window_days' AND (jsonb_typeof(p_model -> 'owner_edit_window_days') <> 'number' OR (p_model ->> 'owner_edit_window_days')::numeric <= 0 OR (p_model ->> 'owner_edit_window_days')::numeric > 366) THEN
    RAISE EXCEPTION 'health definition rejected: owner_edit_window_days is a number of days in (0, 366] — the window before a favourable change inside which an owner edit is flagged' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_model -> 'min_coverage') IS DISTINCT FROM 'number' OR (p_model ->> 'min_coverage')::numeric <= 0 OR (p_model ->> 'min_coverage')::numeric > 1 THEN
    RAISE EXCEPTION 'health definition rejected: min_coverage is a number in (0, 1] — the included weight below which a dimension is indeterminate' USING ERRCODE = '22023';
  END IF;
  IF p_model ? 'min_confidence' AND jsonb_typeof(p_model -> 'min_confidence') <> 'null'
     AND (jsonb_typeof(p_model -> 'min_confidence') <> 'number' OR (p_model ->> 'min_confidence')::numeric < 0 OR (p_model ->> 'min_confidence')::numeric > 1) THEN
    RAISE EXCEPTION 'health definition rejected: min_confidence is a number in [0, 1] or null' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_model -> 'change_points') IS DISTINCT FROM 'number' OR (p_model ->> 'change_points')::numeric <= 0 OR (p_model ->> 'change_points')::numeric > 100 THEN
    RAISE EXCEPTION 'health definition rejected: change_points is a number in (0, 100] — the move that raises a score change' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_model -> 'dimensions') IS DISTINCT FROM 'array' OR jsonb_array_length(p_model -> 'dimensions') NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'health definition rejected: dimensions is a list of 1 to 12 dimensions' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_model -> 'components') IS DISTINCT FROM 'array' OR jsonb_array_length(p_model -> 'components') NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'health definition rejected: components is a list of 1 to 60 components' USING ERRCODE = '22023';
  END IF;
  v_sum := 0;
  FOR d IN SELECT value FROM jsonb_array_elements(p_model -> 'dimensions') LOOP
    IF jsonb_typeof(d) <> 'object' THEN RAISE EXCEPTION 'health definition rejected: a dimension is an object {key, label, weight, objective_ids, bands}' USING ERRCODE = '22023'; END IF;
    FOR k IN SELECT jsonb_object_keys(d) LOOP
      IF k NOT IN ('key', 'label', 'weight', 'objective_ids', 'bands') THEN RAISE EXCEPTION 'health definition rejected: dimension % carries the unknown key %', coalesce(d ->> 'key', '?'), k USING ERRCODE = '22023'; END IF;
    END LOOP;
    v_key := d ->> 'key';
    IF jsonb_typeof(d -> 'key') IS DISTINCT FROM 'string' OR v_key !~ '^[a-z][a-z0-9_]{1,62}$' THEN RAISE EXCEPTION 'health definition rejected: a dimension key is lower_snake_case (2–63 characters)' USING ERRCODE = '22023'; END IF;
    IF v_key = ANY (v_dims) THEN RAISE EXCEPTION 'health definition rejected: dimension % is declared twice', v_key USING ERRCODE = '22023'; END IF;
    v_dims := v_dims || v_key;
    IF jsonb_typeof(d -> 'label') IS DISTINCT FROM 'string' OR length(btrim(d ->> 'label')) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'health definition rejected: dimension % label is 2–120 characters', v_key USING ERRCODE = '22023'; END IF;
    IF jsonb_typeof(d -> 'weight') IS DISTINCT FROM 'number' OR (d ->> 'weight')::numeric <= 0 OR (d ->> 'weight')::numeric > 1 THEN RAISE EXCEPTION 'health definition rejected: dimension % weight is a number in (0, 1]', v_key USING ERRCODE = '22023'; END IF;
    v_sum := v_sum + (d ->> 'weight')::numeric;
    IF jsonb_typeof(d -> 'objective_ids') IS DISTINCT FROM 'array' OR jsonb_array_length(d -> 'objective_ids') = 0
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(d -> 'objective_ids') o WHERE jsonb_typeof(o) <> 'string' OR (o #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
      RAISE EXCEPTION 'health definition rejected: dimension % objective_ids is a non-empty list of objective ids (every roll-up decomposes to objectives — V03-T-186)', v_key USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(d -> 'bands') IS DISTINCT FROM 'array' OR jsonb_array_length(d -> 'bands') NOT BETWEEN 1 AND 6 THEN RAISE EXCEPTION 'health definition rejected: dimension % bands is a list of 1 to 6 {key, min}, highest first, the last at 0', v_key USING ERRCODE = '22023'; END IF;
    v_prev := NULL; v_bkeys := '{}';
    FOR b IN SELECT value FROM jsonb_array_elements(d -> 'bands') LOOP
      IF jsonb_typeof(b) <> 'object' OR jsonb_typeof(b -> 'key') IS DISTINCT FROM 'string' OR (b ->> 'key') !~ '^[a-z][a-z0-9_]{1,30}$' OR jsonb_typeof(b -> 'min') IS DISTINCT FROM 'number'
         OR (SELECT count(*) FROM jsonb_object_keys(b)) <> 2 THEN
        RAISE EXCEPTION 'health definition rejected: dimension % band is {key, min} (a lower_snake_case key, a number)', v_key USING ERRCODE = '22023';
      END IF;
      IF (b ->> 'key') = ANY (v_bkeys) THEN RAISE EXCEPTION 'health definition rejected: dimension % band % is declared twice', v_key, b ->> 'key' USING ERRCODE = '22023'; END IF;
      v_bkeys := v_bkeys || (b ->> 'key');
      IF (b ->> 'min')::numeric < 0 OR (b ->> 'min')::numeric > 100 OR (v_prev IS NOT NULL AND (b ->> 'min')::numeric >= v_prev) THEN
        RAISE EXCEPTION 'health definition rejected: dimension % bands descend strictly in [0, 100] (highest first)', v_key USING ERRCODE = '22023';
      END IF;
      v_prev := (b ->> 'min')::numeric;
    END LOOP;
    IF v_prev <> 0 THEN RAISE EXCEPTION 'health definition rejected: dimension % last band starts at 0 (every value falls in a band)', v_key USING ERRCODE = '22023'; END IF;
  END LOOP;
  IF abs(v_sum - 1) > 0.0001 THEN RAISE EXCEPTION 'health definition rejected: the dimension weights sum to % — they sum to 1', v_sum USING ERRCODE = '22023'; END IF;
  FOR c IN SELECT value FROM jsonb_array_elements(p_model -> 'components') LOOP
    IF jsonb_typeof(c) <> 'object' THEN RAISE EXCEPTION 'health definition rejected: a component is an object' USING ERRCODE = '22023'; END IF;
    FOR k IN SELECT jsonb_object_keys(c) LOOP
      IF k NOT IN ('key', 'label', 'dimension', 'input_kind', 'input_id', 'weight', 'direction', 'normalisation', 'stale_after_days', 'critical', 'critical_below') THEN
        RAISE EXCEPTION 'health definition rejected: component % carries the unknown key %', coalesce(c ->> 'key', '?'), k USING ERRCODE = '22023';
      END IF;
    END LOOP;
    v_key := c ->> 'key';
    IF jsonb_typeof(c -> 'key') IS DISTINCT FROM 'string' OR v_key !~ '^[a-z][a-z0-9_]{1,62}$' THEN RAISE EXCEPTION 'health definition rejected: a component key is lower_snake_case (2–63 characters)' USING ERRCODE = '22023'; END IF;
    IF v_key = ANY (v_comps) THEN RAISE EXCEPTION 'health definition rejected: component % is declared twice', v_key USING ERRCODE = '22023'; END IF;
    v_comps := v_comps || v_key;
    IF jsonb_typeof(c -> 'label') IS DISTINCT FROM 'string' OR length(btrim(c ->> 'label')) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'health definition rejected: component % label is 2–120 characters', v_key USING ERRCODE = '22023'; END IF;
    IF jsonb_typeof(c -> 'dimension') IS DISTINCT FROM 'string' OR NOT ((c ->> 'dimension') = ANY (v_dims)) THEN RAISE EXCEPTION 'health definition rejected: component % names the dimension %, which the model does not declare', v_key, coalesce(c ->> 'dimension', 'none') USING ERRCODE = '22023'; END IF;
    IF jsonb_typeof(c -> 'input_kind') IS DISTINCT FROM 'string' OR NOT ((c ->> 'input_kind') = ANY (executive.health_input_kinds())) THEN
      RAISE EXCEPTION 'health definition rejected: component % input_kind is one of % (the contract''s kinds)', v_key, array_to_string(executive.health_input_kinds(), ', ') USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(c -> 'input_id') IS DISTINCT FROM 'string' OR (c ->> 'input_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'health definition rejected: component % input_id is the id of the contract input it reads', v_key USING ERRCODE = '22023'; END IF;
    IF (c ->> 'input_kind') || ':' || lower(c ->> 'input_id') = ANY (v_inputs) THEN
      RAISE EXCEPTION 'health definition rejected: component % reads % %, which another component already reads (one component per input — no double counting)', v_key, c ->> 'input_kind', c ->> 'input_id' USING ERRCODE = '22023';
    END IF;
    v_inputs := v_inputs || ((c ->> 'input_kind') || ':' || lower(c ->> 'input_id'));
    IF jsonb_typeof(c -> 'weight') IS DISTINCT FROM 'number' OR (c ->> 'weight')::numeric <= 0 OR (c ->> 'weight')::numeric > 1 THEN RAISE EXCEPTION 'health definition rejected: component % weight is a number in (0, 1]', v_key USING ERRCODE = '22023'; END IF;
    IF coalesce(c ->> 'direction', '') NOT IN ('higher_better', 'lower_better') THEN RAISE EXCEPTION 'health definition rejected: component % direction is higher_better or lower_better', v_key USING ERRCODE = '22023'; END IF;
    IF jsonb_typeof(c -> 'normalisation') IS DISTINCT FROM 'object' OR jsonb_typeof(c #> '{normalisation,worst}') IS DISTINCT FROM 'number' OR jsonb_typeof(c #> '{normalisation,best}') IS DISTINCT FROM 'number'
       OR (SELECT count(*) FROM jsonb_object_keys(c -> 'normalisation')) <> 2 THEN
      RAISE EXCEPTION 'health definition rejected: component % normalisation is {worst, best} — the input values scored 0 and 100', v_key USING ERRCODE = '22023';
    END IF;
    v_worst := (c #>> '{normalisation,worst}')::numeric; v_best := (c #>> '{normalisation,best}')::numeric;
    IF (c ->> 'direction' = 'higher_better' AND v_best <= v_worst) OR (c ->> 'direction' = 'lower_better' AND v_best >= v_worst) THEN
      RAISE EXCEPTION 'health definition rejected: component % normalisation contradicts its direction % (best % against worst %)', v_key, c ->> 'direction', v_best, v_worst USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(c -> 'stale_after_days') IS DISTINCT FROM 'number' OR (c ->> 'stale_after_days')::numeric <= 0 OR (c ->> 'stale_after_days')::numeric > 3650 THEN
      RAISE EXCEPTION 'health definition rejected: component % stale_after_days is a number in (0, 3650] — an input older is stale, excluded and declared', v_key USING ERRCODE = '22023';
    END IF;
    IF c ? 'critical' AND jsonb_typeof(c -> 'critical') <> 'boolean' THEN RAISE EXCEPTION 'health definition rejected: component % critical is a boolean', v_key USING ERRCODE = '22023'; END IF;
    IF c ? 'critical_below' AND jsonb_typeof(c -> 'critical_below') <> 'null' THEN
      IF NOT coalesce((c ->> 'critical')::boolean, false) THEN RAISE EXCEPTION 'health definition rejected: component % critical_below applies to a critical component only', v_key USING ERRCODE = '22023'; END IF;
      IF jsonb_typeof(c -> 'critical_below') <> 'number' OR (c ->> 'critical_below')::numeric < 0 OR (c ->> 'critical_below')::numeric > 100 THEN RAISE EXCEPTION 'health definition rejected: component % critical_below is a normalised value in [0, 100]', v_key USING ERRCODE = '22023'; END IF;
    END IF;
  END LOOP;
  FOR v_key IN SELECT unnest(v_dims) LOOP
    SELECT count(*), coalesce(sum((c2 ->> 'weight')::numeric), 0) INTO v_n, v_w FROM jsonb_array_elements(p_model -> 'components') c2 WHERE c2 ->> 'dimension' = v_key;
    IF v_n = 0 THEN RAISE EXCEPTION 'health definition rejected: dimension % has no component (a dimension decomposes into its measures)', v_key USING ERRCODE = '22023'; END IF;
    IF abs(v_w - 1) > 0.0001 THEN RAISE EXCEPTION 'health definition rejected: the component weights of dimension % sum to % — they sum to 1', v_key, v_w USING ERRCODE = '22023'; END IF;
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION executive.validate_health_model(jsonb) TO eye_app, eye_commit;

-- THE FLAG on a score change (declared here because §S1's owner_edit_analysis reads it; set by §S5's computation at INSERT, never after):
-- whether an owner edit inside the policy window preceded this favourable change, and which edits.
ALTER TABLE executive.health_score_changes
  ADD COLUMN owner_edit_flag boolean NOT NULL DEFAULT false,
  ADD COLUMN owner_edit_ids  uuid[]  NOT NULL DEFAULT '{}';

-- THE REGISTER: one row per component of a definition — the input's OWNER and the value the score last read or the owner last stated.
-- Refreshed by the computation (the owner re-derived, the value as read) and by the owner's own correction; never edited by hand.
CREATE TABLE executive.health_inputs (
  input_id            uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  definition_id       uuid NOT NULL REFERENCES executive.health_score_definitions (definition_id),
  component_key       text NOT NULL,
  input_kind          text NOT NULL,
  input_ref           uuid NOT NULL,
  /* the OWNER of the measured input, derived from the input's own object (NULL when it has no active human owner) and how */
  owner_principal_id  uuid,
  owner_basis         text NOT NULL,
  value               numeric,
  unit                text,
  as_of               timestamptz,
  digest              text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  /* whether the current value is the OWNER's statement (set_health_input) rather than the contract's reading */
  owner_stated        boolean NOT NULL DEFAULT false,
  edits               int NOT NULL DEFAULT 0,
  last_edit_id        uuid,
  refreshed_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT xhi_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xhi_kind CHECK (input_kind = ANY (executive.health_input_kinds())),
  CONSTRAINT xhi_component_once UNIQUE (definition_id, component_key)
);
CREATE INDEX xhi_owner ON executive.health_inputs (tenant_id, domain_id, owner_principal_id);
COMMENT ON TABLE executive.health_inputs IS 'B36 (0094 §S1; F-P6-08 (f)): the health input CONTRACT with owners — per component of a definition the input it reads, its OWNER (derived from the input''s own object, never assigned by hand), the value last read or last stated by the owner, its as-of and digest, the edit count and the last edit.';

-- THE EDIT HISTORY (append-only): who restated which input, from what to what, when and why.
CREATE TABLE executive.health_input_edits (
  edit_id            uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  input_id           uuid NOT NULL REFERENCES executive.health_inputs (input_id),
  definition_id      uuid NOT NULL,
  component_key      text NOT NULL,
  input_kind         text NOT NULL,
  input_ref          uuid NOT NULL,
  editor_principal_id uuid NOT NULL,
  from_value         numeric,
  to_value           numeric NOT NULL,
  reason             text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  edited_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT xhie_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX xhie_input ON executive.health_input_edits (input_id, edited_at DESC);
CREATE INDEX xhie_editor ON executive.health_input_edits (tenant_id, domain_id, editor_principal_id, edited_at DESC);
CREATE TRIGGER xhie_append_only BEFORE UPDATE OR DELETE ON executive.health_input_edits FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- WHO OWNS AN INPUT: the measure's MSR object owner, the indicator's owner, the exposure's owner, the objective's owner for the four
-- computed classes (capability, execution, outcome, quality read an OBJECTIVE) — an active human, or nobody (stated).
CREATE OR REPLACE FUNCTION executive.health_input_owner(p_tenant uuid, p_domain uuid, p_kind text, p_ref uuid)
RETURNS TABLE (owner_principal_id uuid, owner_basis text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = executive, graph, prediction, decision, pg_catalog, pg_temp AS $$
  WITH cand AS (
    SELECT s.owner_principal_id AS o, format('the owner of %s "%s"', s.object_type, s.title) AS basis
      FROM graph.strategy_current s WHERE p_kind IN ('measure', 'capability', 'execution', 'outcome', 'quality') AND s.strategy_object_id = p_ref AND s.tenant_id = p_tenant AND s.domain_id = p_domain
    UNION ALL
    SELECT i.owner_principal_id, format('the owner of indicator %s', i.indicator_id)
      FROM prediction.indicators_current i WHERE p_kind = 'indicator' AND i.indicator_id = p_ref AND i.tenant_id = p_tenant AND i.domain_id = p_domain
    UNION ALL
    SELECT x.owner_principal_id, format('the owner of the %s exposure %s', x.polarity, x.exposure_id)
      FROM prediction.exposure_current x WHERE p_kind IN ('risk', 'opportunity') AND x.exposure_id = p_ref AND x.tenant_id = p_tenant AND x.domain_id = p_domain
  )
  SELECT CASE WHEN decision.is_active_human(c.o, p_tenant) THEN c.o END,
         CASE WHEN decision.is_active_human(c.o, p_tenant) THEN c.basis ELSE c.basis || ' — not an active human; no owner edit is admitted until one is assigned' END
    FROM cand c LIMIT 1;
$$;
REVOKE ALL ON FUNCTION executive.health_input_owner(uuid, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.health_input_owner(uuid, uuid, text, uuid) TO eye_app, eye_commit;

-- The register row of a component, made or refreshed (the owner re-derived; the value as given); answers the row.
CREATE OR REPLACE FUNCTION executive.health_input_upsert(p_tenant uuid, p_domain uuid, p_definition uuid, p_component text, p_kind text, p_ref uuid,
                                                          p_value numeric, p_unit text, p_as_of timestamptz, p_owner_stated boolean, p_edit uuid, p_correlation uuid)
RETURNS executive.health_inputs
SECURITY DEFINER SET search_path = executive, pg_catalog, pg_temp AS $$
DECLARE r executive.health_inputs%ROWTYPE; o record; v_digest text;
BEGIN
  SELECT * INTO o FROM executive.health_input_owner(p_tenant, p_domain, p_kind, p_ref);
  v_digest := encode(sha256(convert_to(concat_ws('|', p_kind, p_ref::text, coalesce(p_value::text, ''), coalesce(p_as_of::text, ''), coalesce(o.owner_principal_id::text, '')), 'UTF8')), 'hex');
  INSERT INTO executive.health_inputs (input_id, scope, tenant_id, domain_id, definition_id, component_key, input_kind, input_ref, owner_principal_id, owner_basis, value, unit, as_of, digest,
                                       owner_stated, edits, last_edit_id, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_definition, p_component, p_kind, p_ref, o.owner_principal_id, coalesce(o.owner_basis, 'no such input object in this domain'),
          p_value, p_unit, p_as_of, v_digest, p_owner_stated, CASE WHEN p_edit IS NULL THEN 0 ELSE 1 END, p_edit, p_correlation)
  ON CONFLICT (definition_id, component_key) DO UPDATE
     SET owner_principal_id = EXCLUDED.owner_principal_id, owner_basis = EXCLUDED.owner_basis, value = EXCLUDED.value, unit = coalesce(EXCLUDED.unit, executive.health_inputs.unit),
         as_of = EXCLUDED.as_of, digest = EXCLUDED.digest, owner_stated = EXCLUDED.owner_stated,
         edits = executive.health_inputs.edits + CASE WHEN p_edit IS NULL THEN 0 ELSE 1 END, last_edit_id = coalesce(p_edit, executive.health_inputs.last_edit_id),
         refreshed_at = clock_timestamp(), correlation_id = EXCLUDED.correlation_id
  RETURNING * INTO r;
  RETURN r;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.health_input_upsert(uuid,uuid,uuid,text,text,uuid,numeric,text,timestamptz,boolean,uuid,uuid) FROM PUBLIC;

-- THE OWNER-CORRECTION ROUTE: the input's OWNER restates its reading with a reason; the edit is ledgered; the score reads the statement
-- from its as-of on (the contract row it supersedes stays in the snapshot's inputs beside it). Anyone else is refused (ownership).
CREATE OR REPLACE FUNCTION executive.set_health_input(p_edit_id uuid, p_tenant uuid, p_domain uuid, p_component text, p_value numeric, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, graph, prediction, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE d executive.health_score_definitions%ROWTYPE; c jsonb; o record; cur executive.health_inputs%ROWTYPE; r executive.health_inputs%ROWTYPE; v_from numeric; v_unit text; v_now timestamptz := clock_timestamp(); i record;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.health.input.set']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'health input rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(p_reason) > 2000 THEN RAISE EXCEPTION 'health input rejected (reason): a reason of 8 to 2000 characters says why the reading is restated' USING ERRCODE = '22023'; END IF;
  IF p_value IS NULL OR p_value <> p_value OR abs(p_value) > 1e12 THEN RAISE EXCEPTION 'health input rejected (value): a finite number' USING ERRCODE = '22023'; END IF;
  SELECT * INTO d FROM executive.health_score_definitions x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'health input rejected (no_definition): no approved definition is active in this domain; an input belongs to a component of the active definition' USING ERRCODE = '22023'; END IF;
  SELECT x INTO c FROM jsonb_array_elements(d.model -> 'components') x WHERE x ->> 'key' = p_component;
  IF c IS NULL THEN RAISE EXCEPTION 'health input rejected (unknown_component): the active definition (version %) has no component %', d.version, coalesce(p_component, '<none>') USING ERRCODE = '23503'; END IF;
  SELECT * INTO o FROM executive.health_input_owner(p_tenant, p_domain, c ->> 'input_kind', (c ->> 'input_id')::uuid);
  IF o.owner_principal_id IS NULL OR o.owner_principal_id <> p_actor THEN
    RAISE EXCEPTION 'health input rejected (ownership): component % is restated by the owner of its input only (%); principal % is not', p_component, coalesce(o.owner_basis, 'no such input object in this domain'), p_actor USING ERRCODE = '42501';
  END IF;
  SELECT * INTO cur FROM executive.health_inputs x WHERE x.definition_id = d.definition_id AND x.component_key = p_component FOR UPDATE;
  IF FOUND THEN v_from := cur.value; v_unit := cur.unit;
  ELSE
    -- the contract's own reading at now, when it has one: what the statement moves FROM
    SELECT x.value, x.unit INTO v_from, v_unit FROM executive.health_measure_inputs(p_tenant, p_domain, v_now) x
     WHERE x.input_kind = c ->> 'input_kind' AND x.input_id = (c ->> 'input_id')::uuid ORDER BY x.observed_at DESC NULLS LAST LIMIT 1;
  END IF;
  r := executive.health_input_upsert(p_tenant, p_domain, d.definition_id, p_component, c ->> 'input_kind', (c ->> 'input_id')::uuid, p_value, v_unit, v_now, true, p_edit_id, p_correlation);
  INSERT INTO executive.health_input_edits (edit_id, scope, tenant_id, domain_id, input_id, definition_id, component_key, input_kind, input_ref, editor_principal_id, from_value, to_value, reason, edited_at, correlation_id)
  VALUES (p_edit_id, 'DOMAIN', p_tenant, p_domain, r.input_id, d.definition_id, p_component, c ->> 'input_kind', (c ->> 'input_id')::uuid, p_actor, v_from, p_value, btrim(p_reason), v_now, p_correlation);
  RETURN jsonb_build_object('edit_id', p_edit_id, 'input_id', r.input_id, 'definition_id', d.definition_id, 'definition_version', d.version, 'component_key', p_component,
                            'input_kind', c ->> 'input_kind', 'input_ref', c ->> 'input_id', 'owner', p_actor, 'owner_basis', o.owner_basis, 'from_value', v_from, 'to_value', p_value,
                            'unit', v_unit, 'as_of', v_now, 'digest', r.digest, 'edits', r.edits, 'reason', btrim(p_reason),
                            'window_days', d.owner_edit_window_days, 'what_follows', 'the score reads this statement from its as-of on; an edit inside the window before a favourable change is flagged on that change and counted against its owner');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.set_health_input(uuid,uuid,uuid,text,numeric,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.set_health_input(uuid,uuid,uuid,text,numeric,text,uuid,uuid) TO eye_commit;

-- THE ANTI-GAMING MEASURE, per owner (a read under the caller's RLS): the edits, the ones flagged on a favourable change, the components
-- and inputs touched, the last edit — for the definition named or the active one.
CREATE OR REPLACE FUNCTION executive.owner_edit_analysis(p_tenant uuid, p_domain uuid, p_definition uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = executive, pg_catalog, pg_temp AS $$
  WITH d AS (
    SELECT x.definition_id, x.version, x.owner_edit_window_days FROM executive.health_score_definitions x
     WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND ((p_definition IS NOT NULL AND x.definition_id = p_definition) OR (p_definition IS NULL AND x.state = 'active'))
  ), flagged AS (
    SELECT DISTINCT unnest(c.owner_edit_ids) AS edit_id, c.change_id, c.subject FROM executive.health_score_changes c JOIN d ON d.definition_id = c.definition_id WHERE c.owner_edit_flag
  ), per_owner AS (
    SELECT e.editor_principal_id AS owner, count(DISTINCT e.edit_id)::int AS edits, count(DISTINCT f.edit_id)::int AS flagged_edits,
           array_agg(DISTINCT e.component_key ORDER BY e.component_key) AS components,
           max(e.edited_at) AS last_edit_at,
           coalesce(jsonb_agg(DISTINCT jsonb_build_object('edit_id', e.edit_id, 'component_key', e.component_key, 'change_id', f.change_id, 'subject', f.subject)) FILTER (WHERE f.edit_id IS NOT NULL), '[]'::jsonb) AS flags
      FROM executive.health_input_edits e JOIN d ON d.definition_id = e.definition_id LEFT JOIN flagged f ON f.edit_id = e.edit_id
     GROUP BY e.editor_principal_id
  )
  SELECT jsonb_build_object(
    'definition_id', (SELECT definition_id FROM d), 'definition_version', (SELECT version FROM d), 'window_days', (SELECT owner_edit_window_days FROM d),
    'rule', 'an owner edit whose as-of lies inside the window before a current snapshot that moved the component''s dimension (or the aggregate) favourably is flagged on that change; the flags are shown and gate nothing; a flagged edit on a measure input raises the gamed_measure detection',
    'owners', coalesce((SELECT jsonb_agg(jsonb_build_object('owner', o.owner, 'edits', o.edits, 'flagged_edits', o.flagged_edits, 'components', to_jsonb(o.components), 'last_edit_at', o.last_edit_at, 'flags', o.flags) ORDER BY o.flagged_edits DESC, o.edits DESC) FROM per_owner o), '[]'::jsonb),
    'totals', jsonb_build_object('edits', coalesce((SELECT sum(edits) FROM per_owner), 0), 'flagged_edits', coalesce((SELECT sum(flagged_edits) FROM per_owner), 0)));
$$;
GRANT EXECUTE ON FUNCTION executive.owner_edit_analysis(uuid, uuid, uuid) TO eye_app, eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §S2 FOUR MORE SCORE INPUTS — capability, execution, outcome, quality (each EXACTLY executive.health_measure_inputs' RETURNS TABLE)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- CAPABILITY: per active objective with at least one active `supports` alignment (declared at or before the instant) to an active
-- capability — the share of those capabilities an active initiative BUILDS (an active `builds` alignment); observed at the latest of
-- the alignments read. The input_id is the OBJECTIVE. No cadence, no confidence input (stated).
CREATE OR REPLACE FUNCTION executive.health_capability_inputs(p_tenant uuid, p_domain uuid, p_at timestamptz)
RETURNS TABLE (input_kind text, input_id uuid, input_version bigint, label text, value numeric, unit text, direction text, observed_at timestamptz,
               expected_every_days numeric, confidence numeric, evidence jsonb, objective_ids uuid[], exposure jsonb, basis text)
LANGUAGE sql STABLE AS $$
  WITH caps AS (
    SELECT o.strategy_object_id AS objective_id, o.title, c.strategy_object_id AS capability_id, a.declared_at,
           EXISTS (SELECT 1 FROM graph.alignments b JOIN graph.strategy_current i ON i.strategy_object_id = b.from_id AND i.status = 'active'
                    WHERE b.kind = 'builds' AND b.to_id = c.strategy_object_id AND b.state = 'active' AND b.declared_at <= p_at AND b.tenant_id = p_tenant AND b.domain_id = p_domain) AS built
      FROM graph.strategy_current o
      JOIN graph.alignments a ON a.kind = 'supports' AND a.from_id = o.strategy_object_id AND a.state = 'active' AND a.declared_at <= p_at AND a.tenant_id = p_tenant AND a.domain_id = p_domain
      JOIN graph.strategy_current c ON c.strategy_object_id = a.to_id AND c.status = 'active'
     WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.object_type = 'OBJ' AND o.status = 'active'
  )
  SELECT 'capability'::text, x.objective_id, NULL::bigint, format('capability coverage of "%s"', x.title), round(100.0 * count(*) FILTER (WHERE x.built) / count(*), 2), 'percent'::text, 'higher_better'::text,
         max(x.declared_at), NULL::numeric, NULL::numeric, '[]'::jsonb, ARRAY[x.objective_id], NULL::jsonb,
         format('%s of %s supporting capabilit%s built by an active initiative at %s (active supports and builds alignments declared at or before the instant); no cadence, no confidence input',
                count(*) FILTER (WHERE x.built), count(*), CASE WHEN count(*) = 1 THEN 'y' ELSE 'ies' END, p_at)
    FROM caps x GROUP BY x.objective_id, x.title;
$$;
REVOKE ALL ON FUNCTION executive.health_capability_inputs(uuid, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.health_capability_inputs(uuid, uuid, timestamptz) TO eye_app, eye_commit;

-- EXECUTION: per active objective with commitment items resting on it that were DUE at or before the instant (waived and cancelled
-- items set aside) — the share delivered (done) by the instant; observed at the latest due instant read.
CREATE OR REPLACE FUNCTION executive.health_execution_inputs(p_tenant uuid, p_domain uuid, p_at timestamptz)
RETURNS TABLE (input_kind text, input_id uuid, input_version bigint, label text, value numeric, unit text, direction text, observed_at timestamptz,
               expected_every_days numeric, confidence numeric, evidence jsonb, objective_ids uuid[], exposure jsonb, basis text)
LANGUAGE sql STABLE AS $$
  WITH due AS (
    SELECT o.strategy_object_id AS objective_id, o.title, i.item_id, i.due_at, (i.state = 'done' AND i.updated_at <= p_at) AS delivered
      FROM graph.strategy_current o
      JOIN decision.commitment_items i ON o.strategy_object_id = ANY (i.objective_ids) AND i.tenant_id = p_tenant AND i.domain_id = p_domain
     WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.object_type = 'OBJ' AND o.status = 'active'
       AND i.due_at <= p_at AND i.created_at <= p_at AND i.state NOT IN ('waived', 'cancelled')
  )
  SELECT 'execution'::text, x.objective_id, NULL::bigint, format('commitments of "%s" delivered on time', x.title), round(100.0 * count(*) FILTER (WHERE x.delivered) / count(*), 2), 'percent'::text, 'higher_better'::text,
         max(x.due_at), NULL::numeric, NULL::numeric, '[]'::jsonb, ARRAY[x.objective_id], NULL::jsonb,
         format('%s of %s commitment item(s) due at or before %s were done by then (decision.commitment_items resting on the objective; waived and cancelled items set aside); no cadence, no confidence input',
                count(*) FILTER (WHERE x.delivered), count(*), p_at)
    FROM due x GROUP BY x.objective_id, x.title;
$$;
REVOKE ALL ON FUNCTION executive.health_execution_inputs(uuid, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.health_execution_inputs(uuid, uuid, timestamptz) TO eye_app, eye_commit;

-- OUTCOME: per active objective — the outcomes RECORDED (decision.outcomes, at or before the instant) on the packages whose decision
-- rests on it (graph.dependencies DEC → strategy, active): the share met; observed at the latest recording read.
CREATE OR REPLACE FUNCTION executive.health_outcome_inputs(p_tenant uuid, p_domain uuid, p_at timestamptz)
RETURNS TABLE (input_kind text, input_id uuid, input_version bigint, label text, value numeric, unit text, direction text, observed_at timestamptz,
               expected_every_days numeric, confidence numeric, evidence jsonb, objective_ids uuid[], exposure jsonb, basis text)
LANGUAGE sql STABLE AS $$
  WITH rec AS (
    SELECT DISTINCT o.strategy_object_id AS objective_id, o.title, u.outcome_id, u.met, u.recorded_at
      FROM graph.strategy_current o
      JOIN graph.dependencies dep ON dep.depends_on_kind = 'strategy' AND dep.depends_on_id = o.strategy_object_id AND dep.dependent_type = 'DEC' AND dep.state = 'active' AND dep.tenant_id = p_tenant AND dep.domain_id = p_domain
      JOIN decision.packages_current p ON p.decision_object_id = dep.dependent_object_id AND p.tenant_id = p_tenant AND p.domain_id = p_domain
      JOIN decision.outcomes u ON u.package_id = p.package_id AND u.recorded_at <= p_at
     WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.object_type = 'OBJ' AND o.status = 'active'
  )
  SELECT 'outcome'::text, x.objective_id, NULL::bigint, format('outcomes recorded against "%s"', x.title), round(100.0 * count(*) FILTER (WHERE x.met) / count(*), 2), 'percent'::text, 'higher_better'::text,
         max(x.recorded_at), NULL::numeric, NULL::numeric, '[]'::jsonb, ARRAY[x.objective_id], NULL::jsonb,
         format('%s of %s recorded outcome(s) met at or before %s (decision.outcomes of the packages whose decision rests on the objective); no cadence, no confidence input',
                count(*) FILTER (WHERE x.met), count(*), p_at)
    FROM rec x GROUP BY x.objective_id, x.title;
$$;
REVOKE ALL ON FUNCTION executive.health_outcome_inputs(uuid, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.health_outcome_inputs(uuid, uuid, timestamptz) TO eye_app, eye_commit;

-- QUALITY: per active objective with at least one active measure — the share of its measures APPROVED at the instant AND FRESH (the
-- freshness and verification of the score's own inputs); a judgement at the instant, so observed at the instant.
CREATE OR REPLACE FUNCTION executive.health_quality_inputs(p_tenant uuid, p_domain uuid, p_at timestamptz)
RETURNS TABLE (input_kind text, input_id uuid, input_version bigint, label text, value numeric, unit text, direction text, observed_at timestamptz,
               expected_every_days numeric, confidence numeric, evidence jsonb, objective_ids uuid[], exposure jsonb, basis text)
LANGUAGE sql STABLE AS $$
  WITH q AS (
    SELECT o.strategy_object_id AS objective_id, o.title, f.measure_id, (f.approved_now AND f.state = 'fresh') AS sound
      FROM graph.strategy_current o
      JOIN graph.measure_freshness(p_tenant, p_domain, p_at) f ON o.strategy_object_id = ANY (f.objective_ids) AND f.status = 'active'
     WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.object_type = 'OBJ' AND o.status = 'active'
  )
  SELECT 'quality'::text, x.objective_id, NULL::bigint, format('input quality of "%s"', x.title), round(100.0 * count(*) FILTER (WHERE x.sound) / count(*), 2), 'percent'::text, 'higher_better'::text,
         p_at, NULL::numeric, NULL::numeric, '[]'::jsonb, ARRAY[x.objective_id], NULL::jsonb,
         format('%s of %s measure(s) of the objective approved by an unrevoked, unexpired act AND fresh at %s (graph.measure_freshness); a judgement at the instant; no confidence input',
                count(*) FILTER (WHERE x.sound), count(*), p_at)
    FROM q x GROUP BY x.objective_id, x.title;
$$;
REVOKE ALL ON FUNCTION executive.health_quality_inputs(uuid, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.health_quality_inputs(uuid, uuid, timestamptz) TO eye_app, eye_commit;

-- executive.health_measure_inputs re-declared (0089 lines 4494–4514 — the §I union, whole; ONE change: the four branches unioned in)
CREATE OR REPLACE FUNCTION executive.health_measure_inputs(p_tenant uuid, p_domain uuid, p_at timestamptz)
RETURNS TABLE (input_kind text, input_id uuid, input_version bigint, label text, value numeric, unit text, direction text, observed_at timestamptz,
               expected_every_days numeric, confidence numeric, evidence jsonb, objective_ids uuid[], exposure jsonb, basis text)
LANGUAGE sql STABLE AS $$
  SELECT 'indicator'::text, i.indicator_id, NULL::bigint, i.description, ev.value, NULL::text,
         CASE WHEN i.comparator IN ('<', '<=') THEN 'higher_better' ELSE 'lower_better' END,
         ev.observation_at::timestamptz, NULL::numeric, NULL::numeric,
         CASE WHEN ev.evidence_object_id IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('object_id', ev.evidence_object_id, 'version', ev.evidence_version)) END,
         '{}'::uuid[], NULL::jsonb,
         format('indicator %s on series %s, its latest evaluation at or before the instant (no cadence declared on the indicator; no confidence input)', i.indicator_id, i.series_key)
    FROM prediction.indicators_current i
    LEFT JOIN LATERAL (SELECT e.value, e.observation_at, e.evidence_object_id, e.evidence_version FROM prediction.indicator_evaluations e
                        WHERE e.indicator_id = i.indicator_id AND e.known_at <= p_at ORDER BY e.observation_at DESC, e.known_at DESC LIMIT 1) ev ON true
   WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.state = 'active'
  UNION ALL
  SELECT g.* FROM graph.health_inputs(p_tenant, p_domain, p_at) g
  UNION ALL
  SELECT x.* FROM prediction.health_inputs(p_tenant, p_domain, p_at) x
  /* B36 (0094 §S2): the four further classes */
  UNION ALL SELECT c.* FROM executive.health_capability_inputs(p_tenant, p_domain, p_at) c
  UNION ALL SELECT e.* FROM executive.health_execution_inputs(p_tenant, p_domain, p_at) e
  UNION ALL SELECT o.* FROM executive.health_outcome_inputs(p_tenant, p_domain, p_at) o
  UNION ALL SELECT q.* FROM executive.health_quality_inputs(p_tenant, p_domain, p_at) q;
$$;
REVOKE ALL ON FUNCTION executive.health_measure_inputs(uuid, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.health_measure_inputs(uuid, uuid, timestamptz) TO eye_app, eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §S3 EXCEPTIONS AS RECORDED OBJECTS
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE executive.health_exceptions (
  exception_id             uuid PRIMARY KEY,
  scope                    text NOT NULL,
  tenant_id                uuid NOT NULL,
  domain_id                uuid NOT NULL,
  definition_id            uuid NOT NULL REFERENCES executive.health_score_definitions (definition_id),
  component_key            text NOT NULL,
  kind                     text NOT NULL CHECK (kind IN ('exclude', 'relax_bound')),
  relaxed_stale_after_days numeric CHECK (relaxed_stale_after_days IS NULL OR (relaxed_stale_after_days > 0 AND relaxed_stale_after_days <= 3660)),
  reason                   text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  expires_at               timestamptz NOT NULL,
  state                    text NOT NULL DEFAULT 'requested' CHECK (state IN ('requested', 'approved', 'refused')),
  requested_by             uuid NOT NULL,
  requested_at             timestamptz NOT NULL DEFAULT clock_timestamp(),
  approved_by              uuid,
  approved_at              timestamptz,
  approval_note            text,
  refused_by               uuid,
  refused_at               timestamptz,
  refusal_reason           text,
  correlation_id           uuid NOT NULL,
  CONSTRAINT xhx_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xhx_kind CHECK ((kind = 'relax_bound') = (relaxed_stale_after_days IS NOT NULL)),
  CONSTRAINT xhx_expiry CHECK (expires_at > requested_at),
  CONSTRAINT xhx_approved CHECK ((state = 'approved') = (approved_by IS NOT NULL AND approved_at IS NOT NULL AND length(btrim(coalesce(approval_note, ''))) >= 8)),
  CONSTRAINT xhx_refused CHECK ((state = 'refused') = (refused_by IS NOT NULL AND refused_at IS NOT NULL AND length(btrim(coalesce(refusal_reason, ''))) >= 8)),
  -- TWO PEOPLE, in the record itself: the requester never decides their own exception
  CONSTRAINT xhx_separation CHECK ((approved_by IS NULL OR approved_by <> requested_by) AND (refused_by IS NULL OR refused_by <> requested_by))
);
CREATE INDEX xhx_definition ON executive.health_exceptions (definition_id, component_key, state, expires_at);
COMMENT ON TABLE executive.health_exceptions IS 'B36 (0094 §S3; F-P6-08 (g), PR-43-003 "humans approve … exceptions"): a component EXCLUDED from the score or its freshness bound RELAXED for a period — requested by a named human, approved (or refused) by ANOTHER holding the executive''s authority with a note and an expiry; in force from its approval until its expiry; an unapproved or expired exception has no effect.';
-- forward only: requested → approved | refused, once, the decision's own fields; nothing else changes, nothing is deleted
CREATE OR REPLACE FUNCTION executive.health_exception_forward() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_fields text[];
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'health exceptions are never deleted' USING ERRCODE = '55000'; END IF;
  v_fields := CASE WHEN OLD.state = 'requested' AND NEW.state = 'approved' THEN ARRAY['state', 'approved_by', 'approved_at', 'approval_note']
                   WHEN OLD.state = 'requested' AND NEW.state = 'refused' THEN ARRAY['state', 'refused_by', 'refused_at', 'refusal_reason'] END;
  IF v_fields IS NOT NULL AND (to_jsonb(NEW) - v_fields) = (to_jsonb(OLD) - v_fields) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'health exception % is %; an exception is decided once and never rewritten', OLD.exception_id, OLD.state USING ERRCODE = '55000';
END $$;
CREATE TRIGGER xhx_forward BEFORE UPDATE OR DELETE ON executive.health_exceptions FOR EACH ROW EXECUTE FUNCTION executive.health_exception_forward();

CREATE OR REPLACE FUNCTION executive.health_exception_answer(x executive.health_exceptions) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object('exception_id', x.exception_id, 'definition_id', x.definition_id, 'component_key', x.component_key, 'kind', x.kind, 'relaxed_stale_after_days', x.relaxed_stale_after_days,
                            'reason', x.reason, 'expires_at', x.expires_at, 'state', x.state, 'requested_by', x.requested_by, 'requested_at', x.requested_at, 'approved_by', x.approved_by,
                            'approved_at', x.approved_at, 'approval_note', x.approval_note, 'refused_by', x.refused_by, 'refused_at', x.refused_at, 'refusal_reason', x.refusal_reason,
                            'in_force_now', x.state = 'approved' AND x.approved_at <= clock_timestamp() AND x.expires_at > clock_timestamp());
$$;
REVOKE ALL ON FUNCTION executive.health_exception_answer(executive.health_exceptions) FROM PUBLIC;

-- REQUEST: a named human names a component of the ACTIVE definition, the exception's kind, the reason and an expiry (within 366 days).
CREATE OR REPLACE FUNCTION executive.request_health_exception(p_exception_id uuid, p_tenant uuid, p_domain uuid, p_component text, p_kind text, p_relaxed_days numeric, p_reason text, p_expires_at timestamptz, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE d executive.health_score_definitions%ROWTYPE; x executive.health_exceptions%ROWTYPE; v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.health.exception.request']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'health exception rejected (actor): requested by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('exclude', 'relax_bound') THEN RAISE EXCEPTION 'health exception rejected (kind): exclude (the component left out for the period) or relax_bound (its freshness bound relaxed)' USING ERRCODE = '22023'; END IF;
  IF (p_kind = 'relax_bound') <> (p_relaxed_days IS NOT NULL) OR (p_relaxed_days IS NOT NULL AND (p_relaxed_days <= 0 OR p_relaxed_days > 3660)) THEN
    RAISE EXCEPTION 'health exception rejected (bound): relax_bound names the relaxed stale_after_days in (0, 3660]; exclude names none' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(p_reason) > 2000 THEN RAISE EXCEPTION 'health exception rejected (reason): a reason of 8 to 2000 characters says why the component is excepted' USING ERRCODE = '22023'; END IF;
  IF p_expires_at IS NULL OR p_expires_at <= v_now OR p_expires_at > v_now + interval '366 days' THEN RAISE EXCEPTION 'health exception rejected (expiry): an exception expires after now and within 366 days' USING ERRCODE = '22023'; END IF;
  SELECT * INTO d FROM executive.health_score_definitions z WHERE z.tenant_id = p_tenant AND z.domain_id = p_domain AND z.state = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'health exception rejected (no_definition): no approved definition is active in this domain' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(d.model -> 'components') c WHERE c ->> 'key' = p_component) THEN
    RAISE EXCEPTION 'health exception rejected (unknown_component): the active definition (version %) has no component %', d.version, coalesce(p_component, '<none>') USING ERRCODE = '23503';
  END IF;
  IF EXISTS (SELECT 1 FROM executive.health_exceptions z WHERE z.definition_id = d.definition_id AND z.component_key = p_component AND z.kind = p_kind AND z.state = 'requested') THEN
    RAISE EXCEPTION 'health exception rejected (pending): a % exception for component % awaits a decision', p_kind, p_component USING ERRCODE = '22023';
  END IF;
  INSERT INTO executive.health_exceptions (exception_id, scope, tenant_id, domain_id, definition_id, component_key, kind, relaxed_stale_after_days, reason, expires_at, requested_by, requested_at, correlation_id)
  VALUES (p_exception_id, 'DOMAIN', p_tenant, p_domain, d.definition_id, p_component, p_kind, p_relaxed_days, btrim(p_reason), p_expires_at, p_actor, v_now, p_correlation)
  RETURNING * INTO x;
  RETURN executive.health_exception_answer(x) || jsonb_build_object('definition_version', d.version, 'what_follows', 'no effect until a person holding the executive''s authority — never the requester — approves it; in force from the approval until the expiry');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.request_health_exception(uuid,uuid,uuid,text,text,numeric,text,timestamptz,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.request_health_exception(uuid,uuid,uuid,text,text,numeric,text,timestamptz,uuid,uuid) TO eye_commit;

-- APPROVE (or refuse): ANOTHER named human holding the executive's authority (the PDP names the roles; the port refuses the requester).
CREATE OR REPLACE FUNCTION executive.approve_health_exception(p_exception_id uuid, p_tenant uuid, p_domain uuid, p_decision text, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x executive.health_exceptions%ROWTYPE; v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.health.exception.approve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'health exception rejected (actor): decided by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('approve', 'refuse') THEN RAISE EXCEPTION 'health exception rejected (decision): approve or refuse' USING ERRCODE = '22023'; END IF;
  IF p_note IS NULL OR length(btrim(p_note)) < 8 OR length(p_note) > 2000 THEN RAISE EXCEPTION 'health exception rejected (note): a note of 8 to 2000 characters records the decision' USING ERRCODE = '22023'; END IF;
  SELECT * INTO x FROM executive.health_exceptions z WHERE z.exception_id = p_exception_id AND z.tenant_id = p_tenant AND z.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'health exception rejected (unknown_exception): no exception % in this domain', p_exception_id USING ERRCODE = '23503'; END IF;
  IF x.requested_by = p_actor THEN RAISE EXCEPTION 'health exception rejected (separation): the requester does not decide their own exception' USING ERRCODE = '42501'; END IF;
  IF x.state <> 'requested' THEN RAISE EXCEPTION 'health exception rejected (state): exception % is %; only a requested exception is decided', p_exception_id, x.state USING ERRCODE = '22023'; END IF;
  IF x.expires_at <= v_now THEN RAISE EXCEPTION 'health exception rejected (expired): exception % expired at % before it was decided', p_exception_id, x.expires_at USING ERRCODE = '22023'; END IF;
  IF p_decision = 'approve' THEN
    UPDATE executive.health_exceptions SET state = 'approved', approved_by = p_actor, approved_at = v_now, approval_note = btrim(p_note) WHERE exception_id = p_exception_id RETURNING * INTO x;
  ELSE
    UPDATE executive.health_exceptions SET state = 'refused', refused_by = p_actor, refused_at = v_now, refusal_reason = btrim(p_note) WHERE exception_id = p_exception_id RETURNING * INTO x;
  END IF;
  RETURN executive.health_exception_answer(x) || jsonb_build_object('what_follows', CASE p_decision WHEN 'approve' THEN 'in force from now until the expiry: the next computation names it and applies it' ELSE 'no effect; the record kept' END);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.approve_health_exception(uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.approve_health_exception(uuid,uuid,uuid,text,text,uuid,uuid) TO eye_commit;

-- IN FORCE at an instant: approved at or before it and not yet expired (a read; the computation and the preview call it).
CREATE OR REPLACE FUNCTION executive.health_exceptions_in_force(p_tenant uuid, p_domain uuid, p_definition uuid, p_at timestamptz) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = executive, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('exception_id', x.exception_id, 'component_key', x.component_key, 'kind', x.kind, 'relaxed_stale_after_days', x.relaxed_stale_after_days,
                                               'reason', x.reason, 'approved_by', x.approved_by, 'approved_at', x.approved_at, 'expires_at', x.expires_at) ORDER BY x.approved_at), '[]'::jsonb)
    FROM executive.health_exceptions x
   WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.definition_id = p_definition AND x.state = 'approved' AND x.approved_at <= p_at AND x.expires_at > p_at;
$$;
REVOKE ALL ON FUNCTION executive.health_exceptions_in_force(uuid, uuid, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.health_exceptions_in_force(uuid, uuid, uuid, timestamptz) TO eye_app, eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §S4 THE SNAPSHOT APPROVAL — the executive's acceptance of a CURRENT snapshot on its digest, signed beyond the audit chain
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE executive.health_snapshot_approvals (
  approval_id     uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  snapshot_id     uuid NOT NULL REFERENCES executive.health_score_snapshots (snapshot_id),
  result_digest   text NOT NULL CHECK (result_digest ~ '^[0-9a-f]{64}$'),
  note            text NOT NULL CHECK (length(btrim(note)) BETWEEN 8 AND 2000),
  approved_by     uuid NOT NULL,
  approved_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT xhsa_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xhsa_once UNIQUE (snapshot_id, approved_by)
);
CREATE TRIGGER xhsa_append_only BEFORE UPDATE OR DELETE ON executive.health_snapshot_approvals FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE executive.health_snapshot_approvals IS 'B36 (0094 §S4; F-P6-08 (h)): the executive''s ACCEPTANCE of a current health snapshot on the result digest previewed — a recorded object, signed beyond the audit chain (executive.signatures, kind health_snapshot); it accepts the decomposition as the basis for review and authorizes no action.';

-- THE PREVIEW (a read under the caller's RLS): what the approval binds and what follows — the digest, the score, the flagged changes,
-- the owner-stated inputs, the exceptions in force, the approvals and signatures already recorded.
CREATE OR REPLACE FUNCTION executive.preview_health_snapshot_approval(p_snapshot uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = executive, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'snapshot_id', s.snapshot_id, 'kind', s.kind, 'at', s.at, 'definition_version', s.definition_version, 'formula_version', s.formula_version,
    'status', s.status, 'aggregate', s.aggregate, 'coverage', s.coverage, 'result_digest', s.result_digest, 'inputs_digest', s.inputs_digest,
    'acceptable', s.kind = 'current',
    'consequence', CASE WHEN s.kind = 'current'
      THEN 'accepting records the executive''s acceptance of this decomposition — its inputs, exclusions, exceptions and flags as recorded — as the basis for review at this instant; it is signed beyond the audit chain with the tenant''s key; it authorizes no action and rewrites nothing'
      ELSE 'an as_of replay is a temporal check, not a score to accept; only a current snapshot is accepted' END,
    'exceptions_in_force', coalesce(s.result -> 'exceptions', '[]'::jsonb),
    'owner_stated_inputs', coalesce((SELECT jsonb_agg(jsonb_build_object('component_key', c ->> 'key', 'owner', c -> 'owner', 'edit_id', c -> 'owner_edit_id', 'as_of', c -> 'observed_at')) FROM jsonb_array_elements(s.result -> 'components') c WHERE (c ->> 'owner_stated')::boolean), '[]'::jsonb),
    'changes', coalesce((SELECT jsonb_agg(jsonb_build_object('change_id', c.change_id, 'subject', c.subject, 'direction', c.direction, 'from_value', c.from_value, 'to_value', c.to_value, 'owner_edit_flag', c.owner_edit_flag, 'owner_edit_ids', to_jsonb(c.owner_edit_ids), 'gaming_flags', c.gaming_flags) ORDER BY c.subject)
                        FROM executive.health_score_changes c WHERE c.snapshot_id = s.snapshot_id), '[]'::jsonb),
    'approvals', coalesce((SELECT jsonb_agg(jsonb_build_object('approval_id', a.approval_id, 'approved_by', a.approved_by, 'approved_at', a.approved_at, 'note', a.note) ORDER BY a.approved_at) FROM executive.health_snapshot_approvals a WHERE a.snapshot_id = s.snapshot_id), '[]'::jsonb),
    'signatures', executive.signature_of('health_snapshot', s.snapshot_id, 1))
    FROM executive.health_score_snapshots s WHERE s.snapshot_id = p_snapshot;
$$;
GRANT EXECUTE ON FUNCTION executive.preview_health_snapshot_approval(uuid) TO eye_app, eye_commit;

-- APPROVE: the executive (the PDP's roles), on the digest previewed; a current snapshot only; once per person. The signature row is the
-- TypeScript signer's, written through §0's record_signature under this same bound action in the same transaction.
CREATE OR REPLACE FUNCTION executive.approve_health_snapshot(p_approval_id uuid, p_tenant uuid, p_domain uuid, p_snapshot uuid, p_digest text, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s executive.health_score_snapshots%ROWTYPE; v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.health.snapshot.approve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'health approval rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_note IS NULL OR length(btrim(p_note)) < 8 OR length(p_note) > 2000 THEN RAISE EXCEPTION 'health approval rejected (note): a note of 8 to 2000 characters records the acceptance' USING ERRCODE = '22023'; END IF;
  IF p_digest IS NULL OR p_digest !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'health approval rejected (digest): the approval names the result digest previewed (64 hex)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO s FROM executive.health_score_snapshots x WHERE x.snapshot_id = p_snapshot AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'health approval rejected (unknown_snapshot): no snapshot % in this domain', p_snapshot USING ERRCODE = '23503'; END IF;
  IF s.kind <> 'current' THEN RAISE EXCEPTION 'health approval rejected (state): snapshot % is an as_of replay; only a current snapshot is accepted', p_snapshot USING ERRCODE = '22023'; END IF;
  IF s.result_digest <> p_digest THEN RAISE EXCEPTION 'health approval rejected (stale_digest): the approver previewed %; snapshot % records %', p_digest, p_snapshot, s.result_digest USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM executive.health_snapshot_approvals a WHERE a.snapshot_id = p_snapshot AND a.approved_by = p_actor) THEN
    RAISE EXCEPTION 'health approval rejected (duplicate): snapshot % is already accepted by this principal', p_snapshot USING ERRCODE = '22023';
  END IF;
  INSERT INTO executive.health_snapshot_approvals (approval_id, scope, tenant_id, domain_id, snapshot_id, result_digest, note, approved_by, approved_at, correlation_id)
  VALUES (p_approval_id, 'DOMAIN', p_tenant, p_domain, p_snapshot, p_digest, btrim(p_note), p_actor, v_now, p_correlation);
  RETURN jsonb_build_object('approval_id', p_approval_id, 'snapshot_id', p_snapshot, 'result_digest', p_digest, 'approved_by', p_actor, 'approved_at', v_now, 'note', btrim(p_note),
                            'authorizes_action', false, 'what_follows', 'the acceptance is signed beyond the audit chain (kind health_snapshot); the decomposition stands as recorded — a later correction is a new snapshot');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.approve_health_snapshot(uuid,uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.approve_health_snapshot(uuid,uuid,uuid,uuid,text,text,uuid,uuid) TO eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §S5 THE COMPUTATION re-declared
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- executive.health_change_answer re-declared (0089 lines 4243–4253, whole; ONE change: the owner-edit flag and its edit ids answered)
CREATE OR REPLACE FUNCTION executive.health_change_answer(c executive.health_score_changes) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object('change_id', c.change_id, 'snapshot_id', c.snapshot_id, 'prior_snapshot_id', c.prior_snapshot_id, 'definition_id', c.definition_id, 'definition_version', c.definition_version,
                            'definition_approved_by', c.definition_approved_by, 'subject', c.subject, 'subject_label', c.subject_label, 'from_value', c.from_value, 'to_value', c.to_value,
                            'delta', c.delta, 'from_band', c.from_band, 'to_band', c.to_band, 'triggers', to_jsonb(c.triggers), 'direction', c.direction, 'gaming_flags', c.gaming_flags,
                            'state', c.state, 'raised_at', c.raised_at, 'acknowledged_by', c.acknowledged_by, 'acknowledged_at', c.acknowledged_at, 'acknowledgement_note', c.acknowledgement_note,
                            'challenge_kind', c.challenge_kind, 'challenge_statement', c.challenge_statement, 'challenged_by', c.challenged_by, 'challenged_at', c.challenged_at,
                            'decided_by', c.decided_by, 'decided_at', c.decided_at, 'decision_note', c.decision_note, 'withdrawn_at', c.withdrawn_at, 'withdrawal_reason', c.withdrawal_reason,
                            'authorizes_action', false,
                            /* B36 (0094 §S1) */ 'owner_edit_flag', c.owner_edit_flag, 'owner_edit_ids', to_jsonb(c.owner_edit_ids));
$$;
REVOKE ALL ON FUNCTION executive.health_change_answer(executive.health_score_changes) FROM PUBLIC;

-- executive.compute_health_score re-declared (0089 lines 4266–4375, whole; ONE addition, the `B36 (0094 §S5)` block in four places that
-- belong together: (1) the owner-stated readings from the edit ledger joined to the contract rows before the digest; (2) the exceptions
-- in force applied to the model handed to the composition, and named on the result; (3) each component's owner-stated marks beside its
-- decision links; (4) the owner-edit flag on a favourable change, and the input register refreshed after a current snapshot).
CREATE OR REPLACE FUNCTION executive.compute_health_score(p_snapshot uuid, p_tenant uuid, p_domain uuid, p_at timestamptz, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, graph, ctx, public, pg_catalog, pg_temp AS $$
DECLARE d executive.health_score_definitions%ROWTYPE; pr executive.health_score_snapshots%ROWTYPE; same executive.health_score_snapshots%ROWTYPE;
        v_now timestamptz := clock_timestamp(); v_at timestamptz; v_inputs jsonb; v_inputs_digest text; v_result jsonb; v_result_digest text; v_latest timestamptz; v_kind text;
        v_dim jsonb; v_comp jsonb; v_links jsonb; v_dims jsonb := '[]'::jsonb; v_comps jsonb := '[]'::jsonb; v_changes jsonb := '[]'::jsonb;
        v_subjects jsonb; s jsonb; v_from numeric; v_to numeric; v_fb text; v_tb text; v_triggers text[]; v_flags jsonb; v_change uuid; v_label text; v_bands jsonb; g jsonb := executive.health_gaming_policy();
        v_ch executive.health_score_changes%ROWTYPE;
        /* B36 (0094 §S5) */ v_model jsonb; v_exc jsonb; v_stated jsonb; v_win jsonb; v_edit_ids uuid[]; v_owner_flag boolean; cx jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.health.compute']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'health score rejected: computed by the acting principal' USING ERRCODE = '42501'; END IF;
  v_at := coalesce(p_at, v_now);
  IF v_at > v_now THEN RAISE EXCEPTION 'health score rejected: the instant % is after now; a score is computed at or before now', v_at USING ERRCODE = '22023'; END IF;
  SELECT * INTO d FROM executive.health_score_definitions x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'health score rejected (no_definition): no approved definition is active in this domain; one person proposes a definition and another approves it' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('executive.health_score_snapshots:' || d.definition_id::text, 0));
  -- THE ONLY INPUT: the contract rows the model names, at the instant (nothing else is read as a measure)
  SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.input_kind, i.input_id, i.observed_at), '[]'::jsonb) INTO v_inputs
    FROM executive.health_measure_inputs(p_tenant, p_domain, v_at) i
   WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(d.model -> 'components') mc WHERE mc ->> 'input_kind' = i.input_kind AND lower(mc ->> 'input_id') = i.input_id::text);
  /* B36 (0094 §S5) (1): the OWNER-STATED readings — per component, the latest owner edit at or before the instant (the ledger, so an as_of
     replay reads what stood then) — joined to the contract rows as further input rows; the composition takes the newest observation. */
  SELECT coalesce(jsonb_agg(jsonb_build_object('input_kind', e.input_kind, 'input_id', e.input_ref, 'input_version', NULL, 'label', mc ->> 'label', 'value', e.to_value,
                                               'unit', coalesce((SELECT x ->> 'unit' FROM jsonb_array_elements(v_inputs) x WHERE x ->> 'input_kind' = e.input_kind AND lower(x ->> 'input_id') = e.input_ref::text LIMIT 1), hi.unit),
                                               'direction', mc ->> 'direction', 'observed_at', e.edited_at, 'expected_every_days', NULL, 'confidence', NULL, 'evidence', '[]'::jsonb,
                                               'objective_ids', coalesce((SELECT x -> 'objective_ids' FROM jsonb_array_elements(v_inputs) x WHERE x ->> 'input_kind' = e.input_kind AND lower(x ->> 'input_id') = e.input_ref::text LIMIT 1), '[]'::jsonb),
                                               'exposure', NULL, 'basis', format('restated by its owner %s at %s (edit %s: %s → %s, "%s"); the contract''s own reading stands beside it', e.editor_principal_id, e.edited_at, e.edit_id, coalesce(e.from_value::text, 'none'), e.to_value, e.reason),
                                               'owner', e.editor_principal_id, 'owner_edit_id', e.edit_id, 'owner_stated', true)), '[]'::jsonb)
    INTO v_stated
    FROM jsonb_array_elements(d.model -> 'components') mc
    JOIN LATERAL (SELECT z.* FROM executive.health_input_edits z WHERE z.definition_id = d.definition_id AND z.component_key = mc ->> 'key' AND z.edited_at <= v_at ORDER BY z.edited_at DESC LIMIT 1) e ON true
    LEFT JOIN executive.health_inputs hi ON hi.input_id = e.input_id;
  v_inputs := v_inputs || v_stated;
  /* B36 (0094 §S5) (2): the EXCEPTIONS in force at the instant applied to the model the composition reads — an excluded component left
     out (its dimension judged on the rest), a relaxed bound in place of the component's; named on the result. */
  v_exc := executive.health_exceptions_in_force(p_tenant, p_domain, d.definition_id, v_at);
  SELECT d.model || jsonb_build_object('components', coalesce(jsonb_agg(
           CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_exc) x WHERE x ->> 'component_key' = c ->> 'key' AND x ->> 'kind' = 'relax_bound')
                THEN c || jsonb_build_object('stale_after_days', (SELECT (x ->> 'relaxed_stale_after_days')::numeric FROM jsonb_array_elements(v_exc) x WHERE x ->> 'component_key' = c ->> 'key' AND x ->> 'kind' = 'relax_bound' ORDER BY x ->> 'approved_at' DESC LIMIT 1))
                ELSE c END ORDER BY n) FILTER (WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_exc) x WHERE x ->> 'component_key' = c ->> 'key' AND x ->> 'kind' = 'exclude')), '[]'::jsonb))
    INTO v_model FROM jsonb_array_elements(d.model -> 'components') WITH ORDINALITY q(c, n);
  /* end B36 (1)(2) */
  v_inputs_digest := encode(sha256(convert_to(v_inputs::text, 'UTF8')), 'hex');
  SELECT max(x.at) INTO v_latest FROM executive.health_score_snapshots x WHERE x.definition_id = d.definition_id AND x.kind = 'current';
  v_kind := CASE WHEN v_latest IS NULL OR v_at > v_latest THEN 'current' ELSE 'as_of' END;
  SELECT * INTO pr FROM executive.health_score_snapshots x WHERE x.definition_id = d.definition_id AND x.kind = 'current' AND x.at < v_at ORDER BY x.at DESC LIMIT 1;
  v_result := executive.health_compose(v_model, v_inputs, v_at, pr.result)
              /* B36 (0094 §S5) (2) */ || jsonb_build_object('exceptions', v_exc, 'owner_edit_window_days', d.owner_edit_window_days);
  v_result_digest := encode(sha256(convert_to(v_result::text, 'UTF8')), 'hex');
  -- the decisions each dimension and component informs (the lineage read; outside the result digest — the graph moves on its own)
  FOR v_dim IN SELECT value FROM jsonb_array_elements(v_result -> 'dimensions') LOOP
    v_dims := v_dims || (v_dim || jsonb_build_object('decision_links', executive.health_decision_links(p_tenant, p_domain, v_dim -> 'objective_ids')));
  END LOOP;
  FOR v_comp IN SELECT value FROM jsonb_array_elements(v_result -> 'components') LOOP
    v_links := executive.health_decision_links(p_tenant, p_domain,
                 (SELECT x -> 'objective_ids' FROM jsonb_array_elements(v_result -> 'dimensions') x WHERE x ->> 'key' = v_comp ->> 'dimension') || coalesce(v_comp #> '{lineage,objective_ids}', '[]'::jsonb));
    /* B36 (0094 §S5) (3): the input row the component read — whether it is the owner's statement, and whose */
    SELECT x INTO v_win FROM jsonb_array_elements(v_inputs) x WHERE x ->> 'input_kind' = v_comp ->> 'input_kind' AND lower(x ->> 'input_id') = v_comp ->> 'input_id'
     ORDER BY (x ->> 'observed_at')::timestamptz DESC NULLS LAST LIMIT 1;
    v_comps := v_comps || (v_comp || jsonb_build_object('decision_links', v_links,
                 'owner_stated', coalesce((v_win ->> 'owner_stated')::boolean, false), 'owner', v_win -> 'owner', 'owner_edit_id', v_win -> 'owner_edit_id'));
  END LOOP;
  v_result := v_result || jsonb_build_object('dimensions', v_dims, 'components', v_comps);
  IF v_kind = 'as_of' THEN
    SELECT * INTO same FROM executive.health_score_snapshots x WHERE x.definition_id = d.definition_id AND x.at = v_at ORDER BY x.computed_at LIMIT 1;
  END IF;
  INSERT INTO executive.health_score_snapshots (snapshot_id, scope, tenant_id, domain_id, definition_id, definition_version, formula_version, model_digest, at, computed_at, kind,
                                                prior_snapshot_id, replay_of, reproduced, status, aggregate, coverage, result, inputs, inputs_digest, result_digest, computed_by, correlation_id)
  VALUES (p_snapshot, 'DOMAIN', p_tenant, p_domain, d.definition_id, d.version, d.formula_version, d.model_digest, v_at, v_now, v_kind,
          pr.snapshot_id, same.snapshot_id, CASE WHEN same.snapshot_id IS NULL THEN NULL ELSE same.inputs_digest = v_inputs_digest AND same.result_digest = v_result_digest END,
          v_result ->> 'status', (v_result ->> 'aggregate')::numeric, (v_result ->> 'coverage')::numeric, v_result, v_inputs, v_inputs_digest, v_result_digest, p_actor, p_correlation);
  INSERT INTO executive.health_score_components (snapshot_id, component_key, scope, tenant_id, domain_id, dimension_key, label, input_kind, input_id, input_version, value, unit, direction,
                                                 normalised, weight, contribution, evidence, confidence, low_confidence, trend, observed_at, freshness_days, stale_after_days, state, stale, missing,
                                                 reason, critical, critical_failure, sensitivity, decision_links, lineage)
  SELECT p_snapshot, x ->> 'key', 'DOMAIN', p_tenant, p_domain, x ->> 'dimension', x ->> 'label', x ->> 'input_kind', (x ->> 'input_id')::uuid, (x ->> 'input_version')::bigint,
         (x ->> 'value')::numeric, x ->> 'unit', x ->> 'direction', (x ->> 'normalised')::numeric, (x ->> 'weight')::numeric, (x ->> 'contribution')::numeric, x -> 'evidence',
         (x ->> 'confidence')::numeric, (x ->> 'low_confidence')::boolean, (x #>> '{trend,delta}')::numeric, (x ->> 'observed_at')::timestamptz, (x ->> 'freshness_days')::numeric,
         (x ->> 'stale_after_days')::numeric, x ->> 'state', (x ->> 'stale')::boolean, (x ->> 'missing')::boolean, x ->> 'reason', (x ->> 'critical')::boolean, (x ->> 'critical_failure')::boolean,
         x -> 'sensitivity', x -> 'decision_links', x -> 'lineage'
    FROM jsonb_array_elements(v_comps) x;
  /* B36 (0094 §S5) (4a): the input REGISTER refreshed by a current snapshot — every component's owner re-derived, the value as read */
  IF v_kind = 'current' THEN
    FOR cx IN SELECT value FROM jsonb_array_elements(v_comps) LOOP
      PERFORM executive.health_input_upsert(p_tenant, p_domain, d.definition_id, cx ->> 'key', cx ->> 'input_kind', (cx ->> 'input_id')::uuid, (cx ->> 'value')::numeric, cx ->> 'unit',
                                            (cx ->> 'observed_at')::timestamptz, coalesce((cx ->> 'owner_stated')::boolean, false), NULL, p_correlation);
    END LOOP;
  END IF;
  -- THE CHANGES: a CURRENT snapshot against the prior current snapshot of the same definition (an as_of replay raises nothing)
  IF v_kind = 'current' AND pr.snapshot_id IS NOT NULL THEN
    v_subjects := jsonb_build_array(jsonb_build_object('subject', 'aggregate', 'label', 'the aggregate', 'from', pr.result -> 'aggregate', 'to', v_result -> 'aggregate', 'from_band', NULL, 'to_band', NULL, 'bands', '[]'::jsonb))
      || coalesce((SELECT jsonb_agg(jsonb_build_object('subject', 'dimension:' || (n ->> 'key'), 'key', n ->> 'key', 'label', n ->> 'label', 'from', o -> 'value', 'to', n -> 'value',
                                                        'from_band', o -> 'band', 'to_band', n -> 'band', 'bands', n -> 'bands') ORDER BY m)
                     FROM jsonb_array_elements(v_result -> 'dimensions') WITH ORDINALITY y(n, m)
                     JOIN jsonb_array_elements(pr.result -> 'dimensions') o ON o ->> 'key' = n ->> 'key'), '[]'::jsonb);
    FOR s IN SELECT value FROM jsonb_array_elements(v_subjects) LOOP
      v_from := CASE WHEN jsonb_typeof(s -> 'from') = 'number' THEN (s ->> 'from')::numeric END;
      v_to := CASE WHEN jsonb_typeof(s -> 'to') = 'number' THEN (s ->> 'to')::numeric END;
      v_fb := CASE WHEN jsonb_typeof(s -> 'from_band') = 'string' THEN s ->> 'from_band' END;
      v_tb := CASE WHEN jsonb_typeof(s -> 'to_band') = 'string' THEN s ->> 'to_band' END;
      v_triggers := '{}';
      IF (v_from IS NULL) <> (v_to IS NULL) THEN v_triggers := v_triggers || 'determinacy'::text; END IF;
      IF v_fb IS NOT NULL AND v_tb IS NOT NULL AND v_fb <> v_tb THEN v_triggers := v_triggers || 'band_crossing'::text; END IF;
      IF v_from IS NOT NULL AND v_to IS NOT NULL AND abs(v_to - v_from) > (d.model ->> 'change_points')::numeric THEN v_triggers := v_triggers || 'move'::text; END IF;
      IF cardinality(v_triggers) = 0 THEN CONTINUE; END IF;
      -- ANTI-GAMING (shown, gating nothing): an input RESTATED before a favourable change; a value SITTING ON a band's floor
      v_flags := '[]'::jsonb;
      IF v_from IS NOT NULL AND v_to IS NOT NULL AND v_to > v_from THEN
        v_flags := v_flags || coalesce((SELECT jsonb_agg(jsonb_build_object('flag', 'restated_input', 'component', n ->> 'key', 'input_kind', n ->> 'input_kind', 'input_id', n ->> 'input_id',
                                                                          'observed_at', n -> 'observed_at', 'from_value', o -> 'value', 'to_value', n -> 'value',
                                                                          'detail', 'the same observation instant carries another value than at the prior snapshot — the input was restated inside the window before a favourable change'))
                                         FROM jsonb_array_elements(v_result -> 'components') n JOIN jsonb_array_elements(pr.result -> 'components') o ON o ->> 'key' = n ->> 'key'
                                        WHERE (s ->> 'subject' = 'aggregate' OR n ->> 'dimension' = s ->> 'key')
                                          AND n ->> 'observed_at' IS NOT NULL AND (n ->> 'observed_at')::timestamptz = (o ->> 'observed_at')::timestamptz AND (n -> 'value') IS DISTINCT FROM (o -> 'value')), '[]'::jsonb);
      END IF;
      IF v_to IS NOT NULL THEN
        v_flags := v_flags || coalesce((SELECT jsonb_agg(jsonb_build_object('flag', 'on_threshold', 'band', b ->> 'key', 'floor', (b ->> 'min')::numeric, 'value', v_to,
                                                                          'detail', format('the value %s sits within %s point(s) above the floor %s of band %s', v_to, g ->> 'on_threshold_points', b ->> 'min', b ->> 'key')))
                                         FROM jsonb_array_elements(s -> 'bands') b
                                        WHERE (b ->> 'min')::numeric > 0 AND v_to >= (b ->> 'min')::numeric AND v_to - (b ->> 'min')::numeric <= (g ->> 'on_threshold_points')::numeric), '[]'::jsonb);
      END IF;
      /* B36 (0094 §S5) (4b): THE OWNER-EDIT FLAG — an owner edit of a component of this subject inside the definition's window before
         this instant, when the change is FAVOURABLE; the edit ids kept on the change (owner_edit_analysis counts them per owner). */
      v_edit_ids := '{}'; v_owner_flag := false;
      IF v_from IS NOT NULL AND v_to IS NOT NULL AND v_to > v_from THEN
        v_edit_ids := ARRAY(SELECT e.edit_id FROM executive.health_input_edits e
                             WHERE e.definition_id = d.definition_id AND e.edited_at <= v_at AND e.edited_at > v_at - (d.owner_edit_window_days * interval '1 day')
                               AND (s ->> 'subject' = 'aggregate' OR e.component_key IN (SELECT n ->> 'key' FROM jsonb_array_elements(v_result -> 'components') n WHERE n ->> 'dimension' = s ->> 'key'))
                             ORDER BY e.edited_at);
        v_owner_flag := cardinality(v_edit_ids) > 0;
        IF v_owner_flag THEN
          v_flags := v_flags || (SELECT jsonb_agg(jsonb_build_object('flag', 'owner_edit', 'component', e.component_key, 'edit_id', e.edit_id, 'owner', e.editor_principal_id, 'edited_at', e.edited_at,
                                                                     'from_value', e.from_value, 'to_value', e.to_value, 'window_days', d.owner_edit_window_days,
                                                                     'detail', format('the owner of %s restated it %s → %s at %s, inside the %s-day window before this favourable change', e.component_key, coalesce(e.from_value::text, 'none'), e.to_value, e.edited_at, d.owner_edit_window_days)))
                                   FROM executive.health_input_edits e WHERE e.edit_id = ANY (v_edit_ids));
        END IF;
      END IF;
      /* end B36 (4b) */
      v_change := gen_random_uuid();
      INSERT INTO executive.health_score_changes (change_id, scope, tenant_id, domain_id, snapshot_id, prior_snapshot_id, definition_id, definition_version, definition_approved_by, subject, subject_label,
                                                  from_value, to_value, delta, from_band, to_band, triggers, direction, gaming_flags, raised_at, correlation_id,
                                                  /* B36 */ owner_edit_flag, owner_edit_ids)
      VALUES (v_change, 'DOMAIN', p_tenant, p_domain, p_snapshot, pr.snapshot_id, d.definition_id, d.version, d.approved_by, s ->> 'subject', s ->> 'label',
              v_from, v_to, CASE WHEN v_from IS NOT NULL AND v_to IS NOT NULL THEN round(v_to - v_from, 2) END, v_fb, v_tb, v_triggers,
              CASE WHEN v_from IS NULL OR v_to IS NULL THEN 'determinacy' WHEN v_to > v_from THEN 'favourable' ELSE 'unfavourable' END, v_flags, v_now, p_correlation,
              /* B36 */ v_owner_flag, v_edit_ids)
      RETURNING * INTO v_ch;
      INSERT INTO executive.health_score_change_events (event_id, scope, tenant_id, domain_id, change_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, v_change, 'change.raised', p_actor,
              jsonb_build_object('subject', s ->> 'subject', 'from_value', v_from, 'to_value', v_to, 'from_band', v_fb, 'to_band', v_tb, 'triggers', to_jsonb(v_triggers), 'gaming_flags', v_flags,
                                 'snapshot_id', p_snapshot, 'prior_snapshot_id', pr.snapshot_id, /* B36 */ 'owner_edit_flag', v_owner_flag, 'owner_edit_ids', to_jsonb(v_edit_ids)), p_correlation);
      v_changes := v_changes || executive.health_change_answer(v_ch);
    END LOOP;
  END IF;
  RETURN jsonb_build_object('snapshot_id', p_snapshot, 'definition_id', d.definition_id, 'definition_version', d.version, 'formula_version', d.formula_version, 'model_digest', d.model_digest,
                            'at', v_at, 'computed_at', v_now, 'kind', v_kind, 'prior_snapshot_id', pr.snapshot_id, 'replay_of', same.snapshot_id,
                            'reproduced', CASE WHEN same.snapshot_id IS NULL THEN NULL ELSE same.inputs_digest = v_inputs_digest AND same.result_digest = v_result_digest END,
                            'status', v_result ->> 'status', 'aggregate', v_result -> 'aggregate', 'coverage', v_result -> 'coverage', 'inputs_digest', v_inputs_digest, 'result_digest', v_result_digest,
                            'inputs_read', jsonb_array_length(v_inputs), 'result', v_result, 'changes', v_changes,
                            /* B36 */ 'exceptions', v_exc, 'owner_edit_window_days', d.owner_edit_window_days);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.compute_health_score(uuid,uuid,uuid,timestamptz,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.compute_health_score(uuid,uuid,uuid,timestamptz,uuid,uuid) TO eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §S6 REVOCABLE AUTHORITY ACTS
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
ALTER TABLE graph.strategy_authority_acts
  ADD COLUMN revoked_at        timestamptz,
  ADD COLUMN revoked_by        uuid,
  ADD COLUMN revocation_reason text,
  ADD CONSTRAINT gsa_revocation CHECK ((revoked_at IS NULL) = (revoked_by IS NULL) AND (revoked_at IS NULL) = (revocation_reason IS NULL) AND (revoked_at IS NULL OR revoked_at >= recorded_at));
-- an act moves one way: in force → revoked (the three fields set once, from NULL); nothing else of the row changes; nothing is deleted
DROP TRIGGER append_only ON graph.strategy_authority_acts;
CREATE OR REPLACE FUNCTION graph.authority_acts_forward() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'strategy authority acts are append-only: DELETE prohibited' USING ERRCODE = '2F002'; END IF;
  IF OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL OR (to_jsonb(NEW) - ARRAY['revoked_at', 'revoked_by', 'revocation_reason']) <> (to_jsonb(OLD) - ARRAY['revoked_at', 'revoked_by', 'revocation_reason']) THEN
    RAISE EXCEPTION 'strategy authority act % is immutable but for its one revocation', OLD.act_id USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER gsa_forward BEFORE UPDATE OR DELETE ON graph.strategy_authority_acts FOR EACH ROW EXECUTE FUNCTION graph.authority_acts_forward();
COMMENT ON COLUMN graph.strategy_authority_acts.revoked_at IS 'B36 (0094 §S6; F-P6-09 (b)): the act REVOKED by its issuer or a domain administrator, once, with a reason — every read that judges an act in force excludes it from that instant.';

-- the vocabularies the revocation writes (each list copied whole from its declaration in 0089, plus one)
ALTER TABLE graph.measures DROP CONSTRAINT measures_approval_state_check;
ALTER TABLE graph.measures ADD CONSTRAINT measures_approval_state_check CHECK (approval_state IN ('proposed', 'approved', 'rejected', /* B36 */ 'revoked'));
ALTER TABLE graph.measure_events DROP CONSTRAINT measure_events_event_check;
ALTER TABLE graph.measure_events ADD CONSTRAINT measure_events_event_check CHECK (event IN ('measure.defined', 'measure.redefined', 'measure.approved', 'measure.rejected', 'measure.observed', /* B36 */ 'measure.approval_revoked'));
ALTER TABLE graph.alignment_events DROP CONSTRAINT alignment_events_event_check;
ALTER TABLE graph.alignment_events ADD CONSTRAINT alignment_events_event_check CHECK (event IN ('alignment.declared', 'alignment.retired', 'alignment.tradeoff_decided', 'alignment.allocation_decided', /* B36 */ 'alignment.tradeoff_revoked', 'alignment.allocation_revoked'));
ALTER TABLE graph.strategy_events DROP CONSTRAINT strategy_events_event_check;
ALTER TABLE graph.strategy_events ADD CONSTRAINT strategy_events_event_check CHECK (event IN (
  'strategy.declared', 'strategy.linked', 'strategy.unlinked',
  'assumption.verified', 'assumption.unverified', 'assumption.invalidated',
  'strategy.closed', 'strategy.withdrawn',
  -- B32 (0089)
  'strategy.owner_assigned',
  -- B36 (0094 §S6): a set_objective act revoked
  'strategy.objective_unset'));

-- REVOKE: the act's issuer (its approver) or a domain administrator; a reason; a lapsed (expired) or already revoked act is not revoked.
CREATE OR REPLACE FUNCTION graph.revoke_authority_act(p_act uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = graph, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t graph.strategy_authority_acts%ROWTYPE; v_now timestamptz := clock_timestamp(); v_event text; v_object_type text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.strategy.authority.revoke']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM graph.assert_strategy_actor(p_tenant, p_actor, 'strategy revocation rejected');
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(p_reason) > 2000 THEN RAISE EXCEPTION 'strategy revocation rejected (reason): a reason of 8 to 2000 characters says why the act is revoked' USING ERRCODE = '22023'; END IF;
  SELECT * INTO t FROM graph.strategy_authority_acts x WHERE x.act_id = p_act AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'strategy revocation rejected (unknown_act): no authority act % in this domain', p_act USING ERRCODE = '23503'; END IF;
  IF t.approver_principal_id <> p_actor AND NOT decision.holds_role(p_actor, p_tenant, p_domain, 'domain_admin') THEN
    RAISE EXCEPTION 'strategy revocation rejected (not_authority): act % was recorded by %; its issuer or a domain administrator revokes it', p_act, t.approver_principal_id USING ERRCODE = '42501';
  END IF;
  IF t.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'strategy revocation rejected (revoked): act % was revoked at % by %', p_act, t.revoked_at, t.revoked_by USING ERRCODE = '22023'; END IF;
  IF t.expires_at <= v_now THEN RAISE EXCEPTION 'strategy revocation rejected (lapsed): act % expired at %; a lapsed act is not revoked', p_act, t.expires_at USING ERRCODE = '22023'; END IF;
  UPDATE graph.strategy_authority_acts SET revoked_at = v_now, revoked_by = p_actor, revocation_reason = btrim(p_reason) WHERE act_id = p_act;
  IF t.act_kind = 'approve_measure' THEN
    IF t.decision = 'approve' THEN
      UPDATE graph.measures SET approval_state = 'revoked', updated_at = v_now WHERE measure_id = t.subject_id AND approval_act_id = p_act;
    END IF;
    INSERT INTO graph.measure_events (event_id, scope, tenant_id, domain_id, measure_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, t.subject_id, 'measure.approval_revoked', p_actor,
            jsonb_build_object('act_id', p_act, 'decision_revoked', t.decision, 'definition_version', t.subject_version, 'definition_digest', t.subject_digest, 'reason', btrim(p_reason)), p_correlation);
    v_object_type := 'MSR';
  ELSIF t.subject_kind = 'alignment' THEN
    v_event := CASE t.act_kind WHEN 'approve_tradeoff' THEN 'alignment.tradeoff_revoked' ELSE 'alignment.allocation_revoked' END;
    INSERT INTO graph.alignment_events (event_id, scope, tenant_id, domain_id, alignment_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, t.subject_id, v_event, p_actor, jsonb_build_object('act_id', p_act, 'decision_revoked', t.decision, 'reason', btrim(p_reason)), p_correlation);
    v_object_type := 'ALN';
  ELSE
    INSERT INTO graph.strategy_events (event_id, scope, tenant_id, domain_id, strategy_object_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, t.subject_id, 'strategy.objective_unset', p_actor, jsonb_build_object('act_id', p_act, 'decision_revoked', t.decision, 'reason', btrim(p_reason)), p_correlation);
    v_object_type := 'OBJ';
  END IF;
  RETURN jsonb_build_object('act_id', p_act, 'act_kind', t.act_kind, 'subject_kind', t.subject_kind, 'subject_id', t.subject_id, 'subject_version', t.subject_version, 'object_type', v_object_type,
                            'decision_revoked', t.decision, 'approver', t.approver_principal_id, 'revoked_by', p_actor, 'revoked_at', v_now, 'reason', btrim(p_reason),
                            'what_follows', 'every read that judges the act in force — the measure''s approval, the gap view, the detections — sees the revocation from this instant');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.revoke_authority_act(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.revoke_authority_act(uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

-- graph.measure_freshness re-declared (0089 lines 2853–2878, whole; ONE change: the revocation predicate beside the act read)
CREATE OR REPLACE FUNCTION graph.measure_freshness(p_tenant uuid, p_domain uuid, p_at timestamptz)
RETURNS TABLE (measure_id uuid, title text, status text, owner_principal_id uuid, objective_ids uuid[], unit text, direction text, target_value numeric, target_date date,
               freshness_days numeric, definition_version int, definition_digest text, approval_state text, approved_now boolean, approval_act_id uuid,
               approval_expires_at timestamptz, last_value numeric, last_observed_at timestamptz, last_source jsonb, observations int, age_days numeric, state text)
LANGUAGE sql STABLE AS $$
  SELECT m.measure_id, s.title, s.status, s.owner_principal_id,
         ARRAY(SELECT a.to_id FROM graph.alignments a WHERE a.kind = 'measures' AND a.from_id = m.measure_id AND a.state = 'active' AND a.tenant_id = m.tenant_id AND a.domain_id = m.domain_id ORDER BY a.declared_at, a.to_id),
         m.unit, m.direction, m.target_value, m.target_date, m.freshness_days, m.definition_version, m.definition_digest, m.approval_state,
         coalesce(act.decision = 'approve' AND act.expires_at > p_at, false), act.act_id, act.expires_at,
         o.value, o.observed_at,
         CASE WHEN o.observation_id IS NULL THEN NULL ELSE jsonb_build_object('kind', o.source_kind, 'id', o.source_id, 'version', o.source_version) END,
         (SELECT count(*)::int FROM graph.measure_observations x WHERE x.measure_id = m.measure_id AND x.observed_at <= p_at AND x.recorded_at <= p_at),
         CASE WHEN o.observation_id IS NULL THEN NULL ELSE round((extract(epoch FROM (p_at - o.observed_at)) / 86400.0)::numeric, 2) END,
         CASE WHEN o.observation_id IS NULL THEN 'no_observation'
              WHEN extract(epoch FROM (p_at - o.observed_at)) > m.freshness_days * 86400 THEN 'stale' ELSE 'fresh' END
    FROM graph.measures m
    JOIN graph.strategy_current s ON s.strategy_object_id = m.measure_id
    LEFT JOIN LATERAL (SELECT x.* FROM graph.measure_observations x WHERE x.measure_id = m.measure_id AND x.observed_at <= p_at AND x.recorded_at <= p_at
                        ORDER BY x.observed_at DESC, x.recorded_at DESC LIMIT 1) o ON true
    LEFT JOIN LATERAL (SELECT t.* FROM graph.strategy_authority_acts t WHERE t.act_kind = 'approve_measure' AND t.subject_id = m.measure_id AND t.subject_digest = m.definition_digest
                          AND t.recorded_at <= p_at AND (t.revoked_at IS NULL OR t.revoked_at > p_at) ORDER BY t.recorded_at DESC LIMIT 1) act ON true
   WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain
   ORDER BY s.title, m.measure_id;
$$;
REVOKE ALL ON FUNCTION graph.measure_freshness(uuid, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.measure_freshness(uuid, uuid, timestamptz) TO eye_app, eye_commit;

-- graph.record_strategy_authority_act re-declared (0089 lines 2883–2963, whole; ONE change: a revoked act is no duplicate)
CREATE OR REPLACE FUNCTION graph.record_strategy_authority_act(
  p_act_id uuid, p_tenant uuid, p_domain uuid, p_act_kind text, p_subject uuid, p_subject_digest text, p_decision text, p_rationale text,
  p_expires_at timestamptz, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = graph, objects, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_subject_kind text; st record; v_eligible text; r text; v_prior uuid; v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.strategy.authority.act']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM graph.assert_strategy_actor(p_tenant, p_actor, 'strategy authority rejected');
  v_subject_kind := CASE p_act_kind WHEN 'set_objective' THEN 'strategy' WHEN 'approve_measure' THEN 'measure' WHEN 'approve_tradeoff' THEN 'alignment' WHEN 'allocate_resource' THEN 'alignment' END;
  IF v_subject_kind IS NULL THEN
    RAISE EXCEPTION 'strategy authority rejected (act_kind): % is not an authority act (set_objective, approve_measure, approve_tradeoff, allocate_resource)', coalesce(p_act_kind, '<none>') USING ERRCODE = '22023';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'strategy authority rejected (decision): the decision is approve or reject' USING ERRCODE = '22023';
  END IF;
  IF p_rationale IS NULL OR length(btrim(p_rationale)) < 8 OR length(p_rationale) > 4096 THEN
    RAISE EXCEPTION 'strategy authority rejected (rationale): a rationale of 8 to 4096 characters says why' USING ERRCODE = '22023';
  END IF;
  IF p_subject_digest IS NULL OR p_subject_digest !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'strategy authority rejected (digest): the act names the digest of the subject version the approver read (64 hex)' USING ERRCODE = '22023';
  END IF;
  IF p_expires_at IS NULL OR p_expires_at <= v_now OR p_expires_at > v_now + interval '366 days' THEN
    RAISE EXCEPTION 'strategy authority rejected (expiry): an act expires after now and within 366 days' USING ERRCODE = '22023';
  END IF;
  -- ELIGIBILITY: the first planning authority the approver holds in this domain (the PDP admitted the action; the port names the role)
  FOREACH r IN ARRAY ARRAY['executive', 'decision_authority', 'domain_admin', 'strategy_owner'] LOOP
    IF decision.holds_role(p_actor, p_tenant, p_domain, r) THEN v_eligible := 'role:' || r; EXIT; END IF;
  END LOOP;
  IF v_eligible IS NULL THEN
    RAISE EXCEPTION 'strategy authority rejected (not_eligible): principal % holds none of executive, decision_authority, domain_admin, strategy_owner in this domain', p_actor USING ERRCODE = '42501';
  END IF;
  SELECT * INTO st FROM graph.strategy_subject_state(p_tenant, p_domain, v_subject_kind, p_subject);
  IF st.subject_digest IS NULL THEN
    RAISE EXCEPTION 'strategy authority rejected (unknown_subject): no % % in this domain', CASE v_subject_kind WHEN 'measure' THEN 'measure defined for' ELSE v_subject_kind END, p_subject USING ERRCODE = '23503';
  END IF;
  IF (p_act_kind = 'set_objective' AND st.subject_type <> 'OBJ') OR (p_act_kind = 'approve_tradeoff' AND st.subject_type <> 'conflicts_with')
     OR (p_act_kind = 'allocate_resource' AND st.subject_type <> 'resources') THEN
    RAISE EXCEPTION 'strategy authority rejected (subject): % names % (a %); set_objective names an objective, approve_tradeoff a conflicts_with alignment, allocate_resource a resources alignment',
      p_act_kind, p_subject, st.subject_type USING ERRCODE = '22023';
  END IF;
  IF st.subject_status NOT IN ('active') THEN
    RAISE EXCEPTION 'strategy authority rejected (inactive): % is %; an authority act names an active subject', p_subject, st.subject_status USING ERRCODE = '22023';
  END IF;
  IF v_subject_kind IN ('strategy', 'measure') AND NOT decision.is_active_human(st.owner, p_tenant) THEN
    RAISE EXCEPTION 'strategy authority rejected (missing_owner): % has no active human owner; an owner is assigned first (graph.assign_strategy_owner)', p_subject USING ERRCODE = '22023';
  END IF;
  IF st.subject_digest <> p_subject_digest THEN
    RAISE EXCEPTION 'strategy authority rejected (stale_digest): the approver read %; % is now version % (%)', p_subject_digest, p_subject, st.subject_version, st.subject_digest USING ERRCODE = '22023';
  END IF;
  IF st.declarer = p_actor THEN
    RAISE EXCEPTION 'strategy authority rejected (separation): principal % declared %; the declarer never records the authority act on it', p_actor, p_subject USING ERRCODE = '42501';
  END IF;
  SELECT t.act_id INTO v_prior FROM graph.strategy_authority_acts t
   WHERE t.subject_id = p_subject AND t.act_kind = p_act_kind AND t.subject_digest = p_subject_digest AND t.approver_principal_id = p_actor AND t.expires_at > v_now AND t.revoked_at IS NULL
   ORDER BY t.recorded_at DESC LIMIT 1;
  IF v_prior IS NOT NULL THEN
    RAISE EXCEPTION 'strategy authority rejected (duplicate): act % already records this approver''s % on this version', v_prior, p_act_kind USING ERRCODE = '22023';
  END IF;
  INSERT INTO graph.strategy_authority_acts (act_id, scope, tenant_id, domain_id, act_kind, subject_kind, subject_id, subject_version, subject_digest, decision, rationale,
                                             eligible_by, approver_principal_id, declarer_principal_id, expires_at, correlation_id)
  VALUES (p_act_id, 'DOMAIN', p_tenant, p_domain, p_act_kind, v_subject_kind, p_subject, st.subject_version, p_subject_digest, p_decision, p_rationale,
          v_eligible, p_actor, st.declarer, p_expires_at, p_correlation);
  IF p_act_kind = 'approve_measure' THEN
    UPDATE graph.measures SET approval_state = CASE p_decision WHEN 'approve' THEN 'approved' ELSE 'rejected' END, approval_act_id = p_act_id, updated_at = v_now
     WHERE measure_id = p_subject;
    INSERT INTO graph.measure_events (event_id, scope, tenant_id, domain_id, measure_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_subject, CASE p_decision WHEN 'approve' THEN 'measure.approved' ELSE 'measure.rejected' END, p_actor,
            jsonb_build_object('act_id', p_act_id, 'definition_version', st.subject_version, 'definition_digest', p_subject_digest, 'expires_at', p_expires_at, 'eligible_by', v_eligible), p_correlation);
  ELSIF v_subject_kind = 'alignment' THEN
    INSERT INTO graph.alignment_events (event_id, scope, tenant_id, domain_id, alignment_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_subject, CASE p_act_kind WHEN 'approve_tradeoff' THEN 'alignment.tradeoff_decided' ELSE 'alignment.allocation_decided' END, p_actor,
            jsonb_build_object('act_id', p_act_id, 'decision', p_decision, 'expires_at', p_expires_at, 'eligible_by', v_eligible), p_correlation);
  END IF;
  RETURN jsonb_build_object('act_id', p_act_id, 'act_kind', p_act_kind, 'subject_kind', v_subject_kind, 'subject_id', p_subject, 'subject_version', st.subject_version,
                            'subject_digest', p_subject_digest, 'decision', p_decision, 'eligible_by', v_eligible, 'approver', p_actor, 'declarer', st.declarer,
                            'expires_at', p_expires_at, 'recorded_at', v_now);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.record_strategy_authority_act(uuid, uuid, uuid, text, uuid, text, text, text, timestamptz, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.record_strategy_authority_act(uuid, uuid, uuid, text, uuid, text, text, text, timestamptz, uuid, uuid) TO eye_commit;

-- graph.strategy_detections (the 0089 READ, kept as the page's "as of this read" view) re-declared (0089 lines 3010–3111, whole; ONE change: the revocation predicate beside the act read)
CREATE OR REPLACE FUNCTION graph.strategy_detections(p_tenant uuid, p_domain uuid, p_at timestamptz)
RETURNS TABLE (detection_kind text, detection_key text, state text, subject_ids uuid[], subjects jsonb, detail text, continuity text, continuity_detail text,
               affected_ids uuid[], routed_to uuid[], path jsonb, resolved_by uuid)
LANGUAGE sql STABLE AS $$
  WITH RECURSIVE s AS (
    SELECT x.* FROM graph.strategy_current x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain
  ), subj AS (
    SELECT s.strategy_object_id AS id, jsonb_build_object('id', s.strategy_object_id, 'type', s.object_type, 'title', s.title, 'status', s.status,
                                                          'owner', s.owner_principal_id, 'owner_active_human', decision.is_active_human(s.owner_principal_id, p_tenant)) AS j
      FROM s
  ), conflicts AS (
    SELECT a.alignment_id, a.from_id, a.to_id, a.digest,
           (SELECT t.act_id FROM graph.strategy_authority_acts t
             WHERE t.act_kind = 'approve_tradeoff' AND t.subject_id = a.alignment_id AND t.subject_digest = a.digest AND t.recorded_at <= p_at AND (t.revoked_at IS NULL OR t.revoked_at > p_at)
             ORDER BY t.recorded_at DESC LIMIT 1) AS last_act
      FROM graph.alignments a
     WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.kind = 'conflicts_with' AND a.state = 'active'
  ), edges AS (
    SELECT DISTINCT d.dependent_object_id AS a, d.depends_on_id AS b
      FROM graph.dependencies d
      JOIN s sa ON sa.strategy_object_id = d.dependent_object_id AND sa.status = 'active'
      JOIN s sb ON sb.strategy_object_id = d.depends_on_id AND sb.status = 'active'
     WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.state = 'active' AND d.depends_on_kind = 'strategy'
  ), walk(start, node, path, closed) AS (
    SELECT e.a, e.b, ARRAY[e.a, e.b], false FROM edges e
    UNION ALL
    SELECT w.start, e.b, w.path || e.b, e.b = w.start
      FROM walk w JOIN edges e ON e.a = w.node
     WHERE NOT w.closed AND (e.b = w.start OR NOT e.b = ANY (w.path)) AND cardinality(w.path) < 64
  ), cycles AS (
    SELECT DISTINCT w.path FROM walk w
     WHERE w.closed AND w.start::text = (SELECT min(x::text) FROM unnest(w.path) x)
  ), fr AS (
    SELECT f.* FROM graph.measure_freshness(p_tenant, p_domain, p_at) f WHERE f.status = 'active' AND f.state <> 'fresh'
  )
  SELECT q.detection_kind, q.detection_key, q.state, q.subject_ids, q.subjects, q.detail, q.continuity, q.continuity_detail, q.affected_ids, q.routed_to, q.path, q.resolved_by FROM (
    -- CONFLICT: two objectives (or initiatives) declared in conflict; HOLD — no health or alignment claim over either while it stands,
    -- both alternatives preserved; routed to both owners for a trade-off; resolved by an unexpired approve_tradeoff act on its digest.
    SELECT 'conflict'::text, 'conflict:' || c.alignment_id::text,
           CASE WHEN act.decision = 'approve' AND act.expires_at > p_at THEN 'resolved' ELSE 'open' END,
           ARRAY[c.from_id, c.to_id],
           (SELECT jsonb_agg(subj.j ORDER BY subj.id) FROM subj WHERE subj.id IN (c.from_id, c.to_id)),
           format('alignment %s declares %s and %s in conflict%s', c.alignment_id, c.from_id, c.to_id,
                  CASE WHEN act.act_id IS NULL THEN '; no trade-off has been decided'
                       WHEN act.decision = 'approve' AND act.expires_at > p_at THEN format('; trade-off approved by act %s until %s', act.act_id, act.expires_at)
                       WHEN act.decision = 'approve' THEN format('; the trade-off approved by act %s expired at %s', act.act_id, act.expires_at)
                       ELSE format('; the trade-off was rejected by act %s', act.act_id) END),
           'hold'::text,
           'no health or alignment claim is made over either object while the conflict stands; both alternatives are preserved; a human authority decides the trade-off (approve_tradeoff)'::text,
           ARRAY[c.from_id, c.to_id],
           (SELECT coalesce(array_agg(DISTINCT u.r ORDER BY u.r), ARRAY[]::uuid[]) FROM unnest(graph.strategy_review_route(p_tenant, p_domain, c.from_id) || graph.strategy_review_route(p_tenant, p_domain, c.to_id)) AS u(r)),
           NULL::jsonb,
           CASE WHEN act.decision = 'approve' AND act.expires_at > p_at THEN act.act_id END,
           CASE WHEN act.decision = 'approve' AND act.expires_at > p_at THEN 1 ELSE 0 END AS o_state, 1 AS o_cont
      FROM conflicts c LEFT JOIN graph.strategy_authority_acts act ON act.act_id = c.last_act
    UNION ALL
    -- CYCLE: a dependency cycle among active strategy objects (the mirrors included); HOLD — no alignment claim over the objects on it
    -- until a link is removed (retire an alignment); routed to their owners.
    SELECT 'cycle', 'cycle:' || array_to_string(cy.path[1:cardinality(cy.path) - 1], '>'), 'open',
           cy.path[1:cardinality(cy.path) - 1],
           (SELECT jsonb_agg(subj.j ORDER BY subj.id) FROM subj WHERE subj.id = ANY (cy.path)),
           format('a dependency cycle of %s strategy objects: %s', cardinality(cy.path) - 1,
                  (SELECT string_agg(coalesce(s.object_type || ' "' || s.title || '"', n::text), ' rests on ' ORDER BY i) FROM unnest(cy.path) WITH ORDINALITY u(n, i) LEFT JOIN s ON s.strategy_object_id = u.n)),
           'hold',
           'the objects on the cycle are held: no alignment or health claim rests on a circular justification; a person removes a link (retires an alignment or a dependency)',
           cy.path[1:cardinality(cy.path) - 1],
           (SELECT coalesce(array_agg(DISTINCT v.r ORDER BY v.r), ARRAY[]::uuid[]) FROM unnest(cy.path) AS u(n), unnest(graph.strategy_review_route(p_tenant, p_domain, u.n)) AS v(r)),
           (SELECT jsonb_agg(jsonb_build_object('id', u.n, 'type', s.object_type, 'title', s.title) ORDER BY u.i) FROM unnest(cy.path) WITH ORDINALITY u(n, i) LEFT JOIN s ON s.strategy_object_id = u.n),
           NULL::uuid, 0, 1
      FROM cycles cy
    UNION ALL
    -- MISSING OWNER: an active object whose owner is not an active human; ROUTE TO OWNER — the planning review assigns one; authority
    -- acts naming it are refused until then.
    SELECT 'missing_owner', 'missing_owner:' || s.strategy_object_id::text, 'open',
           ARRAY[s.strategy_object_id],
           (SELECT jsonb_agg(subj.j) FROM subj WHERE subj.id = s.strategy_object_id),
           format('%s "%s" is owned by %s, who is not an active human', s.object_type, s.title, s.owner_principal_id),
           'route_to_owner',
           'routed to the accountable planning review (the parent objective''s owner, else the domain''s strategy owners and administrators) to assign an owner; authority acts naming it are refused until one is',
           ARRAY[s.strategy_object_id],
           graph.strategy_review_route(p_tenant, p_domain, s.strategy_object_id),
           NULL::jsonb, NULL::uuid, 0, 2
      FROM s WHERE s.status = 'active' AND NOT decision.is_active_human(s.owner_principal_id, p_tenant)
    UNION ALL
    -- STALE MEASURE: a measure never observed or older than its window; EXPOSE AFFECTED SCOPE — the measured objectives named, the
    -- measure's input declared stale (never current); routed to the measure's owner.
    SELECT 'stale_measure', 'stale_measure:' || f.measure_id::text, 'open',
           ARRAY[f.measure_id],
           (SELECT jsonb_agg(subj.j ORDER BY subj.id) FROM subj WHERE subj.id = f.measure_id OR subj.id = ANY (f.objective_ids)),
           CASE WHEN f.state = 'no_observation' THEN format('measure "%s" has no observation at or before %s (window %s day(s))', f.title, p_at, f.freshness_days)
                ELSE format('measure "%s" was last observed %s day(s) before %s (window %s day(s))', f.title, f.age_days, p_at, f.freshness_days) END,
           'expose_affected_scope',
           'the measured objectives are named as affected; the measure is an input declared stale, never presented as current; the owner refreshes it',
           ARRAY[f.measure_id] || f.objective_ids,
           graph.strategy_review_route(p_tenant, p_domain, f.measure_id),
           NULL::jsonb, NULL::uuid, 0, 3
      FROM fr f
  ) q(detection_kind, detection_key, state, subject_ids, subjects, detail, continuity, continuity_detail, affected_ids, routed_to, path, resolved_by, o_state, o_cont)
  ORDER BY q.o_state, q.o_cont, q.detection_key;
$$;
REVOKE ALL ON FUNCTION graph.strategy_detections(uuid, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.strategy_detections(uuid, uuid, timestamptz) TO eye_app, eye_commit;

-- graph.alignment_gaps re-declared (0089 lines 3116–3231, whole; ONE change: the revocation predicate beside each of the two act reads)
CREATE OR REPLACE FUNCTION graph.alignment_gaps(p_tenant uuid, p_domain uuid, p_objective uuid, p_at timestamptz)
RETURNS TABLE (objective_id uuid, objective_title text, objective_owner uuid, objective_subject jsonb, objective_set jsonb, capability_id uuid, capability_title text,
               alignment_id uuid, strength text, evidence_count int, strongest_truth text, evidence jsonb, initiatives jsonb, initiatives_active int, initiatives_resourced int,
               measures jsonb, criteria jsonb, criteria_met int, criteria_total int, gap_reasons text[], held_by jsonb, alignment_claim text, rule text)
LANGUAGE sql STABLE AS $$
  WITH o AS (
    SELECT x.* FROM graph.strategy_current x
     WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.object_type = 'OBJ' AND x.status = 'active' AND (p_objective IS NULL OR x.strategy_object_id = p_objective)
  ), det AS (
    SELECT d.* FROM graph.strategy_detections(p_tenant, p_domain, p_at) d WHERE d.state = 'open' AND d.continuity = 'hold'
  ), fr AS (
    SELECT f.* FROM graph.measure_freshness(p_tenant, p_domain, p_at) f WHERE f.status = 'active'
  ), pairs AS (
    SELECT o.strategy_object_id AS oid, o.title AS otitle, o.owner_principal_id AS oowner, c.strategy_object_id AS cid, c.title AS ctitle, a.alignment_id, a.strength, a.evidence AS aev
      FROM o
      LEFT JOIN graph.alignments a ON a.kind = 'supports' AND a.from_id = o.strategy_object_id AND a.state = 'active' AND a.tenant_id = p_tenant AND a.domain_id = p_domain
      LEFT JOIN graph.strategy_current c ON c.strategy_object_id = a.to_id AND c.status = 'active'
  ), rows AS (
    SELECT p.*,
           ss.subject_version AS oversion, ss.subject_digest AS odigest,
           setact.act_id AS set_act, setact.decision AS set_decision, setact.expires_at AS set_expires,
           coalesce(ev.refs, '[]'::jsonb) AS refs, coalesce(ev.n, 0) AS ev_n, ev.best AS ev_best,
           coalesce(ini.list, '[]'::jsonb) AS ini_list, coalesce(ini.active, 0) AS ini_active, coalesce(ini.resourced, 0) AS ini_resourced,
           coalesce(ms.list, '[]'::jsonb) AS ms_list, coalesce(ms.n, 0) AS ms_n, coalesce(ms.approved, 0) AS ms_approved, coalesce(ms.current, 0) AS ms_current,
           coalesce(hold.list, '[]'::jsonb) AS hold_list
      FROM pairs p
      LEFT JOIN LATERAL (SELECT * FROM graph.strategy_subject_state(p_tenant, p_domain, 'strategy', p.oid)) ss ON true
      LEFT JOIN LATERAL (SELECT t.* FROM graph.strategy_authority_acts t
                          WHERE t.act_kind = 'set_objective' AND t.subject_id = p.oid AND t.subject_digest = ss.subject_digest AND t.recorded_at <= p_at AND (t.revoked_at IS NULL OR t.revoked_at > p_at)
                          ORDER BY t.recorded_at DESC LIMIT 1) setact ON true
      -- the capability's evidence: what it rests on (claims, evidence) and what the supports alignment cites — each resolved, withdrawn excluded
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object('kind', r.kind, 'id', r.id, 'version', co.object_version, 'truth_state', co.truth_state, 'lifecycle_state', co.lifecycle_state,
                                            'counted', co.object_id IS NOT NULL AND co.lifecycle_state <> 'withdrawn' AND graph.strategy_truth_rank(co.truth_state) > 0) ORDER BY r.kind, r.id) AS refs,
               count(*) FILTER (WHERE co.object_id IS NOT NULL AND co.lifecycle_state <> 'withdrawn' AND graph.strategy_truth_rank(co.truth_state) > 0)::int AS n,
               (array_agg(co.truth_state ORDER BY graph.strategy_truth_rank(co.truth_state) DESC) FILTER (WHERE co.object_id IS NOT NULL AND co.lifecycle_state <> 'withdrawn' AND graph.strategy_truth_rank(co.truth_state) > 0))[1] AS best
          FROM (SELECT DISTINCT d.depends_on_kind AS kind, d.depends_on_id AS id FROM graph.dependencies d
                 WHERE p.cid IS NOT NULL AND d.dependent_object_id = p.cid AND d.state = 'active' AND d.depends_on_kind IN ('claim', 'evidence')
                UNION
                SELECT e ->> 'kind', (e ->> 'id')::uuid FROM jsonb_array_elements(coalesce(p.aev, '[]'::jsonb)) e WHERE p.cid IS NOT NULL) r
          LEFT JOIN LATERAL (SELECT * FROM graph.strategy_cited_object(p_tenant, p_domain, r.kind, r.id)) co ON true
      ) ev ON true
      -- the initiatives building it: active; resourced = an active resources alignment whose allocation a human authority approved (unexpired, on its digest)
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object('initiative_id', i.strategy_object_id, 'title', i.title, 'status', i.status, 'resourced', rs.ok, 'resources', rs.list) ORDER BY i.title) AS list,
               count(*) FILTER (WHERE i.status = 'active')::int AS active,
               count(*) FILTER (WHERE i.status = 'active' AND rs.ok)::int AS resourced
          FROM graph.alignments b
          JOIN graph.strategy_current i ON i.strategy_object_id = b.from_id
          LEFT JOIN LATERAL (
            SELECT coalesce(bool_or(al.ok), false) AS ok,
                   coalesce(jsonb_agg(jsonb_build_object('alignment_id', al.alignment_id, 'resource_id', al.from_id, 'title', al.title, 'allocation_act', al.act_id, 'allocation_approved', al.ok)), '[]'::jsonb) AS list
              FROM (SELECT ra.alignment_id, ra.from_id, rsc.title, act.act_id, coalesce(act.decision = 'approve' AND act.expires_at > p_at, false) AS ok
                      FROM graph.alignments ra
                      JOIN graph.strategy_current rsc ON rsc.strategy_object_id = ra.from_id AND rsc.status = 'active'
                      LEFT JOIN LATERAL (SELECT t.* FROM graph.strategy_authority_acts t WHERE t.act_kind = 'allocate_resource' AND t.subject_id = ra.alignment_id AND t.subject_digest = ra.digest
                                           AND t.recorded_at <= p_at AND (t.revoked_at IS NULL OR t.revoked_at > p_at) ORDER BY t.recorded_at DESC LIMIT 1) act ON true
                     WHERE ra.kind = 'resources' AND ra.to_id = i.strategy_object_id AND ra.state = 'active') al
          ) rs ON true
         WHERE p.cid IS NOT NULL AND b.kind = 'builds' AND b.to_id = p.cid AND b.state = 'active'
      ) ini ON true
      -- the objective's measures: approved at the instant and fresh
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object('measure_id', f.measure_id, 'title', f.title, 'approved', f.approved_now, 'approval_state', f.approval_state, 'state', f.state,
                                            'age_days', f.age_days, 'freshness_days', f.freshness_days, 'last_value', f.last_value, 'unit', f.unit, 'target_value', f.target_value) ORDER BY f.title) AS list,
               count(*)::int AS n, count(*) FILTER (WHERE f.approved_now)::int AS approved, count(*) FILTER (WHERE f.approved_now AND f.state = 'fresh')::int AS current
          FROM fr f WHERE p.oid = ANY (f.objective_ids)
      ) ms ON true
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object('kind', d.detection_kind, 'key', d.detection_key, 'continuity', d.continuity) ORDER BY d.detection_key) AS list
          FROM det d WHERE p.oid = ANY (d.subject_ids) OR (p.cid IS NOT NULL AND p.cid = ANY (d.subject_ids))
      ) hold ON true
  ), judged AS (
    SELECT r.*,
           (r.set_decision = 'approve' AND r.set_expires > p_at) AS c_set,
           (r.cid IS NOT NULL AND r.ev_n >= 2 AND graph.strategy_truth_rank(r.ev_best) >= 4) AS c_evidence,
           (r.ini_active > 0) AS c_ini,
           (r.ini_resourced > 0) AS c_res,
           (r.ms_current > 0) AS c_ms
      FROM rows r
  )
  SELECT j.oid, j.otitle, j.oowner, jsonb_build_object('kind', 'strategy', 'version', j.oversion, 'digest', j.odigest),
         jsonb_build_object('set', coalesce(j.c_set, false), 'act_id', j.set_act, 'decision', j.set_decision, 'expires_at', j.set_expires),
         j.cid, j.ctitle, j.alignment_id, j.strength, j.ev_n, j.ev_best, j.refs, j.ini_list, j.ini_active, j.ini_resourced, j.ms_list,
         jsonb_build_array(
           jsonb_build_object('criterion', 'objective_set', 'met', coalesce(j.c_set, false),
                              'basis', CASE WHEN coalesce(j.c_set, false) THEN format('set by act %s until %s', j.set_act, j.set_expires)
                                            WHEN j.set_act IS NULL THEN 'no human authority has set this objective version'
                                            WHEN j.set_decision = 'reject' THEN format('act %s rejected it', j.set_act) ELSE format('act %s expired at %s', j.set_act, j.set_expires) END),
           jsonb_build_object('criterion', 'capability_evidenced', 'met', j.c_evidence,
                              'basis', CASE WHEN j.cid IS NULL THEN 'no capability supports this objective'
                                            ELSE format('%s counted evidence ref(s), the strongest %s (the rule: at least 2, one observed or extracted)', j.ev_n, coalesce(j.ev_best, 'none')) END),
           jsonb_build_object('criterion', 'initiative_active', 'met', j.c_ini, 'basis', format('%s active initiative(s) build the capability', j.ini_active)),
           jsonb_build_object('criterion', 'initiative_resourced', 'met', j.c_res, 'basis', format('%s initiative(s) with an allocation approved by a human authority', j.ini_resourced)),
           jsonb_build_object('criterion', 'measure_current', 'met', j.c_ms,
                              'basis', format('%s measure(s): %s approved at the instant, %s approved and fresh', j.ms_n, j.ms_approved, j.ms_current))),
         (coalesce(j.c_set, false)::int + j.c_evidence::int + j.c_ini::int + j.c_res::int + j.c_ms::int),
         5,
         array_remove(ARRAY[
           CASE WHEN NOT coalesce(j.c_set, false) THEN 'objective_not_set' END,
           CASE WHEN j.cid IS NULL THEN 'no_capability' WHEN NOT j.c_evidence THEN 'capability_under_evidenced' END,
           CASE WHEN j.cid IS NOT NULL AND NOT j.c_ini THEN 'no_active_initiative' END,
           CASE WHEN j.cid IS NOT NULL AND j.c_ini AND NOT j.c_res THEN 'initiative_unresourced' END,
           CASE WHEN j.ms_n = 0 THEN 'no_measure' WHEN j.ms_approved = 0 THEN 'measure_unapproved' WHEN NOT j.c_ms THEN 'measure_stale' END,
           CASE WHEN jsonb_array_length(j.hold_list) > 0 THEN 'held_by_detection' END], NULL),
         j.hold_list,
         CASE WHEN jsonb_array_length(j.hold_list) > 0 THEN 'held'
              WHEN coalesce(j.c_set, false) AND j.c_evidence AND j.c_ini AND j.c_res AND j.c_ms THEN 'supported' ELSE 'gap' END,
         'alignment_rule@1: set by a human authority; the capability evidenced by at least 2 counted refs, one observed or extracted; an active initiative builds it; an allocation approved by a human authority resources it; an approved measure is fresh — each criterion shown, none averaged'::text
    FROM judged j
   ORDER BY (jsonb_array_length(j.hold_list) > 0) DESC,
            (coalesce(j.c_set, false)::int + j.c_evidence::int + j.c_ini::int + j.c_res::int + j.c_ms::int),
            j.otitle, j.ctitle NULLS FIRST, j.cid;
$$;
REVOKE ALL ON FUNCTION graph.alignment_gaps(uuid, uuid, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.alignment_gaps(uuid, uuid, uuid, timestamptz) TO eye_app, eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §S7 THE DETECTIONS RAISED ON A SCHEDULE AND ROUTED
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- The TABLE graph.strategy_detections (the 0089 READ of the same name keeps its role: "as of this read"; a function and a table share a
-- name without conflict). Each row is raised ONCE per (kind, subject, cause) by the tick and routed in the same call.
CREATE TABLE graph.strategy_detections (
  detection_id       uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  kind               text NOT NULL CHECK (kind IN ('stale_measure', 'gamed_measure', 'lost_linkage', 'owner_missing')),
  subject_id         uuid NOT NULL,
  subject_type       text NOT NULL,
  measure_id         uuid,
  cause_key          text NOT NULL,
  detail             text NOT NULL,
  owner_principal_id uuid,
  routed_item_id     uuid,
  routing            jsonb NOT NULL DEFAULT '{}'::jsonb,
  raised_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  raised_by          uuid NOT NULL,
  correlation_id     uuid NOT NULL,
  CONSTRAINT gsd_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT gsd_once UNIQUE (tenant_id, domain_id, kind, subject_id, cause_key)
);
CREATE INDEX gsd_subject ON graph.strategy_detections (tenant_id, domain_id, subject_id, raised_at DESC);
CREATE TRIGGER gsd_append_only BEFORE UPDATE OR DELETE ON graph.strategy_detections FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE graph.strategy_detections IS 'B36 (0094 §S7; F-P6-09 (c)): the Strategy Graph detections RAISED ON A SCHEDULE by the attention tick (step strategy-detections) — stale_measure, gamed_measure (an owner edit flagged on a favourable score change), lost_linkage (an approved measure measuring no active objective), owner_missing — each once per cause and ROUTED as an attention item of class strategy.detection to the object''s owner; append-only.';

-- THE TICK STEP: what the schedule finds at now that is not yet raised, each recorded and routed under the ACTIVE attention policy
-- (evaluated, routed to the owner and the class's roles, deprioritized when the policy says so — the queue's own rule, 0083 §5).
CREATE OR REPLACE FUNCTION graph.raise_strategy_detections(p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = graph, executive, decision, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_now timestamptz := clock_timestamp(); c record; pol executive.attention_policies%ROWTYPE; v_eval jsonb; v_route jsonb; v_state text; v_owner uuid; v_item uuid; v_det uuid;
        v_raised jsonb := '[]'::jsonb; v_title text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO pol FROM executive.attention_policies a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.state = 'active';
  FOR c IN
    -- STALE MEASURE: an approved, active measure never observed or older than its window (once per last observation)
    SELECT 'stale_measure'::text AS kind, f.measure_id AS subject_id, 'MSR'::text AS subject_type, f.measure_id, coalesce(f.last_observed_at::text, 'none') AS cause_key, f.owner_principal_id AS owner,
           CASE WHEN f.state = 'no_observation' THEN format('measure "%s" has no observation at %s (window %s day(s))', f.title, v_now, f.freshness_days)
                ELSE format('measure "%s" was last observed %s day(s) before %s (window %s day(s))', f.title, f.age_days, v_now, f.freshness_days) END AS detail,
           f.title
      FROM graph.measure_freshness(p_tenant, p_domain, v_now) f WHERE f.status = 'active' AND f.approved_now AND f.state <> 'fresh'
    UNION ALL
    -- LOST LINKAGE: an approved, active measure that measures no ACTIVE objective any more (its measures alignment retired or the objective closed)
    SELECT 'lost_linkage', f.measure_id, 'MSR', f.measure_id, 'v' || f.definition_version::text, f.owner_principal_id,
           format('measure "%s" (definition v%s) is approved but measures no active objective: its measures alignment is retired or the objective is no longer active', f.title, f.definition_version), f.title
      FROM graph.measure_freshness(p_tenant, p_domain, v_now) f
     WHERE f.status = 'active' AND f.approved_now
       AND NOT EXISTS (SELECT 1 FROM unnest(f.objective_ids) o JOIN graph.strategy_current s ON s.strategy_object_id = o AND s.status = 'active')
    UNION ALL
    -- OWNER MISSING: the 0089 read's missing_owner detection, routed to the planning review's first person
    SELECT 'owner_missing', d.subject_ids[1], (d.subjects -> 0 ->> 'type'), NULL::uuid, coalesce(d.subjects -> 0 ->> 'owner', 'none'), d.routed_to[1], d.detail, (d.subjects -> 0 ->> 'title')
      FROM graph.strategy_detections(p_tenant, p_domain, v_now) d WHERE d.detection_kind = 'missing_owner' AND d.state = 'open'
    UNION ALL
    -- GAMED MEASURE: an owner edit of a MEASURE input flagged on a favourable score change (§S5) — once per edit (the dimension's change
    -- named first, the aggregate's only when no dimension change flags it), routed to the measured objective's owner (accountable above the editor)
    SELECT 'gamed_measure', g.input_ref, 'MSR', g.input_ref, g.edit_id::text,
           (SELECT s.owner_principal_id FROM graph.measures m JOIN graph.strategy_current s ON s.strategy_object_id = m.objective_id WHERE m.measure_id = g.input_ref),
           format('the owner of measure "%s" restated it %s → %s at %s, inside the %s-day window before a favourable change of %s (score change %s)',
                  coalesce((SELECT s.title FROM graph.strategy_current s WHERE s.strategy_object_id = g.input_ref), g.input_ref::text), coalesce(g.from_value::text, 'none'), g.to_value, g.edited_at,
                  (SELECT x.owner_edit_window_days FROM executive.health_score_definitions x WHERE x.definition_id = g.definition_id), g.subject, g.change_id),
           coalesce((SELECT s.title FROM graph.strategy_current s WHERE s.strategy_object_id = g.input_ref), g.input_ref::text)
      FROM (SELECT DISTINCT ON (e.edit_id) e.edit_id, e.input_ref, e.from_value, e.to_value, e.edited_at, e.definition_id, ch.subject, ch.change_id
              FROM executive.health_input_edits e
              JOIN executive.health_score_changes ch ON ch.owner_edit_flag AND e.edit_id = ANY (ch.owner_edit_ids) AND ch.tenant_id = p_tenant AND ch.domain_id = p_domain
             WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.input_kind = 'measure'
             ORDER BY e.edit_id, (ch.subject = 'aggregate'), ch.raised_at) g
  LOOP
    IF c.subject_id IS NULL THEN CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM graph.strategy_detections x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.kind = c.kind AND x.subject_id = c.subject_id AND x.cause_key = c.cause_key) THEN CONTINUE; END IF;
    v_det := gen_random_uuid(); v_item := gen_random_uuid();
    v_title := left(format('%s: %s', replace(c.kind, '_', ' '), c.title), 512);
    -- THE ROUTING (the queue's rule, 0083 §5): the owner when an active human, the class's roles under the active policy
    v_owner := CASE WHEN c.owner IS NOT NULL AND decision.is_active_human(c.owner, p_tenant) THEN c.owner END;
    v_eval := executive.evaluate_attention(CASE WHEN pol.policy_id IS NULL THEN NULL ELSE pol.rules END, 'strategy.detection',
                                           jsonb_build_object('consequence', 'C2', 'confidence', 1, 'hours_to_window', NULL)) || jsonb_build_object('policy_version', pol.version);
    v_route := executive.attention_route(pol.rules, 'strategy.detection', v_eval ->> 'outcome', v_owner, p_tenant, p_domain);
    v_state := v_route ->> 'state';
    INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state,
                                           owner_principal_id, route_roles, policy_id, policy_version, evaluation, details, due_at, escalations, correlation_id)
    VALUES (v_item, 'DOMAIN', p_tenant, p_domain, 'strategy.detection', 'strategy_object', c.subject_id, v_det, 'StrategyDetectionRaised', v_title, v_eval ->> 'outcome', v_state,
            v_owner, ARRAY(SELECT jsonb_array_elements_text(v_route -> 'route_roles')), pol.policy_id, pol.version, v_eval,
            jsonb_build_object('detection_id', v_det, 'kind', c.kind, 'subject_id', c.subject_id, 'subject_type', c.subject_type, 'measure_id', c.measure_id, 'cause_key', c.cause_key, 'detail', c.detail, 'raised_at', v_now, 'by', 'the attention tick step strategy-detections'),
            (v_route ->> 'due_at')::timestamptz, (v_route ->> 'escalations')::int, p_correlation);
    PERFORM executive.attention_event(v_item, p_tenant, p_domain,
              CASE v_state WHEN 'open' THEN 'item.routed' WHEN 'escalated' THEN 'item.escalated' WHEN 'unrouted' THEN 'item.unrouted' ELSE 'item.deprioritized' END,
              p_actor, jsonb_build_object('outcome', v_eval ->> 'outcome', 'reasons', v_eval -> 'reasons', 'policy_version', pol.version, 'owner', v_owner, 'route_roles', v_route -> 'route_roles',
                                          'due_at', v_route -> 'due_at', 'cause_event_id', v_det, 'cause_event_type', 'StrategyDetectionRaised', 'unrouted', coalesce((v_route ->> 'unrouted')::boolean, false)), p_correlation);
    INSERT INTO graph.strategy_detections (detection_id, scope, tenant_id, domain_id, kind, subject_id, subject_type, measure_id, cause_key, detail, owner_principal_id, routed_item_id, routing, raised_at, raised_by, correlation_id)
    VALUES (v_det, 'DOMAIN', p_tenant, p_domain, c.kind, c.subject_id, c.subject_type, c.measure_id, c.cause_key, c.detail, v_owner, v_item,
            jsonb_build_object('state', v_state, 'outcome', v_eval ->> 'outcome', 'route_roles', v_route -> 'route_roles', 'policy_version', pol.version, 'due_at', v_route -> 'due_at'), v_now, p_actor, p_correlation);
    v_raised := v_raised || jsonb_build_object('detection_id', v_det, 'kind', c.kind, 'subject_id', c.subject_id, 'measure_id', c.measure_id, 'item_id', v_item, 'state', v_state, 'owner', v_owner);
  END LOOP;
  RETURN jsonb_build_object('raised_at', v_now, 'raised', v_raised, 'count', jsonb_array_length(v_raised), 'policy_version', pol.version);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.raise_strategy_detections(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.raise_strategy_detections(uuid, uuid, uuid, uuid) TO eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §S8 THE PLAN LINKS — read only when Part P's executive.initiatives exists; declared nowhere here
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION graph.strategy_plan_links(p_tenant uuid, p_domain uuid, p_objective uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, executive, pg_catalog, pg_temp AS $$
DECLARE v jsonb;
BEGIN
  IF to_regclass('executive.initiatives') IS NULL THEN
    RETURN jsonb_build_object('available', false, 'reason', 'no planning objects in this deployment (executive.initiatives is not declared)', 'initiatives', '[]'::jsonb);
  END IF;
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.initiative_id), ''[]''::jsonb) FROM executive.initiatives i WHERE i.tenant_id = $1 AND i.domain_id = $2 AND (%s)',
                 CASE WHEN p_objective IS NULL THEN 'true' ELSE 'i.objective_id = $3' END)
     INTO v USING p_tenant, p_domain, p_objective;
  RETURN jsonb_build_object('available', true, 'initiatives', v);
END $$;
GRANT EXECUTE ON FUNCTION graph.strategy_plan_links(uuid, uuid, uuid) TO eye_app, eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §S9 RLS AND THE GRANTS (the 0081 loop idiom; the ports write)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['health_inputs', 'health_input_edits', 'health_exceptions', 'health_snapshot_approvals'] LOOP
    EXECUTE format('REVOKE ALL ON executive.%I FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE executive.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE executive.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY executive_isolation ON executive.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON executive.%I TO eye_app, eye_commit', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['strategy_detections'] LOOP
    EXECUTE format('REVOKE ALL ON graph.%I FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE graph.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE graph.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY graph_isolation ON graph.%I
        USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()))$f$, t);
    EXECUTE format('GRANT SELECT ON graph.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;
