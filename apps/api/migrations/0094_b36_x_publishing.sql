-- 0094 §D — CP-6 B36 part `publishing` (F-P6-13 completes; 2026-09-30): THE PUBLISHING AND DISTRIBUTION CENTER.
-- Built on the §0 prelude (0094_b36_strategic_planning_home_briefing_publishing.sql: the roles executive_operator and board_member, the
-- signature beyond the audit chain executive.record_signature / signature_of, the uniform gate states executive.gate_states, the attention
-- class publication.correction and the subject kind publication, the canonical object type PUB). Nothing earlier is edited; nothing of the
-- prelude is re-declared.
--
--   d1  THE PUBLICATION OBJECT binding EXACT BYTES to audience, classification and channel (OBJ-39): executive.publications and
--       executive.publication_versions — the source snapshot a version binds (a briefing edition by briefing_id + content_digest, or a
--       report render by package/version + the DPK's content digest), the rendered bytes under the vault EXPORT root (the B13/B15 package
--       writer: <export_root>/<tenant>/<domain>/<publication_id>/<blob>.bin) with their sha256 and length, the format (html | md | json
--       renderable today; pdf-a declared unsupported and refused, never silently), the audience (roles, named recipients, an external
--       audience), the classification (at least as restrictive as the source's — a wider one is refused), the channels (in_app always;
--       email | teams SYNTHETIC through the B34 adapters to local sinks), the accessibility declaration, the template, the state
--       drafted → approved → delivered → (corrected | withdrawn) → archived; a version is immutable once approved; the canonical PUB
--       admitted at approval by the service (objects.admit_version under executive.publication.approve — its payload carries the bytes'
--       sha256; the canonical content_digest binds header + payload as every canonical object's does).
--   d2  APPROVE-DIGEST and DELIVER with RECEIPTS: executive.approve_publication (an executive or decision authority, never the drafter; the
--       digest presented byte-for-byte — a stale one refused; the §0 signature of kind publication recorded by the service in the same write
--       and bound here), executive.deliver_publication (the recipients resolved: the named ones and the holders of the audience roles; the
--       in_app placement recorded here; the synthetic channels recorded per recipient by executive.record_publication_delivery after the
--       adapter answered), executive.acknowledge_publication (the recipient's own act, once).
--   d3  CORRECTION / WITHDRAWAL versioning with recipient notification: executive.correct_publication (a new version bound to a new snapshot
--       and new bytes, the reason, what changed by digest; every recipient of the prior version gets an attention item of class
--       publication.correction, then the channel notice; the prior version reads corrected_by_version), executive.withdraw_publication (the
--       reason; the recipients notified the same way; the bytes retained; the PUB's withdrawn version admitted by the service — 0078's
--       lifecycle idiom); a second correction of a withdrawn publication refused.
--   d4  EXTERNAL communication drafts under review (TC-12): executive.external_drafts — a publication addressed outside the tenant enters
--       review_requested under the uniform gate state; executive.review_external_draft by a human holding `executive` and not the drafter,
--       the classification at most internal; the reviewer, the digest and the signature recorded; approval and delivery refused until the
--       review is approved; the external delivery itself is SYNTHETIC (the sink).
--   d5  ARCHIVE and EXPORT controls PRESERVED: executive.publication_controls reads the rights / residency / retention profiles of the
--       source's canonical header and the active legal holds resting on its evidence; executive.archive_publication carries the versions,
--       receipts and signatures into the archive record (the PUB's archived version); executive.export_publication_check refuses the export of
--       a publication whose source is under a legal hold or a residency restriction with the export path's gate names as the class.
--
-- Refusals: ONE family `publication rejected (<class>): …` and `external draft rejected (<class>): …` (anchored; no earlier row reads either):
-- actor / authority / separation / not_recipient → 403; unknown_* → 404; state / stale_* / withdrawn / archived / unchanged / external_review /
-- legal_hold / residency / signature / object → 409; the rest → 422 — mapped in observation-errors.ts inside /* B36 publishing */.
-- Every figure a harness seeds is SYNTHETIC. Forward-only.

-- ═══════════════════════════════════════════════════════════════════════════════════
-- §D.1 THE CANONICAL WRITE ACTIONS AND THE PUB@v1 SCHEMA
-- ═══════════════════════════════════════════════════════════════════════════════════
INSERT INTO observation.canonical_write_actions (action, object_types, rationale) VALUES
  ('executive.publication.approve', ARRAY['PUB'], 'The approve-digest of a publication version admits the PUB version bound to those exact bytes and nothing else (B36 §D)'),
  ('executive.publication.withdraw', ARRAY['PUB'], 'The withdrawal of a publication admits the PUB''s withdrawn version (0078''s lifecycle idiom) and nothing else (B36 §D)'),
  ('executive.publication.archive', ARRAY['PUB'], 'The archive of a publication admits the PUB''s archived version carrying its versions, receipts and signatures under the source''s controls (B36 §D)')
ON CONFLICT (action) DO NOTHING;

INSERT INTO objects.schema_registry (object_type, schema_version, json_schema, compatibility) VALUES
('PUB', 'v1', '{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["publication_id","version","title","state","source","bytes","format","audience","channels","classification","accessibility","template","external","drafted_by","approved_by","approval_digest","signature_id"],
  "properties": {
    "publication_id": {"type": "string"},
    "version": {"type": "integer", "minimum": 1},
    "title": {"type": "string"},
    "state": {"type": "string", "enum": ["approved","delivered","corrected","withdrawn","archived"]},
    "source": {"type": "object", "required": ["kind","id","version","digest"], "properties": {"kind": {"type": "string", "enum": ["briefing","report"]}, "id": {"type": "string"}, "version": {"type": "integer"}, "digest": {"type": "string"}}},
    "bytes": {"type": "object", "required": ["sha256","byte_length","vault_ref","render_method"], "properties": {"sha256": {"type": "string"}, "byte_length": {"type": "integer"}, "vault_ref": {"type": "string"}, "render_method": {"type": "string"}}},
    "format": {"type": "string", "enum": ["html","md","json"]},
    "audience": {"type": "object"},
    "channels": {"type": "array", "items": {"type": "string"}},
    "classification": {"type": "string", "enum": ["public","internal","confidential","restricted"]},
    "accessibility": {"type": "object"},
    "template": {"type": "string"},
    "external": {"type": ["object","null"]},
    "drafted_by": {"type": "string"},
    "approved_by": {"type": ["string","null"]},
    "approval_digest": {"type": ["string","null"]},
    "signature_id": {"type": ["string","null"]},
    "withdrawal": {"type": ["object","null"]},
    "archive": {"type": ["object","null"]}
  }
}'::jsonb, 'backward')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════════
-- §D.2 THE TABLES
-- ═══════════════════════════════════════════════════════════════════════════════════
/* The publication (OBJ-39): what is bound at draft and never changes; its state and its current version move by the ports below. */
CREATE TABLE executive.publications (
  publication_id    uuid PRIMARY KEY,
  scope             text NOT NULL,
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  title             text NOT NULL CHECK (length(btrim(title)) BETWEEN 4 AND 300),
  audience          jsonb NOT NULL CHECK (jsonb_typeof(audience) = 'object'),
  classification    text NOT NULL CHECK (classification IN ('public', 'internal', 'confidential', 'restricted')),
  channels          text[] NOT NULL CHECK (channels <@ ARRAY['in_app', 'email', 'teams'] AND 'in_app' = ANY (channels)),
  format            text NOT NULL CHECK (format IN ('html', 'md', 'json')),
  accessibility     jsonb NOT NULL CHECK (jsonb_typeof(accessibility) = 'object'),
  template          text NOT NULL CHECK (template ~ '^[a-z0-9-]+@[0-9]+$'),
  external          jsonb CHECK (external IS NULL OR jsonb_typeof(external) = 'object'),
  drafted_by        uuid NOT NULL,
  drafted_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  current_version   int NOT NULL CHECK (current_version >= 1),
  state             text NOT NULL CHECK (state IN ('drafted', 'approved', 'delivered', 'corrected', 'withdrawn', 'archived')),
  withdrawn_by      uuid,
  withdrawn_at      timestamptz,
  withdrawal_reason text,
  archived_by       uuid,
  archived_at       timestamptz,
  archive_ref       jsonb,
  updated_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id    uuid NOT NULL,
  CONSTRAINT xpb_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xpb_withdrawn_bound CHECK ((withdrawn_at IS NULL) = (withdrawn_by IS NULL) AND (withdrawn_at IS NULL) = (withdrawal_reason IS NULL)),
  CONSTRAINT xpb_archived_bound CHECK ((archived_at IS NULL) = (archived_by IS NULL) AND (archived_at IS NULL) = (archive_ref IS NULL))
);
CREATE INDEX xpb_domain ON executive.publications (tenant_id, domain_id, drafted_at);

/* A version: the snapshot it binds, the exact bytes it carries; immutable once approved (the forward trigger). */
CREATE TABLE executive.publication_versions (
  publication_id       uuid NOT NULL REFERENCES executive.publications (publication_id),
  version              int  NOT NULL CHECK (version >= 1),
  scope                text NOT NULL,
  tenant_id            uuid NOT NULL,
  domain_id            uuid NOT NULL,
  source_kind          text NOT NULL CHECK (source_kind IN ('briefing', 'report')),
  source_id            uuid NOT NULL,
  source_version       int  NOT NULL CHECK (source_version >= 1),
  source_digest        text NOT NULL CHECK (source_digest ~ '^[0-9a-f]{64}$'),
  format               text NOT NULL CHECK (format IN ('html', 'md', 'json')),
  bytes_digest         text NOT NULL CHECK (bytes_digest ~ '^[0-9a-f]{64}$'),
  byte_length          int  NOT NULL CHECK (byte_length > 0),
  vault_ref            text NOT NULL CHECK (vault_ref ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.bin$'),
  render_method        text NOT NULL,
  state                text NOT NULL CHECK (state IN ('drafted', 'approved', 'delivered', 'corrected', 'withdrawn')),
  drafted_by           uuid NOT NULL,
  drafted_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  correction_of        int,
  correction_reason    text,
  changed              jsonb,
  approved_by          uuid,
  approved_at          timestamptz,
  approval_digest      text CHECK (approval_digest IS NULL OR approval_digest ~ '^[0-9a-f]{64}$'),
  signature_id         uuid,
  pub_object_version   bigint,
  corrected_by_version int,
  correlation_id       uuid NOT NULL,
  PRIMARY KEY (publication_id, version),
  CONSTRAINT xpv_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xpv_correction_bound CHECK ((correction_of IS NULL) = (correction_reason IS NULL) AND (correction_of IS NULL) = (changed IS NULL) AND (correction_of IS NULL OR correction_of < version)),
  CONSTRAINT xpv_approval_bound CHECK ((approved_at IS NULL) = (approved_by IS NULL) AND (approved_at IS NULL) = (approval_digest IS NULL) AND (approved_at IS NULL) = (signature_id IS NULL) AND (approved_at IS NULL) = (pub_object_version IS NULL)),
  CONSTRAINT xpv_state_bound CHECK ((state <> 'drafted' OR approved_at IS NULL) AND (state NOT IN ('approved', 'delivered', 'corrected') OR approved_at IS NOT NULL) AND (state = 'corrected') = (corrected_by_version IS NOT NULL))
);

/* A delivery: one recipient, one channel, one kind (the publication, a correction notice, a withdrawal notice) with the channel's receipt;
   the acknowledgement is the recipient's own act, set once. */
CREATE TABLE executive.publication_deliveries (
  delivery_id            uuid PRIMARY KEY,
  scope                  text NOT NULL,
  tenant_id              uuid NOT NULL,
  domain_id              uuid NOT NULL,
  publication_id         uuid NOT NULL REFERENCES executive.publications (publication_id),
  version                int  NOT NULL,
  recipient_principal_id uuid NOT NULL,
  channel                text NOT NULL CHECK (channel IN ('in_app', 'email', 'teams')),
  kind                   text NOT NULL CHECK (kind IN ('publication', 'correction_notice', 'withdrawal_notice')),
  state                  text NOT NULL CHECK (state IN ('delivered', 'failed')),
  receipt_id             uuid NOT NULL,
  receipt                jsonb,
  provider_ref           text,
  error                  text,
  synthetic_state        boolean NOT NULL,
  delivered_by           uuid NOT NULL,
  delivered_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  acknowledged_by        uuid,
  acknowledged_at        timestamptz,
  acknowledgement_note   text,
  correlation_id         uuid NOT NULL,
  CONSTRAINT xpd_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xpd_once UNIQUE (publication_id, version, recipient_principal_id, channel, kind),
  CONSTRAINT xpd_ack_bound CHECK ((acknowledged_at IS NULL) = (acknowledged_by IS NULL)),
  CONSTRAINT xpd_state_bound CHECK ((state = 'delivered') = (receipt IS NOT NULL) AND (state = 'failed') = (error IS NOT NULL))
);
CREATE INDEX xpd_publication ON executive.publication_deliveries (publication_id, version);
CREATE INDEX xpd_recipient ON executive.publication_deliveries (tenant_id, domain_id, recipient_principal_id);

/* The ledger. */
CREATE TABLE executive.publication_events (
  event_id       uuid PRIMARY KEY,
  scope          text NOT NULL,
  tenant_id      uuid NOT NULL,
  domain_id      uuid NOT NULL,
  publication_id uuid NOT NULL,
  version        int,
  event          text NOT NULL CHECK (event IN ('publication.drafted', 'publication.approved', 'publication.delivered', 'publication.delivery_failed', 'publication.acknowledged',
                                               'publication.corrected', 'publication.correction_notified', 'publication.withdrawn', 'publication.withdrawal_notified',
                                               'publication.archived', 'publication.exported', 'external_draft.review_requested', 'external_draft.reviewed')),
  actor_principal_id uuid NOT NULL,
  details        jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id uuid NOT NULL,
  CONSTRAINT xpe_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX xpe_publication ON executive.publication_events (publication_id, occurred_at);
CREATE TRIGGER xpe_append_only BEFORE UPDATE OR DELETE ON executive.publication_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* TC-12: an external communication draft under publication review — one per publication version addressed outside the tenant. */
CREATE TABLE executive.external_drafts (
  draft_id        uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  publication_id  uuid NOT NULL REFERENCES executive.publications (publication_id),
  version         int  NOT NULL,
  audience_kind   text NOT NULL CHECK (audience_kind IN ('partner', 'regulator', 'press', 'other')),
  audience_name   text NOT NULL CHECK (length(btrim(audience_name)) BETWEEN 2 AND 200),
  drafted_by      uuid NOT NULL,
  gate_state      text NOT NULL CHECK (executive.gate_state_ok(gate_state)),
  requested_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  reviewed_by     uuid,
  reviewed_at     timestamptz,
  review_note     text,
  review_digest   text CHECK (review_digest IS NULL OR review_digest ~ '^[0-9a-f]{64}$'),
  signature_id    uuid,
  correlation_id  uuid NOT NULL,
  CONSTRAINT xed_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xed_once UNIQUE (publication_id, version),
  CONSTRAINT xed_review_bound CHECK ((reviewed_at IS NULL) = (reviewed_by IS NULL) AND (reviewed_at IS NULL) = (review_digest IS NULL) AND (gate_state = 'approved') = (signature_id IS NOT NULL))
);

-- the forward triggers: each row moves one way, by the ports, and nothing bound at draft changes
CREATE OR REPLACE FUNCTION executive.publications_forward() RETURNS trigger
SET search_path = executive, pg_catalog, pg_temp AS $$
DECLARE k text[] := ARRAY['state', 'current_version', 'withdrawn_by', 'withdrawn_at', 'withdrawal_reason', 'archived_by', 'archived_at', 'archive_ref', 'updated_at'];
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'executive publications are append-only: DELETE prohibited' USING ERRCODE = '2F002'; END IF;
  IF (to_jsonb(NEW) - k) <> (to_jsonb(OLD) - k) THEN RAISE EXCEPTION 'publication % is bound at draft; only its state moves', OLD.publication_id USING ERRCODE = '2F002'; END IF;
  IF OLD.state = 'archived' THEN RAISE EXCEPTION 'publication % is archived; nothing of it moves', OLD.publication_id USING ERRCODE = '2F002'; END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER xpb_forward BEFORE UPDATE OR DELETE ON executive.publications FOR EACH ROW EXECUTE FUNCTION executive.publications_forward();

CREATE OR REPLACE FUNCTION executive.publication_versions_forward() RETURNS trigger
SET search_path = executive, pg_catalog, pg_temp AS $$
DECLARE k text[] := ARRAY['state', 'approved_by', 'approved_at', 'approval_digest', 'signature_id', 'pub_object_version', 'corrected_by_version'];
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'executive publication versions are append-only: DELETE prohibited' USING ERRCODE = '2F002'; END IF;
  IF (to_jsonb(NEW) - k) <> (to_jsonb(OLD) - k) THEN RAISE EXCEPTION 'publication version %/% binds its snapshot and bytes; they do not change', OLD.publication_id, OLD.version USING ERRCODE = '2F002'; END IF;
  IF OLD.approved_at IS NOT NULL AND (NEW.approved_at, NEW.approved_by, NEW.approval_digest, NEW.signature_id, NEW.pub_object_version) IS DISTINCT FROM (OLD.approved_at, OLD.approved_by, OLD.approval_digest, OLD.signature_id, OLD.pub_object_version) THEN
    RAISE EXCEPTION 'publication version %/% is approved and immutable; a correction opens the next version', OLD.publication_id, OLD.version USING ERRCODE = '2F002';
  END IF;
  IF OLD.corrected_by_version IS NOT NULL AND NEW.corrected_by_version IS DISTINCT FROM OLD.corrected_by_version THEN
    RAISE EXCEPTION 'publication version %/% is corrected by version %; that does not change', OLD.publication_id, OLD.version, OLD.corrected_by_version USING ERRCODE = '2F002';
  END IF;
  IF OLD.state = 'withdrawn' AND NEW.state <> 'withdrawn' THEN RAISE EXCEPTION 'publication version %/% is withdrawn', OLD.publication_id, OLD.version USING ERRCODE = '2F002'; END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER xpv_forward BEFORE UPDATE OR DELETE ON executive.publication_versions FOR EACH ROW EXECUTE FUNCTION executive.publication_versions_forward();

CREATE OR REPLACE FUNCTION executive.publication_deliveries_forward() RETURNS trigger
SET search_path = executive, pg_catalog, pg_temp AS $$
DECLARE k text[] := ARRAY['acknowledged_by', 'acknowledged_at', 'acknowledgement_note'];
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'executive publication deliveries are append-only: DELETE prohibited' USING ERRCODE = '2F002'; END IF;
  IF (to_jsonb(NEW) - k) <> (to_jsonb(OLD) - k) OR OLD.acknowledged_at IS NOT NULL THEN
    RAISE EXCEPTION 'publication delivery % keeps its receipt; only the recipient''s acknowledgement is set, once', OLD.delivery_id USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER xpd_forward BEFORE UPDATE OR DELETE ON executive.publication_deliveries FOR EACH ROW EXECUTE FUNCTION executive.publication_deliveries_forward();

CREATE OR REPLACE FUNCTION executive.external_drafts_forward() RETURNS trigger
SET search_path = executive, pg_catalog, pg_temp AS $$
DECLARE k text[] := ARRAY['gate_state', 'reviewed_by', 'reviewed_at', 'review_note', 'review_digest', 'signature_id'];
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'executive external drafts are append-only: DELETE prohibited' USING ERRCODE = '2F002'; END IF;
  IF (to_jsonb(NEW) - k) <> (to_jsonb(OLD) - k) THEN RAISE EXCEPTION 'external draft % is bound at draft; only its review moves', OLD.draft_id USING ERRCODE = '2F002'; END IF;
  IF OLD.gate_state NOT IN ('review_requested', 'information_requested') THEN RAISE EXCEPTION 'external draft % is %; its review is closed', OLD.draft_id, OLD.gate_state USING ERRCODE = '2F002'; END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER xed_forward BEFORE UPDATE OR DELETE ON executive.external_drafts FOR EACH ROW EXECUTE FUNCTION executive.external_drafts_forward();

-- ═══════════════════════════════════════════════════════════════════════════════════
-- §D.3 THE READS: the ledger writer, the source of a publication and its controls, the recipients
-- ═══════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION executive.publication_event(p_event_id uuid, p_publication uuid, p_version int, p_tenant uuid, p_domain uuid, p_event text, p_actor uuid, p_details jsonb, p_correlation uuid) RETURNS uuid
SET search_path = executive, pg_catalog, pg_temp AS $$
  INSERT INTO executive.publication_events (event_id, scope, tenant_id, domain_id, publication_id, version, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_publication, p_version, p_event, p_actor, coalesce(p_details, '{}'::jsonb), p_correlation)
  RETURNING event_id;
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION executive.publication_event(uuid,uuid,int,uuid,uuid,text,uuid,jsonb,uuid) FROM PUBLIC;

/* THE SOURCE a publication binds, as its canonical record says it: a briefing edition (BRF:<id>@1, its content digest the edition's) or a
   report render (DPK:<package>@<version>, its digest the DPK's content digest — a package version has a DPK once proposed). The controls
   are the header's (classification, rights, residency, retention, access policy); the holds are the ACTIVE legal holds resting on the EVD
   objects the header names (its evidence_refs and source_object_ids) or on the manifests those EVDs name — the export path's own gate. */
CREATE OR REPLACE FUNCTION executive.publication_source(p_tenant uuid, p_domain uuid, p_kind text, p_id uuid, p_version int) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = executive, objects, observation, decision, pg_catalog, pg_temp AS $$
DECLARE o objects.canonical_objects%ROWTYPE; v_type text; v_digest text; v_holds jsonb; v_title text; v_evd uuid[];
BEGIN
  IF p_kind NOT IN ('briefing', 'report') THEN RETURN jsonb_build_object('found', false, 'reason', 'the source kind is briefing or report'); END IF;
  v_type := CASE p_kind WHEN 'briefing' THEN 'BRF' ELSE 'DPK' END;
  SELECT * INTO o FROM objects.canonical_objects c WHERE c.object_id = p_id AND c.object_type = v_type AND c.object_version = p_version AND c.tenant_id = p_tenant AND c.domain_id = p_domain;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false, 'reason', CASE WHEN p_kind = 'briefing' THEN 'no briefing edition ' || p_id::text || ' is recorded in this domain'
                                                             ELSE 'no proposed version ' || p_version || ' of package ' || p_id::text || ' is recorded in this domain (a report binds a proposed, approved or committed version)' END);
  END IF;
  IF p_kind = 'briefing' THEN
    SELECT b.content_digest INTO v_digest FROM executive.briefings b WHERE b.briefing_id = p_id;
    v_title := 'Briefing ' || to_char(coalesce((SELECT b.known_at FROM executive.briefings b WHERE b.briefing_id = p_id), o.recorded_at), 'YYYY-MM-DD HH24:MI') || ' UTC';
  ELSE
    v_digest := o.content_digest;
    SELECT p.title INTO v_title FROM decision.packages_current p WHERE p.package_id = p_id;
  END IF;
  SELECT coalesce(array_agg(DISTINCT substring(r from 5 for 36)::uuid), ARRAY[]::uuid[]) INTO v_evd
    FROM (SELECT jsonb_array_elements_text(coalesce(o.evidence_refs, '[]'::jsonb)) r UNION ALL SELECT jsonb_array_elements_text(coalesce(o.source_object_ids, '[]'::jsonb))) x
   WHERE r ~ '^EVD:[0-9a-f-]{36}@';
  SELECT coalesce(jsonb_agg(jsonb_build_object('hold_id', h.hold_id, 'manifest_id', h.manifest_id, 'evd_object_id', h.evd_object_id, 'reason', h.reason, 'placed_at', h.placed_at) ORDER BY h.placed_at), '[]'::jsonb) INTO v_holds
    FROM observation.legal_holds h
   WHERE h.tenant_id = p_tenant AND h.domain_id = p_domain AND h.lifted_at IS NULL
     AND (h.evd_object_id = ANY (v_evd)
          OR h.manifest_id IN (SELECT (e.payload ->> 'manifest_id')::uuid FROM objects.canonical_objects e WHERE e.object_type = 'EVD' AND e.object_id = ANY (v_evd) AND e.payload ? 'manifest_id'));
  RETURN jsonb_build_object('found', true, 'kind', p_kind, 'id', p_id, 'version', p_version, 'object_type', v_type, 'object_version', o.object_version, 'digest', v_digest,
                            'canonical_digest', o.content_digest, 'title', coalesce(v_title, 'untitled'), 'lifecycle_state', o.lifecycle_state, 'synthetic_state', o.synthetic_state,
                            'controls', jsonb_build_object('classification', o.classification, 'rights_profile', o.rights_profile, 'residency_profile', o.residency_profile,
                                                           'retention_profile', o.retention_profile, 'access_policy_ref', o.access_policy_ref),
                            'source_object_ids', coalesce(o.source_object_ids, '[]'::jsonb), 'evidence_refs', coalesce(o.evidence_refs, '[]'::jsonb), 'holds', v_holds);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.publication_source(uuid,uuid,text,uuid,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.publication_source(uuid,uuid,text,uuid,int) TO eye_app, eye_commit;

/* The controls a publication carries into its archive and export: the CURRENT version's source, read now. */
CREATE OR REPLACE FUNCTION executive.publication_controls(p_publication uuid) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = executive, pg_catalog, pg_temp AS $$
  SELECT executive.publication_source(p.tenant_id, p.domain_id, v.source_kind, v.source_id, v.source_version) - 'source_object_ids' - 'evidence_refs'
    FROM executive.publications p JOIN executive.publication_versions v ON v.publication_id = p.publication_id AND v.version = p.current_version
   WHERE p.publication_id = p_publication;
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION executive.publication_controls(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.publication_controls(uuid) TO eye_app, eye_commit;

/* THE RECIPIENTS of an audience: the named recipients and the active human holders of the audience's roles in the domain (a TENANT binding
   reaches every domain), each once. */
CREATE OR REPLACE FUNCTION executive.publication_recipients(p_tenant uuid, p_domain uuid, p_audience jsonb) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = executive, identity, pg_catalog, pg_temp AS $$
  WITH named AS (
    SELECT (x.v)::uuid AS principal_id, 'named' AS via FROM jsonb_array_elements_text(coalesce(p_audience -> 'recipients', '[]'::jsonb)) AS x(v) WHERE x.v ~ '^[0-9a-f-]{36}$'
  ), by_role AS (
    SELECT DISTINCT b.principal_id, 'role:' || b.role_code AS via
      FROM identity.role_bindings b
     WHERE b.revoked_at IS NULL AND b.role_code IN (SELECT jsonb_array_elements_text(coalesce(p_audience -> 'roles', '[]'::jsonb)))
       AND b.tenant_id = p_tenant AND (b.scope = 'TENANT' OR (b.scope = 'DOMAIN' AND b.domain_id = p_domain))
  ), everyone AS (SELECT * FROM named UNION ALL SELECT * FROM by_role)
  SELECT coalesce(jsonb_agg(jsonb_build_object('principal_id', e.principal_id, 'display_name', p.display_name, 'via', e.via) ORDER BY p.display_name, e.principal_id), '[]'::jsonb)
    FROM (SELECT principal_id, min(via) AS via FROM everyone GROUP BY principal_id) e
    JOIN identity.principals p ON p.id = e.principal_id AND p.kind = 'human' AND p.status = 'active' AND (p.tenant_id = p_tenant OR p.scope = 'PLATFORM');
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION executive.publication_recipients(uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.publication_recipients(uuid,uuid,jsonb) TO eye_app, eye_commit;

/* The ARCHIVE RECORD: every version with its digests and approval, every delivery with its receipt and acknowledgement, every signature,
   the events, the controls and holds as of now (an invoker read under the caller's RLS; the archive port and the export carry it). */
CREATE OR REPLACE FUNCTION executive.publication_archive_record(p_publication uuid) RETURNS jsonb
STABLE SET search_path = executive, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'publication', (SELECT to_jsonb(p) - 'scope' FROM executive.publications p WHERE p.publication_id = p_publication),
    'versions', (SELECT coalesce(jsonb_agg((to_jsonb(v) - 'scope' - 'tenant_id' - 'domain_id') || jsonb_build_object('signatures', executive.signature_of('publication', v.publication_id, v.version)) ORDER BY v.version), '[]'::jsonb)
                   FROM executive.publication_versions v WHERE v.publication_id = p_publication),
    'deliveries', (SELECT coalesce(jsonb_agg(to_jsonb(d) - 'scope' - 'tenant_id' - 'domain_id' ORDER BY d.version, d.delivered_at, d.delivery_id), '[]'::jsonb)
                     FROM executive.publication_deliveries d WHERE d.publication_id = p_publication),
    'external_drafts', (SELECT coalesce(jsonb_agg((to_jsonb(x) - 'scope' - 'tenant_id' - 'domain_id') || jsonb_build_object('signatures', executive.signature_of('publication', x.draft_id, 1)) ORDER BY x.version), '[]'::jsonb)
                          FROM executive.external_drafts x WHERE x.publication_id = p_publication),
    'events', (SELECT coalesce(jsonb_agg(to_jsonb(e) - 'scope' - 'tenant_id' - 'domain_id' ORDER BY e.occurred_at, e.event_id), '[]'::jsonb)
                 FROM executive.publication_events e WHERE e.publication_id = p_publication),
    'controls', executive.publication_controls(p_publication),
    'read_at', clock_timestamp());
$$ LANGUAGE sql;
GRANT EXECUTE ON FUNCTION executive.publication_archive_record(uuid) TO eye_app, eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════
-- §D.4 THE PORTS
-- ═══════════════════════════════════════════════════════════════════════════════════
/* d1 DRAFT: the service rendered the bytes and wrote them under the export root; the port binds the publication to its source (the digest
   presented must be the snapshot's — a stale one refused), its audience, classification, channels, format, accessibility and template. */
CREATE OR REPLACE FUNCTION executive.draft_publication(
  p_publication_id uuid, p_tenant uuid, p_domain uuid, p_title text, p_source_kind text, p_source_id uuid, p_source_version int, p_source_digest text,
  p_audience jsonb, p_classification text, p_channels text[], p_format text, p_accessibility jsonb, p_template text, p_external jsonb,
  p_bytes_digest text, p_byte_length int, p_vault_ref text, p_render_method text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, objects, observation, decision, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s jsonb; v_rcpt jsonb; v_draft uuid; r text; v_ev uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.publication.draft']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'publication rejected (actor): drafted by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 4 AND 300 THEN RAISE EXCEPTION 'publication rejected (title): a title is 4 to 300 characters' USING ERRCODE = '22023'; END IF;
  IF p_format = 'pdf-a' THEN RAISE EXCEPTION 'publication rejected (format): pdf-a is not renderable in this codebase today (html, md and json are); the format is declared unsupported, not rendered silently' USING ERRCODE = '22023'; END IF;
  IF p_format NOT IN ('html', 'md', 'json') THEN RAISE EXCEPTION 'publication rejected (format): the format is html, md or json' USING ERRCODE = '22023'; END IF;
  IF p_channels IS NULL OR NOT ('in_app' = ANY (p_channels)) OR NOT (p_channels <@ ARRAY['in_app', 'email', 'teams']) THEN
    RAISE EXCEPTION 'publication rejected (channel): the channels are in_app (always) and, SYNTHETIC to local sinks, email and teams' USING ERRCODE = '22023';
  END IF;
  IF p_classification IS NULL OR p_classification NOT IN ('public', 'internal', 'confidential', 'restricted') THEN RAISE EXCEPTION 'publication rejected (classification): the classification is public, internal, confidential or restricted' USING ERRCODE = '22023'; END IF;
  IF p_accessibility IS NULL OR jsonb_typeof(p_accessibility -> 'plain_language') <> 'boolean' OR jsonb_typeof(p_accessibility -> 'alt_text_present') <> 'boolean' THEN
    RAISE EXCEPTION 'publication rejected (accessibility): the accessibility declaration states plain_language and alt_text_present (booleans)' USING ERRCODE = '22023';
  END IF;
  IF p_template IS NULL OR p_template !~ '^[a-z0-9-]+@[0-9]+$' THEN RAISE EXCEPTION 'publication rejected (template): a template is named <name>@<n>' USING ERRCODE = '22023'; END IF;
  IF p_audience IS NULL OR jsonb_typeof(p_audience) <> 'object' OR jsonb_typeof(coalesce(p_audience -> 'roles', '[]'::jsonb)) <> 'array' OR jsonb_typeof(coalesce(p_audience -> 'recipients', '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'publication rejected (audience): the audience names roles (an array) and recipients (an array of principal ids)' USING ERRCODE = '22023';
  END IF;
  FOR r IN SELECT jsonb_array_elements_text(coalesce(p_audience -> 'roles', '[]'::jsonb)) LOOP
    IF NOT EXISTS (SELECT 1 FROM identity.roles x WHERE x.code = r) THEN RAISE EXCEPTION 'publication rejected (unknown_role): % is not a role', r USING ERRCODE = '23503'; END IF;
  END LOOP;
  FOR r IN SELECT jsonb_array_elements_text(coalesce(p_audience -> 'recipients', '[]'::jsonb)) LOOP
    IF r !~ '^[0-9a-f-]{36}$' OR NOT EXISTS (SELECT 1 FROM identity.principals x WHERE x.id = r::uuid AND x.kind = 'human' AND x.status = 'active' AND (x.tenant_id = p_tenant OR x.scope = 'PLATFORM')) THEN
      RAISE EXCEPTION 'publication rejected (unknown_recipient): % is not an active human principal of this tenant', r USING ERRCODE = '23503';
    END IF;
  END LOOP;
  v_rcpt := executive.publication_recipients(p_tenant, p_domain, p_audience);
  IF jsonb_array_length(v_rcpt) = 0 AND p_external IS NULL THEN RAISE EXCEPTION 'publication rejected (audience): the audience resolves to nobody (no named recipient, no holder of the roles)' USING ERRCODE = '22023'; END IF;
  s := executive.publication_source(p_tenant, p_domain, p_source_kind, p_source_id, p_source_version);
  IF NOT (s ->> 'found')::boolean THEN RAISE EXCEPTION 'publication rejected (unknown_source): %', s ->> 'reason' USING ERRCODE = '23503'; END IF;
  IF (s ->> 'digest') IS DISTINCT FROM p_source_digest THEN
    RAISE EXCEPTION 'publication rejected (stale_source): the snapshot presented (%) is not the recorded % (%); the publication binds the edition as recorded', left(p_source_digest, 16), s ->> 'object_type', left(s ->> 'digest', 16) USING ERRCODE = '22023';
  END IF;
  IF (s ->> 'lifecycle_state') IN ('withdrawn', 'superseded', 'corrected') THEN
    RAISE EXCEPTION 'publication rejected (source_state): the source % is %; a publication binds a live snapshot', s ->> 'object_type', s ->> 'lifecycle_state' USING ERRCODE = '22023';
  END IF;
  -- the classification is AT LEAST as restrictive as the source's: a wider (less restrictive) audience of a classified source is refused
  IF decision.classification_rank(p_classification) < decision.classification_rank(s #>> '{controls,classification}') THEN
    RAISE EXCEPTION 'publication rejected (classification): the source is classified %; a publication classified % would widen it', s #>> '{controls,classification}', p_classification USING ERRCODE = '22023';
  END IF;
  IF p_external IS NOT NULL THEN
    IF jsonb_typeof(p_external) <> 'object' OR coalesce(p_external ->> 'kind', '') NOT IN ('partner', 'regulator', 'press', 'other') OR length(btrim(coalesce(p_external ->> 'name', ''))) NOT BETWEEN 2 AND 200 THEN
      RAISE EXCEPTION 'publication rejected (external): an external audience names its kind (partner, regulator, press, other) and its name' USING ERRCODE = '22023';
    END IF;
    IF decision.classification_rank(p_classification) > decision.classification_rank('internal') THEN
      RAISE EXCEPTION 'publication rejected (external_classification): an external communication is at most internal (internal-external-approved); this one is %', p_classification USING ERRCODE = '22023';
    END IF;
  END IF;
  IF p_bytes_digest IS NULL OR p_bytes_digest !~ '^[0-9a-f]{64}$' OR coalesce(p_byte_length, 0) <= 0 OR p_vault_ref IS NULL OR p_vault_ref !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.bin$' OR split_part(p_vault_ref, '/', 1) <> p_publication_id::text THEN
    RAISE EXCEPTION 'publication rejected (bytes): the rendered bytes are named by their sha256, their length and their vault reference under the publication''s own export directory' USING ERRCODE = '22023';
  END IF;
  INSERT INTO executive.publications (publication_id, scope, tenant_id, domain_id, title, audience, classification, channels, format, accessibility, template, external, drafted_by, current_version, state, correlation_id)
  VALUES (p_publication_id, 'DOMAIN', p_tenant, p_domain, btrim(p_title), p_audience, p_classification, p_channels, p_format, p_accessibility, p_template, p_external, p_actor, 1, 'drafted', p_correlation);
  INSERT INTO executive.publication_versions (publication_id, version, scope, tenant_id, domain_id, source_kind, source_id, source_version, source_digest, format, bytes_digest, byte_length, vault_ref, render_method, state, drafted_by, correlation_id)
  VALUES (p_publication_id, 1, 'DOMAIN', p_tenant, p_domain, p_source_kind, p_source_id, p_source_version, p_source_digest, p_format, p_bytes_digest, p_byte_length, p_vault_ref, p_render_method, 'drafted', p_actor, p_correlation);
  v_ev := executive.publication_event(gen_random_uuid(), p_publication_id, 1, p_tenant, p_domain, 'publication.drafted', p_actor,
            jsonb_build_object('source', s - 'holds' - 'source_object_ids' - 'evidence_refs', 'bytes_digest', p_bytes_digest, 'byte_length', p_byte_length, 'format', p_format, 'classification', p_classification, 'channels', to_jsonb(p_channels), 'recipients', jsonb_array_length(v_rcpt), 'external', p_external), p_correlation);
  IF p_external IS NOT NULL THEN
    v_draft := gen_random_uuid();
    INSERT INTO executive.external_drafts (draft_id, scope, tenant_id, domain_id, publication_id, version, audience_kind, audience_name, drafted_by, gate_state, correlation_id)
    VALUES (v_draft, 'DOMAIN', p_tenant, p_domain, p_publication_id, 1, p_external ->> 'kind', btrim(p_external ->> 'name'), p_actor, 'review_requested', p_correlation);
    PERFORM executive.publication_event(gen_random_uuid(), p_publication_id, 1, p_tenant, p_domain, 'external_draft.review_requested', p_actor, jsonb_build_object('draft_id', v_draft, 'audience', p_external), p_correlation);
  END IF;
  RETURN jsonb_build_object('publication_id', p_publication_id, 'version', 1, 'state', 'drafted', 'title', btrim(p_title), 'source', s - 'holds' - 'source_object_ids' - 'evidence_refs', 'bytes_digest', p_bytes_digest, 'byte_length', p_byte_length,
                            'vault_ref', p_vault_ref, 'classification', p_classification, 'channels', to_jsonb(p_channels), 'recipients', v_rcpt, 'external_draft_id', v_draft, 'event_id', v_ev);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.draft_publication(uuid,uuid,uuid,text,text,uuid,int,text,jsonb,text,text[],text,jsonb,text,jsonb,text,int,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.draft_publication(uuid,uuid,uuid,text,text,uuid,int,text,jsonb,text,text[],text,jsonb,text,jsonb,text,int,text,text,uuid,uuid) TO eye_commit;

/* d2 APPROVE-DIGEST: an executive or decision authority, never the drafter, confirms the bytes' digest byte-for-byte; the service recorded the
   §0 signature (kind publication over that digest, by this actor, under this action) and admitted the PUB version in the same write BEFORE
   this call — both are checked here and bound to the version. A refusal rolls the whole write back, the signature and the object with it. */
CREATE OR REPLACE FUNCTION executive.approve_publication(
  p_publication_id uuid, p_tenant uuid, p_domain uuid, p_version int, p_digest text, p_signature_id uuid, p_object_version bigint, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, objects, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p executive.publications%ROWTYPE; v executive.publication_versions%ROWTYPE; x executive.external_drafts%ROWTYPE; v_ev uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.publication.approve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'publication rejected (actor): approved by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO p FROM executive.publications q WHERE q.publication_id = p_publication_id AND q.tenant_id = p_tenant AND q.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'publication rejected (unknown_publication): no publication % in this domain', p_publication_id USING ERRCODE = '23503'; END IF;
  SELECT * INTO v FROM executive.publication_versions q WHERE q.publication_id = p_publication_id AND q.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'publication rejected (unknown_version): publication % has no version %', p_publication_id, p_version USING ERRCODE = '23503'; END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['executive', 'decision_authority']) THEN
    RAISE EXCEPTION 'publication rejected (authority): a publication is approved by a human holding executive or decision_authority in this domain' USING ERRCODE = '42501';
  END IF;
  IF p_actor = v.drafted_by THEN RAISE EXCEPTION 'publication rejected (separation): the drafter of version % does not approve it', p_version USING ERRCODE = '42501'; END IF;
  IF p.state IN ('withdrawn', 'archived') THEN RAISE EXCEPTION 'publication rejected (state): publication % is %', p_publication_id, p.state USING ERRCODE = '22023'; END IF;
  IF v.state <> 'drafted' THEN RAISE EXCEPTION 'publication rejected (state): version % is %, not drafted; an approved version is immutable', p_version, v.state USING ERRCODE = '22023'; END IF;
  IF p_digest IS DISTINCT FROM v.bytes_digest THEN
    RAISE EXCEPTION 'publication rejected (stale_digest): the digest confirmed (%) is not the bytes'' (%); the approval binds the exact bytes', left(coalesce(p_digest, '<none>'), 16), left(v.bytes_digest, 16) USING ERRCODE = '22023';
  END IF;
  IF p.external IS NOT NULL THEN
    SELECT * INTO x FROM executive.external_drafts d WHERE d.publication_id = p_publication_id AND d.version = p_version;
    IF NOT FOUND OR x.gate_state <> 'approved' THEN
      RAISE EXCEPTION 'publication rejected (external_review): the external communication draft is % — an external publication is approved only after its review is approved', coalesce(x.gate_state, 'missing') USING ERRCODE = '22023';
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM executive.signatures s WHERE s.signature_id = p_signature_id AND s.subject_kind = 'publication' AND s.subject_id = p_publication_id AND s.subject_version = p_version AND s.subject_digest = v.bytes_digest AND s.signer = p_actor AND s.bound_action = 'executive.publication.approve') THEN
    RAISE EXCEPTION 'publication rejected (signature): the approval carries the approver''s signature over the bytes'' digest, recorded in this write' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = p_publication_id AND o.object_type = 'PUB' AND o.object_version = p_object_version AND o.lifecycle_state = 'active' AND o.payload ->> 'version' = p_version::text AND o.payload #>> '{bytes,sha256}' = v.bytes_digest) THEN
    RAISE EXCEPTION 'publication rejected (object): the canonical PUB version % carrying these bytes'' digest is admitted in this write', p_object_version USING ERRCODE = '22023';
  END IF;
  UPDATE executive.publication_versions SET state = 'approved', approved_by = p_actor, approved_at = clock_timestamp(), approval_digest = p_digest, signature_id = p_signature_id, pub_object_version = p_object_version
   WHERE publication_id = p_publication_id AND version = p_version;
  IF p.current_version = p_version THEN UPDATE executive.publications SET state = 'approved', updated_at = clock_timestamp() WHERE publication_id = p_publication_id; END IF;
  v_ev := executive.publication_event(gen_random_uuid(), p_publication_id, p_version, p_tenant, p_domain, 'publication.approved', p_actor,
            jsonb_build_object('digest', p_digest, 'signature_id', p_signature_id, 'pub_object_version', p_object_version, 'external_draft', CASE WHEN x.draft_id IS NULL THEN NULL ELSE jsonb_build_object('draft_id', x.draft_id, 'reviewed_by', x.reviewed_by) END), p_correlation);
  RETURN jsonb_build_object('publication_id', p_publication_id, 'version', p_version, 'state', 'approved', 'approved_by', p_actor, 'approval_digest', p_digest, 'signature_id', p_signature_id, 'pub_object_version', p_object_version, 'event_id', v_ev);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.approve_publication(uuid,uuid,uuid,int,text,uuid,bigint,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.approve_publication(uuid,uuid,uuid,int,text,uuid,bigint,uuid,uuid) TO eye_commit;

/* d2 DELIVER: an approved version to its recipients — the in_app placement recorded here for each (the publication stands in the
   recipient's list: the receipt), the synthetic channels handed back to the service, which records each adapter's answer. A version that
   is not approved is refused (state); an external publication whose review is not approved is refused (external_review). */
CREATE OR REPLACE FUNCTION executive.deliver_publication(p_publication_id uuid, p_tenant uuid, p_domain uuid, p_version int, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p executive.publications%ROWTYPE; v executive.publication_versions%ROWTYPE; v_rcpt jsonb; r jsonb; v_id uuid; v_placed jsonb := '[]'::jsonb; v_ev uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.publication.deliver']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'publication rejected (actor): delivered by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO p FROM executive.publications q WHERE q.publication_id = p_publication_id AND q.tenant_id = p_tenant AND q.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'publication rejected (unknown_publication): no publication % in this domain', p_publication_id USING ERRCODE = '23503'; END IF;
  SELECT * INTO v FROM executive.publication_versions q WHERE q.publication_id = p_publication_id AND q.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'publication rejected (unknown_version): publication % has no version %', p_publication_id, p_version USING ERRCODE = '23503'; END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['executive', 'executive_operator', 'decision_authority']) THEN
    RAISE EXCEPTION 'publication rejected (authority): a publication is delivered by a human holding executive, executive_operator or decision_authority in this domain' USING ERRCODE = '42501';
  END IF;
  IF p.state IN ('withdrawn', 'archived') THEN RAISE EXCEPTION 'publication rejected (state): publication % is %', p_publication_id, p.state USING ERRCODE = '22023'; END IF;
  IF v.state NOT IN ('approved', 'delivered') THEN RAISE EXCEPTION 'publication rejected (state): version % is %; only an approved version is delivered', p_version, v.state USING ERRCODE = '22023'; END IF;
  IF p.external IS NOT NULL AND NOT EXISTS (SELECT 1 FROM executive.external_drafts d WHERE d.publication_id = p_publication_id AND d.version = p_version AND d.gate_state = 'approved') THEN
    RAISE EXCEPTION 'publication rejected (external_review): an external communication is delivered only after its review is approved' USING ERRCODE = '22023';
  END IF;
  v_rcpt := executive.publication_recipients(p_tenant, p_domain, p.audience);
  IF jsonb_array_length(v_rcpt) = 0 AND p.external IS NULL THEN RAISE EXCEPTION 'publication rejected (audience): the audience resolves to nobody now' USING ERRCODE = '22023'; END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(v_rcpt) LOOP
    IF EXISTS (SELECT 1 FROM executive.publication_deliveries d WHERE d.publication_id = p_publication_id AND d.version = p_version AND d.recipient_principal_id = (r ->> 'principal_id')::uuid AND d.channel = 'in_app' AND d.kind = 'publication') THEN CONTINUE; END IF;
    v_id := gen_random_uuid();
    INSERT INTO executive.publication_deliveries (delivery_id, scope, tenant_id, domain_id, publication_id, version, recipient_principal_id, channel, kind, state, receipt_id, receipt, provider_ref, synthetic_state, delivered_by, correlation_id)
    VALUES (v_id, 'DOMAIN', p_tenant, p_domain, p_publication_id, p_version, (r ->> 'principal_id')::uuid, 'in_app', 'publication', 'delivered', gen_random_uuid(),
            jsonb_build_object('channel', 'in_app', 'proof', 'the publication stands in the recipient''s in-app list (executive.publication_deliveries, readable under the recipient''s own RLS)', 'via', r ->> 'via', 'bytes_digest', v.bytes_digest),
            'in_app:' || p_publication_id::text || '@' || p_version, false, p_actor, p_correlation);
    v_placed := v_placed || jsonb_build_object('delivery_id', v_id, 'recipient', r ->> 'principal_id', 'display_name', r ->> 'display_name', 'via', r ->> 'via');
  END LOOP;
  UPDATE executive.publication_versions SET state = 'delivered' WHERE publication_id = p_publication_id AND version = p_version AND state = 'approved';
  IF p.current_version = p_version THEN UPDATE executive.publications SET state = 'delivered', updated_at = clock_timestamp() WHERE publication_id = p_publication_id; END IF;
  v_ev := executive.publication_event(gen_random_uuid(), p_publication_id, p_version, p_tenant, p_domain, 'publication.delivered', p_actor,
            jsonb_build_object('recipients', jsonb_array_length(v_rcpt), 'in_app_placed', jsonb_array_length(v_placed), 'channels', to_jsonb(p.channels), 'external', p.external), p_correlation);
  RETURN jsonb_build_object('publication_id', p_publication_id, 'version', p_version, 'state', 'delivered', 'recipients', v_rcpt, 'in_app', v_placed, 'channels', to_jsonb(p.channels),
                            'external', p.external, 'title', p.title, 'bytes_digest', v.bytes_digest, 'format', v.format, 'event_id', v_ev);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.deliver_publication(uuid,uuid,uuid,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.deliver_publication(uuid,uuid,uuid,int,uuid,uuid) TO eye_commit;

/* The per-recipient record of a synthetic channel's answer (email / teams to the local sinks — the B34 adapters), for the publication, a
   correction notice or a withdrawal notice; under the delivering, correcting or withdrawing action. Idempotent on the (version, recipient,
   channel, kind) key: a repeated attempt answers the row it made. */
CREATE OR REPLACE FUNCTION executive.record_publication_delivery(
  p_delivery_id uuid, p_tenant uuid, p_domain uuid, p_publication_id uuid, p_version int, p_recipient uuid, p_channel text, p_kind text, p_state text,
  p_receipt jsonb, p_provider_ref text, p_error text, p_synthetic boolean, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE d executive.publication_deliveries%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.publication.deliver', 'executive.publication.correct', 'executive.publication.withdraw']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'publication rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_channel NOT IN ('email', 'teams') THEN RAISE EXCEPTION 'publication rejected (channel): the adapters record email and teams; in_app is placed by the delivery port' USING ERRCODE = '22023'; END IF;
  IF p_kind NOT IN ('publication', 'correction_notice', 'withdrawal_notice') OR p_state NOT IN ('delivered', 'failed') THEN RAISE EXCEPTION 'publication rejected (delivery): a delivery is of the publication, a correction notice or a withdrawal notice, delivered or failed' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM executive.publication_versions v WHERE v.publication_id = p_publication_id AND v.version = p_version AND v.tenant_id = p_tenant AND v.domain_id = p_domain) THEN
    RAISE EXCEPTION 'publication rejected (unknown_version): publication % has no version %', p_publication_id, p_version USING ERRCODE = '23503';
  END IF;
  SELECT * INTO d FROM executive.publication_deliveries x WHERE x.publication_id = p_publication_id AND x.version = p_version AND x.recipient_principal_id = p_recipient AND x.channel = p_channel AND x.kind = p_kind;
  IF FOUND THEN RETURN jsonb_build_object('delivery_id', d.delivery_id, 'repeated', true, 'state', d.state, 'receipt_id', d.receipt_id); END IF;
  INSERT INTO executive.publication_deliveries (delivery_id, scope, tenant_id, domain_id, publication_id, version, recipient_principal_id, channel, kind, state, receipt_id, receipt, provider_ref, error, synthetic_state, delivered_by, correlation_id)
  VALUES (p_delivery_id, 'DOMAIN', p_tenant, p_domain, p_publication_id, p_version, p_recipient, p_channel, p_kind, p_state, gen_random_uuid(), CASE WHEN p_state = 'delivered' THEN coalesce(p_receipt, '{}'::jsonb) END, p_provider_ref, CASE WHEN p_state = 'failed' THEN coalesce(p_error, 'failed') END, p_synthetic, p_actor, p_correlation);
  PERFORM executive.publication_event(gen_random_uuid(), p_publication_id, p_version, p_tenant, p_domain, CASE WHEN p_state = 'delivered' THEN 'publication.delivered' ELSE 'publication.delivery_failed' END, p_actor,
            jsonb_build_object('delivery_id', p_delivery_id, 'recipient', p_recipient, 'channel', p_channel, 'kind', p_kind, 'provider_ref', p_provider_ref, 'error', p_error, 'synthetic', p_synthetic), p_correlation);
  RETURN jsonb_build_object('delivery_id', p_delivery_id, 'repeated', false, 'state', p_state, 'receipt_id', (SELECT receipt_id FROM executive.publication_deliveries WHERE delivery_id = p_delivery_id));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.record_publication_delivery(uuid,uuid,uuid,uuid,int,uuid,text,text,text,jsonb,text,text,boolean,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.record_publication_delivery(uuid,uuid,uuid,uuid,int,uuid,text,text,text,jsonb,text,text,boolean,uuid,uuid) TO eye_commit;

/* d2 ACKNOWLEDGE: the recipient's own act on a delivery — receipt, not agreement; once. */
CREATE OR REPLACE FUNCTION executive.acknowledge_publication(p_delivery_id uuid, p_tenant uuid, p_domain uuid, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE d executive.publication_deliveries%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.publication.acknowledge']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'publication rejected (actor): acknowledged by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO d FROM executive.publication_deliveries x WHERE x.delivery_id = p_delivery_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'publication rejected (unknown_delivery): no delivery % in this domain', p_delivery_id USING ERRCODE = '23503'; END IF;
  IF d.recipient_principal_id <> p_actor THEN RAISE EXCEPTION 'publication rejected (not_recipient): a delivery is acknowledged by its recipient' USING ERRCODE = '42501'; END IF;
  IF d.state <> 'delivered' THEN RAISE EXCEPTION 'publication rejected (state): delivery % failed; nothing reached the recipient to acknowledge', p_delivery_id USING ERRCODE = '22023'; END IF;
  IF d.acknowledged_at IS NOT NULL THEN RAISE EXCEPTION 'publication rejected (state): delivery % was acknowledged at %', p_delivery_id, d.acknowledged_at USING ERRCODE = '22023'; END IF;
  UPDATE executive.publication_deliveries SET acknowledged_by = p_actor, acknowledged_at = clock_timestamp(), acknowledgement_note = NULLIF(btrim(coalesce(p_note, '')), '') WHERE delivery_id = p_delivery_id;
  PERFORM executive.publication_event(gen_random_uuid(), d.publication_id, d.version, p_tenant, p_domain, 'publication.acknowledged', p_actor, jsonb_build_object('delivery_id', p_delivery_id, 'channel', d.channel, 'kind', d.kind), p_correlation);
  RETURN jsonb_build_object('delivery_id', p_delivery_id, 'publication_id', d.publication_id, 'version', d.version, 'acknowledged_by', p_actor, 'acknowledged_at', clock_timestamp(),
                            'note', 'a receipt is the channel''s machine proof of placement; an acknowledgement is the person''s act (receipt, not agreement)');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.acknowledge_publication(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.acknowledge_publication(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

/* The recipients of a version's deliveries (the publication itself), notified of a correction or a withdrawal: an attention item of class
   publication.correction per recipient (owned by the recipient, routed to nobody else, due in seven days), its cause the per-recipient
   ledger event; the channel notice is the service's (record_publication_delivery, kind *_notice). */
CREATE OR REPLACE FUNCTION executive.notify_publication_recipients(p_publication_id uuid, p_tenant uuid, p_domain uuid, p_version int, p_kind text, p_title text, p_details jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
SET search_path = executive, identity, pg_catalog, pg_temp AS $$
DECLARE r record; v_ev uuid; v_item uuid; v_out jsonb := '[]'::jsonb; v_ttl text;
BEGIN
  FOR r IN SELECT DISTINCT d.recipient_principal_id FROM executive.publication_deliveries d WHERE d.publication_id = p_publication_id AND d.version = p_version AND d.kind = 'publication' AND d.state = 'delivered' ORDER BY 1 LOOP
    v_ev := executive.publication_event(gen_random_uuid(), p_publication_id, p_version, p_tenant, p_domain, CASE p_kind WHEN 'correction' THEN 'publication.correction_notified' ELSE 'publication.withdrawal_notified' END, p_actor, p_details || jsonb_build_object('recipient', r.recipient_principal_id), p_correlation);
    v_item := gen_random_uuid();
    v_ttl := left(CASE p_kind WHEN 'correction' THEN 'Correction of a publication you received: ' ELSE 'Withdrawal of a publication you received: ' END || p_title, 512);
    INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state, owner_principal_id, route_roles, evaluation, details, due_at, escalations, correlation_id)
    VALUES (v_item, 'DOMAIN', p_tenant, p_domain, 'publication.correction', 'publication', p_publication_id, v_ev, CASE p_kind WHEN 'correction' THEN 'publication.corrected' ELSE 'publication.withdrawn' END, v_ttl, 'material', 'open',
            r.recipient_principal_id, '{}', jsonb_build_object('outcome', 'material', 'reasons', jsonb_build_array('a publication delivered to this recipient was ' || CASE p_kind WHEN 'correction' THEN 'corrected' ELSE 'withdrawn' END || ' (B36 §D d3): the recipient reads the change, never the stale version'), 'policy_version', NULL),
            p_details || jsonb_build_object('kind', p_kind, 'publication_id', p_publication_id, 'version', p_version), clock_timestamp() + interval '7 days', 0, p_correlation);
    PERFORM executive.attention_event(v_item, p_tenant, p_domain, 'item.routed', p_actor, jsonb_build_object('outcome', 'material', 'reasons', jsonb_build_array('publication ' || p_kind), 'policy_version', NULL, 'owner', r.recipient_principal_id, 'route_roles', '[]'::jsonb, 'due_at', clock_timestamp() + interval '7 days', 'cause_event_id', v_ev, 'cause_event_type', CASE p_kind WHEN 'correction' THEN 'publication.corrected' ELSE 'publication.withdrawn' END, 'unrouted', false), p_correlation);
    v_out := v_out || jsonb_build_object('recipient', r.recipient_principal_id, 'item_id', v_item, 'event_id', v_ev);
  END LOOP;
  RETURN v_out;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.notify_publication_recipients(uuid,uuid,uuid,int,text,text,jsonb,uuid,uuid) FROM PUBLIC;

/* d3 CORRECT: the next version, bound to a new snapshot and new bytes (the service rendered and wrote them), the reason, what changed by
   digest; the prior version reads corrected_by_version; every recipient of the prior version notified. The new version is drafted: it is
   approved by digest and delivered like the first. A withdrawn or archived publication is not corrected. */
CREATE OR REPLACE FUNCTION executive.correct_publication(
  p_publication_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_source_version int, p_source_digest text, p_bytes_digest text, p_byte_length int, p_vault_ref text, p_render_method text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, objects, observation, decision, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p executive.publications%ROWTYPE; v executive.publication_versions%ROWTYPE; s jsonb; v_next int; v_changed jsonb; v_ev uuid; v_notified jsonb; v_draft uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.publication.correct']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'publication rejected (actor): corrected by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO p FROM executive.publications q WHERE q.publication_id = p_publication_id AND q.tenant_id = p_tenant AND q.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'publication rejected (unknown_publication): no publication % in this domain', p_publication_id USING ERRCODE = '23503'; END IF;
  IF NOT (p_actor = p.drafted_by OR executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['executive', 'executive_operator'])) THEN
    RAISE EXCEPTION 'publication rejected (authority): a publication is corrected by its drafter or a human holding executive or executive_operator' USING ERRCODE = '42501';
  END IF;
  IF p.state = 'withdrawn' THEN RAISE EXCEPTION 'publication rejected (withdrawn): publication % was withdrawn at % (%); a withdrawn publication is not corrected — draft a new one', p_publication_id, p.withdrawn_at, p.withdrawal_reason USING ERRCODE = '22023'; END IF;
  IF p.state = 'archived' THEN RAISE EXCEPTION 'publication rejected (archived): publication % is archived', p_publication_id USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'publication rejected (reason): a correction names its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v FROM executive.publication_versions q WHERE q.publication_id = p_publication_id AND q.version = p.current_version FOR UPDATE;
  IF v.state NOT IN ('approved', 'delivered') THEN RAISE EXCEPTION 'publication rejected (state): version % is %; a correction follows an approved or delivered version (approve or withdraw the draft first)', v.version, v.state USING ERRCODE = '22023'; END IF;
  s := executive.publication_source(p_tenant, p_domain, v.source_kind, v.source_id, p_source_version);
  IF NOT (s ->> 'found')::boolean THEN RAISE EXCEPTION 'publication rejected (unknown_source): %', s ->> 'reason' USING ERRCODE = '23503'; END IF;
  IF (s ->> 'digest') IS DISTINCT FROM p_source_digest THEN RAISE EXCEPTION 'publication rejected (stale_source): the snapshot presented (%) is not the recorded % (%)', left(p_source_digest, 16), s ->> 'object_type', left(s ->> 'digest', 16) USING ERRCODE = '22023'; END IF;
  IF decision.classification_rank(p.classification) < decision.classification_rank(s #>> '{controls,classification}') THEN
    RAISE EXCEPTION 'publication rejected (classification): the corrected snapshot is classified %; the publication is %', s #>> '{controls,classification}', p.classification USING ERRCODE = '22023';
  END IF;
  IF p_bytes_digest IS NULL OR p_bytes_digest !~ '^[0-9a-f]{64}$' OR coalesce(p_byte_length, 0) <= 0 OR p_vault_ref IS NULL OR p_vault_ref !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.bin$' OR split_part(p_vault_ref, '/', 1) <> p_publication_id::text THEN
    RAISE EXCEPTION 'publication rejected (bytes): the rendered bytes are named by their sha256, their length and their vault reference under the publication''s own export directory' USING ERRCODE = '22023';
  END IF;
  IF p_bytes_digest = v.bytes_digest AND p_source_digest = v.source_digest THEN RAISE EXCEPTION 'publication rejected (unchanged): the correction binds the same snapshot and the same bytes as version %; nothing changed', v.version USING ERRCODE = '22023'; END IF;
  v_next := v.version + 1;
  v_changed := jsonb_build_object('prior_version', v.version, 'prior_bytes_digest', v.bytes_digest, 'bytes_digest', p_bytes_digest, 'prior_source_digest', v.source_digest, 'source_digest', p_source_digest,
                                  'prior_source_version', v.source_version, 'source_version', p_source_version, 'bytes_changed', p_bytes_digest <> v.bytes_digest, 'snapshot_changed', p_source_digest <> v.source_digest, 'reason', btrim(p_reason));
  INSERT INTO executive.publication_versions (publication_id, version, scope, tenant_id, domain_id, source_kind, source_id, source_version, source_digest, format, bytes_digest, byte_length, vault_ref, render_method, state, drafted_by, correction_of, correction_reason, changed, correlation_id)
  VALUES (p_publication_id, v_next, 'DOMAIN', p_tenant, p_domain, v.source_kind, v.source_id, p_source_version, p_source_digest, p.format, p_bytes_digest, p_byte_length, p_vault_ref, p_render_method, 'drafted', p_actor, v.version, btrim(p_reason), v_changed, p_correlation);
  UPDATE executive.publication_versions SET state = 'corrected', corrected_by_version = v_next WHERE publication_id = p_publication_id AND version = v.version;
  UPDATE executive.publications SET state = 'corrected', current_version = v_next, updated_at = clock_timestamp() WHERE publication_id = p_publication_id;
  v_ev := executive.publication_event(gen_random_uuid(), p_publication_id, v_next, p_tenant, p_domain, 'publication.corrected', p_actor, v_changed, p_correlation);
  v_notified := executive.notify_publication_recipients(p_publication_id, p_tenant, p_domain, v.version, 'correction', p.title, jsonb_build_object('corrected_version', v_next, 'reason', btrim(p_reason), 'changed', v_changed), p_actor, p_correlation);
  IF p.external IS NOT NULL THEN
    v_draft := gen_random_uuid();
    INSERT INTO executive.external_drafts (draft_id, scope, tenant_id, domain_id, publication_id, version, audience_kind, audience_name, drafted_by, gate_state, correlation_id)
    VALUES (v_draft, 'DOMAIN', p_tenant, p_domain, p_publication_id, v_next, p.external ->> 'kind', btrim(p.external ->> 'name'), p_actor, 'review_requested', p_correlation);
    PERFORM executive.publication_event(gen_random_uuid(), p_publication_id, v_next, p_tenant, p_domain, 'external_draft.review_requested', p_actor, jsonb_build_object('draft_id', v_draft, 'audience', p.external, 'correction_of', v.version), p_correlation);
  END IF;
  RETURN jsonb_build_object('publication_id', p_publication_id, 'version', v_next, 'state', 'drafted', 'correction_of', v.version, 'changed', v_changed, 'notified', v_notified, 'title', p.title, 'channels', to_jsonb(p.channels),
                            'external_draft_id', v_draft, 'event_id', v_ev);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.correct_publication(uuid,uuid,uuid,text,int,text,text,int,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.correct_publication(uuid,uuid,uuid,text,int,text,text,int,text,text,uuid,uuid) TO eye_commit;

/* d3 WITHDRAW: a reason; the recipients of the current version notified the same way; the bytes retained (nothing is removed from the vault);
   the read says withdrawn; the PUB's withdrawn version (0078's lifecycle idiom: lifecycle and truth state withdrawn, the reason in the header)
   admitted by the service BEFORE this call when a PUB exists (a publication withdrawn before approval has none) — checked and bound here. */
CREATE OR REPLACE FUNCTION executive.withdraw_publication(p_publication_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_object_version bigint, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, objects, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p executive.publications%ROWTYPE; v executive.publication_versions%ROWTYPE; v_ev uuid; v_notified jsonb; v_has_pub boolean;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.publication.withdraw']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'publication rejected (actor): withdrawn by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO p FROM executive.publications q WHERE q.publication_id = p_publication_id AND q.tenant_id = p_tenant AND q.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'publication rejected (unknown_publication): no publication % in this domain', p_publication_id USING ERRCODE = '23503'; END IF;
  IF NOT (p_actor = p.drafted_by OR executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['executive', 'decision_authority', 'executive_operator'])) THEN
    RAISE EXCEPTION 'publication rejected (authority): a publication is withdrawn by its drafter or a human holding executive, decision_authority or executive_operator' USING ERRCODE = '42501';
  END IF;
  IF p.state = 'withdrawn' THEN RAISE EXCEPTION 'publication rejected (withdrawn): publication % was withdrawn at %', p_publication_id, p.withdrawn_at USING ERRCODE = '22023'; END IF;
  IF p.state = 'archived' THEN RAISE EXCEPTION 'publication rejected (archived): publication % is archived', p_publication_id USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'publication rejected (reason): a withdrawal names its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v FROM executive.publication_versions q WHERE q.publication_id = p_publication_id AND q.version = p.current_version FOR UPDATE;
  v_has_pub := EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = p_publication_id AND o.object_type = 'PUB' AND o.lifecycle_state = 'active');
  IF v_has_pub AND NOT EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = p_publication_id AND o.object_type = 'PUB' AND o.object_version = p_object_version AND o.lifecycle_state = 'withdrawn' AND o.withdrawal_reason IS NOT NULL) THEN
    RAISE EXCEPTION 'publication rejected (object): the PUB''s withdrawn version % is admitted in this write (0078''s lifecycle: lifecycle and truth state withdrawn, the reason in the header)', p_object_version USING ERRCODE = '22023';
  END IF;
  IF NOT v_has_pub AND p_object_version IS NOT NULL THEN RAISE EXCEPTION 'publication rejected (object): publication % was never approved; there is no PUB to withdraw', p_publication_id USING ERRCODE = '22023'; END IF;
  UPDATE executive.publication_versions SET state = 'withdrawn' WHERE publication_id = p_publication_id AND version = v.version;
  UPDATE executive.publications SET state = 'withdrawn', withdrawn_by = p_actor, withdrawn_at = clock_timestamp(), withdrawal_reason = btrim(p_reason), updated_at = clock_timestamp() WHERE publication_id = p_publication_id;
  v_ev := executive.publication_event(gen_random_uuid(), p_publication_id, v.version, p_tenant, p_domain, 'publication.withdrawn', p_actor, jsonb_build_object('reason', btrim(p_reason), 'pub_object_version', p_object_version, 'bytes_retained', true, 'vault_ref', v.vault_ref), p_correlation);
  v_notified := executive.notify_publication_recipients(p_publication_id, p_tenant, p_domain, v.version, 'withdrawal', p.title, jsonb_build_object('reason', btrim(p_reason)), p_actor, p_correlation);
  RETURN jsonb_build_object('publication_id', p_publication_id, 'version', v.version, 'state', 'withdrawn', 'reason', btrim(p_reason), 'withdrawn_by', p_actor, 'pub_object_version', p_object_version, 'bytes_retained', true,
                            'notified', v_notified, 'title', p.title, 'channels', to_jsonb(p.channels), 'event_id', v_ev);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.withdraw_publication(uuid,uuid,uuid,text,bigint,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.withdraw_publication(uuid,uuid,uuid,text,bigint,uuid,uuid) TO eye_commit;

/* d4 REVIEW an external communication draft: a human holding `executive`, never the drafter; the digest of the version's bytes confirmed; the
   verdict one of the uniform gate states approved | rejected | information_requested; on approval the service recorded the reviewer's
   signature (kind publication over the draft id, version 1) BEFORE this call — checked and bound here. */
CREATE OR REPLACE FUNCTION executive.review_external_draft(p_draft_id uuid, p_tenant uuid, p_domain uuid, p_verdict text, p_note text, p_digest text, p_signature_id uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x executive.external_drafts%ROWTYPE; v executive.publication_versions%ROWTYPE; p executive.publications%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.external_draft.review']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'external draft rejected (actor): reviewed by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO x FROM executive.external_drafts d WHERE d.draft_id = p_draft_id AND d.tenant_id = p_tenant AND d.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'external draft rejected (unknown_draft): no external draft % in this domain', p_draft_id USING ERRCODE = '23503'; END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['executive']) THEN RAISE EXCEPTION 'external draft rejected (authority): an external communication is reviewed by a human holding executive in this domain' USING ERRCODE = '42501'; END IF;
  IF p_actor = x.drafted_by THEN RAISE EXCEPTION 'external draft rejected (separation): the drafter does not review its own external communication' USING ERRCODE = '42501'; END IF;
  IF x.gate_state NOT IN ('review_requested', 'information_requested') THEN RAISE EXCEPTION 'external draft rejected (state): draft % is %; its review is closed', p_draft_id, x.gate_state USING ERRCODE = '22023'; END IF;
  IF p_verdict NOT IN ('approved', 'rejected', 'information_requested') THEN RAISE EXCEPTION 'external draft rejected (verdict): the verdict is approved, rejected or information_requested (the uniform gate states)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v FROM executive.publication_versions q WHERE q.publication_id = x.publication_id AND q.version = x.version;
  SELECT * INTO p FROM executive.publications q WHERE q.publication_id = x.publication_id;
  IF decision.classification_rank(p.classification) > decision.classification_rank('internal') THEN RAISE EXCEPTION 'external draft rejected (classification): publication % is %; an external communication is at most internal', x.publication_id, p.classification USING ERRCODE = '22023'; END IF;
  IF p_digest IS DISTINCT FROM v.bytes_digest THEN RAISE EXCEPTION 'external draft rejected (stale_digest): the digest confirmed (%) is not the bytes'' (%)', left(coalesce(p_digest, '<none>'), 16), left(v.bytes_digest, 16) USING ERRCODE = '22023'; END IF;
  IF p_verdict = 'approved' AND NOT EXISTS (SELECT 1 FROM executive.signatures s WHERE s.signature_id = p_signature_id AND s.subject_kind = 'publication' AND s.subject_id = p_draft_id AND s.subject_version = 1 AND s.subject_digest = v.bytes_digest AND s.signer = p_actor AND s.bound_action = 'executive.external_draft.review') THEN
    RAISE EXCEPTION 'external draft rejected (signature): an approved review carries the reviewer''s signature over the bytes'' digest, recorded in this write' USING ERRCODE = '22023';
  END IF;
  UPDATE executive.external_drafts SET gate_state = p_verdict, reviewed_by = p_actor, reviewed_at = clock_timestamp(), review_note = NULLIF(btrim(coalesce(p_note, '')), ''), review_digest = p_digest, signature_id = CASE WHEN p_verdict = 'approved' THEN p_signature_id END
   WHERE draft_id = p_draft_id;
  PERFORM executive.publication_event(gen_random_uuid(), x.publication_id, x.version, p_tenant, p_domain, 'external_draft.reviewed', p_actor, jsonb_build_object('draft_id', p_draft_id, 'verdict', p_verdict, 'digest', p_digest, 'signature_id', CASE WHEN p_verdict = 'approved' THEN p_signature_id END, 'note', p_note), p_correlation);
  RETURN jsonb_build_object('draft_id', p_draft_id, 'publication_id', x.publication_id, 'version', x.version, 'gate_state', p_verdict, 'reviewed_by', p_actor, 'review_digest', p_digest, 'signature_id', CASE WHEN p_verdict = 'approved' THEN p_signature_id END, 'audience', jsonb_build_object('kind', x.audience_kind, 'name', x.audience_name));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.review_external_draft(uuid,uuid,uuid,text,text,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.review_external_draft(uuid,uuid,uuid,text,text,text,uuid,uuid,uuid) TO eye_commit;

/* d5 ARCHIVE: a delivered or withdrawn publication carried whole — versions, receipts, signatures, events — under the controls its source
   carries (executive.publication_controls); the service admitted the PUB's archived version (its payload the archive record) BEFORE this
   call — checked and bound here. A legal hold on the source does not stop an archive (it preserves; the hold is recorded on the record). */
CREATE OR REPLACE FUNCTION executive.archive_publication(p_publication_id uuid, p_tenant uuid, p_domain uuid, p_object_version bigint, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, objects, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p executive.publications%ROWTYPE; v_controls jsonb; v_ref jsonb; v_ev uuid; v_has_pub boolean;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.publication.archive']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'publication rejected (actor): archived by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO p FROM executive.publications q WHERE q.publication_id = p_publication_id AND q.tenant_id = p_tenant AND q.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'publication rejected (unknown_publication): no publication % in this domain', p_publication_id USING ERRCODE = '23503'; END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['executive', 'decision_authority', 'executive_operator']) THEN
    RAISE EXCEPTION 'publication rejected (authority): a publication is archived by a human holding executive, decision_authority or executive_operator' USING ERRCODE = '42501';
  END IF;
  IF p.state = 'archived' THEN RAISE EXCEPTION 'publication rejected (archived): publication % is archived', p_publication_id USING ERRCODE = '22023'; END IF;
  IF p.state NOT IN ('delivered', 'withdrawn') THEN RAISE EXCEPTION 'publication rejected (state): publication % is %; a delivered or withdrawn publication is archived', p_publication_id, p.state USING ERRCODE = '22023'; END IF;
  v_controls := executive.publication_controls(p_publication_id);
  v_has_pub := EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = p_publication_id AND o.object_type = 'PUB');
  IF v_has_pub AND NOT EXISTS (SELECT 1 FROM objects.canonical_objects o WHERE o.object_id = p_publication_id AND o.object_type = 'PUB' AND o.object_version = p_object_version AND o.lifecycle_state = 'archived'
                                 AND o.classification = p.classification AND o.residency_profile IS NOT DISTINCT FROM (v_controls #>> '{controls,residency_profile}') AND o.retention_profile IS NOT DISTINCT FROM (v_controls #>> '{controls,retention_profile}') AND o.rights_profile IS NOT DISTINCT FROM (v_controls #>> '{controls,rights_profile}')) THEN
    RAISE EXCEPTION 'publication rejected (object): the PUB''s archived version % carrying the source''s controls (classification %, residency %, retention %, rights %) is admitted in this write', p_object_version, p.classification, coalesce(v_controls #>> '{controls,residency_profile}', 'none'), coalesce(v_controls #>> '{controls,retention_profile}', 'none'), coalesce(v_controls #>> '{controls,rights_profile}', 'none') USING ERRCODE = '22023';
  END IF;
  IF NOT v_has_pub AND p_object_version IS NOT NULL THEN RAISE EXCEPTION 'publication rejected (object): publication % was never approved; there is no PUB to archive under', p_publication_id USING ERRCODE = '22023'; END IF;
  v_ref := jsonb_build_object('pub_object_version', p_object_version, 'controls', v_controls -> 'controls', 'holds', v_controls -> 'holds', 'source', jsonb_build_object('kind', v_controls ->> 'kind', 'id', v_controls ->> 'id', 'version', v_controls ->> 'version', 'digest', v_controls ->> 'digest'),
                              'versions', (SELECT count(*) FROM executive.publication_versions x WHERE x.publication_id = p_publication_id), 'deliveries', (SELECT count(*) FROM executive.publication_deliveries x WHERE x.publication_id = p_publication_id),
                              'signatures', (SELECT count(*) FROM executive.signatures s WHERE s.subject_kind = 'publication' AND s.subject_id = p_publication_id), 'archived_at', clock_timestamp());
  UPDATE executive.publications SET state = 'archived', archived_by = p_actor, archived_at = clock_timestamp(), archive_ref = v_ref, updated_at = clock_timestamp() WHERE publication_id = p_publication_id;
  v_ev := executive.publication_event(gen_random_uuid(), p_publication_id, p.current_version, p_tenant, p_domain, 'publication.archived', p_actor, v_ref, p_correlation);
  RETURN jsonb_build_object('publication_id', p_publication_id, 'state', 'archived', 'archived_by', p_actor, 'archive_ref', v_ref, 'event_id', v_ev);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.archive_publication(uuid,uuid,uuid,bigint,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.archive_publication(uuid,uuid,uuid,bigint,uuid,uuid) TO eye_commit;

/* d5 EXPORT CHECK: the export of an archived publication (its record with every receipt written under the export root by the service) is
   REFUSED while an active legal hold rests on the source's evidence (the export path's gate: a hold takes precedence — AU-MEM-0060) or the
   source carries a residency restriction (its bytes stay where the vault is); the class names are the export path's gates. */
CREATE OR REPLACE FUNCTION executive.export_publication_check(p_publication_id uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p executive.publications%ROWTYPE; v_controls jsonb; v_ev uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.publication.export']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'publication rejected (actor): exported by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO p FROM executive.publications q WHERE q.publication_id = p_publication_id AND q.tenant_id = p_tenant AND q.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'publication rejected (unknown_publication): no publication % in this domain', p_publication_id USING ERRCODE = '23503'; END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['executive', 'decision_authority', 'retention_authority']) THEN
    RAISE EXCEPTION 'publication rejected (authority): a publication is exported by a human holding executive, decision_authority or retention_authority' USING ERRCODE = '42501';
  END IF;
  IF p.state <> 'archived' THEN RAISE EXCEPTION 'publication rejected (state): publication % is %; an archived publication is exported', p_publication_id, p.state USING ERRCODE = '22023'; END IF;
  v_controls := executive.publication_controls(p_publication_id);
  IF jsonb_array_length(coalesce(v_controls -> 'holds', '[]'::jsonb)) > 0 THEN
    RAISE EXCEPTION 'publication rejected (legal_hold): % active legal hold(s) rest on the source''s evidence (hold %); a legal hold takes precedence over an export (AU-MEM-0060) — the archive stands, nothing leaves', jsonb_array_length(v_controls -> 'holds'), v_controls #>> '{holds,0,hold_id}' USING ERRCODE = '22023';
  END IF;
  IF (v_controls #>> '{controls,residency_profile}') IS NOT NULL THEN
    RAISE EXCEPTION 'publication rejected (residency): the source carries the residency profile %; its bytes stay in the vault''s residency — the archive stands, nothing leaves', v_controls #>> '{controls,residency_profile}' USING ERRCODE = '22023';
  END IF;
  v_ev := executive.publication_event(gen_random_uuid(), p_publication_id, p.current_version, p_tenant, p_domain, 'publication.exported', p_actor, jsonb_build_object('controls', v_controls -> 'controls', 'gates', jsonb_build_object('legal_hold', 'none active on the source''s evidence', 'residency', 'no residency profile on the source', 'classification', p.classification)), p_correlation);
  RETURN jsonb_build_object('publication_id', p_publication_id, 'state', p.state, 'controls', v_controls -> 'controls', 'holds', v_controls -> 'holds', 'classification', p.classification, 'event_id', v_ev);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.export_publication_check(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.export_publication_check(uuid,uuid,uuid,uuid,uuid) TO eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════
-- §D.5 RLS and grants (the 0081 loop idiom; the ports write)
-- ═══════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['publications', 'publication_versions', 'publication_deliveries', 'publication_events', 'external_drafts'] LOOP
    EXECUTE format('REVOKE ALL ON executive.%I FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE executive.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE executive.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY executive_isolation ON executive.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON executive.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;
