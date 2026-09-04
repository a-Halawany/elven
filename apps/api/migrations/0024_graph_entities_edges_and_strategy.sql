-- ============================================================
-- 0024 — ENTERPRISE MEMORY + KNOWLEDGE GRAPH (L3–L4).
--
-- Phase 2 produces attributable claims. Two claims about "Bab el-Mandeb Strait"
-- are still two unrelated strings: nothing connects the chokepoint to the route,
-- the route to the supplier, or the supplier to the component — and nothing
-- notices when a corrected claim undermines something a person is relying on.
--
-- This migration adds the machinery that closes both gaps, and it inherits the
-- posture of 0022 and 0023 unchanged: the scope triple is NOT NULL and
-- CHECK-constrained, every table is under FORCE ROW LEVEL SECURITY, and every
-- write goes through a SECURITY DEFINER port that asserts the caller's own bound
-- action before it touches a row.
--
--   §2  entity registry (event log + projection)
--   §3  identifier systems and entity identifiers — the ONLY basis for an
--       automatic resolution
--   §4  resolutions: mention → entity, reversible, never an edit to the claim
--   §5  edges with BITEMPORAL validity and provenance on the edge itself
--   §6  the Strategy Graph: objectives, assumptions, decisions, commitments,
--       outcomes
--   §7  dependencies — what a strategy object rests on
--   §8  invalidation and impact assessment
--   §9  RLS
--   §10 ports
--   §11 canonical write actions + the strategy schema
--   §12 projection rebuild
--
-- ── THE EIGHT RESOLVER AUTHORITY RULES ──
--
-- They are frozen product rules, and they are expressed HERE as constraints and
-- port refusals rather than as conventions a service is trusted to follow:
--
--   1. An exact match on the same authoritative external identifier may resolve
--      automatically, provided the identifier source, resolver rule/version and
--      complete provenance are recorded.        → res_auto_only_on_identifier,
--                                                  res_identifier_match_is_exact,
--                                                  graph.propose_resolution
--   2. Name-only, fuzzy, conflicting or incomplete matches must NEVER
--      auto-resolve.                             → res_auto_only_on_identifier
--   3. When deterministic scoring cannot produce an authoritative exact match,
--      the Model Gateway may rank or propose candidates.   → method
--      'model_assisted' exists and is proposable, and nothing more.
--   4. A model proposal is EVIDENCE for the queue, not a final identity
--      decision.                                 → res_auto_only_on_identifier
--                                                  refuses a model-assisted
--                                                  acceptance with no decider.
--   5. Model-assisted resolution must carry mode, model/weights/runtime, prompt
--      and decoding digests, confidence, candidate set and source evidence
--      lineage.                                  → res_model_lineage_complete
--   6. Ambiguous resolutions require approval by a human who is not the
--      proposing agent, with a written reason.   → res_decider_is_not_proposer,
--                                                  res_decision_has_reason, and
--                                                  the policy bundle, which
--                                                  grants graph.resolution.decide
--                                                  to no agent role.
--   7. Abstention or insufficient evidence must remain UNRESOLVED; never force a
--      best match.                               → no port writes an accepted
--                                                  resolution without either an
--                                                  identifier match or a human,
--                                                  and a mention with no
--                                                  accepted resolution is simply
--                                                  unresolved.
--   8. Wrong resolutions must be reversible through supersession/split while
--      preserving history and known-at results.  → graph.split_entity supersedes;
--                                                  it deletes nothing.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS graph;
GRANT USAGE ON SCHEMA graph TO eye_app, eye_commit;

/*
 * The three Phase 3 roles.
 *
 * `resolution_agent` proposes and may resolve ONLY on an authoritative identifier
 * match; it can decide nothing. `resolution_manager` decides the ambiguous tail
 * and splits wrong merges, and runs no resolver. `strategy_owner` declares the
 * Strategy Graph and owns what rests on it. An agent that could accept its own
 * proposal would make the resolution queue decorative in exactly the way the
 * Phase 2 review queue must not be.
 */
INSERT INTO identity.roles (code, scope, description) VALUES
  ('resolution_manager', 'DOMAIN',
   'Resolution manager — decides ambiguous entity resolutions and splits wrongly merged entities. May never decide a resolution it proposed (resolver rule 6).'),
  ('resolution_agent', 'DOMAIN',
   'Resolution agent — runs the deterministic resolver and proposes candidates. Cannot decide a resolution, split an entity or retract an edge.'),
  ('strategy_owner', 'DOMAIN',
   'Strategy owner — declares objectives, assumptions, decisions, commitments and outcomes, and links them to what they rest on.')
ON CONFLICT (code) DO NOTHING;

/*
 * The guards are observation's, reused rather than duplicated for the third time.
 * They are generic: one asserts that the established context is bound to the
 * action this port serves, the other that the scope written is the context's own
 * and never an argument.
 */

-- ============================================================
-- 2. Entity registry.
-- ============================================================
/*
 * AN ENTITY IS NOT A CLAIM.
 *
 * Every mention keeps its own ENT claim with its own evidence and lineage; an
 * entity is a governed IDENTITY that mentions resolve to. Resolution is therefore
 * a separate, reversible assertion (§4) and never an edit to a claim — which is
 * what makes a wrong merge undoable without rewriting what anyone said.
 */
CREATE TABLE graph.entity_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  entity_id          uuid NOT NULL,
  event              text NOT NULL CHECK (event IN (
    'entity.created', 'entity.renamed', 'entity.identified',
    'entity.split', 'entity.superseded', 'entity.retired')),
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_principal_id uuid NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id     uuid NOT NULL,
  CONSTRAINT ent_event_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX ent_events_entity ON graph.entity_events (entity_id, occurred_at);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON graph.entity_events
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE graph.entities_current (
  entity_id        uuid PRIMARY KEY,
  scope            text NOT NULL,
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  entity_type      text NOT NULL CHECK (entity_type IN (
                     'organization', 'place', 'asset', 'product', 'vessel',
                     'route', 'person', 'other')),
  canonical_name   text NOT NULL CHECK (length(canonical_name) BETWEEN 1 AND 512),
  /*
   * The normalised form is stored, not recomputed at query time, because it is
   * part of what a resolution RECORDS: a later change to the normaliser must not
   * silently re-explain a decision that was made under the old one.
   */
  normalized_name  text NOT NULL CHECK (length(normalized_name) >= 1),
  lifecycle_state  text NOT NULL CHECK (lifecycle_state IN ('active', 'superseded', 'retired')),
  /*
   * SPLIT LINEAGE. An entity produced by splitting another names its origin, and
   * the origin is NOT deleted: a known-at query before the split still reproduces
   * the merged view (resolver rule 8).
   */
  split_from       uuid,
  superseded_by    uuid,
  created_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by       uuid NOT NULL,
  correlation_id   uuid NOT NULL,
  CONSTRAINT gent_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT gent_superseded_names_successor CHECK (
    lifecycle_state <> 'superseded' OR superseded_by IS NOT NULL)
);
-- NOT unique on the name: two DIFFERENT entities sharing a normalised name is
-- precisely the ambiguity this phase exists to route to a person.
CREATE INDEX gent_name ON graph.entities_current (tenant_id, domain_id, normalized_name);
CREATE INDEX gent_state ON graph.entities_current (lifecycle_state, updated_at DESC);

-- ============================================================
-- 3. Identifier systems and entity identifiers.
-- ============================================================
/*
 * THE ONLY BASIS FOR AN AUTOMATIC RESOLUTION.
 *
 * Rule 1 permits an automatic resolution on an exact match against the same
 * AUTHORITATIVE external identifier. A system is authoritative because someone
 * registered it as such and said which authority issues it — never because a
 * string happened to look like an identifier.
 */
CREATE TABLE graph.identifier_systems (
  scope            text NOT NULL,
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  system_key       text NOT NULL CHECK (system_key ~ '^[a-z0-9][a-z0-9_.:-]{1,63}$'),
  authority        text NOT NULL CHECK (length(authority) >= 2),
  description      text NOT NULL,
  is_authoritative boolean NOT NULL,
  registered_by    uuid NOT NULL,
  registered_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id   uuid NOT NULL,
  PRIMARY KEY (tenant_id, domain_id, system_key),
  CONSTRAINT idsys_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);

CREATE TABLE graph.entity_identifiers (
  identifier_id     uuid PRIMARY KEY,
  scope             text NOT NULL,
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  entity_id         uuid NOT NULL REFERENCES graph.entities_current (entity_id),
  system_key        text NOT NULL,
  identifier_value  text NOT NULL CHECK (length(identifier_value) BETWEEN 1 AND 256),
  -- WHERE IT CAME FROM. An identifier with no source claim is not provenance.
  source_claim_object_id uuid NOT NULL,
  source_evidence_object_id uuid NOT NULL,
  recorded_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  recorded_by       uuid NOT NULL,
  correlation_id    uuid NOT NULL,
  CONSTRAINT eid_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT eid_system FOREIGN KEY (tenant_id, domain_id, system_key)
    REFERENCES graph.identifier_systems (tenant_id, domain_id, system_key)
);
/*
 * ONE ENTITY PER IDENTIFIER, ENFORCED.
 *
 * This index is what makes rule 1 safe: a second mention carrying the same
 * (system, value) can only find ONE entity, so "exact match on the same
 * authoritative identifier" is a lookup with a unique answer rather than a
 * heuristic with a tie-break. Attaching the same identifier to a second entity is
 * refused by the database, not resolved by preference.
 */
