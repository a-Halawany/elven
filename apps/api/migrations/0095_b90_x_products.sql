-- ═════════════════════════════════════════════════════════════════════
-- section `products`
-- ═════════════════════════════════════════════════════════════════════
-- 0095 §R — CP-6 B90 part `products` (2026-09-30): THE DATA PRODUCT REGISTRY COMPLETED (F-P7-F-09's product half; V7 ch5 DP-05-001/-002/
-- -005/-006, ch41 DP-41-001/-002/-003/-005/-006; App A DAT-SV-01, DAT-SV-10; App B DZ-06, DZ-16; App G DPD-01..11; App O DADR-016).
-- Built on §0 (the prelude): its registry, versions, reviews, the ONE SLO ledger and the event ledger are USED here, never re-declared.
--   §R.1  the canonical write actions of the lifecycle: products.product.withdraw and products.product.retire admit the DPR's withdrawn and
--         archived versions (the SAME object at the next object_version — 0078's lifecycle idiom, as 0094 §D's publication does)
--   §R.2  the tables: product_consumers (who consumes a product, under which contract version, for which purpose, with what impact —
--         DAT-SV-10, DP-41-002 "consumers"; the state registered → accepted → revoked | migrated), contract_tests (a consumer's test of a
--         contract version with its outcome and evidence — DP-41-006; append-only), scorecards (SLO attainment, reviews, consumer
--         acceptance, contract tests, lineage and policy closure, cost — computed on a schedule, never on read; append-only),
--         cost_attributions (a period's cost with its basis — DP-41-006; a period once; append-only)
--   §R.3  the release guard products.assert_release_consumers (DP-41-006: a BREAKING version is not released over an accepted consumer that
--         has no passing contract test on it — the release SERVICE calls it before admitting the DPR)
--   §R.4  the ports: register_consumer / accept_consumer_contract (THE CONSUMER's own act — DP-05-006 "consumer acceptance") /
--         revoke_consumer / migrate_consumer / record_contract_test (writes the test AND observes contract_test_pass into §0's ledger) /
--         attribute_cost / compute_scorecard (the owner's, the steward's, or the tick's) / degrade_product (the owner, the steward, or the
--         tick — every ACCEPTED consumer gets an attention item of class product.degradation) / restore_product (through a scorecard that
--         reads ok or a domain review newer than the degradation) / withdraw_product (the released version STAYS the last valid version;
--         the consumers notified the same way) / retire_product (no accepted consumer remains; an accepted retirement review; the DPR's
--         archived version admitted); the read products.product_scorecard (the latest scorecard with everything the page shows)
-- Refusal families (mapped in observation-errors.ts `/* B90 products */`): `data product consumer rejected (<class>)`, `contract test
-- rejected (<class>)`, `product scorecard rejected (<class>)`, `product cost rejected (<class>)`; the lifecycle ports use the prelude's
-- `data product rejected (<class>)`. Every figure a harness seeds is SYNTHETIC. Forward-only; §0 untouched.

-- ═════════════════════════════════════════════════════════════════════
-- §R.1 THE LIFECYCLE'S CANONICAL WRITE ACTIONS
-- ═════════════════════════════════════════════════════════════════════
INSERT INTO observation.canonical_write_actions (action, object_types, rationale) VALUES
  ('products.product.withdraw', ARRAY['DPR'], 'Withdrawing a released data product admits the DPR''s WITHDRAWN version (the same object at the next object_version, the reason in the header) and nothing else'),
  ('products.product.retire', ARRAY['DPR'], 'Retiring a data product admits the DPR''s ARCHIVED version (the retirement evidence: the reviews, the consumers released, the last valid version) and nothing else')
ON CONFLICT (action) DO NOTHING;

-- ═════════════════════════════════════════════════════════════════════
-- §R.2 THE TABLES
-- ═════════════════════════════════════════════════════════════════════
CREATE TABLE products.product_consumers (
  consumer_id            uuid PRIMARY KEY,
  scope                  text NOT NULL,
  tenant_id              uuid NOT NULL,
  domain_id              uuid NOT NULL,
  product_id             uuid NOT NULL REFERENCES products.products_current (product_id),
  consumer_principal_id  uuid NOT NULL,                     -- a human or an agent of the tenant (active)
  consumer_domain_id     uuid,                              -- the domain the consumer serves (NULL: the product's own)
  purpose                text NOT NULL CHECK (length(btrim(purpose)) >= 8),
  impact                 text,                              -- what breaks downstream when this product breaks (the notification's substance)
  contract_version       int  NOT NULL CHECK (contract_version >= 1),
  state                  text NOT NULL DEFAULT 'registered' CHECK (state IN ('registered', 'accepted', 'revoked', 'migrated')),
  usage                  jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(usage) = 'object'),
  registered_by          uuid NOT NULL,
  registered_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  accepted_at            timestamptz,
  accepted_by            uuid,
  revoked_at             timestamptz,
  revoked_by             uuid,
  revocation_reason      text,
  migrated_from          uuid REFERENCES products.product_consumers (consumer_id),   -- the row this one continues (a migration)
  migrated_to            uuid REFERENCES products.product_consumers (consumer_id) DEFERRABLE INITIALLY DEFERRED,   -- the row that continues this one (written before it exists: the old row closes first, so the live-once index admits the new one)
  migrated_at            timestamptz,
  updated_at             timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id         uuid NOT NULL,
  CONSTRAINT prc_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT prc_accepted_bound CHECK ((state = 'registered') = (accepted_at IS NULL) OR state = 'registered'),
  CONSTRAINT prc_accept_pair CHECK ((accepted_at IS NULL) = (accepted_by IS NULL)),
  CONSTRAINT prc_revoked_bound CHECK ((state = 'revoked') = (revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND revocation_reason IS NOT NULL)),
  CONSTRAINT prc_migrated_bound CHECK ((state = 'migrated') = (migrated_to IS NOT NULL AND migrated_at IS NOT NULL))
);
CREATE INDEX prc_product ON products.product_consumers (product_id, state, registered_at);
CREATE INDEX prc_consumer ON products.product_consumers (consumer_principal_id, state);
/* One LIVE registration per consumer per product (a revoked or migrated one may be followed by another). */
CREATE UNIQUE INDEX prc_live_once ON products.product_consumers (product_id, consumer_principal_id) WHERE state IN ('registered', 'accepted');
CREATE TRIGGER prc_no_delete BEFORE DELETE ON products.product_consumers FOR EACH ROW EXECUTE FUNCTION products.no_delete();
COMMENT ON TABLE products.product_consumers IS 'B90 (0095 §R): the consumer registry (DAT-SV-10; DP-41-002) — who consumes a product, under which contract version, for which purpose, with what downstream impact; registered → ACCEPTED (the consumer''s own act, DP-05-006) → revoked | migrated (a new row continues it on the newer version). Never deleted.';

CREATE TABLE products.contract_tests (
  test_id         uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  product_id      uuid NOT NULL REFERENCES products.products_current (product_id),
  consumer_id     uuid NOT NULL REFERENCES products.product_consumers (consumer_id),
  version         int  NOT NULL CHECK (version >= 1),
  outcome         text NOT NULL CHECK (outcome IN ('pass', 'fail')),
  evidence        jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
  recorded_by     uuid NOT NULL,
  recorded_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT prt_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX prt_product ON products.contract_tests (product_id, version, consumer_id, recorded_at DESC);
CREATE TRIGGER prt_append_only BEFORE UPDATE OR DELETE ON products.contract_tests FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE products.contract_tests IS 'B90 (0095 §R): a consumer''s test of a contract version with its outcome and evidence (DP-41-006 "consumer contract tests"); every test also lands in the one SLO ledger as contract_test_pass. Append-only.';

CREATE TABLE products.scorecards (
  scorecard_id      uuid PRIMARY KEY,
  scope             text NOT NULL,
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  product_id        uuid NOT NULL REFERENCES products.products_current (product_id),
  computed_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  computed_by       uuid NOT NULL,                     -- the owner, the steward, or the attention agent (the tick)
  window_days       int  NOT NULL CHECK (window_days BETWEEN 1 AND 366),
  state_at          text NOT NULL,                     -- the product's state when computed (never part of the verdict)
  released_version  int,
  slo               jsonb NOT NULL CHECK (jsonb_typeof(slo) = 'object'),        -- measure → {observations, met, attainment_pct, last_value, threshold, last_observed_at}
  attainment_pct    numeric,                           -- the least attainment among the measures observed in the window; NULL when none
  floor_pct         numeric NOT NULL,                  -- declaration.slo.attainment_floor_pct (default 95)
  below_floor       boolean NOT NULL,
  reviews           jsonb NOT NULL CHECK (jsonb_typeof(reviews) = 'object'),    -- kind → the latest outcome
  consumers         jsonb NOT NULL CHECK (jsonb_typeof(consumers) = 'object'),  -- {registered, accepted, revoked, migrated}
  contract_tests    jsonb NOT NULL CHECK (jsonb_typeof(contract_tests) = 'object'),   -- {pass, fail, version}
  lineage_closed    boolean NOT NULL,                  -- every input names a kind and a ref, and there is at least one
  policy_closed     boolean NOT NULL,                  -- purposes and data_classes declared
  cost              jsonb,                             -- the latest attribution (NULL when none)
  overall           text NOT NULL CHECK (overall IN ('ok', 'degraded', 'failing')),
  reasons           jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(reasons) = 'array'),
  digest            text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  correlation_id    uuid NOT NULL,
  CONSTRAINT prs_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX prs_product ON products.scorecards (product_id, computed_at DESC);
CREATE TRIGGER prs_append_only BEFORE UPDATE OR DELETE ON products.scorecards FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE products.scorecards IS 'B90 (0095 §R): the product scorecard (DP-05-006, DP-41-006) — SLO attainment over a window, the reviews, the consumers, the contract tests, lineage and policy closure, the latest cost; computed by the tick step product-scorecards (order 64) or on demand, NEVER on read. Append-only.';

CREATE TABLE products.cost_attributions (
  attribution_id  uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  product_id      uuid NOT NULL REFERENCES products.products_current (product_id),
  period_start    date NOT NULL,
  period_end      date NOT NULL,
  amount          numeric(18,2) NOT NULL CHECK (amount >= 0),
  currency        text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  basis           text NOT NULL CHECK (length(btrim(basis)) BETWEEN 2 AND 400),
  details         jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  attributed_by   uuid NOT NULL,
  attributed_at   timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT prk_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT prk_period CHECK (period_start < period_end),
  CONSTRAINT prk_period_once UNIQUE (product_id, period_start, period_end)
);
CREATE INDEX prk_product ON products.cost_attributions (product_id, period_end DESC);
CREATE TRIGGER prk_append_only BEFORE UPDATE OR DELETE ON products.cost_attributions FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE products.cost_attributions IS 'B90 (0095 §R): a period''s cost of a product with its basis (DP-41-006) — a period attributed once; the scorecard carries the latest. Append-only.';

-- RLS and grants (the 0081 loop idiom; the prelude's policy text; the ports write)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['product_consumers', 'contract_tests', 'scorecards', 'cost_attributions'] LOOP
    EXECUTE format('REVOKE ALL ON products.%I FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE products.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE products.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY products_isolation ON products.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON products.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- ═════════════════════════════════════════════════════════════════════
-- §R.3 THE RELEASE GUARD (DP-41-006): a BREAKING version over accepted consumers without a passing contract test
-- ═════════════════════════════════════════════════════════════════════
/* Called by the release SERVICE (products.service.ts release(), under products.product.release) BEFORE the DPR is admitted: when the
   version's declaration says contract.compatibility = 'breaking', every ACCEPTED consumer of the product must hold a PASSING contract
   test on that version — otherwise the release is refused and the consumers NAMED. A compatible version passes. Answers what it checked. */
CREATE OR REPLACE FUNCTION products.assert_release_consumers(p_product_id uuid, p_version int) RETURNS jsonb
SECURITY DEFINER SET search_path = products, pg_catalog, pg_temp AS $$
DECLARE r products.products_current%ROWTYPE; v products.product_versions%ROWTYPE; v_missing text[]; v_accepted int;
BEGIN
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = p_product_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'data product rejected (unknown_product): % is not a product of this domain', p_product_id USING ERRCODE = '22023'; END IF;
  SELECT * INTO v FROM products.product_versions x WHERE x.product_id = p_product_id AND x.version = p_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'data product rejected (unknown_version): product % has no version %', r.product_key, p_version USING ERRCODE = '22023'; END IF;
  SELECT count(*) INTO v_accepted FROM products.product_consumers c WHERE c.product_id = p_product_id AND c.state = 'accepted';
  IF (v.declaration #>> '{contract,compatibility}') IS DISTINCT FROM 'breaking' THEN
    RETURN jsonb_build_object('version', p_version, 'compatibility', coalesce(v.declaration #>> '{contract,compatibility}', 'unstated'), 'accepted_consumers', v_accepted, 'checked', false);
  END IF;
  SELECT coalesce(array_agg(c.consumer_id::text ORDER BY c.registered_at), '{}') INTO v_missing
    FROM products.product_consumers c
   WHERE c.product_id = p_product_id AND c.state = 'accepted'
     AND NOT EXISTS (SELECT 1 FROM products.contract_tests t WHERE t.product_id = p_product_id AND t.consumer_id = c.consumer_id AND t.version = p_version AND t.outcome = 'pass');
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'data product rejected (contract_tests): publication denied — version % of product % is BREAKING and accepted consumer(s) % hold no passing contract test on it', p_version, r.product_key, array_to_string(v_missing, ', ') USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('version', p_version, 'compatibility', 'breaking', 'accepted_consumers', v_accepted, 'checked', true);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.assert_release_consumers(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.assert_release_consumers(uuid, int) TO eye_commit;

-- ═════════════════════════════════════════════════════════════════════
-- §R.4 THE PORTS
-- ═════════════════════════════════════════════════════════════════════
/* REGISTER A CONSUMER (products.consumer.register): the consumer's own act, or a steward's (data_steward / domain_admin / platform_admin)
   for a named consumer — a human or an agent of the tenant, active; the product RELEASED (or degraded); one live registration per consumer
   per product; the contract version adopted is the released one (the acceptance names it again — DP-05-006). */
CREATE OR REPLACE FUNCTION products.register_consumer(
  p_consumer_id uuid, p_product_id uuid, p_tenant uuid, p_domain uuid, p_consumer uuid, p_consumer_domain uuid, p_purpose text, p_impact text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r products.products_current%ROWTYPE; c products.product_consumers%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.consumer.register']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'data product consumer rejected (actor): registered by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_consumer IS DISTINCT FROM p_actor AND NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['data_steward', 'domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'data product consumer rejected (authority): a consumer registers itself, or a data steward registers it' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = p_product_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'data product consumer rejected (unknown_product): % is not a product of this domain', p_product_id USING ERRCODE = '22023'; END IF;
  IF r.state NOT IN ('released', 'degraded') THEN RAISE EXCEPTION 'data product consumer rejected (state): product % is %; a consumer registers on a released product', r.product_key, r.state USING ERRCODE = '22023'; END IF;
  IF p_consumer IS NULL OR NOT EXISTS (SELECT 1 FROM identity.principals x WHERE x.id = p_consumer AND x.tenant_id = p_tenant AND x.kind IN ('human', 'agent') AND x.status = 'active') THEN
    RAISE EXCEPTION 'data product consumer rejected (unknown_consumer): the consumer is a named, active human or agent of the tenant' USING ERRCODE = '22023';
  END IF;
  IF p_purpose IS NULL OR length(btrim(p_purpose)) < 8 THEN RAISE EXCEPTION 'data product consumer rejected (purpose): a consumer states its purpose (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM products.product_consumers x WHERE x.product_id = p_product_id AND x.consumer_principal_id = p_consumer AND x.state IN ('registered', 'accepted')) THEN
    RAISE EXCEPTION 'data product consumer rejected (duplicate): principal % is already a live consumer of product %', p_consumer, r.product_key USING ERRCODE = '23505';
  END IF;
  INSERT INTO products.product_consumers (consumer_id, scope, tenant_id, domain_id, product_id, consumer_principal_id, consumer_domain_id, purpose, impact, contract_version, registered_by, correlation_id)
  VALUES (p_consumer_id, 'DOMAIN', p_tenant, p_domain, p_product_id, p_consumer, coalesce(p_consumer_domain, p_domain), btrim(p_purpose), NULLIF(btrim(coalesce(p_impact, '')), ''), r.released_version, p_actor, p_correlation)
  RETURNING * INTO c;
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_product_id, 'consumer.registered', p_actor,
          jsonb_build_object('consumer_id', p_consumer_id, 'consumer_principal_id', p_consumer, 'contract_version', r.released_version, 'purpose', btrim(p_purpose)), p_correlation);
  RETURN to_jsonb(c) - 'scope' - 'tenant_id' - 'domain_id' - 'correlation_id';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.register_consumer(uuid,uuid,uuid,uuid,uuid,uuid,text,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.register_consumer(uuid,uuid,uuid,uuid,uuid,uuid,text,text,uuid,uuid,uuid) TO eye_commit;

/* ACCEPT THE CONTRACT (products.consumer.accept) — DP-05-006 "consumer acceptance": THE CONSUMER's own act (nobody accepts for it), naming
   the contract version it accepts, which must be the RELEASED one; registered → accepted. */
CREATE OR REPLACE FUNCTION products.accept_consumer_contract(
  p_consumer_id uuid, p_product_id uuid, p_tenant uuid, p_domain uuid, p_version int, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r products.products_current%ROWTYPE; c products.product_consumers%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.consumer.accept']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'data product consumer rejected (actor): accepted by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = p_product_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'data product consumer rejected (unknown_product): % is not a product of this domain', p_product_id USING ERRCODE = '22023'; END IF;
  SELECT * INTO c FROM products.product_consumers x WHERE x.consumer_id = p_consumer_id AND x.product_id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'data product consumer rejected (unknown_consumer): % is not a consumer of product %', p_consumer_id, r.product_key USING ERRCODE = '22023'; END IF;
  IF c.consumer_principal_id <> p_actor THEN RAISE EXCEPTION 'data product consumer rejected (not_consumer): a contract is accepted by the consumer itself — nobody accepts for it' USING ERRCODE = '42501'; END IF;
  IF c.state <> 'registered' THEN RAISE EXCEPTION 'data product consumer rejected (state): consumer % is %; acceptance follows registration once', p_consumer_id, c.state USING ERRCODE = '22023'; END IF;
  IF r.state NOT IN ('released', 'degraded') THEN RAISE EXCEPTION 'data product consumer rejected (state): product % is %; there is no released contract to accept', r.product_key, r.state USING ERRCODE = '22023'; END IF;
  IF p_version IS NULL OR p_version <> r.released_version THEN
    RAISE EXCEPTION 'data product consumer rejected (version): the accepted contract version is the released one — version % of product % (not %)', r.released_version, r.product_key, coalesce(p_version::text, 'null') USING ERRCODE = '22023';
  END IF;
  UPDATE products.product_consumers SET state = 'accepted', contract_version = p_version, accepted_at = clock_timestamp(), accepted_by = p_actor, updated_at = clock_timestamp()
   WHERE consumer_id = p_consumer_id RETURNING * INTO c;
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_product_id, 'consumer.accepted', p_actor,
          jsonb_build_object('consumer_id', p_consumer_id, 'consumer_principal_id', c.consumer_principal_id, 'contract_version', p_version), p_correlation);
  RETURN to_jsonb(c) - 'scope' - 'tenant_id' - 'domain_id' - 'correlation_id';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.accept_consumer_contract(uuid,uuid,uuid,uuid,int,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.accept_consumer_contract(uuid,uuid,uuid,uuid,int,uuid,uuid,uuid) TO eye_commit;

/* REVOKE A CONSUMER (products.consumer.revoke): the product's owner, the consumer itself, or a steward; a reason; registered | accepted → revoked. */
CREATE OR REPLACE FUNCTION products.revoke_consumer(
  p_consumer_id uuid, p_product_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r products.products_current%ROWTYPE; c products.product_consumers%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.consumer.revoke']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'data product consumer rejected (actor): revoked by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = p_product_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'data product consumer rejected (unknown_product): % is not a product of this domain', p_product_id USING ERRCODE = '22023'; END IF;
  SELECT * INTO c FROM products.product_consumers x WHERE x.consumer_id = p_consumer_id AND x.product_id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'data product consumer rejected (unknown_consumer): % is not a consumer of product %', p_consumer_id, r.product_key USING ERRCODE = '22023'; END IF;
  IF p_actor <> r.owner_principal_id AND p_actor <> c.consumer_principal_id AND NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['data_steward', 'domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'data product consumer rejected (authority): a consumer is revoked by the product''s owner, by the consumer itself, or by a data steward' USING ERRCODE = '42501';
  END IF;
  IF c.state NOT IN ('registered', 'accepted') THEN RAISE EXCEPTION 'data product consumer rejected (state): consumer % is already %', p_consumer_id, c.state USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'data product consumer rejected (reason): a revocation names its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  UPDATE products.product_consumers SET state = 'revoked', revoked_at = clock_timestamp(), revoked_by = p_actor, revocation_reason = btrim(p_reason), updated_at = clock_timestamp()
   WHERE consumer_id = p_consumer_id RETURNING * INTO c;
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_product_id, 'consumer.revoked', p_actor,
          jsonb_build_object('consumer_id', p_consumer_id, 'consumer_principal_id', c.consumer_principal_id, 'reason', btrim(p_reason), 'was', CASE WHEN c.accepted_at IS NULL THEN 'registered' ELSE 'accepted' END), p_correlation);
  RETURN to_jsonb(c) - 'scope' - 'tenant_id' - 'domain_id' - 'correlation_id';
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.revoke_consumer(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.revoke_consumer(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid) TO eye_commit;

/* MIGRATE A CONSUMER (products.consumer.migrate): THE CONSUMER's own act (a migration is an acceptance of the newer contract) — from an
   accepted registration to the product's NEWER released version; refused unless a PASSING contract test of this consumer on that version
   exists (DP-41-006). The old row closes as `migrated` and a NEW row continues it, accepted on the new version. */
CREATE OR REPLACE FUNCTION products.migrate_consumer(
  p_consumer_id uuid, p_new_consumer_id uuid, p_product_id uuid, p_tenant uuid, p_domain uuid, p_version int, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r products.products_current%ROWTYPE; c products.product_consumers%ROWTYPE; n products.product_consumers%ROWTYPE; v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.consumer.migrate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'data product consumer rejected (actor): migrated by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = p_product_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'data product consumer rejected (unknown_product): % is not a product of this domain', p_product_id USING ERRCODE = '22023'; END IF;
  SELECT * INTO c FROM products.product_consumers x WHERE x.consumer_id = p_consumer_id AND x.product_id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'data product consumer rejected (unknown_consumer): % is not a consumer of product %', p_consumer_id, r.product_key USING ERRCODE = '22023'; END IF;
  IF c.consumer_principal_id <> p_actor THEN RAISE EXCEPTION 'data product consumer rejected (not_consumer): a consumer migrates itself — a migration is its acceptance of the newer contract' USING ERRCODE = '42501'; END IF;
  IF c.state <> 'accepted' THEN RAISE EXCEPTION 'data product consumer rejected (state): consumer % is %; only an accepted consumer migrates', p_consumer_id, c.state USING ERRCODE = '22023'; END IF;
  IF r.state NOT IN ('released', 'degraded') THEN RAISE EXCEPTION 'data product consumer rejected (state): product % is %; there is no released contract to migrate to', r.product_key, r.state USING ERRCODE = '22023'; END IF;
  IF p_version IS NULL OR p_version <> r.released_version OR p_version <= c.contract_version THEN
    RAISE EXCEPTION 'data product consumer rejected (version): a migration moves to the newer released version — version % of product % (the consumer holds %, asked %)', r.released_version, r.product_key, c.contract_version, coalesce(p_version::text, 'null') USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM products.contract_tests t WHERE t.product_id = p_product_id AND t.consumer_id = p_consumer_id AND t.version = p_version AND t.outcome = 'pass') THEN
    RAISE EXCEPTION 'data product consumer rejected (contract_tests): consumer % holds no passing contract test on version % of product %; record one first', p_consumer_id, p_version, r.product_key USING ERRCODE = '22023';
  END IF;
  -- the old row closes FIRST (one live registration per consumer per product — prc_live_once), then the new row continues it
  UPDATE products.product_consumers SET state = 'migrated', migrated_to = p_new_consumer_id, migrated_at = v_now, updated_at = v_now WHERE consumer_id = p_consumer_id;
  INSERT INTO products.product_consumers (consumer_id, scope, tenant_id, domain_id, product_id, consumer_principal_id, consumer_domain_id, purpose, impact, contract_version, state, usage, registered_by, registered_at,
                                          accepted_at, accepted_by, migrated_from, correlation_id)
  VALUES (p_new_consumer_id, 'DOMAIN', p_tenant, p_domain, p_product_id, c.consumer_principal_id, c.consumer_domain_id, c.purpose, c.impact, p_version, 'accepted', c.usage, p_actor, v_now, v_now, p_actor, p_consumer_id, p_correlation)
  RETURNING * INTO n;
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_product_id, 'consumer.migrated', p_actor,
          jsonb_build_object('consumer_id', p_consumer_id, 'new_consumer_id', p_new_consumer_id, 'consumer_principal_id', c.consumer_principal_id, 'from_version', c.contract_version, 'to_version', p_version), p_correlation);
  RETURN (to_jsonb(n) - 'scope' - 'tenant_id' - 'domain_id' - 'correlation_id') || jsonb_build_object('migrated_from_version', c.contract_version);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.migrate_consumer(uuid,uuid,uuid,uuid,uuid,int,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.migrate_consumer(uuid,uuid,uuid,uuid,uuid,int,uuid,uuid,uuid) TO eye_commit;

/* RECORD A CONTRACT TEST (products.product.contract_test): the consumer itself, the product's owner, or a steward records a consumer's test
   of a DECLARED version with its outcome and evidence; the test lands in the one SLO ledger as contract_test_pass (1 | 0, threshold 1)
   through §0's observe_slo under this same action. Never on a retired product (observe_slo refuses it). */
CREATE OR REPLACE FUNCTION products.record_contract_test(
  p_test_id uuid, p_product_id uuid, p_consumer_id uuid, p_tenant uuid, p_domain uuid, p_version int, p_outcome text, p_evidence jsonb, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r products.products_current%ROWTYPE; c products.product_consumers%ROWTYPE; t products.contract_tests%ROWTYPE; v_obs jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.product.contract_test']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'contract test rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = p_product_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'contract test rejected (unknown_product): % is not a product of this domain', p_product_id USING ERRCODE = '22023'; END IF;
  SELECT * INTO c FROM products.product_consumers x WHERE x.consumer_id = p_consumer_id AND x.product_id = p_product_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'contract test rejected (unknown_consumer): % is not a consumer of product %', p_consumer_id, r.product_key USING ERRCODE = '22023'; END IF;
  IF p_actor <> c.consumer_principal_id AND p_actor <> r.owner_principal_id AND NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['data_steward', 'domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'contract test rejected (authority): a contract test is recorded by the consumer, the product''s owner, or a data steward' USING ERRCODE = '42501';
  END IF;
  IF c.state NOT IN ('registered', 'accepted') THEN RAISE EXCEPTION 'contract test rejected (state): consumer % is %; a live consumer tests', p_consumer_id, c.state USING ERRCODE = '22023'; END IF;
  IF r.state = 'retired' THEN RAISE EXCEPTION 'contract test rejected (state): product % is retired', r.product_key USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM products.product_versions v WHERE v.product_id = p_product_id AND v.version = p_version) THEN
    RAISE EXCEPTION 'contract test rejected (unknown_version): product % has no version %', r.product_key, coalesce(p_version::text, 'null') USING ERRCODE = '22023';
  END IF;
  IF p_outcome IS NULL OR p_outcome NOT IN ('pass', 'fail') THEN RAISE EXCEPTION 'contract test rejected (outcome): a contract test passes or fails' USING ERRCODE = '22023'; END IF;
  IF p_evidence IS NOT NULL AND jsonb_typeof(p_evidence) <> 'object' THEN RAISE EXCEPTION 'contract test rejected (evidence): a contract test''s evidence is an object' USING ERRCODE = '22023'; END IF;
  INSERT INTO products.contract_tests (test_id, scope, tenant_id, domain_id, product_id, consumer_id, version, outcome, evidence, recorded_by, correlation_id)
  VALUES (p_test_id, 'DOMAIN', p_tenant, p_domain, p_product_id, p_consumer_id, p_version, p_outcome, coalesce(p_evidence, '{}'::jsonb), p_actor, p_correlation) RETURNING * INTO t;
  v_obs := products.observe_slo(gen_random_uuid(), p_product_id, p_tenant, p_domain, 'contract_test_pass', CASE WHEN p_outcome = 'pass' THEN 1 ELSE 0 END, 1, p_outcome = 'pass',
                                format('contract test of consumer %s', left(p_consumer_id::text, 8)), jsonb_build_object('test_id', p_test_id, 'consumer_id', p_consumer_id, 'version', p_version), p_actor, p_correlation);
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_product_id, 'contract_test.recorded', p_actor,
          jsonb_build_object('test_id', p_test_id, 'consumer_id', p_consumer_id, 'version', p_version, 'outcome', p_outcome, 'observation_id', v_obs ->> 'observation_id'), p_correlation);
  RETURN (to_jsonb(t) - 'scope' - 'tenant_id' - 'domain_id' - 'correlation_id') || jsonb_build_object('observation', v_obs);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.record_contract_test(uuid,uuid,uuid,uuid,uuid,int,text,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.record_contract_test(uuid,uuid,uuid,uuid,uuid,int,text,jsonb,uuid,uuid,uuid) TO eye_commit;

/* ATTRIBUTE A PERIOD'S COST (products.product.cost.attribute): the owner or a steward; a period (start < end) ONCE; an amount ≥ 0 in an
   ISO-4217 currency with its basis. Never on a retired product. */
CREATE OR REPLACE FUNCTION products.attribute_cost(
  p_attribution_id uuid, p_product_id uuid, p_tenant uuid, p_domain uuid, p_period_start date, p_period_end date, p_amount numeric, p_currency text, p_basis text, p_details jsonb, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r products.products_current%ROWTYPE; k products.cost_attributions%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.product.cost.attribute']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'product cost rejected (actor): attributed by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = p_product_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'product cost rejected (unknown_product): % is not a product of this domain', p_product_id USING ERRCODE = '22023'; END IF;
  IF p_actor <> r.owner_principal_id AND NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['data_steward', 'domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'product cost rejected (authority): a cost is attributed by the product''s owner or by a data steward' USING ERRCODE = '42501';
  END IF;
  IF r.state = 'retired' THEN RAISE EXCEPTION 'product cost rejected (state): product % is retired', r.product_key USING ERRCODE = '22023'; END IF;
  IF p_period_start IS NULL OR p_period_end IS NULL OR p_period_start >= p_period_end THEN RAISE EXCEPTION 'product cost rejected (period): a period runs from a start day to a later end day' USING ERRCODE = '22023'; END IF;
  IF p_amount IS NULL OR p_amount < 0 THEN RAISE EXCEPTION 'product cost rejected (amount): a cost is a non-negative amount' USING ERRCODE = '22023'; END IF;
  IF p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'product cost rejected (currency): a currency is an ISO-4217 code' USING ERRCODE = '22023'; END IF;
  IF p_basis IS NULL OR length(btrim(p_basis)) NOT BETWEEN 2 AND 400 THEN RAISE EXCEPTION 'product cost rejected (basis): a cost names its basis (2–400 characters)' USING ERRCODE = '22023'; END IF;
  IF p_details IS NOT NULL AND jsonb_typeof(p_details) <> 'object' THEN RAISE EXCEPTION 'product cost rejected (details): a cost''s details are an object' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM products.cost_attributions x WHERE x.product_id = p_product_id AND x.period_start = p_period_start AND x.period_end = p_period_end) THEN
    RAISE EXCEPTION 'product cost rejected (duplicate): the period % – % of product % is already attributed', p_period_start, p_period_end, r.product_key USING ERRCODE = '23505';
  END IF;
  INSERT INTO products.cost_attributions (attribution_id, scope, tenant_id, domain_id, product_id, period_start, period_end, amount, currency, basis, details, attributed_by, correlation_id)
  VALUES (p_attribution_id, 'DOMAIN', p_tenant, p_domain, p_product_id, p_period_start, p_period_end, p_amount, p_currency, btrim(p_basis), coalesce(p_details, '{}'::jsonb), p_actor, p_correlation) RETURNING * INTO k;
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_product_id, 'cost.attributed', p_actor,
          jsonb_build_object('attribution_id', p_attribution_id, 'period_start', p_period_start, 'period_end', p_period_end, 'amount', k.amount::text, 'currency', p_currency, 'basis', btrim(p_basis)), p_correlation);
  -- money leaves as a DECIMAL STRING with its two places (a JSON number would drop them and become a float on the wire)
  RETURN (to_jsonb(k) - 'scope' - 'tenant_id' - 'domain_id' - 'correlation_id') || jsonb_build_object('amount', k.amount::text);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.attribute_cost(uuid,uuid,uuid,uuid,date,date,numeric,text,text,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.attribute_cost(uuid,uuid,uuid,uuid,date,date,numeric,text,text,jsonb,uuid,uuid,uuid) TO eye_commit;

/* COMPUTE THE SCORECARD (products.product.scorecard.compute — the owner or a steward — OR executive.attention.tick — the step
   product-scorecards): on a released or degraded product, over a window of days ending at the DATABASE's instant. THE SLO: per measure
   observed in the window, the observations, how many met, the attainment percentage, the last value and threshold; the product's
   attainment is the LEAST among its measures (NULL when nothing was observed); the floor is declaration.slo.attainment_floor_pct
   (default 95). THE VERDICT: failing when the attainment is under the floor or every contract test on the released version fails;
   degraded when something is open (no observation in the window, a failing contract test, lineage or policy not closed); ok otherwise.
   The product's own state is RECORDED (state_at), never part of the verdict — a degraded product's scorecard reads ok when its levels
   recover, which is what its restoration needs. Answers the consecutive below-floor scorecards SINCE the last release or restoration
   (the tick degrades at declaration.slo.grace_ticks, default 2). */
CREATE OR REPLACE FUNCTION products.compute_scorecard(
  p_scorecard_id uuid, p_product_id uuid, p_tenant uuid, p_domain uuid, p_window_days int, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r products.products_current%ROWTYPE; s products.scorecards%ROWTYPE; q record; v_now timestamptz := clock_timestamp(); v_window int := coalesce(p_window_days, 30);
        v_slo jsonb; v_att numeric; v_floor numeric; v_grace int; v_below boolean; v_reviews jsonb; v_consumers jsonb; v_tests jsonb; v_lineage boolean; v_policy boolean; v_cost jsonb;
        v_overall text; v_reasons jsonb := '[]'::jsonb; v_body jsonb; v_digest text; v_since timestamptz; v_consecutive int := 0; v_pass int; v_fail int; v_floor_txt text; v_grace_txt text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.product.scorecard.compute', 'executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'product scorecard rejected (actor): computed by the acting principal' USING ERRCODE = '42501'; END IF;
  IF v_window NOT BETWEEN 1 AND 366 THEN RAISE EXCEPTION 'product scorecard rejected (window): a scorecard window is 1 to 366 days' USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = p_product_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'product scorecard rejected (unknown_product): % is not a product of this domain', p_product_id USING ERRCODE = '22023'; END IF;
  IF p_actor <> r.owner_principal_id AND public.eye_bound_action() <> 'executive.attention.tick' AND NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['data_steward', 'domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'product scorecard rejected (authority): a scorecard is computed by the product''s owner, by a data steward, or by the attention tick' USING ERRCODE = '42501';
  END IF;
  IF r.state NOT IN ('released', 'degraded') THEN RAISE EXCEPTION 'product scorecard rejected (state): product % is %; a scorecard is computed on a released or degraded product', r.product_key, r.state USING ERRCODE = '22023'; END IF;
  -- the SLO over the window
  SELECT coalesce(jsonb_object_agg(m.measure, jsonb_build_object('observations', m.n, 'met', m.met_n, 'attainment_pct', m.att, 'last_value', m.last_value, 'threshold', m.threshold, 'last_observed_at', m.last_at)), '{}'::jsonb), min(m.att)
    INTO v_slo, v_att
    FROM (SELECT o.measure, count(*) AS n, count(*) FILTER (WHERE o.met) AS met_n, round(100.0 * (count(*) FILTER (WHERE o.met)) / count(*), 2) AS att,
                 (array_agg(o.value ORDER BY o.observed_at DESC))[1] AS last_value, (array_agg(o.threshold ORDER BY o.observed_at DESC))[1] AS threshold, max(o.observed_at) AS last_at
            FROM products.slo_observations o WHERE o.product_id = p_product_id AND o.observed_at >= v_now - make_interval(days => v_window) GROUP BY o.measure) m;
  v_floor_txt := r.declaration #>> '{slo,attainment_floor_pct}';
  v_floor := CASE WHEN v_floor_txt ~ '^[0-9]{1,3}(\.[0-9]{1,2})?$' AND v_floor_txt::numeric <= 100 THEN v_floor_txt::numeric ELSE 95 END;
  v_grace_txt := r.declaration #>> '{slo,grace_ticks}';
  v_grace := CASE WHEN v_grace_txt ~ '^[0-9]{1,2}$' AND v_grace_txt::int BETWEEN 1 AND 24 THEN v_grace_txt::int ELSE 2 END;
  v_below := v_att IS NOT NULL AND v_att < v_floor;
  -- the reviews: the latest outcome per kind
  SELECT coalesce(jsonb_object_agg(k.kind, jsonb_build_object('outcome', k.outcome, 'version', k.version, 'reviewed_at', k.reviewed_at, 'reviewer_principal_id', k.reviewer_principal_id)), '{}'::jsonb) INTO v_reviews
    FROM (SELECT DISTINCT ON (x.kind) x.kind, x.outcome, x.version, x.reviewed_at, x.reviewer_principal_id FROM products.product_reviews x WHERE x.product_id = p_product_id ORDER BY x.kind, x.reviewed_at DESC) k;
  -- the consumers and the contract tests on the released version
  SELECT jsonb_build_object('registered', count(*) FILTER (WHERE c.state = 'registered'), 'accepted', count(*) FILTER (WHERE c.state = 'accepted'),
                            'revoked', count(*) FILTER (WHERE c.state = 'revoked'), 'migrated', count(*) FILTER (WHERE c.state = 'migrated'))
    INTO v_consumers FROM products.product_consumers c WHERE c.product_id = p_product_id;
  SELECT count(*) FILTER (WHERE t.outcome = 'pass'), count(*) FILTER (WHERE t.outcome = 'fail') INTO v_pass, v_fail
    FROM products.contract_tests t WHERE t.product_id = p_product_id AND t.version = r.released_version;
  v_tests := jsonb_build_object('pass', v_pass, 'fail', v_fail, 'version', r.released_version);
  -- lineage and policy closure (DP-41-002: the declaration names where it comes from and what it may be used for)
  v_lineage := jsonb_typeof(r.declaration -> 'inputs') = 'array' AND jsonb_array_length(r.declaration -> 'inputs') > 0
               AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r.declaration -> 'inputs') i WHERE jsonb_typeof(i -> 'kind') <> 'string' OR length(btrim(coalesce(i ->> 'ref', ''))) = 0);
  v_policy := jsonb_typeof(r.declaration #> '{policy,purposes}') = 'array' AND jsonb_array_length(r.declaration #> '{policy,purposes}') > 0
              AND jsonb_typeof(r.declaration #> '{policy,data_classes}') = 'array' AND jsonb_array_length(r.declaration #> '{policy,data_classes}') > 0;
  SELECT (to_jsonb(k) - 'scope' - 'tenant_id' - 'domain_id' - 'correlation_id') || jsonb_build_object('amount', k.amount::text) INTO v_cost
    FROM products.cost_attributions k WHERE k.product_id = p_product_id ORDER BY k.period_end DESC, k.attributed_at DESC LIMIT 1;
  -- the verdict, with its reasons in words
  IF v_att IS NULL THEN v_reasons := v_reasons || to_jsonb(format('no SLO observation in the last %s day(s)', v_window)); END IF;
  IF v_below THEN v_reasons := v_reasons || to_jsonb(format('SLO attainment %s%% is under the floor %s%%', v_att, v_floor)); END IF;
  IF v_fail > 0 THEN v_reasons := v_reasons || to_jsonb(format('%s failing contract test(s) on version %s (%s passing)', v_fail, r.released_version, v_pass)); END IF;
  IF NOT v_lineage THEN v_reasons := v_reasons || to_jsonb('lineage is not closed: the declaration names no input, or an input without a kind and a ref'::text); END IF;
  IF NOT v_policy THEN v_reasons := v_reasons || to_jsonb('policy is not closed: purposes and data_classes are both declared when the policy is closed'::text); END IF;
  v_overall := CASE WHEN v_below OR (v_fail > 0 AND v_pass = 0) THEN 'failing' WHEN jsonb_array_length(v_reasons) > 0 THEN 'degraded' ELSE 'ok' END;
  v_body := jsonb_build_object('product_id', p_product_id, 'computed_at', v_now, 'window_days', v_window, 'state_at', r.state, 'released_version', r.released_version, 'slo', v_slo, 'attainment_pct', v_att,
                               'floor_pct', v_floor, 'below_floor', v_below, 'reviews', v_reviews, 'consumers', v_consumers, 'contract_tests', v_tests, 'lineage_closed', v_lineage, 'policy_closed', v_policy,
                               'cost', v_cost, 'overall', v_overall, 'reasons', v_reasons);
  v_digest := encode(digest(v_body::text, 'sha256'), 'hex');
  INSERT INTO products.scorecards (scorecard_id, scope, tenant_id, domain_id, product_id, computed_at, computed_by, window_days, state_at, released_version, slo, attainment_pct, floor_pct, below_floor, reviews, consumers,
                                   contract_tests, lineage_closed, policy_closed, cost, overall, reasons, digest, correlation_id)
  VALUES (p_scorecard_id, 'DOMAIN', p_tenant, p_domain, p_product_id, v_now, p_actor, v_window, r.state, r.released_version, v_slo, v_att, v_floor, v_below, v_reviews, v_consumers,
          v_tests, v_lineage, v_policy, v_cost, v_overall, v_reasons, v_digest, p_correlation) RETURNING * INTO s;
  -- the consecutive below-floor scorecards since the last release or restoration (the degradation counts only what followed the last human act)
  SELECT max(e.occurred_at) INTO v_since FROM products.product_events e WHERE e.product_id = p_product_id AND e.event IN ('product.released', 'product.restored');
  FOR q IN SELECT x.below_floor FROM products.scorecards x WHERE x.product_id = p_product_id AND (v_since IS NULL OR x.computed_at > v_since) ORDER BY x.computed_at DESC LOOP
    EXIT WHEN NOT q.below_floor;
    v_consecutive := v_consecutive + 1;
  END LOOP;
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_product_id, 'scorecard.computed', p_actor,
          jsonb_build_object('scorecard_id', p_scorecard_id, 'overall', v_overall, 'attainment_pct', v_att, 'floor_pct', v_floor, 'below_floor', v_below, 'consecutive_below_floor', v_consecutive, 'window_days', v_window,
                             'by', CASE WHEN public.eye_bound_action() = 'executive.attention.tick' THEN 'the attention tick step product-scorecards' ELSE 'on demand' END), p_correlation);
  RETURN (to_jsonb(s) - 'scope' - 'tenant_id' - 'domain_id' - 'correlation_id') || jsonb_build_object('consecutive_below_floor', v_consecutive, 'grace_ticks', v_grace);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.compute_scorecard(uuid,uuid,uuid,uuid,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.compute_scorecard(uuid,uuid,uuid,uuid,int,uuid,uuid) TO eye_commit;

/* DEGRADE (products.product.degrade — the owner or a steward — OR executive.attention.tick — the step, after grace_ticks consecutive
   below-floor scorecards): released → degraded with a reason, NEVER silently: every ACCEPTED consumer gets an attention item of class
   product.degradation (subject kind product), routed to the consumer when it is an active human, else by the class's roles under the
   active policy (0094 §D's idiom for raising an item from a port); the event names every item raised. */
CREATE OR REPLACE FUNCTION products.degrade_product(
  p_product_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, decision, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r products.products_current%ROWTYPE; c record; pol executive.attention_policies%ROWTYPE; v_now timestamptz := clock_timestamp(); v_by_tick boolean := public.eye_bound_action() = 'executive.attention.tick';
        v_item uuid; v_cause uuid; v_owner uuid; v_eval jsonb; v_route jsonb; v_state text; v_notified jsonb := '[]'::jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.product.degrade', 'executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'data product rejected (actor): degraded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = p_product_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'data product rejected (unknown_product): % is not a product of this domain', p_product_id USING ERRCODE = '22023'; END IF;
  IF NOT v_by_tick AND p_actor <> r.owner_principal_id AND NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['data_steward', 'domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'data product rejected (authority): a product is degraded by its owner, by a data steward, or by the attention tick' USING ERRCODE = '42501';
  END IF;
  IF r.state <> 'released' THEN RAISE EXCEPTION 'data product rejected (state): product % is %; a released product degrades', r.product_key, r.state USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'data product rejected (reason): a degradation names its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  UPDATE products.products_current SET state = 'degraded', degraded_reason = btrim(p_reason), degraded_at = v_now, updated_at = v_now WHERE product_id = p_product_id RETURNING * INTO r;
  SELECT * INTO pol FROM executive.attention_policies a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.state = 'active';
  FOR c IN SELECT x.* FROM products.product_consumers x WHERE x.product_id = p_product_id AND x.state = 'accepted' ORDER BY x.registered_at LOOP
    v_item := gen_random_uuid(); v_cause := gen_random_uuid();
    v_owner := CASE WHEN decision.is_active_human(c.consumer_principal_id, p_tenant) THEN c.consumer_principal_id END;
    v_eval := executive.evaluate_attention(CASE WHEN pol.policy_id IS NULL THEN NULL ELSE pol.rules END, 'product.degradation',
                                           jsonb_build_object('consequence', 'C2', 'confidence', 1, 'hours_to_window', 0)) || jsonb_build_object('policy_version', pol.version);
    v_route := executive.attention_route(pol.rules, 'product.degradation', v_eval ->> 'outcome', v_owner, p_tenant, p_domain);
    v_state := v_route ->> 'state';
    INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state,
                                           owner_principal_id, route_roles, policy_id, policy_version, evaluation, details, due_at, escalations, correlation_id)
    VALUES (v_item, 'DOMAIN', p_tenant, p_domain, 'product.degradation', 'product', p_product_id, v_cause, 'ProductDegraded',
            left(format('Product %s DEGRADED: %s', r.product_key, btrim(p_reason)), 512), v_eval ->> 'outcome', v_state,
            v_owner, ARRAY(SELECT jsonb_array_elements_text(v_route -> 'route_roles')), pol.policy_id, pol.version, v_eval,
            jsonb_build_object('product_id', p_product_id, 'product_key', r.product_key, 'consumer_id', c.consumer_id, 'consumer_principal_id', c.consumer_principal_id, 'contract_version', c.contract_version,
                               'impact', c.impact, 'reason', btrim(p_reason), 'last_valid_version', r.released_version, 'raised_at', v_now,
                               'by', CASE WHEN v_by_tick THEN 'the attention tick step product-scorecards' ELSE 'the degradation port' END),
            (v_route ->> 'due_at')::timestamptz, (v_route ->> 'escalations')::int, p_correlation);
    PERFORM executive.attention_event(v_item, p_tenant, p_domain,
              CASE v_state WHEN 'open' THEN 'item.routed' WHEN 'escalated' THEN 'item.escalated' WHEN 'unrouted' THEN 'item.unrouted' ELSE 'item.deprioritized' END,
              p_actor, jsonb_build_object('outcome', v_eval ->> 'outcome', 'reasons', v_eval -> 'reasons', 'policy_version', pol.version, 'owner', v_owner, 'route_roles', v_route -> 'route_roles',
                                          'due_at', v_route -> 'due_at', 'cause_event_id', v_cause, 'cause_event_type', 'ProductDegraded', 'unrouted', coalesce((v_route ->> 'unrouted')::boolean, false)), p_correlation);
    v_notified := v_notified || jsonb_build_object('consumer_id', c.consumer_id, 'consumer_principal_id', c.consumer_principal_id, 'item_id', v_item, 'state', v_state, 'owner', v_owner);
  END LOOP;
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_product_id, 'product.degraded', p_actor,
          jsonb_build_object('reason', btrim(p_reason), 'by', CASE WHEN v_by_tick THEN 'tick' ELSE 'human' END, 'notified', v_notified, 'released_version', r.released_version), p_correlation);
  RETURN products.product_json(r) || jsonb_build_object('notified', v_notified);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.degrade_product(uuid,uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.degrade_product(uuid,uuid,uuid,text,uuid,uuid,uuid) TO eye_commit;

/* RESTORE (products.product.restore): the OWNER's act; degraded → released ONLY through evidence — the latest scorecard reads ok, or an
   accepted DOMAIN review newer than the degradation; otherwise the owner releases a new version (the prelude's release clears the
   degradation — "restore through controlled release"). */
CREATE OR REPLACE FUNCTION products.restore_product(
  p_product_id uuid, p_tenant uuid, p_domain uuid, p_note text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r products.products_current%ROWTYPE; v_now timestamptz := clock_timestamp(); v_card record; v_review record; v_basis text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.product.restore']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'data product rejected (actor): restored by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = p_product_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'data product rejected (unknown_product): % is not a product of this domain', p_product_id USING ERRCODE = '22023'; END IF;
  IF r.owner_principal_id <> p_actor THEN RAISE EXCEPTION 'data product rejected (not_owner): product % is restored by its owner', r.product_key USING ERRCODE = '42501'; END IF;
  IF r.state <> 'degraded' THEN RAISE EXCEPTION 'data product rejected (state): product % is %; a degraded product is restored', r.product_key, r.state USING ERRCODE = '22023'; END IF;
  SELECT s.scorecard_id, s.overall, s.computed_at INTO v_card FROM products.scorecards s WHERE s.product_id = p_product_id ORDER BY s.computed_at DESC LIMIT 1;
  SELECT x.review_id, x.reviewed_at INTO v_review FROM products.product_reviews x WHERE x.product_id = p_product_id AND x.kind = 'domain' AND x.outcome = 'accepted' AND x.reviewed_at > r.degraded_at ORDER BY x.reviewed_at DESC LIMIT 1;
  IF v_card.scorecard_id IS NOT NULL AND v_card.overall = 'ok' THEN v_basis := 'scorecard';
  ELSIF v_review.review_id IS NOT NULL THEN v_basis := 'domain_review';
  ELSE
    RAISE EXCEPTION 'data product rejected (review): product % stays degraded — the latest scorecard reads % and no accepted domain review is newer than the degradation at %; restore through a domain review or a controlled release',
      r.product_key, coalesce(v_card.overall, 'nothing (none computed)'), r.degraded_at USING ERRCODE = '22023';
  END IF;
  UPDATE products.products_current SET state = 'released', degraded_reason = NULL, degraded_at = NULL, updated_at = v_now WHERE product_id = p_product_id RETURNING * INTO r;
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_product_id, 'product.restored', p_actor,
          jsonb_build_object('basis', v_basis, 'scorecard_id', v_card.scorecard_id, 'scorecard_overall', v_card.overall, 'review_id', v_review.review_id, 'note', NULLIF(btrim(coalesce(p_note, '')), '')), p_correlation);
  RETURN products.product_json(r) || jsonb_build_object('restored_on', v_basis);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.restore_product(uuid,uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.restore_product(uuid,uuid,uuid,text,uuid,uuid,uuid) TO eye_commit;

/* WITHDRAW (products.product.withdraw): the OWNER's act with a reason; released | degraded → withdrawn; the released version STAYS the
   last valid version (readable; nothing is deleted); the DPR's WITHDRAWN version admitted by the service in this write BEFORE the port
   (the same object at the next object_version, lifecycle withdrawn, the reason in the header — missing → refused); every ACCEPTED
   consumer notified the same way as a degradation (class product.degradation, cause ProductWithdrawn). */
CREATE OR REPLACE FUNCTION products.withdraw_product(
  p_product_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_object_version bigint, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, objects, decision, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r products.products_current%ROWTYPE; c record; pol executive.attention_policies%ROWTYPE; v_now timestamptz := clock_timestamp();
        v_item uuid; v_cause uuid; v_owner uuid; v_eval jsonb; v_route jsonb; v_state text; v_notified jsonb := '[]'::jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.product.withdraw']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'data product rejected (actor): withdrawn by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = p_product_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'data product rejected (unknown_product): % is not a product of this domain', p_product_id USING ERRCODE = '22023'; END IF;
  IF r.owner_principal_id <> p_actor THEN RAISE EXCEPTION 'data product rejected (not_owner): product % is withdrawn by its owner', r.product_key USING ERRCODE = '42501'; END IF;
  IF r.state NOT IN ('released', 'degraded') THEN RAISE EXCEPTION 'data product rejected (state): product % is %; a released or degraded product is withdrawn', r.product_key, r.state USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'data product rejected (reason): a withdrawal names its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  IF p_object_version IS NULL OR NOT EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = p_product_id AND o.object_type = 'DPR' AND o.tenant_id = p_tenant AND o.object_version = p_object_version
                                                 AND o.lifecycle_state = 'withdrawn' AND o.withdrawal_reason IS NOT NULL) THEN
    RAISE EXCEPTION 'data product rejected (canonical): the withdrawn DPR version of product % was not admitted in this write', r.product_key USING ERRCODE = '22023';
  END IF;
  UPDATE products.products_current SET state = 'withdrawn', withdrawn_at = v_now, withdrawn_by = p_actor, withdrawal_reason = btrim(p_reason), degraded_reason = NULL, degraded_at = NULL, updated_at = v_now
   WHERE product_id = p_product_id RETURNING * INTO r;
  SELECT * INTO pol FROM executive.attention_policies a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.state = 'active';
  FOR c IN SELECT x.* FROM products.product_consumers x WHERE x.product_id = p_product_id AND x.state = 'accepted' ORDER BY x.registered_at LOOP
    v_item := gen_random_uuid(); v_cause := gen_random_uuid();
    v_owner := CASE WHEN decision.is_active_human(c.consumer_principal_id, p_tenant) THEN c.consumer_principal_id END;
    v_eval := executive.evaluate_attention(CASE WHEN pol.policy_id IS NULL THEN NULL ELSE pol.rules END, 'product.degradation',
                                           jsonb_build_object('consequence', 'C2', 'confidence', 1, 'hours_to_window', 0)) || jsonb_build_object('policy_version', pol.version);
    v_route := executive.attention_route(pol.rules, 'product.degradation', v_eval ->> 'outcome', v_owner, p_tenant, p_domain);
    v_state := v_route ->> 'state';
    INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state,
                                           owner_principal_id, route_roles, policy_id, policy_version, evaluation, details, due_at, escalations, correlation_id)
    VALUES (v_item, 'DOMAIN', p_tenant, p_domain, 'product.degradation', 'product', p_product_id, v_cause, 'ProductWithdrawn',
            left(format('Product %s WITHDRAWN: %s (last valid version %s)', r.product_key, btrim(p_reason), r.released_version), 512), v_eval ->> 'outcome', v_state,
            v_owner, ARRAY(SELECT jsonb_array_elements_text(v_route -> 'route_roles')), pol.policy_id, pol.version, v_eval,
            jsonb_build_object('product_id', p_product_id, 'product_key', r.product_key, 'consumer_id', c.consumer_id, 'consumer_principal_id', c.consumer_principal_id, 'contract_version', c.contract_version,
                               'impact', c.impact, 'reason', btrim(p_reason), 'last_valid_version', r.released_version, 'dpr_object_version', p_object_version, 'raised_at', v_now, 'by', 'the withdrawal port'),
            (v_route ->> 'due_at')::timestamptz, (v_route ->> 'escalations')::int, p_correlation);
    PERFORM executive.attention_event(v_item, p_tenant, p_domain,
              CASE v_state WHEN 'open' THEN 'item.routed' WHEN 'escalated' THEN 'item.escalated' WHEN 'unrouted' THEN 'item.unrouted' ELSE 'item.deprioritized' END,
              p_actor, jsonb_build_object('outcome', v_eval ->> 'outcome', 'reasons', v_eval -> 'reasons', 'policy_version', pol.version, 'owner', v_owner, 'route_roles', v_route -> 'route_roles',
                                          'due_at', v_route -> 'due_at', 'cause_event_id', v_cause, 'cause_event_type', 'ProductWithdrawn', 'unrouted', coalesce((v_route ->> 'unrouted')::boolean, false)), p_correlation);
    v_notified := v_notified || jsonb_build_object('consumer_id', c.consumer_id, 'consumer_principal_id', c.consumer_principal_id, 'item_id', v_item, 'state', v_state, 'owner', v_owner);
  END LOOP;
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_product_id, 'product.withdrawn', p_actor,
          jsonb_build_object('reason', btrim(p_reason), 'last_valid_version', r.released_version, 'dpr_object_version', p_object_version, 'notified', v_notified), p_correlation);
  RETURN products.product_json(r) || jsonb_build_object('notified', v_notified, 'dpr_object_version', p_object_version);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.withdraw_product(uuid,uuid,uuid,text,bigint,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.withdraw_product(uuid,uuid,uuid,text,bigint,uuid,uuid,uuid) TO eye_commit;

/* RETIRE (products.product.retire) — DP-05-006 "retirement evidence": the OWNER's act; refused while an ACCEPTED consumer remains
   (consumers — revoke or migrate them first) and unless an accepted RETIREMENT review exists (review); a product that was ever released
   has its DPR's ARCHIVED version admitted by the service in this write (the same object at the next object_version; missing → refused);
   a never-released product retires without one. The row stays (never deleted): retired is a state. */
CREATE OR REPLACE FUNCTION products.retire_product(
  p_product_id uuid, p_tenant uuid, p_domain uuid, p_object_version bigint, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = products, executive, identity, observation, objects, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r products.products_current%ROWTYPE; v_now timestamptz := clock_timestamp(); v_accepted int; v_review uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['products.product.retire']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'data product rejected (actor): retired by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM products.products_current x WHERE x.product_id = p_product_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'data product rejected (unknown_product): % is not a product of this domain', p_product_id USING ERRCODE = '22023'; END IF;
  IF r.owner_principal_id <> p_actor THEN RAISE EXCEPTION 'data product rejected (not_owner): product % is retired by its owner', r.product_key USING ERRCODE = '42501'; END IF;
  IF r.state = 'retired' THEN RAISE EXCEPTION 'data product rejected (state): product % is already retired', r.product_key USING ERRCODE = '22023'; END IF;
  SELECT count(*) INTO v_accepted FROM products.product_consumers c WHERE c.product_id = p_product_id AND c.state = 'accepted';
  IF v_accepted > 0 THEN RAISE EXCEPTION 'data product rejected (consumers): product % still has % accepted consumer(s); revoke or migrate them before retiring', r.product_key, v_accepted USING ERRCODE = '22023'; END IF;
  SELECT x.review_id INTO v_review FROM products.product_reviews x WHERE x.product_id = p_product_id AND x.kind = 'retirement' AND x.outcome = 'accepted' ORDER BY x.reviewed_at DESC LIMIT 1;
  IF v_review IS NULL THEN RAISE EXCEPTION 'data product rejected (review): product % has no accepted retirement review; retirement is reviewed by someone other than the owner', r.product_key USING ERRCODE = '22023'; END IF;
  IF r.released_version IS NOT NULL AND (p_object_version IS NULL OR NOT EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = p_product_id AND o.object_type = 'DPR' AND o.tenant_id = p_tenant
                                                                                       AND o.object_version = p_object_version AND o.lifecycle_state = 'archived')) THEN
    RAISE EXCEPTION 'data product rejected (canonical): the archived DPR version of product % was not admitted in this write', r.product_key USING ERRCODE = '22023';
  END IF;
  UPDATE products.products_current SET state = 'retired', retired_at = v_now, retired_by = p_actor, degraded_reason = NULL, degraded_at = NULL, updated_at = v_now WHERE product_id = p_product_id RETURNING * INTO r;
  INSERT INTO products.product_events (event_id, scope, tenant_id, domain_id, product_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_product_id, 'product.retired', p_actor,
          jsonb_build_object('retirement_review_id', v_review, 'last_valid_version', r.released_version, 'dpr_object_version', p_object_version, 'was_withdrawn', r.withdrawn_at IS NOT NULL), p_correlation);
  RETURN products.product_json(r) || jsonb_build_object('retirement_review_id', v_review, 'dpr_object_version', p_object_version);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION products.retire_product(uuid,uuid,uuid,bigint,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION products.retire_product(uuid,uuid,uuid,bigint,uuid,uuid,uuid) TO eye_commit;

/* THE SCORECARD READ (an invoker read under the caller's RLS): the latest scorecard, the recent ones, the consumers, the contract tests,
   the cost attributions, the recent observations and the events — everything the product page shows beside §0's product_read. */
CREATE OR REPLACE FUNCTION products.product_scorecard(p_product_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = products, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'product_id', p_product_id,
    'scorecard', (SELECT to_jsonb(s) - 'scope' - 'tenant_id' - 'domain_id' - 'correlation_id' FROM products.scorecards s WHERE s.product_id = p_product_id ORDER BY s.computed_at DESC LIMIT 1),
    'scorecards', coalesce((SELECT jsonb_agg(jsonb_build_object('scorecard_id', s.scorecard_id, 'computed_at', s.computed_at, 'computed_by', s.computed_by, 'overall', s.overall, 'attainment_pct', s.attainment_pct, 'floor_pct', s.floor_pct,
                                                               'below_floor', s.below_floor, 'window_days', s.window_days, 'state_at', s.state_at, 'digest', s.digest) ORDER BY s.computed_at DESC)
                              FROM (SELECT * FROM products.scorecards x WHERE x.product_id = p_product_id ORDER BY x.computed_at DESC LIMIT 12) s), '[]'::jsonb),
    'consumers', coalesce((SELECT jsonb_agg((to_jsonb(c) - 'scope' - 'tenant_id' - 'domain_id' - 'correlation_id') ORDER BY c.registered_at) FROM products.product_consumers c WHERE c.product_id = p_product_id), '[]'::jsonb),
    'contract_tests', coalesce((SELECT jsonb_agg((to_jsonb(t) - 'scope' - 'tenant_id' - 'domain_id' - 'correlation_id') ORDER BY t.recorded_at DESC) FROM products.contract_tests t WHERE t.product_id = p_product_id), '[]'::jsonb),
    'cost', coalesce((SELECT jsonb_agg(((to_jsonb(k) - 'scope' - 'tenant_id' - 'domain_id' - 'correlation_id') || jsonb_build_object('amount', k.amount::text)) ORDER BY k.period_end DESC, k.attributed_at DESC) FROM products.cost_attributions k WHERE k.product_id = p_product_id), '[]'::jsonb),
    'observations', coalesce((SELECT jsonb_agg((to_jsonb(o) - 'tenant_id' - 'domain_id' - 'correlation_id') ORDER BY o.observed_at DESC)
                                FROM (SELECT * FROM products.slo_observations x WHERE x.product_id = p_product_id ORDER BY x.observed_at DESC LIMIT 50) o), '[]'::jsonb),
    'events', coalesce((SELECT jsonb_agg(jsonb_build_object('event_id', e.event_id, 'event', e.event, 'occurred_at', e.occurred_at, 'actor_principal_id', e.actor_principal_id, 'details', e.details) ORDER BY e.occurred_at DESC)
                          FROM (SELECT * FROM products.product_events x WHERE x.product_id = p_product_id ORDER BY x.occurred_at DESC LIMIT 100) e), '[]'::jsonb))
$$;
GRANT EXECUTE ON FUNCTION products.product_scorecard(uuid) TO eye_app, eye_commit;
