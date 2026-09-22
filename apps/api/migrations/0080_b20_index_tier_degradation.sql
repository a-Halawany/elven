-- 0080 — CP-6 B20: INDEX-TIER DEGRADATION — the six derived projections of a domain (graph.entities_current,
-- graph.resolutions_current, graph.edges_current, graph.strategy_current, graph.invalidations_current, memory.items_current:
-- the index tier of this product; there is NO lexical or vector index) each become a PARTITION with a serving state, a
-- DERIVED watermark, a SYMMETRIC check that WITHDRAWS a failed partition, the operator's withdrawal, a REBUILD WRITER that is
-- the only way back to service, the memory content-tier ledger event and the deletion executor's pause (2026-09-17).
--
-- THE GAP. After 0079 no read carried a watermark: a listing, a traversal or a memory retrieval served whatever the projection
-- held and called nothing stale, lagging or unverified (AU-MEM-0068, V03-T-108, FEX-08). The retrieval subscriber's check
-- (graph.rebuild_projections, 0065:1335-1342 and every sibling) was JOIN-ONLY: a live row with no log event (a poisoned row)
-- and a log row with no live row (a missing row) were invisible to `mismatched`, so a poisoned or an incomplete projection
-- passed (AU-MEM-0070, AU-MEM-0083, DP-38-005); the memory projection was not checked at all; no writer rebuilt a projection
-- from its log (the check's name promised one); a failed check marked a delivery unresolved and served the drifted rows as
-- current meanwhile (V03-T-098/-112, IA-34-005/IA-35-005); the memory content tier (the canonical MEM version) had no
-- definition and no degraded answer (AU-MEM-0067, V03-T-097, FEX-09); the deletion executor read the edges and memory
-- projections for its safe scope blind to their health (DP-33-005/-37-005).
--
-- THE MECHANISM.
-- (D1) THE STATE OBJECT graph.projection_partitions (§1): one row per (tenant, domain, projection), state serving | withdrawn
--   with the withdrawal's instant, actor, reason and check, the representation_version (the derivation rule's version — the
--   SQL constant graph.projection_representation_version() = '1'; a migration that changes the rule bumps it) and the last
--   rebuild; the append-only ledger graph.projection_events (projection.withdrawn | projection.rebuilt | projection.restored |
--   projection.rebuild_refused). Seeded for every existing domain (§10); created lazily by the ports otherwise. THE WATERMARK
--   IS NEVER STORED: graph.projection_state() (§3) derives it — the domain's latest GraphChanged/MemoryCorrected partition
--   sequence (the revision), the live contiguous APPLIED prefix of the retrieval subscription's deliveries (the verified
--   sequence; the dispatcher's own cursor answered beside it as checkpoint_seq), the passing check of the event that closes
--   the prefix, the lag, the unresolved deliveries — and the condition withdrawn > unverified > lagging > current. A
--   subscription with no applied delivery has no watermark: the domain reads unverified until its first check applies.
-- (D2) ONE DERIVATION (§2): graph.expected_entities / _resolutions / _edges / _strategy / _invalidations and
--   memory.expected_items — set-returning SQL functions, STABLE, run as the CALLER (an API read under the event tables'
--   forced RLS; the definer check with its own tenant/domain) — the expected state of each projection from its log, with the
--   columns a rebuild needs and row_derivable saying whether a MISSING row can be written from what the log or the canonical
--   record carries. The check, the rebuild and the reads while a partition is withdrawn share them.
-- (D3) THE CHECK (§4): graph.rebuild_projections() re-issued under the same name, still a COMPARISON — per projection
--   live_rows, rebuilt_rows, mismatched (rows in both whose state differs, as before), missing (expected − live), unexpected
--   (live − expected: the poisoned rows), representation_ok; the sixth row is the memory projection (state, object_version and
--   the policy columns — classification, audience roles and purposes — against the canonical version the log names).
--   graph.record_retrieval_check (§6) sums mismatched + missing + unexpected + (NOT representation_ok) into the recorded
--   `mismatched` (the column kept), stores the extended per-projection JSON with `failed`, and WITHDRAWS every failed
--   partition in the same transaction — under the six partition locks SHARED (the keys the rebuild takes exclusively).
-- (D4) WITHDRAWAL (§5): graph.withdraw_projection — the subscriber's own effect under graph.retrieval.subscription.apply (on a
--   recorded check) or the operator's act under graph.projection.withdraw; idempotent (a second withdrawal is a second ledger
--   row with changed false; the earlier reason stands); no outbox event (a withdrawal changes no fact of the graph).
-- (D5) THE REBUILD (§7): graph.rebuild_projection — the operator's act under graph.projection.rebuild and the ONLY transition
--   from withdrawn to serving: under a per-partition advisory lock and the row locked, the drifted rows' state (and the columns
--   the state's constraints require) follow the log; the missing rows are written from what the log or the canonical record
--   carries (entities from entity.created; memory items from the canonical MEM version; strategy objects from the canonical
--   object; edges from edge.asserted plus the claim's lineage for the provenance the log lacks) or NAMED as unrebuildable
--   (a resolution — its log carries no row; an assessed invalidation — its lists are counts in the log; an edge with no lineage
--   row or with reassessment events); the poisoned rows are removed — REFUSED before anything is written when a poisoned entity
--   is held by a derived edge, resolution or identifier, or a poisoned strategy object is cited by a decision package (a person
--   decides), the references no constraint holds NAMED as dangling; every write in ONE subtransaction, then the check must pass
--   for the projection or everything rolls back and projection.rebuild_refused records the refusal with the rows named (the
--   partition stays withdrawn; the answer is the recorded refusal, never a lost transaction). On success: serving, the
--   representation version current, projection.rebuilt (rows written) or projection.restored (nothing to write).
-- (D6) THE MEMORY CONTENT TIER (§8): the canonical version payloads and the evidence bytes; the metadata tier the six
--   projections and the canonical header. A retrieval whose content read did not answer is served metadata-only by the service
--   and records memory.retrieval_degraded on the item's ledger — never an access row (memory.item_access requires the served
--   version, 0066:471). The events CHECK gains the name.
-- (D7) THE DELETION PAUSE (§9): retention.begin_execution refuses a DELETION while edges_current or memory_items_current of the
--   domain is withdrawn — before the state moves, nothing counted, nothing locked (the safe referential scope reads both,
--   0079 §7 (b) and (f)); the controller pauses the action for human review; the rebuild, a re-resolution and a new approval
--   execute it.
-- (D8) THE REGISTER (§11): L3-I02 RetrieveContext's bound_to gains the clause (every graph and memory read declares its product
--   state); the row STAYS partial (the purpose-bound context query is owed) — 36 bound / 14 partial / 0 unbound asserted.
--
--   §1  the constant, graph.projection_partitions, graph.projection_events, the indexes the watermark needs, index_state retired.
--   §2  the six expected_* functions (LANGUAGE sql STABLE; the caller's).
--   §3  graph.projection_state() — the derived watermark (SECURITY DEFINER, context-scoped).
--   §4  graph.partition_representation_ok; graph.rebuild_projections() re-issued SYMMETRIC (DROP + CREATE: the RETURNS TABLE
--       gains three columns — the 0030/0078/0079 idiom).
--   §5  graph.withdraw_projection.
--   §6  graph.record_retrieval_check re-declared (the sum, the JSON, the shared locks, the automatic withdrawal).
--   §7  graph.rebuild_projection — the writer.
--   §8  the memory events CHECK; memory.record_retrieval_degraded.
--   §9  retention.begin_execution re-declared (0072 §5 copied whole; the projection_withdrawn block).
--   §10 the partitions of every existing domain.
--   §11 the interface register.
--
-- The refusals (the mapper's families, observation-errors.ts): 'projection (withdrawal|rebuild) rejected: recorded by the acting
-- principal' is the standing family (42501 → 403); '… is not a projection of this domain' the absence family (23503 → 404);
-- 'projection rebuild rejected: the … partition of this domain is serving …' and 'retention execution rejected
-- (projection_withdrawn) …' the record's-state family (22023 → 409); the reason's length and the subscriber's missing check id
-- the caller's-request family (22023 → 422). A REFUSED REBUILD is not an exception: it is an outcome on the ledger
-- (projection.rebuild_refused) and the port's answer says outcome 'refused' with the report. The rebuild's subtransaction
-- catches SQLSTATE 'P0B20' (its own signal) and the constraint classes; any other error propagates and the write rolls back
-- whole. Every hashtextextended key string and every refusal text is a literal the harness regexes.
--
-- Read-only checks after migrating a fresh database (0001–0080), each verified on eye_verify_b20_mig:
--   select graph.projection_representation_version()                                                             → '1'
--   select count(*) from graph.projection_partitions                                                              → 6 × the domains of the database (the seeding; 0 on a fresh one)
--   select proname from pg_proc where proname in ('expected_entities','expected_resolutions','expected_edges','expected_strategy','expected_invalidations')
--     and pronamespace = 'graph'::regnamespace                                                                    → 5 rows
--   select proname from pg_proc where proname = 'expected_items' and pronamespace = 'memory'::regnamespace         → 1 row
--   select pg_get_function_result('graph.rebuild_projections'::regproc)
--     → TABLE(projection text, live_rows bigint, rebuilt_rows bigint, mismatched bigint, missing bigint, unexpected bigint, representation_ok boolean)
--   select pg_get_function_result('graph.projection_state'::regproc)                                              → … verified_check_id uuid, checkpoint_seq bigint, lag_events bigint …
--   the six expected_* result column counts (pg_get_function_result): entities 16, resolutions 10, edges 24, strategy 16, invalidations 13, memory 18
--   select indexname from pg_indexes where indexname in ('object_outbox_graph_revision', 'grc_domain', 'gpe_partition', 'gsd_subscription_applied_seq')  → 4 rows
--   select conname from pg_constraint where conname = 'item_events_event_check' and pg_get_constraintdef(oid) like '%retrieval_degraded%'          → 1 row
--   select (36,14,0) = (count(*) filter (where binding_state = 'bound'), count(*) filter (where binding_state = 'partial'),
--     count(*) filter (where binding_state = 'unbound')) from objects.interface_register                          → true
--   select bound_to like '%B20 (0080)%' from objects.interface_register where interface_id = 'L3-I02'             → true
--   select count(*) from pg_locks where locktype = 'advisory'                                                     → 0 (nothing held after the migration)
--   select count(*) from public.schema_migrations                                                                  → 80
--   select * from graph.rebuild_projections()   -- under a DOMAIN context of an empty domain → six rows, every count 0, representation_ok true
--   -- the strict check on the demonstration's copy (rehearsal) BEFORE the act: every row 0 / 0 / 0 / true (the act prints it through /projections/verify)

-- ============================================================
-- §1 THE PARTITIONS: one row per (tenant, domain, projection) — the state a read consults; the ledger of what changed it;
--    the derivation rule's version; the indexes the derived watermark needs
-- ============================================================
-- The version of the DERIVATION RULE (the expected_* functions of §2, the state vocabularies, the resolver's normalisation —
-- RESOLVER_RULE_VERSION). A migration that changes the rule BUMPS this constant; every partition verified under an older
-- version fails its next check (representation_ok false), is withdrawn, and returns to service only through
-- graph.rebuild_projection, which records the current version. A representation change never arrives silently.
CREATE OR REPLACE FUNCTION graph.projection_representation_version() RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT '1'::text $$;
REVOKE ALL ON FUNCTION graph.projection_representation_version() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.projection_representation_version() TO eye_app, eye_commit;
COMMENT ON FUNCTION graph.projection_representation_version() IS 'B20 (0080): the derivation rule''s version — the expected_* functions, the state vocabularies, the resolver''s normalisation. Bumped by the migration that changes the rule; a partition verified under an older version is withdrawn at its next check and rebuilt under the new one.';

CREATE TABLE graph.projection_partitions (
  tenant_id              uuid NOT NULL,
  domain_id              uuid NOT NULL,
  projection             text NOT NULL CHECK (projection IN ('entities_current', 'resolutions_current', 'edges_current', 'strategy_current', 'invalidations_current', 'memory_items_current')),
  scope                  text NOT NULL DEFAULT 'DOMAIN',
  state                  text NOT NULL DEFAULT 'serving' CHECK (state IN ('serving', 'withdrawn')),
  withdrawn_at           timestamptz,
  withdrawn_by           uuid,
  withdrawn_reason       text,
  withdrawn_by_check     uuid,                                             -- the retrieval check that withdrew it; NULL for an operator's withdrawal
  representation_version text NOT NULL DEFAULT graph.projection_representation_version(),
  last_rebuild_id        uuid,
  rebuilt_at             timestamptz,
  updated_at             timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id         uuid,
  PRIMARY KEY (tenant_id, domain_id, projection),
  CONSTRAINT gpp_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT gpp_withdrawal_explained CHECK (state <> 'withdrawn' OR (withdrawn_at IS NOT NULL AND withdrawn_by IS NOT NULL AND length(btrim(withdrawn_reason)) >= 8))
);
COMMENT ON TABLE graph.projection_partitions IS 'B20 (0080): the serving state of each of the six derived projections of a domain (the index tier of this product — there is no lexical or vector index). serving: the reads serve the projection; withdrawn: the reads serve the last valid state from the event log, labelled, and the traversals are constrained, until graph.rebuild_projection returns it to service. The watermark (revision, verified sequence, lag) is DERIVED by graph.projection_state(), never stored here. withdrawn_by_check names a graph.retrieval_checks row without a foreign key (the check is written first in the same transaction; the ledger is append-only).';

CREATE TABLE graph.projection_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL DEFAULT 'DOMAIN',
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  projection         text NOT NULL,
  event              text NOT NULL CHECK (event IN ('projection.withdrawn', 'projection.rebuilt', 'projection.restored', 'projection.rebuild_refused')),
  actor_principal_id uuid NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT gpe_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX gpe_partition ON graph.projection_events (tenant_id, domain_id, projection, occurred_at);
CREATE TRIGGER gpe_append_only BEFORE UPDATE OR DELETE ON graph.projection_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE graph.projection_events IS 'B20 (0080): the append-only ledger of a partition''s withdrawals (by the retrieval check or the operator), its rebuilds (rows written), its restorations (nothing to write) and its refused rebuilds (the rows named).';

-- Row-level security and read grants, exactly as every graph table (0024 §RLS, 0063:196-210).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['projection_partitions', 'projection_events'] LOOP
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

-- The domain's latest graph/memory revision is one index probe (the B8 lesson, CP6_BATCHES §B8: a per-row scan fixed the same way).
CREATE INDEX object_outbox_graph_revision ON objects.object_outbox (tenant_id, domain_id, partition_seq DESC)
  WHERE event_type IN ('GraphChanged', 'MemoryCorrected');
-- The domain's latest retrieval check.
CREATE INDEX grc_domain ON graph.retrieval_checks (tenant_id, domain_id, checked_at DESC);
-- The live contiguous applied prefix of a subscription's deliveries (graph.projection_state, C2): the highest applied sequence below the first open one.
CREATE INDEX gsd_subscription_applied_seq ON graph.subscription_deliveries (subscription_id, partition_seq DESC) WHERE state = 'applied';

-- memory.items_current.index_state (0066:439) is retired in place: the partition row says what a per-row flag cannot.
COMMENT ON COLUMN memory.items_current.index_state IS 'B20 (0080): superseded by graph.projection_partitions (memory_items_current) — kept at ''projected'' for compatibility and never written; the retrieval computes index_state (projected | stale) from the partition state.';

-- ============================================================
-- §2 THE DERIVATION — the expected state of each projection from its log: ONE rule for the check (§4), the rebuild (§7) and the
--    reads while a partition is withdrawn (the API). Set-returning SQL functions, STABLE, run as the CALLER: an API read under
--    eye_commit's DOMAIN context reads the event tables under their forced RLS (nothing widens); the definer check passes its
--    own tenant/domain. The tenant/domain filter sits INSIDE the DISTINCT ON — where 0065 filtered — so the plan is unchanged;
--    the bodies are single SELECTs the planner may inline. p_domain NULL is the whole tenant (the check under a TENANT context).
-- ============================================================
-- entity.created details carry the row (entity_type, canonical_name, normalized_name, split_from — 0024:696-698, 0024:1055-1058,
-- 0076:840-842); entity.superseded carries superseded_by (0076:846); entity.retired (0077:570-572). entity.renamed / entity.identified
-- are not state events, as today. updated_at is max(occurred_at) over ALL the entity's events (entity.identified included), an
-- approximation of the row's instant (only a split or a retirement touches it, 0024:1046, 0077:570) — not state.
CREATE OR REPLACE FUNCTION graph.expected_entities(p_tenant uuid, p_domain uuid)
RETURNS TABLE (entity_id uuid, tenant_id uuid, domain_id uuid, state text, entity_type text, canonical_name text, normalized_name text, split_from uuid, superseded_by uuid,
               created_at timestamptz, updated_at timestamptz, created_by uuid, correlation_id uuid, last_event text, last_event_at timestamptz, row_derivable boolean)
LANGUAGE sql STABLE AS $$
  WITH last_state AS (
    SELECT DISTINCT ON (e.entity_id) e.entity_id, e.tenant_id, e.domain_id, e.event, e.occurred_at, e.details
      FROM graph.entity_events e
     WHERE e.event IN ('entity.created', 'entity.split', 'entity.superseded', 'entity.retired')
       AND e.tenant_id = p_tenant AND (p_domain IS NULL OR e.domain_id = p_domain)
     ORDER BY e.entity_id, e.occurred_at DESC, e.event_id DESC
  ), created AS (
    SELECT DISTINCT ON (e.entity_id) e.entity_id, e.occurred_at, e.actor_principal_id, e.correlation_id, e.details
      FROM graph.entity_events e
     WHERE e.event = 'entity.created' AND e.tenant_id = p_tenant AND (p_domain IS NULL OR e.domain_id = p_domain)
     ORDER BY e.entity_id, e.occurred_at ASC, e.event_id ASC
  ), last_any AS (
    SELECT e.entity_id, max(e.occurred_at) AS updated_at FROM graph.entity_events e
     WHERE e.tenant_id = p_tenant AND (p_domain IS NULL OR e.domain_id = p_domain) GROUP BY e.entity_id
  )
  SELECT ls.entity_id, ls.tenant_id, ls.domain_id,
         CASE ls.event WHEN 'entity.superseded' THEN 'superseded' WHEN 'entity.retired' THEN 'retired' ELSE 'active' END AS state,
         c.details ->> 'entity_type', c.details ->> 'canonical_name', c.details ->> 'normalized_name', (c.details ->> 'split_from')::uuid,
         CASE WHEN ls.event = 'entity.superseded' THEN (ls.details ->> 'superseded_by')::uuid END,
         c.occurred_at, la.updated_at, c.actor_principal_id, c.correlation_id, ls.event, ls.occurred_at,
         (c.entity_id IS NOT NULL AND coalesce(c.details ->> 'entity_type', '') <> '' AND coalesce(c.details ->> 'canonical_name', '') <> '' AND coalesce(c.details ->> 'normalized_name', '') <> ''
          AND (ls.event <> 'entity.superseded' OR (ls.details ->> 'superseded_by') IS NOT NULL))
    FROM last_state ls
    LEFT JOIN created c ON c.entity_id = ls.entity_id
    LEFT JOIN last_any la ON la.entity_id = ls.entity_id
$$;

-- The resolution log carries neither the mention, the claim, the evidence nor the method of a resolution (0024:837-848): a missing
-- row is the proposer's record, not derivable (row_derivable false, always). The state's events carry entity_id (the decided or
-- moved-to entity) and, for a supersession, the successor.
CREATE OR REPLACE FUNCTION graph.expected_resolutions(p_tenant uuid, p_domain uuid)
RETURNS TABLE (resolution_id uuid, tenant_id uuid, domain_id uuid, state text, entity_id uuid, last_event text, last_event_at timestamptz, last_actor uuid, last_details jsonb, row_derivable boolean)
LANGUAGE sql STABLE AS $$
  SELECT ls.resolution_id, ls.tenant_id, ls.domain_id,
         CASE ls.event WHEN 'resolution.proposed' THEN 'proposed' WHEN 'resolution.auto_accepted' THEN 'accepted' WHEN 'resolution.accepted' THEN 'accepted'
                       WHEN 'resolution.rejected' THEN 'rejected' ELSE 'superseded' END,
         (ls.details ->> 'entity_id')::uuid, ls.event, ls.occurred_at, ls.actor_principal_id, ls.details,
         false   -- the log carries neither the mention, the claim nor the evidence of a resolution (0024:837-848): a missing row is the proposer's record, not derivable
    FROM (SELECT DISTINCT ON (e.resolution_id) e.resolution_id, e.tenant_id, e.domain_id, e.event, e.occurred_at, e.actor_principal_id, e.details
            FROM graph.resolution_events e
           WHERE e.tenant_id = p_tenant AND (p_domain IS NULL OR e.domain_id = p_domain)
           ORDER BY e.resolution_id, e.occurred_at DESC, e.event_id DESC) ls
$$;

-- The asserted event's details — predicate, subject, object, valid_from, valid_to, mode, claim_object_id, claim_version, review_state
-- (0068:68-77); the imported form adds asserted_at (0076:975); the retracted event carries reason (0024:1147-1153), the imported form
-- reason and retracted_at (0076:978-980); the superseded event superseded_by, claim_object_id, corrected_to_version, reason (0068:102-108),
-- the imported form superseded_by and superseded_at (0076:981-983). For a domain-asserted edge the row's asserted_at (DEFAULT
-- clock_timestamp()) and the event's occurred_at are microseconds apart inside one transaction — the log-derived instant stands in
-- for it. evidence_object_id, evidence_digest, method_id, run_id, confidence are NOT in the log: the rebuild takes them from
-- intelligence.claim_lineage (§7).
CREATE OR REPLACE FUNCTION graph.expected_edges(p_tenant uuid, p_domain uuid)
RETURNS TABLE (edge_id uuid, tenant_id uuid, domain_id uuid, state text, subject_entity_id uuid, predicate text, object_entity_id uuid, valid_from timestamptz, valid_to timestamptz,
               asserted_at timestamptz, retracted_at timestamptz, retracted_by uuid, retraction_reason text, superseded_by uuid, superseded_at timestamptz,
               mode text, claim_object_id uuid, claim_version bigint, asserted_by uuid, correlation_id uuid, last_event text, last_event_at timestamptz, reassessment_events bigint, row_derivable boolean)
LANGUAGE sql STABLE AS $$
  WITH last_state AS (
    -- the state follows the last STATE event; a reassessment opened or closed (0065 §7) is not a state transition
    SELECT DISTINCT ON (e.edge_id) e.edge_id, e.tenant_id, e.domain_id, e.event, e.occurred_at, e.actor_principal_id, e.details
      FROM graph.edge_events e
     WHERE e.tenant_id = p_tenant AND (p_domain IS NULL OR e.domain_id = p_domain)
       AND e.event NOT IN ('edge.reassessment_opened', 'edge.reassessed')
     ORDER BY e.edge_id, e.occurred_at DESC, e.event_id DESC
  ), asserted AS (
    SELECT DISTINCT ON (e.edge_id) e.edge_id, e.occurred_at, e.actor_principal_id, e.correlation_id, e.details
      FROM graph.edge_events e
     WHERE e.event = 'edge.asserted' AND e.tenant_id = p_tenant AND (p_domain IS NULL OR e.domain_id = p_domain)
     ORDER BY e.edge_id, e.occurred_at ASC, e.event_id ASC
  ), reassessed AS (
    SELECT e.edge_id, count(*) AS n FROM graph.edge_events e
     WHERE e.event IN ('edge.reassessment_opened', 'edge.reassessed') AND e.tenant_id = p_tenant AND (p_domain IS NULL OR e.domain_id = p_domain) GROUP BY e.edge_id
  )
  SELECT ls.edge_id, ls.tenant_id, ls.domain_id,
         CASE ls.event WHEN 'edge.asserted' THEN 'asserted' WHEN 'edge.retracted' THEN 'retracted' ELSE 'superseded' END,
         (a.details ->> 'subject')::uuid, a.details ->> 'predicate', (a.details ->> 'object')::uuid,
         (a.details ->> 'valid_from')::timestamptz, (a.details ->> 'valid_to')::timestamptz,
         coalesce((a.details ->> 'asserted_at')::timestamptz, a.occurred_at),                                       -- an imported edge keeps the origin's instant (0076:975)
         CASE WHEN ls.event = 'edge.retracted' THEN coalesce((ls.details ->> 'retracted_at')::timestamptz, ls.occurred_at) END,
         CASE WHEN ls.event = 'edge.retracted' THEN ls.actor_principal_id END,
         CASE WHEN ls.event = 'edge.retracted' THEN ls.details ->> 'reason' END,
         CASE WHEN ls.event = 'edge.superseded' THEN (ls.details ->> 'superseded_by')::uuid END,
         CASE WHEN ls.event = 'edge.superseded' THEN coalesce((ls.details ->> 'superseded_at')::timestamptz, ls.occurred_at) END,
         a.details ->> 'mode', (a.details ->> 'claim_object_id')::uuid, (a.details ->> 'claim_version')::bigint,
         a.actor_principal_id, a.correlation_id, ls.event, ls.occurred_at, coalesce(r.n, 0),
         (a.edge_id IS NOT NULL AND (a.details ->> 'subject') IS NOT NULL AND (a.details ->> 'object') IS NOT NULL AND coalesce(a.details ->> 'predicate', '') <> ''
          AND (a.details ->> 'valid_from') IS NOT NULL AND (a.details ->> 'claim_object_id') IS NOT NULL AND (a.details ->> 'claim_version') IS NOT NULL AND (a.details ->> 'mode') IS NOT NULL
          AND coalesce(r.n, 0) = 0)
    FROM last_state ls
    LEFT JOIN asserted a ON a.edge_id = ls.edge_id
    LEFT JOIN reassessed r ON r.edge_id = ls.edge_id
$$;

-- strategy.declared details: object_type, title, version, status (0024:1183-1189); the LATEST declaration is the row (a re-declared
-- version, 0024:1177-1181 ON CONFLICT DO UPDATE); the assumption events carry reason. The canonical OBJ/ASU/DEC/CMT/OUT object
-- carries the row (strategy.service.ts:126-142) — row_derivable when it exists.
CREATE OR REPLACE FUNCTION graph.expected_strategy(p_tenant uuid, p_domain uuid)
RETURNS TABLE (strategy_object_id uuid, tenant_id uuid, domain_id uuid, state text, object_type text, title text, object_version bigint, status text,
               verification_reason text, verified_at timestamptz, declared_at timestamptz, declared_by uuid, correlation_id uuid, last_event text, last_event_at timestamptz, row_derivable boolean)
LANGUAGE sql STABLE AS $$
  WITH last_state AS (
    SELECT DISTINCT ON (e.strategy_object_id) e.strategy_object_id, e.tenant_id, e.domain_id, e.event, e.occurred_at, e.actor_principal_id, e.details
      FROM graph.strategy_events e
     WHERE e.event IN ('strategy.declared', 'assumption.verified', 'assumption.unverified', 'assumption.invalidated')
       AND e.tenant_id = p_tenant AND (p_domain IS NULL OR e.domain_id = p_domain)
     ORDER BY e.strategy_object_id, e.occurred_at DESC, e.event_id DESC
  ), declared AS (
    SELECT DISTINCT ON (e.strategy_object_id) e.strategy_object_id, e.occurred_at, e.actor_principal_id, e.correlation_id, e.details
      FROM graph.strategy_events e
     WHERE e.event = 'strategy.declared' AND e.tenant_id = p_tenant AND (p_domain IS NULL OR e.domain_id = p_domain)
     ORDER BY e.strategy_object_id, e.occurred_at DESC, e.event_id DESC     -- the latest declaration: a re-declared version (0024:1177-1181 ON CONFLICT DO UPDATE)
  )
  SELECT ls.strategy_object_id, ls.tenant_id, ls.domain_id,
         CASE ls.event WHEN 'assumption.verified' THEN 'verified' WHEN 'assumption.unverified' THEN 'unverified' WHEN 'assumption.invalidated' THEN 'invalidated' ELSE NULL END,
         d.details ->> 'object_type', d.details ->> 'title', (d.details ->> 'version')::bigint, d.details ->> 'status',
         CASE WHEN ls.event <> 'strategy.declared' THEN ls.details ->> 'reason' END,
         CASE WHEN ls.event <> 'strategy.declared' THEN ls.occurred_at END,
         d.occurred_at, d.actor_principal_id, d.correlation_id, ls.event, ls.occurred_at,
         EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = ls.strategy_object_id AND o.object_type IN ('OBJ', 'ASU', 'DEC', 'CMT', 'OUT'))   -- the canonical object carries the row (strategy.service.ts:126-142)
    FROM last_state ls
    LEFT JOIN declared d ON d.strategy_object_id = ls.strategy_object_id
