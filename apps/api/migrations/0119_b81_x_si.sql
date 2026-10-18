-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0119 §SI — CP-6 B81 part `si`: SEARCH, THE COMMAND PALETTE AND INTENT — THE PERSON'S OWN SAVED SEARCHES AND INTENT RECORDS (F-P7-E-02:
-- UX-13-002 the persisted, versioned and reconcilable query / intent / filter / result set / command / history; UX-13-004 interpretation
-- proposes only; UX-13-005 / PAT-15 the bounded clarification — the original input and the ambiguous reading kept, nothing preselected, no
-- silent guess; D4 a DETERMINISTIC interpreter, no model; D10 / Q14 a saved search keeps its exact result set beside the live drift).
-- Part-local file (folded into the one 0119 at integration, in the order §0, §DG, §CT, §SI, §LY); applies ALONE on 0001–0118 + the prelude
-- (0119_b81_patterns_layout_content.sql §0) + the wave-1 part files (it sorts after them).
--
-- §SI.1 shell.saved_searches — a principal's OWN saved searches, ONE SERIES PER PERSON, DOMAIN AND NAME, APPEND-ONLY versions (a save that
--       read an older version is refused `(stale)`; nothing is overwritten). A version keeps EXACTLY what the person saw: the query as typed,
--       the interpretation it ran under, the filters, the result set (leg · kind · id · version · label), the DIGEST of the result set (computed
--       HERE over leg, kind, id and version — never the client's), the POLICY VERSION and the CUTOFF. The policy version and the cutoff are
--       DERIVED, never claimed: every searched leg names the receipt (the policy decision) of the governed read that produced its part of the
--       result set, and the port verifies each one — the caller's own, allowed, in this tenant and domain, of the leg's own read action and
--       object type, not evidence-only, decided within the last hour — and reads the bundle version and the decision instants from the policy
--       record (one bundle version across the legs; the cutoff is the latest read, `read_from` the earliest). A leg the server REFUSED (the
--       permission trimming) or that FAILED carries no receipt and is recorded as declared, in the server's words; a result can only come
--       from a VERIFIED leg. Reproducing a saved search reopens this exact stored set; the web re-runs the reads live and shows the drift
--       BESIDE it, never as the saved result (apps/web/lib/search-b81.ts driftOf).
-- §SI.2 shell.intent_records — APPEND-ONLY: the input as typed, the palette mode, the interpreter's VERSION (deterministic — the web's
--       lib/intent-b81.ts INTERPRETER_VERSION; two versions may read the same words differently and the harness exercises it), the
--       interpretation, the alternatives offered (NONE preselected — an alternative carrying a selected / preselected / default flag is refused),
--       the clarification asked, the person's choice (null, or one of the alternatives' keys) and the outcome (chosen · literal · cancelled ·
--       command_review · navigated · unsupported). An AMBIGUOUS reading must carry ≥ 2 alternatives and the clarification it asked (no silent
--       guess); a command is recorded only as a HAND-OFF to its page's Command Review (`command_review`) — there is no outcome for an executed
--       command, because the palette and the interpreter execute nothing.
-- §SI.3 the ports — `shell.search.save` (shell.save_search), `shell.intent.record` (shell.record_intent), `shell.search.read`
--       (shell.searches_of: the saved searches of THIS domain — current per name + history, one exact version with its results — and the
--       person's recent intent records). The acting principal = eye_principal(), a NAMED ACTIVE HUMAN re-checked in the port (an agent or a
--       workload keeps neither), the DOMAIN scope (search is a domain's reads — a PLATFORM context keeps none), the ledger (shell.events).
--       RLS by principal (a principal id is global — another principal, even in the same domain, reads none of it).
--
-- Refusals in the class form `saved search rejected (<class>): …` and `intent record rejected (<class>): …` — 403 actor|access · 404
-- unknown_* · 409 stale · 422 the rest. NOTE (the integrator): the nouns `saved search` and `intent record` are not mapped centrally yet
-- (observation-errors.ts' B81 block).
--
-- THREE CLAIMS: construction (this file, apps/api/src/shell/search, apps/web/lib/{intent,search}-b81.ts, the palette in
-- components/shell.tsx, app/graph/search/all and the harness phase6-search-b81 — every persona, query and record there SYNTHETIC);
-- demonstrated operation (the act: A. Hoffmann's palette scene on eye_demo — SYNTHETIC persona); real acceptance (UX-13-006 / CAP-OB-04 →
-- the shared non-demonstration recording path at B111, then H3) — never claimed here.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §SI.0 THE VOCABULARY ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* The governed reads a search federates: leg → the read's PDP action and the object type its route declares (the policy record names both).
   graph = graph.controller /search (B20 completeness) · strategy = /graph/strategy/list · catalog = products/catalog /search (B90) ·
   exposures = prediction /exposures/list (B32) · packages = /decisions/list. NOT executive.search (a governed write per call — /home's). */
CREATE OR REPLACE FUNCTION shell.search_legs() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$ SELECT jsonb_build_object(
  'graph',     jsonb_build_object('action', 'graph.read',               'object_type', 'SRC'),
  'strategy',  jsonb_build_object('action', 'graph.read',               'object_type', 'OBJ'),
  'catalog',   jsonb_build_object('action', 'products.catalog.search',  'object_type', 'CAT'),
  'exposures', jsonb_build_object('action', 'prediction.exposure.read', 'object_type', 'RSK'),
  'packages',  jsonb_build_object('action', 'decision.read',            'object_type', 'DPK')) $$;
CREATE OR REPLACE FUNCTION shell.palette_modes() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['goto', 'search', 'ask', 'command'] $$;
CREATE OR REPLACE FUNCTION shell.intent_kinds() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['navigate', 'search', 'command', 'ambiguous', 'none'] $$;
CREATE OR REPLACE FUNCTION shell.intent_outcomes() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['chosen', 'literal', 'cancelled', 'command_review', 'navigated', 'unsupported'] $$;
/* how old a governed read may be when its result set is saved (the receipt's policy decision instant) */
CREATE OR REPLACE FUNCTION shell.search_receipt_window() RETURNS interval LANGUAGE sql IMMUTABLE AS $$ SELECT interval '1 hour' $$;
GRANT EXECUTE ON FUNCTION shell.search_legs(), shell.palette_modes(), shell.intent_kinds(), shell.intent_outcomes(), shell.search_receipt_window() TO eye_app, eye_commit;

/* A same-origin in-app path (an alternative's target): '/…', never '//…', no scheme, no whitespace, at most 512 characters. */
CREATE OR REPLACE FUNCTION shell.in_app_path(p text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p IS NOT NULL AND length(p) <= 512 AND p ~ '^/[^/\s\\]' AND p !~ '\s' AND p !~* '^/[a-z][a-z0-9+.-]*:' $$;

/* The result set's shape, validated item by item (null = admissible). `legs` = the legs the set may come from (the verified ones). */
CREATE OR REPLACE FUNCTION shell.search_results_problem(p jsonb, p_legs text[]) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = shell, pg_catalog, pg_temp AS $$
DECLARE r jsonb; k text; n int := 0;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'array' THEN RETURN 'the results are an array of {leg, kind, id, version, label}'; END IF;
  IF jsonb_array_length(p) > 500 THEN RETURN 'a saved search keeps at most 500 results'; END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(p) LOOP
    n := n + 1;
    IF jsonb_typeof(r) <> 'object' THEN RETURN format('result %s is an object {leg, kind, id, version, label}', n); END IF;
    FOR k IN SELECT jsonb_object_keys(r) LOOP
      IF k NOT IN ('leg', 'kind', 'id', 'version', 'label') THEN RETURN format('result %s carries no key %s (leg, kind, id, version, label)', n, k); END IF;
    END LOOP;
    IF jsonb_typeof(r -> 'leg') IS DISTINCT FROM 'string' OR NOT ((r ->> 'leg') = ANY (p_legs)) THEN
      RETURN format('result %s comes from %s, which is not a leg of this search with a verified read (%s)', n, coalesce(r ->> 'leg', 'no leg'), coalesce(array_to_string(p_legs, ', '), 'none'));
    END IF;
    IF jsonb_typeof(r -> 'kind') IS DISTINCT FROM 'string' OR (r ->> 'kind') !~ '^[a-z][a-z_]{1,40}$' THEN RETURN format('result %s names its kind in lower case', n); END IF;
    IF jsonb_typeof(r -> 'id') IS DISTINCT FROM 'string' OR (r ->> 'id') !~ '^[A-Za-z0-9][A-Za-z0-9:_.@-]{0,127}$' THEN RETURN format('result %s names its record id', n); END IF;
    IF r ? 'version' AND jsonb_typeof(r -> 'version') <> 'null' AND NOT (jsonb_typeof(r -> 'version') = 'number' AND (r ->> 'version') ~ '^[0-9]{1,9}$') THEN
      RETURN format('result %s names its version as a whole number (or null)', n);
    END IF;
    IF jsonb_typeof(r -> 'label') IS DISTINCT FROM 'string' OR length(r ->> 'label') > 300 THEN RETURN format('result %s carries its label as shown (at most 300 characters)', n); END IF;
  END LOOP;
  IF (SELECT count(*) FROM (SELECT DISTINCT x ->> 'leg', x ->> 'kind', x ->> 'id' FROM jsonb_array_elements(p) x) d) <> jsonb_array_length(p) THEN
    RETURN 'a result appears once per leg, kind and id';
  END IF;
  RETURN NULL;
END $$;
/* THE DIGEST of a result set: over leg, kind, id and version (the labels are what was shown, not what was found), in a canonical order. */
CREATE OR REPLACE FUNCTION shell.search_results_digest(p jsonb) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = shell, pg_catalog, pg_temp AS $$
  SELECT encode(sha256(convert_to(coalesce((
    SELECT jsonb_agg(jsonb_build_object('leg', x ->> 'leg', 'kind', x ->> 'kind', 'id', x ->> 'id', 'version', x -> 'version') ORDER BY x ->> 'leg', x ->> 'kind', x ->> 'id')
      FROM jsonb_array_elements(coalesce(p, '[]'::jsonb)) x), '[]'::jsonb)::text, 'UTF8')), 'hex') $$;
GRANT EXECUTE ON FUNCTION shell.in_app_path(text), shell.search_results_problem(jsonb, text[]), shell.search_results_digest(jsonb) TO eye_app, eye_commit;

/* The interpretation's shape (null = admissible) — what the deterministic interpreter returns and nothing else. */
CREATE OR REPLACE FUNCTION shell.interpretation_problem(p jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = shell, pg_catalog, pg_temp AS $$
DECLARE k text;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN RETURN 'the interpretation is an object'; END IF;
  IF length(p::text) > 4096 THEN RETURN 'the interpretation is at most 4 KiB'; END IF;
  FOR k IN SELECT jsonb_object_keys(p) LOOP
    IF k NOT IN ('kind', 'scoped_query', 'kinds', 'terms', 'command', 'uncertainty', 'reason') THEN
      RETURN format('the interpretation carries no key %s (kind, scoped_query, kinds, terms, command, uncertainty, reason)', k);
    END IF;
  END LOOP;
  IF jsonb_typeof(p -> 'kind') IS DISTINCT FROM 'string' OR NOT ((p ->> 'kind') = ANY (shell.intent_kinds())) THEN
    RETURN 'the interpretation''s kind is navigate, search, command, ambiguous or none';
  END IF;
  IF p ? 'scoped_query' AND jsonb_typeof(p -> 'scoped_query') NOT IN ('string', 'null') THEN RETURN 'the scoped query is text (or null)'; END IF;
  FOR k IN SELECT unnest(ARRAY['kinds', 'terms', 'uncertainty']) LOOP
    IF p ? k AND (jsonb_typeof(p -> k) <> 'array' OR EXISTS (SELECT 1 FROM jsonb_array_elements(p -> k) e WHERE jsonb_typeof(e) <> 'string')) THEN
      RETURN format('the interpretation''s %s is a list of words', k);
    END IF;
  END LOOP;
  IF p ? 'command' AND jsonb_typeof(p -> 'command') <> 'null' AND NOT (jsonb_typeof(p -> 'command') = 'string' AND (p ->> 'command') ~ '^[a-z][a-z0-9_.]{2,120}$') THEN
    RETURN 'the interpretation''s command is a governed action name (or null)';
  END IF;
  RETURN NULL;
END $$;
/* The alternatives' shape (null = admissible): {key, label, kind, target, detail?}; NOTHING PRESELECTED (PAT-15). */
CREATE OR REPLACE FUNCTION shell.alternatives_problem(p jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = shell, pg_catalog, pg_temp AS $$
DECLARE a jsonb; k text; n int := 0;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'array' THEN RETURN 'the alternatives are an array of {key, label, kind, target}'; END IF;
  IF jsonb_array_length(p) > 12 THEN RETURN 'a clarification offers at most 12 alternatives (bounded)'; END IF;
  FOR a IN SELECT * FROM jsonb_array_elements(p) LOOP
    n := n + 1;
    IF jsonb_typeof(a) <> 'object' THEN RETURN format('alternative %s is an object', n); END IF;
    FOR k IN SELECT jsonb_object_keys(a) LOOP
      IF k IN ('selected', 'preselected', 'default', 'chosen', 'recommended') THEN
        RETURN format('alternative %s carries %s — an alternative is offered, never preselected (the person chooses)', n, k);
      END IF;
      IF k NOT IN ('key', 'label', 'kind', 'target', 'detail') THEN RETURN format('alternative %s carries no key %s (key, label, kind, target, detail)', n, k); END IF;
    END LOOP;
    IF jsonb_typeof(a -> 'key') IS DISTINCT FROM 'string' OR (a ->> 'key') !~ '^[A-Za-z0-9][A-Za-z0-9:_.@-]{0,159}$' THEN RETURN format('alternative %s names its key', n); END IF;
    IF jsonb_typeof(a -> 'label') IS DISTINCT FROM 'string' OR length(a ->> 'label') NOT BETWEEN 1 AND 300 THEN RETURN format('alternative %s carries its label (1–300 characters)', n); END IF;
    IF jsonb_typeof(a -> 'kind') IS DISTINCT FROM 'string' OR (a ->> 'kind') !~ '^[a-z][a-z_]{1,40}$' THEN RETURN format('alternative %s names its kind', n); END IF;
    IF jsonb_typeof(a -> 'target') IS DISTINCT FROM 'string' OR NOT shell.in_app_path(a ->> 'target') THEN
      RETURN format('alternative %s leads to a page of this product (an in-app path), never elsewhere', n);
    END IF;
    IF a ? 'detail' AND (jsonb_typeof(a -> 'detail') <> 'string' OR length(a ->> 'detail') > 500) THEN RETURN format('alternative %s''s detail is text (at most 500 characters)', n); END IF;
  END LOOP;
  IF (SELECT count(DISTINCT x ->> 'key') FROM jsonb_array_elements(p) x) <> jsonb_array_length(p) THEN RETURN 'each alternative has its own key'; END IF;
  RETURN NULL;
END $$;
GRANT EXECUTE ON FUNCTION shell.interpretation_problem(jsonb), shell.alternatives_problem(jsonb) TO eye_app, eye_commit;

-- §SI.1 THE SAVED SEARCHES ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE shell.saved_searches (
  saved_search_id  uuid PRIMARY KEY,
  principal_id     uuid NOT NULL,
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  name             text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  name_key         text NOT NULL CHECK (name_key = lower(btrim(name))),
  version          int NOT NULL CHECK (version >= 1),
  supersedes       uuid REFERENCES shell.saved_searches (saved_search_id),
  query            text NOT NULL CHECK (length(query) BETWEEN 1 AND 500),
  intent           jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(intent) = 'object' AND length(intent::text) <= 4096),
  filters          jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(filters) = 'object' AND length(filters::text) <= 2048),
  legs             jsonb NOT NULL CHECK (jsonb_typeof(legs) = 'array' AND jsonb_array_length(legs) BETWEEN 1 AND 12),  -- built HERE (verified + declared)
  results          jsonb NOT NULL CHECK (jsonb_typeof(results) = 'array'),
  result_count     int NOT NULL CHECK (result_count = jsonb_array_length(results)),
  result_digest    text NOT NULL CHECK (result_digest ~ '^[0-9a-f]{64}$' AND result_digest = shell.search_results_digest(results)),
  policy_version   text NOT NULL,
  policy_digest    text,
  cutoff           timestamptz NOT NULL,
  read_from        timestamptz NOT NULL CHECK (read_from <= cutoff),
  intent_record_id uuid,
  saved_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id   uuid NOT NULL,
  CONSTRAINT srh_version_chain CHECK ((version = 1) = (supersedes IS NULL)),
  CONSTRAINT srh_cutoff_past CHECK (cutoff <= saved_at)
);
/* ONE series per person, domain and name (a saved search is the person's record of THIS domain's reads) */
CREATE UNIQUE INDEX srh_one_version ON shell.saved_searches (principal_id, tenant_id, domain_id, name_key, version);
CREATE UNIQUE INDEX srh_one_successor ON shell.saved_searches (supersedes) WHERE supersedes IS NOT NULL;
CREATE INDEX srh_principal ON shell.saved_searches (principal_id, tenant_id, domain_id, saved_at DESC);
CREATE TRIGGER srh_append_only BEFORE UPDATE OR DELETE ON shell.saved_searches FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
ALTER TABLE shell.saved_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE shell.saved_searches FORCE ROW LEVEL SECURITY;
/* a principal reads its OWN saved searches only (a principal id is global: the same domain's colleague reads none of them) */
CREATE POLICY srh_own ON shell.saved_searches FOR SELECT TO eye_app, eye_commit USING (principal_id = public.eye_principal());
GRANT SELECT ON shell.saved_searches TO eye_app, eye_commit;
COMMENT ON TABLE shell.saved_searches IS 'B81 §SI (0119): a principal''s own saved searches — append-only versions keeping the exact result set (ids + versions + digest), the policy version and the cutoff derived from the governed reads'' receipts.';

-- §SI.2 THE INTENT RECORDS ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE shell.intent_records (
  intent_id        uuid PRIMARY KEY,
  principal_id     uuid NOT NULL,
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  mode             text NOT NULL CHECK (mode = ANY (shell.palette_modes())),
  input            text NOT NULL CHECK (length(input) BETWEEN 1 AND 500),
  interpreter      text NOT NULL CHECK (interpreter ~ '^b81-si-[a-z]+-[0-9]+$'),
  interpretation   jsonb NOT NULL CHECK (shell.interpretation_problem(interpretation) IS NULL),
  alternatives     jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (shell.alternatives_problem(alternatives) IS NULL),
  clarification    text CHECK (clarification IS NULL OR length(clarification) BETWEEN 1 AND 500),
  choice           text,
  outcome          text NOT NULL CHECK (outcome = ANY (shell.intent_outcomes())),
  command_action   text CHECK (command_action IS NULL OR command_action ~ '^[a-z][a-z0-9_.]{2,120}$'),
  responds_to      uuid REFERENCES shell.intent_records (intent_id),
  recorded_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id   uuid NOT NULL,
  /* PAT-15: an ambiguous reading offers ≥ 2 alternatives and states its clarification — never a silent guess */
  CONSTRAINT itn_ambiguous_asks CHECK ((interpretation ->> 'kind') <> 'ambiguous' OR (jsonb_array_length(alternatives) >= 2 AND clarification IS NOT NULL)),
  /* the choice is the person's, and one of what was offered */
  CONSTRAINT itn_choice_offered CHECK (choice IS NULL OR jsonb_path_exists(alternatives, '$[*] ? (@.key == $c)', jsonb_build_object('c', choice))),
  CONSTRAINT itn_chosen_names CHECK ((outcome = 'chosen') <= (choice IS NOT NULL)),
  CONSTRAINT itn_no_choice CHECK (outcome NOT IN ('literal', 'cancelled', 'unsupported') OR choice IS NULL),
  /* a command is a HAND-OFF to its Command Review — and only a command review carries one */
  CONSTRAINT itn_command_handoff CHECK ((command_action IS NOT NULL) = (outcome = 'command_review'))
);
CREATE INDEX itn_principal ON shell.intent_records (principal_id, tenant_id, domain_id, recorded_at DESC);
CREATE TRIGGER itn_append_only BEFORE UPDATE OR DELETE ON shell.intent_records FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
ALTER TABLE shell.intent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE shell.intent_records FORCE ROW LEVEL SECURITY;
CREATE POLICY itn_own ON shell.intent_records FOR SELECT TO eye_app, eye_commit USING (principal_id = public.eye_principal());
GRANT SELECT ON shell.intent_records TO eye_app, eye_commit;
ALTER TABLE shell.saved_searches ADD CONSTRAINT srh_intent_record FOREIGN KEY (intent_record_id) REFERENCES shell.intent_records (intent_id);
COMMENT ON TABLE shell.intent_records IS 'B81 §SI (0119): a principal''s own intent records — append-only: input, mode, interpreter version, interpretation, alternatives (none preselected), clarification, choice, outcome; a command only as a hand-off to its Command Review.';

-- §SI.3 THE PORTS ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* The caller: the bound principal, a named active human, in the established DOMAIN context's own tenant and domain. */
CREATE OR REPLACE FUNCTION shell.assert_search_actor(p_noun text, p_tenant uuid, p_domain uuid, p_actor uuid) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = shell, identity, public, pg_catalog, pg_temp AS $$
DECLARE v_kind text; v_status text;
BEGIN
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION '% rejected (actor): it is recorded by its own principal, never on another''s behalf', p_noun USING ERRCODE = '42501';
  END IF;
  SELECT p.kind, p.status INTO v_kind, v_status FROM identity.principals p WHERE p.id = p_actor;
  IF v_kind IS DISTINCT FROM 'human' OR v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION '% rejected (actor): it is a named, active human''s own — an agent or a workload keeps none', p_noun USING ERRCODE = '42501';
  END IF;
  IF public.eye_scope() IS DISTINCT FROM 'DOMAIN' OR p_tenant IS NULL OR p_domain IS NULL
     OR p_tenant IS DISTINCT FROM public.eye_tenant() OR p_domain IS DISTINCT FROM public.eye_domain() THEN
    RAISE EXCEPTION '% rejected (access): search and intent are a domain''s — recorded in the established context''s own tenant and domain', p_noun USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION shell.assert_search_actor(text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.assert_search_actor(text, uuid, uuid, uuid) TO eye_commit;

/* §SI.3a `shell.intent.record` — one intent record (append-only). p_responds_to: the earlier record this one answers (the clarification's
   question → the person's choice), the caller's own in this domain. */
CREATE OR REPLACE FUNCTION shell.record_intent(
  p_intent_id uuid, p_tenant uuid, p_domain uuid, p_mode text, p_input text, p_interpreter text, p_interpretation jsonb, p_alternatives jsonb,
  p_clarification text, p_choice text, p_outcome text, p_command_action text, p_responds_to uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shell, observation, identity, public, pg_catalog, pg_temp AS $$
DECLARE
  v_alt jsonb := coalesce(p_alternatives, '[]'::jsonb);
  v_problem text; v_kind text; v_row shell.intent_records%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['shell.intent.record']);
  PERFORM shell.assert_search_actor('intent record', p_tenant, p_domain, p_actor);
  IF p_mode IS NULL OR NOT (p_mode = ANY (shell.palette_modes())) THEN
    RAISE EXCEPTION 'intent record rejected (mode): the mode is goto, search, ask or command — the palette never infers it silently' USING ERRCODE = '22023';
  END IF;
  IF p_input IS NULL OR length(btrim(p_input)) = 0 OR length(p_input) > 500 THEN
    RAISE EXCEPTION 'intent record rejected (input): the input is kept as typed (1–500 characters)' USING ERRCODE = '22023';
  END IF;
  IF p_interpreter IS NULL OR p_interpreter !~ '^b81-si-[a-z]+-[0-9]+$' THEN
    RAISE EXCEPTION 'intent record rejected (interpreter): the record names the deterministic interpreter''s version (b81-si-<name>-<n>)' USING ERRCODE = '22023';
  END IF;
  v_problem := shell.interpretation_problem(p_interpretation);
  IF v_problem IS NOT NULL THEN RAISE EXCEPTION 'intent record rejected (interpretation): %', v_problem USING ERRCODE = '22023'; END IF;
  v_problem := shell.alternatives_problem(v_alt);
  IF v_problem IS NOT NULL THEN
    RAISE EXCEPTION 'intent record rejected (%): %', CASE WHEN v_problem ~ 'never preselected' THEN 'preselected' ELSE 'alternatives' END, v_problem USING ERRCODE = '22023';
  END IF;
  v_kind := p_interpretation ->> 'kind';
  IF p_outcome IS NULL OR NOT (p_outcome = ANY (shell.intent_outcomes())) THEN
    RAISE EXCEPTION 'intent record rejected (outcome): the outcome is chosen, literal, cancelled, command_review, navigated or unsupported — nothing is ever recorded as executed' USING ERRCODE = '22023';
  END IF;
  IF p_clarification IS NOT NULL AND (length(btrim(p_clarification)) = 0 OR length(p_clarification) > 500) THEN
    RAISE EXCEPTION 'intent record rejected (clarification): a clarification is the question asked, in words (1–500 characters)' USING ERRCODE = '22023';
  END IF;
  IF v_kind = 'ambiguous' AND (jsonb_array_length(v_alt) < 2 OR p_clarification IS NULL) THEN
    RAISE EXCEPTION 'intent record rejected (clarification): an ambiguous reading offers at least two alternatives and states the clarification it asks — never a silent guess (PAT-15)' USING ERRCODE = '22023';
  END IF;
  IF p_choice IS NOT NULL AND NOT jsonb_path_exists(v_alt, '$[*] ? (@.key == $c)', jsonb_build_object('c', p_choice)) THEN
    RAISE EXCEPTION 'intent record rejected (choice): the choice is one of the alternatives offered (%), or none', coalesce((SELECT string_agg(x ->> 'key', ', ') FROM jsonb_array_elements(v_alt) x), 'none were offered') USING ERRCODE = '22023';
  END IF;
  IF p_outcome = 'chosen' AND p_choice IS NULL THEN
    RAISE EXCEPTION 'intent record rejected (choice): a chosen outcome names the person''s choice' USING ERRCODE = '22023';
  END IF;
  IF p_outcome IN ('literal', 'cancelled', 'unsupported') AND p_choice IS NOT NULL THEN
    RAISE EXCEPTION 'intent record rejected (choice): a % outcome carries no choice', p_outcome USING ERRCODE = '22023';
  END IF;
  IF v_kind = 'ambiguous' AND p_outcome IN ('navigated', 'command_review') AND p_choice IS NULL THEN
    RAISE EXCEPTION 'intent record rejected (choice): an ambiguous reading leads nowhere until the person chooses — no silent guess' USING ERRCODE = '22023';
  END IF;
  IF (p_command_action IS NOT NULL) <> (p_outcome = 'command_review') THEN
    RAISE EXCEPTION 'intent record rejected (command): a command is recorded only as the hand-off to its page''s Command Review (outcome command_review, naming the action) — the palette executes nothing' USING ERRCODE = '22023';
  END IF;
  IF p_command_action IS NOT NULL AND p_command_action !~ '^[a-z][a-z0-9_.]{2,120}$' THEN
    RAISE EXCEPTION 'intent record rejected (command): the command is a governed action name' USING ERRCODE = '22023';
  END IF;
  IF p_responds_to IS NOT NULL AND NOT EXISTS (SELECT 1 FROM shell.intent_records r WHERE r.intent_id = p_responds_to AND r.principal_id = p_actor
                                                 AND r.tenant_id = p_tenant AND r.domain_id = p_domain) THEN
    RAISE EXCEPTION 'intent record rejected (unknown_intent): the record this one answers is not one of yours in this domain' USING ERRCODE = '22023';
  END IF;
  INSERT INTO shell.intent_records (intent_id, principal_id, tenant_id, domain_id, mode, input, interpreter, interpretation, alternatives, clarification, choice, outcome,
                                    command_action, responds_to, correlation_id)
  VALUES (p_intent_id, p_actor, p_tenant, p_domain, p_mode, p_input, p_interpreter, p_interpretation, v_alt, p_clarification, p_choice, p_outcome,
          p_command_action, p_responds_to, p_correlation)
  RETURNING * INTO v_row;
  PERFORM shell.ledger(p_tenant, p_domain, p_actor, 'intent_record', p_intent_id, NULL, 'shell.intent.recorded',
                       jsonb_build_object('mode', p_mode, 'interpreter', p_interpreter, 'kind', v_kind, 'outcome', p_outcome, 'alternatives', jsonb_array_length(v_alt),
                                          'choice', p_choice, 'command_action', p_command_action, 'responds_to', p_responds_to), p_correlation);
  RETURN jsonb_build_object('intent_id', v_row.intent_id, 'mode', v_row.mode, 'input', v_row.input, 'interpreter', v_row.interpreter, 'interpretation', v_row.interpretation,
    'alternatives', v_row.alternatives, 'clarification', v_row.clarification, 'choice', v_row.choice, 'outcome', v_row.outcome, 'command_action', v_row.command_action,
    'responds_to', v_row.responds_to, 'recorded_at', v_row.recorded_at, 'executed', false,
    'claim', 'a record of what was typed, how it was read and what the person chose — it executes nothing; a command opens its page''s Command Review');
END $$;
REVOKE ALL ON FUNCTION shell.record_intent(uuid, uuid, uuid, text, text, text, jsonb, jsonb, text, text, text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.record_intent(uuid, uuid, uuid, text, text, text, jsonb, jsonb, text, text, text, text, uuid, uuid, uuid) TO eye_commit;

/* §SI.3b `shell.search.save` — a new version of the person's saved search. p_legs: [{leg, receipt (the read's policyDecisionId) | null,
   state: complete | bounded | partial | refused | failed, note}] — one entry per READ (the graph leg runs once per phrase of the
   interpretation; a list leg once): a searched read (complete / bounded / partial) names its receipt and the port verifies it (each receipt
   once); a refused / failed leg names none and is recorded as declared, in the server's words (once per leg). p_expected_version is the version
   the client READ (0 for a new name). */
CREATE OR REPLACE FUNCTION shell.save_search(
  p_saved_search_id uuid, p_tenant uuid, p_domain uuid, p_name text, p_expected_version int, p_query text, p_intent jsonb, p_filters jsonb,
  p_legs jsonb, p_results jsonb, p_intent_record uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shell, observation, policy, identity, public, pg_catalog, pg_temp AS $$
DECLARE
  v_name text := btrim(coalesce(p_name, ''));
  v_key text := lower(btrim(coalesce(p_name, '')));
  v_legs jsonb := '[]'::jsonb;
  v_verified text[] := ARRAY[]::text[];
  v_seen text[] := ARRAY[]::text[];
  l jsonb; k text; v_leg text; v_state text; v_spec jsonb; v_rcpt uuid; v_dec policy.policy_decisions%ROWTYPE;
  v_bundles text[] := ARRAY[]::text[]; v_cutoff timestamptz; v_from timestamptz;
  v_problem text; v_cur shell.saved_searches%ROWTYPE; v_version int; v_digest text; v_row shell.saved_searches%ROWTYPE; v_pdigest text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['shell.search.save']);
  PERFORM shell.assert_search_actor('saved search', p_tenant, p_domain, p_actor);
  IF length(v_name) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'saved search rejected (name): a saved search is named (1–120 characters)' USING ERRCODE = '22023';
  END IF;
  IF p_query IS NULL OR length(btrim(p_query)) = 0 OR length(p_query) > 500 THEN
    RAISE EXCEPTION 'saved search rejected (query): the query is kept as typed (1–500 characters)' USING ERRCODE = '22023';
  END IF;
  IF p_intent IS NOT NULL AND (jsonb_typeof(p_intent) <> 'object' OR length(p_intent::text) > 4096) THEN
    RAISE EXCEPTION 'saved search rejected (intent): the interpretation the search ran under is an object (at most 4 KiB)' USING ERRCODE = '22023';
  END IF;
  IF p_intent IS NOT NULL THEN
    FOR k IN SELECT jsonb_object_keys(p_intent) LOOP
      IF k NOT IN ('mode', 'interpreter', 'kind', 'scoped_query', 'kinds', 'terms', 'choice') THEN
        RAISE EXCEPTION 'saved search rejected (intent): the interpretation carries no key % (mode, interpreter, kind, scoped_query, kinds, terms, choice)', k USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END IF;
  IF p_filters IS NOT NULL THEN
    IF jsonb_typeof(p_filters) <> 'object' OR length(p_filters::text) > 2048 THEN
      RAISE EXCEPTION 'saved search rejected (filters): the filters are an object (at most 2 KiB)' USING ERRCODE = '22023';
    END IF;
    FOR k IN SELECT jsonb_object_keys(p_filters) LOOP
      IF k NOT IN ('kinds', 'legs') OR jsonb_typeof(p_filters -> k) <> 'array' OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_filters -> k) e WHERE jsonb_typeof(e) <> 'string') THEN
        RAISE EXCEPTION 'saved search rejected (filters): a filter is kinds or legs, each a list of words (% is not)', k USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END IF;
  IF p_expected_version IS NULL OR p_expected_version < 0 THEN
    RAISE EXCEPTION 'saved search rejected (version): the save names the version it read (0 for a new name)' USING ERRCODE = '22023';
  END IF;
  IF p_intent_record IS NOT NULL AND NOT EXISTS (SELECT 1 FROM shell.intent_records r WHERE r.intent_id = p_intent_record AND r.principal_id = p_actor AND r.tenant_id = p_tenant AND r.domain_id = p_domain) THEN
    RAISE EXCEPTION 'saved search rejected (unknown_intent): the intent record named is not one of yours in this domain' USING ERRCODE = '22023';
  END IF;

  -- THE LEGS: each searched leg's receipt VERIFIED against the policy record; the policy version and the cutoff read from it
  IF p_legs IS NULL OR jsonb_typeof(p_legs) <> 'array' OR jsonb_array_length(p_legs) NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'saved search rejected (legs): the search names the reads it ran (1–12 over graph, strategy, catalog, exposures, packages)' USING ERRCODE = '22023';
  END IF;
  FOR l IN SELECT * FROM jsonb_array_elements(p_legs) LOOP
    IF jsonb_typeof(l) <> 'object' THEN RAISE EXCEPTION 'saved search rejected (legs): a leg is {leg, receipt, state, note}' USING ERRCODE = '22023'; END IF;
    FOR k IN SELECT jsonb_object_keys(l) LOOP
      IF k NOT IN ('leg', 'receipt', 'state', 'note') THEN RAISE EXCEPTION 'saved search rejected (legs): a leg carries no key % (leg, receipt, state, note)', k USING ERRCODE = '22023'; END IF;
    END LOOP;
    v_leg := l ->> 'leg'; v_state := l ->> 'state'; v_spec := shell.search_legs() -> v_leg;
    IF v_leg IS NULL OR v_spec IS NULL THEN
      RAISE EXCEPTION 'saved search rejected (legs): % is not a leg of the federated search (graph, strategy, catalog, exposures, packages)', coalesce(v_leg, 'a leg without a name') USING ERRCODE = '22023';
    END IF;
    IF v_state IN ('refused', 'failed') AND EXISTS (SELECT 1 FROM jsonb_array_elements(v_legs) x WHERE x ->> 'leg' = v_leg AND x ->> 'state' IN ('refused', 'failed')) THEN
      RAISE EXCEPTION 'saved search rejected (legs): the % leg''s refusal is named twice', v_leg USING ERRCODE = '22023';
    END IF;
    IF v_state IS NULL OR v_state NOT IN ('complete', 'bounded', 'partial', 'refused', 'failed') THEN
      RAISE EXCEPTION 'saved search rejected (legs): the % leg''s state is complete, bounded, partial, refused or failed', v_leg USING ERRCODE = '22023';
    END IF;
    IF l ? 'note' AND jsonb_typeof(l -> 'note') NOT IN ('string', 'null') OR length(coalesce(l ->> 'note', '')) > 500 THEN
      RAISE EXCEPTION 'saved search rejected (legs): the % leg''s note is text in the server''s words (at most 500 characters)', v_leg USING ERRCODE = '22023';
    END IF;
    IF v_state IN ('refused', 'failed') THEN
      IF jsonb_typeof(l -> 'receipt') IS DISTINCT FROM 'null' AND l ? 'receipt' THEN
        RAISE EXCEPTION 'saved search rejected (legs): a % leg has no receipt — nothing was read from it', v_state USING ERRCODE = '22023';
      END IF;
      IF coalesce(btrim(l ->> 'note'), '') = '' THEN
        RAISE EXCEPTION 'saved search rejected (legs): a % leg keeps the server''s words (its note)', v_state USING ERRCODE = '22023';
      END IF;
      v_legs := v_legs || jsonb_build_object('leg', v_leg, 'state', v_state, 'note', l ->> 'note', 'basis', 'declared by the reader: the server answered no result set for this leg');
      CONTINUE;
    END IF;
    -- a leg may run once per phrase of the interpretation (graph search matches one phrase per read): each read its own receipt, named once
    IF (l ->> 'receipt') IS NOT NULL AND (l ->> 'receipt') = ANY (v_seen) THEN
      RAISE EXCEPTION 'saved search rejected (legs): the receipt % is named twice', l ->> 'receipt' USING ERRCODE = '22023';
    END IF;
    IF (l ->> 'receipt') IS NOT NULL THEN v_seen := v_seen || (l ->> 'receipt'); END IF;
    BEGIN
      v_rcpt := (l ->> 'receipt')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN v_rcpt := NULL;
    END;
    IF v_rcpt IS NULL THEN
      RAISE EXCEPTION 'saved search rejected (receipt): the % leg names the receipt (the policy decision) of the read that produced its results', v_leg USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_dec FROM policy.policy_decisions d WHERE d.id = v_rcpt;
    IF v_dec.id IS NULL OR v_dec.principal_id IS DISTINCT FROM ('principal:' || p_actor::text) OR v_dec.tenant_id IS DISTINCT FROM p_tenant
       OR v_dec.domain_id IS DISTINCT FROM p_domain OR v_dec.decision NOT IN ('allow', 'allow_with_obligations') OR coalesce(v_dec.evidence_only, false) THEN
      RAISE EXCEPTION 'saved search rejected (unknown_receipt): the % leg''s receipt is not an allowed read of yours in this domain', v_leg USING ERRCODE = '22023';
    END IF;
    IF v_dec.action IS DISTINCT FROM (v_spec ->> 'action') OR v_dec.object_type IS DISTINCT FROM (v_spec ->> 'object_type') THEN
      RAISE EXCEPTION 'saved search rejected (receipt): the % leg''s receipt is of %/% — the leg is read by %/%', v_leg, v_dec.action, coalesce(v_dec.object_type, '—'),
        v_spec ->> 'action', v_spec ->> 'object_type' USING ERRCODE = '22023';
    END IF;
    IF v_dec.created_at < clock_timestamp() - shell.search_receipt_window() THEN
      RAISE EXCEPTION 'saved search rejected (stale): the % leg was read at %, more than % ago — run the search again before saving it (nothing was saved)', v_leg,
        to_char(v_dec.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), shell.search_receipt_window() USING ERRCODE = '23514';
    END IF;
    IF NOT (v_leg = ANY (v_verified)) THEN v_verified := v_verified || v_leg; END IF;
    IF NOT (v_dec.bundle_version = ANY (v_bundles)) THEN v_bundles := v_bundles || v_dec.bundle_version; END IF;
    v_cutoff := greatest(v_cutoff, v_dec.created_at); v_from := least(v_from, v_dec.created_at);
    v_legs := v_legs || jsonb_build_object('leg', v_leg, 'state', v_state, 'note', l ->> 'note', 'receipt', v_rcpt, 'action', v_dec.action, 'object_type', v_dec.object_type,
                                           'read_at', v_dec.created_at, 'policy_version', v_dec.bundle_version, 'basis', 'verified: the read''s policy decision, the caller''s own');
  END LOOP;
  IF cardinality(v_verified) = 0 THEN
    RAISE EXCEPTION 'saved search rejected (receipt): no leg was read — a saved search keeps the result set of at least one governed read' USING ERRCODE = '22023';
  END IF;
  IF cardinality(v_bundles) <> 1 THEN
    RAISE EXCEPTION 'saved search rejected (stale): the legs were read under different policy versions (%) — run the search again', array_to_string(v_bundles, ', ') USING ERRCODE = '23514';
  END IF;
  v_problem := shell.search_results_problem(coalesce(p_results, '[]'::jsonb), v_verified);
  IF v_problem IS NOT NULL THEN RAISE EXCEPTION 'saved search rejected (results): %', v_problem USING ERRCODE = '22023'; END IF;
  SELECT b.digest INTO v_pdigest FROM policy.policy_bundles b WHERE b.version = v_bundles[1];

  -- one save at a time per series
  PERFORM pg_advisory_xact_lock(hashtextextended('shell.saved_searches:' || p_actor || ':' || p_domain || ':' || v_key, 0));
  SELECT * INTO v_cur FROM shell.saved_searches s WHERE s.principal_id = p_actor AND s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.name_key = v_key ORDER BY s.version DESC LIMIT 1;
  v_version := coalesce(v_cur.version, 0);
  IF v_version <> p_expected_version THEN
    RAISE EXCEPTION 'saved search rejected (stale): your saved search "%" is at version %; this save read version % — read it again (nothing was overwritten)', v_name, v_version, p_expected_version USING ERRCODE = '23514';
  END IF;
  v_digest := shell.search_results_digest(coalesce(p_results, '[]'::jsonb));
  INSERT INTO shell.saved_searches (saved_search_id, principal_id, tenant_id, domain_id, name, name_key, version, supersedes, query, intent, filters, legs, results, result_count,
                                    result_digest, policy_version, policy_digest, cutoff, read_from, intent_record_id, correlation_id)
  VALUES (p_saved_search_id, p_actor, p_tenant, p_domain, v_name, v_key, v_version + 1, v_cur.saved_search_id, p_query, coalesce(p_intent, '{}'::jsonb), coalesce(p_filters, '{}'::jsonb),
          v_legs, coalesce(p_results, '[]'::jsonb), jsonb_array_length(coalesce(p_results, '[]'::jsonb)), v_digest, v_bundles[1], v_pdigest, v_cutoff, v_from, p_intent_record, p_correlation)
  RETURNING * INTO v_row;
  PERFORM shell.ledger(p_tenant, p_domain, p_actor, 'saved_search', p_saved_search_id, v_row.version, 'shell.search.saved',
                       jsonb_build_object('name', v_name, 'supersedes', v_cur.saved_search_id, 'result_digest', v_digest, 'result_count', v_row.result_count,
                                          'policy_version', v_row.policy_version, 'cutoff', v_row.cutoff, 'legs', (SELECT jsonb_agg(x ->> 'leg') FROM jsonb_array_elements(v_legs) x)), p_correlation);
  RETURN jsonb_build_object('saved_search_id', v_row.saved_search_id, 'name', v_row.name, 'version', v_row.version, 'supersedes', v_row.supersedes, 'query', v_row.query,
    'intent', v_row.intent, 'filters', v_row.filters, 'legs', v_row.legs, 'results', v_row.results, 'result_count', v_row.result_count, 'result_digest', v_row.result_digest,
    'policy_version', v_row.policy_version, 'policy_digest', v_row.policy_digest, 'cutoff', v_row.cutoff, 'read_from', v_row.read_from,
    'intent_record_id', v_row.intent_record_id, 'saved_at', v_row.saved_at);
END $$;
REVOKE ALL ON FUNCTION shell.save_search(uuid, uuid, uuid, text, int, text, jsonb, jsonb, jsonb, jsonb, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.save_search(uuid, uuid, uuid, text, int, text, jsonb, jsonb, jsonb, jsonb, uuid, uuid, uuid) TO eye_commit;

/* §SI.3c `shell.search.read` — the principal's OWN saved searches of THIS domain (current per name + its history) and recent intent records;
   with p_saved_search, that ONE version EXACTLY as saved (its results, legs, digest, policy version, cutoff). */
CREATE OR REPLACE FUNCTION shell.searches_of(p_principal uuid, p_tenant uuid, p_domain uuid, p_saved_search uuid, p_history int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = shell, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_out jsonb; v_exact jsonb := NULL; v_intents jsonb; v_n int := greatest(0, least(coalesce(p_history, 5), 50));
BEGIN
  IF p_principal IS NULL OR p_principal IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'saved search rejected (actor): a principal reads only its own saved searches and intent records' USING ERRCODE = '42501';
  END IF;
  IF public.eye_scope() IS DISTINCT FROM 'DOMAIN' OR p_domain IS NULL OR NOT observation.read_scope_ok(p_tenant, p_domain) THEN
    RAISE EXCEPTION 'saved search rejected (access): a saved search is read only within the caller''s bound tenant and domain' USING ERRCODE = '42501';
  END IF;
  IF p_saved_search IS NOT NULL THEN
    SELECT jsonb_build_object('saved_search_id', s.saved_search_id, 'name', s.name, 'version', s.version, 'supersedes', s.supersedes, 'query', s.query, 'intent', s.intent,
             'filters', s.filters, 'legs', s.legs, 'results', s.results, 'result_count', s.result_count, 'result_digest', s.result_digest,
             'digest_ok', s.result_digest = shell.search_results_digest(s.results), 'policy_version', s.policy_version, 'policy_digest', s.policy_digest,
             'cutoff', s.cutoff, 'read_from', s.read_from, 'intent_record_id', s.intent_record_id, 'saved_at', s.saved_at,
             'latest_version', (SELECT max(x.version) FROM shell.saved_searches x WHERE x.principal_id = s.principal_id AND x.tenant_id = s.tenant_id AND x.domain_id = s.domain_id AND x.name_key = s.name_key))
      INTO v_exact FROM shell.saved_searches s
     WHERE s.saved_search_id = p_saved_search AND s.principal_id = p_principal AND s.tenant_id = p_tenant AND s.domain_id = p_domain;
    IF v_exact IS NULL THEN
      RAISE EXCEPTION 'saved search rejected (unknown_saved_search): no saved search of yours in this domain matches this link' USING ERRCODE = '22023';
    END IF;
  END IF;
  WITH mine AS (
    SELECT s.* FROM shell.saved_searches s WHERE s.principal_id = p_principal AND s.tenant_id = p_tenant AND s.domain_id = p_domain
  ), cur AS (
    SELECT DISTINCT ON (name_key) * FROM mine ORDER BY name_key, version DESC
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'name', c.name,
      'current', jsonb_build_object('saved_search_id', c.saved_search_id, 'version', c.version, 'query', c.query, 'result_count', c.result_count, 'result_digest', c.result_digest,
                                    'policy_version', c.policy_version, 'cutoff', c.cutoff, 'saved_at', c.saved_at,
                                    'legs', (SELECT coalesce(jsonb_agg(jsonb_build_object('leg', x ->> 'leg', 'state', x ->> 'state')), '[]'::jsonb) FROM jsonb_array_elements(c.legs) x)),
      'versions', (SELECT count(*) FROM mine m WHERE m.name_key = c.name_key),
      'history', (SELECT coalesce(jsonb_agg(jsonb_build_object('saved_search_id', h.saved_search_id, 'version', h.version, 'result_count', h.result_count, 'result_digest', h.result_digest,
                                                               'cutoff', h.cutoff, 'saved_at', h.saved_at) ORDER BY h.version DESC), '[]'::jsonb)
                    FROM (SELECT * FROM mine m WHERE m.name_key = c.name_key ORDER BY m.version DESC LIMIT v_n) h)
    ) ORDER BY c.name_key), '[]'::jsonb) INTO v_out FROM cur c;
  SELECT coalesce(jsonb_agg(jsonb_build_object('intent_id', i.intent_id, 'mode', i.mode, 'input', i.input, 'interpreter', i.interpreter, 'kind', i.interpretation ->> 'kind',
           'alternatives', jsonb_array_length(i.alternatives), 'clarification', i.clarification, 'choice', i.choice, 'outcome', i.outcome, 'command_action', i.command_action,
           'responds_to', i.responds_to, 'recorded_at', i.recorded_at) ORDER BY i.recorded_at DESC), '[]'::jsonb) INTO v_intents
    FROM (SELECT * FROM shell.intent_records r WHERE r.principal_id = p_principal AND r.tenant_id = p_tenant AND r.domain_id = p_domain ORDER BY r.recorded_at DESC LIMIT greatest(v_n, 10)) i;
  RETURN jsonb_build_object('principal_id', p_principal, 'tenant_id', p_tenant, 'domain_id', p_domain, 'read_at', clock_timestamp(), 'saved', v_out, 'exact', v_exact, 'intents', v_intents,
    'claim', 'the principal''s own saved searches and intent records — a saved search reopens the exact result set it kept (ids, versions, digest) at its cutoff and policy version; a live re-run is shown beside it, never as it');
END $$;
REVOKE ALL ON FUNCTION shell.searches_of(uuid, uuid, uuid, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.searches_of(uuid, uuid, uuid, uuid, int) TO eye_app, eye_commit;
