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
