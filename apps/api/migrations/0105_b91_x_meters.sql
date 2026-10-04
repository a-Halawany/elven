-- ═════════════════════════════════════════════════════════════════════
-- section `meters` (§ME) — CP-6 B91 part `meters` (F-P7-F-02: the meters per tenant, capability and profile; caps; B90's carryover)
-- ═════════════════════════════════════════════════════════════════════
-- THE METERS. Every recording point writes commercial.usage_records ONLY (the prelude's append-only table), through ONE internal writer
-- (commercial.cme_record) that is idempotent on the table's unique key (tenant, dimension, source_kind, source_ref): a recording point that
-- fires twice for the same source records once. NO existing event list changes; no existing table gains a column. The recording points:
--   model_inference    AFTER INSERT ON intelligence.gateway_calls — one CALL per gateway call (unit calls; the latency, the mode, the model
--                      and the outcome in the details). NO TOKEN COUNT EXISTS: the gateway records no tokens and no cost today (0023), so
--                      inference is metered in calls; a replayed call is metered as a call with its mode `replay` stated.
--   source_consumption AFTER INSERT ON observation.collection_run_events — a terminal event that carries the run's spent budget
--                      (run.finished: details.budget_spent) records the run's REQUESTS (unit requests) and its BYTES (unit bytes, its own
--                      source kind collection_run_bytes). A run.budget_exceeded / run.failed event carries no spent figures today and
--                      is not metered (stated).
--   simulation_compute AFTER UPDATE ON simulation.experiment_chunks — every recorded chunk ATTEMPT (finished_at newly set; done or failed)
--                      records its wall ms (unit wall_ms; the paths and the attempt in the details); AFTER UPDATE ON
--                      simulation.runs_current — a run COMPLETED from opened with its resource records resource.elapsed_ms, unless the
--                      run is an experiment's (its chunks are already metered: never twice); the B30 ENVELOPE SWEEP — its route measures
--                      the sweep's wall ms and records it through the port commercial.record_usage (the sweep table records none).
--   storage            the tick step `commercial-storage-sample` (order 80) — the domain's EVIDENCE bytes (hot and archive tiers of the
--                      evidence vault, tombstoned blobs excluded), measured BY THE PORT (commercial.record_usage, source kind
--                      storage_sample) once per domain per hour of the database's clock. A gauge: a cap compares the latest sample.
--   product_consumption (B90's CARRYOVER) — AFTER INSERT ON products.metric_servings (unit servings) and ON products.subscription_catchups
--                      (unit events: the batch served), and products.read_subscription_events RE-DECLARED (copied whole from 0096; its
--                      plain read writes no row any trigger could see — the only way the read path is reached in the database); each
--                      also INCREMENTS products.product_consumers.usage of the live registration (product, consumer) when one exists
--                      (no registration: the usage record alone — the register is the consumer's own act, never created here).
-- THE CAPS: commercial.caps — per tenant (or one of its domains) × dimension × unit × period (day | month, UTC calendar), a limit and an
-- action stop | warn, VERSIONED (a new version supersedes the live one); set by the tenant's ADMINISTRATOR (a named human holding
-- tenant_admin; never an agent) within the licence's limits (the prelude's commercial.licences: a cap above the latest licence version's
-- limit for the dimension is refused; an UNCONTRACTED tenant has no licence and its cap is bounded by nothing but itself). `stop` is admitted
-- only where an ADMISSION point enforces it — simulation_compute (the experiment chunk claim and the envelope sweep route); every other
-- dimension's cap is `warn` (model_inference above all: a stop at the gateway would refuse an extraction mid-run). commercial.cap_breaches —
-- the ledger: `crossed` (the meter reached the cap in its period: once per cap version and period, commercial.usage raised) and `refused`
-- (new work stopped at admission, commercial.usage raised). THE BOUNDARY: a cap stops NEW work; it never deletes work — an experiment it
-- stops ends PARTIAL with its completed paths kept (or failed when none completed), recorded and explained; a sweep it refuses never ran.
-- No cap set → nothing changes (the claim and the sweep behave exactly as before).

-- §ME.1 THE TABLES ─────────────────────────────────────────────────────
CREATE TABLE commercial.caps (
  cap_id          uuid NOT NULL,
  version         int  NOT NULL CHECK (version >= 1),
  scope           text NOT NULL CHECK (scope IN ('TENANT', 'DOMAIN')),
  tenant_id       uuid NOT NULL REFERENCES tenancy.tenants(id),
  domain_id       uuid NULL,
  dimension       text NOT NULL CHECK (dimension IN ('model_inference', 'source_consumption', 'storage', 'simulation_compute', 'product_consumption')),
  unit            text NOT NULL CHECK (unit IN ('calls', 'requests', 'bytes', 'wall_ms', 'events', 'servings')),
  period          text NOT NULL CHECK (period IN ('day', 'month')),
  cap_limit       numeric NOT NULL CHECK (cap_limit > 0),
  action          text NOT NULL CHECK (action IN ('stop', 'warn')),
  state           text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'superseded')),
  licence_id      uuid NULL,
  licence_version int  NULL,
  licence_limit   numeric NULL,
  reason          text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 1000),
  set_by          uuid NOT NULL,
  set_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  superseded_at   timestamptz NULL,
  correlation_id  uuid NOT NULL,
  PRIMARY KEY (cap_id, version),
  CHECK ((scope = 'TENANT') = (domain_id IS NULL)),
  CHECK ((state = 'superseded') = (superseded_at IS NOT NULL)),
  CHECK (action = 'warn' OR dimension = 'simulation_compute'),
  CHECK ((licence_id IS NULL) = (licence_version IS NULL))
);
CREATE UNIQUE INDEX cme_caps_live_once ON commercial.caps (tenant_id, coalesce(domain_id, '00000000-0000-0000-0000-000000000000'::uuid), dimension, unit, period) WHERE state = 'active';
CREATE INDEX cme_caps_tenant ON commercial.caps (tenant_id, dimension, unit, state);
COMMENT ON TABLE commercial.caps IS 'B91 §ME (0105): usage caps per tenant (or domain) × dimension × unit × period, a limit and stop|warn, versioned; set by the tenant administrator within the licence''s limits. A cap stops NEW work at admission; it never deletes work.';

CREATE TABLE commercial.cap_breaches (
  breach_id       uuid PRIMARY KEY,
  scope           text NOT NULL CHECK (scope IN ('TENANT', 'DOMAIN')),
  tenant_id       uuid NOT NULL REFERENCES tenancy.tenants(id),
  domain_id       uuid NULL,
  cap_id          uuid NOT NULL,
  cap_version     int  NOT NULL,
  dimension       text NOT NULL,
  unit            text NOT NULL,
  period          text NOT NULL,
  period_start    timestamptz NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('crossed', 'refused')),
  action          text NOT NULL CHECK (action IN ('stop', 'warn')),
  cap_limit       numeric NOT NULL,
  used            numeric NOT NULL,
  subject_kind    text NOT NULL CHECK (subject_kind IN ('meter', 'experiment', 'envelope_sweep')),
  subject_id      uuid NULL,
  source_ref      text NULL,
  attention_item_id uuid NULL,
  details         jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  actor_principal_id uuid NULL,
  occurred_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NULL,
  CHECK ((scope = 'TENANT') = (domain_id IS NULL)),
  FOREIGN KEY (cap_id, cap_version) REFERENCES commercial.caps (cap_id, version)
);
CREATE UNIQUE INDEX cme_breach_crossed_once ON commercial.cap_breaches (cap_id, cap_version, period_start) WHERE kind = 'crossed';
CREATE INDEX cme_breach_tenant ON commercial.cap_breaches (tenant_id, occurred_at DESC);
CREATE TRIGGER cme_breach_append_only BEFORE UPDATE OR DELETE ON commercial.cap_breaches FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE commercial.cap_breaches IS 'B91 §ME (0105): the cap ledger — crossed (the meter reached the cap in its period; once per cap version and period) and refused (new work stopped at admission: an experiment ended partial, a sweep never ran). Append-only.';

/* A cap version is immutable but for its retirement by the next version (active → superseded, once); never deleted. */
CREATE OR REPLACE FUNCTION commercial.cme_caps_forward() RETURNS trigger
LANGUAGE plpgsql SET search_path = commercial, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'usage cap rejected (state): a cap version is never deleted' USING ERRCODE = '2F002'; END IF;
  IF OLD.state <> 'active' OR NEW.state <> 'superseded' OR NEW.superseded_at IS NULL
     OR (to_jsonb(NEW) - 'state' - 'superseded_at') IS DISTINCT FROM (to_jsonb(OLD) - 'state' - 'superseded_at') THEN
    RAISE EXCEPTION 'usage cap rejected (state): a cap version changes only by its supersession (active → superseded)' USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER cme_caps_forward BEFORE UPDATE OR DELETE ON commercial.caps FOR EACH ROW EXECUTE FUNCTION commercial.cme_caps_forward();

