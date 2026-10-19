-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0120 §PV — CP-6 B50 part §PV: PROVENANCE, EXPLANATION, UNFIT MARKING AND THE CONTEST PATH (F-P3-03 + HX-14). Folded into 0120 after §LC.
-- Applies ALONE on 0001–0119 + the 0120 §0 prelude. Nothing applied or committed is edited; the one existing function re-declared is §PV's
-- own hook stub objects._lineage_usable (0120 §0.1), copied whole with its signature, volatility (STABLE), invoker security and search path.
--
--   §PV.1  the vocabulary: references, the rule and method versions                                    (helpers, IMMUTABLE, no grant)
--   §PV.2  the ledgers: product_fitness_marks · knowledge_challenges (+ events, evidence) · provenance_agents (+ events) · provenance_runs ·
--          provenance_edges — FORCE RLS, SELECT to eye_app / eye_commit, no write grant (the ports write); append-only where marked
--   §PV.3  the lineage closure (internal): the backward walk over recorded lineage — the header's evidence_refs / source_object_ids /
--          correction_of, a claim's claim_lineage (its byte span and evidence digest), a package option's citations, a publication's source —
--          bounded (depth, nodes), every unresolved reference, broken custody and unverifiable artifact named as a GAP, never dropped
--   §PV.4  graph.explain(type, id, version): the backward PATH with the denied / abstained / challenged / overridden / corrected / failed
--          nodes (ES-28-004), the boundaries crossed (synchronous, event, workflow, agent, model, human; the TOOL boundary carried to B70),
--          and the forward impact as a read-only preview (the recorded walk's buckets are §CI's)
--   §PV.5  graph.revision_diff(type, id, from, to) and graph.graph_revision_diff(from, to) (V03-T-192)
--   §PV.6  the generic UNFIT: graph.product_fitness (the evaluation, read) · graph.mark_product_fitness (the governed mark) · the hook
--          objects._lineage_usable (consequential use and export refused for a product marked unfit, or resting on one) (DP-23-005)
--   §PV.7  graph.alignment_check(kind, id, version): claim-to-evidence alignment of briefings, publications and exports, with the
--          audience filtering disclosed; TRANSLATION carried to B85 (AI-29-001, AI-29-003)
--   §PV.8  the contest path (HX-14): knowledge challenges on claims / assessments / warnings / forecasts in B21's shape (open →
--          under_review → upheld | dismissed | withdrawn; reviewer ≠ opener ≠ owner; evidence submission; escalation on the DB clock);
--          a decision is ROUTED to B35's appeal / B36's gate challenge, a run to B21's simulation challenge — never duplicated
--   §PV.9  the provenance agent (AG-014): 0060's registry shape, role provenance_agent, deterministic (no model); its ONE surface
--          graph.provenance_construct builds graph.provenance_edges from recorded lineage and reports every gap (it cannot conceal)
--
-- WHY graph.provenance_edges AND NOT graph.dependencies: graph.dependencies (0024 §7) is the PERSON-DECLARED strategy table — "never inferred",
-- its dependent a strategy object (FK to graph.strategy_current). Product lineage edges an agent constructs from recorded lineage are a
-- different fact with a different authority, so they live in their own append-only ledger, each edge naming its basis and its run.
--
-- REFUSAL NOUNS (the CLASS form `<noun> rejected (<class>): …`; reported to the integrator for observation-errors.ts):
--   `provenance rejected` (the reads), `product fitness rejected` (the mark), `knowledge challenge rejected` (§PV.8),
--   `provenance agent rejected` (§PV.9); the hook raises §0's `object use rejected (unfit)` (already mapped, 409).
-- THREE CLAIMS: construction (this migration and phase6-provenance-b50); demonstrated operation (the act — SYNTHETIC); real acceptance — never.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §PV.1 THE VOCABULARY ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION graph.pv_fitness_rule() RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'b50-pv-fitness-1' $$;
CREATE OR REPLACE FUNCTION graph.pv_explain_method() RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'b50-pv-explain-1' $$;
CREATE OR REPLACE FUNCTION graph.pv_claim_types() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['ENT', 'EVT', 'CLM', 'REL', 'ASM'] $$;
/* What the carried boundaries are carried to (DESIGN D12): no tool gateway exists (B70, F-P7A-05); no translation exists (B85). */
CREATE OR REPLACE FUNCTION graph.pv_carried() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$ SELECT jsonb_build_array(
  jsonb_build_object('what', 'tool', 'state', 'carried', 'carrier', 'B70 — the tool gateway (F-P7A-05); no tool boundary exists to record a call across'),
  jsonb_build_object('what', 'translation', 'state', 'carried', 'carrier', 'B85 — no translation exists (DESIGN D12); alignment through translation is not claimed')) $$;
GRANT EXECUTE ON FUNCTION graph.pv_fitness_rule(), graph.pv_explain_method(), graph.pv_claim_types(), graph.pv_carried() TO eye_app, eye_commit;

/* A reference as the header records it: `TYP:<uuid>@<version>` · `TYP:<uuid>` · `blob:<manifest uuid>` · a bare uuid · anything else (opaque). */
CREATE OR REPLACE FUNCTION graph.pv_ref(p text) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE
    WHEN p ~ '^[A-Z]{3}:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(@[1-9][0-9]{0,8})?$'
      THEN jsonb_build_object('form', 'typed', 'type', substring(p from 1 for 3), 'id', lower(substring(p from 5 for 36)),
                              'version', CASE WHEN position('@' in p) > 0 THEN split_part(p, '@', 2)::int END)
    WHEN p ~ '^blob:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      THEN jsonb_build_object('form', 'manifest', 'type', NULL, 'id', lower(substring(p from 6)), 'version', NULL)
    WHEN p ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(@[1-9][0-9]{0,8})?$'
      THEN jsonb_build_object('form', 'bare', 'type', NULL, 'id', lower(split_part(p, '@', 1)), 'version', CASE WHEN position('@' in p) > 0 THEN split_part(p, '@', 2)::int END)
    ELSE jsonb_build_object('form', 'opaque', 'type', NULL, 'id', NULL, 'version', NULL) END