$$;

-- invalidation.opened details: trigger_kind, trigger_object_id, correction_case_id (0027:80-91). An ASSESSED row's affected lists are
-- not in its log (0065:1246-1262 carries counts): only an OPEN row is derivable.
CREATE OR REPLACE FUNCTION graph.expected_invalidations(p_tenant uuid, p_domain uuid)
RETURNS TABLE (invalidation_id uuid, tenant_id uuid, domain_id uuid, state text, trigger_kind text, trigger_object_id uuid, correction_case_id uuid,
               opened_at timestamptz, opened_by uuid, correlation_id uuid, last_event text, last_event_at timestamptz, row_derivable boolean)
LANGUAGE sql STABLE AS $$
  WITH last_state AS (
    SELECT DISTINCT ON (e.invalidation_id) e.invalidation_id, e.tenant_id, e.domain_id, e.event, e.occurred_at, e.details
      FROM graph.invalidation_events e
     WHERE e.tenant_id = p_tenant AND (p_domain IS NULL OR e.domain_id = p_domain)
     ORDER BY e.invalidation_id, e.occurred_at DESC, e.event_id DESC
  ), opened AS (
    SELECT DISTINCT ON (e.invalidation_id) e.invalidation_id, e.occurred_at, e.actor_principal_id, e.correlation_id, e.details
      FROM graph.invalidation_events e
     WHERE e.event = 'invalidation.opened' AND e.tenant_id = p_tenant AND (p_domain IS NULL OR e.domain_id = p_domain)
     ORDER BY e.invalidation_id, e.occurred_at ASC, e.event_id ASC
  )
  SELECT ls.invalidation_id, ls.tenant_id, ls.domain_id,
         CASE ls.event WHEN 'invalidation.opened' THEN 'open' WHEN 'invalidation.assessed' THEN 'assessed' ELSE 'closed' END,
         o.details ->> 'trigger_kind', (o.details ->> 'trigger_object_id')::uuid, (o.details ->> 'correction_case_id')::uuid,
         o.occurred_at, o.actor_principal_id, o.correlation_id, ls.event, ls.occurred_at,
         (ls.event = 'invalidation.opened' AND o.invalidation_id IS NOT NULL AND coalesce(o.details ->> 'trigger_kind', '') <> '' AND (o.details ->> 'trigger_object_id') IS NOT NULL)   -- an ASSESSED row's affected lists are not in its log (0065:1246-1262 carries counts): not derivable
    FROM last_state ls
    LEFT JOIN opened o ON o.invalidation_id = ls.invalidation_id
