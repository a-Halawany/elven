-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0114 §IM+§AD — CP-6 B94: THE IMPLEMENTATION PROGRAMME, READINESS AND THE GO-LIVE GATE, ENABLEMENT AND ADOPTION (F-P7-F-05: V8 ch.68
-- PR-68-001, PR-68-002, PR-68-003, PR-68-005, PR-68-006, CAP-DL-07, CAP-DL-08, AT-68; V8+V9 WS-20) and the carryover MET-039 (B92 → B94:
-- `analytics.mc_met039_time_to_accepted_operation`, now that this part records its sources). Part-local: applies ALONE on 0001–0113 + the
-- 0114 prelude (§0). Nothing of 0001–0113 or of the prelude is re-declared here.
--
-- WHAT IS BUILT (DESIGN.md D8, D9, D12):
--   §IM.1  the IMPLEMENTATION PROGRAMME (TENANT, versioned; links the onboarding programme and the TARGET domain): open, revise, start, hold,
--          resume, withdraw; its parts (PR-68-002) as versioned programme items — milestones, dependencies, stakeholders, processes, journeys
--          (priority journeys are accepted at go-live), risks, outcomes, feedback, role requirements and VALUE MEASURES (a pointer to a B92
--          metric definition); CHANGES proposed by the lead and approved ONLY by the customer sponsor or the onboarding authority (PR-68-003).
--   §IM.2  READINESS ITEMS per target domain (role_filled | owner_resolved | training_coverage | competence_coverage | accessibility_attested |
--          shadow_review | custom), EVALUATED LIVE — there is no stored "ready" flag; THE GATE = every blocking item satisfied (or accepted as a
--          signed residual risk by the onboarding authority — never for an unfilled accountable role, an unresolved owner or an inaccessible
--          path); a value measure cited in readiness whose B92 definition carries an approved exception (or is not approved) BLOCKS — a
--          measure, a cohort result or a percentage NEVER releases the gate (PR-68-003). A held gate raises `implementation.readiness` and, for
--          an owner gap, `responsibility.gap` (IA-04-005: the gap stays visible until filled or accepted); a ready gate closes them and opens the
--          sponsor's `implementation.golive_review` task.
--   §IM.3  GO-LIVE: `implementation.golive.approve` by the customer sponsor or the onboarding authority (onboarding.assert_approver: a named
--          human, never the lead, never an agent), on the exact gate digest, refused 409 `held` while held, naming the accepted OPERATING
--          CADENCE (an executive.cadences row of the domain) and the accepted PRIORITY JOURNEYS; SIGNED (executive.signatures kind `readiness`,
--          sealed in the same transaction — a deferred constraint refuses an unsigned approval). The decision carries the ACCEPTANCE RECORD
--          (PR-68-006: the exact programme version, journeys, roles, domain, deployment profile, licence, contract, configuration baseline,
--          paths, cohorts, shadow review, measures, period) with claim `demonstration` — this product never writes a customer acceptance (R2).
--          WITHHOLDING acceptance (WS-20) is recorded and changes nothing else: the prior safe operation stands.
--   §AD.1  ENABLEMENT: training PATHS (versioned, an ACCESSIBILITY ATTESTATION by a named human — an inaccessible or unattested path blocks
--          readiness), training RECORDS (the lead or an enablement assessor records completion for a holder of the path's roles; the SUBJECT
--          sees it), COMPETENCE records (a named enablement assessor ≠ subject, never a lead; complete | not_yet — no score, no rank). Both are
--          purpose-bound (`enablement_readiness` — no performance purpose exists), retention-limited (retain_until) and filtered PER PERSON by
--          RLS (the subject, the recorder, the authorities); the gate and the cohorts read COUNTS per role, never a name.
--   §AD.2  COHORTS (role × rollout wave — never a person) and the ADOPTION MEASURES `ADP-001` (training completion) and `ADP-002` (competence
--          completion) as B92 computations (rate; dimensions role, wave; k ≥ 5 — below k the result is INDETERMINATE, said so).
--   §AD.3  SHADOW WORKFLOWS: a legacy upload after cutover (the legacy upload contract RETIRED) is recorded as a SHADOW FINDING (the refused
--          attempt cited); open findings and the declared SHADOW-PROCESS REVIEW feed the `shadow_review` readiness item.
--   §MC    MET-039 `analytics.mc_met039_time_to_accepted_operation` (B92 §0.7 contract): per accepted implementation programme of the TENANT,
--          days from the effective_from of the contract current at the programme's opening to the go-live acceptance naming an accepted
--          cadence and accepted priority journeys; not yet accepted → excluded "not yet accepted" (indeterminate), never a value.
--
-- THREE CLAIMS, never mixed: CONSTRUCTION (this software and phase6-implementation-b94); DEMONSTRATED OPERATION (the act on SYNTHETIC
-- NORDWERK personas — an in-product go-live by a SYNTHETIC sponsor demonstrates the software only); REAL CUSTOMER ACCEPTANCE (AT-68,
-- PR-68-006's sponsor acceptance — R2, never claimed). Production admission and profile parity: R1 / B111.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §IM.0 VOCABULARY AND HELPERS (internal) ──────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION implementation.item_kinds() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  'milestone', 'dependency', 'stakeholder', 'process', 'journey', 'risk', 'outcome', 'feedback', 'role_requirement', 'value_measure'] $$;
CREATE OR REPLACE FUNCTION implementation.readiness_kinds() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  'role_filled', 'owner_resolved', 'training_coverage', 'competence_coverage', 'accessibility_attested', 'shadow_review', 'custom'] $$;
/* The kinds no residual-risk acceptance can override: an unfilled accountable role, an unresolved accountable owner (IA-04-005) and an
   inaccessible path (PR-68-003: adoption never bypasses accessibility). */
CREATE OR REPLACE FUNCTION implementation.nonoverridable_kinds() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['role_filled', 'owner_resolved', 'accessibility_attested'] $$;
/* The ONLY purpose a training or competence record may serve (no performance evaluation, no scoring, no ranking — ever). */
CREATE OR REPLACE FUNCTION implementation.record_purposes() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['enablement_readiness'] $$;
GRANT EXECUTE ON FUNCTION implementation.item_kinds(), implementation.readiness_kinds(), implementation.nonoverridable_kinds(), implementation.record_purposes() TO eye_app, eye_commit;

/* The acting principal is the context's principal (every port). */
CREATE OR REPLACE FUNCTION implementation.imp_actor(p_noun text, p_actor uuid) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = public, pg_catalog, pg_temp AS $$
BEGIN
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION '% rejected (actor): the act is recorded under the acting principal', p_noun USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION implementation.imp_actor(text, uuid) FROM PUBLIC;

/* A named ACTIVE HUMAN acting (an agent never records a person's training or competence, attests accessibility or confirms an item). */
CREATE OR REPLACE FUNCTION implementation.imp_human(p_noun text, p_actor uuid, p_what text) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = onboarding, pg_catalog, pg_temp AS $$
BEGIN
  IF onboarding.principal_kind(p_actor) IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION '% rejected (actor): % is a named human''s act; an agent or a system never does it', p_noun, p_what USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION implementation.imp_human(text, uuid, text) FROM PUBLIC;

/* The live holders of roles in the domain (a DOMAIN binding of the domain or a TENANT binding of the tenant), active principals, with the
   binding that makes each a holder (the earliest), as of p_at (NULL = now). */
CREATE OR REPLACE FUNCTION implementation.imp_holders(p_tenant uuid, p_domain uuid, p_roles text[], p_at timestamptz DEFAULT NULL)
RETURNS TABLE (principal_id uuid, role_code text, binding_id uuid, bound_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT DISTINCT ON (b.principal_id, b.role_code) b.principal_id, b.role_code, b.id, b.created_at
    FROM identity.role_bindings b JOIN identity.principals p ON p.id = b.principal_id
   WHERE b.role_code = ANY (p_roles) AND p.status = 'active' AND b.tenant_id = p_tenant
     AND (b.scope = 'TENANT' OR (b.scope = 'DOMAIN' AND b.domain_id = p_domain))
     AND (p_at IS NULL AND b.revoked_at IS NULL OR p_at IS NOT NULL AND b.created_at <= p_at AND (b.revoked_at IS NULL OR b.revoked_at > p_at))
   ORDER BY b.principal_id, b.role_code, b.created_at, b.id
$$;
REVOKE ALL ON FUNCTION implementation.imp_holders(uuid, uuid, text[], timestamptz) FROM PUBLIC;

CREATE OR REPLACE FUNCTION implementation.imp_event(p_tenant uuid, p_domain uuid, p_kind text, p_subject uuid, p_version int, p_event text, p_actor uuid, p_details jsonb, p_correlation uuid)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = onboarding, pg_catalog, pg_temp AS $$
  SELECT onboarding.ledger('implementation', p_tenant, p_domain, p_kind, p_subject, p_version, p_event, p_actor, p_details, p_correlation)
$$;
REVOKE ALL ON FUNCTION implementation.imp_event(uuid, uuid, text, uuid, int, text, uuid, jsonb, uuid) FROM PUBLIC;

-- §IM.1 THE PROGRAMME ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* THE IMPLEMENTATION PROGRAMME (D8; PR-68-001, CAP-DL-07): TENANT-scoped and versioned — moving one customer context (the TARGET domain,
   which may be the §ON draft domain) from current practice to governed operation. state planned → in_progress ⇄ held → accepted (the signed
   go-live) | withdrawn. The plan is the programme's own statement (objectives, scope, constraints). */
CREATE TABLE implementation.programmes (
  programme_id     uuid NOT NULL,
  version          int  NOT NULL CHECK (version >= 1),
  scope            text NOT NULL DEFAULT 'TENANT' CHECK (scope = 'TENANT'),
  tenant_id        uuid NOT NULL REFERENCES tenancy.tenants (id),
  programme_key    text NOT NULL CHECK (programme_key ~ '^[a-z][a-z0-9_.-]{2,62}$'),
  title            text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 200),
  target_domain_id uuid NOT NULL,
  onboarding_programme_id uuid,
  deployment_profile text NOT NULL DEFAULT 'local-dev' CHECK (deployment_profile IN ('local-dev', 'saas', 'private-cloud', 'on-premise')),
  owner_principal_id uuid NOT NULL,
  state            text NOT NULL DEFAULT 'planned' CHECK (state IN ('planned', 'in_progress', 'held', 'accepted', 'withdrawn')),
  held_reasons     jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(held_reasons) = 'array'),
  plan             jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(plan) = 'object'),
  digest           text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  effective_from   timestamptz NOT NULL DEFAULT clock_timestamp(),
  superseded_at    timestamptz,
  created_by       uuid NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id   uuid NOT NULL,
  PRIMARY KEY (programme_id, version),
  CONSTRAINT ipr_held CHECK (state <> 'held' OR jsonb_array_length(held_reasons) >= 1)
);
CREATE UNIQUE INDEX ipr_one_current ON implementation.programmes (programme_id) WHERE superseded_at IS NULL;
CREATE UNIQUE INDEX ipr_key ON implementation.programmes (tenant_id, programme_key) WHERE superseded_at IS NULL;
CREATE INDEX ipr_domain ON implementation.programmes (tenant_id, target_domain_id) WHERE superseded_at IS NULL;

/* THE PROGRAMME'S PARTS (PR-68-002): versioned rows per (programme, kind, key); a correction is a new version (expected version, stale → 409),
   a retirement a new version in state retired. A journey with attributes.priority = true is a PRIORITY journey (accepted at go-live); a
   value measure points to a B92 metric definition ({metric_key, cited_in_readiness}) — it may BLOCK readiness, never release it. */
CREATE TABLE implementation.programme_items (
  item_id          uuid NOT NULL,
  version          int  NOT NULL CHECK (version >= 1),
  scope            text NOT NULL DEFAULT 'TENANT' CHECK (scope = 'TENANT'),
  tenant_id        uuid NOT NULL,
  programme_id     uuid NOT NULL,
  kind             text NOT NULL CHECK (kind = ANY (implementation.item_kinds())),
  item_key         text NOT NULL CHECK (item_key ~ '^[a-z][a-z0-9_.-]{1,62}$'),
  title            text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 200),
  attributes       jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
  state            text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'retired')),
  digest           text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  recorded_by      uuid NOT NULL,
  recorded_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  superseded_at    timestamptz,
  correlation_id   uuid NOT NULL,
  PRIMARY KEY (item_id, version)
);
CREATE UNIQUE INDEX ipi_one_current ON implementation.programme_items (programme_id, kind, item_key) WHERE superseded_at IS NULL;
CREATE UNIQUE INDEX ipi_item_current ON implementation.programme_items (item_id) WHERE superseded_at IS NULL;

/* A CHANGE to the programme (PR-68-003: customer leaders own organizational change): proposed by the lead, APPROVED or rejected only by the
   customer sponsor or the onboarding authority (a named human, never the proposer, never a lead), on the exact digest. */
CREATE TABLE implementation.changes (
  change_id        uuid PRIMARY KEY,
  scope            text NOT NULL DEFAULT 'TENANT' CHECK (scope = 'TENANT'),
  tenant_id        uuid NOT NULL,
  programme_id     uuid NOT NULL,
  title            text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 200),
  description      text NOT NULL CHECK (length(btrim(description)) >= 8),
  impact           jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(impact) = 'object'),
  state            text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'approved', 'rejected')),
  digest           text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  proposed_by      uuid NOT NULL,
  proposed_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_by       uuid,
  decided_at       timestamptz,
  decision_reason  text,
  correlation_id   uuid NOT NULL,
  CONSTRAINT ich_decided CHECK (state = 'proposed' OR (decided_by IS NOT NULL AND decided_at IS NOT NULL)),
  CONSTRAINT ich_sod CHECK (decided_by IS NULL OR decided_by <> proposed_by)
);

