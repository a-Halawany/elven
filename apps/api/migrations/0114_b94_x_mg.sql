-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0114 §MG — CP-6 B94: GOVERNED MIGRATION, CUTOVER, DOMAIN ACTIVATION, ROLLBACK AND ACCEPTANCE (F-P7-F-04: V8 ch.67 PR-67-003, PR-67-005,
-- PR-67-006, CAP-DL-06, AT-67, JRN-23; V9 ch.66 UX-66-003..006, JRN-23, CAP-PD-06 (alias CAP-DL-06)). Applies alone on top of 0001–0113 and the
-- prelude (0114 §0); nothing earlier is edited.
--
-- DESIGN D7 (the coordinator's, binding): a WAVE (an onboarding programme's migration into its TARGET domain — created DRAFT by §ON) reads the
-- legacy spreadsheet as CSV evidence collected through an `upload` source contract IN THE TARGET DOMAIN (custody; formula-risk cells recorded,
-- never evaluated; xlsx refused with a residual — no parser dependency) → a MAPPING version (column → canonical field from a CLOSED list, the
-- key column, transforms from a CLOSED list, the target kind) proposed by the implementation lead (automation may PROPOSE suggestions, never
-- preselected as approved) and APPROVED by the onboarding authority on its digest (signed `mapping`) → a REHEARSAL (a deterministic dry run
-- over the stored evidence bytes into staging rows, digested: the same input + mapping + target state → the same digest) whose RECONCILIATION
-- REPORT counts mapped / rejected (missing key, formula cell, bad value) / ambiguous (duplicate key) / unmapped columns / would_create /
-- would_match / conflict → remediation (a new mapping version or a corrected file) → rehearsal 2 → the CUTOVER APPROVED by the onboarding
-- authority on the rehearsal's digest (HELD while `data.migration` has no resolved accountable owner, the reconciliation has blocking rows, or
-- the rehearsal's mapping is not the approved one) → EXECUTION by the lead or an agent (automation executes INSIDE the approved plan: the rows
-- written are the APPROVED STAGING ROWS — nothing else can be named; a re-read whose input differs is refused `contract_changed`; per-row
-- savepoints, the B16 admit idiom) → the POST-CUTOVER RECONCILIATION (equal to the rehearsal, or the cutover held) → `tenancy.activate_domain`
-- (domain.activated) → the ROLLBACK (a rehearsal record AND a real path: the migrated entities retired append-only, the activation reverted and
-- re-recorded) → the ACCEPTANCE record (the exact versions and digests; claim `demonstration` — `customer` is never written by this product).
--
-- TARGET (Q4): suppliers → graph ENTITIES (organization) carrying a LEGACY IDENTIFIER system. The RISK RATING rides as PROVENANCE on the entity
-- (its `entity.identified` event and the executed row) — NOT as a B32 exposure proposal: prediction.register_exposure requires a declared RSK
-- strategy object, an ACTIVE risk taxonomy in the domain AND a named, active risk owner ("a material risk is never left unowned"), and the new
-- subsidiary domain has none of them at cutover (scene 3 is exactly that the risk owner is unfilled). RESIDUAL: the exposures are proposed by
-- the domain's risk owner after go-live (§IM / B32 routes), from the migrated provenance — the migration never registers or accepts one.
--
-- THREE CLAIMS, never mixed: CONSTRUCTION (these ports and the harness phase6-migration-b94); DEMONSTRATED OPERATION (the act on SYNTHETIC
-- NORDWERK records — an approval or acceptance by a SYNTHETIC persona demonstrates the software only); REAL CUSTOMER ACCEPTANCE (AT-67,
-- PR-67-006, UX-66-006 — R2, never claimed: the acceptance record's `claim` is `demonstration` by construction).
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §MG.1 THE CLOSED VOCABULARIES ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* The canonical fields a supplier-risk column may map to (the key column maps to legacy_id; legacy_id and name are required). */
CREATE OR REPLACE FUNCTION onboarding.mg_fields() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  'legacy_id', 'name', 'country', 'risk_rating', 'risk_category', 'annual_spend_eur', 'last_review_on'] $$;
/* The transforms a mapping may apply (pure, deterministic; the TypeScript `applyTransforms` is their one implementation). */
CREATE OR REPLACE FUNCTION onboarding.mg_transforms() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  'trim', 'collapse_spaces', 'upper', 'lower', 'null_if_blank', 'iso_country', 'rating_scale', 'decimal', 'date_iso'] $$;
GRANT EXECUTE ON FUNCTION onboarding.mg_fields() TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION onboarding.mg_transforms() TO eye_app, eye_commit;
/* The name normal form the migration compares against (a matched entity is one ACTIVE organization of the target domain with this form). */
CREATE OR REPLACE FUNCTION onboarding.mg_normal(p text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT lower(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g')) $$;
GRANT EXECUTE ON FUNCTION onboarding.mg_normal(text) TO eye_app, eye_commit;

-- §MG.2 THE TABLES (DOMAIN-scoped in the TARGET domain; RLS domain_isolation; SELECT to the runtime roles; written by the ports only) ─────────
/* THE WAVE: one migration of a programme into its target domain from one upload source. state is the PROGRESSION; held_reasons (non-empty ⇔
   held) is the blocking list (PR-67-005: pause at the last verified boundary, expose the gaps). */
CREATE TABLE onboarding.migration_waves (
  wave_id            uuid PRIMARY KEY,
  scope              text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  programme_id       uuid NOT NULL,
  wave_key           text NOT NULL CHECK (wave_key ~ '^[a-z][a-z0-9_.-]{2,62}$'),
  title              text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 200),
  source_id          uuid NOT NULL,
  target_kind        text NOT NULL DEFAULT 'organization' CHECK (target_kind IN ('organization')),
  identifier_system  text NOT NULL CHECK (identifier_system ~ '^[a-z0-9][a-z0-9_.:-]{1,63}$'),
  identifier_authority text NOT NULL CHECK (length(btrim(identifier_authority)) >= 2),
  state              text NOT NULL DEFAULT 'planned' CHECK (state IN ('planned', 'rehearsing', 'reconciled', 'cutover_approved', 'executed', 'verified', 'activated',
                                                                   'accepted', 'rolled_back', 'withdrawn')),
  held_reasons       jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(held_reasons) = 'array'),
  held               boolean GENERATED ALWAYS AS (jsonb_array_length(held_reasons) > 0) STORED,
  created_by         uuid NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT omw_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT omw_key UNIQUE (tenant_id, domain_id, wave_key)
);

/* A MAPPING VERSION (CAP-DL-06): spec = {key_column, columns: [{column, field | null, transforms: [], ignore}], target_kind, identifier_system};
   proposed by the lead (basis: manual | adopted_suggestions — automation's suggestions are adopted by a human proposal, never pre-approved);
   decided by the onboarding authority on its digest; an approval SIGNED (`mapping`) and supersedes the prior approved version. */
CREATE TABLE onboarding.migration_mappings (
  wave_id            uuid NOT NULL REFERENCES onboarding.migration_waves (wave_id),
  version            int  NOT NULL CHECK (version >= 1),
  scope              text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  spec               jsonb NOT NULL CHECK (jsonb_typeof(spec) = 'object'),
  digest             text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  basis              text NOT NULL DEFAULT 'manual' CHECK (basis IN ('manual', 'adopted_suggestions')),
  rationale          text NOT NULL CHECK (length(btrim(rationale)) >= 8),
  state              text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'approved', 'rejected', 'superseded', 'withdrawn')),
  proposed_by        uuid NOT NULL,
  proposed_by_kind   text NOT NULL,
  proposed_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_by         uuid,
  decided_at         timestamptz,
  decision_reason    text,
  signature_id       uuid,
  correlation_id     uuid NOT NULL,
  PRIMARY KEY (wave_id, version),
  CONSTRAINT omm_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT omm_decided CHECK (state IN ('proposed', 'withdrawn') OR (decided_by IS NOT NULL AND decided_at IS NOT NULL)),
  CONSTRAINT omm_sod CHECK (decided_by IS NULL OR decided_by <> proposed_by),
  CONSTRAINT omm_signed CHECK (state NOT IN ('approved', 'superseded') OR signature_id IS NOT NULL)
);
CREATE UNIQUE INDEX omm_one_approved ON onboarding.migration_mappings (wave_id) WHERE state = 'approved';

/* A REHEARSAL (a deterministic dry run) — or the POST-CUTOVER reconciliation (kind post_cutover, compared to the approved rehearsal). The
   reconciliation report is `counts` + the staging rows; input_digest covers what was read (mapping digest, the bytes' digest, the header, the
   parsed rows); plan_digest (THE REHEARSAL DIGEST a cutover is approved on) adds the dispositions against the target domain. */
CREATE TABLE onboarding.migration_rehearsals (
  rehearsal_id       uuid PRIMARY KEY,
  scope              text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  wave_id            uuid NOT NULL REFERENCES onboarding.migration_waves (wave_id),
  seq                int  NOT NULL CHECK (seq >= 1),
  kind               text NOT NULL CHECK (kind IN ('rehearsal', 'post_cutover')),
  mapping_version    int,
  mapping_digest     text,
  mapping_state      text,
  input              jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(input) = 'object'),
  columns            text[] NOT NULL DEFAULT '{}',
  unmapped_columns   text[] NOT NULL DEFAULT '{}',
  missing_columns    text[] NOT NULL DEFAULT '{}',
  counts             jsonb NOT NULL CHECK (jsonb_typeof(counts) = 'object'),
  blocking           int  NOT NULL CHECK (blocking >= 0),
  input_digest       text CHECK (input_digest IS NULL OR input_digest ~ '^[0-9a-f]{64}$'),
  plan_digest        text NOT NULL CHECK (plan_digest ~ '^[0-9a-f]{64}$'),
  cutover_id         uuid,
  compared_to        uuid REFERENCES onboarding.migration_rehearsals (rehearsal_id),
  equal              boolean,
  ran_by             uuid NOT NULL,
  ran_by_kind        text NOT NULL,
  ran_at             timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT omr_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT omr_seq UNIQUE (wave_id, seq),
  CONSTRAINT omr_kind CHECK ((kind = 'rehearsal') = (mapping_version IS NOT NULL AND input_digest IS NOT NULL)),
  CONSTRAINT omr_post CHECK (kind <> 'post_cutover' OR (compared_to IS NOT NULL AND equal IS NOT NULL AND cutover_id IS NOT NULL))
);
CREATE TRIGGER omr_append_only BEFORE UPDATE OR DELETE ON onboarding.migration_rehearsals FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* The STAGING rows of a rehearsal (append-only): one per legacy row — the mapped values, the disposition and its reasons, the matched entity. */
CREATE TABLE onboarding.migration_staging (
  rehearsal_id       uuid NOT NULL REFERENCES onboarding.migration_rehearsals (rehearsal_id),
  row_no             int  NOT NULL CHECK (row_no >= 1),
  scope              text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  legacy_id          text,
  name               text,
  "values"           jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof("values") = 'object'),
  disposition        text NOT NULL CHECK (disposition IN ('would_create', 'would_match', 'rejected', 'ambiguous', 'conflict')),
  reasons            text[] NOT NULL DEFAULT '{}',
  formula_cells      text[] NOT NULL DEFAULT '{}',
  match_entity_id    uuid,
  PRIMARY KEY (rehearsal_id, row_no),
  CONSTRAINT oms_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT oms_match CHECK ((disposition = 'would_match') = (match_entity_id IS NOT NULL))
);
CREATE TRIGGER oms_append_only BEFORE UPDATE OR DELETE ON onboarding.migration_staging FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* THE CUTOVER: requested by the lead on a rehearsal; HELD (held_reasons) while a blocking item stands; APPROVED by the onboarding authority on
   the rehearsal's plan digest (signed `cutover`); executed; verified by the post-cutover reconciliation; activated; or rolled back. */
CREATE TABLE onboarding.migration_cutovers (
  cutover_id         uuid PRIMARY KEY,
  scope              text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  wave_id            uuid NOT NULL REFERENCES onboarding.migration_waves (wave_id),
  rehearsal_id       uuid NOT NULL REFERENCES onboarding.migration_rehearsals (rehearsal_id),
  plan_digest        text NOT NULL CHECK (plan_digest ~ '^[0-9a-f]{64}$'),
  mapping_version    int  NOT NULL,
  state              text NOT NULL DEFAULT 'requested' CHECK (state IN ('requested', 'approved', 'executed', 'verified', 'activated', 'rolled_back', 'superseded')),
  held_reasons       jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(held_reasons) = 'array'),
  held               boolean GENERATED ALWAYS AS (jsonb_array_length(held_reasons) > 0) STORED,
  requested_by       uuid NOT NULL,
  requested_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  approved_by        uuid,
  approved_at        timestamptz,
  approval_reason    text,
  signature_id       uuid,
  executed_by        uuid,
  executed_by_kind   text,
  executed_at        timestamptz,
  execution          jsonb,
  verified_at        timestamptz,
  post_rehearsal_id  uuid,
  activated_at       timestamptz,
  rolled_back_at     timestamptz,
  updated_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT omc_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT omc_sod CHECK (approved_by IS NULL OR approved_by <> requested_by),
  CONSTRAINT omc_approved CHECK (state IN ('requested', 'superseded') OR (approved_by IS NOT NULL AND signature_id IS NOT NULL))
);
CREATE UNIQUE INDEX omc_one_open ON onboarding.migration_cutovers (wave_id) WHERE state NOT IN ('rolled_back', 'superseded');

/* What the execution wrote, per approved staging row (append-only): created | matched | failed, the entity and identifier, the PROVENANCE. */
CREATE TABLE onboarding.migration_executed_rows (
  cutover_id         uuid NOT NULL REFERENCES onboarding.migration_cutovers (cutover_id),
  row_no             int  NOT NULL,
  scope              text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  legacy_id          text NOT NULL,
  outcome            text NOT NULL CHECK (outcome IN ('created', 'matched', 'failed')),
  entity_id          uuid,
  identifier_id      uuid,
  provenance         jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason             text,
  executed_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (cutover_id, row_no),
  CONSTRAINT omx_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT omx_outcome CHECK ((outcome = 'failed') = (entity_id IS NULL AND reason IS NOT NULL))
);
CREATE TRIGGER omx_append_only BEFORE UPDATE OR DELETE ON onboarding.migration_executed_rows FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* ROLLBACK records (append-only): the REHEARSAL of a rollback (its plan and digest) and its EXECUTION (on that digest, by the authority). */
CREATE TABLE onboarding.migration_rollbacks (
  rollback_id        uuid PRIMARY KEY,
  scope              text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  cutover_id         uuid NOT NULL REFERENCES onboarding.migration_cutovers (cutover_id),
  kind               text NOT NULL CHECK (kind IN ('rehearsal', 'executed')),
  plan               jsonb NOT NULL CHECK (jsonb_typeof(plan) = 'object'),
  digest             text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  rehearsal_of       uuid REFERENCES onboarding.migration_rollbacks (rollback_id),
  reason             text,
  recorded_by        uuid NOT NULL,
  recorded_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT omb_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT omb_exec CHECK (kind <> 'executed' OR (rehearsal_of IS NOT NULL AND reason IS NOT NULL))
);
CREATE TRIGGER omb_append_only BEFORE UPDATE OR DELETE ON onboarding.migration_rollbacks FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* THE ACCEPTANCE record (PR-67-006; append-only): the exact versions and digests it binds, accepted or withheld by the onboarding authority on the
   candidate's digest, SIGNED `acceptance`. claim is `demonstration` BY CONSTRUCTION: real customer acceptance is R2 and never written here. */
