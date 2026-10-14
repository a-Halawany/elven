-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0115 §DR — CP-6 B107 part `ownership` (2026-10-15): DATA GOVERNANCE AND OWNERSHIP (F-P7D-25: V0 V00-T-082; V4 ES-04-001/-002, ES-11-001/
-- -002/-005; V7 DP-01-001/-002/-005/-006, DP-04-001/-002/-005/-006, DP-55-001/-002/-005/-006, App A DAT-GV-01/-02/-03/-04/-07/-10; V8 PER-19)
-- and the CARRIED B90 residuals (CP6_BATCHES §B90.9 #5: DP-49-005, DP-49-006, DP-41-005). Applies ALONE on 0001–0114 + the prelude (§0).
--
--   §DR.0 THE VOCABULARIES AND THE HELPERS — duties, case kinds, gap kinds, the transfer checklist, the SLA by consequence; the timer owner
--         `stewardship_case` (0114 §SV.0's owner-kind list copied whole, plus B107 dr — a seam the prelude lacked); the artifact / link / hold
--         helpers every port below writes the §0 core through.
--   §DR.1 THE DATA AUTHORITY REGISTRY (DOMAIN; V00-T-082, DP-04-001/-002, DAT-GV-01/-04): per catalog asset (products.catalog_assets — the
--         authority's id IS the asset's id) the singular owner, the steward, the custodian, the producer, the consumers, the policy and quality
--         authorities, the escalation path, the evidence obligation, the write rights and delegated duties; proposed by a steward, ACCEPTED by
--         the named owner (ownership acceptance), RATIFIED by another named human (never the proposer, never the owner), recertified by the
--         owner; RESOLVED LIVE against the principals, the roles, B94's owner resolution and the catalog's own owner (governance.dr_resolve).
--   §DR.2 THE DOMAIN REGISTRY EXTENSION (DOMAIN; DAT-GV-02): the domain's accountable leader, its boundary and its EXTENSION CONTRACT beside
--         tenancy.domains (untouched) — including the domain's governance mode (observed | enforced).
--   §DR.3 THE OWNERSHIP-GAP REGISTER AND RECONCILIATION (DP-04-005, DP-01-005): a material asset without a ratified authority, an owner
--         lost, conflicting authorities (the registry and the catalog naming different owners — both instructions PRESERVED), an unresolved
--         duty; opened with its escalation path, HELD (governance.holds `ownership_gap`: new consumption stops — §DR.8), escalated by age,
--         visible until resolved (the condition gone) or ACCEPTED by a named approver until a date; the tick reconciles a registered domain.
--   §DR.4 THE DATA CAPABILITY INVENTORY (PLATFORM; DP-01-001/-002/-005/-006): the DAT ids (imported read-only from audit/requirements/v07.csv
--         by the steward's TS reader) → group, layer, authority class, lifecycle, deployment scope, owner; RECONCILED against the observed
--         database (schemas, relations, functions); unresolved → a PLATFORM gap and a hold; ADMISSION to the governed inventory refused while
--         unresolved, drifting or held (the disputed state preserved). Production admission is R1 — never claimed.
--   §DR.5 COMPONENT OWNERSHIP AND THE RATIFIED TRANSFER (PLATFORM; ES-04-001/-002, ES-11-001/-002/-005, PER-19): one accountable owning team
--         per component, primary and secondary contacts, the operator role, owned contracts (one owner per contract), state stores, policy
--         decisions, telemetry namespace and failure domain (distinguishable when units are shared); every assignment is a TRANSFER with the
--         nine-item checklist (code, state, contracts, dashboards, alerts, runbooks, risks, exceptions, incidents — the open exceptions read
--         from the §0 links), accepted by the receiving owner, RATIFIED and SIGNED (governance.signatures `ownership_transfer`) by a product or
--         operations authority who is neither party; contacts reconciled (gaps).
--   §DR.6 STEWARDSHIP CASES (DOMAIN; DP-55-001/-002/-005, DAT-GV-07): identity | semantic | quality | access | classification | correction |
--         lifecycle | data_exception — subject, owner, evidence, proposed action, reviewers by consequence, segregation (never the proposer;
--         never the owner for access and exceptions), decision, conditions, expiry, closure; the SLA timer (`stewardship.sla`) and the sweep
--         escalate by consequence, hold the subject (C3+ past SLA; an expired exception), and keep the condition visible until closure.
--   §DR.7 THE RESPONSIBILITY EVIDENCE RECORD (DOMAIN; DP-01-006, DP-04-006, DP-55-006 — B+X:R1): the signed matrix (B94, referenced), the
--         recertification, the stewardship-queue evidence (SLA attainment, segregation test, exception ageing, override review, a sampled
--         decision set), privileged changes and joint exercises, bound to the build identity and the period; attested and SIGNED by a named
--         customer authority; `claim = 'demonstration'`; production admission R1 — never claimed.
--   §DR.8 THE READS — the data product registry view (DAT-GV-03), the responsibility portal's database half (DAT-GV-10).
--   §DR.9 THE CARRIED B90 RESIDUALS (each re-declaration COPIED WHOLE from its last definition in 0095, the change marked `-- B107 dr`):
--         products.register_subscription and products.serve_metric consult catalog_trust and the asset's open governance holds — the stop of
--         new consumption WIRED (DP-49-005); products.retire_lineage — the lineage-retirement port with its evidence on the catalog ledger
--         (DP-49-006; catalog_events' vocabulary copied whole + `lineage.retired`); products.degrade_product declares the CAUSE when the tick
--         degrades a product whose owner is lost or whose policy violation is recorded (DP-41-005 — only a domain review restores it then).
--
-- THREE CLAIMS, never mixed: CONSTRUCTION (these ports and phase6-ownership-b107); DEMONSTRATED OPERATION (the act on SYNTHETIC NORDWERK
-- personas — every evidence record `claim = 'demonstration'`); REAL ACCEPTANCE / PRODUCTION ADMISSION (R1/R2/H2) — never claimed here.
-- Refusals in the class form `<noun> rejected (<class>): …` with §DR's nouns (data authority | ownership record | stewardship case), and the
-- B90 families for the re-declared B90 ports. 0001–0114 and the prelude are untouched.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §DR.0 THE VOCABULARIES AND THE HELPERS
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/* The seven duties of DP-04-002 (owner, steward, custodian, producer, consumer, policy authority, quality authority). */
CREATE OR REPLACE FUNCTION governance.dr_duties() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  'owner', 'steward', 'custodian', 'producer', 'consumer', 'policy_authority', 'quality_authority'] $$;
/* The stewardship case kinds (DP-55-001, DAT-GV-07). */
CREATE OR REPLACE FUNCTION governance.dr_case_kinds() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  'identity', 'semantic', 'quality', 'access', 'classification', 'correction', 'lifecycle', 'data_exception'] $$;
/* The ownership gap kinds (DP-04-005, DP-01-005, ES-11-001). */
CREATE OR REPLACE FUNCTION governance.dr_gap_kinds() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  'no_owner', 'owner_lost', 'conflicting_authorities', 'unresolved_authority', 'contact_lost', 'case_unowned'] $$;
/* The ownership transfer checklist (ES-11-005): every item is stated with a reference, none is optional. */
CREATE OR REPLACE FUNCTION governance.dr_transfer_items() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  'code', 'state', 'contracts', 'dashboards', 'alerts', 'runbooks', 'risks', 'exceptions', 'incidents'] $$;
/* The stewardship SLA by consequence (DP-55-005 "escalate by consequence"): the higher the consequence, the shorter the review window. */
CREATE OR REPLACE FUNCTION governance.dr_case_sla(p_consequence text) RETURNS interval LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_consequence WHEN 'C0' THEN interval '30 days' WHEN 'C1' THEN interval '14 days' WHEN 'C2' THEN interval '5 days'
                            WHEN 'C3' THEN interval '2 days' WHEN 'C4' THEN interval '1 day' END $$;
/* Distinct approvals a decision needs: two named reviewers at C3 and C4, one below. */
CREATE OR REPLACE FUNCTION governance.dr_reviewers_required(p_consequence text) RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_consequence IN ('C3', 'C4') THEN 2 ELSE 1 END $$;
/* The ownership recertification period (the catalog's, 0095 §K.1) and the age after which an open gap escalates. */
CREATE OR REPLACE FUNCTION governance.dr_recertification_period() RETURNS interval LANGUAGE sql IMMUTABLE AS $$ SELECT interval '180 days' $$;
CREATE OR REPLACE FUNCTION governance.dr_gap_escalation_after() RETURNS interval LANGUAGE sql IMMUTABLE AS $$ SELECT interval '3 days' $$;
GRANT EXECUTE ON FUNCTION governance.dr_duties(), governance.dr_case_kinds(), governance.dr_gap_kinds(), governance.dr_transfer_items(),
  governance.dr_case_sla(text), governance.dr_reviewers_required(text), governance.dr_recertification_period(), governance.dr_gap_escalation_after() TO eye_app, eye_commit;

