-- 0094 — CP-6 B36 (2026-09-30): STRATEGIC PLANNING, THE EXECUTIVE HOME, THE BRIEFING STUDIO COMPLETED, PUBLISHING — and the completions
-- carried from B32 and B34: the score and the Strategy Graph (F-P6-08, F-P6-09), the human gates (F-P6-04), the attention completion
-- (F-P6-07), collaboration with the local invitation pickup (F-P6-14, (t)), the enforced activation of a real execution target
-- (F-P6-05, (u)), the outcome loop in the browser (F-P4-13, (i)–(j)); the new features F-P6-10 (planning), F-P6-11 (the executive home),
-- F-P6-12 (briefing v2 completion), F-P6-13 (publishing).
--
-- One migration in nine sections, the prelude written first by the integrator, the eight parts built and proven on their own in parallel
-- worktrees (their harnesses phase6-{gates,attention,strategy,briefing,publishing,planning,home,collab}-b36), then combined here — no
-- function is re-declared by two sections:
--   §0  the prelude: the roles (executive_operator, board_member); the SIGNATURE beyond the audit chain (executive.signatures,
--       record_signature, signature_of); the ONE uniform human-gate product state vocabulary (executive.gate_states, ADR-003); the
--       EXECUTIVE CONTEXT (executive.contexts, set_context, current_context); the cadence (executive.cadences — the ports are §H's); the
--       room KINDS (decision | scenario | objective_review | forum, a subject and a deadline; a decision room keeps its package); the
--       widened vocabularies — decision.package_events, the attention classes and subject kinds
--   §G  gates (F-P6-04)        §A  attention (F-P6-07)      §S  the score and the Strategy Graph (F-P6-08, F-P6-09)
--   §B  briefing v3 (F-P6-12)  §D  publishing (F-P6-13)     §P  planning (F-P6-10)      §H  the executive home (F-P6-11)
--   §C  collaboration, the invitation pickup, the target activation, the outcome loop (F-P6-14, F-P6-05, F-P4-13)
--   §I  the integrator
-- The interface register stays 50/0/0 unless a part says otherwise in its report. Forward-only; nothing earlier is edited.

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- section `prelude`
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0094 §0 — CP-6 B36 PRELUDE (the integrator, 2026-09-30): the shared vocabulary the eight B36 parts build on, written FIRST so no two
-- parts re-declare the same object. What is declared here, and nothing else:
--   * roles: executive_operator (PER-03: curates the agenda, routes work, tracks commitments, escalates gaps; never the decision
--     authority), board_member (PER-01: the board / governing-body role; decides a board-class package only through the gate);
--   * the SIGNATURE beyond the audit chain: executive.signatures (append-only; Ed25519 by key reference — the export signing
--     discipline of B13), the port executive.record_signature (it asserts the action its CALLER names — each part passes its own bound
--     action) and the read executive.signature_of;
--   * executive.gate_states — the ONE uniform human-gate product state (ADR-003) for a decision, a publication, a source approval and a
--     merge, and executive.gate_state_ok(text);
--   * the EXECUTIVE CONTEXT: executive.contexts (organisation = tenant/domain, the objective, the horizon, the scenario, the classification
--     ceiling, the effective instant), executive.set_context (the bound action executive.context.set) and executive.current_context;
--   * executive.cadences (the executive home's cycle — opened, reset, sequence; §H's ports open and reset it);
--   * the room KINDS: executive.rooms_current gains kind (decision | scenario | objective_review | forum), subject_id and deadline; a
--     decision room keeps its package (package_id is nullable for the other kinds, the CHECK binds the two);
--   * the widened vocabularies: decision.package_events (the gate's signature, recusal, challenge, denial, distribution and the validated
--     fields), the attention signal classes (+ plan.variance, publication.correction, strategy.detection, queue.governance) and subject
--     kinds (+ plan, publication, strategy_object, queue).
-- Forward-only; 0084–0093 untouched.

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §0.1 ROLES
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
INSERT INTO identity.roles (code, scope, description) VALUES
  ('executive_operator', 'DOMAIN', 'The chief of staff / executive operator (B36, PER-03): curates the cadence agenda, routes work, tracks commitments and escalates gaps; never approves, decides, commits or publishes'),
  ('board_member', 'DOMAIN', 'A member of the board / governing body (B36, PER-01): reads the board surface and decides a board-class package only through the gate')
ON CONFLICT (code) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §0.2 THE SIGNATURE beyond the audit chain
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE executive.signatures (
  signature_id     uuid PRIMARY KEY,
  scope            text NOT NULL,
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  subject_kind     text NOT NULL CHECK (subject_kind IN ('approval', 'decision', 'publication', 'queue_transition', 'plan_baseline', 'briefing', 'health_snapshot')),
  subject_id       uuid NOT NULL,
  subject_version  int  NOT NULL CHECK (subject_version >= 1),
  subject_digest   text NOT NULL CHECK (subject_digest ~ '^[0-9a-f]{64}$'),
  signer           uuid NOT NULL,
  key_id           text NOT NULL CHECK (key_id ~ '^ed25519:[0-9a-f]{16}$'),
  algorithm        text NOT NULL DEFAULT 'Ed25519' CHECK (algorithm = 'Ed25519'),
  signature        text NOT NULL CHECK (signature ~ '^[A-Za-z0-9+/]{86}==$'),
  bound_action     text NOT NULL,
  signed_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id   uuid NOT NULL,
  CONSTRAINT xsg_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xsg_one_per_signer UNIQUE (subject_kind, subject_id, subject_version, signer)
);
CREATE INDEX xsg_subject ON executive.signatures (subject_kind, subject_id, subject_version);
CREATE TRIGGER xsg_append_only BEFORE UPDATE OR DELETE ON executive.signatures FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* The port: the CALLER's bound action is asserted (each part passes the action of the act the signature belongs to); the signer is the
   acting principal; the signature bytes are the TypeScript signer's (SignatureService: Ed25519 over the ASCII hex of the subject digest,
   the key by reference EYE_EXECUTIVE_SIGNING_KEY_<NAME>; verified before the row is written — a signature that does not verify is refused). */