$$;
REVOKE ALL ON FUNCTION graph.pv_ref(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.pv_ref(text) TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION graph.pv_iso(p timestamptz) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE WHEN p IS NULL THEN NULL ELSE to_char(p AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END
$$;
REVOKE ALL ON FUNCTION graph.pv_iso(timestamptz) FROM PUBLIC;

/* The accountable owner as a principal id ('principal:<uuid>' → the uuid; an agent's or a system's owner → NULL). */
CREATE OR REPLACE FUNCTION graph.pv_owner(p text) RETURNS uuid
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE WHEN p ~* '^principal:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN substring(p from 11)::uuid END
$$;
REVOKE ALL ON FUNCTION graph.pv_owner(text) FROM PUBLIC;

/* One explanation node in the seam's shape (ExplainNode, b50-seams.ts): node_id, kind, ref, label, outcome, at, actor, parents, span, boundary. */
CREATE OR REPLACE FUNCTION graph.pv_node(p_node text, p_kind text, p_ref text, p_label text, p_outcome text, p_at timestamptz, p_actor text, p_span jsonb, p_boundary text) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = graph, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('node_id', p_node, 'kind', p_kind, 'ref', p_ref, 'label', left(coalesce(p_label, p_kind), 400), 'outcome', p_outcome,
                            'at', graph.pv_iso(p_at), 'actor', p_actor, 'parents', '[]'::jsonb, 'span', p_span, 'boundary', p_boundary)
$$;
REVOKE ALL ON FUNCTION graph.pv_node(text, text, text, text, text, timestamptz, text, jsonb, text) FROM PUBLIC;

-- §PV.2 THE LEDGERS ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* THE GENERIC UNFIT MARK (DP-23-005): the verdict is the EVALUATION's (graph.pv_fitness_eval under the rule version), never the caller's;
   the gaps it found are kept with it; an unfit mark routes the product to a recompute or an adjudication with its owner; a later mark
   (a re-evaluation after the gap is closed) supersedes — nothing is erased. The current mark of a version is its latest. Append-only. */
CREATE TABLE graph.product_fitness_marks (
  mark_id           uuid PRIMARY KEY,
  scope             text NOT NULL,
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  object_type       text NOT NULL CHECK (object_type ~ '^[A-Z]{3}$'),
  object_id         uuid NOT NULL,
  object_version    int  NOT NULL CHECK (object_version >= 1),
  object_digest     text NOT NULL CHECK (object_digest ~ '^[0-9a-f]{64}$'),
  verdict           text NOT NULL CHECK (verdict IN ('fit', 'unfit', 'unknown')),
  reasons           text[] NOT NULL DEFAULT '{}' CHECK (reasons <@ ARRAY['incomplete_lineage', 'broken_custody', 'unverifiable_artifact', 'unsupported_claim']),
  gaps              jsonb NOT NULL CHECK (jsonb_typeof(gaps) = 'array'),
  examined          int  NOT NULL CHECK (examined >= 0),
  truncated         boolean NOT NULL,
  rule_version      text NOT NULL,
  route             text CHECK (route IS NULL OR route IN ('recompute', 'adjudication')),
  routed_to         uuid,
  note              text NOT NULL CHECK (length(btrim(note)) BETWEEN 8 AND 2000),
  supersedes        uuid REFERENCES graph.product_fitness_marks (mark_id),
  marked_by         uuid NOT NULL,
  marked_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id    uuid NOT NULL,
  CONSTRAINT gpfm_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT gpfm_unfit_reasons CHECK ((verdict = 'unfit') = (cardinality(reasons) >= 1)),
  CONSTRAINT gpfm_unfit_routed CHECK ((verdict = 'unfit') = (route IS NOT NULL))
);
COMMENT ON TABLE graph.product_fitness_marks IS 'B50 §PV (0120; DP-23-005): the generic UNFIT mark of a product version — the evaluation''s verdict (incomplete lineage, broken custody, an unverifiable artifact, an unlabelled unsupported claim) with its gaps, recorded by a named person; an unfit mark is routed (recompute | adjudication) to the owner; consequential use and export refuse it (objects._lineage_usable). Append-only: the latest mark of a version is current, a re-evaluation supersedes.';
CREATE INDEX gpfm_object ON graph.product_fitness_marks (object_id, object_version, marked_at DESC);
CREATE TRIGGER gpfm_append_only BEFORE UPDATE OR DELETE ON graph.product_fitness_marks FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* THE CONTEST PATH (HX-14), B21's shape (simulation.challenges 0081:853): one row per challenge with its state; the events beside it. */
CREATE TABLE graph.knowledge_challenges (
  challenge_id       uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  subject_kind       text NOT NULL CHECK (subject_kind IN ('claim', 'assessment', 'warning', 'forecast')),
  subject_type       text NOT NULL CHECK (subject_type IN ('CLM', 'ENT', 'EVT', 'REL', 'ASM', 'WRN', 'FCT')),
  subject_id         uuid NOT NULL,
  subject_version    int  NOT NULL CHECK (subject_version >= 1),
  subject_digest     text NOT NULL CHECK (subject_digest ~ '^[0-9a-f]{64}$'),
  subject_owner      uuid,
  grounds            text NOT NULL CHECK (length(btrim(grounds)) BETWEEN 16 AND 4000),
  disputed           jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(disputed) = 'array'),
  state              text NOT NULL CHECK (state IN ('open', 'under_review', 'upheld', 'dismissed', 'withdrawn')),
  opened_by          uuid NOT NULL,
  opened_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  review_by          timestamptz NOT NULL,
  reviewer           uuid,
  review_started_at  timestamptz,
  decided_by         uuid,
  decided_at         timestamptz,
  decision_note      text,
  withdrawn_at       timestamptz,
  withdrawal_reason  text,
  escalations        int  NOT NULL DEFAULT 0 CHECK (escalations BETWEEN 0 AND 5),
  escalated_at       timestamptz,
  request_id         uuid NOT NULL UNIQUE,
  correlation_id     uuid NOT NULL,
  CONSTRAINT gkc_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT gkc_review_bound CHECK ((reviewer IS NULL) = (review_started_at IS NULL) AND (state <> 'under_review' OR reviewer IS NOT NULL)),
  CONSTRAINT gkc_decided CHECK ((state IN ('upheld', 'dismissed')) = (decided_by IS NOT NULL AND decided_at IS NOT NULL AND decision_note IS NOT NULL)),
  CONSTRAINT gkc_withdrawn CHECK ((state = 'withdrawn') = (withdrawn_at IS NOT NULL AND withdrawal_reason IS NOT NULL)),
  -- SEPARATION OF DUTIES (HX-14): the reviewer and the decider are neither the opener nor the subject's owner; the opener is not the owner.
  CONSTRAINT gkc_separation CHECK ((reviewer IS NULL OR (reviewer <> opened_by AND reviewer IS DISTINCT FROM subject_owner))
                                   AND (decided_by IS NULL OR (decided_by <> opened_by AND decided_by IS DISTINCT FROM subject_owner))
                                   AND opened_by IS DISTINCT FROM subject_owner)
);
COMMENT ON TABLE graph.knowledge_challenges IS 'B50 §PV (0120; HX-14): the contest path of a decision-active intelligence product (a claim, an assessment, a warning, a forecast) — grounds, evidence, a reviewer who is neither the opener nor the owner, the outcome (upheld | dismissed | withdrawn), escalation when overdue on the database clock. A decision is contested through B35''s appeal or B36''s gate challenge, a run through B21''s simulation challenge (routed, never duplicated).';
CREATE UNIQUE INDEX gkc_one_live_per_opener ON graph.knowledge_challenges (subject_id, subject_version, opened_by) WHERE state IN ('open', 'under_review');
CREATE INDEX gkc_subject ON graph.knowledge_challenges (subject_id, subject_version, opened_at);
CREATE INDEX gkc_domain_state ON graph.knowledge_challenges (tenant_id, domain_id, state, review_by);

CREATE TABLE graph.knowledge_challenge_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  challenge_id       uuid NOT NULL REFERENCES graph.knowledge_challenges (challenge_id),
  event              text NOT NULL CHECK (event IN ('challenge.opened', 'challenge.review_started', 'challenge.evidence_submitted', 'challenge.upheld',
                                                    'challenge.dismissed', 'challenge.withdrawn', 'challenge.escalated')),
  actor_principal_id uuid NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT gkce_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX gkce_challenge ON graph.knowledge_challenge_events (challenge_id, occurred_at);
CREATE TRIGGER gkce_append_only BEFORE UPDATE OR DELETE ON graph.knowledge_challenge_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE graph.knowledge_challenge_evidence (
  evidence_id        uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  challenge_id       uuid NOT NULL REFERENCES graph.knowledge_challenges (challenge_id),
  ref                text NOT NULL,
  object_type        text NOT NULL,
  object_id          uuid NOT NULL,
  object_version     int  NOT NULL,
  object_digest      text NOT NULL CHECK (object_digest ~ '^[0-9a-f]{64}$'),
  note               text NOT NULL CHECK (length(btrim(note)) BETWEEN 8 AND 2000),
  party              text NOT NULL CHECK (party IN ('opener', 'owner', 'reviewer')),
  submitted_by       uuid NOT NULL,
  submitted_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT gkcv_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX gkcv_challenge ON graph.knowledge_challenge_evidence (challenge_id, submitted_at);
CREATE TRIGGER gkcv_append_only BEFORE UPDATE OR DELETE ON graph.knowledge_challenge_evidence FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* THE PROVENANCE AGENT (AG-014), 0060's registry shape: one active per domain, a principal of kind agent with ONE role. */
INSERT INTO identity.roles (code, scope, description) VALUES
  ('provenance_agent', 'DOMAIN',
   'Provenance agent (bounded, deterministic — no model) — constructs product lineage edges (graph.provenance_edges) from RECORDED lineage under a registered, revocable grant, and reports every gap where production history is incomplete; exactly graph.provenance.construct. Cannot mark fitness, decide a challenge, correct, approve or read evidence bytes.')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE graph.provenance_agents (
  agent_id            uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  principal_id        uuid NOT NULL UNIQUE,
  agent_version       text NOT NULL CHECK (agent_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  code_digest         text NOT NULL CHECK (code_digest ~ '^[0-9a-f]{64}$'),
  owner_principal_id  uuid NOT NULL,
  budgets             jsonb NOT NULL CHECK (jsonb_typeof(budgets) = 'object' AND budgets ? 'max_depth' AND budgets ? 'max_nodes'),
  status              text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_by          uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_at          timestamptz,
  revoked_by          uuid,
  revoke_reason       text,
  correlation_id      uuid NOT NULL,
  CONSTRAINT gpva_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT gpva_revoked CHECK ((status = 'revoked') = (revoked_at IS NOT NULL) AND (revoked_at IS NULL) = (revoked_by IS NULL) AND (revoked_at IS NULL) = (revoke_reason IS NULL))
);
CREATE UNIQUE INDEX gpva_one_active_per_domain ON graph.provenance_agents (tenant_id, domain_id) WHERE status = 'active';

CREATE TABLE graph.provenance_agent_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  agent_id           uuid NOT NULL REFERENCES graph.provenance_agents (agent_id),
  event              text NOT NULL CHECK (event IN ('agent.registered', 'agent.revoked')),
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_principal_id uuid NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id     uuid NOT NULL,
  CONSTRAINT gpvae_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE TRIGGER gpvae_append_only BEFORE UPDATE OR DELETE ON graph.provenance_agent_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* One construction run: the subject, what it constructed, what already stood, and EVERY gap it found (the agent cannot conceal). Append-only. */
CREATE TABLE graph.provenance_runs (
  run_id             uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  agent_id           uuid NOT NULL REFERENCES graph.provenance_agents (agent_id),
  principal_id       uuid NOT NULL,
  agent_version      text NOT NULL,
  code_digest        text NOT NULL,
  subject_type       text NOT NULL,
  subject_id         uuid NOT NULL,
  subject_version    int  NOT NULL,
  outcome            text NOT NULL CHECK (outcome IN ('complete', 'incomplete')),
  examined           int  NOT NULL CHECK (examined >= 0),
  edges_constructed  int  NOT NULL CHECK (edges_constructed >= 0),
  edges_existing     int  NOT NULL CHECK (edges_existing >= 0),
  gaps               jsonb NOT NULL CHECK (jsonb_typeof(gaps) = 'array'),
  truncated          boolean NOT NULL,
  budgets            jsonb NOT NULL,
  started_at         timestamptz NOT NULL,
  finished_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT gpvr_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT gpvr_incomplete CHECK ((outcome = 'incomplete') = (jsonb_array_length(gaps) > 0 OR truncated))
);
CREATE INDEX gpvr_subject ON graph.provenance_runs (subject_id, subject_version, finished_at DESC);
CREATE TRIGGER gpvr_append_only BEFORE UPDATE OR DELETE ON graph.provenance_runs FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* A constructed product lineage edge: the dependent version rests on the upstream version, on a recorded basis. Append-only, unique. */
CREATE TABLE graph.provenance_edges (
  edge_id            uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  dependent_type     text NOT NULL,
  dependent_id       uuid NOT NULL,
  dependent_version  int  NOT NULL,
  upstream_type      text NOT NULL,
  upstream_id        uuid NOT NULL,
  upstream_version   int  NOT NULL,
  basis              text NOT NULL CHECK (basis IN ('evidence_refs', 'source_object_ids', 'claim_lineage', 'correction_of', 'option_citation', 'publication_source')),
  span               jsonb CHECK (span IS NULL OR jsonb_typeof(span) = 'object'),
  version_resolution text NOT NULL CHECK (version_resolution IN ('recorded', 'latest_at_construction', 'evidence_digest')),
  run_id             uuid NOT NULL REFERENCES graph.provenance_runs (run_id) DEFERRABLE INITIALLY DEFERRED,
  constructed_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT gpve_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT gpve_one UNIQUE (dependent_id, dependent_version, upstream_id, upstream_version, basis)
);
CREATE INDEX gpve_dependent ON graph.provenance_edges (dependent_id, dependent_version);
CREATE INDEX gpve_upstream ON graph.provenance_edges (upstream_id, upstream_version);
CREATE TRIGGER gpve_append_only BEFORE UPDATE OR DELETE ON graph.provenance_edges FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

REVOKE ALL ON graph.product_fitness_marks, graph.knowledge_challenges, graph.knowledge_challenge_events, graph.knowledge_challenge_evidence,
              graph.provenance_agents, graph.provenance_agent_events, graph.provenance_runs, graph.provenance_edges FROM PUBLIC;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['product_fitness_marks', 'knowledge_challenges', 'knowledge_challenge_events', 'knowledge_challenge_evidence',
                           'provenance_agents', 'provenance_agent_events', 'provenance_runs', 'provenance_edges'] LOOP
    EXECUTE format('ALTER TABLE graph.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE graph.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY graph_isolation ON graph.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON graph.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- §PV.3 THE LINEAGE CLOSURE (internal; no grant — reached only from the definer ports below, which run as the owner) ────────────────────────
/* A recorded object of the tenant (this domain, or a tenant / platform object) by type, id and version; NULL version = the latest. */
CREATE OR REPLACE FUNCTION graph.pv_resolve(p_tenant uuid, p_domain uuid, p_type text, p_id uuid, p_version int) RETURNS objects.canonical_objects
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = objects, pg_catalog, pg_temp AS $$
  SELECT o.* FROM objects.canonical_objects o
   WHERE o.object_id = p_id AND (p_type IS NULL OR o.object_type = p_type) AND (p_version IS NULL OR o.object_version = p_version)
     AND ((o.tenant_id = p_tenant AND o.domain_id = p_domain) OR (o.tenant_id = p_tenant AND o.domain_id IS NULL) OR o.tenant_id IS NULL)
   ORDER BY o.object_version DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION graph.pv_resolve(uuid, uuid, text, uuid, int) FROM PUBLIC;

/* The direct upstream of one object version, as RECORDED: the header's evidence_refs and source_object_ids, its correction_of, a claim's
   lineage (the evidence version whose bytes digest the lineage names, with the byte span), a package version's option citations, a
   publication version's source. One row per distinct reference and basis. */
CREATE OR REPLACE FUNCTION graph.pv_upstream(p_tenant uuid, p_domain uuid, o objects.canonical_objects)
RETURNS TABLE (ref text, basis text, span jsonb, resolution text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, objects, intelligence, decision, executive, pg_catalog, pg_temp AS $$
DECLARE l intelligence.claim_lineage%ROWTYPE; v_evd int;
BEGIN
  RETURN QUERY SELECT DISTINCT r.v, 'evidence_refs'::text, NULL::jsonb, 'recorded'::text FROM jsonb_array_elements_text(coalesce(o.evidence_refs, '[]'::jsonb)) r(v);
  RETURN QUERY SELECT DISTINCT r.v, 'source_object_ids'::text, NULL::jsonb, 'recorded'::text FROM jsonb_array_elements_text(coalesce(o.source_object_ids, '[]'::jsonb)) r(v)
                WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(o.evidence_refs, '[]'::jsonb)) e(v) WHERE e.v = r.v);
  IF o.correction_of IS NOT NULL THEN
    RETURN QUERY SELECT o.object_type || ':' || o.correction_of, 'correction_of'::text, NULL::jsonb, 'recorded'::text;
  END IF;
  IF o.object_type = ANY (graph.pv_claim_types()) THEN
    SELECT * INTO l FROM intelligence.claim_lineage x WHERE x.claim_object_id = o.object_id AND x.claim_version = o.object_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    IF FOUND THEN
      SELECT e.object_version INTO v_evd FROM objects.canonical_objects e
       WHERE e.object_id = l.evidence_object_id AND e.object_type = 'EVD' AND e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.payload ->> 'content_digest' = l.evidence_digest
       ORDER BY e.object_version DESC LIMIT 1;
      RETURN QUERY SELECT 'EVD:' || l.evidence_object_id::text || CASE WHEN v_evd IS NULL THEN '' ELSE '@' || v_evd END, 'claim_lineage'::text,
                          jsonb_build_object('start', l.byte_start, 'end', l.byte_end, 'evidence_digest', l.evidence_digest), CASE WHEN v_evd IS NULL THEN 'latest_at_construction' ELSE 'evidence_digest' END;
    END IF;
  END IF;
  IF o.object_type = 'DPK' THEN
    RETURN QUERY SELECT DISTINCT (CASE c ->> 'kind' WHEN 'run' THEN 'SIM' WHEN 'forecast' THEN 'FCT' WHEN 'claim' THEN 'CLM' WHEN 'evidence' THEN 'EVD' WHEN 'assumption' THEN 'ASU' WHEN 'warning' THEN 'WRN' END)
                          || ':' || (c ->> 'id') || CASE WHEN (c ->> 'version') ~ '^[1-9][0-9]{0,8}$' THEN '@' || (c ->> 'version') ELSE '' END,
                          'option_citation'::text, jsonb_build_object('option', op.key), 'recorded'::text
                   FROM decision.options op CROSS JOIN LATERAL jsonb_array_elements(op.consequences) c
                  WHERE op.package_id = o.object_id AND op.version = o.object_version AND op.tenant_id = p_tenant AND op.domain_id = p_domain
                    AND c ->> 'kind' IN ('run', 'forecast', 'claim', 'evidence', 'assumption', 'warning');
  END IF;
  IF o.object_type = 'PUB' THEN
    RETURN QUERY SELECT DISTINCT (CASE pv.source_kind WHEN 'briefing' THEN 'BRF' ELSE 'DPK' END) || ':' || pv.source_id::text || '@' || pv.source_version,
                          'publication_source'::text, jsonb_build_object('publication_version', pv.version), 'recorded'::text
                   FROM executive.publication_versions pv
                  WHERE pv.publication_id = o.object_id AND pv.pub_object_version = o.object_version AND pv.tenant_id = p_tenant AND pv.domain_id = p_domain;
  END IF;
END $$;
REVOKE ALL ON FUNCTION graph.pv_upstream(uuid, uuid, objects.canonical_objects) FROM PUBLIC;

/* The custody and artifact identity of one evidence version: its manifest recorded in this domain under the same bytes digest, its byte
   integrity verified, and a custody chain that establishes it (acquired → admitted / imported / restored) with no integrity failure after the
   last establishing event. Answers {custody: intact | broken, artifact: verified | unverifiable, problems[], events[]}. */
CREATE OR REPLACE FUNCTION graph.pv_evd_custody(p_tenant uuid, p_domain uuid, o objects.canonical_objects) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, observation, objects, pg_catalog, pg_temp AS $$
DECLARE v_manifest uuid; v_digest text := o.payload ->> 'content_digest'; m observation.blob_manifests%ROWTYPE; v_problems jsonb := '[]'::jsonb;
        v_custody text := 'intact'; v_artifact text := 'verified'; v_last_ok timestamptz; v_failed timestamptz; v_events jsonb;
BEGIN
  IF coalesce(o.payload ->> 'manifest_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN v_manifest := (o.payload ->> 'manifest_id')::uuid; END IF;
  IF v_manifest IS NULL THEN
    v_artifact := 'unverifiable'; v_problems := v_problems || jsonb_build_array(jsonb_build_object('kind', 'unverifiable_artifact', 'reason', 'the evidence names no blob manifest'));
  ELSE
    SELECT * INTO m FROM observation.blob_manifests b WHERE b.manifest_id = v_manifest AND b.tenant_id = p_tenant AND b.domain_id = p_domain;
    IF NOT FOUND THEN
      v_artifact := 'unverifiable'; v_problems := v_problems || jsonb_build_array(jsonb_build_object('kind', 'unverifiable_artifact', 'reason', format('manifest %s is not recorded in this domain', v_manifest)));
    ELSIF m.content_digest IS DISTINCT FROM v_digest THEN
      v_artifact := 'unverifiable'; v_problems := v_problems || jsonb_build_array(jsonb_build_object('kind', 'unverifiable_artifact',
        'reason', format('the manifest records bytes digest %s; the evidence names %s', left(m.content_digest, 12), left(coalesce(v_digest, '<none>'), 12))));
    END IF;
  END IF;
  IF o.payload ? 'authenticity' AND coalesce(o.payload #>> '{authenticity,byte_integrity}', '') <> 'verified' THEN
    v_artifact := 'unverifiable'; v_problems := v_problems || jsonb_build_array(jsonb_build_object('kind', 'unverifiable_artifact',
      'reason', format('byte integrity is %s, not verified', coalesce(o.payload #>> '{authenticity,byte_integrity}', '<unstated>'))));
  END IF;
  SELECT max(e.occurred_at) INTO v_last_ok FROM observation.custody_events e
   WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND (e.evd_object_id = o.object_id OR (v_manifest IS NOT NULL AND e.manifest_id = v_manifest))
     AND e.event IN ('custody.admitted', 'custody.imported', 'custody.restored', 'custody.verified', 'custody.finalized')
     AND (e.content_digest IS NULL OR e.content_digest = v_digest);
  SELECT max(e.occurred_at) INTO v_failed FROM observation.custody_events e
   WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND (e.evd_object_id = o.object_id OR (v_manifest IS NOT NULL AND e.manifest_id = v_manifest))
     AND (e.event = 'custody.integrity_failed' OR e.digest_verified = false OR (e.content_digest IS NOT NULL AND e.content_digest <> v_digest));
  IF v_last_ok IS NULL THEN
    v_custody := 'broken'; v_problems := v_problems || jsonb_build_array(jsonb_build_object('kind', 'broken_custody', 'reason', 'no custody event establishes this evidence (admitted, imported, restored or verified under its digest)'));
  ELSIF v_failed IS NOT NULL AND v_failed >= v_last_ok THEN
    v_custody := 'broken'; v_problems := v_problems || jsonb_build_array(jsonb_build_object('kind', 'broken_custody',
      'reason', format('custody failed integrity at %s, after the last verified custody at %s', graph.pv_iso(v_failed), graph.pv_iso(v_last_ok))));
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('event', e.event, 'at', graph.pv_iso(e.occurred_at), 'actor', e.actor, 'digest_verified', e.digest_verified,
                                               'digest_matches', CASE WHEN e.content_digest IS NULL THEN NULL ELSE e.content_digest = v_digest END) ORDER BY e.occurred_at, e.event_id), '[]'::jsonb)
    INTO v_events FROM observation.custody_events e
   WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND (e.evd_object_id = o.object_id OR (v_manifest IS NOT NULL AND e.manifest_id = v_manifest));
  RETURN jsonb_build_object('custody', v_custody, 'artifact', v_artifact, 'manifest_id', v_manifest, 'bytes_digest', v_digest, 'problems', v_problems, 'events', v_events);
END $$;
REVOKE ALL ON FUNCTION graph.pv_evd_custody(uuid, uuid, objects.canonical_objects) FROM PUBLIC;

/* THE BACKWARD CLOSURE of one product version over recorded lineage, breadth first, bounded by depth and nodes. Answers
   {root, objects[{key, type, id, version, depth, digest, lifecycle, truth_state, synthetic, recorded_at, owner, method_ref, human_refs, audit_correlation_id, title}],
    edges[{from, to, ref, basis, span, resolution}], gaps[{kind, ref, at, reason}], truncated, examined} — or NULL when the root is not recorded.
   A gap is every reference that does not resolve, an extracted claim without its lineage, an evidence digest the lineage names that is not
   the evidence's, broken custody, an unverifiable artifact: kept, never dropped (DP-23-005 "the gap preserved"). */
CREATE OR REPLACE FUNCTION graph.pv_closure(p_tenant uuid, p_domain uuid, p_type text, p_id uuid, p_version int, p_max_depth int, p_max_nodes int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, objects, intelligence, observation, pg_catalog, pg_temp AS $$
DECLARE
  root objects.canonical_objects; o objects.canonical_objects; t objects.canonical_objects;
  v_queue jsonb; v_seen text[] := '{}'; v_objects jsonb := '[]'::jsonb; v_edges jsonb := '[]'::jsonb; v_gaps jsonb := '[]'::jsonb;
  v_truncated boolean := false; q jsonb; i int := 0; u record; r jsonb; v_key text; v_to text; v_depth int; c jsonb; l intelligence.claim_lineage%ROWTYPE; v_evd_digest text;
BEGIN
  root := graph.pv_resolve(p_tenant, p_domain, p_type, p_id, p_version);
  IF root.object_id IS NULL OR root.domain_id IS DISTINCT FROM p_domain THEN RETURN NULL; END IF;
  v_queue := jsonb_build_array(jsonb_build_object('type', root.object_type, 'id', root.object_id, 'version', root.object_version, 'depth', 0));
  WHILE i < jsonb_array_length(v_queue) LOOP
    q := v_queue -> i; i := i + 1;
    v_key := (q ->> 'type') || ':' || (q ->> 'id') || '@' || (q ->> 'version');
    CONTINUE WHEN v_key = ANY (v_seen);
    IF coalesce(array_length(v_seen, 1), 0) >= p_max_nodes THEN v_truncated := true; EXIT; END IF;
    v_seen := v_seen || v_key; v_depth := (q ->> 'depth')::int;
    o := graph.pv_resolve(p_tenant, p_domain, q ->> 'type', (q ->> 'id')::uuid, (q ->> 'version')::int);
    v_objects := v_objects || jsonb_build_array(jsonb_build_object('key', v_key, 'type', o.object_type, 'id', o.object_id, 'version', o.object_version, 'depth', v_depth,
      'digest', o.content_digest, 'lifecycle', o.lifecycle_state, 'truth_state', o.truth_state, 'synthetic', o.synthetic_state, 'recorded_at', graph.pv_iso(o.recorded_at),
      'owner', o.accountable_owner, 'owning_component', o.owning_component, 'method_ref', o.method_ref, 'human_refs', o.human_refs, 'audit_correlation_id', o.audit_correlation_id,
      'classification', o.classification,
      'title', left(coalesce(o.payload ->> 'title', o.payload ->> 'statement', o.payload ->> 'subject', o.payload ->> 'label', o.object_type || ' ' || o.object_id::text), 200)));
    -- an EXTRACTED claim carries its lineage row (0023 §5); its evidence digest is the evidence's bytes digest
    IF o.object_type = ANY (graph.pv_claim_types()) THEN
      SELECT * INTO l FROM intelligence.claim_lineage x WHERE x.claim_object_id = o.object_id AND x.claim_version = o.object_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
      IF NOT FOUND AND o.truth_state = 'extracted' THEN
        v_gaps := v_gaps || jsonb_build_array(jsonb_build_object('kind', 'incomplete_lineage', 'ref', v_key, 'at', v_key, 'reason', 'an extracted claim without its lineage row (no evidence span, no method, no admission decision)'));
      ELSIF FOUND THEN
        SELECT e.payload ->> 'content_digest' INTO v_evd_digest FROM objects.canonical_objects e
         WHERE e.object_id = l.evidence_object_id AND e.object_type = 'EVD' AND e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.payload ->> 'content_digest' = l.evidence_digest LIMIT 1;
        IF v_evd_digest IS NULL THEN
          v_gaps := v_gaps || jsonb_build_array(jsonb_build_object('kind', 'unverifiable_artifact', 'ref', 'EVD:' || l.evidence_object_id, 'at', v_key,
            'reason', format('the lineage names evidence bytes %s; no version of evidence %s in this domain carries them', left(l.evidence_digest, 12), l.evidence_object_id)));
        END IF;
      END IF;
    END IF;
    IF o.object_type = 'EVD' THEN
      c := graph.pv_evd_custody(p_tenant, p_domain, o);
      FOR r IN SELECT * FROM jsonb_array_elements(c -> 'problems') LOOP
        v_gaps := v_gaps || jsonb_build_array(jsonb_build_object('kind', r ->> 'kind', 'ref', v_key, 'at', v_key, 'reason', r ->> 'reason'));
      END LOOP;
    END IF;
    FOR u IN SELECT * FROM graph.pv_upstream(p_tenant, p_domain, o) LOOP
      r := graph.pv_ref(u.ref);
      v_to := NULL;
      IF r ->> 'form' = 'manifest' THEN
        IF NOT EXISTS (SELECT 1 FROM observation.blob_manifests b WHERE b.manifest_id = (r ->> 'id')::uuid AND b.tenant_id = p_tenant AND b.domain_id = p_domain) THEN
          v_gaps := v_gaps || jsonb_build_array(jsonb_build_object('kind', 'unverifiable_artifact', 'ref', u.ref, 'at', v_key, 'reason', 'the artifact manifest is not recorded in this domain'));
        END IF;
        v_edges := v_edges || jsonb_build_array(jsonb_build_object('from', v_key, 'to', NULL, 'ref', u.ref, 'basis', u.basis, 'span', u.span, 'resolution', 'artifact'));
        CONTINUE;
      ELSIF r ->> 'form' = 'opaque' THEN
        v_edges := v_edges || jsonb_build_array(jsonb_build_object('from', v_key, 'to', NULL, 'ref', u.ref, 'basis', u.basis, 'span', u.span, 'resolution', 'opaque'));
        CONTINUE;
      END IF;
      t := graph.pv_resolve(p_tenant, p_domain, r ->> 'type', (r ->> 'id')::uuid, (r ->> 'version')::int);
      IF t.object_id IS NULL THEN
        v_gaps := v_gaps || jsonb_build_array(jsonb_build_object('kind', 'incomplete_lineage', 'ref', u.ref, 'at', v_key, 'reason', format('%s does not resolve to a recorded object of this tenant (basis %s)', u.ref, u.basis)));
        v_edges := v_edges || jsonb_build_array(jsonb_build_object('from', v_key, 'to', NULL, 'ref', u.ref, 'basis', u.basis, 'span', u.span, 'resolution', 'unresolved'));
        CONTINUE;
      END IF;
      v_to := t.object_type || ':' || t.object_id || '@' || t.object_version;
      v_edges := v_edges || jsonb_build_array(jsonb_build_object('from', v_key, 'to', v_to, 'ref', u.ref, 'basis', u.basis, 'span', u.span,
        'resolution', CASE WHEN u.resolution <> 'recorded' THEN u.resolution WHEN r ->> 'version' IS NULL THEN 'latest_at_construction' ELSE 'recorded' END));
      IF v_depth + 1 > p_max_depth THEN v_truncated := true; CONTINUE; END IF;
      IF NOT (v_to = ANY (v_seen)) THEN
        v_queue := v_queue || jsonb_build_array(jsonb_build_object('type', t.object_type, 'id', t.object_id, 'version', t.object_version, 'depth', v_depth + 1));
      END IF;
    END LOOP;
  END LOOP;
  IF i < jsonb_array_length(v_queue) THEN v_truncated := true; END IF;
  RETURN jsonb_build_object('root', root.object_type || ':' || root.object_id || '@' || root.object_version, 'objects', v_objects, 'edges', v_edges, 'gaps', v_gaps,
                            'truncated', v_truncated, 'examined', jsonb_array_length(v_objects), 'bounds', jsonb_build_object('max_depth', p_max_depth, 'max_nodes', p_max_nodes));
END $$;
REVOKE ALL ON FUNCTION graph.pv_closure(uuid, uuid, text, uuid, int, int, int) FROM PUBLIC;

/* The FORWARD side as a read-only PREVIEW (never a recorded walk; the walk's buckets and classes are §CI's graph.affected_products): what
   names this object today — claims whose lineage reads it, constructed edges, package options citing it, briefings and publications sourced
   on it, declared strategy dependencies on it, and the invalidations already recorded for it. Bounded (50 per bucket). */
CREATE OR REPLACE FUNCTION graph.pv_downstream(p_tenant uuid, p_domain uuid, p_type text, p_id uuid, p_version int) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = graph, objects, intelligence, decision, executive, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('preview', true, 'note', 'a read-only preview of what names this version today; the recorded impact walk (its buckets and affected classes) is graph.record_impact / graph.affected_products',
    'claims', (SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'ref'), '[]'::jsonb) FROM (SELECT jsonb_build_object('ref', l.claim_type || ':' || l.claim_object_id || '@' || l.claim_version, 'span', jsonb_build_object('start', l.byte_start, 'end', l.byte_end)) x
                 FROM intelligence.claim_lineage l WHERE p_type = 'EVD' AND l.evidence_object_id = p_id AND l.tenant_id = p_tenant AND l.domain_id = p_domain LIMIT 50) s),
    'constructed', (SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'ref'), '[]'::jsonb) FROM (SELECT jsonb_build_object('ref', e.dependent_type || ':' || e.dependent_id || '@' || e.dependent_version, 'basis', e.basis) x
                 FROM graph.provenance_edges e WHERE e.upstream_id = p_id AND (p_version IS NULL OR e.upstream_version = p_version) AND e.tenant_id = p_tenant AND e.domain_id = p_domain LIMIT 50) s),
    'options', (SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'ref'), '[]'::jsonb) FROM (SELECT jsonb_build_object('ref', 'DPK:' || op.package_id || '@' || op.version, 'option', op.key) x
                 FROM decision.options op WHERE op.tenant_id = p_tenant AND op.domain_id = p_domain AND EXISTS (SELECT 1 FROM jsonb_array_elements(op.consequences) c WHERE c ->> 'id' = p_id::text) LIMIT 50) s),
    'briefings', (SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'ref'), '[]'::jsonb) FROM (SELECT jsonb_build_object('ref', 'BRF:' || b.object_id || '@' || b.object_version) x
                 FROM objects.canonical_objects b WHERE b.object_type = 'BRF' AND b.tenant_id = p_tenant AND b.domain_id = p_domain
                  AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(b.source_object_ids || b.evidence_refs) s WHERE position(p_id::text in s) > 0) LIMIT 50) s),
    'publications', (SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'ref'), '[]'::jsonb) FROM (SELECT jsonb_build_object('ref', 'PUB:' || pv.publication_id || ' v' || pv.version, 'state', pv.state) x
                 FROM executive.publication_versions pv WHERE pv.source_id = p_id AND pv.tenant_id = p_tenant AND pv.domain_id = p_domain LIMIT 50) s),
    'strategy', (SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'ref'), '[]'::jsonb) FROM (SELECT jsonb_build_object('ref', d.dependent_type || ':' || d.dependent_object_id, 'rationale', d.rationale) x
                 FROM graph.dependencies d WHERE d.depends_on_id = p_id AND d.state = 'active' AND d.tenant_id = p_tenant AND d.domain_id = p_domain LIMIT 50) s),
    'invalidations', (SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'opened_at'), '[]'::jsonb) FROM (SELECT jsonb_build_object('invalidation_id', v.invalidation_id, 'trigger_kind', v.trigger_kind, 'state', v.state,
                 'opened_at', graph.pv_iso(v.opened_at), 'correction_case_id', v.correction_case_id, 'statement', v.statement,
                 'affected', jsonb_build_object('assumptions', v.affected_assumptions, 'objectives', v.affected_objectives, 'decisions', v.affected_decisions, 'commitments', v.affected_commitments)) x
                 FROM graph.invalidations_current v WHERE v.trigger_object_id = p_id AND v.tenant_id = p_tenant AND v.domain_id = p_domain LIMIT 50) s))
