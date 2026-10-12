-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0114 §SV — CP-6 B94 part `sv`: THE SERVICE PORTAL (F-P7-F-06: V8 ch.69 PR-69-001, PR-69-002, PR-69-005, PR-69-006, CAP-DL-09, CAP-DL-10,
-- AT-69) and the B91 carryover (a): premium support bound to the portal's ENTITLEMENT-BASED ROUTING (V8 ENT-17, V10 ENT-20 — F-P7-F-01's
-- piece). The part-local file of 0114: it applies ALONE on top of 0001–0113 and the prelude (0114_b94_onboarding_implementation_service.sql).
--
--   §SV.1 the SLA POLICIES (per routing tier × severity, versioned; SYNTHETIC vendor objectives) and the ROUTING read: the tenant's LIVE
--         licence decides — premium_support in a live ACTIVE licence → premium (named support, objectives per severity); anything else →
--         standard. Opening a case is NEVER licence-gated (`service.*` is no capability's prefix; the routing never refuses).
--   §SV.2 the case's columns (added to the prelude's service.cases), the notes, the evidence bundles, the problems / known errors /
--         changes, the commitments, the SLA breaches and drills, the value reviews — DOMAIN-scoped, FORCE RLS, append-only where a ledger.
--   §SV.3 the helpers: the customer / engineer test, THE ENGINEER GATE (service.live_grant FIRST, every attempt logged — a refusal for want
--         of a grant is LOGGED AND ANSWERED, not raised, so the log commits), the case lock, the SLA scheduling (B34 timers).
--   §SV.4 the case ports: open (any customer role; routed), triage, note, progress (awaiting_access | diagnosing | cannot_reproduce |
--         degraded_guidance | resolved), workaround propose / execute (the CUSTOMER executes — a case act linking the governed act the
--         customer performed, verified on its policy decision), known-error reuse, the evidence bundle (records under the case's scope,
--         digested, sensitive items REDACTED or WITHHELD with the reason), closure (the customer's confirmation; human), reopen on
--         regression, the engineer's case read.
--   §SV.5 commitments (record, settle; a missed one breaches and escalates by consequence).
--   §SV.6 problems, known errors (reused on a new case), changes linked to problems (proposed, decided by another named human, recorded).
--   §SV.7 the SLA timers' firing (sla.response / sla.resolution under executive.attention.tick: a breach → `service.case` escalated BY
--         SEVERITY), the drill (an `sla_escalation` drill: a timer due now, fired by the next real tick, recorded as a drill), the sweep
--         (the after-tick hook `service-sla`: a missed commitment; an objective past due whose timer did not fire).
--   §SV.8 the value review (CAP-DL-10): a record over the customer-success read model the route read first; MET-040 stays `unsupported`
--         (carrier B76); the record's claim is ALWAYS `demonstration` — joint value-review acceptance is R2.
--
-- THREE CLAIMS, never mixed: CONSTRUCTION (these ports and their harness phase6-service-b94); DEMONSTRATED OPERATION (the act on SYNTHETIC
-- NORDWERK personas, vendor and stall); REAL CUSTOMER ACCEPTANCE (AT-69, PR-69-006 — R2, never claimed by any record here). Every SLA
-- objective seeded below is SYNTHETIC vendor data.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §SV.0 THE TIMER OWNER — B94 sv: an SLA timer is owned by its service case (0090's owner_kind list, copied whole, plus `service_case`).
ALTER TABLE executive.workflow_timers DROP CONSTRAINT IF EXISTS workflow_timers_owner_kind_check;
ALTER TABLE executive.workflow_timers ADD CONSTRAINT workflow_timers_owner_kind_check CHECK (owner_kind IN ('task', 'workflow_instance', 'grant', 'commitment_item', 'gate',
  -- B94 sv (0114 §SV.0)
  'service_case'));

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §SV.1 THE SLA POLICIES AND THE ROUTING
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/* One row per (tier, severity, version): the response and resolution objectives (minutes), the update cadence, whether support is NAMED,
   the queue. Vendor reference data (no tenant): readable by every runtime role, written by this migration only (a new version supersedes).
   SYNTHETIC objectives — not a real support contract. */
CREATE TABLE service.sla_policies (
  tier               text NOT NULL CHECK (tier IN ('premium', 'standard')),
  severity           text NOT NULL CHECK (severity IN ('S1', 'S2', 'S3', 'S4')),
  version            int  NOT NULL CHECK (version >= 1),
  response_minutes   int  NOT NULL CHECK (response_minutes >= 1),
  resolution_minutes int  NOT NULL,
  update_minutes     int  NOT NULL CHECK (update_minutes >= 1),
  named_support      boolean NOT NULL,
  queue              text NOT NULL CHECK (length(btrim(queue)) >= 4),
  status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded')),
  declared_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  reason             text NOT NULL CHECK (length(btrim(reason)) >= 8),
  provenance         jsonb NOT NULL CHECK (jsonb_typeof(provenance) = 'object'),
  digest             text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY (tier, severity, version),
  CONSTRAINT ssp_resolution CHECK (resolution_minutes >= response_minutes)
);
CREATE UNIQUE INDEX ssp_one_active ON service.sla_policies (tier, severity) WHERE status = 'active';
REVOKE ALL ON service.sla_policies FROM PUBLIC;
GRANT SELECT ON service.sla_policies TO eye_app, eye_commit;
INSERT INTO service.sla_policies (tier, severity, version, response_minutes, resolution_minutes, update_minutes, named_support, queue, reason, provenance, digest)
SELECT x.tier, x.sev, 1, x.resp, x.reso, x.upd, x.tier = 'premium', x.queue, 'B94 (0114 §SV.1): the seeded objectives of the service portal (SYNTHETIC vendor data)',
       jsonb_build_object('seeded_by', 'migration 0114 §SV.1', 'synthetic', true),
       onboarding.digest(jsonb_build_object('tier', x.tier, 'severity', x.sev, 'version', 1, 'response', x.resp, 'resolution', x.reso, 'update', x.upd, 'queue', x.queue))
  FROM (VALUES ('premium', 'S1', 15, 240, 30, 'premium named support'), ('premium', 'S2', 30, 480, 60, 'premium named support'),
               ('premium', 'S3', 120, 1440, 240, 'premium named support'), ('premium', 'S4', 480, 4320, 1440, 'premium named support'),
               ('standard', 'S1', 60, 1440, 120, 'standard support queue'), ('standard', 'S2', 240, 2880, 480, 'standard support queue'),
               ('standard', 'S3', 1440, 7200, 1440, 'standard support queue'), ('standard', 'S4', 2880, 14400, 2880, 'standard support queue'))
       AS x(tier, sev, resp, reso, upd, queue);

/* THE ROUTING (carryover a): read from the tenant's LIVE licence (the same selection as commercial.capability_available: the latest
   non-superseded version, an issued one first). premium_support listed AND the version ACTIVE and inside its term → premium; otherwise
   standard, with the reason said (uncontracted; not licensed; in grace / suspended / lapsed — premium routing is never inferred). The
   live contract's support boundary is DESCRIPTIVE: its tier is shown, its named contact names premium support, it never decides the tier.
   This function NEVER refuses: opening a case is never licence-gated. Internal (the open port) and read (the routing preview). */
CREATE OR REPLACE FUNCTION service.routing_for(p_tenant uuid, p_severity text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = service, commercial, observation, public, pg_catalog, pg_temp AS $$
DECLARE lic commercial.licences%ROWTYPE; cap commercial.capabilities%ROWTYPE; ctr commercial.contracts%ROWTYPE; pol service.sla_policies%ROWTYPE;
        v_tier text := 'standard'; v_reason text; v_now timestamptz := clock_timestamp(); v_named text;
BEGIN
  IF p_severity IS NULL OR p_severity NOT IN ('S1', 'S2', 'S3', 'S4') THEN
    RAISE EXCEPTION 'service case rejected (severity): the severity is S1, S2, S3 or S4' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO cap FROM commercial.capabilities c WHERE c.capability_key = 'premium_support' AND c.status = 'active';
  SELECT * INTO lic FROM commercial.licences l WHERE l.tenant_id = p_tenant AND l.state <> 'superseded'
   ORDER BY EXISTS (SELECT 1 FROM commercial.entitlement_events e WHERE e.subject_kind = 'licence' AND e.subject_key = l.licence_id::text
                                    AND e.version = l.version AND e.event = 'licence.issued') DESC, l.issued_at DESC, l.version DESC LIMIT 1;
  SELECT * INTO ctr FROM commercial.contracts c WHERE c.tenant_id = p_tenant AND c.status = 'active' ORDER BY c.declared_at DESC, c.version DESC LIMIT 1;
  IF lic.licence_id IS NULL THEN
    v_reason := 'uncontracted: the tenant holds no licence, so premium support is not licensed — standard routing (opening a case is never licence-gated)';
  ELSIF NOT ('premium_support' = ANY (lic.capabilities)) THEN
    v_reason := format('premium_support is not in licence v%s (%s) — standard routing (opening a case is never licence-gated)', lic.version, lic.state);
  ELSIF lic.state <> 'active' OR (lic.effective_to IS NOT NULL AND lic.effective_to <= v_now) THEN
    v_reason := format('licence v%s lists premium_support but is %s — premium routing is never inferred from a licence that is not active; standard objectives apply (opening is never licence-gated)',
                       lic.version, CASE WHEN lic.state = 'active' THEN 'past its term (grace pending)' ELSE lic.state END);
  ELSIF cap.capability_key IS NULL OR NOT cap.built THEN
    v_reason := 'premium_support is not a built capability of the live catalogue — standard routing';
  ELSE
    v_tier := 'premium';
    v_reason := format('premium: premium_support v%s is licensed under licence v%s (active)', cap.version, lic.version);
  END IF;
  SELECT * INTO pol FROM service.sla_policies p WHERE p.tier = v_tier AND p.severity = p_severity AND p.status = 'active';
  v_named := CASE WHEN v_tier = 'premium' THEN coalesce(nullif(btrim(ctr.support_boundary ->> 'named_contact'), ''), pol.queue) ELSE NULL END;
  RETURN jsonb_build_object(
    'tier', v_tier, 'severity', p_severity, 'reason', v_reason, 'read_at', v_now,
    'licence', CASE WHEN lic.licence_id IS NULL THEN NULL ELSE jsonb_build_object('licence_id', lic.licence_id, 'version', lic.version, 'state', lic.state,
                                                                                    'package_key', lic.package_key, 'digest', lic.digest, 'premium_listed', 'premium_support' = ANY (lic.capabilities)) END,
    'capability', CASE WHEN cap.capability_key IS NULL THEN NULL ELSE jsonb_build_object('key', cap.capability_key, 'version', cap.version, 'built', cap.built, 'prefixes', to_jsonb(cap.action_prefixes)) END,
    'contract', CASE WHEN ctr.contract_id IS NULL THEN NULL ELSE jsonb_build_object('contract_id', ctr.contract_id, 'version', ctr.version, 'support_tier', ctr.support_boundary ->> 'tier',
                                                                                     'descriptive', true) END,
    'policy', jsonb_build_object('tier', pol.tier, 'severity', pol.severity, 'version', pol.version, 'digest', pol.digest),
    'objectives', jsonb_build_object('response_minutes', pol.response_minutes, 'resolution_minutes', pol.resolution_minutes, 'update_minutes', pol.update_minutes),
    'named_support', v_named, 'queue', pol.queue,
    'governance', 'premium support changes objectives and named support only — never an approval, a grant or a gate');
END $$;
REVOKE ALL ON FUNCTION service.routing_for(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.routing_for(uuid, text) TO eye_commit;

/* The routing preview (the page: how a case of each severity would route now) — a guarded read. */
CREATE OR REPLACE FUNCTION service.routing_preview(p_tenant uuid, p_domain uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = service, observation, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the routing of a service case');
  RETURN (SELECT jsonb_object_agg(s, service.routing_for(p_tenant, s)) FROM unnest(ARRAY['S1', 'S2', 'S3', 'S4']) s);
END $$;
REVOKE ALL ON FUNCTION service.routing_preview(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.routing_preview(uuid, uuid) TO eye_app, eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §SV.2 THE RECORDS
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/* The case (prelude table) gains: its VERSION (every state act names the version it read — stale → 409), the SLA facts (due instants, the
   timers, the response, the breaches), the triage, resolution, guidance, workaround (proposed / executed), the problem and known error,
   the reopen count and the closure. */
ALTER TABLE service.cases
  ADD COLUMN version                int NOT NULL DEFAULT 1 CHECK (version >= 1),
  ADD COLUMN response_due_at        timestamptz,
  ADD COLUMN resolution_due_at      timestamptz,
  ADD COLUMN response_timer_id      uuid,
  ADD COLUMN resolution_timer_id    uuid,
  ADD COLUMN responded_at           timestamptz,
  ADD COLUMN response_breached_at   timestamptz,
  ADD COLUMN resolution_breached_at timestamptz,
  ADD COLUMN triaged_by             uuid,
  ADD COLUMN triaged_at             timestamptz,
  ADD COLUMN resolved_by            uuid,
  ADD COLUMN resolved_at            timestamptz,
  ADD COLUMN resolution             text,
  ADD COLUMN guidance               text,
  ADD COLUMN workaround             jsonb CHECK (workaround IS NULL OR jsonb_typeof(workaround) = 'object'),
  ADD COLUMN workaround_executed    jsonb CHECK (workaround_executed IS NULL OR jsonb_typeof(workaround_executed) = 'object'),
  ADD COLUMN problem_id             uuid,
  ADD COLUMN known_error_id         uuid,
  ADD COLUMN reopen_count           int NOT NULL DEFAULT 0 CHECK (reopen_count >= 0),
  ADD COLUMN closed_by              uuid,
  ADD COLUMN closure                jsonb CHECK (closure IS NULL OR jsonb_typeof(closure) = 'object');

/* A note on a case: the customer's (any customer role) or support's (a support engineer under a live grant — its grant named). */
CREATE TABLE service.case_notes (
  note_id        uuid PRIMARY KEY,
  scope          text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id      uuid NOT NULL,
  domain_id      uuid NOT NULL,
  case_id        uuid NOT NULL REFERENCES service.cases (case_id),
  author_principal_id uuid NOT NULL,
  side           text NOT NULL CHECK (side IN ('customer', 'support')),
  grant_id       uuid REFERENCES service.support_grants (grant_id),
  kind           text NOT NULL CHECK (kind IN ('note', 'diagnosis', 'response')),
  body           text NOT NULL CHECK (length(btrim(body)) BETWEEN 4 AND 4000),
  at             timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id uuid NOT NULL,
  CONSTRAINT scn_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT scn_support_grant CHECK ((side = 'support') = (grant_id IS NOT NULL))
);
CREATE INDEX scn_case ON service.case_notes (case_id, at);
CREATE TRIGGER scn_append_only BEFORE UPDATE OR DELETE ON service.case_notes FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* AN EVIDENCE BUNDLE: assembled by the port from the records under the case's scope (and, for support, the grant's object scope), each item
   included, REDACTED or WITHHELD with its reason; digested. Append-only (a new assembly is a new bundle). */
CREATE TABLE service.evidence_bundles (
  bundle_id      uuid PRIMARY KEY,
  scope          text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id      uuid NOT NULL,
  domain_id      uuid NOT NULL,
  case_id        uuid NOT NULL REFERENCES service.cases (case_id),
  case_version   int NOT NULL,
  assembled_by   uuid NOT NULL,
  side           text NOT NULL CHECK (side IN ('customer', 'support')),
  grant_id       uuid REFERENCES service.support_grants (grant_id),
  items          jsonb NOT NULL CHECK (jsonb_typeof(items) = 'array'),
  counts         jsonb NOT NULL CHECK (jsonb_typeof(counts) = 'object'),
  digest         text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  assembled_at   timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id uuid NOT NULL,
  CONSTRAINT seb_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT seb_support_grant CHECK ((side = 'support') = (grant_id IS NOT NULL))
);
CREATE INDEX seb_case ON service.evidence_bundles (case_id, assembled_at);
CREATE TRIGGER seb_append_only BEFORE UPDATE OR DELETE ON service.evidence_bundles FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* PROBLEMS (the cause behind one or more cases), their case links, KNOWN ERRORS (a problem's documented symptom + workaround, reusable on a
   new case), their reuses, CHANGES linked to a problem. */
CREATE TABLE service.problems (
  problem_id     uuid PRIMARY KEY,
  scope          text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id      uuid NOT NULL,
  domain_id      uuid NOT NULL,
  problem_ref    text NOT NULL CHECK (problem_ref ~ '^PRB-[0-9]{4,}$'),
  title          text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 200),
  statement      text NOT NULL CHECK (length(btrim(statement)) >= 12),
  state          text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'known_error', 'resolved', 'closed')),
  root_cause     text,
  version        int NOT NULL DEFAULT 1 CHECK (version >= 1),
  opened_by      uuid NOT NULL,
  opened_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  closed_by      uuid,
  closed_at      timestamptz,
  close_reason   text,
  correlation_id uuid NOT NULL,
  CONSTRAINT spr_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT spr_ref_once UNIQUE (tenant_id, problem_ref),
  CONSTRAINT spr_closed CHECK ((state IN ('resolved', 'closed')) = (closed_at IS NOT NULL))
);
CREATE TABLE service.problem_cases (
  problem_id     uuid NOT NULL REFERENCES service.problems (problem_id),
  case_id        uuid NOT NULL REFERENCES service.cases (case_id),
  scope          text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id      uuid NOT NULL,
  domain_id      uuid NOT NULL,
  linked_by      uuid NOT NULL,
  linked_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  reason         text NOT NULL CHECK (length(btrim(reason)) >= 8),
  PRIMARY KEY (problem_id, case_id),
  CONSTRAINT spc_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE TRIGGER spc_append_only BEFORE UPDATE OR DELETE ON service.problem_cases FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TABLE service.known_errors (
  known_error_id uuid PRIMARY KEY,
  scope          text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id      uuid NOT NULL,
  domain_id      uuid NOT NULL,
  problem_id     uuid NOT NULL REFERENCES service.problems (problem_id),
  ke_ref         text NOT NULL CHECK (ke_ref ~ '^KE-[0-9]{4,}$'),
  title          text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 200),
  symptom        text NOT NULL CHECK (length(btrim(symptom)) >= 12),
  workaround     text NOT NULL CHECK (length(btrim(workaround)) >= 12),
  workaround_act jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(workaround_act) = 'object'),
  state          text NOT NULL DEFAULT 'published' CHECK (state IN ('published', 'retired')),
  digest         text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  published_by   uuid NOT NULL,
  published_at   timestamptz NOT NULL DEFAULT clock_timestamp(),
  retired_by     uuid,
  retired_at     timestamptz,
  retire_reason  text,
  correlation_id uuid NOT NULL,
  CONSTRAINT ske_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT ske_ref_once UNIQUE (tenant_id, ke_ref),
  CONSTRAINT ske_retired CHECK ((state = 'retired') = (retired_at IS NOT NULL))
);
CREATE TABLE service.known_error_uses (
  use_id         uuid PRIMARY KEY,
  scope          text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id      uuid NOT NULL,
  domain_id      uuid NOT NULL,
  known_error_id uuid NOT NULL REFERENCES service.known_errors (known_error_id),
  case_id        uuid NOT NULL REFERENCES service.cases (case_id),
  used_by        uuid NOT NULL,
  side           text NOT NULL CHECK (side IN ('customer', 'support')),
  grant_id       uuid REFERENCES service.support_grants (grant_id),
  used_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id uuid NOT NULL,
  CONSTRAINT sku_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT sku_once UNIQUE (known_error_id, case_id)
);
CREATE TRIGGER sku_append_only BEFORE UPDATE OR DELETE ON service.known_error_uses FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TABLE service.changes (
  change_id      uuid PRIMARY KEY,
  scope          text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id      uuid NOT NULL,
  domain_id      uuid NOT NULL,
  problem_id     uuid NOT NULL REFERENCES service.problems (problem_id),
  change_ref     text NOT NULL CHECK (change_ref ~ '^CHG-[0-9]{4,}$'),
  title          text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 200),
  description    text NOT NULL CHECK (length(btrim(description)) >= 12),
  expected_effect text NOT NULL CHECK (length(btrim(expected_effect)) >= 8),
  state          text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'approved', 'rejected', 'implemented', 'verified', 'failed')),
  version        int NOT NULL DEFAULT 1 CHECK (version >= 1),
  proposed_by    uuid NOT NULL,
  proposed_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_by     uuid,
  decided_at     timestamptz,
  decision_reason text,
  implemented_by uuid,
  implemented_at timestamptz,
  verified_by    uuid,
  verified_at    timestamptz,
  evidence       jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence) = 'array'),
  correlation_id uuid NOT NULL,
  CONSTRAINT sch_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT sch_ref_once UNIQUE (tenant_id, change_ref),
  CONSTRAINT sch_decided CHECK (state = 'proposed' OR (decided_by IS NOT NULL AND decided_at IS NOT NULL)),
  CONSTRAINT sch_sod CHECK (decided_by IS NULL OR decided_by <> proposed_by)
);