CREATE OR REPLACE FUNCTION executive.record_signature(
  p_signature_id uuid, p_tenant uuid, p_domain uuid, p_action text, p_subject_kind text, p_subject_id uuid, p_subject_version int,
  p_subject_digest text, p_key_id text, p_signature text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY[p_action]);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'signature rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM executive.signatures s WHERE s.subject_kind = p_subject_kind AND s.subject_id = p_subject_id AND s.subject_version = p_subject_version AND s.signer = p_actor) THEN
    RAISE EXCEPTION 'signature rejected (state): % %/% is already signed by this principal', p_subject_kind, p_subject_id, p_subject_version USING ERRCODE = '22023';
  END IF;
  INSERT INTO executive.signatures (signature_id, scope, tenant_id, domain_id, subject_kind, subject_id, subject_version, subject_digest, signer, key_id, signature, bound_action, correlation_id)
  VALUES (p_signature_id, 'DOMAIN', p_tenant, p_domain, p_subject_kind, p_subject_id, p_subject_version, p_subject_digest, p_actor, p_key_id, p_signature, p_action, p_correlation);
  RETURN jsonb_build_object('signature_id', p_signature_id, 'subject_kind', p_subject_kind, 'subject_id', p_subject_id, 'subject_version', p_subject_version,
                            'subject_digest', p_subject_digest, 'signer', p_actor, 'key_id', p_key_id, 'signed_at', clock_timestamp());
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.record_signature(uuid,uuid,uuid,text,text,uuid,int,text,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.record_signature(uuid,uuid,uuid,text,text,uuid,int,text,text,text,uuid,uuid) TO eye_commit;

/* The read (an invoker: the caller's own RLS): the signatures of a subject, oldest first. */
CREATE OR REPLACE FUNCTION executive.signature_of(p_subject_kind text, p_subject_id uuid, p_subject_version int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = executive, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('signature_id', s.signature_id, 'signer', s.signer, 'key_id', s.key_id, 'algorithm', s.algorithm, 'signature', s.signature,
                                               'subject_digest', s.subject_digest, 'bound_action', s.bound_action, 'signed_at', s.signed_at) ORDER BY s.signed_at), '[]'::jsonb)
    FROM executive.signatures s WHERE s.subject_kind = p_subject_kind AND s.subject_id = p_subject_id AND s.subject_version = p_subject_version
