-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0115 §DG — CP-6 B107, part `dg`: DESIGN GOVERNANCE (F-P7-E-17; V9 UX-01/02/03/08/72, UX-ADR-001/002/023/024, REL-01/02/23/24) — the design
-- baseline under the Design System Authority; the principle / prohibition registry and its evaluations (the lint); narrow, expiring design
-- exceptions; the CONTRIBUTION queue over component / pattern versions (propose → review → accept → publish → adopt → measure; deprecate →
-- migrate → retire; amend; reject; close); design asset ownership (one accountable owner, approved status); the design trace over the shared
-- links; DESIGN ACCEPTANCE records (DOMAIN, on §AR's model — kept in this part's own table keyed to the same tuple until the fold); EXPERIENCE
-- LEARNING (a B92 experience action of kind design_change_proposal opens a contribution — telemetry never modifies a pattern); B92's telemetry
-- governance bound as evidence (REL-23); the INDEPENDENT CONFORMANCE PACKAGE for UX-70-006 / UX-66-006, generated and left UNSIGNED (R2).
-- Applies alone on top of 0001–0114 + the prelude (0115 §0). Re-declares NOTHING of an earlier migration.
--
-- THREE CLAIMS, never mixed: CONSTRUCTION (this migration, its ports and phase6-design-b107); DEMONSTRATED OPERATION (the act on SYNTHETIC
-- personas — every design acceptance and conformance package carries `claim = 'demonstration'`); REAL ACCEPTANCE (named independent design
-- authorities signing the conformance package, H3 / R2) — never claimed: no row of this part can carry it (the CHECKs admit `demonstration`
-- only, and a conformance package has no signature column at all).
-- MET-034 (accessibility journey pass rate) stays `unsupported` (B108 is its source; H3 its verification): the design acceptance record carries
-- EMPTY accessibility evidence slots naming that carrier — nothing here computes or claims accessibility.
-- The general context bar stays B80's; UX-ADR-019 / REL-20 (deployment parity) are B106 / R1's.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §DG.1 THE TABLES ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* THE DESIGN ASSETS (REL-01; UX-72): one row per VERSION of a component, a pattern or a design asset (the token set). One accountable OWNER
   (a named active human) and an APPROVED status, both the Design System Authority's act; an inventory import registers what the repository
   holds (`proposed`, no owner — an ownership gap, shown). A published contribution writes the next version (the prior one `superseded`,
   still readable — consumers are never stranded silently). */
CREATE TABLE governance.design_assets (
  asset_id         uuid NOT NULL,
  version          int  NOT NULL CHECK (version >= 1),
  scope            text NOT NULL DEFAULT 'PLATFORM' CHECK (scope = 'PLATFORM'),
  tenant_id        uuid CHECK (tenant_id IS NULL),
  domain_id        uuid CHECK (domain_id IS NULL),
  kind             text NOT NULL CHECK (kind IN ('design_component', 'pattern', 'design_asset')),
  asset_key        text NOT NULL CHECK (asset_key ~ '^[a-z][a-z0-9_.-]{2,120}$'),
  title            text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 300),
  source_ref       text NOT NULL CHECK (length(btrim(source_ref)) BETWEEN 3 AND 400),
  package_version  text NOT NULL CHECK (package_version ~ '^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$'),
  source_digest    text CHECK (source_digest IS NULL OR source_digest ~ '^[0-9a-f]{64}$'),
  consumers        jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(consumers) = 'array'),
  owner_principal_id uuid,
  status           text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'deprecated', 'retired', 'superseded')),
  contribution_id  uuid,
  digest           text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  registered_by    uuid NOT NULL,
  registered_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  approved_by      uuid,
  approved_at      timestamptz,
  approval_reason  text,
  superseded_at    timestamptz,
  correlation_id   uuid NOT NULL,
  PRIMARY KEY (asset_id, version),
  CONSTRAINT gda_approved CHECK (status NOT IN ('approved', 'deprecated') OR (owner_principal_id IS NOT NULL AND approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  CONSTRAINT gda_superseded CHECK ((status = 'superseded') = (superseded_at IS NOT NULL))
);
CREATE UNIQUE INDEX gda_one_current ON governance.design_assets (asset_id) WHERE superseded_at IS NULL;
CREATE UNIQUE INDEX gda_key_current ON governance.design_assets (asset_key) WHERE superseded_at IS NULL;

/* THE PRINCIPLES AND PROHIBITIONS (UX-03; UX-ADR-002): the enforceable interaction rules — statement, prohibited behaviour, affected patterns,
   remediation, the lint rule that checks it (if one does). UNWAIVABLE principles (human authority, truth-state separation, provenance,
   accessibility — UX-03-004: no commercial, administrative, model or delivery role may waive them) admit no exception and are never retired.
   Versioned by key; a change is the Design System Authority's (human-gated). Seeded below from V9 (normative, `declared_by` the zero id). */
CREATE TABLE governance.design_principles (
  principle_id     uuid NOT NULL,
  version          int  NOT NULL CHECK (version >= 1),
  scope            text NOT NULL DEFAULT 'PLATFORM' CHECK (scope = 'PLATFORM'),
  tenant_id        uuid CHECK (tenant_id IS NULL),
  domain_id        uuid CHECK (domain_id IS NULL),
  principle_key    text NOT NULL CHECK (principle_key ~ '^[a-z][a-z0-9_.-]{2,80}$'),
  kind             text NOT NULL CHECK (kind IN ('principle', 'prohibition')),
  statement        text NOT NULL CHECK (length(btrim(statement)) BETWEEN 8 AND 2000),
  prohibited       text,
  affected_patterns text[] NOT NULL DEFAULT '{}',
  remediation      text NOT NULL CHECK (length(btrim(remediation)) >= 8),
  lint_rule        text CHECK (lint_rule IS NULL OR lint_rule IN ('raw-colour', 'optimistic-path', 'surface-definition')),
  unwaivable       boolean NOT NULL DEFAULT false,
  source           text NOT NULL,
  state            text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'retired', 'superseded')),
  digest           text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  declared_by      uuid NOT NULL,
  declared_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  reason           text NOT NULL,
  correlation_id   uuid NOT NULL,
  PRIMARY KEY (principle_id, version),
  CONSTRAINT gdp_unwaivable_live CHECK (NOT (unwaivable AND state = 'retired'))
);
CREATE UNIQUE INDEX gdp_key_current ON governance.design_principles (principle_key) WHERE state <> 'superseded';

/* THE EVALUATIONS (UX-03-003): a design evaluated against the explicit principles — the LINT over the web source (a pure function: raw
   colours, optimistic paths, a surface defining the product as chat / dashboard / BI / copilot / report) or a named reviewer's review of an
   asset version. Each finding names its principle; a finding covered by an approved, unexpired, NARROW design exception (that principle ×
   that asset) reads `excepted`, every other one makes the verdict `nonconformant`. Append-only evidence. */
CREATE TABLE governance.design_evaluations (
  evaluation_id    uuid PRIMARY KEY,
  scope            text NOT NULL DEFAULT 'PLATFORM' CHECK (scope = 'PLATFORM'),
  tenant_id        uuid CHECK (tenant_id IS NULL),
  domain_id        uuid CHECK (domain_id IS NULL),
  source           text NOT NULL CHECK (source IN ('lint', 'review')),
  target_asset_id  uuid,
  target_version   int,
  input_digest     text NOT NULL CHECK (input_digest ~ '^[0-9a-f]{64}$'),
  rules_version    text NOT NULL,
  findings         jsonb NOT NULL CHECK (jsonb_typeof(findings) = 'array'),
  verdict          text NOT NULL CHECK (verdict IN ('conformant', 'nonconformant')),
  counts           jsonb NOT NULL DEFAULT '{}'::jsonb,
  digest           text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  evaluated_by     uuid NOT NULL,
  evaluated_by_kind text NOT NULL,
  evaluated_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id   uuid NOT NULL,
  CONSTRAINT gde_target CHECK ((target_asset_id IS NULL) = (target_version IS NULL)),
  CONSTRAINT gde_review_target CHECK (source = 'lint' OR target_asset_id IS NOT NULL)
);
CREATE INDEX gde_target_idx ON governance.design_evaluations (target_asset_id, evaluated_at DESC);

/* THE DESIGN EXCEPTIONS (UX-03-003/-006): NARROW (one principle × one asset), EXPIRING (≤ 90 days), approved by the Design System Authority —
   never the requester, never the asset's OWNER whose authority it expands (ES-02-004), never for an unwaivable principle; a renewal names the
   exception it renews and may not broaden it (the same principle and asset). An expired exception covers nothing: the evaluation turns
   nonconformant again and an acceptance that relied on it is withheld. Registered as `exception` artifacts (§PG's registry reads them by kind;
   the integrator may fold them into THE ONE exception registry). */
CREATE TABLE governance.design_exceptions (
  exception_id     uuid PRIMARY KEY,
  scope            text NOT NULL DEFAULT 'PLATFORM' CHECK (scope = 'PLATFORM'),
  tenant_id        uuid CHECK (tenant_id IS NULL),
  domain_id        uuid CHECK (domain_id IS NULL),
  principle_key    text NOT NULL,
  asset_id         uuid NOT NULL,
  asset_version    int  NOT NULL,
  reason           text NOT NULL CHECK (length(btrim(reason)) >= 12),
  compensating     text NOT NULL CHECK (length(btrim(compensating)) >= 8),
  expires_at       timestamptz NOT NULL,
  renews           uuid REFERENCES governance.design_exceptions (exception_id),
  state            text NOT NULL DEFAULT 'requested' CHECK (state IN ('requested', 'approved', 'rejected', 'withdrawn')),
  digest           text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  requested_by     uuid NOT NULL,
  requested_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_by       uuid,
  decided_at       timestamptz,
  decision_reason  text,
  signature_id     uuid,
  correlation_id   uuid NOT NULL,
  CONSTRAINT gdx_window CHECK (expires_at > requested_at AND expires_at <= requested_at + interval '90 days'),
  CONSTRAINT gdx_decided CHECK ((state IN ('requested', 'withdrawn')) = (decided_by IS NULL)),
  CONSTRAINT gdx_sod CHECK (decided_by IS NULL OR decided_by <> requested_by),
  CONSTRAINT gdx_signed CHECK (state <> 'approved' OR signature_id IS NOT NULL)
);

/* THE CONTRIBUTIONS (UX-72; UX-ADR-024): the design-system queue over component / pattern versions. Stages: proposed → (review) in_review |
   held → accepted (the Design System Authority's SIGNED act; a constitutional AMENDMENT is ratified by the product authority instead —
   UX-72-004) → published (the asset's next version) → adopted → measured → closed; a DEPRECATION publishes as `deprecated` → migrating
   (consumers moved) → retired (only when no consumer is stranded); rejected / closed end it; AMEND (the proposer or a contributor — recorded
   as a builder, who then never accepts it) returns it to proposed at the next revision. An experience-learning proposal (origin
   `experience_learning`) is opened from a B92 action and changes nothing until a human accepts and publishes it. */
CREATE TABLE governance.design_contributions (
  contribution_id  uuid PRIMARY KEY,
  scope            text NOT NULL DEFAULT 'PLATFORM' CHECK (scope = 'PLATFORM'),
  tenant_id        uuid CHECK (tenant_id IS NULL),
  domain_id        uuid CHECK (domain_id IS NULL),
  revision         int  NOT NULL DEFAULT 1 CHECK (revision >= 1),
  kind             text NOT NULL CHECK (kind IN ('new_component', 'component_change', 'new_pattern', 'pattern_change', 'deprecation', 'retirement', 'amendment')),
  target_asset_id  uuid,
  target_version   int,
  proposal         jsonb NOT NULL CHECK (jsonb_typeof(proposal) = 'object'),
  summary          text NOT NULL CHECK (length(btrim(summary)) BETWEEN 12 AND 4000),
  plans            jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(plans) = 'object'),
  constitutional   boolean NOT NULL DEFAULT false,
  origin           text NOT NULL DEFAULT 'contributor' CHECK (origin IN ('contributor', 'experience_learning')),
  intake_id        uuid,
  stage            text NOT NULL DEFAULT 'proposed' CHECK (stage IN ('proposed', 'in_review', 'held', 'accepted', 'rejected', 'published', 'adopted', 'measured',
                                                                     'deprecated', 'migrating', 'retired', 'closed')),
  hold_reasons     jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(hold_reasons) = 'array'),
  review           jsonb,
  evidence         jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence) = 'array'),
  digest           text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  proposed_by      uuid NOT NULL,
  proposed_by_kind text NOT NULL CHECK (proposed_by_kind IN ('human', 'agent', 'system')),
  proposed_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  builders         uuid[] NOT NULL DEFAULT '{}',
  reviewed_by      uuid,
  accepted_by      uuid,
  accepted_at      timestamptz,
  signature_id     uuid,
  published_version int,
  closed_reason    text,
  updated_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id   uuid NOT NULL,
  CONSTRAINT gdc_target CHECK ((target_asset_id IS NULL) = (target_version IS NULL)),
  CONSTRAINT gdc_sod CHECK (accepted_by IS NULL OR (accepted_by <> proposed_by AND NOT (accepted_by = ANY (builders)))),
  CONSTRAINT gdc_signed CHECK (accepted_by IS NULL OR signature_id IS NOT NULL),
  CONSTRAINT gdc_origin CHECK ((origin = 'experience_learning') = (intake_id IS NOT NULL))
);

/* THE DESIGN BASELINE (UX-01; UX-ADR-001): the controlling visual and interaction baseline — the design-system version, the conformance scope,
   its members (asset versions with digests), the principles and the approved exceptions in force — registered (proposed), compared, ATTESTED
   (the Design System Authority's SIGNED act; never the proposer), superseded by the next attested version or rejected. It REFINES Volumes 0
   and 3–8 and never alters them: `constitutional_change` is false by construction. An attestation whose members cannot resolve to an
   approved owner is HELD (governance.holds `ownership_gap`), the proposal preserved. */
CREATE TABLE governance.design_baselines (
  baseline_id      uuid NOT NULL,
  version          int  NOT NULL CHECK (version >= 1),
  scope            text NOT NULL DEFAULT 'PLATFORM' CHECK (scope = 'PLATFORM'),
  tenant_id        uuid CHECK (tenant_id IS NULL),
  domain_id        uuid CHECK (domain_id IS NULL),
  title            text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 300),
  design_system_version text NOT NULL CHECK (length(btrim(design_system_version)) BETWEEN 3 AND 120),
  controlling_volume text NOT NULL DEFAULT 'V9' CHECK (controlling_volume = 'V9'),
  refines          text[] NOT NULL DEFAULT ARRAY['V0', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8'],
  constitutional_change boolean NOT NULL DEFAULT false CHECK (NOT constitutional_change),
  conformance_scope jsonb NOT NULL CHECK (jsonb_typeof(conformance_scope) = 'object'),
  members          jsonb NOT NULL CHECK (jsonb_typeof(members) = 'array'),
  principles       jsonb NOT NULL CHECK (jsonb_typeof(principles) = 'array'),
  exceptions       jsonb NOT NULL CHECK (jsonb_typeof(exceptions) = 'array'),
  state            text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'attested', 'rejected', 'superseded')),
  digest           text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  proposed_by      uuid NOT NULL,
  proposed_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_by       uuid,
  decided_at       timestamptz,
  decision_reason  text,
  signature_id     uuid,
  correlation_id   uuid NOT NULL,
  PRIMARY KEY (baseline_id, version),
  CONSTRAINT gdb_decided CHECK ((state = 'proposed') = (decided_by IS NULL) OR state = 'superseded'),
  CONSTRAINT gdb_sod CHECK (decided_by IS NULL OR decided_by <> proposed_by),
  CONSTRAINT gdb_signed CHECK (state <> 'attested' OR signature_id IS NOT NULL)
);
CREATE UNIQUE INDEX gdb_one_proposed ON governance.design_baselines (baseline_id) WHERE state = 'proposed';
CREATE UNIQUE INDEX gdb_one_attested ON governance.design_baselines (baseline_id) WHERE state = 'attested';

/* THE EXPERIENCE-LEARNING INTAKES (UX-ADR-024; DOMAIN): a B92 experience action of kind `design_change_proposal` (decided by the domain's named
   product analytics owner) taken into design governance — one intake per action; it OPENS a contribution proposal and changes nothing else. */
CREATE TABLE governance.design_experience_intakes (
  intake_id        uuid PRIMARY KEY,
  scope            text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  action_id        uuid NOT NULL UNIQUE,
  finding_id       uuid NOT NULL,
  journey_key      text,
  statement        text NOT NULL,
  preview_digest   text NOT NULL,
  decided_by       uuid NOT NULL,
  decided_at       timestamptz NOT NULL,
  contribution_id  uuid NOT NULL,
  intaken_by       uuid NOT NULL,
  intaken_by_kind  text NOT NULL,
  intaken_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id   uuid NOT NULL
);

/* THE DESIGN ACCEPTANCE RECORDS (UX-ADR-023, REL-24; DOMAIN — the tenant / domain is part of the accepted tuple): §AR's acceptance-record model
   for kind `design`, kept here in this part's own table keyed to the same tuple (§AR's governance.acceptance_records is not on this branch —
   the integrator folds). The exact design tuple (the attested baseline version and digest, the component and pattern versions, capability,
   canonical journey, persona and role, deployment profile, entitlement, theme, locale, device, assistive technology, configuration digest,
   data versions, period), evidence items with captured_at / valid_until (their ages), findings, conditions, the EMPTY accessibility slots
   (MET-034 unsupported — B108 → H3), the REQUIRED OBLIGATIONS each attested by a DISTINCT named human (design → the Design System Authority,
   assurance → independent assurance, customer → the customer sponsor) and SIGNED (executive.signatures `design_acceptance`); `accepted` only
   when every obligation is signed; `withheld` when evidence expires or a bound version is superseded (the record keeps what was accepted —
   the prior accepted baseline is preserved, nothing re-accepts itself). */
CREATE TABLE governance.design_acceptances (
  acceptance_id    uuid NOT NULL,
  version          int  NOT NULL CHECK (version >= 1),
  scope            text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  kind             text NOT NULL DEFAULT 'design' CHECK (kind = 'design'),
  baseline_id      uuid NOT NULL,
  baseline_version int  NOT NULL,
  baseline_digest  text NOT NULL,
  components       jsonb NOT NULL CHECK (jsonb_typeof(components) = 'array'),
  tuple            jsonb NOT NULL CHECK (jsonb_typeof(tuple) = 'object'),
  evidence         jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'array' AND jsonb_array_length(evidence) >= 1),
  findings         jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(findings) = 'array'),
  conditions       jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(conditions) = 'array'),
  accessibility    jsonb NOT NULL,
  obligations      text[] NOT NULL CHECK (obligations <@ ARRAY['design', 'assurance', 'customer'] AND obligations @> ARRAY['design', 'assurance']),
  attestations     jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(attestations) = 'array'),
  builders         uuid[] NOT NULL DEFAULT '{}',
  valid_until      timestamptz NOT NULL,
  state            text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'accepted', 'withheld', 'rejected', 'superseded')),
  withheld_reason  text,
  withheld_at      timestamptz,
  claim            text NOT NULL DEFAULT 'demonstration' CHECK (claim = 'demonstration'),
  digest           text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  proposed_by      uuid NOT NULL,
  proposed_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  accepted_at      timestamptz,
  correlation_id   uuid NOT NULL,
  PRIMARY KEY (acceptance_id, version),
  CONSTRAINT gdac_withheld CHECK (state <> 'withheld' OR (withheld_at IS NOT NULL AND length(btrim(coalesce(withheld_reason, ''))) >= 8)),
  CONSTRAINT gdac_accepted CHECK (state NOT IN ('accepted', 'withheld') OR accepted_at IS NOT NULL)
);
CREATE UNIQUE INDEX gdac_one_open ON governance.design_acceptances (acceptance_id) WHERE state = 'proposed';

/* THE INDEPENDENT CONFORMANCE PACKAGES (UX-70-006, UX-66-006; DOMAIN): the exact design tuple + the evidence with its ages (B92's telemetry
   governance and experience records; B94's onboarding, go-live, admission and value records — by reference: kind, id, digest, captured_at)
   + the findings — GENERATED for named independent authorities to review and sign. LEFT UNSIGNED: no signature column; `signed` is false by
   CHECK; the signed acceptance is R2's. Append-only. */
CREATE TABLE governance.design_conformance_packages (
  package_id       uuid PRIMARY KEY,
  scope            text NOT NULL DEFAULT 'DOMAIN' CHECK (scope = 'DOMAIN'),
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  target           text NOT NULL CHECK (target IN ('UX-70-006', 'UX-66-006')),
  acceptance_id    uuid,
  acceptance_version int,
  content          jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  digest           text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  signed           boolean NOT NULL DEFAULT false CHECK (NOT signed),
  signature_required text NOT NULL DEFAULT 'R2: the named independent authorities review and sign this package outside the product; nothing here signs it',
  claim            text NOT NULL DEFAULT 'demonstration' CHECK (claim = 'demonstration'),
  generated_by     uuid NOT NULL,
  generated_by_kind text NOT NULL,
  generated_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id   uuid NOT NULL
);

