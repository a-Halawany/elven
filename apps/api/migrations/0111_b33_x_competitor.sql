-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §CI COMPETITOR INTELLIGENCE (F-P4-15 chapter 29: PR-29-001/-002/-003/-005/-006, CAP-FW-06 v08+v09, AT-29, JRN-10 v08+v09; F-P5-01's
-- "families populated" — the competitor and market twins). Part-local file of 0111 (applied after §0; folded last, after §PK). Prefix `dci_`
-- (triggers, indexes, private functions); tables in schema `domain`; actions `domain.competitor.*`; refusals in the CLASS form
-- `competitor profile|competitor comparison|competitor assessment|competitor watchlist rejected (<class>): …`.
--
-- WHAT IT IS. A competitor is bound to a graph ORGANIZATION entity (identity through the graph's own resolution: a fact rests on evidence whose
-- mentions the graph resolved to that entity). Its PROFILE is temporal and versioned (each version effective from a day, recorded at an
-- instant — "what was believed at T" replays by record time; "what held on day D" by effective time); each fact cites claims/evidence with a
-- confidence. The Domain Intelligence Agent (task domain_scan, its own session) and named people PROPOSE events, profile updates and
-- interpretations; a NAMED ANALYST (domain_analyst, never the proposer, never an agent; digest-bound) APPROVES a material assessment → a new
-- profile version (a CPF object), its events, its interpretation (an assessment). An approved change matching a WATCHLIST rule raises
-- `domain.alert` under the PUBLISHED attention policy (executive.b33_raise_routed, the watchlist's owner named). COMPARISONS rest on a
-- declared, versioned BASIS (metric definitions, units, period, population): incompatible definitions are REFUSED, a comparison whose basis or
-- profile moved is SUSPENDED. SOURCE DIVERSITY is measured (distinct publishers and contracts; correlated and single-origin sources flagged;
-- below the package's threshold → LIMITED). THE CONTINUITY CONTRACT (PR-29-005): a mistaken identity (a resolution superseded by a split, a
-- mention rejected), correlated/manipulated sources, incompatible definitions, conflicting evidence (intelligence.contradictions) and stale
-- coverage (the watchlist's freshness) mark the profile/assessment LIMITED (a new version; nothing rewritten), preserve the conflicting
-- evidence, suspend invalid comparisons and ROUTE revalidation. The executives' RESPONSE is a decision in the decision layer — nothing here
-- decides; decision use is recorded (which decision package cited which profile version).
--
-- Every write consults the PACKAGE_GATE seam (domain.package_function_state) for the competitor's package and the function it serves:
-- profile · collect · assess · compare · alert · twin. Refused `<noun> rejected (package): <reason>` (422).
-- BOUNDARY (R7): package signing/publisher → B77; all-layer namespaces → B78; marketplace/purchase → B112; parity → B111; the signed
-- acceptance record (AT-29 / PR-29-006) → R2 — this file holds the SOFTWARE part (fixtures in phase6-competitor-b33). Every figure a harness
-- or an act seeds through it is SYNTHETIC; a public feed (GDELT) never closes a licensed-source clause.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §CI.1 THE TABLES ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/* A COMPETITOR — bound to one graph ORGANIZATION entity of the domain, under one competitor package; its owner is the analyst who answers for
   the profile. twin_id: the competitor twin it populates (CI8), bound by that twin's owner. */
CREATE TABLE domain.competitors (
  competitor_id      uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  package_key        text NOT NULL CHECK (package_key ~ '^[a-z][a-z0-9-]{1,40}$'),
  entity_id          uuid NOT NULL,
  name               text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 200),
  owner_principal_id uuid NOT NULL,
  twin_id            uuid,
  twin_bound_by      uuid,
  twin_bound_at      timestamptz,
  state              text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'retired')),
  retired_at         timestamptz,
  retired_by         uuid,
  retire_reason      text,
  created_by         uuid NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT dci_comp_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dci_comp_twin_bound CHECK ((twin_id IS NULL) = (twin_bound_at IS NULL) AND (twin_bound_at IS NULL) = (twin_bound_by IS NULL)),
  CONSTRAINT dci_comp_retired CHECK ((state = 'retired') = (retired_at IS NOT NULL) AND (retired_at IS NULL) = (retired_by IS NULL)
                                     AND (retire_reason IS NULL OR length(btrim(retire_reason)) >= 8))
);
CREATE UNIQUE INDEX dci_comp_one_per_entity ON domain.competitors (tenant_id, domain_id, entity_id) WHERE state = 'active';

/* A PROPOSAL — events, profile changes and an interpretation PROPOSED by the agent (inside its running scan) or a person; decided by a named
   analyst. content = {effective_from, events: [{kind, place_entity_id?, place?, market?, effective_date, details, citations}],
   changes: [{op: add|replace|end, fact: {key, kind, value, citations, confidence}}], interpretation: {statement, confidence} | null}.
   The proposal records, at proposal time, the source diversity, the identity basis of every cited evidence and the open contradictions. */
CREATE TABLE domain.competitor_proposals (
  proposal_id        uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  competitor_id      uuid NOT NULL REFERENCES domain.competitors (competitor_id),
  base_version       int,
  content            jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  content_digest     text NOT NULL CHECK (content_digest ~ '^[0-9a-f]{64}$'),
  material           boolean NOT NULL,
  material_reasons   jsonb NOT NULL DEFAULT '[]'::jsonb,
  citations          jsonb NOT NULL CHECK (jsonb_typeof(citations) = 'array' AND jsonb_array_length(citations) >= 1),
  source_diversity   jsonb NOT NULL,
  identity           jsonb NOT NULL,
  contradictions     jsonb NOT NULL DEFAULT '[]'::jsonb,
  package_version    int NOT NULL,
  state              text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'approved', 'declined', 'withdrawn', 'superseded')),
  proposed_by        uuid NOT NULL,
  proposed_via       text NOT NULL CHECK (proposed_via IN ('person', 'agent')),
  agent_id           uuid,
  run_id             uuid,
  proposed_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_by         uuid,
  decided_at         timestamptz,
  decision_reason    text,
  result_version     int,
  correlation_id     uuid NOT NULL,
  CONSTRAINT dci_prop_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dci_prop_agent CHECK ((proposed_via = 'agent') = (agent_id IS NOT NULL AND run_id IS NOT NULL)),
  CONSTRAINT dci_prop_decided CHECK ((state IN ('proposed')) = (decided_at IS NULL) AND (decided_at IS NULL) = (decided_by IS NULL)),
  CONSTRAINT dci_prop_reason CHECK (state NOT IN ('declined', 'withdrawn', 'superseded') OR length(btrim(coalesce(decision_reason, ''))) >= 8),
  CONSTRAINT dci_prop_result CHECK ((state = 'approved') = (result_version IS NOT NULL))
);
CREATE UNIQUE INDEX dci_prop_one_open ON domain.competitor_proposals (competitor_id, content_digest) WHERE state = 'proposed';
CREATE INDEX dci_prop_scope_idx ON domain.competitor_proposals (tenant_id, domain_id, state, proposed_at DESC);

/* A PROFILE VERSION — TEMPORAL (effective_from: the day it holds from; recorded_at: when it was believed) and immutable once written: a
   change is a new version (approved | limited), the prior one superseded. facts = [{key, kind, value, citations, confidence, limited,
   limited_reasons, from_proposal}]. A CPF canonical object per version (cpf_digest bound in the same transaction). */
CREATE TABLE domain.competitor_profile_versions (
  competitor_id      uuid NOT NULL REFERENCES domain.competitors (competitor_id),
  version            int NOT NULL CHECK (version >= 1),
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  effective_from     date NOT NULL,
  facts              jsonb NOT NULL CHECK (jsonb_typeof(facts) = 'array'),
  state              text NOT NULL CHECK (state IN ('approved', 'limited', 'superseded')),
  limited_reasons    jsonb NOT NULL DEFAULT '[]'::jsonb,
  cause              text NOT NULL CHECK (cause IN ('approval', 'revalidation')),
  proposal_id        uuid,
  approved_by        uuid NOT NULL,
  approved_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  supersedes         int,
  superseded_at      timestamptz,
  package_version    int NOT NULL,
  source_diversity   jsonb NOT NULL DEFAULT '{}'::jsonb,
  identity           jsonb NOT NULL DEFAULT '{}'::jsonb,
  cpf_digest         text CHECK (cpf_digest IS NULL OR cpf_digest ~ '^[0-9a-f]{64}$'),
  recorded_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  PRIMARY KEY (competitor_id, version),
  CONSTRAINT dci_pv_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dci_pv_superseded CHECK ((state = 'superseded') = (superseded_at IS NOT NULL)),
  CONSTRAINT dci_pv_limited CHECK (state <> 'limited' OR jsonb_array_length(limited_reasons) >= 1)
);
CREATE UNIQUE INDEX dci_pv_one_head ON domain.competitor_profile_versions (competitor_id) WHERE state <> 'superseded';

/* AN EVENT — an action or movement of the competitor (a plant opened at a PLACE entity, a product launched, a market entered …), effective
   on a day, recorded by the approval that accepted it. limited when the evidence it rests on is found wanting (revalidation). */
CREATE TABLE domain.competitor_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  competitor_id      uuid NOT NULL REFERENCES domain.competitors (competitor_id),
  kind               text NOT NULL CHECK (kind IN ('plant_opened', 'plant_closed', 'capacity_change', 'product_launched', 'market_entry', 'market_exit',
                                                   'acquisition', 'partnership', 'pricing_move', 'other')),
  place_entity_id    uuid,
  effective_date     date NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  citations          jsonb NOT NULL CHECK (jsonb_typeof(citations) = 'array' AND jsonb_array_length(citations) >= 1),
  proposal_id        uuid NOT NULL,
  profile_version    int NOT NULL,
  state              text NOT NULL DEFAULT 'recorded' CHECK (state IN ('recorded', 'limited')),
  limited_reason     text,
  approved_by        uuid NOT NULL,
  recorded_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT dci_ev_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dci_ev_limited CHECK ((state = 'limited') = (limited_reason IS NOT NULL))
);
CREATE INDEX dci_ev_comp ON domain.competitor_events (competitor_id, effective_date);

/* AN ASSESSMENT — the approved INTERPRETATION of a proposal (kind interpretation), versioned: a challenge upheld supersedes it with a new
   version; a revalidation limits it. */
CREATE TABLE domain.competitor_assessments (
  assessment_id      uuid NOT NULL,
  version            int NOT NULL CHECK (version >= 1),
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  competitor_id      uuid NOT NULL REFERENCES domain.competitors (competitor_id),
  kind               text NOT NULL CHECK (kind IN ('interpretation')),
  statement          text NOT NULL CHECK (length(btrim(statement)) >= 8),
  confidence         numeric NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  material           boolean NOT NULL,
  evidence           jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'array' AND jsonb_array_length(evidence) >= 1),
  source_diversity   jsonb NOT NULL,
  state              text NOT NULL CHECK (state IN ('approved', 'limited', 'superseded')),
  limited_reasons    jsonb NOT NULL DEFAULT '[]'::jsonb,
  proposal_id        uuid,
  challenge_id       uuid,
  profile_version    int NOT NULL,
  approved_by        uuid NOT NULL,
  approved_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  superseded_at      timestamptz,
  correlation_id     uuid NOT NULL,
  PRIMARY KEY (assessment_id, version),
  CONSTRAINT dci_as_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dci_as_superseded CHECK ((state = 'superseded') = (superseded_at IS NOT NULL)),
  CONSTRAINT dci_as_limited CHECK (state <> 'limited' OR jsonb_array_length(limited_reasons) >= 1)
);
CREATE UNIQUE INDEX dci_as_one_head ON domain.competitor_assessments (assessment_id) WHERE state <> 'superseded';

/* A COMPARISON BASIS — declared and VERSIONED: metrics [{key, fact_kind, definition, unit, period, population}]. A new version supersedes
   the prior; the comparisons on a superseded basis whose definitions changed are SUSPENDED. */
CREATE TABLE domain.competitor_comparison_bases (
  basis_key          text NOT NULL CHECK (basis_key ~ '^[a-z][a-z0-9-]{1,60}$'),
  version            int NOT NULL CHECK (version >= 1),
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  title              text NOT NULL CHECK (length(btrim(title)) >= 4),
  metrics            jsonb NOT NULL CHECK (jsonb_typeof(metrics) = 'array' AND jsonb_array_length(metrics) >= 1),
  digest             text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  state              text NOT NULL CHECK (state IN ('active', 'superseded')),
  declared_by        uuid NOT NULL,
  declared_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  superseded_at      timestamptz,
  correlation_id     uuid NOT NULL,
  PRIMARY KEY (tenant_id, domain_id, basis_key, version),
  CONSTRAINT dci_cb_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dci_cb_superseded CHECK ((state = 'superseded') = (superseded_at IS NOT NULL))
);
CREATE UNIQUE INDEX dci_cb_one_active ON domain.competitor_comparison_bases (tenant_id, domain_id, basis_key) WHERE state = 'active';

/* A COMPARISON — competitors compared on one basis version: rows [{competitor_id, profile_version, metric, value, unit, period, population,
   citations}]; state current | limited (diversity below threshold, a limited profile) | suspended (the basis or a profile moved on). */
CREATE TABLE domain.competitor_comparisons (
  comparison_id      uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  basis_key          text NOT NULL,
  basis_version      int NOT NULL,
  competitor_ids     uuid[] NOT NULL CHECK (cardinality(competitor_ids) >= 2),
  rows               jsonb NOT NULL CHECK (jsonb_typeof(rows) = 'array'),
  source_diversity   jsonb NOT NULL,
  state              text NOT NULL CHECK (state IN ('current', 'limited', 'suspended')),
  limited_reasons    jsonb NOT NULL DEFAULT '[]'::jsonb,
  suspended_reason   text,
  suspended_at       timestamptz,
  compared_by        uuid NOT NULL,
  compared_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT dci_cmp_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dci_cmp_suspended CHECK ((state = 'suspended') = (suspended_at IS NOT NULL) AND (suspended_at IS NULL) = (suspended_reason IS NULL)),
  FOREIGN KEY (tenant_id, domain_id, basis_key, basis_version) REFERENCES domain.competitor_comparison_bases (tenant_id, domain_id, basis_key, version)
);

/* A COMPETITOR WATCHLIST (CI5's choice: §CI keeps its own — §PK's domain.watchlists is not the prelude's seam): its owner (named on every
   alert), the competitors it watches (empty = every competitor of the package), rules [{rule_key, event_kinds, fact_kinds, markets}] and the
   FRESHNESS of its coverage (days; a watched competitor with no evidence that recent is STALE). */
CREATE TABLE domain.competitor_watchlists (
  watchlist_id       uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  package_key        text NOT NULL,
  title              text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 200),
  owner_principal_id uuid NOT NULL,
  competitor_ids     uuid[] NOT NULL DEFAULT '{}',
  rules              jsonb NOT NULL CHECK (jsonb_typeof(rules) = 'array' AND jsonb_array_length(rules) >= 1),
  freshness_days     int NOT NULL CHECK (freshness_days BETWEEN 1 AND 3650),
  state              text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'retired')),
  created_by         uuid NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  retired_at         timestamptz,
  retired_by         uuid,
  retire_reason      text,
  correlation_id     uuid NOT NULL,
  CONSTRAINT dci_wl_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dci_wl_retired CHECK ((state = 'retired') = (retired_at IS NOT NULL) AND (retired_at IS NULL) = (retired_by IS NULL))
);

/* AN ALERT — one per (watchlist, rule, approval): the routed item it raised (domain.alert, subject competitor_profile = the competitor). */
CREATE TABLE domain.competitor_alerts (
  alert_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  watchlist_id       uuid NOT NULL REFERENCES domain.competitor_watchlists (watchlist_id),
  rule_key           text NOT NULL,
  competitor_id      uuid NOT NULL REFERENCES domain.competitors (competitor_id),
  proposal_id        uuid NOT NULL,
  profile_version    int NOT NULL,
  item_id            uuid NOT NULL,
  item_state         text NOT NULL,
  limited            boolean NOT NULL,
  raised_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT dci_al_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dci_al_once UNIQUE (watchlist_id, rule_key, proposal_id)
);

/* A REVALIDATION — routed when identity is mistaken, coverage stale or evidence in conflict; resolved by a later approved profile version. */
CREATE TABLE domain.competitor_revalidations (
  revalidation_id    uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  competitor_id      uuid NOT NULL REFERENCES domain.competitors (competitor_id),
  profile_version    int,
  reason_class       text NOT NULL CHECK (reason_class IN ('identity', 'coverage', 'contradiction')),
  details            jsonb NOT NULL,
  item_id            uuid,
  state              text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'resolved')),
  opened_by          uuid NOT NULL,
  opened_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  resolved_by        uuid,
  resolved_at        timestamptz,
  resolution         text,
  correlation_id     uuid NOT NULL,
  CONSTRAINT dci_rv_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dci_rv_resolved CHECK ((state = 'resolved') = (resolved_at IS NOT NULL) AND (resolved_at IS NULL) = (resolved_by IS NULL))
);
CREATE UNIQUE INDEX dci_rv_one_open ON domain.competitor_revalidations (competitor_id, reason_class) WHERE state = 'open';

/* AN ANALYST CHALLENGE of an assessment version: upheld (by another analyst) → a superseding version; dismissed → recorded with its reason. */
CREATE TABLE domain.competitor_challenges (
  challenge_id       uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  assessment_id      uuid NOT NULL,
  assessment_version int NOT NULL,
  challenger         uuid NOT NULL,
  reason             text NOT NULL CHECK (length(btrim(reason)) >= 8),
  proposed           jsonb NOT NULL CHECK (jsonb_typeof(proposed) = 'object'),
  state              text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'upheld', 'dismissed')),
  decided_by         uuid,
  decided_at         timestamptz,
  decision_reason    text,
  result_version     int,
  opened_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT dci_ch_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dci_ch_decided CHECK ((state = 'open') = (decided_at IS NULL) AND (decided_at IS NULL) = (decided_by IS NULL)
                                   AND (state = 'open' OR length(btrim(coalesce(decision_reason, ''))) >= 8)),
  CONSTRAINT dci_ch_upheld CHECK ((state = 'upheld') = (result_version IS NOT NULL)),
  FOREIGN KEY (assessment_id, assessment_version) REFERENCES domain.competitor_assessments (assessment_id, version)
);
CREATE UNIQUE INDEX dci_ch_one_open ON domain.competitor_challenges (assessment_id) WHERE state = 'open';

