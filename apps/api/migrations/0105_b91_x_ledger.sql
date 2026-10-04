-- ═════════════════════════════════════════════════════════════════════
-- section `ledger` (§LE) — CP-6 B91, part `ledger` (F-P7-F-02: the cost and resource ledger, budgets, variance, unit data cost,
-- reconciliation to invoice lines, anomaly, energy, optimisation that never weakens a control)
-- ═════════════════════════════════════════════════════════════════════
-- Applies after §0 (the prelude: the schema commercial, commercial.usage_records — §ME's meters —, the attention class commercial.usage and
-- the subject kind budget, the role commercial_authority). Forward only; nothing earlier is edited; no existing function is re-declared; no
-- existing event list is widened. Prefix cle_. Every figure a harness seeds here is SYNTHETIC.
--
--   §LE.1 THE TABLES     rate_cards (the vendor's price per dimension × unit, versioned with effective time, with an ENERGY coefficient that
--                        is an ESTIMATE and says so) · allocation_keys (how a tenant-level usage is shared out to domains / products /
--                        consumers, versioned with effective time) · cost_entries (usage × the rate in force at occurred_at: one entry per
--                        usage record and allocation share, append-only, idempotent per usage record, keeping the rate-card and allocation
--                        versions) · budgets (tenant or domain × capability × period, an amount and a NAMED HUMAN owner, versioned) ·
--                        budget_events (the ledger: declared, revised, threshold, anomaly) · invoices + invoice_lines (imported by the
--                        commercial authority — SYNTHETIC only in this build: a real billing account is the external prerequisite) ·
--                        reconciliations (an invoice's lines against the ledger's totals per dimension, with the differences) ·
--                        optimisation_decisions (the trade-offs recorded; an optimisation touching a protected control is REFUSED).
--   §LE.2 THE HELPERS    the acting principal, the platform/tenant scope, the commercial authority, the rate and the allocation in force at
--                        an instant, the period, the variance (internal), the attention item.
--   §LE.3 THE PORTS      set_rate_card · set_allocation_key (commercial.rate.set / commercial.allocation.set — the commercial authority) ·
--                        set_budget (commercial.budget.set — the tenant administrator, or the budget's owner for a revision) ·
--                        import_invoice · reconcile_invoice (commercial.invoice.import / .reconcile — the commercial authority) ·
--                        record_optimisation (commercial.optimisation.record — the commercial authority, human-gated) ·
--                        ledger_tick (executive.attention.tick — the tick step commercial-ledger: price, thresholds, anomaly).
--   §LE.4 THE READS      budget_variance (guarded definer: the budget's own scope) · unit_data_cost (DQM-040) · energy_estimate (INVOKER: RLS).
--
-- THE BOUNDARY (ADR-022, IA-70-003, DP-70-003): a budget threshold or an anomaly RAISES an item to the budget's owner; it never stops, deletes
-- or hides work. An optimisation may change only declared, adjustable controls; one that would change residency, isolation, retention,
-- recovery (or sovereignty, provenance, audit, evidence, human authority, accessibility, quality, freshness, durability, resilience) is
-- refused: `optimisation rejected (boundary)`. Nothing here is inferred: usage with no rate in force stays UNPRICED and is counted, never
-- read as zero; a reconciliation with unpriced usage in its period cannot be `matched`.

-- ─────────────────────────────────────────────────────────────────────
-- §LE.1 THE TABLES
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE commercial.rate_cards (
  rate_card_id         uuid PRIMARY KEY,
  rate_key             text NOT NULL CHECK (rate_key ~ '^[a-z_]+:.{1,40}$'),
  version              int NOT NULL CHECK (version >= 1),
  dimension            text NOT NULL CHECK (dimension IN ('model_inference', 'source_consumption', 'storage', 'simulation_compute', 'product_consumption')),
  unit                 text NOT NULL CHECK (length(btrim(unit)) BETWEEN 1 AND 40),
  price_per_unit       numeric NOT NULL CHECK (price_per_unit >= 0),
  currency             text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  energy_kwh_per_unit  numeric NULL CHECK (energy_kwh_per_unit IS NULL OR energy_kwh_per_unit >= 0),
  energy_label         text NULL CHECK (energy_label IS NULL OR energy_label = 'ESTIMATE'),
  energy_basis         text NULL,
  effective_from       timestamptz NOT NULL,
  synthetic            boolean NOT NULL,
  reason               text NOT NULL CHECK (length(btrim(reason)) >= 8),
  set_by               uuid NOT NULL,
  set_at               timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id       uuid NOT NULL,
  UNIQUE (rate_key, version),
  UNIQUE (rate_key, effective_from),
  CHECK (rate_key = dimension || ':' || unit),
  -- an energy coefficient is an ESTIMATE, labelled so, with its basis stated
  CHECK ((energy_kwh_per_unit IS NULL) = (energy_label IS NULL) AND (energy_kwh_per_unit IS NULL) = (energy_basis IS NULL)),
  CHECK (energy_basis IS NULL OR length(btrim(energy_basis)) >= 8)
);
CREATE INDEX cle_rate_in_force ON commercial.rate_cards (rate_key, effective_from DESC);
COMMENT ON TABLE commercial.rate_cards IS 'B91 §LE: the vendor''s price per usage dimension × unit, versioned with effective time (the version in force at an instant is the latest effective_from at or before it); the energy coefficient (kWh per unit) is an ESTIMATE, labelled so, with its basis. A version may not take effect before usage already priced under the card (no retroactive repricing).';

CREATE TABLE commercial.allocation_keys (
  allocation_key_id    uuid PRIMARY KEY,
  scope                text NOT NULL DEFAULT 'TENANT' CHECK (scope = 'TENANT'),
  tenant_id            uuid NOT NULL REFERENCES tenancy.tenants(id),
  dimension            text NOT NULL CHECK (dimension IN ('model_inference', 'source_consumption', 'storage', 'simulation_compute', 'product_consumption')),
  version              int NOT NULL CHECK (version >= 1),
  basis                text NOT NULL CHECK (length(btrim(basis)) >= 8),
  shares               jsonb NOT NULL CHECK (jsonb_typeof(shares) = 'array' AND jsonb_array_length(shares) BETWEEN 1 AND 50),
  effective_from       timestamptz NOT NULL,
  reason               text NOT NULL CHECK (length(btrim(reason)) >= 8),
  set_by               uuid NOT NULL,
  set_at               timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id       uuid NOT NULL,
  UNIQUE (tenant_id, dimension, version),
  UNIQUE (tenant_id, dimension, effective_from)
);
COMMENT ON TABLE commercial.allocation_keys IS 'B91 §LE: how a TENANT-level usage of a dimension (a usage record with no domain) is shared out to domains — and, where named, a product and a consumer — by weights summing to 1; versioned with effective time; a key may not take effect before usage it would re-allocate has been priced.';

CREATE TABLE commercial.cost_entries (
  entry_id              uuid PRIMARY KEY,
  usage_id              uuid NOT NULL REFERENCES commercial.usage_records(usage_id),
  line                  int NOT NULL CHECK (line >= 0),
  scope                 text NOT NULL CHECK (scope IN ('TENANT', 'DOMAIN')),
  tenant_id             uuid NOT NULL REFERENCES tenancy.tenants(id),
  domain_id             uuid NULL,
  product_id            uuid NULL,
  consumer_principal_id uuid NULL,
  capability_key        text NOT NULL,
  dimension             text NOT NULL,
  unit                  text NOT NULL,
  asset_ref             text NOT NULL,
  profile               text NOT NULL,
  quantity              numeric NOT NULL CHECK (quantity >= 0),
  share                 numeric NOT NULL CHECK (share > 0 AND share <= 1),
  allocation            text NOT NULL CHECK (allocation IN ('direct', 'allocated', 'unallocated')),
  allocation_key_id     uuid NULL REFERENCES commercial.allocation_keys(allocation_key_id),
  allocation_version    int NULL,
  rate_card_id          uuid NOT NULL REFERENCES commercial.rate_cards(rate_card_id),
  rate_key              text NOT NULL,
  rate_version          int NOT NULL,
  price_per_unit        numeric NOT NULL,
  currency              text NOT NULL,
  amount                numeric NOT NULL CHECK (amount >= 0),
  energy_kwh            numeric NULL,
  energy_label          text NULL CHECK (energy_label IS NULL OR energy_label = 'ESTIMATE'),
  occurred_at           timestamptz NOT NULL,
  priced_at             timestamptz NOT NULL DEFAULT clock_timestamp(),
  priced_by             uuid NOT NULL,
  correlation_id        uuid NOT NULL,
  UNIQUE (usage_id, line),
  CHECK ((scope = 'TENANT') = (domain_id IS NULL)),
  CHECK ((allocation = 'allocated') = (allocation_key_id IS NOT NULL) AND (allocation_key_id IS NULL) = (allocation_version IS NULL))
);
CREATE INDEX cle_entries_tenant ON commercial.cost_entries (tenant_id, occurred_at);
CREATE INDEX cle_entries_rate ON commercial.cost_entries (rate_key, occurred_at);
COMMENT ON TABLE commercial.cost_entries IS 'B91 §LE: the cost ledger — each usage record priced ONCE (unique per usage record and line) at the rate-card version in force at its occurred_at, kept with that version and the allocation key version that shared it; the energy estimate (kWh, labelled ESTIMATE) beside it. Append-only.';

CREATE TABLE commercial.budgets (
  budget_id           uuid NOT NULL,
  version             int NOT NULL CHECK (version >= 1),
  scope               text NOT NULL CHECK (scope IN ('TENANT', 'DOMAIN')),
  tenant_id           uuid NOT NULL REFERENCES tenancy.tenants(id),
  domain_id           uuid NULL,
  label               text NOT NULL CHECK (length(btrim(label)) BETWEEN 4 AND 200),
  capability_key      text NOT NULL CHECK (capability_key ~ '^[a-z][a-z0-9_]{1,40}$'),
  period_kind         text NOT NULL CHECK (period_kind IN ('month', 'quarter', 'year')),
  amount              numeric(18,2) NOT NULL CHECK (amount > 0),
  currency            text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  owner_principal_id  uuid NOT NULL,
  thresholds          int[] NOT NULL CHECK (cardinality(thresholds) BETWEEN 1 AND 6),
  anomaly_rule        jsonb NOT NULL CHECK (jsonb_typeof(anomaly_rule) = 'object'),
  reason              text NOT NULL CHECK (length(btrim(reason)) >= 8),
  set_by              uuid NOT NULL,
  set_at              timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  PRIMARY KEY (budget_id, version),
  CHECK ((scope = 'TENANT') = (domain_id IS NULL))
);
-- one budget per (tenant, domain or none, capability, period kind): its first version is unique; later versions revise it
CREATE UNIQUE INDEX cle_budget_once ON commercial.budgets (tenant_id, coalesce(domain_id, '00000000-0000-0000-0000-000000000000'::uuid), capability_key, period_kind) WHERE version = 1;
CREATE INDEX cle_budget_tenant ON commercial.budgets (tenant_id, budget_id, version DESC);
COMMENT ON TABLE commercial.budgets IS 'B91 §LE: a budget — tenant or domain × capability (`all` for every capability) × period (month, quarter, year) — an amount in a currency, a NAMED HUMAN owner of the tenant, its thresholds (percent) and its declared anomaly rule; versioned (the current is the highest version). Set by the tenant administrator; revised by the administrator or the owner. A budget raises; it never stops work.';

CREATE TABLE commercial.budget_events (
  event_id            uuid PRIMARY KEY,
  scope               text NOT NULL CHECK (scope IN ('TENANT', 'DOMAIN')),
  tenant_id           uuid NOT NULL,
  domain_id           uuid NULL,
  budget_id           uuid NOT NULL,
  budget_version      int NOT NULL,
  event               text NOT NULL CHECK (event IN ('declared', 'revised', 'threshold', 'anomaly')),
  period_start        date NULL,
  threshold           int NULL,
  day                 date NULL,
  raised_in_domain    uuid NULL,
  attention_item_id   uuid NULL,
  details             jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  actor_principal_id  uuid NULL,
  recorded_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  FOREIGN KEY (budget_id, budget_version) REFERENCES commercial.budgets(budget_id, version),
  CHECK ((scope = 'TENANT') = (domain_id IS NULL)),
  CHECK (event <> 'threshold' OR (period_start IS NOT NULL AND threshold IS NOT NULL)),
  CHECK (event <> 'anomaly' OR day IS NOT NULL)
);
CREATE UNIQUE INDEX cle_be_threshold_once ON commercial.budget_events (budget_id, budget_version, period_start, threshold) WHERE event = 'threshold';
CREATE UNIQUE INDEX cle_be_anomaly_once ON commercial.budget_events (budget_id, day) WHERE event = 'anomaly';
CREATE INDEX cle_be_budget ON commercial.budget_events (budget_id, recorded_at);

CREATE TABLE commercial.invoices (
  invoice_id      uuid PRIMARY KEY,
  scope           text NOT NULL DEFAULT 'TENANT' CHECK (scope = 'TENANT'),
  tenant_id       uuid NOT NULL REFERENCES tenancy.tenants(id),
  invoice_ref     text NOT NULL CHECK (length(btrim(invoice_ref)) BETWEEN 1 AND 80),
  period_start    date NOT NULL,
  period_end      date NOT NULL,
  currency        text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  total           numeric(18,2) NOT NULL CHECK (total >= 0),
  issuer          text NOT NULL CHECK (length(btrim(issuer)) BETWEEN 2 AND 200),
  -- SYNTHETIC only in this build: a real billing account is the external prerequisite (F-P7-F-02's) and closes the clause, not this row
  synthetic       boolean NOT NULL CHECK (synthetic),
  digest          text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  imported_by     uuid NOT NULL,
  imported_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  UNIQUE (tenant_id, invoice_ref),
  CHECK (period_end >= period_start)
);
CREATE TABLE commercial.invoice_lines (
  invoice_id      uuid NOT NULL REFERENCES commercial.invoices(invoice_id),
  line_no         int NOT NULL CHECK (line_no >= 1),
  tenant_id       uuid NOT NULL,
  dimension       text NOT NULL CHECK (dimension IN ('model_inference', 'source_consumption', 'storage', 'simulation_compute', 'product_consumption')),
  unit            text NOT NULL CHECK (length(btrim(unit)) BETWEEN 1 AND 40),
  quantity        numeric NOT NULL CHECK (quantity >= 0),
  amount          numeric(18,2) NOT NULL CHECK (amount >= 0),
  description     text NULL,
  PRIMARY KEY (invoice_id, line_no)
);
CREATE TABLE commercial.reconciliations (
  reconciliation_id uuid PRIMARY KEY,
  scope             text NOT NULL DEFAULT 'TENANT' CHECK (scope = 'TENANT'),
  tenant_id         uuid NOT NULL,
  invoice_id        uuid NOT NULL REFERENCES commercial.invoices(invoice_id),
  version           int NOT NULL CHECK (version >= 1),
  tolerance         numeric NOT NULL CHECK (tolerance >= 0),
  outcome           text NOT NULL CHECK (outcome IN ('matched', 'differences')),
  lines             jsonb NOT NULL CHECK (jsonb_typeof(lines) = 'array'),
  totals            jsonb NOT NULL CHECK (jsonb_typeof(totals) = 'object'),
  reconciled_by     uuid NOT NULL,
  reconciled_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id    uuid NOT NULL,
  UNIQUE (invoice_id, version)
);
CREATE TABLE commercial.optimisation_decisions (
  decision_id      uuid PRIMARY KEY,
  scope            text NOT NULL CHECK (scope IN ('PLATFORM', 'TENANT')),
  tenant_id        uuid NULL REFERENCES tenancy.tenants(id),
  title            text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 200),
  decision         text NOT NULL CHECK (decision IN ('adopt', 'defer')),
  changes          jsonb NOT NULL CHECK (jsonb_typeof(changes) = 'array'),
  tradeoffs        jsonb NOT NULL CHECK (jsonb_typeof(tradeoffs) = 'array' AND jsonb_array_length(tradeoffs) >= 1),
  expected_saving  jsonb NULL,
  rationale        text NOT NULL CHECK (length(btrim(rationale)) >= 8),
  boundary_check   jsonb NOT NULL,
  decided_by       uuid NOT NULL,
  decided_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id   uuid NOT NULL,
  CHECK ((scope = 'PLATFORM') = (tenant_id IS NULL))
);
COMMENT ON TABLE commercial.optimisation_decisions IS 'B91 §LE (IA-70-003/-005, DP-70-003/-005): an economic optimisation decided by the commercial authority with its trade-offs; only declared adjustable controls may change — an optimisation that would change a protected control (residency, isolation, retention, recovery, …) is refused by the port and never recorded as adopted. A decision records; it applies nothing by itself.';

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['rate_cards', 'allocation_keys', 'cost_entries', 'budgets', 'budget_events', 'invoices', 'invoice_lines', 'reconciliations', 'optimisation_decisions'] LOOP
    EXECUTE format('CREATE TRIGGER cle_%s_append_only BEFORE UPDATE OR DELETE ON commercial.%I FOR EACH ROW EXECUTE FUNCTION public.raise_append_only()', t, t);
    EXECUTE format('REVOKE ALL ON commercial.%I FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE commercial.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE commercial.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT ON commercial.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;
-- the vendor's price list: every bound context reads it
CREATE POLICY commercial_rate_read ON commercial.rate_cards USING (public.eye_scope() IS NOT NULL);
-- the customer's budget governance: the prelude's usage isolation, verbatim (the tenant; a domain sees its own and the tenant-level rows)
CREATE POLICY commercial_isolation ON commercial.budgets
  USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id IS NULL OR domain_id = public.eye_domain()));
CREATE POLICY commercial_isolation ON commercial.budget_events
  USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id IS NULL OR domain_id = public.eye_domain()));