CREATE UNIQUE INDEX eid_unique_per_system
  ON graph.entity_identifiers (tenant_id, domain_id, system_key, identifier_value);
CREATE INDEX eid_entity ON graph.entity_identifiers (entity_id);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON graph.entity_identifiers
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- ============================================================
-- 4. Resolutions — mention → entity, and the eight rules as constraints.
-- ============================================================
CREATE TABLE graph.resolution_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  resolution_id      uuid NOT NULL,
  event              text NOT NULL CHECK (event IN (
    'resolution.proposed', 'resolution.auto_accepted', 'resolution.accepted',
    'resolution.rejected', 'resolution.superseded')),
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_principal_id uuid NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id     uuid NOT NULL,
  CONSTRAINT res_event_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX res_events_res ON graph.resolution_events (resolution_id, occurred_at);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON graph.resolution_events
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE graph.resolutions_current (
  resolution_id     uuid PRIMARY KEY,
  scope             text NOT NULL,
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  -- THE MENTION. It keeps its own claim; this row points at it and changes nothing.
  claim_object_id   uuid NOT NULL,
  claim_version     bigint NOT NULL CHECK (claim_version >= 1),
  mention_text      text NOT NULL,
  entity_id         uuid NOT NULL REFERENCES graph.entities_current (entity_id),
  /*
   * HOW IT WAS ARRIVED AT. The value is load-bearing, not descriptive: the
   * constraints below read it to decide what this row is even allowed to be.
   */
  method            text NOT NULL CHECK (method IN (
                      'deterministic_identifier', 'deterministic_name',
                      'model_assisted', 'human')),
  rule_id           text NOT NULL CHECK (length(rule_id) >= 2),
  rule_version      text NOT NULL CHECK (length(rule_version) >= 1),
  score             numeric NOT NULL CHECK (score >= 0 AND score <= 1),
  -- WHAT MATCHED, in the resolver's own words. Never a bare number.
  match_evidence    jsonb NOT NULL,
  -- Every candidate the resolver considered, with its score. Rule 5 requires it
  -- for a model proposal; the deterministic paths record it too, because a
  -- reviewer needs to see what was NOT chosen.
  candidate_set     jsonb NOT NULL DEFAULT '[]'::jsonb,
  state             text NOT NULL CHECK (state IN ('proposed', 'accepted', 'rejected', 'superseded')),
  proposer_principal_id uuid NOT NULL,
  proposed_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_by        uuid,
  decided_at        timestamptz,
  decision_reason   text,
  /*
   * RECORD TIME, EXPLICITLY (C3).
   *
   * "A known-at query before the split still reproduces the merged view" needs to
   * know WHEN this resolution started and stopped being the answer. Deriving that
   * from the event log is possible and fragile; storing it makes the known-at
   * query a predicate rather than a reconstruction.
   */
  accepted_at       timestamptz,
  superseded_at     timestamptz,
  -- MODEL LINEAGE (rule 5). Nullable in the column and mandatory in the CHECK:
  -- a model-assisted row without all of it cannot exist.
  mode              text CHECK (mode IS NULL OR mode IN ('replay', 'local-live')),
  model_id          text,
  model_weights_digest text CHECK (model_weights_digest IS NULL OR model_weights_digest ~ '^[0-9a-f]{64}$'),
  runtime_version   text,
  prompt_digest     text CHECK (prompt_digest IS NULL OR prompt_digest ~ '^[0-9a-f]{64}$'),
  decoding_digest   text CHECK (decoding_digest IS NULL OR decoding_digest ~ '^[0-9a-f]{64}$'),
  model_confidence  numeric CHECK (model_confidence IS NULL OR (model_confidence >= 0 AND model_confidence <= 1)),
  call_id           uuid,
  method_id         uuid,
  run_id            uuid,
  -- SOURCE EVIDENCE LINEAGE (rule 5): the bytes the mention came from.
  evidence_object_id uuid NOT NULL,
  evidence_digest   text NOT NULL CHECK (evidence_digest ~ '^[0-9a-f]{64}$'),
  superseded_by     uuid,
  correlation_id    uuid NOT NULL,
  CONSTRAINT res_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),

  /*
   * RULES 1, 2 AND 4, IN ONE CONSTRAINT.
   *
   * An ACCEPTED resolution either was decided by a person, or was matched on an
   * authoritative external identifier. There is no third way to become accepted,
   * so a name match, a fuzzy match and a model proposal are all structurally
   * incapable of resolving themselves — no matter what any service intends.
   */
  CONSTRAINT res_auto_only_on_identifier CHECK (
    state <> 'accepted'
    OR decided_by IS NOT NULL
    OR method = 'deterministic_identifier'),

  -- Rule 1: "exact match" means exact. A deterministic identifier resolution that
  -- scored anything below 1 is not the thing rule 1 permits.
  CONSTRAINT res_identifier_match_is_exact CHECK (
    method <> 'deterministic_identifier' OR score = 1),

  -- Rule 5: complete lineage or no model-assisted row at all.
  CONSTRAINT res_model_lineage_complete CHECK (
    method <> 'model_assisted' OR (
      mode IS NOT NULL AND model_id IS NOT NULL AND model_weights_digest IS NOT NULL
      AND runtime_version IS NOT NULL AND prompt_digest IS NOT NULL
      AND decoding_digest IS NOT NULL AND model_confidence IS NOT NULL
      AND jsonb_array_length(candidate_set) >= 1)),

  -- Rule 6: a written reason, and a decider who is not the proposer.
  CONSTRAINT res_decision_has_reason CHECK (
    decided_by IS NULL OR (decision_reason IS NOT NULL AND length(btrim(decision_reason)) >= 8)),
  /*
   * Rule 6 is about an AMBIGUOUS RESOLUTION being approved: a proposal made by
   * one party and cleared by another. A `human` row is not that — it is a
   * person's own direct act (a split, §10), where there is no separate proposer
   * to be independent of and the person IS both. Every other method is a
   * proposal, and for those the decider must be someone else.
   *
   * This is not a loophole: the only port that writes an accepted `human` row is
   * `graph.split_entity`, which requires the human-only `graph.entity.split`
   * action and a written reason. A `human` row created through
   * `graph.propose_resolution` is still born `proposed` and still has to go
   * through `graph.decide_resolution`, which refuses a decider who proposed it.
   */
  CONSTRAINT res_decider_is_not_proposer CHECK (
    decided_by IS NULL OR method = 'human' OR decided_by <> proposer_principal_id),
  CONSTRAINT res_decided_has_instant CHECK (
    (decided_by IS NULL) = (decided_at IS NULL)),
  CONSTRAINT res_superseded_names_successor CHECK (
    state <> 'superseded' OR (superseded_by IS NOT NULL AND superseded_at IS NOT NULL)),
  CONSTRAINT res_accepted_has_instant CHECK (
    state <> 'accepted' OR accepted_at IS NOT NULL)
);
/*
 * RULE 7, AS AN INDEX.
 *
 * A mention has AT MOST ONE accepted resolution. It may have none — an abstention
 * or insufficient evidence leaves it unresolved, and nothing anywhere forces a
 * best match. Proposals may pile up; acceptances cannot compete.
 */
CREATE UNIQUE INDEX res_one_accepted_per_mention
  ON graph.resolutions_current (tenant_id, domain_id, claim_object_id)
  WHERE state = 'accepted';
CREATE INDEX res_queue ON graph.resolutions_current (state, score, proposed_at);
CREATE INDEX res_entity ON graph.resolutions_current (entity_id, state);
CREATE INDEX res_claim ON graph.resolutions_current (claim_object_id);

-- ============================================================
-- 5. Edges — bitemporal, and provenance-bound.
-- ============================================================
/*
 * AN EDGE IS AN ASSERTION WITH A LIFETIME, NOT A FACT.
 *
 * TWO TIME AXES, KEPT APART:
 *   * WORLD time  — `valid_from` / `valid_to`: when the relationship held.
 *   * RECORD time — `asserted_at` / `retracted_at`: when WE believed it.
 *
 * An as-of query that filters only world time answers with hindsight: it would
 * include an edge asserted last week about a period two years ago. C5 asks for
 * the graph AS IT STOOD, so both axes are stored and both are filtered.
 */