/* The current programme row of the tenant (or the class-form 404). */
CREATE OR REPLACE FUNCTION implementation.imp_programme(p_tenant uuid, p_programme uuid, p_noun text) RETURNS implementation.programmes
LANGUAGE plpgsql STABLE SET search_path = implementation, pg_catalog, pg_temp AS $$
DECLARE r implementation.programmes%ROWTYPE;
BEGIN
  SELECT * INTO r FROM implementation.programmes x WHERE x.programme_id = p_programme AND x.tenant_id = p_tenant AND x.superseded_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION '% rejected (unknown_programme): % is not an implementation programme of this tenant', p_noun, p_programme USING ERRCODE = '23503'; END IF;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION implementation.imp_programme(uuid, uuid, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION implementation.imp_programme_digest(r implementation.programmes) RETURNS text
LANGUAGE sql STABLE SET search_path = onboarding, pg_catalog, pg_temp AS $$
  SELECT onboarding.digest(jsonb_build_object('programme_id', r.programme_id, 'version', r.version, 'key', r.programme_key, 'title', r.title, 'target_domain_id', r.target_domain_id,
    'onboarding_programme_id', r.onboarding_programme_id, 'deployment_profile', r.deployment_profile, 'owner', r.owner_principal_id, 'state', r.state,
    'held_reasons', r.held_reasons, 'plan', r.plan))
$$;
REVOKE ALL ON FUNCTION implementation.imp_programme_digest(implementation.programmes) FROM PUBLIC;

/* Write the NEXT version of a programme (internal): the current row superseded, the new row digested. */
CREATE OR REPLACE FUNCTION implementation.imp_next_version(o implementation.programmes, p_state text, p_held jsonb, p_title text, p_plan jsonb, p_onboarding uuid, p_profile text,
                                                          p_actor uuid, p_correlation uuid) RETURNS implementation.programmes
LANGUAGE plpgsql SET search_path = implementation, pg_catalog, pg_temp AS $$
DECLARE n implementation.programmes%ROWTYPE;
BEGIN
  UPDATE implementation.programmes SET superseded_at = clock_timestamp() WHERE programme_id = o.programme_id AND version = o.version;
  n := o;
  n.version := o.version + 1; n.state := p_state; n.held_reasons := coalesce(p_held, '[]'::jsonb); n.title := coalesce(p_title, o.title); n.plan := coalesce(p_plan, o.plan);
  n.onboarding_programme_id := p_onboarding; n.deployment_profile := coalesce(p_profile, o.deployment_profile);
  n.effective_from := clock_timestamp(); n.superseded_at := NULL; n.created_by := p_actor; n.created_at := clock_timestamp(); n.correlation_id := p_correlation;
  n.digest := implementation.imp_programme_digest(n);
  INSERT INTO implementation.programmes VALUES (n.*);
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION implementation.imp_next_version(implementation.programmes, text, jsonb, text, jsonb, uuid, text, uuid, uuid) FROM PUBLIC;

/* The onboarding programme a programme links (§ON's table; the prelude's shared table) — must be the tenant's current one. */
CREATE OR REPLACE FUNCTION implementation.imp_check_onboarding(p_tenant uuid, p_onboarding uuid, p_target uuid) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = onboarding, pg_catalog, pg_temp AS $$
DECLARE o onboarding.programmes%ROWTYPE;
BEGIN
  IF p_onboarding IS NULL THEN RETURN; END IF;
  SELECT * INTO o FROM onboarding.programmes x WHERE x.programme_id = p_onboarding AND x.tenant_id = p_tenant AND x.superseded_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'implementation programme rejected (unknown_onboarding_programme): % is not an onboarding programme of this tenant', p_onboarding USING ERRCODE = '23503'; END IF;
  IF o.target_domain_id IS NOT NULL AND o.target_domain_id IS DISTINCT FROM p_target THEN
    RAISE EXCEPTION 'implementation programme rejected (target): the onboarding programme % onboards domain %, not %', p_onboarding, o.target_domain_id, p_target USING ERRCODE = '22023';
  END IF;
END $$;
REVOKE ALL ON FUNCTION implementation.imp_check_onboarding(uuid, uuid, uuid) FROM PUBLIC;

/* OPEN a programme (implementation.programme.open — the implementation lead or the tenant admin; TENANT route). */
CREATE OR REPLACE FUNCTION implementation.open_programme(p_programme uuid, p_tenant uuid, p_key text, p_title text, p_target_domain uuid, p_onboarding uuid, p_profile text, p_plan jsonb,
                                                         p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = implementation, onboarding, tenancy, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE n implementation.programmes%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['implementation.programme.open']);
  PERFORM onboarding.assert_tenant(p_tenant, 'implementation programme');
  PERFORM implementation.imp_actor('implementation programme', p_actor);
  IF NOT onboarding.holds_role(p_actor, p_tenant, NULL, ARRAY['implementation_lead', 'tenant_admin']) THEN
    RAISE EXCEPTION 'implementation programme rejected (authority): a programme is opened by an implementation lead or the tenant administrator' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tenancy.domains d WHERE d.id = p_target_domain AND d.tenant_id = p_tenant AND d.status IN ('draft', 'active')) THEN
    RAISE EXCEPTION 'implementation programme rejected (unknown_domain): % is not a draft or active domain of this tenant', p_target_domain USING ERRCODE = '23503';
  END IF;
  PERFORM implementation.imp_check_onboarding(p_tenant, p_onboarding, p_target_domain);
  IF coalesce(p_key, '') !~ '^[a-z][a-z0-9_.-]{2,62}$' THEN RAISE EXCEPTION 'implementation programme rejected (key): a programme key is lower-case (3–63 characters)' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_title, ''))) NOT BETWEEN 4 AND 200 THEN RAISE EXCEPTION 'implementation programme rejected (title): a title of 4–200 characters' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(coalesce(p_plan, '{}'::jsonb)) <> 'object' OR length(btrim(coalesce(p_plan ->> 'objective', ''))) < 8 THEN
    RAISE EXCEPTION 'implementation programme rejected (plan): the plan states its objective (8+ characters)' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM implementation.programmes x WHERE x.tenant_id = p_tenant AND x.programme_key = p_key AND x.superseded_at IS NULL) THEN
    RAISE EXCEPTION 'implementation programme rejected (duplicate): the tenant already has a programme %', p_key USING ERRCODE = '22023';
  END IF;
  n := ROW(p_programme, 1, 'TENANT', p_tenant, p_key, btrim(p_title), p_target_domain, p_onboarding, coalesce(p_profile, 'local-dev'), p_actor, 'planned', '[]'::jsonb, p_plan,
           repeat('0', 64), clock_timestamp(), NULL, p_actor, clock_timestamp(), p_correlation)::implementation.programmes;
  n.digest := implementation.imp_programme_digest(n);
  INSERT INTO implementation.programmes VALUES (n.*);
  PERFORM implementation.imp_event(p_tenant, NULL, 'implementation_programme', p_programme, 1, 'programme.opened', p_actor,
                                   jsonb_build_object('key', p_key, 'target_domain_id', p_target_domain, 'onboarding_programme_id', p_onboarding, 'digest', n.digest), p_correlation);
  RETURN to_jsonb(n);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION implementation.open_programme(uuid, uuid, text, text, uuid, uuid, text, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION implementation.open_programme(uuid, uuid, text, text, uuid, uuid, text, jsonb, uuid, uuid) TO eye_commit;

/* REVISE (implementation.programme.revise — the lead or the tenant admin): a new version with the title / plan / onboarding link / profile
   changed, at the expected version (stale → 409). The target domain is fixed (another target is another programme). */
CREATE OR REPLACE FUNCTION implementation.revise_programme(p_programme uuid, p_tenant uuid, p_expected_version int, p_title text, p_plan jsonb, p_onboarding uuid, p_profile text,
                                                           p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = implementation, onboarding, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE o implementation.programmes%ROWTYPE; n implementation.programmes%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['implementation.programme.revise']);
  PERFORM onboarding.assert_tenant(p_tenant, 'implementation programme');
  PERFORM implementation.imp_actor('implementation programme', p_actor);
  IF NOT onboarding.holds_role(p_actor, p_tenant, NULL, ARRAY['implementation_lead', 'tenant_admin']) THEN
    RAISE EXCEPTION 'implementation programme rejected (authority): a programme is revised by an implementation lead or the tenant administrator' USING ERRCODE = '42501';
  END IF;
  o := implementation.imp_programme(p_tenant, p_programme, 'implementation programme');
  PERFORM 1 FROM implementation.programmes x WHERE x.programme_id = p_programme AND x.version = o.version FOR UPDATE;
  IF p_expected_version IS DISTINCT FROM o.version THEN
    RAISE EXCEPTION 'implementation programme rejected (stale): the programme is at version %, not %', o.version, p_expected_version USING ERRCODE = '22023';
  END IF;
  IF o.state IN ('accepted', 'withdrawn') THEN RAISE EXCEPTION 'implementation programme rejected (state): the programme is %', o.state USING ERRCODE = '22023'; END IF;
  IF p_title IS NOT NULL AND length(btrim(p_title)) NOT BETWEEN 4 AND 200 THEN RAISE EXCEPTION 'implementation programme rejected (title): a title of 4–200 characters' USING ERRCODE = '22023'; END IF;
  IF p_plan IS NOT NULL AND (jsonb_typeof(p_plan) <> 'object' OR length(btrim(coalesce(p_plan ->> 'objective', ''))) < 8) THEN
    RAISE EXCEPTION 'implementation programme rejected (plan): the plan states its objective (8+ characters)' USING ERRCODE = '22023';
  END IF;
  PERFORM implementation.imp_check_onboarding(p_tenant, coalesce(p_onboarding, o.onboarding_programme_id), o.target_domain_id);
  n := implementation.imp_next_version(o, o.state, o.held_reasons, btrim(p_title), p_plan, coalesce(p_onboarding, o.onboarding_programme_id), p_profile, p_actor, p_correlation);
  PERFORM implementation.imp_event(p_tenant, NULL, 'implementation_programme', p_programme, n.version, 'programme.revised', p_actor,
                                   jsonb_build_object('from_version', o.version, 'digest', n.digest, 'prior_digest', o.digest), p_correlation);
  RETURN to_jsonb(n);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION implementation.revise_programme(uuid, uuid, int, text, jsonb, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION implementation.revise_programme(uuid, uuid, int, text, jsonb, uuid, text, uuid, uuid) TO eye_commit;

/* TRANSITION (implementation.programme.start | .hold | .resume | .withdraw): planned → in_progress (start); in_progress → held (hold, with
   reasons); held → in_progress (resume); planned | in_progress | held → withdrawn (withdraw). The go-live alone sets `accepted`. The lead and
   the tenant admin start and withdraw; the lead, the sponsor and the authority hold and resume. */
CREATE OR REPLACE FUNCTION implementation.transition_programme(p_programme uuid, p_tenant uuid, p_act text, p_expected_version int, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = implementation, onboarding, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE o implementation.programmes%ROWTYPE; n implementation.programmes%ROWTYPE; v_to text; v_roles text[];
BEGIN
  IF p_act NOT IN ('start', 'hold', 'resume', 'withdraw') THEN RAISE EXCEPTION 'implementation programme rejected (act): start, hold, resume or withdraw' USING ERRCODE = '22023'; END IF;
  PERFORM observation.assert_authority(ARRAY['implementation.programme.' || p_act]);
  PERFORM onboarding.assert_tenant(p_tenant, 'implementation programme');
  PERFORM implementation.imp_actor('implementation programme', p_actor);
  v_roles := CASE WHEN p_act IN ('start', 'withdraw') THEN ARRAY['implementation_lead', 'tenant_admin'] ELSE ARRAY['implementation_lead', 'customer_sponsor', 'onboarding_authority'] END;
  IF NOT onboarding.holds_role(p_actor, p_tenant, NULL, v_roles) THEN
    RAISE EXCEPTION 'implementation programme rejected (authority): % is the act of a %', p_act, array_to_string(v_roles, ' or ') USING ERRCODE = '42501';
  END IF;
  o := implementation.imp_programme(p_tenant, p_programme, 'implementation programme');
  PERFORM 1 FROM implementation.programmes x WHERE x.programme_id = p_programme AND x.version = o.version FOR UPDATE;
  IF p_expected_version IS DISTINCT FROM o.version THEN
    RAISE EXCEPTION 'implementation programme rejected (stale): the programme is at version %, not %', o.version, p_expected_version USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'implementation programme rejected (reason): a transition states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  v_to := CASE p_act WHEN 'start' THEN CASE WHEN o.state = 'planned' THEN 'in_progress' END
                     WHEN 'hold' THEN CASE WHEN o.state = 'in_progress' THEN 'held' END
                     WHEN 'resume' THEN CASE WHEN o.state = 'held' THEN 'in_progress' END
                     ELSE CASE WHEN o.state IN ('planned', 'in_progress', 'held') THEN 'withdrawn' END END;
  IF v_to IS NULL THEN RAISE EXCEPTION 'implementation programme rejected (state): a % programme cannot be %', o.state, CASE p_act WHEN 'start' THEN 'started' WHEN 'hold' THEN 'held' WHEN 'resume' THEN 'resumed' ELSE 'withdrawn' END USING ERRCODE = '22023'; END IF;
  n := implementation.imp_next_version(o, v_to, CASE WHEN v_to = 'held' THEN jsonb_build_array(btrim(p_reason)) ELSE '[]'::jsonb END, NULL, NULL, o.onboarding_programme_id, NULL, p_actor, p_correlation);
  PERFORM implementation.imp_event(p_tenant, NULL, 'implementation_programme', p_programme, n.version,
                                   'programme.' || CASE p_act WHEN 'start' THEN 'started' WHEN 'hold' THEN 'held' WHEN 'resume' THEN 'resumed' ELSE 'withdrawn' END, p_actor,
                                   jsonb_build_object('from', o.state, 'to', v_to, 'reason', btrim(p_reason), 'digest', n.digest), p_correlation);
  RETURN to_jsonb(n);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION implementation.transition_programme(uuid, uuid, text, int, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION implementation.transition_programme(uuid, uuid, text, int, text, uuid, uuid) TO eye_commit;

/* A programme part's attributes, validated per kind (closed shapes; nothing names a person except a stakeholder's optional named holder of
   the stakeholder role, who must hold it). */
CREATE OR REPLACE FUNCTION implementation.imp_validate_item(p_tenant uuid, p_programme implementation.programmes, p_kind text, p_attributes jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = implementation, identity, onboarding, pg_catalog, pg_temp AS $$
DECLARE a jsonb := coalesce(p_attributes, '{}'::jsonb); v text;
BEGIN
  IF jsonb_typeof(a) <> 'object' THEN RAISE EXCEPTION 'implementation programme rejected (attributes): the attributes are an object' USING ERRCODE = '22023'; END IF;
  IF p_kind = 'milestone' THEN
    IF coalesce(a ->> 'due_on', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'implementation programme rejected (attributes): a milestone names its due_on day (YYYY-MM-DD)' USING ERRCODE = '22023'; END IF;
    PERFORM (a ->> 'due_on')::date;
    IF coalesce(a ->> 'status', 'planned') NOT IN ('planned', 'done', 'missed') THEN RAISE EXCEPTION 'implementation programme rejected (attributes): a milestone is planned, done or missed' USING ERRCODE = '22023'; END IF;
    RETURN a || jsonb_build_object('status', coalesce(a ->> 'status', 'planned'));
  ELSIF p_kind = 'dependency' THEN
    FOREACH v IN ARRAY ARRAY[a ->> 'from_key', a ->> 'to_key'] LOOP
      IF v IS NULL OR NOT EXISTS (SELECT 1 FROM implementation.programme_items i WHERE i.programme_id = p_programme.programme_id AND i.kind = 'milestone' AND i.item_key = v
                                                                                    AND i.superseded_at IS NULL AND i.state = 'active') THEN
        RAISE EXCEPTION 'implementation programme rejected (attributes): a dependency joins two active milestones of the programme (from_key, to_key); % is not one', coalesce(v, '<none>') USING ERRCODE = '22023';
      END IF;
    END LOOP;
    IF a ->> 'from_key' = a ->> 'to_key' THEN RAISE EXCEPTION 'implementation programme rejected (attributes): a milestone does not depend on itself' USING ERRCODE = '22023'; END IF;
    RETURN a || jsonb_build_object('relation', coalesce(a ->> 'relation', 'finish_to_start'));
  ELSIF p_kind = 'stakeholder' THEN
    IF NOT EXISTS (SELECT 1 FROM identity.roles r WHERE r.code = a ->> 'role') THEN RAISE EXCEPTION 'implementation programme rejected (attributes): a stakeholder names an existing role' USING ERRCODE = '22023'; END IF;
    IF a ? 'principal_id' AND a ->> 'principal_id' IS NOT NULL
       AND NOT onboarding.holds_role((a ->> 'principal_id')::uuid, p_tenant, p_programme.target_domain_id, ARRAY[a ->> 'role']) THEN
      RAISE EXCEPTION 'implementation programme rejected (attributes): the named stakeholder does not hold %', a ->> 'role' USING ERRCODE = '22023';
    END IF;
    IF length(btrim(coalesce(a ->> 'interest', ''))) < 4 THEN RAISE EXCEPTION 'implementation programme rejected (attributes): a stakeholder states its interest' USING ERRCODE = '22023'; END IF;
    RETURN a;
  ELSIF p_kind = 'process' THEN
    IF length(btrim(coalesce(a ->> 'current_practice', ''))) < 4 OR length(btrim(coalesce(a ->> 'target_workflow', ''))) < 4 THEN
      RAISE EXCEPTION 'implementation programme rejected (attributes): a process states its current practice and its target workflow' USING ERRCODE = '22023';
    END IF;
    RETURN a;
  ELSIF p_kind = 'journey' THEN
    IF length(btrim(coalesce(a ->> 'journey_ref', ''))) < 3 THEN RAISE EXCEPTION 'implementation programme rejected (attributes): a journey names its journey reference (e.g. JRN-01)' USING ERRCODE = '22023'; END IF;
    RETURN a || jsonb_build_object('priority', coalesce((a ->> 'priority')::boolean, false));
  ELSIF p_kind = 'risk' THEN
    IF coalesce(a ->> 'likelihood', '') NOT IN ('low', 'medium', 'high') OR NOT EXISTS (SELECT 1 FROM identity.roles r WHERE r.code = a ->> 'owner_role') THEN
      RAISE EXCEPTION 'implementation programme rejected (attributes): a risk names its likelihood (low, medium, high) and its owner role' USING ERRCODE = '22023';
    END IF;
    RETURN a;
  ELSIF p_kind IN ('outcome', 'feedback') THEN
    IF length(btrim(coalesce(a ->> 'statement', ''))) < 8 THEN RAISE EXCEPTION 'implementation programme rejected (attributes): an % states itself (8+ characters)', p_kind USING ERRCODE = '22023'; END IF;
    IF p_kind = 'feedback' AND (a ? 'principal_id' OR a ? 'person') THEN
      RAISE EXCEPTION 'implementation programme rejected (person): feedback is recorded by role, never attributed to a person' USING ERRCODE = '42501';
    END IF;
    RETURN a;
  ELSIF p_kind = 'role_requirement' THEN
    IF NOT EXISTS (SELECT 1 FROM identity.roles r WHERE r.code = a ->> 'role') THEN RAISE EXCEPTION 'implementation programme rejected (attributes): a role requirement names an existing role' USING ERRCODE = '22023'; END IF;
    RETURN a;
  ELSIF p_kind = 'value_measure' THEN
    IF coalesce(a ->> 'metric_key', '') !~ '^[A-Z][A-Z0-9]{1,9}-[A-Za-z0-9.-]{1,40}$' THEN
      RAISE EXCEPTION 'implementation programme rejected (attributes): a value measure points to a B92 metric key (e.g. ADP-001)' USING ERRCODE = '22023';
    END IF;
    RETURN a || jsonb_build_object('cited_in_readiness', coalesce((a ->> 'cited_in_readiness')::boolean, false));
  END IF;
  RAISE EXCEPTION 'implementation programme rejected (kind): the kind is one of %', array_to_string(implementation.item_kinds(), ', ') USING ERRCODE = '22023';
END $$;
REVOKE ALL ON FUNCTION implementation.imp_validate_item(uuid, implementation.programmes, text, jsonb) FROM PUBLIC;

/* RECORD a programme part (implementation.item.record — the implementation lead): v1, or the next version at the expected version (a correction),
   or a retirement (p_retire). */
CREATE OR REPLACE FUNCTION implementation.record_item(p_item uuid, p_programme uuid, p_tenant uuid, p_kind text, p_key text, p_title text, p_attributes jsonb, p_expected_version int,
                                                      p_retire boolean, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = implementation, onboarding, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE pr implementation.programmes%ROWTYPE; o implementation.programme_items%ROWTYPE; v_attr jsonb; v_version int; v_id uuid; v_digest text; v_state text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['implementation.item.record']);
  PERFORM onboarding.assert_tenant(p_tenant, 'implementation programme');
  PERFORM implementation.imp_actor('implementation programme', p_actor);
  IF NOT onboarding.holds_role(p_actor, p_tenant, NULL, ARRAY['implementation_lead']) THEN
    RAISE EXCEPTION 'implementation programme rejected (authority): the programme''s parts are recorded by the implementation lead' USING ERRCODE = '42501';
  END IF;
  pr := implementation.imp_programme(p_tenant, p_programme, 'implementation programme');
  IF pr.state IN ('accepted', 'withdrawn') THEN RAISE EXCEPTION 'implementation programme rejected (state): the programme is %', pr.state USING ERRCODE = '22023'; END IF;
  SELECT * INTO o FROM implementation.programme_items x WHERE x.programme_id = p_programme AND x.kind = p_kind AND x.item_key = p_key AND x.superseded_at IS NULL FOR UPDATE;
  IF FOUND THEN
    IF p_expected_version IS DISTINCT FROM o.version THEN
      RAISE EXCEPTION 'implementation programme rejected (stale): the % % is at version %, not %', p_kind, p_key, o.version, coalesce(p_expected_version::text, '<none>') USING ERRCODE = '22023';
    END IF;
    IF o.state = 'retired' THEN RAISE EXCEPTION 'implementation programme rejected (state): the % % is retired', p_kind, p_key USING ERRCODE = '22023'; END IF;
    v_id := o.item_id; v_version := o.version + 1;
    UPDATE implementation.programme_items SET superseded_at = clock_timestamp() WHERE item_id = o.item_id AND version = o.version;
  ELSE
    IF coalesce(p_expected_version, 0) <> 0 THEN
      RAISE EXCEPTION 'implementation programme rejected (stale): the % % does not exist yet (expected version 0)', p_kind, p_key USING ERRCODE = '22023';
    END IF;
    IF coalesce(p_retire, false) THEN RAISE EXCEPTION 'implementation programme rejected (unknown_item): there is no % % to retire', p_kind, p_key USING ERRCODE = '23503'; END IF;
    v_id := p_item; v_version := 1;
  END IF;
  IF coalesce(p_key, '') !~ '^[a-z][a-z0-9_.-]{1,62}$' THEN RAISE EXCEPTION 'implementation programme rejected (key): an item key is lower-case (2–63 characters)' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_title, o.title, ''))) NOT BETWEEN 4 AND 200 THEN RAISE EXCEPTION 'implementation programme rejected (title): a title of 4–200 characters' USING ERRCODE = '22023'; END IF;
  v_state := CASE WHEN coalesce(p_retire, false) THEN 'retired' ELSE 'active' END;
  v_attr := CASE WHEN coalesce(p_retire, false) THEN o.attributes ELSE implementation.imp_validate_item(p_tenant, pr, p_kind, p_attributes) END;
  v_digest := onboarding.digest(jsonb_build_object('item_id', v_id, 'version', v_version, 'programme_id', p_programme, 'kind', p_kind, 'key', p_key, 'title', btrim(coalesce(p_title, o.title)),
                                                   'attributes', v_attr, 'state', v_state));
  INSERT INTO implementation.programme_items (item_id, version, tenant_id, programme_id, kind, item_key, title, attributes, state, digest, recorded_by, correlation_id)
  VALUES (v_id, v_version, p_tenant, p_programme, p_kind, p_key, btrim(coalesce(p_title, o.title)), v_attr, v_state, v_digest, p_actor, p_correlation);
  PERFORM implementation.imp_event(p_tenant, NULL, 'programme_item', v_id, v_version, CASE WHEN v_state = 'retired' THEN 'item.retired' ELSE 'item.recorded' END, p_actor,
                                   jsonb_build_object('programme_id', p_programme, 'kind', p_kind, 'key', p_key, 'digest', v_digest), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM implementation.programme_items x WHERE x.item_id = v_id AND x.version = v_version);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION implementation.record_item(uuid, uuid, uuid, text, text, text, jsonb, int, boolean, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION implementation.record_item(uuid, uuid, uuid, text, text, text, jsonb, int, boolean, uuid, uuid) TO eye_commit;

/* PROPOSE a change (implementation.change.propose — the implementation lead). */
CREATE OR REPLACE FUNCTION implementation.propose_change(p_change uuid, p_programme uuid, p_tenant uuid, p_title text, p_description text, p_impact jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = implementation, onboarding, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE pr implementation.programmes%ROWTYPE; v_digest text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['implementation.change.propose']);
  PERFORM onboarding.assert_tenant(p_tenant, 'implementation change');
  PERFORM implementation.imp_actor('implementation change', p_actor);
  IF NOT onboarding.holds_role(p_actor, p_tenant, NULL, ARRAY['implementation_lead']) THEN
    RAISE EXCEPTION 'implementation change rejected (authority): a change is proposed by the implementation lead' USING ERRCODE = '42501';
  END IF;
  pr := implementation.imp_programme(p_tenant, p_programme, 'implementation change');
  IF pr.state IN ('accepted', 'withdrawn') THEN RAISE EXCEPTION 'implementation change rejected (state): the programme is %', pr.state USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_title, ''))) NOT BETWEEN 4 AND 200 OR length(btrim(coalesce(p_description, ''))) < 8 THEN
    RAISE EXCEPTION 'implementation change rejected (description): a change has a title (4–200) and a description (8+ characters)' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(coalesce(p_impact, '{}'::jsonb)) <> 'object' THEN RAISE EXCEPTION 'implementation change rejected (impact): the impact is an object' USING ERRCODE = '22023'; END IF;
  v_digest := onboarding.digest(jsonb_build_object('change_id', p_change, 'programme_id', p_programme, 'programme_version', pr.version, 'title', btrim(p_title),
                                                   'description', btrim(p_description), 'impact', coalesce(p_impact, '{}'::jsonb)));
  INSERT INTO implementation.changes (change_id, tenant_id, programme_id, title, description, impact, digest, proposed_by, correlation_id)
  VALUES (p_change, p_tenant, p_programme, btrim(p_title), btrim(p_description), coalesce(p_impact, '{}'::jsonb), v_digest, p_actor, p_correlation);
  PERFORM implementation.imp_event(p_tenant, NULL, 'implementation_change', p_change, NULL, 'change.proposed', p_actor, jsonb_build_object('programme_id', p_programme, 'digest', v_digest), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM implementation.changes x WHERE x.change_id = p_change);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION implementation.propose_change(uuid, uuid, uuid, text, text, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION implementation.propose_change(uuid, uuid, uuid, text, text, jsonb, uuid, uuid) TO eye_commit;

/* DECIDE a change (implementation.change.approve — HUMAN-GATED: the customer sponsor or the onboarding authority via the approver test, on
   the change's digest). */
CREATE OR REPLACE FUNCTION implementation.decide_change(p_change uuid, p_tenant uuid, p_decision text, p_digest text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = implementation, onboarding, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c implementation.changes%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['implementation.change.approve']);
  PERFORM onboarding.assert_tenant(p_tenant, 'implementation change');
  PERFORM implementation.imp_actor('implementation change', p_actor);
  SELECT * INTO c FROM implementation.changes x WHERE x.change_id = p_change AND x.tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'implementation change rejected (unknown_change): % is not a change of this tenant', p_change USING ERRCODE = '23503'; END IF;
  PERFORM onboarding.assert_approver('implementation change', p_actor, p_tenant, NULL, ARRAY['customer_sponsor', 'onboarding_authority'], c.proposed_by, 'deciding an implementation change');
  IF c.state <> 'proposed' THEN RAISE EXCEPTION 'implementation change rejected (state): the change is %', c.state USING ERRCODE = '22023'; END IF;
  IF p_decision NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'implementation change rejected (decision): approve or reject' USING ERRCODE = '22023'; END IF;
  IF p_digest IS DISTINCT FROM c.digest THEN RAISE EXCEPTION 'implementation change rejected (stale): the change is at digest %…, not the one decided (%…)', left(c.digest, 12), left(coalesce(p_digest, '<none>'), 12) USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'implementation change rejected (reason): a decision states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  UPDATE implementation.changes SET state = CASE p_decision WHEN 'approve' THEN 'approved' ELSE 'rejected' END, decided_by = p_actor, decided_at = clock_timestamp(), decision_reason = btrim(p_reason)
   WHERE change_id = p_change;
  PERFORM implementation.imp_event(p_tenant, NULL, 'implementation_change', p_change, NULL, CASE p_decision WHEN 'approve' THEN 'change.approved' ELSE 'change.rejected' END, p_actor,
                                   jsonb_build_object('programme_id', c.programme_id, 'digest', c.digest, 'reason', btrim(p_reason)), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM implementation.changes x WHERE x.change_id = p_change);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION implementation.decide_change(uuid, uuid, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION implementation.decide_change(uuid, uuid, text, text, text, uuid, uuid) TO eye_commit;

-- §AD.1 ENABLEMENT: PATHS, ATTESTATIONS, TRAINING AND COMPETENCE RECORDS ───────────────────────────────────────────────────────────────────
/* A TRAINING PATH (DOMAIN, versioned): what holders of `roles` complete before go-live; content by reference (no content is stored here). */
CREATE TABLE implementation.training_paths (
  path_id          uuid NOT NULL,
  version          int  NOT NULL CHECK (version >= 1),
  scope            text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  programme_id     uuid,
  path_key         text NOT NULL CHECK (path_key ~ '^[a-z][a-z0-9_.-]{2,62}$'),
  title            text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 200),
  roles            text[] NOT NULL CHECK (cardinality(roles) >= 1),
  content_ref      text NOT NULL CHECK (length(btrim(content_ref)) >= 4),
  state            text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'retired')),
  digest           text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  declared_by      uuid NOT NULL,
  declared_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  superseded_at    timestamptz,
  correlation_id   uuid NOT NULL,
  PRIMARY KEY (path_id, version),
  CONSTRAINT itp_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE UNIQUE INDEX itp_one_current ON implementation.training_paths (tenant_id, domain_id, path_key) WHERE superseded_at IS NULL;

/* The ACCESSIBILITY ATTESTATION of a path version (append-only; the latest counts): a named human (≠ the declarer), on the version's digest. */
CREATE TABLE implementation.path_attestations (
  attestation_id   uuid PRIMARY KEY,
  scope            text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  path_id          uuid NOT NULL,
  path_version     int  NOT NULL,
  path_digest      text NOT NULL CHECK (path_digest ~ '^[0-9a-f]{64}$'),
  verdict          text NOT NULL CHECK (verdict IN ('accessible', 'inaccessible')),
  statement        text NOT NULL CHECK (length(btrim(statement)) >= 8),
  attested_by      uuid NOT NULL,
  attested_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id   uuid NOT NULL,
  FOREIGN KEY (path_id, path_version) REFERENCES implementation.training_paths (path_id, version),
  CONSTRAINT ipa_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);

/* A TRAINING RECORD (append-only; the latest per subject × path version counts): complete | not_yet — nothing else (no score, no rank). */
CREATE TABLE implementation.training_records (
  record_id        uuid PRIMARY KEY,
  scope            text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  path_id          uuid NOT NULL,
  path_version     int  NOT NULL,
  subject_principal_id uuid NOT NULL,
  state            text NOT NULL CHECK (state IN ('complete', 'not_yet')),
  purpose          text NOT NULL CHECK (purpose = ANY (implementation.record_purposes())),
  note             text CHECK (note IS NULL OR length(note) <= 500),
  recorded_by      uuid NOT NULL,
  recorded_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  retain_until     timestamptz NOT NULL,
  correlation_id   uuid NOT NULL,
  FOREIGN KEY (path_id, path_version) REFERENCES implementation.training_paths (path_id, version),
  CONSTRAINT itr_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT itr_not_self CHECK (recorded_by <> subject_principal_id),
  CONSTRAINT itr_retention CHECK (retain_until > recorded_at AND retain_until <= recorded_at + interval '1095 days')
);
CREATE INDEX itr_subject ON implementation.training_records (tenant_id, domain_id, path_id, path_version, subject_principal_id, recorded_at DESC);

/* A COMPETENCE RECORD (append-only; the latest per subject × competence key counts): a named enablement assessor ≠ subject, complete | not_yet. */
CREATE TABLE implementation.competence_records (
  record_id        uuid PRIMARY KEY,
  scope            text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  competence_key   text NOT NULL CHECK (competence_key ~ '^[a-z][a-z0-9_.-]{2,62}$'),
  role_code        text NOT NULL,
  subject_principal_id uuid NOT NULL,
  outcome          text NOT NULL CHECK (outcome IN ('complete', 'not_yet')),
  purpose          text NOT NULL CHECK (purpose = ANY (implementation.record_purposes())),
  evidence_note    text CHECK (evidence_note IS NULL OR length(evidence_note) <= 500),
  assessor_principal_id uuid NOT NULL,
  recorded_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  retain_until     timestamptz NOT NULL,
  correlation_id   uuid NOT NULL,
  CONSTRAINT icr_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT icr_not_self CHECK (assessor_principal_id <> subject_principal_id),
  CONSTRAINT icr_retention CHECK (retain_until > recorded_at AND retain_until <= recorded_at + interval '1095 days')
);
CREATE INDEX icr_subject ON implementation.competence_records (tenant_id, domain_id, competence_key, subject_principal_id, recorded_at DESC);

/* The current path of a key in the domain (or NULL). */
CREATE OR REPLACE FUNCTION implementation.imp_path(p_tenant uuid, p_domain uuid, p_key text) RETURNS implementation.training_paths
LANGUAGE sql STABLE SET search_path = implementation, pg_catalog, pg_temp AS $$
  SELECT * FROM implementation.training_paths x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.path_key = p_key AND x.superseded_at IS NULL
$$;
REVOKE ALL ON FUNCTION implementation.imp_path(uuid, uuid, text) FROM PUBLIC;
/* The standing accessibility of a path version: the latest attestation at the version's digest — accessible | inaccessible | unattested. */
CREATE OR REPLACE FUNCTION implementation.imp_accessibility(p_path uuid, p_version int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = implementation, pg_catalog, pg_temp AS $$
  SELECT coalesce((SELECT jsonb_build_object('state', a.verdict, 'attestation_id', a.attestation_id, 'attested_by', a.attested_by, 'attested_at', a.attested_at, 'statement', a.statement)
                     FROM implementation.path_attestations a JOIN implementation.training_paths t ON t.path_id = a.path_id AND t.version = a.path_version AND t.digest = a.path_digest
                    WHERE a.path_id = p_path AND a.path_version = p_version ORDER BY a.attested_at DESC, a.attestation_id DESC LIMIT 1),
                  jsonb_build_object('state', 'unattested'))
$$;
REVOKE ALL ON FUNCTION implementation.imp_accessibility(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION implementation.imp_accessibility(uuid, int) TO eye_app, eye_commit;

/* DECLARE a path or its next version (implementation.training.path.declare — the lead, a domain admin or an enablement assessor). A new
   version needs a new attestation (the old one names the old digest). */
CREATE OR REPLACE FUNCTION implementation.declare_path(p_path uuid, p_tenant uuid, p_domain uuid, p_programme uuid, p_key text, p_title text, p_roles text[], p_content_ref text,
                                                       p_expected_version int, p_retire boolean, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = implementation, onboarding, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE o implementation.training_paths%ROWTYPE; v_id uuid; v_version int; v_digest text; v_state text; v_roles text[];
BEGIN
  PERFORM observation.assert_authority(ARRAY['implementation.training.path.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM implementation.imp_actor('training path', p_actor);
  IF NOT onboarding.holds_role(p_actor, p_tenant, p_domain, ARRAY['implementation_lead', 'domain_admin', 'enablement_assessor']) THEN
    RAISE EXCEPTION 'training path rejected (authority): a path is declared by the implementation lead, a domain admin or an enablement assessor' USING ERRCODE = '42501';
  END IF;
  IF p_programme IS NOT NULL AND NOT EXISTS (SELECT 1 FROM implementation.programmes x WHERE x.programme_id = p_programme AND x.tenant_id = p_tenant AND x.target_domain_id = p_domain AND x.superseded_at IS NULL) THEN
    RAISE EXCEPTION 'training path rejected (unknown_programme): % is not a programme of this domain', p_programme USING ERRCODE = '23503';
  END IF;
  o := implementation.imp_path(p_tenant, p_domain, p_key);
  IF o.path_id IS NOT NULL THEN
    PERFORM 1 FROM implementation.training_paths x WHERE x.path_id = o.path_id AND x.version = o.version FOR UPDATE;
    IF p_expected_version IS DISTINCT FROM o.version THEN RAISE EXCEPTION 'training path rejected (stale): % is at version %, not %', p_key, o.version, coalesce(p_expected_version::text, '<none>') USING ERRCODE = '22023'; END IF;
    IF o.state = 'retired' THEN RAISE EXCEPTION 'training path rejected (state): % is retired', p_key USING ERRCODE = '22023'; END IF;
    v_id := o.path_id; v_version := o.version + 1;
    UPDATE implementation.training_paths SET superseded_at = clock_timestamp() WHERE path_id = o.path_id AND version = o.version;
  ELSE
    IF coalesce(p_expected_version, 0) <> 0 THEN RAISE EXCEPTION 'training path rejected (stale): % does not exist yet (expected version 0)', p_key USING ERRCODE = '22023'; END IF;
    IF coalesce(p_retire, false) THEN RAISE EXCEPTION 'training path rejected (unknown_path): there is no path % to retire', p_key USING ERRCODE = '23503'; END IF;
    v_id := p_path; v_version := 1;
  END IF;
  IF coalesce(p_key, '') !~ '^[a-z][a-z0-9_.-]{2,62}$' THEN RAISE EXCEPTION 'training path rejected (key): a path key is lower-case (3–63 characters)' USING ERRCODE = '22023'; END IF;
  v_state := CASE WHEN coalesce(p_retire, false) THEN 'retired' ELSE 'active' END;
  v_roles := CASE WHEN coalesce(p_retire, false) THEN o.roles ELSE (SELECT array_agg(DISTINCT r ORDER BY r) FROM unnest(p_roles) r) END;
  IF coalesce(cardinality(v_roles), 0) = 0 OR EXISTS (SELECT 1 FROM unnest(v_roles) r WHERE NOT EXISTS (SELECT 1 FROM identity.roles x WHERE x.code = r)) THEN
    RAISE EXCEPTION 'training path rejected (roles): a path names the existing roles whose holders complete it' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_title, o.title, ''))) NOT BETWEEN 4 AND 200 OR length(btrim(coalesce(p_content_ref, o.content_ref, ''))) < 4 THEN
    RAISE EXCEPTION 'training path rejected (content): a path has a title (4–200) and a content reference' USING ERRCODE = '22023';
  END IF;
  v_digest := onboarding.digest(jsonb_build_object('path_id', v_id, 'version', v_version, 'key', p_key, 'title', btrim(coalesce(p_title, o.title)), 'roles', to_jsonb(v_roles),
                                                   'content_ref', btrim(coalesce(p_content_ref, o.content_ref)), 'state', v_state));
  INSERT INTO implementation.training_paths (path_id, version, tenant_id, domain_id, programme_id, path_key, title, roles, content_ref, state, digest, declared_by, correlation_id)
  VALUES (v_id, v_version, p_tenant, p_domain, coalesce(p_programme, o.programme_id), p_key, btrim(coalesce(p_title, o.title)), v_roles, btrim(coalesce(p_content_ref, o.content_ref)),
          v_state, v_digest, p_actor, p_correlation);
  PERFORM implementation.imp_event(p_tenant, p_domain, 'training_path', v_id, v_version, CASE WHEN v_state = 'retired' THEN 'path.retired' ELSE 'path.declared' END, p_actor,
                                   jsonb_build_object('key', p_key, 'roles', to_jsonb(v_roles), 'digest', v_digest), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM implementation.training_paths x WHERE x.path_id = v_id AND x.version = v_version);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION implementation.declare_path(uuid, uuid, uuid, uuid, text, text, text[], text, int, boolean, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION implementation.declare_path(uuid, uuid, uuid, uuid, text, text, text[], text, int, boolean, uuid, uuid) TO eye_commit;

/* ATTEST a path version's accessibility (implementation.training.path.attest — HUMAN-GATED: a named human domain admin, enablement assessor
   or onboarding authority, never the declarer of the version, never an implementation lead; on the version's digest). */
CREATE OR REPLACE FUNCTION implementation.attest_path(p_attestation uuid, p_path uuid, p_tenant uuid, p_domain uuid, p_version int, p_digest text, p_verdict text, p_statement text,
                                                      p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = implementation, onboarding, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t implementation.training_paths%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['implementation.training.path.attest']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM implementation.imp_actor('training path', p_actor);
  SELECT * INTO t FROM implementation.training_paths x WHERE x.path_id = p_path AND x.version = p_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'training path rejected (unknown_path): % has no version % in this domain', p_path, p_version USING ERRCODE = '23503'; END IF;
  PERFORM onboarding.assert_approver('training path', p_actor, p_tenant, p_domain, ARRAY['domain_admin', 'enablement_assessor', 'onboarding_authority'], t.declared_by, 'attesting a path''s accessibility');
  IF t.superseded_at IS NOT NULL OR t.state <> 'active' THEN RAISE EXCEPTION 'training path rejected (state): version % of % is not the current active version', p_version, t.path_key USING ERRCODE = '22023'; END IF;
  IF p_digest IS DISTINCT FROM t.digest THEN RAISE EXCEPTION 'training path rejected (stale): version % is at digest %…, not the one attested (%…)', p_version, left(t.digest, 12), left(coalesce(p_digest, '<none>'), 12) USING ERRCODE = '22023'; END IF;
  IF p_verdict NOT IN ('accessible', 'inaccessible') THEN RAISE EXCEPTION 'training path rejected (verdict): accessible or inaccessible' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_statement, ''))) < 8 THEN RAISE EXCEPTION 'training path rejected (statement): an attestation states what was checked (8+ characters)' USING ERRCODE = '22023'; END IF;
  INSERT INTO implementation.path_attestations (attestation_id, tenant_id, domain_id, path_id, path_version, path_digest, verdict, statement, attested_by, correlation_id)
  VALUES (p_attestation, p_tenant, p_domain, p_path, p_version, t.digest, p_verdict, btrim(p_statement), p_actor, p_correlation);
  PERFORM implementation.imp_event(p_tenant, p_domain, 'training_path', p_path, p_version, 'path.attested', p_actor, jsonb_build_object('verdict', p_verdict, 'digest', t.digest), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM implementation.path_attestations x WHERE x.attestation_id = p_attestation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION implementation.attest_path(uuid, uuid, uuid, uuid, int, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION implementation.attest_path(uuid, uuid, uuid, uuid, int, text, text, text, uuid, uuid) TO eye_commit;

/* RECORD training (implementation.training.record — the implementation lead or an enablement assessor; a named human ≠ the subject): the
   subject holds one of the path's roles in the domain; purpose enablement_readiness only; retained ≤ 3 years (default 2). The ledger names
   the record and the path, never the subject or the outcome (the record itself is subject-visible under RLS). */
CREATE OR REPLACE FUNCTION implementation.record_training(p_record uuid, p_path uuid, p_tenant uuid, p_domain uuid, p_version int, p_subject uuid, p_state text, p_purpose text, p_note text,
                                                          p_retain_days int, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = implementation, onboarding, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t implementation.training_paths%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['implementation.training.record']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM implementation.imp_actor('training record', p_actor);
  PERFORM implementation.imp_human('training record', p_actor, 'recording a person''s training');
  IF NOT onboarding.holds_role(p_actor, p_tenant, p_domain, ARRAY['implementation_lead', 'enablement_assessor']) THEN
    RAISE EXCEPTION 'training record rejected (authority): training completion is recorded by the implementation lead or an enablement assessor' USING ERRCODE = '42501';
  END IF;
  IF p_subject = p_actor THEN RAISE EXCEPTION 'training record rejected (separation_of_duties): nobody records their own training' USING ERRCODE = '42501'; END IF;
  IF p_purpose IS DISTINCT FROM 'enablement_readiness' THEN
    RAISE EXCEPTION 'training record rejected (purpose): a training record serves enablement readiness only — never a performance purpose (asked: %)', coalesce(p_purpose, '<none>') USING ERRCODE = '22023';
  END IF;
  SELECT * INTO t FROM implementation.training_paths x WHERE x.path_id = p_path AND x.version = p_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'training record rejected (unknown_path): % has no version % in this domain', p_path, p_version USING ERRCODE = '23503'; END IF;
  IF t.superseded_at IS NOT NULL OR t.state <> 'active' THEN RAISE EXCEPTION 'training record rejected (state): version % of % is not the current active version', p_version, t.path_key USING ERRCODE = '22023'; END IF;
  IF onboarding.principal_kind(p_subject) IS DISTINCT FROM 'human' OR NOT onboarding.holds_role(p_subject, p_tenant, p_domain, t.roles) THEN
    RAISE EXCEPTION 'training record rejected (subject): the subject is an active human holding one of % in the domain', array_to_string(t.roles, ', ') USING ERRCODE = '22023';
  END IF;
  IF p_state NOT IN ('complete', 'not_yet') THEN RAISE EXCEPTION 'training record rejected (state_value): complete or not_yet — no score, no rank' USING ERRCODE = '22023'; END IF;
  IF coalesce(p_retain_days, 730) NOT BETWEEN 30 AND 1095 THEN RAISE EXCEPTION 'training record rejected (retention): retained 30–1095 days' USING ERRCODE = '22023'; END IF;
  INSERT INTO implementation.training_records (record_id, tenant_id, domain_id, path_id, path_version, subject_principal_id, state, purpose, note, recorded_by, retain_until, correlation_id)
  VALUES (p_record, p_tenant, p_domain, p_path, p_version, p_subject, p_state, p_purpose, nullif(btrim(coalesce(p_note, '')), ''), p_actor,
          clock_timestamp() + make_interval(days => coalesce(p_retain_days, 730)), p_correlation);
  PERFORM implementation.imp_event(p_tenant, p_domain, 'training_record', p_record, p_version, 'training.recorded', p_actor, jsonb_build_object('path_id', p_path, 'path_key', t.path_key), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM implementation.training_records x WHERE x.record_id = p_record);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION implementation.record_training(uuid, uuid, uuid, uuid, int, uuid, text, text, text, int, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION implementation.record_training(uuid, uuid, uuid, uuid, int, uuid, text, text, text, int, uuid, uuid) TO eye_commit;

/* RECORD competence (implementation.competence.record — HUMAN-GATED: a named enablement assessor of the domain, ≠ the subject, never an
   implementation lead; complete | not_yet only; purpose enablement_readiness). */
CREATE OR REPLACE FUNCTION implementation.record_competence(p_record uuid, p_tenant uuid, p_domain uuid, p_key text, p_role text, p_subject uuid, p_outcome text, p_purpose text, p_note text,
                                                            p_retain_days int, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = implementation, onboarding, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['implementation.competence.record']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM implementation.imp_actor('competence record', p_actor);
  PERFORM implementation.imp_human('competence record', p_actor, 'recording a person''s competence');
  IF NOT EXISTS (SELECT 1 FROM identity.role_bindings b WHERE b.principal_id = p_actor AND b.role_code = 'enablement_assessor' AND b.revoked_at IS NULL AND b.tenant_id = p_tenant
                                                       AND b.scope = 'DOMAIN' AND b.domain_id = p_domain) THEN
    RAISE EXCEPTION 'competence record rejected (authority): competence is recorded by a named enablement assessor of this domain' USING ERRCODE = '42501';
  END IF;
  IF onboarding.holds_role(p_actor, p_tenant, p_domain, ARRAY['implementation_lead']) THEN
    RAISE EXCEPTION 'competence record rejected (separation_of_duties): an implementation lead records training, never competence' USING ERRCODE = '42501';
  END IF;
  IF p_subject = p_actor THEN RAISE EXCEPTION 'competence record rejected (separation_of_duties): nobody assesses their own competence' USING ERRCODE = '42501'; END IF;
  IF p_purpose IS DISTINCT FROM 'enablement_readiness' THEN
    RAISE EXCEPTION 'competence record rejected (purpose): a competence record serves enablement readiness only — never a performance purpose (asked: %)', coalesce(p_purpose, '<none>') USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_key, '') !~ '^[a-z][a-z0-9_.-]{2,62}$' THEN RAISE EXCEPTION 'competence record rejected (key): a competence key is lower-case (3–63 characters)' USING ERRCODE = '22023'; END IF;
  IF onboarding.principal_kind(p_subject) IS DISTINCT FROM 'human' OR NOT onboarding.holds_role(p_subject, p_tenant, p_domain, ARRAY[p_role]) THEN
    RAISE EXCEPTION 'competence record rejected (subject): the subject is an active human holding % in the domain', coalesce(p_role, '<none>') USING ERRCODE = '22023';
  END IF;
  IF p_outcome NOT IN ('complete', 'not_yet') THEN RAISE EXCEPTION 'competence record rejected (outcome): complete or not_yet — no score, no rank, no performance inference' USING ERRCODE = '22023'; END IF;
  IF coalesce(p_retain_days, 730) NOT BETWEEN 30 AND 1095 THEN RAISE EXCEPTION 'competence record rejected (retention): retained 30–1095 days' USING ERRCODE = '22023'; END IF;
  INSERT INTO implementation.competence_records (record_id, tenant_id, domain_id, competence_key, role_code, subject_principal_id, outcome, purpose, evidence_note, assessor_principal_id, retain_until, correlation_id)
  VALUES (p_record, p_tenant, p_domain, p_key, p_role, p_subject, p_outcome, p_purpose, nullif(btrim(coalesce(p_note, '')), ''), p_actor,
          clock_timestamp() + make_interval(days => coalesce(p_retain_days, 730)), p_correlation);
  PERFORM implementation.imp_event(p_tenant, p_domain, 'competence_record', p_record, NULL, 'competence.recorded', p_actor, jsonb_build_object('competence_key', p_key, 'role', p_role), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM implementation.competence_records x WHERE x.record_id = p_record);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION implementation.record_competence(uuid, uuid, uuid, text, text, uuid, text, text, text, int, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION implementation.record_competence(uuid, uuid, uuid, text, text, uuid, text, text, text, int, uuid, uuid) TO eye_commit;

-- §AD.2 COHORTS ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* A COHORT = role × rollout wave (never a person): its members are the holders of the role whose binding began inside the wave's window. */
CREATE TABLE implementation.cohorts (
  cohort_id        uuid PRIMARY KEY,
  scope            text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  programme_id     uuid NOT NULL,
  role_code        text NOT NULL REFERENCES identity.roles (code),
  wave_key         text NOT NULL CHECK (wave_key ~ '^[a-z][a-z0-9_.-]{1,40}$'),
  bound_from       timestamptz,
  bound_to         timestamptz,
  declared_by      uuid NOT NULL,
  declared_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id   uuid NOT NULL,
  CONSTRAINT ico_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT ico_window CHECK (bound_from IS NULL OR bound_to IS NULL OR bound_to > bound_from),
  CONSTRAINT ico_once UNIQUE (tenant_id, domain_id, role_code, wave_key)
);

/* DECLARE a cohort (implementation.cohort.declare — the implementation lead): dimensions {role, wave} ONLY; a person dimension is refused. */
CREATE OR REPLACE FUNCTION implementation.declare_cohort(p_cohort uuid, p_programme uuid, p_tenant uuid, p_domain uuid, p_dimensions jsonb, p_from timestamptz, p_to timestamptz,
                                                         p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = implementation, onboarding, observation, identity, analytics, ctx, public, pg_catalog, pg_temp AS $$
DECLARE pr implementation.programmes%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['implementation.cohort.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM implementation.imp_actor('adoption cohort', p_actor);
  IF NOT onboarding.holds_role(p_actor, p_tenant, p_domain, ARRAY['implementation_lead']) THEN
    RAISE EXCEPTION 'adoption cohort rejected (authority): a cohort is declared by the implementation lead' USING ERRCODE = '42501';
  END IF;
  IF analytics.json_keys(coalesce(p_dimensions, '{}'::jsonb)) && analytics.person_dimensions() THEN
    RAISE EXCEPTION 'adoption cohort rejected (person): a cohort is a role × a rollout wave, never a person (%)', array_to_string(analytics.json_keys(p_dimensions), ', ') USING ERRCODE = '42501';
  END IF;
  IF NOT (analytics.json_keys(coalesce(p_dimensions, '{}'::jsonb)) <@ ARRAY['role', 'wave']) OR p_dimensions ->> 'role' IS NULL OR p_dimensions ->> 'wave' IS NULL THEN
    RAISE EXCEPTION 'adoption cohort rejected (dimensions): a cohort names exactly {role, wave}' USING ERRCODE = '22023';
  END IF;
  pr := implementation.imp_programme(p_tenant, p_programme, 'adoption cohort');
  IF pr.target_domain_id <> p_domain THEN RAISE EXCEPTION 'adoption cohort rejected (unknown_programme): the programme targets another domain' USING ERRCODE = '23503'; END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.roles r WHERE r.code = p_dimensions ->> 'role') THEN RAISE EXCEPTION 'adoption cohort rejected (role): % is not a role', p_dimensions ->> 'role' USING ERRCODE = '22023'; END IF;
  IF (p_dimensions ->> 'wave') !~ '^[a-z][a-z0-9_.-]{1,40}$' THEN RAISE EXCEPTION 'adoption cohort rejected (wave): a wave key is lower-case' USING ERRCODE = '22023'; END IF;
  IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_to <= p_from THEN RAISE EXCEPTION 'adoption cohort rejected (window): the wave ends after it begins' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM implementation.cohorts c WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.role_code = p_dimensions ->> 'role' AND c.wave_key = p_dimensions ->> 'wave') THEN
    RAISE EXCEPTION 'adoption cohort rejected (duplicate): % × % is declared', p_dimensions ->> 'role', p_dimensions ->> 'wave' USING ERRCODE = '22023';
  END IF;
  INSERT INTO implementation.cohorts (cohort_id, tenant_id, domain_id, programme_id, role_code, wave_key, bound_from, bound_to, declared_by, correlation_id)
  VALUES (p_cohort, p_tenant, p_domain, p_programme, p_dimensions ->> 'role', p_dimensions ->> 'wave', p_from, p_to, p_actor, p_correlation);
  PERFORM implementation.imp_event(p_tenant, p_domain, 'cohort', p_cohort, NULL, 'cohort.declared', p_actor, jsonb_build_object('role', p_dimensions ->> 'role', 'wave', p_dimensions ->> 'wave'), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM implementation.cohorts x WHERE x.cohort_id = p_cohort);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION implementation.declare_cohort(uuid, uuid, uuid, uuid, jsonb, timestamptz, timestamptz, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION implementation.declare_cohort(uuid, uuid, uuid, uuid, jsonb, timestamptz, timestamptz, uuid, uuid) TO eye_commit;

-- §AD.3 SHADOW WORKFLOWS ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* A SHADOW FINDING: practice continuing outside the governed workflow — a legacy upload attempted after cutover against the RETIRED legacy
   upload contract (the observation port refuses it; the finding cites the refused attempt). Open until resolved with a remediation. */
CREATE TABLE implementation.shadow_findings (
  finding_id       uuid PRIMARY KEY,
  scope            text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  source_id        uuid NOT NULL,
  source_key       text NOT NULL,
  attempt          jsonb NOT NULL CHECK (jsonb_typeof(attempt) = 'object'),
  state            text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'resolved')),
  recorded_by      uuid NOT NULL,
  recorded_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  resolved_by      uuid,
  resolved_at      timestamptz,
  remediation      text,
  correlation_id   uuid NOT NULL,
  CONSTRAINT isf_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT isf_resolved CHECK ((state = 'resolved') = (resolved_at IS NOT NULL AND resolved_by IS NOT NULL AND length(btrim(coalesce(remediation, ''))) >= 8))
);
/* The declared SHADOW-PROCESS REVIEW of a programme (append-only): a named human states what was reviewed. */
CREATE TABLE implementation.shadow_reviews (
  review_id        uuid PRIMARY KEY,
  scope            text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  programme_id     uuid NOT NULL,
  statement        text NOT NULL CHECK (length(btrim(statement)) >= 12),
  open_findings    int  NOT NULL CHECK (open_findings >= 0),
  reviewed_by      uuid NOT NULL,
  reviewed_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id   uuid NOT NULL,
  CONSTRAINT isr_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);

/* RECORD a shadow finding (implementation.shadow.record — the lead, a domain admin, a data steward, a collection manager or an attention
   agent): the named source is an UPLOAD contract of the domain and RETIRED (a live contract is not a shadow workflow). */
CREATE OR REPLACE FUNCTION implementation.record_shadow(p_finding uuid, p_tenant uuid, p_domain uuid, p_source uuid, p_attempt jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = implementation, onboarding, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s record;
BEGIN
  PERFORM observation.assert_authority(ARRAY['implementation.shadow.record']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM implementation.imp_actor('shadow finding', p_actor);
  SELECT c.source_id, c.source_key, c.connector_kind, c.lifecycle_state INTO s FROM observation.source_contracts_current c
   WHERE c.source_id = p_source AND c.tenant_id = p_tenant AND c.domain_id = p_domain ORDER BY c.contract_version DESC LIMIT 1;
  IF s.source_id IS NULL THEN RAISE EXCEPTION 'shadow finding rejected (unknown_source): % is not a source of this domain', p_source USING ERRCODE = '23503'; END IF;
  IF s.connector_kind <> 'upload' OR s.lifecycle_state NOT IN ('retired', 'superseded') THEN
    RAISE EXCEPTION 'shadow finding rejected (state): % is a % contract in state % — a shadow workflow is practice continuing on a RETIRED legacy upload contract', s.source_key, s.connector_kind, s.lifecycle_state USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(coalesce(p_attempt, 'null'::jsonb)) <> 'object' OR length(btrim(coalesce(p_attempt ->> 'refusal', ''))) < 8 THEN
    RAISE EXCEPTION 'shadow finding rejected (attempt): the finding cites the refused attempt (attempt.refusal: the server''s words)' USING ERRCODE = '22023';
  END IF;
  INSERT INTO implementation.shadow_findings (finding_id, tenant_id, domain_id, source_id, source_key, attempt, recorded_by, correlation_id)
  VALUES (p_finding, p_tenant, p_domain, p_source, s.source_key, p_attempt, p_actor, p_correlation);
  PERFORM implementation.imp_event(p_tenant, p_domain, 'shadow_finding', p_finding, NULL, 'shadow.recorded', p_actor, jsonb_build_object('source_id', p_source, 'source_key', s.source_key), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM implementation.shadow_findings x WHERE x.finding_id = p_finding);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION implementation.record_shadow(uuid, uuid, uuid, uuid, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION implementation.record_shadow(uuid, uuid, uuid, uuid, jsonb, uuid, uuid) TO eye_commit;

/* RESOLVE a finding (implementation.shadow.resolve — HUMAN-GATED: a domain admin or the onboarding authority, never a lead): the targeted
   remediation stated (PR-68-005). */
CREATE OR REPLACE FUNCTION implementation.resolve_shadow(p_finding uuid, p_tenant uuid, p_domain uuid, p_remediation text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = implementation, onboarding, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE f implementation.shadow_findings%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['implementation.shadow.resolve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM implementation.imp_actor('shadow finding', p_actor);
  SELECT * INTO f FROM implementation.shadow_findings x WHERE x.finding_id = p_finding AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'shadow finding rejected (unknown_finding): % is not a finding of this domain', p_finding USING ERRCODE = '23503'; END IF;
  PERFORM onboarding.assert_approver('shadow finding', p_actor, p_tenant, p_domain, ARRAY['domain_admin', 'onboarding_authority'], NULL, 'resolving a shadow finding');
  IF f.state <> 'open' THEN RAISE EXCEPTION 'shadow finding rejected (state): the finding is %', f.state USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_remediation, ''))) < 8 THEN RAISE EXCEPTION 'shadow finding rejected (remediation): the remediation is stated (8+ characters)' USING ERRCODE = '22023'; END IF;
  UPDATE implementation.shadow_findings SET state = 'resolved', resolved_by = p_actor, resolved_at = clock_timestamp(), remediation = btrim(p_remediation) WHERE finding_id = p_finding;
  PERFORM implementation.imp_event(p_tenant, p_domain, 'shadow_finding', p_finding, NULL, 'shadow.resolved', p_actor, jsonb_build_object('remediation', btrim(p_remediation)), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM implementation.shadow_findings x WHERE x.finding_id = p_finding);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION implementation.resolve_shadow(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION implementation.resolve_shadow(uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

/* DECLARE the shadow-process review (implementation.shadow.review — HUMAN-GATED: a domain admin or the onboarding authority, never a lead):
   records the open findings at the instant; a review with findings open does not satisfy the shadow_review item. */
CREATE OR REPLACE FUNCTION implementation.review_shadow(p_review uuid, p_programme uuid, p_tenant uuid, p_domain uuid, p_statement text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = implementation, onboarding, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE pr implementation.programmes%ROWTYPE; v_open int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['implementation.shadow.review']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM implementation.imp_actor('shadow finding', p_actor);
  PERFORM onboarding.assert_approver('shadow finding', p_actor, p_tenant, p_domain, ARRAY['domain_admin', 'onboarding_authority'], NULL, 'declaring the shadow-process review');
  pr := implementation.imp_programme(p_tenant, p_programme, 'shadow finding');
  IF pr.target_domain_id <> p_domain THEN RAISE EXCEPTION 'shadow finding rejected (unknown_programme): the programme targets another domain' USING ERRCODE = '23503'; END IF;
  IF length(btrim(coalesce(p_statement, ''))) < 12 THEN RAISE EXCEPTION 'shadow finding rejected (statement): the review states what was reviewed (12+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT count(*)::int INTO v_open FROM implementation.shadow_findings f WHERE f.tenant_id = p_tenant AND f.domain_id = p_domain AND f.state = 'open';
  INSERT INTO implementation.shadow_reviews (review_id, tenant_id, domain_id, programme_id, statement, open_findings, reviewed_by, correlation_id)
  VALUES (p_review, p_tenant, p_domain, p_programme, btrim(p_statement), v_open, p_actor, p_correlation);
  PERFORM implementation.imp_event(p_tenant, p_domain, 'shadow_review', p_review, NULL, 'shadow.reviewed', p_actor, jsonb_build_object('programme_id', p_programme, 'open_findings', v_open), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM implementation.shadow_reviews x WHERE x.review_id = p_review);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION implementation.review_shadow(uuid, uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION implementation.review_shadow(uuid, uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

-- §IM.2 READINESS AND THE GATE ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* A READINESS ITEM (DOMAIN = the programme's target domain; versioned). spec per kind:
     role_filled {role} · owner_resolved {responsibility} · training_coverage {path_key, roles[]} · competence_coverage {competence_key, roles[]}
     · accessibility_attested {path_key} · shadow_review {} · custom {statement, confirm_role}.
   accountable_role: who the gap escalates to. Nothing here stores "satisfied" — every item is evaluated LIVE. */
CREATE TABLE implementation.readiness_items (
  item_id          uuid NOT NULL,
  version          int  NOT NULL CHECK (version >= 1),
  scope            text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  programme_id     uuid NOT NULL,
  item_key         text NOT NULL CHECK (item_key ~ '^[a-z][a-z0-9_.-]{2,62}$'),
  kind             text NOT NULL CHECK (kind = ANY (implementation.readiness_kinds())),
  title            text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 200),
  spec             jsonb NOT NULL CHECK (jsonb_typeof(spec) = 'object'),
  blocking         boolean NOT NULL DEFAULT true,
  accountable_role text NOT NULL REFERENCES identity.roles (code),
  state            text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'retired')),
  digest           text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  declared_by      uuid NOT NULL,
  declared_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  superseded_at    timestamptz,
  retire_reason    text,
  correlation_id   uuid NOT NULL,
  PRIMARY KEY (item_id, version),
  CONSTRAINT iri_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT iri_retired CHECK ((state = 'retired') = (retire_reason IS NOT NULL))
);
CREATE UNIQUE INDEX iri_one_current ON implementation.readiness_items (programme_id, item_key) WHERE superseded_at IS NULL;
CREATE UNIQUE INDEX iri_item_current ON implementation.readiness_items (item_id) WHERE superseded_at IS NULL;

/* A custom item's CONFIRMATION by a named human holding the item's confirm_role (append-only; per item version). */
CREATE TABLE implementation.readiness_confirmations (
  confirmation_id  uuid PRIMARY KEY,
  scope            text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  item_id          uuid NOT NULL,
  item_version     int  NOT NULL,
  statement        text NOT NULL CHECK (length(btrim(statement)) >= 8),
  confirmed_by     uuid NOT NULL,
  confirmed_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id   uuid NOT NULL,
  FOREIGN KEY (item_id, item_version) REFERENCES implementation.readiness_items (item_id, version),
  CONSTRAINT irc_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);

/* A RESIDUAL-RISK ACCEPTANCE of one blocking item version (the onboarding authority, SIGNED `readiness`): the item stops blocking, shown as
   `accepted_residual`, never as satisfied. Never for the non-overridable kinds. Sealed in the same transaction (deferred constraint). */
CREATE TABLE implementation.residual_acceptances (
  acceptance_id    uuid PRIMARY KEY,
  scope            text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  programme_id     uuid NOT NULL,
  item_id          uuid NOT NULL,
  item_version     int  NOT NULL,
  reason           text NOT NULL CHECK (length(btrim(reason)) >= 12),
  digest           text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  accepted_by      uuid NOT NULL,
  accepted_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  signature_id     uuid,
  correlation_id   uuid NOT NULL,
  FOREIGN KEY (item_id, item_version) REFERENCES implementation.readiness_items (item_id, version),
  CONSTRAINT ira_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT ira_once UNIQUE (item_id, item_version)
);

/* A GATE EVALUATION recorded by implementation.gate.evaluate (append-only): what the gate said at the instant (the live evaluation is the
   authority; this is its history). */
CREATE TABLE implementation.gate_evaluations (
  evaluation_id    uuid PRIMARY KEY,
  scope            text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  programme_id     uuid NOT NULL,
  programme_version int NOT NULL,
  state            text NOT NULL CHECK (state IN ('ready', 'held', 'accepted', 'withdrawn')),
  gate_digest      text NOT NULL CHECK (gate_digest ~ '^[0-9a-f]{64}$'),
  evaluation       jsonb NOT NULL,
  items_raised     jsonb NOT NULL DEFAULT '[]'::jsonb,
  evaluated_by     uuid NOT NULL,
  evaluated_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id   uuid NOT NULL,
  CONSTRAINT ige_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX ige_programme ON implementation.gate_evaluations (programme_id, evaluated_at DESC);

/* THE GO-LIVE DECISION (PR-68-006's acceptance record): approve (SIGNED `readiness`, sealed in the same transaction) | withhold (recorded;
   nothing else changes — the prior safe operation stands, WS-20). claim is `demonstration` — this product never records a customer's own
   acceptance (R2). */
CREATE TABLE implementation.golive_decisions (
  decision_id      uuid PRIMARY KEY,
  scope            text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  programme_id     uuid NOT NULL,
  programme_version int NOT NULL,
  decision         text NOT NULL CHECK (decision IN ('approve', 'withhold')),
  gate_digest      text NOT NULL CHECK (gate_digest ~ '^[0-9a-f]{64}$'),
  cadence_id       uuid,
  journeys         jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(journeys) = 'array'),
  acceptance       jsonb NOT NULL CHECK (jsonb_typeof(acceptance) = 'object'),
  reason           text NOT NULL CHECK (length(btrim(reason)) >= 8),
  digest           text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  decided_by       uuid NOT NULL,
  decided_role     text NOT NULL CHECK (decided_role IN ('customer_sponsor', 'onboarding_authority')),
  decided_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  signature_id     uuid,
  claim            text NOT NULL DEFAULT 'demonstration' CHECK (claim = 'demonstration'),
  correlation_id   uuid NOT NULL,
  CONSTRAINT igd_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT igd_approve CHECK (decision <> 'approve' OR (cadence_id IS NOT NULL AND jsonb_array_length(journeys) >= 1))
);
CREATE UNIQUE INDEX igd_one_approval ON implementation.golive_decisions (programme_id) WHERE decision = 'approve';

/* A signed act is never left unsigned: at COMMIT an approval / a residual acceptance carries its signature (deferred). */
CREATE OR REPLACE FUNCTION implementation.imp_require_seal() RETURNS trigger
LANGUAGE plpgsql SET search_path = implementation, pg_catalog, pg_temp AS $$
DECLARE v_sig uuid;
BEGIN
  IF TG_TABLE_NAME = 'golive_decisions' THEN
    SELECT signature_id INTO v_sig FROM implementation.golive_decisions WHERE decision_id = NEW.decision_id;
    IF NEW.decision = 'approve' AND v_sig IS NULL THEN
      RAISE EXCEPTION 'go-live gate rejected (unsigned): a go-live approval is signed in the same act (no executive signing key signed it)' USING ERRCODE = '22023';
    END IF;
  ELSE
    SELECT signature_id INTO v_sig FROM implementation.residual_acceptances WHERE acceptance_id = NEW.acceptance_id;
    IF v_sig IS NULL THEN RAISE EXCEPTION 'readiness item rejected (unsigned): a residual-risk acceptance is signed in the same act' USING ERRCODE = '22023'; END IF;
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION implementation.imp_require_seal() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER igd_sealed AFTER INSERT ON implementation.golive_decisions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION implementation.imp_require_seal();
CREATE CONSTRAINT TRIGGER ira_sealed AFTER INSERT ON implementation.residual_acceptances DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION implementation.imp_require_seal();

/* The spec of a readiness item, validated per kind. */
CREATE OR REPLACE FUNCTION implementation.imp_validate_spec(p_tenant uuid, p_domain uuid, p_kind text, p_spec jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = implementation, identity, pg_catalog, pg_temp AS $$
DECLARE s jsonb := coalesce(p_spec, '{}'::jsonb); v_roles text[];
BEGIN
  IF jsonb_typeof(s) <> 'object' THEN RAISE EXCEPTION 'readiness item rejected (spec): the spec is an object' USING ERRCODE = '22023'; END IF;
  IF p_kind = 'role_filled' THEN
    IF NOT EXISTS (SELECT 1 FROM identity.roles r WHERE r.code = s ->> 'role') THEN RAISE EXCEPTION 'readiness item rejected (spec): role_filled names an existing role {role}' USING ERRCODE = '22023'; END IF;
    RETURN jsonb_build_object('role', s ->> 'role');
  ELSIF p_kind = 'owner_resolved' THEN
    IF coalesce(s ->> 'responsibility', '') !~ '^[a-z][a-z0-9_.-]{2,62}$' THEN RAISE EXCEPTION 'readiness item rejected (spec): owner_resolved names a responsibility key {responsibility} (e.g. risk.ownership)' USING ERRCODE = '22023'; END IF;
    RETURN jsonb_build_object('responsibility', s ->> 'responsibility');
  ELSIF p_kind IN ('training_coverage', 'competence_coverage') THEN
    SELECT array_agg(DISTINCT x ORDER BY x) INTO v_roles FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(s -> 'roles') = 'array' THEN s -> 'roles' ELSE '[]'::jsonb END) x;
    IF coalesce(cardinality(v_roles), 0) = 0 OR EXISTS (SELECT 1 FROM unnest(v_roles) r WHERE NOT EXISTS (SELECT 1 FROM identity.roles x WHERE x.code = r)) THEN
      RAISE EXCEPTION 'readiness item rejected (spec): % names the existing roles whose holders are covered {roles[]}', p_kind USING ERRCODE = '22023';
    END IF;
    IF p_kind = 'training_coverage' THEN
      IF (implementation.imp_path(p_tenant, p_domain, s ->> 'path_key')).path_id IS NULL THEN
        RAISE EXCEPTION 'readiness item rejected (spec): training_coverage names a training path of the domain {path_key}' USING ERRCODE = '22023';
      END IF;
      RETURN jsonb_build_object('path_key', s ->> 'path_key', 'roles', to_jsonb(v_roles));
    END IF;
    IF coalesce(s ->> 'competence_key', '') !~ '^[a-z][a-z0-9_.-]{2,62}$' THEN RAISE EXCEPTION 'readiness item rejected (spec): competence_coverage names its competence key' USING ERRCODE = '22023'; END IF;
    RETURN jsonb_build_object('competence_key', s ->> 'competence_key', 'roles', to_jsonb(v_roles));
  ELSIF p_kind = 'accessibility_attested' THEN
    IF (implementation.imp_path(p_tenant, p_domain, s ->> 'path_key')).path_id IS NULL THEN
      RAISE EXCEPTION 'readiness item rejected (spec): accessibility_attested names a training path of the domain {path_key}' USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object('path_key', s ->> 'path_key');
  ELSIF p_kind = 'shadow_review' THEN
    RETURN '{}'::jsonb;
  ELSIF p_kind = 'custom' THEN
    IF length(btrim(coalesce(s ->> 'statement', ''))) < 8 OR NOT EXISTS (SELECT 1 FROM identity.roles r WHERE r.code = s ->> 'confirm_role') THEN
      RAISE EXCEPTION 'readiness item rejected (spec): a custom item states what is confirmed and by which role {statement, confirm_role}' USING ERRCODE = '22023';
    END IF;
    IF s ->> 'confirm_role' = 'implementation_lead' THEN
      RAISE EXCEPTION 'readiness item rejected (separation_of_duties): an implementation lead never confirms readiness on the customer''s behalf' USING ERRCODE = '42501';
    END IF;
    RETURN jsonb_build_object('statement', btrim(s ->> 'statement'), 'confirm_role', s ->> 'confirm_role');
  END IF;
  RAISE EXCEPTION 'readiness item rejected (kind): the kind is one of %', array_to_string(implementation.readiness_kinds(), ', ') USING ERRCODE = '22023';
END $$;
REVOKE ALL ON FUNCTION implementation.imp_validate_spec(uuid, uuid, text, jsonb) FROM PUBLIC;

/* EVALUATE ONE ITEM, live → {satisfied, reason, facts}. Counts per role, never a name (the gate names only the role holders it needs). */
CREATE OR REPLACE FUNCTION implementation.evaluate_item(p_tenant uuid, p_domain uuid, p_programme uuid, p_kind text, p_spec jsonb, p_item uuid, p_version int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = implementation, service, identity, pg_catalog, pg_temp AS $$
DECLARE v_n int; v_done int; t implementation.training_paths%ROWTYPE; v_acc jsonb; v_res jsonb; v_roles text[]; v_open int; v_last_finding timestamptz; rv implementation.shadow_reviews%ROWTYPE;
BEGIN
  IF p_kind = 'role_filled' THEN
    SELECT count(DISTINCT h.principal_id)::int INTO v_n FROM implementation.imp_holders(p_tenant, p_domain, ARRAY[p_spec ->> 'role']) h;
    RETURN jsonb_build_object('satisfied', v_n > 0, 'facts', jsonb_build_object('role', p_spec ->> 'role', 'holders', v_n),
                              'reason', CASE WHEN v_n = 0 THEN format('nobody holds %s in the domain — an unfilled accountable role is not overridable', p_spec ->> 'role') END);
  ELSIF p_kind = 'owner_resolved' THEN
    v_res := service.owner_resolution(p_tenant, p_domain, p_spec ->> 'responsibility');
    RETURN jsonb_build_object('satisfied', v_res ->> 'state' = 'resolved',
                              'facts', jsonb_build_object('responsibility', p_spec ->> 'responsibility', 'state', v_res ->> 'state', 'owner_role', v_res ->> 'owner_role',
                                                          'holders', jsonb_array_length(coalesce(v_res -> 'principals', '[]'::jsonb)), 'matrix_id', v_res -> 'matrix_id', 'matrix_version', v_res -> 'version',
                                                          'escalation_path', v_res -> 'escalation_path'),
                              'reason', CASE WHEN v_res ->> 'state' <> 'resolved' THEN format('the accountable owner of %s is %s: %s', p_spec ->> 'responsibility', v_res ->> 'state',
                                                                                              coalesce(v_res ->> 'reason', 'no unambiguous owner')) END);
  ELSIF p_kind IN ('training_coverage', 'accessibility_attested') THEN
    t := implementation.imp_path(p_tenant, p_domain, p_spec ->> 'path_key');
    IF t.path_id IS NULL OR t.state <> 'active' THEN
      RETURN jsonb_build_object('satisfied', false, 'facts', jsonb_build_object('path_key', p_spec ->> 'path_key'), 'reason', format('no active training path %s in the domain', p_spec ->> 'path_key'));
    END IF;
    v_acc := implementation.imp_accessibility(t.path_id, t.version);
    IF p_kind = 'accessibility_attested' THEN
      RETURN jsonb_build_object('satisfied', v_acc ->> 'state' = 'accessible', 'facts', jsonb_build_object('path_key', t.path_key, 'path_version', t.version, 'accessibility', v_acc ->> 'state'),
                                'reason', CASE WHEN v_acc ->> 'state' <> 'accessible' THEN format('path %s v%s is %s — an inaccessible or unattested path blocks readiness', t.path_key, t.version, v_acc ->> 'state') END);
    END IF;
    SELECT array_agg(x) INTO v_roles FROM jsonb_array_elements_text(p_spec -> 'roles') x;
    SELECT count(DISTINCT h.principal_id)::int,
           count(DISTINCT h.principal_id) FILTER (WHERE (SELECT r.state FROM implementation.training_records r WHERE r.path_id = t.path_id AND r.path_version = t.version
                                                         AND r.subject_principal_id = h.principal_id AND r.retain_until > clock_timestamp() ORDER BY r.recorded_at DESC, r.record_id DESC LIMIT 1) = 'complete')::int
      INTO v_n, v_done FROM implementation.imp_holders(p_tenant, p_domain, v_roles) h;
    RETURN jsonb_build_object('satisfied', v_acc ->> 'state' = 'accessible' AND v_n > 0 AND v_done = v_n,
                              'facts', jsonb_build_object('path_key', t.path_key, 'path_version', t.version, 'accessibility', v_acc ->> 'state', 'roles', p_spec -> 'roles', 'holders', v_n, 'complete', v_done),
                              'reason', CASE WHEN v_acc ->> 'state' <> 'accessible' THEN format('path %s v%s is %s — training on an inaccessible or unattested path does not count', t.path_key, t.version, v_acc ->> 'state')
                                             WHEN v_n = 0 THEN format('nobody holds %s in the domain', array_to_string(v_roles, ' or '))
                                             WHEN v_done < v_n THEN format('%s of %s holders of %s have completed path %s v%s', v_done, v_n, array_to_string(v_roles, ' or '), t.path_key, t.version) END);
  ELSIF p_kind = 'competence_coverage' THEN
    SELECT array_agg(x) INTO v_roles FROM jsonb_array_elements_text(p_spec -> 'roles') x;
    SELECT count(DISTINCT h.principal_id)::int,
           count(DISTINCT h.principal_id) FILTER (WHERE (SELECT c.outcome FROM implementation.competence_records c WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain
                                                         AND c.competence_key = p_spec ->> 'competence_key' AND c.subject_principal_id = h.principal_id AND c.retain_until > clock_timestamp()
                                                         ORDER BY c.recorded_at DESC, c.record_id DESC LIMIT 1) = 'complete')::int
      INTO v_n, v_done FROM implementation.imp_holders(p_tenant, p_domain, v_roles) h;
    RETURN jsonb_build_object('satisfied', v_n > 0 AND v_done = v_n, 'facts', jsonb_build_object('competence_key', p_spec ->> 'competence_key', 'roles', p_spec -> 'roles', 'holders', v_n, 'complete', v_done),
                              'reason', CASE WHEN v_n = 0 THEN format('nobody holds %s in the domain', array_to_string(v_roles, ' or '))
                                             WHEN v_done < v_n THEN format('%s of %s holders of %s are recorded competent in %s', v_done, v_n, array_to_string(v_roles, ' or '), p_spec ->> 'competence_key') END);
  ELSIF p_kind = 'shadow_review' THEN
    SELECT count(*) FILTER (WHERE f.state = 'open')::int, max(f.recorded_at) INTO v_open, v_last_finding FROM implementation.shadow_findings f WHERE f.tenant_id = p_tenant AND f.domain_id = p_domain;
    SELECT * INTO rv FROM implementation.shadow_reviews r WHERE r.programme_id = p_programme AND r.tenant_id = p_tenant AND r.domain_id = p_domain ORDER BY r.reviewed_at DESC, r.review_id DESC LIMIT 1;
    RETURN jsonb_build_object('satisfied', v_open = 0 AND rv.review_id IS NOT NULL AND rv.open_findings = 0 AND (v_last_finding IS NULL OR rv.reviewed_at >= v_last_finding),
                              'facts', jsonb_build_object('open_findings', v_open, 'review_id', rv.review_id, 'reviewed_at', rv.reviewed_at),
                              'reason', CASE WHEN v_open > 0 THEN format('%s shadow finding(s) open — practice continues outside the governed workflow', v_open)
                                             WHEN rv.review_id IS NULL THEN 'no shadow-process review is declared'
                                             WHEN rv.open_findings > 0 OR (v_last_finding IS NOT NULL AND rv.reviewed_at < v_last_finding) THEN 'the shadow-process review predates the latest finding; it is declared again' END);
  ELSIF p_kind = 'custom' THEN
    SELECT count(*)::int INTO v_n FROM implementation.readiness_confirmations c WHERE c.item_id = p_item AND c.item_version = p_version;
    RETURN jsonb_build_object('satisfied', v_n > 0, 'facts', jsonb_build_object('confirm_role', p_spec ->> 'confirm_role', 'confirmations', v_n),
                              'reason', CASE WHEN v_n = 0 THEN format('not yet confirmed by a %s', p_spec ->> 'confirm_role') END);
  END IF;
  RETURN jsonb_build_object('satisfied', false, 'reason', format('unknown kind %s', p_kind), 'facts', '{}'::jsonb);
END $$;
REVOKE ALL ON FUNCTION implementation.evaluate_item(uuid, uuid, uuid, text, jsonb, uuid, int) FROM PUBLIC;

/* A value measure's standing for READINESS USE (PR-68-005: a measure that misleads blocks its use): the B92 definition must be APPROVED in
   the domain and carry no approved, unexpired B92 EXCEPTION (analytics.metric_exceptions — the exception port is how a measure is marked
   not to be read at face value). A measure can only BLOCK: a value, a cohort result or a percentage never satisfies anything. */
CREATE OR REPLACE FUNCTION implementation.measure_use(p_tenant uuid, p_domain uuid, p_metric_key text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, pg_catalog, pg_temp AS $$
DECLARE d record; e record;
BEGIN
  SELECT x.definition_id, x.version INTO d FROM analytics.metric_definitions x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.metric_key = p_metric_key AND x.state = 'approved';
  IF d.definition_id IS NULL THEN
    RETURN jsonb_build_object('usable', false, 'state', 'no_approved_definition', 'reason', format('%s has no approved definition in the domain: it cannot be cited in readiness', p_metric_key));
  END IF;
  SELECT x.exception_id, x.reason, x.period_key INTO e FROM analytics.metric_exceptions x
   WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.metric_key = p_metric_key AND x.state = 'approved' AND x.expires_at > clock_timestamp()
   ORDER BY x.decided_at DESC LIMIT 1;
  IF e.exception_id IS NOT NULL THEN
    RETURN jsonb_build_object('usable', false, 'state', 'marked_misleading', 'exception_id', e.exception_id, 'definition_version', d.version,
                              'reason', format('%s carries an approved exception (%s, %s): it is not read at face value — its readiness use is blocked until the exception ends or the measure is no longer cited', p_metric_key, e.period_key, e.reason));
  END IF;
  RETURN jsonb_build_object('usable', true, 'state', 'cited', 'definition_version', d.version);
END $$;
REVOKE ALL ON FUNCTION implementation.measure_use(uuid, uuid, text) FROM PUBLIC;

/* THE GATE, evaluated LIVE (a definer read under the N-01 guard): every current readiness item (satisfied | unsatisfied | accepted_residual),
   every value measure cited in readiness (it may block, never release), the programme's own state. ready ⇔ the programme is in progress,
   at least one item is declared, and no blocking line stands. The digest binds the programme version, each item version and its state, and
   each measure's state — what an approver names. */
CREATE OR REPLACE FUNCTION implementation.evaluate_gate(p_tenant uuid, p_domain uuid, p_programme uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = implementation, observation, pg_catalog, pg_temp AS $$
DECLARE pr implementation.programmes%ROWTYPE; it record; v_eval jsonb; v_items jsonb := '[]'::jsonb; v_measures jsonb := '[]'::jsonb; v_blocking jsonb := '[]'::jsonb; v_state text;
        v_res implementation.residual_acceptances%ROWTYPE; v_line jsonb; v_status text; m record; v_use jsonb; v_gap boolean := false; v_digest text;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the go-live gate of an implementation programme');
  SELECT * INTO pr FROM implementation.programmes x WHERE x.programme_id = p_programme AND x.tenant_id = p_tenant AND x.superseded_at IS NULL;
  IF NOT FOUND OR pr.target_domain_id <> p_domain THEN
    RAISE EXCEPTION 'go-live gate rejected (unknown_programme): % is not an implementation programme of this domain', p_programme USING ERRCODE = '23503';
  END IF;
  FOR it IN SELECT * FROM implementation.readiness_items r WHERE r.programme_id = p_programme AND r.superseded_at IS NULL AND r.state = 'active' ORDER BY r.item_key LOOP
    v_eval := implementation.evaluate_item(p_tenant, p_domain, p_programme, it.kind, it.spec, it.item_id, it.version);
    SELECT * INTO v_res FROM implementation.residual_acceptances a WHERE a.item_id = it.item_id AND a.item_version = it.version AND a.signature_id IS NOT NULL;
    v_status := CASE WHEN (v_eval ->> 'satisfied')::boolean THEN 'satisfied'
                     WHEN v_res.acceptance_id IS NOT NULL AND NOT (it.kind = ANY (implementation.nonoverridable_kinds())) THEN 'accepted_residual'
                     ELSE 'unsatisfied' END;
    v_line := jsonb_build_object('item_id', it.item_id, 'version', it.version, 'item_key', it.item_key, 'kind', it.kind, 'title', it.title, 'blocking', it.blocking,
                                 'accountable_role', it.accountable_role, 'state', v_status, 'reason', v_eval -> 'reason', 'facts', v_eval -> 'facts', 'digest', it.digest,
                                 'overridable', NOT (it.kind = ANY (implementation.nonoverridable_kinds())),
                                 'residual', CASE WHEN v_res.acceptance_id IS NULL THEN NULL ELSE jsonb_build_object('acceptance_id', v_res.acceptance_id, 'accepted_by', v_res.accepted_by,
                                                                                                                      'accepted_at', v_res.accepted_at, 'reason', v_res.reason) END);
    v_items := v_items || jsonb_build_array(v_line);
    IF it.blocking AND v_status = 'unsatisfied' THEN
      v_blocking := v_blocking || jsonb_build_array(jsonb_build_object('kind', it.kind, 'item_key', it.item_key, 'title', it.title, 'reason', v_eval -> 'reason',
                                                                       'accountable_role', it.accountable_role, 'overridable', NOT (it.kind = ANY (implementation.nonoverridable_kinds()))));
      IF it.kind IN ('role_filled', 'owner_resolved') THEN v_gap := true; END IF;
    END IF;
  END LOOP;
  FOR m IN SELECT i.item_key, i.attributes ->> 'metric_key' AS metric_key FROM implementation.programme_items i
            WHERE i.programme_id = p_programme AND i.kind = 'value_measure' AND i.superseded_at IS NULL AND i.state = 'active' AND coalesce((i.attributes ->> 'cited_in_readiness')::boolean, false)
            ORDER BY i.item_key LOOP
    v_use := implementation.measure_use(p_tenant, p_domain, m.metric_key);
    v_measures := v_measures || jsonb_build_array(jsonb_build_object('item_key', m.item_key, 'metric_key', m.metric_key) || v_use);
    IF NOT (v_use ->> 'usable')::boolean THEN
      v_blocking := v_blocking || jsonb_build_array(jsonb_build_object('kind', 'measure_use', 'item_key', m.item_key, 'title', format('readiness use of %s', m.metric_key),
                                                                       'reason', v_use -> 'reason', 'accountable_role', 'customer_sponsor', 'overridable', false));
    END IF;
  END LOOP;
  IF pr.state <> 'in_progress' AND pr.state NOT IN ('accepted', 'withdrawn') THEN
    v_blocking := v_blocking || jsonb_build_array(jsonb_build_object('kind', 'programme', 'item_key', pr.programme_key, 'title', 'the programme',
      'reason', CASE pr.state WHEN 'planned' THEN 'the programme is planned, not started' ELSE format('the programme is held: %s', pr.held_reasons::text) END,
      'accountable_role', 'customer_sponsor', 'overridable', false));
  END IF;
  IF jsonb_array_length(v_items) = 0 THEN
    v_blocking := v_blocking || jsonb_build_array(jsonb_build_object('kind', 'undeclared', 'item_key', pr.programme_key, 'title', 'readiness',
      'reason', 'the programme declares no readiness item: nothing is shown ready by inference', 'accountable_role', 'implementation_lead', 'overridable', false));
  END IF;
  v_state := CASE WHEN pr.state IN ('accepted', 'withdrawn') THEN pr.state WHEN jsonb_array_length(v_blocking) = 0 THEN 'ready' ELSE 'held' END;
  v_digest := onboarding.digest(jsonb_build_object('programme_id', pr.programme_id, 'programme_version', pr.version, 'programme_digest', pr.digest, 'state', v_state,
    'items', (SELECT coalesce(jsonb_agg(jsonb_build_object('item_id', x ->> 'item_id', 'version', x -> 'version', 'state', x ->> 'state', 'blocking', x -> 'blocking') ORDER BY x ->> 'item_key'), '[]'::jsonb)
                FROM jsonb_array_elements(v_items) x),
    'measures', (SELECT coalesce(jsonb_agg(jsonb_build_object('metric_key', x ->> 'metric_key', 'state', x ->> 'state') ORDER BY x ->> 'item_key'), '[]'::jsonb) FROM jsonb_array_elements(v_measures) x)));
  RETURN jsonb_build_object('programme_id', pr.programme_id, 'programme_version', pr.version, 'programme_state', pr.state, 'domain_id', p_domain, 'state', v_state, 'digest', v_digest,
                            'items', v_items, 'measures', v_measures, 'blocking', v_blocking, 'owner_gap', v_gap, 'evaluated_at', clock_timestamp(),
                            'rule', 'ready only when every blocking item is satisfied or accepted as signed residual risk; an unfilled accountable role, an unresolved owner and an inaccessible path are never overridable; no measure, cohort result or percentage releases the gate');
END $$;
REVOKE ALL ON FUNCTION implementation.evaluate_gate(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION implementation.evaluate_gate(uuid, uuid, uuid) TO eye_app, eye_commit;

/* DECLARE a readiness item or its next version (implementation.readiness.declare — the implementation lead or the onboarding authority; a DOMAIN
   route on the target domain). WEAKENING an item (blocking → non-blocking) is the onboarding authority's act (the approver test), and never
   for an unsatisfied non-overridable item. */
CREATE OR REPLACE FUNCTION implementation.declare_readiness(p_item uuid, p_programme uuid, p_tenant uuid, p_domain uuid, p_key text, p_kind text, p_title text, p_spec jsonb, p_blocking boolean,
                                                           p_accountable_role text, p_expected_version int, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = implementation, onboarding, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE pr implementation.programmes%ROWTYPE; o implementation.readiness_items%ROWTYPE; v_spec jsonb; v_id uuid; v_version int; v_digest text; v_eval jsonb; v_role text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['implementation.readiness.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM implementation.imp_actor('readiness item', p_actor);
  IF NOT onboarding.holds_role(p_actor, p_tenant, NULL, ARRAY['implementation_lead', 'onboarding_authority']) THEN
    RAISE EXCEPTION 'readiness item rejected (authority): readiness is declared by the implementation lead or the onboarding authority' USING ERRCODE = '42501';
  END IF;
  pr := implementation.imp_programme(p_tenant, p_programme, 'readiness item');
  IF pr.target_domain_id <> p_domain THEN RAISE EXCEPTION 'readiness item rejected (unknown_programme): the programme targets another domain' USING ERRCODE = '23503'; END IF;
  IF pr.state IN ('accepted', 'withdrawn') THEN RAISE EXCEPTION 'readiness item rejected (state): the programme is %', pr.state USING ERRCODE = '22023'; END IF;
  IF NOT (coalesce(p_kind, '') = ANY (implementation.readiness_kinds())) THEN
    RAISE EXCEPTION 'readiness item rejected (kind): the kind is one of %', array_to_string(implementation.readiness_kinds(), ', ') USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_key, '') !~ '^[a-z][a-z0-9_.-]{2,62}$' THEN RAISE EXCEPTION 'readiness item rejected (key): an item key is lower-case (3–63 characters)' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_title, ''))) NOT BETWEEN 4 AND 200 THEN RAISE EXCEPTION 'readiness item rejected (title): a title of 4–200 characters' USING ERRCODE = '22023'; END IF;
  v_spec := implementation.imp_validate_spec(p_tenant, p_domain, p_kind, p_spec);
  v_role := coalesce(p_accountable_role, CASE p_kind WHEN 'role_filled' THEN 'domain_admin' WHEN 'owner_resolved' THEN 'onboarding_authority' WHEN 'custom' THEN v_spec ->> 'confirm_role'
                                                     ELSE 'customer_sponsor' END);
  IF NOT EXISTS (SELECT 1 FROM identity.roles r WHERE r.code = v_role) THEN RAISE EXCEPTION 'readiness item rejected (accountable_role): % is not a role', v_role USING ERRCODE = '22023'; END IF;
  SELECT * INTO o FROM implementation.readiness_items x WHERE x.programme_id = p_programme AND x.item_key = p_key AND x.superseded_at IS NULL FOR UPDATE;
  IF FOUND THEN
    IF p_expected_version IS DISTINCT FROM o.version THEN
      RAISE EXCEPTION 'readiness item rejected (stale): % is at version %, not %', p_key, o.version, coalesce(p_expected_version::text, '<none>') USING ERRCODE = '22023';
    END IF;
    IF o.state = 'retired' THEN RAISE EXCEPTION 'readiness item rejected (state): % is retired', p_key USING ERRCODE = '22023'; END IF;
    IF o.kind <> p_kind THEN RAISE EXCEPTION 'readiness item rejected (kind): % is a % item; another kind is another item', p_key, o.kind USING ERRCODE = '22023'; END IF;
    IF o.blocking AND NOT coalesce(p_blocking, true) THEN
      PERFORM onboarding.assert_approver('readiness item', p_actor, p_tenant, p_domain, ARRAY['onboarding_authority'], NULL, 'making a blocking readiness item non-blocking');
      v_eval := implementation.evaluate_item(p_tenant, p_domain, p_programme, o.kind, o.spec, o.item_id, o.version);
      IF o.kind = ANY (implementation.nonoverridable_kinds()) AND NOT (v_eval ->> 'satisfied')::boolean THEN
        RAISE EXCEPTION 'readiness item rejected (held): % is unsatisfied (%) and is not overridable — it is filled, never waived', p_key, v_eval ->> 'reason' USING ERRCODE = '22023';
      END IF;
    END IF;
    v_id := o.item_id; v_version := o.version + 1;
    UPDATE implementation.readiness_items SET superseded_at = clock_timestamp() WHERE item_id = o.item_id AND version = o.version;
  ELSE
    IF coalesce(p_expected_version, 0) <> 0 THEN RAISE EXCEPTION 'readiness item rejected (stale): % does not exist yet (expected version 0)', p_key USING ERRCODE = '22023'; END IF;
    v_id := p_item; v_version := 1;
  END IF;
  v_digest := onboarding.digest(jsonb_build_object('item_id', v_id, 'version', v_version, 'programme_id', p_programme, 'key', p_key, 'kind', p_kind, 'title', btrim(p_title), 'spec', v_spec,
                                                   'blocking', coalesce(p_blocking, true), 'accountable_role', v_role));
  INSERT INTO implementation.readiness_items (item_id, version, tenant_id, domain_id, programme_id, item_key, kind, title, spec, blocking, accountable_role, digest, declared_by, correlation_id)
  VALUES (v_id, v_version, p_tenant, p_domain, p_programme, p_key, p_kind, btrim(p_title), v_spec, coalesce(p_blocking, true), v_role, v_digest, p_actor, p_correlation);
  PERFORM implementation.imp_event(p_tenant, p_domain, 'readiness_item', v_id, v_version, 'readiness.declared', p_actor,
                                   jsonb_build_object('programme_id', p_programme, 'key', p_key, 'kind', p_kind, 'blocking', coalesce(p_blocking, true), 'digest', v_digest), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM implementation.readiness_items x WHERE x.item_id = v_id AND x.version = v_version);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION implementation.declare_readiness(uuid, uuid, uuid, uuid, text, text, text, jsonb, boolean, text, int, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION implementation.declare_readiness(uuid, uuid, uuid, uuid, text, text, text, jsonb, boolean, text, int, uuid, uuid) TO eye_commit;

/* RETIRE a readiness item (implementation.readiness.retire — HUMAN-GATED: the onboarding authority via the approver test, the reason stated).
   An unsatisfied non-overridable item is never retired (an unfilled accountable role is filled, not waived). */
CREATE OR REPLACE FUNCTION implementation.retire_readiness(p_item uuid, p_tenant uuid, p_domain uuid, p_expected_version int, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = implementation, onboarding, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE o implementation.readiness_items%ROWTYPE; v_eval jsonb; v_digest text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['implementation.readiness.retire']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM implementation.imp_actor('readiness item', p_actor);
  SELECT * INTO o FROM implementation.readiness_items x WHERE x.item_id = p_item AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.superseded_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'readiness item rejected (unknown_item): % is not a readiness item of this domain', p_item USING ERRCODE = '23503'; END IF;
  PERFORM onboarding.assert_approver('readiness item', p_actor, p_tenant, p_domain, ARRAY['onboarding_authority'], o.declared_by, 'retiring a readiness item');
  IF p_expected_version IS DISTINCT FROM o.version THEN RAISE EXCEPTION 'readiness item rejected (stale): the item is at version %, not %', o.version, p_expected_version USING ERRCODE = '22023'; END IF;
  IF o.state = 'retired' THEN RAISE EXCEPTION 'readiness item rejected (state): the item is retired' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 12 THEN RAISE EXCEPTION 'readiness item rejected (reason): a retirement states its reason (12+ characters)' USING ERRCODE = '22023'; END IF;
  v_eval := implementation.evaluate_item(p_tenant, p_domain, o.programme_id, o.kind, o.spec, o.item_id, o.version);
  IF o.kind = ANY (implementation.nonoverridable_kinds()) AND NOT (v_eval ->> 'satisfied')::boolean THEN
    RAISE EXCEPTION 'readiness item rejected (held): % is unsatisfied (%) and is not overridable — it is filled, never retired away', o.item_key, v_eval ->> 'reason' USING ERRCODE = '22023';
  END IF;
  UPDATE implementation.readiness_items SET superseded_at = clock_timestamp() WHERE item_id = o.item_id AND version = o.version;
  v_digest := onboarding.digest(jsonb_build_object('item_id', o.item_id, 'version', o.version + 1, 'retired', true, 'reason', btrim(p_reason), 'prior', o.digest));
  INSERT INTO implementation.readiness_items (item_id, version, tenant_id, domain_id, programme_id, item_key, kind, title, spec, blocking, accountable_role, state, digest, declared_by, retire_reason, correlation_id)
  VALUES (o.item_id, o.version + 1, p_tenant, p_domain, o.programme_id, o.item_key, o.kind, o.title, o.spec, o.blocking, o.accountable_role, 'retired', v_digest, p_actor, btrim(p_reason), p_correlation);
  PERFORM implementation.imp_event(p_tenant, p_domain, 'readiness_item', o.item_id, o.version + 1, 'readiness.retired', p_actor, jsonb_build_object('reason', btrim(p_reason), 'key', o.item_key), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM implementation.readiness_items x WHERE x.item_id = o.item_id AND x.version = o.version + 1);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION implementation.retire_readiness(uuid, uuid, uuid, int, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION implementation.retire_readiness(uuid, uuid, uuid, int, text, uuid, uuid) TO eye_commit;

/* CONFIRM a custom item (implementation.readiness.confirm — HUMAN-GATED: a named human holding the item's confirm_role, never the item's
   declarer, never a lead, never an agent), on the item's digest. */
CREATE OR REPLACE FUNCTION implementation.confirm_readiness(p_confirmation uuid, p_item uuid, p_tenant uuid, p_domain uuid, p_version int, p_digest text, p_statement text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = implementation, onboarding, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE o implementation.readiness_items%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['implementation.readiness.confirm']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM implementation.imp_actor('readiness item', p_actor);
  SELECT * INTO o FROM implementation.readiness_items x WHERE x.item_id = p_item AND x.version = p_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'readiness item rejected (unknown_item): % has no version % in this domain', p_item, p_version USING ERRCODE = '23503'; END IF;
  IF o.kind <> 'custom' THEN RAISE EXCEPTION 'readiness item rejected (kind): only a custom item is confirmed by a person; a % item is evaluated live', o.kind USING ERRCODE = '22023'; END IF;
  PERFORM onboarding.assert_approver('readiness item', p_actor, p_tenant, p_domain, ARRAY[o.spec ->> 'confirm_role'], o.declared_by, 'confirming a readiness item');
  IF o.superseded_at IS NOT NULL OR o.state <> 'active' THEN RAISE EXCEPTION 'readiness item rejected (stale): version % is not the current active version', p_version USING ERRCODE = '22023'; END IF;
  IF p_digest IS DISTINCT FROM o.digest THEN RAISE EXCEPTION 'readiness item rejected (stale): the item is at digest %…, not the one confirmed (%…)', left(o.digest, 12), left(coalesce(p_digest, '<none>'), 12) USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_statement, ''))) < 8 THEN RAISE EXCEPTION 'readiness item rejected (statement): a confirmation states what was confirmed (8+ characters)' USING ERRCODE = '22023'; END IF;
  INSERT INTO implementation.readiness_confirmations (confirmation_id, tenant_id, domain_id, item_id, item_version, statement, confirmed_by, correlation_id)
  VALUES (p_confirmation, p_tenant, p_domain, p_item, p_version, btrim(p_statement), p_actor, p_correlation);
  PERFORM implementation.imp_event(p_tenant, p_domain, 'readiness_item', p_item, p_version, 'readiness.confirmed', p_actor, jsonb_build_object('key', o.item_key), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM implementation.readiness_confirmations x WHERE x.confirmation_id = p_confirmation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION implementation.confirm_readiness(uuid, uuid, uuid, uuid, int, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION implementation.confirm_readiness(uuid, uuid, uuid, uuid, int, text, text, uuid, uuid) TO eye_commit;

/* The digest a residual-risk acceptance signs (the TS signer computes it with this function in the same transaction). */
CREATE OR REPLACE FUNCTION implementation.residual_digest(p_acceptance uuid, p_item uuid, p_version int, p_item_digest text, p_reason text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = onboarding, pg_catalog, pg_temp AS $$
  SELECT onboarding.digest(jsonb_build_object('acceptance_id', p_acceptance, 'item_id', p_item, 'item_version', p_version, 'item_digest', p_item_digest, 'reason', btrim(coalesce(p_reason, '')),
                                              'kind', 'residual_risk'))
$$;
GRANT EXECUTE ON FUNCTION implementation.residual_digest(uuid, uuid, int, text, text) TO eye_app, eye_commit;

/* ACCEPT a blocking item as RESIDUAL RISK (implementation.readiness.accept_residual — HUMAN-GATED: the onboarding authority via the approver
   test, never the declarer; the item's digest named; never a non-overridable kind; the item must be unsatisfied). The row is sealed by
   implementation.seal_signature in the same transaction. */
CREATE OR REPLACE FUNCTION implementation.accept_residual(p_acceptance uuid, p_item uuid, p_tenant uuid, p_domain uuid, p_version int, p_digest text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = implementation, onboarding, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE o implementation.readiness_items%ROWTYPE; v_eval jsonb; v_digest text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['implementation.readiness.accept_residual']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM implementation.imp_actor('readiness item', p_actor);
  SELECT * INTO o FROM implementation.readiness_items x WHERE x.item_id = p_item AND x.version = p_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'readiness item rejected (unknown_item): % has no version % in this domain', p_item, p_version USING ERRCODE = '23503'; END IF;
  PERFORM onboarding.assert_approver('readiness item', p_actor, p_tenant, p_domain, ARRAY['onboarding_authority'], o.declared_by, 'accepting a residual risk');
  IF o.kind = ANY (implementation.nonoverridable_kinds()) THEN
    RAISE EXCEPTION 'readiness item rejected (held): a % item is not overridable — an unfilled accountable role, an unresolved owner or an inaccessible path is filled, never accepted as residual risk', o.kind USING ERRCODE = '22023';
  END IF;
  IF o.superseded_at IS NOT NULL OR o.state <> 'active' THEN RAISE EXCEPTION 'readiness item rejected (stale): version % is not the current active version', p_version USING ERRCODE = '22023'; END IF;
  IF p_digest IS DISTINCT FROM o.digest THEN RAISE EXCEPTION 'readiness item rejected (stale): the item is at digest %…, not the one accepted (%…)', left(o.digest, 12), left(coalesce(p_digest, '<none>'), 12) USING ERRCODE = '22023'; END IF;
  IF NOT o.blocking THEN RAISE EXCEPTION 'readiness item rejected (state): the item does not block; nothing to accept' USING ERRCODE = '22023'; END IF;
  v_eval := implementation.evaluate_item(p_tenant, p_domain, o.programme_id, o.kind, o.spec, o.item_id, o.version);
  IF (v_eval ->> 'satisfied')::boolean THEN RAISE EXCEPTION 'readiness item rejected (state): the item is satisfied; a residual risk is accepted only for an unsatisfied item' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 12 THEN RAISE EXCEPTION 'readiness item rejected (reason): a residual-risk acceptance states the risk accepted (12+ characters)' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM implementation.residual_acceptances a WHERE a.item_id = p_item AND a.item_version = p_version) THEN
    RAISE EXCEPTION 'readiness item rejected (duplicate): version % is already accepted as residual risk', p_version USING ERRCODE = '22023';
  END IF;
  v_digest := implementation.residual_digest(p_acceptance, p_item, p_version, o.digest, p_reason);
  INSERT INTO implementation.residual_acceptances (acceptance_id, tenant_id, domain_id, programme_id, item_id, item_version, reason, digest, accepted_by, correlation_id)
  VALUES (p_acceptance, p_tenant, p_domain, o.programme_id, p_item, p_version, btrim(p_reason), v_digest, p_actor, p_correlation);
  PERFORM implementation.imp_event(p_tenant, p_domain, 'residual_acceptance', p_acceptance, p_version, 'residual.accepted', p_actor,
                                   jsonb_build_object('item_id', p_item, 'key', o.item_key, 'kind', o.kind, 'unsatisfied', v_eval -> 'reason', 'digest', v_digest), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM implementation.residual_acceptances x WHERE x.acceptance_id = p_acceptance);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION implementation.accept_residual(uuid, uuid, uuid, uuid, int, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION implementation.accept_residual(uuid, uuid, uuid, uuid, int, text, text, uuid, uuid) TO eye_commit;

/* EVALUATE AND RECORD the gate (implementation.gate.evaluate — the lead, the sponsor, the authority, a domain admin or an attention agent):
   the live evaluation recorded; held → `implementation.readiness` raised (once while open) and, for an owner gap, `responsibility.gap`
   (IA-04-005); ready → both closed and the sponsor's `implementation.golive_review` task opened (once per gate digest); accepted/withdrawn
   → items closed. */
CREATE OR REPLACE FUNCTION implementation.record_gate(p_evaluation uuid, p_programme uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = implementation, executive, onboarding, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE g jsonb; pr implementation.programmes%ROWTYPE; v_raised jsonb := '[]'::jsonb; v_r jsonb; v_task jsonb := NULL; v_reasons jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['implementation.gate.evaluate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM implementation.imp_actor('go-live gate', p_actor);
  pr := implementation.imp_programme(p_tenant, p_programme, 'go-live gate');
  g := implementation.evaluate_gate(p_tenant, p_domain, p_programme);
  SELECT coalesce(jsonb_agg(format('%s: %s', b ->> 'title', b ->> 'reason')), '[]'::jsonb) INTO v_reasons FROM jsonb_array_elements(g -> 'blocking') b;
  IF g ->> 'state' = 'held' THEN
    IF NOT EXISTS (SELECT 1 FROM executive.attention_items i WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.signal_class = 'implementation.readiness'
                                                              AND i.subject_id = p_programme AND i.state <> 'closed') THEN
      v_r := executive.b33_raise_routed(p_tenant, p_domain, 'implementation.readiness', 'readiness_gate', p_programme,
               format('Go-live gate held: %s (%s blocking)', pr.title, jsonb_array_length(g -> 'blocking')), v_reasons, NULL, p_evaluation, 'implementation.gate',
               jsonb_build_object('gate_digest', g ->> 'digest', 'programme_version', pr.version), '{}'::jsonb, p_actor, p_correlation);
      v_raised := v_raised || jsonb_build_array(v_r || jsonb_build_object('class', 'implementation.readiness'));
    END IF;
    IF (g ->> 'owner_gap')::boolean THEN
      IF NOT EXISTS (SELECT 1 FROM executive.attention_items i WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.signal_class = 'responsibility.gap'
                                                                AND i.subject_id = p_programme AND i.state <> 'closed') THEN
        v_r := executive.b33_raise_routed(p_tenant, p_domain, 'responsibility.gap', 'readiness_gate', p_programme,
                 format('No unambiguous accountable owner: the go-live of %s stops until it is filled', pr.title),
                 (SELECT coalesce(jsonb_agg(format('%s: %s', b ->> 'title', b ->> 'reason')), '[]'::jsonb) FROM jsonb_array_elements(g -> 'blocking') b WHERE b ->> 'kind' IN ('role_filled', 'owner_resolved')),
                 NULL, p_evaluation, 'implementation.gate', jsonb_build_object('gate_digest', g ->> 'digest'), '{}'::jsonb, p_actor, p_correlation);
        v_raised := v_raised || jsonb_build_array(v_r || jsonb_build_object('class', 'responsibility.gap'));
      END IF;
    ELSE
      PERFORM executive.b33_close_items(p_tenant, p_domain, 'responsibility.gap', 'readiness_gate', p_programme, 'the accountable owner is filled (the go-live gate re-evaluated)', p_actor, p_correlation);
    END IF;
  ELSE
    PERFORM executive.b33_close_items(p_tenant, p_domain, 'implementation.readiness', 'readiness_gate', p_programme, format('the go-live gate is %s', g ->> 'state'), p_actor, p_correlation);
    PERFORM executive.b33_close_items(p_tenant, p_domain, 'responsibility.gap', 'readiness_gate', p_programme, format('the go-live gate is %s', g ->> 'state'), p_actor, p_correlation);
    IF g ->> 'state' = 'ready' THEN
      v_task := executive._open_human_task(gen_random_uuid(), p_tenant, p_domain, 'implementation.golive_review', format('golive:%s:%s', p_programme, left(g ->> 'digest', 16)),
                  jsonb_build_object('kind', 'readiness_gate', 'id', p_programme), format('Review the go-live of %s (the gate is ready)', pr.title), NULL,
                  ARRAY['customer_sponsor', 'onboarding_authority'], jsonb_build_object('rule', 'a named human sponsor or onboarding authority, never the lead, never an agent'),
                  NULL, '{}'::jsonb, NULL, NULL, p_actor, p_correlation);
    END IF;
  END IF;
  INSERT INTO implementation.gate_evaluations (evaluation_id, tenant_id, domain_id, programme_id, programme_version, state, gate_digest, evaluation, items_raised, evaluated_by, correlation_id)
  VALUES (p_evaluation, p_tenant, p_domain, p_programme, pr.version, g ->> 'state', g ->> 'digest', g, v_raised, p_actor, p_correlation);
  PERFORM implementation.imp_event(p_tenant, p_domain, 'readiness_gate', p_programme, pr.version, 'gate.evaluated', p_actor,
                                   jsonb_build_object('state', g ->> 'state', 'digest', g ->> 'digest', 'blocking', jsonb_array_length(g -> 'blocking'), 'raised', v_raised, 'task', v_task), p_correlation);
  RETURN g || jsonb_build_object('evaluation_id', p_evaluation, 'raised', v_raised, 'task', v_task);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION implementation.record_gate(uuid, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION implementation.record_gate(uuid, uuid, uuid, uuid, uuid, uuid) TO eye_commit;

-- §IM.3 GO-LIVE ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* The digest a go-live decision signs (the TS signer computes it with this function in the same transaction). */
CREATE OR REPLACE FUNCTION implementation.golive_digest(p_decision_id uuid, p_programme uuid, p_version int, p_decision text, p_gate_digest text, p_cadence uuid, p_journeys uuid[], p_reason text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = onboarding, pg_catalog, pg_temp AS $$
  SELECT onboarding.digest(jsonb_build_object('decision_id', p_decision_id, 'programme_id', p_programme, 'programme_version', p_version, 'decision', p_decision, 'gate_digest', p_gate_digest,
                                              'cadence_id', p_cadence, 'journeys', (SELECT coalesce(jsonb_agg(j ORDER BY j), '[]'::jsonb) FROM unnest(coalesce(p_journeys, '{}'::uuid[])) j),
                                              'reason', btrim(coalesce(p_reason, ''))))
$$;
GRANT EXECUTE ON FUNCTION implementation.golive_digest(uuid, uuid, int, text, text, uuid, uuid[], text) TO eye_app, eye_commit;

/* The ACCEPTANCE RECORD's facts (PR-68-006): the exact versions and digests, read at the decision. */
CREATE OR REPLACE FUNCTION implementation.imp_acceptance_facts(pr implementation.programmes, p_gate jsonb, p_cadence uuid, p_journeys uuid[]) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = implementation, executive, commercial, tenancy, analytics, pg_catalog, pg_temp AS $$
DECLARE v_baseline jsonb := NULL; v_lic jsonb; v_ctr jsonb;
BEGIN
  IF to_regclass('onboarding.config_baselines') IS NOT NULL THEN
    EXECUTE 'SELECT to_jsonb(b) - ''pointers'' FROM onboarding.config_baselines b WHERE b.tenant_id = $1 AND b.domain_id = $2 AND b.state = ''approved'' ORDER BY b.version DESC LIMIT 1'
      INTO v_baseline USING pr.tenant_id, pr.target_domain_id;
  END IF;
  SELECT jsonb_build_object('licence_id', l.licence_id, 'version', l.version, 'state', l.state, 'package_key', l.package_key, 'capabilities', to_jsonb(l.capabilities)) INTO v_lic
    FROM commercial.licences l WHERE l.tenant_id = pr.tenant_id AND l.state <> 'superseded' ORDER BY l.issued_at DESC LIMIT 1;
  SELECT jsonb_build_object('contract_id', c.contract_id, 'version', c.version, 'effective_from', c.effective_from, 'licence_version', c.licence_version) INTO v_ctr
    FROM commercial.contracts c WHERE c.tenant_id = pr.tenant_id AND c.status = 'active' ORDER BY c.effective_from LIMIT 1;
  RETURN jsonb_build_object(
    'programme', jsonb_build_object('programme_id', pr.programme_id, 'version', pr.version, 'digest', pr.digest, 'key', pr.programme_key, 'title', pr.title, 'opened_at',
                                    (SELECT min(x.created_at) FROM implementation.programmes x WHERE x.programme_id = pr.programme_id)),
    'domain', (SELECT jsonb_build_object('domain_id', d.id, 'name', d.name, 'status', d.status) FROM tenancy.domains d WHERE d.id = pr.target_domain_id),
    'deployment_profile', pr.deployment_profile,
    'gate', jsonb_build_object('digest', p_gate ->> 'digest', 'items', (SELECT coalesce(jsonb_agg(jsonb_build_object('item_key', x ->> 'item_key', 'kind', x ->> 'kind', 'version', x -> 'version',
                                                                                                             'state', x ->> 'state', 'facts', x -> 'facts')), '[]'::jsonb) FROM jsonb_array_elements(p_gate -> 'items') x),
                               'measures', p_gate -> 'measures'),
    'journeys', (SELECT coalesce(jsonb_agg(jsonb_build_object('item_id', i.item_id, 'version', i.version, 'key', i.item_key, 'journey_ref', i.attributes ->> 'journey_ref', 'title', i.title) ORDER BY i.item_key), '[]'::jsonb)
                   FROM implementation.programme_items i WHERE i.item_id = ANY (coalesce(p_journeys, '{}'::uuid[])) AND i.superseded_at IS NULL),
    'cadence', (SELECT jsonb_build_object('cadence_id', c.cadence_id, 'period', c.period, 'sequence', c.sequence, 'opened_at', c.opened_at) FROM executive.cadences c WHERE c.cadence_id = p_cadence),
    'roles', (SELECT coalesce(to_jsonb(array_agg(DISTINCT z.role ORDER BY z.role)), '[]'::jsonb) FROM (
                SELECT jsonb_array_elements_text(r.spec -> 'roles') AS role FROM implementation.readiness_items r
                 WHERE r.programme_id = pr.programme_id AND r.superseded_at IS NULL AND jsonb_typeof(r.spec -> 'roles') = 'array'
                UNION SELECT r.spec ->> 'role' FROM implementation.readiness_items r WHERE r.programme_id = pr.programme_id AND r.superseded_at IS NULL AND r.spec ? 'role') z
               WHERE z.role IS NOT NULL),
    'training_paths', (SELECT coalesce(jsonb_agg(jsonb_build_object('path_key', t.path_key, 'version', t.version, 'digest', t.digest, 'accessibility', implementation.imp_accessibility(t.path_id, t.version) ->> 'state')
                                                 ORDER BY t.path_key), '[]'::jsonb)
                         FROM implementation.training_paths t WHERE t.tenant_id = pr.tenant_id AND t.domain_id = pr.target_domain_id AND t.superseded_at IS NULL AND t.state = 'active'),
    'cohorts', (SELECT coalesce(jsonb_agg(jsonb_build_object('role', c.role_code, 'wave', c.wave_key) ORDER BY c.role_code, c.wave_key), '[]'::jsonb)
                  FROM implementation.cohorts c WHERE c.programme_id = pr.programme_id),
    'shadow_review', (SELECT jsonb_build_object('review_id', r.review_id, 'reviewed_at', r.reviewed_at, 'open_findings', r.open_findings) FROM implementation.shadow_reviews r
                       WHERE r.programme_id = pr.programme_id ORDER BY r.reviewed_at DESC LIMIT 1),
    'licence', v_lic, 'contract', v_ctr, 'config_baseline', v_baseline,
    'data_model', jsonb_build_object('schemas', jsonb_build_array('implementation@0114')),
    'consequence_class', 'C2',
    'period', jsonb_build_object('from', (SELECT min(x.created_at) FROM implementation.programmes x WHERE x.programme_id = pr.programme_id), 'to', clock_timestamp()),
    'claim', 'demonstration',
    'boundary', 'an in-product go-live by a SYNTHETIC persona demonstrates the software only; the customer''s own signed acceptance (AT-68, PR-68-006) is R2 and is never written by this product');
END $$;
REVOKE ALL ON FUNCTION implementation.imp_acceptance_facts(implementation.programmes, jsonb, uuid, uuid[]) FROM PUBLIC;

/* DECIDE GO-LIVE (implementation.golive.approve — HUMAN-GATED: the customer sponsor or the onboarding authority via the approver test, never
   the lead, never an agent). approve: the gate READY at the digest named (held → 409 held; another digest → 409 stale), the accepted
   operating cadence (an executive.cadences row of the domain) and ≥ 1 accepted PRIORITY journey of the programme; the programme becomes
   `accepted`; the decision is sealed by its signature in the same transaction. withhold: recorded; nothing else changes. */
CREATE OR REPLACE FUNCTION implementation.decide_golive(p_decision_id uuid, p_programme uuid, p_tenant uuid, p_domain uuid, p_decision text, p_gate_digest text, p_cadence uuid, p_journeys uuid[],
                                                        p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = implementation, executive, onboarding, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE pr implementation.programmes%ROWTYPE; g jsonb; v_role text; v_bad uuid; n implementation.programmes%ROWTYPE; v_facts jsonb; v_digest text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['implementation.golive.approve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM implementation.imp_actor('go-live gate', p_actor);
  pr := implementation.imp_programme(p_tenant, p_programme, 'go-live gate');
  IF pr.target_domain_id <> p_domain THEN RAISE EXCEPTION 'go-live gate rejected (unknown_programme): the programme targets another domain' USING ERRCODE = '23503'; END IF;
  PERFORM 1 FROM implementation.programmes x WHERE x.programme_id = p_programme AND x.version = pr.version FOR UPDATE;
  PERFORM onboarding.assert_approver('go-live gate', p_actor, p_tenant, p_domain, ARRAY['customer_sponsor', 'onboarding_authority'], NULL, 'accepting go-live');
  v_role := CASE WHEN onboarding.holds_role(p_actor, p_tenant, p_domain, ARRAY['customer_sponsor']) THEN 'customer_sponsor' ELSE 'onboarding_authority' END;
  IF p_decision NOT IN ('approve', 'withhold') THEN RAISE EXCEPTION 'go-live gate rejected (decision): approve or withhold' USING ERRCODE = '22023'; END IF;
  IF pr.state IN ('accepted', 'withdrawn') THEN RAISE EXCEPTION 'go-live gate rejected (state): the programme is %', pr.state USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'go-live gate rejected (reason): a go-live decision states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  g := implementation.evaluate_gate(p_tenant, p_domain, p_programme);
  IF p_decision = 'approve' THEN
    IF g ->> 'state' <> 'ready' THEN
      RAISE EXCEPTION 'go-live gate rejected (held): the gate is held — %', (SELECT string_agg(format('%s: %s', b ->> 'title', b ->> 'reason'), '; ') FROM jsonb_array_elements(g -> 'blocking') b) USING ERRCODE = '22023';
    END IF;
    IF p_gate_digest IS DISTINCT FROM g ->> 'digest' THEN
      RAISE EXCEPTION 'go-live gate rejected (stale): the gate is at digest %…, not the one approved (%…) — re-read it', left(g ->> 'digest', 12), left(coalesce(p_gate_digest, '<none>'), 12) USING ERRCODE = '22023';
    END IF;
    IF p_cadence IS NULL OR NOT EXISTS (SELECT 1 FROM executive.cadences c WHERE c.cadence_id = p_cadence AND c.tenant_id = p_tenant AND c.domain_id = p_domain) THEN
      RAISE EXCEPTION 'go-live gate rejected (cadence): go-live names the accepted operating cadence (an executive cadence of this domain)' USING ERRCODE = '22023';
    END IF;
    IF coalesce(cardinality(p_journeys), 0) = 0 THEN RAISE EXCEPTION 'go-live gate rejected (journeys): go-live names at least one accepted priority journey' USING ERRCODE = '22023'; END IF;
    SELECT j INTO v_bad FROM unnest(p_journeys) j
     WHERE NOT EXISTS (SELECT 1 FROM implementation.programme_items i WHERE i.item_id = j AND i.programme_id = p_programme AND i.kind = 'journey' AND i.superseded_at IS NULL
                                                                      AND i.state = 'active' AND coalesce((i.attributes ->> 'priority')::boolean, false)) LIMIT 1;
    IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'go-live gate rejected (journeys): % is not an active priority journey of the programme', v_bad USING ERRCODE = '22023'; END IF;
  ELSIF p_gate_digest IS DISTINCT FROM g ->> 'digest' THEN
    RAISE EXCEPTION 'go-live gate rejected (stale): the gate is at digest %…, not the one read (%…)', left(g ->> 'digest', 12), left(coalesce(p_gate_digest, '<none>'), 12) USING ERRCODE = '22023';
  END IF;
  v_facts := implementation.imp_acceptance_facts(pr, g, p_cadence, p_journeys);
  v_digest := implementation.golive_digest(p_decision_id, p_programme, pr.version, p_decision, g ->> 'digest', p_cadence, p_journeys, p_reason);
  INSERT INTO implementation.golive_decisions (decision_id, tenant_id, domain_id, programme_id, programme_version, decision, gate_digest, cadence_id, journeys, acceptance, reason, digest,
                                               decided_by, decided_role, correlation_id)
  VALUES (p_decision_id, p_tenant, p_domain, p_programme, pr.version, p_decision, g ->> 'digest', p_cadence,
          (SELECT coalesce(jsonb_agg(j ORDER BY j), '[]'::jsonb) FROM unnest(coalesce(p_journeys, '{}'::uuid[])) j), v_facts, btrim(p_reason), v_digest, p_actor, v_role, p_correlation);
  IF p_decision = 'approve' THEN
    n := implementation.imp_next_version(pr, 'accepted', '[]'::jsonb, NULL, NULL, pr.onboarding_programme_id, NULL, p_actor, p_correlation);
    PERFORM implementation.imp_event(p_tenant, NULL, 'implementation_programme', p_programme, n.version, 'programme.accepted', p_actor,
                                     jsonb_build_object('decision_id', p_decision_id, 'gate_digest', g ->> 'digest', 'claim', 'demonstration'), p_correlation);
  END IF;
  PERFORM executive._resolve_human_tasks(p_tenant, p_domain, jsonb_build_object('kind', 'readiness_gate', 'id', p_programme), ARRAY['implementation.golive_review'],
                                         CASE p_decision WHEN 'approve' THEN 'approved' ELSE 'withheld' END, p_decision_id, p_actor, p_correlation);
  PERFORM implementation.imp_event(p_tenant, p_domain, 'golive_decision', p_decision_id, pr.version, CASE p_decision WHEN 'approve' THEN 'golive.approved' ELSE 'golive.withheld' END, p_actor,
                                   jsonb_build_object('programme_id', p_programme, 'gate_digest', g ->> 'digest', 'gate_state', g ->> 'state', 'cadence_id', p_cadence, 'role', v_role, 'digest', v_digest), p_correlation);
  RETURN (SELECT to_jsonb(x) FROM implementation.golive_decisions x WHERE x.decision_id = p_decision_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION implementation.decide_golive(uuid, uuid, uuid, uuid, text, text, uuid, uuid[], text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION implementation.decide_golive(uuid, uuid, uuid, uuid, text, text, uuid, uuid[], text, uuid, uuid) TO eye_commit;

/* SEAL a signed act with its signature (implementation.golive.approve | implementation.readiness.accept_residual, in the same transaction):
   the signature row must exist, be the acting principal's, bound to this very action, over this very digest. */
CREATE OR REPLACE FUNCTION implementation.seal_signature(p_kind text, p_subject uuid, p_tenant uuid, p_domain uuid, p_signature uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = implementation, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_action text; v_digest text; v_by uuid; s executive.signatures%ROWTYPE;
BEGIN
  v_action := observation.assert_authority(ARRAY['implementation.golive.approve', 'implementation.readiness.accept_residual']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM implementation.imp_actor('go-live gate', p_actor);
  IF p_kind = 'golive' AND v_action = 'implementation.golive.approve' THEN
    SELECT d.digest, d.decided_by INTO v_digest, v_by FROM implementation.golive_decisions d WHERE d.decision_id = p_subject AND d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.signature_id IS NULL;
  ELSIF p_kind = 'residual' AND v_action = 'implementation.readiness.accept_residual' THEN
    SELECT a.digest, a.accepted_by INTO v_digest, v_by FROM implementation.residual_acceptances a WHERE a.acceptance_id = p_subject AND a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.signature_id IS NULL;
  END IF;
  IF v_digest IS NULL THEN RAISE EXCEPTION 'go-live gate rejected (unknown_subject): nothing unsealed to sign (%)', p_kind USING ERRCODE = '23503'; END IF;
  SELECT * INTO s FROM executive.signatures x WHERE x.signature_id = p_signature;
  IF s.signature_id IS NULL OR s.subject_kind <> 'readiness' OR s.subject_id <> p_subject OR s.subject_version <> 1 OR s.subject_digest <> v_digest OR s.signer <> p_actor OR s.signer <> v_by
     OR s.bound_action <> v_action THEN
    RAISE EXCEPTION 'go-live gate rejected (actor): the signature is not the acting principal''s over this act''s digest under this action' USING ERRCODE = '42501';
  END IF;
  IF p_kind = 'golive' THEN
    UPDATE implementation.golive_decisions SET signature_id = p_signature WHERE decision_id = p_subject;
  ELSE
    UPDATE implementation.residual_acceptances SET signature_id = p_signature WHERE acceptance_id = p_subject;
  END IF;
  PERFORM implementation.imp_event(p_tenant, p_domain, CASE p_kind WHEN 'golive' THEN 'golive_decision' ELSE 'residual_acceptance' END, p_subject, NULL, 'signature.sealed', p_actor,
                                   jsonb_build_object('signature_id', p_signature, 'key_id', s.key_id, 'digest', v_digest), p_correlation);
  RETURN jsonb_build_object('signature_id', p_signature, 'key_id', s.key_id, 'subject_digest', v_digest, 'signed_at', s.signed_at);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION implementation.seal_signature(text, uuid, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION implementation.seal_signature(text, uuid, uuid, uuid, uuid, uuid, uuid) TO eye_commit;

-- §IM.4 THE READS ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* Who may read a PERSON's training and competence records (the RLS predicate below): the subject, the recorder / assessor, and the authorities
   (the customer sponsor, the onboarding authority, the domain admin of the domain). */
CREATE OR REPLACE FUNCTION implementation.may_read_person(p_tenant uuid, p_domain uuid, p_subject uuid, p_recorder uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = onboarding, public, pg_catalog, pg_temp AS $$
  SELECT public.eye_principal() IS NOT NULL AND (public.eye_principal() = p_subject OR public.eye_principal() = p_recorder
         OR onboarding.holds_role(public.eye_principal(), p_tenant, p_domain, ARRAY['customer_sponsor', 'onboarding_authority', 'domain_admin']))
$$;
REVOKE ALL ON FUNCTION implementation.may_read_person(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION implementation.may_read_person(uuid, uuid, uuid, uuid) TO eye_app, eye_commit;

/* COVERAGE per path and role, per competence key and role — COUNTS ONLY (the readers who are not the authorities see this, never a person). */
CREATE OR REPLACE FUNCTION implementation.coverage(p_tenant uuid, p_domain uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = implementation, observation, pg_catalog, pg_temp AS $$
DECLARE v_paths jsonb; v_comp jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'enablement coverage');
  SELECT coalesce(jsonb_agg(jsonb_build_object('path_key', t.path_key, 'version', t.version, 'title', t.title, 'state', t.state, 'digest', t.digest, 'declared_at', t.declared_at,
           'accessibility', implementation.imp_accessibility(t.path_id, t.version), 'path_id', t.path_id,
           'by_role', (SELECT coalesce(jsonb_agg(jsonb_build_object('role', r, 'holders', (SELECT count(DISTINCT h.principal_id) FROM implementation.imp_holders(p_tenant, p_domain, ARRAY[r]) h),
                                                 'complete', (SELECT count(DISTINCT h.principal_id) FROM implementation.imp_holders(p_tenant, p_domain, ARRAY[r]) h
                                                               WHERE (SELECT x.state FROM implementation.training_records x WHERE x.path_id = t.path_id AND x.path_version = t.version
                                                                        AND x.subject_principal_id = h.principal_id AND x.retain_until > clock_timestamp() ORDER BY x.recorded_at DESC, x.record_id DESC LIMIT 1) = 'complete'))
                                       ORDER BY r), '[]'::jsonb) FROM unnest(t.roles) r)) ORDER BY t.path_key), '[]'::jsonb)
    INTO v_paths FROM implementation.training_paths t WHERE t.tenant_id = p_tenant AND t.domain_id = p_domain AND t.superseded_at IS NULL;
  SELECT coalesce(jsonb_agg(jsonb_build_object('competence_key', z.competence_key, 'role', z.role_code, 'recorded', z.n, 'complete', z.c) ORDER BY z.competence_key, z.role_code), '[]'::jsonb) INTO v_comp
    FROM (SELECT l.competence_key, l.role_code, count(*) AS n, count(*) FILTER (WHERE l.outcome = 'complete') AS c
            FROM (SELECT DISTINCT ON (c.competence_key, c.subject_principal_id) c.competence_key, c.role_code, c.outcome FROM implementation.competence_records c
                   WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.retain_until > clock_timestamp() ORDER BY c.competence_key, c.subject_principal_id, c.recorded_at DESC, c.record_id DESC) l
           GROUP BY l.competence_key, l.role_code) z;
  RETURN jsonb_build_object('paths', v_paths, 'competence', v_comp, 'note', 'counts per role only — a person''s own records are read by the subject, the recorder and the authorities');
END $$;
REVOKE ALL ON FUNCTION implementation.coverage(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION implementation.coverage(uuid, uuid) TO eye_app, eye_commit;

-- RLS and grants: TENANT tables under `tenant_id = eye_tenant()`; DOMAIN tables under domain isolation; the two PERSON tables additionally
-- per person (the subject, the recorder, the authorities); SELECT to eye_app and eye_commit; no write grant — the definer ports write.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['implementation.programmes', 'implementation.programme_items', 'implementation.changes'] LOOP
    EXECUTE format('REVOKE ALL ON %s FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %s USING (tenant_id = public.eye_tenant())', t);
    EXECUTE format('GRANT SELECT ON %s TO eye_app, eye_commit', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['implementation.training_paths', 'implementation.path_attestations', 'implementation.cohorts', 'implementation.shadow_findings', 'implementation.shadow_reviews',
                           'implementation.readiness_items', 'implementation.readiness_confirmations', 'implementation.residual_acceptances', 'implementation.gate_evaluations',
                           'implementation.golive_decisions'] LOOP
    EXECUTE format('REVOKE ALL ON %s FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$CREATE POLICY domain_isolation ON %s USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()))$f$, t);
    EXECUTE format('GRANT SELECT ON %s TO eye_app, eye_commit', t);
  END LOOP;
  REVOKE ALL ON implementation.training_records, implementation.competence_records FROM PUBLIC;
  ALTER TABLE implementation.training_records ENABLE ROW LEVEL SECURITY;
  ALTER TABLE implementation.training_records FORCE ROW LEVEL SECURITY;
  ALTER TABLE implementation.competence_records ENABLE ROW LEVEL SECURITY;
  ALTER TABLE implementation.competence_records FORCE ROW LEVEL SECURITY;
  CREATE POLICY person_isolation ON implementation.training_records USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
                                                                           AND implementation.may_read_person(tenant_id, domain_id, subject_principal_id, recorded_by));
  CREATE POLICY person_isolation ON implementation.competence_records USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
                                                                             AND implementation.may_read_person(tenant_id, domain_id, subject_principal_id, assessor_principal_id));
  GRANT SELECT ON implementation.training_records, implementation.competence_records TO eye_app, eye_commit;
END $$;

CREATE TRIGGER ipa_append_only BEFORE UPDATE OR DELETE ON implementation.path_attestations FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TRIGGER itr_append_only BEFORE UPDATE OR DELETE ON implementation.training_records FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TRIGGER icr_append_only BEFORE UPDATE OR DELETE ON implementation.competence_records FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TRIGGER irc_append_only BEFORE UPDATE OR DELETE ON implementation.readiness_confirmations FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TRIGGER ige_append_only BEFORE UPDATE OR DELETE ON implementation.gate_evaluations FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TRIGGER isr_append_only BEFORE UPDATE OR DELETE ON implementation.shadow_reviews FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TRIGGER ico_append_only BEFORE UPDATE OR DELETE ON implementation.cohorts FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* A versioned row keeps its facts: only superseded_at is ever written after insertion (programmes, items, paths, readiness items). */
CREATE OR REPLACE FUNCTION implementation.imp_versioned_forward() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION '% rows are never deleted', TG_TABLE_NAME USING ERRCODE = '42501'; END IF;
  IF OLD.superseded_at IS NOT NULL OR NEW.superseded_at IS NULL OR (to_jsonb(NEW) - 'superseded_at') <> (to_jsonb(OLD) - 'superseded_at') THEN
    RAISE EXCEPTION '% rows are versioned: a change is a new version (only the supersession of the current one is written)', TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION implementation.imp_versioned_forward() FROM PUBLIC;
CREATE TRIGGER ipr_forward BEFORE UPDATE OR DELETE ON implementation.programmes FOR EACH ROW EXECUTE FUNCTION implementation.imp_versioned_forward();
CREATE TRIGGER ipi_forward BEFORE UPDATE OR DELETE ON implementation.programme_items FOR EACH ROW EXECUTE FUNCTION implementation.imp_versioned_forward();
CREATE TRIGGER itp_forward BEFORE UPDATE OR DELETE ON implementation.training_paths FOR EACH ROW EXECUTE FUNCTION implementation.imp_versioned_forward();
CREATE TRIGGER iri_forward BEFORE UPDATE OR DELETE ON implementation.readiness_items FOR EACH ROW EXECUTE FUNCTION implementation.imp_versioned_forward();

/* A decided row keeps its facts: a change's decision, a finding's resolution and a seal are the only writes after insertion. */
CREATE OR REPLACE FUNCTION implementation.imp_decided_forward() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE v_mutable text[]; v_open_state text;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION '% rows are never deleted', TG_TABLE_NAME USING ERRCODE = '42501'; END IF;
  v_mutable := CASE TG_TABLE_NAME WHEN 'changes' THEN ARRAY['state', 'decided_by', 'decided_at', 'decision_reason']
                                  WHEN 'shadow_findings' THEN ARRAY['state', 'resolved_by', 'resolved_at', 'remediation']
                                  ELSE ARRAY['signature_id'] END;
  IF (to_jsonb(NEW) - v_mutable) <> (to_jsonb(OLD) - v_mutable) THEN RAISE EXCEPTION '% rows keep their facts', TG_TABLE_NAME USING ERRCODE = '42501'; END IF;
  v_open_state := CASE TG_TABLE_NAME WHEN 'changes' THEN 'proposed' WHEN 'shadow_findings' THEN 'open' END;
  IF v_open_state IS NOT NULL AND (to_jsonb(OLD) ->> 'state') <> v_open_state THEN
    RAISE EXCEPTION '% rows are decided once', TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  IF TG_TABLE_NAME IN ('golive_decisions', 'residual_acceptances') AND (to_jsonb(OLD) ->> 'signature_id') IS NOT NULL THEN
    RAISE EXCEPTION '% rows are sealed once', TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION implementation.imp_decided_forward() FROM PUBLIC;
CREATE TRIGGER ich_forward BEFORE UPDATE OR DELETE ON implementation.changes FOR EACH ROW EXECUTE FUNCTION implementation.imp_decided_forward();
CREATE TRIGGER isf_forward BEFORE UPDATE OR DELETE ON implementation.shadow_findings FOR EACH ROW EXECUTE FUNCTION implementation.imp_decided_forward();
CREATE TRIGGER igd_forward BEFORE UPDATE OR DELETE ON implementation.golive_decisions FOR EACH ROW EXECUTE FUNCTION implementation.imp_decided_forward();
CREATE TRIGGER ira_forward BEFORE UPDATE OR DELETE ON implementation.residual_acceptances FOR EACH ROW EXECUTE FUNCTION implementation.imp_decided_forward();

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §MC THE COMPUTATIONS (0113 §0.7 contract) — ADP-001, ADP-002 (adoption, k ≥ 5) and MET-039 (the carryover). Each reads ONLY rows recorded
-- at or before p_as_of; records name RECORDS (a role binding, a programme) and ROLES — never a principal id; k-anonymity through
-- distinct_actors (the port refuses a cohort below k). CONSTRUCTION; values on the harness and the act are SYNTHETIC demonstrations.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

/* The population of an adoption measure as at p_at: the holders of the declared cohorts' roles (role × wave) of the domain, restricted to
   p_cohort {role?, wave?} — one row per (principal, role) with the binding that places it. */
CREATE OR REPLACE FUNCTION analytics.mc_adp_population(p_tenant uuid, p_domain uuid, p_at timestamptz, p_cohort jsonb)
RETURNS TABLE (principal_id uuid, role_code text, wave_key text, binding_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = implementation, identity, pg_catalog, pg_temp AS $$
  SELECT DISTINCT ON (h.principal_id, c.role_code) h.principal_id, c.role_code, c.wave_key, h.binding_id
    FROM implementation.cohorts c
    CROSS JOIN LATERAL implementation.imp_holders(p_tenant, p_domain, ARRAY[c.role_code], p_at) h
   WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.declared_at <= p_at
     AND (c.bound_from IS NULL OR h.bound_at >= c.bound_from) AND (c.bound_to IS NULL OR h.bound_at < c.bound_to)
     AND (p_cohort ->> 'role' IS NULL OR c.role_code = p_cohort ->> 'role') AND (p_cohort ->> 'wave' IS NULL OR c.wave_key = p_cohort ->> 'wave')
   ORDER BY h.principal_id, c.role_code, c.wave_key
$$;
REVOKE ALL ON FUNCTION analytics.mc_adp_population(uuid, uuid, timestamptz, jsonb) FROM PUBLIC;

/* ADP-001 TRAINING COMPLETION (rate; dimensions role, wave): the share of cohort role holders who have completed (latest record complete,
   inside retention, recorded by p_at) the CURRENT ACCESSIBLE version of every training path naming their role. A holder whose role has no
   attested-accessible path is EXCLUDED (said). As at the window's end (or p_as_of). */
CREATE OR REPLACE FUNCTION analytics.mc_adp001_training_completion(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, implementation, identity, observation, pg_catalog, pg_temp AS $$
DECLARE v_at timestamptz := least(p_to, p_as_of); v_records jsonb := '[]'::jsonb; v_reasons jsonb := analytics.mca_clock_reasons(p_params, ARRAY['record']); r record; v_paths int; v_done int;
        v_people uuid[] := '{}'; v_cohorts int;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'ADP-001 training completion');
  SELECT count(*)::int INTO v_cohorts FROM implementation.cohorts c WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.declared_at <= v_at;
  IF v_cohorts = 0 THEN v_reasons := v_reasons || to_jsonb('no adoption cohort (role × wave) is declared in the domain: there is no population'::text); END IF;
  FOR r IN SELECT * FROM analytics.mc_adp_population(p_tenant, p_domain, v_at, coalesce(p_cohort, '{}'::jsonb)) LOOP
    SELECT count(*)::int,
           count(*) FILTER (WHERE (SELECT x.state FROM implementation.training_records x WHERE x.path_id = t.path_id AND x.path_version = t.version AND x.subject_principal_id = r.principal_id
                                     AND x.recorded_at <= v_at AND x.retain_until > v_at ORDER BY x.recorded_at DESC, x.record_id DESC LIMIT 1) = 'complete')::int
      INTO v_paths, v_done
      FROM implementation.training_paths t
     WHERE t.tenant_id = p_tenant AND t.domain_id = p_domain AND r.role_code = ANY (t.roles) AND t.state = 'active' AND t.declared_at <= v_at
       AND (t.superseded_at IS NULL OR t.superseded_at > v_at)
       AND (SELECT a.verdict FROM implementation.path_attestations a WHERE a.path_id = t.path_id AND a.path_version = t.version AND a.path_digest = t.digest AND a.attested_at <= v_at
             ORDER BY a.attested_at DESC LIMIT 1) = 'accessible';
    IF v_paths = 0 THEN
      v_records := v_records || analytics.mca_rec('role_binding', r.binding_id::text, 'excluded', format('no attested-accessible training path names %s', r.role_code),
                                                  jsonb_build_object('role', r.role_code, 'wave', r.wave_key));
    ELSE
      v_people := v_people || r.principal_id;
      v_records := v_records || analytics.mca_rec('role_binding', r.binding_id::text, CASE WHEN v_done = v_paths THEN 'numerator' ELSE 'denominator' END, NULL,
                                                  jsonb_build_object('role', r.role_code, 'wave', r.wave_key, 'paths', v_paths, 'complete', v_done));
    END IF;
  END LOOP;
  RETURN analytics.mca_out('rate', v_records, v_reasons,
    jsonb_build_object('clock', 'record', 'as_at', v_at, 'scope_rule', 'ignored: adoption is read over the domain''s declared cohorts', 'grain', 'role × wave — never a person'),
    (SELECT count(DISTINCT x)::int FROM unnest(v_people) x), NULL, 'role', NULL);
END $$;
REVOKE ALL ON FUNCTION analytics.mc_adp001_training_completion(uuid,uuid,timestamptz,timestamptz,timestamptz,jsonb,jsonb,jsonb) FROM PUBLIC;
SELECT analytics.register_computation('adp001_training_completion', 'analytics.mc_adp001_training_completion', 'rate', ARRAY['role', 'wave'],
  ARRAY['implementation.cohorts', 'implementation.training_paths', 'implementation.path_attestations', 'implementation.training_records', 'identity.role_bindings'],
  'ignored: adoption is read over the domain''s declared cohorts (role × wave)',
  'ADP-001: the share of cohort role holders who completed every attested-accessible training path naming their role (latest record complete, inside retention), as at the window end', '0114 §IM');

/* ADP-002 COMPETENCE COMPLETION (rate; dimensions role, wave): the share of cohort role holders whose latest competence record for every key
   recorded for their role is complete (a holder never assessed is in the denominator — not yet assessed, never inferred). */
CREATE OR REPLACE FUNCTION analytics.mc_adp002_competence_completion(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, implementation, identity, observation, pg_catalog, pg_temp AS $$
DECLARE v_at timestamptz := least(p_to, p_as_of); v_records jsonb := '[]'::jsonb; v_reasons jsonb := analytics.mca_clock_reasons(p_params, ARRAY['record']); r record; v_keys int; v_done int; v_cohorts int;
        v_people uuid[] := '{}';
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'ADP-002 competence completion');
  SELECT count(*)::int INTO v_cohorts FROM implementation.cohorts c WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.declared_at <= v_at;
  IF v_cohorts = 0 THEN v_reasons := v_reasons || to_jsonb('no adoption cohort (role × wave) is declared in the domain: there is no population'::text); END IF;
  FOR r IN SELECT * FROM analytics.mc_adp_population(p_tenant, p_domain, v_at, coalesce(p_cohort, '{}'::jsonb)) LOOP
    SELECT count(*)::int, count(*) FILTER (WHERE l.outcome = 'complete')::int INTO v_keys, v_done
      FROM (SELECT DISTINCT ON (c.competence_key) c.competence_key, c.outcome FROM implementation.competence_records c
             WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.role_code = r.role_code AND c.subject_principal_id = r.principal_id AND c.recorded_at <= v_at AND c.retain_until > v_at
             ORDER BY c.competence_key, c.recorded_at DESC, c.record_id DESC) l;
    v_records := v_records || analytics.mca_rec('role_binding', r.binding_id::text, CASE WHEN v_keys > 0 AND v_done = v_keys THEN 'numerator' ELSE 'denominator' END,
                                                CASE WHEN v_keys = 0 THEN 'not yet assessed' END, jsonb_build_object('role', r.role_code, 'wave', r.wave_key, 'keys', v_keys, 'complete', v_done));
    v_people := v_people || r.principal_id;
  END LOOP;
  RETURN analytics.mca_out('rate', v_records, v_reasons,
    jsonb_build_object('clock', 'record', 'as_at', v_at, 'scope_rule', 'ignored: adoption is read over the domain''s declared cohorts', 'grain', 'role × wave — never a person'),
    (SELECT count(DISTINCT x)::int FROM unnest(v_people) x), NULL, 'role', NULL);
END $$;
REVOKE ALL ON FUNCTION analytics.mc_adp002_competence_completion(uuid,uuid,timestamptz,timestamptz,timestamptz,jsonb,jsonb,jsonb) FROM PUBLIC;
SELECT analytics.register_computation('adp002_competence_completion', 'analytics.mc_adp002_competence_completion', 'rate', ARRAY['role', 'wave'],
  ARRAY['implementation.cohorts', 'implementation.competence_records', 'identity.role_bindings'],
  'ignored: adoption is read over the domain''s declared cohorts (role × wave)',
  'ADP-002: the share of cohort role holders whose latest competence record for every key assessed for their role is complete (complete | not_yet — no score), as at the window end', '0114 §IM');

/* MET-039 CUSTOMER TIME TO ACCEPTED OPERATION (duration, days; floor 1 — App M): per implementation programme of the TENANT (tenant-wide —
   the scope rule; an implementation is a tenant fact), the days from the effective_from of the tenant's contract current at the programme's
   OPENING (declared by then, not superseded by then; the earliest effective_from when several) to the GO-LIVE APPROVAL that names an accepted
   operating cadence and ≥ 1 accepted priority journey, approved inside the window (record clock) and by p_as_of. A programme opened by the
   window's end and NOT YET ACCEPTED is excluded "not yet accepted" — never a value; without a contract at opening, excluded "no contract". */
CREATE OR REPLACE FUNCTION analytics.mc_met039_time_to_accepted_operation(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, implementation, commercial, observation, pg_catalog, pg_temp AS $$
DECLARE v_records jsonb := '[]'::jsonb; v_reasons jsonb := analytics.mca_clock_reasons(p_params, ARRAY['record']); r record; c record; v_days numeric; v_pending int := 0;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'MET-039 customer time to accepted operation');
  FOR r IN SELECT p.programme_id, p.programme_key, min(p.created_at) AS opened_at,
                  (SELECT d.decided_at FROM implementation.golive_decisions d WHERE d.programme_id = p.programme_id AND d.decision = 'approve' AND d.signature_id IS NOT NULL
                      AND d.cadence_id IS NOT NULL AND jsonb_array_length(d.journeys) >= 1 AND d.decided_at <= p_as_of) AS accepted_at,
                  (SELECT d.decision_id FROM implementation.golive_decisions d WHERE d.programme_id = p.programme_id AND d.decision = 'approve' AND d.signature_id IS NOT NULL AND d.decided_at <= p_as_of) AS decision_id,
                  (SELECT jsonb_array_length(d.journeys) FROM implementation.golive_decisions d WHERE d.programme_id = p.programme_id AND d.decision = 'approve' AND d.decided_at <= p_as_of) AS journeys
             FROM implementation.programmes p WHERE p.tenant_id = p_tenant AND p.created_at <= p_as_of
            GROUP BY p.programme_id, p.programme_key HAVING min(p.created_at) < p_to ORDER BY min(p.created_at), p.programme_id LOOP
    IF r.accepted_at IS NULL THEN
      v_pending := v_pending + 1;
      v_records := v_records || analytics.mca_rec('implementation_programme', r.programme_id::text, 'excluded', 'not yet accepted',
                                                  jsonb_build_object('programme_key', r.programme_key, 'opened_at', r.opened_at));
      CONTINUE;
    END IF;
    IF r.accepted_at < p_from OR r.accepted_at >= p_to THEN
      v_records := v_records || analytics.mca_rec('implementation_programme', r.programme_id::text, 'context', NULL,
                                                  jsonb_build_object('programme_key', r.programme_key, 'accepted_at', r.accepted_at, 'note', 'accepted outside the window'));
      CONTINUE;
    END IF;
    SELECT x.contract_id, x.version, x.effective_from INTO c FROM commercial.contracts x
     WHERE x.tenant_id = p_tenant AND x.declared_at <= r.opened_at AND (x.superseded_at IS NULL OR x.superseded_at > r.opened_at) AND x.declared_at <= p_as_of
     ORDER BY x.effective_from, x.contract_id LIMIT 1;
    IF c.contract_id IS NULL THEN
      v_records := v_records || analytics.mca_rec('implementation_programme', r.programme_id::text, 'excluded', 'no contract was current at the programme''s opening (no start to measure from)',
                                                  jsonb_build_object('programme_key', r.programme_key, 'opened_at', r.opened_at, 'accepted_at', r.accepted_at));
      CONTINUE;
    END IF;
    v_days := round(extract(epoch FROM (r.accepted_at - c.effective_from)) / 86400.0, 3);
    v_records := v_records || analytics.mca_rec('implementation_programme', r.programme_id::text, 'included', NULL,
                                                jsonb_build_object('value', v_days, 'unit', 'days', 'programme_key', r.programme_key, 'contract_id', c.contract_id, 'contract_version', c.version,
                                                                   'effective_from', c.effective_from, 'opened_at', r.opened_at, 'accepted_at', r.accepted_at, 'decision_id', r.decision_id,
                                                                   'accepted_journeys', r.journeys));
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_records) x WHERE x ->> 'role' = 'included') THEN
    v_reasons := v_reasons || to_jsonb(CASE WHEN v_pending > 0 THEN format('not yet accepted: %s implementation programme(s) of the tenant have no signed go-live naming an accepted cadence and priority journeys', v_pending)
                                            ELSE 'no implementation programme was accepted in the window' END);
  END IF;
  RETURN analytics.mca_out('duration', v_records, v_reasons,
    jsonb_build_object('clock', 'record', 'unit', 'days', 'scope_rule', 'tenant-wide: the tenant''s implementation programmes (an implementation is a tenant fact)',
                       'start', 'commercial.contracts.effective_from current at the programme''s opening', 'end', 'implementation.golive_decisions (approve, signed) naming a cadence and priority journeys',
                       'pending', v_pending),
    NULL, NULL, '_kind', 'accepted_at');
END $$;
REVOKE ALL ON FUNCTION analytics.mc_met039_time_to_accepted_operation(uuid,uuid,timestamptz,timestamptz,timestamptz,jsonb,jsonb,jsonb) FROM PUBLIC;
SELECT analytics.register_computation('met039_time_to_accepted_operation', 'analytics.mc_met039_time_to_accepted_operation', 'duration', ARRAY[]::text[],
  ARRAY['implementation.programmes', 'implementation.golive_decisions', 'commercial.contracts'],
  'tenant-wide: the tenant''s implementation programmes (an implementation is a tenant fact); the definition''s domain hosts the result',
  'MET-039: days from the contract effective_from current at the programme''s opening to the signed go-live naming an accepted operating cadence and accepted priority journeys; not yet accepted is excluded, never a value', '0114 §IM');
