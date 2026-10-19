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

-- ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §TK — TOKENS, THEMES, TYPOGRAPHY, ICONOGRAPHY (F-P7-E-03) — folded from 0118_b80_x_tk.sql at integration
-- ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0118 §TK — CP-6 B80, part `tk`: TOKENS, THEMES, TYPOGRAPHY AND ICONOGRAPHY (F-P7-E-03; V9 UX-68-001…005, UX-ADR-022, PAT-41, REL-16,
-- UX-17-001/-005, UX-05-004) — THE GOVERNED CUSTOMER THEME: a tenant's brand owner (`branding_authority`, TENANT) PROPOSES a theme that maps
-- brand expression only (an ALLOWED-KEY whitelist: the accent, the surface tints, the wordmark, the logo — never a semantic or status token);
-- anyone eligible PREVIEWS its contrast matrix; the Design System Authority CERTIFIES it — never the proposer, never an agent
-- (governance.assert_approver), SIGNED (governance.signatures kind 'theme_certification', the B36 key-reference path), the contrast matrix
-- RECOMPUTED IN THE PORT from the stored mapping (never trusted from a client): a failing pair is a REFUSED certification naming the pair
-- and its ratio; the brand owner ACTIVATES a CERTIFIED version only (the matrix re-verified at activation), ROLLS BACK to the theme before it
-- (or to the certified core theme), RETIRES a version that is not in force. Applies alone on top of 0001–0117 + the prelude (0118 §0).
-- Re-declares nothing of an earlier migration.
--
-- THE ALGORITHM is packages/tokens/src/contrast.ts's (rules `b80-tk-contrast-1`): WCAG 2.x luminance and contrast ratio (text 4.5:1,
-- non-text 3:1), ΔE76 distinctness of the accent from the status colours (≥ 25) and under protan / deutan / tritan simulation (≥ 12),
-- over light, dark, print and two forced-colour reference schemes. The core palette below is Volume 9 Appendix A as registry.ts holds it;
-- phase6-themes-b80 proves both (the palette equals the registry; the SQL matrix equals the TS matrix pair by pair).
--
-- THREE CLAIMS, never mixed: CONSTRUCTION (this migration and phase6-themes-b80); DEMONSTRATED OPERATION (the act — a SYNTHETIC brand owner
-- and a SYNTHETIC tenant; every theme and certification `claim = 'demonstration'`); REAL ACCEPTANCE (a real customer's brand acceptance and
-- the named design authorities' attestation — H3 / R2) — never claimed and not recordable here.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §TK.1 THE CONSTANTS (IMMUTABLE; mirrors of packages/tokens) ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION governance.theme_rules_version() RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'b80-tk-contrast-1' $$;
CREATE OR REPLACE FUNCTION governance.theme_schema_version() RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'b80-tk-theme-1' $$;
/* Volume 9 Appendix A — the core palette (light, dark) exactly as packages/tokens/src/registry.ts holds it. */
CREATE OR REPLACE FUNCTION governance.theme_core_palette() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$ SELECT jsonb_build_object(
  'light', '{"color.canvas": "#F4F7FA", "color.surface.primary": "#FFFFFF", "color.surface.secondary": "#EAF0F5", "color.surface.elevated": "#FFFFFF", "color.ink.strong": "#0D1B2A", "color.ink.default": "#243447", "color.ink.muted": "#526579", "color.border.default": "#C5D0DB", "color.border.strong": "#8EA0B3", "color.accent.default": "#0B6674", "color.accent.strong": "#084C55", "color.focus": "#005FCC", "color.info": "#175CD3", "color.success": "#027A48", "color.warning": "#B54708", "color.critical": "#B42318", "color.uncertain": "#6941C6", "color.observed": "#246B5A", "color.asserted": "#2D5B9F", "color.inferred": "#6A4C93", "color.assessed": "#8A5A00", "color.synthetic": "#6B4F9B", "color.recommended": "#0B6674", "color.decided": "#1F5132", "color.corrected": "#8A5A00", "color.withdrawn": "#8B1E2D", "color.classification": "#5B3A29", "color.degraded": "#7A3E00", "color.disabled.ink": "#7E8FA1", "color.selection": "#D6EEF1"}'::jsonb,
  'dark', '{"color.canvas": "#0A111B", "color.surface.primary": "#111A27", "color.surface.secondary": "#182434", "color.surface.elevated": "#1E2B3D", "color.ink.strong": "#F4F7FB", "color.ink.default": "#DCE5EF", "color.ink.muted": "#AFC0D1", "color.border.default": "#405166", "color.border.strong": "#6F8298", "color.accent.default": "#65D3DE", "color.accent.strong": "#9BE9EF", "color.focus": "#78AFFF", "color.info": "#84ADFF", "color.success": "#6CE9A6", "color.warning": "#FEC84B", "color.critical": "#FDA29B", "color.uncertain": "#BDB4FE", "color.observed": "#75E0C2", "color.asserted": "#9EC5FE", "color.inferred": "#C4A7E7", "color.assessed": "#F5D06F", "color.synthetic": "#CAB8FF", "color.recommended": "#65D3DE", "color.decided": "#9FE2B4", "color.corrected": "#F5D06F", "color.withdrawn": "#FFB4BE", "color.classification": "#E4B69C", "color.degraded": "#FFCA80", "color.disabled.ink": "#74879C", "color.selection": "#123A43"}'::jsonb) $$;
/* The forced-colours reference schemes (the certification's reference only — the browser supplies the real system colours). */
CREATE OR REPLACE FUNCTION governance.theme_forced_palettes() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$ SELECT jsonb_build_object(
  'forced_colors_black', '{"Canvas": "#000000", "CanvasText": "#FFFFFF", "LinkText": "#FFFF00", "GrayText": "#3FF23F", "Highlight": "#1AEBFF", "HighlightText": "#000000", "ButtonFace": "#000000", "ButtonText": "#FFFFFF"}'::jsonb,
  'forced_colors_white', '{"Canvas": "#FFFFFF", "CanvasText": "#000000", "LinkText": "#00009F", "GrayText": "#600000", "Highlight": "#37006E", "HighlightText": "#FFFFFF", "ButtonFace": "#FFFFFF", "ButtonText": "#000000"}'::jsonb) $$;
/* THE WHITELIST: the colour keys a customer theme MAY map, and the brand keys. Every other token is protected (semantic, status, truth,
   ink, focus, border, selection, disabled). */
CREATE OR REPLACE FUNCTION governance.theme_allowed_colour_keys() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  'color.accent.default', 'color.accent.strong', 'color.canvas', 'color.surface.primary', 'color.surface.secondary', 'color.surface.elevated'] $$;
CREATE OR REPLACE FUNCTION governance.theme_brand_keys() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['brand.wordmark', 'brand.logo'] $$;

/* THE PAIR RULES of a colour mode (light, dark, print) — the order is contrast.ts's colourModeRules(). */
CREATE OR REPLACE FUNCTION governance.theme_colour_rules() RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  surfaces text[] := ARRAY['color.canvas', 'color.surface.primary', 'color.surface.secondary', 'color.surface.elevated'];
  primary_inks text[] := ARRAY['color.ink.strong', 'color.ink.default', 'color.ink.muted', 'color.accent.default', 'color.accent.strong'];
  status_inks text[] := ARRAY['color.info', 'color.success', 'color.warning', 'color.critical', 'color.uncertain', 'color.observed', 'color.asserted', 'color.inferred',
                              'color.assessed', 'color.synthetic', 'color.recommended', 'color.decided', 'color.corrected', 'color.withdrawn', 'color.classification', 'color.degraded'];
  distinct_from text[] := ARRAY['color.critical', 'color.warning', 'color.success', 'color.info', 'color.degraded', 'color.withdrawn', 'color.decided'];
  out jsonb := '[]'::jsonb; fg text; bg text; cvd text;
BEGIN
  FOREACH fg IN ARRAY primary_inks LOOP FOREACH bg IN ARRAY surfaces || 'color.selection'::text LOOP
    out := out || jsonb_build_object('kind', 'text', 'fg', fg, 'bg', bg, 'required', 4.5); END LOOP; END LOOP;
  FOREACH fg IN ARRAY status_inks LOOP FOREACH bg IN ARRAY surfaces LOOP
    out := out || jsonb_build_object('kind', 'text', 'fg', fg, 'bg', bg, 'required', 4.5); END LOOP; END LOOP;
  FOREACH bg IN ARRAY surfaces || 'color.selection'::text LOOP out := out || jsonb_build_object('kind', 'non_text', 'fg', 'color.focus', 'bg', bg, 'required', 3); END LOOP;
  FOREACH fg IN ARRAY status_inks LOOP out := out || jsonb_build_object('kind', 'non_text', 'fg', fg, 'bg', 'color.selection', 'required', 3); END LOOP;
  FOREACH bg IN ARRAY distinct_from LOOP out := out || jsonb_build_object('kind', 'distinct', 'fg', 'color.accent.default', 'bg', bg, 'required', 25); END LOOP;
  out := out || jsonb_build_object('kind', 'distinct', 'fg', 'color.recommended', 'bg', 'color.decided', 'required', 25);
  FOREACH cvd IN ARRAY ARRAY['protan', 'deutan', 'tritan'] LOOP FOREACH bg IN ARRAY ARRAY['color.critical', 'color.warning'] LOOP
    out := out || jsonb_build_object('kind', 'distinct_cvd', 'fg', 'color.accent.default', 'bg', bg, 'required', 12, 'cvd', cvd); END LOOP; END LOOP;
  RETURN out;
END $$;
CREATE OR REPLACE FUNCTION governance.theme_forced_rules() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$ SELECT jsonb_build_array(
  jsonb_build_object('kind', 'text', 'fg', 'CanvasText', 'bg', 'Canvas', 'required', 4.5),
  jsonb_build_object('kind', 'text', 'fg', 'LinkText', 'bg', 'Canvas', 'required', 4.5),
  jsonb_build_object('kind', 'text', 'fg', 'HighlightText', 'bg', 'Highlight', 'required', 4.5),
  jsonb_build_object('kind', 'text', 'fg', 'ButtonText', 'bg', 'ButtonFace', 'required', 4.5),
  jsonb_build_object('kind', 'non_text', 'fg', 'Highlight', 'bg', 'Canvas', 'required', 3)) $$;