-- B107 dr — the timer owner: a stewardship SLA timer is owned by its case (0114 §SV.0's owner-kind list, copied whole, plus `stewardship_case`).
-- THE INTEGRATOR: §AR / §PG may widen the same list for their timers — fold the additions into one list.
ALTER TABLE executive.workflow_timers DROP CONSTRAINT IF EXISTS workflow_timers_owner_kind_check;
ALTER TABLE executive.workflow_timers ADD CONSTRAINT workflow_timers_owner_kind_check CHECK (owner_kind IN ('task', 'workflow_instance', 'grant', 'commitment_item', 'gate',
  -- B94 sv (0114 §SV.0)
  'service_case',
  -- B107 dr (0115 §DR.0)
  'stewardship_case'));

/* An active HUMAN homed at PLATFORM (a vendor-side owner, contact or authority). */
CREATE OR REPLACE FUNCTION governance.dr_platform_human(p_principal uuid) RETURNS boolean
STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = p_principal AND p.kind = 'human' AND p.status = 'active' AND p.scope = 'PLATFORM')
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION governance.dr_platform_human(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dr_platform_human(uuid) TO eye_app, eye_commit;

/* A principal's display name for the governance reads: a PLATFORM principal's to anyone authenticated; a tenant's within its tenant only. */
CREATE OR REPLACE FUNCTION governance.dr_name(p_principal uuid) RETURNS text
STABLE SECURITY DEFINER SET search_path = identity, public, pg_catalog, pg_temp AS $$
  SELECT p.display_name FROM identity.principals p
   WHERE p.id = p_principal AND public.eye_scope() <> 'NONE' AND (p.scope = 'PLATFORM' OR p.tenant_id = public.eye_tenant())
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION governance.dr_name(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dr_name(uuid) TO eye_app, eye_commit;

/* The live holders of a role covering the domain (DOMAIN bindings of the domain, TENANT bindings of the tenant) — active humans only. */
CREATE OR REPLACE FUNCTION governance.dr_role_holders(p_tenant uuid, p_domain uuid, p_role text) RETURNS uuid[]
STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT coalesce(array_agg(DISTINCT b.principal_id ORDER BY b.principal_id), '{}')
    FROM identity.role_bindings b JOIN identity.principals p ON p.id = b.principal_id
   WHERE b.role_code = p_role AND b.revoked_at IS NULL AND p.status = 'active' AND p.kind = 'human' AND b.tenant_id = p_tenant
     AND (b.scope = 'TENANT' OR (b.scope = 'DOMAIN' AND b.domain_id = p_domain))
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION governance.dr_role_holders(uuid, uuid, text) FROM PUBLIC;

/* The DOMAIN port head: the route's action (one of p_actions — answered), the bound scope, the acting principal. */
CREATE OR REPLACE FUNCTION governance.dr_domain_head(p_actions text[], p_tenant uuid, p_domain uuid, p_actor uuid, p_noun text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, observation, public, pg_catalog, pg_temp AS $$
DECLARE v text;
BEGIN
  v := observation.assert_authority(p_actions);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION '% rejected (actor): the act is recorded under the acting principal', p_noun USING ERRCODE = '42501';
  END IF;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION governance.dr_domain_head(text[], uuid, uuid, uuid, text) FROM PUBLIC;

/* REGISTER an object in the §0 core: a new artifact version when the digest changed (the current one superseded), nothing when it did not.
   Answers the current version. */
CREATE OR REPLACE FUNCTION governance.dr_register(p_id uuid, p_scope text, p_tenant uuid, p_domain uuid, p_kind text, p_key text, p_title text, p_owner uuid, p_owner_role text,
                                                  p_class text, p_lifecycle text, p_attributes jsonb, p_digest text, p_actor uuid, p_correlation uuid) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE cur governance.artifacts%ROWTYPE; v int;
BEGIN
  SELECT * INTO cur FROM governance.artifacts a WHERE a.artifact_id = p_id AND a.superseded_at IS NULL FOR UPDATE;
  IF FOUND AND cur.digest = p_digest AND cur.lifecycle = p_lifecycle THEN RETURN cur.version; END IF;
  IF FOUND THEN UPDATE governance.artifacts SET superseded_at = clock_timestamp() WHERE artifact_id = p_id AND version = cur.version; END IF;
  v := coalesce(cur.version, 0) + 1;
  INSERT INTO governance.artifacts (artifact_id, version, scope, tenant_id, domain_id, kind, external_key, title, owner_principal_id, owner_role, authority_class, controlling_volume,
                                    lifecycle, attributes, source, digest, recorded_by, correlation_id)
  VALUES (p_id, v, p_scope, p_tenant, p_domain, p_kind, left(p_key, 200), left(btrim(p_title), 500), p_owner, p_owner_role, p_class, 'V7', p_lifecycle,
          coalesce(p_attributes, '{}'::jsonb), jsonb_build_object('part', 'B107 §DR', 'migration', '0115_b107_x_dr'), p_digest, p_actor, p_correlation);
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION governance.dr_register(uuid, text, uuid, uuid, text, text, text, uuid, text, text, text, jsonb, text, uuid, uuid) FROM PUBLIC;

/* LINK two artifacts (once: an identical live link is answered, not repeated). */
CREATE OR REPLACE FUNCTION governance.dr_link(p_scope text, p_tenant uuid, p_domain uuid, p_from uuid, p_to uuid, p_relation text, p_attributes jsonb, p_actor uuid, p_correlation uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE v uuid;
BEGIN
  SELECT l.link_id INTO v FROM governance.links_live l WHERE l.from_artifact = p_from AND l.to_artifact = p_to AND l.relation = p_relation LIMIT 1;
  IF v IS NOT NULL THEN RETURN v; END IF;
  v := gen_random_uuid();
  INSERT INTO governance.links (link_id, scope, tenant_id, domain_id, from_artifact, to_artifact, relation, attributes, recorded_by, correlation_id)
  VALUES (v, p_scope, p_tenant, p_domain, p_from, p_to, p_relation, coalesce(p_attributes, '{}'::jsonb), p_actor, p_correlation);
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION governance.dr_link(text, uuid, uuid, uuid, uuid, text, jsonb, uuid, uuid) FROM PUBLIC;

/* RETIRE the live links of a relation from an artifact (a later row each — never an update). */
CREATE OR REPLACE FUNCTION governance.dr_retire_links(p_from uuid, p_relation text, p_actor uuid, p_correlation uuid) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE l record; n int := 0;
BEGIN
  FOR l IN SELECT * FROM governance.links_live x WHERE x.from_artifact = p_from AND x.relation = p_relation LOOP
    INSERT INTO governance.links (link_id, scope, tenant_id, domain_id, from_artifact, to_artifact, relation, retired, retires_link, recorded_by, correlation_id)
    VALUES (gen_random_uuid(), l.scope, l.tenant_id, l.domain_id, l.from_artifact, l.to_artifact, l.relation, true, l.link_id, p_actor, p_correlation);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION governance.dr_retire_links(uuid, text, uuid, uuid) FROM PUBLIC;

/* OPEN a hold on a subject (once per subject + reason + source while open): answers the hold id. */
CREATE OR REPLACE FUNCTION governance.dr_open_hold(p_tenant uuid, p_domain uuid, p_subject uuid, p_reason_kind text, p_source uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE v uuid;
BEGIN
  SELECT h.hold_id INTO v FROM governance.holds h WHERE h.subject_artifact = p_subject AND h.reason_kind = p_reason_kind AND h.source_artifact IS NOT DISTINCT FROM p_source AND h.lifted_at IS NULL LIMIT 1;
  IF v IS NOT NULL THEN RETURN v; END IF;
  v := gen_random_uuid();
  INSERT INTO governance.holds (hold_id, scope, tenant_id, domain_id, subject_artifact, reason_kind, source_artifact, reason, opened_by, correlation_id)
  VALUES (v, CASE WHEN p_domain IS NULL THEN 'PLATFORM' ELSE 'DOMAIN' END, p_tenant, p_domain, p_subject, p_reason_kind, p_source, left(btrim(p_reason), 1000), p_actor, p_correlation);
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION governance.dr_open_hold(uuid, uuid, uuid, text, uuid, text, uuid, uuid) FROM PUBLIC;

/* LIFT the open holds of a subject opened by a source (or of a reason kind on the subject when p_source is NULL): answers the lifted ids. */
CREATE OR REPLACE FUNCTION governance.dr_lift_holds(p_subject uuid, p_reason_kind text, p_source uuid, p_reason text, p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE v jsonb;
BEGIN
  WITH u AS (UPDATE governance.holds h SET lifted_at = clock_timestamp(), lifted_by = p_actor, lift_reason = left(btrim(p_reason), 1000)
              WHERE h.subject_artifact = p_subject AND h.lifted_at IS NULL AND (p_reason_kind IS NULL OR h.reason_kind = p_reason_kind)
                AND (p_source IS NULL OR h.source_artifact = p_source) RETURNING h.hold_id)
  SELECT coalesce(jsonb_agg(u.hold_id), '[]'::jsonb) INTO v FROM u;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION governance.dr_lift_holds(uuid, text, uuid, text, uuid) FROM PUBLIC;

/* The OPEN holds of a subject that stop NEW CONSUMPTION (DP-49-005 / DP-04-005): an ownership gap, an expired data exception, a conflict, a
   stewardship decision past its SLA at C3+ (evidence_stale with a stewardship case as its source). */
CREATE OR REPLACE FUNCTION governance.dr_consumption_holds(p_subject uuid) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('hold_id', h.hold_id, 'reason_kind', h.reason_kind, 'reason', h.reason, 'opened_at', h.opened_at) ORDER BY h.opened_at), '[]'::jsonb)
    FROM governance.holds h WHERE h.subject_artifact = p_subject AND h.lifted_at IS NULL AND h.reason_kind IN ('ownership_gap', 'exception_expired', 'conflict', 'evidence_stale')
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION governance.dr_consumption_holds(uuid) FROM PUBLIC;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §DR.1 THE DATA AUTHORITY REGISTRY (DOMAIN; versioned; the authority's id is the catalog asset's id)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE governance.data_authorities (
  authority_id          uuid NOT NULL,                                   -- = products.catalog_assets.asset_id
  version               int  NOT NULL CHECK (version >= 1),
  scope                 text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id             uuid NOT NULL,
  domain_id             uuid NOT NULL,
  asset_kind            text NOT NULL,
  asset_ref             text NOT NULL,
  asset_title           text NOT NULL,
  owner_principal_id    uuid NOT NULL,                                   -- the SINGULAR accountable owner (a named, active human of the tenant)
  steward_principal_id  uuid NOT NULL,                                   -- the named steward (never the owner)
  custodian_role        text NOT NULL REFERENCES identity.roles (code),  -- technical custody
  custodian_principal_id uuid,                                           -- optionally NAMED (then holds the custodian role)
  producer              text NOT NULL CHECK (length(btrim(producer)) BETWEEN 3 AND 300),   -- the producing source / pipeline / system, by reference
  consumer_roles        text[] NOT NULL DEFAULT '{}',
  policy_authority_role text NOT NULL REFERENCES identity.roles (code),
  quality_authority_role text NOT NULL REFERENCES identity.roles (code),
  escalation_path       text NOT NULL CHECK (length(btrim(escalation_path)) BETWEEN 8 AND 500),
  evidence_obligation   text NOT NULL CHECK (length(btrim(evidence_obligation)) BETWEEN 8 AND 500),
  write_rights          text[] NOT NULL DEFAULT '{}',                    -- the actions that may write the asset's authoritative state
  delegated_duties      jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(delegated_duties) = 'array'),   -- [{duty, to, until}]
  responsibility_key    text,                                            -- the B94 responsibility-matrix row this authority answers to
  state                 text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'ratified', 'rejected', 'superseded')),
  owner_accepted_at     timestamptz,
  digest                text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  proposed_by           uuid NOT NULL,
  proposed_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_by            uuid,
  decided_at            timestamptz,
  decision_reason       text,
  recertify_by          timestamptz,
  recertified_at        timestamptz,
  superseded_at         timestamptz,
  correlation_id        uuid NOT NULL,
  PRIMARY KEY (authority_id, version),
  CONSTRAINT gda_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT gda_owner_not_steward CHECK (owner_principal_id <> steward_principal_id),
  CONSTRAINT gda_decided CHECK (state = 'proposed' OR (decided_by IS NOT NULL AND decided_at IS NOT NULL AND decision_reason IS NOT NULL)),
  CONSTRAINT gda_sod CHECK (decided_by IS NULL OR (decided_by <> proposed_by AND decided_by <> owner_principal_id)),
  CONSTRAINT gda_ratified CHECK (state NOT IN ('ratified', 'superseded') OR (owner_accepted_at IS NOT NULL AND recertify_by IS NOT NULL)),
  CONSTRAINT gda_superseded CHECK ((state = 'superseded') = (superseded_at IS NOT NULL))
);
CREATE UNIQUE INDEX gda_one_ratified ON governance.data_authorities (authority_id) WHERE state = 'ratified';
CREATE UNIQUE INDEX gda_one_proposed ON governance.data_authorities (authority_id) WHERE state = 'proposed';
CREATE INDEX gda_domain ON governance.data_authorities (tenant_id, domain_id, state);
/* A version moves forward only: its declaration is immutable; only the acceptance, the decision, the recertification and the supersession
   are set; never deleted. */
CREATE OR REPLACE FUNCTION governance.dr_authority_forward() RETURNS trigger LANGUAGE plpgsql SET search_path = governance, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'data authority rejected (state): a data authority version is never deleted' USING ERRCODE = '2F002'; END IF;
  IF (to_jsonb(NEW) - ARRAY['state', 'owner_accepted_at', 'decided_by', 'decided_at', 'decision_reason', 'recertify_by', 'recertified_at', 'superseded_at'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['state', 'owner_accepted_at', 'decided_by', 'decided_at', 'decision_reason', 'recertify_by', 'recertified_at', 'superseded_at']) THEN
    RAISE EXCEPTION 'data authority rejected (state): version %/% is immutable; a change is a new version', OLD.authority_id, OLD.version USING ERRCODE = '2F002';
  END IF;
  IF OLD.state IN ('rejected', 'superseded') OR (OLD.state = 'ratified' AND NEW.state NOT IN ('ratified', 'superseded')) THEN
    RAISE EXCEPTION 'data authority rejected (state): version %/% is %', OLD.authority_id, OLD.version, OLD.state USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER gda_forward BEFORE UPDATE OR DELETE ON governance.data_authorities FOR EACH ROW EXECUTE FUNCTION governance.dr_authority_forward();

/* The authority as JSON (the reads and the ports' answers). */
CREATE OR REPLACE FUNCTION governance.dr_authority_json(a governance.data_authorities) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = governance, pg_catalog, pg_temp AS $$
  SELECT (to_jsonb(a) - 'scope' - 'correlation_id') || jsonb_build_object('owner_name', governance.dr_name(a.owner_principal_id), 'steward_name', governance.dr_name(a.steward_principal_id),
         'proposed_by_name', governance.dr_name(a.proposed_by), 'decided_by_name', governance.dr_name(a.decided_by))
$$;
GRANT EXECUTE ON FUNCTION governance.dr_authority_json(governance.data_authorities) TO eye_app, eye_commit;

/* The canonical body of a proposal (what the digest covers). */
CREATE OR REPLACE FUNCTION governance.dr_authority_body(a governance.data_authorities) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('authority_id', a.authority_id, 'version', a.version, 'tenant_id', a.tenant_id, 'domain_id', a.domain_id, 'asset', jsonb_build_object('kind', a.asset_kind, 'ref', a.asset_ref),
    'owner', a.owner_principal_id, 'steward', a.steward_principal_id, 'custodian_role', a.custodian_role, 'custodian', a.custodian_principal_id, 'producer', a.producer,
    'consumer_roles', to_jsonb(a.consumer_roles), 'policy_authority_role', a.policy_authority_role, 'quality_authority_role', a.quality_authority_role,
    'escalation_path', a.escalation_path, 'evidence_obligation', a.evidence_obligation, 'write_rights', to_jsonb(a.write_rights), 'delegated_duties', a.delegated_duties,
    'responsibility_key', a.responsibility_key)
$$;

/* PROPOSE (governance.ownership.authority.propose): a data steward or the domain administrator declares the duties of ONE catalog asset of
   the domain. Every named duty holder is an active human of the tenant; every role exists; a named custodian holds the custodian role; a
   responsibility key names a row of the domain's APPROVED B94 matrix; owner ≠ steward. One open proposal at a time (state); the expected
   version is the latest (stale). */
CREATE OR REPLACE FUNCTION governance.dr_propose_authority(p_authority uuid, p_tenant uuid, p_domain uuid, p_expected int, p_duties jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, products, service, executive, identity, decision, observation, public, pg_catalog, pg_temp AS $$
DECLARE asset products.catalog_assets%ROWTYPE; v_latest int; v_open int; a governance.data_authorities%ROWTYPE; v_owner uuid; v_steward uuid; v_cust uuid; d jsonb; r text;
        v_roles text[]; v_rights text[]; v_resp text;
BEGIN
  PERFORM governance.dr_domain_head(ARRAY['governance.ownership.authority.propose'], p_tenant, p_domain, p_actor, 'data authority');
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['data_steward', 'domain_admin']) THEN
    RAISE EXCEPTION 'data authority rejected (authority): a data authority is proposed by a data steward or the domain administrator' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO asset FROM products.catalog_assets x WHERE x.asset_id = p_authority AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'data authority rejected (unknown_asset): % is not a catalog asset of this domain (catalogue it first)', p_authority USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('governance.authority:' || p_authority::text, 0));
  SELECT coalesce(max(x.version), 0), count(*) FILTER (WHERE x.state = 'proposed') INTO v_latest, v_open FROM governance.data_authorities x WHERE x.authority_id = p_authority;
  IF v_open > 0 THEN RAISE EXCEPTION 'data authority rejected (state): a proposal for % % is open (v%); it is accepted and ratified, or rejected, first', asset.kind, asset.ref, v_latest USING ERRCODE = '22023'; END IF;
  IF p_expected IS DISTINCT FROM v_latest THEN RAISE EXCEPTION 'data authority rejected (stale): the latest version is %, the proposal names %', v_latest, coalesce(p_expected::text, 'none') USING ERRCODE = '22023'; END IF;
  IF p_duties IS NULL OR jsonb_typeof(p_duties) <> 'object' THEN RAISE EXCEPTION 'data authority rejected (duties): the duties are an object (owner, steward, custodianRole, producer, policyAuthorityRole, qualityAuthorityRole, escalationPath, evidenceObligation …)' USING ERRCODE = '22023'; END IF;
  BEGIN v_owner := (p_duties ->> 'owner')::uuid; v_steward := (p_duties ->> 'steward')::uuid; v_cust := NULLIF(p_duties ->> 'custodian', '')::uuid;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'data authority rejected (duties): owner, steward and custodian are principal ids' USING ERRCODE = '22023'; END;
  IF v_owner IS NULL OR NOT decision.is_active_human(v_owner, p_tenant) THEN RAISE EXCEPTION 'data authority rejected (unknown_owner): the owner is ONE named, active human of the tenant (singular accountability)' USING ERRCODE = '22023'; END IF;
  IF v_steward IS NULL OR NOT decision.is_active_human(v_steward, p_tenant) THEN RAISE EXCEPTION 'data authority rejected (unknown_steward): the steward is a named, active human of the tenant' USING ERRCODE = '22023'; END IF;
  IF v_owner = v_steward THEN RAISE EXCEPTION 'data authority rejected (separation_of_duties): the owner and the steward are different people (the steward administers what the owner is accountable for)' USING ERRCODE = '42501'; END IF;
  FOREACH r IN ARRAY ARRAY['custodianRole', 'policyAuthorityRole', 'qualityAuthorityRole'] LOOP
    IF NOT EXISTS (SELECT 1 FROM identity.roles x WHERE x.code = p_duties ->> r) THEN
      RAISE EXCEPTION 'data authority rejected (role): % names no role (%)', r, coalesce(p_duties ->> r, 'none') USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF v_cust IS NOT NULL AND NOT (v_cust = ANY (governance.dr_role_holders(p_tenant, p_domain, p_duties ->> 'custodianRole'))) THEN
    RAISE EXCEPTION 'data authority rejected (unknown_custodian): the named custodian holds % in this domain', p_duties ->> 'custodianRole' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_duties ->> 'producer', ''))) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'data authority rejected (producer): the producer is named by reference (3–300 characters)' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_duties ->> 'escalationPath', ''))) NOT BETWEEN 8 AND 500 THEN RAISE EXCEPTION 'data authority rejected (escalation): the escalation path is stated (8–500 characters)' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_duties ->> 'evidenceObligation', ''))) NOT BETWEEN 8 AND 500 THEN RAISE EXCEPTION 'data authority rejected (evidence): the evidence obligation is stated (8–500 characters)' USING ERRCODE = '22023'; END IF;
  IF p_duties ? 'consumerRoles' AND jsonb_typeof(p_duties -> 'consumerRoles') <> 'array' THEN RAISE EXCEPTION 'data authority rejected (role): consumerRoles is a list of roles' USING ERRCODE = '22023'; END IF;
  SELECT coalesce(array_agg(x ORDER BY x), '{}') INTO v_roles FROM (SELECT DISTINCT jsonb_array_elements_text(coalesce(p_duties -> 'consumerRoles', '[]'::jsonb)) x) q;
  IF EXISTS (SELECT 1 FROM unnest(v_roles) x WHERE NOT EXISTS (SELECT 1 FROM identity.roles y WHERE y.code = x)) THEN RAISE EXCEPTION 'data authority rejected (role): a consumer role names no role' USING ERRCODE = '22023'; END IF;
  IF p_duties ? 'writeRights' AND jsonb_typeof(p_duties -> 'writeRights') <> 'array' THEN RAISE EXCEPTION 'data authority rejected (write_rights): writeRights is a list of actions' USING ERRCODE = '22023'; END IF;
  SELECT coalesce(array_agg(x ORDER BY x), '{}') INTO v_rights FROM (SELECT DISTINCT jsonb_array_elements_text(coalesce(p_duties -> 'writeRights', '[]'::jsonb)) x) q;
  IF EXISTS (SELECT 1 FROM unnest(v_rights) x WHERE x !~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$') THEN RAISE EXCEPTION 'data authority rejected (write_rights): a write right is an action name (e.g. products.catalog.owner.set)' USING ERRCODE = '22023'; END IF;
  IF p_duties ? 'delegatedDuties' AND jsonb_typeof(p_duties -> 'delegatedDuties') <> 'array' THEN RAISE EXCEPTION 'data authority rejected (delegation): delegatedDuties is a list of {duty, to, until}' USING ERRCODE = '22023'; END IF;
  FOR d IN SELECT x FROM jsonb_array_elements(coalesce(p_duties -> 'delegatedDuties', '[]'::jsonb)) x LOOP
    IF jsonb_typeof(d) <> 'object' OR NOT ((d ->> 'duty') = ANY (governance.dr_duties())) OR (d ->> 'duty') = 'owner' THEN
      RAISE EXCEPTION 'data authority rejected (delegation): a delegated duty is one of steward, custodian, producer, consumer, policy_authority, quality_authority (accountability is never delegated)' USING ERRCODE = '22023';
    END IF;
    BEGIN
      IF NOT decision.is_active_human((d ->> 'to')::uuid, p_tenant) THEN RAISE EXCEPTION 'x'; END IF;
      IF (d ->> 'until')::timestamptz <= clock_timestamp() OR (d ->> 'until')::timestamptz > clock_timestamp() + interval '366 days' THEN RAISE EXCEPTION 'x'; END IF;
    EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'data authority rejected (delegation): a delegation names an active human of the tenant and an end within 366 days' USING ERRCODE = '22023'; END;
  END LOOP;
  v_resp := NULLIF(btrim(coalesce(p_duties ->> 'responsibilityKey', '')), '');
  IF v_resp IS NOT NULL AND NOT EXISTS (SELECT 1 FROM service.responsibility_matrices m JOIN service.responsibility_rows rr ON rr.matrix_id = m.matrix_id AND rr.version = m.version
                                          WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain AND m.state = 'approved' AND rr.responsibility_key = v_resp) THEN
    RAISE EXCEPTION 'data authority rejected (unknown_responsibility): % is no row of the domain''s approved responsibility matrix', v_resp USING ERRCODE = '22023';
  END IF;
  a.authority_id := p_authority; a.version := v_latest + 1; a.scope := 'DOMAIN'; a.tenant_id := p_tenant; a.domain_id := p_domain;
  a.asset_kind := asset.kind; a.asset_ref := asset.ref; a.asset_title := asset.title; a.owner_principal_id := v_owner; a.steward_principal_id := v_steward;
  a.custodian_role := p_duties ->> 'custodianRole'; a.custodian_principal_id := v_cust; a.producer := btrim(p_duties ->> 'producer'); a.consumer_roles := v_roles;
  a.policy_authority_role := p_duties ->> 'policyAuthorityRole'; a.quality_authority_role := p_duties ->> 'qualityAuthorityRole';
  a.escalation_path := btrim(p_duties ->> 'escalationPath'); a.evidence_obligation := btrim(p_duties ->> 'evidenceObligation'); a.write_rights := v_rights;
  a.delegated_duties := coalesce(p_duties -> 'delegatedDuties', '[]'::jsonb); a.responsibility_key := v_resp; a.state := 'proposed';
  a.digest := governance.digest(governance.dr_authority_body(a)); a.proposed_by := p_actor; a.proposed_at := clock_timestamp(); a.correlation_id := p_correlation;
  INSERT INTO governance.data_authorities VALUES (a.*);
  PERFORM governance.ledger(p_tenant, p_domain, 'data_authority', p_authority, a.version, 'authority.proposed', p_actor,
                            jsonb_build_object('asset', jsonb_build_object('kind', asset.kind, 'ref', asset.ref), 'owner', v_owner, 'steward', v_steward, 'digest', a.digest), p_correlation);
  SELECT * INTO a FROM governance.data_authorities x WHERE x.authority_id = p_authority AND x.version = v_latest + 1;
  RETURN governance.dr_authority_json(a);
END $$;
REVOKE ALL ON FUNCTION governance.dr_propose_authority(uuid, uuid, uuid, int, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dr_propose_authority(uuid, uuid, uuid, int, jsonb, uuid, uuid) TO eye_commit;

/* ACCEPT OWNERSHIP (governance.ownership.authority.accept; DP-01-006 "ownership acceptance"): the NAMED OWNER's own act on the exact digest. */
CREATE OR REPLACE FUNCTION governance.dr_accept_authority(p_authority uuid, p_tenant uuid, p_domain uuid, p_version int, p_digest text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, onboarding, public, pg_catalog, pg_temp AS $$
DECLARE a governance.data_authorities%ROWTYPE;
BEGIN
  PERFORM governance.dr_domain_head(ARRAY['governance.ownership.authority.accept'], p_tenant, p_domain, p_actor, 'data authority');
  SELECT * INTO a FROM governance.data_authorities x WHERE x.authority_id = p_authority AND x.version = p_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'data authority rejected (unknown_authority): no version % of % in this domain', p_version, p_authority USING ERRCODE = '22023'; END IF;
  IF a.state <> 'proposed' THEN RAISE EXCEPTION 'data authority rejected (state): version % is %; only a proposal is accepted', p_version, a.state USING ERRCODE = '22023'; END IF;
  IF onboarding.principal_kind(p_actor) IS DISTINCT FROM 'human' THEN RAISE EXCEPTION 'data authority rejected (actor): ownership is accepted by a named human' USING ERRCODE = '42501'; END IF;
  IF a.owner_principal_id <> p_actor THEN RAISE EXCEPTION 'data authority rejected (ownership): ownership of % % is accepted by its named owner only', a.asset_kind, a.asset_ref USING ERRCODE = '42501'; END IF;
  IF p_digest IS DISTINCT FROM a.digest THEN RAISE EXCEPTION 'data authority rejected (stale): the digest accepted is not version %''s (%)', p_version, a.digest USING ERRCODE = '22023'; END IF;
  IF a.owner_accepted_at IS NOT NULL THEN RAISE EXCEPTION 'data authority rejected (duplicate): ownership of version % was accepted at %', p_version, a.owner_accepted_at USING ERRCODE = '22023'; END IF;
  UPDATE governance.data_authorities SET owner_accepted_at = clock_timestamp() WHERE authority_id = p_authority AND version = p_version RETURNING * INTO a;
  PERFORM governance.ledger(p_tenant, p_domain, 'data_authority', p_authority, p_version, 'authority.owner_accepted', p_actor, jsonb_build_object('digest', a.digest), p_correlation);
  RETURN governance.dr_authority_json(a);
END $$;
REVOKE ALL ON FUNCTION governance.dr_accept_authority(uuid, uuid, uuid, int, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dr_accept_authority(uuid, uuid, uuid, int, text, uuid, uuid) TO eye_commit;

/* DECIDE (governance.ownership.authority.ratify; human-gated): RATIFY or REJECT a proposal on the exact digest — the approver test (a named
   human holding domain_admin or data_steward; never the proposer; never the owner whose authority it creates); ratification needs the
   owner's acceptance. The ratified version supersedes the prior one, is registered in the §0 core (kind data_authority) and starts the
   recertification clock. */
CREATE OR REPLACE FUNCTION governance.dr_decide_authority(p_authority uuid, p_tenant uuid, p_domain uuid, p_version int, p_digest text, p_decision text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, decision, public, pg_catalog, pg_temp AS $$
DECLARE a governance.data_authorities%ROWTYPE; v_now timestamptz := clock_timestamp(); v_art int;
BEGIN
  PERFORM governance.dr_domain_head(ARRAY['governance.ownership.authority.ratify'], p_tenant, p_domain, p_actor, 'data authority');
  SELECT * INTO a FROM governance.data_authorities x WHERE x.authority_id = p_authority AND x.version = p_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'data authority rejected (unknown_authority): no version % of % in this domain', p_version, p_authority USING ERRCODE = '22023'; END IF;
  PERFORM governance.assert_approver('data authority', p_actor, p_tenant, p_domain, ARRAY['domain_admin', 'data_steward'], a.proposed_by, ARRAY[a.owner_principal_id], 'ratifying a data authority');
  IF a.state <> 'proposed' THEN RAISE EXCEPTION 'data authority rejected (state): version % is %; only a proposal is decided', p_version, a.state USING ERRCODE = '22023'; END IF;
  IF p_digest IS DISTINCT FROM a.digest THEN RAISE EXCEPTION 'data authority rejected (stale): the digest decided is not version %''s (%)', p_version, a.digest USING ERRCODE = '22023'; END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('ratify', 'reject') THEN RAISE EXCEPTION 'data authority rejected (decision): ratify or reject' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'data authority rejected (reason): a decision states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_decision = 'reject' THEN
    UPDATE governance.data_authorities SET state = 'rejected', decided_by = p_actor, decided_at = v_now, decision_reason = btrim(p_reason) WHERE authority_id = p_authority AND version = p_version RETURNING * INTO a;
    PERFORM governance.ledger(p_tenant, p_domain, 'data_authority', p_authority, p_version, 'authority.rejected', p_actor, jsonb_build_object('reason', btrim(p_reason)), p_correlation);
    RETURN governance.dr_authority_json(a);
  END IF;
  IF a.owner_accepted_at IS NULL THEN RAISE EXCEPTION 'data authority rejected (state): the named owner has not accepted version % — ownership is accepted before it is ratified', p_version USING ERRCODE = '22023'; END IF;
  IF NOT decision.is_active_human(a.owner_principal_id, p_tenant) OR NOT decision.is_active_human(a.steward_principal_id, p_tenant) THEN
    RAISE EXCEPTION 'data authority rejected (state): the owner or the steward of version % is no longer an active human of the tenant', p_version USING ERRCODE = '22023';
  END IF;
  UPDATE governance.data_authorities SET state = 'superseded', superseded_at = v_now WHERE authority_id = p_authority AND state = 'ratified';
  UPDATE governance.data_authorities SET state = 'ratified', decided_by = p_actor, decided_at = v_now, decision_reason = btrim(p_reason),
         recertify_by = v_now + governance.dr_recertification_period(), recertified_at = v_now WHERE authority_id = p_authority AND version = p_version RETURNING * INTO a;
  v_art := governance.dr_register(p_authority, 'DOMAIN', p_tenant, p_domain, 'data_authority', a.asset_kind || ':' || a.asset_ref, 'Data authority — ' || a.asset_title,
                                  a.owner_principal_id, NULL, 'data_authority', 'active',
                                  jsonb_build_object('authority_version', a.version, 'steward', a.steward_principal_id, 'custodian_role', a.custodian_role, 'policy_authority_role', a.policy_authority_role,
                                                     'quality_authority_role', a.quality_authority_role, 'escalation_path', a.escalation_path), a.digest, p_actor, p_correlation);
  PERFORM governance.ledger(p_tenant, p_domain, 'data_authority', p_authority, p_version, 'authority.ratified', p_actor,
                            jsonb_build_object('reason', btrim(p_reason), 'digest', a.digest, 'artifact_version', v_art, 'recertify_by', a.recertify_by), p_correlation);
  RETURN governance.dr_authority_json(a);
END $$;
REVOKE ALL ON FUNCTION governance.dr_decide_authority(uuid, uuid, uuid, int, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dr_decide_authority(uuid, uuid, uuid, int, text, text, text, uuid, uuid) TO eye_commit;

/* RECERTIFY (governance.ownership.authority.recertify; DP-04-006 "ownership recertification"): the OWNER's own act on the ratified version. */
CREATE OR REPLACE FUNCTION governance.dr_recertify_authority(p_authority uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, onboarding, public, pg_catalog, pg_temp AS $$
DECLARE a governance.data_authorities%ROWTYPE; v_now timestamptz := clock_timestamp(); v_prior timestamptz;
BEGIN
  PERFORM governance.dr_domain_head(ARRAY['governance.ownership.authority.recertify'], p_tenant, p_domain, p_actor, 'data authority');
  SELECT * INTO a FROM governance.data_authorities x WHERE x.authority_id = p_authority AND x.state = 'ratified' AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'data authority rejected (unknown_authority): % has no ratified authority in this domain', p_authority USING ERRCODE = '22023'; END IF;
  IF onboarding.principal_kind(p_actor) IS DISTINCT FROM 'human' THEN RAISE EXCEPTION 'data authority rejected (actor): ownership is recertified by a named human' USING ERRCODE = '42501'; END IF;
  IF a.owner_principal_id <> p_actor THEN RAISE EXCEPTION 'data authority rejected (ownership): ownership of % % is recertified by its owner', a.asset_kind, a.asset_ref USING ERRCODE = '42501'; END IF;
  v_prior := a.recertify_by;
  UPDATE governance.data_authorities SET recertify_by = v_now + governance.dr_recertification_period(), recertified_at = v_now WHERE authority_id = p_authority AND version = a.version RETURNING * INTO a;
  PERFORM governance.ledger(p_tenant, p_domain, 'data_authority', p_authority, a.version, 'authority.recertified', p_actor, jsonb_build_object('prior_recertify_by', v_prior, 'recertify_by', a.recertify_by), p_correlation);
  RETURN governance.dr_authority_json(a);
END $$;
REVOKE ALL ON FUNCTION governance.dr_recertify_authority(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dr_recertify_authority(uuid, uuid, uuid, uuid, uuid) TO eye_commit;

/* THE OWNERSHIP SERVICE (DAT-GV-04, DP-04-002 "continuously reconcile"): one asset's duties RESOLVED LIVE — owner and steward (named:
   resolved while an active human of the tenant, else LOST), custodian (named, or the role's live holders), producer (declared), consumers
   (the declared roles; a product's live consumer register), policy and quality authorities (the roles' live holders), B94's owner
   resolution for the responsibility key, the recertification, the catalog's own owner compared (agree | conflict | catalog_unowned), the
   open gaps and holds — and the overall state undeclared | proposed | resolved | unresolved. Never infers an owner. Definer read guarded by
   the caller's bound scope (N-01). */
CREATE OR REPLACE FUNCTION governance.dr_resolve(p_tenant uuid, p_domain uuid, p_authority uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = governance, products, service, identity, decision, observation, public, pg_catalog, pg_temp AS $$
DECLARE asset products.catalog_assets%ROWTYPE; a governance.data_authorities%ROWTYPE; p governance.data_authorities%ROWTYPE; v_duties jsonb := '{}'::jsonb; v_h uuid[];
        v_unresolved text[] := '{}'; v_role text; v_key text; v_cat text; v_resp jsonb; v_consumers jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the data authority of an asset');
  SELECT * INTO asset FROM products.catalog_assets x WHERE x.asset_id = p_authority AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO a FROM governance.data_authorities x WHERE x.authority_id = p_authority AND x.state = 'ratified';
  SELECT * INTO p FROM governance.data_authorities x WHERE x.authority_id = p_authority AND x.state = 'proposed';
  IF a.authority_id IS NOT NULL THEN
    v_duties := v_duties || jsonb_build_object('owner', jsonb_build_object('principal', a.owner_principal_id, 'name', governance.dr_name(a.owner_principal_id),
                  'state', CASE WHEN decision.is_active_human(a.owner_principal_id, p_tenant) THEN 'resolved' ELSE 'lost' END));
    v_duties := v_duties || jsonb_build_object('steward', jsonb_build_object('principal', a.steward_principal_id, 'name', governance.dr_name(a.steward_principal_id),
                  'state', CASE WHEN decision.is_active_human(a.steward_principal_id, p_tenant) THEN 'resolved' ELSE 'lost' END));
    v_h := governance.dr_role_holders(p_tenant, p_domain, a.custodian_role);
    v_duties := v_duties || jsonb_build_object('custodian', jsonb_build_object('role', a.custodian_role, 'principal', a.custodian_principal_id, 'holders', to_jsonb(v_h),
                  'state', CASE WHEN a.custodian_principal_id IS NOT NULL THEN CASE WHEN a.custodian_principal_id = ANY (v_h) THEN 'resolved' ELSE 'lost' END
                                WHEN cardinality(v_h) = 0 THEN 'unfilled' WHEN cardinality(v_h) = 1 THEN 'resolved' ELSE 'ambiguous' END));
    v_duties := v_duties || jsonb_build_object('producer', jsonb_build_object('ref', a.producer, 'state', 'declared'));
    v_consumers := CASE WHEN asset.kind = 'product' AND asset.ref ~ '^[0-9a-f-]{36}$' THEN
                     (SELECT coalesce(jsonb_agg(jsonb_build_object('consumer_id', c.consumer_id, 'principal', c.consumer_principal_id, 'state', c.state) ORDER BY c.registered_at), '[]'::jsonb)
                        FROM products.product_consumers c WHERE c.product_id = asset.ref::uuid AND c.state IN ('registered', 'accepted')) ELSE '[]'::jsonb END;
    v_duties := v_duties || jsonb_build_object('consumer', jsonb_build_object('roles', to_jsonb(a.consumer_roles), 'registered', v_consumers, 'state', 'declared'));
    FOREACH v_role IN ARRAY ARRAY['policy_authority', 'quality_authority'] LOOP
      v_key := CASE v_role WHEN 'policy_authority' THEN a.policy_authority_role ELSE a.quality_authority_role END;
      v_h := governance.dr_role_holders(p_tenant, p_domain, v_key);
      v_duties := v_duties || jsonb_build_object(v_role, jsonb_build_object('role', v_key, 'holders', to_jsonb(v_h), 'state', CASE WHEN cardinality(v_h) = 0 THEN 'unfilled' ELSE 'resolved' END));
    END LOOP;
    SELECT coalesce(array_agg(k ORDER BY k), '{}') INTO v_unresolved FROM jsonb_each(v_duties) e(k, v) WHERE v ->> 'state' IN ('lost', 'unfilled', 'ambiguous');
    IF a.responsibility_key IS NOT NULL THEN v_resp := service.owner_resolution(p_tenant, p_domain, a.responsibility_key, 'local-dev'); END IF;
    v_cat := CASE WHEN asset.owner_principal_id IS NULL THEN 'catalog_unowned' WHEN asset.owner_principal_id = a.owner_principal_id THEN 'agree' ELSE 'conflict' END;
  END IF;
  RETURN jsonb_build_object(
    'authority_id', p_authority, 'at', clock_timestamp(),
    'asset', jsonb_build_object('kind', asset.kind, 'ref', asset.ref, 'title', asset.title, 'owner', asset.owner_principal_id, 'owner_name', governance.dr_name(asset.owner_principal_id),
                                'trusted', asset.trusted, 'discoverable', asset.discoverable, 'flags', asset.flags, 'classification', asset.classification),
    'state', CASE WHEN a.authority_id IS NULL AND p.authority_id IS NOT NULL THEN 'proposed' WHEN a.authority_id IS NULL THEN 'undeclared'
                  WHEN cardinality(v_unresolved) = 0 AND v_cat <> 'conflict' THEN 'resolved' ELSE 'unresolved' END,
    'ratified', CASE WHEN a.authority_id IS NULL THEN NULL ELSE governance.dr_authority_json(a) END,
    'proposal', CASE WHEN p.authority_id IS NULL THEN NULL ELSE governance.dr_authority_json(p) END,
    'duties', v_duties, 'unresolved', to_jsonb(v_unresolved),
    'escalation_path', a.escalation_path, 'evidence_obligation', a.evidence_obligation, 'write_rights', to_jsonb(a.write_rights), 'delegated_duties', a.delegated_duties,
    'responsibility', v_resp,
    'recertification', CASE WHEN a.authority_id IS NULL THEN NULL ELSE jsonb_build_object('recertify_by', a.recertify_by, 'recertified_at', a.recertified_at,
                                                                                            'state', CASE WHEN a.recertify_by < clock_timestamp() THEN 'lapsed' ELSE 'current' END) END,
    'catalog_agreement', CASE WHEN a.authority_id IS NULL THEN NULL ELSE jsonb_build_object('state', v_cat, 'catalog_owner', asset.owner_principal_id, 'registry_owner', a.owner_principal_id) END,
    'gaps', (SELECT coalesce(jsonb_agg(jsonb_build_object('gap_id', g.gap_id, 'gap_kind', g.gap_kind, 'state', g.state, 'opened_at', g.opened_at) ORDER BY g.opened_at), '[]'::jsonb)
               FROM governance.ownership_gaps g WHERE g.subject_id = p_authority AND g.state <> 'resolved'),
    'holds', governance.dr_consumption_holds(p_authority));
END $$;
-- (granted after §DR.3 declares the gap register it reads)

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §DR.2 THE DOMAIN REGISTRY EXTENSION (DOMAIN; DAT-GV-02) — beside tenancy.domains, which is untouched
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE governance.domain_registry (
  domain_id          uuid NOT NULL,
  version            int  NOT NULL CHECK (version >= 1),
  scope              text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id          uuid NOT NULL,
  accountable_leader uuid NOT NULL,                                     -- a named, active human of the tenant
  boundary           text NOT NULL CHECK (length(btrim(boundary)) BETWEEN 12 AND 2000),
  extension_contract jsonb NOT NULL CHECK (jsonb_typeof(extension_contract) = 'object'),   -- {version, extension_points[], compatibility, governance: observed | enforced}
  governance_mode    text NOT NULL CHECK (governance_mode IN ('observed', 'enforced')),
  state              text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'ratified', 'rejected', 'superseded')),
  digest             text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  proposed_by        uuid NOT NULL,
  proposed_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_by         uuid,
  decided_at         timestamptz,
  decision_reason    text,
  superseded_at      timestamptz,
  correlation_id     uuid NOT NULL,
  PRIMARY KEY (domain_id, version),
  CONSTRAINT gdr_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT gdr_decided CHECK (state = 'proposed' OR (decided_by IS NOT NULL AND decided_at IS NOT NULL AND decision_reason IS NOT NULL)),
  CONSTRAINT gdr_sod CHECK (decided_by IS NULL OR (decided_by <> proposed_by AND decided_by <> accountable_leader)),
  CONSTRAINT gdr_superseded CHECK ((state = 'superseded') = (superseded_at IS NOT NULL))
);
CREATE UNIQUE INDEX gdr_one_ratified ON governance.domain_registry (domain_id) WHERE state = 'ratified';
CREATE UNIQUE INDEX gdr_one_proposed ON governance.domain_registry (domain_id) WHERE state = 'proposed';
CREATE OR REPLACE FUNCTION governance.dr_domain_forward() RETURNS trigger LANGUAGE plpgsql SET search_path = governance, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'data authority rejected (state): a domain registry version is never deleted' USING ERRCODE = '2F002'; END IF;
  IF (to_jsonb(NEW) - ARRAY['state', 'decided_by', 'decided_at', 'decision_reason', 'superseded_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['state', 'decided_by', 'decided_at', 'decision_reason', 'superseded_at'])
     OR OLD.state IN ('rejected', 'superseded') THEN
    RAISE EXCEPTION 'data authority rejected (state): domain registry version %/% is immutable', OLD.domain_id, OLD.version USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER gdr_forward BEFORE UPDATE OR DELETE ON governance.domain_registry FOR EACH ROW EXECUTE FUNCTION governance.dr_domain_forward();

/* PROPOSE (governance.ownership.domain.propose): the domain administrator or the tenant administrator declares the domain's accountable
   leader, boundary and extension contract ({version 'vN', extensionPoints [≥1], compatibility backward|forward|full|none, governance
   observed|enforced}). */
CREATE OR REPLACE FUNCTION governance.dr_propose_domain(p_tenant uuid, p_domain uuid, p_expected int, p_leader uuid, p_boundary text, p_contract jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, tenancy, executive, decision, public, pg_catalog, pg_temp AS $$
DECLARE v_latest int; v_open int; v_status text; v_body jsonb; v_mode text; v_contract jsonb; r governance.domain_registry%ROWTYPE;
BEGIN
  PERFORM governance.dr_domain_head(ARRAY['governance.ownership.domain.propose'], p_tenant, p_domain, p_actor, 'data authority');
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['domain_admin', 'tenant_admin']) THEN
    RAISE EXCEPTION 'data authority rejected (authority): a domain''s registry entry is proposed by the domain or the tenant administrator' USING ERRCODE = '42501';
  END IF;
  SELECT d.status INTO v_status FROM tenancy.domains d WHERE d.id = p_domain AND d.tenant_id = p_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'data authority rejected (unknown_domain): % is not a domain of this tenant', p_domain USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('governance.domain:' || p_domain::text, 0));
  SELECT coalesce(max(x.version), 0), count(*) FILTER (WHERE x.state = 'proposed') INTO v_latest, v_open FROM governance.domain_registry x WHERE x.domain_id = p_domain;
  IF v_open > 0 THEN RAISE EXCEPTION 'data authority rejected (state): a domain registry proposal is open (v%)', v_latest USING ERRCODE = '22023'; END IF;
  IF p_expected IS DISTINCT FROM v_latest THEN RAISE EXCEPTION 'data authority rejected (stale): the latest version is %, the proposal names %', v_latest, coalesce(p_expected::text, 'none') USING ERRCODE = '22023'; END IF;
  IF p_leader IS NULL OR NOT decision.is_active_human(p_leader, p_tenant) THEN RAISE EXCEPTION 'data authority rejected (unknown_leader): the accountable leader is a named, active human of the tenant' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_boundary, ''))) NOT BETWEEN 12 AND 2000 THEN RAISE EXCEPTION 'data authority rejected (boundary): the boundary says what the domain owns (12–2000 characters)' USING ERRCODE = '22023'; END IF;
  IF p_contract IS NULL OR jsonb_typeof(p_contract) <> 'object' OR coalesce(p_contract ->> 'version', '') !~ '^v[0-9]{1,4}$'
     OR jsonb_typeof(p_contract -> 'extensionPoints') <> 'array' OR jsonb_array_length(p_contract -> 'extensionPoints') = 0
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_contract -> 'extensionPoints') x WHERE jsonb_typeof(x) <> 'string' OR length(btrim(x #>> '{}')) NOT BETWEEN 3 AND 120)
     OR coalesce(p_contract ->> 'compatibility', '') NOT IN ('backward', 'forward', 'full', 'none') THEN
    RAISE EXCEPTION 'data authority rejected (contract): the extension contract names its version (vN), its extension points (1+) and its compatibility (backward | forward | full | none)' USING ERRCODE = '22023';
  END IF;
  v_mode := coalesce(p_contract ->> 'governance', 'observed');
  IF v_mode NOT IN ('observed', 'enforced') THEN RAISE EXCEPTION 'data authority rejected (contract): the governance mode is observed or enforced' USING ERRCODE = '22023'; END IF;
  v_contract := jsonb_build_object('version', p_contract ->> 'version', 'extension_points', p_contract -> 'extensionPoints', 'compatibility', p_contract ->> 'compatibility', 'governance', v_mode);
  v_body := jsonb_build_object('domain_id', p_domain, 'version', v_latest + 1, 'leader', p_leader, 'boundary', btrim(p_boundary), 'contract', v_contract);
  INSERT INTO governance.domain_registry (domain_id, version, tenant_id, accountable_leader, boundary, extension_contract, governance_mode, digest, proposed_by, correlation_id)
  VALUES (p_domain, v_latest + 1, p_tenant, p_leader, btrim(p_boundary), v_contract, v_mode, governance.digest(v_body), p_actor, p_correlation) RETURNING * INTO r;
  PERFORM governance.ledger(p_tenant, p_domain, 'domain', p_domain, r.version, 'domain.proposed', p_actor, jsonb_build_object('leader', p_leader, 'digest', r.digest, 'domain_status', v_status), p_correlation);
  RETURN (to_jsonb(r) - 'scope' - 'correlation_id') || jsonb_build_object('leader_name', governance.dr_name(r.accountable_leader), 'domain_status', v_status);
END $$;
REVOKE ALL ON FUNCTION governance.dr_propose_domain(uuid, uuid, int, uuid, text, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dr_propose_domain(uuid, uuid, int, uuid, text, jsonb, uuid, uuid) TO eye_commit;

/* DECIDE (governance.ownership.domain.ratify; human-gated): the customer sponsor or the tenant administrator — never the proposer, never the
   leader the entry appoints — ratifies or rejects on the digest; the ratified entry is registered (kind domain, DOMAIN scope). */
CREATE OR REPLACE FUNCTION governance.dr_decide_domain(p_tenant uuid, p_domain uuid, p_version int, p_digest text, p_decision text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, tenancy, public, pg_catalog, pg_temp AS $$
DECLARE r governance.domain_registry%ROWTYPE; v_now timestamptz := clock_timestamp(); v_name text;
BEGIN
  PERFORM governance.dr_domain_head(ARRAY['governance.ownership.domain.ratify'], p_tenant, p_domain, p_actor, 'data authority');
  SELECT * INTO r FROM governance.domain_registry x WHERE x.domain_id = p_domain AND x.version = p_version AND x.tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'data authority rejected (unknown_domain_entry): no version % of the domain''s registry entry', p_version USING ERRCODE = '22023'; END IF;
  PERFORM governance.assert_approver('data authority', p_actor, p_tenant, p_domain, ARRAY['customer_sponsor', 'tenant_admin'], r.proposed_by, ARRAY[r.accountable_leader], 'ratifying a domain''s registry entry');
  IF r.state <> 'proposed' THEN RAISE EXCEPTION 'data authority rejected (state): version % is %', p_version, r.state USING ERRCODE = '22023'; END IF;
  IF p_digest IS DISTINCT FROM r.digest THEN RAISE EXCEPTION 'data authority rejected (stale): the digest decided is not version %''s', p_version USING ERRCODE = '22023'; END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('ratify', 'reject') THEN RAISE EXCEPTION 'data authority rejected (decision): ratify or reject' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'data authority rejected (reason): a decision states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_decision = 'ratify' THEN
    UPDATE governance.domain_registry SET state = 'superseded', superseded_at = v_now WHERE domain_id = p_domain AND state = 'ratified';
  END IF;
  UPDATE governance.domain_registry SET state = CASE WHEN p_decision = 'ratify' THEN 'ratified' ELSE 'rejected' END, decided_by = p_actor, decided_at = v_now, decision_reason = btrim(p_reason)
   WHERE domain_id = p_domain AND version = p_version RETURNING * INTO r;
  IF p_decision = 'ratify' THEN
    SELECT d.name INTO v_name FROM tenancy.domains d WHERE d.id = p_domain;
    PERFORM governance.dr_register(p_domain, 'DOMAIN', p_tenant, p_domain, 'domain', 'DOMAIN:' || p_domain::text, 'Domain — ' || coalesce(v_name, p_domain::text), r.accountable_leader, NULL,
                                   'domain_registry', 'active', jsonb_build_object('registry_version', r.version, 'contract', r.extension_contract, 'governance', r.governance_mode), r.digest, p_actor, p_correlation);
  END IF;
  PERFORM governance.ledger(p_tenant, p_domain, 'domain', p_domain, p_version, CASE WHEN p_decision = 'ratify' THEN 'domain.ratified' ELSE 'domain.rejected' END, p_actor,
                            jsonb_build_object('reason', btrim(p_reason), 'digest', r.digest, 'governance', r.governance_mode), p_correlation);
  RETURN (to_jsonb(r) - 'scope' - 'correlation_id') || jsonb_build_object('leader_name', governance.dr_name(r.accountable_leader));
END $$;
REVOKE ALL ON FUNCTION governance.dr_decide_domain(uuid, uuid, int, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dr_decide_domain(uuid, uuid, int, text, text, text, uuid, uuid) TO eye_commit;

/* The domain's ratified governance mode (observed when none is ratified). */
CREATE OR REPLACE FUNCTION governance.dr_domain_mode(p_domain uuid) RETURNS text
STABLE SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
  SELECT coalesce((SELECT r.governance_mode FROM governance.domain_registry r WHERE r.domain_id = p_domain AND r.state = 'ratified'), 'unregistered')
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION governance.dr_domain_mode(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dr_domain_mode(uuid) TO eye_app, eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §DR.3 THE OWNERSHIP-GAP REGISTER AND RECONCILIATION (DP-04-005, DP-01-005)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/* THE GAP: a subject (a catalog asset, a product, a component, a data capability, a stewardship case) whose ownership does not resolve.
   PLATFORM rows are the vendor's (components, data capabilities); DOMAIN rows the customer's. The DETAIL preserves the state found at
   opening (the conflicting instructions, verbatim). open → escalated → accepted (a named approver accepts the residual until a date; the hold
   lifts, the gap stays listed) | resolved (the condition no longer holds — never by inference: the reconciliation re-reads it). */
CREATE TABLE governance.ownership_gaps (
  gap_id          uuid PRIMARY KEY,
  scope           text NOT NULL CHECK (scope IN ('PLATFORM', 'DOMAIN')),
  tenant_id       uuid,
  domain_id       uuid,
  subject_kind    text NOT NULL CHECK (subject_kind IN ('catalog_asset', 'product', 'component', 'data_capability', 'stewardship_case')),
  subject_id      uuid NOT NULL,
  subject_label   text NOT NULL CHECK (length(btrim(subject_label)) BETWEEN 1 AND 300),
  gap_kind        text NOT NULL CHECK (gap_kind = ANY (governance.dr_gap_kinds())),
  detail          jsonb NOT NULL CHECK (jsonb_typeof(detail) = 'object'),
  escalation_path text NOT NULL CHECK (length(btrim(escalation_path)) >= 4),
  state           text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'escalated', 'accepted', 'resolved')),
  held            boolean NOT NULL,                                        -- the subject held while the gap is open (governance.holds ownership_gap)
  opened_by       uuid NOT NULL,
  opened_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  escalations     int NOT NULL DEFAULT 0 CHECK (escalations >= 0),
  escalated_at    timestamptz,
  accepted_by     uuid,
  accepted_at     timestamptz,
  accepted_until  timestamptz,
  accept_reason   text,
  resolved_by     uuid,
  resolved_at     timestamptz,
  resolution      text,
  correlation_id  uuid NOT NULL,
  CONSTRAINT gog_scope CHECK ((scope = 'PLATFORM' AND tenant_id IS NULL AND domain_id IS NULL) OR (scope = 'DOMAIN' AND tenant_id IS NOT NULL AND domain_id IS NOT NULL)),
  CONSTRAINT gog_accepted CHECK ((state = 'accepted') = (accepted_by IS NOT NULL AND accepted_at IS NOT NULL AND accepted_until IS NOT NULL AND accept_reason IS NOT NULL) OR state = 'resolved'),
  CONSTRAINT gog_resolved CHECK ((state = 'resolved') = (resolved_at IS NOT NULL AND resolution IS NOT NULL))
);
CREATE UNIQUE INDEX gog_one_live ON governance.ownership_gaps (subject_id, gap_kind) WHERE state <> 'resolved';
CREATE INDEX gog_domain ON governance.ownership_gaps (tenant_id, domain_id, state);
CREATE OR REPLACE FUNCTION governance.dr_gap_forward() RETURNS trigger LANGUAGE plpgsql SET search_path = governance, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'data authority rejected (state): an ownership gap is never deleted' USING ERRCODE = '2F002'; END IF;
  IF OLD.state = 'resolved' OR (NEW.gap_id, NEW.scope, NEW.tenant_id, NEW.domain_id, NEW.subject_kind, NEW.subject_id, NEW.gap_kind, NEW.detail, NEW.opened_by, NEW.opened_at)
     IS DISTINCT FROM (OLD.gap_id, OLD.scope, OLD.tenant_id, OLD.domain_id, OLD.subject_kind, OLD.subject_id, OLD.gap_kind, OLD.detail, OLD.opened_by, OLD.opened_at) THEN
    RAISE EXCEPTION 'data authority rejected (state): gap % is % — its opening record is immutable', OLD.gap_id, OLD.state USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER gog_forward BEFORE UPDATE OR DELETE ON governance.ownership_gaps FOR EACH ROW EXECUTE FUNCTION governance.dr_gap_forward();

/* OPEN a gap (internal): the row, the hold (when held), the attention item (DOMAIN subjects — a PLATFORM gap is shown in the workspace and
   the ledger), the ledger event. Answers the gap row as jsonb (an existing live gap of the same subject and kind is answered as is). */
CREATE OR REPLACE FUNCTION governance.dr_open_gap(p_tenant uuid, p_domain uuid, p_subject_kind text, p_subject uuid, p_label text, p_kind text, p_detail jsonb, p_path text, p_held boolean,
                                                  p_named_owner uuid, p_consequence text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, executive, pg_catalog, pg_temp AS $$
DECLARE g governance.ownership_gaps%ROWTYPE; v_ev uuid; v_item jsonb;
BEGIN
  SELECT * INTO g FROM governance.ownership_gaps x WHERE x.subject_id = p_subject AND x.gap_kind = p_kind AND x.state <> 'resolved';
  IF FOUND THEN RETURN to_jsonb(g) || jsonb_build_object('existing', true); END IF;
  INSERT INTO governance.ownership_gaps (gap_id, scope, tenant_id, domain_id, subject_kind, subject_id, subject_label, gap_kind, detail, escalation_path, held, opened_by, correlation_id)
  VALUES (gen_random_uuid(), CASE WHEN p_domain IS NULL THEN 'PLATFORM' ELSE 'DOMAIN' END, p_tenant, p_domain, p_subject_kind, p_subject, left(btrim(p_label), 300), p_kind,
          coalesce(p_detail, '{}'::jsonb), coalesce(NULLIF(btrim(coalesce(p_path, '')), ''), 'the steward, then the domain administrator'), p_held, p_actor, p_correlation) RETURNING * INTO g;
  IF p_held THEN
    PERFORM governance.dr_open_hold(p_tenant, p_domain, p_subject, 'ownership_gap', g.gap_id,
              format('ownership gap (%s) on %s: new consumption and authoritative changes stop until it is resolved or accepted', p_kind, g.subject_label), p_actor, p_correlation);
  END IF;
  v_ev := governance.ledger(p_tenant, p_domain, 'ownership_gap', g.gap_id, NULL, 'gap.opened', p_actor,
                            jsonb_build_object('subject_kind', p_subject_kind, 'subject_id', p_subject, 'gap_kind', p_kind, 'held', p_held, 'detail', g.detail, 'escalation_path', g.escalation_path), p_correlation);
  IF p_domain IS NOT NULL THEN
    v_item := executive.b33_raise_routed(p_tenant, p_domain, 'governance.ownership', CASE p_subject_kind WHEN 'stewardship_case' THEN 'stewardship_case' WHEN 'product' THEN 'product' ELSE 'asset' END,
                p_subject, left(format('Ownership gap (%s): %s — escalation: %s', replace(p_kind, '_', ' '), g.subject_label, g.escalation_path), 512),
                jsonb_build_array(format('the ownership of %s does not resolve (%s)', g.subject_label, p_kind)), p_named_owner, v_ev, 'OwnershipGapOpened',
                jsonb_build_object('gap_id', g.gap_id, 'gap_kind', p_kind, 'held', p_held, 'escalation_path', g.escalation_path, 'by', 'B107 §DR'),
                jsonb_build_object('consequence', coalesce(p_consequence, 'C2')), p_actor, p_correlation);
  END IF;
  RETURN to_jsonb(g) || jsonb_build_object('existing', false, 'item', v_item);
END $$;
REVOKE ALL ON FUNCTION governance.dr_open_gap(uuid, uuid, text, uuid, text, text, jsonb, text, boolean, uuid, text, uuid, uuid) FROM PUBLIC;

/* RESOLVE a gap (internal): the condition no longer holds — the hold lifted, the items closed, the ledger event. */
CREATE OR REPLACE FUNCTION governance.dr_resolve_gap(p_gap uuid, p_resolution text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, executive, pg_catalog, pg_temp AS $$
DECLARE g governance.ownership_gaps%ROWTYPE;
BEGIN
  UPDATE governance.ownership_gaps SET state = 'resolved', resolved_by = p_actor, resolved_at = clock_timestamp(), resolution = left(btrim(p_resolution), 1000)
   WHERE gap_id = p_gap AND state <> 'resolved' RETURNING * INTO g;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM governance.dr_lift_holds(g.subject_id, 'ownership_gap', g.gap_id, 'the ownership gap is resolved: ' || p_resolution, p_actor);
  IF g.domain_id IS NOT NULL THEN
    PERFORM executive.b33_close_items(g.tenant_id, g.domain_id, 'governance.ownership', NULL, g.subject_id, 'the ownership gap is resolved', p_actor, p_correlation);
  END IF;
  PERFORM governance.ledger(g.tenant_id, g.domain_id, 'ownership_gap', g.gap_id, NULL, 'gap.resolved', p_actor, jsonb_build_object('resolution', g.resolution), p_correlation);
  RETURN to_jsonb(g);
END $$;
REVOKE ALL ON FUNCTION governance.dr_resolve_gap(uuid, text, uuid, uuid) FROM PUBLIC;

/* What a domain's assets SAY about their ownership now (internal; the reconciliation's read): one row per (asset, gap kind) found. MATERIAL
   assets are products and sources; a ratified authority's failures are found on any asset. */
CREATE OR REPLACE FUNCTION governance.dr_domain_findings(p_tenant uuid, p_domain uuid) RETURNS TABLE (subject_kind text, subject_id uuid, label text, gap_kind text, detail jsonb, path text, owner uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = governance, products, decision, pg_catalog, pg_temp AS $$
  WITH x AS (
    SELECT a.asset_id, a.kind, a.ref, a.title, a.owner_principal_id AS catalog_owner, r.authority_id, r.version, r.owner_principal_id AS owner, r.steward_principal_id AS steward,
           r.custodian_role, r.custodian_principal_id, r.policy_authority_role, r.quality_authority_role, r.escalation_path,
           p.product_id, p.product_key, p.owner_principal_id AS product_owner, p.state AS product_state
      FROM products.catalog_assets a
      LEFT JOIN governance.data_authorities r ON r.authority_id = a.asset_id AND r.state = 'ratified'
      LEFT JOIN products.products_current p ON a.kind = 'product' AND p.product_id::text = a.ref AND p.tenant_id = a.tenant_id AND p.domain_id = a.domain_id
     WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain)
  SELECT 'catalog_asset', x.asset_id, x.kind || ' ' || x.title || ' (' || x.ref || ')', 'no_owner',
         jsonb_build_object('reason', 'no ratified data authority: the asset does not resolve to an approved authority and ownership contract (DP-01-005)', 'catalog_owner', x.catalog_owner),
         'the data steward, then the domain administrator', x.catalog_owner
    FROM x WHERE x.authority_id IS NULL AND x.kind IN ('product', 'source')
  UNION ALL
  SELECT 'catalog_asset', x.asset_id, x.kind || ' ' || x.title || ' (' || x.ref || ')', 'owner_lost',
         jsonb_build_object('reason', CASE WHEN x.authority_id IS NOT NULL AND NOT decision.is_active_human(x.owner, p_tenant) THEN 'the ratified owner is no longer an active human of the tenant'
                                           ELSE 'the product''s own owner is no longer an active human of the tenant' END,
                            'registry_owner', x.owner, 'product_owner', x.product_owner, 'authority_version', x.version),
         coalesce(x.escalation_path, 'the data steward, then the domain administrator'), NULL::uuid
    FROM x WHERE (x.authority_id IS NOT NULL AND NOT decision.is_active_human(x.owner, p_tenant))
              OR (x.product_id IS NOT NULL AND x.product_state IN ('registered', 'released', 'degraded') AND NOT decision.is_active_human(x.product_owner, p_tenant))
  UNION ALL
  SELECT 'catalog_asset', x.asset_id, x.kind || ' ' || x.title || ' (' || x.ref || ')', 'conflicting_authorities',
         jsonb_build_object('reason', 'the data authority registry and the catalog name different owners — both instructions preserved; one is corrected by its own governed act',
                            'instructions', jsonb_build_array(jsonb_build_object('source', 'governance.data_authorities v' || x.version, 'owner', x.owner),
                                                              jsonb_build_object('source', 'products.catalog_assets', 'owner', x.catalog_owner))),
         x.escalation_path, x.owner
    FROM x WHERE x.authority_id IS NOT NULL AND x.catalog_owner IS NOT NULL AND x.catalog_owner <> x.owner AND decision.is_active_human(x.owner, p_tenant)
  UNION ALL
  SELECT 'catalog_asset', x.asset_id, x.kind || ' ' || x.title || ' (' || x.ref || ')', 'unresolved_authority',
         jsonb_build_object('reason', 'a duty of the ratified authority does not resolve',
                            'steward', CASE WHEN decision.is_active_human(x.steward, p_tenant) THEN 'resolved' ELSE 'lost' END,
                            'custodian', CASE WHEN x.custodian_principal_id IS NOT NULL THEN CASE WHEN x.custodian_principal_id = ANY (governance.dr_role_holders(p_tenant, p_domain, x.custodian_role)) THEN 'resolved' ELSE 'lost' END
                                              WHEN cardinality(governance.dr_role_holders(p_tenant, p_domain, x.custodian_role)) = 0 THEN 'unfilled' ELSE 'resolved' END,
                            'policy_authority', CASE WHEN cardinality(governance.dr_role_holders(p_tenant, p_domain, x.policy_authority_role)) = 0 THEN 'unfilled' ELSE 'resolved' END,
                            'quality_authority', CASE WHEN cardinality(governance.dr_role_holders(p_tenant, p_domain, x.quality_authority_role)) = 0 THEN 'unfilled' ELSE 'resolved' END),
         x.escalation_path, x.owner
    FROM x WHERE x.authority_id IS NOT NULL AND decision.is_active_human(x.owner, p_tenant)
              AND (NOT decision.is_active_human(x.steward, p_tenant)
                   OR (x.custodian_principal_id IS NOT NULL AND NOT (x.custodian_principal_id = ANY (governance.dr_role_holders(p_tenant, p_domain, x.custodian_role))))
                   OR cardinality(governance.dr_role_holders(p_tenant, p_domain, x.custodian_role)) = 0
                   OR cardinality(governance.dr_role_holders(p_tenant, p_domain, x.policy_authority_role)) = 0
                   OR cardinality(governance.dr_role_holders(p_tenant, p_domain, x.quality_authority_role)) = 0)
$$;
REVOKE ALL ON FUNCTION governance.dr_domain_findings(uuid, uuid) FROM PUBLIC;

/* RECONCILE A DOMAIN (governance.ownership.reconcile — a data steward or the domain administrator — or executive.attention.tick): the
   findings read FIRST, then: a NEW finding opens its gap (HELD — new consumption stops — for an owner lost, conflicting authorities or an
   unresolved duty; for a missing authority only in an ENFORCED domain: an observed domain lists it as debt); an ACCEPTED gap past its date
   with the condition still present re-opens; a live gap whose condition is gone RESOLVES; an open gap older than the escalation age
   ESCALATES (its escalation path; a C3 item). Answers what changed and the products to DEGRADE (DP-41-005: a released product whose owner is
   lost, or whose policy violation is recorded — the caller degrades them through products.degrade_product, never from inside this port). */
CREATE OR REPLACE FUNCTION governance.dr_reconcile_domain(p_run uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, products, executive, decision, public, pg_catalog, pg_temp AS $$
DECLARE v_action text; v_mode text; f record; g governance.ownership_gaps%ROWTYPE; v_found jsonb := '[]'::jsonb; v_opened jsonb := '[]'::jsonb; v_reopened jsonb := '[]'::jsonb;
        v_resolved jsonb := '[]'::jsonb; v_escalated jsonb := '[]'::jsonb; v_degrade jsonb; v_r jsonb; v_ev uuid; v_held boolean; v_now timestamptz := clock_timestamp();
BEGIN
  v_action := governance.dr_domain_head(ARRAY['governance.ownership.reconcile', 'executive.attention.tick'], p_tenant, p_domain, p_actor, 'data authority');
  IF v_action = 'governance.ownership.reconcile' AND NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['data_steward', 'domain_admin']) THEN
    RAISE EXCEPTION 'data authority rejected (authority): ownership is reconciled by a data steward, the domain administrator or the attention tick' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('governance.ownership.reconcile:' || p_domain::text, 0));
  v_mode := governance.dr_domain_mode(p_domain);
  -- 1. THE FINDINGS (read first)
  FOR f IN SELECT * FROM governance.dr_domain_findings(p_tenant, p_domain) ORDER BY 2, 4 LOOP
    v_found := v_found || jsonb_build_object('subject_id', f.subject_id, 'gap_kind', f.gap_kind);
    SELECT * INTO g FROM governance.ownership_gaps x WHERE x.subject_id = f.subject_id AND x.gap_kind = f.gap_kind AND x.state <> 'resolved';
    v_held := f.gap_kind <> 'no_owner' OR v_mode = 'enforced';
    IF NOT FOUND THEN
      v_r := governance.dr_open_gap(p_tenant, p_domain, f.subject_kind, f.subject_id, f.label, f.gap_kind, f.detail, f.path, v_held, f.owner, 'C2', p_actor, p_correlation);
      v_opened := v_opened || jsonb_build_object('gap_id', v_r ->> 'gap_id', 'subject_id', f.subject_id, 'gap_kind', f.gap_kind, 'held', v_held);
    ELSIF g.state = 'accepted' AND g.accepted_until < v_now THEN
      UPDATE governance.ownership_gaps SET state = 'open', accepted_by = NULL, accepted_at = NULL, accepted_until = NULL, accept_reason = NULL, held = v_held WHERE gap_id = g.gap_id;
      IF v_held THEN
        PERFORM governance.dr_open_hold(p_tenant, p_domain, g.subject_id, 'ownership_gap', g.gap_id,
                  format('ownership gap (%s) on %s: its acceptance lapsed at %s and the condition still holds', g.gap_kind, g.subject_label, g.accepted_until), p_actor, p_correlation);
      END IF;
      v_ev := governance.ledger(p_tenant, p_domain, 'ownership_gap', g.gap_id, NULL, 'gap.reopened', p_actor, jsonb_build_object('accepted_until', g.accepted_until), p_correlation);
      PERFORM executive.b33_raise_routed(p_tenant, p_domain, 'governance.ownership', 'asset', g.subject_id, left(format('Ownership gap RE-OPENED (%s): %s — the acceptance lapsed', g.gap_kind, g.subject_label), 512),
                jsonb_build_array('the accepted residual expired and the condition still holds'), f.owner, v_ev, 'OwnershipGapReopened', jsonb_build_object('gap_id', g.gap_id), jsonb_build_object('consequence', 'C2'), p_actor, p_correlation);
      v_reopened := v_reopened || jsonb_build_object('gap_id', g.gap_id, 'subject_id', g.subject_id, 'gap_kind', g.gap_kind);
    ELSIF g.state IN ('open', 'escalated') AND g.held <> v_held THEN
      -- the domain's mode changed: an enforced domain holds a missing authority; an observed one lists it
      UPDATE governance.ownership_gaps SET held = v_held WHERE gap_id = g.gap_id;
      IF v_held THEN PERFORM governance.dr_open_hold(p_tenant, p_domain, g.subject_id, 'ownership_gap', g.gap_id, format('ownership gap (%s) on %s: the domain enforces its ownership contract', g.gap_kind, g.subject_label), p_actor, p_correlation);
      ELSE PERFORM governance.dr_lift_holds(g.subject_id, 'ownership_gap', g.gap_id, 'the domain observes (does not enforce) a missing authority', p_actor); END IF;
    END IF;
  END LOOP;
  -- 2. RESOLUTION: a live DOMAIN gap of a reconciled kind whose condition is gone
  FOR g IN SELECT * FROM governance.ownership_gaps x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state <> 'resolved' AND x.subject_kind = 'catalog_asset'
             AND NOT (jsonb_build_object('subject_id', x.subject_id, 'gap_kind', x.gap_kind) <@ ANY (ARRAY(SELECT jsonb_array_elements(v_found)))) LOOP
    v_r := governance.dr_resolve_gap(g.gap_id, format('the reconciliation (%s) no longer finds %s on %s', CASE WHEN v_action = 'executive.attention.tick' THEN 'tick' ELSE 'steward' END, g.gap_kind, g.subject_label), p_actor, p_correlation);
    v_resolved := v_resolved || jsonb_build_object('gap_id', g.gap_id, 'subject_id', g.subject_id, 'gap_kind', g.gap_kind);
  END LOOP;
  -- 3. ESCALATION by age (the recorded escalation path; a C3 item)
  FOR g IN SELECT * FROM governance.ownership_gaps x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state IN ('open', 'escalated')
             AND coalesce(x.escalated_at, x.opened_at) < v_now - governance.dr_gap_escalation_after() LOOP
    UPDATE governance.ownership_gaps SET state = 'escalated', escalations = escalations + 1, escalated_at = v_now WHERE gap_id = g.gap_id;
    v_ev := governance.ledger(p_tenant, p_domain, 'ownership_gap', g.gap_id, NULL, 'gap.escalated', p_actor, jsonb_build_object('escalations', g.escalations + 1, 'escalation_path', g.escalation_path), p_correlation);
    PERFORM executive.b33_raise_routed(p_tenant, p_domain, 'governance.ownership', CASE g.subject_kind WHEN 'stewardship_case' THEN 'stewardship_case' ELSE 'asset' END, g.subject_id,
              left(format('ESCALATED ownership gap (%s, level %s): %s — %s', g.gap_kind, g.escalations + 1, g.subject_label, g.escalation_path), 512),
              jsonb_build_array(format('open since %s, beyond the escalation age %s', g.opened_at, governance.dr_gap_escalation_after())), NULL, v_ev, 'OwnershipGapEscalated',
              jsonb_build_object('gap_id', g.gap_id, 'level', g.escalations + 1), jsonb_build_object('consequence', 'C3'), p_actor, p_correlation);
    v_escalated := v_escalated || jsonb_build_object('gap_id', g.gap_id, 'level', g.escalations + 1);
  END LOOP;
  -- 4. THE PRODUCTS TO DEGRADE (DP-41-005): released, owner lost or a recorded policy violation
  SELECT coalesce(jsonb_agg(jsonb_build_object('product_id', p.product_id, 'product_key', p.product_key,
           'cause', CASE WHEN NOT decision.is_active_human(p.owner_principal_id, p_tenant) THEN 'owner_lost' ELSE 'policy_violation' END,
           'reason', CASE WHEN NOT decision.is_active_human(p.owner_principal_id, p_tenant)
                          THEN format('the product''s owner is no longer an active human of the tenant (ownership lost — DP-41-005); restored through an accepted domain review once an owner is named')
                          ELSE format('a policy violation is recorded on the product (stewardship case %s approved — DP-41-005); restored through an accepted domain review',
                                      (SELECT string_agg(c.case_ref, ', ' ORDER BY c.case_ref) FROM governance.stewardship_cases c WHERE c.subject_kind = 'product' AND c.subject_id = p.product_id
                                          AND c.kind IN ('access', 'classification') AND c.state = 'approved')) END) ORDER BY p.product_key), '[]'::jsonb)
    INTO v_degrade
    FROM products.products_current p
   WHERE p.tenant_id = p_tenant AND p.domain_id = p_domain AND p.state = 'released'
     AND (NOT decision.is_active_human(p.owner_principal_id, p_tenant)
          OR EXISTS (SELECT 1 FROM governance.stewardship_cases c WHERE c.subject_kind = 'product' AND c.subject_id = p.product_id AND c.kind IN ('access', 'classification') AND c.state = 'approved'));
  PERFORM governance.ledger(p_tenant, p_domain, 'ownership_run', p_run, NULL, 'reconcile.ran', p_actor,
                            jsonb_build_object('trigger', CASE WHEN v_action = 'executive.attention.tick' THEN 'tick' ELSE 'steward' END, 'mode', v_mode, 'found', jsonb_array_length(v_found),
                                               'opened', jsonb_array_length(v_opened), 'reopened', jsonb_array_length(v_reopened), 'resolved', jsonb_array_length(v_resolved),
                                               'escalated', jsonb_array_length(v_escalated), 'degrade', v_degrade), p_correlation);
  RETURN jsonb_build_object('run_id', p_run, 'mode', v_mode, 'at', v_now, 'found', v_found, 'opened', v_opened, 'reopened', v_reopened, 'resolved', v_resolved, 'escalated', v_escalated,
                            'degrade', v_degrade,
                            'open', (SELECT count(*) FROM governance.ownership_gaps x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state IN ('open', 'escalated')));
END $$;
REVOKE ALL ON FUNCTION governance.dr_reconcile_domain(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dr_reconcile_domain(uuid, uuid, uuid, uuid, uuid) TO eye_commit;

/* The tick's cheap look (a read inside the tick's write): is the domain registered (a ratified registry entry), and is a reconciliation due? */
CREATE OR REPLACE FUNCTION governance.dr_reconcile_due(p_tenant uuid, p_domain uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('mode', governance.dr_domain_mode(p_domain), 'registered', governance.dr_domain_mode(p_domain) <> 'unregistered')
$$;
REVOKE ALL ON FUNCTION governance.dr_reconcile_due(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dr_reconcile_due(uuid, uuid) TO eye_commit;

/* ACCEPT A GAP (governance.ownership.gap.accept — DOMAIN; governance.ownership.platform_gap.accept — PLATFORM; human-gated): a named approver
   (DOMAIN: the domain or tenant administrator; PLATFORM: the product or operations authority) — never the one who opened it, never the owner
   of the subject — accepts the RESIDUAL until a date (≤ 90 days): the hold lifts, the gap stays LISTED as accepted, and the reconciliation
   re-opens it at that date if the condition still holds. */
CREATE OR REPLACE FUNCTION governance.dr_accept_gap(p_gap uuid, p_tenant uuid, p_domain uuid, p_until timestamptz, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, executive, public, pg_catalog, pg_temp AS $$
DECLARE g governance.ownership_gaps%ROWTYPE; v_owner uuid; v_lifted jsonb;
BEGIN
  SELECT * INTO g FROM governance.ownership_gaps x WHERE x.gap_id = p_gap FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'data authority rejected (unknown_gap): % is not an ownership gap', p_gap USING ERRCODE = '22023'; END IF;
  IF g.scope = 'PLATFORM' THEN
    PERFORM governance.assert_platform('governance.ownership.platform_gap.accept', p_actor, 'data authority');
    SELECT o.accountable_principal_id INTO v_owner FROM governance.component_ownerships o WHERE o.component_artifact = g.subject_id AND o.superseded_at IS NULL;
    PERFORM governance.assert_approver('data authority', p_actor, NULL, NULL, ARRAY['product_authority', 'operations_authority'], g.opened_by, CASE WHEN v_owner IS NULL THEN NULL ELSE ARRAY[v_owner] END, 'accepting an ownership gap');
  ELSE
    PERFORM governance.dr_domain_head(ARRAY['governance.ownership.gap.accept'], p_tenant, p_domain, p_actor, 'data authority');
    IF g.tenant_id IS DISTINCT FROM p_tenant OR g.domain_id IS DISTINCT FROM p_domain THEN RAISE EXCEPTION 'data authority rejected (unknown_gap): % is not an ownership gap of this domain', p_gap USING ERRCODE = '22023'; END IF;
    SELECT r.owner_principal_id INTO v_owner FROM governance.data_authorities r WHERE r.authority_id = g.subject_id AND r.state = 'ratified';
    PERFORM governance.assert_approver('data authority', p_actor, p_tenant, p_domain, ARRAY['domain_admin', 'tenant_admin'], g.opened_by, CASE WHEN v_owner IS NULL THEN NULL ELSE ARRAY[v_owner] END, 'accepting an ownership gap');
  END IF;
  IF g.state NOT IN ('open', 'escalated') THEN RAISE EXCEPTION 'data authority rejected (state): gap % is %', p_gap, g.state USING ERRCODE = '22023'; END IF;
  IF p_until IS NULL OR p_until <= clock_timestamp() OR p_until > clock_timestamp() + interval '90 days' THEN
    RAISE EXCEPTION 'data authority rejected (expiry): a residual is accepted until a date within 90 days' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 12 THEN RAISE EXCEPTION 'data authority rejected (reason): an acceptance states its reason and its compensating control (12+ characters)' USING ERRCODE = '22023'; END IF;
  UPDATE governance.ownership_gaps SET state = 'accepted', accepted_by = p_actor, accepted_at = clock_timestamp(), accepted_until = p_until, accept_reason = btrim(p_reason) WHERE gap_id = p_gap RETURNING * INTO g;
  v_lifted := governance.dr_lift_holds(g.subject_id, 'ownership_gap', g.gap_id, format('residual accepted until %s: %s', p_until, btrim(p_reason)), p_actor);
  IF g.domain_id IS NOT NULL THEN PERFORM executive.b33_close_items(g.tenant_id, g.domain_id, 'governance.ownership', NULL, g.subject_id, 'the ownership gap''s residual was accepted until ' || p_until, p_actor, p_correlation); END IF;
  PERFORM governance.ledger(g.tenant_id, g.domain_id, 'ownership_gap', g.gap_id, NULL, 'gap.accepted', p_actor, jsonb_build_object('until', p_until, 'reason', btrim(p_reason), 'lifted', v_lifted), p_correlation);
  RETURN to_jsonb(g) || jsonb_build_object('lifted', v_lifted);
END $$;
REVOKE ALL ON FUNCTION governance.dr_accept_gap(uuid, uuid, uuid, timestamptz, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dr_accept_gap(uuid, uuid, uuid, timestamptz, text, uuid, uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §DR.4 THE DATA CAPABILITY INVENTORY (PLATFORM; DP-01-001/-002/-005/-006)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE governance.data_capabilities (
  capability_id      uuid NOT NULL,
  version            int  NOT NULL CHECK (version >= 1),
  scope              text NOT NULL DEFAULT 'PLATFORM' CHECK (scope = 'PLATFORM'),
  dat_key            text NOT NULL CHECK (dat_key ~ '^DAT-[A-Z]{2}-[0-9]{2}$'),
  title              text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 200),
  capability_group   text NOT NULL CHECK (length(btrim(capability_group)) BETWEEN 2 AND 120),
  layer              text NOT NULL CHECK (length(btrim(layer)) BETWEEN 2 AND 120),
  authority_class    text NOT NULL CHECK (length(btrim(authority_class)) BETWEEN 2 AND 120),
  purpose            text,
  lifecycle          text NOT NULL CHECK (lifecycle IN ('planned', 'implemented', 'deprecated', 'retired')),
  deployment_scope   text NOT NULL CHECK (deployment_scope IN ('PLATFORM', 'TENANT', 'DOMAIN')),
  owner_principal_id uuid,
  owner_role         text REFERENCES identity.roles (code),
  owner_accepted_at  timestamptz,
  realization        jsonb NOT NULL CHECK (jsonb_typeof(realization) = 'object'),   -- {schemas[], relations[], functions[]}
  source             jsonb NOT NULL CHECK (jsonb_typeof(source) = 'object'),        -- {file, digest, row} — imported read-only
  observed           jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(observed) = 'object'),
  conformance        text NOT NULL DEFAULT 'unreconciled' CHECK (conformance IN ('unreconciled', 'conformant', 'drift', 'unresolved')),
  reconciled_at      timestamptz,
  admission          text NOT NULL DEFAULT 'not_admitted' CHECK (admission IN ('not_admitted', 'admitted')),
  admitted_by        uuid,
  admitted_at        timestamptz,
  admission_reason   text,
  digest             text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  declared_by        uuid NOT NULL,
  declared_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  superseded_at      timestamptz,
  correlation_id     uuid NOT NULL,
  PRIMARY KEY (capability_id, version),
  CONSTRAINT gdc_owner_pair CHECK ((owner_principal_id IS NULL) = (owner_role IS NULL)),
  CONSTRAINT gdc_admitted CHECK ((admission = 'admitted') = (admitted_by IS NOT NULL AND admitted_at IS NOT NULL AND admission_reason IS NOT NULL)),
  CONSTRAINT gdc_sod CHECK (admitted_by IS NULL OR (admitted_by <> declared_by AND admitted_by IS DISTINCT FROM owner_principal_id))
);
CREATE UNIQUE INDEX gdc_one_current ON governance.data_capabilities (capability_id) WHERE superseded_at IS NULL;
CREATE UNIQUE INDEX gdc_key_current ON governance.data_capabilities (dat_key) WHERE superseded_at IS NULL;
CREATE OR REPLACE FUNCTION governance.dr_capability_forward() RETURNS trigger LANGUAGE plpgsql SET search_path = governance, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'data authority rejected (state): a data capability version is never deleted' USING ERRCODE = '2F002'; END IF;
  IF OLD.superseded_at IS NOT NULL OR (to_jsonb(NEW) - ARRAY['owner_accepted_at', 'observed', 'conformance', 'reconciled_at', 'admission', 'admitted_by', 'admitted_at', 'admission_reason', 'superseded_at'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['owner_accepted_at', 'observed', 'conformance', 'reconciled_at', 'admission', 'admitted_by', 'admitted_at', 'admission_reason', 'superseded_at']) THEN
    RAISE EXCEPTION 'data authority rejected (state): data capability version %/% is immutable; a change is a new version', OLD.dat_key, OLD.version USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER gdc_forward BEFORE UPDATE OR DELETE ON governance.data_capabilities FOR EACH ROW EXECUTE FUNCTION governance.dr_capability_forward();

/* DECLARE (governance.ownership.capability.declare; the conformance steward): one DAT id's declaration — idempotent (the same body answers
   the current version unchanged: the importer re-runs safely); a changed body is a NEW version (expected = the current version), which is
   NOT admitted and not reconciled until it is reconciled and admitted again. The owner, when named, is an active PLATFORM human holding the
   owner role at PLATFORM. Registered in the §0 core (kind capability, attributes.class data_capability). */
CREATE OR REPLACE FUNCTION governance.dr_declare_capability(p_capability uuid, p_dat_key text, p_title text, p_group text, p_layer text, p_class text, p_purpose text, p_lifecycle text,
                                                            p_deployment_scope text, p_owner uuid, p_owner_role text, p_realization jsonb, p_source jsonb, p_expected int, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, identity, public, pg_catalog, pg_temp AS $$
DECLARE cur governance.data_capabilities%ROWTYPE; v_id uuid; v_body jsonb; v_digest text; c governance.data_capabilities%ROWTYPE; k text;
BEGIN
  PERFORM governance.assert_platform('governance.ownership.capability.declare', p_actor, 'data authority');
  IF NOT governance.holds_role(p_actor, NULL, NULL, ARRAY['conformance_steward']) THEN
    RAISE EXCEPTION 'data authority rejected (authority): the data capability inventory is declared by the conformance steward' USING ERRCODE = '42501';
  END IF;
  IF coalesce(p_dat_key, '') !~ '^DAT-[A-Z]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'data authority rejected (key): a data capability is a DAT id (DAT-XX-00)' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_title, ''))) NOT BETWEEN 2 AND 200 OR length(btrim(coalesce(p_group, ''))) NOT BETWEEN 2 AND 120 OR length(btrim(coalesce(p_layer, ''))) NOT BETWEEN 2 AND 120
     OR length(btrim(coalesce(p_class, ''))) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION 'data authority rejected (declaration): a data capability names its title, group, layer and authority class' USING ERRCODE = '22023';
  END IF;
  IF p_lifecycle IS NULL OR p_lifecycle NOT IN ('planned', 'implemented', 'deprecated', 'retired') THEN RAISE EXCEPTION 'data authority rejected (lifecycle): planned, implemented, deprecated or retired' USING ERRCODE = '22023'; END IF;
  IF p_deployment_scope IS NULL OR p_deployment_scope NOT IN ('PLATFORM', 'TENANT', 'DOMAIN') THEN RAISE EXCEPTION 'data authority rejected (scope): the deployment scope is PLATFORM, TENANT or DOMAIN' USING ERRCODE = '22023'; END IF;
  IF (p_owner IS NULL) <> (p_owner_role IS NULL) THEN RAISE EXCEPTION 'data authority rejected (owner): an owner is named with the role it owns under' USING ERRCODE = '22023'; END IF;
  IF p_owner IS NOT NULL AND (NOT governance.dr_platform_human(p_owner) OR NOT governance.holds_role(p_owner, NULL, NULL, ARRAY[p_owner_role])
                              OR NOT EXISTS (SELECT 1 FROM identity.role_bindings b WHERE b.principal_id = p_owner AND b.role_code = p_owner_role AND b.scope = 'PLATFORM' AND b.revoked_at IS NULL)) THEN
    RAISE EXCEPTION 'data authority rejected (unknown_owner): the owner is an active PLATFORM human holding % at PLATFORM', p_owner_role USING ERRCODE = '22023';
  END IF;
  IF p_realization IS NULL OR jsonb_typeof(p_realization) <> 'object' THEN RAISE EXCEPTION 'data authority rejected (realization): the realization is {schemas, relations, functions}' USING ERRCODE = '22023'; END IF;
  FOREACH k IN ARRAY ARRAY['schemas', 'relations', 'functions'] LOOP
    IF p_realization ? k AND (jsonb_typeof(p_realization -> k) <> 'array' OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_realization -> k) x WHERE jsonb_typeof(x) <> 'string' OR (x #>> '{}') !~ '^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$')) THEN
      RAISE EXCEPTION 'data authority rejected (realization): % is a list of database names (schema, schema.relation, schema.function)', k USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF p_source IS NULL OR jsonb_typeof(p_source) <> 'object' THEN RAISE EXCEPTION 'data authority rejected (source): the source names the file, its digest and the row it was read from' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('governance.capability:' || p_dat_key, 0));
  SELECT * INTO cur FROM governance.data_capabilities x WHERE x.dat_key = p_dat_key AND x.superseded_at IS NULL;
  v_id := coalesce(cur.capability_id, p_capability, gen_random_uuid());
  IF p_capability IS NOT NULL AND cur.capability_id IS NOT NULL AND p_capability <> cur.capability_id THEN
    RAISE EXCEPTION 'data authority rejected (duplicate): % is declared as capability %', p_dat_key, cur.capability_id USING ERRCODE = '23505';
  END IF;
  v_body := jsonb_build_object('dat_key', p_dat_key, 'title', btrim(p_title), 'group', btrim(p_group), 'layer', btrim(p_layer), 'authority_class', btrim(p_class), 'purpose', NULLIF(btrim(coalesce(p_purpose, '')), ''),
                               'lifecycle', p_lifecycle, 'deployment_scope', p_deployment_scope, 'owner', p_owner, 'owner_role', p_owner_role,
                               'realization', jsonb_build_object('schemas', coalesce(p_realization -> 'schemas', '[]'::jsonb), 'relations', coalesce(p_realization -> 'relations', '[]'::jsonb),
                                                                 'functions', coalesce(p_realization -> 'functions', '[]'::jsonb)));
  v_digest := governance.digest(v_body);
  IF cur.capability_id IS NOT NULL AND cur.digest = v_digest THEN
    RETURN (to_jsonb(cur) - 'scope' - 'correlation_id') || jsonb_build_object('unchanged', true);
  END IF;
  IF p_expected IS DISTINCT FROM coalesce(cur.version, 0) THEN
    RAISE EXCEPTION 'data authority rejected (stale): % is at version %, the declaration names %', p_dat_key, coalesce(cur.version, 0), coalesce(p_expected::text, 'none') USING ERRCODE = '22023';
  END IF;
  IF cur.capability_id IS NOT NULL THEN UPDATE governance.data_capabilities SET superseded_at = clock_timestamp() WHERE capability_id = cur.capability_id AND version = cur.version; END IF;
  INSERT INTO governance.data_capabilities (capability_id, version, dat_key, title, capability_group, layer, authority_class, purpose, lifecycle, deployment_scope, owner_principal_id, owner_role,
                                            realization, source, digest, declared_by, correlation_id)
  VALUES (v_id, coalesce(cur.version, 0) + 1, p_dat_key, btrim(p_title), btrim(p_group), btrim(p_layer), btrim(p_class), NULLIF(btrim(coalesce(p_purpose, '')), ''), p_lifecycle, p_deployment_scope,
          p_owner, p_owner_role, v_body -> 'realization', p_source, v_digest, p_actor, p_correlation) RETURNING * INTO c;
  PERFORM governance.dr_register(v_id, 'PLATFORM', NULL, NULL, 'capability', p_dat_key, btrim(p_title), p_owner, p_owner_role, btrim(p_class),
                                 CASE p_lifecycle WHEN 'planned' THEN 'proposed' WHEN 'implemented' THEN 'active' ELSE p_lifecycle END,
                                 jsonb_build_object('class', 'data_capability', 'group', btrim(p_group), 'layer', btrim(p_layer), 'deployment_scope', p_deployment_scope, 'capability_version', c.version),
                                 v_digest, p_actor, p_correlation);
  PERFORM governance.ledger(NULL, NULL, 'data_capability', v_id, c.version, 'capability.declared', p_actor, jsonb_build_object('dat_key', p_dat_key, 'digest', v_digest, 'source', p_source), p_correlation);
  RETURN (to_jsonb(c) - 'scope' - 'correlation_id') || jsonb_build_object('unchanged', false);
END $$;
REVOKE ALL ON FUNCTION governance.dr_declare_capability(uuid, text, text, text, text, text, text, text, text, uuid, text, jsonb, jsonb, int, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dr_declare_capability(uuid, text, text, text, text, text, text, text, text, uuid, text, jsonb, jsonb, int, uuid, uuid) TO eye_commit;

/* What the database OBSERVES of a realization (internal): each declared schema, relation and function present or missing. */
CREATE OR REPLACE FUNCTION governance.dr_observe_realization(p_realization jsonb) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'schemas', coalesce((SELECT jsonb_agg(jsonb_build_object('name', s, 'present', EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname = s)) ORDER BY s)
                           FROM jsonb_array_elements_text(coalesce(p_realization -> 'schemas', '[]'::jsonb)) s), '[]'::jsonb),
    'relations', coalesce((SELECT jsonb_agg(jsonb_build_object('name', r, 'present', to_regclass(r) IS NOT NULL) ORDER BY r)
                             FROM jsonb_array_elements_text(coalesce(p_realization -> 'relations', '[]'::jsonb)) r), '[]'::jsonb),
    'functions', coalesce((SELECT jsonb_agg(jsonb_build_object('name', f, 'present', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                                                                                          WHERE n.nspname = split_part(f, '.', 1) AND p.proname = split_part(f, '.', 2))) ORDER BY f)
                             FROM jsonb_array_elements_text(coalesce(p_realization -> 'functions', '[]'::jsonb)) f), '[]'::jsonb))
$$;
REVOKE ALL ON FUNCTION governance.dr_observe_realization(jsonb) FROM PUBLIC;

/* RECONCILE (governance.ownership.capability.reconcile; the conformance steward): the declaration against the OBSERVED database and the
   owner against the principals: conformant | drift (a declared object is missing, or nothing realizes an implemented capability) |
   unresolved (no owner, the owner lost or no longer holding the role). Unresolved opens a PLATFORM gap and holds the capability
   (ownership_gap); drift holds it (conformance_drift); a cleared condition resolves / lifts. The state found is recorded. */
CREATE OR REPLACE FUNCTION governance.dr_reconcile_capability(p_capability uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, identity, public, pg_catalog, pg_temp AS $$
DECLARE c governance.data_capabilities%ROWTYPE; v_obs jsonb; v_missing jsonb; v_owner text; v_conf text; v_gap jsonb; g governance.ownership_gaps%ROWTYPE; v_empty boolean;
BEGIN
  PERFORM governance.assert_platform('governance.ownership.capability.reconcile', p_actor, 'data authority');
  IF NOT governance.holds_role(p_actor, NULL, NULL, ARRAY['conformance_steward']) THEN
    RAISE EXCEPTION 'data authority rejected (authority): the data capability inventory is reconciled by the conformance steward' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO c FROM governance.data_capabilities x WHERE x.capability_id = p_capability AND x.superseded_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'data authority rejected (unknown_capability): % is not a declared data capability', p_capability USING ERRCODE = '22023'; END IF;
  v_obs := governance.dr_observe_realization(c.realization);
  SELECT coalesce(jsonb_agg(x ->> 'name'), '[]'::jsonb) INTO v_missing FROM (SELECT jsonb_array_elements(v_obs -> 'schemas') x UNION ALL SELECT jsonb_array_elements(v_obs -> 'relations')
                                                                             UNION ALL SELECT jsonb_array_elements(v_obs -> 'functions')) q WHERE NOT (x ->> 'present')::boolean;
  v_empty := jsonb_array_length(v_obs -> 'schemas') + jsonb_array_length(v_obs -> 'relations') + jsonb_array_length(v_obs -> 'functions') = 0;
  v_owner := CASE WHEN c.owner_principal_id IS NULL THEN 'none'
                  WHEN NOT governance.dr_platform_human(c.owner_principal_id) THEN 'lost'
                  WHEN NOT EXISTS (SELECT 1 FROM identity.role_bindings b WHERE b.principal_id = c.owner_principal_id AND b.role_code = c.owner_role AND b.scope = 'PLATFORM' AND b.revoked_at IS NULL) THEN 'lost'
                  ELSE 'resolved' END;
  v_conf := CASE WHEN v_owner <> 'resolved' THEN 'unresolved' WHEN jsonb_array_length(v_missing) > 0 OR (v_empty AND c.lifecycle = 'implemented') THEN 'drift' ELSE 'conformant' END;
  UPDATE governance.data_capabilities SET observed = jsonb_build_object('realization', v_obs, 'missing', v_missing, 'owner', v_owner, 'nothing_realizes', v_empty), conformance = v_conf, reconciled_at = clock_timestamp()
   WHERE capability_id = c.capability_id AND version = c.version RETURNING * INTO c;
  -- the ownership gap (PLATFORM) and its hold
  IF v_owner <> 'resolved' THEN
    v_gap := governance.dr_open_gap(NULL, NULL, 'data_capability', c.capability_id, c.dat_key || ' ' || c.title, CASE v_owner WHEN 'none' THEN 'no_owner' ELSE 'owner_lost' END,
                                    jsonb_build_object('reason', CASE v_owner WHEN 'none' THEN 'no accountable owner is declared' ELSE 'the declared owner is no longer an active PLATFORM human holding ' || c.owner_role END,
                                                       'owner', c.owner_principal_id, 'owner_role', c.owner_role, 'version', c.version),
                                    'the conformance steward, then the product authority', true, NULL, 'C2', p_actor, p_correlation);
  END IF;
  FOR g IN SELECT * FROM governance.ownership_gaps x WHERE x.subject_id = c.capability_id AND x.state <> 'resolved'
             AND (v_owner = 'resolved' OR x.gap_kind <> CASE v_owner WHEN 'none' THEN 'no_owner' ELSE 'owner_lost' END) LOOP
    PERFORM governance.dr_resolve_gap(g.gap_id, format('the reconciliation finds the owner %s', v_owner), p_actor, p_correlation);
  END LOOP;
  IF v_conf = 'drift' THEN
    PERFORM governance.dr_open_hold(NULL, NULL, c.capability_id, 'conformance_drift', c.capability_id,
              format('%s drifts from its declaration: %s', c.dat_key, CASE WHEN v_empty THEN 'nothing realizes an implemented capability' ELSE 'missing ' || (v_missing #>> '{}') END), p_actor, p_correlation);
  ELSE
    PERFORM governance.dr_lift_holds(c.capability_id, 'conformance_drift', c.capability_id, 'the declaration is observed again', p_actor);
  END IF;
  PERFORM governance.ledger(NULL, NULL, 'data_capability', c.capability_id, c.version, 'capability.reconciled', p_actor, jsonb_build_object('conformance', v_conf, 'missing', v_missing, 'owner', v_owner), p_correlation);
  RETURN (to_jsonb(c) - 'scope' - 'correlation_id') || jsonb_build_object('holds', governance.dr_consumption_holds(c.capability_id),
          'drift_holds', (SELECT count(*) FROM governance.holds h WHERE h.subject_artifact = c.capability_id AND h.lifted_at IS NULL AND h.reason_kind = 'conformance_drift'));
END $$;
REVOKE ALL ON FUNCTION governance.dr_reconcile_capability(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dr_reconcile_capability(uuid, uuid, uuid) TO eye_commit;

/* ACCEPT (governance.ownership.capability.accept): the NAMED OWNER accepts ownership of the current version, on its digest. */
CREATE OR REPLACE FUNCTION governance.dr_accept_capability(p_capability uuid, p_version int, p_digest text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, onboarding, public, pg_catalog, pg_temp AS $$
DECLARE c governance.data_capabilities%ROWTYPE;
BEGIN
  PERFORM governance.assert_platform('governance.ownership.capability.accept', p_actor, 'data authority');
  SELECT * INTO c FROM governance.data_capabilities x WHERE x.capability_id = p_capability AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'data authority rejected (unknown_capability): no version % of %', p_version, p_capability USING ERRCODE = '22023'; END IF;
  IF onboarding.principal_kind(p_actor) IS DISTINCT FROM 'human' THEN RAISE EXCEPTION 'data authority rejected (actor): ownership is accepted by a named human' USING ERRCODE = '42501'; END IF;
  IF c.owner_principal_id IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'data authority rejected (ownership): ownership of % is accepted by its named owner only', c.dat_key USING ERRCODE = '42501'; END IF;
  IF c.superseded_at IS NOT NULL THEN RAISE EXCEPTION 'data authority rejected (stale): version % of % is superseded', p_version, c.dat_key USING ERRCODE = '22023'; END IF;
  IF p_digest IS DISTINCT FROM c.digest THEN RAISE EXCEPTION 'data authority rejected (stale): the digest accepted is not version %''s', p_version USING ERRCODE = '22023'; END IF;
  IF c.owner_accepted_at IS NOT NULL THEN RAISE EXCEPTION 'data authority rejected (duplicate): ownership was accepted at %', c.owner_accepted_at USING ERRCODE = '22023'; END IF;
  UPDATE governance.data_capabilities SET owner_accepted_at = clock_timestamp() WHERE capability_id = p_capability AND version = p_version RETURNING * INTO c;
  PERFORM governance.ledger(NULL, NULL, 'data_capability', c.capability_id, c.version, 'capability.owner_accepted', p_actor, jsonb_build_object('digest', c.digest), p_correlation);
  RETURN to_jsonb(c) - 'scope' - 'correlation_id';
END $$;
REVOKE ALL ON FUNCTION governance.dr_accept_capability(uuid, int, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dr_accept_capability(uuid, int, text, uuid, uuid) TO eye_commit;

/* ADMIT (governance.ownership.capability.admit; human-gated): the product or operations authority — never the declarer, never the owner —
   admits the CURRENT version into the governed inventory on its digest, only when it is conformant as reconciled AFTER its declaration, its
   owner accepted, and no hold stands on it; otherwise refused (held), the disputed state preserved and the gap routed (DP-01-005). This is
   the inventory's admission — PRODUCTION admission is R1 and never claimed here. */
CREATE OR REPLACE FUNCTION governance.dr_admit_capability(p_capability uuid, p_version int, p_digest text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE c governance.data_capabilities%ROWTYPE; v_holds jsonb; v_blocking text[] := '{}';
BEGIN
  PERFORM governance.assert_platform('governance.ownership.capability.admit', p_actor, 'data authority');
  SELECT * INTO c FROM governance.data_capabilities x WHERE x.capability_id = p_capability AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'data authority rejected (unknown_capability): no version % of %', p_version, p_capability USING ERRCODE = '22023'; END IF;
  PERFORM governance.assert_approver('data authority', p_actor, NULL, NULL, ARRAY['product_authority', 'operations_authority'], c.declared_by,
                                     CASE WHEN c.owner_principal_id IS NULL THEN NULL ELSE ARRAY[c.owner_principal_id] END, 'admitting a data capability');
  IF c.superseded_at IS NOT NULL OR p_digest IS DISTINCT FROM c.digest THEN RAISE EXCEPTION 'data authority rejected (stale): admission names the current version and its digest' USING ERRCODE = '22023'; END IF;
  IF c.admission = 'admitted' THEN RAISE EXCEPTION 'data authority rejected (duplicate): % v% was admitted at %', c.dat_key, c.version, c.admitted_at USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'data authority rejected (reason): an admission states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('hold_id', h.hold_id, 'reason_kind', h.reason_kind, 'reason', h.reason)), '[]'::jsonb) INTO v_holds
    FROM governance.holds h WHERE h.subject_artifact = c.capability_id AND h.lifted_at IS NULL;
  IF c.conformance <> 'conformant' OR c.reconciled_at IS NULL OR c.reconciled_at < c.declared_at THEN v_blocking := v_blocking || format('the declaration is %s as last reconciled', c.conformance); END IF;
  IF c.owner_accepted_at IS NULL THEN v_blocking := v_blocking || 'the owner has not accepted ownership'::text; END IF;
  IF jsonb_array_length(v_holds) > 0 THEN v_blocking := v_blocking || format('%s open hold(s)', jsonb_array_length(v_holds)); END IF;
  IF cardinality(v_blocking) > 0 THEN
    RAISE EXCEPTION 'data authority rejected (held): % is not admitted — %; the disputed state is preserved and routed to governance (DP-01-005)', c.dat_key, array_to_string(v_blocking, '; ') USING ERRCODE = '22023';
  END IF;
  UPDATE governance.data_capabilities SET admission = 'admitted', admitted_by = p_actor, admitted_at = clock_timestamp(), admission_reason = btrim(p_reason)
   WHERE capability_id = c.capability_id AND version = c.version RETURNING * INTO c;
  PERFORM governance.ledger(NULL, NULL, 'data_capability', c.capability_id, c.version, 'capability.admitted', p_actor, jsonb_build_object('digest', c.digest, 'reason', btrim(p_reason),
                            'production_admission', 'R1 — external; never claimed by this record'), p_correlation);
  RETURN (to_jsonb(c) - 'scope' - 'correlation_id') || jsonb_build_object('production_admission', 'R1 — external; never claimed by this record');
END $$;
REVOKE ALL ON FUNCTION governance.dr_admit_capability(uuid, int, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dr_admit_capability(uuid, int, text, text, uuid, uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §DR.5 COMPONENT OWNERSHIP AND THE RATIFIED TRANSFER (PLATFORM; ES-04-001/-002, ES-11-001/-002/-005, PER-19)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/* THE OWNERSHIP RECORD of a logical component or deployable unit (a §0 artifact of kind component | deployable_unit — §RG / §CM register
   them; this part reads them by kind, never their tables): versioned, ONE current per component; every version is made by a RATIFIED
   TRANSFER (the first assignment is a transfer from nobody). */
CREATE TABLE governance.component_ownerships (
  ownership_id            uuid NOT NULL,
  version                 int  NOT NULL CHECK (version >= 1),
  scope                   text NOT NULL DEFAULT 'PLATFORM' CHECK (scope = 'PLATFORM'),
  component_artifact      uuid NOT NULL,
  component_key           text NOT NULL,
  component_kind          text NOT NULL CHECK (component_kind IN ('component', 'deployable_unit')),
  owning_team             text NOT NULL CHECK (length(btrim(owning_team)) BETWEEN 2 AND 120),   -- exactly ONE accountable owning team (ES-04-001)
  accountable_principal_id uuid NOT NULL,
  primary_contact         uuid NOT NULL,
  secondary_contact       uuid NOT NULL,
  operator_role           text NOT NULL REFERENCES identity.roles (code),                    -- PER-19: operates; content only under an approved support purpose
  owned_contracts         text[] NOT NULL CHECK (cardinality(owned_contracts) >= 1),         -- ES-11-002: the contracts its owned behaviour exposes
  state_stores            text[] NOT NULL DEFAULT '{}',
  policy_decisions        text[] NOT NULL DEFAULT '{}',
  telemetry_namespace     text NOT NULL CHECK (length(btrim(telemetry_namespace)) BETWEEN 2 AND 120),
  failure_domain          text NOT NULL CHECK (length(btrim(failure_domain)) BETWEEN 2 AND 120),
  deployable_units        text[] NOT NULL CHECK (cardinality(deployable_units) >= 1),
  transfer_id             uuid NOT NULL,
  signature_id            uuid NOT NULL,
  digest                  text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  ratified_by             uuid NOT NULL,
  ratified_at             timestamptz NOT NULL DEFAULT clock_timestamp(),
  superseded_at           timestamptz,
  correlation_id          uuid NOT NULL,
  PRIMARY KEY (ownership_id, version),
  CONSTRAINT gco_contacts CHECK (primary_contact <> secondary_contact)
);
CREATE UNIQUE INDEX gco_one_current ON governance.component_ownerships (ownership_id) WHERE superseded_at IS NULL;
CREATE UNIQUE INDEX gco_component_current ON governance.component_ownerships (component_artifact) WHERE superseded_at IS NULL;
CREATE OR REPLACE FUNCTION governance.dr_ownership_forward() RETURNS trigger LANGUAGE plpgsql SET search_path = governance, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.superseded_at IS NOT NULL OR (to_jsonb(NEW) - 'superseded_at') IS DISTINCT FROM (to_jsonb(OLD) - 'superseded_at') THEN
    RAISE EXCEPTION 'ownership record rejected (state): an ownership version is immutable; only its supersession is set, once' USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER gco_forward BEFORE UPDATE OR DELETE ON governance.component_ownerships FOR EACH ROW EXECUTE FUNCTION governance.dr_ownership_forward();

/* THE TRANSFER (ES-11-005): the proposed ownership, the nine-item checklist (each with a reference), the open exceptions on the component
   (read from the §0 links `excepts`, snapshotted), the digest; proposed → accepted (the RECEIVING accountable owner) → ratified (signed) |
   rejected | withdrawn. */
CREATE TABLE governance.component_transfers (
  transfer_id        uuid PRIMARY KEY,
  scope              text NOT NULL DEFAULT 'PLATFORM' CHECK (scope = 'PLATFORM'),
  ownership_id       uuid NOT NULL,
  component_artifact uuid NOT NULL,
  component_key      text NOT NULL,
  from_version       int,
  from_accountable   uuid,
  proposal           jsonb NOT NULL CHECK (jsonb_typeof(proposal) = 'object'),
  checklist          jsonb NOT NULL CHECK (jsonb_typeof(checklist) = 'object'),
  open_exceptions    jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(open_exceptions) = 'array'),
  digest             text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  state              text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'accepted', 'ratified', 'rejected', 'withdrawn')),
  proposed_by        uuid NOT NULL,
  proposed_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  accepted_by        uuid,
  accepted_at        timestamptz,
  decided_by         uuid,
  decided_at         timestamptz,
  decision_reason    text,
  signature_id       uuid,
  correlation_id     uuid NOT NULL,
  CONSTRAINT gct_accepted CHECK (state NOT IN ('accepted', 'ratified') OR (accepted_by IS NOT NULL AND accepted_at IS NOT NULL)),
  CONSTRAINT gct_decided CHECK (state NOT IN ('ratified', 'rejected', 'withdrawn') OR (decided_by IS NOT NULL AND decided_at IS NOT NULL AND decision_reason IS NOT NULL)),
  CONSTRAINT gct_signed CHECK (state <> 'ratified' OR signature_id IS NOT NULL),
  CONSTRAINT gct_sod CHECK (decided_by IS NULL OR state = 'withdrawn' OR (decided_by <> proposed_by AND decided_by IS DISTINCT FROM accepted_by AND decided_by IS DISTINCT FROM from_accountable))
);
CREATE UNIQUE INDEX gct_one_live ON governance.component_transfers (component_artifact) WHERE state IN ('proposed', 'accepted');
CREATE OR REPLACE FUNCTION governance.dr_transfer_forward() RETURNS trigger LANGUAGE plpgsql SET search_path = governance, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.state IN ('ratified', 'rejected', 'withdrawn')
     OR (to_jsonb(NEW) - ARRAY['state', 'accepted_by', 'accepted_at', 'decided_by', 'decided_at', 'decision_reason', 'signature_id'])
        IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['state', 'accepted_by', 'accepted_at', 'decided_by', 'decided_at', 'decision_reason', 'signature_id']) THEN
    RAISE EXCEPTION 'ownership record rejected (state): transfer % is % — its proposal is immutable', OLD.transfer_id, OLD.state USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER gct_forward BEFORE UPDATE OR DELETE ON governance.component_transfers FOR EACH ROW EXECUTE FUNCTION governance.dr_transfer_forward();

/* A text[] from a jsonb array of strings (NULL when the value is not one): trimmed, distinct, sorted. */
CREATE OR REPLACE FUNCTION governance.dr_texts(p jsonb) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p IS NULL OR jsonb_typeof(p) = 'null' THEN '{}'::text[]
              WHEN jsonb_typeof(p) <> 'array' OR EXISTS (SELECT 1 FROM jsonb_array_elements(p) x WHERE jsonb_typeof(x) <> 'string' OR length(btrim(x #>> '{}')) = 0) THEN NULL
              ELSE (SELECT coalesce(array_agg(DISTINCT btrim(x) ORDER BY btrim(x)), '{}') FROM jsonb_array_elements_text(p) x) END
$$;

/* PROPOSE A TRANSFER (governance.ownership.component.propose): the conformance steward, a product or operations authority, or the CURRENT
   accountable owner proposes who owns a component next. Checked: the component (a current §0 artifact of kind component | deployable_unit);
   the expected version; one live transfer per component; the team, the accountable owner and two DIFFERENT contacts (active PLATFORM
   humans); the operator role; the owned contracts (1+; ONE owner per contract — ES-11-002); DISTINGUISHABILITY where a deployable unit is
   shared (ES-04-002: no shared state store, contract or policy decision; its own telemetry namespace and failure domain); the CHECKLIST — all
   nine items, each with a reference (ES-11-005); the component's open exceptions snapshotted from the §0 links. */
CREATE OR REPLACE FUNCTION governance.dr_propose_transfer(p_transfer uuid, p_component uuid, p_expected int, p_proposal jsonb, p_checklist jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, identity, public, pg_catalog, pg_temp AS $$
DECLARE art governance.artifacts%ROWTYPE; cur governance.component_ownerships%ROWTYPE; o record; v_contracts text[]; v_stores text[]; v_policies text[]; v_units text[];
        v_acc uuid; v_primary uuid; v_secondary uuid; v_missing text[]; v_bad text[]; v_exc jsonb; v_prop jsonb; t governance.component_transfers%ROWTYPE; v_overlap text;
BEGIN
  PERFORM governance.assert_platform('governance.ownership.component.propose', p_actor, 'ownership record');
  SELECT * INTO art FROM governance.artifacts a WHERE a.artifact_id = p_component AND a.superseded_at IS NULL AND a.scope = 'PLATFORM';
  IF NOT FOUND OR art.kind NOT IN ('component', 'deployable_unit') THEN
    RAISE EXCEPTION 'ownership record rejected (unknown_component): % is not a current component or deployable unit of the registry', p_component USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('governance.component:' || p_component::text, 0));
  SELECT * INTO cur FROM governance.component_ownerships x WHERE x.component_artifact = p_component AND x.superseded_at IS NULL;
  IF NOT governance.holds_role(p_actor, NULL, NULL, ARRAY['conformance_steward', 'product_authority', 'operations_authority']) AND cur.accountable_principal_id IS DISTINCT FROM p_actor THEN
    RAISE EXCEPTION 'ownership record rejected (authority): a transfer is proposed by the conformance steward, a product or operations authority, or the current accountable owner' USING ERRCODE = '42501';
  END IF;
  IF p_expected IS DISTINCT FROM coalesce(cur.version, 0) THEN RAISE EXCEPTION 'ownership record rejected (stale): % is at ownership version %, the transfer names %', art.external_key, coalesce(cur.version, 0), coalesce(p_expected::text, 'none') USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM governance.component_transfers x WHERE x.component_artifact = p_component AND x.state IN ('proposed', 'accepted')) THEN
    RAISE EXCEPTION 'ownership record rejected (state): a transfer of % is already in flight', art.external_key USING ERRCODE = '22023';
  END IF;
  IF p_proposal IS NULL OR jsonb_typeof(p_proposal) <> 'object' THEN RAISE EXCEPTION 'ownership record rejected (proposal): the proposal is an object' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_proposal ->> 'owningTeam', ''))) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'ownership record rejected (team): exactly one accountable owning team is named (ES-04-001)' USING ERRCODE = '22023'; END IF;
  BEGIN v_acc := (p_proposal ->> 'accountable')::uuid; v_primary := (p_proposal ->> 'primaryContact')::uuid; v_secondary := (p_proposal ->> 'secondaryContact')::uuid;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'ownership record rejected (contacts): the accountable owner and the contacts are principal ids' USING ERRCODE = '22023'; END;
  IF v_acc IS NULL OR NOT governance.dr_platform_human(v_acc) THEN RAISE EXCEPTION 'ownership record rejected (unknown_owner): the accountable owner is an active PLATFORM human' USING ERRCODE = '22023'; END IF;
  IF v_primary IS NULL OR v_secondary IS NULL OR NOT governance.dr_platform_human(v_primary) OR NOT governance.dr_platform_human(v_secondary) THEN
    RAISE EXCEPTION 'ownership record rejected (contacts): the primary and secondary operational contacts are active PLATFORM humans (ES-11-001)' USING ERRCODE = '22023';
  END IF;
  IF v_primary = v_secondary THEN RAISE EXCEPTION 'ownership record rejected (contacts): the primary and the secondary contact are two different people (ES-11-001)' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.roles r WHERE r.code = coalesce(p_proposal ->> 'operatorRole', 'operations_authority')) THEN RAISE EXCEPTION 'ownership record rejected (role): the operator role names no role' USING ERRCODE = '22023'; END IF;
  v_contracts := governance.dr_texts(p_proposal -> 'ownedContracts'); v_stores := governance.dr_texts(p_proposal -> 'stateStores');
  v_policies := governance.dr_texts(p_proposal -> 'policyDecisions'); v_units := governance.dr_texts(p_proposal -> 'deployableUnits');
  IF v_contracts IS NULL OR cardinality(v_contracts) = 0 THEN RAISE EXCEPTION 'ownership record rejected (contracts): the owned contracts are listed (1+) — a service exposes only contracts its owned behaviour requires (ES-11-002)' USING ERRCODE = '22023'; END IF;
  IF v_stores IS NULL OR v_policies IS NULL OR v_units IS NULL OR cardinality(v_units) = 0 THEN
    RAISE EXCEPTION 'ownership record rejected (proposal): stateStores and policyDecisions are lists, deployableUnits a list of 1+' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_proposal ->> 'telemetryNamespace', ''))) NOT BETWEEN 2 AND 120 OR length(btrim(coalesce(p_proposal ->> 'failureDomain', ''))) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION 'ownership record rejected (proposal): the telemetry namespace and the failure domain are named' USING ERRCODE = '22023';
  END IF;
  -- one owner per contract (ES-11-002)
  SELECT string_agg(format('%s (owned by %s)', c, o2.component_key), ', ') INTO v_overlap
    FROM governance.component_ownerships o2, unnest(o2.owned_contracts) c
   WHERE o2.superseded_at IS NULL AND o2.component_artifact <> p_component AND c = ANY (v_contracts);
  IF v_overlap IS NOT NULL THEN RAISE EXCEPTION 'ownership record rejected (duplicate): a contract has one owner — %', v_overlap USING ERRCODE = '23505'; END IF;
  -- distinguishability where a deployable unit is shared (ES-04-002)
  FOR o IN SELECT * FROM governance.component_ownerships o2 WHERE o2.superseded_at IS NULL AND o2.component_artifact <> p_component AND o2.deployable_units && v_units LOOP
    v_bad := '{}';
    IF o.state_stores && v_stores THEN v_bad := v_bad || ('state stores ' || array_to_string(ARRAY(SELECT unnest(o.state_stores) INTERSECT SELECT unnest(v_stores)), ', ')); END IF;
    IF o.policy_decisions && v_policies THEN v_bad := v_bad || ('policy decisions ' || array_to_string(ARRAY(SELECT unnest(o.policy_decisions) INTERSECT SELECT unnest(v_policies)), ', ')); END IF;
    IF o.telemetry_namespace = btrim(p_proposal ->> 'telemetryNamespace') THEN v_bad := v_bad || ('the telemetry namespace ' || o.telemetry_namespace); END IF;
    IF o.failure_domain = btrim(p_proposal ->> 'failureDomain') THEN v_bad := v_bad || ('the failure domain ' || o.failure_domain); END IF;
    IF cardinality(v_bad) > 0 THEN
      RAISE EXCEPTION 'ownership record rejected (distinguishability): % shares deployable unit(s) % with %, so state, contracts, policy decisions, telemetry and failure isolation stay distinguishable — shared: %',
        art.external_key, array_to_string(ARRAY(SELECT unnest(o.deployable_units) INTERSECT SELECT unnest(v_units)), ', '), o.component_key, array_to_string(v_bad, '; ') USING ERRCODE = '22023';
    END IF;
  END LOOP;
  -- the checklist (ES-11-005)
  IF p_checklist IS NULL OR jsonb_typeof(p_checklist) <> 'object' THEN RAISE EXCEPTION 'ownership record rejected (checklist): the checklist is an object of the nine items' USING ERRCODE = '22023'; END IF;
  SELECT coalesce(array_agg(i ORDER BY i), '{}') INTO v_missing FROM unnest(governance.dr_transfer_items()) i
   WHERE jsonb_typeof(p_checklist -> i) <> 'object' OR length(btrim(coalesce(p_checklist -> i ->> 'ref', ''))) < 4;
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'ownership record rejected (checklist): a transfer includes code, state, contracts, dashboards, alerts, runbooks, risks, exceptions and unresolved incidents, each with a reference — missing: %', array_to_string(v_missing, ', ') USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_checklist) k WHERE NOT (k = ANY (governance.dr_transfer_items()))) THEN
    RAISE EXCEPTION 'ownership record rejected (checklist): the checklist holds the nine items only' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('exception', l.from_artifact, 'key', a.external_key, 'title', a.title, 'lifecycle', a.lifecycle) ORDER BY a.external_key), '[]'::jsonb) INTO v_exc
    FROM governance.links_live l LEFT JOIN governance.artifacts a ON a.artifact_id = l.from_artifact AND a.superseded_at IS NULL
   WHERE l.to_artifact = p_component AND l.relation = 'excepts';
  v_prop := jsonb_build_object('owning_team', btrim(p_proposal ->> 'owningTeam'), 'accountable', v_acc, 'primary_contact', v_primary, 'secondary_contact', v_secondary,
                               'operator_role', coalesce(p_proposal ->> 'operatorRole', 'operations_authority'), 'owned_contracts', to_jsonb(v_contracts), 'state_stores', to_jsonb(v_stores),
                               'policy_decisions', to_jsonb(v_policies), 'telemetry_namespace', btrim(p_proposal ->> 'telemetryNamespace'), 'failure_domain', btrim(p_proposal ->> 'failureDomain'),
                               'deployable_units', to_jsonb(v_units));
  INSERT INTO governance.component_transfers (transfer_id, ownership_id, component_artifact, component_key, from_version, from_accountable, proposal, checklist, open_exceptions, digest, proposed_by, correlation_id)
  VALUES (p_transfer, coalesce(cur.ownership_id, gen_random_uuid()), p_component, art.external_key, cur.version, cur.accountable_principal_id, v_prop, p_checklist, v_exc,
          governance.digest(jsonb_build_object('transfer_id', p_transfer, 'component', p_component, 'from_version', cur.version, 'proposal', v_prop, 'checklist', p_checklist, 'open_exceptions', v_exc)),
          p_actor, p_correlation) RETURNING * INTO t;
  PERFORM governance.ledger(NULL, NULL, 'component_transfer', p_transfer, NULL, 'transfer.proposed', p_actor,
                            jsonb_build_object('component', p_component, 'component_key', art.external_key, 'from_version', cur.version, 'to', v_acc, 'digest', t.digest), p_correlation);
  RETURN to_jsonb(t) - 'scope' - 'correlation_id';
END $$;
REVOKE ALL ON FUNCTION governance.dr_propose_transfer(uuid, uuid, int, jsonb, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dr_propose_transfer(uuid, uuid, int, jsonb, jsonb, uuid, uuid) TO eye_commit;

/* ACCEPT (governance.ownership.component.accept): the RECEIVING accountable owner accepts what is handed over, on the digest. */
CREATE OR REPLACE FUNCTION governance.dr_accept_transfer(p_transfer uuid, p_digest text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, onboarding, public, pg_catalog, pg_temp AS $$
DECLARE t governance.component_transfers%ROWTYPE;
BEGIN
  PERFORM governance.assert_platform('governance.ownership.component.accept', p_actor, 'ownership record');
  SELECT * INTO t FROM governance.component_transfers x WHERE x.transfer_id = p_transfer FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ownership record rejected (unknown_transfer): % is not a transfer', p_transfer USING ERRCODE = '22023'; END IF;
  IF onboarding.principal_kind(p_actor) IS DISTINCT FROM 'human' THEN RAISE EXCEPTION 'ownership record rejected (actor): ownership is accepted by a named human' USING ERRCODE = '42501'; END IF;
  IF (t.proposal ->> 'accountable')::uuid IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'ownership record rejected (ownership): the transfer of % is accepted by its receiving accountable owner only', t.component_key USING ERRCODE = '42501'; END IF;
  IF t.state <> 'proposed' THEN RAISE EXCEPTION 'ownership record rejected (state): transfer % is %', p_transfer, t.state USING ERRCODE = '22023'; END IF;
  IF p_digest IS DISTINCT FROM t.digest THEN RAISE EXCEPTION 'ownership record rejected (stale): the digest accepted is not the transfer''s' USING ERRCODE = '22023'; END IF;
  UPDATE governance.component_transfers SET state = 'accepted', accepted_by = p_actor, accepted_at = clock_timestamp() WHERE transfer_id = p_transfer RETURNING * INTO t;
  PERFORM governance.ledger(NULL, NULL, 'component_transfer', p_transfer, NULL, 'transfer.accepted', p_actor, jsonb_build_object('digest', t.digest), p_correlation);
  RETURN to_jsonb(t) - 'scope' - 'correlation_id';
END $$;
REVOKE ALL ON FUNCTION governance.dr_accept_transfer(uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dr_accept_transfer(uuid, text, uuid, uuid) TO eye_commit;

/* RECORD A PLATFORM SIGNATURE (internal to this part's signing ports — the §0 sibling of executive.record_signature): the acting principal's
   Ed25519 signature by key reference over a subject digest, kind ownership_transfer only here; one per signer per subject version. The
   caller's bound action is asserted; the signer's PLATFORM role recorded. */
CREATE OR REPLACE FUNCTION governance.dr_record_platform_signature(p_signature uuid, p_action text, p_kind text, p_subject uuid, p_version int, p_digest text, p_key_id text, p_signature_text text,
                                                                   p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, identity, public, pg_catalog, pg_temp AS $$
DECLARE v_role text;
BEGIN
  PERFORM governance.assert_platform(p_action, p_actor, 'ownership record');
  IF p_kind IS DISTINCT FROM 'ownership_transfer' OR p_action IS DISTINCT FROM 'governance.ownership.component.ratify' THEN
    RAISE EXCEPTION 'ownership record rejected (signature): this port signs ownership transfers under their ratification only' USING ERRCODE = '22023';
  END IF;
  SELECT b.role_code INTO v_role FROM identity.role_bindings b WHERE b.principal_id = p_actor AND b.scope = 'PLATFORM' AND b.revoked_at IS NULL
     AND b.role_code IN ('product_authority', 'operations_authority') ORDER BY b.role_code LIMIT 1;
  IF v_role IS NULL THEN RAISE EXCEPTION 'ownership record rejected (authority): an ownership transfer is signed by a product or operations authority' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM governance.signatures s WHERE s.subject_kind = p_kind AND s.subject_id = p_subject AND s.subject_version = p_version AND s.signer = p_actor) THEN
    RAISE EXCEPTION 'ownership record rejected (duplicate): % % is already signed by this principal', p_kind, p_subject USING ERRCODE = '22023';
  END IF;
  INSERT INTO governance.signatures (signature_id, scope, subject_kind, subject_id, subject_version, subject_digest, signer, signer_role, key_id, algorithm, signature, bound_action, correlation_id)
  VALUES (p_signature, 'PLATFORM', p_kind, p_subject, p_version, p_digest, p_actor, v_role, p_key_id, 'ed25519', p_signature_text, p_action, p_correlation);
  RETURN jsonb_build_object('signature_id', p_signature, 'subject_kind', p_kind, 'subject_id', p_subject, 'subject_version', p_version, 'subject_digest', p_digest, 'signer', p_actor,
                            'signer_role', v_role, 'key_id', p_key_id, 'signed_at', clock_timestamp());
END $$;
REVOKE ALL ON FUNCTION governance.dr_record_platform_signature(uuid, text, text, uuid, int, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dr_record_platform_signature(uuid, text, text, uuid, int, text, text, text, uuid, uuid) TO eye_commit;

/* DECIDE (governance.ownership.component.ratify; human-gated): RATIFY — signed first (the port verifies the signature: the actor's, over
   the transfer's digest) — or REJECT. The approver test: a product or operations authority, never the proposer, never either party of the
   transfer (the outgoing or the receiving accountable owner). Ratification makes the next ownership version (the prior superseded),
   registers it (§0 artifact kind role, key OWNER:<component>), links component —owned_by→ ownership (the prior link retired) and resolves
   the component's ownership gaps. */
CREATE OR REPLACE FUNCTION governance.dr_decide_transfer(p_transfer uuid, p_digest text, p_decision text, p_reason text, p_signature uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE t governance.component_transfers%ROWTYPE; cur governance.component_ownerships%ROWTYPE; o governance.component_ownerships%ROWTYPE; art governance.artifacts%ROWTYPE;
        s governance.signatures%ROWTYPE; v_now timestamptz := clock_timestamp(); g record; v_resolved jsonb := '[]'::jsonb;
BEGIN
  PERFORM governance.assert_platform('governance.ownership.component.ratify', p_actor, 'ownership record');
  SELECT * INTO t FROM governance.component_transfers x WHERE x.transfer_id = p_transfer FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ownership record rejected (unknown_transfer): % is not a transfer', p_transfer USING ERRCODE = '22023'; END IF;
  PERFORM governance.assert_approver('ownership record', p_actor, NULL, NULL, ARRAY['product_authority', 'operations_authority'], t.proposed_by,
                                     array_remove(ARRAY[t.from_accountable, (t.proposal ->> 'accountable')::uuid], NULL), 'ratifying an ownership transfer');
  IF p_decision IS NULL OR p_decision NOT IN ('ratify', 'reject') THEN RAISE EXCEPTION 'ownership record rejected (decision): ratify or reject' USING ERRCODE = '22023'; END IF;
  IF t.state NOT IN ('proposed', 'accepted') OR (p_decision = 'ratify' AND t.state <> 'accepted') THEN
    RAISE EXCEPTION 'ownership record rejected (state): transfer % is %', p_transfer, t.state || CASE WHEN t.state = 'proposed' THEN ' — the receiving owner accepts it before it is ratified' ELSE '' END USING ERRCODE = '22023';
  END IF;
  IF p_digest IS DISTINCT FROM t.digest THEN RAISE EXCEPTION 'ownership record rejected (stale): the digest decided is not the transfer''s' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'ownership record rejected (reason): a decision states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_decision = 'reject' THEN
    UPDATE governance.component_transfers SET state = 'rejected', decided_by = p_actor, decided_at = v_now, decision_reason = btrim(p_reason) WHERE transfer_id = p_transfer RETURNING * INTO t;
    PERFORM governance.ledger(NULL, NULL, 'component_transfer', p_transfer, NULL, 'transfer.rejected', p_actor, jsonb_build_object('reason', btrim(p_reason)), p_correlation);
    RETURN to_jsonb(t) - 'scope' - 'correlation_id';
  END IF;
  SELECT * INTO s FROM governance.signatures x WHERE x.signature_id = p_signature;
  IF NOT FOUND OR s.subject_kind <> 'ownership_transfer' OR s.subject_id <> p_transfer OR s.subject_digest <> t.digest OR s.signer <> p_actor THEN
    RAISE EXCEPTION 'ownership record rejected (signature): a ratification is signed by the ratifying authority over the transfer''s digest first' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO art FROM governance.artifacts a WHERE a.artifact_id = t.component_artifact AND a.superseded_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'ownership record rejected (unknown_component): the component is no longer current in the registry' USING ERRCODE = '22023'; END IF;
  SELECT * INTO cur FROM governance.component_ownerships x WHERE x.component_artifact = t.component_artifact AND x.superseded_at IS NULL FOR UPDATE;
  IF coalesce(cur.version, 0) IS DISTINCT FROM coalesce(t.from_version, 0) THEN RAISE EXCEPTION 'ownership record rejected (stale): the ownership moved since the transfer was proposed' USING ERRCODE = '22023'; END IF;
  IF cur.ownership_id IS NOT NULL THEN UPDATE governance.component_ownerships SET superseded_at = v_now WHERE ownership_id = cur.ownership_id AND version = cur.version; END IF;
  INSERT INTO governance.component_ownerships (ownership_id, version, component_artifact, component_key, component_kind, owning_team, accountable_principal_id, primary_contact, secondary_contact,
                                               operator_role, owned_contracts, state_stores, policy_decisions, telemetry_namespace, failure_domain, deployable_units, transfer_id, signature_id, digest,
                                               ratified_by, correlation_id)
  VALUES (t.ownership_id, coalesce(cur.version, 0) + 1, t.component_artifact, t.component_key, art.kind, t.proposal ->> 'owning_team', (t.proposal ->> 'accountable')::uuid,
          (t.proposal ->> 'primary_contact')::uuid, (t.proposal ->> 'secondary_contact')::uuid, t.proposal ->> 'operator_role',
          ARRAY(SELECT jsonb_array_elements_text(t.proposal -> 'owned_contracts')), ARRAY(SELECT jsonb_array_elements_text(t.proposal -> 'state_stores')),
          ARRAY(SELECT jsonb_array_elements_text(t.proposal -> 'policy_decisions')), t.proposal ->> 'telemetry_namespace', t.proposal ->> 'failure_domain',
          ARRAY(SELECT jsonb_array_elements_text(t.proposal -> 'deployable_units')), t.transfer_id, s.signature_id, t.digest, p_actor, p_correlation) RETURNING * INTO o;
  UPDATE governance.component_transfers SET state = 'ratified', decided_by = p_actor, decided_at = v_now, decision_reason = btrim(p_reason), signature_id = s.signature_id WHERE transfer_id = p_transfer RETURNING * INTO t;
  PERFORM governance.dr_register(o.ownership_id, 'PLATFORM', NULL, NULL, 'role', 'OWNER:' || o.component_key, 'Ownership — ' || art.title || ' (' || o.owning_team || ')', o.accountable_principal_id, NULL,
                                 'component_ownership', 'active', jsonb_build_object('ownership_version', o.version, 'owning_team', o.owning_team, 'owned_contracts', to_jsonb(o.owned_contracts),
                                                                                     'deployable_units', to_jsonb(o.deployable_units), 'operator_role', o.operator_role), o.digest, p_actor, p_correlation);
  PERFORM governance.dr_retire_links(t.component_artifact, 'owned_by', p_actor, p_correlation);
  PERFORM governance.dr_link('PLATFORM', NULL, NULL, t.component_artifact, o.ownership_id, 'owned_by', jsonb_build_object('version', o.version, 'transfer_id', t.transfer_id), p_actor, p_correlation);
  FOR g IN SELECT x.gap_id FROM governance.ownership_gaps x WHERE x.subject_id = t.component_artifact AND x.state <> 'resolved' LOOP
    PERFORM governance.dr_resolve_gap(g.gap_id, 'a ratified ownership transfer named the owner and the contacts', p_actor, p_correlation);
    v_resolved := v_resolved || to_jsonb(g.gap_id);
  END LOOP;
  PERFORM governance.ledger(NULL, NULL, 'component_transfer', p_transfer, NULL, 'transfer.ratified', p_actor,
                            jsonb_build_object('ownership_id', o.ownership_id, 'version', o.version, 'signature_id', s.signature_id, 'digest', t.digest, 'gaps_resolved', v_resolved), p_correlation);
  RETURN (to_jsonb(t) - 'scope' - 'correlation_id') || jsonb_build_object('ownership', to_jsonb(o) - 'scope' - 'correlation_id', 'gaps_resolved', v_resolved);
END $$;
REVOKE ALL ON FUNCTION governance.dr_decide_transfer(uuid, text, text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dr_decide_transfer(uuid, text, text, text, uuid, uuid, uuid) TO eye_commit;

/* WITHDRAW (governance.ownership.component.withdraw): the proposer withdraws a transfer in flight. */
CREATE OR REPLACE FUNCTION governance.dr_withdraw_transfer(p_transfer uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE t governance.component_transfers%ROWTYPE;
BEGIN
  PERFORM governance.assert_platform('governance.ownership.component.withdraw', p_actor, 'ownership record');
  SELECT * INTO t FROM governance.component_transfers x WHERE x.transfer_id = p_transfer FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ownership record rejected (unknown_transfer): % is not a transfer', p_transfer USING ERRCODE = '22023'; END IF;
  IF t.proposed_by <> p_actor THEN RAISE EXCEPTION 'ownership record rejected (authority): a transfer is withdrawn by its proposer' USING ERRCODE = '42501'; END IF;
  IF t.state NOT IN ('proposed', 'accepted') THEN RAISE EXCEPTION 'ownership record rejected (state): transfer % is %', p_transfer, t.state USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'ownership record rejected (reason): a withdrawal states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  UPDATE governance.component_transfers SET state = 'withdrawn', decided_by = p_actor, decided_at = clock_timestamp(), decision_reason = btrim(p_reason) WHERE transfer_id = p_transfer RETURNING * INTO t;
  PERFORM governance.ledger(NULL, NULL, 'component_transfer', p_transfer, NULL, 'transfer.withdrawn', p_actor, jsonb_build_object('reason', btrim(p_reason)), p_correlation);
  RETURN to_jsonb(t) - 'scope' - 'correlation_id';
END $$;
REVOKE ALL ON FUNCTION governance.dr_withdraw_transfer(uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dr_withdraw_transfer(uuid, text, uuid, uuid) TO eye_commit;

/* RECONCILE THE COMPONENTS (governance.ownership.component.reconcile; the conformance steward): every current component / deployable unit of
   the registry — no ratified ownership → a PLATFORM gap no_owner (held); a ratified ownership whose accountable owner or a contact is no
   longer an active PLATFORM human → contact_lost (held); cleared conditions resolve. */
CREATE OR REPLACE FUNCTION governance.dr_reconcile_components(p_run uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE a record; o governance.component_ownerships%ROWTYPE; v_kind text; v_lost text[]; v_opened jsonb := '[]'::jsonb; v_resolved jsonb := '[]'::jsonb; g record; v_seen int := 0; v_r jsonb;
BEGIN
  PERFORM governance.assert_platform('governance.ownership.component.reconcile', p_actor, 'ownership record');
  IF NOT governance.holds_role(p_actor, NULL, NULL, ARRAY['conformance_steward']) THEN
    RAISE EXCEPTION 'ownership record rejected (authority): component ownership is reconciled by the conformance steward' USING ERRCODE = '42501';
  END IF;
  FOR a IN SELECT x.artifact_id, x.external_key, x.title, x.kind FROM governance.artifacts x WHERE x.scope = 'PLATFORM' AND x.superseded_at IS NULL AND x.kind IN ('component', 'deployable_unit')
             AND x.lifecycle IN ('proposed', 'active', 'deprecated') ORDER BY x.external_key LOOP
    v_seen := v_seen + 1;
    SELECT * INTO o FROM governance.component_ownerships x WHERE x.component_artifact = a.artifact_id AND x.superseded_at IS NULL;
    v_kind := NULL; v_lost := '{}';
    IF NOT FOUND THEN v_kind := 'no_owner';
    ELSE
      IF NOT governance.dr_platform_human(o.accountable_principal_id) THEN v_lost := v_lost || 'accountable owner'::text; END IF;
      IF NOT governance.dr_platform_human(o.primary_contact) THEN v_lost := v_lost || 'primary contact'::text; END IF;
      IF NOT governance.dr_platform_human(o.secondary_contact) THEN v_lost := v_lost || 'secondary contact'::text; END IF;
      IF cardinality(v_lost) > 0 THEN v_kind := 'contact_lost'; END IF;
    END IF;
    IF v_kind IS NOT NULL THEN
      v_r := governance.dr_open_gap(NULL, NULL, 'component', a.artifact_id, a.external_key || ' ' || a.title, v_kind,
                                    jsonb_build_object('reason', CASE v_kind WHEN 'no_owner' THEN 'no ratified ownership record names an accountable owning team (ES-04-001, ES-11-001)'
                                                                                   ELSE 'no longer an active PLATFORM human: ' || array_to_string(v_lost, ', ') END,
                                                       'ownership_version', o.version),
                                    'the conformance steward, then the operations authority', true, NULL, 'C2', p_actor, p_correlation);
      IF NOT (v_r ->> 'existing')::boolean THEN v_opened := v_opened || jsonb_build_object('gap_id', v_r ->> 'gap_id', 'component', a.external_key, 'gap_kind', v_kind); END IF;
    END IF;
    FOR g IN SELECT x.gap_id, x.gap_kind FROM governance.ownership_gaps x WHERE x.subject_id = a.artifact_id AND x.state <> 'resolved' AND x.gap_kind IS DISTINCT FROM v_kind LOOP
      PERFORM governance.dr_resolve_gap(g.gap_id, 'the reconciliation no longer finds ' || g.gap_kind, p_actor, p_correlation);
      v_resolved := v_resolved || jsonb_build_object('gap_id', g.gap_id, 'component', a.external_key, 'gap_kind', g.gap_kind);
    END LOOP;
  END LOOP;
  PERFORM governance.ledger(NULL, NULL, 'ownership_run', p_run, NULL, 'components.reconciled', p_actor, jsonb_build_object('seen', v_seen, 'opened', v_opened, 'resolved', v_resolved), p_correlation);
  RETURN jsonb_build_object('run_id', p_run, 'seen', v_seen, 'opened', v_opened, 'resolved', v_resolved,
                            'open', (SELECT count(*) FROM governance.ownership_gaps x WHERE x.scope = 'PLATFORM' AND x.subject_kind = 'component' AND x.state IN ('open', 'escalated')));
END $$;
REVOKE ALL ON FUNCTION governance.dr_reconcile_components(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dr_reconcile_components(uuid, uuid, uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §DR.6 STEWARDSHIP CASES (DOMAIN; DP-55-001/-002/-005, DAT-GV-07) — the durable queue of data adjudication
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE governance.stewardship_cases (
  case_id            uuid PRIMARY KEY,
  scope              text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  case_ref           text NOT NULL CHECK (case_ref ~ '^STW-[0-9]{4,}$'),
  kind               text NOT NULL CHECK (kind = ANY (governance.dr_case_kinds())),
  subject_kind       text NOT NULL CHECK (subject_kind IN ('catalog_asset', 'product', 'glossary_term')),
  subject_id         uuid NOT NULL,
  subject_label      text NOT NULL,
  title              text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 200),
  proposed_action    text NOT NULL CHECK (length(btrim(proposed_action)) BETWEEN 8 AND 2000),
  evidence           jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'array' AND jsonb_array_length(evidence) >= 1),
  consequence        text NOT NULL CHECK (consequence IN ('C0', 'C1', 'C2', 'C3', 'C4')),
  owner_principal_id uuid,                                              -- resolved at opening (and re-resolved by the sweep); NULL = the case lacks an owner
  reviewers_required int  NOT NULL CHECK (reviewers_required BETWEEN 1 AND 3),
  reviews            jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(reviews) = 'array'),
  state              text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'in_review', 'approved', 'rejected', 'expired', 'closed', 'withdrawn')),
  decision           text CHECK (decision IN ('approved', 'rejected')),
  decided_by         uuid,
  decided_at         timestamptz,
  conditions         jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(conditions) = 'array'),
  expires_at         timestamptz,
  first_due_at       timestamptz NOT NULL,
  due_at             timestamptz NOT NULL,
  escalation_level   int NOT NULL DEFAULT 0 CHECK (escalation_level >= 0),
  escalated_at       timestamptz,
  closed_by          uuid,
  closed_at          timestamptz,
  closure_note       text,
  closure_evidence   jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(closure_evidence) = 'array'),
  digest             text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  opened_by          uuid NOT NULL,
  opened_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT gsc_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT gsc_ref_once UNIQUE (tenant_id, case_ref),
  CONSTRAINT gsc_decided CHECK ((decision IS NOT NULL) = (decided_by IS NOT NULL AND decided_at IS NOT NULL)),
  CONSTRAINT gsc_decision_state CHECK (state NOT IN ('approved', 'rejected', 'expired') OR decision IS NOT NULL),
  CONSTRAINT gsc_sod CHECK (decided_by IS NULL OR decided_by <> opened_by),
  CONSTRAINT gsc_exception_expiry CHECK (kind <> 'data_exception' OR decision IS DISTINCT FROM 'approved' OR expires_at IS NOT NULL),
  CONSTRAINT gsc_closed CHECK ((state = 'closed') = (closed_at IS NOT NULL AND closed_by IS NOT NULL))
);
CREATE INDEX gsc_queue ON governance.stewardship_cases (tenant_id, domain_id, state, due_at);
CREATE INDEX gsc_subject ON governance.stewardship_cases (subject_id, state);
CREATE OR REPLACE FUNCTION governance.dr_case_forward() RETURNS trigger LANGUAGE plpgsql SET search_path = governance, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'stewardship case rejected (state): a stewardship case is never deleted' USING ERRCODE = '2F002'; END IF;
  IF OLD.state IN ('closed', 'withdrawn')
     OR (NEW.case_id, NEW.tenant_id, NEW.domain_id, NEW.case_ref, NEW.kind, NEW.subject_kind, NEW.subject_id, NEW.title, NEW.proposed_action, NEW.evidence, NEW.consequence, NEW.reviewers_required,
         NEW.first_due_at, NEW.digest, NEW.opened_by, NEW.opened_at)
        IS DISTINCT FROM (OLD.case_id, OLD.tenant_id, OLD.domain_id, OLD.case_ref, OLD.kind, OLD.subject_kind, OLD.subject_id, OLD.title, OLD.proposed_action, OLD.evidence, OLD.consequence,
                          OLD.reviewers_required, OLD.first_due_at, OLD.digest, OLD.opened_by, OLD.opened_at)
     OR (OLD.decision IS NOT NULL AND NEW.decision IS DISTINCT FROM OLD.decision) THEN
    RAISE EXCEPTION 'stewardship case rejected (state): case % is % — what was opened and what was decided are immutable', OLD.case_ref, OLD.state USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER gsc_forward BEFORE UPDATE OR DELETE ON governance.stewardship_cases FOR EACH ROW EXECUTE FUNCTION governance.dr_case_forward();

/* The case's accountable owner as resolved NOW (internal): the subject's ratified data authority's owner (a product: its catalog asset's
   authority, else the product's own owner), a glossary term's owner — while an active human of the tenant; NULL otherwise. */
CREATE OR REPLACE FUNCTION governance.dr_case_owner(p_tenant uuid, p_domain uuid, p_subject_kind text, p_subject uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = governance, products, decision, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN o IS NOT NULL AND decision.is_active_human(o, p_tenant) THEN o END FROM (SELECT CASE p_subject_kind
    WHEN 'catalog_asset' THEN (SELECT r.owner_principal_id FROM governance.data_authorities r WHERE r.authority_id = p_subject AND r.state = 'ratified')
    WHEN 'product' THEN coalesce((SELECT r.owner_principal_id FROM products.catalog_assets a JOIN governance.data_authorities r ON r.authority_id = a.asset_id AND r.state = 'ratified'
                                    WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.kind = 'product' AND a.ref = p_subject::text
                                      AND decision.is_active_human(r.owner_principal_id, p_tenant)),
                                 (SELECT p.owner_principal_id FROM products.products_current p WHERE p.product_id = p_subject AND p.tenant_id = p_tenant AND p.domain_id = p_domain))
    WHEN 'glossary_term' THEN (SELECT g.owner_principal_id FROM products.glossary_terms g WHERE g.term_id = p_subject AND g.tenant_id = p_tenant AND g.domain_id = p_domain)
  END AS o) q
$$;
REVOKE ALL ON FUNCTION governance.dr_case_owner(uuid, uuid, text, uuid) FROM PUBLIC;

/* The subject's artifacts a hold names (internal): the subject itself, and for a product its catalog asset (the stop of consumption reads
   both). */
CREATE OR REPLACE FUNCTION governance.dr_subject_artifacts(p_tenant uuid, p_domain uuid, p_subject_kind text, p_subject uuid) RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = products, pg_catalog, pg_temp AS $$
  SELECT ARRAY[p_subject] || CASE WHEN p_subject_kind = 'product' THEN coalesce(ARRAY(SELECT a.asset_id FROM products.catalog_assets a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain
                                                                                        AND a.kind = 'product' AND a.ref = p_subject::text), '{}') ELSE '{}'::uuid[] END
$$;
REVOKE ALL ON FUNCTION governance.dr_subject_artifacts(uuid, uuid, text, uuid) FROM PUBLIC;

/* Cancel the case's pending SLA timers (internal). */
CREATE OR REPLACE FUNCTION governance.dr_cancel_case_timers(p_case uuid) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = executive, pg_catalog, pg_temp AS $$
DECLARE n int;
BEGIN
  UPDATE executive.workflow_timers SET cancelled_at = clock_timestamp() WHERE owner_kind = 'stewardship_case' AND owner_id = p_case AND fired_at IS NULL AND cancelled_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION governance.dr_cancel_case_timers(uuid) FROM PUBLIC;

/* Lift every hold a case opened on its subject and close its items (internal; a decision, a closure, a withdrawal). */
CREATE OR REPLACE FUNCTION governance.dr_case_release(c governance.stewardship_cases, p_reason_kinds text[], p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, executive, pg_catalog, pg_temp AS $$
DECLARE v jsonb := '[]'::jsonb; s uuid; k text; g record;
BEGIN
  FOREACH s IN ARRAY governance.dr_subject_artifacts(c.tenant_id, c.domain_id, c.subject_kind, c.subject_id) LOOP
    FOREACH k IN ARRAY p_reason_kinds LOOP
      v := v || governance.dr_lift_holds(s, k, c.case_id, p_reason, p_actor);
    END LOOP;
  END LOOP;
  PERFORM executive.b33_close_items(c.tenant_id, c.domain_id, 'governance.ownership', 'stewardship_case', c.case_id, p_reason, p_actor, p_correlation);
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION governance.dr_case_release(governance.stewardship_cases, text[], text, uuid, uuid) FROM PUBLIC;

/* The case as JSON. */
CREATE OR REPLACE FUNCTION governance.dr_case_json(c governance.stewardship_cases) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = governance, pg_catalog, pg_temp AS $$
  SELECT (to_jsonb(c) - 'scope' - 'correlation_id') || jsonb_build_object('owner_name', governance.dr_name(c.owner_principal_id), 'opened_by_name', governance.dr_name(c.opened_by),
         'decided_by_name', governance.dr_name(c.decided_by), 'approvals', (SELECT count(*) FROM jsonb_array_elements(c.reviews) r WHERE r ->> 'outcome' = 'approve'),
         'sla', governance.dr_case_sla(c.consequence)::text)
$$;
GRANT EXECUTE ON FUNCTION governance.dr_case_json(governance.stewardship_cases) TO eye_app, eye_commit;

/* OPEN (governance.ownership.case.open): a case on one subject of the domain — its kind, title, proposed action, evidence (1+ {kind, ref}),
   consequence (C0..C4). The owner resolved now; the reviewers required and the SLA by consequence; the SLA timer scheduled. A case WITHOUT
   an accountable owner opens visibly: an ownership gap (case_unowned) and a hold on its subject (affected use constrained) — it cannot be
   approved until the owner resolves. */
CREATE OR REPLACE FUNCTION governance.dr_open_case(p_case uuid, p_tenant uuid, p_domain uuid, p_kind text, p_subject_kind text, p_subject uuid, p_title text, p_action text, p_evidence jsonb,
                                                   p_consequence text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, products, executive, public, pg_catalog, pg_temp AS $$
DECLARE c governance.stewardship_cases%ROWTYPE; v_label text; v_owner uuid; v_n int; v_now timestamptz := clock_timestamp(); v_gap jsonb; s uuid; v_body jsonb;
BEGIN
  PERFORM governance.dr_domain_head(ARRAY['governance.ownership.case.open'], p_tenant, p_domain, p_actor, 'stewardship case');
  IF p_kind IS NULL OR NOT (p_kind = ANY (governance.dr_case_kinds())) THEN RAISE EXCEPTION 'stewardship case rejected (kind): identity, semantic, quality, access, classification, correction, lifecycle or data_exception' USING ERRCODE = '22023'; END IF;
  IF p_consequence IS NULL OR p_consequence NOT IN ('C0', 'C1', 'C2', 'C3', 'C4') THEN RAISE EXCEPTION 'stewardship case rejected (consequence): C0..C4' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_title, ''))) NOT BETWEEN 4 AND 200 THEN RAISE EXCEPTION 'stewardship case rejected (title): 4–200 characters' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_action, ''))) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'stewardship case rejected (action): the proposed action is stated (8–2000 characters)' USING ERRCODE = '22023'; END IF;
  IF p_evidence IS NULL OR jsonb_typeof(p_evidence) <> 'array' OR jsonb_array_length(p_evidence) = 0
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_evidence) e WHERE jsonb_typeof(e) <> 'object' OR length(btrim(coalesce(e ->> 'kind', ''))) < 2 OR length(btrim(coalesce(e ->> 'ref', ''))) < 2) THEN
    RAISE EXCEPTION 'stewardship case rejected (evidence): a case carries its evidence — 1+ items of {kind, ref}' USING ERRCODE = '22023';
  END IF;
  v_label := CASE p_subject_kind
    WHEN 'catalog_asset' THEN (SELECT a.kind || ' ' || a.title || ' (' || a.ref || ')' FROM products.catalog_assets a WHERE a.asset_id = p_subject AND a.tenant_id = p_tenant AND a.domain_id = p_domain)
    WHEN 'product' THEN (SELECT 'product ' || p.title || ' (' || p.product_key || ')' FROM products.products_current p WHERE p.product_id = p_subject AND p.tenant_id = p_tenant AND p.domain_id = p_domain)
    WHEN 'glossary_term' THEN (SELECT 'term ' || g.term FROM products.glossary_terms g WHERE g.term_id = p_subject AND g.tenant_id = p_tenant AND g.domain_id = p_domain) END;
  IF v_label IS NULL THEN RAISE EXCEPTION 'stewardship case rejected (unknown_subject): % % is not a catalog asset, product or glossary term of this domain', coalesce(p_subject_kind, 'subject'), p_subject USING ERRCODE = '22023'; END IF;
  v_owner := governance.dr_case_owner(p_tenant, p_domain, p_subject_kind, p_subject);
  PERFORM pg_advisory_xact_lock(hashtextextended('governance.case_ref:' || p_tenant::text, 0));
  SELECT count(*) INTO v_n FROM governance.stewardship_cases x WHERE x.tenant_id = p_tenant;
  v_body := jsonb_build_object('kind', p_kind, 'subject', jsonb_build_object('kind', p_subject_kind, 'id', p_subject), 'title', btrim(p_title), 'action', btrim(p_action), 'evidence', p_evidence, 'consequence', p_consequence);
  INSERT INTO governance.stewardship_cases (case_id, tenant_id, domain_id, case_ref, kind, subject_kind, subject_id, subject_label, title, proposed_action, evidence, consequence, owner_principal_id,
                                            reviewers_required, first_due_at, due_at, digest, opened_by, correlation_id)
  VALUES (p_case, p_tenant, p_domain, 'STW-' || lpad((v_n + 1)::text, 4, '0'), p_kind, p_subject_kind, p_subject, v_label, btrim(p_title), btrim(p_action), p_evidence, p_consequence, v_owner,
          governance.dr_reviewers_required(p_consequence), v_now + governance.dr_case_sla(p_consequence), v_now + governance.dr_case_sla(p_consequence), governance.digest(v_body), p_actor, p_correlation)
  RETURNING * INTO c;
  PERFORM executive._schedule_timer(gen_random_uuid(), p_tenant, p_domain, 'stewardship_case', p_case, 'stewardship.sla', c.due_at,
                                    jsonb_build_object('case', p_case, 'case_ref', c.case_ref, 'consequence', p_consequence, 'level', 0), p_actor, p_correlation);
  PERFORM governance.dr_register(p_case, 'DOMAIN', p_tenant, p_domain, 'stewardship_case', c.case_ref, c.case_ref || ' — ' || c.title, v_owner, NULL, 'stewardship_case', 'active',
                                 jsonb_build_object('kind', p_kind, 'consequence', p_consequence, 'subject_kind', p_subject_kind, 'subject_id', p_subject), c.digest, p_actor, p_correlation);
  FOREACH s IN ARRAY governance.dr_subject_artifacts(p_tenant, p_domain, p_subject_kind, p_subject) LOOP
    IF EXISTS (SELECT 1 FROM governance.artifacts a WHERE a.artifact_id = s AND a.superseded_at IS NULL) THEN
      PERFORM governance.dr_link('DOMAIN', p_tenant, p_domain, p_case, s, 'governs', jsonb_build_object('case_kind', p_kind), p_actor, p_correlation);
    END IF;
  END LOOP;
  PERFORM governance.ledger(p_tenant, p_domain, 'stewardship_case', p_case, NULL, 'case.opened', p_actor,
                            jsonb_build_object('case_ref', c.case_ref, 'kind', p_kind, 'subject', v_label, 'consequence', p_consequence, 'owner', v_owner, 'due_at', c.due_at, 'digest', c.digest), p_correlation);
  IF v_owner IS NULL THEN
    v_gap := governance.dr_open_gap(p_tenant, p_domain, 'stewardship_case', p_case, c.case_ref || ' — ' || v_label, 'case_unowned',
                                    jsonb_build_object('reason', 'the case''s subject resolves to no accountable owner (no ratified data authority, or its owner lost)', 'subject', v_label),
                                    'the data steward, then the domain administrator', false, NULL, p_consequence, p_actor, p_correlation);
    FOREACH s IN ARRAY governance.dr_subject_artifacts(p_tenant, p_domain, p_subject_kind, p_subject) LOOP
      PERFORM governance.dr_open_hold(p_tenant, p_domain, s, 'ownership_gap', p_case,
                format('%s lacks an accountable owner: affected use of %s is constrained until the owner resolves (DP-55-005)', c.case_ref, v_label), p_actor, p_correlation);
    END LOOP;
  END IF;
  RETURN governance.dr_case_json(c) || jsonb_build_object('gap', v_gap);
END $$;
REVOKE ALL ON FUNCTION governance.dr_open_case(uuid, uuid, uuid, text, text, uuid, text, text, jsonb, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dr_open_case(uuid, uuid, uuid, text, text, uuid, text, text, jsonb, text, uuid, uuid) TO eye_commit;

/* REVIEW (governance.ownership.case.review; human-gated): one reviewer's approve | reject on the case's digest. The approver test: a data
   steward or the domain administrator (and the privacy officer for access and classification), never the proposer; for an ACCESS or a
   DATA EXCEPTION case never the subject's owner (the owner whose authority it expands). One review per reviewer; an approval of a case that
   lacks an owner is refused (held). A rejection decides; approvals decide when the consequence's count is met — with the deciding review's
   conditions and expiry (a data exception's expiry is required, ≤ 366 days). The decision cancels the SLA timer and lifts the case's SLA
   holds. */
CREATE OR REPLACE FUNCTION governance.dr_review_case(p_case uuid, p_tenant uuid, p_domain uuid, p_digest text, p_outcome text, p_note text, p_conditions jsonb, p_expires_at timestamptz,
                                                     p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, executive, public, pg_catalog, pg_temp AS $$
DECLARE c governance.stewardship_cases%ROWTYPE; v_approvals int; v_now timestamptz := clock_timestamp(); v_released jsonb;
BEGIN
  PERFORM governance.dr_domain_head(ARRAY['governance.ownership.case.review'], p_tenant, p_domain, p_actor, 'stewardship case');
  SELECT * INTO c FROM governance.stewardship_cases x WHERE x.case_id = p_case AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'stewardship case rejected (unknown_case): % is not a stewardship case of this domain', p_case USING ERRCODE = '22023'; END IF;
  PERFORM governance.assert_approver('stewardship case', p_actor, p_tenant, p_domain,
                                     CASE WHEN c.kind IN ('access', 'classification') THEN ARRAY['data_steward', 'domain_admin', 'privacy_officer'] ELSE ARRAY['data_steward', 'domain_admin'] END,
                                     c.opened_by, CASE WHEN c.kind IN ('access', 'data_exception') AND c.owner_principal_id IS NOT NULL THEN ARRAY[c.owner_principal_id] ELSE NULL END,
                                     'deciding a ' || replace(c.kind, '_', ' ') || ' case');
  IF c.state NOT IN ('open', 'in_review') THEN RAISE EXCEPTION 'stewardship case rejected (state): % is %', c.case_ref, c.state USING ERRCODE = '22023'; END IF;
  IF p_digest IS DISTINCT FROM c.digest THEN RAISE EXCEPTION 'stewardship case rejected (stale): the digest reviewed is not %''s', c.case_ref USING ERRCODE = '22023'; END IF;
  IF p_outcome IS NULL OR p_outcome NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'stewardship case rejected (outcome): approve or reject' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_note, ''))) < 8 THEN RAISE EXCEPTION 'stewardship case rejected (note): a review states its grounds (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(c.reviews) r WHERE (r ->> 'reviewer')::uuid = p_actor) THEN
    RAISE EXCEPTION 'stewardship case rejected (duplicate): this reviewer has reviewed % already — a decision needs distinct reviewers', c.case_ref USING ERRCODE = '22023';
  END IF;
  IF p_outcome = 'approve' AND c.owner_principal_id IS NULL THEN
    RAISE EXCEPTION 'stewardship case rejected (held): % lacks an accountable owner — an unowned change is never approved; the ownership gap stays open until the owner resolves (DP-55-005)', c.case_ref USING ERRCODE = '22023';
  END IF;
  IF p_conditions IS NOT NULL AND (jsonb_typeof(p_conditions) <> 'array' OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_conditions) x WHERE jsonb_typeof(x) <> 'string' OR length(btrim(x #>> '{}')) < 8)) THEN
    RAISE EXCEPTION 'stewardship case rejected (conditions): conditions are a list of statements (8+ characters each)' USING ERRCODE = '22023';
  END IF;
  IF p_expires_at IS NOT NULL AND (p_expires_at <= v_now OR p_expires_at > v_now + interval '366 days') THEN
    RAISE EXCEPTION 'stewardship case rejected (expiry): an expiry is in the future and within 366 days' USING ERRCODE = '22023';
  END IF;
  IF p_outcome = 'approve' AND c.kind = 'data_exception' AND p_expires_at IS NULL THEN
    RAISE EXCEPTION 'stewardship case rejected (expiry): a data exception is narrow and EXPIRES — the approval names its expiry (within 366 days)' USING ERRCODE = '22023';
  END IF;
  c.reviews := c.reviews || jsonb_build_object('reviewer', p_actor, 'outcome', p_outcome, 'note', btrim(p_note), 'at', v_now, 'conditions', coalesce(p_conditions, '[]'::jsonb), 'expires_at', p_expires_at);
  SELECT count(*) INTO v_approvals FROM jsonb_array_elements(c.reviews) r WHERE r ->> 'outcome' = 'approve';
  IF p_outcome = 'reject' THEN
    UPDATE governance.stewardship_cases SET reviews = c.reviews, state = 'rejected', decision = 'rejected', decided_by = p_actor, decided_at = v_now, updated_at = v_now WHERE case_id = p_case RETURNING * INTO c;
  ELSIF v_approvals >= c.reviewers_required THEN
    UPDATE governance.stewardship_cases SET reviews = c.reviews, state = 'approved', decision = 'approved', decided_by = p_actor, decided_at = v_now, conditions = coalesce(p_conditions, '[]'::jsonb),
           expires_at = p_expires_at, updated_at = v_now WHERE case_id = p_case RETURNING * INTO c;
  ELSE
    UPDATE governance.stewardship_cases SET reviews = c.reviews, state = 'in_review', updated_at = v_now WHERE case_id = p_case RETURNING * INTO c;
  END IF;
  IF c.decision IS NOT NULL THEN
    PERFORM governance.dr_cancel_case_timers(p_case);
    v_released := governance.dr_case_release(c, ARRAY['evidence_stale'], format('%s decided (%s) by a named reviewer', c.case_ref, c.decision), p_actor, p_correlation);
    -- the SLA hold (C3+ past its SLA) is opened as ownership_gap by the sweep with the case as its source; a decision ends it (the owner hold of an unowned case stays until it resolves)
    IF c.owner_principal_id IS NOT NULL THEN v_released := v_released || governance.dr_case_release(c, ARRAY['ownership_gap'], format('%s decided (%s)', c.case_ref, c.decision), p_actor, p_correlation); END IF;
  END IF;
  PERFORM governance.ledger(p_tenant, p_domain, 'stewardship_case', p_case, NULL, CASE WHEN c.decision IS NULL THEN 'case.reviewed' ELSE 'case.decided' END, p_actor,
                            jsonb_build_object('case_ref', c.case_ref, 'outcome', p_outcome, 'approvals', v_approvals, 'required', c.reviewers_required, 'decision', c.decision,
                                               'conditions', c.conditions, 'expires_at', c.expires_at, 'released', v_released), p_correlation);
  RETURN governance.dr_case_json(c) || jsonb_build_object('released', v_released);
END $$;
REVOKE ALL ON FUNCTION governance.dr_review_case(uuid, uuid, uuid, text, text, text, jsonb, timestamptz, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dr_review_case(uuid, uuid, uuid, text, text, text, jsonb, timestamptz, uuid, uuid) TO eye_commit;

/* CLOSE (governance.ownership.case.close): the subject's owner or a data steward / the domain administrator closes a DECIDED (or expired)
   case with its closure note and evidence — an approved case's conditions each evidenced (one evidence item per condition at least). The
   case's holds lift (an expired exception ends with its closure). */
CREATE OR REPLACE FUNCTION governance.dr_close_case(p_case uuid, p_tenant uuid, p_domain uuid, p_note text, p_evidence jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, executive, public, pg_catalog, pg_temp AS $$
DECLARE c governance.stewardship_cases%ROWTYPE; v_released jsonb; g record;
BEGIN
  PERFORM governance.dr_domain_head(ARRAY['governance.ownership.case.close'], p_tenant, p_domain, p_actor, 'stewardship case');
  SELECT * INTO c FROM governance.stewardship_cases x WHERE x.case_id = p_case AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'stewardship case rejected (unknown_case): % is not a stewardship case of this domain', p_case USING ERRCODE = '22023'; END IF;
  IF c.owner_principal_id IS DISTINCT FROM p_actor AND NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['data_steward', 'domain_admin']) THEN
    RAISE EXCEPTION 'stewardship case rejected (authority): a case is closed by its subject''s owner, a data steward or the domain administrator' USING ERRCODE = '42501';
  END IF;
  IF c.state NOT IN ('approved', 'rejected', 'expired') THEN RAISE EXCEPTION 'stewardship case rejected (state): % is %; a decided case is closed', c.case_ref, c.state USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_note, ''))) < 8 THEN RAISE EXCEPTION 'stewardship case rejected (note): a closure states what was done (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_evidence IS NULL OR jsonb_typeof(p_evidence) <> 'array' OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_evidence) e WHERE jsonb_typeof(e) <> 'object' OR length(btrim(coalesce(e ->> 'ref', ''))) < 2)
     OR (c.decision = 'approved' AND jsonb_array_length(p_evidence) < greatest(1, jsonb_array_length(c.conditions))) THEN
    RAISE EXCEPTION 'stewardship case rejected (evidence): a closure carries its evidence ({kind, ref}) — at least one item per condition of an approved case (% condition(s))', jsonb_array_length(c.conditions) USING ERRCODE = '22023';
  END IF;
  UPDATE governance.stewardship_cases SET state = 'closed', closed_by = p_actor, closed_at = clock_timestamp(), closure_note = btrim(p_note), closure_evidence = p_evidence, updated_at = clock_timestamp()
   WHERE case_id = p_case RETURNING * INTO c;
  PERFORM governance.dr_cancel_case_timers(p_case);
  v_released := governance.dr_case_release(c, ARRAY['ownership_gap', 'exception_expired', 'evidence_stale'], format('%s closed: %s', c.case_ref, btrim(p_note)), p_actor, p_correlation);
  FOR g IN SELECT x.gap_id FROM governance.ownership_gaps x WHERE x.subject_id = p_case AND x.state <> 'resolved' LOOP
    PERFORM governance.dr_resolve_gap(g.gap_id, 'the case is closed', p_actor, p_correlation);
  END LOOP;
  PERFORM governance.ledger(p_tenant, p_domain, 'stewardship_case', p_case, NULL, 'case.closed', p_actor, jsonb_build_object('case_ref', c.case_ref, 'note', btrim(p_note), 'evidence', p_evidence, 'released', v_released), p_correlation);
  RETURN governance.dr_case_json(c) || jsonb_build_object('released', v_released);
END $$;
REVOKE ALL ON FUNCTION governance.dr_close_case(uuid, uuid, uuid, text, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dr_close_case(uuid, uuid, uuid, text, jsonb, uuid, uuid) TO eye_commit;

/* WITHDRAW (governance.ownership.case.withdraw): the opener withdraws an undecided case; its timer cancelled, its holds lifted. */
CREATE OR REPLACE FUNCTION governance.dr_withdraw_case(p_case uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, executive, public, pg_catalog, pg_temp AS $$
DECLARE c governance.stewardship_cases%ROWTYPE; v_released jsonb; g record;
BEGIN
  PERFORM governance.dr_domain_head(ARRAY['governance.ownership.case.withdraw'], p_tenant, p_domain, p_actor, 'stewardship case');
  SELECT * INTO c FROM governance.stewardship_cases x WHERE x.case_id = p_case AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'stewardship case rejected (unknown_case): % is not a stewardship case of this domain', p_case USING ERRCODE = '22023'; END IF;
  IF c.opened_by <> p_actor THEN RAISE EXCEPTION 'stewardship case rejected (authority): a case is withdrawn by the one who opened it' USING ERRCODE = '42501'; END IF;
  IF c.state NOT IN ('open', 'in_review') THEN RAISE EXCEPTION 'stewardship case rejected (state): % is %', c.case_ref, c.state USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'stewardship case rejected (reason): a withdrawal states why (8+ characters)' USING ERRCODE = '22023'; END IF;
  UPDATE governance.stewardship_cases SET state = 'withdrawn', closure_note = btrim(p_reason), updated_at = clock_timestamp() WHERE case_id = p_case RETURNING * INTO c;
  PERFORM governance.dr_cancel_case_timers(p_case);
  v_released := governance.dr_case_release(c, ARRAY['ownership_gap', 'evidence_stale'], format('%s withdrawn: %s', c.case_ref, btrim(p_reason)), p_actor, p_correlation);
  FOR g IN SELECT x.gap_id FROM governance.ownership_gaps x WHERE x.subject_id = p_case AND x.state <> 'resolved' LOOP
    PERFORM governance.dr_resolve_gap(g.gap_id, 'the case was withdrawn', p_actor, p_correlation);
  END LOOP;
  PERFORM governance.ledger(p_tenant, p_domain, 'stewardship_case', p_case, NULL, 'case.withdrawn', p_actor, jsonb_build_object('case_ref', c.case_ref, 'reason', btrim(p_reason)), p_correlation);
  RETURN governance.dr_case_json(c);
END $$;
REVOKE ALL ON FUNCTION governance.dr_withdraw_case(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dr_withdraw_case(uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

/* THE SWEEP (executive.attention.tick — the step `governance-stewardship-sla` and the `stewardship.sla` timer, which names its case): on the
   database clock,
     (1) an UNOWNED undecided case whose subject now resolves to an owner takes it — its gap resolves, its subject's hold lifts;
     (2) an undecided case PAST ITS SLA escalates by consequence — level + 1, the next window, a governance.ownership item at the case's
         consequence (one level higher per escalation, capped at C4), and at C3+ a hold on its subject (affected use constrained until a
         named reviewer decides);
     (3) an approved case PAST ITS EXPIRY expires — a data exception holds its subject (exception_expired) until the case is closed or a new
         case approves a renewal; conditions not evidenced by their expiry hold it (evidence_stale).
   Reads first (the candidate list), then each write; never one statement across the context. */
CREATE OR REPLACE FUNCTION governance.dr_sweep_cases(p_tenant uuid, p_domain uuid, p_case uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, executive, public, pg_catalog, pg_temp AS $$
DECLARE c governance.stewardship_cases%ROWTYPE; v_now timestamptz := clock_timestamp(); v_owner uuid; v_ids uuid[]; v_id uuid; v_ev uuid; s uuid; g record;
        v_owned jsonb := '[]'::jsonb; v_escalated jsonb := '[]'::jsonb; v_expired jsonb := '[]'::jsonb; v_cons text;
BEGIN
  PERFORM governance.dr_domain_head(ARRAY['executive.attention.tick'], p_tenant, p_domain, p_actor, 'stewardship case');
  SELECT coalesce(array_agg(x.case_id ORDER BY x.due_at), '{}') INTO v_ids FROM governance.stewardship_cases x
   WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND (p_case IS NULL OR x.case_id = p_case)
     AND ((x.state IN ('open', 'in_review') AND (x.owner_principal_id IS NULL OR x.due_at <= v_now)) OR (x.state = 'approved' AND x.expires_at IS NOT NULL AND x.expires_at <= v_now));
  FOREACH v_id IN ARRAY v_ids LOOP
    SELECT * INTO c FROM governance.stewardship_cases x WHERE x.case_id = v_id FOR UPDATE;
    -- (1) the owner, re-resolved
    IF c.state IN ('open', 'in_review') AND c.owner_principal_id IS NULL THEN
      v_owner := governance.dr_case_owner(c.tenant_id, c.domain_id, c.subject_kind, c.subject_id);
      IF v_owner IS NOT NULL THEN
        UPDATE governance.stewardship_cases SET owner_principal_id = v_owner, updated_at = v_now WHERE case_id = c.case_id RETURNING * INTO c;
        FOREACH s IN ARRAY governance.dr_subject_artifacts(c.tenant_id, c.domain_id, c.subject_kind, c.subject_id) LOOP
          PERFORM governance.dr_lift_holds(s, 'ownership_gap', c.case_id, c.case_ref || ' has an accountable owner now', p_actor);
        END LOOP;
        FOR g IN SELECT x.gap_id FROM governance.ownership_gaps x WHERE x.subject_id = c.case_id AND x.state <> 'resolved' LOOP
          PERFORM governance.dr_resolve_gap(g.gap_id, 'the case''s subject resolves to an accountable owner', p_actor, p_correlation);
        END LOOP;
        PERFORM governance.ledger(c.tenant_id, c.domain_id, 'stewardship_case', c.case_id, NULL, 'case.owner_resolved', p_actor, jsonb_build_object('case_ref', c.case_ref, 'owner', v_owner), p_correlation);
        v_owned := v_owned || jsonb_build_object('case_ref', c.case_ref, 'owner', v_owner);
      END IF;
    END IF;
    -- (2) past its SLA
    IF c.state IN ('open', 'in_review') AND c.due_at <= v_now THEN
      v_cons := 'C' || least(4, substr(c.consequence, 2)::int + c.escalation_level)::text;
      UPDATE governance.stewardship_cases SET escalation_level = escalation_level + 1, escalated_at = v_now, due_at = v_now + governance.dr_case_sla(c.consequence), updated_at = v_now
       WHERE case_id = c.case_id RETURNING * INTO c;
      PERFORM executive._schedule_timer(gen_random_uuid(), c.tenant_id, c.domain_id, 'stewardship_case', c.case_id, 'stewardship.sla', c.due_at,
                                        jsonb_build_object('case', c.case_id, 'case_ref', c.case_ref, 'consequence', c.consequence, 'level', c.escalation_level), p_actor, p_correlation);
      v_ev := governance.ledger(c.tenant_id, c.domain_id, 'stewardship_case', c.case_id, NULL, 'case.escalated', p_actor,
                                jsonb_build_object('case_ref', c.case_ref, 'level', c.escalation_level, 'consequence', v_cons, 'next_due_at', c.due_at), p_correlation);
      PERFORM executive.b33_raise_routed(c.tenant_id, c.domain_id, 'governance.ownership', 'stewardship_case', c.case_id,
                left(format('Stewardship case %s past its SLA (level %s, %s): %s — %s', c.case_ref, c.escalation_level, v_cons, c.title, c.subject_label), 512),
                jsonb_build_array(format('no decision by the SLA of a %s case (%s)', c.consequence, governance.dr_case_sla(c.consequence))), c.owner_principal_id, v_ev, 'StewardshipCaseEscalated',
                jsonb_build_object('case_ref', c.case_ref, 'level', c.escalation_level, 'kind', c.kind), jsonb_build_object('consequence', v_cons), p_actor, p_correlation);
      IF v_cons IN ('C3', 'C4') THEN
        FOREACH s IN ARRAY governance.dr_subject_artifacts(c.tenant_id, c.domain_id, c.subject_kind, c.subject_id) LOOP
          PERFORM governance.dr_open_hold(c.tenant_id, c.domain_id, s, 'evidence_stale', c.case_id,
                    format('%s (%s) is past its SLA without an independent decision: affected use of %s is constrained until a named reviewer decides', c.case_ref, v_cons, c.subject_label), p_actor, p_correlation);
        END LOOP;
      END IF;
      v_escalated := v_escalated || jsonb_build_object('case_ref', c.case_ref, 'level', c.escalation_level, 'consequence', v_cons);
    END IF;
    -- (3) past its expiry
    IF c.state = 'approved' AND c.expires_at IS NOT NULL AND c.expires_at <= v_now THEN
      UPDATE governance.stewardship_cases SET state = 'expired', updated_at = v_now WHERE case_id = c.case_id RETURNING * INTO c;
      v_ev := governance.ledger(c.tenant_id, c.domain_id, 'stewardship_case', c.case_id, NULL, 'case.expired', p_actor, jsonb_build_object('case_ref', c.case_ref, 'expires_at', c.expires_at), p_correlation);
      FOREACH s IN ARRAY governance.dr_subject_artifacts(c.tenant_id, c.domain_id, c.subject_kind, c.subject_id) LOOP
        PERFORM governance.dr_open_hold(c.tenant_id, c.domain_id, s, CASE WHEN c.kind = 'data_exception' THEN 'exception_expired' ELSE 'evidence_stale' END, c.case_id,
                  CASE WHEN c.kind = 'data_exception' THEN format('the data exception %s expired at %s: affected use of %s is held until it is closed or a renewal is approved with current evidence', c.case_ref, c.expires_at, c.subject_label)
                       ELSE format('the conditions of %s were not evidenced by %s', c.case_ref, c.expires_at) END, p_actor, p_correlation);
      END LOOP;
      PERFORM executive.b33_raise_routed(c.tenant_id, c.domain_id, 'governance.ownership', 'stewardship_case', c.case_id,
                left(format('%s %s EXPIRED at %s: %s', CASE WHEN c.kind = 'data_exception' THEN 'Data exception' ELSE 'Stewardship decision' END, c.case_ref, c.expires_at, c.subject_label), 512),
                jsonb_build_array('the decision''s expiry passed before its closure'), c.owner_principal_id, v_ev, 'StewardshipCaseExpired', jsonb_build_object('case_ref', c.case_ref, 'kind', c.kind),
                jsonb_build_object('consequence', c.consequence), p_actor, p_correlation);
      v_expired := v_expired || jsonb_build_object('case_ref', c.case_ref, 'kind', c.kind);
    END IF;
  END LOOP;
  RETURN jsonb_build_object('candidates', cardinality(v_ids), 'owner_resolved', v_owned, 'escalated', v_escalated, 'expired', v_expired);
END $$;
REVOKE ALL ON FUNCTION governance.dr_sweep_cases(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dr_sweep_cases(uuid, uuid, uuid, uuid, uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §DR.7 THE RESPONSIBILITY EVIDENCE RECORD (DOMAIN; DP-01-006, DP-04-006, DP-55-006 — the in-product half of B+X:R1)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE governance.responsibility_evidence (
  record_id          uuid PRIMARY KEY,
  scope              text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  deployment_profile text NOT NULL CHECK (deployment_profile IN ('local-dev', 'saas', 'private-cloud', 'on-premise')),
  period_from        timestamptz NOT NULL,
  period_to          timestamptz NOT NULL,
  bound              jsonb NOT NULL CHECK (jsonb_typeof(bound) = 'object'),            -- the build identity: head SHA, migration head, policy bundle version, contract digests
  matrix             jsonb NOT NULL CHECK (jsonb_typeof(matrix) = 'object'),           -- B94's approved, SIGNED responsibility matrix (referenced, never rewritten)
  authorities        jsonb NOT NULL CHECK (jsonb_typeof(authorities) = 'object'),      -- the ratified authorities and their recertification
  stewardship        jsonb NOT NULL CHECK (jsonb_typeof(stewardship) = 'object'),      -- SLA, segregation, exception ageing, override review, sampled decisions
  privileged_changes jsonb NOT NULL CHECK (jsonb_typeof(privileged_changes) = 'array'),
  exercises          jsonb NOT NULL CHECK (jsonb_typeof(exercises) = 'array'),         -- B94's joint operating exercises in the period
  gaps               jsonb NOT NULL CHECK (jsonb_typeof(gaps) = 'object'),
  digest             text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  claim              text NOT NULL DEFAULT 'demonstration' CHECK (claim = 'demonstration'),
  production_admission text NOT NULL DEFAULT 'R1: production admission and continued operation are decided on real infrastructure by named external authorities — this record is construction / demonstration evidence only, never an admission',
  state              text NOT NULL DEFAULT 'assembled' CHECK (state IN ('assembled', 'attested', 'rejected')),
  assembled_by       uuid NOT NULL,
  assembled_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_by         uuid,
  decided_at         timestamptz,
  decision_reason    text,
  signature_id       uuid,
  correlation_id     uuid NOT NULL,
  CONSTRAINT gre_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT gre_period CHECK (period_from < period_to),
  CONSTRAINT gre_decided CHECK ((state = 'assembled') = (decided_by IS NULL)),
  CONSTRAINT gre_sod CHECK (decided_by IS NULL OR decided_by <> assembled_by),
  CONSTRAINT gre_signed CHECK (state <> 'attested' OR signature_id IS NOT NULL)
);
CREATE INDEX gre_domain ON governance.responsibility_evidence (tenant_id, domain_id, assembled_at DESC);
CREATE OR REPLACE FUNCTION governance.dr_evidence_forward() RETURNS trigger LANGUAGE plpgsql SET search_path = governance, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.state <> 'assembled'
     OR (to_jsonb(NEW) - ARRAY['state', 'decided_by', 'decided_at', 'decision_reason', 'signature_id']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['state', 'decided_by', 'decided_at', 'decision_reason', 'signature_id']) THEN
    RAISE EXCEPTION 'data authority rejected (state): an evidence record is immutable once assembled; only its attestation is set, once' USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER gre_forward BEFORE UPDATE OR DELETE ON governance.responsibility_evidence FOR EACH ROW EXECUTE FUNCTION governance.dr_evidence_forward();

/* ASSEMBLE (governance.ownership.evidence.assemble; a data steward or the domain administrator): the evidence of one period, READ from the
   records (never typed): the B94 matrix approved for the profile and its signatures; the ratified authorities with their recertification;
   the stewardship queue — opened, decided, decided within the first SLA, the attainment, the escalations, the SEGREGATION TEST (decisions or
   reviews by the opener; exception decisions by the owner — each must be 0), the exception AGEING, the OVERRIDE review (residuals accepted),
   a SAMPLE of decided cases (deterministic, for a person's quality review); the privileged changes (ratifications, acceptances, decisions);
   B94's joint exercises; the open gaps; bound to the build identity the caller passes and the migration head read here. */
CREATE OR REPLACE FUNCTION governance.dr_assemble_evidence(p_record uuid, p_tenant uuid, p_domain uuid, p_profile text, p_from timestamptz, p_to timestamptz, p_bound jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, service, executive, products, public, pg_catalog, pg_temp AS $$
DECLARE m service.responsibility_matrices%ROWTYPE; v_matrix jsonb; v_auth jsonb; v_stew jsonb; v_priv jsonb; v_ex jsonb; v_gaps jsonb; v_bound jsonb; r governance.responsibility_evidence%ROWTYPE;
        v_decided int; v_within int;
BEGIN
  PERFORM governance.dr_domain_head(ARRAY['governance.ownership.evidence.assemble'], p_tenant, p_domain, p_actor, 'data authority');
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['data_steward', 'domain_admin']) THEN
    RAISE EXCEPTION 'data authority rejected (authority): responsibility evidence is assembled by a data steward or the domain administrator' USING ERRCODE = '42501';
  END IF;
  IF coalesce(p_profile, '') NOT IN ('local-dev', 'saas', 'private-cloud', 'on-premise') THEN RAISE EXCEPTION 'data authority rejected (profile): local-dev, saas, private-cloud or on-premise' USING ERRCODE = '22023'; END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_from >= p_to OR p_to > clock_timestamp() OR p_to - p_from > interval '366 days' THEN
    RAISE EXCEPTION 'data authority rejected (period): a period under review is closed (from before to, to not in the future) and at most 366 days' USING ERRCODE = '22023';
  END IF;
  IF p_bound IS NULL OR jsonb_typeof(p_bound) <> 'object' THEN RAISE EXCEPTION 'data authority rejected (bound): the build identity is an object' USING ERRCODE = '22023'; END IF;
  SELECT * INTO m FROM service.responsibility_matrices x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.deployment_profile = p_profile AND x.state = 'approved';
  v_matrix := CASE WHEN m.matrix_id IS NULL THEN jsonb_build_object('state', 'missing', 'reason', format('the domain has no approved responsibility matrix for %s', p_profile))
                   ELSE jsonb_build_object('state', 'approved', 'matrix_id', m.matrix_id, 'version', m.version, 'digest', m.digest, 'signature_id', m.signature_id, 'decided_by', m.decided_by,
                                           'decided_at', m.decided_at, 'signatures', executive.signature_of('responsibility_matrix', m.matrix_id, m.version),
                                           'rows', (SELECT count(*) FROM service.responsibility_rows rr WHERE rr.matrix_id = m.matrix_id AND rr.version = m.version)) END;
  SELECT jsonb_build_object('ratified', count(*), 'recertified_in_period', count(*) FILTER (WHERE a.recertified_at >= p_from AND a.recertified_at < p_to),
           'lapsed', count(*) FILTER (WHERE a.recertify_by < p_to), 'owner_accepted', count(*) FILTER (WHERE a.owner_accepted_at IS NOT NULL),
           'items', coalesce(jsonb_agg(jsonb_build_object('authority_id', a.authority_id, 'asset', a.asset_kind || ':' || a.asset_ref, 'version', a.version, 'digest', a.digest, 'owner', a.owner_principal_id,
                                                          'recertify_by', a.recertify_by, 'recertified_at', a.recertified_at) ORDER BY a.asset_kind, a.asset_ref), '[]'::jsonb))
    INTO v_auth FROM governance.data_authorities a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.state = 'ratified';
  SELECT count(*) FILTER (WHERE c.decided_at >= p_from AND c.decided_at < p_to), count(*) FILTER (WHERE c.decided_at >= p_from AND c.decided_at < p_to AND c.decided_at <= c.first_due_at)
    INTO v_decided, v_within FROM governance.stewardship_cases c WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain;
  v_stew := jsonb_build_object(
    'opened', (SELECT count(*) FROM governance.stewardship_cases c WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.opened_at >= p_from AND c.opened_at < p_to),
    'decided', v_decided, 'decided_within_sla', v_within,
    'sla_attainment_pct', CASE WHEN v_decided = 0 THEN NULL ELSE round(100.0 * v_within / v_decided, 2) END,
    'escalated', (SELECT count(*) FROM governance.stewardship_cases c WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.escalated_at >= p_from AND c.escalated_at < p_to),
    'open_now', (SELECT count(*) FROM governance.stewardship_cases c WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.state IN ('open', 'in_review')),
    'segregation', jsonb_build_object(
       'decided_by_opener', (SELECT count(*) FROM governance.stewardship_cases c WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.decided_by = c.opened_by),
       'reviewed_by_opener', (SELECT count(*) FROM governance.stewardship_cases c, jsonb_array_elements(c.reviews) rv WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND (rv ->> 'reviewer')::uuid = c.opened_by),
       'exception_approved_by_owner', (SELECT count(*) FROM governance.stewardship_cases c, jsonb_array_elements(c.reviews) rv WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain
                                         AND c.kind IN ('access', 'data_exception') AND rv ->> 'outcome' = 'approve' AND (rv ->> 'reviewer')::uuid = c.owner_principal_id),
       'note', 'each count must be 0 — the ports refuse these acts; the test re-reads the record'),
    'exception_ageing', coalesce((SELECT jsonb_agg(jsonb_build_object('case_ref', c.case_ref, 'state', c.state, 'approved_at', c.decided_at, 'expires_at', c.expires_at,
                                                                     'age_days', round(extract(epoch FROM (p_to - c.decided_at)) / 86400.0, 1),
                                                                     'days_to_expiry', round(extract(epoch FROM (c.expires_at - p_to)) / 86400.0, 1)) ORDER BY c.decided_at)
                                    FROM governance.stewardship_cases c WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.kind = 'data_exception' AND c.decision = 'approved' AND c.decided_at < p_to
                                      AND c.state IN ('approved', 'expired')), '[]'::jsonb),
    'override_review', coalesce((SELECT jsonb_agg(jsonb_build_object('gap_id', g.gap_id, 'gap_kind', g.gap_kind, 'subject', g.subject_label, 'accepted_by', g.accepted_by, 'accepted_until', g.accepted_until,
                                                                    'reason', g.accept_reason) ORDER BY g.accepted_at)
                                   FROM governance.ownership_gaps g WHERE g.tenant_id = p_tenant AND g.domain_id = p_domain AND g.accepted_at >= p_from AND g.accepted_at < p_to), '[]'::jsonb),
    'sample', coalesce((SELECT jsonb_agg(jsonb_build_object('case_ref', q.case_ref, 'kind', q.kind, 'consequence', q.consequence, 'decision', q.decision, 'reviews', q.reviews, 'conditions', q.conditions))
                          FROM (SELECT c.* FROM governance.stewardship_cases c WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.decided_at >= p_from AND c.decided_at < p_to
                                 ORDER BY md5(c.case_id::text || p_from::text) LIMIT 5) q), '[]'::jsonb),
    'sample_rule', 'up to five decided cases of the period, ordered by md5(case_id || period start): a deterministic draw for a person''s quality review');
  SELECT coalesce(jsonb_agg(jsonb_build_object('event', e.event, 'subject_kind', e.subject_kind, 'subject_id', e.subject_id, 'version', e.version, 'actor', e.actor_principal_id, 'at', e.occurred_at) ORDER BY e.occurred_at), '[]'::jsonb)
    INTO v_priv FROM governance.events e
   WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.occurred_at >= p_from AND e.occurred_at < p_to
     AND e.event IN ('authority.ratified', 'authority.rejected', 'domain.ratified', 'gap.accepted', 'case.decided', 'authority.recertified');
  SELECT coalesce(jsonb_agg(jsonb_build_object('exercise_id', x.exercise_id, 'title', x.title, 'held_on', x.held_on, 'outcome', x.outcome, 'claim', x.claim) ORDER BY x.held_on), '[]'::jsonb)
    INTO v_ex FROM service.joint_exercises x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.held_on >= p_from::date AND x.held_on <= p_to::date;
  SELECT jsonb_build_object('open', count(*) FILTER (WHERE g.state IN ('open', 'escalated')), 'accepted', count(*) FILTER (WHERE g.state = 'accepted'),
                            'items', coalesce(jsonb_agg(jsonb_build_object('gap_id', g.gap_id, 'gap_kind', g.gap_kind, 'subject', g.subject_label, 'state', g.state) ORDER BY g.opened_at), '[]'::jsonb))
    INTO v_gaps FROM governance.ownership_gaps g WHERE g.tenant_id = p_tenant AND g.domain_id = p_domain AND g.state <> 'resolved';
  v_bound := p_bound || jsonb_build_object('migration_head', (SELECT max(filename) FROM public.schema_migrations), 'deployment_profile', p_profile,
                                           'authority_digests', governance.digest(v_auth -> 'items'), 'matrix_digest', v_matrix ->> 'digest');
  INSERT INTO governance.responsibility_evidence (record_id, tenant_id, domain_id, deployment_profile, period_from, period_to, bound, matrix, authorities, stewardship, privileged_changes, exercises, gaps,
                                                  digest, assembled_by, correlation_id)
  VALUES (p_record, p_tenant, p_domain, p_profile, p_from, p_to, v_bound, v_matrix, v_auth, v_stew, v_priv, v_ex, v_gaps,
          governance.digest(jsonb_build_object('record_id', p_record, 'tenant', p_tenant, 'domain', p_domain, 'profile', p_profile, 'from', p_from, 'to', p_to, 'bound', v_bound, 'matrix', v_matrix,
                                               'authorities', v_auth, 'stewardship', v_stew, 'privileged_changes', v_priv, 'exercises', v_ex, 'gaps', v_gaps, 'claim', 'demonstration')),
          p_actor, p_correlation) RETURNING * INTO r;
  PERFORM governance.ledger(p_tenant, p_domain, 'responsibility_evidence', p_record, 1, 'evidence.assembled', p_actor, jsonb_build_object('digest', r.digest, 'from', p_from, 'to', p_to, 'profile', p_profile), p_correlation);
  RETURN to_jsonb(r) - 'scope' - 'correlation_id';
END $$;
REVOKE ALL ON FUNCTION governance.dr_assemble_evidence(uuid, uuid, uuid, text, timestamptz, timestamptz, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dr_assemble_evidence(uuid, uuid, uuid, text, timestamptz, timestamptz, jsonb, uuid, uuid) TO eye_commit;

/* ATTEST (governance.ownership.evidence.attest; human-gated): the onboarding authority or the customer sponsor — never the assembler —
   attests (SIGNED first: executive.signatures `responsibility_matrix` over the record's digest, by the attester; the port verifies it) or
   rejects. An attestation needs the B94 matrix APPROVED and SIGNED and a clean segregation test; it is the customer's attestation of
   demonstration evidence — production admission stays R1. */
CREATE OR REPLACE FUNCTION governance.dr_attest_evidence(p_record uuid, p_tenant uuid, p_domain uuid, p_digest text, p_decision text, p_reason text, p_signature uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, executive, public, pg_catalog, pg_temp AS $$
DECLARE r governance.responsibility_evidence%ROWTYPE; s executive.signatures%ROWTYPE; v_seg int;
BEGIN
  PERFORM governance.dr_domain_head(ARRAY['governance.ownership.evidence.attest'], p_tenant, p_domain, p_actor, 'data authority');
  SELECT * INTO r FROM governance.responsibility_evidence x WHERE x.record_id = p_record AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'data authority rejected (unknown_record): % is not an evidence record of this domain', p_record USING ERRCODE = '22023'; END IF;
  PERFORM governance.assert_approver('data authority', p_actor, p_tenant, p_domain, ARRAY['onboarding_authority', 'customer_sponsor'], r.assembled_by, NULL, 'attesting responsibility evidence');
  IF r.state <> 'assembled' THEN RAISE EXCEPTION 'data authority rejected (state): record % is %', p_record, r.state USING ERRCODE = '22023'; END IF;
  IF p_digest IS DISTINCT FROM r.digest THEN RAISE EXCEPTION 'data authority rejected (stale): the digest attested is not the record''s' USING ERRCODE = '22023'; END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('attest', 'reject') THEN RAISE EXCEPTION 'data authority rejected (decision): attest or reject' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'data authority rejected (reason): a decision states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_decision = 'attest' THEN
    v_seg := coalesce((r.stewardship #>> '{segregation,decided_by_opener}')::int, 0) + coalesce((r.stewardship #>> '{segregation,reviewed_by_opener}')::int, 0)
             + coalesce((r.stewardship #>> '{segregation,exception_approved_by_owner}')::int, 0);
    IF r.matrix ->> 'state' <> 'approved' OR r.matrix ->> 'signature_id' IS NULL THEN
      RAISE EXCEPTION 'data authority rejected (held): the record carries no approved, signed responsibility matrix (%) — it is attested only over a signed matrix', coalesce(r.matrix ->> 'reason', 'unsigned') USING ERRCODE = '22023';
    END IF;
    IF v_seg > 0 THEN RAISE EXCEPTION 'data authority rejected (held): the segregation test of the record is not clean (% violation(s))', v_seg USING ERRCODE = '22023'; END IF;
    SELECT * INTO s FROM executive.signatures x WHERE x.signature_id = p_signature;
    IF NOT FOUND OR s.subject_kind <> 'responsibility_matrix' OR s.subject_id <> p_record OR s.subject_digest <> r.digest OR s.signer <> p_actor THEN
      RAISE EXCEPTION 'data authority rejected (signature): an attestation is signed by the attester over the record''s digest first' USING ERRCODE = '22023';
    END IF;
  END IF;
  UPDATE governance.responsibility_evidence SET state = CASE WHEN p_decision = 'attest' THEN 'attested' ELSE 'rejected' END, decided_by = p_actor, decided_at = clock_timestamp(),
         decision_reason = btrim(p_reason), signature_id = CASE WHEN p_decision = 'attest' THEN p_signature END WHERE record_id = p_record RETURNING * INTO r;
  PERFORM governance.ledger(p_tenant, p_domain, 'responsibility_evidence', p_record, 1, CASE WHEN p_decision = 'attest' THEN 'evidence.attested' ELSE 'evidence.rejected' END, p_actor,
                            jsonb_build_object('digest', r.digest, 'reason', btrim(p_reason), 'signature_id', r.signature_id, 'claim', r.claim), p_correlation);
  RETURN to_jsonb(r) - 'scope' - 'correlation_id';
END $$;
REVOKE ALL ON FUNCTION governance.dr_attest_evidence(uuid, uuid, uuid, text, text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dr_attest_evidence(uuid, uuid, uuid, text, text, text, uuid, uuid, uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §DR.8 THE READS (definer reads guarded by the caller's bound scope — N-01)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/* THE DATA PRODUCT REGISTRY VIEW (DAT-GV-03): every product of the domain — purpose, contracts, consumers, SLOs (declared and the latest
   observation per measure), cost, lifecycle — with its GOVERNANCE: the catalog entry's ratified authority (owner, steward), its trust, the
   open gaps and the holds that stop new consumption. Read over products.* (B90), never written. */
CREATE OR REPLACE FUNCTION governance.dr_products(p_tenant uuid, p_domain uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = governance, products, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the data product registry');
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
      'product_id', p.product_id, 'product_key', p.product_key, 'title', p.title, 'kind', p.kind, 'purpose', p.purpose, 'state', p.state, 'released_version', p.released_version,
      'degraded_reason', p.degraded_reason, 'owner', p.owner_principal_id, 'owner_name', governance.dr_name(p.owner_principal_id),
      'contract', coalesce(p.declaration -> 'contract', '{}'::jsonb), 'serving_modes', coalesce(p.declaration -> 'serving_modes', '[]'::jsonb),
      'slo', jsonb_build_object('declared', coalesce(p.declaration -> 'slo', '{}'::jsonb),
                                'observed', coalesce((SELECT jsonb_object_agg(o.measure, jsonb_build_object('value', o.value, 'threshold', o.threshold, 'met', o.met, 'observed_at', o.observed_at))
                                                        FROM (SELECT DISTINCT ON (x.measure) x.* FROM products.slo_observations x WHERE x.product_id = p.product_id ORDER BY x.measure, x.observed_at DESC) o), '{}'::jsonb)),
      'consumers', (SELECT jsonb_build_object('registered', count(*) FILTER (WHERE c.state = 'registered'), 'accepted', count(*) FILTER (WHERE c.state = 'accepted'), 'revoked', count(*) FILTER (WHERE c.state = 'revoked'))
                      FROM products.product_consumers c WHERE c.product_id = p.product_id),
      'cost', (SELECT jsonb_build_object('amount', k.amount::text, 'currency', k.currency, 'period_start', k.period_start, 'period_end', k.period_end)
                 FROM products.cost_attributions k WHERE k.product_id = p.product_id ORDER BY k.period_end DESC, k.attributed_at DESC LIMIT 1),
      'scorecard', (SELECT jsonb_build_object('overall', s.overall, 'computed_at', s.computed_at, 'attainment_pct', s.attainment_pct) FROM products.scorecards s WHERE s.product_id = p.product_id ORDER BY s.computed_at DESC LIMIT 1),
      'governance', (SELECT jsonb_build_object('asset_id', a.asset_id, 'trusted', a.trusted, 'discoverable', a.discoverable,
                                               'authority', (SELECT jsonb_build_object('version', r.version, 'owner', r.owner_principal_id, 'owner_name', governance.dr_name(r.owner_principal_id),
                                                                                       'steward', r.steward_principal_id, 'steward_name', governance.dr_name(r.steward_principal_id), 'recertify_by', r.recertify_by)
                                                              FROM governance.data_authorities r WHERE r.authority_id = a.asset_id AND r.state = 'ratified'),
                                               'gaps', (SELECT count(*) FROM governance.ownership_gaps g WHERE g.subject_id = a.asset_id AND g.state IN ('open', 'escalated')),
                                               'holds', governance.dr_consumption_holds(a.asset_id) || governance.dr_consumption_holds(p.product_id))
                       FROM products.catalog_assets a WHERE a.tenant_id = p.tenant_id AND a.domain_id = p.domain_id AND a.kind = 'product' AND a.ref = p.product_id::text))
    ORDER BY p.product_key) FROM products.products_current p WHERE p.tenant_id = p_tenant AND p.domain_id = p_domain), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION governance.dr_products(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dr_products(uuid, uuid) TO eye_app, eye_commit;

/* THE RESPONSIBILITY PORTAL's database half (DAT-GV-10, PER-19): the CUSTOMER's duties (B94's approved matrix rows with their live owner
   resolution, the domain's registry entry, every catalog asset's authority state) and the PLATFORM's (component ownerships — team,
   contacts, operator role, owned contracts — and the data capabilities' owners; a platform operator inspects customer content only under an
   approved support purpose: B94's service.live_grant), the approvals (ratifications, acceptances, decisions — the ledger), the evidence
   records, the escalations (open gaps, escalated undecided cases). Nothing inferred: an undeclared duty reads undeclared. */
CREATE OR REPLACE FUNCTION governance.dr_portal(p_tenant uuid, p_domain uuid, p_profile text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = governance, service, products, tenancy, public, pg_catalog, pg_temp AS $$
DECLARE m service.responsibility_matrices%ROWTYPE;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the responsibility portal');
  SELECT * INTO m FROM service.responsibility_matrices x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.deployment_profile = coalesce(p_profile, 'local-dev') AND x.state = 'approved';
  RETURN jsonb_build_object(
    'at', clock_timestamp(), 'profile', coalesce(p_profile, 'local-dev'),
    'domain', (SELECT jsonb_build_object('domain_id', d.id, 'name', d.name, 'status', d.status, 'governance_mode', governance.dr_domain_mode(d.id),
                                         'registry', (SELECT (to_jsonb(r) - 'scope' - 'correlation_id') || jsonb_build_object('leader_name', governance.dr_name(r.accountable_leader))
                                                        FROM governance.domain_registry r WHERE r.domain_id = d.id AND r.state = 'ratified'),
                                         'proposal', (SELECT (to_jsonb(r) - 'scope' - 'correlation_id') || jsonb_build_object('leader_name', governance.dr_name(r.accountable_leader))
                                                        FROM governance.domain_registry r WHERE r.domain_id = d.id AND r.state = 'proposed'))
                 FROM tenancy.domains d WHERE d.id = p_domain AND d.tenant_id = p_tenant),
    'customer_duties', jsonb_build_object(
       'matrix', CASE WHEN m.matrix_id IS NULL THEN jsonb_build_object('state', 'undeclared', 'reason', 'no approved responsibility matrix for this profile (B94 §SA)')
                      ELSE jsonb_build_object('state', 'approved', 'matrix_id', m.matrix_id, 'version', m.version, 'digest', m.digest, 'signature_id', m.signature_id) END,
       'responsibilities', CASE WHEN m.matrix_id IS NULL THEN '[]'::jsonb ELSE
         (SELECT coalesce(jsonb_agg(jsonb_build_object('key', rr.responsibility_key, 'title', rr.title, 'owner_role', rr.owner_role, 'operator_role', rr.operator_role, 'customer_authority', rr.customer_authority,
                                                       'escalation_path', rr.escalation_path, 'resolution', service.owner_resolution(p_tenant, p_domain, rr.responsibility_key, coalesce(p_profile, 'local-dev')))
                                    ORDER BY rr.responsibility_key), '[]'::jsonb)
            FROM service.responsibility_rows rr WHERE rr.matrix_id = m.matrix_id AND rr.version = m.version) END,
       'data_authorities', (SELECT coalesce(jsonb_agg(jsonb_build_object('asset_id', a.asset_id, 'kind', a.kind, 'ref', a.ref, 'title', a.title,
                                                    'state', CASE WHEN r.authority_id IS NOT NULL THEN 'ratified' WHEN pr.authority_id IS NOT NULL THEN 'proposed' ELSE 'undeclared' END,
                                                    'version', coalesce(r.version, pr.version), 'owner', r.owner_principal_id, 'owner_name', governance.dr_name(r.owner_principal_id),
                                                    'steward', r.steward_principal_id, 'steward_name', governance.dr_name(r.steward_principal_id), 'escalation_path', r.escalation_path,
                                                    'recertify_by', r.recertify_by, 'recertification', CASE WHEN r.recertify_by IS NULL THEN NULL WHEN r.recertify_by < clock_timestamp() THEN 'lapsed' ELSE 'current' END,
                                                    'proposal_digest', pr.digest, 'proposal_owner', pr.owner_principal_id, 'proposal_owner_accepted', pr.owner_accepted_at IS NOT NULL,
                                                    'proposed_by', pr.proposed_by, 'gaps', (SELECT count(*) FROM governance.ownership_gaps g WHERE g.subject_id = a.asset_id AND g.state IN ('open', 'escalated')))
                                                  ORDER BY (r.authority_id IS NULL AND pr.authority_id IS NULL), a.kind, a.title), '[]'::jsonb)
                              FROM products.catalog_assets a
                              LEFT JOIN governance.data_authorities r ON r.authority_id = a.asset_id AND r.state = 'ratified'
                              LEFT JOIN governance.data_authorities pr ON pr.authority_id = a.asset_id AND pr.state = 'proposed'
                             WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain)),
    'platform_duties', jsonb_build_object(
       'components', (SELECT coalesce(jsonb_agg(jsonb_build_object('component', o.component_key, 'kind', o.component_kind, 'owning_team', o.owning_team, 'version', o.version,
                                    'accountable_name', governance.dr_name(o.accountable_principal_id), 'primary_name', governance.dr_name(o.primary_contact), 'secondary_name', governance.dr_name(o.secondary_contact),
                                    'operator_role', o.operator_role, 'owned_contracts', to_jsonb(o.owned_contracts), 'failure_domain', o.failure_domain) ORDER BY o.component_key), '[]'::jsonb)
                        FROM governance.component_ownerships o WHERE o.superseded_at IS NULL),
       'capabilities', (SELECT coalesce(jsonb_agg(jsonb_build_object('dat_key', c.dat_key, 'title', c.title, 'owner_name', governance.dr_name(c.owner_principal_id), 'owner_role', c.owner_role,
                                    'conformance', c.conformance, 'admission', c.admission) ORDER BY c.dat_key), '[]'::jsonb)
                          FROM governance.data_capabilities c WHERE c.superseded_at IS NULL),
       'operator_rule', 'PER-19: a platform operator operates availability, capacity, change and recovery; it inspects customer content only under an approved support purpose — B94''s support grant, checked live (service.live_grant) in every port, every attempt logged; this portal shows duties, never the customer''s content'),
    'approvals', (SELECT coalesce(jsonb_agg(jsonb_build_object('event', e.event, 'subject_kind', e.subject_kind, 'subject_id', e.subject_id, 'version', e.version, 'actor', e.actor_principal_id,
                                                               'actor_name', governance.dr_name(e.actor_principal_id), 'at', e.occurred_at) ORDER BY e.occurred_at DESC), '[]'::jsonb)
                    FROM (SELECT * FROM governance.events x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain
                             AND x.event IN ('authority.owner_accepted', 'authority.ratified', 'authority.rejected', 'authority.recertified', 'domain.ratified', 'gap.accepted', 'case.decided',
                                             'evidence.attested', 'evidence.rejected') ORDER BY x.occurred_at DESC LIMIT 50) e),
    'evidence', (SELECT coalesce(jsonb_agg(jsonb_build_object('record_id', r.record_id, 'state', r.state, 'period_from', r.period_from, 'period_to', r.period_to, 'digest', r.digest, 'claim', r.claim,
                                                              'production_admission', r.production_admission, 'assembled_at', r.assembled_at, 'decided_by_name', governance.dr_name(r.decided_by),
                                                              'signature_id', r.signature_id) ORDER BY r.assembled_at DESC), '[]'::jsonb)
                   FROM governance.responsibility_evidence r WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain),
    'escalations', jsonb_build_object(
       'gaps', (SELECT coalesce(jsonb_agg(jsonb_build_object('gap_id', g.gap_id, 'gap_kind', g.gap_kind, 'subject', g.subject_label, 'state', g.state, 'escalations', g.escalations,
                                                             'escalation_path', g.escalation_path, 'held', g.held, 'opened_at', g.opened_at) ORDER BY g.opened_at), '[]'::jsonb)
                  FROM governance.ownership_gaps g WHERE g.tenant_id = p_tenant AND g.domain_id = p_domain AND g.state IN ('open', 'escalated')),
       'cases', (SELECT coalesce(jsonb_agg(jsonb_build_object('case_ref', c.case_ref, 'kind', c.kind, 'consequence', c.consequence, 'escalation_level', c.escalation_level, 'due_at', c.due_at, 'title', c.title)
                                           ORDER BY c.due_at), '[]'::jsonb)
                   FROM governance.stewardship_cases c WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.state IN ('open', 'in_review') AND c.escalation_level > 0)));
END $$;
REVOKE ALL ON FUNCTION governance.dr_portal(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dr_portal(uuid, uuid, text) TO eye_app, eye_commit;

REVOKE ALL ON FUNCTION governance.dr_resolve(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dr_resolve(uuid, uuid, uuid) TO eye_app, eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §DR.9 THE CARRIED B90 RESIDUALS (CP6_BATCHES §B90.9 #5)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- (a) DP-49-006 — THE LINEAGE-RETIREMENT PORT. The catalog ledger's vocabulary (0095 §K.2's list, copied whole) plus `lineage.retired` — B107 dr.
ALTER TABLE products.catalog_events DROP CONSTRAINT IF EXISTS catalog_events_event_check;
ALTER TABLE products.catalog_events ADD CONSTRAINT catalog_events_event_check CHECK (event IN (
  'asset.catalogued', 'asset.owner_set', 'asset.flagged', 'asset.flag_cleared', 'asset.reconciled', 'asset.recertified',
  'lineage.declared', 'term.defined', 'term.redefined', 'catalog.reconciled',
  -- B107 dr (0115 §DR.9)
  'lineage.retired'));

/* RETIRE A LINEAGE EDGE (products.catalog.lineage.retire): the steward's act, or either asset's owner's (as its declaration is) — the edge
   retired ONCE with its reason (the trigger of 0095 admits the retirement triple only), the RETIREMENT EVIDENCE on the catalog ledger
   (lineage.retired: the edge, its ends, the reason, the evidence the caller cites). Nothing is inferred from the retirement: lineage_missing
   and orphan are the next reconciliation's to find. */
CREATE OR REPLACE FUNCTION products.retire_lineage(p_edge_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_evidence jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE e products.lineage_edges%ROWTYPE; f products.catalog_assets%ROWTYPE; t products.catalog_assets%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.catalog.lineage.retire']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'lineage rejected (actor): retired by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO e FROM products.lineage_edges x WHERE x.edge_id = p_edge_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'lineage rejected (unknown_edge): % is not a lineage edge of this domain', p_edge_id USING ERRCODE = '22023'; END IF;
  SELECT * INTO f FROM products.catalog_assets x WHERE x.asset_id = e.from_asset_id;
  SELECT * INTO t FROM products.catalog_assets x WHERE x.asset_id = e.to_asset_id;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['data_steward', 'domain_admin', 'platform_admin']) AND f.owner_principal_id IS DISTINCT FROM p_actor AND t.owner_principal_id IS DISTINCT FROM p_actor THEN
    RAISE EXCEPTION 'lineage rejected (authority): lineage is retired by a data steward or by the owner of either asset' USING ERRCODE = '42501';
  END IF;
  IF e.retired_at IS NOT NULL THEN RAISE EXCEPTION 'lineage rejected (state): edge % was retired at % (%) — a retirement is set once', p_edge_id, e.retired_at, e.retirement_reason USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'lineage rejected (reason): a retirement says why (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_evidence IS NOT NULL AND jsonb_typeof(p_evidence) <> 'object' THEN RAISE EXCEPTION 'lineage rejected (evidence): the retirement evidence is an object' USING ERRCODE = '22023'; END IF;
  UPDATE products.lineage_edges SET retired_at = clock_timestamp(), retired_by = p_actor, retirement_reason = btrim(p_reason) WHERE edge_id = p_edge_id RETURNING * INTO e;
  PERFORM products.catalog_event(e.from_asset_id, p_tenant, p_domain, 'lineage.retired', p_actor,
            jsonb_build_object('edge_id', e.edge_id, 'from_asset_id', e.from_asset_id, 'to_asset_id', e.to_asset_id, 'kind', e.kind, 'declared_at', e.declared_at, 'reason', btrim(p_reason),
                               'evidence', coalesce(p_evidence, '{}'::jsonb), 'note', 'retirement evidence (DP-49-006); lineage coverage is the next reconciliation''s to judge'), p_correlation);
  RETURN (to_jsonb(e) - 'scope' - 'correlation_id') || jsonb_build_object('from_title', f.title, 'from_kind', f.kind, 'from_ref', f.ref, 'to_title', t.title, 'to_kind', t.kind, 'to_ref', t.ref);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.retire_lineage(uuid, uuid, uuid, text, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.retire_lineage(uuid, uuid, uuid, text, jsonb, uuid, uuid) TO eye_commit;

-- (b) DP-49-005 — catalog_trust consulted by subscription registration and metric serving; (c) DP-41-005 — the degradation's declared cause.
/* B107 dr — re-declared WHOLE from 0095 §E.3 (its last definition); the changes are marked `B107 dr`.
   REGISTER A SUBSCRIPTION (products.subscription.register): the consumer's own act (or a steward's for a named consumer) on a RELEASED
   event product, under the AUTHORITY BOUNDARY — the consumer a named, active human of THIS tenant; the purpose one of the product's policy
   purposes; the granted fields a subset of the schema's; the time window instants or null; the consequence class named; the filters
   (event_kinds, ordering_keys, subject_ids, subject_kinds); the accepted schema version the product's current; the lag policy
   {max_lag_events, max_lag_seconds}; whether corrections and replays can be processed. Opens `registered`; the owner authorizes. */
CREATE OR REPLACE FUNCTION products.register_subscription(
  p_subscription_id uuid, p_product_id uuid, p_tenant uuid, p_domain uuid, p_consumer uuid, p_purpose text, p_granted jsonb, p_filters jsonb, p_schema_version text, p_lag_policy jsonb,
  p_handles_corrections boolean, p_handles_replays boolean, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r products.products_current%ROWTYPE; ep products.event_products%ROWTYPE; s products.event_subscriptions%ROWTYPE; c identity.principals%ROWTYPE; e jsonb; v_from timestamptz; v_to timestamptz; k text;
        v_trust jsonb; v_holds jsonb;   -- B107 dr
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.subscription.register']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'subscription rejected (actor): registered by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_consumer IS DISTINCT FROM p_actor AND NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['data_steward', 'domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'subscription rejected (authority): a subscription is registered by its consumer, or by a data steward for a named consumer' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO c FROM identity.principals x WHERE x.id = p_consumer;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription rejected (unknown_consumer): % is not a principal', p_consumer USING ERRCODE = '22023'; END IF;
  IF c.tenant_id IS DISTINCT FROM p_tenant OR c.kind <> 'human' OR c.status <> 'active' THEN
    RAISE EXCEPTION 'subscription rejected (authority): the authority boundary (DP-43-002) — a subscription is granted to a named, active human of this tenant; % is not one', p_consumer USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = p_product_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription rejected (unknown_product): % is not a product of this domain', p_product_id USING ERRCODE = '22023'; END IF;
  IF r.kind <> 'event' THEN RAISE EXCEPTION 'subscription rejected (kind): product % is of kind %; a subscription is on an event product', r.product_key, r.kind USING ERRCODE = '22023'; END IF;
  IF r.state NOT IN ('released', 'degraded') THEN RAISE EXCEPTION 'subscription rejected (state): product % is %; a subscription is registered on a released event product', r.product_key, r.state USING ERRCODE = '22023'; END IF;
  -- B107 dr (0115 §DR.9; DP-49-005): THE STOP OF NEW CONSUMPTION, wired — the product's catalog entry is consulted (catalog_trust: untrusted or
  -- undiscoverable stops a new subscription; an entry the catalog does not know is coverage debt, recorded on the event, not refused), and so
  -- are the governance holds on the product and its catalog entry (an ownership gap, an expired data exception, a conflict, a stewardship
  -- decision past its SLA — B107 §DR). Existing subscriptions are untouched (the stop is of NEW consumption).
  v_trust := products.catalog_trust('product', p_product_id::text);
  v_holds := governance.dr_consumption_holds(p_product_id) || CASE WHEN (v_trust ->> 'known')::boolean THEN governance.dr_consumption_holds((v_trust ->> 'asset_id')::uuid) ELSE '[]'::jsonb END;
  IF (v_trust ->> 'known')::boolean AND NOT ((v_trust ->> 'trusted')::boolean AND (v_trust ->> 'discoverable')::boolean) THEN
    RAISE EXCEPTION 'subscription rejected (state): product % is % in the catalog (flags: %) — new consumption stops until the catalog trusts it again (DP-49-005)', r.product_key,
      CASE WHEN NOT (v_trust ->> 'discoverable')::boolean THEN 'undiscoverable' ELSE 'untrusted' END,
      coalesce((SELECT string_agg(f ->> 'kind', ', ') FROM jsonb_array_elements(v_trust -> 'flags') f), 'none') USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(v_holds) > 0 THEN
    RAISE EXCEPTION 'subscription rejected (state): product % is held by governance (%) — new consumption stops until the hold is lifted (DP-49-005, DP-04-005)', r.product_key,
      (SELECT string_agg(DISTINCT h ->> 'reason_kind', ', ') FROM jsonb_array_elements(v_holds) h) USING ERRCODE = '22023';
  END IF;
  -- end B107 dr
  SELECT * INTO ep FROM products.event_products x WHERE x.product_id = p_product_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription rejected (state): product % has no event declaration', r.product_key USING ERRCODE = '22023'; END IF;
  IF p_purpose IS NULL OR length(btrim(p_purpose)) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'subscription rejected (purpose): a subscription states its purpose' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(r.declaration #> '{policy,purposes}', '[]'::jsonb)) p WHERE p = btrim(p_purpose)) THEN
    RAISE EXCEPTION 'subscription rejected (purpose): purpose % is outside the product''s policy purposes (%)', btrim(p_purpose), (SELECT string_agg(p, ', ') FROM jsonb_array_elements_text(coalesce(r.declaration #> '{policy,purposes}', '[]'::jsonb)) p) USING ERRCODE = '22023';
  END IF;
  -- the DATA scope: fields ⊆ the schema's
  IF p_granted IS NULL OR jsonb_typeof(p_granted) <> 'object' OR jsonb_typeof(p_granted -> 'fields') <> 'array' OR jsonb_array_length(p_granted -> 'fields') = 0 THEN
    RAISE EXCEPTION 'subscription rejected (fields): the grant names the fields it needs (a non-empty subset of the schema''s: %)', array_to_string(ep.schema_fields, ', ') USING ERRCODE = '22023';
  END IF;
  FOR e IN SELECT x FROM jsonb_array_elements(p_granted -> 'fields') x LOOP
    IF jsonb_typeof(e) <> 'string' OR (e #>> '{}') <> ALL (ep.schema_fields) THEN
      RAISE EXCEPTION 'subscription rejected (fields): % is not a field of schema % (%); a subscription grants only declared data', e, ep.schema_version, array_to_string(ep.schema_fields, ', ') USING ERRCODE = '22023';
    END IF;
  END LOOP;
  -- the CONSEQUENCE class and the TIME window
  IF jsonb_typeof(p_granted -> 'consequence') <> 'string' OR (p_granted ->> 'consequence') NOT IN ('C0', 'C1', 'C2', 'C3', 'C4') THEN
    RAISE EXCEPTION 'subscription rejected (consequence): the grant names the consequence class the consumer may act on (C0..C4)' USING ERRCODE = '22023';
  END IF;
  BEGIN
    v_from := CASE WHEN jsonb_typeof(p_granted -> 'from') = 'string' THEN (p_granted ->> 'from')::timestamptz ELSE NULL END;
    v_to := CASE WHEN jsonb_typeof(p_granted -> 'to') = 'string' THEN (p_granted ->> 'to')::timestamptz ELSE NULL END;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'subscription rejected (window): the time window''s from and to are instants or null' USING ERRCODE = '22023'; END;
  IF (p_granted ? 'from' AND jsonb_typeof(p_granted -> 'from') NOT IN ('string', 'null')) OR (p_granted ? 'to' AND jsonb_typeof(p_granted -> 'to') NOT IN ('string', 'null')) OR (v_from IS NOT NULL AND v_to IS NOT NULL AND v_from >= v_to) THEN
    RAISE EXCEPTION 'subscription rejected (window): the time window''s from and to are instants or null, from before to' USING ERRCODE = '22023';
  END IF;
  -- the FILTERS
  IF p_filters IS NOT NULL AND jsonb_typeof(p_filters) <> 'object' THEN RAISE EXCEPTION 'subscription rejected (filters): the filters are an object {event_kinds?, ordering_keys?, subject_ids?, subject_kinds?}' USING ERRCODE = '22023'; END IF;
  FOR k IN SELECT jsonb_object_keys(coalesce(p_filters, '{}'::jsonb)) LOOP
    IF k NOT IN ('event_kinds', 'ordering_keys', 'subject_ids', 'subject_kinds') OR jsonb_typeof(p_filters -> k) <> 'array' THEN
      RAISE EXCEPTION 'subscription rejected (filters): % is not a filter (event_kinds, ordering_keys, subject_ids, subject_kinds — each an array)', k USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(p_filters -> 'event_kinds', '[]'::jsonb)) x WHERE x <> ALL (products.event_kinds())) THEN
    RAISE EXCEPTION 'subscription rejected (filters): an event kind filter names change, signal, correction, lifecycle, quality or strategic' USING ERRCODE = '22023';
  END IF;
  -- the SCHEMA version accepted, the LAG policy, the capabilities
  IF p_schema_version IS DISTINCT FROM ep.schema_version THEN
    RAISE EXCEPTION 'subscription rejected (schema): product % serves schema version %; a subscription accepts the current version (% was named)', r.product_key, ep.schema_version, coalesce(p_schema_version, 'null') USING ERRCODE = '22023';
  END IF;
  IF p_lag_policy IS NULL OR jsonb_typeof(p_lag_policy) <> 'object'
     OR jsonb_typeof(p_lag_policy -> 'max_lag_events') <> 'number' OR (p_lag_policy ->> 'max_lag_events') !~ '^[0-9]+$' OR (p_lag_policy ->> 'max_lag_events')::bigint < 1
     OR jsonb_typeof(p_lag_policy -> 'max_lag_seconds') <> 'number' OR (p_lag_policy ->> 'max_lag_seconds') !~ '^[0-9]+$' OR (p_lag_policy ->> 'max_lag_seconds')::bigint < 1 THEN
    RAISE EXCEPTION 'subscription rejected (lag_policy): the lag policy names max_lag_events and max_lag_seconds (whole numbers ≥ 1)' USING ERRCODE = '22023';
  END IF;
  IF p_handles_corrections IS NULL OR p_handles_replays IS NULL THEN RAISE EXCEPTION 'subscription rejected (capability): a subscription declares whether it can process corrections and replays' USING ERRCODE = '22023'; END IF;
  INSERT INTO products.event_subscriptions (subscription_id, product_id, tenant_id, domain_id, consumer_principal_id, consumer_domain_id, purpose, granted, filters, schema_version, lag_policy,
                                            handles_corrections, handles_replays, registered_by, correlation_id)
  VALUES (p_subscription_id, p_product_id, p_tenant, p_domain, p_consumer, coalesce(c.domain_id, p_domain), btrim(p_purpose),
          jsonb_build_object('fields', p_granted -> 'fields', 'consequence', p_granted ->> 'consequence', 'from', v_from, 'to', v_to),
          coalesce(p_filters, '{}'::jsonb), p_schema_version, jsonb_build_object('max_lag_events', (p_lag_policy ->> 'max_lag_events')::bigint, 'max_lag_seconds', (p_lag_policy ->> 'max_lag_seconds')::bigint),
          p_handles_corrections, p_handles_replays, p_actor, p_correlation) RETURNING * INTO s;
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_product_id, 'subscription.registered', p_actor,
          jsonb_build_object('subscription_id', p_subscription_id, 'consumer', p_consumer, 'purpose', btrim(p_purpose), 'fields', p_granted -> 'fields', 'consequence', p_granted ->> 'consequence', 'schema_version', p_schema_version)
          || jsonb_build_object('catalog_trust', v_trust - 'flags'), p_correlation);   -- B107 dr: the trust read consulted, recorded
  RETURN products.subscription_json(s);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.register_subscription(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,text,jsonb,boolean,boolean,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.register_subscription(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,text,jsonb,boolean,boolean,uuid,uuid,uuid) TO eye_commit;

/* B107 dr — re-declared WHOLE from 0095 §M.5 (its last definition); the changes are marked `B107 dr`.
   SERVE (products.metric.serve; DAT-SV-04): the model by key; the version EFFECTIVE at the instant (the database's when none is given); the
   grain the model's or an override among the measure's grains; the filters the model's plus the caller's on the declared dimensions; the
   measure computed and answered per grain key WITH the grain, the unit, the version and digest, the SOURCE REVISION, the certification
   standing and expiry, the effective time, the instant. The EXECUTIVE view refuses an uncertified, withdrawn or expired model — dashboards
   are access modes; the ANALYST view serves it MARKED. Every serving is recorded; freshness_seconds is observed on the product. */
CREATE OR REPLACE FUNCTION products.serve_metric(
  p_serving_id uuid, p_tenant uuid, p_domain uuid, p_metric_key text, p_grain text, p_filters jsonb, p_as_of timestamptz, p_view text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE m products.semantic_models%ROWTYPE; r products.products_current%ROWTYPE; pv products.metric_versions%ROWTYPE; c products.metric_certifications%ROWTYPE;
        v_spec jsonb; v_grain text; v_filters jsonb; v_as_of timestamptz; v_now timestamptz := clock_timestamp(); v_certified boolean; k text;
        v_rows jsonb; v_revision text; v_n int; v_newest timestamptz; v_digest text; v_fresh numeric; v_threshold numeric; v_standing text;
        v_trust jsonb; v_holds jsonb; v_stopped text;   -- B107 dr
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.metric.serve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'metric rejected (actor): served to the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_view IS NULL OR p_view NOT IN ('executive', 'analyst') THEN RAISE EXCEPTION 'metric rejected (view): a metric is served in the executive or the analyst view' USING ERRCODE = '22023'; END IF;
  SELECT * INTO m FROM products.semantic_models x WHERE x.metric_key = p_metric_key AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'metric rejected (unknown_metric): % is not a semantic model of this domain', coalesce(p_metric_key, 'null') USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = m.model_id;
  IF r.state IN ('withdrawn', 'retired') THEN RAISE EXCEPTION 'metric rejected (state): product % is %; nothing is served from it', r.product_key, r.state USING ERRCODE = '22023'; END IF;
  -- B107 dr (0115 §DR.9; DP-49-005): THE STOP OF NEW CONSUMPTION, wired — the metric product's catalog entry (catalog_trust) and its governance
  -- holds: the EXECUTIVE view refuses an untrusted, undiscoverable or held metric (a basis for an executive report must be trusted); the
  -- ANALYST view serves it MARKED. An entry the catalog does not know is coverage debt: served, said.
  v_trust := products.catalog_trust('product', m.model_id::text);
  v_holds := governance.dr_consumption_holds(m.model_id) || CASE WHEN (v_trust ->> 'known')::boolean THEN governance.dr_consumption_holds((v_trust ->> 'asset_id')::uuid) ELSE '[]'::jsonb END;
  v_stopped := CASE WHEN (v_trust ->> 'known')::boolean AND NOT (v_trust ->> 'discoverable')::boolean THEN 'undiscoverable in the catalog'
                    WHEN (v_trust ->> 'known')::boolean AND NOT (v_trust ->> 'trusted')::boolean THEN 'untrusted in the catalog'
                    WHEN jsonb_array_length(v_holds) > 0 THEN 'held by governance (' || (SELECT string_agg(DISTINCT h ->> 'reason_kind', ', ') FROM jsonb_array_elements(v_holds) h) || ')' END;
  IF p_view = 'executive' AND v_stopped IS NOT NULL THEN
    RAISE EXCEPTION 'metric rejected (state): metric % is % — the executive view stops new consumption of it (DP-49-005); the analyst view serves it marked', m.metric_key, v_stopped USING ERRCODE = '22023';
  END IF;
  -- end B107 dr
  v_as_of := date_trunc('milliseconds', coalesce(p_as_of, v_now));   -- millisecond precision: the instant round-trips through a caller's ISO 8601 string
  IF v_as_of > v_now THEN RAISE EXCEPTION 'metric rejected (as_of): the instant is not in the future (asked %, now %)', v_as_of, v_now USING ERRCODE = '22023'; END IF;
  SELECT * INTO pv FROM products.metric_versions x WHERE x.model_id = m.model_id AND x.effective_from <= v_as_of ORDER BY x.effective_from DESC, x.version DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'metric rejected (effective): no definition of metric % is effective at % (the first is effective from %)', m.metric_key, v_as_of, m.effective_from USING ERRCODE = '22023'; END IF;
  SELECT * INTO c FROM products.metric_certifications x WHERE x.model_id = m.model_id AND x.state = 'active' ORDER BY x.certified_at DESC LIMIT 1;
  v_certified := m.state = 'certified' AND c.certification_id IS NOT NULL AND c.version = pv.version AND c.expires_at > v_now;
  v_standing := CASE WHEN v_certified THEN 'certified' WHEN m.state = 'certified' AND c.version <> pv.version THEN 'certified at another version (' || c.version || '); version ' || pv.version || ' is effective at the instant'
                     WHEN m.state = 'certified' THEN 'certification past its expiry (' || c.expires_at || '), not yet swept' ELSE m.state END;
  IF p_view = 'executive' AND NOT v_certified THEN
    RAISE EXCEPTION 'metric rejected (certification): metric % is % — the executive view serves certified metrics only (dashboards are access modes); the analyst view serves it marked uncertified', m.metric_key, v_standing USING ERRCODE = '22023';
  END IF;
  v_spec := products.metric_measures() -> (pv.definition ->> 'measure');
  v_grain := coalesce(p_grain, pv.definition ->> 'grain');
  IF NOT (v_spec -> 'grains' ? v_grain) THEN
    RAISE EXCEPTION 'metric rejected (grain): measure % allows the grains %; % is not among them', pv.definition ->> 'measure', (SELECT string_agg(x, ', ') FROM jsonb_array_elements_text(v_spec -> 'grains') x), v_grain USING ERRCODE = '22023';
  END IF;
  IF p_filters IS NOT NULL AND jsonb_typeof(p_filters) <> 'object' THEN RAISE EXCEPTION 'metric rejected (filter): filters are an object of dimension → value' USING ERRCODE = '22023'; END IF;
  FOR k IN SELECT x FROM jsonb_object_keys(coalesce(p_filters, '{}'::jsonb)) x LOOP
    IF NOT (pv.definition -> 'dimensions' ? k) THEN RAISE EXCEPTION 'metric rejected (filter): filter % is not a dimension of metric % (%)', k, m.metric_key, (SELECT string_agg(x, ', ') FROM jsonb_array_elements_text(pv.definition -> 'dimensions') x) USING ERRCODE = '22023'; END IF;
    IF jsonb_typeof(p_filters -> k) NOT IN ('string', 'number', 'boolean') THEN RAISE EXCEPTION 'metric rejected (filter): filter % is a scalar value', k USING ERRCODE = '22023'; END IF;
  END LOOP;
  v_filters := (pv.definition -> 'filters') || coalesce(p_filters, '{}'::jsonb);
  CASE pv.definition ->> 'measure'
    WHEN 'measure_observations' THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object('grain_key', x.grain_key, 'value', x.value) ORDER BY x.grain_key), '[]'::jsonb), max(x.source_revision), max(x.source_rows), max(x.source_newest_at)
        INTO v_rows, v_revision, v_n, v_newest FROM products.measure_measure_observations(p_tenant, p_domain, v_grain, v_filters, v_as_of, pv.definition ->> 'aggregation') x;
    WHEN 'health_score' THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object('grain_key', x.grain_key, 'value', x.value) ORDER BY x.grain_key), '[]'::jsonb), max(x.source_revision), max(x.source_rows), max(x.source_newest_at)
        INTO v_rows, v_revision, v_n, v_newest FROM products.measure_health_score(p_tenant, p_domain, v_grain, v_filters, v_as_of, pv.definition ->> 'aggregation') x;
    WHEN 'exposure_eur_at_risk' THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object('grain_key', x.grain_key, 'value', x.value) ORDER BY x.grain_key), '[]'::jsonb), max(x.source_revision), max(x.source_rows), max(x.source_newest_at)
        INTO v_rows, v_revision, v_n, v_newest FROM products.measure_exposure_eur_at_risk(p_tenant, p_domain, v_grain, v_filters, v_as_of, pv.definition ->> 'aggregation') x;
    ELSE RAISE EXCEPTION 'metric rejected (measure): % is not a whitelisted measure', pv.definition ->> 'measure' USING ERRCODE = '22023';
  END CASE;
  -- an empty result set still has a revision (the sha256 of nothing read) and no freshness
  IF v_revision IS NULL THEN v_revision := encode(digest('', 'sha256'), 'hex'); v_n := 0; END IF;
  v_digest := encode(digest(v_rows::text, 'sha256'), 'hex');
  INSERT INTO products.metric_servings (serving_id, model_id, tenant_id, domain_id, version, view, grain, filters, as_of, certified, source_revision, source_rows, value_digest, result, served_to, served_at, correlation_id)
  VALUES (p_serving_id, m.model_id, p_tenant, p_domain, pv.version, p_view, v_grain, v_filters, v_as_of, v_certified, v_revision, v_n, v_digest, v_rows, p_actor, v_now, p_correlation);
  IF v_newest IS NOT NULL THEN
    v_fresh := extract(epoch FROM (v_now - v_newest));
    v_threshold := CASE WHEN jsonb_typeof(r.declaration #> '{slo,freshness_seconds}') = 'number' THEN (r.declaration #>> '{slo,freshness_seconds}')::numeric ELSE NULL END;
    PERFORM products.observe_slo(gen_random_uuid(), m.model_id, p_tenant, p_domain, 'freshness_seconds', v_fresh, v_threshold, v_threshold IS NULL OR v_fresh <= v_threshold, 'metric serve (§M)',
                                 jsonb_build_object('serving_id', p_serving_id, 'view', p_view, 'grain', v_grain, 'as_of', v_as_of, 'source_newest_at', v_newest), p_actor, p_correlation);
  END IF;
  RETURN jsonb_build_object(
    'serving_id', p_serving_id, 'model_id', m.model_id, 'metric_key', m.metric_key, 'title', m.title, 'view', p_view,
    'version', pv.version, 'digest', pv.digest, 'effective_from', pv.effective_from, 'measure', pv.definition ->> 'measure', 'unit', pv.definition ->> 'unit', 'aggregation', pv.definition ->> 'aggregation',
    'grain', v_grain, 'filters', v_filters, 'as_of', v_as_of, 'served_at', v_now,
    'certified', v_certified, 'certification_standing', v_standing,
    'certification', CASE WHEN c.certification_id IS NULL THEN NULL ELSE jsonb_build_object('certification_id', c.certification_id, 'version', c.version, 'certified_by', c.certified_by, 'certified_at', c.certified_at, 'expires_at', c.expires_at, 'signature_id', c.signature_id, 'state', c.state) END,
    'last_valid_version', m.last_valid_version,
    'source', v_spec ->> 'source', 'source_revision', v_revision, 'source_rows', v_n, 'source_newest_at', v_newest, 'freshness_seconds', v_fresh,
    'values', v_rows, 'value_digest', v_digest,
    'note', CASE WHEN v_certified THEN 'certified — served as the executive view would' ELSE 'UNCERTIFIED (' || v_standing || ') — served in the analyst view only; not a basis for an executive report' END)
    -- B107 dr: the catalog's trust and the governance holds consulted, and the mark when consumption is stopped
    || jsonb_build_object('catalog_trust', v_trust - 'flags', 'governance_holds', v_holds, 'consumption',
         CASE WHEN v_stopped IS NULL THEN CASE WHEN (v_trust ->> 'known')::boolean THEN 'trusted' ELSE 'not catalogued — coverage debt (DP-49-006)' END
              ELSE 'STOPPED for new consumption: ' || v_stopped || ' — served in the analyst view only, marked' END);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.serve_metric(uuid,uuid,uuid,text,text,jsonb,timestamptz,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.serve_metric(uuid,uuid,uuid,text,text,jsonb,timestamptz,text,uuid,uuid) TO eye_commit;

/* B107 dr — re-declared WHOLE from 0095 §R.4 (its last definition); the changes are marked `B107 dr`.
   DEGRADE (products.product.degrade — the owner or a steward — OR executive.attention.tick — the step, after grace_ticks consecutive
   below-floor scorecards): released → degraded with a reason, NEVER silently: every ACCEPTED consumer gets an attention item of class
   product.degradation (subject kind product), routed to the consumer when it is an active human, else by the class's roles under the
   active policy (0094 §D's idiom for raising an item from a port); the event names every item raised. */
CREATE OR REPLACE FUNCTION products.degrade_product(
  p_product_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, decision, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r products.products_current%ROWTYPE; c record; pol executive.attention_policies%ROWTYPE; v_now timestamptz := clock_timestamp(); v_by_tick boolean := public.eye_bound_action() = 'executive.attention.tick';
        v_item uuid; v_cause uuid; v_owner uuid; v_eval jsonb; v_route jsonb; v_state text; v_notified jsonb := '[]'::jsonb;
        v_by text;   -- B107 dr
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.product.degrade', 'executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'data product rejected (actor): degraded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = p_product_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'data product rejected (unknown_product): % is not a product of this domain', p_product_id USING ERRCODE = '22023'; END IF;
  IF NOT v_by_tick AND p_actor <> r.owner_principal_id AND NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['data_steward', 'domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'data product rejected (authority): a product is degraded by its owner, by a data steward, or by the attention tick' USING ERRCODE = '42501';
  END IF;
  IF r.state <> 'released' THEN RAISE EXCEPTION 'data product rejected (state): product % is %; a released product degrades', r.product_key, r.state USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'data product rejected (reason): a degradation names its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  -- B107 dr (0115 §DR.9; DP-41-005): DEGRADATION DECLARED BY THE PRODUCT on the loss of its owner or a recorded policy violation — when the
  -- TICK degrades, the cause is read from the record (the owner no longer an active human of the tenant; an APPROVED access or classification
  -- stewardship case on the product = a confirmed policy violation), else the SLO (the scorecard step). `by` carries it: only a degradation
  -- `by` = 'tick' (the SLO) is restored by a later ok scorecard; an owner loss or a policy violation is restored through an accepted domain
  -- review, as a person's degradation is (restore_product reads `by`).
  v_by := CASE WHEN NOT v_by_tick THEN 'human'
               WHEN NOT decision.is_active_human(r.owner_principal_id, p_tenant) THEN 'owner_lost'
               WHEN EXISTS (SELECT 1 FROM governance.stewardship_cases sc WHERE sc.subject_kind = 'product' AND sc.subject_id = p_product_id AND sc.kind IN ('access', 'classification') AND sc.state = 'approved') THEN 'policy_violation'
               ELSE 'tick' END;
  -- end B107 dr
  UPDATE products.products_current SET state = 'degraded', degraded_reason = btrim(p_reason), degraded_at = v_now, updated_at = v_now WHERE product_id = p_product_id RETURNING * INTO r;
  SELECT * INTO pol FROM executive.attention_policies a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.state = 'active';
  FOR c IN SELECT x.* FROM products.product_consumers x WHERE x.product_id = p_product_id AND x.state = 'accepted' ORDER BY x.registered_at LOOP
    v_item := gen_random_uuid(); v_cause := gen_random_uuid();
    v_owner := CASE WHEN decision.is_active_human(c.consumer_principal_id, p_tenant) THEN c.consumer_principal_id END;
    v_eval := executive.evaluate_attention(CASE WHEN pol.policy_id IS NULL THEN NULL ELSE pol.rules END, 'product.degradation',
                                           jsonb_build_object('consequence', 'C2', 'confidence', 1, 'hours_to_window', 0)) || jsonb_build_object('policy_version', pol.version);
    v_route := executive.attention_route(pol.rules, 'product.degradation', v_eval ->> 'outcome', v_owner, p_tenant, p_domain);
    v_state := v_route ->> 'state';
    INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state,
                                           owner_principal_id, route_roles, policy_id, policy_version, evaluation, details, due_at, escalations, correlation_id)
    VALUES (v_item, 'DOMAIN', p_tenant, p_domain, 'product.degradation', 'product', p_product_id, v_cause, 'ProductDegraded',
            left(format('Product %s DEGRADED: %s', r.product_key, btrim(p_reason)), 512), v_eval ->> 'outcome', v_state,
            v_owner, ARRAY(SELECT jsonb_array_elements_text(v_route -> 'route_roles')), pol.policy_id, pol.version, v_eval,
            jsonb_build_object('product_id', p_product_id, 'product_key', r.product_key, 'consumer_id', c.consumer_id, 'consumer_principal_id', c.consumer_principal_id, 'contract_version', c.contract_version,
                               'impact', c.impact, 'reason', btrim(p_reason), 'last_valid_version', r.released_version, 'raised_at', v_now,
                               'by', CASE v_by WHEN 'tick' THEN 'the attention tick step product-scorecards' WHEN 'owner_lost' THEN 'the attention tick: the product''s owner is lost (B107 §DR)'
                                               WHEN 'policy_violation' THEN 'the attention tick: a policy violation is recorded (B107 §DR)' ELSE 'the degradation port' END),   -- B107 dr
            (v_route ->> 'due_at')::timestamptz, (v_route ->> 'escalations')::int, p_correlation);
    PERFORM executive.attention_event(v_item, p_tenant, p_domain,
              CASE v_state WHEN 'open' THEN 'item.routed' WHEN 'escalated' THEN 'item.escalated' WHEN 'unrouted' THEN 'item.unrouted' ELSE 'item.deprioritized' END,
              p_actor, jsonb_build_object('outcome', v_eval ->> 'outcome', 'reasons', v_eval -> 'reasons', 'policy_version', pol.version, 'owner', v_owner, 'route_roles', v_route -> 'route_roles',
                                          'due_at', v_route -> 'due_at', 'cause_event_id', v_cause, 'cause_event_type', 'ProductDegraded', 'unrouted', coalesce((v_route ->> 'unrouted')::boolean, false)), p_correlation);
    v_notified := v_notified || jsonb_build_object('consumer_id', c.consumer_id, 'consumer_principal_id', c.consumer_principal_id, 'item_id', v_item, 'state', v_state, 'owner', v_owner);
  END LOOP;
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_product_id, 'product.degraded', p_actor,
          jsonb_build_object('reason', btrim(p_reason), 'by', v_by, 'notified', v_notified, 'released_version', r.released_version), p_correlation);   -- B107 dr: the declared cause
  RETURN products.product_json(r) || jsonb_build_object('notified', v_notified);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.degrade_product(uuid,uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.degrade_product(uuid,uuid,uuid,text,uuid,uuid,uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- RLS AND GRANTS (§DR's tables). DOMAIN rows (authorities, the domain registry, cases, evidence, a domain's gaps) under the domain isolation
-- idiom — NO PLATFORM-sees-all clause: a platform operator never reads a customer's stewardship content (PER-19; content only under B94's
-- support grant). PLATFORM rows (data capabilities, component ownerships and transfers, PLATFORM gaps) are readable by every authenticated
-- context (the vendor's registries are not tenant data). SELECT to eye_app and eye_commit; no write grant — the definer ports write.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['governance.data_authorities', 'governance.domain_registry', 'governance.stewardship_cases', 'governance.responsibility_evidence'] LOOP
    EXECUTE format('REVOKE ALL ON %s FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$CREATE POLICY domain_isolation ON %s USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()))$f$, t);
    EXECUTE format('GRANT SELECT ON %s TO eye_app, eye_commit', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['governance.data_capabilities', 'governance.component_ownerships', 'governance.component_transfers'] LOOP
    EXECUTE format('REVOKE ALL ON %s FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$CREATE POLICY platform_registry ON %s USING (public.eye_scope() <> 'NONE')$f$, t);
    EXECUTE format('GRANT SELECT ON %s TO eye_app, eye_commit', t);
  END LOOP;
  REVOKE ALL ON governance.ownership_gaps FROM PUBLIC;
  ALTER TABLE governance.ownership_gaps ENABLE ROW LEVEL SECURITY;
  ALTER TABLE governance.ownership_gaps FORCE ROW LEVEL SECURITY;
  CREATE POLICY gap_visibility ON governance.ownership_gaps USING (
    (scope = 'PLATFORM' AND public.eye_scope() <> 'NONE')
    OR (scope = 'DOMAIN' AND tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())));
  GRANT SELECT ON governance.ownership_gaps TO eye_app, eye_commit;
END $$;