-- the ledger and the billing records: the tenant's isolation, and the commercial authority (PLATFORM) for reconciliation
CREATE POLICY commercial_isolation ON commercial.cost_entries
  USING ((tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id IS NULL OR domain_id = public.eye_domain())) OR public.eye_scope() = 'PLATFORM');
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['allocation_keys', 'invoices', 'invoice_lines', 'reconciliations'] LOOP
    EXECUTE format('CREATE POLICY commercial_licence_read ON commercial.%I USING (tenant_id = public.eye_tenant() OR public.eye_scope() = ''PLATFORM'')', t);
  END LOOP;
END $$;
-- a platform-wide optimisation is visible to every tenant (what the vendor changed and what it traded); a tenant's to that tenant
CREATE POLICY commercial_licence_read ON commercial.optimisation_decisions
  USING (tenant_id IS NULL OR tenant_id = public.eye_tenant() OR public.eye_scope() = 'PLATFORM');

-- ─────────────────────────────────────────────────────────────────────
-- §LE.2 THE HELPERS (internal: REVOKEd from PUBLIC, granted to nobody — called only inside the definer ports)
-- ─────────────────────────────────────────────────────────────────────
/* The acting principal is the context's. */
CREATE OR REPLACE FUNCTION commercial.cle_assert_actor(p_noun text, p_actor uuid) RETURNS void
SET search_path = commercial, public, pg_catalog, pg_temp AS $$
BEGIN
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION '% rejected (actor): recorded by the acting principal', p_noun USING ERRCODE = '42501';
  END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION commercial.cle_assert_actor(text, uuid) FROM PUBLIC;

/* THE COMMERCIAL AUTHORITY: a PLATFORM context, and the actor an active human holding commercial_authority (never an agent, never a workload). */
CREATE OR REPLACE FUNCTION commercial.cle_assert_commercial_authority(p_noun text, p_actor uuid) RETURNS void
SECURITY DEFINER SET search_path = commercial, identity, public, pg_catalog, pg_temp AS $$
BEGIN
  IF public.eye_scope() IS DISTINCT FROM 'PLATFORM' THEN
    RAISE EXCEPTION '% rejected (authority): the vendor''s commercial records are set in the platform scope by the commercial authority', p_noun USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.principals p JOIN identity.role_bindings b ON b.principal_id = p.id
                  WHERE p.id = p_actor AND p.kind = 'human' AND p.status = 'active' AND b.role_code = 'commercial_authority' AND b.scope = 'PLATFORM' AND b.revoked_at IS NULL) THEN
    RAISE EXCEPTION '% rejected (authority): a named, active human holding the commercial authority sets it', p_noun USING ERRCODE = '42501';
  END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION commercial.cle_assert_commercial_authority(text, uuid) FROM PUBLIC;

/* A tenant's own scope: the bound tenant; a DOMAIN context acts on its own domain's records only (a tenant-level record is the tenant's). */
CREATE OR REPLACE FUNCTION commercial.cle_assert_tenant_scope(p_noun text, p_tenant uuid, p_domain uuid) RETURNS void
SET search_path = commercial, public, pg_catalog, pg_temp AS $$
BEGIN
  IF public.eye_scope() NOT IN ('TENANT', 'DOMAIN') OR p_tenant IS DISTINCT FROM public.eye_tenant() THEN
    RAISE EXCEPTION '% rejected (authority): a tenant''s record is set within that tenant''s bound scope', p_noun USING ERRCODE = '42501';
  END IF;
  IF public.eye_scope() = 'DOMAIN' AND p_domain IS DISTINCT FROM public.eye_domain() THEN
    RAISE EXCEPTION '% rejected (authority): a domain context sets its own domain''s record only (a tenant-level record is set in the tenant scope)', p_noun USING ERRCODE = '42501';
  END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION commercial.cle_assert_tenant_scope(text, uuid, uuid) FROM PUBLIC;

/* The rate-card version in force for a dimension × unit at an instant (the latest effective_from at or before it), or NULL. */
CREATE OR REPLACE FUNCTION commercial.cle_rate_at(p_dimension text, p_unit text, p_at timestamptz) RETURNS commercial.rate_cards
STABLE SET search_path = commercial, pg_catalog, pg_temp AS $$
  SELECT r.* FROM commercial.rate_cards r WHERE r.rate_key = p_dimension || ':' || p_unit AND r.effective_from <= p_at ORDER BY r.effective_from DESC LIMIT 1
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION commercial.cle_rate_at(text, text, timestamptz) FROM PUBLIC;

