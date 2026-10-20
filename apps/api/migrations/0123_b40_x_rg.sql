-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0123 §RG — CP-6 B40 part §RG: THE SOURCE REGISTRY, CONTRACT STEWARDSHIP, THE RIGHTS LIFECYCLE AND REVOCATION IMPACT (F-P1-01).
-- Folded into 0123 after §0 (the order §0, §RG, §VA, §IN, §AP, §CR). Applies ALONE on 0001–0122 + 0123 §0 on a fresh database. Nothing
-- applied or committed is edited; every function re-declared here is copied WHOLE from its LAST definition, the change marked `-- B40 rg`.
--
--   §RG.1  the ledgers — source_candidates (+ events: discovery, JRN-02's first stage), source_evaluations (the evaluation record an
--          SRC@v4 approval reads, D5), source_rights_changes (narrow / withdraw / restore, append-only), source_customer_approvals (D13),
--          source_stewardship (versioned), source_incidents (+ events, PER-11: owned by a collection manager). FORCE RLS (the 0121 idiom),
--          SELECT to eye_app / eye_commit, no write grant; append-only where marked.
--   §RG.2  the internals (no grant): the SRC@v4 test, the outstanding withdrawal, THE IMPACT (B28's source_derived_products + the claims
--          through intelligence.claim_lineage + B50's forward impact — options, briefings, publications, strategy dependencies, constructed
--          edges — each with its owner), the owner routing (an attention item to each product's owner), the shared withdrawal.
--   §RG.3  the ports — discovery (propose / decline / promote), evaluation, approve_source re-declared WHOLE (0022:811: an SRC@v4 contract is
--          approved only on a recorded evaluation of that version recommending approval; no version is approved while the source's rights
--          stand withdrawn), observation.change_rights (narrow, withdraw, restore — DESIGN D4), set_rights_state re-declared WHOLE (0022:956:
--          the v1–v3 route re-pointed — a withdrawal through it IS the rights lifecycle's; a lifecycle withdrawal is not lifted by it),
--          the customer approval, stewardship, source incidents.
--   §RG.4  the reads — the registry read (evaluations, customer approvals, rights changes, stewardship, incidents, economics against the
--          run meter, "not recorded before B40" for v1–v3), the candidates, observation.rights_revocation_impact, observation.source_change_impact
--          (CAP-OB-02: the preview before a rights change or a new contract version).
--   §RG.5  observation._rg_use_refusal — §0's stub REPLACED WHOLE (DESIGN D4, the owner's word): evidence is refused at every decision-active
--          use while EITHER rights source of the contract version it was admitted under stands withdrawn — the source CONTRACT's rights
--          (graph.ev_evidence_state's contract_rights_state) or the rights TERMS (its rights_state) — counted from CURRENT database state
--          (the dispatcher's state is computed in the refusing statement; a missing contract state is read again here, never assumed fine).
--   §RG.6  the wiring — observation.mark_source_impact re-declared WHOLE (0088:603: a marker set while the source's rights stand withdrawn, or
--          by an event declaring cause rights, carries cause `rights`; a marker whose cause changes is re-set, never rewritten); and
--          observation.upsert_scheduler_entry re-declared WHOLE (0022:1594: the rights acts may remove and restore a schedule entry).
--
-- REFUSAL NOUNS (the CLASS form `<noun> rejected (<class>): …`; NOT mapped centrally yet — the integrator maps them in observation-errors.ts):
--   `source candidate`, `source evaluation`, `source approval`, `rights change`, `customer approval`, `stewardship`, `source incident`,
--   `source registry` (the reads). Classes: actor / authority / separation_of_duties (42501 → 403) · unknown_* (23503 → 404) · state /
--   stale / duplicate (23514 / 23505 → 409) · the rest (22023 → 422). The use refusal is §0's `object use rejected (rights_withdrawn)` (409,
--   mapped by §0).
-- THREE CLAIMS: CONSTRUCTION (this file and phase6-registry-b40); DEMONSTRATED OPERATION (the act — SYNTHETIC personas, `claim =
-- 'demonstration'`); REAL ACCEPTANCE (B111's shared non-demonstration recording path, then H3/R2) — never claimed here.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §RG.1 THE LEDGERS ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

-- DISCOVERY (JRN-02 "Discover → rights → contract → validate → approve → collect → monitor"): a proposed source — how it was found, its
-- publisher, its terms, the purposes it is proposed for, the proposer's assessment — before any contract exists. Promoted to a DRAFT
-- SRC@v4 contract (registered in the promotion's own transaction) or declined. The row is the candidate's projection; its events are the log.
CREATE TABLE observation.source_candidates (
  candidate_id        uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  name                text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 256),
  publisher           text NOT NULL CHECK (length(btrim(publisher)) BETWEEN 2 AND 256),
  how_found           text NOT NULL CHECK (length(btrim(how_found)) BETWEEN 8 AND 2000),
  terms_url           text CHECK (terms_url IS NULL OR (terms_url ~ '^https://[^[:space:]]{3,}$' AND length(terms_url) <= 2000)),
  proposed_purposes   jsonb NOT NULL CHECK (jsonb_typeof(proposed_purposes) = 'array'),
  assessment          text NOT NULL CHECK (length(btrim(assessment)) BETWEEN 8 AND 4000),
  state               text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'promoted', 'declined')),
  proposed_by         uuid NOT NULL,
  proposed_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  promoted_source_id  uuid,
  promoted_contract_version int,
  decided_by          uuid,
  decided_at          timestamptz,
  decision_reason     text,
  request_id          uuid NOT NULL UNIQUE,
  correlation_id      uuid NOT NULL,
  CONSTRAINT osc_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT osc_promoted CHECK ((state = 'promoted') = (promoted_source_id IS NOT NULL AND promoted_contract_version IS NOT NULL)),
  CONSTRAINT osc_decided CHECK ((state = 'proposed') = (decided_by IS NULL))
);
COMMENT ON TABLE observation.source_candidates IS 'B40 §RG (JRN-02, V00-T-032, V01-T-009): a DISCOVERED source before any contract — how it was found, the publisher, the terms URL, the proposed purposes, the proposer''s assessment; proposed by a domain analyst or collection manager, promoted to a draft SRC@v4 contract (prefilled) or declined. The projection of source_candidate_events.';
CREATE INDEX osc_domain ON observation.source_candidates (tenant_id, domain_id, state, proposed_at DESC);

CREATE TABLE observation.source_candidate_events (
  event_id            uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  candidate_id        uuid NOT NULL REFERENCES observation.source_candidates (candidate_id),
  event               text NOT NULL CHECK (event IN ('candidate.proposed', 'candidate.promoted', 'candidate.declined')),
  actor               uuid NOT NULL,
  occurred_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  details             jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  correlation_id      uuid NOT NULL,
  CONSTRAINT osce_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX osce_candidate ON observation.source_candidate_events (candidate_id, occurred_at);
CREATE TRIGGER osce_append_only BEFORE UPDATE OR DELETE ON observation.source_candidate_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- THE EVALUATION RECORD (DP-09-006, PR-09-001/-002, D5): before approval, a collection manager who did not register the version records the
-- authority, the rights and purpose evidence, the coverage fit against the declared universe, the cost, the risks, the contract tests and a
-- recommendation. An SRC@v4 contract is approved only on the LATEST evaluation of that version recommending approval (approve_source).
CREATE TABLE observation.source_evaluations (
  evaluation_id       uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  source_id           uuid NOT NULL,
  contract_version    int  NOT NULL CHECK (contract_version >= 1),
  authority           text NOT NULL CHECK (length(btrim(authority)) BETWEEN 8 AND 2000),
  rights_evidence     text NOT NULL CHECK (length(btrim(rights_evidence)) BETWEEN 8 AND 2000),
  coverage_fit        text NOT NULL CHECK (length(btrim(coverage_fit)) BETWEEN 8 AND 2000),
  cost                text NOT NULL CHECK (length(btrim(cost)) BETWEEN 2 AND 1000),
  risks               jsonb NOT NULL CHECK (jsonb_typeof(risks) = 'array'),
  contract_tests      jsonb NOT NULL CHECK (jsonb_typeof(contract_tests) = 'array'),
  recommendation      text NOT NULL CHECK (recommendation IN ('approve', 'reject', 'revise')),
  reason              text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  change_impact       jsonb,                                    -- the preview of a version that supersedes another (CAP-OB-02); NULL for a first version
  evaluated_by        uuid NOT NULL,
  evaluated_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  request_id          uuid NOT NULL UNIQUE,
  correlation_id      uuid NOT NULL,
  CONSTRAINT ose_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
COMMENT ON TABLE observation.source_evaluations IS 'B40 §RG (DP-09-006, PR-09-001/-002, D5): the evaluation of one source contract version before approval — authority, rights and purpose evidence, coverage fit, cost, risks, contract tests, a recommendation; by a collection manager who is not the registrar. An SRC@v4 contract is approved only on the latest evaluation recommending approval. Append-only.';
CREATE INDEX ose_version ON observation.source_evaluations (source_id, contract_version, evaluated_at DESC);
CREATE TRIGGER ose_append_only BEFORE UPDATE OR DELETE ON observation.source_evaluations FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- THE RIGHTS LIFECYCLE (L1-C01, FEX-02, R-09, DESIGN D4): every narrowing, withdrawal and restoration of a source's rights, with its reason,
-- its evidence, what it changed on each contract version (and what each was before), the impact it saw, what it opened (a retention action
-- for a declared deletion obligation, a source incident), and — for a restoration — the withdrawal it reverses. History is never rewritten.
CREATE TABLE observation.source_rights_changes (
  change_id           uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  source_id           uuid NOT NULL,
  contract_version    int  NOT NULL CHECK (contract_version >= 1),   -- the version the actor read (the source's latest)
  operation           text NOT NULL CHECK (operation IN ('narrow', 'withdraw', 'restore')),
  via                 text NOT NULL CHECK (via IN ('rights_lifecycle', 'rights_route')),
  reason              text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  evidence            text CHECK (evidence IS NULL OR length(btrim(evidence)) BETWEEN 8 AND 4000),
  purposes_before     jsonb,
  purposes_after      jsonb,
  affected            jsonb NOT NULL CHECK (jsonb_typeof(affected) = 'array'),
  suspended_version   int,
  reactivated_version int,
  deletion_obligation text,
  retention_action_id uuid,
  incident_id         uuid,
  reverses            uuid REFERENCES observation.source_rights_changes (change_id),
  impact              jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(impact) = 'object'),
  attention_items     jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(attention_items) = 'array'),
  actor               uuid NOT NULL,
  recorded_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  request_id          uuid NOT NULL UNIQUE,
  correlation_id      uuid NOT NULL,
  CONSTRAINT osrc_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT osrc_restore_reverses CHECK ((operation = 'restore') = (reverses IS NOT NULL)),
  CONSTRAINT osrc_evidence CHECK (operation = 'narrow' OR evidence IS NOT NULL OR via = 'rights_route')
);
COMMENT ON TABLE observation.source_rights_changes IS 'B40 §RG (L1-C01, FEX-02, R-09, DESIGN D4): the rights lifecycle of a source — narrowed purposes, a withdrawal (every contract version withdrawn, an active one suspended, the schedule removed, the impact recorded, its owners routed, a declared deletion obligation opening a retention action, a source incident opened) and a restoration (the versions a withdrawal withdrew restored to what they were, the suspended version resumed when nothing moved since). Append-only.';
CREATE INDEX osrc_source ON observation.source_rights_changes (tenant_id, domain_id, source_id, recorded_at DESC);
CREATE TRIGGER osrc_append_only BEFORE UPDATE OR DELETE ON observation.source_rights_changes FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- CUSTOMER APPROVAL (DP-09-006, D13): the TENANT's customer sponsor or tenant administrator records the customer's approval of a source's use
-- for the tenant — never the registrar or the approver of that version. A record the admission cites, not a gate on collection; its claim
-- is construction or demonstration (the scope-bound acceptance is B111's, then H3/R2).
CREATE TABLE observation.source_customer_approvals (
  approval_id         uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  source_id           uuid NOT NULL,
  contract_version    int  NOT NULL CHECK (contract_version >= 1),
  decision            text NOT NULL CHECK (decision IN ('approve', 'decline')),
  scope_statement     text NOT NULL CHECK (length(btrim(scope_statement)) BETWEEN 8 AND 1000),
  reason              text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  claim               text NOT NULL CHECK (claim IN ('construction', 'demonstration')),
  approved_by         uuid NOT NULL,
  approved_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  request_id          uuid NOT NULL UNIQUE,
  correlation_id      uuid NOT NULL,
  CONSTRAINT osca_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
COMMENT ON TABLE observation.source_customer_approvals IS 'B40 §RG (DP-09-006, D13): the customer''s approval (or decline) of a source''s use for the tenant, by the tenant''s customer sponsor or tenant administrator — never the registrar or the approver; a record the admission cites, not a gate; claim construction | demonstration (real acceptance is never recorded here). Append-only.';
CREATE INDEX osca_version ON observation.source_customer_approvals (source_id, contract_version, approved_at DESC);
CREATE TRIGGER osca_append_only BEFORE UPDATE OR DELETE ON observation.source_customer_approvals FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- STEWARDSHIP (L1-C01): who stewards the source, in what state, when it is next reviewed — versioned per source.
CREATE TABLE observation.source_stewardship (
  source_id           uuid NOT NULL,
  version             int  NOT NULL CHECK (version >= 1),
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  steward_principal_id uuid NOT NULL,
  state               text NOT NULL CHECK (state IN ('assigned', 'under_review', 'lapsed')),
  review_due          date NOT NULL,
  reason              text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  changed_by          uuid NOT NULL,
  changed_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  request_id          uuid NOT NULL UNIQUE,
  correlation_id      uuid NOT NULL,
  PRIMARY KEY (source_id, version),
  CONSTRAINT oss_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
COMMENT ON TABLE observation.source_stewardship IS 'B40 §RG (L1-C01): the stewardship of a source — the steward (a named data steward or collection manager), the state (assigned | under_review | lapsed) and the review due date; one version per change, by a data steward or collection manager. Append-only.';
CREATE TRIGGER oss_append_only BEFORE UPDATE OR DELETE ON observation.source_stewardship FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- SOURCE INCIDENTS (PER-11: the collection manager owns the operational response): an incident on a source, owned by a collection manager.
CREATE TABLE observation.source_incidents (
  incident_id         uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  source_id           uuid NOT NULL,
  kind                text NOT NULL CHECK (kind IN ('outage', 'rights', 'quality', 'access', 'manipulation', 'other')),
  statement           text NOT NULL CHECK (length(btrim(statement)) BETWEEN 8 AND 2000),
  owner_principal_id  uuid NOT NULL,
  state               text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'resolved')),
  opened_by           uuid NOT NULL,
  opened_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  rights_change_id    uuid,
  resolved_by         uuid,
  resolved_at         timestamptz,
  resolution          text,
  request_id          uuid NOT NULL UNIQUE,
  correlation_id      uuid NOT NULL,
  CONSTRAINT osi_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT osi_resolved CHECK ((state = 'resolved') = (resolved_at IS NOT NULL AND resolved_by IS NOT NULL AND resolution IS NOT NULL))
);
COMMENT ON TABLE observation.source_incidents IS 'B40 §RG (PER-11): an incident on a source (outage, rights, quality, access, manipulation, other), OWNED by a collection manager; opened by a collection manager or domain analyst (a rights withdrawal opens one owned by the withdrawing manager), resolved by its owner or another collection manager. The projection of source_incident_events.';
CREATE INDEX osi_source ON observation.source_incidents (tenant_id, domain_id, source_id, state, opened_at DESC);

CREATE TABLE observation.source_incident_events (
  event_id            uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  incident_id         uuid NOT NULL REFERENCES observation.source_incidents (incident_id),
  event               text NOT NULL CHECK (event IN ('incident.opened', 'incident.resolved')),
  actor               uuid NOT NULL,
  occurred_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  details             jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  correlation_id      uuid NOT NULL,
  CONSTRAINT osie_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX osie_incident ON observation.source_incident_events (incident_id, occurred_at);
CREATE TRIGGER osie_append_only BEFORE UPDATE OR DELETE ON observation.source_incident_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

REVOKE ALL ON observation.source_candidates, observation.source_candidate_events, observation.source_evaluations, observation.source_rights_changes,
              observation.source_customer_approvals, observation.source_stewardship, observation.source_incidents, observation.source_incident_events FROM PUBLIC;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['source_candidates', 'source_candidate_events', 'source_evaluations', 'source_rights_changes', 'source_customer_approvals',
                           'source_stewardship', 'source_incidents', 'source_incident_events'] LOOP
    EXECUTE format('ALTER TABLE observation.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE observation.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY org_isolation ON observation.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON observation.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- §RG.2 THE INTERNALS (no runtime grant; reached only from the definer ports and reads below, which run as the owner) ──────────────────────

/* Is this contract version SRC@v4? — its SRC canonical object's schema (registration admits it as SRC@v4 exactly when it carries the v4
   blocks or the adapter kind: source-contract.ts schemaRefOf). A v1–v3 version keeps every rule it had (D7/D8). */
CREATE OR REPLACE FUNCTION observation._rg_is_v4(p_source uuid, p_contract_version int) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = observation, objects, pg_catalog, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM observation.source_contracts_current s JOIN objects.canonical_objects o
                   ON o.object_type = 'SRC' AND o.object_id = s.src_object_id AND o.object_version = s.src_object_version AND o.tenant_id = s.tenant_id
                  WHERE s.source_id = p_source AND s.contract_version = p_contract_version AND o.schema_ref = 'SRC@v4')
$$;
REVOKE ALL ON FUNCTION observation._rg_is_v4(uuid, int) FROM PUBLIC;

/* The OUTSTANDING withdrawal of a source: its latest withdraw or restore is a withdraw (a row of NULLs otherwise). */
CREATE OR REPLACE FUNCTION observation._rg_outstanding_withdrawal(p_tenant uuid, p_domain uuid, p_source uuid) RETURNS observation.source_rights_changes
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
  SELECT x.* FROM (SELECT c.* FROM observation.source_rights_changes c
                    WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.source_id = p_source AND c.operation IN ('withdraw', 'restore')
                    ORDER BY c.recorded_at DESC, c.change_id DESC LIMIT 1) x
   WHERE x.operation = 'withdraw'
$$;
REVOKE ALL ON FUNCTION observation._rg_outstanding_withdrawal(uuid, uuid, uuid) FROM PUBLIC;

/* A principal in words (the display name, or the id) — for the reads; never an evidence value. */
CREATE OR REPLACE FUNCTION observation._rg_who(p uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN p IS NULL THEN NULL ELSE coalesce(
    (SELECT jsonb_build_object('id', x.id, 'name', x.display_name, 'kind', x.kind) FROM identity.principals x WHERE x.id = p),
    jsonb_build_object('id', p, 'name', NULL, 'kind', NULL)) END
$$;
REVOKE ALL ON FUNCTION observation._rg_who(uuid) FROM PUBLIC;

/* THE IMPACT of a source (FEX-02, PR-09-005, CAP-OB-02): what rests on its evidence today, each with its OWNER —
     evidence   the EVD objects and versions held under each contract version (provenance SRC:<source>@<version>);
     products   B28's observation.source_derived_products (issued forecasts of its series, the open warnings on them, the active scenarios on
                them, the valid runs bound to those scenarios, the active assumptions resting on a claim from its evidence, the packages
                citing any of these) — each with its title, state and owner;
     claims     the claims whose lineage reads the source's evidence (intelligence.claim_lineage) — refs, owner, the evidence they rest on;
                never the claim's content (D9);
     forward    B50's forward impact over the source's evidence (graph.pv_downstream's buckets, taken over the whole set): package options
                citing it, briefings and publications sourced on it, declared strategy dependencies on it, constructed provenance edges;
     owners     every named owner with how many of the above are theirs; markers the source's active impact markers (cause health | rights).
   Bounded: 200 products, 200 claims, 50 per forward bucket — every count is the full count. */
CREATE OR REPLACE FUNCTION observation._rg_impact(p_tenant uuid, p_domain uuid, p_source uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = observation, objects, intelligence, prediction, simulation, decision, graph, executive, identity, pg_catalog, pg_temp AS $$
DECLARE v_ev uuid[]; v_evidence jsonb; v_products jsonb; v_np int; v_claims jsonb; v_nc int; v_forward jsonb; v_owners jsonb; v_markers jsonb; v_name text; v_n int;
BEGIN
  SELECT s.name INTO v_name FROM observation.source_contracts_current s WHERE s.source_id = p_source AND s.tenant_id = p_tenant AND s.domain_id = p_domain ORDER BY s.contract_version DESC LIMIT 1;
  v_ev := ARRAY(SELECT DISTINCT e.object_id FROM objects.canonical_objects e
                  WHERE e.object_type = 'EVD' AND e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.provenance_ref LIKE 'SRC:' || p_source::text || '@%');
  SELECT jsonb_build_object('objects', cardinality(v_ev), 'versions', coalesce(sum(g.n_v), 0),
           'by_contract_version', coalesce(jsonb_agg(jsonb_build_object('contract_version', g.cv, 'objects', g.n_o, 'versions', g.n_v) ORDER BY g.cv), '[]'::jsonb))
    INTO v_evidence
    FROM (SELECT nullif(split_part(e.provenance_ref, '@', 2), '')::int AS cv, count(DISTINCT e.object_id) n_o, count(*) n_v FROM objects.canonical_objects e
           WHERE e.object_type = 'EVD' AND e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.provenance_ref LIKE 'SRC:' || p_source::text || '@%' GROUP BY 1) g;
  -- the derived products (B28), each with its title, state and owner
  WITH d AS (SELECT * FROM observation.source_derived_products(p_tenant, p_domain, p_source)),
       t AS (SELECT d.subject_kind AS kind, d.subject_id AS id, d.via,
                    CASE d.subject_kind
                      WHEN 'forecast' THEN (SELECT coalesce(f.label, f.series_key) FROM prediction.forecasts_current f WHERE f.forecast_id = d.subject_id)
                      WHEN 'warning' THEN (SELECT w.title FROM prediction.warnings_current w WHERE w.warning_id = d.subject_id)
                      WHEN 'scenario' THEN (SELECT s.title FROM prediction.scenarios_current s WHERE s.scenario_id = d.subject_id)
                      WHEN 'run' THEN (SELECT r.run_kind || ' run' || coalesce(' · ' || r.component, '') FROM simulation.runs_current r WHERE r.run_id = d.subject_id)
                      WHEN 'assumption' THEN (SELECT g.title FROM graph.strategy_current g WHERE g.strategy_object_id = d.subject_id)
                      WHEN 'package' THEN (SELECT p.title FROM decision.packages_current p WHERE p.package_id = d.subject_id) END AS title,
                    CASE d.subject_kind
                      WHEN 'forecast' THEN (SELECT f.state FROM prediction.forecasts_current f WHERE f.forecast_id = d.subject_id)
                      WHEN 'warning' THEN (SELECT w.state FROM prediction.warnings_current w WHERE w.warning_id = d.subject_id)
                      WHEN 'scenario' THEN (SELECT s.state FROM prediction.scenarios_current s WHERE s.scenario_id = d.subject_id)
                      WHEN 'run' THEN (SELECT r.state FROM simulation.runs_current r WHERE r.run_id = d.subject_id)
                      WHEN 'assumption' THEN (SELECT g.status FROM graph.strategy_current g WHERE g.strategy_object_id = d.subject_id)
                      WHEN 'package' THEN (SELECT p.state FROM decision.packages_current p WHERE p.package_id = d.subject_id) END AS state,
                    CASE d.subject_kind
                      WHEN 'forecast' THEN (SELECT f.issued_by FROM prediction.forecasts_current f WHERE f.forecast_id = d.subject_id)
                      WHEN 'warning' THEN (SELECT coalesce(w.routed_to, w.raised_by) FROM prediction.warnings_current w WHERE w.warning_id = d.subject_id)
                      WHEN 'scenario' THEN (SELECT s.owner_principal_id FROM prediction.scenarios_current s WHERE s.scenario_id = d.subject_id)
                      WHEN 'run' THEN (SELECT r.operator_principal_id FROM simulation.runs_current r WHERE r.run_id = d.subject_id)
                      WHEN 'assumption' THEN (SELECT g.owner_principal_id FROM graph.strategy_current g WHERE g.strategy_object_id = d.subject_id)
                      WHEN 'package' THEN (SELECT p.owner_principal_id FROM decision.packages_current p WHERE p.package_id = d.subject_id) END AS owner
               FROM d)
  SELECT count(*)::int,
         coalesce((SELECT jsonb_agg(jsonb_build_object('kind', x.kind, 'id', x.id, 'via', x.via, 'title', x.title, 'state', x.state, 'owner', observation._rg_who(x.owner))
                                    ORDER BY x.kind, x.title, x.id) FROM (SELECT * FROM t ORDER BY kind, title, id LIMIT 200) x), '[]'::jsonb)
    INTO v_np, v_products FROM t;
  -- the claims through the lineage (refs and owners only — never the content, D9)
  WITH cl AS (SELECT DISTINCT ON (l.claim_object_id) l.claim_object_id, l.claim_version, l.claim_type, l.evidence_object_id
                FROM intelligence.claim_lineage l
               WHERE l.tenant_id = p_tenant AND l.domain_id = p_domain AND l.evidence_object_id IN (SELECT unnest(v_ev))
               ORDER BY l.claim_object_id, l.claim_version DESC),
       o AS (SELECT cl.*, (SELECT graph.pv_owner(c.accountable_owner) FROM objects.canonical_objects c
                            WHERE c.object_id = cl.claim_object_id AND c.object_version = cl.claim_version AND c.tenant_id = p_tenant AND c.domain_id = p_domain LIMIT 1) AS owner
               FROM cl)
  SELECT count(*)::int,
         coalesce((SELECT jsonb_agg(jsonb_build_object('kind', 'claim', 'type', x.claim_type, 'id', x.claim_object_id, 'version', x.claim_version, 'ref', x.claim_type || ':' || x.claim_object_id || '@' || x.claim_version,
                                                       'evidence_id', x.evidence_object_id, 'owner', observation._rg_who(x.owner)) ORDER BY x.claim_object_id)
                     FROM (SELECT * FROM o ORDER BY claim_object_id LIMIT 200) x), '[]'::jsonb)
    INTO v_nc, v_claims FROM o;
  -- B50's forward impact, taken over the source's whole evidence set
  SELECT jsonb_build_object(
    'options', jsonb_build_object(
       'count', (SELECT count(*) FROM decision.options op WHERE op.tenant_id = p_tenant AND op.domain_id = p_domain
                  AND EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(op.consequences) = 'array' THEN op.consequences ELSE '[]'::jsonb END) c
                               WHERE (c ->> 'id') ~* '^[0-9a-f-]{36}$' AND (c ->> 'id')::uuid IN (SELECT unnest(v_ev)))),
       'items', coalesce((SELECT jsonb_agg(z ORDER BY z ->> 'ref') FROM (
          SELECT jsonb_build_object('kind', 'option', 'ref', 'DPK:' || op.package_id || '@' || op.version, 'package_id', op.package_id, 'version', op.version, 'option', op.key,
                                    'title', (SELECT p.title FROM decision.packages_current p WHERE p.package_id = op.package_id),
                                    'owner', observation._rg_who((SELECT p.owner_principal_id FROM decision.packages_current p WHERE p.package_id = op.package_id))) z
            FROM decision.options op WHERE op.tenant_id = p_tenant AND op.domain_id = p_domain
             AND EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(op.consequences) = 'array' THEN op.consequences ELSE '[]'::jsonb END) c
                          WHERE (c ->> 'id') ~* '^[0-9a-f-]{36}$' AND (c ->> 'id')::uuid IN (SELECT unnest(v_ev)))
           ORDER BY op.package_id, op.version, op.key LIMIT 50) q), '[]'::jsonb)),
    'briefings', jsonb_build_object('items', coalesce((SELECT jsonb_agg(jsonb_build_object('kind', 'briefing', 'ref', 'BRF:' || b.object_id || '@' || b.object_version) ORDER BY b.object_id, b.object_version) FROM (
          SELECT b.object_id, b.object_version FROM objects.canonical_objects b WHERE b.object_type = 'BRF' AND b.tenant_id = p_tenant AND b.domain_id = p_domain
             AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(b.source_object_ids, '[]'::jsonb) || coalesce(b.evidence_refs, '[]'::jsonb)) s
                          WHERE substring(s FROM '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')::uuid IN (SELECT unnest(v_ev)))
           ORDER BY b.object_id, b.object_version LIMIT 50) b), '[]'::jsonb)),
    'publications', jsonb_build_object('items', coalesce((SELECT jsonb_agg(jsonb_build_object('kind', 'publication', 'ref', 'PUB:' || pv.publication_id || ' v' || pv.version, 'state', pv.state) ORDER BY pv.publication_id, pv.version)
          FROM (SELECT pv.* FROM executive.publication_versions pv WHERE pv.tenant_id = p_tenant AND pv.domain_id = p_domain AND pv.source_id IN (SELECT unnest(v_ev))
                 ORDER BY pv.publication_id, pv.version LIMIT 50) pv), '[]'::jsonb)),
    'strategy', jsonb_build_object('items', coalesce((SELECT jsonb_agg(jsonb_build_object('kind', 'strategy_dependency', 'ref', d.dependent_type || ':' || d.dependent_object_id, 'rationale', d.rationale) ORDER BY d.dependent_object_id)
          FROM (SELECT d.* FROM graph.dependencies d WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.state = 'active' AND d.depends_on_id IN (SELECT unnest(v_ev))
                 ORDER BY d.dependent_object_id LIMIT 50) d), '[]'::jsonb)),
    'constructed', jsonb_build_object('count', (SELECT count(*) FROM graph.provenance_edges e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.upstream_id IN (SELECT unnest(v_ev))),
          'items', coalesce((SELECT jsonb_agg(jsonb_build_object('kind', 'constructed', 'ref', e.dependent_type || ':' || e.dependent_id || '@' || e.dependent_version, 'basis', e.basis) ORDER BY e.dependent_id)
          FROM (SELECT e.* FROM graph.provenance_edges e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.upstream_id IN (SELECT unnest(v_ev))
                 ORDER BY e.dependent_id LIMIT 50) e), '[]'::jsonb)))
    INTO v_forward;
  -- the owners (named humans, with how many of the products, claims and options are theirs)
  WITH o AS (SELECT (x ->> 'id')::uuid AS owner FROM jsonb_array_elements(v_products) p CROSS JOIN LATERAL (SELECT p -> 'owner' AS x) y WHERE (y.x ->> 'id') IS NOT NULL
             UNION ALL SELECT (c #>> '{owner,id}')::uuid FROM jsonb_array_elements(v_claims) c WHERE (c #>> '{owner,id}') IS NOT NULL
             UNION ALL SELECT (op #>> '{owner,id}')::uuid FROM jsonb_array_elements(v_forward #> '{options,items}') op WHERE (op #>> '{owner,id}') IS NOT NULL)
  SELECT coalesce(jsonb_agg(observation._rg_who(owner) || jsonb_build_object('items', n) ORDER BY n DESC, owner), '[]'::jsonb) INTO v_owners
    FROM (SELECT owner, count(*) n FROM o GROUP BY owner) g;
  SELECT coalesce(jsonb_agg(jsonb_build_object('marker_id', m.marker_id, 'kind', m.subject_kind, 'id', m.subject_id, 'health_state', m.health_state, 'cause', m.cause, 'set_at', m.set_at) ORDER BY m.set_at, m.marker_id), '[]'::jsonb)
    INTO v_markers FROM observation.source_impact_markers m WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain AND m.source_id = p_source AND m.state = 'active';
  v_n := v_np + v_nc + coalesce((v_forward #>> '{options,count}')::int, 0) + jsonb_array_length(v_forward #> '{briefings,items}') + jsonb_array_length(v_forward #> '{publications,items}')
         + jsonb_array_length(v_forward #> '{strategy,items}') + coalesce((v_forward #>> '{constructed,count}')::int, 0);
  RETURN jsonb_build_object('source_id', p_source, 'source_name', v_name, 'evidence', v_evidence,
    'products', v_products, 'products_count', v_np, 'claims', v_claims, 'claims_count', v_nc, 'forward', v_forward, 'owners', v_owners, 'markers', v_markers,
    'resting', v_n,
    'statement', CASE WHEN v_n = 0 THEN 'nothing rests on it yet: no product, claim, option, briefing, publication or dependency names this source''s evidence'
                      ELSE format('%s product(s), %s claim(s) and %s further reference(s) rest on this source''s evidence (%s evidence object(s))', v_np, v_nc,
                                  v_n - v_np - v_nc, v_evidence ->> 'objects') END);
END $$;
REVOKE ALL ON FUNCTION observation._rg_impact(uuid, uuid, uuid) FROM PUBLIC;

/* ONE ATTENTION ITEM PER RESTING PRODUCT, to its OWNER (PR-09-005's remediation routing; the B82 trust-investigation idiom): class
   source.coverage_loss under the domain's attention policy, the cause the rights change; a product without a named human owner is routed to
   the class's roles. Once per (product, change). Returns what was routed. */
CREATE OR REPLACE FUNCTION observation._rg_route_owners(p_tenant uuid, p_domain uuid, p_source uuid, p_change uuid, p_impact jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, executive, identity, pg_catalog, pg_temp AS $$
DECLARE x jsonb; v_kind text; v_id uuid; v_owner uuid; pol executive.attention_policies%ROWTYPE; v_eval jsonb; v_route jsonb; v_state text; v_item uuid; v_out jsonb := '[]'::jsonb; v_title text;
BEGIN
  SELECT * INTO pol FROM executive.attention_policies a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.state = 'active';
  FOR x IN SELECT e FROM jsonb_array_elements(coalesce(p_impact -> 'products', '[]'::jsonb) || coalesce(p_impact -> 'claims', '[]'::jsonb)) e LOOP
    v_kind := CASE x ->> 'kind' WHEN 'assumption' THEN 'strategy_object' ELSE x ->> 'kind' END;
    IF v_kind NOT IN ('forecast', 'warning', 'scenario', 'run', 'strategy_object', 'package', 'claim') THEN CONTINUE; END IF;
    v_id := (x ->> 'id')::uuid;
    v_owner := (x #>> '{owner,id}')::uuid;
    v_owner := CASE WHEN v_owner IS NOT NULL AND EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = v_owner AND p.kind = 'human' AND p.status = 'active' AND (p.tenant_id = p_tenant OR p.scope = 'PLATFORM')) THEN v_owner END;
    IF EXISTS (SELECT 1 FROM executive.attention_items i WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.signal_class = 'source.coverage_loss' AND i.subject_id = v_id AND i.cause_event_id = p_change) THEN CONTINUE; END IF;
    v_eval := executive.evaluate_attention(CASE WHEN pol.policy_id IS NULL THEN NULL ELSE pol.rules END, 'source.coverage_loss',
                jsonb_build_object('consequence', 'C2', 'confidence', 1, 'hours_to_window', NULL, 'affected_products', 1, 'health_state', 'suspended')) || jsonb_build_object('policy_version', pol.version);
    v_route := executive.attention_route(pol.rules, 'source.coverage_loss', v_eval ->> 'outcome', v_owner, p_tenant, p_domain);
    v_state := v_route ->> 'state';
    v_item := gen_random_uuid();
    v_title := left(format('Rights withdrawn on %s — your %s %s rests on its evidence', coalesce(p_impact ->> 'source_name', p_source::text), replace(x ->> 'kind', '_', ' '),
                           coalesce(x ->> 'title', x ->> 'ref', v_id::text)), 512);
    INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state,
                                           owner_principal_id, route_roles, policy_id, policy_version, evaluation, details, due_at, escalations, correlation_id)
    VALUES (v_item, 'DOMAIN', p_tenant, p_domain, 'source.coverage_loss', v_kind, v_id, p_change, 'SourceRightsWithdrawn', v_title, v_eval ->> 'outcome', v_state, v_owner,
            CASE WHEN v_owner IS NULL AND jsonb_array_length(coalesce(v_route -> 'route_roles', '[]'::jsonb)) = 0 THEN ARRAY['collection_manager']
                 ELSE ARRAY(SELECT jsonb_array_elements_text(v_route -> 'route_roles')) END,
            pol.policy_id, pol.version, v_eval,
            jsonb_build_object('source_id', p_source, 'rights_change_id', p_change, 'cause', 'rights', 'product', x, 'statement', 'the rights of a source this product rests on were withdrawn; its decision-active use is refused until they are restored'),
            (v_route ->> 'due_at')::timestamptz, coalesce((v_route ->> 'escalations')::int, 0), p_correlation);
    PERFORM executive.attention_event(v_item, p_tenant, p_domain,
              CASE v_state WHEN 'open' THEN 'item.routed' WHEN 'escalated' THEN 'item.escalated' WHEN 'unrouted' THEN 'item.unrouted' ELSE 'item.deprioritized' END,
              p_actor, jsonb_build_object('outcome', v_eval ->> 'outcome', 'policy_version', pol.version, 'owner', v_owner, 'route_roles', v_route -> 'route_roles',
                                          'cause_event_id', p_change, 'cause_event_type', 'SourceRightsWithdrawn'), p_correlation);
    v_out := v_out || jsonb_build_object('item_id', v_item, 'kind', x ->> 'kind', 'id', v_id, 'owner', v_owner, 'state', v_state);
  END LOOP;
  RETURN v_out;
END $$;
REVOKE ALL ON FUNCTION observation._rg_route_owners(uuid, uuid, uuid, uuid, jsonb, uuid, uuid) FROM PUBLIC;

/* THE WITHDRAWAL (DESIGN D4) — shared by observation.change_rights and the v1–v3 route (observation.set_rights_state): EVERY contract version
   of the source not already withdrawn is withdrawn (rights_state → withdrawn; an ACTIVE version suspended — fail closed, the 0022 rule),
   each with its contract.rights_changed event (and contract.suspended for the suspension); the schedule entry REMOVED (the route removes the
   Redis job in the same operation); the impact recorded and each resting product's owner routed an attention item; a DECLARED deletion
   obligation opens a B9 retention action (kind deletion, the source's evidence; approved by the retention authority and executed by the
   steward — never here); a source incident (kind rights) opened, owned by the withdrawing collection manager. The caller has checked the
   authority, the scope, the person and the request. */
CREATE OR REPLACE FUNCTION observation._rg_withdraw(p_change uuid, p_request_id uuid, p_tenant uuid, p_domain uuid, p_source uuid, p_named_version int,
                                                    p_reason text, p_evidence text, p_deletion text, p_actor uuid, p_via text, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, retention, pg_catalog, pg_temp AS $$
DECLARE r observation.source_contracts_current%ROWTYPE; v_affected jsonb := '[]'::jsonb; v_suspended int; v_impact jsonb; v_action uuid; v_incident uuid;
        v_items jsonb; v_removed int; v_retention text; v_name text; ch observation.source_rights_changes%ROWTYPE;
BEGIN
  IF (observation._rg_outstanding_withdrawal(p_tenant, p_domain, p_source)).change_id IS NOT NULL THEN
    RAISE EXCEPTION 'rights change rejected (state): the rights of source % are already withdrawn; a restoration lifts the withdrawal', p_source USING ERRCODE = '23514';
  END IF;
  v_impact := observation._rg_impact(p_tenant, p_domain, p_source);
  FOR r IN SELECT * FROM observation.source_contracts_current s WHERE s.source_id = p_source AND s.tenant_id = p_tenant AND s.domain_id = p_domain ORDER BY s.contract_version FOR UPDATE LOOP
    v_name := r.name;
    v_retention := r.contract #>> '{authority_and_rights,retention}';
    IF r.rights_state = 'withdrawn' THEN
      v_affected := v_affected || jsonb_build_object('contract_version', r.contract_version, 'prior_rights', 'withdrawn', 'prior_lifecycle', r.lifecycle_state, 'changed', false);
      CONTINUE;
    END IF;
    UPDATE observation.source_contracts_current
       SET rights_state = 'withdrawn',
           lifecycle_state = CASE WHEN lifecycle_state = 'active' THEN 'suspended' ELSE lifecycle_state END,
           updated_at = clock_timestamp()
     WHERE source_id = r.source_id AND contract_version = r.contract_version;
    INSERT INTO observation.source_contract_events (event_id, scope, tenant_id, domain_id, source_id, contract_version, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, r.source_id, r.contract_version, 'contract.rights_changed', p_actor,
            jsonb_build_object('operation', 'withdraw', 'change_id', p_change, 'from', r.rights_state, 'to', 'withdrawn', 'reason', btrim(p_reason), 'evidence', p_evidence, 'via', p_via,
                               'kind', 'rights_update', 'rights_state', 'withdrawn'), p_correlation);
    IF r.lifecycle_state = 'active' THEN
      -- the v1–v3 route writes its own recorded suspension event (set_rights_state, unchanged); the lifecycle writes this one
      IF p_via <> 'rights_route' THEN
        INSERT INTO observation.source_contract_events (event_id, scope, tenant_id, domain_id, source_id, contract_version, event, actor_principal_id, details, correlation_id)
        VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, r.source_id, r.contract_version, 'contract.suspended', p_actor,
                jsonb_build_object('from', 'active', 'to', 'suspended', 'reason', 'rights withdrawn: ' || btrim(p_reason), 'kind', 'rights_withdrawal', 'change_id', p_change), p_correlation);
      END IF;
      v_suspended := r.contract_version;
    END IF;
    v_affected := v_affected || jsonb_build_object('contract_version', r.contract_version, 'prior_rights', r.rights_state, 'prior_lifecycle', r.lifecycle_state,
                                                   'lifecycle_after', CASE WHEN r.lifecycle_state = 'active' THEN 'suspended' ELSE r.lifecycle_state END, 'changed', true);
  END LOOP;
  IF jsonb_array_length(v_affected) = 0 THEN
    RAISE EXCEPTION 'rights change rejected (unknown_source): source % is not recorded in this domain', p_source USING ERRCODE = '23503';
  END IF;
  -- the schedule: removed (collection is prohibited from this instant; the route removes the Redis job in the same operation)
  UPDATE observation.scheduler_entries SET status = 'removed', removed_at = clock_timestamp()
   WHERE source_id = p_source AND tenant_id = p_tenant AND domain_id = p_domain AND status = 'scheduled';
  GET DIAGNOSTICS v_removed = ROW_COUNT;
  -- a declared deletion obligation opens a B9 retention action over the source's evidence (never executed here)
  IF p_deletion IS NOT NULL AND length(btrim(p_deletion)) > 0 THEN
    IF length(btrim(p_deletion)) < 8 OR length(p_deletion) > 1000 THEN
      RAISE EXCEPTION 'rights change rejected (deletion_obligation): a deletion obligation, when the withdrawal carries one, says what must be deleted and by when (8 to 1000 characters)' USING ERRCODE = '22023';
    END IF;
    v_action := gen_random_uuid();
    INSERT INTO retention.actions_current (action_id, scope, tenant_id, domain_id, kind, target_kind, selector, schedule_id, retention_profile, opened_by, correlation_id)
    VALUES (v_action, 'DOMAIN', p_tenant, p_domain, 'deletion', 'evidence',
            jsonb_build_object('source_id', p_source, 'reason', 'rights withdrawn — the declared deletion obligation: ' || btrim(p_deletion), 'rights_change_id', p_change),
            NULL, v_retention, p_actor, p_correlation);
    PERFORM retention.event(v_action, p_tenant, p_domain, 'action.opened', p_actor,
              jsonb_build_object('kind', 'deletion', 'target_kind', 'evidence', 'selector', jsonb_build_object('source_id', p_source), 'schedule_id', NULL,
                                 'opened_by', 'the rights withdrawal', 'rights_change_id', p_change, 'deletion_obligation', btrim(p_deletion)), p_correlation);
  END IF;
  -- the source incident (PER-11): kind rights, owned by the withdrawing collection manager
  v_incident := gen_random_uuid();
  INSERT INTO observation.source_incidents (incident_id, scope, tenant_id, domain_id, source_id, kind, statement, owner_principal_id, opened_by, rights_change_id, request_id, correlation_id)
  VALUES (v_incident, 'DOMAIN', p_tenant, p_domain, p_source, 'rights', left('Rights withdrawn: ' || btrim(p_reason), 2000), p_actor, p_actor, p_change, gen_random_uuid(), p_correlation);
  INSERT INTO observation.source_incident_events (event_id, scope, tenant_id, domain_id, incident_id, event, actor, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, v_incident, 'incident.opened', p_actor, jsonb_build_object('kind', 'rights', 'rights_change_id', p_change, 'owner', p_actor), p_correlation);
  -- the owners of what rests on it
  v_items := observation._rg_route_owners(p_tenant, p_domain, p_source, p_change, v_impact, p_actor, p_correlation);
  INSERT INTO observation.source_rights_changes (change_id, scope, tenant_id, domain_id, source_id, contract_version, operation, via, reason, evidence, affected, suspended_version,
                                                 deletion_obligation, retention_action_id, incident_id, impact, attention_items, actor, request_id, correlation_id)
  VALUES (p_change, 'DOMAIN', p_tenant, p_domain, p_source, p_named_version, 'withdraw', p_via, btrim(p_reason), nullif(btrim(coalesce(p_evidence, '')), ''), v_affected, v_suspended,
          nullif(btrim(coalesce(p_deletion, '')), ''), v_action, v_incident, v_impact, v_items, p_actor, p_request_id, p_correlation)
  RETURNING * INTO ch;
  RETURN jsonb_build_object('change_id', ch.change_id, 'operation', 'withdraw', 'source_id', p_source, 'source_name', v_name, 'contract_version', p_named_version, 'affected', v_affected,
    'suspended_version', v_suspended, 'schedule', CASE WHEN v_removed > 0 THEN 'removed' ELSE 'none_scheduled' END, 'retention_action_id', v_action, 'incident_id', v_incident,
    'deletion_obligation', ch.deletion_obligation,
    'deletion_statement', CASE WHEN v_action IS NULL THEN 'no deletion obligation was declared with the withdrawal: no retention action was opened'
                               ELSE 'a retention action (deletion of the source''s evidence) was opened; it waits for the retention authority''s approval and is executed by the steward — never automatically' END,
    'impact', v_impact, 'attention_items', v_items, 'recorded_at', ch.recorded_at, 'replayed', false);
END $$;
REVOKE ALL ON FUNCTION observation._rg_withdraw(uuid, uuid, uuid, uuid, uuid, int, text, text, text, uuid, text, uuid) FROM PUBLIC;

-- §RG.3 THE PORTS ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/* The acting principal is the one the route names (never an act on behalf of another). */
CREATE OR REPLACE FUNCTION observation._rg_actor(p_noun text, p_actor uuid) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
DECLARE v uuid := public.eye_principal();
BEGIN
  IF v IS NULL OR p_actor IS NULL OR p_actor IS DISTINCT FROM v THEN
    RAISE EXCEPTION '% rejected (actor): the act is recorded under the acting principal, never on behalf of another', p_noun USING ERRCODE = '42501';
  END IF;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION observation._rg_actor(text, uuid) FROM PUBLIC;

-- DISCOVERY: PROPOSE (a domain analyst or collection manager) ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION observation.propose_source_candidate(
  p_request_id uuid, p_tenant uuid, p_domain uuid, p_name text, p_publisher text, p_how_found text, p_terms_url text, p_purposes jsonb, p_assessment text,
  p_actor uuid, p_correlation uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; c observation.source_candidates%ROWTYPE; v_problem text; v_id uuid := gen_random_uuid();
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.source.discover']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := observation._rg_actor('source candidate', p_actor);
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'source candidate rejected (request): a proposal carries its request id' USING ERRCODE = '22023'; END IF;
  SELECT * INTO c FROM observation.source_candidates x WHERE x.request_id = p_request_id;
  IF FOUND THEN
    IF c.proposed_by IS DISTINCT FROM v_actor OR c.tenant_id IS DISTINCT FROM p_tenant OR c.domain_id IS DISTINCT FROM p_domain THEN
      RAISE EXCEPTION 'source candidate rejected (duplicate): request % already recorded another act; a new proposal takes a new request id', p_request_id USING ERRCODE = '23505';
    END IF;
    RETURN to_jsonb(c) || jsonb_build_object('replayed', true);
  END IF;
  PERFORM governance.assert_approver('source candidate', v_actor, p_tenant, p_domain, ARRAY['domain_analyst', 'collection_manager'], NULL, NULL, 'proposing a discovered source');
  IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 2 AND 256 THEN RAISE EXCEPTION 'source candidate rejected (name): the source is named (2 to 256 characters)' USING ERRCODE = '22023'; END IF;
  IF p_publisher IS NULL OR length(btrim(p_publisher)) NOT BETWEEN 2 AND 256 THEN RAISE EXCEPTION 'source candidate rejected (publisher): the publisher is named (2 to 256 characters)' USING ERRCODE = '22023'; END IF;
  IF p_how_found IS NULL OR length(btrim(p_how_found)) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'source candidate rejected (how_found): how the source was found is stated (8 to 2000 characters)' USING ERRCODE = '22023'; END IF;
  IF p_terms_url IS NOT NULL AND (p_terms_url !~ '^https://[^[:space:]]{3,}$' OR length(p_terms_url) > 2000) THEN RAISE EXCEPTION 'source candidate rejected (terms_url): the terms are an https address, or none yet' USING ERRCODE = '22023'; END IF;
  v_problem := observation.rt_list_problem(p_purposes, 'proposed purposes', 1);
  IF v_problem IS NOT NULL THEN RAISE EXCEPTION 'source candidate rejected (purposes): %', v_problem USING ERRCODE = '22023'; END IF;
  IF p_assessment IS NULL OR length(btrim(p_assessment)) NOT BETWEEN 8 AND 4000 THEN RAISE EXCEPTION 'source candidate rejected (assessment): the proposer''s assessment is stated (8 to 4000 characters)' USING ERRCODE = '22023'; END IF;
  INSERT INTO observation.source_candidates (candidate_id, scope, tenant_id, domain_id, name, publisher, how_found, terms_url, proposed_purposes, assessment, proposed_by, request_id, correlation_id)
  VALUES (v_id, 'DOMAIN', p_tenant, p_domain, btrim(p_name), btrim(p_publisher), btrim(p_how_found), p_terms_url, observation.rt_list(p_purposes), btrim(p_assessment), v_actor, p_request_id, p_correlation)
  RETURNING * INTO c;
  INSERT INTO observation.source_candidate_events (event_id, scope, tenant_id, domain_id, candidate_id, event, actor, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, v_id, 'candidate.proposed', v_actor, jsonb_build_object('name', c.name, 'publisher', c.publisher, 'terms_url', c.terms_url, 'purposes', c.proposed_purposes), p_correlation);
  RETURN to_jsonb(c) || jsonb_build_object('replayed', false);
END $$;
REVOKE ALL ON FUNCTION observation.propose_source_candidate(uuid, uuid, uuid, text, text, text, text, jsonb, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.propose_source_candidate(uuid, uuid, uuid, text, text, text, text, jsonb, text, uuid, uuid) TO eye_commit;

-- DISCOVERY: DECLINE (the proposer, or a collection manager) ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION observation.decline_source_candidate(p_tenant uuid, p_domain uuid, p_candidate uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; c observation.source_candidates%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.source.discover']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := observation._rg_actor('source candidate', p_actor);
  SELECT * INTO c FROM observation.source_candidates x WHERE x.candidate_id = p_candidate AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'source candidate rejected (unknown_candidate): candidate % is not recorded in this domain', p_candidate USING ERRCODE = '23503'; END IF;
  IF c.proposed_by IS DISTINCT FROM v_actor THEN
    PERFORM governance.assert_approver('source candidate', v_actor, p_tenant, p_domain, ARRAY['collection_manager'], NULL, NULL, 'declining another person''s candidate');
  ELSE
    PERFORM governance.assert_approver('source candidate', v_actor, p_tenant, p_domain, ARRAY['domain_analyst', 'collection_manager'], NULL, NULL, 'declining a candidate');
  END IF;
  IF c.state <> 'proposed' THEN RAISE EXCEPTION 'source candidate rejected (state): candidate % is %, only a proposed candidate is declined', p_candidate, c.state USING ERRCODE = '23514'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'source candidate rejected (reason): a decline states its reason (8 to 2000 characters)' USING ERRCODE = '22023'; END IF;
  UPDATE observation.source_candidates SET state = 'declined', decided_by = v_actor, decided_at = clock_timestamp(), decision_reason = btrim(p_reason) WHERE candidate_id = p_candidate RETURNING * INTO c;
  INSERT INTO observation.source_candidate_events (event_id, scope, tenant_id, domain_id, candidate_id, event, actor, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_candidate, 'candidate.declined', v_actor, jsonb_build_object('reason', btrim(p_reason)), p_correlation);
  RETURN to_jsonb(c);
END $$;
REVOKE ALL ON FUNCTION observation.decline_source_candidate(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.decline_source_candidate(uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

-- DISCOVERY: PROMOTE — in the REGISTRATION's own transaction (observation.source.register): the candidate names the draft SRC@v4 contract
-- version the same registrar has just registered from it. ──────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION observation.promote_source_candidate(p_tenant uuid, p_domain uuid, p_candidate uuid, p_source_id uuid, p_contract_version int, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; c observation.source_candidates%ROWTYPE; s observation.source_contracts_current%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.source.register']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := observation._rg_actor('source candidate', p_actor);
  SELECT * INTO c FROM observation.source_candidates x WHERE x.candidate_id = p_candidate AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'source candidate rejected (unknown_candidate): candidate % is not recorded in this domain', p_candidate USING ERRCODE = '23503'; END IF;
  IF c.state <> 'proposed' THEN RAISE EXCEPTION 'source candidate rejected (state): candidate % is %, only a proposed candidate is promoted', p_candidate, c.state USING ERRCODE = '23514'; END IF;
  SELECT * INTO s FROM observation.source_contracts_current x WHERE x.source_id = p_source_id AND x.contract_version = p_contract_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'source candidate rejected (unknown_source): source % v% is not recorded in this domain', p_source_id, p_contract_version USING ERRCODE = '23503'; END IF;
  IF s.lifecycle_state <> 'draft' OR s.registrar_principal_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'source candidate rejected (state): a candidate is promoted to the draft its promoter has just registered (source % v% is %, registered by another)', p_source_id, p_contract_version, s.lifecycle_state USING ERRCODE = '23514';
  END IF;
  IF NOT observation._rg_is_v4(p_source_id, p_contract_version) THEN
    RAISE EXCEPTION 'source candidate rejected (contract): a candidate is promoted to an SRC@v4 contract (the acquisition policy, authenticity, content policy, economics, stewardship and evidence attributes declared)' USING ERRCODE = '22023';
  END IF;
  UPDATE observation.source_candidates SET state = 'promoted', promoted_source_id = p_source_id, promoted_contract_version = p_contract_version, decided_by = v_actor, decided_at = clock_timestamp(),
         decision_reason = 'promoted to a draft SRC@v4 contract' WHERE candidate_id = p_candidate RETURNING * INTO c;
  INSERT INTO observation.source_candidate_events (event_id, scope, tenant_id, domain_id, candidate_id, event, actor, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_candidate, 'candidate.promoted', v_actor, jsonb_build_object('source_id', p_source_id, 'contract_version', p_contract_version, 'source_key', s.source_key), p_correlation);
  RETURN to_jsonb(c);
END $$;
REVOKE ALL ON FUNCTION observation.promote_source_candidate(uuid, uuid, uuid, uuid, int, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.promote_source_candidate(uuid, uuid, uuid, uuid, int, uuid, uuid) TO eye_commit;

-- THE EVALUATION (a collection manager who is not the registrar; never an agent) ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION observation.record_source_evaluation(
  p_request_id uuid, p_tenant uuid, p_domain uuid, p_source_id uuid, p_contract_version int,
  p_authority text, p_rights_evidence text, p_coverage_fit text, p_cost text, p_risks jsonb, p_contract_tests jsonb, p_recommendation text, p_reason text,
  p_actor uuid, p_correlation uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; s observation.source_contracts_current%ROWTYPE; e observation.source_evaluations%ROWTYPE; v_problem text; v_impact jsonb; v_tests jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.source.evaluate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := observation._rg_actor('source evaluation', p_actor);
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'source evaluation rejected (request): an evaluation carries its request id' USING ERRCODE = '22023'; END IF;
  SELECT * INTO e FROM observation.source_evaluations x WHERE x.request_id = p_request_id;
  IF FOUND THEN
    IF e.evaluated_by IS DISTINCT FROM v_actor OR e.source_id IS DISTINCT FROM p_source_id OR e.contract_version IS DISTINCT FROM p_contract_version THEN
      RAISE EXCEPTION 'source evaluation rejected (duplicate): request % already recorded another act; a new evaluation takes a new request id', p_request_id USING ERRCODE = '23505';
    END IF;
    RETURN to_jsonb(e) || jsonb_build_object('replayed', true);
  END IF;
  SELECT * INTO s FROM observation.source_contracts_current x WHERE x.source_id = p_source_id AND x.contract_version = p_contract_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'source evaluation rejected (unknown_source): source % v% is not recorded in this domain', p_source_id, p_contract_version USING ERRCODE = '23503'; END IF;
  -- WHO (D5): a named collection manager — never the registrar of this version, never an agent
  PERFORM governance.assert_approver('source evaluation', v_actor, p_tenant, p_domain, ARRAY['collection_manager'], s.registrar_principal_id, NULL, 'evaluating a source contract');
  IF s.lifecycle_state <> 'draft' THEN
    RAISE EXCEPTION 'source evaluation rejected (state): source % v% is %; a contract is evaluated before its approval (a draft)', p_source_id, p_contract_version, s.lifecycle_state USING ERRCODE = '23514';
  END IF;
  IF p_authority IS NULL OR length(btrim(p_authority)) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'source evaluation rejected (authority): the publisher''s authority is assessed (8 to 2000 characters)' USING ERRCODE = '22023'; END IF;
  IF p_rights_evidence IS NULL OR length(btrim(p_rights_evidence)) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'source evaluation rejected (rights_evidence): the rights and purpose evidence is stated (8 to 2000 characters)' USING ERRCODE = '22023'; END IF;
  IF p_coverage_fit IS NULL OR length(btrim(p_coverage_fit)) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'source evaluation rejected (coverage_fit): the coverage fit against the declared universe is stated (8 to 2000 characters)' USING ERRCODE = '22023'; END IF;
  IF p_cost IS NULL OR length(btrim(p_cost)) NOT BETWEEN 2 AND 1000 THEN RAISE EXCEPTION 'source evaluation rejected (cost): the cost is stated (2 to 1000 characters)' USING ERRCODE = '22023'; END IF;
  v_problem := observation.rt_list_problem(coalesce(p_risks, '[]'::jsonb), 'risks', 0);
  IF v_problem IS NOT NULL THEN RAISE EXCEPTION 'source evaluation rejected (risks): %', v_problem USING ERRCODE = '22023'; END IF;
  IF p_contract_tests IS NULL OR jsonb_typeof(p_contract_tests) <> 'array' OR jsonb_array_length(p_contract_tests) > 50
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_contract_tests) t WHERE jsonb_typeof(t) <> 'object' OR length(btrim(coalesce(t ->> 'name', ''))) NOT BETWEEN 2 AND 200
                  OR coalesce(t ->> 'outcome', '') NOT IN ('pass', 'fail', 'not_run')) THEN
    RAISE EXCEPTION 'source evaluation rejected (contract_tests): the contract tests are a list (at most 50) of { name, outcome: pass | fail | not_run, note }' USING ERRCODE = '22023';
  END IF;
  v_tests := (SELECT coalesce(jsonb_agg(jsonb_build_object('name', btrim(t ->> 'name'), 'outcome', t ->> 'outcome', 'note', nullif(btrim(coalesce(t ->> 'note', '')), '')) ORDER BY o), '[]'::jsonb)
                FROM jsonb_array_elements(p_contract_tests) WITH ORDINALITY AS x(t, o));
  IF p_recommendation IS NULL OR p_recommendation NOT IN ('approve', 'reject', 'revise') THEN RAISE EXCEPTION 'source evaluation rejected (recommendation): the recommendation is approve, reject or revise' USING ERRCODE = '22023'; END IF;
  IF p_recommendation = 'approve' AND EXISTS (SELECT 1 FROM jsonb_array_elements(v_tests) t WHERE t ->> 'outcome' = 'fail') THEN
    RAISE EXCEPTION 'source evaluation rejected (contract_tests): an evaluation recommending approval records no failed contract test (fix the contract, or recommend revise)' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'source evaluation rejected (reason): the recommendation states its reason (8 to 2000 characters)' USING ERRCODE = '22023'; END IF;
  -- CAP-OB-02: a version superseding another records the change preview it was evaluated against
  IF (s.contract #>> '{lifecycle,supersedes_version}') IS NOT NULL THEN
    v_impact := observation._rg_change_preview(p_tenant, p_domain, p_source_id, jsonb_build_object('operation', 'new_version', 'contract_version', p_contract_version));
  END IF;
  INSERT INTO observation.source_evaluations (evaluation_id, scope, tenant_id, domain_id, source_id, contract_version, authority, rights_evidence, coverage_fit, cost, risks, contract_tests,
                                             recommendation, reason, change_impact, evaluated_by, request_id, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_source_id, p_contract_version, btrim(p_authority), btrim(p_rights_evidence), btrim(p_coverage_fit), btrim(p_cost),
          observation.rt_list(coalesce(p_risks, '[]'::jsonb)), v_tests, p_recommendation, btrim(p_reason), v_impact, v_actor, p_request_id, p_correlation)
  RETURNING * INTO e;
  INSERT INTO observation.source_contract_events (event_id, scope, tenant_id, domain_id, source_id, contract_version, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_source_id, p_contract_version, 'contract.evaluated', v_actor,
          jsonb_build_object('evaluation_id', e.evaluation_id, 'recommendation', e.recommendation, 'registrar', s.registrar_principal_id,
                             'tests', jsonb_build_object('pass', (SELECT count(*) FROM jsonb_array_elements(v_tests) t WHERE t ->> 'outcome' = 'pass'),
                                                         'fail', (SELECT count(*) FROM jsonb_array_elements(v_tests) t WHERE t ->> 'outcome' = 'fail'),
                                                         'not_run', (SELECT count(*) FROM jsonb_array_elements(v_tests) t WHERE t ->> 'outcome' = 'not_run')),
                             'change_impact', CASE WHEN v_impact IS NULL THEN NULL ELSE jsonb_build_object('resting', v_impact #> '{impact,resting}', 'statement', v_impact ->> 'statement') END),
          p_correlation);
  RETURN to_jsonb(e) || jsonb_build_object('replayed', false);
END $$;

-- observation.approve_source — 0022:811, its LAST definition, copied WHOLE (signature, security, search path, grants); the additions, marked
-- `-- B40 rg`: (1) an SRC@v4 contract is APPROVED only on the latest recorded evaluation of THIS version recommending approval (D5; a
-- rejection needs none; v1–v3 keep their path exactly — e2e phase1 #1–#3); (2) no version of a source whose rights stand withdrawn through
-- the rights lifecycle is approved (a new version never lifts a withdrawal — the restoration does, D4); (3) the approval event names the
-- evaluation it read.
CREATE OR REPLACE FUNCTION observation.approve_source(
  p_source_id uuid, p_contract_version int, p_tenant uuid, p_domain uuid,
  p_decision text, p_reason text, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = observation, ctx, identity, public, pg_catalog, pg_temp AS $$
DECLARE v_row observation.source_contracts_current%ROWTYPE;
        v_approver uuid := public.eye_principal();
        v_has_role boolean;
        v_eval observation.source_evaluations%ROWTYPE;   -- B40 rg
        v_eval_id uuid;                                  -- B40 rg
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.source.approve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'approval rejected: decision must be approve or reject' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM observation.source_contracts_current
   WHERE source_id = p_source_id AND contract_version = p_contract_version
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'approval rejected: no such source contract version' USING ERRCODE = '23503';
  END IF;
  IF v_row.lifecycle_state <> 'draft' THEN
    RAISE EXCEPTION 'approval rejected: contract is %, only a draft can be approved', v_row.lifecycle_state
      USING ERRCODE = '23514';
  END IF;
  IF v_approver IS NULL OR v_approver = v_row.registrar_principal_id THEN
    RAISE EXCEPTION 'approval rejected: the registrar of a source contract may never approve it (separation of duties)'
      USING ERRCODE = '42501';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM identity.role_bindings b
     WHERE b.principal_id = v_approver AND b.revoked_at IS NULL
       AND b.role_code = 'collection_manager'
       AND b.tenant_id = p_tenant AND (b.domain_id = p_domain OR b.scope = 'TENANT')
  ) INTO v_has_role;
  IF NOT v_has_role THEN
    RAISE EXCEPTION 'approval rejected: approval requires the collection_manager role in this domain'
      USING ERRCODE = '42501';
  END IF;
  -- B40 rg (D5): an SRC@v4 contract is approved only on the LATEST evaluation of this version, recommending approval
  IF p_decision = 'approve' AND observation._rg_is_v4(p_source_id, p_contract_version) THEN                                         -- B40 rg
    SELECT * INTO v_eval FROM observation.source_evaluations e                                                                         -- B40 rg
     WHERE e.source_id = p_source_id AND e.contract_version = p_contract_version AND e.tenant_id = p_tenant AND e.domain_id = p_domain  -- B40 rg
     ORDER BY e.evaluated_at DESC, e.evaluation_id DESC LIMIT 1;                                                                       -- B40 rg
    IF NOT FOUND THEN                                                                                                                  -- B40 rg
      RAISE EXCEPTION 'source approval rejected (unevaluated): source % v% is an SRC@v4 contract with no recorded evaluation; a collection manager who did not register it records the evaluation (authority, rights and purpose evidence, coverage fit, cost, risks, contract tests) first',
        p_source_id, p_contract_version USING ERRCODE = '23514';                                                                       -- B40 rg
    END IF;                                                                                                                            -- B40 rg
    IF v_eval.recommendation <> 'approve' THEN                                                                                         -- B40 rg
      RAISE EXCEPTION 'source approval rejected (evaluation): the latest evaluation of source % v% (at %) recommends %, not approval',
        p_source_id, p_contract_version, to_char(v_eval.evaluated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), v_eval.recommendation USING ERRCODE = '23514'; -- B40 rg
    END IF;                                                                                                                            -- B40 rg
    v_eval_id := v_eval.evaluation_id;                                                                                                 -- B40 rg
  END IF;                                                                                                                              -- B40 rg
  -- B40 rg (D4): a new version never lifts a withdrawal of the source's rights; the restoration does
  IF p_decision = 'approve' AND (observation._rg_outstanding_withdrawal(p_tenant, p_domain, p_source_id)).change_id IS NOT NULL THEN  -- B40 rg
    RAISE EXCEPTION 'source approval rejected (rights_withdrawn): the rights of source % stand withdrawn; no version of it is approved until they are restored through the rights lifecycle',
      p_source_id USING ERRCODE = '23514';                                                                                             -- B40 rg
  END IF;                                                                                                                              -- B40 rg

  IF p_decision = 'approve' THEN
    UPDATE observation.source_contracts_current
       SET lifecycle_state = 'approved', approver_principal_id = v_approver, updated_at = clock_timestamp()
     WHERE source_id = p_source_id AND contract_version = p_contract_version;
  ELSE
    UPDATE observation.source_contracts_current
       SET lifecycle_state = 'retired', approver_principal_id = v_approver, updated_at = clock_timestamp()
     WHERE source_id = p_source_id AND contract_version = p_contract_version;
  END IF;

  INSERT INTO observation.source_contract_events (
    event_id, scope, tenant_id, domain_id, source_id, contract_version,
    event, actor_principal_id, details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_source_id, p_contract_version,
    CASE WHEN p_decision = 'approve' THEN 'contract.approved' ELSE 'contract.rejected' END,
    v_approver,
    jsonb_build_object('registrar', v_row.registrar_principal_id, 'reason', p_reason)
      || CASE WHEN v_eval_id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('evaluation_id', v_eval_id) END,   -- B40 rg
    p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.approve_source(uuid,int,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.approve_source(uuid,int,uuid,uuid,text,text,uuid,uuid) TO eye_commit;

/* THE RESTORATION (DESIGN D4) — shared by observation.change_rights (p_resume true) and the v1–v3 route (observation.set_rights_state,
   p_resume false: that route never reactivated a contract, and still does not): the OUTSTANDING withdrawal reversed — each version it
   withdrew returns to the rights it had (a version whose rights moved otherwise since is left as it is, said so), each with its
   contract.rights_changed event; with p_resume, the version it suspended RESUMES when nothing moved on it since (still suspended, no other
   version active, its rights confirmed or its mode replay, its approver recorded — otherwise the reactivation is the collection manager's
   transition, said so); the withdrawal's rights incident resolved; the retention action it opened is NOT withdrawn here (the retention
   authority decides it). The caller has checked the authority, the scope, the person, the request and that a withdrawal stands. */
CREATE OR REPLACE FUNCTION observation._rg_restore(p_change uuid, p_request_id uuid, p_tenant uuid, p_domain uuid, p_source uuid, p_named_version int,
                                                   p_reason text, p_evidence text, p_actor uuid, p_via text, p_resume boolean, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
DECLARE w observation.source_rights_changes%ROWTYPE; ch observation.source_rights_changes%ROWTYPE; a jsonb; r observation.source_contracts_current%ROWTYPE;
        v_affected jsonb := '[]'::jsonb; v_reactivated int; v_note text; v_impact jsonb;
BEGIN
  w := observation._rg_outstanding_withdrawal(p_tenant, p_domain, p_source);
  FOR a IN SELECT x FROM jsonb_array_elements(w.affected) x WHERE (x ->> 'changed')::boolean LOOP
    SELECT * INTO r FROM observation.source_contracts_current x WHERE x.source_id = p_source AND x.contract_version = (a ->> 'contract_version')::int FOR UPDATE;
    IF NOT FOUND OR r.rights_state <> 'withdrawn' THEN
      v_affected := v_affected || jsonb_build_object('contract_version', (a ->> 'contract_version')::int, 'restored_to', NULL, 'changed', false, 'note', 'its rights were changed otherwise since the withdrawal');
      CONTINUE;
    END IF;
    UPDATE observation.source_contracts_current SET rights_state = a ->> 'prior_rights', updated_at = clock_timestamp() WHERE source_id = r.source_id AND contract_version = r.contract_version;
    INSERT INTO observation.source_contract_events (event_id, scope, tenant_id, domain_id, source_id, contract_version, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, r.source_id, r.contract_version, 'contract.rights_changed', p_actor,
            jsonb_build_object('operation', 'restore', 'change_id', p_change, 'reverses', w.change_id, 'from', 'withdrawn', 'to', a ->> 'prior_rights', 'reason', btrim(p_reason), 'evidence', p_evidence,
                               'via', p_via, 'kind', 'rights_update', 'rights_state', a ->> 'prior_rights'), p_correlation);
    v_affected := v_affected || jsonb_build_object('contract_version', r.contract_version, 'restored_to', a ->> 'prior_rights', 'changed', true);
  END LOOP;
  IF w.suspended_version IS NOT NULL AND p_resume THEN
    SELECT * INTO r FROM observation.source_contracts_current x WHERE x.source_id = p_source AND x.contract_version = w.suspended_version FOR UPDATE;
    IF FOUND AND r.lifecycle_state = 'suspended' AND r.approver_principal_id IS NOT NULL AND (r.rights_state = 'confirmed' OR r.acquisition_mode = 'replay')
       AND NOT EXISTS (SELECT 1 FROM observation.source_contracts_current o WHERE o.source_id = p_source AND o.lifecycle_state = 'active')
       AND NOT EXISTS (SELECT 1 FROM observation.source_contract_events e WHERE e.source_id = p_source AND e.contract_version = w.suspended_version AND e.occurred_at > w.recorded_at
                         AND e.event NOT IN ('contract.rights_changed', 'contract.evaluated', 'contract.stewardship_changed', 'contract.customer_approved')) THEN
      UPDATE observation.source_contracts_current SET lifecycle_state = 'active', updated_at = clock_timestamp() WHERE source_id = p_source AND contract_version = w.suspended_version;
      INSERT INTO observation.source_contract_events (event_id, scope, tenant_id, domain_id, source_id, contract_version, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_source, w.suspended_version, 'contract.reactivated', p_actor,
              jsonb_build_object('from', 'suspended', 'to', 'active', 'reason', 'rights restored: ' || btrim(p_reason), 'kind', 'rights_restoration', 'change_id', p_change), p_correlation);
      v_reactivated := w.suspended_version;
    ELSE
      v_note := format('contract version %s was not resumed (it is %s, or something moved on it since the withdrawal): its reactivation is the collection manager''s transition', w.suspended_version, coalesce(r.lifecycle_state, 'not recorded'));
    END IF;
  ELSIF w.suspended_version IS NOT NULL THEN
    v_note := format('contract version %s stays suspended: the source rights route never reactivates a contract (the collection manager''s transition does)', w.suspended_version);
  END IF;
  IF w.incident_id IS NOT NULL THEN
    UPDATE observation.source_incidents SET state = 'resolved', resolved_by = p_actor, resolved_at = clock_timestamp(), resolution = left('Rights restored: ' || btrim(p_reason), 2000)
     WHERE incident_id = w.incident_id AND state = 'open';
    IF FOUND THEN
      INSERT INTO observation.source_incident_events (event_id, scope, tenant_id, domain_id, incident_id, event, actor, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, w.incident_id, 'incident.resolved', p_actor, jsonb_build_object('rights_change_id', p_change, 'reverses', w.change_id), p_correlation);
    END IF;
  END IF;
  v_impact := observation._rg_impact(p_tenant, p_domain, p_source);
  INSERT INTO observation.source_rights_changes (change_id, scope, tenant_id, domain_id, source_id, contract_version, operation, via, reason, evidence, affected, reactivated_version, reverses, impact,
                                                 actor, request_id, correlation_id)
  VALUES (p_change, 'DOMAIN', p_tenant, p_domain, p_source, p_named_version, 'restore', p_via, btrim(p_reason), nullif(btrim(coalesce(p_evidence, '')), ''), v_affected, v_reactivated, w.change_id, v_impact,
          p_actor, p_request_id, p_correlation)
  RETURNING * INTO ch;
  RETURN to_jsonb(ch) || jsonb_build_object('replayed', false, 'reactivated', v_reactivated IS NOT NULL, 'note', v_note,
    'retention_action_id', w.retention_action_id,
    'retention_statement', CASE WHEN w.retention_action_id IS NULL THEN NULL ELSE 'the retention action the withdrawal opened is not withdrawn here: the retention authority decides it' END,
    'statement', 'the contract rights are restored; a rights-terms record withdrawn separately is restored only by a new terms version (and a terms restoration never lifts a contract withdrawal)');
END $$;
REVOKE ALL ON FUNCTION observation._rg_restore(uuid, uuid, uuid, uuid, uuid, int, text, text, uuid, text, boolean, uuid) FROM PUBLIC;

-- THE RIGHTS LIFECYCLE — observation.change_rights (DESIGN D4; L1-C01, FEX-02, R-09) ──────────────────────────────────────────────────────
/* A named COLLECTION MANAGER (never an agent) narrows the purposes of the source's latest contract version, WITHDRAWS the source's rights
   (observation._rg_withdraw), or RESTORES them — a restoration reverses the outstanding withdrawal: each version it withdrew returns to the
   rights it had (a version restored otherwise since is left as it is), the version it suspended is RESUMED when nothing moved on it since
   (still suspended, no other version active, its rights confirmed or its mode replay, its approver recorded — otherwise the reactivation is
   the collection manager's transition, stated), the rights incident resolved; the restoration carries its EVIDENCE. A withdrawal and a
   restoration state their reason and evidence; the actor names the version they read (the latest — stale otherwise). A request id replays
   its recorded change. Also served for the v1–v3 rights route (action observation.source.rights), re-pointed here. */
CREATE OR REPLACE FUNCTION observation.change_rights(
  p_request_id uuid, p_tenant uuid, p_domain uuid, p_source_id uuid, p_contract_version int, p_operation text, p_purposes jsonb,
  p_reason text, p_evidence text, p_deletion_obligation text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; ch observation.source_rights_changes%ROWTYPE; w observation.source_rights_changes%ROWTYPE; s observation.source_contracts_current%ROWTYPE;
        v_latest int; v_change uuid := gen_random_uuid(); v_problem text; v_after jsonb; v_affected jsonb := '[]'::jsonb; a jsonb; r observation.source_contracts_current%ROWTYPE;
        v_reactivated int; v_note text; v_impact jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.source.change_rights', 'observation.source.rights']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := observation._rg_actor('rights change', p_actor);
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'rights change rejected (request): a rights change carries its request id' USING ERRCODE = '22023'; END IF;
  SELECT * INTO ch FROM observation.source_rights_changes x WHERE x.request_id = p_request_id;
  IF FOUND THEN
    IF ch.actor IS DISTINCT FROM v_actor OR ch.source_id IS DISTINCT FROM p_source_id OR ch.operation IS DISTINCT FROM p_operation OR ch.tenant_id IS DISTINCT FROM p_tenant OR ch.domain_id IS DISTINCT FROM p_domain THEN
      RAISE EXCEPTION 'rights change rejected (duplicate): request % already recorded another act; a new change takes a new request id', p_request_id USING ERRCODE = '23505';
    END IF;
    RETURN to_jsonb(ch) || jsonb_build_object('replayed', true);
  END IF;
  PERFORM governance.assert_approver('rights change', v_actor, p_tenant, p_domain, ARRAY['collection_manager'], NULL, NULL, 'changing a source''s rights');
  IF p_operation IS NULL OR p_operation NOT IN ('narrow', 'withdraw', 'restore') THEN
    RAISE EXCEPTION 'rights change rejected (operation): the operation is narrow, withdraw or restore' USING ERRCODE = '22023';
  END IF;
  SELECT max(x.contract_version) INTO v_latest FROM observation.source_contracts_current x WHERE x.source_id = p_source_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF v_latest IS NULL THEN RAISE EXCEPTION 'rights change rejected (unknown_source): source % is not recorded in this domain', p_source_id USING ERRCODE = '23503'; END IF;
  IF p_contract_version IS DISTINCT FROM v_latest THEN
    RAISE EXCEPTION 'rights change rejected (stale): source % is at contract version %; this change read %', p_source_id, v_latest, coalesce(p_contract_version::text, 'no version') USING ERRCODE = '23514';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 8 AND 2000 THEN
    RAISE EXCEPTION 'rights change rejected (reason): a rights change states its reason (8 to 2000 characters)' USING ERRCODE = '22023';
  END IF;
  -- one rights act at a time per source
  PERFORM pg_advisory_xact_lock(hashtextextended('observation.source_rights:' || p_tenant || ':' || p_domain || ':' || p_source_id, 0));

  IF p_operation = 'withdraw' THEN
    IF p_evidence IS NULL OR length(btrim(p_evidence)) NOT BETWEEN 8 AND 4000 THEN
      RAISE EXCEPTION 'rights change rejected (evidence): a withdrawal cites its evidence — the publisher''s notice, the ended agreement (8 to 4000 characters)' USING ERRCODE = '22023';
    END IF;
    RETURN observation._rg_withdraw(v_change, p_request_id, p_tenant, p_domain, p_source_id, p_contract_version, p_reason, p_evidence, p_deletion_obligation, v_actor, 'rights_lifecycle', p_correlation);
  END IF;

  IF p_operation = 'narrow' THEN
    SELECT * INTO s FROM observation.source_contracts_current x WHERE x.source_id = p_source_id AND x.contract_version = v_latest FOR UPDATE;
    IF s.rights_state = 'withdrawn' THEN
      RAISE EXCEPTION 'rights change rejected (state): the rights of source % are withdrawn; nothing is narrowed until they are restored', p_source_id USING ERRCODE = '23514';
    END IF;
    v_problem := observation.rt_list_problem(p_purposes, 'purposes', 1);
    IF v_problem IS NOT NULL THEN RAISE EXCEPTION 'rights change rejected (purposes): %', v_problem USING ERRCODE = '22023'; END IF;
    v_after := observation.rt_list(p_purposes);
    IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_after) p WHERE NOT (s.purposes ? p)) OR jsonb_array_length(v_after) >= jsonb_array_length(s.purposes) THEN
      RAISE EXCEPTION 'rights change rejected (purposes): narrowing keeps a strict subset of the purposes in force (%); a wider purpose is a new contract version', s.purposes USING ERRCODE = '22023';
    END IF;
    UPDATE observation.source_contracts_current SET purposes = v_after, updated_at = clock_timestamp() WHERE source_id = p_source_id AND contract_version = v_latest;
    INSERT INTO observation.source_contract_events (event_id, scope, tenant_id, domain_id, source_id, contract_version, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_source_id, v_latest, 'contract.rights_changed', v_actor,
            jsonb_build_object('operation', 'narrow', 'change_id', v_change, 'purposes_before', s.purposes, 'purposes_after', v_after,
                               'dropped', (SELECT coalesce(jsonb_agg(p), '[]'::jsonb) FROM jsonb_array_elements_text(s.purposes) p WHERE NOT (v_after ? p)), 'reason', btrim(p_reason), 'evidence', p_evidence), p_correlation);
    v_impact := observation._rg_impact(p_tenant, p_domain, p_source_id);
    INSERT INTO observation.source_rights_changes (change_id, scope, tenant_id, domain_id, source_id, contract_version, operation, via, reason, evidence, purposes_before, purposes_after, affected, impact,
                                                   actor, request_id, correlation_id)
    VALUES (v_change, 'DOMAIN', p_tenant, p_domain, p_source_id, v_latest, 'narrow', 'rights_lifecycle', btrim(p_reason), nullif(btrim(coalesce(p_evidence, '')), ''), s.purposes, v_after,
            jsonb_build_array(jsonb_build_object('contract_version', v_latest, 'purposes_before', s.purposes, 'purposes_after', v_after, 'changed', true)), v_impact, v_actor, p_request_id, p_correlation)
    RETURNING * INTO ch;
    RETURN to_jsonb(ch) || jsonb_build_object('replayed', false, 'statement', 'collection under a dropped purpose is refused at the revalidation from now on; the evidence already held keeps its record');
  END IF;

  -- RESTORE: the outstanding withdrawal reversed, with evidence (observation._rg_restore; the suspended version resumed when nothing moved)
  IF (observation._rg_outstanding_withdrawal(p_tenant, p_domain, p_source_id)).change_id IS NULL THEN
    RAISE EXCEPTION 'rights change rejected (state): the rights of source % stand no withdrawal of the rights lifecycle; there is nothing to restore', p_source_id USING ERRCODE = '23514';
  END IF;
  IF p_evidence IS NULL OR length(btrim(p_evidence)) NOT BETWEEN 8 AND 4000 THEN
    RAISE EXCEPTION 'rights change rejected (evidence): a restoration cites its evidence — the renewed licence, the publisher''s confirmation (8 to 4000 characters)' USING ERRCODE = '22023';
  END IF;
  RETURN observation._rg_restore(v_change, p_request_id, p_tenant, p_domain, p_source_id, v_latest, p_reason, p_evidence, v_actor, 'rights_lifecycle', true, p_correlation);
END $$;
REVOKE ALL ON FUNCTION observation.change_rights(uuid, uuid, uuid, uuid, int, text, jsonb, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.change_rights(uuid, uuid, uuid, uuid, int, text, jsonb, text, text, text, uuid, uuid) TO eye_commit;

-- observation.set_rights_state — 0022:956, its LAST definition, copied WHOLE (signature, security, search path, grants); the v1–v3 rights
-- route RE-POINTED to the rights lifecycle (marked `-- B40 rg`), by a collection manager: a WITHDRAWAL through it is the lifecycle's
-- withdrawal when none stands (every version, the suspension, the schedule removed, the impact, the owners, the incident —
-- observation._rg_withdraw, via 'rights_route'); a CONFIRMATION (or pending) of a version the lifecycle withdrew is the lifecycle's
-- restoration (observation._rg_restore, via 'rights_route' — without the reactivation, which this route never made). Then the route's own
-- recorded effect, exactly as before: the named version's update and its event (the mislabelled 'contract.registered' of a confirmation kept).
CREATE OR REPLACE FUNCTION observation.set_rights_state(
  p_source_id uuid, p_contract_version int, p_tenant uuid, p_domain uuid,
  p_rights_state text, p_evidence text, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid := public.eye_principal(); v_latest int;   -- B40 rg
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.source.rights']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_rights_state NOT IN ('confirmed', 'pending', 'withdrawn') THEN
    RAISE EXCEPTION 'rights update rejected: unknown rights state %', p_rights_state USING ERRCODE = '22023';
  END IF;
  -- B40 rg: the route RE-POINTED to the rights lifecycle (D4) — a withdrawal through it IS the lifecycle's (when none stands), a           -- B40 rg
  -- confirmation or pending of a version the lifecycle withdrew IS the lifecycle's restoration (never a reactivation); then the route's      -- B40 rg
  -- own recorded effect below, exactly as before (its update and its event)                                                                  -- B40 rg
  IF NOT EXISTS (SELECT 1 FROM observation.source_contracts_current x WHERE x.source_id = p_source_id AND x.contract_version = p_contract_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain) THEN  -- B40 rg
    RAISE EXCEPTION 'rights update rejected: no such source contract version' USING ERRCODE = '23503';                               -- B40 rg
  END IF;                                                                                                                              -- B40 rg
  IF p_rights_state = 'withdrawn' OR ((SELECT x.rights_state FROM observation.source_contracts_current x WHERE x.source_id = p_source_id AND x.contract_version = p_contract_version) = 'withdrawn'
                                      AND (observation._rg_outstanding_withdrawal(p_tenant, p_domain, p_source_id)).change_id IS NOT NULL) THEN   -- B40 rg
    PERFORM governance.assert_approver('rights change', v_actor, p_tenant, p_domain, ARRAY['collection_manager'], NULL, NULL, 'changing a source''s rights');  -- B40 rg
    PERFORM pg_advisory_xact_lock(hashtextextended('observation.source_rights:' || p_tenant || ':' || p_domain || ':' || p_source_id, 0));  -- B40 rg
    SELECT max(x.contract_version) INTO v_latest FROM observation.source_contracts_current x WHERE x.source_id = p_source_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;  -- B40 rg
    IF p_rights_state = 'withdrawn' THEN                                                                                               -- B40 rg
      IF (observation._rg_outstanding_withdrawal(p_tenant, p_domain, p_source_id)).change_id IS NULL THEN                             -- B40 rg
        PERFORM observation._rg_withdraw(gen_random_uuid(), gen_random_uuid(), p_tenant, p_domain, p_source_id, v_latest,             -- B40 rg
          'rights withdrawn through the source rights route', nullif(btrim(coalesce(p_evidence, '')), ''), NULL, v_actor, 'rights_route', p_correlation);  -- B40 rg
      END IF;                                                                                                                          -- B40 rg
    ELSE                                                                                                                               -- B40 rg
      PERFORM observation._rg_restore(gen_random_uuid(), gen_random_uuid(), p_tenant, p_domain, p_source_id, v_latest,               -- B40 rg
        'rights ' || p_rights_state || ' through the source rights route', nullif(btrim(coalesce(p_evidence, '')), ''), v_actor, 'rights_route', false, p_correlation);  -- B40 rg
    END IF;                                                                                                                            -- B40 rg
  END IF;                                                                                                                              -- B40 rg
  UPDATE observation.source_contracts_current
     SET rights_state = p_rights_state,
         -- §7 fail-closed: withdrawn rights immediately deactivate an active contract.
         lifecycle_state = CASE WHEN p_rights_state = 'withdrawn' AND lifecycle_state = 'active'
                                THEN 'suspended' ELSE lifecycle_state END,
         updated_at = clock_timestamp()
   WHERE source_id = p_source_id AND contract_version = p_contract_version;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rights update rejected: no such source contract version' USING ERRCODE = '23503';
  END IF;
  INSERT INTO observation.source_contract_events (
    event_id, scope, tenant_id, domain_id, source_id, contract_version,
    event, actor_principal_id, details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_source_id, p_contract_version,
    CASE WHEN p_rights_state = 'withdrawn' THEN 'contract.suspended' ELSE 'contract.registered' END,
    public.eye_principal(),
    jsonb_build_object('rights_state', p_rights_state, 'evidence', p_evidence, 'kind', 'rights_update'),
    p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.set_rights_state(uuid,int,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.set_rights_state(uuid,int,uuid,uuid,text,text,uuid,uuid) TO eye_commit;

-- CUSTOMER APPROVAL (D13) ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION observation.record_customer_approval(
  p_request_id uuid, p_tenant uuid, p_domain uuid, p_source_id uuid, p_contract_version int, p_decision text, p_scope_statement text, p_reason text, p_claim text,
  p_actor uuid, p_correlation uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; s observation.source_contracts_current%ROWTYPE; a observation.source_customer_approvals%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.source.customer_approve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := observation._rg_actor('customer approval', p_actor);
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'customer approval rejected (request): a customer approval carries its request id' USING ERRCODE = '22023'; END IF;
  SELECT * INTO a FROM observation.source_customer_approvals x WHERE x.request_id = p_request_id;
  IF FOUND THEN
    IF a.approved_by IS DISTINCT FROM v_actor OR a.source_id IS DISTINCT FROM p_source_id OR a.contract_version IS DISTINCT FROM p_contract_version THEN
      RAISE EXCEPTION 'customer approval rejected (duplicate): request % already recorded another act', p_request_id USING ERRCODE = '23505';
    END IF;
    RETURN to_jsonb(a) || jsonb_build_object('replayed', true);
  END IF;
  -- WHO (D13): the tenant's customer sponsor or tenant administrator — a named human; never the registrar or the approver of this version
  PERFORM governance.assert_approver('customer approval', v_actor, p_tenant, p_domain, ARRAY['customer_sponsor', 'tenant_admin'], NULL, NULL, 'approving a source''s use for the tenant');
  IF NOT EXISTS (SELECT 1 FROM identity.role_bindings b JOIN identity.principals p ON p.id = b.principal_id
                  WHERE b.principal_id = v_actor AND b.revoked_at IS NULL AND b.role_code IN ('customer_sponsor', 'tenant_admin') AND b.scope = 'TENANT' AND b.tenant_id = p_tenant AND p.status = 'active') THEN
    RAISE EXCEPTION 'customer approval rejected (authority): the customer''s approval is the act of the tenant''s customer sponsor or tenant administrator (a TENANT binding)' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO s FROM observation.source_contracts_current x WHERE x.source_id = p_source_id AND x.contract_version = p_contract_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'customer approval rejected (unknown_source): source % v% is not recorded in this domain', p_source_id, p_contract_version USING ERRCODE = '23503'; END IF;
  IF v_actor = s.registrar_principal_id OR v_actor IS NOT DISTINCT FROM s.approver_principal_id THEN
    RAISE EXCEPTION 'customer approval rejected (separation_of_duties): the customer''s approval is never recorded by the registrar or the approver of the contract' USING ERRCODE = '42501';
  END IF;
  IF s.lifecycle_state NOT IN ('approved', 'active', 'suspended') THEN
    RAISE EXCEPTION 'customer approval rejected (state): source % v% is %; the customer approves the use of an approved contract', p_source_id, p_contract_version, s.lifecycle_state USING ERRCODE = '23514';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('approve', 'decline') THEN RAISE EXCEPTION 'customer approval rejected (decision): the decision is approve or decline' USING ERRCODE = '22023'; END IF;
  IF p_scope_statement IS NULL OR length(btrim(p_scope_statement)) NOT BETWEEN 8 AND 1000 THEN RAISE EXCEPTION 'customer approval rejected (scope_statement): the use approved for the tenant is stated (8 to 1000 characters)' USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'customer approval rejected (reason): the decision states its reason (8 to 2000 characters)' USING ERRCODE = '22023'; END IF;
  IF p_claim IS NULL OR p_claim NOT IN ('construction', 'demonstration') THEN
    RAISE EXCEPTION 'customer approval rejected (claim): the record claims construction or demonstration — real acceptance is recorded on B111''s shared path, never here' USING ERRCODE = '22023';
  END IF;
  INSERT INTO observation.source_customer_approvals (approval_id, scope, tenant_id, domain_id, source_id, contract_version, decision, scope_statement, reason, claim, approved_by, request_id, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_source_id, p_contract_version, p_decision, btrim(p_scope_statement), btrim(p_reason), p_claim, v_actor, p_request_id, p_correlation)
  RETURNING * INTO a;
  INSERT INTO observation.source_contract_events (event_id, scope, tenant_id, domain_id, source_id, contract_version, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_source_id, p_contract_version, 'contract.customer_approved', v_actor,
          jsonb_build_object('approval_id', a.approval_id, 'decision', a.decision, 'scope_statement', a.scope_statement, 'claim', a.claim), p_correlation);
  RETURN to_jsonb(a) || jsonb_build_object('replayed', false);
END $$;
REVOKE ALL ON FUNCTION observation.record_customer_approval(uuid, uuid, uuid, uuid, int, text, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.record_customer_approval(uuid, uuid, uuid, uuid, int, text, text, text, text, uuid, uuid) TO eye_commit;

-- STEWARDSHIP (L1-C01) ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION observation.change_stewardship(
  p_request_id uuid, p_tenant uuid, p_domain uuid, p_source_id uuid, p_expected_version int, p_steward uuid, p_state text, p_review_due date, p_reason text,
  p_actor uuid, p_correlation uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, governance, onboarding, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; st observation.source_stewardship%ROWTYPE; v_prev int; v_latest int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.source.stewardship']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := observation._rg_actor('stewardship', p_actor);
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'stewardship rejected (request): a stewardship change carries its request id' USING ERRCODE = '22023'; END IF;
  SELECT * INTO st FROM observation.source_stewardship x WHERE x.request_id = p_request_id;
  IF FOUND THEN
    IF st.changed_by IS DISTINCT FROM v_actor OR st.source_id IS DISTINCT FROM p_source_id THEN
      RAISE EXCEPTION 'stewardship rejected (duplicate): request % already recorded another act', p_request_id USING ERRCODE = '23505';
    END IF;
    RETURN to_jsonb(st) || jsonb_build_object('replayed', true);
  END IF;
  PERFORM governance.assert_approver('stewardship', v_actor, p_tenant, p_domain, ARRAY['data_steward', 'collection_manager'], NULL, NULL, 'changing a source''s stewardship');
  SELECT max(x.contract_version) INTO v_latest FROM observation.source_contracts_current x WHERE x.source_id = p_source_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF v_latest IS NULL THEN RAISE EXCEPTION 'stewardship rejected (unknown_source): source % is not recorded in this domain', p_source_id USING ERRCODE = '23503'; END IF;
  IF p_steward IS NULL OR onboarding.principal_kind(p_steward) IS DISTINCT FROM 'human' OR NOT governance.holds_role(p_steward, p_tenant, p_domain, ARRAY['data_steward', 'collection_manager']) THEN
    RAISE EXCEPTION 'stewardship rejected (steward): the steward is a named, active data steward or collection manager of this domain' USING ERRCODE = '22023';
  END IF;
  IF p_state IS NULL OR p_state NOT IN ('assigned', 'under_review', 'lapsed') THEN RAISE EXCEPTION 'stewardship rejected (state_value): the stewardship state is assigned, under_review or lapsed' USING ERRCODE = '22023'; END IF;
  IF p_review_due IS NULL OR p_review_due < date '2000-01-01' THEN RAISE EXCEPTION 'stewardship rejected (review_due): the next review is a date' USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'stewardship rejected (reason): the change states its reason (8 to 2000 characters)' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('observation.source_stewardship:' || p_source_id, 0));
  SELECT max(x.version) INTO v_prev FROM observation.source_stewardship x WHERE x.source_id = p_source_id;
  IF coalesce(p_expected_version, -1) IS DISTINCT FROM coalesce(v_prev, 0) THEN
    RAISE EXCEPTION 'stewardship rejected (stale): the stewardship of source % is at version %; this change read %', p_source_id, coalesce(v_prev, 0), coalesce(p_expected_version::text, 'no version') USING ERRCODE = '23514';
  END IF;
  INSERT INTO observation.source_stewardship (source_id, version, scope, tenant_id, domain_id, steward_principal_id, state, review_due, reason, changed_by, request_id, correlation_id)
  VALUES (p_source_id, coalesce(v_prev, 0) + 1, 'DOMAIN', p_tenant, p_domain, p_steward, p_state, p_review_due, btrim(p_reason), v_actor, p_request_id, p_correlation)
  RETURNING * INTO st;
  INSERT INTO observation.source_contract_events (event_id, scope, tenant_id, domain_id, source_id, contract_version, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_source_id, v_latest, 'contract.stewardship_changed', v_actor,
          jsonb_build_object('stewardship_version', st.version, 'steward', p_steward, 'state', p_state, 'review_due', p_review_due, 'reason', btrim(p_reason)), p_correlation);
  RETURN to_jsonb(st) || jsonb_build_object('replayed', false);
END $$;
REVOKE ALL ON FUNCTION observation.change_stewardship(uuid, uuid, uuid, uuid, int, uuid, text, date, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.change_stewardship(uuid, uuid, uuid, uuid, int, uuid, text, date, text, uuid, uuid) TO eye_commit;

-- SOURCE INCIDENTS (PER-11) ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION observation.open_source_incident(
  p_request_id uuid, p_tenant uuid, p_domain uuid, p_source_id uuid, p_kind text, p_statement text, p_owner uuid, p_actor uuid, p_correlation uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, governance, onboarding, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; i observation.source_incidents%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.source.incident']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := observation._rg_actor('source incident', p_actor);
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'source incident rejected (request): an incident carries its request id' USING ERRCODE = '22023'; END IF;
  SELECT * INTO i FROM observation.source_incidents x WHERE x.request_id = p_request_id;
  IF FOUND THEN
    IF i.opened_by IS DISTINCT FROM v_actor OR i.source_id IS DISTINCT FROM p_source_id THEN
      RAISE EXCEPTION 'source incident rejected (duplicate): request % already recorded another act', p_request_id USING ERRCODE = '23505';
    END IF;
    RETURN to_jsonb(i) || jsonb_build_object('replayed', true);
  END IF;
  PERFORM governance.assert_approver('source incident', v_actor, p_tenant, p_domain, ARRAY['collection_manager', 'domain_analyst'], NULL, NULL, 'opening a source incident');
  IF NOT EXISTS (SELECT 1 FROM observation.source_contracts_current x WHERE x.source_id = p_source_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain) THEN
    RAISE EXCEPTION 'source incident rejected (unknown_source): source % is not recorded in this domain', p_source_id USING ERRCODE = '23503';
  END IF;
  -- PER-11: the collection manager owns the operational response
  IF p_owner IS NULL OR onboarding.principal_kind(p_owner) IS DISTINCT FROM 'human' OR NOT governance.holds_role(p_owner, p_tenant, p_domain, ARRAY['collection_manager']) THEN
    RAISE EXCEPTION 'source incident rejected (owner): a source incident is owned by a named collection manager of this domain' USING ERRCODE = '22023';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('outage', 'rights', 'quality', 'access', 'manipulation', 'other') THEN RAISE EXCEPTION 'source incident rejected (kind): the kind is outage, rights, quality, access, manipulation or other' USING ERRCODE = '22023'; END IF;
  IF p_statement IS NULL OR length(btrim(p_statement)) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'source incident rejected (statement): the incident is stated (8 to 2000 characters)' USING ERRCODE = '22023'; END IF;
  INSERT INTO observation.source_incidents (incident_id, scope, tenant_id, domain_id, source_id, kind, statement, owner_principal_id, opened_by, request_id, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_source_id, p_kind, btrim(p_statement), p_owner, v_actor, p_request_id, p_correlation)
  RETURNING * INTO i;
  INSERT INTO observation.source_incident_events (event_id, scope, tenant_id, domain_id, incident_id, event, actor, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, i.incident_id, 'incident.opened', v_actor, jsonb_build_object('kind', p_kind, 'owner', p_owner), p_correlation);
  RETURN to_jsonb(i) || jsonb_build_object('replayed', false);
END $$;
REVOKE ALL ON FUNCTION observation.open_source_incident(uuid, uuid, uuid, uuid, text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.open_source_incident(uuid, uuid, uuid, uuid, text, text, uuid, uuid, uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION observation.resolve_source_incident(p_tenant uuid, p_domain uuid, p_incident uuid, p_resolution text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; i observation.source_incidents%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.source.incident']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := observation._rg_actor('source incident', p_actor);
  SELECT * INTO i FROM observation.source_incidents x WHERE x.incident_id = p_incident AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'source incident rejected (unknown_incident): incident % is not recorded in this domain', p_incident USING ERRCODE = '23503'; END IF;
  -- the owner, or another collection manager of the domain (never an agent)
  PERFORM governance.assert_approver('source incident', v_actor, p_tenant, p_domain, ARRAY['collection_manager'], NULL, NULL, 'resolving a source incident');
  IF i.state <> 'open' THEN RAISE EXCEPTION 'source incident rejected (state): incident % is %', p_incident, i.state USING ERRCODE = '23514'; END IF;
  IF p_resolution IS NULL OR length(btrim(p_resolution)) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'source incident rejected (resolution): the resolution is stated (8 to 2000 characters)' USING ERRCODE = '22023'; END IF;
  UPDATE observation.source_incidents SET state = 'resolved', resolved_by = v_actor, resolved_at = clock_timestamp(), resolution = btrim(p_resolution) WHERE incident_id = p_incident RETURNING * INTO i;
  INSERT INTO observation.source_incident_events (event_id, scope, tenant_id, domain_id, incident_id, event, actor, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_incident, 'incident.resolved', v_actor, jsonb_build_object('resolution', btrim(p_resolution), 'owner', i.owner_principal_id), p_correlation);
  RETURN to_jsonb(i);
END $$;
REVOKE ALL ON FUNCTION observation.resolve_source_incident(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.resolve_source_incident(uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

-- §RG.4 THE READS ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/* THE CHANGE PREVIEW (CAP-OB-02) — internal: what a rights change or a new contract version would do, before it is made.
   p_change: { operation: withdraw | restore | narrow | new_version, purposes?: [...] (narrow), contract_version?: int (new_version: the
   registered draft compared with the version it supersedes) }. */
CREATE OR REPLACE FUNCTION observation._rg_change_preview(p_tenant uuid, p_domain uuid, p_source uuid, p_change jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
DECLARE v_op text := p_change ->> 'operation'; s observation.source_contracts_current%ROWTYPE; n observation.source_contracts_current%ROWTYPE; p observation.source_contracts_current%ROWTYPE;
        w observation.source_rights_changes%ROWTYPE; v_impact jsonb; v_versions jsonb; v_out jsonb; v_sched text; v_after jsonb; v_diff jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO s FROM observation.source_contracts_current x WHERE x.source_id = p_source AND x.tenant_id = p_tenant AND x.domain_id = p_domain ORDER BY x.contract_version DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'source registry rejected (unknown_source): source % is not recorded in this domain', p_source USING ERRCODE = '23503'; END IF;
  IF v_op IS NULL OR v_op NOT IN ('withdraw', 'restore', 'narrow', 'new_version') THEN
    RAISE EXCEPTION 'source registry rejected (operation): the change previewed is withdraw, restore, narrow or new_version' USING ERRCODE = '22023';
  END IF;
  v_impact := observation._rg_impact(p_tenant, p_domain, p_source);
  w := observation._rg_outstanding_withdrawal(p_tenant, p_domain, p_source);
  SELECT status INTO v_sched FROM observation.scheduler_entries x WHERE x.source_id = p_source;
  SELECT coalesce(jsonb_agg(jsonb_build_object('contract_version', x.contract_version, 'lifecycle', x.lifecycle_state, 'rights_state', x.rights_state, 'purposes', x.purposes,
           'after', CASE v_op
             WHEN 'withdraw' THEN jsonb_build_object('rights_state', 'withdrawn', 'lifecycle', CASE WHEN x.lifecycle_state = 'active' THEN 'suspended' ELSE x.lifecycle_state END)
             WHEN 'restore' THEN coalesce((SELECT jsonb_build_object('rights_state', a ->> 'prior_rights', 'lifecycle', CASE WHEN x.contract_version = w.suspended_version THEN 'active (when nothing moved on it since)' ELSE x.lifecycle_state END)
                                             FROM jsonb_array_elements(w.affected) a WHERE (a ->> 'contract_version')::int = x.contract_version AND (a ->> 'changed')::boolean), jsonb_build_object('rights_state', x.rights_state, 'lifecycle', x.lifecycle_state))
             ELSE jsonb_build_object('rights_state', x.rights_state, 'lifecycle', x.lifecycle_state) END) ORDER BY x.contract_version), '[]'::jsonb)
    INTO v_versions FROM observation.source_contracts_current x WHERE x.source_id = p_source AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  v_out := jsonb_build_object('source_id', p_source, 'source_name', s.name, 'operation', v_op, 'latest_version', s.contract_version, 'versions', v_versions, 'impact', v_impact,
                              'outstanding_withdrawal', CASE WHEN w.change_id IS NULL THEN NULL ELSE jsonb_build_object('change_id', w.change_id, 'recorded_at', w.recorded_at, 'reason', w.reason) END,
                              'deletion_obligation_declared', s.contract #>> '{authority_and_rights,deletion_obligation}');
  IF v_op = 'withdraw' THEN
    RETURN v_out || jsonb_build_object('schedule', CASE WHEN v_sched = 'scheduled' THEN 'removed' ELSE 'none_scheduled' END, 'possible', w.change_id IS NULL,
      'statement', CASE WHEN w.change_id IS NOT NULL THEN 'the rights already stand withdrawn' ELSE
        'collection stops, the schedule is removed, every resting product is marked (cause rights) and its owner routed an item, and the decision-active use of the source''s evidence is refused until the rights are restored; nothing is deleted unless a deletion obligation is declared with the withdrawal' END);
  ELSIF v_op = 'restore' THEN
    RETURN v_out || jsonb_build_object('possible', w.change_id IS NOT NULL, 'statement', CASE WHEN w.change_id IS NULL THEN 'nothing to restore: the rights stand no withdrawal of the rights lifecycle'
      ELSE 'each version the withdrawal withdrew returns to the rights it had; the version it suspended resumes when nothing moved on it since; a rights-terms record withdrawn separately stays withdrawn' END);
  ELSIF v_op = 'narrow' THEN
    v_after := CASE WHEN jsonb_typeof(p_change -> 'purposes') = 'array' THEN observation.rt_list(p_change -> 'purposes') ELSE NULL END;
    RETURN v_out || jsonb_build_object('purposes_before', s.purposes, 'purposes_after', v_after,
      'dropped', CASE WHEN v_after IS NULL THEN NULL ELSE (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM jsonb_array_elements_text(s.purposes) x WHERE NOT (v_after ? x)) END,
      'possible', v_after IS NOT NULL AND s.rights_state <> 'withdrawn',
      'statement', 'collection under a dropped purpose is refused from the next revalidation; evidence already held keeps its record');
  END IF;
  -- new_version: the registered draft against the version it supersedes
  SELECT * INTO n FROM observation.source_contracts_current x WHERE x.source_id = p_source AND x.contract_version = (p_change ->> 'contract_version')::int AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'source registry rejected (unknown_version): source % has no contract version %', p_source, coalesce(p_change ->> 'contract_version', '<none>') USING ERRCODE = '23503'; END IF;
  SELECT * INTO p FROM observation.source_contracts_current x WHERE x.source_id = p_source AND x.contract_version = (n.contract #>> '{lifecycle,supersedes_version}')::int;
  IF FOUND THEN
    IF n.purposes IS DISTINCT FROM p.purposes THEN v_diff := v_diff || jsonb_build_object('field', 'purposes', 'before', p.purposes, 'after', n.purposes,
         'dropped', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM jsonb_array_elements_text(p.purposes) x WHERE NOT (n.purposes ? x))); END IF;
    IF n.rights_state IS DISTINCT FROM p.rights_state THEN v_diff := v_diff || jsonb_build_object('field', 'rights_state', 'before', p.rights_state, 'after', n.rights_state); END IF;
    IF n.residency IS DISTINCT FROM p.residency THEN v_diff := v_diff || jsonb_build_object('field', 'residency', 'before', p.residency, 'after', n.residency); END IF;
    IF n.classification_ceiling IS DISTINCT FROM p.classification_ceiling THEN v_diff := v_diff || jsonb_build_object('field', 'classification_ceiling', 'before', p.classification_ceiling, 'after', n.classification_ceiling); END IF;
    IF n.endpoints IS DISTINCT FROM p.endpoints THEN v_diff := v_diff || jsonb_build_object('field', 'endpoints', 'before', p.endpoints, 'after', n.endpoints); END IF;
    IF n.acquisition_mode IS DISTINCT FROM p.acquisition_mode THEN v_diff := v_diff || jsonb_build_object('field', 'acquisition_mode', 'before', p.acquisition_mode, 'after', n.acquisition_mode); END IF;
    IF n.connector_kind IS DISTINCT FROM p.connector_kind THEN v_diff := v_diff || jsonb_build_object('field', 'connector_kind', 'before', p.connector_kind, 'after', n.connector_kind); END IF;
    IF n.cadence_seconds IS DISTINCT FROM p.cadence_seconds THEN v_diff := v_diff || jsonb_build_object('field', 'cadence_seconds', 'before', p.cadence_seconds, 'after', n.cadence_seconds); END IF;
    IF (n.contract #> '{authority_and_rights,deletion_obligation}') IS DISTINCT FROM (p.contract #> '{authority_and_rights,deletion_obligation}') THEN
      v_diff := v_diff || jsonb_build_object('field', 'deletion_obligation', 'before', p.contract #> '{authority_and_rights,deletion_obligation}', 'after', n.contract #> '{authority_and_rights,deletion_obligation}'); END IF;
  END IF;
  RETURN v_out || jsonb_build_object('contract_version', n.contract_version, 'supersedes', CASE WHEN p.source_id IS NULL THEN NULL ELSE p.contract_version END, 'changes', v_diff,
    'statement', CASE WHEN p.source_id IS NULL THEN 'a first version: nothing rests on an earlier one'
                      WHEN jsonb_array_length(v_diff) = 0 THEN 'no consequential field changes against the version it supersedes'
                      ELSE format('%s consequential field(s) change against version %s; what rests on the source is listed', jsonb_array_length(v_diff), p.contract_version) END);
END $$;
REVOKE ALL ON FUNCTION observation._rg_change_preview(uuid, uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION observation.record_source_evaluation(uuid, uuid, uuid, uuid, int, text, text, text, text, jsonb, jsonb, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.record_source_evaluation(uuid, uuid, uuid, uuid, int, text, text, text, text, jsonb, jsonb, text, text, uuid, uuid) TO eye_commit;

/* THE REVOCATION IMPACT READ (FEX-02, PR-09-005): what rests on the source's evidence, each with its owner, its markers, and the rights
   lifecycle's outstanding withdrawal. Reads scope-guarded (assert_read_scope); the PDP admits observation.rights.impact.read. */
CREATE OR REPLACE FUNCTION observation.rights_revocation_impact(p_tenant uuid, p_domain uuid, p_source_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
DECLARE w observation.source_rights_changes%ROWTYPE; s observation.source_contracts_current%ROWTYPE;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the revocation impact of a source');
  SELECT * INTO s FROM observation.source_contracts_current x WHERE x.source_id = p_source_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain ORDER BY x.contract_version DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'source registry rejected (unknown_source): source % is not recorded in this domain', p_source_id USING ERRCODE = '23503'; END IF;
  w := observation._rg_outstanding_withdrawal(p_tenant, p_domain, p_source_id);
  RETURN observation._rg_impact(p_tenant, p_domain, p_source_id) || jsonb_build_object(
    'latest_version', s.contract_version, 'rights_state', s.rights_state, 'lifecycle_state', s.lifecycle_state,
    'withdrawal', CASE WHEN w.change_id IS NULL THEN NULL ELSE jsonb_build_object('change_id', w.change_id, 'recorded_at', w.recorded_at, 'reason', w.reason, 'evidence', w.evidence,
                         'actor', observation._rg_who(w.actor), 'retention_action_id', w.retention_action_id, 'incident_id', w.incident_id, 'attention_items', w.attention_items,
                         'impact_at_withdrawal', jsonb_build_object('resting', w.impact -> 'resting', 'statement', w.impact ->> 'statement')) END,
    'use', CASE WHEN w.change_id IS NULL AND s.rights_state <> 'withdrawn' THEN 'the decision-active use of this source''s evidence is not refused for its contract rights (the rights terms are judged separately)'
                ELSE 'the decision-active use of this source''s evidence is REFUSED (rights_withdrawn) until the rights are restored; reading stays as it was' END,
    'as_of', graph.pv_iso(clock_timestamp()));
END $$;
REVOKE ALL ON FUNCTION observation.rights_revocation_impact(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.rights_revocation_impact(uuid, uuid, uuid) TO eye_app, eye_commit;

/* THE CHANGE PREVIEW READ (CAP-OB-02): before a rights change or a new contract version. */
CREATE OR REPLACE FUNCTION observation.source_change_impact(p_tenant uuid, p_domain uuid, p_source_id uuid, p_change jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the change preview of a source');
  RETURN observation._rg_change_preview(p_tenant, p_domain, p_source_id, coalesce(p_change, '{}'::jsonb)) || jsonb_build_object('as_of', graph.pv_iso(clock_timestamp()));
END $$;
REVOKE ALL ON FUNCTION observation.source_change_impact(uuid, uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.source_change_impact(uuid, uuid, uuid, jsonb) TO eye_app, eye_commit;

/* THE ECONOMICS against the run meter (PR-09-001/-002): the SRC@v4 economics of the latest version that declares them, the runs recorded
   in the current period (collection_runs_current — the run meter's record), their cost and the budget left. A v1–v3 source declares none. */
CREATE OR REPLACE FUNCTION observation._rg_economics(p_tenant uuid, p_domain uuid, p_source uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
DECLARE s observation.source_contracts_current%ROWTYPE; e jsonb; v_from timestamptz; v_runs int; v_cost numeric; v_budget numeric;
BEGIN
  SELECT * INTO s FROM observation.source_contracts_current x WHERE x.source_id = p_source AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.contract ? 'economics'
   ORDER BY x.contract_version DESC LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('declared', false, 'statement', 'no economics declared (an SRC@v1–v3 contract — not recorded before B40)'); END IF;
  e := s.contract -> 'economics';
  v_from := date_trunc(e ->> 'period', clock_timestamp());
  SELECT count(*)::int INTO v_runs FROM observation.collection_runs_current r WHERE r.source_id = p_source AND r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.started_at >= v_from;
  v_cost := v_runs * (e ->> 'cost_per_run')::numeric; v_budget := (e ->> 'budget_per_period')::numeric;
  RETURN jsonb_build_object('declared', true, 'contract_version', s.contract_version, 'period', e ->> 'period', 'period_from', graph.pv_iso(v_from), 'currency', e ->> 'currency', 'owner', e ->> 'owner',
    'cost_per_run', (e ->> 'cost_per_run')::numeric, 'budget_per_period', v_budget, 'runs', v_runs, 'cost', v_cost, 'remaining', v_budget - v_cost, 'over_budget', v_cost > v_budget,
    'basis', 'runs recorded in the current period (the run meter''s record) × the declared cost per run');
END $$;
REVOKE ALL ON FUNCTION observation._rg_economics(uuid, uuid, uuid) FROM PUBLIC;

/* THE REGISTRY READ of one source: per contract version its schema, whether B40's records apply (a v1–v3 version reads "not recorded before
   B40" where it has none), the evaluations, the customer approvals; the rights lifecycle, the stewardship, the incidents, the candidate it
   was promoted from, the economics against the run meter, the active markers. Metadata only — no evidence content (D9). */
CREATE OR REPLACE FUNCTION observation.source_registry_read(p_tenant uuid, p_domain uuid, p_source_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = observation, objects, pg_catalog, pg_temp AS $$
DECLARE v_versions jsonb; w observation.source_rights_changes%ROWTYPE; v_st jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the registry record of a source');
  IF NOT EXISTS (SELECT 1 FROM observation.source_contracts_current x WHERE x.source_id = p_source_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain) THEN
    RAISE EXCEPTION 'source registry rejected (unknown_source): source % is not recorded in this domain', p_source_id USING ERRCODE = '23503';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'contract_version', s.contract_version, 'schema_ref', o.schema_ref, 'v4', o.schema_ref = 'SRC@v4', 'lifecycle_state', s.lifecycle_state, 'rights_state', s.rights_state,
      'purposes', s.purposes, 'registrar', observation._rg_who(s.registrar_principal_id), 'approver', observation._rg_who(s.approver_principal_id),
      'economics', s.contract -> 'economics', 'stewardship_declared', s.contract -> 'stewardship', 'deletion_obligation', s.contract #>> '{authority_and_rights,deletion_obligation}',
      'evaluations', (SELECT coalesce(jsonb_agg(to_jsonb(e) - 'tenant_id' - 'domain_id' - 'scope' || jsonb_build_object('evaluator', observation._rg_who(e.evaluated_by)) ORDER BY e.evaluated_at DESC), '[]'::jsonb)
                        FROM observation.source_evaluations e WHERE e.source_id = s.source_id AND e.contract_version = s.contract_version AND e.tenant_id = p_tenant AND e.domain_id = p_domain),
      'customer_approvals', (SELECT coalesce(jsonb_agg(to_jsonb(a) - 'tenant_id' - 'domain_id' - 'scope' || jsonb_build_object('approver', observation._rg_who(a.approved_by)) ORDER BY a.approved_at DESC), '[]'::jsonb)
                        FROM observation.source_customer_approvals a WHERE a.source_id = s.source_id AND a.contract_version = s.contract_version AND a.tenant_id = p_tenant AND a.domain_id = p_domain),
      'approval_gate', CASE WHEN o.schema_ref = 'SRC@v4' THEN 'an SRC@v4 contract is approved only on its latest evaluation recommending approval'
                            ELSE 'an SRC@v1–v3 contract keeps its recorded path (registrar ≠ approver); its evaluation, customer approval and economics are not recorded before B40' END)
      ORDER BY s.contract_version DESC), '[]'::jsonb)
    INTO v_versions
    FROM observation.source_contracts_current s
    LEFT JOIN objects.canonical_objects o ON o.object_type = 'SRC' AND o.object_id = s.src_object_id AND o.object_version = s.src_object_version AND o.tenant_id = s.tenant_id
   WHERE s.source_id = p_source_id AND s.tenant_id = p_tenant AND s.domain_id = p_domain;
  w := observation._rg_outstanding_withdrawal(p_tenant, p_domain, p_source_id);
  SELECT to_jsonb(x) - 'tenant_id' - 'domain_id' - 'scope' || jsonb_build_object('steward', observation._rg_who(x.steward_principal_id), 'review_overdue', x.review_due < current_date)
    INTO v_st FROM observation.source_stewardship x WHERE x.source_id = p_source_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain ORDER BY x.version DESC LIMIT 1;
  RETURN jsonb_build_object('source_id', p_source_id, 'versions', v_versions,
    'rights_changes', (SELECT coalesce(jsonb_agg(jsonb_build_object('change_id', c.change_id, 'operation', c.operation, 'via', c.via, 'contract_version', c.contract_version, 'reason', c.reason,
                          'evidence', c.evidence, 'purposes_before', c.purposes_before, 'purposes_after', c.purposes_after, 'affected', c.affected, 'suspended_version', c.suspended_version,
                          'reactivated_version', c.reactivated_version, 'deletion_obligation', c.deletion_obligation, 'retention_action_id', c.retention_action_id, 'incident_id', c.incident_id,
                          'reverses', c.reverses, 'resting', c.impact -> 'resting', 'impact_statement', c.impact ->> 'statement', 'attention_items', jsonb_array_length(c.attention_items),
                          'actor', observation._rg_who(c.actor), 'recorded_at', c.recorded_at) ORDER BY c.recorded_at DESC), '[]'::jsonb)
                        FROM observation.source_rights_changes c WHERE c.source_id = p_source_id AND c.tenant_id = p_tenant AND c.domain_id = p_domain),
    'outstanding_withdrawal', CASE WHEN w.change_id IS NULL THEN NULL ELSE jsonb_build_object('change_id', w.change_id, 'recorded_at', w.recorded_at, 'reason', w.reason) END,
    'stewardship', v_st,
    'stewardship_history', (SELECT coalesce(jsonb_agg(to_jsonb(x) - 'tenant_id' - 'domain_id' - 'scope' || jsonb_build_object('steward', observation._rg_who(x.steward_principal_id)) ORDER BY x.version DESC), '[]'::jsonb)
                             FROM observation.source_stewardship x WHERE x.source_id = p_source_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain),
    'incidents', (SELECT coalesce(jsonb_agg(to_jsonb(i) - 'tenant_id' - 'domain_id' - 'scope' || jsonb_build_object('owner', observation._rg_who(i.owner_principal_id)) ORDER BY i.opened_at DESC), '[]'::jsonb)
                   FROM observation.source_incidents i WHERE i.source_id = p_source_id AND i.tenant_id = p_tenant AND i.domain_id = p_domain),
    'candidate', (SELECT to_jsonb(c) - 'tenant_id' - 'domain_id' - 'scope' || jsonb_build_object('proposer', observation._rg_who(c.proposed_by))
                    FROM observation.source_candidates c WHERE c.promoted_source_id = p_source_id AND c.tenant_id = p_tenant AND c.domain_id = p_domain LIMIT 1),
    'economics', observation._rg_economics(p_tenant, p_domain, p_source_id),
    'markers', (SELECT coalesce(jsonb_agg(jsonb_build_object('marker_id', m.marker_id, 'kind', m.subject_kind, 'id', m.subject_id, 'health_state', m.health_state, 'cause', m.cause, 'set_at', m.set_at) ORDER BY m.set_at), '[]'::jsonb)
                  FROM observation.source_impact_markers m WHERE m.source_id = p_source_id AND m.tenant_id = p_tenant AND m.domain_id = p_domain AND m.state = 'active'),
    'as_of', graph.pv_iso(clock_timestamp()));
END $$;
REVOKE ALL ON FUNCTION observation.source_registry_read(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.source_registry_read(uuid, uuid, uuid) TO eye_app, eye_commit;

/* THE CANDIDATES of the domain (discovery), newest first, with the source each was promoted to. */
CREATE OR REPLACE FUNCTION observation.source_candidates_read(p_tenant uuid, p_domain uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the source candidates of a domain');
  RETURN jsonb_build_object('candidates', (SELECT coalesce(jsonb_agg(to_jsonb(c) - 'tenant_id' - 'domain_id' - 'scope' || jsonb_build_object('proposer', observation._rg_who(c.proposed_by), 'decider', observation._rg_who(c.decided_by),
                              'source_name', (SELECT s.name FROM observation.source_contracts_current s WHERE s.source_id = c.promoted_source_id AND s.contract_version = c.promoted_contract_version),
                              'events', (SELECT coalesce(jsonb_agg(jsonb_build_object('event', e.event, 'actor', observation._rg_who(e.actor), 'at', e.occurred_at, 'details', e.details) ORDER BY e.occurred_at), '[]'::jsonb)
                                           FROM observation.source_candidate_events e WHERE e.candidate_id = c.candidate_id)) ORDER BY c.proposed_at DESC), '[]'::jsonb)
                              FROM (SELECT * FROM observation.source_candidates x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain ORDER BY x.proposed_at DESC LIMIT 200) c),
                            'as_of', graph.pv_iso(clock_timestamp()));
END $$;
REVOKE ALL ON FUNCTION observation.source_candidates_read(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.source_candidates_read(uuid, uuid) TO eye_app, eye_commit;

-- §RG.5 THE USE REFUSAL — §0's stub REPLACED WHOLE (same signature, STABLE, invoker, search path, REVOKE ALL FROM PUBLIC) ──────────────
/* DESIGN D4 (the owner's word): evidence acquired under REVOKED rights is refused at every decision-active use (an option, a publication, an
   export, a gate act — objects._lineage_usable through §0's dispatcher), from CURRENT database state. BOTH rights sources of the contract
   version the evidence was admitted under count, each on its own:
     the source CONTRACT's rights (p_contract_rights_state — graph.ev_evidence_state's `contract_rights_state`, read in the refusing statement)
       withdrawn → refused, whatever the rights terms say (an in-force terms record never bypasses a revoked contract);
     the rights TERMS (p_terms_rights_state — 0121's terms-derived state) withdrawn → refused, whatever the contract says (a confirmed
       contract never bypasses withdrawn terms; _lineage_usable already refuses this as rights_expired before it asks — counted here too, so
       the rule holds whichever check runs first).
   A contract state the dispatcher did not carry (NULL for evidence naming a source) is READ AGAIN from the projection now, never assumed in
   force. Evidence naming no source contract is not this hook's question. Recovery is only through the governed restoration of the
   applicable rights (change_rights restore; a new rights-terms version) — this function reads state, it records nothing. */
CREATE OR REPLACE FUNCTION observation._rg_use_refusal(p_tenant uuid, p_domain uuid, p_evd uuid, p_version int,
                                                       p_source uuid, p_contract_version int,
                                                       p_contract_rights_state text, p_terms_rights_state text) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = observation, pg_catalog, pg_temp AS $$
DECLARE v_contract text := p_contract_rights_state;   -- B40 rg
BEGIN
  -- B40 rg (D4): both rights sources, from current state
  IF p_source IS NULL OR p_contract_version IS NULL THEN RETURN NULL; END IF;
  IF v_contract IS NULL THEN
    SELECT s.rights_state INTO v_contract FROM observation.source_contracts_current s
     WHERE s.source_id = p_source AND s.contract_version = p_contract_version AND s.tenant_id = p_tenant AND s.domain_id = p_domain;
  END IF;
  IF v_contract = 'withdrawn' THEN
    RETURN jsonb_build_object('class', 'rights_withdrawn',
      'detail', format('whose source contract (%s v%s) has its rights WITHDRAWN%s; it is refused until the contract rights are restored through the rights lifecycle (an in-force rights-terms record does not lift a contract withdrawal)',
                       p_source, p_contract_version, CASE WHEN p_terms_rights_state IS NULL THEN '' ELSE format(' (its rights terms read %s)', p_terms_rights_state) END));
  END IF;
  IF p_terms_rights_state = 'withdrawn' THEN
    RETURN jsonb_build_object('class', 'rights_withdrawn',
      'detail', format('whose rights terms (source %s v%s) are WITHDRAWN (the contract rights read %s); it is refused until a new rights-terms version is declared in force (a confirmed contract does not lift a terms withdrawal)',
                       p_source, p_contract_version, coalesce(v_contract, 'not recorded')));
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION observation._rg_use_refusal(uuid, uuid, uuid, int, uuid, int, text, text) FROM PUBLIC;

-- §RG.6 THE WIRING ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

-- observation.mark_source_impact — 0088:603 (B28 §R4), its LAST definition, copied WHOLE (signature, security, search path, grants); the
-- one change, marked `-- B40 rg`: the CAUSE of a marker set now — `rights` when the event that set it declares `cause: rights` (the rights
-- lifecycle's SourceHealthChanged) or the source's rights stand withdrawn and the state is `suspended`; `health` otherwise (D4). A marker
-- whose cause changes is cleared and set again (history kept; nothing rewritten in place), as a changed health state is.
CREATE OR REPLACE FUNCTION observation.mark_source_impact(p_tenant uuid, p_domain uuid, p_source_id uuid, p_health_state text, p_reason text, p_event_id uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE d record; v_set jsonb := '[]'::jsonb; v_kept jsonb := '[]'::jsonb; v_changed jsonb := '[]'::jsonb; v_cleared jsonb := '[]'::jsonb; m observation.source_impact_markers%ROWTYPE; v_degraded boolean;
        rm observation.coverage_remediations%ROWTYPE; v_remediated jsonb := '[]'::jsonb; v_rclosure jsonb; v_rat timestamptz; /* B28 (0088) remediation */
        v_cause text := 'health';   -- B40 rg
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.source_health.subscription.apply']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_health_state IS NULL OR p_health_state NOT IN ('healthy', 'active', 'degraded', 'failed', 'suspended', 'unknown') THEN
    RAISE EXCEPTION 'source impact rejected: % is not a source health state', coalesce(p_health_state, '<none>') USING ERRCODE = '22023';
  END IF;
  v_degraded := p_health_state IN ('degraded', 'failed', 'suspended', 'unknown');
  -- B40 rg (D4): the cause — the event's declaration (the rights lifecycle's SourceHealthChanged), or a suspension while the rights stand withdrawn
  IF v_degraded AND (EXISTS (SELECT 1 FROM objects.object_outbox ob WHERE ob.id = p_event_id AND ob.payload ->> 'cause' = 'rights')                     -- B40 rg
                     OR (p_health_state = 'suspended' AND (observation._rg_outstanding_withdrawal(p_tenant, p_domain, p_source_id)).change_id IS NOT NULL)) THEN  -- B40 rg
    v_cause := 'rights';                                                                                                                             -- B40 rg
  END IF;                                                                                                                                            -- B40 rg
  IF v_degraded THEN
    FOR d IN SELECT * FROM observation.source_derived_products(p_tenant, p_domain, p_source_id) LOOP
      SELECT * INTO m FROM observation.source_impact_markers x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.source_id = p_source_id AND x.subject_kind = d.subject_kind AND x.subject_id = d.subject_id AND x.state = 'active';
      IF FOUND AND m.health_state = p_health_state AND m.cause = v_cause THEN v_kept := v_kept || jsonb_build_object('kind', d.subject_kind, 'id', d.subject_id); CONTINUE; END IF;   -- B40 rg: and the same cause
      IF FOUND THEN
        -- B24 (0086 §I): the source's health CHANGED between two non-healthy states (degraded → suspended, or back): the old marker is
        -- cleared with the new state recorded and a new marker set — so a gate reads the CURRENT state, and an acknowledgement given
        -- for the old marker does not carry to the new one (history kept; nothing rewritten in place).
        -- B40 rg: likewise when the CAUSE changed (health ↔ rights).
        UPDATE observation.source_impact_markers SET state = 'cleared', cleared_at = clock_timestamp(), cleared_by_event = p_event_id, cleared_state = p_health_state
         WHERE marker_id = m.marker_id;
        v_changed := v_changed || jsonb_build_object('kind', d.subject_kind, 'id', d.subject_id, 'from', m.health_state, 'to', p_health_state, 'cause_from', m.cause, 'cause_to', v_cause);  -- B40 rg: the causes
      END IF;
      INSERT INTO observation.source_impact_markers (marker_id, scope, tenant_id, domain_id, source_id, subject_kind, subject_id, health_state, reason, set_by_event, correlation_id, cause)  -- B40 rg: cause
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_source_id, d.subject_kind, d.subject_id, p_health_state, p_reason, p_event_id, p_correlation, v_cause);                -- B40 rg: cause
      v_set := v_set || jsonb_build_object('kind', d.subject_kind, 'id', d.subject_id, 'via', d.via, 'cause', v_cause);   -- B40 rg: cause
    END LOOP;
  ELSE
    FOR m IN SELECT * FROM observation.source_impact_markers x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.source_id = p_source_id AND x.state = 'active' FOR UPDATE LOOP
      UPDATE observation.source_impact_markers SET state = 'cleared', cleared_at = clock_timestamp(), cleared_by_event = p_event_id, cleared_state = p_health_state WHERE marker_id = m.marker_id;
      v_cleared := v_cleared || jsonb_build_object('kind', m.subject_kind, 'id', m.subject_id);
    END LOOP;
    /* B28 (0088) remediation — the source RECOVERED (healthy | active): its open remediation closes `closed_recovered`, automatically, naming
       the health event that recovered it; the gap's window ends here. A redelivery finds none open and closes nothing more. */
    FOR rm IN SELECT * FROM observation.coverage_remediations x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.source_id = p_source_id AND x.state IN ('open', 'in_progress') FOR UPDATE LOOP
      v_rat := clock_timestamp();
      v_rclosure := jsonb_build_object('kind', 'recovered', 'by', p_actor, 'at', v_rat, 'automatic', true, 'health_event', p_event_id,
                                       'health', jsonb_build_object('state', p_health_state, 'at', v_rat, 'basis', 'the source-health subscriber', 'ref', p_event_id), 'note', p_reason);
      UPDATE observation.coverage_remediations SET state = 'closed_recovered', closure = v_rclosure, closed_at = v_rat, gap_to = greatest(v_rat, gap_from),
             gap = jsonb_set(gap, '{window,to}', to_jsonb(greatest(v_rat, gap_from))), updated_at = v_rat
       WHERE remediation_id = rm.remediation_id;
      INSERT INTO observation.coverage_remediation_events (event_id, scope, tenant_id, domain_id, remediation_id, event, actor_principal_id, details, occurred_at, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, rm.remediation_id, 'remediation.closed', p_actor,
              jsonb_build_object('from_state', rm.state, 'state', 'closed_recovered', 'closure', v_rclosure), v_rat, p_correlation);
      v_remediated := v_remediated || jsonb_build_object('remediation_id', rm.remediation_id, 'from_state', rm.state, 'state', 'closed_recovered');
    END LOOP;
    /* end B28 remediation */
  END IF;
  RETURN jsonb_build_object('source_id', p_source_id, 'health_state', p_health_state, 'degraded', v_degraded, 'set', v_set, 'kept', v_kept, 'changed', v_changed, 'cleared', v_cleared,
                            /* B28 (0088) remediation */ 'remediations_closed', v_remediated /* end B28 remediation */,
                            'cause', v_cause /* B40 rg */);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.mark_source_impact(uuid,uuid,uuid,text,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.mark_source_impact(uuid,uuid,uuid,text,text,uuid,uuid,uuid) TO eye_commit;

-- observation.upsert_scheduler_entry — 0022:1594, its LAST definition, copied WHOLE; the one change, marked `-- B40 rg`: the rights acts
-- (observation.source.change_rights, and the v1–v3 rights route observation.source.rights) may remove the schedule entry of a withdrawn
-- source and restore that of a resumed one (the route keeps the Redis job and this row in step, inside the same governed operation).
CREATE OR REPLACE FUNCTION observation.upsert_scheduler_entry(
  p_source_id uuid, p_tenant uuid, p_domain uuid, p_contract_version int,
  p_scheduler_id text, p_queue text, p_cadence int, p_jitter int, p_status text
) RETURNS void
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  -- Registering an agent for an ALREADY ACTIVE source is the moment its schedule
  -- becomes possible, so that action establishes a schedule too. Without it a
  -- source activated before its agent existed would stay active with nothing
  -- scheduled to collect it.
  PERFORM observation.assert_authority(ARRAY[
    'observation.source.transition', 'observation.schedule.set', 'observation.agent.register',
    'observation.source.change_rights', 'observation.source.rights']);   -- B40 rg: the rights acts remove / restore the schedule
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_status = 'scheduled' AND p_cadence < 60 THEN
    RAISE EXCEPTION 'schedule rejected: the local profile enforces a 60-second minimum polling interval (requested %s)',
      p_cadence USING ERRCODE = '23514';
  END IF;
  INSERT INTO observation.scheduler_entries (
    source_id, scope, tenant_id, domain_id, contract_version, scheduler_id, queue_name,
    cadence_seconds, jitter_seconds, status, removed_at
  ) VALUES (
    p_source_id, 'DOMAIN', p_tenant, p_domain, p_contract_version, p_scheduler_id, p_queue,
    greatest(p_cadence, 60), p_jitter, p_status,
    CASE WHEN p_status = 'removed' THEN clock_timestamp() END)
  ON CONFLICT (source_id) DO UPDATE
    SET contract_version = EXCLUDED.contract_version, scheduler_id = EXCLUDED.scheduler_id,
        queue_name = EXCLUDED.queue_name, cadence_seconds = EXCLUDED.cadence_seconds,
        jitter_seconds = EXCLUDED.jitter_seconds, status = EXCLUDED.status,
        removed_at = EXCLUDED.removed_at;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.upsert_scheduler_entry(uuid,uuid,uuid,int,text,text,int,int,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.upsert_scheduler_entry(uuid,uuid,uuid,int,text,text,int,int,text) TO eye_commit;
