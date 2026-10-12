-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0113 §OR — CP-6 B92 THE OPERATING REVIEW (row PR-70-001: "a governed, role-appropriate capability through which authorized users measure
-- product quality, adoption, mission outcomes, decision support, trust, reliability, cost, capacity and value without surveillance or vanity
-- metrics" — its read model, its accountable business review and its page; the stage's demonstration scene: the NORDWERK operating review shows
-- loop-closure rate, warning acknowledgement latency and forecast calibration for the Red Sea corridor over 2026-Q3, each traceable to its
-- definition and underlying records). Part-local file: applies ALONE on top of 0001–0112 and the §0 prelude; folded last at integration
-- (§0, §MD, §MCA, §MCB, §CO, §UX, §OR). Re-declares NOTHING of the prelude or of another part.
--
-- WHAT IT IS:
--   * THE REVIEW (analytics.review.*): an operating review record — title, a NAMED calendar period (2026-Q3 / 2026-09), an APPROVED scope
--     (or the whole domain), the metric keys it reviews, the CHAIR (a named human: executive / strategy owner / product analytics owner) and
--     the participants' ROLES (never persons — no surveillance, no person listing). draft → held → closed.
--       open      — a human opens it (analytics.review.open);
--       assemble  — computes NOTHING: it CITES, per reviewed metric, the latest NON-PREVIEW, non-replay, whole-population result of the
--                   review's (metric, period, scope) by reading analytics.metric_results, records each citation as an analytics.metric_uses
--                   row (used_in_kind 'operating_review') — the DP-44-005 traceability — and lists a metric with no result as NOT COMPUTED
--                   (never hidden); an explicit pin may name a result, and a PREVIEW (a proposed definition's result) is refused;
--       hold      — the chair holds the review: the citations freeze (the meeting discusses a fixed set);
--       note      — discussion notes by the chair or a holder of a participant role;
--       decide    — the FOLLOW-THROUGH, by the chair alone: an action with a named owner (routing accountability on the record, never an
--                   aggregate per person) and a due date — routed as an `analytics.metric` attention item to that owner — or "no action"
--                   with its reason. A breached threshold or an indeterminate result opens this review workflow; nothing here is an
--                   automatic or punitive decision (App M Action control);
--       close     — the chair's SIGNED CLOSE: a digest over the cited results' source revisions, the notes and the follow-through, bound
--                   to the digest the chair read (a stale digest is refused), with a statement. A closed review is IMMUTABLE.
--   * THE SERIES (analytics.review_series — read under analytics.read): for a metric and scope, the last N periods (quarters or months) —
--     EVERY period listed: a computed period with its state (an indeterminate one with its reasons, never 0), a period with no result yet
--     `not computed`, a period wholly before the deployment's first record of the metric's population `indeterminate: no history (the
--     deployment holds no records before <date>)` — SPARSE HISTORY EXPLICIT (D7), never a blank or a zero.
--   * THE READ (analytics.operating_review_read — analytics.read): the review with, per metric, its definition (title, meaning, population,
--     numerator/denominator, window and clock, floor, owner), the cited result (value or the EXPLAINED indeterminate / unsupported state, n,
--     the interval, window, clock, scope), the drill-down to the prelude's results/:id/read (definition → result → records), the series, the
--     notes, the follow-through and the signature (verified by recomputing the digest).
--
-- CLAIMS: this is SOFTWARE CAPABILITY. The harness's reviews, results and records are SYNTHETIC; the demonstration on eye_demo is a SYNTHETIC
-- demonstration (NORDWERK records, the demo-mailbox receipts); a signed acceptance of the business review (PR-70-006 / AT-70) is R2's.
-- The chair's close is a DIGEST-BOUND act of a named human recorded on the review (the B33 section-approval idiom); an Ed25519 signature in
-- executive.signatures would need the subject kind `operating_review` added to that shared constraint — an integrator's decision, not taken here.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §OR.1 THE TABLES ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* THE OPERATING REVIEW. The facts of the review (title, period, scope, metrics, chair, participant roles) never change; its state moves forward
   only (draft → held → closed); a closed review is immutable (aor_guard). */
CREATE TABLE analytics.operating_reviews (
  review_id          uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  title              text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 200),
  period_key         text NOT NULL,
  period_kind        text NOT NULL CHECK (period_kind IN ('calendar_quarter', 'calendar_month')),
  window_from        timestamptz NOT NULL,
  window_to          timestamptz NOT NULL,
  scope_id           uuid REFERENCES analytics.scopes (scope_id),
  scope_key          text,
  scope_version      int,
  metric_keys        text[] NOT NULL CHECK (cardinality(metric_keys) BETWEEN 1 AND 20),
  chair_principal_id uuid NOT NULL,
  participant_roles  text[] NOT NULL CHECK (cardinality(participant_roles) BETWEEN 1 AND 20),
  state              text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'held', 'closed')),
  assembly           int  NOT NULL DEFAULT 0 CHECK (assembly >= 0),
  assembled_at       timestamptz,
  assembled_by       uuid,
  held_at            timestamptz,
  held_by            uuid,
  close_digest       text CHECK (close_digest IS NULL OR close_digest ~ '^[0-9a-f]{64}$'),
  close_statement    text,
  closed_by          uuid,
  closed_at          timestamptz,
  created_by         uuid NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT aor_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT aor_window CHECK (window_to > window_from),
  CONSTRAINT aor_scope_named CHECK ((scope_id IS NULL) = (scope_key IS NULL) AND (scope_id IS NULL) = (scope_version IS NULL)),
  CONSTRAINT aor_assembled CHECK ((assembly = 0) = (assembled_at IS NULL)),
  CONSTRAINT aor_held CHECK (state = 'draft' OR (held_at IS NOT NULL AND held_by = chair_principal_id AND assembly >= 1)),
  CONSTRAINT aor_closed CHECK ((state = 'closed') = (closed_at IS NOT NULL) AND (state = 'closed') = (close_digest IS NOT NULL)
                               AND (closed_by IS NULL OR closed_by = chair_principal_id) AND (state <> 'closed' OR length(btrim(coalesce(close_statement, ''))) >= 8))
);
CREATE INDEX aor_lookup ON analytics.operating_reviews (tenant_id, domain_id, period_key, created_at DESC);

/* THE CITATIONS of an assembly: per reviewed metric (in the review's order), the cited result, or NOT COMPUTED with the reason. Each assembly is
   a new round (a draft may be re-assembled); the read shows the review's latest round. Append-only. */
CREATE TABLE analytics.review_citations (
  review_id   uuid NOT NULL REFERENCES analytics.operating_reviews (review_id),
  assembly    int  NOT NULL CHECK (assembly >= 1),
  ordinal     int  NOT NULL CHECK (ordinal >= 1),
  tenant_id   uuid NOT NULL,
  domain_id   uuid NOT NULL,
  metric_key  text NOT NULL,
  status      text NOT NULL CHECK (status IN ('cited', 'not_computed')),
  result_id   uuid REFERENCES analytics.metric_results (result_id),
  pinned      boolean NOT NULL DEFAULT false,
  note        text,
  PRIMARY KEY (review_id, assembly, ordinal),
  CONSTRAINT arc_status CHECK ((status = 'cited') = (result_id IS NOT NULL)),
  CONSTRAINT arc_not_computed CHECK (status = 'cited' OR length(btrim(coalesce(note, ''))) >= 8)
);

