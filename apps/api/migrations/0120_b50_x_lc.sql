-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0120 §LC — CP-6 B50: THE GOVERNED WORK-OBJECT LIFECYCLE (F-P3-02: PR-06-001/002/003/005/006, CAP-AU-07, AT-06, ADR-006; F-P3-01:
-- V03-T-021, V04-T-006; F-P7-F-03: V01-T-046's "lifecycle coverage" measure, carried). Part-local; applies ALONE on 0001–0119 + the 0120
-- prelude (§0). Folded after §HD at integration. Nothing of 0001–0119 or of §0 is re-declared here except the two definitions named below,
-- each copied WHOLE from its last definition with the change marked `-- B50 lc`.
--
-- THE GAP. The canonical store's lifecycle vocabulary had no draft, reviewed, approved, published or retired (0006:15): ADR-006's eight
-- states were not distinct, no object type declared its lifecycle, a transition was any new version anyone holding a write action admitted,
-- nothing kept a rejected or a duplicated attempt, and nothing could replay where a work object stood at an instant from its own record.
--
-- THE MECHANISM (DESIGN D4, D5).
--   the vocabulary         objects.canonical_objects' lifecycle_state CHECK widened with ADR-006's five absent states (draft, reviewed,
--                          approved, published, retired) — the existing nine keep their meaning; objects.assert_header_semantics (0012)
--                          copied whole with the same list. No header field is added; no version is rewritten (the CHECK only widens).
--   objects.lifecycle_profiles     per canonical type, VERSIONED, APPEND-ONLY, written by migrations only: its own states, the map from each
--                          to ADR-006's canonical words, the canonical record states that AGREE with each module state (the reconciliation
--                          rule), the transition contracts (action, from, to, actor class owner | reviewer | approver, kind forward |
--                          re_entry | compensation, separation, re-entry reasons) and the OWNING PORT. A module-owned type (sources,
--                          exposures, memory, forecasts, warnings, publications, packages, briefings, claims, evidence, graph revisions)
--                          keeps its own port — this machine MAPS its states and never adds a second write path (0069:79 stands); the
--                          work-object types (ASM@v3 first: the person-authored assessment, DESIGN D5) move through objects.transition_lifecycle.
--   objects.lifecycle_transitions  APPEND-ONLY: every attempted transition of a work object — accepted | rejected | compensated — with the
--                          attempted action and command, the last authoritative version, the new version, the refusal (class, code, words),
--                          the kind, the causation and correlation, the re-entry reason, the policy context (decision id, bundle version)
--                          and the idempotency key (a repeat answers the FIRST result — PR-06-005).
--   objects.lifecycle_proposals / objects.lifecycle_proposal_decisions   APPEND-ONLY: views, agents, models, imports and projections PROPOSE;
--                          only the accountable owner DECIDES (accept performs the transition through the same rules; decline records why).
--   objects.lifecycle_current      the current state per work object (a security_invoker view over the ledger).
--   ports                  objects.author_work_object (objects.work_object.author — a named person authors the draft, version 1, written in
--                          SQL through objects.admit_version), objects.transition_lifecycle (objects.lifecycle.transition — the new canonical
--                          version written IN SQL from the prior one through admit: expected version + idempotency key; the owner alone, or
--                          the profile's reviewer / approver; separation re-checked; an invalid, duplicated, out-of-order, stale, untyped or
--                          ownerless transition REJECTED and kept; a compensation restores the state before the last accepted transition and
--                          is kept as COMPENSATED), objects.propose_lifecycle (objects.lifecycle.propose), objects.decide_lifecycle_proposal
--                          (objects.lifecycle.proposal.decide). SECURITY DEFINER, eye_commit, the route's action asserted, the scope of the
--                          established context, the acting principal = eye_principal(), the human / role / separation checks in the port.
--   reads                  objects.lifecycle_profiles_read, objects.lifecycle_objects, objects.lifecycle_history, objects.lifecycle_replay
--                          (the state at an instant from the recorded versions, cross-checked with the ledger), objects.lifecycle_reconcile
--                          (every object of a profiled type whose module state and canonical record disagree, every work-object version
--                          written outside the ledger), objects.lifecycle_export / objects.lifecycle_verify_export (the history exported
--                          with every version's header and payload; re-imported, each digest recomputes and the replay is re-derived).
--   the measure            analytics.mc_v1_lifecycle_coverage (0113 §0.7 contract) registered as `v1_lifecycle_coverage` (V01-T-046).
--   the continuity contract  "lifecycle register unavailable" is DECLARED through B81's shell.degraded_contracts against the dependency that
--                          makes it unavailable — the authoritative audit journal (kind audit, key journal; a transition is refused fail-closed
--                          while the journal cannot record it) — listing objects.lifecycle.* unavailable and objects.lifecycle.read available.
--                          No shell definition changes (the act declares it; the harness proves the evaluation).
--   refusals               the class form `lifecycle transition rejected (<class>): …`, `lifecycle proposal rejected (<class>): …`,
--                          `work object rejected (<class>): …` — 403 actor|authority|separation_of_duties · 404 unknown_* · 409
--                          state|stale|duplicate · 422 the rest. NOTE (the integrator): the three nouns are not mapped centrally yet
--                          (observation-errors.ts); apps/api/src/objects/lifecycle/lifecycle.service.ts maps them meanwhile.
--
-- THREE CLAIMS: construction (this file, phase6-lifecycle-b50.test.ts — every persona, assessment and contract there SYNTHETIC); demonstrated
-- operation (the act: D. Ivanova's Red Sea assessment on eye_demo, SYNTHETIC); real acceptance (PR-06-006 / AT-06: the shared recording path
-- at B111, then R2) — never claimed here.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §LC.0 THE VOCABULARY (ADR-006, DESIGN D4) ──────────────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid = 'objects.canonical_objects'::regclass AND c.conname = 'canonical_objects_lifecycle_state_check') THEN
    RAISE EXCEPTION 'migration 0120 §LC: the 0006 lifecycle_state CHECK (canonical_objects_lifecycle_state_check) was not found';
  END IF;
END $$;
-- B50 lc: the 0006 CHECK copied whole and widened with ADR-006's five absent states (draft, reviewed, approved, published, retired).
ALTER TABLE objects.canonical_objects DROP CONSTRAINT canonical_objects_lifecycle_state_check;
ALTER TABLE objects.canonical_objects ADD CONSTRAINT canonical_objects_lifecycle_state_check CHECK (lifecycle_state IN
    ('proposed','admitted','active','disputed','corrected','withdrawn','superseded','archived','deleted',
     /* B50 lc */ 'draft','reviewed','approved','published','retired'));

/* The 0012 definition copied WHOLE; the one change is the lifecycle list (marked B50 lc). */
CREATE OR REPLACE FUNCTION objects.assert_header_semantics(p_header jsonb)
RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path = objects, pg_catalog, pg_temp AS $$
DECLARE
  v_scope text := p_header->>'scope';
  v_recorded timestamptz;
  v_vf timestamptz := NULLIF(p_header->>'valid_from','')::timestamptz;
  v_vt timestamptz := NULLIF(p_header->>'valid_to','')::timestamptz;
BEGIN
  IF v_scope NOT IN ('PLATFORM','TENANT','DOMAIN') THEN
    RAISE EXCEPTION 'header semantics: scope % is not a canonical scope', v_scope USING ERRCODE = '22023';
  END IF;
  IF (v_scope = 'PLATFORM' AND (p_header->>'tenant_id' IS NOT NULL OR p_header->>'domain_id' IS NOT NULL))
     OR (v_scope = 'TENANT' AND (p_header->>'tenant_id' IS NULL OR p_header->>'domain_id' IS NOT NULL))
     OR (v_scope = 'DOMAIN' AND (p_header->>'tenant_id' IS NULL OR p_header->>'domain_id' IS NULL)) THEN
    RAISE EXCEPTION 'header semantics: scope/identifier combination is invalid' USING ERRCODE = '22023';
  END IF;
  IF p_header->>'object_type' !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'header semantics: object_type must be three uppercase letters' USING ERRCODE = '22023';
  END IF;
  IF p_header->>'object_version' !~ '^[1-9][0-9]{0,17}$' THEN
    RAISE EXCEPTION 'header semantics: object_version must be a positive integer string' USING ERRCODE = '22023';
  END IF;
  IF p_header->>'lifecycle_state' NOT IN
     ('proposed','admitted','active','disputed','corrected','withdrawn','superseded','archived','deleted',
      /* B50 lc */ 'draft','reviewed','approved','published','retired') THEN
    RAISE EXCEPTION 'header semantics: lifecycle_state % is not permitted', p_header->>'lifecycle_state'
      USING ERRCODE = '22023';
  END IF;
  IF p_header->>'truth_state' NOT IN
     ('observed','asserted','extracted','inferred','assessed','synthetic','decided','disputed','withdrawn') THEN
    RAISE EXCEPTION 'header semantics: truth_state % is not canonical', p_header->>'truth_state'
      USING ERRCODE = '22023';
  END IF;
  IF p_header->>'time_precision' NOT IN
     ('exact','second','minute','hour','day','month','year','approximate','unknown') THEN
    RAISE EXCEPTION 'header semantics: time_precision % is not permitted', p_header->>'time_precision'
      USING ERRCODE = '22023';
  END IF;
  IF p_header->>'source_clock_quality' NOT IN ('trusted','degraded','unknown') THEN
    RAISE EXCEPTION 'header semantics: source_clock_quality % is not permitted',
      p_header->>'source_clock_quality' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_header->'synthetic_state') <> 'boolean' THEN
    RAISE EXCEPTION 'header semantics: synthetic_state must be boolean' USING ERRCODE = '22023';
  END IF;
  IF p_header->>'truth_state' = 'synthetic' AND (p_header->>'synthetic_state')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'header semantics: synthetic truth state requires synthetic_state' USING ERRCODE = '22023';
  END IF;
  -- Structured values must be objects (or null), never scalars smuggled in.
  IF jsonb_typeof(p_header->'confidence') NOT IN ('object','null')
     OR jsonb_typeof(p_header->'uncertainty') NOT IN ('object','null')
     OR jsonb_typeof(p_header->'quality_state') NOT IN ('object','null')
     OR jsonb_typeof(p_header->'freshness_state') NOT IN ('object','null') THEN
    RAISE EXCEPTION 'header semantics: confidence/uncertainty/quality_state/freshness_state must be objects or null'
      USING ERRCODE = '22023';
  END IF;
  -- Reference arrays must be arrays of strings.
  IF jsonb_typeof(p_header->'evidence_refs') <> 'array'
     OR jsonb_typeof(p_header->'source_object_ids') <> 'array'
     OR jsonb_typeof(p_header->'contradiction_refs') <> 'array'
     OR jsonb_typeof(p_header->'corroboration_refs') <> 'array'
     OR jsonb_typeof(p_header->'human_refs') <> 'array' THEN
    RAISE EXCEPTION 'header semantics: reference fields must be arrays' USING ERRCODE = '22023';
  END IF;
  IF p_header->>'schema_ref' !~ '^[A-Z]{3}@v[0-9]+$' THEN
    RAISE EXCEPTION 'header semantics: schema_ref % must be <TYPE>@v<N>', p_header->>'schema_ref'
      USING ERRCODE = '22023';
  END IF;
  IF left(p_header->>'schema_ref', 3) <> p_header->>'object_type' THEN
    RAISE EXCEPTION 'header semantics: schema_ref does not match object_type' USING ERRCODE = '22023';
  END IF;
  -- Temporal constraints.
  IF v_vt IS NOT NULL AND v_vf IS NULL THEN
    RAISE EXCEPTION 'header semantics: valid_to requires valid_from' USING ERRCODE = '22023';
  END IF;
  IF v_vt IS NOT NULL AND v_vf IS NOT NULL AND v_vt <= v_vf THEN
    RAISE EXCEPTION 'header semantics: valid_to must be after valid_from' USING ERRCODE = '22023';
  END IF;
  -- Authoritative recorded_at: present, parseable, and not from the future.
  BEGIN
    v_recorded := (p_header->>'recorded_at')::timestamptz;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'header semantics: recorded_at is not a valid instant' USING ERRCODE = '22023';
  END;
  IF v_recorded IS NULL THEN
    RAISE EXCEPTION 'header semantics: recorded_at is required' USING ERRCODE = '22023';
  END IF;
  IF v_recorded > clock_timestamp() + interval '5 minutes' THEN
    RAISE EXCEPTION 'header semantics: recorded_at is in the future' USING ERRCODE = '22023';
  END IF;
  IF (p_header->>'audit_correlation_id') IS NULL THEN
    RAISE EXCEPTION 'header semantics: audit_correlation_id is required' USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_header->>'classification','') = '' OR coalesce(p_header->>'purpose_scope','') = ''
     OR coalesce(p_header->>'owning_component','') = '' OR coalesce(p_header->>'accountable_owner','') = '' THEN
    RAISE EXCEPTION 'header semantics: classification, purpose_scope, owning_component and accountable_owner are required'
      USING ERRCODE = '22023';
  END IF;
END $$;
REVOKE ALL ON FUNCTION objects.assert_header_semantics(jsonb) FROM PUBLIC;

/* The canonical lifecycle words (ADR-006's eight + the existing words they sit beside) — the profiles' maps name only these. */
CREATE OR REPLACE FUNCTION objects.lifecycle_canonical_states() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['draft', 'reviewed', 'approved', 'published', 'corrected', 'withdrawn', 'archived', 'retired',
               'proposed', 'admitted', 'active', 'disputed', 'superseded', 'deleted'] $$;
/* ADR-006's eight work-object states (b50-seams.ts WORK_OBJECT_STATES). */
CREATE OR REPLACE FUNCTION objects.work_object_states() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['draft', 'reviewed', 'approved', 'published', 'corrected', 'withdrawn', 'archived', 'retired'] $$;
/* The re-entry reasons a profile may declare (V03-T-021): a contradiction reopens resolution, a fitness failure invalidates, a policy change
   reopens a decision, a review finding returns a version to its author. */
CREATE OR REPLACE FUNCTION objects.lifecycle_reentry_reasons() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['contradiction', 'fitness_failure', 'policy_change', 'review_finding'] $$;
/* The refusal codes the ledger keeps (the class is what the HTTP answer reads; the code is what was wrong). */
CREATE OR REPLACE FUNCTION objects.lifecycle_refusal_codes() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['module_owned', 'unknown_action', 'stale_version', 'invalid_transition', 'target_mismatch', 'untyped_reentry', 'out_of_order',
               'ownerless', 'not_human', 'not_owner', 'not_reviewer', 'not_approver', 'separation', 'changes_not_allowed', 'changes_invalid',
               'nothing_to_compensate', 'reason_required'] $$;
GRANT EXECUTE ON FUNCTION objects.lifecycle_canonical_states(), objects.work_object_states(), objects.lifecycle_reentry_reasons(), objects.lifecycle_refusal_codes() TO eye_app, eye_commit;