CREATE TABLE graph.edge_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  edge_id            uuid NOT NULL,
  event              text NOT NULL CHECK (event IN (
    'edge.asserted', 'edge.retracted', 'edge.superseded')),
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_principal_id uuid NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id     uuid NOT NULL,
  CONSTRAINT edg_event_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX edg_events_edge ON graph.edge_events (edge_id, occurred_at);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON graph.edge_events
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE graph.edges_current (
  edge_id            uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  subject_entity_id  uuid NOT NULL REFERENCES graph.entities_current (entity_id),
  predicate          text NOT NULL CHECK (length(predicate) BETWEEN 2 AND 128),
  object_entity_id   uuid NOT NULL REFERENCES graph.entities_current (entity_id),
  -- World time.
  valid_from         timestamptz NOT NULL,
  valid_to           timestamptz,
  -- Record time.
  asserted_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  retracted_at       timestamptz,
  state              text NOT NULL CHECK (state IN ('asserted', 'retracted', 'superseded')),
  -- PROVENANCE ON THE EDGE ITSELF, not on something it points at. An edge that
  -- cannot name the claim and the evidence bytes behind it is not admissible.
  claim_object_id    uuid NOT NULL,
  claim_version      bigint NOT NULL CHECK (claim_version >= 1),
  evidence_object_id uuid NOT NULL,
  evidence_digest    text NOT NULL CHECK (evidence_digest ~ '^[0-9a-f]{64}$'),
  method_id          uuid,
  run_id             uuid,
  mode               text NOT NULL CHECK (mode IN ('replay', 'local-live')),
  confidence         numeric NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  asserted_by        uuid NOT NULL,
  retracted_by       uuid,
  retraction_reason  text,
  superseded_by      uuid,
  correlation_id     uuid NOT NULL,
  CONSTRAINT edg_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT edg_temporal_order CHECK (valid_to IS NULL OR valid_to > valid_from),
  CONSTRAINT edg_no_self_loop CHECK (subject_entity_id <> object_entity_id),
  CONSTRAINT edg_retraction_is_explained CHECK (
    state <> 'retracted' OR (retracted_at IS NOT NULL AND retracted_by IS NOT NULL
                             AND retraction_reason IS NOT NULL
                             AND length(btrim(retraction_reason)) >= 8)),
  CONSTRAINT edg_superseded_names_successor CHECK (
    state <> 'superseded' OR superseded_by IS NOT NULL)
);
CREATE INDEX edg_subject ON graph.edges_current (subject_entity_id, predicate, valid_from);
CREATE INDEX edg_object  ON graph.edges_current (object_entity_id, predicate, valid_from);
CREATE INDEX edg_claim   ON graph.edges_current (claim_object_id);
CREATE INDEX edg_record_time ON graph.edges_current (asserted_at, retracted_at);

-- ============================================================
-- 6. The Strategy Graph.
-- ============================================================
/*
 * Objectives, assumptions, decisions, commitments and outcomes are CANONICAL
 * objects — they carry the 43-column header, they version, they are corrected
 * rather than edited. This projection is what the graph is traversed through, and
 * it carries the one piece of state a header cannot: whether an assumption is
 * still believed.
 */
CREATE TABLE graph.strategy_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  strategy_object_id uuid NOT NULL,
  event              text NOT NULL CHECK (event IN (
    'strategy.declared', 'strategy.linked', 'strategy.unlinked',
    'assumption.verified', 'assumption.unverified', 'assumption.invalidated',
    'strategy.closed', 'strategy.withdrawn')),
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_principal_id uuid NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id     uuid NOT NULL,
  CONSTRAINT stg_event_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX stg_events_object ON graph.strategy_events (strategy_object_id, occurred_at);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON graph.strategy_events
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE graph.strategy_current (
  strategy_object_id uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  object_type        text NOT NULL CHECK (object_type IN ('OBJ', 'ASU', 'DEC', 'CMT', 'OUT')),
  object_version     bigint NOT NULL CHECK (object_version >= 1),
  title              text NOT NULL CHECK (length(title) BETWEEN 2 AND 256),
  statement          text NOT NULL CHECK (length(statement) BETWEEN 2 AND 4096),
  status             text NOT NULL CHECK (status IN ('active', 'closed', 'withdrawn')),
  /*
   * ONLY AN ASSUMPTION HAS A VERIFICATION STATE. An objective is not "verified";
   * it rests on assumptions that are. The CHECK says so rather than leaving a
   * column that means nothing on four of the five types.
   */
  verification_state text NOT NULL CHECK (verification_state IN (
                       'verified', 'unverified', 'invalidated', 'not_applicable')),
  verification_reason text,
  verified_at        timestamptz,
  parent_objective_id uuid,
  owner_principal_id uuid NOT NULL,
  declared_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT stgc_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT stgc_only_assumptions_verify CHECK (
    object_type = 'ASU' OR verification_state = 'not_applicable')
);
CREATE INDEX stgc_type ON graph.strategy_current (tenant_id, domain_id, object_type, status);
CREATE INDEX stgc_verification ON graph.strategy_current (verification_state)
  WHERE object_type = 'ASU';

-- ============================================================
-- 7. Dependencies — what a strategy object rests on.
-- ============================================================
/*
 * This is the table that retires "downstream consumers not yet present". Phase 1
 * could not know what consumed an object because nothing recorded it; from here
 * on, something does — and the record is DECLARED by a person with a rationale,
 * never inferred from co-occurrence.
 */
CREATE TABLE graph.dependencies (
  dependency_id       uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  dependent_object_id uuid NOT NULL REFERENCES graph.strategy_current (strategy_object_id),
  dependent_type      text NOT NULL CHECK (dependent_type IN ('OBJ', 'ASU', 'DEC', 'CMT', 'OUT')),
  depends_on_kind     text NOT NULL CHECK (depends_on_kind IN ('claim', 'entity', 'edge', 'strategy')),
  depends_on_id       uuid NOT NULL,
  rationale           text NOT NULL CHECK (length(btrim(rationale)) >= 8),
  state               text NOT NULL CHECK (state IN ('active', 'removed')),
  created_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by          uuid NOT NULL,
  removed_at          timestamptz,
  removed_by          uuid,
  correlation_id      uuid NOT NULL,
  CONSTRAINT dep_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dep_no_self CHECK (depends_on_kind <> 'strategy' OR depends_on_id <> dependent_object_id)
);
CREATE UNIQUE INDEX dep_unique_active
  ON graph.dependencies (tenant_id, domain_id, dependent_object_id, depends_on_kind, depends_on_id)
  WHERE state = 'active';
CREATE INDEX dep_target ON graph.dependencies (depends_on_kind, depends_on_id, state);

-- ============================================================
-- 8. Invalidation and impact assessment.
-- ============================================================
/*
 * INVALIDATION REPORTS; IT DOES NOT DECIDE.
 *
 * A correction or withdrawal walks §7 and marks every assumption resting on the
 * changed claim UNVERIFIED — not false, not withdrawn. It then lists the
 * objectives, decisions and commitments above those assumptions so a person can
 * look at them. Nothing here concludes anything about the objective itself; that
 * is a human's job and, in a later phase, a decision package's.
 */