/* A SUPPORT COMMITMENT on a case: what support (or the service owner) committed to, by when. open → met | breached | withdrawn; a breached
   commitment may still be met (late — recorded). */
CREATE TABLE service.commitments (
  commitment_id  uuid PRIMARY KEY,
  scope          text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id      uuid NOT NULL,
  domain_id      uuid NOT NULL,
  case_id        uuid NOT NULL REFERENCES service.cases (case_id),
  kind           text NOT NULL CHECK (kind IN ('update', 'workaround', 'fix', 'review', 'other')),
  statement      text NOT NULL CHECK (length(btrim(statement)) >= 8),
  due_at         timestamptz NOT NULL,
  state          text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'met', 'breached', 'withdrawn')),
  made_by        uuid NOT NULL,
  side           text NOT NULL CHECK (side IN ('customer', 'support')),
  grant_id       uuid REFERENCES service.support_grants (grant_id),
  made_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  breached_at    timestamptz,
  settled_by     uuid,
  settled_at     timestamptz,
  settle_note    text,
  late           boolean NOT NULL DEFAULT false,
  correlation_id uuid NOT NULL,
  CONSTRAINT scm_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT scm_settled CHECK ((state IN ('met', 'withdrawn')) = (settled_at IS NOT NULL)),
  CONSTRAINT scm_breached CHECK (state <> 'breached' OR breached_at IS NOT NULL)
);
CREATE INDEX scm_due ON service.commitments (tenant_id, domain_id, state, due_at);

/* AN SLA BREACH (or a drill's): the objective, its due instant, when it was found breached, by what (timer | sweep | drill), the severity,
   the routed attention item. Append-only. */
