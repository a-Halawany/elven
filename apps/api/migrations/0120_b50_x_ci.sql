-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0120 §CI — CP-6 B50: IMPACT TRAVERSAL, TRIGGERS AND AFFECTED-PRODUCT CLASSES (F-P3-05's reach: V03-T-294, V03-T-304, ES-30-003,
-- AI-27-005, AI-43-005, DP-24-001, DAT-OP-10; F-P3-03: V03-T-203, AI-06-004, AI-29-005; re-verified: V02-T-129, V03-T-028, DAT-SM-08).
-- Part-local file (folded into the one 0120 at integration, after §0, §HD, §LC, §PV); applies ALONE on 0001–0119 + the prelude (0120 §0).
--
-- THE GAP. The walk (graph/strategy/impact.service.ts, walker 1.0.0) reached assumptions, objectives, decisions, commitments, forecasts,
-- scenarios, warnings, twins, simulations, briefings, memory items and the B32 strategy nodes — and stopped there: a DECISION PACKAGE whose
-- option cites the corrected evidence, a PUBLICATION that published a briefing resting on it, an EXPORT PACKAGE that shipped its manifest
-- and the EVALUATION DATASETS (backtests, frozen information sets, method validations) and LESSONS learned on it were not in the answer. Each
-- reached object was listed, never CLASSED: nothing said which conclusions may no longer be safe, which need a governed re-run, which wait
-- for their owner, which are already current. And only corrections, withdrawals, edge retractions and entity splits opened a walk: a legal
-- request, a model incident, an ontology correction, a data-quality finding, a rights change, an integrity failure or a human challenge had
-- no way in.
--
-- THE MECHANISM.
-- (CI.1) THE TRIGGERS: graph.invalidations_current.trigger_kind widened (the CHECK copied whole from 0025:49) with the seven kinds; one
--   SEEDING PORT per kind (graph.seed_<kind>) — the named steward's act (the role re-checked in the port, a human, the acting principal the
--   session's) on one object of the domain with its reason and its kind's basis (the request, the method, the ontology version, the finding,
--   the source's rights state, the manifest, the challenge) — records graph.impact_triggers (state recorded). THE WALK IS THE AGENT'S: the
--   domain's propagation agent (0060) walks a recorded trigger automatically through its own session and the same governed path as a
--   correction's walk (impact_trigger_receive under the schedule capability, then impact_trigger_begin / _done inside the walk's transaction
--   under graph.impact.propagate, the agent's principal only), and a refused or failed walk is recorded on the trigger
--   (impact_trigger_fail) with its reason; impact_triggers_to_walk lists what a cold process re-drives. Never an operator-only walk.
-- (CI.2) THE WALK'S NEW BUCKETS read through ONE relation, graph.walk_product_citations (security_invoker: the caller's RLS): a decision
--   package VERSION by its options' consequence citations and by the DEC it is for; a publication VERSION by its source (a briefing, or a
--   report = a decision package); an export package by the evidence of each manifest its approved scope executed (retention.scope_items);
--   a frozen information set by the evidence versions it froze and the forecast that pins it; a backtest and a method validation by the
--   series (and, for a model incident, the method) they validated; a lesson by the package and the memory item it was learned into.
-- (CI.3) THE CLASSES: graph.affected_class_rules — the VERSIONED classification rule (affected-class@1, its digest; read-only, a new version
--   is a migration and a new walker); graph.affected_products — one APPEND-ONLY row per product an assessed walk reached, with its bucket, its
--   class (current | stale | challenged | withdrawn | recompute | human_review), the rule version, the FACTS the class was derived from
--   (read from the database at record time, never taken from the caller), the accountable owner, the reach and the path. graph.record_impact
--   (re-declared whole from 0089 §G8) writes them for every bucket (the existing and the new) in the walk's own transaction.
--   graph.case_affected_products is the STABLE READ §CL closes against: per correction case, the products of the latest walk of each root.
--
-- THE PRINCIPLES. The walk reports; it does not decide: recompute is a governed re-run REQUEST to the owner (closed by their act — §CL),
-- human_review the owner's acknowledgement, and no decision, commitment, forecast, briefing, publication or export is rewritten here. THREE
-- CLAIMS: construction (this file, its harness phase6-impact-b50); demonstrated operation (the act, SYNTHETIC); real acceptance never claimed.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- ─── §CI.1 THE TRIGGER VOCABULARY — the CHECK copied whole from 0025:49, the seven B50 kinds added ───────────────────────────────────────
ALTER TABLE graph.invalidations_current
  DROP CONSTRAINT invalidations_current_trigger_kind_check;
ALTER TABLE graph.invalidations_current
  ADD CONSTRAINT invalidations_current_trigger_kind_check
  CHECK (trigger_kind IN (
    'claim_correction', 'claim_withdrawal', 'edge_retraction',
    'entity_split', 'evidence_correction', 'manual',
    -- B50 ci: the seven triggers (V03-T-304, AI-29-005), each seeded by its own port (§CI.4)
    'legal_request', 'model_incident', 'ontology_correction', 'data_quality_finding', 'rights_change', 'integrity_failure', 'human_challenge'));

