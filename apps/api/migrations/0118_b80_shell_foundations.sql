-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0118 — CP-6 B80: SHELL AND FOUNDATIONS — tokens, themes, typography and iconography (F-P7-E-03); the shared component library (F-P7-E-05);
-- the unified application shell, the context bar and navigation (F-P7-E-01). 0001–0117 are applied or committed and untouched.
--
-- §0 PRELUDE (the integrator): the schema `shell` and its append-only ledger (per-principal navigation states and form drafts live there —
-- §SH and §CL-F); the TENANT role `branding_authority` (a customer's brand owner proposes a theme; the Design System Authority certifies it
-- — §TK); the shared vocabularies widened by copying each list WHOLE (governance.artifact_kinds + 'theme'; governance.signature_kinds +
-- 'theme_certification'). The parts' tables and ports follow in their sections (§TK, §CL-F, §CL-D, §SH, §CB), folded in that order.
--
-- THE PRINCIPLES (binding on every part): presentation never changes meaning — a theme maps brand expression only, never a semantic or
-- status token; a context switch never alters an approval (approvals bind version digests) and invalidates only client-held previews; a
-- draft is the principal's own, never shared, never a submission; a deep link opens exactly the state it names or says it cannot; nothing is
-- shown accepted, certified or current by inference. THREE CLAIMS: construction (this migration and its harnesses); demonstrated operation
-- (the act — SYNTHETIC personas; every certification and acceptance record `claim = 'demonstration'`); real acceptance (H3/R2) — never
-- claimed (the non-demonstration recording path is construction at B111).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §0.1 THE SCHEMA ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS shell;
GRANT USAGE ON SCHEMA shell TO eye_app, eye_commit;

-- §0.2 THE ROLE ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
INSERT INTO identity.roles (code, scope, description) VALUES
  ('branding_authority', 'TENANT', 'The customer''s brand owner (B80): proposes, previews and retires the tenant''s themes (brand expression only — never a semantic or status token); certification is the Design System Authority''s, never the proposer''s')
ON CONFLICT (code) DO NOTHING;

-- §0.3 THE VOCABULARIES (copied whole from 0115 §0.4/§0.6, B80's additions marked) ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION governance.artifact_kinds() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  'requirement', 'capability', 'journey', 'component', 'deployable_unit', 'interface', 'schema', 'policy_bundle', 'test', 'fixture', 'evidence',
  'release_candidate', 'decision_record', 'standard', 'design_asset', 'design_component', 'pattern', 'principle', 'exception', 'acceptance_record',
  'data_product', 'data_authority', 'domain', 'change_proposal', 'conflict', 'baseline', 'stewardship_case', 'manifest', 'feature', 'role',
  -- B80 (0118 §0.3)
  'theme'] $$;
CREATE OR REPLACE FUNCTION governance.signature_kinds() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  'baseline_decision', 'decision_rights', 'exception_approval', 'release_acceptance', 'design_acceptance', 'design_contribution', 'manifest_attestation',
  'change_approval', 'conflict_resolution', 'ownership_transfer', 'acceptance_attestation',
  -- B80 (0118 §0.3)
  'theme_certification'] $$;
GRANT EXECUTE ON FUNCTION governance.artifact_kinds(), governance.signature_kinds() TO eye_app, eye_commit;

-- §0.4 THE LEDGER of the shell (append-only; per principal — navigation states, drafts, context switches recorded by their ports) ─────────
CREATE TABLE shell.events (
  event_id           uuid PRIMARY KEY,
  tenant_id          uuid,                 -- NULL for a PLATFORM-homed principal (the admin workspace)
  domain_id          uuid,
  principal_id       uuid NOT NULL,
  subject_kind       text NOT NULL CHECK (subject_kind ~ '^[a-z][a-z_]{2,40}$'),
  subject_id         uuid NOT NULL,
  version            int,
  event              text NOT NULL CHECK (event ~ '^[a-z_]+\.[a-z_.]+$'),
  details            jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL
);
CREATE INDEX shev_subject ON shell.events (subject_id, occurred_at);
CREATE INDEX shev_principal ON shell.events (principal_id, occurred_at);
CREATE TRIGGER shev_append_only BEFORE UPDATE OR DELETE ON shell.events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
ALTER TABLE shell.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE shell.events FORCE ROW LEVEL SECURITY;
/* a principal reads its OWN shell events only (navigation and drafts are personal; a principal id is global) */
CREATE POLICY shev_own ON shell.events FOR SELECT TO eye_app, eye_commit USING (principal_id = public.eye_principal());
GRANT SELECT ON shell.events TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION shell.ledger(p_tenant uuid, p_domain uuid, p_principal uuid, p_subject_kind text, p_subject_id uuid, p_version int, p_event text, p_details jsonb, p_correlation uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shell, pg_catalog, pg_temp AS $$
DECLARE v uuid := gen_random_uuid();
BEGIN
  INSERT INTO shell.events (event_id, tenant_id, domain_id, principal_id, subject_kind, subject_id, version, event, details, correlation_id)
  VALUES (v, p_tenant, p_domain, p_principal, p_subject_kind, p_subject_id, p_version, p_event, coalesce(p_details, '{}'::jsonb), p_correlation);
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION shell.ledger(uuid, uuid, uuid, text, uuid, int, text, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.ledger(uuid, uuid, uuid, text, uuid, int, text, jsonb, uuid) TO eye_commit;
