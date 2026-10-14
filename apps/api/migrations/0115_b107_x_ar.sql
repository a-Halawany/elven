-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0115 §AR — CP-6 B107: SCOPE-SPECIFIC ACCEPTANCE RECORDS (F-R0-04; F-P7D-25 operational acceptance; F-P7-E-17 PAT-48 / OBJ-40 / JRN-24;
-- F-P7-F-12 OBJ-40). Applies alone on top of 0001–0114 and the prelude (0115 §0). Nothing of 0001–0114 or §0 is edited.
--
--   THE RECORD (governance.acceptance_records — DOMAIN, versioned): kind capability | operational | release | design; the exact SCOPE TUPLE
--     (capability + version, journeys, roles, tenant, domain, deployment profile, entitlement, data and model versions, configuration digest,
--     consequence class, period; for an operational record also artifacts, integrations, data classes, workloads, products, infrastructure;
--     for a release record the release candidate's identity) — a blanket value ('*', 'all', 'any', an empty list) is refused (PAT-48);
--     EVIDENCE ITEMS referenced by id + digest + captured_at + valid_until (the evidence VAULT, governance.acceptance_evidence — append-only;
--     B94's records and the shared artifacts are REFERENCED and verified, never rewritten); CONDITIONS (time-bounded; an absent evidence SLOT
--     becomes an open condition — ES-71-003, TS-020, PR-71-006); linked EXCEPTIONS (artifacts of kind exception, §PG's registry — an
--     expired one refuses); REQUIRED OBLIGATIONS (product, independent assurance, operations, security, privacy, AI fitness, data, business,
--     customer, design) each attested by a DISTINCT named human through governance.assert_approver and SIGNED (executive.signatures kind
--     acceptance_attestation): `accepted` only when every obligation is signed (ES-71-002: one person per obligation, never one role for all);
--     the customer VERIFIES before it attests (JRN-24); `claim` CHECK = 'demonstration'.
--   EVIDENCE EXPIRY (FEX-31, ES-71-004/-005, IA-71-005, DP-71-005, PR-71-005): the sweep (the attention tick's step and the
--     acceptance.evidence_expiry timer) reconciles every record in force against what it declared — an expired or failed evidence item, an
--     overdue condition, a passed review date, a changed capability, an expired linked exception, a held release candidate, the end of the
--     period — and turns it CONSTRAINED (the capability limited to the previously accepted UNAFFECTED scope), LAPSED (period over) or keeps
--     it; attention `governance.acceptance` is raised and an `acceptance_constrained` HOLD stops EXPANSION (a new domain, journeys, roles,
--     profile, data, models or a higher consequence class); only a RE-ACCEPTANCE (a new version over renewed evidence, every obligation
--     attested again) lifts it. Triggers by act (material change, incident, control failure, model or agent withdrawal, SLO exhaustion) put
--     the record under review (constrained) or suspend it.
--   THE OPT-IN REQUEST GATE (Q5): a capability marked `enforce_acceptance` (governance.acceptance_enforcement, PLATFORM, the product
--     authority) gates its action prefixes in a domain where it is not accepted for the requesting role or consequence class — never reads,
--     corrections, withdrawals, attention, warnings, mandatory controls or human gates (the entitlement gate's exemptions, plus governance.*).
--
-- THREE CLAIMS, never mixed: CONSTRUCTION (these ports + phase6-acceptance-b107); DEMONSTRATED OPERATION (the act on SYNTHETIC NORDWERK
-- personas — every record claim = 'demonstration'); REAL ACCEPTANCE by named independent and customer authorities, production admission
-- (R1/R2/H2/H3) — never claimed and impossible to record here (the CHECK admits only 'demonstration'). B64 (SLO computation) is not built:
-- SLO exhaustion is a declared trigger kind, never computed here.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §AR.0 THE TIMER OWNER — B107 ar: an acceptance.evidence_expiry timer is owned by its acceptance record (0114 §SV.0's owner_kind list,
-- copied whole, plus `acceptance_record`). The integrator merges the other parts' owners into one list.
ALTER TABLE executive.workflow_timers DROP CONSTRAINT IF EXISTS workflow_timers_owner_kind_check;
ALTER TABLE executive.workflow_timers ADD CONSTRAINT workflow_timers_owner_kind_check CHECK (owner_kind IN ('task', 'workflow_instance', 'grant', 'commitment_item', 'gate',
  -- B94 sv (0114 §SV.0)
  'service_case',
  -- B107 ar (0115 §AR.0)
  'acceptance_record'));

-- §AR.1 THE VOCABULARIES ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION governance.ar_kinds() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['capability', 'operational', 'release', 'design'] $$;
/* The obligations a record may require, each a distinct named authority (ES-71-002). */
CREATE OR REPLACE FUNCTION governance.ar_obligations() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  'product', 'independent_assurance', 'operations', 'security', 'privacy', 'ai_fitness', 'data', 'business', 'customer', 'design'] $$;
/* The roles that may attest an obligation (the demonstration's staffing; naming the real people is H2's — ES-71-002 B+X:staffing). Security
   and AI fitness are independent-assurance obligations here (no security or model authority role exists yet) — still one person each. */
CREATE OR REPLACE FUNCTION governance.ar_obligation_roles(p text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT CASE p
  WHEN 'product' THEN ARRAY['product_authority'] WHEN 'independent_assurance' THEN ARRAY['independent_assurance'] WHEN 'operations' THEN ARRAY['operations_authority']
  WHEN 'security' THEN ARRAY['independent_assurance'] WHEN 'privacy' THEN ARRAY['privacy_officer'] WHEN 'ai_fitness' THEN ARRAY['independent_assurance']
  WHEN 'data' THEN ARRAY['data_steward'] WHEN 'business' THEN ARRAY['executive', 'customer_sponsor'] WHEN 'customer' THEN ARRAY['customer_sponsor', 'onboarding_authority']
  WHEN 'design' THEN ARRAY['design_system_authority'] END $$;
/* The minimum obligations of a kind (a proposer may add, never remove). */
CREATE OR REPLACE FUNCTION governance.ar_min_obligations(p text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT CASE p
  WHEN 'capability' THEN ARRAY['product', 'independent_assurance', 'customer'] WHEN 'operational' THEN ARRAY['operations', 'independent_assurance', 'customer']
  WHEN 'release' THEN ARRAY['product', 'independent_assurance'] WHEN 'design' THEN ARRAY['design', 'independent_assurance'] END $$;
/* The evidence vault's kinds (INF-OP-12, DAT-OP-12: readiness, change, incident, recovery, exercise and acceptance evidence). */
CREATE OR REPLACE FUNCTION governance.ar_evidence_kinds() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  'test_report', 'journey_evidence', 'build', 'release_candidate', 'conformance', 'exercise', 'drill', 'incident', 'change', 'readiness',
  'runbook', 'dashboard', 'alert', 'on_call', 'incident_roles', 'capacity', 'backup', 'recovery', 'degraded_mode', 'customer_communications', 'escalation',
  'security_review', 'privacy_review', 'accessibility', 'resilience', 'support_readiness', 'parity', 'deployment',
  'migration_acceptance', 'golive_decision', 'admission_record', 'value_review', 'design_package', 'other'] $$;
/* The evidence SLOTS a kind expects; an absent current item is an OPEN CONDITION, never a silent pass (ES-71-003, TS-020, V04-T-003, PR-71-006). */
CREATE OR REPLACE FUNCTION governance.ar_slots(p text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT CASE p
  WHEN 'operational' THEN ARRAY['runbook', 'dashboard', 'alert', 'on_call', 'incident_roles', 'capacity', 'backup', 'recovery', 'degraded_mode', 'customer_communications', 'escalation']
  WHEN 'capability' THEN ARRAY['security_review', 'privacy_review', 'accessibility', 'resilience', 'recovery', 'support_readiness', 'parity']
  ELSE ARRAY[]::text[] END $$;
/* The subjects an evidence item may reference (verified against the referenced row, never rewritten). */
CREATE OR REPLACE FUNCTION governance.ar_evidence_subjects() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  'onboarding.migration_acceptance', 'implementation.golive_decision', 'service.admission_record', 'service.value_review', 'service.control_drill',
  'service.joint_exercise', 'executive.signature', 'governance.artifact', 'external'] $$;
/* The keys an OPERATIONAL scope adds (IA-71-003, DP-71-003): exact artifacts, integrations, data classes, workloads, products, infrastructure. */
CREATE OR REPLACE FUNCTION governance.ar_operational_scope_keys() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['artifacts', 'integrations', 'data_classes', 'workloads', 'products', 'infrastructure'] $$;
/* Review triggers (ES-71-005): what an act may declare; the sweep raises the rest itself. */
CREATE OR REPLACE FUNCTION governance.ar_trigger_kinds() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  'material_change', 'incident', 'control_failure', 'model_withdrawal', 'agent_withdrawal', 'slo_exhaustion',
  'evidence_expired', 'evidence_failed', 'condition_overdue', 'review_due', 'period_ended', 'capability_changed', 'exception_expired', 'release_held'] $$;
CREATE OR REPLACE FUNCTION governance.ar_class_rank(p text) RETURNS int LANGUAGE sql IMMUTABLE AS $$ SELECT array_position(ARRAY['C0', 'C1', 'C2', 'C3', 'C4'], p) $$;
GRANT EXECUTE ON FUNCTION governance.ar_kinds(), governance.ar_obligations(), governance.ar_obligation_roles(text), governance.ar_min_obligations(text),
  governance.ar_evidence_kinds(), governance.ar_slots(text), governance.ar_evidence_subjects(), governance.ar_operational_scope_keys(), governance.ar_trigger_kinds(),
  governance.ar_class_rank(text) TO eye_app, eye_commit;

-- §AR.2 THE TABLES ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* THE EVIDENCE VAULT (INF-OP-12, DAT-OP-12, IADR-022): append-only items, each a digest-bound reference with its capture and validity; a
   renewal or a failure is a LATER item (renews). Every item is SYNTHETIC on a demonstration (claim). */
CREATE TABLE governance.acceptance_evidence (
  evidence_id     uuid PRIMARY KEY,
  scope           text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  kind            text NOT NULL CONSTRAINT gae_kind CHECK (kind = ANY (governance.ar_evidence_kinds())),
  title           text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 300),
  subject_kind    text NOT NULL CONSTRAINT gae_subject CHECK (subject_kind = ANY (governance.ar_evidence_subjects())),
  subject_id      uuid,
  subject_version int,
  subject_digest  text NOT NULL CHECK (subject_digest ~ '^[0-9a-f]{64}$'),
  pointer         text CHECK (pointer IS NULL OR length(btrim(pointer)) BETWEEN 3 AND 500),
  covers          jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(covers) = 'object'),
  outcome         text NOT NULL DEFAULT 'passed' CHECK (outcome IN ('passed', 'failed', 'recorded')),
  captured_at     timestamptz NOT NULL,
  valid_until     timestamptz NOT NULL,
  renews          uuid REFERENCES governance.acceptance_evidence (evidence_id),
  digest          text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  claim           text NOT NULL DEFAULT 'demonstration' CHECK (claim = 'demonstration'),
  recorded_by     uuid NOT NULL,
  recorded_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT gae_validity CHECK (valid_until > captured_at),
  CONSTRAINT gae_reference CHECK ((subject_kind = 'external') = (subject_id IS NULL) AND (subject_kind <> 'external' OR pointer IS NOT NULL))
);
CREATE INDEX gae_domain ON governance.acceptance_evidence (tenant_id, domain_id, kind, recorded_at DESC);
CREATE TRIGGER gae_append_only BEFORE UPDATE OR DELETE ON governance.acceptance_evidence FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* THE ACCEPTANCE RECORD — versioned per record_id; a version's content is digest-bound and never edited (state columns move). */
CREATE TABLE governance.acceptance_records (
  record_id        uuid NOT NULL,
  version          int  NOT NULL CHECK (version >= 1),
  scope            text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  kind             text NOT NULL CONSTRAINT gac_kind CHECK (kind = ANY (governance.ar_kinds())),
  title            text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 300),
  subject_artifact uuid NOT NULL,
  subject_key      text NOT NULL,
  subject_digest   text NOT NULL CHECK (subject_digest ~ '^[0-9a-f]{64}$'),
  scope_tuple      jsonb NOT NULL CHECK (jsonb_typeof(scope_tuple) = 'object'),
  obligations      text[] NOT NULL CHECK (cardinality(obligations) >= 2),
  evidence         jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'array'),
  conditions       jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(conditions) = 'array'),
  exceptions       jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(exceptions) = 'array'),
  operational      jsonb CHECK (operational IS NULL OR jsonb_typeof(operational) = 'object'),
  builders         uuid[] NOT NULL DEFAULT '{}',
  digest           text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  state            text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'accepted', 'constrained', 'suspended', 'lapsed', 'withheld', 'withdrawn', 'superseded')),
  effective_scope  jsonb,
  constrained_reasons jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(constrained_reasons) = 'array'),
  claim            text NOT NULL DEFAULT 'demonstration' CHECK (claim = 'demonstration'),
  real_acceptance  text NOT NULL DEFAULT 'R2: acceptance by named independent and customer authorities is external — this record is construction or demonstration evidence only',
  proposed_by      uuid NOT NULL,
  proposed_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  accepted_at      timestamptz,
  constrained_at   timestamptz,
  ended_by         uuid,
  ended_at         timestamptz,
  end_reason       text,
  expiry_timer_id  uuid,
  correlation_id   uuid NOT NULL,
  PRIMARY KEY (record_id, version),
  CONSTRAINT gac_accepted CHECK (state IN ('proposed', 'withheld', 'withdrawn', 'superseded') OR accepted_at IS NOT NULL OR state = 'superseded'),
  CONSTRAINT gac_constrained CHECK (state NOT IN ('constrained', 'suspended', 'lapsed') OR constrained_at IS NOT NULL)
);
CREATE UNIQUE INDEX gac_one_proposed ON governance.acceptance_records (record_id) WHERE state = 'proposed';
CREATE UNIQUE INDEX gac_one_in_force ON governance.acceptance_records (record_id) WHERE state IN ('accepted', 'constrained', 'suspended', 'lapsed');
CREATE INDEX gac_subject ON governance.acceptance_records (tenant_id, subject_artifact, state);

/* THE ATTESTATIONS (append-only): one named human per obligation per version, SIGNED when attesting (executive.signatures
   acceptance_attestation over the version's digest). A withholding ends the version (withheld) and exposes the unmet obligation. */
CREATE TABLE governance.acceptance_attestations (
  attestation_id  uuid PRIMARY KEY,
  scope           text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  record_id       uuid NOT NULL,
  version         int  NOT NULL,
  obligation      text NOT NULL CONSTRAINT gat_obligation CHECK (obligation = ANY (governance.ar_obligations())),
  decision        text NOT NULL CHECK (decision IN ('attest', 'withhold')),
  attester        uuid NOT NULL,
  attester_role   text NOT NULL,
  record_digest   text NOT NULL CHECK (record_digest ~ '^[0-9a-f]{64}$'),
  signature_id    uuid,
  reason          text NOT NULL CHECK (length(btrim(reason)) >= 8),
  claim           text NOT NULL DEFAULT 'demonstration' CHECK (claim = 'demonstration'),
  attested_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  FOREIGN KEY (record_id, version) REFERENCES governance.acceptance_records (record_id, version),
  CONSTRAINT gat_one_per_obligation UNIQUE (record_id, version, obligation),
  CONSTRAINT gat_one_per_person UNIQUE (record_id, version, attester),
  CONSTRAINT gat_signed CHECK (decision <> 'attest' OR signature_id IS NOT NULL)
);
CREATE TRIGGER gat_append_only BEFORE UPDATE OR DELETE ON governance.acceptance_attestations FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* THE CUSTOMER VERIFICATION (JRN-24's customer-verify stage): the customer's named human verifies the version against its own scope before the
   customer obligation is attested. Append-only; one per version. */
CREATE TABLE governance.acceptance_verifications (
  verification_id uuid PRIMARY KEY,
  scope           text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  record_id       uuid NOT NULL,
  version         int  NOT NULL,
  record_digest   text NOT NULL CHECK (record_digest ~ '^[0-9a-f]{64}$'),
  outcome         text NOT NULL CHECK (outcome IN ('verified', 'not_verified')),
  findings        text NOT NULL CHECK (length(btrim(findings)) >= 8),
  verifier        uuid NOT NULL,
  verified_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  FOREIGN KEY (record_id, version) REFERENCES governance.acceptance_records (record_id, version),
  CONSTRAINT gav_one UNIQUE (record_id, version)
);
CREATE TRIGGER gav_append_only BEFORE UPDATE OR DELETE ON governance.acceptance_verifications FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* A CONDITION MET (append-only): the condition's key on the record, the CURRENT evidence that meets it, the named human. */
CREATE TABLE governance.acceptance_condition_events (
  event_id        uuid PRIMARY KEY,
  scope           text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  record_id       uuid NOT NULL,
  version         int  NOT NULL,
  condition_key   text NOT NULL,
  evidence_id     uuid NOT NULL REFERENCES governance.acceptance_evidence (evidence_id),
  reason          text NOT NULL CHECK (length(btrim(reason)) >= 8),
  met_by          uuid NOT NULL,
  met_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  FOREIGN KEY (record_id, version) REFERENCES governance.acceptance_records (record_id, version),
  CONSTRAINT gace_once UNIQUE (record_id, version, condition_key)
);
CREATE TRIGGER gace_append_only BEFORE UPDATE OR DELETE ON governance.acceptance_condition_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* THE REVIEW TRIGGERS (ES-71-005, IA-71-005): what put a record under review, suspended or lapsed it — the sweep's findings and the acts. */
CREATE TABLE governance.acceptance_triggers (
  trigger_id      uuid PRIMARY KEY,
  scope           text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  record_id       uuid NOT NULL,
  version         int  NOT NULL,
  kind            text NOT NULL CONSTRAINT gtr_kind CHECK (kind = ANY (governance.ar_trigger_kinds())),
  policy          text NOT NULL CHECK (policy IN ('review', 'suspend', 'lapse')),
  detail          jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(detail) = 'object'),
  source          text NOT NULL CHECK (source IN ('sweep', 'act')),
  raised_by       uuid NOT NULL,
  raised_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  FOREIGN KEY (record_id, version) REFERENCES governance.acceptance_records (record_id, version)
);
CREATE INDEX gtr_record ON governance.acceptance_triggers (record_id, version, raised_at);
CREATE TRIGGER gtr_append_only BEFORE UPDATE OR DELETE ON governance.acceptance_triggers FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* THE OPT-IN GATE'S REGISTER (PLATFORM, the vendor's; versioned, append-only): a capability marked enforce_acceptance and the action prefixes it
   covers. The current row per capability is the highest version. */