-- ─── §CI.2 THE VERSIONED CLASSIFICATION RULE ─────────────────────────────────────────────────────────────────────────────────────────────
-- A rule names its precedence (the facts that override the kind's class, in order) and the class of each product kind. Seeded once; a
-- changed rule is a NEW version (a migration — the walker's method names the rule version, so a new rule is a new walker, 0060's discipline).
CREATE TABLE graph.affected_class_rules (
  rule_version  text PRIMARY KEY CHECK (rule_version ~ '^affected-class@[0-9]+$'),
  rule          jsonb NOT NULL CHECK (jsonb_typeof(rule) = 'object' AND jsonb_typeof(rule -> 'precedence') = 'array' AND jsonb_typeof(rule -> 'kinds') = 'object'),
  rule_digest   text NOT NULL CHECK (rule_digest ~ '^[0-9a-f]{64}$'),
  statement     text NOT NULL CHECK (length(btrim(statement)) >= 16),
  active        boolean NOT NULL,
  declared_at   timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX gacr_one_active ON graph.affected_class_rules (active) WHERE active;
CREATE TRIGGER gacr_append_only BEFORE UPDATE OR DELETE ON graph.affected_class_rules FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
INSERT INTO graph.affected_class_rules (rule_version, rule, rule_digest, statement, active)
SELECT 'affected-class@1', r, encode(sha256(convert_to(r::text, 'UTF8')), 'hex'),
       'B50 (0120 §CI): withdrawn products first, then products under an open challenge, then products that already reflect the change (current); otherwise the kind''s class — a derived product is recomputed (a governed re-run request to its owner), a published or cited view is stale, a person''s decision, commitment, memory or package is the owner''s review.',
       true
  FROM (SELECT jsonb_build_object(
          'precedence', jsonb_build_array(
            jsonb_build_object('fact', 'withdrawn', 'class', 'withdrawn'),
            jsonb_build_object('fact', 'challenged', 'class', 'challenged'),
            jsonb_build_object('fact', 'current', 'class', 'current')),
          'kinds', jsonb_build_object(
            'claim', 'stale', 'entity', 'stale', 'edge', 'stale',
            'assumption', 'human_review', 'objective', 'human_review', 'decision', 'human_review', 'commitment', 'human_review', 'strategy_node', 'human_review',
            'forecast', 'recompute', 'twin', 'recompute', 'simulation', 'recompute',
            'scenario', 'stale', 'warning', 'stale', 'briefing', 'stale', 'publication', 'stale',
            'memory_item', 'human_review', 'decision_package', 'human_review', 'lesson', 'human_review',
            'export_package', 'recompute', 'information_set', 'recompute', 'backtest', 'recompute', 'method_validation', 'recompute'),
          'fallback', 'human_review') AS r) x;
ALTER TABLE graph.affected_class_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph.affected_class_rules FORCE ROW LEVEL SECURITY;
CREATE POLICY gacr_visible ON graph.affected_class_rules FOR SELECT TO eye_app, eye_commit USING (true);
REVOKE ALL ON graph.affected_class_rules FROM PUBLIC;
GRANT SELECT ON graph.affected_class_rules TO eye_app, eye_commit;
COMMENT ON TABLE graph.affected_class_rules IS 'B50 §CI (0120; AI-06-004): the VERSIONED rule that classes every product a walk reached — current, stale, challenged, withdrawn, recompute, human_review. The precedence (withdrawn, challenged, current) overrides the kind''s class. Read-only: a new rule is a new version (a migration) and a new walker.';

-- THE CLASS of one product under a rule, from its facts (pure: the same rule and facts give the same class).
CREATE OR REPLACE FUNCTION graph.classify_affected(p_rule jsonb, p_kind text, p_facts jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE p jsonb;
BEGIN
  FOR p IN SELECT * FROM jsonb_array_elements(coalesce(p_rule -> 'precedence', '[]'::jsonb)) LOOP
    IF coalesce((p_facts ->> (p ->> 'fact'))::boolean, false) THEN RETURN p ->> 'class'; END IF;
  END LOOP;
  RETURN coalesce(p_rule -> 'kinds' ->> p_kind, p_rule ->> 'fallback', 'human_review');
END $$;
REVOKE ALL ON FUNCTION graph.classify_affected(jsonb, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.classify_affected(jsonb, text, jsonb) TO eye_app, eye_commit;

-- ─── §CI.3 THE AFFECTED PRODUCTS (append-only; one row per product an assessed walk reached) ─────────────────────────────────────────────
CREATE TABLE graph.affected_products (
  affected_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  invalidation_id    uuid NOT NULL REFERENCES graph.invalidations_current (invalidation_id),
  correction_case_id uuid,
  trigger_kind       text NOT NULL,
  trigger_object_id  uuid NOT NULL,
  bucket             text NOT NULL CHECK (bucket IN ('assumptions', 'objectives', 'decisions', 'commitments', 'strategy_nodes', 'forecasts', 'scenarios', 'warnings',
                       'twins', 'simulations', 'briefings', 'memory_items', 'graph_state', 'decision_packages', 'publications', 'export_packages', 'evaluation_datasets', 'lessons')),
  product_kind       text NOT NULL CHECK (product_kind IN ('claim', 'entity', 'edge', 'assumption', 'objective', 'decision', 'commitment', 'strategy_node', 'forecast', 'scenario',
                       'warning', 'twin', 'simulation', 'briefing', 'memory_item', 'decision_package', 'publication', 'export_package', 'information_set', 'backtest',
                       'method_validation', 'lesson')),
  object_type        text NOT NULL CHECK (object_type ~ '^[A-Z]{3}$|^[a-z][a-z_]{2,40}$'),
  product_id         uuid NOT NULL,
  product_version    int CHECK (product_version IS NULL OR product_version >= 1),
  product_ref        text NOT NULL,
  title              text NOT NULL,
  class              text NOT NULL CHECK (class IN ('current', 'stale', 'challenged', 'withdrawn', 'recompute', 'human_review')),
  rule_version       text NOT NULL REFERENCES graph.affected_class_rules (rule_version),
  facts              jsonb NOT NULL CHECK (jsonb_typeof(facts) = 'object'),
  owner_principal_id uuid,
  reached_via        text NOT NULL,
  hop                int NOT NULL CHECK (hop >= 0),
  path               jsonb NOT NULL CHECK (jsonb_typeof(path) = 'array'),
  recorded_by        uuid NOT NULL,
  recorded_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT gap_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT gap_once UNIQUE NULLS NOT DISTINCT (invalidation_id, product_kind, product_id, product_version)
);
CREATE INDEX gap_case ON graph.affected_products (correction_case_id, recorded_at) WHERE correction_case_id IS NOT NULL;
CREATE INDEX gap_product ON graph.affected_products (tenant_id, domain_id, product_id, recorded_at DESC);
CREATE TRIGGER gap_append_only BEFORE UPDATE OR DELETE ON graph.affected_products FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
ALTER TABLE graph.affected_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph.affected_products FORCE ROW LEVEL SECURITY;
CREATE POLICY graph_isolation ON graph.affected_products
  USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
REVOKE ALL ON graph.affected_products FROM PUBLIC;
GRANT SELECT ON graph.affected_products TO eye_app, eye_commit;
COMMENT ON TABLE graph.affected_products IS 'B50 §CI (0120; AI-06-004, V03-T-203, V03-T-294, ES-30-003, DAT-OP-10): every product an assessed walk reached, CLASSED under the versioned rule from facts the database read at record time (withdrawn, challenged, current, the kind) — with its bucket, its accountable owner, how it was reached and the path from the changed object. Append-only: a later walk records its own rows; the latest walk of a root is the answer (graph.case_affected_products).';

/*
 * THE STABLE READ §CL CLOSES AGAINST (security_invoker: the caller's RLS): per correction case, the products of the LATEST assessed walk of
 * each corrected root (a re-walk of a root supersedes its earlier rows; another root's rows stand). Columns are the contract:
 *   case_id, invalidation_id, root (the trigger object), affected_id, bucket, product_kind, object_type, product_id, product_version,
 *   product_ref, title, class, rule_version, owner_principal_id, reached_via, hop, path, facts, recorded_at.
 * A material product is one whose class is not `current`.
 */
CREATE VIEW graph.case_affected_products WITH (security_invoker = true) AS
  SELECT a.correction_case_id AS case_id, a.invalidation_id, a.trigger_object_id AS root, a.affected_id, a.bucket, a.product_kind, a.object_type,
         a.product_id, a.product_version, a.product_ref, a.title, a.class, a.rule_version, a.owner_principal_id, a.reached_via, a.hop, a.path,
         a.facts, a.recorded_at, a.tenant_id, a.domain_id
    FROM graph.affected_products a
   WHERE a.correction_case_id IS NOT NULL
     AND a.invalidation_id = (SELECT i.invalidation_id FROM graph.invalidations_current i
                               WHERE i.correction_case_id = a.correction_case_id AND i.trigger_object_id = a.trigger_object_id AND i.state = 'assessed'
                               ORDER BY i.assessed_at DESC, i.invalidation_id DESC LIMIT 1);
REVOKE ALL ON graph.case_affected_products FROM PUBLIC;
GRANT SELECT ON graph.case_affected_products TO eye_app, eye_commit;
COMMENT ON VIEW graph.case_affected_products IS 'B50 §CI (0120): THE STABLE READ for §CL — per correction case, the classed products of the latest assessed walk of each corrected root. A material product is one whose class is not current.';

-- ─── §CI.4 THE WALK'S NEW BUCKETS, as one relation the walk reads (security_invoker: every underlying table's RLS applies to the caller) ──
-- One row per (product, what it cites). cites_kind follows graph.dependencies' vocabulary where it can (claim, evidence, forecast, warning,
-- run, assumption — an option's consequence kinds — and strategy for the DEC a package is for), plus briefing / decision_package /
-- memory_item / backtest (product to product) and series / method (cites_ref: the key an evaluation record validated). subject_ref is the
-- series the product itself is about (an information set, a backtest, a validation) — a reached one widens the walk to the series' other
-- evaluation records.
CREATE VIEW graph.walk_product_citations WITH (security_invoker = true) AS
  SELECT 'decision_package'::text AS product_kind, 'DPK'::text AS object_type, o.package_id AS product_id, o.version AS product_version,
         (c ->> 'kind') AS cites_kind, (c ->> 'id')::uuid AS cites_id, NULL::text AS cites_ref, (c ->> 'version')::int AS cited_version,
         p.title, p.owner_principal_id, v.known_at AS product_at, NULL::text AS subject_ref, o.tenant_id, o.domain_id
    FROM decision.options o
    JOIN decision.package_versions v ON v.package_id = o.package_id AND v.version = o.version
    JOIN decision.packages_current p ON p.package_id = o.package_id
    CROSS JOIN LATERAL jsonb_array_elements(o.consequences) c
  UNION ALL
  SELECT 'decision_package', 'DPK', v.package_id, v.version, 'strategy', p.decision_object_id, NULL, NULL, p.title, p.owner_principal_id, v.known_at, NULL, v.tenant_id, v.domain_id
    FROM decision.package_versions v JOIN decision.packages_current p ON p.package_id = v.package_id
  UNION ALL
  SELECT 'publication', 'PUB', pv.publication_id, pv.version, CASE pv.source_kind WHEN 'briefing' THEN 'briefing' ELSE 'decision_package' END, pv.source_id, NULL, pv.source_version,
         pb.title, pv.drafted_by, pv.drafted_at, NULL, pv.tenant_id, pv.domain_id
    FROM executive.publication_versions pv JOIN executive.publications pb ON pb.publication_id = pv.publication_id
  UNION ALL
  SELECT 'export_package', 'export_package', x.action_id, NULL, 'evidence', e.object_id, si.ref, e.object_version,
         'export package ' || x.action_id::text || ' (' || x.object_count || ' object(s))', x.built_by, x.built_at, NULL, x.tenant_id, x.domain_id
    FROM retention.export_packages x
    JOIN retention.scope_items si ON si.action_id = x.action_id AND si.item_kind = 'manifest' AND si.disposition = 'execute'
    JOIN (SELECT o.object_id, o.object_version, o.tenant_id, o.domain_id, o.payload ->> 'manifest_id' AS manifest_id
            FROM objects.canonical_objects o WHERE o.object_type = 'EVD' AND o.payload ? 'manifest_id') e
      ON e.manifest_id = si.ref AND e.tenant_id = x.tenant_id AND e.domain_id = x.domain_id
  UNION ALL
  SELECT 'information_set', 'information_set', s.information_set_id, NULL, 'evidence', (ev ->> 'evidence_object_id')::uuid, NULL, (ev ->> 'evidence_version')::int,
         'information set for ' || s.series_key || ' known at ' || to_char(s.known_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), s.frozen_by, s.frozen_at, s.series_key, s.tenant_id, s.domain_id
    FROM prediction.information_sets s CROSS JOIN LATERAL jsonb_array_elements(s.evidence) ev
   WHERE ev ? 'evidence_object_id'
  UNION ALL
  SELECT 'information_set', 'information_set', s.information_set_id, NULL, 'forecast', f.forecast_id, NULL, NULL,
         'information set for ' || s.series_key || ' known at ' || to_char(s.known_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), s.frozen_by, s.frozen_at, s.series_key, s.tenant_id, s.domain_id
    FROM prediction.forecasts_current f JOIN prediction.information_sets s ON s.information_set_id = f.information_set_id
  UNION ALL
  SELECT 'backtest', 'backtest', b.backtest_id, NULL, 'series', NULL, b.series_key, NULL,
         'backtest of ' || b.method || ' on ' || b.series_key || ' (' || b.horizon_code || ')', b.computed_by, b.computed_at, b.series_key, b.tenant_id, b.domain_id
    FROM prediction.backtests b
  UNION ALL
  SELECT 'backtest', 'backtest', b.backtest_id, NULL, 'method', NULL, b.method, NULL,
         'backtest of ' || b.method || ' on ' || b.series_key || ' (' || b.horizon_code || ')', b.computed_by, b.computed_at, b.series_key, b.tenant_id, b.domain_id
    FROM prediction.backtests b
  UNION ALL
  SELECT 'method_validation', 'method_validation', m.validation_id, NULL, k.kind, k.id, k.ref, NULL,
         'validation of ' || m.method_ref || ' on ' || m.series_key || ' (' || m.horizon_code || ')', m.computed_by, m.computed_at, m.series_key, m.tenant_id, m.domain_id
    FROM prediction.method_validations m
    CROSS JOIN LATERAL (VALUES ('series'::text, NULL::uuid, m.series_key), ('method', NULL, m.method_ref), ('backtest', m.backtest_id, NULL)) k(kind, id, ref)
  UNION ALL
  SELECT 'lesson', 'lesson', l.lesson_id, NULL, k.kind, k.id, NULL, k.version, l.title, l.linked_by, l.linked_at, NULL, l.tenant_id, l.domain_id
    FROM decision.lessons l
    CROSS JOIN LATERAL (VALUES ('decision_package'::text, l.package_id, NULL::int), ('memory_item', l.memory_item_id, l.memory_version)) k(kind, id, version);
REVOKE ALL ON graph.walk_product_citations FROM PUBLIC;
GRANT SELECT ON graph.walk_product_citations TO eye_app, eye_commit;
COMMENT ON VIEW graph.walk_product_citations IS 'B50 §CI (0120; V03-T-294, ES-30-003, AI-27-005, DP-24-001, DAT-OP-10): the products the walk reaches beyond graph.dependencies — decision package versions (option citations, the DEC), publication versions (their source), export packages (each executed manifest''s evidence), frozen information sets, backtests, method validations (the series and the method they validated) and lessons — one row per (product, what it cites), read as the caller (security_invoker).';

-- ─── §CI.5 THE TRIGGERS' LEDGER (the seven B50 kinds; the walk is the propagation agent's) ─────────────────────────────────────────────────
-- One row per recorded trigger: the object it names (its type, id and the version recorded then), the steward's reason and the kind's basis,
-- the walk's state (recorded → walking → walked | failed; a failed trigger is re-driven) and the invalidation it produced. Only the ports
-- below write it; the events are append-only. A human_challenge is OPEN until the deciding person closes it (closed_*: never its opener).
CREATE TABLE graph.impact_triggers (
  trigger_id      uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  trigger_kind    text NOT NULL CHECK (trigger_kind IN ('legal_request', 'model_incident', 'ontology_correction', 'data_quality_finding', 'rights_change', 'integrity_failure', 'human_challenge')),
  object_type     text NOT NULL CHECK (object_type ~ '^[A-Z]{3}$'),
  object_id       uuid NOT NULL,
  object_version  int CHECK (object_version IS NULL OR object_version >= 1),
  reason          text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  basis           jsonb NOT NULL CHECK (jsonb_typeof(basis) = 'object'),
  recorded_by     uuid NOT NULL,
  recorded_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  state           text NOT NULL DEFAULT 'recorded' CHECK (state IN ('recorded', 'walking', 'walked', 'failed')),
  attempts        int NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  agent_id        uuid,
  last_error      text,
  invalidation_id uuid,
  walked_at       timestamptz,
  closed_by       uuid,
  closed_at       timestamptz,
  close_reason    text,
  correlation_id  uuid NOT NULL,
  CONSTRAINT git_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT git_walked CHECK ((state = 'walked') = (invalidation_id IS NOT NULL AND walked_at IS NOT NULL)),
  CONSTRAINT git_closed CHECK ((closed_at IS NULL) = (closed_by IS NULL) AND (closed_at IS NULL) = (close_reason IS NULL) AND (closed_at IS NULL OR trigger_kind = 'human_challenge'))
);
CREATE INDEX git_domain_state ON graph.impact_triggers (tenant_id, domain_id, state, recorded_at);
CREATE INDEX git_object ON graph.impact_triggers (object_id, trigger_kind);
CREATE TABLE graph.impact_trigger_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  trigger_id         uuid NOT NULL REFERENCES graph.impact_triggers (trigger_id),
  event              text NOT NULL CHECK (event IN ('trigger.recorded', 'trigger.received', 'trigger.walking', 'trigger.walked', 'trigger.failed', 'trigger.closed')),
  actor_principal_id uuid,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT gite_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX gite_trigger ON graph.impact_trigger_events (trigger_id, occurred_at);
CREATE TRIGGER gite_append_only BEFORE UPDATE OR DELETE ON graph.impact_trigger_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
-- The ledger row takes only the ports' transitions; its identity never moves.
CREATE OR REPLACE FUNCTION graph.impact_triggers_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'table graph.impact_triggers is append-only (ADR-P0-07): DELETE prohibited' USING ERRCODE = '42501'; END IF;
  IF NEW.trigger_id IS DISTINCT FROM OLD.trigger_id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.domain_id IS DISTINCT FROM OLD.domain_id
     OR NEW.trigger_kind IS DISTINCT FROM OLD.trigger_kind OR NEW.object_type IS DISTINCT FROM OLD.object_type OR NEW.object_id IS DISTINCT FROM OLD.object_id
     OR NEW.object_version IS DISTINCT FROM OLD.object_version OR NEW.reason IS DISTINCT FROM OLD.reason OR NEW.basis IS DISTINCT FROM OLD.basis
     OR NEW.recorded_by IS DISTINCT FROM OLD.recorded_by OR NEW.recorded_at IS DISTINCT FROM OLD.recorded_at OR NEW.correlation_id IS DISTINCT FROM OLD.correlation_id
     OR (OLD.state = 'walked' AND (NEW.state IS DISTINCT FROM 'walked' OR NEW.invalidation_id IS DISTINCT FROM OLD.invalidation_id))
     OR (OLD.closed_at IS NOT NULL AND (NEW.closed_at IS DISTINCT FROM OLD.closed_at OR NEW.closed_by IS DISTINCT FROM OLD.closed_by)) THEN
    RAISE EXCEPTION 'an impact trigger''s record does not change; only its walk''s state moves (once walked, it stays walked) and a challenge closes once' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER git_guard BEFORE UPDATE OR DELETE ON graph.impact_triggers FOR EACH ROW EXECUTE FUNCTION graph.impact_triggers_guard();
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['impact_triggers', 'impact_trigger_events'] LOOP
    EXECUTE format('ALTER TABLE graph.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE graph.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$CREATE POLICY graph_isolation ON graph.%I USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()))$f$, t);
    EXECUTE format('REVOKE ALL ON graph.%I FROM PUBLIC', t);
    EXECUTE format('GRANT SELECT ON graph.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;
COMMENT ON TABLE graph.impact_triggers IS 'B50 §CI (0120; V03-T-304, AI-29-005): the seven B50 impact triggers — legal request, model incident, ontology correction, data-quality finding, rights change, integrity failure, human challenge — each recorded by its steward''s port on one object of the domain with its reason and basis, and WALKED BY THE DOMAIN''S PROPAGATION AGENT (0060) automatically; a refused or failed walk is recorded with its reason and re-driven.';

-- ─── §CI.6 THE FACTS a class is derived from (read from the database at record time; never the caller's) ─────────────────────────────────
-- THE OPEN-CHALLENGE QUESTION (a seam: §PV's graph.knowledge_challenges joins it at integration — the integrator re-declares this stub
-- WHOLE adding that table). Today: an open simulation challenge on a run (0081), an unresolved package challenge on a version (0094), and an
-- unwalked or walked human_challenge trigger on the object not yet closed (§CI.5) — a challenge is open until the deciding person's act closes it (§PV).
CREATE OR REPLACE FUNCTION graph._open_challenge(p_tenant uuid, p_domain uuid, p_kind text, p_id uuid, p_version int) RETURNS boolean
LANGUAGE sql STABLE SET search_path = graph, pg_catalog, pg_temp AS $$
  SELECT (p_kind = 'simulation' AND EXISTS (SELECT 1 FROM simulation.challenges c WHERE c.run_id = p_id AND c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.state IN ('open', 'rerun_requested')))
      OR (p_kind = 'decision_package' AND EXISTS (SELECT 1 FROM decision.challenges c WHERE c.package_id = p_id AND (p_version IS NULL OR c.version = p_version) AND c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.resolved_at IS NULL))
      OR EXISTS (SELECT 1 FROM graph.impact_triggers t WHERE t.object_id = p_id AND t.tenant_id = p_tenant AND t.domain_id = p_domain AND t.trigger_kind = 'human_challenge' AND t.closed_at IS NULL);
$$;
REVOKE ALL ON FUNCTION graph._open_challenge(uuid, uuid, text, uuid, int) FROM PUBLIC;

/*
 * The facts of one product: exists (it resolves in this tenant and domain), withdrawn, challenged, current (it already reflects the change),
 * the owner, the title, the version. "Current" is asked only of a CORRECTION (evidence_correction, claim_correction, claim_withdrawal — the
 * kinds that record a new version of the changed object): a product that took its input after the change, or cites the changed object at its
 * latest version, is current. A trigger of the other kinds (a finding about the object as it is) leaves nothing current.
 */
CREATE OR REPLACE FUNCTION graph.affected_facts(p_tenant uuid, p_domain uuid, p_kind text, p_id uuid, p_version int, p_trigger_kind text, p_trigger uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = graph, pg_catalog, pg_temp AS $$
DECLARE
  v_corr boolean := p_trigger_kind IN ('evidence_correction', 'claim_correction', 'claim_withdrawal');
  t record; r record; v_exists boolean := false; v_withdrawn boolean := false; v_current boolean := false; v_owner uuid; v_title text; v_state text; v_version int := p_version;
BEGIN
  -- the changed object's latest version (a canonical object; an entity or edge trigger has none)
  SELECT o.object_version, o.recorded_at, o.content_digest, o.object_type, o.payload ->> 'manifest_id' AS manifest_id INTO t
    FROM objects.canonical_objects o WHERE o.object_id = p_trigger AND o.tenant_id = p_tenant AND o.domain_id = p_domain ORDER BY o.object_version DESC LIMIT 1;
  IF p_kind IN ('assumption', 'objective', 'decision', 'commitment', 'strategy_node') THEN
    SELECT s.title, s.status, s.owner_principal_id, s.object_version INTO r FROM graph.strategy_current s WHERE s.strategy_object_id = p_id AND s.tenant_id = p_tenant AND s.domain_id = p_domain;
    v_exists := FOUND; v_title := r.title; v_state := r.status; v_owner := r.owner_principal_id; v_withdrawn := r.status = 'withdrawn'; v_version := coalesce(v_version, r.object_version);
  ELSIF p_kind = 'forecast' THEN
    SELECT f.series_key || ' · ' || f.horizon_code || ' · ' || f.method AS title, f.state, f.issued_by INTO r FROM prediction.forecasts_current f WHERE f.forecast_id = p_id AND f.tenant_id = p_tenant AND f.domain_id = p_domain;
    v_exists := FOUND; v_title := r.title; v_state := r.state; v_owner := r.issued_by; v_withdrawn := r.state = 'withdrawn';
  ELSIF p_kind = 'scenario' THEN
    SELECT s.title, s.state, s.owner_principal_id, s.current_version INTO r FROM prediction.scenarios_current s WHERE s.scenario_id = p_id AND s.tenant_id = p_tenant AND s.domain_id = p_domain;
    v_exists := FOUND; v_title := r.title; v_state := r.state; v_owner := r.owner_principal_id; v_withdrawn := r.state = 'retired'; v_version := coalesce(v_version, r.current_version);
  ELSIF p_kind = 'warning' THEN
    SELECT w.title, w.state, w.routed_to INTO r FROM prediction.warnings_current w WHERE w.warning_id = p_id AND w.tenant_id = p_tenant AND w.domain_id = p_domain;
    v_exists := FOUND; v_title := r.title; v_state := r.state; v_owner := r.routed_to;
  ELSIF p_kind = 'twin' THEN
    SELECT w.title, w.owner_principal_id INTO r FROM twin.twins_current w WHERE w.twin_id = p_id AND w.tenant_id = p_tenant AND w.domain_id = p_domain;
    v_exists := FOUND; v_title := r.title; v_owner := r.owner_principal_id;
  ELSIF p_kind = 'simulation' THEN
    SELECT s.run_kind || ' run on twin version ' || s.twin_version AS title, s.state, s.validity, s.operator_principal_id INTO r FROM simulation.runs_current s WHERE s.run_id = p_id AND s.tenant_id = p_tenant AND s.domain_id = p_domain;
    v_exists := FOUND; v_title := r.title; v_state := r.state; v_owner := r.operator_principal_id; v_withdrawn := r.validity = 'invalidated';
  ELSIF p_kind = 'briefing' THEN
    SELECT b.known_at, b.composed_at, b.composed_by INTO r FROM executive.briefings b WHERE b.briefing_id = p_id AND b.tenant_id = p_tenant AND b.domain_id = p_domain;
    v_exists := FOUND; v_owner := r.composed_by; v_title := 'briefing composed ' || to_char(r.composed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
    v_current := v_corr AND v_exists AND NOT EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = p_trigger AND o.recorded_at > r.known_at);
  ELSIF p_kind = 'memory_item' THEN
    SELECT m.title, m.state, m.owner_principal_id, m.recorded_at, m.object_version INTO r FROM memory.items_current m WHERE m.item_id = p_id AND m.tenant_id = p_tenant AND m.domain_id = p_domain;
    v_exists := FOUND; v_title := r.title; v_state := r.state; v_owner := r.owner_principal_id; v_withdrawn := r.state = 'withdrawn'; v_version := coalesce(v_version, r.object_version);
    v_current := v_corr AND v_exists AND NOT EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = p_trigger AND o.recorded_at > r.recorded_at);
  ELSIF p_kind = 'claim' THEN
    SELECT o.object_type, o.lifecycle_state, o.object_version INTO r FROM objects.canonical_objects o WHERE o.object_id = p_id AND o.tenant_id = p_tenant AND o.domain_id = p_domain ORDER BY o.object_version DESC LIMIT 1;
    v_exists := FOUND; v_title := r.object_type || ' ' || p_id::text; v_state := r.lifecycle_state; v_withdrawn := r.lifecycle_state IN ('withdrawn', 'deleted'); v_version := coalesce(v_version, r.object_version);
    -- current: the corrected claim itself, or a claim whose latest lineage was derived from the corrected evidence's latest version
    v_current := v_corr AND v_exists AND (p_id = p_trigger
                 OR (t.object_type = 'EVD' AND EXISTS (SELECT 1 FROM intelligence.claim_lineage l WHERE l.claim_object_id = p_id AND l.claim_version = r.object_version
                                                          AND l.evidence_object_id = p_trigger AND l.evidence_digest = t.content_digest)));
  ELSIF p_kind = 'entity' THEN
    SELECT e.canonical_name, e.lifecycle_state INTO r FROM graph.entities_current e WHERE e.entity_id = p_id AND e.tenant_id = p_tenant AND e.domain_id = p_domain;
    v_exists := FOUND; v_title := r.canonical_name; v_state := r.lifecycle_state; v_withdrawn := r.lifecycle_state = 'retired';
  ELSIF p_kind = 'edge' THEN
    SELECT e.predicate, e.state, e.retracted_at INTO r FROM graph.edges_current e WHERE e.edge_id = p_id AND e.tenant_id = p_tenant AND e.domain_id = p_domain;
    v_exists := FOUND; v_title := 'edge ' || r.predicate; v_state := r.state; v_withdrawn := r.retracted_at IS NOT NULL;
  ELSIF p_kind = 'decision_package' THEN
    SELECT p.title, p.state AS pstate, v.state AS vstate, p.owner_principal_id INTO r FROM decision.package_versions v JOIN decision.packages_current p ON p.package_id = v.package_id
     WHERE v.package_id = p_id AND v.version = p_version AND v.tenant_id = p_tenant AND v.domain_id = p_domain;
    v_exists := FOUND; v_title := r.title; v_state := r.pstate || '/' || r.vstate; v_owner := r.owner_principal_id;
    v_withdrawn := r.pstate IN ('withdrawn', 'rejected') OR r.vstate = 'rejected';
    -- current: the version cites the changed object directly, and only at its latest version
    v_current := v_corr AND v_exists AND t.object_version IS NOT NULL
                 AND EXISTS (SELECT 1 FROM decision.options o, jsonb_array_elements(o.consequences) c WHERE o.package_id = p_id AND o.version = p_version AND (c ->> 'id')::uuid = p_trigger)
                 AND NOT EXISTS (SELECT 1 FROM decision.options o, jsonb_array_elements(o.consequences) c WHERE o.package_id = p_id AND o.version = p_version AND (c ->> 'id')::uuid = p_trigger
                                    AND coalesce((c ->> 'version')::int, 0) < t.object_version);
  ELSIF p_kind = 'publication' THEN
    SELECT pb.title, pb.state AS pstate, pv.state AS vstate, pv.drafted_by, pv.source_kind, pv.source_id INTO r FROM executive.publication_versions pv JOIN executive.publications pb ON pb.publication_id = pv.publication_id
     WHERE pv.publication_id = p_id AND pv.version = p_version AND pv.tenant_id = p_tenant AND pv.domain_id = p_domain;
    v_exists := FOUND; v_title := r.title; v_state := r.pstate || '/' || r.vstate; v_owner := r.drafted_by; v_withdrawn := r.pstate = 'withdrawn' OR r.vstate = 'withdrawn';
    -- current: it publishes a briefing that already reflected the change
    v_current := v_corr AND v_exists AND r.source_kind = 'briefing'
                 AND EXISTS (SELECT 1 FROM executive.briefings b WHERE b.briefing_id = r.source_id AND NOT EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = p_trigger AND o.recorded_at > b.known_at));
  ELSIF p_kind = 'export_package' THEN
    SELECT x.built_by, x.revoked_at, x.object_count INTO r FROM retention.export_packages x WHERE x.action_id = p_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    v_exists := FOUND; v_title := 'export package ' || p_id::text || ' (' || r.object_count || ' object(s))'; v_owner := r.built_by; v_withdrawn := r.revoked_at IS NOT NULL;
    v_state := CASE WHEN r.revoked_at IS NULL THEN 'built' ELSE 'revoked' END;
    -- current: every manifest of the changed evidence it shipped is the latest version's
    v_current := v_corr AND v_exists AND t.object_type = 'EVD' AND t.manifest_id IS NOT NULL
                 AND NOT EXISTS (SELECT 1 FROM retention.scope_items si JOIN objects.canonical_objects o ON o.payload ->> 'manifest_id' = si.ref AND o.object_id = p_trigger
                                  WHERE si.action_id = p_id AND si.item_kind = 'manifest' AND si.disposition = 'execute' AND si.ref <> t.manifest_id);
  ELSIF p_kind = 'information_set' THEN
    SELECT s.series_key, s.frozen_by, s.known_at, s.evidence INTO r FROM prediction.information_sets s WHERE s.information_set_id = p_id AND s.tenant_id = p_tenant AND s.domain_id = p_domain;
    v_exists := FOUND; v_title := 'information set for ' || r.series_key; v_owner := r.frozen_by; v_state := 'frozen';
    v_current := v_corr AND v_exists AND t.object_version IS NOT NULL
                 AND EXISTS (SELECT 1 FROM jsonb_array_elements(r.evidence) ev WHERE (ev ->> 'evidence_object_id')::uuid = p_trigger)
                 AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r.evidence) ev WHERE (ev ->> 'evidence_object_id')::uuid = p_trigger AND coalesce((ev ->> 'evidence_version')::int, 0) < t.object_version);
  ELSIF p_kind = 'backtest' THEN
    SELECT b.method, b.series_key, b.computed_by, b.computed_at INTO r FROM prediction.backtests b WHERE b.backtest_id = p_id AND b.tenant_id = p_tenant AND b.domain_id = p_domain;
    v_exists := FOUND; v_title := 'backtest of ' || r.method || ' on ' || r.series_key; v_owner := r.computed_by; v_state := 'computed';
    v_current := v_corr AND v_exists AND t.recorded_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = p_trigger AND o.recorded_at > r.computed_at);
  ELSIF p_kind = 'method_validation' THEN
    SELECT m.method_ref, m.series_key, m.computed_by, m.computed_at INTO r FROM prediction.method_validations m WHERE m.validation_id = p_id AND m.tenant_id = p_tenant AND m.domain_id = p_domain;
    v_exists := FOUND; v_title := 'validation of ' || r.method_ref || ' on ' || r.series_key; v_owner := r.computed_by; v_state := 'computed';
    v_current := v_corr AND v_exists AND t.recorded_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = p_trigger AND o.recorded_at > r.computed_at);
  ELSIF p_kind = 'lesson' THEN
    SELECT l.title, l.linked_by INTO r FROM decision.lessons l WHERE l.lesson_id = p_id AND l.tenant_id = p_tenant AND l.domain_id = p_domain;
    v_exists := FOUND; v_title := r.title; v_owner := r.linked_by; v_state := 'linked';
  END IF;
  RETURN jsonb_build_object('exists', v_exists, 'withdrawn', coalesce(v_withdrawn, false), 'current', coalesce(v_current, false),
                            'challenged', v_exists AND (p_trigger_kind = 'human_challenge' OR graph._open_challenge(p_tenant, p_domain, p_kind, p_id, p_version)),
                            'state', v_state, 'owner', v_owner, 'title', v_title, 'version', v_version,
                            'trigger_kind', p_trigger_kind, 'change_version', t.object_version);
