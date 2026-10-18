-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0119 §CT — CP-6 B81, part `ct`: CONTENT DESIGN, TERMINOLOGY AND CONTEXTUAL HELP (F-P7-E-18; V9 UX-69-001…006, UX-ADR-021, GLB-20 (V8, V9),
-- CNT-01…07/10/14/15/16) — THE GOVERNED PRODUCT LANGUAGE: one canonical term per concept (PLATFORM — the vendor's product language, not tenant
-- data), with its definition, its executive / analyst / operator explanations, its protected words (the truth, uncertainty and consequence
-- words no explanation may drop), its example and its required conditions (help never hides one), its non-canonical synonyms, the terms it
-- cites, the domain-glossary keys it LINKS (B90's products.glossary_terms — linked by key and read side by side, NEVER merged), its locale
-- and translation provenance, and the reading level of every explanation MEASURED IN THE PORT. A contributor PROPOSES (or CORRECTS a
-- published term: original / replacement / impact / action); a named reviewer REVIEWS (the automated checks recorded); the Design System
-- Authority APPROVES and PUBLISHES — never the proposer, never an agent (governance.assert_approver, RE-CHECKED in every port) — and RETIRES.
-- Every term is registered on B107's artifact core (governance.artifacts kind 'terminology' — the kind the prelude added, 0119 §0.1; not
-- re-declared here) and ledgered (governance.events). Applies alone on top of 0001–0118 + the prelude (0119 §0). Re-declares nothing of an
-- earlier migration.
--
-- THE CHECKS are packages-free mirrors of apps/api/src/governance/design/terms/content-lint.ts (rules `b81-ct-terms-1`; the web model
-- apps/web/lib/content-b81.ts carries the same functions): a deterministic English READING GRADE (Flesch–Kincaid over letter-run words,
-- [.!?]-run sentences and a vowel-group syllable count, in EXACT INTEGER arithmetic — tenths rounded half up), the NO-DILUTION rule (every
-- explanation keeps the canonical label and every protected word, and implies no certainty the definition does not state — UX-69-004), and
-- the shape of an entry. phase6-terms-b81 proves the SQL equals the TS function by function.
--
-- THREE CLAIMS, never mixed: CONSTRUCTION (this migration and phase6-terms-b81); DEMONSTRATED OPERATION (the act — SYNTHETIC personas; every
-- term `claim = 'demonstration'`); REAL ACCEPTANCE (audience comprehension evidence with named executive, analyst and operator audiences;
-- the independent conformance package — the shared non-demonstration recording path at B111, then H3) — never claimed and not recordable.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §CT.1 THE CONSTANTS (IMMUTABLE; mirrors of content-lint.ts) ───────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION governance.term_rules_version() RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'b81-ct-terms-1' $$;
CREATE OR REPLACE FUNCTION governance.term_categories() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  'truth_state', 'lifecycle_state', 'action', 'object', 'concept', 'instruction', 'error', 'warning', 'label'] $$;
CREATE OR REPLACE FUNCTION governance.term_audiences() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['analyst', 'executive', 'operator'] $$;
/* The reading-grade CEILING of each audience's explanation (GLB-20): an explanation above it is never reviewed ready nor approved. */
CREATE OR REPLACE FUNCTION governance.term_reading_ceilings() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$ SELECT '{"analyst": 14, "executive": 10, "operator": 8}'::jsonb $$;
/* The words that IMPLY CERTAINTY OR AUTHORITY (UX-69-005): an explanation may use one only when the definition itself states it. */
CREATE OR REPLACE FUNCTION governance.term_certainty_words() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  'always', 'certain', 'certainly', 'confirmed', 'definitely', 'final', 'guaranteed', 'proven', 'undisputed', 'verified'] $$;
GRANT EXECUTE ON FUNCTION governance.term_rules_version(), governance.term_categories(), governance.term_audiences(), governance.term_reading_ceilings(),
  governance.term_certainty_words() TO eye_app, eye_commit;

-- §CT.2 THE CHECKS (IMMUTABLE; the TS mirrors are content-lint.ts and content-b81.ts) ─────────────────────────────────────────────────────────
/* The syllables of one word: letters only, lower-cased; ≤ 3 letters = 1; else the vowel groups ([aeiouy]+), less a silent final `e` (not
   `-le`), at least 1. */
CREATE OR REPLACE FUNCTION governance.term_syllables(p_word text) RETURNS int
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE WHEN length(w) = 0 THEN 0 WHEN length(w) <= 3 THEN 1
              ELSE greatest(1, (SELECT count(*)::int FROM regexp_matches(w, '[aeiouy]+', 'g')) - CASE WHEN w ~ 'e$' AND w !~ 'le$' THEN 1 ELSE 0 END) END
    FROM (SELECT lower(regexp_replace(coalesce(p_word, ''), '[^A-Za-z]', '', 'g')) AS w) x
$$;
/* THE READING GRADE (Flesch–Kincaid, deterministic): words = runs of letters after apostrophes are removed; sentences = runs of [.!?] (at
   least 1); grade = 0.39·W/S + 11.8·Y/W − 15.59, computed EXACTLY as tenths = round_half_up((39·W² + 1180·Y·S − 1559·S·W) / (10·S·W)),
   floored at 0 — no floating point, so the TS mirror equals it to the tenth. 0 for a text without words. */
CREATE OR REPLACE FUNCTION governance.term_reading_grade(p_text text) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE t text := regexp_replace(coalesce(p_text, ''), '[''’]', '', 'g'); w bigint; s bigint; y bigint; num numeric; den numeric; tenths numeric;
BEGIN
  SELECT count(*), coalesce(sum(governance.term_syllables(m.x[1])), 0) INTO w, y FROM regexp_matches(t, '([A-Za-z]+)', 'g') AS m(x);
  IF w = 0 THEN RETURN 0.0; END IF;
  SELECT greatest(1, count(*)) INTO s FROM regexp_matches(coalesce(p_text, ''), '[.!?]+', 'g');
  num := 39 * w * w + 1180 * y * s - 1559 * s * w;
  den := 10 * s * w;
  tenths := floor((2 * num + den) / (2 * den));
  RETURN round(greatest(0, tenths) / 10.0, 1);
END $$;
/* The reading grade of every explanation of an entry, by audience (sorted keys). */
CREATE OR REPLACE FUNCTION governance.term_reading_levels(p_explanations jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = governance, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_object_agg(k, governance.term_reading_grade(p_explanations ->> k) ORDER BY k), '{}'::jsonb)
    FROM jsonb_object_keys(CASE WHEN jsonb_typeof(p_explanations) = 'object' THEN p_explanations ELSE '{}'::jsonb END) k
$$;
/* NO DILUTION (UX-69-004, UX-ADR-021): NULL, or the FIRST problem ('dilution: …' | 'certainty: …') by audience (sorted), then protected word
   (sorted), then certainty word (the list's order) — content-lint.ts's order. */