CREATE TABLE governance.acceptance_enforcement (
  capability_key  text NOT NULL,
  version         int  NOT NULL CHECK (version >= 1),
  scope           text NOT NULL DEFAULT 'PLATFORM' CHECK (scope = 'PLATFORM'),
  tenant_id       uuid CHECK (tenant_id IS NULL),
  domain_id       uuid CHECK (domain_id IS NULL),
  capability_artifact uuid NOT NULL,
  enforced        boolean NOT NULL,
  action_prefixes text[] NOT NULL,
  reason          text NOT NULL CHECK (length(btrim(reason)) >= 8),
  digest          text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  set_by          uuid NOT NULL,
  set_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  PRIMARY KEY (capability_key, version),
  CONSTRAINT gaf_prefixes CHECK (NOT enforced OR cardinality(action_prefixes) >= 1)
);
CREATE TRIGGER gaf_append_only BEFORE UPDATE OR DELETE ON governance.acceptance_enforcement FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- RLS and grants (the prelude's idioms): the DOMAIN tables under domain isolation; the PLATFORM register readable by every authenticated
-- context (the vendor's registry, not tenant data); SELECT only — the definer ports write.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['governance.acceptance_evidence', 'governance.acceptance_records', 'governance.acceptance_attestations', 'governance.acceptance_verifications',
                           'governance.acceptance_condition_events', 'governance.acceptance_triggers'] LOOP
    EXECUTE format('REVOKE ALL ON %s FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$CREATE POLICY domain_isolation ON %s USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()))$f$, t);
    EXECUTE format('GRANT SELECT ON %s TO eye_app, eye_commit', t);
  END LOOP;
  REVOKE ALL ON governance.acceptance_enforcement FROM PUBLIC;
  ALTER TABLE governance.acceptance_enforcement ENABLE ROW LEVEL SECURITY;
  ALTER TABLE governance.acceptance_enforcement FORCE ROW LEVEL SECURITY;
  CREATE POLICY governance_visibility ON governance.acceptance_enforcement USING (public.eye_scope() <> 'NONE');
  GRANT SELECT ON governance.acceptance_enforcement TO eye_app, eye_commit;
END $$;

-- §AR.3 INTERNAL HELPERS (SECURITY DEFINER where they write; REVOKE PUBLIC; granted to no runtime role — the ports call them) ──────────────
/* The acting principal is the route's. */
CREATE OR REPLACE FUNCTION governance._ar_actor(p_noun text, p_actor uuid) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = public, pg_catalog, pg_temp AS $$
BEGIN
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION '% rejected (actor): the act is recorded under the acting principal', p_noun USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION governance._ar_actor(text, uuid) FROM PUBLIC;

/* REGISTER (or re-version) an artifact of the shared core: nothing when the current version carries the same digest; otherwise the current
   version is superseded and the next written (the prelude's rule: one current version per artifact and per kind + key + owner scope). */
CREATE OR REPLACE FUNCTION governance._ar_artifact(p_id uuid, p_tenant uuid, p_domain uuid, p_kind text, p_key text, p_title text, p_lifecycle text, p_attrs jsonb, p_digest text,
                                                   p_actor uuid, p_correlation uuid) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE cur governance.artifacts%ROWTYPE;
BEGIN
  SELECT * INTO cur FROM governance.artifacts a WHERE a.artifact_id = p_id AND a.superseded_at IS NULL FOR UPDATE;
  IF FOUND AND cur.digest = p_digest AND cur.lifecycle = p_lifecycle THEN RETURN cur.version; END IF;
  IF FOUND THEN UPDATE governance.artifacts SET superseded_at = clock_timestamp() WHERE artifact_id = p_id AND version = cur.version; END IF;
  INSERT INTO governance.artifacts (artifact_id, version, scope, tenant_id, domain_id, kind, external_key, title, owner_role, authority_class, controlling_volume, lifecycle,
                                    attributes, source, digest, recorded_by, correlation_id)
  VALUES (p_id, coalesce(cur.version, 0) + 1, CASE WHEN p_domain IS NOT NULL THEN 'DOMAIN' WHEN p_tenant IS NOT NULL THEN 'TENANT' ELSE 'PLATFORM' END, p_tenant, p_domain, p_kind, p_key,
          left(p_title, 500), 'product_authority', 'acceptance', 'V8', p_lifecycle, coalesce(p_attrs, '{}'::jsonb), jsonb_build_object('part', 'B107 §AR', 'claim', 'demonstration'),
          p_digest, p_actor, p_correlation);
  RETURN coalesce(cur.version, 0) + 1;
END $$;
REVOKE ALL ON FUNCTION governance._ar_artifact(uuid, uuid, uuid, text, text, text, text, jsonb, text, uuid, uuid) FROM PUBLIC;

/* A LINK of the shared core, written once (a live link of the same from/to/relation answers itself). */
CREATE OR REPLACE FUNCTION governance._ar_link(p_tenant uuid, p_domain uuid, p_from uuid, p_to uuid, p_relation text, p_attrs jsonb, p_actor uuid, p_correlation uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE v uuid;
BEGIN
  SELECT l.link_id INTO v FROM governance.links l WHERE l.from_artifact = p_from AND l.to_artifact = p_to AND l.relation = p_relation AND NOT l.retired
     AND NOT EXISTS (SELECT 1 FROM governance.links r WHERE r.retires_link = l.link_id) LIMIT 1;
  IF v IS NOT NULL THEN RETURN v; END IF;
  v := gen_random_uuid();
  INSERT INTO governance.links (link_id, scope, tenant_id, domain_id, from_artifact, to_artifact, relation, attributes, recorded_by, correlation_id)
  VALUES (v, CASE WHEN p_domain IS NOT NULL THEN 'DOMAIN' WHEN p_tenant IS NOT NULL THEN 'TENANT' ELSE 'PLATFORM' END, p_tenant, p_domain, p_from, p_to, p_relation,
          coalesce(p_attrs, '{}'::jsonb), p_actor, p_correlation);
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION governance._ar_link(uuid, uuid, uuid, uuid, text, jsonb, uuid, uuid) FROM PUBLIC;

/* A blanket value anywhere in a scope (PAT-48: "no blanket acceptance"): '*', 'all', 'any', 'every', '%' as a whole string value, or an empty list. */
CREATE OR REPLACE FUNCTION governance.ar_blanket(p jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  WITH RECURSIVE walk(path, v) AS (
    SELECT ARRAY[k], e FROM jsonb_each(CASE WHEN jsonb_typeof(p) = 'object' THEN p ELSE '{}'::jsonb END) AS x(k, e)
    UNION ALL
    SELECT w.path || c.k, c.e FROM walk w, LATERAL (
      SELECT o.k, o.e FROM jsonb_each(CASE WHEN jsonb_typeof(w.v) = 'object' THEN w.v ELSE '{}'::jsonb END) AS o(k, e)
      UNION ALL
      SELECT '[' || (a.i - 1)::text || ']', a.e FROM jsonb_array_elements(CASE WHEN jsonb_typeof(w.v) = 'array' THEN w.v ELSE '[]'::jsonb END) WITH ORDINALITY AS a(e, i)) c
  )
  SELECT array_to_string(path, '.') FROM walk
   WHERE (jsonb_typeof(v) = 'string' AND lower(btrim(v #>> '{}')) IN ('*', 'all', 'any', 'every', '%', 'everything', 'everyone'))
      OR (jsonb_typeof(v) = 'array' AND jsonb_array_length(v) = 0)
   ORDER BY 1 LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION governance.ar_blanket(jsonb) TO eye_app, eye_commit;

/* The EFFECTIVE scope (FEX-31): the accepted scope minus what the affected evidence items COVER (journeys, roles, data keys). An item covering
   the whole scope (no covers) removes nothing — the record stays within its previously accepted scope, expansion held. */
CREATE OR REPLACE FUNCTION governance.ar_effective_scope(p_scope jsonb, p_affected jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  WITH cut AS (
    SELECT coalesce(jsonb_agg(DISTINCT j) FILTER (WHERE j IS NOT NULL), '[]'::jsonb) AS journeys,
           coalesce((SELECT jsonb_agg(DISTINCT r) FROM jsonb_array_elements(coalesce(p_affected, '[]'::jsonb)) a, jsonb_array_elements_text(coalesce(a -> 'covers' -> 'roles', '[]'::jsonb)) r), '[]'::jsonb) AS roles,
           coalesce((SELECT jsonb_agg(DISTINCT k) FROM jsonb_array_elements(coalesce(p_affected, '[]'::jsonb)) a, jsonb_array_elements_text(coalesce(a -> 'covers' -> 'data', '[]'::jsonb)) k), '[]'::jsonb) AS data
      FROM jsonb_array_elements(coalesce(p_affected, '[]'::jsonb)) a LEFT JOIN LATERAL jsonb_array_elements_text(coalesce(a -> 'covers' -> 'journeys', '[]'::jsonb)) j ON true
  )
  SELECT p_scope
         || jsonb_build_object('journeys', coalesce((SELECT jsonb_agg(x) FROM jsonb_array_elements_text(p_scope -> 'journeys') x WHERE NOT (cut.journeys ? x)), '[]'::jsonb),
                               'roles', coalesce((SELECT jsonb_agg(x) FROM jsonb_array_elements_text(p_scope -> 'roles') x WHERE NOT (cut.roles ? x)), '[]'::jsonb),
                               'data_versions', coalesce((SELECT jsonb_object_agg(k, v) FROM jsonb_each(coalesce(p_scope -> 'data_versions', '{}'::jsonb)) e(k, v) WHERE NOT (cut.data ? k)), '{}'::jsonb),
                               'removed', jsonb_build_object('journeys', cut.journeys, 'roles', cut.roles, 'data', cut.data))
    FROM cut
$$;
GRANT EXECUTE ON FUNCTION governance.ar_effective_scope(jsonb, jsonb) TO eye_app, eye_commit;

/* EXPANSION (ES-71-004): what the proposed scope adds beyond the previously accepted one — a domain, journeys, roles, a profile, data or model
   keys, a higher consequence class. An empty array means no expansion. */
CREATE OR REPLACE FUNCTION governance.ar_expansion(p_prior jsonb, p_next jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = governance, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
    SELECT 'domain ' || (p_next ->> 'domain') AS x WHERE (p_next ->> 'domain') IS DISTINCT FROM (p_prior ->> 'domain')
    UNION ALL SELECT 'journey ' || j FROM jsonb_array_elements_text(coalesce(p_next -> 'journeys', '[]'::jsonb)) j WHERE NOT (coalesce(p_prior -> 'journeys', '[]'::jsonb) ? j)
    UNION ALL SELECT 'role ' || r FROM jsonb_array_elements_text(coalesce(p_next -> 'roles', '[]'::jsonb)) r WHERE NOT (coalesce(p_prior -> 'roles', '[]'::jsonb) ? r)
    UNION ALL SELECT 'deployment profile ' || (p_next ->> 'deployment_profile') WHERE (p_next ->> 'deployment_profile') IS DISTINCT FROM (p_prior ->> 'deployment_profile')
    UNION ALL SELECT 'data ' || k FROM jsonb_object_keys(coalesce(p_next -> 'data_versions', '{}'::jsonb)) k WHERE NOT (coalesce(p_prior -> 'data_versions', '{}'::jsonb) ? k)
    UNION ALL SELECT 'model ' || k FROM jsonb_object_keys(coalesce(p_next -> 'model_versions', '{}'::jsonb)) k WHERE NOT (coalesce(p_prior -> 'model_versions', '{}'::jsonb) ? k)
    UNION ALL SELECT 'consequence class ' || (p_next ->> 'consequence_class')
     WHERE coalesce(governance.ar_class_rank(p_next ->> 'consequence_class'), 0) > coalesce(governance.ar_class_rank(p_prior ->> 'consequence_class'), 0)
  ) s
$$;
GRANT EXECUTE ON FUNCTION governance.ar_expansion(jsonb, jsonb) TO eye_app, eye_commit;

/* Verify an evidence reference against its row (never rewriting it): the row exists in this tenant/domain (a shared artifact may be PLATFORM)
   and its digest; answers the digest the item binds. */
CREATE OR REPLACE FUNCTION governance._ar_reference(p_tenant uuid, p_domain uuid, p_kind text, p_id uuid, p_version int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = governance, onboarding, implementation, service, executive, pg_catalog, pg_temp AS $$
DECLARE v jsonb;
BEGIN
  CASE p_kind
    WHEN 'onboarding.migration_acceptance' THEN
      SELECT jsonb_build_object('digest', a.digest, 'state', a.decision, 'what', 'migration acceptance (' || a.decision || ')') INTO v FROM onboarding.migration_acceptances a
       WHERE a.acceptance_id = p_id AND a.tenant_id = p_tenant AND a.domain_id = p_domain;
    WHEN 'implementation.golive_decision' THEN
      SELECT jsonb_build_object('digest', g.gate_digest, 'state', g.decision, 'what', 'go-live decision (' || g.decision || ')') INTO v FROM implementation.golive_decisions g
       WHERE g.decision_id = p_id AND g.tenant_id = p_tenant AND g.domain_id = p_domain;
    WHEN 'service.admission_record' THEN
      SELECT jsonb_build_object('digest', a.digest, 'state', a.state, 'what', 'admission record v' || a.version || ' (' || a.state || ')') INTO v FROM service.admission_records a
       WHERE a.admission_id = p_id AND a.version = coalesce(p_version, (SELECT max(x.version) FROM service.admission_records x WHERE x.admission_id = p_id))
         AND a.tenant_id = p_tenant AND a.domain_id = p_domain;
    WHEN 'service.value_review' THEN
      SELECT jsonb_build_object('digest', r.inputs_digest, 'state', r.state, 'what', 'value review (' || r.state || ')') INTO v FROM service.value_reviews r
       WHERE r.review_id = p_id AND r.tenant_id = p_tenant AND r.domain_id = p_domain;
    WHEN 'service.control_drill' THEN
      SELECT jsonb_build_object('digest', encode(sha256(convert_to(to_jsonb(d)::text, 'UTF8')), 'hex'), 'state', d.outcome, 'what', 'control drill ' || d.kind || ' (' || d.outcome || ')') INTO v
        FROM service.control_drills d WHERE d.drill_id = p_id AND d.tenant_id = p_tenant AND d.domain_id = p_domain;
    WHEN 'service.joint_exercise' THEN
      SELECT jsonb_build_object('digest', encode(sha256(convert_to(to_jsonb(x)::text, 'UTF8')), 'hex'), 'state', x.outcome, 'what', 'joint exercise (' || x.outcome || ')') INTO v
        FROM service.joint_exercises x WHERE x.exercise_id = p_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    WHEN 'executive.signature' THEN
      SELECT jsonb_build_object('digest', s.subject_digest, 'state', s.subject_kind, 'what', 'signature over ' || s.subject_kind) INTO v FROM executive.signatures s
       WHERE s.signature_id = p_id AND s.tenant_id = p_tenant AND s.domain_id = p_domain;
    WHEN 'governance.artifact' THEN
      SELECT jsonb_build_object('digest', a.digest, 'state', a.lifecycle, 'what', a.kind || ' ' || a.external_key || ' v' || a.version) INTO v FROM governance.artifacts a
       WHERE a.artifact_id = p_id AND (p_version IS NULL AND a.superseded_at IS NULL OR a.version = p_version)
         AND (a.scope = 'PLATFORM' OR (a.tenant_id = p_tenant AND (a.domain_id IS NULL OR a.domain_id = p_domain)));
    ELSE v := NULL;
  END CASE;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION governance._ar_reference(uuid, uuid, text, uuid, int) FROM PUBLIC;

/* The JRN-24 journey of a version (trace → build → test → assure → deploy → exercise → customer verify → attest), from facts only: each stage
   done or open with what shows it. Informational except where a port requires a stage (customer verify before the customer attests). */
CREATE OR REPLACE FUNCTION governance.ar_journey(p_record uuid, p_version int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE r governance.acceptance_records%ROWTYPE; v_now timestamptz := clock_timestamp(); v_items jsonb; v_out jsonb := '[]'::jsonb; v_traced int; s text; v_done boolean; v_by text;
BEGIN
  SELECT * INTO r FROM governance.acceptance_records x WHERE x.record_id = p_record AND x.version = p_version;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM observation.assert_read_scope(r.tenant_id, r.domain_id, 'an acceptance record''s journey');
  SELECT coalesce(jsonb_agg(jsonb_build_object('kind', e.kind, 'id', e.evidence_id, 'current', e.valid_until > v_now AND e.outcome <> 'failed')), '[]'::jsonb) INTO v_items
    FROM governance.acceptance_evidence e WHERE e.evidence_id IN (SELECT (x ->> 'evidence_id')::uuid FROM jsonb_array_elements(r.evidence) x);
  SELECT count(*) INTO v_traced FROM governance.links_live l JOIN governance.artifacts a ON a.artifact_id = CASE WHEN l.from_artifact = r.subject_artifact THEN l.to_artifact ELSE l.from_artifact END
   WHERE (l.from_artifact = r.subject_artifact OR l.to_artifact = r.subject_artifact) AND a.superseded_at IS NULL AND a.kind IN ('requirement', 'journey');
  FOREACH s IN ARRAY ARRAY['trace', 'build', 'test', 'assure', 'deploy', 'exercise', 'customer_verify', 'attest'] LOOP
    v_done := false; v_by := NULL;
    CASE s
      WHEN 'trace' THEN v_done := v_traced > 0; v_by := CASE WHEN v_traced > 0 THEN v_traced || ' live trace link(s) to requirements or journeys' ELSE 'no live trace link to a requirement or journey (§RG''s registry)' END;
      WHEN 'build' THEN v_done := EXISTS (SELECT 1 FROM jsonb_array_elements(v_items) i WHERE i ->> 'kind' IN ('build', 'release_candidate') AND (i ->> 'current')::boolean);
      WHEN 'test' THEN v_done := EXISTS (SELECT 1 FROM jsonb_array_elements(v_items) i WHERE i ->> 'kind' IN ('test_report', 'journey_evidence') AND (i ->> 'current')::boolean);
      WHEN 'assure' THEN v_done := EXISTS (SELECT 1 FROM governance.acceptance_attestations a WHERE a.record_id = p_record AND a.version = p_version AND a.obligation = 'independent_assurance' AND a.decision = 'attest');
      WHEN 'deploy' THEN v_done := EXISTS (SELECT 1 FROM jsonb_array_elements(v_items) i WHERE i ->> 'kind' IN ('deployment', 'golive_decision', 'admission_record', 'migration_acceptance') AND (i ->> 'current')::boolean);
      WHEN 'exercise' THEN v_done := EXISTS (SELECT 1 FROM jsonb_array_elements(v_items) i WHERE i ->> 'kind' IN ('exercise', 'drill', 'recovery', 'resilience') AND (i ->> 'current')::boolean);
      WHEN 'customer_verify' THEN v_done := EXISTS (SELECT 1 FROM governance.acceptance_verifications v WHERE v.record_id = p_record AND v.version = p_version AND v.outcome = 'verified');
      WHEN 'attest' THEN v_done := r.accepted_at IS NOT NULL;
    END CASE;
    v_out := v_out || jsonb_build_array(jsonb_build_object('stage', s, 'done', v_done, 'shown_by', v_by));
  END LOOP;
  RETURN jsonb_build_object('stages', v_out, 'current', (SELECT x ->> 'stage' FROM jsonb_array_elements(v_out) WITH ORDINALITY t(x, i) WHERE NOT (x ->> 'done')::boolean ORDER BY i LIMIT 1),
                            'note', 'customer verify and attest by a REAL customer are R2 — on a demonstration they are SYNTHETIC personas');
END $$;
REVOKE ALL ON FUNCTION governance.ar_journey(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ar_journey(uuid, int) TO eye_app, eye_commit;

/* A display name for an actor of this domain's acceptance (the named authorities are named): a PLATFORM-homed principal (the vendor's
   governance roles) or a principal of the caller's own tenant. */
CREATE OR REPLACE FUNCTION governance.ar_principal_name(p uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = identity, public, pg_catalog, pg_temp AS $$
  SELECT x.display_name FROM identity.principals x WHERE x.id = p AND (x.scope = 'PLATFORM' OR x.tenant_id = public.eye_tenant()) AND public.eye_scope() <> 'NONE'
$$;
REVOKE ALL ON FUNCTION governance.ar_principal_name(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ar_principal_name(uuid) TO eye_app, eye_commit;

-- §AR.4 THE EVIDENCE VAULT'S PORT ──────────────────────────────────────────────────────────────────────────────────────────────────────────
/* RECORD an evidence item (governance.acceptance.evidence.record — the conformance steward, the operations authority, the domain admin, the
   implementation lead or the onboarding authority; an agent may draft evidence, never accept it). A reference is VERIFIED against its row and
   its digest bound (a mismatch is refused); an external item names its pointer and digest. A renewal or a failure renews an earlier item of
   the same kind in the same domain. */
CREATE OR REPLACE FUNCTION governance.ar_record_evidence(p_evidence uuid, p_tenant uuid, p_domain uuid, p_kind text, p_title text, p_subject_kind text, p_subject_id uuid,
                                                         p_subject_version int, p_digest text, p_pointer text, p_covers jsonb, p_outcome text, p_captured_at timestamptz,
                                                         p_valid_until timestamptz, p_renews uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_ref jsonb; v_digest text := p_digest; v_now timestamptz := clock_timestamp(); v_item jsonb; prior governance.acceptance_evidence%ROWTYPE; k text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['governance.acceptance.evidence.record']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM governance._ar_actor('acceptance record', p_actor);
  IF p_kind IS NULL OR NOT (p_kind = ANY (governance.ar_evidence_kinds())) THEN
    RAISE EXCEPTION 'acceptance record rejected (evidence): % is not an evidence kind (%)', coalesce(p_kind, '<none>'), array_to_string(governance.ar_evidence_kinds(), ', ') USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_title, ''))) < 4 THEN RAISE EXCEPTION 'acceptance record rejected (evidence): an item has a title (4+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_subject_kind IS NULL OR NOT (p_subject_kind = ANY (governance.ar_evidence_subjects())) THEN
    RAISE EXCEPTION 'acceptance record rejected (evidence): % is not a referenceable subject (%)', coalesce(p_subject_kind, '<none>'), array_to_string(governance.ar_evidence_subjects(), ', ') USING ERRCODE = '22023';
  END IF;
  IF p_outcome NOT IN ('passed', 'failed', 'recorded') THEN RAISE EXCEPTION 'acceptance record rejected (evidence): the outcome is passed, failed or recorded' USING ERRCODE = '22023'; END IF;
  IF p_captured_at IS NULL OR p_captured_at > v_now + interval '5 minutes' THEN RAISE EXCEPTION 'acceptance record rejected (evidence): an item was captured at a past instant' USING ERRCODE = '22023'; END IF;
  IF p_valid_until IS NULL OR p_valid_until <= p_captured_at OR p_valid_until > p_captured_at + interval '1100 days' THEN
    RAISE EXCEPTION 'acceptance record rejected (evidence): an item is valid until an instant after its capture and within three years — evidence expires' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(coalesce(p_covers, '{}'::jsonb)) <> 'object' THEN RAISE EXCEPTION 'acceptance record rejected (evidence): covers is an object {journeys, roles, data}' USING ERRCODE = '22023'; END IF;
  FOR k IN SELECT jsonb_object_keys(coalesce(p_covers, '{}'::jsonb)) LOOP
    IF k NOT IN ('journeys', 'roles', 'data') OR jsonb_typeof(p_covers -> k) <> 'array' THEN
      RAISE EXCEPTION 'acceptance record rejected (evidence): covers names journeys, roles or data as lists (% is not)', k USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF p_subject_kind = 'external' THEN
    IF p_subject_id IS NOT NULL OR length(btrim(coalesce(p_pointer, ''))) < 3 OR coalesce(v_digest, '') !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'acceptance record rejected (evidence): an external item names its pointer and its digest (64 hex), and no in-product subject' USING ERRCODE = '22023';
    END IF;
  ELSE
    IF p_subject_id IS NULL THEN RAISE EXCEPTION 'acceptance record rejected (evidence): a % reference names its id', p_subject_kind USING ERRCODE = '22023'; END IF;
    v_ref := governance._ar_reference(p_tenant, p_domain, p_subject_kind, p_subject_id, p_subject_version);
    IF v_ref IS NULL THEN
      RAISE EXCEPTION 'acceptance record rejected (unknown_evidence_subject): % % is not a record of this domain', p_subject_kind, p_subject_id USING ERRCODE = '23503';
    END IF;
    IF v_digest IS NULL THEN v_digest := v_ref ->> 'digest'; END IF;
    IF v_digest IS DISTINCT FROM (v_ref ->> 'digest') THEN
      RAISE EXCEPTION 'acceptance record rejected (stale): the digest named is not the referenced %''s (it reads %)', v_ref ->> 'what', left(v_ref ->> 'digest', 12) USING ERRCODE = '23505';
    END IF;
  END IF;
  IF p_renews IS NOT NULL THEN
    SELECT * INTO prior FROM governance.acceptance_evidence e WHERE e.evidence_id = p_renews AND e.tenant_id = p_tenant AND e.domain_id = p_domain;
    IF NOT FOUND THEN RAISE EXCEPTION 'acceptance record rejected (unknown_evidence): % is not an evidence item of this domain', p_renews USING ERRCODE = '23503'; END IF;
    IF prior.kind <> p_kind THEN RAISE EXCEPTION 'acceptance record rejected (evidence): a renewal keeps the kind (% renews %)', p_kind, prior.kind USING ERRCODE = '22023'; END IF;
    IF EXISTS (SELECT 1 FROM governance.acceptance_evidence e WHERE e.renews = p_renews) THEN
      RAISE EXCEPTION 'acceptance record rejected (duplicate): item % is already renewed', p_renews USING ERRCODE = '23505';
    END IF;
  END IF;
  v_item := jsonb_build_object('evidence_id', p_evidence, 'kind', p_kind, 'subject_kind', p_subject_kind, 'subject_id', p_subject_id, 'subject_version', p_subject_version,
                               'subject_digest', v_digest, 'pointer', p_pointer, 'covers', coalesce(p_covers, '{}'::jsonb), 'outcome', p_outcome,
                               'captured_at', p_captured_at, 'valid_until', p_valid_until, 'renews', p_renews);
  INSERT INTO governance.acceptance_evidence (evidence_id, tenant_id, domain_id, kind, title, subject_kind, subject_id, subject_version, subject_digest, pointer, covers, outcome,
                                              captured_at, valid_until, renews, digest, recorded_by, correlation_id)
  VALUES (p_evidence, p_tenant, p_domain, p_kind, btrim(p_title), p_subject_kind, p_subject_id, p_subject_version, v_digest, p_pointer, coalesce(p_covers, '{}'::jsonb), p_outcome,
          p_captured_at, p_valid_until, p_renews, governance.digest(v_item), p_actor, p_correlation);
  PERFORM governance._ar_artifact(p_evidence, p_tenant, p_domain, 'evidence', 'EVD-' || p_evidence::text, btrim(p_title), 'active',
                                  v_item - 'evidence_id', governance.digest(v_item), p_actor, p_correlation);
  IF p_subject_kind = 'governance.artifact' THEN
    PERFORM governance._ar_link(p_tenant, p_domain, p_evidence, p_subject_id, 'evidences', jsonb_build_object('kind', p_kind), p_actor, p_correlation);
  END IF;
  IF p_renews IS NOT NULL THEN PERFORM governance._ar_link(p_tenant, p_domain, p_evidence, p_renews, 'supersedes', '{}'::jsonb, p_actor, p_correlation); END IF;
  PERFORM governance.ledger(p_tenant, p_domain, 'acceptance_evidence', p_evidence, 1, CASE WHEN p_outcome = 'failed' THEN 'evidence.failed' WHEN p_renews IS NULL THEN 'evidence.recorded' ELSE 'evidence.renewed' END,
                            p_actor, v_item, p_correlation);
  RETURN v_item || jsonb_build_object('digest', governance.digest(v_item), 'reference', v_ref, 'claim', 'demonstration');
END $$;
REVOKE ALL ON FUNCTION governance.ar_record_evidence(uuid, uuid, uuid, text, text, text, uuid, int, text, text, jsonb, text, timestamptz, timestamptz, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ar_record_evidence(uuid, uuid, uuid, text, text, text, uuid, int, text, text, jsonb, text, timestamptz, timestamptz, uuid, uuid, uuid) TO eye_commit;

-- §AR.5 PROPOSE ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* PROPOSE a record (or its next version — the re-acceptance) — governance.acceptance.propose. The exact scope (no blanket — PAT-48), the
   obligations (at least the kind's minimum), CURRENT evidence (missing or stale refuses — PR-71-005), the conditions (absent slots become open
   conditions; a conditional record never admits a consequence class above C2 — ES-71-004 "consequence-limited"), the linked exceptions
   (unexpired), the release candidate unheld (a release record), the EXPANSION HOLD (a constrained, suspended or lapsed record of the same
   subject in this tenant refuses any proposal beyond its previously accepted scope), the expected version. */
CREATE OR REPLACE FUNCTION governance.ar_propose(p_record uuid, p_tenant uuid, p_domain uuid, p_kind text, p_title text, p_subject_key text, p_scope jsonb, p_obligations text[],
                                                 p_evidence uuid[], p_conditions jsonb, p_exceptions uuid[], p_operational jsonb, p_builders uuid[], p_expected_version int,
                                                 p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, observation, public, pg_catalog, pg_temp AS $$
DECLARE
  v_now timestamptz := clock_timestamp(); v_today date := (clock_timestamp() AT TIME ZONE 'UTC')::date;
  subj governance.artifacts%ROWTYPE; v_cur int; v_version int; v_scope jsonb; v_blank text; v_from date; v_to date; k text; x jsonb; o text;
  v_items jsonb := '[]'::jsonb; v_conditions jsonb := '[]'::jsonb; v_exceptions jsonb := '[]'::jsonb; v_builders uuid[]; v_digest text; v_open int;
  v_held jsonb; v_prior governance.acceptance_records%ROWTYPE; v_exp jsonb; v_matrix jsonb; v_kinds text[]; v_task jsonb; v_tasks jsonb := '[]'::jsonb;
  v_subject_kinds text[]; v_obligations text[]; v_operational jsonb := NULL; v_slot text; v_dup uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['governance.acceptance.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM governance._ar_actor('acceptance record', p_actor);
  IF p_kind IS NULL OR NOT (p_kind = ANY (governance.ar_kinds())) THEN
    RAISE EXCEPTION 'acceptance record rejected (kind): % is not a record kind (capability, operational, release, design)', coalesce(p_kind, '<none>') USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_title, ''))) < 4 THEN RAISE EXCEPTION 'acceptance record rejected (title): a record has a title (4+ characters)' USING ERRCODE = '22023'; END IF;

  -- THE SUBJECT (the shared core's artifact: a capability — §RG's registry —, a release candidate — §CM's —, a design component or pattern — §DG's)
  v_subject_kinds := CASE p_kind WHEN 'release' THEN ARRAY['release_candidate'] WHEN 'design' THEN ARRAY['design_component', 'pattern', 'design_asset'] ELSE ARRAY['capability'] END;
  SELECT * INTO subj FROM governance.artifacts a WHERE a.kind = ANY (v_subject_kinds) AND a.external_key = p_subject_key AND a.superseded_at IS NULL AND a.scope = 'PLATFORM'
   ORDER BY a.effective_from DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'acceptance record rejected (unknown_subject): no current % artifact %', array_to_string(v_subject_kinds, ' or '), coalesce(p_subject_key, '<none>') USING ERRCODE = '23503';
  END IF;
  IF subj.lifecycle NOT IN ('active', 'proposed') THEN
    RAISE EXCEPTION 'acceptance record rejected (state): % % is %', subj.kind, subj.external_key, subj.lifecycle USING ERRCODE = '23505';
  END IF;

  -- THE SCOPE TUPLE (PAT-48, ADR-023, PR-71-002, IA-71-003, DP-71-003): exact and complete; the tenant and domain are the route's
  IF jsonb_typeof(p_scope) <> 'object' THEN RAISE EXCEPTION 'acceptance record rejected (scope): the scope is an object' USING ERRCODE = '22023'; END IF;
  v_blank := governance.ar_blanket(p_scope);
  IF v_blank IS NOT NULL THEN
    RAISE EXCEPTION 'acceptance record rejected (blanket): % is a blanket value — acceptance binds an exact scope (PAT-48: no blanket acceptance)', v_blank USING ERRCODE = '22023';
  END IF;
  FOREACH k IN ARRAY ARRAY['capability_version', 'journeys', 'roles', 'deployment_profile', 'entitlement', 'data_versions', 'model_versions', 'configuration_digest', 'consequence_class', 'period'] LOOP
    IF NOT (p_scope ? k) THEN RAISE EXCEPTION 'acceptance record rejected (scope): the scope names its % (the tuple is exact: capability version, journeys, roles, deployment profile, entitlement, data and model versions, configuration digest, consequence class, period)', k USING ERRCODE = '22023'; END IF;
  END LOOP;
  IF jsonb_typeof(p_scope -> 'journeys') <> 'array' OR jsonb_typeof(p_scope -> 'roles') <> 'array' THEN
    RAISE EXCEPTION 'acceptance record rejected (scope): journeys and roles are lists' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(p_scope -> 'roles') r WHERE NOT EXISTS (SELECT 1 FROM identity.roles x WHERE x.code = r)) THEN
    RAISE EXCEPTION 'acceptance record rejected (scope): every role in scope is a role of the product (%)', (SELECT string_agg(r, ', ') FROM jsonb_array_elements_text(p_scope -> 'roles') r WHERE NOT EXISTS (SELECT 1 FROM identity.roles x WHERE x.code = r)) USING ERRCODE = '22023';
  END IF;
  IF (p_scope ->> 'deployment_profile') NOT IN ('local-dev', 'saas', 'private-cloud', 'on-premise') THEN
    RAISE EXCEPTION 'acceptance record rejected (scope): the deployment profile is local-dev, saas, private-cloud or on-premise' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_scope -> 'data_versions') <> 'object' OR jsonb_typeof(p_scope -> 'model_versions') <> 'object' OR (SELECT count(*) FROM jsonb_object_keys(p_scope -> 'data_versions')) = 0 THEN
    RAISE EXCEPTION 'acceptance record rejected (scope): data versions (non-empty) and model versions are objects {name: version}' USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_scope ->> 'configuration_digest', '') !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'acceptance record rejected (scope): the configuration digest is 64 hex' USING ERRCODE = '22023'; END IF;
  IF governance.ar_class_rank(p_scope ->> 'consequence_class') IS NULL THEN RAISE EXCEPTION 'acceptance record rejected (scope): the consequence class is C0–C4' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_scope ->> 'capability_version', ''))) < 1 OR length(btrim(coalesce(p_scope ->> 'entitlement', ''))) < 2 THEN
    RAISE EXCEPTION 'acceptance record rejected (scope): the capability version and the entitlement are named' USING ERRCODE = '22023';
  END IF;
  BEGIN
    v_from := (p_scope -> 'period' ->> 'from')::date; v_to := (p_scope -> 'period' ->> 'to')::date;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'acceptance record rejected (period): the period is {from, to} as days' USING ERRCODE = '22023';
  END;
  IF v_from IS NULL OR v_to IS NULL OR v_to < v_from OR v_to < v_today OR v_to - v_from > 366 THEN
    RAISE EXCEPTION 'acceptance record rejected (period): a period from ≤ to, not ended, at most 366 days — acceptance is time-bounded' USING ERRCODE = '22023';
  END IF;
  IF p_kind = 'operational' THEN
    FOREACH k IN ARRAY governance.ar_operational_scope_keys() LOOP
      IF jsonb_typeof(p_scope -> k) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'acceptance record rejected (scope): an operational acceptance names its % (a non-empty list — IA-71-003, DP-71-003)', k USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END IF;
  v_scope := (p_scope - 'tenant' - 'domain' - 'capability' - 'release') || jsonb_build_object('tenant', p_tenant, 'domain', p_domain, 'capability', CASE WHEN p_kind = 'release' THEN NULL ELSE subj.external_key END);
  IF p_kind = 'release' THEN
    v_scope := v_scope || jsonb_build_object('release', jsonb_build_object('candidate_id', subj.artifact_id, 'version', subj.version, 'key', subj.external_key, 'digest', subj.digest,
                                                                            'identity', subj.attributes));
  END IF;

  -- THE OBLIGATIONS (ES-71-002, PR-71-003)
  v_obligations := ARRAY(SELECT DISTINCT unnest(coalesce(p_obligations, '{}'::text[]) || governance.ar_min_obligations(p_kind)) ORDER BY 1);
  FOREACH o IN ARRAY v_obligations LOOP
    IF NOT (o = ANY (governance.ar_obligations())) THEN RAISE EXCEPTION 'acceptance record rejected (obligation): % is not an obligation (%)', o, array_to_string(governance.ar_obligations(), ', ') USING ERRCODE = '22023'; END IF;
  END LOOP;

  -- THE EVIDENCE (current, passed or recorded, of this domain; covers within scope); missing or stale refuses (PR-71-005)
  IF cardinality(coalesce(p_evidence, '{}'::uuid[])) = 0 THEN RAISE EXCEPTION 'acceptance record rejected (evidence_missing): acceptance is evidence-bound — name the evidence items' USING ERRCODE = '22023'; END IF;
  FOR x IN SELECT to_jsonb(e) FROM governance.acceptance_evidence e WHERE e.evidence_id = ANY (p_evidence) AND e.tenant_id = p_tenant AND e.domain_id = p_domain ORDER BY e.kind, e.recorded_at LOOP
    IF (x ->> 'valid_until')::timestamptz <= v_now THEN
      RAISE EXCEPTION 'acceptance record rejected (stale): evidence % (%) expired at % — renew it first', x ->> 'evidence_id', x ->> 'kind', x ->> 'valid_until' USING ERRCODE = '23505';
    END IF;
    IF x ->> 'outcome' = 'failed' OR EXISTS (SELECT 1 FROM governance.acceptance_evidence f WHERE f.renews = (x ->> 'evidence_id')::uuid AND f.outcome = 'failed') THEN
      RAISE EXCEPTION 'acceptance record rejected (evidence_failed): evidence % (%) records a failure — remediate and retest', x ->> 'evidence_id', x ->> 'kind' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(x -> 'covers' -> 'journeys', '[]'::jsonb)) j WHERE NOT ((v_scope -> 'journeys') ? j))
       OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(x -> 'covers' -> 'roles', '[]'::jsonb)) r WHERE NOT ((v_scope -> 'roles') ? r)) THEN
      RAISE EXCEPTION 'acceptance record rejected (scope): evidence % covers journeys or roles outside the declared scope', x ->> 'evidence_id' USING ERRCODE = '22023';
    END IF;
    v_items := v_items || jsonb_build_array(jsonb_build_object('evidence_id', x -> 'evidence_id', 'kind', x -> 'kind', 'title', x -> 'title', 'digest', x -> 'digest',
                                                               'subject_kind', x -> 'subject_kind', 'subject_digest', x -> 'subject_digest', 'covers', x -> 'covers',
                                                               'captured_at', x -> 'captured_at', 'valid_until', x -> 'valid_until', 'recorded_by', x -> 'recorded_by'));
  END LOOP;
  IF jsonb_array_length(v_items) <> cardinality(ARRAY(SELECT DISTINCT unnest(p_evidence))) THEN
    RAISE EXCEPTION 'acceptance record rejected (unknown_evidence): % of the named evidence items are not items of this domain', cardinality(ARRAY(SELECT DISTINCT unnest(p_evidence))) - jsonb_array_length(v_items) USING ERRCODE = '23503';
  END IF;
  v_kinds := ARRAY(SELECT DISTINCT i ->> 'kind' FROM jsonb_array_elements(v_items) i);
  IF p_kind IN ('capability', 'release') AND NOT ('test_report' = ANY (v_kinds) OR 'journey_evidence' = ANY (v_kinds)) THEN
    RAISE EXCEPTION 'acceptance record rejected (evidence_missing): a % acceptance needs current test or journey evidence (PR-71-006)', p_kind USING ERRCODE = '22023';
  END IF;

  -- THE CONDITIONS: the proposer's, plus an OPEN condition for every absent evidence slot (never a silent pass)
  IF jsonb_typeof(coalesce(p_conditions, '[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'acceptance record rejected (condition): conditions are a list' USING ERRCODE = '22023'; END IF;
  FOR x IN SELECT * FROM jsonb_array_elements(coalesce(p_conditions, '[]'::jsonb)) LOOP
    IF coalesce(x ->> 'key', '') !~ '^[a-z][a-z0-9_.:-]{1,60}$' OR length(btrim(coalesce(x ->> 'text', ''))) < 8 THEN
      RAISE EXCEPTION 'acceptance record rejected (condition): a condition has a key and a text (8+ characters)' USING ERRCODE = '22023';
    END IF;
    BEGIN
      IF (x ->> 'due')::date < v_today OR (x ->> 'due')::date > v_to THEN
        RAISE EXCEPTION 'acceptance record rejected (condition): condition % is due within the period (by %)', x ->> 'key', v_to USING ERRCODE = '22023';
      END IF;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow OR invalid_text_representation THEN
      RAISE EXCEPTION 'acceptance record rejected (condition): condition % names its due day', x ->> 'key' USING ERRCODE = '22023';
    END;
    IF x ->> 'due' IS NULL THEN RAISE EXCEPTION 'acceptance record rejected (condition): condition % names its due day — conditions are time-bounded', x ->> 'key' USING ERRCODE = '22023'; END IF;
    IF v_conditions @> jsonb_build_array(jsonb_build_object('key', x ->> 'key')) THEN RAISE EXCEPTION 'acceptance record rejected (condition): condition key % is named twice', x ->> 'key' USING ERRCODE = '22023'; END IF;
    v_conditions := v_conditions || jsonb_build_array(jsonb_build_object('key', x ->> 'key', 'text', btrim(x ->> 'text'), 'due', x ->> 'due', 'source', 'proposer'));
  END LOOP;
  FOREACH v_slot IN ARRAY governance.ar_slots(p_kind) LOOP
    IF NOT (v_slot = ANY (v_kinds)) THEN
      v_conditions := v_conditions || jsonb_build_array(jsonb_build_object('key', 'slot:' || v_slot, 'text', format('no current %s evidence was named — an open condition until it is recorded and closed', replace(v_slot, '_', ' ')),
                                                                           'due', least(v_to, v_today + 30), 'source', 'slot', 'slot', v_slot));
    END IF;
  END LOOP;
  IF jsonb_array_length(v_conditions) > 0 AND governance.ar_class_rank(v_scope ->> 'consequence_class') > governance.ar_class_rank('C2') THEN
    RAISE EXCEPTION 'acceptance record rejected (conditional): a conditional acceptance (% open conditions) is consequence-limited to C2 (ES-71-004) — close the conditions or lower the class', jsonb_array_length(v_conditions) USING ERRCODE = '22023';
  END IF;

  -- THE OPERATIONAL PART (ES-71-001, IA-71-002, DP-71-002, DAT-DL-08): owners, open risks, constraints, support model, monitoring, review date, withdrawal criteria
  IF p_kind = 'operational' THEN
    IF jsonb_typeof(p_operational) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'acceptance record rejected (operational): an operational acceptance states its operating terms' USING ERRCODE = '22023'; END IF;
    IF jsonb_typeof(p_operational -> 'owners') <> 'array' OR jsonb_array_length(p_operational -> 'owners') = 0
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_operational -> 'owners') w WHERE length(btrim(coalesce(w ->> 'responsibility', ''))) < 3 OR NOT EXISTS (SELECT 1 FROM identity.roles r WHERE r.code = w ->> 'role')) THEN
      RAISE EXCEPTION 'acceptance record rejected (operational): the owners are a list of {responsibility, role} naming roles of the product' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(p_operational -> 'open_risks') <> 'array' OR jsonb_typeof(p_operational -> 'constraints') <> 'array'
       OR jsonb_typeof(p_operational -> 'withdrawal_criteria') <> 'array' OR jsonb_array_length(p_operational -> 'withdrawal_criteria') = 0 THEN
      RAISE EXCEPTION 'acceptance record rejected (operational): open risks and constraints are lists; the withdrawal criteria are a non-empty list' USING ERRCODE = '22023';
    END IF;
    IF length(btrim(coalesce(p_operational ->> 'monitoring', ''))) < 8 THEN RAISE EXCEPTION 'acceptance record rejected (operational): the monitoring is stated (8+ characters)' USING ERRCODE = '22023'; END IF;
    IF (p_operational ->> 'review_date') IS NULL OR (p_operational ->> 'review_date')::date < v_today OR (p_operational ->> 'review_date')::date > v_to THEN
      RAISE EXCEPTION 'acceptance record rejected (operational): the review date falls within the period' USING ERRCODE = '22023';
    END IF;
    -- the support model: B94's approved responsibility matrix of this profile (referenced, never rewritten); absent → an open condition
    SELECT jsonb_build_object('matrix_id', m.matrix_id, 'version', m.version, 'digest', m.digest, 'profile', m.deployment_profile) INTO v_matrix
      FROM service.responsibility_matrices m WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain AND m.deployment_profile = v_scope ->> 'deployment_profile' AND m.state = 'approved'
     ORDER BY m.version DESC LIMIT 1;
    IF v_matrix IS NULL THEN
      v_conditions := v_conditions || jsonb_build_array(jsonb_build_object('key', 'support_model', 'text', 'no approved responsibility matrix (the support model) for this profile — an open condition', 'due', least(v_to, v_today + 30), 'source', 'slot'));
    END IF;
    v_operational := jsonb_build_object('owners', p_operational -> 'owners', 'open_risks', p_operational -> 'open_risks', 'constraints', p_operational -> 'constraints',
                                        'monitoring', btrim(p_operational ->> 'monitoring'), 'review_date', p_operational ->> 'review_date', 'withdrawal_criteria', p_operational -> 'withdrawal_criteria',
                                        'support_model', v_matrix, 'evidence_versions', (SELECT jsonb_object_agg(i ->> 'evidence_id', i ->> 'digest') FROM jsonb_array_elements(v_items) i));
  ELSIF p_operational IS NOT NULL AND p_operational <> '{}'::jsonb THEN
    RAISE EXCEPTION 'acceptance record rejected (operational): operating terms belong to an operational acceptance' USING ERRCODE = '22023';
  END IF;

  -- THE LINKED EXCEPTIONS (ES-68-004): §PG's registry, read through the shared core; an expired or held one refuses
  FOR x IN SELECT to_jsonb(a) FROM governance.artifacts a WHERE a.artifact_id = ANY (coalesce(p_exceptions, '{}'::uuid[])) AND a.superseded_at IS NULL AND a.kind = 'exception' LOOP
    IF x ->> 'lifecycle' <> 'active' OR coalesce((x -> 'attributes' ->> 'expires_at')::timestamptz, 'infinity'::timestamptz) <= v_now
       OR EXISTS (SELECT 1 FROM governance.holds h WHERE h.lifted_at IS NULL AND h.reason_kind = 'exception_expired' AND (h.source_artifact = (x ->> 'artifact_id')::uuid OR h.subject_artifact = (x ->> 'artifact_id')::uuid)) THEN
      RAISE EXCEPTION 'acceptance record rejected (expired): exception % is % — renew it with current evidence before it is carried into an acceptance', x ->> 'external_key',
        CASE WHEN x ->> 'lifecycle' <> 'active' THEN x ->> 'lifecycle' ELSE 'expired' END USING ERRCODE = '23505';
    END IF;
    v_exceptions := v_exceptions || jsonb_build_array(jsonb_build_object('artifact_id', x -> 'artifact_id', 'key', x -> 'external_key', 'version', x -> 'version', 'digest', x -> 'digest',
                                                                         'expires_at', x -> 'attributes' -> 'expires_at'));
  END LOOP;
  IF jsonb_array_length(v_exceptions) <> cardinality(ARRAY(SELECT DISTINCT unnest(coalesce(p_exceptions, '{}'::uuid[])))) THEN
    RAISE EXCEPTION 'acceptance record rejected (unknown_exception): a named exception is not a current exception of the registry' USING ERRCODE = '23503';
  END IF;

  -- A RELEASE CANDIDATE HELD (an expired exception, a conflict, stale evidence — §PG / §CM) is never accepted (FEX-32, V03-T-453)
  IF p_kind = 'release' THEN
    SELECT jsonb_agg(jsonb_build_object('reason_kind', h.reason_kind, 'reason', h.reason)) INTO v_held FROM governance.holds h WHERE h.subject_artifact = subj.artifact_id AND h.lifted_at IS NULL;
    IF v_held IS NOT NULL THEN
      RAISE EXCEPTION 'acceptance record rejected (held): release candidate % is held — %', subj.external_key, (SELECT string_agg(e ->> 'reason_kind' || ': ' || (e ->> 'reason'), '; ') FROM jsonb_array_elements(v_held) e) USING ERRCODE = '23505';
    END IF;
  END IF;

  -- THE VERSION and THE EXPANSION HOLD (ES-71-004)
  SELECT coalesce(max(r.version), 0) INTO v_cur FROM governance.acceptance_records r WHERE r.record_id = p_record;
  IF EXISTS (SELECT 1 FROM governance.acceptance_records r WHERE r.record_id = p_record AND (r.tenant_id <> p_tenant OR r.domain_id <> p_domain OR r.kind <> p_kind OR r.subject_artifact <> subj.artifact_id)) THEN
    RAISE EXCEPTION 'acceptance record rejected (unknown_record): % is not a % record of % in this domain', p_record, p_kind, p_subject_key USING ERRCODE = '23503';
  END IF;
  IF v_cur IS DISTINCT FROM coalesce(p_expected_version, 0) THEN
    RAISE EXCEPTION 'acceptance record rejected (stale): the record is at version % (expected %)', v_cur, coalesce(p_expected_version::text, '0') USING ERRCODE = '23505';
  END IF;
  SELECT r.record_id INTO v_dup FROM governance.acceptance_records r
   WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.kind = p_kind AND r.subject_artifact = subj.artifact_id AND r.record_id <> p_record
     AND r.state IN ('proposed', 'accepted', 'constrained', 'suspended', 'lapsed') LIMIT 1;
  IF v_dup IS NOT NULL THEN
    RAISE EXCEPTION 'acceptance record rejected (duplicate): record % already governs % here — propose its next version', v_dup, subj.external_key USING ERRCODE = '23505';
  END IF;
  FOR v_prior IN SELECT r.* FROM governance.acceptance_records r JOIN governance.holds h ON h.source_artifact = r.record_id AND h.lifted_at IS NULL AND h.reason_kind = 'acceptance_constrained'
                  WHERE r.tenant_id = p_tenant AND r.subject_artifact = subj.artifact_id AND r.state IN ('constrained', 'suspended', 'lapsed') LOOP
    IF v_prior.record_id <> p_record THEN
      RAISE EXCEPTION 'acceptance record rejected (held): % is % in another scope (record % — %) — expansion to a new scope is held until it is re-accepted (ES-71-004)',
        subj.external_key, v_prior.state, v_prior.record_id, coalesce((SELECT string_agg(e ->> 'kind', ', ') FROM jsonb_array_elements(v_prior.constrained_reasons) e), 'constrained') USING ERRCODE = '23505';
    END IF;
    v_exp := governance.ar_expansion(v_prior.scope_tuple, v_scope);
    IF jsonb_array_length(v_exp) > 0 THEN
      RAISE EXCEPTION 'acceptance record rejected (held): the re-acceptance of % expands beyond its previously accepted scope (%) — re-accept the accepted scope first (ES-71-004)',
        subj.external_key, (SELECT string_agg(e, ', ') FROM jsonb_array_elements_text(v_exp) e) USING ERRCODE = '23505';
    END IF;
  END LOOP;

  -- THE BUILDERS (never attesters): declared, the subject's declared builders, the recorders of its build and test evidence
  v_builders := ARRAY(SELECT DISTINCT b FROM unnest(coalesce(p_builders, '{}'::uuid[])
                        || ARRAY(SELECT (j #>> '{}')::uuid FROM jsonb_array_elements(coalesce(subj.attributes -> 'builders', '[]'::jsonb)) j WHERE (j #>> '{}') ~ '^[0-9a-f-]{36}$')
                        || ARRAY(SELECT (i ->> 'recorded_by')::uuid FROM jsonb_array_elements(v_items) i WHERE i ->> 'kind' IN ('build', 'test_report', 'release_candidate'))) b ORDER BY 1);

  v_version := v_cur + 1;
  v_digest := governance.digest(jsonb_build_object('record_id', p_record, 'version', v_version, 'kind', p_kind, 'title', btrim(p_title), 'subject', jsonb_build_object('artifact_id', subj.artifact_id,
                'version', subj.version, 'key', subj.external_key, 'digest', subj.digest), 'scope', v_scope, 'obligations', to_jsonb(v_obligations), 'evidence', v_items,
                'conditions', v_conditions, 'exceptions', v_exceptions, 'operational', v_operational, 'builders', to_jsonb(v_builders), 'claim', 'demonstration'));
  UPDATE governance.acceptance_records SET state = 'superseded', ended_by = p_actor, ended_at = v_now, end_reason = format('superseded by proposed version %s', v_version)
   WHERE record_id = p_record AND state IN ('proposed', 'withheld');
  INSERT INTO governance.acceptance_records (record_id, version, tenant_id, domain_id, kind, title, subject_artifact, subject_key, subject_digest, scope_tuple, obligations, evidence,
                                            conditions, exceptions, operational, builders, digest, proposed_by, correlation_id)
  VALUES (p_record, v_version, p_tenant, p_domain, p_kind, btrim(p_title), subj.artifact_id, subj.external_key, subj.digest, v_scope, v_obligations, v_items, v_conditions, v_exceptions,
          v_operational, v_builders, v_digest, p_actor, p_correlation);

  -- the shared core: the record is an artifact; it covers its subject; its evidence evidences it; its exceptions except it
  PERFORM governance._ar_artifact(p_record, p_tenant, p_domain, 'acceptance_record', 'ACC-' || p_record::text, btrim(p_title) || ' (claim: demonstration)', 'proposed',
                                  jsonb_build_object('kind', p_kind, 'version', v_version, 'subject', subj.external_key, 'state', 'proposed', 'claim', 'demonstration'),
                                  governance.digest(jsonb_build_object('record', v_digest, 'state', 'proposed')), p_actor, p_correlation);
  PERFORM governance._ar_link(p_tenant, p_domain, p_record, subj.artifact_id, 'covers', jsonb_build_object('kind', p_kind), p_actor, p_correlation);
  FOR x IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    PERFORM governance._ar_link(p_tenant, p_domain, (x ->> 'evidence_id')::uuid, p_record, 'evidences', jsonb_build_object('version', v_version), p_actor, p_correlation);
  END LOOP;
  FOR x IN SELECT * FROM jsonb_array_elements(v_exceptions) LOOP
    PERFORM governance._ar_link(p_tenant, p_domain, (x ->> 'artifact_id')::uuid, p_record, 'excepts', jsonb_build_object('version', v_version), p_actor, p_correlation);
  END LOOP;

  -- the attestations awaited: one governance.attest task per obligation (candidate roles; the port decides who)
  FOREACH o IN ARRAY v_obligations LOOP
    v_task := executive._open_human_task(gen_random_uuid(), p_tenant, p_domain, 'governance.attest', format('attest:%s:%s:%s', p_record, v_version, o),
                jsonb_build_object('kind', 'acceptance_record', 'id', p_record, 'version', v_version, 'obligation', o),
                format('Attest the %s obligation of "%s" v%s', replace(o, '_', ' '), btrim(p_title), v_version), NULL, governance.ar_obligation_roles(o),
                jsonb_build_object('rule', 'a named human holding the obligation''s role; never the proposer, never a builder, never an agent; one person per obligation'),
                NULL, '{}'::jsonb, NULL, NULL, p_actor, p_correlation);
    v_tasks := v_tasks || jsonb_build_array(jsonb_build_object('obligation', o, 'task_id', v_task -> 'task_id'));
  END LOOP;
  PERFORM governance.ledger(p_tenant, p_domain, 'acceptance_record', p_record, v_version, 'acceptance.proposed', p_actor,
                            jsonb_build_object('kind', p_kind, 'subject', subj.external_key, 'digest', v_digest, 'obligations', to_jsonb(v_obligations),
                                               'evidence', (SELECT jsonb_agg(i -> 'evidence_id') FROM jsonb_array_elements(v_items) i), 'conditions', jsonb_array_length(v_conditions),
                                               'exceptions', jsonb_array_length(v_exceptions), 'claim', 'demonstration'), p_correlation);
  RETURN jsonb_build_object('record_id', p_record, 'version', v_version, 'state', 'proposed', 'kind', p_kind, 'digest', v_digest, 'scope', v_scope, 'obligations', to_jsonb(v_obligations),
                            'evidence', v_items, 'conditions', v_conditions, 'exceptions', v_exceptions, 'operational', v_operational, 'builders', to_jsonb(v_builders), 'tasks', v_tasks,
                            'claim', 'demonstration', 'real_acceptance', 'R2: acceptance by named independent and customer authorities is external');
END $$;
REVOKE ALL ON FUNCTION governance.ar_propose(uuid, uuid, uuid, text, text, text, jsonb, text[], uuid[], jsonb, uuid[], jsonb, uuid[], int, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ar_propose(uuid, uuid, uuid, text, text, text, jsonb, text[], uuid[], jsonb, uuid[], jsonb, uuid[], int, uuid, uuid) TO eye_commit;

-- §AR.6 VERIFY (the customer) AND ATTEST (each obligation) ──────────────────────────────────────────────────────────────────────────────
/* The customer VERIFIES a proposed version against its own scope (JRN-24's customer-verify stage) — governance.acceptance.verify: a named
   human customer sponsor or onboarding authority of THIS tenant, never the proposer or a builder, on the exact digest. */
CREATE OR REPLACE FUNCTION governance.ar_verify(p_record uuid, p_version int, p_tenant uuid, p_domain uuid, p_digest text, p_outcome text, p_findings text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, observation, public, pg_catalog, pg_temp AS $$
DECLARE r governance.acceptance_records%ROWTYPE; v uuid := gen_random_uuid();
BEGIN
  PERFORM observation.assert_authority(ARRAY['governance.acceptance.verify']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM governance._ar_actor('acceptance attestation', p_actor);
  SELECT * INTO r FROM governance.acceptance_records x WHERE x.record_id = p_record AND x.version = p_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'acceptance attestation rejected (unknown_record): no acceptance record %/v% in this domain', p_record, p_version USING ERRCODE = '23503'; END IF;
  PERFORM governance.assert_approver('acceptance attestation', p_actor, p_tenant, p_domain, ARRAY['customer_sponsor', 'onboarding_authority'], r.proposed_by, r.builders, 'the customer''s verification');
  IF NOT EXISTS (SELECT 1 FROM identity.principals x WHERE x.id = p_actor AND x.tenant_id = p_tenant) THEN
    RAISE EXCEPTION 'acceptance attestation rejected (authority): the customer''s verification is a member of the customer''s own tenant' USING ERRCODE = '42501';
  END IF;
  IF r.state <> 'proposed' THEN RAISE EXCEPTION 'acceptance attestation rejected (state): version % is %', p_version, r.state USING ERRCODE = '23505'; END IF;
  IF p_digest IS DISTINCT FROM r.digest THEN RAISE EXCEPTION 'acceptance attestation rejected (stale): the verification names a digest other than version %''s', p_version USING ERRCODE = '23505'; END IF;
  IF p_outcome NOT IN ('verified', 'not_verified') THEN RAISE EXCEPTION 'acceptance attestation rejected (outcome): verified or not_verified' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_findings, ''))) < 8 THEN RAISE EXCEPTION 'acceptance attestation rejected (findings): the verification states its findings (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM governance.acceptance_verifications x WHERE x.record_id = p_record AND x.version = p_version) THEN
    RAISE EXCEPTION 'acceptance attestation rejected (duplicate): version % is already verified by the customer', p_version USING ERRCODE = '23505';
  END IF;
  INSERT INTO governance.acceptance_verifications (verification_id, tenant_id, domain_id, record_id, version, record_digest, outcome, findings, verifier, correlation_id)
  VALUES (v, p_tenant, p_domain, p_record, p_version, r.digest, p_outcome, btrim(p_findings), p_actor, p_correlation);
  PERFORM governance.ledger(p_tenant, p_domain, 'acceptance_record', p_record, p_version, 'acceptance.' || p_outcome, p_actor, jsonb_build_object('verification_id', v, 'digest', r.digest), p_correlation);
  RETURN jsonb_build_object('verification_id', v, 'record_id', p_record, 'version', p_version, 'outcome', p_outcome, 'digest', r.digest, 'claim', 'demonstration');
END $$;
REVOKE ALL ON FUNCTION governance.ar_verify(uuid, int, uuid, uuid, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ar_verify(uuid, int, uuid, uuid, text, text, text, uuid, uuid) TO eye_commit;

/* ATTEST (or WITHHOLD) one obligation of a proposed version — governance.acceptance.attest (human-gated): THE APPROVER TEST (a named active
   human holding the obligation's role; never the proposer, never a builder, never an agent), ONE PERSON PER OBLIGATION, the exact digest, the
   evidence still current, the exceptions unexpired, a release candidate unheld, the customer's verification before the customer attests; an
   attestation carries the attester's signature over the digest (executive.signatures acceptance_attestation, bound to this action). The LAST
   attestation ACCEPTS: the record in force for exactly its scope, the prior version superseded, the expansion hold LIFTED, the next expiry
   TIMER scheduled. A withholding ends the version (withheld) with its reason. */
CREATE OR REPLACE FUNCTION governance.ar_attest(p_record uuid, p_version int, p_tenant uuid, p_domain uuid, p_obligation text, p_decision text, p_digest text, p_reason text,
                                                p_signature uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, observation, public, pg_catalog, pg_temp AS $$
DECLARE
  r governance.acceptance_records%ROWTYPE; v_now timestamptz := clock_timestamp(); v_role text; v_att uuid := gen_random_uuid(); v_missing text[]; x jsonb;
  v_state text := 'proposed'; v_lifted jsonb := '[]'::jsonb; v_closed jsonb; v_next timestamptz; v_timer uuid; v_held text; v_roles int; v_prior int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['governance.acceptance.attest']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM governance._ar_actor('acceptance attestation', p_actor);
  SELECT * INTO r FROM governance.acceptance_records x2 WHERE x2.record_id = p_record AND x2.version = p_version AND x2.tenant_id = p_tenant AND x2.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'acceptance attestation rejected (unknown_record): no acceptance record %/v% in this domain', p_record, p_version USING ERRCODE = '23503'; END IF;
  IF p_obligation IS NULL OR NOT (p_obligation = ANY (r.obligations)) THEN
    RAISE EXCEPTION 'acceptance attestation rejected (obligation): % is not an obligation of version % (%)', coalesce(p_obligation, '<none>'), p_version, array_to_string(r.obligations, ', ') USING ERRCODE = '22023';
  END IF;
  PERFORM governance.assert_approver('acceptance attestation', p_actor, p_tenant, p_domain, governance.ar_obligation_roles(p_obligation), r.proposed_by, r.builders,
                                     format('attesting the %s obligation', replace(p_obligation, '_', ' ')));
  IF p_obligation = 'customer' AND NOT EXISTS (SELECT 1 FROM identity.principals x2 WHERE x2.id = p_actor AND x2.tenant_id = p_tenant) THEN
    RAISE EXCEPTION 'acceptance attestation rejected (authority): the customer''s obligation is attested by a member of the customer''s own tenant' USING ERRCODE = '42501';
  END IF;
  IF r.state <> 'proposed' THEN RAISE EXCEPTION 'acceptance attestation rejected (state): version % is %', p_version, r.state USING ERRCODE = '23505'; END IF;
  IF p_digest IS DISTINCT FROM r.digest THEN RAISE EXCEPTION 'acceptance attestation rejected (stale): the attestation names a digest other than version %''s', p_version USING ERRCODE = '23505'; END IF;
  IF p_decision NOT IN ('attest', 'withhold') THEN RAISE EXCEPTION 'acceptance attestation rejected (decision): attest or withhold' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'acceptance attestation rejected (reason): an attestation states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM governance.acceptance_attestations a WHERE a.record_id = p_record AND a.version = p_version AND a.obligation = p_obligation) THEN
    RAISE EXCEPTION 'acceptance attestation rejected (duplicate): the % obligation of version % is already attested', p_obligation, p_version USING ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM governance.acceptance_attestations a WHERE a.record_id = p_record AND a.version = p_version AND a.attester = p_actor) THEN
    RAISE EXCEPTION 'acceptance attestation rejected (separation_of_duties): one named human attests ONE obligation — no single person accepts on behalf of the independent authorities (ES-71-002)' USING ERRCODE = '42501';
  END IF;
  SELECT b.role_code INTO v_role FROM identity.role_bindings b WHERE b.principal_id = p_actor AND b.revoked_at IS NULL AND b.role_code = ANY (governance.ar_obligation_roles(p_obligation))
     AND (b.scope = 'PLATFORM' OR (b.scope = 'TENANT' AND b.tenant_id = p_tenant) OR (b.scope = 'DOMAIN' AND b.domain_id = p_domain)) ORDER BY b.role_code LIMIT 1;

  IF p_decision = 'withhold' THEN
    INSERT INTO governance.acceptance_attestations (attestation_id, tenant_id, domain_id, record_id, version, obligation, decision, attester, attester_role, record_digest, reason, correlation_id)
    VALUES (v_att, p_tenant, p_domain, p_record, p_version, p_obligation, 'withhold', p_actor, v_role, r.digest, btrim(p_reason), p_correlation);
    UPDATE governance.acceptance_records SET state = 'withheld', ended_by = p_actor, ended_at = v_now, end_reason = format('the %s obligation was withheld: %s', p_obligation, btrim(p_reason))
     WHERE record_id = p_record AND version = p_version;
    PERFORM executive._resolve_human_tasks(p_tenant, p_domain, jsonb_build_object('kind', 'acceptance_record', 'id', p_record, 'version', p_version), ARRAY['governance.attest'], 'withheld', v_att, p_actor, p_correlation);
    PERFORM governance._ar_artifact(p_record, p_tenant, p_domain, 'acceptance_record', 'ACC-' || p_record::text, r.title || ' (claim: demonstration)', 'retired',
                                    jsonb_build_object('kind', r.kind, 'version', p_version, 'subject', r.subject_key, 'state', 'withheld', 'claim', 'demonstration'),
                                    governance.digest(jsonb_build_object('record', r.digest, 'state', 'withheld')), p_actor, p_correlation);
    PERFORM governance.ledger(p_tenant, p_domain, 'acceptance_record', p_record, p_version, 'acceptance.withheld', p_actor,
                              jsonb_build_object('obligation', p_obligation, 'reason', btrim(p_reason), 'attestation_id', v_att), p_correlation);
    RETURN jsonb_build_object('record_id', p_record, 'version', p_version, 'state', 'withheld', 'obligation', p_obligation, 'attestation_id', v_att,
                              'unmet', to_jsonb(r.obligations), 'claim', 'demonstration');
  END IF;

  -- ATTEST: the evidence current, the exceptions unexpired, the release candidate unheld, the customer's verification before the customer
  FOR x IN SELECT * FROM jsonb_array_elements(r.evidence) LOOP
    IF EXISTS (SELECT 1 FROM governance.acceptance_evidence e WHERE e.evidence_id = (x ->> 'evidence_id')::uuid AND (e.valid_until <= v_now OR e.outcome = 'failed'))
       OR EXISTS (SELECT 1 FROM governance.acceptance_evidence f WHERE f.renews = (x ->> 'evidence_id')::uuid AND f.outcome = 'failed') THEN
      RAISE EXCEPTION 'acceptance attestation rejected (stale): evidence % (%) is no longer current — renew it and propose a new version', x ->> 'evidence_id', x ->> 'kind' USING ERRCODE = '23505';
    END IF;
  END LOOP;
  FOR x IN SELECT * FROM jsonb_array_elements(r.exceptions) LOOP
    IF NOT EXISTS (SELECT 1 FROM governance.artifacts a WHERE a.artifact_id = (x ->> 'artifact_id')::uuid AND a.superseded_at IS NULL AND a.lifecycle = 'active'
                    AND coalesce((a.attributes ->> 'expires_at')::timestamptz, 'infinity'::timestamptz) > v_now)
       OR EXISTS (SELECT 1 FROM governance.holds h WHERE h.lifted_at IS NULL AND h.reason_kind = 'exception_expired' AND (h.source_artifact = (x ->> 'artifact_id')::uuid OR h.subject_artifact = (x ->> 'artifact_id')::uuid)) THEN
      RAISE EXCEPTION 'acceptance attestation rejected (expired): linked exception % expired — it is renewed with current evidence first', x ->> 'key' USING ERRCODE = '23505';
    END IF;
  END LOOP;
  IF r.kind = 'release' THEN
    SELECT string_agg(h.reason_kind || ': ' || h.reason, '; ') INTO v_held FROM governance.holds h WHERE h.subject_artifact = r.subject_artifact AND h.lifted_at IS NULL;
    IF v_held IS NOT NULL THEN RAISE EXCEPTION 'acceptance attestation rejected (held): release candidate % is held — %', r.subject_key, v_held USING ERRCODE = '23505'; END IF;
  END IF;
  IF p_obligation = 'customer' AND NOT EXISTS (SELECT 1 FROM governance.acceptance_verifications v WHERE v.record_id = p_record AND v.version = p_version AND v.outcome = 'verified') THEN
    RAISE EXCEPTION 'acceptance attestation rejected (state): the customer VERIFIES version % before attesting it (JRN-24: customer verify → attest)', p_version USING ERRCODE = '23505';
  END IF;
  IF p_signature IS NULL OR NOT EXISTS (SELECT 1 FROM executive.signatures s WHERE s.signature_id = p_signature AND s.subject_kind = 'acceptance_attestation' AND s.subject_id = p_record
                                                AND s.subject_version = p_version AND s.subject_digest = r.digest AND s.signer = p_actor AND s.bound_action = 'governance.acceptance.attest') THEN
    RAISE EXCEPTION 'acceptance attestation rejected (signature): an attestation carries the attester''s signature over the version''s digest' USING ERRCODE = '22023';
  END IF;
  INSERT INTO governance.acceptance_attestations (attestation_id, tenant_id, domain_id, record_id, version, obligation, decision, attester, attester_role, record_digest, signature_id, reason, correlation_id)
  VALUES (v_att, p_tenant, p_domain, p_record, p_version, p_obligation, 'attest', p_actor, v_role, r.digest, p_signature, btrim(p_reason), p_correlation);
  PERFORM executive._resolve_human_tasks(p_tenant, p_domain, jsonb_build_object('kind', 'acceptance_record', 'id', p_record, 'version', p_version, 'obligation', p_obligation),
                                         ARRAY['governance.attest'], 'attested', v_att, p_actor, p_correlation);
  PERFORM governance.ledger(p_tenant, p_domain, 'acceptance_record', p_record, p_version, 'acceptance.attested', p_actor,
                            jsonb_build_object('obligation', p_obligation, 'role', v_role, 'signature_id', p_signature, 'attestation_id', v_att), p_correlation);

  v_missing := ARRAY(SELECT o FROM unnest(r.obligations) o WHERE NOT EXISTS (SELECT 1 FROM governance.acceptance_attestations a WHERE a.record_id = p_record AND a.version = p_version AND a.obligation = o AND a.decision = 'attest'));
  IF cardinality(v_missing) = 0 THEN
    SELECT count(DISTINCT a.attester_role) INTO v_roles FROM governance.acceptance_attestations a WHERE a.record_id = p_record AND a.version = p_version AND a.decision = 'attest';
    IF v_roles < 2 THEN
      RAISE EXCEPTION 'acceptance attestation rejected (separation_of_duties): one role never accepts every obligation (ES-71-002)' USING ERRCODE = '42501';
    END IF;
    -- ACCEPTED: exactly this scope; the prior version superseded; the expansion hold lifted; the attention closed; the next expiry timer
    SELECT count(*) INTO v_prior FROM governance.acceptance_records p WHERE p.record_id = p_record AND p.version <> p_version AND p.state IN ('accepted', 'constrained', 'suspended', 'lapsed');
    UPDATE governance.acceptance_records SET state = 'superseded', ended_by = p_actor, ended_at = v_now, end_reason = format('re-accepted as version %s over renewed evidence', p_version)
     WHERE record_id = p_record AND version <> p_version AND state IN ('accepted', 'constrained', 'suspended', 'lapsed');
    v_state := 'accepted';
    SELECT min(t) INTO v_next FROM (
      SELECT (e ->> 'valid_until')::timestamptz AS t FROM jsonb_array_elements(r.evidence) e
      UNION ALL SELECT ((c ->> 'due')::date + 1)::timestamptz FROM jsonb_array_elements(r.conditions) c
      UNION ALL SELECT ((r.scope_tuple -> 'period' ->> 'to')::date + 1)::timestamptz
      UNION ALL SELECT ((r.operational ->> 'review_date')::date + 1)::timestamptz WHERE r.operational IS NOT NULL) s;
    v_timer := executive._schedule_timer(gen_random_uuid(), p_tenant, p_domain, 'acceptance_record', p_record, 'acceptance.evidence_expiry', greatest(v_next, v_now),
                                         jsonb_build_object('version', p_version, 'digest', r.digest), p_actor, p_correlation);
    UPDATE governance.acceptance_records SET state = 'accepted', accepted_at = v_now, effective_scope = r.scope_tuple, expiry_timer_id = v_timer WHERE record_id = p_record AND version = p_version;
    WITH l AS (UPDATE governance.holds h SET lifted_at = v_now, lifted_by = p_actor, lift_reason = format('re-accepted: version %s accepted over renewed evidence by every obligation', p_version)
                WHERE h.source_artifact = p_record AND h.lifted_at IS NULL AND h.reason_kind = 'acceptance_constrained' RETURNING h.hold_id)
    SELECT coalesce(jsonb_agg(l.hold_id), '[]'::jsonb) INTO v_lifted FROM l;
    v_closed := executive.b33_close_items(p_tenant, p_domain, 'governance.acceptance', 'acceptance_record', p_record, format('version %s accepted for its exact scope', p_version), p_actor, p_correlation);
    PERFORM governance._ar_artifact(p_record, p_tenant, p_domain, 'acceptance_record', 'ACC-' || p_record::text, r.title || ' (claim: demonstration)', 'active',
                                    jsonb_build_object('kind', r.kind, 'version', p_version, 'subject', r.subject_key, 'state', 'accepted', 'claim', 'demonstration'),
                                    governance.digest(jsonb_build_object('record', r.digest, 'state', 'accepted')), p_actor, p_correlation);
    PERFORM governance.ledger(p_tenant, p_domain, 'acceptance_record', p_record, p_version, CASE WHEN v_prior > 0 THEN 'acceptance.reaccepted' ELSE 'acceptance.accepted' END, p_actor,
                              jsonb_build_object('digest', r.digest, 'scope', r.scope_tuple, 'holds_lifted', v_lifted, 'items_closed', v_closed, 'timer_id', v_timer, 'next_check', v_next,
                                                 'claim', 'demonstration'), p_correlation);
  END IF;
  RETURN jsonb_build_object('record_id', p_record, 'version', p_version, 'state', v_state, 'obligation', p_obligation, 'attestation_id', v_att, 'signature_id', p_signature,
                            'unmet', to_jsonb(v_missing), 'holds_lifted', v_lifted, 'claim', 'demonstration',
                            'real_acceptance', 'R2: acceptance by named independent and customer authorities is external');
END $$;
REVOKE ALL ON FUNCTION governance.ar_attest(uuid, int, uuid, uuid, text, text, text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ar_attest(uuid, int, uuid, uuid, text, text, text, text, uuid, uuid, uuid) TO eye_commit;

-- §AR.7 THE RECONCILIATION SWEEP (evidence expiry and everything else a record in force declared) ─────────────────────────────────────────
/* What a record in force no longer meets, read from facts (IA-71-002, DP-71-002 "continuously reconcile"): expired or failed evidence (with
   what each covers), overdue conditions, a passed review date, the end of the period, a changed subject, an expired linked exception, a held
   release candidate. Read-only. */
CREATE OR REPLACE FUNCTION governance.ar_findings(p_record uuid, p_version int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE r governance.acceptance_records%ROWTYPE; v_now timestamptz := clock_timestamp(); v_today date := (clock_timestamp() AT TIME ZONE 'UTC')::date; v jsonb := '[]'::jsonb; x jsonb; e governance.acceptance_evidence%ROWTYPE;
BEGIN
  SELECT * INTO r FROM governance.acceptance_records a WHERE a.record_id = p_record AND a.version = p_version;
  IF NOT FOUND THEN RETURN '[]'::jsonb; END IF;
  PERFORM observation.assert_read_scope(r.tenant_id, r.domain_id, 'an acceptance record''s findings');
  FOR x IN SELECT * FROM jsonb_array_elements(r.evidence) LOOP
    SELECT * INTO e FROM governance.acceptance_evidence a WHERE a.evidence_id = (x ->> 'evidence_id')::uuid;
    IF e.valid_until <= v_now THEN
      v := v || jsonb_build_array(jsonb_build_object('kind', 'evidence_expired', 'ref', e.evidence_id, 'evidence_kind', e.kind, 'title', e.title, 'valid_until', e.valid_until, 'covers', e.covers));
    ELSIF e.outcome = 'failed' OR EXISTS (SELECT 1 FROM governance.acceptance_evidence f WHERE f.renews = e.evidence_id AND f.outcome = 'failed') THEN
      v := v || jsonb_build_array(jsonb_build_object('kind', 'evidence_failed', 'ref', e.evidence_id, 'evidence_kind', e.kind, 'title', e.title, 'covers', e.covers,
                                                     'failure', (SELECT f.evidence_id FROM governance.acceptance_evidence f WHERE f.renews = e.evidence_id AND f.outcome = 'failed' LIMIT 1)));
    END IF;
  END LOOP;
  FOR x IN SELECT * FROM jsonb_array_elements(r.conditions) LOOP
    IF (x ->> 'due')::date < v_today AND NOT EXISTS (SELECT 1 FROM governance.acceptance_condition_events c WHERE c.record_id = p_record AND c.version = p_version AND c.condition_key = x ->> 'key') THEN
      v := v || jsonb_build_array(jsonb_build_object('kind', 'condition_overdue', 'ref', x ->> 'key', 'due', x ->> 'due', 'text', x ->> 'text'));
    END IF;
  END LOOP;
  IF r.operational IS NOT NULL AND (r.operational ->> 'review_date')::date < v_today THEN
    v := v || jsonb_build_array(jsonb_build_object('kind', 'review_due', 'ref', 'review_date', 'due', r.operational ->> 'review_date'));
  END IF;
  IF (r.scope_tuple -> 'period' ->> 'to')::date < v_today THEN
    v := v || jsonb_build_array(jsonb_build_object('kind', 'period_ended', 'ref', 'period', 'ended', r.scope_tuple -> 'period' ->> 'to'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM governance.artifacts a WHERE a.artifact_id = r.subject_artifact AND a.superseded_at IS NULL AND a.digest = r.subject_digest AND a.lifecycle IN ('active', 'proposed')) THEN
    v := v || jsonb_build_array(jsonb_build_object('kind', 'capability_changed', 'ref', r.subject_key, 'accepted_digest', r.subject_digest,
                                                   'current', (SELECT jsonb_build_object('version', a.version, 'digest', a.digest, 'lifecycle', a.lifecycle) FROM governance.artifacts a WHERE a.artifact_id = r.subject_artifact AND a.superseded_at IS NULL)));
  END IF;
  FOR x IN SELECT * FROM jsonb_array_elements(r.exceptions) LOOP
    IF NOT EXISTS (SELECT 1 FROM governance.artifacts a WHERE a.artifact_id = (x ->> 'artifact_id')::uuid AND a.superseded_at IS NULL AND a.lifecycle = 'active'
                    AND coalesce((a.attributes ->> 'expires_at')::timestamptz, 'infinity'::timestamptz) > v_now)
       OR EXISTS (SELECT 1 FROM governance.holds h WHERE h.lifted_at IS NULL AND h.reason_kind = 'exception_expired' AND (h.source_artifact = (x ->> 'artifact_id')::uuid OR h.subject_artifact = (x ->> 'artifact_id')::uuid)) THEN
      v := v || jsonb_build_array(jsonb_build_object('kind', 'exception_expired', 'ref', x ->> 'key'));
    END IF;
  END LOOP;
  IF r.kind = 'release' AND EXISTS (SELECT 1 FROM governance.holds h WHERE h.subject_artifact = r.subject_artifact AND h.lifted_at IS NULL) THEN
    v := v || jsonb_build_array(jsonb_build_object('kind', 'release_held', 'ref', r.subject_key,
                                                   'holds', (SELECT jsonb_agg(h.reason_kind) FROM governance.holds h WHERE h.subject_artifact = r.subject_artifact AND h.lifted_at IS NULL)));
  END IF;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION governance.ar_findings(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ar_findings(uuid, int) TO eye_app, eye_commit;

/* Apply a record's findings (internal; the sweep, the timer and the trigger act call it inside their own governed write): nothing written when
   nothing is new. An ACCEPTED record with findings turns CONSTRAINED (the effective scope = the accepted scope minus what the affected items
   cover — FEX-31), a passed period LAPSES it; the hold on EXPANSION is opened once; attention `governance.acceptance` is raised; a trigger row
   per new finding; the ledger. */
CREATE OR REPLACE FUNCTION governance._ar_constrain(p_record uuid, p_version int, p_findings jsonb, p_source text, p_policy text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE
  r governance.acceptance_records%ROWTYPE; v_now timestamptz := clock_timestamp(); v_new jsonb := '[]'::jsonb; x jsonb; v_state text; v_eff jsonb; v_hold uuid; v_item jsonb := NULL;
  v_first uuid; v_trig uuid; v_all jsonb;
BEGIN
  SELECT * INTO r FROM governance.acceptance_records a WHERE a.record_id = p_record AND a.version = p_version FOR UPDATE;
  IF NOT FOUND OR r.state NOT IN ('accepted', 'constrained', 'suspended', 'lapsed') THEN RETURN NULL; END IF;
  FOR x IN SELECT * FROM jsonb_array_elements(coalesce(p_findings, '[]'::jsonb)) LOOP
    IF NOT (r.constrained_reasons @> jsonb_build_array(jsonb_build_object('kind', x ->> 'kind', 'ref', x ->> 'ref'))) THEN v_new := v_new || jsonb_build_array(x); END IF;
  END LOOP;
  v_state := CASE WHEN r.state = 'lapsed' OR p_policy = 'lapse' OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_findings) f WHERE f ->> 'kind' = 'period_ended') THEN 'lapsed'
                  WHEN r.state = 'suspended' OR p_policy = 'suspend' THEN 'suspended' ELSE 'constrained' END;
  IF jsonb_array_length(v_new) = 0 AND v_state = r.state THEN RETURN NULL; END IF;
  v_all := r.constrained_reasons || v_new;
  v_eff := CASE WHEN v_state IN ('lapsed', 'suspended') THEN NULL
                ELSE governance.ar_effective_scope(r.scope_tuple, (SELECT coalesce(jsonb_agg(f), '[]'::jsonb) FROM jsonb_array_elements(v_all) f WHERE f ->> 'kind' IN ('evidence_expired', 'evidence_failed'))) END;
  UPDATE governance.acceptance_records SET state = v_state, constrained_at = coalesce(constrained_at, v_now), constrained_reasons = v_all, effective_scope = v_eff
   WHERE record_id = p_record AND version = p_version;
  FOR x IN SELECT * FROM jsonb_array_elements(v_new) LOOP
    v_trig := gen_random_uuid(); v_first := coalesce(v_first, v_trig);
    INSERT INTO governance.acceptance_triggers (trigger_id, tenant_id, domain_id, record_id, version, kind, policy, detail, source, raised_by, correlation_id)
    VALUES (v_trig, r.tenant_id, r.domain_id, p_record, p_version, x ->> 'kind',
            CASE WHEN x ->> 'kind' = 'period_ended' THEN 'lapse' WHEN v_state = 'suspended' THEN 'suspend' ELSE 'review' END, x, p_source, p_actor, p_correlation);
  END LOOP;
  SELECT h.hold_id INTO v_hold FROM governance.holds h WHERE h.source_artifact = p_record AND h.lifted_at IS NULL AND h.reason_kind = 'acceptance_constrained' LIMIT 1;
  IF v_hold IS NULL THEN
    v_hold := gen_random_uuid();
    INSERT INTO governance.holds (hold_id, scope, tenant_id, domain_id, subject_artifact, reason_kind, source_artifact, reason, opened_by, correlation_id)
    VALUES (v_hold, 'DOMAIN', r.tenant_id, r.domain_id, r.subject_artifact, 'acceptance_constrained', p_record,
            format('%s is %s in this scope (%s) — expansion to a new domain, tenant, journey, role, profile, data, model or a higher consequence class is held until re-acceptance over renewed evidence',
                   r.subject_key, v_state, (SELECT string_agg(DISTINCT f ->> 'kind', ', ') FROM jsonb_array_elements(v_all) f)), p_actor, p_correlation);
  END IF;
  IF jsonb_array_length(v_new) > 0 THEN
    v_item := executive.b33_raise_routed(r.tenant_id, r.domain_id, 'governance.acceptance', 'acceptance_record', p_record,
                format('%s is %s: %s', r.subject_key, upper(v_state), (SELECT string_agg(f ->> 'kind' || coalesce(' ' || (f ->> 'evidence_kind'), ''), '; ') FROM jsonb_array_elements(v_new) f)),
                (SELECT jsonb_agg(f ->> 'kind') FROM jsonb_array_elements(v_new) f), NULL, v_first, 'governance.acceptance.' || v_state,
                jsonb_build_object('record_id', p_record, 'version', p_version, 'findings', v_new, 'hold_id', v_hold),
                jsonb_build_object('consequence', r.scope_tuple ->> 'consequence_class'), p_actor, p_correlation);
  END IF;
  PERFORM governance._ar_artifact(p_record, r.tenant_id, r.domain_id, 'acceptance_record', 'ACC-' || p_record::text, r.title || ' (claim: demonstration)', 'active',
                                  jsonb_build_object('kind', r.kind, 'version', p_version, 'subject', r.subject_key, 'state', v_state, 'claim', 'demonstration'),
                                  governance.digest(jsonb_build_object('record', r.digest, 'state', v_state)), p_actor, p_correlation);
  PERFORM governance.ledger(r.tenant_id, r.domain_id, 'acceptance_record', p_record, p_version, 'acceptance.' || v_state, p_actor,
                            jsonb_build_object('findings', v_new, 'effective_scope', v_eff, 'hold_id', v_hold, 'source', p_source, 'attention', v_item), p_correlation);
  RETURN jsonb_build_object('record_id', p_record, 'version', p_version, 'from', r.state, 'state', v_state, 'new_findings', v_new, 'effective_scope', v_eff, 'hold_id', v_hold, 'attention', v_item);
END $$;
REVOKE ALL ON FUNCTION governance._ar_constrain(uuid, int, jsonb, text, text, uuid, uuid) FROM PUBLIC;

/* THE SWEEP — the attention tick's step `acceptance-evidence-expiry` (bound to executive.attention.tick) or an explicit run
   (governance.acceptance.sweep): every record in force of the domain reconciled; reads first (the findings), then the writes. */
CREATE OR REPLACE FUNCTION governance.ar_sweep(p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, observation, public, pg_catalog, pg_temp AS $$
DECLARE r record; v_found jsonb := '[]'::jsonb; x jsonb; v_out jsonb := '[]'::jsonb; v jsonb; v_checked int := 0;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick', 'governance.acceptance.sweep']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM governance._ar_actor('acceptance record', p_actor);
  FOR r IN SELECT a.record_id, a.version FROM governance.acceptance_records a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.state IN ('accepted', 'constrained', 'suspended', 'lapsed')
            ORDER BY a.accepted_at, a.record_id LOOP
    v_checked := v_checked + 1;
    v_found := v_found || jsonb_build_array(jsonb_build_object('record_id', r.record_id, 'version', r.version, 'findings', governance.ar_findings(r.record_id, r.version)));
  END LOOP;
  FOR x IN SELECT * FROM jsonb_array_elements(v_found) LOOP
    IF jsonb_array_length(x -> 'findings') > 0 THEN
      v := governance._ar_constrain((x ->> 'record_id')::uuid, (x ->> 'version')::int, x -> 'findings', 'sweep', 'review', p_actor, p_correlation);
      IF v IS NOT NULL THEN v_out := v_out || jsonb_build_array(v); END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('checked', v_checked, 'changed', v_out);
END $$;
REVOKE ALL ON FUNCTION governance.ar_sweep(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ar_sweep(uuid, uuid, uuid, uuid) TO eye_commit;

/* THE TIMER (acceptance.evidence_expiry, fired by the tick's workflow-timers step): the owning record reconciled now; while it stays accepted
   the next instant is scheduled (the earliest remaining expiry, due day, review date or period end). */
CREATE OR REPLACE FUNCTION governance.ar_timer(p_timer uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, observation, public, pg_catalog, pg_temp AS $$
DECLARE t executive.workflow_timers%ROWTYPE; r governance.acceptance_records%ROWTYPE; v jsonb; v_next timestamptz; v_now timestamptz := clock_timestamp(); v_timer uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM governance._ar_actor('acceptance record', p_actor);
  SELECT * INTO t FROM executive.workflow_timers x WHERE x.timer_id = p_timer AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.owner_kind = 'acceptance_record';
  IF NOT FOUND THEN RAISE EXCEPTION 'acceptance record rejected (unknown_timer): % is not an acceptance timer of this domain', p_timer USING ERRCODE = '23503'; END IF;
  SELECT * INTO r FROM governance.acceptance_records a WHERE a.record_id = t.owner_id AND a.state IN ('accepted', 'constrained', 'suspended', 'lapsed');
  IF NOT FOUND THEN RETURN jsonb_build_object('record_id', t.owner_id, 'skipped', 'no version of the record is in force'); END IF;
  v := governance._ar_constrain(r.record_id, r.version, governance.ar_findings(r.record_id, r.version), 'sweep', 'review', p_actor, p_correlation);
  SELECT * INTO r FROM governance.acceptance_records a WHERE a.record_id = r.record_id AND a.version = r.version;
  IF r.state = 'accepted' THEN
    SELECT min(x) INTO v_next FROM (
      SELECT (e ->> 'valid_until')::timestamptz AS x FROM jsonb_array_elements(r.evidence) e
      UNION ALL SELECT ((c ->> 'due')::date + 1)::timestamptz FROM jsonb_array_elements(r.conditions) c
      UNION ALL SELECT ((r.scope_tuple -> 'period' ->> 'to')::date + 1)::timestamptz
      UNION ALL SELECT ((r.operational ->> 'review_date')::date + 1)::timestamptz WHERE r.operational IS NOT NULL) s WHERE x > v_now;
    IF v_next IS NOT NULL THEN
      v_timer := executive._schedule_timer(gen_random_uuid(), p_tenant, p_domain, 'acceptance_record', r.record_id, 'acceptance.evidence_expiry', v_next,
                                           jsonb_build_object('version', r.version, 'digest', r.digest), p_actor, p_correlation);
      UPDATE governance.acceptance_records SET expiry_timer_id = v_timer WHERE record_id = r.record_id AND version = r.version;
    END IF;
  END IF;
  RETURN jsonb_build_object('record_id', r.record_id, 'version', r.version, 'state', r.state, 'changed', v, 'next_timer', v_timer, 'next_check', v_next);
END $$;
REVOKE ALL ON FUNCTION governance.ar_timer(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ar_timer(uuid, uuid, uuid, uuid, uuid) TO eye_commit;

-- §AR.8 TRIGGERS BY ACT, CONDITIONS MET, WITHDRAWAL ─────────────────────────────────────────────────────────────────────────────────────
/* A REVIEW TRIGGER by act (ES-71-005) — governance.acceptance.trigger (human-gated): a material change, an incident, a control failure, a model
   or agent withdrawal, SLO exhaustion (declared — B64 computes no SLO here) puts the record in force under REVIEW (constrained to its accepted
   scope, expansion held) or SUSPENDS it (nothing in force; the opt-in gate refuses). A named human of the product, operations or assurance
   authority, or the domain administrator. */
CREATE OR REPLACE FUNCTION governance.ar_trigger(p_record uuid, p_tenant uuid, p_domain uuid, p_kind text, p_policy text, p_detail jsonb, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, observation, public, pg_catalog, pg_temp AS $$
DECLARE r governance.acceptance_records%ROWTYPE; v jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['governance.acceptance.trigger']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM governance._ar_actor('acceptance record', p_actor);
  PERFORM governance.assert_approver('acceptance record', p_actor, p_tenant, p_domain, ARRAY['product_authority', 'operations_authority', 'independent_assurance', 'domain_admin'], NULL, NULL,
                                     'putting an acceptance under review or suspending it');
  IF p_kind IS NULL OR p_kind NOT IN ('material_change', 'incident', 'control_failure', 'model_withdrawal', 'agent_withdrawal', 'slo_exhaustion') THEN
    RAISE EXCEPTION 'acceptance record rejected (trigger): % is not a trigger an act declares (material_change, incident, control_failure, model_withdrawal, agent_withdrawal, slo_exhaustion)', coalesce(p_kind, '<none>') USING ERRCODE = '22023';
  END IF;
  IF p_policy NOT IN ('review', 'suspend') THEN RAISE EXCEPTION 'acceptance record rejected (policy): review or suspend' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'acceptance record rejected (reason): a trigger states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM governance.acceptance_records a WHERE a.record_id = p_record AND a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.state IN ('accepted', 'constrained', 'suspended', 'lapsed') FOR UPDATE;
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM governance.acceptance_records a WHERE a.record_id = p_record AND a.tenant_id = p_tenant AND a.domain_id = p_domain) THEN
      RAISE EXCEPTION 'acceptance record rejected (state): record % has no version in force', p_record USING ERRCODE = '23505';
    END IF;
    RAISE EXCEPTION 'acceptance record rejected (unknown_record): % is not an acceptance record of this domain', p_record USING ERRCODE = '23503';
  END IF;
  IF r.state = 'lapsed' THEN RAISE EXCEPTION 'acceptance record rejected (state): version % lapsed — nothing is in force to review', r.version USING ERRCODE = '23505'; END IF;
  v := governance._ar_constrain(r.record_id, r.version, jsonb_build_array(jsonb_build_object('kind', p_kind, 'ref', gen_random_uuid(), 'reason', btrim(p_reason), 'detail', coalesce(p_detail, '{}'::jsonb),
                                 'by', p_actor, 'carrier', CASE WHEN p_kind = 'slo_exhaustion' THEN 'declared here; SLO computation is B64''s' END)), 'act', p_policy, p_actor, p_correlation);
  RETURN coalesce(v, jsonb_build_object('record_id', r.record_id, 'version', r.version, 'state', r.state, 'unchanged', true));
END $$;
REVOKE ALL ON FUNCTION governance.ar_trigger(uuid, uuid, uuid, text, text, jsonb, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ar_trigger(uuid, uuid, uuid, text, text, jsonb, text, uuid, uuid) TO eye_commit;

/* A CONDITION MET — governance.acceptance.condition.close (human-gated): the operations, assurance or product authority (never a builder)
   names the CURRENT evidence that meets it (an evidence slot's condition: an item of that kind). A met condition stops counting as overdue;
   it never lifts a constraint by itself — only a re-acceptance does. */
CREATE OR REPLACE FUNCTION governance.ar_condition_met(p_record uuid, p_version int, p_tenant uuid, p_domain uuid, p_key text, p_evidence uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, observation, public, pg_catalog, pg_temp AS $$
DECLARE r governance.acceptance_records%ROWTYPE; c jsonb; e governance.acceptance_evidence%ROWTYPE; v uuid := gen_random_uuid();
BEGIN
  PERFORM observation.assert_authority(ARRAY['governance.acceptance.condition.close']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM governance._ar_actor('acceptance record', p_actor);
  SELECT * INTO r FROM governance.acceptance_records a WHERE a.record_id = p_record AND a.version = p_version AND a.tenant_id = p_tenant AND a.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'acceptance record rejected (unknown_record): no acceptance record %/v% in this domain', p_record, p_version USING ERRCODE = '23503'; END IF;
  PERFORM governance.assert_approver('acceptance record', p_actor, p_tenant, p_domain, ARRAY['operations_authority', 'independent_assurance', 'product_authority'], NULL, r.builders, 'meeting an acceptance condition');
  IF r.state NOT IN ('proposed', 'accepted', 'constrained') THEN RAISE EXCEPTION 'acceptance record rejected (state): version % is %', p_version, r.state USING ERRCODE = '23505'; END IF;
  SELECT x INTO c FROM jsonb_array_elements(r.conditions) x WHERE x ->> 'key' = p_key;
  IF c IS NULL THEN RAISE EXCEPTION 'acceptance record rejected (unknown_condition): version % has no condition %', p_version, coalesce(p_key, '<none>') USING ERRCODE = '23503'; END IF;
  IF EXISTS (SELECT 1 FROM governance.acceptance_condition_events x WHERE x.record_id = p_record AND x.version = p_version AND x.condition_key = p_key) THEN
    RAISE EXCEPTION 'acceptance record rejected (duplicate): condition % is already met', p_key USING ERRCODE = '23505';
  END IF;
  SELECT * INTO e FROM governance.acceptance_evidence x WHERE x.evidence_id = p_evidence AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'acceptance record rejected (unknown_evidence): % is not an evidence item of this domain', p_evidence USING ERRCODE = '23503'; END IF;
  IF e.valid_until <= clock_timestamp() OR e.outcome = 'failed' THEN RAISE EXCEPTION 'acceptance record rejected (stale): a condition is met by CURRENT, passing evidence' USING ERRCODE = '23505'; END IF;
  IF c ->> 'slot' IS NOT NULL AND e.kind <> c ->> 'slot' THEN
    RAISE EXCEPTION 'acceptance record rejected (condition): the % slot is met by % evidence (this item is %)', c ->> 'slot', c ->> 'slot', e.kind USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'acceptance record rejected (reason): a met condition states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  INSERT INTO governance.acceptance_condition_events (event_id, tenant_id, domain_id, record_id, version, condition_key, evidence_id, reason, met_by, correlation_id)
  VALUES (v, p_tenant, p_domain, p_record, p_version, p_key, p_evidence, btrim(p_reason), p_actor, p_correlation);
  PERFORM governance._ar_link(p_tenant, p_domain, p_evidence, p_record, 'evidences', jsonb_build_object('condition', p_key, 'version', p_version), p_actor, p_correlation);
  PERFORM governance.ledger(p_tenant, p_domain, 'acceptance_record', p_record, p_version, 'acceptance.condition_met', p_actor,
                            jsonb_build_object('condition', p_key, 'evidence_id', p_evidence, 'reason', btrim(p_reason)), p_correlation);
  RETURN jsonb_build_object('event_id', v, 'record_id', p_record, 'version', p_version, 'condition', p_key, 'evidence_id', p_evidence, 'state', r.state,
                            'note', 'a met condition never lifts a constraint by itself — a re-acceptance does');
END $$;
REVOKE ALL ON FUNCTION governance.ar_condition_met(uuid, int, uuid, uuid, text, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ar_condition_met(uuid, int, uuid, uuid, text, uuid, text, uuid, uuid) TO eye_commit;

/* WITHDRAW (ES-71-004 "reversible") — governance.acceptance.withdraw (human-gated): an acceptance in force by a named human product,
   operations or customer authority; a proposal also by its proposer. Every live version ends; the hold is lifted (nothing is accepted any
   more — a new scope needs a new acceptance); the attention closed; the tasks resolved. */
CREATE OR REPLACE FUNCTION governance.ar_withdraw(p_record uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_now timestamptz := clock_timestamp(); v_inforce boolean; v_prop uuid; v_ended jsonb; v_lifted jsonb; v_title text; v_kind text; v_subject text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['governance.acceptance.withdraw']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM governance._ar_actor('acceptance record', p_actor);
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'acceptance record rejected (reason): a withdrawal states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT bool_or(a.state IN ('accepted', 'constrained', 'suspended', 'lapsed')), max(CASE WHEN a.state = 'proposed' THEN a.proposed_by::text END)::uuid, max(a.title), max(a.kind), max(a.subject_key)
    INTO v_inforce, v_prop, v_title, v_kind, v_subject
    FROM governance.acceptance_records a WHERE a.record_id = p_record AND a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.state IN ('proposed', 'accepted', 'constrained', 'suspended', 'lapsed');
  IF v_inforce IS NULL THEN
    IF EXISTS (SELECT 1 FROM governance.acceptance_records a WHERE a.record_id = p_record AND a.tenant_id = p_tenant AND a.domain_id = p_domain) THEN
      RAISE EXCEPTION 'acceptance record rejected (state): record % has no live version to withdraw', p_record USING ERRCODE = '23505';
    END IF;
    RAISE EXCEPTION 'acceptance record rejected (unknown_record): % is not an acceptance record of this domain', p_record USING ERRCODE = '23503';
  END IF;
  IF v_inforce OR p_actor IS DISTINCT FROM v_prop THEN
    PERFORM governance.assert_approver('acceptance record', p_actor, p_tenant, p_domain, ARRAY['product_authority', 'operations_authority', 'customer_sponsor', 'onboarding_authority'], NULL, NULL,
                                       'withdrawing an acceptance');
  END IF;
  WITH e AS (UPDATE governance.acceptance_records SET state = 'withdrawn', ended_by = p_actor, ended_at = v_now, end_reason = btrim(p_reason)
              WHERE record_id = p_record AND state IN ('proposed', 'accepted', 'constrained', 'suspended', 'lapsed') RETURNING version, state)
  SELECT jsonb_agg(e.version) INTO v_ended FROM e;
  WITH l AS (UPDATE governance.holds h SET lifted_at = v_now, lifted_by = p_actor, lift_reason = format('the acceptance was withdrawn: %s — nothing of it is in force any more', btrim(p_reason))
              WHERE h.source_artifact = p_record AND h.lifted_at IS NULL AND h.reason_kind = 'acceptance_constrained' RETURNING h.hold_id)
  SELECT coalesce(jsonb_agg(l.hold_id), '[]'::jsonb) INTO v_lifted FROM l;
  PERFORM executive.b33_close_items(p_tenant, p_domain, 'governance.acceptance', 'acceptance_record', p_record, 'the acceptance was withdrawn', p_actor, p_correlation);
  PERFORM executive._resolve_human_tasks(p_tenant, p_domain, jsonb_build_object('kind', 'acceptance_record', 'id', p_record), ARRAY['governance.attest'], 'withdrawn', p_record, p_actor, p_correlation);
  PERFORM governance._ar_artifact(p_record, p_tenant, p_domain, 'acceptance_record', 'ACC-' || p_record::text, v_title || ' (claim: demonstration)', 'retired',
                                  jsonb_build_object('kind', v_kind, 'subject', v_subject, 'state', 'withdrawn', 'claim', 'demonstration'),
                                  governance.digest(jsonb_build_object('record', p_record, 'state', 'withdrawn', 'at', v_now)), p_actor, p_correlation);
  PERFORM governance.ledger(p_tenant, p_domain, 'acceptance_record', p_record, NULL, 'acceptance.withdrawn', p_actor,
                            jsonb_build_object('versions', v_ended, 'reason', btrim(p_reason), 'holds_lifted', v_lifted), p_correlation);
  RETURN jsonb_build_object('record_id', p_record, 'state', 'withdrawn', 'versions', v_ended, 'holds_lifted', v_lifted);
END $$;
REVOKE ALL ON FUNCTION governance.ar_withdraw(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ar_withdraw(uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

-- §AR.9 THE OPT-IN REQUEST GATE (Q5) ───────────────────────────────────────────────────────────────────────────────────────────────────────
/* MARK a capability enforce_acceptance (or unmark it) — governance.acceptance.enforce (PLATFORM, human-gated): the product authority, a named
   human, never a builder of the capability. The prefixes never name a mandatory control (identity, tenancy, audit, policy, retention,
   objects, commercial, governance), warnings or attention — those are never gated. */
CREATE OR REPLACE FUNCTION governance.ar_enforce(p_capability_key text, p_enforced boolean, p_prefixes text[], p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, observation, public, pg_catalog, pg_temp AS $$
DECLARE cap governance.artifacts%ROWTYPE; v_cur int; v_digest text; px text; v_builders uuid[];
BEGIN
  PERFORM governance.assert_platform('governance.acceptance.enforce', p_actor, 'acceptance record');
  SELECT * INTO cap FROM governance.artifacts a WHERE a.kind = 'capability' AND a.external_key = p_capability_key AND a.superseded_at IS NULL AND a.scope = 'PLATFORM';
  IF NOT FOUND THEN RAISE EXCEPTION 'acceptance record rejected (unknown_capability): no current capability %', coalesce(p_capability_key, '<none>') USING ERRCODE = '23503'; END IF;
  v_builders := ARRAY(SELECT (j #>> '{}')::uuid FROM jsonb_array_elements(coalesce(cap.attributes -> 'builders', '[]'::jsonb)) j WHERE (j #>> '{}') ~ '^[0-9a-f-]{36}$');
  PERFORM governance.assert_approver('acceptance record', p_actor, NULL, NULL, ARRAY['product_authority'], NULL, v_builders, 'marking a capability enforce_acceptance');
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'acceptance record rejected (reason): the marking states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_enforced AND cardinality(coalesce(p_prefixes, '{}'::text[])) = 0 THEN RAISE EXCEPTION 'acceptance record rejected (prefixes): an enforced capability names the action prefixes it covers' USING ERRCODE = '22023'; END IF;
  FOREACH px IN ARRAY coalesce(p_prefixes, '{}'::text[]) LOOP
    IF px !~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*\.?$' OR position('.' IN px) = 0 THEN
      RAISE EXCEPTION 'acceptance record rejected (prefixes): % is not an action or an action prefix (domain.supply. — at least two segments)', px USING ERRCODE = '22023';
    END IF;
    IF split_part(px, '.', 1) IN ('identity', 'tenancy', 'audit', 'policy', 'retention', 'objects', 'commercial', 'governance') OR px LIKE 'executive.attention.%' OR px LIKE 'prediction.warning.%'
       OR px IN ('executive.', 'prediction.') THEN
      RAISE EXCEPTION 'acceptance record rejected (prefixes): % covers a mandatory control, warnings or attention — never gated by acceptance', px USING ERRCODE = '22023';
    END IF;
  END LOOP;
  SELECT coalesce(max(e.version), 0) INTO v_cur FROM governance.acceptance_enforcement e WHERE e.capability_key = p_capability_key;
  v_digest := governance.digest(jsonb_build_object('capability', p_capability_key, 'version', v_cur + 1, 'enforced', p_enforced, 'prefixes', to_jsonb(coalesce(p_prefixes, '{}'::text[]))));
  INSERT INTO governance.acceptance_enforcement (capability_key, version, capability_artifact, enforced, action_prefixes, reason, digest, set_by, correlation_id)
  VALUES (p_capability_key, v_cur + 1, cap.artifact_id, p_enforced, coalesce(p_prefixes, '{}'::text[]), btrim(p_reason), v_digest, p_actor, p_correlation);
  PERFORM governance.ledger(NULL, NULL, 'capability', cap.artifact_id, v_cur + 1, CASE WHEN p_enforced THEN 'acceptance.enforced' ELSE 'acceptance.unenforced' END, p_actor,
                            jsonb_build_object('capability', p_capability_key, 'prefixes', to_jsonb(coalesce(p_prefixes, '{}'::text[])), 'reason', btrim(p_reason), 'digest', v_digest), p_correlation);
  RETURN jsonb_build_object('capability', p_capability_key, 'version', v_cur + 1, 'enforced', p_enforced, 'prefixes', to_jsonb(coalesce(p_prefixes, '{}'::text[])), 'digest', v_digest);
END $$;
REVOKE ALL ON FUNCTION governance.ar_enforce(text, boolean, text[], text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ar_enforce(text, boolean, text[], text, uuid, uuid) TO eye_commit;

/* The enforced capabilities and their prefixes (the vendor's register, no tenant data): the pipeline's cached list — a request whose action
   matches none is never asked anything more. */
CREATE OR REPLACE FUNCTION governance.ar_gate_prefixes() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('capability', e.capability_key, 'prefixes', to_jsonb(e.action_prefixes)) ORDER BY e.capability_key), '[]'::jsonb)
    FROM governance.acceptance_enforcement e
   WHERE e.enforced AND e.version = (SELECT max(x.version) FROM governance.acceptance_enforcement x WHERE x.capability_key = e.capability_key)
$$;
REVOKE ALL ON FUNCTION governance.ar_gate_prefixes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ar_gate_prefixes() TO eye_app, eye_commit;

/* THE GATE's answer for one request (read under the request's own evidence context): the enforced capability its action falls under, and
   whether that capability is accepted HERE for the caller's roles and the request's consequence class — accepted or constrained within the
   effective scope; suspended, lapsed, withdrawn or never accepted refuses. */
CREATE OR REPLACE FUNCTION governance.ar_gate(p_tenant uuid, p_domain uuid, p_action text, p_roles text[], p_class text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = governance, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_cap text; r governance.acceptance_records%ROWTYPE; v_eff jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the acceptance gate');
  SELECT e.capability_key INTO v_cap FROM governance.acceptance_enforcement e, unnest(e.action_prefixes) px
   WHERE e.enforced AND e.version = (SELECT max(x.version) FROM governance.acceptance_enforcement x WHERE x.capability_key = e.capability_key)
     AND (p_action = px OR (right(px, 1) = '.' AND starts_with(p_action, px)))
   ORDER BY length(px) DESC LIMIT 1;
  IF v_cap IS NULL THEN RETURN jsonb_build_object('gated', false, 'available', true); END IF;
  SELECT * INTO r FROM governance.acceptance_records a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.subject_key = v_cap AND a.kind IN ('capability', 'operational')
     AND a.state IN ('accepted', 'constrained', 'suspended', 'lapsed') ORDER BY (a.kind = 'capability') DESC, a.accepted_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('gated', true, 'available', false, 'capability', v_cap, 'state', 'not_accepted',
                              'reason', format('%s is not accepted for this domain — an acceptance names its exact scope (the capability is marked enforce_acceptance)', v_cap));
  END IF;
  IF r.state IN ('suspended', 'lapsed') THEN
    RETURN jsonb_build_object('gated', true, 'available', false, 'capability', v_cap, 'state', r.state, 'record_id', r.record_id, 'version', r.version,
                              'reason', format('%s is %s in this domain (record %s v%s) — nothing of it is in force until it is re-accepted', v_cap, r.state, r.record_id, r.version));
  END IF;
  v_eff := coalesce(r.effective_scope, r.scope_tuple);
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_eff -> 'roles') x WHERE x = ANY (coalesce(p_roles, '{}'::text[]))) THEN
    RETURN jsonb_build_object('gated', true, 'available', false, 'capability', v_cap, 'state', r.state, 'record_id', r.record_id, 'version', r.version,
                              'reason', format('%s is %s here for the roles %s only — the caller''s roles are outside the %s scope', v_cap, r.state,
                                               (SELECT string_agg(x, ', ') FROM jsonb_array_elements_text(v_eff -> 'roles') x), CASE WHEN r.state = 'constrained' THEN 'constrained' ELSE 'accepted' END));
  END IF;
  IF governance.ar_class_rank(coalesce(p_class, 'C0')) > governance.ar_class_rank(v_eff ->> 'consequence_class') THEN
    RETURN jsonb_build_object('gated', true, 'available', false, 'capability', v_cap, 'state', r.state, 'record_id', r.record_id, 'version', r.version,
                              'reason', format('%s is accepted here up to consequence class %s — this request is %s', v_cap, v_eff ->> 'consequence_class', p_class));
  END IF;
  RETURN jsonb_build_object('gated', true, 'available', true, 'capability', v_cap, 'state', r.state, 'record_id', r.record_id, 'version', r.version,
                            'reason', format('%s is %s here (record %s v%s)', v_cap, r.state, r.record_id, r.version));
END $$;
REVOKE ALL ON FUNCTION governance.ar_gate(uuid, uuid, text, text[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ar_gate(uuid, uuid, text, text[], text) TO eye_app, eye_commit;

-- §AR.10 THE READS ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* THE ACCEPTED-SCOPE READ (FEX-31, CAP-AU-11 "resolve acceptance evidence to exact scope and versions"): the subject's state HERE — accepted,
   constrained (with the effective scope and what was removed), suspended, lapsed, proposed only, or NOT ACCEPTED — the unmet obligations of a
   proposal, the evidence with its age and validity, the open holds, whether expansion is held in this tenant, the gate's marking. Nothing is
   shown accepted by inference: no record in force reads not_accepted. */
CREATE OR REPLACE FUNCTION governance.ar_scope(p_tenant uuid, p_domain uuid, p_subject_key text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = governance, observation, public, pg_catalog, pg_temp AS $$
DECLARE r governance.acceptance_records%ROWTYPE; p governance.acceptance_records%ROWTYPE; v_now timestamptz := clock_timestamp(); v_held boolean; v_enf jsonb; v_ev jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the accepted scope');
  SELECT * INTO r FROM governance.acceptance_records a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.subject_key = p_subject_key
     AND a.state IN ('accepted', 'constrained', 'suspended', 'lapsed') ORDER BY (a.kind = 'capability') DESC, a.accepted_at DESC LIMIT 1;
  SELECT * INTO p FROM governance.acceptance_records a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.subject_key = p_subject_key AND a.state = 'proposed'
   ORDER BY a.proposed_at DESC LIMIT 1;
  v_held := EXISTS (SELECT 1 FROM governance.holds h JOIN governance.acceptance_records x ON x.record_id = h.source_artifact
                     WHERE h.lifted_at IS NULL AND h.reason_kind = 'acceptance_constrained' AND x.tenant_id = p_tenant AND x.subject_key = p_subject_key);
  SELECT jsonb_build_object('enforced', e.enforced, 'prefixes', to_jsonb(e.action_prefixes), 'version', e.version) INTO v_enf FROM governance.acceptance_enforcement e
   WHERE e.capability_key = p_subject_key ORDER BY e.version DESC LIMIT 1;
  IF r.record_id IS NOT NULL THEN
    SELECT jsonb_agg(jsonb_build_object('evidence_id', e.evidence_id, 'kind', e.kind, 'title', e.title, 'captured_at', e.captured_at, 'valid_until', e.valid_until,
                                        'age_days', round(extract(epoch FROM v_now - e.captured_at) / 86400.0, 2), 'current', e.valid_until > v_now AND e.outcome <> 'failed', 'covers', e.covers) ORDER BY e.valid_until)
      INTO v_ev FROM governance.acceptance_evidence e WHERE e.evidence_id IN (SELECT (x ->> 'evidence_id')::uuid FROM jsonb_array_elements(r.evidence) x);
  END IF;
  RETURN jsonb_build_object(
    'subject', p_subject_key, 'tenant', p_tenant, 'domain', p_domain, 'read_at', v_now,
    'state', CASE WHEN r.record_id IS NOT NULL THEN r.state WHEN p.record_id IS NOT NULL THEN 'proposed_only' ELSE 'not_accepted' END,
    'record', CASE WHEN r.record_id IS NULL THEN NULL ELSE jsonb_build_object('record_id', r.record_id, 'version', r.version, 'kind', r.kind, 'digest', r.digest, 'accepted_at', r.accepted_at,
                                                                              'constrained_at', r.constrained_at, 'reasons', r.constrained_reasons, 'claim', r.claim) END,
    'accepted_scope', r.scope_tuple, 'effective_scope', CASE WHEN r.state IN ('suspended', 'lapsed') THEN NULL ELSE coalesce(r.effective_scope, r.scope_tuple) END,
    'removed', r.effective_scope -> 'removed', 'evidence', v_ev,
    'proposal', CASE WHEN p.record_id IS NULL THEN NULL ELSE jsonb_build_object('record_id', p.record_id, 'version', p.version, 'digest', p.digest,
                  'unmet', (SELECT coalesce(jsonb_agg(o), '[]'::jsonb) FROM unnest(p.obligations) o WHERE NOT EXISTS (SELECT 1 FROM governance.acceptance_attestations a WHERE a.record_id = p.record_id AND a.version = p.version AND a.obligation = o AND a.decision = 'attest'))) END,
    'expansion_held', v_held, 'enforcement', v_enf,
    'boundary', 'scope-specific: this answer is for this tenant and domain only; claim = demonstration — real acceptance is R2');
END $$;
REVOKE ALL ON FUNCTION governance.ar_scope(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ar_scope(uuid, uuid, text) TO eye_app, eye_commit;

/* THE ATTESTATION PREVIEW's eligibility (OBJ-40: exact version, eligibility, consequence preview): for each obligation of a version, whether
   THIS principal may attest it and, when not, why — the port's own rules in words (the port decides; this explains). */
CREATE OR REPLACE FUNCTION governance.ar_eligibility(p_record uuid, p_version int, p_principal uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = governance, observation, public, pg_catalog, pg_temp AS $$
DECLARE r governance.acceptance_records%ROWTYPE; o text; v jsonb := '[]'::jsonb; why text[]; v_now timestamptz := clock_timestamp(); v_common text[] := '{}';
BEGIN
  SELECT * INTO r FROM governance.acceptance_records a WHERE a.record_id = p_record AND a.version = p_version;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM observation.assert_read_scope(r.tenant_id, r.domain_id, 'an attestation''s eligibility');
  IF p_principal IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'acceptance attestation rejected (actor): eligibility is read for the caller only' USING ERRCODE = '42501'; END IF;
  IF onboarding.principal_kind(p_principal) IS DISTINCT FROM 'human' THEN v_common := v_common || 'an agent or a system never attests'::text; END IF;
  IF p_principal = r.proposed_by THEN v_common := v_common || 'you proposed this version (no self-acceptance)'::text; END IF;
  IF p_principal = ANY (r.builders) THEN v_common := v_common || 'you are a builder of the subject (independence)'::text; END IF;
  IF r.state <> 'proposed' THEN v_common := v_common || format('version %s is %s', p_version, r.state); END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(r.evidence) x JOIN governance.acceptance_evidence e ON e.evidence_id = (x ->> 'evidence_id')::uuid WHERE e.valid_until <= v_now OR e.outcome = 'failed') THEN
    v_common := v_common || 'an evidence item is no longer current — a new version over renewed evidence is needed'::text;
  END IF;
  IF r.kind = 'release' AND EXISTS (SELECT 1 FROM governance.holds h WHERE h.subject_artifact = r.subject_artifact AND h.lifted_at IS NULL) THEN
    v_common := v_common || format('release candidate %s is held', r.subject_key);
  END IF;
  IF EXISTS (SELECT 1 FROM governance.acceptance_attestations a WHERE a.record_id = p_record AND a.version = p_version AND a.attester = p_principal) THEN
    v_common := v_common || 'you already attested an obligation of this version (one person per obligation)'::text;
  END IF;
  FOREACH o IN ARRAY r.obligations LOOP
    why := v_common;
    IF EXISTS (SELECT 1 FROM governance.acceptance_attestations a WHERE a.record_id = p_record AND a.version = p_version AND a.obligation = o) THEN why := why || 'already attested'::text; END IF;
    IF NOT governance.holds_role(p_principal, r.tenant_id, r.domain_id, governance.ar_obligation_roles(o)) THEN
      why := why || format('the %s obligation is attested by a %s', replace(o, '_', ' '), array_to_string(governance.ar_obligation_roles(o), ' or '));
    END IF;
    IF o = 'customer' AND NOT EXISTS (SELECT 1 FROM governance.acceptance_verifications x WHERE x.record_id = p_record AND x.version = p_version AND x.outcome = 'verified') THEN
      why := why || 'the customer verifies the version before attesting it'::text;
    END IF;
    v := v || jsonb_build_array(jsonb_build_object('obligation', o, 'roles', to_jsonb(governance.ar_obligation_roles(o)), 'can_attest', cardinality(why) = 0, 'reasons', to_jsonb(why),
                                                   'attested', (SELECT jsonb_build_object('by', a.attester, 'name', governance.ar_principal_name(a.attester), 'role', a.attester_role, 'decision', a.decision, 'at', a.attested_at)
                                                                  FROM governance.acceptance_attestations a WHERE a.record_id = p_record AND a.version = p_version AND a.obligation = o)));
  END LOOP;
  RETURN jsonb_build_object('record_id', p_record, 'version', p_version, 'digest', r.digest, 'obligations', v,
                            'can_verify', governance.holds_role(p_principal, r.tenant_id, r.domain_id, ARRAY['customer_sponsor', 'onboarding_authority']) AND cardinality(v_common) = 0
                                          AND NOT EXISTS (SELECT 1 FROM governance.acceptance_verifications x WHERE x.record_id = p_record AND x.version = p_version));
END $$;
REVOKE ALL ON FUNCTION governance.ar_eligibility(uuid, int, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.ar_eligibility(uuid, int, uuid) TO eye_app, eye_commit;