$$;

-- memory.withdrawn writes cur.object_version (0068:220-221), so the withdrawn item's expected version is its last recorded one;
-- memory.attention details carry attention_state (0079:494-497). The POLICY columns (C6, AU-MEM-0083 "policy-inconsistent") are the
-- canonical version's the log names: the header's classification (the applied one — memory.service.ts writes the same value to the
-- projection), the payload's audience in payload order (memory.record_item writes the same arrays in the same order), the accountable
-- owner. row_derivable: the canonical version the log names exists (the content tier's presence).
CREATE OR REPLACE FUNCTION memory.expected_items(p_tenant uuid, p_domain uuid)
RETURNS TABLE (item_id uuid, tenant_id uuid, domain_id uuid, state text, object_version int, classification text, audience_roles text[], audience_purposes text[], owner_principal_id uuid,
               attention_state text, superseded_versions int, last_superseded_at timestamptz,
               recorded_at timestamptz, recorded_by uuid, first_correlation_id uuid, last_event text, last_event_at timestamptz, row_derivable boolean)
LANGUAGE sql STABLE AS $$
  WITH last_state AS (
    SELECT DISTINCT ON (e.item_id) e.item_id, e.tenant_id, e.domain_id, e.event, e.object_version, e.occurred_at
      FROM memory.item_events e
     WHERE e.event IN ('memory.recorded', 'memory.superseded', 'memory.withdrawn')
       AND e.tenant_id = p_tenant AND (p_domain IS NULL OR e.domain_id = p_domain)
     ORDER BY e.item_id, e.occurred_at DESC, e.event_id DESC
  ), first_recorded AS (
    SELECT DISTINCT ON (e.item_id) e.item_id, e.correlation_id FROM memory.item_events e
     WHERE e.event = 'memory.recorded' AND e.tenant_id = p_tenant AND (p_domain IS NULL OR e.domain_id = p_domain)
     ORDER BY e.item_id, e.occurred_at ASC, e.event_id ASC
  ), versions AS (
    SELECT e.item_id,
           (count(*) FILTER (WHERE e.event = 'memory.superseded'))::int AS superseded_versions,
           max(e.occurred_at) FILTER (WHERE e.event = 'memory.superseded') AS last_superseded_at,
           max(e.occurred_at) FILTER (WHERE e.event IN ('memory.recorded', 'memory.superseded')) AS recorded_at,
           (array_agg(e.actor_principal_id ORDER BY e.occurred_at DESC, e.event_id DESC) FILTER (WHERE e.event IN ('memory.recorded', 'memory.superseded')))[1] AS recorded_by
      FROM memory.item_events e
     WHERE e.tenant_id = p_tenant AND (p_domain IS NULL OR e.domain_id = p_domain) GROUP BY e.item_id
  ), attention AS (
    -- the mark is not a state transition (the 0065 rule for warnings) and is left out of the check; it is derived here for the rebuild and the fallback read only
    SELECT DISTINCT ON (e.item_id) e.item_id, e.event, e.details FROM memory.item_events e
     WHERE e.event IN ('memory.recorded', 'memory.superseded', 'memory.attention', 'memory.basis_withdrawn')
       AND e.tenant_id = p_tenant AND (p_domain IS NULL OR e.domain_id = p_domain)
     ORDER BY e.item_id, e.occurred_at DESC, e.event_id DESC
  ), canon AS (
    -- the POLICY columns of the version the log names (C6, AU-MEM-0083 "policy-inconsistent"): the canonical header's classification, the
    -- payload's audience in payload order (memory.record_item writes the same arrays in the same order), the accountable owner
    SELECT ls.item_id, o.classification,
           coalesce((SELECT array_agg(t.y #>> '{}' ORDER BY t.ord) FROM jsonb_array_elements(coalesce(o.payload #> '{audience,roles}', '[]'::jsonb)) WITH ORDINALITY AS t(y, ord)), '{}'::text[]) AS audience_roles,
           coalesce((SELECT array_agg(t.y #>> '{}' ORDER BY t.ord) FROM jsonb_array_elements(coalesce(o.payload #> '{audience,purposes}', '[]'::jsonb)) WITH ORDINALITY AS t(y, ord)), '{}'::text[]) AS audience_purposes,
           CASE WHEN o.accountable_owner ~ '^principal:[0-9a-f-]{36}$' THEN substr(o.accountable_owner, 11)::uuid END AS owner_principal_id
      FROM last_state ls
      JOIN objects.canonical_objects o ON o.object_id = ls.item_id AND o.object_type = 'MEM' AND o.object_version = ls.object_version
  )
  SELECT ls.item_id, ls.tenant_id, ls.domain_id,
         CASE WHEN ls.event = 'memory.withdrawn' THEN 'withdrawn' ELSE 'active' END, ls.object_version,
         cn.classification, cn.audience_roles, cn.audience_purposes, cn.owner_principal_id,
         CASE a.event WHEN 'memory.basis_withdrawn' THEN 'basis_withdrawn' WHEN 'memory.attention' THEN coalesce(a.details ->> 'attention_state', 'basis_corrected') ELSE 'none' END,
         coalesce(v.superseded_versions, 0), v.last_superseded_at, v.recorded_at, v.recorded_by, fr.correlation_id, ls.event, ls.occurred_at,
         (cn.item_id IS NOT NULL)          -- row_derivable: the canonical version the log names exists
    FROM last_state ls
    LEFT JOIN first_recorded fr ON fr.item_id = ls.item_id
    LEFT JOIN versions v ON v.item_id = ls.item_id
    LEFT JOIN attention a ON a.item_id = ls.item_id
    LEFT JOIN canon cn ON cn.item_id = ls.item_id
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['graph.expected_entities', 'graph.expected_resolutions', 'graph.expected_edges', 'graph.expected_strategy', 'graph.expected_invalidations', 'memory.expected_items'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s(uuid, uuid) FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s(uuid, uuid) TO eye_app, eye_commit', f);
  END LOOP;
END $$;

-- ============================================================
-- §3 THE WATERMARK, derived — the partition rows joined to the ledgers that already exist: the domain's latest
--    GraphChanged/MemoryCorrected sequence (the revision), the live contiguous APPLIED prefix of the retrieval subscription's
--    deliveries (the verified sequence — the dispatcher's own cursor, which advances only inside the finish of the delivery being
--    applied (0064:367-378), is answered beside it as checkpoint_seq), the passing check of the event that closes the prefix, the
--    unresolved deliveries, and the domain's latest check per projection. Six rows always (a domain with no partition row reads
--    serving / representation current). condition: withdrawn (the row) > unverified (no retrieval subscription that is not revoked,
--    or one that has applied no check yet — C1) > lagging (a change the subscriber has not verified yet — VERIFICATION lag, never
--    data lag: the ports write projection and log in one transaction) > current. A paused subscription is judged by its lag; its
--    status is answered beside it.
-- ============================================================
CREATE OR REPLACE FUNCTION graph.projection_state()
RETURNS TABLE (projection text, state text, condition text, revision_seq bigint, verified_seq bigint, verified_at timestamptz, verified_check_id uuid, checkpoint_seq bigint,
               lag_events bigint, unresolved_deliveries bigint, subscription_id uuid, subscription_status text,
               withdrawn_at timestamptz, withdrawn_by uuid, withdrawn_reason text, withdrawn_by_check uuid,
               representation_version text, representation_current text, representation_ok boolean, last_rebuild_id uuid, rebuilt_at timestamptz,
               last_check_id uuid, last_check_at timestamptz, last_check jsonb)
SECURITY DEFINER SET search_path = graph, objects, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_tenant uuid; v_domain uuid; v_sub_id uuid; v_sub_status text; v_cp bigint; v_from bigint; v_cp_event uuid;
        v_open_min bigint; v_vseq bigint; v_vevent uuid; v_vat timestamptz; v_vcheck uuid;
        v_lc_id uuid; v_lc_at timestamptz; v_lc_proj jsonb; v_rev bigint; v_lag bigint := 0; v_unres bigint := 0;
        v_current text := graph.projection_representation_version();
BEGIN
  -- The callers: the twelve read routes (graph.read, memory.item.retrieve), /subscriptions/status and /projections/verify (graph.read),
  -- the briefing composer (briefing.compose); observation.read as graph.rebuild_projections() has admitted since 0063 (the seed scripts'
  -- verify). Nothing else calls it — the retention gate reads the partition table, the two acts answer the port's report.
  PERFORM observation.assert_authority(ARRAY['graph.read', 'observation.read', 'memory.item.retrieve', 'briefing.compose']);
  v_tenant := public.eye_tenant(); v_domain := public.eye_domain();
  IF v_tenant IS NULL OR v_domain IS NULL THEN RETURN; END IF;
  SELECT x.subscription_id, x.status, x.checkpoint_seq, x.served_from_seq, x.checkpoint_event_id INTO v_sub_id, v_sub_status, v_cp, v_from, v_cp_event
    FROM graph.subscriptions x WHERE x.tenant_id = v_tenant AND x.domain_id = v_domain AND x.consumer_kind = 'retrieval' AND x.status <> 'revoked';   -- scalars: NULL when none
  SELECT max(o.partition_seq) INTO v_rev FROM objects.object_outbox o
   WHERE o.tenant_id = v_tenant AND o.domain_id = v_domain AND o.event_type IN ('GraphChanged', 'MemoryCorrected');
  IF v_sub_id IS NOT NULL THEN
    -- THE VERIFIED SEQUENCE IS THE LIVE CONTIGUOUS APPLIED PREFIX (C2). The stored cursor is the dispatcher's: it advances only inside
    -- the finish of the delivery being applied (0064:367-378), so a later delivery applied while an earlier one was open (a rebuilt
    -- event verified while the drift event stands unresolved) is never re-covered when the earlier one is applied on its re-drive.
    -- From the cursor upward, every event of the subscription's kinds with an APPLIED delivery extends the prefix; the first one
    -- without (never received, received, failed, refused, unresolved) bounds it. The cursor itself is the dispatcher's word (a
    -- never-received row below it is B7's reconciliation, not this function's) and is answered beside the prefix as checkpoint_seq.
    -- Cost: the rows above the cursor (the lag) through object_outbox_graph_revision; the prefix through gsd_subscription_applied_seq.
    SELECT min(o.partition_seq) INTO v_open_min FROM objects.object_outbox o
     WHERE o.tenant_id = v_tenant AND o.domain_id = v_domain AND o.event_type IN ('GraphChanged', 'MemoryCorrected')
       AND o.partition_seq >= v_from AND o.partition_seq > coalesce(v_cp, -1)
       AND NOT EXISTS (SELECT 1 FROM graph.subscription_deliveries d WHERE d.event_id = o.id AND d.subscription_id = v_sub_id AND d.state = 'applied');
    SELECT d.partition_seq, d.event_id INTO v_vseq, v_vevent FROM graph.subscription_deliveries d
     WHERE d.subscription_id = v_sub_id AND d.state = 'applied' AND (v_open_min IS NULL OR d.partition_seq < v_open_min)
     ORDER BY d.partition_seq DESC LIMIT 1;
    IF v_vseq IS NULL AND v_cp IS NOT NULL THEN v_vseq := v_cp; v_vevent := v_cp_event; END IF;   -- a cursor with no applied row of its own (0064's backfill of a legacy subscription): the cursor stands
    SELECT count(*) INTO v_lag FROM objects.object_outbox o
     WHERE o.tenant_id = v_tenant AND o.domain_id = v_domain AND o.event_type IN ('GraphChanged', 'MemoryCorrected')
       AND o.partition_seq >= v_from AND (v_vseq IS NULL OR o.partition_seq > v_vseq);
    SELECT count(*) INTO v_unres FROM graph.subscription_deliveries d WHERE d.subscription_id = v_sub_id AND d.state = 'unresolved';
    IF v_vevent IS NOT NULL THEN
      -- the PASSING check of the event that closes the prefix (a re-driven delivery has several checks; the last passing one applied it)
      SELECT c.check_id, c.checked_at INTO v_vcheck, v_vat FROM graph.retrieval_checks c
       WHERE c.subscription_id = v_sub_id AND c.outbox_event_id = v_vevent AND c.mismatched = 0 ORDER BY c.checked_at DESC LIMIT 1;
    END IF;
  END IF;
  SELECT c.check_id, c.checked_at, c.projections INTO v_lc_id, v_lc_at, v_lc_proj FROM graph.retrieval_checks c
   WHERE c.tenant_id = v_tenant AND c.domain_id = v_domain ORDER BY c.checked_at DESC LIMIT 1;
  RETURN QUERY
  SELECT n.projection, coalesce(p.state, 'serving'),
         CASE WHEN coalesce(p.state, 'serving') = 'withdrawn' THEN 'withdrawn'
              WHEN v_sub_id IS NULL OR v_vseq IS NULL THEN 'unverified'      -- C1: no live subscription, or one that has applied no check yet
              WHEN v_lag > 0 THEN 'lagging' ELSE 'current' END,
         v_rev, v_vseq, v_vat, v_vcheck, v_cp, v_lag, v_unres, v_sub_id, v_sub_status,
         p.withdrawn_at, p.withdrawn_by, p.withdrawn_reason, p.withdrawn_by_check,
         coalesce(p.representation_version, v_current), v_current, coalesce(p.representation_version, v_current) = v_current,
         p.last_rebuild_id, p.rebuilt_at,
         v_lc_id, v_lc_at,
         (SELECT x FROM jsonb_array_elements(coalesce(v_lc_proj, '[]'::jsonb)) x WHERE x ->> 'projection' = n.projection LIMIT 1)
    FROM (VALUES (1, 'entities_current'), (2, 'resolutions_current'), (3, 'edges_current'), (4, 'strategy_current'), (5, 'invalidations_current'), (6, 'memory_items_current')) n(pos, projection)
    LEFT JOIN graph.projection_partitions p ON p.tenant_id = v_tenant AND p.domain_id = v_domain AND p.projection = n.projection
   ORDER BY n.pos;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.projection_state() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.projection_state() TO eye_app, eye_commit;

-- ============================================================
-- §4 THE CHECK — the same name, still a COMPARISON (the writer is §7): per projection the live rows, the log's rows, the rows
--    in both whose STATE differs (as before), the rows the log has and the projection lacks (missing), the rows the projection
--    has and the log does not know (unexpected — the poisoned rows), and whether the partition was verified under the current
--    derivation rule. The sixth row is the memory projection (state, object_version and the policy columns against the canonical
--    version its ledger names — C6). Every derivation is the §2 function's. Accepts the rebuild's own action (the re-check inside
--    graph.rebuild_projection).
-- ============================================================
-- A partition row verified under another version of the rule (no row: current by default). Definer-internal: the owner runs it
-- inside graph.rebuild_projections(); granted to no one on purpose.
CREATE OR REPLACE FUNCTION graph.partition_representation_ok(p_tenant uuid, p_domain uuid, p_projection text, p_current text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT NOT EXISTS (SELECT 1 FROM graph.projection_partitions p
                      WHERE p.tenant_id = p_tenant AND (p_domain IS NULL OR p.domain_id = p_domain) AND p.projection = p_projection AND p.representation_version <> p_current)
$$;
REVOKE ALL ON FUNCTION graph.partition_representation_ok(uuid, uuid, text, text) FROM PUBLIC;

DROP FUNCTION IF EXISTS graph.rebuild_projections();
CREATE FUNCTION graph.rebuild_projections()
RETURNS TABLE (projection text, live_rows bigint, rebuilt_rows bigint, mismatched bigint, missing bigint, unexpected bigint, representation_ok boolean)
SECURITY DEFINER SET search_path = graph, memory, objects, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_tenant uuid; v_domain uuid; v_current text := graph.projection_representation_version();
BEGIN
  -- 0063: the retrieval subscriber verifies the projections after a change; 0080: the rebuild re-checks under its own action.
  PERFORM observation.assert_authority(ARRAY['graph.read', 'observation.read', 'graph.retrieval.subscription.apply', 'graph.projection.rebuild']);
  v_tenant := public.eye_tenant();
  v_domain := public.eye_domain();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'projection rebuild rejected: no tenant is established in this context' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH live AS (SELECT x.entity_id AS id, x.lifecycle_state AS state FROM graph.entities_current x WHERE x.tenant_id = v_tenant AND (v_domain IS NULL OR x.domain_id = v_domain)),
       expect AS (SELECT e.entity_id AS id, e.state FROM graph.expected_entities(v_tenant, v_domain) e)
  SELECT 'entities_current'::text, (SELECT count(*) FROM live), (SELECT count(*) FROM expect),
         (SELECT count(*) FROM live l JOIN expect e ON e.id = l.id WHERE l.state IS DISTINCT FROM e.state),
         (SELECT count(*) FROM expect e WHERE NOT EXISTS (SELECT 1 FROM live l WHERE l.id = e.id)),
         (SELECT count(*) FROM live l WHERE NOT EXISTS (SELECT 1 FROM expect e WHERE e.id = l.id)),
         graph.partition_representation_ok(v_tenant, v_domain, 'entities_current', v_current);

  RETURN QUERY
  WITH live AS (SELECT x.resolution_id AS id, x.state FROM graph.resolutions_current x WHERE x.tenant_id = v_tenant AND (v_domain IS NULL OR x.domain_id = v_domain)),
       expect AS (SELECT e.resolution_id AS id, e.state FROM graph.expected_resolutions(v_tenant, v_domain) e)
  SELECT 'resolutions_current'::text, (SELECT count(*) FROM live), (SELECT count(*) FROM expect),
         (SELECT count(*) FROM live l JOIN expect e ON e.id = l.id WHERE l.state IS DISTINCT FROM e.state),
         (SELECT count(*) FROM expect e WHERE NOT EXISTS (SELECT 1 FROM live l WHERE l.id = e.id)),
         (SELECT count(*) FROM live l WHERE NOT EXISTS (SELECT 1 FROM expect e WHERE e.id = l.id)),
         graph.partition_representation_ok(v_tenant, v_domain, 'resolutions_current', v_current);

  RETURN QUERY
  WITH live AS (SELECT x.edge_id AS id, x.state FROM graph.edges_current x WHERE x.tenant_id = v_tenant AND (v_domain IS NULL OR x.domain_id = v_domain)),
       expect AS (SELECT e.edge_id AS id, e.state FROM graph.expected_edges(v_tenant, v_domain) e)
  SELECT 'edges_current'::text, (SELECT count(*) FROM live), (SELECT count(*) FROM expect),
         (SELECT count(*) FROM live l JOIN expect e ON e.id = l.id WHERE l.state IS DISTINCT FROM e.state),
         (SELECT count(*) FROM expect e WHERE NOT EXISTS (SELECT 1 FROM live l WHERE l.id = e.id)),
         (SELECT count(*) FROM live l WHERE NOT EXISTS (SELECT 1 FROM expect e WHERE e.id = l.id)),
         graph.partition_representation_ok(v_tenant, v_domain, 'edges_current', v_current);

  RETURN QUERY
  WITH live AS (SELECT x.strategy_object_id AS id, x.object_type, x.verification_state FROM graph.strategy_current x WHERE x.tenant_id = v_tenant AND (v_domain IS NULL OR x.domain_id = v_domain)),
       expect AS (SELECT e.strategy_object_id AS id, e.state FROM graph.expected_strategy(v_tenant, v_domain) e)
  SELECT 'strategy_current'::text, (SELECT count(*) FROM live), (SELECT count(*) FROM expect),
         (SELECT count(*) FROM live l JOIN expect e ON e.id = l.id WHERE l.object_type = 'ASU' AND e.state IS NOT NULL AND l.verification_state IS DISTINCT FROM e.state),
         (SELECT count(*) FROM expect e WHERE NOT EXISTS (SELECT 1 FROM live l WHERE l.id = e.id)),
         (SELECT count(*) FROM live l WHERE NOT EXISTS (SELECT 1 FROM expect e WHERE e.id = l.id)),
         graph.partition_representation_ok(v_tenant, v_domain, 'strategy_current', v_current);

  RETURN QUERY
  WITH live AS (SELECT x.invalidation_id AS id, x.state FROM graph.invalidations_current x WHERE x.tenant_id = v_tenant AND (v_domain IS NULL OR x.domain_id = v_domain)),
       expect AS (SELECT e.invalidation_id AS id, e.state FROM graph.expected_invalidations(v_tenant, v_domain) e)
  SELECT 'invalidations_current'::text, (SELECT count(*) FROM live), (SELECT count(*) FROM expect),
         (SELECT count(*) FROM live l JOIN expect e ON e.id = l.id WHERE l.state IS DISTINCT FROM e.state),
         (SELECT count(*) FROM expect e WHERE NOT EXISTS (SELECT 1 FROM live l WHERE l.id = e.id)),
         (SELECT count(*) FROM live l WHERE NOT EXISTS (SELECT 1 FROM expect e WHERE e.id = l.id)),
         graph.partition_representation_ok(v_tenant, v_domain, 'invalidations_current', v_current);

  -- the memory row (C6): state, version and the three policy columns against the canonical version the log names; the
  -- e.classification IS NOT NULL guard — a log version with no canonical row is the content tier's absence, named by the rebuild
  -- as unrebuildable, not a policy drift
  RETURN QUERY
  WITH live AS (SELECT x.item_id AS id, x.state, x.object_version, x.classification, x.audience_roles, x.audience_purposes FROM memory.items_current x WHERE x.tenant_id = v_tenant AND (v_domain IS NULL OR x.domain_id = v_domain)),
       expect AS (SELECT e.item_id AS id, e.state, e.object_version, e.classification, e.audience_roles, e.audience_purposes FROM memory.expected_items(v_tenant, v_domain) e)
  SELECT 'memory_items_current'::text, (SELECT count(*) FROM live), (SELECT count(*) FROM expect),
         (SELECT count(*) FROM live l JOIN expect e ON e.id = l.id
           WHERE l.state IS DISTINCT FROM e.state OR l.object_version IS DISTINCT FROM e.object_version
              OR (e.classification IS NOT NULL AND (l.classification IS DISTINCT FROM e.classification OR l.audience_roles IS DISTINCT FROM e.audience_roles OR l.audience_purposes IS DISTINCT FROM e.audience_purposes))),
         (SELECT count(*) FROM expect e WHERE NOT EXISTS (SELECT 1 FROM live l WHERE l.id = e.id)),
         (SELECT count(*) FROM live l WHERE NOT EXISTS (SELECT 1 FROM expect e WHERE e.id = l.id)),
         graph.partition_representation_ok(v_tenant, v_domain, 'memory_items_current', v_current);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.rebuild_projections() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.rebuild_projections() TO eye_app, eye_commit;

-- ============================================================
-- §5 WITHDRAWAL: the retrieval check's own effect under its own authority (a failed partition is taken out of service in the
--    check's transaction — the reads never serve a drifted, poisoned or incomplete partition as current), or the operator's act
--    (a suspicion, a representation review, a planned rebuild). Idempotent: a second withdrawal is a second ledger row with
--    changed false and the earlier reason kept — the subscriber's re-checks append a changed false row per failed partition each
--    (the tick's re-check every ten minutes, every later change): the ledger of a standing failure. No outbox event: a withdrawal
--    changes no fact of the graph; the reads consult the partition row directly (graph.projection_state) and the next check would
--    re-withdraw anyway. A withdrawal blocks no WRITE: the ports keep writing projection and log in one transaction; the rebuild
--    re-verifies them.
-- ============================================================
CREATE OR REPLACE FUNCTION graph.withdraw_projection(
  p_event_id uuid, p_tenant uuid, p_domain uuid, p_projection text, p_reason text, p_check_id uuid, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_action text; part graph.projection_partitions%ROWTYPE; v_changed boolean; v_now timestamptz := clock_timestamp();
BEGIN
  v_action := observation.assert_authority(ARRAY['graph.projection.withdraw', 'graph.retrieval.subscription.apply']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'projection withdrawal rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_projection IS NULL OR p_projection NOT IN ('entities_current', 'resolutions_current', 'edges_current', 'strategy_current', 'invalidations_current', 'memory_items_current') THEN
    RAISE EXCEPTION 'projection withdrawal rejected: % is not a projection of this domain (one of entities_current, resolutions_current, edges_current, strategy_current, invalidations_current, memory_items_current)', coalesce(p_projection, '<none>') USING ERRCODE = '23503';
  END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'projection withdrawal rejected: a withdrawal states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF v_action = 'graph.retrieval.subscription.apply' AND p_check_id IS NULL THEN RAISE EXCEPTION 'projection withdrawal rejected: the retrieval subscriber withdraws on a recorded check' USING ERRCODE = '22023'; END IF;
  INSERT INTO graph.projection_partitions (tenant_id, domain_id, projection) VALUES (p_tenant, p_domain, p_projection) ON CONFLICT DO NOTHING;
  SELECT * INTO part FROM graph.projection_partitions x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.projection = p_projection FOR UPDATE;
  v_changed := part.state <> 'withdrawn';
  IF v_changed THEN
    UPDATE graph.projection_partitions
       SET state = 'withdrawn', withdrawn_at = v_now, withdrawn_by = p_actor, withdrawn_reason = p_reason, withdrawn_by_check = p_check_id, updated_at = v_now, correlation_id = p_correlation
     WHERE tenant_id = p_tenant AND domain_id = p_domain AND projection = p_projection;
  END IF;
  INSERT INTO graph.projection_events (event_id, scope, tenant_id, domain_id, projection, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_projection, 'projection.withdrawn', p_actor,
          jsonb_build_object('reason', p_reason, 'check_id', p_check_id, 'by', CASE WHEN v_action = 'graph.projection.withdraw' THEN 'operator' ELSE 'retrieval_check' END,
                             'changed', v_changed, 'withdrawn_since', CASE WHEN v_changed THEN v_now ELSE part.withdrawn_at END,
                             'earlier_reason', CASE WHEN v_changed THEN NULL ELSE part.withdrawn_reason END, 'representation_version', part.representation_version),
          p_correlation);
  RETURN jsonb_build_object('projection', p_projection, 'state', 'withdrawn', 'changed', v_changed, 'event_id', p_event_id,
                            'withdrawn_since', CASE WHEN v_changed THEN v_now ELSE part.withdrawn_at END,
                            'reason', CASE WHEN v_changed THEN p_reason ELSE part.withdrawn_reason END,
                            'second_reason', CASE WHEN v_changed THEN NULL ELSE p_reason END,
                            'withdrawn_by_check', CASE WHEN v_changed THEN p_check_id ELSE part.withdrawn_by_check END);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.withdraw_projection(uuid,uuid,uuid,text,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.withdraw_projection(uuid,uuid,uuid,text,text,uuid,uuid,uuid) TO eye_commit;

-- ============================================================
-- §6 retrieval: the projections re-verified from their logs after a change (the symmetric check of §4), the check recorded, and
--    every partition that FAILED it withdrawn in the same transaction — the subscriber's own effect under its own authority. The
--    consumer's effect stays projections.mismatched, unresolved until a check passes (0064): the recorded `mismatched` is the SUM
--    mismatched + missing + unexpected + (NOT representation_ok) per projection (the column kept; the per-projection JSON says which).
--    The check holds the six partitions shared for the comparison and its withdrawals (C3). The check row is inserted BEFORE the
--    withdrawals so withdrawn_by_check names a row that exists; graph.withdraw_projection runs in the subscriber's own context (the
--    bound action graph.retrieval.subscription.apply; p_actor is the subscription principal, which IS eye_principal() there).
-- ============================================================
CREATE OR REPLACE FUNCTION graph.record_retrieval_check(
  p_check_id uuid, p_outbox_event_id uuid, p_subscription_id uuid, p_tenant uuid, p_domain uuid, p_touched jsonb, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_rows jsonb; v_mismatched int; v_withdrawn jsonb := '[]'::jsonb; x jsonb; v_w jsonb; p text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.retrieval.subscription.apply']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  -- C3: THE COMPARISON AND ITS WITHDRAWALS RUN UNDER THE SIX PARTITION LOCKS, SHARED, in the fixed order — the keys graph.rebuild_projection
  -- takes EXCLUSIVELY (the same strings; copy, never retype). A check waits for an in-flight rebuild to commit, and its comparison — a
  -- later statement of this transaction — snapshots after that commit; a rebuild waits for an in-flight check to commit its withdrawals
  -- before it locks the row. Without this a check computed before a rebuild would, under READ COMMITTED, find the row serving after the
  -- rebuild's commit (FOR UPDATE re-reads the new version) and withdraw the partition again from a stale comparison, and only a second
  -- rebuild could bring it back. Two checks share; a rebuild takes one key and waits for nothing a check holds: no cycle. The operator's
  -- withdrawal keeps its own path (a person's explicit act; re-withdrawing after a rebuild is that person's intent).
  FOREACH p IN ARRAY ARRAY['entities_current', 'resolutions_current', 'edges_current', 'strategy_current', 'invalidations_current', 'memory_items_current'] LOOP
    PERFORM pg_advisory_xact_lock_shared(hashtextextended('graph.projection.rebuild:' || p_domain::text || ':' || p, 0));
  END LOOP;
  SELECT coalesce(jsonb_agg(jsonb_build_object('projection', r.projection, 'live_rows', r.live_rows, 'rebuilt_rows', r.rebuilt_rows, 'mismatched', r.mismatched,
                                               'missing', r.missing, 'unexpected', r.unexpected, 'representation_ok', r.representation_ok,
                                               'failed', (r.mismatched + r.missing + r.unexpected > 0 OR NOT r.representation_ok))), '[]'::jsonb),
         coalesce(sum(r.mismatched + r.missing + r.unexpected + CASE WHEN r.representation_ok THEN 0 ELSE 1 END), 0)::int
    INTO v_rows, v_mismatched
    FROM graph.rebuild_projections() r;
  INSERT INTO graph.retrieval_checks (check_id, scope, tenant_id, domain_id, outbox_event_id, subscription_id, touched, projections, mismatched, checked_by, correlation_id)
  VALUES (p_check_id, 'DOMAIN', p_tenant, p_domain, p_outbox_event_id, p_subscription_id, coalesce(p_touched, '{}'::jsonb), v_rows, v_mismatched, p_actor, p_correlation);
  FOR x IN SELECT * FROM jsonb_array_elements(v_rows) LOOP
    IF (x ->> 'failed')::boolean THEN
      v_w := graph.withdraw_projection(gen_random_uuid(), p_tenant, p_domain, x ->> 'projection',
               format('retrieval check %s after outbox event %s: mismatched %s, missing %s, unexpected %s, representation %s (current %s)',
                      p_check_id, p_outbox_event_id, x ->> 'mismatched', x ->> 'missing', x ->> 'unexpected',
                      CASE WHEN (x ->> 'representation_ok')::boolean THEN 'ok' ELSE 'outdated' END, graph.projection_representation_version()),
               p_check_id, p_actor, p_correlation);
      v_withdrawn := v_withdrawn || jsonb_build_object('projection', x ->> 'projection', 'changed', v_w -> 'changed', 'withdrawn_since', v_w -> 'withdrawn_since');
    END IF;
  END LOOP;
  RETURN jsonb_build_object('check_id', p_check_id, 'projections', v_rows, 'mismatched', v_mismatched, 'withdrawn', v_withdrawn);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.record_retrieval_check(uuid,uuid,uuid,uuid,uuid,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.record_retrieval_check(uuid,uuid,uuid,uuid,uuid,jsonb,uuid,uuid) TO eye_commit;

-- ============================================================
-- §7 THE REBUILD — the operator's act, and the only transition from withdrawn to serving. Under a per-partition advisory lock (the
--    rebuild's exclusive lock is the same key a check takes shared — C3) and the partition row locked: the drifted rows' state (and
--    the columns the state's constraints require) follow the log; the rows the log has and the projection lacks are written from
--    what the log or the canonical record carries (entities from entity.created; memory items from the canonical MEM version;
--    strategy objects from the canonical object; edges from edge.asserted plus the claim's lineage for the provenance the log lacks);
--    a row neither carries is UNREBUILDABLE and NAMED (a resolution — its log carries no row; an assessed invalidation — its lists are
--    counts in the log; an edge with no lineage row or with reassessment events; a memory item whose named version has no canonical
--    record); the rows the log does not know (poisoned) are removed — REFUSED before anything is written when a poisoned entity is
--    held by an edge, a resolution or an identifier, or a poisoned strategy object is cited by a decision package (a person decides).
--    Every write runs in ONE subtransaction; then the §4 check must pass for this projection or everything rolls back and the refusal
--    is recorded with the counts and the rows named (projection.rebuild_refused — the partition stays withdrawn; the answer is the
--    recorded refusal, never a lost transaction). On success the representation version is the current one, the state serving, the
--    withdrawal columns cleared (the ledger keeps them), and projection.rebuilt (rows written) or projection.restored (nothing to
--    write) recorded with the report. Deterministic: the same log, the same rows. NEVER fabricates a value the log or the record
--    lacks. A memory item's attention_state on an INSERT is the log's and on an UPDATE is left as the row holds it (a mark is not a
--    state). updated_at of a rebuilt entity row is the rebuild's instant on an UPDATE and the log's max(occurred_at) on an INSERT —
--    an approximation of the row's instant, not state.
-- ============================================================
CREATE OR REPLACE FUNCTION graph.rebuild_projection(
  p_rebuild_id uuid, p_tenant uuid, p_domain uuid, p_projection text, p_reason text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = graph, memory, objects, intelligence, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE part graph.projection_partitions%ROWTYPE; v_updated int := 0; v_inserted int := 0; v_removed int := 0; v_n int; v_ids jsonb;
        v_restored jsonb := '[]'::jsonb; v_unrebuildable jsonb := '[]'::jsonb; v_referenced jsonb := '[]'::jsonb; v_dangling jsonb := '[]'::jsonb;
        v_check jsonb; v_refusal text; v_event text; v_report jsonb;
        v_now timestamptz := clock_timestamp(); v_current text := graph.projection_representation_version();
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.projection.rebuild']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'projection rebuild rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_projection IS NULL OR p_projection NOT IN ('entities_current', 'resolutions_current', 'edges_current', 'strategy_current', 'invalidations_current', 'memory_items_current') THEN
    RAISE EXCEPTION 'projection rebuild rejected: % is not a projection of this domain (one of entities_current, resolutions_current, edges_current, strategy_current, invalidations_current, memory_items_current)', coalesce(p_projection, '<none>') USING ERRCODE = '23503';
  END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'projection rebuild rejected: a rebuild states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('graph.projection.rebuild:' || p_domain::text || ':' || p_projection, 0));
  INSERT INTO graph.projection_partitions (tenant_id, domain_id, projection) VALUES (p_tenant, p_domain, p_projection) ON CONFLICT DO NOTHING;
  SELECT * INTO part FROM graph.projection_partitions x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.projection = p_projection FOR UPDATE;
  IF part.state <> 'withdrawn' THEN
    RAISE EXCEPTION 'projection rebuild rejected: the % partition of this domain is serving; withdraw it first (graph.projection.withdraw) or let the retrieval check withdraw it', p_projection USING ERRCODE = '22023';
  END IF;

  -- (1) A POISONED ROW THAT IS HELD — refused before anything is written; a person decides. Each holder is CLASSIFIED: derived (the log derives it;
  --     a person decides) or poisoned (itself an unexpected row of ITS partition — rebuild that partition first, which removes it). Beyond the
  --     foreign keys, the rows that would DANGLE after a removal are NAMED in the report, never refused on (no constraint holds them):
  --     graph.dependencies (depends_on_kind entity | edge | strategy; a dependent strategy object) and the prediction rows whose
  --     subject_entity_id names the entity; a twin's boundary (a JSON list in the twin version) is not consulted — stated in §9.
  --     The per-holder EXISTS over graph.expected_* runs once per holder of a poisoned row — rare rows; acceptable.
  IF p_projection = 'entities_current' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', q.entity_id, 'canonical_name', q.canonical_name, 'referenced_by', q.refs,
                                                 'held_by_derived', (SELECT count(*) FROM jsonb_array_elements(q.refs) x WHERE (x ->> 'derived')::boolean),
                                                 'held_by_poisoned', (SELECT count(*) FROM jsonb_array_elements(q.refs) x WHERE NOT (x ->> 'derived')::boolean))), '[]'::jsonb) INTO v_referenced
      FROM (SELECT l.entity_id, l.canonical_name,
                   coalesce((SELECT jsonb_agg(jsonb_build_object('kind', 'edge', 'id', x.edge_id, 'state', x.state, 'derived', EXISTS (SELECT 1 FROM graph.expected_edges(p_tenant, p_domain) e WHERE e.edge_id = x.edge_id)))
                               FROM graph.edges_current x WHERE x.subject_entity_id = l.entity_id OR x.object_entity_id = l.entity_id), '[]'::jsonb)
                   || coalesce((SELECT jsonb_agg(jsonb_build_object('kind', 'resolution', 'id', x.resolution_id, 'state', x.state, 'derived', EXISTS (SELECT 1 FROM graph.expected_resolutions(p_tenant, p_domain) e WHERE e.resolution_id = x.resolution_id)))
                               FROM graph.resolutions_current x WHERE x.entity_id = l.entity_id), '[]'::jsonb)
                   || coalesce((SELECT jsonb_agg(jsonb_build_object('kind', 'identifier', 'id', x.identifier_id, 'derived', true))
                               FROM graph.entity_identifiers x WHERE x.entity_id = l.entity_id), '[]'::jsonb) AS refs
              FROM graph.entities_current l
             WHERE l.tenant_id = p_tenant AND l.domain_id = p_domain AND NOT EXISTS (SELECT 1 FROM graph.expected_entities(p_tenant, p_domain) e WHERE e.entity_id = l.entity_id)) q
     WHERE jsonb_array_length(q.refs) > 0;
    IF jsonb_array_length(v_referenced) > 0 THEN
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_referenced) r WHERE (r ->> 'held_by_derived')::int > 0) THEN
        v_refusal := format('projection rebuild refused: %s poisoned entity row(s) of this domain are held by rows the log derives (an edge, a resolution or an identifier) and cannot be removed — a person decides them; nothing was written', jsonb_array_length(v_referenced))
                     || CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_referenced) r WHERE (r ->> 'held_by_poisoned')::int > 0) THEN '; some holders are themselves unexpected rows — rebuild edges_current / resolutions_current first' ELSE '' END;
      ELSE
        v_refusal := format('projection rebuild refused: %s poisoned entity row(s) of this domain are held only by rows the log does not know either (unexpected edges or resolutions) — rebuild edges_current / resolutions_current first, which removes them; nothing was written', jsonb_array_length(v_referenced));
      END IF;
    END IF;
  ELSIF p_projection = 'strategy_current' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', q.strategy_object_id, 'title', q.title, 'referenced_by', q.refs, 'held_by_derived', jsonb_array_length(q.refs), 'held_by_poisoned', 0)), '[]'::jsonb) INTO v_referenced
      FROM (SELECT l.strategy_object_id, l.title,
                   coalesce((SELECT jsonb_agg(jsonb_build_object('kind', 'package', 'id', x.package_id, 'state', x.state, 'derived', true)) FROM decision.packages_current x WHERE x.decision_object_id = l.strategy_object_id), '[]'::jsonb) AS refs
              FROM graph.strategy_current l
             WHERE l.tenant_id = p_tenant AND l.domain_id = p_domain AND NOT EXISTS (SELECT 1 FROM graph.expected_strategy(p_tenant, p_domain) e WHERE e.strategy_object_id = l.strategy_object_id)) q
     WHERE jsonb_array_length(q.refs) > 0;
    IF jsonb_array_length(v_referenced) > 0 THEN
      v_refusal := format('projection rebuild refused: %s poisoned strategy row(s) of this domain are cited by decision packages and cannot be removed — a person decides them; nothing was written', jsonb_array_length(v_referenced));
    END IF;
  END IF;
  -- THE REFERENCES THAT DANGLE after the removal of the unexpected rows (named; the removal proceeds): cut at 200 in the report.
  IF p_projection IN ('entities_current', 'edges_current', 'strategy_current') THEN
    SELECT coalesce(jsonb_agg(q.x), '[]'::jsonb) INTO v_dangling FROM (
      SELECT jsonb_build_object('kind', 'dependency', 'id', d.dependency_id, 'dependent', d.dependent_object_id, 'depends_on_kind', d.depends_on_kind, 'depends_on', d.depends_on_id, 'state', d.state) AS x
        FROM graph.dependencies d
       WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.state = 'active'
         AND ((p_projection = 'entities_current' AND d.depends_on_kind = 'entity' AND EXISTS (SELECT 1 FROM graph.entities_current l WHERE l.entity_id = d.depends_on_id AND l.tenant_id = p_tenant AND l.domain_id = p_domain AND NOT EXISTS (SELECT 1 FROM graph.expected_entities(p_tenant, p_domain) e WHERE e.entity_id = l.entity_id)))
           OR (p_projection = 'edges_current' AND d.depends_on_kind = 'edge' AND EXISTS (SELECT 1 FROM graph.edges_current l WHERE l.edge_id = d.depends_on_id AND l.tenant_id = p_tenant AND l.domain_id = p_domain AND NOT EXISTS (SELECT 1 FROM graph.expected_edges(p_tenant, p_domain) e WHERE e.edge_id = l.edge_id)))
           OR (p_projection = 'strategy_current' AND EXISTS (SELECT 1 FROM graph.strategy_current l WHERE (l.strategy_object_id = d.dependent_object_id OR (d.depends_on_kind = 'strategy' AND l.strategy_object_id = d.depends_on_id)) AND l.tenant_id = p_tenant AND l.domain_id = p_domain AND NOT EXISTS (SELECT 1 FROM graph.expected_strategy(p_tenant, p_domain) e WHERE e.strategy_object_id = l.strategy_object_id))))
      UNION ALL
      SELECT jsonb_build_object('kind', 'series', 'id', s.series_key, 'subject_entity_id', s.subject_entity_id)
        FROM prediction.series_registry s
       WHERE p_projection = 'entities_current' AND s.tenant_id = p_tenant AND s.domain_id = p_domain
         AND EXISTS (SELECT 1 FROM graph.entities_current l WHERE l.entity_id = s.subject_entity_id AND l.tenant_id = p_tenant AND l.domain_id = p_domain AND NOT EXISTS (SELECT 1 FROM graph.expected_entities(p_tenant, p_domain) e WHERE e.entity_id = l.entity_id))
      UNION ALL
      SELECT jsonb_build_object('kind', 'forecast', 'id', f.forecast_id, 'subject_entity_id', f.subject_entity_id)
        FROM prediction.forecasts_current f
       WHERE p_projection = 'entities_current' AND f.tenant_id = p_tenant AND f.domain_id = p_domain
         AND EXISTS (SELECT 1 FROM graph.entities_current l WHERE l.entity_id = f.subject_entity_id AND l.tenant_id = p_tenant AND l.domain_id = p_domain AND NOT EXISTS (SELECT 1 FROM graph.expected_entities(p_tenant, p_domain) e WHERE e.entity_id = l.entity_id))
      UNION ALL
      SELECT jsonb_build_object('kind', 'scenario', 'id', c.scenario_id, 'subject_entity_id', c.subject_entity_id)
        FROM prediction.scenarios_current c
       WHERE p_projection = 'entities_current' AND c.tenant_id = p_tenant AND c.domain_id = p_domain
         AND EXISTS (SELECT 1 FROM graph.entities_current l WHERE l.entity_id = c.subject_entity_id AND l.tenant_id = p_tenant AND l.domain_id = p_domain AND NOT EXISTS (SELECT 1 FROM graph.expected_entities(p_tenant, p_domain) e WHERE e.entity_id = l.entity_id))
    ) q;
  END IF;

  -- (2) THE WRITES, then the check — in ONE subtransaction; a failure of either rolls back both and is recorded as the refusal.
  IF v_refusal IS NULL THEN
    BEGIN
      CASE p_projection
        WHEN 'entities_current' THEN
          WITH x AS (
            UPDATE graph.entities_current l
               SET lifecycle_state = e.state, superseded_by = CASE WHEN e.state = 'superseded' THEN coalesce(e.superseded_by, l.superseded_by) ELSE l.superseded_by END, updated_at = v_now
              FROM graph.expected_entities(p_tenant, p_domain) e
             WHERE l.entity_id = e.entity_id AND l.tenant_id = p_tenant AND l.domain_id = p_domain AND l.lifecycle_state IS DISTINCT FROM e.state
             RETURNING l.entity_id AS id, e.state)
          SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'change', 'updated', 'to', x.state)), '[]'::jsonb) INTO v_n, v_ids FROM x;
          v_updated := v_n; v_restored := v_restored || v_ids;
          SELECT coalesce(jsonb_agg(jsonb_build_object('id', e.entity_id, 'reason', 'the entity.created event carries no entity_type, canonical_name or normalized_name (or the superseded event names no successor); the row is not derivable')), '[]'::jsonb) INTO v_ids
            FROM graph.expected_entities(p_tenant, p_domain) e WHERE NOT e.row_derivable AND NOT EXISTS (SELECT 1 FROM graph.entities_current l WHERE l.entity_id = e.entity_id);
          v_unrebuildable := v_unrebuildable || v_ids;
          -- created_by and correlation_id are the creation event's; updated_at is max(occurred_at) over ALL the entity's events (N2)
          WITH ins AS (
            INSERT INTO graph.entities_current (entity_id, scope, tenant_id, domain_id, entity_type, canonical_name, normalized_name, lifecycle_state, split_from, superseded_by, created_at, updated_at, created_by, correlation_id)
            SELECT e.entity_id, 'DOMAIN', e.tenant_id, e.domain_id, e.entity_type, e.canonical_name, e.normalized_name, e.state, e.split_from, e.superseded_by, e.created_at, coalesce(e.updated_at, e.created_at), e.created_by, e.correlation_id
              FROM graph.expected_entities(p_tenant, p_domain) e
             WHERE e.row_derivable AND NOT EXISTS (SELECT 1 FROM graph.entities_current l WHERE l.entity_id = e.entity_id)
            RETURNING entity_id AS id, lifecycle_state AS state)
          SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('id', ins.id, 'change', 'inserted', 'to', ins.state)), '[]'::jsonb) INTO v_n, v_ids FROM ins;
          v_inserted := v_n; v_restored := v_restored || v_ids;
          WITH del AS (
            DELETE FROM graph.entities_current l
             WHERE l.tenant_id = p_tenant AND l.domain_id = p_domain AND NOT EXISTS (SELECT 1 FROM graph.expected_entities(p_tenant, p_domain) e WHERE e.entity_id = l.entity_id)
            RETURNING l.entity_id AS id, l.lifecycle_state AS state)
          SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('id', del.id, 'change', 'removed', 'from', del.state)), '[]'::jsonb) INTO v_n, v_ids FROM del;
          v_removed := v_n; v_restored := v_restored || v_ids;

        WHEN 'resolutions_current' THEN
          WITH x AS (
            UPDATE graph.resolutions_current l
               SET state = e.state,
                   accepted_at = CASE WHEN e.state = 'accepted' THEN coalesce(l.accepted_at, e.last_event_at) ELSE NULL END,
                   decided_by = CASE WHEN e.last_event IN ('resolution.accepted', 'resolution.rejected') THEN e.last_actor WHEN e.state = 'proposed' THEN NULL ELSE l.decided_by END,
                   decided_at = CASE WHEN e.last_event IN ('resolution.accepted', 'resolution.rejected') THEN e.last_event_at WHEN e.state = 'proposed' THEN NULL ELSE l.decided_at END,
                   decision_reason = CASE WHEN e.last_event IN ('resolution.accepted', 'resolution.rejected') THEN coalesce(e.last_details ->> 'reason', l.decision_reason) WHEN e.state = 'proposed' THEN NULL ELSE l.decision_reason END,
                   superseded_by = CASE WHEN e.state = 'superseded' THEN coalesce((e.last_details ->> 'successor')::uuid, l.superseded_by) ELSE NULL END,
                   superseded_at = CASE WHEN e.state = 'superseded' THEN coalesce(l.superseded_at, e.last_event_at) ELSE NULL END
              FROM graph.expected_resolutions(p_tenant, p_domain) e
             WHERE l.resolution_id = e.resolution_id AND l.tenant_id = p_tenant AND l.domain_id = p_domain AND l.state IS DISTINCT FROM e.state
             RETURNING l.resolution_id AS id, e.state)
          SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'change', 'updated', 'to', x.state)), '[]'::jsonb) INTO v_n, v_ids FROM x;
          v_updated := v_n; v_restored := v_restored || v_ids;
          SELECT coalesce(jsonb_agg(jsonb_build_object('id', e.resolution_id, 'reason', 'the resolution log carries neither the mention, the claim, the evidence nor the method of a resolution; the row is the proposer''s record and is not derivable')), '[]'::jsonb) INTO v_ids
            FROM graph.expected_resolutions(p_tenant, p_domain) e WHERE NOT EXISTS (SELECT 1 FROM graph.resolutions_current l WHERE l.resolution_id = e.resolution_id);
          v_unrebuildable := v_unrebuildable || v_ids;
          WITH del AS (
            DELETE FROM graph.resolutions_current l
             WHERE l.tenant_id = p_tenant AND l.domain_id = p_domain AND NOT EXISTS (SELECT 1 FROM graph.expected_resolutions(p_tenant, p_domain) e WHERE e.resolution_id = l.resolution_id)
            RETURNING l.resolution_id AS id, l.state)
          SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('id', del.id, 'change', 'removed', 'from', del.state)), '[]'::jsonb) INTO v_n, v_ids FROM del;
          v_removed := v_n; v_restored := v_restored || v_ids;

        WHEN 'edges_current' THEN
          WITH x AS (
            UPDATE graph.edges_current l
               SET state = e.state,
                   retracted_at = CASE WHEN e.state = 'retracted' THEN coalesce(e.retracted_at, l.retracted_at) ELSE NULL END,
                   retracted_by = CASE WHEN e.state = 'retracted' THEN coalesce(e.retracted_by, l.retracted_by) ELSE NULL END,
                   retraction_reason = CASE WHEN e.state = 'retracted' THEN coalesce(e.retraction_reason, l.retraction_reason) ELSE NULL END,
                   superseded_by = CASE WHEN e.state = 'superseded' THEN coalesce(e.superseded_by, l.superseded_by) ELSE NULL END,
                   superseded_at = CASE WHEN e.state = 'superseded' THEN coalesce(e.superseded_at, l.superseded_at) ELSE NULL END
              FROM graph.expected_edges(p_tenant, p_domain) e
             WHERE l.edge_id = e.edge_id AND l.tenant_id = p_tenant AND l.domain_id = p_domain AND l.state IS DISTINCT FROM e.state
             RETURNING l.edge_id AS id, e.state)
          SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'change', 'updated', 'to', x.state)), '[]'::jsonb) INTO v_n, v_ids FROM x;
          v_updated := v_n; v_restored := v_restored || v_ids;
          SELECT coalesce(jsonb_agg(jsonb_build_object('id', m.edge_id, 'reason',
                   CASE WHEN m.reassessment_events > 0 THEN 'reassessment events exist on this edge; the reassessment record is not derivable from the state log'
                        WHEN NOT m.row_derivable THEN 'the edge.asserted event carries no full row (subject, predicate, object, valid_from, claim, mode)'
                        WHEN m.lineage_evidence IS NULL THEN format('no claim lineage row for claim %s@%s: the provenance columns (evidence, its digest, the method, the run, the confidence) cannot be derived', m.claim_object_id, m.claim_version)
                        ELSE 'both ends must be entities of this domain' END)), '[]'::jsonb) INTO v_ids
            FROM (SELECT e.*, l.evidence_object_id AS lineage_evidence
                    FROM graph.expected_edges(p_tenant, p_domain) e
                    LEFT JOIN intelligence.claim_lineage l ON l.claim_object_id = e.claim_object_id AND l.claim_version = e.claim_version
                   WHERE NOT EXISTS (SELECT 1 FROM graph.edges_current x WHERE x.edge_id = e.edge_id)) m
           WHERE m.reassessment_events > 0 OR NOT m.row_derivable OR m.lineage_evidence IS NULL
              OR NOT EXISTS (SELECT 1 FROM graph.entities_current s WHERE s.entity_id = m.subject_entity_id) OR NOT EXISTS (SELECT 1 FROM graph.entities_current o WHERE o.entity_id = m.object_entity_id);
          v_unrebuildable := v_unrebuildable || v_ids;
          -- the provenance columns the log lacks come from the claim's lineage row (one per (claim, version) — its primary key)
          WITH ins AS (
            INSERT INTO graph.edges_current (edge_id, scope, tenant_id, domain_id, subject_entity_id, predicate, object_entity_id, valid_from, valid_to, asserted_at, retracted_at, state, claim_object_id, claim_version,
                                             evidence_object_id, evidence_digest, method_id, run_id, mode, confidence, asserted_by, retracted_by, retraction_reason, superseded_by, superseded_at, correlation_id)
            SELECT e.edge_id, 'DOMAIN', e.tenant_id, e.domain_id, e.subject_entity_id, e.predicate, e.object_entity_id, e.valid_from, e.valid_to, e.asserted_at, e.retracted_at, e.state, e.claim_object_id, e.claim_version,
                   l.evidence_object_id, l.evidence_digest, l.method_id, l.run_id, e.mode, l.confidence, e.asserted_by, e.retracted_by, e.retraction_reason, e.superseded_by, e.superseded_at, e.correlation_id
              FROM graph.expected_edges(p_tenant, p_domain) e
              JOIN intelligence.claim_lineage l ON l.claim_object_id = e.claim_object_id AND l.claim_version = e.claim_version
             WHERE e.row_derivable AND NOT EXISTS (SELECT 1 FROM graph.edges_current x WHERE x.edge_id = e.edge_id)
               AND EXISTS (SELECT 1 FROM graph.entities_current s WHERE s.entity_id = e.subject_entity_id) AND EXISTS (SELECT 1 FROM graph.entities_current o WHERE o.entity_id = e.object_entity_id)
            RETURNING edge_id AS id, state)
          SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('id', ins.id, 'change', 'inserted', 'to', ins.state)), '[]'::jsonb) INTO v_n, v_ids FROM ins;
          v_inserted := v_n; v_restored := v_restored || v_ids;
          WITH del AS (
            DELETE FROM graph.edges_current l
             WHERE l.tenant_id = p_tenant AND l.domain_id = p_domain AND NOT EXISTS (SELECT 1 FROM graph.expected_edges(p_tenant, p_domain) e WHERE e.edge_id = l.edge_id)
            RETURNING l.edge_id AS id, l.state)
          SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('id', del.id, 'change', 'removed', 'from', del.state)), '[]'::jsonb) INTO v_n, v_ids FROM del;
          v_removed := v_n; v_restored := v_restored || v_ids;

        WHEN 'strategy_current' THEN
          WITH x AS (
            UPDATE graph.strategy_current l
               SET verification_state = e.state, verification_reason = coalesce(e.verification_reason, l.verification_reason), verified_at = coalesce(e.verified_at, l.verified_at), updated_at = v_now
              FROM graph.expected_strategy(p_tenant, p_domain) e
             WHERE l.strategy_object_id = e.strategy_object_id AND l.tenant_id = p_tenant AND l.domain_id = p_domain AND l.object_type = 'ASU' AND e.state IS NOT NULL AND l.verification_state IS DISTINCT FROM e.state
             RETURNING l.strategy_object_id AS id, e.state)
          SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'change', 'updated', 'to', x.state)), '[]'::jsonb) INTO v_n, v_ids FROM x;
          v_updated := v_n; v_restored := v_restored || v_ids;
          SELECT coalesce(jsonb_agg(jsonb_build_object('id', e.strategy_object_id, 'reason', 'no canonical OBJ/ASU/DEC/CMT/OUT object carries this strategy row; it is not derivable')), '[]'::jsonb) INTO v_ids
            FROM graph.expected_strategy(p_tenant, p_domain) e WHERE NOT e.row_derivable AND NOT EXISTS (SELECT 1 FROM graph.strategy_current l WHERE l.strategy_object_id = e.strategy_object_id);
          v_unrebuildable := v_unrebuildable || v_ids;
          -- the canonical object's latest version carries the row (strategy.service.ts:126-142: title, statement, status, parent_objective_id, verification.state)
          WITH ins AS (
            INSERT INTO graph.strategy_current (strategy_object_id, scope, tenant_id, domain_id, object_type, object_version, title, statement, status, verification_state, verification_reason, verified_at, parent_objective_id, owner_principal_id, declared_at, updated_at, correlation_id)
            SELECT e.strategy_object_id, 'DOMAIN', e.tenant_id, e.domain_id, o.object_type, o.object_version, o.payload ->> 'title', o.payload ->> 'statement', o.payload ->> 'status',
                   CASE WHEN o.object_type = 'ASU' THEN coalesce(e.state, o.payload #>> '{verification,state}', 'unverified') ELSE 'not_applicable' END, e.verification_reason, e.verified_at,
                   (o.payload ->> 'parent_objective_id')::uuid,
                   coalesce(CASE WHEN o.accountable_owner ~ '^principal:[0-9a-f-]{36}$' THEN substr(o.accountable_owner, 11)::uuid END, e.declared_by),
                   coalesce(e.declared_at, o.recorded_at), v_now, coalesce(e.correlation_id, o.audit_correlation_id)
              FROM graph.expected_strategy(p_tenant, p_domain) e
              JOIN LATERAL (SELECT c.* FROM objects.canonical_objects c WHERE c.object_id = e.strategy_object_id AND c.object_type IN ('OBJ', 'ASU', 'DEC', 'CMT', 'OUT') ORDER BY c.object_version DESC LIMIT 1) o ON true
             WHERE e.row_derivable AND NOT EXISTS (SELECT 1 FROM graph.strategy_current l WHERE l.strategy_object_id = e.strategy_object_id)
            RETURNING strategy_object_id AS id, verification_state AS state)
          SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('id', ins.id, 'change', 'inserted', 'to', ins.state)), '[]'::jsonb) INTO v_n, v_ids FROM ins;
          v_inserted := v_n; v_restored := v_restored || v_ids;
          WITH del AS (
            DELETE FROM graph.strategy_current l
             WHERE l.tenant_id = p_tenant AND l.domain_id = p_domain AND NOT EXISTS (SELECT 1 FROM graph.expected_strategy(p_tenant, p_domain) e WHERE e.strategy_object_id = l.strategy_object_id)
            RETURNING l.strategy_object_id AS id, l.verification_state AS state)
          SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('id', del.id, 'change', 'removed', 'from', del.state)), '[]'::jsonb) INTO v_n, v_ids FROM del;
          v_removed := v_n; v_restored := v_restored || v_ids;

        WHEN 'invalidations_current' THEN
          WITH x AS (
            UPDATE graph.invalidations_current l
               SET state = e.state, assessed_at = CASE WHEN e.state IN ('assessed', 'closed') THEN coalesce(l.assessed_at, e.last_event_at) ELSE NULL END
              FROM graph.expected_invalidations(p_tenant, p_domain) e
             WHERE l.invalidation_id = e.invalidation_id AND l.tenant_id = p_tenant AND l.domain_id = p_domain AND l.state IS DISTINCT FROM e.state
             RETURNING l.invalidation_id AS id, e.state)
          SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'change', 'updated', 'to', x.state)), '[]'::jsonb) INTO v_n, v_ids FROM x;
          v_updated := v_n; v_restored := v_restored || v_ids;
          SELECT coalesce(jsonb_agg(jsonb_build_object('id', e.invalidation_id, 'reason', CASE WHEN e.state = 'open' THEN 'the invalidation.opened event carries no trigger' ELSE 'an assessed invalidation''s affected lists are counts in its log; the assessment is the row itself and is not derivable' END)), '[]'::jsonb) INTO v_ids
            FROM graph.expected_invalidations(p_tenant, p_domain) e WHERE NOT e.row_derivable AND NOT EXISTS (SELECT 1 FROM graph.invalidations_current l WHERE l.invalidation_id = e.invalidation_id);
          v_unrebuildable := v_unrebuildable || v_ids;
          WITH ins AS (
            INSERT INTO graph.invalidations_current (invalidation_id, scope, tenant_id, domain_id, trigger_kind, trigger_object_id, correction_case_id, opened_at, opened_by, statement, state, correlation_id)
            SELECT e.invalidation_id, 'DOMAIN', e.tenant_id, e.domain_id, e.trigger_kind, e.trigger_object_id, e.correction_case_id, e.opened_at, e.opened_by, 'dependency walk opened; nothing has been assessed yet', 'open', e.correlation_id
              FROM graph.expected_invalidations(p_tenant, p_domain) e
             WHERE e.row_derivable AND NOT EXISTS (SELECT 1 FROM graph.invalidations_current l WHERE l.invalidation_id = e.invalidation_id)
            RETURNING invalidation_id AS id, state)
          SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('id', ins.id, 'change', 'inserted', 'to', ins.state)), '[]'::jsonb) INTO v_n, v_ids FROM ins;
          v_inserted := v_n; v_restored := v_restored || v_ids;
          WITH del AS (
            DELETE FROM graph.invalidations_current l
             WHERE l.tenant_id = p_tenant AND l.domain_id = p_domain AND NOT EXISTS (SELECT 1 FROM graph.expected_invalidations(p_tenant, p_domain) e WHERE e.invalidation_id = l.invalidation_id)
            RETURNING l.invalidation_id AS id, l.state)
          SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('id', del.id, 'change', 'removed', 'from', del.state)), '[]'::jsonb) INTO v_n, v_ids FROM del;
          v_removed := v_n; v_restored := v_restored || v_ids;

        WHEN 'memory_items_current' THEN
          -- a drifted item (state, version or a policy column — C6) is RE-PROJECTED from the canonical version its log names (the content
          -- columns follow that version — memory.record_item's own mapping, 0079:266-290; the policy columns are the §2 derivation's, the
          -- same values the check compared)
          WITH x AS (
            UPDATE memory.items_current l
               SET state = e.state, object_version = e.object_version,
                   record_class = o.payload ->> 'record_class', title = o.payload ->> 'title', statement = o.payload ->> 'statement',
                   source_kind = o.payload #>> '{source,kind}', source_ref = o.payload #>> '{source,ref}',
                   classification = e.classification, audience_roles = e.audience_roles, audience_purposes = e.audience_purposes,
                   valid_from = (o.payload #>> '{validity,from}')::timestamptz, valid_to = (o.payload #>> '{validity,to}')::timestamptz,
                   retention_profile = o.payload #>> '{retention,profile}', retain_until = (o.payload #>> '{retention,retain_until}')::timestamptz, retention_basis = o.payload #>> '{retention,basis}',
                   related_decision_id = (o.payload #>> '{related,decision_id}')::uuid, related_objective_id = (o.payload #>> '{related,objective_id}')::uuid,
                   derivation = o.payload -> 'derivation', superseded_versions = e.superseded_versions, last_superseded_at = e.last_superseded_at,
                   recorded_at = coalesce(e.recorded_at, l.recorded_at), recorded_by = coalesce(e.recorded_by, l.recorded_by)
              FROM memory.expected_items(p_tenant, p_domain) e
              JOIN objects.canonical_objects o ON o.object_id = e.item_id AND o.object_type = 'MEM' AND o.object_version = e.object_version
             WHERE l.item_id = e.item_id AND l.tenant_id = p_tenant AND l.domain_id = p_domain
               AND (l.state IS DISTINCT FROM e.state OR l.object_version IS DISTINCT FROM e.object_version
                    OR l.classification IS DISTINCT FROM e.classification OR l.audience_roles IS DISTINCT FROM e.audience_roles OR l.audience_purposes IS DISTINCT FROM e.audience_purposes)
             RETURNING l.item_id AS id, e.state, e.object_version)
          SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'change', 'updated', 'to', x.state || '@' || x.object_version::text)), '[]'::jsonb) INTO v_n, v_ids FROM x;
          v_updated := v_n; v_restored := v_restored || v_ids;
          -- N4: a missing row OR a drifted row whose named version has no canonical record is named, never "refused with counts only"
          SELECT coalesce(jsonb_agg(jsonb_build_object('id', e.item_id, 'reason', format('no canonical MEM version %s carries this item; the row is not derivable', e.object_version))), '[]'::jsonb) INTO v_ids
            FROM memory.expected_items(p_tenant, p_domain) e
           WHERE NOT e.row_derivable AND NOT EXISTS (SELECT 1 FROM memory.items_current l WHERE l.item_id = e.item_id AND l.state IS NOT DISTINCT FROM e.state AND l.object_version IS NOT DISTINCT FROM e.object_version);
          v_unrebuildable := v_unrebuildable || v_ids;
          WITH ins AS (
            INSERT INTO memory.items_current (item_id, scope, tenant_id, domain_id, object_version, record_class, title, statement, source_kind, source_ref, owner_principal_id, classification, audience_roles, audience_purposes,
                                              valid_from, valid_to, retention_profile, retain_until, retention_basis, related_decision_id, related_objective_id, state, attention_state, recorded_at, recorded_by, superseded_versions, last_superseded_at, correlation_id, derivation)
            SELECT e.item_id, 'DOMAIN', e.tenant_id, e.domain_id, e.object_version, o.payload ->> 'record_class', o.payload ->> 'title', o.payload ->> 'statement', o.payload #>> '{source,kind}', o.payload #>> '{source,ref}',
                   coalesce(e.owner_principal_id, e.recorded_by), e.classification, e.audience_roles, e.audience_purposes,
                   (o.payload #>> '{validity,from}')::timestamptz, (o.payload #>> '{validity,to}')::timestamptz, o.payload #>> '{retention,profile}', (o.payload #>> '{retention,retain_until}')::timestamptz, o.payload #>> '{retention,basis}',
                   (o.payload #>> '{related,decision_id}')::uuid, (o.payload #>> '{related,objective_id}')::uuid, e.state, e.attention_state, coalesce(e.recorded_at, o.recorded_at), coalesce(e.recorded_by, e.owner_principal_id),
                   e.superseded_versions, e.last_superseded_at, coalesce(e.first_correlation_id, o.audit_correlation_id), o.payload -> 'derivation'
              FROM memory.expected_items(p_tenant, p_domain) e
              JOIN objects.canonical_objects o ON o.object_id = e.item_id AND o.object_type = 'MEM' AND o.object_version = e.object_version
             WHERE e.row_derivable AND NOT EXISTS (SELECT 1 FROM memory.items_current l WHERE l.item_id = e.item_id)
            RETURNING item_id AS id, state, object_version)
          SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('id', ins.id, 'change', 'inserted', 'to', ins.state || '@' || ins.object_version::text)), '[]'::jsonb) INTO v_n, v_ids FROM ins;
          v_inserted := v_n; v_restored := v_restored || v_ids;
          WITH del AS (
            DELETE FROM memory.items_current l
             WHERE l.tenant_id = p_tenant AND l.domain_id = p_domain AND NOT EXISTS (SELECT 1 FROM memory.expected_items(p_tenant, p_domain) e WHERE e.item_id = l.item_id)
            RETURNING l.item_id AS id, l.state)
          SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('id', del.id, 'change', 'removed', 'from', del.state)), '[]'::jsonb) INTO v_n, v_ids FROM del;
          v_removed := v_n; v_restored := v_restored || v_ids;
      END CASE;

      IF jsonb_array_length(v_unrebuildable) > 0 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0B20', MESSAGE = format('%s row(s) the log has cannot be written from what the log or the canonical record carries (named); nothing was written', jsonb_array_length(v_unrebuildable));
      END IF;
      -- the representation is the current rule's BEFORE the re-check (representation_ok is part of it); the inner check runs under the
      -- write's own context (eye_domain() = p_domain) and admits graph.projection.rebuild (§4)
      UPDATE graph.projection_partitions SET representation_version = v_current WHERE tenant_id = p_tenant AND domain_id = p_domain AND projection = p_projection;
      SELECT jsonb_build_object('live_rows', r.live_rows, 'rebuilt_rows', r.rebuilt_rows, 'mismatched', r.mismatched, 'missing', r.missing, 'unexpected', r.unexpected, 'representation_ok', r.representation_ok)
        INTO v_check FROM graph.rebuild_projections() r WHERE r.projection = p_projection;
      IF (v_check ->> 'mismatched')::int + (v_check ->> 'missing')::int + (v_check ->> 'unexpected')::int > 0 OR NOT (v_check ->> 'representation_ok')::boolean THEN
        RAISE EXCEPTION USING ERRCODE = 'P0B20', MESSAGE = format('the check after the rebuild still fails (mismatched %s, missing %s, unexpected %s, representation %s); nothing was written',
                                                                 v_check ->> 'mismatched', v_check ->> 'missing', v_check ->> 'unexpected', CASE WHEN (v_check ->> 'representation_ok')::boolean THEN 'ok' ELSE 'outdated' END);
      END IF;
    EXCEPTION
      WHEN SQLSTATE 'P0B20' THEN v_refusal := 'projection rebuild refused: ' || SQLERRM;
      WHEN check_violation OR foreign_key_violation OR not_null_violation OR unique_violation OR invalid_text_representation THEN
        v_refusal := format('projection rebuild refused: a rebuilt row of %s violates the projection''s own constraints (%s: %s); nothing was written', p_projection, SQLSTATE, left(SQLERRM, 300));
    END;
  END IF;

  IF v_refusal IS NOT NULL THEN
    INSERT INTO graph.projection_events (event_id, scope, tenant_id, domain_id, projection, event, actor_principal_id, details, correlation_id)
    VALUES (p_rebuild_id, 'DOMAIN', p_tenant, p_domain, p_projection, 'projection.rebuild_refused', p_actor,
            jsonb_build_object('reason', p_reason, 'refusal', v_refusal, 'unrebuildable', v_unrebuildable, 'referenced', v_referenced, 'dangling', v_dangling, 'check', v_check,
                               'attempted', jsonb_build_object('updated', v_updated, 'inserted', v_inserted, 'removed', v_removed), 'representation_version', part.representation_version), p_correlation);
    UPDATE graph.projection_partitions SET updated_at = v_now WHERE tenant_id = p_tenant AND domain_id = p_domain AND projection = p_projection;
    RETURN jsonb_build_object('outcome', 'refused', 'projection', p_projection, 'state', 'withdrawn', 'rebuild_id', p_rebuild_id, 'reason', p_reason, 'refusal', v_refusal,
                              'unrebuildable', v_unrebuildable, 'referenced', v_referenced, 'dangling', v_dangling, 'check', v_check, 'attempted', jsonb_build_object('updated', v_updated, 'inserted', v_inserted, 'removed', v_removed),
                              'withdrawn_since', part.withdrawn_at, 'withdrawn_reason', part.withdrawn_reason, 'representation_version', part.representation_version);
  END IF;

  v_event := CASE WHEN v_updated + v_inserted + v_removed > 0 THEN 'projection.rebuilt' ELSE 'projection.restored' END;
  UPDATE graph.projection_partitions
     SET state = 'serving', withdrawn_at = NULL, withdrawn_by = NULL, withdrawn_reason = NULL, withdrawn_by_check = NULL, representation_version = v_current,
         last_rebuild_id = p_rebuild_id, rebuilt_at = v_now, updated_at = v_now, correlation_id = p_correlation
   WHERE tenant_id = p_tenant AND domain_id = p_domain AND projection = p_projection;
  -- the restored and dangling lists are cut at 200 in the report (LIFECYCLE_EVENT_LIST_MAX — the event builder cuts the same list again); the ledger event keeps the WHOLE dangling list (C8)
  v_report := jsonb_build_object('outcome', CASE v_event WHEN 'projection.rebuilt' THEN 'rebuilt' ELSE 'restored' END, 'projection', p_projection, 'state', 'serving', 'rebuild_id', p_rebuild_id, 'reason', p_reason,
                                 'updated', v_updated, 'inserted', v_inserted, 'removed', v_removed,
                                 'restored', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (SELECT x FROM jsonb_array_elements(v_restored) x LIMIT 200) q),
                                 'restored_truncated', jsonb_array_length(v_restored) > 200,
                                 'dangling', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (SELECT x FROM jsonb_array_elements(v_dangling) x LIMIT 200) q),
                                 'dangling_truncated', jsonb_array_length(v_dangling) > 200,
                                 'check', v_check, 'representation_version', v_current,
                                 'withdrawn_since', part.withdrawn_at, 'withdrawn_reason', part.withdrawn_reason, 'withdrawn_by_check', part.withdrawn_by_check, 'rebuilt_at', v_now);
  INSERT INTO graph.projection_events (event_id, scope, tenant_id, domain_id, projection, event, actor_principal_id, details, correlation_id)
  VALUES (p_rebuild_id, 'DOMAIN', p_tenant, p_domain, p_projection, v_event, p_actor, v_report || jsonb_build_object('dangling', v_dangling, 'dangling_truncated', false), p_correlation);
  RETURN v_report;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.rebuild_projection(uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.rebuild_projection(uuid,uuid,uuid,text,text,uuid,uuid) TO eye_commit;

-- ============================================================
-- §8 THE CONTENT TIER DID NOT ANSWER (AU-MEM-0067): a retrieval that could read the item's METADATA (the projection, or the log
--    while the projection is withdrawn) but not the canonical version answers metadata-only and records THIS row — never an
--    access row (memory.item_access requires the served version, 0066:471: nothing was served). The constraint name
--    item_events_event_check is 0079:93's; p_version is the metadata tier's current version — read, not served.
-- ============================================================
ALTER TABLE memory.item_events DROP CONSTRAINT item_events_event_check;
ALTER TABLE memory.item_events ADD CONSTRAINT item_events_event_check CHECK (event IN ('memory.recorded', 'memory.superseded', 'memory.withdrawn', 'memory.attention', 'memory.retrieved', 'memory.basis_withdrawn', 'memory.retrieval_degraded'));

