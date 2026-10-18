-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0119 — CP-6 B81: SEARCH AND INTENT (F-P7-E-02), RESPONSIVE LAYOUT, DENSITY AND MULTI-WINDOW COMPOSITION (F-P7-E-04), OBJECT-CENTRED PAGES
-- (F-P7-E-06), CONTENT DESIGN AND TERMINOLOGY (F-P7-E-18), THE DEGRADED-STATE AND RECOVERY EXPERIENCE (F-P7-E-19), THE HUMAN-AUTHORITY
-- PATTERNS (F-P7-E-20), and B80's residues. 0001–0118 are applied or committed and untouched.
--
-- §0 PRELUDE (the integrator): the shared vocabulary widened by copying the list WHOLE (governance.artifact_kinds + 'terminology' — §CT's
-- terms register on B107's artifact core). The parts' tables and ports follow in their sections, folded in the order §0, §DG, §CT, §SI, §LY,
-- §HA (the defer intake), §RE.
--
-- THE PRINCIPLES (binding on every part): the interface never decides — a palette, an intent interpretation, a saved search, a recovery path
-- or a handoff executes NOTHING; every consequential act stays behind its page's Command Review and its own governed, human-gated port; a
-- degraded dependency is declared with what still works and what does not, by a named owner; words are governed (one canonical term per
-- concept); nothing is shown current, approved or available by inference. THREE CLAIMS: construction; demonstrated operation (the act —
-- SYNTHETIC personas, `claim = 'demonstration'`); real acceptance (H3) — never claimed (the shared non-demonstration recording path is
-- construction at B111).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §0.1 THE VOCABULARY (copied whole from 0118 §0.3, B81's addition marked) ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION governance.artifact_kinds() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  'requirement', 'capability', 'journey', 'component', 'deployable_unit', 'interface', 'schema', 'policy_bundle', 'test', 'fixture', 'evidence',
  'release_candidate', 'decision_record', 'standard', 'design_asset', 'design_component', 'pattern', 'principle', 'exception', 'acceptance_record',
  'data_product', 'data_authority', 'domain', 'change_proposal', 'conflict', 'baseline', 'stewardship_case', 'manifest', 'feature', 'role',
  -- B80 (0118 §0.3)
  'theme',
  -- B81 (0119 §0.1)
  'terminology'] $$;
GRANT EXECUTE ON FUNCTION governance.artifact_kinds() TO eye_app, eye_commit;

-- ═════════════════════════════════════════════════
-- THE FOLD (B81 integration, 2026-10-19): the parts follow §0 in the order §DG, §CT, §SI, §LY-G, §LY-M, §HA (§OB, §RE and §HA-R are web-only;
-- §HA's one backend change, the defer intake, comes last). Each part applied alone on 0001–0118 + §0 in its own harness; none references
-- another part's objects. The text of each part is unchanged below its fold line.
-- ═════════════════════════════════════════════════

-- ═══ FOLD §DG (from 0119_b81_x_dg.sql) ═══
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0119 §DG — CP-6 B81: THE DEGRADED-STATE, FAILURE AND RECOVERY EXPERIENCE (F-P7-E-19: HX-16, REL-12, UX-ADR-018, PAT-30, PAT-32, CNT-12, …).
-- Part-local file (folded into the one 0119 at integration, after §0); applies ALONE on 0001–0118 + the prelude (0119 §0).
--
-- THE GAP. A dependency failure was visible only as /readyz's audit flag (the shell's DegradedBanner) and as each read's own flags (B20's
-- projection block, a source's health, B29's quarantine). Nothing DECLARED what still works and what does not while a dependency is down,
-- who owns it, how long it may last, or what evidence ends it; nothing kept the degraded state explicit until a person verified recovery.
--
-- THE MECHANISM (DESIGN D5: declared in the database with a named owner, human-gated; nothing planted — the state is evaluated from the
-- real signals by the clock).
--   shell.degraded_contracts   one row per VERSION of the degraded-mode contract of ONE dependency (kind + key): the available and the
--                              unavailable functions (each a governed action name or prefix `x.y.*` with its words), the limitations, the
--                              maximum duration, the OWNER (a named active human of the scope) and the EXIT EVIDENCE (what verifies
--                              recovery). APPEND-ONLY; a new version supersedes the one the declarer read (a stale declaration refused).
--                              PLATFORM dependencies (the audit journal, models, outbound network) are declared by the OPERATIONS
--                              AUTHORITY (B107, PLATFORM) in a PLATFORM context; DOMAIN dependencies (sources, index partitions, methods,
--                              agents) by the operations authority or the DOMAIN ADMINISTRATOR in that domain's context.
--   shell.degraded_exits       the owner's VERIFIED RECOVERY: the exit evidence recorded while the live signal reads healthy (refused while
--                              it still reads degraded), with the signal it was verified against. APPEND-ONLY.
--   shell.dg_signal            THE EVALUATOR (internal; the clock a parameter): per kind, from the existing reads —
--                                audit      audit.availability_incidents (the ledger /readyz reconciles) + the process journal the API passes
--                                partition  graph.projection_partitions (B20: withdrawn) and its withdrawal ledger
--                                source     the source contract's lifecycle, its latest health (observation.source_health_events, the lag
--                                           class), and its FRESHNESS BY THE CLOCK — the last arrival (item.admitted / item.revised; the
--                                           activation when none) against the declared threshold (freshness threshold, else the cadence)
--                                method     simulation.adapter_health (B29: quarantined) and its quarantine ledger
--                                agent      executive.agents / observation.agents (revoked), the latest closed run (faulted / stopped),
--                                           the agent's live sessions
--                                model, network   NO READ exists here: the state is `unknown` and says so (never healthy by default)
--   shell.degraded_state       THE READ (definer, guarded): every contract of the scope with its live signal and its MODE —
--                                active         the signal reads degraded now
--                                awaiting_exit  the signal reads healthy, but a degradation happened after the last verified exit:
--                                               the contract STAYS IN FORCE (its unavailable functions stay unavailable) until the owner
--                                               records the exit evidence (UX-ADR-018, CNT-12 "persistent until verified recovery")
--                                normal         no degradation since the last exit (or since the contract was first declared)
--                                unknown        no read evaluates this kind of dependency
--                              the degraded dependencies with NO contract (`undeclared` — the gap shown, never hidden), and the union of
--                              the unavailable functions in force (what the web disables, PAT-30).
--   ports                      shell.degraded_contract_declare / shell.degraded_exit (SECURITY DEFINER, eye_commit; the route's action,
--                              the scope, the acting principal = eye_principal(), a NAMED HUMAN re-checked in the port; a request id
--                              replayed by the same person answers the recorded row — no duplicate effect, PAT-20).
--   the ledger                 every declaration and exit in shell.events (the prelude's ledger, the actor's own).
--   refusals                   the class form `degraded contract rejected (<class>): …` — 403 actor|authority · 404 unknown_* ·
--                              409 stale|state|duplicate · 422 the rest. NOTE (the integrator): the noun `degraded contract` is not mapped
--                              centrally yet (observation-errors.ts); the service maps it meanwhile.
--
-- THREE CLAIMS: construction (this file and phase6-degraded-b81.test.ts — every persona, contract and signal there SYNTHETIC);
-- demonstrated operation (the act: the operations authority declares the AIS source's contract on eye_demo; the source is stale by the
-- database clock — nothing planted); real acceptance (UX-19-006 → the shared recording path at B111, then H3) — never claimed here.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §DG.0 THE VOCABULARY ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* The dependency kinds (b81-seams.ts DependencyKind) and the scope each is declared at. */
CREATE OR REPLACE FUNCTION shell.dg_kinds() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['audit', 'partition', 'source', 'method', 'agent', 'model', 'network'] $$;
CREATE OR REPLACE FUNCTION shell.dg_kind_scope(p_kind text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_kind IN ('audit', 'model', 'network') THEN 'PLATFORM' WHEN p_kind IN ('partition', 'source', 'method', 'agent') THEN 'DOMAIN' END $$;
CREATE OR REPLACE FUNCTION shell.dg_partitions() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['entities_current', 'resolutions_current', 'edges_current', 'strategy_current', 'invalidations_current', 'memory_items_current'] $$;
GRANT EXECUTE ON FUNCTION shell.dg_kinds(), shell.dg_kind_scope(text), shell.dg_partitions() TO eye_app, eye_commit;

-- §DG.1 THE TABLES ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE shell.degraded_contracts (
  contract_id          uuid NOT NULL,
  version              int NOT NULL CHECK (version >= 1),
  scope                text NOT NULL CHECK (scope IN ('PLATFORM', 'DOMAIN')),
  tenant_id            uuid,
  domain_id            uuid,
  dependency_kind      text NOT NULL CHECK (dependency_kind = ANY (shell.dg_kinds())),
  dependency_key       text NOT NULL CHECK (length(dependency_key) BETWEEN 1 AND 200 AND dependency_key !~ '[[:cntrl:][:space:]]'),
  available            jsonb NOT NULL CHECK (jsonb_typeof(available) = 'array'),
  unavailable          jsonb NOT NULL CHECK (jsonb_typeof(unavailable) = 'array'),
  limitations          jsonb NOT NULL CHECK (jsonb_typeof(limitations) = 'array' AND jsonb_array_length(limitations) >= 1),
  max_duration_seconds int NOT NULL CHECK (max_duration_seconds BETWEEN 60 AND 7776000),
  owner_principal_id   uuid NOT NULL,
  exit_evidence        text NOT NULL CHECK (length(btrim(exit_evidence)) BETWEEN 8 AND 2000),
  reason               text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  declared_by          uuid NOT NULL,
  declared_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  supersedes           int,
  request_id           uuid NOT NULL UNIQUE,
  correlation_id       uuid NOT NULL,
  PRIMARY KEY (contract_id, version),
  CONSTRAINT shdc_scope CHECK ((scope = 'PLATFORM' AND tenant_id IS NULL AND domain_id IS NULL) OR (scope = 'DOMAIN' AND tenant_id IS NOT NULL AND domain_id IS NOT NULL)),
  CONSTRAINT shdc_kind_scope CHECK (scope = shell.dg_kind_scope(dependency_kind)),
  CONSTRAINT shdc_supersedes CHECK ((version = 1 AND supersedes IS NULL) OR (version > 1 AND supersedes = version - 1)),
  CONSTRAINT shdc_functions CHECK (jsonb_array_length(available) + jsonb_array_length(unavailable) >= 1)
);
COMMENT ON TABLE shell.degraded_contracts IS 'B81 §DG (HX-16, REL-12): the versioned degraded-mode contract of one dependency — available / unavailable functions, limitations, maximum duration, owner, exit evidence; declared by a named human (operations authority / domain administrator); append-only. The live state is evaluated from the real signals (shell.degraded_state), never stored.';
CREATE UNIQUE INDEX shdc_series ON shell.degraded_contracts (coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(domain_id, '00000000-0000-0000-0000-000000000000'::uuid), dependency_kind, dependency_key, version);
CREATE INDEX shdc_scope_idx ON shell.degraded_contracts (tenant_id, domain_id, dependency_kind, dependency_key);
CREATE TRIGGER shdc_append_only BEFORE UPDATE OR DELETE ON shell.degraded_contracts FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE shell.degraded_exits (
  exit_id              uuid PRIMARY KEY,
  contract_id          uuid NOT NULL,
  contract_version     int NOT NULL,
  scope                text NOT NULL CHECK (scope IN ('PLATFORM', 'DOMAIN')),
  tenant_id            uuid,
  domain_id            uuid,
  evidence             text NOT NULL CHECK (length(btrim(evidence)) BETWEEN 8 AND 2000),
  evidence_refs        jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence_refs) = 'array' AND jsonb_array_length(evidence_refs) <= 20),
  signal               jsonb NOT NULL CHECK (jsonb_typeof(signal) = 'object'),
  degraded_at          timestamptz,               -- the last degradation the exit closes (the evaluator's last_degraded_at)
  recorded_by          uuid NOT NULL,
  recorded_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  request_id           uuid NOT NULL UNIQUE,
  correlation_id       uuid NOT NULL,
  FOREIGN KEY (contract_id, contract_version) REFERENCES shell.degraded_contracts (contract_id, version),
  CONSTRAINT shdx_scope CHECK ((scope = 'PLATFORM' AND tenant_id IS NULL AND domain_id IS NULL) OR (scope = 'DOMAIN' AND tenant_id IS NOT NULL AND domain_id IS NOT NULL))
);
COMMENT ON TABLE shell.degraded_exits IS 'B81 §DG (UX-ADR-018, CNT-12): the owner''s verified recovery of a degraded dependency — the exit evidence, recorded only while the live signal reads healthy, with the signal it was verified against; append-only.';
CREATE INDEX shdx_contract ON shell.degraded_exits (contract_id, recorded_at DESC);
CREATE TRIGGER shdx_append_only BEFORE UPDATE OR DELETE ON shell.degraded_exits FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* RLS: a PLATFORM contract (the journal, models, the network) is visible to every bound principal — it describes the shared platform; a
   DOMAIN contract within its tenant (and, for a DOMAIN context, its domain) only. No write grant: the ports write. */
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['degraded_contracts', 'degraded_exits'] LOOP
    EXECUTE format('ALTER TABLE shell.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE shell.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY shdg_visible ON shell.%I FOR SELECT TO eye_app, eye_commit USING (
        (scope = 'PLATFORM' AND public.eye_principal() IS NOT NULL)
        OR (scope = 'DOMAIN' AND tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())))$f$, t);
    EXECUTE format('GRANT SELECT ON shell.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- §DG.2 THE SHARED CHECKS ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* The acting principal: the bound principal, the actor named by the route, a NAMED ACTIVE HUMAN (never an agent, never a system). */
CREATE OR REPLACE FUNCTION shell.dg_actor(p_actor uuid) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = shell, pg_catalog, pg_temp AS $$
DECLARE v uuid := public.eye_principal();
BEGIN
  IF v IS NULL THEN
    RAISE EXCEPTION 'degraded contract rejected (actor): no principal is bound to this context' USING ERRCODE = '42501';
  END IF;
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM v THEN
    RAISE EXCEPTION 'degraded contract rejected (actor): the act is recorded under the acting principal, never on behalf of another' USING ERRCODE = '42501';
  END IF;
  IF onboarding.principal_kind(v) IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION 'degraded contract rejected (actor): declaring a degraded mode or verifying a recovery is a named person''s act; an agent or a system never does it' USING ERRCODE = '42501';
  END IF;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION shell.dg_actor(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.dg_actor(uuid) TO eye_commit;

/* The scope of the established context for a dependency kind: a PLATFORM dependency in a PLATFORM context (no tenant, no domain); a DOMAIN
   dependency in that domain's context (observation.assert_scope — the context's own triple, never an argument). */
CREATE OR REPLACE FUNCTION shell.dg_assert_scope(p_kind text, p_tenant uuid, p_domain uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = shell, observation, pg_catalog, pg_temp AS $$
DECLARE v_scope text := shell.dg_kind_scope(p_kind);
BEGIN
  IF v_scope IS NULL THEN
    RAISE EXCEPTION 'degraded contract rejected (kind): % is not a dependency kind (%)', coalesce(p_kind, '<none>'), array_to_string(shell.dg_kinds(), ', ') USING ERRCODE = '22023';
  END IF;
  IF v_scope = 'PLATFORM' THEN
    IF public.eye_scope() IS DISTINCT FROM 'PLATFORM' OR p_tenant IS NOT NULL OR p_domain IS NOT NULL THEN
      RAISE EXCEPTION 'degraded contract rejected (scope): a % dependency is the platform''s — declared and exited in a PLATFORM context, with no tenant or domain', p_kind USING ERRCODE = '22023';
    END IF;
  ELSE
    IF public.eye_scope() IS DISTINCT FROM 'DOMAIN' THEN
      RAISE EXCEPTION 'degraded contract rejected (scope): a % dependency belongs to a domain — declared and exited in that domain''s context', p_kind USING ERRCODE = '22023';
    END IF;
    PERFORM observation.assert_scope(p_tenant, p_domain);
  END IF;
  RETURN v_scope;
END $$;
REVOKE ALL ON FUNCTION shell.dg_assert_scope(text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.dg_assert_scope(text, uuid, uuid) TO eye_commit;

/* Does the principal hold ANY live binding covering the scope (a PLATFORM contract: a PLATFORM binding; a DOMAIN contract: a PLATFORM,
   tenant or domain binding of that tenant/domain)? The owner test. */
CREATE OR REPLACE FUNCTION shell.dg_holds_any(p_principal uuid, p_tenant uuid, p_domain uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM identity.role_bindings b JOIN identity.principals p ON p.id = b.principal_id
                  WHERE b.principal_id = p_principal AND p.status = 'active' AND b.revoked_at IS NULL
                    AND (b.scope = 'PLATFORM'
                         OR (p_tenant IS NOT NULL AND b.scope = 'TENANT' AND b.tenant_id = p_tenant)
                         OR (p_domain IS NOT NULL AND b.scope = 'DOMAIN' AND b.tenant_id = p_tenant AND b.domain_id = p_domain)))
$$;
REVOKE ALL ON FUNCTION shell.dg_holds_any(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.dg_holds_any(uuid, uuid, uuid) TO eye_commit;

/* A list of functions: [{action, label}] — action a governed action name or a prefix ending in `.*`; label the words a person reads. */
CREATE OR REPLACE FUNCTION shell.dg_functions_problem(p jsonb, p_what text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE e jsonb; v_seen text[] := ARRAY[]::text[];
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'array' THEN RETURN format('the %s functions are a list of {action, label}', p_what); END IF;
  IF jsonb_array_length(p) > 50 THEN RETURN format('at most 50 %s functions', p_what); END IF;
  FOR e IN SELECT * FROM jsonb_array_elements(p) LOOP
    IF jsonb_typeof(e) <> 'object' OR jsonb_typeof(e -> 'action') <> 'string' OR jsonb_typeof(e -> 'label') <> 'string' THEN
      RETURN format('each %s function is {action, label}', p_what);
    END IF;
    IF (e ->> 'action') !~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*(\.\*)?$' OR length(e ->> 'action') > 120 THEN
      RETURN format('%s is not a governed action name or prefix (e.g. prediction.forecast.run or decision.package.*)', e ->> 'action');
    END IF;
    IF length(btrim(e ->> 'label')) < 3 OR length(e ->> 'label') > 200 THEN
      RETURN format('the label of %s says what it is in 3 to 200 characters', e ->> 'action');
    END IF;
    IF (e ->> 'action') = ANY (v_seen) THEN RETURN format('%s is listed twice', e ->> 'action'); END IF;
    v_seen := v_seen || (e ->> 'action');
  END LOOP;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION shell.dg_functions_problem(jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.dg_functions_problem(jsonb, text) TO eye_commit;

/* Does a dependency key name a real dependency of the scope? (the declaration's unknown_dependency) */
CREATE OR REPLACE FUNCTION shell.dg_key_known(p_kind text, p_key text, p_tenant uuid, p_domain uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = shell, pg_catalog, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  CASE p_kind
    WHEN 'audit' THEN RETURN p_key = 'journal';
    WHEN 'partition' THEN RETURN p_key = ANY (shell.dg_partitions());
    WHEN 'source' THEN RETURN EXISTS (SELECT 1 FROM observation.source_contracts_current c WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.source_key = p_key);
    WHEN 'method' THEN RETURN EXISTS (SELECT 1 FROM twin.behaviour_models m WHERE m.method_ref = p_key);
    WHEN 'agent' THEN
      IF p_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN false; END IF;
      v_id := p_key::uuid;
      RETURN EXISTS (SELECT 1 FROM executive.agents a WHERE a.agent_id = v_id AND a.tenant_id = p_tenant AND a.domain_id = p_domain)
          OR EXISTS (SELECT 1 FROM observation.agents a WHERE a.agent_id = v_id AND a.tenant_id = p_tenant AND a.domain_id = p_domain);
    ELSE RETURN p_key ~ '^[a-z0-9][a-z0-9_.:-]{1,120}$';   -- model, network: no registry read exists here; the key is a name
  END CASE;
END $$;
REVOKE ALL ON FUNCTION shell.dg_key_known(text, text, uuid, uuid) FROM PUBLIC;

-- §DG.3 THE EVALUATOR (internal; the clock is a parameter — the read passes the database clock) ─────────────────────────────────────────
/* The live signal of one dependency AT an instant: {state: degraded | healthy | unknown, reason, since, last_degraded_at, basis, details}.
   `since` — when the current degradation began; `last_degraded_at` — the latest instant the dependency was observed degraded (now, when
   degraded; else the latest recorded degradation), the persistence rule's input. Only TIME-BASED signals move with p_at (a source's
   freshness, an agent's sessions); the recorded states (a withdrawn partition, a quarantine, an incident) are read as they stand.
   p_journal is the API process's audit journal ({degraded, incidents, since} — /readyz's); it can only ADD degradation. */
CREATE OR REPLACE FUNCTION shell.dg_signal(p_kind text, p_key text, p_tenant uuid, p_domain uuid, p_at timestamptz, p_journal jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = shell, pg_catalog, pg_temp AS $$
DECLARE
  v_n bigint; v_first timestamptz; v_last timestamptz; v_journal boolean := coalesce((p_journal ->> 'degraded')::boolean, false); v_jsince timestamptz;
  pp graph.projection_partitions%ROWTYPE; v_found boolean;
  s observation.source_contracts_current%ROWTYPE; v_threshold int; v_arrival timestamptz; v_act timestamptz; v_ref timestamptz; v_h observation.source_health_events%ROWTYPE;
  v_hfound boolean; v_stale boolean := false; v_hbad boolean := false; v_down boolean := false; v_down_at timestamptz; v_hsince timestamptz; v_gap timestamptz; v_hlast timestamptz;
  ah simulation.adapter_health%ROWTYPE;
  xa executive.agents%ROWTYPE; oa observation.agents%ROWTYPE; v_run executive.agent_runs%ROWTYPE; v_crun observation.collection_runs_current%ROWTYPE; v_sessions bigint; v_aid uuid;
  v_reasons text[] := ARRAY[]::text[]; v_since timestamptz; v_details jsonb;
BEGIN
  CASE p_kind
  -- ── the audit journal (PLATFORM) ──
  WHEN 'audit' THEN
    SELECT count(*), min(a.detected_at) INTO v_n, v_first FROM audit.availability_incidents a WHERE a.reconciled_at IS NULL AND a.kind <> 'degraded_recovered';
    SELECT max(a.detected_at) INTO v_last FROM audit.availability_incidents a WHERE a.kind <> 'degraded_recovered' AND a.detected_at <= p_at;
    BEGIN v_jsince := (p_journal ->> 'since')::timestamptz; EXCEPTION WHEN others THEN v_jsince := NULL; END;
    IF v_n > 0 OR v_journal THEN
      v_since := CASE WHEN v_n > 0 AND v_journal THEN least(v_first, coalesce(v_jsince, v_first)) WHEN v_n > 0 THEN v_first ELSE v_jsince END;
      RETURN jsonb_build_object('state', 'degraded', 'basis', 'audit journal (/readyz) and the availability incident ledger',
        'reason', format('authoritative audit persistence is degraded: %s unreconciled incident(s) in the ledger%s', v_n, CASE WHEN v_journal THEN format('; the API''s journal reports %s', coalesce(p_journal ->> 'incidents', '?') || ' incident(s)') ELSE '' END),
        'since', v_since, 'last_degraded_at', p_at, 'details', jsonb_build_object('open_incidents', v_n, 'journal', coalesce(p_journal, 'null'::jsonb)));
    END IF;
    RETURN jsonb_build_object('state', 'healthy', 'basis', 'audit journal (/readyz) and the availability incident ledger', 'reason', 'no unreconciled availability incident; the journal reports none',
      'since', NULL, 'last_degraded_at', v_last, 'details', jsonb_build_object('open_incidents', 0, 'journal', coalesce(p_journal, 'null'::jsonb)));

  -- ── a B20 index partition (DOMAIN) ──
  WHEN 'partition' THEN
    IF NOT (p_key = ANY (shell.dg_partitions())) THEN
      RETURN jsonb_build_object('state', 'unknown', 'basis', 'graph.projection_partitions (B20)', 'reason', format('%s is not a projection of this product', p_key), 'since', NULL, 'last_degraded_at', NULL, 'details', '{}'::jsonb);
    END IF;
    SELECT * INTO pp FROM graph.projection_partitions x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.projection = p_key;
    v_found := FOUND;
    SELECT max(e.occurred_at) INTO v_last FROM graph.projection_events e
     WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.projection = p_key AND e.event = 'projection.withdrawn' AND e.occurred_at <= p_at;
    IF v_found AND pp.state = 'withdrawn' THEN
      RETURN jsonb_build_object('state', 'degraded', 'basis', 'graph.projection_partitions (B20)',
        'reason', format('the %s partition is WITHDRAWN: reads are served from the event log, labelled, until a rebuild returns it to service (%s)', p_key, pp.withdrawn_reason),
        'since', pp.withdrawn_at, 'last_degraded_at', p_at,
        'details', jsonb_build_object('projection', p_key, 'withdrawn_at', pp.withdrawn_at, 'withdrawn_by', pp.withdrawn_by, 'withdrawn_by_check', pp.withdrawn_by_check, 'reason', pp.withdrawn_reason,
                                      'refresh_path', 'the operator''s rebuild (graph.projection.rebuild) — the only way back to service'));
    END IF;
    RETURN jsonb_build_object('state', 'healthy', 'basis', 'graph.projection_partitions (B20)', 'reason', format('the %s partition is serving', p_key),
      'since', NULL, 'last_degraded_at', v_last, 'details', jsonb_build_object('projection', p_key, 'rebuilt_at', CASE WHEN v_found THEN pp.rebuilt_at END));

  -- ── a source (DOMAIN): its contract's lifecycle, its health, its freshness by the clock ──
  WHEN 'source' THEN
    SELECT * INTO s FROM observation.source_contracts_current c WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.source_key = p_key
     ORDER BY (c.lifecycle_state = 'active') DESC, c.contract_version DESC LIMIT 1;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('state', 'unknown', 'basis', 'observation.source_contracts_current', 'reason', format('no source %s in this domain', p_key), 'since', NULL, 'last_degraded_at', NULL, 'details', '{}'::jsonb);
    END IF;
    v_threshold := coalesce(s.freshness_threshold_seconds, s.cadence_seconds);
    SELECT max(e.occurred_at) INTO v_arrival FROM observation.collection_run_events e
     WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.source_id = s.source_id AND e.event IN ('item.admitted', 'item.revised') AND e.occurred_at <= p_at;
    SELECT max(x.occurred_at) INTO v_act FROM observation.source_contract_events x
     WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.source_id = s.source_id AND x.event IN ('contract.activated', 'contract.reactivated') AND x.occurred_at <= p_at;
    v_ref := coalesce(v_arrival, v_act);
    SELECT * INTO v_h FROM observation.source_health_events h WHERE h.tenant_id = p_tenant AND h.domain_id = p_domain AND h.source_id = s.source_id AND h.evaluated_at <= p_at
     ORDER BY h.evaluated_at DESC, h.recorded_at DESC LIMIT 1;
    v_hfound := FOUND;
    v_down := s.lifecycle_state <> 'active';
    IF v_down THEN v_reasons := v_reasons || format('the source contract v%s is %s', s.contract_version, s.lifecycle_state); END IF;
    v_hbad := v_hfound AND v_h.new_state IN ('degraded', 'failed', 'suspended');
    IF v_hbad THEN
      SELECT min(h.evaluated_at) INTO v_hsince FROM observation.source_health_events h
       WHERE h.tenant_id = p_tenant AND h.domain_id = p_domain AND h.source_id = s.source_id AND h.evaluated_at <= p_at
         AND h.evaluated_at > coalesce((SELECT max(k.evaluated_at) FROM observation.source_health_events k WHERE k.tenant_id = p_tenant AND k.domain_id = p_domain AND k.source_id = s.source_id
                                         AND k.new_state = 'healthy' AND k.evaluated_at <= p_at), '-infinity'::timestamptz);
      v_reasons := v_reasons || format('its health is %s (%s; lag class %s)', v_h.new_state, v_h.reason, v_h.lag_class);
    END IF;
    v_stale := v_threshold IS NOT NULL AND v_ref IS NOT NULL AND p_at - v_ref > make_interval(secs => v_threshold);
    IF v_stale THEN
      v_reasons := v_reasons || format('it is STALE by the clock: the last %s was %s, %s ago — beyond its %s s %s',
        CASE WHEN v_arrival IS NULL THEN 'activation (no arrival since)' ELSE 'arrival' END, v_ref, date_trunc('second', p_at - v_ref),
        v_threshold, CASE WHEN s.freshness_threshold_seconds IS NULL THEN 'cadence' ELSE 'freshness threshold' END);
    END IF;
    -- the latest recorded degradation (the persistence rule): a bad health evaluation, a gap between arrivals beyond the threshold (the
    -- arrival that closed it), a suspension or retirement
    SELECT max(h.evaluated_at) INTO v_hlast FROM observation.source_health_events h
     WHERE h.tenant_id = p_tenant AND h.domain_id = p_domain AND h.source_id = s.source_id AND h.new_state IN ('degraded', 'failed', 'suspended') AND h.evaluated_at <= p_at;
    IF v_threshold IS NOT NULL THEN
      SELECT max(a.at) INTO v_gap FROM (
        SELECT z.at, lag(z.at) OVER (ORDER BY z.at) AS prev FROM (
          SELECT e.occurred_at AS at FROM observation.collection_run_events e
           WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.source_id = s.source_id AND e.event IN ('item.admitted', 'item.revised') AND e.occurred_at <= p_at
          UNION ALL
          SELECT min(x.occurred_at) FROM observation.source_contract_events x
           WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.source_id = s.source_id AND x.event = 'contract.activated' AND x.occurred_at <= p_at) z
         WHERE z.at IS NOT NULL) a
       WHERE a.prev IS NOT NULL AND a.at - a.prev > make_interval(secs => v_threshold);
    END IF;
    -- the latest suspension or retirement (a down contract's `since`; a recorded degradation otherwise)
    SELECT max(x.occurred_at) INTO v_down_at FROM observation.source_contract_events x
     WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.source_id = s.source_id AND x.event IN ('contract.suspended', 'contract.retired') AND x.occurred_at <= p_at;
    v_details := jsonb_build_object('source_id', s.source_id, 'source_key', s.source_key, 'source_name', s.name, 'source_revision', s.contract_version, 'lifecycle_state', s.lifecycle_state,
      'connector_kind', s.connector_kind, 'acquisition_mode', s.acquisition_mode, 'data_origin', s.data_origin,
      'cadence_seconds', s.cadence_seconds, 'freshness_threshold_seconds', s.freshness_threshold_seconds, 'threshold_seconds', v_threshold,
      'watermark', v_arrival, 'reference_at', v_ref, 'reference_basis', CASE WHEN v_arrival IS NOT NULL THEN 'last arrival' WHEN v_act IS NOT NULL THEN 'activation (no arrival since)' END,
      'age_seconds', CASE WHEN v_ref IS NULL THEN NULL ELSE floor(extract(epoch FROM p_at - v_ref))::bigint END, 'stale', v_stale,
      'health', CASE WHEN v_hfound THEN jsonb_build_object('state', v_h.new_state, 'evaluated_at', v_h.evaluated_at, 'lag_class', v_h.lag_class, 'reason', v_h.reason) END,
      'refresh_path', CASE WHEN s.connector_kind = 'upload' THEN format('a new upload under source contract v%s (its registrar or a collection manager)', s.contract_version)
                           ELSE 'the next scheduled collection run, or a run the collection manager starts' END);
    IF v_down OR v_hbad OR v_stale THEN
      v_since := least(CASE WHEN v_stale THEN v_ref + make_interval(secs => v_threshold) END, CASE WHEN v_hbad THEN coalesce(v_hsince, v_h.evaluated_at) END, CASE WHEN v_down THEN v_down_at END);
      RETURN jsonb_build_object('state', 'degraded', 'basis', 'the source contract, its health and its freshness by the clock', 'reason', format('source %s: %s', p_key, array_to_string(v_reasons, '; ')),
        'since', v_since, 'last_degraded_at', p_at, 'details', v_details);
    END IF;
    RETURN jsonb_build_object('state', 'healthy', 'basis', 'the source contract, its health and its freshness by the clock',
      'reason', CASE WHEN v_threshold IS NULL THEN format('source %s is active; no cadence or freshness threshold is declared, so its freshness is not evaluated', p_key)
                     ELSE format('source %s is active and fresh: the last %s is within its %s s threshold', p_key, coalesce(v_details ->> 'reference_basis', 'arrival'), v_threshold) END,
      'since', NULL, 'last_degraded_at', (SELECT max(x) FROM unnest(ARRAY[v_hlast, v_gap, v_down_at]) x), 'details', v_details);

  -- ── a B29 method (DOMAIN) ──
  WHEN 'method' THEN
    IF NOT EXISTS (SELECT 1 FROM twin.behaviour_models m WHERE m.method_ref = p_key) THEN
      RETURN jsonb_build_object('state', 'unknown', 'basis', 'simulation.adapter_health (B29)', 'reason', format('%s is not a registered method', p_key), 'since', NULL, 'last_degraded_at', NULL, 'details', '{}'::jsonb);
    END IF;
    SELECT * INTO ah FROM simulation.adapter_health x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.model_ref = p_key;
    v_found := FOUND;
    SELECT max(e.occurred_at) INTO v_last FROM simulation.adapter_events e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.model_ref = p_key AND e.event = 'quarantined' AND e.occurred_at <= p_at;
    IF v_found AND ah.state = 'quarantined' THEN
      RETURN jsonb_build_object('state', 'degraded', 'basis', 'simulation.adapter_health (B29)',
        'reason', format('method %s is QUARANTINED in this domain after %s consecutive fault(s); new runs of it are refused until a method steward reinstates it on a passing probe', p_key, ah.consecutive_faults),
        'since', ah.quarantined_at, 'last_degraded_at', p_at,
        'details', jsonb_build_object('model_ref', p_key, 'consecutive_faults', ah.consecutive_faults, 'last_fault', ah.last_fault, 'last_fault_at', ah.last_fault_at, 'last_probe_passed_at', ah.last_probe_passed_at,
                                      'refresh_path', 'a passing probe and the method steward''s reinstatement (simulation.adapter.reinstate)'));
    END IF;
    RETURN jsonb_build_object('state', 'healthy', 'basis', 'simulation.adapter_health (B29)',
      'reason', CASE WHEN v_found THEN format('method %s is healthy in this domain (%s consecutive fault(s))', p_key, ah.consecutive_faults) ELSE format('method %s has no fault recorded in this domain', p_key) END,
      'since', NULL, 'last_degraded_at', v_last, 'details', jsonb_build_object('model_ref', p_key, 'reinstated_at', CASE WHEN v_found THEN ah.reinstated_at END));

  -- ── an agent (DOMAIN): its registration, its latest closed run, its sessions ──
  WHEN 'agent' THEN
    IF p_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RETURN jsonb_build_object('state', 'unknown', 'basis', 'the agent registry', 'reason', format('%s is not an agent id', p_key), 'since', NULL, 'last_degraded_at', NULL, 'details', '{}'::jsonb);
    END IF;
    v_aid := p_key::uuid;
    SELECT * INTO xa FROM executive.agents a WHERE a.agent_id = v_aid AND a.tenant_id = p_tenant AND a.domain_id = p_domain;
    IF FOUND THEN
      SELECT * INTO v_run FROM executive.agent_runs r WHERE r.agent_id = v_aid AND r.outcome <> 'running' AND r.finished_at <= p_at ORDER BY r.finished_at DESC LIMIT 1;
      v_found := FOUND;
      SELECT count(*) INTO v_sessions FROM identity.sessions x WHERE x.principal_id = xa.principal_id AND x.status = 'active' AND x.expires_at > p_at;
      SELECT greatest(xa.revoked_at, max(r.finished_at)) INTO v_last FROM executive.agent_runs r WHERE r.agent_id = v_aid AND r.outcome IN ('faulted', 'stopped') AND r.finished_at <= p_at;
      v_last := coalesce(v_last, CASE WHEN xa.revoked_at <= p_at THEN xa.revoked_at END);
      v_details := jsonb_build_object('agent_id', v_aid, 'agent_kind', xa.agent_kind, 'agent_version', xa.agent_version, 'registry', 'executive.agents', 'status', xa.status,
        'owner_principal_id', xa.owner_principal_id, 'escalation_principal_id', xa.escalation_principal_id, 'live_sessions', v_sessions,
        'last_run', CASE WHEN v_found THEN jsonb_build_object('run_id', v_run.run_id, 'outcome', v_run.outcome, 'stop_reason', v_run.stop_reason, 'finished_at', v_run.finished_at, 'escalated_to', v_run.escalated_to) END,
        'running', EXISTS (SELECT 1 FROM executive.agent_runs r WHERE r.agent_id = v_aid AND r.outcome = 'running'));
      IF xa.status = 'revoked' THEN
        RETURN jsonb_build_object('state', 'degraded', 'basis', 'executive.agents and its runs', 'reason', format('the %s agent''s grant is REVOKED: it opens no session and runs nothing', xa.agent_kind),
          'since', xa.revoked_at, 'last_degraded_at', p_at, 'details', v_details);
      END IF;
      IF v_found AND v_run.outcome IN ('faulted', 'stopped') THEN
        RETURN jsonb_build_object('state', 'degraded', 'basis', 'executive.agents and its runs',
          'reason', format('the %s agent''s latest run %s (%s); its work since then is not done', xa.agent_kind, upper(v_run.outcome), coalesce(v_run.stop_reason, 'no reason recorded')),
          'since', v_run.finished_at, 'last_degraded_at', p_at, 'details', v_details);
      END IF;
      RETURN jsonb_build_object('state', 'healthy', 'basis', 'executive.agents and its runs',
        'reason', CASE WHEN v_found THEN format('the %s agent is active; its latest run %s', xa.agent_kind, v_run.outcome) ELSE format('the %s agent is active; it has no closed run yet', xa.agent_kind) END,
        'since', NULL, 'last_degraded_at', v_last, 'details', v_details);
    END IF;
    SELECT * INTO oa FROM observation.agents a WHERE a.agent_id = v_aid AND a.tenant_id = p_tenant AND a.domain_id = p_domain;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('state', 'unknown', 'basis', 'the agent registry', 'reason', format('no agent %s in this domain', p_key), 'since', NULL, 'last_degraded_at', NULL, 'details', '{}'::jsonb);
    END IF;
    SELECT * INTO v_crun FROM observation.collection_runs_current r WHERE r.agent_principal_id = oa.principal_id AND r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.started_at <= p_at
     ORDER BY r.started_at DESC LIMIT 1;
    v_found := FOUND;
    SELECT count(*) INTO v_sessions FROM identity.sessions x WHERE x.principal_id = oa.principal_id AND x.status = 'active' AND x.expires_at > p_at;
    SELECT max(r.finished_at) INTO v_last FROM observation.collection_runs_current r WHERE r.agent_principal_id = oa.principal_id AND r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.state = 'failed' AND r.finished_at <= p_at;
    v_last := (SELECT max(x) FROM unnest(ARRAY[v_last, CASE WHEN oa.revoked_at <= p_at THEN oa.revoked_at END]) x);
    v_details := jsonb_build_object('agent_id', v_aid, 'agent_kind', oa.agent_kind, 'agent_version', oa.agent_version, 'registry', 'observation.agents', 'status', oa.status,
      'owner_principal_id', oa.owner_principal_id, 'live_sessions', v_sessions,
      'last_run', CASE WHEN v_found THEN jsonb_build_object('run_id', v_crun.run_id, 'state', v_crun.state, 'failure_reason', v_crun.failure_reason, 'finished_at', v_crun.finished_at) END);
    IF oa.status = 'revoked' THEN
      RETURN jsonb_build_object('state', 'degraded', 'basis', 'observation.agents and its collection runs', 'reason', format('the %s agent''s grant is REVOKED: it collects nothing', oa.agent_kind),
        'since', oa.revoked_at, 'last_degraded_at', p_at, 'details', v_details);
    END IF;
    IF v_found AND v_crun.state = 'failed' THEN
      RETURN jsonb_build_object('state', 'degraded', 'basis', 'observation.agents and its collection runs', 'reason', format('the %s agent''s latest collection run FAILED (%s)', oa.agent_kind, coalesce(v_crun.failure_reason, 'no reason recorded')),
        'since', coalesce(v_crun.finished_at, v_crun.last_event_at), 'last_degraded_at', p_at, 'details', v_details);
    END IF;
    RETURN jsonb_build_object('state', 'healthy', 'basis', 'observation.agents and its collection runs', 'reason', format('the %s agent is active', oa.agent_kind),
      'since', NULL, 'last_degraded_at', v_last, 'details', v_details);

  -- ── no read exists here ──
  WHEN 'model' THEN
    RETURN jsonb_build_object('state', 'unknown', 'basis', 'none', 'reason', 'no read evaluates a model''s availability here (the model registry and model-based interpretation are B72/B73''s); the contract is declared, its state is not evaluated',
      'since', NULL, 'last_degraded_at', NULL, 'details', '{}'::jsonb);
  WHEN 'network' THEN
    RETURN jsonb_build_object('state', 'unknown', 'basis', 'none', 'reason', 'no read evaluates an outbound channel''s availability here (each delivery carries its own receipt); the contract is declared, its state is not evaluated',
      'since', NULL, 'last_degraded_at', NULL, 'details', '{}'::jsonb);
  ELSE
    RETURN jsonb_build_object('state', 'unknown', 'basis', 'none', 'reason', format('%s is not a dependency kind', coalesce(p_kind, '<none>')), 'since', NULL, 'last_degraded_at', NULL, 'details', '{}'::jsonb);
  END CASE;
END $$;
REVOKE ALL ON FUNCTION shell.dg_signal(text, text, uuid, uuid, timestamptz, jsonb) FROM PUBLIC;

/* One contract version (the series' current) evaluated at an instant: the contract, its owner, its live signal, its MODE, the elapsed time
   and whether it is past its maximum duration, the last verified exit. */
CREATE OR REPLACE FUNCTION shell.dg_evaluate(c shell.degraded_contracts, p_at timestamptz, p_journal jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = shell, pg_catalog, pg_temp AS $$
DECLARE v_sig jsonb; v_exit shell.degraded_exits%ROWTYPE; v_has_exit boolean; v_first timestamptz; v_mode text; v_last timestamptz; v_since timestamptz; v_elapsed bigint;
BEGIN
  v_sig := shell.dg_signal(c.dependency_kind, c.dependency_key, c.tenant_id, c.domain_id, p_at, p_journal);
  SELECT * INTO v_exit FROM shell.degraded_exits x WHERE x.contract_id = c.contract_id AND x.recorded_at <= p_at ORDER BY x.recorded_at DESC LIMIT 1;
  v_has_exit := FOUND;
  SELECT min(k.declared_at) INTO v_first FROM shell.degraded_contracts k WHERE k.contract_id = c.contract_id;
  v_last := (v_sig ->> 'last_degraded_at')::timestamptz;
  v_since := (v_sig ->> 'since')::timestamptz;
  v_mode := CASE
    WHEN v_sig ->> 'state' = 'degraded' THEN 'active'
    WHEN v_sig ->> 'state' = 'unknown' THEN 'unknown'
    WHEN v_last IS NOT NULL AND v_last > greatest(v_first, CASE WHEN v_has_exit THEN v_exit.recorded_at END) THEN 'awaiting_exit'
    ELSE 'normal' END;
  v_elapsed := CASE WHEN v_mode = 'active' AND v_since IS NOT NULL THEN floor(extract(epoch FROM p_at - v_since))::bigint END;
  RETURN jsonb_build_object(
    'contract_id', c.contract_id, 'version', c.version, 'scope', c.scope, 'tenant_id', c.tenant_id, 'domain_id', c.domain_id,
    'dependency', jsonb_build_object('kind', c.dependency_kind, 'key', c.dependency_key),
    'available', c.available, 'unavailable', c.unavailable, 'limitations', c.limitations, 'max_duration_seconds', c.max_duration_seconds,
    'owner', jsonb_build_object('principal_id', c.owner_principal_id, 'name', (SELECT p.display_name FROM identity.principals p WHERE p.id = c.owner_principal_id)),
    'exit_evidence', c.exit_evidence, 'reason', c.reason,
    'declared_by', jsonb_build_object('principal_id', c.declared_by, 'name', (SELECT p.display_name FROM identity.principals p WHERE p.id = c.declared_by)),
    'declared_at', c.declared_at, 'first_declared_at', v_first,
    'signal', v_sig, 'mode', v_mode, 'in_force', v_mode IN ('active', 'awaiting_exit'),
    'elapsed_seconds', v_elapsed, 'overdue', coalesce(v_elapsed > c.max_duration_seconds, false),
    'last_exit', CASE WHEN v_has_exit THEN jsonb_build_object('exit_id', v_exit.exit_id, 'contract_version', v_exit.contract_version, 'evidence', v_exit.evidence, 'evidence_refs', v_exit.evidence_refs,
      'recorded_by', jsonb_build_object('principal_id', v_exit.recorded_by, 'name', (SELECT p.display_name FROM identity.principals p WHERE p.id = v_exit.recorded_by)),
      'recorded_at', v_exit.recorded_at, 'degraded_at', v_exit.degraded_at) END);
END $$;
REVOKE ALL ON FUNCTION shell.dg_evaluate(shell.degraded_contracts, timestamptz, jsonb) FROM PUBLIC;

/* The current version of each contract series of a scope. */
CREATE OR REPLACE FUNCTION shell.dg_current(p_tenant uuid, p_domain uuid) RETURNS SETOF shell.degraded_contracts
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = shell, pg_catalog, pg_temp AS $$
  SELECT DISTINCT ON (c.contract_id) c.* FROM shell.degraded_contracts c
   WHERE c.scope = 'PLATFORM' OR (p_tenant IS NOT NULL AND p_domain IS NOT NULL AND c.tenant_id = p_tenant AND c.domain_id = p_domain)
   ORDER BY c.contract_id, c.version DESC
$$;
REVOKE ALL ON FUNCTION shell.dg_current(uuid, uuid) FROM PUBLIC;

/* THE STATE AT AN INSTANT (internal — the harness evaluates the clock forward through it; the read passes the database clock). */
CREATE OR REPLACE FUNCTION shell.dg_state_at(p_tenant uuid, p_domain uuid, p_at timestamptz, p_journal jsonb, p_kind text, p_key text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = shell, pg_catalog, pg_temp AS $$
DECLARE v_contracts jsonb := '[]'::jsonb; v_undeclared jsonb := '[]'::jsonb; c shell.degraded_contracts%ROWTYPE; v_e jsonb; v_sig jsonb; r record;
        v_declared text[] := ARRAY[]::text[]; v_unavail jsonb := '[]'::jsonb; f jsonb;
BEGIN
  FOR c IN SELECT * FROM shell.dg_current(p_tenant, p_domain) x
            WHERE (p_kind IS NULL OR x.dependency_kind = p_kind) AND (p_key IS NULL OR x.dependency_key = p_key)
            ORDER BY x.scope, x.dependency_kind, x.dependency_key LOOP
    v_e := shell.dg_evaluate(c, p_at, p_journal);
    v_contracts := v_contracts || jsonb_build_array(v_e);
    v_declared := v_declared || (c.dependency_kind || ':' || c.dependency_key);
    IF (v_e ->> 'in_force')::boolean THEN
      FOR f IN SELECT * FROM jsonb_array_elements(c.unavailable) LOOP
        v_unavail := v_unavail || jsonb_build_array(f || jsonb_build_object('dependency', v_e -> 'dependency', 'contract_id', c.contract_id, 'mode', v_e ->> 'mode'));
      END LOOP;
    END IF;
  END LOOP;
  -- THE UNDECLARED: a degraded dependency with no contract is shown, never hidden (its limitations, owner and exit are UNKNOWN — said)
  IF p_kind IS NULL OR p_kind = 'audit' THEN
    IF NOT ('audit:journal' = ANY (v_declared)) THEN
      v_sig := shell.dg_signal('audit', 'journal', NULL, NULL, p_at, p_journal);
      IF v_sig ->> 'state' = 'degraded' THEN v_undeclared := v_undeclared || jsonb_build_array(jsonb_build_object('dependency', jsonb_build_object('kind', 'audit', 'key', 'journal'), 'scope', 'PLATFORM', 'signal', v_sig)); END IF;
    END IF;
  END IF;
  IF p_tenant IS NOT NULL AND p_domain IS NOT NULL THEN
    FOR r IN
      SELECT 'partition'::text AS kind, x.projection AS key FROM graph.projection_partitions x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'withdrawn'
      UNION ALL SELECT 'method', x.model_ref FROM simulation.adapter_health x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'quarantined'
      UNION ALL SELECT DISTINCT 'source', x.source_key FROM observation.source_contracts_current x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.lifecycle_state = 'active'
      UNION ALL SELECT 'agent', x.agent_id::text FROM executive.agents x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.status = 'active'
      UNION ALL SELECT 'agent', x.agent_id::text FROM observation.agents x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.status = 'active'
    LOOP
      CONTINUE WHEN (r.kind || ':' || r.key) = ANY (v_declared);
      CONTINUE WHEN p_kind IS NOT NULL AND r.kind <> p_kind;
      CONTINUE WHEN p_key IS NOT NULL AND r.key <> p_key;
      v_sig := shell.dg_signal(r.kind, r.key, p_tenant, p_domain, p_at, p_journal);
      IF v_sig ->> 'state' = 'degraded' THEN
        v_undeclared := v_undeclared || jsonb_build_array(jsonb_build_object('dependency', jsonb_build_object('kind', r.kind, 'key', r.key), 'scope', 'DOMAIN', 'signal', v_sig));
      END IF;
    END LOOP;
  END IF;
  RETURN jsonb_build_object('read_at', p_at, 'tenant_id', p_tenant, 'domain_id', p_domain,
    'contracts', v_contracts, 'undeclared', v_undeclared, 'unavailable_functions', v_unavail,
    'degraded', EXISTS (SELECT 1 FROM jsonb_array_elements(v_contracts) e WHERE (e ->> 'in_force')::boolean) OR jsonb_array_length(v_undeclared) > 0,
    'unknown', (SELECT count(*) FROM jsonb_array_elements(v_contracts) e WHERE e ->> 'mode' = 'unknown'),
    'evaluated', jsonb_build_object('rule', 'b81-dg-1', 'clock', 'database', 'journal_supplied', p_journal IS NOT NULL));
END $$;
REVOKE ALL ON FUNCTION shell.dg_state_at(uuid, uuid, timestamptz, jsonb, text, text) FROM PUBLIC;

-- §DG.4 THE READ ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* shell.degraded_state(scope): the PLATFORM contracts (any bound principal) and, for a tenant/domain, that domain's (guarded by
   observation.assert_read_scope); optionally one dependency kind / key (a corridor view asks for its source). Read-only: evaluating a
   state records nothing. */
CREATE OR REPLACE FUNCTION shell.degraded_state(p_tenant uuid, p_domain uuid, p_journal jsonb, p_kind text, p_key text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = shell, observation, pg_catalog, pg_temp AS $$
BEGIN
  IF p_tenant IS NOT NULL OR p_domain IS NOT NULL THEN
    PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the degraded state of a domain');
  ELSIF public.eye_principal() IS NULL
        AND NOT coalesce((SELECT r.rolbypassrls OR r.rolsuper FROM pg_catalog.pg_roles r WHERE r.rolname = session_user), false) THEN
    RAISE EXCEPTION 'degraded contract rejected (actor): the platform''s degraded state is read by a bound principal' USING ERRCODE = '42501';
  END IF;
  IF p_kind IS NOT NULL AND NOT (p_kind = ANY (shell.dg_kinds())) THEN
    RAISE EXCEPTION 'degraded contract rejected (kind): % is not a dependency kind (%)', p_kind, array_to_string(shell.dg_kinds(), ', ') USING ERRCODE = '22023';
  END IF;
  RETURN shell.dg_state_at(p_tenant, p_domain, clock_timestamp(), p_journal, p_kind, p_key);
END $$;
REVOKE ALL ON FUNCTION shell.degraded_state(uuid, uuid, jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.degraded_state(uuid, uuid, jsonb, text, text) TO eye_app, eye_commit;

/* The version history of one contract (the declarations and exits) — the contract page's read, the same guard. */
CREATE OR REPLACE FUNCTION shell.degraded_contract_history(p_tenant uuid, p_domain uuid, p_contract_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = shell, observation, pg_catalog, pg_temp AS $$
DECLARE c shell.degraded_contracts%ROWTYPE;
BEGIN
  SELECT * INTO c FROM shell.degraded_contracts k WHERE k.contract_id = p_contract_id ORDER BY k.version DESC LIMIT 1;
  IF NOT FOUND OR (c.scope = 'DOMAIN' AND (c.tenant_id IS DISTINCT FROM p_tenant OR c.domain_id IS DISTINCT FROM p_domain)) THEN
    RAISE EXCEPTION 'degraded contract rejected (unknown_contract): no degraded contract % in this scope', coalesce(p_contract_id::text, '<null>') USING ERRCODE = '22023';
  END IF;
  IF c.scope = 'DOMAIN' THEN PERFORM observation.assert_read_scope(p_tenant, p_domain, 'a degraded contract'); END IF;
  RETURN jsonb_build_object('contract_id', c.contract_id, 'current', shell.dg_evaluate(c, clock_timestamp(), NULL),
    'versions', (SELECT coalesce(jsonb_agg(jsonb_build_object('version', k.version, 'supersedes', k.supersedes, 'declared_at', k.declared_at, 'declared_by', k.declared_by,
                   'owner_principal_id', k.owner_principal_id, 'max_duration_seconds', k.max_duration_seconds, 'unavailable', k.unavailable, 'available', k.available,
                   'limitations', k.limitations, 'exit_evidence', k.exit_evidence, 'reason', k.reason) ORDER BY k.version), '[]'::jsonb)
                 FROM shell.degraded_contracts k WHERE k.contract_id = c.contract_id),
    'exits', (SELECT coalesce(jsonb_agg(jsonb_build_object('exit_id', x.exit_id, 'contract_version', x.contract_version, 'evidence', x.evidence, 'evidence_refs', x.evidence_refs,
                'recorded_by', x.recorded_by, 'recorded_at', x.recorded_at, 'degraded_at', x.degraded_at, 'signal_state', x.signal ->> 'state') ORDER BY x.recorded_at), '[]'::jsonb)
              FROM shell.degraded_exits x WHERE x.contract_id = c.contract_id));
END $$;
REVOKE ALL ON FUNCTION shell.degraded_contract_history(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.degraded_contract_history(uuid, uuid, uuid) TO eye_app, eye_commit;

-- §DG.5 DECLARE ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* Declare (version 1) or revise (the next version, superseding the one the declarer READ — p_expected_version, 0 when none) the degraded
   contract of one dependency. The operations authority (PLATFORM) for every dependency; the domain administrator for its domain's. The owner
   is a named active human holding a binding of the scope. A request id replayed by the same declarer answers the recorded version
   (`replayed`), never a second one; by another principal or for another dependency it is refused (duplicate). */
CREATE OR REPLACE FUNCTION shell.degraded_contract_declare(p_request_id uuid, p_tenant uuid, p_domain uuid, p_kind text, p_key text, p_expected_version int,
    p_available jsonb, p_unavailable jsonb, p_limitations jsonb, p_max_duration_seconds int, p_owner uuid, p_exit_evidence text, p_reason text,
    p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shell, observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; v_scope text; v_prev shell.degraded_contracts%ROWTYPE; v_has_prev boolean; v_id uuid; v_version int; v_problem text; r shell.degraded_contracts%ROWTYPE;
        v_key text := btrim(coalesce(p_key, '')); v_lim jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['shell.degraded.contract.declare']);
  v_scope := shell.dg_assert_scope(p_kind, p_tenant, p_domain);
  v_actor := shell.dg_actor(p_actor);
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'degraded contract rejected (request): a declaration carries its request id (the command identity a retry reuses)' USING ERRCODE = '22023';
  END IF;
  -- THE REPLAY (PAT-20): the same request id answers what it recorded; never a second effect
  SELECT * INTO r FROM shell.degraded_contracts k WHERE k.request_id = p_request_id;
  IF FOUND THEN
    IF r.declared_by IS DISTINCT FROM v_actor OR r.dependency_kind IS DISTINCT FROM p_kind OR r.dependency_key IS DISTINCT FROM v_key
       OR r.tenant_id IS DISTINCT FROM p_tenant OR r.domain_id IS DISTINCT FROM p_domain THEN
      RAISE EXCEPTION 'degraded contract rejected (duplicate): request % already recorded another declaration; a new declaration takes a new request id', p_request_id USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('contract_id', r.contract_id, 'version', r.version, 'supersedes', r.supersedes, 'declared_at', r.declared_at, 'dependency', jsonb_build_object('kind', r.dependency_kind, 'key', r.dependency_key),
      'owner_principal_id', r.owner_principal_id, 'replayed', true);
  END IF;
  -- WHO DECLARES: the operations authority (PLATFORM) for any dependency; the domain administrator for its own domain's
  IF v_scope = 'PLATFORM' THEN
    PERFORM governance.assert_approver('degraded contract', v_actor, NULL, NULL, ARRAY['operations_authority'], NULL, NULL, 'declaring a platform dependency''s degraded mode');
  ELSE
    PERFORM governance.assert_approver('degraded contract', v_actor, p_tenant, p_domain, ARRAY['operations_authority', 'domain_admin'], NULL, NULL, 'declaring a domain dependency''s degraded mode');
  END IF;
  IF v_key = '' OR length(v_key) > 200 OR v_key ~ '[[:cntrl:][:space:]]' THEN
    RAISE EXCEPTION 'degraded contract rejected (key): the dependency key is 1–200 characters without spaces (a source key, a projection, a method ref, an agent id)' USING ERRCODE = '22023';
  END IF;
  IF NOT shell.dg_key_known(p_kind, v_key, p_tenant, p_domain) THEN
    RAISE EXCEPTION 'degraded contract rejected (unknown_dependency): no % dependency % in this scope', p_kind, v_key USING ERRCODE = '22023';
  END IF;
  v_problem := coalesce(shell.dg_functions_problem(p_available, 'available'), shell.dg_functions_problem(p_unavailable, 'unavailable'));
  IF v_problem IS NOT NULL THEN RAISE EXCEPTION 'degraded contract rejected (functions): %', v_problem USING ERRCODE = '22023'; END IF;
  IF jsonb_array_length(p_available) + jsonb_array_length(p_unavailable) = 0 THEN
    RAISE EXCEPTION 'degraded contract rejected (functions): a contract states what still works and what does not (at least one function)' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_available) a JOIN jsonb_array_elements(p_unavailable) u ON a ->> 'action' = u ->> 'action') THEN
    RAISE EXCEPTION 'degraded contract rejected (functions): a function is either available or unavailable, never both' USING ERRCODE = '22023';
  END IF;
  IF p_limitations IS NULL OR jsonb_typeof(p_limitations) <> 'array' OR jsonb_array_length(p_limitations) < 1 OR jsonb_array_length(p_limitations) > 20
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_limitations) l WHERE jsonb_typeof(l) <> 'string' OR length(btrim(l #>> '{}')) < 3 OR length(l #>> '{}') > 300) THEN
    RAISE EXCEPTION 'degraded contract rejected (limitations): one to twenty limitations, each 3–300 characters, say what a person must know while it is degraded' USING ERRCODE = '22023';
  END IF;
  SELECT jsonb_agg(to_jsonb(btrim(l #>> '{}'))) INTO v_lim FROM jsonb_array_elements(p_limitations) l;
  IF p_max_duration_seconds IS NULL OR p_max_duration_seconds < 60 OR p_max_duration_seconds > 7776000 THEN
    RAISE EXCEPTION 'degraded contract rejected (max_duration): the maximum duration is 60 seconds to 90 days' USING ERRCODE = '22023';
  END IF;
  IF p_exit_evidence IS NULL OR length(btrim(p_exit_evidence)) < 8 OR length(p_exit_evidence) > 2000 THEN
    RAISE EXCEPTION 'degraded contract rejected (exit_evidence): the exit evidence says what verifies recovery, in 8 to 2000 characters' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'degraded contract rejected (reason): a reason of 8 to 2000 characters says why the contract is declared or revised' USING ERRCODE = '22023';
  END IF;
  IF p_owner IS NULL OR onboarding.principal_kind(p_owner) IS DISTINCT FROM 'human' OR NOT shell.dg_holds_any(p_owner, p_tenant, p_domain) THEN
    RAISE EXCEPTION 'degraded contract rejected (owner): the owner % is not an active person holding a role in this scope (an agent never owns a degraded mode)', coalesce(p_owner::text, '<none>') USING ERRCODE = '22023';
  END IF;
  -- one declaration at a time per dependency series
  PERFORM pg_advisory_xact_lock(hashtextextended('shell.degraded:' || coalesce(p_tenant::text, '-') || ':' || coalesce(p_domain::text, '-') || ':' || p_kind || ':' || v_key, 0));
  SELECT * INTO v_prev FROM shell.degraded_contracts k
   WHERE k.tenant_id IS NOT DISTINCT FROM p_tenant AND k.domain_id IS NOT DISTINCT FROM p_domain AND k.dependency_kind = p_kind AND k.dependency_key = v_key
   ORDER BY k.version DESC LIMIT 1;
  v_has_prev := FOUND;
  IF coalesce(p_expected_version, -1) IS DISTINCT FROM (CASE WHEN v_has_prev THEN v_prev.version ELSE 0 END) THEN
    RAISE EXCEPTION 'degraded contract rejected (stale): the contract of % % is at version %; this declaration read %', p_kind, v_key,
      CASE WHEN v_has_prev THEN v_prev.version ELSE 0 END, coalesce(p_expected_version::text, 'no version') USING ERRCODE = '23514';
  END IF;
  v_id := CASE WHEN v_has_prev THEN v_prev.contract_id ELSE gen_random_uuid() END;
  v_version := CASE WHEN v_has_prev THEN v_prev.version + 1 ELSE 1 END;
  INSERT INTO shell.degraded_contracts (contract_id, version, scope, tenant_id, domain_id, dependency_kind, dependency_key, available, unavailable, limitations,
                                        max_duration_seconds, owner_principal_id, exit_evidence, reason, declared_by, supersedes, request_id, correlation_id)
  VALUES (v_id, v_version, v_scope, p_tenant, p_domain, p_kind, v_key, p_available, p_unavailable, v_lim, p_max_duration_seconds, p_owner, btrim(p_exit_evidence), btrim(p_reason),
          v_actor, CASE WHEN v_version > 1 THEN v_version - 1 END, p_request_id, p_correlation)
  RETURNING * INTO r;
  PERFORM shell.ledger(p_tenant, p_domain, v_actor, 'degraded_contract', v_id, v_version, 'shell.degraded.declared',
    jsonb_build_object('dependency', jsonb_build_object('kind', p_kind, 'key', v_key), 'owner_principal_id', p_owner, 'supersedes', r.supersedes,
                       'unavailable', (SELECT coalesce(jsonb_agg(u ->> 'action'), '[]'::jsonb) FROM jsonb_array_elements(p_unavailable) u), 'max_duration_seconds', p_max_duration_seconds), p_correlation);
  RETURN jsonb_build_object('contract_id', r.contract_id, 'version', r.version, 'supersedes', r.supersedes, 'declared_at', r.declared_at, 'dependency', jsonb_build_object('kind', p_kind, 'key', v_key),
    'owner_principal_id', p_owner, 'replayed', false, 'state', shell.dg_evaluate(r, clock_timestamp(), NULL));
END $$;
REVOKE ALL ON FUNCTION shell.degraded_contract_declare(uuid, uuid, uuid, text, text, int, jsonb, jsonb, jsonb, int, uuid, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.degraded_contract_declare(uuid, uuid, uuid, text, text, int, jsonb, jsonb, jsonb, int, uuid, text, text, uuid, uuid) TO eye_commit;

-- §DG.6 EXIT (the verified recovery) ─────────────────────────────────────────────────────────────────────────────────────────────────────
/* The OWNER records the exit evidence of the contract version it read: refused while the live signal reads degraded (the state persists until
   verified recovery), refused when there is nothing to exit (no degradation since the last exit) or when no read evaluates the dependency;
   the signal it was verified against is kept. A replayed request id answers the recorded exit. */
CREATE OR REPLACE FUNCTION shell.degraded_exit(p_request_id uuid, p_tenant uuid, p_domain uuid, p_contract_id uuid, p_contract_version int, p_evidence text, p_evidence_refs jsonb,
    p_journal jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shell, observation, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; c shell.degraded_contracts%ROWTYPE; x shell.degraded_exits%ROWTYPE; v_eval jsonb; v_id uuid := gen_random_uuid(); v_refs jsonb := coalesce(p_evidence_refs, '[]'::jsonb);
BEGIN
  PERFORM observation.assert_authority(ARRAY['shell.degraded.exit']);
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'degraded contract rejected (request): an exit carries its request id (the command identity a retry reuses)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO c FROM shell.degraded_contracts k WHERE k.contract_id = p_contract_id ORDER BY k.version DESC LIMIT 1;
  IF NOT FOUND OR (c.scope = 'DOMAIN' AND (c.tenant_id IS DISTINCT FROM p_tenant OR c.domain_id IS DISTINCT FROM p_domain)) OR (c.scope = 'PLATFORM' AND (p_tenant IS NOT NULL OR p_domain IS NOT NULL)) THEN
    RAISE EXCEPTION 'degraded contract rejected (unknown_contract): no degraded contract % in this scope', coalesce(p_contract_id::text, '<null>') USING ERRCODE = '22023';
  END IF;
  PERFORM shell.dg_assert_scope(c.dependency_kind, p_tenant, p_domain);
  v_actor := shell.dg_actor(p_actor);
  SELECT * INTO x FROM shell.degraded_exits e WHERE e.request_id = p_request_id;
  IF FOUND THEN
    IF x.recorded_by IS DISTINCT FROM v_actor OR x.contract_id IS DISTINCT FROM p_contract_id THEN
      RAISE EXCEPTION 'degraded contract rejected (duplicate): request % already recorded another exit; a new exit takes a new request id', p_request_id USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('exit_id', x.exit_id, 'contract_id', x.contract_id, 'contract_version', x.contract_version, 'recorded_at', x.recorded_at, 'replayed', true);
  END IF;
  IF v_actor IS DISTINCT FROM c.owner_principal_id THEN
    RAISE EXCEPTION 'degraded contract rejected (authority): the exit evidence is recorded by the contract''s owner (%), never by another person', c.owner_principal_id USING ERRCODE = '42501';
  END IF;
  IF p_contract_version IS DISTINCT FROM c.version THEN
    RAISE EXCEPTION 'degraded contract rejected (stale): the contract is at version %; this exit read %', c.version, coalesce(p_contract_version::text, 'no version') USING ERRCODE = '23514';
  END IF;
  IF p_evidence IS NULL OR length(btrim(p_evidence)) < 8 OR length(p_evidence) > 2000 THEN
    RAISE EXCEPTION 'degraded contract rejected (evidence): the exit evidence says what verified the recovery, in 8 to 2000 characters (the contract asks: %)', c.exit_evidence USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(v_refs) <> 'array' OR jsonb_array_length(v_refs) > 20 OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_refs) e WHERE jsonb_typeof(e) <> 'string' OR length(e #>> '{}') NOT BETWEEN 1 AND 300) THEN
    RAISE EXCEPTION 'degraded contract rejected (evidence_refs): at most twenty references, each 1–300 characters' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('shell.degraded.exit:' || c.contract_id::text, 0));
  v_eval := shell.dg_evaluate(c, clock_timestamp(), p_journal);
  IF v_eval ->> 'mode' = 'active' THEN
    RAISE EXCEPTION 'degraded contract rejected (state): % % still reads DEGRADED (%); the exit is recorded only once the signal reads recovered', c.dependency_kind, c.dependency_key,
      v_eval -> 'signal' ->> 'reason' USING ERRCODE = '23514';
  END IF;
  IF v_eval ->> 'mode' = 'unknown' THEN
    RAISE EXCEPTION 'degraded contract rejected (state): no read evaluates a % dependency here, so no recovery can be verified against it', c.dependency_kind USING ERRCODE = '23514';
  END IF;
  IF v_eval ->> 'mode' = 'normal' THEN
    RAISE EXCEPTION 'degraded contract rejected (state): % % has not been degraded since %; there is nothing to exit', c.dependency_kind, c.dependency_key,
      coalesce(v_eval -> 'last_exit' ->> 'recorded_at', v_eval ->> 'first_declared_at') USING ERRCODE = '23514';
  END IF;
  INSERT INTO shell.degraded_exits (exit_id, contract_id, contract_version, scope, tenant_id, domain_id, evidence, evidence_refs, signal, degraded_at, recorded_by, request_id, correlation_id)
  VALUES (v_id, c.contract_id, c.version, c.scope, c.tenant_id, c.domain_id, btrim(p_evidence), v_refs, v_eval -> 'signal', (v_eval -> 'signal' ->> 'last_degraded_at')::timestamptz, v_actor, p_request_id, p_correlation)
  RETURNING * INTO x;
  PERFORM shell.ledger(c.tenant_id, c.domain_id, v_actor, 'degraded_contract', c.contract_id, c.version, 'shell.degraded.exited',
    jsonb_build_object('exit_id', v_id, 'dependency', jsonb_build_object('kind', c.dependency_kind, 'key', c.dependency_key), 'degraded_at', x.degraded_at, 'signal_state', v_eval -> 'signal' ->> 'state'), p_correlation);
  RETURN jsonb_build_object('exit_id', x.exit_id, 'contract_id', c.contract_id, 'contract_version', c.version, 'recorded_at', x.recorded_at, 'degraded_at', x.degraded_at, 'replayed', false,
    'state', shell.dg_evaluate(c, clock_timestamp(), p_journal));
END $$;
REVOKE ALL ON FUNCTION shell.degraded_exit(uuid, uuid, uuid, uuid, int, text, jsonb, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.degraded_exit(uuid, uuid, uuid, uuid, int, text, jsonb, jsonb, uuid, uuid) TO eye_commit;

-- ═══ FOLD §CT (from 0119_b81_x_ct.sql) ═══
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

-- ═══ FOLD §SI (from 0119_b81_x_si.sql) ═══
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

-- ═══ FOLD §LY-G (from 0119_b81_x_lyg.sql) ═══
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0119 §LY-G — CP-6 B81 part `lyg`: RESPONSIVE GRID, DENSITY AND REGIONS — THE PERSON'S OWN LAYOUT PREFERENCES (F-P7-E-04: UX-14-002 the
-- persisted viewport class / grid / region / panel / density / focus / overflow / saved layout; DEN-01…03 the density switched per person;
-- UX-14-004 adaptation never hides authority; UX-ADR-013). Part-local file (folded into the one 0119 at integration, in the order §0, §DG,
-- §CT, §SI, §LY); applies ALONE on 0001–0118 + the prelude (0119_b81_patterns_layout_content.sql §0).
--
-- §LY.1 shell.preferences — a principal's OWN presentation preferences, ONE SERIES PER PERSON AND COMPOSITION (`default` = the person's
--       general choice; a composition key such as `prediction.warnings` or `home.operations-room` = that composition's own layout):
--         density   DEN-01 strategic (44 px controls, 40–48 px rows) · DEN-02 operational (36 px; 32–36 px rows) · DEN-03 inspection
--                   (28–32 px) — or NULL: no choice, the shell applies the role / composition default (apps/web/lib/layout-b81.ts decides
--                   that default; the server stores only what the person chose);
--         layout    the composition's saved layout, validated KEY BY KEY (an unknown key is refused, never stored): the viewport class it
--                   was saved at, the 12-column grid, the spans and states of the regions, the one supporting panel, the rail, the region
--                   that held focus, the overflow policy. THE BOUNDARY (UX-14-004, UX-ADR-013, REG-01/03/06/07/08): a saved layout can
--                   NEVER hide the context, the primary task, the action, the status or the authority region, nor the evidence — only the
--                   inspector (secondary detail) may be saved collapsed; an overflow policy that clips is refused (no clipped control).
--       APPEND-ONLY versions (each names the version it supersedes; a save that read an older version is refused `(stale)` — nothing is
--       overwritten; the same content as the current version is answered `unchanged`, no new version). Every version carries the layout
--       CONTRACT it was validated under (shell.layout_contract_version()) so a later contract RECONCILES it (the web's reconcileLayout)
--       instead of guessing. RLS by principal (a principal id is global — another principal, even in the same domain, reads none of it).
--       PRESENTATION ONLY: density and layout change how things are shown, never what they mean, who may act, or what an act does — no
--       field can carry a command, an approval or a role.
-- §LY.2 shell.save_preferences — the write port (`shell.preferences.save`): the bound action asserted, the ESTABLISHED context's scope (a
--       PLATFORM context saves with no tenant or domain; otherwise the bound tenant and domain), the acting principal = eye_principal(), a
--       NAMED ACTIVE HUMAN re-checked in the port (an agent or a workload keeps no preference), the stale check, the ledger (shell.events).
-- §LY.3 shell.preferences_of — the principal's own read (current per composition + its version history), refused `(actor)` for any other
--       principal and `(access)` outside the caller's bound scope.
--
-- Refusals in the class form `layout preference rejected (<class>): …` — 403 actor|access · 409 stale · 422 the rest. NOTE (the
-- integrator): the noun `layout preference` is not mapped centrally yet (observation-errors.ts).
--
-- THREE CLAIMS: construction (this file, apps/api/src/shell/preferences, apps/web/components/layout.tsx, lib/layout-b81.ts and the harness
-- phase6-preferences-b81 — every persona and preference there SYNTHETIC); demonstrated operation (the act: L. Brandt's density switched to
-- strategic on eye_demo — SYNTHETIC persona); real acceptance (UX-14-006 / UX-19-006 → the shared non-demonstration recording path at B111,
-- then H3) — never claimed here.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §LY.0 THE VOCABULARY ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* The layout contract the saved layouts are validated under (apps/web/lib/layout-b81.ts LAYOUT_CONTRACT — the same string). */
CREATE OR REPLACE FUNCTION shell.layout_contract_version() RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'b81-lyg-layout-1' $$;
/* BP-01…05 (compact 0–639 · narrow 640–959 · standard 960–1439 · wide 1440–1919 · command ≥ 1920), DEN-01…03, the seven regions. */
CREATE OR REPLACE FUNCTION shell.layout_classes() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['BP-01', 'BP-02', 'BP-03', 'BP-04', 'BP-05'] $$;
CREATE OR REPLACE FUNCTION shell.densities() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['DEN-01', 'DEN-02', 'DEN-03'] $$;
CREATE OR REPLACE FUNCTION shell.region_keys() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['context', 'primary', 'evidence', 'inspector', 'action', 'status', 'authority'] $$;
/* The regions a saved layout may collapse: the inspector only (secondary detail). Context, primary, evidence, action, status and authority
   are never hidden by a preference (UX-14-004, UX-ADR-013). */
CREATE OR REPLACE FUNCTION shell.collapsible_regions() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['inspector'] $$;
GRANT EXECUTE ON FUNCTION shell.layout_contract_version(), shell.layout_classes(), shell.densities(), shell.region_keys(), shell.collapsible_regions() TO eye_app, eye_commit;

/* A saved layout's shape, validated key by key (null = admissible): what UX-14-002 names and nothing else. */
CREATE OR REPLACE FUNCTION shell.layout_problem(p jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = shell, pg_catalog, pg_temp AS $$
DECLARE k text; v jsonb; rk text; rv jsonb;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN RETURN 'the layout is an object'; END IF;
  IF length(p::text) > 8192 THEN RETURN 'the layout is at most 8 KiB'; END IF;
  FOR k, v IN SELECT * FROM jsonb_each(p) LOOP
    IF k NOT IN ('viewport_class', 'grid', 'regions', 'panel', 'rail', 'focus_region', 'overflow') THEN
      RETURN format('the layout carries no key %s (viewport_class, grid, regions, panel, rail, focus_region, overflow)', k);
    END IF;
  END LOOP;
  IF p ? 'viewport_class' AND NOT (jsonb_typeof(p -> 'viewport_class') = 'string' AND (p ->> 'viewport_class') = ANY (shell.layout_classes())) THEN
    RETURN 'the viewport class is one of BP-01…BP-05';
  END IF;
  IF p ? 'grid' THEN
    IF jsonb_typeof(p -> 'grid') <> 'object' OR (SELECT count(*) FROM jsonb_object_keys(p -> 'grid') g WHERE g <> 'columns') > 0
       OR jsonb_typeof(p -> 'grid' -> 'columns') IS DISTINCT FROM 'number' OR (p -> 'grid' ->> 'columns') IS DISTINCT FROM '12' THEN
      RETURN 'the grid is the approved 12-column grid ({"columns": 12})';
    END IF;
  END IF;
  IF p ? 'regions' THEN
    IF jsonb_typeof(p -> 'regions') <> 'object' THEN RETURN 'the regions are an object keyed by region'; END IF;
    FOR rk, rv IN SELECT * FROM jsonb_each(p -> 'regions') LOOP
      IF NOT (rk = ANY (shell.region_keys())) THEN RETURN format('%s is not a region (%s)', rk, array_to_string(shell.region_keys(), ', ')); END IF;
      IF jsonb_typeof(rv) <> 'object' THEN RETURN format('the %s region is {span?, state?}', rk); END IF;
      FOR k IN SELECT jsonb_object_keys(rv) LOOP
        IF k NOT IN ('span', 'state') THEN RETURN format('the %s region carries no key %s (span, state)', rk, k); END IF;
      END LOOP;
      IF rv ? 'span' AND NOT (jsonb_typeof(rv -> 'span') = 'number' AND (rv ->> 'span') ~ '^([1-9]|1[0-2])$') THEN
        RETURN format('the %s region spans 1–12 columns', rk);
      END IF;
      IF rv ? 'state' AND NOT (jsonb_typeof(rv -> 'state') = 'string' AND (rv ->> 'state') IN ('open', 'collapsed')) THEN
        RETURN format('the %s region is open or collapsed', rk);
      END IF;
    END LOOP;
  END IF;
  IF p ? 'panel' AND jsonb_typeof(p -> 'panel') <> 'null' AND NOT (jsonb_typeof(p -> 'panel') = 'string' AND (p ->> 'panel') IN ('evidence', 'inspector')) THEN
    RETURN 'the supporting panel is evidence or inspector (or null)';
  END IF;
  IF p ? 'rail' AND NOT (jsonb_typeof(p -> 'rail') = 'string' AND (p ->> 'rail') IN ('expanded', 'collapsed')) THEN
    RETURN 'the rail is expanded or collapsed';
  END IF;
  IF p ? 'focus_region' AND jsonb_typeof(p -> 'focus_region') <> 'null' AND NOT (jsonb_typeof(p -> 'focus_region') = 'string' AND (p ->> 'focus_region') = ANY (shell.region_keys())) THEN
    RETURN 'the focus region is a region key';
  END IF;
  IF p ? 'overflow' AND NOT (jsonb_typeof(p -> 'overflow') = 'string' AND (p ->> 'overflow') IN ('reflow', 'scroll_region')) THEN
    RETURN 'the overflow policy is reflow or scroll_region (content is never clipped)';
  END IF;
  RETURN NULL;
END $$;
/* THE BOUNDARY (null = admissible): a saved layout never hides a protected region (UX-14-004). Separate from the shape so its class is its own. */
CREATE OR REPLACE FUNCTION shell.layout_hides(p jsonb) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = shell, pg_catalog, pg_temp AS $$
  SELECT string_agg(r.key, ', ' ORDER BY r.key) FROM jsonb_each(coalesce(p -> 'regions', '{}'::jsonb)) r
   WHERE jsonb_typeof(r.value) = 'object' AND (r.value ->> 'state') = 'collapsed' AND NOT (r.key = ANY (shell.collapsible_regions())) $$;
GRANT EXECUTE ON FUNCTION shell.layout_problem(jsonb), shell.layout_hides(jsonb) TO eye_app, eye_commit;

-- §LY.1 THE PREFERENCES ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE shell.preferences (
  preference_id   uuid PRIMARY KEY,
  principal_id    uuid NOT NULL,
  scope           text NOT NULL CHECK (scope IN ('PLATFORM', 'TENANT', 'DOMAIN')),   -- the context the version was SAVED in (recorded, not a key)
  tenant_id       uuid,
  domain_id       uuid,
  composition     text NOT NULL CHECK (composition ~ '^[a-z][a-z0-9_.-]{1,80}$'),
  version         int NOT NULL CHECK (version >= 1),
  supersedes      uuid REFERENCES shell.preferences (preference_id),
  density         text CHECK (density IS NULL OR density = ANY (shell.densities())),
  layout          jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (shell.layout_problem(layout) IS NULL AND shell.layout_hides(layout) IS NULL),
  contract        text NOT NULL,
  digest          text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  saved_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT pref_scope_shape CHECK ((scope = 'PLATFORM' AND tenant_id IS NULL AND domain_id IS NULL) OR (scope <> 'PLATFORM' AND tenant_id IS NOT NULL AND domain_id IS NOT NULL)),
  CONSTRAINT pref_version_chain CHECK ((version = 1) = (supersedes IS NULL))
);
/* ONE series per person and composition (a person's density is theirs in every domain they work in — presentation, never authority) */
CREATE UNIQUE INDEX pref_one_version ON shell.preferences (principal_id, composition, version);
CREATE UNIQUE INDEX pref_one_successor ON shell.preferences (supersedes) WHERE supersedes IS NOT NULL;
CREATE INDEX pref_principal ON shell.preferences (principal_id, composition, saved_at DESC);
CREATE TRIGGER pref_append_only BEFORE UPDATE OR DELETE ON shell.preferences FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
ALTER TABLE shell.preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE shell.preferences FORCE ROW LEVEL SECURITY;
/* a principal reads its OWN preferences only (a principal id is global: the same domain's colleague reads none of them) */
CREATE POLICY pref_own ON shell.preferences FOR SELECT TO eye_app, eye_commit USING (principal_id = public.eye_principal());
GRANT SELECT ON shell.preferences TO eye_app, eye_commit;
COMMENT ON TABLE shell.preferences IS 'B81 §LY-G (0119): a principal''s own density and saved layout per composition — append-only versions, presentation only (never a command, an approval or a role).';

-- §LY.2 THE WRITE PORT (`shell.preferences.save`) ──────────────────────────────────────────────────────────────────────────────────────────
/* p_expected_version is the version the client READ (0 when there was none). A NULL density is "no choice" (the role / composition default
   applies); an empty layout is "no saved layout" (the composition's approved default applies) — a reset is a new version, never a delete. */
CREATE OR REPLACE FUNCTION shell.save_preferences(
  p_preference_id uuid, p_tenant uuid, p_domain uuid, p_composition text, p_expected_version int, p_density text, p_layout jsonb,
  p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shell, observation, identity, public, pg_catalog, pg_temp AS $$
DECLARE
  v_scope text := public.eye_scope();
  v_kind text; v_status text;
  v_cur shell.preferences%ROWTYPE;
  v_layout jsonb := coalesce(p_layout, '{}'::jsonb);
  v_problem text; v_version int; v_digest text; v_row shell.preferences%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['shell.preferences.save']);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'layout preference rejected (actor): a preference is saved by its own principal, never on another''s behalf' USING ERRCODE = '42501';
  END IF;
  SELECT p.kind, p.status INTO v_kind, v_status FROM identity.principals p WHERE p.id = p_actor;
  IF v_kind IS DISTINCT FROM 'human' OR v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'layout preference rejected (actor): a layout preference is a named, active human''s own — an agent or a workload keeps none' USING ERRCODE = '42501';
  END IF;
  -- the scope is the ESTABLISHED context's, never an argument's: PLATFORM keeps no tenant or domain; otherwise both must be the bound ones
  IF v_scope = 'PLATFORM' THEN
    IF p_tenant IS NOT NULL OR p_domain IS NOT NULL THEN
      RAISE EXCEPTION 'layout preference rejected (access): a PLATFORM context saves with no tenant and no domain' USING ERRCODE = '42501';
    END IF;
  ELSIF p_tenant IS NULL OR p_domain IS NULL OR p_tenant IS DISTINCT FROM public.eye_tenant()
        OR (v_scope = 'DOMAIN' AND p_domain IS DISTINCT FROM public.eye_domain()) THEN
    RAISE EXCEPTION 'layout preference rejected (access): a preference is saved in the established context''s own tenant and domain' USING ERRCODE = '42501';
  END IF;
  IF p_composition IS NULL OR p_composition !~ '^[a-z][a-z0-9_.-]{1,80}$' THEN
    RAISE EXCEPTION 'layout preference rejected (composition): a composition is named in lower case (default, prediction.warnings, home.operations-room)' USING ERRCODE = '22023';
  END IF;
  IF p_density IS NOT NULL AND NOT (p_density = ANY (shell.densities())) THEN
    RAISE EXCEPTION 'layout preference rejected (density): % is not a density (DEN-01 strategic, DEN-02 operational, DEN-03 inspection — or none, for the default)', p_density USING ERRCODE = '22023';
  END IF;
  v_problem := shell.layout_problem(v_layout);
  IF v_problem IS NOT NULL THEN RAISE EXCEPTION 'layout preference rejected (layout): %', v_problem USING ERRCODE = '22023'; END IF;
  v_problem := shell.layout_hides(v_layout);
  IF v_problem IS NOT NULL THEN
    RAISE EXCEPTION 'layout preference rejected (region): a saved layout never hides the % region — only the inspector may be collapsed; context, primary task, evidence, action, status and authority stay shown at every size (UX-14-004)', v_problem USING ERRCODE = '22023';
  END IF;
  IF p_expected_version IS NULL OR p_expected_version < 0 THEN
    RAISE EXCEPTION 'layout preference rejected (version): the save names the version it read (0 when there was none)' USING ERRCODE = '22023';
  END IF;

  -- one save at a time per series (the person's preference for this composition)
  PERFORM pg_advisory_xact_lock(hashtextextended('shell.preferences:' || p_actor || ':' || p_composition, 0));
  SELECT * INTO v_cur FROM shell.preferences s WHERE s.principal_id = p_actor AND s.composition = p_composition ORDER BY s.version DESC LIMIT 1;
  v_version := coalesce(v_cur.version, 0);
  IF v_version <> p_expected_version THEN
    RAISE EXCEPTION 'layout preference rejected (stale): your % preference is at version %; this save read version % — read it again (nothing was overwritten)', p_composition, v_version, p_expected_version USING ERRCODE = '23514';
  END IF;
  v_digest := encode(sha256(convert_to(jsonb_build_object('composition', p_composition, 'density', p_density, 'layout', v_layout, 'contract', shell.layout_contract_version())::text, 'UTF8')), 'hex');
  IF v_cur.preference_id IS NOT NULL AND v_cur.digest = v_digest THEN
    RETURN jsonb_build_object('preference_id', v_cur.preference_id, 'composition', v_cur.composition, 'version', v_cur.version, 'supersedes', v_cur.supersedes,
      'density', v_cur.density, 'layout', v_cur.layout, 'contract', v_cur.contract, 'digest', v_cur.digest, 'saved_at', v_cur.saved_at, 'unchanged', true);
  END IF;
  INSERT INTO shell.preferences (preference_id, principal_id, scope, tenant_id, domain_id, composition, version, supersedes, density, layout, contract, digest, correlation_id)
  VALUES (p_preference_id, p_actor, v_scope, p_tenant, p_domain, p_composition, v_version + 1, v_cur.preference_id, p_density, v_layout, shell.layout_contract_version(), v_digest, p_correlation)
  RETURNING * INTO v_row;
  PERFORM shell.ledger(p_tenant, p_domain, p_actor, 'layout_preference', p_preference_id, v_row.version, 'shell.preferences.saved',
                       jsonb_build_object('composition', p_composition, 'density', p_density, 'supersedes', v_cur.preference_id, 'digest', v_digest, 'contract', v_row.contract), p_correlation);
  RETURN jsonb_build_object('preference_id', v_row.preference_id, 'composition', v_row.composition, 'version', v_row.version, 'supersedes', v_row.supersedes,
    'scope', v_row.scope, 'tenant_id', v_row.tenant_id, 'domain_id', v_row.domain_id, 'density', v_row.density, 'layout', v_row.layout,
    'contract', v_row.contract, 'digest', v_row.digest, 'saved_at', v_row.saved_at, 'unchanged', false);
END $$;
REVOKE ALL ON FUNCTION shell.save_preferences(uuid, uuid, uuid, text, int, text, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.save_preferences(uuid, uuid, uuid, text, int, text, jsonb, uuid, uuid) TO eye_commit;

-- §LY.3 THE OWN READ ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION shell.preferences_of(p_principal uuid, p_tenant uuid, p_domain uuid, p_composition text, p_history int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = shell, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_scope text := public.eye_scope(); v_out jsonb;
BEGIN
  IF p_principal IS NULL OR p_principal IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'layout preference rejected (actor): a principal reads only its own layout preferences' USING ERRCODE = '42501';
  END IF;
  IF v_scope = 'PLATFORM' THEN
    IF p_tenant IS NOT NULL OR p_domain IS NOT NULL THEN
      RAISE EXCEPTION 'layout preference rejected (access): a PLATFORM context reads with no tenant and no domain' USING ERRCODE = '42501';
    END IF;
  ELSIF p_domain IS NULL OR NOT observation.read_scope_ok(p_tenant, p_domain) THEN
    RAISE EXCEPTION 'layout preference rejected (access): a layout preference is read only within the caller''s bound tenant and domain' USING ERRCODE = '42501';
  END IF;
  IF p_composition IS NOT NULL AND p_composition !~ '^[a-z][a-z0-9_.-]{1,80}$' THEN
    RAISE EXCEPTION 'layout preference rejected (composition): a composition is named in lower case' USING ERRCODE = '22023';
  END IF;
  WITH mine AS (
    SELECT s.* FROM shell.preferences s WHERE s.principal_id = p_principal AND (p_composition IS NULL OR s.composition = p_composition)
  ), cur AS (
    SELECT DISTINCT ON (composition) * FROM mine ORDER BY composition, version DESC
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'composition', c.composition,
      'current', jsonb_build_object('preference_id', c.preference_id, 'version', c.version, 'supersedes', c.supersedes, 'density', c.density, 'layout', c.layout,
                                    'contract', c.contract, 'current_contract', c.contract = shell.layout_contract_version(), 'digest', c.digest, 'saved_at', c.saved_at),
      'versions', (SELECT count(*) FROM mine m WHERE m.composition = c.composition),
      'history', (SELECT coalesce(jsonb_agg(jsonb_build_object('preference_id', h.preference_id, 'version', h.version, 'density', h.density, 'digest', h.digest, 'saved_at', h.saved_at) ORDER BY h.version DESC), '[]'::jsonb)
                    FROM (SELECT * FROM mine m WHERE m.composition = c.composition ORDER BY m.version DESC LIMIT greatest(0, least(coalesce(p_history, 5), 50))) h)
    ) ORDER BY c.composition), '[]'::jsonb) INTO v_out FROM cur c;
  RETURN jsonb_build_object('principal_id', p_principal, 'scope', v_scope, 'tenant_id', p_tenant, 'domain_id', p_domain, 'read_at', clock_timestamp(),
    'contract', shell.layout_contract_version(), 'compositions', v_out,
    'claim', 'the principal''s own presentation preferences — density and layout change how things are shown, never what they mean, who may act or what an act does');
END $$;
REVOKE ALL ON FUNCTION shell.preferences_of(uuid, uuid, uuid, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.preferences_of(uuid, uuid, uuid, text, int) TO eye_app, eye_commit;

-- ═══ FOLD §LY-M (from 0119_b81_x_lym.sql) ═══
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0119 §LY-M — CP-6 B81 part `lym`: MULTI-WINDOW COMPOSITION AND THE COMMAND ENVIRONMENT (F-P7-E-04: UX-16-001…006, PAT-45 session handoff,
-- PAT-46 large-display control, BP-05 the ≥ 1920 command composition). Part-local file (folded into the one 0119 at integration, in the
-- order §0, §DG, §CT, §SI, §LY); applies ALONE on 0001–0118 + the prelude + the wave-1 part files (0119_b81_x_{ct,dg,ha,lyg}).
--
-- THE GAP. A view could be opened in a second window or on a large display only as an unrelated page: nothing recorded WHICH window is the
-- authoritative control surface, nothing let a person move their review to another device except by signing in and finding it again, and a
-- mirrored display was indistinguishable from a control surface. UX-16-001…005 ask for shared context, synchronized views, ONE explicit
-- control surface, audience-safe presentation, and — when views drift, synchronisation fails, a display loses its classification context or
-- the control surface becomes unavailable — frozen mirrors, a divergence watermark, the last verified state kept, and control transferred
-- through sign-in on the claiming device.
--
-- THE MECHANISM (DESIGN D10: a handoff is the SAME PERSON's own signed-in session; mirrored / presentation displays carry no controls).
--   shell.session_handoffs          THE OFFER: a person's review context (workspace, location — route, object + version, selection —, the
--                                   context-bar dimensions it was read under) offered FROM one of their signed-in sessions, with an
--                                   expiry (1–30 minutes) and optionally the DISPLAY whose control it moves. Carries no role, no grant and
--                                   no token: nothing of the offering session's authority is in it. APPEND-ONLY.
--   shell.session_handoff_receipts  THE RECEIPT that closes an offer, at most ONE per offer (single use — the unique key): `claimed` by
--                                   ANOTHER active password session of the SAME principal (the person signed in on the claiming device:
--                                   control transferred through authentication), with the claiming session's OWN roles RE-READ from
--                                   identity.role_bindings at the claim (evidence that no authority was inherited); or `revoked` by the
--                                   person. Expiry is the clock's (no row: an unclaimed offer past its expiry is `expired`). APPEND-ONLY.
--   shell.presentation_states       a person's DISPLAY (a named surface: `operations-room`, `briefing-wall` …) as versioned states: what
--                                   it shows (the location and selection), the DATA WATERMARK (the instant the shown data is as of), the
--                                   CLASSIFICATION context, the AUDIENCE, the context-bar dimensions, and its CONTROL SURFACE (the one
--                                   session that may publish to it). A different session publishes only after control moved to it — by a
--                                   claimed handoff naming the display, or because the controlling session is no longer signed in (the
--                                   person re-authenticated: `reauthentication`); a second window never takes control silently.
--                                   `ended` withdraws what the display shows (presentation privacy). APPEND-ONLY versions; a publish that
--                                   read an older version is refused `(stale)`.
--   ports                           shell.offer_handoff / shell.claim_handoff / shell.revoke_handoff (`shell.handoff.{offer,claim,revoke}`)
--                                   and shell.publish_presentation (`shell.presentation.publish`): SECURITY DEFINER, eye_commit; the bound
--                                   action, the ESTABLISHED context's scope, the acting principal = eye_principal(), a NAMED ACTIVE HUMAN
--                                   and the CURRENT SESSION (public.eye_session(), active, the principal's own) re-checked in the port;
--                                   the ledger (shell.events). Reads shell.handoffs_of (`shell.handoff.read`) and shell.presentation_of
--                                   (`shell.presentation.read`): the principal's OWN rows only, guarded by the read scope.
--   RLS                             0118's per-principal idiom: FORCE RLS, SELECT to eye_app / eye_commit where principal_id =
--                                   eye_principal() (a principal id is global — a colleague in the same domain reads none of it).
--
-- THE BOUNDARY. A handoff or a presentation EXECUTES NOTHING: it moves where a person is looking and which of their own sessions is the
-- control surface. Every consequential act stays behind its page's Command Review and its own governed, human-gated port, evaluated under
-- the CLAIMING session's own roles. A presentation state names no command; a display renders none (apps/web/lib/windows-b81.ts).
--
-- Refusals in the class form `session handoff rejected (<class>): …` and `presentation state rejected (<class>): …` — 403 actor|access ·
-- 404 unknown_handoff|unknown_display · 409 state|stale|duplicate|expired · 422 the rest. NOTE (the integrator): the nouns `session
-- handoff` and `presentation state` are not mapped centrally yet (observation-errors.ts).
--
-- THREE CLAIMS: construction (this file, apps/api/src/shell/windows, apps/web/components/command-environment.tsx, lib/windows-b81.ts and the
-- harness phase6-handoffs-b81 — every persona, session, handoff and display there SYNTHETIC); demonstrated operation (the act: L. Brandt
-- offers the package review and claims it on a second browser context — SYNTHETIC persona); real acceptance (UX-16-006 → the shared
-- non-demonstration recording path at B111, then H3) — never claimed here.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §LYM.0 THE VOCABULARY ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* The windows contract (apps/web/lib/windows-b81.ts WINDOWS_CONTRACT — the same string). */
CREATE OR REPLACE FUNCTION shell.windows_contract_version() RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'b81-lym-windows-1' $$;
/* Who a display is shown to: the person alone, a briefing room, an operations centre, a secure kiosk. */
CREATE OR REPLACE FUNCTION shell.presentation_audiences() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['private', 'briefing_room', 'operations_centre', 'kiosk'] $$;
/* The classification context a display must carry (the context bar's classifications, B36 0094). */
CREATE OR REPLACE FUNCTION shell.presentation_classifications() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['public', 'internal', 'confidential', 'restricted'] $$;
/* The handoff's bounded lifetime (seconds): one minute to thirty minutes; ten by default. */
CREATE OR REPLACE FUNCTION shell.handoff_expiry_bounds() RETURNS int[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[60, 1800, 600] $$;
GRANT EXECUTE ON FUNCTION shell.windows_contract_version(), shell.presentation_audiences(), shell.presentation_classifications(), shell.handoff_expiry_bounds() TO eye_app, eye_commit;

/* The context-bar dimensions a view was read under (UX-16-002), validated key by key (null = admissible). */
CREATE OR REPLACE FUNCTION shell.view_context_problem(p jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = shell, pg_catalog, pg_temp AS $$
DECLARE k text; v jsonb;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN RETURN 'the view context is an object'; END IF;
  IF length(p::text) > 2048 THEN RETURN 'the view context is at most 2 KiB'; END IF;
  FOR k, v IN SELECT * FROM jsonb_each(p) LOOP
    IF k NOT IN ('digest', 'objective_id', 'scenario_id', 'horizon', 'classification', 'effective_at', 'purpose') THEN
      RETURN format('the view context carries no key %s (digest, objective_id, scenario_id, horizon, classification, effective_at, purpose)', k);
    END IF;
    IF jsonb_typeof(v) NOT IN ('string', 'null') THEN RETURN format('the view context''s %s is a text or null', k); END IF;
  END LOOP;
  IF (p ->> 'digest') IS NOT NULL AND (p ->> 'digest') !~ '^[0-9a-f]{64}$' THEN RETURN 'the context digest is a sha-256 in hex'; END IF;
  IF (p ->> 'objective_id') IS NOT NULL AND (p ->> 'objective_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN 'the objective is an id'; END IF;
  IF (p ->> 'scenario_id') IS NOT NULL AND (p ->> 'scenario_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN 'the scenario is an id'; END IF;
  IF (p ->> 'horizon') IS NOT NULL AND (p ->> 'horizon') !~ '^[0-9]{1,3}[dmy]$' THEN RETURN 'the horizon is a span such as 90d or 12m'; END IF;
  IF (p ->> 'classification') IS NOT NULL AND NOT ((p ->> 'classification') = ANY (shell.presentation_classifications())) THEN RETURN 'the classification is public, internal, confidential or restricted'; END IF;
  IF (p ->> 'effective_at') IS NOT NULL AND (p ->> 'effective_at') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+(Z|[+-][0-9]{2}:[0-9]{2})$' THEN RETURN 'the effective time is an ISO instant'; END IF;
  IF (p ->> 'purpose') IS NOT NULL AND (p ->> 'purpose') !~ '^[a-z][a-z0-9_.-]{1,60}$' THEN RETURN 'the purpose is a purpose key'; END IF;
  RETURN NULL;
END $$;
/* A display's key: lower case, short. */
CREATE OR REPLACE FUNCTION shell.display_ok(p text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT p IS NOT NULL AND p ~ '^[a-z][a-z0-9_.-]{1,60}$' $$;
GRANT EXECUTE ON FUNCTION shell.view_context_problem(jsonb), shell.display_ok(text) TO eye_app, eye_commit;

/* The CURRENT session of the established context, when it is the principal's own, active, unexpired, signed-in session (null otherwise).
   Internal: read under the definer by the ports below (identity.sessions is not readable by eye_app / eye_commit). */
CREATE OR REPLACE FUNCTION shell.own_live_session(p_actor uuid, p_password_only boolean) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = identity, public, pg_catalog, pg_temp AS $$
  SELECT s.id FROM identity.sessions s
   WHERE s.id = public.eye_session() AND s.principal_id = p_actor AND s.status = 'active' AND s.expires_at > clock_timestamp()
     AND (NOT p_password_only OR s.assurance = 'password') $$;
/* Is a session (any of the principal's) still signed in? Used to decide whether a display's control surface is AVAILABLE. */
CREATE OR REPLACE FUNCTION shell.session_live(p_session uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = identity, public, pg_catalog, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM identity.sessions s WHERE s.id = p_session AND s.status = 'active' AND s.expires_at > clock_timestamp()) $$;
REVOKE ALL ON FUNCTION shell.own_live_session(uuid, boolean), shell.session_live(uuid) FROM PUBLIC;

-- §LYM.1 THE HANDOFFS ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE shell.session_handoffs (
  handoff_id        uuid PRIMARY KEY,
  principal_id      uuid NOT NULL,
  scope             text NOT NULL CHECK (scope IN ('PLATFORM', 'TENANT', 'DOMAIN')),
  tenant_id         uuid,
  domain_id         uuid,
  workspace         text NOT NULL CHECK (workspace = ANY (shell.workspace_keys())),
  location          jsonb NOT NULL CHECK (shell.location_problem(location) IS NULL AND length(location::text) <= 16384),
  view_context      jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (shell.view_context_problem(view_context) IS NULL),
  display           text CHECK (display IS NULL OR shell.display_ok(display)),
  target_device     text CHECK (target_device IS NULL OR target_device ~ '^[A-Za-z0-9 _.()-]{1,40}$'),
  offering_session  uuid NOT NULL,
  offered_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at        timestamptz NOT NULL,
  contract          text NOT NULL,
  digest            text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  correlation_id    uuid NOT NULL,
  CONSTRAINT sho_scope_shape CHECK ((scope = 'PLATFORM' AND tenant_id IS NULL AND domain_id IS NULL) OR (scope <> 'PLATFORM' AND tenant_id IS NOT NULL AND domain_id IS NOT NULL)),
  CONSTRAINT sho_workspace_scope CHECK ((workspace = 'admin') = (scope = 'PLATFORM')),
  CONSTRAINT sho_expiry CHECK (expires_at > offered_at AND expires_at <= offered_at + interval '30 minutes'),
  CONSTRAINT sho_route_in_workspace CHECK ((location ->> 'route') = shell.workspace_prefix(workspace) OR (location ->> 'route') LIKE shell.workspace_prefix(workspace) || '/%')
);
CREATE INDEX sho_principal ON shell.session_handoffs (principal_id, offered_at DESC);
CREATE TRIGGER sho_append_only BEFORE UPDATE OR DELETE ON shell.session_handoffs FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
ALTER TABLE shell.session_handoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE shell.session_handoffs FORCE ROW LEVEL SECURITY;
/* a principal reads its OWN handoffs only (a principal id is global: the same domain's colleague reads none of them) */
CREATE POLICY sho_own ON shell.session_handoffs FOR SELECT TO eye_app, eye_commit USING (principal_id = public.eye_principal());
GRANT SELECT ON shell.session_handoffs TO eye_app, eye_commit;
COMMENT ON TABLE shell.session_handoffs IS 'B81 §LY-M (0119; PAT-45): a person''s review context offered from one of their signed-in sessions to another — append-only, bounded expiry, no role, no grant, no token (authority is never inherited).';

CREATE TABLE shell.session_handoff_receipts (
  receipt_id        uuid PRIMARY KEY,
  handoff_id        uuid NOT NULL REFERENCES shell.session_handoffs (handoff_id),
  principal_id      uuid NOT NULL,
  outcome           text NOT NULL CHECK (outcome IN ('claimed', 'revoked')),
  acting_session    uuid NOT NULL,
  claiming_session  uuid,
  roles_at_claim    text[],
  reason            text CHECK (reason IS NULL OR length(reason) BETWEEN 1 AND 400),
  closed_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id    uuid NOT NULL,
  CONSTRAINT shr_claim_shape CHECK ((outcome = 'claimed') = (claiming_session IS NOT NULL AND roles_at_claim IS NOT NULL)),
  CONSTRAINT shr_claim_session CHECK (outcome <> 'claimed' OR claiming_session = acting_session)
);
/* SINGLE USE: one receipt per offer — a second claim (or a claim after a revocation) has nowhere to go */
CREATE UNIQUE INDEX shr_single_use ON shell.session_handoff_receipts (handoff_id);
CREATE INDEX shr_principal ON shell.session_handoff_receipts (principal_id, closed_at DESC);
CREATE TRIGGER shr_append_only BEFORE UPDATE OR DELETE ON shell.session_handoff_receipts FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
ALTER TABLE shell.session_handoff_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shell.session_handoff_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY shr_own ON shell.session_handoff_receipts FOR SELECT TO eye_app, eye_commit USING (principal_id = public.eye_principal());
GRANT SELECT ON shell.session_handoff_receipts TO eye_app, eye_commit;
COMMENT ON TABLE shell.session_handoff_receipts IS 'B81 §LY-M (0119; PAT-45): the one receipt that closes a handoff — claimed by another signed-in session of the same person (its own roles re-read) or revoked; single use; append-only.';

/* The state of one handoff at the database clock. */
CREATE OR REPLACE FUNCTION shell.handoff_status(p_expires timestamptz, p_outcome text) RETURNS text LANGUAGE sql AS $$
  SELECT CASE WHEN p_outcome IS NOT NULL THEN p_outcome WHEN clock_timestamp() >= p_expires THEN 'expired' ELSE 'open' END $$;
GRANT EXECUTE ON FUNCTION shell.handoff_status(timestamptz, text) TO eye_app, eye_commit;

-- §LYM.2 THE PRESENTATION STATES ──────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE shell.presentation_states (
  state_id          uuid PRIMARY KEY,
  principal_id      uuid NOT NULL,
  scope             text NOT NULL CHECK (scope IN ('TENANT', 'DOMAIN')),   -- a display shows a domain's work (no PLATFORM display)
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  display           text NOT NULL CHECK (shell.display_ok(display)),
  version           int NOT NULL CHECK (version >= 1),
  supersedes        uuid REFERENCES shell.presentation_states (state_id),
  status            text NOT NULL CHECK (status IN ('presenting', 'ended')),
  location          jsonb CHECK (location IS NULL OR (shell.location_problem(location) IS NULL AND length(location::text) <= 16384)),
  view_context      jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (shell.view_context_problem(view_context) IS NULL),
  watermark         timestamptz,
  classification    text CHECK (classification IS NULL OR classification = ANY (shell.presentation_classifications())),
  audience          text CHECK (audience IS NULL OR audience = ANY (shell.presentation_audiences())),
  control_session   uuid NOT NULL,
  transfer          text CHECK (transfer IS NULL OR transfer IN ('handoff', 'reauthentication')),
  handoff_id        uuid REFERENCES shell.session_handoffs (handoff_id),
  contract          text NOT NULL,
  digest            text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  published_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id    uuid NOT NULL,
  CONSTRAINT prs_version_chain CHECK ((version = 1) = (supersedes IS NULL)),
  /* a presenting state names what it shows, the instant its data is as of, its classification and its audience; an ended one shows nothing */
  CONSTRAINT prs_presenting_shape CHECK (
    (status = 'presenting' AND location IS NOT NULL AND watermark IS NOT NULL AND classification IS NOT NULL AND audience IS NOT NULL)
    OR (status = 'ended' AND location IS NULL AND watermark IS NULL AND classification IS NULL AND audience IS NULL)),
  CONSTRAINT prs_watermark_past CHECK (watermark IS NULL OR watermark <= published_at),
  CONSTRAINT prs_transfer_shape CHECK ((transfer IS NOT DISTINCT FROM 'handoff') = (handoff_id IS NOT NULL))
);
CREATE UNIQUE INDEX prs_one_version ON shell.presentation_states (principal_id, display, version);
CREATE UNIQUE INDEX prs_one_successor ON shell.presentation_states (supersedes) WHERE supersedes IS NOT NULL;
CREATE INDEX prs_principal ON shell.presentation_states (principal_id, display, published_at DESC);
CREATE TRIGGER prs_append_only BEFORE UPDATE OR DELETE ON shell.presentation_states FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
ALTER TABLE shell.presentation_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE shell.presentation_states FORCE ROW LEVEL SECURITY;
CREATE POLICY prs_own ON shell.presentation_states FOR SELECT TO eye_app, eye_commit USING (principal_id = public.eye_principal());
GRANT SELECT ON shell.presentation_states TO eye_app, eye_commit;
COMMENT ON TABLE shell.presentation_states IS 'B81 §LY-M (0119; PAT-46, UX-16-002): a person''s display as versioned states — what it shows, the data watermark, the classification, the audience and the ONE control surface; append-only; presentation only (no command).';

/* One state as the reads answer it (the control surface's availability and whether it is the reading session are evaluated now). */
CREATE OR REPLACE FUNCTION shell.presentation_view(s shell.presentation_states) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = shell, public, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('state_id', s.state_id, 'display', s.display, 'version', s.version, 'supersedes', s.supersedes, 'status', s.status,
    'location', s.location, 'view_context', s.view_context, 'watermark', s.watermark, 'classification', s.classification, 'audience', s.audience,
    'control_session_here', s.control_session = public.eye_session(), 'control_available', shell.session_live(s.control_session),
    'transfer', s.transfer, 'handoff_id', s.handoff_id, 'contract', s.contract, 'digest', s.digest, 'published_at', s.published_at,
    'tenant_id', s.tenant_id, 'domain_id', s.domain_id) $$;
REVOKE ALL ON FUNCTION shell.presentation_view(shell.presentation_states) FROM PUBLIC;

-- §LYM.3 THE OFFER (`shell.handoff.offer`) ─────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION shell.offer_handoff(
  p_handoff_id uuid, p_tenant uuid, p_domain uuid, p_workspace text, p_location jsonb, p_view_context jsonb, p_display text, p_target_device text,
  p_expires_in int, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shell, observation, identity, public, pg_catalog, pg_temp AS $$
DECLARE
  v_scope text := public.eye_scope();
  v_kind text; v_status text; v_session uuid; v_problem text;
  v_bounds int[] := shell.handoff_expiry_bounds();
  v_seconds int := coalesce(p_expires_in, (shell.handoff_expiry_bounds())[3]);
  v_ctx jsonb := coalesce(p_view_context, '{}'::jsonb);
  v_open int; v_disp shell.presentation_states%ROWTYPE; v_digest text; v_row shell.session_handoffs%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['shell.handoff.offer']);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'session handoff rejected (actor): a handoff is offered by its own principal, never on another''s behalf' USING ERRCODE = '42501';
  END IF;
  SELECT p.kind, p.status INTO v_kind, v_status FROM identity.principals p WHERE p.id = p_actor;
  IF v_kind IS DISTINCT FROM 'human' OR v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'session handoff rejected (actor): a handoff is a named, active human''s own — an agent or a workload hands nothing off' USING ERRCODE = '42501';
  END IF;
  v_session := shell.own_live_session(p_actor, false);
  IF v_session IS NULL THEN
    RAISE EXCEPTION 'session handoff rejected (actor): a handoff is offered from your own signed-in session (this session is not active) — sign in again' USING ERRCODE = '42501';
  END IF;
  -- the scope is the ESTABLISHED context's, never an argument's
  IF v_scope = 'PLATFORM' THEN
    IF p_tenant IS NOT NULL OR p_domain IS NOT NULL THEN
      RAISE EXCEPTION 'session handoff rejected (access): a PLATFORM context offers with no tenant and no domain' USING ERRCODE = '42501';
    END IF;
  ELSIF p_tenant IS NULL OR p_domain IS NULL OR p_tenant IS DISTINCT FROM public.eye_tenant()
        OR (v_scope = 'DOMAIN' AND p_domain IS DISTINCT FROM public.eye_domain()) THEN
    RAISE EXCEPTION 'session handoff rejected (access): a handoff is offered in the established context''s own tenant and domain' USING ERRCODE = '42501';
  END IF;
  IF p_workspace IS NULL OR NOT (p_workspace = ANY (shell.workspace_keys())) THEN
    RAISE EXCEPTION 'session handoff rejected (workspace): % is not a workspace of the shell (%)', coalesce(p_workspace, '<none>'), array_to_string(shell.workspace_keys(), ', ') USING ERRCODE = '22023';
  END IF;
  IF (p_workspace = 'admin') <> (v_scope = 'PLATFORM') THEN
    RAISE EXCEPTION 'session handoff rejected (workspace): the admin workspace is the PLATFORM''s; every other workspace is a domain''s' USING ERRCODE = '22023';
  END IF;
  v_problem := shell.location_problem(p_location);
  IF v_problem IS NOT NULL THEN RAISE EXCEPTION 'session handoff rejected (location): %', v_problem USING ERRCODE = '22023'; END IF;
  IF NOT ((p_location ->> 'route') = shell.workspace_prefix(p_workspace) OR (p_location ->> 'route') LIKE shell.workspace_prefix(p_workspace) || '/%') THEN
    RAISE EXCEPTION 'session handoff rejected (location): % is not a location of the % workspace (%…)', p_location ->> 'route', p_workspace, shell.workspace_prefix(p_workspace) USING ERRCODE = '22023';
  END IF;
  IF length(p_location::text) > 16384 THEN RAISE EXCEPTION 'session handoff rejected (location): the location is at most 16 KiB' USING ERRCODE = '22023'; END IF;
  v_problem := shell.view_context_problem(v_ctx);
  IF v_problem IS NOT NULL THEN RAISE EXCEPTION 'session handoff rejected (context): %', v_problem USING ERRCODE = '22023'; END IF;
  IF p_target_device IS NOT NULL AND p_target_device !~ '^[A-Za-z0-9 _.()-]{1,40}$' THEN
    RAISE EXCEPTION 'session handoff rejected (device): the target device is a short label (tablet, large display …)' USING ERRCODE = '22023';
  END IF;
  IF v_seconds < v_bounds[1] OR v_seconds > v_bounds[2] THEN
    RAISE EXCEPTION 'session handoff rejected (expiry): a handoff lives % to % seconds (% by default) — never open-ended', v_bounds[1], v_bounds[2], v_bounds[3] USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('shell.session_handoffs:' || p_actor, 0));
  IF p_display IS NOT NULL THEN
    IF NOT shell.display_ok(p_display) THEN
      RAISE EXCEPTION 'session handoff rejected (display): a display is named in lower case (operations-room, briefing-wall)' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_disp FROM shell.presentation_states s WHERE s.principal_id = p_actor AND s.display = p_display ORDER BY s.version DESC LIMIT 1;
    IF v_disp.state_id IS NULL THEN
      RAISE EXCEPTION 'session handoff rejected (unknown_display): you present nothing on the display %', p_display USING ERRCODE = 'P0002';
    END IF;
    IF v_disp.control_session IS DISTINCT FROM v_session THEN
      RAISE EXCEPTION 'session handoff rejected (state): the display % is controlled by another of your sessions — only its control surface hands its control off', p_display USING ERRCODE = '23514';
    END IF;
  END IF;
  SELECT count(*) INTO v_open FROM shell.session_handoffs h
   WHERE h.principal_id = p_actor AND h.expires_at > clock_timestamp()
     AND NOT EXISTS (SELECT 1 FROM shell.session_handoff_receipts r WHERE r.handoff_id = h.handoff_id);
  IF v_open >= 5 THEN
    RAISE EXCEPTION 'session handoff rejected (state): you have % open handoffs — claim, revoke or let one expire before offering another', v_open USING ERRCODE = '23514';
  END IF;
  v_digest := encode(sha256(convert_to(jsonb_build_object('workspace', p_workspace, 'location', p_location, 'view_context', v_ctx, 'display', p_display,
                                                           'contract', shell.windows_contract_version())::text, 'UTF8')), 'hex');
  INSERT INTO shell.session_handoffs (handoff_id, principal_id, scope, tenant_id, domain_id, workspace, location, view_context, display, target_device,
                                      offering_session, expires_at, contract, digest, correlation_id)
  VALUES (p_handoff_id, p_actor, v_scope, p_tenant, p_domain, p_workspace, p_location, v_ctx, p_display, p_target_device,
          v_session, clock_timestamp() + make_interval(secs => v_seconds), shell.windows_contract_version(), v_digest, p_correlation)
  RETURNING * INTO v_row;
  PERFORM shell.ledger(p_tenant, p_domain, p_actor, 'session_handoff', p_handoff_id, 1, 'shell.handoff.offered',
                       jsonb_build_object('workspace', p_workspace, 'route', p_location ->> 'route', 'display', p_display, 'expires_at', v_row.expires_at, 'digest', v_digest), p_correlation);
  RETURN jsonb_build_object('handoff_id', v_row.handoff_id, 'status', 'open', 'scope', v_row.scope, 'tenant_id', v_row.tenant_id, 'domain_id', v_row.domain_id,
    'workspace', v_row.workspace, 'location', v_row.location, 'view_context', v_row.view_context, 'display', v_row.display, 'target_device', v_row.target_device,
    'offered_at', v_row.offered_at, 'expires_at', v_row.expires_at, 'offered_here', true, 'contract', v_row.contract, 'digest', v_row.digest,
    'claim', 'an offer of your review context to another of your own signed-in sessions — it carries no role and no grant; the claiming session acts only with its own authority');
END $$;
REVOKE ALL ON FUNCTION shell.offer_handoff(uuid, uuid, uuid, text, jsonb, jsonb, text, text, int, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.offer_handoff(uuid, uuid, uuid, text, jsonb, jsonb, text, text, int, uuid, uuid) TO eye_commit;

-- §LYM.4 THE CLAIM (`shell.handoff.claim`) ─────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION shell.claim_handoff(p_handoff_id uuid, p_receipt_id uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shell, observation, identity, public, pg_catalog, pg_temp AS $$
DECLARE
  v_scope text := public.eye_scope();
  v_kind text; v_status text; v_session uuid;
  h shell.session_handoffs%ROWTYPE; r shell.session_handoff_receipts%ROWTYPE;
  v_roles text[]; v_disp shell.presentation_states%ROWTYPE; v_moved jsonb := NULL; v_ps shell.presentation_states%ROWTYPE; v_pdigest text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['shell.handoff.claim']);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'session handoff rejected (actor): a handoff is claimed by its own principal, never on another''s behalf' USING ERRCODE = '42501';
  END IF;
  SELECT p.kind, p.status INTO v_kind, v_status FROM identity.principals p WHERE p.id = p_actor;
  IF v_kind IS DISTINCT FROM 'human' OR v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'session handoff rejected (actor): a handoff is claimed by a named, active human — an agent or a workload claims nothing' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('shell.session_handoff:' || coalesce(p_handoff_id::text, ''), 0));
  SELECT * INTO h FROM shell.session_handoffs x WHERE x.handoff_id = p_handoff_id;
  IF h.handoff_id IS NULL THEN
    RAISE EXCEPTION 'session handoff rejected (unknown_handoff): no handoff %', p_handoff_id USING ERRCODE = 'P0002';
  END IF;
  IF h.principal_id IS DISTINCT FROM p_actor THEN
    RAISE EXCEPTION 'session handoff rejected (actor): a handoff is claimed only by the person who offered it — control never passes to another person' USING ERRCODE = '42501';
  END IF;
  IF (v_scope = 'PLATFORM') <> (h.scope = 'PLATFORM') OR h.tenant_id IS DISTINCT FROM public.eye_tenant()
     OR (v_scope = 'DOMAIN' AND h.domain_id IS DISTINCT FROM public.eye_domain()) THEN
    RAISE EXCEPTION 'session handoff rejected (access): the handoff was offered in another context — claim it in its own tenant and domain' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM shell.session_handoff_receipts x WHERE x.handoff_id = h.handoff_id;
  IF r.receipt_id IS NOT NULL AND r.outcome = 'claimed' THEN
    RAISE EXCEPTION 'session handoff rejected (duplicate): the handoff was claimed at % — a handoff is single use; offer a new one', r.closed_at USING ERRCODE = '23505';
  END IF;
  IF r.receipt_id IS NOT NULL THEN
    RAISE EXCEPTION 'session handoff rejected (state): the handoff was revoked at % — nothing moved; offer a new one', r.closed_at USING ERRCODE = '23514';
  END IF;
  IF clock_timestamp() >= h.expires_at THEN
    RAISE EXCEPTION 'session handoff rejected (expired): the handoff expired at % — nothing moved; offer a new one from the session that holds the review', h.expires_at USING ERRCODE = '23514';
  END IF;
  -- the claiming device's OWN sign-in: the principal's active PASSWORD session (control is transferred through authentication)
  v_session := shell.own_live_session(p_actor, true);
  IF v_session IS NULL THEN
    RAISE EXCEPTION 'session handoff rejected (actor): a handoff is claimed from your own signed-in session (sign in with your password on this device)' USING ERRCODE = '42501';
  END IF;
  IF v_session = h.offering_session THEN
    RAISE EXCEPTION 'session handoff rejected (state): this is the session that offered the handoff — claim it from your other signed-in session (another device or browser)' USING ERRCODE = '23514';
  END IF;
  -- NO AUTHORITY INHERITANCE: the claiming session's OWN role bindings, re-read now (the offer carries none)
  SELECT coalesce(array_agg(DISTINCT b.role_code ORDER BY b.role_code), ARRAY[]::text[]) INTO v_roles FROM identity.role_bindings b
   WHERE b.principal_id = p_actor AND b.revoked_at IS NULL
     AND (b.scope = 'PLATFORM' OR (b.scope = 'TENANT' AND b.tenant_id = h.tenant_id) OR (b.scope = 'DOMAIN' AND b.tenant_id = h.tenant_id AND b.domain_id = h.domain_id));
  -- the display's control moves with the claim (a new version of its state: same content, the claiming session its control surface)
  IF h.display IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('shell.presentation_states:' || p_actor || ':' || h.display, 0));
    SELECT * INTO v_disp FROM shell.presentation_states s WHERE s.principal_id = p_actor AND s.display = h.display ORDER BY s.version DESC LIMIT 1;
    IF v_disp.state_id IS NOT NULL AND v_disp.control_session IS DISTINCT FROM h.offering_session THEN
      RAISE EXCEPTION 'session handoff rejected (stale): the display %''s control moved since this handoff was offered (now version %) — nothing moved; offer a new one', h.display, v_disp.version USING ERRCODE = '23514';
    END IF;
  END IF;
  INSERT INTO shell.session_handoff_receipts (receipt_id, handoff_id, principal_id, outcome, acting_session, claiming_session, roles_at_claim, correlation_id)
  VALUES (p_receipt_id, h.handoff_id, p_actor, 'claimed', v_session, v_session, v_roles, p_correlation) RETURNING * INTO r;
  IF v_disp.state_id IS NOT NULL THEN
    v_pdigest := encode(sha256(convert_to(jsonb_build_object('display', v_disp.display, 'status', v_disp.status, 'location', v_disp.location, 'view_context', v_disp.view_context,
      'watermark', v_disp.watermark, 'classification', v_disp.classification, 'audience', v_disp.audience, 'contract', shell.windows_contract_version())::text, 'UTF8')), 'hex');
    INSERT INTO shell.presentation_states (state_id, principal_id, scope, tenant_id, domain_id, display, version, supersedes, status, location, view_context, watermark,
                                           classification, audience, control_session, transfer, handoff_id, contract, digest, correlation_id)
    VALUES (gen_random_uuid(), p_actor, v_disp.scope, v_disp.tenant_id, v_disp.domain_id, v_disp.display, v_disp.version + 1, v_disp.state_id, v_disp.status, v_disp.location,
            v_disp.view_context, v_disp.watermark, v_disp.classification, v_disp.audience, v_session, 'handoff', h.handoff_id, shell.windows_contract_version(), v_pdigest, p_correlation)
    RETURNING * INTO v_ps;
    PERFORM shell.ledger(v_ps.tenant_id, v_ps.domain_id, p_actor, 'presentation_state', v_ps.state_id, v_ps.version, 'shell.presentation.control_moved',
                         jsonb_build_object('display', v_ps.display, 'handoff_id', h.handoff_id, 'supersedes', v_disp.state_id), p_correlation);
    v_moved := shell.presentation_view(v_ps);
  END IF;
  PERFORM shell.ledger(h.tenant_id, h.domain_id, p_actor, 'session_handoff', h.handoff_id, 2, 'shell.handoff.claimed',
                       jsonb_build_object('receipt_id', r.receipt_id, 'roles_at_claim', to_jsonb(v_roles), 'display', h.display, 'digest', h.digest), p_correlation);
  RETURN jsonb_build_object('handoff_id', h.handoff_id, 'status', 'claimed',
    'receipt', jsonb_build_object('receipt_id', r.receipt_id, 'outcome', r.outcome, 'closed_at', r.closed_at, 'claimed_here', true),
    'workspace', h.workspace, 'location', h.location, 'view_context', h.view_context, 'display', h.display, 'offered_at', h.offered_at, 'expires_at', h.expires_at,
    'digest', h.digest, 'presentation', v_moved,
    'authority', jsonb_build_object('inherited', false, 'roles', to_jsonb(v_roles),
      'basis', 'your own role bindings in this scope, re-read at the claim — nothing of the offering session''s authority passes; every act is evaluated again under this session'),
    'previous_surface', 'the session that offered the handoff is no longer the control surface for this review',
    'claim', 'the review context moved to this session; nothing was executed');
END $$;
REVOKE ALL ON FUNCTION shell.claim_handoff(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.claim_handoff(uuid, uuid, uuid, uuid) TO eye_commit;

-- §LYM.5 THE REVOCATION (`shell.handoff.revoke`) ──────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION shell.revoke_handoff(p_handoff_id uuid, p_receipt_id uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shell, observation, identity, public, pg_catalog, pg_temp AS $$
DECLARE
  v_scope text := public.eye_scope();
  v_kind text; v_status text; v_session uuid;
  h shell.session_handoffs%ROWTYPE; r shell.session_handoff_receipts%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['shell.handoff.revoke']);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'session handoff rejected (actor): a handoff is revoked by its own principal, never on another''s behalf' USING ERRCODE = '42501';
  END IF;
  SELECT p.kind, p.status INTO v_kind, v_status FROM identity.principals p WHERE p.id = p_actor;
  IF v_kind IS DISTINCT FROM 'human' OR v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'session handoff rejected (actor): a handoff is revoked by a named, active human' USING ERRCODE = '42501';
  END IF;
  v_session := shell.own_live_session(p_actor, false);
  IF v_session IS NULL THEN
    RAISE EXCEPTION 'session handoff rejected (actor): a handoff is revoked from your own signed-in session — sign in again' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NOT NULL AND (length(btrim(p_reason)) < 1 OR length(p_reason) > 400) THEN
    RAISE EXCEPTION 'session handoff rejected (reason): a reason is 1–400 characters (or none)' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('shell.session_handoff:' || coalesce(p_handoff_id::text, ''), 0));
  SELECT * INTO h FROM shell.session_handoffs x WHERE x.handoff_id = p_handoff_id;
  IF h.handoff_id IS NULL THEN
    RAISE EXCEPTION 'session handoff rejected (unknown_handoff): no handoff %', p_handoff_id USING ERRCODE = 'P0002';
  END IF;
  IF h.principal_id IS DISTINCT FROM p_actor THEN
    RAISE EXCEPTION 'session handoff rejected (actor): a handoff is revoked only by the person who offered it' USING ERRCODE = '42501';
  END IF;
  IF (v_scope = 'PLATFORM') <> (h.scope = 'PLATFORM') OR h.tenant_id IS DISTINCT FROM public.eye_tenant()
     OR (v_scope = 'DOMAIN' AND h.domain_id IS DISTINCT FROM public.eye_domain()) THEN
    RAISE EXCEPTION 'session handoff rejected (access): the handoff was offered in another context — revoke it in its own tenant and domain' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM shell.session_handoff_receipts x WHERE x.handoff_id = h.handoff_id;
  IF r.receipt_id IS NOT NULL AND r.outcome = 'revoked' THEN
    RAISE EXCEPTION 'session handoff rejected (duplicate): the handoff was already revoked at %', r.closed_at USING ERRCODE = '23505';
  END IF;
  IF r.receipt_id IS NOT NULL THEN
    RAISE EXCEPTION 'session handoff rejected (state): the handoff was claimed at % — control already moved; to move it back, offer a new handoff from the claiming session', r.closed_at USING ERRCODE = '23514';
  END IF;
  IF clock_timestamp() >= h.expires_at THEN
    RAISE EXCEPTION 'session handoff rejected (expired): the handoff expired at % — it can no longer be claimed, so there is nothing to revoke', h.expires_at USING ERRCODE = '23514';
  END IF;
  INSERT INTO shell.session_handoff_receipts (receipt_id, handoff_id, principal_id, outcome, acting_session, reason, correlation_id)
  VALUES (p_receipt_id, h.handoff_id, p_actor, 'revoked', v_session, p_reason, p_correlation) RETURNING * INTO r;
  PERFORM shell.ledger(h.tenant_id, h.domain_id, p_actor, 'session_handoff', h.handoff_id, 2, 'shell.handoff.revoked',
                       jsonb_build_object('receipt_id', r.receipt_id, 'reason', p_reason), p_correlation);
  RETURN jsonb_build_object('handoff_id', h.handoff_id, 'status', 'revoked',
    'receipt', jsonb_build_object('receipt_id', r.receipt_id, 'outcome', r.outcome, 'closed_at', r.closed_at, 'reason', r.reason),
    'claim', 'the offer can no longer be claimed; the offer and its revocation stay recorded, and nothing else changed');
END $$;
REVOKE ALL ON FUNCTION shell.revoke_handoff(uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.revoke_handoff(uuid, uuid, text, uuid, uuid) TO eye_commit;

-- §LYM.6 THE OWN READ OF THE HANDOFFS (`shell.handoff.read`) ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION shell.handoffs_of(p_principal uuid, p_tenant uuid, p_domain uuid, p_limit int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = shell, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_scope text := public.eye_scope(); v_out jsonb; v_here uuid := public.eye_session();
BEGIN
  IF p_principal IS NULL OR p_principal IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'session handoff rejected (actor): a principal reads only its own handoffs' USING ERRCODE = '42501';
  END IF;
  IF v_scope = 'PLATFORM' THEN
    IF p_tenant IS NOT NULL OR p_domain IS NOT NULL THEN
      RAISE EXCEPTION 'session handoff rejected (access): a PLATFORM context reads with no tenant and no domain' USING ERRCODE = '42501';
    END IF;
  ELSIF p_domain IS NULL OR NOT observation.read_scope_ok(p_tenant, p_domain) THEN
    RAISE EXCEPTION 'session handoff rejected (access): a handoff is read only within the caller''s bound tenant and domain' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(jsonb_agg(x.o ORDER BY x.offered_at DESC), '[]'::jsonb) INTO v_out FROM (
    SELECT h.offered_at, jsonb_build_object('handoff_id', h.handoff_id, 'status', shell.handoff_status(h.expires_at, r.outcome),
      'workspace', h.workspace, 'location', h.location, 'view_context', h.view_context, 'display', h.display, 'target_device', h.target_device,
      'offered_at', h.offered_at, 'expires_at', h.expires_at, 'offered_here', h.offering_session = v_here, 'digest', h.digest,
      'receipt', CASE WHEN r.receipt_id IS NULL THEN NULL ELSE jsonb_build_object('receipt_id', r.receipt_id, 'outcome', r.outcome, 'closed_at', r.closed_at,
        'claimed_here', r.claiming_session = v_here, 'roles_at_claim', to_jsonb(r.roles_at_claim), 'reason', r.reason) END) AS o
      FROM shell.session_handoffs h LEFT JOIN shell.session_handoff_receipts r ON r.handoff_id = h.handoff_id
     WHERE h.principal_id = p_principal AND h.tenant_id IS NOT DISTINCT FROM p_tenant AND h.domain_id IS NOT DISTINCT FROM p_domain
     ORDER BY h.offered_at DESC LIMIT greatest(1, least(coalesce(p_limit, 20), 100))) x;
  RETURN jsonb_build_object('principal_id', p_principal, 'scope', v_scope, 'tenant_id', p_tenant, 'domain_id', p_domain, 'read_at', clock_timestamp(),
    'contract', shell.windows_contract_version(), 'handoffs', v_out,
    'claim', 'your own handoffs — offers of a review context between your own signed-in sessions; none carries authority');
END $$;
REVOKE ALL ON FUNCTION shell.handoffs_of(uuid, uuid, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.handoffs_of(uuid, uuid, uuid, int) TO eye_app, eye_commit;

-- §LYM.7 THE PUBLICATION (`shell.presentation.publish`) ──────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION shell.publish_presentation(
  p_state_id uuid, p_tenant uuid, p_domain uuid, p_display text, p_expected_version int, p_status text, p_location jsonb, p_view_context jsonb,
  p_watermark timestamptz, p_classification text, p_audience text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shell, observation, identity, public, pg_catalog, pg_temp AS $$
DECLARE
  v_scope text := public.eye_scope();
  v_kind text; v_status text; v_session uuid; v_problem text;
  v_ctx jsonb := coalesce(p_view_context, '{}'::jsonb);
  v_cur shell.presentation_states%ROWTYPE; v_row shell.presentation_states%ROWTYPE;
  v_version int; v_digest text; v_transfer text := NULL;
BEGIN
  PERFORM observation.assert_authority(ARRAY['shell.presentation.publish']);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'presentation state rejected (actor): a display is published by its own principal, never on another''s behalf' USING ERRCODE = '42501';
  END IF;
  SELECT p.kind, p.status INTO v_kind, v_status FROM identity.principals p WHERE p.id = p_actor;
  IF v_kind IS DISTINCT FROM 'human' OR v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'presentation state rejected (actor): a display is a named, active human''s own — an agent or a workload presents nothing' USING ERRCODE = '42501';
  END IF;
  v_session := shell.own_live_session(p_actor, false);
  IF v_session IS NULL THEN
    RAISE EXCEPTION 'presentation state rejected (actor): a display is published from your own signed-in session — sign in again' USING ERRCODE = '42501';
  END IF;
  IF v_scope = 'PLATFORM' OR p_tenant IS NULL OR p_domain IS NULL OR p_tenant IS DISTINCT FROM public.eye_tenant()
     OR (v_scope = 'DOMAIN' AND p_domain IS DISTINCT FROM public.eye_domain()) THEN
    RAISE EXCEPTION 'presentation state rejected (access): a display shows a domain''s work and is published in the established context''s own tenant and domain' USING ERRCODE = '42501';
  END IF;
  IF NOT shell.display_ok(p_display) THEN
    RAISE EXCEPTION 'presentation state rejected (display): a display is named in lower case (operations-room, briefing-wall)' USING ERRCODE = '22023';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('presenting', 'ended') THEN
    RAISE EXCEPTION 'presentation state rejected (status): a display is presenting or ended' USING ERRCODE = '22023';
  END IF;
  IF p_status = 'presenting' THEN
    v_problem := shell.location_problem(p_location);
    IF v_problem IS NOT NULL THEN RAISE EXCEPTION 'presentation state rejected (location): %', v_problem USING ERRCODE = '22023'; END IF;
    IF NOT (split_part(p_location ->> 'route', '/', 2) = ANY (shell.workspace_keys())) OR split_part(p_location ->> 'route', '/', 2) = 'admin' THEN
      RAISE EXCEPTION 'presentation state rejected (location): % is not a location of a domain workspace', p_location ->> 'route' USING ERRCODE = '22023';
    END IF;
    IF length(p_location::text) > 16384 THEN RAISE EXCEPTION 'presentation state rejected (location): the location is at most 16 KiB' USING ERRCODE = '22023'; END IF;
    IF p_watermark IS NULL OR p_watermark > clock_timestamp() THEN
      RAISE EXCEPTION 'presentation state rejected (watermark): the data watermark is the instant the shown data is as of — required, and never in the future' USING ERRCODE = '22023';
    END IF;
    IF p_classification IS NULL OR NOT (p_classification = ANY (shell.presentation_classifications())) THEN
      RAISE EXCEPTION 'presentation state rejected (classification): a display carries its classification context (public, internal, confidential, restricted) — a display without one shows nothing' USING ERRCODE = '22023';
    END IF;
    IF p_audience IS NULL OR NOT (p_audience = ANY (shell.presentation_audiences())) THEN
      RAISE EXCEPTION 'presentation state rejected (audience): the audience is %', array_to_string(shell.presentation_audiences(), ', ') USING ERRCODE = '22023';
    END IF;
    IF (v_ctx ->> 'classification') IS NOT NULL AND (v_ctx ->> 'classification') IS DISTINCT FROM p_classification THEN
      RAISE EXCEPTION 'presentation state rejected (classification): the display''s classification (%) differs from the context it was read under (%)', p_classification, v_ctx ->> 'classification' USING ERRCODE = '22023';
    END IF;
  ELSIF p_location IS NOT NULL OR p_watermark IS NOT NULL OR p_classification IS NOT NULL OR p_audience IS NOT NULL THEN
    RAISE EXCEPTION 'presentation state rejected (status): an ended display shows nothing (no location, watermark, classification or audience)' USING ERRCODE = '22023';
  END IF;
  v_problem := shell.view_context_problem(v_ctx);
  IF v_problem IS NOT NULL THEN RAISE EXCEPTION 'presentation state rejected (context): %', v_problem USING ERRCODE = '22023'; END IF;
  IF p_expected_version IS NULL OR p_expected_version < 0 THEN
    RAISE EXCEPTION 'presentation state rejected (version): the publication names the version it read (0 when there was none)' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('shell.presentation_states:' || p_actor || ':' || p_display, 0));
  SELECT * INTO v_cur FROM shell.presentation_states s WHERE s.principal_id = p_actor AND s.display = p_display ORDER BY s.version DESC LIMIT 1;
  v_version := coalesce(v_cur.version, 0);
  IF v_version <> p_expected_version THEN
    RAISE EXCEPTION 'presentation state rejected (stale): the display % is at version %; this publication read version % — read it again (nothing was overwritten)', p_display, v_version, p_expected_version USING ERRCODE = '23514';
  END IF;
  IF v_cur.state_id IS NULL AND p_status = 'ended' THEN
    RAISE EXCEPTION 'presentation state rejected (state): nothing is presented on the display % — there is nothing to end', p_display USING ERRCODE = '23514';
  END IF;
  -- ONE control surface: a different session publishes only once the controlling session is no longer signed in (re-authentication)
  IF v_cur.state_id IS NOT NULL AND v_cur.control_session IS DISTINCT FROM v_session THEN
    IF shell.session_live(v_cur.control_session) THEN
      RAISE EXCEPTION 'presentation state rejected (state): the display % is controlled by another of your signed-in sessions (since %) — hand its control off from there, or sign out there; a second window never takes control silently', p_display, v_cur.published_at USING ERRCODE = '23514';
    END IF;
    v_transfer := 'reauthentication';
  END IF;
  v_digest := encode(sha256(convert_to(jsonb_build_object('display', p_display, 'status', p_status, 'location', p_location, 'view_context', v_ctx,
    'watermark', p_watermark, 'classification', p_classification, 'audience', p_audience, 'contract', shell.windows_contract_version())::text, 'UTF8')), 'hex');
  IF v_cur.state_id IS NOT NULL AND v_cur.digest = v_digest AND v_transfer IS NULL THEN
    RETURN shell.presentation_view(v_cur) || jsonb_build_object('unchanged', true);
  END IF;
  INSERT INTO shell.presentation_states (state_id, principal_id, scope, tenant_id, domain_id, display, version, supersedes, status, location, view_context, watermark,
                                         classification, audience, control_session, transfer, contract, digest, correlation_id)
  VALUES (p_state_id, p_actor, v_scope, p_tenant, p_domain, p_display, v_version + 1, v_cur.state_id, p_status, p_location, v_ctx, p_watermark,
          p_classification, p_audience, v_session, v_transfer, shell.windows_contract_version(), v_digest, p_correlation)
  RETURNING * INTO v_row;
  PERFORM shell.ledger(p_tenant, p_domain, p_actor, 'presentation_state', p_state_id, v_row.version, 'shell.presentation.published',
                       jsonb_build_object('display', p_display, 'status', p_status, 'route', p_location ->> 'route', 'watermark', p_watermark, 'classification', p_classification,
                                          'audience', p_audience, 'transfer', v_transfer, 'supersedes', v_cur.state_id, 'digest', v_digest), p_correlation);
  RETURN shell.presentation_view(v_row) || jsonb_build_object('unchanged', false);
END $$;
REVOKE ALL ON FUNCTION shell.publish_presentation(uuid, uuid, uuid, text, int, text, jsonb, jsonb, timestamptz, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.publish_presentation(uuid, uuid, uuid, text, int, text, jsonb, jsonb, timestamptz, text, text, uuid, uuid) TO eye_commit;

-- §LYM.8 THE OWN READ OF THE DISPLAYS (`shell.presentation.read`) ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION shell.presentation_of(p_principal uuid, p_tenant uuid, p_domain uuid, p_display text, p_history int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = shell, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_scope text := public.eye_scope(); v_out jsonb;
BEGIN
  IF p_principal IS NULL OR p_principal IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'presentation state rejected (actor): a principal reads only its own displays' USING ERRCODE = '42501';
  END IF;
  IF v_scope = 'PLATFORM' OR p_domain IS NULL OR NOT observation.read_scope_ok(p_tenant, p_domain) THEN
    RAISE EXCEPTION 'presentation state rejected (access): a display is read only within the caller''s bound tenant and domain' USING ERRCODE = '42501';
  END IF;
  IF p_display IS NOT NULL AND NOT shell.display_ok(p_display) THEN
    RAISE EXCEPTION 'presentation state rejected (display): a display is named in lower case' USING ERRCODE = '22023';
  END IF;
  WITH mine AS (
    SELECT s.* FROM shell.presentation_states s
     WHERE s.principal_id = p_principal AND s.tenant_id = p_tenant AND s.domain_id = p_domain AND (p_display IS NULL OR s.display = p_display)
  ), cur AS (
    SELECT DISTINCT ON (display) * FROM mine ORDER BY display, version DESC
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'display', c.display,
      'current', shell.presentation_view(c::shell.presentation_states),
      'versions', (SELECT count(*) FROM mine m WHERE m.display = c.display),
      'history', (SELECT coalesce(jsonb_agg(jsonb_build_object('state_id', x.state_id, 'version', x.version, 'status', x.status, 'route', x.location ->> 'route',
                    'watermark', x.watermark, 'transfer', x.transfer, 'digest', x.digest, 'published_at', x.published_at) ORDER BY x.version DESC), '[]'::jsonb)
                    FROM (SELECT * FROM mine m WHERE m.display = c.display ORDER BY m.version DESC LIMIT greatest(0, least(coalesce(p_history, 5), 50))) x)
    ) ORDER BY c.display), '[]'::jsonb) INTO v_out FROM cur c;
  RETURN jsonb_build_object('principal_id', p_principal, 'scope', v_scope, 'tenant_id', p_tenant, 'domain_id', p_domain, 'read_at', clock_timestamp(),
    'contract', shell.windows_contract_version(), 'displays', v_out,
    'claim', 'your own displays — what each shows, its data watermark, its classification and its one control surface; a display commands nothing');
END $$;
REVOKE ALL ON FUNCTION shell.presentation_of(uuid, uuid, uuid, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION shell.presentation_of(uuid, uuid, uuid, text, int) TO eye_app, eye_commit;

-- ═══ FOLD §HA (from 0119_b81_x_ha.sql) ═══
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0119 §HA — CP-6 B81 part `ha` (2026-10-19): THE HUMAN-AUTHORITY PATTERNS (F-P7-E-20) — the ONE backend change the clauses require: the
-- DEFER INTAKE captures its CONDITIONS and its OWNER beside the rationale and the next review it already required (PAT-08 "Reject or defer:
-- capture rationale, conditions, owner, and next review — never destructive"; B34's gate defer, gate.service.ts validateGateIntake).
--
--   decision.gate_actions   + defer_conditions (a JSON array of 1–12 distinct statements, 4–500 characters each — what must be true, or
--                             be done, before the deferred version is reviewed again; an empty array when the person states none) and
--                             + defer_owner_principal_id (who owns the next review: a named, active member with STANDING at this gate —
--                             the package owner, an approver the policy admits, or a decision authority — so the person who must resume it
--                             can). Both NULL on every other act and on every defer recorded before B81 (said so by the reader, never
--                             back-filled); the table stays APPEND-ONLY (its trigger is untouched); the checks below hold on old rows.
--   decision.gate_act       copied WHOLE from its LAST definition (0094 §G, line 3477), the B81 changes marked `-- B81 ha`: two trailing
--                             parameters with DEFAULT NULL (p_conditions jsonb, p_owner uuid) — a caller of the 13-argument form keeps today's
--                             behaviour exactly (the owner defaults to the deferring person, who is today's assignee of the gate.review task;
--                             the conditions default to none stated); on a defer the port validates both, records them, assigns the review
--                             task to the OWNER, and carries them on the version.deferred event; on any other act either is REFUSED (a
--                             request for information keeps its own asked-for text; a reject carries its rationale). The 13-argument
--                             signature is dropped first so ONE port remains (no overload, no ambiguity).
--
-- Nothing else changes: no approval, digest, separation of duties, gate state, PDP rule or other write port moves (D11). The refusals keep
-- the B34 family `gate rejected (<class>): …` — (conditions) and (owner) are the caller's own request: 422 by B34's catch-all row
-- (observation-errors.ts); no new noun to map. CONSTRUCTION only here; the act (SYNTHETIC personas) demonstrates it; real acceptance is H3's.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §HA.1 THE LEDGER: two additive columns (old rows NULL; the append-only trigger stands) ──────────────────────────────────────────────────
ALTER TABLE decision.gate_actions
  ADD COLUMN defer_conditions jsonb,
  ADD COLUMN defer_owner_principal_id uuid,
  ADD CONSTRAINT dga_defer_conditions CHECK (defer_conditions IS NULL OR (action = 'defer' AND jsonb_typeof(defer_conditions) = 'array' AND jsonb_array_length(defer_conditions) <= 12)),
  ADD CONSTRAINT dga_defer_owner CHECK (defer_owner_principal_id IS NULL OR action = 'defer');

-- §HA.2 THE PORT: decision.gate_act — 0094 §G line 3477, copied whole; the B81 changes marked ──────────────────────────────────────────────
DROP FUNCTION decision.gate_act(uuid, uuid, uuid, uuid, int, text, text, timestamptz, text, text, uuid, uuid, uuid);
CREATE OR REPLACE FUNCTION decision.gate_act(
  p_action_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_action text, p_rationale text, p_next_review_at timestamptz,
  p_info_request text, p_package_digest text, p_actor uuid, p_event_id uuid, p_correlation uuid,
  /* B81 ha: the defer's conditions and owner (PAT-08) */ p_conditions jsonb DEFAULT NULL, p_owner uuid DEFAULT NULL /* end B81 ha */
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p record; v record; v_to text; v_standing text; v_ip jsonb; v_task jsonb; v_task_id uuid; v_live int; v_quorum int; v_event text; v_open text[] := ARRAY['proposed', 'under_review', 'approved'];
        /* B81 ha */ v_conditions jsonb; v_owner uuid; v_c jsonb; /* end B81 ha */
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('review', 'acknowledge', 'ready', 'defer', 'reject', 'request_information', 'resume') THEN
    RAISE EXCEPTION 'gate rejected (action): % is not a gate act (review, acknowledge, ready, defer, reject, request_information, resume)', coalesce(p_action, '<none>') USING ERRCODE = '22023';
  END IF;
  PERFORM observation.assert_authority(ARRAY['decision.gate.' || p_action, /* B36 (0094) gates */ 'decision.board.' || p_action /* end B36 gates */]);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'gate rejected: a gate act is the acting principal''s own, never on behalf of another' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'gate rejected: only a named, active member acts at the gate' USING ERRCODE = '42501'; END IF;
  IF p_rationale IS NULL OR length(btrim(p_rationale)) < 8 OR length(p_rationale) > 4000 THEN
    RAISE EXCEPTION 'gate rejected (rationale): a gate act states its rationale (8 to 4000 characters)' USING ERRCODE = '22023';
  END IF;
  -- B81 ha: the conditions and the owner belong to a defer only (a request for information keeps its asked-for text; a reject its rationale)
  IF p_action <> 'defer' AND (p_conditions IS NOT NULL OR p_owner IS NOT NULL) THEN
    RAISE EXCEPTION 'gate rejected (conditions): conditions and an owner are recorded on a defer only, not on a %', replace(p_action, '_', ' ') USING ERRCODE = '22023';
  END IF;
  IF p_action = 'defer' THEN
    v_conditions := coalesce(p_conditions, '[]'::jsonb);
    IF jsonb_typeof(v_conditions) <> 'array' OR jsonb_array_length(v_conditions) > 12 THEN
      RAISE EXCEPTION 'gate rejected (conditions): a defer lists at most 12 conditions' USING ERRCODE = '22023';
    END IF;
    FOR v_c IN SELECT x FROM jsonb_array_elements(v_conditions) AS t(x) LOOP
      IF jsonb_typeof(v_c) <> 'string' OR length(btrim(v_c #>> '{}')) < 4 OR length(v_c #>> '{}') > 500 THEN
        RAISE EXCEPTION 'gate rejected (conditions): each condition of a defer is a statement of 4 to 500 characters' USING ERRCODE = '22023';
      END IF;
    END LOOP;
    SELECT coalesce(jsonb_agg(to_jsonb(btrim(x #>> '{}')) ORDER BY o), '[]'::jsonb) INTO v_conditions FROM jsonb_array_elements(v_conditions) WITH ORDINALITY AS t(x, o);
    IF (SELECT count(DISTINCT lower(x #>> '{}')) FROM jsonb_array_elements(v_conditions) AS t(x)) <> jsonb_array_length(v_conditions) THEN
      RAISE EXCEPTION 'gate rejected (conditions): a defer states each condition once' USING ERRCODE = '22023';
    END IF;
    v_owner := coalesce(p_owner, p_actor);
  END IF;
  -- end B81 ha
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'gate rejected: no such package in this domain' USING ERRCODE = '23503'; END IF;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'gate rejected: no such version % of package %', p_version, p_package_id USING ERRCODE = '23503'; END IF;
  IF p.state IN ('withdrawn', 'closed') OR v.state NOT IN ('proposed', 'under_review', 'approved', 'deferred', 'information_requested') THEN
    RAISE EXCEPTION 'gate rejected (state): version % is % (the package is %); the gate acts on a proposed version not yet committed, rejected or superseded', p_version, v.state, p.state USING ERRCODE = '22023';
  END IF;
  v_to := v.state;
  IF p_action IN ('review', 'acknowledge') THEN
    v_event := CASE p_action WHEN 'review' THEN 'gate.reviewed' ELSE 'gate.acknowledged' END;
  ELSIF p_action = 'ready' THEN
    IF NOT (v.state = ANY (v_open)) THEN RAISE EXCEPTION 'gate rejected (state): version % is %; decision-ready is marked on a proposed, reviewed or approved version', p_version, v.state USING ERRCODE = '22023'; END IF;
    IF p_actor IN (v.author_principal_id, p.owner_principal_id) OR p_actor = v.proposed_by OR p_actor::text = (v.choice ->> 'action_owner')
       OR EXISTS (SELECT 1 FROM decision.approvals a WHERE a.package_id = p_package_id AND a.version = p_version AND a.approver_principal_id = p_actor AND a.revoked_at IS NULL) THEN
      RAISE EXCEPTION 'gate rejected (independence): the reviewer who marks a version decision-ready is independent — not its author, proposer, owner, action owner nor an approver of it' USING ERRCODE = '42501';
    END IF;
    v_ip := decision.information_package(p_tenant, p_domain, p_package_id, p_version);
    IF p_package_digest IS NULL OR p_package_digest IS DISTINCT FROM (v_ip ->> 'digest') THEN
      RAISE EXCEPTION 'gate rejected (stale_package): the information package read (%) is not the package now (%); read it again', coalesce(p_package_digest, '<none>'), v_ip ->> 'digest' USING ERRCODE = '22023';
    END IF;
    v_event := 'version.ready';
  ELSE
    v_standing := decision.gate_standing(p_actor, p_tenant, p_domain, p_package_id, p_version);
    IF v_standing IS NULL THEN
      RAISE EXCEPTION 'gate rejected (authority): principal % is neither the package owner, an approver the policy admits, nor a decision authority', p_actor USING ERRCODE = '42501';
    END IF;
    IF p_action IN ('defer', 'request_information') THEN
      IF NOT (v.state = ANY (v_open)) THEN RAISE EXCEPTION 'gate rejected (state): version % is already %; resume it first', p_version, v.state USING ERRCODE = '22023'; END IF;
      IF p_next_review_at IS NULL OR p_next_review_at <= clock_timestamp() OR p_next_review_at > clock_timestamp() + interval '180 days' THEN
        RAISE EXCEPTION 'gate rejected (next_review): a % names its next review, in the future and within 180 days', replace(p_action, '_', ' ') USING ERRCODE = '22023';
      END IF;
      IF p_action = 'request_information' AND (p_info_request IS NULL OR length(btrim(p_info_request)) < 8) THEN
        RAISE EXCEPTION 'gate rejected (info_request): a request for information says what is asked (8+ characters)' USING ERRCODE = '22023';
      END IF;
      -- B81 ha: the defer's owner holds standing at this gate (the person who must resume it can) — re-checked here, never trusted from the caller
      IF p_action = 'defer' AND v_owner IS DISTINCT FROM p_actor AND decision.gate_standing(v_owner, p_tenant, p_domain, p_package_id, p_version) IS NULL THEN
        RAISE EXCEPTION 'gate rejected (owner): the owner of the next review (%) is a named, active member with standing at this gate — the package owner, an approver the policy admits, or a decision authority', v_owner USING ERRCODE = '22023';
      END IF;
      -- end B81 ha
      v_to := CASE p_action WHEN 'defer' THEN 'deferred' ELSE 'information_requested' END;
      v_event := CASE p_action WHEN 'defer' THEN 'version.deferred' ELSE 'version.information_requested' END;
      v_task := executive._open_human_task(gen_random_uuid(), p_tenant, p_domain, 'gate.review', 'gate.review:' || p_action_id::text, decision.gate_subject(p_package_id, p_version),
        format('%s: review %s version %s by %s', CASE p_action WHEN 'defer' THEN 'Deferred' ELSE 'Information requested' END, p.title, p_version, to_char(p_next_review_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')),
        CASE p_action WHEN 'defer' THEN /* B81 ha: the defer's owner (the deferring person unless another is named) */ v_owner /* end B81 ha */ ELSE p.owner_principal_id END, '{}', jsonb_build_object('gate_action_id', p_action_id), p_next_review_at,
        jsonb_build_object('principal', p.owner_principal_id, 'max_escalations', 1, 'extend_minutes', 1440), NULL, p_action, p_actor, p_correlation);
      v_task_id := (v_task ->> 'task_id')::uuid;
    ELSIF p_action = 'reject' THEN
      v_to := 'rejected'; v_event := 'version.rejected_by_owner';
    ELSE -- resume
      IF v.state NOT IN ('deferred', 'information_requested') THEN RAISE EXCEPTION 'gate rejected (state): version % is %; only a deferred or information-requested version resumes', p_version, v.state USING ERRCODE = '22023'; END IF;
      v_quorum := (v.approver_policy ->> 'quorum')::int;
      SELECT count(*) INTO v_live FROM decision.live_approvals(p_package_id, p_version);
      v_to := CASE WHEN v_live >= v_quorum THEN 'approved' WHEN v_live > 0 THEN 'under_review' ELSE 'proposed' END;
      v_event := 'version.resumed';
      PERFORM executive._resolve_human_tasks(p_tenant, p_domain, decision.gate_subject(p_package_id, p_version), ARRAY['gate.review'], 'resumed', p_action_id, p_actor, p_correlation);
    END IF;
  END IF;
  INSERT INTO decision.gate_actions (action_id, scope, tenant_id, domain_id, package_id, version, action, actor_principal_id, rationale, next_review_at, info_request, information_package_digest, from_state, to_state, task_id, correlation_id,
                                     /* B81 ha */ defer_conditions, defer_owner_principal_id /* end B81 ha */)
  VALUES (p_action_id, 'DOMAIN', p_tenant, p_domain, p_package_id, p_version, p_action, p_actor, btrim(p_rationale),
          CASE WHEN p_action IN ('defer', 'request_information') THEN p_next_review_at END, CASE WHEN p_action = 'request_information' THEN btrim(p_info_request) END,
          CASE WHEN p_action = 'ready' THEN p_package_digest END, v.state, v_to, v_task_id, p_correlation,
          /* B81 ha */ v_conditions, v_owner /* end B81 ha */);
  IF v_to <> v.state THEN
    UPDATE decision.package_versions SET state = v_to WHERE package_id = p_package_id AND version = p_version;
    IF p.current_version = p_version THEN UPDATE decision.packages_current SET state = v_to WHERE package_id = p_package_id; END IF;
  END IF;
  IF p_action = 'reject' THEN
    PERFORM executive._cancel_human_tasks(p_tenant, p_domain, decision.gate_subject(p_package_id, p_version), ARRAY['gate.approve', 'gate.review', 'gate.ready_review', 'gate.delegated_approval'],
                                          'the version was rejected at the gate', p_actor, p_correlation);
  ELSIF p_action = 'ready' THEN
    PERFORM executive._resolve_human_tasks(p_tenant, p_domain, decision.gate_subject(p_package_id, p_version), ARRAY['gate.ready_review'], 'ready', p_action_id, p_actor, p_correlation);
  END IF;
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, v_event, p_actor,
          jsonb_strip_nulls(jsonb_build_object('version', p_version, 'action_id', p_action_id, 'action', p_action, 'rationale', btrim(p_rationale), 'from_state', v.state, 'to_state', v_to,
                             'next_review_at', CASE WHEN p_action IN ('defer', 'request_information') THEN p_next_review_at END, 'info_request', CASE WHEN p_action = 'request_information' THEN btrim(p_info_request) END,
                             'information_package_digest', CASE WHEN p_action = 'ready' THEN p_package_digest END, 'standing', v_standing, 'task_id', v_task_id,
                             /* B81 ha */ 'conditions', v_conditions, 'owner', v_owner /* end B81 ha */)), p_correlation);
  RETURN jsonb_strip_nulls(jsonb_build_object('action_id', p_action_id, 'package_id', p_package_id, 'version', p_version, 'action', p_action, 'from_state', v.state, 'to_state', v_to,
                            'next_review_at', CASE WHEN p_action IN ('defer', 'request_information') THEN p_next_review_at END, 'task_id', v_task_id, 'standing', v_standing, 'event', v_event,
                            /* B81 ha */ 'conditions', v_conditions, 'owner', v_owner /* end B81 ha */));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.gate_act(uuid, uuid, uuid, uuid, int, text, text, timestamptz, text, text, uuid, uuid, uuid, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.gate_act(uuid, uuid, uuid, uuid, int, text, text, timestamptz, text, text, uuid, uuid, uuid, jsonb, uuid) TO eye_commit;