$$;
GRANT EXECUTE ON FUNCTION executive.signature_of(text, uuid, int) TO eye_app, eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §0.3 THE UNIFORM HUMAN-GATE PRODUCT STATE (ADR-003)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE executive.gate_states (
  state       text PRIMARY KEY,
  ordinal     int  NOT NULL UNIQUE,
  terminal    boolean NOT NULL,
  description text NOT NULL
);
INSERT INTO executive.gate_states (state, ordinal, terminal, description) VALUES
  ('drafted', 10, false, 'a draft, not yet offered to a gate'),
  ('review_requested', 20, false, 'offered to the gate; a review is requested'),
  ('information_requested', 30, false, 'the gate asked for information; held until it is given'),
  ('deferred', 40, false, 'the gate deferred to a named later moment'),
  ('challenged', 45, false, 'a challenge is open; the effect is held until it is resolved'),
  ('recused', 46, false, 'an approver recused; the quorum is re-evaluated'),
  ('approved', 50, false, 'the gate approved; the effect may follow'),
  ('rejected', 60, true, 'the gate rejected'),
  ('overridden', 70, false, 'the gate was overridden as a recorded object'),
  ('withdrawn', 80, true, 'withdrawn before or after approval; the record kept');
CREATE OR REPLACE FUNCTION executive.gate_state_ok(p text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$ SELECT p IN ('drafted', 'review_requested', 'information_requested', 'deferred', 'challenged', 'recused', 'approved', 'rejected', 'overridden', 'withdrawn') $$;
GRANT SELECT ON executive.gate_states TO eye_app, eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §0.4 THE EXECUTIVE CONTEXT
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE executive.contexts (
  context_id        uuid PRIMARY KEY,
  scope             text NOT NULL,
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  principal_id      uuid NOT NULL,
  objective_id      uuid,
  horizon           text NOT NULL CHECK (horizon IN ('30d', '90d', '12m', '36m')),
  scenario_id       uuid,
  classification    text NOT NULL CHECK (classification IN ('public', 'internal', 'confidential', 'restricted')),
  effective_at      timestamptz,
  digest            text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  set_at            timestamptz NOT NULL DEFAULT clock_timestamp(),
  superseded_at     timestamptz,
  correlation_id    uuid NOT NULL,
  CONSTRAINT xcx_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX xcx_current ON executive.contexts (tenant_id, domain_id, principal_id) WHERE superseded_at IS NULL;
/* A context row moves one way: current → superseded (the superseded instant set once); nothing else of the row changes. */
CREATE OR REPLACE FUNCTION executive.contexts_forward() RETURNS trigger
SET search_path = executive, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'executive contexts are append-only: DELETE prohibited' USING ERRCODE = '2F002'; END IF;
  IF OLD.superseded_at IS NOT NULL OR NEW.superseded_at IS NULL OR (to_jsonb(NEW) - 'superseded_at') <> (to_jsonb(OLD) - 'superseded_at') THEN
    RAISE EXCEPTION 'executive context % is immutable; a new context supersedes it', OLD.context_id USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER xcx_forward BEFORE UPDATE OR DELETE ON executive.contexts FOR EACH ROW EXECUTE FUNCTION executive.contexts_forward();

CREATE OR REPLACE FUNCTION executive.set_context(
  p_context_id uuid, p_tenant uuid, p_domain uuid, p_objective uuid, p_horizon text, p_scenario uuid, p_classification text, p_effective_at timestamptz,
  p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, graph, prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_digest text; v_prior uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.context.set']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'context rejected (actor): set by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_objective IS NOT NULL AND NOT EXISTS (SELECT 1 FROM graph.strategy_current s WHERE s.strategy_object_id = p_objective AND s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.status NOT IN ('retired', 'withdrawn')) THEN
    RAISE EXCEPTION 'context rejected (stale): objective % is not a live strategy object of this domain', p_objective USING ERRCODE = '22023';
  END IF;
  IF p_scenario IS NOT NULL AND NOT EXISTS (SELECT 1 FROM prediction.scenarios_current x WHERE x.scenario_id = p_scenario AND x.tenant_id = p_tenant AND x.domain_id = p_domain) THEN
    RAISE EXCEPTION 'context rejected (stale): scenario % is not a scenario of this domain', p_scenario USING ERRCODE = '22023';
  END IF;
  v_digest := encode(digest(concat_ws('|', p_tenant::text, p_domain::text, coalesce(p_objective::text, ''), p_horizon, coalesce(p_scenario::text, ''), p_classification, coalesce(p_effective_at::text, '')), 'sha256'), 'hex');
  SELECT context_id INTO v_prior FROM executive.contexts c WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.principal_id = p_actor AND c.superseded_at IS NULL FOR UPDATE;
  IF v_prior IS NOT NULL THEN UPDATE executive.contexts SET superseded_at = clock_timestamp() WHERE context_id = v_prior; END IF;
  INSERT INTO executive.contexts (context_id, scope, tenant_id, domain_id, principal_id, objective_id, horizon, scenario_id, classification, effective_at, digest, correlation_id)
  VALUES (p_context_id, 'DOMAIN', p_tenant, p_domain, p_actor, p_objective, p_horizon, p_scenario, p_classification, p_effective_at, v_digest, p_correlation);
  RETURN jsonb_build_object('context_id', p_context_id, 'objective_id', p_objective, 'horizon', p_horizon, 'scenario_id', p_scenario, 'classification', p_classification,
                            'effective_at', p_effective_at, 'digest', v_digest, 'supersedes', v_prior);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.set_context(uuid,uuid,uuid,uuid,text,uuid,text,timestamptz,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.set_context(uuid,uuid,uuid,uuid,text,uuid,text,timestamptz,uuid,uuid) TO eye_commit;

/* The current context of a principal (an invoker read under the caller's RLS); NULL when none was set — the reader's default is the whole
   domain, horizon 90d, the reader's own classification ceiling, effective now. */
CREATE OR REPLACE FUNCTION executive.current_context(p_principal uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = executive, pg_catalog, pg_temp AS $$
  SELECT to_jsonb(c) - 'scope' - 'tenant_id' - 'domain_id' - 'correlation_id'
    FROM executive.contexts c WHERE c.principal_id = p_principal AND c.tenant_id = public.eye_tenant() AND c.superseded_at IS NULL
   ORDER BY c.set_at DESC LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION executive.current_context(uuid) TO eye_app, eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §0.5 THE CADENCE (the executive home's cycle; §H's ports open and reset it)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE executive.cadences (
  cadence_id      uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  period          text NOT NULL CHECK (period IN ('weekly', 'monthly', 'quarterly')),
  sequence        int  NOT NULL CHECK (sequence >= 1),
  opened_by       uuid NOT NULL,
  opened_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  closed_by       uuid,
  closed_at       timestamptz,
  closing_record  jsonb,
  correlation_id  uuid NOT NULL,
  CONSTRAINT xcd_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xcd_closed_bound CHECK ((closed_at IS NULL) = (closed_by IS NULL) AND (closed_at IS NULL) = (closing_record IS NULL)),
  CONSTRAINT xcd_sequence UNIQUE (tenant_id, domain_id, period, sequence)
);
CREATE UNIQUE INDEX xcd_one_open ON executive.cadences (tenant_id, domain_id, period) WHERE closed_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §0.6 THE ROOM KINDS (a decision room keeps its package; a scenario room, an objective review and a forum have a subject)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
ALTER TABLE executive.rooms_current ALTER COLUMN package_id DROP NOT NULL;
ALTER TABLE executive.rooms_current
  ADD COLUMN kind       text NOT NULL DEFAULT 'decision' CHECK (kind IN ('decision', 'scenario', 'objective_review', 'forum')),
  ADD COLUMN subject_id uuid,
  ADD COLUMN deadline   timestamptz;
ALTER TABLE executive.rooms_current ADD CONSTRAINT xrm_kind_subject CHECK (
  (kind = 'decision' AND package_id IS NOT NULL AND subject_id IS NULL)
  OR (kind IN ('scenario', 'objective_review') AND package_id IS NULL AND subject_id IS NOT NULL)
  OR (kind = 'forum' AND package_id IS NULL));

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §0.7 THE WIDENED VOCABULARIES (each list copied whole from its last declaration, plus B36's names)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- decision.package_events (0090 §0 line 115, whole, plus §G's)
ALTER TABLE decision.package_events DROP CONSTRAINT package_events_event_check;
ALTER TABLE decision.package_events ADD CONSTRAINT package_events_event_check CHECK (event IN (
  'package.declared', 'version.opened', 'option.set', 'terms.set', 'choice.set', 'dissent.recorded', 'version.proposed',
  'review.recorded', 'version.approved', 'approval.revoked', 'version.rejected', 'package.committed', 'package.withdrawn',
  'outcome.recorded', 'package.closed', 'commit.refused', 'replay.recorded', 'condition.breached', 'review.overdue', 'input.invalidated', 'package.reopened',
  'policy.changed',
  -- B24 (0086) markers
  'source_impact.acknowledged',
  -- B34 (0090) the gates (F-P6-04)
  'commit.held', 'commit.previewed', 'approval_condition.failed', 'gate.reviewed', 'gate.acknowledged', 'version.ready', 'version.deferred',
  'version.information_requested', 'version.resumed', 'version.rejected_by_owner', 'override.granted', 'override.reviewed',
  'approval_delegation.granted', 'approval_delegation.ended', 'approval_delegation.reassigned', 'package.class_reserved', 'control.recorded',
  -- B34 (0090) the commitments (F-P6-05)
  'commitment.item_opened', 'commitment.exception', 'execution.handoff_issued', 'execution.partial_effect', 'commitment.closed',
  -- B36 (0094) the gates completed (§G), the target activation (§C), the planning link (§P)
  'gate.signed', 'gate.recused', 'gate.challenged', 'gate.challenge_resolved', 'gate.denied', 'decision.distributed', 'version.fields_validated',
  'execution.target_activated', 'execution.target_deactivated', 'initiative.cited'));

-- the attention signal classes (0090 §0.5, whole, plus B36's) — the function AND the CHECK
CREATE OR REPLACE FUNCTION executive.attention_signal_classes() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['forecast.unfit', 'scenario.incoherent', 'warning.raised', 'source.coverage_loss', 'proposal.review', 'decision.material_change', 'review.convened',
  -- B34 (0090)
  'opportunity.raised', 'health.change', 'commitment.due', 'commitment.breach',
  -- B36 (0094)
  'plan.variance', 'publication.correction', 'strategy.detection', 'queue.governance'] $$;
ALTER TABLE executive.attention_items DROP CONSTRAINT IF EXISTS attention_items_signal_class_check;
ALTER TABLE executive.attention_items ADD CONSTRAINT attention_items_signal_class_check CHECK (signal_class IN (
  'forecast.unfit', 'scenario.incoherent', 'warning.raised', 'source.coverage_loss', 'proposal.review', 'decision.material_change', 'review.convened',
  'opportunity.raised', 'health.change', 'commitment.due', 'commitment.breach',
  'plan.variance', 'publication.correction', 'strategy.detection', 'queue.governance'));
ALTER TABLE executive.attention_items DROP CONSTRAINT IF EXISTS attention_items_subject_kind_check;
ALTER TABLE executive.attention_items ADD CONSTRAINT attention_items_subject_kind_check CHECK (subject_kind IN (
  'forecast', 'scenario', 'warning', 'source', 'claim', 'package', 'review',
  'exposure', 'health_change', 'commitment_item',
  -- B36 (0094)
  'plan', 'publication', 'strategy_object', 'queue'));

-- RLS and grants for the prelude's tables (the 0081 loop idiom; the ports write).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['signatures', 'contexts', 'cadences'] LOOP
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