CREATE OR REPLACE FUNCTION memory.record_retrieval_degraded(p_item_id uuid, p_tenant uuid, p_domain uuid, p_version int, p_purpose text, p_reader uuid, p_cause text, p_detail text, p_correlation uuid)
RETURNS uuid
SECURITY DEFINER SET search_path = memory, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
  PERFORM observation.assert_authority(ARRAY['memory.item.retrieve', 'briefing.compose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF coalesce(length(btrim(p_purpose)), 0) = 0 THEN RAISE EXCEPTION 'memory retrieval rejected: a purpose is declared' USING ERRCODE = '22023'; END IF;
  IF coalesce(p_cause, '') NOT IN ('content_unavailable') THEN RAISE EXCEPTION 'memory retrieval rejected: the degradation names its cause (content_unavailable)' USING ERRCODE = '22023'; END IF;
  INSERT INTO memory.item_events (event_id, scope, tenant_id, domain_id, item_id, event, object_version, actor_principal_id, details, correlation_id)
  VALUES (v_id, 'DOMAIN', p_tenant, p_domain, p_item_id, 'memory.retrieval_degraded', p_version, p_reader,
          jsonb_build_object('purpose', p_purpose, 'cause', p_cause, 'detail', left(coalesce(p_detail, ''), 300), 'access_recorded', false, 'code', 'EYE-DEG-001'), p_correlation);
  RETURN v_id;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION memory.record_retrieval_degraded(uuid,uuid,uuid,int,text,uuid,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION memory.record_retrieval_degraded(uuid,uuid,uuid,int,text,uuid,text,text,uuid) TO eye_commit;

-- ============================================================
-- §9 retention.begin_execution re-declared: the deletion PAUSED while the edges or the memory projection is withdrawn
-- ============================================================
-- 0072 §5's body copied whole (0072:599-706) with ONE block inserted immediately after the approver check and BEFORE the manager's
-- checks and the lock block — nothing counted, nothing locked for an execution refused here. The function's search_path carries no
-- graph schema: graph.projection_partitions is qualified. v_withdrawn is 0072's own variable (the export's rights check reuses it later;
-- the deletion branch never reaches that path). Every other line as 0072 left it.
CREATE OR REPLACE FUNCTION retention.begin_execution(p_action_id uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = retention, observation, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a retention.actions_current%ROWTYPE; v_live int; v_withdrawn text; v_tombstoned text; m RECORD; v_versions bigint[]; v_dependents jsonb; v_names text := ''; v_n int;
        pol RECORD; v_bytes bigint; v_used bigint; v_resets timestamptz;
BEGIN
  PERFORM observation.assert_authority(ARRAY['retention.action.execute']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO a FROM retention.actions_current x WHERE x.action_id = p_action_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention execution rejected: % is not an action of this domain', p_action_id USING ERRCODE = '23503'; END IF;
  IF a.state <> 'approved' THEN RAISE EXCEPTION 'retention execution rejected: % is % — only an approved action executes', p_action_id, a.state USING ERRCODE = '22023'; END IF;
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'retention execution rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF a.kind NOT IN ('deletion', 'log_floor', 'review', 'archive', 'customer_export', 'restore') THEN RAISE EXCEPTION 'retention execution rejected: a % action has no executor in this release', a.kind USING ERRCODE = '22023'; END IF;
  SELECT count(*) INTO v_live FROM retention.approvals ap WHERE ap.action_id = p_action_id AND ap.scope_digest = a.scope_digest AND ap.revoked_at IS NULL AND ap.expires_at > clock_timestamp();
  IF v_live < 1 THEN RAISE EXCEPTION 'retention execution rejected: no live approval on the resolved scope' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM retention.approvals ap WHERE ap.action_id = p_action_id AND ap.approver_principal_id = p_actor AND ap.revoked_at IS NULL) THEN
    RAISE EXCEPTION 'retention execution rejected: an approver of the action does not execute it' USING ERRCODE = '42501';
  END IF;
  -- B20 (0080; DP-37-005 "pause destructive lifecycle actions until scope is proven"): a DELETION's safe referential scope reads the
  -- edges projection ((b) an asserted edge whose provenance names the bytes) and the memory projection ((f) a derived record copying
  -- from them) — retention.load_bearing_references, 0079. While either partition is WITHDRAWN the scope cannot be proven: refused
  -- before the state moves (no attempt counted, nothing locked); the controller pauses the action (unresolved_dependency → human
  -- review), the approvals are revoked by the pause, and the rebuild followed by a re-resolution and a new approval executes it.
  IF a.kind = 'deletion' THEN
    SELECT string_agg(format('%s (since %s: %s)', pp.projection, pp.withdrawn_at, pp.withdrawn_reason), '; ' ORDER BY pp.projection) INTO v_withdrawn
      FROM graph.projection_partitions pp
     WHERE pp.tenant_id = p_tenant AND pp.domain_id = p_domain AND pp.projection IN ('edges_current', 'memory_items_current') AND pp.state = 'withdrawn';
    IF v_withdrawn IS NOT NULL THEN
      RAISE EXCEPTION 'retention execution rejected (projection_withdrawn): the safe referential scope reads a projection that is withdrawn — %; the scope cannot be proven until it is rebuilt (graph.projection.rebuild); the action pauses for human review', v_withdrawn USING ERRCODE = '22023';
    END IF;
  END IF;
  -- B12 (0072 §5; D4 "retries", "admission / budgets"): THE COLD-TIER MANAGER'S CHECKS — before the state moves and before any lock is
  -- taken, so a refusal here costs nothing and counts no attempt. (1) The attempts made under the policy in force: exhausted, the
  -- execution is refused and the controller ESCALATES the action for human review; a person's re-resolution restarts the count.
  -- (2) The daily byte BUDGET of an archive or a restore: the bytes the domain moved in the rolling 24-hour window (the tier ledger's
  -- records of the domain, whichever direction) plus this execution's executable bytes must not exceed it. The window is summed under
  -- the domain's BUDGET lock, taken before the sum and held to the commit (C11): a budgeted domain's byte movers are serialised, so two
  -- executions admitted together cannot each see the window free and together overrun it — the check is exact under concurrency.
  SELECT * INTO pol FROM retention.current_tier_policy(p_tenant, p_domain);
  IF a.attempts >= pol.max_attempts THEN
    RAISE EXCEPTION 'retention execution rejected (attempts_exhausted): % attempt(s) were made under a policy allowing %; the action is escalated for human review (a re-resolution restarts the count)', a.attempts, pol.max_attempts USING ERRCODE = '22023';
  END IF;
  IF a.kind IN ('archive', 'restore') AND pol.budget_bytes_per_day IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('retention.budget:' || p_tenant::text || ':' || p_domain::text, 0));
    SELECT coalesce(sum(bm.byte_length), 0) INTO v_bytes FROM retention.scope_items si JOIN observation.blob_manifests bm ON bm.manifest_id = si.ref::uuid WHERE si.action_id = p_action_id AND si.item_kind = 'manifest' AND si.disposition = 'execute';
    SELECT coalesce(sum(bm.byte_length), 0), min(r.moved_at) + interval '1 day' INTO v_used, v_resets FROM observation.blob_tier_records r JOIN observation.blob_manifests bm ON bm.manifest_id = r.manifest_id WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.moved_at > clock_timestamp() - interval '1 day';
    IF v_used + v_bytes > pol.budget_bytes_per_day THEN
      RAISE EXCEPTION 'retention execution rejected (budget_exhausted): the domain moved % bytes in the last 24 hours and this execution would move % more, above the policy''s % bytes per day; the window frees at %; retried by the same route after a re-resolution', v_used, v_bytes, pol.budget_bytes_per_day, coalesce(v_resets, clock_timestamp()) USING ERRCODE = '22023';
    END IF;
  END IF;
  -- B11-F1 (0071 §1): THE MANIFESTS THIS EXECUTION MOVES OR REMOVES ARE LOCKED for the transaction — before any re-check below reads their
  -- state and before any byte is copied. Every execution takes the domain's MOVERS lock first, then the manifests' own locks in one canonical
  -- order (by ref), so two executions never wait on each other in a cycle. An archive, a restore or a deletion holds the movers lock shared
  -- and each executable manifest exclusively; a customer export, which reads the bytes of its manifests while it builds, holds both shared
  -- (two exports build together; an archive, a restore or a deletion of the same manifest waits for the export to commit). An execution
  -- naming MORE THAN 256 manifests — whatever its kind — takes the movers lock exclusively and no manifest lock: one entry in the cluster's
  -- finite lock table instead of thousands, at the price of serialising the domain's movers for its duration — every other execution waits
  -- at its start, with nothing copied and nothing recorded. The locks are held until the transaction ends; the copies an execution stages
  -- carry its own attempt's name, so no lock has to survive to their removal.
  IF a.kind IN ('archive', 'deletion', 'customer_export', 'restore') THEN
    SELECT count(*) INTO v_n FROM retention.scope_items si WHERE si.action_id = p_action_id AND si.item_kind = 'manifest' AND si.disposition = 'execute';
    IF v_n > 256 THEN
      PERFORM pg_advisory_xact_lock(retention.lock_key_domain(p_tenant, p_domain));
    ELSE
      PERFORM pg_advisory_xact_lock_shared(retention.lock_key_domain(p_tenant, p_domain));
      FOR m IN SELECT si.ref FROM retention.scope_items si WHERE si.action_id = p_action_id AND si.item_kind = 'manifest' AND si.disposition = 'execute' ORDER BY si.ref LOOP
        IF a.kind = 'customer_export' THEN PERFORM pg_advisory_xact_lock_shared(retention.lock_key_manifest(m.ref::uuid));
        ELSE PERFORM pg_advisory_xact_lock(retention.lock_key_manifest(m.ref::uuid));
        END IF;
      END LOOP;
    END IF;
  END IF;
  -- An ARCHIVE, a RESTORE or an EXPORT of a manifest tombstoned since the approval: there are no bytes to move or to package; the scope is resolved again (the tombstoned manifest leaves it).
  IF a.kind IN ('archive', 'customer_export', 'restore') THEN
    SELECT string_agg(si.ref, ', ' ORDER BY si.dependency_order) INTO v_tombstoned
      FROM retention.scope_items si
     WHERE si.action_id = p_action_id AND si.item_kind = 'manifest' AND si.disposition = 'execute'
       AND EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = si.ref::uuid);
    IF v_tombstoned IS NOT NULL THEN
      RAISE EXCEPTION 'retention execution rejected (scope_changed): manifest(s) in the approved scope were tombstoned since the approval — %; the scope is resolved again', v_tombstoned USING ERRCODE = '22023';
    END IF;
  END IF;
  -- The export's DATA-RIGHTS gate re-checked AT EXECUTION (the rights may have been withdrawn since the approval): the executor rolls back and
  -- pauses (authority_disputed). The contract rows are locked FOR SHARE first, so a withdrawal that commits inside the package build is impossible:
  -- it either committed before this read (refused here) or waits behind the export's commit (the package was built under confirmed rights).
  IF a.kind = 'customer_export' THEN
    PERFORM 1 FROM observation.source_contracts_current s
      WHERE (s.source_id, s.contract_version) IN (SELECT bm.source_id, bm.contract_version FROM retention.scope_items si JOIN observation.blob_manifests bm ON bm.manifest_id = si.ref::uuid
                                                    WHERE si.action_id = p_action_id AND si.item_kind = 'manifest' AND si.disposition = 'execute')
      FOR SHARE;
    SELECT string_agg(DISTINCT bm.source_id::text || '@' || bm.contract_version || ' (' || s.rights_state || ')', ', ') INTO v_withdrawn
      FROM retention.scope_items si JOIN observation.blob_manifests bm ON bm.manifest_id = si.ref::uuid
      JOIN observation.source_contracts_current s ON s.source_id = bm.source_id AND s.contract_version = bm.contract_version
     WHERE si.action_id = p_action_id AND si.item_kind = 'manifest' AND si.disposition = 'execute' AND s.rights_state <> 'confirmed';
    IF v_withdrawn IS NOT NULL THEN
      RAISE EXCEPTION 'retention execution rejected (rights_changed): the rights of a source in the approved scope are no longer confirmed — %; the scope is resolved again', v_withdrawn USING ERRCODE = '22023';
    END IF;
  END IF;
  -- A DELETION's SAFE SCOPE re-proven at execution (V03-T-100): the references are computed as the resolution computed them (the versions
  -- naming the manifest, the manifest's digest); any dependent now means the bytes are load-bearing and the tombstone is refused before it is written.
  IF a.kind = 'deletion' THEN
    FOR m IN SELECT si.ref, si.details FROM retention.scope_items si WHERE si.action_id = p_action_id AND si.item_kind = 'manifest' AND si.disposition = 'execute' ORDER BY si.dependency_order LOOP
      CONTINUE WHEN (m.details ->> 'evd_object_id') IS NULL;
      SELECT coalesce(array_agg(o.object_version ORDER BY o.object_version), ARRAY[]::bigint[]) INTO v_versions FROM objects.canonical_objects o
       WHERE o.object_id = (m.details ->> 'evd_object_id')::uuid AND o.object_type = 'EVD' AND (o.payload ->> 'manifest_id')::uuid = m.ref::uuid;
      v_dependents := retention.load_bearing_references(p_tenant, p_domain, (m.details ->> 'evd_object_id')::uuid, v_versions, m.details ->> 'content_digest');
      IF jsonb_array_length(v_dependents) > 0 THEN
        v_names := v_names || CASE WHEN v_names = '' THEN '' ELSE '; ' END || 'manifest ' || m.ref || ' ← ' || (SELECT string_agg((d ->> 'kind') || ':' || (d ->> 'ref'), ', ') FROM jsonb_array_elements(v_dependents) d);
      END IF;
    END LOOP;
    IF v_names <> '' THEN
      RAISE EXCEPTION 'retention execution rejected (references_changed): a live reference was created on the approved scope since it was resolved — %; the scope is resolved again', v_names USING ERRCODE = '22023';
    END IF;
  END IF;
  -- The ATTEMPT is counted with the state move (the same UPDATE): an execution that BEGAN. Rolled back with a failing execution, it is
  -- counted again where the failure is recorded — the pause's 8-argument form (C2).
  UPDATE retention.actions_current SET state = 'executing', attempts = attempts + 1 WHERE action_id = p_action_id;
  PERFORM retention.event(p_action_id, p_tenant, p_domain, 'execution.started', p_actor, jsonb_build_object('scope_digest', a.scope_digest, 'attempt', a.attempts + 1), p_correlation);
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('item_id', i.item_id, 'item_kind', i.item_kind, 'ref', i.ref, 'disposition', i.disposition, 'hold_id', i.hold_id, 'details', i.details) ORDER BY i.dependency_order), '[]'::jsonb)
            FROM retention.scope_items i WHERE i.action_id = p_action_id);