CREATE TABLE service.sla_breaches (
  breach_id      uuid PRIMARY KEY,
  scope          text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id      uuid NOT NULL,
  domain_id      uuid NOT NULL,
  case_id        uuid NOT NULL REFERENCES service.cases (case_id),
  objective      text NOT NULL CHECK (objective IN ('response', 'resolution', 'commitment')),
  commitment_id  uuid REFERENCES service.commitments (commitment_id),
  severity       text NOT NULL CHECK (severity IN ('S1', 'S2', 'S3', 'S4')),
  tier           text NOT NULL CHECK (tier IN ('premium', 'standard')),
  due_at         timestamptz NOT NULL,
  breached_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  found_by       text NOT NULL CHECK (found_by IN ('timer', 'sweep', 'drill')),
  drill          boolean NOT NULL DEFAULT false,
  timer_id       uuid,
  item           jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id uuid NOT NULL,
  CONSTRAINT ssb_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT ssb_drill CHECK (drill = (found_by = 'drill')),
  CONSTRAINT ssb_commitment CHECK ((objective = 'commitment') = (commitment_id IS NOT NULL))
);
CREATE UNIQUE INDEX ssb_once ON service.sla_breaches (case_id, objective, due_at) WHERE NOT drill AND objective <> 'commitment';
CREATE UNIQUE INDEX ssb_commitment_once ON service.sla_breaches (commitment_id) WHERE objective = 'commitment';
CREATE TRIGGER ssb_append_only BEFORE UPDATE OR DELETE ON service.sla_breaches FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* AN SLA ESCALATION DRILL (PR-69-006 — kind `sla_escalation`): a timer due NOW, fired by the next real tick, its escalation recorded as a
   drill (the case's real SLA facts untouched). */
CREATE TABLE service.sla_drills (
  drill_id       uuid PRIMARY KEY,
  scope          text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id      uuid NOT NULL,
  domain_id      uuid NOT NULL,
  case_id        uuid NOT NULL REFERENCES service.cases (case_id),
  kind           text NOT NULL DEFAULT 'sla_escalation' CHECK (kind = 'sla_escalation'),
  objective      text NOT NULL CHECK (objective IN ('response', 'resolution')),
  timer_id       uuid NOT NULL,
  requested_by   uuid NOT NULL,
  requested_at   timestamptz NOT NULL DEFAULT clock_timestamp(),
  reason         text NOT NULL CHECK (length(btrim(reason)) >= 8),
  correlation_id uuid NOT NULL,
  CONSTRAINT ssd_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE TRIGGER ssd_append_only BEFORE UPDATE OR DELETE ON service.sla_drills FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* THE VALUE REVIEW (CAP-DL-10): the period, the customer-success inputs the route read first (their digest re-checked), the outcomes
   statement, the value status (MET-040: `unsupported` until B76 — read by the port, never asserted by the caller), recorded by a customer
   role and acknowledged (or withheld) by another named human. claim is ALWAYS `demonstration` — joint value-review acceptance is R2. */
CREATE TABLE service.value_reviews (
  review_id      uuid PRIMARY KEY,
  scope          text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id      uuid NOT NULL,
  domain_id      uuid NOT NULL,
  period_from    date NOT NULL,
  period_to      date NOT NULL,
  inputs         jsonb NOT NULL CHECK (jsonb_typeof(inputs) = 'object'),
  inputs_digest  text NOT NULL CHECK (inputs_digest ~ '^[0-9a-f]{64}$'),
  outcomes       text NOT NULL CHECK (length(btrim(outcomes)) >= 12),
  value_status   jsonb NOT NULL CHECK (jsonb_typeof(value_status) = 'object'),
  state          text NOT NULL DEFAULT 'recorded' CHECK (state IN ('recorded', 'acknowledged', 'withheld')),
  claim          text NOT NULL DEFAULT 'demonstration' CHECK (claim = 'demonstration'),
  digest         text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  recorded_by    uuid NOT NULL,
  recorded_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_by     uuid,
  decided_at     timestamptz,
  decision_note  text,
  correlation_id uuid NOT NULL,
  CONSTRAINT svr_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT svr_period CHECK (period_to >= period_from),
  CONSTRAINT svr_decided CHECK ((state = 'recorded') = (decided_at IS NULL)),
  CONSTRAINT svr_sod CHECK (decided_by IS NULL OR decided_by <> recorded_by)
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['service.case_notes', 'service.evidence_bundles', 'service.problems', 'service.problem_cases', 'service.known_errors', 'service.known_error_uses',
                           'service.changes', 'service.commitments', 'service.sla_breaches', 'service.sla_drills', 'service.value_reviews'] LOOP
    EXECUTE format('REVOKE ALL ON %s FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$CREATE POLICY domain_isolation ON %s USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()))$f$, t);
    EXECUTE format('GRANT SELECT ON %s TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §SV.3 THE HELPERS (internal: SECURITY DEFINER, REVOKE PUBLIC — called by the ports below only)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/* The customer roles of a domain (who opens, notes, executes a workaround, confirms closure, reopens). A support engineer is never one. */
CREATE OR REPLACE FUNCTION service.sv_customer_roles() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  'domain_admin', 'collection_manager', 'data_steward', 'executive', 'risk_owner', 'decision_owner', 'domain_analyst', 'strategy_owner',
  'product_analytics_owner', 'tenant_admin', 'customer_sponsor', 'onboarding_authority'] $$;
GRANT EXECUTE ON FUNCTION service.sv_customer_roles() TO eye_app, eye_commit;

/* The act is recorded by the acting principal. */
CREATE OR REPLACE FUNCTION service.sv_assert_actor(p_noun text, p_actor uuid) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = public, pg_catalog, pg_temp AS $$
BEGIN
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION '% rejected (actor): the act is recorded by the acting principal', p_noun USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION service.sv_assert_actor(text, uuid) FROM PUBLIC;

/* Does the actor act as SUPPORT here? A holder of support_engineer in the domain is ALWAYS treated as support (grant-checked), whatever
   else it holds — the stricter reading. */
CREATE OR REPLACE FUNCTION service.sv_is_engineer(p_actor uuid, p_tenant uuid, p_domain uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = onboarding, pg_catalog, pg_temp AS $$
  SELECT onboarding.holds_role(p_actor, p_tenant, p_domain, ARRAY['support_engineer'])
$$;
REVOKE ALL ON FUNCTION service.sv_is_engineer(uuid, uuid, uuid) FROM PUBLIC;

/* A customer act: a named active human (unless p_human_only is false), never a support engineer, holding one of p_roles (default: the
   customer roles). */
CREATE OR REPLACE FUNCTION service.sv_assert_customer(p_noun text, p_actor uuid, p_tenant uuid, p_domain uuid, p_roles text[], p_what text) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = service, onboarding, pg_catalog, pg_temp AS $$
DECLARE v_roles text[] := coalesce(p_roles, service.sv_customer_roles());
BEGIN
  IF service.sv_is_engineer(p_actor, p_tenant, p_domain) THEN
    RAISE EXCEPTION '% rejected (actor): % is the customer''s own act — a support engineer never performs it', p_noun, p_what USING ERRCODE = '42501';
  END IF;
  IF onboarding.principal_kind(p_actor) IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION '% rejected (actor): % is a named human''s act', p_noun, p_what USING ERRCODE = '42501';
  END IF;
  IF NOT onboarding.holds_role(p_actor, p_tenant, p_domain, v_roles) THEN
    RAISE EXCEPTION '% rejected (authority): % is the act of a % in this domain', p_noun, p_what, array_to_string(v_roles, ' or ') USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION service.sv_assert_customer(text, uuid, uuid, uuid, text[], text) FROM PUBLIC;

/* THE ENGINEER GATE: every port acting for a support engineer calls it FIRST. service.live_grant for the case, the act and (when named) the
   object; the attempt LOGGED either way (service.log_access). Without a live grant it answers {refused: {status 403, message}} — the port
   RETURNS that (it never raises it), so the log row commits with the refusal; the route answers 403 after the commit. */
CREATE OR REPLACE FUNCTION service.sv_engineer_gate(p_tenant uuid, p_domain uuid, p_actor uuid, p_case uuid, p_action text, p_object uuid, p_object_kind text,
                                                    p_noun text, p_what text, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, pg_catalog, pg_temp AS $$
DECLARE v_grant uuid; v_ref text; v_any record;
BEGIN
  v_grant := service.live_grant(p_tenant, p_domain, p_actor, p_case, p_action, p_object);
  SELECT c.case_ref INTO v_ref FROM service.cases c WHERE c.case_id = p_case;
  IF v_grant IS NULL THEN
    SELECT g.state, g.expires_at, g.action_scope INTO v_any FROM service.support_grants g
     WHERE g.tenant_id = p_tenant AND g.domain_id = p_domain AND g.engineer_principal_id = p_actor AND (p_case IS NULL OR g.case_id = p_case)
     ORDER BY g.requested_at DESC LIMIT 1;
    PERFORM service.log_access(p_tenant, p_domain, NULL, p_actor, p_action, coalesce(p_object_kind, 'service_case'), coalesce(p_object, p_case)::text, 'refused',
                               jsonb_build_object('what', p_what, 'case', v_ref, 'reason', 'no live support grant',
                                                  'latest_grant_state', v_any.state, 'latest_grant_expires_at', v_any.expires_at), p_correlation);
    RETURN jsonb_build_object('grant_id', NULL, 'refused', jsonb_build_object('status', 403,
      'message', format('%s rejected (access): %s needs a live support grant for case %s covering %s%s — %s (the attempt is logged)', p_noun, p_what, coalesce(v_ref, p_case::text), p_action,
                        CASE WHEN p_object IS NULL THEN '' ELSE format(' and the object %s', p_object) END,
                        CASE WHEN v_any.state IS NULL THEN 'no grant was ever requested for it'
                             WHEN v_any.state = 'approved' AND v_any.expires_at <= clock_timestamp() THEN format('the grant expired at %s', v_any.expires_at)
                             WHEN v_any.state = 'approved' THEN 'the approved grant does not cover this act or object'
                             ELSE format('the latest grant is %s', v_any.state) END)));
  END IF;
  PERFORM service.log_access(p_tenant, p_domain, v_grant, p_actor, p_action, coalesce(p_object_kind, 'service_case'), coalesce(p_object, p_case)::text, 'allowed',
                             jsonb_build_object('what', p_what, 'case', v_ref), p_correlation);
  RETURN jsonb_build_object('grant_id', v_grant);
END $$;
REVOKE ALL ON FUNCTION service.sv_engineer_gate(uuid, uuid, uuid, uuid, text, uuid, text, text, text, uuid) FROM PUBLIC;

/* The case of the domain, LOCKED (404 unknown_case); p_expected (when not NULL) must be its version (409 stale). */
CREATE OR REPLACE FUNCTION service.sv_case(p_tenant uuid, p_domain uuid, p_case uuid, p_expected int, p_noun text) RETURNS service.cases
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, pg_catalog, pg_temp AS $$
DECLARE c service.cases%ROWTYPE;
BEGIN
  SELECT * INTO c FROM service.cases x WHERE x.case_id = p_case AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '% rejected (unknown_case): % is not a case of this domain', p_noun, p_case USING ERRCODE = '23503'; END IF;
  IF p_expected IS NOT NULL AND p_expected <> c.version THEN
    RAISE EXCEPTION '% rejected (stale): case % is at version %, the act read version % — read it again', p_noun, c.case_ref, c.version, p_expected USING ERRCODE = '23505';
  END IF;
  RETURN c;
END $$;
REVOKE ALL ON FUNCTION service.sv_case(uuid, uuid, uuid, int, text) FROM PUBLIC;

/* The next reference of a kind in the tenant (CASE-0001, PRB-0001, KE-0001, CHG-0001), serialised per tenant. */
CREATE OR REPLACE FUNCTION service.sv_next_ref(p_tenant uuid, p_prefix text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, pg_catalog, pg_temp AS $$
DECLARE v int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('service.ref:' || p_prefix || ':' || p_tenant::text, 0));
  v := CASE p_prefix
    WHEN 'CASE' THEN (SELECT coalesce(max(substr(case_ref, 6)::int), 0) FROM service.cases WHERE tenant_id = p_tenant)
    WHEN 'PRB' THEN (SELECT coalesce(max(substr(problem_ref, 5)::int), 0) FROM service.problems WHERE tenant_id = p_tenant)
    WHEN 'KE' THEN (SELECT coalesce(max(substr(ke_ref, 4)::int), 0) FROM service.known_errors WHERE tenant_id = p_tenant)
    WHEN 'CHG' THEN (SELECT coalesce(max(substr(change_ref, 5)::int), 0) FROM service.changes WHERE tenant_id = p_tenant) END;
  RETURN p_prefix || '-' || lpad((v + 1)::text, 4, '0');
END $$;
REVOKE ALL ON FUNCTION service.sv_next_ref(uuid, text) FROM PUBLIC;

/* The attention dimensions of a case signal, BY SEVERITY (the escalation by consequence): S1 → C4 within 1 h, S2 → C3 within 4 h, S3 → C2
   within 24 h, S4 → C1 within 72 h. Under a published policy a low severity may fall below the class's threshold (deprioritized — listed,
   never hidden); a high one is routed and escalated as the policy says. */
CREATE OR REPLACE FUNCTION service.sv_dims(p_severity text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('consequence', CASE p_severity WHEN 'S1' THEN 'C4' WHEN 'S2' THEN 'C3' WHEN 'S3' THEN 'C2' ELSE 'C1' END, 'confidence', 1,
                            'hours_to_window', CASE p_severity WHEN 'S1' THEN 1 WHEN 'S2' THEN 4 WHEN 'S3' THEN 24 ELSE 72 END)
$$;
GRANT EXECUTE ON FUNCTION service.sv_dims(text) TO eye_app, eye_commit;

/* The response evidence of a case: the first of its triage, its first support note, its first support-grant request (support answered
   "access needed") — the response objective is met by the earliest. */
CREATE OR REPLACE FUNCTION service.sv_responded_at(p_case uuid) RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = service, pg_catalog, pg_temp AS $$
  SELECT least((SELECT c.responded_at FROM service.cases c WHERE c.case_id = p_case),
               (SELECT min(g.requested_at) FROM service.support_grants g WHERE g.case_id = p_case))
$$;
REVOKE ALL ON FUNCTION service.sv_responded_at(uuid) FROM PUBLIC;

/* Schedule an SLA timer of the case (a B34 timer, owner the case). */
CREATE OR REPLACE FUNCTION service.sv_schedule(c service.cases, p_kind text, p_due timestamptz, p_payload jsonb, p_actor uuid, p_correlation uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, executive, pg_catalog, pg_temp AS $$
BEGIN
  RETURN executive._schedule_timer(gen_random_uuid(), c.tenant_id, c.domain_id, 'service_case', c.case_id, p_kind, p_due,
                                   jsonb_build_object('case_ref', c.case_ref, 'severity', c.severity, 'tier', c.routing ->> 'tier', 'drill', false) || coalesce(p_payload, '{}'::jsonb),
                                   p_actor, p_correlation);
END $$;
REVOKE ALL ON FUNCTION service.sv_schedule(service.cases, text, timestamptz, jsonb, uuid, uuid) FROM PUBLIC;

/* Cancel the case's pending SLA timers of a kind (NULL: every SLA kind). Drill timers are left to fire. */
CREATE OR REPLACE FUNCTION service.sv_cancel_timers(p_case uuid, p_kind text) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, executive, pg_catalog, pg_temp AS $$
DECLARE n int;
BEGIN
  UPDATE executive.workflow_timers SET cancelled_at = clock_timestamp()
   WHERE owner_kind = 'service_case' AND owner_id = p_case AND fired_at IS NULL AND cancelled_at IS NULL
     AND (p_kind IS NULL OR kind = p_kind) AND kind IN ('sla.response', 'sla.resolution') AND coalesce((payload ->> 'drill')::boolean, false) = false;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION service.sv_cancel_timers(uuid, text) FROM PUBLIC;

/* The ledger event of a case act, the case's version bumped by the caller. */
CREATE OR REPLACE FUNCTION service.sv_event(c service.cases, p_event text, p_actor uuid, p_details jsonb, p_correlation uuid) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = service, onboarding, pg_catalog, pg_temp AS $$
  SELECT onboarding.ledger('service', c.tenant_id, c.domain_id, 'service_case', c.case_id, c.version, p_event, p_actor,
                           jsonb_build_object('case_ref', c.case_ref, 'state', c.state) || coalesce(p_details, '{}'::jsonb), p_correlation)
$$;
REVOKE ALL ON FUNCTION service.sv_event(service.cases, text, uuid, jsonb, uuid) FROM PUBLIC;

/* A case as a port answers it. */
CREATE OR REPLACE FUNCTION service.sv_case_json(p_case uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = service, pg_catalog, pg_temp AS $$
  SELECT to_jsonb(c) FROM service.cases c WHERE c.case_id = p_case
$$;
REVOKE ALL ON FUNCTION service.sv_case_json(uuid) FROM PUBLIC;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §SV.4 THE CASE PORTS
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/* OPEN (service.case.open): a named human holding a customer role in the domain — never a support engineer. NEVER licence-gated: the
   routing is READ from the live licence and recorded (tier, licence version, objectives, named support); both SLA timers scheduled; a
   `service.case` item raised (routed under the domain's published policy, by severity). object_refs: [{kind: source | run, id}] — each
   must be a record of this domain. */
CREATE OR REPLACE FUNCTION service.open_case(p_case uuid, p_tenant uuid, p_domain uuid, p_title text, p_severity text, p_capability text, p_object_refs jsonb,
                                             p_description text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, executive, observation, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c service.cases%ROWTYPE; v_routing jsonb; v_ref text; v_now timestamptz := clock_timestamp(); o jsonb; v_refs jsonb := '[]'::jsonb; v_ev uuid; v_item jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.case.open']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service.sv_assert_actor('service case', p_actor);
  PERFORM service.sv_assert_customer('service case', p_actor, p_tenant, p_domain, NULL, 'opening a case');
  IF length(btrim(coalesce(p_title, ''))) NOT BETWEEN 4 AND 200 THEN RAISE EXCEPTION 'service case rejected (title): a case title has 4–200 characters' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_description, ''))) < 8 THEN RAISE EXCEPTION 'service case rejected (description): a case describes what happened (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_capability, ''))) NOT BETWEEN 2 AND 80 THEN RAISE EXCEPTION 'service case rejected (capability): the affected capability is named (2–80 characters)' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(coalesce(p_object_refs, '[]'::jsonb)) <> 'array' OR jsonb_array_length(coalesce(p_object_refs, '[]'::jsonb)) > 20 THEN
    RAISE EXCEPTION 'service case rejected (objects): the affected objects are a list of at most 20 {kind, id}' USING ERRCODE = '22023';
  END IF;
  FOR o IN SELECT * FROM jsonb_array_elements(coalesce(p_object_refs, '[]'::jsonb)) LOOP
    IF o ->> 'kind' NOT IN ('source', 'run') OR coalesce(o ->> 'id', '') !~ '^[0-9a-f-]{36}$' THEN
      RAISE EXCEPTION 'service case rejected (objects): an affected object is {kind: source | run, id}' USING ERRCODE = '22023';
    END IF;
    IF o ->> 'kind' = 'source' AND NOT EXISTS (SELECT 1 FROM observation.source_contracts_current s WHERE s.source_id = (o ->> 'id')::uuid AND s.tenant_id = p_tenant AND s.domain_id = p_domain) THEN
      RAISE EXCEPTION 'service case rejected (unknown_object): source % is not a source of this domain', o ->> 'id' USING ERRCODE = '23503';
    END IF;
    IF o ->> 'kind' = 'run' AND NOT EXISTS (SELECT 1 FROM observation.collection_runs_current r WHERE r.run_id = (o ->> 'id')::uuid AND r.tenant_id = p_tenant AND r.domain_id = p_domain) THEN
      RAISE EXCEPTION 'service case rejected (unknown_object): run % is not a run of this domain', o ->> 'id' USING ERRCODE = '23503';
    END IF;
    v_refs := v_refs || jsonb_build_array(jsonb_build_object('kind', o ->> 'kind', 'id', o ->> 'id',
      'label', CASE WHEN o ->> 'kind' = 'source' THEN (SELECT s.source_key FROM observation.source_contracts_current s WHERE s.source_id = (o ->> 'id')::uuid ORDER BY s.contract_version DESC LIMIT 1)
                    ELSE (SELECT 'run ' || to_char(r.started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI "UTC"') FROM observation.collection_runs_current r WHERE r.run_id = (o ->> 'id')::uuid) END));
  END LOOP;
  IF EXISTS (SELECT 1 FROM service.cases x WHERE x.case_id = p_case) THEN RAISE EXCEPTION 'service case rejected (duplicate): case % exists', p_case USING ERRCODE = '23505'; END IF;
  v_routing := service.routing_for(p_tenant, p_severity);   -- never refuses: opening is never licence-gated
  v_ref := service.sv_next_ref(p_tenant, 'CASE');
  INSERT INTO service.cases (case_id, tenant_id, domain_id, case_ref, title, severity, affected_capability, object_refs, description, state, routing, opened_by, opened_at, updated_at,
                             correlation_id, response_due_at, resolution_due_at)
  VALUES (p_case, p_tenant, p_domain, v_ref, btrim(p_title), p_severity, btrim(p_capability), v_refs, btrim(p_description), 'open', v_routing, p_actor, v_now, v_now, p_correlation,
          v_now + make_interval(mins => (v_routing -> 'objectives' ->> 'response_minutes')::int),
          v_now + make_interval(mins => (v_routing -> 'objectives' ->> 'resolution_minutes')::int))
  RETURNING * INTO c;
  UPDATE service.cases SET response_timer_id = service.sv_schedule(c, 'sla.response', c.response_due_at, jsonb_build_object('objective', 'response'), p_actor, p_correlation),
                           resolution_timer_id = service.sv_schedule(c, 'sla.resolution', c.resolution_due_at, jsonb_build_object('objective', 'resolution'), p_actor, p_correlation)
   WHERE case_id = p_case RETURNING * INTO c;
  v_ev := service.sv_event(c, 'case.opened', p_actor, jsonb_build_object('severity', p_severity, 'routing', v_routing, 'objects', v_refs,
                                                                          'response_due_at', c.response_due_at, 'resolution_due_at', c.resolution_due_at), p_correlation);
  v_item := executive.b33_raise_routed(p_tenant, p_domain, 'service.case', 'service_case', p_case,
              format('Case %s (%s, %s routing) opened: %s', v_ref, p_severity, v_routing ->> 'tier', left(btrim(p_title), 120)),
              jsonb_build_array(jsonb_build_object('kind', 'case.opened', 'severity', p_severity, 'tier', v_routing ->> 'tier', 'response_due_at', c.response_due_at)),
              NULL, v_ev, 'case.opened', jsonb_build_object('case_ref', v_ref, 'routing_tier', v_routing ->> 'tier'), service.sv_dims(p_severity), p_actor, p_correlation);
  RETURN jsonb_build_object('case', service.sv_case_json(p_case), 'routing', v_routing, 'item', v_item);
END $$;
REVOKE ALL ON FUNCTION service.open_case(uuid, uuid, uuid, text, text, text, jsonb, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.open_case(uuid, uuid, uuid, text, text, text, jsonb, text, uuid, uuid) TO eye_commit;

/* TRIAGE (service.case.triage): the domain admin (the customer's service owner) or a support engineer under a live grant (case.note). open →
   triaged; the response objective is met by it (its timer cancelled). A RE-GRADE of the severity is the customer's (the domain admin, with a
   reason): the objectives are re-read for the case's tier and the new severity, the timers re-scheduled from the opening instant. */
CREATE OR REPLACE FUNCTION service.triage_case(p_case uuid, p_tenant uuid, p_domain uuid, p_expected int, p_severity text, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, executive, observation, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c service.cases%ROWTYPE; v_gate jsonb := '{}'::jsonb; v_eng boolean; pol service.sla_policies%ROWTYPE; v_regrade boolean := false; v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.case.triage']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service.sv_assert_actor('service case', p_actor);
  v_eng := service.sv_is_engineer(p_actor, p_tenant, p_domain);
  IF v_eng THEN
    v_gate := service.sv_engineer_gate(p_tenant, p_domain, p_actor, p_case, 'case.note', NULL, 'service_case', 'service case', 'triaging a case', p_correlation);
    IF v_gate ? 'refused' THEN RETURN v_gate; END IF;
  ELSE
    PERFORM service.sv_assert_customer('service case', p_actor, p_tenant, p_domain, ARRAY['domain_admin'], 'triaging a case');
  END IF;
  c := service.sv_case(p_tenant, p_domain, p_case, p_expected, 'service case');
  IF c.state <> 'open' THEN RAISE EXCEPTION 'service case rejected (state): case % is %, not open', c.case_ref, c.state USING ERRCODE = '23505'; END IF;
  IF length(btrim(coalesce(p_note, ''))) < 8 THEN RAISE EXCEPTION 'service case rejected (note): a triage states what was assessed (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_severity IS NOT NULL AND p_severity <> c.severity THEN
    IF v_eng THEN RAISE EXCEPTION 'service case rejected (severity): the severity is the customer''s statement — support proposes a re-grade in a note; the domain admin re-grades' USING ERRCODE = '22023'; END IF;
    SELECT * INTO pol FROM service.sla_policies p WHERE p.tier = c.routing ->> 'tier' AND p.severity = p_severity AND p.status = 'active';
    IF NOT FOUND THEN RAISE EXCEPTION 'service case rejected (severity): the severity is S1, S2, S3 or S4' USING ERRCODE = '22023'; END IF;
    v_regrade := true;
  END IF;
  UPDATE service.cases SET state = 'triaged', triaged_by = p_actor, triaged_at = v_now, responded_at = coalesce(responded_at, v_now), version = version + 1, updated_at = v_now,
         severity = CASE WHEN v_regrade THEN p_severity ELSE severity END,
         routing = CASE WHEN v_regrade THEN routing || jsonb_build_object('severity', p_severity, 'regraded_from', c.severity,
                     'objectives', jsonb_build_object('response_minutes', pol.response_minutes, 'resolution_minutes', pol.resolution_minutes, 'update_minutes', pol.update_minutes),
                     'policy', jsonb_build_object('tier', pol.tier, 'severity', pol.severity, 'version', pol.version, 'digest', pol.digest)) ELSE routing END,
         resolution_due_at = CASE WHEN v_regrade THEN opened_at + make_interval(mins => pol.resolution_minutes) ELSE resolution_due_at END
   WHERE case_id = p_case RETURNING * INTO c;
  PERFORM service.sv_cancel_timers(p_case, 'sla.response');
  IF v_regrade THEN
    PERFORM service.sv_cancel_timers(p_case, 'sla.resolution');
    UPDATE service.cases SET resolution_timer_id = service.sv_schedule(c, 'sla.resolution', greatest(c.resolution_due_at, v_now), jsonb_build_object('objective', 'resolution', 'regraded', true), p_actor, p_correlation)
     WHERE case_id = p_case RETURNING * INTO c;
  END IF;
  INSERT INTO service.case_notes (note_id, tenant_id, domain_id, case_id, author_principal_id, side, grant_id, kind, body, correlation_id)
  VALUES (gen_random_uuid(), p_tenant, p_domain, p_case, p_actor, CASE WHEN v_eng THEN 'support' ELSE 'customer' END, (v_gate ->> 'grant_id')::uuid, 'response', btrim(p_note), p_correlation);
  PERFORM service.sv_event(c, 'case.triaged', p_actor, jsonb_build_object('side', CASE WHEN v_eng THEN 'support' ELSE 'customer' END, 'grant_id', v_gate ->> 'grant_id',
                                                                         'regraded', v_regrade, 'severity', c.severity, 'response_met', c.responded_at <= c.response_due_at), p_correlation);
  RETURN jsonb_build_object('case', service.sv_case_json(p_case), 'grant_id', v_gate ->> 'grant_id');
END $$;
REVOKE ALL ON FUNCTION service.triage_case(uuid, uuid, uuid, int, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.triage_case(uuid, uuid, uuid, int, text, text, uuid, uuid) TO eye_commit;

/* NOTE (service.case.note): a customer role's note, or support's under a live grant (case.note — kind note | diagnosis). The first support
   note is a response (the response objective). A closed case takes no note (reopen it). */
CREATE OR REPLACE FUNCTION service.note_case(p_note uuid, p_case uuid, p_tenant uuid, p_domain uuid, p_kind text, p_body text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, executive, observation, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c service.cases%ROWTYPE; v_gate jsonb := '{}'::jsonb; v_eng boolean; v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.case.note']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service.sv_assert_actor('service case', p_actor);
  v_eng := service.sv_is_engineer(p_actor, p_tenant, p_domain);
  IF v_eng THEN
    v_gate := service.sv_engineer_gate(p_tenant, p_domain, p_actor, p_case, 'case.note', NULL, 'service_case', 'service case', 'a support note', p_correlation);
    IF v_gate ? 'refused' THEN RETURN v_gate; END IF;
  ELSE
    PERFORM service.sv_assert_customer('service case', p_actor, p_tenant, p_domain, NULL, 'a case note');
  END IF;
  c := service.sv_case(p_tenant, p_domain, p_case, NULL, 'service case');
  IF c.state = 'closed' THEN RAISE EXCEPTION 'service case rejected (state): case % is closed — reopen it to continue', c.case_ref USING ERRCODE = '23505'; END IF;
  IF coalesce(p_kind, 'note') NOT IN ('note', 'diagnosis') THEN RAISE EXCEPTION 'service case rejected (kind): a note is a note or a diagnosis' USING ERRCODE = '22023'; END IF;
  IF p_kind = 'diagnosis' AND NOT v_eng THEN RAISE EXCEPTION 'service case rejected (kind): a diagnosis note is support''s (under a grant)' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_body, ''))) NOT BETWEEN 4 AND 4000 THEN RAISE EXCEPTION 'service case rejected (body): a note has 4–4000 characters' USING ERRCODE = '22023'; END IF;
  INSERT INTO service.case_notes (note_id, tenant_id, domain_id, case_id, author_principal_id, side, grant_id, kind, body, correlation_id)
  VALUES (p_note, p_tenant, p_domain, p_case, p_actor, CASE WHEN v_eng THEN 'support' ELSE 'customer' END, (v_gate ->> 'grant_id')::uuid, coalesce(p_kind, 'note'), btrim(p_body), p_correlation);
  IF v_eng AND c.responded_at IS NULL THEN
    UPDATE service.cases SET responded_at = v_now, updated_at = v_now WHERE case_id = p_case RETURNING * INTO c;
    PERFORM service.sv_cancel_timers(p_case, 'sla.response');
  ELSE
    UPDATE service.cases SET updated_at = v_now WHERE case_id = p_case;
  END IF;
  PERFORM service.sv_event(c, 'case.noted', p_actor, jsonb_build_object('note_id', p_note, 'kind', coalesce(p_kind, 'note'), 'side', CASE WHEN v_eng THEN 'support' ELSE 'customer' END,
                                                                       'grant_id', v_gate ->> 'grant_id'), p_correlation);
  RETURN jsonb_build_object('note', (SELECT to_jsonb(n) FROM service.case_notes n WHERE n.note_id = p_note), 'grant_id', v_gate ->> 'grant_id');
END $$;
REVOKE ALL ON FUNCTION service.note_case(uuid, uuid, uuid, uuid, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.note_case(uuid, uuid, uuid, uuid, text, text, uuid, uuid) TO eye_commit;

/* PROGRESS (service.case.progress): the domain admin, or support under a live grant (case.note). To:
     awaiting_access    ← open | triaged | diagnosing                  (support needs (more) access the customer must approve)
     diagnosing         ← triaged | awaiting_access | workaround_offered | degraded_guidance
     cannot_reproduce   ← triaged | awaiting_access | diagnosing        (what was tried — the customer confirms closure or reopens)
     degraded_guidance  ← triaged | awaiting_access | diagnosing | workaround_offered   (SAFE guidance: what to do meanwhile and what is NOT
                          recovered; the resolution clock keeps running — nothing is shown recovered by inference)
     resolved           ← triaged | diagnosing | workaround_offered | degraded_guidance  (the resolution; the resolution objective met or late;
                          the customer's `service.closure_confirm` task opened)
   The statement is required (12+ characters). */
CREATE OR REPLACE FUNCTION service.progress_case(p_case uuid, p_tenant uuid, p_domain uuid, p_expected int, p_to text, p_statement text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, executive, observation, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c service.cases%ROWTYPE; v_gate jsonb := '{}'::jsonb; v_eng boolean; v_now timestamptz := clock_timestamp(); v_from text[]; v_task jsonb := NULL; v_assignee uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.case.progress']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service.sv_assert_actor('service case', p_actor);
  v_eng := service.sv_is_engineer(p_actor, p_tenant, p_domain);
  IF v_eng THEN
    v_gate := service.sv_engineer_gate(p_tenant, p_domain, p_actor, p_case, 'case.note', NULL, 'service_case', 'service case', format('moving a case to %s', coalesce(p_to, '?')), p_correlation);
    IF v_gate ? 'refused' THEN RETURN v_gate; END IF;
  ELSE
    PERFORM service.sv_assert_customer('service case', p_actor, p_tenant, p_domain, ARRAY['domain_admin'], 'progressing a case');
  END IF;
  c := service.sv_case(p_tenant, p_domain, p_case, p_expected, 'service case');
  v_from := CASE p_to WHEN 'awaiting_access' THEN ARRAY['open', 'triaged', 'diagnosing']
                      WHEN 'diagnosing' THEN ARRAY['triaged', 'awaiting_access', 'workaround_offered', 'degraded_guidance']
                      WHEN 'cannot_reproduce' THEN ARRAY['triaged', 'awaiting_access', 'diagnosing']
                      WHEN 'degraded_guidance' THEN ARRAY['triaged', 'awaiting_access', 'diagnosing', 'workaround_offered']
                      WHEN 'resolved' THEN ARRAY['triaged', 'diagnosing', 'workaround_offered', 'degraded_guidance'] END;
  IF v_from IS NULL THEN RAISE EXCEPTION 'service case rejected (to): a case progresses to awaiting_access, diagnosing, cannot_reproduce, degraded_guidance or resolved' USING ERRCODE = '22023'; END IF;
  IF NOT (c.state = ANY (v_from)) THEN
    RAISE EXCEPTION 'service case rejected (state): case % is % — % is reached from %', c.case_ref, c.state, p_to, array_to_string(v_from, ', ') USING ERRCODE = '23505';
  END IF;
  IF length(btrim(coalesce(p_statement, ''))) < 12 THEN
    RAISE EXCEPTION 'service case rejected (statement): % states %', p_to,
      CASE p_to WHEN 'degraded_guidance' THEN 'the safe guidance — what to do meanwhile and what is not recovered (12+ characters)'
                WHEN 'resolved' THEN 'the resolution (12+ characters)' WHEN 'cannot_reproduce' THEN 'what was tried (12+ characters)' ELSE 'why (12+ characters)' END USING ERRCODE = '22023';
  END IF;
  UPDATE service.cases SET state = p_to, version = version + 1, updated_at = v_now,
         responded_at = CASE WHEN v_eng THEN coalesce(responded_at, v_now) ELSE responded_at END,
         guidance = CASE WHEN p_to = 'degraded_guidance' THEN btrim(p_statement) ELSE guidance END,
         resolution = CASE WHEN p_to IN ('resolved', 'cannot_reproduce') THEN btrim(p_statement) ELSE resolution END,
         resolved_by = CASE WHEN p_to IN ('resolved', 'cannot_reproduce') THEN p_actor ELSE resolved_by END,
         resolved_at = CASE WHEN p_to IN ('resolved', 'cannot_reproduce') THEN v_now ELSE resolved_at END
   WHERE case_id = p_case RETURNING * INTO c;
  IF v_eng THEN PERFORM service.sv_cancel_timers(p_case, 'sla.response'); END IF;
  IF p_to IN ('resolved', 'cannot_reproduce') THEN
    PERFORM service.sv_cancel_timers(p_case, 'sla.resolution');
    v_assignee := CASE WHEN executive.task_holder_ok(c.opened_by, p_tenant, 'service.closure_confirm') AND NOT service.sv_is_engineer(c.opened_by, p_tenant, p_domain) THEN c.opened_by END;
    v_task := executive._open_human_task(gen_random_uuid(), p_tenant, p_domain, 'service.closure_confirm', format('service.closure_confirm:%s:%s', p_case, c.version),
                jsonb_build_object('kind', 'service_case', 'id', p_case), format('Confirm the closure of %s (%s) — or reopen it', c.case_ref, p_to), v_assignee,
                ARRAY['domain_admin'], jsonb_build_object('customer_roles', to_jsonb(service.sv_customer_roles())), NULL, '{}'::jsonb, NULL, NULL, p_actor, p_correlation);
  END IF;
  PERFORM service.sv_event(c, 'case.' || p_to, p_actor, jsonb_build_object('statement', btrim(p_statement), 'side', CASE WHEN v_eng THEN 'support' ELSE 'customer' END, 'grant_id', v_gate ->> 'grant_id',
                                                                          'resolution_met', CASE WHEN p_to IN ('resolved', 'cannot_reproduce') THEN v_now <= c.resolution_due_at END,
                                                                          'closure_task', v_task), p_correlation);
  RETURN jsonb_build_object('case', service.sv_case_json(p_case), 'grant_id', v_gate ->> 'grant_id', 'closure_task', v_task);
END $$;
REVOKE ALL ON FUNCTION service.progress_case(uuid, uuid, uuid, int, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.progress_case(uuid, uuid, uuid, int, text, text, uuid, uuid) TO eye_commit;

/* WORKAROUND PROPOSAL (service.case.workaround.propose): support under a live grant (case.workaround) or the domain admin. The workaround
   names the governed act the CUSTOMER performs ({action, object_type?, object_id?}) — never a service.* act, never one support performs.
   → workaround_offered. */
CREATE OR REPLACE FUNCTION service.propose_workaround(p_case uuid, p_tenant uuid, p_domain uuid, p_expected int, p_steps text, p_act jsonb, p_risk text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, executive, observation, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c service.cases%ROWTYPE; v_gate jsonb := '{}'::jsonb; v_eng boolean; v_now timestamptz := clock_timestamp(); v_w jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.case.workaround.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service.sv_assert_actor('service case', p_actor);
  v_eng := service.sv_is_engineer(p_actor, p_tenant, p_domain);
  IF v_eng THEN
    v_gate := service.sv_engineer_gate(p_tenant, p_domain, p_actor, p_case, 'case.workaround', NULL, 'service_case', 'service case', 'proposing a workaround', p_correlation);
    IF v_gate ? 'refused' THEN RETURN v_gate; END IF;
  ELSE
    PERFORM service.sv_assert_customer('service case', p_actor, p_tenant, p_domain, ARRAY['domain_admin'], 'proposing a workaround');
  END IF;
  c := service.sv_case(p_tenant, p_domain, p_case, p_expected, 'service case');
  IF c.state NOT IN ('triaged', 'awaiting_access', 'diagnosing', 'degraded_guidance') THEN
    RAISE EXCEPTION 'service case rejected (state): case % is % — a workaround is offered on a triaged, awaiting-access, diagnosing or degraded case', c.case_ref, c.state USING ERRCODE = '23505';
  END IF;
  IF length(btrim(coalesce(p_steps, ''))) < 12 THEN RAISE EXCEPTION 'service case rejected (workaround): a workaround states its steps (12+ characters)' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(p_act) IS DISTINCT FROM 'object' OR coalesce(p_act ->> 'action', '') !~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$' THEN
    RAISE EXCEPTION 'service case rejected (act): a workaround names the governed act the customer performs ({action, object_type?, object_id?})' USING ERRCODE = '22023';
  END IF;
  IF p_act ->> 'action' LIKE 'service.%' OR p_act ->> 'action' LIKE 'support.%' THEN
    RAISE EXCEPTION 'service case rejected (act): a workaround is the customer''s own governed act on their domain — never a service or support act' USING ERRCODE = '22023';
  END IF;
  v_w := jsonb_build_object('steps', btrim(p_steps), 'act', jsonb_build_object('action', p_act ->> 'action', 'object_type', p_act ->> 'object_type', 'object_id', p_act ->> 'object_id'),
                            'risk', nullif(btrim(coalesce(p_risk, '')), ''), 'proposed_by', p_actor, 'side', CASE WHEN v_eng THEN 'support' ELSE 'customer' END,
                            'grant_id', v_gate ->> 'grant_id', 'proposed_at', v_now, 'source', 'proposal', 'executor', 'the customer''s own role');
  UPDATE service.cases SET state = 'workaround_offered', workaround = v_w, workaround_executed = NULL, version = version + 1, updated_at = v_now,
         responded_at = CASE WHEN v_eng THEN coalesce(responded_at, v_now) ELSE responded_at END
   WHERE case_id = p_case RETURNING * INTO c;
  IF v_eng THEN PERFORM service.sv_cancel_timers(p_case, 'sla.response'); END IF;
  PERFORM service.sv_event(c, 'case.workaround_offered', p_actor, jsonb_build_object('workaround', v_w), p_correlation);
  RETURN jsonb_build_object('case', service.sv_case_json(p_case), 'grant_id', v_gate ->> 'grant_id');
END $$;
REVOKE ALL ON FUNCTION service.propose_workaround(uuid, uuid, uuid, int, text, jsonb, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.propose_workaround(uuid, uuid, uuid, int, text, jsonb, text, uuid, uuid) TO eye_commit;

/* WORKAROUND EXECUTED (service.case.workaround.execute): the CUSTOMER's case act linking the governed act they performed — a policy decision
   of this domain, ALLOWED, made for the acting customer AFTER the workaround was offered, of the act the workaround names (when it names
   one) and never a service/support act. A support engineer never records it (403 actor). The case stays workaround_offered (resolution is
   a separate act). */
CREATE OR REPLACE FUNCTION service.record_workaround_execution(p_case uuid, p_tenant uuid, p_domain uuid, p_expected int, p_policy_decision uuid, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, policy, observation, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c service.cases%ROWTYPE; d policy.policy_decisions%ROWTYPE; v_now timestamptz := clock_timestamp(); v_x jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.case.workaround.execute']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service.sv_assert_actor('service case', p_actor);
  PERFORM service.sv_assert_customer('service case', p_actor, p_tenant, p_domain, NULL, 'executing a workaround');
  c := service.sv_case(p_tenant, p_domain, p_case, p_expected, 'service case');
  IF c.state <> 'workaround_offered' OR c.workaround IS NULL THEN
    RAISE EXCEPTION 'service case rejected (state): case % is % — no workaround is on offer', c.case_ref, c.state USING ERRCODE = '23505';
  END IF;
  SELECT * INTO d FROM policy.policy_decisions x WHERE x.id = p_policy_decision;
  IF NOT FOUND OR d.tenant_id IS DISTINCT FROM p_tenant OR d.domain_id IS DISTINCT FROM p_domain THEN
    RAISE EXCEPTION 'service case rejected (unknown_decision): % is not a policy decision of this domain', p_policy_decision USING ERRCODE = '23503';
  END IF;
  IF d.decision NOT IN ('allow', 'allow_with_obligations') THEN
    RAISE EXCEPTION 'service case rejected (act): decision % was %, not an allowed act', p_policy_decision, d.decision USING ERRCODE = '22023';
  END IF;
  IF d.principal_id <> 'principal:' || p_actor::text THEN
    RAISE EXCEPTION 'service case rejected (ownership): the linked act was performed by another principal — the customer who performed it records its execution' USING ERRCODE = '42501';
  END IF;
  IF d.action LIKE 'service.%' OR d.action LIKE 'support.%' OR d.action LIKE '%.read' THEN
    RAISE EXCEPTION 'service case rejected (act): % is not a workaround act on the customer''s domain', d.action USING ERRCODE = '22023';
  END IF;
  IF d.created_at < (c.workaround ->> 'proposed_at')::timestamptz THEN
    RAISE EXCEPTION 'service case rejected (act): the linked act preceded the workaround''s offer' USING ERRCODE = '22023';
  END IF;
  IF coalesce(c.workaround -> 'act' ->> 'action', '') <> '' AND d.action <> c.workaround -> 'act' ->> 'action' THEN
    RAISE EXCEPTION 'service case rejected (act): the workaround names %, the linked act is %', c.workaround -> 'act' ->> 'action', d.action USING ERRCODE = '22023';
  END IF;
  v_x := jsonb_build_object('policy_decision_id', d.id, 'action', d.action, 'object_type', d.object_type, 'object_id', d.object_id, 'decided_at', d.created_at,
                            'executed_by', p_actor, 'recorded_at', v_now, 'note', nullif(btrim(coalesce(p_note, '')), ''));
  UPDATE service.cases SET workaround_executed = v_x, version = version + 1, updated_at = v_now WHERE case_id = p_case RETURNING * INTO c;
  PERFORM service.sv_event(c, 'case.workaround_executed', p_actor, jsonb_build_object('executed', v_x), p_correlation);
  RETURN jsonb_build_object('case', service.sv_case_json(p_case));
END $$;
REVOKE ALL ON FUNCTION service.record_workaround_execution(uuid, uuid, uuid, int, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.record_workaround_execution(uuid, uuid, uuid, int, uuid, text, uuid, uuid) TO eye_commit;

/* KNOWN-ERROR REUSE (service.case.known_error.reuse): support under a live grant (case.workaround) or the domain admin offers a PUBLISHED known
   error's workaround on a new case: the reuse recorded, the case linked to the known error's problem, → workaround_offered. */
CREATE OR REPLACE FUNCTION service.reuse_known_error(p_case uuid, p_tenant uuid, p_domain uuid, p_expected int, p_known_error uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, executive, observation, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c service.cases%ROWTYPE; k service.known_errors%ROWTYPE; v_gate jsonb := '{}'::jsonb; v_eng boolean; v_now timestamptz := clock_timestamp(); v_w jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.case.known_error.reuse']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service.sv_assert_actor('known error', p_actor);
  v_eng := service.sv_is_engineer(p_actor, p_tenant, p_domain);
  IF v_eng THEN
    v_gate := service.sv_engineer_gate(p_tenant, p_domain, p_actor, p_case, 'case.workaround', NULL, 'service_case', 'known error', 'reusing a known error', p_correlation);
    IF v_gate ? 'refused' THEN RETURN v_gate; END IF;
  ELSE
    PERFORM service.sv_assert_customer('known error', p_actor, p_tenant, p_domain, ARRAY['domain_admin'], 'reusing a known error');
  END IF;
  c := service.sv_case(p_tenant, p_domain, p_case, p_expected, 'known error');
  SELECT * INTO k FROM service.known_errors x WHERE x.known_error_id = p_known_error AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'known error rejected (unknown_known_error): % is not a known error of this domain', p_known_error USING ERRCODE = '23503'; END IF;
  IF k.state <> 'published' THEN RAISE EXCEPTION 'known error rejected (state): % is %', k.ke_ref, k.state USING ERRCODE = '23505'; END IF;
  IF c.state NOT IN ('open', 'triaged', 'awaiting_access', 'diagnosing', 'degraded_guidance') THEN
    RAISE EXCEPTION 'known error rejected (state): case % is % — a known error is reused on an open, triaged, awaiting-access, diagnosing or degraded case', c.case_ref, c.state USING ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM service.known_error_uses u WHERE u.known_error_id = p_known_error AND u.case_id = p_case) THEN
    RAISE EXCEPTION 'known error rejected (duplicate): % is already reused on case %', k.ke_ref, c.case_ref USING ERRCODE = '23505';
  END IF;
  INSERT INTO service.known_error_uses (use_id, tenant_id, domain_id, known_error_id, case_id, used_by, side, grant_id, correlation_id)
  VALUES (gen_random_uuid(), p_tenant, p_domain, p_known_error, p_case, p_actor, CASE WHEN v_eng THEN 'support' ELSE 'customer' END, (v_gate ->> 'grant_id')::uuid, p_correlation);
  IF NOT EXISTS (SELECT 1 FROM service.problem_cases pc WHERE pc.problem_id = k.problem_id AND pc.case_id = p_case) THEN
    INSERT INTO service.problem_cases (problem_id, case_id, tenant_id, domain_id, linked_by, reason)
    VALUES (k.problem_id, p_case, p_tenant, p_domain, p_actor, format('linked by the reuse of known error %s', k.ke_ref));
  END IF;
  v_w := jsonb_build_object('steps', k.workaround, 'act', k.workaround_act, 'risk', NULL, 'proposed_by', p_actor, 'side', CASE WHEN v_eng THEN 'support' ELSE 'customer' END,
                            'grant_id', v_gate ->> 'grant_id', 'proposed_at', v_now, 'source', 'known_error', 'known_error_id', k.known_error_id, 'ke_ref', k.ke_ref, 'ke_digest', k.digest,
                            'executor', 'the customer''s own role');
  UPDATE service.cases SET state = 'workaround_offered', workaround = v_w, workaround_executed = NULL, known_error_id = k.known_error_id, problem_id = coalesce(problem_id, k.problem_id),
         version = version + 1, updated_at = v_now, responded_at = coalesce(responded_at, v_now)
   WHERE case_id = p_case RETURNING * INTO c;
  PERFORM service.sv_cancel_timers(p_case, 'sla.response');
  PERFORM service.sv_event(c, 'case.known_error_reused', p_actor, jsonb_build_object('known_error_id', k.known_error_id, 'ke_ref', k.ke_ref, 'problem_id', k.problem_id, 'workaround', v_w), p_correlation);
  PERFORM onboarding.ledger('service', p_tenant, p_domain, 'known_error', k.known_error_id, NULL, 'known_error.reused', p_actor,
                            jsonb_build_object('ke_ref', k.ke_ref, 'case_id', p_case, 'case_ref', c.case_ref), p_correlation);
  RETURN jsonb_build_object('case', service.sv_case_json(p_case), 'known_error', to_jsonb(k), 'grant_id', v_gate ->> 'grant_id');
END $$;
REVOKE ALL ON FUNCTION service.reuse_known_error(uuid, uuid, uuid, int, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.reuse_known_error(uuid, uuid, uuid, int, uuid, uuid, uuid) TO eye_commit;

/* THE BUNDLE'S ITEMS (internal): the records under the case's scope — the case's facts, its customer and support notes, and for each source
   it names: the contract's state (person fields and endpoints / credential references REDACTED; a restricted source's name and publisher
   REDACTED), its recent runs (failure reasons with any URL query REDACTED), its health events; the EVIDENCE CONTENT of a source is ALWAYS
   WITHHELD (the customer's data — shared through the customer's own governed export). For support, a source outside the grant's object
   scope is WITHHELD with that reason (and logged by the caller). */
CREATE OR REPLACE FUNCTION service.sv_bundle_items(c service.cases, p_engineer uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, observation, pg_catalog, pg_temp AS $$
DECLARE v jsonb := '[]'::jsonb; o jsonb; s observation.source_contracts_current%ROWTYPE; v_in boolean; v_src uuid; v_runs jsonb; v_health jsonb; v_restricted boolean;
BEGIN
  v := v || jsonb_build_array(jsonb_build_object('kind', 'case', 'id', c.case_id, 'disposition', 'included',
           'content', jsonb_build_object('case_ref', c.case_ref, 'title', c.title, 'severity', c.severity, 'capability', c.affected_capability, 'state', c.state, 'version', c.version,
                                         'description', c.description, 'routing_tier', c.routing ->> 'tier', 'opened_at', c.opened_at, 'objects', c.object_refs)));
  v := v || jsonb_build_array(jsonb_build_object('kind', 'notes', 'id', c.case_id, 'disposition', 'included',
           'content', coalesce((SELECT jsonb_agg(jsonb_build_object('side', n.side, 'kind', n.kind, 'body', n.body, 'at', n.at) ORDER BY n.at) FROM service.case_notes n WHERE n.case_id = c.case_id), '[]'::jsonb),
           'redactions', jsonb_build_array('note authors are shown by side, never by person')));
  FOR o IN SELECT * FROM jsonb_array_elements(c.object_refs) LOOP
    v_src := CASE WHEN o ->> 'kind' = 'source' THEN (o ->> 'id')::uuid
                  ELSE (SELECT r.source_id FROM observation.collection_runs_current r WHERE r.run_id = (o ->> 'id')::uuid) END;
    v_in := p_engineer IS NULL OR service.live_grant(c.tenant_id, c.domain_id, p_engineer, c.case_id, 'case.bundle', v_src) IS NOT NULL;
    IF NOT v_in THEN
      v := v || jsonb_build_array(jsonb_build_object('kind', o ->> 'kind', 'id', o ->> 'id', 'disposition', 'withheld',
                 'reason', 'outside the support grant''s object scope — the grant names the sources support may see'));
      PERFORM service.log_access(c.tenant_id, c.domain_id, NULL, p_engineer, 'case.bundle', o ->> 'kind', o ->> 'id', 'refused',
                                 jsonb_build_object('what', 'a bundle item outside the grant''s object scope', 'case', c.case_ref), p_correlation);
      CONTINUE;
    END IF;
    SELECT * INTO s FROM observation.source_contracts_current x WHERE x.source_id = v_src ORDER BY x.contract_version DESC LIMIT 1;
    IF s.source_id IS NULL THEN
      v := v || jsonb_build_array(jsonb_build_object('kind', o ->> 'kind', 'id', o ->> 'id', 'disposition', 'withheld', 'reason', 'the record no longer exists in this domain'));
      CONTINUE;
    END IF;
    v_restricted := s.classification_ceiling = 'restricted';
    v := v || jsonb_build_array(jsonb_build_object('kind', 'source.contract', 'id', s.source_id, 'disposition', 'redacted',
             'content', jsonb_build_object('source_key', s.source_key, 'name', CASE WHEN v_restricted THEN '[redacted: restricted classification]' ELSE s.name END,
                                           'publisher', CASE WHEN v_restricted THEN '[redacted: restricted classification]' ELSE s.publisher END,
                                           'contract_version', s.contract_version, 'lifecycle_state', s.lifecycle_state, 'rights_state', s.rights_state, 'connector_kind', s.connector_kind,
                                           'acquisition_mode', s.acquisition_mode, 'data_origin', s.data_origin, 'cadence_seconds', s.cadence_seconds,
                                           'freshness_threshold_seconds', s.freshness_threshold_seconds, 'classification_ceiling', s.classification_ceiling),
             'redactions', jsonb_build_array('registrar and approver (persons) are never bundled', 'endpoints and credential references are never bundled')
                           || CASE WHEN v_restricted THEN jsonb_build_array('name and publisher: restricted classification') ELSE '[]'::jsonb END));
    SELECT coalesce(jsonb_agg(jsonb_build_object('run_id', r.run_id, 'state', r.state, 'started_at', r.started_at, 'finished_at', r.finished_at, 'items_fetched', r.items_fetched,
                                                 'items_admitted', r.items_admitted, 'items_quarantined', r.items_quarantined,
                                                 'failure_reason', regexp_replace(r.failure_reason, '\?[^\s]*', '?[redacted]', 'g')) ORDER BY r.started_at DESC), '[]'::jsonb)
      INTO v_runs FROM (SELECT * FROM observation.collection_runs_current r WHERE r.source_id = s.source_id ORDER BY r.started_at DESC LIMIT 10) r;
    v := v || jsonb_build_array(jsonb_build_object('kind', 'source.runs', 'id', s.source_id, 'disposition', 'redacted', 'content', v_runs,
             'redactions', jsonb_build_array('URL query strings in failure reasons are redacted', 'the agent principals are never bundled')));
    SELECT coalesce(jsonb_agg(jsonb_build_object('state', h.new_state, 'prior', h.prior_state, 'lag_class', h.lag_class, 'reason', h.reason, 'evaluated_at', h.evaluated_at) ORDER BY h.evaluated_at DESC), '[]'::jsonb)
      INTO v_health FROM (SELECT * FROM observation.source_health_events h WHERE h.source_id = s.source_id ORDER BY h.evaluated_at DESC LIMIT 10) h;
    v := v || jsonb_build_array(jsonb_build_object('kind', 'source.health', 'id', s.source_id, 'disposition', 'included', 'content', v_health));
    v := v || jsonb_build_array(jsonb_build_object('kind', 'source.evidence', 'id', s.source_id, 'disposition', 'withheld',
             'reason', 'evidence content is the customer''s data — never in a support bundle (the customer shares it through their own governed export)'));
  END LOOP;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION service.sv_bundle_items(service.cases, uuid, uuid) FROM PUBLIC;

/* THE EVIDENCE BUNDLE (service.case.bundle): support under a live grant (case.bundle — the object scope decides which sources), or the
   domain admin / a data steward (the case's whole scope). Digested; the counts say what was included, redacted and withheld. */
CREATE OR REPLACE FUNCTION service.assemble_bundle(p_bundle uuid, p_case uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, executive, observation, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c service.cases%ROWTYPE; v_gate jsonb := '{}'::jsonb; v_eng boolean; v_items jsonb; v_counts jsonb; v_digest text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.case.bundle']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service.sv_assert_actor('evidence bundle', p_actor);
  v_eng := service.sv_is_engineer(p_actor, p_tenant, p_domain);
  IF v_eng THEN
    v_gate := service.sv_engineer_gate(p_tenant, p_domain, p_actor, p_case, 'case.bundle', NULL, 'service_case', 'evidence bundle', 'assembling an evidence bundle', p_correlation);
    IF v_gate ? 'refused' THEN RETURN v_gate; END IF;
  ELSE
    PERFORM service.sv_assert_customer('evidence bundle', p_actor, p_tenant, p_domain, ARRAY['domain_admin', 'data_steward'], 'assembling an evidence bundle');
  END IF;
  c := service.sv_case(p_tenant, p_domain, p_case, NULL, 'evidence bundle');
  IF c.state = 'closed' THEN RAISE EXCEPTION 'evidence bundle rejected (state): case % is closed', c.case_ref USING ERRCODE = '23505'; END IF;
  v_items := service.sv_bundle_items(c, CASE WHEN v_eng THEN p_actor END, p_correlation);
  SELECT jsonb_build_object('included', count(*) FILTER (WHERE e ->> 'disposition' = 'included'), 'redacted', count(*) FILTER (WHERE e ->> 'disposition' = 'redacted'),
                            'withheld', count(*) FILTER (WHERE e ->> 'disposition' = 'withheld'), 'items', count(*))
    INTO v_counts FROM jsonb_array_elements(v_items) e;
  v_digest := onboarding.digest(jsonb_build_object('case_id', p_case, 'case_version', c.version, 'items', v_items));
  INSERT INTO service.evidence_bundles (bundle_id, tenant_id, domain_id, case_id, case_version, assembled_by, side, grant_id, items, counts, digest, correlation_id)
  VALUES (p_bundle, p_tenant, p_domain, p_case, c.version, p_actor, CASE WHEN v_eng THEN 'support' ELSE 'customer' END, (v_gate ->> 'grant_id')::uuid, v_items, v_counts, v_digest, p_correlation);
  PERFORM service.sv_event(c, 'case.bundle_assembled', p_actor, jsonb_build_object('bundle_id', p_bundle, 'digest', v_digest, 'counts', v_counts, 'grant_id', v_gate ->> 'grant_id'), p_correlation);
  RETURN jsonb_build_object('bundle', (SELECT to_jsonb(b) FROM service.evidence_bundles b WHERE b.bundle_id = p_bundle), 'grant_id', v_gate ->> 'grant_id');
END $$;
REVOKE ALL ON FUNCTION service.assemble_bundle(uuid, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.assemble_bundle(uuid, uuid, uuid, uuid, uuid, uuid) TO eye_commit;

/* CLOSURE (service.case.close, human-gated): the CUSTOMER's confirmation — a named human holding a customer role, never support. From
   resolved (outcome resolved) or cannot_reproduce (outcome not_reproduced); refused while a commitment is open. The closure task resolved,
   the case's routed items closed, any pending SLA timer cancelled. */
CREATE OR REPLACE FUNCTION service.confirm_closure(p_case uuid, p_tenant uuid, p_domain uuid, p_expected int, p_outcome text, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, executive, observation, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c service.cases%ROWTYPE; v_now timestamptz := clock_timestamp(); v_open text; v_task jsonb; v_items jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.case.close']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service.sv_assert_actor('service case', p_actor);
  PERFORM service.sv_assert_customer('service case', p_actor, p_tenant, p_domain, NULL, 'confirming a closure');
  c := service.sv_case(p_tenant, p_domain, p_case, p_expected, 'service case');
  IF NOT ((c.state = 'resolved' AND p_outcome = 'resolved') OR (c.state = 'cannot_reproduce' AND p_outcome = 'not_reproduced')) THEN
    RAISE EXCEPTION 'service case rejected (state): case % is % — closure confirms a resolved case (outcome resolved) or a case support could not reproduce (outcome not_reproduced)', c.case_ref, c.state
      USING ERRCODE = '23505';
  END IF;
  IF length(btrim(coalesce(p_note, ''))) < 8 THEN RAISE EXCEPTION 'service case rejected (note): the customer states what they verified (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT string_agg(format('%s (%s, due %s)', m.kind, m.state, m.due_at), '; ') INTO v_open FROM service.commitments m WHERE m.case_id = p_case AND m.state IN ('open', 'breached');
  IF v_open IS NOT NULL THEN
    RAISE EXCEPTION 'service case rejected (state): case % has unsettled commitments — %; settle or withdraw them first', c.case_ref, v_open USING ERRCODE = '23505';
  END IF;
  UPDATE service.cases SET state = 'closed', closed_at = v_now, closed_by = p_actor, version = version + 1, updated_at = v_now,
         closure = jsonb_build_object('outcome', p_outcome, 'note', btrim(p_note), 'confirmed_by', p_actor, 'confirmed_at', v_now, 'confirmation', 'the customer''s',
                                      'resolution_met', c.resolved_at <= c.resolution_due_at)
   WHERE case_id = p_case RETURNING * INTO c;
  PERFORM service.sv_cancel_timers(p_case, NULL);
  v_task := executive._resolve_human_tasks(p_tenant, p_domain, jsonb_build_object('kind', 'service_case', 'id', p_case), ARRAY['service.closure_confirm'], 'confirmed', p_case, p_actor, p_correlation);
  v_items := executive.b33_close_items(p_tenant, p_domain, 'service.case', 'service_case', p_case, format('case %s closed — the customer confirmed (%s)', c.case_ref, p_outcome), p_actor, p_correlation);
  PERFORM service.sv_event(c, 'case.closed', p_actor, jsonb_build_object('outcome', p_outcome, 'note', btrim(p_note), 'tasks', v_task, 'items_closed', v_items), p_correlation);
  RETURN jsonb_build_object('case', service.sv_case_json(p_case), 'tasks', v_task, 'items_closed', v_items);
END $$;
REVOKE ALL ON FUNCTION service.confirm_closure(uuid, uuid, uuid, int, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.confirm_closure(uuid, uuid, uuid, int, text, text, uuid, uuid) TO eye_commit;

/* REOPEN ON REGRESSION (service.case.reopen): a customer role, with the regression stated. resolved | cannot_reproduce | closed → triaged;
   the reopen counted; the resolution objective restarts from now (a new sla.resolution timer); the open closure task cancelled; a
   `service.case` item raised for the regression. */
CREATE OR REPLACE FUNCTION service.reopen_case(p_case uuid, p_tenant uuid, p_domain uuid, p_expected int, p_regression text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, executive, observation, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c service.cases%ROWTYPE; v_now timestamptz := clock_timestamp(); v_ev uuid; v_item jsonb; v_prior text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.case.reopen']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service.sv_assert_actor('service case', p_actor);
  PERFORM service.sv_assert_customer('service case', p_actor, p_tenant, p_domain, NULL, 'reopening a case');
  c := service.sv_case(p_tenant, p_domain, p_case, p_expected, 'service case');
  IF c.state NOT IN ('resolved', 'cannot_reproduce', 'closed') THEN
    RAISE EXCEPTION 'service case rejected (state): case % is % — a resolved, unreproduced or closed case is reopened', c.case_ref, c.state USING ERRCODE = '23505';
  END IF;
  IF length(btrim(coalesce(p_regression, ''))) < 12 THEN RAISE EXCEPTION 'service case rejected (regression): a reopening states the regression (12+ characters)' USING ERRCODE = '22023'; END IF;
  v_prior := c.state;
  UPDATE service.cases SET state = 'triaged', closed_at = NULL, closed_by = NULL, resolved_at = NULL, resolved_by = NULL, reopen_count = reopen_count + 1, version = version + 1,
         updated_at = v_now, resolution_breached_at = NULL,
         resolution_due_at = v_now + make_interval(mins => (routing -> 'objectives' ->> 'resolution_minutes')::int),
         closure = CASE WHEN closure IS NULL THEN NULL ELSE closure || jsonb_build_object('reopened_at', v_now) END
   WHERE case_id = p_case RETURNING * INTO c;
  PERFORM service.sv_cancel_timers(p_case, 'sla.resolution');
  UPDATE service.cases SET resolution_timer_id = service.sv_schedule(c, 'sla.resolution', c.resolution_due_at, jsonb_build_object('objective', 'resolution', 'reopen', c.reopen_count), p_actor, p_correlation)
   WHERE case_id = p_case RETURNING * INTO c;
  PERFORM executive._cancel_human_tasks(p_tenant, p_domain, jsonb_build_object('kind', 'service_case', 'id', p_case), ARRAY['service.closure_confirm'],
                                        'the case was reopened on a regression', p_actor, p_correlation);
  v_ev := service.sv_event(c, 'case.reopened', p_actor, jsonb_build_object('regression', btrim(p_regression), 'from', v_prior, 'reopen_count', c.reopen_count,
                                                                          'resolution_due_at', c.resolution_due_at), p_correlation);
  v_item := executive.b33_raise_routed(p_tenant, p_domain, 'service.case', 'service_case', p_case,
              format('Case %s reopened on a regression (%s): %s', c.case_ref, c.severity, left(btrim(p_regression), 120)),
              jsonb_build_array(jsonb_build_object('kind', 'case.reopened', 'severity', c.severity, 'reopen_count', c.reopen_count)), NULL, v_ev, 'case.reopened',
              jsonb_build_object('case_ref', c.case_ref), service.sv_dims(c.severity), p_actor, p_correlation);
  RETURN jsonb_build_object('case', service.sv_case_json(p_case), 'item', v_item);
END $$;
REVOKE ALL ON FUNCTION service.reopen_case(uuid, uuid, uuid, int, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.reopen_case(uuid, uuid, uuid, int, text, uuid, uuid) TO eye_commit;

/* THE ENGINEER'S CASE READ (service.case.support_read): the case as support may see it — under a live grant (case.note), LOGGED; refused
   and logged without one (answered, not raised: the read's transaction commits the log). Customer notes included (written for support);
   persons shown by side. */
CREATE OR REPLACE FUNCTION service.support_read_case(p_case uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, observation, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_gate jsonb; c service.cases%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.case.support_read']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service.sv_assert_actor('support access', p_actor);
  IF NOT service.sv_is_engineer(p_actor, p_tenant, p_domain) THEN
    RAISE EXCEPTION 'support access rejected (authority): the support read is a support engineer''s (customers read the case through service.read)' USING ERRCODE = '42501';
  END IF;
  v_gate := service.sv_engineer_gate(p_tenant, p_domain, p_actor, p_case, 'case.note', NULL, 'service_case', 'support access', 'reading a case', p_correlation);
  IF v_gate ? 'refused' THEN RETURN v_gate; END IF;
  SELECT * INTO c FROM service.cases x WHERE x.case_id = p_case AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  RETURN jsonb_build_object('grant_id', v_gate ->> 'grant_id',
    'case', jsonb_build_object('case_id', c.case_id, 'case_ref', c.case_ref, 'title', c.title, 'severity', c.severity, 'affected_capability', c.affected_capability,
                               'object_refs', c.object_refs, 'description', c.description, 'state', c.state, 'version', c.version, 'routing', c.routing,
                               'response_due_at', c.response_due_at, 'resolution_due_at', c.resolution_due_at, 'workaround', c.workaround, 'guidance', c.guidance, 'resolution', c.resolution),
    'notes', coalesce((SELECT jsonb_agg(jsonb_build_object('side', n.side, 'kind', n.kind, 'body', n.body, 'at', n.at) ORDER BY n.at) FROM service.case_notes n WHERE n.case_id = p_case), '[]'::jsonb),
    'commitments', coalesce((SELECT jsonb_agg(jsonb_build_object('commitment_id', m.commitment_id, 'kind', m.kind, 'statement', m.statement, 'due_at', m.due_at, 'state', m.state) ORDER BY m.due_at)
                             FROM service.commitments m WHERE m.case_id = p_case), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION service.support_read_case(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.support_read_case(uuid, uuid, uuid, uuid, uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §SV.5 COMMITMENTS
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/* RECORD (service.commitment.record): support under a live grant (case.note) or the domain admin; on a case not closed; due within 90 days. */
CREATE OR REPLACE FUNCTION service.record_commitment(p_commitment uuid, p_case uuid, p_tenant uuid, p_domain uuid, p_kind text, p_statement text, p_due timestamptz, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, observation, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c service.cases%ROWTYPE; v_gate jsonb := '{}'::jsonb; v_eng boolean;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.commitment.record']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service.sv_assert_actor('service commitment', p_actor);
  v_eng := service.sv_is_engineer(p_actor, p_tenant, p_domain);
  IF v_eng THEN
    v_gate := service.sv_engineer_gate(p_tenant, p_domain, p_actor, p_case, 'case.note', NULL, 'service_case', 'service commitment', 'recording a commitment', p_correlation);
    IF v_gate ? 'refused' THEN RETURN v_gate; END IF;
  ELSE
    PERFORM service.sv_assert_customer('service commitment', p_actor, p_tenant, p_domain, ARRAY['domain_admin'], 'recording a commitment');
  END IF;
  c := service.sv_case(p_tenant, p_domain, p_case, NULL, 'service commitment');
  IF c.state = 'closed' THEN RAISE EXCEPTION 'service commitment rejected (state): case % is closed', c.case_ref USING ERRCODE = '23505'; END IF;
  IF coalesce(p_kind, '') NOT IN ('update', 'workaround', 'fix', 'review', 'other') THEN
    RAISE EXCEPTION 'service commitment rejected (kind): a commitment is an update, a workaround, a fix, a review or other' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_statement, ''))) < 8 THEN RAISE EXCEPTION 'service commitment rejected (statement): a commitment states what is committed (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_due IS NULL OR p_due <= clock_timestamp() OR p_due > clock_timestamp() + interval '90 days' THEN
    RAISE EXCEPTION 'service commitment rejected (due): a commitment is due in the future, within 90 days' USING ERRCODE = '22023';
  END IF;
  INSERT INTO service.commitments (commitment_id, tenant_id, domain_id, case_id, kind, statement, due_at, made_by, side, grant_id, correlation_id)
  VALUES (p_commitment, p_tenant, p_domain, p_case, p_kind, btrim(p_statement), p_due, p_actor, CASE WHEN v_eng THEN 'support' ELSE 'customer' END, (v_gate ->> 'grant_id')::uuid, p_correlation);
  PERFORM onboarding.ledger('service', p_tenant, p_domain, 'commitment', p_commitment, NULL, 'commitment.recorded', p_actor,
                            jsonb_build_object('case_id', p_case, 'case_ref', c.case_ref, 'kind', p_kind, 'due_at', p_due, 'grant_id', v_gate ->> 'grant_id'), p_correlation);
  RETURN jsonb_build_object('commitment', (SELECT to_jsonb(m) FROM service.commitments m WHERE m.commitment_id = p_commitment), 'grant_id', v_gate ->> 'grant_id');
END $$;
REVOKE ALL ON FUNCTION service.record_commitment(uuid, uuid, uuid, uuid, text, text, timestamptz, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.record_commitment(uuid, uuid, uuid, uuid, text, text, timestamptz, uuid, uuid) TO eye_commit;

/* SETTLE (service.commitment.settle): met (late when after its due instant or already breached) | withdrawn (with the reason) — support
   under a live grant for the commitment's case (case.note) or the domain admin. */
CREATE OR REPLACE FUNCTION service.settle_commitment(p_commitment uuid, p_tenant uuid, p_domain uuid, p_outcome text, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, executive, observation, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE m service.commitments%ROWTYPE; v_gate jsonb := '{}'::jsonb; v_eng boolean; v_now timestamptz := clock_timestamp(); v_late boolean;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.commitment.settle']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service.sv_assert_actor('service commitment', p_actor);
  SELECT * INTO m FROM service.commitments x WHERE x.commitment_id = p_commitment AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'service commitment rejected (unknown_commitment): % is not a commitment of this domain', p_commitment USING ERRCODE = '23503'; END IF;
  v_eng := service.sv_is_engineer(p_actor, p_tenant, p_domain);
  IF v_eng THEN
    v_gate := service.sv_engineer_gate(p_tenant, p_domain, p_actor, m.case_id, 'case.note', NULL, 'service_case', 'service commitment', 'settling a commitment', p_correlation);
    IF v_gate ? 'refused' THEN RETURN v_gate; END IF;
  ELSE
    PERFORM service.sv_assert_customer('service commitment', p_actor, p_tenant, p_domain, ARRAY['domain_admin'], 'settling a commitment');
  END IF;
  IF m.state NOT IN ('open', 'breached') THEN RAISE EXCEPTION 'service commitment rejected (state): the commitment is %', m.state USING ERRCODE = '23505'; END IF;
  IF coalesce(p_outcome, '') NOT IN ('met', 'withdrawn') THEN RAISE EXCEPTION 'service commitment rejected (outcome): a commitment is settled met or withdrawn' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_note, ''))) < 8 THEN RAISE EXCEPTION 'service commitment rejected (note): a settlement states its evidence or reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  v_late := p_outcome = 'met' AND (m.state = 'breached' OR v_now > m.due_at);
  UPDATE service.commitments SET state = p_outcome, settled_by = p_actor, settled_at = v_now, settle_note = btrim(p_note), late = v_late WHERE commitment_id = p_commitment RETURNING * INTO m;
  PERFORM onboarding.ledger('service', p_tenant, p_domain, 'commitment', p_commitment, NULL, 'commitment.' || p_outcome, p_actor,
                            jsonb_build_object('case_id', m.case_id, 'late', v_late, 'note', btrim(p_note), 'grant_id', v_gate ->> 'grant_id'), p_correlation);
  -- a breach item stays for the service owner to acknowledge (the case's closure closes it); the settlement is on the ledger
  RETURN jsonb_build_object('commitment', to_jsonb(m), 'grant_id', v_gate ->> 'grant_id');
END $$;
REVOKE ALL ON FUNCTION service.settle_commitment(uuid, uuid, uuid, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.settle_commitment(uuid, uuid, uuid, text, text, uuid, uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §SV.6 PROBLEMS, KNOWN ERRORS, CHANGES (the domain admin — the customer's service owner; a named human)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION service.sv_problem(p_tenant uuid, p_domain uuid, p_problem uuid) RETURNS service.problems
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, pg_catalog, pg_temp AS $$
DECLARE p service.problems%ROWTYPE;
BEGIN
  SELECT * INTO p FROM service.problems x WHERE x.problem_id = p_problem AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'service problem rejected (unknown_problem): % is not a problem of this domain', p_problem USING ERRCODE = '23503'; END IF;
  RETURN p;
END $$;
REVOKE ALL ON FUNCTION service.sv_problem(uuid, uuid, uuid) FROM PUBLIC;

/* OPEN (service.problem.open): the cause behind cases — title, statement, the cases it explains (each linked, each case's problem set). */
CREATE OR REPLACE FUNCTION service.open_problem(p_problem uuid, p_tenant uuid, p_domain uuid, p_title text, p_statement text, p_cases uuid[], p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, observation, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_ref text; x uuid; c service.cases%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.problem.open']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service.sv_assert_actor('service problem', p_actor);
  PERFORM service.sv_assert_customer('service problem', p_actor, p_tenant, p_domain, ARRAY['domain_admin'], 'opening a problem');
  IF length(btrim(coalesce(p_title, ''))) NOT BETWEEN 4 AND 200 THEN RAISE EXCEPTION 'service problem rejected (title): a problem title has 4–200 characters' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_statement, ''))) < 12 THEN RAISE EXCEPTION 'service problem rejected (statement): a problem states the suspected cause (12+ characters)' USING ERRCODE = '22023'; END IF;
  IF cardinality(coalesce(p_cases, '{}')) = 0 THEN RAISE EXCEPTION 'service problem rejected (cases): a problem names the case(s) it explains' USING ERRCODE = '22023'; END IF;
  v_ref := service.sv_next_ref(p_tenant, 'PRB');
  INSERT INTO service.problems (problem_id, tenant_id, domain_id, problem_ref, title, statement, opened_by, correlation_id)
  VALUES (p_problem, p_tenant, p_domain, v_ref, btrim(p_title), btrim(p_statement), p_actor, p_correlation);
  FOREACH x IN ARRAY (SELECT array_agg(DISTINCT y) FROM unnest(p_cases) y) LOOP
    c := service.sv_case(p_tenant, p_domain, x, NULL, 'service problem');
    INSERT INTO service.problem_cases (problem_id, case_id, tenant_id, domain_id, linked_by, reason) VALUES (p_problem, x, p_tenant, p_domain, p_actor, format('explained by problem %s', v_ref));
    UPDATE service.cases SET problem_id = coalesce(problem_id, p_problem), updated_at = clock_timestamp() WHERE case_id = x;
  END LOOP;
  PERFORM onboarding.ledger('service', p_tenant, p_domain, 'problem', p_problem, 1, 'problem.opened', p_actor, jsonb_build_object('problem_ref', v_ref, 'cases', to_jsonb(p_cases)), p_correlation);
  RETURN jsonb_build_object('problem', (SELECT to_jsonb(p) FROM service.problems p WHERE p.problem_id = p_problem));
END $$;
REVOKE ALL ON FUNCTION service.open_problem(uuid, uuid, uuid, text, text, uuid[], uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.open_problem(uuid, uuid, uuid, text, text, uuid[], uuid, uuid) TO eye_commit;

/* LINK (service.problem.link): another case explained by the problem (problem open or known_error). */
CREATE OR REPLACE FUNCTION service.link_problem(p_problem uuid, p_case uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, observation, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p service.problems%ROWTYPE; c service.cases%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.problem.link']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service.sv_assert_actor('service problem', p_actor);
  PERFORM service.sv_assert_customer('service problem', p_actor, p_tenant, p_domain, ARRAY['domain_admin'], 'linking a case to a problem');
  p := service.sv_problem(p_tenant, p_domain, p_problem);
  IF p.state NOT IN ('open', 'known_error') THEN RAISE EXCEPTION 'service problem rejected (state): problem % is %', p.problem_ref, p.state USING ERRCODE = '23505'; END IF;
  c := service.sv_case(p_tenant, p_domain, p_case, NULL, 'service problem');
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'service problem rejected (reason): a link states why (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM service.problem_cases x WHERE x.problem_id = p_problem AND x.case_id = p_case) THEN
    RAISE EXCEPTION 'service problem rejected (duplicate): case % is already linked to %', c.case_ref, p.problem_ref USING ERRCODE = '23505';
  END IF;
  INSERT INTO service.problem_cases (problem_id, case_id, tenant_id, domain_id, linked_by, reason) VALUES (p_problem, p_case, p_tenant, p_domain, p_actor, btrim(p_reason));
  UPDATE service.cases SET problem_id = coalesce(problem_id, p_problem), updated_at = clock_timestamp() WHERE case_id = p_case;
  PERFORM onboarding.ledger('service', p_tenant, p_domain, 'problem', p_problem, p.version, 'problem.case_linked', p_actor, jsonb_build_object('case_id', p_case, 'case_ref', c.case_ref, 'reason', btrim(p_reason)), p_correlation);
  RETURN jsonb_build_object('problem', to_jsonb(p), 'case_id', p_case);
END $$;
REVOKE ALL ON FUNCTION service.link_problem(uuid, uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.link_problem(uuid, uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

/* PUBLISH A KNOWN ERROR (service.problem.known_error): the problem's documented symptom and workaround (the governed act the customer
   performs, optional); the problem → known_error. Digested; reusable on a new case. */
CREATE OR REPLACE FUNCTION service.publish_known_error(p_known_error uuid, p_problem uuid, p_tenant uuid, p_domain uuid, p_title text, p_symptom text, p_workaround text, p_act jsonb,
                                                       p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, observation, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p service.problems%ROWTYPE; v_ref text; v_act jsonb := coalesce(p_act, '{}'::jsonb);
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.problem.known_error']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service.sv_assert_actor('known error', p_actor);
  PERFORM service.sv_assert_customer('known error', p_actor, p_tenant, p_domain, ARRAY['domain_admin'], 'publishing a known error');
  p := service.sv_problem(p_tenant, p_domain, p_problem);
  IF p.state NOT IN ('open', 'known_error') THEN RAISE EXCEPTION 'known error rejected (state): problem % is %', p.problem_ref, p.state USING ERRCODE = '23505'; END IF;
  IF length(btrim(coalesce(p_title, ''))) NOT BETWEEN 4 AND 200 THEN RAISE EXCEPTION 'known error rejected (title): a title has 4–200 characters' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_symptom, ''))) < 12 THEN RAISE EXCEPTION 'known error rejected (symptom): a known error states its symptom (12+ characters)' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_workaround, ''))) < 12 THEN RAISE EXCEPTION 'known error rejected (workaround): a known error states its workaround (12+ characters)' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(v_act) <> 'object' OR (v_act ? 'action' AND (coalesce(v_act ->> 'action', '') !~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$'
                                                                 OR v_act ->> 'action' LIKE 'service.%' OR v_act ->> 'action' LIKE 'support.%')) THEN
    RAISE EXCEPTION 'known error rejected (act): the workaround act is the customer''s governed act ({action, object_type?}) — never a service or support act' USING ERRCODE = '22023';
  END IF;
  v_ref := service.sv_next_ref(p_tenant, 'KE');
  INSERT INTO service.known_errors (known_error_id, tenant_id, domain_id, problem_id, ke_ref, title, symptom, workaround, workaround_act, digest, published_by, correlation_id)
  VALUES (p_known_error, p_tenant, p_domain, p_problem, v_ref, btrim(p_title), btrim(p_symptom), btrim(p_workaround), v_act,
          onboarding.digest(jsonb_build_object('problem', p_problem, 'title', btrim(p_title), 'symptom', btrim(p_symptom), 'workaround', btrim(p_workaround), 'act', v_act)), p_actor, p_correlation);
  UPDATE service.problems SET state = 'known_error', version = version + 1 WHERE problem_id = p_problem;
  PERFORM onboarding.ledger('service', p_tenant, p_domain, 'known_error', p_known_error, NULL, 'known_error.published', p_actor,
                            jsonb_build_object('ke_ref', v_ref, 'problem_id', p_problem, 'problem_ref', p.problem_ref), p_correlation);
  RETURN jsonb_build_object('known_error', (SELECT to_jsonb(k) FROM service.known_errors k WHERE k.known_error_id = p_known_error));
END $$;
REVOKE ALL ON FUNCTION service.publish_known_error(uuid, uuid, uuid, uuid, text, text, text, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.publish_known_error(uuid, uuid, uuid, uuid, text, text, text, jsonb, uuid, uuid) TO eye_commit;

/* CLOSE (service.problem.close): resolved — only with a VERIFIED change linked (the fix proven), its known errors retired; or closed — with
   the reason (no fix; accepted). */
CREATE OR REPLACE FUNCTION service.close_problem(p_problem uuid, p_tenant uuid, p_domain uuid, p_outcome text, p_root_cause text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, observation, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p service.problems%ROWTYPE; v_now timestamptz := clock_timestamp(); v_retired int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.problem.close']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service.sv_assert_actor('service problem', p_actor);
  PERFORM service.sv_assert_customer('service problem', p_actor, p_tenant, p_domain, ARRAY['domain_admin'], 'closing a problem');
  p := service.sv_problem(p_tenant, p_domain, p_problem);
  IF p.state NOT IN ('open', 'known_error') THEN RAISE EXCEPTION 'service problem rejected (state): problem % is %', p.problem_ref, p.state USING ERRCODE = '23505'; END IF;
  IF coalesce(p_outcome, '') NOT IN ('resolved', 'closed') THEN RAISE EXCEPTION 'service problem rejected (outcome): a problem is resolved or closed' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'service problem rejected (reason): a closure states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_outcome = 'resolved' AND NOT EXISTS (SELECT 1 FROM service.changes ch WHERE ch.problem_id = p_problem AND ch.state = 'verified') THEN
    RAISE EXCEPTION 'service problem rejected (state): problem % is resolved only by a verified change — none is verified (close it with a reason instead)', p.problem_ref USING ERRCODE = '23505';
  END IF;
  UPDATE service.problems SET state = p_outcome, closed_by = p_actor, closed_at = v_now, close_reason = btrim(p_reason), root_cause = nullif(btrim(coalesce(p_root_cause, '')), ''),
         version = version + 1 WHERE problem_id = p_problem RETURNING * INTO p;
  UPDATE service.known_errors SET state = 'retired', retired_by = p_actor, retired_at = v_now, retire_reason = format('problem %s %s', p.problem_ref, p_outcome)
   WHERE problem_id = p_problem AND state = 'published';
  GET DIAGNOSTICS v_retired = ROW_COUNT;
  PERFORM onboarding.ledger('service', p_tenant, p_domain, 'problem', p_problem, p.version, 'problem.' || p_outcome, p_actor,
                            jsonb_build_object('reason', btrim(p_reason), 'root_cause', p.root_cause, 'known_errors_retired', v_retired), p_correlation);
  RETURN jsonb_build_object('problem', to_jsonb(p), 'known_errors_retired', v_retired);
END $$;
REVOKE ALL ON FUNCTION service.close_problem(uuid, uuid, uuid, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.close_problem(uuid, uuid, uuid, text, text, text, uuid, uuid) TO eye_commit;

/* CHANGES linked to a problem: PROPOSE (service.change.propose) → DECIDE (service.change.decide, human-gated: another named domain admin —
   never the proposer) → RECORD (service.change.record: implemented (approved first) | verified (implemented first) | failed). */
CREATE OR REPLACE FUNCTION service.propose_change(p_change uuid, p_problem uuid, p_tenant uuid, p_domain uuid, p_title text, p_description text, p_effect text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, observation, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p service.problems%ROWTYPE; v_ref text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.change.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service.sv_assert_actor('service change', p_actor);
  PERFORM service.sv_assert_customer('service change', p_actor, p_tenant, p_domain, ARRAY['domain_admin'], 'proposing a change');
  p := service.sv_problem(p_tenant, p_domain, p_problem);
  IF p.state NOT IN ('open', 'known_error') THEN RAISE EXCEPTION 'service change rejected (state): problem % is %', p.problem_ref, p.state USING ERRCODE = '23505'; END IF;
  IF length(btrim(coalesce(p_title, ''))) NOT BETWEEN 4 AND 200 THEN RAISE EXCEPTION 'service change rejected (title): a title has 4–200 characters' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_description, ''))) < 12 THEN RAISE EXCEPTION 'service change rejected (description): a change describes what changes (12+ characters)' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_effect, ''))) < 8 THEN RAISE EXCEPTION 'service change rejected (effect): a change states its expected effect (8+ characters)' USING ERRCODE = '22023'; END IF;
  v_ref := service.sv_next_ref(p_tenant, 'CHG');
  INSERT INTO service.changes (change_id, tenant_id, domain_id, problem_id, change_ref, title, description, expected_effect, proposed_by, correlation_id)
  VALUES (p_change, p_tenant, p_domain, p_problem, v_ref, btrim(p_title), btrim(p_description), btrim(p_effect), p_actor, p_correlation);
  PERFORM onboarding.ledger('service', p_tenant, p_domain, 'change', p_change, 1, 'change.proposed', p_actor, jsonb_build_object('change_ref', v_ref, 'problem_id', p_problem, 'problem_ref', p.problem_ref), p_correlation);
  RETURN jsonb_build_object('change', (SELECT to_jsonb(x) FROM service.changes x WHERE x.change_id = p_change));
END $$;
REVOKE ALL ON FUNCTION service.propose_change(uuid, uuid, uuid, uuid, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.propose_change(uuid, uuid, uuid, uuid, text, text, text, uuid, uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION service.decide_change(p_change uuid, p_tenant uuid, p_domain uuid, p_expected int, p_decision text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, observation, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x service.changes%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.change.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service.sv_assert_actor('service change', p_actor);
  PERFORM service.sv_assert_customer('service change', p_actor, p_tenant, p_domain, ARRAY['domain_admin'], 'deciding a change');
  SELECT * INTO x FROM service.changes c WHERE c.change_id = p_change AND c.tenant_id = p_tenant AND c.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'service change rejected (unknown_change): % is not a change of this domain', p_change USING ERRCODE = '23503'; END IF;
  IF p_expected IS NOT NULL AND p_expected <> x.version THEN RAISE EXCEPTION 'service change rejected (stale): change % is at version %, the decision read %', x.change_ref, x.version, p_expected USING ERRCODE = '23505'; END IF;
  IF x.proposed_by = p_actor THEN RAISE EXCEPTION 'service change rejected (separation_of_duties): change % is never decided by its proposer', x.change_ref USING ERRCODE = '42501'; END IF;
  IF x.state <> 'proposed' THEN RAISE EXCEPTION 'service change rejected (state): change % is %', x.change_ref, x.state USING ERRCODE = '23505'; END IF;
  IF coalesce(p_decision, '') NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'service change rejected (decision): approve or reject' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'service change rejected (reason): a decision states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  UPDATE service.changes SET state = CASE p_decision WHEN 'approve' THEN 'approved' ELSE 'rejected' END, decided_by = p_actor, decided_at = clock_timestamp(), decision_reason = btrim(p_reason),
         version = version + 1 WHERE change_id = p_change RETURNING * INTO x;
  PERFORM onboarding.ledger('service', p_tenant, p_domain, 'change', p_change, x.version, 'change.' || x.state, p_actor, jsonb_build_object('reason', btrim(p_reason)), p_correlation);
  RETURN jsonb_build_object('change', to_jsonb(x));
END $$;
REVOKE ALL ON FUNCTION service.decide_change(uuid, uuid, uuid, int, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.decide_change(uuid, uuid, uuid, int, text, text, uuid, uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION service.record_change(p_change uuid, p_tenant uuid, p_domain uuid, p_outcome text, p_evidence text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, observation, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x service.changes%ROWTYPE; v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.change.record']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service.sv_assert_actor('service change', p_actor);
  PERFORM service.sv_assert_customer('service change', p_actor, p_tenant, p_domain, ARRAY['domain_admin'], 'recording a change');
  SELECT * INTO x FROM service.changes c WHERE c.change_id = p_change AND c.tenant_id = p_tenant AND c.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'service change rejected (unknown_change): % is not a change of this domain', p_change USING ERRCODE = '23503'; END IF;
  IF length(btrim(coalesce(p_evidence, ''))) < 8 THEN RAISE EXCEPTION 'service change rejected (evidence): a record states its evidence (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF NOT ((p_outcome = 'implemented' AND x.state = 'approved') OR (p_outcome IN ('verified', 'failed') AND x.state = 'implemented')) THEN
    RAISE EXCEPTION 'service change rejected (state): change % is % — implemented follows approval; verified or failed follows implementation', x.change_ref, x.state USING ERRCODE = '23505';
  END IF;
  UPDATE service.changes SET state = p_outcome, version = version + 1,
         implemented_by = CASE WHEN p_outcome = 'implemented' THEN p_actor ELSE implemented_by END, implemented_at = CASE WHEN p_outcome = 'implemented' THEN v_now ELSE implemented_at END,
         verified_by = CASE WHEN p_outcome = 'verified' THEN p_actor ELSE verified_by END, verified_at = CASE WHEN p_outcome = 'verified' THEN v_now ELSE verified_at END,
         evidence = evidence || jsonb_build_array(jsonb_build_object('outcome', p_outcome, 'evidence', btrim(p_evidence), 'by', p_actor, 'at', v_now))
   WHERE change_id = p_change RETURNING * INTO x;
  PERFORM onboarding.ledger('service', p_tenant, p_domain, 'change', p_change, x.version, 'change.' || p_outcome, p_actor, jsonb_build_object('evidence', btrim(p_evidence)), p_correlation);
  RETURN jsonb_build_object('change', to_jsonb(x));
END $$;
REVOKE ALL ON FUNCTION service.record_change(uuid, uuid, uuid, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.record_change(uuid, uuid, uuid, text, text, uuid, uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §SV.7 THE SLA: the timers' firing, the drill, the sweep
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/* Record a breach (internal): the row, the case's breach instant (not for a drill), the ledger event, the `service.case` item ESCALATED BY
   SEVERITY (service.sv_dims) under the domain's published policy. */
CREATE OR REPLACE FUNCTION service.sv_breach(c service.cases, p_objective text, p_commitment uuid, p_due timestamptz, p_found_by text, p_timer uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, executive, onboarding, pg_catalog, pg_temp AS $$
DECLARE v_id uuid := gen_random_uuid(); v_ev uuid; v_item jsonb; v_drill boolean := p_found_by = 'drill'; v_title text;
BEGIN
  v_ev := onboarding.ledger('service', c.tenant_id, c.domain_id, 'service_case', c.case_id, c.version,
            CASE WHEN v_drill THEN 'sla.drill_breached' WHEN p_objective = 'commitment' THEN 'commitment.breached' ELSE 'sla.' || p_objective || '_breached' END, p_actor,
            jsonb_build_object('case_ref', c.case_ref, 'objective', p_objective, 'commitment_id', p_commitment, 'due_at', p_due, 'found_by', p_found_by, 'timer_id', p_timer,
                               'severity', c.severity, 'tier', c.routing ->> 'tier', 'drill', v_drill), p_correlation);
  v_title := format('%s%s %s of case %s (%s, %s) missed — due %s', CASE WHEN v_drill THEN 'DRILL — ' ELSE '' END,
                    CASE p_objective WHEN 'commitment' THEN 'A support commitment' WHEN 'response' THEN 'The response objective' ELSE 'The resolution objective' END,
                    CASE WHEN v_drill THEN '(sla_escalation drill)' ELSE '' END, c.case_ref, c.severity, c.routing ->> 'tier', to_char(p_due AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI "UTC"'));
  v_item := executive.b33_raise_routed(c.tenant_id, c.domain_id, 'service.case', 'service_case', c.case_id, v_title,
              jsonb_build_array(jsonb_build_object('kind', CASE WHEN v_drill THEN 'sla.drill' ELSE 'sla.breach' END, 'objective', p_objective, 'severity', c.severity, 'due_at', p_due, 'found_by', p_found_by)),
              NULL, v_ev, CASE WHEN p_objective = 'commitment' THEN 'commitment.breached' WHEN v_drill THEN 'sla.drill_breached' ELSE 'sla.breached' END,
              jsonb_build_object('case_ref', c.case_ref, 'objective', p_objective, 'commitment_id', p_commitment, 'drill', v_drill), service.sv_dims(c.severity), p_actor, p_correlation);
  INSERT INTO service.sla_breaches (breach_id, tenant_id, domain_id, case_id, objective, commitment_id, severity, tier, due_at, found_by, drill, timer_id, item, correlation_id)
  VALUES (v_id, c.tenant_id, c.domain_id, c.case_id, p_objective, p_commitment, c.severity, c.routing ->> 'tier', p_due, p_found_by, v_drill, p_timer, v_item, p_correlation);
  IF NOT v_drill AND p_objective = 'response' THEN UPDATE service.cases SET response_breached_at = clock_timestamp() WHERE case_id = c.case_id; END IF;
  IF NOT v_drill AND p_objective = 'resolution' THEN UPDATE service.cases SET resolution_breached_at = clock_timestamp() WHERE case_id = c.case_id; END IF;
  RETURN jsonb_build_object('breach_id', v_id, 'objective', p_objective, 'drill', v_drill, 'item', v_item);
END $$;
REVOKE ALL ON FUNCTION service.sv_breach(service.cases, text, uuid, timestamptz, text, uuid, uuid, uuid) FROM PUBLIC;

/* THE TIMER'S FIRING (the WorkflowTimerRegistry's handler for sla.response / sla.resolution; executive.attention.tick): a drill timer always
   records its drill breach; a real one is SKIPPED when the objective was met (response: any response evidence; resolution: resolved,
   cannot_reproduce or closed) or superseded (the case's current due instant differs — a regrade or a reopen re-scheduled it), else the
   breach is recorded and escalated by severity. Answers {skipped, …} or {breached, …}. */
CREATE OR REPLACE FUNCTION service.fire_sla_timer(p_timer uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, executive, observation, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t executive.workflow_timers%ROWTYPE; c service.cases%ROWTYPE; v_obj text; v_responded timestamptz; v_due timestamptz;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'service case rejected (actor): the firing is recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO t FROM executive.workflow_timers x WHERE x.timer_id = p_timer AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND OR t.owner_kind <> 'service_case' OR t.kind NOT IN ('sla.response', 'sla.resolution') THEN
    RAISE EXCEPTION 'service case rejected (kind): % is not an SLA timer of a case', p_timer USING ERRCODE = '22023';
  END IF;
  c := service.sv_case(p_tenant, p_domain, t.owner_id, NULL, 'service case');
  v_obj := CASE t.kind WHEN 'sla.response' THEN 'response' ELSE 'resolution' END;
  IF coalesce((t.payload ->> 'drill')::boolean, false) THEN
    RETURN jsonb_build_object('breached', true, 'drill', true) || service.sv_breach(c, v_obj, NULL, t.due_at, 'drill', p_timer, p_actor, p_correlation);
  END IF;
  IF v_obj = 'response' THEN
    v_responded := service.sv_responded_at(c.case_id);
    IF v_responded IS NOT NULL THEN RETURN jsonb_build_object('skipped', true, 'reason', format('responded at %s', v_responded), 'case_ref', c.case_ref); END IF;
    v_due := c.response_due_at;
  ELSE
    IF c.state IN ('resolved', 'cannot_reproduce', 'closed') THEN RETURN jsonb_build_object('skipped', true, 'reason', format('the case is %s', c.state), 'case_ref', c.case_ref); END IF;
    v_due := c.resolution_due_at;
  END IF;
  IF v_due IS DISTINCT FROM t.due_at THEN
    RETURN jsonb_build_object('skipped', true, 'reason', format('superseded: the %s objective is now due %s', v_obj, v_due), 'case_ref', c.case_ref);
  END IF;
  IF EXISTS (SELECT 1 FROM service.sla_breaches b WHERE b.case_id = c.case_id AND b.objective = v_obj AND b.due_at = t.due_at AND NOT b.drill) THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'the breach is already recorded (the sweep found it first)', 'case_ref', c.case_ref);
  END IF;
  RETURN jsonb_build_object('breached', true, 'drill', false, 'case_ref', c.case_ref) || service.sv_breach(c, v_obj, NULL, t.due_at, 'timer', p_timer, p_actor, p_correlation);
END $$;
REVOKE ALL ON FUNCTION service.fire_sla_timer(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.fire_sla_timer(uuid, uuid, uuid, uuid, uuid) TO eye_commit;

/* THE DRILL (service.sla.drill, human-gated: the domain admin): an `sla_escalation` drill on a case not closed — a timer of the objective due
   NOW (payload drill), fired by the domain's next real attention tick; the case's real SLA facts are never touched. */
CREATE OR REPLACE FUNCTION service.drill_sla(p_drill uuid, p_case uuid, p_tenant uuid, p_domain uuid, p_objective text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, executive, observation, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c service.cases%ROWTYPE; v_timer uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.sla.drill']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service.sv_assert_actor('service case', p_actor);
  PERFORM service.sv_assert_customer('service case', p_actor, p_tenant, p_domain, ARRAY['domain_admin'], 'running an SLA escalation drill');
  c := service.sv_case(p_tenant, p_domain, p_case, NULL, 'service case');
  IF c.state = 'closed' THEN RAISE EXCEPTION 'service case rejected (state): case % is closed', c.case_ref USING ERRCODE = '23505'; END IF;
  IF coalesce(p_objective, '') NOT IN ('response', 'resolution') THEN RAISE EXCEPTION 'service case rejected (objective): a drill exercises the response or the resolution objective' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'service case rejected (reason): a drill states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  v_timer := service.sv_schedule(c, 'sla.' || p_objective, clock_timestamp(), jsonb_build_object('objective', p_objective, 'drill', true, 'drill_id', p_drill), p_actor, p_correlation);
  INSERT INTO service.sla_drills (drill_id, tenant_id, domain_id, case_id, objective, timer_id, requested_by, reason, correlation_id)
  VALUES (p_drill, p_tenant, p_domain, p_case, p_objective, v_timer, p_actor, btrim(p_reason), p_correlation);
  PERFORM service.sv_event(c, 'sla.drill_requested', p_actor, jsonb_build_object('drill_id', p_drill, 'objective', p_objective, 'timer_id', v_timer, 'kind', 'sla_escalation'), p_correlation);
  RETURN jsonb_build_object('drill', (SELECT to_jsonb(d) FROM service.sla_drills d WHERE d.drill_id = p_drill),
                            'note', 'the drill timer is due now: the domain''s next attention tick fires it and records the escalation as a drill');
END $$;
REVOKE ALL ON FUNCTION service.drill_sla(uuid, uuid, uuid, uuid, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.drill_sla(uuid, uuid, uuid, uuid, text, text, uuid, uuid) TO eye_commit;

/* What the sweep would find (a plain read — the after-tick hook reads it FIRST, and writes only when it is not empty). */
CREATE OR REPLACE FUNCTION service.sla_sweep_candidates(p_tenant uuid, p_domain uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = service, executive, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'commitments', coalesce((SELECT jsonb_agg(m.commitment_id) FROM service.commitments m WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain AND m.state = 'open' AND m.due_at <= clock_timestamp()), '[]'::jsonb),
    'objectives', coalesce((SELECT jsonb_agg(jsonb_build_object('case_id', c.case_id, 'objective', o.obj)) FROM service.cases c
        CROSS JOIN LATERAL (VALUES ('response', c.response_due_at), ('resolution', c.resolution_due_at)) AS o(obj, due)
       WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND o.due IS NOT NULL AND o.due <= clock_timestamp() AND c.state <> 'closed'
         AND ((o.obj = 'response' AND c.responded_at IS NULL AND c.response_breached_at IS NULL AND NOT EXISTS (SELECT 1 FROM service.support_grants g WHERE g.case_id = c.case_id))
           OR (o.obj = 'resolution' AND c.state NOT IN ('resolved', 'cannot_reproduce') AND c.resolution_breached_at IS NULL))
         AND NOT EXISTS (SELECT 1 FROM executive.workflow_timers t WHERE t.owner_kind = 'service_case' AND t.owner_id = c.case_id AND t.kind = 'sla.' || o.obj
                            AND t.due_at = o.due AND t.cancelled_at IS NULL AND coalesce((t.payload ->> 'drill')::boolean, false) = false
                            AND (t.fired_at IS NULL OR EXISTS (SELECT 1 FROM executive.workflow_timer_firings f WHERE f.timer_id = t.timer_id AND f.outcome <> 'failed')))), '[]'::jsonb))
$$;
GRANT EXECUTE ON FUNCTION service.sla_sweep_candidates(uuid, uuid) TO eye_app, eye_commit;

/* THE SWEEP (service.sla.sweep — the after-tick hook `service-sla`, the attention agent): every OPEN commitment past its due instant
   BREACHES (escalated by the case's severity); every objective past due whose timer did not fire (none scheduled, or abandoned after three
   failures) is recorded as breached by the sweep. Re-checked here (the read before it is only the trigger). */
CREATE OR REPLACE FUNCTION service.sla_sweep(p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, executive, observation, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE m service.commitments%ROWTYPE; c service.cases%ROWTYPE; v_cand jsonb; o jsonb; v_out jsonb := '[]'::jsonb; v_due timestamptz;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.sla.sweep']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'service commitment rejected (actor): the sweep is recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  FOR m IN SELECT * FROM service.commitments x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'open' AND x.due_at <= clock_timestamp()
            ORDER BY x.due_at FOR UPDATE SKIP LOCKED LOOP
    UPDATE service.commitments SET state = 'breached', breached_at = clock_timestamp() WHERE commitment_id = m.commitment_id;
    SELECT * INTO c FROM service.cases x WHERE x.case_id = m.case_id;
    v_out := v_out || jsonb_build_array(jsonb_build_object('commitment_id', m.commitment_id) || service.sv_breach(c, 'commitment', m.commitment_id, m.due_at, 'sweep', NULL, p_actor, p_correlation));
  END LOOP;
  v_cand := service.sla_sweep_candidates(p_tenant, p_domain) -> 'objectives';
  FOR o IN SELECT * FROM jsonb_array_elements(v_cand) LOOP
    SELECT * INTO c FROM service.cases x WHERE x.case_id = (o ->> 'case_id')::uuid FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN CONTINUE; END IF;
    v_due := CASE o ->> 'objective' WHEN 'response' THEN c.response_due_at ELSE c.resolution_due_at END;
    IF EXISTS (SELECT 1 FROM service.sla_breaches b WHERE b.case_id = c.case_id AND b.objective = o ->> 'objective' AND b.due_at = v_due AND NOT b.drill) THEN CONTINUE; END IF;
    v_out := v_out || jsonb_build_array(jsonb_build_object('case_id', c.case_id) || service.sv_breach(c, o ->> 'objective', NULL, v_due, 'sweep', NULL, p_actor, p_correlation));
  END LOOP;
  RETURN jsonb_build_object('breaches', v_out, 'count', jsonb_array_length(v_out));
END $$;
REVOKE ALL ON FUNCTION service.sla_sweep(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.sla_sweep(uuid, uuid, uuid, uuid) TO eye_commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §SV.8 THE VALUE REVIEW (CAP-DL-10)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/* MET-040's status in the domain (read by the port — never the caller's word): its approved definition supported or not; absent → unsupported,
   carrier B76. */
CREATE OR REPLACE FUNCTION service.value_status(p_tenant uuid, p_domain uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = service, analytics, pg_catalog, pg_temp AS $$
  SELECT coalesce(
    (SELECT jsonb_build_object('metric_key', d.metric_key, 'version', d.version, 'state', CASE WHEN d.supported THEN 'supported' ELSE 'unsupported' END,
                               'reason', coalesce(d.unsupported_reason, 'computable under its registered computation'), 'carrier', CASE WHEN d.supported THEN NULL ELSE 'B76' END,
                               'definition_id', d.definition_id)
       FROM analytics.metric_definitions d WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.metric_key = 'MET-040' AND d.state = 'approved'),
    jsonb_build_object('metric_key', 'MET-040', 'version', NULL, 'state', 'unsupported', 'carrier', 'B76',
                       'reason', 'MET-040 (realized strategic value) has no approved supported definition in this domain — value stays unsupported until B76'))
$$;
GRANT EXECUTE ON FUNCTION service.value_status(uuid, uuid) TO eye_app, eye_commit;

/* RECORD (service.value_review.record): a domain admin or an executive, over the customer-success inputs the route read FIRST (their digest
   re-checked); the value status read HERE; claim `demonstration`. */
CREATE OR REPLACE FUNCTION service.record_value_review(p_review uuid, p_tenant uuid, p_domain uuid, p_from date, p_to date, p_inputs jsonb, p_inputs_digest text, p_outcomes text,
                                                       p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, observation, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_status jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.value_review.record']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service.sv_assert_actor('value review', p_actor);
  PERFORM service.sv_assert_customer('value review', p_actor, p_tenant, p_domain, ARRAY['domain_admin', 'executive'], 'recording a value review');
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to > (clock_timestamp() AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION 'value review rejected (period): a review covers a past period (from ≤ to ≤ today)' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_inputs) IS DISTINCT FROM 'object' OR NOT (p_inputs ? 'health' AND p_inputs ? 'adoption' AND p_inputs ? 'licence' AND p_inputs ? 'cases') THEN
    RAISE EXCEPTION 'value review rejected (inputs): a review rests on the customer-success read (health, adoption, licence, cases)' USING ERRCODE = '22023';
  END IF;
  IF p_inputs_digest IS DISTINCT FROM onboarding.digest(p_inputs) THEN
    RAISE EXCEPTION 'value review rejected (stale): the inputs'' digest does not match the inputs — read the customer-success view again' USING ERRCODE = '23505';
  END IF;
  IF length(btrim(coalesce(p_outcomes, ''))) < 12 THEN RAISE EXCEPTION 'value review rejected (outcomes): a review states the outcomes observed (12+ characters)' USING ERRCODE = '22023'; END IF;
  v_status := service.value_status(p_tenant, p_domain);
  INSERT INTO service.value_reviews (review_id, tenant_id, domain_id, period_from, period_to, inputs, inputs_digest, outcomes, value_status, digest, recorded_by, correlation_id)
  VALUES (p_review, p_tenant, p_domain, p_from, p_to, p_inputs, p_inputs_digest, btrim(p_outcomes), v_status,
          onboarding.digest(jsonb_build_object('from', p_from, 'to', p_to, 'inputs_digest', p_inputs_digest, 'outcomes', btrim(p_outcomes), 'value_status', v_status, 'claim', 'demonstration')),
          p_actor, p_correlation);
  PERFORM onboarding.ledger('service', p_tenant, p_domain, 'value_review', p_review, 1, 'value_review.recorded', p_actor,
                            jsonb_build_object('period_from', p_from, 'period_to', p_to, 'value_state', v_status ->> 'state', 'claim', 'demonstration'), p_correlation);
  RETURN jsonb_build_object('review', (SELECT to_jsonb(r) FROM service.value_reviews r WHERE r.review_id = p_review));
END $$;
REVOKE ALL ON FUNCTION service.record_value_review(uuid, uuid, uuid, date, date, jsonb, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.record_value_review(uuid, uuid, uuid, date, date, jsonb, text, text, uuid, uuid) TO eye_commit;

/* ACKNOWLEDGE or WITHHOLD (service.value_review.acknowledge, human-gated): an executive or a domain admin other than the recorder, on the
   review's digest (stale → 409). The claim stays `demonstration` — joint value-review acceptance is R2. */
CREATE OR REPLACE FUNCTION service.decide_value_review(p_review uuid, p_tenant uuid, p_domain uuid, p_digest text, p_decision text, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = service, observation, onboarding, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r service.value_reviews%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['service.value_review.acknowledge']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM service.sv_assert_actor('value review', p_actor);
  PERFORM service.sv_assert_customer('value review', p_actor, p_tenant, p_domain, ARRAY['executive', 'domain_admin'], 'acknowledging a value review');
  SELECT * INTO r FROM service.value_reviews x WHERE x.review_id = p_review AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'value review rejected (unknown_review): % is not a value review of this domain', p_review USING ERRCODE = '23503'; END IF;
  IF r.recorded_by = p_actor THEN RAISE EXCEPTION 'value review rejected (separation_of_duties): a review is never acknowledged by its recorder' USING ERRCODE = '42501'; END IF;
  IF r.state <> 'recorded' THEN RAISE EXCEPTION 'value review rejected (state): the review is %', r.state USING ERRCODE = '23505'; END IF;
  IF p_digest IS DISTINCT FROM r.digest THEN RAISE EXCEPTION 'value review rejected (stale): the review''s digest is %, the decision names %', r.digest, coalesce(p_digest, '<none>') USING ERRCODE = '23505'; END IF;
  IF coalesce(p_decision, '') NOT IN ('acknowledged', 'withheld') THEN RAISE EXCEPTION 'value review rejected (decision): acknowledged or withheld' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_note, ''))) < 8 THEN RAISE EXCEPTION 'value review rejected (note): a decision states its note (8+ characters)' USING ERRCODE = '22023'; END IF;
  UPDATE service.value_reviews SET state = p_decision, decided_by = p_actor, decided_at = clock_timestamp(), decision_note = btrim(p_note) WHERE review_id = p_review RETURNING * INTO r;
  PERFORM onboarding.ledger('service', p_tenant, p_domain, 'value_review', p_review, 1, 'value_review.' || p_decision, p_actor,
                            jsonb_build_object('note', btrim(p_note), 'claim', 'demonstration', 'boundary', 'joint value-review acceptance is R2'), p_correlation);
  RETURN jsonb_build_object('review', to_jsonb(r));
END $$;
REVOKE ALL ON FUNCTION service.decide_value_review(uuid, uuid, uuid, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service.decide_value_review(uuid, uuid, uuid, text, text, text, uuid, uuid) TO eye_commit;