-- §LC.1 THE TABLES ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* THE PROFILES (V04-T-006, CAP-AU-07): global (not tenant data), versioned, append-only, written by migrations only. */
CREATE TABLE objects.lifecycle_profiles (
  object_type     text NOT NULL CHECK (object_type ~ '^[A-Z]{3}$'),
  version         int  NOT NULL CHECK (version >= 1),
  governance      text NOT NULL CHECK (governance IN ('work_object', 'module', 'canonical', 'revision')),
  owning_port     text NOT NULL CHECK (length(btrim(owning_port)) >= 4),
  schema_ref      text CHECK (schema_ref IS NULL OR schema_ref ~ '^[A-Z]{3}@v[0-9]+$'),
  states          text[] NOT NULL CHECK (cardinality(states) >= 1),
  canonical_map   jsonb NOT NULL CHECK (jsonb_typeof(canonical_map) = 'object'),
  consistent      jsonb NOT NULL CHECK (jsonb_typeof(consistent) = 'object'),
  transitions     jsonb NOT NULL CHECK (jsonb_typeof(transitions) = 'array'),
  reviewer_roles  text[] NOT NULL DEFAULT '{}',
  approver_roles  text[] NOT NULL DEFAULT '{}',
  module_read     text NOT NULL CHECK (length(btrim(module_read)) >= 4),
  description     text NOT NULL CHECK (length(btrim(description)) >= 16),
  declared_in     text NOT NULL,
  declared_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (object_type, version),
  CONSTRAINT olp_work_object CHECK ((governance = 'work_object') = (owning_port = 'objects.transition_lifecycle')),
  CONSTRAINT olp_work_schema CHECK (governance <> 'work_object' OR schema_ref IS NOT NULL)
);
COMMENT ON TABLE objects.lifecycle_profiles IS 'B50 §LC (V04-T-006, CAP-AU-07, ADR-006): per canonical type, its lifecycle — states, the map to the canonical words, the reconciliation rule, the transition contracts and the owning port; versioned, append-only, written by migrations.';
CREATE TRIGGER olp_append_only BEFORE UPDATE OR DELETE ON objects.lifecycle_profiles FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* THE LEDGER (PR-06-002, PR-06-005, V03-T-021): every attempted transition of a work object, kept. */
CREATE TABLE objects.lifecycle_transitions (
  transition_id      uuid PRIMARY KEY,
  scope              text NOT NULL CHECK (scope = 'DOMAIN'),
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  object_type        text NOT NULL CHECK (object_type ~ '^[A-Z]{3}$'),
  object_id          uuid NOT NULL,
  profile_version    int NOT NULL,
  action             text NOT NULL CHECK (action ~ '^[a-z][a-z_]{2,40}$'),
  kind               text NOT NULL CHECK (kind IN ('forward', 're_entry', 'compensation')),
  outcome            text NOT NULL CHECK (outcome IN ('accepted', 'rejected', 'compensated')),
  from_state         text,
  to_state           text,
  expected_version   int,
  prior_version      int,                     -- the last authoritative version when the attempt was made (NULL only for the creation)
  new_version        int,                     -- the version the transition wrote (accepted / compensated); NULL when rejected
  attempted          jsonb NOT NULL CHECK (jsonb_typeof(attempted) = 'object'),
  refusal_class      text,
  refusal_code       text CHECK (refusal_code IS NULL OR refusal_code = ANY (objects.lifecycle_refusal_codes())),
  refusal_message    text,
  reason             text,
  reentry_reason     text CHECK (reentry_reason IS NULL OR reentry_reason = ANY (objects.lifecycle_reentry_reasons())),
  causation_id       uuid,
  correlation_ref    text CHECK (correlation_ref IS NULL OR length(correlation_ref) BETWEEN 1 AND 200),
  compensates        uuid REFERENCES objects.lifecycle_transitions (transition_id),
  proposal_id        uuid,
  actor_principal_id uuid NOT NULL,
  actor_class        text CHECK (actor_class IS NULL OR actor_class IN ('owner', 'reviewer', 'approver', 'author')),
  policy_decision_id uuid,
  bundle_version     text,
  idempotency_key    text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 200),
  command_digest     text NOT NULL CHECK (command_digest ~ '^[0-9a-f]{64}$'),
  recorded_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT olt_key UNIQUE (tenant_id, domain_id, idempotency_key),
  CONSTRAINT olt_outcome CHECK ((outcome = 'rejected') = (new_version IS NULL) AND (outcome = 'rejected') = (refusal_class IS NOT NULL)
                                AND (outcome = 'rejected') = (refusal_code IS NOT NULL)),
  CONSTRAINT olt_compensation CHECK ((outcome = 'compensated') = (kind = 'compensation' AND compensates IS NOT NULL) OR outcome = 'rejected'),
  CONSTRAINT olt_reentry CHECK (outcome = 'rejected' OR kind <> 're_entry' OR (reentry_reason IS NOT NULL AND causation_id IS NOT NULL)),
  CONSTRAINT olt_versions CHECK (new_version IS NULL OR new_version = coalesce(prior_version, 0) + 1)
);
COMMENT ON TABLE objects.lifecycle_transitions IS 'B50 §LC (PR-06-002/005, V03-T-021): every attempted lifecycle transition of a work object — accepted, rejected or compensated — with the attempted command, the last authoritative version, the causation, correlation and policy context; append-only.';
CREATE UNIQUE INDEX olt_version ON objects.lifecycle_transitions (object_id, new_version) WHERE new_version IS NOT NULL;
CREATE INDEX olt_object ON objects.lifecycle_transitions (object_id, recorded_at);
CREATE INDEX olt_scope ON objects.lifecycle_transitions (tenant_id, domain_id, recorded_at);
CREATE TRIGGER olt_append_only BEFORE UPDATE OR DELETE ON objects.lifecycle_transitions FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* THE PROPOSALS (PR-06-003): views, agents, models, imports and projections propose; the owner decides. */
CREATE TABLE objects.lifecycle_proposals (
  proposal_id           uuid PRIMARY KEY,
  scope                 text NOT NULL CHECK (scope = 'DOMAIN'),
  tenant_id             uuid NOT NULL,
  domain_id             uuid NOT NULL,
  object_type           text NOT NULL CHECK (object_type ~ '^[A-Z]{3}$'),
  object_id             uuid NOT NULL,
  base_version          int NOT NULL CHECK (base_version >= 1),
  action                text NOT NULL CHECK (action ~ '^[a-z][a-z_]{2,40}$'),
  to_state              text NOT NULL,
  proposer_principal_id uuid NOT NULL,
  proposer_kind         text NOT NULL CHECK (proposer_kind IN ('human', 'agent', 'workload')),
  via                   text NOT NULL CHECK (via IN ('view', 'agent', 'model', 'import', 'projection')),
  reason                text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  reentry_reason        text CHECK (reentry_reason IS NULL OR reentry_reason = ANY (objects.lifecycle_reentry_reasons())),
  causation_id          uuid,
  request_id            uuid NOT NULL UNIQUE,
  proposed_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id        uuid NOT NULL
);
COMMENT ON TABLE objects.lifecycle_proposals IS 'B50 §LC (PR-06-003): a lifecycle transition PROPOSED by a view, an agent, a model, an import or a projection — never authoritative; the accountable owner decides; append-only.';
CREATE INDEX olpr_object ON objects.lifecycle_proposals (object_id, proposed_at);
CREATE TRIGGER olpr_append_only BEFORE UPDATE OR DELETE ON objects.lifecycle_proposals FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE objects.lifecycle_proposal_decisions (
  proposal_id        uuid PRIMARY KEY REFERENCES objects.lifecycle_proposals (proposal_id),
  scope              text NOT NULL CHECK (scope = 'DOMAIN'),
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  decision           text NOT NULL CHECK (decision IN ('accepted', 'declined')),
  reason             text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  transition_id      uuid REFERENCES objects.lifecycle_transitions (transition_id),
  decided_by         uuid NOT NULL,
  decided_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  request_id         uuid NOT NULL UNIQUE,
  correlation_id     uuid NOT NULL,
  CONSTRAINT olpd_transition CHECK ((decision = 'accepted') = (transition_id IS NOT NULL))
);
COMMENT ON TABLE objects.lifecycle_proposal_decisions IS 'B50 §LC (PR-06-003): the owner''s decision on a lifecycle proposal — accepted (with the transition it performed) or declined (with why); append-only.';
CREATE TRIGGER olpd_append_only BEFORE UPDATE OR DELETE ON objects.lifecycle_proposal_decisions FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* RLS: a domain's rows within its tenant (and, for a DOMAIN context, its domain); the profiles to every bound principal. No write grant. */
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['lifecycle_transitions', 'lifecycle_proposals', 'lifecycle_proposal_decisions'] LOOP
    EXECUTE format('ALTER TABLE objects.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE objects.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY olc_visible ON objects.%I FOR SELECT TO eye_app, eye_commit USING (
        tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()))$f$, t);
    EXECUTE format('GRANT SELECT ON objects.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;
ALTER TABLE objects.lifecycle_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE objects.lifecycle_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY olp_visible ON objects.lifecycle_profiles FOR SELECT TO eye_app, eye_commit USING (public.eye_principal() IS NOT NULL);
GRANT SELECT ON objects.lifecycle_profiles TO eye_app, eye_commit;

/* THE CURRENT STATE per work object (PR-06-002): the latest transition that wrote a version. INVOKER: the ledger's RLS applies. */
CREATE OR REPLACE VIEW objects.lifecycle_current WITH (security_invoker = true) AS
  SELECT DISTINCT ON (t.object_id) t.tenant_id, t.domain_id, t.object_type, t.object_id, t.to_state AS state, t.new_version AS version,
         t.transition_id, t.action, t.kind, t.outcome, t.actor_principal_id, t.recorded_at
    FROM objects.lifecycle_transitions t
   WHERE t.outcome IN ('accepted', 'compensated')
   ORDER BY t.object_id, t.new_version DESC;
GRANT SELECT ON objects.lifecycle_current TO eye_app, eye_commit;

-- §LC.2 THE PROFILES (V04-T-006: every type's lifecycle declared; RSK and MEM exist — the row's "absent" was stale) ──────────────────────
/* The work-object form of an assessment (DESIGN D5): authored by a person, reviewed, approved, published, corrected, retired. ASM@v1/v2
   (the extraction and import forms) keep their own path (intelligence.claim.admit, retention.import.admit). */
INSERT INTO objects.schema_registry (object_type, schema_version, json_schema, compatibility) VALUES ('ASM', 'v3', '{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["form", "title", "statement", "body", "act"],
  "properties": {
    "form": { "const": "work_object" },
    "title": { "type": "string", "minLength": 8, "maxLength": 300 },
    "statement": { "type": "string", "minLength": 16, "maxLength": 8000 },
    "body": { "type": "object" },
    "review": { "type": ["object", "null"] },
    "approval": { "type": ["object", "null"] },
    "act": {
      "type": "object",
      "required": ["action", "by", "at"],
      "properties": { "action": { "type": "string" }, "by": { "type": "string" }, "at": { "type": "string" }, "reason": { "type": ["string", "null"] },
                      "transition_id": { "type": ["string", "null"] }, "kind": { "type": "string" } }
    }
  }
}'::jsonb, 'breaking');

INSERT INTO objects.lifecycle_profiles (object_type, version, governance, owning_port, schema_ref, states, canonical_map, consistent, transitions, reviewer_roles, approver_roles, module_read, description, declared_in) VALUES
  ('ASM', 1, 'work_object', 'objects.transition_lifecycle', 'ASM@v3',
   ARRAY['draft', 'reviewed', 'approved', 'published', 'corrected', 'superseded', 'withdrawn', 'archived', 'retired'],
   '{"draft":"draft","reviewed":"reviewed","approved":"approved","published":"published","corrected":"corrected","superseded":"superseded","withdrawn":"withdrawn","archived":"archived","retired":"retired"}',
   '{"draft":["draft"],"reviewed":["reviewed"],"approved":["approved"],"published":["published"],"corrected":["corrected"],"superseded":["superseded"],"withdrawn":["withdrawn"],"archived":["archived"],"retired":["retired"]}',
   '[{"action":"review","from":["draft"],"to":"reviewed","actor":"reviewer","kind":"forward","separation":["author"],"reason":"findings"},
     {"action":"approve","from":["reviewed"],"to":"approved","actor":"approver","kind":"forward","separation":["author","reviewer"],"reason":"rationale"},
     {"action":"publish","from":["reviewed","approved"],"to":"published","actor":"owner","kind":"forward","separation":[]},
     {"action":"correct","from":["published","corrected"],"to":"corrected","actor":"owner","kind":"forward","separation":[],"changes":true,"reason":"what changed and why"},
     {"action":"supersede","from":["published","corrected"],"to":"superseded","actor":"owner","kind":"forward","separation":[],"reason":"what supersedes it"},
     {"action":"withdraw","from":["reviewed","approved","published","corrected"],"to":"withdrawn","actor":"owner","kind":"forward","separation":[],"reason":"why it is withdrawn"},
     {"action":"archive","from":["published","corrected","superseded"],"to":"archived","actor":"owner","kind":"forward","separation":[]},
     {"action":"retire","from":["published","corrected","superseded","archived"],"to":"retired","actor":"owner","kind":"forward","separation":[],"reason":"why it is retired"},
     {"action":"reopen","from":["reviewed","approved","published","corrected"],"to":"draft","actor":"owner","kind":"re_entry","separation":[],"reentry_reasons":["contradiction","fitness_failure","policy_change","review_finding"],"reason":"what reopened it"},
     {"action":"compensate","from":["*"],"to":"*","actor":"owner","kind":"compensation","separation":[],"reason":"why the last transition is undone"}]',
   ARRAY['knowledge_owner', 'domain_analyst', 'domain_specialist', 'record_authority'], ARRAY['knowledge_owner', 'record_authority', 'decision_approver'],
   'objects.lifecycle_transitions (the ledger) and the canonical versions it wrote',
   'The person-authored assessment (DESIGN D5): one work-object state machine — authored as a draft by its owner, reviewed by another person, optionally approved by a third, published, corrected, superseded, archived or retired by its owner, withdrawn (terminal: MET-008''s rule — a withdrawn record changes only by a correction); a return to draft only as a typed re-entry', '0120 §LC'),
  ('SRC', 1, 'module', 'observation.transition_contract', NULL,
   ARRAY['draft', 'approved', 'active', 'suspended', 'retired', 'superseded'],
   '{"draft":"draft","approved":"approved","active":"published","suspended":"withdrawn","retired":"retired","superseded":"superseded"}',
   '{"draft":["admitted"],"approved":["admitted"],"active":["admitted"],"suspended":["admitted"],"retired":["admitted"],"superseded":["admitted"]}',
   '[{"action":"approve","from":["draft"],"to":"approved","actor":"approver","kind":"forward","separation":["author"],"roles":["collection_manager"]},
     {"action":"activate","from":["approved","suspended"],"to":"active","actor":"approver","kind":"forward","separation":[],"roles":["collection_manager"]},
     {"action":"suspend","from":["active"],"to":"suspended","actor":"owner","kind":"forward","separation":[],"roles":["collection_manager"]},
     {"action":"retire","from":["approved","active","suspended"],"to":"retired","actor":"owner","kind":"forward","separation":[],"roles":["collection_manager"]},
     {"action":"supersede","from":["draft","approved","active","suspended"],"to":"superseded","actor":"owner","kind":"forward","separation":[],"roles":["collection_manager"]}]',
   '{}', ARRAY['collection_manager'], 'observation.source_contracts_current.lifecycle_state (the SRC canonical object is the immutable contract record: admitted)',
   'A source contract: draft → approved → active → suspended → retired (or superseded by a new contract version) — the collection service''s port; the canonical SRC object is the contract''s immutable record', '0120 §LC'),
  ('RSK', 1, 'module', 'prediction.exposure.*', NULL,
   ARRAY['identified', 'assessed', 'accepted', 'contested', 'sponsored', 'closed'],
   '{"identified":"draft","assessed":"reviewed","accepted":"approved","contested":"reviewed","sponsored":"published","closed":"retired"}',
   '{"identified":["active"],"assessed":["active"],"accepted":["active"],"contested":["active"],"sponsored":["active"],"closed":["active","archived"]}',
   '[{"action":"assess","from":["identified","contested"],"to":"assessed","actor":"owner","kind":"forward","separation":[],"roles":["risk_owner"]},
     {"action":"accept","from":["assessed"],"to":"accepted","actor":"approver","kind":"forward","separation":["author"],"roles":["risk_owner"]},
     {"action":"contest","from":["assessed","accepted"],"to":"contested","actor":"reviewer","kind":"re_entry","separation":[],"reentry_reasons":["contradiction"]},
     {"action":"sponsor","from":["accepted"],"to":"sponsored","actor":"approver","kind":"forward","separation":[],"roles":["opportunity_sponsor"]},
     {"action":"close","from":["assessed","accepted","sponsored"],"to":"closed","actor":"owner","kind":"forward","separation":[],"roles":["risk_owner"]}]',
   '{}', ARRAY['risk_owner'], 'prediction.exposure_current.state',
   'An exposure (risk or opportunity): identified → assessed → accepted → sponsored → closed, a contest returning it to review — the exposure service''s port', '0120 §LC'),
  ('MEM', 1, 'module', 'memory.item.*', NULL,
   ARRAY['active', 'withdrawn'],
   '{"active":"published","withdrawn":"withdrawn"}',
   '{"active":["active"],"withdrawn":["active","withdrawn"]}',
   '[{"action":"record","from":[],"to":"active","actor":"owner","kind":"forward","separation":[],"roles":["knowledge_owner"]},
     {"action":"supersede","from":["active"],"to":"active","actor":"owner","kind":"forward","separation":[],"roles":["record_authority"]},
     {"action":"withdraw","from":["active"],"to":"withdrawn","actor":"owner","kind":"forward","separation":[],"roles":["record_authority"]}]',
   '{}', '{}', 'memory.items_current.state (each version a canonical MEM object; a superseded version stays replayable)',
   'A memory item: recorded, superseded by a new version (the prior replayable), withdrawn — the memory service''s ports', '0120 §LC'),
  ('FCT', 1, 'module', 'prediction.forecast.*', NULL,
   ARRAY['issued', 'superseded', 'resolved', 'withdrawn'],
   '{"issued":"published","superseded":"superseded","resolved":"archived","withdrawn":"withdrawn"}',
   '{"issued":["active"],"superseded":["active","superseded"],"resolved":["active","archived"],"withdrawn":["active","withdrawn"]}',
   '[{"action":"issue","from":[],"to":"issued","actor":"owner","kind":"forward","separation":[],"roles":["forecast_owner"]},
     {"action":"supersede","from":["issued"],"to":"superseded","actor":"owner","kind":"forward","separation":[],"roles":["forecast_owner"]},
     {"action":"resolve","from":["issued","superseded"],"to":"resolved","actor":"owner","kind":"forward","separation":[],"roles":["forecast_owner"]},
     {"action":"withdraw","from":["issued","superseded"],"to":"withdrawn","actor":"owner","kind":"forward","separation":[],"roles":["forecast_owner"]}]',
   '{}', '{}', 'prediction.forecasts_current.state', 'A forecast: issued, superseded by a revision, resolved against its outcome, withdrawn — the forecasting service''s ports', '0120 §LC'),
  ('WRN', 1, 'module', 'prediction.warning.*', NULL,
   ARRAY['raised', 'acknowledged', 'expired', 'closed'],
   '{"raised":"published","acknowledged":"published","expired":"retired","closed":"withdrawn"}',
   '{"raised":["active"],"acknowledged":["active"],"expired":["active"],"closed":["active","withdrawn"]}',
   '[{"action":"raise","from":[],"to":"raised","actor":"owner","kind":"forward","separation":[]},
     {"action":"acknowledge","from":["raised"],"to":"acknowledged","actor":"reviewer","kind":"forward","separation":[]},
     {"action":"expire","from":["raised"],"to":"expired","actor":"owner","kind":"forward","separation":[]},
     {"action":"close","from":["raised","acknowledged"],"to":"closed","actor":"owner","kind":"forward","separation":[]}]',
   '{}', '{}', 'prediction.warnings_current.state', 'A warning: raised, acknowledged (a response, not an approval), expired unanswered, closed — the warning service''s ports', '0120 §LC'),
  ('PUB', 1, 'module', 'executive.publication.*', NULL,
   ARRAY['drafted', 'approved', 'delivered', 'corrected', 'withdrawn', 'archived'],
   '{"drafted":"draft","approved":"approved","delivered":"published","corrected":"corrected","withdrawn":"withdrawn","archived":"archived"}',
   '{"drafted":["active"],"approved":["active"],"delivered":["active"],"corrected":["active"],"withdrawn":["active","withdrawn"],"archived":["archived"]}',
   '[{"action":"approve","from":["drafted"],"to":"approved","actor":"approver","kind":"forward","separation":["author"]},
     {"action":"deliver","from":["approved"],"to":"delivered","actor":"owner","kind":"forward","separation":[]},
     {"action":"correct","from":["delivered"],"to":"corrected","actor":"owner","kind":"forward","separation":[]},
     {"action":"withdraw","from":["approved","delivered","corrected"],"to":"withdrawn","actor":"owner","kind":"forward","separation":[]},
     {"action":"archive","from":["delivered","corrected","withdrawn"],"to":"archived","actor":"owner","kind":"forward","separation":[]}]',
   '{}', '{}', 'executive.publications.state', 'A publication: drafted, approved on its exact bytes, delivered, corrected, withdrawn, archived — the publishing service''s ports', '0120 §LC'),
  ('DPK', 1, 'module', 'decision.package.*', NULL,
   ARRAY['draft', 'proposed', 'under_review', 'approved', 'committed', 'monitoring', 'closed', 'rejected', 'withdrawn', 'reopened'],
   '{"draft":"draft","proposed":"proposed","under_review":"reviewed","approved":"approved","committed":"published","monitoring":"published","closed":"archived","rejected":"withdrawn","withdrawn":"withdrawn","reopened":"draft"}',
   '{"draft":["active"],"proposed":["active"],"under_review":["active"],"approved":["active"],"committed":["active"],"monitoring":["active"],"closed":["active","archived"],"rejected":["active","withdrawn"],"withdrawn":["active","withdrawn"],"reopened":["active"]}',
   '[{"action":"propose","from":["draft","reopened"],"to":"proposed","actor":"owner","kind":"forward","separation":[]},
     {"action":"review","from":["proposed"],"to":"under_review","actor":"reviewer","kind":"forward","separation":["author"]},
     {"action":"approve","from":["under_review"],"to":"approved","actor":"approver","kind":"forward","separation":["author"],"roles":["decision_approver"]},
     {"action":"commit","from":["approved"],"to":"committed","actor":"approver","kind":"forward","separation":[],"roles":["decision_authority"]},
     {"action":"reopen","from":["committed","monitoring"],"to":"reopened","actor":"owner","kind":"re_entry","separation":[],"reentry_reasons":["policy_change","contradiction"],"roles":["decision_owner"]},
     {"action":"close","from":["committed","monitoring"],"to":"closed","actor":"owner","kind":"forward","separation":[]}]',
   ARRAY['domain_analyst'], ARRAY['decision_approver', 'decision_authority'], 'decision.packages_current.state',
   'A decision package: drafted, proposed, reviewed, approved, committed, monitored, closed — a policy change reopening it (decision.reopen_package) — the decision service''s ports', '0120 §LC'),
  ('BRF', 1, 'module', 'briefing.compose', NULL,
   ARRAY['composed'], '{"composed":"published"}', '{"composed":["active"]}',
   '[{"action":"compose","from":[],"to":"composed","actor":"owner","kind":"forward","separation":[]}]',
   '{}', '{}', 'executive.briefings (an immutable snapshot; a later briefing supersedes it)', 'A briefing: an immutable snapshot of what is known, superseded by a later composition — the briefing port', '0120 §LC'),
  ('CLM', 1, 'canonical', 'intelligence.claim.admit / intelligence.review.decide', NULL,
   ARRAY['admitted', 'active', 'corrected', 'withdrawn', 'superseded'],
   '{"admitted":"admitted","active":"published","corrected":"corrected","withdrawn":"withdrawn","superseded":"superseded"}',
   '{"admitted":["admitted"],"active":["active"],"corrected":["corrected"],"withdrawn":["withdrawn"],"superseded":["superseded"]}',
   '[{"action":"admit","from":[],"to":"active","actor":"owner","kind":"forward","separation":[]},
     {"action":"correct","from":["active","corrected"],"to":"corrected","actor":"reviewer","kind":"forward","separation":[]},
     {"action":"withdraw","from":["active","corrected"],"to":"withdrawn","actor":"reviewer","kind":"forward","separation":[]}]',
   ARRAY['extraction_manager', 'domain_analyst'], '{}', 'objects.canonical_objects.lifecycle_state (the canonical record is the lifecycle)',
   'A claim: admitted by extraction, corrected or withdrawn by review — the extraction and review ports; the canonical record carries the state', '0120 §LC'),
  ('EVD', 1, 'canonical', 'observation.item.admit / observation.correction.apply', NULL,
   ARRAY['admitted', 'corrected', 'withdrawn'],
   '{"admitted":"admitted","corrected":"corrected","withdrawn":"withdrawn"}',
   '{"admitted":["admitted"],"corrected":["corrected"],"withdrawn":["withdrawn"]}',
   '[{"action":"admit","from":[],"to":"admitted","actor":"owner","kind":"forward","separation":[]},
     {"action":"correct","from":["admitted","corrected"],"to":"corrected","actor":"approver","kind":"forward","separation":[],"roles":["collection_manager","executive"]},
     {"action":"withdraw","from":["admitted","corrected"],"to":"withdrawn","actor":"approver","kind":"forward","separation":[],"roles":["collection_manager","executive"]}]',
   '{}', ARRAY['collection_manager', 'executive'], 'objects.canonical_objects.lifecycle_state (the canonical record is the lifecycle)',
   'Evidence: admitted by collection, corrected or withdrawn by a correction case (a new version; nothing overwritten) — the observation ports', '0120 §LC'),
  ('GRV', 1, 'revision', 'graph.revisions (graph.apply_revision)', NULL,
   ARRAY['committed'], '{"committed":"published"}', '{"committed":[]}',
   '[{"action":"revise","from":[],"to":"committed","actor":"owner","kind":"forward","separation":[]}]',
   '{}', '{}', 'graph.revisions (an atomic multi-object revision: expected revision + idempotency key, one step of the head)',
   'A graph revision: committed atomically with its expected revision and idempotency key — no canonical object; B51 owns the atomic multi-object revisions', '0120 §LC');