CREATE TABLE graph.invalidation_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  invalidation_id    uuid NOT NULL,
  event              text NOT NULL CHECK (event IN (
    'invalidation.opened', 'invalidation.assessed', 'invalidation.closed')),
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_principal_id uuid NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id     uuid NOT NULL,
  CONSTRAINT inv_event_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX inv_events_inv ON graph.invalidation_events (invalidation_id, occurred_at);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON graph.invalidation_events
  FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE graph.invalidations_current (
  invalidation_id    uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  trigger_kind       text NOT NULL CHECK (trigger_kind IN (
                       'claim_correction', 'claim_withdrawal', 'edge_retraction',
                       'entity_split', 'manual')),
  trigger_object_id  uuid NOT NULL,
  -- Set when the trigger was a Phase 1 correction case. This is the join that
  -- lets a correction finally say what it affected.
  correction_case_id uuid,
  opened_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  opened_by          uuid NOT NULL,
  affected_assumptions jsonb NOT NULL DEFAULT '[]'::jsonb,
  affected_objectives  jsonb NOT NULL DEFAULT '[]'::jsonb,
  affected_decisions   jsonb NOT NULL DEFAULT '[]'::jsonb,
  affected_commitments jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- The propagation statement in words, stored rather than rendered — so it
  -- survives into the record exactly as Phase 1's unresolved sentence did.
  statement          text NOT NULL CHECK (length(btrim(statement)) >= 8),
  state              text NOT NULL CHECK (state IN ('open', 'assessed', 'closed')),
  assessed_at        timestamptz,
  correlation_id     uuid NOT NULL,
  CONSTRAINT invc_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX invc_trigger ON graph.invalidations_current (trigger_object_id, opened_at DESC);
CREATE INDEX invc_case ON graph.invalidations_current (correction_case_id);

/*
 * ONE ADDITIVE CHANGE TO A PHASE 1 TABLE, AND ONLY ONE.
 *
 * `observation.correction_current.propagation_unresolved` has said, since Phase 1,
 * "downstream consumers not yet present (KG/dependency graph arrives Phase 3)".
 * That sentence was a true statement ABOUT THE WORLD AT THE TIME, not a fixed
 * label — and leaving it in place once a dependency graph exists and has been
 * walked would make it false.
 *
 * So Phase 3 adds a nullable column naming the assessment that resolved it, and
 * the port in §10 rewrites the sentence for exactly the case it assessed. No
 * Phase 1 code path changes, no Phase 1 default changes, and a case that has had
 * no Phase 3 propagation still says precisely what it said before.
 */
ALTER TABLE observation.correction_current
  ADD COLUMN propagation_assessment_id uuid;

-- ============================================================
-- 9. Row-level security on every table in the schema.
-- ============================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'entity_events', 'entities_current', 'identifier_systems', 'entity_identifiers',
    'resolution_events', 'resolutions_current', 'edge_events', 'edges_current',
    'strategy_events', 'strategy_current', 'dependencies',
    'invalidation_events', 'invalidations_current'
  ] LOOP
    EXECUTE format('ALTER TABLE graph.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE graph.%I FORCE ROW LEVEL SECURITY', t);
    /*
     * C4 IS PARTLY THIS POLICY.
     *
     * Search returns rows; a row outside the caller's tenant or domain is not
     * filtered late by a service that could forget — it is not visible to the
     * query at all. A result the caller may not see is therefore ABSENT, and a
     * search that matched nothing and a search whose matches were all invisible
     * produce the identical answer.
     */
    EXECUTE format($f$
      CREATE POLICY graph_isolation ON graph.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON graph.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- ============================================================
-- 10. Ports. Every write to this schema goes through one of these, and each
--     asserts the caller's OWN bound action before it touches a row.
-- ============================================================

CREATE OR REPLACE FUNCTION graph.register_identifier_system(
  p_tenant uuid, p_domain uuid, p_system_key text, p_authority text,
  p_description text, p_is_authoritative boolean, p_actor uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.entity.create']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  INSERT INTO graph.identifier_systems (
    scope, tenant_id, domain_id, system_key, authority, description,
    is_authoritative, registered_by, correlation_id
  ) VALUES (
    'DOMAIN', p_tenant, p_domain, p_system_key, p_authority, p_description,
    p_is_authoritative, p_actor, p_correlation)
  ON CONFLICT (tenant_id, domain_id, system_key) DO NOTHING;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.register_identifier_system(uuid,uuid,text,text,text,boolean,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.register_identifier_system(uuid,uuid,text,text,text,boolean,uuid,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION graph.create_entity(
  p_entity_id uuid, p_tenant uuid, p_domain uuid, p_entity_type text,
  p_canonical_name text, p_normalized_name text, p_actor uuid,
  p_split_from uuid, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(
    ARRAY['graph.entity.create', 'graph.resolution.propose', 'graph.entity.split']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  INSERT INTO graph.entities_current (
    entity_id, scope, tenant_id, domain_id, entity_type, canonical_name,
    normalized_name, lifecycle_state, split_from, created_by, correlation_id
  ) VALUES (
    p_entity_id, 'DOMAIN', p_tenant, p_domain, p_entity_type, p_canonical_name,
    p_normalized_name, 'active', p_split_from, p_actor, p_correlation);
  INSERT INTO graph.entity_events (
    event_id, scope, tenant_id, domain_id, entity_id, event, actor_principal_id,
    details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_entity_id, 'entity.created', p_actor,
    jsonb_build_object('entity_type', p_entity_type, 'canonical_name', p_canonical_name,
                       'normalized_name', p_normalized_name, 'split_from', p_split_from),
    p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.create_entity(uuid,uuid,uuid,text,text,text,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.create_entity(uuid,uuid,uuid,text,text,text,uuid,uuid,uuid,uuid) TO eye_commit;

/*
 * Attaching an identifier is the act that makes rule 1 possible for the NEXT
 * mention. The unique index refuses the same (system, value) on a second entity;
 * this port turns that refusal into an honest error rather than a constraint name.
 */
CREATE OR REPLACE FUNCTION graph.attach_identifier(
  p_identifier_id uuid, p_tenant uuid, p_domain uuid, p_entity_id uuid,
  p_system_key text, p_value text, p_claim_object_id uuid, p_evidence_object_id uuid,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_holder uuid; v_auth boolean;
BEGIN
  PERFORM observation.assert_authority(
    ARRAY['graph.entity.create', 'graph.resolution.propose', 'graph.resolution.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT s.is_authoritative INTO v_auth FROM graph.identifier_systems s
   WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.system_key = p_system_key;
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'identifier rejected: no identifier system % is registered in this domain', p_system_key
      USING ERRCODE = '23503';
  END IF;
  SELECT i.entity_id INTO v_holder FROM graph.entity_identifiers i
   WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain
     AND i.system_key = p_system_key AND i.identifier_value = p_value;
  IF v_holder IS NOT NULL AND v_holder <> p_entity_id THEN
    RAISE EXCEPTION 'identifier rejected: % % already identifies a different entity; an authoritative identifier names one thing',
      p_system_key, p_value USING ERRCODE = '23505';
  END IF;
  IF v_holder = p_entity_id THEN RETURN; END IF;
  INSERT INTO graph.entity_identifiers (
    identifier_id, scope, tenant_id, domain_id, entity_id, system_key, identifier_value,
    source_claim_object_id, source_evidence_object_id, recorded_by, correlation_id
  ) VALUES (
    p_identifier_id, 'DOMAIN', p_tenant, p_domain, p_entity_id, p_system_key, p_value,
    p_claim_object_id, p_evidence_object_id, p_actor, p_correlation);
  INSERT INTO graph.entity_events (
    event_id, scope, tenant_id, domain_id, entity_id, event, actor_principal_id,
    details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_entity_id, 'entity.identified', p_actor,
    jsonb_build_object('system_key', p_system_key, 'value', p_value,
                       'is_authoritative', v_auth, 'claim_object_id', p_claim_object_id),
    p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.attach_identifier(uuid,uuid,uuid,uuid,text,text,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.attach_identifier(uuid,uuid,uuid,uuid,text,text,uuid,uuid,uuid,uuid,uuid) TO eye_commit;

/*
 * THE RESOLUTION PORT — and the place rules 1–5 and 7 are actually enforced.
 *
 * The caller does NOT get to say whether its proposal is accepted. It says what it
 * matched and how; this port decides, and the only path to `accepted` without a
 * person is an authoritative identifier match that the database itself re-checks
 * against §3. A caller claiming `deterministic_identifier` on a name match is
 * refused here, before the CHECK constraint would refuse it more obscurely.
 */
CREATE OR REPLACE FUNCTION graph.propose_resolution(
  p_resolution_id uuid, p_tenant uuid, p_domain uuid,
  p_claim_object_id uuid, p_claim_version bigint, p_mention_text text,
  p_entity_id uuid, p_method text, p_rule_id text, p_rule_version text,
  p_score numeric, p_match_evidence jsonb, p_candidate_set jsonb,
  p_proposer uuid, p_evidence_object_id uuid, p_evidence_digest text,
  p_mode text, p_model_id text, p_weights text, p_runtime text,
  p_prompt_digest text, p_decoding_digest text, p_model_confidence numeric,
  p_call_id uuid, p_method_id uuid, p_run_id uuid,
  p_identifier_system text, p_identifier_value text,
  p_event_id uuid, p_correlation uuid
) RETURNS TABLE (state text, auto_accepted boolean)
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_state text := 'proposed'; v_auto boolean := false; v_holder uuid; v_auth boolean;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.resolution.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);

  IF p_method = 'deterministic_identifier' THEN
    /*
     * RULE 1, RE-CHECKED HERE RATHER THAN TRUSTED.
     *
     * The resolver says it matched an authoritative identifier. The database
     * looks: the system must be registered AND authoritative, the value must
     * already identify exactly this entity, and the score must be exact. Any of
     * those failing makes this an ordinary proposal for a person — never an
     * automatic resolution on the resolver's say-so.
     */
    IF p_identifier_system IS NULL OR p_identifier_value IS NULL THEN
      RAISE EXCEPTION 'resolution rejected: an identifier match must name the identifier system and value it matched'
        USING ERRCODE = '22023';
    END IF;
    SELECT s.is_authoritative INTO v_auth FROM graph.identifier_systems s
     WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.system_key = p_identifier_system;
    SELECT i.entity_id INTO v_holder FROM graph.entity_identifiers i
     WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain
       AND i.system_key = p_identifier_system AND i.identifier_value = p_identifier_value;
    IF v_auth IS NOT TRUE THEN
      RAISE EXCEPTION 'resolution rejected: identifier system % is not registered as authoritative in this domain', p_identifier_system
        USING ERRCODE = '42501';
    END IF;
    IF v_holder IS DISTINCT FROM p_entity_id THEN
      RAISE EXCEPTION 'resolution rejected: % % does not identify the entity this resolution names',
        p_identifier_system, p_identifier_value USING ERRCODE = '22023';
    END IF;
    IF p_score <> 1 THEN
      RAISE EXCEPTION 'resolution rejected: an identifier match scoring % is not an exact match', p_score
        USING ERRCODE = '22023';
    END IF;
    -- An accepted resolution already exists for this mention: rule 7 says leave
    -- it alone. The new evidence becomes a proposal, not a silent overwrite.
    IF EXISTS (SELECT 1 FROM graph.resolutions_current r
                WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain
                  AND r.claim_object_id = p_claim_object_id AND r.state = 'accepted') THEN
      v_state := 'proposed';
    ELSE
      v_state := 'accepted'; v_auto := true;
    END IF;
  END IF;

  INSERT INTO graph.resolutions_current (
    resolution_id, scope, tenant_id, domain_id, claim_object_id, claim_version,
    mention_text, entity_id, method, rule_id, rule_version, score, match_evidence,
    candidate_set, state, proposer_principal_id, accepted_at, mode, model_id,
    model_weights_digest, runtime_version, prompt_digest, decoding_digest,
    model_confidence, call_id, method_id, run_id, evidence_object_id,
    evidence_digest, correlation_id
  ) VALUES (
    p_resolution_id, 'DOMAIN', p_tenant, p_domain, p_claim_object_id, p_claim_version,
    p_mention_text, p_entity_id, p_method, p_rule_id, p_rule_version, p_score,
    p_match_evidence, coalesce(p_candidate_set, '[]'::jsonb), v_state, p_proposer,
    CASE WHEN v_auto THEN clock_timestamp() ELSE NULL END,
    p_mode, p_model_id, p_weights, p_runtime, p_prompt_digest, p_decoding_digest,
    p_model_confidence, p_call_id, p_method_id, p_run_id,
    p_evidence_object_id, p_evidence_digest, p_correlation);

  INSERT INTO graph.resolution_events (
    event_id, scope, tenant_id, domain_id, resolution_id, event, actor_principal_id,
    details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_resolution_id,
    CASE WHEN v_auto THEN 'resolution.auto_accepted' ELSE 'resolution.proposed' END,
    p_proposer,
    jsonb_build_object('method', p_method, 'rule', p_rule_id || '@' || p_rule_version,
                       'score', p_score, 'entity_id', p_entity_id,
                       'identifier_system', p_identifier_system,
                       'candidates', jsonb_array_length(coalesce(p_candidate_set, '[]'::jsonb))),
    p_correlation);
  RETURN QUERY SELECT v_state, v_auto;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.propose_resolution(uuid,uuid,uuid,uuid,bigint,text,uuid,text,text,text,numeric,jsonb,jsonb,uuid,uuid,text,text,text,text,text,text,text,numeric,uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.propose_resolution(uuid,uuid,uuid,uuid,bigint,text,uuid,text,text,text,numeric,jsonb,jsonb,uuid,uuid,text,text,text,text,text,text,text,numeric,uuid,uuid,uuid,text,text,uuid,uuid) TO eye_commit;

/*
 * RULE 6. A person decides, that person is not the proposer, and the reason is
 * written down. The policy bundle grants this action to no agent role; this port
 * additionally refuses a decider who proposed the row, so an agent that somehow
 * held the action still could not clear its own work.
 */
CREATE OR REPLACE FUNCTION graph.decide_resolution(
  p_resolution_id uuid, p_tenant uuid, p_domain uuid, p_state text,
  p_decider uuid, p_reason text, p_target_entity uuid,
  p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_state text; v_proposer uuid; v_claim uuid; v_entity uuid;
        v_proposed_entity uuid; v_method text; v_evidence jsonb; v_score numeric;
        v_rule text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.resolution.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN
    RAISE EXCEPTION 'resolution decision rejected: a decision needs a reason of at least 8 characters'
      USING ERRCODE = '22023';
  END IF;
  IF p_state NOT IN ('accepted', 'rejected') THEN
    RAISE EXCEPTION 'resolution decision rejected: % is not a decision', p_state USING ERRCODE = '22023';
  END IF;
  SELECT r.state, r.proposer_principal_id, r.claim_object_id, r.entity_id,
         r.method, r.match_evidence, r.score, r.rule_id
    INTO v_state, v_proposer, v_claim, v_proposed_entity, v_method, v_evidence, v_score, v_rule
    FROM graph.resolutions_current r WHERE r.resolution_id = p_resolution_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'resolution decision rejected: no such resolution' USING ERRCODE = '23503';
  END IF;
  IF v_state <> 'proposed' THEN
    RAISE EXCEPTION 'resolution decision rejected: this resolution is already %', v_state
      USING ERRCODE = '22023';
  END IF;
  IF v_proposer = p_decider THEN
    RAISE EXCEPTION 'resolution decision rejected: the principal that proposed this resolution may not decide it'
      USING ERRCODE = '42501';
  END IF;
  IF p_state = 'accepted'
     AND EXISTS (SELECT 1 FROM graph.resolutions_current r
                  WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain
                    AND r.claim_object_id = v_claim AND r.state = 'accepted') THEN
    RAISE EXCEPTION 'resolution decision rejected: this mention already resolves to an entity; split it before resolving it again'
      USING ERRCODE = '23505';
  END IF;
  /*
   * THE DECIDER MAY CHOOSE A DIFFERENT ENTITY.
   *
   * The resolver proposes a target; a person who knows the domain may know it is
   * the wrong one — "Bab el-Mandeb" in a shipping manifest is the chokepoint the
   * corridor source already has an entity for, and no string comparison was ever
   * going to see that. Redirecting is the product's answer to that case, and it
   * is honest about itself: the row becomes a `human` resolution with the
   * person's reason, and the resolver's original proposal is preserved inside
   * `match_evidence` rather than overwritten.
   */
  IF p_state = 'accepted' AND p_target_entity IS NOT NULL
     AND p_target_entity <> v_proposed_entity THEN
    IF NOT EXISTS (SELECT 1 FROM graph.entities_current e
                    WHERE e.entity_id = p_target_entity AND e.lifecycle_state = 'active') THEN
      RAISE EXCEPTION 'resolution decision rejected: the chosen entity is not an active entity in this domain'
        USING ERRCODE = '23503';
    END IF;
    UPDATE graph.resolutions_current
       SET state = p_state, decided_by = p_decider, decided_at = clock_timestamp(),
           decision_reason = p_reason, accepted_at = clock_timestamp(),
           entity_id = p_target_entity, method = 'human',
           rule_id = 'human-retarget', rule_version = '1', score = 1,
           match_evidence = jsonb_build_object(
             'basis', 'a person chose a different entity from the one the resolver proposed',
             'rule', 'human-retarget', 'rule_version', '1',
             'proposed_entity', v_proposed_entity, 'chosen_entity', p_target_entity,
             'resolver_original', jsonb_build_object(
               'method', v_method, 'rule_id', v_rule, 'score', v_score, 'evidence', v_evidence))
     WHERE resolution_id = p_resolution_id
     RETURNING entity_id INTO v_entity;
  ELSE
    UPDATE graph.resolutions_current
       SET state = p_state, decided_by = p_decider, decided_at = clock_timestamp(),
           decision_reason = p_reason,
           accepted_at = CASE WHEN p_state = 'accepted' THEN clock_timestamp() ELSE NULL END
     WHERE resolution_id = p_resolution_id
     RETURNING entity_id INTO v_entity;
  END IF;
  INSERT INTO graph.resolution_events (
    event_id, scope, tenant_id, domain_id, resolution_id, event, actor_principal_id,
    details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_resolution_id,
    CASE p_state WHEN 'accepted' THEN 'resolution.accepted' ELSE 'resolution.rejected' END,
    p_decider, jsonb_build_object('reason', p_reason, 'entity_id', v_entity,
                                 'proposed_entity', v_proposed_entity,
                                 'retargeted', v_entity IS DISTINCT FROM v_proposed_entity),
    p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.decide_resolution(uuid,uuid,uuid,text,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.decide_resolution(uuid,uuid,uuid,text,uuid,text,uuid,uuid,uuid) TO eye_commit;

/*
 * RULE 8 — SPLIT, AND NOTHING IS DELETED.
 *
 * A wrongly merged entity is split by moving named mentions to a NEW entity. The
 * resolutions that put them on the old one are SUPERSEDED, keeping their reason,
 * their score and their instant; the old entity keeps every mention that was not
 * named. A known-at query positioned before `superseded_at` still reproduces the
 * merged view, because that is exactly what the record says was true then.
 */
CREATE OR REPLACE FUNCTION graph.split_entity(
  p_new_entity_id uuid, p_tenant uuid, p_domain uuid, p_from_entity_id uuid,
  p_resolution_ids uuid[], p_entity_type text, p_canonical_name text,
  p_normalized_name text, p_decider uuid, p_reason text,
  p_event_id uuid, p_correlation uuid
) RETURNS TABLE (moved int)
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_moved int := 0; r record; v_new_res uuid; v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.entity.split']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN
    RAISE EXCEPTION 'split rejected: a split needs a reason of at least 8 characters'
      USING ERRCODE = '22023';
  END IF;
  IF p_resolution_ids IS NULL OR array_length(p_resolution_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'split rejected: a split must name the mentions it moves' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM graph.entities_current e
                  WHERE e.entity_id = p_from_entity_id AND e.lifecycle_state = 'active') THEN
    RAISE EXCEPTION 'split rejected: no active entity to split' USING ERRCODE = '23503';
  END IF;

  INSERT INTO graph.entities_current (
    entity_id, scope, tenant_id, domain_id, entity_type, canonical_name,
    normalized_name, lifecycle_state, split_from, created_by, correlation_id
  ) VALUES (
    p_new_entity_id, 'DOMAIN', p_tenant, p_domain, p_entity_type, p_canonical_name,
    p_normalized_name, 'active', p_from_entity_id, p_decider, p_correlation);

  FOR r IN SELECT * FROM graph.resolutions_current c
            WHERE c.resolution_id = ANY (p_resolution_ids)
              AND c.tenant_id = p_tenant AND c.domain_id = p_domain
            FOR UPDATE
  LOOP
    IF r.state <> 'accepted' THEN
      RAISE EXCEPTION 'split rejected: resolution % is %, not accepted', r.resolution_id, r.state
        USING ERRCODE = '22023';
    END IF;
    IF r.entity_id <> p_from_entity_id THEN
      RAISE EXCEPTION 'split rejected: resolution % does not point at the entity being split', r.resolution_id
        USING ERRCODE = '22023';
    END IF;
    v_new_res := gen_random_uuid();
    -- Supersede FIRST: one accepted resolution per mention is a unique index, and
    -- the successor cannot exist while its predecessor still holds the slot.
    UPDATE graph.resolutions_current
       SET state = 'superseded', superseded_by = v_new_res, superseded_at = v_now
     WHERE resolution_id = r.resolution_id;
    INSERT INTO graph.resolutions_current (
      resolution_id, scope, tenant_id, domain_id, claim_object_id, claim_version,
      mention_text, entity_id, method, rule_id, rule_version, score, match_evidence,
      candidate_set, state, proposer_principal_id, accepted_at, decided_by, decided_at,
      decision_reason, evidence_object_id, evidence_digest, correlation_id
    ) VALUES (
      v_new_res, 'DOMAIN', p_tenant, p_domain, r.claim_object_id, r.claim_version,
      r.mention_text, p_new_entity_id, 'human', 'split', '1', 1,
      jsonb_build_object('split_from_entity', p_from_entity_id,
                         'superseded_resolution', r.resolution_id,
                         'prior_method', r.method, 'prior_score', r.score),
      '[]'::jsonb, 'accepted', p_decider, v_now, p_decider, v_now, p_reason,
      r.evidence_object_id, r.evidence_digest, p_correlation);
    INSERT INTO graph.resolution_events (
      event_id, scope, tenant_id, domain_id, resolution_id, event, actor_principal_id,
      details, correlation_id
    ) VALUES (
      gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, r.resolution_id,
      'resolution.superseded', p_decider,
      jsonb_build_object('reason', p_reason, 'entity_id', r.entity_id,
                         'moved_to_entity', p_new_entity_id, 'successor', v_new_res),
      p_correlation);
    INSERT INTO graph.resolution_events (
      event_id, scope, tenant_id, domain_id, resolution_id, event, actor_principal_id,
      details, correlation_id
    ) VALUES (
      gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, v_new_res,
      'resolution.accepted', p_decider,
      jsonb_build_object('reason', p_reason, 'entity_id', p_new_entity_id,
                         'from_split_of', p_from_entity_id),
      p_correlation);
    v_moved := v_moved + 1;
  END LOOP;

  UPDATE graph.entities_current SET updated_at = v_now WHERE entity_id = p_from_entity_id;
  INSERT INTO graph.entity_events (
    event_id, scope, tenant_id, domain_id, entity_id, event, actor_principal_id,
    details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_from_entity_id, 'entity.split', p_decider,
    jsonb_build_object('reason', p_reason, 'new_entity_id', p_new_entity_id,
                       'moved_resolutions', to_jsonb(p_resolution_ids), 'moved', v_moved),
    p_correlation);
  INSERT INTO graph.entity_events (
    event_id, scope, tenant_id, domain_id, entity_id, event, actor_principal_id,
    details, correlation_id
  ) VALUES (
    gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_new_entity_id, 'entity.created', p_decider,
    jsonb_build_object('entity_type', p_entity_type, 'canonical_name', p_canonical_name,
                       'normalized_name', p_normalized_name, 'split_from', p_from_entity_id),
    p_correlation);
  RETURN QUERY SELECT v_moved;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.split_entity(uuid,uuid,uuid,uuid,uuid[],text,text,text,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.split_entity(uuid,uuid,uuid,uuid,uuid[],text,text,text,uuid,text,uuid,uuid) TO eye_commit;

-- ── edges ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION graph.assert_edge(
  p_edge_id uuid, p_tenant uuid, p_domain uuid, p_subject uuid, p_predicate text,
  p_object uuid, p_valid_from timestamptz, p_valid_to timestamptz,
  p_claim_object_id uuid, p_claim_version bigint, p_evidence_object_id uuid,
  p_evidence_digest text, p_method_id uuid, p_run_id uuid, p_mode text,
  p_confidence numeric, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.edge.assert']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  /*
   * BOTH ENDS MUST BE RESOLVED ENTITIES.
   *
   * An edge between an entity and a string is not a graph edge; it is a claim
   * that has not been resolved yet. Refusing it here is what stops the graph
   * silently accumulating half-resolved nodes.
   */
  IF NOT EXISTS (SELECT 1 FROM graph.entities_current e WHERE e.entity_id = p_subject)
     OR NOT EXISTS (SELECT 1 FROM graph.entities_current e WHERE e.entity_id = p_object) THEN
    RAISE EXCEPTION 'edge rejected: both ends must be resolved entities in this domain'
      USING ERRCODE = '23503';
  END IF;
  INSERT INTO graph.edges_current (
    edge_id, scope, tenant_id, domain_id, subject_entity_id, predicate, object_entity_id,
    valid_from, valid_to, state, claim_object_id, claim_version, evidence_object_id,
    evidence_digest, method_id, run_id, mode, confidence, asserted_by, correlation_id
  ) VALUES (
    p_edge_id, 'DOMAIN', p_tenant, p_domain, p_subject, p_predicate, p_object,
    p_valid_from, p_valid_to, 'asserted', p_claim_object_id, p_claim_version,
    p_evidence_object_id, p_evidence_digest, p_method_id, p_run_id, p_mode,
    p_confidence, p_actor, p_correlation);
  INSERT INTO graph.edge_events (
    event_id, scope, tenant_id, domain_id, edge_id, event, actor_principal_id,
    details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_edge_id, 'edge.asserted', p_actor,
    jsonb_build_object('predicate', p_predicate, 'subject', p_subject, 'object', p_object,
                       'valid_from', p_valid_from, 'valid_to', p_valid_to,
                       'mode', p_mode, 'claim_object_id', p_claim_object_id),
    p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.assert_edge(uuid,uuid,uuid,uuid,text,uuid,timestamptz,timestamptz,uuid,bigint,uuid,text,uuid,uuid,text,numeric,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.assert_edge(uuid,uuid,uuid,uuid,text,uuid,timestamptz,timestamptz,uuid,bigint,uuid,text,uuid,uuid,text,numeric,uuid,uuid,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION graph.retract_edge(
  p_edge_id uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_reason text,
  p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_state text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.edge.retract']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN
    RAISE EXCEPTION 'retraction rejected: a retraction needs a reason of at least 8 characters'
      USING ERRCODE = '22023';
  END IF;
  SELECT e.state INTO v_state FROM graph.edges_current e WHERE e.edge_id = p_edge_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'retraction rejected: no such edge' USING ERRCODE = '23503';
  END IF;
  IF v_state <> 'asserted' THEN
    RAISE EXCEPTION 'retraction rejected: this edge is already %', v_state USING ERRCODE = '22023';
  END IF;
  /*
   * RETRACTION IS RECORD TIME, NOT WORLD TIME.
   *
   * `retracted_at` says when we stopped believing the edge. `valid_to` is
   * untouched, because retracting an assertion does not assert that the
   * relationship ended — it says we should not have claimed it. Conflating the
   * two would rewrite history under the guise of correcting it.
   */
  UPDATE graph.edges_current
     SET state = 'retracted', retracted_at = clock_timestamp(),
         retracted_by = p_actor, retraction_reason = p_reason
   WHERE edge_id = p_edge_id;
  INSERT INTO graph.edge_events (
    event_id, scope, tenant_id, domain_id, edge_id, event, actor_principal_id,
    details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_edge_id, 'edge.retracted', p_actor,
    jsonb_build_object('reason', p_reason), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.retract_edge(uuid,uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.retract_edge(uuid,uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

-- ── the Strategy Graph ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION graph.declare_strategy(
  p_object_id uuid, p_tenant uuid, p_domain uuid, p_object_type text,
  p_version bigint, p_title text, p_statement text, p_status text,
  p_verification text, p_parent uuid, p_owner uuid, p_actor uuid,
  p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.strategy.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  INSERT INTO graph.strategy_current (
    strategy_object_id, scope, tenant_id, domain_id, object_type, object_version,
    title, statement, status, verification_state, parent_objective_id,
    owner_principal_id, correlation_id
  ) VALUES (
    p_object_id, 'DOMAIN', p_tenant, p_domain, p_object_type, p_version,
    p_title, p_statement, p_status,
    CASE WHEN p_object_type = 'ASU' THEN p_verification ELSE 'not_applicable' END,
    p_parent, p_owner, p_correlation)
  ON CONFLICT (strategy_object_id) DO UPDATE
     SET object_version = EXCLUDED.object_version, title = EXCLUDED.title,
         statement = EXCLUDED.statement, status = EXCLUDED.status,
         updated_at = clock_timestamp();
  INSERT INTO graph.strategy_events (
    event_id, scope, tenant_id, domain_id, strategy_object_id, event,
    actor_principal_id, details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_object_id, 'strategy.declared', p_actor,
    jsonb_build_object('object_type', p_object_type, 'title', p_title,
                       'version', p_version, 'status', p_status),
    p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.declare_strategy(uuid,uuid,uuid,text,bigint,text,text,text,text,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.declare_strategy(uuid,uuid,uuid,text,bigint,text,text,text,text,uuid,uuid,uuid,uuid,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION graph.link_dependency(
  p_dependency_id uuid, p_tenant uuid, p_domain uuid, p_dependent uuid,
  p_dependent_type text, p_kind text, p_target uuid, p_rationale text,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.strategy.declare', 'graph.strategy.link']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  INSERT INTO graph.dependencies (
    dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type,
    depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id
  ) VALUES (
    p_dependency_id, 'DOMAIN', p_tenant, p_domain, p_dependent, p_dependent_type,
    p_kind, p_target, p_rationale, 'active', p_actor, p_correlation)
  ON CONFLICT DO NOTHING;
  INSERT INTO graph.strategy_events (
    event_id, scope, tenant_id, domain_id, strategy_object_id, event,
    actor_principal_id, details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_dependent, 'strategy.linked', p_actor,
    jsonb_build_object('depends_on_kind', p_kind, 'depends_on_id', p_target,
                       'rationale', p_rationale),
    p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.link_dependency(uuid,uuid,uuid,uuid,text,text,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.link_dependency(uuid,uuid,uuid,uuid,text,text,uuid,text,uuid,uuid,uuid) TO eye_commit;

/*
 * The one state transition invalidation is allowed to make.
 *
 * It moves an assumption to `unverified` — never to false, never to withdrawn. An
 * assumption whose evidence changed is one nobody has re-checked yet, and saying
 * anything stronger would be the system deciding something it has no standing to
 * decide.
 */
CREATE OR REPLACE FUNCTION graph.set_assumption_state(
  p_object_id uuid, p_tenant uuid, p_domain uuid, p_state text, p_reason text,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_type text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.impact.propagate', 'graph.strategy.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT s.object_type INTO v_type FROM graph.strategy_current s
   WHERE s.strategy_object_id = p_object_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'assumption state rejected: no such strategy object' USING ERRCODE = '23503';
  END IF;
  IF v_type <> 'ASU' THEN
    RAISE EXCEPTION 'assumption state rejected: % objects do not carry a verification state', v_type
      USING ERRCODE = '22023';
  END IF;
  UPDATE graph.strategy_current
     SET verification_state = p_state, verification_reason = p_reason,
         verified_at = CASE WHEN p_state = 'verified' THEN clock_timestamp() ELSE verified_at END,
         updated_at = clock_timestamp()
   WHERE strategy_object_id = p_object_id;
  INSERT INTO graph.strategy_events (
    event_id, scope, tenant_id, domain_id, strategy_object_id, event,
    actor_principal_id, details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_object_id,
    CASE p_state WHEN 'verified' THEN 'assumption.verified'
                 WHEN 'invalidated' THEN 'assumption.invalidated'
                 ELSE 'assumption.unverified' END,
    p_actor, jsonb_build_object('state', p_state, 'reason', p_reason), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.set_assumption_state(uuid,uuid,uuid,text,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.set_assumption_state(uuid,uuid,uuid,text,text,uuid,uuid,uuid) TO eye_commit;

-- ── invalidation and impact ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION graph.open_invalidation(
  p_invalidation_id uuid, p_tenant uuid, p_domain uuid, p_trigger_kind text,
  p_trigger_object_id uuid, p_correction_case_id uuid, p_actor uuid,
  p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.impact.propagate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  INSERT INTO graph.invalidations_current (
    invalidation_id, scope, tenant_id, domain_id, trigger_kind, trigger_object_id,
    correction_case_id, opened_by, statement, state, correlation_id
  ) VALUES (
    p_invalidation_id, 'DOMAIN', p_tenant, p_domain, p_trigger_kind, p_trigger_object_id,
    p_correction_case_id, p_actor,
    'dependency walk opened; nothing has been assessed yet', 'open', p_correlation);
  INSERT INTO graph.invalidation_events (
    event_id, scope, tenant_id, domain_id, invalidation_id, event, actor_principal_id,
    details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_invalidation_id, 'invalidation.opened',
    p_actor, jsonb_build_object('trigger_kind', p_trigger_kind,
                                'trigger_object_id', p_trigger_object_id,
                                'correction_case_id', p_correction_case_id),
    p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.open_invalidation(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.open_invalidation(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid,uuid) TO eye_commit;

/*
 * THE SENTENCE PHASE 1 COULD NOT WRITE.
 *
 * This records what the dependency walk found and, when the trigger was a Phase 1
 * correction case, replaces that case's propagation statement with one that is
 * true NOW. Phase 1's default is untouched and still applies to every case no
 * propagation has assessed: the change is confined to the single case this
 * assessment actually walked, and it names the assessment that did it.
 */
CREATE OR REPLACE FUNCTION graph.record_impact(
  p_invalidation_id uuid, p_tenant uuid, p_domain uuid,
  p_assumptions jsonb, p_objectives jsonb, p_decisions jsonb, p_commitments jsonb,
  p_statement text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_case uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.impact.propagate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  UPDATE graph.invalidations_current
     SET affected_assumptions = coalesce(p_assumptions, '[]'::jsonb),
         affected_objectives  = coalesce(p_objectives,  '[]'::jsonb),
         affected_decisions   = coalesce(p_decisions,   '[]'::jsonb),
         affected_commitments = coalesce(p_commitments, '[]'::jsonb),
         statement = p_statement, state = 'assessed', assessed_at = clock_timestamp()
   WHERE invalidation_id = p_invalidation_id
   RETURNING correction_case_id INTO v_case;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'impact rejected: no such invalidation' USING ERRCODE = '23503';
  END IF;
  IF v_case IS NOT NULL THEN
    UPDATE observation.correction_current
       SET propagation_unresolved = p_statement,
           propagation_assessment_id = p_invalidation_id
     WHERE case_id = v_case AND tenant_id = p_tenant AND domain_id = p_domain;
  END IF;
  INSERT INTO graph.invalidation_events (
    event_id, scope, tenant_id, domain_id, invalidation_id, event, actor_principal_id,
    details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_invalidation_id, 'invalidation.assessed',
    p_actor, jsonb_build_object(
      'assumptions', jsonb_array_length(coalesce(p_assumptions, '[]'::jsonb)),
      'objectives',  jsonb_array_length(coalesce(p_objectives,  '[]'::jsonb)),
      'decisions',   jsonb_array_length(coalesce(p_decisions,   '[]'::jsonb)),
      'commitments', jsonb_array_length(coalesce(p_commitments, '[]'::jsonb)),
      'correction_case_id', v_case, 'statement', p_statement),
    p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.record_impact(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.record_impact(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,text,uuid,uuid,uuid) TO eye_commit;

-- ============================================================
-- 11. Canonical write actions and the Strategy Graph schema.
-- ============================================================
/*
 * `graph.strategy.declare` writes the five Strategy Graph types and nothing else.
 * It cannot admit a claim, an observation or an evidence object, and no Phase 1 or
 * Phase 2 action can admit an objective.
 */
INSERT INTO observation.canonical_write_actions (action, object_types, rationale) VALUES
  ('graph.strategy.declare', ARRAY['OBJ','ASU','DEC','CMT','OUT'],
   'Strategy Graph declaration admits objectives, assumptions, decisions, commitments and outcomes, and nothing else')
ON CONFLICT (action) DO NOTHING;

/*
 * THE FIVE STRATEGY SCHEMAS.
 *
 * `ASU`, not `ASM`: ASM is Phase 2''s ASSESSMENT and is not ours to redefine. The
 * five share a body because they differ in what the statement MEANS, not in
 * structure — and one body keeps `rests_on` mandatory for every one of them. A
 * strategy object that cannot name what it rests on is refused at the schema
 * boundary, which is the whole point of the phase: an objective nobody linked to
 * anything is an objective no correction can ever reach.
 */
DO $$
DECLARE
  v_strategy_schema jsonb := '{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["strategy_kind","title","statement","status","rests_on"],
  "properties": {
    "strategy_kind": { "enum": ["objective","assumption","decision","commitment","outcome"] },
    "title": { "type": "string", "minLength": 2, "maxLength": 256 },
    "statement": { "type": "string", "minLength": 2, "maxLength": 4096 },
    "status": { "enum": ["active","closed","withdrawn"] },
    "horizon": { "type": ["string","null"] },
    "owner": { "type": ["string","null"] },
    "parent_objective_id": { "type": ["string","null"] },
    "verification": {
      "type": "object",
      "additionalProperties": false,
      "required": ["state"],
      "properties": {
        "state": { "enum": ["verified","unverified","invalidated","not_applicable"] },
        "reason": { "type": ["string","null"] },
        "at": { "type": ["string","null"] }
      }
    },
    "rests_on": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["kind","id","rationale"],
        "properties": {
          "kind": { "enum": ["claim","entity","edge","strategy"] },
          "id": { "type": "string" },
          "rationale": { "type": "string", "minLength": 8 }
        }
      }
    },
    "metrics": { "type": "object" }
  }
}'::jsonb;
BEGIN
  INSERT INTO objects.schema_registry (object_type, schema_version, json_schema, compatibility)
  VALUES ('OBJ', 'v1', v_strategy_schema, 'backward');
  INSERT INTO objects.schema_registry (object_type, schema_version, json_schema, compatibility)
  VALUES ('ASU', 'v1', v_strategy_schema, 'backward');
  INSERT INTO objects.schema_registry (object_type, schema_version, json_schema, compatibility)
  VALUES ('DEC', 'v1', v_strategy_schema, 'backward');
  INSERT INTO objects.schema_registry (object_type, schema_version, json_schema, compatibility)
  VALUES ('CMT', 'v1', v_strategy_schema, 'backward');
  INSERT INTO objects.schema_registry (object_type, schema_version, json_schema, compatibility)
  VALUES ('OUT', 'v1', v_strategy_schema, 'backward');
END $$;

-- ============================================================
-- 12. Projection rebuild — the A11 property, extended to Phase 3.
-- ============================================================
/*
 * Every mutable projection in this schema is derivable from its event log, and
 * the scope comes from the ESTABLISHED CONTEXT rather than an argument — this
 * function is SECURITY DEFINER, so row-level security is not a boundary it can
 * lean on, and without these predicates a caller would receive counts covering
 * every tenant in the cluster.
 */
CREATE OR REPLACE FUNCTION graph.rebuild_projections()
RETURNS TABLE (projection text, live_rows bigint, rebuilt_rows bigint, mismatched bigint)
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_tenant uuid; v_domain uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.read', 'observation.read']);
  v_tenant := public.eye_tenant();
  v_domain := public.eye_domain();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'projection rebuild rejected: no tenant is established in this context'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH last_entity AS (
    SELECT DISTINCT ON (e.entity_id) e.entity_id, e.event
      FROM graph.entity_events e
     WHERE e.event IN ('entity.created','entity.split','entity.superseded','entity.retired')
       AND e.tenant_id = v_tenant AND (v_domain IS NULL OR e.domain_id = v_domain)
     ORDER BY e.entity_id, e.occurred_at DESC, e.event_id DESC
  ), expect_entity AS (
    SELECT le.entity_id,
           CASE le.event WHEN 'entity.superseded' THEN 'superseded'
                         WHEN 'entity.retired'    THEN 'retired'
                         ELSE 'active' END AS state
      FROM last_entity le
  )
  SELECT 'entities_current'::text,
         (SELECT count(*) FROM graph.entities_current x
           WHERE x.tenant_id = v_tenant AND (v_domain IS NULL OR x.domain_id = v_domain)),
         (SELECT count(*) FROM expect_entity),
         (SELECT count(*) FROM graph.entities_current x
            JOIN expect_entity y ON y.entity_id = x.entity_id
           WHERE x.lifecycle_state IS DISTINCT FROM y.state);

  RETURN QUERY
  WITH last_res AS (
    SELECT DISTINCT ON (e.resolution_id) e.resolution_id, e.event
      FROM graph.resolution_events e
     WHERE e.tenant_id = v_tenant AND (v_domain IS NULL OR e.domain_id = v_domain)
     ORDER BY e.resolution_id, e.occurred_at DESC, e.event_id DESC
  ), expect_res AS (
    SELECT lr.resolution_id,
           CASE lr.event WHEN 'resolution.proposed'      THEN 'proposed'
                         WHEN 'resolution.auto_accepted' THEN 'accepted'
                         WHEN 'resolution.accepted'      THEN 'accepted'
                         WHEN 'resolution.rejected'      THEN 'rejected'
                         ELSE 'superseded' END AS state
      FROM last_res lr
  )
  SELECT 'resolutions_current'::text,
         (SELECT count(*) FROM graph.resolutions_current x
           WHERE x.tenant_id = v_tenant AND (v_domain IS NULL OR x.domain_id = v_domain)),
         (SELECT count(*) FROM expect_res),
         (SELECT count(*) FROM graph.resolutions_current x
            JOIN expect_res y ON y.resolution_id = x.resolution_id
           WHERE x.state IS DISTINCT FROM y.state);

  RETURN QUERY
  WITH last_edge AS (
    SELECT DISTINCT ON (e.edge_id) e.edge_id, e.event
      FROM graph.edge_events e
     WHERE e.tenant_id = v_tenant AND (v_domain IS NULL OR e.domain_id = v_domain)
     ORDER BY e.edge_id, e.occurred_at DESC, e.event_id DESC
  ), expect_edge AS (
    SELECT le.edge_id,
           CASE le.event WHEN 'edge.asserted'   THEN 'asserted'
                         WHEN 'edge.retracted'  THEN 'retracted'
                         ELSE 'superseded' END AS state
      FROM last_edge le
  )
  SELECT 'edges_current'::text,
         (SELECT count(*) FROM graph.edges_current x
           WHERE x.tenant_id = v_tenant AND (v_domain IS NULL OR x.domain_id = v_domain)),
         (SELECT count(*) FROM expect_edge),
         (SELECT count(*) FROM graph.edges_current x
            JOIN expect_edge y ON y.edge_id = x.edge_id
           WHERE x.state IS DISTINCT FROM y.state);

  RETURN QUERY
  WITH last_asu AS (
    SELECT DISTINCT ON (e.strategy_object_id) e.strategy_object_id, e.event
      FROM graph.strategy_events e
     WHERE e.event IN ('strategy.declared','assumption.verified','assumption.unverified',
                       'assumption.invalidated')
       AND e.tenant_id = v_tenant AND (v_domain IS NULL OR e.domain_id = v_domain)
     ORDER BY e.strategy_object_id, e.occurred_at DESC, e.event_id DESC
  ), expect_asu AS (
    SELECT la.strategy_object_id,
           CASE la.event WHEN 'assumption.verified'    THEN 'verified'
                         WHEN 'assumption.unverified'  THEN 'unverified'
                         WHEN 'assumption.invalidated' THEN 'invalidated'
                         ELSE NULL END AS state
      FROM last_asu la
  )
  SELECT 'strategy_current'::text,
         (SELECT count(*) FROM graph.strategy_current x
           WHERE x.tenant_id = v_tenant AND (v_domain IS NULL OR x.domain_id = v_domain)),
         (SELECT count(*) FROM expect_asu),
         (SELECT count(*) FROM graph.strategy_current x
            JOIN expect_asu y ON y.strategy_object_id = x.strategy_object_id
           WHERE x.object_type = 'ASU' AND y.state IS NOT NULL
             AND x.verification_state IS DISTINCT FROM y.state);

  RETURN QUERY
  WITH last_inv AS (
    SELECT DISTINCT ON (e.invalidation_id) e.invalidation_id, e.event
      FROM graph.invalidation_events e
     WHERE e.tenant_id = v_tenant AND (v_domain IS NULL OR e.domain_id = v_domain)
     ORDER BY e.invalidation_id, e.occurred_at DESC, e.event_id DESC
  ), expect_inv AS (
    SELECT li.invalidation_id,
           CASE li.event WHEN 'invalidation.opened'   THEN 'open'
                         WHEN 'invalidation.assessed' THEN 'assessed'
                         ELSE 'closed' END AS state
      FROM last_inv li
  )
  SELECT 'invalidations_current'::text,
         (SELECT count(*) FROM graph.invalidations_current x
           WHERE x.tenant_id = v_tenant AND (v_domain IS NULL OR x.domain_id = v_domain)),
         (SELECT count(*) FROM expect_inv),
         (SELECT count(*) FROM graph.invalidations_current x
            JOIN expect_inv y ON y.invalidation_id = x.invalidation_id
           WHERE x.state IS DISTINCT FROM y.state);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.rebuild_projections() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.rebuild_projections() TO eye_app, eye_commit;
