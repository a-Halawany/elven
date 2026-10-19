-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0121 §EV — CP-6 B82: EVIDENCE, CITATION, CUSTODY, RIGHTS, VERIFICATION (F-P7-E-07 chapter 26: UX-26-001…006, CMP-025…028, CMP-030…032,
-- HX-01, UX-ADR-006, REL-08; CAP-UM-02's chapter-26 half). The part's own file while it is built; the integrator folds it into 0121 in the
-- order §0, §TS, §EV, §GM, §PX. Applies ALONE on 0001–0120 + the prelude (0121_b82_trust_evidence_visualization.sql).
--
-- WHAT THIS SECTION ADDS
--   observation.rights_terms (+ observation.rights_terms_events)   the RIGHTS TERMS of one source contract version, in a SEPARATE record
--        (DESIGN D10): the expiry ("no expiry declared" when none), the permitted purposes, the prohibited uses, the attribution — declared,
--        revised and withdrawn by a named data steward or collection manager (human-gated; the port re-checks the role, the person, the
--        acting principal); append-only, versioned per series (source, contract version). The source contract and its schema are UNCHANGED
--        (contract v2 authority_and_rights, 0028:48-66, is read, never rewritten). The state `expired` is DERIVED at read time (expires_at
--        ≤ now), never stored.
--   observation.declare_rights_terms / observation.withdraw_rights_terms   the two ports (eye_commit)
--   observation.rights_terms_read                                          the read (eye_app, eye_commit; read scope asserted)
--   graph.resolve_citation(p_tenant, p_domain, p_refs jsonb, p_depth int)  THE CITATION RESOLUTION: each {kind, id, version, digest} →
--        the cited version (its digest checked: a digest binding the version or, for evidence, its bytes) → the recorded lineage
--        (B50's closure: header evidence_refs / source_object_ids, a claim's byte span, correction_of, option citations, publication
--        sources — bounded by p_depth) → every EVIDENCE leaf with its bytes digest, span, custody, rights, tier and correction state, and an
--        outcome: resolved | stale_citation | corrected | withdrawn | rights_expired | unverifiable | inaccessible; the citation's outcome is
--        the worst of its own and its leaves'. A read: STABLE, SECURITY DEFINER, the caller's scope asserted first (the route's PDP action is
--        the EXISTING graph.provenance.read — no new permission, DESIGN D9). It reads no bytes: the bytes are re-hashed by the segment
--        read (the EXISTING observation.evidence.retrieve authority, TypeScript), which is the only path to them.
--   objects._lineage_usable                                                RE-DECLARED WHOLE from its last definition (0120:4749, B50 pv): every
--        B50 check kept in order and text; ADDED after them (marked `-- B82 ev`): a decision-active use (an option, a publication, an export,
--        a gate act) is REFUSED when the evidence it rests on — the object itself, a claim's lineage evidence, the header's evidence_refs,
--        the constructed upstream (eight steps, B50's reach) — failed integrity after its last verified custody (integrity_failed), cannot
--        be reached or was governed-deleted (inaccessible), or rests on rights terms that expired or were withdrawn (rights_expired).
--        Refusals only added (UX-26-004); no port's meaning changes.
--
-- D9 (DESIGN): NO new permission to read evidence. The two new PDP actions are the rights terms' acts (observation.rights.declare,
-- observation.rights.withdraw — the data steward and the collection manager, human-gated); no role gains observation.read or
-- observation.evidence.retrieve; the decision roles resolve a citation SHORT OF THE BYTES (graph.provenance.read, which they already hold).
--
-- THE REFUSAL NOUNS (class form; mapped centrally by the integrator — NOT mapped here):
--   `citation resolution rejected (<class>)`  (citations) / (citation) / (depth) 22023 → 422
--   `rights terms rejected (<class>)`         (actor) / (authority) 42501 → 403 · (unknown_source) / (unknown_terms) 23503 → 404 ·
--                                             (stale) / (state) / (duplicate) 23514 / 23505 → 409 · (request) / (purposes) / (prohibited_uses) /
--                                             (attribution) / (reason) / (expiry) 22023 → 422
--   `object use rejected (<class>)`           (integrity_failed) / (inaccessible) / (rights_expired) 22023 → 409 (B50 §0's noun; the three new
--                                             classes join its 409 row at the fold)
--   `evidence segment rejected (<class>)`     raised by the TypeScript route (span) 422 · (oversize) 422 · (version) 404
--
-- THREE CLAIMS: CONSTRUCTION (this file and phase6-evidence-b82); DEMONSTRATED OPERATION (the act — SYNTHETIC personas, `claim =
-- 'demonstration'`); REAL ACCEPTANCE (B111's shared recording path, then H3) — never claimed.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §EV.1 THE RIGHTS TERMS ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE observation.rights_terms (
  terms_id          uuid NOT NULL,
  version           int  NOT NULL CHECK (version >= 1),
  scope             text NOT NULL,
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  source_id         uuid NOT NULL,
  contract_version  int  NOT NULL CHECK (contract_version >= 1),
  state             text NOT NULL CHECK (state IN ('in_force', 'withdrawn')),
  expires_at        timestamptz,                              -- NULL: no expiry declared (stated so by every read, never blank)
  purposes          jsonb NOT NULL CHECK (jsonb_typeof(purposes) = 'array'),
  prohibited_uses   jsonb NOT NULL CHECK (jsonb_typeof(prohibited_uses) = 'array'),
  attribution       text CHECK (attribution IS NULL OR length(btrim(attribution)) BETWEEN 2 AND 512),
  reason            text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  declared_by       uuid NOT NULL,
  declared_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  supersedes        int,
  request_id        uuid NOT NULL UNIQUE,
  correlation_id    uuid NOT NULL,
  PRIMARY KEY (terms_id, version),
  CONSTRAINT ort_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT ort_supersedes CHECK ((version = 1 AND supersedes IS NULL) OR (version > 1 AND supersedes = version - 1)),
  CONSTRAINT ort_first_in_force CHECK (version > 1 OR state = 'in_force')
);
COMMENT ON TABLE observation.rights_terms IS 'B82 §EV (DESIGN D10; CMP-031, UX-26-002/004): the versioned RIGHTS TERMS of one source contract version — expiry (NULL = no expiry declared), permitted purposes, prohibited uses, attribution — declared, revised or withdrawn by a named data steward or collection manager; a separate record (the source contract unchanged). Expired is derived at read time (expires_at <= now). Append-only.';
CREATE UNIQUE INDEX ort_series ON observation.rights_terms (tenant_id, domain_id, source_id, contract_version, version);
CREATE INDEX ort_source ON observation.rights_terms (source_id, contract_version, version DESC);
CREATE TRIGGER ort_append_only BEFORE UPDATE OR DELETE ON observation.rights_terms FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE observation.rights_terms_events (
  event_id          uuid PRIMARY KEY,
  scope             text NOT NULL,
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  terms_id          uuid NOT NULL,
  terms_version     int  NOT NULL,
  source_id         uuid NOT NULL,
  contract_version  int  NOT NULL,
  event             text NOT NULL CHECK (event IN ('rights.declared', 'rights.revised', 'rights.withdrawn')),
  actor             uuid NOT NULL,
  occurred_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  details           jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  correlation_id    uuid NOT NULL,
  FOREIGN KEY (terms_id, terms_version) REFERENCES observation.rights_terms (terms_id, version),
  CONSTRAINT orte_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
COMMENT ON TABLE observation.rights_terms_events IS 'B82 §EV: the ledger of the rights-terms acts (declared, revised, withdrawn) — who, when, what changed; append-only.';
CREATE INDEX orte_terms ON observation.rights_terms_events (terms_id, occurred_at);
CREATE TRIGGER orte_append_only BEFORE UPDATE OR DELETE ON observation.rights_terms_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

REVOKE ALL ON observation.rights_terms, observation.rights_terms_events FROM PUBLIC;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['rights_terms', 'rights_terms_events'] LOOP
    EXECUTE format('ALTER TABLE observation.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE observation.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY ort_isolation ON observation.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON observation.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- §EV.2 THE RIGHTS HELPERS (internal; no runtime grant) ───────────────────────────────────────────────────────────────────────────────────
/* The state a reader is given: withdrawn as recorded; expired when the declared expiry is at or before the instant; in force otherwise. */
CREATE OR REPLACE FUNCTION observation.rt_state(r observation.rights_terms, p_at timestamptz) RETURNS text
LANGUAGE sql STABLE SET search_path = observation, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN r.terms_id IS NULL THEN NULL
              WHEN r.state = 'withdrawn' THEN 'withdrawn'
              WHEN r.expires_at IS NOT NULL AND r.expires_at <= p_at THEN 'expired'
              ELSE 'in_force' END
$$;
REVOKE ALL ON FUNCTION observation.rt_state(observation.rights_terms, timestamptz) FROM PUBLIC;

/* One version in the seam's shape (RightsTermsRow, apps/api/src/graph/b82-seams.ts) + the recorded state, the reason and the expiry in words. */
CREATE OR REPLACE FUNCTION observation.rt_json(r observation.rights_terms, p_at timestamptz) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = observation, graph, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN r.terms_id IS NULL THEN NULL ELSE jsonb_build_object(
    'terms_id', r.terms_id, 'version', r.version, 'source_id', r.source_id, 'contract_version', r.contract_version,
    'expires_at', graph.pv_iso(r.expires_at), 'purposes', r.purposes, 'prohibited_uses', r.prohibited_uses, 'attribution', r.attribution,
    'declared_by', r.declared_by, 'declared_at', graph.pv_iso(r.declared_at), 'state', observation.rt_state(r, p_at), 'recorded_state', r.state,
    'reason', r.reason, 'supersedes', r.supersedes,
    'expiry_statement', CASE WHEN r.expires_at IS NULL THEN 'no expiry declared'
                             WHEN r.expires_at <= p_at THEN 'expired at ' || graph.pv_iso(r.expires_at)
                             ELSE 'expires at ' || graph.pv_iso(r.expires_at) END) END
$$;
REVOKE ALL ON FUNCTION observation.rt_json(observation.rights_terms, timestamptz) FROM PUBLIC;

/* The current (latest) version of one series, or a row of NULLs. Reached only from the definer functions below (which run as the owner). */
CREATE OR REPLACE FUNCTION observation.rt_current(p_tenant uuid, p_domain uuid, p_source uuid, p_contract_version int) RETURNS observation.rights_terms
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
  SELECT r.* FROM observation.rights_terms r
   WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.source_id = p_source AND r.contract_version = p_contract_version
   ORDER BY r.version DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION observation.rt_current(uuid, uuid, uuid, int) FROM PUBLIC;

/* A list of short statements (purposes, prohibited uses): its problem in words, or NULL. */
CREATE OR REPLACE FUNCTION observation.rt_list_problem(p jsonb, p_what text, p_min int) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE
    WHEN p IS NULL OR jsonb_typeof(p) <> 'array' THEN p_what || ' is a list of short statements'
    WHEN jsonb_array_length(p) < p_min OR jsonb_array_length(p) > 20 THEN p_what || ' holds ' || p_min || ' to 20 statements'
    WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(p) x WHERE jsonb_typeof(x) <> 'string' OR length(btrim(x #>> '{}')) < 2 OR length(x #>> '{}') > 200)
      THEN 'each of the ' || p_what || ' is 2 to 200 characters'
    WHEN (SELECT count(DISTINCT lower(btrim(x #>> '{}'))) FROM jsonb_array_elements(p) x) <> jsonb_array_length(p) THEN p_what || ' name each statement once'
  END
$$;
REVOKE ALL ON FUNCTION observation.rt_list_problem(jsonb, text, int) FROM PUBLIC;

CREATE OR REPLACE FUNCTION observation.rt_list(p jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(btrim(x #>> '{}')) ORDER BY o), '[]'::jsonb) FROM jsonb_array_elements(p) WITH ORDINALITY AS t(x, o)
$$;
REVOKE ALL ON FUNCTION observation.rt_list(jsonb) FROM PUBLIC;

/* The acting principal: the bound principal and the actor the route names are one (an agent or a system is refused by assert_approver). */
CREATE OR REPLACE FUNCTION observation.rt_actor(p_actor uuid) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
DECLARE v uuid := public.eye_principal();
BEGIN
  IF v IS NULL OR p_actor IS NULL OR p_actor IS DISTINCT FROM v THEN
    RAISE EXCEPTION 'rights terms rejected (actor): the act is recorded under the acting principal, never on behalf of another' USING ERRCODE = '42501';
  END IF;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION observation.rt_actor(uuid) FROM PUBLIC;

-- §EV.3 DECLARE (version 1) OR REVISE (the next version) ────────────────────────────────────────────────────────────────────────────────────
/* A named data steward or collection manager declares the rights terms of one source contract version recorded in this domain, or revises
   the version they READ (p_expected_version; 0 when none). A request id replayed by the same person for the same series answers the
   recorded version (`replayed`), never a second one; by another person or for another series it is refused (duplicate). */
CREATE OR REPLACE FUNCTION observation.declare_rights_terms(
  p_request_id uuid, p_tenant uuid, p_domain uuid, p_source_id uuid, p_contract_version int, p_expected_version int,
  p_expires_at timestamptz, p_purposes jsonb, p_prohibited_uses jsonb, p_attribution text, p_reason text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; r observation.rights_terms%ROWTYPE; prev observation.rights_terms%ROWTYPE; v_has_prev boolean; v_problem text;
        v_id uuid; v_version int; v_purposes jsonb; v_prohibited jsonb; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.rights.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := observation.rt_actor(p_actor);
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'rights terms rejected (request): a declaration carries its request id (the command identity a retry reuses)' USING ERRCODE = '22023';
  END IF;
  -- THE REPLAY: the same request id answers what it recorded; never a second effect
  SELECT * INTO r FROM observation.rights_terms t WHERE t.request_id = p_request_id;
  IF FOUND THEN
    IF r.declared_by IS DISTINCT FROM v_actor OR r.source_id IS DISTINCT FROM p_source_id OR r.contract_version IS DISTINCT FROM p_contract_version
       OR r.tenant_id IS DISTINCT FROM p_tenant OR r.domain_id IS DISTINCT FROM p_domain OR r.state <> 'in_force' THEN
      RAISE EXCEPTION 'rights terms rejected (duplicate): request % already recorded another act; a new declaration takes a new request id', p_request_id USING ERRCODE = '23505';
    END IF;
    RETURN observation.rt_json(r, v_at) || jsonb_build_object('replayed', true);
  END IF;
  -- WHO: a named active person holding data_steward or collection_manager here (never an agent, never a system)
  PERFORM governance.assert_approver('rights terms', v_actor, p_tenant, p_domain, ARRAY['data_steward', 'collection_manager'], NULL, NULL, 'declaring a source''s rights terms');
  IF p_source_id IS NULL OR p_contract_version IS NULL OR NOT EXISTS (
       SELECT 1 FROM observation.source_contracts_current s
        WHERE s.source_id = p_source_id AND s.contract_version = p_contract_version AND s.tenant_id = p_tenant AND s.domain_id = p_domain) THEN
    RAISE EXCEPTION 'rights terms rejected (unknown_source): source % contract version % is not recorded in this domain', coalesce(p_source_id::text, '<none>'), coalesce(p_contract_version::text, '<none>') USING ERRCODE = '23503';
  END IF;
  v_problem := observation.rt_list_problem(p_purposes, 'purposes', 1);
  IF v_problem IS NOT NULL THEN RAISE EXCEPTION 'rights terms rejected (purposes): % (what the evidence of this source may be used for)', v_problem USING ERRCODE = '22023'; END IF;
  v_problem := observation.rt_list_problem(coalesce(p_prohibited_uses, '[]'::jsonb), 'prohibited uses', 0);
  IF v_problem IS NOT NULL THEN RAISE EXCEPTION 'rights terms rejected (prohibited_uses): %', v_problem USING ERRCODE = '22023'; END IF;
  v_purposes := observation.rt_list(p_purposes); v_prohibited := observation.rt_list(coalesce(p_prohibited_uses, '[]'::jsonb));
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_purposes) a JOIN jsonb_array_elements_text(v_prohibited) b ON lower(a) = lower(b)) THEN
    RAISE EXCEPTION 'rights terms rejected (prohibited_uses): a use is either permitted or prohibited, never both' USING ERRCODE = '22023';
  END IF;
  IF p_attribution IS NOT NULL AND (length(btrim(p_attribution)) < 2 OR length(p_attribution) > 512) THEN
    RAISE EXCEPTION 'rights terms rejected (attribution): an attribution, when the terms require one, is 2 to 512 characters' USING ERRCODE = '22023';
  END IF;
  IF p_expires_at IS NOT NULL AND p_expires_at < timestamptz '2000-01-01' THEN
    RAISE EXCEPTION 'rights terms rejected (expiry): the expiry is an instant on or after 2000-01-01, or none (no expiry declared)' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'rights terms rejected (reason): a reason of 8 to 2000 characters says where the terms come from (the licence, the agreement, the notice)' USING ERRCODE = '22023';
  END IF;
  -- one act at a time per series; the declarer revises only the version they read
  PERFORM pg_advisory_xact_lock(hashtextextended('observation.rights:' || p_tenant || ':' || p_domain || ':' || p_source_id || ':' || p_contract_version, 0));
  prev := observation.rt_current(p_tenant, p_domain, p_source_id, p_contract_version);
  v_has_prev := prev.terms_id IS NOT NULL;
  IF coalesce(p_expected_version, -1) IS DISTINCT FROM (CASE WHEN v_has_prev THEN prev.version ELSE 0 END) THEN
    RAISE EXCEPTION 'rights terms rejected (stale): the rights terms of source % v% are at version %; this declaration read %', p_source_id, p_contract_version,
      CASE WHEN v_has_prev THEN prev.version ELSE 0 END, coalesce(p_expected_version::text, 'no version') USING ERRCODE = '23514';
  END IF;
  v_id := CASE WHEN v_has_prev THEN prev.terms_id ELSE gen_random_uuid() END;
  v_version := CASE WHEN v_has_prev THEN prev.version + 1 ELSE 1 END;
  INSERT INTO observation.rights_terms (terms_id, version, scope, tenant_id, domain_id, source_id, contract_version, state, expires_at, purposes, prohibited_uses,
                                        attribution, reason, declared_by, supersedes, request_id, correlation_id)
  VALUES (v_id, v_version, 'DOMAIN', p_tenant, p_domain, p_source_id, p_contract_version, 'in_force', p_expires_at, v_purposes, v_prohibited,
          nullif(btrim(coalesce(p_attribution, '')), ''), btrim(p_reason), v_actor, CASE WHEN v_version > 1 THEN v_version - 1 END, p_request_id, p_correlation)
  RETURNING * INTO r;
  INSERT INTO observation.rights_terms_events (event_id, scope, tenant_id, domain_id, terms_id, terms_version, source_id, contract_version, event, actor, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, v_id, v_version, p_source_id, p_contract_version,
          CASE WHEN v_version = 1 THEN 'rights.declared' ELSE 'rights.revised' END, v_actor,
          jsonb_build_object('expires_at', graph.pv_iso(p_expires_at), 'purposes', v_purposes, 'prohibited_uses', v_prohibited, 'supersedes', r.supersedes,
                             'previous_state', CASE WHEN v_has_prev THEN prev.state END), p_correlation);
  RETURN observation.rt_json(r, v_at) || jsonb_build_object('replayed', false);
END $$;
REVOKE ALL ON FUNCTION observation.declare_rights_terms(uuid, uuid, uuid, uuid, int, int, timestamptz, jsonb, jsonb, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.declare_rights_terms(uuid, uuid, uuid, uuid, int, int, timestamptz, jsonb, jsonb, text, text, uuid, uuid) TO eye_commit;

-- §EV.4 WITHDRAW ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* The rights are withdrawn (the publisher revoked them, the agreement ended): a new version in state `withdrawn`, its reason stated; the
   evidence of that source contract version is then refused at every decision-active use (objects._lineage_usable). A later declaration
   (rights granted again) is a new version. */
CREATE OR REPLACE FUNCTION observation.withdraw_rights_terms(
  p_request_id uuid, p_tenant uuid, p_domain uuid, p_terms_id uuid, p_expected_version int, p_reason text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; r observation.rights_terms%ROWTYPE; prev observation.rights_terms%ROWTYPE; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.rights.withdraw']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := observation.rt_actor(p_actor);
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'rights terms rejected (request): a withdrawal carries its request id (the command identity a retry reuses)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO r FROM observation.rights_terms t WHERE t.request_id = p_request_id;
  IF FOUND THEN
    IF r.declared_by IS DISTINCT FROM v_actor OR r.terms_id IS DISTINCT FROM p_terms_id OR r.state <> 'withdrawn' THEN
      RAISE EXCEPTION 'rights terms rejected (duplicate): request % already recorded another act; a new withdrawal takes a new request id', p_request_id USING ERRCODE = '23505';
    END IF;
    RETURN observation.rt_json(r, v_at) || jsonb_build_object('replayed', true);
  END IF;
  PERFORM governance.assert_approver('rights terms', v_actor, p_tenant, p_domain, ARRAY['data_steward', 'collection_manager'], NULL, NULL, 'withdrawing a source''s rights terms');
  SELECT * INTO prev FROM observation.rights_terms t WHERE t.terms_id = p_terms_id AND t.tenant_id = p_tenant AND t.domain_id = p_domain ORDER BY t.version DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rights terms rejected (unknown_terms): rights terms % are not recorded in this domain', coalesce(p_terms_id::text, '<none>') USING ERRCODE = '23503';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'rights terms rejected (reason): a withdrawal states its reason in 8 to 2000 characters (what ended the rights, and since when)' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('observation.rights:' || p_tenant || ':' || p_domain || ':' || prev.source_id || ':' || prev.contract_version, 0));
  SELECT * INTO prev FROM observation.rights_terms t WHERE t.terms_id = p_terms_id ORDER BY t.version DESC LIMIT 1;
  IF prev.state = 'withdrawn' THEN
    RAISE EXCEPTION 'rights terms rejected (state): rights terms % are withdrawn since version %; a new declaration grants them again', p_terms_id, prev.version USING ERRCODE = '23514';
  END IF;
  IF p_expected_version IS DISTINCT FROM prev.version THEN
    RAISE EXCEPTION 'rights terms rejected (stale): rights terms % are at version %; this withdrawal read %', p_terms_id, prev.version, coalesce(p_expected_version::text, 'no version') USING ERRCODE = '23514';
  END IF;
  INSERT INTO observation.rights_terms (terms_id, version, scope, tenant_id, domain_id, source_id, contract_version, state, expires_at, purposes, prohibited_uses,
                                        attribution, reason, declared_by, supersedes, request_id, correlation_id)
  VALUES (prev.terms_id, prev.version + 1, 'DOMAIN', p_tenant, p_domain, prev.source_id, prev.contract_version, 'withdrawn', prev.expires_at, prev.purposes, prev.prohibited_uses,
          prev.attribution, btrim(p_reason), v_actor, prev.version, p_request_id, p_correlation)
  RETURNING * INTO r;
  INSERT INTO observation.rights_terms_events (event_id, scope, tenant_id, domain_id, terms_id, terms_version, source_id, contract_version, event, actor, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, r.terms_id, r.version, r.source_id, r.contract_version, 'rights.withdrawn', v_actor,
          jsonb_build_object('supersedes', r.supersedes, 'reason', r.reason), p_correlation);
  RETURN observation.rt_json(r, v_at) || jsonb_build_object('replayed', false);
END $$;
REVOKE ALL ON FUNCTION observation.withdraw_rights_terms(uuid, uuid, uuid, uuid, int, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.withdraw_rights_terms(uuid, uuid, uuid, uuid, int, text, uuid, uuid) TO eye_commit;

-- §EV.5 THE RIGHTS READ ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* Per contract version of one source recorded in this domain: the contract's own rights statement (contract v2 authority_and_rights, read
   as recorded), the current rights terms (or "no rights terms declared — no expiry declared"), the full history and the ledger. */
CREATE OR REPLACE FUNCTION observation.rights_terms_read(p_tenant uuid, p_domain uuid, p_source_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = observation, graph, pg_catalog, pg_temp AS $$
DECLARE v_at timestamptz := clock_timestamp(); v_versions jsonb := '[]'::jsonb; s record; cur observation.rights_terms;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the rights terms of a source');
  IF p_source_id IS NULL OR NOT EXISTS (SELECT 1 FROM observation.source_contracts_current x WHERE x.source_id = p_source_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain) THEN
    RAISE EXCEPTION 'rights terms rejected (unknown_source): source % is not recorded in this domain', coalesce(p_source_id::text, '<none>') USING ERRCODE = '23503';
  END IF;
  FOR s IN SELECT x.contract_version, x.rights_state, x.lifecycle_state, x.name, x.contract -> 'authority_and_rights' AS ar
             FROM observation.source_contracts_current x WHERE x.source_id = p_source_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain ORDER BY x.contract_version DESC LOOP
    cur := observation.rt_current(p_tenant, p_domain, p_source_id, s.contract_version);
    v_versions := v_versions || jsonb_build_array(jsonb_build_object(
      'contract_version', s.contract_version, 'contract_state', s.lifecycle_state, 'source_name', s.name,
      'contract_rights', jsonb_build_object('rights_state', s.rights_state, 'licence', s.ar ->> 'licence', 'permitted_use', coalesce(s.ar -> 'permitted_use', '[]'::jsonb),
                                            'purposes', coalesce(s.ar -> 'purposes', '[]'::jsonb), 'attribution', s.ar ->> 'attribution', 'retention', s.ar ->> 'retention',
                                            'legal_basis', s.ar ->> 'legal_basis'),
      'current', observation.rt_json(cur, v_at),
      'statement', CASE WHEN cur.terms_id IS NULL THEN 'no rights terms declared for this contract version — no expiry declared'
                        ELSE coalesce(observation.rt_state(cur, v_at), '') || ' · ' || (observation.rt_json(cur, v_at) ->> 'expiry_statement') END,
      'history', (SELECT coalesce(jsonb_agg(observation.rt_json(t, v_at) ORDER BY t.version), '[]'::jsonb) FROM observation.rights_terms t
                   WHERE t.tenant_id = p_tenant AND t.domain_id = p_domain AND t.source_id = p_source_id AND t.contract_version = s.contract_version),
      'events', (SELECT coalesce(jsonb_agg(jsonb_build_object('event', e.event, 'terms_version', e.terms_version, 'actor', e.actor, 'at', graph.pv_iso(e.occurred_at), 'details', e.details)
                   ORDER BY e.occurred_at, e.event_id), '[]'::jsonb) FROM observation.rights_terms_events e
                   WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.source_id = p_source_id AND e.contract_version = s.contract_version)));
  END LOOP;
  RETURN jsonb_build_object('source_id', p_source_id, 'versions', v_versions, 'as_of', graph.pv_iso(v_at));
END $$;
REVOKE ALL ON FUNCTION observation.rights_terms_read(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.rights_terms_read(uuid, uuid, uuid) TO eye_app, eye_commit;

-- §EV.6 ONE EVIDENCE VERSION'S STATE (internal; no runtime grant) ─────────────────────────────────────────────────────────────────────────
/* What a reader and a decision-active use need to know about one evidence version, from STORED rows only (no bytes are read here):
   the bytes digest and the manifest's; custody — the last verified event (admitted / imported / restored / verified / finalized, or a
   retrieval that verified the digest) against the last integrity failure (an integrity failure AFTER the last verified custody is
   `integrity_failed`); the last retrieval (`custody.retrieval_degraded` last = the tier's root could not be reached); a tombstone (the
   bytes governed-deleted); the tier; the rights terms of its source contract version (expired / withdrawn); a later correction or
   withdrawal; the cited span within the bytes (out of range = unverifiable). The outcome is the worst finding, every reason kept. */
CREATE OR REPLACE FUNCTION graph.ev_evidence_state(p_tenant uuid, p_domain uuid, p_id uuid, p_version int, p_span_start int, p_span_end int, p_at timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, observation, objects, pg_catalog, pg_temp AS $$
DECLARE
  e objects.canonical_objects; m observation.blob_manifests%ROWTYPE; v_has_m boolean := false; v_manifest uuid; v_digest text; v_len bigint; v_media text;
  v_last_ok timestamptz; v_failed timestamptz; v_last_read text; v_failed_flag boolean := false; v_unreachable boolean := false; v_tomb boolean := false;
  v_tier text := 'hot'; v_src uuid; v_cv int; rt observation.rights_terms; v_rights_state text; v_contract_rights text;
  v_corrected_by text; v_withdrawn_since int; v_events int; v_last_at timestamptz; v_outcome text := 'resolved'; v_reasons text[] := '{}'; v_detail text[] := '{}';
  v_digest_ok boolean; v_start bigint; v_end bigint; v_artifact_ok boolean := true;
BEGIN
  SELECT * INTO e FROM objects.canonical_objects o
   WHERE o.object_type = 'EVD' AND o.object_id = p_id AND o.object_version = p_version AND o.tenant_id = p_tenant AND o.domain_id = p_domain;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ref', 'EVD:' || p_id || '@' || p_version, 'evidence', NULL, 'digest_ok', NULL, 'custody', NULL, 'rights', NULL, 'tier', NULL,
      'correction', jsonb_build_object('correction_of', NULL, 'corrected_by', NULL), 'outcome', 'inaccessible', 'reasons', jsonb_build_array('not_recorded'),
      'integrity_failed', false, 'unreachable', false, 'tombstoned', false, 'rights_state', NULL,
      'detail', format('evidence %s v%s is not recorded in this domain (or is not visible to this reader)', p_id, p_version));
  END IF;
  v_digest := e.payload ->> 'content_digest';
  v_len := CASE WHEN (e.payload ->> 'byte_length') ~ '^[0-9]{1,15}$' THEN (e.payload ->> 'byte_length')::bigint END;
  v_media := coalesce(e.payload ->> 'media_type_sniffed', e.payload ->> 'media_type_declared');
  IF coalesce(e.payload ->> 'manifest_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN v_manifest := (e.payload ->> 'manifest_id')::uuid; END IF;
  IF v_manifest IS NOT NULL THEN
    SELECT * INTO m FROM observation.blob_manifests b WHERE b.manifest_id = v_manifest AND b.tenant_id = p_tenant AND b.domain_id = p_domain;
    v_has_m := FOUND;
  END IF;
  IF v_len IS NULL AND v_has_m THEN v_len := m.byte_length; END IF;
  -- custody (B21.2's rows and phase 1's; the B50 reading of "established", plus a retrieval that verified the digest)
  SELECT count(*)::int, max(c.occurred_at) INTO v_events, v_last_at FROM observation.custody_events c
   WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND (c.evd_object_id = p_id OR (v_manifest IS NOT NULL AND c.manifest_id = v_manifest));
  SELECT max(c.occurred_at) INTO v_last_ok FROM observation.custody_events c
   WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND (c.evd_object_id = p_id OR (v_manifest IS NOT NULL AND c.manifest_id = v_manifest))
     AND (c.event IN ('custody.admitted', 'custody.imported', 'custody.restored', 'custody.verified', 'custody.finalized') OR (c.event = 'custody.retrieved' AND c.digest_verified IS TRUE))
     AND (c.content_digest IS NULL OR c.content_digest = v_digest);
  SELECT max(c.occurred_at) INTO v_failed FROM observation.custody_events c
   WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND (c.evd_object_id = p_id OR (v_manifest IS NOT NULL AND c.manifest_id = v_manifest))
     AND (c.event = 'custody.integrity_failed' OR c.digest_verified IS FALSE);
  v_failed_flag := v_failed IS NOT NULL AND (v_last_ok IS NULL OR v_failed >= v_last_ok);
  SELECT c.event INTO v_last_read FROM observation.custody_events c
   WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND (c.evd_object_id = p_id OR (v_manifest IS NOT NULL AND c.manifest_id = v_manifest))
     AND c.event IN ('custody.retrieved', 'custody.retrieval_degraded', 'custody.integrity_failed')
   ORDER BY c.occurred_at DESC, c.event_id DESC LIMIT 1;
  v_unreachable := v_last_read IS NOT DISTINCT FROM 'custody.retrieval_degraded';
  v_tomb := v_manifest IS NOT NULL AND EXISTS (SELECT 1 FROM observation.blob_tombstones t WHERE t.manifest_id = v_manifest);
  IF v_manifest IS NOT NULL THEN
    SELECT CASE WHEN tr.tier = 'archive' THEN 'archived' ELSE 'hot' END INTO v_tier FROM observation.blob_tier_records tr
     WHERE tr.manifest_id = v_manifest ORDER BY tr.moved_at DESC, tr.record_id DESC LIMIT 1;
    v_tier := coalesce(v_tier, 'hot');
  END IF;
  -- the rights terms of the source contract version the evidence was collected under (provenance_ref SRC:<id>@<contract version>)
  IF coalesce(e.provenance_ref, '') ~* '^SRC:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@[1-9][0-9]{0,8}$' THEN
    v_src := substring(e.provenance_ref from 5 for 36)::uuid; v_cv := split_part(e.provenance_ref, '@', 2)::int;
    rt := observation.rt_current(p_tenant, p_domain, v_src, v_cv);
    v_rights_state := observation.rt_state(rt, p_at);
    SELECT s.rights_state INTO v_contract_rights FROM observation.source_contracts_current s WHERE s.source_id = v_src AND s.contract_version = v_cv AND s.tenant_id = p_tenant AND s.domain_id = p_domain;
  END IF;
  -- a later correction of this version; a withdrawal (this version, or a later one)
  SELECT 'EVD:' || x.object_id || '@' || x.object_version INTO v_corrected_by FROM objects.canonical_objects x
   WHERE x.object_type = 'EVD' AND x.object_id = p_id AND x.object_version > p_version AND x.correction_of IN (p_id::text || '@' || p_version, 'EVD:' || p_id::text || '@' || p_version)
   ORDER BY x.object_version LIMIT 1;
  SELECT min(x.object_version) INTO v_withdrawn_since FROM objects.canonical_objects x
   WHERE x.object_type = 'EVD' AND x.object_id = p_id AND x.object_version >= p_version AND x.lifecycle_state IN ('withdrawn', 'deleted');
  -- the span: the cited bytes within the evidence's bytes (the whole object when the citation names no span)
  v_start := coalesce(p_span_start, 0); v_end := coalesce(p_span_end, v_len);
  -- THE FINDINGS (every one kept; the outcome is the worst)
  IF v_tomb THEN v_reasons := v_reasons || text 'tombstoned'; v_detail := v_detail || text 'the bytes were governed-deleted (tombstoned); the record remains'; END IF;
  IF v_unreachable THEN v_reasons := v_reasons || text 'tier_unreachable'; v_detail := v_detail || text 'the last retrieval found the tier''s root unreachable (EYE-DEG-001); nothing about the bytes was verified or refuted since'; END IF;
  IF NOT v_has_m THEN
    v_artifact_ok := false; v_reasons := v_reasons || text 'no_manifest'; v_detail := v_detail || text 'no blob manifest is recorded for these bytes in this domain';
  ELSIF m.content_digest IS DISTINCT FROM v_digest THEN
    v_artifact_ok := false; v_reasons := v_reasons || text 'digest_mismatch'; v_detail := v_detail || format('the manifest records bytes digest %s…; the evidence names %s…', left(m.content_digest, 12), left(coalesce(v_digest, '<none>'), 12));
  END IF;
  IF v_failed_flag THEN
    v_reasons := v_reasons || text 'integrity_failed';
    v_detail := v_detail || format('the bytes failed integrity at %s, after the last verified custody%s', graph.pv_iso(v_failed), CASE WHEN v_last_ok IS NULL THEN '' ELSE ' at ' || graph.pv_iso(v_last_ok) END);
  END IF;
  IF e.payload ? 'authenticity' AND coalesce(e.payload #>> '{authenticity,byte_integrity}', '') <> 'verified' THEN
    v_artifact_ok := false; v_reasons := v_reasons || text 'byte_integrity_unverified'; v_detail := v_detail || format('byte integrity is recorded as %s, not verified', coalesce(e.payload #>> '{authenticity,byte_integrity}', '<unstated>'));
  END IF;
  IF v_start < 0 OR v_end IS NULL OR v_end < v_start OR (v_len IS NOT NULL AND v_end > v_len) THEN
    v_artifact_ok := false; v_reasons := v_reasons || text 'span_out_of_range';
    v_detail := v_detail || format('the cited span %s–%s does not lie within the %s recorded bytes', v_start, coalesce(v_end::text, '?'), coalesce(v_len::text, 'unknown number of'));
  END IF;
  IF v_rights_state IN ('expired', 'withdrawn') THEN
    v_reasons := v_reasons || ('rights_' || v_rights_state);
    v_detail := v_detail || format('the rights terms of its source contract (v%s) are %s (%s)', rt.version, v_rights_state, observation.rt_json(rt, p_at) ->> 'expiry_statement');
  END IF;
  IF v_withdrawn_since IS NOT NULL THEN
    v_reasons := v_reasons || text 'withdrawn';
    v_detail := v_detail || CASE WHEN v_withdrawn_since = p_version THEN 'this version is withdrawn' ELSE format('withdrawn since v%s', v_withdrawn_since) END;
  END IF;
  IF v_corrected_by IS NOT NULL THEN v_reasons := v_reasons || text 'corrected'; v_detail := v_detail || format('corrected since by %s', v_corrected_by); END IF;
  v_outcome := CASE
    WHEN v_tomb OR v_unreachable THEN 'inaccessible'
    WHEN v_failed_flag OR NOT v_artifact_ok THEN 'unverifiable'
    WHEN v_rights_state IN ('expired', 'withdrawn') THEN 'rights_expired'
    WHEN v_withdrawn_since IS NOT NULL THEN 'withdrawn'
    WHEN v_corrected_by IS NOT NULL THEN 'corrected'
    ELSE 'resolved' END;
  v_digest_ok := CASE WHEN NOT v_has_m THEN NULL WHEN m.content_digest IS DISTINCT FROM v_digest OR v_failed_flag THEN false ELSE true END;
  RETURN jsonb_build_object(
    'ref', 'EVD:' || p_id || '@' || p_version,
    'evidence', jsonb_build_object('id', p_id, 'version', p_version, 'digest', v_digest, 'byte_start', v_start, 'byte_end', v_end, 'media_type', v_media, 'byte_length', v_len,
                                   'content_digest', e.content_digest, 'lifecycle', e.lifecycle_state, 'truth_state', e.truth_state, 'synthetic', e.synthetic_state,
                                   'recorded_at', graph.pv_iso(e.recorded_at), 'source_id', v_src, 'contract_version', v_cv,
                                   'fragment', CASE WHEN e.payload ? 'fragment' THEN (e.payload -> 'fragment') || jsonb_build_object('parent_evd_id', e.payload ->> 'parent_evd_id') END),
    'digest_ok', v_digest_ok,
    'custody', jsonb_build_object('events', coalesce(v_events, 0), 'last_event_at', graph.pv_iso(v_last_at), 'last_verified_at', graph.pv_iso(v_last_ok), 'last_failed_at', graph.pv_iso(v_failed),
                                  'state', CASE WHEN v_failed_flag THEN 'integrity_failed' WHEN v_last_ok IS NULL THEN 'not_established' ELSE 'intact' END),
    'rights', observation.rt_json(rt, p_at), 'contract_rights_state', v_contract_rights,
    'tier', CASE WHEN v_manifest IS NULL THEN NULL ELSE v_tier END,
    'correction', jsonb_build_object('correction_of', CASE WHEN e.correction_of IS NULL THEN NULL ELSE 'EVD:' || regexp_replace(e.correction_of, '^EVD:', '') END, 'corrected_by', v_corrected_by),
    'outcome', v_outcome, 'reasons', to_jsonb(v_reasons), 'detail', CASE WHEN cardinality(v_detail) = 0 THEN NULL ELSE array_to_string(v_detail, '; ') END,
    'integrity_failed', v_failed_flag, 'unreachable', v_unreachable, 'tombstoned', v_tomb, 'rights_state', v_rights_state);
END $$;
REVOKE ALL ON FUNCTION graph.ev_evidence_state(uuid, uuid, uuid, int, int, int, timestamptz) FROM PUBLIC;

/* The seven outcomes, least to most severe (the citation's outcome is the worst of its own and its leaves'). */
CREATE OR REPLACE FUNCTION graph.ev_rank(p text) RETURNS int
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT coalesce(array_position(ARRAY['resolved', 'corrected', 'stale_citation', 'withdrawn', 'rights_expired', 'unverifiable', 'inaccessible'], p), 7)
$$;
CREATE OR REPLACE FUNCTION graph.ev_worst(a text, b text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = graph, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN b IS NULL THEN a WHEN a IS NULL THEN b WHEN graph.ev_rank(b) > graph.ev_rank(a) THEN b ELSE a END
$$;
/* A citation kind → the canonical object type it names (decision.citations_ok 0041, twin.citations_ok 0111); estimate names no object type. */
CREATE OR REPLACE FUNCTION graph.ev_kind_type(p_kind text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE p_kind WHEN 'evidence' THEN 'EVD' WHEN 'claim' THEN 'CLM' WHEN 'entity' THEN 'ENT' WHEN 'forecast' THEN 'FCT' WHEN 'assumption' THEN 'ASU'
                     WHEN 'run' THEN 'SIM' WHEN 'twin' THEN 'TWN' WHEN 'scenario' THEN 'SCN' WHEN 'warning' THEN 'WRN' END
$$;
REVOKE ALL ON FUNCTION graph.ev_rank(text), graph.ev_worst(text, text), graph.ev_kind_type(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.ev_rank(text), graph.ev_worst(text, text), graph.ev_kind_type(text) TO eye_app, eye_commit;

-- §EV.7 THE CITATION RESOLUTION ────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* graph.resolve_citation(p_tenant, p_domain, p_refs, p_depth) — one answer per citation, in the order asked (CitationResolutionRow):
     { ref: {kind, id, version, digest}, outcome, own: {outcome, digest_binds, detail, object}, leaves: [CitationLeafRow + reasons], truncated,
       depth, method: 'b82-ev-resolve-1', as_of }
   THE CITED VERSION: recorded in this domain (else inaccessible — denied and absent read the same); its digest: the version's canonical
   digest (`digest_binds: 'version'`), or for evidence the bytes digest (`'bytes'` — what a twin's state element carries), or none carried
   (`'none'`, stated); any other digest is a STALE citation. A later correction of the version (corrected_by), a withdrawal of it or of a
   later version (withdrawn since), an invalidated run, a withdrawn forecast — each stated, each an outcome.
   THE LEAVES: an evidence citation is its own leaf; any other kind descends the RECORDED lineage (graph.pv_closure — B50's closure, bounded
   by p_depth steps and 200 objects) to every evidence version it reaches, each leaf with its path from the cited object, the claim's byte
   span where the lineage records one, and graph.ev_evidence_state. An unresolved reference on the way is an `unverifiable` leaf with its
   reason; a lineage that reaches no evidence says so (an `unverifiable` leaf: "reaches no evidence bytes"). At most 100 leaves (truncated). */
CREATE OR REPLACE FUNCTION graph.resolve_citation(p_tenant uuid, p_domain uuid, p_refs jsonb, p_depth int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, objects, intelligence, observation, twin, simulation, prediction, pg_catalog, pg_temp AS $$
DECLARE
  c jsonb; v_out jsonb := '[]'::jsonb; v_depth int := coalesce(p_depth, 4); v_type text; o objects.canonical_objects; v_found boolean; v_at timestamptz := clock_timestamp();
  v_own text; v_own_detail text[]; v_binds text; v_leaves jsonb; cl jsonb; ob jsonb; ed jsonb; v_parent jsonb; v_path jsonb; v_cur text; v_i int; v_span jsonb;
  st jsonb; v_outcome text; v_truncated boolean; v_corrected_by text; v_withdrawn_since int; v_key text; v_root text; v_n int; g jsonb; v_est record; v_rd record;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the resolution of a citation');
  IF p_refs IS NULL OR jsonb_typeof(p_refs) <> 'array' OR jsonb_array_length(p_refs) < 1 OR jsonb_array_length(p_refs) > 50 THEN
    RAISE EXCEPTION 'citation resolution rejected (citations): a resolution names 1 to 50 citations, each {kind, id, version, digest}' USING ERRCODE = '22023';
  END IF;
  IF v_depth < 1 OR v_depth > 8 THEN
    RAISE EXCEPTION 'citation resolution rejected (depth): the lineage is descended 1 to 8 steps (asked %)', v_depth USING ERRCODE = '22023';
  END IF;
  FOR c IN SELECT x FROM jsonb_array_elements(p_refs) x LOOP
    IF jsonb_typeof(c) <> 'object' OR jsonb_typeof(c -> 'kind') IS DISTINCT FROM 'string'
       OR NOT ((c ->> 'kind') = ANY (ARRAY['evidence', 'claim', 'entity', 'forecast', 'assumption', 'run', 'twin', 'scenario', 'warning', 'estimate']))
       OR jsonb_typeof(c -> 'id') IS DISTINCT FROM 'string' OR (c ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR jsonb_typeof(c -> 'version') IS DISTINCT FROM 'number' OR (c ->> 'version') !~ '^[1-9][0-9]{0,8}$'
       OR NOT (c -> 'digest' IS NULL OR jsonb_typeof(c -> 'digest') = 'null' OR (jsonb_typeof(c -> 'digest') = 'string' AND (c ->> 'digest') ~ '^[0-9a-f]{64}$')) THEN
      RAISE EXCEPTION 'citation resolution rejected (citation): % is not a citation — {kind (evidence, claim, entity, forecast, assumption, run, twin, scenario, warning, estimate), id, version ≥ 1, digest (64 hex) or null}',
        left(c::text, 200) USING ERRCODE = '22023';
    END IF;
    v_own := 'resolved'; v_own_detail := '{}'; v_binds := 'none'; v_leaves := '[]'::jsonb; v_truncated := false; v_corrected_by := NULL; v_withdrawn_since := NULL;
    v_type := graph.ev_kind_type(c ->> 'kind');
    -- ── an ESTIMATE (twin.estimates — no canonical object): the inputs digest; the resolver does not descend into an estimate's inputs ──
    IF c ->> 'kind' = 'estimate' THEN
      SELECT x.estimate_id, x.inputs_digest, x.twin_id INTO v_est FROM twin.estimates x WHERE x.estimate_id = (c ->> 'id')::uuid AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
      IF NOT FOUND THEN
        v_own := 'inaccessible'; v_own_detail := v_own_detail || format('estimate %s is not recorded in this domain (or is not visible to this reader)', c ->> 'id');
      ELSE
        IF c ->> 'digest' IS NULL THEN v_own_detail := v_own_detail || 'the citing record carried no digest'::text;
        ELSIF c ->> 'digest' = v_est.inputs_digest THEN v_binds := 'version';
        ELSE v_own := 'stale_citation'; v_own_detail := v_own_detail || format('the citation carries digest %s…; the estimate''s inputs digest is %s…', left(c ->> 'digest', 12), left(v_est.inputs_digest, 12));
        END IF;
        v_leaves := jsonb_build_array(jsonb_build_object('path', jsonb_build_array('estimate:' || (c ->> 'id')), 'evidence', NULL, 'digest_ok', NULL, 'custody', NULL, 'rights', NULL, 'tier', NULL,
          'correction', jsonb_build_object('correction_of', NULL, 'corrected_by', NULL), 'outcome', 'unverifiable', 'reasons', jsonb_build_array('not_descended'),
          'detail', format('an estimate''s inputs are read on its twin (%s); the citation resolver does not descend into an estimate', v_est.twin_id)));
      END IF;
      v_outcome := v_own;
      FOR ob IN SELECT x FROM jsonb_array_elements(v_leaves) x LOOP v_outcome := graph.ev_worst(v_outcome, ob ->> 'outcome'); END LOOP;
      v_out := v_out || jsonb_build_array(jsonb_build_object('ref', jsonb_build_object('kind', c ->> 'kind', 'id', lower(c ->> 'id'), 'version', (c ->> 'version')::int, 'digest', c ->> 'digest'),
        'outcome', v_outcome, 'own', jsonb_build_object('outcome', v_own, 'digest_binds', v_binds, 'detail', CASE WHEN cardinality(v_own_detail) = 0 THEN NULL ELSE array_to_string(v_own_detail, '; ') END, 'object', NULL),
        'leaves', v_leaves, 'truncated', false, 'depth', v_depth, 'method', 'b82-ev-resolve-1', 'as_of', graph.pv_iso(v_at)));
      CONTINUE;
    END IF;
    -- ── THE CITED VERSION ──
    SELECT * INTO o FROM objects.canonical_objects x
     WHERE x.object_type = v_type AND x.object_id = (c ->> 'id')::uuid AND x.object_version = (c ->> 'version')::int AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    v_found := FOUND;
    IF NOT v_found THEN
      v_own := 'inaccessible';
      v_own_detail := v_own_detail || format('%s %s v%s is not recorded in this domain (or is not visible to this reader)', v_type, c ->> 'id', c ->> 'version');
    ELSE
      v_root := o.object_type || ':' || o.object_id || '@' || o.object_version;
      IF c ->> 'digest' IS NULL THEN v_binds := 'none'; v_own_detail := v_own_detail || 'the citing record carried no digest; the version is named, not bound'::text;
      ELSIF c ->> 'digest' = o.content_digest THEN v_binds := 'version';
      ELSIF v_type = 'EVD' AND c ->> 'digest' = o.payload ->> 'content_digest' THEN v_binds := 'bytes';
      ELSE
        v_own := graph.ev_worst(v_own, 'stale_citation');
        v_own_detail := v_own_detail || format('the citation carries digest %s…; %s records %s…', left(c ->> 'digest', 12), v_root, left(o.content_digest, 12));
      END IF;
      SELECT x.object_type || ':' || x.object_id || '@' || x.object_version INTO v_corrected_by FROM objects.canonical_objects x
       WHERE x.object_type = o.object_type AND x.object_id = o.object_id AND x.object_version > o.object_version
         AND x.correction_of IN (o.object_id::text || '@' || o.object_version, o.object_type || ':' || o.object_id::text || '@' || o.object_version)
       ORDER BY x.object_version LIMIT 1;
      IF v_corrected_by IS NOT NULL THEN v_own := graph.ev_worst(v_own, 'corrected'); v_own_detail := v_own_detail || format('corrected since by %s', v_corrected_by); END IF;
      SELECT min(x.object_version) INTO v_withdrawn_since FROM objects.canonical_objects x
       WHERE x.object_type = o.object_type AND x.object_id = o.object_id AND x.object_version >= o.object_version AND x.lifecycle_state IN ('withdrawn', 'deleted');
      IF v_withdrawn_since IS NOT NULL THEN
        v_own := graph.ev_worst(v_own, 'withdrawn');
        v_own_detail := v_own_detail || CASE WHEN v_withdrawn_since = o.object_version THEN 'this version is withdrawn' ELSE format('withdrawn since v%s', v_withdrawn_since) END;
      END IF;
      IF v_type = 'SIM' THEN
        SELECT r.validity, r.invalidated_at INTO v_rd FROM simulation.runs_current r WHERE r.run_id = o.object_id AND r.tenant_id = p_tenant AND r.domain_id = p_domain;
        IF FOUND AND v_rd.validity = 'invalidated' THEN v_own := graph.ev_worst(v_own, 'withdrawn'); v_own_detail := v_own_detail || format('the run was invalidated at %s', graph.pv_iso(v_rd.invalidated_at)); END IF;
      ELSIF v_type = 'FCT' THEN
        IF EXISTS (SELECT 1 FROM prediction.forecasts_current f WHERE f.forecast_id = o.object_id AND f.tenant_id = p_tenant AND f.domain_id = p_domain AND f.state = 'withdrawn') THEN
          v_own := graph.ev_worst(v_own, 'withdrawn'); v_own_detail := v_own_detail || 'the forecast was withdrawn as unfit'::text;
        END IF;
      END IF;
      -- ── THE LEAVES ──
      IF v_type = 'EVD' THEN
        st := graph.ev_evidence_state(p_tenant, p_domain, o.object_id, o.object_version, NULL, NULL, v_at);
        v_leaves := jsonb_build_array(jsonb_build_object('path', jsonb_build_array(v_root)) || (st - 'ref'));
      ELSE
        cl := graph.pv_closure(p_tenant, p_domain, o.object_type, o.object_id, o.object_version, v_depth, 200);
        v_truncated := coalesce((cl ->> 'truncated')::boolean, false);
        -- the first parent of each object (breadth first), to state each leaf's path from the cited version
        v_parent := '{}'::jsonb;
        FOR ed IN SELECT x FROM jsonb_array_elements(coalesce(cl -> 'edges', '[]'::jsonb)) x LOOP
          IF ed ->> 'to' IS NOT NULL AND ed ->> 'to' <> v_root AND NOT (v_parent ? (ed ->> 'to')) THEN v_parent := v_parent || jsonb_build_object(ed ->> 'to', ed ->> 'from'); END IF;
        END LOOP;
        v_n := 0;
        FOR ob IN SELECT x FROM jsonb_array_elements(coalesce(cl -> 'objects', '[]'::jsonb)) x WHERE x ->> 'type' = 'EVD' LOOP
          IF v_n >= 100 THEN v_truncated := true; EXIT; END IF;
          v_key := ob ->> 'key';
          v_path := jsonb_build_array(v_key); v_cur := v_key; v_i := 0;
          WHILE v_parent ? v_cur AND v_i < 16 LOOP v_cur := v_parent ->> v_cur; v_path := jsonb_build_array(v_cur) || v_path; v_i := v_i + 1; END LOOP;
          IF v_path ->> 0 IS DISTINCT FROM v_root THEN v_path := jsonb_build_array(v_root) || v_path; END IF;
          SELECT x -> 'span' INTO v_span FROM jsonb_array_elements(cl -> 'edges') x WHERE x ->> 'to' = v_key AND x ->> 'basis' = 'claim_lineage' AND jsonb_typeof(x -> 'span') = 'object' LIMIT 1;
          st := graph.ev_evidence_state(p_tenant, p_domain, (ob ->> 'id')::uuid, (ob ->> 'version')::int,
                  CASE WHEN v_span IS NULL THEN NULL ELSE (v_span ->> 'start')::int END, CASE WHEN v_span IS NULL THEN NULL ELSE (v_span ->> 'end')::int END, v_at);
          v_leaves := v_leaves || jsonb_build_array(jsonb_build_object('path', v_path, 'span_basis', CASE WHEN v_span IS NULL THEN 'whole_object' ELSE 'claim_lineage' END) || (st - 'ref'));
          v_n := v_n + 1;
        END LOOP;
        -- references on the way that resolve to no evidence bytes: unverifiable leaves with their reasons (the gap preserved)
        FOR g IN SELECT x FROM jsonb_array_elements(coalesce(cl -> 'gaps', '[]'::jsonb)) x
                  WHERE x ->> 'kind' IN ('incomplete_lineage', 'unverifiable_artifact') AND coalesce(x ->> 'ref', '') NOT IN (SELECT y ->> 'key' FROM jsonb_array_elements(cl -> 'objects') y) LOOP
          IF v_n >= 100 THEN v_truncated := true; EXIT; END IF;
          v_leaves := v_leaves || jsonb_build_array(jsonb_build_object('path', jsonb_build_array(v_root, g ->> 'ref'), 'evidence', NULL, 'digest_ok', NULL, 'custody', NULL, 'rights', NULL, 'tier', NULL,
            'correction', jsonb_build_object('correction_of', NULL, 'corrected_by', NULL), 'outcome', 'unverifiable', 'reasons', jsonb_build_array(g ->> 'kind'), 'detail', g ->> 'reason'));
          v_n := v_n + 1;
        END LOOP;
        IF jsonb_array_length(v_leaves) = 0 THEN
          v_leaves := jsonb_build_array(jsonb_build_object('path', jsonb_build_array(v_root), 'evidence', NULL, 'digest_ok', NULL, 'custody', NULL, 'rights', NULL, 'tier', NULL,
            'correction', jsonb_build_object('correction_of', NULL, 'corrected_by', NULL), 'outcome', 'unverifiable', 'reasons', jsonb_build_array(CASE WHEN v_truncated THEN 'truncated' ELSE 'no_evidence' END),
            'detail', CASE WHEN v_truncated THEN format('the recorded lineage of %s was cut at %s steps before it reached evidence bytes', v_root, v_depth)
                           ELSE format('the recorded lineage of %s reaches no evidence bytes within %s steps', v_root, v_depth) END));
        END IF;
      END IF;
    END IF;
    v_outcome := v_own;
    FOR ob IN SELECT x FROM jsonb_array_elements(v_leaves) x LOOP v_outcome := graph.ev_worst(v_outcome, ob ->> 'outcome'); END LOOP;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'ref', jsonb_build_object('kind', c ->> 'kind', 'id', lower(c ->> 'id'), 'version', (c ->> 'version')::int, 'digest', c ->> 'digest'),
      'outcome', v_outcome,
      'own', jsonb_build_object('outcome', v_own, 'digest_binds', v_binds, 'detail', CASE WHEN cardinality(v_own_detail) = 0 THEN NULL ELSE array_to_string(v_own_detail, '; ') END,
        'object', CASE WHEN v_found THEN jsonb_build_object('type', o.object_type, 'lifecycle', o.lifecycle_state, 'truth_state', o.truth_state, 'synthetic', o.synthetic_state,
          'recorded_at', graph.pv_iso(o.recorded_at), 'digest', o.content_digest, 'correction_of', o.correction_of, 'corrected_by', v_corrected_by,
          'title', left(coalesce(o.payload ->> 'title', o.payload ->> 'statement', o.payload ->> 'subject', o.payload ->> 'label', o.object_type || ' ' || o.object_id::text), 200)) END),
      'leaves', v_leaves, 'truncated', v_truncated, 'depth', v_depth, 'method', 'b82-ev-resolve-1', 'as_of', graph.pv_iso(v_at)));
  END LOOP;
  RETURN v_out;
END $$;
REVOKE ALL ON FUNCTION graph.resolve_citation(uuid, uuid, jsonb, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.resolve_citation(uuid, uuid, jsonb, int) TO eye_app, eye_commit;

-- §EV.8 THE HOOK — objects._lineage_usable re-declared WHOLE from 0120:4749 (B50 pv); the additions marked `-- B82 ev` ────────────────────────
/* THE HOOK — §PV's stub (0120 §0.1) re-declared WHOLE: the same signature, STABLE, invoker, the same search path; read-only. Consequential use
   (a package option, a publication, a gate act) and EXPORT refuse a product whose current mark is UNFIT, or one resting — through the
   provenance agent's constructed edges, eight steps at most — on a version whose current mark is unfit. No mark is no refusal: the hook reads
   the governed record, it never evaluates (a STABLE caller cannot record what an evaluation finds).
   B82 ev (UX-26-004): AFTER the B50 checks, unchanged, the EVIDENCE the use rests on — the object itself (an EVD), a claim's lineage evidence,
   the header's evidence_refs, the constructed upstream (the same eight steps) — is refused when its bytes failed integrity after the last
   verified custody (integrity_failed), when its tier's root was unreachable at the last retrieval or the bytes were governed-deleted
   (inaccessible), or when the rights terms of its source contract version expired or were withdrawn (rights_expired). Refusals only added. */
CREATE OR REPLACE FUNCTION objects._lineage_usable(p_type text, p_id uuid, p_version int, p_use text) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = objects, pg_catalog, pg_temp AS $$
DECLARE m record;
        o record; ev record; st jsonb;   -- B82 ev
BEGIN
  -- B50 pv: the product's own current mark
  SELECT fm.mark_id, fm.verdict, fm.reasons, fm.route, fm.marked_at INTO m FROM graph.product_fitness_marks fm
   WHERE fm.object_id = p_id AND fm.object_version = p_version ORDER BY fm.marked_at DESC, fm.mark_id DESC LIMIT 1;
  IF FOUND AND m.verdict = 'unfit' THEN
    RAISE EXCEPTION 'object use rejected (unfit): % % v% is marked unfit (%) by mark % at %; it is not used for %; the mark routed it to %',
      p_type, p_id, p_version, array_to_string(m.reasons, ', '), m.mark_id, to_char(m.marked_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), p_use, m.route USING ERRCODE = '22023';
  END IF;
  -- B50 pv: an upstream version (the constructed lineage edges) whose current mark is unfit
  WITH RECURSIVE up(id, version, depth, path) AS (
    SELECT e.upstream_id, e.upstream_version, 1, ARRAY[e.upstream_id::text || '@' || e.upstream_version] FROM graph.provenance_edges e WHERE e.dependent_id = p_id AND e.dependent_version = p_version
    UNION
    SELECT e.upstream_id, e.upstream_version, u.depth + 1, u.path || (e.upstream_id::text || '@' || e.upstream_version) FROM up u JOIN graph.provenance_edges e ON e.dependent_id = u.id AND e.dependent_version = u.version
     WHERE u.depth < 8 AND NOT ((e.upstream_id::text || '@' || e.upstream_version) = ANY (u.path)))
  SELECT x.mark_id, x.object_type, x.object_id, x.object_version, x.reasons, x.route INTO m
    FROM (SELECT DISTINCT u.id, u.version FROM up u) u2
    CROSS JOIN LATERAL (SELECT fm.* FROM graph.product_fitness_marks fm WHERE fm.object_id = u2.id AND fm.object_version = u2.version ORDER BY fm.marked_at DESC, fm.mark_id DESC LIMIT 1) x
   WHERE x.verdict = 'unfit' ORDER BY x.marked_at, x.mark_id LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'object use rejected (unfit): % % v% rests on % % v%, marked unfit (%) by mark %; it is not used for % until the upstream mark is lifted (routed to %)',
      p_type, p_id, p_version, m.object_type, m.object_id, m.object_version, array_to_string(m.reasons, ', '), m.mark_id, p_use, m.route USING ERRCODE = '22023';
  END IF;
  -- B82 ev: the evidence this use rests on (the object itself, a claim's lineage evidence, the header's evidence_refs, the constructed upstream)
  SELECT x.tenant_id, x.domain_id, x.evidence_refs INTO o FROM objects.canonical_objects x                                         -- B82 ev
   WHERE x.object_type = p_type AND x.object_id = p_id AND x.object_version = p_version LIMIT 1;                                    -- B82 ev
  IF FOUND AND o.tenant_id IS NOT NULL AND o.domain_id IS NOT NULL THEN                                                            -- B82 ev
    FOR ev IN                                                                                                                      -- B82 ev
      WITH RECURSIVE up(id, version, type, depth, path) AS (
        SELECT e.upstream_id, e.upstream_version, e.upstream_type, 1, ARRAY[e.upstream_id::text || '@' || e.upstream_version] FROM graph.provenance_edges e WHERE e.dependent_id = p_id AND e.dependent_version = p_version
        UNION
        SELECT e.upstream_id, e.upstream_version, e.upstream_type, u.depth + 1, u.path || (e.upstream_id::text || '@' || e.upstream_version) FROM up u JOIN graph.provenance_edges e ON e.dependent_id = u.id AND e.dependent_version = u.version
         WHERE u.depth < 8 AND NOT ((e.upstream_id::text || '@' || e.upstream_version) = ANY (u.path)))
      SELECT DISTINCT y.id, y.version FROM (
        SELECT p_id AS id, p_version AS version WHERE p_type = 'EVD'
        UNION ALL
        SELECT l.evidence_object_id, (SELECT max(e2.object_version) FROM objects.canonical_objects e2 WHERE e2.object_type = 'EVD' AND e2.object_id = l.evidence_object_id
                                         AND e2.tenant_id = o.tenant_id AND e2.domain_id = o.domain_id AND e2.payload ->> 'content_digest' = l.evidence_digest)
          FROM intelligence.claim_lineage l WHERE l.claim_object_id = p_id AND l.claim_version = p_version
        UNION ALL
        SELECT (z.r ->> 'id')::uuid, coalesce((z.r ->> 'version')::int, (SELECT max(e3.object_version) FROM objects.canonical_objects e3 WHERE e3.object_type = 'EVD' AND e3.object_id = (z.r ->> 'id')::uuid
                                                                           AND e3.tenant_id = o.tenant_id AND e3.domain_id = o.domain_id))
          FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(o.evidence_refs) = 'array' THEN o.evidence_refs ELSE '[]'::jsonb END) t(v) CROSS JOIN LATERAL (SELECT graph.pv_ref(t.v) AS r) z
         WHERE z.r ->> 'form' = 'typed' AND z.r ->> 'type' = 'EVD'
        UNION ALL
        SELECT u.id, u.version FROM up u WHERE u.type = 'EVD') y
       WHERE y.id IS NOT NULL AND y.version IS NOT NULL
       LIMIT 200
    LOOP                                                                                                                           -- B82 ev
      st := graph.ev_evidence_state(o.tenant_id, o.domain_id, ev.id, ev.version, NULL, NULL, clock_timestamp());                   -- B82 ev
      IF (st ->> 'integrity_failed')::boolean THEN                                                                                 -- B82 ev
        RAISE EXCEPTION 'object use rejected (integrity_failed): % % v% rests on EVD % v%, whose bytes failed integrity after their last verified custody (%); it is not used for % until the bytes verify again',
          p_type, p_id, p_version, ev.id, ev.version, st ->> 'detail', p_use USING ERRCODE = '22023';
      END IF;
      IF (st ->> 'tombstoned')::boolean OR (st ->> 'unreachable')::boolean THEN                                                     -- B82 ev
        RAISE EXCEPTION 'object use rejected (inaccessible): % % v% rests on EVD % v%, whose bytes cannot be reached (%); it is not used for % while they cannot be verified',
          p_type, p_id, p_version, ev.id, ev.version, st ->> 'detail', p_use USING ERRCODE = '22023';
      END IF;
      IF st ->> 'rights_state' IN ('expired', 'withdrawn') THEN                                                                     -- B82 ev
        RAISE EXCEPTION 'object use rejected (rights_expired): % % v% rests on EVD % v%, whose source''s rights terms are % (%); it is not used for % until rights are declared again',
          p_type, p_id, p_version, ev.id, ev.version, st ->> 'rights_state', st #>> '{rights,expiry_statement}', p_use USING ERRCODE = '22023';
      END IF;
    END LOOP;                                                                                                                      -- B82 ev
  END IF;                                                                                                                          -- B82 ev
  RETURN;
END $$;
REVOKE ALL ON FUNCTION objects._lineage_usable(text, uuid, int, text) FROM PUBLIC;