DO $$
DECLARE p record; t jsonb; s text;
BEGIN
  FOR p IN SELECT * FROM objects.lifecycle_profiles LOOP
    FOREACH s IN ARRAY p.states LOOP
      IF NOT (p.canonical_map ? s) OR NOT ((p.canonical_map ->> s) = ANY (objects.lifecycle_canonical_states())) THEN
        RAISE EXCEPTION 'migration 0120 §LC: profile %@% maps its state % to no canonical word', p.object_type, p.version, s;
      END IF;
      IF NOT (p.consistent ? s) THEN RAISE EXCEPTION 'migration 0120 §LC: profile %@% states no reconciliation rule for %', p.object_type, p.version, s; END IF;
    END LOOP;
    FOR t IN SELECT * FROM jsonb_array_elements(p.transitions) LOOP
      IF coalesce(t ->> 'actor', '') NOT IN ('owner', 'reviewer', 'approver') OR coalesce(t ->> 'kind', '') NOT IN ('forward', 're_entry', 'compensation') THEN
        RAISE EXCEPTION 'migration 0120 §LC: profile %@% transition % has no actor class or kind', p.object_type, p.version, t ->> 'action';
      END IF;
      IF t ->> 'kind' = 're_entry' AND jsonb_array_length(coalesce(t -> 'reentry_reasons', '[]'::jsonb)) = 0 THEN
        RAISE EXCEPTION 'migration 0120 §LC: profile %@% re-entry % declares no reason', p.object_type, p.version, t ->> 'action';
      END IF;
    END LOOP;
  END LOOP;
  IF (SELECT count(*) FROM objects.lifecycle_profiles) <> 12 THEN RAISE EXCEPTION 'migration 0120 §LC: expected 12 lifecycle profiles'; END IF;
END $$;

-- §LC.3 THE WRITE ACTIONS (DESIGN D5): the work object is written by its own actions — never by the generic ones ──────────────────────────
INSERT INTO observation.canonical_write_actions (action, object_types, rationale) VALUES
  ('objects.work_object.author', ARRAY['ASM'], 'B50 §LC (DESIGN D5): a named person authors a work object (the assessment, ASM@v3) as a draft, version 1, its accountable owner; nothing else is admitted'),
  ('objects.lifecycle.transition', ARRAY['ASM'], 'B50 §LC (PR-06-001/003/005): a work object''s next version written by its lifecycle transition from the prior one — the owner (or the profile''s reviewer / approver), the expected version, the idempotency key'),
  ('objects.lifecycle.proposal.decide', ARRAY['ASM'], 'B50 §LC (PR-06-003): the owner''s acceptance of a proposed lifecycle transition performs it — the same rules as objects.lifecycle.transition');
INSERT INTO observation.canonical_write_exclusions (action, object_type, rationale) VALUES
  ('objects.create',  'ASM', 'B50 §LC: an assessment is authored through objects.work_object.author (the work object) or admitted by extraction (intelligence.claim.admit) — never through the generic create'),
  ('objects.correct', 'ASM', 'B50 §LC: an assessment changes through its lifecycle (objects.lifecycle.transition: correct) or its review (intelligence.review.decide) — never through the generic correct')
ON CONFLICT (action, object_type) DO NOTHING;

-- §LC.4 THE SHARED HELPERS (internal; no runtime grant) ──────────────────────────────────────────────────────────────────────────────────
/* An instant as the TS header rebuild writes it (Date.toISOString: UTC, milliseconds) — the stored row must rebuild to the digest. */
CREATE OR REPLACE FUNCTION objects._lc_iso(p timestamptz) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE WHEN p IS NULL THEN NULL ELSE to_char(p AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END $$;
REVOKE ALL ON FUNCTION objects._lc_iso(timestamptz) FROM PUBLIC;

/* The 43-field header of a stored version, exactly as apps/api/src/objects/objects.service.ts rebuildHeaderFromRow rebuilds it. */
CREATE OR REPLACE FUNCTION objects._lc_header(r objects.canonical_objects) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = objects, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'object_id', r.object_id, 'object_type', r.object_type, 'tenant_id', r.tenant_id, 'domain_id', r.domain_id, 'scope', r.scope,
    'object_version', r.object_version::text, 'lifecycle_state', r.lifecycle_state, 'owning_component', r.owning_component,
    'accountable_owner', r.accountable_owner, 'source_object_ids', r.source_object_ids,
    'event_time', objects._lc_iso(r.event_time), 'observation_time', objects._lc_iso(r.observation_time), 'valid_from', objects._lc_iso(r.valid_from),
    'valid_to', objects._lc_iso(r.valid_to), 'recorded_at', objects._lc_iso(r.recorded_at), 'time_precision', r.time_precision,
    'source_clock_quality', r.source_clock_quality, 'truth_state', r.truth_state, 'synthetic_state', r.synthetic_state,
    'confidence', CASE WHEN r.confidence IS NULL OR jsonb_typeof(r.confidence) = 'null' THEN 'null'::jsonb ELSE r.confidence END,
    'uncertainty', CASE WHEN r.uncertainty IS NULL OR jsonb_typeof(r.uncertainty) = 'null' THEN 'null'::jsonb ELSE r.uncertainty END,
    'evidence_refs', r.evidence_refs, 'provenance_ref', r.provenance_ref, 'method_ref', r.method_ref, 'contradiction_refs', r.contradiction_refs,
    'corroboration_refs', r.corroboration_refs, 'human_refs', r.human_refs, 'classification', r.classification, 'purpose_scope', r.purpose_scope,
    'rights_profile', r.rights_profile, 'residency_profile', r.residency_profile, 'retention_profile', r.retention_profile,
    'access_policy_ref', r.access_policy_ref, 'quality_profile', r.quality_profile,
    'quality_state', CASE WHEN r.quality_state IS NULL OR jsonb_typeof(r.quality_state) = 'null' THEN 'null'::jsonb ELSE r.quality_state END,
    'freshness_state', CASE WHEN r.freshness_state IS NULL OR jsonb_typeof(r.freshness_state) = 'null' THEN 'null'::jsonb ELSE r.freshness_state END,
    'schema_ref', r.schema_ref, 'ontology_ref', r.ontology_ref, 'correction_of', r.correction_of, 'supersedes', r.supersedes,
    'withdrawal_reason', r.withdrawal_reason, 'audit_correlation_id', r.audit_correlation_id, 'content_ref', r.content_ref)