$$;
REVOKE ALL ON FUNCTION graph.pv_downstream(uuid, uuid, text, uuid, int) FROM PUBLIC;

-- §PV.4 graph.explain ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* THE BACKWARD PATH of one product version (V03-T-194, ES-28-004, AI-06-003, AI-29-004). Object nodes from the closure (the product, its
   claims, evidence, sources); for each, the nodes of what produced or contested it — its method; the extraction run, the model gateway
   call (model, weights, prompt version), the retrieval and admission policy decisions and the review case of a claim; the abstentions of
   the same run; the PDP denials naming it; the knowledge, simulation and decision challenges and appeals on it; a package's approvals,
   signatures, gate actions, overrides, agent runs and recorded PDP denials; a forecast's fitness assessments and withdrawal; a run's
   failure or invalidation; the corrections recorded on it; the fitness marks; the provenance agent's runs; the propagation attempts; the
   memory reads; the audit request (synchronous) and the outbox event (event) of its write. Each node carries its OUTCOME — ok, denied,
   abstained, challenged, overridden, corrected, failed, unresolved — and its BOUNDARY; the tool boundary is carried (B70). An object node's
   `parents` are what it rests on: its upstream objects and the nodes of its production and contest. STABLE; read scope enforced. */
CREATE OR REPLACE FUNCTION graph.explain(p_tenant uuid, p_domain uuid, p_type text, p_id uuid, p_version int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, objects, intelligence, observation, decision, executive, simulation, prediction, memory, policy, audit, pg_catalog, pg_temp AS $$
DECLARE
  cl jsonb; ob jsonb; e jsonb; g jsonb; x record; y record; v_nodes jsonb := '[]'::jsonb; v_ids text[] := '{}'; v_attach jsonb := '{}'::jsonb;
  v_key text; v_oid uuid; v_ver int; v_type text; v_corr uuid; v_n int := 0; v_out jsonb := '[]'::jsonb; v_parents jsonb; v_root jsonb;
  v_counts jsonb; v_bounds jsonb; v_kind text; l intelligence.claim_lineage%ROWTYPE; v_node jsonb; v_gid text;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the explanation of a product');
  IF p_type IS NULL OR p_type !~ '^[A-Z]{3}$' OR p_id IS NULL OR p_version IS NULL OR p_version < 1 THEN
    RAISE EXCEPTION 'provenance rejected (subject): an explanation names a recorded product as type (three capitals), id and version' USING ERRCODE = '22023';
  END IF;
  cl := graph.pv_closure(p_tenant, p_domain, p_type, p_id, p_version, 12, 400);
  IF cl IS NULL THEN
    RAISE EXCEPTION 'provenance rejected (unknown_object): % % v% is not recorded in this domain', p_type, p_id, p_version USING ERRCODE = '23503';
  END IF;
  FOR ob IN SELECT * FROM jsonb_array_elements(cl -> 'objects') LOOP
    v_key := ob ->> 'key'; v_oid := (ob ->> 'id')::uuid; v_ver := (ob ->> 'version')::int; v_type := ob ->> 'type'; v_corr := (ob ->> 'audit_correlation_id')::uuid;
    -- (a) the method
    IF ob ->> 'method_ref' IS NOT NULL THEN
      v_gid := 'method:' || (ob ->> 'method_ref');
      IF NOT (v_gid = ANY (v_ids)) THEN v_ids := v_ids || v_gid; v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'method', ob ->> 'method_ref', 'method ' || (ob ->> 'method_ref'), 'ok', NULL, NULL, NULL, NULL)); END IF;
      v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
    END IF;
    -- (b) the people named on the version (human boundary)
    FOR x IN SELECT DISTINCT h.v FROM jsonb_array_elements_text(coalesce(ob -> 'human_refs', '[]'::jsonb)) h(v) LOOP
      v_gid := 'human:' || x.v || ':' || v_key; v_ids := v_ids || v_gid;
      v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'human_action', x.v, 'recorded by a named person', 'ok', (ob ->> 'recorded_at')::timestamptz, x.v, NULL, 'human'));
      v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
    END LOOP;
    -- (c) the request that wrote it (synchronous boundary: the audit correlation) and the event it published (event boundary: the outbox causation)
    FOR x IN SELECT ae.partition_id, ae.audit_seq, ae.action, ae.actor, ae.outcome, ae.occurred_at FROM audit.audit_events ae
              WHERE ae.correlation_id = v_corr AND ae.tenant_id = p_tenant ORDER BY ae.audit_seq LIMIT 4 LOOP
      v_gid := 'audit:' || x.partition_id || ':' || x.audit_seq;
      IF NOT (v_gid = ANY (v_ids)) THEN v_ids := v_ids || v_gid;
        v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'human_action', 'audit:' || x.audit_seq, 'request ' || x.action || ' (' || x.outcome || ')',
          CASE WHEN x.outcome = 'success' THEN 'ok' WHEN x.outcome = 'denied' THEN 'denied' ELSE 'failed' END, graph.revision_instant(x.occurred_at), x.actor, NULL, 'synchronous')); END IF;
      v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
    END LOOP;
    FOR x IN SELECT ob2.id, ob2.event_type, ob2.status, ob2.created_at FROM objects.object_outbox ob2 WHERE ob2.correlation_id = v_corr AND ob2.tenant_id = p_tenant ORDER BY ob2.created_at LIMIT 4 LOOP
      v_gid := 'event:' || x.id;
      IF NOT (v_gid = ANY (v_ids)) THEN v_ids := v_ids || v_gid;
        v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'workflow', 'outbox:' || x.id, 'event ' || x.event_type || ' (' || x.status || ')', CASE WHEN x.status = 'failed' THEN 'failed' ELSE 'ok' END, x.created_at, NULL, NULL, 'event')); END IF;
      v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
    END LOOP;
    -- (d) a claim: its lineage — the extraction run (agent), the gateway call (model), the two policy decisions, the review case, the run's abstentions
    IF v_type = ANY (graph.pv_claim_types()) THEN
      SELECT * INTO l FROM intelligence.claim_lineage z WHERE z.claim_object_id = v_oid AND z.claim_version = v_ver AND z.tenant_id = p_tenant AND z.domain_id = p_domain;
      IF FOUND THEN
        v_gid := 'xmethod:' || l.method_id;
        IF NOT (v_gid = ANY (v_ids)) THEN v_ids := v_ids || v_gid;
          SELECT m.name, m.method_key, m.method_version, m.lifecycle_state INTO y FROM intelligence.methods_current m WHERE m.method_id = l.method_id;
          v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'method', 'method:' || l.method_id, CASE WHEN y.method_key IS NULL THEN 'extraction method ' || l.method_id ELSE 'extraction method ' || y.method_key || ' v' || y.method_version || ' (' || y.lifecycle_state || ')' END,
            CASE WHEN y.method_key IS NULL THEN 'unresolved' ELSE 'ok' END, NULL, NULL, NULL, NULL)); END IF;
        v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
        v_gid := 'run:' || l.run_id;
        IF NOT (v_gid = ANY (v_ids)) THEN v_ids := v_ids || v_gid;
          SELECT bool_or(re.event IN ('run.failed', 'run.budget_exceeded')) failed, bool_or(re.event = 'run.abstained') abstained, max(re.occurred_at) at, count(*) n INTO y
            FROM intelligence.run_events re WHERE re.run_id = l.run_id AND re.tenant_id = p_tenant;
          v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'agent_run', 'extraction-run:' || l.run_id, 'extraction run ' || l.run_id || ' (' || l.mode || ')',
            CASE WHEN coalesce(y.failed, false) THEN 'failed' WHEN coalesce(y.abstained, false) THEN 'abstained' WHEN coalesce(y.n, 0) = 0 THEN 'unresolved' ELSE 'ok' END, y.at, NULL, NULL, 'agent')); END IF;
        v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
        IF l.call_id IS NOT NULL THEN
          v_gid := 'model:' || l.call_id;
          IF NOT (v_gid = ANY (v_ids)) THEN v_ids := v_ids || v_gid;
            SELECT gc.model_id, gc.prompt_version, gc.runtime_version, gc.outcome, gc.occurred_at INTO y FROM intelligence.gateway_calls gc WHERE gc.call_id = l.call_id;
            v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'model_call', 'gateway:' || l.call_id,
              CASE WHEN y.model_id IS NULL THEN 'model call (not recorded)' ELSE 'model ' || y.model_id || ' · prompt ' || y.prompt_version || ' · runtime ' || y.runtime_version || ' (' || y.outcome || ')' END,
              CASE y.outcome WHEN 'completed' THEN 'ok' WHEN 'abstained' THEN 'abstained' WHEN 'refused' THEN 'denied' WHEN 'failed' THEN 'failed' ELSE 'unresolved' END, y.occurred_at, NULL, NULL, 'model')); END IF;
          v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
        END IF;
        FOR x IN SELECT d.id, d.decision, d.action, d.reason, d.created_at, d.principal_id FROM policy.policy_decisions d WHERE d.id IN (l.retrieval_decision_id, l.admission_decision_id) LOOP
          v_gid := 'policy:' || x.id;
          IF NOT (v_gid = ANY (v_ids)) THEN v_ids := v_ids || v_gid;
            v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'policy_decision', 'policy:' || x.id, 'policy ' || x.action || ': ' || x.decision, CASE WHEN x.decision IN ('allow', 'allow_with_obligations') THEN 'ok' ELSE 'denied' END, x.created_at, x.principal_id, NULL, 'synchronous')); END IF;
          v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
        END LOOP;
        FOR x IN SELECT rc.case_id, rc.state, rc.queued_reason, rc.decision_reason, rc.decided_at, rc.opened_at, rc.decider_principal_id, rc.claim_object_id FROM intelligence.review_current rc
                  WHERE (rc.claim_object_id = v_oid AND rc.claim_version = v_ver) OR (rc.run_id = l.run_id AND rc.queued_reason = 'abstained') ORDER BY rc.opened_at LIMIT 20 LOOP
          v_gid := 'review:' || x.case_id;
          IF NOT (v_gid = ANY (v_ids)) THEN v_ids := v_ids || v_gid;
            v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'review', 'review:' || x.case_id,
              CASE WHEN x.claim_object_id IS NULL THEN 'the extraction ABSTAINED in this run (' || x.state || ')' ELSE 'review ' || x.state || ' (' || x.queued_reason || ')' || coalesce(': ' || x.decision_reason, '') END,
              CASE WHEN x.claim_object_id IS NULL THEN 'abstained' WHEN x.state = 'approved' THEN 'ok' WHEN x.state = 'rejected' THEN 'denied' WHEN x.state = 'corrected' THEN 'corrected' ELSE 'unresolved' END,
              coalesce(x.decided_at, x.opened_at), x.decider_principal_id::text, NULL, 'human')); END IF;
          v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
        END LOOP;
        FOR x IN SELECT gc.call_id, gc.outcome, gc.occurred_at, gc.model_id FROM intelligence.gateway_calls gc WHERE gc.run_id = l.run_id AND gc.outcome IN ('abstained', 'refused', 'failed') AND gc.call_id IS DISTINCT FROM l.call_id LIMIT 10 LOOP
          v_gid := 'model:' || x.call_id;
          IF NOT (v_gid = ANY (v_ids)) THEN v_ids := v_ids || v_gid;
            v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'model_call', 'gateway:' || x.call_id, 'a model call of the same run ' || x.outcome || ' (' || x.model_id || ')',
              CASE x.outcome WHEN 'abstained' THEN 'abstained' WHEN 'refused' THEN 'denied' ELSE 'failed' END, x.occurred_at, NULL, NULL, 'model')); END IF;
          v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
        END LOOP;
      END IF;
    END IF;
    -- (e) the PDP denials naming the object (a denied path, not only audit)
    FOR x IN SELECT d.id, d.decision, d.action, d.reason, d.created_at, d.principal_id FROM policy.policy_decisions d
              WHERE d.object_id = v_oid AND d.tenant_id = p_tenant AND d.decision IN ('deny', 'indeterminate') ORDER BY d.created_at LIMIT 20 LOOP
      v_gid := 'policy:' || x.id;
      IF NOT (v_gid = ANY (v_ids)) THEN v_ids := v_ids || v_gid;
        v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'policy_decision', 'policy:' || x.id, 'denied: ' || x.action || ' — ' || left(x.reason, 200), 'denied', x.created_at, x.principal_id, NULL, 'synchronous')); END IF;
      v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
    END LOOP;
    -- (f) the contest: knowledge challenges (§PV.8), simulation challenges (B21), decision challenges (B36), appeals (B35)
    FOR x IN SELECT k.challenge_id, k.state, k.grounds, k.opened_at, k.opened_by, k.decided_at FROM graph.knowledge_challenges k WHERE k.subject_id = v_oid AND k.subject_version = v_ver AND k.tenant_id = p_tenant ORDER BY k.opened_at LOOP
      v_gid := 'challenge:' || x.challenge_id; v_ids := v_ids || v_gid;
      v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'review', 'knowledge-challenge:' || x.challenge_id, 'knowledge challenge ' || x.state || ': ' || left(x.grounds, 160),
        CASE WHEN x.state IN ('open', 'under_review', 'upheld') THEN 'challenged' ELSE 'ok' END, coalesce(x.decided_at, x.opened_at), x.opened_by::text, NULL, 'human'));
      v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
    END LOOP;
    IF v_type = 'SIM' THEN
      FOR x IN SELECT s.challenge_id, s.state, s.kind, s.opened_at, s.opened_by FROM simulation.challenges s WHERE s.run_id = v_oid AND s.tenant_id = p_tenant ORDER BY s.opened_at LOOP
        v_gid := 'simchallenge:' || x.challenge_id; v_ids := v_ids || v_gid;
        v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'review', 'simulation-challenge:' || x.challenge_id, 'simulation challenge (' || x.kind || ') ' || x.state,
          CASE WHEN x.state IN ('open', 'rerun_requested', 'upheld') THEN 'challenged' ELSE 'ok' END, x.opened_at, x.opened_by::text, NULL, 'human'));
        v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
      END LOOP;
      FOR x IN SELECT r.state, r.validity, r.invalidated_at, r.invalidation, r.operator_principal_id, r.opened_at FROM simulation.runs_current r WHERE r.run_id = v_oid AND r.tenant_id = p_tenant LOOP
        v_gid := 'simrun:' || v_oid; v_ids := v_ids || v_gid;
        v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'agent_run', 'simulation-run:' || v_oid, 'simulation run ' || x.state || CASE WHEN x.validity = 'invalidated' THEN ', invalidated (' || coalesce(x.invalidation ->> 'trigger', '?') || ')' ELSE '' END,
          CASE WHEN x.state = 'failed' THEN 'failed' WHEN x.validity = 'invalidated' THEN 'corrected' WHEN x.state IN ('opened', 'partial') THEN 'unresolved' ELSE 'ok' END, coalesce(x.invalidated_at, x.opened_at), x.operator_principal_id::text, NULL, 'workflow'));
        v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
      END LOOP;
    END IF;
    FOR x IN SELECT a.case_id, a.state, a.outcome, a.opened_at, a.appellant_principal_id FROM decision.appeal_cases a WHERE a.subject_id = v_oid AND a.tenant_id = p_tenant ORDER BY a.opened_at LIMIT 10 LOOP
      v_gid := 'appeal:' || x.case_id; v_ids := v_ids || v_gid;
      v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'review', 'appeal:' || x.case_id, 'appeal ' || x.state || coalesce(' (' || x.outcome || ')', ''),
        CASE WHEN x.outcome = 'dismissed' THEN 'ok' ELSE 'challenged' END, x.opened_at, x.appellant_principal_id::text, NULL, 'human'));
      v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
    END LOOP;
    -- (g) a decision package version: approvals, signatures, gate actions (workflow), overrides, challenges, recorded PDP denials, agent runs
    IF v_type = 'DPK' THEN
      FOR x IN SELECT a.approval_id, a.decision, a.revoked_at, a.recorded_at, a.approver_principal_id, a.eligible_by FROM decision.approvals a WHERE a.package_id = v_oid AND a.version = v_ver ORDER BY a.recorded_at LOOP
        v_gid := 'approval:' || x.approval_id; v_ids := v_ids || v_gid;
        v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'approval', 'approval:' || x.approval_id, x.decision || ' by ' || x.eligible_by || CASE WHEN x.revoked_at IS NULL THEN '' ELSE ' — revoked' END,
          CASE WHEN x.revoked_at IS NOT NULL THEN 'overridden' WHEN x.decision = 'reject' THEN 'denied' ELSE 'ok' END, x.recorded_at, x.approver_principal_id::text, NULL, 'human'));
        v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
      END LOOP;
      FOR x IN SELECT s.signature_id, s.subject_kind, s.bound_action, s.signed_at, s.signer, s.key_id FROM executive.signatures s
                WHERE s.tenant_id = p_tenant AND ((s.subject_id = v_oid AND s.subject_version = v_ver) OR s.subject_id IN (SELECT a.approval_id FROM decision.approvals a WHERE a.package_id = v_oid AND a.version = v_ver)) ORDER BY s.signed_at LOOP
        v_gid := 'signature:' || x.signature_id; v_ids := v_ids || v_gid;
        v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'signature', 'signature:' || x.signature_id, 'signed (' || x.subject_kind || ', ' || x.bound_action || ', key ' || x.key_id || ')', 'ok', x.signed_at, x.signer::text, NULL, 'human'));
        v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
      END LOOP;
      FOR x IN SELECT ga.action_id, ga.action, ga.from_state, ga.to_state, ga.at, ga.actor_principal_id FROM decision.gate_actions ga WHERE ga.package_id = v_oid AND ga.version = v_ver ORDER BY ga.at LOOP
        v_gid := 'gate:' || x.action_id; v_ids := v_ids || v_gid;
        v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'workflow', 'gate-action:' || x.action_id, 'gate ' || x.action || ' (' || x.from_state || ' → ' || x.to_state || ')',
          CASE WHEN x.action = 'reject' THEN 'denied' ELSE 'ok' END, x.at, x.actor_principal_id::text, NULL, 'workflow'));
        v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
      END LOOP;
      FOR x IN SELECT go.override_id, go.kind, go.granted_by, go.expires_at FROM decision.gate_overrides go WHERE go.package_id = v_oid AND go.version = v_ver LOOP
        v_gid := 'override:' || x.override_id; v_ids := v_ids || v_gid;
        v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'approval', 'gate-override:' || x.override_id, x.kind || ' override of the gate', 'overridden', NULL, x.granted_by::text, NULL, 'human'));
        v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
      END LOOP;
      FOR x IN SELECT dc.challenge_id, dc.resolution, dc.raised_at, dc.challenger_principal_id FROM decision.challenges dc WHERE dc.package_id = v_oid AND dc.version = v_ver ORDER BY dc.raised_at LOOP
        v_gid := 'dchallenge:' || x.challenge_id; v_ids := v_ids || v_gid;
        v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'review', 'decision-challenge:' || x.challenge_id, 'gate challenge ' || coalesce(x.resolution, 'raised'),
          CASE WHEN x.resolution = 'dismissed' THEN 'ok' ELSE 'challenged' END, x.raised_at, x.challenger_principal_id::text, NULL, 'human'));
        v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
      END LOOP;
      FOR x IN SELECT pd.denial_id, pd.action, pd.reason, pd.denied_at, pd.principal_id FROM decision.pdp_denials pd WHERE pd.package_id = v_oid AND (pd.package_version IS NULL OR pd.package_version = v_ver) ORDER BY pd.denied_at LIMIT 20 LOOP
        v_gid := 'pdpdenial:' || x.denial_id; v_ids := v_ids || v_gid;
        v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'policy_decision', 'pdp-denial:' || x.denial_id, 'denied: ' || x.action || ' — ' || left(x.reason, 200), 'denied', x.denied_at, x.principal_id::text, NULL, 'synchronous'));
        v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
      END LOOP;
      FOR x IN SELECT ar.run_id, ar.task, ar.outcome, ar.agent_kind, ar.agent_version, ar.started_at, ar.principal_id FROM executive.agent_runs ar WHERE ar.package_id = v_oid AND ar.tenant_id = p_tenant ORDER BY ar.started_at LIMIT 10 LOOP
        v_gid := 'agentrun:' || x.run_id; v_ids := v_ids || v_gid;
        v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'agent_run', 'agent-run:' || x.run_id, x.agent_kind || '@' || x.agent_version || ' ' || x.task || ' (' || x.outcome || ')',
          CASE x.outcome WHEN 'faulted' THEN 'failed' WHEN 'refused' THEN 'denied' WHEN 'finished' THEN 'ok' ELSE 'unresolved' END, x.started_at, x.principal_id::text, NULL, 'agent'));
        v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
      END LOOP;
    END IF;
    -- (h) a forecast: its fitness assessments (the evaluator, B21) and its withdrawal
    IF v_type = 'FCT' THEN
      FOR x IN SELECT fa.assessment_id, fa.verdict, fa.fitness_class, fa.rule_version, fa.assessed_at, fa.assessed_by FROM prediction.forecast_fitness_assessments fa WHERE fa.forecast_id = v_oid AND fa.tenant_id = p_tenant ORDER BY fa.assessed_at LIMIT 10 LOOP
        v_gid := 'fitness-assessment:' || x.assessment_id; v_ids := v_ids || v_gid;
        v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'review', 'forecast-fitness:' || x.assessment_id, 'fitness ' || x.verdict || coalesce(' (' || x.fitness_class || ')', '') || ' under ' || x.rule_version,
          CASE x.verdict WHEN 'fit' THEN 'ok' WHEN 'unfit' THEN 'failed' ELSE 'unresolved' END, x.assessed_at, x.assessed_by::text, NULL, 'synchronous'));
        v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
      END LOOP;
    END IF;
    -- (i) the corrections: a later version correcting this one, the invalidations recorded on it
    FOR x IN SELECT c2.object_version, c2.recorded_at, c2.lifecycle_state, c2.withdrawal_reason FROM objects.canonical_objects c2
              WHERE c2.object_id = v_oid AND c2.object_version > v_ver AND (c2.correction_of = v_oid::text || '@' || v_ver OR c2.supersedes = v_oid::text || '@' || v_ver OR c2.lifecycle_state IN ('corrected', 'withdrawn'))
              ORDER BY c2.object_version LIMIT 5 LOOP
      v_gid := 'correction:' || v_oid || '@' || x.object_version; v_ids := v_ids || v_gid;
      v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'correction', v_type || ':' || v_oid || '@' || x.object_version, 'a later version ' || x.object_version || ' is ' || x.lifecycle_state || coalesce(': ' || x.withdrawal_reason, ''), 'corrected', x.recorded_at, NULL, NULL, NULL));
      v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
    END LOOP;
    FOR x IN SELECT iv.invalidation_id, iv.trigger_kind, iv.state, iv.opened_at, iv.opened_by FROM graph.invalidations_current iv WHERE iv.trigger_object_id = v_oid AND iv.tenant_id = p_tenant ORDER BY iv.opened_at LIMIT 10 LOOP
      v_gid := 'invalidation:' || x.invalidation_id; v_ids := v_ids || v_gid;
      v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'correction', 'invalidation:' || x.invalidation_id, 'impact recorded: ' || x.trigger_kind || ' (' || x.state || ')', 'corrected', x.opened_at, x.opened_by::text, NULL, NULL));
      v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
    END LOOP;
    -- (j) the fitness marks (the evaluator's rule, recorded by a person) and the provenance agent's runs on it (agent)
    FOR x IN SELECT fm.mark_id, fm.verdict, fm.reasons, fm.rule_version, fm.marked_at, fm.marked_by FROM graph.product_fitness_marks fm WHERE fm.object_id = v_oid AND fm.object_version = v_ver AND fm.tenant_id = p_tenant ORDER BY fm.marked_at LOOP
      v_gid := 'fitness-mark:' || x.mark_id; v_ids := v_ids || v_gid;
      v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'review', 'fitness-mark:' || x.mark_id, 'fitness ' || x.verdict || CASE WHEN cardinality(x.reasons) > 0 THEN ' (' || array_to_string(x.reasons, ', ') || ')' ELSE '' END || ' under ' || x.rule_version,
        CASE x.verdict WHEN 'fit' THEN 'ok' WHEN 'unfit' THEN 'failed' ELSE 'unresolved' END, x.marked_at, x.marked_by::text, NULL, 'human'));
      v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
    END LOOP;
    FOR x IN SELECT pr.run_id, pr.outcome, pr.edges_constructed, pr.finished_at, pr.principal_id, pr.agent_version FROM graph.provenance_runs pr WHERE pr.subject_id = v_oid AND pr.subject_version = v_ver AND pr.tenant_id = p_tenant ORDER BY pr.finished_at DESC LIMIT 3 LOOP
      v_gid := 'provenance-run:' || x.run_id; v_ids := v_ids || v_gid;
      v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'agent_run', 'provenance-run:' || x.run_id, 'provenance agent ' || x.agent_version || ': ' || x.outcome || ' (' || x.edges_constructed || ' edges constructed)',
        CASE x.outcome WHEN 'complete' THEN 'ok' ELSE 'unresolved' END, x.finished_at, x.principal_id::text, NULL, 'agent'));
      v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
    END LOOP;
    -- (k) the propagation agent's attempts that walked it (agent) and the memory reads of it (context)
    FOR x IN SELECT pa.event_id, pa.state, pa.last_delivered_at, pa.principal_id FROM graph.propagation_attempts pa WHERE pa.tenant_id = p_tenant AND pa.domain_id = p_domain AND position(v_oid::text in pa.roots::text) > 0 ORDER BY pa.last_delivered_at LIMIT 5 LOOP
      v_gid := 'propagation:' || x.event_id; v_ids := v_ids || v_gid;
      v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'agent_run', 'propagation-attempt:' || x.event_id, 'propagation walk ' || x.state, CASE x.state WHEN 'failed' THEN 'failed' WHEN 'partial' THEN 'unresolved' WHEN 'complete' THEN 'ok' ELSE 'unresolved' END,
        x.last_delivered_at, x.principal_id::text, NULL, 'agent'));
      v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
    END LOOP;
    IF v_type = 'MEM' THEN
      FOR x IN SELECT ma.access_id, ma.purpose_id, ma.accessed_at, ma.reader_principal_id FROM memory.item_access ma WHERE ma.item_id = v_oid AND ma.object_version = v_ver ORDER BY ma.accessed_at DESC LIMIT 5 LOOP
        v_gid := 'memory-read:' || x.access_id; v_ids := v_ids || v_gid;
        v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, 'human_action', 'memory-access:' || x.access_id, 'read as context under purpose ' || x.purpose_id, 'ok', x.accessed_at, x.reader_principal_id::text, NULL, 'synchronous'));
        v_attach := jsonb_set(v_attach, ARRAY[v_key], coalesce(v_attach -> v_key, '[]'::jsonb) || to_jsonb(v_gid));
      END LOOP;
    END IF;
  END LOOP;
  -- the gaps as nodes (unresolved), each on the object it was found at
  FOR g IN SELECT * FROM jsonb_array_elements(cl -> 'gaps') LOOP
    v_n := v_n + 1; v_gid := 'gap:' || v_n; v_ids := v_ids || v_gid;
    v_nodes := v_nodes || jsonb_build_array(graph.pv_node(v_gid, CASE WHEN g ->> 'kind' IN ('broken_custody', 'unverifiable_artifact') THEN 'evidence' ELSE 'source' END, g ->> 'ref', (g ->> 'kind') || ': ' || (g ->> 'reason'), 'unresolved', NULL, NULL, NULL, NULL));
    v_attach := jsonb_set(v_attach, ARRAY[g ->> 'at'], coalesce(v_attach -> (g ->> 'at'), '[]'::jsonb) || to_jsonb(v_gid));
  END LOOP;
  -- the object nodes last: parents = the upstream objects and the attached nodes
  FOR ob IN SELECT * FROM jsonb_array_elements(cl -> 'objects') LOOP
    v_key := ob ->> 'key'; v_type := ob ->> 'type';
    SELECT coalesce(jsonb_agg(DISTINCT to_jsonb('obj:' || (ed ->> 'to'))), '[]'::jsonb) INTO v_parents FROM jsonb_array_elements(cl -> 'edges') ed WHERE ed ->> 'from' = v_key AND ed ->> 'to' IS NOT NULL;
    v_kind := CASE WHEN v_key = cl ->> 'root' THEN 'product' WHEN v_type = 'EVD' THEN 'evidence' WHEN v_type IN ('SRC', 'OBS') THEN 'source' WHEN v_type = ANY (graph.pv_claim_types()) THEN 'claim' ELSE 'product' END;
    v_node := graph.pv_node('obj:' || v_key, v_kind, v_key, (ob ->> 'title') || ' (' || (ob ->> 'lifecycle') || ', ' || (ob ->> 'truth_state') || CASE WHEN (ob ->> 'synthetic')::boolean THEN ', synthetic' ELSE '' END || ')',
      CASE WHEN ob ->> 'lifecycle' IN ('corrected', 'superseded', 'withdrawn', 'deleted') THEN 'corrected' WHEN ob ->> 'lifecycle' = 'disputed' THEN 'challenged' ELSE 'ok' END,
      (ob ->> 'recorded_at')::timestamptz, ob ->> 'owner', NULL, NULL);
    v_node := jsonb_set(v_node, '{parents}', v_parents || coalesce(v_attach -> v_key, '[]'::jsonb));
    v_node := v_node || jsonb_build_object('depth', (ob ->> 'depth')::int, 'digest', ob ->> 'digest', 'classification', ob ->> 'classification');
    -- the span this object is read at by its dependents (a claim's evidence)
    SELECT ed -> 'span' INTO v_bounds FROM jsonb_array_elements(cl -> 'edges') ed WHERE ed ->> 'to' = v_key AND ed ->> 'basis' = 'claim_lineage' LIMIT 1;
    IF v_bounds IS NOT NULL THEN v_node := jsonb_set(v_node, '{span}', v_bounds); END IF;
    IF v_key = cl ->> 'root' THEN v_root := v_node; END IF;
    v_out := v_out || jsonb_build_array(v_node);
  END LOOP;
  v_out := v_out || v_nodes;
  SELECT jsonb_object_agg(o, n) INTO v_counts FROM (SELECT nd ->> 'outcome' o, count(*) n FROM jsonb_array_elements(v_out) nd GROUP BY 1) s;
  SELECT jsonb_object_agg(b, n) INTO v_bounds FROM (SELECT coalesce(nd ->> 'boundary', 'none') b, count(*) n FROM jsonb_array_elements(v_out) nd GROUP BY 1) s;
  RETURN jsonb_build_object(
    'ref', cl ->> 'root', 'root', 'obj:' || (cl ->> 'root'), 'method', graph.pv_explain_method(), 'as_of', graph.pv_iso(clock_timestamp()),
    'product', jsonb_build_object('type', p_type, 'id', p_id, 'version', p_version, 'digest', v_root ->> 'digest', 'label', v_root ->> 'label', 'outcome', v_root ->> 'outcome'),
    'nodes', v_out, 'edges', cl -> 'edges', 'outcomes', coalesce(v_counts, '{}'::jsonb),
    'boundaries', jsonb_build_object('synchronous', coalesce((v_bounds ->> 'synchronous')::int, 0), 'event', coalesce((v_bounds ->> 'event')::int, 0), 'workflow', coalesce((v_bounds ->> 'workflow')::int, 0),
                                     'agent', coalesce((v_bounds ->> 'agent')::int, 0), 'model', coalesce((v_bounds ->> 'model')::int, 0), 'human', coalesce((v_bounds ->> 'human')::int, 0),
                                     'tool', jsonb_build_object('nodes', 0, 'state', 'carried', 'carrier', 'B70 — the tool gateway (F-P7A-05)')),
    'gaps', cl -> 'gaps', 'truncated', (cl ->> 'truncated')::boolean, 'incomplete', jsonb_array_length(cl -> 'gaps') > 0 OR (cl ->> 'truncated')::boolean,
    'examined', (cl ->> 'examined')::int, 'bounds', cl -> 'bounds', 'carried', graph.pv_carried(),
    'forward', graph.pv_downstream(p_tenant, p_domain, p_type, p_id, p_version));
END $$;
REVOKE ALL ON FUNCTION graph.explain(uuid, uuid, text, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.explain(uuid, uuid, text, uuid, int) TO eye_app, eye_commit;

-- §PV.5 THE REVISION DIFF (V03-T-192) ──────────────────────────────────────────────────────────────────────────────────────────────────────
/* The JSON-pointer changes between two documents: added / removed / changed leaves (arrays compared by position). IMMUTABLE. */
CREATE OR REPLACE FUNCTION graph.pv_json_diff(a jsonb, b jsonb, p_path text) RETURNS SETOF jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = graph, pg_catalog, pg_temp AS $$
DECLARE k text; i int; n int;
BEGIN
  IF a IS NOT DISTINCT FROM b THEN RETURN; END IF;
  IF a IS NULL OR b IS NULL OR jsonb_typeof(a) <> jsonb_typeof(b) OR jsonb_typeof(a) NOT IN ('object', 'array') THEN
    RETURN NEXT jsonb_build_object('pointer', CASE WHEN p_path = '' THEN '/' ELSE p_path END, 'op', CASE WHEN a IS NULL THEN 'added' WHEN b IS NULL THEN 'removed' ELSE 'changed' END, 'before', a, 'after', b);
    RETURN;
  END IF;
  IF jsonb_typeof(a) = 'object' THEN
    FOR k IN SELECT x FROM (SELECT jsonb_object_keys(a) x UNION SELECT jsonb_object_keys(b)) s ORDER BY x LOOP
      RETURN QUERY SELECT * FROM graph.pv_json_diff(a -> k, b -> k, p_path || '/' || replace(replace(k, '~', '~0'), '/', '~1'));
    END LOOP;
  ELSE
    n := greatest(jsonb_array_length(a), jsonb_array_length(b));
    FOR i IN 0 .. n - 1 LOOP
      RETURN QUERY SELECT * FROM graph.pv_json_diff(a -> i, b -> i, p_path || '/' || i);
    END LOOP;
  END IF;
END $$;
REVOKE ALL ON FUNCTION graph.pv_json_diff(jsonb, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.pv_json_diff(jsonb, jsonb, text) TO eye_app, eye_commit;

/* The change set between two versions of one object: the header fields changed (the 43-field header, content_digest beside it), the payload's
   JSON-pointer changes, the CORRECTION CHAIN between them (every version in (from, to] with its lifecycle, correction_of, supersedes,
   withdrawal reason, digest), and the DOWNSTREAM IMPACT — the invalidations recorded for the object since the from-version, and the
   read-only forward preview of the to-version. */
CREATE OR REPLACE FUNCTION graph.revision_diff(p_tenant uuid, p_domain uuid, p_type text, p_id uuid, p_from int, p_to int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, objects, pg_catalog, pg_temp AS $$
DECLARE a objects.canonical_objects%ROWTYPE; b objects.canonical_objects%ROWTYPE; ha jsonb; hb jsonb; v_header jsonb; v_payload jsonb; v_chain jsonb; v_inv jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'a revision diff');
  IF p_type IS NULL OR p_type !~ '^[A-Z]{3}$' OR p_id IS NULL THEN
    RAISE EXCEPTION 'provenance rejected (subject): a revision diff names the object as type (three capitals) and id' USING ERRCODE = '22023';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_from < 1 OR p_to <= p_from THEN
    RAISE EXCEPTION 'provenance rejected (versions): a revision diff compares an earlier version with a later one (from % to %)', coalesce(p_from::text, '-'), coalesce(p_to::text, '-') USING ERRCODE = '22023';
  END IF;
  SELECT * INTO a FROM objects.canonical_objects o WHERE o.object_type = p_type AND o.object_id = p_id AND o.object_version = p_from AND o.tenant_id = p_tenant AND o.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'provenance rejected (unknown_version): % % v% is not recorded in this domain', p_type, p_id, p_from USING ERRCODE = '23503'; END IF;
  SELECT * INTO b FROM objects.canonical_objects o WHERE o.object_type = p_type AND o.object_id = p_id AND o.object_version = p_to AND o.tenant_id = p_tenant AND o.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'provenance rejected (unknown_version): % % v% is not recorded in this domain', p_type, p_id, p_to USING ERRCODE = '23503'; END IF;
  ha := to_jsonb(a) - 'payload' - 'object_version'; hb := to_jsonb(b) - 'payload' - 'object_version';
  SELECT coalesce(jsonb_agg(jsonb_build_object('field', k, 'before', ha -> k, 'after', hb -> k) ORDER BY k), '[]'::jsonb) INTO v_header
    FROM (SELECT jsonb_object_keys(ha) k UNION SELECT jsonb_object_keys(hb)) s WHERE (ha -> k) IS DISTINCT FROM (hb -> k);
  SELECT coalesce(jsonb_agg(d ORDER BY d ->> 'pointer'), '[]'::jsonb) INTO v_payload FROM graph.pv_json_diff(a.payload, b.payload, '') d;
  SELECT coalesce(jsonb_agg(jsonb_build_object('version', o.object_version, 'lifecycle', o.lifecycle_state, 'truth_state', o.truth_state, 'correction_of', o.correction_of, 'supersedes', o.supersedes,
                                               'withdrawal_reason', o.withdrawal_reason, 'recorded_at', graph.pv_iso(o.recorded_at), 'digest', o.content_digest) ORDER BY o.object_version), '[]'::jsonb)
    INTO v_chain FROM objects.canonical_objects o WHERE o.object_id = p_id AND o.object_type = p_type AND o.object_version > p_from AND o.object_version <= p_to AND o.tenant_id = p_tenant AND o.domain_id = p_domain;
  SELECT coalesce(jsonb_agg(jsonb_build_object('invalidation_id', v.invalidation_id, 'trigger_kind', v.trigger_kind, 'state', v.state, 'opened_at', graph.pv_iso(v.opened_at),
                                               'correction_case_id', v.correction_case_id, 'statement', v.statement,
                                               'affected', jsonb_build_object('assumptions', v.affected_assumptions, 'objectives', v.affected_objectives, 'decisions', v.affected_decisions, 'commitments', v.affected_commitments))
                            ORDER BY v.opened_at), '[]'::jsonb)
    INTO v_inv FROM graph.invalidations_current v WHERE v.trigger_object_id = p_id AND v.tenant_id = p_tenant AND v.domain_id = p_domain AND v.opened_at >= a.recorded_at;
  RETURN jsonb_build_object('object', jsonb_build_object('type', p_type, 'id', p_id), 'from', jsonb_build_object('version', p_from, 'digest', a.content_digest, 'recorded_at', graph.pv_iso(a.recorded_at), 'record', to_jsonb(a)),
    'to', jsonb_build_object('version', p_to, 'digest', b.content_digest, 'recorded_at', graph.pv_iso(b.recorded_at), 'record', to_jsonb(b)),
    'header', v_header, 'payload', v_payload, 'chain', v_chain,
    'impact', jsonb_build_object('recorded', v_inv, 'preview', graph.pv_downstream(p_tenant, p_domain, p_type, p_id, p_to)));
END $$;
REVOKE ALL ON FUNCTION graph.revision_diff(uuid, uuid, text, uuid, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.revision_diff(uuid, uuid, text, uuid, int, int) TO eye_app, eye_commit;

/* The domain's GRAPH revisions compared by head number: every accepted revision in (from, to] with its items (graph.revision_items 0084),
   the counts summed, and the head now. */
CREATE OR REPLACE FUNCTION graph.graph_revision_diff(p_tenant uuid, p_domain uuid, p_from bigint, p_to bigint) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, pg_catalog, pg_temp AS $$
DECLARE v_head bigint; v_revs jsonb; v_counts jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'a graph revision diff');
  SELECT h.head INTO v_head FROM graph.revision_heads h WHERE h.tenant_id = p_tenant AND h.domain_id = p_domain;
  v_head := coalesce(v_head, 0);
  IF p_from IS NULL OR p_to IS NULL OR p_from < 0 OR p_to <= p_from THEN
    RAISE EXCEPTION 'provenance rejected (versions): a graph revision diff compares an earlier head with a later one (from % to %)', coalesce(p_from::text, '-'), coalesce(p_to::text, '-') USING ERRCODE = '22023';
  END IF;
  IF p_to > v_head THEN
    RAISE EXCEPTION 'provenance rejected (unknown_revision): the domain''s graph is at revision %; % is not recorded', v_head, p_to USING ERRCODE = '23503';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('revision', r.revision, 'revision_id', r.revision_id, 'expected_revision', r.expected_revision, 'committed_by', r.committed_by,
                                               'committed_at', graph.pv_iso(r.committed_at), 'idempotency_key', r.idempotency_key, 'ontology_version_id', r.ontology_version_id, 'counts', r.counts,
                                               'items', (SELECT coalesce(jsonb_agg(jsonb_build_object('ordinal', i.ordinal, 'kind', i.kind, 'ref_id', i.ref_id, 'local_ref', i.local_ref, 'provenance', i.provenance) ORDER BY i.ordinal), '[]'::jsonb)
                                                          FROM graph.revision_items i WHERE i.revision_id = r.revision_id)) ORDER BY r.revision), '[]'::jsonb)
    INTO v_revs FROM graph.revisions r WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.revision > p_from AND r.revision <= p_to;
  SELECT coalesce(jsonb_object_agg(k, s), '{}'::jsonb) INTO v_counts FROM (SELECT c.key k, sum((c.value)::text::numeric) s FROM graph.revisions r CROSS JOIN LATERAL jsonb_each(r.counts) c
     WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.revision > p_from AND r.revision <= p_to AND jsonb_typeof(c.value) = 'number' GROUP BY c.key) s;
  RETURN jsonb_build_object('from', p_from, 'to', p_to, 'head', v_head, 'revisions', v_revs, 'counts', v_counts,
    'unrecorded', (p_to - p_from) - jsonb_array_length(v_revs),
    'note', 'a head step without a ledger row is a graph write outside a change set (an edge assertion, a retraction, an entity event): it moved the head and is counted in unrecorded');
END $$;
REVOKE ALL ON FUNCTION graph.graph_revision_diff(uuid, uuid, bigint, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.graph_revision_diff(uuid, uuid, bigint, bigint) TO eye_app, eye_commit;

-- §PV.7 ALIGNMENT (internal core first; §PV.6's evaluation reads it) ───────────────────────────────────────────────────────────────────────
/* One citation's alignment: does it resolve to a recorded object of this domain; is it bound to evidence (a claim: its lineage span; evidence
   itself; a derived product: upstream recorded); otherwise which LABEL it carries (assumption, hypothesis, synthetic, inferred, assessed,
   asserted) — an unsupported, unlabelled citation is the unfit case (AI-29-001 → DP-23-005). */
CREATE OR REPLACE FUNCTION graph.pv_cite(p_tenant uuid, p_domain uuid, p_ref text, p_via text, p_classification text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, objects, intelligence, pg_catalog, pg_temp AS $$
DECLARE r jsonb := graph.pv_ref(p_ref); o objects.canonical_objects; l intelligence.claim_lineage%ROWTYPE; v_span jsonb; v_bound boolean := false; v_label text;
BEGIN
  IF r ->> 'form' NOT IN ('typed', 'bare') THEN
    RETURN jsonb_build_object('ref', p_ref, 'via', p_via, 'resolves', false, 'bound', false, 'label', NULL, 'aligned', false, 'reason', 'not a reference to a recorded object');
  END IF;
  o := graph.pv_resolve(p_tenant, p_domain, r ->> 'type', (r ->> 'id')::uuid, (r ->> 'version')::int);
  IF o.object_id IS NULL THEN
    RETURN jsonb_build_object('ref', p_ref, 'via', p_via, 'resolves', false, 'bound', false, 'label', NULL, 'aligned', false, 'reason', 'does not resolve in this domain');
  END IF;
  IF o.object_type = ANY (graph.pv_claim_types()) THEN
    SELECT * INTO l FROM intelligence.claim_lineage x WHERE x.claim_object_id = o.object_id AND x.claim_version = o.object_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    IF FOUND THEN v_bound := true; v_span := jsonb_build_object('evidence', 'EVD:' || l.evidence_object_id, 'start', l.byte_start, 'end', l.byte_end); END IF;
  ELSIF o.object_type IN ('EVD', 'OBS', 'SRC') THEN v_bound := true;
  ELSE v_bound := jsonb_array_length(o.evidence_refs) > 0 OR jsonb_array_length(o.source_object_ids) > 0;
  END IF;
  v_label := CASE WHEN o.synthetic_state THEN 'synthetic' WHEN o.object_type IN ('ASU') THEN 'assumption'
                  WHEN coalesce(o.payload ->> 'label', o.payload ->> 'support_label') IN ('assumption', 'hypothesis', 'synthetic', 'unsupported') THEN coalesce(o.payload ->> 'label', o.payload ->> 'support_label')
                  WHEN o.truth_state IN ('inferred', 'assessed', 'asserted', 'decided') THEN o.truth_state ELSE NULL END;
  RETURN jsonb_build_object('ref', o.object_type || ':' || o.object_id || '@' || o.object_version, 'via', p_via, 'resolves', true, 'bound', v_bound, 'span', v_span, 'label', v_label,
    'truth_state', o.truth_state, 'classification', o.classification, 'aligned', v_bound OR v_label IS NOT NULL,
    'above_audience', CASE WHEN p_classification IS NULL THEN NULL ELSE array_position(ARRAY['public', 'internal', 'confidential', 'restricted'], o.classification) > array_position(ARRAY['public', 'internal', 'confidential', 'restricted'], p_classification) END,
    'reason', CASE WHEN v_bound THEN 'bound to evidence' WHEN v_label IS NOT NULL THEN 'unsupported, labelled ' || v_label ELSE 'unsupported and unlabelled' END);
END $$;
REVOKE ALL ON FUNCTION graph.pv_cite(uuid, uuid, text, text, text) FROM PUBLIC;

/* The citations of a briefing (its items, its sources, its narrative's cites), a publication version (its source briefing / report and the
   audience ceiling), or an export package (its executed manifests' evidence, custody, and the claims of the relationship closure). */
CREATE OR REPLACE FUNCTION graph.pv_alignment(p_tenant uuid, p_domain uuid, p_kind text, p_id uuid, p_version int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, objects, intelligence, executive, retention, observation, pg_catalog, pg_temp AS $$
DECLARE b executive.briefings%ROWTYPE; pub executive.publications%ROWTYPE; pv executive.publication_versions%ROWTYPE; x record; v_cites jsonb := '[]'::jsonb; v_extra jsonb := '{}'::jsonb;
        v_item_ids text[]; v_cited text[]; v_ceiling text; v_inner jsonb; o objects.canonical_objects; c jsonb; v_excluded jsonb;
BEGIN
  IF p_kind = 'briefing' THEN
    SELECT * INTO b FROM executive.briefings z WHERE z.briefing_id = p_id AND z.tenant_id = p_tenant AND z.domain_id = p_domain;
    IF NOT FOUND THEN RETURN NULL; END IF;
    -- the lines that CITE a recorded object (evidence, a claim of any type, a run, a memory item, a warning, a forecast) are checked; the
    -- lines that report a LEDGER EVENT (a package or dissent event, a branch event, an acknowledgement, an indicator, a disputed note) carry
    -- no claim to align — they are counted and disclosed, never passed off as evidence
    FOR x IN SELECT it.value AS item FROM jsonb_array_elements(b.items) it LOOP
      IF x.item ? 'id' AND x.item ->> 'kind' IN ('evidence', 'claim', 'run', 'memory', 'warning', 'forecast') THEN
        v_cites := v_cites || jsonb_build_array(graph.pv_cite(p_tenant, p_domain, coalesce(CASE x.item ->> 'kind' WHEN 'memory' THEN 'MEM' WHEN 'forecast' THEN 'FCT' WHEN 'warning' THEN 'WRN'
            WHEN 'run' THEN 'SIM' WHEN 'evidence' THEN 'EVD' END || ':', '') || (x.item ->> 'id') || CASE WHEN (x.item ->> 'version') ~ '^[1-9][0-9]{0,8}$' THEN '@' || (x.item ->> 'version') ELSE '' END,
            'item ' || coalesce(x.item ->> 'item_id', x.item ->> 'id'), NULL) || jsonb_build_object('item_id', x.item ->> 'item_id'));
      END IF;
    END LOOP;
    SELECT array_agg(it ->> 'item_id') INTO v_item_ids FROM jsonb_array_elements(b.items) it;
    SELECT array_agg(c2 #>> '{}') INTO v_cited FROM jsonb_array_elements(b.narrative_cites) c2;
    -- a narrative cite that is no line of the briefing is misaligned; a line the narrative does not cite is disclosed as an omission (compression)
    FOR x IN SELECT c2 #>> '{}' AS cite FROM jsonb_array_elements(b.narrative_cites) c2 LOOP
      IF NOT (x.cite = ANY (coalesce(v_item_ids, '{}'))) THEN
        v_cites := v_cites || jsonb_build_array(jsonb_build_object('ref', x.cite, 'via', 'narrative', 'resolves', false, 'bound', false, 'label', NULL, 'aligned', false, 'reason', 'the narrative cites a line the briefing does not carry'));
      END IF;
    END LOOP;
    v_extra := jsonb_build_object('narrative', b.narrative IS NOT NULL, 'narrative_cites', jsonb_array_length(b.narrative_cites),
      'event_lines', (SELECT count(*) FROM jsonb_array_elements(b.items) it WHERE NOT (it ->> 'kind' IN ('evidence', 'claim', 'run', 'memory', 'warning', 'forecast'))),
      'omitted_from_narrative', CASE WHEN b.narrative IS NULL THEN '[]'::jsonb ELSE (SELECT coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb) FROM unnest(coalesce(v_item_ids, '{}')) i WHERE NOT (i = ANY (coalesce(v_cited, '{}')))) END,
      'degraded', b.degraded, 'composed_via', b.composed_via);
    RETURN jsonb_build_object('kind', 'briefing', 'subject', 'BRF:' || p_id, 'citations', v_cites, 'disclosures', v_extra);
  ELSIF p_kind = 'publication' THEN
    SELECT * INTO pub FROM executive.publications z WHERE z.publication_id = p_id AND z.tenant_id = p_tenant AND z.domain_id = p_domain;
    IF NOT FOUND THEN RETURN NULL; END IF;
    SELECT * INTO pv FROM executive.publication_versions z WHERE z.publication_id = p_id AND z.version = coalesce(p_version, pub.current_version);
    IF NOT FOUND THEN RETURN NULL; END IF;
    v_ceiling := pub.classification;
    IF pv.source_kind = 'briefing' THEN
      v_inner := graph.pv_alignment(p_tenant, p_domain, 'briefing', pv.source_id, NULL);
      FOR c IN SELECT * FROM jsonb_array_elements(coalesce(v_inner -> 'citations', '[]'::jsonb)) LOOP
        v_cites := v_cites || jsonb_build_array(c || jsonb_build_object('above_audience', CASE WHEN c ->> 'classification' IS NULL THEN NULL ELSE
          array_position(ARRAY['public', 'internal', 'confidential', 'restricted'], c ->> 'classification') > array_position(ARRAY['public', 'internal', 'confidential', 'restricted'], v_ceiling) END));
      END LOOP;
    ELSE
      v_cites := jsonb_build_array(graph.pv_cite(p_tenant, p_domain, 'DPK:' || pv.source_id || '@' || pv.source_version, 'report source', v_ceiling));
    END IF;
    v_extra := jsonb_build_object('source', pv.source_kind || ':' || pv.source_id || '@' || pv.source_version, 'state', pv.state,
      'audience', jsonb_build_object('classification', v_ceiling, 'audience', pub.audience,
        'above_ceiling', (SELECT count(*) FROM jsonb_array_elements(v_cites) z WHERE (z ->> 'above_audience')::boolean),
        'note', 'a citation above the publication''s classification is withheld from its audience; the count is disclosed, never the content'),
      'inner', CASE WHEN v_inner IS NULL THEN NULL ELSE v_inner -> 'disclosures' END);
    RETURN jsonb_build_object('kind', 'publication', 'subject', 'PUB:' || p_id || ' v' || pv.version, 'citations', v_cites, 'disclosures', v_extra);
  ELSIF p_kind = 'export' THEN
    IF NOT EXISTS (SELECT 1 FROM retention.export_packages z WHERE z.action_id = p_id AND z.tenant_id = p_tenant AND z.domain_id = p_domain)
       AND NOT EXISTS (SELECT 1 FROM retention.actions_current z WHERE z.action_id = p_id AND z.kind = 'customer_export' AND z.tenant_id = p_tenant AND z.domain_id = p_domain) THEN RETURN NULL; END IF;
    FOR x IN SELECT si.ref, si.disposition, si.reason FROM retention.scope_items si WHERE si.action_id = p_id AND si.item_kind = 'manifest' ORDER BY si.dependency_order, si.ref LOOP
      IF x.disposition <> 'execute' THEN CONTINUE; END IF;
      SELECT * INTO o FROM objects.canonical_objects e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.object_type = 'EVD' AND (e.payload ->> 'manifest_id') = x.ref ORDER BY e.object_version DESC LIMIT 1;
      IF o.object_id IS NULL THEN
        v_cites := v_cites || jsonb_build_array(jsonb_build_object('ref', 'blob:' || x.ref, 'via', 'manifest', 'resolves', false, 'bound', false, 'label', NULL, 'aligned', false, 'reason', 'no evidence object carries this manifest'));
      ELSE
        c := graph.pv_evd_custody(p_tenant, p_domain, o);
        v_cites := v_cites || jsonb_build_array(graph.pv_cite(p_tenant, p_domain, 'EVD:' || o.object_id || '@' || o.object_version, 'manifest ' || x.ref, NULL)
          || jsonb_build_object('custody', c ->> 'custody', 'artifact', c ->> 'artifact', 'aligned', (c ->> 'custody') = 'intact' AND (c ->> 'artifact') = 'verified'));
        -- the relationship closure (B15 links.json): every claim read from this evidence carries its lineage
        FOR c IN SELECT jsonb_build_object('ref', l.claim_type || ':' || l.claim_object_id || '@' || l.claim_version) j FROM intelligence.claim_lineage l WHERE l.evidence_object_id = o.object_id AND l.tenant_id = p_tenant AND l.domain_id = p_domain LIMIT 50 LOOP
          v_cites := v_cites || jsonb_build_array(graph.pv_cite(p_tenant, p_domain, c ->> 'ref', 'closure of EVD:' || o.object_id, NULL));
        END LOOP;
      END IF;
    END LOOP;
    SELECT coalesce(jsonb_agg(jsonb_build_object('manifest', si.ref, 'disposition', si.disposition, 'reason', si.reason)), '[]'::jsonb) INTO v_excluded
      FROM retention.scope_items si WHERE si.action_id = p_id AND si.item_kind = 'manifest' AND si.disposition <> 'execute';
    v_extra := jsonb_build_object('withheld', v_excluded, 'note', 'a manifest the approved scope excludes or holds (its classification above the ceiling, a hold) is withheld; it is listed, never carried');
    RETURN jsonb_build_object('kind', 'export', 'subject', 'RTA:' || p_id, 'citations', v_cites, 'disclosures', v_extra);
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION graph.pv_alignment(uuid, uuid, text, uuid, int) FROM PUBLIC;

CREATE OR REPLACE FUNCTION graph.alignment_check(p_tenant uuid, p_domain uuid, p_kind text, p_id uuid, p_version int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, pg_catalog, pg_temp AS $$
DECLARE a jsonb; n int; v_aligned int; v_labelled int; v_unlabelled int; v_unresolved int;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'an alignment check');
  IF p_kind IS NULL OR p_kind NOT IN ('briefing', 'publication', 'export') THEN
    RAISE EXCEPTION 'provenance rejected (kind): an alignment check reads a briefing, a publication or an export (not %)', coalesce(p_kind, '<none>') USING ERRCODE = '22023';
  END IF;
  a := graph.pv_alignment(p_tenant, p_domain, p_kind, p_id, p_version);
  IF a IS NULL THEN RAISE EXCEPTION 'provenance rejected (unknown_object): no % % in this domain', p_kind, p_id USING ERRCODE = '23503'; END IF;
  SELECT count(*), count(*) FILTER (WHERE (c ->> 'aligned')::boolean AND (c ->> 'bound')::boolean), count(*) FILTER (WHERE NOT coalesce((c ->> 'bound')::boolean, false) AND c ->> 'label' IS NOT NULL),
         count(*) FILTER (WHERE NOT coalesce((c ->> 'aligned')::boolean, false) AND c ->> 'label' IS NULL), count(*) FILTER (WHERE NOT coalesce((c ->> 'resolves')::boolean, false))
    INTO n, v_aligned, v_labelled, v_unlabelled, v_unresolved FROM jsonb_array_elements(a -> 'citations') c;
  RETURN a || jsonb_build_object('summary', jsonb_build_object('citations', n, 'bound', v_aligned, 'unsupported_labelled', v_labelled, 'unsupported_unlabelled', v_unlabelled, 'unresolved', v_unresolved),
    'verdict', CASE WHEN v_unlabelled > 0 THEN 'misaligned' ELSE 'aligned' END,
    'translation', jsonb_build_object('state', 'carried', 'carrier', 'B85 — no translation exists (DESIGN D12)'), 'as_of', graph.pv_iso(clock_timestamp()));
END $$;
REVOKE ALL ON FUNCTION graph.alignment_check(uuid, uuid, text, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.alignment_check(uuid, uuid, text, uuid, int) TO eye_app, eye_commit;

-- §PV.6 THE GENERIC UNFIT ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* THE EVALUATION under graph.pv_fitness_rule(): the closure's gaps (incomplete lineage, broken custody, an unverifiable artifact), an UPHELD
   knowledge challenge on any version in the closure and a briefing's unlabelled unsupported citation (unsupported_claim), an upstream
   version whose current mark is unfit (its reasons). unfit when any gap stands; unknown when the walk was truncated with none found; fit
   only when the whole recorded history was examined and none stands. Internal; no grant. */
CREATE OR REPLACE FUNCTION graph.pv_fitness_eval(p_tenant uuid, p_domain uuid, p_type text, p_id uuid, p_version int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, objects, decision, pg_catalog, pg_temp AS $$
DECLARE cl jsonb; v_gaps jsonb; ob jsonb; x record; a jsonb; v_reasons text[]; v_verdict text;
BEGIN
  cl := graph.pv_closure(p_tenant, p_domain, p_type, p_id, p_version, 12, 400);
  IF cl IS NULL THEN RETURN NULL; END IF;
  v_gaps := cl -> 'gaps';
  FOR ob IN SELECT * FROM jsonb_array_elements(cl -> 'objects') LOOP
    FOR x IN SELECT k.challenge_id, k.decision_note FROM graph.knowledge_challenges k WHERE k.subject_id = (ob ->> 'id')::uuid AND k.subject_version = (ob ->> 'version')::int AND k.state = 'upheld' AND k.tenant_id = p_tenant LOOP
      v_gaps := v_gaps || jsonb_build_array(jsonb_build_object('kind', 'unsupported_claim', 'ref', ob ->> 'key', 'at', ob ->> 'key', 'reason', format('knowledge challenge %s was upheld: %s', x.challenge_id, left(x.decision_note, 200))));
    END LOOP;
    -- the EXISTING contest machinery feeds the same rule: an upheld (or partly upheld) B35 appeal on a claim or a forecast in the closure
    FOR x IN SELECT a.case_id, a.outcome, a.rationale FROM decision.appeal_cases a WHERE a.subject_id = (ob ->> 'id')::uuid AND a.tenant_id = p_tenant AND a.outcome IN ('upheld', 'partly_upheld')
               AND (a.subject_version IS NULL OR a.subject_version = (ob ->> 'version')::int) LOOP
      v_gaps := v_gaps || jsonb_build_array(jsonb_build_object('kind', 'unsupported_claim', 'ref', ob ->> 'key', 'at', ob ->> 'key', 'reason', format('appeal %s was %s: %s', x.case_id, replace(x.outcome, '_', ' '), left(coalesce(x.rationale, ''), 200))));
    END LOOP;
    IF ob ->> 'key' <> cl ->> 'root' THEN
      FOR x IN SELECT DISTINCT ON (fm.object_id, fm.object_version) fm.mark_id, fm.verdict, fm.reasons FROM graph.product_fitness_marks fm
                WHERE fm.object_id = (ob ->> 'id')::uuid AND fm.object_version = (ob ->> 'version')::int ORDER BY fm.object_id, fm.object_version, fm.marked_at DESC LOOP
        IF x.verdict = 'unfit' THEN
          v_gaps := v_gaps || jsonb_build_array(jsonb_build_object('kind', x.reasons[1], 'ref', ob ->> 'key', 'at', ob ->> 'key', 'reason', format('rests on %s, marked unfit (%s) by mark %s', ob ->> 'key', array_to_string(x.reasons, ', '), x.mark_id)));
        END IF;
      END LOOP;
    END IF;
  END LOOP;
  IF p_type = 'BRF' THEN
    a := graph.pv_alignment(p_tenant, p_domain, 'briefing', p_id, NULL);
    FOR ob IN SELECT * FROM jsonb_array_elements(coalesce(a -> 'citations', '[]'::jsonb)) LOOP
      IF NOT coalesce((ob ->> 'aligned')::boolean, false) AND ob ->> 'label' IS NULL THEN
        v_gaps := v_gaps || jsonb_build_array(jsonb_build_object('kind', 'unsupported_claim', 'ref', ob ->> 'ref', 'at', cl ->> 'root', 'reason', format('the briefing cites %s (%s): %s', ob ->> 'ref', ob ->> 'via', ob ->> 'reason')));
      END IF;
    END LOOP;
  END IF;
  SELECT coalesce(array_agg(DISTINCT g ->> 'kind' ORDER BY g ->> 'kind'), '{}') INTO v_reasons FROM jsonb_array_elements(v_gaps) g;
  v_verdict := CASE WHEN cardinality(v_reasons) > 0 THEN 'unfit' WHEN (cl ->> 'truncated')::boolean THEN 'unknown' ELSE 'fit' END;
  RETURN jsonb_build_object('ref', cl ->> 'root', 'verdict', v_verdict, 'reasons', to_jsonb(v_reasons), 'gaps', v_gaps, 'examined', (cl ->> 'examined')::int, 'truncated', (cl ->> 'truncated')::boolean,
                            'rule_version', graph.pv_fitness_rule(), 'evaluated_at', graph.pv_iso(clock_timestamp()));
END $$;
REVOKE ALL ON FUNCTION graph.pv_fitness_eval(uuid, uuid, text, uuid, int) FROM PUBLIC;

/* The current mark of a version (its latest), or NULL. Internal; read by the hook, the read and the mark port. */
CREATE OR REPLACE FUNCTION graph.pv_current_mark(p_id uuid, p_version int) RETURNS graph.product_fitness_marks
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = graph, pg_catalog, pg_temp AS $$
  SELECT fm.* FROM graph.product_fitness_marks fm WHERE fm.object_id = p_id AND fm.object_version = p_version ORDER BY fm.marked_at DESC, fm.mark_id DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION graph.pv_current_mark(uuid, int) FROM PUBLIC;

/* THE READ: the evaluation now (never stored, never "fit by inference": `fit` only when the whole recorded history was examined) beside the
   RECORDED mark (the one consequential use reads) and the mark history. */
CREATE OR REPLACE FUNCTION graph.product_fitness(p_tenant uuid, p_domain uuid, p_type text, p_id uuid, p_version int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, objects, pg_catalog, pg_temp AS $$
DECLARE v_eval jsonb; m graph.product_fitness_marks;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the fitness of a product');
  IF p_type IS NULL OR p_type !~ '^[A-Z]{3}$' OR p_id IS NULL OR p_version IS NULL OR p_version < 1 THEN
    RAISE EXCEPTION 'provenance rejected (subject): a fitness read names a recorded product as type (three capitals), id and version' USING ERRCODE = '22023';
  END IF;
  v_eval := graph.pv_fitness_eval(p_tenant, p_domain, p_type, p_id, p_version);
  IF v_eval IS NULL THEN RAISE EXCEPTION 'provenance rejected (unknown_object): % % v% is not recorded in this domain', p_type, p_id, p_version USING ERRCODE = '23503'; END IF;
  m := graph.pv_current_mark(p_id, p_version);
  RETURN jsonb_build_object('ref', v_eval ->> 'ref', 'evaluation', v_eval,
    'mark', CASE WHEN m.mark_id IS NULL THEN NULL ELSE jsonb_build_object('mark_id', m.mark_id, 'verdict', m.verdict, 'reasons', to_jsonb(m.reasons), 'gaps', m.gaps, 'route', m.route, 'routed_to', m.routed_to,
                                       'rule_version', m.rule_version, 'marked_by', m.marked_by, 'marked_at', graph.pv_iso(m.marked_at), 'note', m.note, 'supersedes', m.supersedes) END,
    'refuses_use', m.verdict IS NOT DISTINCT FROM 'unfit',
    'history', (SELECT coalesce(jsonb_agg(jsonb_build_object('mark_id', fm.mark_id, 'verdict', fm.verdict, 'reasons', to_jsonb(fm.reasons), 'marked_at', graph.pv_iso(fm.marked_at), 'marked_by', fm.marked_by, 'route', fm.route)
                 ORDER BY fm.marked_at), '[]'::jsonb) FROM graph.product_fitness_marks fm WHERE fm.object_id = p_id AND fm.object_version = p_version AND fm.tenant_id = p_tenant));
END $$;
REVOKE ALL ON FUNCTION graph.product_fitness(uuid, uuid, text, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.product_fitness(uuid, uuid, text, uuid, int) TO eye_app, eye_commit;

/* THE MARK (its own governed port; DP-23-005). A named person (knowledge owner, data steward, domain administrator) records the EVALUATION's
   verdict — never one the caller names — with its gaps; an unfit verdict is ROUTED (recompute: the owner re-runs; adjudication: a person
   decides the gap) to the product's owner; a fit or unknown verdict over a current unfit mark lifts it (the history keeps both). A mark id
   replayed by the same person for the same version answers the recorded mark. */
CREATE OR REPLACE FUNCTION graph.mark_product_fitness(p_mark_id uuid, p_tenant uuid, p_domain uuid, p_type text, p_id uuid, p_version int, p_route text, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, objects, observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid := public.eye_principal(); o objects.canonical_objects; v_eval jsonb; prev graph.product_fitness_marks; r graph.product_fitness_marks%ROWTYPE; v_reasons text[]; v_route text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.provenance.fitness.mark']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF v_actor IS NULL OR p_actor IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'product fitness rejected (actor): the mark is recorded under the acting principal, never on behalf of another' USING ERRCODE = '42501';
  END IF;
  PERFORM governance.assert_approver('product fitness', v_actor, p_tenant, p_domain, ARRAY['knowledge_owner', 'data_steward', 'domain_admin'], NULL, NULL, 'marking a product''s fitness');
  IF p_mark_id IS NULL THEN RAISE EXCEPTION 'product fitness rejected (request): a mark carries its id (the command identity a retry reuses)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM graph.product_fitness_marks fm WHERE fm.mark_id = p_mark_id;
  IF FOUND THEN
    IF r.marked_by <> v_actor OR r.object_id <> p_id OR r.object_version <> p_version THEN
      RAISE EXCEPTION 'product fitness rejected (duplicate): mark % already records another act; a new mark takes a new id', p_mark_id USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('mark_id', r.mark_id, 'verdict', r.verdict, 'reasons', to_jsonb(r.reasons), 'gaps', r.gaps, 'route', r.route, 'routed_to', r.routed_to, 'rule_version', r.rule_version,
                              'marked_at', graph.pv_iso(r.marked_at), 'supersedes', r.supersedes, 'replayed', true);
  END IF;
  IF p_note IS NULL OR length(btrim(p_note)) < 8 OR length(p_note) > 2000 THEN
    RAISE EXCEPTION 'product fitness rejected (note): a mark states its note in 8 to 2000 characters (what was examined, why now)' USING ERRCODE = '22023';
  END IF;
  o := graph.pv_resolve(p_tenant, p_domain, p_type, p_id, p_version);
  IF o.object_id IS NULL OR o.domain_id IS DISTINCT FROM p_domain THEN
    RAISE EXCEPTION 'product fitness rejected (unknown_object): % % v% is not recorded in this domain', p_type, p_id, p_version USING ERRCODE = '23503';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('graph.fitness:' || p_id::text || '@' || p_version, 0));
  v_eval := graph.pv_fitness_eval(p_tenant, p_domain, p_type, p_id, p_version);
  SELECT coalesce(array_agg(x), '{}') INTO v_reasons FROM jsonb_array_elements_text(v_eval -> 'reasons') x;
  IF v_eval ->> 'verdict' = 'unfit' THEN
    v_route := coalesce(p_route, '');
    IF v_route NOT IN ('recompute', 'adjudication') THEN
      RAISE EXCEPTION 'product fitness rejected (route): the evaluation finds % unfit (%); the mark routes it — recompute (the owner re-runs it) or adjudication (a person decides the gap)', o.object_type || ':' || p_id || '@' || p_version, array_to_string(v_reasons, ', ') USING ERRCODE = '22023';
    END IF;
  ELSE v_route := NULL;
  END IF;
  prev := graph.pv_current_mark(p_id, p_version);
  INSERT INTO graph.product_fitness_marks (mark_id, scope, tenant_id, domain_id, object_type, object_id, object_version, object_digest, verdict, reasons, gaps, examined, truncated, rule_version,
                                           route, routed_to, note, supersedes, marked_by, correlation_id)
  VALUES (p_mark_id, 'DOMAIN', p_tenant, p_domain, o.object_type, p_id, p_version, o.content_digest, v_eval ->> 'verdict', v_reasons, v_eval -> 'gaps', (v_eval ->> 'examined')::int, (v_eval ->> 'truncated')::boolean,
          v_eval ->> 'rule_version', v_route, CASE WHEN v_route IS NULL THEN NULL ELSE graph.pv_owner(o.accountable_owner) END, btrim(p_note), prev.mark_id, v_actor, p_correlation)
  RETURNING * INTO r;
  RETURN jsonb_build_object('mark_id', r.mark_id, 'ref', o.object_type || ':' || p_id || '@' || p_version, 'verdict', r.verdict, 'reasons', to_jsonb(r.reasons), 'gaps', r.gaps, 'route', r.route,
    'routed_to', r.routed_to, 'rule_version', r.rule_version, 'marked_at', graph.pv_iso(r.marked_at), 'supersedes', r.supersedes,
    'lifted', prev.verdict IS NOT DISTINCT FROM 'unfit' AND r.verdict <> 'unfit', 'refuses_use', r.verdict = 'unfit', 'replayed', false);
END $$;
REVOKE ALL ON FUNCTION graph.mark_product_fitness(uuid, uuid, uuid, text, uuid, int, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.mark_product_fitness(uuid, uuid, uuid, text, uuid, int, text, text, uuid, uuid) TO eye_commit;

/* THE HOOK — §PV's stub (0120 §0.1) re-declared WHOLE: the same signature, STABLE, invoker, the same search path; read-only. Consequential use
   (a package option, a publication, a gate act) and EXPORT refuse a product whose current mark is UNFIT, or one resting — through the
   provenance agent's constructed edges, eight steps at most — on a version whose current mark is unfit. No mark is no refusal: the hook reads
   the governed record, it never evaluates (a STABLE caller cannot record what an evaluation finds). */
CREATE OR REPLACE FUNCTION objects._lineage_usable(p_type text, p_id uuid, p_version int, p_use text) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = objects, pg_catalog, pg_temp AS $$
DECLARE m record;
BEGIN
  -- B50 pv: the product's own current mark
  SELECT fm.mark_id, fm.verdict, fm.reasons, fm.route, fm.marked_at INTO m FROM graph.product_fitness_marks fm
   WHERE fm.object_id = p_id AND fm.object_version = p_version ORDER BY fm.marked_at DESC, fm.mark_id DESC LIMIT 1;
  IF FOUND AND m.verdict = 'unfit' THEN
    RAISE EXCEPTION 'object use rejected (unfit): % % v% is marked unfit (%) by mark % at %; it is not used for %; the mark routed it to %',
      p_type, p_id, p_version, array_to_string(m.reasons, ', '), m.mark_id, to_char(m.marked_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), p_use, m.route USING ERRCODE = '22023';
  END IF;
  -- B50 pv: an upstream version (the constructed lineage edges) whose current mark is unfit
  WITH RECURSIVE up(id, version, depth, path) AS (
    SELECT e.upstream_id, e.upstream_version, 1, ARRAY[e.upstream_id::text || '@' || e.upstream_version] FROM graph.provenance_edges e WHERE e.dependent_id = p_id AND e.dependent_version = p_version
    UNION
    SELECT e.upstream_id, e.upstream_version, u.depth + 1, u.path || (e.upstream_id::text || '@' || e.upstream_version) FROM up u JOIN graph.provenance_edges e ON e.dependent_id = u.id AND e.dependent_version = u.version
     WHERE u.depth < 8 AND NOT ((e.upstream_id::text || '@' || e.upstream_version) = ANY (u.path)))
  SELECT x.mark_id, x.object_type, x.object_id, x.object_version, x.reasons, x.route INTO m
    FROM (SELECT DISTINCT u.id, u.version FROM up u) u2
    CROSS JOIN LATERAL (SELECT fm.* FROM graph.product_fitness_marks fm WHERE fm.object_id = u2.id AND fm.object_version = u2.version ORDER BY fm.marked_at DESC, fm.mark_id DESC LIMIT 1) x
   WHERE x.verdict = 'unfit' ORDER BY x.marked_at, x.mark_id LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'object use rejected (unfit): % % v% rests on % % v%, marked unfit (%) by mark %; it is not used for % until the upstream mark is lifted (routed to %)',
      p_type, p_id, p_version, m.object_type, m.object_id, m.object_version, array_to_string(m.reasons, ', '), m.mark_id, p_use, m.route USING ERRCODE = '22023';
  END IF;
  RETURN;
END $$;
REVOKE ALL ON FUNCTION objects._lineage_usable(text, uuid, int, text) FROM PUBLIC;

-- §PV.8 THE CONTEST PATH (HX-14) ───────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION graph.pv_challenge_answer(k graph.knowledge_challenges, p_replayed boolean) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = graph, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('challenge_id', k.challenge_id, 'subject', jsonb_build_object('kind', k.subject_kind, 'type', k.subject_type, 'id', k.subject_id, 'version', k.subject_version, 'digest', k.subject_digest, 'owner', k.subject_owner),
    'state', k.state, 'grounds', k.grounds, 'disputed', k.disputed, 'opened_by', k.opened_by, 'opened_at', graph.pv_iso(k.opened_at), 'review_by', graph.pv_iso(k.review_by),
    'reviewer', k.reviewer, 'review_started_at', graph.pv_iso(k.review_started_at), 'decided_by', k.decided_by, 'decided_at', graph.pv_iso(k.decided_at), 'decision_note', k.decision_note,
    'withdrawn_at', graph.pv_iso(k.withdrawn_at), 'withdrawal_reason', k.withdrawal_reason, 'escalations', k.escalations, 'escalated_at', graph.pv_iso(k.escalated_at),
    'overdue', k.state IN ('open', 'under_review') AND clock_timestamp() > k.review_by, 'replayed', p_replayed)
$$;
REVOKE ALL ON FUNCTION graph.pv_challenge_answer(graph.knowledge_challenges, boolean) FROM PUBLIC;

CREATE OR REPLACE FUNCTION graph.pv_challenge_event(k graph.knowledge_challenges, p_event text, p_actor uuid, p_details jsonb, p_correlation uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = graph, pg_catalog, pg_temp AS $$
  INSERT INTO graph.knowledge_challenge_events (event_id, scope, tenant_id, domain_id, challenge_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', k.tenant_id, k.domain_id, k.challenge_id, p_event, p_actor, coalesce(p_details, '{}'::jsonb), p_correlation)
$$;
REVOKE ALL ON FUNCTION graph.pv_challenge_event(graph.knowledge_challenges, text, uuid, jsonb, uuid) FROM PUBLIC;

/* The acting person: the bound principal, named by the route, an active human. */
CREATE OR REPLACE FUNCTION graph.pv_challenge_actor(p_actor uuid) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, onboarding, pg_catalog, pg_temp AS $$
DECLARE v uuid := public.eye_principal();
BEGIN
  IF v IS NULL OR p_actor IS DISTINCT FROM v THEN
    RAISE EXCEPTION 'knowledge challenge rejected (actor): the act is recorded under the acting principal, never on behalf of another' USING ERRCODE = '42501';
  END IF;
  IF onboarding.principal_kind(v) IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION 'knowledge challenge rejected (actor): contesting, reviewing and deciding a challenge are a named person''s acts; an agent never does them' USING ERRCODE = '42501';
  END IF;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION graph.pv_challenge_actor(uuid) FROM PUBLIC;

/* A challenge of the domain, locked. */
CREATE OR REPLACE FUNCTION graph.pv_challenge_lock(p_challenge uuid, p_tenant uuid, p_domain uuid) RETURNS graph.knowledge_challenges
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, pg_catalog, pg_temp AS $$
DECLARE k graph.knowledge_challenges;
BEGIN
  SELECT * INTO k FROM graph.knowledge_challenges x WHERE x.challenge_id = p_challenge AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'knowledge challenge rejected (unknown_challenge): no challenge % in this domain', coalesce(p_challenge::text, '<none>') USING ERRCODE = '23503'; END IF;
  RETURN k;
END $$;
REVOKE ALL ON FUNCTION graph.pv_challenge_lock(uuid, uuid, uuid) FROM PUBLIC;

/* OPEN: a person contests a decision-active intelligence product's version with grounds (16+ characters) and what is disputed; the review is
   due on the DATABASE clock (p_review_within_days, 1–30, default 7). A decision package or a decision is ROUTED to its own contest paths; a
   run to its simulation challenge; the product's own owner corrects it, never challenges it. */
CREATE OR REPLACE FUNCTION graph.open_knowledge_challenge(p_challenge_id uuid, p_request_id uuid, p_tenant uuid, p_domain uuid, p_type text, p_id uuid, p_version int,
    p_grounds text, p_disputed jsonb, p_review_within_days int, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, objects, observation, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; o objects.canonical_objects; k graph.knowledge_challenges; v_kind text; v_owner uuid; v_live uuid; v_days int := coalesce(p_review_within_days, 7);
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.provenance.challenge.open']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := graph.pv_challenge_actor(p_actor);
  IF p_request_id IS NULL OR p_challenge_id IS NULL THEN
    RAISE EXCEPTION 'knowledge challenge rejected (request): an opening carries its challenge id and request id (the command identity a retry reuses)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO k FROM graph.knowledge_challenges x WHERE x.request_id = p_request_id;
  IF FOUND THEN
    IF k.opened_by <> v_actor OR k.subject_id <> p_id OR k.tenant_id <> p_tenant OR k.domain_id <> p_domain THEN
      RAISE EXCEPTION 'knowledge challenge rejected (duplicate): request % already opened another challenge; a new challenge takes a new request id', p_request_id USING ERRCODE = '23505';
    END IF;
    RETURN graph.pv_challenge_answer(k, true);
  END IF;
  IF p_type IN ('DPK', 'DEC', 'APR', 'CMT') THEN
    RAISE EXCEPTION 'knowledge challenge rejected (routed): a decision is contested through its own paths — an appeal (decision.appeal.open, B35) or a gate challenge (decision.challenge.raise, B36); it is not duplicated here' USING ERRCODE = '22023';
  END IF;
  IF p_type = 'SIM' THEN
    RAISE EXCEPTION 'knowledge challenge rejected (routed): a simulation run is contested through its simulation challenge (simulation.challenge.open, B21); it is not duplicated here' USING ERRCODE = '22023';
  END IF;
  v_kind := CASE WHEN p_type IN ('CLM', 'ENT', 'EVT', 'REL') THEN 'claim' WHEN p_type = 'ASM' THEN 'assessment' WHEN p_type = 'WRN' THEN 'warning' WHEN p_type = 'FCT' THEN 'forecast' END;
  IF v_kind IS NULL THEN
    RAISE EXCEPTION 'knowledge challenge rejected (subject): % is not a decision-active intelligence product (claims CLM/ENT/EVT/REL, an assessment ASM, a warning WRN, a forecast FCT)', coalesce(p_type, '<none>') USING ERRCODE = '22023';
  END IF;
  IF p_grounds IS NULL OR length(btrim(p_grounds)) < 16 OR length(p_grounds) > 4000 THEN
    RAISE EXCEPTION 'knowledge challenge rejected (grounds): a challenge states its grounds in 16 to 4000 characters' USING ERRCODE = '22023';
  END IF;
  IF p_disputed IS NOT NULL AND (jsonb_typeof(p_disputed) <> 'array' OR jsonb_array_length(p_disputed) > 20 OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_disputed) d WHERE jsonb_typeof(d) <> 'string' OR length(d #>> '{}') NOT BETWEEN 1 AND 300)) THEN
    RAISE EXCEPTION 'knowledge challenge rejected (disputed): disputed is up to twenty strings (the statements, fields or spans disputed)' USING ERRCODE = '22023';
  END IF;
  IF v_days < 1 OR v_days > 30 THEN
    RAISE EXCEPTION 'knowledge challenge rejected (review_within): the review is due within 1 to 30 days' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO o FROM objects.canonical_objects x WHERE x.object_type = p_type AND x.object_id = p_id AND x.object_version = p_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'knowledge challenge rejected (unknown_subject): % % v% is not recorded in this domain', p_type, p_id, p_version USING ERRCODE = '23503';
  END IF;
  IF o.lifecycle_state IN ('withdrawn', 'deleted') THEN
    RAISE EXCEPTION 'knowledge challenge rejected (state): % % v% is %; there is nothing decision-active to contest', p_type, p_id, p_version, o.lifecycle_state USING ERRCODE = '22023';
  END IF;
  v_owner := graph.pv_owner(o.accountable_owner);
  IF v_owner IS NOT DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'knowledge challenge rejected (separation_of_duties): the owner of % % v% corrects it (a correction), never challenges it', p_type, p_id, p_version USING ERRCODE = '42501';
  END IF;
  SELECT x.challenge_id INTO v_live FROM graph.knowledge_challenges x WHERE x.subject_id = p_id AND x.subject_version = p_version AND x.opened_by = v_actor AND x.state IN ('open', 'under_review');
  IF v_live IS NOT NULL THEN
    RAISE EXCEPTION 'knowledge challenge rejected (duplicate): challenge % by this person on % v% is live; it is decided or withdrawn before another is opened', v_live, p_id, p_version USING ERRCODE = '23505';
  END IF;
  INSERT INTO graph.knowledge_challenges (challenge_id, scope, tenant_id, domain_id, subject_kind, subject_type, subject_id, subject_version, subject_digest, subject_owner, grounds, disputed, state,
                                          opened_by, review_by, request_id, correlation_id)
  VALUES (p_challenge_id, 'DOMAIN', p_tenant, p_domain, v_kind, p_type, p_id, p_version, o.content_digest, v_owner, btrim(p_grounds), coalesce(p_disputed, '[]'::jsonb), 'open',
          v_actor, clock_timestamp() + make_interval(days => v_days), p_request_id, p_correlation)
  RETURNING * INTO k;
  PERFORM graph.pv_challenge_event(k, 'challenge.opened', v_actor, jsonb_build_object('subject', p_type || ':' || p_id || '@' || p_version, 'digest', o.content_digest, 'review_by', graph.pv_iso(k.review_by)), p_correlation);
  RETURN graph.pv_challenge_answer(k, false);
END $$;
REVOKE ALL ON FUNCTION graph.open_knowledge_challenge(uuid, uuid, uuid, uuid, text, uuid, int, text, jsonb, int, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.open_knowledge_challenge(uuid, uuid, uuid, uuid, text, uuid, int, text, jsonb, int, uuid, uuid) TO eye_commit;

/* TAKE FOR REVIEW: a knowledge owner, data steward or domain administrator who is neither the opener nor the owner (re-checked here). */
CREATE OR REPLACE FUNCTION graph.review_knowledge_challenge(p_challenge_id uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; k graph.knowledge_challenges;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.provenance.challenge.review']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := graph.pv_challenge_actor(p_actor);
  k := graph.pv_challenge_lock(p_challenge_id, p_tenant, p_domain);
  PERFORM governance.assert_approver('knowledge challenge', v_actor, p_tenant, p_domain, ARRAY['knowledge_owner', 'data_steward', 'domain_admin'], k.opened_by,
                                     CASE WHEN k.subject_owner IS NULL THEN NULL ELSE ARRAY[k.subject_owner] END, 'reviewing a knowledge challenge');
  IF k.state <> 'open' THEN
    RAISE EXCEPTION 'knowledge challenge rejected (state): challenge % is %; a review is started on an open challenge', p_challenge_id, k.state USING ERRCODE = '22023';
  END IF;
  UPDATE graph.knowledge_challenges SET state = 'under_review', reviewer = v_actor, review_started_at = clock_timestamp() WHERE challenge_id = p_challenge_id RETURNING * INTO k;
  PERFORM graph.pv_challenge_event(k, 'challenge.review_started', v_actor, jsonb_build_object('reviewer', v_actor), p_correlation);
  RETURN graph.pv_challenge_answer(k, false);
END $$;
REVOKE ALL ON FUNCTION graph.review_knowledge_challenge(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.review_knowledge_challenge(uuid, uuid, uuid, uuid, uuid) TO eye_commit;

/* EVIDENCE: a party (the opener, the owner, the reviewer) submits a recorded object of this domain under its digest, with a note. */
CREATE OR REPLACE FUNCTION graph.submit_knowledge_challenge_evidence(p_evidence_id uuid, p_challenge_id uuid, p_tenant uuid, p_domain uuid, p_ref text, p_digest text, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, objects, observation, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; k graph.knowledge_challenges; r jsonb := graph.pv_ref(p_ref); o objects.canonical_objects; v_party text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.provenance.challenge.evidence']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := graph.pv_challenge_actor(p_actor);
  k := graph.pv_challenge_lock(p_challenge_id, p_tenant, p_domain);
  v_party := CASE WHEN v_actor = k.opened_by THEN 'opener' WHEN v_actor = k.subject_owner THEN 'owner' WHEN v_actor = k.reviewer THEN 'reviewer' END;
  IF v_party IS NULL THEN
    RAISE EXCEPTION 'knowledge challenge rejected (actor): evidence is submitted by a party to challenge % (its opener, the subject''s owner or its reviewer)', p_challenge_id USING ERRCODE = '42501';
  END IF;
  IF k.state NOT IN ('open', 'under_review') THEN
    RAISE EXCEPTION 'knowledge challenge rejected (state): challenge % is %; evidence is submitted while it is live', p_challenge_id, k.state USING ERRCODE = '22023';
  END IF;
  IF r ->> 'form' <> 'typed' OR r ->> 'version' IS NULL THEN
    RAISE EXCEPTION 'knowledge challenge rejected (evidence): evidence names a recorded object as TYPE:id@version (e.g. EVD:…@1)' USING ERRCODE = '22023';
  END IF;
  IF p_note IS NULL OR length(btrim(p_note)) < 8 OR length(p_note) > 2000 THEN
    RAISE EXCEPTION 'knowledge challenge rejected (note): evidence states what it shows in 8 to 2000 characters' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO o FROM objects.canonical_objects x WHERE x.object_type = r ->> 'type' AND x.object_id = (r ->> 'id')::uuid AND x.object_version = (r ->> 'version')::int AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'knowledge challenge rejected (unknown_evidence): % is not recorded in this domain', p_ref USING ERRCODE = '23503'; END IF;
  IF o.content_digest IS DISTINCT FROM p_digest THEN
    RAISE EXCEPTION 'knowledge challenge rejected (evidence): % carries digest %, not the submitted %', p_ref, o.content_digest, coalesce(p_digest, '<none>') USING ERRCODE = '22023';
  END IF;
  INSERT INTO graph.knowledge_challenge_evidence (evidence_id, scope, tenant_id, domain_id, challenge_id, ref, object_type, object_id, object_version, object_digest, note, party, submitted_by, correlation_id)
  VALUES (p_evidence_id, 'DOMAIN', p_tenant, p_domain, p_challenge_id, o.object_type || ':' || o.object_id || '@' || o.object_version, o.object_type, o.object_id, o.object_version, o.content_digest, btrim(p_note), v_party, v_actor, p_correlation);
  PERFORM graph.pv_challenge_event(k, 'challenge.evidence_submitted', v_actor, jsonb_build_object('evidence_id', p_evidence_id, 'ref', o.object_type || ':' || o.object_id || '@' || o.object_version, 'party', v_party), p_correlation);
  RETURN graph.pv_challenge_answer(k, false) || jsonb_build_object('evidence', jsonb_build_object('evidence_id', p_evidence_id, 'ref', o.object_type || ':' || o.object_id || '@' || o.object_version, 'digest', o.content_digest, 'party', v_party));
END $$;
REVOKE ALL ON FUNCTION graph.submit_knowledge_challenge_evidence(uuid, uuid, uuid, uuid, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.submit_knowledge_challenge_evidence(uuid, uuid, uuid, uuid, text, text, text, uuid, uuid) TO eye_commit;

/* DECIDE: the reviewer who took it (the role and the separation re-checked) upholds or dismisses with a note (16+ characters). An upheld
   challenge enters the product's fitness evaluation (unsupported_claim) — the MARK stays its own act (§PV.6). */
CREATE OR REPLACE FUNCTION graph.decide_knowledge_challenge(p_challenge_id uuid, p_tenant uuid, p_domain uuid, p_decision text, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; k graph.knowledge_challenges;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.provenance.challenge.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := graph.pv_challenge_actor(p_actor);
  k := graph.pv_challenge_lock(p_challenge_id, p_tenant, p_domain);
  PERFORM governance.assert_approver('knowledge challenge', v_actor, p_tenant, p_domain, ARRAY['knowledge_owner', 'data_steward', 'domain_admin'], k.opened_by,
                                     CASE WHEN k.subject_owner IS NULL THEN NULL ELSE ARRAY[k.subject_owner] END, 'deciding a knowledge challenge');
  IF p_decision IS NULL OR p_decision NOT IN ('upheld', 'dismissed') THEN
    RAISE EXCEPTION 'knowledge challenge rejected (decision): a decision upholds or dismisses the challenge' USING ERRCODE = '22023';
  END IF;
  IF p_note IS NULL OR length(btrim(p_note)) < 16 OR length(p_note) > 4000 THEN
    RAISE EXCEPTION 'knowledge challenge rejected (note): a decision states its reasons in 16 to 4000 characters' USING ERRCODE = '22023';
  END IF;
  IF k.state <> 'under_review' THEN
    RAISE EXCEPTION 'knowledge challenge rejected (state): challenge % is %; a challenge is decided under review', p_challenge_id, k.state USING ERRCODE = '22023';
  END IF;
  IF k.reviewer IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'knowledge challenge rejected (actor): challenge % is under review by another person; its reviewer decides it', p_challenge_id USING ERRCODE = '42501';
  END IF;
  UPDATE graph.knowledge_challenges SET state = p_decision, decided_by = v_actor, decided_at = clock_timestamp(), decision_note = btrim(p_note) WHERE challenge_id = p_challenge_id RETURNING * INTO k;
  PERFORM graph.pv_challenge_event(k, 'challenge.' || p_decision, v_actor, jsonb_build_object('note', btrim(p_note), 'evidence', (SELECT count(*) FROM graph.knowledge_challenge_evidence e WHERE e.challenge_id = p_challenge_id)), p_correlation);
  RETURN graph.pv_challenge_answer(k, false) || jsonb_build_object('next', CASE WHEN p_decision = 'upheld' THEN 'the product''s fitness evaluation now reads unsupported_claim; a knowledge owner records the mark (graph.provenance.fitness.mark), which routes it to a recompute or an adjudication' ELSE 'nothing changes in the product' END);
END $$;
REVOKE ALL ON FUNCTION graph.decide_knowledge_challenge(uuid, uuid, uuid, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.decide_knowledge_challenge(uuid, uuid, uuid, text, text, uuid, uuid) TO eye_commit;

/* WITHDRAW: the opener's act alone, while live, with a reason (8+ characters). */
CREATE OR REPLACE FUNCTION graph.withdraw_knowledge_challenge(p_challenge_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, observation, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; k graph.knowledge_challenges; v_prior text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.provenance.challenge.withdraw']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := graph.pv_challenge_actor(p_actor);
  k := graph.pv_challenge_lock(p_challenge_id, p_tenant, p_domain);
  IF k.opened_by <> v_actor THEN
    RAISE EXCEPTION 'knowledge challenge rejected (actor): a challenge is withdrawn by its opener; the acting person did not open challenge %', p_challenge_id USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'knowledge challenge rejected (reason): a withdrawal states its reason in 8 to 2000 characters' USING ERRCODE = '22023';
  END IF;
  IF k.state NOT IN ('open', 'under_review') THEN
    RAISE EXCEPTION 'knowledge challenge rejected (state): challenge % is %; only a live challenge is withdrawn', p_challenge_id, k.state USING ERRCODE = '22023';
  END IF;
  v_prior := k.state;
  UPDATE graph.knowledge_challenges SET state = 'withdrawn', withdrawn_at = clock_timestamp(), withdrawal_reason = btrim(p_reason) WHERE challenge_id = p_challenge_id RETURNING * INTO k;
  PERFORM graph.pv_challenge_event(k, 'challenge.withdrawn', v_actor, jsonb_build_object('reason', btrim(p_reason), 'prior_state', v_prior), p_correlation);
  RETURN graph.pv_challenge_answer(k, false);
END $$;
REVOKE ALL ON FUNCTION graph.withdraw_knowledge_challenge(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.withdraw_knowledge_challenge(uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

/* ESCALATE: once the review is OVERDUE on the database clock, a party or a domain administrator escalates it (at most five times); the next
   review is due two days on. The escalation names the domain administrators; routing it into the attention queue needs an attention class
   (executive.attention_signal_classes, re-declared by §CL) — the integrator's fold, reported. */
CREATE OR REPLACE FUNCTION graph.escalate_knowledge_challenge(p_challenge_id uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; k graph.knowledge_challenges; v_now timestamptz := clock_timestamp(); v_was timestamptz;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.provenance.challenge.escalate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := graph.pv_challenge_actor(p_actor);
  k := graph.pv_challenge_lock(p_challenge_id, p_tenant, p_domain);
  IF NOT (v_actor = k.opened_by OR v_actor IS NOT DISTINCT FROM k.subject_owner OR v_actor IS NOT DISTINCT FROM k.reviewer
          OR governance.holds_role(v_actor, p_tenant, p_domain, ARRAY['domain_admin', 'knowledge_owner'])) THEN
    RAISE EXCEPTION 'knowledge challenge rejected (actor): an overdue challenge is escalated by a party to it or a domain administrator' USING ERRCODE = '42501';
  END IF;
  IF k.state NOT IN ('open', 'under_review') THEN
    RAISE EXCEPTION 'knowledge challenge rejected (state): challenge % is %; only a live challenge is escalated', p_challenge_id, k.state USING ERRCODE = '22023';
  END IF;
  IF v_now <= k.review_by THEN
    RAISE EXCEPTION 'knowledge challenge rejected (state): challenge % is not overdue; its review is due by % (the database clock reads %)', p_challenge_id, graph.pv_iso(k.review_by), graph.pv_iso(v_now) USING ERRCODE = '22023';
  END IF;
  IF k.escalations >= 5 THEN
    RAISE EXCEPTION 'knowledge challenge rejected (state): challenge % was escalated five times; the domain administrator decides it', p_challenge_id USING ERRCODE = '22023';
  END IF;
  v_was := k.review_by;
  UPDATE graph.knowledge_challenges SET escalations = escalations + 1, escalated_at = v_now, review_by = v_now + interval '2 days' WHERE challenge_id = p_challenge_id RETURNING * INTO k;
  PERFORM graph.pv_challenge_event(k, 'challenge.escalated', v_actor, jsonb_build_object('was_due', graph.pv_iso(v_was), 'escalations', k.escalations, 'escalate_to_roles', jsonb_build_array('domain_admin'),
    'next_due', graph.pv_iso(k.review_by)), p_correlation);
  RETURN graph.pv_challenge_answer(k, false) || jsonb_build_object('escalated_to_roles', jsonb_build_array('domain_admin'), 'was_due', graph.pv_iso(v_was));
END $$;
REVOKE ALL ON FUNCTION graph.escalate_knowledge_challenge(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.escalate_knowledge_challenge(uuid, uuid, uuid, uuid, uuid) TO eye_commit;

/* THE READ: the domain's challenges (or one subject's), each with its events and evidence; and where a decision or a run is contested instead. */
CREATE OR REPLACE FUNCTION graph.knowledge_challenges_read(p_tenant uuid, p_domain uuid, p_subject uuid, p_state text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, decision, simulation, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the knowledge challenges');
  IF p_state IS NOT NULL AND p_state NOT IN ('open', 'under_review', 'upheld', 'dismissed', 'withdrawn', 'live') THEN
    RAISE EXCEPTION 'provenance rejected (state): a challenge state is open, under_review, upheld, dismissed, withdrawn or live (not %)', p_state USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('as_of', graph.pv_iso(clock_timestamp()),
    'challenges', (SELECT coalesce(jsonb_agg(graph.pv_challenge_answer(k, false) || jsonb_build_object(
        'events', (SELECT coalesce(jsonb_agg(jsonb_build_object('event', e.event, 'actor', e.actor_principal_id, 'at', graph.pv_iso(e.occurred_at), 'details', e.details) ORDER BY e.occurred_at, e.event_id), '[]'::jsonb)
                     FROM graph.knowledge_challenge_events e WHERE e.challenge_id = k.challenge_id),
        'evidence', (SELECT coalesce(jsonb_agg(jsonb_build_object('evidence_id', v.evidence_id, 'ref', v.ref, 'digest', v.object_digest, 'note', v.note, 'party', v.party, 'by', v.submitted_by, 'at', graph.pv_iso(v.submitted_at)) ORDER BY v.submitted_at), '[]'::jsonb)
                     FROM graph.knowledge_challenge_evidence v WHERE v.challenge_id = k.challenge_id)) ORDER BY k.opened_at DESC), '[]'::jsonb)
      FROM graph.knowledge_challenges k WHERE k.tenant_id = p_tenant AND k.domain_id = p_domain AND (p_subject IS NULL OR k.subject_id = p_subject)
        AND (p_state IS NULL OR k.state = p_state OR (p_state = 'live' AND k.state IN ('open', 'under_review')))),
    -- the EXISTING contest machinery on the same subject, beside the knowledge challenges (read, never duplicated): B35 appeals, B21 simulation challenges
    'appeals', CASE WHEN p_subject IS NULL THEN NULL ELSE (SELECT coalesce(jsonb_agg(jsonb_build_object('case_id', a.case_id, 'subject_kind', a.subject_kind, 'state', a.state, 'outcome', a.outcome,
                 'opened_at', graph.pv_iso(a.opened_at), 'deadline_at', graph.pv_iso(a.deadline_at), 'adjudicator', a.adjudicator_principal_id) ORDER BY a.opened_at), '[]'::jsonb)
                 FROM decision.appeal_cases a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.subject_id = p_subject) END,
    'simulation_challenges', CASE WHEN p_subject IS NULL THEN NULL ELSE (SELECT coalesce(jsonb_agg(jsonb_build_object('challenge_id', s.challenge_id, 'kind', s.kind, 'state', s.state, 'opened_at', graph.pv_iso(s.opened_at)) ORDER BY s.opened_at), '[]'::jsonb)
                 FROM simulation.challenges s WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.run_id = p_subject) END,
    'routes', jsonb_build_object('decision', 'an appeal (decision.appeal.open, B35) or a gate challenge (decision.challenge.raise, B36)', 'run', 'a simulation challenge (simulation.challenge.open, B21)',
                                 'claim_or_forecast', 'also an appeal (decision.appeal.open, B35) when the contest is of a decision''s use of it; an upheld appeal enters the same fitness evaluation'));
END $$;
REVOKE ALL ON FUNCTION graph.knowledge_challenges_read(uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.knowledge_challenges_read(uuid, uuid, uuid, text) TO eye_app, eye_commit;

-- §PV.9 THE PROVENANCE AGENT (AG-014) ──────────────────────────────────────────────────────────────────────────────────────────────────────
/* Registration (0060's shape): an administrator registers an ACTIVE agent principal of this tenant holding provenance_agent in this domain, an
   accountable human owner and the bounds; one active agent per domain. */
CREATE OR REPLACE FUNCTION graph.register_provenance_agent(p_agent_id uuid, p_tenant uuid, p_domain uuid, p_principal uuid, p_version text, p_code_digest text,
    p_owner uuid, p_budgets jsonb, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, observation, identity, onboarding, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid := public.eye_principal(); v_kind text; v_status text; v_depth int; v_nodes int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.provenance.agent.register']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF v_actor IS NULL OR p_actor IS DISTINCT FROM v_actor OR onboarding.principal_kind(v_actor) IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION 'provenance agent rejected (actor): a registration is a named person''s act, recorded under the acting principal' USING ERRCODE = '42501';
  END IF;
  SELECT p.kind, p.status INTO v_kind, v_status FROM identity.principals p WHERE p.id = p_principal AND p.tenant_id = p_tenant;
  IF NOT FOUND OR v_kind <> 'agent' OR v_status <> 'active' THEN
    RAISE EXCEPTION 'provenance agent rejected (principal): the principal must be an active principal of kind agent in this tenant' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.role_bindings b WHERE b.principal_id = p_principal AND b.role_code = 'provenance_agent' AND b.revoked_at IS NULL AND b.domain_id = p_domain) THEN
    RAISE EXCEPTION 'provenance agent rejected (principal): the principal holds no provenance_agent binding in this domain' USING ERRCODE = '42501';
  END IF;
  IF p_owner IS NULL OR NOT EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = p_owner AND p.kind = 'human' AND p.status = 'active') THEN
    RAISE EXCEPTION 'provenance agent rejected (owner): the accountable owner must be an active human principal' USING ERRCODE = '42501';
  END IF;
  IF p_version IS NULL OR p_version !~ '^[0-9]+\.[0-9]+\.[0-9]+$' OR p_code_digest IS NULL OR p_code_digest !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'provenance agent rejected (identity): the agent version is semantic (x.y.z) and its code digest sha-256 hex' USING ERRCODE = '22023';
  END IF;
  v_depth := CASE WHEN coalesce(p_budgets ->> 'max_depth', '') ~ '^[0-9]{1,3}$' THEN (p_budgets ->> 'max_depth')::int END;
  v_nodes := CASE WHEN coalesce(p_budgets ->> 'max_nodes', '') ~ '^[0-9]{1,5}$' THEN (p_budgets ->> 'max_nodes')::int END;
  IF v_depth IS NULL OR v_depth < 1 OR v_depth > 16 OR v_nodes IS NULL OR v_nodes < 1 OR v_nodes > 2000 THEN
    RAISE EXCEPTION 'provenance agent rejected (budgets): the bounds are max_depth 1–16 and max_nodes 1–2000' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM graph.provenance_agents a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.status = 'active') THEN
    RAISE EXCEPTION 'provenance agent rejected (duplicate): this domain already has an active provenance agent; revoke it first' USING ERRCODE = '23505';
  END IF;
  INSERT INTO graph.provenance_agents (agent_id, scope, tenant_id, domain_id, principal_id, agent_version, code_digest, owner_principal_id, budgets, created_by, correlation_id)
  VALUES (p_agent_id, 'DOMAIN', p_tenant, p_domain, p_principal, p_version, p_code_digest, p_owner, jsonb_build_object('max_depth', v_depth, 'max_nodes', v_nodes), v_actor, p_correlation);
  INSERT INTO graph.provenance_agent_events (event_id, scope, tenant_id, domain_id, agent_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_agent_id, 'agent.registered', v_actor,
          jsonb_build_object('principal_id', p_principal, 'version', p_version, 'code_digest', p_code_digest, 'owner', p_owner, 'budgets', jsonb_build_object('max_depth', v_depth, 'max_nodes', v_nodes)), p_correlation);
  RETURN jsonb_build_object('agent_id', p_agent_id, 'principal_id', p_principal, 'version', p_version, 'code_digest', p_code_digest, 'owner', p_owner, 'budgets', jsonb_build_object('max_depth', v_depth, 'max_nodes', v_nodes), 'status', 'active');
END $$;
REVOKE ALL ON FUNCTION graph.register_provenance_agent(uuid, uuid, uuid, uuid, text, text, uuid, jsonb, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.register_provenance_agent(uuid, uuid, uuid, uuid, text, text, uuid, jsonb, uuid, uuid, uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION graph.revoke_provenance_agent(p_agent_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, observation, onboarding, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid := public.eye_principal();
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.provenance.agent.revoke']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF v_actor IS NULL OR p_actor IS DISTINCT FROM v_actor OR onboarding.principal_kind(v_actor) IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION 'provenance agent rejected (actor): a revocation is a named person''s act, recorded under the acting principal' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN
    RAISE EXCEPTION 'provenance agent rejected (reason): a revocation states its reason (8+ characters)' USING ERRCODE = '22023';
  END IF;
  UPDATE graph.provenance_agents SET status = 'revoked', revoked_at = clock_timestamp(), revoked_by = v_actor, revoke_reason = btrim(p_reason)
   WHERE agent_id = p_agent_id AND tenant_id = p_tenant AND domain_id = p_domain AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'provenance agent rejected (unknown_agent): no active provenance agent % in this domain', p_agent_id USING ERRCODE = '23503'; END IF;
  INSERT INTO graph.provenance_agent_events (event_id, scope, tenant_id, domain_id, agent_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_agent_id, 'agent.revoked', v_actor, jsonb_build_object('reason', btrim(p_reason)), p_correlation);
  RETURN jsonb_build_object('agent_id', p_agent_id, 'status', 'revoked');
END $$;
REVOKE ALL ON FUNCTION graph.revoke_provenance_agent(uuid, uuid, uuid, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.revoke_provenance_agent(uuid, uuid, uuid, text, uuid, uuid, uuid) TO eye_commit;

/* The agent's own session (identity.agent_session_open's shape over THIS registry; 0060 §4): an identity-operation context, an active
   registration whose version and code digest are the code's, an active agent principal. */
CREATE OR REPLACE FUNCTION graph.provenance_agent_session_open(p_session uuid, p_agent_id uuid, p_tenant uuid, p_domain uuid, p_agent_version text, p_code_digest text,
    p_refresh_hash text, p_context_key_hash text, p_expires_at timestamptz, p_family uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a graph.provenance_agents%ROWTYPE; v_kind text; v_status text;
BEGIN
  IF public.eye_ctx_mode() <> 'identity_op' THEN
    RAISE EXCEPTION 'agent session denied: identity operation capability required (context is %)', public.eye_ctx_mode() USING ERRCODE = '42501';
  END IF;
  IF p_expires_at IS NULL OR p_expires_at > clock_timestamp() + interval '1 day' THEN
    RAISE EXCEPTION 'agent session denied: a provenance run session is bounded to one day' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO a FROM graph.provenance_agents x WHERE x.agent_id = p_agent_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'agent session denied: no such provenance agent in this domain' USING ERRCODE = '42501'; END IF;
  IF a.status <> 'active' THEN RAISE EXCEPTION 'agent session denied: agent grant is revoked' USING ERRCODE = '42501'; END IF;
  IF a.agent_version IS DISTINCT FROM p_agent_version OR a.code_digest IS DISTINCT FROM p_code_digest THEN
    RAISE EXCEPTION 'agent session denied: agent instance or code digest does not match the registration' USING ERRCODE = '42501';
  END IF;
  SELECT p.kind, p.status INTO v_kind, v_status FROM identity.principals p WHERE p.id = a.principal_id;
  IF v_kind IS DISTINCT FROM 'agent' OR v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'agent session denied: principal is not an active agent principal' USING ERRCODE = '42501';
  END IF;
  PERFORM identity.session_open(p_session, a.principal_id, 'agent_grant', p_refresh_hash, p_context_key_hash, p_expires_at, p_family);
  RETURN a.principal_id;
END $$;
REVOKE ALL ON FUNCTION graph.provenance_agent_session_open(uuid, uuid, uuid, uuid, text, text, text, text, timestamptz, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.provenance_agent_session_open(uuid, uuid, uuid, uuid, text, text, text, text, timestamptz, uuid) TO eye_identity;

/* THE ONE SURFACE: the domain's active provenance agent (the acting principal, its version and code digest the registration's) constructs the
   lineage edges of a product's recorded history — every resolved upstream reference of every version in the bounded closure, idempotently —
   and records the run with EVERY gap it found (an unresolved reference, a claim without lineage, broken custody, an unverifiable artifact, the
   bound reached). It never constructs an edge to what does not resolve, never marks fitness, never decides: deterministic, no model. A run id
   replayed answers the recorded run. */
CREATE OR REPLACE FUNCTION graph.provenance_construct(p_run_id uuid, p_tenant uuid, p_domain uuid, p_type text, p_id uuid, p_version int, p_agent_version text, p_code_digest text, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, objects, observation, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid := public.eye_principal(); a graph.provenance_agents%ROWTYPE; r graph.provenance_runs%ROWTYPE; cl jsonb; ed jsonb; f jsonb; t jsonb; v_new int := 0; v_old int := 0;
        v_started timestamptz := clock_timestamp(); v_gaps jsonb; v_trunc boolean; n int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.provenance.construct']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO a FROM graph.provenance_agents x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.status = 'active';
  IF NOT FOUND OR v_actor IS DISTINCT FROM a.principal_id THEN
    RAISE EXCEPTION 'provenance agent rejected (authority): only the domain''s active provenance agent constructs lineage edges' USING ERRCODE = '42501';
  END IF;
  IF a.agent_version IS DISTINCT FROM p_agent_version OR a.code_digest IS DISTINCT FROM p_code_digest THEN
    RAISE EXCEPTION 'provenance agent rejected (authority): the agent''s version or code digest is not the registration''s (% / %)', a.agent_version, left(a.code_digest, 12) USING ERRCODE = '42501';
  END IF;
  IF p_run_id IS NULL THEN RAISE EXCEPTION 'provenance agent rejected (request): a run carries its id' USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM graph.provenance_runs x WHERE x.run_id = p_run_id;
  IF FOUND THEN
    IF r.subject_id <> p_id OR r.subject_version <> p_version OR r.agent_id <> a.agent_id THEN
      RAISE EXCEPTION 'provenance agent rejected (duplicate): run % already constructed another subject; a new run takes a new id', p_run_id USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('run_id', r.run_id, 'outcome', r.outcome, 'examined', r.examined, 'edges_constructed', r.edges_constructed, 'edges_existing', r.edges_existing, 'gaps', r.gaps, 'truncated', r.truncated, 'replayed', true);
  END IF;
  IF p_type IS NULL OR p_type !~ '^[A-Z]{3}$' OR p_id IS NULL OR p_version IS NULL OR p_version < 1 THEN
    RAISE EXCEPTION 'provenance agent rejected (subject): a construction names a recorded product as type, id and version' USING ERRCODE = '22023';
  END IF;
  cl := graph.pv_closure(p_tenant, p_domain, p_type, p_id, p_version, (a.budgets ->> 'max_depth')::int, (a.budgets ->> 'max_nodes')::int);
  IF cl IS NULL THEN
    RAISE EXCEPTION 'provenance agent rejected (unknown_object): % % v% is not recorded in this domain; there is no history to construct', p_type, p_id, p_version USING ERRCODE = '23503';
  END IF;
  -- the run row first (the edges reference it; deferred), its counts from what follows
  v_gaps := cl -> 'gaps'; v_trunc := (cl ->> 'truncated')::boolean;
  IF v_trunc THEN v_gaps := v_gaps || jsonb_build_array(jsonb_build_object('kind', 'incomplete_lineage', 'ref', cl ->> 'root', 'at', cl ->> 'root',
    'reason', format('the bound was reached (max_depth %s, max_nodes %s); history beyond it was not examined', a.budgets ->> 'max_depth', a.budgets ->> 'max_nodes'))); END IF;
  FOR ed IN SELECT * FROM jsonb_array_elements(cl -> 'edges') LOOP
    CONTINUE WHEN ed ->> 'to' IS NULL;
    f := graph.pv_ref(ed ->> 'from'); t := graph.pv_ref(ed ->> 'to');
    INSERT INTO graph.provenance_edges (edge_id, scope, tenant_id, domain_id, dependent_type, dependent_id, dependent_version, upstream_type, upstream_id, upstream_version, basis, span, version_resolution, run_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, f ->> 'type', (f ->> 'id')::uuid, (f ->> 'version')::int, t ->> 'type', (t ->> 'id')::uuid, (t ->> 'version')::int, ed ->> 'basis',
            CASE WHEN jsonb_typeof(ed -> 'span') = 'object' THEN ed -> 'span' END, CASE WHEN ed ->> 'resolution' IN ('recorded', 'latest_at_construction', 'evidence_digest') THEN ed ->> 'resolution' ELSE 'recorded' END, p_run_id)
    ON CONFLICT ON CONSTRAINT gpve_one DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n = 1 THEN v_new := v_new + 1; ELSE v_old := v_old + 1; END IF;
  END LOOP;
  INSERT INTO graph.provenance_runs (run_id, scope, tenant_id, domain_id, agent_id, principal_id, agent_version, code_digest, subject_type, subject_id, subject_version, outcome, examined,
                                     edges_constructed, edges_existing, gaps, truncated, budgets, started_at, correlation_id)
  VALUES (p_run_id, 'DOMAIN', p_tenant, p_domain, a.agent_id, v_actor, a.agent_version, a.code_digest, p_type, p_id, p_version,
          CASE WHEN jsonb_array_length(v_gaps) > 0 OR v_trunc THEN 'incomplete' ELSE 'complete' END, (cl ->> 'examined')::int, v_new, v_old, v_gaps, v_trunc, a.budgets, v_started, p_correlation)
  RETURNING * INTO r;
  RETURN jsonb_build_object('run_id', r.run_id, 'subject', cl ->> 'root', 'outcome', r.outcome, 'examined', r.examined, 'edges_constructed', r.edges_constructed, 'edges_existing', r.edges_existing,
                            'gaps', r.gaps, 'truncated', r.truncated, 'agent', jsonb_build_object('agent_id', a.agent_id, 'version', a.agent_version, 'code_digest', a.code_digest), 'replayed', false);
END $$;
REVOKE ALL ON FUNCTION graph.provenance_construct(uuid, uuid, uuid, text, uuid, int, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.provenance_construct(uuid, uuid, uuid, text, uuid, int, text, text, uuid) TO eye_commit;

/* The registry and the latest runs (read scope enforced). */
CREATE OR REPLACE FUNCTION graph.provenance_agent_state(p_tenant uuid, p_domain uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the provenance agent');
  RETURN jsonb_build_object(
    'agents', (SELECT coalesce(jsonb_agg(jsonb_build_object('agent_id', a.agent_id, 'principal_id', a.principal_id, 'version', a.agent_version, 'code_digest', a.code_digest, 'owner', a.owner_principal_id,
                 'budgets', a.budgets, 'status', a.status, 'created_at', graph.pv_iso(a.created_at), 'revoked_at', graph.pv_iso(a.revoked_at), 'revoke_reason', a.revoke_reason) ORDER BY a.created_at DESC), '[]'::jsonb)
               FROM graph.provenance_agents a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain),
    'runs', (SELECT coalesce(jsonb_agg(jsonb_build_object('run_id', r.run_id, 'subject', r.subject_type || ':' || r.subject_id || '@' || r.subject_version, 'outcome', r.outcome, 'examined', r.examined,
                 'edges_constructed', r.edges_constructed, 'edges_existing', r.edges_existing, 'gaps', jsonb_array_length(r.gaps), 'finished_at', graph.pv_iso(r.finished_at)) ORDER BY r.finished_at DESC), '[]'::jsonb)
             FROM (SELECT * FROM graph.provenance_runs x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain ORDER BY x.finished_at DESC LIMIT 50) r));
END $$;
REVOKE ALL ON FUNCTION graph.provenance_agent_state(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.provenance_agent_state(uuid, uuid) TO eye_app, eye_commit;

-- ═══ B50 integration (§CI × §PV) ═══
-- graph._open_challenge — §CI's stub (0120 §CI), re-declared WHOLE here (§PV folds after §CI) to add §PV's KNOWLEDGE CHALLENGES: an object whose
-- open or under-review knowledge challenge names it is `challenged` in the affected-product classification (AI-06-004). Nothing else changes.
CREATE OR REPLACE FUNCTION graph._open_challenge(p_tenant uuid, p_domain uuid, p_kind text, p_id uuid, p_version int) RETURNS boolean
LANGUAGE sql STABLE SET search_path = graph, pg_catalog, pg_temp AS $$
  SELECT (p_kind = 'simulation' AND EXISTS (SELECT 1 FROM simulation.challenges c WHERE c.run_id = p_id AND c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.state IN ('open', 'rerun_requested')))
      OR (p_kind = 'decision_package' AND EXISTS (SELECT 1 FROM decision.challenges c WHERE c.package_id = p_id AND (p_version IS NULL OR c.version = p_version) AND c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.resolved_at IS NULL))
      OR EXISTS (SELECT 1 FROM graph.impact_triggers t WHERE t.object_id = p_id AND t.tenant_id = p_tenant AND t.domain_id = p_domain AND t.trigger_kind = 'human_challenge' AND t.closed_at IS NULL)
      -- B50 integration: §PV's knowledge challenges (open or under review), any version of the subject unless one is named
      OR EXISTS (SELECT 1 FROM graph.knowledge_challenges k WHERE k.subject_id = p_id AND (p_version IS NULL OR k.subject_version = p_version) AND k.tenant_id = p_tenant AND k.domain_id = p_domain AND k.state IN ('open', 'under_review'));
$$;
REVOKE ALL ON FUNCTION graph._open_challenge(uuid, uuid, text, uuid, int) FROM PUBLIC;

-- ═══ B50 integration (§PV × §CL) ═══
-- graph._pv_raise_overdue: an ESCALATED (overdue) knowledge challenge routed to the subject's owner as an attention item of §CL's class
-- `knowledge_challenge_overdue` (the 0107 idiom §CL's _cl_raise follows: evaluated under the domain's ACTIVE policy, routed, its event
-- recorded); one item per escalation — a repeated call answers the item it made.
CREATE OR REPLACE FUNCTION graph._pv_raise_overdue(k graph.knowledge_challenges, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path = graph, executive, identity, pg_catalog, pg_temp AS $$
DECLARE pol executive.attention_policies%ROWTYPE; v_eval jsonb; v_route jsonb; v_state text; v_owner uuid; v_item uuid := gen_random_uuid();
        v_cause uuid := md5('b50pv:' || k.challenge_id::text || ':' || k.escalations::text)::uuid; x executive.attention_items%ROWTYPE;
BEGIN
  SELECT * INTO x FROM executive.attention_items i WHERE i.tenant_id = k.tenant_id AND i.domain_id = k.domain_id AND i.signal_class = 'knowledge_challenge_overdue' AND i.subject_id = k.challenge_id AND i.cause_event_id = v_cause;
  IF FOUND THEN RETURN jsonb_build_object('item_id', x.item_id, 'repeated', true, 'state', x.state, 'owner', x.owner_principal_id); END IF;
  v_owner := CASE WHEN decision.is_active_human(k.subject_owner, k.tenant_id) THEN k.subject_owner END;
  SELECT * INTO pol FROM executive.attention_policies a WHERE a.tenant_id = k.tenant_id AND a.domain_id = k.domain_id AND a.state = 'active';
  v_eval := executive.evaluate_attention(CASE WHEN pol.policy_id IS NULL THEN NULL ELSE pol.rules END, 'knowledge_challenge_overdue',
                                         jsonb_build_object('consequence', 'C2', 'confidence', 1, 'hours_to_window', 0)) || jsonb_build_object('policy_version', pol.version);
  v_route := executive.attention_route(pol.rules, 'knowledge_challenge_overdue', v_eval ->> 'outcome', v_owner, k.tenant_id, k.domain_id);
  v_state := v_route ->> 'state';
  INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state,
                                         owner_principal_id, route_roles, policy_id, policy_version, evaluation, details, due_at, escalations, correlation_id)
  VALUES (v_item, 'DOMAIN', k.tenant_id, k.domain_id, 'knowledge_challenge_overdue', 'knowledge_challenge', k.challenge_id, v_cause, 'KnowledgeChallengeOverdue',
          left(format('Challenge of %s %s is overdue (escalation %s; next review by %s)', k.subject_type, left(k.subject_id::text, 8), k.escalations, graph.pv_iso(k.review_by)), 512),
          v_eval ->> 'outcome', v_state, v_owner, ARRAY(SELECT jsonb_array_elements_text(v_route -> 'route_roles')), pol.policy_id, pol.version, v_eval,
          jsonb_build_object('challenge_id', k.challenge_id, 'subject', k.subject_type || ':' || k.subject_id || '@' || k.subject_version, 'escalations', k.escalations,
                             'review_by', graph.pv_iso(k.review_by), 'link', '/graph/challenges'),
          (v_route ->> 'due_at')::timestamptz, coalesce((v_route ->> 'escalations')::int, 0), coalesce(p_correlation, gen_random_uuid()));
  PERFORM executive.attention_event(v_item, k.tenant_id, k.domain_id,
            CASE v_state WHEN 'open' THEN 'item.routed' WHEN 'escalated' THEN 'item.escalated' WHEN 'unrouted' THEN 'item.unrouted' ELSE 'item.deprioritized' END, p_actor,
            jsonb_build_object('outcome', v_eval ->> 'outcome', 'reasons', v_eval -> 'reasons', 'policy_version', pol.version, 'owner', v_owner, 'route_roles', v_route -> 'route_roles',
                               'due_at', v_route -> 'due_at', 'cause_event_id', v_cause, 'cause_event_type', 'KnowledgeChallengeOverdue', 'unrouted', coalesce((v_route ->> 'unrouted')::boolean, false)),
            coalesce(p_correlation, gen_random_uuid()));
  RETURN jsonb_build_object('item_id', v_item, 'repeated', false, 'state', v_state, 'owner', v_owner, 'outcome', v_eval ->> 'outcome');
END $$;
REVOKE ALL ON FUNCTION graph._pv_raise_overdue(graph.knowledge_challenges, uuid, uuid) FROM PUBLIC;

-- graph.escalate_knowledge_challenge re-declared WHOLE: the same port, the overdue challenge now routed (above).
CREATE OR REPLACE FUNCTION graph.escalate_knowledge_challenge(p_challenge_id uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = graph, observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; k graph.knowledge_challenges; v_now timestamptz := clock_timestamp(); v_was timestamptz;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.provenance.challenge.escalate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := graph.pv_challenge_actor(p_actor);
  k := graph.pv_challenge_lock(p_challenge_id, p_tenant, p_domain);
  IF NOT (v_actor = k.opened_by OR v_actor IS NOT DISTINCT FROM k.subject_owner OR v_actor IS NOT DISTINCT FROM k.reviewer
          OR governance.holds_role(v_actor, p_tenant, p_domain, ARRAY['domain_admin', 'knowledge_owner'])) THEN
    RAISE EXCEPTION 'knowledge challenge rejected (actor): an overdue challenge is escalated by a party to it or a domain administrator' USING ERRCODE = '42501';
  END IF;
  IF k.state NOT IN ('open', 'under_review') THEN
    RAISE EXCEPTION 'knowledge challenge rejected (state): challenge % is %; only a live challenge is escalated', p_challenge_id, k.state USING ERRCODE = '22023';
  END IF;
  IF v_now <= k.review_by THEN
    RAISE EXCEPTION 'knowledge challenge rejected (state): challenge % is not overdue; its review is due by % (the database clock reads %)', p_challenge_id, graph.pv_iso(k.review_by), graph.pv_iso(v_now) USING ERRCODE = '22023';
  END IF;
  IF k.escalations >= 5 THEN
    RAISE EXCEPTION 'knowledge challenge rejected (state): challenge % was escalated five times; the domain administrator decides it', p_challenge_id USING ERRCODE = '22023';
  END IF;
  v_was := k.review_by;
  UPDATE graph.knowledge_challenges SET escalations = escalations + 1, escalated_at = v_now, review_by = v_now + interval '2 days' WHERE challenge_id = p_challenge_id RETURNING * INTO k;
  PERFORM graph.pv_challenge_event(k, 'challenge.escalated', v_actor, jsonb_build_object('was_due', graph.pv_iso(v_was), 'escalations', k.escalations, 'escalate_to_roles', jsonb_build_array('domain_admin'),
    'next_due', graph.pv_iso(k.review_by)), p_correlation);
  -- B50 integration (§PV × §CL): the overdue challenge is ROUTED into the attention queue under §CL's class knowledge_challenge_overdue
  RETURN graph.pv_challenge_answer(k, false) || jsonb_build_object('escalated_to_roles', jsonb_build_array('domain_admin'), 'was_due', graph.pv_iso(v_was),
    'attention', graph._pv_raise_overdue(k, v_actor, p_correlation));
END $$;
REVOKE ALL ON FUNCTION graph.escalate_knowledge_challenge(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.escalate_knowledge_challenge(uuid, uuid, uuid, uuid, uuid) TO eye_commit;