/* THE NOTES (the discussion). Append-only. */
CREATE TABLE analytics.review_notes (
  note_id             uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  review_id           uuid NOT NULL REFERENCES analytics.operating_reviews (review_id),
  metric_key          text,
  body                text NOT NULL CHECK (length(btrim(body)) BETWEEN 4 AND 4000),
  author_principal_id uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT arn_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX arn_review ON analytics.review_notes (review_id, created_at);

/* THE FOLLOW-THROUGH: the chair's decision per metric (or for the review as a whole): an ACTION named with its owner (a named human — routing
   accountability on this record, never aggregated per person) and its due date, or NO ACTION with its reason. Append-only. */
CREATE TABLE analytics.review_followups (
  followup_id        uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  review_id          uuid NOT NULL REFERENCES analytics.operating_reviews (review_id),
  metric_key         text,
  kind               text NOT NULL CHECK (kind IN ('action', 'no_action')),
  action             text,
  owner_principal_id uuid,
  due_on             date,
  reason             text NOT NULL CHECK (length(btrim(reason)) >= 8),
  item_id            uuid,
  decided_by         uuid NOT NULL,
  decided_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT arf_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT arf_kind CHECK (CASE kind WHEN 'action' THEN length(btrim(coalesce(action, ''))) BETWEEN 8 AND 500 AND owner_principal_id IS NOT NULL AND due_on IS NOT NULL
                                       ELSE action IS NULL AND owner_principal_id IS NULL AND due_on IS NULL AND item_id IS NULL END)
);
CREATE INDEX arf_review ON analytics.review_followups (review_id, decided_at);

/* THE REVIEW'S LEDGER (append-only): every governed act on a review. */
CREATE TABLE analytics.review_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  review_id          uuid NOT NULL REFERENCES analytics.operating_reviews (review_id),
  event              text NOT NULL CHECK (event ~ '^review\.[a-z_]+$'),
  actor_principal_id uuid NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT are_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX are_review ON analytics.review_events (review_id, occurred_at);

/* THE GUARD of a review: never deleted; a closed review never changes; the facts never change; the state moves forward only. */
CREATE OR REPLACE FUNCTION analytics.aor_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = analytics, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'operating review rejected (state): an operating review is never deleted' USING ERRCODE = '22023'; END IF;
  IF OLD.state = 'closed' THEN RAISE EXCEPTION 'operating review rejected (state): review % is closed and immutable', OLD.review_id USING ERRCODE = '22023'; END IF;
  IF (NEW.review_id, NEW.scope, NEW.tenant_id, NEW.domain_id, NEW.title, NEW.period_key, NEW.period_kind, NEW.window_from, NEW.window_to, NEW.scope_id, NEW.scope_key, NEW.scope_version,
      NEW.metric_keys, NEW.chair_principal_id, NEW.participant_roles, NEW.created_by, NEW.created_at)
     IS DISTINCT FROM
     (OLD.review_id, OLD.scope, OLD.tenant_id, OLD.domain_id, OLD.title, OLD.period_key, OLD.period_kind, OLD.window_from, OLD.window_to, OLD.scope_id, OLD.scope_key, OLD.scope_version,
      OLD.metric_keys, OLD.chair_principal_id, OLD.participant_roles, OLD.created_by, OLD.created_at) THEN
    RAISE EXCEPTION 'operating review rejected (state): the facts of review % (title, period, scope, metrics, chair, participants) never change', OLD.review_id USING ERRCODE = '22023';
  END IF;
  IF NOT ((OLD.state = 'draft' AND NEW.state IN ('draft', 'held')) OR (OLD.state = 'held' AND NEW.state IN ('held', 'closed'))) THEN
    RAISE EXCEPTION 'operating review rejected (state): review % moves draft → held → closed, not % → %', OLD.review_id, OLD.state, NEW.state USING ERRCODE = '22023';
  END IF;
  IF OLD.state <> 'draft' AND NEW.assembly <> OLD.assembly THEN
    RAISE EXCEPTION 'operating review rejected (state): review % is %; its citations are frozen', OLD.review_id, OLD.state USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER aor_guard BEFORE UPDATE OR DELETE ON analytics.operating_reviews FOR EACH ROW EXECUTE FUNCTION analytics.aor_guard();

/* A child row (a citation, a note, a follow-through) is admitted only while its review is open for it: citations in a draft; notes in a draft
   or held review; follow-through in a held review. Never on a closed one (defence in depth — the ports refuse first). */
CREATE OR REPLACE FUNCTION analytics.aor_child_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = analytics, pg_catalog, pg_temp AS $$
DECLARE v_state text;
BEGIN
  SELECT r.state INTO v_state FROM analytics.operating_reviews r WHERE r.review_id = NEW.review_id;
  IF v_state = 'closed' OR (TG_TABLE_NAME = 'review_citations' AND v_state <> 'draft') OR (TG_TABLE_NAME = 'review_followups' AND v_state <> 'held') THEN
    RAISE EXCEPTION 'operating review rejected (state): review % is %; % cannot be added', NEW.review_id, v_state, TG_TABLE_NAME USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER arc_child_guard BEFORE INSERT ON analytics.review_citations FOR EACH ROW EXECUTE FUNCTION analytics.aor_child_guard();
CREATE TRIGGER arn_child_guard BEFORE INSERT ON analytics.review_notes FOR EACH ROW EXECUTE FUNCTION analytics.aor_child_guard();
CREATE TRIGGER arf_child_guard BEFORE INSERT ON analytics.review_followups FOR EACH ROW EXECUTE FUNCTION analytics.aor_child_guard();

CREATE TRIGGER arc_append_only BEFORE UPDATE OR DELETE ON analytics.review_citations FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TRIGGER arn_append_only BEFORE UPDATE OR DELETE ON analytics.review_notes FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TRIGGER arf_append_only BEFORE UPDATE OR DELETE ON analytics.review_followups FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
CREATE TRIGGER are_append_only BEFORE UPDATE OR DELETE ON analytics.review_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- RLS and grants (the prelude's loop idiom): SELECT to eye_app and eye_commit under domain isolation; no write grant — the definer ports write.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['operating_reviews', 'review_citations', 'review_notes', 'review_followups', 'review_events'] LOOP
    EXECUTE format('REVOKE ALL ON analytics.%I FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE analytics.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE analytics.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY domain_isolation ON analytics.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON analytics.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- §OR.2 THE HELPERS (internal) ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* The kind of an ACTIVE principal (human, agent, workload, system), or NULL. */
CREATE OR REPLACE FUNCTION analytics.aor_kind(p_principal uuid) RETURNS text
STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT p.kind FROM identity.principals p WHERE p.id = p_principal AND p.status = 'active'
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION analytics.aor_kind(uuid) FROM PUBLIC;

/* A principal holding one of the roles in the domain (or at the tenant); p_human: and a named, active human of the tenant. */
CREATE OR REPLACE FUNCTION analytics.aor_holds(p_principal uuid, p_tenant uuid, p_domain uuid, p_roles text[], p_human boolean) RETURNS boolean
STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM identity.role_bindings b JOIN identity.principals p ON p.id = b.principal_id
                  WHERE b.principal_id = p_principal AND p.status = 'active' AND b.revoked_at IS NULL AND (NOT p_human OR p.kind = 'human')
                    AND b.role_code = ANY (p_roles) AND b.tenant_id = p_tenant
                    AND ((b.scope = 'DOMAIN' AND b.domain_id = p_domain) OR b.scope = 'TENANT'))
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION analytics.aor_holds(uuid, uuid, uuid, text[], boolean) FROM PUBLIC;

/* The roles a CHAIR holds (D9 / PARTS §OR: an executive, a strategy owner or the product analytics owner). */
CREATE OR REPLACE FUNCTION analytics.aor_chair_roles() RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$ SELECT ARRAY['executive', 'strategy_owner', 'product_analytics_owner'] $$;
GRANT EXECUTE ON FUNCTION analytics.aor_chair_roles() TO eye_app, eye_commit;

/* The acting principal is the one recorded. */
CREATE OR REPLACE FUNCTION analytics.aor_assert_actor(p_actor uuid) RETURNS void
LANGUAGE plpgsql SET search_path = analytics, pg_catalog, pg_temp AS $$
BEGIN
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'operating review rejected (actor): the act is recorded by the acting principal' USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION analytics.aor_assert_actor(uuid) FROM PUBLIC;

/* A NAMED period shifted by n periods of its own kind (quarters or months); NULL for another kind. */
CREATE OR REPLACE FUNCTION analytics.aor_shift_period(p_period text, p_n int) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE v int;
BEGIN
  IF p_period ~ '^[0-9]{4}-Q[1-4]$' THEN
    v := substr(p_period, 1, 4)::int * 4 + (substr(p_period, 7, 1)::int - 1) + p_n;
    RETURN format('%s-Q%s', lpad((v / 4)::text, 4, '0'), (v % 4) + 1);
  ELSIF p_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    v := substr(p_period, 1, 4)::int * 12 + (substr(p_period, 6, 2)::int - 1) + p_n;
    RETURN format('%s-%s', lpad((v / 12)::text, 4, '0'), lpad(((v % 12) + 1)::text, 2, '0'));
  END IF;
  RETURN NULL;
END $$;
GRANT EXECUTE ON FUNCTION analytics.aor_shift_period(text, int) TO eye_app, eye_commit;

/* The review of this domain, locked for the act (unknown → 404). */
CREATE OR REPLACE FUNCTION analytics.aor_review(p_tenant uuid, p_domain uuid, p_review uuid) RETURNS analytics.operating_reviews
LANGUAGE plpgsql SET search_path = analytics, pg_catalog, pg_temp AS $$
DECLARE r analytics.operating_reviews%ROWTYPE;
BEGIN
  SELECT * INTO r FROM analytics.operating_reviews x WHERE x.review_id = p_review AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'operating review rejected (unknown_review): % is not an operating review of this domain', p_review USING ERRCODE = '23503'; END IF;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION analytics.aor_review(uuid, uuid, uuid) FROM PUBLIC;

/* A closed review refuses every edit (409). */
CREATE OR REPLACE FUNCTION analytics.aor_assert_open(r analytics.operating_reviews, p_what text) RETURNS void
LANGUAGE plpgsql SET search_path = analytics, pg_catalog, pg_temp AS $$
BEGIN
  IF r.state = 'closed' THEN
    RAISE EXCEPTION 'operating review rejected (state): review "%" was closed by its chair at % and is immutable — % is refused', r.title, r.closed_at, p_what USING ERRCODE = '22023';
  END IF;
END $$;
REVOKE ALL ON FUNCTION analytics.aor_assert_open(analytics.operating_reviews, text) FROM PUBLIC;

/* The chair alone (a named human) acts. */
CREATE OR REPLACE FUNCTION analytics.aor_assert_chair(r analytics.operating_reviews, p_actor uuid, p_what text) RETURNS void
LANGUAGE plpgsql SET search_path = analytics, pg_catalog, pg_temp AS $$
BEGIN
  IF analytics.aor_kind(p_actor) IS DISTINCT FROM 'human' THEN
    RAISE EXCEPTION 'operating review rejected (actor): only a named human may %; an agent or a system never does', p_what USING ERRCODE = '42501';
  END IF;
  IF p_actor IS DISTINCT FROM r.chair_principal_id THEN
    RAISE EXCEPTION 'operating review rejected (authority): only the chair of review "%" may %', r.title, p_what USING ERRCODE = '42501';
  END IF;
  IF NOT analytics.aor_holds(p_actor, r.tenant_id, r.domain_id, analytics.aor_chair_roles(), true) THEN
    RAISE EXCEPTION 'operating review rejected (authority): the chair no longer holds an executive, strategy-owner or product-analytics-owner role in this domain' USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION analytics.aor_assert_chair(analytics.operating_reviews, uuid, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION analytics.aor_event(r analytics.operating_reviews, p_event text, p_actor uuid, p_details jsonb, p_correlation uuid) RETURNS void
LANGUAGE sql SET search_path = analytics, pg_catalog, pg_temp AS $$
  INSERT INTO analytics.review_events (event_id, scope, tenant_id, domain_id, review_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', r.tenant_id, r.domain_id, r.review_id, p_event, p_actor, coalesce(p_details, '{}'::jsonb), p_correlation)
$$;
REVOKE ALL ON FUNCTION analytics.aor_event(analytics.operating_reviews, text, uuid, jsonb, uuid) FROM PUBLIC;

/* The latest CITABLE result of (metric, period, scope): not a preview, not a replay, the whole population (no cohort). */
CREATE OR REPLACE FUNCTION analytics.aor_latest_result(p_tenant uuid, p_domain uuid, p_metric_key text, p_period text, p_scope_key text) RETURNS analytics.metric_results
LANGUAGE sql STABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
  SELECT x.* FROM analytics.metric_results x
   WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.metric_key = p_metric_key AND x.period_key = p_period
     AND x.scope_key IS NOT DISTINCT FROM p_scope_key AND NOT x.preview AND x.replay_of IS NULL AND x.cohort = '{}'::jsonb
   ORDER BY x.computed_at DESC, x.result_id DESC LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION analytics.aor_latest_result(uuid, uuid, text, text, text) TO eye_app, eye_commit;

/* THE HISTORY ORIGIN of a metric's population (D7 — sparse history explicit): the earliest record instant, in this domain, of the tables the
   metric's REGISTERED computation reads (analytics.computation_registry.reads), each on its first record-time column among recorded_at,
   created_at, raised_at, occurred_at, known_at, committed_at, proposed_at, opened_at, observed_at, and only for a table that carries
   tenant_id and domain_id. The EARLIEST across the tables (conservative: a period is called "no history" only when NO table the computation reads
   holds a record before its end). established = false when no table could be read this way (a period without a result is then "not computed",
   never "no history"). N-01 guarded (SECURITY DEFINER: it reads other schemas' tables, filtered by the bound tenant and domain). */
CREATE OR REPLACE FUNCTION analytics.aor_history_origin(p_tenant uuid, p_domain uuid, p_metric_key text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = analytics, pg_catalog, pg_temp AS $$
DECLARE d analytics.metric_definitions%ROWTYPE; reg analytics.computation_registry%ROWTYPE; t text; v_rel regclass; v_col text; v_min timestamptz; v_best timestamptz;
        v_src text; v_considered jsonb := '[]'::jsonb; v_used int := 0;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the history origin of a product metric');
  SELECT * INTO d FROM analytics.metric_definitions x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.metric_key = p_metric_key
   ORDER BY (x.state = 'approved') DESC, x.version DESC LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('established', false, 'origin', NULL, 'why', format('%s has no definition in this domain', p_metric_key)); END IF;
  IF NOT d.supported THEN RETURN jsonb_build_object('established', false, 'origin', NULL, 'why', format('unsupported: %s', d.unsupported_reason)); END IF;
  SELECT * INTO reg FROM analytics.computation_registry r WHERE r.computation_key = d.computation_key;
  IF NOT FOUND THEN RETURN jsonb_build_object('established', false, 'origin', NULL, 'why', format('the computation %s is not registered', d.computation_key)); END IF;
  FOREACH t IN ARRAY reg.reads LOOP
    v_rel := to_regclass(t); v_col := NULL; v_min := NULL;
    IF v_rel IS NULL OR NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid = v_rel AND c.relkind IN ('r', 'v', 'm', 'p')) THEN
      v_considered := v_considered || jsonb_build_array(jsonb_build_object('table', t, 'used', false, 'why', 'not a table or view')); CONTINUE;
    END IF;
    IF (SELECT count(*) FROM pg_attribute a WHERE a.attrelid = v_rel AND a.attname IN ('tenant_id', 'domain_id') AND NOT a.attisdropped) < 2 THEN
      v_considered := v_considered || jsonb_build_array(jsonb_build_object('table', t, 'used', false, 'why', 'no tenant_id / domain_id columns')); CONTINUE;
    END IF;
    SELECT c.n INTO v_col FROM unnest(ARRAY['recorded_at', 'created_at', 'raised_at', 'occurred_at', 'known_at', 'committed_at', 'proposed_at', 'opened_at', 'observed_at']) WITH ORDINALITY c(n, o)
      JOIN pg_attribute a ON a.attrelid = v_rel AND a.attname = c.n AND NOT a.attisdropped AND a.atttypid IN ('timestamptz'::regtype, 'timestamp'::regtype)
     ORDER BY c.o LIMIT 1;
    IF v_col IS NULL THEN
      v_considered := v_considered || jsonb_build_array(jsonb_build_object('table', t, 'used', false, 'why', 'no record-time column')); CONTINUE;
    END IF;
    EXECUTE format('SELECT min(%I)::timestamptz FROM %s WHERE tenant_id = $1 AND domain_id = $2', v_col, v_rel) INTO v_min USING p_tenant, p_domain;
    v_used := v_used + 1;
    v_considered := v_considered || jsonb_build_array(jsonb_build_object('table', t, 'used', true, 'column', v_col, 'first', v_min));
    IF v_min IS NOT NULL AND (v_best IS NULL OR v_min < v_best) THEN v_best := v_min; v_src := t || '.' || v_col; END IF;
  END LOOP;
  RETURN jsonb_build_object('established', v_used > 0, 'origin', v_best, 'source', v_src, 'considered', v_considered, 'computation_key', reg.computation_key,
    'why', CASE WHEN v_used = 0 THEN 'no table the computation reads carries tenant_id, domain_id and a record-time column' WHEN v_best IS NULL THEN 'the deployment holds no record of the population yet' END,
    'rule', 'the earliest record instant, in this domain, over the tables the registered computation reads');
END $$;
REVOKE ALL ON FUNCTION analytics.aor_history_origin(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.aor_history_origin(uuid, uuid, text) TO eye_app, eye_commit;

/* THE CLOSE DIGEST of a review AS IT STANDS: sha256 over its facts, the cited results' source revisions (the latest assembly), the notes (each
   body digested) and the follow-through. What the chair reads is what the chair signs (the close port recomputes and compares). */
CREATE OR REPLACE FUNCTION analytics.aor_close_body(p_review uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'review_id', r.review_id, 'title', r.title, 'period', r.period_key, 'scope_key', r.scope_key, 'scope_version', r.scope_version, 'metric_keys', to_jsonb(r.metric_keys),
    'chair', r.chair_principal_id, 'participant_roles', to_jsonb(r.participant_roles), 'assembly', r.assembly,
    'citations', coalesce((SELECT jsonb_agg(jsonb_build_object('metric_key', c.metric_key, 'status', c.status, 'result_id', c.result_id, 'source_revision', m.source_revision,
                                                               'state', m.state, 'value', m.value, 'n', m.n, 'definition_version', m.definition_version) ORDER BY c.ordinal)
                           FROM analytics.review_citations c LEFT JOIN analytics.metric_results m ON m.result_id = c.result_id
                          WHERE c.review_id = r.review_id AND c.assembly = r.assembly), '[]'::jsonb),
    'notes', coalesce((SELECT jsonb_agg(jsonb_build_object('note_id', n.note_id, 'metric_key', n.metric_key, 'author', n.author_principal_id,
                                                           'body_digest', encode(sha256(convert_to(n.body, 'UTF8')), 'hex')) ORDER BY n.created_at, n.note_id)
                       FROM analytics.review_notes n WHERE n.review_id = r.review_id), '[]'::jsonb),
    'followthrough', coalesce((SELECT jsonb_agg(jsonb_build_object('followup_id', f.followup_id, 'metric_key', f.metric_key, 'kind', f.kind, 'action', f.action,
                                                                   'owner', f.owner_principal_id, 'due_on', f.due_on, 'reason', f.reason) ORDER BY f.decided_at, f.followup_id)
                               FROM analytics.review_followups f WHERE f.review_id = r.review_id), '[]'::jsonb))
  FROM analytics.operating_reviews r WHERE r.review_id = p_review
$$;
GRANT EXECUTE ON FUNCTION analytics.aor_close_body(uuid) TO eye_app, eye_commit;

-- §OR.3 THE PORTS ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* OPEN a review (analytics.review.open): a named human (an analyst, the owner, an executive, a strategy owner) opens it for a NAMED calendar
   period (a quarter or a month), an APPROVED scope (or none: the whole domain), 1–20 metric keys each with an APPROVED definition in the domain,
   a CHAIR (a named, active human holding an executive, strategy-owner or product-analytics-owner role here) and the participants' ROLES (role
   codes — never persons). */
CREATE OR REPLACE FUNCTION analytics.open_operating_review(p_review uuid, p_tenant uuid, p_domain uuid, p_title text, p_period text, p_scope_key text, p_metric_keys text[],
                                                          p_chair uuid, p_participant_roles text[], p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE w record; s analytics.scopes%ROWTYPE; k text; v_bad text[]; r analytics.operating_reviews%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.review.open']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.aor_assert_actor(p_actor);
  IF analytics.aor_kind(p_actor) IS DISTINCT FROM 'human' THEN RAISE EXCEPTION 'operating review rejected (actor): a review is opened by a named human' USING ERRCODE = '42501'; END IF;
  IF length(btrim(coalesce(p_title, ''))) NOT BETWEEN 4 AND 200 THEN RAISE EXCEPTION 'operating review rejected (title): a review has a title of 4–200 characters' USING ERRCODE = '22023'; END IF;
  SELECT * INTO w FROM analytics.period_window(p_period);
  IF w.period_kind IS NULL OR w.period_kind NOT IN ('calendar_quarter', 'calendar_month') THEN
    RAISE EXCEPTION 'operating review rejected (period): % is not a named calendar quarter or month (2026-Q3, 2026-09)', coalesce(p_period, '<none>') USING ERRCODE = '22023';
  END IF;
  IF p_scope_key IS NOT NULL THEN
    SELECT * INTO s FROM analytics.scopes x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.scope_key = p_scope_key AND x.state = 'approved';
    IF NOT FOUND THEN RAISE EXCEPTION 'operating review rejected (unknown_scope): % has no approved scope in this domain', p_scope_key USING ERRCODE = '23503'; END IF;
  END IF;
  IF p_metric_keys IS NULL OR cardinality(p_metric_keys) NOT BETWEEN 1 AND 20 OR (SELECT count(DISTINCT x) FROM unnest(p_metric_keys) x) <> cardinality(p_metric_keys) THEN
    RAISE EXCEPTION 'operating review rejected (metrics): a review names 1–20 distinct metric keys' USING ERRCODE = '22023';
  END IF;
  FOREACH k IN ARRAY p_metric_keys LOOP
    IF k IS NULL OR k !~ '^[A-Z][A-Z0-9]{1,9}-[A-Za-z0-9.-]{1,40}$' THEN RAISE EXCEPTION 'operating review rejected (metrics): % is not a metric key (MET-001)', coalesce(k, '<null>') USING ERRCODE = '22023'; END IF;
    IF NOT EXISTS (SELECT 1 FROM analytics.metric_definitions d WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.metric_key = k) THEN
      RAISE EXCEPTION 'operating review rejected (unknown_metric): % has no definition in this domain', k USING ERRCODE = '23503';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM analytics.metric_definitions d WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.metric_key = k AND d.state = 'approved') THEN
      RAISE EXCEPTION 'operating review rejected (state): % has no APPROVED definition in this domain (%): an operating review reviews approved metrics', k,
        (SELECT string_agg(format('v%s %s', d.version, d.state), ', ' ORDER BY d.version) FROM analytics.metric_definitions d WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.metric_key = k) USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF p_chair IS NULL OR NOT analytics.aor_holds(p_chair, p_tenant, p_domain, analytics.aor_chair_roles(), true) THEN
    RAISE EXCEPTION 'operating review rejected (chair): the chair is a named, active human holding an executive, strategy-owner or product-analytics-owner role in this domain' USING ERRCODE = '22023';
  END IF;
  IF p_participant_roles IS NULL OR cardinality(p_participant_roles) NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'operating review rejected (participants): a review names 1–20 participant ROLES (role codes — never persons)' USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(x) INTO v_bad FROM unnest(p_participant_roles) x WHERE NOT EXISTS (SELECT 1 FROM identity.roles ro WHERE ro.code = x);
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'operating review rejected (participants): % are not roles — participants are named by role, never by person', v_bad USING ERRCODE = '22023'; END IF;
  INSERT INTO analytics.operating_reviews (review_id, scope, tenant_id, domain_id, title, period_key, period_kind, window_from, window_to, scope_id, scope_key, scope_version,
                                           metric_keys, chair_principal_id, participant_roles, created_by, correlation_id)
  VALUES (p_review, 'DOMAIN', p_tenant, p_domain, btrim(p_title), p_period, w.period_kind, w.window_from, w.window_to, s.scope_id, s.scope_key, s.version,
          p_metric_keys, p_chair, (SELECT array_agg(DISTINCT x ORDER BY x) FROM unnest(p_participant_roles) x), p_actor, p_correlation)
  RETURNING * INTO r;
  PERFORM analytics.aor_event(r, 'review.opened', p_actor, jsonb_build_object('period', p_period, 'scope_key', s.scope_key, 'scope_version', s.version, 'metric_keys', to_jsonb(p_metric_keys),
                                                                             'chair', p_chair, 'participant_roles', to_jsonb(r.participant_roles)), p_correlation);
  RETURN to_jsonb(r);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.open_operating_review(uuid,uuid,uuid,text,text,text,text[],uuid,text[],uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.open_operating_review(uuid,uuid,uuid,text,text,text,text[],uuid,text[],uuid,uuid) TO eye_commit;

/* ASSEMBLE a draft (analytics.review.assemble): computes NOTHING. Per reviewed metric, in order: the PIN (p_pins {metric_key: result_id}) or
   the latest citable result of (metric, the review's period, the review's scope) — CITED, with an analytics.metric_uses row (used_in_kind
   'operating_review', once per result and review); none → NOT COMPUTED with its reason (a preview that exists is said, never cited). A pinned
   result must be this domain's, of the metric, the period and the scope, the whole population, not a replay — and NEVER A PREVIEW (a result
   computed on a proposed definition for its review is never served as current). Each assembly is a new round; a held or closed review is frozen. */
CREATE OR REPLACE FUNCTION analytics.assemble_operating_review(p_review uuid, p_tenant uuid, p_domain uuid, p_pins jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r analytics.operating_reviews%ROWTYPE; k text; o bigint; m analytics.metric_results%ROWTYPE; v_pin text; v_round int; v_note text; v_cited int := 0; v_missing jsonb := '[]'::jsonb;
        v_previews int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.review.assemble']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.aor_assert_actor(p_actor);
  r := analytics.aor_review(p_tenant, p_domain, p_review);
  IF NOT (analytics.aor_holds(p_actor, p_tenant, p_domain, ARRAY['product_analyst', 'product_analytics_owner'] || analytics.aor_chair_roles(), false) OR p_actor = r.chair_principal_id) THEN
    RAISE EXCEPTION 'operating review rejected (authority): a review is assembled by a product analyst, the product analytics owner or a chair role of this domain' USING ERRCODE = '42501';
  END IF;
  PERFORM analytics.aor_assert_open(r, 'assembling it');
  IF r.state <> 'draft' THEN RAISE EXCEPTION 'operating review rejected (state): review "%" is held; its citations are frozen (assemble a draft)', r.title USING ERRCODE = '22023'; END IF;
  IF p_pins IS NOT NULL AND jsonb_typeof(p_pins) <> 'object' THEN RAISE EXCEPTION 'operating review rejected (request): pins are {metric_key: result_id}' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(coalesce(p_pins, '{}'::jsonb)) x WHERE NOT (x = ANY (r.metric_keys))) THEN
    RAISE EXCEPTION 'operating review rejected (unknown_metric): a pin names a metric the review does not review (%)', (SELECT string_agg(x, ', ') FROM jsonb_object_keys(p_pins) x WHERE NOT (x = ANY (r.metric_keys))) USING ERRCODE = '23503';
  END IF;
  v_round := r.assembly + 1;
  FOR k, o IN SELECT u.k, u.o FROM unnest(r.metric_keys) WITH ORDINALITY u(k, o) LOOP
    m := NULL; v_note := NULL;
    v_pin := p_pins ->> k;
    IF v_pin IS NOT NULL THEN
      IF v_pin !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'operating review rejected (request): the pin of % is a result id', k USING ERRCODE = '22023'; END IF;
      SELECT * INTO m FROM analytics.metric_results x WHERE x.result_id = v_pin::uuid AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
      IF NOT FOUND THEN RAISE EXCEPTION 'operating review rejected (unknown_result): % is not a result of this domain', v_pin USING ERRCODE = '23503'; END IF;
      IF m.preview THEN
        RAISE EXCEPTION 'operating review rejected (preview): result % of % is a PREVIEW computed on a proposed definition (v%) for its review — it is never cited as current', v_pin, k, m.definition_version USING ERRCODE = '22023';
      END IF;
      IF m.replay_of IS NOT NULL THEN RAISE EXCEPTION 'operating review rejected (replay): result % is a replay of %; cite the original', v_pin, m.replay_of USING ERRCODE = '22023'; END IF;
      IF m.metric_key <> k OR m.period_key <> r.period_key OR m.scope_key IS DISTINCT FROM r.scope_key OR m.cohort <> '{}'::jsonb THEN
        RAISE EXCEPTION 'operating review rejected (mismatch): result % is % for % (scope %, cohort %) — the review cites % for % (scope %, the whole population)', v_pin, m.metric_key, m.period_key,
          coalesce(m.scope_key, 'the domain'), m.cohort, k, r.period_key, coalesce(r.scope_key, 'the domain') USING ERRCODE = '22023';
      END IF;
    ELSE
      m := analytics.aor_latest_result(p_tenant, p_domain, k, r.period_key, r.scope_key);
    END IF;
    IF m.result_id IS NULL THEN
      SELECT count(*) INTO v_previews FROM analytics.metric_results x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.metric_key = k AND x.period_key = r.period_key
         AND x.scope_key IS NOT DISTINCT FROM r.scope_key AND x.preview;
      v_note := format('not computed: no result of %s for %s (%s) has been computed yet%s', k, r.period_key, coalesce('scope ' || r.scope_key, 'the whole domain'),
                       CASE WHEN v_previews > 0 THEN format(' — %s preview result(s) on a proposed definition exist and are never cited as current', v_previews) ELSE '' END);
      INSERT INTO analytics.review_citations (review_id, assembly, ordinal, tenant_id, domain_id, metric_key, status, result_id, pinned, note)
      VALUES (r.review_id, v_round, o, p_tenant, p_domain, k, 'not_computed', NULL, false, v_note);
      v_missing := v_missing || to_jsonb(k);
    ELSE
      INSERT INTO analytics.review_citations (review_id, assembly, ordinal, tenant_id, domain_id, metric_key, status, result_id, pinned, note)
      VALUES (r.review_id, v_round, o, p_tenant, p_domain, k, 'cited', m.result_id, v_pin IS NOT NULL, NULL);
      INSERT INTO analytics.metric_uses (use_id, scope, tenant_id, domain_id, result_id, used_in_kind, used_in_id, note, used_by, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, m.result_id, 'operating_review', r.review_id, format('cited by the operating review "%s" (%s, assembly %s)', r.title, r.period_key, v_round), p_actor, p_correlation)
      ON CONFLICT (result_id, used_in_kind, used_in_id) DO NOTHING;
      v_cited := v_cited + 1;
    END IF;
  END LOOP;
  UPDATE analytics.operating_reviews SET assembly = v_round, assembled_at = clock_timestamp(), assembled_by = p_actor WHERE review_id = r.review_id RETURNING * INTO r;
  PERFORM analytics.aor_event(r, 'review.assembled', p_actor, jsonb_build_object('assembly', v_round, 'cited', v_cited, 'not_computed', v_missing, 'pins', coalesce(p_pins, '{}'::jsonb)), p_correlation);
  RETURN to_jsonb(r) || jsonb_build_object('cited', v_cited, 'not_computed', v_missing,
    'citations', (SELECT jsonb_agg(to_jsonb(c) - 'tenant_id' - 'domain_id' ORDER BY c.ordinal) FROM analytics.review_citations c WHERE c.review_id = r.review_id AND c.assembly = v_round));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.assemble_operating_review(uuid,uuid,uuid,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.assemble_operating_review(uuid,uuid,uuid,jsonb,uuid,uuid) TO eye_commit;

/* HOLD (analytics.review.hold, human-gated): the chair holds an ASSEMBLED draft — the meeting takes place over a fixed set of citations. */
CREATE OR REPLACE FUNCTION analytics.hold_operating_review(p_review uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r analytics.operating_reviews%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.review.hold']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.aor_assert_actor(p_actor);
  r := analytics.aor_review(p_tenant, p_domain, p_review);
  PERFORM analytics.aor_assert_chair(r, p_actor, 'hold the review');
  PERFORM analytics.aor_assert_open(r, 'holding it');
  IF r.state <> 'draft' THEN RAISE EXCEPTION 'operating review rejected (state): review "%" is already held', r.title USING ERRCODE = '22023'; END IF;
  IF r.assembly = 0 THEN RAISE EXCEPTION 'operating review rejected (state): review "%" has not been assembled — its results are cited before it is held', r.title USING ERRCODE = '22023'; END IF;
  UPDATE analytics.operating_reviews SET state = 'held', held_at = clock_timestamp(), held_by = p_actor WHERE review_id = r.review_id RETURNING * INTO r;
  PERFORM analytics.aor_event(r, 'review.held', p_actor, jsonb_build_object('assembly', r.assembly), p_correlation);
  RETURN to_jsonb(r);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.hold_operating_review(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.hold_operating_review(uuid,uuid,uuid,uuid,uuid) TO eye_commit;

/* NOTE (analytics.review.note): a discussion note on the review (or one of its metrics) by a named human — the chair or a holder of one of the
   review's participant roles. A draft or held review; never a closed one. */
CREATE OR REPLACE FUNCTION analytics.note_operating_review(p_note uuid, p_review uuid, p_tenant uuid, p_domain uuid, p_metric_key text, p_body text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r analytics.operating_reviews%ROWTYPE; n analytics.review_notes%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.review.note']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.aor_assert_actor(p_actor);
  r := analytics.aor_review(p_tenant, p_domain, p_review);
  IF analytics.aor_kind(p_actor) IS DISTINCT FROM 'human' THEN RAISE EXCEPTION 'operating review rejected (actor): a review note is a named human''s' USING ERRCODE = '42501'; END IF;
  IF NOT (p_actor = r.chair_principal_id OR analytics.aor_holds(p_actor, p_tenant, p_domain, r.participant_roles, true)) THEN
    RAISE EXCEPTION 'operating review rejected (authority): notes on review "%" are the chair''s and the participants'' (roles %)', r.title, array_to_string(r.participant_roles, ', ') USING ERRCODE = '42501';
  END IF;
  PERFORM analytics.aor_assert_open(r, 'a note');
  IF p_metric_key IS NOT NULL AND NOT (p_metric_key = ANY (r.metric_keys)) THEN
    RAISE EXCEPTION 'operating review rejected (unknown_metric): review "%" does not review %', r.title, p_metric_key USING ERRCODE = '23503';
  END IF;
  IF length(btrim(coalesce(p_body, ''))) NOT BETWEEN 4 AND 4000 THEN RAISE EXCEPTION 'operating review rejected (note): a note has 4–4000 characters' USING ERRCODE = '22023'; END IF;
  INSERT INTO analytics.review_notes (note_id, scope, tenant_id, domain_id, review_id, metric_key, body, author_principal_id, correlation_id)
  VALUES (p_note, 'DOMAIN', p_tenant, p_domain, r.review_id, p_metric_key, btrim(p_body), p_actor, p_correlation) RETURNING * INTO n;
  PERFORM analytics.aor_event(r, 'review.noted', p_actor, jsonb_build_object('note_id', p_note, 'metric_key', p_metric_key), p_correlation);
  RETURN to_jsonb(n);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.note_operating_review(uuid,uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.note_operating_review(uuid,uuid,uuid,uuid,text,text,uuid,uuid) TO eye_commit;

/* DECIDE the follow-through (analytics.review.decide, human-gated): the CHAIR alone, on a HELD review, per metric (or for the review as a whole):
   an ACTION — its text, a named owner (an active human of the tenant: accountability for routing on this record, never an aggregate per
   person), a due date not in the past — routed as an `analytics.metric` attention item to that owner under the domain's published policy; or
   NO ACTION with its reason. Never automatic, never punitive (App M Action control). */
CREATE OR REPLACE FUNCTION analytics.decide_operating_review(p_followup uuid, p_review uuid, p_tenant uuid, p_domain uuid, p_metric_key text, p_kind text, p_action text, p_owner uuid,
                                                            p_due date, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r analytics.operating_reviews%ROWTYPE; f analytics.review_followups%ROWTYPE; v_item jsonb := NULL;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.review.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.aor_assert_actor(p_actor);
  r := analytics.aor_review(p_tenant, p_domain, p_review);
  PERFORM analytics.aor_assert_chair(r, p_actor, 'decide the follow-through');
  PERFORM analytics.aor_assert_open(r, 'a follow-through decision');
  IF r.state <> 'held' THEN RAISE EXCEPTION 'operating review rejected (state): review "%" is a draft; the follow-through is decided once it is held', r.title USING ERRCODE = '22023'; END IF;
  IF p_metric_key IS NOT NULL AND NOT (p_metric_key = ANY (r.metric_keys)) THEN
    RAISE EXCEPTION 'operating review rejected (unknown_metric): review "%" does not review %', r.title, p_metric_key USING ERRCODE = '23503';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('action', 'no_action') THEN RAISE EXCEPTION 'operating review rejected (kind): the follow-through is an action or no_action' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'operating review rejected (reason): a follow-through states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_kind = 'action' THEN
    IF length(btrim(coalesce(p_action, ''))) NOT BETWEEN 8 AND 500 THEN RAISE EXCEPTION 'operating review rejected (action): an action is named in 8–500 characters' USING ERRCODE = '22023'; END IF;
    IF p_owner IS NULL OR NOT decision.is_active_human(p_owner, p_tenant) THEN
      RAISE EXCEPTION 'operating review rejected (owner): an action has a named owner — an active human of the tenant' USING ERRCODE = '22023';
    END IF;
    IF p_due IS NULL OR p_due < (clock_timestamp() AT TIME ZONE 'UTC')::date THEN
      RAISE EXCEPTION 'operating review rejected (due): an action has a due date, today or later (%)', coalesce(p_due::text, '<none>') USING ERRCODE = '22023';
    END IF;
  ELSIF p_action IS NOT NULL OR p_owner IS NOT NULL OR p_due IS NOT NULL THEN
    RAISE EXCEPTION 'operating review rejected (kind): "no action" names no action, owner or due date — its reason says why' USING ERRCODE = '22023';
  END IF;
  IF p_kind = 'action' THEN   -- the item first (its subject is the follow-through's id), so the append-only row records it
    v_item := executive.b33_raise_routed(p_tenant, p_domain, 'analytics.metric', 'operating_review', p_followup,
                format('Follow-through of the operating review "%s"%s: %s (due %s)', r.title, coalesce(' — ' || p_metric_key, ''), btrim(p_action), p_due),
                jsonb_build_array(format('decided by the chair of the %s review: %s', r.period_key, btrim(p_reason)),
                                  'a review workflow decided by a named human — never an automatic or punitive decision'),
                p_owner, p_followup, 'analytics.review.followthrough_decided',
                jsonb_build_object('review_id', r.review_id, 'metric_key', p_metric_key, 'due_on', p_due, 'period', r.period_key), NULL, p_actor, p_correlation);
  END IF;
  INSERT INTO analytics.review_followups (followup_id, scope, tenant_id, domain_id, review_id, metric_key, kind, action, owner_principal_id, due_on, reason, item_id, decided_by, correlation_id)
  VALUES (p_followup, 'DOMAIN', p_tenant, p_domain, r.review_id, p_metric_key, p_kind, CASE WHEN p_kind = 'action' THEN btrim(p_action) END, p_owner, p_due, btrim(p_reason),
          (v_item ->> 'item_id')::uuid, p_actor, p_correlation);
  SELECT * INTO f FROM analytics.review_followups x WHERE x.followup_id = p_followup;
  PERFORM analytics.aor_event(r, 'review.followthrough_decided', p_actor, jsonb_build_object('followup_id', p_followup, 'metric_key', p_metric_key, 'kind', p_kind, 'owner', p_owner,
                                                                                            'due_on', p_due, 'item', v_item), p_correlation);
  RETURN to_jsonb(f) || jsonb_build_object('item', v_item);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.decide_operating_review(uuid,uuid,uuid,uuid,text,text,text,uuid,date,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.decide_operating_review(uuid,uuid,uuid,uuid,text,text,text,uuid,date,text,uuid,uuid) TO eye_commit;

/* CLOSE (analytics.review.close, human-gated): THE CHAIR'S SIGNED CLOSE. The chair alone, on a HELD review whose every metric has a
   follow-through decision (an action or "no action" — nothing passes silently), signs the digest it READ (analytics.aor_close_body: the cited
   results' source revisions, the notes, the follow-through); a digest that no longer matches the review is STALE (409). The review is then
   immutable; its open `analytics.metric` items of subject the review are closed (the follow-through items stay with their owners). */
CREATE OR REPLACE FUNCTION analytics.close_operating_review(p_review uuid, p_tenant uuid, p_domain uuid, p_digest text, p_statement text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = analytics, observation, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r analytics.operating_reviews%ROWTYPE; v_body jsonb; v_digest text; v_open text[]; v_closed jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['analytics.review.close']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM analytics.aor_assert_actor(p_actor);
  r := analytics.aor_review(p_tenant, p_domain, p_review);
  PERFORM analytics.aor_assert_chair(r, p_actor, 'close the review');
  PERFORM analytics.aor_assert_open(r, 'closing it again');
  IF r.state <> 'held' THEN RAISE EXCEPTION 'operating review rejected (state): review "%" is a draft; it is held, discussed and decided before the chair closes it', r.title USING ERRCODE = '22023'; END IF;
  SELECT array_agg(k ORDER BY o) INTO v_open FROM unnest(r.metric_keys) WITH ORDINALITY u(k, o)
   WHERE NOT EXISTS (SELECT 1 FROM analytics.review_followups f WHERE f.review_id = r.review_id AND f.metric_key = u.k);
  IF v_open IS NOT NULL THEN
    RAISE EXCEPTION 'operating review rejected (followthrough): % have no follow-through decision yet — an action with its owner and due date, or "no action" with its reason', array_to_string(v_open, ', ') USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_statement, ''))) < 8 THEN RAISE EXCEPTION 'operating review rejected (statement): the close carries the chair''s statement (8+ characters)' USING ERRCODE = '22023'; END IF;
  v_body := analytics.aor_close_body(r.review_id);
  v_digest := analytics.digest(v_body);
  IF p_digest IS DISTINCT FROM v_digest THEN
    RAISE EXCEPTION 'operating review rejected (stale): the review now digests to %…, not the one read and signed (%…) — read it again', left(v_digest, 12), left(coalesce(p_digest, '<none>'), 12) USING ERRCODE = '22023';
  END IF;
  UPDATE analytics.operating_reviews SET state = 'closed', close_digest = v_digest, close_statement = btrim(p_statement), closed_by = p_actor, closed_at = clock_timestamp()
   WHERE review_id = r.review_id RETURNING * INTO r;
  v_closed := executive.b33_close_items(p_tenant, p_domain, 'analytics.metric', 'operating_review', r.review_id, format('the operating review "%s" was closed by its chair', r.title), p_actor, p_correlation);
  PERFORM analytics.aor_event(r, 'review.closed', p_actor, jsonb_build_object('digest', v_digest, 'statement', btrim(p_statement), 'items_closed', v_closed), p_correlation);
  RETURN to_jsonb(r) || jsonb_build_object('signed_body', v_body);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION analytics.close_operating_review(uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics.close_operating_review(uuid,uuid,uuid,text,text,uuid,uuid) TO eye_commit;

-- §OR.4 THE READS (INVOKER, under the caller's RLS; analytics.read) ────────────────────────────────────────────────────────────────────────
/* THE SERIES of a metric for a scope: the p_count periods (1–12, of p_through's kind) ending with p_through (default: the last complete quarter
   by the database's clock) — EVERY period listed, oldest first:
     computed     — the latest citable result (its state: determinate with value and interval, or indeterminate / unsupported with its reasons —
                    never 0), with its drill-down;
     not_computed — no result yet (a preview on a proposed definition is said, never shown as the value);
     no_history   — no result and the period ends before the deployment's first record of the metric's population: INDETERMINATE, "no history
                    (the deployment holds no records before <date>)" — sparse history explicit, never a blank or a zero.
   The definition versions behind the computed periods are listed: periods computed on different versions are NOT comparable (said). */
CREATE OR REPLACE FUNCTION analytics.review_series(p_tenant uuid, p_domain uuid, p_metric_key text, p_scope_key text, p_through text, p_count int) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
DECLARE v_through text := p_through; v_count int := coalesce(p_count, 4); v_now timestamptz := clock_timestamp(); v_origin jsonb; v_o timestamptz; v_est boolean;
        i int; v_p text; w record; m analytics.metric_results%ROWTYPE; v_prev int; v_periods jsonb := '[]'::jsonb; v_versions int[] := '{}';
BEGIN
  IF v_through IS NULL THEN
    v_through := analytics.aor_shift_period(format('%s-Q%s', extract(year FROM v_now AT TIME ZONE 'UTC')::int, ((extract(month FROM v_now AT TIME ZONE 'UTC')::int - 1) / 3) + 1), -1);
  END IF;
  IF analytics.aor_shift_period(v_through, 0) IS NULL THEN
    RAISE EXCEPTION 'operating review rejected (period): the series runs through a named calendar quarter or month (2026-Q3, 2026-09), not %', v_through USING ERRCODE = '22023';
  END IF;
  IF v_count NOT BETWEEN 1 AND 12 THEN RAISE EXCEPTION 'operating review rejected (request): a series has 1–12 periods' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM analytics.metric_definitions d WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.metric_key = p_metric_key) THEN
    RAISE EXCEPTION 'operating review rejected (unknown_metric): % has no definition in this domain', p_metric_key USING ERRCODE = '23503';
  END IF;
  v_origin := analytics.aor_history_origin(p_tenant, p_domain, p_metric_key);
  v_est := coalesce((v_origin ->> 'established')::boolean, false); v_o := (v_origin ->> 'origin')::timestamptz;
  FOR i IN REVERSE (v_count - 1)..0 LOOP
    v_p := analytics.aor_shift_period(v_through, -i);
    SELECT * INTO w FROM analytics.period_window(v_p);
    m := analytics.aor_latest_result(p_tenant, p_domain, p_metric_key, v_p, p_scope_key);
    IF m.result_id IS NOT NULL THEN
      v_versions := v_versions || m.definition_version;
      v_periods := v_periods || jsonb_build_array(jsonb_build_object('period', v_p, 'window_from', w.window_from, 'window_to', w.window_to, 'status', 'computed',
        'result_id', m.result_id, 'state', m.state, 'value', m.value, 'unit', m.unit, 'kind', m.kind, 'n', m.n, 'numerator', m.numerator, 'denominator', m.denominator,
        'uncertainty', m.uncertainty, 'distribution', m.distribution, 'reasons', m.reasons, 'threshold_eval', m.threshold_eval, 'definition_version', m.definition_version,
        'clock', m.clock, 'as_of', m.as_of, 'computed_at', m.computed_at, 'records_count', m.records_count,
        'before_history', v_est AND (v_o IS NULL OR w.window_to <= v_o),
        'drilldown', jsonb_build_object('result_id', m.result_id, 'route', format('results/%s/read', m.result_id))));
    ELSIF v_est AND (v_o IS NULL OR w.window_to <= v_o) THEN
      v_periods := v_periods || jsonb_build_array(jsonb_build_object('period', v_p, 'window_from', w.window_from, 'window_to', w.window_to, 'status', 'no_history',
        'state', 'indeterminate', 'value', NULL, 'n', NULL,
        'reasons', jsonb_build_array(CASE WHEN v_o IS NULL THEN 'no history: the deployment holds no records of this metric''s population yet'
                                          ELSE format('no history: the deployment holds no records before %s (%s)', to_char(v_o AT TIME ZONE 'UTC', 'YYYY-MM-DD'), v_origin ->> 'source') END)));
    ELSE
      SELECT count(*) INTO v_prev FROM analytics.metric_results x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.metric_key = p_metric_key AND x.period_key = v_p
         AND x.scope_key IS NOT DISTINCT FROM p_scope_key AND x.preview;
      v_periods := v_periods || jsonb_build_array(jsonb_build_object('period', v_p, 'window_from', w.window_from, 'window_to', w.window_to, 'status', 'not_computed',
        'state', NULL, 'value', NULL, 'n', NULL, 'previews', v_prev,
        'reasons', jsonb_build_array(format('not computed: no result of %s for %s has been computed yet%s%s', p_metric_key, v_p,
                                            CASE WHEN v_prev > 0 THEN format(' (%s preview(s) on a proposed definition, never shown as the value)', v_prev) ELSE '' END,
                                            CASE WHEN NOT v_est THEN format(' — the history origin could not be established (%s)', v_origin ->> 'why') ELSE '' END))));
    END IF;
  END LOOP;
  RETURN jsonb_build_object('metric_key', p_metric_key, 'scope_key', p_scope_key, 'through', v_through, 'count', v_count, 'history', v_origin,
    'definition_versions', (SELECT coalesce(jsonb_agg(DISTINCT x), '[]'::jsonb) FROM unnest(v_versions) x),
    'comparable', (SELECT count(DISTINCT x) FROM unnest(v_versions) x) <= 1,
    'comparability_note', CASE WHEN (SELECT count(DISTINCT x) FROM unnest(v_versions) x) > 1
                               THEN 'the computed periods rest on different definition versions: they are not comparable as one series' END,
    'periods', v_periods);
END $$;
GRANT EXECUTE ON FUNCTION analytics.review_series(uuid, uuid, text, text, text, int) TO eye_app, eye_commit;

/* THE REVIEW READ: the review, its chair (named on the record for accountability), per metric — the definition the cited result names (or the
   approved one), the citation (cited / not computed with its reason), the result (value or the explained state, n, interval, window, clock,
   scope, threshold evaluation, records by role) with its DRILL-DOWN (results/:id/read), the series (4 periods through the review's period) —
   the notes, the follow-through (with its attention item's state now), the ledger, and the signature: the close digest, verified by
   recomputing it, and the digest a close would sign NOW (what the chair reads is what the chair signs). */
CREATE OR REPLACE FUNCTION analytics.operating_review_read(p_review uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = analytics, pg_catalog, pg_temp AS $$
  SELECT to_jsonb(r) - 'tenant_id' - 'domain_id' || jsonb_build_object(
    'chair_name', (SELECT p.display_name FROM identity.principals p WHERE p.id = r.chair_principal_id),
    'scope_row', (SELECT to_jsonb(s) - 'tenant_id' - 'domain_id' FROM analytics.scopes s WHERE s.scope_id = r.scope_id),
    'metrics', (SELECT coalesce(jsonb_agg(z.v ORDER BY z.o), '[]'::jsonb) FROM (
      SELECT u.o, jsonb_build_object(
        'metric_key', u.k, 'ordinal', u.o,
        'citation', (SELECT to_jsonb(c) - 'tenant_id' - 'domain_id' FROM analytics.review_citations c WHERE c.review_id = r.review_id AND c.assembly = r.assembly AND c.metric_key = u.k),
        'definition', (SELECT to_jsonb(d) - 'tenant_id' - 'domain_id' || jsonb_build_object('owner_name', (SELECT p.display_name FROM identity.principals p WHERE p.id = d.owner_principal_id))
                         FROM analytics.metric_definitions d
                        WHERE d.tenant_id = r.tenant_id AND d.domain_id = r.domain_id AND d.metric_key = u.k
                        ORDER BY (d.definition_id = (SELECT m.definition_id FROM analytics.review_citations c JOIN analytics.metric_results m ON m.result_id = c.result_id
                                                     WHERE c.review_id = r.review_id AND c.assembly = r.assembly AND c.metric_key = u.k)) DESC NULLS LAST,
                                 (d.state = 'approved') DESC, d.version DESC LIMIT 1),
        'definition_current_version', (SELECT d.version FROM analytics.metric_definitions d WHERE d.tenant_id = r.tenant_id AND d.domain_id = r.domain_id AND d.metric_key = u.k AND d.state = 'approved'),
        'result', (SELECT to_jsonb(m) - 'tenant_id' - 'domain_id' || jsonb_build_object(
                            'records_by_role', coalesce((SELECT jsonb_object_agg(q.role, q.c) FROM (SELECT rr.role, count(*) c FROM analytics.result_records rr WHERE rr.result_id = m.result_id GROUP BY rr.role) q), '{}'::jsonb),
                            'drilldown', jsonb_build_object('result_id', m.result_id, 'route', format('results/%s/read', m.result_id)))
                     FROM analytics.review_citations c JOIN analytics.metric_results m ON m.result_id = c.result_id
                    WHERE c.review_id = r.review_id AND c.assembly = r.assembly AND c.metric_key = u.k),
        'series', analytics.review_series(r.tenant_id, r.domain_id, u.k, r.scope_key, r.period_key, 4)) AS v
      FROM unnest(r.metric_keys) WITH ORDINALITY u(k, o)) z),
    'notes', coalesce((SELECT jsonb_agg(to_jsonb(n) - 'tenant_id' - 'domain_id' || jsonb_build_object('author_name', (SELECT p.display_name FROM identity.principals p WHERE p.id = n.author_principal_id))
                                        ORDER BY n.created_at, n.note_id) FROM analytics.review_notes n WHERE n.review_id = r.review_id), '[]'::jsonb),
    'followthrough', coalesce((SELECT jsonb_agg(to_jsonb(f) - 'tenant_id' - 'domain_id' || jsonb_build_object(
                                 'owner_name', (SELECT p.display_name FROM identity.principals p WHERE p.id = f.owner_principal_id),
                                 'item', (SELECT jsonb_build_object('item_id', i.item_id, 'state', i.state, 'route_roles', to_jsonb(i.route_roles), 'due_at', i.due_at)
                                            FROM executive.attention_items i WHERE i.tenant_id = r.tenant_id AND i.domain_id = r.domain_id AND i.subject_id = f.followup_id
                                             AND i.signal_class = 'analytics.metric' ORDER BY i.created_at DESC LIMIT 1))
                                 ORDER BY f.decided_at, f.followup_id) FROM analytics.review_followups f WHERE f.review_id = r.review_id), '[]'::jsonb),
    'events', coalesce((SELECT jsonb_agg(jsonb_build_object('event', e.event, 'occurred_at', e.occurred_at, 'actor_principal_id', e.actor_principal_id, 'details', e.details) ORDER BY e.occurred_at, e.event_id)
                        FROM analytics.review_events e WHERE e.review_id = r.review_id), '[]'::jsonb),
    'uses', (SELECT count(*) FROM analytics.metric_uses u WHERE u.used_in_kind = 'operating_review' AND u.used_in_id = r.review_id),
    'digest_now', analytics.digest(analytics.aor_close_body(r.review_id)),
    'signature', CASE WHEN r.state = 'closed' THEN jsonb_build_object('digest', r.close_digest, 'statement', r.close_statement, 'closed_by', r.closed_by, 'closed_at', r.closed_at,
                                                                      'closed_by_name', (SELECT p.display_name FROM identity.principals p WHERE p.id = r.closed_by),
                                                                      'verified', analytics.digest(analytics.aor_close_body(r.review_id)) = r.close_digest,
                                                                      'kind', 'digest-bound close by the named chair (not an Ed25519 signature)') END)
  FROM analytics.operating_reviews r WHERE r.review_id = p_review
$$;
GRANT EXECUTE ON FUNCTION analytics.operating_review_read(uuid) TO eye_app, eye_commit;