-- RLS (the prelude's commercial_isolation text, verbatim: a domain reader sees its domain's rows and the tenant's own); the ports write.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['caps', 'cap_breaches'] LOOP
    EXECUTE format('REVOKE ALL ON commercial.%I FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE commercial.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE commercial.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY commercial_isolation ON commercial.%I
        USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id IS NULL OR domain_id = public.eye_domain()))$f$, t);
    EXECUTE format('GRANT SELECT ON commercial.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- §ME.2 THE VOCABULARY AND THE INTERNAL HELPERS (not granted: called by the triggers and the ports only) ───────────
/* The units a dimension is metered in (the first is its primary unit — a licence limit given as a bare number is in it). */
CREATE OR REPLACE FUNCTION commercial.cme_units(p_dimension text) RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_dimension WHEN 'model_inference' THEN ARRAY['calls'] WHEN 'source_consumption' THEN ARRAY['requests', 'bytes'] WHEN 'simulation_compute' THEN ARRAY['wall_ms']
                          WHEN 'storage' THEN ARRAY['bytes'] WHEN 'product_consumption' THEN ARRAY['events', 'servings'] END
$$;
/* The capability a dimension is metered against (§EN's catalogue keys are the integrator's seam; these are the meter's own labels). */
CREATE OR REPLACE FUNCTION commercial.cme_capability(p_dimension text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_dimension WHEN 'model_inference' THEN 'intelligence' WHEN 'source_consumption' THEN 'observation' WHEN 'simulation_compute' THEN 'simulation'
                          WHEN 'storage' THEN 'storage' WHEN 'product_consumption' THEN 'data_products' END
$$;
/* The start of the period an instant falls in (the UTC calendar day or month). */
CREATE OR REPLACE FUNCTION commercial.cme_period_start(p_period text, p_at timestamptz) RETURNS timestamptz
LANGUAGE sql IMMUTABLE AS $$ SELECT date_trunc(p_period, p_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' $$;
/* The licence a tenant is entitled by: its latest version that is not superseded (none: UNCONTRACTED). */
CREATE OR REPLACE FUNCTION commercial.cme_licence(p_tenant uuid) RETURNS commercial.licences
LANGUAGE sql STABLE SET search_path = commercial, pg_catalog, pg_temp AS $$
  SELECT l.* FROM commercial.licences l WHERE l.tenant_id = p_tenant AND l.state <> 'superseded' ORDER BY l.version DESC LIMIT 1
$$;
/* The licence's limit for a dimension and unit: limits -> dimension as a number (in the dimension's primary unit) or as an object
   {<unit>: number}; NULL when the licence names none (the seam §EN's issue_licence writes; stated for the integrator). */
CREATE OR REPLACE FUNCTION commercial.cme_licence_limit(p_limits jsonb, p_dimension text, p_unit text) RETURNS numeric
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE jsonb_typeof(p_limits -> p_dimension)
           WHEN 'number' THEN CASE WHEN p_unit = (commercial.cme_units(p_dimension))[1] THEN (p_limits ->> p_dimension)::numeric END
           WHEN 'object' THEN CASE WHEN jsonb_typeof(p_limits -> p_dimension -> p_unit) = 'number' THEN (p_limits -> p_dimension ->> p_unit)::numeric END
         END
$$;
/* The usage of a meter since an instant: the sum of the records (a gauge — storage — the latest sample per domain, summed). p_domain NULL:
   the whole tenant. Read by the definer ports and reads (their owner reads every row). */
CREATE OR REPLACE FUNCTION commercial.cme_used(p_tenant uuid, p_domain uuid, p_dimension text, p_unit text, p_since timestamptz) RETURNS numeric
LANGUAGE sql STABLE SET search_path = commercial, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN p_dimension = 'storage' THEN
    coalesce((SELECT sum(s.q) FROM (SELECT DISTINCT ON (u.domain_id) u.quantity AS q FROM commercial.usage_records u
                                     WHERE u.tenant_id = p_tenant AND (p_domain IS NULL OR u.domain_id = p_domain) AND u.dimension = 'storage' AND u.unit = p_unit AND u.occurred_at >= p_since
                                     ORDER BY u.domain_id, u.occurred_at DESC, u.recorded_at DESC) s), 0)
  ELSE coalesce((SELECT sum(u.quantity) FROM commercial.usage_records u
                  WHERE u.tenant_id = p_tenant AND (p_domain IS NULL OR u.domain_id = p_domain) AND u.dimension = p_dimension AND u.unit = p_unit AND u.occurred_at >= p_since), 0) END
$$;
/* A cap's standing now: its period, the usage in it (the tenant's for a tenant cap, the domain's for a domain cap), the remaining, reached. */
CREATE OR REPLACE FUNCTION commercial.cme_cap_json(c commercial.caps) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = commercial, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('cap_id', c.cap_id, 'version', c.version, 'scope', c.scope, 'domain_id', c.domain_id, 'dimension', c.dimension, 'unit', c.unit, 'period', c.period,
                            'limit', c.cap_limit, 'action', c.action, 'state', c.state, 'licence', CASE WHEN c.licence_id IS NULL THEN NULL ELSE jsonb_build_object('licence_id', c.licence_id, 'version', c.licence_version, 'limit', c.licence_limit) END,
                            'reason', c.reason, 'set_by', c.set_by, 'set_at', c.set_at, 'period_start', p.s, 'used', u.used, 'remaining', greatest(c.cap_limit - u.used, 0), 'reached', u.used >= c.cap_limit)
    FROM (SELECT commercial.cme_period_start(c.period, clock_timestamp()) AS s) p
    CROSS JOIN LATERAL (SELECT commercial.cme_used(c.tenant_id, c.domain_id, c.dimension, c.unit, p.s) AS used) u
$$;
/* THE ONE WRITER of usage_records (idempotent on the unique key). Answers the record's id, or NULL when the source was already recorded. */
CREATE OR REPLACE FUNCTION commercial.cme_record(p_tenant uuid, p_domain uuid, p_dimension text, p_unit text, p_quantity numeric, p_source_kind text, p_source_ref text,
                                                 p_details jsonb, p_occurred_at timestamptz, p_correlation uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = commercial, pg_catalog, pg_temp AS $$
DECLARE v uuid := gen_random_uuid(); v_profile text;
BEGIN
  SELECT coalesce(d.residency_profile, t.residency_profile, 'local-dev') INTO v_profile FROM tenancy.tenants t LEFT JOIN tenancy.domains d ON d.id = p_domain AND d.tenant_id = t.id WHERE t.id = p_tenant;
  INSERT INTO commercial.usage_records (usage_id, scope, tenant_id, domain_id, capability_key, dimension, unit, quantity, profile, source_kind, source_ref, details, occurred_at, correlation_id)
  VALUES (v, CASE WHEN p_domain IS NULL THEN 'TENANT' ELSE 'DOMAIN' END, p_tenant, p_domain, commercial.cme_capability(p_dimension), p_dimension, p_unit, greatest(coalesce(p_quantity, 0), 0),
          coalesce(v_profile, 'local-dev'), p_source_kind, left(p_source_ref, 200), coalesce(p_details, '{}'::jsonb), coalesce(p_occurred_at, clock_timestamp()), p_correlation)
  ON CONFLICT (tenant_id, dimension, source_kind, source_ref) DO NOTHING;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION commercial.cme_record(uuid, uuid, text, text, numeric, text, text, jsonb, timestamptz, uuid) FROM PUBLIC;

/* THE NOTICE: commercial.usage, subject the cap (kind meter), owned by the administrator who set it (open when an active human) and routed
   to the tenant's administrators; its cause the breach row (the 0099 §O sio_notify idiom). */
CREATE OR REPLACE FUNCTION commercial.cme_notify(c commercial.caps, p_domain uuid, p_breach uuid, p_cause_type text, p_title text, p_reasons jsonb, p_details jsonb, p_actor uuid, p_correlation uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = executive, identity, decision, pg_catalog, pg_temp AS $$
DECLARE v_item uuid := gen_random_uuid(); v_state text; v_due timestamptz := clock_timestamp() + interval '24 hours'; v_corr uuid := coalesce(p_correlation, gen_random_uuid());
BEGIN
  v_state := CASE WHEN decision.is_active_human(c.set_by, c.tenant_id) OR executive.role_holders(c.tenant_id, p_domain, ARRAY['tenant_admin']) > 0 THEN 'open' ELSE 'unrouted' END;
  INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state, owner_principal_id, route_roles, evaluation, details, due_at, escalations, correlation_id)
  VALUES (v_item, 'DOMAIN', c.tenant_id, p_domain, 'commercial.usage', 'meter', c.cap_id, p_breach, p_cause_type, left(p_title, 512), 'material', v_state,
          CASE WHEN decision.is_active_human(c.set_by, c.tenant_id) THEN c.set_by END, ARRAY['tenant_admin'],
          jsonb_build_object('outcome', 'material', 'reasons', p_reasons, 'policy_version', NULL, 'dimensions', jsonb_build_object('consequence', 'C2', 'confidence', 1)),
          jsonb_build_object('cap_id', c.cap_id, 'cap_version', c.version, 'dimension', c.dimension, 'unit', c.unit, 'period', c.period, 'limit', c.cap_limit, 'action', c.action, 'breach_id', p_breach) || coalesce(p_details, '{}'::jsonb),
          v_due, 0, v_corr);
  PERFORM executive.attention_event(v_item, c.tenant_id, p_domain, CASE v_state WHEN 'open' THEN 'item.routed' ELSE 'item.unrouted' END, p_actor,
            jsonb_build_object('outcome', 'material', 'reasons', p_reasons, 'policy_version', NULL, 'owner', c.set_by, 'route_roles', to_jsonb(ARRAY['tenant_admin']), 'due_at', v_due,
                               'cause_event_id', p_breach, 'cause_event_type', p_cause_type, 'unrouted', v_state = 'unrouted', 'cap_id', c.cap_id), v_corr);
  RETURN v_item;
END $$;
REVOKE ALL ON FUNCTION commercial.cme_notify(commercial.caps, uuid, uuid, text, text, jsonb, jsonb, uuid, uuid) FROM PUBLIC;

/* THE BREACH: the ledger row and the notice. `crossed` is recorded once per cap version and period (a second crossing in the period answers
   NULL and raises nothing); `refused` once per refusal. p_domain: where the usage or the stopped work lives (the notice's domain). */
CREATE OR REPLACE FUNCTION commercial.cme_breach(c commercial.caps, p_kind text, p_used numeric, p_domain uuid, p_subject_kind text, p_subject_id uuid, p_source_ref text,
                                                 p_details jsonb, p_actor uuid, p_correlation uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = commercial, pg_catalog, pg_temp AS $$
DECLARE v uuid := gen_random_uuid(); v_start timestamptz := commercial.cme_period_start(c.period, clock_timestamp()); v_item uuid; v_actor uuid := coalesce(p_actor, public.eye_principal(), c.set_by);
        v_what text;
BEGIN
  INSERT INTO commercial.cap_breaches (breach_id, scope, tenant_id, domain_id, cap_id, cap_version, dimension, unit, period, period_start, kind, action, cap_limit, used, subject_kind, subject_id, source_ref, details, actor_principal_id, correlation_id)
  VALUES (v, c.scope, c.tenant_id, c.domain_id, c.cap_id, c.version, c.dimension, c.unit, c.period, v_start, p_kind, c.action, c.cap_limit, p_used, p_subject_kind, p_subject_id, left(p_source_ref, 200),
          coalesce(p_details, '{}'::jsonb), v_actor, p_correlation)
  ON CONFLICT (cap_id, cap_version, period_start) WHERE kind = 'crossed' DO NOTHING;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF p_domain IS NOT NULL THEN
    v_what := CASE p_kind WHEN 'crossed' THEN format('Usage cap reached: %s %s %s of %s this %s (%s)', c.dimension, p_used, c.unit, c.cap_limit, c.period, CASE c.action WHEN 'stop' THEN 'new work stops at admission' ELSE 'a warning; nothing is stopped' END)
                          ELSE format('Usage cap stopped new work: %s %s of %s %s this %s — the %s was not continued', c.dimension, p_used, c.cap_limit, c.unit, c.period, replace(p_subject_kind, '_', ' ')) END;
    v_item := commercial.cme_notify(c, p_domain, v, 'usage.cap_' || p_kind, v_what,
                jsonb_build_array(format('the %s cap (%s) is %s %s per %s; used %s since %s', c.dimension, c.action, c.cap_limit, c.unit, c.period, p_used, v_start),
                                  CASE WHEN p_kind = 'refused' THEN 'no work was deleted: completed work is kept; the stopped work is recorded with the cap as its reason' ELSE 'the cap is the tenant administrator''s; raising it or the period''s turn admits new work again' END),
                jsonb_build_object('kind', p_kind, 'used', p_used, 'period_start', v_start, 'subject_kind', p_subject_kind, 'subject_id', p_subject_id), v_actor, p_correlation);
    -- the ledger row is append-only: the notice is named by its cause (the breach id) instead of written back
  END IF;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION commercial.cme_breach(commercial.caps, text, numeric, uuid, text, uuid, text, jsonb, uuid, uuid) FROM PUBLIC;

/* The first STOP cap of the tenant (or of this domain) on a dimension that is reached in its period: the cap and its usage, or NULL. */
CREATE OR REPLACE FUNCTION commercial.cme_reached_stop(p_tenant uuid, p_domain uuid, p_dimension text) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = commercial, pg_catalog, pg_temp AS $$
  SELECT j FROM (SELECT commercial.cme_cap_json(c) AS j, c.domain_id FROM commercial.caps c
                  WHERE c.tenant_id = p_tenant AND c.state = 'active' AND c.action = 'stop' AND c.dimension = p_dimension AND (c.domain_id IS NULL OR c.domain_id = p_domain)) x
   WHERE (x.j ->> 'reached')::boolean ORDER BY x.domain_id NULLS FIRST, x.j ->> 'cap_id' LIMIT 1
$$;

-- §ME.3 THE CROSSING (AFTER INSERT ON usage_records): every live cap the new record counts towards is re-read; reached → `crossed`, once
-- per cap version and period (the notice raised then). The record itself is never refused here: metering records, admission stops.
CREATE OR REPLACE FUNCTION commercial.cme_usage_crossing() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = commercial, pg_catalog, pg_temp AS $$
DECLARE c commercial.caps%ROWTYPE; v_used numeric; v_start timestamptz;
BEGIN
  FOR c IN SELECT * FROM commercial.caps x WHERE x.tenant_id = NEW.tenant_id AND x.state = 'active' AND x.dimension = NEW.dimension AND x.unit = NEW.unit
                                            AND (x.domain_id IS NULL OR x.domain_id = NEW.domain_id) ORDER BY x.domain_id NULLS FIRST, x.cap_id LOOP
    v_start := commercial.cme_period_start(c.period, clock_timestamp());
    CONTINUE WHEN NEW.occurred_at < v_start;
    v_used := commercial.cme_used(c.tenant_id, c.domain_id, c.dimension, c.unit, v_start);
    IF v_used >= c.cap_limit THEN
      PERFORM commercial.cme_breach(c, 'crossed', v_used, coalesce(NEW.domain_id, c.domain_id), 'meter', c.cap_id, NEW.source_kind || ':' || NEW.source_ref,
                                    jsonb_build_object('usage_id', NEW.usage_id, 'source_kind', NEW.source_kind, 'source_ref', NEW.source_ref, 'quantity', NEW.quantity), NULL, NEW.correlation_id);
    END IF;
  END LOOP;
  RETURN NULL;
END $$;
CREATE TRIGGER cme_usage_crossing AFTER INSERT ON commercial.usage_records FOR EACH ROW EXECUTE FUNCTION commercial.cme_usage_crossing();

-- §ME.4 THE RECORDING POINTS (AFTER triggers; definer; usage_records ONLY) ───────────────────────────────────
/* model_inference: one call per gateway call (NO TOKENS EXIST: the gateway records none). */
CREATE OR REPLACE FUNCTION commercial.cme_gateway_call_usage() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = commercial, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM commercial.cme_record(NEW.tenant_id, NEW.domain_id, 'model_inference', 'calls', 1, 'gateway_call', NEW.call_id::text,
            jsonb_build_object('latency_ms', NEW.latency_ms, 'mode', NEW.mode, 'model_id', NEW.model_id, 'outcome', NEW.outcome, 'run_id', NEW.run_id, 'method_id', NEW.method_id,
                               'tokens', NULL, 'tokens_note', 'the gateway records no token counts; inference is metered in calls'), NEW.occurred_at, NEW.correlation_id);
  RETURN NULL;
END $$;
CREATE TRIGGER cme_gateway_call_usage AFTER INSERT ON intelligence.gateway_calls FOR EACH ROW EXECUTE FUNCTION commercial.cme_gateway_call_usage();

/* source_consumption: a terminal run event carrying the spent budget → the requests and the bytes. */
CREATE OR REPLACE FUNCTION commercial.cme_collection_run_usage() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = commercial, pg_catalog, pg_temp AS $$
DECLARE v_spent jsonb := NEW.details -> 'budget_spent'; v_det jsonb;
BEGIN
  IF jsonb_typeof(v_spent) <> 'object' THEN RETURN NULL; END IF;
  v_det := jsonb_build_object('run_id', NEW.run_id, 'source_id', NEW.source_id, 'event', NEW.event, 'connector', NEW.connector, 'acquisition_mode', NEW.acquisition_mode,
                              'elapsed_ms', v_spent -> 'elapsedMs', 'admitted', NEW.details -> 'admitted', 'bytes_stored', NEW.details -> 'bytes_stored');
  PERFORM commercial.cme_record(NEW.tenant_id, NEW.domain_id, 'source_consumption', 'requests', coalesce((v_spent ->> 'requests')::numeric, 0), 'collection_run', NEW.run_id::text,
            v_det, NEW.occurred_at, NEW.correlation_id);
  PERFORM commercial.cme_record(NEW.tenant_id, NEW.domain_id, 'source_consumption', 'bytes', coalesce((v_spent ->> 'bytes')::numeric, 0), 'collection_run_bytes', NEW.run_id::text,
            v_det, NEW.occurred_at, NEW.correlation_id);
  RETURN NULL;
END $$;
CREATE TRIGGER cme_collection_run_usage AFTER INSERT ON observation.collection_run_events FOR EACH ROW
  WHEN (NEW.event = 'run.finished') EXECUTE FUNCTION commercial.cme_collection_run_usage();

/* simulation_compute: every recorded chunk attempt (finished_at newly set) → its wall ms. */
CREATE OR REPLACE FUNCTION commercial.cme_chunk_usage() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = commercial, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM commercial.cme_record(NEW.tenant_id, NEW.domain_id, 'simulation_compute', 'wall_ms', greatest(NEW.wall_ms, 0), 'experiment_chunk',
            NEW.experiment_id::text || ':' || NEW.chunk_index || ':' || NEW.attempts,
            jsonb_build_object('experiment_id', NEW.experiment_id, 'chunk_index', NEW.chunk_index, 'attempt', NEW.attempts, 'paths', NEW.paths, 'outcome', NEW.state), NEW.finished_at, NULL);
  RETURN NULL;
END $$;
CREATE TRIGGER cme_chunk_usage AFTER UPDATE ON simulation.experiment_chunks FOR EACH ROW
  WHEN (NEW.finished_at IS NOT NULL AND NEW.finished_at IS DISTINCT FROM OLD.finished_at AND NEW.wall_ms IS NOT NULL) EXECUTE FUNCTION commercial.cme_chunk_usage();

/* simulation_compute: a run completed with its resource (not an experiment's: its chunks are metered). */
CREATE OR REPLACE FUNCTION commercial.cme_run_usage() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = commercial, pg_catalog, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM simulation.experiments e WHERE e.run_id = NEW.run_id) THEN RETURN NULL; END IF;
  PERFORM commercial.cme_record(NEW.tenant_id, NEW.domain_id, 'simulation_compute', 'wall_ms', round(coalesce((NEW.resource ->> 'elapsed_ms')::numeric, 0)), 'simulation_run', NEW.run_id::text,
            jsonb_build_object('run_id', NEW.run_id, 'model_ref', NEW.model_ref, 'samples_run', NEW.resource -> 'samples_run', 'samples', NEW.samples), coalesce(NEW.completed_at, clock_timestamp()), NULL);
  RETURN NULL;
END $$;
CREATE TRIGGER cme_run_usage AFTER UPDATE OF state ON simulation.runs_current FOR EACH ROW
  WHEN (OLD.state = 'opened' AND NEW.state = 'completed' AND NEW.resource IS NOT NULL) EXECUTE FUNCTION commercial.cme_run_usage();

/* product_consumption and B90's CARRYOVER: the usage record and the live registration's counter (product, consumer). */
CREATE OR REPLACE FUNCTION commercial.cme_product_consumption(p_tenant uuid, p_domain uuid, p_product uuid, p_consumer uuid, p_kind text, p_quantity numeric, p_source_ref text,
                                                              p_details jsonb, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = commercial, products, pg_catalog, pg_temp AS $$
DECLARE v_unit text := CASE p_kind WHEN 'metric_serving' THEN 'servings' ELSE 'events' END; v_usage uuid; v_consumer uuid; v_counter text;
BEGIN
  v_usage := commercial.cme_record(p_tenant, p_domain, 'product_consumption', v_unit, CASE p_kind WHEN 'metric_serving' THEN 1 ELSE greatest(coalesce(p_quantity, 0), 0) END, p_kind, p_source_ref,
               coalesce(p_details, '{}'::jsonb) || jsonb_build_object('product_id', p_product, 'consumer_principal_id', p_consumer), clock_timestamp(), p_correlation);
  IF v_usage IS NULL THEN RETURN jsonb_build_object('recorded', false); END IF;   -- recorded once: never counted twice
  v_counter := CASE p_kind WHEN 'metric_serving' THEN 'metric_servings' WHEN 'subscription_read' THEN 'subscription_reads' ELSE 'catch_ups' END;
  UPDATE products.product_consumers pc
     SET usage = pc.usage || jsonb_build_object(v_counter, coalesce((pc.usage ->> v_counter)::bigint, 0) + 1)
                          || CASE WHEN p_kind <> 'metric_serving' THEN jsonb_build_object('events_served', coalesce((pc.usage ->> 'events_served')::bigint, 0) + greatest(coalesce(p_quantity, 0), 0)::bigint) ELSE '{}'::jsonb END
                          || jsonb_build_object('last_consumed_at', clock_timestamp(), 'metered_by', 'B91 §ME (0105)')
   WHERE pc.product_id = p_product AND pc.consumer_principal_id = p_consumer AND pc.state IN ('registered', 'accepted')
  RETURNING pc.consumer_id INTO v_consumer;
  RETURN jsonb_build_object('recorded', true, 'usage_id', v_usage, 'consumer_id', v_consumer);
END $$;
REVOKE ALL ON FUNCTION commercial.cme_product_consumption(uuid, uuid, uuid, uuid, text, numeric, text, jsonb, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION commercial.cme_metric_serving_usage() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = commercial, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM commercial.cme_product_consumption(NEW.tenant_id, NEW.domain_id, NEW.model_id, NEW.served_to, 'metric_serving', 1, NEW.serving_id::text,
            jsonb_build_object('serving_id', NEW.serving_id, 'view', NEW.view, 'grain', NEW.grain, 'version', NEW.version, 'certified', NEW.certified, 'source_rows', NEW.source_rows), NEW.correlation_id);
  RETURN NULL;
END $$;
CREATE TRIGGER cme_metric_serving_usage AFTER INSERT ON products.metric_servings FOR EACH ROW EXECUTE FUNCTION commercial.cme_metric_serving_usage();

CREATE OR REPLACE FUNCTION commercial.cme_catchup_usage() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = commercial, products, pg_catalog, pg_temp AS $$
DECLARE v_product uuid;
BEGIN
  SELECT s.product_id INTO v_product FROM products.event_subscriptions s WHERE s.subscription_id = NEW.subscription_id;
  PERFORM commercial.cme_product_consumption(NEW.tenant_id, NEW.domain_id, v_product, NEW.served_to, 'catch_up', NEW.served, NEW.catchup_id::text,
            jsonb_build_object('subscription_id', NEW.subscription_id, 'catchup_id', NEW.catchup_id, 'after', NEW.after_sequence, 'through', NEW.through_sequence), NEW.correlation_id);
  RETURN NULL;
END $$;
CREATE TRIGGER cme_catchup_usage AFTER INSERT ON products.subscription_catchups FOR EACH ROW EXECUTE FUNCTION commercial.cme_catchup_usage();

-- §ME.5 THE PORTS ──────────────────────────────────────────────────────
/* The administrator's standing: an active HUMAN holding tenant_admin at the tenant's scope (never an agent). */
CREATE OR REPLACE FUNCTION commercial.cme_is_tenant_admin(p_principal uuid, p_tenant uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM identity.role_bindings b JOIN identity.principals p ON p.id = b.principal_id
                  WHERE b.principal_id = p_principal AND p.kind = 'human' AND p.status = 'active' AND b.revoked_at IS NULL
                    AND b.role_code = 'tenant_admin' AND b.scope = 'TENANT' AND b.tenant_id = p_tenant)
$$;
REVOKE ALL ON FUNCTION commercial.cme_is_tenant_admin(uuid, uuid) FROM PUBLIC;

/* SET A CAP (commercial.cap.set — the tenant's administrator, human-gated): a new version of the cap on (tenant | domain, dimension, unit,
   period) superseding the live one; within the licence's limit (an uncontracted tenant: bounded by nothing but itself); stop only where an
   admission point enforces it (simulation_compute). Answers the cap with its standing. */
CREATE OR REPLACE FUNCTION commercial.set_cap(p_tenant uuid, p_domain uuid, p_dimension text, p_unit text, p_period text, p_limit numeric, p_action text, p_reason text,
                                              p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = commercial, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_unit text; old commercial.caps%ROWTYPE; c commercial.caps%ROWTYPE; l commercial.licences%ROWTYPE; v_llimit numeric; v_id uuid; v_version int := 1;
BEGIN
  PERFORM observation.assert_authority(ARRAY['commercial.cap.set']);
  IF public.eye_scope() <> 'TENANT' OR public.eye_tenant() IS DISTINCT FROM p_tenant THEN
    RAISE EXCEPTION 'usage cap rejected (scope): a cap is set at the tenant''s own scope by its administrator (bound: %)', public.eye_scope() USING ERRCODE = '42501';
  END IF;
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'usage cap rejected (actor): a cap is set by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT commercial.cme_is_tenant_admin(p_actor, p_tenant) THEN
    RAISE EXCEPTION 'usage cap rejected (authority): a cap is set by a named human administrator of the tenant (tenant_admin); an agent never sets, raises or lifts a cap' USING ERRCODE = '42501';
  END IF;
  IF p_dimension IS NULL OR commercial.cme_units(p_dimension) IS NULL THEN
    RAISE EXCEPTION 'usage cap rejected (dimension): % is not a metered dimension (model_inference, source_consumption, storage, simulation_compute, product_consumption)', coalesce(p_dimension, '<none>') USING ERRCODE = '22023';
  END IF;
  v_unit := coalesce(nullif(btrim(p_unit), ''), (commercial.cme_units(p_dimension))[1]);
  IF NOT (v_unit = ANY (commercial.cme_units(p_dimension))) THEN
    RAISE EXCEPTION 'usage cap rejected (unit): % is metered in %; % is not among them', p_dimension, array_to_string(commercial.cme_units(p_dimension), ', '), v_unit USING ERRCODE = '22023';
  END IF;
  IF p_period IS NULL OR p_period NOT IN ('day', 'month') THEN RAISE EXCEPTION 'usage cap rejected (period): a cap''s period is day or month (the UTC calendar)' USING ERRCODE = '22023'; END IF;
  IF p_limit IS NULL OR p_limit <= 0 THEN RAISE EXCEPTION 'usage cap rejected (limit): the limit is a positive quantity of %', v_unit USING ERRCODE = '22023'; END IF;
  IF p_action IS NULL OR p_action NOT IN ('stop', 'warn') THEN RAISE EXCEPTION 'usage cap rejected (action): a cap''s action is stop or warn' USING ERRCODE = '22023'; END IF;
  IF p_action = 'stop' AND p_dimension <> 'simulation_compute' THEN
    RAISE EXCEPTION 'usage cap rejected (action): a % cap is warn only — % (stop is enforced at admission for simulation_compute: the experiment chunk claim and the envelope sweep)', p_dimension,
      CASE p_dimension WHEN 'model_inference' THEN 'a stop at the gateway would refuse an extraction mid-run' ELSE 'no admission point enforces a stop on it' END USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'usage cap rejected (reason): a cap states its reason (8 characters or more)' USING ERRCODE = '22023'; END IF;
  IF p_domain IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tenancy.domains d WHERE d.id = p_domain AND d.tenant_id = p_tenant) THEN
    RAISE EXCEPTION 'usage cap rejected (unknown_domain): % is not a domain of this tenant', p_domain USING ERRCODE = '22023';
  END IF;
  l := commercial.cme_licence(p_tenant);
  IF l.licence_id IS NOT NULL THEN
    v_llimit := commercial.cme_licence_limit(l.limits, p_dimension, v_unit);
    IF v_llimit IS NOT NULL AND p_limit > v_llimit THEN
      RAISE EXCEPTION 'usage cap rejected (licence): the cap % % per % exceeds the licence v% limit % % — a cap is set within the licence''s limits', p_limit, v_unit, p_period, l.version, v_llimit, v_unit USING ERRCODE = '22023';
    END IF;
  END IF;
  SELECT * INTO old FROM commercial.caps x WHERE x.tenant_id = p_tenant AND x.domain_id IS NOT DISTINCT FROM p_domain AND x.dimension = p_dimension AND x.unit = v_unit AND x.period = p_period AND x.state = 'active' FOR UPDATE;
  IF FOUND THEN
    IF old.cap_limit = p_limit AND old.action = p_action THEN
      RAISE EXCEPTION 'usage cap rejected (unchanged): the % cap (% % per %, %) is already version %', p_dimension, p_limit, v_unit, p_period, p_action, old.version USING ERRCODE = '2F002';
    END IF;
    UPDATE commercial.caps SET state = 'superseded', superseded_at = clock_timestamp() WHERE cap_id = old.cap_id AND version = old.version;
    v_id := old.cap_id; v_version := old.version + 1;
  ELSE
    v_id := gen_random_uuid();
  END IF;
  INSERT INTO commercial.caps (cap_id, version, scope, tenant_id, domain_id, dimension, unit, period, cap_limit, action, state, licence_id, licence_version, licence_limit, reason, set_by, correlation_id)
  VALUES (v_id, v_version, CASE WHEN p_domain IS NULL THEN 'TENANT' ELSE 'DOMAIN' END, p_tenant, p_domain, p_dimension, v_unit, p_period, p_limit, p_action, 'active',
          l.licence_id, CASE WHEN l.licence_id IS NOT NULL THEN l.version END, v_llimit, btrim(p_reason), p_actor, p_correlation)
  RETURNING * INTO c;
  RETURN commercial.cme_cap_json(c) || jsonb_build_object('supersedes', CASE WHEN v_version > 1 THEN v_version - 1 END,
                                                           'licence_bound', CASE WHEN l.licence_id IS NULL THEN 'uncontracted: no licence limit applies; the cap is bounded by nothing but itself'
                                                                                 WHEN v_llimit IS NULL THEN format('licence v%s names no %s limit in %s', l.version, p_dimension, v_unit)
                                                                                 ELSE format('within the licence v%s limit %s %s', l.version, v_llimit, v_unit) END);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION commercial.set_cap(uuid, uuid, text, text, text, numeric, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.set_cap(uuid, uuid, text, text, text, numeric, text, text, uuid, uuid) TO eye_commit;

/* RECORD USAGE (the envelope sweep's route under simulation.sweep.run; the storage tick step under executive.attention.tick): an
   envelope_sweep record names a sweep of this domain requested by the actor, its quantity the route's measured wall ms; a storage_sample's
   quantity is MEASURED BY THE PORT (the domain's evidence bytes; a caller's figure is refused), once per domain per hour. Idempotent. */
CREATE OR REPLACE FUNCTION commercial.record_usage(p_tenant uuid, p_domain uuid, p_source_kind text, p_source_ref text, p_quantity numeric, p_details jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = commercial, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_action text; v_usage uuid; v_ref text; v_hot bigint; v_archive bigint; v_n int; v_det jsonb; v_q numeric;
BEGIN
  v_action := observation.assert_authority(ARRAY['simulation.sweep.run', 'executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'usage record rejected (actor): usage is recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_source_kind = 'envelope_sweep' AND v_action = 'simulation.sweep.run' THEN
    IF p_source_ref IS NULL OR p_source_ref !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR NOT EXISTS (SELECT 1 FROM simulation.envelope_sweeps s WHERE s.sweep_id = p_source_ref::uuid AND s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.requested_by = p_actor) THEN
      RAISE EXCEPTION 'usage record rejected (unknown_sweep): % is not an envelope sweep of this domain requested by the actor', coalesce(p_source_ref, '<none>') USING ERRCODE = '22023';
    END IF;
    IF p_quantity IS NULL OR p_quantity < 0 THEN RAISE EXCEPTION 'usage record rejected (quantity): a sweep''s wall time is a non-negative number of milliseconds' USING ERRCODE = '22023'; END IF;
    v_ref := p_source_ref; v_q := round(p_quantity);
    v_usage := commercial.cme_record(p_tenant, p_domain, 'simulation_compute', 'wall_ms', v_q, 'envelope_sweep', v_ref, coalesce(p_details, '{}'::jsonb) || jsonb_build_object('sweep_id', p_source_ref, 'measured_by', 'the sweep route'),
                                     clock_timestamp(), p_correlation);
    RETURN jsonb_build_object('recorded', v_usage IS NOT NULL, 'usage_id', v_usage, 'dimension', 'simulation_compute', 'unit', 'wall_ms', 'quantity', v_q, 'source_kind', 'envelope_sweep', 'source_ref', v_ref);
  ELSIF p_source_kind = 'storage_sample' AND v_action = 'executive.attention.tick' THEN
    IF p_quantity IS NOT NULL THEN RAISE EXCEPTION 'usage record rejected (quantity): a storage sample is measured by the port; the caller names no figure' USING ERRCODE = '22023'; END IF;
    SELECT coalesce(sum(m.byte_length) FILTER (WHERE t.tier = 'hot'), 0)::bigint, coalesce(sum(m.byte_length) FILTER (WHERE t.tier = 'archive'), 0)::bigint, count(*)::int
      INTO v_hot, v_archive, v_n
      FROM observation.blob_manifests m CROSS JOIN LATERAL (SELECT observation.manifest_tier(m.manifest_id) AS tier) t
     WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain AND m.vault = 'evidence'
       AND NOT EXISTS (SELECT 1 FROM observation.blob_tombstones x WHERE x.manifest_id = m.manifest_id);
    v_ref := p_domain::text || ':' || to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24');
    v_det := jsonb_build_object('hot_bytes', v_hot, 'archive_bytes', v_archive, 'manifests', v_n, 'vault', 'evidence', 'sampled_at', clock_timestamp(), 'gauge', true);
    v_usage := commercial.cme_record(p_tenant, p_domain, 'storage', 'bytes', v_hot + v_archive, 'storage_sample', v_ref, v_det, clock_timestamp(), p_correlation);
    RETURN jsonb_build_object('recorded', v_usage IS NOT NULL, 'usage_id', v_usage, 'dimension', 'storage', 'unit', 'bytes', 'quantity', v_hot + v_archive, 'source_kind', 'storage_sample', 'source_ref', v_ref) || v_det;
  END IF;
  RAISE EXCEPTION 'usage record rejected (source): % is not recorded under % (envelope_sweep under simulation.sweep.run; storage_sample under the attention tick)', coalesce(p_source_kind, '<none>'), v_action USING ERRCODE = '22023';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION commercial.record_usage(uuid, uuid, text, text, numeric, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.record_usage(uuid, uuid, text, text, numeric, jsonb, uuid, uuid) TO eye_commit;

/* RECORD A CAP BREACH (the envelope sweep's route, simulation.sweep.run): the sweep was REFUSED before running because a stop cap on
   simulation_compute is reached — the `refused` row and the notice, in the route's own committed write (the refusal then answered 409).
   Refused (state) when no stop cap is reached: a breach is never recorded for work that was admissible. */
CREATE OR REPLACE FUNCTION commercial.record_cap_breach(p_tenant uuid, p_domain uuid, p_dimension text, p_subject_kind text, p_subject_id uuid, p_details jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = commercial, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_cap jsonb; c commercial.caps%ROWTYPE; v_breach uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.sweep.run']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'usage cap rejected (actor): a breach is recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_dimension IS DISTINCT FROM 'simulation_compute' OR p_subject_kind IS DISTINCT FROM 'envelope_sweep' THEN
    RAISE EXCEPTION 'usage cap rejected (source): the sweep route records a simulation_compute breach of an envelope sweep' USING ERRCODE = '22023';
  END IF;
  v_cap := commercial.cme_reached_stop(p_tenant, p_domain, p_dimension);
  IF v_cap IS NULL THEN RAISE EXCEPTION 'usage cap rejected (state): no stop cap on % is reached for this domain; nothing was refused', p_dimension USING ERRCODE = '2F002'; END IF;
  SELECT * INTO c FROM commercial.caps x WHERE x.cap_id = (v_cap ->> 'cap_id')::uuid AND x.version = (v_cap ->> 'version')::int;
  v_breach := commercial.cme_breach(c, 'refused', (v_cap ->> 'used')::numeric, p_domain, p_subject_kind, p_subject_id, NULL, coalesce(p_details, '{}'::jsonb) || jsonb_build_object('cap', v_cap), p_actor, p_correlation);
  RETURN jsonb_build_object('breach_id', v_breach, 'kind', 'refused', 'cap', v_cap, 'subject_kind', p_subject_kind, 'subject_id', p_subject_id,
                            'explanation', format('usage cap rejected (cap): the tenant''s %s cap (%s %s per %s, stop) is reached — %s used since %s; the sweep did not run and nothing was deleted',
                                                  p_dimension, v_cap ->> 'limit', v_cap ->> 'unit', v_cap ->> 'period', v_cap ->> 'used', v_cap ->> 'period_start'));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION commercial.record_cap_breach(uuid, uuid, text, text, uuid, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.record_cap_breach(uuid, uuid, text, text, uuid, jsonb, uuid, uuid) TO eye_commit;

-- §ME.6 THE READS (guarded definers: N-01's assert_read_scope on the tenant/domain arguments) ─────────────────
/* commercial.cap_status(tenant, domain, dimension): the live caps that bound the domain's (or, domain NULL, the tenant's) usage on a dimension
   (every dimension when NULL), each with its period, usage, remaining and whether it is reached; and the first reached STOP cap. */
CREATE OR REPLACE FUNCTION commercial.cap_status(p_tenant uuid, p_domain uuid, p_dimension text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = commercial, observation, public, pg_catalog, pg_temp AS $$
DECLARE v jsonb;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the usage caps');
  SELECT coalesce(jsonb_agg(commercial.cme_cap_json(c) ORDER BY c.dimension, c.unit, c.period, c.domain_id NULLS FIRST), '[]'::jsonb) INTO v
    FROM commercial.caps c WHERE c.tenant_id = p_tenant AND c.state = 'active' AND (p_dimension IS NULL OR c.dimension = p_dimension)
     AND (c.domain_id IS NULL OR (p_domain IS NULL AND public.eye_scope() = 'TENANT') OR c.domain_id = p_domain);
  RETURN jsonb_build_object('tenant_id', p_tenant, 'domain_id', p_domain, 'dimension', p_dimension, 'caps', v,
                            'stop', CASE WHEN p_dimension IS NOT NULL THEN commercial.cme_reached_stop(p_tenant, p_domain, p_dimension) END, 'at', clock_timestamp());
END $$;
REVOKE ALL ON FUNCTION commercial.cap_status(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.cap_status(uuid, uuid, text) TO eye_app, eye_commit;

/* commercial.usage_summary(tenant, domain): the meters (per dimension and unit: today, this month, all time; per domain for a tenant read),
   the caps with their standing, the breaches, the latest records, the licence that bounds the caps (or uncontracted), and what is not
   metered (stated). */
CREATE OR REPLACE FUNCTION commercial.usage_summary(p_tenant uuid, p_domain uuid, p_limit int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = commercial, observation, public, pg_catalog, pg_temp AS $$
DECLARE v_day timestamptz := commercial.cme_period_start('day', clock_timestamp()); v_month timestamptz := commercial.cme_period_start('month', clock_timestamp());
        v_meters jsonb; v_domains jsonb; v_caps jsonb; v_breaches jsonb; v_records jsonb; l commercial.licences%ROWTYPE; v_n int := least(greatest(coalesce(p_limit, 50), 1), 200);
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the usage meters');
  SELECT coalesce(jsonb_agg(jsonb_build_object('dimension', d.dimension, 'unit', d.unit, 'capability', commercial.cme_capability(d.dimension), 'gauge', d.dimension = 'storage',
                                               'today', commercial.cme_used(p_tenant, p_domain, d.dimension, d.unit, v_day),
                                               'this_month', commercial.cme_used(p_tenant, p_domain, d.dimension, d.unit, v_month),
                                               'all_time', commercial.cme_used(p_tenant, p_domain, d.dimension, d.unit, '-infinity'::timestamptz),
                                               'records', d.n, 'last_at', d.last_at) ORDER BY d.dimension, d.unit), '[]'::jsonb)
    INTO v_meters
    FROM (SELECT u.dimension, u.unit, count(*)::int n, max(u.occurred_at) last_at FROM commercial.usage_records u
           WHERE u.tenant_id = p_tenant AND (p_domain IS NULL OR u.domain_id = p_domain) GROUP BY u.dimension, u.unit) d;
  IF p_domain IS NULL THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('domain_id', x.domain_id, 'domain', x.name, 'dimension', x.dimension, 'unit', x.unit, 'this_month', commercial.cme_used(p_tenant, x.domain_id, x.dimension, x.unit, v_month))
                              ORDER BY x.name, x.dimension, x.unit), '[]'::jsonb) INTO v_domains
      FROM (SELECT DISTINCT u.domain_id, d.name, u.dimension, u.unit FROM commercial.usage_records u LEFT JOIN tenancy.domains d ON d.id = u.domain_id
             WHERE u.tenant_id = p_tenant AND u.domain_id IS NOT NULL) x;
  END IF;
  SELECT coalesce(jsonb_agg(commercial.cme_cap_json(c) ORDER BY c.dimension, c.unit, c.period, c.domain_id NULLS FIRST), '[]'::jsonb) INTO v_caps
    FROM commercial.caps c WHERE c.tenant_id = p_tenant AND c.state = 'active' AND (c.domain_id IS NULL OR p_domain IS NULL OR c.domain_id = p_domain);
  SELECT coalesce(jsonb_agg(jsonb_build_object('breach_id', b.breach_id, 'kind', b.kind, 'action', b.action, 'cap_id', b.cap_id, 'cap_version', b.cap_version, 'dimension', b.dimension, 'unit', b.unit,
                                               'period', b.period, 'period_start', b.period_start, 'limit', b.cap_limit, 'used', b.used, 'subject_kind', b.subject_kind, 'subject_id', b.subject_id,
                                               'domain_id', b.domain_id, 'actor', b.actor_principal_id, 'occurred_at', b.occurred_at) ORDER BY b.occurred_at DESC), '[]'::jsonb) INTO v_breaches
    FROM (SELECT x.* FROM commercial.cap_breaches x WHERE x.tenant_id = p_tenant AND (p_domain IS NULL OR x.domain_id IS NULL OR x.domain_id = p_domain)
           ORDER BY x.occurred_at DESC LIMIT v_n) b;
  SELECT coalesce(jsonb_agg(jsonb_build_object('usage_id', u.usage_id, 'domain_id', u.domain_id, 'dimension', u.dimension, 'unit', u.unit, 'quantity', u.quantity, 'capability', u.capability_key,
                                               'profile', u.profile, 'source_kind', u.source_kind, 'source_ref', u.source_ref, 'details', u.details, 'occurred_at', u.occurred_at) ORDER BY u.occurred_at DESC, u.usage_id), '[]'::jsonb) INTO v_records
    FROM (SELECT x.* FROM commercial.usage_records x WHERE x.tenant_id = p_tenant AND (p_domain IS NULL OR x.domain_id = p_domain) ORDER BY x.occurred_at DESC, x.usage_id LIMIT v_n) u;
  l := commercial.cme_licence(p_tenant);
  RETURN jsonb_build_object('tenant_id', p_tenant, 'domain_id', p_domain, 'at', clock_timestamp(), 'day_start', v_day, 'month_start', v_month,
    'meters', v_meters, 'domains', v_domains, 'caps', v_caps, 'breaches', v_breaches, 'records', v_records,
    'licence', CASE WHEN l.licence_id IS NULL THEN jsonb_build_object('contracted', false, 'note', 'uncontracted: no licence limits apply; a cap is bounded by nothing but itself')
                    ELSE jsonb_build_object('contracted', true, 'licence_id', l.licence_id, 'version', l.version, 'state', l.state, 'package_key', l.package_key, 'limits', l.limits) END,
    'not_metered', jsonb_build_array('model inference TOKENS: the gateway records none (inference is metered in calls)',
                                     'a collection run that ends budget_exceeded or failed: its terminal event carries no spent figures',
                                     'storage outside the evidence vault (the quarantine vault, export packages, the database itself)'));
END $$;
REVOKE ALL ON FUNCTION commercial.usage_summary(uuid, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.usage_summary(uuid, uuid, int) TO eye_app, eye_commit;

-- §ME.7 THE RE-DECLARED PORTS (copied whole from their latest definitions; the B91 meters changes marked `-- B91 meters`) ─────────────

/* simulation.claim_experiment_chunk — copied whole from 0099:1421 (its latest definition); the B91 meters change is the tenant cap at admission. */
/* CLAIM (the WORKER's; simulation.experiment.execute): the oldest running experiment of the domain whose run is bound (or the one named)
   answers — {kind: 'finish', outcome, reason} when a stop is pending or every chunk is done; {kind: 'chunk', …, run: the stored contract}
   for its next chunk: a QUEUED one, or a RUNNING one whose lease lapsed (a worker that died mid-chunk: reclaimed, chunk_reclaimed) —
   FOR UPDATE SKIP LOCKED, the attempt counted against the budget's chunk executions; or null (nothing to do). */
CREATE OR REPLACE FUNCTION simulation.claim_experiment_chunk(p_tenant uuid, p_domain uuid, p_experiment_id uuid, p_exclude uuid[], p_lease_seconds int, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE e simulation.experiments%ROWTYPE; c simulation.experiment_chunks%ROWTYPE; r simulation.runs_current%ROWTYPE; v_lease int := greatest(5, least(coalesce(p_lease_seconds, 300), 3600));
        v_left int; v_reclaimed boolean := false;
        v_cap jsonb; v_capr commercial.caps%ROWTYPE;   -- B91 meters
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.experiment.execute']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM simulation.sio_assert_actor(p_actor);
  PERFORM simulation.sio_assert_worker(p_tenant, p_domain, p_actor);
  SELECT * INTO e FROM simulation.experiments x
   WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'running' AND x.run_id IS NOT NULL AND (p_experiment_id IS NULL OR x.experiment_id = p_experiment_id) AND NOT (x.experiment_id = ANY (coalesce(p_exclude, ARRAY[]::uuid[])))
   ORDER BY x.started_at, x.experiment_id LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF e.stop_pending IS NOT NULL THEN RETURN jsonb_build_object('kind', 'finish', 'experiment_id', e.experiment_id, 'run_id', e.run_id, 'outcome', e.stop_pending ->> 'outcome', 'reason', e.stop_pending ->> 'reason'); END IF;
  SELECT count(*) INTO v_left FROM simulation.experiment_chunks k WHERE k.experiment_id = e.experiment_id AND k.state <> 'done';
  IF v_left = 0 THEN RETURN jsonb_build_object('kind', 'finish', 'experiment_id', e.experiment_id, 'run_id', e.run_id, 'outcome', 'completed', 'reason', 'paths'); END IF;
  SELECT * INTO c FROM simulation.experiment_chunks k
   WHERE k.experiment_id = e.experiment_id AND (k.state = 'queued' OR (k.state = 'running' AND k.started_at < clock_timestamp() - make_interval(secs => v_lease)))
   ORDER BY k.chunk_index LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN NULL; END IF;   -- every remaining chunk is in flight under a live lease
  v_reclaimed := c.state = 'running';
  -- B91 meters: THE TENANT'S CAP AT ADMISSION — a reached STOP cap on simulation_compute (the tenant's, or this domain's) stops the
  -- experiment BEFORE the next chunk runs: stop_pending partial (failed when no chunk completed) with reason tenant_cap, the existing
  -- budget_exceeded event carrying the cap, a `refused` cap breach and commercial.usage raised. Nothing is deleted: the completed chunks
  -- stay and the run ends partial over them. No cap set (or none reached) → this block changes nothing.
  v_cap := commercial.cme_reached_stop(e.tenant_id, e.domain_id, 'simulation_compute');
  IF v_cap IS NOT NULL THEN
    UPDATE simulation.experiments SET stop_pending = jsonb_build_object('outcome', CASE WHEN (e.progress ->> 'chunks_done')::int > 0 THEN 'partial' ELSE 'failed' END, 'reason', 'tenant_cap')
     WHERE experiment_id = e.experiment_id RETURNING * INTO e;
    PERFORM simulation.sio_event(e, 'budget_exceeded', p_actor, jsonb_build_object('budget', 'tenant_cap', 'cap', v_cap, 'used', e.progress, 'approved', e.budget), p_correlation);
    SELECT * INTO v_capr FROM commercial.caps x WHERE x.cap_id = (v_cap ->> 'cap_id')::uuid AND x.version = (v_cap ->> 'version')::int;
    PERFORM commercial.cme_breach(v_capr, 'refused', (v_cap ->> 'used')::numeric, e.domain_id, 'experiment', e.experiment_id, NULL,
              jsonb_build_object('experiment_id', e.experiment_id, 'title', e.title, 'run_id', e.run_id, 'outcome', e.stop_pending ->> 'outcome', 'chunks_done', e.progress -> 'chunks_done', 'cap', v_cap), p_actor, p_correlation);
    RETURN jsonb_build_object('kind', 'finish', 'experiment_id', e.experiment_id, 'run_id', e.run_id, 'outcome', e.stop_pending ->> 'outcome', 'reason', 'tenant_cap');
  END IF;
  -- end B91 meters
  IF (e.progress ->> 'executions')::int >= (e.budget ->> 'max_chunks')::int THEN
    UPDATE simulation.experiments SET stop_pending = jsonb_build_object('outcome', CASE WHEN (e.progress ->> 'chunks_done')::int > 0 THEN 'partial' ELSE 'failed' END, 'reason', 'budget_exceeded')
     WHERE experiment_id = e.experiment_id RETURNING * INTO e;
    PERFORM simulation.sio_event(e, 'budget_exceeded', p_actor, jsonb_build_object('budget', 'max_chunks', 'used', e.progress, 'approved', e.budget), p_correlation);
    RETURN jsonb_build_object('kind', 'finish', 'experiment_id', e.experiment_id, 'run_id', e.run_id, 'outcome', e.stop_pending ->> 'outcome', 'reason', 'budget_exceeded');
  END IF;
  UPDATE simulation.experiment_chunks SET state = 'running', attempts = attempts + 1, claimed_by = p_actor, started_at = clock_timestamp(), finished_at = NULL, error = NULL
   WHERE experiment_id = c.experiment_id AND chunk_index = c.chunk_index RETURNING * INTO c;
  UPDATE simulation.experiments SET progress = jsonb_set(progress, '{executions}', to_jsonb((progress ->> 'executions')::int + 1)) WHERE experiment_id = e.experiment_id RETURNING * INTO e;
  IF v_reclaimed THEN PERFORM simulation.sio_event(e, 'chunk_reclaimed', p_actor, jsonb_build_object('chunk_index', c.chunk_index, 'attempt', c.attempts, 'lease_seconds', v_lease), p_correlation); END IF;
  SELECT * INTO r FROM simulation.runs_current x WHERE x.run_id = e.run_id;
  RETURN jsonb_build_object('kind', 'chunk', 'experiment_id', e.experiment_id, 'chunk_index', c.chunk_index, 'first_path', c.first_path, 'paths', c.paths, 'attempt', c.attempts,
                            'reclaimed', v_reclaimed, 'run_id', e.run_id, 'chunks_per_tick', coalesce((e.pace ->> 'chunks_per_tick')::int, 1),
                            'run', jsonb_build_object('initial_state', r.initial_state, 'component', r.component, 'constraints', r.constraints, 'shock', r.shock, 'stochastic_mode', r.stochastic_mode,
                                                      'seed', r.seed, 'samples', r.samples, 'jitter', r.jitter, 'interventions', r.interventions, 'assumptions', r.assumptions,
                                                      'model_ref', r.model_ref, 'implementation_digest', r.implementation_digest));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.claim_experiment_chunk(uuid, uuid, uuid, uuid[], int, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.claim_experiment_chunk(uuid, uuid, uuid, uuid[], int, uuid, uuid) TO eye_commit;

/* products.read_subscription_events — copied whole from 0096:149 (its latest definition); the B91 meters change is the read's metering and the
   consumer register's counter (B90's carryover). The catch-up (0098:15) is NOT re-declared: its ledger row (products.subscription_catchups) is
   metered by the AFTER INSERT trigger cme_catchup_usage. */
CREATE OR REPLACE FUNCTION products.read_subscription_events(p_subscription_id uuid, p_tenant uuid, p_domain uuid, p_after_sequence bigint, p_limit int, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s products.event_subscriptions%ROWTYPE; ep products.event_products%ROWTYPE; r products.products_current%ROWTYPE; v_after bigint; v_limit int; v_floor timestamptz; v_head bigint;
        v_from timestamptz; v_to timestamptz; v_kinds text[]; v_okeys text[]; v_subjects uuid[]; v_fields text[]; v_events jsonb; v_served int; v_omitted int; v_next bigint;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.subscription.read']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'subscription rejected (actor): read by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO s FROM products.event_subscriptions x WHERE x.subscription_id = p_subscription_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription rejected (unknown_subscription): % is not a subscription of this domain', p_subscription_id USING ERRCODE = '22023'; END IF;
  IF s.consumer_principal_id <> p_actor THEN RAISE EXCEPTION 'subscription rejected (not_consumer): the events of a subscription are read by its consumer' USING ERRCODE = '42501'; END IF;
  IF s.state = 'registered' THEN RAISE EXCEPTION 'subscription rejected (state): subscription % is registered and not yet authorized by the product''s owner', p_subscription_id USING ERRCODE = '22023'; END IF;
  IF s.state = 'revoked' THEN RAISE EXCEPTION 'subscription rejected (state): subscription % was revoked at % (%); nothing is served (the checkpoint % is preserved)', p_subscription_id, s.revoked_at, s.revocation_reason, s.checkpoint_sequence USING ERRCODE = '22023'; END IF;
  IF s.state IN ('paused', 'lagging') THEN
    RAISE EXCEPTION 'subscription rejected (state): subscription % is % (%); delivery is paused with the checkpoint % preserved — the consumer''s conformance and the owner''s resumption are required before reading%', p_subscription_id, s.state, s.paused_reason, s.checkpoint_sequence,
      CASE WHEN s.state = 'lagging' THEN format(' (the authorized backlog through sequence %s is served by the catch-up route)', s.catchup_head) ELSE '' END USING ERRCODE = '22023';
  END IF;
  SELECT * INTO ep FROM products.event_products x WHERE x.product_id = s.product_id;
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = s.product_id;
  v_after := coalesce(p_after_sequence, s.checkpoint_sequence);
  IF v_after < s.checkpoint_sequence THEN
    RAISE EXCEPTION 'subscription rejected (window): reading from sequence % is before the checkpoint %; a replay moves the checkpoint back (DP-43-002: consumers may not infer broader access)', v_after, s.checkpoint_sequence USING ERRCODE = '22023';
  END IF;
  v_limit := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_floor := clock_timestamp() - make_interval(days => ep.retention_days);
  v_head := coalesce((SELECT max(x.sequence) FROM products.event_stream x WHERE x.product_id = s.product_id), 0);
  v_from := CASE WHEN jsonb_typeof(s.granted -> 'from') = 'string' THEN (s.granted ->> 'from')::timestamptz END;
  v_to := CASE WHEN jsonb_typeof(s.granted -> 'to') = 'string' THEN (s.granted ->> 'to')::timestamptz END;
  SELECT array_agg(f) INTO v_fields FROM jsonb_array_elements_text(s.granted -> 'fields') f;
  IF jsonb_typeof(s.filters -> 'event_kinds') = 'array' AND jsonb_array_length(s.filters -> 'event_kinds') > 0 THEN SELECT array_agg(k) INTO v_kinds FROM jsonb_array_elements_text(s.filters -> 'event_kinds') k; END IF;
  IF jsonb_typeof(s.filters -> 'ordering_keys') = 'array' AND jsonb_array_length(s.filters -> 'ordering_keys') > 0 THEN SELECT array_agg(k) INTO v_okeys FROM jsonb_array_elements_text(s.filters -> 'ordering_keys') k; END IF;
  IF jsonb_typeof(s.filters -> 'subject_ids') = 'array' AND jsonb_array_length(s.filters -> 'subject_ids') > 0 THEN SELECT array_agg(k::uuid) INTO v_subjects FROM jsonb_array_elements_text(s.filters -> 'subject_ids') k; END IF;
  IF jsonb_typeof(s.filters -> 'subject_kinds') = 'array' AND jsonb_array_length(s.filters -> 'subject_kinds') > 0
     AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(s.filters -> 'subject_kinds') k WHERE k = ep.subject_kind) THEN
    PERFORM commercial.cme_product_consumption(s.tenant_id, s.domain_id, s.product_id, s.consumer_principal_id, 'subscription_read', 0, gen_random_uuid()::text,   -- B91 meters: the read counted (nothing served)
              jsonb_build_object('subscription_id', p_subscription_id, 'after', v_after, 'served', 0), p_correlation);
    RETURN jsonb_build_object('subscription_id', p_subscription_id, 'product_id', s.product_id, 'product_key', r.product_key, 'after', v_after, 'next_after', v_after, 'head', v_head, 'checkpoint', s.checkpoint_sequence,
                              'served', 0, 'omitted', jsonb_build_object('corrections', 0), 'retention_floor', v_floor, 'window', jsonb_build_object('from', v_from, 'to', v_to), 'events', '[]'::jsonb,
                              'note', 'the subject kind filter excludes this product''s subject kind ' || ep.subject_kind);
  END IF;
  WITH candidates AS (
    SELECT x.* FROM products.event_stream x
     WHERE x.product_id = s.product_id AND x.sequence > v_after AND x.occurred_at >= v_floor
       AND (v_from IS NULL OR x.occurred_at >= v_from) AND (v_to IS NULL OR x.occurred_at <= v_to)
       AND (v_kinds IS NULL OR x.event_kind = ANY (v_kinds)) AND (v_okeys IS NULL OR x.ordering_key = ANY (v_okeys)) AND (v_subjects IS NULL OR x.subject_id = ANY (v_subjects))
     ORDER BY x.sequence LIMIT v_limit)
  SELECT coalesce(jsonb_agg(jsonb_build_object('sequence', c.sequence, 'event_kind', c.event_kind, 'source_event', c.source_event, 'subject_id', c.subject_id, 'subject_kind', ep.subject_kind, 'ordering_key', c.ordering_key,
                                              'occurred_at', c.occurred_at, 'schema_version', c.schema_version, 'payload', products.event_projection(c.payload, v_fields)) ORDER BY c.sequence)
                  FILTER (WHERE s.handles_corrections OR c.event_kind <> 'correction'), '[]'::jsonb),
         count(*) FILTER (WHERE s.handles_corrections OR c.event_kind <> 'correction'), count(*) FILTER (WHERE NOT s.handles_corrections AND c.event_kind = 'correction'), coalesce(max(c.sequence), v_after)
    INTO v_events, v_served, v_omitted, v_next
    FROM candidates c;
  -- B91 meters: B90's CARRYOVER — the read is metered (product_consumption, unit events: the events served) and the consumer's live
  -- registration counts it (products.product_consumers.usage: subscription_reads + 1, events_served + the served count)
  PERFORM commercial.cme_product_consumption(s.tenant_id, s.domain_id, s.product_id, s.consumer_principal_id, 'subscription_read', v_served, gen_random_uuid()::text,
              jsonb_build_object('subscription_id', p_subscription_id, 'after', v_after, 'next_after', v_next, 'served', v_served), p_correlation);
  -- end B91 meters
  RETURN jsonb_build_object('subscription_id', p_subscription_id, 'product_id', s.product_id, 'product_key', r.product_key, 'after', v_after, 'next_after', v_next, 'head', v_head, 'checkpoint', s.checkpoint_sequence,
                            'served', v_served, 'omitted', jsonb_build_object('corrections', v_omitted, 'reason', CASE WHEN v_omitted > 0 THEN 'this subscription declared it cannot process corrections; the correction rows are withheld and counted' END),
                            'retention_floor', v_floor, 'window', jsonb_build_object('from', v_from, 'to', v_to), 'fields', to_jsonb(v_fields), 'events', v_events);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.read_subscription_events(uuid,uuid,uuid,bigint,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.read_subscription_events(uuid,uuid,uuid,bigint,int,uuid,uuid) TO eye_commit;