CREATE TRIGGER gde_append_only BEFORE UPDATE OR DELETE ON governance.design_evaluations FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TRIGGER gdi_append_only BEFORE UPDATE OR DELETE ON governance.design_experience_intakes FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TRIGGER gdk_append_only BEFORE UPDATE OR DELETE ON governance.design_conformance_packages FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
/* Versioned rows are never deleted (a supersession is recorded, a record is never removed). */
CREATE OR REPLACE FUNCTION governance.dg_never_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'design governance rejected (state): % rows are never deleted — a supersession, a retirement or a withdrawal is recorded instead', TG_TABLE_NAME USING ERRCODE = '42501'; END $$;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['design_assets', 'design_principles', 'design_exceptions', 'design_contributions', 'design_baselines', 'design_acceptances'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE DELETE ON governance.%I FOR EACH ROW EXECUTE FUNCTION governance.dg_never_delete()', t || '_never_delete', t);
  END LOOP;
END $$;

-- RLS and grants (the prelude's governance_visibility idiom): PLATFORM rows readable by every authenticated context (the vendor's design
-- system is not tenant data); DOMAIN rows within the tenant / domain; a PLATFORM context reads all. SELECT to eye_app and eye_commit; no write
-- grant — the definer ports write.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['governance.design_assets', 'governance.design_principles', 'governance.design_evaluations', 'governance.design_exceptions',
                           'governance.design_contributions', 'governance.design_baselines', 'governance.design_experience_intakes', 'governance.design_acceptances',
                           'governance.design_conformance_packages'] LOOP
    EXECUTE format('REVOKE ALL ON %s FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$CREATE POLICY governance_visibility ON %s USING (
      (scope = 'PLATFORM' AND public.eye_scope() <> 'NONE')
      OR (scope = 'TENANT' AND tenant_id = public.eye_tenant())
      OR (scope = 'DOMAIN' AND tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()))
      OR public.eye_scope() = 'PLATFORM')$f$, t);
    EXECUTE format('GRANT SELECT ON %s TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- §DG.2 THE SEED: the V9 principles and prohibitions (normative; the zero id declares them — no human approved them here) ─────────────────
INSERT INTO governance.design_principles (principle_id, version, principle_key, kind, statement, prohibited, affected_patterns, remediation, lint_rule, unwaivable, source, digest,
                                          declared_by, reason, correlation_id)
SELECT gen_random_uuid(), 1, s.key, s.kind, s.statement, s.prohibited, s.patterns, s.remediation, s.lint, s.unwaivable, s.source,
       governance.digest(jsonb_build_object('key', s.key, 'version', 1, 'kind', s.kind, 'statement', s.statement, 'prohibited', s.prohibited, 'patterns', to_jsonb(s.patterns),
                                            'remediation', s.remediation, 'lint_rule', s.lint, 'unwaivable', s.unwaivable)),
       '00000000-0000-0000-0000-000000000000'::uuid, 'seeded from Volume 9 by 0115 §DG (normative text; no human approval is claimed)', gen_random_uuid()
  FROM (VALUES
    ('surface-access-mode', 'prohibition', 'Interfaces remain access modes to the operating system (UX-ADR-002).',
       'A surface defining the product as chat, chatbot, copilot, dashboard, BI or report.', ARRAY['page title', 'navigation label', 'workspace heading'],
       'Name the surface by the governed work it serves (observation, decision, governance …), never as a chat, dashboard, BI tool, copilot or report.', 'surface-definition', false, 'V9 UX-ADR-002, UX-03'),
    ('semantic-tokens-only', 'principle', 'Product code consumes semantic design tokens only (UX-ADR-010); a raw colour bypasses the controlled visual baseline.',
       'A raw colour literal (#hex, rgb(), hsl()) in product code.', ARRAY['every component', 'every page'],
       'Replace the literal with the semantic token variable (var(--eye-color-…)) that names its role; a missing role is a design-system contribution.', 'raw-colour', false, 'V9 UX-ADR-010, App A'),
    ('no-optimistic-path', 'prohibition', 'A governed act renders only from the authoritative receipt (UX-ADR-017): there is no optimistic path.',
       'An optimistic update (useOptimistic, an optimistic flag or helper) that shows an act as done before the server''s receipt.', ARRAY['governed action', 'GovernedButton'],
       'Render the result from the receipt; show the pending state as pending.', 'optimistic-path', false, 'V9 UX-ADR-017, UX-03-001'),
    ('no-dark-patterns', 'prohibition', 'No decorative, certainty-inflating or dark-pattern behaviour; engagement is never optimised at the expense of truth, control or comprehension (UX-03-005).',
       'Pre-checked consent, confirm-shaming, hidden costs, false urgency, certainty shown without its uncertainty.', ARRAY['consent', 'approval control', 'forecast display'],
       'Block the non-conformant pattern, preserve the design evidence and remediate through a contribution.', NULL, false, 'V9 UX-03-001, UX-03-005'),
    ('human-authority', 'principle', 'Only a named human approves, accepts, attests or signs; AI and automation recommend, draft and execute pre-authorised reversible steps only (UX-01-004, UX-03-004).',
       'An agent or an automated step shown or recorded as approving, accepting or signing.', ARRAY['approval control', 'acceptance record'],
       'Route the act to the named human authority; show eligibility, separation of duties, the digest and the consequence before the act.', NULL, true, 'V9 UX-03-004'),
    ('truth-state-separation', 'principle', 'Observed, asserted, inferred, assessed and synthetic states stay visually and semantically distinct (UX-03-004).',
       'A synthetic, inferred or assessed value styled or worded as observed.', ARRAY['TruthBadge', 'every value display'],
       'Carry the truth state with the value; never merge them.', NULL, true, 'V9 UX-03-004'),
    ('provenance-visible', 'principle', 'Provenance, freshness and policy stay explicit wherever they change the meaning of what is shown (UX-03-004).',
       'A value shown without the provenance that qualifies it.', ARRAY['every value display'],
       'Show the source, the as-of and the policy beside the value.', NULL, true, 'V9 UX-03-004'),
    ('accessibility', 'principle', 'Accessibility is never waived by a commercial, administrative, model or delivery role (UX-03-004).',
       'An inaccessible control or surface admitted by exception.', ARRAY['every component'],
       'Fix the control; accessibility evidence is B108''s suites (MET-034 stays unsupported until they exist).', NULL, true, 'V9 UX-03-004')
  ) AS s(key, kind, statement, prohibited, patterns, remediation, lint, unwaivable, source);

-- §DG.3 THE INTERNAL HELPERS (definer ports call them; REVOKE PUBLIC, granted to no runtime role) ───────────────────────────────────────────
/* The kind of a principal ('human' | 'agent' | 'system'), active only. */
CREATE OR REPLACE FUNCTION governance.dg_kind(p_principal uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT p.kind FROM identity.principals p WHERE p.id = p_principal AND p.status = 'active'
$$;
REVOKE ALL ON FUNCTION governance.dg_kind(uuid) FROM PUBLIC;

/* REGISTER (or re-version) an artifact of this part in the shared core: the current version is kept when nothing changed (same digest and
   lifecycle — idempotent); otherwise the current one is superseded and the next version written. Returns the current version. */
CREATE OR REPLACE FUNCTION governance.dg_artifact(p_id uuid, p_kind text, p_key text, p_title text, p_tenant uuid, p_domain uuid, p_owner uuid, p_owner_role text,
                                                  p_lifecycle text, p_attrs jsonb, p_digest text, p_actor uuid, p_corr uuid) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE cur governance.artifacts%ROWTYPE; v int;
BEGIN
  SELECT * INTO cur FROM governance.artifacts a WHERE a.artifact_id = p_id AND a.superseded_at IS NULL FOR UPDATE;
  IF FOUND AND cur.digest = p_digest AND cur.lifecycle = p_lifecycle AND cur.owner_principal_id IS NOT DISTINCT FROM p_owner THEN RETURN cur.version; END IF;
  IF FOUND THEN UPDATE governance.artifacts SET superseded_at = clock_timestamp() WHERE artifact_id = p_id AND version = cur.version; END IF;
  v := coalesce(cur.version, 0) + 1;
  INSERT INTO governance.artifacts (artifact_id, version, scope, tenant_id, domain_id, kind, external_key, title, owner_principal_id, owner_role, authority_class, controlling_volume,
                                    lifecycle, attributes, source, digest, recorded_by, correlation_id)
  VALUES (p_id, v, CASE WHEN p_domain IS NOT NULL THEN 'DOMAIN' WHEN p_tenant IS NOT NULL THEN 'TENANT' ELSE 'PLATFORM' END, p_tenant, p_domain, p_kind, p_key, left(p_title, 500),
          p_owner, p_owner_role, 'design_system_authority', 'V9', p_lifecycle, coalesce(p_attrs, '{}'::jsonb), jsonb_build_object('part', 'dg', 'migration', '0115 §DG'),
          p_digest, p_actor, p_corr);
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION governance.dg_artifact(uuid, text, text, text, uuid, uuid, uuid, text, text, jsonb, text, uuid, uuid) FROM PUBLIC;

/* A LINK in the shared core (append-only), unless the same live link already exists. Returns the link id (the existing one when present). */
CREATE OR REPLACE FUNCTION governance.dg_link(p_from uuid, p_to uuid, p_relation text, p_tenant uuid, p_domain uuid, p_attrs jsonb, p_actor uuid, p_corr uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE v uuid;
BEGIN
  SELECT l.link_id INTO v FROM governance.links_live l WHERE l.from_artifact = p_from AND l.to_artifact = p_to AND l.relation = p_relation LIMIT 1;
  IF v IS NOT NULL THEN RETURN v; END IF;
  v := gen_random_uuid();
  INSERT INTO governance.links (link_id, scope, tenant_id, domain_id, from_artifact, to_artifact, relation, attributes, recorded_by, correlation_id)
  VALUES (v, CASE WHEN p_domain IS NOT NULL THEN 'DOMAIN' WHEN p_tenant IS NOT NULL THEN 'TENANT' ELSE 'PLATFORM' END, p_tenant, p_domain, p_from, p_to, p_relation,
          coalesce(p_attrs, '{}'::jsonb) || jsonb_build_object('part', 'dg'), p_actor, p_corr);
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION governance.dg_link(uuid, uuid, text, uuid, uuid, jsonb, uuid, uuid) FROM PUBLIC;

/* Retire a live link (a later row; never an update). */
CREATE OR REPLACE FUNCTION governance.dg_unlink(p_link uuid, p_actor uuid, p_corr uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE l governance.links%ROWTYPE; v uuid := gen_random_uuid();
BEGIN
  SELECT * INTO l FROM governance.links_live x WHERE x.link_id = p_link;
  IF NOT FOUND THEN RETURN NULL; END IF;
  INSERT INTO governance.links (link_id, scope, tenant_id, domain_id, from_artifact, to_artifact, relation, retired, retires_link, attributes, recorded_by, correlation_id)
  VALUES (v, l.scope, l.tenant_id, l.domain_id, l.from_artifact, l.to_artifact, l.relation, true, l.link_id, jsonb_build_object('part', 'dg'), p_actor, p_corr);
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION governance.dg_unlink(uuid, uuid, uuid) FROM PUBLIC;

/* Open a HOLD on a subject artifact (unless one of that reason is already open); lift every open hold of a subject. */
CREATE OR REPLACE FUNCTION governance.dg_hold(p_subject uuid, p_reason_kind text, p_reason text, p_tenant uuid, p_domain uuid, p_actor uuid, p_corr uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE v uuid;
BEGIN
  SELECT h.hold_id INTO v FROM governance.holds h WHERE h.subject_artifact = p_subject AND h.reason_kind = p_reason_kind AND h.lifted_at IS NULL LIMIT 1;
  IF v IS NOT NULL THEN RETURN v; END IF;
  v := gen_random_uuid();
  INSERT INTO governance.holds (hold_id, scope, tenant_id, domain_id, subject_artifact, reason_kind, reason, opened_by, correlation_id)
  VALUES (v, CASE WHEN p_domain IS NOT NULL THEN 'DOMAIN' WHEN p_tenant IS NOT NULL THEN 'TENANT' ELSE 'PLATFORM' END, p_tenant, p_domain, p_subject, p_reason_kind, left(p_reason, 2000), p_actor, p_corr);
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION governance.dg_hold(uuid, text, text, uuid, uuid, uuid, uuid) FROM PUBLIC;
CREATE OR REPLACE FUNCTION governance.dg_lift(p_subject uuid, p_reason text, p_actor uuid) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE n int;
BEGIN
  UPDATE governance.holds SET lifted_at = clock_timestamp(), lifted_by = p_actor, lift_reason = left(p_reason, 2000) WHERE subject_artifact = p_subject AND lifted_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION governance.dg_lift(uuid, text, uuid) FROM PUBLIC;

/* The approved, unexpired, NARROW exception covering (principle, asset) on the asset's CURRENT version — or NULL. */
CREATE OR REPLACE FUNCTION governance.dg_exception_covering(p_principle text, p_asset uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
  SELECT x.exception_id FROM governance.design_exceptions x JOIN governance.design_assets a ON a.asset_id = x.asset_id AND a.version = x.asset_version AND a.superseded_at IS NULL
   WHERE x.principle_key = p_principle AND x.asset_id = p_asset AND x.state = 'approved' AND x.expires_at > clock_timestamp()
   ORDER BY x.expires_at DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION governance.dg_exception_covering(text, uuid) FROM PUBLIC;

/* The digest of an asset version's content. */
CREATE OR REPLACE FUNCTION governance.dg_asset_digest(a governance.design_assets) RETURNS text
LANGUAGE sql STABLE SET search_path = governance, pg_catalog, pg_temp AS $$
  SELECT governance.digest(jsonb_build_object('asset_id', a.asset_id, 'version', a.version, 'kind', a.kind, 'key', a.asset_key, 'title', a.title, 'source_ref', a.source_ref,
                                              'package_version', a.package_version, 'source_digest', a.source_digest, 'consumers', a.consumers, 'owner', a.owner_principal_id,
                                              'status', a.status, 'contribution_id', a.contribution_id))
$$;
REVOKE ALL ON FUNCTION governance.dg_asset_digest(governance.design_assets) FROM PUBLIC;

/* The PLATFORM signature (governance.signatures) a decision names: the decider's, over this version's digest, under this action. */
CREATE OR REPLACE FUNCTION governance.dg_signature_ok(p_signature uuid, p_kind text, p_subject uuid, p_version int, p_digest text, p_signer uuid, p_action text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
  SELECT p_signature IS NOT NULL AND EXISTS (SELECT 1 FROM governance.signatures s WHERE s.signature_id = p_signature AND s.subject_kind = p_kind AND s.subject_id = p_subject
                                               AND s.subject_version = p_version AND s.subject_digest = p_digest AND s.signer = p_signer AND s.bound_action = p_action)
$$;
REVOKE ALL ON FUNCTION governance.dg_signature_ok(uuid, text, uuid, int, text, uuid, text) FROM PUBLIC;

-- §DG.4 THE PLATFORM SIGNATURE PORT (the B36 key-reference path; §PG's shared TS helper is copied inside this part until the fold) ────────
/* RECORD a named human's Ed25519 signature over a design-governance subject's digest (a baseline attestation, a contribution's acceptance, an
   exception approval), under the CALLER's bound action — the deciding port then verifies it names the decider, the version and the digest. */
CREATE OR REPLACE FUNCTION governance.dg_record_signature(p_signature uuid, p_action text, p_kind text, p_subject uuid, p_version int, p_digest text, p_role text,
                                                          p_key_id text, p_signature_b64 text, p_actor uuid, p_corr uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_noun text := CASE p_kind WHEN 'baseline_decision' THEN 'design baseline' WHEN 'design_contribution' THEN 'design contribution' ELSE 'design principle' END;
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('governance.design.baseline.decide', 'governance.design.contribution.accept', 'governance.design.exception.decide') THEN
    RAISE EXCEPTION 'design baseline rejected (authority): % is not a design-governance signing act', coalesce(p_action, '<none>') USING ERRCODE = '42501';
  END IF;
  PERFORM governance.assert_platform(p_action, p_actor, v_noun);
  IF p_kind NOT IN ('baseline_decision', 'design_contribution', 'exception_approval') THEN
    RAISE EXCEPTION '% rejected (signature): % is not a design-governance signature kind', v_noun, coalesce(p_kind, '<none>') USING ERRCODE = '22023';
  END IF;
  IF p_digest IS NULL OR p_digest !~ '^[0-9a-f]{64}$' OR p_key_id IS NULL OR p_key_id !~ '^ed25519:[0-9a-f]{16}$' OR p_signature_b64 IS NULL OR p_signature_b64 !~ '^[A-Za-z0-9+/]{86}==$' THEN
    RAISE EXCEPTION '% rejected (signature): an Ed25519 signature by key reference over a 64-hex digest', v_noun USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM governance.signatures s WHERE s.subject_kind = p_kind AND s.subject_id = p_subject AND s.subject_version = p_version AND s.signer = p_actor) THEN
    RAISE EXCEPTION '% rejected (duplicate): %/% is already signed by this principal', v_noun, p_subject, p_version USING ERRCODE = '23505';
  END IF;
  INSERT INTO governance.signatures (signature_id, scope, subject_kind, subject_id, subject_version, subject_digest, signer, signer_role, key_id, algorithm, signature, bound_action, correlation_id)
  VALUES (p_signature, 'PLATFORM', p_kind, p_subject, p_version, p_digest, p_actor, coalesce(p_role, 'design_system_authority'), p_key_id, 'ed25519', p_signature_b64, p_action, p_corr);
  RETURN jsonb_build_object('signature_id', p_signature, 'subject_kind', p_kind, 'subject_id', p_subject, 'subject_version', p_version, 'subject_digest', p_digest,
                            'signer', p_actor, 'key_id', p_key_id, 'signed_at', clock_timestamp());
END $$;
REVOKE ALL ON FUNCTION governance.dg_record_signature(uuid, text, text, uuid, int, text, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dg_record_signature(uuid, text, text, uuid, int, text, text, text, text, uuid, uuid) TO eye_commit;

-- §DG.5 THE DESIGN ASSETS: the inventory import and the owner's approval (REL-01) ─────────────────────────────────────────────────────────
/* REGISTER the repository's design assets (the conformance steward or the Design System Authority; fed by the TS inventory reader over
   packages/tokens and apps/web/components — the sources are read, never written). A new key → version 1, `proposed`, NO owner (the gap is
   shown until the authority names one). A known key with the same source digest → unchanged (idempotent). A known key whose source moved →
   reported as DRIFT and NOT changed: an inventory never modifies an asset; the change is a contribution. */
CREATE OR REPLACE FUNCTION governance.dg_register_assets(p_import uuid, p_assets jsonb, p_source jsonb, p_actor uuid, p_corr uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE a jsonb; cur governance.design_assets%ROWTYPE; v_row governance.design_assets%ROWTYPE; v_registered jsonb := '[]'::jsonb; v_drift jsonb := '[]'::jsonb; v_unchanged int := 0;
        v_keys text[] := '{}'; v_key text;
BEGIN
  PERFORM governance.assert_platform('governance.design.asset.register', p_actor, 'design baseline');
  IF jsonb_typeof(p_assets) IS DISTINCT FROM 'array' OR jsonb_array_length(p_assets) NOT BETWEEN 1 AND 400 THEN
    RAISE EXCEPTION 'design baseline rejected (assets): an inventory registers 1–400 assets' USING ERRCODE = '22023';
  END IF;
  FOR a IN SELECT x FROM jsonb_array_elements(p_assets) x LOOP
    v_key := a ->> 'key';
    IF v_key IS NULL OR v_key !~ '^[a-z][a-z0-9_.-]{2,120}$' THEN RAISE EXCEPTION 'design baseline rejected (asset): % is not an asset key', coalesce(v_key, '<none>') USING ERRCODE = '22023'; END IF;
    IF v_key = ANY (v_keys) THEN RAISE EXCEPTION 'design baseline rejected (asset): % is listed twice', v_key USING ERRCODE = '22023'; END IF;
    v_keys := v_keys || v_key;
    IF coalesce(a ->> 'kind', '') NOT IN ('design_component', 'pattern', 'design_asset') THEN
      RAISE EXCEPTION 'design baseline rejected (asset): % is a design_component, a pattern or a design_asset', v_key USING ERRCODE = '22023';
    END IF;
    IF length(btrim(coalesce(a ->> 'title', ''))) < 3 OR length(btrim(coalesce(a ->> 'sourceRef', ''))) < 3 OR coalesce(a ->> 'packageVersion', '') !~ '^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$'
       OR (a ? 'sourceDigest' AND coalesce(a ->> 'sourceDigest', '') !~ '^[0-9a-f]{64}$') OR jsonb_typeof(coalesce(a -> 'consumers', '[]'::jsonb)) <> 'array' THEN
      RAISE EXCEPTION 'design baseline rejected (asset): % states its title, source, package version (semver), source digest (64 hex) and consumers (a list)', v_key USING ERRCODE = '22023';
    END IF;
    SELECT * INTO cur FROM governance.design_assets x WHERE x.asset_key = v_key AND x.superseded_at IS NULL;
    IF NOT FOUND THEN
      v_row := ROW(gen_random_uuid(), 1, 'PLATFORM', NULL, NULL, a ->> 'kind', v_key, btrim(a ->> 'title'), btrim(a ->> 'sourceRef'), a ->> 'packageVersion', a ->> 'sourceDigest',
                   coalesce(a -> 'consumers', '[]'::jsonb), NULL, 'proposed', NULL, repeat('0', 64), p_actor, clock_timestamp(), NULL, NULL, NULL, NULL, p_corr)::governance.design_assets;
      v_row.digest := governance.dg_asset_digest(v_row);
      INSERT INTO governance.design_assets SELECT v_row.*;
      PERFORM governance.dg_artifact(v_row.asset_id, v_row.kind, 'DS:' || v_key, v_row.title, NULL, NULL, NULL, NULL, 'proposed',
                                     jsonb_build_object('source_ref', v_row.source_ref, 'package_version', v_row.package_version, 'asset_version', 1), v_row.digest, p_actor, p_corr);
      v_registered := v_registered || jsonb_build_object('asset_id', v_row.asset_id, 'key', v_key, 'version', 1);
    ELSIF cur.source_digest IS NOT DISTINCT FROM (a ->> 'sourceDigest') AND cur.package_version = (a ->> 'packageVersion') THEN
      v_unchanged := v_unchanged + 1;
    ELSE
      v_drift := v_drift || jsonb_build_object('asset_id', cur.asset_id, 'key', v_key, 'version', cur.version, 'recorded', jsonb_build_object('package_version', cur.package_version, 'source_digest', cur.source_digest),
                                               'observed', jsonb_build_object('package_version', a ->> 'packageVersion', 'source_digest', a ->> 'sourceDigest'),
                                               'note', 'the source moved since this version was recorded — a contribution records the change; the inventory changes nothing');
    END IF;
  END LOOP;
  PERFORM governance.ledger(NULL, NULL, 'design_inventory', p_import, NULL, 'design.inventory_recorded', p_actor,
            jsonb_build_object('registered', jsonb_array_length(v_registered), 'unchanged', v_unchanged, 'drift', v_drift, 'source', coalesce(p_source, '{}'::jsonb)), p_corr);
  RETURN jsonb_build_object('import_id', p_import, 'registered', v_registered, 'unchanged', v_unchanged, 'drift', v_drift);
END $$;
REVOKE ALL ON FUNCTION governance.dg_register_assets(uuid, jsonb, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dg_register_assets(uuid, jsonb, jsonb, uuid, uuid) TO eye_commit;

/* APPROVE an asset version and name its ONE accountable owner (REL-01): the Design System Authority — a named human, never the registrar —
   on the exact digest of a `proposed` current version; the owner a named active human. */
CREATE OR REPLACE FUNCTION governance.dg_approve_asset(p_asset uuid, p_version int, p_owner uuid, p_digest text, p_reason text, p_actor uuid, p_corr uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, onboarding, public, pg_catalog, pg_temp AS $$
DECLARE a governance.design_assets%ROWTYPE;
BEGIN
  PERFORM governance.assert_platform('governance.design.asset.approve', p_actor, 'design baseline');
  SELECT * INTO a FROM governance.design_assets x WHERE x.asset_id = p_asset AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'design baseline rejected (unknown_asset): no design asset %/v%', p_asset, p_version USING ERRCODE = '23503'; END IF;
  PERFORM governance.assert_approver('design baseline', p_actor, NULL, NULL, ARRAY['design_system_authority'], a.registered_by, NULL, 'approving a design asset and naming its owner');
  IF a.superseded_at IS NOT NULL THEN RAISE EXCEPTION 'design baseline rejected (stale): version % of % is superseded', p_version, a.asset_key USING ERRCODE = '23505'; END IF;
  IF a.status <> 'proposed' THEN RAISE EXCEPTION 'design baseline rejected (state): % v% is %', a.asset_key, p_version, a.status USING ERRCODE = '23505'; END IF;
  IF p_digest IS DISTINCT FROM a.digest THEN RAISE EXCEPTION 'design baseline rejected (stale): the approval names a digest other than % v%''s', a.asset_key, p_version USING ERRCODE = '23505'; END IF;
  IF governance.dg_kind(p_owner) IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION 'design baseline rejected (owner): the accountable owner of a design asset is a named active human' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'design baseline rejected (reason): an approval states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  a.status := 'approved'; a.owner_principal_id := p_owner; a.approved_by := p_actor; a.approved_at := clock_timestamp(); a.approval_reason := btrim(p_reason);
  a.digest := governance.dg_asset_digest(a);
  UPDATE governance.design_assets SET status = a.status, owner_principal_id = a.owner_principal_id, approved_by = a.approved_by, approved_at = a.approved_at,
         approval_reason = a.approval_reason, digest = a.digest WHERE asset_id = p_asset AND version = p_version;
  PERFORM governance.dg_artifact(a.asset_id, a.kind, 'DS:' || a.asset_key, a.title, NULL, NULL, p_owner, 'design_system_authority', 'active',
                                 jsonb_build_object('source_ref', a.source_ref, 'package_version', a.package_version, 'asset_version', a.version), a.digest, p_actor, p_corr);
  PERFORM governance.ledger(NULL, NULL, 'design_asset', p_asset, p_version, 'design.asset_approved', p_actor,
            jsonb_build_object('owner', p_owner, 'reason', btrim(p_reason), 'digest', a.digest), p_corr);
  RETURN jsonb_build_object('asset_id', p_asset, 'version', p_version, 'key', a.asset_key, 'status', 'approved', 'owner_principal_id', p_owner, 'digest', a.digest);
END $$;
REVOKE ALL ON FUNCTION governance.dg_approve_asset(uuid, int, uuid, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dg_approve_asset(uuid, int, uuid, text, text, uuid, uuid) TO eye_commit;

-- §DG.6 THE PRINCIPLES, THE EVALUATIONS, THE NARROW EXCEPTIONS (UX-03) ───────────────────────────────────────────────────────────────────────
/* DECLARE a principle or prohibition version (the Design System Authority, a named human; human-gated). An UNWAIVABLE principle stays
   unwaivable and is never retired; a version names the current one it replaces (expected_version). */
CREATE OR REPLACE FUNCTION governance.dg_declare_principle(p_key text, p_expected_version int, p_kind text, p_statement text, p_prohibited text, p_patterns text[], p_remediation text,
                                                          p_lint_rule text, p_unwaivable boolean, p_state text, p_reason text, p_actor uuid, p_corr uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, onboarding, public, pg_catalog, pg_temp AS $$
DECLARE cur governance.design_principles%ROWTYPE; v_id uuid; v_version int; v_digest text; v_state text := coalesce(p_state, 'active');
BEGIN
  PERFORM governance.assert_platform('governance.design.principle.declare', p_actor, 'design principle');
  PERFORM governance.assert_approver('design principle', p_actor, NULL, NULL, ARRAY['design_system_authority'], NULL, NULL, 'declaring a design principle');
  IF p_key IS NULL OR p_key !~ '^[a-z][a-z0-9_.-]{2,80}$' THEN RAISE EXCEPTION 'design principle rejected (key): % is not a principle key', coalesce(p_key, '<none>') USING ERRCODE = '22023'; END IF;
  IF coalesce(p_kind, '') NOT IN ('principle', 'prohibition') OR v_state NOT IN ('active', 'retired') THEN
    RAISE EXCEPTION 'design principle rejected (kind): a principle or a prohibition, active or retired' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_statement, ''))) < 8 OR length(btrim(coalesce(p_remediation, ''))) < 8 OR length(btrim(coalesce(p_reason, ''))) < 8 THEN
    RAISE EXCEPTION 'design principle rejected (statement): a principle states itself, its remediation and the reason for this version (8+ characters each)' USING ERRCODE = '22023';
  END IF;
  IF p_lint_rule IS NOT NULL AND p_lint_rule NOT IN ('raw-colour', 'optimistic-path', 'surface-definition') THEN
    RAISE EXCEPTION 'design principle rejected (lint): % is not a lint rule (raw-colour, optimistic-path, surface-definition)', p_lint_rule USING ERRCODE = '22023';
  END IF;
  SELECT * INTO cur FROM governance.design_principles x WHERE x.principle_key = p_key AND x.state <> 'superseded' FOR UPDATE;
  IF coalesce(p_expected_version, -1) <> coalesce(cur.version, 0) THEN
    RAISE EXCEPTION 'design principle rejected (stale): % is at version %, not %', p_key, coalesce(cur.version, 0), coalesce(p_expected_version::text, '<none>') USING ERRCODE = '23505';
  END IF;
  IF cur.unwaivable AND (NOT coalesce(p_unwaivable, false) OR v_state = 'retired') THEN
    RAISE EXCEPTION 'design principle rejected (boundary): % is unwaivable (human authority, truth-state separation, provenance, accessibility — UX-03-004); it is never relaxed or retired', p_key USING ERRCODE = '22023';
  END IF;
  v_id := coalesce(cur.principle_id, gen_random_uuid()); v_version := coalesce(cur.version, 0) + 1;
  v_digest := governance.digest(jsonb_build_object('key', p_key, 'version', v_version, 'kind', p_kind, 'statement', btrim(p_statement), 'prohibited', p_prohibited,
                                                   'patterns', to_jsonb(coalesce(p_patterns, '{}')), 'remediation', btrim(p_remediation), 'lint_rule', p_lint_rule, 'unwaivable', coalesce(p_unwaivable, false), 'state', v_state));
  IF cur.principle_id IS NOT NULL THEN UPDATE governance.design_principles SET state = 'superseded' WHERE principle_id = cur.principle_id AND version = cur.version; END IF;
  INSERT INTO governance.design_principles (principle_id, version, principle_key, kind, statement, prohibited, affected_patterns, remediation, lint_rule, unwaivable, source, state, digest,
                                            declared_by, reason, correlation_id)
  VALUES (v_id, v_version, p_key, p_kind, btrim(p_statement), p_prohibited, coalesce(p_patterns, '{}'), btrim(p_remediation), p_lint_rule, coalesce(p_unwaivable, false),
          'declared by the Design System Authority', v_state, v_digest, p_actor, btrim(p_reason), p_corr);
  PERFORM governance.dg_artifact(v_id, 'principle', 'DP:' || p_key, left(btrim(p_statement), 300), NULL, NULL, NULL, 'design_system_authority', CASE v_state WHEN 'retired' THEN 'retired' ELSE 'active' END,
                                 jsonb_build_object('kind', p_kind, 'unwaivable', coalesce(p_unwaivable, false), 'lint_rule', p_lint_rule, 'principle_version', v_version), v_digest, p_actor, p_corr);
  PERFORM governance.ledger(NULL, NULL, 'design_principle', v_id, v_version, 'design.principle_declared', p_actor, jsonb_build_object('key', p_key, 'state', v_state, 'reason', btrim(p_reason)), p_corr);
  RETURN jsonb_build_object('principle_id', v_id, 'key', p_key, 'version', v_version, 'state', v_state, 'digest', v_digest);
END $$;
REVOKE ALL ON FUNCTION governance.dg_declare_principle(text, int, text, text, text, text[], text, text, boolean, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dg_declare_principle(text, int, text, text, text, text[], text, text, boolean, text, text, uuid, uuid) TO eye_commit;

/* RECORD an EVALUATION of a design against the principles (UX-03-003): the lint's findings over the web source (the conformance steward or
   the Design System Authority; an agent may run the lint — it judges nothing) or a named reviewer's review of one asset version. Each finding
   names a principle (by key, or by the lint rule it came from) and, when it is about an asset, that asset; a finding covered by a narrow,
   approved, unexpired exception reads `excepted`, every other one `open`; the verdict is `nonconformant` while one is open. */
CREATE OR REPLACE FUNCTION governance.dg_record_evaluation(p_evaluation uuid, p_source text, p_asset uuid, p_asset_version int, p_input_digest text, p_rules_version text, p_findings jsonb,
                                                          p_actor uuid, p_corr uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, onboarding, public, pg_catalog, pg_temp AS $$
DECLARE f jsonb; v_out jsonb := '[]'::jsonb; v_principle text; v_asset uuid; v_exc uuid; v_open int := 0; v_excepted int := 0; v_digest text; v_target governance.design_assets%ROWTYPE;
BEGIN
  PERFORM governance.assert_platform('governance.design.evaluate', p_actor, 'design principle');
  IF coalesce(p_source, '') NOT IN ('lint', 'review') THEN RAISE EXCEPTION 'design principle rejected (source): an evaluation is a lint run or a review' USING ERRCODE = '22023'; END IF;
  IF p_source = 'review' AND (governance.dg_kind(p_actor) IS DISTINCT FROM 'human' OR NOT governance.holds_role(p_actor, NULL, NULL, ARRAY['design_system_authority', 'conformance_steward'])) THEN
    RAISE EXCEPTION 'design principle rejected (actor): a design review is a named human reviewer''s (the Design System Authority or the conformance steward)' USING ERRCODE = '42501';
  END IF;
  IF p_asset IS NOT NULL THEN
    SELECT * INTO v_target FROM governance.design_assets x WHERE x.asset_id = p_asset AND x.version = p_asset_version;
    IF NOT FOUND THEN RAISE EXCEPTION 'design principle rejected (unknown_asset): no design asset %/v%', p_asset, p_asset_version USING ERRCODE = '23503'; END IF;
  ELSIF p_source = 'review' THEN
    RAISE EXCEPTION 'design principle rejected (target): a review names the asset version it evaluates' USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_input_digest, '') !~ '^[0-9a-f]{64}$' OR length(btrim(coalesce(p_rules_version, ''))) < 1 THEN
    RAISE EXCEPTION 'design principle rejected (input): an evaluation names the digest of what it read and its rules version' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_findings) IS DISTINCT FROM 'array' OR jsonb_array_length(p_findings) > 2000 THEN RAISE EXCEPTION 'design principle rejected (findings): a list of at most 2000 findings' USING ERRCODE = '22023'; END IF;
  FOR f IN SELECT x FROM jsonb_array_elements(p_findings) x LOOP
    v_principle := coalesce(f ->> 'principle', (SELECT p.principle_key FROM governance.design_principles p WHERE p.lint_rule = f ->> 'rule' AND p.state = 'active' LIMIT 1));
    IF v_principle IS NULL OR NOT EXISTS (SELECT 1 FROM governance.design_principles p WHERE p.principle_key = v_principle AND p.state = 'active') THEN
      RAISE EXCEPTION 'design principle rejected (unknown_principle): a finding names no active principle (%)', coalesce(f ->> 'principle', f ->> 'rule', '<none>') USING ERRCODE = '23503';
    END IF;
    v_asset := coalesce(nullif(f ->> 'assetId', '')::uuid, (SELECT a.asset_id FROM governance.design_assets a WHERE a.asset_key = f ->> 'assetKey' AND a.superseded_at IS NULL), p_asset);
    v_exc := CASE WHEN v_asset IS NULL THEN NULL ELSE governance.dg_exception_covering(v_principle, v_asset) END;
    IF v_exc IS NULL THEN v_open := v_open + 1; ELSE v_excepted := v_excepted + 1; END IF;
    v_out := v_out || jsonb_build_object('rule', f ->> 'rule', 'principle', v_principle, 'asset_id', v_asset, 'file', f ->> 'file', 'line', f -> 'line', 'excerpt', left(coalesce(f ->> 'excerpt', ''), 240),
                                         'note', left(coalesce(f ->> 'note', ''), 1000), 'status', CASE WHEN v_exc IS NULL THEN 'open' ELSE 'excepted' END, 'exception_id', v_exc);
  END LOOP;
  v_digest := governance.digest(jsonb_build_object('evaluation_id', p_evaluation, 'source', p_source, 'asset', p_asset, 'version', p_asset_version, 'input', p_input_digest, 'rules', p_rules_version, 'findings', v_out));
  INSERT INTO governance.design_evaluations (evaluation_id, source, target_asset_id, target_version, input_digest, rules_version, findings, verdict, counts, digest, evaluated_by, evaluated_by_kind, correlation_id)
  VALUES (p_evaluation, p_source, p_asset, p_asset_version, p_input_digest, p_rules_version, v_out, CASE WHEN v_open = 0 THEN 'conformant' ELSE 'nonconformant' END,
          jsonb_build_object('open', v_open, 'excepted', v_excepted, 'total', v_open + v_excepted), v_digest, p_actor, coalesce(governance.dg_kind(p_actor), 'system'), p_corr);
  PERFORM governance.dg_artifact(p_evaluation, 'evidence', 'DEV:' || p_evaluation, format('Design evaluation (%s) — %s open, %s excepted', p_source, v_open, v_excepted), NULL, NULL, NULL, NULL, 'active',
                                 jsonb_build_object('class', 'design_evaluation', 'verdict', CASE WHEN v_open = 0 THEN 'conformant' ELSE 'nonconformant' END), v_digest, p_actor, p_corr);
  IF p_asset IS NOT NULL THEN PERFORM governance.dg_link(p_evaluation, p_asset, 'evidences', NULL, NULL, jsonb_build_object('asset_version', p_asset_version), p_actor, p_corr); END IF;
  PERFORM governance.ledger(NULL, NULL, 'design_evaluation', p_evaluation, NULL, 'design.evaluated', p_actor,
            jsonb_build_object('source', p_source, 'open', v_open, 'excepted', v_excepted, 'asset', p_asset, 'version', p_asset_version), p_corr);
  RETURN jsonb_build_object('evaluation_id', p_evaluation, 'verdict', CASE WHEN v_open = 0 THEN 'conformant' ELSE 'nonconformant' END, 'open', v_open, 'excepted', v_excepted, 'findings', v_out, 'digest', v_digest);
END $$;
REVOKE ALL ON FUNCTION governance.dg_record_evaluation(uuid, text, uuid, int, text, text, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dg_record_evaluation(uuid, text, uuid, int, text, text, jsonb, uuid, uuid) TO eye_commit;

/* REQUEST a NARROW, EXPIRING design exception (one principle × one asset's current version; ≤ 90 days): never for an UNWAIVABLE principle; a
   renewal names the exception it renews and keeps its principle and asset (non-broadening — UX-03-006). */
CREATE OR REPLACE FUNCTION governance.dg_request_exception(p_exception uuid, p_principle text, p_asset uuid, p_reason text, p_compensating text, p_expires_at timestamptz, p_renews uuid,
                                                          p_actor uuid, p_corr uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE pr governance.design_principles%ROWTYPE; a governance.design_assets%ROWTYPE; r governance.design_exceptions%ROWTYPE; v_digest text;
BEGIN
  PERFORM governance.assert_platform('governance.design.exception.request', p_actor, 'design principle');
  SELECT * INTO pr FROM governance.design_principles x WHERE x.principle_key = p_principle AND x.state = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'design principle rejected (unknown_principle): % is not an active principle', coalesce(p_principle, '<none>') USING ERRCODE = '23503'; END IF;
  IF pr.unwaivable THEN
    RAISE EXCEPTION 'design principle rejected (boundary): % is unwaivable — no commercial, administrative, model or delivery role may waive human authority, truth-state separation, provenance or accessibility (UX-03-004)', p_principle USING ERRCODE = '22023';
  END IF;
  SELECT * INTO a FROM governance.design_assets x WHERE x.asset_id = p_asset AND x.superseded_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'design principle rejected (unknown_asset): % is not a current design asset', p_asset USING ERRCODE = '23503'; END IF;
  IF a.status IN ('retired') THEN RAISE EXCEPTION 'design principle rejected (state): % is retired', a.asset_key USING ERRCODE = '23505'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 12 OR length(btrim(coalesce(p_compensating, ''))) < 8 THEN
    RAISE EXCEPTION 'design principle rejected (reason): an exception states why conformance cannot yet be achieved (12+) and its compensating control (8+)' USING ERRCODE = '22023';
  END IF;
  IF p_expires_at IS NULL OR p_expires_at <= clock_timestamp() OR p_expires_at > clock_timestamp() + interval '90 days' THEN
    RAISE EXCEPTION 'design principle rejected (expiry): a design exception expires in the future and within 90 days' USING ERRCODE = '22023';
  END IF;
  IF p_renews IS NOT NULL THEN
    SELECT * INTO r FROM governance.design_exceptions x WHERE x.exception_id = p_renews;
    IF NOT FOUND OR r.state <> 'approved' THEN RAISE EXCEPTION 'design principle rejected (unknown_exception): % is not an approved design exception to renew', p_renews USING ERRCODE = '23503'; END IF;
    IF r.principle_key <> p_principle OR r.asset_id <> p_asset THEN
      RAISE EXCEPTION 'design principle rejected (broadening): a renewal keeps the principle (%) and the asset of the exception it renews — it never broadens it', r.principle_key USING ERRCODE = '22023';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM governance.design_exceptions x WHERE x.principle_key = p_principle AND x.asset_id = p_asset AND x.state = 'requested') THEN
    RAISE EXCEPTION 'design principle rejected (duplicate): an exception for % on % already awaits its decision', p_principle, a.asset_key USING ERRCODE = '23505';
  END IF;
  v_digest := governance.digest(jsonb_build_object('exception_id', p_exception, 'principle', p_principle, 'principle_digest', pr.digest, 'asset_id', p_asset, 'asset_version', a.version,
                                                   'asset_digest', a.digest, 'reason', btrim(p_reason), 'compensating', btrim(p_compensating), 'expires_at', p_expires_at, 'renews', p_renews));
  INSERT INTO governance.design_exceptions (exception_id, principle_key, asset_id, asset_version, reason, compensating, expires_at, renews, digest, requested_by, correlation_id)
  VALUES (p_exception, p_principle, p_asset, a.version, btrim(p_reason), btrim(p_compensating), p_expires_at, p_renews, v_digest, p_actor, p_corr);
  PERFORM governance.dg_artifact(p_exception, 'exception', 'DX:' || p_exception, format('Design exception: %s on %s v%s', p_principle, a.asset_key, a.version), NULL, NULL, NULL, 'design_system_authority', 'proposed',
                                 jsonb_build_object('class', 'design', 'principle', p_principle, 'expires_at', p_expires_at, 'renews', p_renews), v_digest, p_actor, p_corr);
  PERFORM governance.dg_link(p_exception, p_asset, 'excepts', NULL, NULL, jsonb_build_object('principle', p_principle, 'asset_version', a.version), p_actor, p_corr);
  PERFORM governance.ledger(NULL, NULL, 'design_exception', p_exception, NULL, 'design.exception_requested', p_actor,
            jsonb_build_object('principle', p_principle, 'asset', p_asset, 'version', a.version, 'expires_at', p_expires_at, 'renews', p_renews), p_corr);
  RETURN jsonb_build_object('exception_id', p_exception, 'state', 'requested', 'principle', p_principle, 'asset_id', p_asset, 'asset_version', a.version, 'expires_at', p_expires_at, 'digest', v_digest);
END $$;
REVOKE ALL ON FUNCTION governance.dg_request_exception(uuid, text, uuid, text, text, timestamptz, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dg_request_exception(uuid, text, uuid, text, text, timestamptz, uuid, uuid, uuid) TO eye_commit;

/* DECIDE a design exception (the Design System Authority; human-gated; SIGNED on approval): never the requester; never the asset's OWNER,
   whose authority the exception expands (ES-02-004); an exception that expired before its decision is refused (`expired`). */
CREATE OR REPLACE FUNCTION governance.dg_decide_exception(p_exception uuid, p_decision text, p_digest text, p_reason text, p_signature uuid, p_actor uuid, p_corr uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, onboarding, public, pg_catalog, pg_temp AS $$
DECLARE x governance.design_exceptions%ROWTYPE; v_owner uuid;
BEGIN
  PERFORM governance.assert_platform('governance.design.exception.decide', p_actor, 'design principle');
  SELECT * INTO x FROM governance.design_exceptions e WHERE e.exception_id = p_exception FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'design principle rejected (unknown_exception): no design exception %', p_exception USING ERRCODE = '23503'; END IF;
  SELECT a.owner_principal_id INTO v_owner FROM governance.design_assets a WHERE a.asset_id = x.asset_id AND a.version = x.asset_version;
  IF v_owner IS NOT NULL AND p_actor = v_owner THEN
    RAISE EXCEPTION 'design principle rejected (separation_of_duties): the owner of the asset never decides an exception that expands their own authority (ES-02-004)' USING ERRCODE = '42501';
  END IF;
  PERFORM governance.assert_approver('design principle', p_actor, NULL, NULL, ARRAY['design_system_authority'], x.requested_by, CASE WHEN v_owner IS NULL THEN NULL ELSE ARRAY[v_owner] END, 'deciding a design exception');
  IF x.state <> 'requested' THEN RAISE EXCEPTION 'design principle rejected (state): the exception is %', x.state USING ERRCODE = '23505'; END IF;
  IF p_digest IS DISTINCT FROM x.digest THEN RAISE EXCEPTION 'design principle rejected (stale): the decision names a digest other than the exception''s' USING ERRCODE = '23505'; END IF;
  IF p_decision NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'design principle rejected (decision): approve or reject' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'design principle rejected (reason): a decision states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_decision = 'approve' THEN
    IF x.expires_at <= clock_timestamp() THEN RAISE EXCEPTION 'design principle rejected (expired): the exception''s window ended at % — request a new one', x.expires_at USING ERRCODE = '23505'; END IF;
    IF NOT EXISTS (SELECT 1 FROM governance.design_assets a WHERE a.asset_id = x.asset_id AND a.version = x.asset_version AND a.superseded_at IS NULL) THEN
      RAISE EXCEPTION 'design principle rejected (stale): the asset moved past version % — an exception is narrow to the version it names', x.asset_version USING ERRCODE = '23505';
    END IF;
    IF NOT governance.dg_signature_ok(p_signature, 'exception_approval', p_exception, 1, x.digest, p_actor, 'governance.design.exception.decide') THEN
      RAISE EXCEPTION 'design principle rejected (signature): an approval carries the decider''s signature over the exception''s digest' USING ERRCODE = '22023';
    END IF;
  END IF;
  UPDATE governance.design_exceptions SET state = CASE p_decision WHEN 'approve' THEN 'approved' ELSE 'rejected' END, decided_by = p_actor, decided_at = clock_timestamp(),
         decision_reason = btrim(p_reason), signature_id = CASE p_decision WHEN 'approve' THEN p_signature END WHERE exception_id = p_exception;
  PERFORM governance.dg_artifact(p_exception, 'exception', 'DX:' || p_exception, format('Design exception: %s', x.principle_key), NULL, NULL, NULL, 'design_system_authority',
                                 CASE p_decision WHEN 'approve' THEN 'active' ELSE 'retired' END,
                                 jsonb_build_object('class', 'design', 'principle', x.principle_key, 'expires_at', x.expires_at, 'renews', x.renews), x.digest, p_actor, p_corr);
  PERFORM governance.ledger(NULL, NULL, 'design_exception', p_exception, NULL, 'design.exception_' || CASE p_decision WHEN 'approve' THEN 'approved' ELSE 'rejected' END, p_actor,
            jsonb_build_object('reason', btrim(p_reason), 'signature_id', p_signature, 'expires_at', x.expires_at), p_corr);
  RETURN jsonb_build_object('exception_id', p_exception, 'state', CASE p_decision WHEN 'approve' THEN 'approved' ELSE 'rejected' END, 'expires_at', x.expires_at, 'signature_id', p_signature);
END $$;
REVOKE ALL ON FUNCTION governance.dg_decide_exception(uuid, text, text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dg_decide_exception(uuid, text, text, text, uuid, uuid, uuid) TO eye_commit;

-- §DG.7 THE CONTRIBUTION QUEUE (UX-72; UX-ADR-024) ──────────────────────────────────────────────────────────────────────────────────────────
/* What HOLDS a contribution (UX-72-005: ownership missing, evidence incomplete, a non-conformant design, a deprecation or retirement that would
   strand consumers, a target that moved on) — each reason in words with the hold class it opens. Computed, never stored as truth. */
CREATE OR REPLACE FUNCTION governance.dg_contribution_blockers(c governance.design_contributions) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE t governance.design_assets%ROWTYPE; v jsonb := '[]'::jsonb; v_owner uuid; k text; e governance.design_evaluations%ROWTYPE; v_map jsonb; v_missing jsonb; v_tests jsonb;
BEGIN
  IF c.target_asset_id IS NOT NULL THEN
    SELECT * INTO t FROM governance.design_assets a WHERE a.asset_id = c.target_asset_id AND a.superseded_at IS NULL;
    IF t.version IS DISTINCT FROM c.target_version THEN
      v := v || jsonb_build_object('class', 'evidence_missing', 'reason', format('the target moved on (v%s is current, the proposal names v%s) — amend it against the current version', t.version, c.target_version));
    END IF;
    IF t.status = 'retired' THEN v := v || jsonb_build_object('class', 'evidence_missing', 'reason', 'the target is retired'); END IF;
  ELSIF c.kind NOT IN ('new_component', 'new_pattern', 'amendment') THEN
    v := v || jsonb_build_object('class', 'evidence_missing', 'reason', 'the proposal names no target asset — a contributor amends it to name the component or pattern it changes');
  END IF;
  IF c.kind IN ('new_component', 'new_pattern', 'component_change', 'pattern_change') THEN
    v_owner := coalesce(nullif(c.proposal ->> 'ownerPrincipalId', '')::uuid, t.owner_principal_id);
    IF v_owner IS NULL OR governance.dg_kind(v_owner) IS DISTINCT FROM 'human' THEN
      v := v || jsonb_build_object('class', 'ownership_gap', 'reason', 'ownership is missing — the resulting version names one accountable owner, a named active human (REL-01)');
    END IF;
  END IF;
  IF c.kind IN ('new_component', 'new_pattern', 'component_change', 'pattern_change', 'amendment') THEN
    FOREACH k IN ARRAY CASE WHEN c.kind IN ('new_component', 'new_pattern') THEN ARRAY['rollback'] ELSE ARRAY['compatibility', 'consumers', 'migration', 'rollback'] END LOOP
      IF length(btrim(coalesce(c.plans ->> k, ''))) < 8 THEN v := v || jsonb_build_object('class', 'evidence_missing', 'reason', format('the %s plan is missing (8+ characters)', k)); END IF;
    END LOOP;
    v_tests := c.plans -> 'tests';
    IF jsonb_typeof(v_tests) IS DISTINCT FROM 'array' OR jsonb_array_length(v_tests) = 0 THEN
      v := v || jsonb_build_object('class', 'evidence_missing', 'reason', 'the contribution names the tests that verify it (plans.tests)');
    END IF;
    IF nullif(c.plans ->> 'evaluationId', '') IS NULL THEN
      v := v || jsonb_build_object('class', 'evidence_missing', 'reason', 'the proposed design has no evaluation against the principles (UX-03-003) — run the lint or record a review and name it');
    ELSE
      SELECT * INTO e FROM governance.design_evaluations x WHERE x.evaluation_id = (c.plans ->> 'evaluationId')::uuid;
      IF NOT FOUND THEN v := v || jsonb_build_object('class', 'evidence_missing', 'reason', 'the named evaluation does not exist');
      ELSIF e.verdict <> 'conformant' THEN
        v := v || jsonb_build_object('class', 'evidence_missing', 'reason', format('the design evaluation is nonconformant (%s open finding(s): %s) — the non-conformant pattern is blocked until remediated or narrowly excepted (UX-03-005)',
                                     e.counts ->> 'open', (SELECT string_agg(DISTINCT f ->> 'principle', ', ') FROM jsonb_array_elements(e.findings) f WHERE f ->> 'status' = 'open')));
      END IF;
    END IF;
  END IF;
  IF c.kind = 'deprecation' AND t.asset_id IS NOT NULL THEN
    v_map := coalesce(c.plans -> 'migrationMap', '{}'::jsonb);
    SELECT jsonb_agg(x) INTO v_missing FROM jsonb_array_elements_text(t.consumers) x WHERE length(btrim(coalesce(v_map ->> x, ''))) = 0;
    IF v_missing IS NOT NULL THEN
      v := v || jsonb_build_object('class', 'evidence_missing', 'reason', format('the deprecation would strand %s consumer(s) with no migration target: %s', jsonb_array_length(v_missing),
                                   (SELECT string_agg(y, ', ') FROM jsonb_array_elements_text(v_missing) y)));
    END IF;
  END IF;
  IF c.kind = 'retirement' AND t.asset_id IS NOT NULL THEN
    IF t.status <> 'deprecated' THEN v := v || jsonb_build_object('class', 'evidence_missing', 'reason', 'only a deprecated asset is retired (deprecate and migrate first)'); END IF;
    IF jsonb_array_length(t.consumers) > 0 THEN
      v := v || jsonb_build_object('class', 'evidence_missing', 'reason', format('retirement would strand %s consumer(s): %s', jsonb_array_length(t.consumers), (SELECT string_agg(y, ', ') FROM jsonb_array_elements_text(t.consumers) y)));
    END IF;
  END IF;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION governance.dg_contribution_blockers(governance.design_contributions) FROM PUBLIC;

/* The digest of a contribution's revision (what a reviewer reads and an authority accepts). */
CREATE OR REPLACE FUNCTION governance.dg_contribution_digest(c governance.design_contributions) RETURNS text
LANGUAGE sql STABLE SET search_path = governance, pg_catalog, pg_temp AS $$
  SELECT governance.digest(jsonb_build_object('contribution_id', c.contribution_id, 'revision', c.revision, 'kind', c.kind, 'target', c.target_asset_id, 'target_version', c.target_version,
                                              'proposal', c.proposal, 'summary', c.summary, 'plans', c.plans, 'constitutional', c.constitutional, 'origin', c.origin, 'intake_id', c.intake_id))
$$;
REVOKE ALL ON FUNCTION governance.dg_contribution_digest(governance.design_contributions) FROM PUBLIC;

/* Validate a contribution's shape (kind × target × proposal); raise in the class form. */
CREATE OR REPLACE FUNCTION governance.dg_contribution_shape(p_kind text, p_target uuid, p_proposal jsonb, p_summary text, p_plans jsonb, p_constitutional boolean, p_origin text) RETURNS int
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE t governance.design_assets%ROWTYPE;
BEGIN
  IF coalesce(p_kind, '') NOT IN ('new_component', 'component_change', 'new_pattern', 'pattern_change', 'deprecation', 'retirement', 'amendment') THEN
    RAISE EXCEPTION 'design contribution rejected (kind): % is not a contribution kind', coalesce(p_kind, '<none>') USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_proposal) IS DISTINCT FROM 'object' OR jsonb_typeof(coalesce(p_plans, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'design contribution rejected (proposal): the proposal and its plans are objects' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_summary, ''))) < 12 THEN RAISE EXCEPTION 'design contribution rejected (summary): a contribution states what it changes and why (12+ characters)' USING ERRCODE = '22023'; END IF;
  IF coalesce(p_constitutional, false) AND p_kind <> 'amendment' THEN
    RAISE EXCEPTION 'design contribution rejected (constitutional): design governance refines expression within the frozen architecture; constitutional meaning changes only through an explicit amendment ratified by the product authority (UX-72-004)' USING ERRCODE = '22023';
  END IF;
  IF p_kind IN ('new_component', 'new_pattern') THEN
    IF p_target IS NOT NULL THEN RAISE EXCEPTION 'design contribution rejected (target): a new % names no target', replace(p_kind, 'new_', '') USING ERRCODE = '22023'; END IF;
    IF coalesce(p_proposal ->> 'assetKey', '') !~ '^[a-z][a-z0-9_.-]{2,120}$' OR length(btrim(coalesce(p_proposal ->> 'title', ''))) < 3 OR length(btrim(coalesce(p_proposal ->> 'sourceRef', ''))) < 3
       OR coalesce(p_proposal ->> 'packageVersion', '') !~ '^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$' THEN
      RAISE EXCEPTION 'design contribution rejected (proposal): a new asset states its key, title, source and package version (semver)' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM governance.design_assets a WHERE a.asset_key = p_proposal ->> 'assetKey' AND a.superseded_at IS NULL) THEN
      RAISE EXCEPTION 'design contribution rejected (duplicate): % is already a design asset — propose a change to it', p_proposal ->> 'assetKey' USING ERRCODE = '23505';
    END IF;
  ELSIF p_target IS NOT NULL THEN
    SELECT * INTO t FROM governance.design_assets a WHERE a.asset_id = p_target AND a.superseded_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'design contribution rejected (unknown_asset): % is not a current design asset', p_target USING ERRCODE = '23503'; END IF;
    IF (p_kind = 'component_change' AND t.kind NOT IN ('design_component', 'design_asset')) OR (p_kind = 'pattern_change' AND t.kind <> 'pattern') THEN
      RAISE EXCEPTION 'design contribution rejected (target): a % changes a %', p_kind, CASE p_kind WHEN 'pattern_change' THEN 'pattern' ELSE 'component or design asset' END USING ERRCODE = '22023';
    END IF;
    IF p_kind IN ('component_change', 'pattern_change') AND coalesce(p_proposal ->> 'packageVersion', '') !~ '^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$' THEN
      RAISE EXCEPTION 'design contribution rejected (proposal): a change names the next package version (semver)' USING ERRCODE = '22023';
    END IF;
    IF p_kind IN ('component_change', 'pattern_change') AND (p_proposal ->> 'packageVersion') = t.package_version THEN
      RAISE EXCEPTION 'design contribution rejected (proposal): a change names a package version other than the current one (%)', t.package_version USING ERRCODE = '22023';
    END IF;
    RETURN t.version;
  ELSIF p_kind IN ('deprecation', 'retirement') OR (p_kind IN ('component_change', 'pattern_change') AND coalesce(p_origin, 'contributor') <> 'experience_learning') THEN
    RAISE EXCEPTION 'design contribution rejected (target): a % names the asset it acts on', p_kind USING ERRCODE = '22023';
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION governance.dg_contribution_shape(text, uuid, jsonb, text, jsonb, boolean, text) FROM PUBLIC;

/* Insert a contribution (the propose port and the experience intake share it). */
CREATE OR REPLACE FUNCTION governance.dg_insert_contribution(p_id uuid, p_kind text, p_target uuid, p_proposal jsonb, p_summary text, p_plans jsonb, p_constitutional boolean, p_origin text,
                                                            p_intake uuid, p_proposer uuid, p_actor uuid, p_corr uuid) RETURNS governance.design_contributions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE c governance.design_contributions%ROWTYPE; v_tv int;
BEGIN
  v_tv := governance.dg_contribution_shape(p_kind, p_target, p_proposal, p_summary, p_plans, p_constitutional, p_origin);
  c.contribution_id := p_id; c.scope := 'PLATFORM'; c.revision := 1; c.kind := p_kind; c.target_asset_id := p_target; c.target_version := v_tv; c.proposal := p_proposal;
  c.summary := btrim(p_summary); c.plans := coalesce(p_plans, '{}'::jsonb); c.constitutional := coalesce(p_constitutional, false); c.origin := p_origin; c.intake_id := p_intake;
  c.stage := 'proposed'; c.hold_reasons := '[]'::jsonb; c.evidence := '[]'::jsonb; c.proposed_by := p_proposer; c.proposed_by_kind := coalesce(governance.dg_kind(p_proposer), 'system');
  c.proposed_at := clock_timestamp(); c.builders := '{}'; c.updated_at := clock_timestamp(); c.correlation_id := p_corr;
  c.digest := governance.dg_contribution_digest(c);
  INSERT INTO governance.design_contributions SELECT c.*;
  PERFORM governance.dg_artifact(p_id, 'change_proposal', 'DSC:' || p_id, left(format('Design contribution (%s): %s', p_kind, btrim(p_summary)), 500), NULL, NULL, NULL, 'design_system_authority', 'proposed',
                                 jsonb_build_object('class', 'design_contribution', 'kind', p_kind, 'origin', p_origin, 'stage', 'proposed', 'revision', 1), c.digest, p_actor, p_corr);
  IF p_target IS NOT NULL THEN PERFORM governance.dg_link(p_id, p_target, 'contributes_to', NULL, NULL, jsonb_build_object('target_version', v_tv), p_actor, p_corr); END IF;
  PERFORM governance.ledger(NULL, NULL, 'design_contribution', p_id, 1, 'design.contribution_proposed', p_actor,
            jsonb_build_object('kind', p_kind, 'target', p_target, 'origin', p_origin, 'intake_id', p_intake, 'proposer', p_proposer, 'digest', c.digest), p_corr);
  RETURN c;
END $$;
REVOKE ALL ON FUNCTION governance.dg_insert_contribution(uuid, text, uuid, jsonb, text, jsonb, boolean, text, uuid, uuid, uuid, uuid) FROM PUBLIC;

/* PROPOSE a contribution (a contributor: the Design System Authority, the product authority, the conformance steward, the operations
   authority — an AGENT may propose; proposals are never approvals). */
CREATE OR REPLACE FUNCTION governance.dg_propose_contribution(p_id uuid, p_kind text, p_target uuid, p_proposal jsonb, p_summary text, p_plans jsonb, p_constitutional boolean,
                                                             p_actor uuid, p_corr uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE c governance.design_contributions%ROWTYPE;
BEGIN
  PERFORM governance.assert_platform('governance.design.contribution.propose', p_actor, 'design contribution');
  c := governance.dg_insert_contribution(p_id, p_kind, p_target, p_proposal, p_summary, p_plans, p_constitutional, 'contributor', NULL, p_actor, p_actor, p_corr);
  RETURN to_jsonb(c) - 'scope' - 'tenant_id' - 'domain_id' || jsonb_build_object('blockers', governance.dg_contribution_blockers(c));
END $$;
REVOKE ALL ON FUNCTION governance.dg_propose_contribution(uuid, text, uuid, jsonb, text, jsonb, boolean, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dg_propose_contribution(uuid, text, uuid, jsonb, text, jsonb, boolean, uuid, uuid) TO eye_commit;

/* AMEND a contribution at the next revision (proposed / in review / held): its proposer, or a contributor — who is then recorded as a BUILDER
   and never accepts it. The review restarts; open holds are lifted with the reason. */
CREATE OR REPLACE FUNCTION governance.dg_amend_contribution(p_id uuid, p_revision int, p_target uuid, p_proposal jsonb, p_summary text, p_plans jsonb, p_actor uuid, p_corr uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE c governance.design_contributions%ROWTYPE; v_tv int;
BEGIN
  PERFORM governance.assert_platform('governance.design.contribution.amend', p_actor, 'design contribution');
  SELECT * INTO c FROM governance.design_contributions x WHERE x.contribution_id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'design contribution rejected (unknown_contribution): no contribution %', p_id USING ERRCODE = '23503'; END IF;
  IF c.stage NOT IN ('proposed', 'in_review', 'held') THEN RAISE EXCEPTION 'design contribution rejected (state): a % contribution is no longer amended', c.stage USING ERRCODE = '23505'; END IF;
  IF p_revision IS DISTINCT FROM c.revision THEN RAISE EXCEPTION 'design contribution rejected (stale): the contribution is at revision %, not %', c.revision, coalesce(p_revision::text, '<none>') USING ERRCODE = '23505'; END IF;
  v_tv := governance.dg_contribution_shape(c.kind, p_target, p_proposal, p_summary, p_plans, c.constitutional, c.origin);
  c.revision := c.revision + 1; c.target_asset_id := p_target; c.target_version := v_tv; c.proposal := p_proposal; c.summary := btrim(p_summary); c.plans := coalesce(p_plans, '{}'::jsonb);
  c.stage := 'proposed'; c.hold_reasons := '[]'::jsonb; c.review := NULL; c.reviewed_by := NULL; c.updated_at := clock_timestamp();
  IF p_actor <> c.proposed_by AND NOT (p_actor = ANY (c.builders)) THEN c.builders := c.builders || p_actor; END IF;
  c.digest := governance.dg_contribution_digest(c);
  UPDATE governance.design_contributions SET revision = c.revision, target_asset_id = c.target_asset_id, target_version = c.target_version, proposal = c.proposal, summary = c.summary,
         plans = c.plans, stage = c.stage, hold_reasons = c.hold_reasons, review = NULL, reviewed_by = NULL, builders = c.builders, digest = c.digest, updated_at = c.updated_at WHERE contribution_id = p_id;
  PERFORM governance.dg_lift(p_id, format('amended to revision %s', c.revision), p_actor);
  PERFORM governance.dg_artifact(p_id, 'change_proposal', 'DSC:' || p_id, left(format('Design contribution (%s): %s', c.kind, c.summary), 500), NULL, NULL, NULL, 'design_system_authority', 'proposed',
                                 jsonb_build_object('class', 'design_contribution', 'kind', c.kind, 'origin', c.origin, 'stage', 'proposed', 'revision', c.revision), c.digest, p_actor, p_corr);
  IF p_target IS NOT NULL THEN PERFORM governance.dg_link(p_id, p_target, 'contributes_to', NULL, NULL, jsonb_build_object('target_version', v_tv), p_actor, p_corr); END IF;
  PERFORM governance.ledger(NULL, NULL, 'design_contribution', p_id, c.revision, 'design.contribution_amended', p_actor, jsonb_build_object('digest', c.digest, 'builders', to_jsonb(c.builders)), p_corr);
  RETURN to_jsonb(c) - 'scope' - 'tenant_id' - 'domain_id' || jsonb_build_object('blockers', governance.dg_contribution_blockers(c));
END $$;
REVOKE ALL ON FUNCTION governance.dg_amend_contribution(uuid, int, uuid, jsonb, text, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dg_amend_contribution(uuid, int, uuid, jsonb, text, jsonb, uuid, uuid) TO eye_commit;

/* Write the next VERSION of an asset (publish, deprecate, retire, adoption's consumers): the current version superseded, the artifact re-versioned. */
CREATE OR REPLACE FUNCTION governance.dg_next_asset_version(p_asset uuid, p_status text, p_package_version text, p_source_ref text, p_owner uuid, p_consumers jsonb, p_contribution uuid,
                                                           p_approved_by uuid, p_reason text, p_actor uuid, p_corr uuid) RETURNS governance.design_assets
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE cur governance.design_assets%ROWTYPE; n governance.design_assets%ROWTYPE;
BEGIN
  SELECT * INTO cur FROM governance.design_assets a WHERE a.asset_id = p_asset AND a.superseded_at IS NULL FOR UPDATE;
  UPDATE governance.design_assets SET status = 'superseded', superseded_at = clock_timestamp() WHERE asset_id = p_asset AND version = cur.version;
  n := cur; n.version := cur.version + 1; n.status := p_status; n.package_version := coalesce(p_package_version, cur.package_version); n.source_ref := coalesce(p_source_ref, cur.source_ref);
  n.owner_principal_id := coalesce(p_owner, cur.owner_principal_id); n.consumers := coalesce(p_consumers, cur.consumers); n.contribution_id := coalesce(p_contribution, cur.contribution_id);
  n.approved_by := coalesce(p_approved_by, cur.approved_by); n.approved_at := CASE WHEN p_approved_by IS NULL THEN cur.approved_at ELSE clock_timestamp() END;
  n.approval_reason := coalesce(p_reason, cur.approval_reason); n.superseded_at := NULL; n.registered_by := p_actor; n.registered_at := clock_timestamp(); n.correlation_id := p_corr;
  IF p_package_version IS NOT NULL AND p_package_version <> cur.package_version THEN n.source_digest := NULL; END IF;
  n.digest := governance.dg_asset_digest(n);
  INSERT INTO governance.design_assets SELECT n.*;
  PERFORM governance.dg_artifact(n.asset_id, n.kind, 'DS:' || n.asset_key, n.title, NULL, NULL, n.owner_principal_id, 'design_system_authority',
                                 CASE n.status WHEN 'approved' THEN 'active' WHEN 'deprecated' THEN 'deprecated' WHEN 'retired' THEN 'retired' ELSE 'proposed' END,
                                 jsonb_build_object('source_ref', n.source_ref, 'package_version', n.package_version, 'asset_version', n.version), n.digest, p_actor, p_corr);
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION governance.dg_next_asset_version(uuid, text, text, text, uuid, jsonb, uuid, uuid, text, uuid, uuid) FROM PUBLIC;

/* ADVANCE a contribution one governed step. Each step is its own action (governance.design.contribution.<step>) and its own rule:
     review    (the Design System Authority, a named human, never the proposer or a builder): the blockers computed — any → HELD (the
               contribution preserved, its hold reasons shown, governance.holds opened: ownership_gap | evidence_missing); none → in_review;
     accept    (human-gated, SIGNED `design_contribution`, on the exact digest of an in_review revision): the Design System Authority — or, for a
               constitutional AMENDMENT, the product authority (ratification, UX-72-004); never the proposer, never a builder; the blockers
               re-read — any → HELD (409);
     reject    (the Design System Authority or the product authority; never the proposer): the prior baseline and consumers untouched;
     publish   (an accepted change or new asset): the asset's next version written `approved` (the prior one superseded, still readable);
     deprecate (an accepted deprecation): the asset's next version `deprecated`, the migration map recorded;
     adopt     (the steward or the authority): adoption evidence; a DIVERGENT adopter → the asset HELD (conformance_drift), stage unchanged;
     measure   (after adoption): measurement evidence (e.g. B92 telemetry / metric results by reference) — telemetry never changes a pattern;
     migrate   (a deprecation being migrated): consumers moved off the deprecated version;
     retire    (human-gated): only when no consumer remains — otherwise HELD (409: it would strand consumers);
     close     (human-gated): a measured, retired or rejected contribution closed with its reason. */
CREATE OR REPLACE FUNCTION governance.dg_advance_contribution(p_id uuid, p_step text, p_revision int, p_digest text, p_reason text, p_evidence jsonb, p_signature uuid,
                                                             p_actor uuid, p_corr uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, onboarding, public, pg_catalog, pg_temp AS $$
DECLARE c governance.design_contributions%ROWTYPE; t governance.design_assets%ROWTYPE; n governance.design_assets%ROWTYPE; v_blockers jsonb; v_action text; v_held boolean := false;
        v_class text; v_new uuid; v_ev jsonb := coalesce(p_evidence, '{}'::jsonb); v_list jsonb; v_div jsonb; v_consumers jsonb; v_hold uuid; v_out jsonb := '{}'::jsonb; v_roles text[];
BEGIN
  IF coalesce(p_step, '') NOT IN ('review', 'accept', 'reject', 'publish', 'deprecate', 'adopt', 'measure', 'migrate', 'retire', 'close') THEN
    RAISE EXCEPTION 'design contribution rejected (step): % is not a contribution step', coalesce(p_step, '<none>') USING ERRCODE = '22023';
  END IF;
  v_action := 'governance.design.contribution.' || p_step;
  PERFORM governance.assert_platform(v_action, p_actor, 'design contribution');
  SELECT * INTO c FROM governance.design_contributions x WHERE x.contribution_id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'design contribution rejected (unknown_contribution): no contribution %', p_id USING ERRCODE = '23503'; END IF;
  IF p_revision IS DISTINCT FROM c.revision THEN RAISE EXCEPTION 'design contribution rejected (stale): the contribution is at revision %, not %', c.revision, coalesce(p_revision::text, '<none>') USING ERRCODE = '23505'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'design contribution rejected (reason): a step states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF c.target_asset_id IS NOT NULL THEN SELECT * INTO t FROM governance.design_assets a WHERE a.asset_id = c.target_asset_id AND a.superseded_at IS NULL FOR UPDATE; END IF;

  IF p_step IN ('review', 'accept', 'reject', 'publish', 'deprecate', 'retire', 'close') THEN
    v_roles := CASE WHEN p_step IN ('accept', 'reject') AND c.constitutional THEN ARRAY['product_authority']
                    WHEN p_step = 'reject' THEN ARRAY['design_system_authority', 'product_authority'] ELSE ARRAY['design_system_authority'] END;
    PERFORM governance.assert_approver('design contribution', p_actor, NULL, NULL, v_roles, c.proposed_by, c.builders,
              CASE p_step WHEN 'accept' THEN CASE WHEN c.constitutional THEN 'ratifying a constitutional amendment' ELSE 'accepting a design contribution' END
                          ELSE format('the %s step of a design contribution', p_step) END);
  END IF;

  IF p_step = 'review' THEN
    IF c.stage NOT IN ('proposed', 'held') THEN RAISE EXCEPTION 'design contribution rejected (state): a % contribution is not reviewed', c.stage USING ERRCODE = '23505'; END IF;
    v_blockers := governance.dg_contribution_blockers(c);
    IF jsonb_array_length(v_blockers) > 0 THEN
      v_held := true;
      v_class := CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_blockers) b WHERE b ->> 'class' = 'ownership_gap') THEN 'ownership_gap' ELSE 'evidence_missing' END;
      v_hold := governance.dg_hold(p_id, v_class, left(format('design contribution held at review: %s', (SELECT string_agg(b ->> 'reason', '; ') FROM jsonb_array_elements(v_blockers) b)), 2000), NULL, NULL, p_actor, p_corr);
    END IF;
    UPDATE governance.design_contributions SET stage = CASE WHEN v_held THEN 'held' ELSE 'in_review' END, hold_reasons = v_blockers, reviewed_by = p_actor,
           review = jsonb_build_object('by', p_actor, 'at', clock_timestamp(), 'notes', btrim(p_reason), 'blockers', v_blockers, 'revision', c.revision), updated_at = clock_timestamp() WHERE contribution_id = p_id;
    IF NOT v_held THEN PERFORM governance.dg_lift(p_id, 'reviewed: no blocker remains', p_actor); END IF;
    v_out := jsonb_build_object('stage', CASE WHEN v_held THEN 'held' ELSE 'in_review' END, 'held', v_held, 'blockers', v_blockers, 'hold_id', v_hold);

  ELSIF p_step = 'accept' THEN
    IF c.stage <> 'in_review' THEN RAISE EXCEPTION 'design contribution rejected (state): only a reviewed (in_review) contribution is accepted — this one is %', c.stage USING ERRCODE = '23505'; END IF;
    IF p_digest IS DISTINCT FROM c.digest THEN RAISE EXCEPTION 'design contribution rejected (stale): the acceptance names a digest other than revision %''s', c.revision USING ERRCODE = '23505'; END IF;
    v_blockers := governance.dg_contribution_blockers(c);
    IF jsonb_array_length(v_blockers) > 0 THEN
      v_class := CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_blockers) b WHERE b ->> 'class' = 'ownership_gap') THEN 'ownership_gap' ELSE 'evidence_missing' END;
      v_hold := governance.dg_hold(p_id, v_class, left(format('design contribution held at acceptance: %s', (SELECT string_agg(b ->> 'reason', '; ') FROM jsonb_array_elements(v_blockers) b)), 2000), NULL, NULL, p_actor, p_corr);
      UPDATE governance.design_contributions SET stage = 'held', hold_reasons = v_blockers, updated_at = clock_timestamp() WHERE contribution_id = p_id;
      PERFORM governance.ledger(NULL, NULL, 'design_contribution', p_id, c.revision, 'design.contribution_held', p_actor, jsonb_build_object('blockers', v_blockers, 'hold_id', v_hold), p_corr);
      RETURN jsonb_build_object('contribution_id', p_id, 'held', true, 'stage', 'held', 'blockers', v_blockers, 'hold_id', v_hold);
    END IF;
    IF NOT governance.dg_signature_ok(p_signature, 'design_contribution', p_id, c.revision, c.digest, p_actor, v_action) THEN
      RAISE EXCEPTION 'design contribution rejected (signature): an acceptance carries the authority''s signature over the revision''s digest' USING ERRCODE = '22023';
    END IF;
    UPDATE governance.design_contributions SET stage = 'accepted', accepted_by = p_actor, accepted_at = clock_timestamp(), signature_id = p_signature, hold_reasons = '[]'::jsonb, updated_at = clock_timestamp()
     WHERE contribution_id = p_id;
    v_out := jsonb_build_object('stage', 'accepted', 'signature_id', p_signature);

  ELSIF p_step = 'reject' THEN
    IF c.stage NOT IN ('proposed', 'in_review', 'held', 'accepted') THEN RAISE EXCEPTION 'design contribution rejected (state): a % contribution is not rejected', c.stage USING ERRCODE = '23505'; END IF;
    UPDATE governance.design_contributions SET stage = 'rejected', closed_reason = btrim(p_reason), updated_at = clock_timestamp() WHERE contribution_id = p_id;
    PERFORM governance.dg_lift(p_id, 'rejected: ' || btrim(p_reason), p_actor);
    v_out := jsonb_build_object('stage', 'rejected', 'preserved', 'the prior baseline, asset versions and consumers are untouched');

  ELSIF p_step = 'publish' THEN
    IF c.stage <> 'accepted' OR c.kind IN ('deprecation', 'retirement') THEN
      RAISE EXCEPTION 'design contribution rejected (state): publish takes an accepted change, new asset or amendment (this one is % · %)', c.kind, c.stage USING ERRCODE = '23505';
    END IF;
    IF c.kind IN ('new_component', 'new_pattern') THEN
      v_new := gen_random_uuid();
      n := ROW(v_new, 1, 'PLATFORM', NULL, NULL, CASE c.kind WHEN 'new_pattern' THEN 'pattern' ELSE coalesce(c.proposal ->> 'assetKind', 'design_component') END, c.proposal ->> 'assetKey',
               btrim(c.proposal ->> 'title'), btrim(c.proposal ->> 'sourceRef'), c.proposal ->> 'packageVersion', NULL, coalesce(c.proposal -> 'consumers', '[]'::jsonb),
               (c.proposal ->> 'ownerPrincipalId')::uuid, 'approved', p_id, repeat('0', 64), p_actor, clock_timestamp(), c.accepted_by, clock_timestamp(), 'accepted contribution ' || p_id, NULL, p_corr)::governance.design_assets;
      IF n.kind NOT IN ('design_component', 'pattern', 'design_asset') THEN n.kind := 'design_component'; END IF;
      n.digest := governance.dg_asset_digest(n);
      INSERT INTO governance.design_assets SELECT n.*;
      PERFORM governance.dg_artifact(n.asset_id, n.kind, 'DS:' || n.asset_key, n.title, NULL, NULL, n.owner_principal_id, 'design_system_authority', 'active',
                                     jsonb_build_object('source_ref', n.source_ref, 'package_version', n.package_version, 'asset_version', 1), n.digest, p_actor, p_corr);
      PERFORM governance.dg_link(p_id, n.asset_id, 'contributes_to', NULL, NULL, jsonb_build_object('published_version', 1), p_actor, p_corr);
    ELSIF c.target_asset_id IS NOT NULL THEN
      n := governance.dg_next_asset_version(c.target_asset_id, 'approved', c.proposal ->> 'packageVersion', nullif(c.proposal ->> 'sourceRef', ''), nullif(c.proposal ->> 'ownerPrincipalId', '')::uuid,
                                            NULL, p_id, c.accepted_by, 'accepted contribution ' || p_id, p_actor, p_corr);
    END IF;
    UPDATE governance.design_contributions SET stage = 'published', published_version = n.version, updated_at = clock_timestamp() WHERE contribution_id = p_id;
    v_out := jsonb_build_object('stage', 'published', 'asset_id', n.asset_id, 'asset_version', n.version, 'asset_digest', n.digest);

  ELSIF p_step = 'deprecate' THEN
    IF c.stage <> 'accepted' OR c.kind <> 'deprecation' THEN RAISE EXCEPTION 'design contribution rejected (state): deprecate takes an accepted deprecation' USING ERRCODE = '23505'; END IF;
    n := governance.dg_next_asset_version(c.target_asset_id, 'deprecated', NULL, NULL, NULL, NULL, p_id, NULL, 'deprecated by contribution ' || p_id, p_actor, p_corr);
    UPDATE governance.design_contributions SET stage = 'deprecated', published_version = n.version, updated_at = clock_timestamp() WHERE contribution_id = p_id;
    v_out := jsonb_build_object('stage', 'deprecated', 'asset_id', n.asset_id, 'asset_version', n.version, 'consumers', n.consumers, 'migration_map', c.plans -> 'migrationMap');

  ELSIF p_step = 'adopt' THEN
    IF c.stage NOT IN ('published', 'adopted') THEN RAISE EXCEPTION 'design contribution rejected (state): adoption follows publication (this one is %)', c.stage USING ERRCODE = '23505'; END IF;
    v_list := coalesce(v_ev -> 'adopted', '[]'::jsonb); v_div := coalesce(v_ev -> 'divergent', '[]'::jsonb);
    IF jsonb_typeof(v_list) <> 'array' OR jsonb_typeof(v_div) <> 'array' OR (jsonb_array_length(v_list) + jsonb_array_length(v_div)) = 0 THEN
      RAISE EXCEPTION 'design contribution rejected (evidence): adoption names the consumers that adopted (adopted) and any that diverge (divergent)' USING ERRCODE = '22023';
    END IF;
    v_new := coalesce(t.asset_id, (SELECT a.asset_id FROM governance.design_assets a WHERE a.contribution_id = p_id AND a.superseded_at IS NULL LIMIT 1));
    IF jsonb_array_length(v_div) > 0 THEN
      v_hold := governance.dg_hold(v_new, 'conformance_drift', left(format('adoption diverges from the published version: %s', v_div::text), 2000), NULL, NULL, p_actor, p_corr);
      UPDATE governance.design_contributions SET hold_reasons = jsonb_build_array(jsonb_build_object('class', 'conformance_drift', 'reason', 'adoption diverges', 'divergent', v_div)),
             evidence = evidence || jsonb_build_array(jsonb_build_object('step', 'adopt', 'at', clock_timestamp(), 'by', p_actor, 'adopted', v_list, 'divergent', v_div)), updated_at = clock_timestamp()
       WHERE contribution_id = p_id;
      v_held := true;
      v_out := jsonb_build_object('stage', c.stage, 'held', true, 'hold_id', v_hold, 'divergent', v_div);
    ELSE
      SELECT coalesce(jsonb_agg(DISTINCT x), '[]'::jsonb) INTO v_consumers FROM (SELECT jsonb_array_elements_text(a.consumers) x FROM governance.design_assets a WHERE a.asset_id = v_new AND a.superseded_at IS NULL
                                                                                UNION SELECT jsonb_array_elements_text(v_list)) q;
      UPDATE governance.design_assets SET consumers = v_consumers WHERE asset_id = v_new AND superseded_at IS NULL;
      UPDATE governance.design_assets a SET digest = governance.dg_asset_digest(a) WHERE a.asset_id = v_new AND a.superseded_at IS NULL;
      PERFORM governance.dg_lift(v_new, 'adoption confirmed without divergence', p_actor);
      UPDATE governance.design_contributions SET stage = 'adopted', hold_reasons = '[]'::jsonb,
             evidence = evidence || jsonb_build_array(jsonb_build_object('step', 'adopt', 'at', clock_timestamp(), 'by', p_actor, 'adopted', v_list)), updated_at = clock_timestamp() WHERE contribution_id = p_id;
      v_out := jsonb_build_object('stage', 'adopted', 'consumers', v_consumers);
    END IF;

  ELSIF p_step = 'measure' THEN
    IF c.stage NOT IN ('adopted', 'measured') THEN RAISE EXCEPTION 'design contribution rejected (state): measurement follows adoption (this one is %)', c.stage USING ERRCODE = '23505'; END IF;
    v_list := v_ev -> 'measures';
    IF jsonb_typeof(v_list) IS DISTINCT FROM 'array' OR jsonb_array_length(v_list) = 0
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_list) m WHERE length(coalesce(m ->> 'kind', '')) < 3 OR length(coalesce(m ->> 'ref', '')) < 3) THEN
      RAISE EXCEPTION 'design contribution rejected (evidence): a measurement names its evidence by reference (kind, ref — e.g. a B92 metric result or telemetry definition)' USING ERRCODE = '22023';
    END IF;
    UPDATE governance.design_contributions SET stage = 'measured', evidence = evidence || jsonb_build_array(jsonb_build_object('step', 'measure', 'at', clock_timestamp(), 'by', p_actor, 'measures', v_list,
           'note', 'telemetry is evidence for a human decision; it never modifies a pattern (UX-ADR-024)')), updated_at = clock_timestamp() WHERE contribution_id = p_id;
    v_out := jsonb_build_object('stage', 'measured');

  ELSIF p_step = 'migrate' THEN
    IF c.kind <> 'deprecation' OR c.stage NOT IN ('deprecated', 'migrating') THEN RAISE EXCEPTION 'design contribution rejected (state): migration follows a deprecation' USING ERRCODE = '23505'; END IF;
    v_list := v_ev -> 'migrated';
    IF jsonb_typeof(v_list) IS DISTINCT FROM 'array' OR jsonb_array_length(v_list) = 0 THEN RAISE EXCEPTION 'design contribution rejected (evidence): migration names the consumers moved (migrated)' USING ERRCODE = '22023'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_list) m WHERE NOT (t.consumers ? m)) THEN
      RAISE EXCEPTION 'design contribution rejected (evidence): a migrated consumer is not a consumer of %', t.asset_key USING ERRCODE = '22023';
    END IF;
    SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO v_consumers FROM jsonb_array_elements_text(t.consumers) x WHERE NOT (v_list ? x);
    UPDATE governance.design_assets SET consumers = v_consumers WHERE asset_id = t.asset_id AND superseded_at IS NULL;
    UPDATE governance.design_assets a SET digest = governance.dg_asset_digest(a) WHERE a.asset_id = t.asset_id AND a.superseded_at IS NULL;
    UPDATE governance.design_contributions SET stage = 'migrating', evidence = evidence || jsonb_build_array(jsonb_build_object('step', 'migrate', 'at', clock_timestamp(), 'by', p_actor, 'migrated', v_list,
           'to', (SELECT jsonb_object_agg(m, c.plans -> 'migrationMap' -> m) FROM jsonb_array_elements_text(v_list) m))), updated_at = clock_timestamp() WHERE contribution_id = p_id;
    v_out := jsonb_build_object('stage', 'migrating', 'remaining_consumers', v_consumers);

  ELSIF p_step = 'retire' THEN
    IF NOT ((c.kind = 'deprecation' AND c.stage IN ('deprecated', 'migrating')) OR (c.kind = 'retirement' AND c.stage = 'accepted')) THEN
      RAISE EXCEPTION 'design contribution rejected (state): retirement follows a deprecation (or an accepted retirement)' USING ERRCODE = '23505';
    END IF;
    IF jsonb_array_length(t.consumers) > 0 THEN
      v_hold := governance.dg_hold(t.asset_id, 'evidence_missing', left(format('retirement held: it would strand %s consumer(s): %s', jsonb_array_length(t.consumers), t.consumers::text), 2000), NULL, NULL, p_actor, p_corr);
      UPDATE governance.design_contributions SET hold_reasons = jsonb_build_array(jsonb_build_object('class', 'evidence_missing', 'reason', 'retirement would strand consumers', 'consumers', t.consumers)),
             updated_at = clock_timestamp() WHERE contribution_id = p_id;
      PERFORM governance.ledger(NULL, NULL, 'design_contribution', p_id, c.revision, 'design.contribution_held', p_actor, jsonb_build_object('step', 'retire', 'consumers', t.consumers, 'hold_id', v_hold), p_corr);
      RETURN jsonb_build_object('contribution_id', p_id, 'held', true, 'stage', c.stage, 'blockers', jsonb_build_array(jsonb_build_object('class', 'evidence_missing',
                                'reason', format('retirement would strand %s consumer(s)', jsonb_array_length(t.consumers)))), 'consumers', t.consumers, 'hold_id', v_hold);
    END IF;
    n := governance.dg_next_asset_version(t.asset_id, 'retired', NULL, NULL, NULL, '[]'::jsonb, p_id, NULL, 'retired by contribution ' || p_id, p_actor, p_corr);
    PERFORM governance.dg_lift(t.asset_id, 'retired with no consumer stranded', p_actor);
    UPDATE governance.design_contributions SET stage = 'retired', published_version = n.version, hold_reasons = '[]'::jsonb, updated_at = clock_timestamp() WHERE contribution_id = p_id;
    v_out := jsonb_build_object('stage', 'retired', 'asset_id', n.asset_id, 'asset_version', n.version);

  ELSIF p_step = 'close' THEN
    IF c.stage NOT IN ('measured', 'retired', 'rejected') THEN RAISE EXCEPTION 'design contribution rejected (state): a % contribution is not closed (measure, retire or reject it first)', c.stage USING ERRCODE = '23505'; END IF;
    UPDATE governance.design_contributions SET stage = 'closed', closed_reason = btrim(p_reason), updated_at = clock_timestamp() WHERE contribution_id = p_id;
    v_out := jsonb_build_object('stage', 'closed');
  END IF;

  SELECT * INTO c FROM governance.design_contributions x WHERE x.contribution_id = p_id;
  PERFORM governance.dg_artifact(p_id, 'change_proposal', 'DSC:' || p_id, left(format('Design contribution (%s): %s', c.kind, c.summary), 500), NULL, NULL, NULL, 'design_system_authority',
                                 CASE WHEN c.stage IN ('proposed', 'in_review', 'held', 'accepted') THEN 'proposed' WHEN c.stage IN ('rejected', 'closed', 'retired') THEN 'retired' ELSE 'active' END,
                                 jsonb_build_object('class', 'design_contribution', 'kind', c.kind, 'origin', c.origin, 'stage', c.stage, 'revision', c.revision), c.digest, p_actor, p_corr);
  PERFORM governance.ledger(NULL, NULL, 'design_contribution', p_id, c.revision, 'design.contribution_' || CASE WHEN v_held THEN 'held' ELSE p_step END, p_actor,
            jsonb_build_object('reason', btrim(p_reason), 'stage', c.stage, 'result', v_out), p_corr);
  RETURN jsonb_build_object('contribution_id', p_id, 'revision', c.revision, 'kind', c.kind, 'held', v_held, 'digest', c.digest) || v_out;
END $$;
REVOKE ALL ON FUNCTION governance.dg_advance_contribution(uuid, text, int, text, text, jsonb, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dg_advance_contribution(uuid, text, int, text, text, jsonb, uuid, uuid, uuid) TO eye_commit;

-- §DG.8 EXPERIENCE LEARNING (UX-ADR-024) ──────────────────────────────────────────────────────────────────────────────────────────────────
/* INTAKE the domain's B92 experience actions of kind `design_change_proposal` (decided `act` by the domain's named product analytics owner):
   each opens ONE contribution proposal (origin experience_learning, proposed by that owner, naming no target until a contributor amends it)
   and nothing else — telemetry and feedback never modify a pattern. Served by the route (governance.design.intake: the product analytics
   owner, the domain admin, the Design System Authority) and by the attention tick's step (executive.attention.tick — the agent opens
   proposals only). Idempotent: an action already taken in is answered as `already`. */
CREATE OR REPLACE FUNCTION governance.dg_intake_experience(p_tenant uuid, p_domain uuid, p_action uuid, p_actor uuid, p_corr uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, analytics, observation, public, pg_catalog, pg_temp AS $$
DECLARE r record; v_intake uuid; v_contribution uuid; c governance.design_contributions%ROWTYPE; v_in jsonb := '[]'::jsonb; v_already jsonb := '[]'::jsonb; v_bound text;
BEGIN
  v_bound := observation.assert_authority(ARRAY['governance.design.intake', 'executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'design contribution rejected (actor): the intake is recorded under the acting principal' USING ERRCODE = '42501';
  END IF;
  IF p_action IS NOT NULL AND NOT EXISTS (SELECT 1 FROM analytics.experience_actions a WHERE a.action_id = p_action AND a.tenant_id = p_tenant AND a.domain_id = p_domain) THEN
    RAISE EXCEPTION 'design contribution rejected (unknown_action): % is not an experience action of this domain', p_action USING ERRCODE = '23503';
  END IF;
  IF p_action IS NOT NULL AND NOT EXISTS (SELECT 1 FROM analytics.experience_actions a WHERE a.action_id = p_action AND a.decision = 'act' AND a.kind = 'design_change_proposal') THEN
    RAISE EXCEPTION 'design contribution rejected (kind): only an experience action decided as a design_change_proposal opens a design contribution' USING ERRCODE = '22023';
  END IF;
  FOR r IN SELECT a.action_id, a.finding_id, a.preview_digest, a.decided_by, a.decided_at, f.journey_key, f.statement
             FROM analytics.experience_actions a JOIN analytics.experience_findings f ON f.finding_id = a.finding_id
            WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.decision = 'act' AND a.kind = 'design_change_proposal' AND (p_action IS NULL OR a.action_id = p_action)
            ORDER BY a.decided_at, a.action_id LIMIT 50 LOOP
    SELECT i.intake_id, i.contribution_id INTO v_intake, v_contribution FROM governance.design_experience_intakes i WHERE i.action_id = r.action_id;
    IF FOUND THEN v_already := v_already || jsonb_build_object('action_id', r.action_id, 'intake_id', v_intake, 'contribution_id', v_contribution); CONTINUE; END IF;
    v_intake := gen_random_uuid(); v_contribution := gen_random_uuid();
    INSERT INTO governance.design_experience_intakes (intake_id, tenant_id, domain_id, action_id, finding_id, journey_key, statement, preview_digest, decided_by, decided_at, contribution_id,
                                                      intaken_by, intaken_by_kind, correlation_id)
    VALUES (v_intake, p_tenant, p_domain, r.action_id, r.finding_id, r.journey_key, r.statement, r.preview_digest, r.decided_by, r.decided_at, v_contribution, p_actor, coalesce(governance.dg_kind(p_actor), 'system'), p_corr);
    c := governance.dg_insert_contribution(v_contribution, 'pattern_change', NULL,
           jsonb_build_object('source', 'experience_learning', 'journeyKey', r.journey_key, 'intakeId', v_intake),
           format('Experience learning: a design change proposed from the %s journey (a B92 finding the domain''s product analytics owner decided as a design_change_proposal) — it names no target until a contributor amends it; telemetry never modifies a pattern',
                  coalesce(r.journey_key, 'unattached')),
           '{}'::jsonb, false, 'experience_learning', v_intake, r.decided_by, p_actor, p_corr);
    PERFORM governance.ledger(p_tenant, p_domain, 'design_contribution', v_contribution, 1, 'design.experience_intaken', p_actor,
              jsonb_build_object('action_id', r.action_id, 'finding_id', r.finding_id, 'intake_id', v_intake, 'bound_action', v_bound), p_corr);
    v_in := v_in || jsonb_build_object('action_id', r.action_id, 'intake_id', v_intake, 'contribution_id', v_contribution, 'stage', c.stage);
  END LOOP;
  RETURN jsonb_build_object('intaken', v_in, 'already', v_already);
END $$;
REVOKE ALL ON FUNCTION governance.dg_intake_experience(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dg_intake_experience(uuid, uuid, uuid, uuid, uuid) TO eye_commit;

-- §DG.9 THE DESIGN BASELINE (UX-01; UX-ADR-001) ─────────────────────────────────────────────────────────────────────────────────────────────
/* REGISTER a baseline version (proposed): its members are the CURRENT versions of the named assets (digests taken here, never from the
   caller), the active principles and the approved unexpired exceptions on the members — the design-system version and the conformance scope
   stated. One open proposal per baseline; expected_version guards the race. */
CREATE OR REPLACE FUNCTION governance.dg_propose_baseline(p_baseline uuid, p_expected_version int, p_title text, p_dsv text, p_scope jsonb, p_members uuid[], p_actor uuid, p_corr uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE v_cur int; v_members jsonb; v_principles jsonb; v_exceptions jsonb; v_digest text; v_version int; k text; v_missing uuid; v_retired text;
BEGIN
  PERFORM governance.assert_platform('governance.design.baseline.propose', p_actor, 'design baseline');
  IF length(btrim(coalesce(p_title, ''))) < 4 OR length(btrim(coalesce(p_dsv, ''))) < 3 THEN
    RAISE EXCEPTION 'design baseline rejected (title): a baseline states its title and the design-system version it binds' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_scope) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'design baseline rejected (scope): the conformance scope is an object' USING ERRCODE = '22023'; END IF;
  FOR k IN SELECT jsonb_object_keys(p_scope) LOOP
    IF k NOT IN ('capabilities', 'journeys', 'profiles', 'themes', 'locales', 'devices', 'assistive_technologies', 'roles') OR jsonb_typeof(p_scope -> k) <> 'array'
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_scope -> k) e WHERE jsonb_typeof(e) <> 'string') THEN
      RAISE EXCEPTION 'design baseline rejected (scope): % is not a conformance-scope list (capabilities, journeys, profiles, themes, locales, devices, assistive_technologies, roles)', k USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM jsonb_each(p_scope) e WHERE jsonb_array_length(e.value) > 0) THEN
    RAISE EXCEPTION 'design baseline rejected (scope): a baseline names what it covers (at least one non-empty scope list)' USING ERRCODE = '22023';
  END IF;
  IF p_members IS NULL OR cardinality(p_members) = 0 THEN RAISE EXCEPTION 'design baseline rejected (members): a baseline names its component and pattern versions' USING ERRCODE = '22023'; END IF;
  SELECT m INTO v_missing FROM unnest(p_members) m WHERE NOT EXISTS (SELECT 1 FROM governance.design_assets a WHERE a.asset_id = m AND a.superseded_at IS NULL) LIMIT 1;
  IF v_missing IS NOT NULL THEN RAISE EXCEPTION 'design baseline rejected (unknown_asset): % is not a current design asset', v_missing USING ERRCODE = '23503'; END IF;
  SELECT a.asset_key INTO v_retired FROM governance.design_assets a WHERE a.asset_id = ANY (p_members) AND a.superseded_at IS NULL AND a.status = 'retired' LIMIT 1;
  IF v_retired IS NOT NULL THEN RAISE EXCEPTION 'design baseline rejected (state): % is retired and is no member of a baseline', v_retired USING ERRCODE = '23505'; END IF;
  SELECT jsonb_agg(jsonb_build_object('asset_id', a.asset_id, 'version', a.version, 'kind', a.kind, 'key', a.asset_key, 'digest', a.digest, 'status', a.status, 'owner', a.owner_principal_id,
                                      'package_version', a.package_version) ORDER BY a.asset_key)
    INTO v_members FROM governance.design_assets a WHERE a.asset_id = ANY (p_members) AND a.superseded_at IS NULL;
  SELECT coalesce(jsonb_agg(jsonb_build_object('key', p.principle_key, 'version', p.version, 'digest', p.digest, 'unwaivable', p.unwaivable) ORDER BY p.principle_key), '[]'::jsonb)
    INTO v_principles FROM governance.design_principles p WHERE p.state = 'active';
  SELECT coalesce(jsonb_agg(jsonb_build_object('exception_id', x.exception_id, 'principle', x.principle_key, 'asset_id', x.asset_id, 'asset_version', x.asset_version, 'expires_at', x.expires_at, 'digest', x.digest)
                            ORDER BY x.exception_id), '[]'::jsonb)
    INTO v_exceptions FROM governance.design_exceptions x WHERE x.asset_id = ANY (p_members) AND x.state = 'approved' AND x.expires_at > clock_timestamp();
  SELECT max(b.version) INTO v_cur FROM governance.design_baselines b WHERE b.baseline_id = p_baseline;
  IF coalesce(p_expected_version, -1) <> coalesce(v_cur, 0) THEN
    RAISE EXCEPTION 'design baseline rejected (stale): the baseline is at version %, not %', coalesce(v_cur, 0), coalesce(p_expected_version::text, '<none>') USING ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM governance.design_baselines b WHERE b.baseline_id = p_baseline AND b.state = 'proposed') THEN
    RAISE EXCEPTION 'design baseline rejected (state): a proposed version awaits its decision' USING ERRCODE = '23505';
  END IF;
  v_version := coalesce(v_cur, 0) + 1;
  v_digest := governance.digest(jsonb_build_object('baseline_id', p_baseline, 'version', v_version, 'title', btrim(p_title), 'design_system_version', btrim(p_dsv), 'controlling_volume', 'V9',
                                                   'refines', to_jsonb(ARRAY['V0', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8']), 'scope', p_scope, 'members', v_members, 'principles', v_principles, 'exceptions', v_exceptions));
  INSERT INTO governance.design_baselines (baseline_id, version, title, design_system_version, conformance_scope, members, principles, exceptions, digest, proposed_by, correlation_id)
  VALUES (p_baseline, v_version, btrim(p_title), btrim(p_dsv), p_scope, v_members, v_principles, v_exceptions, v_digest, p_actor, p_corr);
  IF v_cur IS NULL THEN
    PERFORM governance.dg_artifact(p_baseline, 'baseline', 'DSB:' || p_baseline, btrim(p_title), NULL, NULL, NULL, 'design_system_authority', 'proposed',
                                   jsonb_build_object('class', 'design_baseline', 'baseline_version', v_version, 'state', 'proposed'), v_digest, p_actor, p_corr);
  END IF;
  PERFORM governance.ledger(NULL, NULL, 'design_baseline', p_baseline, v_version, 'design.baseline_proposed', p_actor, jsonb_build_object('digest', v_digest, 'members', jsonb_array_length(v_members)), p_corr);
  RETURN jsonb_build_object('baseline_id', p_baseline, 'version', v_version, 'state', 'proposed', 'digest', v_digest, 'members', v_members, 'principles', v_principles, 'exceptions', v_exceptions);
END $$;
REVOKE ALL ON FUNCTION governance.dg_propose_baseline(uuid, int, text, text, jsonb, uuid[], uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dg_propose_baseline(uuid, int, text, text, jsonb, uuid[], uuid, uuid) TO eye_commit;

/* What HOLDS a baseline's attestation (UX-01-005): a member whose version moved on, is not approved, or has no accountable owner; an
   exception it carries that has since expired. */
CREATE OR REPLACE FUNCTION governance.dg_baseline_blockers(p_baseline uuid, p_version int) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'key'), '[]'::jsonb) FROM (
    SELECT jsonb_build_object('key', m ->> 'key', 'class', CASE WHEN a.owner_principal_id IS NULL THEN 'ownership_gap' ELSE 'evidence_missing' END,
                              'reason', CASE WHEN a.asset_id IS NULL THEN format('%s v%s is no longer the current version', m ->> 'key', m ->> 'version')
                                             WHEN a.owner_principal_id IS NULL THEN format('%s has no accountable owner (REL-01)', m ->> 'key')
                                             ELSE format('%s is %s, not approved', m ->> 'key', a.status) END) AS x
      FROM governance.design_baselines b CROSS JOIN LATERAL jsonb_array_elements(b.members) m
      LEFT JOIN governance.design_assets a ON a.asset_id = (m ->> 'asset_id')::uuid AND a.version = (m ->> 'version')::int AND a.superseded_at IS NULL
     WHERE b.baseline_id = p_baseline AND b.version = p_version AND (a.asset_id IS NULL OR a.owner_principal_id IS NULL OR a.status NOT IN ('approved', 'deprecated'))
    UNION ALL
    SELECT jsonb_build_object('key', e ->> 'principle', 'class', 'exception_expired', 'reason', format('the exception on %s for %s expired at %s', e ->> 'asset_id', e ->> 'principle', e ->> 'expires_at'))
      FROM governance.design_baselines b CROSS JOIN LATERAL jsonb_array_elements(b.exceptions) e
     WHERE b.baseline_id = p_baseline AND b.version = p_version AND (e ->> 'expires_at')::timestamptz <= clock_timestamp()) q
$$;
REVOKE ALL ON FUNCTION governance.dg_baseline_blockers(uuid, int) FROM PUBLIC;

/* DECIDE a baseline version: ATTEST (the Design System Authority, a named human, never the proposer; SIGNED `baseline_decision` over the exact
   digest) or REJECT. An attestation with an unresolved member is HELD: the proposal preserved, governance.holds `ownership_gap` (or
   `exception_expired`) opened on the baseline, the blocking list answered (the route answers 409); the next attestation lifts it. The prior
   attested version is superseded; the members are linked `part_of` the baseline (members no longer present unlinked). */
CREATE OR REPLACE FUNCTION governance.dg_decide_baseline(p_baseline uuid, p_version int, p_decision text, p_digest text, p_reason text, p_signature uuid, p_actor uuid, p_corr uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, onboarding, public, pg_catalog, pg_temp AS $$
DECLARE b governance.design_baselines%ROWTYPE; v_blockers jsonb; v_hold uuid; m jsonb; l record;
BEGIN
  PERFORM governance.assert_platform('governance.design.baseline.decide', p_actor, 'design baseline');
  SELECT * INTO b FROM governance.design_baselines x WHERE x.baseline_id = p_baseline AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'design baseline rejected (unknown_baseline): no design baseline %/v%', p_baseline, p_version USING ERRCODE = '23503'; END IF;
  PERFORM governance.assert_approver('design baseline', p_actor, NULL, NULL, ARRAY['design_system_authority'], b.proposed_by, NULL,
            CASE p_decision WHEN 'reject' THEN 'rejecting a design baseline' ELSE 'attesting a design baseline' END);
  IF b.state <> 'proposed' THEN RAISE EXCEPTION 'design baseline rejected (state): version % is %', p_version, b.state USING ERRCODE = '23505'; END IF;
  IF p_digest IS DISTINCT FROM b.digest THEN RAISE EXCEPTION 'design baseline rejected (stale): the decision names a digest other than version %''s', p_version USING ERRCODE = '23505'; END IF;
  IF p_decision NOT IN ('attest', 'reject') THEN RAISE EXCEPTION 'design baseline rejected (decision): attest or reject' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'design baseline rejected (reason): a decision states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_decision = 'reject' THEN
    UPDATE governance.design_baselines SET state = 'rejected', decided_by = p_actor, decided_at = clock_timestamp(), decision_reason = btrim(p_reason) WHERE baseline_id = p_baseline AND version = p_version;
    PERFORM governance.ledger(NULL, NULL, 'design_baseline', p_baseline, p_version, 'design.baseline_rejected', p_actor, jsonb_build_object('reason', btrim(p_reason)), p_corr);
    RETURN jsonb_build_object('baseline_id', p_baseline, 'version', p_version, 'state', 'rejected', 'preserved', 'the attested baseline in force (if any) is unchanged');
  END IF;
  v_blockers := governance.dg_baseline_blockers(p_baseline, p_version);
  IF jsonb_array_length(v_blockers) > 0 THEN
    v_hold := governance.dg_hold(p_baseline, CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_blockers) x WHERE x ->> 'class' = 'ownership_gap') THEN 'ownership_gap'
                                                  WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_blockers) x WHERE x ->> 'class' = 'exception_expired') THEN 'exception_expired' ELSE 'evidence_missing' END,
                                 left(format('design baseline v%s held at attestation: %s', p_version, (SELECT string_agg(x ->> 'reason', '; ') FROM jsonb_array_elements(v_blockers) x)), 2000), NULL, NULL, p_actor, p_corr);
    PERFORM governance.ledger(NULL, NULL, 'design_baseline', p_baseline, p_version, 'design.baseline_held', p_actor, jsonb_build_object('blockers', v_blockers, 'hold_id', v_hold), p_corr);
    RETURN jsonb_build_object('baseline_id', p_baseline, 'version', p_version, 'state', 'proposed', 'held', true, 'blocking', v_blockers, 'hold_id', v_hold,
                              'preserved', 'the proposal is kept as proposed; the attested baseline in force (if any) is unchanged');
  END IF;
  IF NOT governance.dg_signature_ok(p_signature, 'baseline_decision', p_baseline, p_version, b.digest, p_actor, 'governance.design.baseline.decide') THEN
    RAISE EXCEPTION 'design baseline rejected (signature): an attestation carries the authority''s signature over the version''s digest' USING ERRCODE = '22023';
  END IF;
  UPDATE governance.design_baselines SET state = 'superseded' WHERE baseline_id = p_baseline AND state = 'attested';
  UPDATE governance.design_baselines SET state = 'attested', decided_by = p_actor, decided_at = clock_timestamp(), decision_reason = btrim(p_reason), signature_id = p_signature
   WHERE baseline_id = p_baseline AND version = p_version;
  PERFORM governance.dg_lift(p_baseline, format('version %s attested', p_version), p_actor);
  PERFORM governance.dg_artifact(p_baseline, 'baseline', 'DSB:' || p_baseline, b.title, NULL, NULL, p_actor, 'design_system_authority', 'active',
                                 jsonb_build_object('class', 'design_baseline', 'baseline_version', p_version, 'state', 'attested', 'design_system_version', b.design_system_version), b.digest, p_actor, p_corr);
  FOR m IN SELECT x FROM jsonb_array_elements(b.members) x LOOP
    PERFORM governance.dg_link((m ->> 'asset_id')::uuid, p_baseline, 'part_of', NULL, NULL, jsonb_build_object('baseline_version', p_version), p_actor, p_corr);
  END LOOP;
  FOR l IN SELECT x.link_id FROM governance.links_live x WHERE x.to_artifact = p_baseline AND x.relation = 'part_of'
              AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(b.members) m2 WHERE (m2 ->> 'asset_id')::uuid = x.from_artifact) LOOP
    PERFORM governance.dg_unlink(l.link_id, p_actor, p_corr);
  END LOOP;
  PERFORM governance.ledger(NULL, NULL, 'design_baseline', p_baseline, p_version, 'design.baseline_attested', p_actor, jsonb_build_object('digest', b.digest, 'signature_id', p_signature, 'reason', btrim(p_reason)), p_corr);
  RETURN jsonb_build_object('baseline_id', p_baseline, 'version', p_version, 'state', 'attested', 'digest', b.digest, 'signature_id', p_signature);
END $$;
REVOKE ALL ON FUNCTION governance.dg_decide_baseline(uuid, int, text, text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dg_decide_baseline(uuid, int, text, text, text, uuid, uuid, uuid) TO eye_commit;

-- §DG.10 THE TRACE (UX-08; REL-02) ──────────────────────────────────────────────────────────────────────────────────────────────────────────
/* RECORD (or retire) a design trace link: a design artifact implements a requirement, is verified by a test, covers a journey, is governed by
   a principle … Both ends are current artifacts and one of them is a design artifact (other trace links are §RG's). */
CREATE OR REPLACE FUNCTION governance.dg_record_link(p_from uuid, p_to uuid, p_relation text, p_retire uuid, p_actor uuid, p_corr uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE fa governance.artifacts%ROWTYPE; ta governance.artifacts%ROWTYPE; v uuid; l governance.links%ROWTYPE;
BEGIN
  PERFORM governance.assert_platform('governance.design.link.record', p_actor, 'design baseline');
  IF p_retire IS NOT NULL THEN
    SELECT * INTO l FROM governance.links_live x WHERE x.link_id = p_retire;
    IF NOT FOUND THEN RAISE EXCEPTION 'design baseline rejected (unknown_link): % is not a live link', p_retire USING ERRCODE = '23503'; END IF;
    IF coalesce(l.attributes ->> 'part', '') <> 'dg' THEN RAISE EXCEPTION 'design baseline rejected (scope): only a design trace link is retired here (others are §RG''s)' USING ERRCODE = '22023'; END IF;
    v := governance.dg_unlink(p_retire, p_actor, p_corr);
    PERFORM governance.ledger(NULL, NULL, 'design_link', p_retire, NULL, 'design.link_retired', p_actor, jsonb_build_object('retired_by', v), p_corr);
    RETURN jsonb_build_object('retired', p_retire, 'by', v);
  END IF;
  SELECT * INTO fa FROM governance.artifacts a WHERE a.artifact_id = p_from AND a.superseded_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'design baseline rejected (unknown_artifact): % is not a current artifact', p_from USING ERRCODE = '23503'; END IF;
  SELECT * INTO ta FROM governance.artifacts a WHERE a.artifact_id = p_to AND a.superseded_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'design baseline rejected (unknown_artifact): % is not a current artifact', p_to USING ERRCODE = '23503'; END IF;
  IF NOT (fa.kind IN ('design_component', 'pattern', 'design_asset', 'principle', 'baseline') OR ta.kind IN ('design_component', 'pattern', 'design_asset', 'principle', 'baseline')) THEN
    RAISE EXCEPTION 'design baseline rejected (scope): a design trace link has a design artifact at one end (other trace links are §RG''s)' USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_relation, '') NOT IN ('implements', 'verifies', 'covers', 'governs', 'evidences', 'depends_on', 'cites', 'consumes', 'part_of') THEN
    RAISE EXCEPTION 'design baseline rejected (relation): % is not a design trace relation', coalesce(p_relation, '<none>') USING ERRCODE = '22023';
  END IF;
  IF p_from = p_to THEN RAISE EXCEPTION 'design baseline rejected (relation): an artifact is not linked to itself' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM governance.links_live x WHERE x.from_artifact = p_from AND x.to_artifact = p_to AND x.relation = p_relation) THEN
    RAISE EXCEPTION 'design baseline rejected (duplicate): the link already exists' USING ERRCODE = '23505';
  END IF;
  v := governance.dg_link(p_from, p_to, p_relation, NULL, NULL, jsonb_build_object('from_kind', fa.kind, 'to_kind', ta.kind), p_actor, p_corr);
  PERFORM governance.ledger(NULL, NULL, 'design_link', v, NULL, 'design.link_recorded', p_actor, jsonb_build_object('from', p_from, 'to', p_to, 'relation', p_relation), p_corr);
  RETURN jsonb_build_object('link_id', v, 'from', p_from, 'to', p_to, 'relation', p_relation);
END $$;
REVOKE ALL ON FUNCTION governance.dg_record_link(uuid, uuid, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dg_record_link(uuid, uuid, text, uuid, uuid, uuid) TO eye_commit;

/* THE TRACE (an invoker read, the caller's RLS): from one artifact, BOTH directions over the live links, to a bounded depth — the nodes with
   their kind, key, lifecycle and version, the edges with their relation. */
CREATE OR REPLACE FUNCTION governance.dg_trace(p_artifact uuid, p_depth int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = governance, pg_catalog, pg_temp AS $$
  WITH RECURSIVE walk(id, depth, path) AS (
    SELECT p_artifact, 0, ARRAY[p_artifact]
    UNION
    SELECT CASE WHEN l.from_artifact = w.id THEN l.to_artifact ELSE l.from_artifact END, w.depth + 1,
           w.path || CASE WHEN l.from_artifact = w.id THEN l.to_artifact ELSE l.from_artifact END
      FROM walk w JOIN governance.links_live l ON (l.from_artifact = w.id OR l.to_artifact = w.id)
     WHERE w.depth < least(greatest(coalesce(p_depth, 2), 1), 4) AND NOT ((CASE WHEN l.from_artifact = w.id THEN l.to_artifact ELSE l.from_artifact END) = ANY (w.path))
  ), nodes AS (SELECT id, min(depth) AS depth FROM walk GROUP BY id)
  SELECT jsonb_build_object(
    'root', p_artifact,
    'nodes', coalesce((SELECT jsonb_agg(jsonb_build_object('artifact_id', n.id, 'depth', n.depth, 'kind', a.kind, 'key', a.external_key, 'title', a.title, 'lifecycle', a.lifecycle,
                                                          'version', a.version, 'scope', a.scope, 'known', a.artifact_id IS NOT NULL) ORDER BY n.depth, a.kind, a.external_key)
                         FROM nodes n LEFT JOIN governance.artifacts a ON a.artifact_id = n.id AND a.superseded_at IS NULL), '[]'::jsonb),
    'edges', coalesce((SELECT jsonb_agg(DISTINCT jsonb_build_object('link_id', l.link_id, 'from', l.from_artifact, 'to', l.to_artifact, 'relation', l.relation))
                         FROM governance.links_live l WHERE l.from_artifact IN (SELECT id FROM nodes) AND l.to_artifact IN (SELECT id FROM nodes)), '[]'::jsonb))
$$;
REVOKE ALL ON FUNCTION governance.dg_trace(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dg_trace(uuid, int) TO eye_app, eye_commit;

/* THE ORPHANS AND CONTRADICTIONS (an invoker read; UX-01-006, UX-08-005): a current design asset that implements no requirement; one without
   an accountable owner; a V9 design requirement (UX-* / REL-*) that no design artifact implements — when such requirements are registered (§RG
   imports them); a retired asset still part of an attested baseline; an approved exception that covers a superseded asset version. Stated,
   never hidden. */
CREATE OR REPLACE FUNCTION governance.dg_orphans() RETURNS jsonb
LANGUAGE sql STABLE SET search_path = governance, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'assets_without_requirement', coalesce((SELECT jsonb_agg(jsonb_build_object('asset_id', a.asset_id, 'key', a.asset_key, 'version', a.version) ORDER BY a.asset_key)
      FROM governance.design_assets a WHERE a.superseded_at IS NULL AND a.status <> 'retired'
       AND NOT EXISTS (SELECT 1 FROM governance.links_live l JOIN governance.artifacts r ON r.artifact_id = l.to_artifact AND r.superseded_at IS NULL AND r.kind = 'requirement'
                        WHERE l.from_artifact = a.asset_id AND l.relation IN ('implements', 'covers'))), '[]'::jsonb),
    'assets_without_owner', coalesce((SELECT jsonb_agg(jsonb_build_object('asset_id', a.asset_id, 'key', a.asset_key, 'version', a.version, 'status', a.status) ORDER BY a.asset_key)
      FROM governance.design_assets a WHERE a.superseded_at IS NULL AND a.status <> 'retired' AND a.owner_principal_id IS NULL), '[]'::jsonb),
    'requirements_without_design', coalesce((SELECT jsonb_agg(jsonb_build_object('artifact_id', r.artifact_id, 'key', r.external_key) ORDER BY r.external_key)
      FROM governance.artifacts r WHERE r.superseded_at IS NULL AND r.kind = 'requirement' AND (r.external_key LIKE 'V9:UX-%' OR r.external_key LIKE 'V9:REL-%')
       AND NOT EXISTS (SELECT 1 FROM governance.links_live l JOIN governance.artifacts d ON d.artifact_id = l.from_artifact AND d.superseded_at IS NULL
                                                             AND d.kind IN ('design_component', 'pattern', 'design_asset', 'principle', 'baseline')
                        WHERE l.to_artifact = r.artifact_id AND l.relation IN ('implements', 'covers'))), '[]'::jsonb),
    'contradictions', coalesce((SELECT jsonb_agg(x) FROM (
        SELECT jsonb_build_object('kind', 'retired_member', 'asset_id', a.asset_id, 'key', a.asset_key, 'baseline_id', b.baseline_id, 'baseline_version', b.version) AS x
          FROM governance.design_baselines b CROSS JOIN LATERAL jsonb_array_elements(b.members) m JOIN governance.design_assets a ON a.asset_id = (m ->> 'asset_id')::uuid AND a.superseded_at IS NULL
         WHERE b.state = 'attested' AND a.status = 'retired'
        UNION ALL
        SELECT jsonb_build_object('kind', 'exception_on_superseded_version', 'exception_id', x.exception_id, 'asset_id', x.asset_id, 'asset_version', x.asset_version)
          FROM governance.design_exceptions x WHERE x.state = 'approved' AND x.expires_at > clock_timestamp()
           AND NOT EXISTS (SELECT 1 FROM governance.design_assets a WHERE a.asset_id = x.asset_id AND a.version = x.asset_version AND a.superseded_at IS NULL)) q), '[]'::jsonb))
$$;
REVOKE ALL ON FUNCTION governance.dg_orphans() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dg_orphans() TO eye_app, eye_commit;

/* THE CONFORMANCE STATUS of the design system (a definer read over PLATFORM rows only — the vendor's design system, readable by every
   authenticated context; UX-01-001): WITHHELD with every reason (no attested baseline; a member
   without an approved owner; the latest lint evaluation nonconformant; an expired exception the baseline carries; an orphan or a
   contradiction) — or `no_blocking_finding`, which is NOT conformance: conformance is accepted only by a design acceptance record, per scope,
   by named humans. Nothing is shown conformant by inference. */
CREATE OR REPLACE FUNCTION governance.dg_conformance() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE b governance.design_baselines%ROWTYPE; v_reasons jsonb := '[]'::jsonb; e governance.design_evaluations%ROWTYPE; o jsonb; x jsonb;
BEGIN
  SELECT * INTO b FROM governance.design_baselines x0 WHERE x0.state = 'attested' ORDER BY x0.decided_at DESC LIMIT 1;
  IF NOT FOUND THEN v_reasons := v_reasons || jsonb_build_object('class', 'no_baseline', 'reason', 'no design baseline is attested');
  ELSE
    FOR x IN SELECT y FROM jsonb_array_elements(governance.dg_baseline_blockers(b.baseline_id, b.version)) y LOOP
      v_reasons := v_reasons || jsonb_build_object('class', x ->> 'class', 'reason', x ->> 'reason');
    END LOOP;
  END IF;
  SELECT * INTO e FROM governance.design_evaluations x1 WHERE x1.source = 'lint' ORDER BY x1.evaluated_at DESC LIMIT 1;
  IF NOT FOUND THEN v_reasons := v_reasons || jsonb_build_object('class', 'unevaluated', 'reason', 'the web source has not been evaluated against the principles (no lint run)');
  ELSIF e.verdict = 'nonconformant' THEN v_reasons := v_reasons || jsonb_build_object('class', 'nonconformant', 'reason', format('the latest lint run has %s open finding(s)', e.counts ->> 'open'));
  END IF;
  o := governance.dg_orphans();
  IF jsonb_array_length(o -> 'assets_without_owner') > 0 THEN
    v_reasons := v_reasons || jsonb_build_object('class', 'ownership_gap', 'reason', format('%s design asset(s) have no accountable owner', jsonb_array_length(o -> 'assets_without_owner')));
  END IF;
  IF jsonb_array_length(o -> 'assets_without_requirement') > 0 THEN
    v_reasons := v_reasons || jsonb_build_object('class', 'orphan', 'reason', format('%s design asset(s) trace to no requirement', jsonb_array_length(o -> 'assets_without_requirement')));
  END IF;
  IF jsonb_array_length(o -> 'requirements_without_design') > 0 THEN
    v_reasons := v_reasons || jsonb_build_object('class', 'orphan', 'reason', format('%s registered design requirement(s) have no implementing design artifact', jsonb_array_length(o -> 'requirements_without_design')));
  END IF;
  IF jsonb_array_length(o -> 'contradictions') > 0 THEN
    v_reasons := v_reasons || jsonb_build_object('class', 'contradiction', 'reason', format('%s contradiction(s) in the design trace', jsonb_array_length(o -> 'contradictions')));
  END IF;
  RETURN jsonb_build_object('state', CASE WHEN jsonb_array_length(v_reasons) = 0 THEN 'no_blocking_finding' ELSE 'withheld' END, 'reasons', v_reasons,
                            'baseline', CASE WHEN b.baseline_id IS NULL THEN NULL ELSE jsonb_build_object('baseline_id', b.baseline_id, 'version', b.version, 'digest', b.digest, 'title', b.title,
                                                                                                          'design_system_version', b.design_system_version, 'attested_at', b.decided_at) END,
                            'latest_lint', CASE WHEN e.evaluation_id IS NULL THEN NULL ELSE jsonb_build_object('evaluation_id', e.evaluation_id, 'verdict', e.verdict, 'counts', e.counts, 'at', e.evaluated_at) END,
                            'note', 'conformance is accepted only by a design acceptance record for a declared scope, attested by named humans — never inferred from the absence of findings',
                            'as_of', clock_timestamp());
END $$;
REVOKE ALL ON FUNCTION governance.dg_conformance() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dg_conformance() TO eye_app, eye_commit;

-- §DG.11 DESIGN ACCEPTANCE (UX-ADR-023; REL-24; DOMAIN) ────────────────────────────────────────────────────────────────────────────────────
/* The role each obligation is attested by. */
CREATE OR REPLACE FUNCTION governance.dg_obligation_roles(p_obligation text) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE p_obligation WHEN 'design' THEN ARRAY['design_system_authority'] WHEN 'assurance' THEN ARRAY['independent_assurance'] WHEN 'customer' THEN ARRAY['customer_sponsor'] END
$$;
GRANT EXECUTE ON FUNCTION governance.dg_obligation_roles(text) TO eye_app, eye_commit;

/* The accessibility slots every design acceptance carries — EMPTY: MET-034 is unsupported (B108 is its source, H3 its verification). */
CREATE OR REPLACE FUNCTION governance.dg_accessibility_slots() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('status', 'unsupported', 'metric', 'MET-034', 'carrier', 'B108 (source) → H3',
    'slots', jsonb_build_array(jsonb_build_object('kind', 'automated_journey_checks', 'status', 'empty'), jsonb_build_object('kind', 'manual_review', 'status', 'empty'),
                               jsonb_build_object('kind', 'assistive_technology_journeys', 'status', 'empty')),
    'note', 'no accessibility result is computed, inferred or claimed here; the slots are filled when B108''s suites record journey results')
$$;
GRANT EXECUTE ON FUNCTION governance.dg_accessibility_slots() TO eye_app, eye_commit;

/* PROPOSE a design acceptance record version (the conformance steward, the domain admin — never an approval): the EXACT tuple — the attested
   baseline (version, digest), component and pattern versions that are members of it, the scope tuple, evidence items with their windows,
   findings, conditions, the obligations (design and assurance always; customer when the customer accepts too) and the declared builders (the
   proposers and builders of the contributions that produced the bound versions are added). One open proposal per record. */
CREATE OR REPLACE FUNCTION governance.dg_propose_acceptance(p_acceptance uuid, p_tenant uuid, p_domain uuid, p_expected_version int, p_baseline uuid, p_components uuid[], p_tuple jsonb,
                                                           p_evidence jsonb, p_findings jsonb, p_conditions jsonb, p_obligations text[], p_builders uuid[], p_actor uuid, p_corr uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, observation, public, pg_catalog, pg_temp AS $$
DECLARE b governance.design_baselines%ROWTYPE; v_components jsonb; k text; e jsonb; v_cur int; v_version int; v_digest text; v_valid timestamptz; v_builders uuid[]; v_missing uuid;
        v_obl text[] := coalesce(p_obligations, ARRAY['design', 'assurance']);
BEGIN
  PERFORM observation.assert_authority(ARRAY['governance.design.acceptance.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'design acceptance rejected (actor): the act is recorded under the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO b FROM governance.design_baselines x WHERE x.baseline_id = p_baseline AND x.state = 'attested';
  IF NOT FOUND THEN RAISE EXCEPTION 'design acceptance rejected (state): % has no attested version — a design acceptance binds an attested baseline', p_baseline USING ERRCODE = '23505'; END IF;
  IF p_components IS NULL OR cardinality(p_components) = 0 THEN RAISE EXCEPTION 'design acceptance rejected (components): the record names the component and pattern versions it accepts' USING ERRCODE = '22023'; END IF;
  SELECT c INTO v_missing FROM unnest(p_components) c WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(b.members) m WHERE (m ->> 'asset_id')::uuid = c) LIMIT 1;
  IF v_missing IS NOT NULL THEN RAISE EXCEPTION 'design acceptance rejected (scope): % is not a member of the attested baseline v%', v_missing, b.version USING ERRCODE = '22023'; END IF;
  SELECT jsonb_agg(m ORDER BY m ->> 'key') INTO v_components FROM jsonb_array_elements(b.members) m WHERE (m ->> 'asset_id')::uuid = ANY (p_components);
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_components) m WHERE NOT EXISTS (SELECT 1 FROM governance.design_assets a WHERE a.asset_id = (m ->> 'asset_id')::uuid AND a.version = (m ->> 'version')::int AND a.superseded_at IS NULL)) THEN
    RAISE EXCEPTION 'design acceptance rejected (stale): a bound component version moved on since baseline v% — attest the next baseline first', b.version USING ERRCODE = '23505';
  END IF;
  IF jsonb_typeof(p_tuple) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'design acceptance rejected (tuple): the scope tuple is an object' USING ERRCODE = '22023'; END IF;
  FOREACH k IN ARRAY ARRAY['capability', 'journey', 'persona', 'role', 'deployment_profile', 'theme', 'locale', 'device'] LOOP
    IF length(btrim(coalesce(p_tuple ->> k, ''))) < 2 THEN RAISE EXCEPTION 'design acceptance rejected (tuple): the tuple names its % (UX-ADR-023: acceptance is exact)', k USING ERRCODE = '22023'; END IF;
  END LOOP;
  FOR k IN SELECT jsonb_object_keys(p_tuple) LOOP
    IF k NOT IN ('capability', 'journey', 'persona', 'role', 'deployment_profile', 'theme', 'locale', 'device', 'entitlement', 'assistive_technology', 'configuration_digest',
                 'data_versions', 'model_versions', 'period_from', 'period_to') THEN
      RAISE EXCEPTION 'design acceptance rejected (tuple): % is not a dimension of the design tuple', k USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF (p_tuple ->> 'deployment_profile') NOT IN ('local-dev', 'saas', 'private-cloud', 'on-premise') THEN
    RAISE EXCEPTION 'design acceptance rejected (tuple): % is not a deployment profile', p_tuple ->> 'deployment_profile' USING ERRCODE = '22023';
  END IF;
  IF p_tuple ? 'configuration_digest' AND coalesce(p_tuple ->> 'configuration_digest', '') !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'design acceptance rejected (tuple): the configuration digest is 64 hex' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_evidence) IS DISTINCT FROM 'array' OR jsonb_array_length(p_evidence) NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'design acceptance rejected (evidence): a record binds 1–50 evidence items' USING ERRCODE = '22023';
  END IF;
  FOR e IN SELECT x FROM jsonb_array_elements(p_evidence) x LOOP
    IF length(coalesce(e ->> 'kind', '')) < 3 OR length(coalesce(e ->> 'ref', '')) < 3 OR coalesce(e ->> 'digest', '') !~ '^[0-9a-f]{64}$'
       OR (e ->> 'capturedAt') IS NULL OR (e ->> 'validUntil') IS NULL THEN
      RAISE EXCEPTION 'design acceptance rejected (evidence): each item names its kind, reference, digest (64 hex), capturedAt and validUntil' USING ERRCODE = '22023';
    END IF;
    IF (e ->> 'capturedAt')::timestamptz > clock_timestamp() OR (e ->> 'validUntil')::timestamptz <= (e ->> 'capturedAt')::timestamptz THEN
      RAISE EXCEPTION 'design acceptance rejected (evidence): % was captured in the future or is valid for no time', e ->> 'ref' USING ERRCODE = '22023';
    END IF;
    IF (e ->> 'validUntil')::timestamptz <= clock_timestamp() THEN
      RAISE EXCEPTION 'design acceptance rejected (expired): the evidence % expired at % — renew it before it is bound', e ->> 'ref', e ->> 'validUntil' USING ERRCODE = '23505';
    END IF;
  END LOOP;
  IF jsonb_typeof(coalesce(p_findings, '[]'::jsonb)) <> 'array' OR jsonb_typeof(coalesce(p_conditions, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'design acceptance rejected (findings): findings and conditions are lists' USING ERRCODE = '22023';
  END IF;
  IF NOT (v_obl @> ARRAY['design', 'assurance'] AND v_obl <@ ARRAY['design', 'assurance', 'customer']) THEN
    RAISE EXCEPTION 'design acceptance rejected (obligations): design and assurance always (one role never accepts all — ES-71-002), customer when the customer accepts' USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(DISTINCT u) INTO v_builders FROM (
    SELECT unnest(coalesce(p_builders, '{}')) u
    UNION SELECT unnest(c.builders) FROM governance.design_contributions c
            JOIN governance.design_assets a ON a.contribution_id = c.contribution_id
            JOIN jsonb_array_elements(v_components) m ON a.asset_id = (m ->> 'asset_id')::uuid AND a.version = (m ->> 'version')::int
    UNION SELECT c.proposed_by FROM governance.design_contributions c
            JOIN governance.design_assets a ON a.contribution_id = c.contribution_id
            JOIN jsonb_array_elements(v_components) m ON a.asset_id = (m ->> 'asset_id')::uuid AND a.version = (m ->> 'version')::int) q WHERE u IS NOT NULL;
  SELECT max(x.version) INTO v_cur FROM governance.design_acceptances x WHERE x.acceptance_id = p_acceptance;
  IF v_cur IS NOT NULL AND NOT EXISTS (SELECT 1 FROM governance.design_acceptances x WHERE x.acceptance_id = p_acceptance AND x.tenant_id = p_tenant AND x.domain_id = p_domain) THEN
    RAISE EXCEPTION 'design acceptance rejected (unknown_acceptance): % is not a design acceptance record of this domain', p_acceptance USING ERRCODE = '23503';
  END IF;
  IF coalesce(p_expected_version, -1) <> coalesce(v_cur, 0) THEN
    RAISE EXCEPTION 'design acceptance rejected (stale): the record is at version %, not %', coalesce(v_cur, 0), coalesce(p_expected_version::text, '<none>') USING ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM governance.design_acceptances x WHERE x.acceptance_id = p_acceptance AND x.state = 'proposed') THEN
    RAISE EXCEPTION 'design acceptance rejected (state): a proposed version awaits its attestations' USING ERRCODE = '23505';
  END IF;
  v_version := coalesce(v_cur, 0) + 1;
  SELECT min((x ->> 'validUntil')::timestamptz) INTO v_valid FROM jsonb_array_elements(p_evidence) x;
  v_digest := governance.digest(jsonb_build_object('acceptance_id', p_acceptance, 'version', v_version, 'tenant_id', p_tenant, 'domain_id', p_domain, 'kind', 'design',
                                                   'baseline', jsonb_build_object('baseline_id', b.baseline_id, 'version', b.version, 'digest', b.digest), 'components', v_components, 'tuple', p_tuple,
                                                   'evidence', p_evidence, 'findings', coalesce(p_findings, '[]'::jsonb), 'conditions', coalesce(p_conditions, '[]'::jsonb),
                                                   'accessibility', governance.dg_accessibility_slots(), 'obligations', to_jsonb(v_obl), 'builders', to_jsonb(coalesce(v_builders, '{}')),
                                                   'valid_until', v_valid, 'claim', 'demonstration'));
  INSERT INTO governance.design_acceptances (acceptance_id, version, tenant_id, domain_id, baseline_id, baseline_version, baseline_digest, components, tuple, evidence, findings, conditions,
                                             accessibility, obligations, builders, valid_until, digest, proposed_by, correlation_id)
  VALUES (p_acceptance, v_version, p_tenant, p_domain, b.baseline_id, b.version, b.digest, v_components, p_tuple, p_evidence, coalesce(p_findings, '[]'::jsonb), coalesce(p_conditions, '[]'::jsonb),
          governance.dg_accessibility_slots(), v_obl, coalesce(v_builders, '{}'), v_valid, v_digest, p_actor, p_corr);
  PERFORM governance.dg_artifact(p_acceptance, 'acceptance_record', 'DAC:' || p_acceptance, format('Design acceptance: %s · %s (SYNTHETIC demonstration record)', p_tuple ->> 'capability', p_tuple ->> 'journey'),
                                 p_tenant, p_domain, NULL, NULL, 'proposed', jsonb_build_object('kind', 'design', 'record_version', v_version, 'state', 'proposed', 'claim', 'demonstration'), v_digest, p_actor, p_corr);
  PERFORM governance.ledger(p_tenant, p_domain, 'design_acceptance', p_acceptance, v_version, 'design.acceptance_proposed', p_actor,
            jsonb_build_object('digest', v_digest, 'baseline_version', b.version, 'obligations', to_jsonb(v_obl), 'valid_until', v_valid), p_corr);
  RETURN jsonb_build_object('acceptance_id', p_acceptance, 'version', v_version, 'state', 'proposed', 'digest', v_digest, 'valid_until', v_valid, 'obligations', to_jsonb(v_obl),
                            'builders', to_jsonb(coalesce(v_builders, '{}')), 'components', v_components, 'claim', 'demonstration');
END $$;
REVOKE ALL ON FUNCTION governance.dg_propose_acceptance(uuid, uuid, uuid, int, uuid, uuid[], jsonb, jsonb, jsonb, jsonb, text[], uuid[], uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dg_propose_acceptance(uuid, uuid, uuid, int, uuid, uuid[], jsonb, jsonb, jsonb, jsonb, text[], uuid[], uuid, uuid) TO eye_commit;

/* ATTEST one obligation of a proposed design acceptance version (human-gated; SIGNED executive.signatures `design_acceptance`): the obligation's
   role, a named active HUMAN, never the proposer, never a builder, never an agent; a DISTINCT human per obligation (one person never accepts
   two obligations — ES-71-002); on the exact digest; refused once any evidence item expired (`expired`) or a bound version moved on (`stale`).
   ACCEPTED when every obligation is signed (the prior accepted version superseded; the components linked `accepted_in`). */
CREATE OR REPLACE FUNCTION governance.dg_attest_acceptance(p_acceptance uuid, p_version int, p_tenant uuid, p_domain uuid, p_obligation text, p_digest text, p_reason text, p_signature uuid,
                                                          p_actor uuid, p_corr uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, executive, observation, public, pg_catalog, pg_temp AS $$
DECLARE r governance.design_acceptances%ROWTYPE; v_att jsonb; v_done boolean; m jsonb; v_role text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['governance.design.acceptance.attest']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'design acceptance rejected (actor): the act is recorded under the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM governance.design_acceptances x WHERE x.acceptance_id = p_acceptance AND x.version = p_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'design acceptance rejected (unknown_acceptance): no design acceptance %/v% in this domain', p_acceptance, p_version USING ERRCODE = '23503'; END IF;
  IF p_obligation IS NULL OR NOT (p_obligation = ANY (r.obligations)) THEN
    RAISE EXCEPTION 'design acceptance rejected (obligation): % is not an obligation of this record (%)', coalesce(p_obligation, '<none>'), array_to_string(r.obligations, ', ') USING ERRCODE = '22023';
  END IF;
  PERFORM governance.assert_approver('design acceptance', p_actor, p_tenant, p_domain, governance.dg_obligation_roles(p_obligation), r.proposed_by, r.builders,
                                     format('attesting the %s obligation of a design acceptance', p_obligation));
  IF r.state <> 'proposed' THEN RAISE EXCEPTION 'design acceptance rejected (state): version % is %', p_version, r.state USING ERRCODE = '23505'; END IF;
  IF p_digest IS DISTINCT FROM r.digest THEN RAISE EXCEPTION 'design acceptance rejected (stale): the attestation names a digest other than version %''s', p_version USING ERRCODE = '23505'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'design acceptance rejected (reason): an attestation states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(r.attestations) a WHERE a ->> 'obligation' = p_obligation) THEN
    RAISE EXCEPTION 'design acceptance rejected (duplicate): the % obligation is already attested', p_obligation USING ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(r.attestations) a WHERE (a ->> 'principal')::uuid = p_actor) THEN
    RAISE EXCEPTION 'design acceptance rejected (separation_of_duties): one person attests one obligation — a distinct named human per obligation (ES-71-002)' USING ERRCODE = '42501';
  END IF;
  IF r.valid_until <= clock_timestamp() OR EXISTS (SELECT 1 FROM jsonb_array_elements(r.evidence) e WHERE (e ->> 'validUntil')::timestamptz <= clock_timestamp()) THEN
    RAISE EXCEPTION 'design acceptance rejected (expired): bound evidence expired at % — propose the next version over renewed evidence', r.valid_until USING ERRCODE = '23505';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM governance.design_baselines b WHERE b.baseline_id = r.baseline_id AND b.version = r.baseline_version AND b.state = 'attested')
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(r.components) c WHERE NOT EXISTS (SELECT 1 FROM governance.design_assets a WHERE a.asset_id = (c ->> 'asset_id')::uuid AND a.version = (c ->> 'version')::int AND a.superseded_at IS NULL)) THEN
    RAISE EXCEPTION 'design acceptance rejected (stale): the bound baseline or a bound component version is no longer current' USING ERRCODE = '23505';
  END IF;
  IF p_signature IS NULL OR NOT EXISTS (SELECT 1 FROM executive.signatures s WHERE s.signature_id = p_signature AND s.subject_kind = 'design_acceptance' AND s.subject_id = p_acceptance
                                                 AND s.subject_version = p_version AND s.subject_digest = r.digest AND s.signer = p_actor AND s.bound_action = 'governance.design.acceptance.attest') THEN
    RAISE EXCEPTION 'design acceptance rejected (signature): an attestation carries the attester''s signature over the record''s digest' USING ERRCODE = '22023';
  END IF;
  v_role := (governance.dg_obligation_roles(p_obligation))[1];
  v_att := r.attestations || jsonb_build_object('obligation', p_obligation, 'principal', p_actor, 'role', v_role, 'signature_id', p_signature, 'reason', btrim(p_reason), 'at', clock_timestamp());
  v_done := (SELECT bool_and(EXISTS (SELECT 1 FROM jsonb_array_elements(v_att) a WHERE a ->> 'obligation' = o)) FROM unnest(r.obligations) o);
  IF v_done THEN
    UPDATE governance.design_acceptances SET state = 'superseded' WHERE acceptance_id = p_acceptance AND state IN ('accepted', 'withheld');
  END IF;
  UPDATE governance.design_acceptances SET attestations = v_att, state = CASE WHEN v_done THEN 'accepted' ELSE 'proposed' END, accepted_at = CASE WHEN v_done THEN clock_timestamp() END
   WHERE acceptance_id = p_acceptance AND version = p_version;
  IF v_done THEN
    PERFORM governance.dg_artifact(p_acceptance, 'acceptance_record', 'DAC:' || p_acceptance, format('Design acceptance: %s · %s (SYNTHETIC demonstration record)', r.tuple ->> 'capability', r.tuple ->> 'journey'),
                                   p_tenant, p_domain, NULL, NULL, 'active', jsonb_build_object('kind', 'design', 'record_version', p_version, 'state', 'accepted', 'claim', 'demonstration'), r.digest, p_actor, p_corr);
    FOR m IN SELECT x FROM jsonb_array_elements(r.components) x LOOP
      PERFORM governance.dg_link((m ->> 'asset_id')::uuid, p_acceptance, 'accepted_in', p_tenant, p_domain, jsonb_build_object('asset_version', m -> 'version', 'record_version', p_version), p_actor, p_corr);
    END LOOP;
    PERFORM executive.b33_close_items(p_tenant, p_domain, 'governance.acceptance', 'acceptance_record', p_acceptance, format('design acceptance v%s accepted by every obligation', p_version), p_actor, p_corr);
  END IF;
  PERFORM governance.ledger(p_tenant, p_domain, 'design_acceptance', p_acceptance, p_version, CASE WHEN v_done THEN 'design.acceptance_accepted' ELSE 'design.acceptance_attested' END, p_actor,
            jsonb_build_object('obligation', p_obligation, 'signature_id', p_signature, 'remaining', (SELECT to_jsonb(array_agg(o ORDER BY i)) FROM unnest(r.obligations) WITH ORDINALITY u(o, i)
                                                                                                         WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_att) a WHERE a ->> 'obligation' = u.o))), p_corr);
  RETURN jsonb_build_object('acceptance_id', p_acceptance, 'version', p_version, 'state', CASE WHEN v_done THEN 'accepted' ELSE 'proposed' END, 'attestations', v_att,
                            'remaining', (SELECT coalesce(to_jsonb(array_agg(u.o ORDER BY u.i)), '[]'::jsonb) FROM unnest(r.obligations) WITH ORDINALITY u(o, i)
                                         WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_att) a WHERE a ->> 'obligation' = u.o)),
                            'claim', 'demonstration');
END $$;
REVOKE ALL ON FUNCTION governance.dg_attest_acceptance(uuid, int, uuid, uuid, text, text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dg_attest_acceptance(uuid, int, uuid, uuid, text, text, text, uuid, uuid, uuid) TO eye_commit;

/* THE SWEEP (the attention tick's step, executive.attention.tick; DOMAIN): an ACCEPTED design acceptance whose evidence expired, whose window
   ended, whose baseline version is no longer the attested one or whose bound component version moved on is WITHHELD (conformance withheld;
   what was accepted is kept and shown — the prior accepted baseline preserved; only a new version over renewed evidence accepts again) and
   raises `governance.acceptance` attention. Nothing withheld → nothing written. */
CREATE OR REPLACE FUNCTION governance.dg_sweep_acceptances(p_tenant uuid, p_domain uuid, p_actor uuid, p_corr uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, executive, observation, public, pg_catalog, pg_temp AS $$
DECLARE r governance.design_acceptances%ROWTYPE; v_reasons jsonb; v_out jsonb := '[]'::jsonb; v_event uuid; v_item jsonb; v_checked int := 0;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  FOR r IN SELECT * FROM governance.design_acceptances x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'accepted' ORDER BY x.acceptance_id FOR UPDATE LOOP
    v_checked := v_checked + 1;
    SELECT coalesce(jsonb_agg(y), '[]'::jsonb) INTO v_reasons FROM (
      SELECT format('evidence %s expired at %s', e ->> 'ref', e ->> 'validUntil') AS y FROM jsonb_array_elements(r.evidence) e WHERE (e ->> 'validUntil')::timestamptz <= clock_timestamp()
      UNION ALL SELECT format('the acceptance window ended at %s', r.valid_until) WHERE r.valid_until <= clock_timestamp()
        AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r.evidence) e WHERE (e ->> 'validUntil')::timestamptz <= clock_timestamp())
      UNION ALL SELECT format('design baseline v%s is no longer the attested version', r.baseline_version)
       WHERE NOT EXISTS (SELECT 1 FROM governance.design_baselines b WHERE b.baseline_id = r.baseline_id AND b.version = r.baseline_version AND b.state = 'attested')
      UNION ALL SELECT format('%s v%s was superseded', c ->> 'key', c ->> 'version') FROM jsonb_array_elements(r.components) c
       WHERE NOT EXISTS (SELECT 1 FROM governance.design_assets a WHERE a.asset_id = (c ->> 'asset_id')::uuid AND a.version = (c ->> 'version')::int AND a.superseded_at IS NULL)) q;
    CONTINUE WHEN jsonb_array_length(v_reasons) = 0;
    UPDATE governance.design_acceptances SET state = 'withheld', withheld_at = clock_timestamp(),
           withheld_reason = left('conformance withheld: ' || (SELECT string_agg(z, '; ') FROM jsonb_array_elements_text(v_reasons) z), 2000)
     WHERE acceptance_id = r.acceptance_id AND version = r.version;
    v_event := governance.ledger(p_tenant, p_domain, 'design_acceptance', r.acceptance_id, r.version, 'design.acceptance_withheld', p_actor, jsonb_build_object('reasons', v_reasons), p_corr);
    PERFORM governance.dg_artifact(r.acceptance_id, 'acceptance_record', 'DAC:' || r.acceptance_id, format('Design acceptance: %s · %s (SYNTHETIC demonstration record)', r.tuple ->> 'capability', r.tuple ->> 'journey'),
                                   p_tenant, p_domain, NULL, NULL, 'quarantined', jsonb_build_object('kind', 'design', 'record_version', r.version, 'state', 'withheld', 'claim', 'demonstration'), r.digest, p_actor, p_corr);
    v_item := executive.b33_raise_routed(p_tenant, p_domain, 'governance.acceptance', 'acceptance_record', r.acceptance_id,
                left(format('Design acceptance withheld: %s · %s — %s', r.tuple ->> 'capability', r.tuple ->> 'journey', v_reasons ->> 0), 500), v_reasons, r.proposed_by, v_event,
                'design_acceptance.withheld', jsonb_build_object('record_version', r.version, 'part', 'dg'), NULL, p_actor, p_corr);
    v_out := v_out || jsonb_build_object('acceptance_id', r.acceptance_id, 'version', r.version, 'reasons', v_reasons, 'item', v_item);
  END LOOP;
  RETURN jsonb_build_object('checked', v_checked, 'withheld', v_out);
END $$;
REVOKE ALL ON FUNCTION governance.dg_sweep_acceptances(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dg_sweep_acceptances(uuid, uuid, uuid, uuid) TO eye_commit;

-- §DG.12 B92's TELEMETRY GOVERNANCE AS EVIDENCE (REL-23) AND THE INDEPENDENT CONFORMANCE PACKAGE (UX-70-006, UX-66-006) ─────────────────────
/* REL-23 — the domain's telemetry governance, bound by reference as design evidence: purpose (the approved purposes and their privacy-officer
   decisions), consent (current grants / withdrawals per purpose — counts only), lineage (each approved event definition → journey step →
   purpose), coverage (journey steps with an approved definition), privacy review (who decided, when), metric governance (the metric
   definitions by state; MET-034's own row says `unsupported`). Each item: kind, id, digest, captured_at. A guarded definer read (N-01). */
CREATE OR REPLACE FUNCTION governance.dg_telemetry_evidence(p_tenant uuid, p_domain uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = governance, analytics, observation, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the telemetry governance evidence');
  RETURN jsonb_build_object(
    'purposes', coalesce((SELECT jsonb_agg(jsonb_build_object('kind', 'telemetry_purpose', 'id', p.purpose_id, 'key', p.purpose_key, 'version', p.version, 'purpose_kind', p.purpose_kind,
        'retention_days', p.retention_days, 'state', p.state, 'privacy_review', jsonb_build_object('decided_by', p.decided_by, 'decided_at', p.decided_at), 'digest', p.digest, 'captured_at', p.decided_at)
        ORDER BY p.purpose_key, p.version) FROM analytics.purposes p WHERE p.tenant_id = p_tenant AND p.domain_id = p_domain AND p.state IN ('approved', 'retired')), '[]'::jsonb),
    'consent', coalesce((SELECT jsonb_agg(jsonb_build_object('purpose_key', q.purpose_key, 'granted', q.granted, 'withdrawn', q.withdrawn) ORDER BY q.purpose_key) FROM (
        SELECT l.purpose_key, count(*) FILTER (WHERE l.decision = 'granted') AS granted, count(*) FILTER (WHERE l.decision = 'withdrawn') AS withdrawn
          FROM (SELECT DISTINCT ON (c.principal_id, c.purpose_key) c.purpose_key, c.decision FROM analytics.consents c WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain
                 ORDER BY c.principal_id, c.purpose_key, c.recorded_at DESC) l GROUP BY l.purpose_key) q), '[]'::jsonb),
    'lineage', coalesce((SELECT jsonb_agg(jsonb_build_object('kind', 'telemetry_definition', 'id', d.definition_id, 'event_key', d.event_key, 'version', d.version, 'journey_key', d.journey_key,
        'step_key', d.step_key, 'purpose_key', d.purpose_key, 'retention_days', d.retention_days, 'collection', d.collection, 'privacy_review', jsonb_build_object('decided_by', d.decided_by, 'decided_at', d.decided_at),
        'digest', d.digest, 'captured_at', d.decided_at) ORDER BY d.event_key) FROM analytics.telemetry_definitions d WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.state = 'approved'), '[]'::jsonb),
    'coverage', coalesce((SELECT jsonb_agg(jsonb_build_object('journey_key', j.journey_key, 'version', j.version,
        'steps', coalesce(cardinality(j.steps), 0),
        'steps_instrumented', (SELECT count(DISTINCT d.step_key) FROM analytics.telemetry_definitions d WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.state = 'approved' AND d.journey_key = j.journey_key))
        ORDER BY j.journey_key) FROM analytics.experience_journeys j WHERE j.tenant_id = p_tenant AND j.domain_id = p_domain AND j.state = 'active'), '[]'::jsonb),
    'metric_governance', jsonb_build_object(
        'by_state', coalesce((SELECT jsonb_object_agg(s.state, s.n) FROM (SELECT m.state, count(*) AS n FROM analytics.metric_definitions m WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain GROUP BY m.state) s), '{}'::jsonb),
        'met_034', (SELECT jsonb_build_object('metric_key', m.metric_key, 'version', m.version, 'state', m.state, 'supported', m.supported, 'unsupported_reason', m.unsupported_reason, 'digest', m.digest)
                      FROM analytics.metric_definitions m WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain AND m.metric_key = 'MET-034' ORDER BY m.version DESC LIMIT 1)),
    'experience', jsonb_build_object(
        'findings', (SELECT count(*) FROM analytics.experience_findings f WHERE f.tenant_id = p_tenant AND f.domain_id = p_domain),
        'actions', coalesce((SELECT jsonb_agg(jsonb_build_object('kind', 'experience_action', 'id', a.action_id, 'action_kind', a.kind, 'decision', a.decision, 'digest', a.preview_digest, 'captured_at', a.decided_at)
                              ORDER BY a.decided_at) FROM analytics.experience_actions a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain), '[]'::jsonb)),
    'read_at', clock_timestamp());
END $$;
REVOKE ALL ON FUNCTION governance.dg_telemetry_evidence(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dg_telemetry_evidence(uuid, uuid) TO eye_app, eye_commit;

/* An evidence item with its AGE (days since captured, on the database clock). */
CREATE OR REPLACE FUNCTION governance.dg_aged(p_kind text, p_id uuid, p_digest text, p_captured timestamptz, p_extra jsonb) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('kind', p_kind, 'id', p_id, 'digest', p_digest, 'captured_at', p_captured,
                            'age_days', CASE WHEN p_captured IS NULL THEN NULL ELSE round((extract(epoch FROM clock_timestamp() - p_captured) / 86400)::numeric, 1) END) || coalesce(p_extra, '{}'::jsonb)
$$;
REVOKE ALL ON FUNCTION governance.dg_aged(text, uuid, text, timestamptz, jsonb) FROM PUBLIC;

/* GENERATE the INDEPENDENT CONFORMANCE PACKAGE (the conformance steward, independent assurance, the tenant's auditor; DOMAIN): for UX-70-006
   (B92's experience-quality workflow: telemetry governance, journeys, findings and their actions) or UX-66-006 (B94's onboarding and
   migration: acceptances, the go-live decision, admission records, value reviews) — the EXACT design tuple (a design acceptance record's,
   or the attested baseline's), the evidence by reference with its AGE, and the FINDINGS (open lint findings, expired evidence, unattested
   obligations, withheld acceptance, open and expired design exceptions, orphans and contradictions, MET-034 unsupported). Digested and kept;
   LEFT UNSIGNED — the signed acceptance by named independent authorities is R2's, outside the product. */
CREATE OR REPLACE FUNCTION governance.dg_generate_package(p_package uuid, p_tenant uuid, p_domain uuid, p_target text, p_acceptance uuid, p_actor uuid, p_corr uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, analytics, onboarding, implementation, service, observation, public, pg_catalog, pg_temp AS $$
DECLARE r governance.design_acceptances%ROWTYPE; b governance.design_baselines%ROWTYPE; v_tuple jsonb; v_evidence jsonb := '[]'::jsonb; v_findings jsonb := '[]'::jsonb; v_content jsonb; v_digest text;
        v_tel jsonb; e governance.design_evaluations%ROWTYPE; o jsonb; x jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['governance.design.package.generate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'conformance package rejected (actor): the act is recorded under the acting principal' USING ERRCODE = '42501'; END IF;
  IF coalesce(p_target, '') NOT IN ('UX-70-006', 'UX-66-006') THEN RAISE EXCEPTION 'conformance package rejected (target): the package is for UX-70-006 or UX-66-006' USING ERRCODE = '22023'; END IF;
  IF p_acceptance IS NOT NULL THEN
    SELECT * INTO r FROM governance.design_acceptances a WHERE a.acceptance_id = p_acceptance AND a.tenant_id = p_tenant AND a.domain_id = p_domain ORDER BY a.version DESC LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'conformance package rejected (unknown_acceptance): % is not a design acceptance record of this domain', p_acceptance USING ERRCODE = '23503'; END IF;
    SELECT * INTO b FROM governance.design_baselines x WHERE x.baseline_id = r.baseline_id AND x.version = r.baseline_version;
  ELSE
    SELECT * INTO b FROM governance.design_baselines x WHERE x.state = 'attested' ORDER BY x.decided_at DESC LIMIT 1;
  END IF;
  v_tuple := jsonb_build_object('tenant_id', p_tenant, 'domain_id', p_domain,
    'design_system', CASE WHEN b.baseline_id IS NULL THEN NULL ELSE jsonb_build_object('baseline_id', b.baseline_id, 'version', b.version, 'digest', b.digest, 'state', b.state,
                                                                                        'design_system_version', b.design_system_version, 'conformance_scope', b.conformance_scope) END,
    'components', CASE WHEN r.acceptance_id IS NOT NULL THEN r.components ELSE coalesce(b.members, '[]'::jsonb) END,
    'scope', CASE WHEN r.acceptance_id IS NOT NULL THEN r.tuple ELSE NULL END,
    'acceptance', CASE WHEN r.acceptance_id IS NULL THEN NULL ELSE jsonb_build_object('acceptance_id', r.acceptance_id, 'version', r.version, 'state', r.state, 'digest', r.digest,
                                                                                        'obligations', to_jsonb(r.obligations), 'attestations', r.attestations, 'valid_until', r.valid_until, 'claim', r.claim) END);
  IF b.baseline_id IS NULL THEN v_findings := v_findings || jsonb_build_object('class', 'no_baseline', 'finding', 'no attested design baseline — the design tuple is incomplete'); END IF;
  -- the record's own evidence, with ages
  IF r.acceptance_id IS NOT NULL THEN
    FOR x IN SELECT y FROM jsonb_array_elements(r.evidence) y LOOP
      v_evidence := v_evidence || governance.dg_aged(x ->> 'kind', NULL, x ->> 'digest', (x ->> 'capturedAt')::timestamptz,
                                                     jsonb_build_object('ref', x ->> 'ref', 'valid_until', x ->> 'validUntil', 'expired', (x ->> 'validUntil')::timestamptz <= clock_timestamp(), 'source', 'design acceptance'));
      IF (x ->> 'validUntil')::timestamptz <= clock_timestamp() THEN v_findings := v_findings || jsonb_build_object('class', 'evidence_expired', 'finding', format('%s expired at %s', x ->> 'ref', x ->> 'validUntil')); END IF;
    END LOOP;
    IF r.state <> 'accepted' THEN
      v_findings := v_findings || jsonb_build_object('class', 'acceptance_' || r.state, 'finding', format('the design acceptance v%s is %s%s', r.version, r.state, coalesce(' — ' || r.withheld_reason, '')));
    END IF;
    FOR x IN SELECT to_jsonb(u.ob) FROM unnest(r.obligations) u(ob) WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r.attestations) a WHERE a ->> 'obligation' = u.ob) LOOP
      v_findings := v_findings || jsonb_build_object('class', 'obligation_unattested', 'finding', format('the %s obligation is not attested', x #>> '{}'));
    END LOOP;
  ELSE
    v_findings := v_findings || jsonb_build_object('class', 'no_acceptance', 'finding', 'no design acceptance record is bound — the package carries the attested baseline only');
  END IF;
  IF p_target = 'UX-70-006' THEN
    v_tel := governance.dg_telemetry_evidence(p_tenant, p_domain);
    FOR x IN SELECT y FROM jsonb_array_elements(v_tel -> 'purposes') y LOOP
      v_evidence := v_evidence || governance.dg_aged('telemetry_purpose', (x ->> 'id')::uuid, x ->> 'digest', (x ->> 'captured_at')::timestamptz, jsonb_build_object('key', x ->> 'key', 'state', x ->> 'state', 'source', 'B92'));
    END LOOP;
    FOR x IN SELECT y FROM jsonb_array_elements(v_tel -> 'lineage') y LOOP
      v_evidence := v_evidence || governance.dg_aged('telemetry_definition', (x ->> 'id')::uuid, x ->> 'digest', (x ->> 'captured_at')::timestamptz, jsonb_build_object('event_key', x ->> 'event_key', 'journey_key', x ->> 'journey_key', 'source', 'B92'));
    END LOOP;
    FOR x IN SELECT y FROM jsonb_array_elements(v_tel -> 'experience' -> 'actions') y LOOP
      v_evidence := v_evidence || governance.dg_aged('experience_action', (x ->> 'id')::uuid, x ->> 'digest', (x ->> 'captured_at')::timestamptz, jsonb_build_object('action_kind', x ->> 'action_kind', 'source', 'B92'));
    END LOOP;
    IF jsonb_array_length(v_tel -> 'purposes') = 0 THEN v_findings := v_findings || jsonb_build_object('class', 'telemetry_ungoverned', 'finding', 'no approved telemetry purpose in this domain'); END IF;
  ELSE
    FOR x IN SELECT governance.dg_aged('migration_acceptance', a.acceptance_id, a.digest, a.decided_at, jsonb_build_object('decision', a.decision, 'claim', a.claim, 'signature_id', a.signature_id, 'source', 'B94 §MG'))
               FROM onboarding.migration_acceptances a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain ORDER BY a.decided_at LOOP
      v_evidence := v_evidence || x;
    END LOOP;
    FOR x IN SELECT governance.dg_aged('golive_decision', g.decision_id, g.digest, g.decided_at, jsonb_build_object('decision', g.decision, 'role', g.decided_role, 'claim', g.claim, 'signature_id', g.signature_id, 'source', 'B94 §IM'))
               FROM implementation.golive_decisions g WHERE g.tenant_id = p_tenant AND g.domain_id = p_domain ORDER BY g.decided_at LOOP
      v_evidence := v_evidence || x;
    END LOOP;
    FOR x IN SELECT governance.dg_aged('admission_record', s.admission_id, s.digest, coalesce(s.decided_at, s.proposed_at), jsonb_build_object('version', s.version, 'state', s.state, 'production_admission', s.production_admission, 'source', 'B94 §SA'))
               FROM service.admission_records s WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain ORDER BY s.proposed_at LOOP
      v_evidence := v_evidence || x;
    END LOOP;
    FOR x IN SELECT governance.dg_aged('value_review', v.review_id, v.digest, coalesce(v.decided_at, v.recorded_at), jsonb_build_object('state', v.state, 'value_status', v.value_status, 'claim', v.claim, 'source', 'B94 §SV'))
               FROM service.value_reviews v WHERE v.tenant_id = p_tenant AND v.domain_id = p_domain ORDER BY v.recorded_at LOOP
      v_evidence := v_evidence || x;
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM onboarding.migration_acceptances a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.decision = 'accepted') THEN
      v_findings := v_findings || jsonb_build_object('class', 'onboarding_unaccepted', 'finding', 'no accepted migration wave in this domain');
    END IF;
  END IF;
  SELECT * INTO e FROM governance.design_evaluations x1 WHERE x1.source = 'lint' ORDER BY x1.evaluated_at DESC LIMIT 1;
  IF e.evaluation_id IS NULL THEN v_findings := v_findings || jsonb_build_object('class', 'unevaluated', 'finding', 'the web source was not evaluated against the principles');
  ELSE
    v_evidence := v_evidence || governance.dg_aged('design_evaluation', e.evaluation_id, e.digest, e.evaluated_at, jsonb_build_object('verdict', e.verdict, 'counts', e.counts, 'source', 'B107 §DG'));
    FOR x IN SELECT y FROM jsonb_array_elements(e.findings) y WHERE y ->> 'status' = 'open' LIMIT 50 LOOP
      v_findings := v_findings || jsonb_build_object('class', 'lint_open', 'finding', format('%s: %s:%s %s', x ->> 'principle', x ->> 'file', x ->> 'line', x ->> 'excerpt'));
    END LOOP;
  END IF;
  FOR x IN SELECT jsonb_build_object('class', CASE WHEN d.expires_at <= clock_timestamp() THEN 'exception_expired' ELSE 'exception_open' END,
                                     'finding', format('design exception on %s for %s %s %s', d.asset_id, d.principle_key, CASE WHEN d.expires_at <= clock_timestamp() THEN 'expired at' ELSE 'expires' END, d.expires_at))
             FROM governance.design_exceptions d WHERE d.state = 'approved' ORDER BY d.expires_at LOOP
    v_findings := v_findings || x;
  END LOOP;
  o := governance.dg_orphans();
  IF jsonb_array_length(o -> 'assets_without_requirement') + jsonb_array_length(o -> 'assets_without_owner') + jsonb_array_length(o -> 'requirements_without_design') + jsonb_array_length(o -> 'contradictions') > 0 THEN
    v_findings := v_findings || jsonb_build_object('class', 'trace', 'finding', format('%s asset(s) without a requirement, %s without an owner, %s design requirement(s) without a design artifact, %s contradiction(s)',
                    jsonb_array_length(o -> 'assets_without_requirement'), jsonb_array_length(o -> 'assets_without_owner'), jsonb_array_length(o -> 'requirements_without_design'), jsonb_array_length(o -> 'contradictions')));
  END IF;
  v_findings := v_findings || jsonb_build_object('class', 'accessibility_unsupported', 'finding', 'MET-034 is unsupported: no accessibility journey results exist (B108 is the source, H3 the verification) — the accessibility slots are empty');
  v_content := jsonb_build_object('target', p_target, 'tuple', v_tuple, 'evidence', v_evidence, 'findings', v_findings, 'accessibility', governance.dg_accessibility_slots(),
                                  'unsigned', true, 'signature_required', 'R2: the named independent authorities review and sign this package outside the product; nothing here signs it',
                                  'claims', jsonb_build_object('construction', 'the generator and its harness', 'demonstrated_operation', 'every record here is SYNTHETIC (claim = demonstration)',
                                                               'real_acceptance', 'not claimed — R2 / H3'),
                                  'generated_at', clock_timestamp());
  v_digest := governance.digest(v_content);
  INSERT INTO governance.design_conformance_packages (package_id, tenant_id, domain_id, target, acceptance_id, acceptance_version, content, digest, generated_by, generated_by_kind, correlation_id)
  VALUES (p_package, p_tenant, p_domain, p_target, r.acceptance_id, r.version, v_content, v_digest, p_actor, coalesce(governance.dg_kind(p_actor), 'system'), p_corr);
  PERFORM governance.dg_artifact(p_package, 'evidence', 'DCP:' || p_package, format('Independent conformance package for %s (UNSIGNED — R2)', p_target), p_tenant, p_domain, NULL, NULL, 'active',
                                 jsonb_build_object('class', 'conformance_package', 'target', p_target, 'unsigned', true), v_digest, p_actor, p_corr);
  IF r.acceptance_id IS NOT NULL THEN PERFORM governance.dg_link(p_package, r.acceptance_id, 'evidences', p_tenant, p_domain, jsonb_build_object('record_version', r.version), p_actor, p_corr); END IF;
  PERFORM governance.ledger(p_tenant, p_domain, 'conformance_package', p_package, NULL, 'design.package_generated', p_actor,
            jsonb_build_object('target', p_target, 'digest', v_digest, 'evidence', jsonb_array_length(v_evidence), 'findings', jsonb_array_length(v_findings), 'unsigned', true), p_corr);
  RETURN jsonb_build_object('package_id', p_package, 'target', p_target, 'digest', v_digest, 'signed', false, 'content', v_content);
END $$;
REVOKE ALL ON FUNCTION governance.dg_generate_package(uuid, uuid, uuid, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dg_generate_package(uuid, uuid, uuid, text, uuid, uuid, uuid) TO eye_commit;

-- §DG.13 THE SEED's artifacts (the V9 principles registered in the shared core; the zero id recorded them) ────────────────────────────────
INSERT INTO governance.artifacts (artifact_id, version, scope, kind, external_key, title, owner_role, authority_class, controlling_volume, lifecycle, attributes, source, digest, recorded_by, correlation_id)
SELECT p.principle_id, 1, 'PLATFORM', 'principle', 'DP:' || p.principle_key, left(p.statement, 300), 'design_system_authority', 'normative (V9)', 'V9', 'active',
       jsonb_build_object('kind', p.kind, 'unwaivable', p.unwaivable, 'lint_rule', p.lint_rule, 'principle_version', 1), jsonb_build_object('part', 'dg', 'migration', '0115 §DG', 'seeded', true),
       p.digest, '00000000-0000-0000-0000-000000000000'::uuid, p.correlation_id
  FROM governance.design_principles p WHERE p.version = 1;

-- §DG.14 THE READS' GRANTS: the blockers read PLATFORM rows only (the vendor's design system) — the workspace explains a hold before the act.
GRANT EXECUTE ON FUNCTION governance.dg_contribution_blockers(governance.design_contributions) TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION governance.dg_baseline_blockers(uuid, int) TO eye_app, eye_commit;

/* A principal's display name for the design-governance pages: a vendor governance authority (PLATFORM, holding a B107 role) or a principal of
   the caller's own tenant — never another tenant's (a DOMAIN context cannot read a PLATFORM-homed principal under identity's RLS). */
CREATE OR REPLACE FUNCTION governance.dg_principal_name(p_principal uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = identity, public, pg_catalog, pg_temp AS $$
  SELECT p.display_name FROM identity.principals p
   WHERE p.id = p_principal
     AND ((p.scope = 'PLATFORM' AND EXISTS (SELECT 1 FROM identity.role_bindings b WHERE b.principal_id = p.id AND b.scope = 'PLATFORM' AND b.revoked_at IS NULL
                                              AND b.role_code IN ('product_authority', 'design_system_authority', 'independent_assurance', 'operations_authority', 'conformance_steward')))
          OR (p.tenant_id IS NOT NULL AND p.tenant_id = public.eye_tenant()) OR public.eye_scope() = 'PLATFORM')
$$;
REVOKE ALL ON FUNCTION governance.dg_principal_name(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.dg_principal_name(uuid) TO eye_app, eye_commit;
