-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0123 §CR — CP-6 B40: THE CONNECTOR CELL, THE PUBLISHED ADAPTER SDK AND THE EGRESS GATEWAY (F-P1-12: L1-C02, V03-T-440, IA-28-001,
-- IA-28-003, IA-28-005, IA-47-001, IA-47-003, IA-47-005, INF-PF-12, RU-11, DP-14-003, DAT-IN-02). The part's own file while it is built;
-- the integrator folds it into 0123 in the order §0, §RG, §VA, §IN, §AP, §CR. Applies ALONE on 0001–0122 + 0123 §0.
--
-- WHAT THIS SECTION ADDS
--   observation.adapter_packages (+ observation.adapter_package_events)   THE ADAPTER PACKAGE REGISTER (DP-14-003, D12): a customer-written
--        adapter's manifest (name, semver, entry, declared destinations, purposes, data classes, the author, the cell protocol) and its
--        PACKAGE DIGEST (sha256 over "<file>\0<sha256>\n" for its files sorted by name — the digest the SDK defines), each file's bytes held
--        by the vault (the evidence root's own blobs, digest-verified on store and re-verified on every load); REGISTERED by a named
--        collection manager, APPROVED (or rejected) by a SECOND person — a domain admin or another collection manager — never the
--        registrant, never an agent, never an external collaborator. The identity and digest of a package never change; the decision is
--        taken once.
--   observation.egress_receipts                                            THE TRANSFER RECEIPTS (IA-28-001): one per request a connector cell
--        asked the egress gateway for — the destination (host, the resolved and pinned addresses, the TLS SPKI, or the replay set), the
--        purpose and data class, the request and response digests and byte counts, whether the gateway injected a credential (by
--        REFERENCE; the value never reaches the cell or the record), the decision (allowed | refused | blocked) and its class. Written by
--        the run's own agent while its run holds the source's lease (0051); append-only.
--   observation.egress_destination_pins                                    the destination identity first seen per (source, contract version,
--        host) — the TLS SPKI and the address set — so a later run compares (IA-28-005); a contract may DECLARE its pins instead
--        (SRC@v4 authenticity.tls_spki_pins). Append-only.
--   observation.connector_requalifications (+ …_events)                    REQUALIFICATION (IA-47-005): opened when a cell's run is failed
--        closed for its own behaviour (an unregistered destination, a changed destination identity, a package whose bytes do not verify)
--        or when its credential is rotated — the contract SUSPENDED (cursor, checkpoint and custody untouched); SUBMITTED by a collection
--        manager with the package now in force (a NEW digest for a behaviour cause) and the CONTRACT TESTS the API ran in a cell; APPROVED
--        by a second person (≠ the submitter, never an agent). Reactivation is refused while one is open.
--   observation.connector_credential_bindings                              THE CREDENTIAL ROTATION of an adapter contract: a new binding
--        version names a new credential REFERENCE (the B11 form EYE_SRC_*; never a value), the previous one is revoked, the contract is
--        suspended and requalification required. The gateway injects the binding in force.
--   observation.transition_contract                                       re-declared WHOLE from 0022:883 (its last definition): activation
--        (approved → active, suspended → active) is refused while a requalification is open, and an adapter contract activates only on its
--        package in force — approved, digest and version as bound. Every other transition, text and check is unchanged (v1–v3: D8).
--   ports  register_adapter_package · decide_adapter_package · connector_cell_binding (the run's read) · record_egress_receipts ·
--          connector_suspend_for_requalification · submit_requalification · decide_requalification · rotate_connector_credential ·
--          connector_register_read · egress_receipts_read
--   No role (D14); no evidence-content permission (D9: receipts carry digests and byte counts, never bytes); no header field (D11).
--
-- WHAT IS NOT CLAIMED (D3): the cell is a child process under Node 24's permission model (no fs write, no child process, no worker, no
-- addon; fs read of its package only; the environment stripped, no credential). Its only INTENDED egress is the gateway's loopback socket,
-- but the permission model has no network switch: a direct socket is not prevented by the OS here. Network-level denial is B103 / B109,
-- then R1 — stated, never claimed.
-- THREE CLAIMS: CONSTRUCTION (this file, phase6-connector-cell-b40, egress-gateway-b40); DEMONSTRATED OPERATION (the act — SYNTHETIC
-- personas, `claim = 'demonstration'`); REAL ACCEPTANCE (B111's shared recording path, then H3/R2) — never claimed.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- §CR.1 THE ADAPTER PACKAGE REGISTER ──────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE observation.adapter_packages (
  package_id       uuid PRIMARY KEY,
  scope            text NOT NULL,
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  name             text NOT NULL CHECK (name ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  version          text NOT NULL CHECK (version ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?$'),
  package_digest   text NOT NULL CHECK (package_digest ~ '^[0-9a-f]{64}$'),
  manifest         jsonb NOT NULL CHECK (jsonb_typeof(manifest) = 'object'),
  files            jsonb NOT NULL CHECK (jsonb_typeof(files) = 'array' AND jsonb_array_length(files) BETWEEN 1 AND 64),
  byte_length      bigint NOT NULL CHECK (byte_length >= 1),
  author           text NOT NULL CHECK (length(btrim(author)) BETWEEN 2 AND 256),
  protocol         text NOT NULL,
  sdk_version      text NOT NULL,
  state            text NOT NULL CHECK (state IN ('registered', 'approved', 'rejected')),
  registered_by    uuid NOT NULL,
  registered_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_by       uuid,
  decided_at       timestamptz,
  decision_reason  text,
  request_id       uuid NOT NULL UNIQUE,
  correlation_id   uuid NOT NULL,
  CONSTRAINT oap_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT oap_decided CHECK ((state = 'registered') = (decided_by IS NULL) AND (decided_by IS NULL) = (decided_at IS NULL)),
  CONSTRAINT oap_second_person CHECK (decided_by IS NULL OR decided_by <> registered_by),
  CONSTRAINT oap_version_once UNIQUE (tenant_id, domain_id, name, version)
);
COMMENT ON TABLE observation.adapter_packages IS 'B40 §CR (D12; DP-14-003): the adapter package register — a customer-written adapter''s manifest and package digest (sha256 over "<file>\0<sha256>\n" for its files sorted by name), each file a vault blob re-verified on every load; registered by a collection manager, approved or rejected ONCE by a second person (a domain admin or another collection manager; never the registrant, an agent or an external collaborator). Identity and digest are immutable.';
CREATE INDEX oap_domain ON observation.adapter_packages (tenant_id, domain_id, name, registered_at DESC);

/* The package row is immutable but for its ONE decision (registered → approved | rejected): the guard refuses any other change and any delete. */
CREATE OR REPLACE FUNCTION observation.oap_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = observation, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'adapter package rejected (state): a registered package is never deleted' USING ERRCODE = '23514';
  END IF;
  IF OLD.state <> 'registered' OR NEW.state NOT IN ('approved', 'rejected')
     OR (NEW.package_id, NEW.scope, NEW.tenant_id, NEW.domain_id, NEW.name, NEW.version, NEW.package_digest, NEW.manifest, NEW.files, NEW.byte_length,
         NEW.author, NEW.protocol, NEW.sdk_version, NEW.registered_by, NEW.registered_at, NEW.request_id, NEW.correlation_id)
        IS DISTINCT FROM
        (OLD.package_id, OLD.scope, OLD.tenant_id, OLD.domain_id, OLD.name, OLD.version, OLD.package_digest, OLD.manifest, OLD.files, OLD.byte_length,
         OLD.author, OLD.protocol, OLD.sdk_version, OLD.registered_by, OLD.registered_at, OLD.request_id, OLD.correlation_id) THEN
    RAISE EXCEPTION 'adapter package rejected (state): a package''s identity and digest never change, and its decision is taken once' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION observation.oap_guard() FROM PUBLIC;
CREATE TRIGGER oap_guard BEFORE UPDATE OR DELETE ON observation.adapter_packages FOR EACH ROW EXECUTE FUNCTION observation.oap_guard();

CREATE TABLE observation.adapter_package_events (
  event_id        uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  package_id      uuid NOT NULL REFERENCES observation.adapter_packages (package_id),
  event           text NOT NULL CHECK (event IN ('adapter.registered', 'adapter.approved', 'adapter.rejected')),
  actor           uuid NOT NULL,
  occurred_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  details         jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  correlation_id  uuid NOT NULL,
  CONSTRAINT oape_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
COMMENT ON TABLE observation.adapter_package_events IS 'B40 §CR: the ledger of the adapter package acts (registered, approved, rejected) — who, when, why; append-only.';
CREATE INDEX oape_package ON observation.adapter_package_events (package_id, occurred_at);
CREATE TRIGGER oape_append_only BEFORE UPDATE OR DELETE ON observation.adapter_package_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- §CR.2 THE TRANSFER RECEIPTS AND THE DESTINATION PINS ──────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE observation.egress_receipts (
  receipt_id           uuid PRIMARY KEY,
  scope                text NOT NULL,
  tenant_id            uuid NOT NULL,
  domain_id            uuid NOT NULL,
  source_id            uuid NOT NULL,
  contract_version     int  NOT NULL CHECK (contract_version >= 1),
  run_id               uuid NOT NULL,
  seq                  int  NOT NULL CHECK (seq BETWEEN 1 AND 100000),
  package_id           uuid,
  package_digest       text CHECK (package_digest IS NULL OR package_digest ~ '^[0-9a-f]{64}$'),
  requested_at         timestamptz NOT NULL,
  method               text NOT NULL CHECK (length(method) BETWEEN 1 AND 16),
  url_redacted         text NOT NULL CHECK (length(url_redacted) BETWEEN 1 AND 2048),
  host                 text NOT NULL CHECK (length(host) BETWEEN 1 AND 255),
  purpose              text CHECK (purpose IS NULL OR length(purpose) <= 200),
  data_class           text CHECK (data_class IS NULL OR length(data_class) <= 200),
  decision             text NOT NULL CHECK (decision IN ('allowed', 'refused', 'blocked')),
  refusal_class        text CHECK (refusal_class IS NULL OR refusal_class IN (
                         'cell_token', 'request', 'scheme', 'method', 'unregistered_destination', 'purpose', 'data_class', 'budget', 'throttle',
                         'destination_identity_changed', 'address_not_public', 'dns_failure', 'tls_failure', 'timeout', 'transport', 'response_too_large',
                         'replay_missing', 'contract_test')),
  reason               text CHECK (reason IS NULL OR length(reason) <= 1000),
  request_digest       text NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
  request_bytes        int  NOT NULL CHECK (request_bytes >= 0),
  response_status      int  CHECK (response_status IS NULL OR response_status BETWEEN 100 AND 599),
  response_digest      text CHECK (response_digest IS NULL OR response_digest ~ '^[0-9a-f]{64}$'),
  response_bytes       bigint CHECK (response_bytes IS NULL OR response_bytes >= 0),
  destination          jsonb NOT NULL CHECK (jsonb_typeof(destination) = 'object' AND destination ->> 'mode' IN ('live', 'replay', 'none')),
  credential_injected  boolean NOT NULL,
  credential_ref       text CHECK (credential_ref IS NULL OR credential_ref ~ '^EYE_SRC_[A-Z0-9_]{1,64}$'),
  correlation_id       uuid NOT NULL,
  recorded_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT oer_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT oer_class CHECK ((decision = 'allowed') = (refusal_class IS NULL)),
  CONSTRAINT oer_answer CHECK (decision = 'allowed' OR response_digest IS NULL),
  CONSTRAINT oer_credential CHECK (credential_injected = (credential_ref IS NOT NULL)),
  CONSTRAINT oer_run_seq UNIQUE (run_id, seq)
);
COMMENT ON TABLE observation.egress_receipts IS 'B40 §CR (IA-28-001, IA-28-005): one transfer receipt per request a connector cell asked the egress gateway for — destination identity (resolved/pinned addresses + TLS SPKI, or the replay set), purpose, data class, request/response digests and bytes, the credential by REFERENCE when the gateway injected one, the decision and its class. Written by the run''s own agent under the source''s run lease; append-only. Never bytes (D9).';
CREATE INDEX oer_source ON observation.egress_receipts (tenant_id, domain_id, source_id, recorded_at DESC);
CREATE INDEX oer_run ON observation.egress_receipts (run_id, seq);
CREATE TRIGGER oer_append_only BEFORE UPDATE OR DELETE ON observation.egress_receipts FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE observation.egress_destination_pins (
  scope             text NOT NULL,
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  source_id         uuid NOT NULL,
  contract_version  int  NOT NULL,
  host              text NOT NULL,
  tls_spki_sha256   text NOT NULL CHECK (tls_spki_sha256 ~ '^[A-Za-z0-9+/]{43}=$'),
  addresses         jsonb NOT NULL CHECK (jsonb_typeof(addresses) = 'array'),
  first_receipt_id  uuid NOT NULL REFERENCES observation.egress_receipts (receipt_id),
  pinned_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (source_id, contract_version, host),
  CONSTRAINT oep_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
COMMENT ON TABLE observation.egress_destination_pins IS 'B40 §CR (IA-28-005): the identity a destination first presented to the gateway for one contract version (TLS SPKI sha256, the address set) — the record a later request is compared with; a change of SPKI blocks the request before it is sent. A contract may declare its pins instead (SRC@v4 authenticity.tls_spki_pins). Append-only.';
CREATE TRIGGER oep_append_only BEFORE UPDATE OR DELETE ON observation.egress_destination_pins FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- §CR.3 REQUALIFICATION AND THE CREDENTIAL BINDINGS ─────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE observation.connector_requalifications (
  requalification_id  uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  source_id           uuid NOT NULL,
  contract_version    int  NOT NULL CHECK (contract_version >= 1),
  cause               text NOT NULL CHECK (cause IN ('unregistered_destination', 'destination_identity_changed', 'package_integrity', 'credential_rotated')),
  cause_detail        text NOT NULL CHECK (length(btrim(cause_detail)) BETWEEN 3 AND 1000),
  cause_run_id        uuid,
  cause_receipt_id    uuid REFERENCES observation.egress_receipts (receipt_id),
  opened_by           uuid NOT NULL,
  opened_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  digest_at_opening   text CHECK (digest_at_opening IS NULL OR digest_at_opening ~ '^[0-9a-f]{64}$'),
  state               text NOT NULL CHECK (state IN ('required', 'submitted', 'approved', 'rejected')),
  package_id          uuid REFERENCES observation.adapter_packages (package_id),
  package_version     text,
  package_digest      text CHECK (package_digest IS NULL OR package_digest ~ '^[0-9a-f]{64}$'),
  contract_tests      jsonb CHECK (contract_tests IS NULL OR jsonb_typeof(contract_tests) = 'object'),
  submitted_by        uuid,
  submitted_at        timestamptz,
  submit_reason       text,
  decided_by          uuid,
  decided_at          timestamptz,
  decision_reason     text,
  correlation_id      uuid NOT NULL,
  CONSTRAINT ocr_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT ocr_submitted CHECK (state = 'required' OR (submitted_by IS NOT NULL AND contract_tests IS NOT NULL)),
  CONSTRAINT ocr_decided CHECK ((state IN ('approved', 'rejected')) = (decided_by IS NOT NULL)),
  CONSTRAINT ocr_second_person CHECK (decided_by IS NULL OR decided_by <> submitted_by)
);
COMMENT ON TABLE observation.connector_requalifications IS 'B40 §CR (IA-47-005): a connector''s requalification — opened when its run was failed closed for its own behaviour (an unregistered destination, a changed destination identity, a package whose bytes do not verify) or its credential was rotated (the contract suspended, cursor and custody intact); submitted by a collection manager with the package in force and the contract tests the API ran in a cell; approved or rejected by a second person. Reactivation is refused while one is open. The state is a projection of the append-only events.';
CREATE UNIQUE INDEX ocr_one_open ON observation.connector_requalifications (source_id, contract_version) WHERE state IN ('required', 'submitted', 'rejected');
CREATE INDEX ocr_domain ON observation.connector_requalifications (tenant_id, domain_id, opened_at DESC);

CREATE TABLE observation.connector_requalification_events (
  event_id            uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  requalification_id  uuid NOT NULL REFERENCES observation.connector_requalifications (requalification_id),
  event               text NOT NULL CHECK (event IN ('requalification.required', 'requalification.submitted', 'requalification.approved', 'requalification.rejected')),
  actor               uuid NOT NULL,
  occurred_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  details             jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  request_id          uuid UNIQUE,
  correlation_id      uuid NOT NULL,
  CONSTRAINT ocre_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
COMMENT ON TABLE observation.connector_requalification_events IS 'B40 §CR: the ledger of every requalification act (required, submitted, approved, rejected) — who, when, the package and the tests; append-only.';
CREATE INDEX ocre_req ON observation.connector_requalification_events (requalification_id, occurred_at);
CREATE TRIGGER ocre_append_only BEFORE UPDATE OR DELETE ON observation.connector_requalification_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE observation.connector_credential_bindings (
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  source_id          uuid NOT NULL,
  contract_version   int  NOT NULL CHECK (contract_version >= 1),
  binding_version    int  NOT NULL CHECK (binding_version >= 1),
  credential_ref     text NOT NULL CHECK (credential_ref ~ '^EYE_SRC_[A-Z0-9_]{1,64}$'),
  credential_header  text NOT NULL CHECK (credential_header ~ '^[A-Za-z0-9-]{1,64}$'),
  state              text NOT NULL CHECK (state IN ('in_force', 'revoked')),
  rotated_from       int,
  reason             text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  bound_by           uuid NOT NULL,
  bound_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_by         uuid,
  revoked_at         timestamptz,
  requalification_id uuid REFERENCES observation.connector_requalifications (requalification_id),
  request_id         uuid NOT NULL UNIQUE,
  correlation_id     uuid NOT NULL,
  PRIMARY KEY (source_id, contract_version, binding_version),
  CONSTRAINT occb_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT occb_rotated CHECK ((binding_version = 1 AND rotated_from IS NULL) OR (binding_version > 1 AND rotated_from = binding_version - 1)),
  CONSTRAINT occb_revoked CHECK ((state = 'revoked') = (revoked_at IS NOT NULL) AND (revoked_at IS NULL) = (revoked_by IS NULL))
);
COMMENT ON TABLE observation.connector_credential_bindings IS 'B40 §CR (IA-47-005): the credential binding versions of an adapter contract — a REFERENCE (EYE_SRC_*; never a value) and the header the gateway injects it in. A rotation adds the next version and revokes the one in force (the only change a row ever takes), suspends the contract and opens a requalification. Version 1 is the first rotation away from the contract''s own credential_ref.';
CREATE UNIQUE INDEX occb_one_in_force ON observation.connector_credential_bindings (source_id, contract_version) WHERE state = 'in_force';

CREATE OR REPLACE FUNCTION observation.occb_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = observation, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.state <> 'in_force' OR NEW.state <> 'revoked'
     OR (to_jsonb(NEW) - 'state' - 'revoked_by' - 'revoked_at') IS DISTINCT FROM (to_jsonb(OLD) - 'state' - 'revoked_by' - 'revoked_at') THEN
    RAISE EXCEPTION 'credential rotation rejected (state): a credential binding is never edited or deleted; it is revoked once, by the next rotation' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION observation.occb_guard() FROM PUBLIC;
CREATE TRIGGER occb_guard BEFORE UPDATE OR DELETE ON observation.connector_credential_bindings FOR EACH ROW EXECUTE FUNCTION observation.occb_guard();

/* The requalification row changes only along its state machine (required|rejected → submitted → approved|rejected), its identity never. */
CREATE OR REPLACE FUNCTION observation.ocr_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = observation, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'requalification rejected (state): a requalification is never deleted' USING ERRCODE = '23514';
  END IF;
  IF (NEW.requalification_id, NEW.scope, NEW.tenant_id, NEW.domain_id, NEW.source_id, NEW.contract_version, NEW.cause, NEW.cause_detail, NEW.cause_run_id,
      NEW.cause_receipt_id, NEW.opened_by, NEW.opened_at, NEW.digest_at_opening, NEW.correlation_id)
     IS DISTINCT FROM
     (OLD.requalification_id, OLD.scope, OLD.tenant_id, OLD.domain_id, OLD.source_id, OLD.contract_version, OLD.cause, OLD.cause_detail, OLD.cause_run_id,
      OLD.cause_receipt_id, OLD.opened_by, OLD.opened_at, OLD.digest_at_opening, OLD.correlation_id)
     OR NOT ((OLD.state IN ('required', 'rejected') AND NEW.state = 'submitted') OR (OLD.state = 'submitted' AND NEW.state IN ('approved', 'rejected'))) THEN
    RAISE EXCEPTION 'requalification rejected (state): % → % is not a requalification step, and a requalification''s cause never changes', OLD.state, NEW.state USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION observation.ocr_guard() FROM PUBLIC;
CREATE TRIGGER ocr_guard BEFORE UPDATE OR DELETE ON observation.connector_requalifications FOR EACH ROW EXECUTE FUNCTION observation.ocr_guard();

REVOKE ALL ON observation.adapter_packages, observation.adapter_package_events, observation.egress_receipts, observation.egress_destination_pins,
              observation.connector_requalifications, observation.connector_requalification_events, observation.connector_credential_bindings FROM PUBLIC;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['adapter_packages', 'adapter_package_events', 'egress_receipts', 'egress_destination_pins', 'connector_requalifications',
                           'connector_requalification_events', 'connector_credential_bindings'] LOOP
    EXECUTE format('ALTER TABLE observation.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE observation.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY ocr_isolation ON observation.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON observation.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- §CR.4 THE HELPERS (internal; no runtime grant) ───────────────────────────────────────────────────────────────────────────────────────────
/* The acting principal: the bound principal and the actor the route names are one. */
CREATE OR REPLACE FUNCTION observation.cr_actor(p_noun text, p_actor uuid) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
DECLARE v uuid := public.eye_principal();
BEGIN
  IF v IS NULL OR p_actor IS NULL OR p_actor IS DISTINCT FROM v THEN
    RAISE EXCEPTION '% rejected (actor): the act is recorded under the acting principal, never on behalf of another', p_noun USING ERRCODE = '42501';
  END IF;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION observation.cr_actor(text, uuid) FROM PUBLIC;

/* A named human holding one of p_roles here (governance.assert_approver: never an agent; never the proposer) — and NEVER an external
   collaborator of the domain, whatever else they hold (D12: a partner's people neither register nor approve a package nor requalify one). */
CREATE OR REPLACE FUNCTION observation.cr_assert_person(p_noun text, p_actor uuid, p_tenant uuid, p_domain uuid, p_roles text[], p_proposer uuid, p_what text) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = observation, governance, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM governance.assert_approver(p_noun, p_actor, p_tenant, p_domain, p_roles, p_proposer, NULL, p_what);
  IF governance.holds_role(p_actor, p_tenant, p_domain, ARRAY['external_collaborator']) THEN
    RAISE EXCEPTION '% rejected (authority): % is never the act of an external collaborator (the adapter''s author or a partner''s person)', p_noun, p_what USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION observation.cr_assert_person(text, uuid, uuid, uuid, text[], uuid, text) FROM PUBLIC;

/* The agent of THIS source: the acting principal is the active collection agent registered for the source (the cell's run acts as it). */
CREATE OR REPLACE FUNCTION observation.cr_assert_source_agent(p_noun text, p_tenant uuid, p_domain uuid, p_source uuid) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
DECLARE v uuid := public.eye_principal();
BEGIN
  IF v IS NULL OR NOT EXISTS (SELECT 1 FROM observation.agents a WHERE a.principal_id = v AND a.source_id = p_source AND a.tenant_id = p_tenant
                                                                   AND a.domain_id = p_domain AND a.status = 'active') THEN
    RAISE EXCEPTION '% rejected (actor): only the active collection agent of source % records this — the cell''s own run, under its lease', p_noun, coalesce(p_source::text, '<none>') USING ERRCODE = '42501';
  END IF;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION observation.cr_assert_source_agent(text, uuid, uuid, uuid) FROM PUBLIC;

/* The run that holds the source's lease now (0051) — the run a cell's receipts and suspension belong to; refused otherwise. */
CREATE OR REPLACE FUNCTION observation.cr_assert_lease(p_noun text, p_tenant uuid, p_domain uuid, p_source uuid, p_cv int, p_run uuid) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
BEGIN
  IF p_run IS NULL OR NOT EXISTS (SELECT 1 FROM observation.source_run_leases l WHERE l.source_id = p_source AND l.run_id = p_run AND l.tenant_id = p_tenant
                                                                                 AND l.domain_id = p_domain AND l.contract_version = p_cv) THEN
    RAISE EXCEPTION '% rejected (held): run % does not hold the run lease of source % v% — a cell records only for the run it serves, while that run holds the lease',
      p_noun, coalesce(p_run::text, '<none>'), coalesce(p_source::text, '<none>'), coalesce(p_cv::text, '<none>') USING ERRCODE = '23514';
  END IF;
END $$;
REVOKE ALL ON FUNCTION observation.cr_assert_lease(text, uuid, uuid, uuid, int, uuid) FROM PUBLIC;

/* The package digest the SDK defines (@eye/connector-sdk packageDigest): sha256 over "<file>\0<sha256>\n" for the files sorted by name. */
CREATE OR REPLACE FUNCTION observation.cr_package_digest(p_files jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT encode(sha256(convert_to(coalesce(string_agg((f ->> 'file') || chr(0) || (f ->> 'sha256') || chr(10), '' ORDER BY convert_to(f ->> 'file', 'UTF8')), ''), 'UTF8')), 'hex')
    FROM jsonb_array_elements(p_files) f
$$;
REVOKE ALL ON FUNCTION observation.cr_package_digest(jsonb) FROM PUBLIC;

/* The package IN FORCE for one adapter contract version: the package of its latest APPROVED requalification, else the one its contract
   binds (SRC@v4 `adapter`). NULL for a contract of another kind. */
CREATE OR REPLACE FUNCTION observation.cr_package_in_force(p_tenant uuid, p_domain uuid, p_source uuid, p_cv int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
DECLARE c record; q record;
BEGIN
  SELECT s.connector_kind, s.contract -> 'adapter' AS ad INTO c FROM observation.source_contracts_current s
   WHERE s.source_id = p_source AND s.contract_version = p_cv AND s.tenant_id = p_tenant AND s.domain_id = p_domain;
  IF NOT FOUND OR c.connector_kind <> 'adapter' THEN RETURN NULL; END IF;
  SELECT r.requalification_id, r.package_id, r.package_version, r.package_digest INTO q FROM observation.connector_requalifications r
   WHERE r.source_id = p_source AND r.contract_version = p_cv AND r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.state = 'approved' AND r.package_id IS NOT NULL
   ORDER BY r.decided_at DESC, r.requalification_id DESC LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('package_id', q.package_id, 'version', q.package_version, 'digest', q.package_digest, 'via', 'requalification', 'requalification_id', q.requalification_id);
  END IF;
  RETURN jsonb_build_object('package_id', c.ad ->> 'package_id', 'version', c.ad ->> 'version', 'digest', c.ad ->> 'digest', 'via', 'contract', 'requalification_id', NULL);
END $$;
REVOKE ALL ON FUNCTION observation.cr_package_in_force(uuid, uuid, uuid, int) FROM PUBLIC;

/* Why a package in force cannot run (NULL: it can): unknown in this domain, not approved, or not the version / digest bound. */
CREATE OR REPLACE FUNCTION observation.cr_package_problem(p_tenant uuid, p_domain uuid, p_in_force jsonb) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
DECLARE p observation.adapter_packages%ROWTYPE;
BEGIN
  IF p_in_force IS NULL OR p_in_force ->> 'package_id' IS NULL THEN RETURN 'the contract binds no adapter package'; END IF;
  SELECT * INTO p FROM observation.adapter_packages x WHERE x.package_id = (p_in_force ->> 'package_id')::uuid AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RETURN format('adapter package %s is not registered in this domain', p_in_force ->> 'package_id'); END IF;
  IF p.state <> 'approved' THEN RETURN format('adapter package %s %s is %s, not approved by a second person', p.name, p.version, p.state); END IF;
  IF p.package_digest IS DISTINCT FROM p_in_force ->> 'digest' OR p.version IS DISTINCT FROM p_in_force ->> 'version' THEN
    RETURN format('adapter package %s is %s with digest %s, not the %s / %s the contract binds', p.package_id, p.version, p.package_digest, p_in_force ->> 'version', p_in_force ->> 'digest');
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION observation.cr_package_problem(uuid, uuid, jsonb) FROM PUBLIC;

/* The open requalification of a contract version (required, submitted or rejected — not yet approved), or NULL. */
CREATE OR REPLACE FUNCTION observation.cr_open_requalification(p_source uuid, p_cv int) RETURNS observation.connector_requalifications
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
  SELECT r.* FROM observation.connector_requalifications r
   WHERE r.source_id = p_source AND r.contract_version = p_cv AND r.state IN ('required', 'submitted', 'rejected') LIMIT 1
$$;
REVOKE ALL ON FUNCTION observation.cr_open_requalification(uuid, int) FROM PUBLIC;

CREATE OR REPLACE FUNCTION observation.cr_package_json(p observation.adapter_packages) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = observation, graph, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN p.package_id IS NULL THEN NULL ELSE jsonb_build_object(
    'package_id', p.package_id, 'name', p.name, 'version', p.version, 'package_digest', p.package_digest, 'manifest', p.manifest, 'files', p.files,
    'byte_length', p.byte_length, 'author', p.author, 'protocol', p.protocol, 'sdk_version', p.sdk_version, 'state', p.state,
    'registered_by', p.registered_by, 'registered_at', graph.pv_iso(p.registered_at), 'decided_by', p.decided_by, 'decided_at', graph.pv_iso(p.decided_at),
    'decision_reason', p.decision_reason) END
$$;
REVOKE ALL ON FUNCTION observation.cr_package_json(observation.adapter_packages) FROM PUBLIC;

CREATE OR REPLACE FUNCTION observation.cr_requalification_json(r observation.connector_requalifications) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = observation, graph, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN r.requalification_id IS NULL THEN NULL ELSE jsonb_build_object(
    'requalification_id', r.requalification_id, 'source_id', r.source_id, 'contract_version', r.contract_version, 'cause', r.cause, 'cause_detail', r.cause_detail,
    'cause_run_id', r.cause_run_id, 'cause_receipt_id', r.cause_receipt_id, 'opened_by', r.opened_by, 'opened_at', graph.pv_iso(r.opened_at),
    'digest_at_opening', r.digest_at_opening, 'state', r.state, 'package_id', r.package_id, 'package_version', r.package_version, 'package_digest', r.package_digest,
    'contract_tests', r.contract_tests, 'submitted_by', r.submitted_by, 'submitted_at', graph.pv_iso(r.submitted_at), 'submit_reason', r.submit_reason,
    'decided_by', r.decided_by, 'decided_at', graph.pv_iso(r.decided_at), 'decision_reason', r.decision_reason) END
$$;
REVOKE ALL ON FUNCTION observation.cr_requalification_json(observation.connector_requalifications) FROM PUBLIC;

/* Suspend an ACTIVE contract version (the 0022 transition's effect and event, inline: the port that calls this holds its own action) and
   open — or rejoin — its requalification. Cursor, checkpoint and custody are not touched; the schedule stays and a scheduled run is cancelled
   at its pre-egress revalidation (the contract is not active), exactly as for a rights withdrawal on 0022's path. */
CREATE OR REPLACE FUNCTION observation.cr_suspend_and_open(p_tenant uuid, p_domain uuid, p_source uuid, p_cv int, p_actor uuid, p_cause text, p_detail text,
                                                          p_run uuid, p_receipt uuid, p_digest text, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
DECLARE v_row observation.source_contracts_current%ROWTYPE; r observation.connector_requalifications%ROWTYPE; v_suspended boolean := false; v_new boolean := false;
BEGIN
  SELECT * INTO v_row FROM observation.source_contracts_current WHERE source_id = p_source AND contract_version = p_cv AND tenant_id = p_tenant AND domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'connector suspension rejected (unknown_source): source % v% is not recorded in this domain', coalesce(p_source::text, '<none>'), coalesce(p_cv::text, '<none>') USING ERRCODE = '23503';
  END IF;
  IF v_row.lifecycle_state = 'active' THEN
    UPDATE observation.source_contracts_current SET lifecycle_state = 'suspended', updated_at = clock_timestamp()
     WHERE source_id = p_source AND contract_version = p_cv;
    INSERT INTO observation.source_contract_events (event_id, scope, tenant_id, domain_id, source_id, contract_version, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_source, p_cv, 'contract.suspended', p_actor,
            jsonb_build_object('from', 'active', 'to', 'suspended', 'reason', p_detail, 'cause', p_cause, 'run_id', p_run, 'receipt_id', p_receipt,
                               'kind', 'connector_requalification', 'cursor_and_custody', 'unchanged'), p_correlation);
    v_suspended := true;
  END IF;
  r := observation.cr_open_requalification(p_source, p_cv);
  IF r.requalification_id IS NULL THEN
    INSERT INTO observation.connector_requalifications (requalification_id, scope, tenant_id, domain_id, source_id, contract_version, cause, cause_detail, cause_run_id,
                                                        cause_receipt_id, opened_by, digest_at_opening, state, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_source, p_cv, p_cause, left(btrim(p_detail), 1000), p_run, p_receipt, p_actor, p_digest, 'required', p_correlation)
    RETURNING * INTO r;
    v_new := true;
  END IF;
  INSERT INTO observation.connector_requalification_events (event_id, scope, tenant_id, domain_id, requalification_id, event, actor, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, r.requalification_id, 'requalification.required', p_actor,
          jsonb_build_object('cause', p_cause, 'detail', left(btrim(p_detail), 1000), 'run_id', p_run, 'receipt_id', p_receipt, 'suspended', v_suspended, 'joined_open', NOT v_new), p_correlation);
  INSERT INTO observation.source_contract_events (event_id, scope, tenant_id, domain_id, source_id, contract_version, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_source, p_cv, 'contract.requalification_required', p_actor,
          jsonb_build_object('requalification_id', r.requalification_id, 'cause', p_cause, 'detail', left(btrim(p_detail), 1000), 'run_id', p_run, 'receipt_id', p_receipt), p_correlation);
  RETURN jsonb_build_object('requalification', observation.cr_requalification_json(r), 'suspended', v_suspended,
                            'contract_state', CASE WHEN v_suspended THEN 'suspended' ELSE v_row.lifecycle_state END, 'opened', v_new);
END $$;
REVOKE ALL ON FUNCTION observation.cr_suspend_and_open(uuid, uuid, uuid, int, uuid, text, text, uuid, uuid, text, uuid) FROM PUBLIC;

-- §CR.5 THE PACKAGE PORTS ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/* REGISTER: a named collection manager registers a package — its manifest (the package's own adapter.json, parsed by the API from the
   bytes it stores) and its files (name, sha256, byte length, the vault locator). The digest is RECOMPUTED here from the files; the manifest
   is checked (name, semver, an .mjs entry among the files, at least one declared destination host, purposes, data classes, the protocol). */
CREATE OR REPLACE FUNCTION observation.register_adapter_package(
  p_request_id uuid, p_tenant uuid, p_domain uuid, p_manifest jsonb, p_files jsonb, p_package_digest text, p_protocol text, p_sdk_version text,
  p_actor uuid, p_correlation uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; p observation.adapter_packages%ROWTYPE; v_digest text; v_name text; v_version text; v_entry text; v_bytes bigint;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.adapter.register']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := observation.cr_actor('adapter package', p_actor);
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'adapter package rejected (request): a registration carries its request id (the command identity a retry reuses)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO p FROM observation.adapter_packages x WHERE x.request_id = p_request_id;
  IF FOUND THEN
    IF p.registered_by IS DISTINCT FROM v_actor OR p.package_digest IS DISTINCT FROM p_package_digest OR p.tenant_id <> p_tenant OR p.domain_id <> p_domain THEN
      RAISE EXCEPTION 'adapter package rejected (duplicate): request % already registered another package; a new registration takes a new request id', p_request_id USING ERRCODE = '23505';
    END IF;
    RETURN observation.cr_package_json(p) || jsonb_build_object('replayed', true);
  END IF;
  PERFORM observation.cr_assert_person('adapter package', v_actor, p_tenant, p_domain, ARRAY['collection_manager'], NULL, 'registering an adapter package');
  IF p_manifest IS NULL OR jsonb_typeof(p_manifest) <> 'object' THEN
    RAISE EXCEPTION 'adapter package rejected (manifest): the package carries its manifest (adapter.json) as an object' USING ERRCODE = '22023';
  END IF;
  v_name := p_manifest ->> 'name'; v_version := p_manifest ->> 'version'; v_entry := p_manifest ->> 'entry';
  IF v_name IS NULL OR v_name !~ '^[a-z0-9][a-z0-9-]{1,63}$' THEN
    RAISE EXCEPTION 'adapter package rejected (manifest): name is 2 to 64 lower-case letters, digits and hyphens' USING ERRCODE = '22023';
  END IF;
  IF v_version IS NULL OR v_version !~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?$' THEN
    RAISE EXCEPTION 'adapter package rejected (manifest): version is a semantic version (major.minor.patch)' USING ERRCODE = '22023';
  END IF;
  IF p_files IS NULL OR jsonb_typeof(p_files) <> 'array' OR jsonb_array_length(p_files) NOT BETWEEN 1 AND 64
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_files) f WHERE jsonb_typeof(f) <> 'object' OR coalesce(f ->> 'file', '') !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'
                  OR coalesce(f ->> 'sha256', '') !~ '^[0-9a-f]{64}$' OR coalesce(f ->> 'locator', '') = '' OR (f ->> 'byte_length') IS NULL OR (f ->> 'byte_length')::bigint < 1)
     OR (SELECT count(DISTINCT f ->> 'file') FROM jsonb_array_elements(p_files) f) <> jsonb_array_length(p_files) THEN
    RAISE EXCEPTION 'adapter package rejected (files): a package is 1 to 64 files, each named once (letters, digits, dot, underscore, hyphen; no directory), with its sha256, byte length and vault locator' USING ERRCODE = '22023';
  END IF;
  IF v_entry IS NULL OR v_entry !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.mjs$' OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_files) f WHERE f ->> 'file' = v_entry) THEN
    RAISE EXCEPTION 'adapter package rejected (manifest): entry names an .mjs file of the package (the module the cell imports)' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_files) f WHERE f ->> 'file' = 'adapter.json') THEN
    RAISE EXCEPTION 'adapter package rejected (manifest): the package carries its manifest as adapter.json' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_manifest -> 'declared_destinations') <> 'array' OR jsonb_array_length(p_manifest -> 'declared_destinations') NOT BETWEEN 1 AND 32
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_manifest -> 'declared_destinations') d WHERE jsonb_typeof(d) <> 'string'
                  OR (d #>> '{}') !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$') THEN
    RAISE EXCEPTION 'adapter package rejected (destinations): declared_destinations names 1 to 32 host names (lower case, no scheme, no port) — the only hosts the package may ask the gateway for' USING ERRCODE = '22023';
  END IF;
  IF observation.rt_list_problem(p_manifest -> 'purposes', 'purposes', 1) IS NOT NULL OR observation.rt_list_problem(p_manifest -> 'data_classes', 'data classes', 1) IS NOT NULL THEN
    RAISE EXCEPTION 'adapter package rejected (manifest): purposes and data_classes each name 1 to 20 short statements (what the package collects, and for what)' USING ERRCODE = '22023';
  END IF;
  IF coalesce(btrim(p_manifest ->> 'author'), '') = '' OR length(p_manifest ->> 'author') > 256 THEN
    RAISE EXCEPTION 'adapter package rejected (manifest): author names who wrote the package (2 to 256 characters)' USING ERRCODE = '22023';
  END IF;
  IF p_protocol IS NULL OR p_manifest ->> 'protocol' IS DISTINCT FROM p_protocol THEN
    RAISE EXCEPTION 'adapter package rejected (protocol): the manifest speaks %, the cell speaks % — a package is registered for the cell protocol it runs under',
      coalesce(p_manifest ->> 'protocol', '<none>'), coalesce(p_protocol, '<none>') USING ERRCODE = '22023';
  END IF;
  v_digest := observation.cr_package_digest(p_files);
  IF p_package_digest IS DISTINCT FROM v_digest THEN
    RAISE EXCEPTION 'adapter package rejected (digest): the files digest to %, not the % presented', v_digest, coalesce(p_package_digest, '<none>') USING ERRCODE = '22023';
  END IF;
  SELECT sum((f ->> 'byte_length')::bigint) INTO v_bytes FROM jsonb_array_elements(p_files) f;
  IF EXISTS (SELECT 1 FROM observation.adapter_packages x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.name = v_name AND x.version = v_version) THEN
    RAISE EXCEPTION 'adapter package rejected (duplicate): % % is already registered in this domain; a change is a new version', v_name, v_version USING ERRCODE = '23505';
  END IF;
  INSERT INTO observation.adapter_packages (package_id, scope, tenant_id, domain_id, name, version, package_digest, manifest, files, byte_length, author, protocol,
                                            sdk_version, state, registered_by, request_id, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, v_name, v_version, v_digest, p_manifest, p_files, v_bytes, btrim(p_manifest ->> 'author'), p_protocol,
          coalesce(p_sdk_version, 'unknown'), 'registered', v_actor, p_request_id, p_correlation)
  RETURNING * INTO p;
  INSERT INTO observation.adapter_package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p.package_id, 'adapter.registered', v_actor,
          jsonb_build_object('name', v_name, 'version', v_version, 'package_digest', v_digest, 'author', p.author, 'declared_destinations', p_manifest -> 'declared_destinations'), p_correlation);
  RETURN observation.cr_package_json(p) || jsonb_build_object('replayed', false);
END $$;
REVOKE ALL ON FUNCTION observation.register_adapter_package(uuid, uuid, uuid, jsonb, jsonb, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.register_adapter_package(uuid, uuid, uuid, jsonb, jsonb, text, text, text, uuid, uuid) TO eye_commit;

/* DECIDE: a SECOND person — a domain admin or another collection manager, never the registrant, never an agent, never an external
   collaborator — approves or rejects a registered package, once, with a reason. */
CREATE OR REPLACE FUNCTION observation.decide_adapter_package(
  p_request_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_decision text, p_reason text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; p observation.adapter_packages%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.adapter.approve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := observation.cr_actor('adapter package', p_actor);
  IF p_decision IS NULL OR p_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'adapter package rejected (decision): the decision is approve or reject' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO p FROM observation.adapter_packages x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'adapter package rejected (unknown_package): package % is not registered in this domain', coalesce(p_package_id::text, '<none>') USING ERRCODE = '23503';
  END IF;
  PERFORM observation.cr_assert_person('adapter package', v_actor, p_tenant, p_domain, ARRAY['domain_admin', 'collection_manager'], p.registered_by,
                                       'deciding an adapter package (a second person: never its registrant)');
  IF p.state <> 'registered' THEN
    IF p.decided_by = v_actor AND p.state = CASE p_decision WHEN 'approve' THEN 'approved' ELSE 'rejected' END
       AND EXISTS (SELECT 1 FROM observation.adapter_package_events e WHERE e.package_id = p.package_id AND e.details ->> 'request_id' = p_request_id::text) THEN
      RETURN observation.cr_package_json(p) || jsonb_build_object('replayed', true);
    END IF;
    RAISE EXCEPTION 'adapter package rejected (state): % % is % since %; a decision is taken once (a change is a new version)', p.name, p.version, p.state, graph.pv_iso(p.decided_at) USING ERRCODE = '23514';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'adapter package rejected (reason): a decision states its reason in 8 to 2000 characters (what was reviewed)' USING ERRCODE = '22023';
  END IF;
  UPDATE observation.adapter_packages SET state = CASE p_decision WHEN 'approve' THEN 'approved' ELSE 'rejected' END, decided_by = v_actor, decided_at = clock_timestamp(),
         decision_reason = btrim(p_reason)
   WHERE package_id = p.package_id RETURNING * INTO p;
  INSERT INTO observation.adapter_package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p.package_id, CASE p_decision WHEN 'approve' THEN 'adapter.approved' ELSE 'adapter.rejected' END, v_actor,
          jsonb_build_object('reason', p.decision_reason, 'registered_by', p.registered_by, 'package_digest', p.package_digest, 'request_id', p_request_id), p_correlation);
  RETURN observation.cr_package_json(p) || jsonb_build_object('replayed', false);
END $$;
REVOKE ALL ON FUNCTION observation.decide_adapter_package(uuid, uuid, uuid, uuid, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.decide_adapter_package(uuid, uuid, uuid, uuid, text, text, uuid, uuid) TO eye_commit;

-- §CR.6 THE RUN'S READ, THE RECEIPTS AND THE SUSPENSION (the cell's own agent, under its lease) ───────────────────────────────────────────
/* What one run of an adapter contract may do: the contract (its kind, mode, registered destination hosts, purposes, declared pins, its
   credential reference), the package IN FORCE (the row, its files and locators — the bytes are read and re-verified by the API), the
   credential binding in force, the open requalification, the recorded pins. Read under observation.adapter.load (the source's agent and
   the managers); the read scope asserted. */
CREATE OR REPLACE FUNCTION observation.connector_cell_binding(p_tenant uuid, p_domain uuid, p_source uuid, p_cv int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = observation, graph, pg_catalog, pg_temp AS $$
DECLARE c observation.source_contracts_current%ROWTYPE; v_force jsonb; p observation.adapter_packages%ROWTYPE; b observation.connector_credential_bindings%ROWTYPE;
        q observation.connector_requalifications%ROWTYPE;
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the connector cell''s binding of a source');
  SELECT * INTO c FROM observation.source_contracts_current x WHERE x.source_id = p_source AND x.contract_version = p_cv AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'connector cell rejected (unknown_source): source % v% is not recorded in this domain', coalesce(p_source::text, '<none>'), coalesce(p_cv::text, '<none>') USING ERRCODE = '23503';
  END IF;
  v_force := observation.cr_package_in_force(p_tenant, p_domain, p_source, p_cv);
  IF v_force IS NOT NULL AND v_force ->> 'package_id' IS NOT NULL THEN
    SELECT * INTO p FROM observation.adapter_packages x WHERE x.package_id = (v_force ->> 'package_id')::uuid AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  END IF;
  SELECT * INTO b FROM observation.connector_credential_bindings x WHERE x.source_id = p_source AND x.contract_version = p_cv AND x.state = 'in_force';
  q := observation.cr_open_requalification(p_source, p_cv);
  RETURN jsonb_build_object(
    'source_id', c.source_id, 'contract_version', c.contract_version, 'source_key', c.source_key, 'connector_kind', c.connector_kind,
    'acquisition_mode', c.acquisition_mode, 'lifecycle_state', c.lifecycle_state, 'rights_state', c.rights_state,
    'replay_set', coalesce(c.contract #>> '{security_and_operations,replay_set}', c.source_key),
    'lease', (SELECT jsonb_build_object('run_id', l.run_id, 'contract_version', l.contract_version, 'acquired_at', graph.pv_iso(l.acquired_at))
                FROM observation.source_run_leases l WHERE l.source_id = p_source AND l.tenant_id = p_tenant AND l.domain_id = p_domain),
    'endpoints', coalesce(c.contract #> '{identity,endpoints}', '[]'::jsonb), 'purposes', coalesce(c.contract #> '{authority_and_rights,purposes}', '[]'::jsonb),
    'classification_ceiling', c.classification_ceiling, 'declared_pins', coalesce(c.contract #> '{authenticity,tls_spki_pins}', '[]'::jsonb),
    'contract_credential', CASE WHEN c.contract #>> '{security_and_operations,credential_ref}' IS NULL THEN NULL
                                ELSE jsonb_build_object('ref', c.contract #>> '{security_and_operations,credential_ref}',
                                                        'header', coalesce(c.contract #>> '{security_and_operations,credential_header}', 'authorization')) END,
    'package_in_force', v_force, 'package', observation.cr_package_json(p), 'package_problem', CASE WHEN v_force IS NULL THEN NULL ELSE observation.cr_package_problem(p_tenant, p_domain, v_force) END,
    'credential_binding', CASE WHEN b.source_id IS NULL THEN NULL ELSE jsonb_build_object('binding_version', b.binding_version, 'ref', b.credential_ref, 'header', b.credential_header) END,
    'open_requalification', observation.cr_requalification_json(q),
    'pins', (SELECT coalesce(jsonb_agg(jsonb_build_object('host', x.host, 'tls_spki_sha256', x.tls_spki_sha256, 'addresses', x.addresses, 'first_receipt_id', x.first_receipt_id,
                                                          'pinned_at', graph.pv_iso(x.pinned_at)) ORDER BY x.host), '[]'::jsonb)
               FROM observation.egress_destination_pins x WHERE x.source_id = p_source AND x.contract_version = p_cv AND x.tenant_id = p_tenant AND x.domain_id = p_domain));
END $$;
REVOKE ALL ON FUNCTION observation.connector_cell_binding(uuid, uuid, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.connector_cell_binding(uuid, uuid, uuid, int) TO eye_app, eye_commit;

/* THE RECEIPTS of one run, written by the source's active agent while the run holds the source's lease; a live allowed answer whose host
   has no pin yet pins the identity it presented (first use). The receipts are written whole or not at all. */
CREATE OR REPLACE FUNCTION observation.record_egress_receipts(p_tenant uuid, p_domain uuid, p_source uuid, p_cv int, p_run uuid, p_receipts jsonb, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
DECLARE x jsonb; v_n int := 0; v_pins int := 0; v_id uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.egress.record']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM observation.cr_assert_source_agent('egress receipt', p_tenant, p_domain, p_source);
  PERFORM observation.cr_assert_lease('egress receipt', p_tenant, p_domain, p_source, p_cv, p_run);
  IF p_receipts IS NULL OR jsonb_typeof(p_receipts) <> 'array' OR jsonb_array_length(p_receipts) > 10000 THEN
    RAISE EXCEPTION 'egress receipt rejected (request): the receipts are a list of at most 10000' USING ERRCODE = '22023';
  END IF;
  FOR x IN SELECT r FROM jsonb_array_elements(p_receipts) r LOOP
    v_id := coalesce((x ->> 'receipt_id')::uuid, gen_random_uuid());
    INSERT INTO observation.egress_receipts (receipt_id, scope, tenant_id, domain_id, source_id, contract_version, run_id, seq, package_id, package_digest, requested_at,
      method, url_redacted, host, purpose, data_class, decision, refusal_class, reason, request_digest, request_bytes, response_status, response_digest, response_bytes,
      destination, credential_injected, credential_ref, correlation_id)
    VALUES (v_id, 'DOMAIN', p_tenant, p_domain, p_source, p_cv, p_run, (x ->> 'seq')::int, (x ->> 'package_id')::uuid, x ->> 'package_digest', (x ->> 'requested_at')::timestamptz,
      x ->> 'method', x ->> 'url_redacted', x ->> 'host', x ->> 'purpose', x ->> 'data_class', x ->> 'decision', x ->> 'refusal_class', left(x ->> 'reason', 1000),
      x ->> 'request_digest', (x ->> 'request_bytes')::int, (x ->> 'response_status')::int, x ->> 'response_digest', (x ->> 'response_bytes')::bigint,
      coalesce(x -> 'destination', '{"mode": "none"}'::jsonb), coalesce((x ->> 'credential_injected')::boolean, false), x ->> 'credential_ref', p_correlation);
    v_n := v_n + 1;
    IF x ->> 'decision' = 'allowed' AND x #>> '{destination,mode}' = 'live' AND x #>> '{destination,tls_spki_sha256}' IS NOT NULL THEN
      INSERT INTO observation.egress_destination_pins (scope, tenant_id, domain_id, source_id, contract_version, host, tls_spki_sha256, addresses, first_receipt_id)
      VALUES ('DOMAIN', p_tenant, p_domain, p_source, p_cv, x ->> 'host', x #>> '{destination,tls_spki_sha256}', coalesce(x #> '{destination,addresses}', '[]'::jsonb), v_id)
      ON CONFLICT (source_id, contract_version, host) DO NOTHING;
      IF FOUND THEN v_pins := v_pins + 1; END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('recorded', v_n, 'pinned', v_pins, 'run_id', p_run);
END $$;
REVOKE ALL ON FUNCTION observation.record_egress_receipts(uuid, uuid, uuid, int, uuid, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.record_egress_receipts(uuid, uuid, uuid, int, uuid, jsonb, uuid) TO eye_commit;

/* THE SUSPENSION a cell's own run records when it failed closed for the connector's behaviour: the cause is proven by a REFUSED or BLOCKED
   receipt of THIS run (an unregistered destination, a changed identity) or names a package whose bytes did not verify; the contract is
   suspended (cursor, checkpoint, custody untouched) and its requalification opened (or joined). */
CREATE OR REPLACE FUNCTION observation.connector_suspend_for_requalification(p_tenant uuid, p_domain uuid, p_source uuid, p_cv int, p_run uuid, p_cause text, p_detail text,
                                                                           p_receipt uuid, p_digest text, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; r observation.egress_receipts%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.connector.suspend']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := observation.cr_assert_source_agent('connector suspension', p_tenant, p_domain, p_source);
  PERFORM observation.cr_assert_lease('connector suspension', p_tenant, p_domain, p_source, p_cv, p_run);
  IF p_cause IS NULL OR p_cause NOT IN ('unregistered_destination', 'destination_identity_changed', 'package_integrity') THEN
    RAISE EXCEPTION 'connector suspension rejected (cause): a cell''s run suspends its connector for an unregistered destination, a changed destination identity or a package whose bytes do not verify' USING ERRCODE = '22023';
  END IF;
  IF p_cause <> 'package_integrity' THEN
    SELECT * INTO r FROM observation.egress_receipts x WHERE x.receipt_id = p_receipt AND x.run_id = p_run AND x.source_id = p_source;
    IF NOT FOUND OR r.decision = 'allowed' OR r.refusal_class IS DISTINCT FROM p_cause THEN
      RAISE EXCEPTION 'connector suspension rejected (evidence): the suspension cites a % receipt of run % — none is recorded', p_cause, p_run USING ERRCODE = '22023';
    END IF;
  END IF;
  IF p_detail IS NULL OR length(btrim(p_detail)) < 3 THEN
    RAISE EXCEPTION 'connector suspension rejected (detail): the suspension says what the cell did' USING ERRCODE = '22023';
  END IF;
  RETURN observation.cr_suspend_and_open(p_tenant, p_domain, p_source, p_cv, v_actor, p_cause, p_detail, p_run, p_receipt, p_digest, p_correlation);
END $$;
REVOKE ALL ON FUNCTION observation.connector_suspend_for_requalification(uuid, uuid, uuid, int, uuid, text, text, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.connector_suspend_for_requalification(uuid, uuid, uuid, int, uuid, text, text, uuid, text, uuid) TO eye_commit;

-- §CR.7 REQUALIFICATION AND ROTATION (human, a second person) ─────────────────────────────────────────────────────────────────────────────
/* SUBMIT: a named collection manager submits the open requalification with the package now to be in force (approved, of the same name
   as the one in force; a NEW digest when the cause was the connector's behaviour) and the contract tests the API ran in a cell — which
   must have passed. */
CREATE OR REPLACE FUNCTION observation.submit_requalification(p_request_id uuid, p_tenant uuid, p_domain uuid, p_requalification_id uuid, p_package_id uuid,
                                                             p_contract_tests jsonb, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; r observation.connector_requalifications%ROWTYPE; p observation.adapter_packages%ROWTYPE; v_force jsonb; cur observation.adapter_packages%ROWTYPE;
        v_kind text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.connector.requalification.submit']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := observation.cr_actor('requalification', p_actor);
  IF p_request_id IS NOT NULL AND EXISTS (SELECT 1 FROM observation.connector_requalification_events e WHERE e.request_id = p_request_id) THEN
    SELECT r2.* INTO r FROM observation.connector_requalifications r2 JOIN observation.connector_requalification_events e ON e.requalification_id = r2.requalification_id
     WHERE e.request_id = p_request_id;
    IF r.requalification_id IS DISTINCT FROM p_requalification_id OR r.submitted_by IS DISTINCT FROM v_actor THEN
      RAISE EXCEPTION 'requalification rejected (duplicate): request % already recorded another act', p_request_id USING ERRCODE = '23505';
    END IF;
    RETURN observation.cr_requalification_json(r) || jsonb_build_object('replayed', true);
  END IF;
  PERFORM observation.cr_assert_person('requalification', v_actor, p_tenant, p_domain, ARRAY['collection_manager'], NULL, 'submitting a connector''s requalification');
  SELECT * INTO r FROM observation.connector_requalifications x WHERE x.requalification_id = p_requalification_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'requalification rejected (unknown_requalification): requalification % is not recorded in this domain', coalesce(p_requalification_id::text, '<none>') USING ERRCODE = '23503';
  END IF;
  IF r.state NOT IN ('required', 'rejected') THEN
    RAISE EXCEPTION 'requalification rejected (state): requalification % is %; only a required or rejected one is submitted', r.requalification_id, r.state USING ERRCODE = '23514';
  END IF;
  SELECT s.connector_kind INTO v_kind FROM observation.source_contracts_current s WHERE s.source_id = r.source_id AND s.contract_version = r.contract_version;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'requalification rejected (reason): a submission states what changed in 8 to 2000 characters' USING ERRCODE = '22023';
  END IF;
  IF p_contract_tests IS NULL OR jsonb_typeof(p_contract_tests) <> 'object' OR p_contract_tests ->> 'outcome' IS DISTINCT FROM 'pass' THEN
    RAISE EXCEPTION 'requalification rejected (contract_tests): the contract tests the API ran in a cell did not pass (%); the package is not submitted', coalesce(p_contract_tests ->> 'summary', p_contract_tests ->> 'outcome', 'not run') USING ERRCODE = '22023';
  END IF;
  IF v_kind = 'adapter' THEN
    SELECT * INTO p FROM observation.adapter_packages x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'requalification rejected (unknown_package): package % is not registered in this domain', coalesce(p_package_id::text, '<none>') USING ERRCODE = '23503';
    END IF;
    IF p.state <> 'approved' THEN
      RAISE EXCEPTION 'requalification rejected (package): % % is %; a requalification submits an approved package (a second person reviewed its code)', p.name, p.version, p.state USING ERRCODE = '22023';
    END IF;
    v_force := observation.cr_package_in_force(p_tenant, p_domain, r.source_id, r.contract_version);
    SELECT * INTO cur FROM observation.adapter_packages x WHERE x.package_id = (v_force ->> 'package_id')::uuid;
    IF cur.package_id IS NOT NULL AND cur.name <> p.name THEN
      RAISE EXCEPTION 'requalification rejected (package): the contract runs %; a requalification moves it to another version of the same package, not to %', cur.name, p.name USING ERRCODE = '22023';
    END IF;
    IF r.cause <> 'credential_rotated' AND p.package_digest = r.digest_at_opening THEN
      RAISE EXCEPTION 'requalification rejected (package): the connector was suspended for its behaviour (%); the same package digest % cannot requalify it — a new digest is required', r.cause, p.package_digest USING ERRCODE = '22023';
    END IF;
  ELSIF p_package_id IS NOT NULL THEN
    RAISE EXCEPTION 'requalification rejected (package): only an adapter contract binds a package' USING ERRCODE = '22023';
  END IF;
  UPDATE observation.connector_requalifications SET state = 'submitted', package_id = p.package_id, package_version = p.version, package_digest = p.package_digest,
         contract_tests = p_contract_tests, submitted_by = v_actor, submitted_at = clock_timestamp(), submit_reason = btrim(p_reason),
         decided_by = NULL, decided_at = NULL, decision_reason = NULL
   WHERE requalification_id = r.requalification_id RETURNING * INTO r;
  INSERT INTO observation.connector_requalification_events (event_id, scope, tenant_id, domain_id, requalification_id, event, actor, details, request_id, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, r.requalification_id, 'requalification.submitted', v_actor,
          jsonb_build_object('package_id', r.package_id, 'package_version', r.package_version, 'package_digest', r.package_digest, 'contract_tests', p_contract_tests,
                             'reason', r.submit_reason), p_request_id, p_correlation);
  RETURN observation.cr_requalification_json(r) || jsonb_build_object('replayed', false);
END $$;
REVOKE ALL ON FUNCTION observation.submit_requalification(uuid, uuid, uuid, uuid, uuid, jsonb, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.submit_requalification(uuid, uuid, uuid, uuid, uuid, jsonb, text, uuid, uuid) TO eye_commit;

/* DECIDE: a SECOND person — a domain admin or a collection manager, never the submitter, never an agent, never an external collaborator —
   approves (the contract records contract.requalified; the package becomes the one in force) or rejects (it may be submitted again). */
CREATE OR REPLACE FUNCTION observation.decide_requalification(p_request_id uuid, p_tenant uuid, p_domain uuid, p_requalification_id uuid, p_decision text, p_reason text,
                                                             p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; r observation.connector_requalifications%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.connector.requalification.approve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := observation.cr_actor('requalification', p_actor);
  IF p_decision IS NULL OR p_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'requalification rejected (decision): the decision is approve or reject' USING ERRCODE = '22023';
  END IF;
  IF p_request_id IS NOT NULL AND EXISTS (SELECT 1 FROM observation.connector_requalification_events e WHERE e.request_id = p_request_id) THEN
    SELECT r2.* INTO r FROM observation.connector_requalifications r2 JOIN observation.connector_requalification_events e ON e.requalification_id = r2.requalification_id
     WHERE e.request_id = p_request_id;
    IF r.requalification_id IS DISTINCT FROM p_requalification_id OR r.decided_by IS DISTINCT FROM v_actor THEN
      RAISE EXCEPTION 'requalification rejected (duplicate): request % already recorded another act', p_request_id USING ERRCODE = '23505';
    END IF;
    RETURN observation.cr_requalification_json(r) || jsonb_build_object('replayed', true);
  END IF;
  SELECT * INTO r FROM observation.connector_requalifications x WHERE x.requalification_id = p_requalification_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'requalification rejected (unknown_requalification): requalification % is not recorded in this domain', coalesce(p_requalification_id::text, '<none>') USING ERRCODE = '23503';
  END IF;
  PERFORM observation.cr_assert_person('requalification', v_actor, p_tenant, p_domain, ARRAY['domain_admin', 'collection_manager'], r.submitted_by,
                                       'deciding a connector''s requalification (a second person: never its submitter)');
  IF r.state <> 'submitted' THEN
    RAISE EXCEPTION 'requalification rejected (state): requalification % is %; only a submitted one is decided', r.requalification_id, r.state USING ERRCODE = '23514';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'requalification rejected (reason): a decision states its reason in 8 to 2000 characters (what was reviewed)' USING ERRCODE = '22023';
  END IF;
  UPDATE observation.connector_requalifications SET state = CASE p_decision WHEN 'approve' THEN 'approved' ELSE 'rejected' END, decided_by = v_actor,
         decided_at = clock_timestamp(), decision_reason = btrim(p_reason)
   WHERE requalification_id = r.requalification_id RETURNING * INTO r;
  INSERT INTO observation.connector_requalification_events (event_id, scope, tenant_id, domain_id, requalification_id, event, actor, details, request_id, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, r.requalification_id, CASE p_decision WHEN 'approve' THEN 'requalification.approved' ELSE 'requalification.rejected' END,
          v_actor, jsonb_build_object('reason', r.decision_reason, 'submitted_by', r.submitted_by, 'package_digest', r.package_digest), p_request_id, p_correlation);
  IF p_decision = 'approve' THEN
    INSERT INTO observation.source_contract_events (event_id, scope, tenant_id, domain_id, source_id, contract_version, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, r.source_id, r.contract_version, 'contract.requalified', v_actor,
            jsonb_build_object('requalification_id', r.requalification_id, 'cause', r.cause, 'package_id', r.package_id, 'package_version', r.package_version,
                               'package_digest', r.package_digest, 'submitted_by', r.submitted_by, 'reason', r.decision_reason), p_correlation);
  END IF;
  RETURN observation.cr_requalification_json(r) || jsonb_build_object('replayed', false);
END $$;
REVOKE ALL ON FUNCTION observation.decide_requalification(uuid, uuid, uuid, uuid, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.decide_requalification(uuid, uuid, uuid, uuid, text, text, uuid, uuid) TO eye_commit;

/* ROTATE: a named collection manager binds a NEW credential reference to an adapter contract version (the next binding version), the one
   in force is revoked, `contract.credential_rotated` is recorded, the contract is suspended and its requalification opened (or joined). The
   gateway injects only the binding in force; the value is never written anywhere. */
CREATE OR REPLACE FUNCTION observation.rotate_connector_credential(p_request_id uuid, p_tenant uuid, p_domain uuid, p_source uuid, p_cv int, p_ref text, p_header text,
                                                                  p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = observation, governance, pg_catalog, pg_temp AS $$
DECLARE v_actor uuid; c observation.source_contracts_current%ROWTYPE; prev observation.connector_credential_bindings%ROWTYPE; b observation.connector_credential_bindings%ROWTYPE;
        v_version int; v_out jsonb; v_force jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.connector.credential.rotate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  v_actor := observation.cr_actor('credential rotation', p_actor);
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'credential rotation rejected (request): a rotation carries its request id' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO b FROM observation.connector_credential_bindings x WHERE x.request_id = p_request_id;
  IF FOUND THEN
    IF b.bound_by IS DISTINCT FROM v_actor OR b.source_id IS DISTINCT FROM p_source OR b.contract_version IS DISTINCT FROM p_cv OR b.credential_ref IS DISTINCT FROM p_ref THEN
      RAISE EXCEPTION 'credential rotation rejected (duplicate): request % already recorded another rotation', p_request_id USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('binding_version', b.binding_version, 'ref', b.credential_ref, 'header', b.credential_header, 'replayed', true);
  END IF;
  PERFORM observation.cr_assert_person('credential rotation', v_actor, p_tenant, p_domain, ARRAY['collection_manager'], NULL, 'rotating a connector''s credential');
  SELECT * INTO c FROM observation.source_contracts_current x WHERE x.source_id = p_source AND x.contract_version = p_cv AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'credential rotation rejected (unknown_source): source % v% is not recorded in this domain', coalesce(p_source::text, '<none>'), coalesce(p_cv::text, '<none>') USING ERRCODE = '23503';
  END IF;
  IF c.connector_kind <> 'adapter' THEN
    RAISE EXCEPTION 'credential rotation rejected (kind): a % contract carries its credential reference in its own document (B11) — a rotation is a new contract version; the gateway''s binding is an adapter contract''s', c.connector_kind USING ERRCODE = '22023';
  END IF;
  IF c.lifecycle_state IN ('retired', 'superseded', 'draft') THEN
    RAISE EXCEPTION 'credential rotation rejected (state): source % v% is %; a credential is rotated on an approved, active or suspended contract', p_source, p_cv, c.lifecycle_state USING ERRCODE = '23514';
  END IF;
  IF p_ref IS NULL OR p_ref !~ '^EYE_SRC_[A-Z0-9_]{1,64}$' THEN
    RAISE EXCEPTION 'credential rotation rejected (reference): a credential is named by its deployment reference EYE_SRC_<NAME>, never by its value' USING ERRCODE = '22023';
  END IF;
  IF p_header IS NULL OR p_header !~ '^[A-Za-z0-9-]{1,64}$' THEN
    RAISE EXCEPTION 'credential rotation rejected (header): the header the gateway injects is 1 to 64 letters, digits or hyphens' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'credential rotation rejected (reason): a rotation states why in 8 to 2000 characters (the exposure, the expiry, the schedule)' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('observation.credential:' || p_source || ':' || p_cv, 0));
  SELECT * INTO prev FROM observation.connector_credential_bindings x WHERE x.source_id = p_source AND x.contract_version = p_cv AND x.state = 'in_force';
  IF (prev.source_id IS NOT NULL AND prev.credential_ref = p_ref) OR (prev.source_id IS NULL AND c.contract #>> '{security_and_operations,credential_ref}' = p_ref) THEN
    RAISE EXCEPTION 'credential rotation rejected (reference): % is the reference in force; a rotation binds a new one', p_ref USING ERRCODE = '22023';
  END IF;
  v_version := CASE WHEN prev.source_id IS NULL THEN 1 ELSE prev.binding_version + 1 END;
  IF prev.source_id IS NOT NULL THEN
    UPDATE observation.connector_credential_bindings SET state = 'revoked', revoked_by = v_actor, revoked_at = clock_timestamp()
     WHERE source_id = p_source AND contract_version = p_cv AND binding_version = prev.binding_version;
  END IF;
  v_force := observation.cr_package_in_force(p_tenant, p_domain, p_source, p_cv);
  v_out := observation.cr_suspend_and_open(p_tenant, p_domain, p_source, p_cv, v_actor, 'credential_rotated',
             format('credential rotated to binding v%s (%s); the previous %s revoked', v_version, p_ref,
                    CASE WHEN prev.source_id IS NULL THEN 'contract reference ' || coalesce(c.contract #>> '{security_and_operations,credential_ref}', '(none)') ELSE 'binding v' || prev.binding_version END),
             NULL, NULL, v_force ->> 'digest', p_correlation);
  INSERT INTO observation.connector_credential_bindings (scope, tenant_id, domain_id, source_id, contract_version, binding_version, credential_ref, credential_header, state,
                                                         rotated_from, reason, bound_by, requalification_id, request_id, correlation_id)
  VALUES ('DOMAIN', p_tenant, p_domain, p_source, p_cv, v_version, p_ref, p_header, 'in_force', CASE WHEN v_version > 1 THEN v_version - 1 END, btrim(p_reason), v_actor,
          (v_out #>> '{requalification,requalification_id}')::uuid, p_request_id, p_correlation)
  RETURNING * INTO b;
  INSERT INTO observation.source_contract_events (event_id, scope, tenant_id, domain_id, source_id, contract_version, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_source, p_cv, 'contract.credential_rotated', v_actor,
          jsonb_build_object('binding_version', v_version, 'credential_ref', p_ref, 'credential_header', p_header, 'revoked_binding_version', prev.binding_version,
                             'revoked_contract_reference', CASE WHEN prev.source_id IS NULL THEN c.contract #>> '{security_and_operations,credential_ref}' END,
                             'reason', btrim(p_reason), 'requalification_id', v_out #>> '{requalification,requalification_id}'), p_correlation);
  RETURN jsonb_build_object('binding_version', b.binding_version, 'ref', b.credential_ref, 'header', b.credential_header, 'revoked_binding_version', prev.binding_version,
                            'requalification', v_out -> 'requalification', 'suspended', v_out -> 'suspended', 'contract_state', v_out -> 'contract_state', 'replayed', false);
END $$;
REVOKE ALL ON FUNCTION observation.rotate_connector_credential(uuid, uuid, uuid, uuid, int, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.rotate_connector_credential(uuid, uuid, uuid, uuid, int, text, text, text, uuid, uuid) TO eye_commit;

-- §CR.8 THE READS (eye_app, eye_commit; the read scope asserted) ──────────────────────────────────────────────────────────────────────────
/* The connectors register: every package (with its ledger), every adapter contract version with its package in force and why it can or
   cannot run, every requalification (with its ledger), every credential binding (references only). */
CREATE OR REPLACE FUNCTION observation.connector_register_read(p_tenant uuid, p_domain uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = observation, graph, pg_catalog, pg_temp AS $$
DECLARE v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the connectors register');
  RETURN jsonb_build_object(
    'packages', (SELECT coalesce(jsonb_agg(observation.cr_package_json(p) || jsonb_build_object('events',
                   (SELECT coalesce(jsonb_agg(jsonb_build_object('event', e.event, 'actor', e.actor, 'at', graph.pv_iso(e.occurred_at), 'details', e.details) ORDER BY e.occurred_at, e.event_id), '[]'::jsonb)
                      FROM observation.adapter_package_events e WHERE e.package_id = p.package_id)) ORDER BY p.name, p.registered_at), '[]'::jsonb)
                   FROM observation.adapter_packages p WHERE p.tenant_id = p_tenant AND p.domain_id = p_domain),
    'contracts', (SELECT coalesce(jsonb_agg(jsonb_build_object('source_id', s.source_id, 'contract_version', s.contract_version, 'source_key', s.source_key, 'name', s.name,
                     'lifecycle_state', s.lifecycle_state, 'acquisition_mode', s.acquisition_mode, 'endpoints', coalesce(s.contract #> '{identity,endpoints}', '[]'::jsonb),
                     'package_in_force', observation.cr_package_in_force(p_tenant, p_domain, s.source_id, s.contract_version),
                     'package_problem', observation.cr_package_problem(p_tenant, p_domain, observation.cr_package_in_force(p_tenant, p_domain, s.source_id, s.contract_version)),
                     'open_requalification', (SELECT observation.cr_requalification_json(q) FROM observation.cr_open_requalification(s.source_id, s.contract_version) q WHERE q.requalification_id IS NOT NULL))
                   ORDER BY s.source_key, s.contract_version), '[]'::jsonb)
                   FROM observation.source_contracts_current s WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.connector_kind = 'adapter'),
    'requalifications', (SELECT coalesce(jsonb_agg(observation.cr_requalification_json(r) || jsonb_build_object('events',
                   (SELECT coalesce(jsonb_agg(jsonb_build_object('event', e.event, 'actor', e.actor, 'at', graph.pv_iso(e.occurred_at), 'details', e.details) ORDER BY e.occurred_at, e.event_id), '[]'::jsonb)
                      FROM observation.connector_requalification_events e WHERE e.requalification_id = r.requalification_id)) ORDER BY r.opened_at DESC), '[]'::jsonb)
                   FROM observation.connector_requalifications r WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain),
    'credential_bindings', (SELECT coalesce(jsonb_agg(jsonb_build_object('source_id', b.source_id, 'contract_version', b.contract_version, 'binding_version', b.binding_version,
                     'ref', b.credential_ref, 'header', b.credential_header, 'state', b.state, 'rotated_from', b.rotated_from, 'reason', b.reason, 'bound_by', b.bound_by,
                     'bound_at', graph.pv_iso(b.bound_at), 'revoked_by', b.revoked_by, 'revoked_at', graph.pv_iso(b.revoked_at), 'requalification_id', b.requalification_id)
                   ORDER BY b.source_id, b.contract_version, b.binding_version), '[]'::jsonb)
                   FROM observation.connector_credential_bindings b WHERE b.tenant_id = p_tenant AND b.domain_id = p_domain),
    'as_of', graph.pv_iso(v_at));
END $$;
REVOKE ALL ON FUNCTION observation.connector_register_read(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.connector_register_read(uuid, uuid) TO eye_app, eye_commit;

/* The transfer receipts, newest first (optionally of one source or one run): every field but bytes — the digests, sizes, destinations and
   decisions — with the counts by decision and class. */
CREATE OR REPLACE FUNCTION observation.egress_receipts_read(p_tenant uuid, p_domain uuid, p_source uuid, p_run uuid, p_limit int) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = observation, graph, pg_catalog, pg_temp AS $$
DECLARE v_limit int := least(greatest(coalesce(p_limit, 200), 1), 1000);
BEGIN
  PERFORM observation.assert_read_scope(p_tenant, p_domain, 'the egress receipts');
  RETURN jsonb_build_object(
    'receipts', (SELECT coalesce(jsonb_agg(jsonb_build_object('receipt_id', r.receipt_id, 'source_id', r.source_id, 'contract_version', r.contract_version, 'run_id', r.run_id,
                    'seq', r.seq, 'package_id', r.package_id, 'package_digest', r.package_digest, 'requested_at', graph.pv_iso(r.requested_at), 'method', r.method,
                    'url_redacted', r.url_redacted, 'host', r.host, 'purpose', r.purpose, 'data_class', r.data_class, 'decision', r.decision, 'refusal_class', r.refusal_class,
                    'reason', r.reason, 'request_digest', r.request_digest, 'request_bytes', r.request_bytes, 'response_status', r.response_status,
                    'response_digest', r.response_digest, 'response_bytes', r.response_bytes, 'destination', r.destination, 'credential_injected', r.credential_injected,
                    'credential_ref', r.credential_ref, 'recorded_at', graph.pv_iso(r.recorded_at), 'source_key', s.source_key)
                  ORDER BY r.recorded_at DESC, r.run_id, r.seq DESC), '[]'::jsonb)
                  FROM (SELECT * FROM observation.egress_receipts x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND (p_source IS NULL OR x.source_id = p_source)
                          AND (p_run IS NULL OR x.run_id = p_run) ORDER BY x.recorded_at DESC, x.seq DESC LIMIT v_limit) r
                  LEFT JOIN LATERAL (SELECT s2.source_key FROM observation.source_contracts_current s2 WHERE s2.source_id = r.source_id AND s2.contract_version = r.contract_version) s ON true),
    'counts', (SELECT coalesce(jsonb_object_agg(k, n), '{}'::jsonb) FROM (SELECT x.decision || coalesce(':' || x.refusal_class, '') k, count(*) n FROM observation.egress_receipts x
                 WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND (p_source IS NULL OR x.source_id = p_source) AND (p_run IS NULL OR x.run_id = p_run) GROUP BY 1) t),
    'limit', v_limit, 'as_of', graph.pv_iso(clock_timestamp()));
END $$;
REVOKE ALL ON FUNCTION observation.egress_receipts_read(uuid, uuid, uuid, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.egress_receipts_read(uuid, uuid, uuid, uuid, int) TO eye_app, eye_commit;

-- §CR.9 observation.transition_contract — 0022:883, its LAST definition, copied WHOLE; the additions are marked `-- B40 cr` ───────────────
/*
 * Lifecycle transitions. The permitted state machine lives here rather than in
 * application code, so a second caller cannot invent a transition:
 *   draft → approved (approve_source only)
 *   approved → active | retired
 *   active → suspended | retired | superseded
 *   suspended → active (reactivate) | retired
 * Activation additionally requires CONFIRMED rights (D2) and an approver.
 * B40 cr (IA-47-005, DP-14-003): activation is refused while the contract version's connector requalification is open (required,
 * submitted or rejected — not yet approved by a second person), and an ADAPTER contract activates only on its package in force: approved,
 * the version and digest it binds. A v1–v3 contract has no requalification and no package: it transitions exactly as before (D8).
 */
CREATE OR REPLACE FUNCTION observation.transition_contract(
  p_source_id uuid, p_contract_version int, p_tenant uuid, p_domain uuid,
  p_target text, p_reason text, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_row observation.source_contracts_current%ROWTYPE; v_ok boolean;
        v_req observation.connector_requalifications%ROWTYPE; v_problem text;   -- B40 cr
BEGIN
  PERFORM observation.assert_authority(ARRAY['observation.source.transition']);
  PERFORM observation.assert_scope(p_tenant, p_domain);

  SELECT * INTO v_row FROM observation.source_contracts_current
   WHERE source_id = p_source_id AND contract_version = p_contract_version FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transition rejected: no such source contract version' USING ERRCODE = '23503';
  END IF;

  v_ok := CASE
    WHEN v_row.lifecycle_state = 'approved'  AND p_target IN ('active', 'retired')                 THEN true
    WHEN v_row.lifecycle_state = 'active'    AND p_target IN ('suspended', 'retired', 'superseded') THEN true
    WHEN v_row.lifecycle_state = 'suspended' AND p_target IN ('active', 'retired')                 THEN true
    ELSE false END;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'transition rejected: % → % is not a permitted source-contract transition',
      v_row.lifecycle_state, p_target USING ERRCODE = '23514';
  END IF;
  IF p_target = 'active' THEN
    -- Unconfirmed rights block LIVE acquisition only; frozen replay exercises no
    -- publisher's reuse terms. The unconfirmed state remains on the source and is
    -- surfaced as an attention item regardless of which mode it runs in.
    IF v_row.rights_state <> 'confirmed' AND v_row.acquisition_mode = 'live' THEN
      RAISE EXCEPTION 'activation rejected: rights are % and this contract acquires LIVE; a live contract may not be activated on unconfirmed rights',
        v_row.rights_state USING ERRCODE = '23514';
    END IF;
    IF v_row.rights_state = 'withdrawn' THEN
      RAISE EXCEPTION 'activation rejected: rights have been withdrawn' USING ERRCODE = '23514';
    END IF;
    IF v_row.approver_principal_id IS NULL THEN
      RAISE EXCEPTION 'activation rejected: contract has no approver' USING ERRCODE = '23514';
    END IF;
    -- B40 cr: an open requalification holds the contract version (IA-47-005) — a second person approves it before reactivation
    v_req := observation.cr_open_requalification(p_source_id, p_contract_version);                                            -- B40 cr
    IF v_req.requalification_id IS NOT NULL THEN                                                                                 -- B40 cr
      RAISE EXCEPTION 'transition rejected (held): source % v% is held for requalification % (%, %); it is activated again once a second person approves a requalified connector',
        p_source_id, p_contract_version, v_req.requalification_id, v_req.cause, v_req.state USING ERRCODE = '23514';             -- B40 cr
    END IF;                                                                                                                      -- B40 cr
    -- B40 cr: an adapter contract runs only its package in force — approved by a second person, the version and digest bound (D12)
    IF v_row.connector_kind = 'adapter' THEN                                                                                     -- B40 cr
      v_problem := observation.cr_package_problem(v_row.tenant_id, v_row.domain_id,                                              -- B40 cr
                     observation.cr_package_in_force(v_row.tenant_id, v_row.domain_id, p_source_id, p_contract_version));        -- B40 cr
      IF v_problem IS NOT NULL THEN                                                                                              -- B40 cr
        RAISE EXCEPTION 'transition rejected (held): source % v% cannot be activated — %', p_source_id, p_contract_version, v_problem USING ERRCODE = '23514';  -- B40 cr
      END IF;                                                                                                                    -- B40 cr
    END IF;                                                                                                                      -- B40 cr
  END IF;

  UPDATE observation.source_contracts_current
     SET lifecycle_state = p_target,
         effective_from = CASE WHEN p_target = 'active' AND effective_from IS NULL
                               THEN clock_timestamp() ELSE effective_from END,
         effective_to   = CASE WHEN p_target IN ('retired', 'superseded')
                               THEN clock_timestamp() ELSE effective_to END,
         updated_at = clock_timestamp()
   WHERE source_id = p_source_id AND contract_version = p_contract_version;

  INSERT INTO observation.source_contract_events (
    event_id, scope, tenant_id, domain_id, source_id, contract_version,
    event, actor_principal_id, details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_source_id, p_contract_version,
    CASE p_target
      WHEN 'active'     THEN CASE WHEN v_row.lifecycle_state = 'suspended'
                                  THEN 'contract.reactivated' ELSE 'contract.activated' END
      WHEN 'suspended'  THEN 'contract.suspended'
      WHEN 'retired'    THEN 'contract.retired'
      WHEN 'superseded' THEN 'contract.superseded' END,
    public.eye_principal(),
    jsonb_build_object('from', v_row.lifecycle_state, 'to', p_target, 'reason', p_reason),
    p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION observation.transition_contract(uuid,int,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION observation.transition_contract(uuid,int,uuid,uuid,text,text,uuid,uuid) TO eye_commit;