END $$;
REVOKE ALL ON FUNCTION graph.affected_facts(uuid, uuid, text, uuid, int, text, uuid) FROM PUBLIC;

/*
 * The walk's buckets CLASSED and recorded (internal: called by graph.record_impact in the walk's own transaction, as its definer; §CI.7). Each item
 * of each bucket resolves to (kind, type, id, version); its facts are read here; the class is the active rule's; one append-only row per
 * product. An item that does not resolve in this tenant and domain is not recorded and is COUNTED (products_unresolved) — a walk of the
 * domain's own rows never produces one. Answers the counts per class, the rule version and the counts.
 */
CREATE OR REPLACE FUNCTION graph._classify_walk(p_invalidation uuid, p_tenant uuid, p_domain uuid, p_case uuid, p_trigger_kind text, p_trigger uuid,
                                                p_buckets jsonb, p_products jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path = graph, pg_catalog, pg_temp AS $$
DECLARE
  v_rule graph.affected_class_rules%ROWTYPE; b record; it jsonb; v_id uuid; v_ver int; v_type text; v_kind text; v_bucket text; v_f jsonb; v_class text;
  v_classes jsonb := '{}'::jsonb; v_n int := 0; v_unresolved int := 0; v_ref text;
BEGIN
  SELECT * INTO v_rule FROM graph.affected_class_rules WHERE active;
  IF NOT FOUND THEN RAISE EXCEPTION 'impact rejected (state): no active affected-class rule is declared' USING ERRCODE = '22023'; END IF;
  FOR b IN
    SELECT x.bucket, x.kind, x.type, x.key, e.value AS item
      FROM (VALUES ('assumptions', 'assumption', 'ASU', 'strategy_object_id'), ('objectives', 'objective', 'OBJ', 'strategy_object_id'),
                   ('decisions', 'decision', 'DEC', 'strategy_object_id'), ('commitments', 'commitment', 'CMT', 'strategy_object_id'),
                   ('strategy_nodes', 'strategy_node', NULL, 'strategy_object_id'), ('forecasts', 'forecast', 'FCT', 'forecast_id'),
                   ('twins', 'twin', 'TWN', 'twin_id'), ('simulations', 'simulation', 'SIM', 'run_id'), ('warnings', 'warning', 'WRN', 'warning_id'),
                   ('briefings', 'briefing', 'BRF', 'briefing_id'), ('memory_items', 'memory_item', 'MEM', 'item_id')) x(bucket, kind, type, key)
      CROSS JOIN LATERAL jsonb_array_elements(coalesce(p_buckets -> x.bucket, '[]'::jsonb)) e
    UNION ALL
    SELECT e.value ->> 'bucket', e.value ->> 'product_kind', e.value ->> 'object_type', 'product_id', e.value
      FROM jsonb_array_elements(coalesce(p_products, '[]'::jsonb)) e
  LOOP
    it := b.item; v_bucket := b.bucket; v_kind := b.kind;
    v_id := NULLIF(it ->> b.key, '')::uuid;
    v_ver := NULLIF(it ->> 'product_version', '')::int;
    v_type := coalesce(b.type, it ->> 'object_type');
    IF v_id IS NULL OR v_kind IS NULL OR v_type IS NULL OR v_bucket IS NULL THEN v_unresolved := v_unresolved + 1; CONTINUE; END IF;
    v_f := graph.affected_facts(p_tenant, p_domain, v_kind, v_id, v_ver, p_trigger_kind, p_trigger);
    IF NOT coalesce((v_f ->> 'exists')::boolean, false) THEN v_unresolved := v_unresolved + 1; CONTINUE; END IF;
    v_ver := coalesce(v_ver, NULLIF(v_f ->> 'version', '')::int);
    v_class := graph.classify_affected(v_rule.rule, v_kind, v_f);
    v_ref := v_type || ':' || v_id::text || CASE WHEN v_ver IS NULL THEN '' ELSE '@' || v_ver::text END;
    INSERT INTO graph.affected_products (scope, tenant_id, domain_id, invalidation_id, correction_case_id, trigger_kind, trigger_object_id, bucket, product_kind, object_type,
                                         product_id, product_version, product_ref, title, class, rule_version, facts, owner_principal_id, reached_via, hop, path,
                                         recorded_by, correlation_id)
    VALUES ('DOMAIN', p_tenant, p_domain, p_invalidation, p_case, p_trigger_kind, p_trigger, v_bucket, v_kind, v_type,
            v_id, v_ver, v_ref, left(coalesce(NULLIF(it ->> 'title', ''), v_f ->> 'title', v_ref), 500), v_class, v_rule.rule_version, v_f - 'owner' - 'title',
            NULLIF(v_f ->> 'owner', '')::uuid, left(coalesce(NULLIF(it ->> 'reached_via', ''), 'reached by the walk'), 1000), greatest(coalesce((it ->> 'hop')::int, 0), 0),
            CASE WHEN jsonb_typeof(it -> 'path') = 'array' THEN it -> 'path' ELSE jsonb_build_array(v_ref) END,
            p_actor, p_correlation)
    ON CONFLICT ON CONSTRAINT gap_once DO NOTHING;
    IF FOUND THEN
      v_n := v_n + 1;
      v_classes := jsonb_set(v_classes, ARRAY[v_class], to_jsonb(coalesce((v_classes ->> v_class)::int, 0) + 1));
    END IF;
  END LOOP;
  RETURN jsonb_build_object('rule_version', v_rule.rule_version, 'products', v_n, 'classes', v_classes, 'products_unresolved', v_unresolved);
END $$;
REVOKE ALL ON FUNCTION graph._classify_walk(uuid, uuid, uuid, uuid, text, uuid, jsonb, jsonb, uuid, uuid) FROM PUBLIC;

-- ─── §CI.7 graph.record_impact RE-DECLARED — 0089 §G8 (its LAST definition) copied WHOLE; the only changes, marked `B50 ci`: the twenty-first
-- argument p_products (the new buckets: scenarios, graph state, decision packages, publications, export packages, evaluation datasets, lessons),
-- every bucket classed by graph._classify_walk before the case's coverage is reconciled, and the counts in the invalidation.assessed details
-- (products, classes, rule_version, products_unresolved). The twenty-argument signature is dropped (a call naming twenty still resolves:
-- the twenty-first defaults to '[]').
DROP FUNCTION IF EXISTS graph.record_impact(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text,boolean,jsonb,uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb);
CREATE FUNCTION graph.record_impact(
  p_invalidation_id uuid, p_tenant uuid, p_domain uuid,
  p_assumptions jsonb, p_objectives jsonb, p_decisions jsonb, p_commitments jsonb,
  p_forecasts jsonb, p_twins jsonb, p_simulations jsonb,
  p_statement text, p_truncated boolean, p_unexplored jsonb,
  p_actor uuid, p_event_id uuid, p_correlation uuid,
  p_warnings jsonb, p_briefings jsonb, p_memory_items jsonb DEFAULT '[]'::jsonb,
  /* B32 (0089) graph */ p_strategy_nodes jsonb DEFAULT '[]'::jsonb, /* end B32 graph */
  /* B50 ci */ p_products jsonb DEFAULT '[]'::jsonb /* end B50 ci */
) RETURNS void
SECURITY DEFINER SET search_path = graph, observation, prediction, twin, simulation, executive, memory, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE
  v_case uuid; cov record; f jsonb; t jsonb; r jsonb; w jsonb; b jsonb; mi jsonb; v_versions int[]; v_version int; v_marked jsonb := '[]'::jsonb; v_routes text[]; v_trigger_kind text; v_trigger_id uuid;
  v_cov_state text; v_cov_roots int := 0; v_cov_covered int := 0; v_cov_outstanding int := 0;
  /* B50 ci */ v_classified jsonb; /* end B50 ci */
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.impact.propagate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  UPDATE graph.invalidations_current
     SET affected_assumptions = coalesce(p_assumptions, '[]'::jsonb),
         affected_objectives  = coalesce(p_objectives,  '[]'::jsonb),
         affected_decisions   = coalesce(p_decisions,   '[]'::jsonb),
         affected_commitments = coalesce(p_commitments, '[]'::jsonb),
         affected_forecasts   = coalesce(p_forecasts,   '[]'::jsonb),
         affected_twins       = coalesce(p_twins,       '[]'::jsonb),
         affected_simulations = coalesce(p_simulations, '[]'::jsonb),
         affected_warnings    = coalesce(p_warnings,    '[]'::jsonb),
         affected_briefings   = coalesce(p_briefings,   '[]'::jsonb),
         affected_memory_items = coalesce(p_memory_items, '[]'::jsonb),
         /* B32 (0089) graph */ affected_strategy_nodes = coalesce(p_strategy_nodes, '[]'::jsonb), /* end B32 graph */
         statement = p_statement,
         truncated = coalesce(p_truncated, false),
         unexplored = coalesce(p_unexplored, '[]'::jsonb),
         state = 'assessed', assessed_at = clock_timestamp()
   WHERE invalidation_id = p_invalidation_id
   RETURNING correction_case_id, trigger_kind, trigger_object_id INTO v_case, v_trigger_kind, v_trigger_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'impact rejected: no such invalidation' USING ERRCODE = '23503';
  END IF;

  FOR f IN SELECT * FROM jsonb_array_elements(coalesce(p_forecasts, '[]'::jsonb)) LOOP
    UPDATE prediction.forecasts_current
       SET attention_state = 'assumption_unverified',
           attention_reason = format('invalidation %s: %s', p_invalidation_id, f ->> 'reached_via'),
           updated_at = clock_timestamp()
     WHERE forecast_id = (f ->> 'forecast_id')::uuid AND tenant_id = p_tenant AND domain_id = p_domain
       AND state IN ('issued');
    IF FOUND THEN
      INSERT INTO prediction.forecast_events (event_id, scope, tenant_id, domain_id, forecast_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, (f ->> 'forecast_id')::uuid, 'forecast.attention', p_actor,
              jsonb_build_object('invalidation_id', p_invalidation_id, 'reached_via', f ->> 'reached_via'), p_correlation);
    END IF;
  END LOOP;

  FOR t IN SELECT * FROM jsonb_array_elements(coalesce(p_twins, '[]'::jsonb)) LOOP
    -- every route: `via_ids` when the walk recorded several, `via_id` for one
    SELECT coalesce(array_agg(DISTINCT x), ARRAY[]::text[]) INTO v_routes
      FROM (SELECT t ->> 'via_id' AS x WHERE (t ->> 'via_id') IS NOT NULL
            UNION ALL SELECT y #>> '{}' FROM jsonb_array_elements(coalesce(t -> 'via_ids', '[]'::jsonb)) y) s WHERE x IS NOT NULL;
    SELECT coalesce(array_agg(DISTINCT v.version ORDER BY v.version), ARRAY[]::int[]) INTO v_versions
      FROM twin.twin_versions v
      JOIN twin.state_elements e ON e.twin_id = v.twin_id AND e.version = v.version
     WHERE v.twin_id = (t ->> 'twin_id')::uuid AND v.tenant_id = p_tenant AND v.domain_id = p_domain
       AND v.state = 'admitted' AND v.verification_state = 'verified'
       AND EXISTS (SELECT 1 FROM jsonb_array_elements(e.citations) c WHERE (c ->> 'id') = ANY (v_routes));
    FOREACH v_version IN ARRAY v_versions LOOP
      PERFORM twin.mark_unverified((t ->> 'twin_id')::uuid, p_tenant, p_domain, v_version,
        format('invalidation %s: %s', p_invalidation_id, t ->> 'reached_via'), p_invalidation_id, p_actor, gen_random_uuid(), p_correlation);
      v_marked := v_marked || jsonb_build_object('twin_id', t ->> 'twin_id', 'version', v_version);
    END LOOP;
  END LOOP;

  FOR r IN SELECT * FROM jsonb_array_elements(coalesce(p_simulations, '[]'::jsonb)) LOOP
    IF EXISTS (SELECT 1 FROM simulation.runs_current s WHERE s.run_id = (r ->> 'run_id')::uuid AND s.tenant_id = p_tenant AND s.domain_id = p_domain) THEN
      INSERT INTO simulation.run_events (event_id, scope, tenant_id, domain_id, run_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, (r ->> 'run_id')::uuid, 'run.unverified', p_actor,
              jsonb_build_object('invalidation_id', p_invalidation_id, 'reached_via', r ->> 'reached_via'), p_correlation);
    END IF;
  END LOOP;

  -- B8 §8 (AU-MEM-0031): a WARNING the walk reached is marked for attention (once; the warning row's own fields stay immutable),
  -- a BRIEFING composed before the change is RE-FLAGGED by event (the briefing is append-only; its content keeps its digest).
  FOR w IN SELECT * FROM jsonb_array_elements(coalesce(p_warnings, '[]'::jsonb)) LOOP
    UPDATE prediction.warnings_current
       SET attention_state = 'input_unverified', attention_reason = format('invalidation %s: %s', p_invalidation_id, w ->> 'reached_via')
     WHERE warning_id = (w ->> 'warning_id')::uuid AND tenant_id = p_tenant AND domain_id = p_domain AND attention_state = 'none' AND state IN ('raised', 'acknowledged');
    IF FOUND THEN
      INSERT INTO prediction.warning_events (event_id, scope, tenant_id, domain_id, warning_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, (w ->> 'warning_id')::uuid, 'warning.attention', p_actor,
              jsonb_build_object('invalidation_id', p_invalidation_id, 'reached_via', w ->> 'reached_via'), p_correlation);
    END IF;
  END LOOP;
  FOR b IN SELECT * FROM jsonb_array_elements(coalesce(p_briefings, '[]'::jsonb)) LOOP
    -- a briefing composed BEFORE the change it rests on: for a corrected object, the object has a version recorded after the
    -- briefing's known-at (a briefing composed on the corrected version is not re-flagged by the correction it already saw)
    IF EXISTS (SELECT 1 FROM executive.briefings x
                WHERE x.briefing_id = (b ->> 'briefing_id')::uuid AND x.tenant_id = p_tenant AND x.domain_id = p_domain
                  AND (v_trigger_kind NOT IN ('evidence_correction', 'claim_correction', 'claim_withdrawal')
                       OR EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = v_trigger_id AND o.recorded_at > x.known_at)))
       AND NOT EXISTS (SELECT 1 FROM executive.briefing_events e WHERE e.briefing_id = (b ->> 'briefing_id')::uuid AND e.event = 'briefing.re_flagged' AND e.details ->> 'invalidation_id' = p_invalidation_id::text) THEN
      INSERT INTO executive.briefing_events (event_id, scope, tenant_id, domain_id, briefing_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, (b ->> 'briefing_id')::uuid, 'briefing.re_flagged', p_actor,
              jsonb_build_object('invalidation_id', p_invalidation_id, 'reached_via', b ->> 'reached_via', 'correction_case_id', v_case), p_correlation);
    END IF;
  END LOOP;

  -- 0066 §3: memory items resting on what changed — an ACTIVE item recorded before the change (for a corrected object, the
  -- object has a version recorded after the item's record instant) is marked for the knowledge owner's attention once per
  -- invalidation; the item itself (a version of the institutional record) is never rewritten by a walk.
  -- B19 (0079): a claim_withdrawal walk marks basis_withdrawn when the trigger object's LATEST version is withdrawn (else
  -- basis_corrected: the walk reached the item, but no withdrawal stands); an item already basis_withdrawn keeps that mark (a
  -- later correction walk of the same object does not downgrade it) — the event still records the invalidation, with the
  -- trigger kind and the state left on the item.
  FOR mi IN SELECT * FROM jsonb_array_elements(coalesce(p_memory_items, '[]'::jsonb)) LOOP
    IF EXISTS (SELECT 1 FROM memory.items_current x
                WHERE x.item_id = (mi ->> 'item_id')::uuid AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'active'
                  AND (v_trigger_kind NOT IN ('evidence_correction', 'claim_correction', 'claim_withdrawal')
                       OR EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = v_trigger_id AND o.recorded_at > x.recorded_at)))
       AND NOT EXISTS (SELECT 1 FROM memory.item_events e WHERE e.item_id = (mi ->> 'item_id')::uuid AND e.event = 'memory.attention' AND e.details ->> 'invalidation_id' = p_invalidation_id::text) THEN
      UPDATE memory.items_current
         SET attention_state = CASE WHEN attention_state = 'basis_withdrawn'
                                      OR (v_trigger_kind = 'claim_withdrawal'
                                          AND coalesce((SELECT o.lifecycle_state FROM objects.canonical_objects o
                                                         WHERE o.object_id = v_trigger_id AND o.tenant_id = p_tenant AND o.domain_id = p_domain
                                                         ORDER BY o.object_version DESC LIMIT 1), '') = 'withdrawn')
                                    THEN 'basis_withdrawn' ELSE 'basis_corrected' END,
             attention_reason = left('invalidation ' || p_invalidation_id::text || ': ' || coalesce(mi ->> 'reached_via', 'what this record rests on changed'), 500)
       WHERE item_id = (mi ->> 'item_id')::uuid;
      INSERT INTO memory.item_events (event_id, scope, tenant_id, domain_id, item_id, event, object_version, actor_principal_id, details, correlation_id)
      SELECT gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, x.item_id, 'memory.attention', x.object_version, p_actor,
             jsonb_build_object('invalidation_id', p_invalidation_id, 'reached_via', mi ->> 'reached_via', 'correction_case_id', v_case, 'trigger_kind', v_trigger_kind, 'attention_state', x.attention_state), p_correlation
        FROM memory.items_current x WHERE x.item_id = (mi ->> 'item_id')::uuid;
    END IF;
  END LOOP;

  -- B50 ci: every product the walk reached — the existing buckets and the new ones (scenarios, graph state, decision packages, publications,
  -- export packages, evaluation datasets, lessons) — CLASSED under the active rule from the facts read here, one append-only row each (§CI.6).
  v_classified := graph._classify_walk(p_invalidation_id, p_tenant, p_domain, v_case, v_trigger_kind, v_trigger_id,
    jsonb_build_object('assumptions', p_assumptions, 'objectives', p_objectives, 'decisions', p_decisions, 'commitments', p_commitments,
                       'strategy_nodes', p_strategy_nodes, 'forecasts', p_forecasts, 'twins', p_twins, 'simulations', p_simulations,
                       'warnings', p_warnings, 'briefings', p_briefings, 'memory_items', p_memory_items),
    p_products, p_actor, p_correlation);
  -- end B50 ci

  IF v_case IS NOT NULL THEN
    SELECT * INTO cov FROM graph.case_propagation_coverage(v_case);
    v_cov_state := coalesce(cov.state, 'partial');
    v_cov_roots := coalesce(cov.roots, 0);
    v_cov_covered := coalesce(cov.covered, 0);
    v_cov_outstanding := coalesce(cov.missing, 0) + coalesce(cov.truncated_latest, 0);
    UPDATE observation.correction_current
       SET propagation_unresolved = coalesce(cov.sentence, p_statement),
           propagation_assessment_id = p_invalidation_id,
           propagation_state = v_cov_state
     WHERE case_id = v_case AND tenant_id = p_tenant AND domain_id = p_domain;
  END IF;

  INSERT INTO graph.invalidation_events (event_id, scope, tenant_id, domain_id, invalidation_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_invalidation_id, 'invalidation.assessed', p_actor, jsonb_build_object(
      'assumptions', jsonb_array_length(coalesce(p_assumptions, '[]'::jsonb)),
      'objectives',  jsonb_array_length(coalesce(p_objectives,  '[]'::jsonb)),
      'decisions',   jsonb_array_length(coalesce(p_decisions,   '[]'::jsonb)),
      'commitments', jsonb_array_length(coalesce(p_commitments, '[]'::jsonb)),
      'forecasts',   jsonb_array_length(coalesce(p_forecasts,   '[]'::jsonb)),
      'twins',       jsonb_array_length(coalesce(p_twins,       '[]'::jsonb)),
      'twin_versions_unverified', v_marked,
      'simulations', jsonb_array_length(coalesce(p_simulations, '[]'::jsonb)),
      'warnings',    jsonb_array_length(coalesce(p_warnings,    '[]'::jsonb)),
      'briefings',   jsonb_array_length(coalesce(p_briefings,   '[]'::jsonb)),
      'memory_items', jsonb_array_length(coalesce(p_memory_items, '[]'::jsonb)),
      /* B32 (0089) graph */ 'strategy_nodes', jsonb_array_length(coalesce(p_strategy_nodes, '[]'::jsonb)), /* end B32 graph */
      /* B50 ci */ 'products', v_classified -> 'products', 'classes', v_classified -> 'classes', 'rule_version', v_classified -> 'rule_version',
      'products_unresolved', v_classified -> 'products_unresolved', /* end B50 ci */
      'truncated', coalesce(p_truncated, false),
      'unexplored', jsonb_array_length(coalesce(p_unexplored, '[]'::jsonb)),
      'correction_case_id', v_case, 'case_propagation_state', v_cov_state,
      'roots', v_cov_roots, 'roots_covered', v_cov_covered,
      'roots_outstanding', v_cov_outstanding, 'statement', p_statement),
    p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.record_impact(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text,boolean,jsonb,uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.record_impact(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text,boolean,jsonb,uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb) TO eye_commit;


-- ─── §CI.8 THE SEEDING PORTS — one per trigger kind; the shared preflight and insert are internal ─────────────────────────────────────────────────────────
-- The body every seeding port runs: the action bound (graph.impact.trigger.<kind>), the scope, the acting principal = the session's, a NAMED
-- ACTIVE HUMAN holding one of the kind's roles at the domain (re-checked here, never only in the PDP), the object's type among the kind's,
-- the object resolved in this tenant and domain (its latest canonical version; an entity or an edge by its row), the reason; then the row
-- and its event. Refusals in the class form `impact trigger rejected (<class>): …` — actor / authority 42501 (403), unknown_object 23503
-- (404), use / basis / reason 22023 (422).
CREATE OR REPLACE FUNCTION graph._trigger_preflight(p_kind text, p_roles text[], p_types text[], p_tenant uuid, p_domain uuid,
  p_object_type text, p_object_id uuid, p_reason text, p_basis jsonb, p_actor uuid) RETURNS int
LANGUAGE plpgsql SET search_path = graph, observation, pg_catalog, pg_temp AS $$
DECLARE v_version int; v_found boolean;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.impact.trigger.' || p_kind]);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'impact trigger rejected (actor): the acting principal is not the session''s' USING ERRCODE = '42501';
  END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, p_roles) THEN
    RAISE EXCEPTION 'impact trigger rejected (authority): a % is recorded by a named person holding % in this domain', replace(p_kind, '_', ' '), array_to_string(p_roles, ' or ') USING ERRCODE = '42501';
  END IF;
  IF p_object_type IS NULL OR NOT (p_object_type = ANY (p_types)) THEN
    RAISE EXCEPTION 'impact trigger rejected (use): a % names a %, not a %', replace(p_kind, '_', ' '), array_to_string(p_types, ', '), coalesce(p_object_type, '<none>') USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'impact trigger rejected (reason): a trigger states its reason (8 to 2000 characters)' USING ERRCODE = '22023';
  END IF;
  IF p_basis IS NULL OR jsonb_typeof(p_basis) <> 'object' THEN
    RAISE EXCEPTION 'impact trigger rejected (basis): the basis is an object' USING ERRCODE = '22023';
  END IF;
  IF p_object_type = 'ENT' THEN
    v_found := EXISTS (SELECT 1 FROM graph.entities_current e WHERE e.entity_id = p_object_id AND e.tenant_id = p_tenant AND e.domain_id = p_domain);
  ELSIF p_object_type = 'REL' THEN
    v_found := EXISTS (SELECT 1 FROM graph.edges_current e WHERE e.edge_id = p_object_id AND e.tenant_id = p_tenant AND e.domain_id = p_domain);
  ELSE
    SELECT o.object_version INTO v_version FROM objects.canonical_objects o
     WHERE o.object_id = p_object_id AND o.object_type = p_object_type AND o.tenant_id = p_tenant AND o.domain_id = p_domain ORDER BY o.object_version DESC LIMIT 1;
    v_found := FOUND;
  END IF;
  IF NOT v_found THEN
    RAISE EXCEPTION 'impact trigger rejected (unknown_object): % % is not recorded in this domain', p_object_type, p_object_id USING ERRCODE = '23503';
  END IF;
  RETURN v_version;
END $$;
REVOKE ALL ON FUNCTION graph._trigger_preflight(text, text[], text[], uuid, uuid, text, uuid, text, jsonb, uuid) FROM PUBLIC;

-- The row and its event, once the port's preflight and its kind's basis have passed.
CREATE OR REPLACE FUNCTION graph._trigger_insert(p_kind text, p_version int, p_trigger_id uuid, p_tenant uuid, p_domain uuid,
  p_object_type text, p_object_id uuid, p_reason text, p_basis jsonb, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path = graph, pg_catalog, pg_temp AS $$
DECLARE v_version int := p_version;
BEGIN
  INSERT INTO graph.impact_triggers (trigger_id, scope, tenant_id, domain_id, trigger_kind, object_type, object_id, object_version, reason, basis, recorded_by, correlation_id)
  VALUES (p_trigger_id, 'DOMAIN', p_tenant, p_domain, p_kind, p_object_type, p_object_id, v_version, btrim(p_reason), p_basis, p_actor, p_correlation);
  INSERT INTO graph.impact_trigger_events (event_id, scope, tenant_id, domain_id, trigger_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_trigger_id, 'trigger.recorded', p_actor,
          jsonb_build_object('trigger_kind', p_kind, 'object_type', p_object_type, 'object_id', p_object_id, 'object_version', v_version, 'basis', p_basis), p_correlation);
  RETURN jsonb_build_object('trigger_id', p_trigger_id, 'trigger_kind', p_kind, 'object_type', p_object_type, 'object_id', p_object_id, 'object_version', v_version,
                            'state', 'recorded', 'reason', btrim(p_reason), 'basis', p_basis);
END $$;
REVOKE ALL ON FUNCTION graph._trigger_insert(text, int, uuid, uuid, uuid, text, uuid, text, jsonb, uuid, uuid, uuid) FROM PUBLIC;

-- A basis field the kind requires: text of at least p_min characters.
CREATE OR REPLACE FUNCTION graph._basis_text(p_kind text, p_basis jsonb, p_key text, p_min int) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF p_basis IS NULL OR jsonb_typeof(p_basis -> p_key) IS DISTINCT FROM 'string' OR length(btrim(p_basis ->> p_key)) < p_min THEN
    RAISE EXCEPTION 'impact trigger rejected (basis): a % names its % (at least % characters)', replace(p_kind, '_', ' '), replace(p_key, '_', ' '), p_min USING ERRCODE = '22023';
  END IF;
  RETURN btrim(p_basis ->> p_key);
END $$;
REVOKE ALL ON FUNCTION graph._basis_text(text, jsonb, text, int) FROM PUBLIC;

-- LEGAL REQUEST (privacy officer / record authority): evidence or a claim a legal request reaches — the request's reference and legal basis.
CREATE OR REPLACE FUNCTION graph.seed_legal_request(p_trigger_id uuid, p_tenant uuid, p_domain uuid, p_object_type text, p_object_id uuid, p_reason text, p_basis jsonb,
  p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_version int;
BEGIN
  v_version := graph._trigger_preflight('legal_request', ARRAY['privacy_officer', 'record_authority'], ARRAY['EVD', 'CLM'], p_tenant, p_domain, p_object_type, p_object_id, p_reason, p_basis, p_actor);
  PERFORM graph._basis_text('legal_request', p_basis, 'request_ref', 4);
  PERFORM graph._basis_text('legal_request', p_basis, 'legal_basis', 4);
  RETURN graph._trigger_insert('legal_request', v_version, p_trigger_id, p_tenant, p_domain, p_object_type, p_object_id, p_reason, p_basis, p_actor, p_event_id, p_correlation);
END $$ LANGUAGE plpgsql;

-- MODEL INCIDENT (method steward): a forecast or run produced by a method under incident — the method named must be the object's own.
CREATE OR REPLACE FUNCTION graph.seed_model_incident(p_trigger_id uuid, p_tenant uuid, p_domain uuid, p_object_type text, p_object_id uuid, p_reason text, p_basis jsonb,
  p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_version int; v_method text;
BEGIN
  v_version := graph._trigger_preflight('model_incident', ARRAY['method_steward'], ARRAY['FCT', 'SIM'], p_tenant, p_domain, p_object_type, p_object_id, p_reason, p_basis, p_actor);
  v_method := graph._basis_text('model_incident', p_basis, 'method_ref', 2);
  PERFORM graph._basis_text('model_incident', p_basis, 'incident', 8);
  IF p_object_type = 'FCT' AND NOT EXISTS (SELECT 1 FROM prediction.forecasts_current f WHERE f.forecast_id = p_object_id AND f.tenant_id = p_tenant AND f.domain_id = p_domain
                                             AND v_method IN (f.method, coalesce(f.method_ref, ''), f.method || '@' || f.method_version)) THEN
    RAISE EXCEPTION 'impact trigger rejected (basis): forecast % was not produced by method %', p_object_id, v_method USING ERRCODE = '22023';
  END IF;
  IF p_object_type = 'SIM' AND NOT EXISTS (SELECT 1 FROM simulation.runs_current r WHERE r.run_id = p_object_id AND r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.model_ref = v_method) THEN
    RAISE EXCEPTION 'impact trigger rejected (basis): run % was not produced by model %', p_object_id, v_method USING ERRCODE = '22023';
  END IF;
  RETURN graph._trigger_insert('model_incident', v_version, p_trigger_id, p_tenant, p_domain, p_object_type, p_object_id, p_reason, p_basis, p_actor, p_event_id, p_correlation);
END $$ LANGUAGE plpgsql;

-- ONTOLOGY CORRECTION (ontology steward): an entity or edge whose typing a recorded ontology version of this domain corrects.
CREATE OR REPLACE FUNCTION graph.seed_ontology_correction(p_trigger_id uuid, p_tenant uuid, p_domain uuid, p_object_type text, p_object_id uuid, p_reason text, p_basis jsonb,
  p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_version int; v_ref text;
BEGIN
  v_version := graph._trigger_preflight('ontology_correction', ARRAY['ontology_steward'], ARRAY['ENT', 'REL'], p_tenant, p_domain, p_object_type, p_object_id, p_reason, p_basis, p_actor);
  v_ref := graph._basis_text('ontology_correction', p_basis, 'ontology_version_id', 36);
  IF v_ref !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR NOT EXISTS (SELECT 1 FROM graph.ontology_versions v WHERE v.version_id = v_ref::uuid AND v.tenant_id = p_tenant AND v.domain_id = p_domain) THEN
    RAISE EXCEPTION 'impact trigger rejected (basis): % is not an ontology version of this domain', v_ref USING ERRCODE = '22023';
  END IF;
  RETURN graph._trigger_insert('ontology_correction', v_version, p_trigger_id, p_tenant, p_domain, p_object_type, p_object_id, p_reason, p_basis, p_actor, p_event_id, p_correlation);
END $$ LANGUAGE plpgsql;

-- DATA-QUALITY FINDING (data steward): evidence or a claim found deficient on a named quality dimension.
CREATE OR REPLACE FUNCTION graph.seed_data_quality_finding(p_trigger_id uuid, p_tenant uuid, p_domain uuid, p_object_type text, p_object_id uuid, p_reason text, p_basis jsonb,
  p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_version int; v_dim text;
BEGIN
  v_version := graph._trigger_preflight('data_quality_finding', ARRAY['data_steward'], ARRAY['EVD', 'CLM'], p_tenant, p_domain, p_object_type, p_object_id, p_reason, p_basis, p_actor);
  v_dim := graph._basis_text('data_quality_finding', p_basis, 'dimension', 4);
  IF v_dim NOT IN ('completeness', 'accuracy', 'timeliness', 'consistency', 'validity', 'uniqueness') THEN
    RAISE EXCEPTION 'impact trigger rejected (basis): % is not a quality dimension (completeness, accuracy, timeliness, consistency, validity, uniqueness)', v_dim USING ERRCODE = '22023';
  END IF;
  PERFORM graph._basis_text('data_quality_finding', p_basis, 'finding', 8);
  RETURN graph._trigger_insert('data_quality_finding', v_version, p_trigger_id, p_tenant, p_domain, p_object_type, p_object_id, p_reason, p_basis, p_actor, p_event_id, p_correlation);
END $$ LANGUAGE plpgsql;

-- RIGHTS CHANGE: evidence whose source's rights state is no longer confirmed — the source named must be the evidence's, its CURRENT rights
-- state the one stated (the transition is the source contract's own port, observation.set_rights_state; this records what rests on it).
CREATE OR REPLACE FUNCTION graph.seed_rights_change(p_trigger_id uuid, p_tenant uuid, p_domain uuid, p_object_type text, p_object_id uuid, p_reason text, p_basis jsonb,
  p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_version int; v_src text; v_state text;
BEGIN
  v_version := graph._trigger_preflight('rights_change', ARRAY['data_steward', 'privacy_officer', 'record_authority', 'collection_manager'], ARRAY['EVD'], p_tenant, p_domain, p_object_type, p_object_id, p_reason, p_basis, p_actor);
  v_src := graph._basis_text('rights_change', p_basis, 'source_id', 36);
  v_state := graph._basis_text('rights_change', p_basis, 'rights_state', 6);
  IF v_src !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR NOT EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = p_object_id AND o.object_type = 'EVD' AND o.tenant_id = p_tenant AND o.domain_id = p_domain
                       AND o.provenance_ref LIKE 'SRC:' || lower(v_src) || '@%') THEN
    RAISE EXCEPTION 'impact trigger rejected (basis): evidence % was not acquired from source %', p_object_id, v_src USING ERRCODE = '22023';
  END IF;
  IF v_state NOT IN ('pending', 'withdrawn') OR NOT EXISTS (SELECT 1 FROM observation.source_contracts_current s WHERE s.source_id = v_src::uuid AND s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.rights_state = v_state) THEN
    RAISE EXCEPTION 'impact trigger rejected (basis): source % does not currently state rights %; record the change on the source contract first', v_src, v_state USING ERRCODE = '22023';
  END IF;
  RETURN graph._trigger_insert('rights_change', v_version, p_trigger_id, p_tenant, p_domain, p_object_type, p_object_id, p_reason, p_basis, p_actor, p_event_id, p_correlation);
END $$ LANGUAGE plpgsql;

-- INTEGRITY FAILURE (record authority / data steward): evidence whose vault custody failed — the manifest named must be the evidence's own.
CREATE OR REPLACE FUNCTION graph.seed_integrity_failure(p_trigger_id uuid, p_tenant uuid, p_domain uuid, p_object_type text, p_object_id uuid, p_reason text, p_basis jsonb,
  p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_version int; v_manifest text;
BEGIN
  v_version := graph._trigger_preflight('integrity_failure', ARRAY['record_authority', 'data_steward'], ARRAY['EVD'], p_tenant, p_domain, p_object_type, p_object_id, p_reason, p_basis, p_actor);
  v_manifest := graph._basis_text('integrity_failure', p_basis, 'manifest_id', 36);
  PERFORM graph._basis_text('integrity_failure', p_basis, 'failure', 8);
  IF NOT EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = p_object_id AND o.object_type = 'EVD' AND o.tenant_id = p_tenant AND o.domain_id = p_domain
                    AND o.payload ->> 'manifest_id' = lower(v_manifest)) THEN
    RAISE EXCEPTION 'impact trigger rejected (basis): manifest % is not a manifest of evidence %', v_manifest, p_object_id USING ERRCODE = '22023';
  END IF;
  RETURN graph._trigger_insert('integrity_failure', v_version, p_trigger_id, p_tenant, p_domain, p_object_type, p_object_id, p_reason, p_basis, p_actor, p_event_id, p_correlation);
END $$ LANGUAGE plpgsql;

-- HUMAN CHALLENGE (any named person of the domain; §PV's contest path calls it with its challenge's reference): a claim, an assessment, a
-- warning, a forecast or an assumption is contested — everything resting on it reads challenged until the deciding person closes it.
CREATE OR REPLACE FUNCTION graph.seed_human_challenge(p_trigger_id uuid, p_tenant uuid, p_domain uuid, p_object_type text, p_object_id uuid, p_reason text, p_basis jsonb,
  p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_version int;
BEGIN
  v_version := graph._trigger_preflight('human_challenge', ARRAY['domain_admin', 'domain_analyst', 'domain_specialist', 'knowledge_owner', 'forecast_owner', 'risk_owner', 'decision_owner', 'strategy_owner', 'data_steward',
          'method_steward', 'ontology_steward', 'executive', 'collection_manager', 'extraction_manager', 'resolution_manager', 'record_authority', 'privacy_officer'], ARRAY['CLM', 'ASM', 'WRN', 'FCT', 'ASU', 'EVT'], p_tenant, p_domain, p_object_type, p_object_id, p_reason, p_basis, p_actor);
  PERFORM graph._basis_text('human_challenge', p_basis, 'statement', 8);
  RETURN graph._trigger_insert('human_challenge', v_version, p_trigger_id, p_tenant, p_domain, p_object_type, p_object_id, p_reason, p_basis, p_actor, p_event_id, p_correlation);
END $$ LANGUAGE plpgsql;

DO $$
DECLARE k text;
BEGIN
  FOREACH k IN ARRAY ARRAY['legal_request', 'model_incident', 'ontology_correction', 'data_quality_finding', 'rights_change', 'integrity_failure', 'human_challenge'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION graph.seed_%s(uuid, uuid, uuid, text, uuid, text, jsonb, uuid, uuid, uuid) FROM PUBLIC', k);
    EXECUTE format('GRANT EXECUTE ON FUNCTION graph.seed_%s(uuid, uuid, uuid, text, uuid, text, jsonb, uuid, uuid, uuid) TO eye_commit', k);
  END LOOP;
END $$;

-- CLOSE A HUMAN CHALLENGE (the deciding person: a knowledge owner or the domain administrator, never its opener): the challenge stops
-- classing what rests on the object `challenged` at the next walk; the walk already recorded keeps its rows (append-only).
CREATE OR REPLACE FUNCTION graph.close_human_challenge(p_trigger_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r graph.impact_triggers%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.impact.trigger.close']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'impact trigger rejected (actor): the acting principal is not the session''s' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM graph.impact_triggers WHERE trigger_id = p_trigger_id AND tenant_id = p_tenant AND domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'impact trigger rejected (unknown_trigger): no trigger % in this domain', p_trigger_id USING ERRCODE = '23503'; END IF;
  IF r.trigger_kind <> 'human_challenge' THEN RAISE EXCEPTION 'impact trigger rejected (use): only a human challenge is closed; a % stands on its record', replace(r.trigger_kind, '_', ' ') USING ERRCODE = '22023'; END IF;
  IF r.closed_at IS NOT NULL THEN RAISE EXCEPTION 'impact trigger rejected (state): the challenge was closed at %', r.closed_at USING ERRCODE = '22023'; END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['knowledge_owner', 'domain_admin']) THEN
    RAISE EXCEPTION 'impact trigger rejected (authority): a challenge is closed by a named knowledge owner or the domain administrator' USING ERRCODE = '42501';
  END IF;
  IF p_actor = r.recorded_by THEN
    RAISE EXCEPTION 'impact trigger rejected (separation_of_duties): the person who opened a challenge does not close it' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'impact trigger rejected (reason): a closure states its reason (at least 8 characters)' USING ERRCODE = '22023'; END IF;
  UPDATE graph.impact_triggers SET closed_by = p_actor, closed_at = clock_timestamp(), close_reason = btrim(p_reason) WHERE trigger_id = p_trigger_id RETURNING * INTO r;
  INSERT INTO graph.impact_trigger_events (event_id, scope, tenant_id, domain_id, trigger_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_trigger_id, 'trigger.closed', p_actor, jsonb_build_object('reason', btrim(p_reason)), p_correlation);
  RETURN jsonb_build_object('trigger_id', r.trigger_id, 'closed_by', r.closed_by, 'closed_at', r.closed_at, 'close_reason', r.close_reason);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.close_human_challenge(uuid, uuid, uuid, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.close_human_challenge(uuid, uuid, uuid, text, uuid, uuid, uuid) TO eye_commit;

-- ─── §CI.9 THE AGENT'S WALK OF A TRIGGER (0060's shape: the receipt under the schedule capability; the checkpoint inside the walk) ──────────
-- RECEIVE: what the walker needs — the trigger, the domain's ACTIVE propagation agent (null: none — the trigger waits, visible) — and one
-- receipt event. A walked trigger answers as walked (a durable no-op).
CREATE OR REPLACE FUNCTION graph.impact_trigger_receive(p_trigger_id uuid, p_tenant uuid, p_domain uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r graph.impact_triggers%ROWTYPE; a graph.propagation_agents%ROWTYPE;
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  SELECT * INTO r FROM graph.impact_triggers WHERE trigger_id = p_trigger_id AND tenant_id = p_tenant AND domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'impact trigger rejected (unknown_trigger): no trigger % in this domain', p_trigger_id USING ERRCODE = '23503'; END IF;
  SELECT * INTO a FROM graph.propagation_agents WHERE tenant_id = p_tenant AND domain_id = p_domain AND status = 'active';
  IF r.state <> 'walked' THEN
    INSERT INTO graph.impact_trigger_events (event_id, scope, tenant_id, domain_id, trigger_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_trigger_id, 'trigger.received', NULL,
            jsonb_build_object('state', r.state, 'attempts', r.attempts, 'agent_id', a.agent_id), p_correlation);
  END IF;
  RETURN jsonb_build_object('trigger_id', r.trigger_id, 'trigger_kind', r.trigger_kind, 'object_type', r.object_type, 'object_id', r.object_id, 'object_version', r.object_version,
    'basis', r.basis, 'state', r.state, 'attempts', r.attempts, 'invalidation_id', r.invalidation_id,
    'agent', CASE WHEN a.agent_id IS NULL THEN NULL
                  ELSE jsonb_build_object('agent_id', a.agent_id, 'principal_id', a.principal_id, 'agent_version', a.agent_version, 'code_digest', a.code_digest, 'budgets', a.budgets) END);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.impact_trigger_receive(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.impact_trigger_receive(uuid, uuid, uuid, uuid) TO eye_commit;

-- BEGIN (inside the walk's transaction, under graph.impact.propagate): the row locked until the impact record commits; FALSE for a walked
-- trigger (a typed skip, never a second walk); only the domain's ACTIVE propagation agent walks a trigger.
CREATE OR REPLACE FUNCTION graph.impact_trigger_begin(p_trigger_id uuid, p_tenant uuid, p_domain uuid) RETURNS boolean
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r graph.impact_triggers%ROWTYPE; v_agent uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.impact.propagate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO r FROM graph.impact_triggers WHERE trigger_id = p_trigger_id AND tenant_id = p_tenant AND domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'impact trigger rejected (unknown_trigger): no trigger % in this domain', p_trigger_id USING ERRCODE = '23503'; END IF;
  IF r.state = 'walked' THEN RETURN false; END IF;
  SELECT a.agent_id INTO v_agent FROM graph.propagation_agents a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.status = 'active' AND a.principal_id = public.eye_principal();
  IF v_agent IS NULL THEN
    RAISE EXCEPTION 'impact trigger rejected (actor): a trigger is walked by the domain''s active propagation agent, not by %', public.eye_principal() USING ERRCODE = '42501';
  END IF;
  UPDATE graph.impact_triggers SET state = 'walking', attempts = attempts + 1, agent_id = v_agent, last_error = NULL WHERE trigger_id = p_trigger_id;
  INSERT INTO graph.impact_trigger_events (event_id, scope, tenant_id, domain_id, trigger_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_trigger_id, 'trigger.walking', public.eye_principal(), jsonb_build_object('attempt', r.attempts + 1, 'agent_id', v_agent), r.correlation_id);
  RETURN true;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.impact_trigger_begin(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.impact_trigger_begin(uuid, uuid, uuid) TO eye_commit;

-- DONE: the trigger may claim only an ASSESSED walk of ITS kind of ITS object, opened by the walking agent.
CREATE OR REPLACE FUNCTION graph.impact_trigger_done(p_trigger_id uuid, p_tenant uuid, p_domain uuid, p_invalidation_id uuid) RETURNS void
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r graph.impact_triggers%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.impact.propagate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO r FROM graph.impact_triggers WHERE trigger_id = p_trigger_id AND tenant_id = p_tenant AND domain_id = p_domain FOR UPDATE;
  IF NOT FOUND OR r.state <> 'walking' THEN
    RAISE EXCEPTION 'impact trigger rejected (state): trigger % is not walking', p_trigger_id USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM graph.invalidations_current i WHERE i.invalidation_id = p_invalidation_id AND i.tenant_id = p_tenant AND i.domain_id = p_domain
                    AND i.trigger_kind = r.trigger_kind AND i.trigger_object_id = r.object_id AND i.state = 'assessed' AND i.opened_by = public.eye_principal()) THEN
    RAISE EXCEPTION 'impact trigger rejected (unknown_invalidation): % is not an assessed % walk of % by this agent', p_invalidation_id, r.trigger_kind, r.object_id USING ERRCODE = '23503';
  END IF;
  UPDATE graph.impact_triggers SET state = 'walked', invalidation_id = p_invalidation_id, walked_at = clock_timestamp() WHERE trigger_id = p_trigger_id;
  INSERT INTO graph.impact_trigger_events (event_id, scope, tenant_id, domain_id, trigger_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_trigger_id, 'trigger.walked', public.eye_principal(),
          jsonb_build_object('invalidation_id', p_invalidation_id, 'agent_id', r.agent_id,
                             'truncated', (SELECT i.truncated FROM graph.invalidations_current i WHERE i.invalidation_id = p_invalidation_id)), r.correlation_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.impact_trigger_done(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.impact_trigger_done(uuid, uuid, uuid, uuid) TO eye_commit;

-- FAIL (schedule capability): a walk that could not run or did not finish, with its reason; a walked trigger is never failed afterwards.
CREATE OR REPLACE FUNCTION graph.impact_trigger_fail(p_trigger_id uuid, p_tenant uuid, p_domain uuid, p_error text) RETURNS text
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r graph.impact_triggers%ROWTYPE;
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  SELECT * INTO r FROM graph.impact_triggers WHERE trigger_id = p_trigger_id AND tenant_id = p_tenant AND domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'impact trigger rejected (unknown_trigger): no trigger % in this domain', p_trigger_id USING ERRCODE = '23503'; END IF;
  IF r.state = 'walked' THEN RETURN 'walked'; END IF;
  UPDATE graph.impact_triggers SET state = 'failed', last_error = left(coalesce(p_error, 'no reason recorded'), 500) WHERE trigger_id = p_trigger_id;
  INSERT INTO graph.impact_trigger_events (event_id, scope, tenant_id, domain_id, trigger_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_trigger_id, 'trigger.failed', NULL, jsonb_build_object('error', left(coalesce(p_error, 'no reason recorded'), 500), 'attempts', r.attempts), r.correlation_id);
  RETURN 'failed';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.impact_trigger_fail(uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.impact_trigger_fail(uuid, uuid, uuid, text) TO eye_commit;

-- WHAT A COLD PROCESS RE-DRIVES (schedule capability; read-only): unwalked triggers — recorded, failed, or walking with no progress for ten
-- minutes (an interrupted walk) — in domains with an active propagation agent.
CREATE OR REPLACE FUNCTION graph.impact_triggers_to_walk() RETURNS TABLE (trigger_id uuid, tenant_id uuid, domain_id uuid, state text, attempts int)
SECURITY DEFINER SET search_path = graph, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM ctx.assert_capability('schedule', 'scheduler', 'observation.schedule.reconcile');
  RETURN QUERY SELECT t.trigger_id, t.tenant_id, t.domain_id, t.state, t.attempts FROM graph.impact_triggers t
    WHERE (t.state IN ('recorded', 'failed')
           OR (t.state = 'walking' AND NOT EXISTS (SELECT 1 FROM graph.impact_trigger_events e WHERE e.trigger_id = t.trigger_id AND e.occurred_at > clock_timestamp() - interval '10 minutes')))
      AND EXISTS (SELECT 1 FROM graph.propagation_agents a WHERE a.tenant_id = t.tenant_id AND a.domain_id = t.domain_id AND a.status = 'active')
    ORDER BY t.recorded_at, t.trigger_id;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.impact_triggers_to_walk() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.impact_triggers_to_walk() TO eye_commit;