END $$ LANGUAGE plpgsql;

-- ============================================================
-- §10 THE PARTITIONS OF EVERY EXISTING DOMAIN (serving, the current representation) — a domain created later gets its rows lazily
--     from the ports (ON CONFLICT DO NOTHING) and reads serving / representation current from graph.projection_state() meanwhile.
--     Idempotent by the primary key (tenant_id, domain_id, projection): a re-run writes nothing over a row that exists.
-- ============================================================
INSERT INTO graph.projection_partitions (tenant_id, domain_id, projection)
SELECT d.tenant_id, d.id, p.projection
  FROM tenancy.domains d
 CROSS JOIN (VALUES ('entities_current'), ('resolutions_current'), ('edges_current'), ('strategy_current'), ('invalidations_current'), ('memory_items_current')) AS p(projection)
ON CONFLICT DO NOTHING;

-- ============================================================
-- §11 THE REGISTER: L3-I02 RetrieveContext's failure column reads "Return partial/stale only with declared product state" — met by the
--     projection block every graph and memory read now declares; the row STAYS partial (the purpose-bound context query is owed).
-- ============================================================
UPDATE objects.interface_register
   SET bound_to = bound_to || '; B20 (0080): every graph and memory read declares its PRODUCT STATE — the projection block (the domain''s revision, the sequence the retrieval subscriber verified through, the lag, each partition''s condition current / lagging / unverified / withdrawn with the withdrawal''s instant and reason and the representation version) — and, while a partition is withdrawn, serves the LAST VALID STATE from the event log labelled (drifted rows with drift, missing rows metadata-only, poisoned rows never), constrains the traversals to depth 2 with bound.projection, and answers a memory retrieval whose content tier did not answer metadata-only (content unavailable, EYE-DEG-001, no access row); the purpose-bound context query stays owed'
 WHERE interface_id = 'L3-I02';

DO $$
DECLARE v_bound int; v_partial int; v_unbound int;
BEGIN
  SELECT count(*) FILTER (WHERE binding_state = 'bound'), count(*) FILTER (WHERE binding_state = 'partial'), count(*) FILTER (WHERE binding_state = 'unbound') INTO v_bound, v_partial, v_unbound FROM objects.interface_register;
  IF (v_bound, v_partial, v_unbound) <> (36, 14, 0) THEN
    RAISE EXCEPTION 'B20 (0080): the interface register reads %/%/% (bound/partial/unbound); 36/14/0 expected — no row moves in B20', v_bound, v_partial, v_unbound;
  END IF;
END $$;