$$;
REVOKE ALL ON FUNCTION objects._lc_header(objects.canonical_objects) FROM PUBLIC;

/* The owner named by an accountable_owner (`principal:<uuid>`) when it is an ACTIVE HUMAN; NULL otherwise (the object is then ownerless). */
CREATE OR REPLACE FUNCTION objects._lc_owner(p_owner text) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
DECLARE v uuid;
BEGIN
  IF p_owner IS NULL OR p_owner !~* '^principal:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN NULL; END IF;
  v := substr(p_owner, 11)::uuid;
  IF NOT EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = v AND p.kind = 'human' AND p.status = 'active') THEN RETURN NULL; END IF;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION objects._lc_owner(text) FROM PUBLIC;

/* The latest profile of a type (NULL row when none). */
CREATE OR REPLACE FUNCTION objects._lc_profile(p_type text) RETURNS objects.lifecycle_profiles
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = objects, pg_catalog, pg_temp AS $$
  SELECT p.* FROM objects.lifecycle_profiles p WHERE p.object_type = p_type ORDER BY p.version DESC LIMIT 1 $$;
REVOKE ALL ON FUNCTION objects._lc_profile(text) FROM PUBLIC;

/* A transition's answer (b50-seams.ts TransitionOutcome, snake-case). */
CREATE OR REPLACE FUNCTION objects._lc_outcome(t objects.lifecycle_transitions, p_repeated boolean) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = objects, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('transition_id', t.transition_id, 'outcome', t.outcome, 'object_type', t.object_type, 'object_id', t.object_id,
    'action', t.action, 'kind', t.kind, 'from', t.from_state, 'to', t.to_state, 'object_version', t.new_version,
    'last_authoritative_version', coalesce(t.new_version, t.prior_version), 'attempted_action', t.action, 'attempted', t.attempted,
    'refusal', CASE WHEN t.refusal_class IS NULL THEN NULL ELSE jsonb_build_object('class', t.refusal_class, 'code', t.refusal_code, 'message', t.refusal_message) END,
    'repeated', p_repeated, 'recorded_at', t.recorded_at, 'causation_id', t.causation_id, 'reentry_reason', t.reentry_reason, 'compensates', t.compensates,
    'proposal_id', t.proposal_id, 'actor_principal_id', t.actor_principal_id, 'actor_class', t.actor_class)
$$;
REVOKE ALL ON FUNCTION objects._lc_outcome(objects.lifecycle_transitions, boolean) FROM PUBLIC;

/* The acting principal: the bound principal, never another (a forged call fails loudly; nothing is recorded under another's name). */
CREATE OR REPLACE FUNCTION objects._lc_actor(p_noun text, p_actor uuid) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = objects, pg_catalog, pg_temp AS $$
DECLARE v uuid := public.eye_principal();
BEGIN
  IF v IS NULL THEN RAISE EXCEPTION '% rejected (actor): no principal is bound to this context', p_noun USING ERRCODE = '42501'; END IF;
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM v THEN
    RAISE EXCEPTION '% rejected (actor): the act is recorded under the acting principal, never on behalf of another', p_noun USING ERRCODE = '42501';
  END IF;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION objects._lc_actor(text, uuid) FROM PUBLIC;

/* The work object's payload validated in the port (ASM@v3's shape; TS validates nothing here — the port is the boundary). */
CREATE OR REPLACE FUNCTION objects._lc_content_problem(p_title text, p_statement text, p_body jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE
    WHEN p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 8 AND 300 THEN 'the title says what is assessed in 8 to 300 characters'
    WHEN p_statement IS NULL OR length(btrim(p_statement)) NOT BETWEEN 16 AND 8000 THEN 'the statement is the assessment itself, 16 to 8000 characters'
    WHEN p_body IS NULL OR jsonb_typeof(p_body) <> 'object' THEN 'the body is an object of named sections'
    WHEN length(p_body::text) > 60000 THEN 'the body is at most 60000 characters'
  END $$;
REVOKE ALL ON FUNCTION objects._lc_content_problem(text, text, jsonb) FROM PUBLIC;

/* Write a version: the header and payload digest-bound exactly as admit recomputes it. Returns the digest. */
CREATE OR REPLACE FUNCTION objects._lc_admit(p_header jsonb, p_payload jsonb) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = objects, canon, pg_catalog, pg_temp AS $$
DECLARE v_digest text := canon.sha256_hex(canon.jcs(jsonb_build_object('header', p_header, 'payload', p_payload)));
BEGIN
  -- today's admit path (DESIGN D2: §HD's re-declared admit writes its side ledgers in the same transaction — the swap point is HERE).
  PERFORM objects.admit_version(p_header, p_payload, v_digest);
  RETURN v_digest;
END $$;
REVOKE ALL ON FUNCTION objects._lc_admit(jsonb, jsonb) FROM PUBLIC;

-- §LC.5 AUTHORING THE WORK OBJECT (DESIGN D5, PR-06-001) ─────────────────────────────────────────────────────────────────────────────────
/* A named person authors a work object as a DRAFT, version 1: its accountable owner is the author. The request's idempotency key replayed
   by the same person with the same command answers the recorded object (no second object); with a different command it is refused. */
CREATE OR REPLACE FUNCTION objects.author_work_object(p_tenant uuid, p_domain uuid, p_object_type text, p_object_id uuid, p_title text, p_statement text,
  p_body jsonb, p_evidence_refs jsonb, p_classification text, p_purpose_scope text, p_synthetic boolean, p_idempotency_key text, p_actor uuid, p_correlation uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = objects, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE
  v_actor uuid; p objects.lifecycle_profiles%ROWTYPE; v_problem text; v_cmd text; x objects.lifecycle_transitions%ROWTYPE;
  v_now timestamptz := date_trunc('milliseconds', clock_timestamp()); v_header jsonb; v_payload jsonb; v_id uuid := gen_random_uuid(); v_refs jsonb := coalesce(p_evidence_refs, '[]'::jsonb);
BEGIN
  PERFORM observation.assert_authority(ARRAY['objects.work_object.author']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := objects._lc_actor('work object', p_actor);
  IF onboarding.principal_kind(v_actor) IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION 'work object rejected (actor): authoring a work object is a named person''s act; an agent proposes, never authors' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'work object rejected (idempotency): the request carries an idempotency key of 8 to 200 characters (a retry reuses it)' USING ERRCODE = '22023';
  END IF;
  v_cmd := canon.sha256_hex(canon.jcs(jsonb_build_object('act', 'author', 'type', p_object_type, 'title', btrim(coalesce(p_title, '')), 'statement', btrim(coalesce(p_statement, '')),
             'body', coalesce(p_body, '{}'::jsonb), 'evidence_refs', v_refs, 'classification', p_classification, 'purpose_scope', p_purpose_scope, 'synthetic', coalesce(p_synthetic, false))));
  SELECT * INTO x FROM objects.lifecycle_transitions t WHERE t.tenant_id = p_tenant AND t.domain_id = p_domain AND t.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF x.actor_principal_id = v_actor AND x.command_digest = v_cmd AND x.action = 'create' THEN RETURN objects._lc_outcome(x, true); END IF;
    RAISE EXCEPTION 'work object rejected (duplicate): the idempotency key % was used for a different command — a new act takes a new key', p_idempotency_key USING ERRCODE = '22023';
  END IF;
  p := objects._lc_profile(p_object_type);
  IF p.object_type IS NULL OR p.governance <> 'work_object' THEN
    RAISE EXCEPTION 'work object rejected (type): % is not a work-object type (its lifecycle is %)', coalesce(p_object_type, '<none>'), coalesce(p.owning_port, 'not declared') USING ERRCODE = '22023';
  END IF;
  v_problem := objects._lc_content_problem(p_title, p_statement, p_body);
  IF v_problem IS NOT NULL THEN RAISE EXCEPTION 'work object rejected (content): %', v_problem USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(v_refs) <> 'array' OR jsonb_array_length(v_refs) > 50 OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_refs) e WHERE jsonb_typeof(e) <> 'string') THEN
    RAISE EXCEPTION 'work object rejected (evidence): the evidence references are a list of at most 50 references' USING ERRCODE = '22023';
  END IF;
  IF p_classification IS NULL OR p_classification NOT IN ('public', 'internal', 'confidential', 'restricted') THEN
    RAISE EXCEPTION 'work object rejected (classification): the classification is public, internal, confidential or restricted' USING ERRCODE = '22023';
  END IF;
  IF p_purpose_scope IS NULL OR length(btrim(p_purpose_scope)) NOT BETWEEN 3 AND 120 THEN
    RAISE EXCEPTION 'work object rejected (purpose): the purpose scope names the purpose the assessment serves' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = p_object_id) THEN
    RAISE EXCEPTION 'work object rejected (duplicate): object % already exists', p_object_id USING ERRCODE = '22023';
  END IF;
  v_payload := jsonb_build_object('form', 'work_object', 'title', btrim(p_title), 'statement', btrim(p_statement), 'body', p_body, 'review', NULL, 'approval', NULL,
                 'act', jsonb_build_object('action', 'create', 'by', 'principal:' || v_actor, 'at', objects._lc_iso(v_now), 'reason', NULL, 'transition_id', v_id, 'kind', 'forward'));
  v_header := jsonb_build_object(
    'object_id', p_object_id, 'object_type', p_object_type, 'tenant_id', p_tenant, 'domain_id', p_domain, 'scope', 'DOMAIN', 'object_version', '1',
    'lifecycle_state', 'draft', 'owning_component', 'CP-OBJ-01', 'accountable_owner', 'principal:' || v_actor, 'source_object_ids', '[]'::jsonb,
    'event_time', NULL, 'observation_time', NULL, 'valid_from', NULL, 'valid_to', NULL, 'recorded_at', objects._lc_iso(v_now), 'time_precision', 'exact',
    'source_clock_quality', 'trusted', 'truth_state', CASE WHEN coalesce(p_synthetic, false) THEN 'synthetic' ELSE 'assessed' END, 'synthetic_state', coalesce(p_synthetic, false),
    'confidence', 'null'::jsonb, 'uncertainty', 'null'::jsonb, 'evidence_refs', v_refs, 'provenance_ref', NULL, 'method_ref', NULL, 'contradiction_refs', '[]'::jsonb,
    'corroboration_refs', '[]'::jsonb, 'human_refs', jsonb_build_array('principal:' || v_actor), 'classification', p_classification, 'purpose_scope', btrim(p_purpose_scope),
    'rights_profile', NULL, 'residency_profile', NULL, 'retention_profile', NULL, 'access_policy_ref', NULL, 'quality_profile', NULL, 'quality_state', 'null'::jsonb,
    'freshness_state', 'null'::jsonb, 'schema_ref', p.schema_ref, 'ontology_ref', NULL, 'correction_of', NULL, 'supersedes', NULL, 'withdrawal_reason', NULL,
    'audit_correlation_id', public.eye_correlation(), 'content_ref', NULL);
  INSERT INTO objects.lifecycle_transitions (transition_id, scope, tenant_id, domain_id, object_type, object_id, profile_version, action, kind, outcome, from_state, to_state,
      expected_version, prior_version, new_version, attempted, reason, actor_principal_id, actor_class, policy_decision_id, bundle_version, idempotency_key, command_digest, recorded_at, correlation_id)
  VALUES (v_id, 'DOMAIN', p_tenant, p_domain, p_object_type, p_object_id, p.version, 'create', 'forward', 'accepted', NULL, 'draft', 0, NULL, 1,
      jsonb_build_object('action', 'create', 'to', 'draft', 'expected_version', 0, 'title', btrim(p_title)), NULL, v_actor, 'author', public.eye_policy_decision(), public.eye_bundle_version(),
      p_idempotency_key, v_cmd, v_now, p_correlation)
  RETURNING * INTO x;
  PERFORM objects._lc_admit(v_header, v_payload);
  RETURN objects._lc_outcome(x, false);