CREATE TABLE onboarding.migration_acceptances (
  acceptance_id      uuid PRIMARY KEY,
  scope              text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  wave_id            uuid NOT NULL REFERENCES onboarding.migration_waves (wave_id),
  cutover_id         uuid REFERENCES onboarding.migration_cutovers (cutover_id),
  programme_id       uuid NOT NULL,
  decision           text NOT NULL CHECK (decision IN ('accepted', 'withheld')),
  claim              text NOT NULL DEFAULT 'demonstration' CHECK (claim = 'demonstration'),
  bound              jsonb NOT NULL CHECK (jsonb_typeof(bound) = 'object'),
  digest             text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  reason             text NOT NULL CHECK (length(btrim(reason)) >= 8),
  decided_by         uuid NOT NULL,
  decided_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  signature_id       uuid,
  correlation_id     uuid NOT NULL,
  CONSTRAINT oma_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT oma_signed CHECK (decision <> 'accepted' OR signature_id IS NOT NULL)
);
CREATE TRIGGER oma_append_only BEFORE UPDATE OR DELETE ON onboarding.migration_acceptances FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['onboarding.migration_waves', 'onboarding.migration_mappings', 'onboarding.migration_rehearsals', 'onboarding.migration_staging',
                           'onboarding.migration_cutovers', 'onboarding.migration_executed_rows', 'onboarding.migration_rollbacks', 'onboarding.migration_acceptances'] LOOP
    EXECUTE format('REVOKE ALL ON %s FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$CREATE POLICY domain_isolation ON %s USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()))$f$, t);
    EXECUTE format('GRANT SELECT ON %s TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- §MG.3 INTERNAL HELPERS (SECURITY DEFINER; REVOKE PUBLIC; called by the ports below) ──────────────────────────────────────────────────────────
/* The acting principal is the context's own (every port). */
CREATE OR REPLACE FUNCTION onboarding.mg_assert_actor(p_noun text, p_actor uuid) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = public, pg_catalog, pg_temp AS $$
BEGIN
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION '% rejected (actor): the act is recorded by the acting principal of the established context', p_noun USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION onboarding.mg_assert_actor(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.mg_assert_actor(text, uuid) TO eye_commit;

/* The wave, locked, of this tenant/domain (404 otherwise). */
CREATE OR REPLACE FUNCTION onboarding.mg_wave(p_noun text, p_wave uuid, p_tenant uuid, p_domain uuid) RETURNS onboarding.migration_waves
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, pg_catalog, pg_temp AS $$
DECLARE w onboarding.migration_waves%ROWTYPE;
BEGIN
  SELECT * INTO w FROM onboarding.migration_waves x WHERE x.wave_id = p_wave AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '% rejected (unknown_wave): % is not a migration wave of this domain', p_noun, coalesce(p_wave::text, '<none>') USING ERRCODE = '23503'; END IF;
  RETURN w;
END $$;
REVOKE ALL ON FUNCTION onboarding.mg_wave(text, uuid, uuid, uuid) FROM PUBLIC;

/* The cutover, locked, of this tenant/domain (404 otherwise). */
CREATE OR REPLACE FUNCTION onboarding.mg_cutover(p_noun text, p_cutover uuid, p_tenant uuid, p_domain uuid) RETURNS onboarding.migration_cutovers
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, pg_catalog, pg_temp AS $$
DECLARE c onboarding.migration_cutovers%ROWTYPE;
BEGIN
  SELECT * INTO c FROM onboarding.migration_cutovers x WHERE x.cutover_id = p_cutover AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '% rejected (unknown_cutover): % is not a cutover of this domain', p_noun, coalesce(p_cutover::text, '<none>') USING ERRCODE = '23503'; END IF;
  RETURN c;
END $$;
REVOKE ALL ON FUNCTION onboarding.mg_cutover(text, uuid, uuid, uuid) FROM PUBLIC;

/* The domain's lifecycle status (draft | active | …). */
CREATE OR REPLACE FUNCTION onboarding.mg_domain_status(p_tenant uuid, p_domain uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = tenancy, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'a domain''s lifecycle status');
  RETURN (SELECT d.status FROM tenancy.domains d WHERE d.id = p_domain AND d.tenant_id = p_tenant);
END $$;
/* The domain's lifecycle events (created / drafted / activated / activation_reverted), oldest first — a guarded definer read. */
CREATE OR REPLACE FUNCTION onboarding.mg_domain_lifecycle(p_tenant uuid, p_domain uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = tenancy, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'a domain''s lifecycle events');
  RETURN jsonb_build_object('status', (SELECT d.status FROM tenancy.domains d WHERE d.id = p_domain AND d.tenant_id = p_tenant),
    'name', (SELECT d.name FROM tenancy.domains d WHERE d.id = p_domain AND d.tenant_id = p_tenant),
    'activated_at', (SELECT d.activated_at FROM tenancy.domains d WHERE d.id = p_domain AND d.tenant_id = p_tenant),
    'events', coalesce((SELECT jsonb_agg(jsonb_build_object('event', e.event, 'occurred_at', e.occurred_at, 'details', e.details) ORDER BY e.occurred_at, e.id)
                          FROM tenancy.lifecycle_events e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION onboarding.mg_domain_lifecycle(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.mg_domain_lifecycle(uuid, uuid) TO eye_app, eye_commit;
REVOKE ALL ON FUNCTION onboarding.mg_domain_status(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.mg_domain_status(uuid, uuid) TO eye_app, eye_commit;

/* Raise an item once: an OPEN item of the class on the subject answers itself (a re-check never duplicates the escalation). */
CREATE OR REPLACE FUNCTION onboarding.mg_raise_once(p_tenant uuid, p_domain uuid, p_class text, p_kind text, p_subject uuid, p_title text, p_reasons jsonb,
                                                    p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = executive, pg_catalog, pg_temp AS $$
DECLARE i executive.attention_items%ROWTYPE;
BEGIN
  SELECT * INTO i FROM executive.attention_items x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.signal_class = p_class AND x.subject_id = p_subject AND x.state <> 'closed'
   ORDER BY x.created_at DESC LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('item_id', i.item_id, 'state', i.state, 'existing', true); END IF;
  RETURN executive.b33_raise_routed(p_tenant, p_domain, p_class, p_kind, p_subject, p_title, p_reasons, NULL, gen_random_uuid(), 'onboarding.' || p_kind, jsonb_build_object('raised_by', 'b94.mg'),
                                    NULL, p_actor, p_correlation);
END $$;
REVOKE ALL ON FUNCTION onboarding.mg_raise_once(uuid, uuid, text, text, uuid, text, jsonb, uuid, uuid) FROM PUBLIC;

/* A requested (not yet approved) cutover of the wave SUPERSEDED (a newer rehearsal or request): its items close, its ledger says so. */
CREATE OR REPLACE FUNCTION onboarding.mg_supersede_requested(p_tenant uuid, p_domain uuid, p_wave uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, executive, pg_catalog, pg_temp AS $$
DECLARE v uuid;
BEGIN
  FOR v IN SELECT x.cutover_id FROM onboarding.migration_cutovers x WHERE x.wave_id = p_wave AND x.state = 'requested' FOR UPDATE LOOP
    UPDATE onboarding.migration_cutovers SET state = 'superseded', held_reasons = '[]'::jsonb, updated_at = clock_timestamp() WHERE cutover_id = v;
    PERFORM executive.b33_close_items(p_tenant, p_domain, NULL, 'cutover', v, p_reason, p_actor, p_correlation);
    PERFORM onboarding.ledger('onboarding', p_tenant, p_domain, 'cutover', v, 1, 'cutover.superseded', p_actor, jsonb_build_object('wave_id', p_wave, 'reason', p_reason), p_correlation);
  END LOOP;
  UPDATE onboarding.migration_waves SET held_reasons = coalesce((SELECT jsonb_agg(h) FROM jsonb_array_elements(held_reasons) h WHERE h ->> 'kind' <> 'cutover'), '[]'::jsonb)
   WHERE wave_id = p_wave;
END $$;
REVOKE ALL ON FUNCTION onboarding.mg_supersede_requested(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;

/* Validate a mapping spec against the closed lists; returns it normalised (the canonical form the digest covers). */
CREATE OR REPLACE FUNCTION onboarding.mg_validate_spec(p_spec jsonb, p_identifier_system text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = onboarding, pg_catalog, pg_temp AS $$
DECLARE c jsonb; v_cols jsonb := '[]'::jsonb; v_seen_cols text[] := '{}'; v_seen_fields text[] := '{}'; v_col text; v_field text; v_tr text; v_key text; v_ignore boolean;
BEGIN
  IF p_spec IS NULL OR jsonb_typeof(p_spec) <> 'object' OR jsonb_typeof(p_spec -> 'columns') <> 'array' OR jsonb_array_length(p_spec -> 'columns') = 0 THEN
    RAISE EXCEPTION 'migration mapping rejected (spec): a mapping is {key_column, columns: [{column, field, transforms, ignore}]} with at least one column' USING ERRCODE = '22023';
  END IF;
  v_key := btrim(coalesce(p_spec ->> 'key_column', ''));
  FOR c IN SELECT x FROM jsonb_array_elements(p_spec -> 'columns') x LOOP
    v_col := btrim(coalesce(c ->> 'column', ''));
    IF length(v_col) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'migration mapping rejected (spec): every column names its legacy header (1 to 120 characters)' USING ERRCODE = '22023'; END IF;
    IF v_col = ANY (v_seen_cols) THEN RAISE EXCEPTION 'migration mapping rejected (spec): column "%" is mapped twice', v_col USING ERRCODE = '22023'; END IF;
    v_seen_cols := v_seen_cols || v_col;
    v_ignore := coalesce((c ->> 'ignore')::boolean, false);
    v_field := nullif(btrim(coalesce(c ->> 'field', '')), '');
    IF v_ignore AND v_field IS NOT NULL THEN RAISE EXCEPTION 'migration mapping rejected (spec): column "%" is either ignored or mapped, not both', v_col USING ERRCODE = '22023'; END IF;
    IF NOT v_ignore AND v_field IS NULL THEN RAISE EXCEPTION 'migration mapping rejected (spec): column "%" maps to a canonical field or is declared ignored', v_col USING ERRCODE = '22023'; END IF;
    IF v_field IS NOT NULL AND NOT (v_field = ANY (onboarding.mg_fields())) THEN
      RAISE EXCEPTION 'migration mapping rejected (field): % is not a canonical field (%)', v_field, array_to_string(onboarding.mg_fields(), ', ') USING ERRCODE = '22023';
    END IF;
    IF v_field IS NOT NULL AND v_field = ANY (v_seen_fields) THEN RAISE EXCEPTION 'migration mapping rejected (field): % is mapped from two columns', v_field USING ERRCODE = '22023'; END IF;
    IF v_field IS NOT NULL THEN v_seen_fields := v_seen_fields || v_field; END IF;
    IF c ? 'transforms' AND jsonb_typeof(c -> 'transforms') <> 'array' THEN RAISE EXCEPTION 'migration mapping rejected (spec): transforms is a list' USING ERRCODE = '22023'; END IF;
    FOR v_tr IN SELECT jsonb_array_elements_text(coalesce(c -> 'transforms', '[]'::jsonb)) LOOP
      IF NOT (v_tr = ANY (onboarding.mg_transforms())) THEN
        RAISE EXCEPTION 'migration mapping rejected (transform): % is not a transform of the closed list (%)', v_tr, array_to_string(onboarding.mg_transforms(), ', ') USING ERRCODE = '22023';
      END IF;
    END LOOP;
    IF v_ignore AND jsonb_array_length(coalesce(c -> 'transforms', '[]'::jsonb)) > 0 THEN RAISE EXCEPTION 'migration mapping rejected (spec): an ignored column carries no transform' USING ERRCODE = '22023'; END IF;
    v_cols := v_cols || jsonb_build_array(jsonb_build_object('column', v_col, 'field', v_field, 'transforms', coalesce(c -> 'transforms', '[]'::jsonb), 'ignore', v_ignore));
  END LOOP;
  IF NOT ('legacy_id' = ANY (v_seen_fields)) OR NOT ('name' = ANY (v_seen_fields)) THEN
    RAISE EXCEPTION 'migration mapping rejected (field): a supplier mapping maps legacy_id (the key) and name' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_cols) x WHERE x ->> 'column' = v_key AND x ->> 'field' = 'legacy_id') THEN
    RAISE EXCEPTION 'migration mapping rejected (key): key_column "%" is the column mapped to legacy_id', v_key USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('key_column', v_key, 'columns', v_cols, 'target_kind', 'organization', 'identifier_system', p_identifier_system);
END $$;
GRANT EXECUTE ON FUNCTION onboarding.mg_validate_spec(jsonb, text) TO eye_app, eye_commit;

/* THE CLASSIFICATION (deterministic; the record port and the execution re-check share it): the parsed rows (TypeScript parses the CSV and
   applies the transforms — `parseLegacy`) classified against the TARGET domain: a parse reason → rejected; a key shared by two rows → ambiguous
   (every row of it); the (system, key) held by an entity → would_match when that entity is an active organization of the same normal name, else
   conflict; else one active organization of the same normal name → would_match, several → conflict, none → would_create. Returns {rows, counts}. */
CREATE OR REPLACE FUNCTION onboarding.mg_classify(p_tenant uuid, p_domain uuid, p_system text, p_rows jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = onboarding, graph, pg_catalog, pg_temp AS $$
DECLARE r jsonb; v_out jsonb := '[]'::jsonb; v_disp text; v_reasons text[]; v_match uuid; v_holder record; v_n int; v_key text; v_name text;
        c_create int := 0; c_match int := 0; c_rej int := 0; c_amb int := 0; c_conf int := 0; c_mk int := 0; c_fc int := 0; c_bad int := 0;
BEGIN
  FOR r IN SELECT x FROM jsonb_array_elements(p_rows) x ORDER BY (x ->> 'row_no')::int LOOP
    v_key := nullif(btrim(coalesce(r ->> 'legacy_id', '')), ''); v_name := nullif(btrim(coalesce(r ->> 'name', '')), '');
    v_reasons := ARRAY(SELECT jsonb_array_elements_text(coalesce(r -> 'reasons', '[]'::jsonb)));
    v_match := NULL;
    IF cardinality(v_reasons) > 0 THEN
      v_disp := 'rejected';
      IF EXISTS (SELECT 1 FROM unnest(v_reasons) z WHERE z LIKE 'missing_key%') THEN c_mk := c_mk + 1; END IF;
      IF EXISTS (SELECT 1 FROM unnest(v_reasons) z WHERE z LIKE 'formula_cell%') THEN c_fc := c_fc + 1; END IF;
      IF EXISTS (SELECT 1 FROM unnest(v_reasons) z WHERE z LIKE 'bad_value%' OR z LIKE 'missing_name%') THEN c_bad := c_bad + 1; END IF;
    ELSIF v_key IS NULL OR v_name IS NULL THEN
      v_disp := 'rejected'; v_reasons := ARRAY[CASE WHEN v_key IS NULL THEN 'missing_key' ELSE 'missing_name' END];
      IF v_key IS NULL THEN c_mk := c_mk + 1; ELSE c_bad := c_bad + 1; END IF;
    ELSIF (SELECT count(*) FROM jsonb_array_elements(p_rows) y WHERE upper(btrim(coalesce(y ->> 'legacy_id', ''))) = upper(v_key)
             AND jsonb_array_length(coalesce(y -> 'reasons', '[]'::jsonb)) = 0) > 1 THEN
      v_disp := 'ambiguous'; v_reasons := ARRAY['duplicate_key: ' || v_key || ' names more than one legacy row'];
    ELSE
      SELECT e.entity_id, e.lifecycle_state, e.entity_type, e.normalized_name INTO v_holder
        FROM graph.entity_identifiers i JOIN graph.entities_current e ON e.entity_id = i.entity_id
       WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.system_key = p_system AND i.identifier_value = v_key;
      IF FOUND THEN
        IF v_holder.lifecycle_state = 'active' AND v_holder.entity_type = 'organization' AND v_holder.normalized_name = onboarding.mg_normal(v_name) THEN
          v_disp := 'would_match'; v_match := v_holder.entity_id; v_reasons := ARRAY['identifier_held: the legacy identifier already names this entity'];
        ELSE
          v_disp := 'conflict'; v_reasons := ARRAY[format('identifier_conflict: %s %s already identifies a %s %s entity of another name', p_system, v_key, v_holder.lifecycle_state, v_holder.entity_type)];
        END IF;
      ELSE
        SELECT count(*), min(e.entity_id::text)::uuid INTO v_n, v_match FROM graph.entities_current e
         WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.entity_type = 'organization' AND e.lifecycle_state = 'active' AND e.normalized_name = onboarding.mg_normal(v_name);
        IF v_n = 0 THEN v_disp := 'would_create'; v_match := NULL;
        ELSIF v_n = 1 THEN v_disp := 'would_match'; v_reasons := ARRAY['name_match: one active organization of this domain has the same normal name'];
        ELSE v_disp := 'conflict'; v_match := NULL; v_reasons := ARRAY[format('name_conflict: %s active organizations share the normal name', v_n)];
        END IF;
      END IF;
    END IF;
    CASE v_disp WHEN 'would_create' THEN c_create := c_create + 1; WHEN 'would_match' THEN c_match := c_match + 1; WHEN 'rejected' THEN c_rej := c_rej + 1;
                WHEN 'ambiguous' THEN c_amb := c_amb + 1; ELSE c_conf := c_conf + 1; END CASE;
    v_out := v_out || jsonb_build_array(jsonb_build_object('row_no', (r ->> 'row_no')::int, 'legacy_id', v_key, 'name', v_name, 'values', coalesce(r -> 'values', '{}'::jsonb),
      'disposition', v_disp, 'reasons', to_jsonb(v_reasons), 'formula_cells', coalesce(r -> 'formula_cells', '[]'::jsonb), 'match_entity_id', v_match));
  END LOOP;
  RETURN jsonb_build_object('rows', v_out, 'counts', jsonb_build_object('rows', jsonb_array_length(p_rows), 'mapped', c_create + c_match, 'would_create', c_create, 'would_match', c_match,
    'rejected', c_rej, 'rejected_missing_key', c_mk, 'rejected_formula_cell', c_fc, 'rejected_bad_value', c_bad, 'ambiguous', c_amb, 'conflict', c_conf));
END $$;
REVOKE ALL ON FUNCTION onboarding.mg_classify(uuid, uuid, text, jsonb) FROM PUBLIC;

/* Validate the parsed rows a caller hands in (shape and the mapping's fields only) and return them in canonical form (the input digest covers it). */
CREATE OR REPLACE FUNCTION onboarding.mg_canonical_rows(p_noun text, p_rows jsonb, p_spec jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = onboarding, pg_catalog, pg_temp AS $$
DECLARE r jsonb; v_out jsonb := '[]'::jsonb; v_fields text[]; v_k text; v_nos int[] := '{}'; v_no int;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION '% rejected (input): the evidence yields no legacy row', p_noun USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_rows) > 50000 THEN RAISE EXCEPTION '% rejected (input): a wave migrates at most 50000 rows', p_noun USING ERRCODE = '22023'; END IF;
  v_fields := ARRAY(SELECT x ->> 'field' FROM jsonb_array_elements(p_spec -> 'columns') x WHERE x ->> 'field' IS NOT NULL);
  FOR r IN SELECT x FROM jsonb_array_elements(p_rows) x LOOP
    v_no := (r ->> 'row_no')::int;
    IF v_no IS NULL OR v_no < 1 OR v_no = ANY (v_nos) THEN RAISE EXCEPTION '% rejected (input): every row carries a distinct row_no ≥ 1', p_noun USING ERRCODE = '22023'; END IF;
    v_nos := v_nos || v_no;
    IF jsonb_typeof(coalesce(r -> 'values', '{}'::jsonb)) <> 'object' THEN RAISE EXCEPTION '% rejected (input): row % values are an object', p_noun, v_no USING ERRCODE = '22023'; END IF;
    FOR v_k IN SELECT jsonb_object_keys(coalesce(r -> 'values', '{}'::jsonb)) LOOP
      IF NOT (v_k = ANY (v_fields)) THEN
        RAISE EXCEPTION '% rejected (contract_changed): row % carries field % that the approved mapping does not map — nothing outside the approved mapping version is migrated', p_noun, v_no, v_k USING ERRCODE = '22023';
      END IF;
    END LOOP;
    v_out := v_out || jsonb_build_array(jsonb_build_object('row_no', v_no, 'legacy_id', r -> 'legacy_id', 'name', r -> 'name', 'values', coalesce(r -> 'values', '{}'::jsonb),
      'reasons', coalesce(r -> 'reasons', '[]'::jsonb), 'formula_cells', coalesce(r -> 'formula_cells', '[]'::jsonb)));
  END LOOP;
  RETURN (SELECT jsonb_agg(x ORDER BY (x ->> 'row_no')::int) FROM jsonb_array_elements(v_out) x);
END $$;
GRANT EXECUTE ON FUNCTION onboarding.mg_canonical_rows(text, jsonb, jsonb) TO eye_app, eye_commit;

/* The columns the file has that the mapping neither maps nor ignores (unmapped — blocking), and the mapping's columns the file lacks (missing). */
CREATE OR REPLACE FUNCTION onboarding.mg_column_diff(p_columns text[], p_spec jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'unmapped', coalesce((SELECT jsonb_agg(c ORDER BY c) FROM unnest(p_columns) c WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_spec -> 'columns') x WHERE x ->> 'column' = c)), '[]'::jsonb),
    'missing', coalesce((SELECT jsonb_agg(x ->> 'column' ORDER BY x ->> 'column') FROM jsonb_array_elements(p_spec -> 'columns') x WHERE NOT ((x ->> 'column') = ANY (p_columns))), '[]'::jsonb))
$$;
GRANT EXECUTE ON FUNCTION onboarding.mg_column_diff(text[], jsonb) TO eye_app, eye_commit;

/* The evidence of the wave's source, its manifest and its bytes' digest (404 / 422 otherwise). */
CREATE OR REPLACE FUNCTION onboarding.mg_evidence(p_noun text, p_tenant uuid, p_domain uuid, p_source uuid, p_evidence uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = onboarding, objects, observation, pg_catalog, pg_temp AS $$
DECLARE e record; m observation.blob_manifests%ROWTYPE;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the legacy evidence of a migration wave');
  SELECT o.object_id, o.object_version, o.payload, o.lifecycle_state, o.content_digest INTO e FROM objects.canonical_objects o
   WHERE o.object_id = p_evidence AND o.object_type = 'EVD' AND o.tenant_id = p_tenant AND o.domain_id = p_domain ORDER BY o.object_version DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION '% rejected (unknown_evidence): % is not an evidence object of this domain', p_noun, coalesce(p_evidence::text, '<none>') USING ERRCODE = '23503'; END IF;
  IF e.lifecycle_state = 'withdrawn' THEN RAISE EXCEPTION '% rejected (evidence): evidence % is withdrawn; its bytes are not served', p_noun, p_evidence USING ERRCODE = '22023'; END IF;
  SELECT * INTO m FROM observation.blob_manifests x WHERE x.manifest_id = (e.payload ->> 'manifest_id')::uuid AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION '% rejected (evidence): evidence % has no manifest; no bytes are reachable', p_noun, p_evidence USING ERRCODE = '22023'; END IF;
  IF m.source_id IS DISTINCT FROM p_source THEN
    RAISE EXCEPTION '% rejected (evidence): evidence % was collected by another source, not the wave''s legacy upload source', p_noun, p_evidence USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = m.manifest_id) THEN
    RAISE EXCEPTION '% rejected (evidence): the bytes of evidence % have been governed-deleted', p_noun, p_evidence USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('evidence_object_id', e.object_id, 'evidence_version', e.object_version, 'manifest_id', m.manifest_id, 'locator', m.locator, 'vault', m.vault,
                            'bytes_digest', m.content_digest, 'byte_length', m.byte_length, 'media_type', coalesce(m.media_type_sniffed, m.media_type_declared),
                            'media_type_declared', m.media_type_declared, 'source_id', m.source_id, 'canonical_digest', e.content_digest);
END $$;
REVOKE ALL ON FUNCTION onboarding.mg_evidence(text, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.mg_evidence(text, uuid, uuid, uuid, uuid) TO eye_app, eye_commit;

/* WHAT HOLDS A CUTOVER (live; UX-66-005): the accountable owner of `data.migration` not resolved (IA-04-005 — never inferred); the rehearsal's
   reconciliation has blocking rows; its mapping is not the wave's approved version; a later rehearsal exists; the target domain is not draft. */
CREATE OR REPLACE FUNCTION onboarding.mg_cutover_blocking(p_tenant uuid, p_domain uuid, p_wave uuid, p_rehearsal uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = onboarding, service, pg_catalog, pg_temp AS $$
DECLARE r onboarding.migration_rehearsals%ROWTYPE; v_out jsonb := '[]'::jsonb; v_owner jsonb; v_approved int; v_latest int; v_status text;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'what holds a cutover');
  SELECT * INTO r FROM onboarding.migration_rehearsals x WHERE x.rehearsal_id = p_rehearsal AND x.wave_id = p_wave AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RETURN jsonb_build_array(jsonb_build_object('kind', 'unknown_rehearsal', 'route', 'no such rehearsal of the wave')); END IF;
  v_owner := service.owner_resolution(p_tenant, p_domain, 'data.migration');
  IF coalesce(v_owner ->> 'state', 'undeclared') <> 'resolved' THEN
    v_out := v_out || jsonb_build_array(jsonb_build_object('kind', 'owner_gap', 'responsibility', 'data.migration', 'state', coalesce(v_owner ->> 'state', 'undeclared'),
      'owner_role', v_owner ->> 'owner_role', 'reason', coalesce(v_owner ->> 'reason', 'no accountable owner is resolved'), 'escalation_path', v_owner ->> 'escalation_path',
      'route', 'the responsibility matrix (data.migration) — fill or name the accountable owner; the cutover stays held until it resolves'));
  END IF;
  IF r.blocking > 0 THEN
    v_out := v_out || jsonb_build_array(jsonb_build_object('kind', 'reconciliation', 'blocking', r.blocking, 'counts', r.counts, 'unmapped_columns', to_jsonb(r.unmapped_columns),
      'missing_columns', to_jsonb(r.missing_columns), 'route', 'remediate: a new mapping version or a corrected file, then rehearse again'));
  END IF;
  SELECT m.version INTO v_approved FROM onboarding.migration_mappings m WHERE m.wave_id = p_wave AND m.state = 'approved';
  IF v_approved IS NULL OR v_approved <> r.mapping_version THEN
    v_out := v_out || jsonb_build_array(jsonb_build_object('kind', 'mapping_not_approved', 'mapping_version', r.mapping_version, 'approved_version', v_approved,
      'route', 'the onboarding authority approves the mapping version the rehearsal ran, or the lead rehearses the approved one'));
  END IF;
  SELECT max(x.seq) INTO v_latest FROM onboarding.migration_rehearsals x WHERE x.wave_id = p_wave AND x.kind = 'rehearsal';
  IF v_latest IS DISTINCT FROM r.seq THEN
    v_out := v_out || jsonb_build_array(jsonb_build_object('kind', 'rehearsal_superseded', 'rehearsal_seq', r.seq, 'latest_seq', v_latest,
      'route', 'request the cutover on the latest rehearsal'));
  END IF;
  v_status := onboarding.mg_domain_status(p_tenant, p_domain);
  IF v_status IS DISTINCT FROM 'draft' THEN
    v_out := v_out || jsonb_build_array(jsonb_build_object('kind', 'domain_state', 'status', v_status, 'route', 'a cutover migrates into a DRAFT target domain'));
  END IF;
  RETURN v_out;
END $$;
REVOKE ALL ON FUNCTION onboarding.mg_cutover_blocking(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.mg_cutover_blocking(uuid, uuid, uuid, uuid) TO eye_app, eye_commit;

/* THE POST-CUTOVER OBSERVATION (read live from the graph): per approved staging row that would create or match, is the legacy identifier on
   an ACTIVE entity (the matched one for a match)? Unexpected identifiers of the wave's system (outside the plan) and failed rows count against
   equality. → {expected, observed, missing: [row_no], failed, unexpected, equal}. */
CREATE OR REPLACE FUNCTION onboarding.mg_post_observed(p_cutover uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = onboarding, graph, pg_catalog, pg_temp AS $$
DECLARE c onboarding.migration_cutovers%ROWTYPE; w onboarding.migration_waves%ROWTYPE; v_expected int; v_observed int; v_missing jsonb; v_failed int; v_unexpected int;
        v_created int; v_matched int;
BEGIN
  SELECT * INTO c FROM onboarding.migration_cutovers x WHERE x.cutover_id = p_cutover;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM observation.assert_read_scope(c.tenant_id, c.domain_id, 'a cutover''s post-cutover observation');
  SELECT * INTO w FROM onboarding.migration_waves x WHERE x.wave_id = c.wave_id;
  SELECT count(*) INTO v_expected FROM onboarding.migration_staging s WHERE s.rehearsal_id = c.rehearsal_id AND s.disposition IN ('would_create', 'would_match');
  WITH plan AS (
    SELECT s.row_no, s.legacy_id, s.disposition, s.match_entity_id FROM onboarding.migration_staging s
     WHERE s.rehearsal_id = c.rehearsal_id AND s.disposition IN ('would_create', 'would_match')
  ), seen AS (
    SELECT p.row_no, EXISTS (SELECT 1 FROM graph.entity_identifiers i JOIN graph.entities_current e ON e.entity_id = i.entity_id
                              WHERE i.tenant_id = c.tenant_id AND i.domain_id = c.domain_id AND i.system_key = w.identifier_system AND i.identifier_value = p.legacy_id
                                AND e.lifecycle_state = 'active' AND (p.disposition = 'would_create' OR e.entity_id = p.match_entity_id)) AS ok
      FROM plan p
  )
  SELECT count(*) FILTER (WHERE ok), coalesce(jsonb_agg(row_no ORDER BY row_no) FILTER (WHERE NOT ok), '[]'::jsonb) INTO v_observed, v_missing FROM seen;
  SELECT count(*) FILTER (WHERE x.outcome = 'failed'), count(*) FILTER (WHERE x.outcome = 'created'), count(*) FILTER (WHERE x.outcome = 'matched')
    INTO v_failed, v_created, v_matched FROM onboarding.migration_executed_rows x WHERE x.cutover_id = p_cutover;
  SELECT count(*) INTO v_unexpected FROM graph.entity_identifiers i
   WHERE i.tenant_id = c.tenant_id AND i.domain_id = c.domain_id AND i.system_key = w.identifier_system
     AND NOT EXISTS (SELECT 1 FROM onboarding.migration_staging s WHERE s.rehearsal_id = c.rehearsal_id AND s.disposition IN ('would_create', 'would_match') AND s.legacy_id = i.identifier_value);
  RETURN jsonb_build_object('expected', v_expected, 'observed', v_observed, 'missing', v_missing, 'failed', v_failed, 'unexpected', v_unexpected,
                            'created', v_created, 'matched', v_matched,
                            'equal', v_expected = v_observed AND v_failed = 0 AND v_unexpected = 0 AND c.state IN ('executed', 'verified', 'activated'));
END $$;
REVOKE ALL ON FUNCTION onboarding.mg_post_observed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.mg_post_observed(uuid) TO eye_app, eye_commit;

/* THE ROLLBACK PLAN (read live; never a write): the entities the cutover CREATED that are still active (to be RETIRED — append-only: the entity
   row is retired with an `entity.retired` event, its identifier stays as history), the identifiers it attached to MATCHED pre-existing entities
   (kept — append-only — and marked by the rollback's provenance), and the domain's activation (reverted to draft and re-recorded). */
CREATE OR REPLACE FUNCTION onboarding.mg_rollback_plan(p_cutover uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = onboarding, graph, tenancy, pg_catalog, pg_temp AS $$
DECLARE v_t uuid; v_d uuid;
BEGIN
  SELECT x.tenant_id, x.domain_id INTO v_t, v_d FROM onboarding.migration_cutovers x WHERE x.cutover_id = p_cutover;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM observation.assert_read_scope(v_t, v_d, 'a cutover''s rollback plan');
  RETURN (SELECT jsonb_build_object(
    'cutover_id', c.cutover_id, 'cutover_state', c.state,
    'retire', coalesce((SELECT jsonb_agg(jsonb_build_object('row_no', x.row_no, 'legacy_id', x.legacy_id, 'entity_id', x.entity_id) ORDER BY x.row_no)
                          FROM onboarding.migration_executed_rows x JOIN graph.entities_current e ON e.entity_id = x.entity_id
                         WHERE x.cutover_id = c.cutover_id AND x.outcome = 'created' AND e.lifecycle_state = 'active'), '[]'::jsonb),
    'keep_identifiers', coalesce((SELECT jsonb_agg(jsonb_build_object('row_no', x.row_no, 'legacy_id', x.legacy_id, 'entity_id', x.entity_id) ORDER BY x.row_no)
                          FROM onboarding.migration_executed_rows x WHERE x.cutover_id = c.cutover_id AND x.outcome = 'matched'), '[]'::jsonb),
    'domain', jsonb_build_object('status', d.status, 'revert_to', CASE WHEN d.status = 'active' THEN 'draft' ELSE d.status END),
    'note', 'append-only: created entities are retired (entity.retired), identifiers stay as history, the activation is reverted and re-recorded (domain.activation_reverted); the source evidence and the staging stay')
  FROM onboarding.migration_cutovers c JOIN tenancy.domains d ON d.id = c.domain_id WHERE c.cutover_id = p_cutover);
END $$;
REVOKE ALL ON FUNCTION onboarding.mg_rollback_plan(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.mg_rollback_plan(uuid) TO eye_app, eye_commit;

/* THE ACCEPTANCE CANDIDATE (PR-67-006): what an acceptance of the wave would bind — the exact mapping, rehearsals, post-cutover reconciliation,
   cutover, the configuration baseline (§ON's, when its table and a matching row exist; otherwise the given digest marked unverified), the live
   licence version (or `uncontracted`), the journeys and roles exercised, tenant/domain, deployment profile, the capability version, the period.
   Deterministic for the same records (no clock inside). */
CREATE OR REPLACE FUNCTION onboarding.mg_acceptance_candidate(p_tenant uuid, p_domain uuid, p_wave uuid, p_journeys text[], p_roles text[], p_baseline_digest text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = onboarding, commercial, tenancy, pg_catalog, pg_temp AS $$
DECLARE w onboarding.migration_waves%ROWTYPE; c onboarding.migration_cutovers%ROWTYPE; m onboarding.migration_mappings%ROWTYPE; p onboarding.programmes%ROWTYPE;
        lic record; v_base jsonb; v_ok boolean; v_rehearsals jsonb; v_post jsonb; v_dom tenancy.domains%ROWTYPE;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'an acceptance candidate');
  SELECT * INTO w FROM onboarding.migration_waves x WHERE x.wave_id = p_wave AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  SELECT * INTO c FROM onboarding.migration_cutovers x WHERE x.wave_id = p_wave AND x.state NOT IN ('rolled_back', 'superseded');
  SELECT * INTO m FROM onboarding.migration_mappings x WHERE x.wave_id = p_wave AND x.state = 'approved';
  SELECT * INTO p FROM onboarding.programmes x WHERE x.programme_id = w.programme_id AND x.superseded_at IS NULL;
  SELECT * INTO v_dom FROM tenancy.domains d WHERE d.id = p_domain;
  SELECT l.licence_id, l.version, l.state, l.package_key INTO lic FROM commercial.licences l WHERE l.tenant_id = p_tenant AND l.state <> 'superseded' ORDER BY l.version DESC LIMIT 1;
  SELECT coalesce(jsonb_agg(jsonb_build_object('rehearsal_id', r.rehearsal_id, 'seq', r.seq, 'mapping_version', r.mapping_version, 'plan_digest', r.plan_digest, 'blocking', r.blocking) ORDER BY r.seq), '[]'::jsonb)
    INTO v_rehearsals FROM onboarding.migration_rehearsals r WHERE r.wave_id = p_wave AND r.kind = 'rehearsal';
  SELECT jsonb_build_object('rehearsal_id', r.rehearsal_id, 'plan_digest', r.plan_digest, 'equal', r.equal, 'counts', r.counts) INTO v_post
    FROM onboarding.migration_rehearsals r WHERE r.rehearsal_id = c.post_rehearsal_id;
  IF p_baseline_digest IS NULL THEN v_base := jsonb_build_object('digest', NULL, 'verified', 'not_named');
  ELSIF to_regclass('onboarding.config_baselines') IS NULL THEN v_base := jsonb_build_object('digest', p_baseline_digest, 'verified', 'baseline_table_absent');
  ELSE
    BEGIN
      EXECUTE 'SELECT EXISTS (SELECT 1 FROM onboarding.config_baselines b WHERE b.tenant_id = $1 AND b.domain_id = $2 AND b.digest = $3)' INTO v_ok USING p_tenant, p_domain, p_baseline_digest;
      v_base := jsonb_build_object('digest', p_baseline_digest, 'verified', CASE WHEN v_ok THEN 'matched' ELSE 'no_such_baseline' END);
    EXCEPTION WHEN undefined_column THEN v_base := jsonb_build_object('digest', p_baseline_digest, 'verified', 'unverifiable');
    END;
  END IF;
  RETURN jsonb_build_object(
    'tenant_id', p_tenant, 'domain_id', p_domain, 'domain_name', v_dom.name, 'domain_status', v_dom.status,
    'programme', jsonb_build_object('programme_id', p.programme_id, 'version', p.version, 'digest', p.digest, 'deployment_profile', p.deployment_profile),
    'wave', jsonb_build_object('wave_id', w.wave_id, 'wave_key', w.wave_key, 'state', w.state, 'source_id', w.source_id, 'identifier_system', w.identifier_system),
    'mapping', CASE WHEN m.wave_id IS NULL THEN NULL ELSE jsonb_build_object('version', m.version, 'digest', m.digest, 'signature_id', m.signature_id) END,
    'rehearsals', v_rehearsals, 'post_cutover', v_post,
    'cutover', CASE WHEN c.cutover_id IS NULL THEN NULL ELSE jsonb_build_object('cutover_id', c.cutover_id, 'state', c.state, 'plan_digest', c.plan_digest, 'signature_id', c.signature_id,
                                                                                  'execution', c.execution, 'activated_at', c.activated_at) END,
    'baseline', v_base,
    'licence', CASE WHEN lic.licence_id IS NULL THEN jsonb_build_object('state', 'uncontracted') ELSE jsonb_build_object('licence_id', lic.licence_id, 'version', lic.version, 'state', lic.state, 'package_key', lic.package_key) END,
    'journeys', to_jsonb(coalesce(p_journeys, '{}')), 'roles', to_jsonb(coalesce(p_roles, '{}')),
    'deployment_profile', coalesce(p.deployment_profile, 'local-dev'), 'capability_version', 'B94 §MG (migration 0114)', 'consequence_class', 'C2',
    'period', jsonb_build_object('from', w.created_at, 'to', c.activated_at),
    'claim', 'demonstration');
END $$;
REVOKE ALL ON FUNCTION onboarding.mg_acceptance_candidate(uuid, uuid, uuid, text[], text[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.mg_acceptance_candidate(uuid, uuid, uuid, text[], text[], text) TO eye_app, eye_commit;

-- §MG.4 THE PORTS ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* WAVE OPEN (onboarding.wave.open; the implementation lead): the programme's TARGET domain (draft), an UPLOAD source contract of the target
   domain (the legacy input), the legacy identifier system and its authority. */
CREATE OR REPLACE FUNCTION onboarding.open_wave(p_wave uuid, p_tenant uuid, p_domain uuid, p_programme uuid, p_key text, p_title text, p_source uuid, p_system text,
                                                p_authority text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, observation, tenancy, pg_catalog, pg_temp AS $$
DECLARE p onboarding.programmes%ROWTYPE; s record;
BEGIN
  PERFORM observation.assert_authority(ARRAY['onboarding.wave.open']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM onboarding.mg_assert_actor('migration wave', p_actor);
  SELECT * INTO p FROM onboarding.programmes x WHERE x.programme_id = p_programme AND x.tenant_id = p_tenant AND x.superseded_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'migration wave rejected (unknown_programme): % is not an onboarding programme of this tenant', coalesce(p_programme::text, '<none>') USING ERRCODE = '23503'; END IF;
  IF p.state IN ('accepted', 'withdrawn') THEN RAISE EXCEPTION 'migration wave rejected (state): programme % is %', p.programme_key, p.state USING ERRCODE = '22023'; END IF;
  IF p.target_domain_id IS DISTINCT FROM p_domain THEN
    RAISE EXCEPTION 'migration wave rejected (target): the programme''s target domain is %, not this domain — a wave migrates into its programme''s target', coalesce(p.target_domain_id::text, '<none named>') USING ERRCODE = '22023';
  END IF;
  IF onboarding.mg_domain_status(p_tenant, p_domain) IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'migration wave rejected (state): the target domain is %, not draft — a governed migration fills a draft domain before it is activated', coalesce(onboarding.mg_domain_status(p_tenant, p_domain), '<none>') USING ERRCODE = '22023';
  END IF;
  SELECT c.source_id, c.connector_kind, c.lifecycle_state, c.source_key INTO s FROM observation.source_contracts_current c
   WHERE c.source_id = p_source AND c.tenant_id = p_tenant AND c.domain_id = p_domain ORDER BY c.contract_version DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'migration wave rejected (unknown_source): % is not a source contract of the target domain', coalesce(p_source::text, '<none>') USING ERRCODE = '23503'; END IF;
  IF s.connector_kind <> 'upload' THEN RAISE EXCEPTION 'migration wave rejected (source): the legacy input is an upload source contract (CSV evidence with custody); % is a % source', s.source_key, s.connector_kind USING ERRCODE = '22023'; END IF;
  IF p_key IS NULL OR p_key !~ '^[a-z][a-z0-9_.-]{2,62}$' THEN RAISE EXCEPTION 'migration wave rejected (key): a wave key is 3 to 63 characters of a-z, 0-9, _ . -' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_title, ''))) NOT BETWEEN 4 AND 200 THEN RAISE EXCEPTION 'migration wave rejected (title): a title is 4 to 200 characters' USING ERRCODE = '22023'; END IF;
  IF p_system IS NULL OR p_system !~ '^[a-z0-9][a-z0-9_.:-]{1,63}$' THEN RAISE EXCEPTION 'migration wave rejected (identifier): the legacy identifier system key is 2 to 64 characters of a-z, 0-9, _ . : -' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_authority, ''))) < 2 THEN RAISE EXCEPTION 'migration wave rejected (identifier): the identifier system names the authority that issues it' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM onboarding.migration_waves x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.wave_key = p_key) THEN
    RAISE EXCEPTION 'migration wave rejected (duplicate): wave % exists in this domain', p_key USING ERRCODE = '22023';
  END IF;
  INSERT INTO onboarding.migration_waves (wave_id, tenant_id, domain_id, programme_id, wave_key, title, source_id, identifier_system, identifier_authority, created_by, correlation_id)
  VALUES (p_wave, p_tenant, p_domain, p_programme, p_key, btrim(p_title), p_source, p_system, btrim(p_authority), p_actor, p_correlation);
  PERFORM onboarding.ledger('onboarding', p_tenant, p_domain, 'migration_wave', p_wave, 1, 'wave.opened', p_actor,
    jsonb_build_object('programme_id', p_programme, 'wave_key', p_key, 'source_id', p_source, 'identifier_system', p_system), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM onboarding.migration_waves x WHERE x.wave_id = p_wave);
END $$;
REVOKE ALL ON FUNCTION onboarding.open_wave(uuid, uuid, uuid, uuid, text, text, uuid, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.open_wave(uuid, uuid, uuid, uuid, text, text, uuid, text, text, uuid, uuid) TO eye_commit;

/* MAPPING PROPOSE (onboarding.mapping.propose; the lead): a new version (the spec validated against the closed lists); supersedes nothing
   until approved. */
CREATE OR REPLACE FUNCTION onboarding.propose_mapping(p_wave uuid, p_tenant uuid, p_domain uuid, p_spec jsonb, p_basis text, p_rationale text, p_expected_version int,
                                                      p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, observation, pg_catalog, pg_temp AS $$
DECLARE w onboarding.migration_waves%ROWTYPE; v_spec jsonb; v_next int; v_digest text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['onboarding.mapping.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM onboarding.mg_assert_actor('migration mapping', p_actor);
  w := onboarding.mg_wave('migration mapping', p_wave, p_tenant, p_domain);
  IF w.state NOT IN ('planned', 'rehearsing', 'reconciled') THEN RAISE EXCEPTION 'migration mapping rejected (state): wave % is % — its mapping is closed', w.wave_key, w.state USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_rationale, ''))) < 8 THEN RAISE EXCEPTION 'migration mapping rejected (rationale): a proposal states its rationale (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF coalesce(p_basis, 'manual') NOT IN ('manual', 'adopted_suggestions') THEN RAISE EXCEPTION 'migration mapping rejected (basis): manual or adopted_suggestions' USING ERRCODE = '22023'; END IF;
  SELECT coalesce(max(m.version), 0) + 1 INTO v_next FROM onboarding.migration_mappings m WHERE m.wave_id = p_wave;
  IF p_expected_version IS NOT NULL AND p_expected_version <> v_next - 1 THEN
    RAISE EXCEPTION 'migration mapping rejected (stale): the wave''s latest mapping is v%, not v%', v_next - 1, p_expected_version USING ERRCODE = '22023';
  END IF;
  v_spec := onboarding.mg_validate_spec(p_spec, w.identifier_system);
  v_digest := onboarding.digest(jsonb_build_object('wave_id', p_wave, 'version', v_next, 'spec', v_spec));
  -- an undecided earlier proposal is WITHDRAWN by the newer one (never decided on anyone's behalf)
  UPDATE onboarding.migration_mappings SET state = 'withdrawn', decision_reason = format('withdrawn: v%s proposed before a decision', v_next)
   WHERE wave_id = p_wave AND state = 'proposed';
  INSERT INTO onboarding.migration_mappings (wave_id, version, tenant_id, domain_id, spec, digest, basis, rationale, proposed_by, proposed_by_kind, correlation_id)
  VALUES (p_wave, v_next, p_tenant, p_domain, v_spec, v_digest, coalesce(p_basis, 'manual'), btrim(p_rationale), p_actor, coalesce(onboarding.principal_kind(p_actor), 'unknown'), p_correlation);
  PERFORM onboarding.ledger('onboarding', p_tenant, p_domain, 'migration_mapping', p_wave, v_next, 'mapping.proposed', p_actor,
    jsonb_build_object('digest', v_digest, 'basis', coalesce(p_basis, 'manual'), 'columns', jsonb_array_length(v_spec -> 'columns')), p_correlation);
  UPDATE onboarding.migration_waves SET updated_at = clock_timestamp() WHERE wave_id = p_wave;
  RETURN (SELECT to_jsonb(x) FROM onboarding.migration_mappings x WHERE x.wave_id = p_wave AND x.version = v_next);
END $$;
REVOKE ALL ON FUNCTION onboarding.propose_mapping(uuid, uuid, uuid, jsonb, text, text, int, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.propose_mapping(uuid, uuid, uuid, jsonb, text, text, int, uuid, uuid) TO eye_commit;

/* MAPPING DECIDE (onboarding.mapping.approve; the onboarding authority — assert_approver: a named human, never the proposer, never a lead,
   never an agent): approve | reject the PROPOSED version on its digest (stale → 409); an approval names its signature (kind mapping, subject =
   the wave, version = the mapping version, digest = the mapping digest, signer = the approver) and supersedes the prior approved version. */
CREATE OR REPLACE FUNCTION onboarding.decide_mapping(p_wave uuid, p_tenant uuid, p_domain uuid, p_version int, p_digest text, p_decision text, p_reason text, p_signature uuid,
                                                     p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, executive, observation, pg_catalog, pg_temp AS $$
DECLARE w onboarding.migration_waves%ROWTYPE; m onboarding.migration_mappings%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['onboarding.mapping.approve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM onboarding.mg_assert_actor('migration mapping', p_actor);
  w := onboarding.mg_wave('migration mapping', p_wave, p_tenant, p_domain);
  SELECT * INTO m FROM onboarding.migration_mappings x WHERE x.wave_id = p_wave AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'migration mapping rejected (unknown_mapping): wave % has no mapping v%', w.wave_key, p_version USING ERRCODE = '23503'; END IF;
  PERFORM onboarding.assert_approver('migration mapping', p_actor, p_tenant, p_domain, ARRAY['onboarding_authority'], m.proposed_by, 'approving a migration mapping');
  IF m.state <> 'proposed' THEN RAISE EXCEPTION 'migration mapping rejected (state): mapping v% is %, not proposed', p_version, m.state USING ERRCODE = '22023'; END IF;
  IF p_digest IS DISTINCT FROM m.digest THEN
    RAISE EXCEPTION 'migration mapping rejected (stale): the digest seen (%) is not mapping v%''s digest — read the mapping again', coalesce(left(p_digest, 12), '<none>'), p_version USING ERRCODE = '22023';
  END IF;
  IF p_decision NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'migration mapping rejected (decision): approve or reject' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'migration mapping rejected (reason): a decision states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_decision = 'approve' THEN
    IF p_signature IS NULL OR NOT EXISTS (SELECT 1 FROM executive.signatures s WHERE s.signature_id = p_signature AND s.subject_kind = 'mapping' AND s.subject_id = p_wave
                                            AND s.subject_version = p_version AND s.subject_digest = m.digest AND s.signer = p_actor) THEN
      RAISE EXCEPTION 'migration mapping rejected (signature): an approval is signed by the approver over the mapping''s digest' USING ERRCODE = '22023';
    END IF;
    UPDATE onboarding.migration_mappings SET state = 'superseded' WHERE wave_id = p_wave AND state = 'approved';
  END IF;
  UPDATE onboarding.migration_mappings SET state = CASE WHEN p_decision = 'approve' THEN 'approved' ELSE 'rejected' END, decided_by = p_actor, decided_at = clock_timestamp(),
         decision_reason = btrim(p_reason), signature_id = CASE WHEN p_decision = 'approve' THEN p_signature END
   WHERE wave_id = p_wave AND version = p_version;
  PERFORM onboarding.ledger('onboarding', p_tenant, p_domain, 'migration_mapping', p_wave, p_version, CASE WHEN p_decision = 'approve' THEN 'mapping.approved' ELSE 'mapping.rejected' END, p_actor,
    jsonb_build_object('digest', m.digest, 'reason', btrim(p_reason), 'signature_id', p_signature, 'proposed_by', m.proposed_by), p_correlation);
  UPDATE onboarding.migration_waves SET updated_at = clock_timestamp() WHERE wave_id = p_wave;
  RETURN (SELECT to_jsonb(x) FROM onboarding.migration_mappings x WHERE x.wave_id = p_wave AND x.version = p_version);
END $$;
REVOKE ALL ON FUNCTION onboarding.decide_mapping(uuid, uuid, uuid, int, text, text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.decide_mapping(uuid, uuid, uuid, int, text, text, text, uuid, uuid, uuid) TO eye_commit;

/* REHEARSAL (onboarding.rehearsal.run; the lead or an agent holding the lead's role — a dry run writes nothing outside the wave's staging): the
   evidence of the wave's source (its manifest's digest = the bytes the TypeScript parser read), the mapping version, the header and the parsed
   rows → classified, digested, recorded; the reconciliation report. A report with blocking rows HOLDS the wave (`onboarding.migration` item);
   a clean report against the APPROVED mapping makes it `reconciled` and closes the wave's item. */
CREATE OR REPLACE FUNCTION onboarding.record_rehearsal(p_rehearsal uuid, p_wave uuid, p_tenant uuid, p_domain uuid, p_evidence uuid, p_bytes_digest text, p_mapping_version int,
                                                       p_columns text[], p_rows jsonb, p_recorded_formula_cells text[], p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, observation, pg_catalog, pg_temp AS $$
DECLARE w onboarding.migration_waves%ROWTYPE; m onboarding.migration_mappings%ROWTYPE; v_ev jsonb; v_rows jsonb; v_cls jsonb; v_diff jsonb; v_seq int; v_input text; v_plan text;
        v_blocking int; v_counts jsonb; r jsonb; v_holds jsonb; v_item jsonb := NULL;
BEGIN
  PERFORM observation.assert_authority(ARRAY['onboarding.rehearsal.run']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM onboarding.mg_assert_actor('migration rehearsal', p_actor);
  w := onboarding.mg_wave('migration rehearsal', p_wave, p_tenant, p_domain);
  IF w.state NOT IN ('planned', 'rehearsing', 'reconciled') THEN RAISE EXCEPTION 'migration rehearsal rejected (state): wave % is % — rehearsals precede the cutover', w.wave_key, w.state USING ERRCODE = '22023'; END IF;
  SELECT * INTO m FROM onboarding.migration_mappings x WHERE x.wave_id = p_wave AND x.version = p_mapping_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'migration rehearsal rejected (unknown_mapping): wave % has no mapping v%', w.wave_key, p_mapping_version USING ERRCODE = '23503'; END IF;
  IF m.state NOT IN ('proposed', 'approved') THEN RAISE EXCEPTION 'migration rehearsal rejected (state): mapping v% is %', p_mapping_version, m.state USING ERRCODE = '22023'; END IF;
  v_ev := onboarding.mg_evidence('migration rehearsal', p_tenant, p_domain, w.source_id, p_evidence);
  IF p_bytes_digest IS DISTINCT FROM v_ev ->> 'bytes_digest' THEN
    RAISE EXCEPTION 'migration rehearsal rejected (evidence): the bytes read do not carry the manifest''s digest — the stored evidence is the only input' USING ERRCODE = '22023';
  END IF;
  IF p_columns IS NULL OR cardinality(p_columns) = 0 THEN RAISE EXCEPTION 'migration rehearsal rejected (input): the file has a header row' USING ERRCODE = '22023'; END IF;
  v_rows := onboarding.mg_canonical_rows('migration rehearsal', p_rows, m.spec);
  v_diff := onboarding.mg_column_diff(p_columns, m.spec);
  v_input := onboarding.digest(jsonb_build_object('mapping_digest', m.digest, 'bytes_digest', p_bytes_digest, 'columns', to_jsonb(p_columns), 'rows', v_rows));
  v_cls := onboarding.mg_classify(p_tenant, p_domain, w.identifier_system, v_rows);
  v_counts := (v_cls -> 'counts') || jsonb_build_object('unmapped_columns', jsonb_array_length(v_diff -> 'unmapped'), 'missing_columns', jsonb_array_length(v_diff -> 'missing'),
                                                         'formula_cells_recorded', cardinality(coalesce(p_recorded_formula_cells, '{}')));
  v_blocking := (v_counts ->> 'rejected')::int + (v_counts ->> 'ambiguous')::int + (v_counts ->> 'conflict')::int + jsonb_array_length(v_diff -> 'unmapped') + jsonb_array_length(v_diff -> 'missing');
  v_plan := onboarding.digest(jsonb_build_object('input_digest', v_input,
    'staging', (SELECT jsonb_agg(jsonb_build_object('row_no', x -> 'row_no', 'legacy_id', x -> 'legacy_id', 'disposition', x -> 'disposition', 'reasons', x -> 'reasons', 'match_entity_id', x -> 'match_entity_id')
                                 ORDER BY (x ->> 'row_no')::int) FROM jsonb_array_elements(v_cls -> 'rows') x),
    'unmapped', v_diff -> 'unmapped', 'missing', v_diff -> 'missing'));
  SELECT coalesce(max(x.seq), 0) + 1 INTO v_seq FROM onboarding.migration_rehearsals x WHERE x.wave_id = p_wave;
  INSERT INTO onboarding.migration_rehearsals (rehearsal_id, tenant_id, domain_id, wave_id, seq, kind, mapping_version, mapping_digest, mapping_state, input, columns, unmapped_columns, missing_columns,
                                               counts, blocking, input_digest, plan_digest, ran_by, ran_by_kind, correlation_id)
  VALUES (p_rehearsal, p_tenant, p_domain, p_wave, v_seq, 'rehearsal', m.version, m.digest, m.state,
          v_ev || jsonb_build_object('formula_cells_recorded', to_jsonb(coalesce(p_recorded_formula_cells, '{}'))), p_columns,
          ARRAY(SELECT jsonb_array_elements_text(v_diff -> 'unmapped')), ARRAY(SELECT jsonb_array_elements_text(v_diff -> 'missing')),
          v_counts, v_blocking, v_input, v_plan, p_actor, coalesce(onboarding.principal_kind(p_actor), 'unknown'), p_correlation);
  FOR r IN SELECT x FROM jsonb_array_elements(v_cls -> 'rows') x LOOP
    INSERT INTO onboarding.migration_staging (rehearsal_id, row_no, tenant_id, domain_id, legacy_id, name, "values", disposition, reasons, formula_cells, match_entity_id)
    VALUES (p_rehearsal, (r ->> 'row_no')::int, p_tenant, p_domain, r ->> 'legacy_id', r ->> 'name', r -> 'values', r ->> 'disposition',
            ARRAY(SELECT jsonb_array_elements_text(r -> 'reasons')), ARRAY(SELECT jsonb_array_elements_text(r -> 'formula_cells')), (r ->> 'match_entity_id')::uuid);
  END LOOP;
  -- the wave's hold: a blocking reconciliation holds it (and routes the closure); a clean one releases the reconciliation hold
  v_holds := coalesce((SELECT jsonb_agg(h) FROM jsonb_array_elements(w.held_reasons) h WHERE h ->> 'kind' NOT IN ('reconciliation', 'cutover')), '[]'::jsonb);
  IF v_blocking > 0 THEN
    v_holds := v_holds || jsonb_build_array(jsonb_build_object('kind', 'reconciliation', 'rehearsal_id', p_rehearsal, 'seq', v_seq, 'blocking', v_blocking, 'counts', v_counts,
      'unmapped_columns', v_diff -> 'unmapped', 'missing_columns', v_diff -> 'missing', 'route', 'remediate: a new mapping version or a corrected file, then rehearse again'));
    v_item := onboarding.mg_raise_once(p_tenant, p_domain, 'onboarding.migration', 'migration_wave', p_wave, format('Migration wave %s held: reconciliation of rehearsal %s has %s blocking rows (SYNTHETIC)', w.wave_key, v_seq, v_blocking),
                                       jsonb_build_array(jsonb_build_object('kind', 'reconciliation', 'blocking', v_blocking)), p_actor, p_correlation);
  ELSIF m.state = 'approved' THEN
    PERFORM executive.b33_close_items(p_tenant, p_domain, 'onboarding.migration', 'migration_wave', p_wave, format('rehearsal %s reconciles clean against the approved mapping v%s', v_seq, m.version), p_actor, p_correlation);
  END IF;
  UPDATE onboarding.migration_waves SET held_reasons = v_holds, updated_at = clock_timestamp(),
         state = CASE WHEN v_blocking = 0 AND m.state = 'approved' THEN 'reconciled' ELSE 'rehearsing' END
   WHERE wave_id = p_wave;
  -- a requested cutover on an earlier rehearsal is superseded by this one (it must be requested again on the latest); its items close
  PERFORM onboarding.mg_supersede_requested(p_tenant, p_domain, p_wave, format('superseded by rehearsal %s', v_seq), p_actor, p_correlation);
  PERFORM onboarding.ledger('onboarding', p_tenant, p_domain, 'migration_rehearsal', p_rehearsal, v_seq,
    CASE WHEN v_blocking > 0 THEN 'reconciliation.failed' ELSE 'rehearsal.reconciled' END, p_actor,
    jsonb_build_object('wave_id', p_wave, 'seq', v_seq, 'mapping_version', m.version, 'mapping_state', m.state, 'evidence', v_ev -> 'evidence_object_id', 'bytes_digest', p_bytes_digest,
                       'counts', v_counts, 'blocking', v_blocking, 'plan_digest', v_plan, 'input_digest', v_input), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM onboarding.migration_rehearsals x WHERE x.rehearsal_id = p_rehearsal) || jsonb_build_object('item', v_item, 'wave_held', v_blocking > 0);
END $$;
REVOKE ALL ON FUNCTION onboarding.record_rehearsal(uuid, uuid, uuid, uuid, uuid, text, int, text[], jsonb, text[], uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.record_rehearsal(uuid, uuid, uuid, uuid, uuid, text, int, text[], jsonb, text[], uuid, uuid) TO eye_commit;

/* (internal) Evaluate and RECORD a cutover's holds: the blocking list on the cutover (and the wave), the `onboarding.migration` item and — for an
   owner gap — the `responsibility.gap` item raised (once); released → the items closed. Returns the blocking list. */
CREATE OR REPLACE FUNCTION onboarding.mg_evaluate_cutover(c onboarding.migration_cutovers, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, executive, pg_catalog, pg_temp AS $$
DECLARE v_block jsonb; w onboarding.migration_waves%ROWTYPE;
BEGIN
  v_block := onboarding.mg_cutover_blocking(c.tenant_id, c.domain_id, c.wave_id, c.rehearsal_id);
  SELECT * INTO w FROM onboarding.migration_waves x WHERE x.wave_id = c.wave_id;
  UPDATE onboarding.migration_cutovers SET held_reasons = v_block, updated_at = clock_timestamp() WHERE cutover_id = c.cutover_id;
  UPDATE onboarding.migration_waves SET held_reasons = coalesce((SELECT jsonb_agg(h) FROM jsonb_array_elements(w.held_reasons) h WHERE h ->> 'kind' <> 'cutover'), '[]'::jsonb)
                                                     || CASE WHEN jsonb_array_length(v_block) > 0 THEN jsonb_build_array(jsonb_build_object('kind', 'cutover', 'cutover_id', c.cutover_id, 'blocking', v_block)) ELSE '[]'::jsonb END,
         updated_at = clock_timestamp()
   WHERE wave_id = c.wave_id;
  IF jsonb_array_length(v_block) > 0 THEN
    PERFORM onboarding.mg_raise_once(c.tenant_id, c.domain_id, 'onboarding.migration', 'cutover', c.cutover_id,
      format('Cutover of wave %s held: %s (SYNTHETIC)', w.wave_key, (SELECT string_agg(b ->> 'kind', ', ') FROM jsonb_array_elements(v_block) b)), v_block, p_actor, p_correlation);
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_block) b WHERE b ->> 'kind' = 'owner_gap') THEN
      PERFORM onboarding.mg_raise_once(c.tenant_id, c.domain_id, 'responsibility.gap', 'cutover', c.cutover_id,
        format('No resolved accountable owner for data.migration: the cutover of wave %s is held (SYNTHETIC)', w.wave_key),
        (SELECT jsonb_agg(b) FROM jsonb_array_elements(v_block) b WHERE b ->> 'kind' = 'owner_gap'), p_actor, p_correlation);
    ELSE
      PERFORM executive.b33_close_items(c.tenant_id, c.domain_id, 'responsibility.gap', 'cutover', c.cutover_id, 'the accountable owner of data.migration is resolved', p_actor, p_correlation);
    END IF;
  ELSE
    PERFORM executive.b33_close_items(c.tenant_id, c.domain_id, NULL, 'cutover', c.cutover_id, 'the cutover is released: no blocking item stands', p_actor, p_correlation);
  END IF;
  RETURN v_block;
END $$;
REVOKE ALL ON FUNCTION onboarding.mg_evaluate_cutover(onboarding.migration_cutovers, uuid, uuid) FROM PUBLIC;

/* CUTOVER REQUEST (onboarding.cutover.request; the lead): on the wave's LATEST rehearsal; the holds evaluated and recorded (a held request is
   recorded — the gap is visible and routed — and answered with its blocking list). */
CREATE OR REPLACE FUNCTION onboarding.request_cutover(p_cutover uuid, p_wave uuid, p_tenant uuid, p_domain uuid, p_rehearsal uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, observation, pg_catalog, pg_temp AS $$
DECLARE w onboarding.migration_waves%ROWTYPE; r onboarding.migration_rehearsals%ROWTYPE; c onboarding.migration_cutovers%ROWTYPE; v_block jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['onboarding.cutover.request']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM onboarding.mg_assert_actor('migration cutover', p_actor);
  w := onboarding.mg_wave('migration cutover', p_wave, p_tenant, p_domain);
  IF w.state NOT IN ('rehearsing', 'reconciled') THEN RAISE EXCEPTION 'migration cutover rejected (state): wave % is % — a cutover is requested on a rehearsed wave', w.wave_key, w.state USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM onboarding.migration_rehearsals x WHERE x.rehearsal_id = p_rehearsal AND x.wave_id = p_wave AND x.kind = 'rehearsal';
  IF NOT FOUND THEN RAISE EXCEPTION 'migration cutover rejected (unknown_rehearsal): % is not a rehearsal of wave %', coalesce(p_rehearsal::text, '<none>'), w.wave_key USING ERRCODE = '23503'; END IF;
  IF EXISTS (SELECT 1 FROM onboarding.migration_cutovers x WHERE x.wave_id = p_wave AND x.state NOT IN ('rolled_back', 'superseded', 'requested')) THEN
    RAISE EXCEPTION 'migration cutover rejected (state): wave % already has an approved cutover', w.wave_key USING ERRCODE = '22023';
  END IF;
  PERFORM onboarding.mg_supersede_requested(p_tenant, p_domain, p_wave, 'superseded by a newer cutover request', p_actor, p_correlation);
  INSERT INTO onboarding.migration_cutovers (cutover_id, tenant_id, domain_id, wave_id, rehearsal_id, plan_digest, mapping_version, requested_by, correlation_id)
  VALUES (p_cutover, p_tenant, p_domain, p_wave, p_rehearsal, r.plan_digest, r.mapping_version, p_actor, p_correlation);
  SELECT * INTO c FROM onboarding.migration_cutovers x WHERE x.cutover_id = p_cutover;
  v_block := onboarding.mg_evaluate_cutover(c, p_actor, p_correlation);
  PERFORM onboarding.ledger('onboarding', p_tenant, p_domain, 'cutover', p_cutover, 1, CASE WHEN jsonb_array_length(v_block) > 0 THEN 'cutover.held' ELSE 'cutover.requested' END, p_actor,
    jsonb_build_object('wave_id', p_wave, 'rehearsal_id', p_rehearsal, 'plan_digest', r.plan_digest, 'blocking', v_block), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM onboarding.migration_cutovers x WHERE x.cutover_id = p_cutover);
END $$;
REVOKE ALL ON FUNCTION onboarding.request_cutover(uuid, uuid, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.request_cutover(uuid, uuid, uuid, uuid, uuid, uuid, uuid) TO eye_commit;

/* CUTOVER RECHECK (onboarding.cutover.recheck; the lead or the authority): re-evaluate a requested cutover's holds — RELEASED when nothing
   blocks (the items close), still held otherwise (the list updated). */
CREATE OR REPLACE FUNCTION onboarding.recheck_cutover(p_cutover uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, observation, pg_catalog, pg_temp AS $$
DECLARE c onboarding.migration_cutovers%ROWTYPE; v_block jsonb; v_was boolean;
BEGIN
  PERFORM observation.assert_authority(ARRAY['onboarding.cutover.recheck']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM onboarding.mg_assert_actor('migration cutover', p_actor);
  c := onboarding.mg_cutover('migration cutover', p_cutover, p_tenant, p_domain);
  IF c.state <> 'requested' THEN RAISE EXCEPTION 'migration cutover rejected (state): cutover is % — only a requested cutover is re-checked', c.state USING ERRCODE = '22023'; END IF;
  v_was := c.held;
  v_block := onboarding.mg_evaluate_cutover(c, p_actor, p_correlation);
  PERFORM onboarding.ledger('onboarding', p_tenant, p_domain, 'cutover', p_cutover, 1,
    CASE WHEN jsonb_array_length(v_block) > 0 THEN 'cutover.held' WHEN v_was THEN 'cutover.released' ELSE 'cutover.rechecked' END, p_actor,
    jsonb_build_object('blocking', v_block), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM onboarding.migration_cutovers x WHERE x.cutover_id = p_cutover);
END $$;
REVOKE ALL ON FUNCTION onboarding.recheck_cutover(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.recheck_cutover(uuid, uuid, uuid, uuid, uuid) TO eye_commit;

/* CUTOVER APPROVE (onboarding.cutover.approve; the onboarding authority — assert_approver; the PEP's human gate too): on the rehearsal's PLAN
   DIGEST (stale → 409). The holds are re-evaluated LIVE: while one stands the approval is NOT given — the hold is RECORDED (returned, not
   thrown, so the hold, its items and its ledger event commit) and the route answers 409 `held` with the blocking list. Approved: signed
   (`cutover`), the wave `cutover_approved`, the items closed. */
CREATE OR REPLACE FUNCTION onboarding.approve_cutover(p_cutover uuid, p_tenant uuid, p_domain uuid, p_digest text, p_reason text, p_signature uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, executive, observation, pg_catalog, pg_temp AS $$
DECLARE c onboarding.migration_cutovers%ROWTYPE; v_block jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['onboarding.cutover.approve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM onboarding.mg_assert_actor('migration cutover', p_actor);
  c := onboarding.mg_cutover('migration cutover', p_cutover, p_tenant, p_domain);
  PERFORM onboarding.assert_approver('migration cutover', p_actor, p_tenant, p_domain, ARRAY['onboarding_authority'], c.requested_by, 'approving a cutover (the data transfer)');
  IF c.state <> 'requested' THEN RAISE EXCEPTION 'migration cutover rejected (state): the cutover is %, not awaiting approval', c.state USING ERRCODE = '22023'; END IF;
  IF p_digest IS DISTINCT FROM c.plan_digest THEN
    RAISE EXCEPTION 'migration cutover rejected (stale): the digest seen (%) is not the rehearsal''s plan digest — read the cutover again', coalesce(left(p_digest, 12), '<none>') USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'migration cutover rejected (reason): an approval states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  v_block := onboarding.mg_evaluate_cutover(c, p_actor, p_correlation);
  IF jsonb_array_length(v_block) > 0 THEN
    PERFORM onboarding.ledger('onboarding', p_tenant, p_domain, 'cutover', p_cutover, 1, 'cutover.held', p_actor,
      jsonb_build_object('blocking', v_block, 'approval_refused_by', p_actor), p_correlation);
    RETURN jsonb_build_object('held', true, 'blocking', v_block, 'cutover', (SELECT to_jsonb(x) FROM onboarding.migration_cutovers x WHERE x.cutover_id = p_cutover));
  END IF;
  IF p_signature IS NULL OR NOT EXISTS (SELECT 1 FROM executive.signatures s WHERE s.signature_id = p_signature AND s.subject_kind = 'cutover' AND s.subject_id = p_cutover
                                          AND s.subject_version = 1 AND s.subject_digest = c.plan_digest AND s.signer = p_actor) THEN
    RAISE EXCEPTION 'migration cutover rejected (signature): an approval is signed by the approver over the rehearsal''s plan digest' USING ERRCODE = '22023';
  END IF;
  UPDATE onboarding.migration_cutovers SET state = 'approved', approved_by = p_actor, approved_at = clock_timestamp(), approval_reason = btrim(p_reason), signature_id = p_signature,
         held_reasons = '[]'::jsonb, updated_at = clock_timestamp()
   WHERE cutover_id = p_cutover;
  UPDATE onboarding.migration_waves SET state = 'cutover_approved', updated_at = clock_timestamp() WHERE wave_id = c.wave_id;
  PERFORM onboarding.ledger('onboarding', p_tenant, p_domain, 'cutover', p_cutover, 1, 'cutover.approved', p_actor,
    jsonb_build_object('plan_digest', c.plan_digest, 'rehearsal_id', c.rehearsal_id, 'signature_id', p_signature, 'reason', btrim(p_reason), 'requested_by', c.requested_by), p_correlation);
  RETURN jsonb_build_object('held', false, 'blocking', '[]'::jsonb, 'cutover', (SELECT to_jsonb(x) FROM onboarding.migration_cutovers x WHERE x.cutover_id = p_cutover));
END $$;
REVOKE ALL ON FUNCTION onboarding.approve_cutover(uuid, uuid, uuid, text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.approve_cutover(uuid, uuid, uuid, text, text, uuid, uuid, uuid) TO eye_commit;

/* EXECUTION, step 1 (onboarding.cutover.execute; the lead or an agent — automation executes INSIDE the approved plan): the re-read of the
   evidence (its parsed rows and header) must reproduce the APPROVED rehearsal's input digest under the APPROVED mapping version — otherwise
   `contract_changed` (a row or column outside the approved mapping version is never migrated); reclassified against the target now, it must
   reproduce the plan digest — otherwise `stale` (the target changed since the rehearsal: rehearse again). The identifier system is registered. */
CREATE OR REPLACE FUNCTION onboarding.begin_execution(p_cutover uuid, p_tenant uuid, p_domain uuid, p_bytes_digest text, p_columns text[], p_rows jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, graph, observation, pg_catalog, pg_temp AS $$
DECLARE c onboarding.migration_cutovers%ROWTYPE; w onboarding.migration_waves%ROWTYPE; r onboarding.migration_rehearsals%ROWTYPE; m onboarding.migration_mappings%ROWTYPE;
        v_rows jsonb; v_input text; v_cls jsonb; v_diff jsonb; v_plan text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['onboarding.cutover.execute']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM onboarding.mg_assert_actor('migration cutover', p_actor);
  c := onboarding.mg_cutover('migration cutover', p_cutover, p_tenant, p_domain);
  IF c.state <> 'approved' THEN RAISE EXCEPTION 'migration cutover rejected (state): the cutover is %, not approved — automation executes only an approved plan', c.state USING ERRCODE = '22023'; END IF;
  w := onboarding.mg_wave('migration cutover', c.wave_id, p_tenant, p_domain);
  IF onboarding.mg_domain_status(p_tenant, p_domain) IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'migration cutover rejected (state): the target domain is no longer draft' USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM onboarding.migration_rehearsals x WHERE x.rehearsal_id = c.rehearsal_id;
  SELECT * INTO m FROM onboarding.migration_mappings x WHERE x.wave_id = c.wave_id AND x.state = 'approved';
  IF m.version IS DISTINCT FROM c.mapping_version OR m.digest IS DISTINCT FROM r.mapping_digest THEN
    RAISE EXCEPTION 'migration cutover rejected (contract_changed): the approved mapping is now v%, not the v% this cutover was approved on — nothing outside the approved mapping version is migrated', coalesce(m.version::text, 'none'), c.mapping_version USING ERRCODE = '22023';
  END IF;
  IF p_bytes_digest IS DISTINCT FROM r.input ->> 'bytes_digest' THEN
    RAISE EXCEPTION 'migration cutover rejected (contract_changed): the evidence read is not the rehearsed evidence (its bytes digest differs)' USING ERRCODE = '22023';
  END IF;
  v_diff := onboarding.mg_column_diff(coalesce(p_columns, '{}'), m.spec);
  IF jsonb_array_length(v_diff -> 'unmapped') > 0 OR jsonb_array_length(v_diff -> 'missing') > 0 THEN
    RAISE EXCEPTION 'migration cutover rejected (contract_changed): columns outside the approved mapping version (unmapped %, missing %)', v_diff -> 'unmapped', v_diff -> 'missing' USING ERRCODE = '22023';
  END IF;
  v_rows := onboarding.mg_canonical_rows('migration cutover', p_rows, m.spec);
  v_input := onboarding.digest(jsonb_build_object('mapping_digest', m.digest, 'bytes_digest', p_bytes_digest, 'columns', to_jsonb(p_columns), 'rows', v_rows));
  IF v_input IS DISTINCT FROM r.input_digest THEN
    RAISE EXCEPTION 'migration cutover rejected (contract_changed): the rows read now are not the rows the approved rehearsal read — nothing outside the approved plan is migrated' USING ERRCODE = '22023';
  END IF;
  v_cls := onboarding.mg_classify(p_tenant, p_domain, w.identifier_system, v_rows);
  v_plan := onboarding.digest(jsonb_build_object('input_digest', v_input,
    'staging', (SELECT jsonb_agg(jsonb_build_object('row_no', x -> 'row_no', 'legacy_id', x -> 'legacy_id', 'disposition', x -> 'disposition', 'reasons', x -> 'reasons', 'match_entity_id', x -> 'match_entity_id')
                                 ORDER BY (x ->> 'row_no')::int) FROM jsonb_array_elements(v_cls -> 'rows') x),
    'unmapped', v_diff -> 'unmapped', 'missing', v_diff -> 'missing'));
  IF v_plan IS DISTINCT FROM c.plan_digest THEN
    RAISE EXCEPTION 'migration cutover rejected (stale): the target domain changed since the approved rehearsal (the plan no longer reproduces its digest) — rehearse again and re-approve' USING ERRCODE = '22023';
  END IF;
  INSERT INTO graph.identifier_systems (scope, tenant_id, domain_id, system_key, authority, description, is_authoritative, registered_by, correlation_id)
  VALUES ('DOMAIN', p_tenant, p_domain, w.identifier_system, w.identifier_authority,
          format('the legacy identifiers of migration wave %s (B94 §MG); the identifier''s source claim reference is the approved cutover %s, its evidence the legacy file', w.wave_key, p_cutover),
          true, p_actor, p_correlation)
  ON CONFLICT (tenant_id, domain_id, system_key) DO NOTHING;
  RETURN jsonb_build_object('cutover_id', p_cutover, 'plan_digest', v_plan, 'rows', (SELECT count(*) FROM onboarding.migration_staging s WHERE s.rehearsal_id = c.rehearsal_id AND s.disposition IN ('would_create', 'would_match')),
                            'row_nos', (SELECT jsonb_agg(s.row_no ORDER BY s.row_no) FROM onboarding.migration_staging s WHERE s.rehearsal_id = c.rehearsal_id AND s.disposition IN ('would_create', 'would_match')));
END $$;
REVOKE ALL ON FUNCTION onboarding.begin_execution(uuid, uuid, uuid, text, text[], jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.begin_execution(uuid, uuid, uuid, text, text[], jsonb, uuid, uuid) TO eye_commit;

/* EXECUTION, step 2 — ONE ROW (called per row under its own savepoint, the B16 admit idiom): the row is named by its NUMBER only and read from
   the APPROVED staging — a row the approved plan does not migrate is refused `contract_changed`. would_create → a graph entity (organization)
   + the legacy identifier; would_match → the identifier attached to the matched entity; the PROVENANCE (wave, cutover, row, the mapped values —
   the risk rating among them) rides on the `entity.identified` event and the executed row. A port refusal (e.g. the identifier now names
   another entity) rolls back to the row's savepoint and is recorded by mg_record_failed_row. */
CREATE OR REPLACE FUNCTION onboarding.execute_row(p_cutover uuid, p_tenant uuid, p_domain uuid, p_row_no int, p_entity uuid, p_identifier uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, graph, observation, pg_catalog, pg_temp AS $$
DECLARE c onboarding.migration_cutovers%ROWTYPE; w onboarding.migration_waves%ROWTYPE; s onboarding.migration_staging%ROWTYPE; v_ent uuid; v_holder uuid; v_prov jsonb; v_ev uuid; v_outcome text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['onboarding.cutover.execute']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM onboarding.mg_assert_actor('migration cutover', p_actor);
  SELECT * INTO c FROM onboarding.migration_cutovers x WHERE x.cutover_id = p_cutover AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'migration cutover rejected (unknown_cutover): % is not a cutover of this domain', p_cutover USING ERRCODE = '23503'; END IF;
  IF c.state <> 'approved' THEN RAISE EXCEPTION 'migration cutover rejected (state): the cutover is %, not approved', c.state USING ERRCODE = '22023'; END IF;
  SELECT * INTO w FROM onboarding.migration_waves x WHERE x.wave_id = c.wave_id;
  SELECT * INTO s FROM onboarding.migration_staging x WHERE x.rehearsal_id = c.rehearsal_id AND x.row_no = p_row_no;
  IF NOT FOUND OR s.disposition NOT IN ('would_create', 'would_match') THEN
    RAISE EXCEPTION 'migration cutover rejected (contract_changed): row % is not a row the approved plan migrates (its disposition is %) — nothing outside the approved plan is written', p_row_no, coalesce(s.disposition, 'absent') USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM onboarding.migration_executed_rows x WHERE x.cutover_id = p_cutover AND x.row_no = p_row_no) THEN
    RAISE EXCEPTION 'migration cutover rejected (duplicate): row % is executed already', p_row_no USING ERRCODE = '22023';
  END IF;
  v_prov := jsonb_build_object('migrated_by', 'B94 §MG', 'wave_id', w.wave_id, 'wave_key', w.wave_key, 'cutover_id', p_cutover, 'rehearsal_id', c.rehearsal_id, 'plan_digest', c.plan_digest,
                               'mapping_version', c.mapping_version, 'row_no', p_row_no, 'legacy_id', s.legacy_id, 'values', s."values", 'synthetic', true,
                               'note', 'the legacy risk rating is provenance on the entity; an exposure is proposed by the domain''s risk owner after go-live, never by the migration');
  SELECT i.entity_id INTO v_holder FROM graph.entity_identifiers i WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.system_key = w.identifier_system AND i.identifier_value = s.legacy_id;
  IF s.disposition = 'would_create' THEN
    IF v_holder IS NOT NULL THEN RAISE EXCEPTION 'migration cutover rejected (conflict): % % now identifies another entity', w.identifier_system, s.legacy_id USING ERRCODE = '23505'; END IF;
    v_ent := p_entity; v_outcome := 'created';
    INSERT INTO graph.entities_current (entity_id, scope, tenant_id, domain_id, entity_type, canonical_name, normalized_name, lifecycle_state, created_by, correlation_id)
    VALUES (v_ent, 'DOMAIN', p_tenant, p_domain, 'organization', s.name, onboarding.mg_normal(s.name), 'active', p_actor, p_correlation);
    INSERT INTO graph.entity_events (event_id, scope, tenant_id, domain_id, entity_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, v_ent, 'entity.created', p_actor,
            jsonb_build_object('entity_type', 'organization', 'canonical_name', s.name, 'normalized_name', onboarding.mg_normal(s.name), 'split_from', NULL, 'migration', v_prov), p_correlation);
  ELSE
    v_ent := s.match_entity_id; v_outcome := 'matched';
    IF NOT EXISTS (SELECT 1 FROM graph.entities_current e WHERE e.entity_id = v_ent AND e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.lifecycle_state = 'active') THEN
      RAISE EXCEPTION 'migration cutover rejected (conflict): the matched entity % is no longer active', v_ent USING ERRCODE = '22023';
    END IF;
    IF v_holder IS NOT NULL AND v_holder <> v_ent THEN RAISE EXCEPTION 'migration cutover rejected (conflict): % % now identifies another entity', w.identifier_system, s.legacy_id USING ERRCODE = '23505'; END IF;
  END IF;
  IF v_holder IS NULL THEN
    INSERT INTO graph.entity_identifiers (identifier_id, scope, tenant_id, domain_id, entity_id, system_key, identifier_value, source_claim_object_id, source_evidence_object_id, recorded_by, correlation_id)
    VALUES (p_identifier, 'DOMAIN', p_tenant, p_domain, v_ent, w.identifier_system, s.legacy_id, p_cutover,
            (SELECT (r.input ->> 'evidence_object_id')::uuid FROM onboarding.migration_rehearsals r WHERE r.rehearsal_id = c.rehearsal_id), p_actor, p_correlation);
    v_ev := gen_random_uuid();
    INSERT INTO graph.entity_events (event_id, scope, tenant_id, domain_id, entity_id, event, actor_principal_id, details, correlation_id)
    VALUES (v_ev, 'DOMAIN', p_tenant, p_domain, v_ent, 'entity.identified', p_actor,
            jsonb_build_object('system_key', w.identifier_system, 'value', s.legacy_id, 'is_authoritative', true, 'claim_object_id', p_cutover, 'migration', v_prov), p_correlation);
  END IF;
  INSERT INTO onboarding.migration_executed_rows (cutover_id, row_no, tenant_id, domain_id, legacy_id, outcome, entity_id, identifier_id, provenance)
  VALUES (p_cutover, p_row_no, p_tenant, p_domain, s.legacy_id, v_outcome, v_ent, CASE WHEN v_holder IS NULL THEN p_identifier END, v_prov);
  RETURN jsonb_build_object('row_no', p_row_no, 'outcome', v_outcome, 'entity_id', v_ent);
END $$;
REVOKE ALL ON FUNCTION onboarding.execute_row(uuid, uuid, uuid, int, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.execute_row(uuid, uuid, uuid, int, uuid, uuid, uuid, uuid) TO eye_commit;

/* EXECUTION, a refused row (after its savepoint was rolled back): recorded `failed` with the port's reason — the post-cutover reconciliation
   will not be equal and the cutover is held (PR-67-005: never misrepresent state). */
CREATE OR REPLACE FUNCTION onboarding.record_failed_row(p_cutover uuid, p_tenant uuid, p_domain uuid, p_row_no int, p_reason text, p_actor uuid, p_correlation uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, observation, pg_catalog, pg_temp AS $$
DECLARE c onboarding.migration_cutovers%ROWTYPE; s onboarding.migration_staging%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['onboarding.cutover.execute']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM onboarding.mg_assert_actor('migration cutover', p_actor);
  SELECT * INTO c FROM onboarding.migration_cutovers x WHERE x.cutover_id = p_cutover AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'approved';
  IF NOT FOUND THEN RAISE EXCEPTION 'migration cutover rejected (state): % is not an approved cutover of this domain', p_cutover USING ERRCODE = '22023'; END IF;
  SELECT * INTO s FROM onboarding.migration_staging x WHERE x.rehearsal_id = c.rehearsal_id AND x.row_no = p_row_no AND x.disposition IN ('would_create', 'would_match');
  IF NOT FOUND THEN RAISE EXCEPTION 'migration cutover rejected (contract_changed): row % is not a row of the approved plan', p_row_no USING ERRCODE = '22023'; END IF;
  INSERT INTO onboarding.migration_executed_rows (cutover_id, row_no, tenant_id, domain_id, legacy_id, outcome, reason)
  VALUES (p_cutover, p_row_no, p_tenant, p_domain, s.legacy_id, 'failed', left(coalesce(nullif(btrim(p_reason), ''), 'the row was refused'), 500));
END $$;
REVOKE ALL ON FUNCTION onboarding.record_failed_row(uuid, uuid, uuid, int, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.record_failed_row(uuid, uuid, uuid, int, text, uuid, uuid) TO eye_commit;

/* EXECUTION, step 3: every approved row accounted for (executed or failed); the cutover `executed` with its counts; the wave `executed`. */
CREATE OR REPLACE FUNCTION onboarding.complete_execution(p_cutover uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, observation, pg_catalog, pg_temp AS $$
DECLARE c onboarding.migration_cutovers%ROWTYPE; v_plan int; v_done int; v_exec jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['onboarding.cutover.execute']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM onboarding.mg_assert_actor('migration cutover', p_actor);
  c := onboarding.mg_cutover('migration cutover', p_cutover, p_tenant, p_domain);
  IF c.state <> 'approved' THEN RAISE EXCEPTION 'migration cutover rejected (state): the cutover is %, not approved', c.state USING ERRCODE = '22023'; END IF;
  SELECT count(*) INTO v_plan FROM onboarding.migration_staging s WHERE s.rehearsal_id = c.rehearsal_id AND s.disposition IN ('would_create', 'would_match');
  SELECT count(*) INTO v_done FROM onboarding.migration_executed_rows x WHERE x.cutover_id = p_cutover;
  IF v_done <> v_plan THEN RAISE EXCEPTION 'migration cutover rejected (incomplete): % of % approved rows were executed or recorded', v_done, v_plan USING ERRCODE = '22023'; END IF;
  SELECT jsonb_build_object('rows', v_plan, 'created', count(*) FILTER (WHERE outcome = 'created'), 'matched', count(*) FILTER (WHERE outcome = 'matched'),
                            'failed', count(*) FILTER (WHERE outcome = 'failed')) INTO v_exec FROM onboarding.migration_executed_rows x WHERE x.cutover_id = p_cutover;
  UPDATE onboarding.migration_cutovers SET state = 'executed', executed_by = p_actor, executed_by_kind = coalesce(onboarding.principal_kind(p_actor), 'unknown'), executed_at = clock_timestamp(),
         execution = v_exec, updated_at = clock_timestamp() WHERE cutover_id = p_cutover;
  UPDATE onboarding.migration_waves SET state = 'executed', updated_at = clock_timestamp() WHERE wave_id = c.wave_id;
  PERFORM onboarding.ledger('onboarding', p_tenant, p_domain, 'cutover', p_cutover, 1, 'cutover.executed', p_actor,
    v_exec || jsonb_build_object('executed_by_kind', coalesce(onboarding.principal_kind(p_actor), 'unknown'), 'plan_digest', c.plan_digest), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM onboarding.migration_cutovers x WHERE x.cutover_id = p_cutover);
END $$;
REVOKE ALL ON FUNCTION onboarding.complete_execution(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.complete_execution(uuid, uuid, uuid, uuid, uuid) TO eye_commit;

/* POST-CUTOVER RECONCILIATION (onboarding.cutover.reconcile; the lead): observed (read live from the graph) against the approved rehearsal —
   EQUAL → the cutover and the wave `verified` (activation may follow); otherwise the cutover HELD (the missing rows, failures, unexpected
   identifiers listed; an `onboarding.migration` item). Recorded as a rehearsal row of kind post_cutover compared to the approved one. */
CREATE OR REPLACE FUNCTION onboarding.reconcile_cutover(p_rehearsal uuid, p_cutover uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, executive, observation, pg_catalog, pg_temp AS $$
DECLARE c onboarding.migration_cutovers%ROWTYPE; w onboarding.migration_waves%ROWTYPE; r onboarding.migration_rehearsals%ROWTYPE; v_obs jsonb; v_seq int; v_eq boolean; v_hold jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['onboarding.cutover.reconcile']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM onboarding.mg_assert_actor('migration cutover', p_actor);
  c := onboarding.mg_cutover('migration cutover', p_cutover, p_tenant, p_domain);
  IF c.state NOT IN ('executed', 'verified') THEN RAISE EXCEPTION 'migration cutover rejected (state): the cutover is % — the post-cutover reconciliation follows the execution', c.state USING ERRCODE = '22023'; END IF;
  w := onboarding.mg_wave('migration cutover', c.wave_id, p_tenant, p_domain);
  SELECT * INTO r FROM onboarding.migration_rehearsals x WHERE x.rehearsal_id = c.rehearsal_id;
  v_obs := onboarding.mg_post_observed(p_cutover);
  v_eq := (v_obs ->> 'equal')::boolean;
  SELECT coalesce(max(x.seq), 0) + 1 INTO v_seq FROM onboarding.migration_rehearsals x WHERE x.wave_id = c.wave_id;
  INSERT INTO onboarding.migration_rehearsals (rehearsal_id, tenant_id, domain_id, wave_id, seq, kind, input, counts, blocking, plan_digest, cutover_id, compared_to, equal, ran_by, ran_by_kind, correlation_id)
  VALUES (p_rehearsal, p_tenant, p_domain, c.wave_id, v_seq, 'post_cutover', jsonb_build_object('compared_plan_digest', c.plan_digest), v_obs,
          CASE WHEN v_eq THEN 0 ELSE greatest(1, (v_obs ->> 'expected')::int - (v_obs ->> 'observed')::int + (v_obs ->> 'failed')::int + (v_obs ->> 'unexpected')::int) END,
          onboarding.digest(jsonb_build_object('cutover', p_cutover, 'compared_to', c.rehearsal_id, 'observed', v_obs)), p_cutover, c.rehearsal_id, v_eq,
          p_actor, coalesce(onboarding.principal_kind(p_actor), 'unknown'), p_correlation);
  IF v_eq THEN
    UPDATE onboarding.migration_cutovers SET state = 'verified', verified_at = clock_timestamp(), post_rehearsal_id = p_rehearsal, held_reasons = '[]'::jsonb, updated_at = clock_timestamp()
     WHERE cutover_id = p_cutover;
    UPDATE onboarding.migration_waves SET state = 'verified', held_reasons = coalesce((SELECT jsonb_agg(h) FROM jsonb_array_elements(w.held_reasons) h WHERE h ->> 'kind' <> 'post_cutover'), '[]'::jsonb),
           updated_at = clock_timestamp() WHERE wave_id = c.wave_id;
    PERFORM executive.b33_close_items(p_tenant, p_domain, 'onboarding.migration', 'cutover', p_cutover, 'the post-cutover reconciliation equals the approved rehearsal', p_actor, p_correlation);
  ELSE
    v_hold := jsonb_build_array(jsonb_build_object('kind', 'post_cutover', 'post_rehearsal_id', p_rehearsal, 'observed', v_obs,
      'route', 'the domain stays draft: remediate (re-execute is not offered — roll back by plan and re-run the wave) or roll back'));
    UPDATE onboarding.migration_cutovers SET state = 'executed', post_rehearsal_id = p_rehearsal, held_reasons = v_hold, updated_at = clock_timestamp() WHERE cutover_id = p_cutover;
    UPDATE onboarding.migration_waves SET held_reasons = coalesce((SELECT jsonb_agg(h) FROM jsonb_array_elements(w.held_reasons) h WHERE h ->> 'kind' <> 'post_cutover'), '[]'::jsonb) || v_hold,
           state = 'executed', updated_at = clock_timestamp() WHERE wave_id = c.wave_id;
    PERFORM onboarding.mg_raise_once(p_tenant, p_domain, 'onboarding.migration', 'cutover', p_cutover,
      format('Cutover of wave %s held: the post-cutover reconciliation differs from the approved rehearsal (%s of %s observed, %s failed, %s unexpected) (SYNTHETIC)', w.wave_key,
             v_obs ->> 'observed', v_obs ->> 'expected', v_obs ->> 'failed', v_obs ->> 'unexpected'), v_hold, p_actor, p_correlation);
  END IF;
  PERFORM onboarding.ledger('onboarding', p_tenant, p_domain, 'cutover', p_cutover, 1, CASE WHEN v_eq THEN 'cutover.reconciled' ELSE 'cutover.held' END, p_actor,
    jsonb_build_object('post_rehearsal_id', p_rehearsal, 'observed', v_obs, 'equal', v_eq), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM onboarding.migration_rehearsals x WHERE x.rehearsal_id = p_rehearsal) || jsonb_build_object('cutover_state', CASE WHEN v_eq THEN 'verified' ELSE 'executed' END, 'held', NOT v_eq);
END $$;
REVOKE ALL ON FUNCTION onboarding.reconcile_cutover(uuid, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.reconcile_cutover(uuid, uuid, uuid, uuid, uuid, uuid) TO eye_commit;

/* DOMAIN ACTIVATION (D4; action tenancy.domain.activate — the tenancy authority: a tenant admin at TENANT scope, the 0019 idiom): refused
   unless the domain is DRAFT and its wave's cutover is EXECUTED and its post-cutover reconciliation EQUALS the approved rehearsal (re-read
   LIVE here, never trusted from a flag). Lifecycle `domain.activated` (with the cutover, wave and digests); the cutover and wave `activated`. */
CREATE OR REPLACE FUNCTION tenancy.activate_domain(p_domain uuid, p_tenant uuid, p_cutover uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tenancy, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE d tenancy.domains%ROWTYPE; c onboarding.migration_cutovers%ROWTYPE; v_obs jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['tenancy.domain.activate']);
  PERFORM ctx.assert_bound_target(p_domain::text);
  PERFORM onboarding.assert_tenant(p_tenant, 'migration cutover');
  PERFORM onboarding.mg_assert_actor('migration cutover', p_actor);
  SELECT * INTO d FROM tenancy.domains x WHERE x.id = p_domain AND x.tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'migration cutover rejected (unknown_domain): % is not a domain of this tenant', p_domain USING ERRCODE = '23503'; END IF;
  IF d.status <> 'draft' THEN RAISE EXCEPTION 'migration cutover rejected (state): domain % is %, not draft', d.name, d.status USING ERRCODE = '22023'; END IF;
  SELECT * INTO c FROM onboarding.migration_cutovers x WHERE x.cutover_id = p_cutover AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'migration cutover rejected (unknown_cutover): % is not a cutover of domain %', p_cutover, d.name USING ERRCODE = '23503'; END IF;
  IF c.state NOT IN ('executed', 'verified') THEN
    RAISE EXCEPTION 'migration cutover rejected (state): the cutover is % — a domain is activated only after its cutover is executed and reconciled', c.state USING ERRCODE = '22023';
  END IF;
  v_obs := onboarding.mg_post_observed(p_cutover);
  IF c.state <> 'verified' OR NOT (v_obs ->> 'equal')::boolean THEN
    RAISE EXCEPTION 'migration cutover rejected (held): the post-cutover reconciliation does not equal the approved rehearsal (% of % observed, % failed, % unexpected) — the domain stays draft',
      v_obs ->> 'observed', v_obs ->> 'expected', v_obs ->> 'failed', v_obs ->> 'unexpected' USING ERRCODE = '22023';
  END IF;
  UPDATE tenancy.domains SET status = 'active', activated_at = clock_timestamp() WHERE id = p_domain;
  INSERT INTO tenancy.lifecycle_events (id, scope, tenant_id, domain_id, event, actor, details)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, 'domain.activated', ctx.bound_actor(),
          jsonb_build_object('name', d.name, 'cutover_id', p_cutover, 'wave_id', c.wave_id, 'plan_digest', c.plan_digest, 'post_rehearsal_id', c.post_rehearsal_id, 'observed', v_obs, 'by', 'B94 §MG'));
  UPDATE onboarding.migration_cutovers SET state = 'activated', activated_at = clock_timestamp(), updated_at = clock_timestamp() WHERE cutover_id = p_cutover;
  UPDATE onboarding.migration_waves SET state = 'activated', updated_at = clock_timestamp() WHERE wave_id = c.wave_id;
  PERFORM onboarding.ledger('onboarding', p_tenant, p_domain, 'domain', p_domain, NULL, 'domain.activated', p_actor,
    jsonb_build_object('cutover_id', p_cutover, 'wave_id', c.wave_id, 'plan_digest', c.plan_digest, 'observed', v_obs), p_correlation);
  RETURN jsonb_build_object('domain_id', p_domain, 'status', 'active', 'cutover_id', p_cutover, 'observed', v_obs);
END $$;
REVOKE ALL ON FUNCTION tenancy.activate_domain(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.activate_domain(uuid, uuid, uuid, uuid, uuid) TO eye_commit;

/* ROLLBACK REHEARSAL (onboarding.rollback.rehearse; the lead): the plan read live and RECORDED with its digest (JRN-23's rollback proof) — no
   graph write. */
CREATE OR REPLACE FUNCTION onboarding.rehearse_rollback(p_rollback uuid, p_cutover uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, observation, pg_catalog, pg_temp AS $$
DECLARE c onboarding.migration_cutovers%ROWTYPE; v_plan jsonb; v_digest text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['onboarding.rollback.rehearse']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM onboarding.mg_assert_actor('migration rollback', p_actor);
  c := onboarding.mg_cutover('migration rollback', p_cutover, p_tenant, p_domain);
  IF c.state NOT IN ('executed', 'verified', 'activated') THEN RAISE EXCEPTION 'migration rollback rejected (state): the cutover is % — nothing was migrated to roll back', c.state USING ERRCODE = '22023'; END IF;
  v_plan := onboarding.mg_rollback_plan(p_cutover);
  v_digest := onboarding.digest(v_plan);
  INSERT INTO onboarding.migration_rollbacks (rollback_id, tenant_id, domain_id, cutover_id, kind, plan, digest, recorded_by, correlation_id)
  VALUES (p_rollback, p_tenant, p_domain, p_cutover, 'rehearsal', v_plan, v_digest, p_actor, p_correlation);
  PERFORM onboarding.ledger('onboarding', p_tenant, p_domain, 'rollback', p_rollback, 1, 'rollback.rehearsed', p_actor,
    jsonb_build_object('cutover_id', p_cutover, 'digest', v_digest, 'retire', jsonb_array_length(v_plan -> 'retire'), 'keep_identifiers', jsonb_array_length(v_plan -> 'keep_identifiers')), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM onboarding.migration_rollbacks x WHERE x.rollback_id = p_rollback);
END $$;
REVOKE ALL ON FUNCTION onboarding.rehearse_rollback(uuid, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.rehearse_rollback(uuid, uuid, uuid, uuid, uuid, uuid) TO eye_commit;

/* ROLLBACK EXECUTION (onboarding.rollback.execute; the onboarding authority — assert_approver, never the rehearsal's author, never a lead or an
   agent): on the rollback REHEARSAL's digest, re-read live (stale → 409). The created entities RETIRED (entity.retired; append-only — the
   rows, identifiers, staging and source evidence stay as history), an ACTIVE domain reverted to draft and RE-RECORDED
   (domain.activation_reverted), the cutover and wave `rolled_back`, the items closed. Terminal for the wave (its identifiers stay held). */
CREATE OR REPLACE FUNCTION onboarding.execute_rollback(p_rollback uuid, p_rehearsal uuid, p_cutover uuid, p_tenant uuid, p_domain uuid, p_digest text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, graph, tenancy, executive, observation, ctx, pg_catalog, pg_temp AS $$
DECLARE c onboarding.migration_cutovers%ROWTYPE; b onboarding.migration_rollbacks%ROWTYPE; v_plan jsonb; v_digest text; e jsonb; v_status text; v_n int := 0;
BEGIN
  PERFORM observation.assert_authority(ARRAY['onboarding.rollback.execute']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM onboarding.mg_assert_actor('migration rollback', p_actor);
  c := onboarding.mg_cutover('migration rollback', p_cutover, p_tenant, p_domain);
  SELECT * INTO b FROM onboarding.migration_rollbacks x WHERE x.rollback_id = p_rehearsal AND x.cutover_id = p_cutover AND x.kind = 'rehearsal';
  IF NOT FOUND THEN RAISE EXCEPTION 'migration rollback rejected (unknown_rollback): % is not a rollback rehearsal of this cutover', coalesce(p_rehearsal::text, '<none>') USING ERRCODE = '23503'; END IF;
  PERFORM onboarding.assert_approver('migration rollback', p_actor, p_tenant, p_domain, ARRAY['onboarding_authority'], b.recorded_by, 'executing a rollback');
  IF c.state NOT IN ('executed', 'verified', 'activated') THEN RAISE EXCEPTION 'migration rollback rejected (state): the cutover is %', c.state USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'migration rollback rejected (reason): a rollback states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  v_plan := onboarding.mg_rollback_plan(p_cutover);
  v_digest := onboarding.digest(v_plan);
  IF p_digest IS DISTINCT FROM b.digest OR v_digest IS DISTINCT FROM b.digest THEN
    RAISE EXCEPTION 'migration rollback rejected (stale): the rollback plan is no longer the rehearsed one (or the digest seen differs) — rehearse the rollback again' USING ERRCODE = '22023';
  END IF;
  FOR e IN SELECT x FROM jsonb_array_elements(v_plan -> 'retire') x LOOP
    UPDATE graph.entities_current SET lifecycle_state = 'retired', updated_at = clock_timestamp()
     WHERE entity_id = (e ->> 'entity_id')::uuid AND tenant_id = p_tenant AND domain_id = p_domain AND lifecycle_state = 'active';
    INSERT INTO graph.entity_events (event_id, scope, tenant_id, domain_id, entity_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, (e ->> 'entity_id')::uuid, 'entity.retired', p_actor,
            jsonb_build_object('reason', 'migration rollback', 'rollback_id', p_rollback, 'cutover_id', p_cutover, 'row_no', e -> 'row_no', 'legacy_id', e -> 'legacy_id'), p_correlation);
    v_n := v_n + 1;
  END LOOP;
  SELECT d.status INTO v_status FROM tenancy.domains d WHERE d.id = p_domain FOR UPDATE;
  IF v_status = 'active' THEN
    UPDATE tenancy.domains SET status = 'draft' WHERE id = p_domain;
    INSERT INTO tenancy.lifecycle_events (id, scope, tenant_id, domain_id, event, actor, details)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, 'domain.activation_reverted', ctx.bound_actor(),
            jsonb_build_object('rollback_id', p_rollback, 'cutover_id', p_cutover, 'reason', btrim(p_reason), 'by', 'B94 §MG'));
  END IF;
  INSERT INTO onboarding.migration_rollbacks (rollback_id, tenant_id, domain_id, cutover_id, kind, plan, digest, rehearsal_of, reason, recorded_by, correlation_id)
  VALUES (p_rollback, p_tenant, p_domain, p_cutover, 'executed', v_plan || jsonb_build_object('retired', v_n, 'domain_reverted', v_status = 'active'), v_digest, p_rehearsal, btrim(p_reason), p_actor, p_correlation);
  UPDATE onboarding.migration_cutovers SET state = 'rolled_back', rolled_back_at = clock_timestamp(), held_reasons = '[]'::jsonb, updated_at = clock_timestamp() WHERE cutover_id = p_cutover;
  UPDATE onboarding.migration_waves SET state = 'rolled_back', held_reasons = '[]'::jsonb, updated_at = clock_timestamp() WHERE wave_id = c.wave_id;
  PERFORM executive.b33_close_items(p_tenant, p_domain, NULL, 'cutover', p_cutover, 'the cutover is rolled back by plan', p_actor, p_correlation);
  PERFORM executive.b33_close_items(p_tenant, p_domain, NULL, 'migration_wave', c.wave_id, 'the wave is rolled back by plan', p_actor, p_correlation);
  PERFORM onboarding.ledger('onboarding', p_tenant, p_domain, 'rollback', p_rollback, 1, 'rollback.executed', p_actor,
    jsonb_build_object('cutover_id', p_cutover, 'rehearsal_of', p_rehearsal, 'digest', v_digest, 'retired', v_n, 'domain_reverted', v_status = 'active', 'reason', btrim(p_reason)), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM onboarding.migration_rollbacks x WHERE x.rollback_id = p_rollback);
END $$;
REVOKE ALL ON FUNCTION onboarding.execute_rollback(uuid, uuid, uuid, uuid, uuid, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.execute_rollback(uuid, uuid, uuid, uuid, uuid, text, text, uuid, uuid) TO eye_commit;

/* ACCEPTANCE (onboarding.acceptance.decide; the onboarding authority — assert_approver, never the lead who executed, never an agent): on the
   CANDIDATE's digest (stale → 409); `accepted` requires the domain ACTIVATED through this wave's verified cutover, is SIGNED (`acceptance`),
   marks the wave `accepted` and writes the programme's NEXT VERSION `accepted` (§MG writes it — D5); `withheld` records the refusal and keeps
   the prior safe operation (the domain and the wave unchanged — WS-20). claim = demonstration, always. */
CREATE OR REPLACE FUNCTION onboarding.decide_acceptance(p_acceptance uuid, p_wave uuid, p_tenant uuid, p_domain uuid, p_decision text, p_journeys text[], p_roles text[], p_baseline_digest text,
                                                        p_digest text, p_reason text, p_signature uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, executive, identity, observation, pg_catalog, pg_temp AS $$
DECLARE w onboarding.migration_waves%ROWTYPE; c onboarding.migration_cutovers%ROWTYPE; p onboarding.programmes%ROWTYPE; v_cand jsonb; v_digest text; v_j text; v_r text; v_plan jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['onboarding.acceptance.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM onboarding.mg_assert_actor('onboarding acceptance', p_actor);
  w := onboarding.mg_wave('onboarding acceptance', p_wave, p_tenant, p_domain);
  SELECT * INTO c FROM onboarding.migration_cutovers x WHERE x.wave_id = p_wave AND x.state NOT IN ('rolled_back', 'superseded');
  PERFORM onboarding.assert_approver('onboarding acceptance', p_actor, p_tenant, p_domain, ARRAY['onboarding_authority'], coalesce(c.executed_by, w.created_by), 'accepting a migration');
  IF p_decision NOT IN ('accept', 'withhold') THEN RAISE EXCEPTION 'onboarding acceptance rejected (decision): accept or withhold' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'onboarding acceptance rejected (reason): a decision states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_journeys IS NULL OR cardinality(p_journeys) = 0 THEN RAISE EXCEPTION 'onboarding acceptance rejected (journeys): an acceptance names the journeys it accepts (JRN-nn)' USING ERRCODE = '22023'; END IF;
  FOREACH v_j IN ARRAY p_journeys LOOP
    IF v_j !~ '^JRN-[0-9]{2}$' THEN RAISE EXCEPTION 'onboarding acceptance rejected (journeys): % is not a journey id (JRN-nn)', v_j USING ERRCODE = '22023'; END IF;
  END LOOP;
  IF p_roles IS NULL OR cardinality(p_roles) = 0 THEN RAISE EXCEPTION 'onboarding acceptance rejected (roles): an acceptance names the roles exercised' USING ERRCODE = '22023'; END IF;
  FOREACH v_r IN ARRAY p_roles LOOP
    IF NOT EXISTS (SELECT 1 FROM identity.roles x WHERE x.code = v_r) THEN RAISE EXCEPTION 'onboarding acceptance rejected (roles): % is not a role', v_r USING ERRCODE = '22023'; END IF;
  END LOOP;
  IF p_baseline_digest IS NOT NULL AND p_baseline_digest !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'onboarding acceptance rejected (baseline): a baseline digest is 64 hex characters' USING ERRCODE = '22023'; END IF;
  IF p_decision = 'accept' THEN
    IF w.state <> 'activated' OR c.cutover_id IS NULL OR c.state <> 'activated' OR onboarding.mg_domain_status(p_tenant, p_domain) IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'onboarding acceptance rejected (state): wave % is % — acceptance follows a verified cutover and the domain''s activation', w.wave_key, w.state USING ERRCODE = '22023';
    END IF;
    IF NOT (onboarding.mg_post_observed(c.cutover_id) ->> 'equal')::boolean THEN
      RAISE EXCEPTION 'onboarding acceptance rejected (held): the migrated records no longer equal the approved rehearsal' USING ERRCODE = '22023';
    END IF;
  ELSIF w.state IN ('accepted', 'withdrawn') THEN
    RAISE EXCEPTION 'onboarding acceptance rejected (state): wave % is %', w.wave_key, w.state USING ERRCODE = '22023';
  END IF;
  v_cand := onboarding.mg_acceptance_candidate(p_tenant, p_domain, p_wave, p_journeys, p_roles, p_baseline_digest);
  v_digest := onboarding.digest(v_cand);
  IF p_digest IS DISTINCT FROM v_digest THEN
    RAISE EXCEPTION 'onboarding acceptance rejected (stale): the digest seen (%) is not the acceptance candidate''s — read the candidate again', coalesce(left(p_digest, 12), '<none>') USING ERRCODE = '22023';
  END IF;
  IF p_decision = 'accept' AND (p_signature IS NULL OR NOT EXISTS (SELECT 1 FROM executive.signatures s WHERE s.signature_id = p_signature AND s.subject_kind = 'acceptance' AND s.subject_id = p_acceptance
                                                                     AND s.subject_version = 1 AND s.subject_digest = v_digest AND s.signer = p_actor)) THEN
    RAISE EXCEPTION 'onboarding acceptance rejected (signature): an acceptance is signed by the accepting authority over the candidate''s digest' USING ERRCODE = '22023';
  END IF;
  INSERT INTO onboarding.migration_acceptances (acceptance_id, tenant_id, domain_id, wave_id, cutover_id, programme_id, decision, bound, digest, reason, decided_by, signature_id, correlation_id)
  VALUES (p_acceptance, p_tenant, p_domain, p_wave, c.cutover_id, w.programme_id, CASE WHEN p_decision = 'accept' THEN 'accepted' ELSE 'withheld' END, v_cand, v_digest, btrim(p_reason), p_actor,
          CASE WHEN p_decision = 'accept' THEN p_signature END, p_correlation);
  IF p_decision = 'accept' THEN
    UPDATE onboarding.migration_waves SET state = 'accepted', updated_at = clock_timestamp() WHERE wave_id = p_wave;
    SELECT * INTO p FROM onboarding.programmes x WHERE x.programme_id = w.programme_id AND x.superseded_at IS NULL FOR UPDATE;
    IF FOUND AND p.state NOT IN ('accepted', 'withdrawn') THEN
      v_plan := p.plan || jsonb_build_object('accepted_by_migration', jsonb_build_object('acceptance_id', p_acceptance, 'wave_id', p_wave, 'digest', v_digest, 'claim', 'demonstration'));
      UPDATE onboarding.programmes SET superseded_at = clock_timestamp() WHERE programme_id = p.programme_id AND version = p.version;
      INSERT INTO onboarding.programmes (programme_id, version, tenant_id, programme_key, title, target_domain_id, deployment_profile, owner_principal_id, state, held_reasons, plan, digest,
                                         created_by, correlation_id)
      VALUES (p.programme_id, p.version + 1, p.tenant_id, p.programme_key, p.title, p.target_domain_id, p.deployment_profile, p.owner_principal_id, 'accepted', '[]'::jsonb, v_plan,
              onboarding.digest(jsonb_build_object('programme_id', p.programme_id, 'version', p.version + 1, 'programme_key', p.programme_key, 'title', p.title, 'target_domain_id', p.target_domain_id,
                                                   'deployment_profile', p.deployment_profile, 'owner', p.owner_principal_id, 'state', 'accepted', 'plan', v_plan)),
              p_actor, p_correlation);
      PERFORM onboarding.ledger('onboarding', p_tenant, NULL, 'onboarding_programme', p.programme_id, p.version + 1, 'programme.accepted', p_actor,
        jsonb_build_object('acceptance_id', p_acceptance, 'wave_id', p_wave, 'domain_id', p_domain, 'claim', 'demonstration'), p_correlation);
    END IF;
  END IF;
  PERFORM onboarding.ledger('onboarding', p_tenant, p_domain, 'acceptance', p_acceptance, 1, CASE WHEN p_decision = 'accept' THEN 'acceptance.recorded' ELSE 'acceptance.withheld' END, p_actor,
    jsonb_build_object('wave_id', p_wave, 'digest', v_digest, 'claim', 'demonstration', 'reason', btrim(p_reason), 'signature_id', p_signature), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM onboarding.migration_acceptances x WHERE x.acceptance_id = p_acceptance);
END $$;
REVOKE ALL ON FUNCTION onboarding.decide_acceptance(uuid, uuid, uuid, uuid, text, text[], text[], text, text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.decide_acceptance(uuid, uuid, uuid, uuid, text, text[], text[], text, text, text, uuid, uuid, uuid) TO eye_commit;

/* WAVE WITHDRAW (onboarding.wave.withdraw; the lead): a wave that never cut over is withdrawn (its records stay). */
CREATE OR REPLACE FUNCTION onboarding.withdraw_wave(p_wave uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = onboarding, executive, observation, pg_catalog, pg_temp AS $$
DECLARE w onboarding.migration_waves%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['onboarding.wave.withdraw']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM onboarding.mg_assert_actor('migration wave', p_actor);
  w := onboarding.mg_wave('migration wave', p_wave, p_tenant, p_domain);
  IF w.state NOT IN ('planned', 'rehearsing', 'reconciled') THEN RAISE EXCEPTION 'migration wave rejected (state): wave % is % — a wave past its cutover approval is rolled back, not withdrawn', w.wave_key, w.state USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'migration wave rejected (reason): a withdrawal states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  PERFORM onboarding.mg_supersede_requested(p_tenant, p_domain, p_wave, 'the wave is withdrawn', p_actor, p_correlation);
  UPDATE onboarding.migration_waves SET state = 'withdrawn', held_reasons = '[]'::jsonb, updated_at = clock_timestamp() WHERE wave_id = p_wave;
  PERFORM executive.b33_close_items(p_tenant, p_domain, NULL, 'migration_wave', p_wave, 'the wave is withdrawn', p_actor, p_correlation);
  PERFORM onboarding.ledger('onboarding', p_tenant, p_domain, 'migration_wave', p_wave, 1, 'wave.withdrawn', p_actor, jsonb_build_object('reason', btrim(p_reason)), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM onboarding.migration_waves x WHERE x.wave_id = p_wave);
END $$;
REVOKE ALL ON FUNCTION onboarding.withdraw_wave(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onboarding.withdraw_wave(uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;