/* DECISION-USE EVIDENCE — which decision package cited which profile version (the response is the executives', decided in the decision layer). */
CREATE TABLE domain.competitor_decision_uses (
  use_id             uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  competitor_id      uuid NOT NULL REFERENCES domain.competitors (competitor_id),
  profile_version    int NOT NULL,
  package_id         uuid NOT NULL,
  note               text NOT NULL CHECK (length(btrim(note)) >= 8),
  cited_by           uuid NOT NULL,
  cited_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT dci_du_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dci_du_once UNIQUE (package_id, competitor_id, profile_version),
  FOREIGN KEY (competitor_id, profile_version) REFERENCES domain.competitor_profile_versions (competitor_id, version)
);

/* A CAPACITY CHANGE PROPOSED TO THE COMPETITOR TWIN'S OWNER (CI8): raised by the approval of a capacity-bearing event; the twin's owner
   applies it through the existing twin version/ground/admit routes (the owner's own act) and records it applied against the admitted
   version, or declines it with a reason. */
CREATE TABLE domain.competitor_twin_proposals (
  proposal_id        uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  competitor_id      uuid NOT NULL REFERENCES domain.competitors (competitor_id),
  twin_id            uuid NOT NULL,
  key                text NOT NULL,
  unit               text NOT NULL,
  current_value      numeric,
  delta              numeric NOT NULL,
  proposed_value     numeric NOT NULL,
  basis              jsonb NOT NULL,
  state              text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'applied', 'declined', 'superseded')),
  decided_by         uuid,
  decided_at         timestamptz,
  note               text,
  applied_version    int,
  proposed_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT dci_tp_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dci_tp_applied CHECK ((state = 'applied') = (applied_version IS NOT NULL)),
  CONSTRAINT dci_tp_decided CHECK ((state IN ('applied', 'declined')) = (decided_by IS NOT NULL))
);