END $$;
REVOKE ALL ON FUNCTION objects.author_work_object(uuid, uuid, text, uuid, text, text, jsonb, jsonb, text, text, boolean, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.author_work_object(uuid, uuid, text, uuid, text, text, jsonb, jsonb, text, text, boolean, text, uuid, uuid) TO eye_commit;

-- §LC.6 THE TRANSITION (PR-06-001/003/005, V03-T-021) ─────────────────────────────────────────────────────────────────────────────────────
/* THE CORE (internal): one attempted transition of a work object. Every attempt on a resolved object is KEPT — accepted (the new version
   written in SQL from the prior one through admit), rejected (the attempted command, the last authoritative version, the refusal) or
   compensated. It never RAISES for a refusal of the attempt itself (a raise would roll the record back); it raises only for what is not an
   attempt on a known object of this scope (the acting principal, the key reused for another command, an unknown object). */
CREATE OR REPLACE FUNCTION objects._lifecycle_apply(p_tenant uuid, p_domain uuid, p_object_type text, p_object_id uuid, p_expected_version int, p_action text, p_to text,
  p_reason text, p_idempotency_key text, p_causation_id uuid, p_correlation_ref text, p_reentry_reason text, p_changes jsonb, p_proposal_id uuid, p_actor uuid, p_correlation uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = objects, observation, identity, governance, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE
  v_cmd text; x objects.lifecycle_transitions%ROWTYPE; o objects.canonical_objects%ROWTYPE; base objects.canonical_objects%ROWTYPE; p objects.lifecycle_profiles%ROWTYPE;
  tr jsonb; v_kind text := 'forward'; v_class text; v_code text; v_msg text; v_owner uuid; v_author uuid; v_reviewer uuid; v_actor_class text; v_to text;
  v_last objects.lifecycle_transitions%ROWTYPE; v_has_last boolean; v_comp objects.lifecycle_transitions%ROWTYPE; v_now timestamptz := date_trunc('milliseconds', clock_timestamp());
  v_id uuid := gen_random_uuid(); v_header jsonb; v_payload jsonb; v_changes jsonb := coalesce(p_changes, '{}'::jsonb); v_human_refs jsonb; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_attempted jsonb; v_outcome text; v_restore_from int;
BEGIN
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'lifecycle transition rejected (idempotency): the command carries an idempotency key of 8 to 200 characters (a retry reuses it)' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(v_changes) <> 'object' THEN RAISE EXCEPTION 'lifecycle transition rejected (changes): the changes are an object' USING ERRCODE = '22023'; END IF;
  v_cmd := canon.sha256_hex(canon.jcs(jsonb_build_object('object', p_object_id, 'expected_version', p_expected_version, 'action', p_action, 'to', p_to, 'reason', v_reason,
             'causation', p_causation_id, 'reentry_reason', p_reentry_reason, 'changes', v_changes, 'proposal', p_proposal_id)));
  -- THE IDEMPOTENCY KEY: a repeat by the same person with the same command answers the FIRST result (accepted or rejected) — no second effect.
  SELECT * INTO x FROM objects.lifecycle_transitions t WHERE t.tenant_id = p_tenant AND t.domain_id = p_domain AND t.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF x.actor_principal_id = p_actor AND x.command_digest = v_cmd THEN RETURN objects._lc_outcome(x, true); END IF;
    RAISE EXCEPTION 'lifecycle transition rejected (duplicate): the idempotency key % was used for a different command — a new act takes a new key', p_idempotency_key USING ERRCODE = '22023';
  END IF;
  -- ONE transition of an object at a time: the second of two concurrent attempts waits, then reads the version the first wrote (stale).
  PERFORM pg_advisory_xact_lock(hashtextextended('objects.lifecycle:' || p_object_id::text, 0));
  SELECT * INTO o FROM objects.canonical_objects c WHERE c.object_id = p_object_id AND c.tenant_id = p_tenant AND c.domain_id = p_domain ORDER BY c.object_version DESC LIMIT 1;
  IF NOT FOUND OR o.object_type IS DISTINCT FROM p_object_type THEN
    RAISE EXCEPTION 'lifecycle transition rejected (unknown_object): no % object % is recorded in this domain', coalesce(p_object_type, '<none>'), p_object_id USING ERRCODE = '23503';
  END IF;
  p := objects._lc_profile(o.object_type);
  SELECT * INTO v_last FROM objects.lifecycle_transitions t WHERE t.object_id = o.object_id AND t.outcome IN ('accepted', 'compensated') ORDER BY t.new_version DESC LIMIT 1;
  v_has_last := FOUND;
  v_attempted := jsonb_strip_nulls(jsonb_build_object('action', p_action, 'to', p_to, 'expected_version', p_expected_version, 'reason', v_reason, 'causation_id', p_causation_id,
                   'correlation_ref', p_correlation_ref, 'reentry_reason', p_reentry_reason, 'changes', CASE WHEN v_changes = '{}'::jsonb THEN NULL ELSE v_changes END, 'proposal_id', p_proposal_id,
                   'state_at_attempt', o.lifecycle_state, 'version_at_attempt', o.object_version));

  -- THE RULES, the first failing one is the refusal (every one re-checked HERE, whatever the route or the page decided).
  IF p.object_type IS NULL OR p.governance <> 'work_object' OR o.schema_ref IS DISTINCT FROM p.schema_ref THEN
    v_class := 'profile'; v_code := 'module_owned';
    v_msg := CASE WHEN p.governance = 'work_object'
                  THEN format('%s %s is the %s form, moved by its own port (extraction review or the governed import); this machine moves %s', o.object_type, o.object_id, o.schema_ref, p.schema_ref)
                  ELSE format('%s %s is not moved by this machine — its lifecycle is %s''s', o.object_type, o.object_id, coalesce(p.owning_port, 'not declared')) END;
  END IF;
  IF v_class IS NULL THEN
    SELECT e INTO tr FROM jsonb_array_elements(p.transitions) e WHERE e ->> 'action' = p_action;
    IF tr IS NULL THEN v_class := 'transition'; v_code := 'unknown_action';
      v_msg := format('%s is not a transition of %s (%s)', coalesce(p_action, '<none>'), o.object_type, (SELECT string_agg(e ->> 'action', ', ') FROM jsonb_array_elements(p.transitions) e));
    ELSE v_kind := tr ->> 'kind'; v_actor_class := tr ->> 'actor';
    END IF;
  END IF;
  IF v_class IS NULL AND p_expected_version IS DISTINCT FROM o.object_version::int THEN
    v_class := 'stale'; v_code := 'stale_version';
    v_msg := format('the command expected version %s; the authoritative version is %s (%s) — re-read the object and decide again', coalesce(p_expected_version::text, '<none>'), o.object_version, o.lifecycle_state);
  END IF;
  -- the out-of-order test: a cause named from this object's own ledger must be its LATEST transition (an older one is a stale chain)
  IF v_class IS NULL AND p_causation_id IS NOT NULL AND v_kind <> 're_entry'
     AND EXISTS (SELECT 1 FROM objects.lifecycle_transitions t WHERE t.transition_id = p_causation_id AND t.object_id = o.object_id)
     AND (NOT v_has_last OR v_last.transition_id <> p_causation_id) THEN
    v_class := 'state'; v_code := 'out_of_order';
    v_msg := format('the command follows transition %s, which is not the latest (%s) — it arrived out of order', p_causation_id, coalesce(v_last.transition_id::text, '<none>'));
  END IF;
  IF v_class IS NULL AND v_kind = 'compensation' THEN
    IF NOT v_has_last OR v_last.action = 'create' OR v_last.kind = 'compensation' THEN
      v_class := 'state'; v_code := 'nothing_to_compensate'; v_msg := 'there is no accepted transition to compensate (the creation and a compensation are not undone)';
    ELSIF p_causation_id IS DISTINCT FROM v_last.transition_id THEN
      v_class := 'state'; v_code := 'out_of_order'; v_msg := format('a compensation names the transition it undoes: the latest is %s', v_last.transition_id);
    ELSE v_to := v_last.from_state; v_restore_from := v_last.prior_version;
    END IF;
  ELSIF v_class IS NULL THEN
    v_to := tr ->> 'to';
    IF NOT (o.lifecycle_state = ANY (ARRAY(SELECT jsonb_array_elements_text(tr -> 'from')))) THEN
      v_class := 'state'; v_code := 'invalid_transition';
      v_msg := format('%s is offered from %s; the object is %s', p_action, (SELECT string_agg(s, ', ') FROM jsonb_array_elements_text(tr -> 'from') s), o.lifecycle_state);
    END IF;
  END IF;
  IF v_class IS NULL AND p_to IS NOT NULL AND p_to IS DISTINCT FROM v_to THEN
    v_class := 'transition'; v_code := 'target_mismatch'; v_msg := format('%s leads to %s, not %s', p_action, v_to, p_to);
  END IF;
  IF v_class IS NULL AND v_kind = 're_entry' THEN
    IF p_reentry_reason IS NULL OR NOT (p_reentry_reason = ANY (ARRAY(SELECT jsonb_array_elements_text(tr -> 'reentry_reasons')))) OR p_causation_id IS NULL THEN
      v_class := 'reentry'; v_code := 'untyped_reentry';
      v_msg := format('a return to %s is a typed re-entry: it names its reason (%s) and the event that caused it (causation)', v_to, (SELECT string_agg(s, ', ') FROM jsonb_array_elements_text(tr -> 'reentry_reasons') s));
    END IF;
  END IF;
  IF v_class IS NULL AND tr ? 'reason' AND (v_reason IS NULL OR length(v_reason) < 8) THEN
    v_class := 'reason'; v_code := 'reason_required'; v_msg := format('%s records %s (8+ characters)', p_action, tr ->> 'reason');
  END IF;
  IF v_class IS NULL THEN
    v_owner := objects._lc_owner(o.accountable_owner);
    IF v_owner IS NULL THEN v_class := 'state'; v_code := 'ownerless';
      v_msg := format('the accountable owner %s is not an active person — the object cannot identify its owner; it is reconciled before it moves', o.accountable_owner);
    END IF;
  END IF;
  IF v_class IS NULL AND onboarding.principal_kind(p_actor) IS DISTINCT FROM 'human' THEN
    v_class := 'actor'; v_code := 'not_human'; v_msg := 'an authoritative transition is a named person''s act; an agent, a model, an import or a projection proposes';
  END IF;
  IF v_class IS NULL THEN
    IF v_actor_class = 'owner' AND p_actor IS DISTINCT FROM v_owner THEN
      v_class := 'authority'; v_code := 'not_owner'; v_msg := format('%s is the accountable owner''s act (%s); you may propose it', p_action, o.accountable_owner);
    ELSIF v_actor_class = 'reviewer' AND NOT governance.holds_role(p_actor, p_tenant, p_domain, p.reviewer_roles) THEN
      v_class := 'authority'; v_code := 'not_reviewer'; v_msg := format('%s is the act of a %s', p_action, array_to_string(p.reviewer_roles, ' or '));
    ELSIF v_actor_class = 'approver' AND NOT governance.holds_role(p_actor, p_tenant, p_domain, p.approver_roles) THEN
      v_class := 'authority'; v_code := 'not_approver'; v_msg := format('%s is the act of a %s', p_action, array_to_string(p.approver_roles, ' or '));
    END IF;
  END IF;
  IF v_class IS NULL THEN
    SELECT t.actor_principal_id INTO v_author FROM objects.lifecycle_transitions t WHERE t.object_id = o.object_id AND t.action = 'create' AND t.outcome = 'accepted';
    v_author := coalesce(v_author, v_owner);
    -- the reviewer of the CURRENT cycle (since the last return to draft)
    SELECT t.actor_principal_id INTO v_reviewer FROM objects.lifecycle_transitions t
     WHERE t.object_id = o.object_id AND t.action = 'review' AND t.outcome = 'accepted'
       AND t.new_version > coalesce((SELECT max(z.new_version) FROM objects.lifecycle_transitions z WHERE z.object_id = o.object_id AND z.outcome IN ('accepted', 'compensated') AND z.to_state = 'draft'), 0)
     ORDER BY t.new_version DESC LIMIT 1;
    IF tr -> 'separation' ? 'author' AND p_actor = v_author THEN
      v_class := 'separation_of_duties'; v_code := 'separation'; v_msg := format('%s is never done by the author of the work object (0042''s rule)', p_action);
    ELSIF tr -> 'separation' ? 'reviewer' AND p_actor = v_reviewer THEN
      v_class := 'separation_of_duties'; v_code := 'separation'; v_msg := format('%s is never done by the reviewer of this version', p_action);
    END IF;
  END IF;
  IF v_class IS NULL THEN
    IF v_changes <> '{}'::jsonb AND coalesce((tr ->> 'changes')::boolean, false) IS NOT TRUE
       AND NOT (p_action = 'review' AND NOT EXISTS (SELECT 1 FROM jsonb_object_keys(v_changes) k WHERE k <> 'evidence_refs')) THEN
      v_class := 'transition'; v_code := 'changes_not_allowed';
      v_msg := format('%s changes no content (a review may name the evidence it read); a content change is a correction', p_action);
    ELSIF EXISTS (SELECT 1 FROM jsonb_object_keys(v_changes) k WHERE k NOT IN ('title', 'statement', 'body', 'evidence_refs')) THEN
      v_class := 'transition'; v_code := 'changes_invalid'; v_msg := 'the changes name title, statement, body or evidence_refs only';
    ELSIF p_action = 'correct' AND (v_changes = '{}'::jsonb OR objects._lc_content_problem(coalesce(v_changes ->> 'title', o.payload ->> 'title'), coalesce(v_changes ->> 'statement', o.payload ->> 'statement'),
                                                                    coalesce(v_changes -> 'body', o.payload -> 'body')) IS NOT NULL) THEN
      v_class := 'transition'; v_code := 'changes_invalid';
      v_msg := coalesce('the correction: ' || objects._lc_content_problem(coalesce(v_changes ->> 'title', o.payload ->> 'title'), coalesce(v_changes ->> 'statement', o.payload ->> 'statement'), coalesce(v_changes -> 'body', o.payload -> 'body')),
                        'a correction names what changes (title, statement, body or evidence_refs)');
    END IF;
  END IF;

  IF v_class IS NOT NULL THEN
    INSERT INTO objects.lifecycle_transitions (transition_id, scope, tenant_id, domain_id, object_type, object_id, profile_version, action, kind, outcome, from_state, to_state,
        expected_version, prior_version, new_version, attempted, refusal_class, refusal_code, refusal_message, reason, reentry_reason, causation_id, correlation_ref, compensates, proposal_id,
        actor_principal_id, actor_class, policy_decision_id, bundle_version, idempotency_key, command_digest, recorded_at, correlation_id)
    VALUES (v_id, 'DOMAIN', p_tenant, p_domain, o.object_type, o.object_id, coalesce(p.version, 0), CASE WHEN coalesce(p_action, '') ~ '^[a-z][a-z_]{2,40}$' THEN p_action ELSE 'unknown' END,
        CASE WHEN v_kind IN ('forward', 're_entry', 'compensation') THEN v_kind ELSE 'forward' END, 'rejected', o.lifecycle_state, coalesce(v_to, p_to), p_expected_version, o.object_version, NULL,
        v_attempted, v_class, v_code, format('lifecycle transition rejected (%s): %s', v_class, v_msg), v_reason,
        CASE WHEN p_reentry_reason = ANY (objects.lifecycle_reentry_reasons()) THEN p_reentry_reason END, p_causation_id, p_correlation_ref, NULL, p_proposal_id,
        p_actor, v_actor_class, public.eye_policy_decision(), public.eye_bundle_version(), p_idempotency_key, v_cmd, v_now, p_correlation)
    RETURNING * INTO x;
    RETURN objects._lc_outcome(x, false);
  END IF;

  -- ACCEPTED (or COMPENSATED): the next version, written from the prior one (the restored one, for a compensation).
  IF v_kind = 'compensation' THEN
    SELECT * INTO base FROM objects.canonical_objects c WHERE c.object_id = o.object_id AND c.object_version = v_restore_from;
    SELECT * INTO v_comp FROM objects.lifecycle_transitions t WHERE t.transition_id = v_last.transition_id;
  ELSE base := o;
  END IF;
  v_human_refs := CASE WHEN o.human_refs @> jsonb_build_array('principal:' || p_actor) THEN o.human_refs ELSE o.human_refs || jsonb_build_array('principal:' || p_actor) END;
  v_payload := base.payload;
  IF p_action = 'correct' THEN
    IF v_changes ? 'title' THEN v_payload := jsonb_set(v_payload, '{title}', to_jsonb(btrim(v_changes ->> 'title'))); END IF;
    IF v_changes ? 'statement' THEN v_payload := jsonb_set(v_payload, '{statement}', to_jsonb(btrim(v_changes ->> 'statement'))); END IF;
    IF v_changes ? 'body' THEN v_payload := jsonb_set(v_payload, '{body}', v_changes -> 'body'); END IF;
  END IF;
  IF p_action = 'review' THEN
    v_payload := jsonb_set(v_payload, '{review}', jsonb_build_object('reviewer', 'principal:' || p_actor, 'version', o.object_version, 'findings', v_reason,
                   'evidence_refs', coalesce(v_changes -> 'evidence_refs', '[]'::jsonb), 'at', objects._lc_iso(v_now)));
  ELSIF p_action = 'approve' THEN
    v_payload := jsonb_set(v_payload, '{approval}', jsonb_build_object('approver', 'principal:' || p_actor, 'version', o.object_version, 'rationale', v_reason, 'at', objects._lc_iso(v_now)));
  ELSIF v_to = 'draft' THEN
    v_payload := v_payload || jsonb_build_object('review', NULL, 'approval', NULL);   -- a re-entry opens a new cycle: the next review is a new one
  END IF;
  v_payload := jsonb_set(v_payload, '{act}', jsonb_build_object('action', p_action, 'by', 'principal:' || p_actor, 'at', objects._lc_iso(v_now), 'reason', v_reason, 'transition_id', v_id, 'kind', v_kind));
  v_header := objects._lc_header(base) || jsonb_build_object(
    'object_version', (o.object_version + 1)::text, 'lifecycle_state', v_to, 'recorded_at', objects._lc_iso(v_now), 'audit_correlation_id', public.eye_correlation(),
    'human_refs', v_human_refs,
    'evidence_refs', CASE WHEN p_action = 'correct' AND jsonb_typeof(v_changes -> 'evidence_refs') = 'array' THEN v_changes -> 'evidence_refs' ELSE base.evidence_refs END,
    'correction_of', CASE WHEN p_action = 'correct' OR v_kind = 'compensation' THEN o.object_id::text || '@' || o.object_version ELSE base.correction_of END,
    'truth_state', CASE WHEN v_to = 'withdrawn' THEN 'withdrawn' ELSE base.truth_state END,
    'withdrawal_reason', CASE WHEN v_to = 'withdrawn' THEN v_reason ELSE base.withdrawal_reason END);
  v_outcome := CASE WHEN v_kind = 'compensation' THEN 'compensated' ELSE 'accepted' END;
  INSERT INTO objects.lifecycle_transitions (transition_id, scope, tenant_id, domain_id, object_type, object_id, profile_version, action, kind, outcome, from_state, to_state,
      expected_version, prior_version, new_version, attempted, reason, reentry_reason, causation_id, correlation_ref, compensates, proposal_id,
      actor_principal_id, actor_class, policy_decision_id, bundle_version, idempotency_key, command_digest, recorded_at, correlation_id)
  VALUES (v_id, 'DOMAIN', p_tenant, p_domain, o.object_type, o.object_id, p.version, p_action, v_kind, v_outcome, o.lifecycle_state, v_to, p_expected_version, o.object_version, o.object_version + 1,
      v_attempted, v_reason, CASE WHEN v_kind = 're_entry' THEN p_reentry_reason END, p_causation_id, p_correlation_ref, CASE WHEN v_kind = 'compensation' THEN v_comp.transition_id END, p_proposal_id,
      p_actor, v_actor_class, public.eye_policy_decision(), public.eye_bundle_version(), p_idempotency_key, v_cmd, v_now, p_correlation)
  RETURNING * INTO x;
  PERFORM objects._lc_admit(v_header, v_payload);
  RETURN objects._lc_outcome(x, false);
END $$;
REVOKE ALL ON FUNCTION objects._lifecycle_apply(uuid, uuid, text, uuid, int, text, text, text, text, uuid, text, text, jsonb, uuid, uuid, uuid) FROM PUBLIC;

/* THE PORT (objects.lifecycle.transition). */
CREATE OR REPLACE FUNCTION objects.transition_lifecycle(p_tenant uuid, p_domain uuid, p_object_type text, p_object_id uuid, p_expected_version int, p_action text, p_to text,
  p_reason text, p_idempotency_key text, p_causation_id uuid, p_correlation_ref text, p_reentry_reason text, p_changes jsonb, p_actor uuid, p_correlation uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = objects, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['objects.lifecycle.transition']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := objects._lc_actor('lifecycle transition', p_actor);
  RETURN objects._lifecycle_apply(p_tenant, p_domain, p_object_type, p_object_id, p_expected_version, p_action, p_to, p_reason, p_idempotency_key, p_causation_id, p_correlation_ref,
                                  p_reentry_reason, p_changes, NULL, v_actor, p_correlation);
END $$;
REVOKE ALL ON FUNCTION objects.transition_lifecycle(uuid, uuid, text, uuid, int, text, text, text, text, uuid, text, text, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.transition_lifecycle(uuid, uuid, text, uuid, int, text, text, text, text, uuid, text, text, jsonb, uuid, uuid) TO eye_commit;

-- §LC.7 PROPOSALS (PR-06-003) ────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* A view, an agent, a model, an import or a projection PROPOSES a transition — never authoritative. The proposal names the version it read
   (stale refused), an action of the profile and why. The request id replayed by the same principal answers the recorded proposal. */
CREATE OR REPLACE FUNCTION objects.propose_lifecycle(p_request_id uuid, p_tenant uuid, p_domain uuid, p_object_type text, p_object_id uuid, p_base_version int, p_action text,
  p_reason text, p_via text, p_reentry_reason text, p_causation_id uuid, p_actor uuid, p_correlation uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = objects, observation, identity, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; v_kind text; o objects.canonical_objects%ROWTYPE; p objects.lifecycle_profiles%ROWTYPE; tr jsonb; r objects.lifecycle_proposals%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['objects.lifecycle.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := objects._lc_actor('lifecycle proposal', p_actor);
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'lifecycle proposal rejected (request): the proposal carries a request id (a retry reuses it)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM objects.lifecycle_proposals x WHERE x.request_id = p_request_id;
  IF FOUND THEN
    IF r.proposer_principal_id = v_actor AND r.object_id = p_object_id AND r.action = p_action THEN
      RETURN to_jsonb(r) || jsonb_build_object('replayed', true);
    END IF;
    RAISE EXCEPTION 'lifecycle proposal rejected (duplicate): the request id % was used for another proposal', p_request_id USING ERRCODE = '22023';
  END IF;
  v_kind := (SELECT x.kind FROM identity.principals x WHERE x.id = v_actor AND x.status = 'active');
  IF v_kind IS NULL THEN RAISE EXCEPTION 'lifecycle proposal rejected (actor): the proposer is not an active principal' USING ERRCODE = '42501'; END IF;
  IF p_via IS NULL OR p_via NOT IN ('view', 'agent', 'model', 'import', 'projection') THEN
    RAISE EXCEPTION 'lifecycle proposal rejected (via): a proposal comes from a view, an agent, a model, an import or a projection' USING ERRCODE = '22023';
  END IF;
  IF (v_kind = 'human' AND p_via <> 'view') OR (v_kind = 'agent' AND p_via NOT IN ('agent', 'model')) OR (v_kind = 'workload' AND p_via NOT IN ('import', 'projection')) THEN
    RAISE EXCEPTION 'lifecycle proposal rejected (via): a % proposes through %', v_kind,
      CASE v_kind WHEN 'human' THEN 'a view' WHEN 'agent' THEN 'an agent or a model' ELSE 'an import or a projection' END USING ERRCODE = '22023';
  END IF;
  SELECT * INTO o FROM objects.canonical_objects c WHERE c.object_id = p_object_id AND c.tenant_id = p_tenant AND c.domain_id = p_domain ORDER BY c.object_version DESC LIMIT 1;
  IF NOT FOUND OR o.object_type IS DISTINCT FROM p_object_type THEN
    RAISE EXCEPTION 'lifecycle proposal rejected (unknown_object): no % object % is recorded in this domain', coalesce(p_object_type, '<none>'), p_object_id USING ERRCODE = '23503';
  END IF;
  p := objects._lc_profile(o.object_type);
  IF p.object_type IS NULL OR p.governance <> 'work_object' OR o.schema_ref IS DISTINCT FROM p.schema_ref THEN
    RAISE EXCEPTION 'lifecycle proposal rejected (profile): % % is moved by %''s own port, not by a lifecycle proposal', o.object_type, o.object_id, coalesce(p.owning_port, 'an undeclared') USING ERRCODE = '22023';
  END IF;
  SELECT e INTO tr FROM jsonb_array_elements(p.transitions) e WHERE e ->> 'action' = p_action AND e ->> 'kind' <> 'compensation';
  IF tr IS NULL THEN RAISE EXCEPTION 'lifecycle proposal rejected (transition): % is not a transition a proposal may name', coalesce(p_action, '<none>') USING ERRCODE = '22023'; END IF;
  IF p_base_version IS DISTINCT FROM o.object_version::int THEN
    RAISE EXCEPTION 'lifecycle proposal rejected (stale): the proposal read version %; the authoritative version is % (%)', coalesce(p_base_version::text, '<none>'), o.object_version, o.lifecycle_state USING ERRCODE = '22023';
  END IF;
  IF NOT (o.lifecycle_state = ANY (ARRAY(SELECT jsonb_array_elements_text(tr -> 'from')))) THEN
    RAISE EXCEPTION 'lifecycle proposal rejected (state): % is offered from %; the object is %', p_action, (SELECT string_agg(s, ', ') FROM jsonb_array_elements_text(tr -> 'from') s), o.lifecycle_state USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'lifecycle proposal rejected (reason): a proposal says why (8 to 2000 characters)' USING ERRCODE = '22023'; END IF;
  IF tr ->> 'kind' = 're_entry' AND (p_reentry_reason IS NULL OR NOT (p_reentry_reason = ANY (ARRAY(SELECT jsonb_array_elements_text(tr -> 'reentry_reasons')))) OR p_causation_id IS NULL) THEN
    RAISE EXCEPTION 'lifecycle proposal rejected (reentry): a proposed return names its reason (%) and its cause', (SELECT string_agg(s, ', ') FROM jsonb_array_elements_text(tr -> 'reentry_reasons') s) USING ERRCODE = '22023';
  END IF;
  INSERT INTO objects.lifecycle_proposals (proposal_id, scope, tenant_id, domain_id, object_type, object_id, base_version, action, to_state, proposer_principal_id, proposer_kind, via,
      reason, reentry_reason, causation_id, request_id, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, o.object_type, o.object_id, o.object_version, p_action, tr ->> 'to', v_actor, v_kind, p_via,
      btrim(p_reason), CASE WHEN tr ->> 'kind' = 're_entry' THEN p_reentry_reason END, p_causation_id, p_request_id, p_correlation)
  RETURNING * INTO r;
  RETURN to_jsonb(r) || jsonb_build_object('replayed', false);
END $$;
REVOKE ALL ON FUNCTION objects.propose_lifecycle(uuid, uuid, uuid, text, uuid, int, text, text, text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.propose_lifecycle(uuid, uuid, uuid, text, uuid, int, text, text, text, text, uuid, uuid, uuid) TO eye_commit;

/* THE OWNER DECIDES (objects.lifecycle.proposal.decide): accept performs the proposed transition under the owner's own name through the same
   rules (the expected version the owner read; the proposal is its cause) — accepted when the transition is; a refused acceptance leaves the
   proposal open and the refusal in the ledger. Decline records why. A decided proposal is not decided again. */
CREATE OR REPLACE FUNCTION objects.decide_lifecycle_proposal(p_request_id uuid, p_tenant uuid, p_domain uuid, p_object_id uuid, p_proposal_id uuid, p_decision text, p_reason text,
  p_expected_version int, p_idempotency_key text, p_actor uuid, p_correlation uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = objects, observation, identity, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; r objects.lifecycle_proposals%ROWTYPE; d objects.lifecycle_proposal_decisions%ROWTYPE; o objects.canonical_objects%ROWTYPE; v_out jsonb; v_owner uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['objects.lifecycle.proposal.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := objects._lc_actor('lifecycle proposal', p_actor);
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'lifecycle proposal rejected (request): the decision carries a request id (a retry reuses it)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO d FROM objects.lifecycle_proposal_decisions x WHERE x.request_id = p_request_id;
  IF FOUND THEN
    IF d.decided_by = v_actor AND d.proposal_id = p_proposal_id THEN RETURN to_jsonb(d) || jsonb_build_object('replayed', true); END IF;
    RAISE EXCEPTION 'lifecycle proposal rejected (duplicate): the request id % was used for another decision', p_request_id USING ERRCODE = '22023';
  END IF;
  SELECT * INTO r FROM objects.lifecycle_proposals x WHERE x.proposal_id = p_proposal_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.object_id = p_object_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'lifecycle proposal rejected (unknown_proposal): no proposal % on object % in this domain', p_proposal_id, p_object_id USING ERRCODE = '23503'; END IF;
  IF EXISTS (SELECT 1 FROM objects.lifecycle_proposal_decisions x WHERE x.proposal_id = p_proposal_id) THEN
    RAISE EXCEPTION 'lifecycle proposal rejected (state): proposal % is decided already', p_proposal_id USING ERRCODE = '22023';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('accept', 'decline') THEN RAISE EXCEPTION 'lifecycle proposal rejected (decision): the owner accepts or declines' USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'lifecycle proposal rejected (reason): the decision says why (8 to 2000 characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO o FROM objects.canonical_objects c WHERE c.object_id = r.object_id ORDER BY c.object_version DESC LIMIT 1;
  v_owner := objects._lc_owner(o.accountable_owner);
  IF onboarding.principal_kind(v_actor) IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION 'lifecycle proposal rejected (actor): deciding a proposal is the owner''s act; an agent never decides' USING ERRCODE = '42501';
  END IF;
  IF v_owner IS NULL OR v_actor IS DISTINCT FROM v_owner THEN
    RAISE EXCEPTION 'lifecycle proposal rejected (authority): only the accountable owner (%) decides a proposal on this object', o.accountable_owner USING ERRCODE = '42501';
  END IF;
  IF p_decision = 'decline' THEN
    INSERT INTO objects.lifecycle_proposal_decisions (proposal_id, scope, tenant_id, domain_id, decision, reason, transition_id, decided_by, request_id, correlation_id)
    VALUES (r.proposal_id, 'DOMAIN', p_tenant, p_domain, 'declined', btrim(p_reason), NULL, v_actor, p_request_id, p_correlation) RETURNING * INTO d;
    RETURN to_jsonb(d) || jsonb_build_object('replayed', false, 'transition', NULL);
  END IF;
  v_out := objects._lifecycle_apply(p_tenant, p_domain, r.object_type, r.object_id, p_expected_version, r.action, r.to_state, coalesce(btrim(p_reason), r.reason), p_idempotency_key,
                                    coalesce(r.causation_id, r.proposal_id), NULL, r.reentry_reason, '{}'::jsonb, r.proposal_id, v_actor, p_correlation);
  IF v_out ->> 'outcome' <> 'accepted' THEN
    RETURN jsonb_build_object('proposal_id', r.proposal_id, 'decision', NULL, 'replayed', false, 'transition', v_out);
  END IF;
  INSERT INTO objects.lifecycle_proposal_decisions (proposal_id, scope, tenant_id, domain_id, decision, reason, transition_id, decided_by, request_id, correlation_id)
  VALUES (r.proposal_id, 'DOMAIN', p_tenant, p_domain, 'accepted', btrim(p_reason), (v_out ->> 'transition_id')::uuid, v_actor, p_request_id, p_correlation) RETURNING * INTO d;
  RETURN to_jsonb(d) || jsonb_build_object('replayed', false, 'transition', v_out);
END $$;
REVOKE ALL ON FUNCTION objects.decide_lifecycle_proposal(uuid, uuid, uuid, uuid, uuid, text, text, int, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.decide_lifecycle_proposal(uuid, uuid, uuid, uuid, uuid, text, text, int, text, uuid, uuid) TO eye_commit;

-- §LC.8 THE READS (definer, guarded by the N-01 read scope; reads only) ───────────────────────────────────────────────────────────────────
/* Every type's latest lifecycle profile (global declarations; any bound principal). */
CREATE OR REPLACE FUNCTION objects.lifecycle_profiles_read() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = objects, pg_catalog, pg_temp AS $$
BEGIN
  IF public.eye_principal() IS NULL AND NOT coalesce((SELECT r.rolsuper OR r.rolbypassrls FROM pg_catalog.pg_roles r WHERE r.rolname = session_user), false) THEN
    RAISE EXCEPTION 'read rejected (scope): the lifecycle profiles are read by a bound principal' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.object_type) FROM (
    SELECT DISTINCT ON (x.object_type) x.* FROM objects.lifecycle_profiles x ORDER BY x.object_type, x.version DESC) p), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION objects.lifecycle_profiles_read() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.lifecycle_profiles_read() TO eye_app, eye_commit;

/* The work objects of a type in the domain: the latest version of each, its state, its owner, and whether the ledger agrees with it. */
CREATE OR REPLACE FUNCTION objects.lifecycle_objects(p_tenant uuid, p_domain uuid, p_type text, p_limit int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = objects, observation, pg_catalog, pg_temp AS $$
DECLARE p objects.lifecycle_profiles%ROWTYPE;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the work objects of the domain');
  p := objects._lc_profile(p_type);
  IF p.object_type IS NULL OR p.governance <> 'work_object' THEN
    RAISE EXCEPTION 'lifecycle read rejected (type): % is not a work-object type', coalesce(p_type, '<none>') USING ERRCODE = '22023';
  END IF;
  RETURN coalesce((SELECT jsonb_agg(j ORDER BY j ->> 'recorded_at' DESC) FROM (
    SELECT jsonb_build_object('object_type', o.object_type, 'object_id', o.object_id, 'version', o.object_version, 'state', o.lifecycle_state, 'title', o.payload ->> 'title',
             'owner', o.accountable_owner, 'synthetic', o.synthetic_state, 'classification', o.classification, 'recorded_at', o.recorded_at, 'content_digest', o.content_digest,
             'ledger', CASE WHEN c.object_id IS NULL THEN 'absent' WHEN c.version = o.object_version AND c.state = o.lifecycle_state THEN 'agrees' ELSE 'disagrees' END) AS j
      FROM (SELECT DISTINCT ON (x.object_id) x.* FROM objects.canonical_objects x
             WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.object_type = p.object_type AND x.schema_ref = p.schema_ref
             ORDER BY x.object_id, x.object_version DESC) o
      LEFT JOIN LATERAL (SELECT t.to_state AS state, t.new_version AS version, t.object_id FROM objects.lifecycle_transitions t
                          WHERE t.object_id = o.object_id AND t.outcome IN ('accepted', 'compensated') ORDER BY t.new_version DESC LIMIT 1) c ON true
     ORDER BY o.recorded_at DESC LIMIT least(greatest(coalesce(p_limit, 50), 1), 500)) z), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION objects.lifecycle_objects(uuid, uuid, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.lifecycle_objects(uuid, uuid, text, int) TO eye_app, eye_commit;

/* ONE object's lifecycle: its versions, every attempted transition (accepted, rejected, compensated), its proposals with their decisions, the
   ledger's current state, and what is UNRESOLVED (attempts refused since the last accepted transition, open proposals) — never hidden. */
CREATE OR REPLACE FUNCTION objects.lifecycle_history(p_tenant uuid, p_domain uuid, p_object_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = objects, observation, pg_catalog, pg_temp AS $$
DECLARE o objects.canonical_objects%ROWTYPE; p objects.lifecycle_profiles%ROWTYPE; v_last timestamptz; c record;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the lifecycle of a work object');
  SELECT * INTO o FROM objects.canonical_objects x WHERE x.object_id = p_object_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain ORDER BY x.object_version DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'lifecycle read rejected (unknown_object): no object % is recorded in this domain', p_object_id USING ERRCODE = '23503'; END IF;
  p := objects._lc_profile(o.object_type);
  SELECT t.to_state AS state, t.new_version AS version, t.transition_id, t.recorded_at INTO c FROM objects.lifecycle_transitions t
   WHERE t.object_id = o.object_id AND t.outcome IN ('accepted', 'compensated') ORDER BY t.new_version DESC LIMIT 1;
  v_last := c.recorded_at;
  RETURN jsonb_build_object(
    'object', jsonb_build_object('object_type', o.object_type, 'object_id', o.object_id, 'version', o.object_version, 'state', o.lifecycle_state, 'truth_state', o.truth_state,
               'synthetic', o.synthetic_state, 'classification', o.classification, 'owner', o.accountable_owner, 'owning_component', o.owning_component, 'schema_ref', o.schema_ref,
               'recorded_at', o.recorded_at, 'content_digest', o.content_digest, 'title', o.payload ->> 'title', 'statement', o.payload ->> 'statement', 'body', o.payload -> 'body',
               'review', o.payload -> 'review', 'approval', o.payload -> 'approval', 'act', o.payload -> 'act', 'evidence_refs', o.evidence_refs, 'human_refs', o.human_refs,
               'correction_of', o.correction_of, 'withdrawal_reason', o.withdrawal_reason),
    'profile', CASE WHEN p.object_type IS NULL THEN NULL ELSE to_jsonb(p) END,
    'governed_here', p.governance = 'work_object' AND o.schema_ref = p.schema_ref,
    'versions', (SELECT jsonb_agg(jsonb_build_object('version', v.object_version, 'state', v.lifecycle_state, 'truth_state', v.truth_state, 'recorded_at', v.recorded_at,
                   'content_digest', v.content_digest, 'act', v.payload -> 'act', 'correction_of', v.correction_of) ORDER BY v.object_version)
                   FROM objects.canonical_objects v WHERE v.object_id = o.object_id),
    'transitions', coalesce((SELECT jsonb_agg(objects._lc_outcome(t, false) ORDER BY t.recorded_at, t.transition_id) FROM objects.lifecycle_transitions t WHERE t.object_id = o.object_id), '[]'::jsonb),
    'proposals', coalesce((SELECT jsonb_agg(to_jsonb(r) || jsonb_build_object('decision', CASE WHEN d.proposal_id IS NULL THEN NULL ELSE to_jsonb(d) END) ORDER BY r.proposed_at)
                   FROM objects.lifecycle_proposals r LEFT JOIN objects.lifecycle_proposal_decisions d ON d.proposal_id = r.proposal_id WHERE r.object_id = o.object_id), '[]'::jsonb),
    'current', CASE WHEN c.state IS NULL THEN NULL ELSE jsonb_build_object('state', c.state, 'version', c.version, 'transition_id', c.transition_id) END,
    'agreement', CASE WHEN c.state IS NULL THEN CASE WHEN p.governance = 'work_object' AND o.schema_ref = p.schema_ref THEN 'absent' ELSE 'not_governed_here' END
                      WHEN c.version = o.object_version AND c.state = o.lifecycle_state THEN 'agrees' ELSE 'disagrees' END,
    'unresolved', jsonb_build_object(
       'refused_since_last', coalesce((SELECT jsonb_agg(jsonb_build_object('transition_id', t.transition_id, 'action', t.action, 'class', t.refusal_class, 'code', t.refusal_code,
                                         'message', t.refusal_message, 'at', t.recorded_at, 'by', t.actor_principal_id) ORDER BY t.recorded_at)
                                       FROM objects.lifecycle_transitions t WHERE t.object_id = o.object_id AND t.outcome = 'rejected' AND (v_last IS NULL OR t.recorded_at > v_last)), '[]'::jsonb),
       'open_proposals', (SELECT count(*) FROM objects.lifecycle_proposals r WHERE r.object_id = o.object_id
                            AND NOT EXISTS (SELECT 1 FROM objects.lifecycle_proposal_decisions d WHERE d.proposal_id = r.proposal_id))),
    'read_at', clock_timestamp());
END $$;
REVOKE ALL ON FUNCTION objects.lifecycle_history(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.lifecycle_history(uuid, uuid, uuid) TO eye_app, eye_commit;

/* REPLAY (CAP-AU-07): where the object stood AT an instant — the latest version recorded by then (the authoritative record), cross-checked with
   the ledger's transitions recorded by then; what happened LATER is counted, never folded in. Before the first version: not yet recorded. */
CREATE OR REPLACE FUNCTION objects.lifecycle_replay(p_tenant uuid, p_domain uuid, p_object_id uuid, p_as_of timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = objects, observation, pg_catalog, pg_temp AS $$
DECLARE o objects.canonical_objects%ROWTYPE; t objects.lifecycle_transitions%ROWTYPE; v_found boolean; v_tfound boolean; v_type text;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the lifecycle replay of a work object');
  IF p_as_of IS NULL THEN RAISE EXCEPTION 'lifecycle read rejected (as_of): a replay names its instant' USING ERRCODE = '22023'; END IF;
  SELECT x.object_type INTO v_type FROM objects.canonical_objects x WHERE x.object_id = p_object_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain LIMIT 1;
  IF v_type IS NULL THEN RAISE EXCEPTION 'lifecycle read rejected (unknown_object): no object % is recorded in this domain', p_object_id USING ERRCODE = '23503'; END IF;
  SELECT * INTO o FROM objects.canonical_objects x WHERE x.object_id = p_object_id AND x.recorded_at <= p_as_of ORDER BY x.object_version DESC LIMIT 1;
  v_found := FOUND;
  SELECT * INTO t FROM objects.lifecycle_transitions x WHERE x.object_id = p_object_id AND x.outcome IN ('accepted', 'compensated') AND x.recorded_at <= p_as_of ORDER BY x.new_version DESC LIMIT 1;
  v_tfound := FOUND;
  RETURN jsonb_build_object('object_id', p_object_id, 'object_type', v_type, 'as_of', p_as_of, 'known', v_found,
    'state', CASE WHEN v_found THEN o.lifecycle_state END, 'version', CASE WHEN v_found THEN o.object_version END, 'recorded_at', CASE WHEN v_found THEN o.recorded_at END,
    'title', CASE WHEN v_found THEN o.payload ->> 'title' END, 'content_digest', CASE WHEN v_found THEN o.content_digest END,
    'act', CASE WHEN v_found THEN o.payload -> 'act' END,
    'ledger', CASE WHEN v_tfound THEN jsonb_build_object('state', t.to_state, 'version', t.new_version, 'transition_id', t.transition_id, 'action', t.action, 'kind', t.kind) END,
    'agrees', CASE WHEN NOT v_found THEN NULL WHEN NOT v_tfound THEN NULL ELSE t.new_version = o.object_version AND t.to_state = o.lifecycle_state END,
    'later', jsonb_build_object('versions', (SELECT count(*) FROM objects.canonical_objects x WHERE x.object_id = p_object_id AND x.recorded_at > p_as_of),
                                'attempts', (SELECT count(*) FROM objects.lifecycle_transitions x WHERE x.object_id = p_object_id AND x.recorded_at > p_as_of)),
    'note', CASE WHEN NOT v_found THEN 'nothing of this object was recorded by this instant' END);
END $$;
REVOKE ALL ON FUNCTION objects.lifecycle_replay(uuid, uuid, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.lifecycle_replay(uuid, uuid, uuid, timestamptz) TO eye_app, eye_commit;

/* THE MODULE STATE of an object of a module-owned type, read from its owning module (NULL when the module holds no row for it). */
CREATE OR REPLACE FUNCTION objects._lc_module_state(p_type text, p_id uuid, p_tenant uuid, p_domain uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = objects, pg_catalog, pg_temp AS $$
DECLARE v text;
BEGIN
  CASE p_type
    WHEN 'SRC' THEN SELECT c.lifecycle_state INTO v FROM observation.source_contracts_current c WHERE c.src_object_id = p_id AND c.tenant_id = p_tenant AND c.domain_id = p_domain LIMIT 1;
    WHEN 'RSK' THEN SELECT e.state INTO v FROM prediction.exposure_current e WHERE e.exposure_id = p_id;
    WHEN 'MEM' THEN SELECT m.state INTO v FROM memory.items_current m WHERE m.item_id = p_id AND m.tenant_id = p_tenant AND m.domain_id = p_domain;
    WHEN 'FCT' THEN SELECT f.state INTO v FROM prediction.forecasts_current f WHERE f.forecast_id = p_id AND f.tenant_id = p_tenant AND f.domain_id = p_domain;
    WHEN 'WRN' THEN SELECT w.state INTO v FROM prediction.warnings_current w WHERE w.warning_id = p_id AND w.tenant_id = p_tenant AND w.domain_id = p_domain;
    WHEN 'PUB' THEN SELECT x.state INTO v FROM executive.publications x WHERE x.publication_id = p_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    WHEN 'DPK' THEN SELECT x.state INTO v FROM decision.packages_current x WHERE x.package_id = p_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    WHEN 'BRF' THEN SELECT 'composed' INTO v FROM executive.briefings b WHERE b.briefing_id = p_id AND b.tenant_id = p_tenant AND b.domain_id = p_domain;
    ELSE v := NULL;
  END CASE;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION objects._lc_module_state(text, uuid, uuid, uuid) FROM PUBLIC;

/* RECONCILE (PR-06-002): every object of a profiled type in the domain whose lifecycle does not agree —
     work object   the ledger's current state / version against the latest canonical version; a version written outside the ledger
     module        the module's state (read from the owning module) against the canonical record through the profile's rule; a module state
                   the profile does not know; a module row with no canonical record (module rows whose type writes no canonical object are
                   not walked from this side)
     canonical     a canonical state the profile does not know
   Reads only; the disagreements are listed (the first 200, with the total) — a reconciliation is a person's act on the owning port. */
CREATE OR REPLACE FUNCTION objects.lifecycle_reconcile(p_tenant uuid, p_domain uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = objects, observation, pg_catalog, pg_temp AS $$
DECLARE v_rows jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the lifecycle reconciliation of the domain');
  WITH prof AS (SELECT DISTINCT ON (x.object_type) x.* FROM objects.lifecycle_profiles x ORDER BY x.object_type, x.version DESC),
  latest AS (SELECT DISTINCT ON (o.object_id) o.object_id, o.object_type, o.object_version, o.lifecycle_state, o.schema_ref
               FROM objects.canonical_objects o JOIN prof ON prof.object_type = o.object_type
              WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain ORDER BY o.object_id, o.object_version DESC),
  judged AS (
    SELECT l.object_type, l.object_id, l.object_version, l.lifecycle_state, pr.governance,
           CASE WHEN pr.governance = 'module' THEN objects._lc_module_state(l.object_type, l.object_id, p_tenant, p_domain) END AS module_state,
           c.to_state AS ledger_state, c.new_version AS ledger_version,
           CASE WHEN pr.governance = 'work_object' THEN (SELECT count(*) FROM objects.canonical_objects v WHERE v.object_id = l.object_id
               AND NOT EXISTS (SELECT 1 FROM objects.lifecycle_transitions t WHERE t.object_id = v.object_id AND t.new_version = v.object_version AND t.outcome IN ('accepted', 'compensated')))
                ELSE 0 END AS outside,
           pr.states, pr.consistent, pr.canonical_map, pr.schema_ref AS pschema, l.schema_ref
      FROM latest l JOIN prof pr ON pr.object_type = l.object_type
      LEFT JOIN LATERAL (SELECT t.to_state, t.new_version FROM objects.lifecycle_transitions t WHERE t.object_id = l.object_id AND t.outcome IN ('accepted', 'compensated') ORDER BY t.new_version DESC LIMIT 1) c ON true),
  problems AS (
    SELECT j.*, CASE
        WHEN j.governance = 'work_object' AND j.schema_ref = j.pschema AND j.ledger_state IS NULL THEN 'no ledger record: the work object was written outside the lifecycle'
        WHEN j.governance = 'work_object' AND j.schema_ref = j.pschema AND j.outside > 0 THEN format('%s version(s) written outside the lifecycle ledger', j.outside)
        WHEN j.governance = 'work_object' AND j.schema_ref = j.pschema AND (j.ledger_version <> j.object_version OR j.ledger_state <> j.lifecycle_state)
          THEN format('the ledger says %s v%s; the canonical record says %s v%s', j.ledger_state, j.ledger_version, j.lifecycle_state, j.object_version)
        WHEN j.governance = 'module' AND j.module_state IS NULL THEN 'the owning module holds no row for this canonical record'
        WHEN j.governance = 'module' AND NOT (j.module_state = ANY (j.states)) THEN format('the module state %s is not in the %s profile', j.module_state, j.object_type)
        WHEN j.governance = 'module' AND NOT (j.consistent -> j.module_state ? j.lifecycle_state)
          THEN format('the module says %s (%s); the canonical record says %s', j.module_state, j.canonical_map ->> j.module_state, j.lifecycle_state)
        WHEN j.governance = 'canonical' AND NOT (j.lifecycle_state = ANY (j.states)) THEN format('the canonical state %s is not in the %s profile', j.lifecycle_state, j.object_type)
      END AS problem
      FROM judged j)
  SELECT jsonb_build_object('total', (SELECT count(*) FROM problems q WHERE q.problem IS NOT NULL),
           'items', coalesce((SELECT jsonb_agg(z.j) FROM (SELECT jsonb_build_object('object_type', q.object_type, 'object_id', q.object_id, 'version', q.object_version,
                                 'canonical_state', q.lifecycle_state, 'module_state', q.module_state, 'mapped', CASE WHEN q.module_state IS NOT NULL THEN q.canonical_map ->> q.module_state END,
                                 'ledger_state', q.ledger_state, 'problem', q.problem) AS j
                               FROM problems q WHERE q.problem IS NOT NULL ORDER BY q.object_type, q.object_id LIMIT 200) z), '[]'::jsonb))
    INTO v_rows;
  RETURN jsonb_build_object('read_at', clock_timestamp(), 'disagreements', v_rows -> 'items', 'total_disagreements', coalesce((v_rows ->> 'total')::int, 0),
    'checked', (SELECT coalesce(jsonb_object_agg(k.object_type, k.n), '{}'::jsonb) FROM (
                  SELECT o.object_type, count(DISTINCT o.object_id) AS n FROM objects.canonical_objects o
                   WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.object_type IN (SELECT x.object_type FROM objects.lifecycle_profiles x) GROUP BY 1) k),
    'rule', 'work objects: the ledger against the canonical versions; module types: the module''s state against the canonical record through the profile''s reconciliation rule; canonical types: the state within the profile');
END $$;
REVOKE ALL ON FUNCTION objects.lifecycle_reconcile(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.lifecycle_reconcile(uuid, uuid) TO eye_app, eye_commit;

/* EXPORT (PR-06-006's export / re-import evidence): one object's lifecycle as a self-verifying document — every version's header and payload
   (each digest recomputable), every transition (accepted, rejected, compensated), the replay, and the document's own digest. */
CREATE OR REPLACE FUNCTION objects.lifecycle_export(p_tenant uuid, p_domain uuid, p_object_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = objects, observation, canon, pg_catalog, pg_temp AS $$
DECLARE v_doc jsonb; v_type text;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the lifecycle export of a work object');
  SELECT x.object_type INTO v_type FROM objects.canonical_objects x WHERE x.object_id = p_object_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain LIMIT 1;
  IF v_type IS NULL THEN RAISE EXCEPTION 'lifecycle read rejected (unknown_object): no object % is recorded in this domain', p_object_id USING ERRCODE = '23503'; END IF;
  v_doc := jsonb_build_object('format', 'eye-lifecycle-export/1', 'object_id', p_object_id, 'object_type', v_type, 'exported_at', objects._lc_iso(clock_timestamp()),
    'versions', (SELECT jsonb_agg(jsonb_build_object('version', v.object_version, 'header', objects._lc_header(v), 'payload', v.payload, 'content_digest', v.content_digest) ORDER BY v.object_version)
                   FROM objects.canonical_objects v WHERE v.object_id = p_object_id),
    'transitions', coalesce((SELECT jsonb_agg(jsonb_build_object('transition_id', t.transition_id, 'action', t.action, 'kind', t.kind, 'outcome', t.outcome, 'from', t.from_state, 'to', t.to_state,
                   'prior_version', t.prior_version, 'new_version', t.new_version, 'refusal_code', t.refusal_code, 'actor', t.actor_principal_id, 'recorded_at', objects._lc_iso(t.recorded_at),
                   'causation_id', t.causation_id, 'compensates', t.compensates) ORDER BY t.recorded_at, t.transition_id)
                   FROM objects.lifecycle_transitions t WHERE t.object_id = p_object_id), '[]'::jsonb),
    'replay', (SELECT jsonb_agg(jsonb_build_object('version', v.object_version, 'state', v.lifecycle_state, 'recorded_at', objects._lc_iso(v.recorded_at)) ORDER BY v.object_version)
                 FROM objects.canonical_objects v WHERE v.object_id = p_object_id));
  RETURN v_doc || jsonb_build_object('digest', canon.sha256_hex(canon.jcs(v_doc)));
END $$;
REVOKE ALL ON FUNCTION objects.lifecycle_export(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.lifecycle_export(uuid, uuid, uuid) TO eye_app, eye_commit;

/* RE-IMPORT VERIFICATION: an exported document read back — its own digest, every version's digest recomputed from its header and payload, the
   versions contiguous and of this object, every written version matched by the transition that wrote it, and the replay re-derived. Reads
   nothing stored: a document that verifies here verifies on any installation. */
CREATE OR REPLACE FUNCTION objects.lifecycle_verify_export(p_doc jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = objects, canon, pg_catalog, pg_temp AS $$
DECLARE v_problems text[] := ARRAY[]::text[]; v jsonb; n int := 0; v_replay jsonb := '[]'::jsonb; t jsonb;
BEGIN
  IF p_doc IS NULL OR jsonb_typeof(p_doc) <> 'object' OR p_doc ->> 'format' IS DISTINCT FROM 'eye-lifecycle-export/1' THEN
    RETURN jsonb_build_object('valid', false, 'problems', jsonb_build_array('not an eye-lifecycle-export/1 document'));
  END IF;
  IF canon.sha256_hex(canon.jcs(p_doc - 'digest')) IS DISTINCT FROM p_doc ->> 'digest' THEN v_problems := v_problems || 'the document digest does not bind its content'::text; END IF;
  FOR v IN SELECT * FROM jsonb_array_elements(coalesce(p_doc -> 'versions', '[]'::jsonb)) LOOP
    n := n + 1;
    IF (v ->> 'version')::int IS DISTINCT FROM n THEN v_problems := v_problems || format('version %s follows %s: the versions are not contiguous', v ->> 'version', n - 1); END IF;
    IF v -> 'header' ->> 'object_version' IS DISTINCT FROM v ->> 'version' OR v -> 'header' ->> 'object_id' IS DISTINCT FROM p_doc ->> 'object_id' THEN
      v_problems := v_problems || format('version %s: the header names another object or version', v ->> 'version');
    END IF;
    IF canon.sha256_hex(canon.jcs(jsonb_build_object('header', v -> 'header', 'payload', v -> 'payload'))) IS DISTINCT FROM v ->> 'content_digest' THEN
      v_problems := v_problems || format('version %s: its content digest does not recompute from its header and payload', v ->> 'version');
    END IF;
    SELECT x INTO t FROM jsonb_array_elements(coalesce(p_doc -> 'transitions', '[]'::jsonb)) x WHERE x ->> 'new_version' = v ->> 'version' AND x ->> 'outcome' IN ('accepted', 'compensated');
    IF jsonb_array_length(coalesce(p_doc -> 'transitions', '[]'::jsonb)) > 0 THEN
      IF t IS NULL THEN v_problems := v_problems || format('version %s: no transition in the document wrote it', v ->> 'version');
      ELSIF t ->> 'to' IS DISTINCT FROM v -> 'header' ->> 'lifecycle_state' THEN
        v_problems := v_problems || format('version %s: the transition says %s, the version says %s', v ->> 'version', t ->> 'to', v -> 'header' ->> 'lifecycle_state');
      END IF;
    END IF;
    v_replay := v_replay || jsonb_build_array(jsonb_build_object('version', (v ->> 'version')::int, 'state', v -> 'header' ->> 'lifecycle_state', 'recorded_at', v -> 'header' ->> 'recorded_at'));
    t := NULL;
  END LOOP;
  IF n = 0 THEN v_problems := v_problems || 'the document carries no version'::text; END IF;
  IF v_replay IS DISTINCT FROM p_doc -> 'replay' THEN v_problems := v_problems || 'the replay re-derived from the versions differs from the exported replay'::text; END IF;
  RETURN jsonb_build_object('valid', cardinality(v_problems) = 0, 'problems', to_jsonb(v_problems), 'versions', n, 'replay', v_replay, 'object_id', p_doc ->> 'object_id');
END $$;
REVOKE ALL ON FUNCTION objects.lifecycle_verify_export(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION objects.lifecycle_verify_export(jsonb) TO eye_app, eye_commit;

-- §LC.9 THE MEASURE (V01-T-046: "lifecycle coverage", served unsupported with carrier B50 until now) ─────────────────────────────────────
/* V1 LIFECYCLE COVERAGE (rate; dimension object_type; 0113 §0.7 contract). READING — population: every canonical object of the domain that
   exists at the window's end (its first version recorded by min(p_to, p_as_of)); its state read at that instant (replay: nothing later).
   Numerator: the object is UNDER A DECLARED LIFECYCLE — its type's profile was declared by then and (a work object) the version standing then
   was written by a transition of the ledger, or (a module or canonical type) the canonical record's state is one the profile admits.
   Denominator: every object of the population; each one outside the numerator says why (no profile for its type or form; a version written
   outside the ledger; a state the profile does not know). Where no profile was declared by the window's end the result is INDETERMINATE
   (said: the register did not exist then — a 0 % would be a false reading). SCOPE: ignored — the lifecycle register is domain-wide. */
CREATE OR REPLACE FUNCTION analytics.mc_v1_lifecycle_coverage(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, objects, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_at timestamptz := least(p_to, p_as_of); v_type text := p_cohort ->> 'object_type'; v_cap int := analytics.mcb_cap(p_params); v_bound bigint; v_recs jsonb;
        v_newest timestamptz; v_reasons jsonb := '[]'::jsonb; v_profiles int;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the lifecycle coverage of the domain''s records (V1)');
  IF coalesce(p_params ->> 'clock', 'record') <> 'record' THEN RETURN analytics.mcb_clock_refused('rate', 'V1-lifecycle-coverage', 'a lifecycle state is recorded with its version', p_params); END IF;
  SELECT count(DISTINCT o.object_id) INTO v_bound FROM objects.canonical_objects o
   WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.recorded_at <= v_at AND (v_type IS NULL OR o.object_type = v_type);
  IF v_bound > v_cap THEN RETURN analytics.mcb_over_cap('rate', 'V1-lifecycle-coverage', v_bound, v_cap, 'record'); END IF;
  SELECT count(*) INTO v_profiles FROM objects.lifecycle_profiles x WHERE x.declared_at <= v_at;
  WITH latest AS (
    SELECT DISTINCT ON (o.object_id) o.object_id, o.object_type, o.object_version, o.lifecycle_state, o.schema_ref, o.recorded_at
      FROM objects.canonical_objects o
     WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.recorded_at <= v_at AND (v_type IS NULL OR o.object_type = v_type)
     ORDER BY o.object_id, o.object_version DESC),
  prof AS (SELECT DISTINCT ON (x.object_type) x.* FROM objects.lifecycle_profiles x WHERE x.declared_at <= v_at ORDER BY x.object_type, x.version DESC),
  judged AS (
    SELECT l.*, pr.governance, pr.schema_ref AS pschema,
      CASE
        WHEN pr.object_type IS NULL THEN format('no lifecycle profile declares %s', l.object_type)
        WHEN pr.governance = 'work_object' AND l.schema_ref IS DISTINCT FROM pr.schema_ref
          THEN format('the %s form has no lifecycle profile (the work-object profile governs %s)', l.schema_ref, pr.schema_ref)
        WHEN pr.governance = 'work_object' AND NOT EXISTS (SELECT 1 FROM objects.lifecycle_transitions t WHERE t.object_id = l.object_id AND t.new_version = l.object_version
                                                             AND t.outcome IN ('accepted', 'compensated') AND t.recorded_at <= v_at)
          THEN format('version %s was written outside the lifecycle ledger', l.object_version)
        WHEN pr.governance = 'module' AND NOT EXISTS (SELECT 1 FROM jsonb_each(pr.consistent) e, jsonb_array_elements_text(e.value) s WHERE s = l.lifecycle_state)
          THEN format('the canonical state %s is not one the %s profile admits', l.lifecycle_state, l.object_type)
        WHEN pr.governance = 'canonical' AND NOT (l.lifecycle_state = ANY (pr.states)) THEN format('the canonical state %s is not in the %s profile', l.lifecycle_state, l.object_type)
      END AS why_not
      FROM latest l LEFT JOIN prof pr ON pr.object_type = l.object_type)
  SELECT coalesce(jsonb_agg(analytics.mca_rec('record', format('%s:%s', j.object_type, j.object_id), CASE WHEN j.why_not IS NULL THEN 'numerator' ELSE 'denominator' END, j.why_not,
                    jsonb_strip_nulls(jsonb_build_object('object_type', j.object_type, 'governance', coalesce(j.governance, 'none'), 'state', j.lifecycle_state, 'version', j.object_version,
                                                         'recorded_at', j.recorded_at))) ORDER BY j.object_type, j.object_id), '[]'::jsonb),
         max(j.recorded_at)
    INTO v_recs, v_newest FROM judged j;
  IF v_profiles = 0 THEN
    v_reasons := v_reasons || to_jsonb('no lifecycle profile was declared by the window''s end: the lifecycle register did not exist then — a coverage reading for this window would be false'::text);
  END IF;
  RETURN analytics.mcb_finish(jsonb_build_object('kind', 'rate', 'records', v_recs, 'reasons', v_reasons,
    'quality', jsonb_build_object('clock', 'record', 'read_at', v_at, 'profiles_in_force', v_profiles, 'scope_rule', 'ignored: the lifecycle register is domain-wide')), 'object_type', v_newest);
END $$;
REVOKE ALL ON FUNCTION analytics.mc_v1_lifecycle_coverage(uuid,uuid,timestamptz,timestamptz,timestamptz,jsonb,jsonb,jsonb) FROM PUBLIC;
SELECT analytics.register_computation('v1_lifecycle_coverage', 'analytics.mc_v1_lifecycle_coverage', 'rate', ARRAY['object_type'],
  ARRAY['objects.canonical_objects', 'objects.lifecycle_profiles', 'objects.lifecycle_transitions'], 'ignored: the lifecycle register is domain-wide',
  'V1 lifecycle coverage (V01-T-046): objects existing at the window''s end that stand under a declared lifecycle — a work object''s version written by its ledger, a module or canonical type''s state admitted by its profile', '0120 §LC');

-- §LC.10 THE CHECKS ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM analytics.computation_registry r WHERE r.computation_key = 'v1_lifecycle_coverage' AND r.registered_in = '0120 §LC') THEN
    RAISE EXCEPTION 'migration 0120 §LC: the lifecycle coverage computation is not registered';
  END IF;
  IF (SELECT count(*) FROM observation.canonical_write_actions w WHERE w.action IN ('objects.work_object.author', 'objects.lifecycle.transition', 'objects.lifecycle.proposal.decide') AND w.object_types = ARRAY['ASM']) <> 3 THEN
    RAISE EXCEPTION 'migration 0120 §LC: the three work-object write actions are not pinned to ASM';
  END IF;
END $$;