CREATE OR REPLACE FUNCTION governance.term_dilution_problem(p_label text, p_definition text, p_protected text[], p_explanations jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE a text; e text; w text; c text;
BEGIN
  IF jsonb_typeof(p_explanations) IS DISTINCT FROM 'object' THEN RETURN NULL; END IF;
  FOR a IN SELECT k FROM jsonb_object_keys(p_explanations) k ORDER BY k LOOP
    e := lower(coalesce(p_explanations ->> a, ''));
    IF position(lower(btrim(coalesce(p_label, ''))) IN e) = 0 THEN
      RETURN format('dilution: the %s explanation drops the canonical term %s', a, btrim(p_label));
    END IF;
    FOR w IN SELECT x FROM unnest(coalesce(p_protected, '{}'::text[])) x ORDER BY x LOOP
      IF position(lower(btrim(w)) IN e) = 0 THEN
        RETURN format('dilution: the %s explanation drops "%s" (a protected truth, uncertainty or consequence word)', a, btrim(w));
      END IF;
    END LOOP;
    FOREACH c IN ARRAY governance.term_certainty_words() LOOP
      IF e ~ ('\m' || c || '\M') AND lower(coalesce(p_definition, '')) !~ ('\m' || c || '\M') THEN
        RETURN format('certainty: the %s explanation implies certainty or authority ("%s") the definition does not state', a, c);
      END IF;
    END LOOP;
  END LOOP;
  RETURN NULL;
END $$;
/* THE SHAPE of an entry: NULL, or '<class>: <message>' (the first problem in content-lint.ts's order). */
CREATE OR REPLACE FUNCTION governance.term_entry_problem(p jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE k text; v jsonb; x text; aud text[] := governance.term_audiences();
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN RETURN 'entry: a term entry is an object'; END IF;
  IF NOT (coalesce(p ->> 'category', '') = ANY (governance.term_categories())) THEN RETURN format('category: the category is one of %s', array_to_string(governance.term_categories(), ', ')); END IF;
  IF jsonb_typeof(p -> 'label') IS DISTINCT FROM 'string' OR length(btrim(p ->> 'label')) NOT BETWEEN 2 AND 120 THEN RETURN 'label: the canonical label is 2–120 characters'; END IF;
  IF jsonb_typeof(p -> 'definition') IS DISTINCT FROM 'string' OR length(btrim(p ->> 'definition')) NOT BETWEEN 8 AND 1000 THEN RETURN 'definition: a definition is 8–1000 characters'; END IF;
  IF jsonb_typeof(p -> 'explanations') IS DISTINCT FROM 'object' THEN RETURN 'explanation: the explanations are an object keyed by audience'; END IF;
  FOREACH k IN ARRAY aud LOOP
    IF jsonb_typeof(p -> 'explanations' -> k) IS DISTINCT FROM 'string' OR length(btrim(p -> 'explanations' ->> k)) NOT BETWEEN 8 AND 600 THEN
      RETURN format('explanation: the %s explanation is 8–600 characters (every audience is explained: %s)', k, array_to_string(aud, ', '));
    END IF;
  END LOOP;
  FOR k IN SELECT x2 FROM jsonb_object_keys(p -> 'explanations') x2 ORDER BY x2 LOOP
    IF NOT (k = ANY (aud)) THEN RETURN format('explanation: %s is not an audience (%s)', k, array_to_string(aud, ', ')); END IF;
  END LOOP;
  IF jsonb_typeof(p -> 'example') IS DISTINCT FROM 'string' OR length(btrim(p ->> 'example')) NOT BETWEEN 8 AND 600 THEN RETURN 'example: help carries an example of 8–600 characters (CNT-16)'; END IF;
  FOREACH k IN ARRAY ARRAY['protected', 'synonyms', 'conditions', 'cites', 'glossary_keys'] LOOP
    v := p -> k;
    IF v IS NULL OR v = 'null'::jsonb THEN CONTINUE; END IF;
    IF jsonb_typeof(v) <> 'array' OR jsonb_array_length(v) > 12 THEN RETURN format('%s: %s is a list of at most 12 texts', CASE k WHEN 'conditions' THEN 'condition' WHEN 'cites' THEN 'cite' WHEN 'glossary_keys' THEN 'glossary' WHEN 'synonyms' THEN 'synonym' ELSE k END, k); END IF;
    FOR x IN SELECT e FROM jsonb_array_elements_text(v) e LOOP
      IF k = 'protected' AND length(btrim(x)) NOT BETWEEN 2 AND 60 THEN RETURN 'protected: a protected word is 2–60 characters'; END IF;
      IF k = 'synonyms' AND length(btrim(x)) NOT BETWEEN 2 AND 120 THEN RETURN 'synonym: a synonym is 2–120 characters'; END IF;
      IF k = 'synonyms' AND lower(btrim(x)) = lower(btrim(p ->> 'label')) THEN RETURN 'synonym: a synonym is never the canonical label itself'; END IF;
      IF k = 'conditions' AND length(btrim(x)) NOT BETWEEN 8 AND 300 THEN RETURN 'condition: a required condition is 8–300 characters'; END IF;
      IF k = 'cites' AND x !~ '^[a-z][a-z0-9_.-]{2,80}$' THEN RETURN 'cite: a cited term is named by its key'; END IF;
      IF k = 'glossary_keys' AND (x <> lower(btrim(x)) OR length(x) NOT BETWEEN 2 AND 120) THEN RETURN 'glossary: a domain glossary key is the lower-cased term (2–120 characters)'; END IF;
    END LOOP;
  END LOOP;
  RETURN NULL;
END $$;
GRANT EXECUTE ON FUNCTION governance.term_syllables(text), governance.term_reading_grade(text), governance.term_reading_levels(jsonb),
  governance.term_dilution_problem(text, text, text[], jsonb), governance.term_entry_problem(jsonb) TO eye_app, eye_commit;

-- §CT.3 THE TABLES ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* THE TERMS (UX-69-002): one row per VERSION of a canonical term in one locale (term_id = the identity of key × locale). The content never
   changes after it is proposed (a change is a new version); only the state and its stamps move. At most ONE published version per key ×
   locale; a published version is superseded by the next one published (a correction keeps original, replacement, impact and action). A
   non-English entry carries its translation provenance (the English version it was translated from and the method) — B85 brings the Arabic
   catalogue; no locale is added here. `claim = 'demonstration'` (real audience comprehension evidence is B111 → H3). */
CREATE TABLE governance.terms (
  term_id          uuid NOT NULL,
  version          int  NOT NULL CHECK (version >= 1),
  scope            text NOT NULL DEFAULT 'PLATFORM' CHECK (scope = 'PLATFORM'),
  tenant_id        uuid CHECK (tenant_id IS NULL),
  domain_id        uuid CHECK (domain_id IS NULL),
  term_key         text NOT NULL CHECK (term_key ~ '^[a-z][a-z0-9_.-]{2,80}$'),
  locale           text NOT NULL DEFAULT 'en' CHECK (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  category         text NOT NULL CHECK (category = ANY (governance.term_categories())),
  label            text NOT NULL CHECK (length(btrim(label)) BETWEEN 2 AND 120),
  definition       text NOT NULL CHECK (length(btrim(definition)) BETWEEN 8 AND 1000),
  explanations     jsonb NOT NULL CHECK (jsonb_typeof(explanations) = 'object'),
  protected_words  text[] NOT NULL DEFAULT '{}',
  synonyms         text[] NOT NULL DEFAULT '{}',
  example          text NOT NULL,
  conditions       text[] NOT NULL DEFAULT '{}',
  cites            text[] NOT NULL DEFAULT '{}',
  glossary_keys    text[] NOT NULL DEFAULT '{}',
  reading_levels   jsonb NOT NULL CHECK (jsonb_typeof(reading_levels) = 'object'),
  translated_from  uuid,
  translated_from_version int,
  translation_method text CHECK (translation_method IS NULL OR translation_method IN ('human', 'machine')),
  corrects_version int,
  correction       jsonb CHECK (correction IS NULL OR jsonb_typeof(correction) = 'object'),
  state            text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'reviewed', 'returned', 'approved', 'published', 'superseded', 'retired')),
  rules_version    text NOT NULL,
  digest           text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  claim            text NOT NULL DEFAULT 'demonstration' CHECK (claim = 'demonstration'),
  proposed_by      uuid NOT NULL,
  proposed_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  approved_by      uuid,
  approved_at      timestamptz,
  approval_reason  text,
  published_by     uuid,
  published_at     timestamptz,
  publish_reason   text,
  superseded_at    timestamptz,
  retired_by       uuid,
  retired_at       timestamptz,
  retire_reason    text,
  correlation_id   uuid NOT NULL,
  PRIMARY KEY (term_id, version),
  CONSTRAINT gtm_key_version UNIQUE (term_key, locale, version),
  CONSTRAINT gtm_entry CHECK (governance.term_entry_problem(jsonb_build_object('category', category, 'label', label, 'definition', definition, 'explanations', explanations,
    'example', example, 'protected', to_jsonb(protected_words), 'synonyms', to_jsonb(synonyms), 'conditions', to_jsonb(conditions), 'cites', to_jsonb(cites),
    'glossary_keys', to_jsonb(glossary_keys))) IS NULL),
  CONSTRAINT gtm_no_dilution CHECK (governance.term_dilution_problem(label, definition, protected_words, explanations) IS NULL),
  CONSTRAINT gtm_translation CHECK ((locale = 'en') = (translated_from IS NULL) AND (translated_from IS NULL) = (translated_from_version IS NULL)
                                   AND (translated_from IS NULL) = (translation_method IS NULL)),
  CONSTRAINT gtm_correction CHECK ((corrects_version IS NULL) = (correction IS NULL)),
  CONSTRAINT gtm_approved CHECK (state NOT IN ('approved', 'published') OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  CONSTRAINT gtm_published CHECK (state <> 'published' OR (published_by IS NOT NULL AND published_at IS NOT NULL)),
  CONSTRAINT gtm_retired CHECK ((state = 'retired') = (retired_at IS NOT NULL) AND (retired_at IS NULL) = (retired_by IS NULL))
);
CREATE UNIQUE INDEX gtm_one_published ON governance.terms (term_key, locale) WHERE state = 'published';
CREATE INDEX gtm_key ON governance.terms (term_key, locale, version DESC);

/* THE REVIEWS (append-only; one per version): the reviewer (a named human — the Design System Authority or the conformance steward; never
   the proposer), the outcome (ready | changes_requested) and the AUTOMATED CHECKS recomputed in the port — dilution, the reading grade of
   every explanation against its audience's ceiling, the cited terms not yet published, the translation provenance. */
CREATE TABLE governance.term_reviews (
  review_id        uuid PRIMARY KEY,
  scope            text NOT NULL DEFAULT 'PLATFORM' CHECK (scope = 'PLATFORM'),
  tenant_id        uuid CHECK (tenant_id IS NULL),
  domain_id        uuid CHECK (domain_id IS NULL),
  term_id          uuid NOT NULL,
  term_version     int NOT NULL,
  term_digest      text NOT NULL CHECK (term_digest ~ '^[0-9a-f]{64}$'),
  outcome          text NOT NULL CHECK (outcome IN ('ready', 'changes_requested')),
  checks           jsonb NOT NULL CHECK (jsonb_typeof(checks) = 'object'),
  notes            text NOT NULL CHECK (length(btrim(notes)) >= 8),
  reviewer         uuid NOT NULL,
  reviewer_role    text NOT NULL CHECK (reviewer_role IN ('design_system_authority', 'conformance_steward')),
  claim            text NOT NULL DEFAULT 'demonstration' CHECK (claim = 'demonstration'),
  reviewed_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id   uuid NOT NULL,
  CONSTRAINT gtr_one_per_version UNIQUE (term_id, term_version),
  FOREIGN KEY (term_id, term_version) REFERENCES governance.terms (term_id, version)
);

CREATE TRIGGER gtr_append_only BEFORE UPDATE OR DELETE ON governance.term_reviews FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TRIGGER terms_never_delete BEFORE DELETE ON governance.terms FOR EACH ROW EXECUTE FUNCTION governance.dg_never_delete();
/* A term version's content never changes after it is proposed: only its state and the stamps of the acts move. */
CREATE OR REPLACE FUNCTION governance.term_content_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path = governance, pg_catalog, pg_temp AS $$
BEGIN
  IF (to_jsonb(NEW) - ARRAY['state', 'approved_by', 'approved_at', 'approval_reason', 'published_by', 'published_at', 'publish_reason', 'superseded_at', 'retired_by', 'retired_at', 'retire_reason'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['state', 'approved_by', 'approved_at', 'approval_reason', 'published_by', 'published_at', 'publish_reason', 'superseded_at', 'retired_by', 'retired_at', 'retire_reason']) THEN
    RAISE EXCEPTION 'design term rejected (state): a term version''s content is immutable — a change is a new version (a correction once published)' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER gtm_content_immutable BEFORE UPDATE ON governance.terms FOR EACH ROW EXECUTE FUNCTION governance.term_content_immutable();

-- RLS and grants: a version ever PUBLISHED (its history included — superseded and retired once-published versions) is the product's language
-- and readable by every authenticated context (the Term component renders it on every page); drafts, reviews and returns are the vendor's
-- registry (a PLATFORM context). SELECT only; the definer ports write.
REVOKE ALL ON governance.terms FROM PUBLIC;
ALTER TABLE governance.terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance.terms FORCE ROW LEVEL SECURITY;
CREATE POLICY governance_visibility ON governance.terms USING (published_at IS NOT NULL OR public.eye_scope() = 'PLATFORM');
GRANT SELECT ON governance.terms TO eye_app, eye_commit;
REVOKE ALL ON governance.term_reviews FROM PUBLIC;
ALTER TABLE governance.term_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance.term_reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY governance_visibility ON governance.term_reviews USING (public.eye_scope() = 'PLATFORM');
GRANT SELECT ON governance.term_reviews TO eye_app, eye_commit;

-- §CT.4 THE HELPERS ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* The digest of a term version's content. */
CREATE OR REPLACE FUNCTION governance.term_digest(t governance.terms) RETURNS text
LANGUAGE sql STABLE SET search_path = governance, pg_catalog, pg_temp AS $$
  SELECT governance.digest(jsonb_build_object('term_id', t.term_id, 'version', t.version, 'key', t.term_key, 'locale', t.locale, 'category', t.category, 'label', t.label,
    'definition', t.definition, 'explanations', t.explanations, 'protected', to_jsonb(t.protected_words), 'synonyms', to_jsonb(t.synonyms), 'example', t.example,
    'conditions', to_jsonb(t.conditions), 'cites', to_jsonb(t.cites), 'glossary_keys', to_jsonb(t.glossary_keys), 'reading_levels', t.reading_levels,
    'translated_from', t.translated_from, 'translated_from_version', t.translated_from_version, 'translation_method', t.translation_method,
    'corrects_version', t.corrects_version, 'correction', t.correction, 'rules_version', t.rules_version, 'claim', t.claim))
$$;
GRANT EXECUTE ON FUNCTION governance.term_digest(governance.terms) TO eye_app, eye_commit;

/* THE AUTOMATED CHECKS of a version (recorded by the review, re-run by the approval and the publication): dilution, the reading grade of
   every explanation against its audience's ceiling, the cited keys with no published version, the translation's source still in force. */
CREATE OR REPLACE FUNCTION governance.term_checks(t governance.terms) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE ceil jsonb := governance.term_reading_ceilings(); lv jsonb := governance.term_reading_levels(t.explanations); reading jsonb := '{}'::jsonb; a text; ok boolean := true;
        v_cites text[]; v_source text;
BEGIN
  FOR a IN SELECT k FROM jsonb_object_keys(lv) k ORDER BY k LOOP
    reading := reading || jsonb_build_object(a, jsonb_build_object('grade', lv -> a, 'ceiling', ceil -> a, 'pass', (lv ->> a)::numeric <= (ceil ->> a)::numeric));
    IF (lv ->> a)::numeric > (ceil ->> a)::numeric THEN ok := false; END IF;
  END LOOP;
  SELECT coalesce(array_agg(c ORDER BY c), '{}') INTO v_cites FROM unnest(t.cites) c
   WHERE NOT EXISTS (SELECT 1 FROM governance.terms x WHERE x.term_key = c AND x.locale = 'en' AND x.state = 'published');
  IF t.translated_from IS NOT NULL THEN
    v_source := CASE WHEN EXISTS (SELECT 1 FROM governance.terms s WHERE s.term_id = t.translated_from AND s.version = t.translated_from_version AND s.state = 'published' AND s.term_key = t.term_key)
                     THEN 'in_force' ELSE 'source_not_in_force' END;
  END IF;
  RETURN jsonb_build_object('rules_version', governance.term_rules_version(), 'dilution', governance.term_dilution_problem(t.label, t.definition, t.protected_words, t.explanations),
    'reading', reading, 'reading_pass', ok, 'unpublished_cites', to_jsonb(v_cites), 'translation', CASE WHEN t.translated_from IS NULL THEN NULL ELSE
      jsonb_build_object('from', t.translated_from, 'from_version', t.translated_from_version, 'method', t.translation_method, 'source', v_source) END);
END $$;
GRANT EXECUTE ON FUNCTION governance.term_checks(governance.terms) TO eye_app, eye_commit;

/* A TERMINOLOGY CONFLICT (UX-69-005): another key of the same locale whose PUBLISHED label or synonym equals this label or one of these
   synonyms (case-insensitive). NULL or the message. */
CREATE OR REPLACE FUNCTION governance.term_conflict(p_key text, p_locale text, p_label text, p_synonyms text[]) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
  SELECT format('the label or a synonym "%s" is already the published term %s (%s) — one canonical term per concept; reuse it or name the difference',
                w, x.term_key, x.label)
    FROM governance.terms x, unnest(ARRAY[lower(btrim(p_label))] || coalesce((SELECT array_agg(lower(btrim(s))) FROM unnest(p_synonyms) s), '{}')) w
   WHERE x.state = 'published' AND x.locale = p_locale AND x.term_key <> p_key
     AND (lower(btrim(x.label)) = w OR w = ANY (SELECT lower(btrim(s)) FROM unnest(x.synonyms) s))
   ORDER BY x.term_key, w LIMIT 1
$$;
REVOKE ALL ON FUNCTION governance.term_conflict(text, text, text, text[]) FROM PUBLIC;

/* The PLATFORM assertion of every term port (the route's action, PLATFORM scope, the acting principal). */
CREATE OR REPLACE FUNCTION governance.term_assert(p_action text, p_actor uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM governance.assert_platform(p_action, p_actor, 'design term');
END $$;
REVOKE ALL ON FUNCTION governance.term_assert(text, uuid) FROM PUBLIC;
/* A contributor's standing, RE-CHECKED in the port: a named active HUMAN holding a contributor role of the design system (PLATFORM). */
CREATE OR REPLACE FUNCTION governance.term_assert_contributor(p_actor uuid, p_what text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, onboarding, pg_catalog, pg_temp AS $$
BEGIN
  IF onboarding.principal_kind(p_actor) IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION 'design term rejected (actor): % is a named human''s act — an agent or a system never proposes, corrects, reviews, approves, publishes or retires product language', p_what USING ERRCODE = '42501';
  END IF;
  IF NOT governance.holds_role(p_actor, NULL, NULL, ARRAY['design_system_authority', 'product_authority', 'conformance_steward', 'operations_authority']) THEN
    RAISE EXCEPTION 'design term rejected (authority): % is the act of a contributor of the design system (the design system authority, the product authority, the conformance steward or the operations authority)', p_what USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION governance.term_assert_contributor(uuid, text) FROM PUBLIC;
/* The class and message of a '<class>: <message>' problem, raised in the class form. */
CREATE OR REPLACE FUNCTION governance.term_raise(p_problem text) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF p_problem IS NULL THEN RETURN; END IF;
  RAISE EXCEPTION 'design term rejected (%): %', split_part(p_problem, ': ', 1), substr(p_problem, length(split_part(p_problem, ': ', 1)) + 3) USING ERRCODE = '22023';
END $$;
REVOKE ALL ON FUNCTION governance.term_raise(text) FROM PUBLIC;
/* Register (or re-version) the term on the shared core (governance.artifacts kind 'terminology', PLATFORM): `active` while a version is
   published, else the latest version's state (proposed | quarantined when returned | retired) — dg_artifact's idiom, part ct. */
CREATE OR REPLACE FUNCTION governance.term_artifact(p_term uuid, p_actor uuid, p_corr uuid) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE cur governance.artifacts%ROWTYPE; l governance.terms%ROWTYPE; pub governance.terms%ROWTYPE; v int; v_life text; v_attrs jsonb; v_digest text;
BEGIN
  SELECT * INTO l FROM governance.terms x WHERE x.term_id = p_term ORDER BY x.version DESC LIMIT 1;
  SELECT * INTO pub FROM governance.terms x WHERE x.term_id = p_term AND x.state = 'published';
  v_life := CASE WHEN pub.term_id IS NOT NULL THEN 'active' WHEN l.state = 'retired' THEN 'retired' WHEN l.state = 'returned' THEN 'quarantined' WHEN l.state = 'superseded' THEN 'superseded' ELSE 'proposed' END;
  v_attrs := jsonb_build_object('class', 'canonical_term', 'locale', l.locale, 'category', l.category, 'latest_version', l.version, 'latest_state', l.state,
                                'published_version', pub.version, 'glossary_keys', to_jsonb(coalesce(pub.glossary_keys, l.glossary_keys)), 'claim', 'demonstration');
  v_digest := coalesce(pub.digest, l.digest);
  SELECT * INTO cur FROM governance.artifacts a WHERE a.artifact_id = p_term AND a.superseded_at IS NULL FOR UPDATE;
  IF FOUND AND cur.digest = v_digest AND cur.lifecycle = v_life AND cur.attributes = v_attrs THEN RETURN cur.version; END IF;
  IF FOUND THEN UPDATE governance.artifacts SET superseded_at = clock_timestamp() WHERE artifact_id = p_term AND version = cur.version; END IF;
  v := coalesce(cur.version, 0) + 1;
  INSERT INTO governance.artifacts (artifact_id, version, scope, tenant_id, domain_id, kind, external_key, title, owner_principal_id, owner_role, authority_class, controlling_volume,
                                    lifecycle, attributes, source, digest, recorded_by, correlation_id)
  VALUES (p_term, v, 'PLATFORM', NULL, NULL, 'terminology', 'TERM:' || l.term_key || '@' || l.locale, left(coalesce(pub.label, l.label), 500), NULL, 'design_system_authority',
          'design_system_authority', 'V9', v_life, v_attrs, jsonb_build_object('part', 'ct', 'migration', '0119 §CT'), v_digest, p_actor, p_corr);
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION governance.term_artifact(uuid, uuid, uuid) FROM PUBLIC;

/* Build and insert a proposed version from an entry (the shared body of propose and correct; the ports have asserted everything). */
CREATE OR REPLACE FUNCTION governance.term_insert(p_term uuid, p_version int, p_key text, p_locale text, p_entry jsonb, p_corrects int, p_correction jsonb, p_actor uuid, p_corr uuid) RETURNS governance.terms
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE r governance.terms%ROWTYPE;
        arr text[];
BEGIN
  r.term_id := p_term; r.version := p_version; r.scope := 'PLATFORM'; r.term_key := p_key; r.locale := p_locale;
  r.category := p_entry ->> 'category'; r.label := btrim(p_entry ->> 'label'); r.definition := btrim(p_entry ->> 'definition');
  r.explanations := (SELECT jsonb_object_agg(k, btrim(p_entry -> 'explanations' ->> k)) FROM jsonb_object_keys(p_entry -> 'explanations') k);
  SELECT coalesce(array_agg(btrim(e) ORDER BY o), '{}') INTO arr FROM jsonb_array_elements_text(coalesce(nullif(p_entry -> 'protected', 'null'::jsonb), '[]'::jsonb)) WITH ORDINALITY x(e, o); r.protected_words := arr;
  SELECT coalesce(array_agg(btrim(e) ORDER BY o), '{}') INTO arr FROM jsonb_array_elements_text(coalesce(nullif(p_entry -> 'synonyms', 'null'::jsonb), '[]'::jsonb)) WITH ORDINALITY x(e, o); r.synonyms := arr;
  SELECT coalesce(array_agg(btrim(e) ORDER BY o), '{}') INTO arr FROM jsonb_array_elements_text(coalesce(nullif(p_entry -> 'conditions', 'null'::jsonb), '[]'::jsonb)) WITH ORDINALITY x(e, o); r.conditions := arr;
  SELECT coalesce(array_agg(e ORDER BY e), '{}') INTO arr FROM (SELECT DISTINCT e FROM jsonb_array_elements_text(coalesce(nullif(p_entry -> 'cites', 'null'::jsonb), '[]'::jsonb)) e) x; r.cites := arr;
  SELECT coalesce(array_agg(e ORDER BY e), '{}') INTO arr FROM (SELECT DISTINCT e FROM jsonb_array_elements_text(coalesce(nullif(p_entry -> 'glossary_keys', 'null'::jsonb), '[]'::jsonb)) e) x; r.glossary_keys := arr;
  r.example := btrim(p_entry ->> 'example');
  r.reading_levels := governance.term_reading_levels(r.explanations);
  IF p_locale <> 'en' THEN
    r.translated_from := nullif(p_entry -> 'translation' ->> 'from_term', '')::uuid; r.translated_from_version := (p_entry -> 'translation' ->> 'from_version')::int;
    r.translation_method := p_entry -> 'translation' ->> 'method';
  END IF;
  r.corrects_version := p_corrects; r.correction := p_correction;
  r.state := 'proposed'; r.rules_version := governance.term_rules_version(); r.claim := 'demonstration';
  r.proposed_by := p_actor; r.proposed_at := clock_timestamp(); r.correlation_id := p_corr;
  r.digest := repeat('0', 64);
  r.digest := governance.term_digest(r);
  INSERT INTO governance.terms SELECT r.*;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION governance.term_insert(uuid, int, text, text, jsonb, int, jsonb, uuid, uuid) FROM PUBLIC;

/* The checks of a proposal that refuse it at once: the shape, dilution, a conflict with another published term, the cited keys known, the
   translation's provenance (a non-English entry names the PUBLISHED English version of the same key it translates). */
CREATE OR REPLACE FUNCTION governance.term_assert_entry(p_key text, p_locale text, p_entry jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, pg_catalog, pg_temp AS $$
DECLARE c text; v_conf text; v_src governance.terms%ROWTYPE; syn text[];
BEGIN
  IF p_key IS NULL OR p_key !~ '^[a-z][a-z0-9_.-]{2,80}$' THEN RAISE EXCEPTION 'design term rejected (key): a term key is 3–81 lower-case letters, digits, dots, hyphens and underscores' USING ERRCODE = '22023'; END IF;
  IF p_locale IS NULL OR p_locale !~ '^[a-z]{2}(-[A-Z]{2})?$' THEN RAISE EXCEPTION 'design term rejected (locale): a locale is a language code (en, en-GB …)' USING ERRCODE = '22023'; END IF;
  PERFORM governance.term_raise(governance.term_entry_problem(p_entry));
  SELECT coalesce(array_agg(e), '{}') INTO syn FROM jsonb_array_elements_text(coalesce(nullif(p_entry -> 'synonyms', 'null'::jsonb), '[]'::jsonb)) e;
  PERFORM governance.term_raise(governance.term_dilution_problem(p_entry ->> 'label', p_entry ->> 'definition',
    (SELECT coalesce(array_agg(e), '{}') FROM jsonb_array_elements_text(coalesce(nullif(p_entry -> 'protected', 'null'::jsonb), '[]'::jsonb)) e), p_entry -> 'explanations'));
  v_conf := governance.term_conflict(p_key, p_locale, p_entry ->> 'label', syn);
  IF v_conf IS NOT NULL THEN RAISE EXCEPTION 'design term rejected (conflict): %', v_conf USING ERRCODE = '23505'; END IF;
  FOR c IN SELECT e FROM jsonb_array_elements_text(coalesce(nullif(p_entry -> 'cites', 'null'::jsonb), '[]'::jsonb)) e LOOP
    IF c = p_key THEN RAISE EXCEPTION 'design term rejected (cite): a term never cites itself' USING ERRCODE = '22023'; END IF;
    IF NOT EXISTS (SELECT 1 FROM governance.terms x WHERE x.term_key = c AND x.locale = 'en') THEN
      RAISE EXCEPTION 'design term rejected (unknown_term): the cited term % is not in the registry', c USING ERRCODE = '23503';
    END IF;
  END LOOP;
  IF p_locale = 'en' THEN
    IF p_entry ? 'translation' AND p_entry -> 'translation' <> 'null'::jsonb THEN RAISE EXCEPTION 'design term rejected (translation): the canonical English entry is not a translation' USING ERRCODE = '22023'; END IF;
  ELSE
    IF jsonb_typeof(p_entry -> 'translation') IS DISTINCT FROM 'object' OR coalesce(p_entry -> 'translation' ->> 'from_term', '') !~ '^[0-9a-f-]{36}$'
       OR jsonb_typeof(p_entry -> 'translation' -> 'from_version') IS DISTINCT FROM 'number' OR coalesce(p_entry -> 'translation' ->> 'method', '') NOT IN ('human', 'machine') THEN
      RAISE EXCEPTION 'design term rejected (translation): a translation states its provenance — the English term and version it translates and the method (human | machine)' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_src FROM governance.terms s WHERE s.term_id = (p_entry -> 'translation' ->> 'from_term')::uuid AND s.version = (p_entry -> 'translation' ->> 'from_version')::int;
    IF NOT FOUND OR v_src.locale <> 'en' OR v_src.term_key <> p_key THEN
      RAISE EXCEPTION 'design term rejected (unknown_term): the translation names no English version of %', p_key USING ERRCODE = '23503';
    END IF;
    IF v_src.state <> 'published' THEN
      RAISE EXCEPTION 'design term rejected (stale): % v% is %, not the published English term — translate the version in force', p_key, v_src.version, v_src.state USING ERRCODE = '23505';
    END IF;
  END IF;
END $$;
REVOKE ALL ON FUNCTION governance.term_assert_entry(text, text, jsonb) FROM PUBLIC;

-- §CT.5 THE PORTS ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* PROPOSE a term version (governance.design.term.propose; human-gated): a contributor — a named human (re-checked); the entry's shape, NO
   DILUTION, no conflict with another published term, the cited keys known, a translation's provenance; version N+1 of key × locale on the
   expected version (stale 409); a still-pending predecessor (proposed | reviewed | returned) is superseded; a key with a PUBLISHED version
   changes only through a correction; a retired key is never re-proposed. */
CREATE OR REPLACE FUNCTION governance.term_propose(p_term uuid, p_key text, p_locale text, p_expected_version int, p_entry jsonb, p_actor uuid, p_corr uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE cur governance.terms%ROWTYPE; r governance.terms%ROWTYPE; v_id uuid := p_term; v_locale text := coalesce(p_locale, 'en');
BEGIN
  PERFORM governance.term_assert('governance.design.term.propose', p_actor);
  PERFORM governance.term_assert_contributor(p_actor, 'proposing a term');
  PERFORM governance.term_assert_entry(p_key, v_locale, p_entry);
  PERFORM pg_advisory_xact_lock(hashtext('b81-term:' || p_key || '@' || v_locale));
  SELECT * INTO cur FROM governance.terms t WHERE t.term_key = p_key AND t.locale = v_locale ORDER BY t.version DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    IF v_id IS NOT NULL AND v_id <> cur.term_id THEN RAISE EXCEPTION 'design term rejected (duplicate): the key %@% already names term %', p_key, v_locale, cur.term_id USING ERRCODE = '23505'; END IF;
    v_id := cur.term_id;
  ELSIF v_id IS NOT NULL AND EXISTS (SELECT 1 FROM governance.terms t WHERE t.term_id = v_id) THEN
    RAISE EXCEPTION 'design term rejected (duplicate): term % carries another key', v_id USING ERRCODE = '23505';
  END IF;
  IF coalesce(p_expected_version, -1) <> coalesce(cur.version, 0) THEN
    RAISE EXCEPTION 'design term rejected (stale): the term %@% is at version %, not %', p_key, v_locale, coalesce(cur.version, 0), coalesce(p_expected_version::text, '<none>') USING ERRCODE = '23505';
  END IF;
  IF cur.state = 'retired' THEN RAISE EXCEPTION 'design term rejected (state): the term % is retired — a retired term is never re-proposed; use a new key', p_key USING ERRCODE = '23505'; END IF;
  IF EXISTS (SELECT 1 FROM governance.terms t WHERE t.term_id = cur.term_id AND t.state = 'published') THEN
    RAISE EXCEPTION 'design term rejected (state): the term % is published — a published term changes only through a correction (original, replacement, impact, action)', p_key USING ERRCODE = '23505';
  END IF;
  IF cur.state = 'approved' THEN RAISE EXCEPTION 'design term rejected (state): % v% is approved and awaits publication — publish or retire it first', p_key, cur.version USING ERRCODE = '23505'; END IF;
  v_id := coalesce(v_id, gen_random_uuid());
  IF cur.term_id IS NOT NULL AND cur.state IN ('proposed', 'reviewed', 'returned') THEN
    UPDATE governance.terms SET state = 'superseded', superseded_at = clock_timestamp() WHERE term_id = cur.term_id AND version = cur.version;
  END IF;
  r := governance.term_insert(v_id, coalesce(cur.version, 0) + 1, p_key, v_locale, p_entry, NULL, NULL, p_actor, p_corr);
  PERFORM governance.term_artifact(v_id, p_actor, p_corr);
  PERFORM governance.ledger(NULL, NULL, 'design_term', v_id, r.version, 'design.term_proposed', p_actor,
            jsonb_build_object('key', p_key, 'locale', v_locale, 'label', r.label, 'digest', r.digest, 'reading_levels', r.reading_levels,
                               'superseded', CASE WHEN cur.state IN ('proposed', 'reviewed', 'returned') THEN cur.version END), p_corr);
  RETURN jsonb_build_object('term_id', v_id, 'version', r.version, 'key', p_key, 'locale', v_locale, 'state', 'proposed', 'digest', r.digest, 'reading_levels', r.reading_levels, 'claim', 'demonstration');
END $$;
REVOKE ALL ON FUNCTION governance.term_propose(uuid, text, text, int, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.term_propose(uuid, text, text, int, jsonb, uuid, uuid) TO eye_commit;

/* CORRECT a published term (governance.design.term.correct; human-gated; CNT-14): a contributor (re-checked) proposes the REPLACEMENT as
   version N+1 on the expected (latest) version, recording the ORIGINAL (the published version: label, definition, digest), the replacement,
   the IMPACT and the ACTION; the correction is reviewed, approved and published like any version (the published original stays in force
   until then). A still-pending earlier correction is superseded. */
CREATE OR REPLACE FUNCTION governance.term_correct(p_term uuid, p_expected_version int, p_entry jsonb, p_impact text, p_action text, p_actor uuid, p_corr uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE cur governance.terms%ROWTYPE; pub governance.terms%ROWTYPE; r governance.terms%ROWTYPE; v_corr jsonb;
BEGIN
  PERFORM governance.term_assert('governance.design.term.correct', p_actor);
  PERFORM governance.term_assert_contributor(p_actor, 'correcting a term');
  SELECT * INTO cur FROM governance.terms t WHERE t.term_id = p_term ORDER BY t.version DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'design term rejected (unknown_term): no term %', p_term USING ERRCODE = '23503'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('b81-term:' || cur.term_key || '@' || cur.locale));
  SELECT * INTO cur FROM governance.terms t WHERE t.term_id = p_term ORDER BY t.version DESC LIMIT 1 FOR UPDATE;
  SELECT * INTO pub FROM governance.terms t WHERE t.term_id = p_term AND t.state = 'published';
  IF NOT FOUND THEN RAISE EXCEPTION 'design term rejected (state): % has no published version — a term not yet published is revised by a new proposal', cur.term_key USING ERRCODE = '23505'; END IF;
  IF coalesce(p_expected_version, -1) <> cur.version THEN
    RAISE EXCEPTION 'design term rejected (stale): the term % is at version %, not %', cur.term_key, cur.version, coalesce(p_expected_version::text, '<none>') USING ERRCODE = '23505';
  END IF;
  IF cur.state = 'approved' THEN RAISE EXCEPTION 'design term rejected (state): % v% is an approved correction awaiting publication — publish or retire it first', cur.term_key, cur.version USING ERRCODE = '23505'; END IF;
  IF length(btrim(coalesce(p_impact, ''))) < 8 OR length(btrim(coalesce(p_action, ''))) < 8 THEN
    RAISE EXCEPTION 'design term rejected (correction): a correction states its impact and the action readers take (8+ characters each)' USING ERRCODE = '22023';
  END IF;
  PERFORM governance.term_assert_entry(cur.term_key, cur.locale, p_entry);
  IF lower(btrim(p_entry ->> 'label')) = lower(pub.label) AND btrim(p_entry ->> 'definition') = pub.definition AND (p_entry -> 'explanations') = pub.explanations THEN
    RAISE EXCEPTION 'design term rejected (correction): the replacement changes nothing of the published label, definition or explanations' USING ERRCODE = '22023';
  END IF;
  IF cur.state IN ('proposed', 'reviewed', 'returned') THEN
    UPDATE governance.terms SET state = 'superseded', superseded_at = clock_timestamp() WHERE term_id = cur.term_id AND version = cur.version;
  END IF;
  v_corr := jsonb_build_object('original', jsonb_build_object('version', pub.version, 'label', pub.label, 'definition', pub.definition, 'digest', pub.digest),
                               'replacement', jsonb_build_object('label', btrim(p_entry ->> 'label'), 'definition', btrim(p_entry ->> 'definition')),
                               'impact', btrim(p_impact), 'action', btrim(p_action));
  r := governance.term_insert(p_term, cur.version + 1, cur.term_key, cur.locale, p_entry, pub.version, v_corr, p_actor, p_corr);
  PERFORM governance.term_artifact(p_term, p_actor, p_corr);
  PERFORM governance.ledger(NULL, NULL, 'design_term', p_term, r.version, 'design.term_correction_proposed', p_actor,
            jsonb_build_object('key', cur.term_key, 'locale', cur.locale, 'digest', r.digest, 'correction', v_corr), p_corr);
  RETURN jsonb_build_object('term_id', p_term, 'version', r.version, 'key', cur.term_key, 'locale', cur.locale, 'state', 'proposed', 'digest', r.digest, 'corrects_version', pub.version,
                            'correction', v_corr, 'claim', 'demonstration');
END $$;
REVOKE ALL ON FUNCTION governance.term_correct(uuid, int, jsonb, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.term_correct(uuid, int, jsonb, text, text, uuid, uuid) TO eye_commit;

/* REVIEW a proposed version (governance.design.term.review; human-gated): a named human reviewer — the Design System Authority or the
   conformance steward, never the proposer; on the digest shown (stale 409); the AUTOMATED CHECKS recomputed here and recorded: `ready` is
   refused while an explanation exceeds its audience's reading ceiling (reading_level) or dilutes the term; `changes_requested` returns it. */
CREATE OR REPLACE FUNCTION governance.term_review(p_term uuid, p_version int, p_digest text, p_outcome text, p_notes text, p_actor uuid, p_corr uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, onboarding, public, pg_catalog, pg_temp AS $$
DECLARE t governance.terms%ROWTYPE; ch jsonb; v_id uuid := gen_random_uuid(); v_role text; v_state text;
BEGIN
  PERFORM governance.term_assert('governance.design.term.review', p_actor);
  SELECT * INTO t FROM governance.terms x WHERE x.term_id = p_term AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'design term rejected (unknown_term): no term %/v%', p_term, p_version USING ERRCODE = '23503'; END IF;
  IF onboarding.principal_kind(p_actor) IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION 'design term rejected (actor): reviewing a term is a named human''s act — an agent may draft, never review' USING ERRCODE = '42501';
  END IF;
  v_role := CASE WHEN governance.holds_role(p_actor, NULL, NULL, ARRAY['design_system_authority']) THEN 'design_system_authority'
                 WHEN governance.holds_role(p_actor, NULL, NULL, ARRAY['conformance_steward']) THEN 'conformance_steward' END;
  IF v_role IS NULL THEN RAISE EXCEPTION 'design term rejected (authority): reviewing a term is the act of the design system authority or the conformance steward' USING ERRCODE = '42501'; END IF;
  IF p_actor = t.proposed_by THEN RAISE EXCEPTION 'design term rejected (separation_of_duties): reviewing a term is never done by its proposer' USING ERRCODE = '42501'; END IF;
  IF t.state <> 'proposed' THEN RAISE EXCEPTION 'design term rejected (state): % v% is %, not proposed', t.term_key, p_version, t.state USING ERRCODE = '23505'; END IF;
  IF p_digest IS DISTINCT FROM t.digest THEN RAISE EXCEPTION 'design term rejected (stale): the review names a digest other than % v%''s — read it again', t.term_key, p_version USING ERRCODE = '23505'; END IF;
  IF coalesce(p_outcome, '') NOT IN ('ready', 'changes_requested') THEN RAISE EXCEPTION 'design term rejected (outcome): a review is ready or changes_requested' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_notes, ''))) < 8 THEN RAISE EXCEPTION 'design term rejected (reason): a review states its notes (8+ characters)' USING ERRCODE = '22023'; END IF;
  ch := governance.term_checks(t);
  IF p_outcome = 'ready' AND (ch ->> 'dilution') IS NOT NULL THEN PERFORM governance.term_raise(ch ->> 'dilution'); END IF;
  IF p_outcome = 'ready' AND NOT (ch ->> 'reading_pass')::boolean THEN
    RAISE EXCEPTION 'design term rejected (reading_level): % — an explanation is above its audience''s reading ceiling; request changes', (
      SELECT string_agg(format('%s grade %s > %s', k, ch -> 'reading' -> k ->> 'grade', ch -> 'reading' -> k ->> 'ceiling'), '; ' ORDER BY k)
        FROM jsonb_object_keys(ch -> 'reading') k WHERE NOT (ch -> 'reading' -> k ->> 'pass')::boolean) USING ERRCODE = '22023';
  END IF;
  v_state := CASE WHEN p_outcome = 'ready' THEN 'reviewed' ELSE 'returned' END;
  INSERT INTO governance.term_reviews (review_id, term_id, term_version, term_digest, outcome, checks, notes, reviewer, reviewer_role, correlation_id)
  VALUES (v_id, t.term_id, t.version, t.digest, p_outcome, ch, btrim(p_notes), p_actor, v_role, p_corr);
  UPDATE governance.terms SET state = v_state WHERE term_id = p_term AND version = p_version;
  PERFORM governance.term_artifact(p_term, p_actor, p_corr);
  PERFORM governance.ledger(NULL, NULL, 'design_term', p_term, p_version, 'design.term_' || v_state, p_actor, jsonb_build_object('review_id', v_id, 'outcome', p_outcome, 'checks', ch), p_corr);
  RETURN jsonb_build_object('review_id', v_id, 'term_id', p_term, 'version', p_version, 'outcome', p_outcome, 'state', v_state, 'checks', ch, 'claim', 'demonstration');
END $$;
REVOKE ALL ON FUNCTION governance.term_review(uuid, int, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.term_review(uuid, int, text, text, text, uuid, uuid) TO eye_commit;

/* APPROVE a reviewed version (governance.design.term.approve; human-gated): the Design System Authority — a named human, never the
   proposer, never an agent (governance.assert_approver) — on the digest shown; the checks RE-RUN here (dilution, the reading ceilings). */
CREATE OR REPLACE FUNCTION governance.term_approve(p_term uuid, p_version int, p_digest text, p_reason text, p_actor uuid, p_corr uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE t governance.terms%ROWTYPE; ch jsonb;
BEGIN
  PERFORM governance.term_assert('governance.design.term.approve', p_actor);
  SELECT * INTO t FROM governance.terms x WHERE x.term_id = p_term AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'design term rejected (unknown_term): no term %/v%', p_term, p_version USING ERRCODE = '23503'; END IF;
  PERFORM governance.assert_approver('design term', p_actor, NULL, NULL, ARRAY['design_system_authority'], t.proposed_by, NULL, 'approving a canonical term');
  IF t.state <> 'reviewed' THEN RAISE EXCEPTION 'design term rejected (state): % v% is %, not reviewed ready — a term is reviewed before it is approved', t.term_key, p_version, t.state USING ERRCODE = '23505'; END IF;
  IF p_digest IS DISTINCT FROM t.digest THEN RAISE EXCEPTION 'design term rejected (stale): the approval names a digest other than % v%''s — read it again', t.term_key, p_version USING ERRCODE = '23505'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'design term rejected (reason): an approval states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  ch := governance.term_checks(t);
  PERFORM governance.term_raise(ch ->> 'dilution');
  IF NOT (ch ->> 'reading_pass')::boolean THEN RAISE EXCEPTION 'design term rejected (reading_level): an explanation of % v% is above its audience''s reading ceiling', t.term_key, p_version USING ERRCODE = '22023'; END IF;
  UPDATE governance.terms SET state = 'approved', approved_by = p_actor, approved_at = clock_timestamp(), approval_reason = btrim(p_reason) WHERE term_id = p_term AND version = p_version;
  PERFORM governance.term_artifact(p_term, p_actor, p_corr);
  PERFORM governance.ledger(NULL, NULL, 'design_term', p_term, p_version, 'design.term_approved', p_actor, jsonb_build_object('digest', t.digest, 'reason', btrim(p_reason), 'checks', ch), p_corr);
  RETURN jsonb_build_object('term_id', p_term, 'version', p_version, 'key', t.term_key, 'state', 'approved', 'digest', t.digest, 'checks', ch, 'claim', 'demonstration');
END $$;
REVOKE ALL ON FUNCTION governance.term_approve(uuid, int, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.term_approve(uuid, int, text, text, uuid, uuid) TO eye_commit;

/* PUBLISH an approved version (governance.design.term.publish; human-gated): the Design System Authority (the approver test, never the
   proposer); on the digest shown; HELD (409) while a cited term has no published version (UX-69-005: a publication citing an unapproved term
   is held); a translation whose English source is no longer the version in force is STALE; a conflict re-checked. The published predecessor
   is superseded; a correction's publication is ledgered `design.term_corrected` with original / replacement / impact / action and the
   translations it leaves on a superseded source (they fall back to the canonical English entry, marked — the catalogue read). */
CREATE OR REPLACE FUNCTION governance.term_publish(p_term uuid, p_version int, p_digest text, p_reason text, p_actor uuid, p_corr uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE t governance.terms%ROWTYPE; prev governance.terms%ROWTYPE; ch jsonb; v_conf text; v_stale jsonb := '[]'::jsonb;
BEGIN
  PERFORM governance.term_assert('governance.design.term.publish', p_actor);
  SELECT * INTO t FROM governance.terms x WHERE x.term_id = p_term AND x.version = p_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'design term rejected (unknown_term): no term %/v%', p_term, p_version USING ERRCODE = '23503'; END IF;
  PERFORM governance.assert_approver('design term', p_actor, NULL, NULL, ARRAY['design_system_authority'], t.proposed_by, NULL, 'publishing a canonical term');
  PERFORM pg_advisory_xact_lock(hashtext('b81-term:' || t.term_key || '@' || t.locale));
  SELECT * INTO t FROM governance.terms x WHERE x.term_id = p_term AND x.version = p_version FOR UPDATE;
  IF t.state <> 'approved' THEN RAISE EXCEPTION 'design term rejected (state): % v% is %, not approved — only an approved term is published', t.term_key, p_version, t.state USING ERRCODE = '23505'; END IF;
  IF p_digest IS DISTINCT FROM t.digest THEN RAISE EXCEPTION 'design term rejected (stale): the publication names a digest other than % v%''s — read it again', t.term_key, p_version USING ERRCODE = '23505'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'design term rejected (reason): a publication states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  ch := governance.term_checks(t);
  IF jsonb_array_length(ch -> 'unpublished_cites') > 0 THEN
    RAISE EXCEPTION 'design term rejected (held): % v% cites % — a publication citing an unpublished term is held until each cited term is published', t.term_key, p_version,
      (SELECT string_agg(c, ', ') FROM jsonb_array_elements_text(ch -> 'unpublished_cites') c) USING ERRCODE = '23505';
  END IF;
  IF t.translated_from IS NOT NULL AND ch -> 'translation' ->> 'source' <> 'in_force' THEN
    RAISE EXCEPTION 'design term rejected (stale): the English source of this translation (v%) is no longer the term in force — translate the version in force', t.translated_from_version USING ERRCODE = '23505';
  END IF;
  v_conf := governance.term_conflict(t.term_key, t.locale, t.label, t.synonyms);
  IF v_conf IS NOT NULL THEN RAISE EXCEPTION 'design term rejected (conflict): %', v_conf USING ERRCODE = '23505'; END IF;
  SELECT * INTO prev FROM governance.terms x WHERE x.term_id = p_term AND x.state = 'published' FOR UPDATE;
  IF FOUND THEN UPDATE governance.terms SET state = 'superseded', superseded_at = clock_timestamp() WHERE term_id = prev.term_id AND version = prev.version; END IF;
  UPDATE governance.terms SET state = 'published', published_by = p_actor, published_at = clock_timestamp(), publish_reason = btrim(p_reason) WHERE term_id = p_term AND version = p_version;
  IF t.locale = 'en' AND prev.term_id IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('term_id', x.term_id, 'version', x.version, 'locale', x.locale) ORDER BY x.locale), '[]'::jsonb) INTO v_stale
      FROM governance.terms x WHERE x.term_key = t.term_key AND x.locale <> 'en' AND x.state = 'published' AND x.translated_from = prev.term_id AND x.translated_from_version = prev.version;
  END IF;
  PERFORM governance.term_artifact(p_term, p_actor, p_corr);
  PERFORM governance.ledger(NULL, NULL, 'design_term', p_term, p_version, 'design.term_published', p_actor,
            jsonb_build_object('key', t.term_key, 'locale', t.locale, 'digest', t.digest, 'supersedes', prev.version, 'reason', btrim(p_reason)), p_corr);
  IF t.corrects_version IS NOT NULL THEN
    PERFORM governance.ledger(NULL, NULL, 'design_term', p_term, p_version, 'design.term_corrected', p_actor,
              jsonb_build_object('key', t.term_key, 'correction', t.correction, 'stale_translations', v_stale,
                                 'recipients', 'the readers of the original term see the correction beside it; notices reaching recipients are B84 (NOT-08)'), p_corr);
  END IF;
  RETURN jsonb_build_object('term_id', p_term, 'version', p_version, 'key', t.term_key, 'locale', t.locale, 'state', 'published', 'digest', t.digest, 'supersedes', prev.version,
                            'correction', t.correction, 'stale_translations', v_stale, 'claim', 'demonstration');
END $$;
REVOKE ALL ON FUNCTION governance.term_publish(uuid, int, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.term_publish(uuid, int, text, text, uuid, uuid) TO eye_commit;

/* RETIRE a version (governance.design.term.retire; human-gated): the Design System Authority (a named human, never an agent); a published
   version is HELD while another published term cites its key; a version already superseded or retired is refused. Never deleted. */
CREATE OR REPLACE FUNCTION governance.term_retire(p_term uuid, p_version int, p_reason text, p_actor uuid, p_corr uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = governance, public, pg_catalog, pg_temp AS $$
DECLARE t governance.terms%ROWTYPE; v_citers text;
BEGIN
  PERFORM governance.term_assert('governance.design.term.retire', p_actor);
  SELECT * INTO t FROM governance.terms x WHERE x.term_id = p_term AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'design term rejected (unknown_term): no term %/v%', p_term, p_version USING ERRCODE = '23503'; END IF;
  PERFORM governance.assert_approver('design term', p_actor, NULL, NULL, ARRAY['design_system_authority'], NULL, NULL, 'retiring a term');
  IF t.state IN ('superseded', 'retired') THEN RAISE EXCEPTION 'design term rejected (state): % v% is already %', t.term_key, p_version, t.state USING ERRCODE = '23505'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'design term rejected (reason): a retirement states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF t.state = 'published' AND t.locale = 'en' THEN
    SELECT string_agg(x.term_key, ', ' ORDER BY x.term_key) INTO v_citers FROM governance.terms x WHERE x.state = 'published' AND t.term_key = ANY (x.cites);
    IF v_citers IS NOT NULL THEN
      RAISE EXCEPTION 'design term rejected (held): % is cited by the published term(s) % — correct them first', t.term_key, v_citers USING ERRCODE = '23505';
    END IF;
  END IF;
  UPDATE governance.terms SET state = 'retired', retired_by = p_actor, retired_at = clock_timestamp(), retire_reason = btrim(p_reason) WHERE term_id = p_term AND version = p_version;
  PERFORM governance.term_artifact(p_term, p_actor, p_corr);
  PERFORM governance.ledger(NULL, NULL, 'design_term', p_term, p_version, 'design.term_retired', p_actor, jsonb_build_object('key', t.term_key, 'was', t.state, 'reason', btrim(p_reason)), p_corr);
  RETURN jsonb_build_object('term_id', p_term, 'version', p_version, 'key', t.term_key, 'state', 'retired', 'was', t.state, 'claim', 'demonstration');
END $$;
REVOKE ALL ON FUNCTION governance.term_retire(uuid, int, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.term_retire(uuid, int, text, uuid, uuid) TO eye_commit;

-- §CT.6 THE CATALOGUE READ (SECURITY INVOKER — the caller's RLS: every context reads the published language) ─────────────────────────────────
/* THE PUBLISHED CATALOGUE in a locale (UX-69-002/-005): each key's published entry in that locale when its English source is still the
   version in force (`translated`); otherwise the canonical English entry as the VERIFIED FALLBACK, marked — `untranslated` (no published
   entry in the locale) or `source_corrected` (the translation's English source has been superseded or retired); `canonical` for English
   itself. The content version is the digest of the published set (key, locale, version, digest) under the rules version. */
CREATE OR REPLACE FUNCTION governance.term_catalogue(p_locale text) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = governance, pg_catalog, pg_temp AS $$
  WITH pick AS (
    SELECT e.term_key, e AS canon, l AS tr,
           CASE WHEN coalesce(p_locale, 'en') = 'en' THEN 'canonical'
                WHEN l.term_id IS NULL THEN 'untranslated'
                WHEN l.translated_from = e.term_id AND l.translated_from_version = e.version THEN 'translated'
                ELSE 'source_corrected' END AS mark
      FROM governance.terms e
      LEFT JOIN governance.terms l ON l.term_key = e.term_key AND l.locale = coalesce(p_locale, 'en') AND l.locale <> 'en' AND l.state = 'published'
     WHERE e.locale = 'en' AND e.state = 'published')
  SELECT jsonb_build_object('locale', coalesce(p_locale, 'en'), 'rules_version', governance.term_rules_version(),
    'terms', coalesce(jsonb_agg(jsonb_build_object(
      'key', p.term_key, 'mark', p.mark, 'fallback', p.mark IN ('untranslated', 'source_corrected'),
      'entry', (CASE WHEN p.mark = 'translated' THEN to_jsonb(p.tr) ELSE to_jsonb(p.canon) END) - 'scope' - 'tenant_id' - 'domain_id' - 'approval_reason' - 'publish_reason',
      'translation', CASE WHEN p.mark IN ('translated', 'source_corrected') THEN jsonb_build_object('term_id', (p.tr).term_id, 'version', (p.tr).version,
        'from_version', (p.tr).translated_from_version, 'method', (p.tr).translation_method) END) ORDER BY p.term_key), '[]'::jsonb),
    'content_digest', governance.digest(coalesce(jsonb_agg(jsonb_build_array(p.term_key, (p.canon).version, (p.canon).digest, (p.tr).version, (p.tr).digest) ORDER BY p.term_key), '[]'::jsonb)))
    FROM pick p
$$;
REVOKE ALL ON FUNCTION governance.term_catalogue(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION governance.term_catalogue(text) TO eye_app, eye_commit;