/* The allocation key version in force for a tenant × dimension at an instant, or NULL. */
CREATE OR REPLACE FUNCTION commercial.cle_allocation_at(p_tenant uuid, p_dimension text, p_at timestamptz) RETURNS commercial.allocation_keys
STABLE SET search_path = commercial, pg_catalog, pg_temp AS $$
  SELECT k.* FROM commercial.allocation_keys k WHERE k.tenant_id = p_tenant AND k.dimension = p_dimension AND k.effective_from <= p_at ORDER BY k.effective_from DESC LIMIT 1
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION commercial.cle_allocation_at(uuid, text, timestamptz) FROM PUBLIC;

/* The budget's current version (the highest). */
CREATE OR REPLACE FUNCTION commercial.cle_budget_current(p_budget_id uuid) RETURNS commercial.budgets
STABLE SET search_path = commercial, pg_catalog, pg_temp AS $$
  SELECT b.* FROM commercial.budgets b WHERE b.budget_id = p_budget_id ORDER BY b.version DESC LIMIT 1
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION commercial.cle_budget_current(uuid) FROM PUBLIC;

/* THE VARIANCE of a budget at an instant (cle-variance@1; apps/api/src/commercial/ledger/ledger-math.ts `variance` is the same rule):
   the period is the calendar month / quarter / year (UTC) containing the instant; spent = the priced cost entries of the budget's tenant
   (its domain when it is a domain budget; its capability unless `all`) in the budget's currency that occurred in the period; variance =
   spent − amount (positive = over); the FORECAST to period end is the linear run-rate spent ÷ elapsed fraction; the usage in the period
   still UNPRICED (no rate in force) and the entries in another currency are counted — the figures are COMPLETE only when both are 0. */
CREATE OR REPLACE FUNCTION commercial.cle_variance(b commercial.budgets, p_at timestamptz) RETURNS jsonb
STABLE SET search_path = commercial, pg_catalog, pg_temp AS $$
DECLARE v_start date := date_trunc(b.period_kind, p_at AT TIME ZONE 'UTC')::date;
        v_end date; v_from timestamptz; v_to timestamptz; v_spent numeric; v_other int; v_unpriced int; v_elapsed numeric; v_forecast numeric;
BEGIN
  v_end := (v_start + CASE b.period_kind WHEN 'month' THEN interval '1 month' WHEN 'quarter' THEN interval '3 months' ELSE interval '1 year' END)::date;
  v_from := v_start::timestamp AT TIME ZONE 'UTC'; v_to := v_end::timestamp AT TIME ZONE 'UTC';
  SELECT coalesce(sum(c.amount) FILTER (WHERE c.currency = b.currency), 0), count(*) FILTER (WHERE c.currency <> b.currency)
    INTO v_spent, v_other
    FROM commercial.cost_entries c
   WHERE c.tenant_id = b.tenant_id AND (b.domain_id IS NULL OR c.domain_id = b.domain_id) AND (b.capability_key = 'all' OR c.capability_key = b.capability_key)
     AND c.occurred_at >= v_from AND c.occurred_at < v_to;
  SELECT count(*) INTO v_unpriced FROM commercial.usage_records u
   WHERE u.tenant_id = b.tenant_id AND (b.domain_id IS NULL OR u.domain_id = b.domain_id OR u.domain_id IS NULL) AND (b.capability_key = 'all' OR u.capability_key = b.capability_key)
     AND u.occurred_at >= v_from AND u.occurred_at < v_to AND NOT EXISTS (SELECT 1 FROM commercial.cost_entries c WHERE c.usage_id = u.usage_id);
  v_elapsed := extract(epoch FROM (least(greatest(p_at, v_from), v_to) - v_from)) / extract(epoch FROM (v_to - v_from));
  v_forecast := CASE WHEN v_elapsed > 0 THEN v_spent / v_elapsed END;
  RETURN jsonb_build_object('rule', 'cle-variance@1', 'budget_id', b.budget_id, 'version', b.version, 'label', b.label, 'scope', b.scope, 'domain_id', b.domain_id,
    'capability_key', b.capability_key, 'period_kind', b.period_kind, 'period_start', v_start, 'period_end', v_end, 'as_of', p_at,
    'amount', b.amount, 'currency', b.currency, 'owner_principal_id', b.owner_principal_id, 'thresholds', to_jsonb(b.thresholds),
    'spent', round(v_spent, 6), 'variance', round(v_spent - b.amount, 6), 'pct', round(v_spent / b.amount * 100, 2),
    'elapsed_fraction', round(v_elapsed, 6), 'forecast', round(v_forecast, 6), 'forecast_variance', round(v_forecast - b.amount, 6),
    'forecast_basis', 'linear run-rate: spent ÷ the elapsed fraction of the period',
    'unpriced_usage', v_unpriced, 'other_currency_entries', v_other, 'complete', v_unpriced = 0 AND v_other = 0);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION commercial.cle_variance(commercial.budgets, timestamptz) FROM PUBLIC;

/* A commercial.usage item for a budget's owner, raised in the domain the tick runs in (attention items are domain-scoped; a tenant budget's
   item lands in the domain whose tick saw it first — the event's uniqueness keeps it ONE). The owner when an active human of the tenant,
   else UNROUTED with the tenant administrators as the route roles (the sio_notify idiom, 0099 §O). */
CREATE OR REPLACE FUNCTION commercial.cle_notify(p_item uuid, b commercial.budgets, p_domain uuid, p_title text, p_reasons jsonb, p_cause_event uuid, p_cause_type text,
                                                 p_details jsonb, p_actor uuid, p_correlation uuid) RETURNS void