/* THE AGENT'S SCAN MARKS (append-only): per run and competitor, the record-time watermark it read to and what it found. */
CREATE TABLE domain.competitor_scan_marks (
  mark_id            uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  competitor_id      uuid NOT NULL REFERENCES domain.competitors (competitor_id),
  agent_id           uuid NOT NULL,
  run_id             uuid NOT NULL,
  watermark          timestamptz NOT NULL,
  claims_seen        int NOT NULL CHECK (claims_seen >= 0),
  proposed           int NOT NULL CHECK (proposed >= 0),
  recorded_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT dci_sm_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX dci_sm_comp ON domain.competitor_scan_marks (competitor_id, watermark DESC);

/* THE LEDGER (append-only): every lifecycle step of §CI's records, with its actor. */
CREATE TABLE domain.competitor_ledger (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  competitor_id      uuid,
  subject_kind       text NOT NULL CHECK (subject_kind IN ('competitor', 'proposal', 'profile', 'assessment', 'basis', 'comparison', 'watchlist', 'alert',
                                                           'revalidation', 'challenge', 'decision_use', 'twin_proposal')),
  subject_id         uuid NOT NULL,
  event              text NOT NULL CHECK (event IN ('competitor.declared', 'competitor.retired', 'competitor.twin_bound',
    'proposal.proposed', 'proposal.approved', 'proposal.declined', 'proposal.withdrawn', 'proposal.superseded',
    'profile.versioned', 'profile.limited', 'assessment.approved', 'assessment.limited', 'assessment.superseded',
    'basis.declared', 'comparison.recorded', 'comparison.suspended', 'watchlist.declared', 'watchlist.retired', 'alert.raised',
    'revalidation.opened', 'revalidation.resolved', 'challenge.opened', 'challenge.upheld', 'challenge.dismissed',
    'decision.cited', 'twin.proposed', 'twin.applied', 'twin.declined', 'twin.superseded')),
  actor_principal_id uuid NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT dci_lg_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX dci_lg_comp ON domain.competitor_ledger (competitor_id, occurred_at);
CREATE TRIGGER dci_ledger_append_only BEFORE UPDATE OR DELETE ON domain.competitor_ledger FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TRIGGER dci_scan_marks_append_only BEFORE UPDATE OR DELETE ON domain.competitor_scan_marks FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- §CI.2 THE GUARDS — nothing is deleted; identity and content columns never change; states move forward only. ──────────────────────────
CREATE OR REPLACE FUNCTION domain.dci_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = domain, pg_catalog, pg_temp AS $$
DECLARE v_noun text := CASE TG_TABLE_NAME WHEN 'competitor_comparisons' THEN 'competitor comparison' WHEN 'competitor_comparison_bases' THEN 'competitor comparison'
                                          WHEN 'competitor_assessments' THEN 'competitor assessment' WHEN 'competitor_challenges' THEN 'competitor assessment'
                                          WHEN 'competitor_watchlists' THEN 'competitor watchlist' ELSE 'competitor profile' END;
        o jsonb; n jsonb; k text; v_mutable text[];
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION '% rejected (state): a % row is never deleted (it is superseded, retired or resolved)', v_noun, TG_TABLE_NAME USING ERRCODE = '2F002'; END IF;
  v_mutable := CASE TG_TABLE_NAME
    WHEN 'competitors' THEN ARRAY['twin_id', 'twin_bound_by', 'twin_bound_at', 'state', 'retired_at', 'retired_by', 'retire_reason']
    WHEN 'competitor_proposals' THEN ARRAY['state', 'decided_by', 'decided_at', 'decision_reason', 'result_version']
    WHEN 'competitor_profile_versions' THEN ARRAY['state', 'superseded_at', 'cpf_digest']
    WHEN 'competitor_events' THEN ARRAY['state', 'limited_reason']
    WHEN 'competitor_assessments' THEN ARRAY['state', 'superseded_at']
    WHEN 'competitor_comparison_bases' THEN ARRAY['state', 'superseded_at']
    WHEN 'competitor_comparisons' THEN ARRAY['state', 'suspended_reason', 'suspended_at']
    WHEN 'competitor_watchlists' THEN ARRAY['state', 'retired_at', 'retired_by', 'retire_reason']
    WHEN 'competitor_alerts' THEN ARRAY['item_state']
    WHEN 'competitor_revalidations' THEN ARRAY['state', 'resolved_by', 'resolved_at', 'resolution', 'item_id']
    WHEN 'competitor_challenges' THEN ARRAY['state', 'decided_by', 'decided_at', 'decision_reason', 'result_version']
    WHEN 'competitor_twin_proposals' THEN ARRAY['state', 'decided_by', 'decided_at', 'note', 'applied_version']
    ELSE ARRAY[]::text[] END;
  o := to_jsonb(OLD); n := to_jsonb(NEW);
  FOR k IN SELECT jsonb_object_keys(o) LOOP
    IF NOT (k = ANY (v_mutable)) AND (o -> k) IS DISTINCT FROM (n -> k) THEN
      RAISE EXCEPTION '% rejected (state): column % of % never changes (a change is a new version or a new record)', v_noun, k, TG_TABLE_NAME USING ERRCODE = '2F002';
    END IF;
  END LOOP;
  -- a write-once binding stays as written; a terminal state is kept as it was
  IF TG_TABLE_NAME = 'competitor_profile_versions' AND OLD.cpf_digest IS NOT NULL AND NEW.cpf_digest IS DISTINCT FROM OLD.cpf_digest THEN
    RAISE EXCEPTION 'competitor profile rejected (state): version % carries its CPF object already', OLD.version USING ERRCODE = '2F002';
  END IF;
  IF TG_TABLE_NAME = 'competitors' AND OLD.twin_id IS NOT NULL AND NEW.twin_id IS DISTINCT FROM OLD.twin_id THEN
    RAISE EXCEPTION 'competitor profile rejected (state): the competitor is bound to twin % already', OLD.twin_id USING ERRCODE = '2F002';
  END IF;
  IF (o ->> 'state') IN ('retired', 'superseded', 'declined', 'withdrawn', 'resolved', 'upheld', 'dismissed', 'applied')
     AND (o ->> 'state') IS DISTINCT FROM (n ->> 'state') THEN
    RAISE EXCEPTION '% rejected (state): a % row in state % is kept as it was', v_noun, TG_TABLE_NAME, o ->> 'state' USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION domain.dci_guard() FROM PUBLIC;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['competitors', 'competitor_proposals', 'competitor_profile_versions', 'competitor_events', 'competitor_assessments',
                           'competitor_comparison_bases', 'competitor_comparisons', 'competitor_watchlists', 'competitor_alerts', 'competitor_revalidations',
                           'competitor_challenges', 'competitor_twin_proposals', 'competitor_decision_uses'] LOOP
    EXECUTE format('CREATE TRIGGER dci_guard BEFORE UPDATE OR DELETE ON domain.%I FOR EACH ROW EXECUTE FUNCTION domain.dci_guard()', t);
  END LOOP;
END $$;

-- RLS and grants: the 0081 loop idiom (policy domain_isolation — the prelude's text for schema domain; SELECT to eye_app and eye_commit;
-- no write grant: the definer ports write).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['competitors', 'competitor_proposals', 'competitor_profile_versions', 'competitor_events', 'competitor_assessments',
                           'competitor_comparison_bases', 'competitor_comparisons', 'competitor_watchlists', 'competitor_alerts', 'competitor_revalidations',
                           'competitor_challenges', 'competitor_decision_uses', 'competitor_twin_proposals', 'competitor_scan_marks', 'competitor_ledger'] LOOP
    EXECUTE format('REVOKE ALL ON domain.%I FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE domain.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE domain.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY domain_isolation ON domain.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON domain.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- The CPF canonical write (§0.6: the competitor profile version's object is §CI's): the two acts that write a profile version admit its CPF.
INSERT INTO observation.canonical_write_actions (action, object_types, rationale) VALUES
  ('domain.competitor.assessment.approve', ARRAY['CPF'], 'B33 §CI (0111): an analyst''s approval of a material assessment admits the new competitor profile version as a CPF object'),
  ('domain.competitor.revalidate', ARRAY['CPF'], 'B33 §CI (0111): a revalidation that finds a fact resting on a mistaken identity or conflicting evidence admits the LIMITED profile version as a CPF object')
ON CONFLICT (action) DO NOTHING;

-- §CI.3 THE READS (INVOKER, plain SQL under the caller's RLS — the N-01 rule) ──────────────────────────────────────────────────────

/* THE COMPETITOR PACKAGE'S MANIFEST SECTION (the active version's `competitor` section; the defaults when the package declares none). */
CREATE OR REPLACE FUNCTION domain.dci_manifest(p_tenant uuid, p_domain uuid, p_package_key text) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = domain, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
           'material', jsonb_build_object('event_kinds', '["plant_opened","plant_closed","capacity_change","market_entry","market_exit","acquisition"]'::jsonb,
                                          'fact_kinds', '["facility","capability","market"]'::jsonb, 'min_confidence', 0.8),
           'diversity', jsonb_build_object('min_publishers', 2),
           'coverage', jsonb_build_object('default_freshness_days', 30),
           'twin', jsonb_build_object('key', 'capacity.per_month', 'unit', 'units/month', 'capacity_detail', 'capacity_per_month'))
         || coalesce((SELECT v.manifest -> 'competitor' FROM domain.package_versions v JOIN domain.packages k ON k.package_id = v.package_id
                       WHERE k.tenant_id = p_tenant AND k.domain_id = p_domain AND k.package_key = p_package_key AND v.state = 'active'
                         AND jsonb_typeof(v.manifest -> 'competitor') = 'object'), '{}'::jsonb)
$$;
REVOKE ALL ON FUNCTION domain.dci_manifest(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_manifest(uuid, uuid, text) TO eye_app, eye_commit;

/* The EVIDENCE a citation list rests on: evidence cited directly and the evidence each cited claim was extracted from (its lineage). */
CREATE OR REPLACE FUNCTION domain.dci_evidence_of(p_tenant uuid, p_domain uuid, p_citations jsonb) RETURNS TABLE (evidence_id uuid, via text, claim_id uuid)
LANGUAGE sql STABLE SET search_path = domain, objects, pg_catalog, pg_temp AS $$
  SELECT DISTINCT (c ->> 'id')::uuid, 'evidence', NULL::uuid FROM jsonb_array_elements(coalesce(p_citations, '[]'::jsonb)) c WHERE c ->> 'kind' = 'evidence'
  UNION
  SELECT DISTINCT (o.payload -> 'lineage' ->> 'evidence_object_id')::uuid, 'claim', o.object_id
    FROM jsonb_array_elements(coalesce(p_citations, '[]'::jsonb)) c
    JOIN objects.canonical_objects o ON o.object_id = (c ->> 'id')::uuid AND o.object_version = (c ->> 'version')::bigint
   WHERE c ->> 'kind' = 'claim' AND o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.payload -> 'lineage' ? 'evidence_object_id'
$$;
REVOKE ALL ON FUNCTION domain.dci_evidence_of(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_evidence_of(uuid, uuid, jsonb) TO eye_app, eye_commit;

/* SOURCE DIVERSITY of a citation list: the evidence → its observation → the source contract and its PUBLISHER. Distinct publishers and
   contracts are counted; CORRELATED sources are flagged — two evidence items of one publisher, or the same bytes (content digest) arriving
   through different sources (a republished release counts once). Below the package's threshold (min_publishers) → below_threshold, and the
   assessment resting on it is LIMITED. Every figure is a count over the records; nothing is imputed. */
CREATE OR REPLACE FUNCTION domain.dci_source_diversity(p_tenant uuid, p_domain uuid, p_citations jsonb, p_min_publishers int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = domain, objects, observation, pg_catalog, pg_temp AS $$
  WITH ev AS (
    SELECT DISTINCT e.evidence_id FROM domain.dci_evidence_of(p_tenant, p_domain, p_citations) e WHERE e.evidence_id IS NOT NULL
  ), rec AS (
    SELECT ev.evidence_id, d.payload ->> 'content_digest' AS bytes, obs.payload ->> 'source_id' AS source_id,
           (SELECT sc.publisher FROM observation.source_contracts_current sc WHERE sc.source_id::text = obs.payload ->> 'source_id' ORDER BY sc.contract_version DESC LIMIT 1) AS publisher,
           (SELECT sc.source_key FROM observation.source_contracts_current sc WHERE sc.source_id::text = obs.payload ->> 'source_id' ORDER BY sc.contract_version DESC LIMIT 1) AS source_key,
           (SELECT sc.data_origin FROM observation.source_contracts_current sc WHERE sc.source_id::text = obs.payload ->> 'source_id' ORDER BY sc.contract_version DESC LIMIT 1) AS data_origin
      FROM ev
      LEFT JOIN LATERAL (SELECT x.payload, x.source_object_ids FROM objects.canonical_objects x WHERE x.object_id = ev.evidence_id AND x.object_type = 'EVD'
                          AND x.tenant_id = p_tenant ORDER BY x.object_version DESC LIMIT 1) d ON true
      LEFT JOIN LATERAL (SELECT y.payload FROM objects.canonical_objects y
                          WHERE y.object_type = 'OBS' AND y.tenant_id = p_tenant
                            AND y.object_id = (SELECT substr(s, 5)::uuid FROM jsonb_array_elements_text(coalesce(d.source_object_ids, '[]'::jsonb)) s WHERE s LIKE 'OBS:%' LIMIT 1)
                          ORDER BY y.object_version DESC LIMIT 1) obs ON true
  ), agg AS (
    SELECT count(*)::int AS evidence, count(DISTINCT coalesce(publisher, 'unknown:' || evidence_id::text))::int AS publishers,
           count(DISTINCT coalesce(source_key, 'unknown:' || evidence_id::text))::int AS contracts,
           coalesce(jsonb_agg(DISTINCT publisher) FILTER (WHERE publisher IS NOT NULL), '[]'::jsonb) AS publisher_list,
           coalesce(jsonb_agg(DISTINCT source_key) FILTER (WHERE source_key IS NOT NULL), '[]'::jsonb) AS contract_list,
           coalesce(jsonb_agg(DISTINCT data_origin) FILTER (WHERE data_origin IS NOT NULL), '[]'::jsonb) AS origins,
           count(*) FILTER (WHERE publisher IS NULL)::int AS unknown_origin
      FROM rec
  ), corr AS (
    SELECT coalesce(jsonb_agg(x), '[]'::jsonb) AS correlated FROM (
      SELECT jsonb_build_object('kind', 'same_publisher', 'publisher', publisher, 'evidence', jsonb_agg(evidence_id ORDER BY evidence_id)) AS x
        FROM rec WHERE publisher IS NOT NULL GROUP BY publisher HAVING count(*) > 1
      UNION ALL
      SELECT jsonb_build_object('kind', 'same_bytes', 'content_digest', bytes, 'evidence', jsonb_agg(evidence_id ORDER BY evidence_id), 'sources', jsonb_agg(DISTINCT source_key))
        FROM rec WHERE bytes IS NOT NULL GROUP BY bytes HAVING count(DISTINCT coalesce(source_key, '')) > 1) q
  ), indep AS (
    -- the INDEPENDENT origins: publishers, after the same-bytes republications are folded onto the first publisher that carried them
    SELECT count(DISTINCT first_pub)::int AS independent FROM (
      SELECT coalesce((SELECT min(r2.publisher) FROM rec r2 WHERE r2.bytes = r.bytes), r.publisher, 'unknown:' || r.evidence_id::text) AS first_pub FROM rec r) z
  )
  SELECT jsonb_build_object('evidence', agg.evidence, 'publishers', agg.publishers, 'contracts', agg.contracts, 'independent_publishers', indep.independent,
                            'publisher_list', agg.publisher_list, 'contract_list', agg.contract_list, 'data_origins', agg.origins, 'unknown_origin', agg.unknown_origin,
                            'correlated', corr.correlated, 'single_origin', indep.independent <= 1, 'threshold', p_min_publishers,
                            'below_threshold', indep.independent < p_min_publishers)
    FROM agg, corr, indep
$$;
REVOKE ALL ON FUNCTION domain.dci_source_diversity(uuid, uuid, jsonb, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_source_diversity(uuid, uuid, jsonb, int) TO eye_app, eye_commit;

/* IDENTITY through the graph's resolution: per evidence item, whether a mention extracted from it is ACCEPTED as the competitor's entity
   (resolved), WAS and no longer is — superseded by a split, or rejected (mistaken), or never was (unresolved). */
CREATE OR REPLACE FUNCTION domain.dci_identity(p_tenant uuid, p_domain uuid, p_entity uuid, p_citations jsonb) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = domain, graph, pg_catalog, pg_temp AS $$
  WITH ev AS (SELECT DISTINCT e.evidence_id FROM domain.dci_evidence_of(p_tenant, p_domain, p_citations) e WHERE e.evidence_id IS NOT NULL),
  per AS (
    SELECT ev.evidence_id,
           EXISTS (SELECT 1 FROM graph.resolutions_current r WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.evidence_object_id = ev.evidence_id
                     AND r.entity_id = p_entity AND r.state = 'accepted') AS resolved,
           (SELECT jsonb_agg(jsonb_build_object('resolution_id', r.resolution_id, 'state', r.state, 'mention', r.mention_text,
                                                'now_entity', (SELECT r2.entity_id FROM graph.resolutions_current r2 WHERE r2.resolution_id = r.superseded_by)) ORDER BY r.resolution_id)
              FROM graph.resolutions_current r WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.evidence_object_id = ev.evidence_id
               AND r.entity_id = p_entity AND r.state IN ('superseded', 'rejected')) AS lost
      FROM ev
  )
  SELECT jsonb_build_object(
    'entity_id', p_entity,
    'evidence', coalesce(jsonb_agg(jsonb_build_object('evidence_id', per.evidence_id,
                   'state', CASE WHEN per.resolved THEN 'resolved' WHEN per.lost IS NOT NULL THEN 'mistaken' ELSE 'unresolved' END,
                   'lost', per.lost) ORDER BY per.evidence_id), '[]'::jsonb),
    'resolved', count(*) FILTER (WHERE per.resolved),
    'mistaken', count(*) FILTER (WHERE NOT per.resolved AND per.lost IS NOT NULL),
    'unresolved', count(*) FILTER (WHERE NOT per.resolved AND per.lost IS NULL),
    'state', CASE WHEN count(*) FILTER (WHERE NOT per.resolved AND per.lost IS NOT NULL) > 0 THEN 'mistaken'
                  WHEN count(*) FILTER (WHERE NOT per.resolved) > 0 THEN 'unresolved' ELSE 'resolved' END)
  FROM per
$$;
REVOKE ALL ON FUNCTION domain.dci_identity(uuid, uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_identity(uuid, uuid, uuid, jsonb) TO eye_app, eye_commit;

/* CONFLICTING EVIDENCE: the OPEN contradictions (intelligence.contradictions) touching any claim the citations name — preserved, never resolved here. */
CREATE OR REPLACE FUNCTION domain.dci_contradictions(p_tenant uuid, p_domain uuid, p_citations jsonb) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = domain, intelligence, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object('contradiction_id', x.contradiction_id, 'subject', x.subject, 'predicate', x.predicate,
                                                       'a', jsonb_build_object('id', x.a_object_id, 'version', x.a_version, 'value', x.a_value),
                                                       'b', jsonb_build_object('id', x.b_object_id, 'version', x.b_version, 'value', x.b_value))), '[]'::jsonb)
    FROM intelligence.contradictions x
    JOIN jsonb_array_elements(coalesce(p_citations, '[]'::jsonb)) c ON c ->> 'kind' = 'claim' AND (x.a_object_id = (c ->> 'id')::uuid OR x.b_object_id = (c ->> 'id')::uuid)
   WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'open'
$$;
REVOKE ALL ON FUNCTION domain.dci_contradictions(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_contradictions(uuid, uuid, jsonb) TO eye_app, eye_commit;

/* COVERAGE FRESHNESS of a competitor: the newest evidence its identity rests on (an accepted mention of its entity) against the freshness of
   the watchlists that watch it (the strictest), else the package default. stale = no evidence within that many days of the DATABASE's now. */
CREATE OR REPLACE FUNCTION domain.dci_coverage(p_tenant uuid, p_domain uuid, p_competitor uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = domain, graph, objects, pg_catalog, pg_temp AS $$
  WITH c AS (SELECT * FROM domain.competitors x WHERE x.competitor_id = p_competitor AND x.tenant_id = p_tenant AND x.domain_id = p_domain),
  f AS (
    SELECT coalesce((SELECT min(w.freshness_days) FROM domain.competitor_watchlists w, c WHERE w.tenant_id = p_tenant AND w.domain_id = p_domain AND w.state = 'active'
                       AND w.package_key = c.package_key AND (cardinality(w.competitor_ids) = 0 OR c.competitor_id = ANY (w.competitor_ids))),
                    (SELECT (domain.dci_manifest(p_tenant, p_domain, c.package_key) -> 'coverage' ->> 'default_freshness_days')::int FROM c)) AS days
  ),
  newest AS (
    SELECT max(o.recorded_at) AS at FROM c JOIN graph.resolutions_current r ON r.entity_id = c.entity_id AND r.state = 'accepted' AND r.tenant_id = p_tenant
      JOIN objects.canonical_objects o ON o.object_id = r.evidence_object_id AND o.object_type = 'EVD' AND o.tenant_id = p_tenant
  )
  SELECT jsonb_build_object('freshness_days', f.days, 'newest_evidence_at', newest.at,
                            'state', CASE WHEN newest.at IS NULL THEN 'none' WHEN newest.at < clock_timestamp() - make_interval(days => f.days) THEN 'stale' ELSE 'fresh' END,
                            'as_of', clock_timestamp())
    FROM f, newest
$$;
REVOKE ALL ON FUNCTION domain.dci_coverage(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_coverage(uuid, uuid, uuid) TO eye_app, eye_commit;

-- §CI.4 THE PRIVATE CHECKS (no grant to a runtime role) ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION domain.dci_assert_actor(p_noun text, p_actor uuid) RETURNS void
LANGUAGE plpgsql SET search_path = domain, pg_catalog, pg_temp AS $$
BEGIN
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION '% rejected (actor): recorded by the acting principal', p_noun USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION domain.dci_assert_actor(text, uuid) FROM PUBLIC;

/* A named, active HUMAN holding one of the roles in the domain (or its tenant). */
CREATE OR REPLACE FUNCTION domain.dci_is_human_with(p_principal uuid, p_tenant uuid, p_domain uuid, p_roles text[]) RETURNS boolean
LANGUAGE sql STABLE SET search_path = domain, identity, pg_catalog, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM identity.role_bindings b JOIN identity.principals p ON p.id = b.principal_id
                  WHERE b.principal_id = p_principal AND p.kind = 'human' AND p.status = 'active' AND b.revoked_at IS NULL
                    AND b.role_code = ANY (p_roles) AND b.tenant_id = p_tenant
                    AND ((b.scope = 'DOMAIN' AND b.domain_id = p_domain) OR b.scope = 'TENANT'))
$$;
REVOKE ALL ON FUNCTION domain.dci_is_human_with(uuid, uuid, uuid, text[]) FROM PUBLIC;

/* The named human act: the acting principal, a human (never an agent), holding one of the roles. */
CREATE OR REPLACE FUNCTION domain.dci_assert_human(p_noun text, p_actor uuid, p_tenant uuid, p_domain uuid, p_roles text[], p_what text) RETURNS void
LANGUAGE plpgsql SET search_path = domain, identity, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM domain.dci_assert_actor(p_noun, p_actor);
  IF NOT EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = p_actor AND p.kind = 'human' AND p.status = 'active') THEN
    RAISE EXCEPTION '% rejected (actor): % is a named human''s act; an agent or a system principal never performs it', p_noun, p_what USING ERRCODE = '42501';
  END IF;
  IF NOT domain.dci_is_human_with(p_actor, p_tenant, p_domain, p_roles) THEN
    RAISE EXCEPTION '% rejected (authority): % needs one of % in this domain; the acting human holds none', p_noun, p_what, array_to_string(p_roles, ', ') USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION domain.dci_assert_human(text, uuid, uuid, uuid, text[], text) FROM PUBLIC;

/* THE PACKAGE GATE for a competitor function (the prelude's seam): refused `<noun> rejected (package): <reason>` (22023 → 422). */
CREATE OR REPLACE FUNCTION domain.dci_gate(p_noun text, p_tenant uuid, p_domain uuid, p_package_key text, p_function text) RETURNS jsonb
LANGUAGE plpgsql SET search_path = domain, pg_catalog, pg_temp AS $$
DECLARE s jsonb := domain.package_function_state(p_tenant, p_domain, p_package_key, p_function);
BEGIN
  IF s ->> 'state' <> 'active' THEN RAISE EXCEPTION '% rejected (package): %', p_noun, s ->> 'reason' USING ERRCODE = '22023'; END IF;
  RETURN s;
END $$;
REVOKE ALL ON FUNCTION domain.dci_gate(text, uuid, uuid, text, text) FROM PUBLIC;

/* The competitor, in this domain, locked for the act. */
CREATE OR REPLACE FUNCTION domain.dci_competitor(p_noun text, p_tenant uuid, p_domain uuid, p_competitor uuid, p_lock boolean) RETURNS domain.competitors
LANGUAGE plpgsql SET search_path = domain, pg_catalog, pg_temp AS $$
DECLARE c domain.competitors%ROWTYPE;
BEGIN
  IF p_lock THEN SELECT * INTO c FROM domain.competitors x WHERE x.competitor_id = p_competitor AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  ELSE SELECT * INTO c FROM domain.competitors x WHERE x.competitor_id = p_competitor AND x.tenant_id = p_tenant AND x.domain_id = p_domain; END IF;
  IF NOT FOUND THEN RAISE EXCEPTION '% rejected (unknown_competitor): no competitor % in this domain', p_noun, p_competitor USING ERRCODE = '23503'; END IF;
  IF c.state <> 'active' THEN RAISE EXCEPTION '% rejected (state): competitor % is retired', p_noun, c.name USING ERRCODE = '22023'; END IF;
  RETURN c;
END $$;
REVOKE ALL ON FUNCTION domain.dci_competitor(text, uuid, uuid, uuid, boolean) FROM PUBLIC;

/* Every citation names an existing claim (ENT/EVT/CLM/REL) or evidence (EVD) object of this domain at that exact version and digest. */
CREATE OR REPLACE FUNCTION domain.dci_assert_citations(p_noun text, p_tenant uuid, p_domain uuid, p_citations jsonb) RETURNS void
LANGUAGE plpgsql SET search_path = domain, objects, pg_catalog, pg_temp AS $$
DECLARE c jsonb; v_digest text; v_type text;
BEGIN
  IF jsonb_typeof(p_citations) <> 'array' OR jsonb_array_length(p_citations) = 0 THEN
    RAISE EXCEPTION '% rejected (citation): every fact, event and interpretation cites the claims or evidence it rests on', p_noun USING ERRCODE = '22023';
  END IF;
  FOR c IN SELECT * FROM jsonb_array_elements(p_citations) LOOP
    IF NOT (c ->> 'kind' IN ('claim', 'evidence')) OR (c ->> 'id') !~ '^[0-9a-f-]{36}$' OR jsonb_typeof(c -> 'version') <> 'number' OR coalesce(c ->> 'digest', '') !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION '% rejected (citation): a citation is {kind: claim | evidence, id, version, digest} (got %)', p_noun, left(c::text, 200) USING ERRCODE = '22023';
    END IF;
    SELECT o.content_digest, o.object_type INTO v_digest, v_type FROM objects.canonical_objects o
     WHERE o.object_id = (c ->> 'id')::uuid AND o.object_version = (c ->> 'version')::bigint AND o.tenant_id = p_tenant AND o.domain_id = p_domain;
    IF NOT FOUND OR (c ->> 'kind' = 'evidence' AND v_type <> 'EVD') OR (c ->> 'kind' = 'claim' AND NOT (v_type IN ('ENT', 'EVT', 'CLM', 'REL'))) THEN
      RAISE EXCEPTION '% rejected (unknown_citation): no % % version % in this domain', p_noun, c ->> 'kind', c ->> 'id', c ->> 'version' USING ERRCODE = '23503';
    END IF;
    IF v_digest <> c ->> 'digest' THEN
      RAISE EXCEPTION '% rejected (citation): % % version % has digest %…, not the cited %…', p_noun, c ->> 'kind', c ->> 'id', c ->> 'version', left(v_digest, 12), left(c ->> 'digest', 12) USING ERRCODE = '22023';
    END IF;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION domain.dci_assert_citations(text, uuid, uuid, jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION domain.dci_log(p_tenant uuid, p_domain uuid, p_competitor uuid, p_kind text, p_subject uuid, p_event text, p_actor uuid, p_details jsonb, p_correlation uuid) RETURNS void
LANGUAGE sql SET search_path = domain, pg_catalog, pg_temp AS $$
  INSERT INTO domain.competitor_ledger (event_id, scope, tenant_id, domain_id, competitor_id, subject_kind, subject_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_competitor, p_kind, p_subject, p_event, p_actor, coalesce(p_details, '{}'::jsonb), p_correlation)
$$;
REVOKE ALL ON FUNCTION domain.dci_log(uuid, uuid, uuid, text, uuid, text, uuid, jsonb, uuid) FROM PUBLIC;

/* The head (latest not-superseded) profile version. */
CREATE OR REPLACE FUNCTION domain.dci_head(p_competitor uuid) RETURNS domain.competitor_profile_versions
LANGUAGE sql STABLE SET search_path = domain, pg_catalog, pg_temp AS $$
  SELECT * FROM domain.competitor_profile_versions v WHERE v.competitor_id = p_competitor AND v.state <> 'superseded'
$$;
REVOKE ALL ON FUNCTION domain.dci_head(uuid) FROM PUBLIC;

/* ROUTE A REVALIDATION (one open per competitor and reason): a `domain.alert` item under the published policy, the competitor's owner named. */
CREATE OR REPLACE FUNCTION domain.dci_route_revalidation(c domain.competitors, p_version int, p_class text, p_details jsonb, p_title text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path = domain, pg_catalog, pg_temp AS $$
DECLARE v_id uuid; v_item jsonb; v_old domain.competitor_revalidations%ROWTYPE;
BEGIN
  SELECT * INTO v_old FROM domain.competitor_revalidations r WHERE r.competitor_id = c.competitor_id AND r.reason_class = p_class AND r.state = 'open';
  IF FOUND THEN RETURN jsonb_build_object('revalidation_id', v_old.revalidation_id, 'item_id', v_old.item_id, 'existing', true); END IF;
  v_id := gen_random_uuid();
  v_item := executive.b33_raise_routed(c.tenant_id, c.domain_id, 'domain.alert', 'competitor_profile', v_id, p_title,
              jsonb_build_array(format('revalidation (%s) of the profile of %s', p_class, c.name)), c.owner_principal_id, v_id, 'competitor.revalidation',
              jsonb_build_object('competitor_id', c.competitor_id, 'reason_class', p_class, 'profile_version', p_version, 'revalidation_id', v_id) || coalesce(p_details, '{}'::jsonb),
              NULL, p_actor, p_correlation);
  INSERT INTO domain.competitor_revalidations (revalidation_id, scope, tenant_id, domain_id, competitor_id, profile_version, reason_class, details, item_id, opened_by, correlation_id)
  VALUES (v_id, 'DOMAIN', c.tenant_id, c.domain_id, c.competitor_id, p_version, p_class, coalesce(p_details, '{}'::jsonb), (v_item ->> 'item_id')::uuid, p_actor, p_correlation);
  PERFORM domain.dci_log(c.tenant_id, c.domain_id, c.competitor_id, 'revalidation', v_id, 'revalidation.opened', p_actor,
                         jsonb_build_object('reason_class', p_class, 'profile_version', p_version, 'item', v_item), p_correlation);
  RETURN jsonb_build_object('revalidation_id', v_id, 'item_id', v_item ->> 'item_id', 'item_state', v_item ->> 'state', 'existing', false);
END $$;
REVOKE ALL ON FUNCTION domain.dci_route_revalidation(domain.competitors, int, text, jsonb, text, uuid, uuid) FROM PUBLIC;

/* SUSPEND the current/limited comparisons resting on a competitor's profile versions below p_from_version (their profile moved on under them). */
CREATE OR REPLACE FUNCTION domain.dci_suspend_comparisons(c domain.competitors, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path = domain, pg_catalog, pg_temp AS $$
DECLARE x record; v_ids jsonb := '[]'::jsonb;
BEGIN
  FOR x IN SELECT k.comparison_id FROM domain.competitor_comparisons k WHERE k.tenant_id = c.tenant_id AND k.domain_id = c.domain_id AND k.state <> 'suspended'
             AND c.competitor_id = ANY (k.competitor_ids) ORDER BY k.compared_at FOR UPDATE LOOP
    UPDATE domain.competitor_comparisons SET state = 'suspended', suspended_at = clock_timestamp(), suspended_reason = p_reason WHERE comparison_id = x.comparison_id;
    PERFORM domain.dci_log(c.tenant_id, c.domain_id, c.competitor_id, 'comparison', x.comparison_id, 'comparison.suspended', p_actor, jsonb_build_object('reason', p_reason), p_correlation);
    v_ids := v_ids || jsonb_build_array(x.comparison_id);
  END LOOP;
  RETURN v_ids;
END $$;
REVOKE ALL ON FUNCTION domain.dci_suspend_comparisons(domain.competitors, text, uuid, uuid) FROM PUBLIC;

-- §CI.5 THE PORTS (SECURITY DEFINER; the bound action asserted; the scope asserted; the acting principal recorded) ─────────────────────

/* DECLARE a competitor (domain.competitor.declare): bound to an ACTIVE graph ORGANIZATION entity of the domain (identity is the graph's);
   its owner a named analyst or strategy owner; the package's `profile` function active. One active competitor per entity. */
CREATE OR REPLACE FUNCTION domain.dci_declare_competitor(p_competitor uuid, p_tenant uuid, p_domain uuid, p_package_key text, p_entity uuid, p_name text, p_owner uuid,
                                                         p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER LANGUAGE plpgsql SET search_path = domain, graph, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE e graph.entities_current%ROWTYPE; g jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.competitor.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dci_assert_actor('competitor profile', p_actor);
  g := domain.dci_gate('competitor profile', p_tenant, p_domain, p_package_key, 'profile');
  SELECT * INTO e FROM graph.entities_current x WHERE x.entity_id = p_entity AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'competitor profile rejected (unknown_entity): no graph entity % in this domain', p_entity USING ERRCODE = '23503'; END IF;
  IF e.entity_type <> 'organization' THEN
    RAISE EXCEPTION 'competitor profile rejected (identity): entity % is a %, not an organization — a competitor is an organization of the graph', e.canonical_name, e.entity_type USING ERRCODE = '22023';
  END IF;
  IF e.lifecycle_state <> 'active' THEN
    RAISE EXCEPTION 'competitor profile rejected (identity): entity % is % (its identity moved on: %)', e.canonical_name, e.lifecycle_state, coalesce(e.superseded_by::text, 'retired') USING ERRCODE = '22023';
  END IF;
  IF NOT domain.dci_is_human_with(p_owner, p_tenant, p_domain, ARRAY['domain_analyst', 'strategy_owner']) THEN
    RAISE EXCEPTION 'competitor profile rejected (owner): the owner of a competitor profile is a named analyst or strategy owner of this domain' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM domain.competitors x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.entity_id = p_entity AND x.state = 'active') THEN
    RAISE EXCEPTION 'competitor profile rejected (duplicate): entity % is already a competitor of this domain', e.canonical_name USING ERRCODE = '23505';
  END IF;
  INSERT INTO domain.competitors (competitor_id, scope, tenant_id, domain_id, package_key, entity_id, name, owner_principal_id, created_by, correlation_id)
  VALUES (p_competitor, 'DOMAIN', p_tenant, p_domain, p_package_key, p_entity, btrim(p_name), p_owner, p_actor, p_correlation);
  PERFORM domain.dci_log(p_tenant, p_domain, p_competitor, 'competitor', p_competitor, 'competitor.declared', p_actor,
                         jsonb_build_object('entity_id', p_entity, 'entity_name', e.canonical_name, 'package', g), p_correlation);
  RETURN jsonb_build_object('competitor_id', p_competitor, 'entity_id', p_entity, 'entity_name', e.canonical_name, 'package', g);
END $$;
REVOKE ALL ON FUNCTION domain.dci_declare_competitor(uuid, uuid, uuid, text, uuid, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_declare_competitor(uuid, uuid, uuid, text, uuid, text, uuid, uuid, uuid) TO eye_commit;

/* PROPOSE (domain.competitor.propose): events, profile changes and an interpretation, by a person or by the Domain Intelligence Agent INSIDE
   its own running domain_scan (its principal, its run). The proposal's citations are checked exactly; its MATERIALITY, SOURCE DIVERSITY,
   IDENTITY basis and open CONTRADICTIONS are computed here and recorded (never taken from the caller). One open proposal per content digest. */
CREATE OR REPLACE FUNCTION domain.dci_propose(p_proposal uuid, p_tenant uuid, p_domain uuid, p_competitor uuid, p_content jsonb,
                                              p_agent uuid, p_run uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER LANGUAGE plpgsql SET search_path = domain, executive, objects, graph, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c domain.competitors%ROWTYPE; g jsonb; h domain.competitor_profile_versions%ROWTYPE; m jsonb; v_cites jsonb := '[]'::jsonb; x jsonb;
        v_material boolean := false; v_reasons jsonb := '[]'::jsonb; v_div jsonb; v_ident jsonb; v_contra jsonb; a executive.agents%ROWTYPE; r executive.agent_runs%ROWTYPE;
        v_events jsonb := coalesce(p_content -> 'events', '[]'::jsonb); v_changes jsonb := coalesce(p_content -> 'changes', '[]'::jsonb); v_interp jsonb := p_content -> 'interpretation';
        p_content_digest text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.competitor.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dci_assert_actor('competitor profile', p_actor);
  c := domain.dci_competitor('competitor profile', p_tenant, p_domain, p_competitor, false);
  -- the agent proposes only inside its own running scan, under its own principal (the Supply Chain Agent's rule)
  IF p_agent IS NOT NULL OR p_run IS NOT NULL THEN
    SELECT * INTO a FROM executive.agents x WHERE x.agent_id = p_agent AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    IF NOT FOUND OR a.status <> 'active' OR a.agent_kind <> 'domain_intelligence' OR a.principal_id <> p_actor THEN
      RAISE EXCEPTION 'competitor profile rejected (actor): an agent proposal is the active Domain Intelligence Agent''s, under its own principal' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO r FROM executive.agent_runs x WHERE x.run_id = p_run AND x.agent_id = p_agent;
    IF NOT FOUND OR r.outcome <> 'running' OR r.task <> 'domain_scan' THEN
      RAISE EXCEPTION 'competitor profile rejected (actor): an agent proposes inside its own running domain_scan (run % is not one)', p_run USING ERRCODE = '42501';
    END IF;
    g := domain.dci_gate('competitor profile', p_tenant, p_domain, c.package_key, 'collect');
  ELSE
    IF EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = p_actor AND p.kind <> 'human') THEN
      RAISE EXCEPTION 'competitor profile rejected (actor): an agent proposes only inside its own running domain_scan' USING ERRCODE = '42501';
    END IF;
    g := domain.dci_gate('competitor profile', p_tenant, p_domain, c.package_key, 'profile');
  END IF;
  IF jsonb_typeof(p_content) <> 'object' OR jsonb_typeof(v_events) <> 'array' OR jsonb_typeof(v_changes) <> 'array'
     OR (v_interp IS NOT NULL AND jsonb_typeof(v_interp) NOT IN ('object', 'null')) THEN
    RAISE EXCEPTION 'competitor profile rejected (request): content is {effective_from, events[], changes[], interpretation?}' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(v_events) + jsonb_array_length(v_changes) = 0 AND jsonb_typeof(coalesce(v_interp, 'null'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'competitor profile rejected (request): a proposal carries at least one event, profile change or interpretation' USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_content ->> 'effective_from', '') !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION 'competitor profile rejected (request): effective_from is the day the change holds from (YYYY-MM-DD)' USING ERRCODE = '22023';
  END IF;
  -- the DIGEST is the port's (over the stored jsonb text): the analyst's decision names it back
  p_content_digest := encode(sha256(convert_to(p_content::text, 'UTF8')), 'hex');
  m := domain.dci_manifest(p_tenant, p_domain, c.package_key);
  h := domain.dci_head(p_competitor);
  -- every event, change and the interpretation cite; the citations exist exactly
  FOR x IN SELECT * FROM jsonb_array_elements(v_events) LOOP
    PERFORM domain.dci_assert_citations('competitor profile', p_tenant, p_domain, x -> 'citations');
    IF coalesce(x ->> 'effective_date', '') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'competitor profile rejected (request): an event names the day it took effect (effective_date)' USING ERRCODE = '22023'; END IF;
    IF NOT (x ->> 'kind' IN ('plant_opened', 'plant_closed', 'capacity_change', 'product_launched', 'market_entry', 'market_exit', 'acquisition', 'partnership', 'pricing_move', 'other')) THEN
      RAISE EXCEPTION 'competitor profile rejected (request): event kind % is not one of the competitor package''s', x ->> 'kind' USING ERRCODE = '22023';
    END IF;
    IF x ? 'place_entity_id' AND x ->> 'place_entity_id' IS NOT NULL AND NOT EXISTS (SELECT 1 FROM graph.entities_current e WHERE e.entity_id = (x ->> 'place_entity_id')::uuid
         AND e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.entity_type = 'place') THEN
      RAISE EXCEPTION 'competitor profile rejected (unknown_place): no place entity % in this domain', x ->> 'place_entity_id' USING ERRCODE = '23503';
    END IF;
    v_cites := v_cites || (x -> 'citations');
    IF (m -> 'material' -> 'event_kinds') ? (x ->> 'kind') THEN v_material := true; v_reasons := v_reasons || jsonb_build_array(format('event %s', x ->> 'kind')); END IF;
  END LOOP;
  FOR x IN SELECT * FROM jsonb_array_elements(v_changes) LOOP
    IF NOT (x ->> 'op' IN ('add', 'replace', 'end')) OR coalesce(x -> 'fact' ->> 'key', '') !~ '^[a-z][a-z0-9_]*:[A-Za-z0-9_.-]+$' THEN
      RAISE EXCEPTION 'competitor profile rejected (request): a change is {op: add | replace | end, fact: {key: <kind>:<name>, kind, value, citations, confidence}}' USING ERRCODE = '22023';
    END IF;
    IF split_part(x -> 'fact' ->> 'key', ':', 1) <> coalesce(x -> 'fact' ->> 'kind', '') THEN
      RAISE EXCEPTION 'competitor profile rejected (request): fact key % does not start with its kind %', x -> 'fact' ->> 'key', x -> 'fact' ->> 'kind' USING ERRCODE = '22023';
    END IF;
    IF NOT (x -> 'fact' ->> 'kind' IN ('product', 'market', 'capability', 'objective', 'facility', 'movement', 'dependency', 'strategy')) THEN
      RAISE EXCEPTION 'competitor profile rejected (request): fact kind % is not one of product, market, capability, objective, facility, movement, dependency, strategy', x -> 'fact' ->> 'kind' USING ERRCODE = '22023';
    END IF;
    IF x ->> 'op' IN ('replace', 'end') AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(h.facts, '[]'::jsonb)) f WHERE f ->> 'key' = x -> 'fact' ->> 'key') THEN
      RAISE EXCEPTION 'competitor profile rejected (stale): the profile holds no fact % to %', x -> 'fact' ->> 'key', x ->> 'op' USING ERRCODE = '22023';
    END IF;
    IF x ->> 'op' = 'add' AND EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(h.facts, '[]'::jsonb)) f WHERE f ->> 'key' = x -> 'fact' ->> 'key') THEN
      RAISE EXCEPTION 'competitor profile rejected (request): the profile holds fact % already (replace it)', x -> 'fact' ->> 'key' USING ERRCODE = '22023';
    END IF;
    IF x ->> 'op' <> 'end' THEN
      PERFORM domain.dci_assert_citations('competitor profile', p_tenant, p_domain, x -> 'fact' -> 'citations');
      IF jsonb_typeof(x -> 'fact' -> 'confidence') <> 'number' OR (x -> 'fact' ->> 'confidence')::numeric NOT BETWEEN 0 AND 1 THEN
        RAISE EXCEPTION 'competitor profile rejected (request): fact % states its confidence (0–1)', x -> 'fact' ->> 'key' USING ERRCODE = '22023';
      END IF;
      v_cites := v_cites || (x -> 'fact' -> 'citations');
    END IF;
    IF (m -> 'material' -> 'fact_kinds') ? (x -> 'fact' ->> 'kind') THEN v_material := true; v_reasons := v_reasons || jsonb_build_array(format('%s fact %s', x ->> 'op', x -> 'fact' ->> 'key')); END IF;
  END LOOP;
  IF jsonb_typeof(coalesce(v_interp, 'null'::jsonb)) = 'object' THEN
    IF length(btrim(coalesce(v_interp ->> 'statement', ''))) < 8 OR jsonb_typeof(v_interp -> 'confidence') <> 'number' OR (v_interp ->> 'confidence')::numeric NOT BETWEEN 0 AND 1 THEN
      RAISE EXCEPTION 'competitor profile rejected (request): an interpretation is {statement (8+), confidence (0–1), citations}' USING ERRCODE = '22023';
    END IF;
    PERFORM domain.dci_assert_citations('competitor profile', p_tenant, p_domain, v_interp -> 'citations');
    v_cites := v_cites || (v_interp -> 'citations');
    IF (v_interp ->> 'confidence')::numeric >= coalesce((m -> 'material' ->> 'min_confidence')::numeric, 0.8) THEN
      v_material := true; v_reasons := v_reasons || jsonb_build_array('interpretation at or above the material confidence');
    END IF;
  END IF;
  SELECT coalesce(jsonb_agg(DISTINCT y), '[]'::jsonb) INTO v_cites FROM jsonb_array_elements(v_cites) y;
  v_div := domain.dci_source_diversity(p_tenant, p_domain, v_cites, coalesce((m -> 'diversity' ->> 'min_publishers')::int, 2));
  v_ident := domain.dci_identity(p_tenant, p_domain, c.entity_id, v_cites);
  v_contra := domain.dci_contradictions(p_tenant, p_domain, v_cites);
  IF p_agent IS NOT NULL AND v_ident ->> 'state' <> 'resolved' THEN
    RAISE EXCEPTION 'competitor profile rejected (identity): the agent proposes only from evidence the graph resolved to % (%: % unresolved, % mistaken)', c.name, v_ident ->> 'state',
      v_ident ->> 'unresolved', v_ident ->> 'mistaken' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM domain.competitor_proposals x WHERE x.competitor_id = p_competitor AND x.content_digest = p_content_digest AND x.state = 'proposed') THEN
    RAISE EXCEPTION 'competitor profile rejected (duplicate): the same change is already proposed for %', c.name USING ERRCODE = '23505';
  END IF;
  INSERT INTO domain.competitor_proposals (proposal_id, scope, tenant_id, domain_id, competitor_id, base_version, content, content_digest, material, material_reasons, citations,
                                           source_diversity, identity, contradictions, package_version, proposed_by, proposed_via, agent_id, run_id, correlation_id)
  VALUES (p_proposal, 'DOMAIN', p_tenant, p_domain, p_competitor, h.version, p_content, p_content_digest, v_material, v_reasons, v_cites, v_div, v_ident, v_contra,
          (g ->> 'package_version')::int, p_actor, CASE WHEN p_agent IS NULL THEN 'person' ELSE 'agent' END, p_agent, p_run, p_correlation);
  PERFORM domain.dci_log(p_tenant, p_domain, p_competitor, 'proposal', p_proposal, 'proposal.proposed', p_actor,
                         jsonb_build_object('material', v_material, 'via', CASE WHEN p_agent IS NULL THEN 'person' ELSE 'agent' END, 'agent_id', p_agent, 'run_id', p_run,
                                            'base_version', h.version, 'digest', p_content_digest), p_correlation);
  RETURN jsonb_build_object('proposal_id', p_proposal, 'competitor_id', p_competitor, 'base_version', h.version, 'material', v_material, 'material_reasons', v_reasons,
                            'source_diversity', v_div, 'identity', v_ident, 'contradictions', v_contra, 'content_digest', p_content_digest, 'package', g);
END $$;
REVOKE ALL ON FUNCTION domain.dci_propose(uuid, uuid, uuid, uuid, jsonb, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_propose(uuid, uuid, uuid, uuid, jsonb, uuid, uuid, uuid, uuid) TO eye_commit;

/* WITHDRAW one's own open proposal (domain.competitor.propose — the proposer; a person, or the agent inside its scan). */
CREATE OR REPLACE FUNCTION domain.dci_withdraw_proposal(p_proposal uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER LANGUAGE plpgsql SET search_path = domain, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p domain.competitor_proposals%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.competitor.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dci_assert_actor('competitor profile', p_actor);
  SELECT * INTO p FROM domain.competitor_proposals x WHERE x.proposal_id = p_proposal AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'competitor profile rejected (unknown_proposal): no proposal % in this domain', p_proposal USING ERRCODE = '23503'; END IF;
  IF p.proposed_by <> p_actor THEN RAISE EXCEPTION 'competitor profile rejected (ownership): a proposal is withdrawn by its proposer' USING ERRCODE = '42501'; END IF;
  IF p.state <> 'proposed' THEN RAISE EXCEPTION 'competitor profile rejected (state): proposal % is %', p_proposal, p.state USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'competitor profile rejected (reason): a withdrawal says why (8+ characters)' USING ERRCODE = '22023'; END IF;
  UPDATE domain.competitor_proposals SET state = 'withdrawn', decided_by = p_actor, decided_at = clock_timestamp(), decision_reason = btrim(p_reason) WHERE proposal_id = p_proposal;
  PERFORM domain.dci_log(p_tenant, p_domain, p.competitor_id, 'proposal', p_proposal, 'proposal.withdrawn', p_actor, jsonb_build_object('reason', btrim(p_reason)), p_correlation);
  RETURN jsonb_build_object('proposal_id', p_proposal, 'state', 'withdrawn');
END $$;
REVOKE ALL ON FUNCTION domain.dci_withdraw_proposal(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_withdraw_proposal(uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

/* THE MERGE of a profile's facts with a proposal's changes (pure): replaced/ended keys removed, added/replaced facts appended with their limits. */
CREATE OR REPLACE FUNCTION domain.dci_merge_facts(p_base jsonb, p_changes jsonb, p_proposal uuid, p_limits jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = domain, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(f ORDER BY f ->> 'key'), '[]'::jsonb) FROM (
    SELECT b AS f FROM jsonb_array_elements(coalesce(p_base, '[]'::jsonb)) b
     WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(p_changes, '[]'::jsonb)) x WHERE x -> 'fact' ->> 'key' = b ->> 'key')
    UNION ALL
    SELECT jsonb_build_object('key', x -> 'fact' ->> 'key', 'kind', x -> 'fact' ->> 'kind', 'value', x -> 'fact' -> 'value', 'citations', x -> 'fact' -> 'citations',
                              'confidence', x -> 'fact' -> 'confidence', 'from_proposal', p_proposal,
                              'limited', jsonb_array_length(coalesce(p_limits, '[]'::jsonb)) > 0, 'limited_reasons', coalesce(p_limits, '[]'::jsonb))
      FROM jsonb_array_elements(coalesce(p_changes, '[]'::jsonb)) x WHERE x ->> 'op' IN ('add', 'replace')) q
$$;
REVOKE ALL ON FUNCTION domain.dci_merge_facts(jsonb, jsonb, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_merge_facts(jsonb, jsonb, uuid, jsonb) TO eye_app, eye_commit;

/* DECIDE A PROPOSAL — THE MATERIAL ASSESSMENT APPROVAL (domain.competitor.assessment.approve; human-gated at the PDP): a NAMED ANALYST
   (domain_analyst; a human; never the proposer; never the agent) approves or declines, bound to the content digest; the package's `assess`
   function active; the profile not moved since the proposal (else stale). APPROVED → profile version n+1 (limited when the identity is not
   resolved through the graph, the sources are below the diversity threshold or the evidence is in open conflict — the conflicting evidence
   preserved in the version), its events, its interpretation (an assessment version), the open revalidations of the competitor resolved when
   the new version is approved in full, a WATCHLIST alert raised under the published policy for each rule it matches, and — when the
   competitor has a twin and an approved event carries a capacity — a capacity change PROPOSED to the twin's owner. The CPF object of the new
   version is admitted by the caller in this transaction (dci_bind_profile_object). */
CREATE OR REPLACE FUNCTION domain.dci_decide_proposal(p_proposal uuid, p_tenant uuid, p_domain uuid, p_decision text, p_digest text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER LANGUAGE plpgsql SET search_path = domain, executive, twin, graph, objects, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p domain.competitor_proposals%ROWTYPE; c domain.competitors%ROWTYPE; h domain.competitor_profile_versions%ROWTYPE; g jsonb; m jsonb; v_version int; v_limits jsonb := '[]'::jsonb;
        v_ident jsonb; v_div jsonb; v_contra jsonb; v_facts jsonb; v_state text; x jsonb; w record; rl jsonb; v_alerts jsonb := '[]'::jsonb; v_item jsonb; v_assessment uuid;
        v_events jsonb := '[]'::jsonb; v_event uuid; v_match boolean; v_twin jsonb := NULL; v_cap numeric; v_cur numeric; v_tp uuid; v_resolved jsonb := '[]'::jsonb; rv record;
        v_place text; v_closed jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.competitor.assessment.approve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dci_assert_human('competitor assessment', p_actor, p_tenant, p_domain, ARRAY['domain_analyst'], 'approving a material competitor assessment');
  SELECT * INTO p FROM domain.competitor_proposals x WHERE x.proposal_id = p_proposal AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'competitor assessment rejected (unknown_proposal): no proposal % in this domain', p_proposal USING ERRCODE = '23503'; END IF;
  c := domain.dci_competitor('competitor assessment', p_tenant, p_domain, p.competitor_id, true);
  IF p.proposed_by = p_actor THEN
    RAISE EXCEPTION 'competitor assessment rejected (separation_of_duties): the analyst who proposed a change does not approve it' USING ERRCODE = '42501';
  END IF;
  IF p.state <> 'proposed' THEN RAISE EXCEPTION 'competitor assessment rejected (state): proposal % is %', p_proposal, p.state USING ERRCODE = '22023'; END IF;
  IF p_digest IS DISTINCT FROM p.content_digest THEN
    RAISE EXCEPTION 'competitor assessment rejected (stale): the decision names digest %…; the proposal''s content is %… — read it again', left(coalesce(p_digest, '<none>'), 12), left(p.content_digest, 12) USING ERRCODE = '22023';
  END IF;
  IF p_decision NOT IN ('approved', 'declined') THEN RAISE EXCEPTION 'competitor assessment rejected (request): the decision is approved or declined' USING ERRCODE = '22023'; END IF;
  IF p_decision = 'declined' THEN
    IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'competitor assessment rejected (reason): a declined proposal states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
    UPDATE domain.competitor_proposals SET state = 'declined', decided_by = p_actor, decided_at = clock_timestamp(), decision_reason = btrim(p_reason) WHERE proposal_id = p_proposal;
    PERFORM domain.dci_log(p_tenant, p_domain, c.competitor_id, 'proposal', p_proposal, 'proposal.declined', p_actor, jsonb_build_object('reason', btrim(p_reason)), p_correlation);
    RETURN jsonb_build_object('proposal_id', p_proposal, 'state', 'declined');
  END IF;
  g := domain.dci_gate('competitor assessment', p_tenant, p_domain, c.package_key, 'assess');
  h := domain.dci_head(c.competitor_id);
  IF h.version IS DISTINCT FROM p.base_version THEN
    RAISE EXCEPTION 'competitor assessment rejected (stale): the profile of % moved to version % since the proposal (made on version %); the change is proposed again on the current profile',
      c.name, coalesce(h.version, 0), coalesce(p.base_version, 0) USING ERRCODE = '22023';
  END IF;
  m := domain.dci_manifest(p_tenant, p_domain, c.package_key);
  -- re-judged NOW (not taken from the proposal): identity through the graph, source diversity, open contradictions
  v_ident := domain.dci_identity(p_tenant, p_domain, c.entity_id, p.citations);
  v_div := domain.dci_source_diversity(p_tenant, p_domain, p.citations, coalesce((m -> 'diversity' ->> 'min_publishers')::int, 2));
  v_contra := domain.dci_contradictions(p_tenant, p_domain, p.citations);
  IF v_ident ->> 'state' <> 'resolved' THEN v_limits := v_limits || jsonb_build_array(jsonb_build_object('class', 'identity', 'state', v_ident ->> 'state',
       'reason', format('%s of the cited evidence is not resolved to %s through the graph (%s mistaken, %s unresolved)', (v_ident ->> 'mistaken')::int + (v_ident ->> 'unresolved')::int, c.name, v_ident ->> 'mistaken', v_ident ->> 'unresolved'))); END IF;
  IF (v_div ->> 'below_threshold')::boolean THEN v_limits := v_limits || jsonb_build_array(jsonb_build_object('class', 'source_diversity',
       'reason', format('%s independent publisher(s), below the package''s threshold of %s (correlated: %s)', v_div ->> 'independent_publishers', v_div ->> 'threshold', jsonb_array_length(v_div -> 'correlated')))); END IF;
  IF jsonb_array_length(v_contra) > 0 THEN v_limits := v_limits || jsonb_build_array(jsonb_build_object('class', 'contradiction',
       'reason', format('%s open contradiction(s) on the cited claims — the conflicting evidence is preserved', jsonb_array_length(v_contra)), 'contradictions', v_contra)); END IF;
  v_state := CASE WHEN jsonb_array_length(v_limits) > 0 THEN 'limited' ELSE 'approved' END;
  v_version := coalesce(h.version, 0) + 1;
  v_facts := domain.dci_merge_facts(h.facts, p.content -> 'changes', p_proposal, CASE WHEN v_state = 'limited' THEN v_limits ELSE '[]'::jsonb END);
  IF h.version IS NOT NULL THEN
    UPDATE domain.competitor_profile_versions SET state = 'superseded', superseded_at = clock_timestamp() WHERE competitor_id = c.competitor_id AND version = h.version;
  END IF;
  INSERT INTO domain.competitor_profile_versions (competitor_id, version, scope, tenant_id, domain_id, effective_from, facts, state, limited_reasons, cause, proposal_id, approved_by,
                                                  supersedes, package_version, source_diversity, identity, correlation_id)
  VALUES (c.competitor_id, v_version, 'DOMAIN', p_tenant, p_domain, (p.content ->> 'effective_from')::date, v_facts, v_state, v_limits, 'approval', p_proposal, p_actor,
          h.version, (g ->> 'package_version')::int, v_div, v_ident, p_correlation);
  -- the events
  FOR x IN SELECT * FROM jsonb_array_elements(coalesce(p.content -> 'events', '[]'::jsonb)) LOOP
    v_event := gen_random_uuid();
    INSERT INTO domain.competitor_events (event_id, scope, tenant_id, domain_id, competitor_id, kind, place_entity_id, effective_date, details, citations, proposal_id, profile_version,
                                          state, limited_reason, approved_by, correlation_id)
    VALUES (v_event, 'DOMAIN', p_tenant, p_domain, c.competitor_id, x ->> 'kind', NULLIF(x ->> 'place_entity_id', '')::uuid, (x ->> 'effective_date')::date,
            coalesce(x -> 'details', '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object('place', x ->> 'place', 'market', x ->> 'market')), x -> 'citations', p_proposal, v_version,
            CASE WHEN v_state = 'limited' THEN 'limited' ELSE 'recorded' END,
            CASE WHEN v_state = 'limited' THEN (SELECT string_agg(l ->> 'reason', '; ') FROM jsonb_array_elements(v_limits) l) END, p_actor, p_correlation);
    v_events := v_events || jsonb_build_array(jsonb_build_object('event_id', v_event, 'kind', x ->> 'kind', 'effective_date', x ->> 'effective_date', 'place', x ->> 'place', 'market', x ->> 'market',
                                                                 'capacity', x -> 'details' -> (m -> 'twin' ->> 'capacity_detail'), 'place_entity_id', x ->> 'place_entity_id'));
  END LOOP;
  -- the interpretation → an assessment version
  IF jsonb_typeof(p.content -> 'interpretation') = 'object' THEN
    v_assessment := gen_random_uuid();
    INSERT INTO domain.competitor_assessments (assessment_id, version, scope, tenant_id, domain_id, competitor_id, kind, statement, confidence, material, evidence, source_diversity,
                                               state, limited_reasons, proposal_id, profile_version, approved_by, correlation_id)
    VALUES (v_assessment, 1, 'DOMAIN', p_tenant, p_domain, c.competitor_id, 'interpretation', btrim(p.content -> 'interpretation' ->> 'statement'),
            (p.content -> 'interpretation' ->> 'confidence')::numeric, p.material, p.content -> 'interpretation' -> 'citations', v_div, v_state, v_limits, p_proposal, v_version, p_actor, p_correlation);
    PERFORM domain.dci_log(p_tenant, p_domain, c.competitor_id, 'assessment', v_assessment, CASE WHEN v_state = 'limited' THEN 'assessment.limited' ELSE 'assessment.approved' END, p_actor,
                           jsonb_build_object('version', 1, 'profile_version', v_version, 'limited_reasons', v_limits), p_correlation);
  END IF;
  UPDATE domain.competitor_proposals SET state = 'approved', decided_by = p_actor, decided_at = clock_timestamp(), decision_reason = NULLIF(btrim(coalesce(p_reason, '')), ''), result_version = v_version
   WHERE proposal_id = p_proposal;
  -- the other open proposals made on the superseded profile are SUPERSEDED (stale: they are proposed again on the current profile)
  UPDATE domain.competitor_proposals SET state = 'superseded', decided_by = p_actor, decided_at = clock_timestamp(),
         decision_reason = format('superseded: the profile moved to version %s by proposal %s', v_version, p_proposal)
   WHERE competitor_id = c.competitor_id AND state = 'proposed' AND proposal_id <> p_proposal;
  PERFORM domain.dci_log(p_tenant, p_domain, c.competitor_id, 'proposal', p_proposal, 'proposal.approved', p_actor,
                         jsonb_build_object('version', v_version, 'state', v_state, 'digest', p.content_digest, 'material', p.material), p_correlation);
  PERFORM domain.dci_log(p_tenant, p_domain, c.competitor_id, 'profile', c.competitor_id, CASE WHEN v_state = 'limited' THEN 'profile.limited' ELSE 'profile.versioned' END, p_actor,
                         jsonb_build_object('version', v_version, 'supersedes', h.version, 'limited_reasons', v_limits, 'effective_from', p.content ->> 'effective_from'), p_correlation);
  -- the open revalidations are resolved by a version approved in full; their items closed by this act
  IF v_state = 'approved' THEN
    FOR rv IN SELECT * FROM domain.competitor_revalidations r WHERE r.competitor_id = c.competitor_id AND r.state = 'open' ORDER BY r.opened_at FOR UPDATE LOOP
      UPDATE domain.competitor_revalidations SET state = 'resolved', resolved_by = p_actor, resolved_at = clock_timestamp(),
             resolution = format('profile version %s approved in full by proposal %s', v_version, p_proposal) WHERE revalidation_id = rv.revalidation_id;
      v_closed := executive.b33_close_items(p_tenant, p_domain, 'domain.alert', 'competitor_profile', rv.revalidation_id,
                                            format('revalidated: profile version %s approved in full', v_version), p_actor, p_correlation);
      PERFORM domain.dci_log(p_tenant, p_domain, c.competitor_id, 'revalidation', rv.revalidation_id, 'revalidation.resolved', p_actor,
                             jsonb_build_object('version', v_version, 'closed_items', v_closed), p_correlation);
      v_resolved := v_resolved || jsonb_build_array(jsonb_build_object('revalidation_id', rv.revalidation_id, 'closed_items', v_closed));
    END LOOP;
  END IF;
  -- THE WATCHLISTS: an approved MATERIAL change matching a rule raises `domain.alert` under the published policy, the watchlist's owner named
  IF p.material THEN
    g := domain.dci_gate('competitor assessment', p_tenant, p_domain, c.package_key, 'alert');
    FOR w IN SELECT * FROM domain.competitor_watchlists x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'active' AND x.package_key = c.package_key
               AND (cardinality(x.competitor_ids) = 0 OR c.competitor_id = ANY (x.competitor_ids)) ORDER BY x.created_at LOOP
      FOR rl IN SELECT * FROM jsonb_array_elements(w.rules) LOOP
        v_match := false; v_place := NULL;
        FOR x IN SELECT * FROM jsonb_array_elements(v_events) LOOP
          IF coalesce(rl -> 'event_kinds', '[]'::jsonb) ? (x ->> 'kind')
             AND (jsonb_array_length(coalesce(rl -> 'markets', '[]'::jsonb)) = 0
                  OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(rl -> 'markets') mk
                              WHERE position(lower(mk) IN lower(coalesce(x ->> 'place', '') || ' ' || coalesce(x ->> 'market', ''))) > 0)) THEN
            v_match := true; v_place := coalesce(x ->> 'place', x ->> 'market');
          END IF;
        END LOOP;
        FOR x IN SELECT * FROM jsonb_array_elements(coalesce(p.content -> 'changes', '[]'::jsonb)) LOOP
          IF x ->> 'op' IN ('add', 'replace') AND coalesce(rl -> 'fact_kinds', '[]'::jsonb) ? (x -> 'fact' ->> 'kind')
             AND (jsonb_array_length(coalesce(rl -> 'markets', '[]'::jsonb)) = 0
                  OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(rl -> 'markets') mk WHERE position(lower(mk) IN lower((x -> 'fact' -> 'value')::text)) > 0)) THEN
            v_match := true;
          END IF;
        END LOOP;
        CONTINUE WHEN NOT v_match;
        v_item := executive.b33_raise_routed(p_tenant, p_domain, 'domain.alert', 'competitor_profile', c.competitor_id,
                    format('%s: %s%s — profile v%s%s', c.name, coalesce(rl ->> 'title', rl ->> 'rule_key'), CASE WHEN v_place IS NULL THEN '' ELSE ' (' || v_place || ')' END, v_version,
                           CASE WHEN v_state = 'limited' THEN ' (LIMITED)' ELSE '' END),
                    jsonb_build_array(format('watchlist %s rule %s matched the approved change', w.title, rl ->> 'rule_key')) || p.material_reasons,
                    w.owner_principal_id, p_proposal, 'competitor.assessment_approved',
                    jsonb_build_object('competitor_id', c.competitor_id, 'watchlist_id', w.watchlist_id, 'rule_key', rl ->> 'rule_key', 'profile_version', v_version,
                                       'events', v_events, 'limited', v_state = 'limited', 'limited_reasons', v_limits, 'approved_by', p_actor,
                                       'response', 'the response is the executives'' decision in the decision layer'),
                    NULL, p_actor, p_correlation);
        INSERT INTO domain.competitor_alerts (alert_id, scope, tenant_id, domain_id, watchlist_id, rule_key, competitor_id, proposal_id, profile_version, item_id, item_state, limited, correlation_id)
        VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, w.watchlist_id, rl ->> 'rule_key', c.competitor_id, p_proposal, v_version, (v_item ->> 'item_id')::uuid, v_item ->> 'state',
                v_state = 'limited', p_correlation)
        ON CONFLICT (watchlist_id, rule_key, proposal_id) DO NOTHING;
        PERFORM domain.dci_log(p_tenant, p_domain, c.competitor_id, 'alert', (v_item ->> 'item_id')::uuid, 'alert.raised', p_actor,
                               jsonb_build_object('watchlist_id', w.watchlist_id, 'rule_key', rl ->> 'rule_key', 'item', v_item), p_correlation);
        v_alerts := v_alerts || jsonb_build_array(jsonb_build_object('watchlist_id', w.watchlist_id, 'rule_key', rl ->> 'rule_key', 'item', v_item));
      END LOOP;
    END LOOP;
  END IF;
  -- CI8: a capacity-bearing approved event on a competitor with a twin → a capacity change PROPOSED to the twin's owner (never written here)
  IF c.twin_id IS NOT NULL AND v_state = 'approved' THEN
    SELECT sum((e ->> 'capacity')::numeric) INTO v_cap FROM jsonb_array_elements(v_events) e WHERE jsonb_typeof(e -> 'capacity') = 'number' AND e ->> 'kind' IN ('plant_opened', 'capacity_change');
    IF v_cap IS NOT NULL THEN
      SELECT (s.value #>> '{}')::numeric INTO v_cur FROM twin.twin_versions tv JOIN twin.state_elements s ON s.twin_id = tv.twin_id AND s.version = tv.version
       WHERE tv.twin_id = c.twin_id AND tv.branch_id = 'actual' AND tv.state = 'admitted' AND s.key = (m -> 'twin' ->> 'key') AND jsonb_typeof(s.value) = 'number'
       ORDER BY tv.version DESC LIMIT 1;
      UPDATE domain.competitor_twin_proposals SET state = 'superseded' WHERE competitor_id = c.competitor_id AND state = 'proposed';
      v_tp := gen_random_uuid();
      INSERT INTO domain.competitor_twin_proposals (proposal_id, scope, tenant_id, domain_id, competitor_id, twin_id, key, unit, current_value, delta, proposed_value, basis, correlation_id)
      VALUES (v_tp, 'DOMAIN', p_tenant, p_domain, c.competitor_id, c.twin_id, m -> 'twin' ->> 'key', m -> 'twin' ->> 'unit', v_cur, v_cap, coalesce(v_cur, 0) + v_cap,
              jsonb_build_object('competitor_proposal', p_proposal, 'profile_version', v_version, 'events', v_events, 'citations', p.citations), p_correlation);
      PERFORM domain.dci_log(p_tenant, p_domain, c.competitor_id, 'twin_proposal', v_tp, 'twin.proposed', p_actor,
                             jsonb_build_object('twin_id', c.twin_id, 'current', v_cur, 'delta', v_cap, 'proposed', coalesce(v_cur, 0) + v_cap), p_correlation);
      v_twin := jsonb_build_object('proposal_id', v_tp, 'twin_id', c.twin_id, 'key', m -> 'twin' ->> 'key', 'current_value', v_cur, 'delta', v_cap, 'proposed_value', coalesce(v_cur, 0) + v_cap);
    END IF;
  END IF;
  RETURN jsonb_build_object('proposal_id', p_proposal, 'state', 'approved', 'competitor_id', c.competitor_id, 'version', v_version, 'profile_state', v_state, 'limited_reasons', v_limits,
                            'facts', v_facts, 'effective_from', p.content ->> 'effective_from', 'events', v_events, 'assessment_id', v_assessment, 'alerts', v_alerts, 'twin_proposal', v_twin,
                            'revalidations_resolved', v_resolved, 'identity', v_ident, 'source_diversity', v_div, 'supersedes', h.version, 'package_version', (g ->> 'package_version')::int,
                            'cpf', domain.dci_cpf_payload(c.competitor_id, v_version));
END $$;

/* THE CPF PAYLOAD of a profile version (§0.6's CPF v1 shape + the version's state and limits). */
CREATE OR REPLACE FUNCTION domain.dci_cpf_payload(p_competitor uuid, p_version int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = domain, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('competitor_id', c.competitor_id, 'entity_id', c.entity_id, 'name', c.name, 'version', v.version, 'effective_from', to_char(v.effective_from, 'YYYY-MM-DD'),
                            'effective_to', NULL, 'facts', v.facts, 'package', jsonb_build_object('package_key', c.package_key, 'version', v.package_version),
                            'approved_by', v.approved_by, 'approved_at', to_char(v.approved_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), 'supersedes', v.supersedes,
                            'state', v.state, 'limited_reasons', v.limited_reasons, 'cause', v.cause, 'source_diversity', v.source_diversity, 'identity', v.identity)
    FROM domain.competitor_profile_versions v JOIN domain.competitors c ON c.competitor_id = v.competitor_id
   WHERE v.competitor_id = p_competitor AND v.version = p_version
$$;
REVOKE ALL ON FUNCTION domain.dci_cpf_payload(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_cpf_payload(uuid, int) TO eye_app, eye_commit;

REVOKE ALL ON FUNCTION domain.dci_decide_proposal(uuid, uuid, uuid, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_decide_proposal(uuid, uuid, uuid, text, text, text, uuid, uuid) TO eye_commit;

/* BIND the admitted CPF object to its profile version (the act that wrote the version, in its transaction; write-once). */
CREATE OR REPLACE FUNCTION domain.dci_bind_profile_object(p_competitor uuid, p_tenant uuid, p_domain uuid, p_version int, p_digest text, p_actor uuid) RETURNS jsonb
SECURITY DEFINER LANGUAGE plpgsql SET search_path = domain, objects, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v domain.competitor_profile_versions%ROWTYPE; v_obj text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.competitor.assessment.approve', 'domain.competitor.revalidate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dci_assert_actor('competitor profile', p_actor);
  SELECT * INTO v FROM domain.competitor_profile_versions x WHERE x.competitor_id = p_competitor AND x.version = p_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'competitor profile rejected (unknown_version): competitor % has no profile version %', p_competitor, p_version USING ERRCODE = '23503'; END IF;
  SELECT o.content_digest INTO v_obj FROM objects.canonical_objects o WHERE o.object_type = 'CPF' AND o.object_id = p_competitor AND o.object_version = p_version AND o.tenant_id = p_tenant;
  IF v_obj IS NULL OR v_obj <> p_digest THEN
    RAISE EXCEPTION 'competitor profile rejected (digest): no CPF object % version % with digest %… was admitted', p_competitor, p_version, left(coalesce(p_digest, ''), 12) USING ERRCODE = '22023';
  END IF;
  UPDATE domain.competitor_profile_versions SET cpf_digest = p_digest WHERE competitor_id = p_competitor AND version = p_version;
  RETURN jsonb_build_object('competitor_id', p_competitor, 'version', p_version, 'cpf_digest', p_digest);
END $$;
REVOKE ALL ON FUNCTION domain.dci_bind_profile_object(uuid, uuid, uuid, int, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_bind_profile_object(uuid, uuid, uuid, int, text, uuid) TO eye_commit;

/* REVALIDATE (domain.competitor.revalidate — an analyst, or the agent in its scan): the head profile re-judged NOW. A fact resting on a MISTAKEN
   identity (its evidence's resolution to the competitor's entity superseded by a split or rejected) or on claims now in OPEN CONFLICT is marked
   LIMITED in a NEW version (nothing rewritten; the prior version stays replayable), the events on that evidence limited, the comparisons
   resting on the competitor SUSPENDED and a revalidation ROUTED (domain.alert, the competitor's owner named). STALE coverage routes a
   revalidation without a new version (reads present the profile as limited while it lasts). Answers what it found; nothing found → nothing written. */
CREATE OR REPLACE FUNCTION domain.dci_revalidate(p_competitor uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER LANGUAGE plpgsql SET search_path = domain, executive, graph, objects, intelligence, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c domain.competitors%ROWTYPE; h domain.competitor_profile_versions%ROWTYPE; g jsonb; f jsonb; v_facts jsonb := '[]'::jsonb; v_hits jsonb := '[]'::jsonb; v_id jsonb; v_ct jsonb;
        v_reasons jsonb; v_all jsonb := '[]'::jsonb; v_version int := NULL; v_cov jsonb; v_routed jsonb := '[]'::jsonb; v_susp jsonb := '[]'::jsonb; v_ev record; v_ident_any boolean := false;
        v_contra_any boolean := false; v_as domain.competitor_assessments%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.competitor.revalidate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dci_assert_actor('competitor profile', p_actor);
  c := domain.dci_competitor('competitor profile', p_tenant, p_domain, p_competitor, true);
  g := domain.dci_gate('competitor profile', p_tenant, p_domain, c.package_key, 'profile');
  h := domain.dci_head(c.competitor_id);
  IF h.version IS NOT NULL THEN
    FOR f IN SELECT * FROM jsonb_array_elements(h.facts) LOOP
      v_id := domain.dci_identity(p_tenant, p_domain, c.entity_id, f -> 'citations');
      v_ct := domain.dci_contradictions(p_tenant, p_domain, f -> 'citations');
      v_reasons := '[]'::jsonb;
      IF v_id ->> 'state' = 'mistaken' AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(f -> 'limited_reasons', '[]'::jsonb)) l WHERE l ->> 'class' = 'identity' AND l ->> 'state' = 'mistaken') THEN
        v_reasons := v_reasons || jsonb_build_array(jsonb_build_object('class', 'identity', 'state', 'mistaken',
                       'reason', format('the evidence of %s is no longer resolved to %s (a resolution superseded or rejected)', f ->> 'key', c.name), 'evidence', v_id -> 'evidence'));
        v_ident_any := true;
      END IF;
      IF jsonb_array_length(v_ct) > 0 AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(f -> 'limited_reasons', '[]'::jsonb)) l WHERE l ->> 'class' = 'contradiction') THEN
        v_reasons := v_reasons || jsonb_build_array(jsonb_build_object('class', 'contradiction', 'reason', format('%s open contradiction(s) on the claims of %s — both sides preserved', jsonb_array_length(v_ct), f ->> 'key'),
                                                                       'contradictions', v_ct));
        v_contra_any := true;
      END IF;
      IF jsonb_array_length(v_reasons) > 0 THEN
        f := f || jsonb_build_object('limited', true, 'limited_reasons', coalesce(f -> 'limited_reasons', '[]'::jsonb) || v_reasons);
        v_hits := v_hits || jsonb_build_array(jsonb_build_object('key', f ->> 'key', 'reasons', v_reasons));
        v_all := v_all || v_reasons;
      END IF;
      v_facts := v_facts || jsonb_build_array(f);
    END LOOP;
    IF jsonb_array_length(v_hits) > 0 THEN
      v_version := h.version + 1;
      UPDATE domain.competitor_profile_versions SET state = 'superseded', superseded_at = clock_timestamp() WHERE competitor_id = c.competitor_id AND version = h.version;
      INSERT INTO domain.competitor_profile_versions (competitor_id, version, scope, tenant_id, domain_id, effective_from, facts, state, limited_reasons, cause, proposal_id, approved_by,
                                                      supersedes, package_version, source_diversity, identity, correlation_id)
      VALUES (c.competitor_id, v_version, 'DOMAIN', p_tenant, p_domain, h.effective_from, v_facts, 'limited', h.limited_reasons || v_all, 'revalidation', NULL, p_actor,
              h.version, (g ->> 'package_version')::int, h.source_diversity, domain.dci_identity(p_tenant, p_domain, c.entity_id,
                (SELECT coalesce(jsonb_agg(y), '[]'::jsonb) FROM jsonb_array_elements(v_facts) ff, jsonb_array_elements(ff -> 'citations') y)), p_correlation);
      -- the events resting on the evidence found wanting are limited; the assessments of the competitor too (a new limited version each)
      FOR v_ev IN SELECT e.event_id FROM domain.competitor_events e WHERE e.competitor_id = c.competitor_id AND e.state = 'recorded'
                    AND (domain.dci_identity(p_tenant, p_domain, c.entity_id, e.citations) ->> 'state' = 'mistaken'
                         OR jsonb_array_length(domain.dci_contradictions(p_tenant, p_domain, e.citations)) > 0) FOR UPDATE LOOP
        UPDATE domain.competitor_events SET state = 'limited', limited_reason = 'revalidation: its evidence is no longer resolved to the competitor or is in open conflict' WHERE event_id = v_ev.event_id;
      END LOOP;
      FOR v_as IN SELECT * FROM domain.competitor_assessments a WHERE a.competitor_id = c.competitor_id AND a.state = 'approved'
                    AND (domain.dci_identity(p_tenant, p_domain, c.entity_id, a.evidence) ->> 'state' = 'mistaken' OR jsonb_array_length(domain.dci_contradictions(p_tenant, p_domain, a.evidence)) > 0)
                    ORDER BY a.assessment_id FOR UPDATE LOOP
        UPDATE domain.competitor_assessments SET state = 'superseded', superseded_at = clock_timestamp() WHERE assessment_id = v_as.assessment_id AND version = v_as.version;
        INSERT INTO domain.competitor_assessments (assessment_id, version, scope, tenant_id, domain_id, competitor_id, kind, statement, confidence, material, evidence, source_diversity,
                                                   state, limited_reasons, proposal_id, profile_version, approved_by, correlation_id)
        VALUES (v_as.assessment_id, v_as.version + 1, v_as.scope, v_as.tenant_id, v_as.domain_id, v_as.competitor_id, v_as.kind, v_as.statement, v_as.confidence, v_as.material, v_as.evidence,
                v_as.source_diversity, 'limited', v_as.limited_reasons || v_all, v_as.proposal_id, v_version, p_actor, p_correlation);
        PERFORM domain.dci_log(p_tenant, p_domain, c.competitor_id, 'assessment', v_as.assessment_id, 'assessment.limited', p_actor,
                               jsonb_build_object('version', v_as.version + 1, 'supersedes', v_as.version, 'cause', 'revalidation'), p_correlation);
      END LOOP;
      PERFORM domain.dci_log(p_tenant, p_domain, c.competitor_id, 'profile', c.competitor_id, 'profile.limited', p_actor,
                             jsonb_build_object('version', v_version, 'supersedes', h.version, 'facts', v_hits), p_correlation);
      v_susp := domain.dci_suspend_comparisons(c, format('the profile of %s was limited at version %s (revalidation)', c.name, v_version), p_actor, p_correlation);
      IF v_ident_any THEN
        v_routed := v_routed || jsonb_build_array(domain.dci_route_revalidation(c, v_version, 'identity', jsonb_build_object('facts', v_hits),
                      format('Revalidate %s: a profile fact rests on a mistaken identity', c.name), p_actor, p_correlation));
      END IF;
      IF v_contra_any THEN
        v_routed := v_routed || jsonb_build_array(domain.dci_route_revalidation(c, v_version, 'contradiction', jsonb_build_object('facts', v_hits),
                      format('Revalidate %s: conflicting evidence on the profile', c.name), p_actor, p_correlation));
      END IF;
    END IF;
  END IF;
  v_cov := domain.dci_coverage(p_tenant, p_domain, c.competitor_id);
  IF v_cov ->> 'state' IN ('stale', 'none') AND h.version IS NOT NULL THEN
    v_routed := v_routed || jsonb_build_array(domain.dci_route_revalidation(c, coalesce(v_version, h.version), 'coverage', jsonb_build_object('coverage', v_cov),
                  format('Revalidate %s: coverage is %s (no evidence within %s days)', c.name, v_cov ->> 'state', v_cov ->> 'freshness_days'), p_actor, p_correlation));
  END IF;
  RETURN jsonb_build_object('competitor_id', c.competitor_id, 'head_version', h.version, 'version', v_version, 'limited_facts', v_hits, 'coverage', v_cov, 'routed', v_routed,
                            'suspended_comparisons', v_susp, 'cpf', CASE WHEN v_version IS NULL THEN NULL ELSE domain.dci_cpf_payload(c.competitor_id, v_version) END);
END $$;
REVOKE ALL ON FUNCTION domain.dci_revalidate(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_revalidate(uuid, uuid, uuid, uuid, uuid) TO eye_commit;

/* A COMPARISON BASIS (domain.competitor.compare): declared or re-declared as a new version; the comparisons on the prior version are
   SUSPENDED when a metric's definition, unit, period or population changed (an incompatible basis is not compared across). */
CREATE OR REPLACE FUNCTION domain.dci_declare_basis(p_tenant uuid, p_domain uuid, p_package_key text, p_basis_key text, p_title text, p_metrics jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER LANGUAGE plpgsql SET search_path = domain, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE prior domain.competitor_comparison_bases%ROWTYPE; x jsonb; v_version int; v_digest text; v_changed boolean := false; k record; v_susp jsonb := '[]'::jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.competitor.compare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dci_assert_actor('competitor comparison', p_actor);
  PERFORM domain.dci_gate('competitor comparison', p_tenant, p_domain, p_package_key, 'compare');
  IF coalesce(p_basis_key, '') !~ '^[a-z][a-z0-9-]{1,60}$' OR length(btrim(coalesce(p_title, ''))) < 4 THEN
    RAISE EXCEPTION 'competitor comparison rejected (basis): a basis has a key (lowercase) and a title (4+)' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_metrics) <> 'array' OR jsonb_array_length(p_metrics) = 0 THEN
    RAISE EXCEPTION 'competitor comparison rejected (basis): a basis declares its metrics [{key, fact_kind, definition, unit, period, population}]' USING ERRCODE = '22023';
  END IF;
  FOR x IN SELECT * FROM jsonb_array_elements(p_metrics) LOOP
    IF coalesce(x ->> 'key', '') !~ '^[a-z][a-z0-9_]{1,40}$' OR NOT (x ->> 'fact_kind' IN ('product', 'market', 'capability', 'objective', 'facility', 'movement', 'dependency', 'strategy'))
       OR length(btrim(coalesce(x ->> 'definition', ''))) < 8 OR length(btrim(coalesce(x ->> 'unit', ''))) < 1 OR length(btrim(coalesce(x ->> 'period', ''))) < 1
       OR length(btrim(coalesce(x ->> 'population', ''))) < 2 THEN
      RAISE EXCEPTION 'competitor comparison rejected (basis): metric % declares key, fact_kind, definition (8+), unit, period and population', coalesce(x ->> 'key', '?') USING ERRCODE = '22023';
    END IF;
  END LOOP;
  SELECT * INTO prior FROM domain.competitor_comparison_bases b WHERE b.tenant_id = p_tenant AND b.domain_id = p_domain AND b.basis_key = p_basis_key AND b.state = 'active' FOR UPDATE;
  v_digest := encode(sha256(convert_to(p_metrics::text, 'UTF8')), 'hex');
  IF FOUND THEN
    IF prior.digest = v_digest THEN RAISE EXCEPTION 'competitor comparison rejected (duplicate): basis % version % declares these metrics already', p_basis_key, prior.version USING ERRCODE = '23505'; END IF;
    UPDATE domain.competitor_comparison_bases SET state = 'superseded', superseded_at = clock_timestamp() WHERE tenant_id = p_tenant AND domain_id = p_domain AND basis_key = p_basis_key AND version = prior.version;
    -- incompatible when any metric of the prior version is absent or redefined
    SELECT EXISTS (SELECT 1 FROM jsonb_array_elements(prior.metrics) a WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_metrics) b WHERE b ->> 'key' = a ->> 'key'
             AND b ->> 'fact_kind' = a ->> 'fact_kind' AND b ->> 'unit' = a ->> 'unit' AND b ->> 'period' = a ->> 'period' AND b ->> 'population' = a ->> 'population'
             AND b ->> 'definition' = a ->> 'definition')) INTO v_changed;
    IF v_changed THEN
      FOR k IN SELECT comparison_id FROM domain.competitor_comparisons x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.basis_key = p_basis_key AND x.basis_version = prior.version
                 AND x.state <> 'suspended' FOR UPDATE LOOP
        UPDATE domain.competitor_comparisons SET state = 'suspended', suspended_at = clock_timestamp(),
               suspended_reason = format('basis %s version %s superseded by version %s with changed definitions — not comparable across', p_basis_key, prior.version, prior.version + 1)
         WHERE comparison_id = k.comparison_id;
        PERFORM domain.dci_log(p_tenant, p_domain, NULL, 'comparison', k.comparison_id, 'comparison.suspended', p_actor, jsonb_build_object('basis', p_basis_key, 'from_version', prior.version), p_correlation);
        v_susp := v_susp || jsonb_build_array(k.comparison_id);
      END LOOP;
    END IF;
  END IF;
  v_version := coalesce(prior.version, 0) + 1;
  INSERT INTO domain.competitor_comparison_bases (basis_key, version, scope, tenant_id, domain_id, title, metrics, digest, state, declared_by, correlation_id)
  VALUES (p_basis_key, v_version, 'DOMAIN', p_tenant, p_domain, btrim(p_title), p_metrics, v_digest, 'active', p_actor, p_correlation);
  PERFORM domain.dci_log(p_tenant, p_domain, NULL, 'basis', p_correlation, 'basis.declared', p_actor,
                         jsonb_build_object('basis_key', p_basis_key, 'version', v_version, 'digest', v_digest, 'suspended', v_susp), p_correlation);
  RETURN jsonb_build_object('basis_key', p_basis_key, 'version', v_version, 'digest', v_digest, 'supersedes', prior.version, 'incompatible_change', v_changed, 'suspended', v_susp);
END $$;
REVOKE ALL ON FUNCTION domain.dci_declare_basis(uuid, uuid, text, text, text, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_declare_basis(uuid, uuid, text, text, text, jsonb, uuid, uuid) TO eye_commit;

/* COMPARE (domain.competitor.compare): the competitors' CURRENT profiles on the ACTIVE basis version. Each metric's fact (fact kind, key
   `<kind>:<metric key>`) must report the basis's unit, period and population — otherwise REFUSED (incompatible definitions are never
   compared). The comparison's source diversity is measured; below the threshold, or resting on a limited profile → LIMITED. */
CREATE OR REPLACE FUNCTION domain.dci_compare(p_comparison uuid, p_tenant uuid, p_domain uuid, p_basis_key text, p_competitors uuid[], p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER LANGUAGE plpgsql SET search_path = domain, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE b domain.competitor_comparison_bases%ROWTYPE; c domain.competitors%ROWTYPE; h domain.competitor_profile_versions%ROWTYPE; mt jsonb; f jsonb; v_rows jsonb := '[]'::jsonb;
        v_cites jsonb := '[]'::jsonb; v_div jsonb; v_limits jsonb := '[]'::jsonb; v_pkg text := NULL; v_id uuid; m jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.competitor.compare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dci_assert_actor('competitor comparison', p_actor);
  IF p_competitors IS NULL OR cardinality(p_competitors) < 2 OR cardinality(p_competitors) <> (SELECT count(DISTINCT u) FROM unnest(p_competitors) u) THEN
    RAISE EXCEPTION 'competitor comparison rejected (request): a comparison names two or more distinct competitors' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO b FROM domain.competitor_comparison_bases x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.basis_key = p_basis_key AND x.state = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'competitor comparison rejected (unknown_basis): no active comparison basis % in this domain', p_basis_key USING ERRCODE = '23503'; END IF;
  FOREACH v_id IN ARRAY p_competitors LOOP
    c := domain.dci_competitor('competitor comparison', p_tenant, p_domain, v_id, false);
    IF v_pkg IS NULL THEN v_pkg := c.package_key; PERFORM domain.dci_gate('competitor comparison', p_tenant, p_domain, v_pkg, 'compare'); END IF;
    h := domain.dci_head(c.competitor_id);
    IF h.version IS NULL THEN RAISE EXCEPTION 'competitor comparison rejected (state): % has no approved profile to compare', c.name USING ERRCODE = '22023'; END IF;
    IF h.state = 'limited' THEN v_limits := v_limits || jsonb_build_array(jsonb_build_object('class', 'limited_profile', 'reason', format('the profile of %s (v%s) is limited', c.name, h.version))); END IF;
    FOR mt IN SELECT * FROM jsonb_array_elements(b.metrics) LOOP
      SELECT y INTO f FROM jsonb_array_elements(h.facts) y WHERE y ->> 'key' = (mt ->> 'fact_kind') || ':' || (mt ->> 'key');
      IF f IS NULL THEN
        RAISE EXCEPTION 'competitor comparison rejected (basis): % reports no %:% — the basis % v% cannot compare it', c.name, mt ->> 'fact_kind', mt ->> 'key', b.basis_key, b.version USING ERRCODE = '22023';
      END IF;
      IF coalesce(f -> 'value' ->> 'unit', '') <> mt ->> 'unit' OR coalesce(f -> 'value' ->> 'period', '') <> mt ->> 'period' OR coalesce(f -> 'value' ->> 'population', '') <> mt ->> 'population' THEN
        RAISE EXCEPTION 'competitor comparison rejected (basis): % reports % in % per % over "%"; basis % v% defines % per % over "%" — incompatible definitions are not compared',
          c.name, mt ->> 'key', coalesce(f -> 'value' ->> 'unit', '?'), coalesce(f -> 'value' ->> 'period', '?'), coalesce(f -> 'value' ->> 'population', '?'),
          b.basis_key, b.version, mt ->> 'unit', mt ->> 'period', mt ->> 'population' USING ERRCODE = '22023';
      END IF;
      IF coalesce((f ->> 'limited')::boolean, false) THEN
        v_limits := v_limits || jsonb_build_array(jsonb_build_object('class', 'limited_fact', 'reason', format('%s of %s is limited', f ->> 'key', c.name)));
      END IF;
      v_rows := v_rows || jsonb_build_array(jsonb_build_object('competitor_id', c.competitor_id, 'name', c.name, 'profile_version', h.version, 'metric', mt ->> 'key',
                  'value', f -> 'value' -> 'amount', 'unit', mt ->> 'unit', 'period', mt ->> 'period', 'population', mt ->> 'population', 'confidence', f -> 'confidence',
                  'citations', f -> 'citations', 'limited', coalesce((f ->> 'limited')::boolean, false)));
      v_cites := v_cites || coalesce(f -> 'citations', '[]'::jsonb);
    END LOOP;
  END LOOP;
  m := domain.dci_manifest(p_tenant, p_domain, v_pkg);
  v_div := domain.dci_source_diversity(p_tenant, p_domain, v_cites, coalesce((m -> 'diversity' ->> 'min_publishers')::int, 2));
  IF (v_div ->> 'below_threshold')::boolean THEN
    v_limits := v_limits || jsonb_build_array(jsonb_build_object('class', 'source_diversity', 'reason', format('%s independent publisher(s), below the threshold of %s', v_div ->> 'independent_publishers', v_div ->> 'threshold')));
  END IF;
  INSERT INTO domain.competitor_comparisons (comparison_id, scope, tenant_id, domain_id, basis_key, basis_version, competitor_ids, rows, source_diversity, state, limited_reasons, compared_by, correlation_id)
  VALUES (p_comparison, 'DOMAIN', p_tenant, p_domain, b.basis_key, b.version, p_competitors, v_rows, v_div, CASE WHEN jsonb_array_length(v_limits) > 0 THEN 'limited' ELSE 'current' END, v_limits,
          p_actor, p_correlation);
  PERFORM domain.dci_log(p_tenant, p_domain, NULL, 'comparison', p_comparison, 'comparison.recorded', p_actor,
                         jsonb_build_object('basis', b.basis_key, 'basis_version', b.version, 'competitors', to_jsonb(p_competitors), 'limited_reasons', v_limits), p_correlation);
  RETURN jsonb_build_object('comparison_id', p_comparison, 'basis_key', b.basis_key, 'basis_version', b.version, 'rows', v_rows, 'source_diversity', v_div,
                            'state', CASE WHEN jsonb_array_length(v_limits) > 0 THEN 'limited' ELSE 'current' END, 'limited_reasons', v_limits);
END $$;
REVOKE ALL ON FUNCTION domain.dci_compare(uuid, uuid, uuid, text, uuid[], uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_compare(uuid, uuid, uuid, text, uuid[], uuid, uuid) TO eye_commit;

/* A WATCHLIST (domain.competitor.watchlist): declared by its owner (a named strategy owner or analyst — named on every alert it raises) or retired. */
CREATE OR REPLACE FUNCTION domain.dci_declare_watchlist(p_watchlist uuid, p_tenant uuid, p_domain uuid, p_package_key text, p_title text, p_owner uuid, p_competitors uuid[], p_rules jsonb,
                                                        p_freshness_days int, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER LANGUAGE plpgsql SET search_path = domain, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x jsonb; v_id uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.competitor.watchlist']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dci_assert_actor('competitor watchlist', p_actor);
  PERFORM domain.dci_gate('competitor watchlist', p_tenant, p_domain, p_package_key, 'alert');
  IF NOT domain.dci_is_human_with(p_owner, p_tenant, p_domain, ARRAY['strategy_owner', 'domain_analyst']) THEN
    RAISE EXCEPTION 'competitor watchlist rejected (owner): a watchlist''s owner is a named strategy owner or analyst of this domain' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_title, ''))) < 4 THEN RAISE EXCEPTION 'competitor watchlist rejected (request): a watchlist has a title (4+)' USING ERRCODE = '22023'; END IF;
  IF p_freshness_days IS NULL OR p_freshness_days NOT BETWEEN 1 AND 3650 THEN RAISE EXCEPTION 'competitor watchlist rejected (request): freshness_days is 1–3650' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(p_rules) <> 'array' OR jsonb_array_length(p_rules) = 0 THEN RAISE EXCEPTION 'competitor watchlist rejected (request): a watchlist has at least one rule' USING ERRCODE = '22023'; END IF;
  FOR x IN SELECT * FROM jsonb_array_elements(p_rules) LOOP
    IF coalesce(x ->> 'rule_key', '') !~ '^[a-z][a-z0-9-]{1,40}$' OR (jsonb_array_length(coalesce(x -> 'event_kinds', '[]'::jsonb)) + jsonb_array_length(coalesce(x -> 'fact_kinds', '[]'::jsonb))) = 0 THEN
      RAISE EXCEPTION 'competitor watchlist rejected (request): a rule is {rule_key, title?, event_kinds[], fact_kinds[], markets[]} with at least one kind' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  FOREACH v_id IN ARRAY coalesce(p_competitors, '{}'::uuid[]) LOOP
    PERFORM domain.dci_competitor('competitor watchlist', p_tenant, p_domain, v_id, false);
  END LOOP;
  INSERT INTO domain.competitor_watchlists (watchlist_id, scope, tenant_id, domain_id, package_key, title, owner_principal_id, competitor_ids, rules, freshness_days, created_by, correlation_id)
  VALUES (p_watchlist, 'DOMAIN', p_tenant, p_domain, p_package_key, btrim(p_title), p_owner, coalesce(p_competitors, '{}'::uuid[]), p_rules, p_freshness_days, p_actor, p_correlation);
  PERFORM domain.dci_log(p_tenant, p_domain, NULL, 'watchlist', p_watchlist, 'watchlist.declared', p_actor, jsonb_build_object('owner', p_owner, 'rules', p_rules), p_correlation);
  RETURN jsonb_build_object('watchlist_id', p_watchlist, 'owner', p_owner, 'rules', p_rules, 'freshness_days', p_freshness_days);
END $$;
REVOKE ALL ON FUNCTION domain.dci_declare_watchlist(uuid, uuid, uuid, text, text, uuid, uuid[], jsonb, int, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_declare_watchlist(uuid, uuid, uuid, text, text, uuid, uuid[], jsonb, int, uuid, uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION domain.dci_retire_watchlist(p_watchlist uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER LANGUAGE plpgsql SET search_path = domain, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE w domain.competitor_watchlists%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.competitor.watchlist']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dci_assert_actor('competitor watchlist', p_actor);
  SELECT * INTO w FROM domain.competitor_watchlists x WHERE x.watchlist_id = p_watchlist AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'competitor watchlist rejected (unknown_watchlist): no watchlist % in this domain', p_watchlist USING ERRCODE = '23503'; END IF;
  IF w.owner_principal_id <> p_actor AND w.created_by <> p_actor THEN RAISE EXCEPTION 'competitor watchlist rejected (ownership): a watchlist is retired by its owner or its declarer' USING ERRCODE = '42501'; END IF;
  IF w.state <> 'active' THEN RAISE EXCEPTION 'competitor watchlist rejected (state): watchlist % is %', w.title, w.state USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'competitor watchlist rejected (reason): a retirement says why (8+ characters)' USING ERRCODE = '22023'; END IF;
  UPDATE domain.competitor_watchlists SET state = 'retired', retired_at = clock_timestamp(), retired_by = p_actor, retire_reason = btrim(p_reason) WHERE watchlist_id = p_watchlist;
  PERFORM domain.dci_log(p_tenant, p_domain, NULL, 'watchlist', p_watchlist, 'watchlist.retired', p_actor, jsonb_build_object('reason', btrim(p_reason)), p_correlation);
  RETURN jsonb_build_object('watchlist_id', p_watchlist, 'state', 'retired');
END $$;
REVOKE ALL ON FUNCTION domain.dci_retire_watchlist(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_retire_watchlist(uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

/* AN ANALYST CHALLENGE of an assessment's current version (domain.competitor.challenge; human-gated): its reason and what it proposes instead
   ({statement?, confidence?, limit?: true}). One open challenge per assessment. */
CREATE OR REPLACE FUNCTION domain.dci_challenge(p_challenge uuid, p_tenant uuid, p_domain uuid, p_assessment uuid, p_reason text, p_proposed jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER LANGUAGE plpgsql SET search_path = domain, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a domain.competitor_assessments%ROWTYPE; c domain.competitors%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.competitor.challenge']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dci_assert_human('competitor assessment', p_actor, p_tenant, p_domain, ARRAY['domain_analyst', 'strategy_owner'], 'challenging an assessment');
  SELECT * INTO a FROM domain.competitor_assessments x WHERE x.assessment_id = p_assessment AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state <> 'superseded';
  IF NOT FOUND THEN RAISE EXCEPTION 'competitor assessment rejected (unknown_assessment): no current assessment % in this domain', p_assessment USING ERRCODE = '23503'; END IF;
  c := domain.dci_competitor('competitor assessment', p_tenant, p_domain, a.competitor_id, false);
  PERFORM domain.dci_gate('competitor assessment', p_tenant, p_domain, c.package_key, 'assess');
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'competitor assessment rejected (reason): a challenge states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(p_proposed) <> 'object' OR NOT (p_proposed ? 'statement' OR p_proposed ? 'confidence' OR coalesce((p_proposed ->> 'limit')::boolean, false)) THEN
    RAISE EXCEPTION 'competitor assessment rejected (request): a challenge proposes a statement, a confidence, or limit: true' USING ERRCODE = '22023';
  END IF;
  IF p_proposed ? 'statement' AND length(btrim(coalesce(p_proposed ->> 'statement', ''))) < 8 THEN
    RAISE EXCEPTION 'competitor assessment rejected (request): a proposed statement has 8+ characters' USING ERRCODE = '22023';
  END IF;
  IF p_proposed ? 'confidence' AND (jsonb_typeof(p_proposed -> 'confidence') <> 'number' OR (p_proposed ->> 'confidence')::numeric NOT BETWEEN 0 AND 1) THEN
    RAISE EXCEPTION 'competitor assessment rejected (request): a proposed confidence is 0–1' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM domain.competitor_challenges x WHERE x.assessment_id = p_assessment AND x.state = 'open') THEN
    RAISE EXCEPTION 'competitor assessment rejected (duplicate): assessment % is under an open challenge', p_assessment USING ERRCODE = '23505';
  END IF;
  INSERT INTO domain.competitor_challenges (challenge_id, scope, tenant_id, domain_id, assessment_id, assessment_version, challenger, reason, proposed, correlation_id)
  VALUES (p_challenge, 'DOMAIN', p_tenant, p_domain, p_assessment, a.version, p_actor, btrim(p_reason), p_proposed, p_correlation);
  PERFORM domain.dci_log(p_tenant, p_domain, a.competitor_id, 'challenge', p_challenge, 'challenge.opened', p_actor,
                         jsonb_build_object('assessment_id', p_assessment, 'version', a.version, 'reason', btrim(p_reason), 'proposed', p_proposed), p_correlation);
  RETURN jsonb_build_object('challenge_id', p_challenge, 'assessment_id', p_assessment, 'assessment_version', a.version, 'state', 'open');
END $$;
REVOKE ALL ON FUNCTION domain.dci_challenge(uuid, uuid, uuid, uuid, text, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_challenge(uuid, uuid, uuid, uuid, text, jsonb, uuid, uuid) TO eye_commit;

/* DECIDE A CHALLENGE (domain.competitor.challenge.decide; human-gated): another named analyst (never the challenger). UPHELD → the
   assessment's next version (the challenged one superseded; statement/confidence as proposed; limited when it asked to limit) — the challenge
   recorded on it; DISMISSED → recorded with its reason. */
CREATE OR REPLACE FUNCTION domain.dci_decide_challenge(p_challenge uuid, p_tenant uuid, p_domain uuid, p_decision text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER LANGUAGE plpgsql SET search_path = domain, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE ch domain.competitor_challenges%ROWTYPE; a domain.competitor_assessments%ROWTYPE; c domain.competitors%ROWTYPE; v_limit boolean; v_limits jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.competitor.challenge.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dci_assert_human('competitor assessment', p_actor, p_tenant, p_domain, ARRAY['domain_analyst'], 'deciding a challenge');
  SELECT * INTO ch FROM domain.competitor_challenges x WHERE x.challenge_id = p_challenge AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'competitor assessment rejected (unknown_challenge): no challenge % in this domain', p_challenge USING ERRCODE = '23503'; END IF;
  IF ch.challenger = p_actor THEN RAISE EXCEPTION 'competitor assessment rejected (separation_of_duties): the analyst who challenged an assessment does not decide the challenge' USING ERRCODE = '42501'; END IF;
  IF ch.state <> 'open' THEN RAISE EXCEPTION 'competitor assessment rejected (state): challenge % is %', p_challenge, ch.state USING ERRCODE = '22023'; END IF;
  IF p_decision NOT IN ('upheld', 'dismissed') THEN RAISE EXCEPTION 'competitor assessment rejected (request): a challenge is upheld or dismissed' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'competitor assessment rejected (reason): a challenge decision states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO a FROM domain.competitor_assessments x WHERE x.assessment_id = ch.assessment_id AND x.version = ch.assessment_version FOR UPDATE;
  c := domain.dci_competitor('competitor assessment', p_tenant, p_domain, a.competitor_id, false);
  PERFORM domain.dci_gate('competitor assessment', p_tenant, p_domain, c.package_key, 'assess');
  IF p_decision = 'dismissed' THEN
    UPDATE domain.competitor_challenges SET state = 'dismissed', decided_by = p_actor, decided_at = clock_timestamp(), decision_reason = btrim(p_reason) WHERE challenge_id = p_challenge;
    PERFORM domain.dci_log(p_tenant, p_domain, a.competitor_id, 'challenge', p_challenge, 'challenge.dismissed', p_actor, jsonb_build_object('reason', btrim(p_reason)), p_correlation);
    RETURN jsonb_build_object('challenge_id', p_challenge, 'state', 'dismissed');
  END IF;
  IF a.state = 'superseded' THEN
    RAISE EXCEPTION 'competitor assessment rejected (stale): assessment % moved past version % since the challenge', a.assessment_id, a.version USING ERRCODE = '22023';
  END IF;
  v_limit := coalesce((ch.proposed ->> 'limit')::boolean, false) OR a.state = 'limited';
  v_limits := a.limited_reasons || CASE WHEN coalesce((ch.proposed ->> 'limit')::boolean, false)
                 THEN jsonb_build_array(jsonb_build_object('class', 'challenge', 'reason', format('challenge upheld: %s', ch.reason), 'challenge_id', p_challenge)) ELSE '[]'::jsonb END;
  UPDATE domain.competitor_assessments SET state = 'superseded', superseded_at = clock_timestamp() WHERE assessment_id = a.assessment_id AND version = a.version;
  INSERT INTO domain.competitor_assessments (assessment_id, version, scope, tenant_id, domain_id, competitor_id, kind, statement, confidence, material, evidence, source_diversity,
                                             state, limited_reasons, proposal_id, challenge_id, profile_version, approved_by, correlation_id)
  VALUES (a.assessment_id, a.version + 1, 'DOMAIN', p_tenant, p_domain, a.competitor_id, a.kind, coalesce(btrim(ch.proposed ->> 'statement'), a.statement),
          coalesce((ch.proposed ->> 'confidence')::numeric, a.confidence), a.material, a.evidence, a.source_diversity, CASE WHEN v_limit THEN 'limited' ELSE 'approved' END,
          v_limits, a.proposal_id, p_challenge, a.profile_version, p_actor, p_correlation);
  UPDATE domain.competitor_challenges SET state = 'upheld', decided_by = p_actor, decided_at = clock_timestamp(), decision_reason = btrim(p_reason), result_version = a.version + 1 WHERE challenge_id = p_challenge;
  PERFORM domain.dci_log(p_tenant, p_domain, a.competitor_id, 'challenge', p_challenge, 'challenge.upheld', p_actor,
                         jsonb_build_object('assessment_id', a.assessment_id, 'from_version', a.version, 'to_version', a.version + 1, 'reason', btrim(p_reason)), p_correlation);
  PERFORM domain.dci_log(p_tenant, p_domain, a.competitor_id, 'assessment', a.assessment_id, 'assessment.superseded', p_actor,
                         jsonb_build_object('version', a.version, 'by_version', a.version + 1, 'challenge_id', p_challenge), p_correlation);
  RETURN jsonb_build_object('challenge_id', p_challenge, 'state', 'upheld', 'assessment_id', a.assessment_id, 'version', a.version + 1,
                            'assessment_state', CASE WHEN v_limit THEN 'limited' ELSE 'approved' END);
END $$;
REVOKE ALL ON FUNCTION domain.dci_decide_challenge(uuid, uuid, uuid, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_decide_challenge(uuid, uuid, uuid, text, text, uuid, uuid) TO eye_commit;

/* DECISION-USE EVIDENCE (domain.competitor.decision.cite; human-gated): a decision package of this domain cites a profile version — recorded,
   never decided here (the package's owner or a decision authority records the use). */
CREATE OR REPLACE FUNCTION domain.dci_cite_in_decision(p_use uuid, p_tenant uuid, p_domain uuid, p_competitor uuid, p_version int, p_package uuid, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER LANGUAGE plpgsql SET search_path = domain, decision, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c domain.competitors%ROWTYPE; v domain.competitor_profile_versions%ROWTYPE; k decision.packages_current%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.competitor.decision.cite']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dci_assert_human('competitor profile', p_actor, p_tenant, p_domain, ARRAY['decision_owner', 'decision_authority', 'strategy_owner'], 'recording a decision''s use of a profile');
  c := domain.dci_competitor('competitor profile', p_tenant, p_domain, p_competitor, false);
  PERFORM domain.dci_gate('competitor profile', p_tenant, p_domain, c.package_key, 'profile');
  SELECT * INTO v FROM domain.competitor_profile_versions x WHERE x.competitor_id = p_competitor AND x.version = p_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'competitor profile rejected (unknown_version): % has no profile version %', c.name, p_version USING ERRCODE = '23503'; END IF;
  SELECT * INTO k FROM decision.packages_current x WHERE x.package_id = p_package AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'competitor profile rejected (unknown_package): no decision package % in this domain', p_package USING ERRCODE = '23503'; END IF;
  IF length(btrim(coalesce(p_note, ''))) < 8 THEN RAISE EXCEPTION 'competitor profile rejected (reason): a decision use says how the profile is used (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM domain.competitor_decision_uses x WHERE x.package_id = p_package AND x.competitor_id = p_competitor AND x.profile_version = p_version) THEN
    RAISE EXCEPTION 'competitor profile rejected (duplicate): decision package % already cites % v%', k.title, c.name, p_version USING ERRCODE = '23505';
  END IF;
  INSERT INTO domain.competitor_decision_uses (use_id, scope, tenant_id, domain_id, competitor_id, profile_version, package_id, note, cited_by, correlation_id)
  VALUES (p_use, 'DOMAIN', p_tenant, p_domain, p_competitor, p_version, p_package, btrim(p_note), p_actor, p_correlation);
  PERFORM domain.dci_log(p_tenant, p_domain, p_competitor, 'decision_use', p_use, 'decision.cited', p_actor,
                         jsonb_build_object('package_id', p_package, 'package_title', k.title, 'profile_version', p_version, 'profile_state', v.state), p_correlation);
  RETURN jsonb_build_object('use_id', p_use, 'package_id', p_package, 'profile_version', p_version, 'profile_state', v.state);
END $$;
REVOKE ALL ON FUNCTION domain.dci_cite_in_decision(uuid, uuid, uuid, uuid, int, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_cite_in_decision(uuid, uuid, uuid, uuid, int, uuid, text, uuid, uuid) TO eye_commit;

/* BIND THE COMPETITOR TWIN (domain.competitor.twin.bind; CI8): the twin's OWNER binds a twin of kind `competitor` (the 0092 family) to the
   competitor; its required dependency `market` is reported (twin.dependency_completeness) — a twin is populated, never generalised (B78). */
CREATE OR REPLACE FUNCTION domain.dci_bind_twin(p_competitor uuid, p_tenant uuid, p_domain uuid, p_twin uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER LANGUAGE plpgsql SET search_path = domain, twin, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c domain.competitors%ROWTYPE; t twin.twins_current%ROWTYPE; v_family text; v_dep jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.competitor.twin.bind']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dci_assert_actor('competitor profile', p_actor);
  c := domain.dci_competitor('competitor profile', p_tenant, p_domain, p_competitor, true);
  PERFORM domain.dci_gate('competitor profile', p_tenant, p_domain, c.package_key, 'twin');
  SELECT * INTO t FROM twin.twins_current x WHERE x.twin_id = p_twin AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'competitor profile rejected (unknown_twin): no twin % in this domain', p_twin USING ERRCODE = '23503'; END IF;
  SELECT family INTO v_family FROM twin.twin_kind_schemas k WHERE k.kind = t.kind;
  IF coalesce(v_family, '') <> 'competitor' THEN RAISE EXCEPTION 'competitor profile rejected (twin): twin % is of family %, not competitor', t.title, coalesce(v_family, '?') USING ERRCODE = '22023'; END IF;
  IF t.owner_principal_id <> p_actor THEN RAISE EXCEPTION 'competitor profile rejected (ownership): the competitor twin is bound by its owner' USING ERRCODE = '42501'; END IF;
  IF c.twin_id IS NOT NULL THEN RAISE EXCEPTION 'competitor profile rejected (state): % is bound to twin % already', c.name, c.twin_id USING ERRCODE = '22023'; END IF;
  UPDATE domain.competitors SET twin_id = p_twin, twin_bound_by = p_actor, twin_bound_at = clock_timestamp() WHERE competitor_id = p_competitor;
  v_dep := twin.dependency_completeness(p_tenant, p_domain, p_twin);
  PERFORM domain.dci_log(p_tenant, p_domain, p_competitor, 'competitor', p_competitor, 'competitor.twin_bound', p_actor, jsonb_build_object('twin_id', p_twin, 'dependencies', v_dep), p_correlation);
  RETURN jsonb_build_object('competitor_id', p_competitor, 'twin_id', p_twin, 'dependencies', v_dep);
END $$;
REVOKE ALL ON FUNCTION domain.dci_bind_twin(uuid, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_bind_twin(uuid, uuid, uuid, uuid, uuid, uuid) TO eye_commit;

/* DECIDE THE TWIN PROPOSAL (domain.competitor.twin.decide; human-gated): the twin's OWNER only. APPLIED — against an ADMITTED actual version of
   the twin (applied by the owner through the twin's own version/ground/admit routes) whose element carries the proposed value; DECLINED — a reason. */
CREATE OR REPLACE FUNCTION domain.dci_decide_twin_proposal(p_proposal uuid, p_tenant uuid, p_domain uuid, p_decision text, p_version int, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER LANGUAGE plpgsql SET search_path = domain, twin, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE tp domain.competitor_twin_proposals%ROWTYPE; t twin.twins_current%ROWTYPE; v_val numeric; v_state text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.competitor.twin.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dci_assert_human('competitor profile', p_actor, p_tenant, p_domain, ARRAY['twin_owner'], 'deciding a twin capacity proposal');
  SELECT * INTO tp FROM domain.competitor_twin_proposals x WHERE x.proposal_id = p_proposal AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'competitor profile rejected (unknown_twin_proposal): no twin proposal % in this domain', p_proposal USING ERRCODE = '23503'; END IF;
  SELECT * INTO t FROM twin.twins_current x WHERE x.twin_id = tp.twin_id;
  IF t.owner_principal_id <> p_actor THEN RAISE EXCEPTION 'competitor profile rejected (ownership): a capacity change to twin % is the twin owner''s decision', t.title USING ERRCODE = '42501'; END IF;
  IF tp.state <> 'proposed' THEN RAISE EXCEPTION 'competitor profile rejected (state): twin proposal % is %', p_proposal, tp.state USING ERRCODE = '22023'; END IF;
  IF p_decision = 'declined' THEN
    IF length(btrim(coalesce(p_note, ''))) < 8 THEN RAISE EXCEPTION 'competitor profile rejected (reason): a declined twin proposal states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
    UPDATE domain.competitor_twin_proposals SET state = 'declined', decided_by = p_actor, decided_at = clock_timestamp(), note = btrim(p_note) WHERE proposal_id = p_proposal;
    PERFORM domain.dci_log(p_tenant, p_domain, tp.competitor_id, 'twin_proposal', p_proposal, 'twin.declined', p_actor, jsonb_build_object('note', btrim(p_note)), p_correlation);
    RETURN jsonb_build_object('proposal_id', p_proposal, 'state', 'declined');
  END IF;
  IF p_decision <> 'applied' THEN RAISE EXCEPTION 'competitor profile rejected (request): a twin proposal is applied or declined' USING ERRCODE = '22023'; END IF;
  SELECT tv.state INTO v_state FROM twin.twin_versions tv WHERE tv.twin_id = tp.twin_id AND tv.version = p_version AND tv.branch_id = 'actual';
  IF v_state IS DISTINCT FROM 'admitted' THEN
    RAISE EXCEPTION 'competitor profile rejected (twin): version % of twin % is not an admitted actual version (apply the change through the twin''s version, ground and admit routes first)', p_version, t.title USING ERRCODE = '22023';
  END IF;
  SELECT (s.value #>> '{}')::numeric INTO v_val FROM twin.state_elements s WHERE s.twin_id = tp.twin_id AND s.version = p_version AND s.key = tp.key AND jsonb_typeof(s.value) = 'number';
  IF v_val IS DISTINCT FROM tp.proposed_value THEN
    RAISE EXCEPTION 'competitor profile rejected (twin): version % of twin % holds % = %, not the proposed %', p_version, t.title, tp.key, coalesce(v_val::text, 'nothing'), tp.proposed_value USING ERRCODE = '22023';
  END IF;
  UPDATE domain.competitor_twin_proposals SET state = 'applied', decided_by = p_actor, decided_at = clock_timestamp(), note = NULLIF(btrim(coalesce(p_note, '')), ''), applied_version = p_version
   WHERE proposal_id = p_proposal;
  PERFORM domain.dci_log(p_tenant, p_domain, tp.competitor_id, 'twin_proposal', p_proposal, 'twin.applied', p_actor, jsonb_build_object('version', p_version, 'value', v_val), p_correlation);
  RETURN jsonb_build_object('proposal_id', p_proposal, 'state', 'applied', 'applied_version', p_version, 'value', v_val);
END $$;
REVOKE ALL ON FUNCTION domain.dci_decide_twin_proposal(uuid, uuid, uuid, text, int, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_decide_twin_proposal(uuid, uuid, uuid, text, int, text, uuid, uuid) TO eye_commit;

/* THE AGENT'S SCAN MARK (domain.competitor.propose — inside its running domain_scan): the watermark it read to, per competitor. */
CREATE OR REPLACE FUNCTION domain.dci_record_scan(p_tenant uuid, p_domain uuid, p_competitor uuid, p_agent uuid, p_run uuid, p_watermark timestamptz, p_seen int, p_proposed int, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER LANGUAGE plpgsql SET search_path = domain, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a executive.agents%ROWTYPE; r executive.agent_runs%ROWTYPE; v_id uuid := gen_random_uuid();
BEGIN
  PERFORM observation.assert_authority(ARRAY['domain.competitor.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM domain.dci_assert_actor('competitor profile', p_actor);
  PERFORM domain.dci_competitor('competitor profile', p_tenant, p_domain, p_competitor, false);
  SELECT * INTO a FROM executive.agents x WHERE x.agent_id = p_agent AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  SELECT * INTO r FROM executive.agent_runs x WHERE x.run_id = p_run AND x.agent_id = p_agent;
  IF a.agent_id IS NULL OR a.principal_id <> p_actor OR a.agent_kind <> 'domain_intelligence' OR r.run_id IS NULL OR r.outcome <> 'running' THEN
    RAISE EXCEPTION 'competitor profile rejected (actor): a scan mark is the Domain Intelligence Agent''s, inside its own running scan' USING ERRCODE = '42501';
  END IF;
  INSERT INTO domain.competitor_scan_marks (mark_id, scope, tenant_id, domain_id, competitor_id, agent_id, run_id, watermark, claims_seen, proposed, correlation_id)
  VALUES (v_id, 'DOMAIN', p_tenant, p_domain, p_competitor, p_agent, p_run, p_watermark, greatest(p_seen, 0), greatest(p_proposed, 0), p_correlation);
  RETURN jsonb_build_object('mark_id', v_id, 'watermark', p_watermark);
END $$;
REVOKE ALL ON FUNCTION domain.dci_record_scan(uuid, uuid, uuid, uuid, uuid, timestamptz, int, int, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_record_scan(uuid, uuid, uuid, uuid, uuid, timestamptz, int, int, uuid, uuid) TO eye_commit;

/* WHAT THE AGENT READS (INVOKER, under its read context): per WATCHED competitor of an active package, the claims (EVT/CLM/REL, their latest
   versions, not withdrawn) extracted from evidence one of whose mentions the graph RESOLVED (accepted) to the competitor's entity, recorded
   after the competitor's last scan mark — oldest first; and the place entities resolved from the same evidence. The read is bounded (p_limit). */
CREATE OR REPLACE FUNCTION domain.dci_scan_backlog(p_tenant uuid, p_domain uuid, p_limit int) RETURNS TABLE (competitor_id uuid, package_key text, entity_id uuid, name text, watermark timestamptz,
  claim_id uuid, claim_version bigint, claim_type text, claim_digest text, payload jsonb, recorded_at timestamptz, evidence_id uuid, evidence_version bigint, evidence_digest text, places jsonb)
LANGUAGE sql STABLE SET search_path = domain, graph, objects, pg_catalog, pg_temp AS $$
  WITH watched AS (
    SELECT c.* FROM domain.competitors c
     WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.state = 'active'
       AND domain.package_function_state(p_tenant, p_domain, c.package_key, 'collect') ->> 'state' = 'active'
       AND EXISTS (SELECT 1 FROM domain.competitor_watchlists w WHERE w.tenant_id = p_tenant AND w.domain_id = p_domain AND w.state = 'active' AND w.package_key = c.package_key
                     AND (cardinality(w.competitor_ids) = 0 OR c.competitor_id = ANY (w.competitor_ids)))
  ), marks AS (
    SELECT w.competitor_id, coalesce((SELECT max(m.watermark) FROM domain.competitor_scan_marks m WHERE m.competitor_id = w.competitor_id), '-infinity'::timestamptz) AS watermark FROM watched w
  ), ev AS (
    SELECT DISTINCT w.competitor_id, r.evidence_object_id FROM watched w JOIN graph.resolutions_current r ON r.entity_id = w.entity_id AND r.state = 'accepted'
     WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain
  ), claims AS (
    SELECT DISTINCT ON (o.object_id) ev.competitor_id, o.object_id, o.object_version, o.object_type, o.content_digest, o.payload, o.recorded_at, o.lifecycle_state, ev.evidence_object_id
      FROM ev JOIN objects.canonical_objects o ON o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.object_type IN ('EVT', 'CLM', 'REL')
           AND (o.payload -> 'lineage' ->> 'evidence_object_id') = ev.evidence_object_id::text
     ORDER BY o.object_id, o.object_version DESC
  )
  SELECT w.competitor_id, w.package_key, w.entity_id, w.name, mk.watermark, cl.object_id, cl.object_version, cl.object_type, cl.content_digest, cl.payload, cl.recorded_at,
         cl.evidence_object_id, d.object_version, d.content_digest,
         (SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object('entity_id', e.entity_id, 'name', e.canonical_name)), '[]'::jsonb)
            FROM graph.resolutions_current r2 JOIN graph.entities_current e ON e.entity_id = r2.entity_id AND e.entity_type = 'place'
           WHERE r2.evidence_object_id = cl.evidence_object_id AND r2.state = 'accepted' AND r2.tenant_id = p_tenant)
    FROM claims cl JOIN watched w ON w.competitor_id = cl.competitor_id JOIN marks mk ON mk.competitor_id = cl.competitor_id
    LEFT JOIN LATERAL (SELECT x.object_version, x.content_digest FROM objects.canonical_objects x WHERE x.object_id = cl.evidence_object_id AND x.object_type = 'EVD' AND x.tenant_id = p_tenant
                        ORDER BY x.object_version DESC LIMIT 1) d ON true
   WHERE cl.recorded_at > mk.watermark AND cl.lifecycle_state NOT IN ('withdrawn', 'retracted')
   ORDER BY cl.recorded_at, cl.object_id
   LIMIT greatest(coalesce(p_limit, 200), 1)
$$;
REVOKE ALL ON FUNCTION domain.dci_scan_backlog(uuid, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_scan_backlog(uuid, uuid, int) TO eye_app, eye_commit;
/* WHAT NEEDS REVALIDATION NOW (INVOKER): per active competitor with a profile, a head fact whose evidence is no longer resolved to it (mistaken)
   or in open conflict and not yet limited for that, or coverage stale/none without an open coverage revalidation. The agent's scan and the
   after-tick hook read it (a revalidation writes only when something is found). */
CREATE OR REPLACE FUNCTION domain.dci_needs_revalidation(p_tenant uuid, p_domain uuid) RETURNS TABLE (competitor_id uuid, name text, reasons jsonb)
LANGUAGE sql STABLE SET search_path = domain, pg_catalog, pg_temp AS $$
  SELECT c.competitor_id, c.name, r.reasons
    FROM domain.competitors c
    JOIN domain.competitor_profile_versions h ON h.competitor_id = c.competitor_id AND h.state <> 'superseded'
    CROSS JOIN LATERAL (
      SELECT coalesce(jsonb_agg(x), '[]'::jsonb) AS reasons FROM (
        SELECT jsonb_build_object('class', 'identity', 'fact', f ->> 'key') AS x FROM jsonb_array_elements(h.facts) f
         WHERE domain.dci_identity(p_tenant, p_domain, c.entity_id, f -> 'citations') ->> 'state' = 'mistaken'
           AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(f -> 'limited_reasons', '[]'::jsonb)) l WHERE l ->> 'class' = 'identity' AND l ->> 'state' = 'mistaken')
        UNION ALL
        SELECT jsonb_build_object('class', 'contradiction', 'fact', f ->> 'key') FROM jsonb_array_elements(h.facts) f
         WHERE jsonb_array_length(domain.dci_contradictions(p_tenant, p_domain, f -> 'citations')) > 0
           AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(f -> 'limited_reasons', '[]'::jsonb)) l WHERE l ->> 'class' = 'contradiction')
        UNION ALL
        SELECT jsonb_build_object('class', 'coverage', 'state', domain.dci_coverage(p_tenant, p_domain, c.competitor_id) ->> 'state')
         WHERE domain.dci_coverage(p_tenant, p_domain, c.competitor_id) ->> 'state' IN ('stale', 'none')
           AND NOT EXISTS (SELECT 1 FROM domain.competitor_revalidations v WHERE v.competitor_id = c.competitor_id AND v.reason_class = 'coverage' AND v.state = 'open')) q) r
   WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.state = 'active' AND jsonb_array_length(r.reasons) > 0
$$;
REVOKE ALL ON FUNCTION domain.dci_needs_revalidation(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION domain.dci_needs_revalidation(uuid, uuid) TO eye_app, eye_commit;
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- end §CI
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