-- §TK.2 THE MATHS (IMMUTABLE; contrast.ts's functions, IEEE double throughout) ──────────────────────────────────────────────────────────────
/* `#RRGGBB` → linear sRGB [r, g, b]. */
CREATE OR REPLACE FUNCTION governance.theme_linear(p_hex text) RETURNS double precision[]
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE r double precision[] := '{}'; c double precision; i int;
BEGIN
  IF p_hex IS NULL OR p_hex !~ '^#[0-9A-Fa-f]{6}$' THEN
    RAISE EXCEPTION 'design theme rejected (mapping): % is not a #RRGGBB colour', coalesce(p_hex, '<none>') USING ERRCODE = '22023';
  END IF;
  FOR i IN 0..2 LOOP
    c := (('x' || substr(p_hex, 2 + i * 2, 2))::bit(8)::int)::double precision / 255::double precision;
    r := r || CASE WHEN c <= 0.04045::double precision THEN c / 12.92::double precision ELSE power((c + 0.055::double precision) / 1.055::double precision, 2.4::double precision) END;
  END LOOP;
  RETURN r;
END $$;
CREATE OR REPLACE FUNCTION governance.theme_luminance(p_hex text) RETURNS double precision
LANGUAGE sql IMMUTABLE SET search_path = governance, pg_catalog, pg_temp AS $$
  SELECT 0.2126::double precision * l[1] + 0.7152::double precision * l[2] + 0.0722::double precision * l[3] FROM (SELECT governance.theme_linear(p_hex) AS l) x
$$;
/* The WCAG 2.x contrast ratio (1–21), unrounded. */
CREATE OR REPLACE FUNCTION governance.theme_contrast(p_a text, p_b text) RETURNS double precision
LANGUAGE sql IMMUTABLE SET search_path = governance, pg_catalog, pg_temp AS $$
  SELECT (greatest(x, y) + 0.05::double precision) / (least(x, y) + 0.05::double precision) FROM (SELECT governance.theme_luminance(p_a) AS x, governance.theme_luminance(p_b) AS y) z
$$;
/* CIE L*a*b* (D65) from linear sRGB. */
CREATE OR REPLACE FUNCTION governance.theme_lab(l double precision[]) RETURNS double precision[]
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE x double precision; y double precision; z double precision; fx double precision; fy double precision; fz double precision;
        e double precision := 216::double precision / 24389::double precision; k double precision := 24389::double precision / 27::double precision;
BEGIN
  x := (0.4124::double precision * l[1] + 0.3576::double precision * l[2] + 0.1805::double precision * l[3]) / 0.95047::double precision;
  y := 0.2126::double precision * l[1] + 0.7152::double precision * l[2] + 0.0722::double precision * l[3];
  z := (0.0193::double precision * l[1] + 0.1192::double precision * l[2] + 0.9505::double precision * l[3]) / 1.08883::double precision;
  fx := CASE WHEN x > e THEN cbrt(x) ELSE (k * x + 16) / 116 END;
  fy := CASE WHEN y > e THEN cbrt(y) ELSE (k * y + 16) / 116 END;
  fz := CASE WHEN z > e THEN cbrt(z) ELSE (k * z + 16) / 116 END;
  RETURN ARRAY[116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
END $$;
CREATE OR REPLACE FUNCTION governance.theme_lab_distance(p double precision[], q double precision[]) RETURNS double precision
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$ SELECT sqrt((p[1] - q[1]) ^ 2 + (p[2] - q[2]) ^ 2 + (p[3] - q[3]) ^ 2) $$;
/* ΔE76 between two colours. */
CREATE OR REPLACE FUNCTION governance.theme_delta_e(p_a text, p_b text) RETURNS double precision
LANGUAGE sql IMMUTABLE SET search_path = governance, pg_catalog, pg_temp AS $$
  SELECT governance.theme_lab_distance(governance.theme_lab(governance.theme_linear(p_a)), governance.theme_lab(governance.theme_linear(p_b)))
$$;
/* Machado, Oliveira & Fernandes (2009), severity 1.0, on linear sRGB, clamped to [0, 1]. */
CREATE OR REPLACE FUNCTION governance.theme_cvd(l double precision[], p_kind text) RETURNS double precision[]
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE m double precision[]; out double precision[] := '{}'; i int; v double precision;
BEGIN
  m := CASE p_kind
    WHEN 'protan' THEN ARRAY[[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]]::double precision[]
    WHEN 'deutan' THEN ARRAY[[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]]::double precision[]
    WHEN 'tritan' THEN ARRAY[[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]]::double precision[]
  END;
  IF m IS NULL THEN RAISE EXCEPTION 'design theme rejected (mapping): % is not a colour-vision simulation', p_kind USING ERRCODE = '22023'; END IF;
  FOR i IN 1..3 LOOP
    v := m[i][1] * l[1] + m[i][2] * l[2] + m[i][3] * l[3];
    out := out || least(1::double precision, greatest(0::double precision, v));
  END LOOP;
  RETURN out;
END $$;
CREATE OR REPLACE FUNCTION governance.theme_delta_e_cvd(p_a text, p_b text, p_kind text) RETURNS double precision
LANGUAGE sql IMMUTABLE SET search_path = governance, pg_catalog, pg_temp AS $$
  SELECT governance.theme_lab_distance(governance.theme_lab(governance.theme_cvd(governance.theme_linear(p_a), p_kind)),
                                       governance.theme_lab(governance.theme_cvd(governance.theme_linear(p_b), p_kind)))
$$;

-- §TK.3 THE SCHEMA, THE RESOLUTION, THE PALETTES, THE MATRIX (IMMUTABLE) ──────────────────────────────────────────────────────────────────
/* VALIDATE a customer theme's mapping: NULL when valid, else '<class>: <message>' (the FIRST problem by sorted key — themes.ts's order).
   Classes: semantic (a protected token), mapping (an unknown key or a malformed value), alias (an unknown target or a cycle). It is the
   CHECK on governance.design_themes.mapping AND the ports' refusal. */
CREATE OR REPLACE FUNCTION governance.theme_mapping_problem(p jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE k text; v jsonb; allowed text[] := governance.theme_allowed_colour_keys(); brand text[] := governance.theme_brand_keys();
        core jsonb := governance.theme_core_palette() -> 'light'; seen text[]; cur jsonb; nxt text;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN RETURN 'mapping: a theme mapping is an object of allowed keys'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_object_keys(p)) THEN RETURN 'mapping: a theme maps at least one allowed key'; END IF;
  FOR k, v IN SELECT e.key, e.value FROM jsonb_each(p) e ORDER BY e.key COLLATE "C" LOOP
    IF core ? k AND NOT (k = ANY (allowed)) THEN
      RETURN format('semantic: %s is a semantic or status token — a theme maps brand expression only (the accent, the surface tints, the wordmark, the logo)', k);
    END IF;
    IF NOT (k = ANY (allowed) OR k = ANY (brand)) THEN
      RETURN format('mapping: %s is not a theme key (allowed: %s)', k, array_to_string(allowed || brand, ', '));
    END IF;
    IF k = 'brand.wordmark' THEN
      IF jsonb_typeof(v -> 'text') IS DISTINCT FROM 'string' OR length(btrim(v ->> 'text')) NOT BETWEEN 2 AND 40 THEN RETURN 'mapping: the wordmark is { text } of 2–40 characters'; END IF;
      CONTINUE;
    END IF;
    IF k = 'brand.logo' THEN
      IF jsonb_typeof(v -> 'src') IS DISTINCT FROM 'string' OR (v ->> 'src') !~ '^/brand/[a-z0-9][a-z0-9-]{0,60}\.(svg|png)$'
         OR jsonb_typeof(v -> 'alt') IS DISTINCT FROM 'string' OR length(btrim(v ->> 'alt')) NOT BETWEEN 2 AND 80 THEN
        RETURN 'mapping: the logo is { src: /brand/<name>.svg|png (same origin), alt: 2–80 characters }';
      END IF;
      CONTINUE;
    END IF;
    IF jsonb_typeof(v) = 'object' AND v ? 'alias' THEN
      IF jsonb_typeof(v -> 'alias') IS DISTINCT FROM 'string' OR NOT ((v ->> 'alias') = ANY (allowed)) OR (v ->> 'alias') = k THEN
        RETURN format('alias: %s aliases %s — an alias names another allowed colour key', k, coalesce(v ->> 'alias', (v -> 'alias')::text));
      END IF;
      CONTINUE;
    END IF;
    IF jsonb_typeof(v) IS DISTINCT FROM 'object' OR jsonb_typeof(v -> 'light') IS DISTINCT FROM 'string' OR jsonb_typeof(v -> 'dark') IS DISTINCT FROM 'string'
       OR (v ->> 'light') !~ '^#[0-9A-Fa-f]{6}$' OR (v ->> 'dark') !~ '^#[0-9A-Fa-f]{6}$' THEN
      RETURN format('mapping: %s is { light: #RRGGBB, dark: #RRGGBB } or { alias: <allowed colour key> }', k);
    END IF;
  END LOOP;
  FOR k IN SELECT e.key FROM jsonb_each(p) e ORDER BY e.key COLLATE "C" LOOP
    seen := ARRAY[k]; cur := p -> k;
    WHILE jsonb_typeof(cur) = 'object' AND cur ? 'alias' LOOP
      nxt := cur ->> 'alias';
      IF nxt = ANY (seen) THEN RETURN format('alias: the alias chain %s is a cycle', array_to_string(seen || nxt, ' → ')); END IF;
      seen := seen || nxt; cur := p -> nxt;
    END LOOP;
  END LOOP;
  RETURN NULL;
END $$;

/* The mapped colour keys resolved through their aliases ({ key: { light, dark } }; an unmapped alias target is the core value). */
CREATE OR REPLACE FUNCTION governance.theme_resolve(p jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE k text; cur text; v jsonb; depth int; out jsonb := '{}'::jsonb; core jsonb := governance.theme_core_palette();
BEGIN
  IF p IS NULL THEN RETURN out; END IF;
  FOREACH k IN ARRAY governance.theme_allowed_colour_keys() LOOP
    IF NOT p ? k THEN CONTINUE; END IF;
    cur := k; depth := 0;
    LOOP
      v := p -> cur;
      IF v IS NULL THEN out := out || jsonb_build_object(k, jsonb_build_object('light', core -> 'light' ->> cur, 'dark', core -> 'dark' ->> cur)); EXIT; END IF;
      IF v ? 'alias' THEN
        depth := depth + 1;
        IF depth > 8 THEN RAISE EXCEPTION 'design theme rejected (alias): the alias chain of % is too deep', k USING ERRCODE = '22023'; END IF;
        cur := v ->> 'alias'; CONTINUE;
      END IF;
      out := out || jsonb_build_object(k, jsonb_build_object('light', upper(v ->> 'light'), 'dark', upper(v ->> 'dark'))); EXIT;
    END LOOP;
  END LOOP;
  RETURN out;
END $$;

/* The five modes' palettes (NULL = the core theme): the customer theme applies to light and dark only — print is the light inks on
   paper white and forced colours the system reference, whatever the theme. */
CREATE OR REPLACE FUNCTION governance.theme_palettes(p jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE core jsonb := governance.theme_core_palette(); r jsonb := governance.theme_resolve(p); light jsonb; dark jsonb; print jsonb; k text;
BEGIN
  light := core -> 'light'; dark := core -> 'dark';
  FOR k IN SELECT jsonb_object_keys(r) LOOP
    light := light || jsonb_build_object(k, r -> k ->> 'light'); dark := dark || jsonb_build_object(k, r -> k ->> 'dark');
  END LOOP;
  print := core -> 'light';
  FOREACH k IN ARRAY ARRAY['color.canvas', 'color.surface.primary', 'color.surface.secondary', 'color.surface.elevated', 'color.selection'] LOOP
    print := print || jsonb_build_object(k, '#FFFFFF');
  END LOOP;
  RETURN jsonb_build_object('light', light, 'dark', dark, 'print', print) || governance.theme_forced_palettes();
END $$;

/* THE MATRIX — every pair of every mode, the failing ones, the per-mode summary; `outcome` is `pass` only when every pair passes. A ratio
   is compared UNROUNDED and shown floored to two decimals. NULL mapping = the core theme. */
CREATE OR REPLACE FUNCTION governance.theme_matrix(p jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE pal jsonb; v_mode text; rule jsonb; results jsonb := '[]'::jsonb; modes jsonb := '[]'::jsonb; failing jsonb := '[]'::jsonb;
        fgv text; bgv text; kind text; val double precision; req double precision; v_pass boolean; n int; nf int; min_text double precision; r jsonb;
BEGIN
  IF p IS NOT NULL AND governance.theme_mapping_problem(p) IS NOT NULL THEN
    RAISE EXCEPTION 'design theme rejected (%)', governance.theme_mapping_problem(p) USING ERRCODE = '22023';
  END IF;
  pal := governance.theme_palettes(p);
  FOREACH v_mode IN ARRAY ARRAY['light', 'dark', 'print', 'forced_colors_black', 'forced_colors_white'] LOOP
    n := 0; nf := 0; min_text := NULL;
    FOR rule IN SELECT x FROM jsonb_array_elements(CASE WHEN v_mode LIKE 'forced%' THEN governance.theme_forced_rules() ELSE governance.theme_colour_rules() END) x LOOP
      kind := rule ->> 'kind'; fgv := upper(pal -> v_mode ->> (rule ->> 'fg')); bgv := upper(pal -> v_mode ->> (rule ->> 'bg')); req := (rule ->> 'required')::double precision;
      val := CASE kind WHEN 'distinct' THEN governance.theme_delta_e(fgv, bgv)
                       WHEN 'distinct_cvd' THEN governance.theme_delta_e_cvd(fgv, bgv, rule ->> 'cvd')
                       ELSE governance.theme_contrast(fgv, bgv) END;
      v_pass := val >= req;
      r := jsonb_build_object('mode', v_mode, 'kind', kind, 'fg', rule ->> 'fg', 'bg', rule ->> 'bg', 'fg_value', fgv, 'bg_value', bgv, 'value', val,
                              'shown', floor(val * 100) / 100, 'required', rule -> 'required', 'pass', v_pass) || CASE WHEN rule ? 'cvd' THEN jsonb_build_object('cvd', rule ->> 'cvd') ELSE '{}'::jsonb END;
      results := results || r; n := n + 1;
      IF NOT v_pass THEN failing := failing || r; nf := nf + 1; END IF;
      IF kind = 'text' THEN min_text := least(coalesce(min_text, val), val); END IF;
    END LOOP;
    modes := modes || jsonb_build_object('mode', v_mode, 'pairs', n, 'failing', nf, 'min_text', floor(coalesce(min_text, 0) * 100) / 100);
  END LOOP;
  RETURN jsonb_build_object('rules_version', governance.theme_rules_version(), 'outcome', CASE WHEN jsonb_array_length(failing) = 0 THEN 'pass' ELSE 'fail' END,
                            'pairs', jsonb_array_length(results), 'failing', failing, 'modes', modes, 'results', results);
END $$;

/* A failing pair in words (contrast.ts's pairText). */
CREATE OR REPLACE FUNCTION governance.theme_pair_text(r jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT (r ->> 'mode') || ': ' || CASE WHEN r ->> 'kind' IN ('distinct', 'distinct_cvd')
    THEN format('%s vs %s ΔE %s < %s%s', r ->> 'fg', r ->> 'bg', to_char((r ->> 'shown')::numeric, 'FM990.00'), r ->> 'required', CASE WHEN r ? 'cvd' THEN format(' (%s simulation)', r ->> 'cvd') ELSE '' END)
    ELSE format('%s on %s %s:1 < %s:1', r ->> 'fg', r ->> 'bg', to_char((r ->> 'shown')::numeric, 'FM990.00'), r ->> 'required') END
$$;

GRANT EXECUTE ON FUNCTION governance.theme_rules_version(), governance.theme_schema_version(), governance.theme_core_palette(), governance.theme_forced_palettes(),
  governance.theme_allowed_colour_keys(), governance.theme_brand_keys(), governance.theme_colour_rules(), governance.theme_forced_rules(), governance.theme_linear(text),
  governance.theme_luminance(text), governance.theme_contrast(text, text), governance.theme_lab(double precision[]), governance.theme_lab_distance(double precision[], double precision[]),
  governance.theme_delta_e(text, text), governance.theme_cvd(double precision[], text), governance.theme_delta_e_cvd(text, text, text), governance.theme_mapping_problem(jsonb),
  governance.theme_resolve(jsonb), governance.theme_palettes(jsonb), governance.theme_matrix(jsonb), governance.theme_pair_text(jsonb) TO eye_app, eye_commit;

-- §TK.4 THE TABLES ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* THE THEMES (UX-68-002): one row per VERSION of a tenant's customer theme. The mapping is restricted to the allowed keys by a CHECK (the
   same function the ports refuse with). A new version of a theme supersedes its predecessor only while that one is still `proposed`; a
   certified, refused or retired version stays as recorded. Whether a version is IN FORCE is never a column: it is the tenant's latest
   activation (governance.theme_activations). `claim = 'demonstration'` (Q12): a real customer's brand acceptance is H3 / R2. */
CREATE TABLE governance.design_themes (
  theme_id         uuid NOT NULL,
  version          int  NOT NULL CHECK (version >= 1),
  scope            text NOT NULL DEFAULT 'TENANT' CHECK (scope = 'TENANT'),
  tenant_id        uuid NOT NULL,
  domain_id        uuid CHECK (domain_id IS NULL),
  theme_key        text NOT NULL CHECK (theme_key ~ '^[a-z][a-z0-9-]{2,60}$'),
  title            text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 200),
  base             text NOT NULL DEFAULT 'core' CHECK (base = 'core'),
  mapping          jsonb NOT NULL CONSTRAINT gdt_mapping_allowed CHECK (governance.theme_mapping_problem(mapping) IS NULL),
  schema_version   text NOT NULL DEFAULT 'b80-tk-theme-1',
  state            text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'certified', 'refused', 'retired', 'superseded')),
  digest           text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  claim            text NOT NULL DEFAULT 'demonstration' CHECK (claim = 'demonstration'),
  proposed_by      uuid NOT NULL,
  proposed_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  retired_by       uuid,
  retired_at       timestamptz,
  retire_reason    text,
  correlation_id   uuid NOT NULL,
  PRIMARY KEY (theme_id, version),
  CONSTRAINT gdt_key_version UNIQUE (tenant_id, theme_key, version),
  CONSTRAINT gdt_retired CHECK ((state = 'retired') = (retired_at IS NOT NULL) AND (retired_at IS NULL) = (retired_by IS NULL))
);
CREATE INDEX gdt_tenant ON governance.design_themes (tenant_id, theme_key, version DESC);

/* THE CERTIFICATIONS (append-only; one per theme version): the matrix RECOMPUTED in the port from the stored mapping, the outcome
   certified | refused with the failing pairs and their numbers, the certifier (the Design System Authority — never the proposer, never an
   agent) and the signature over the certification digest. */
CREATE TABLE governance.theme_certifications (
  certification_id uuid PRIMARY KEY,
  scope            text NOT NULL DEFAULT 'TENANT' CHECK (scope = 'TENANT'),
  tenant_id        uuid NOT NULL,
  domain_id        uuid CHECK (domain_id IS NULL),
  theme_id         uuid NOT NULL,
  theme_version    int NOT NULL,
  theme_digest     text NOT NULL CHECK (theme_digest ~ '^[0-9a-f]{64}$'),
  outcome          text NOT NULL CHECK (outcome IN ('certified', 'refused')),
  rules_version    text NOT NULL,
  matrix           jsonb NOT NULL CHECK (jsonb_typeof(matrix) = 'object'),
  failing          jsonb NOT NULL CHECK (jsonb_typeof(failing) = 'array'),
  matrix_digest    text NOT NULL CHECK (matrix_digest ~ '^[0-9a-f]{64}$'),
  certification_digest text NOT NULL CHECK (certification_digest ~ '^[0-9a-f]{64}$'),
  certifier        uuid NOT NULL,
  certifier_role   text NOT NULL CHECK (certifier_role = 'design_system_authority'),
  signature_id     uuid NOT NULL,
  reason           text NOT NULL CHECK (length(btrim(reason)) >= 8),
  claim            text NOT NULL DEFAULT 'demonstration' CHECK (claim = 'demonstration'),
  certified_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id   uuid NOT NULL,
  CONSTRAINT gtc_one_per_version UNIQUE (theme_id, theme_version),
  CONSTRAINT gtc_outcome CHECK ((outcome = 'certified') = (jsonb_array_length(failing) = 0)),
  FOREIGN KEY (theme_id, theme_version) REFERENCES governance.design_themes (theme_id, version)
);

/* THE ACTIVATIONS (append-only; a stack per tenant): an activation pushes (restores_to = the activation it supersedes); a rollback pops
   (its target = the theme restores_to named, or the certified CORE theme — theme_id NULL — when there is none or that version is no longer
   certified); the tenant's theme IN FORCE is its latest row. */
CREATE TABLE governance.theme_activations (
  activation_id    uuid PRIMARY KEY,
  scope            text NOT NULL DEFAULT 'TENANT' CHECK (scope = 'TENANT'),
  tenant_id        uuid NOT NULL,
  domain_id        uuid CHECK (domain_id IS NULL),
  seq              int NOT NULL CHECK (seq >= 1),
  act              text NOT NULL CHECK (act IN ('activate', 'rollback')),
  theme_id         uuid,
  theme_version    int,
  theme_digest     text CHECK (theme_digest IS NULL OR theme_digest ~ '^[0-9a-f]{64}$'),
  certification_id uuid REFERENCES governance.theme_certifications (certification_id),
  restores_to      uuid REFERENCES governance.theme_activations (activation_id),
  supersedes       uuid REFERENCES governance.theme_activations (activation_id),
  fell_back        boolean NOT NULL DEFAULT false,
  reason           text NOT NULL CHECK (length(btrim(reason)) >= 8),
  actor            uuid NOT NULL,
  activated_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  claim            text NOT NULL DEFAULT 'demonstration' CHECK (claim = 'demonstration'),
  correlation_id   uuid NOT NULL,
  CONSTRAINT gta_seq UNIQUE (tenant_id, seq),
  CONSTRAINT gta_target CHECK ((theme_id IS NULL) = (theme_version IS NULL) AND (theme_id IS NULL) = (certification_id IS NULL) AND (theme_id IS NULL) = (theme_digest IS NULL)),
  CONSTRAINT gta_activate_names_a_theme CHECK (act <> 'activate' OR theme_id IS NOT NULL),
  FOREIGN KEY (theme_id, theme_version) REFERENCES governance.design_themes (theme_id, version)
);

CREATE TRIGGER gtc_append_only BEFORE UPDATE OR DELETE ON governance.theme_certifications FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TRIGGER gta_append_only BEFORE UPDATE OR DELETE ON governance.theme_activations FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TRIGGER design_themes_never_delete BEFORE DELETE ON governance.design_themes FOR EACH ROW EXECUTE FUNCTION governance.dg_never_delete();
/* A theme version's content never changes after it is proposed: only its state (and the retirement stamp) moves. */
CREATE OR REPLACE FUNCTION governance.theme_content_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path = governance, pg_catalog, pg_temp AS $$
BEGIN
  IF NEW.theme_id IS DISTINCT FROM OLD.theme_id OR NEW.version IS DISTINCT FROM OLD.version OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.theme_key IS DISTINCT FROM OLD.theme_key
     OR NEW.title IS DISTINCT FROM OLD.title OR NEW.mapping IS DISTINCT FROM OLD.mapping OR NEW.digest IS DISTINCT FROM OLD.digest OR NEW.proposed_by IS DISTINCT FROM OLD.proposed_by
     OR NEW.proposed_at IS DISTINCT FROM OLD.proposed_at OR NEW.claim IS DISTINCT FROM OLD.claim OR NEW.schema_version IS DISTINCT FROM OLD.schema_version THEN
    RAISE EXCEPTION 'design theme rejected (state): a theme version''s content is immutable — a change is a new version' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER gdt_content_immutable BEFORE UPDATE ON governance.design_themes FOR EACH ROW EXECUTE FUNCTION governance.theme_content_immutable();

-- RLS and grants (B107's governance_visibility idiom): TENANT rows within the tenant (every context of the tenant — a theme is the tenant's
-- appearance); a PLATFORM context (the Design System Authority's certification queue) reads all. SELECT only; the definer ports write.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['governance.design_themes', 'governance.theme_certifications', 'governance.theme_activations'] LOOP
    EXECUTE format('REVOKE ALL ON %s FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$CREATE POLICY governance_visibility ON %s USING (
      (scope = 'TENANT' AND tenant_id = public.eye_tenant())
      OR public.eye_scope() = 'PLATFORM')$f$, t);
    EXECUTE format('GRANT SELECT ON %s TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- §TK.5 THE INTERNAL HELPERS (REVOKE PUBLIC; granted to no runtime role) ───────────────────────────────────────────────────────────────────
/* The digest of a theme version's content. */
CREATE OR REPLACE FUNCTION governance.theme_digest(t governance.design_themes) RETURNS text
LANGUAGE sql STABLE SET search_path = governance, pg_catalog, pg_temp AS $$
  SELECT governance.digest(jsonb_build_object('theme_id', t.theme_id, 'version', t.version, 'tenant_id', t.tenant_id, 'key', t.theme_key, 'title', t.title, 'base', t.base,
                                              'mapping', t.mapping, 'schema_version', t.schema_version, 'claim', t.claim))
$$;
GRANT EXECUTE ON FUNCTION governance.theme_digest(governance.design_themes) TO eye_app, eye_commit;
/* The certification digest a certifier signs: the theme version's digest, the rules, the matrix's digest and the outcome — recomputable by
   anyone from the stored mapping. */
CREATE OR REPLACE FUNCTION governance.theme_certification_digest(p_theme uuid, p_version int, p_theme_digest text, p_matrix jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = governance, pg_catalog, pg_temp AS $$
  SELECT governance.digest(jsonb_build_object('theme_id', p_theme, 'version', p_version, 'theme_digest', p_theme_digest, 'rules_version', p_matrix ->> 'rules_version',
                                              'matrix_digest', governance.digest(p_matrix -> 'results'), 'outcome', CASE WHEN p_matrix ->> 'outcome' = 'pass' THEN 'certified' ELSE 'refused' END))
$$;
GRANT EXECUTE ON FUNCTION governance.theme_certification_digest(uuid, int, text, jsonb) TO eye_app, eye_commit;

/* The TENANT-scope assertion of every theme port: the route's action, a TENANT context of this tenant, the acting principal. */
CREATE OR REPLACE FUNCTION governance.theme_assert(p_action text, p_tenant uuid, p_actor uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, observation, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY[p_action]);
  IF public.eye_scope() IS DISTINCT FROM 'TENANT' OR p_tenant IS NULL OR p_tenant IS DISTINCT FROM public.eye_tenant() THEN
    RAISE EXCEPTION 'design theme rejected (access): a theme is the tenant''s — the act runs in that tenant''s context (TENANT scope)' USING ERRCODE = '42501';
  END IF;
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'design theme rejected (actor): the act is recorded under the acting principal' USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION governance.theme_assert(text, uuid, uuid) FROM PUBLIC;
/* The brand owner's standing, RE-CHECKED in the port: a named active HUMAN holding branding_authority for this tenant. */
CREATE OR REPLACE FUNCTION governance.theme_assert_brand_owner(p_actor uuid, p_tenant uuid, p_what text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, onboarding, pg_catalog, pg_temp AS $$
BEGIN
  IF onboarding.principal_kind(p_actor) IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION 'design theme rejected (actor): % is a named human''s act — an agent or a system never proposes, activates, rolls back or retires a theme', p_what USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.role_bindings b WHERE b.principal_id = p_actor AND b.revoked_at IS NULL AND b.role_code = 'branding_authority' AND b.scope = 'TENANT' AND b.tenant_id = p_tenant) THEN
    RAISE EXCEPTION 'design theme rejected (authority): % is the act of the tenant''s branding authority', p_what USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION governance.theme_assert_brand_owner(uuid, uuid, text) FROM PUBLIC;
/* Register (or re-version) the theme in the shared core (governance.artifacts kind 'theme', TENANT scope) — dg_artifact's idiom, part tk. */
CREATE OR REPLACE FUNCTION governance.theme_artifact(p_id uuid, p_tenant uuid, p_key text, p_title text, p_lifecycle text, p_attrs jsonb, p_digest text, p_actor uuid, p_corr uuid) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE cur governance.artifacts%ROWTYPE; v int;
BEGIN
  SELECT * INTO cur FROM governance.artifacts a WHERE a.artifact_id = p_id AND a.superseded_at IS NULL FOR UPDATE;
  IF FOUND AND cur.digest = p_digest AND cur.lifecycle = p_lifecycle THEN RETURN cur.version; END IF;
  IF FOUND THEN UPDATE governance.artifacts SET superseded_at = clock_timestamp() WHERE artifact_id = p_id AND version = cur.version; END IF;
  v := coalesce(cur.version, 0) + 1;
  INSERT INTO governance.artifacts (artifact_id, version, scope, tenant_id, domain_id, kind, external_key, title, owner_principal_id, owner_role, authority_class, controlling_volume,
                                    lifecycle, attributes, source, digest, recorded_by, correlation_id)
  VALUES (p_id, v, 'TENANT', p_tenant, NULL, 'theme', 'THEME:' || p_key, left(p_title, 500), NULL, 'branding_authority', 'design_system_authority', 'V9', p_lifecycle,
          coalesce(p_attrs, '{}'::jsonb), jsonb_build_object('part', 'tk', 'migration', '0118 §TK'), p_digest, p_actor, p_corr);
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION governance.theme_artifact(uuid, uuid, text, text, text, jsonb, text, uuid, uuid) FROM PUBLIC;
/* The tenant's activation in force (NULL = none ever: the core theme). */
CREATE OR REPLACE FUNCTION governance.theme_current_activation(p_tenant uuid) RETURNS governance.theme_activations
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
  SELECT a.* FROM governance.theme_activations a WHERE a.tenant_id = p_tenant ORDER BY a.seq DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION governance.theme_current_activation(uuid) FROM PUBLIC;
/* The class and message of a mapping problem, raised in the class form. */
CREATE OR REPLACE FUNCTION governance.theme_raise_mapping(p_problem text) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF p_problem IS NULL THEN RETURN; END IF;
  RAISE EXCEPTION 'design theme rejected (%): %', split_part(p_problem, ': ', 1), substr(p_problem, length(split_part(p_problem, ': ', 1)) + 3) USING ERRCODE = '22023';
END $$;
REVOKE ALL ON FUNCTION governance.theme_raise_mapping(text) FROM PUBLIC;

-- §TK.6 THE PORTS ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* PROPOSE a theme version (governance.design.theme.propose): the tenant's brand owner — a named human (re-checked); the mapping restricted
   to the allowed keys (a semantic key REFUSED `(semantic)`); version N+1 of the theme on the expected version (a stale proposal 409); a
   still-`proposed` predecessor is superseded. Registered as a governance.artifacts kind 'theme'; ledgered. */
CREATE OR REPLACE FUNCTION governance.theme_propose(p_theme uuid, p_tenant uuid, p_key text, p_expected_version int, p_title text, p_mapping jsonb, p_actor uuid, p_corr uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE cur governance.design_themes%ROWTYPE; v_row governance.design_themes%ROWTYPE; v_id uuid := p_theme; v_version int;
BEGIN
  PERFORM governance.theme_assert('governance.design.theme.propose', p_tenant, p_actor);
  PERFORM governance.theme_assert_brand_owner(p_actor, p_tenant, 'proposing a theme');
  IF p_key IS NULL OR p_key !~ '^[a-z][a-z0-9-]{2,60}$' THEN RAISE EXCEPTION 'design theme rejected (key): the theme key is 3–61 lower-case letters, digits and hyphens' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_title, ''))) NOT BETWEEN 3 AND 200 THEN RAISE EXCEPTION 'design theme rejected (title): a theme states its title (3–200 characters)' USING ERRCODE = '22023'; END IF;
  PERFORM governance.theme_raise_mapping(governance.theme_mapping_problem(p_mapping));
  PERFORM pg_advisory_xact_lock(hashtext('b80-theme:' || p_tenant::text || ':' || p_key));
  SELECT * INTO cur FROM governance.design_themes t WHERE t.tenant_id = p_tenant AND t.theme_key = p_key ORDER BY t.version DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    IF v_id IS NOT NULL AND v_id <> cur.theme_id THEN RAISE EXCEPTION 'design theme rejected (duplicate): the key % already names theme %', p_key, cur.theme_id USING ERRCODE = '23505'; END IF;
    v_id := cur.theme_id;
  ELSIF v_id IS NOT NULL AND EXISTS (SELECT 1 FROM governance.design_themes t WHERE t.theme_id = v_id) THEN
    RAISE EXCEPTION 'design theme rejected (duplicate): theme % carries another key', v_id USING ERRCODE = '23505';
  END IF;
  IF coalesce(p_expected_version, -1) <> coalesce(cur.version, 0) THEN
    RAISE EXCEPTION 'design theme rejected (stale): the theme % is at version %, not %', p_key, coalesce(cur.version, 0), coalesce(p_expected_version::text, '<none>') USING ERRCODE = '23505';
  END IF;
  IF cur.state = 'retired' THEN RAISE EXCEPTION 'design theme rejected (state): the theme % is retired — a retired theme is never re-proposed; use a new key', p_key USING ERRCODE = '23505'; END IF;
  v_id := coalesce(v_id, gen_random_uuid()); v_version := coalesce(cur.version, 0) + 1;
  IF cur.theme_id IS NOT NULL AND cur.state = 'proposed' THEN UPDATE governance.design_themes SET state = 'superseded' WHERE theme_id = cur.theme_id AND version = cur.version; END IF;
  v_row := ROW(v_id, v_version, 'TENANT', p_tenant, NULL, p_key, btrim(p_title), 'core', p_mapping, governance.theme_schema_version(), 'proposed', repeat('0', 64), 'demonstration',
               p_actor, clock_timestamp(), NULL, NULL, NULL, p_corr)::governance.design_themes;
  v_row.digest := governance.theme_digest(v_row);
  INSERT INTO governance.design_themes SELECT v_row.*;
  PERFORM governance.theme_artifact(v_id, p_tenant, p_key, v_row.title, 'proposed', jsonb_build_object('theme_version', v_version, 'state', 'proposed'), v_row.digest, p_actor, p_corr);
  PERFORM governance.ledger(p_tenant, NULL, 'design_theme', v_id, v_version, 'design.theme_proposed', p_actor,
            jsonb_build_object('key', p_key, 'digest', v_row.digest, 'keys', (SELECT jsonb_agg(k ORDER BY k) FROM jsonb_object_keys(p_mapping) k), 'superseded', CASE WHEN cur.state = 'proposed' THEN cur.version END), p_corr);
  RETURN jsonb_build_object('theme_id', v_id, 'version', v_version, 'key', p_key, 'state', 'proposed', 'digest', v_row.digest, 'claim', 'demonstration');
END $$;
REVOKE ALL ON FUNCTION governance.theme_propose(uuid, uuid, text, int, text, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.theme_propose(uuid, uuid, text, int, text, jsonb, uuid, uuid) TO eye_commit;

/* PREVIEW a theme version (governance.design.theme.preview — a READ under the caller's RLS; SECURITY INVOKER): the version, its contrast
   matrix computed from the STORED mapping, the failing pairs in words, and the certification digest a certifier would sign. */
CREATE OR REPLACE FUNCTION governance.theme_preview(p_theme uuid, p_version int) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE t governance.design_themes%ROWTYPE; m jsonb;
BEGIN
  SELECT * INTO t FROM governance.design_themes x WHERE x.theme_id = p_theme AND x.version = p_version;
  IF NOT FOUND THEN RETURN NULL; END IF;
  m := governance.theme_matrix(t.mapping);
  RETURN jsonb_build_object('theme_id', t.theme_id, 'version', t.version, 'tenant_id', t.tenant_id, 'key', t.theme_key, 'title', t.title, 'state', t.state, 'digest', t.digest,
    'mapping', t.mapping, 'resolved', governance.theme_resolve(t.mapping), 'proposed_by', t.proposed_by, 'claim', t.claim, 'matrix', m,
    'failing_text', (SELECT coalesce(jsonb_agg(governance.theme_pair_text(f)), '[]'::jsonb) FROM jsonb_array_elements(m -> 'failing') f),
    'certification_digest', governance.theme_certification_digest(t.theme_id, t.version, t.digest, m));
END $$;
REVOKE ALL ON FUNCTION governance.theme_preview(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.theme_preview(uuid, int) TO eye_app, eye_commit;

/* RECORD the certifier's Ed25519 signature (by key reference) over a theme version's certification digest, under the certify act —
   governance.signatures kind 'theme_certification', TENANT scope. The certify port then verifies it names the certifier, the version and
   the digest it recomputes. The approver test is applied here too (an ineligible signer leaves nothing — the act's transaction rolls back). */
CREATE OR REPLACE FUNCTION governance.theme_record_signature(p_signature uuid, p_theme uuid, p_version int, p_digest text, p_key_id text, p_signature_b64 text, p_actor uuid, p_corr uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE t governance.design_themes%ROWTYPE;
BEGIN
  SELECT * INTO t FROM governance.design_themes x WHERE x.theme_id = p_theme AND x.version = p_version AND x.tenant_id = public.eye_tenant();
  IF NOT FOUND THEN RAISE EXCEPTION 'design theme rejected (unknown_theme): no theme %/v%', p_theme, p_version USING ERRCODE = '23503'; END IF;
  PERFORM governance.theme_assert('governance.design.theme.certify', t.tenant_id, p_actor);
  PERFORM governance.assert_approver('design theme', p_actor, t.tenant_id, NULL, ARRAY['design_system_authority'], t.proposed_by, NULL, 'certifying a customer theme');
  IF p_digest IS NULL OR p_digest !~ '^[0-9a-f]{64}$' OR p_key_id IS NULL OR p_key_id !~ '^ed25519:[0-9a-f]{16}$' OR p_signature_b64 IS NULL OR p_signature_b64 !~ '^[A-Za-z0-9+/]{86}==$' THEN
    RAISE EXCEPTION 'design theme rejected (signature): an Ed25519 signature by key reference over a 64-hex digest' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM governance.signatures s WHERE s.subject_kind = 'theme_certification' AND s.subject_id = p_theme AND s.subject_version = p_version AND s.signer = p_actor) THEN
    RAISE EXCEPTION 'design theme rejected (duplicate): %/v% is already signed by this principal', p_theme, p_version USING ERRCODE = '23505';
  END IF;
  INSERT INTO governance.signatures (signature_id, scope, tenant_id, domain_id, subject_kind, subject_id, subject_version, subject_digest, signer, signer_role, key_id, algorithm, signature, bound_action, correlation_id)
  VALUES (p_signature, 'TENANT', t.tenant_id, NULL, 'theme_certification', p_theme, p_version, p_digest, p_actor, 'design_system_authority', p_key_id, 'ed25519', p_signature_b64,
          'governance.design.theme.certify', p_corr);
  RETURN jsonb_build_object('signature_id', p_signature, 'subject_kind', 'theme_certification', 'subject_id', p_theme, 'subject_version', p_version, 'subject_digest', p_digest, 'signer', p_actor, 'key_id', p_key_id);
END $$;
REVOKE ALL ON FUNCTION governance.theme_record_signature(uuid, uuid, int, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.theme_record_signature(uuid, uuid, int, text, text, text, uuid, uuid) TO eye_commit;

/* CERTIFY a theme version (governance.design.theme.certify; human-gated): the Design System Authority — a named human, never the proposer,
   never an agent (governance.assert_approver) — on a `proposed` version; the contrast matrix RECOMPUTED HERE from the stored mapping; the
   certification digest the certifier was shown and signed must equal the one recomputed (else stale); the outcome is the matrix's:
   `certified` when every pair passes, `refused` with the failing pairs and their numbers (a refused version is corrected by a new one). */
CREATE OR REPLACE FUNCTION governance.theme_certify(p_theme uuid, p_version int, p_digest text, p_reason text, p_signature uuid, p_actor uuid, p_corr uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE t governance.design_themes%ROWTYPE; m jsonb; v_digest text; v_outcome text; v_id uuid := gen_random_uuid(); v_failing jsonb;
BEGIN
  SELECT * INTO t FROM governance.design_themes x WHERE x.theme_id = p_theme AND x.version = p_version AND x.tenant_id = public.eye_tenant() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'design theme rejected (unknown_theme): no theme %/v%', p_theme, p_version USING ERRCODE = '23503'; END IF;
  PERFORM governance.theme_assert('governance.design.theme.certify', t.tenant_id, p_actor);
  PERFORM governance.assert_approver('design theme', p_actor, t.tenant_id, NULL, ARRAY['design_system_authority'], t.proposed_by, NULL, 'certifying a customer theme');
  IF t.state <> 'proposed' THEN RAISE EXCEPTION 'design theme rejected (state): % v% is %, not proposed', t.theme_key, p_version, t.state USING ERRCODE = '23505'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'design theme rejected (reason): a certification states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  m := governance.theme_matrix(t.mapping);
  v_digest := governance.theme_certification_digest(t.theme_id, t.version, t.digest, m);
  IF p_digest IS DISTINCT FROM v_digest THEN
    RAISE EXCEPTION 'design theme rejected (stale): the certification digest shown is not the one recomputed from the stored mapping — preview again' USING ERRCODE = '23505';
  END IF;
  IF p_signature IS NULL OR NOT EXISTS (SELECT 1 FROM governance.signatures s WHERE s.signature_id = p_signature AND s.subject_kind = 'theme_certification' AND s.subject_id = p_theme
                                          AND s.subject_version = p_version AND s.subject_digest = v_digest AND s.signer = p_actor AND s.bound_action = 'governance.design.theme.certify') THEN
    RAISE EXCEPTION 'design theme rejected (signature): the certification is signed by its certifier over the recomputed digest' USING ERRCODE = '22023';
  END IF;
  v_outcome := CASE WHEN m ->> 'outcome' = 'pass' THEN 'certified' ELSE 'refused' END;
  v_failing := m -> 'failing';
  INSERT INTO governance.theme_certifications (certification_id, tenant_id, theme_id, theme_version, theme_digest, outcome, rules_version, matrix, failing, matrix_digest,
                                               certification_digest, certifier, certifier_role, signature_id, reason, correlation_id)
  VALUES (v_id, t.tenant_id, t.theme_id, t.version, t.digest, v_outcome, m ->> 'rules_version', m, v_failing, governance.digest(m -> 'results'), v_digest, p_actor,
          'design_system_authority', p_signature, btrim(p_reason), p_corr);
  UPDATE governance.design_themes SET state = v_outcome WHERE theme_id = p_theme AND version = p_version;
  PERFORM governance.theme_artifact(t.theme_id, t.tenant_id, t.theme_key, t.title, CASE WHEN v_outcome = 'certified' THEN 'active' ELSE 'quarantined' END,
            jsonb_build_object('theme_version', t.version, 'state', v_outcome, 'certification_id', v_id), t.digest, p_actor, p_corr);
  PERFORM governance.ledger(t.tenant_id, NULL, 'design_theme', t.theme_id, t.version, 'design.theme_' || v_outcome, p_actor,
            jsonb_build_object('certification_id', v_id, 'digest', v_digest, 'pairs', m -> 'pairs', 'failing', jsonb_array_length(v_failing),
                               'failing_text', (SELECT coalesce(jsonb_agg(governance.theme_pair_text(f)), '[]'::jsonb) FROM jsonb_array_elements(v_failing) f)), p_corr);
  RETURN jsonb_build_object('certification_id', v_id, 'theme_id', t.theme_id, 'version', t.version, 'outcome', v_outcome, 'pairs', m -> 'pairs', 'failing', v_failing,
    'failing_text', (SELECT coalesce(jsonb_agg(governance.theme_pair_text(f)), '[]'::jsonb) FROM jsonb_array_elements(v_failing) f), 'certification_digest', v_digest,
    'signature_id', p_signature, 'claim', 'demonstration');
END $$;
REVOKE ALL ON FUNCTION governance.theme_certify(uuid, int, text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.theme_certify(uuid, int, text, text, uuid, uuid, uuid) TO eye_commit;

/* ACTIVATE a CERTIFIED theme version for the tenant (governance.design.theme.activate; human-gated): the brand owner (re-checked); only a
   `certified` version whose certification binds its digest; the matrix RE-VERIFIED now (a version that no longer passes is never put in
   force — `(contrast)`); the version shown (digest) is the version activated; an activation PUSHES (restores_to = the one it supersedes). */
CREATE OR REPLACE FUNCTION governance.theme_activate(p_theme uuid, p_version int, p_digest text, p_reason text, p_actor uuid, p_corr uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE t governance.design_themes%ROWTYPE; c governance.theme_certifications%ROWTYPE; cur governance.theme_activations%ROWTYPE; m jsonb; v_id uuid := gen_random_uuid(); v_seq int;
BEGIN
  SELECT * INTO t FROM governance.design_themes x WHERE x.theme_id = p_theme AND x.version = p_version AND x.tenant_id = public.eye_tenant();
  IF NOT FOUND THEN RAISE EXCEPTION 'design theme rejected (unknown_theme): no theme %/v%', p_theme, p_version USING ERRCODE = '23503'; END IF;
  PERFORM governance.theme_assert('governance.design.theme.activate', t.tenant_id, p_actor);
  PERFORM governance.theme_assert_brand_owner(p_actor, t.tenant_id, 'activating a theme');
  IF t.state <> 'certified' THEN
    RAISE EXCEPTION 'design theme rejected (state): % v% is %, not certified — only a certified theme is activated (the core theme stays in force)', t.theme_key, p_version, t.state USING ERRCODE = '23505';
  END IF;
  IF p_digest IS DISTINCT FROM t.digest THEN RAISE EXCEPTION 'design theme rejected (stale): the activation names a digest other than % v%''s', t.theme_key, p_version USING ERRCODE = '23505'; END IF;
  SELECT * INTO c FROM governance.theme_certifications x WHERE x.theme_id = p_theme AND x.theme_version = p_version AND x.outcome = 'certified' AND x.theme_digest = t.digest;
  IF NOT FOUND THEN RAISE EXCEPTION 'design theme rejected (state): % v% carries no certification of its digest', t.theme_key, p_version USING ERRCODE = '23505'; END IF;
  m := governance.theme_matrix(t.mapping);
  IF m ->> 'outcome' <> 'pass' THEN
    RAISE EXCEPTION 'design theme rejected (contrast): % v% no longer passes the contrast matrix (%) — the core theme stays in force; remediate with a new version', t.theme_key, p_version,
      (SELECT string_agg(governance.theme_pair_text(f), '; ') FROM jsonb_array_elements(m -> 'failing') f) USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'design theme rejected (reason): an activation states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('b80-theme-activation:' || t.tenant_id::text));
  cur := governance.theme_current_activation(t.tenant_id);
  IF cur.activation_id IS NOT NULL AND cur.theme_id = p_theme AND cur.theme_version = p_version THEN
    RAISE EXCEPTION 'design theme rejected (duplicate): % v% is already the tenant''s theme in force', t.theme_key, p_version USING ERRCODE = '23505';
  END IF;
  v_seq := coalesce(cur.seq, 0) + 1;
  INSERT INTO governance.theme_activations (activation_id, tenant_id, seq, act, theme_id, theme_version, theme_digest, certification_id, restores_to, supersedes, reason, actor, correlation_id)
  VALUES (v_id, t.tenant_id, v_seq, 'activate', p_theme, p_version, t.digest, c.certification_id, cur.activation_id, cur.activation_id, btrim(p_reason), p_actor, p_corr);
  PERFORM governance.ledger(t.tenant_id, NULL, 'design_theme', t.theme_id, t.version, 'design.theme_activated', p_actor,
            jsonb_build_object('activation_id', v_id, 'seq', v_seq, 'digest', t.digest, 'certification_id', c.certification_id, 'supersedes', cur.activation_id), p_corr);
  RETURN jsonb_build_object('activation_id', v_id, 'seq', v_seq, 'act', 'activate', 'theme_id', p_theme, 'version', p_version, 'key', t.theme_key, 'digest', t.digest,
                            'certification_id', c.certification_id, 'supersedes', cur.activation_id, 'claim', 'demonstration');
END $$;
REVOKE ALL ON FUNCTION governance.theme_activate(uuid, int, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.theme_activate(uuid, int, text, text, uuid, uuid) TO eye_commit;

/* ROLL BACK the tenant's theme in force (governance.design.theme.rollback; human-gated): the brand owner (re-checked), on the activation he
   was shown (else stale); POPS to the theme the current activation superseded — or to the certified CORE theme when there is none or that
   version is no longer certified (`fell_back`, stated). */
CREATE OR REPLACE FUNCTION governance.theme_rollback(p_tenant uuid, p_expected_activation uuid, p_reason text, p_actor uuid, p_corr uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE cur governance.theme_activations%ROWTYPE; prev governance.theme_activations%ROWTYPE; tgt governance.design_themes%ROWTYPE; v_id uuid := gen_random_uuid();
        v_theme uuid; v_version int; v_digest text; v_cert uuid; v_fell boolean := false; v_restores uuid;
BEGIN
  PERFORM governance.theme_assert('governance.design.theme.rollback', p_tenant, p_actor);
  PERFORM governance.theme_assert_brand_owner(p_actor, p_tenant, 'rolling back a theme');
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'design theme rejected (reason): a rollback states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('b80-theme-activation:' || p_tenant::text));
  cur := governance.theme_current_activation(p_tenant);
  IF cur.activation_id IS NULL OR cur.theme_id IS NULL THEN
    RAISE EXCEPTION 'design theme rejected (state): the certified core theme is in force — there is nothing to roll back' USING ERRCODE = '23505';
  END IF;
  IF p_expected_activation IS DISTINCT FROM cur.activation_id THEN
    RAISE EXCEPTION 'design theme rejected (stale): the theme in force is activation % (seq %), not the one shown', cur.activation_id, cur.seq USING ERRCODE = '23505';
  END IF;
  IF cur.restores_to IS NOT NULL THEN
    SELECT * INTO prev FROM governance.theme_activations a WHERE a.activation_id = cur.restores_to;
    v_restores := prev.restores_to;
    IF prev.theme_id IS NOT NULL THEN
      SELECT * INTO tgt FROM governance.design_themes x WHERE x.theme_id = prev.theme_id AND x.version = prev.theme_version;
      IF tgt.state = 'certified' AND governance.theme_matrix(tgt.mapping) ->> 'outcome' = 'pass' THEN
        v_theme := prev.theme_id; v_version := prev.theme_version; v_digest := prev.theme_digest; v_cert := prev.certification_id;
      ELSE v_fell := true; END IF;
    END IF;
  END IF;
  INSERT INTO governance.theme_activations (activation_id, tenant_id, seq, act, theme_id, theme_version, theme_digest, certification_id, restores_to, supersedes, fell_back, reason, actor, correlation_id)
  VALUES (v_id, p_tenant, cur.seq + 1, 'rollback', v_theme, v_version, v_digest, v_cert, v_restores, cur.activation_id, v_fell, btrim(p_reason), p_actor, p_corr);
  PERFORM governance.ledger(p_tenant, NULL, 'design_theme', cur.theme_id, cur.theme_version, 'design.theme_rolled_back', p_actor,
            jsonb_build_object('activation_id', v_id, 'seq', cur.seq + 1, 'from', jsonb_build_object('theme_id', cur.theme_id, 'version', cur.theme_version),
                               'to', CASE WHEN v_theme IS NULL THEN jsonb_build_object('theme', 'core') ELSE jsonb_build_object('theme_id', v_theme, 'version', v_version) END, 'fell_back', v_fell), p_corr);
  RETURN jsonb_build_object('activation_id', v_id, 'seq', cur.seq + 1, 'act', 'rollback', 'theme_id', v_theme, 'version', v_version, 'to_core', v_theme IS NULL, 'fell_back', v_fell,
                            'supersedes', cur.activation_id, 'claim', 'demonstration');
END $$;
REVOKE ALL ON FUNCTION governance.theme_rollback(uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.theme_rollback(uuid, uuid, text, uuid, uuid) TO eye_commit;

/* RETIRE a theme version (governance.design.theme.retire; human-gated): the brand owner (re-checked); never the version IN FORCE (roll it
   back first — the tenant is never left on a retired theme); a retired version stays readable, never deleted. */
CREATE OR REPLACE FUNCTION governance.theme_retire(p_theme uuid, p_version int, p_reason text, p_actor uuid, p_corr uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE t governance.design_themes%ROWTYPE; cur governance.theme_activations%ROWTYPE;
BEGIN
  SELECT * INTO t FROM governance.design_themes x WHERE x.theme_id = p_theme AND x.version = p_version AND x.tenant_id = public.eye_tenant() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'design theme rejected (unknown_theme): no theme %/v%', p_theme, p_version USING ERRCODE = '23503'; END IF;
  PERFORM governance.theme_assert('governance.design.theme.retire', t.tenant_id, p_actor);
  PERFORM governance.theme_assert_brand_owner(p_actor, t.tenant_id, 'retiring a theme');
  IF t.state IN ('retired', 'superseded') THEN RAISE EXCEPTION 'design theme rejected (state): % v% is already %', t.theme_key, p_version, t.state USING ERRCODE = '23505'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'design theme rejected (reason): a retirement states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('b80-theme-activation:' || t.tenant_id::text));
  cur := governance.theme_current_activation(t.tenant_id);
  IF cur.theme_id = p_theme AND cur.theme_version = p_version THEN
    RAISE EXCEPTION 'design theme rejected (state): % v% is the tenant''s theme in force — roll it back first', t.theme_key, p_version USING ERRCODE = '23505';
  END IF;
  UPDATE governance.design_themes SET state = 'retired', retired_by = p_actor, retired_at = clock_timestamp(), retire_reason = btrim(p_reason) WHERE theme_id = p_theme AND version = p_version;
  PERFORM governance.theme_artifact(t.theme_id, t.tenant_id, t.theme_key, t.title, 'retired', jsonb_build_object('theme_version', t.version, 'state', 'retired'), t.digest, p_actor, p_corr);
  PERFORM governance.ledger(t.tenant_id, NULL, 'design_theme', t.theme_id, t.version, 'design.theme_retired', p_actor, jsonb_build_object('reason', btrim(p_reason), 'was', t.state), p_corr);
  RETURN jsonb_build_object('theme_id', p_theme, 'version', p_version, 'key', t.theme_key, 'state', 'retired', 'was', t.state);
END $$;
REVOKE ALL ON FUNCTION governance.theme_retire(uuid, int, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.theme_retire(uuid, int, text, uuid, uuid) TO eye_commit;

/* THE THEME IN FORCE for a tenant (a READ under the caller's RLS; SECURITY INVOKER): the latest activation and the version it names (its
   mapping re-validated and its matrix re-verified HERE — a version that no longer passes is reported `fallback` to the certified core, with
   the reason), or the core theme when none is in force. ThemeScope applies only what this answers. */
CREATE OR REPLACE FUNCTION governance.theme_in_force(p_tenant uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE a governance.theme_activations%ROWTYPE; t governance.design_themes%ROWTYPE; c governance.theme_certifications%ROWTYPE; m jsonb;
BEGIN
  SELECT * INTO a FROM governance.theme_activations x WHERE x.tenant_id = p_tenant ORDER BY x.seq DESC LIMIT 1;
  IF NOT FOUND OR a.theme_id IS NULL THEN
    RETURN jsonb_build_object('tenant_id', p_tenant, 'theme', 'core', 'activation', CASE WHEN FOUND THEN to_jsonb(a) END, 'fallback', false,
                              'note', 'the certified core theme (Volume 9 Appendix A) is in force');
  END IF;
  SELECT * INTO t FROM governance.design_themes x WHERE x.theme_id = a.theme_id AND x.version = a.theme_version;
  SELECT * INTO c FROM governance.theme_certifications x WHERE x.certification_id = a.certification_id;
  m := governance.theme_matrix(t.mapping);
  IF t.state <> 'certified' OR t.digest IS DISTINCT FROM a.theme_digest OR c.outcome IS DISTINCT FROM 'certified' OR m ->> 'outcome' <> 'pass' THEN
    RETURN jsonb_build_object('tenant_id', p_tenant, 'theme', 'core', 'activation', to_jsonb(a), 'fallback', true,
      'note', format('the activated theme %s v%s is %s — the certified core theme is applied instead', t.theme_key, t.version,
                     CASE WHEN t.state <> 'certified' THEN t.state WHEN m ->> 'outcome' <> 'pass' THEN 'failing the contrast matrix' ELSE 'not bound to its certification' END));
  END IF;
  RETURN jsonb_build_object('tenant_id', p_tenant, 'theme', 'customer', 'activation', to_jsonb(a), 'fallback', false,
    'version', jsonb_build_object('theme_id', t.theme_id, 'version', t.version, 'key', t.theme_key, 'title', t.title, 'digest', t.digest, 'mapping', t.mapping, 'resolved', governance.theme_resolve(t.mapping)),
    'certification', jsonb_build_object('certification_id', c.certification_id, 'certifier', c.certifier, 'certifier_name', governance.dg_principal_name(c.certifier), 'certified_at', c.certified_at,
                                        'certification_digest', c.certification_digest, 'signature_id', c.signature_id, 'rules_version', c.rules_version, 'claim', c.claim),
    'note', 'a customer theme applies on screen in light and dark; print and forced colours render the certified core palette');
END $$;
REVOKE ALL ON FUNCTION governance.theme_in_force(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.theme_in_force(uuid) TO eye_app, eye_commit;

-- ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §CL-F — FORMS, ACTIONS, FEEDBACK: THE FORM DRAFT (F-P7-E-05) — folded from 0118_b80_x_clf.sql at integration
-- ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0118 §CL-F — CP-6 B80: FORMS, ACTIONS, FEEDBACK (F-P7-E-05: UX-21-001..006, PAT-03, CMP-033..043, CMP-065..070, UX-24-001..006).
-- Part-local file (folded into the one 0118 at integration, after §TK); applies ALONE on 0001–0117 + the prelude (0118 §0).
--
-- THE FORM DRAFT (PAT-03 "Save draft — persist versioned work without implying submission; never label as approval"; UX-21-002/-003).
--   shell.drafts       one row per SAVED VERSION (or the one DISCARD tombstone) of a principal's draft of one form, per form key and
--                      subject (the object the form edits; '-' for a new one), in one tenant/domain. APPEND-ONLY: a save writes the next
--                      version (superseding the one it read — a stale save is refused), a discard writes a tombstone; nothing is updated.
--                      The payload is the form's own state, OPAQUE here: a draft is NEVER a submission — no submitted / approved / review
--                      state exists on it, no port reads it as the record it may later become, and the form's real act (registration,
--                      declaration…) is its own governed write with its own receipt. Every version carries the digest of its payload
--                      and an EXPIRY (database clock): an expired draft is no longer offered — its content is withheld from the read,
--                      and a save against it is refused `(expired)` (a new draft may be started).
--   RLS                FORCE; a principal reads ONLY ITS OWN rows in the bound tenant and domain (principal_id = eye_principal()) — a
--                      draft is personal, never shared, never visible to an administrator through the application roles.
--   ports              shell.draft_save / shell.draft_discard (SECURITY DEFINER, eye_commit; the bound action asserted, the scope of the
--                      established context asserted, the acting principal = eye_principal(), a NAMED HUMAN re-checked in the port — an
--                      agent or a system never drafts through the shell); shell.draft_read (definer read guarded by
--                      observation.assert_read_scope and the acting principal: the live draft's payload, or the state that withholds
--                      it — expired / discarded / none — with the version history). The drafts LIST is a plain select under RLS.
--   the ledger         every save and discard is recorded in shell.events (the prelude's ledger, the principal's own).
--   refusals           the class form `form draft rejected (<class>): …` — 403 actor · 404 unknown_draft · 409 stale|state|expired ·
--                      422 the rest. NOTE (the integrator): the noun `form draft` is not mapped centrally yet (observation-errors.ts).
--
-- THREE CLAIMS: construction (this file and phase6-drafts-b80.test.ts — every persona and draft there SYNTHETIC); demonstrated operation
-- (the act: a SYNTHETIC persona's draft on eye_demo); real acceptance (UX-21-006 → the shared recording path at B111, then H3) — never
-- claimed here.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §CL-F.1 THE TABLE ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE shell.drafts (
  draft_id           uuid NOT NULL,
  version            int NOT NULL CHECK (version >= 1),
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  principal_id       uuid NOT NULL,
  form_key           text NOT NULL CHECK (form_key ~ '^[a-z][a-z0-9_.-]{2,80}$'),
  subject_key        text NOT NULL CHECK (length(subject_key) BETWEEN 1 AND 200 AND subject_key !~ '[[:cntrl:]]'),
  kind               text NOT NULL CHECK (kind IN ('saved', 'discarded')),
  schema_version     text CHECK (schema_version IS NULL OR schema_version ~ '^[A-Za-z0-9][A-Za-z0-9_.@-]{0,40}$'),
  payload            jsonb CHECK (payload IS NULL OR (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 262144)),
  payload_digest     text CHECK (payload_digest IS NULL OR payload_digest ~ '^[0-9a-f]{64}$'),
  summary            text CHECK (summary IS NULL OR length(summary) <= 200),
  step               int CHECK (step IS NULL OR step BETWEEN 0 AND 50),
  supersedes         int,
  reason             text CHECK (reason IS NULL OR length(reason) <= 500),
  saved_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at         timestamptz NOT NULL,
  correlation_id     uuid NOT NULL,
  PRIMARY KEY (draft_id, version),
  CONSTRAINT shdr_shape CHECK ((kind = 'saved' AND payload IS NOT NULL AND payload_digest IS NOT NULL AND expires_at > saved_at)
                            OR (kind = 'discarded' AND payload IS NULL AND payload_digest IS NULL)),
  CONSTRAINT shdr_supersedes CHECK ((version = 1 AND supersedes IS NULL) OR (version > 1 AND supersedes = version - 1))
);
COMMENT ON TABLE shell.drafts IS 'B80 §CL-F (PAT-03): a principal''s versioned form drafts — personal, append-only, expiring; NEVER a submission (no submitted/approved state exists here; the form''s act is its own governed write).';
CREATE INDEX shdr_series ON shell.drafts (principal_id, tenant_id, domain_id, form_key, subject_key, saved_at DESC);
CREATE TRIGGER shdr_append_only BEFORE UPDATE OR DELETE ON shell.drafts FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
ALTER TABLE shell.drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shell.drafts FORCE ROW LEVEL SECURITY;
/* a principal reads its OWN drafts, in the bound tenant and domain only */
CREATE POLICY shdr_own ON shell.drafts FOR SELECT TO eye_app, eye_commit
  USING (principal_id = public.eye_principal() AND tenant_id = public.eye_tenant() AND domain_id = public.eye_domain());
GRANT SELECT ON shell.drafts TO eye_app, eye_commit;

-- §CL-F.2 THE SHARED CHECKS ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* The acting principal of a draft port: the bound principal, a NAMED ACTIVE HUMAN (an agent or a system never drafts through the shell). */
CREATE OR REPLACE FUNCTION shell.draft_actor() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = shell, pg_catalog, pg_temp AS $$
DECLARE v uuid := public.eye_principal();
BEGIN
  IF v IS NULL THEN
    RAISE EXCEPTION 'form draft rejected (actor): no principal is bound to this context' USING ERRCODE = '42501';
  END IF;
  IF onboarding.principal_kind(v) IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION 'form draft rejected (actor): a draft is a named person''s own work in progress; an agent or a system never drafts through the shell' USING ERRCODE = '42501';
  END IF;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION shell.draft_actor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.draft_actor() TO eye_commit;

/* The digest of a payload (the jsonb text form — deterministic for one value). */
CREATE OR REPLACE FUNCTION shell.draft_digest(p jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$ SELECT encode(sha256(convert_to(p::text, 'UTF8')), 'hex') $$;
REVOKE ALL ON FUNCTION shell.draft_digest(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.draft_digest(jsonb) TO eye_app, eye_commit;

-- §CL-F.3 SAVE ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* Save the principal's draft of one form (per subject). p_expected_version is the version the form READ (null: no live draft was read):
   a live draft at another version → (stale); an expired draft named by its version → (expired); the same content as the live version →
   answered `unchanged`, no new version. The TTL is seconds (1 s – 30 days; null: 7 days), on the database clock. */
CREATE OR REPLACE FUNCTION shell.draft_save(p_tenant uuid, p_domain uuid, p_form_key text, p_subject_key text, p_schema_version text, p_payload jsonb,
                                            p_summary text, p_step int, p_expected_version int, p_ttl_seconds int, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shell, observation, pg_catalog, pg_temp AS $$
DECLARE
  v_actor uuid; v_subject text := coalesce(nullif(btrim(p_subject_key), ''), '-');
  l shell.drafts%ROWTYPE; v_found boolean := false; v_live boolean := false;
  v_now timestamptz := clock_timestamp(); v_ttl int := coalesce(p_ttl_seconds, 604800);
  v_id uuid; v_version int; v_digest text; v_expires timestamptz;
BEGIN
  PERFORM observation.assert_authority(ARRAY['shell.draft.save']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := shell.draft_actor();
  IF p_form_key IS NULL OR p_form_key !~ '^[a-z][a-z0-9_.-]{2,80}$' THEN
    RAISE EXCEPTION 'form draft rejected (form_key): a form key is 3–81 lower-case letters, digits, dots, dashes and underscores (e.g. observation.source.register)' USING ERRCODE = '22023';
  END IF;
  IF length(v_subject) > 200 OR v_subject ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'form draft rejected (subject): the subject key is at most 200 printable characters' USING ERRCODE = '22023';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'form draft rejected (payload): the draft is the form''s state as one object' USING ERRCODE = '22023';
  END IF;
  IF octet_length(p_payload::text) > 262144 THEN
    RAISE EXCEPTION 'form draft rejected (payload): a draft is at most 256 KiB (this one is % bytes)', octet_length(p_payload::text) USING ERRCODE = '22023';
  END IF;
  IF p_schema_version IS NOT NULL AND p_schema_version !~ '^[A-Za-z0-9][A-Za-z0-9_.@-]{0,40}$' THEN
    RAISE EXCEPTION 'form draft rejected (schema_version): the form''s payload schema is named like SRC-REG@v1' USING ERRCODE = '22023';
  END IF;
  IF p_summary IS NOT NULL AND length(p_summary) > 200 THEN
    RAISE EXCEPTION 'form draft rejected (summary): a summary is at most 200 characters' USING ERRCODE = '22023';
  END IF;
  IF p_step IS NOT NULL AND (p_step < 0 OR p_step > 50) THEN
    RAISE EXCEPTION 'form draft rejected (step): the step is 0–50' USING ERRCODE = '22023';
  END IF;
  IF v_ttl < 1 OR v_ttl > 2592000 THEN
    RAISE EXCEPTION 'form draft rejected (ttl): a draft is kept 1 second to 30 days' USING ERRCODE = '22023';
  END IF;
  -- one save at a time per series (the principal's draft of this form and subject)
  PERFORM pg_advisory_xact_lock(hashtextextended('shell.draft:' || v_actor || ':' || p_tenant || ':' || p_domain || ':' || p_form_key || ':' || v_subject, 0));
  SELECT * INTO l FROM shell.drafts d
   WHERE d.principal_id = v_actor AND d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.form_key = p_form_key AND d.subject_key = v_subject
   ORDER BY d.saved_at DESC, d.version DESC LIMIT 1;
  v_found := FOUND;
  v_live := v_found AND l.kind = 'saved' AND l.expires_at > v_now;
  v_digest := shell.draft_digest(p_payload);
  IF v_live THEN
    IF p_expected_version IS DISTINCT FROM l.version THEN
      RAISE EXCEPTION 'form draft rejected (stale): your draft of % is at version % (saved %); this save read %', p_form_key, l.version, l.saved_at,
        coalesce(p_expected_version::text, 'no draft') USING ERRCODE = '23514';
    END IF;
    IF l.payload_digest = v_digest AND l.step IS NOT DISTINCT FROM p_step AND l.summary IS NOT DISTINCT FROM p_summary
       AND l.schema_version IS NOT DISTINCT FROM p_schema_version THEN
      RETURN jsonb_build_object('draft_id', l.draft_id, 'version', l.version, 'supersedes', l.supersedes, 'payload_digest', l.payload_digest, 'saved_at', l.saved_at,
        'expires_at', l.expires_at, 'form_key', l.form_key, 'subject_key', l.subject_key, 'unchanged', true, 'submission', false);
    END IF;
    v_id := l.draft_id; v_version := l.version + 1;
  ELSE
    IF v_found AND l.kind = 'saved' AND p_expected_version IS NOT NULL AND p_expected_version = l.version THEN
      RAISE EXCEPTION 'form draft rejected (expired): version % of your draft of % expired at %; its content is no longer offered — save it as a new draft (no expected version)',
        l.version, p_form_key, l.expires_at USING ERRCODE = '23514';
    END IF;
    IF p_expected_version IS NOT NULL THEN
      RAISE EXCEPTION 'form draft rejected (stale): you have no live draft of % at version % (start a new draft with no expected version)', p_form_key, p_expected_version USING ERRCODE = '23514';
    END IF;
    v_id := gen_random_uuid(); v_version := 1;
  END IF;
  v_expires := v_now + make_interval(secs => v_ttl);
  INSERT INTO shell.drafts (draft_id, version, tenant_id, domain_id, principal_id, form_key, subject_key, kind, schema_version, payload, payload_digest,
                            summary, step, supersedes, saved_at, expires_at, correlation_id)
  VALUES (v_id, v_version, p_tenant, p_domain, v_actor, p_form_key, v_subject, 'saved', p_schema_version, p_payload, v_digest,
          p_summary, p_step, CASE WHEN v_version > 1 THEN v_version - 1 END, v_now, v_expires, p_correlation);
  PERFORM shell.ledger(p_tenant, p_domain, v_actor, 'form_draft', v_id, v_version, 'shell.draft.saved',
    jsonb_build_object('form_key', p_form_key, 'subject_key', v_subject, 'payload_digest', v_digest, 'supersedes', CASE WHEN v_version > 1 THEN v_version - 1 END,
                       'expires_at', v_expires, 'submission', false), p_correlation);
  RETURN jsonb_build_object('draft_id', v_id, 'version', v_version, 'supersedes', CASE WHEN v_version > 1 THEN v_version - 1 END, 'payload_digest', v_digest,
    'saved_at', v_now, 'expires_at', v_expires, 'form_key', p_form_key, 'subject_key', v_subject, 'unchanged', false, 'submission', false);
END $$;
REVOKE ALL ON FUNCTION shell.draft_save(uuid, uuid, text, text, text, jsonb, text, int, int, int, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.draft_save(uuid, uuid, text, text, text, jsonb, text, int, int, int, uuid) TO eye_commit;

-- §CL-F.4 DISCARD ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* Discard the principal's own draft (live or expired): a tombstone version; the content is no longer offered. Another principal's draft is
   answered as unknown (a draft's existence is personal too). */
CREATE OR REPLACE FUNCTION shell.draft_discard(p_tenant uuid, p_domain uuid, p_draft_id uuid, p_expected_version int, p_reason text, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shell, observation, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; l shell.drafts%ROWTYPE; v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['shell.draft.discard']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := shell.draft_actor();
  IF p_reason IS NOT NULL AND length(p_reason) > 500 THEN
    RAISE EXCEPTION 'form draft rejected (reason): a reason is at most 500 characters' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('shell.draft.id:' || coalesce(p_draft_id::text, '-'), 0));
  SELECT * INTO l FROM shell.drafts d WHERE d.draft_id = p_draft_id AND d.principal_id = v_actor AND d.tenant_id = p_tenant AND d.domain_id = p_domain
   ORDER BY d.version DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'form draft rejected (unknown_draft): no draft % of yours in this domain', coalesce(p_draft_id::text, '<null>') USING ERRCODE = '22023';
  END IF;
  IF l.kind = 'discarded' THEN
    RAISE EXCEPTION 'form draft rejected (state): draft % was discarded at %', p_draft_id, l.saved_at USING ERRCODE = '23514';
  END IF;
  IF p_expected_version IS DISTINCT FROM l.version THEN
    RAISE EXCEPTION 'form draft rejected (stale): draft % is at version %; this discard read %', p_draft_id, l.version, coalesce(p_expected_version::text, 'no version') USING ERRCODE = '23514';
  END IF;
  -- the series key is taken too, so a concurrent save of the same form waits for the tombstone
  PERFORM pg_advisory_xact_lock(hashtextextended('shell.draft:' || v_actor || ':' || p_tenant || ':' || p_domain || ':' || l.form_key || ':' || l.subject_key, 0));
  INSERT INTO shell.drafts (draft_id, version, tenant_id, domain_id, principal_id, form_key, subject_key, kind, schema_version, payload, payload_digest,
                            summary, step, supersedes, reason, saved_at, expires_at, correlation_id)
  VALUES (l.draft_id, l.version + 1, p_tenant, p_domain, v_actor, l.form_key, l.subject_key, 'discarded', l.schema_version, NULL, NULL,
          l.summary, NULL, l.version, nullif(btrim(coalesce(p_reason, '')), ''), v_now, v_now, p_correlation);
  PERFORM shell.ledger(p_tenant, p_domain, v_actor, 'form_draft', l.draft_id, l.version + 1, 'shell.draft.discarded',
    jsonb_build_object('form_key', l.form_key, 'subject_key', l.subject_key, 'discarded_version', l.version, 'was_expired', l.expires_at <= v_now), p_correlation);
  RETURN jsonb_build_object('draft_id', l.draft_id, 'version', l.version + 1, 'discarded_version', l.version, 'form_key', l.form_key, 'subject_key', l.subject_key,
    'discarded_at', v_now, 'state', 'discarded');
END $$;
REVOKE ALL ON FUNCTION shell.draft_discard(uuid, uuid, uuid, int, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.draft_discard(uuid, uuid, uuid, int, text, uuid) TO eye_commit;

-- §CL-F.5 READ ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* The principal's draft of one form and subject (or one draft by id): state live | expired | discarded | none. The PAYLOAD is returned for a
   LIVE draft only (an expired or discarded draft's content is withheld); the version history (digests and instants, never payloads) always. */
CREATE OR REPLACE FUNCTION shell.draft_read(p_tenant uuid, p_domain uuid, p_form_key text, p_subject_key text, p_draft_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = shell, observation, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid := public.eye_principal(); v_subject text := coalesce(nullif(btrim(p_subject_key), ''), '-'); l shell.drafts%ROWTYPE;
        v_now timestamptz := clock_timestamp(); v_state text; v_versions jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'a form draft');
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'form draft rejected (actor): no principal is bound to this context' USING ERRCODE = '42501';
  END IF;
  IF p_draft_id IS NOT NULL THEN
    SELECT * INTO l FROM shell.drafts d WHERE d.draft_id = p_draft_id AND d.principal_id = v_actor AND d.tenant_id = p_tenant AND d.domain_id = p_domain
     ORDER BY d.version DESC LIMIT 1;
  ELSE
    SELECT * INTO l FROM shell.drafts d
     WHERE d.principal_id = v_actor AND d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.form_key = p_form_key AND d.subject_key = v_subject
     ORDER BY d.saved_at DESC, d.version DESC LIMIT 1;
  END IF;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('state', 'none', 'draft', NULL, 'versions', '[]'::jsonb, 'read_at', v_now, 'form_key', p_form_key, 'subject_key', v_subject);
  END IF;
  v_state := CASE WHEN l.kind = 'discarded' THEN 'discarded' WHEN l.expires_at <= v_now THEN 'expired' ELSE 'live' END;
  SELECT coalesce(jsonb_agg(jsonb_build_object('version', d.version, 'kind', d.kind, 'payload_digest', d.payload_digest, 'saved_at', d.saved_at,
                                               'expires_at', d.expires_at, 'supersedes', d.supersedes, 'step', d.step) ORDER BY d.version), '[]'::jsonb)
    INTO v_versions FROM shell.drafts d WHERE d.draft_id = l.draft_id AND d.principal_id = v_actor;
  RETURN jsonb_build_object('state', v_state, 'read_at', v_now, 'form_key', l.form_key, 'subject_key', l.subject_key,
    'draft', jsonb_build_object('draft_id', l.draft_id, 'version', l.version, 'schema_version', l.schema_version, 'summary', l.summary, 'step', l.step,
      'payload_digest', l.payload_digest, 'saved_at', l.saved_at, 'expires_at', l.expires_at, 'supersedes', l.supersedes,
      'payload', CASE WHEN v_state = 'live' THEN l.payload END, 'submission', false),
    'versions', v_versions);
END $$;
REVOKE ALL ON FUNCTION shell.draft_read(uuid, uuid, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.draft_read(uuid, uuid, text, text, uuid) TO eye_app, eye_commit;

-- ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §SH — THE SHELL, NAVIGATION, DEEP LINKS (F-P7-E-01) — folded from 0118_b80_x_sh.sql at integration
-- ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0118 §SH — CP-6 B80: THE SHELL, NAVIGATION, DEEP LINKS (F-P7-E-01: PR-05-001/002/003/005, UX-09-002/003/005, UX-11-002/003/005,
-- UX-15-001…005, PAT-25, PAT-26). Applies ALONE on 0001–0117 + the prelude (0118_b80_shell_foundations.sql); folded into 0118 at integration.
--
-- §SH.1 shell.navigation_states — a principal's OWN navigation position per workspace (and per domain): the route, the section, the query,
--       the filters, the view, the object selection, the active work object (kind, id, version, as-of), the return path and its focus
--       target, the recent and favourite locations. APPEND-ONLY versions (each names the version it supersedes); a save that read an older
--       version is refused `(stale)` — nothing is overwritten; RLS by principal (a principal id is global — another principal, even in the
--       same domain, reads none of it). The port re-checks the bound action, the established scope, the acting principal (= eye_principal())
--       and that the principal is a named HUMAN (an agent keeps no navigation state). A state is PRESENTATION ONLY: it names locations, never
--       a command — there is no field that could carry one, so restoring it can never repeat a side effect (PAT-26).
-- §SH.2 shell.navigation_states_of — the principal's own read (current per workspace + its version history), refused `(actor)` for any
--       other principal and `(access)` outside the caller's bound scope.
-- §SH.3 prediction.warning_as_of(warning, at) — the deep-link scene's read (PAT-25, UX-15-003/005): the warning's state AS OF an instant,
--       reconstructed from its OWN append-only event history (prediction.warning_events, 0029 §7; the state events raised → acknowledged |
--       expired | closed, as decision.warning_state_as_of reads them), the exact events up to the instant, and the VARIANCE against the
--       current declared state (prediction.warnings_current). Refused before the warning's first recorded event `(not_replayable)` and for
--       a future instant `(future)`; a warning that does not exist and one outside the caller's scope answer the SAME words `(unknown_warning)`
--       — nothing about existence, tenant or domain leaks (denial privacy). It reads; it writes nothing (opening a link acknowledges nothing).
--
-- THREE CLAIMS: construction (this file, apps/api/src/shell/navigation, apps/web/components/shell.tsx, lib/shell-b80.ts and the harness
-- phase6-navigation-b80); demonstrated operation (the act's deep-link scene on SYNTHETIC NORDWERK records); real acceptance (H3) — never
-- claimed here (the non-demonstration recording path is construction at B111).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §SH.0 THE VOCABULARY ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* The shell's workspaces (apps/web/lib/b80-seams.ts WorkspaceKey) and the route prefix each one's own locations live under. */
CREATE OR REPLACE FUNCTION shell.workspace_prefix(p_workspace text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_workspace WHEN 'admin' THEN '/admin' WHEN 'home' THEN '/home' WHEN 'decisions' THEN '/decisions' WHEN 'graph' THEN '/graph'
    WHEN 'intelligence' THEN '/intelligence' WHEN 'observation' THEN '/observation' WHEN 'prediction' THEN '/prediction' WHEN 'twins' THEN '/twins' END $$;
CREATE OR REPLACE FUNCTION shell.workspace_keys() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['admin', 'home', 'decisions', 'graph', 'intelligence', 'observation', 'prediction', 'twins'] $$;
/* A location the shell may name: an absolute in-app path (never a scheme, a host, `//` or `..`), optionally with a plain query. */
CREATE OR REPLACE FUNCTION shell.route_ok(p_route text, p_query boolean) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p_route IS NOT NULL AND length(p_route) BETWEEN 1 AND 600 AND position('//' in p_route) = 0 AND position('..' in p_route) = 0
     AND (CASE WHEN p_query THEN p_route ~ '^/[A-Za-z0-9/_.~%-]*(\?[A-Za-z0-9=&_.~%+:,-]*)?$' ELSE p_route ~ '^/[A-Za-z0-9/_.~%-]*$' END) $$;
GRANT EXECUTE ON FUNCTION shell.workspace_prefix(text), shell.workspace_keys(), shell.route_ok(text, boolean) TO eye_app, eye_commit;

-- §SH.1 THE NAVIGATION STATES ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE shell.navigation_states (
  state_id        uuid PRIMARY KEY,
  principal_id    uuid NOT NULL,
  scope           text NOT NULL CHECK (scope IN ('PLATFORM', 'TENANT', 'DOMAIN')),
  tenant_id       uuid,
  domain_id       uuid,
  workspace       text NOT NULL CHECK (workspace = ANY (shell.workspace_keys())),
  version         int NOT NULL CHECK (version >= 1),
  supersedes      uuid REFERENCES shell.navigation_states (state_id),
  location        jsonb NOT NULL CHECK (jsonb_typeof(location) = 'object' AND length(location::text) <= 16384),
  return_path     text CHECK (return_path IS NULL OR shell.route_ok(return_path, true)),
  focus_target    text CHECK (focus_target IS NULL OR focus_target ~ '^[A-Za-z][A-Za-z0-9_:-]{0,80}$'),
  recent          jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(recent) = 'array' AND jsonb_array_length(recent) <= 20),
  favorites       jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(favorites) = 'array' AND jsonb_array_length(favorites) <= 50),
  digest          text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  saved_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT nav_scope_shape CHECK ((scope = 'PLATFORM' AND tenant_id IS NULL AND domain_id IS NULL) OR (scope <> 'PLATFORM' AND tenant_id IS NOT NULL AND domain_id IS NOT NULL)),
  CONSTRAINT nav_workspace_scope CHECK ((workspace = 'admin') = (scope = 'PLATFORM')),
  CONSTRAINT nav_version_chain CHECK ((version = 1) = (supersedes IS NULL)),
  CONSTRAINT nav_route_in_workspace CHECK (shell.route_ok(location ->> 'route', false)
    AND ((location ->> 'route') = shell.workspace_prefix(workspace) OR (location ->> 'route') LIKE shell.workspace_prefix(workspace) || '/%'))
);
CREATE UNIQUE INDEX nav_one_version ON shell.navigation_states (principal_id, workspace, domain_id, version) NULLS NOT DISTINCT;
CREATE UNIQUE INDEX nav_one_successor ON shell.navigation_states (supersedes) WHERE supersedes IS NOT NULL;
CREATE INDEX nav_principal ON shell.navigation_states (principal_id, workspace, saved_at DESC);
CREATE TRIGGER nav_append_only BEFORE UPDATE OR DELETE ON shell.navigation_states FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
ALTER TABLE shell.navigation_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE shell.navigation_states FORCE ROW LEVEL SECURITY;
/* a principal reads its OWN navigation states only (a principal id is global: the same domain's colleague reads none of them) */
CREATE POLICY nav_own ON shell.navigation_states FOR SELECT TO eye_app, eye_commit USING (principal_id = public.eye_principal());
GRANT SELECT ON shell.navigation_states TO eye_app, eye_commit;
COMMENT ON TABLE shell.navigation_states IS 'B80 §SH (0118): a principal''s own navigation position per workspace and domain — append-only versions, presentation only (locations, never a command).';

/* The location's shape, validated key by key (an unknown key is refused, never stored): what PR-05-002 / UX-11-002 name and nothing else. */
CREATE OR REPLACE FUNCTION shell.location_problem(p jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = shell, pg_catalog, pg_temp AS $$
DECLARE k text; v jsonb; e jsonb;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN RETURN 'the location is an object'; END IF;
  FOR k, v IN SELECT * FROM jsonb_each(p) LOOP
    IF k NOT IN ('route', 'section', 'query', 'filters', 'view', 'selection', 'object', 'task', 'title') THEN
      RETURN format('the location carries no key %s (route, section, query, filters, view, selection, object, task, title)', k);
    END IF;
  END LOOP;
  IF NOT shell.route_ok(p ->> 'route', false) THEN RETURN 'the route is an absolute in-app path (no scheme, host, query, // or ..)'; END IF;
  IF p ? 'section' AND NOT (jsonb_typeof(p -> 'section') = 'string' AND (p ->> 'section') ~ '^[A-Za-z0-9 _.:-]{1,80}$') THEN RETURN 'the section is a short name'; END IF;
  IF p ? 'title' AND NOT (jsonb_typeof(p -> 'title') = 'string' AND length(p ->> 'title') BETWEEN 1 AND 160) THEN RETURN 'the title is a short text'; END IF;
  IF p ? 'view' AND NOT (jsonb_typeof(p -> 'view') = 'string' AND (p ->> 'view') ~ '^[A-Za-z0-9 _.:-]{1,80}$') THEN RETURN 'the view is a short name'; END IF;
  IF p ? 'query' AND NOT (jsonb_typeof(p -> 'query') = 'string' AND length(p ->> 'query') <= 1024 AND (p ->> 'query') ~ '^[A-Za-z0-9=&_.~%+:,-]*$') THEN RETURN 'the query is a plain query string'; END IF;
  IF p ? 'filters' THEN
    IF jsonb_typeof(p -> 'filters') <> 'object' OR (SELECT count(*) FROM jsonb_object_keys(p -> 'filters')) > 20 THEN RETURN 'the filters are at most 20 named values'; END IF;
    FOR k, v IN SELECT * FROM jsonb_each(p -> 'filters') LOOP
      IF k !~ '^[A-Za-z][A-Za-z0-9_.-]{0,60}$' OR jsonb_typeof(v) <> 'string' OR length(v #>> '{}') > 200 THEN RETURN format('the filter %s is a named short text', k); END IF;
    END LOOP;
  END IF;
  IF p ? 'selection' THEN
    IF jsonb_typeof(p -> 'selection') <> 'array' OR jsonb_array_length(p -> 'selection') > 50 THEN RETURN 'the selection is at most 50 objects'; END IF;
    FOR e IN SELECT * FROM jsonb_array_elements(p -> 'selection') LOOP
      IF shell.object_problem(e) IS NOT NULL THEN RETURN 'a selected object ' || shell.object_problem(e); END IF;
    END LOOP;
  END IF;
  IF p ? 'object' AND jsonb_typeof(p -> 'object') <> 'null' AND shell.object_problem(p -> 'object') IS NOT NULL THEN RETURN 'the work object ' || shell.object_problem(p -> 'object'); END IF;
  IF p ? 'task' AND jsonb_typeof(p -> 'task') <> 'null' AND shell.object_problem(p -> 'task') IS NOT NULL THEN RETURN 'the task ' || shell.object_problem(p -> 'task'); END IF;
  RETURN NULL;
END $$;
/* An object reference: its kind, its id, and (optionally) the exact version and the as-of instant it was seen at. */
CREATE OR REPLACE FUNCTION shell.object_problem(o jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = shell, pg_catalog, pg_temp AS $$
DECLARE k text;
BEGIN
  IF o IS NULL OR jsonb_typeof(o) <> 'object' THEN RETURN 'is {kind, id, version?, as_of?}'; END IF;
  FOR k IN SELECT jsonb_object_keys(o) LOOP
    IF k NOT IN ('kind', 'id', 'version', 'as_of') THEN RETURN format('carries no key %s', k); END IF;
  END LOOP;
  IF NOT ((o ->> 'kind') ~ '^[a-z][a-z_]{1,40}$') THEN RETURN 'names its kind'; END IF;
  IF NOT ((o ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN RETURN 'names its id'; END IF;
  IF o ? 'version' AND NOT (jsonb_typeof(o -> 'version') = 'number' AND (o ->> 'version') ~ '^[0-9]{1,9}$') THEN RETURN 'names a whole version'; END IF;
  IF o ? 'as_of' AND NOT (jsonb_typeof(o -> 'as_of') = 'string' AND (o ->> 'as_of') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+(Z|[+-][0-9]{2}:[0-9]{2})$') THEN RETURN 'names an ISO instant as its as-of'; END IF;
  RETURN NULL;
END $$;
/* A recent / favourite entry: an in-app location and its short title. */
CREATE OR REPLACE FUNCTION shell.places_problem(p jsonb, p_max int) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = shell, pg_catalog, pg_temp AS $$
DECLARE e jsonb; k text;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'array' OR jsonb_array_length(p) > p_max THEN RETURN format('is a list of at most %s places', p_max); END IF;
  FOR e IN SELECT * FROM jsonb_array_elements(p) LOOP
    IF jsonb_typeof(e) <> 'object' THEN RETURN 'is a list of {route, title}'; END IF;
    FOR k IN SELECT jsonb_object_keys(e) LOOP IF k NOT IN ('route', 'title', 'at') THEN RETURN format('carries no key %s', k); END IF; END LOOP;
    IF NOT shell.route_ok(e ->> 'route', true) THEN RETURN 'names in-app locations only'; END IF;
    IF e ? 'title' AND NOT (jsonb_typeof(e -> 'title') = 'string' AND length(e ->> 'title') BETWEEN 1 AND 160) THEN RETURN 'titles each place in a short text'; END IF;
  END LOOP;
  RETURN NULL;
END $$;
GRANT EXECUTE ON FUNCTION shell.location_problem(jsonb), shell.object_problem(jsonb), shell.places_problem(jsonb, int) TO eye_app, eye_commit;

/* THE WRITE PORT (`shell.navigation.save`). */
CREATE OR REPLACE FUNCTION shell.save_navigation_state(
  p_state_id uuid, p_tenant uuid, p_domain uuid, p_workspace text, p_expected_version int, p_location jsonb, p_return_path text, p_focus text,
  p_recent jsonb, p_favorites jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shell, observation, identity, public, pg_catalog, pg_temp AS $$
DECLARE
  v_scope text := public.eye_scope();
  v_kind text; v_status text;
  v_cur shell.navigation_states%ROWTYPE;
  v_problem text; v_version int; v_digest text; v_row shell.navigation_states%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['shell.navigation.save']);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'navigation state rejected (actor): a navigation state is saved by its own principal, never on another''s behalf' USING ERRCODE = '42501';
  END IF;
  SELECT p.kind, p.status INTO v_kind, v_status FROM identity.principals p WHERE p.id = p_actor;
  IF v_kind IS DISTINCT FROM 'human' OR v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'navigation state rejected (actor): a navigation state is a named, active human''s own — an agent or a workload keeps none' USING ERRCODE = '42501';
  END IF;
  -- the scope is the ESTABLISHED context's, never an argument's: PLATFORM keeps no tenant or domain; otherwise both must be the bound ones
  IF v_scope = 'PLATFORM' THEN
    IF p_tenant IS NOT NULL OR p_domain IS NOT NULL THEN
      RAISE EXCEPTION 'navigation state rejected (access): a PLATFORM context saves a PLATFORM state (no tenant, no domain)' USING ERRCODE = '42501';
    END IF;
  ELSIF p_tenant IS NULL OR p_domain IS NULL OR p_tenant IS DISTINCT FROM public.eye_tenant()
        OR (v_scope = 'DOMAIN' AND p_domain IS DISTINCT FROM public.eye_domain()) THEN
    RAISE EXCEPTION 'navigation state rejected (access): the state is saved in the established context''s own tenant and domain' USING ERRCODE = '42501';
  END IF;
  IF p_workspace IS NULL OR NOT (p_workspace = ANY (shell.workspace_keys())) THEN
    RAISE EXCEPTION 'navigation state rejected (workspace): % is not a workspace of the shell (%)', coalesce(p_workspace, '<none>'), array_to_string(shell.workspace_keys(), ', ') USING ERRCODE = '22023';
  END IF;
  IF (p_workspace = 'admin') <> (v_scope = 'PLATFORM') THEN
    RAISE EXCEPTION 'navigation state rejected (workspace): the admin workspace is the PLATFORM''s; every other workspace is a domain''s' USING ERRCODE = '22023';
  END IF;
  v_problem := shell.location_problem(p_location);
  IF v_problem IS NOT NULL THEN RAISE EXCEPTION 'navigation state rejected (location): %', v_problem USING ERRCODE = '22023'; END IF;
  IF NOT ((p_location ->> 'route') = shell.workspace_prefix(p_workspace) OR (p_location ->> 'route') LIKE shell.workspace_prefix(p_workspace) || '/%') THEN
    RAISE EXCEPTION 'navigation state rejected (location): % is not a location of the % workspace (%…)', p_location ->> 'route', p_workspace, shell.workspace_prefix(p_workspace) USING ERRCODE = '22023';
  END IF;
  IF length(p_location::text) > 16384 THEN RAISE EXCEPTION 'navigation state rejected (location): the location is at most 16 KiB' USING ERRCODE = '22023'; END IF;
  IF p_return_path IS NOT NULL AND NOT shell.route_ok(p_return_path, true) THEN
    RAISE EXCEPTION 'navigation state rejected (return_path): the return path is an in-app location (no scheme, host, // or ..)' USING ERRCODE = '22023';
  END IF;
  IF p_focus IS NOT NULL AND p_focus !~ '^[A-Za-z][A-Za-z0-9_:-]{0,80}$' THEN
    RAISE EXCEPTION 'navigation state rejected (focus): the focus target is an element id' USING ERRCODE = '22023';
  END IF;
  v_problem := shell.places_problem(coalesce(p_recent, '[]'::jsonb), 20);
  IF v_problem IS NOT NULL THEN RAISE EXCEPTION 'navigation state rejected (recent): the recent list %', v_problem USING ERRCODE = '22023'; END IF;
  v_problem := shell.places_problem(coalesce(p_favorites, '[]'::jsonb), 50);
  IF v_problem IS NOT NULL THEN RAISE EXCEPTION 'navigation state rejected (favorites): the favourites %', v_problem USING ERRCODE = '22023'; END IF;
  IF p_expected_version IS NULL OR p_expected_version < 0 THEN
    RAISE EXCEPTION 'navigation state rejected (version): the save names the version it read (0 when there was none)' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_cur FROM shell.navigation_states s
   WHERE s.principal_id = p_actor AND s.workspace = p_workspace AND s.domain_id IS NOT DISTINCT FROM p_domain
   ORDER BY s.version DESC LIMIT 1 FOR UPDATE;
  v_version := coalesce(v_cur.version, 0);
  IF v_version <> p_expected_version THEN
    RAISE EXCEPTION 'navigation state rejected (stale): the saved % state is at version %; this save read version % — read it again (nothing was overwritten)', p_workspace, v_version, p_expected_version USING ERRCODE = '22023';
  END IF;
  v_digest := encode(sha256(convert_to(jsonb_build_object('workspace', p_workspace, 'location', p_location, 'return_path', p_return_path, 'focus', p_focus,
                                                           'recent', coalesce(p_recent, '[]'::jsonb), 'favorites', coalesce(p_favorites, '[]'::jsonb))::text, 'UTF8')), 'hex');
  INSERT INTO shell.navigation_states (state_id, principal_id, scope, tenant_id, domain_id, workspace, version, supersedes, location, return_path, focus_target, recent, favorites, digest, correlation_id)
  VALUES (p_state_id, p_actor, v_scope, p_tenant, p_domain, p_workspace, v_version + 1, v_cur.state_id, p_location, p_return_path, p_focus,
          coalesce(p_recent, '[]'::jsonb), coalesce(p_favorites, '[]'::jsonb), v_digest, p_correlation)
  RETURNING * INTO v_row;
  PERFORM shell.ledger(p_tenant, p_domain, p_actor, 'navigation_state', p_state_id, v_row.version, 'shell.navigation.saved',
                       jsonb_build_object('workspace', p_workspace, 'route', p_location ->> 'route', 'supersedes', v_cur.state_id, 'digest', v_digest), p_correlation);
  RETURN jsonb_build_object('state_id', v_row.state_id, 'workspace', v_row.workspace, 'version', v_row.version, 'supersedes', v_row.supersedes,
    'scope', v_row.scope, 'tenant_id', v_row.tenant_id, 'domain_id', v_row.domain_id, 'location', v_row.location, 'return_path', v_row.return_path,
    'focus_target', v_row.focus_target, 'recent', v_row.recent, 'favorites', v_row.favorites, 'digest', v_row.digest, 'saved_at', v_row.saved_at);
END $$;
REVOKE ALL ON FUNCTION shell.save_navigation_state(uuid, uuid, uuid, text, int, jsonb, text, text, jsonb, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.save_navigation_state(uuid, uuid, uuid, text, int, jsonb, text, text, jsonb, jsonb, uuid, uuid) TO eye_commit;

-- §SH.2 THE OWN READ ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION shell.navigation_states_of(p_principal uuid, p_tenant uuid, p_domain uuid, p_workspace text, p_history int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = shell, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_scope text := public.eye_scope(); v_out jsonb;
BEGIN
  IF p_principal IS NULL OR p_principal IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'navigation state rejected (actor): a principal reads only its own navigation state' USING ERRCODE = '42501';
  END IF;
  IF v_scope = 'PLATFORM' THEN
    IF p_tenant IS NOT NULL OR p_domain IS NOT NULL THEN
      RAISE EXCEPTION 'navigation state rejected (access): a PLATFORM context reads the PLATFORM states' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT observation.read_scope_ok(p_tenant, p_domain) OR p_domain IS NULL THEN
    RAISE EXCEPTION 'navigation state rejected (access): a navigation state is read only within the caller''s bound tenant and domain' USING ERRCODE = '42501';
  END IF;
  IF p_workspace IS NOT NULL AND NOT (p_workspace = ANY (shell.workspace_keys())) THEN
    RAISE EXCEPTION 'navigation state rejected (workspace): % is not a workspace of the shell', p_workspace USING ERRCODE = '22023';
  END IF;
  WITH mine AS (
    SELECT s.* FROM shell.navigation_states s
     WHERE s.principal_id = p_principal AND s.domain_id IS NOT DISTINCT FROM p_domain AND (p_workspace IS NULL OR s.workspace = p_workspace)
  ), cur AS (
    SELECT DISTINCT ON (workspace) * FROM mine ORDER BY workspace, version DESC
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'workspace', c.workspace,
      'current', jsonb_build_object('state_id', c.state_id, 'version', c.version, 'supersedes', c.supersedes, 'location', c.location, 'return_path', c.return_path,
                                    'focus_target', c.focus_target, 'recent', c.recent, 'favorites', c.favorites, 'digest', c.digest, 'saved_at', c.saved_at),
      'versions', (SELECT count(*) FROM mine m WHERE m.workspace = c.workspace),
      'history', (SELECT coalesce(jsonb_agg(jsonb_build_object('state_id', h.state_id, 'version', h.version, 'route', h.location ->> 'route', 'digest', h.digest, 'saved_at', h.saved_at) ORDER BY h.version DESC), '[]'::jsonb)
                    FROM (SELECT * FROM mine m WHERE m.workspace = c.workspace ORDER BY m.version DESC LIMIT greatest(0, least(coalesce(p_history, 5), 50))) h)
    ) ORDER BY c.workspace), '[]'::jsonb) INTO v_out FROM cur c;
  RETURN jsonb_build_object('principal_id', p_principal, 'scope', v_scope, 'tenant_id', p_tenant, 'domain_id', p_domain, 'read_at', clock_timestamp(), 'workspaces', v_out,
    'claim', 'the principal''s own navigation states — presentation only: locations and a return path, never a command; restoring one repeats nothing');
END $$;
REVOKE ALL ON FUNCTION shell.navigation_states_of(uuid, uuid, uuid, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.navigation_states_of(uuid, uuid, uuid, text, int) TO eye_app, eye_commit;

-- §SH.3 THE WARNING AS OF AN INSTANT (the deep-link scene) ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION prediction.warning_as_of(p_warning uuid, p_at timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = prediction, observation, public, pg_catalog, pg_temp AS $$
DECLARE
  w prediction.warnings_current%ROWTYPE;
  v_first timestamptz; v_raised jsonb; v_state_ev text; v_state text; v_ctx int; v_events jsonb; v_n int; v_total int; v_after int;
  v_last jsonb; v_last_current jsonb; v_changed jsonb := '[]'::jsonb; v_now timestamptz := clock_timestamp();
BEGIN
  SELECT * INTO w FROM prediction.warnings_current x WHERE x.warning_id = p_warning;
  -- DENIAL PRIVACY: a warning that does not exist and one outside the caller's scope answer the same words (no tenant, domain or existence)
  IF NOT FOUND OR NOT observation.read_scope_ok(w.tenant_id, w.domain_id) THEN
    RAISE EXCEPTION 'warning as-of rejected (unknown_warning): no authorized warning matches this link' USING ERRCODE = '23503';
  END IF;
  IF p_at IS NULL THEN RAISE EXCEPTION 'warning as-of rejected (instant): the link names the instant it opens the warning at' USING ERRCODE = '22023'; END IF;
  IF p_at > v_now THEN
    RAISE EXCEPTION 'warning as-of rejected (future): % is after now (%); a link opens a recorded state, never a future one', p_at, v_now USING ERRCODE = '22023';
  END IF;
  SELECT min(e.occurred_at) INTO v_first FROM prediction.warning_events e WHERE e.warning_id = p_warning;
  IF v_first IS NULL OR p_at < v_first THEN
    RAISE EXCEPTION 'warning as-of rejected (not_replayable): the warning has no recorded state at %; its history begins at % — open it at or after that instant, or open the current state', p_at, v_first USING ERRCODE = '22023';
  END IF;
  SELECT e.details INTO v_raised FROM prediction.warning_events e WHERE e.warning_id = p_warning AND e.event = 'warning.raised' AND e.occurred_at <= p_at ORDER BY e.occurred_at, e.event_id LIMIT 1;
  -- the STATE as of the instant: the last state event (raised → acknowledged | expired | closed), as decision.warning_state_as_of reads it
  SELECT e.event INTO v_state_ev FROM prediction.warning_events e
   WHERE e.warning_id = p_warning AND e.occurred_at <= p_at AND e.event IN ('warning.raised', 'warning.acknowledged', 'warning.expired', 'warning.closed')
   ORDER BY e.occurred_at DESC, e.event_id DESC LIMIT 1;
  v_state := CASE v_state_ev WHEN 'warning.raised' THEN 'raised' WHEN 'warning.acknowledged' THEN 'acknowledged' WHEN 'warning.expired' THEN 'expired' WHEN 'warning.closed' THEN 'closed' ELSE 'raised' END;
  SELECT coalesce((SELECT (e.details ->> 'context_version')::int FROM prediction.warning_events e WHERE e.warning_id = p_warning AND e.event = 'warning.context_set' AND e.occurred_at <= p_at
                    ORDER BY e.occurred_at DESC, e.event_id DESC LIMIT 1), 0) INTO v_ctx;
  SELECT coalesce(jsonb_agg(jsonb_build_object('event_id', e.event_id, 'event', e.event, 'occurred_at', e.occurred_at) ORDER BY e.occurred_at, e.event_id), '[]'::jsonb), count(*)
    INTO v_events, v_n FROM prediction.warning_events e WHERE e.warning_id = p_warning AND e.occurred_at <= p_at;
  SELECT count(*) INTO v_total FROM prediction.warning_events e WHERE e.warning_id = p_warning;
  v_after := v_total - v_n;
  v_last := v_events -> (v_n - 1);
  SELECT jsonb_build_object('event_id', e.event_id, 'event', e.event, 'occurred_at', e.occurred_at) INTO v_last_current
    FROM prediction.warning_events e WHERE e.warning_id = p_warning ORDER BY e.occurred_at DESC, e.event_id DESC LIMIT 1;
  IF v_state IS DISTINCT FROM w.state THEN v_changed := v_changed || jsonb_build_object('field', 'state', 'as_of', v_state, 'current', w.state); END IF;
  IF (v_raised ->> 'level') IS DISTINCT FROM w.level THEN v_changed := v_changed || jsonb_build_object('field', 'level', 'as_of', v_raised ->> 'level', 'current', w.level); END IF;
  IF v_ctx IS DISTINCT FROM w.context_version THEN v_changed := v_changed || jsonb_build_object('field', 'context_version', 'as_of', v_ctx, 'current', w.context_version); END IF;
  IF (v_raised ->> 'title') IS DISTINCT FROM w.title THEN v_changed := v_changed || jsonb_build_object('field', 'title', 'as_of', v_raised ->> 'title', 'current', w.title); END IF;
  RETURN jsonb_build_object(
    'warning_id', p_warning, 'at', p_at, 'read_at', v_now,
    'as_of', jsonb_build_object('state', v_state, 'title', v_raised ->> 'title', 'level', v_raised ->> 'level', 'urgency', v_raised ->> 'urgency',
                                'confidence', v_raised -> 'confidence', 'closes_at', v_raised ->> 'closes_at', 'routed_to', v_raised ->> 'routed_to',
                                'context_version', v_ctx, 'event_count', v_n, 'last_event', v_last, 'events', v_events),
    'current', jsonb_build_object('state', w.state, 'title', w.title, 'level', w.level, 'context_version', w.context_version, 'event_count', v_total,
                                  'last_event', v_last_current, 'attention_state', w.attention_state),
    'variance', jsonb_build_object('exact', v_after = 0, 'events_since', v_after, 'changed', v_changed,
      'statement', CASE WHEN v_after = 0 THEN 'no event was recorded after this instant: the as-of state is the current declared state'
                        ELSE format('%s event(s) were recorded after this instant; %s field(s) differ from the current declared state', v_after, jsonb_array_length(v_changed)) END),
    'first_event_at', v_first,
    'claim', 'the state recorded AS OF the instant, from the warning''s own append-only event history; opening it reads only — it acknowledges, approves and changes nothing');
END $$;
REVOKE ALL ON FUNCTION prediction.warning_as_of(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.warning_as_of(uuid, timestamptz) TO eye_app, eye_commit;

-- ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- §CB — THE CONTEXT BAR (F-P7-E-01) — folded from 0118_b80_x_cb.sql at integration
-- ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0118 §CB — CP-6 B80 part `cb`: THE OPERATING CONTEXT BAR AND SCOPE SWITCHING (F-P7-E-01; UX-10-001…006, CMP-010, PAT-02, UX-ADR-003,
-- REL-03, CAP-AU-04, CAP-EO-02). The part-local file, folded into 0118 at integration after §SH; it applies ALONE on 0001–0117 + the prelude.
--
-- What it builds on (unchanged): 0094 §0's executive.contexts (append-only, one current row per principal and domain), executive.set_context
-- (the port; `context rejected (stale)`), executive.current_context and executive.context_choices (the switcher's choices with staleness).
--
-- What it adds:
--   §CB.1 executive.context_setter_roles() — the HUMAN DOMAIN roles that may set a context (DESIGN D3: every human domain role; the agents,
--         the subscribers (workloads) and the external collaborator excluded). The PDP's `executive.context.set` rule carries the same list
--         (pdp.service.ts, the B80 cb block); the harness proves the two equal and every DOMAIN role classified.
--   §CB.2 executive.context_digest_of(…) — the context digest, the SAME formula 0094's set_context records (so a preview names the digest the
--         commit will record).
--   §CB.3 executive.context_bar(tenant, domain, principal) — THE BAR's read: the principal's current context in this domain with its titles,
--         its version (the count of its append-only rows), the staleness of what it names (reconciled on read: a context naming an objective
--         since closed is shown with that dimension UNRESOLVED, never as current), and the choices.
--   §CB.4 executive.context_impact(tenant, domain, principal, proposed …) — THE IMPACT PREVIEW (PAT-02, UX-10-003/-004): the changed
--         dimensions; the stale choices; the affected open work — the principal's drafts (kept: a draft is personal and never discarded by a
--         switch), open tasks, routed requests, open workspaces and rooms (kept: nothing is re-scoped; each names whether it is linked to the
--         old or the new objective / scenario); the home's sections (recomposed under the new context); the APPROVALS listed as UNAFFECTED
--         (an approval binds the version digest it read — a context switch changes no version, eligibility, evidence or policy scope); the
--         client-held previews (invalidated by the page's registry; the server holds none); and the IMPACT DIGEST the commit must present.
--   §CB.5 executive.commit_context(…) — THE DELIBERATE COMMIT: the human, the role, the staleness (an objective or scenario not active),
--         the basis (the context the preview was computed from is still current) and the impact digest (the affected work has not changed
--         since the preview) RE-CHECKED IN THE PORT, then 0094's set_context, then the shell ledger row `shell.context.committed`.
--
-- THE PRINCIPLES: a context switch is PRESENTATION — it never alters an approval, never re-scopes work, never discards a draft; it is never
-- silent (no commit without the preview's digest); a stale or unresolved dimension is never shown as current. THREE CLAIMS: this file and
-- its harness (phase6-context-b80.test.ts) are CONSTRUCTION; the act (act-b80, l.brandt's switch) is DEMONSTRATED OPERATION on SYNTHETIC
-- personas; real acceptance (UX-10-006) is the shared non-demonstration recording path at B111 (F-P7-E-17's design acceptance slice), then H3.
--
-- Refusals in the CLASS form, all under the noun `context` mapped by B36 home's rows (observation-errors.ts): `(actor)` 403, `(stale)` 409,
-- every other class 422.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §CB.1 THE ROLES THAT MAY SET A CONTEXT (D3) ──────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION executive.context_setter_roles() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  'domain_admin', 'domain_analyst', 'collection_manager', 'extraction_manager', 'resolution_manager',
  'decision_owner', 'decision_approver', 'decision_authority', 'executive', 'executive_operator', 'board_member',
  'strategy_owner', 'forecast_owner', 'twin_owner', 'simulation_operator',
  'knowledge_owner', 'record_authority', 'retention_steward', 'ontology_steward',
  'risk_owner', 'opportunity_sponsor', 'execution_authority', 'method_steward', 'constraint_steward', 'data_steward',
  'domain_specialist', 'product_analytics_owner', 'privacy_officer', 'product_analyst', 'support_engineer', 'enablement_assessor'] $$;
COMMENT ON FUNCTION executive.context_setter_roles() IS 'B80 §CB (0118): the human DOMAIN roles that may set an operating context (DESIGN D3) — agents, subscribers (workloads) and the external collaborator never; the PDP rule executive.context.set carries the same list';
GRANT EXECUTE ON FUNCTION executive.context_setter_roles() TO eye_app, eye_commit;

-- §CB.2 THE DIGEST (0094 set_context's formula, verbatim) ──────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION executive.context_digest_of(p_tenant uuid, p_domain uuid, p_objective uuid, p_horizon text, p_scenario uuid, p_classification text, p_effective_at timestamptz)
RETURNS text LANGUAGE sql STABLE SET search_path = public, pg_catalog, pg_temp AS $$
  SELECT encode(digest(concat_ws('|', p_tenant::text, p_domain::text, coalesce(p_objective::text, ''), p_horizon, coalesce(p_scenario::text, ''), p_classification, coalesce(p_effective_at::text, '')), 'sha256'), 'hex')
$$;
GRANT EXECUTE ON FUNCTION executive.context_digest_of(uuid, uuid, uuid, text, uuid, text, timestamptz) TO eye_app, eye_commit;

-- the subject of a dimension in words: the objective (a graph OBJ) or the scenario, its title and its liveness — NULL when unknown here
CREATE OR REPLACE FUNCTION executive.context_subject(p_tenant uuid, p_domain uuid, p_kind text, p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = executive, pg_catalog, pg_temp AS $$
  SELECT CASE
    WHEN p_id IS NULL THEN NULL
    WHEN p_kind = 'objective' THEN (SELECT jsonb_build_object('id', s.strategy_object_id, 'title', s.title, 'status', s.status, 'stale', s.status <> 'active')
                                       FROM graph.strategy_current s WHERE s.strategy_object_id = p_id AND s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.object_type = 'OBJ')
    ELSE (SELECT jsonb_build_object('id', x.scenario_id, 'title', x.title, 'status', x.state, 'stale', x.state <> 'active')
            FROM prediction.scenarios_current x WHERE x.scenario_id = p_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain)
  END
$$;
REVOKE ALL ON FUNCTION executive.context_subject(uuid, uuid, text, uuid) FROM PUBLIC;

-- the staleness of a named subject, in the port's words (NULL when it may be set)
CREATE OR REPLACE FUNCTION executive.context_stale_reason(p_tenant uuid, p_domain uuid, p_kind text, p_id uuid) RETURNS text
LANGUAGE plpgsql STABLE SET search_path = executive, pg_catalog, pg_temp AS $$
DECLARE s jsonb := executive.context_subject(p_tenant, p_domain, p_kind, p_id);
BEGIN
  IF p_id IS NULL THEN RETURN NULL; END IF;
  IF s IS NULL THEN
    RETURN format('context rejected (stale): %s %s is not %s of this domain', p_kind, p_id, CASE WHEN p_kind = 'objective' THEN 'a live strategy object' ELSE 'a scenario' END);
  END IF;
  IF (s ->> 'stale')::boolean THEN
    RETURN format('context rejected (stale): %s %s is %s; a stale %s cannot be set', p_kind, p_id, s ->> 'status', p_kind);
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION executive.context_stale_reason(uuid, uuid, text, uuid) FROM PUBLIC;

-- §CB.3 THE BAR'S READ ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION executive.context_bar(p_tenant uuid, p_domain uuid, p_principal uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = executive, pg_catalog, pg_temp AS $$
DECLARE c executive.contexts; v_version int; v_obj jsonb; v_scn jsonb; v_unresolved jsonb := '[]'::jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the operating context');
  IF p_principal IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'context rejected (actor): the operating context is read by the acting principal, for its own context' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO c FROM executive.contexts x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.principal_id = p_principal AND x.superseded_at IS NULL;
  SELECT count(*)::int INTO v_version FROM executive.contexts x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.principal_id = p_principal;
  IF c.context_id IS NOT NULL THEN
    v_obj := executive.context_subject(p_tenant, p_domain, 'objective', c.objective_id);
    v_scn := executive.context_subject(p_tenant, p_domain, 'scenario', c.scenario_id);
    /* RECONCILED ON READ (UX-10-002 / -005): a dimension naming a subject no longer live (or no longer readable) is UNRESOLVED — the bar
       keeps the last valid context and says which dimension it cannot honour; it is never shown as current. */
    IF c.objective_id IS NOT NULL AND (v_obj IS NULL OR (v_obj ->> 'stale')::boolean) THEN
      v_unresolved := v_unresolved || jsonb_build_object('dimension', 'objective', 'id', c.objective_id, 'status', coalesce(v_obj ->> 'status', 'unknown'),
                                                         'reason', executive.context_stale_reason(p_tenant, p_domain, 'objective', c.objective_id));
    END IF;
    IF c.scenario_id IS NOT NULL AND (v_scn IS NULL OR (v_scn ->> 'stale')::boolean) THEN
      v_unresolved := v_unresolved || jsonb_build_object('dimension', 'scenario', 'id', c.scenario_id, 'status', coalesce(v_scn ->> 'status', 'unknown'),
                                                         'reason', executive.context_stale_reason(p_tenant, p_domain, 'scenario', c.scenario_id));
    END IF;
  END IF;
  RETURN jsonb_build_object(
    'as_of', clock_timestamp(),
    'tenant_id', p_tenant, 'domain_id', p_domain, 'principal_id', p_principal,
    'current', CASE WHEN c.context_id IS NULL THEN NULL ELSE jsonb_build_object(
      'context_id', c.context_id, 'version', v_version, 'digest', c.digest, 'set_at', c.set_at,
      'objective', CASE WHEN c.objective_id IS NULL THEN NULL ELSE coalesce(v_obj, jsonb_build_object('id', c.objective_id, 'title', NULL, 'status', 'unknown', 'stale', true)) END,
      'horizon', c.horizon,
      'scenario', CASE WHEN c.scenario_id IS NULL THEN NULL ELSE coalesce(v_scn, jsonb_build_object('id', c.scenario_id, 'title', NULL, 'status', 'unknown', 'stale', true)) END,
      'classification', c.classification, 'effective_at', c.effective_at) END,
    'version', v_version,
    'unresolved', v_unresolved,
    'may_set', EXISTS (SELECT 1 FROM identity.role_bindings b JOIN identity.principals p ON p.id = b.principal_id
                        WHERE b.principal_id = p_principal AND b.revoked_at IS NULL AND p.kind = 'human' AND p.status = 'active'
                          AND ((b.scope = 'DOMAIN' AND b.tenant_id = p_tenant AND b.domain_id = p_domain AND b.role_code = ANY (executive.context_setter_roles()))
                               OR (b.scope = 'PLATFORM' AND b.role_code = 'platform_admin'))),
    'choices', executive.context_choices(p_tenant, p_domain));
END $$;
COMMENT ON FUNCTION executive.context_bar(uuid, uuid, uuid) IS 'B80 §CB (0118): the operating context bar''s read — the principal''s current context in the domain (titles, version, digest), its unresolved dimensions (reconciled on read), whether the principal may set one, and the choices with their staleness';
REVOKE ALL ON FUNCTION executive.context_bar(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.context_bar(uuid, uuid, uuid) TO eye_app, eye_commit;

-- §CB.4 THE IMPACT PREVIEW ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION executive.context_impact(p_tenant uuid, p_domain uuid, p_principal uuid, p_objective uuid, p_horizon text, p_scenario uuid,
                                                    p_classification text, p_effective_at timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = executive, pg_catalog, pg_temp AS $$
DECLARE
  c executive.contexts; v_now timestamptz := clock_timestamp(); v_limit int := 50;
  v_old_obj uuid; v_old_scn uuid; v_old_h text; v_old_cls text; v_old_eff timestamptz; v_old_digest text; v_new_digest text;
  v_changed jsonb := '[]'::jsonb; v_stale jsonb := '[]'::jsonb; v_reason text;
  v_drafts jsonb; v_tasks jsonb; v_requests jsonb; v_workspaces jsonb; v_rooms jsonb; v_approvals jsonb; v_ids jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the context impact');
  IF p_principal IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'context rejected (actor): the impact is read by the acting principal, for its own context' USING ERRCODE = '42501';
  END IF;
  IF p_horizon IS NULL OR p_horizon NOT IN ('30d', '90d', '12m', '36m') THEN
    RAISE EXCEPTION 'context rejected (horizon): the horizon is one of 30d, 90d, 12m, 36m' USING ERRCODE = '22023';
  END IF;
  IF p_classification IS NULL OR p_classification NOT IN ('public', 'internal', 'confidential', 'restricted') THEN
    RAISE EXCEPTION 'context rejected (classification): the classification ceiling is one of public, internal, confidential, restricted' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO c FROM executive.contexts x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.principal_id = p_principal AND x.superseded_at IS NULL;
  /* no context set: the reader's default — the whole domain, 90d, no scenario, the reader's own ceiling, effective now (0094 §0) */
  v_old_obj := c.objective_id; v_old_scn := c.scenario_id; v_old_h := coalesce(c.horizon, '90d'); v_old_cls := c.classification; v_old_eff := c.effective_at;
  v_old_digest := c.digest;
  v_new_digest := executive.context_digest_of(p_tenant, p_domain, p_objective, p_horizon, p_scenario, p_classification, p_effective_at);

  -- THE CHANGED DIMENSIONS (the tenant and the domain never change here: a different domain is a navigation, not a context)
  IF v_old_obj IS DISTINCT FROM p_objective THEN
    v_changed := v_changed || jsonb_build_object('dimension', 'objective', 'from', executive.context_subject(p_tenant, p_domain, 'objective', v_old_obj), 'from_id', v_old_obj,
                                                 'to', executive.context_subject(p_tenant, p_domain, 'objective', p_objective), 'to_id', p_objective);
  END IF;
  IF v_old_h IS DISTINCT FROM p_horizon THEN v_changed := v_changed || jsonb_build_object('dimension', 'horizon', 'from', v_old_h, 'to', p_horizon); END IF;
  IF v_old_scn IS DISTINCT FROM p_scenario THEN
    v_changed := v_changed || jsonb_build_object('dimension', 'scenario', 'from', executive.context_subject(p_tenant, p_domain, 'scenario', v_old_scn), 'from_id', v_old_scn,
                                                 'to', executive.context_subject(p_tenant, p_domain, 'scenario', p_scenario), 'to_id', p_scenario);
  END IF;
  IF v_old_cls IS DISTINCT FROM p_classification THEN v_changed := v_changed || jsonb_build_object('dimension', 'classification', 'from', v_old_cls, 'to', p_classification); END IF;
  IF v_old_eff IS DISTINCT FROM p_effective_at THEN v_changed := v_changed || jsonb_build_object('dimension', 'effective_at', 'from', v_old_eff, 'to', p_effective_at); END IF;

  -- THE STALE CHOICES (what the commit would refuse, in the port's words)
  v_reason := executive.context_stale_reason(p_tenant, p_domain, 'objective', p_objective);
  IF v_reason IS NOT NULL THEN v_stale := v_stale || jsonb_build_object('dimension', 'objective', 'id', p_objective, 'reason', v_reason); END IF;
  v_reason := executive.context_stale_reason(p_tenant, p_domain, 'scenario', p_scenario);
  IF v_reason IS NOT NULL THEN v_stale := v_stale || jsonb_build_object('dimension', 'scenario', 'id', p_scenario, 'reason', v_reason); END IF;

  -- THE AFFECTED OPEN WORK — each list complete in its count and its ids (the digest), its items bounded for the page
  /* the drafts (B80 integration: read from §CL-F's authoritative shell.drafts — the latest version of each draft; open while it is a SAVED
     version whose expiry has not passed; a discarded draft is closed). A switch never discards a draft: each is KEPT (the person may discard
     it explicitly). */
  WITH latest AS (
    SELECT DISTINCT ON (d.draft_id) d.draft_id AS subject_id, d.version, d.kind, d.form_key, d.summary, d.saved_at AS occurred_at, d.expires_at
      FROM shell.drafts d WHERE d.principal_id = p_principal AND d.tenant_id = p_tenant AND d.domain_id = p_domain
     ORDER BY d.draft_id, d.version DESC),
  opened AS (
    SELECT * FROM latest l WHERE l.kind = 'saved' AND l.expires_at > v_now)
  SELECT jsonb_build_object('count', count(*), 'ids', coalesce(jsonb_agg(o.subject_id ORDER BY o.subject_id), '[]'::jsonb),
           'items', coalesce((SELECT jsonb_agg(jsonb_build_object('draft_id', q.subject_id, 'form_key', q.form_key, 'title', q.summary, 'version', q.version,
                                                                   'saved_at', q.occurred_at, 'expires_at', q.expires_at, 'disposition', 'kept') ORDER BY q.occurred_at DESC)
                                FROM (SELECT * FROM opened ORDER BY occurred_at DESC LIMIT v_limit) q), '[]'::jsonb))
    INTO v_drafts FROM opened o;

  SELECT jsonb_build_object('count', count(*), 'ids', coalesce(jsonb_agg(t.task_id ORDER BY t.task_id), '[]'::jsonb),
           'items', coalesce((SELECT jsonb_agg(jsonb_build_object('task_id', q.task_id, 'kind', q.kind, 'title', q.title, 'state', q.state, 'deadline_at', q.deadline_at,
                                                                   'subject', q.subject, 'linked_to_old', (q.subject ->> 'id') IN (coalesce(v_old_obj::text, '-'), coalesce(v_old_scn::text, '-')),
                                                                   'linked_to_new', (q.subject ->> 'id') IN (coalesce(p_objective::text, '-'), coalesce(p_scenario::text, '-')),
                                                                   'disposition', 'kept') ORDER BY q.opened_at)
                                FROM (SELECT * FROM executive.human_tasks k WHERE k.tenant_id = p_tenant AND k.domain_id = p_domain AND k.assignee_principal_id = p_principal
                                         AND k.state IN ('open', 'escalated') ORDER BY k.opened_at LIMIT v_limit) q), '[]'::jsonb))
    INTO v_tasks FROM executive.human_tasks t
   WHERE t.tenant_id = p_tenant AND t.domain_id = p_domain AND t.assignee_principal_id = p_principal AND t.state IN ('open', 'escalated');

  SELECT jsonb_build_object('count', count(*), 'ids', coalesce(jsonb_agg(x.request_id ORDER BY x.request_id), '[]'::jsonb),
           'items', coalesce((SELECT jsonb_agg(jsonb_build_object('request_id', q.request_id, 'kind', q.kind, 'state', q.state, 'routed_to', q.routed_to, 'due_at', q.due_at,
                                                                   'subject', q.subject, 'linked_to_old', (q.subject ->> 'id') IN (coalesce(v_old_obj::text, '-'), coalesce(v_old_scn::text, '-')),
                                                                   'linked_to_new', (q.subject ->> 'id') IN (coalesce(p_objective::text, '-'), coalesce(p_scenario::text, '-')),
                                                                   'disposition', 'kept') ORDER BY q.requested_at)
                                FROM (SELECT * FROM executive.requests k WHERE k.tenant_id = p_tenant AND k.domain_id = p_domain AND k.requester_principal_id = p_principal
                                         AND k.state = 'routed' ORDER BY k.requested_at LIMIT v_limit) q), '[]'::jsonb))
    INTO v_requests FROM executive.requests x
   WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.requester_principal_id = p_principal AND x.state = 'routed';

  SELECT jsonb_build_object('count', count(*), 'ids', coalesce(jsonb_agg(w.workspace_id ORDER BY w.workspace_id), '[]'::jsonb),
           'items', coalesce((SELECT jsonb_agg(jsonb_build_object('workspace_id', q.workspace_id, 'title', q.title, 'purpose', q.purpose, 'classification_ceiling', q.classification_ceiling,
                                                                   'subject', q.subject, 'linked_to_old', (q.subject ->> 'id') IN (coalesce(v_old_obj::text, '-'), coalesce(v_old_scn::text, '-')),
                                                                   'linked_to_new', (q.subject ->> 'id') IN (coalesce(p_objective::text, '-'), coalesce(p_scenario::text, '-')),
                                                                   'disposition', 'kept') ORDER BY q.opened_at)
                                FROM (SELECT * FROM executive.collab_workspaces k WHERE k.tenant_id = p_tenant AND k.domain_id = p_domain AND k.state = 'open'
                                         AND (k.owner_principal_id = p_principal OR EXISTS (SELECT 1 FROM executive.collab_participants cp WHERE cp.workspace_id = k.workspace_id
                                                                                               AND cp.principal_id = p_principal AND cp.removed_at IS NULL))
                                       ORDER BY k.opened_at LIMIT v_limit) q), '[]'::jsonb))
    INTO v_workspaces FROM executive.collab_workspaces w
   WHERE w.tenant_id = p_tenant AND w.domain_id = p_domain AND w.state = 'open'
     AND (w.owner_principal_id = p_principal OR EXISTS (SELECT 1 FROM executive.collab_participants cp WHERE cp.workspace_id = w.workspace_id AND cp.principal_id = p_principal AND cp.removed_at IS NULL));

  SELECT jsonb_build_object('count', count(*), 'ids', coalesce(jsonb_agg(m.room_id ORDER BY m.room_id), '[]'::jsonb),
           'items', coalesce((SELECT jsonb_agg(jsonb_build_object('room_id', q.room_id, 'title', q.title, 'package_id', q.package_id, 'member_role', q.role, 'disposition', 'kept') ORDER BY q.opened_at)
                                FROM (SELECT rc.room_id, rc.title, rc.package_id, rc.opened_at, mm.role FROM executive.rooms_current rc JOIN executive.room_members mm ON mm.room_id = rc.room_id
                                       WHERE rc.tenant_id = p_tenant AND rc.domain_id = p_domain AND mm.principal_id = p_principal AND mm.removed_at IS NULL
                                       ORDER BY rc.opened_at LIMIT v_limit) q), '[]'::jsonb))
    INTO v_rooms FROM executive.room_members m
   WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain AND m.principal_id = p_principal AND m.removed_at IS NULL;

  /* THE APPROVALS — UNAFFECTED: each binds the version digest its approver read (0042); a context switch changes no version, no eligibility,
     no evidence and no policy scope, so no approval is invalidated by it. What the switch DOES invalidate is client-held: a preview or a pending
     command the page bound to the old context digest (the page's registry lists them beside this read). */
  SELECT jsonb_build_object('count', count(*), 'ids', coalesce(jsonb_agg(a.approval_id ORDER BY a.approval_id), '[]'::jsonb),
           'items', coalesce((SELECT jsonb_agg(jsonb_build_object('approval_id', q.approval_id, 'package_id', q.package_id, 'version', q.version, 'decision', q.decision,
                                                                   'version_digest', q.version_digest, 'expires_at', q.expires_at, 'effect', 'unaffected',
                                                                   'why', 'an approval binds the version digest it read; a context switch changes no version, eligibility, evidence or policy scope') ORDER BY q.recorded_at)
                                FROM (SELECT * FROM decision.approvals k WHERE k.tenant_id = p_tenant AND k.domain_id = p_domain AND k.approver_principal_id = p_principal
                                         AND k.revoked_at IS NULL AND k.expires_at > v_now ORDER BY k.recorded_at LIMIT v_limit) q), '[]'::jsonb))
    INTO v_approvals FROM decision.approvals a
   WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.approver_principal_id = p_principal AND a.revoked_at IS NULL AND a.expires_at > v_now;

  v_ids := jsonb_build_object('basis', c.context_id, 'proposed', v_new_digest, 'drafts', v_drafts -> 'ids', 'tasks', v_tasks -> 'ids', 'requests', v_requests -> 'ids',
                              'workspaces', v_workspaces -> 'ids', 'rooms', v_rooms -> 'ids', 'approvals', v_approvals -> 'ids');
  RETURN jsonb_build_object(
    'as_of', v_now, 'tenant_id', p_tenant, 'domain_id', p_domain, 'principal_id', p_principal,
    'basis', CASE WHEN c.context_id IS NULL THEN NULL ELSE jsonb_build_object('context_id', c.context_id, 'digest', c.digest, 'set_at', c.set_at) END,
    'current', jsonb_build_object('objective_id', v_old_obj, 'horizon', v_old_h, 'scenario_id', v_old_scn, 'classification', v_old_cls, 'effective_at', v_old_eff, 'digest', v_old_digest, 'set', c.context_id IS NOT NULL),
    'proposed', jsonb_build_object('objective', executive.context_subject(p_tenant, p_domain, 'objective', p_objective), 'objective_id', p_objective, 'horizon', p_horizon,
                                   'scenario', executive.context_subject(p_tenant, p_domain, 'scenario', p_scenario), 'scenario_id', p_scenario,
                                   'classification', p_classification, 'effective_at', p_effective_at, 'digest', v_new_digest),
    'changed', v_changed, 'unchanged', jsonb_array_length(v_changed) = 0, 'stale', v_stale, 'committable', jsonb_array_length(v_stale) = 0 AND jsonb_array_length(v_changed) > 0,
    'affected', jsonb_build_object('drafts', v_drafts - 'ids', 'tasks', v_tasks - 'ids', 'requests', v_requests - 'ids', 'workspaces', v_workspaces - 'ids', 'rooms', v_rooms - 'ids',
                                   'home', jsonb_build_object('sections', jsonb_build_array('priorities', 'intelligence', 'warnings', 'decisions', 'commitments', 'outcomes', 'cadence', 'attention queue'),
                                                              'effect', 'recomposed under the new context')),
    'approvals', (v_approvals - 'ids') || jsonb_build_object('effect', 'unaffected'),
    'previews', jsonb_build_object('held_by', 'client', 'effect', 'invalidated where bound to the old context digest',
                                   'note', 'previews and pending commands are held by the page; its registry lists and invalidates those bound to the old context digest — the server holds none'),
    'limit', v_limit,
    'impact_digest', encode(public.digest(v_ids::text, 'sha256'), 'hex'));
END $$;
COMMENT ON FUNCTION executive.context_impact(uuid, uuid, uuid, uuid, text, uuid, text, timestamptz) IS 'B80 §CB (0118; PAT-02, UX-10-003/-004): the impact preview of a proposed context switch — the changed dimensions, the stale choices, the affected open work (kept, never re-scoped), the approvals (unaffected: they bind version digests), the client-held previews (invalidated by the page), and the impact digest the commit presents';
REVOKE ALL ON FUNCTION executive.context_impact(uuid, uuid, uuid, uuid, text, uuid, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.context_impact(uuid, uuid, uuid, uuid, text, uuid, text, timestamptz) TO eye_app, eye_commit;

-- §CB.5 THE DELIBERATE COMMIT ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION executive.commit_context(
  p_context_id uuid, p_tenant uuid, p_domain uuid, p_objective uuid, p_horizon text, p_scenario uuid, p_classification text, p_effective_at timestamptz,
  p_basis_context uuid, p_impact_digest text, p_invalidated jsonb, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, pg_catalog, pg_temp AS $$
DECLARE v_current uuid; v_imp jsonb; v_set jsonb; v_reason text; v_event uuid; v_invalidated jsonb := coalesce(p_invalidated, '[]'::jsonb);
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.context.set']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'context rejected (actor): set by the acting principal' USING ERRCODE = '42501'; END IF;
  -- THE HUMAN AND THE ROLE, re-checked in the port (the PDP's human gate and its role list are the first line, not the only one)
  IF NOT EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = p_actor AND p.kind = 'human' AND p.status = 'active') THEN
    RAISE EXCEPTION 'context rejected (actor): a context is set by a named human — an agent or a workload never sets one' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.role_bindings b WHERE b.principal_id = p_actor AND b.revoked_at IS NULL
                    AND ((b.scope = 'DOMAIN' AND b.tenant_id = p_tenant AND b.domain_id = p_domain AND b.role_code = ANY (executive.context_setter_roles()))
                         OR (b.scope = 'PLATFORM' AND b.role_code = 'platform_admin'))) THEN
    RAISE EXCEPTION 'context rejected (actor): the acting principal holds no human domain role in this domain' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(v_invalidated) <> 'array' OR jsonb_array_length(v_invalidated) > 200
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_invalidated) e WHERE jsonb_typeof(e) <> 'string' OR length(e #>> '{}') NOT BETWEEN 1 AND 200) THEN
    RAISE EXCEPTION 'context rejected (previews): the invalidated previews are a list of at most 200 keys of 1–200 characters' USING ERRCODE = '22023';
  END IF;
  IF p_impact_digest IS NULL OR p_impact_digest !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'context rejected (preview): a context is committed only from its impact preview — the impact digest is required' USING ERRCODE = '22023';
  END IF;
  -- THE STALENESS, in the port (a closed objective or a closed scenario as well as an unknown one)
  v_reason := coalesce(executive.context_stale_reason(p_tenant, p_domain, 'objective', p_objective), executive.context_stale_reason(p_tenant, p_domain, 'scenario', p_scenario));
  IF v_reason IS NOT NULL THEN RAISE EXCEPTION '%', v_reason USING ERRCODE = '22023'; END IF;
  -- THE BASIS: the context the preview was computed from is still the current one (no switch over another's)
  SELECT context_id INTO v_current FROM executive.contexts x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.principal_id = p_actor AND x.superseded_at IS NULL FOR UPDATE;
  IF v_current IS DISTINCT FROM p_basis_context THEN
    RAISE EXCEPTION 'context rejected (stale): the context changed since the preview (previewed over %, current %); preview the switch again',
      coalesce(p_basis_context::text, 'none'), coalesce(v_current::text, 'none') USING ERRCODE = '22023';
  END IF;
  -- THE IMPACT: the affected work has not changed since the preview (never a switch the person did not see)
  v_imp := executive.context_impact(p_tenant, p_domain, p_actor, p_objective, p_horizon, p_scenario, p_classification, p_effective_at);
  IF (v_imp ->> 'impact_digest') IS DISTINCT FROM p_impact_digest THEN
    RAISE EXCEPTION 'context rejected (stale): the affected work changed since the preview (previewed %, now %); preview the switch again',
      left(p_impact_digest, 12), left(v_imp ->> 'impact_digest', 12) USING ERRCODE = '22023';
  END IF;
  IF (v_imp ->> 'unchanged')::boolean THEN
    RAISE EXCEPTION 'context rejected (unchanged): the proposed context is the current one; nothing to switch' USING ERRCODE = '22023';
  END IF;
  v_set := executive.set_context(p_context_id, p_tenant, p_domain, p_objective, p_horizon, p_scenario, p_classification, p_effective_at, p_actor, p_correlation);
  v_event := shell.ledger(p_tenant, p_domain, p_actor, 'context', p_context_id, (SELECT count(*)::int FROM executive.contexts x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.principal_id = p_actor),
    'shell.context.committed', jsonb_build_object(
      'supersedes', v_set -> 'supersedes', 'from_digest', v_imp #> '{current,digest}', 'to_digest', v_set -> 'digest',
      'changed', (SELECT coalesce(jsonb_agg(ch ->> 'dimension'), '[]'::jsonb) FROM jsonb_array_elements(v_imp -> 'changed') ch),
      'impact_digest', p_impact_digest,
      'kept', jsonb_build_object('drafts', v_imp #> '{affected,drafts,count}', 'tasks', v_imp #> '{affected,tasks,count}', 'requests', v_imp #> '{affected,requests,count}',
                                 'workspaces', v_imp #> '{affected,workspaces,count}', 'rooms', v_imp #> '{affected,rooms,count}'),
      'approvals_unaffected', v_imp #> '{approvals,count}',
      'invalidated_previews', v_invalidated, 'invalidated_by', 'client'), p_correlation);
  RETURN v_set || jsonb_build_object('impact_digest', p_impact_digest, 'changed', v_imp -> 'changed', 'approvals_unaffected', v_imp #> '{approvals,count}',
                                     'invalidated_previews', v_invalidated, 'ledger_event', v_event,
                                     'version', (SELECT count(*)::int FROM executive.contexts x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.principal_id = p_actor));
END $$ LANGUAGE plpgsql;
COMMENT ON FUNCTION executive.commit_context(uuid, uuid, uuid, uuid, text, uuid, text, timestamptz, uuid, text, jsonb, uuid, uuid) IS 'B80 §CB (0118; PAT-02): the deliberate commit of a previewed context switch — the human, the role, the staleness, the basis and the impact digest re-checked, then 0094''s set_context and the shell ledger row shell.context.committed';
REVOKE ALL ON FUNCTION executive.commit_context(uuid, uuid, uuid, uuid, text, uuid, text, timestamptz, uuid, text, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.commit_context(uuid, uuid, uuid, uuid, text, uuid, text, timestamptz, uuid, text, jsonb, uuid, uuid) TO eye_commit;