SECURITY DEFINER SET search_path = executive, identity, decision, pg_catalog, pg_temp AS $$
DECLARE v_state text; v_due timestamptz := clock_timestamp() + interval '24 hours'; v_roles text[] := ARRAY['tenant_admin'];
BEGIN
  v_state := CASE WHEN decision.is_active_human(b.owner_principal_id, b.tenant_id) THEN 'open'
                  WHEN executive.role_holders(b.tenant_id, p_domain, v_roles) > 0 THEN 'open' ELSE 'unrouted' END;
  INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state, owner_principal_id, route_roles, evaluation, details, due_at, escalations, correlation_id)
  VALUES (p_item, 'DOMAIN', b.tenant_id, p_domain, 'commercial.usage', 'budget', b.budget_id, p_cause_event, p_cause_type, left(p_title, 512), 'material', v_state,
          CASE WHEN decision.is_active_human(b.owner_principal_id, b.tenant_id) THEN b.owner_principal_id END, v_roles,
          jsonb_build_object('outcome', 'material', 'reasons', p_reasons, 'policy_version', NULL, 'dimensions', jsonb_build_object('consequence', 'C2', 'confidence', 1)),
          jsonb_build_object('budget_id', b.budget_id, 'budget_version', b.version, 'label', b.label, 'synthetic_figures_possible', true) || coalesce(p_details, '{}'::jsonb), v_due, 0, p_correlation);
  PERFORM executive.attention_event(p_item, b.tenant_id, p_domain, CASE v_state WHEN 'open' THEN 'item.routed' ELSE 'item.unrouted' END, p_actor,
            jsonb_build_object('outcome', 'material', 'reasons', p_reasons, 'policy_version', NULL, 'owner', b.owner_principal_id, 'route_roles', to_jsonb(v_roles), 'due_at', v_due,
                               'cause_event_id', p_cause_event, 'cause_event_type', p_cause_type, 'unrouted', v_state = 'unrouted', 'budget_id', b.budget_id), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION commercial.cle_notify(uuid, commercial.budgets, uuid, text, jsonb, uuid, text, jsonb, uuid, uuid) FROM PUBLIC;

/* The optimisation vocabulary: the controls an optimisation MAY adjust, and the PROTECTED ones it may never change (IA-70-003, DP-70-003). */
CREATE OR REPLACE FUNCTION commercial.cle_adjustable_controls() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['compute_schedule', 'batch_window', 'cache_tier', 'index_tier', 'instance_size', 'reservation', 'model_choice', 'sampling_rate', 'storage_compression', 'chunk_pace'] $$;
CREATE OR REPLACE FUNCTION commercial.cle_protected_controls() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['residency', 'region', 'isolation', 'tenancy', 'retention', 'recovery', 'backup', 'rpo', 'rto', 'sovereignty', 'provenance', 'audit', 'evidence',
               'human_authority', 'accessibility', 'quality', 'freshness', 'durability', 'resilience', 'replication', 'encryption'] $$;

-- ─────────────────────────────────────────────────────────────────────
-- §LE.3 THE PORTS
-- ─────────────────────────────────────────────────────────────────────
/* SET A RATE CARD (commercial.rate.set — the commercial authority, human-gated): a new version of the price of a dimension × unit from an
   effective instant. A version takes effect AFTER the one before it, and never before usage already priced under the card (a price is not
   changed under a priced entry: no retroactive repricing — class `priced`). The currency stays the card's. The energy coefficient, when
   given, is an ESTIMATE with its basis. */
CREATE OR REPLACE FUNCTION commercial.set_rate_card(p_rate_card_id uuid, p_dimension text, p_unit text, p_price numeric, p_currency text, p_energy_kwh numeric,
                                                    p_energy_basis text, p_effective_from timestamptz, p_synthetic boolean, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = commercial, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_key text; p commercial.rate_cards%ROWTYPE; r commercial.rate_cards%ROWTYPE; v_last timestamptz;
BEGIN
  PERFORM observation.assert_authority(ARRAY['commercial.rate.set']);
  PERFORM commercial.cle_assert_actor('rate card', p_actor);
  PERFORM commercial.cle_assert_commercial_authority('rate card', p_actor);
  IF p_dimension IS NULL OR NOT (p_dimension = ANY (ARRAY['model_inference', 'source_consumption', 'storage', 'simulation_compute', 'product_consumption'])) THEN
    RAISE EXCEPTION 'rate card rejected (dimension): the dimension is one of model_inference, source_consumption, storage, simulation_compute, product_consumption' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_unit, ''))) NOT BETWEEN 1 AND 40 THEN RAISE EXCEPTION 'rate card rejected (unit): the unit is named (1–40 characters)' USING ERRCODE = '22023'; END IF;
  IF p_price IS NULL OR p_price < 0 THEN RAISE EXCEPTION 'rate card rejected (price): the price per unit is a number at or above 0' USING ERRCODE = '22023'; END IF;
  IF p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'rate card rejected (currency): the currency is an ISO 4217 code' USING ERRCODE = '22023'; END IF;
  IF p_energy_kwh IS NOT NULL AND (p_energy_kwh < 0 OR length(btrim(coalesce(p_energy_basis, ''))) < 8) THEN
    RAISE EXCEPTION 'rate card rejected (energy): an energy coefficient is kWh per unit at or above 0, an ESTIMATE that states its basis (at least 8 characters)' USING ERRCODE = '22023';
  END IF;
  IF p_effective_from IS NULL THEN RAISE EXCEPTION 'rate card rejected (effective_from): a version names the instant it takes effect' USING ERRCODE = '22023'; END IF;
  IF p_synthetic IS NULL THEN RAISE EXCEPTION 'rate card rejected (synthetic): a rate card says whether its price is SYNTHETIC' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'rate card rejected (reason): a rate card states its reason (at least 8 characters)' USING ERRCODE = '22023'; END IF;
  v_key := p_dimension || ':' || btrim(p_unit);
  PERFORM pg_advisory_xact_lock(hashtext('cle_rate:' || v_key));
  SELECT * INTO p FROM commercial.rate_cards x WHERE x.rate_key = v_key ORDER BY x.version DESC LIMIT 1;
  IF FOUND THEN
    IF p_effective_from <= p.effective_from THEN
      RAISE EXCEPTION 'rate card rejected (stale): version % of % takes effect %; a new version takes effect after it', p.version, v_key, p.effective_from USING ERRCODE = '2F002';
    END IF;
    IF p_currency <> p.currency THEN RAISE EXCEPTION 'rate card rejected (currency): % is priced in %; a version keeps the card''s currency', v_key, p.currency USING ERRCODE = '22023'; END IF;
  END IF;
  SELECT max(c.occurred_at) INTO v_last FROM commercial.cost_entries c WHERE c.rate_key = v_key AND c.occurred_at >= p_effective_from;
  IF v_last IS NOT NULL THEN
    RAISE EXCEPTION 'rate card rejected (priced): usage of % that occurred at % is already priced; a price never changes under a priced entry (take effect after %)', v_key, v_last, v_last USING ERRCODE = '2F002';
  END IF;
  INSERT INTO commercial.rate_cards (rate_card_id, rate_key, version, dimension, unit, price_per_unit, currency, energy_kwh_per_unit, energy_label, energy_basis, effective_from, synthetic, reason, set_by, correlation_id)
  VALUES (p_rate_card_id, v_key, coalesce(p.version, 0) + 1, p_dimension, btrim(p_unit), p_price, p_currency, p_energy_kwh, CASE WHEN p_energy_kwh IS NOT NULL THEN 'ESTIMATE' END,
          CASE WHEN p_energy_kwh IS NOT NULL THEN btrim(p_energy_basis) END, p_effective_from, p_synthetic, btrim(p_reason), p_actor, p_correlation)
  RETURNING * INTO r;
  RETURN to_jsonb(r) || jsonb_build_object('prior_version', p.version);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION commercial.set_rate_card(uuid, text, text, numeric, text, numeric, text, timestamptz, boolean, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.set_rate_card(uuid, text, text, numeric, text, numeric, text, timestamptz, boolean, text, uuid, uuid) TO eye_commit;

/* SET AN ALLOCATION KEY (commercial.allocation.set — the commercial authority, human-gated): how a tenant's TENANT-level usage of a dimension
   is shared out — each share a domain of the tenant (optionally a product of that domain and a consumer principal of the tenant) and a
   weight; the weights sum to 1 (an unreliable allocation is refused, IA-70-005). Versioned from an effective instant, after the prior
   version's, and never before tenant-level usage of the dimension already priced. */
CREATE OR REPLACE FUNCTION commercial.set_allocation_key(p_key_id uuid, p_tenant uuid, p_dimension text, p_basis text, p_shares jsonb, p_effective_from timestamptz,
                                                         p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = commercial, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p commercial.allocation_keys%ROWTYPE; k commercial.allocation_keys%ROWTYPE; s jsonb; v_sum numeric := 0; v_targets text[] := '{}'; v_target text; v_norm jsonb := '[]'::jsonb;
        v_last timestamptz; v_w numeric;
BEGIN
  PERFORM observation.assert_authority(ARRAY['commercial.allocation.set']);
  PERFORM commercial.cle_assert_actor('allocation key', p_actor);
  PERFORM commercial.cle_assert_commercial_authority('allocation key', p_actor);
  IF NOT EXISTS (SELECT 1 FROM tenancy.tenants t WHERE t.id = p_tenant) THEN RAISE EXCEPTION 'allocation key rejected (unknown_tenant): % is not a tenant', p_tenant USING ERRCODE = '23503'; END IF;
  IF p_dimension IS NULL OR NOT (p_dimension = ANY (ARRAY['model_inference', 'source_consumption', 'storage', 'simulation_compute', 'product_consumption'])) THEN
    RAISE EXCEPTION 'allocation key rejected (dimension): the dimension is one of model_inference, source_consumption, storage, simulation_compute, product_consumption' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_basis, ''))) < 8 OR length(btrim(coalesce(p_reason, ''))) < 8 THEN
    RAISE EXCEPTION 'allocation key rejected (reason): an allocation key states its basis and its reason (at least 8 characters each)' USING ERRCODE = '22023';
  END IF;
  IF p_effective_from IS NULL THEN RAISE EXCEPTION 'allocation key rejected (effective_from): a version names the instant it takes effect' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(p_shares) IS DISTINCT FROM 'array' OR jsonb_array_length(p_shares) NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'allocation key rejected (shares): the shares are a list of 1 to 50' USING ERRCODE = '22023';
  END IF;
  FOR s IN SELECT x FROM jsonb_array_elements(p_shares) x LOOP
    IF jsonb_typeof(s) <> 'object' OR coalesce(s ->> 'domain_id', '') !~ '^[0-9a-f-]{36}$' OR jsonb_typeof(s -> 'weight') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'allocation key rejected (shares): each share names a domain_id and a numeric weight' USING ERRCODE = '22023';
    END IF;
    v_w := (s ->> 'weight')::numeric;
    IF v_w <= 0 OR v_w > 1 THEN RAISE EXCEPTION 'allocation key rejected (weights): each weight is in (0, 1]' USING ERRCODE = '22023'; END IF;
    IF NOT EXISTS (SELECT 1 FROM tenancy.domains d WHERE d.id = (s ->> 'domain_id')::uuid AND d.tenant_id = p_tenant) THEN
      RAISE EXCEPTION 'allocation key rejected (unknown_domain): % is not a domain of this tenant', s ->> 'domain_id' USING ERRCODE = '23503';
    END IF;
    IF s ? 'product_id' AND jsonb_typeof(s -> 'product_id') <> 'null' THEN
      IF coalesce(s ->> 'product_id', '') !~ '^[0-9a-f-]{36}$' OR to_regclass('products.products_current') IS NULL
         OR NOT EXISTS (SELECT 1 FROM products.products_current pc WHERE pc.product_id = (s ->> 'product_id')::uuid AND pc.tenant_id = p_tenant AND pc.domain_id = (s ->> 'domain_id')::uuid) THEN
        RAISE EXCEPTION 'allocation key rejected (unknown_product): % is not a product of domain %', s ->> 'product_id', s ->> 'domain_id' USING ERRCODE = '23503';
      END IF;
    END IF;
    IF s ? 'consumer_principal_id' AND jsonb_typeof(s -> 'consumer_principal_id') <> 'null' THEN
      IF coalesce(s ->> 'consumer_principal_id', '') !~ '^[0-9a-f-]{36}$'
         OR NOT EXISTS (SELECT 1 FROM identity.principals pr WHERE pr.id = (s ->> 'consumer_principal_id')::uuid AND pr.tenant_id = p_tenant) THEN
        RAISE EXCEPTION 'allocation key rejected (unknown_consumer): % is not a principal of this tenant', s ->> 'consumer_principal_id' USING ERRCODE = '23503';
      END IF;
    END IF;
    v_target := concat_ws('/', s ->> 'domain_id', nullif(s ->> 'product_id', ''), nullif(s ->> 'consumer_principal_id', ''));
    IF v_target = ANY (v_targets) THEN RAISE EXCEPTION 'allocation key rejected (shares): the share % is named twice', v_target USING ERRCODE = '22023'; END IF;
    v_targets := v_targets || v_target; v_sum := v_sum + v_w;
    v_norm := v_norm || jsonb_build_object('domain_id', s ->> 'domain_id', 'product_id', nullif(s ->> 'product_id', ''), 'consumer_principal_id', nullif(s ->> 'consumer_principal_id', ''), 'weight', v_w);
  END LOOP;
  IF abs(v_sum - 1) > 0.000000001 THEN
    RAISE EXCEPTION 'allocation key rejected (weights): the weights sum to %, not 1 — an allocation that does not account for the whole usage is unreliable', v_sum USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('cle_alloc:' || p_tenant::text || ':' || p_dimension));
  SELECT * INTO p FROM commercial.allocation_keys x WHERE x.tenant_id = p_tenant AND x.dimension = p_dimension ORDER BY x.version DESC LIMIT 1;
  IF FOUND AND p_effective_from <= p.effective_from THEN
    RAISE EXCEPTION 'allocation key rejected (stale): version % takes effect %; a new version takes effect after it', p.version, p.effective_from USING ERRCODE = '2F002';
  END IF;
  SELECT max(c.occurred_at) INTO v_last FROM commercial.cost_entries c
   WHERE c.tenant_id = p_tenant AND c.dimension = p_dimension AND c.allocation <> 'direct' AND c.occurred_at >= p_effective_from;
  IF v_last IS NOT NULL THEN
    RAISE EXCEPTION 'allocation key rejected (priced): tenant-level % usage that occurred at % is already priced and allocated; a key never re-allocates a priced entry (take effect after %)', p_dimension, v_last, v_last USING ERRCODE = '2F002';
  END IF;
  INSERT INTO commercial.allocation_keys (allocation_key_id, tenant_id, dimension, version, basis, shares, effective_from, reason, set_by, correlation_id)
  VALUES (p_key_id, p_tenant, p_dimension, coalesce(p.version, 0) + 1, btrim(p_basis), v_norm, p_effective_from, btrim(p_reason), p_actor, p_correlation)
  RETURNING * INTO k;
  RETURN to_jsonb(k) || jsonb_build_object('prior_version', p.version);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION commercial.set_allocation_key(uuid, uuid, text, text, jsonb, timestamptz, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.set_allocation_key(uuid, uuid, text, text, jsonb, timestamptz, text, uuid, uuid) TO eye_commit;

/* SET A BUDGET (commercial.budget.set — human-gated): the FIRST version by the tenant administrator (a named, active human holding
   tenant_admin in the tenant); a REVISION (p_expected_version = the current) by the administrator or the budget's current owner. The owner
   is a named, active human of the tenant — never an agent. The key (tenant, domain, capability, period) is fixed by the first version. The
   scope: the tenant's context for a tenant-level budget, a domain's for its own; the OWNER of a tenant-level budget may revise it from its
   own domain's context (the owner's roles — executive, strategy owner … — are domain roles). */
CREATE OR REPLACE FUNCTION commercial.set_budget(p_budget_id uuid, p_tenant uuid, p_domain uuid, p_label text, p_capability_key text, p_period_kind text, p_amount numeric,
                                                 p_currency text, p_owner uuid, p_thresholds int[], p_anomaly jsonb, p_expected_version int, p_reason text, p_actor uuid,
                                                 p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = commercial, observation, decision, identity, ctx, public, pg_catalog, pg_temp AS $$
DECLARE cur commercial.budgets%ROWTYPE; b commercial.budgets%ROWTYPE; v_admin boolean; v_thr int[]; v_k numeric; v_w int; v_anom jsonb; v_domain uuid := p_domain; v_cap text := p_capability_key; v_kind text := p_period_kind;
BEGIN
  PERFORM observation.assert_authority(ARRAY['commercial.budget.set']);
  PERFORM commercial.cle_assert_actor('budget', p_actor);
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'budget rejected (authority): a budget is set by a named, active human of the tenant — never an agent' USING ERRCODE = '42501'; END IF;
  v_admin := EXISTS (SELECT 1 FROM identity.role_bindings rb WHERE rb.principal_id = p_actor AND rb.role_code = 'tenant_admin' AND rb.scope = 'TENANT' AND rb.tenant_id = p_tenant AND rb.revoked_at IS NULL);
  IF p_expected_version IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('cle_budget:' || p_budget_id::text));
    cur := commercial.cle_budget_current(p_budget_id);
    IF cur.budget_id IS NULL OR cur.tenant_id <> p_tenant THEN RAISE EXCEPTION 'budget rejected (unknown_budget): % is not a budget of this tenant', p_budget_id USING ERRCODE = '23503'; END IF;
    v_domain := cur.domain_id; v_cap := cur.capability_key; v_kind := cur.period_kind;
  END IF;
  IF p_expected_version IS NOT NULL AND v_domain IS NULL AND public.eye_scope() = 'DOMAIN' AND public.eye_tenant() = p_tenant AND p_actor = cur.owner_principal_id THEN
    NULL;  -- the OWNER of a tenant-level budget revises it from its own domain's context (an owner's roles are domain roles)
  ELSE
    PERFORM commercial.cle_assert_tenant_scope('budget', p_tenant, v_domain);
  END IF;
  IF p_expected_version IS NULL THEN
    IF NOT v_admin THEN RAISE EXCEPTION 'budget rejected (authority): a budget is declared by the tenant administrator' USING ERRCODE = '42501'; END IF;
  ELSE
    IF cur.version <> p_expected_version THEN RAISE EXCEPTION 'budget rejected (stale): the budget is at version %, not %', cur.version, p_expected_version USING ERRCODE = '2F002'; END IF;
    IF NOT v_admin AND p_actor IS DISTINCT FROM cur.owner_principal_id THEN
      RAISE EXCEPTION 'budget rejected (ownership): a budget is revised by the tenant administrator or its owner' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF length(btrim(coalesce(p_label, ''))) NOT BETWEEN 4 AND 200 THEN RAISE EXCEPTION 'budget rejected (label): a budget is named (4–200 characters)' USING ERRCODE = '22023'; END IF;
  IF v_cap IS NULL OR v_cap !~ '^[a-z][a-z0-9_]{1,40}$' THEN RAISE EXCEPTION 'budget rejected (capability): the capability is a capability key, or all' USING ERRCODE = '22023'; END IF;
  IF v_kind IS NULL OR v_kind NOT IN ('month', 'quarter', 'year') THEN RAISE EXCEPTION 'budget rejected (period): the period is month, quarter or year' USING ERRCODE = '22023'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount >= 10000000000000000 THEN RAISE EXCEPTION 'budget rejected (amount): the amount is a positive number' USING ERRCODE = '22023'; END IF;
  IF p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'budget rejected (currency): the currency is an ISO 4217 code' USING ERRCODE = '22023'; END IF;
  IF v_domain IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tenancy.domains d WHERE d.id = v_domain AND d.tenant_id = p_tenant) THEN
    RAISE EXCEPTION 'budget rejected (unknown_domain): % is not a domain of this tenant', v_domain USING ERRCODE = '23503';
  END IF;
  IF p_owner IS NULL OR NOT decision.is_active_human(p_owner, p_tenant) THEN
    RAISE EXCEPTION 'budget rejected (owner): the owner is a named, active human of the tenant — never an agent' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}') INTO v_thr FROM unnest(coalesce(p_thresholds, ARRAY[80, 100])) x;
  IF cardinality(v_thr) NOT BETWEEN 1 AND 6 OR EXISTS (SELECT 1 FROM unnest(v_thr) x WHERE x IS NULL OR x < 1 OR x > 500) THEN
    RAISE EXCEPTION 'budget rejected (thresholds): 1 to 6 thresholds, each a percentage of the amount in [1, 500]' USING ERRCODE = '22023';
  END IF;
  v_anom := coalesce(p_anomaly, '{"k": 3, "window_days": 7}'::jsonb);
  IF jsonb_typeof(v_anom) <> 'object' OR jsonb_typeof(v_anom -> 'k') IS DISTINCT FROM 'number' OR jsonb_typeof(v_anom -> 'window_days') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'budget rejected (anomaly): the anomaly rule declares k and window_days' USING ERRCODE = '22023';
  END IF;
  v_k := (v_anom ->> 'k')::numeric; v_w := (v_anom ->> 'window_days')::numeric::int;
  IF v_k <= 1 OR v_k > 100 OR v_w < 3 OR v_w > 90 OR (v_anom ->> 'window_days')::numeric <> v_w THEN
    RAISE EXCEPTION 'budget rejected (anomaly): k is in (1, 100] and window_days an integer in [3, 90]' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 8 THEN RAISE EXCEPTION 'budget rejected (reason): a budget states its reason (at least 8 characters)' USING ERRCODE = '22023'; END IF;
  IF p_expected_version IS NULL AND EXISTS (SELECT 1 FROM commercial.budgets x WHERE x.version = 1 AND x.tenant_id = p_tenant AND x.domain_id IS NOT DISTINCT FROM v_domain
                                                  AND x.capability_key = v_cap AND x.period_kind = v_kind) THEN
    RAISE EXCEPTION 'budget rejected (duplicate): this tenant already has a % budget for % in this scope — revise it', v_kind, v_cap USING ERRCODE = '23505';
  END IF;
  INSERT INTO commercial.budgets (budget_id, version, scope, tenant_id, domain_id, label, capability_key, period_kind, amount, currency, owner_principal_id, thresholds, anomaly_rule, reason, set_by, correlation_id)
  VALUES (CASE WHEN p_expected_version IS NULL THEN p_budget_id ELSE cur.budget_id END, coalesce(cur.version, 0) + 1, CASE WHEN v_domain IS NULL THEN 'TENANT' ELSE 'DOMAIN' END, p_tenant, v_domain,
          btrim(p_label), v_cap, v_kind, p_amount, p_currency, p_owner, v_thr, jsonb_build_object('rule', 'cle-anomaly@1', 'k', v_k, 'window_days', v_w), btrim(p_reason), p_actor, p_correlation)
  RETURNING * INTO b;
  INSERT INTO commercial.budget_events (event_id, scope, tenant_id, domain_id, budget_id, budget_version, event, details, actor_principal_id, correlation_id)
  VALUES (p_event_id, b.scope, b.tenant_id, b.domain_id, b.budget_id, b.version, CASE WHEN b.version = 1 THEN 'declared' ELSE 'revised' END,
          jsonb_build_object('amount', b.amount, 'currency', b.currency, 'owner', b.owner_principal_id, 'thresholds', to_jsonb(b.thresholds), 'anomaly_rule', b.anomaly_rule, 'reason', b.reason,
                             'prior', CASE WHEN cur.budget_id IS NOT NULL THEN jsonb_build_object('version', cur.version, 'amount', cur.amount, 'owner', cur.owner_principal_id) END),
          p_actor, p_correlation);
  RETURN to_jsonb(b) || jsonb_build_object('variance', commercial.cle_variance(b, clock_timestamp()));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION commercial.set_budget(uuid, uuid, uuid, text, text, text, numeric, text, uuid, int[], jsonb, int, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.set_budget(uuid, uuid, uuid, text, text, text, numeric, text, uuid, int[], jsonb, int, text, uuid, uuid, uuid) TO eye_commit;

/* IMPORT AN INVOICE (commercial.invoice.import — the commercial authority, human-gated): the vendor's invoice of a tenant for a period, its
   lines per dimension × unit, their amounts summing to the total. SYNTHETIC only in this build — a real billing account is the external
   prerequisite (F-P7-F-02); a synthetic invoice demonstrates the reconciliation and closes no clause that needs the real one. */
CREATE OR REPLACE FUNCTION commercial.import_invoice(p_invoice_id uuid, p_tenant uuid, p_invoice_ref text, p_period_start date, p_period_end date, p_currency text, p_total numeric,
                                                     p_issuer text, p_synthetic boolean, p_lines jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = commercial, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE l jsonb; n int := 0; v_sum numeric := 0; v_digest text; i commercial.invoices%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['commercial.invoice.import']);
  PERFORM commercial.cle_assert_actor('invoice', p_actor);
  PERFORM commercial.cle_assert_commercial_authority('invoice', p_actor);
  IF NOT EXISTS (SELECT 1 FROM tenancy.tenants t WHERE t.id = p_tenant) THEN RAISE EXCEPTION 'invoice rejected (unknown_tenant): % is not a tenant', p_tenant USING ERRCODE = '23503'; END IF;
  IF p_synthetic IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'invoice rejected (synthetic): this build imports SYNTHETIC invoices only — a real billing account is the external prerequisite, and only it closes reconciliation to actual cost' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_invoice_ref, ''))) NOT BETWEEN 1 AND 80 OR length(btrim(coalesce(p_issuer, ''))) NOT BETWEEN 2 AND 200 THEN
    RAISE EXCEPTION 'invoice rejected (reference): an invoice names its reference (1–80 characters) and its issuer' USING ERRCODE = '22023';
  END IF;
  IF p_period_start IS NULL OR p_period_end IS NULL OR p_period_end < p_period_start THEN RAISE EXCEPTION 'invoice rejected (period): the period starts on or before it ends' USING ERRCODE = '22023'; END IF;
  IF p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'invoice rejected (currency): the currency is an ISO 4217 code' USING ERRCODE = '22023'; END IF;
  IF p_total IS NULL OR p_total < 0 THEN RAISE EXCEPTION 'invoice rejected (total): the total is at or above 0' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'invoice rejected (lines): an invoice has 1 to 200 lines' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM commercial.invoices x WHERE x.tenant_id = p_tenant AND x.invoice_ref = btrim(p_invoice_ref)) THEN
    RAISE EXCEPTION 'invoice rejected (duplicate): invoice % of this tenant is already imported', btrim(p_invoice_ref) USING ERRCODE = '23505';
  END IF;
  v_digest := encode(sha256(convert_to(jsonb_build_object('tenant', p_tenant, 'ref', btrim(p_invoice_ref), 'from', p_period_start, 'to', p_period_end, 'currency', p_currency, 'total', p_total,
                                                          'issuer', btrim(p_issuer), 'lines', p_lines)::text, 'UTF8')), 'hex');
  INSERT INTO commercial.invoices (invoice_id, tenant_id, invoice_ref, period_start, period_end, currency, total, issuer, synthetic, digest, imported_by, correlation_id)
  VALUES (p_invoice_id, p_tenant, btrim(p_invoice_ref), p_period_start, p_period_end, p_currency, p_total, btrim(p_issuer), true, v_digest, p_actor, p_correlation)
  RETURNING * INTO i;
  FOR l IN SELECT x FROM jsonb_array_elements(p_lines) x LOOP
    n := n + 1;
    IF jsonb_typeof(l) <> 'object' OR NOT (coalesce(l ->> 'dimension', '') = ANY (ARRAY['model_inference', 'source_consumption', 'storage', 'simulation_compute', 'product_consumption']))
       OR length(btrim(coalesce(l ->> 'unit', ''))) NOT BETWEEN 1 AND 40 OR jsonb_typeof(l -> 'quantity') IS DISTINCT FROM 'number' OR jsonb_typeof(l -> 'amount') IS DISTINCT FROM 'number'
       OR (l ->> 'quantity')::numeric < 0 OR (l ->> 'amount')::numeric < 0 OR round((l ->> 'amount')::numeric, 2) <> (l ->> 'amount')::numeric THEN
      RAISE EXCEPTION 'invoice rejected (lines): line % names a dimension, a unit, a quantity at or above 0 and an amount at or above 0 in cents', n USING ERRCODE = '22023';
    END IF;
    v_sum := v_sum + (l ->> 'amount')::numeric;
    INSERT INTO commercial.invoice_lines (invoice_id, line_no, tenant_id, dimension, unit, quantity, amount, description)
    VALUES (p_invoice_id, n, p_tenant, l ->> 'dimension', btrim(l ->> 'unit'), (l ->> 'quantity')::numeric, (l ->> 'amount')::numeric, left(nullif(btrim(l ->> 'description'), ''), 400));
  END LOOP;
  IF v_sum <> p_total THEN RAISE EXCEPTION 'invoice rejected (total): the lines sum to %, the total is %', v_sum, p_total USING ERRCODE = '22023'; END IF;
  RETURN to_jsonb(i) || jsonb_build_object('lines', (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.line_no) FROM commercial.invoice_lines x WHERE x.invoice_id = p_invoice_id));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION commercial.import_invoice(uuid, uuid, text, date, date, text, numeric, text, boolean, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.import_invoice(uuid, uuid, text, date, date, text, numeric, text, boolean, jsonb, uuid, uuid) TO eye_commit;

/* RECONCILE AN INVOICE (commercial.invoice.reconcile — the commercial authority, human-gated; V10-T-016, IA-70-002): per dimension, the
   invoice's quantity and amount against the ledger's (the tenant's cost entries in the invoice's currency that occurred in its period),
   with the differences; a line is within tolerance when |amount difference| ≤ the tolerance AND no usage of that dimension in the period is
   unpriced. The outcome is `matched` only when every line is — never inferred: unpriced usage, entries in another currency, or a dimension
   on one side only are differences. Each reconciliation is a new version; the earlier ones stand. */
CREATE OR REPLACE FUNCTION commercial.reconcile_invoice(p_reconciliation_id uuid, p_invoice_id uuid, p_tolerance numeric, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = commercial, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i commercial.invoices%ROWTYPE; v_from timestamptz; v_to timestamptz; v_lines jsonb; v_tol numeric := coalesce(p_tolerance, 0.01); v_outcome text; v_version int; r commercial.reconciliations%ROWTYPE;
        v_other int; v_totals jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['commercial.invoice.reconcile']);
  PERFORM commercial.cle_assert_actor('reconciliation', p_actor);
  PERFORM commercial.cle_assert_commercial_authority('reconciliation', p_actor);
  SELECT * INTO i FROM commercial.invoices x WHERE x.invoice_id = p_invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'reconciliation rejected (unknown_invoice): % is not an imported invoice', p_invoice_id USING ERRCODE = '23503'; END IF;
  IF v_tol < 0 OR v_tol > 1000000 THEN RAISE EXCEPTION 'reconciliation rejected (tolerance): the tolerance is an amount in [0, 1000000]' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('cle_recon:' || p_invoice_id::text));
  v_from := i.period_start::timestamp AT TIME ZONE 'UTC'; v_to := (i.period_end + 1)::timestamp AT TIME ZONE 'UTC';
  WITH inv AS (SELECT l.dimension, sum(l.quantity) q, sum(l.amount) a FROM commercial.invoice_lines l WHERE l.invoice_id = i.invoice_id GROUP BY l.dimension),
       led AS (SELECT c.dimension, sum(c.quantity) q, sum(c.amount) a FROM commercial.cost_entries c
                WHERE c.tenant_id = i.tenant_id AND c.currency = i.currency AND c.occurred_at >= v_from AND c.occurred_at < v_to GROUP BY c.dimension),
       unp AS (SELECT u.dimension, count(*) n FROM commercial.usage_records u
                WHERE u.tenant_id = i.tenant_id AND u.occurred_at >= v_from AND u.occurred_at < v_to AND NOT EXISTS (SELECT 1 FROM commercial.cost_entries c WHERE c.usage_id = u.usage_id) GROUP BY u.dimension),
       dims AS (SELECT dimension FROM inv UNION SELECT dimension FROM led UNION SELECT dimension FROM unp)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'dimension', d.dimension,
           'invoice_quantity', coalesce(inv.q, 0), 'ledger_quantity', coalesce(led.q, 0), 'quantity_difference', coalesce(inv.q, 0) - coalesce(led.q, 0),
           'invoice_amount', coalesce(inv.a, 0), 'ledger_amount', round(coalesce(led.a, 0), 6), 'amount_difference', round(coalesce(inv.a, 0) - coalesce(led.a, 0), 6),
           'unpriced_usage', coalesce(unp.n, 0),
           'on_invoice', inv.dimension IS NOT NULL, 'in_ledger', led.dimension IS NOT NULL,
           'within_tolerance', abs(coalesce(inv.a, 0) - coalesce(led.a, 0)) <= v_tol AND coalesce(unp.n, 0) = 0)
           ORDER BY d.dimension), '[]'::jsonb)
    INTO v_lines
    FROM dims d LEFT JOIN inv ON inv.dimension = d.dimension LEFT JOIN led ON led.dimension = d.dimension LEFT JOIN unp ON unp.dimension = d.dimension;
  SELECT count(*) INTO v_other FROM commercial.cost_entries c WHERE c.tenant_id = i.tenant_id AND c.currency <> i.currency AND c.occurred_at >= v_from AND c.occurred_at < v_to;
  v_outcome := CASE WHEN v_other = 0 AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_lines) x WHERE (x ->> 'within_tolerance')::boolean IS NOT TRUE) THEN 'matched' ELSE 'differences' END;
  v_totals := jsonb_build_object('invoice_total', i.total, 'ledger_total', round((SELECT coalesce(sum((x ->> 'ledger_amount')::numeric), 0) FROM jsonb_array_elements(v_lines) x), 6),
                                 'difference', round(i.total - (SELECT coalesce(sum((x ->> 'ledger_amount')::numeric), 0) FROM jsonb_array_elements(v_lines) x), 6),
                                 'currency', i.currency, 'other_currency_entries', v_other, 'period_start', i.period_start, 'period_end', i.period_end, 'synthetic_invoice', i.synthetic,
                                 'rule', 'cle-reconcile@1');
  SELECT coalesce(max(x.version), 0) + 1 INTO v_version FROM commercial.reconciliations x WHERE x.invoice_id = i.invoice_id;
  INSERT INTO commercial.reconciliations (reconciliation_id, tenant_id, invoice_id, version, tolerance, outcome, lines, totals, reconciled_by, correlation_id)
  VALUES (p_reconciliation_id, i.tenant_id, i.invoice_id, v_version, v_tol, v_outcome, v_lines, v_totals, p_actor, p_correlation)
  RETURNING * INTO r;
  RETURN to_jsonb(r) || jsonb_build_object('invoice_ref', i.invoice_ref);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION commercial.reconcile_invoice(uuid, uuid, numeric, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.reconcile_invoice(uuid, uuid, numeric, uuid, uuid) TO eye_commit;

/* RECORD AN OPTIMISATION (commercial.optimisation.record — the commercial authority, human-gated; IA-70-003/-005, DP-70-003/-005): the
   decision (adopt | defer) on an economic optimisation with its TRADE-OFFS stated. Each change names a control from the declared
   ADJUSTABLE vocabulary; a change of a PROTECTED control — named as the control, or as a key anywhere in what it changes from or to — is
   REFUSED (`optimisation rejected (boundary)`): nothing is recorded as adopted and nothing applies. An unknown control is refused, never
   assumed safe. A decision records; it applies nothing by itself. */
CREATE OR REPLACE FUNCTION commercial.record_optimisation(p_decision_id uuid, p_tenant uuid, p_title text, p_decision text, p_changes jsonb, p_tradeoffs jsonb, p_expected_saving jsonb,
                                                          p_rationale text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = commercial, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c jsonb; t jsonb; v_hit text[] := '{}'; v_keys text[]; v_controls text[] := '{}'; o commercial.optimisation_decisions%ROWTYPE; v_re text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['commercial.optimisation.record']);
  PERFORM commercial.cle_assert_actor('optimisation', p_actor);
  PERFORM commercial.cle_assert_commercial_authority('optimisation', p_actor);
  IF p_tenant IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tenancy.tenants x WHERE x.id = p_tenant) THEN RAISE EXCEPTION 'optimisation rejected (unknown_tenant): % is not a tenant', p_tenant USING ERRCODE = '23503'; END IF;
  IF length(btrim(coalesce(p_title, ''))) NOT BETWEEN 4 AND 200 OR length(btrim(coalesce(p_rationale, ''))) < 8 THEN
    RAISE EXCEPTION 'optimisation rejected (rationale): an optimisation is named (4–200 characters) and states its rationale (at least 8)' USING ERRCODE = '22023';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('adopt', 'defer') THEN RAISE EXCEPTION 'optimisation rejected (decision): the decision is adopt or defer' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(p_changes) IS DISTINCT FROM 'array' OR jsonb_array_length(p_changes) NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'optimisation rejected (changes): an optimisation lists 1 to 20 changes, each {control, from, to}' USING ERRCODE = '22023';
  END IF;
  v_re := '^(' || array_to_string(commercial.cle_protected_controls(), '|') || ')$';
  FOR c IN SELECT x FROM jsonb_array_elements(p_changes) x LOOP
    IF jsonb_typeof(c) <> 'object' OR length(btrim(coalesce(c ->> 'control', ''))) = 0 OR NOT (c ? 'to') THEN
      RAISE EXCEPTION 'optimisation rejected (changes): each change names its control and what it changes to' USING ERRCODE = '22023';
    END IF;
    IF lower(c ->> 'control') = ANY (commercial.cle_protected_controls()) THEN v_hit := v_hit || lower(c ->> 'control'); END IF;
    -- a protected control named as a KEY inside what the change touches (a residency move dressed as an instance resize)
    SELECT coalesce(array_agg(DISTINCT lower(k)), '{}') INTO v_keys
      FROM jsonb_path_query(jsonb_build_object('from', c -> 'from', 'to', c -> 'to'), 'lax $.** ? (@.type() == "object").keyvalue().key') k0(k0j), LATERAL (SELECT k0j #>> '{}' AS k) kk
     WHERE lower(k) ~ v_re;
    v_hit := v_hit || v_keys;
    v_controls := v_controls || lower(c ->> 'control');
  END LOOP;
  SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}') INTO v_hit FROM unnest(v_hit) x;
  IF jsonb_typeof(p_tradeoffs) IS DISTINCT FROM 'array' OR jsonb_array_length(p_tradeoffs) < 1 THEN
    RAISE EXCEPTION 'optimisation rejected (tradeoffs): an optimisation states its trade-offs (at least one: what is given up, for what)' USING ERRCODE = '22023';
  END IF;
  FOR t IN SELECT x FROM jsonb_array_elements(p_tradeoffs) x LOOP
    IF jsonb_typeof(t) <> 'object' OR length(btrim(coalesce(t ->> 'dimension', ''))) = 0 OR length(btrim(coalesce(t ->> 'effect', ''))) < 8 THEN
      RAISE EXCEPTION 'optimisation rejected (tradeoffs): each trade-off names its dimension and its effect (at least 8 characters)' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF cardinality(v_hit) > 0 THEN
    RAISE EXCEPTION 'optimisation rejected (boundary): "%" would change % — economic optimisation never weakens residency, isolation, retention or recovery (nor sovereignty, provenance, audit, evidence, human authority, accessibility, quality, freshness, durability or resilience: IA-70-003, DP-70-003); its stated trade-offs: %; nothing is adopted or applied',
      btrim(p_title), array_to_string(v_hit, ', '), left((SELECT string_agg((x ->> 'dimension') || ': ' || (x ->> 'effect'), '; ') FROM jsonb_array_elements(p_tradeoffs) x), 600) USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_controls) x WHERE NOT (x = ANY (commercial.cle_adjustable_controls()))) THEN
    RAISE EXCEPTION 'optimisation rejected (control): % — an optimisation changes only declared adjustable controls (%); an unknown control is never assumed safe',
      (SELECT string_agg(x, ', ') FROM unnest(v_controls) x WHERE NOT (x = ANY (commercial.cle_adjustable_controls()))), array_to_string(commercial.cle_adjustable_controls(), ', ') USING ERRCODE = '22023';
  END IF;
  IF p_expected_saving IS NOT NULL AND jsonb_typeof(p_expected_saving) <> 'null' AND (jsonb_typeof(p_expected_saving) <> 'object' OR jsonb_typeof(p_expected_saving -> 'amount') IS DISTINCT FROM 'number'
       OR coalesce(p_expected_saving ->> 'currency', '') !~ '^[A-Z]{3}$') THEN
    RAISE EXCEPTION 'optimisation rejected (saving): an expected saving is {amount, currency}' USING ERRCODE = '22023';
  END IF;
  INSERT INTO commercial.optimisation_decisions (decision_id, scope, tenant_id, title, decision, changes, tradeoffs, expected_saving, rationale, boundary_check, decided_by, correlation_id)
  VALUES (p_decision_id, CASE WHEN p_tenant IS NULL THEN 'PLATFORM' ELSE 'TENANT' END, p_tenant, btrim(p_title), p_decision, p_changes, p_tradeoffs, nullif(p_expected_saving, 'null'::jsonb),
          btrim(p_rationale), jsonb_build_object('rule', 'cle-boundary@1', 'protected', to_jsonb(commercial.cle_protected_controls()), 'changed_controls', to_jsonb(v_controls), 'protected_touched', '[]'::jsonb, 'passed', true),
          p_actor, p_correlation)
  RETURNING * INTO o;
  RETURN to_jsonb(o);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION commercial.record_optimisation(uuid, uuid, text, text, jsonb, jsonb, jsonb, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.record_optimisation(uuid, uuid, text, text, jsonb, jsonb, jsonb, text, uuid, uuid) TO eye_commit;

/* THE TICK STEP commercial-ledger (executive.attention.tick — the domain's active attention agent): (1) PRICE every usage record of the
   tenant visible to this domain's tick (this domain's, and the tenant-level ones) not yet priced, at the rate-card version in force at its
   occurred_at — a domain usage is one DIRECT entry; a tenant-level usage is ALLOCATED by the key in force (one entry per share) or kept
   UNALLOCATED; usage with no rate in force stays UNPRICED (counted, never zero); (2) the BUDGET THRESHOLDS (each declared percentage
   reached in the current period, once per budget version and period) and (3) the ANOMALY (cle-anomaly@1: today's spend > k × the mean
   daily spend of the previous window_days days, the mean > 0; once per budget and day) of every current budget of the tenant visible here
   — each recorded in budget_events and RAISED as a commercial.usage item to the budget's owner. Default-off: with no usage, no rate card
   and no budget, it writes nothing. Pricing is idempotent per usage record (unique (usage_id, line)). */
CREATE OR REPLACE FUNCTION commercial.ledger_tick(p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = commercial, observation, executive, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_now timestamptz := clock_timestamp(); u commercial.usage_records%ROWTYPE; r commercial.rate_cards%ROWTYPE; k commercial.allocation_keys%ROWTYPE; s record;
        v_priced int := 0; v_lines int := 0; v_n int; v_unpriced jsonb := '{}'::jsonb; v_key text; b commercial.budgets%ROWTYPE; v_var jsonb; t int; v_ev uuid; v_item uuid;
        v_thr jsonb := '[]'::jsonb; v_anom jsonb := '[]'::jsonb; v_today date := (v_now AT TIME ZONE 'UTC')::date; v_today_spend numeric; v_trailing numeric; v_kk numeric; v_w int;
        v_product uuid; v_consumer uuid; v_budgets int := 0; v_noted jsonb := '[]'::jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM commercial.cle_assert_actor('ledger tick', p_actor);
  IF NOT EXISTS (SELECT 1 FROM executive.agents a WHERE a.principal_id = p_actor AND a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.agent_kind = 'attention' AND a.status = 'active') THEN
    RAISE EXCEPTION 'ledger tick rejected (authority): the ledger is priced by the domain''s active attention agent' USING ERRCODE = '42501';
  END IF;
  -- (1) PRICE
  FOR u IN SELECT x.* FROM commercial.usage_records x
            WHERE x.tenant_id = p_tenant AND (x.domain_id = p_domain OR x.domain_id IS NULL) AND x.occurred_at <= v_now
              AND NOT EXISTS (SELECT 1 FROM commercial.cost_entries c WHERE c.usage_id = x.usage_id)
            ORDER BY x.occurred_at, x.usage_id LIMIT 5000 LOOP
    r := commercial.cle_rate_at(u.dimension, u.unit, u.occurred_at);
    IF r.rate_card_id IS NULL THEN
      v_key := u.dimension || ':' || u.unit;
      v_unpriced := jsonb_set(v_unpriced, ARRAY[v_key], to_jsonb(coalesce((v_unpriced ->> v_key)::int, 0) + 1));
      CONTINUE;
    END IF;
    v_product := CASE WHEN coalesce(u.details ->> 'product_id', '') ~ '^[0-9a-f-]{36}$' THEN (u.details ->> 'product_id')::uuid END;
    v_consumer := CASE WHEN coalesce(u.details ->> 'consumer_principal_id', '') ~ '^[0-9a-f-]{36}$' THEN (u.details ->> 'consumer_principal_id')::uuid END;
    k := NULL;
    IF u.domain_id IS NULL THEN k := commercial.cle_allocation_at(u.tenant_id, u.dimension, u.occurred_at); END IF;
    IF u.domain_id IS NOT NULL OR k.allocation_key_id IS NULL THEN
      INSERT INTO commercial.cost_entries (entry_id, usage_id, line, scope, tenant_id, domain_id, product_id, consumer_principal_id, capability_key, dimension, unit, asset_ref, profile,
                                           quantity, share, allocation, allocation_key_id, allocation_version, rate_card_id, rate_key, rate_version, price_per_unit, currency, amount,
                                           energy_kwh, energy_label, occurred_at, priced_by, correlation_id)
      VALUES (gen_random_uuid(), u.usage_id, 0, u.scope, u.tenant_id, u.domain_id, v_product, v_consumer, u.capability_key, u.dimension, u.unit,
              coalesce(nullif(u.details ->> 'asset', ''), u.source_kind), u.profile, u.quantity, 1, CASE WHEN u.domain_id IS NULL THEN 'unallocated' ELSE 'direct' END, NULL, NULL,
              r.rate_card_id, r.rate_key, r.version, r.price_per_unit, r.currency, u.quantity * r.price_per_unit,
              CASE WHEN r.energy_kwh_per_unit IS NOT NULL THEN u.quantity * r.energy_kwh_per_unit END, r.energy_label, u.occurred_at, p_actor, p_correlation)
      ON CONFLICT (usage_id, line) DO NOTHING;
      GET DIAGNOSTICS v_n = ROW_COUNT;
    ELSE
      INSERT INTO commercial.cost_entries (entry_id, usage_id, line, scope, tenant_id, domain_id, product_id, consumer_principal_id, capability_key, dimension, unit, asset_ref, profile,
                                           quantity, share, allocation, allocation_key_id, allocation_version, rate_card_id, rate_key, rate_version, price_per_unit, currency, amount,
                                           energy_kwh, energy_label, occurred_at, priced_by, correlation_id)
      SELECT gen_random_uuid(), u.usage_id, (sh.ord - 1)::int, 'DOMAIN', u.tenant_id, (sh.v ->> 'domain_id')::uuid,
             coalesce(nullif(sh.v ->> 'product_id', '')::uuid, v_product), coalesce(nullif(sh.v ->> 'consumer_principal_id', '')::uuid, v_consumer),
             u.capability_key, u.dimension, u.unit, coalesce(nullif(u.details ->> 'asset', ''), u.source_kind), u.profile,
             u.quantity * (sh.v ->> 'weight')::numeric, (sh.v ->> 'weight')::numeric, 'allocated', k.allocation_key_id, k.version,
             r.rate_card_id, r.rate_key, r.version, r.price_per_unit, r.currency, u.quantity * (sh.v ->> 'weight')::numeric * r.price_per_unit,
             CASE WHEN r.energy_kwh_per_unit IS NOT NULL THEN u.quantity * (sh.v ->> 'weight')::numeric * r.energy_kwh_per_unit END, r.energy_label, u.occurred_at, p_actor, p_correlation
        FROM jsonb_array_elements(k.shares) WITH ORDINALITY sh(v, ord)
      ON CONFLICT (usage_id, line) DO NOTHING;
      GET DIAGNOSTICS v_n = ROW_COUNT;
    END IF;
    IF v_n > 0 THEN v_priced := v_priced + 1; v_lines := v_lines + v_n; END IF;
  END LOOP;
  -- (2) THRESHOLDS and (3) ANOMALY, on every current budget of the tenant this domain's tick sees (its own domain's and the tenant's)
  FOR b IN SELECT DISTINCT ON (x.budget_id) x.* FROM commercial.budgets x
            WHERE x.tenant_id = p_tenant AND (x.domain_id IS NULL OR x.domain_id = p_domain) ORDER BY x.budget_id, x.version DESC LOOP
    v_budgets := v_budgets + 1;
    v_var := commercial.cle_variance(b, v_now);
    FOREACH t IN ARRAY b.thresholds LOOP
      CONTINUE WHEN (v_var ->> 'pct')::numeric < t;
      v_ev := gen_random_uuid(); v_item := gen_random_uuid();
      INSERT INTO commercial.budget_events (event_id, scope, tenant_id, domain_id, budget_id, budget_version, event, period_start, threshold, raised_in_domain, attention_item_id, details, actor_principal_id, correlation_id)
      VALUES (v_ev, b.scope, b.tenant_id, b.domain_id, b.budget_id, b.version, 'threshold', (v_var ->> 'period_start')::date, t, p_domain, v_item,
              jsonb_build_object('spent', v_var -> 'spent', 'amount', b.amount, 'currency', b.currency, 'pct', v_var -> 'pct', 'forecast', v_var -> 'forecast',
                                 'unpriced_usage', v_var -> 'unpriced_usage', 'complete', v_var -> 'complete', 'period_end', v_var -> 'period_end', 'by', 'tick'),
              p_actor, p_correlation)
      ON CONFLICT DO NOTHING;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n > 0 THEN
        PERFORM commercial.cle_notify(v_item, b, p_domain,
          format('Budget %s%% reached: %s — %s of %s %s spent this %s (forecast %s %s by %s)', t, b.label, round((v_var ->> 'spent')::numeric, 2), b.amount, b.currency, b.period_kind,
                 round((v_var ->> 'forecast')::numeric, 2), b.currency, v_var ->> 'period_end'),
          jsonb_build_array(format('%s%% of the %s budget is spent (threshold %s%%)', v_var ->> 'pct', b.period_kind, t),
                            CASE WHEN (v_var ->> 'complete')::boolean THEN 'every usage of the period is priced' ELSE format('%s usage record(s) of the period are UNPRICED (no rate in force): the spend is a floor, not complete', v_var ->> 'unpriced_usage') END,
                            'a budget raises; it never stops or deletes work'),
          v_ev, 'budget.threshold', jsonb_build_object('kind', 'threshold', 'threshold', t, 'variance', v_var), p_actor, p_correlation);
        v_thr := v_thr || jsonb_build_object('budget_id', b.budget_id, 'threshold', t, 'pct', v_var -> 'pct', 'event_id', v_ev, 'attention_item_id', v_item);
      END IF;
    END LOOP;
    -- the anomaly rule (cle-anomaly@1)
    v_kk := (b.anomaly_rule ->> 'k')::numeric; v_w := (b.anomaly_rule ->> 'window_days')::int;
    SELECT coalesce(sum(c.amount) FILTER (WHERE (c.occurred_at AT TIME ZONE 'UTC')::date = v_today), 0),
           coalesce(sum(c.amount) FILTER (WHERE (c.occurred_at AT TIME ZONE 'UTC')::date >= v_today - v_w AND (c.occurred_at AT TIME ZONE 'UTC')::date < v_today), 0) / v_w
      INTO v_today_spend, v_trailing
      FROM commercial.cost_entries c
     WHERE c.tenant_id = b.tenant_id AND (b.domain_id IS NULL OR c.domain_id = b.domain_id) AND (b.capability_key = 'all' OR c.capability_key = b.capability_key) AND c.currency = b.currency
       AND c.occurred_at >= ((v_today - v_w)::timestamp AT TIME ZONE 'UTC') AND c.occurred_at < ((v_today + 1)::timestamp AT TIME ZONE 'UTC');
    IF v_trailing > 0 AND v_today_spend > v_kk * v_trailing THEN
      v_ev := gen_random_uuid(); v_item := gen_random_uuid();
      INSERT INTO commercial.budget_events (event_id, scope, tenant_id, domain_id, budget_id, budget_version, event, day, raised_in_domain, attention_item_id, details, actor_principal_id, correlation_id)
      VALUES (v_ev, b.scope, b.tenant_id, b.domain_id, b.budget_id, b.version, 'anomaly', v_today, p_domain, v_item,
              jsonb_build_object('rule', 'cle-anomaly@1', 'today_spend', round(v_today_spend, 6), 'trailing_mean', round(v_trailing, 6), 'k', v_kk, 'window_days', v_w,
                                 'ratio', round(v_today_spend / v_trailing, 4), 'currency', b.currency, 'by', 'tick'),
              p_actor, p_correlation)
      ON CONFLICT DO NOTHING;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n > 0 THEN
        PERFORM commercial.cle_notify(v_item, b, p_domain,
          format('Spend anomaly: %s — %s %s today, %s× the %s-day mean of %s %s', b.label, round(v_today_spend, 2), b.currency, round(v_today_spend / v_trailing, 1), v_w, round(v_trailing, 2), b.currency),
          jsonb_build_array(format('today''s spend %s exceeds %s × the trailing mean %s (cle-anomaly@1)', round(v_today_spend, 2), v_kk, round(v_trailing, 2)),
                            'a budget raises; it never stops or deletes work'),
          v_ev, 'budget.anomaly', jsonb_build_object('kind', 'anomaly', 'today_spend', round(v_today_spend, 6), 'trailing_mean', round(v_trailing, 6), 'k', v_kk, 'window_days', v_w), p_actor, p_correlation);
        v_anom := v_anom || jsonb_build_object('budget_id', b.budget_id, 'day', v_today, 'today_spend', round(v_today_spend, 6), 'trailing_mean', round(v_trailing, 6), 'event_id', v_ev, 'attention_item_id', v_item);
      END IF;
    ELSIF v_trailing = 0 AND v_today_spend > 0 THEN
      v_noted := v_noted || jsonb_build_object('budget_id', b.budget_id, 'anomaly', 'no_baseline', 'note', format('no spend in the previous %s days: the anomaly rule has no baseline and is not applied', v_w));
    END IF;
  END LOOP;
  RETURN jsonb_build_object('priced_usage', v_priced, 'cost_lines', v_lines, 'unpriced', v_unpriced, 'budgets_evaluated', v_budgets, 'thresholds', v_thr, 'anomalies', v_anom, 'notes', v_noted, 'as_of', v_now);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION commercial.ledger_tick(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.ledger_tick(uuid, uuid, uuid, uuid) TO eye_commit;

-- ─────────────────────────────────────────────────────────────────────
-- §LE.4 THE READS
-- ─────────────────────────────────────────────────────────────────────
/* THE BUDGET VARIANCE (a guarded definer: the budget is read within its own scope — the tenant, a domain for its own and the tenant's
   budgets, as the budgets table's row security reads; N-01's rule): the current version's cle-variance@1 at the database's instant. */
CREATE OR REPLACE FUNCTION commercial.budget_variance(p_tenant uuid, p_budget_id uuid) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = commercial, observation, public, pg_catalog, pg_temp AS $$
DECLARE b commercial.budgets%ROWTYPE;
BEGIN
  b := commercial.cle_budget_current(p_budget_id);
  IF b.budget_id IS NULL OR b.tenant_id IS DISTINCT FROM p_tenant THEN RETURN NULL; END IF;
  IF b.domain_id IS NULL THEN
    -- a tenant-level budget is visible to its tenant and to each of the tenant's domains (the table's own policy)
    IF NOT (public.eye_tenant() = p_tenant AND public.eye_scope() IN ('TENANT', 'DOMAIN')) THEN PERFORM observation.assert_read_scope(p_tenant, NULL, 'a budget''s variance'); END IF;
  ELSE
    PERFORM observation.assert_read_scope(p_tenant, b.domain_id, 'a budget''s variance');
  END IF;
  RETURN commercial.cle_variance(b, clock_timestamp());
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION commercial.budget_variance(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.budget_variance(uuid, uuid) TO eye_app, eye_commit;

/* UNIT DATA COST (DQM-040): cost per governed unit — per asset (the usage's declared asset, else its source kind) + tenant + deployment
   profile + product + consumer + window — with the quantity, the unit and the entries. INVOKER: the caller's row security decides. */
CREATE OR REPLACE FUNCTION commercial.unit_data_cost(p_tenant uuid, p_from timestamptz, p_to timestamptz)
RETURNS TABLE (asset_ref text, tenant_id uuid, profile text, product_id uuid, consumer_principal_id uuid, dimension text, unit text, currency text,
               quantity numeric, amount numeric, unit_cost numeric, entries bigint, window_from timestamptz, window_to timestamptz)
LANGUAGE sql STABLE SET search_path = commercial, pg_catalog, pg_temp AS $$
  SELECT c.asset_ref, c.tenant_id, c.profile, c.product_id, c.consumer_principal_id, c.dimension, c.unit, c.currency,
         sum(c.quantity), round(sum(c.amount), 6), CASE WHEN sum(c.quantity) > 0 THEN round(sum(c.amount) / sum(c.quantity), 8) END, count(*), p_from, p_to
    FROM commercial.cost_entries c
   WHERE c.tenant_id = p_tenant AND c.occurred_at >= p_from AND c.occurred_at < p_to
   GROUP BY c.asset_ref, c.tenant_id, c.profile, c.product_id, c.consumer_principal_id, c.dimension, c.unit, c.currency
   ORDER BY c.dimension, c.asset_ref, c.product_id NULLS FIRST, c.consumer_principal_id NULLS FIRST
$$;
REVOKE ALL ON FUNCTION commercial.unit_data_cost(uuid, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.unit_data_cost(uuid, timestamptz, timestamptz) TO eye_app, eye_commit;

/* THE ENERGY ESTIMATE (IA-70-001's energy visibility, an ESTIMATE): kWh per dimension in a window from the rate cards' coefficients; the
   entries priced under a card WITHOUT a coefficient are counted as not estimated — never as zero. INVOKER: row security decides. */
CREATE OR REPLACE FUNCTION commercial.energy_estimate(p_tenant uuid, p_from timestamptz, p_to timestamptz)
RETURNS TABLE (dimension text, unit text, quantity numeric, energy_kwh numeric, entries_estimated bigint, entries_not_estimated bigint, label text, bases text[])
LANGUAGE sql STABLE SET search_path = commercial, pg_catalog, pg_temp AS $$
  SELECT c.dimension, c.unit, sum(c.quantity), round(sum(c.energy_kwh), 6), count(*) FILTER (WHERE c.energy_kwh IS NOT NULL), count(*) FILTER (WHERE c.energy_kwh IS NULL), 'ESTIMATE',
         (SELECT array_agg(DISTINCT r.energy_basis) FROM commercial.rate_cards r WHERE r.rate_card_id = ANY (array_agg(c.rate_card_id)) AND r.energy_basis IS NOT NULL)
    FROM commercial.cost_entries c
   WHERE c.tenant_id = p_tenant AND c.occurred_at >= p_from AND c.occurred_at < p_to
   GROUP BY c.dimension, c.unit
   ORDER BY c.dimension, c.unit
$$;
REVOKE ALL ON FUNCTION commercial.energy_estimate(uuid, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.energy_estimate(uuid, timestamptz, timestamptz) TO eye_app, eye_commit;

/* THE UNPRICED USAGE COUNTS for the commercial authority (a guarded definer, PLATFORM only): the prelude's usage isolation gives the vendor no
   row of a tenant's usage, so its view of a tenant's ledger could not otherwise say what is still UNPRICED — and a view that cannot see the
   gap must not claim completeness. Counts per dimension × unit only; no usage row leaves. The tenant's own contexts read the rows under RLS. */
CREATE OR REPLACE FUNCTION commercial.unpriced_usage_counts(p_tenant uuid, p_from timestamptz, p_to timestamptz)
RETURNS TABLE (dimension text, unit text, usage_records int)
STABLE SECURITY DEFINER SET search_path = commercial, public, pg_catalog, pg_temp AS $$
BEGIN
  IF public.eye_scope() IS DISTINCT FROM 'PLATFORM' THEN
    RAISE EXCEPTION 'read rejected (scope): the unpriced usage counts are the commercial authority''s (platform scope); a tenant reads its own usage' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT u.dimension, u.unit, count(*)::int FROM commercial.usage_records u
    WHERE u.tenant_id = p_tenant AND u.occurred_at >= p_from AND u.occurred_at < p_to AND NOT EXISTS (SELECT 1 FROM commercial.cost_entries c WHERE c.usage_id = u.usage_id)
    GROUP BY u.dimension, u.unit ORDER BY u.dimension, u.unit;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION commercial.unpriced_usage_counts(uuid, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commercial.unpriced_usage_counts(uuid, timestamptz, timestamptz) TO eye_app, eye_commit;
