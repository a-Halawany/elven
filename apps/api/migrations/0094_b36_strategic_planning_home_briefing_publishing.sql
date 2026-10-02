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

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- section `attention` (§A) — the part-local file 0094_b36_x_attention.sql, combined here at integration in the apply order every fresh-database run used
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- section `attention`
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0094 §A — CP-6 B36 part `attention` (2026-09-30): THE ATTENTION COMPLETION — F-P6-07 COMPLETES. V8 PR-44-005 (fairness and staleness
-- ACT), CAP-EO-06; V9 UX-44-002 (the active objective, horizon, scenario, classification, effective time and policy EXPLICIT on the queue),
-- UX-44-005 (a recovery route per degraded state); V01-T-028 (governance forums over the same memory). Built on §0 (the signature, the
-- executive context, the room kinds — used, never re-declared) and on 0090 §A1–§A5 (the validator, the act, the queue evaluation).
--
--   §A0  the item-event vocabulary (0090 §0 line 416 copied whole, plus B36's item.settle_failed, item.act_resumed, item.priority_accepted)
--   §A1  THE RESUME ROUTE (n): an act whose SETTLE fails after its governed action COMMITTED gains the state settle_failed with the failure
--        and the committed action's receipt (executive.record_act_settle_failure); executive.resume_attention_act re-runs the settle from
--        the audit chain's record of the committed action — the governed action is NEVER re-executed (the port performs nothing; the
--        harness proves the target's audit sequence unchanged); a resume on an act whose action did not commit is refused (state); the
--        resumption is a row of executive.attention_act_resumptions and item.act_resumed on the item's log
--   §A2  ACCEPT-PRIORITY (o1): a DISTINCT human act of the item's accountable person — "I accept this item's rank and take it" — with the
--        DIGEST of the item's evaluation, the CONSEQUENCE preview (the response window, the escalation) and a SIGNATURE (§0
--        executive.record_signature, kind queue_transition — the route signs in the same write); item.priority_accepted; once per item
--   §A3  THE HOLD AND THE ROUTE-TO-AUTHORITY (o2; PR-44-005): the policy gains governance {fairness_floor, staleness_ceiling_hours} (the
--        validator re-declared from 0090 §A1 line 519 with that ONE change); after the queue evaluation (0090 §A5, untouched) the route
--        calls executive.hold_queue: the fairness measure (1 − the evaluation's disparity) below the floor, or the staleness measure (the
--        oldest live item's hours since its last evaluation) above the ceiling → executive.attention_queue_holds (held, the measure and
--        the threshold, the context digest) and executive.route_queue_to_authority (a queue.governance item for the executive); a HELD
--        queue serves its items READ-ONLY (a guard on the item log refuses every human transition) until the executive releases the hold
--        (executive.release_queue_hold, a reason)
--   §A4  THE RECOVERY ROUTES (o3; UX-44-005): the degraded states enumerated — delivery_sink_down, tick_stalled, policy_invalid,
--        evaluation_stale, hold — each detected from the ledgers (executive.attention_degraded_states) with what it means and its route;
--        executive.recover_queue runs the route's database side (re-deliver: the abandoned deliveries re-queued) and records every run
--        with before / after / outcome in executive.attention_recovery_routes (the release is recorded by release_queue_hold)
--   §A5  THE CONTEXT ON THE QUEUE (o4; UX-44-002): executive.queue_context reads §0's executive.current_context and the policy in force;
--        executive.attention_queue_read serves the items UNDER the context — an item outside the active objective, horizon or effective
--        time is FILTERED and COUNTED (never silently dropped; an item whose objective linkage is unknown is served and says so); the
--        ranking names the context digest it ran under
--   §A6  FORUMS (o5; V01-T-028): a room of kind forum (§0's column; forum_context is this section's) whose members review the SAME attention
--        items — executive.convene_forum (the executive operator; members; a cadence period) and executive.forum_queue (the queue read under
--        the forum's context: no copy — one item, one acceptance, seen by every forum)
-- Forward-only; 0083–0093 and §0 untouched. Every figure a harness seeds is SYNTHETIC.

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §A0 THE ITEM-EVENT VOCABULARY (0090 §0 line 416, whole, plus B36's)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
ALTER TABLE executive.attention_item_events DROP CONSTRAINT IF EXISTS attention_item_events_event_check;
ALTER TABLE executive.attention_item_events ADD CONSTRAINT attention_item_events_event_check CHECK (event IN (
  'item.routed', 'item.deprioritized', 'item.unrouted', 'item.escalated', 'item.acknowledged', 'item.suppressed',
  'item.suppression_lapsed', 'item.reevaluated', 'item.closed', 'item.repeated',
  -- B24 (0086)
  'item.delegated', 'item.delegation_ended', 'item.suppression_requested', 'item.suppression_decided',
  'item.overload_deprioritized', 'item.elevated', 'item.disposition',
  -- B34 (0090): the act transition
  'item.acted', 'item.act_refused',
  -- B36 (0094 §A): the settle failure and the resume, the accepted priority
  'item.settle_failed', 'item.act_resumed', 'item.priority_accepted'));

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §A1 THE RESUME ROUTE — an act whose settle failed after its governed action committed (n)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- The act (0090 §A4) gains the state settle_failed: the settle's write failed AFTER the governed action's own write committed (its receipt
-- known). The failure and the receipt are recorded; one act stays in flight per item (launched or settle_failed); a resume settles it acted
-- from the audit chain's record — nothing is performed again.
ALTER TABLE executive.attention_item_acts DROP CONSTRAINT attention_item_acts_state_check;
ALTER TABLE executive.attention_item_acts ADD CONSTRAINT attention_item_acts_state_check CHECK (state IN ('launched', 'acted', 'refused', 'settle_failed'));
ALTER TABLE executive.attention_item_acts
  ADD COLUMN settle_failure jsonb,
  ADD COLUMN action_receipt jsonb,
  ADD COLUMN resumed_at     timestamptz,
  ADD COLUMN resumed_by     uuid;
ALTER TABLE executive.attention_item_acts DROP CONSTRAINT xaia_settled;
ALTER TABLE executive.attention_item_acts ADD CONSTRAINT xaia_settled CHECK (
  (state IN ('launched', 'settle_failed')) = (settled_at IS NULL)
  AND (state <> 'acted' OR (effect_ref IS NOT NULL AND length(btrim(effect_ref)) > 0))
  AND (state <> 'refused' OR (refusal IS NOT NULL AND length(btrim(refusal)) > 0))
  AND (state <> 'settle_failed' OR jsonb_typeof(settle_failure) = 'object')
  AND ((resumed_at IS NULL) = (resumed_by IS NULL))
  AND (resumed_at IS NULL OR state = 'acted'));
DROP INDEX executive.xaia_one_in_flight;
CREATE UNIQUE INDEX xaia_one_in_flight ON executive.attention_item_acts (item_id) WHERE state IN ('launched', 'settle_failed');
/* One act in flight per item, SAID in 0090 §A4's words before the index answers: the launch port (0090:1017, untouched) checks only `launched`;
   a settle_failed act is in flight too — a further launch is refused (in_flight) and told to resume. */
CREATE OR REPLACE FUNCTION executive.attention_item_acts_one_in_flight() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_state text;
BEGIN
  SELECT z.state INTO v_state FROM executive.attention_item_acts z WHERE z.item_id = NEW.item_id AND z.state IN ('launched', 'settle_failed') AND z.act_id <> NEW.act_id LIMIT 1;
  IF v_state IS NOT NULL THEN
    RAISE EXCEPTION 'attention act rejected (in_flight): item % has an act % and not yet settled%', NEW.item_id, v_state,
      CASE WHEN v_state = 'settle_failed' THEN ' — the launcher or the executive operator resumes it (executive.attention.item.act.resume)' ELSE '' END USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER xaia_one_in_flight_guard BEFORE INSERT ON executive.attention_item_acts FOR EACH ROW EXECUTE FUNCTION executive.attention_item_acts_one_in_flight();
COMMENT ON COLUMN executive.attention_item_acts.settle_failure IS 'B36 (0094 §A1): what the settle met after the governed action committed — {reason, effect_ref, effect, failed_at}; the act reads settle_failed until it is resumed';
COMMENT ON COLUMN executive.attention_item_acts.action_receipt IS 'B36 (0094 §A1): the committed governed action''s receipt {policyDecisionId, auditSeq} — the audit chain''s row the resume settles from; never a re-execution';

/* The settle-once trigger — 0090 §A4 line 988 copied whole; B36: launched → settle_failed (the failure and the receipt), and
   launched | settle_failed → acted | refused (the settle's columns, and on a resume resumed_at / resumed_by / action_receipt). */
CREATE OR REPLACE FUNCTION executive.attention_item_acts_settle_once() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'attention act rejected: an act is never deleted' USING ERRCODE = '2F002'; END IF;
  IF OLD.state = 'launched' AND NEW.state = 'settle_failed' THEN
    IF (to_jsonb(NEW) - ARRAY['state', 'settle_failure', 'action_receipt']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['state', 'settle_failure', 'action_receipt']) THEN
      RAISE EXCEPTION 'attention act rejected: act % records its settle failure and the committed action''s receipt, nothing else', OLD.act_id USING ERRCODE = '2F002';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.state NOT IN ('launched', 'settle_failed') OR NEW.state IN ('launched', 'settle_failed')
     OR (to_jsonb(NEW) - ARRAY['state', 'effect_ref', 'effect', 'refusal', 'settled_at', 'resumed_at', 'resumed_by', 'action_receipt'])
        IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['state', 'effect_ref', 'effect', 'refusal', 'settled_at', 'resumed_at', 'resumed_by', 'action_receipt']) THEN
    RAISE EXCEPTION 'attention act rejected: act % is % and settles once (launched → acted | refused | settle_failed → acted)', OLD.act_id, OLD.state USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$;

CREATE TABLE executive.attention_act_resumptions (
  resumption_id   uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  act_id          uuid NOT NULL REFERENCES executive.attention_item_acts (act_id),
  item_id         uuid NOT NULL REFERENCES executive.attention_items (item_id),
  from_state      text NOT NULL CHECK (from_state IN ('launched', 'settle_failed')),
  failure         jsonb,
  action_receipt  jsonb NOT NULL CHECK (jsonb_typeof(action_receipt) = 'object'),
  effect_ref      text NOT NULL,
  resumed_by      uuid NOT NULL,
  resumed_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT xar_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX xar_act ON executive.attention_act_resumptions (act_id);
CREATE TRIGGER xar_append_only BEFORE UPDATE OR DELETE ON executive.attention_act_resumptions FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE executive.attention_act_resumptions IS 'B36 (0094 §A1): every resumed act — the state it was resumed from, the failure its settle met, the committed action''s receipt (from the audit chain), who resumed it; the governed action is never re-executed';

/* The act's answer (0090 §A4's, plus B36's columns). */
CREATE OR REPLACE FUNCTION executive.attention_act_answer_b36(a executive.attention_item_acts, p_repeated boolean) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT executive.attention_act_answer(a, p_repeated) || jsonb_build_object('settle_failure', a.settle_failure, 'action_receipt', a.action_receipt, 'resumed_at', a.resumed_at, 'resumed_by', a.resumed_by);
$$;
REVOKE ALL ON FUNCTION executive.attention_act_answer_b36(executive.attention_item_acts, boolean) FROM PUBLIC;

/* THE COMMITTED ACTION'S RECEIPT from the audit chain: the successful api.request event of the act's governed action under the act's
   correlation (the governed action's chained envelope keeps the launch's correlation id — act.service.ts `chained`). NULL when the action
   never committed. A read of the audit ledger, nothing else. */
CREATE OR REPLACE FUNCTION executive.attention_act_committed_receipt(a executive.attention_item_acts) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = executive, audit, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('partition_id', e.partition_id, 'auditSeq', e.audit_seq, 'policyDecisionId', e.event ->> 'policy_decision_id', 'action', e.action,
                            'target_type', e.event ->> 'target_type', 'target_id', e.event ->> 'target_id', 'occurred_at', e.occurred_at, 'source', 'audit.audit_events')
    FROM audit.audit_events e
   WHERE e.correlation_id = a.correlation_id AND e.tenant_id = a.tenant_id AND e.event_type = 'api.request' AND e.action = a.governed_action AND e.outcome = 'success'
   ORDER BY e.audit_seq DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION executive.attention_act_committed_receipt(executive.attention_item_acts) FROM PUBLIC;

-- THE SETTLE FAILURE RECORDED (executive.attention.item.act — the act's own action; the launcher): launched → settle_failed with the
-- failure the settle met and the committed action's receipt; item.settle_failed on the item's log.
CREATE OR REPLACE FUNCTION executive.record_act_settle_failure(p_act_id uuid, p_tenant uuid, p_domain uuid, p_failure jsonb, p_action_receipt jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a executive.attention_item_acts%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.item.act']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'settle failure rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO a FROM executive.attention_item_acts z WHERE z.act_id = p_act_id AND z.tenant_id = p_tenant AND z.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'settle failure rejected (unknown_act): act % is not an act of this domain', p_act_id USING ERRCODE = '23503'; END IF;
  IF a.launched_by <> p_actor THEN RAISE EXCEPTION 'settle failure rejected (actor): the settle failure of act % is recorded by the member who launched it', p_act_id USING ERRCODE = '42501'; END IF;
  IF a.state <> 'launched' THEN RAISE EXCEPTION 'settle failure rejected (state): act % is %; only a launched act''s settle fails', p_act_id, a.state USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(p_failure) IS DISTINCT FROM 'object' OR coalesce(length(btrim(p_failure ->> 'reason')), 0) = 0 THEN
    RAISE EXCEPTION 'settle failure rejected (failure): the failure is {reason, effect_ref, effect}' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_action_receipt) IS DISTINCT FROM 'object' OR NOT (p_action_receipt ? 'auditSeq') THEN
    RAISE EXCEPTION 'settle failure rejected (receipt): the committed action''s receipt is {policyDecisionId, auditSeq}' USING ERRCODE = '22023';
  END IF;
  UPDATE executive.attention_item_acts SET state = 'settle_failed', settle_failure = p_failure || jsonb_build_object('failed_at', clock_timestamp()), action_receipt = p_action_receipt
   WHERE act_id = p_act_id RETURNING * INTO a;
  PERFORM executive.attention_event(a.item_id, p_tenant, p_domain, 'item.settle_failed', p_actor,
            jsonb_build_object('act_id', a.act_id, 'action_key', a.action_key, 'governed_action', a.governed_action, 'target_kind', a.target_kind, 'target_id', a.target_id,
                               'failure', p_failure ->> 'reason', 'effect_ref', p_failure ->> 'effect_ref', 'action_receipt', p_action_receipt,
                               'resume', 'the launcher or the executive operator resumes the settle (executive.attention.item.act.resume); the governed action is not performed again'), p_correlation);
  RETURN executive.attention_act_answer_b36(a, false);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.record_act_settle_failure(uuid,uuid,uuid,jsonb,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.record_act_settle_failure(uuid,uuid,uuid,jsonb,jsonb,uuid,uuid) TO eye_commit;

-- THE RESUME (executive.attention.item.act.resume; human-gated): the launcher or the executive operator; the act launched or settle_failed;
-- the governed action's commit PROVEN from the audit chain (its successful api.request event under the act's correlation) — an act whose
-- action did not commit is refused (state): it is settled refused or launched afresh, never resumed. The settle re-run: acted with the
-- effect the failure recorded (or the audit row's reference), item.acted (resumed) and item.act_resumed on the log, a resumption row.
CREATE OR REPLACE FUNCTION executive.resume_attention_act(p_resumption_id uuid, p_act_id uuid, p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, audit, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a executive.attention_item_acts%ROWTYPE; v_receipt jsonb; v_from text; v_effect_ref text; v_effect jsonb; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.item.act.resume']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'act resumption rejected (actor): resumed by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'act resumption rejected (actor): a resume is a named, active member''s — never an agent''s' USING ERRCODE = '42501'; END IF;
  SELECT * INTO a FROM executive.attention_item_acts z WHERE z.act_id = p_act_id AND z.tenant_id = p_tenant AND z.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'act resumption rejected (unknown_act): act % is not an act of this domain', p_act_id USING ERRCODE = '23503'; END IF;
  IF a.launched_by <> p_actor AND NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['executive_operator']) THEN
    RAISE EXCEPTION 'act resumption rejected (actor): act % is resumed by the member who launched it or by the executive operator', p_act_id USING ERRCODE = '42501';
  END IF;
  IF a.state IN ('acted', 'refused') THEN
    RAISE EXCEPTION 'act resumption rejected (state): act % is already % (settled at %); nothing to resume', p_act_id, a.state, a.settled_at USING ERRCODE = '22023';
  END IF;
  v_receipt := executive.attention_act_committed_receipt(a);
  IF v_receipt IS NULL THEN
    RAISE EXCEPTION 'act resumption rejected (state): the governed action % of act % did not commit (no successful audit event under its correlation); nothing to resume — the act stays % and is settled refused or launched afresh, never resumed',
      a.governed_action, p_act_id, a.state USING ERRCODE = '22023';
  END IF;
  v_from := a.state;
  v_receipt := coalesce(a.action_receipt, '{}'::jsonb) || v_receipt;
  v_effect_ref := coalesce(nullif(btrim(a.settle_failure ->> 'effect_ref'), ''), format('%s:%s@audit#%s', a.target_kind, a.target_id, v_receipt ->> 'auditSeq'));
  v_effect := CASE WHEN jsonb_typeof(a.settle_failure -> 'effect') = 'object' THEN a.settle_failure -> 'effect'
                   ELSE jsonb_build_object('governed_action', a.governed_action, 'from', 'the audit chain (the settle failed before the effect was recorded)', 'audit_seq', v_receipt -> 'auditSeq') END
              || jsonb_build_object('resumed', true, 'resumption_id', p_resumption_id);
  UPDATE executive.attention_item_acts SET state = 'acted', effect_ref = left(v_effect_ref, 500), effect = v_effect, settled_at = v_at, resumed_at = v_at, resumed_by = p_actor, action_receipt = v_receipt
   WHERE act_id = p_act_id RETURNING * INTO a;
  INSERT INTO executive.attention_act_resumptions (resumption_id, scope, tenant_id, domain_id, act_id, item_id, from_state, failure, action_receipt, effect_ref, resumed_by, resumed_at, correlation_id)
  VALUES (p_resumption_id, 'DOMAIN', p_tenant, p_domain, a.act_id, a.item_id, v_from, a.settle_failure, v_receipt, a.effect_ref, p_actor, v_at, p_correlation);
  PERFORM executive.attention_event(a.item_id, p_tenant, p_domain, 'item.acted', p_actor,
            jsonb_build_object('act_id', a.act_id, 'action_key', a.action_key, 'governed_action', a.governed_action, 'target_kind', a.target_kind, 'target_id', a.target_id,
                               'rationale', a.rationale, 'effect_ref', a.effect_ref, 'effect', a.effect, 'refusal', NULL, 'gate', 'human_gate', 'resumed', true, 'resumption_id', p_resumption_id), p_correlation);
  PERFORM executive.attention_event(a.item_id, p_tenant, p_domain, 'item.act_resumed', p_actor,
            jsonb_build_object('act_id', a.act_id, 'resumption_id', p_resumption_id, 'from_state', v_from, 'failure', a.settle_failure ->> 'reason', 'action_receipt', v_receipt,
                               're_executed', false, 'note', 'the settle re-run from the committed action''s receipt; the governed action was not performed again'), p_correlation);
  RETURN executive.attention_act_answer_b36(a, false) || jsonb_build_object('resumption', jsonb_build_object('resumption_id', p_resumption_id, 'from_state', v_from, 'action_receipt', v_receipt, 're_executed', false));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.resume_attention_act(uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.resume_attention_act(uuid,uuid,uuid,uuid,uuid,uuid) TO eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §A2 ACCEPT-PRIORITY — the distinct human act on the queue's transition (o1)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE executive.attention_priority_acceptances (
  acceptance_id      uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  item_id            uuid NOT NULL REFERENCES executive.attention_items (item_id),
  accepted_by        uuid NOT NULL,
  evaluation_digest  text NOT NULL CHECK (evaluation_digest ~ '^[0-9a-f]{64}$'),
  consequence        jsonb NOT NULL CHECK (jsonb_typeof(consequence) = 'object'),
  rank_explanation   text,
  note               text,
  context_digest     text,
  accepted_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT xpa_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xpa_once UNIQUE (item_id)
);
CREATE TRIGGER xpa_append_only BEFORE UPDATE OR DELETE ON executive.attention_priority_acceptances FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE executive.attention_priority_acceptances IS 'B36 (0094 §A2): the accountable person''s acceptance of an item''s rank — the digest of the evaluation accepted, the consequence preview (the response window, the escalation), the context it was accepted under; SIGNED as a queue_transition (executive.signatures); once per item';

-- THE ACCEPTANCE (executive.attention.item.accept_priority; human-gated): the item's accountable person — its owner, or (no owner) a holder
-- of its routed roles; a live item; once. The consequence preview is what accepting commits the person to; the signature (kind
-- queue_transition over the evaluation digest, subject = the acceptance, version 1) is the route's, in the same write.
CREATE OR REPLACE FUNCTION executive.accept_priority(p_acceptance_id uuid, p_item uuid, p_tenant uuid, p_domain uuid, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x executive.attention_items%ROWTYPE; pol executive.attention_policies%ROWTYPE; r jsonb; v_digest text; v_conseq jsonb; v_ctx text; v_prior record; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.item.accept_priority']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'priority acceptance rejected (actor): accepted by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'priority acceptance rejected (actor): an acceptance is a named, active member''s — never an agent''s' USING ERRCODE = '42501'; END IF;
  SELECT * INTO x FROM executive.attention_items i WHERE i.item_id = p_item AND i.tenant_id = p_tenant AND i.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'priority acceptance rejected (unknown_item): item % is not an item of this domain', p_item USING ERRCODE = '23503'; END IF;
  IF NOT ((x.owner_principal_id IS NOT NULL AND x.owner_principal_id = p_actor)
          OR (x.owner_principal_id IS NULL AND cardinality(x.route_roles) > 0 AND executive.holds_role(p_actor, p_tenant, p_domain, x.route_roles))) THEN
    RAISE EXCEPTION 'priority acceptance rejected (accountable): item % is accountable to % — the acting principal is not its accountable person',
      p_item, CASE WHEN x.owner_principal_id IS NOT NULL THEN 'its owner ' || x.owner_principal_id::text ELSE 'a holder of ' || array_to_string(x.route_roles, ', ') END USING ERRCODE = '42501';
  END IF;
  IF x.state NOT IN ('open', 'escalated', 'unrouted', 'acknowledged') THEN
    RAISE EXCEPTION 'priority acceptance rejected (state): item % is %; a priority is accepted on an open, escalated, unrouted or acknowledged item', p_item, x.state USING ERRCODE = '22023';
  END IF;
  SELECT accepted_by, accepted_at INTO v_prior FROM executive.attention_priority_acceptances q WHERE q.item_id = p_item;
  IF FOUND THEN RAISE EXCEPTION 'priority acceptance rejected (state): the priority of item % was accepted by % at %; it is accepted once', p_item, v_prior.accepted_by, v_prior.accepted_at USING ERRCODE = '22023'; END IF;
  IF p_note IS NOT NULL AND length(btrim(p_note)) > 1000 THEN RAISE EXCEPTION 'priority acceptance rejected (note): a note is at most 1000 characters' USING ERRCODE = '22023'; END IF;
  SELECT * INTO pol FROM executive.attention_policies a WHERE a.policy_id = x.policy_id;
  r := CASE WHEN pol.policy_id IS NULL THEN NULL ELSE pol.rules -> 'classes' -> x.signal_class END;
  v_digest := encode(digest(x.evaluation::text, 'sha256'), 'hex');
  v_ctx := executive.current_context(p_actor) ->> 'digest';
  v_conseq := jsonb_build_object(
    'accountable', p_actor, 'state', x.state, 'rank', x.evaluation #>> '{rank,explanation}',
    'response_window', jsonb_build_object('due_at', x.due_at, 'hours_remaining', CASE WHEN x.due_at IS NULL THEN NULL ELSE round((extract(epoch FROM (x.due_at - v_at)) / 3600)::numeric, 2) END,
                                          'ack_within_minutes', r -> 'ack_within_minutes'),
    'escalation', jsonb_build_object('roles', coalesce(r -> 'escalate_to_roles', '[]'::jsonb), 'max_escalations', coalesce(r -> 'max_escalations', '0'::jsonb), 'so_far', x.escalations),
    'commits_to', format('the accountable person answers for item %s within its response window%s: acknowledges, acts on or disposes it before the deadline; an overdue item escalates%s',
                         x.item_id, CASE WHEN x.due_at IS NULL THEN ' (no deadline set)' ELSE ' (due ' || x.due_at::text || ')' END,
                         CASE WHEN jsonb_typeof(r -> 'escalate_to_roles') = 'array' AND jsonb_array_length(r -> 'escalate_to_roles') > 0 THEN ' to ' || (SELECT string_agg(e #>> '{}', ', ') FROM jsonb_array_elements(r -> 'escalate_to_roles') e) ELSE ' to nobody (no escalation roles)' END),
    'policy_version', x.policy_version, 'evaluation_digest', v_digest, 'context_digest', v_ctx);
  INSERT INTO executive.attention_priority_acceptances (acceptance_id, scope, tenant_id, domain_id, item_id, accepted_by, evaluation_digest, consequence, rank_explanation, note, context_digest, accepted_at, correlation_id)
  VALUES (p_acceptance_id, 'DOMAIN', p_tenant, p_domain, p_item, p_actor, v_digest, v_conseq, x.evaluation #>> '{rank,explanation}', nullif(btrim(p_note), ''), v_ctx, v_at, p_correlation);
  PERFORM executive.attention_event(p_item, p_tenant, p_domain, 'item.priority_accepted', p_actor,
            jsonb_build_object('acceptance_id', p_acceptance_id, 'evaluation_digest', v_digest, 'consequence', v_conseq, 'note', nullif(btrim(p_note), ''),
                               'signature', jsonb_build_object('subject_kind', 'queue_transition', 'subject_id', p_acceptance_id, 'subject_version', 1, 'by', 'the route, in this write')), p_correlation);
  RETURN jsonb_build_object('acceptance_id', p_acceptance_id, 'item_id', p_item, 'accepted_by', p_actor, 'accepted_at', v_at, 'evaluation_digest', v_digest, 'consequence', v_conseq,
                            'rank_explanation', x.evaluation #>> '{rank,explanation}', 'note', nullif(btrim(p_note), ''), 'context_digest', v_ctx,
                            'subject', jsonb_build_object('kind', 'queue_transition', 'id', p_acceptance_id, 'version', 1, 'digest', v_digest));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.accept_priority(uuid,uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.accept_priority(uuid,uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §A3 THE HOLD AND THE ROUTE-TO-AUTHORITY (o2; PR-44-005)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- THE POLICY VALIDATOR — 0090 §A1 (line 519) copied whole; B36: the ONE change — the top-level key `governance` {fairness_floor,
-- staleness_ceiling_hours} admitted and validated (the block at the end).
CREATE OR REPLACE FUNCTION executive.validate_attention_rules(p_rules jsonb) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = executive, identity, pg_catalog, pg_temp AS $$
DECLARE c record; k text; r jsonb; m jsonb; s jsonb; v jsonb;
BEGIN
  IF p_rules IS NULL OR jsonb_typeof(p_rules) <> 'object' THEN RAISE EXCEPTION 'attention policy rejected: the rules are an object {classes, overload?}' USING ERRCODE = '22023'; END IF;
  FOR k IN SELECT jsonb_object_keys(p_rules) LOOP
    IF k NOT IN ('classes', 'overload', /* B36 (0094 §A3) */ 'governance') THEN RAISE EXCEPTION 'attention policy rejected: unknown key % (the rules carry classes and optionally overload and governance)', k USING ERRCODE = '22023'; END IF;
  END LOOP;
  IF jsonb_typeof(p_rules -> 'classes') IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(p_rules -> 'classes')) = 0 THEN
    RAISE EXCEPTION 'attention policy rejected: classes is a non-empty object keyed by signal class (%)', array_to_string(executive.attention_signal_classes(), ', ') USING ERRCODE = '22023';
  END IF;
  FOR c IN SELECT key, value FROM jsonb_each(p_rules -> 'classes') LOOP
    IF NOT (c.key = ANY (executive.attention_signal_classes())) THEN RAISE EXCEPTION 'attention policy rejected: % is not a signal class (%)', c.key, array_to_string(executive.attention_signal_classes(), ', ') USING ERRCODE = '22023'; END IF;
    r := c.value;
    IF jsonb_typeof(r) <> 'object' THEN RAISE EXCEPTION 'attention policy rejected: class % is an object', c.key USING ERRCODE = '22023'; END IF;
    FOR k IN SELECT jsonb_object_keys(r) LOOP
      IF k NOT IN ('materiality', 'route_roles', 'ack_within_minutes', 'escalate_to_roles', 'max_escalations', 'suppression', 'notify') THEN
        RAISE EXCEPTION 'attention policy rejected: class % carries the unknown key %', c.key, k USING ERRCODE = '22023';
      END IF;
    END LOOP;
    m := r -> 'materiality';
    IF jsonb_typeof(m) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'attention policy rejected: class % needs materiality {min_consequence, min_confidence, max_hours_to_window?}', c.key USING ERRCODE = '22023'; END IF;
    FOR k IN SELECT jsonb_object_keys(m) LOOP
      IF k NOT IN ('min_consequence', 'min_confidence', 'max_hours_to_window',
                   'min_probability', 'min_exposure', 'min_strategic_relevance', 'min_information_value', 'min_irreversibility', 'require',
                   /* B28 (0088 §S8) */ 'min_novelty') THEN
        RAISE EXCEPTION 'attention policy rejected: class % materiality carries the unknown key %', c.key, k USING ERRCODE = '22023';
      END IF;
    END LOOP;
    -- B24 (0086 §0): the five further dimensions (V00-T-069, V03-T-262) — each judged only when its class sets a threshold
    FOR k IN SELECT unnest(ARRAY['min_probability', 'min_strategic_relevance', 'min_information_value', /* B28 (0088 §S8) */ 'min_novelty']) LOOP
      IF m ? k AND (jsonb_typeof(m -> k) <> 'number' OR (m ->> k)::numeric < 0 OR (m ->> k)::numeric > 1) THEN
        RAISE EXCEPTION 'attention policy rejected: class % materiality.% is a number in [0, 1]', c.key, k USING ERRCODE = '22023';
      END IF;
    END LOOP;
    IF m ? 'min_exposure' AND (jsonb_typeof(m -> 'min_exposure') <> 'number' OR (m ->> 'min_exposure')::numeric < 0) THEN
      RAISE EXCEPTION 'attention policy rejected: class % materiality.min_exposure is a number ≥ 0 (the count of dependent products)', c.key USING ERRCODE = '22023';
    END IF;
    IF m ? 'min_irreversibility' AND coalesce(m ->> 'min_irreversibility', '') NOT IN ('reversible', 'costly', 'irreversible') THEN
      RAISE EXCEPTION 'attention policy rejected: class % materiality.min_irreversibility is reversible | costly | irreversible', c.key USING ERRCODE = '22023';
    END IF;
    IF m ? 'require' AND (jsonb_typeof(m -> 'require') <> 'array' OR EXISTS (SELECT 1 FROM jsonb_array_elements(m -> 'require') e
         WHERE jsonb_typeof(e) <> 'string' OR (e #>> '{}') NOT IN ('probability', 'exposure', 'strategic_relevance', 'information_value', 'irreversibility'))) THEN
      RAISE EXCEPTION 'attention policy rejected: class % materiality.require lists dimensions among probability, exposure, strategic_relevance, information_value, irreversibility', c.key USING ERRCODE = '22023';
    END IF;
    IF coalesce(m ->> 'min_consequence', '') NOT IN ('C0', 'C1', 'C2', 'C3', 'C4') THEN RAISE EXCEPTION 'attention policy rejected: class % materiality.min_consequence is C0..C4', c.key USING ERRCODE = '22023'; END IF;
    IF jsonb_typeof(m -> 'min_confidence') IS DISTINCT FROM 'number' OR (m ->> 'min_confidence')::numeric < 0 OR (m ->> 'min_confidence')::numeric > 1 THEN
      RAISE EXCEPTION 'attention policy rejected: class % materiality.min_confidence is a number in [0, 1]', c.key USING ERRCODE = '22023';
    END IF;
    IF m ? 'max_hours_to_window' AND jsonb_typeof(m -> 'max_hours_to_window') <> 'null'
       AND (jsonb_typeof(m -> 'max_hours_to_window') <> 'number' OR (m ->> 'max_hours_to_window')::numeric <= 0) THEN
      RAISE EXCEPTION 'attention policy rejected: class % materiality.max_hours_to_window is a positive number or null', c.key USING ERRCODE = '22023';
    END IF;
    FOR k IN SELECT unnest(ARRAY['route_roles', 'escalate_to_roles']) LOOP
      v := r -> k;
      IF k = 'route_roles' AND (jsonb_typeof(v) IS DISTINCT FROM 'array' OR jsonb_array_length(v) = 0) THEN RAISE EXCEPTION 'attention policy rejected: class % route_roles is a non-empty list of roles', c.key USING ERRCODE = '22023'; END IF;
      IF v IS NOT NULL AND jsonb_typeof(v) <> 'array' THEN RAISE EXCEPTION 'attention policy rejected: class % % is a list of roles', c.key, k USING ERRCODE = '22023'; END IF;
      IF v IS NOT NULL AND EXISTS (SELECT 1 FROM jsonb_array_elements(v) e WHERE jsonb_typeof(e) <> 'string' OR NOT EXISTS (SELECT 1 FROM identity.roles x WHERE x.code = e #>> '{}' AND x.code NOT LIKE '%\_subscriber' AND x.code NOT LIKE '%\_agent')) THEN
        RAISE EXCEPTION 'attention policy rejected: class % % names a role that is not a human role of this product', c.key, k USING ERRCODE = '22023';
      END IF;
    END LOOP;
    IF jsonb_typeof(r -> 'ack_within_minutes') IS DISTINCT FROM 'number' OR (r ->> 'ack_within_minutes')::numeric <> trunc((r ->> 'ack_within_minutes')::numeric)
       OR (r ->> 'ack_within_minutes')::numeric < 1 OR (r ->> 'ack_within_minutes')::numeric > 10080 THEN
      RAISE EXCEPTION 'attention policy rejected: class % ack_within_minutes is a whole number in [1, 10080]', c.key USING ERRCODE = '22023';
    END IF;
    IF r ? 'max_escalations' AND (jsonb_typeof(r -> 'max_escalations') <> 'number' OR (r ->> 'max_escalations')::numeric NOT IN (0, 1, 2, 3, 4, 5)) THEN
      RAISE EXCEPTION 'attention policy rejected: class % max_escalations is 0..5', c.key USING ERRCODE = '22023';
    END IF;
    IF coalesce((r ->> 'max_escalations')::int, 0) > 0 AND (r -> 'escalate_to_roles' IS NULL OR jsonb_array_length(r -> 'escalate_to_roles') = 0) THEN
      RAISE EXCEPTION 'attention policy rejected: class % escalates (max_escalations > 0) to nobody; name escalate_to_roles', c.key USING ERRCODE = '22023';
    END IF;
    s := r -> 'suppression';
    IF s IS NOT NULL THEN
      IF jsonb_typeof(s) <> 'object' OR jsonb_typeof(s -> 'allowed') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'attention policy rejected: class % suppression is {allowed, max_hours}', c.key USING ERRCODE = '22023'; END IF;
      IF (s ->> 'allowed')::boolean AND (jsonb_typeof(s -> 'max_hours') IS DISTINCT FROM 'number' OR (s ->> 'max_hours')::numeric < 1 OR (s ->> 'max_hours')::numeric > 720) THEN
        RAISE EXCEPTION 'attention policy rejected: class % suppression.max_hours is in [1, 720] when suppression is allowed', c.key USING ERRCODE = '22023';
      END IF;
      -- B24 (0086 §0): a suppression may need a second person's approval (V03-T-263, V03-T-171)
      FOR k IN SELECT jsonb_object_keys(s) LOOP
        IF k NOT IN ('allowed', 'max_hours', 'approval_required', 'approver_roles') THEN RAISE EXCEPTION 'attention policy rejected: class % suppression carries the unknown key %', c.key, k USING ERRCODE = '22023'; END IF;
      END LOOP;
      IF s ? 'approval_required' AND jsonb_typeof(s -> 'approval_required') <> 'boolean' THEN RAISE EXCEPTION 'attention policy rejected: class % suppression.approval_required is a boolean', c.key USING ERRCODE = '22023'; END IF;
      IF coalesce((s ->> 'approval_required')::boolean, false) AND (jsonb_typeof(s -> 'approver_roles') IS DISTINCT FROM 'array' OR jsonb_array_length(s -> 'approver_roles') = 0
         OR EXISTS (SELECT 1 FROM jsonb_array_elements(s -> 'approver_roles') e WHERE jsonb_typeof(e) <> 'string'
                     OR NOT EXISTS (SELECT 1 FROM identity.roles x WHERE x.code = e #>> '{}' AND x.code NOT LIKE '%\_subscriber' AND x.code NOT LIKE '%\_agent'))) THEN
        RAISE EXCEPTION 'attention policy rejected: class % suppression.approver_roles is a non-empty list of human roles when approval is required', c.key USING ERRCODE = '22023';
      END IF;
    END IF;
    -- B24 (0086 §0): notify is 'in_app' (as before) or {channels, max_attempts} over the channels this product has — in_app and the
    -- SYNTHETIC demo-mailbox; a real provider channel (email, sms, teams, push) needs a delivery provider (owner decision D6)
    IF r ? 'notify' THEN
      v := r -> 'notify';
      IF jsonb_typeof(v) = 'string' THEN
        IF v #>> '{}' <> 'in_app' THEN
          -- B34 (0090): a bare word other than in_app is still refused (the message kept): a synthetic adapter is named in {channels}
          RAISE EXCEPTION 'attention policy rejected: class % notify is in_app or {channels, max_attempts}; % needs a delivery provider (owner decision D6) — the SYNTHETIC email, sms and teams adapters are named in {channels}', c.key, v #>> '{}' USING ERRCODE = '22023';
        END IF;
      ELSIF jsonb_typeof(v) = 'object' THEN
        FOR k IN SELECT jsonb_object_keys(v) LOOP
          IF k NOT IN ('channels', 'max_attempts') THEN RAISE EXCEPTION 'attention policy rejected: class % notify carries the unknown key %', c.key, k USING ERRCODE = '22023'; END IF;
        END LOOP;
        IF jsonb_typeof(v -> 'channels') IS DISTINCT FROM 'array' OR jsonb_array_length(v -> 'channels') = 0 THEN
          RAISE EXCEPTION 'attention policy rejected: class % notify.channels is a non-empty list', c.key USING ERRCODE = '22023';
        END IF;
        -- B34 (0090): the channels are executive.attention_delivery_channels() — in_app, and the SYNTHETIC demo-mailbox, email, sms and teams
        -- (the last three adapters reach LOCAL sinks only; a real provider — and push — is owner decision D6)
        IF EXISTS (SELECT 1 FROM jsonb_array_elements(v -> 'channels') e WHERE jsonb_typeof(e) <> 'string' OR NOT ((e #>> '{}') = ANY (executive.attention_delivery_channels()))) THEN
          RAISE EXCEPTION 'attention policy rejected: class % notify.channels are % (all but in_app SYNTHETIC — local sinks); % needs a delivery provider (owner decision D6)', c.key,
            array_to_string(executive.attention_delivery_channels(), ', '),
            (SELECT string_agg(coalesce(e #>> '{}', e::text), ', ') FROM jsonb_array_elements(v -> 'channels') e WHERE jsonb_typeof(e) <> 'string' OR NOT ((e #>> '{}') = ANY (executive.attention_delivery_channels()))) USING ERRCODE = '22023';
        END IF;
        IF (SELECT count(*) FROM jsonb_array_elements(v -> 'channels')) <> (SELECT count(DISTINCT e #>> '{}') FROM jsonb_array_elements(v -> 'channels') e) THEN
          RAISE EXCEPTION 'attention policy rejected: class % notify.channels names a channel twice', c.key USING ERRCODE = '22023';
        END IF;
        IF v ? 'max_attempts' AND (jsonb_typeof(v -> 'max_attempts') <> 'number' OR (v ->> 'max_attempts')::numeric NOT IN (1, 2, 3, 4, 5)) THEN
          RAISE EXCEPTION 'attention policy rejected: class % notify.max_attempts is 1..5', c.key USING ERRCODE = '22023';
        END IF;
      ELSE
        RAISE EXCEPTION 'attention policy rejected: class % notify is in_app or {channels, max_attempts}', c.key USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;
  -- B24 (0086 §0): overload is the legacy {max_open_per_role} (stored versions are immutable) or the enforced
  -- {max_open_per_owner, window_hours, exempt_min_consequence} (PR-44-005: a C3/C4 item is never deprioritized for overload)
  IF p_rules ? 'overload' THEN
    v := p_rules -> 'overload';
    IF jsonb_typeof(v) <> 'object' THEN RAISE EXCEPTION 'attention policy rejected: overload is {max_open_per_role ≥ 1}' USING ERRCODE = '22023'; END IF;
    FOR k IN SELECT jsonb_object_keys(v) LOOP
      IF k NOT IN ('max_open_per_role', 'max_open_per_owner', 'window_hours', 'exempt_min_consequence') THEN
        RAISE EXCEPTION 'attention policy rejected: overload carries the unknown key % (max_open_per_owner, window_hours, exempt_min_consequence; or the legacy max_open_per_role)', k USING ERRCODE = '22023';
      END IF;
    END LOOP;
    IF v ? 'max_open_per_role' AND (jsonb_typeof(v -> 'max_open_per_role') <> 'number' OR (v ->> 'max_open_per_role')::numeric < 1) THEN
      RAISE EXCEPTION 'attention policy rejected: overload is {max_open_per_role ≥ 1}' USING ERRCODE = '22023';
    END IF;
    IF NOT (v ? 'max_open_per_role') AND NOT (v ? 'max_open_per_owner') THEN
      RAISE EXCEPTION 'attention policy rejected: overload is {max_open_per_role ≥ 1}' USING ERRCODE = '22023';
    END IF;
    IF v ? 'max_open_per_owner' AND (jsonb_typeof(v -> 'max_open_per_owner') <> 'number' OR (v ->> 'max_open_per_owner')::numeric < 1 OR (v ->> 'max_open_per_owner')::numeric <> trunc((v ->> 'max_open_per_owner')::numeric)) THEN
      RAISE EXCEPTION 'attention policy rejected: overload.max_open_per_owner is a whole number ≥ 1' USING ERRCODE = '22023';
    END IF;
    IF v ? 'window_hours' AND (jsonb_typeof(v -> 'window_hours') <> 'number' OR (v ->> 'window_hours')::numeric < 1 OR (v ->> 'window_hours')::numeric > 720) THEN
      RAISE EXCEPTION 'attention policy rejected: overload.window_hours is in [1, 720]' USING ERRCODE = '22023';
    END IF;
    IF v ? 'exempt_min_consequence' AND coalesce(v ->> 'exempt_min_consequence', '') NOT IN ('C1', 'C2', 'C3', 'C4') THEN
      RAISE EXCEPTION 'attention policy rejected: overload.exempt_min_consequence is C1..C4 (C3 and C4 items are never deprioritized for overload whatever it says)' USING ERRCODE = '22023';
    END IF;
  END IF;
  -- B36 (0094 §A3; PR-44-005): THE QUEUE'S GOVERNANCE — the ONE change to 0090 §A1 (line 519): governance is {fairness_floor in [0, 1],
  -- staleness_ceiling_hours in [1, 8760]}; the queue evaluation HOLDS the queue and routes it to the domain's decision authority when the
  -- fairness measure falls below the floor or the staleness measure rises above the ceiling (executive.hold_queue).
  IF p_rules ? 'governance' THEN
    v := p_rules -> 'governance';
    IF jsonb_typeof(v) <> 'object' THEN RAISE EXCEPTION 'attention policy rejected: governance is {fairness_floor, staleness_ceiling_hours}' USING ERRCODE = '22023'; END IF;
    FOR k IN SELECT jsonb_object_keys(v) LOOP
      IF k NOT IN ('fairness_floor', 'staleness_ceiling_hours') THEN RAISE EXCEPTION 'attention policy rejected: governance carries the unknown key % (fairness_floor, staleness_ceiling_hours)', k USING ERRCODE = '22023'; END IF;
    END LOOP;
    IF NOT (v ? 'fairness_floor') OR NOT (v ? 'staleness_ceiling_hours') THEN RAISE EXCEPTION 'attention policy rejected: governance names both fairness_floor and staleness_ceiling_hours' USING ERRCODE = '22023'; END IF;
    IF jsonb_typeof(v -> 'fairness_floor') <> 'number' OR (v ->> 'fairness_floor')::numeric < 0 OR (v ->> 'fairness_floor')::numeric > 1 THEN
      RAISE EXCEPTION 'attention policy rejected: governance.fairness_floor is a number in [0, 1] (1 − the ranking-fairness disparity, at or above it)' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(v -> 'staleness_ceiling_hours') <> 'number' OR (v ->> 'staleness_ceiling_hours')::numeric < 1 OR (v ->> 'staleness_ceiling_hours')::numeric > 8760 THEN
      RAISE EXCEPTION 'attention policy rejected: governance.staleness_ceiling_hours is a number in [1, 8760] (the oldest live item''s hours since its last evaluation, at or below it)' USING ERRCODE = '22023';
    END IF;
  END IF;
END $$;
REVOKE ALL ON FUNCTION executive.validate_attention_rules(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.validate_attention_rules(jsonb) TO eye_commit;

-- THE HOLDS: one held hold per domain; held → released once (the executive, a reason); the governance item bound after the item is routed.
CREATE TABLE executive.attention_queue_holds (
  hold_id             uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  evaluation_id       uuid NOT NULL REFERENCES executive.attention_queue_evaluations (evaluation_id),
  cause               text NOT NULL CHECK (cause IN ('fairness_below_floor', 'staleness_above_ceiling')),
  measure             numeric NOT NULL,
  threshold           numeric NOT NULL,
  measures            jsonb NOT NULL CHECK (jsonb_typeof(measures) = 'object'),
  governance          jsonb NOT NULL CHECK (jsonb_typeof(governance) = 'object'),
  policy_version      int NOT NULL,
  context_digest      text,
  state               text NOT NULL DEFAULT 'held' CHECK (state IN ('held', 'released')),
  held_by             uuid NOT NULL,
  held_at             timestamptz NOT NULL DEFAULT clock_timestamp(),
  governance_item_id  uuid REFERENCES executive.attention_items (item_id),
  released_by         uuid,
  released_at         timestamptz,
  release_reason      text,
  correlation_id      uuid NOT NULL,
  CONSTRAINT xqh_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xqh_released CHECK ((state = 'released') = (released_at IS NOT NULL) AND (released_at IS NULL) = (released_by IS NULL) AND (released_at IS NULL) = (release_reason IS NULL))
);
CREATE UNIQUE INDEX xqh_one_held ON executive.attention_queue_holds (tenant_id, domain_id) WHERE state = 'held';
CREATE INDEX xqh_domain ON executive.attention_queue_holds (tenant_id, domain_id, held_at);
CREATE OR REPLACE FUNCTION executive.attention_queue_holds_transition() RETURNS trigger
SET search_path = executive, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'attention queue holds are append-only: DELETE prohibited' USING ERRCODE = '2F002'; END IF;
  IF OLD.state = 'held' AND NEW.state = 'held' AND OLD.governance_item_id IS NULL AND NEW.governance_item_id IS NOT NULL
     AND (to_jsonb(NEW) - 'governance_item_id') = (to_jsonb(OLD) - 'governance_item_id') THEN RETURN NEW; END IF;
  IF OLD.state = 'held' AND NEW.state = 'released' AND NEW.released_at IS NOT NULL
     AND (to_jsonb(NEW) - ARRAY['state', 'released_by', 'released_at', 'release_reason']) = (to_jsonb(OLD) - ARRAY['state', 'released_by', 'released_at', 'release_reason']) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'attention queue hold % is % and moves once (held → released)', OLD.hold_id, OLD.state USING ERRCODE = '2F002';
END $$ LANGUAGE plpgsql;
CREATE TRIGGER xqh_transition BEFORE UPDATE OR DELETE ON executive.attention_queue_holds FOR EACH ROW EXECUTE FUNCTION executive.attention_queue_holds_transition();
COMMENT ON TABLE executive.attention_queue_holds IS 'B36 (0094 §A3; PR-44-005): the queue HELD by its evaluation — the fairness measure below the policy''s floor or the staleness measure above its ceiling — with the measure, the threshold, the measures, the context digest the evaluation ran under and the governance item routed to the executive; released by the executive with a reason; a held queue serves its items read-only';

/* The active hold of a domain (NULL when none) — an invoker read under the caller's RLS. */
CREATE OR REPLACE FUNCTION executive.attention_queue_hold_active(p_tenant uuid, p_domain uuid) RETURNS uuid
LANGUAGE sql STABLE SET search_path = executive, pg_catalog, pg_temp AS $$
  SELECT h.hold_id FROM executive.attention_queue_holds h WHERE h.tenant_id = p_tenant AND h.domain_id = p_domain AND h.state = 'held' LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION executive.attention_queue_hold_active(uuid, uuid) TO eye_app, eye_commit;

/* THE GOVERNANCE MEASURES over an evaluation's measures: fairness = 1 − the ranking-fairness disparity (abstained when the evaluation's is);
   staleness = the oldest LIVE item's hours since its last (re)evaluation (abstained when no item is live). Reported whole. */
CREATE OR REPLACE FUNCTION executive.attention_queue_governance_measures(p_tenant uuid, p_domain uuid, p_measures jsonb) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = executive, pg_catalog, pg_temp AS $$
DECLARE v_disp jsonb := p_measures #> '{ranking_fairness,disparity}'; v_fair numeric; v_stale numeric; v_open int; v_oldest uuid;
BEGIN
  IF v_disp IS NOT NULL AND NOT coalesce((v_disp ->> 'abstained')::boolean, true) THEN v_fair := 1 - (v_disp ->> 'value')::numeric; END IF;
  SELECT count(*), max(q.hours), (array_agg(q.item_id ORDER BY q.hours DESC))[1] INTO v_open, v_stale, v_oldest
    FROM (SELECT i.item_id, extract(epoch FROM (clock_timestamp() - coalesce((SELECT max(e.occurred_at) FROM executive.attention_item_events e WHERE e.item_id = i.item_id AND e.event = 'item.reevaluated'), i.created_at))) / 3600 AS hours
            FROM executive.attention_items i WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.state IN ('open', 'escalated', 'unrouted', 'acknowledged')) q;
  RETURN jsonb_build_object(
    'fairness', jsonb_build_object('value', v_fair, 'abstained', v_fair IS NULL, 'disparity', v_disp,
                                   'basis', '1 − the evaluation''s ranking-fairness disparity (0090 §A5; abstained when the disparity abstains — fewer than two classes at min_sample)'),
    'staleness_hours', jsonb_build_object('value', CASE WHEN v_stale IS NULL THEN NULL ELSE round(v_stale::numeric, 3) END, 'abstained', v_stale IS NULL, 'live_items', v_open, 'oldest_item', v_oldest,
                                          'basis', 'the oldest live item''s hours since its last evaluation (its routing, or the latest item.reevaluated); abstained when no item is live'));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.attention_queue_governance_measures(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.attention_queue_governance_measures(uuid, uuid, jsonb) TO eye_app, eye_commit;

-- THE ROUTE TO AUTHORITY (under the evaluation's action, called by hold_queue): a queue.governance item for the domain's decision authority
-- (the executive) — material by construction (the queue's governance is never below threshold), consequence C3, due in 24 hours, unrouted
-- when nobody holds executive.
CREATE OR REPLACE FUNCTION executive.route_queue_to_authority(p_item_id uuid, p_tenant uuid, p_domain uuid, p_hold_id uuid, p_actor uuid, p_correlation uuid) RETURNS uuid
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE h executive.attention_queue_holds%ROWTYPE; v_state text; v_due timestamptz := clock_timestamp() + interval '24 hours'; v_reason text; v_eval jsonb; v_pol uuid; v_pv int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.queue.evaluate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO h FROM executive.attention_queue_holds x WHERE x.hold_id = p_hold_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'queue hold rejected (unknown_hold): hold % is not a hold of this domain', p_hold_id USING ERRCODE = '23503'; END IF;
  SELECT policy_id, version INTO v_pol, v_pv FROM executive.attention_policies a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.state = 'active';
  v_reason := CASE h.cause WHEN 'fairness_below_floor' THEN format('the ranking fairness %s fell below the policy''s floor %s', h.measure, h.threshold)
                          ELSE format('the queue''s staleness %s h rose above the policy''s ceiling %s h', h.measure, h.threshold) END;
  v_state := CASE WHEN executive.role_holders(p_tenant, p_domain, ARRAY['executive']) > 0 THEN 'open' ELSE 'unrouted' END;
  v_eval := jsonb_build_object('outcome', 'material', 'reasons', jsonb_build_array(v_reason, 'the queue is held until the executive releases it; its items are served read-only'),
                               'dimensions', jsonb_build_object('consequence', 'C3', 'confidence', 1, 'hours_to_window', 24), 'thresholds', NULL, 'policy_version', v_pv,
                               'rank', jsonb_build_object('explanation', 'consequence C3, the window in 24 h: the queue''s own governance ranks before its items'),
                               'governance', jsonb_build_object('hold_id', p_hold_id, 'cause', h.cause, 'measure', h.measure, 'threshold', h.threshold, 'evaluation_id', h.evaluation_id));
  INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state,
                                         owner_principal_id, route_roles, policy_id, policy_version, evaluation, details, due_at, escalations, correlation_id)
  VALUES (p_item_id, 'DOMAIN', p_tenant, p_domain, 'queue.governance', 'queue', p_hold_id, p_hold_id, 'AttentionQueueHeld',
          left(format('Queue held: %s', v_reason), 512), 'material', v_state, NULL, ARRAY['executive'], v_pol, v_pv, v_eval,
          jsonb_build_object('hold_id', p_hold_id, 'cause', h.cause, 'measure', h.measure, 'threshold', h.threshold, 'evaluation_id', h.evaluation_id, 'release', 'executive.attention.queue.release'),
          v_due, 0, p_correlation);
  PERFORM executive.attention_event(p_item_id, p_tenant, p_domain, CASE v_state WHEN 'open' THEN 'item.routed' ELSE 'item.unrouted' END, p_actor,
            jsonb_build_object('outcome', 'material', 'reasons', v_eval -> 'reasons', 'policy_version', v_pv, 'owner', NULL, 'route_roles', to_jsonb(ARRAY['executive']), 'due_at', v_due,
                               'cause_event_id', p_hold_id, 'cause_event_type', 'AttentionQueueHeld', 'unrouted', v_state = 'unrouted', 'hold_id', p_hold_id), p_correlation);
  RETURN p_item_id;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.route_queue_to_authority(uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.route_queue_to_authority(uuid,uuid,uuid,uuid,uuid,uuid) TO eye_commit;

-- THE HOLD (executive.attention.queue.evaluate — the evaluation's own action; the route calls it right after evaluate_attention_queue in the
-- same write): the evaluation's measures against the policy's governance; below the floor / above the ceiling → held and routed; nothing
-- when the policy carries no governance (reported, gating nothing — 0090's behaviour kept) or a hold is already active.
CREATE OR REPLACE FUNCTION executive.hold_queue(p_hold_id uuid, p_tenant uuid, p_domain uuid, p_evaluation_id uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE ev executive.attention_queue_evaluations%ROWTYPE; pol executive.attention_policies%ROWTYPE; g jsonb; m jsonb; v_cause text; v_measure numeric; v_threshold numeric; v_active uuid; v_item uuid; v_ctx text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.queue.evaluate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'queue hold rejected (actor): held by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO ev FROM executive.attention_queue_evaluations e WHERE e.evaluation_id = p_evaluation_id AND e.tenant_id = p_tenant AND e.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'queue hold rejected (unknown_evaluation): evaluation % is not an evaluation of this domain', p_evaluation_id USING ERRCODE = '23503'; END IF;
  SELECT * INTO pol FROM executive.attention_policies a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.state = 'active';
  g := pol.rules -> 'governance';
  m := executive.attention_queue_governance_measures(p_tenant, p_domain, ev.measures);
  v_ctx := executive.current_context(p_actor) ->> 'digest';
  IF g IS NULL THEN
    RETURN jsonb_build_object('held', false, 'reason', 'the active policy carries no governance {fairness_floor, staleness_ceiling_hours}: the measures are reported, gating nothing',
                              'measures', m, 'policy_version', pol.version, 'context_digest', v_ctx, 'evaluation_id', p_evaluation_id);
  END IF;
  v_active := executive.attention_queue_hold_active(p_tenant, p_domain);
  IF v_active IS NOT NULL THEN
    RETURN jsonb_build_object('held', false, 'reason', 'the queue is already held', 'hold_id', v_active, 'measures', m, 'governance', g, 'policy_version', pol.version, 'context_digest', v_ctx, 'evaluation_id', p_evaluation_id);
  END IF;
  IF (m #>> '{fairness,value}') IS NOT NULL AND (m #>> '{fairness,value}')::numeric < (g ->> 'fairness_floor')::numeric THEN
    v_cause := 'fairness_below_floor'; v_measure := (m #>> '{fairness,value}')::numeric; v_threshold := (g ->> 'fairness_floor')::numeric;
  ELSIF (m #>> '{staleness_hours,value}') IS NOT NULL AND (m #>> '{staleness_hours,value}')::numeric > (g ->> 'staleness_ceiling_hours')::numeric THEN
    v_cause := 'staleness_above_ceiling'; v_measure := (m #>> '{staleness_hours,value}')::numeric; v_threshold := (g ->> 'staleness_ceiling_hours')::numeric;
  END IF;
  IF v_cause IS NULL THEN
    RETURN jsonb_build_object('held', false, 'reason', 'within policy: the fairness at or above the floor (or abstained) and the staleness at or below the ceiling (or abstained)',
                              'measures', m, 'governance', g, 'policy_version', pol.version, 'context_digest', v_ctx, 'evaluation_id', p_evaluation_id);
  END IF;
  INSERT INTO executive.attention_queue_holds (hold_id, scope, tenant_id, domain_id, evaluation_id, cause, measure, threshold, measures, governance, policy_version, context_digest, held_by, correlation_id)
  VALUES (p_hold_id, 'DOMAIN', p_tenant, p_domain, p_evaluation_id, v_cause, v_measure, v_threshold, m, g, pol.version, v_ctx, p_actor, p_correlation);
  v_item := executive.route_queue_to_authority(gen_random_uuid(), p_tenant, p_domain, p_hold_id, p_actor, p_correlation);
  UPDATE executive.attention_queue_holds SET governance_item_id = v_item WHERE hold_id = p_hold_id;
  RETURN jsonb_build_object('held', true, 'hold_id', p_hold_id, 'cause', v_cause, 'measure', v_measure, 'threshold', v_threshold, 'measures', m, 'governance', g,
                            'policy_version', pol.version, 'governance_item_id', v_item, 'context_digest', v_ctx, 'evaluation_id', p_evaluation_id, 'held_by', p_actor,
                            'read_only', 'the queue serves its items read-only until the executive releases the hold (executive.attention.queue.release)');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.hold_queue(uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.hold_queue(uuid,uuid,uuid,uuid,uuid,uuid) TO eye_commit;

-- THE RECOVERY ROUTES LEDGER (§A4's table, declared here because the release records into it): every run of a route with before / after.
CREATE TABLE executive.attention_recovery_routes (
  route_id        uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  degraded_state  text NOT NULL CHECK (degraded_state IN ('delivery_sink_down', 'tick_stalled', 'policy_invalid', 'evaluation_stale', 'hold')),
  route           text NOT NULL CHECK (route IN ('re-deliver', 're-tick', 're-validate', 're-evaluate', 'release')),
  before_state    jsonb NOT NULL CHECK (jsonb_typeof(before_state) = 'object'),
  after_state     jsonb NOT NULL CHECK (jsonb_typeof(after_state) = 'object'),
  outcome         text NOT NULL CHECK (outcome IN ('recovered', 'requeued', 'exhausted', 'unchanged', 'still_degraded')),
  note            text,
  run_by          uuid NOT NULL,
  run_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT xrr_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX xrr_domain ON executive.attention_recovery_routes (tenant_id, domain_id, degraded_state, run_at);
CREATE TRIGGER xrr_append_only BEFORE UPDATE OR DELETE ON executive.attention_recovery_routes FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE executive.attention_recovery_routes IS 'B36 (0094 §A4; UX-44-005): the runs of the queue''s recovery routes — one per degraded state (re-deliver, re-tick, re-validate, re-evaluate, release) with the state before and after and the outcome; append-only';

-- THE RELEASE (executive.attention.queue.release; human-gated): the executive (or a domain / platform administrator), a reason; held →
-- released; recorded as the hold state's recovery route.
CREATE OR REPLACE FUNCTION executive.release_queue_hold(p_hold_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE h executive.attention_queue_holds%ROWTYPE; v_at timestamptz := clock_timestamp(); v_route uuid := gen_random_uuid();
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.queue.release']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'queue hold rejected (actor): released by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['executive', 'domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'queue hold rejected (authority): a hold is released by a named human holding executive, domain_admin or platform_admin' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO h FROM executive.attention_queue_holds x WHERE x.hold_id = p_hold_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'queue hold rejected (unknown_hold): hold % is not a hold of this domain', p_hold_id USING ERRCODE = '23503'; END IF;
  IF h.state <> 'held' THEN RAISE EXCEPTION 'queue hold rejected (state): hold % was released by % at %', p_hold_id, h.released_by, h.released_at USING ERRCODE = '22023'; END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'queue hold rejected (reason): a release says why (8+ characters)' USING ERRCODE = '22023'; END IF;
  UPDATE executive.attention_queue_holds SET state = 'released', released_by = p_actor, released_at = v_at, release_reason = left(btrim(p_reason), 1000) WHERE hold_id = p_hold_id RETURNING * INTO h;
  INSERT INTO executive.attention_recovery_routes (route_id, scope, tenant_id, domain_id, degraded_state, route, before_state, after_state, outcome, note, run_by, run_at, correlation_id)
  VALUES (v_route, 'DOMAIN', p_tenant, p_domain, 'hold', 'release',
          jsonb_build_object('hold_id', h.hold_id, 'state', 'held', 'cause', h.cause, 'measure', h.measure, 'threshold', h.threshold, 'held_at', h.held_at, 'held_by', h.held_by),
          jsonb_build_object('hold_id', h.hold_id, 'state', 'released', 'released_at', v_at, 'released_by', p_actor), 'recovered', left(btrim(p_reason), 1000), p_actor, v_at, p_correlation);
  RETURN jsonb_build_object('hold_id', h.hold_id, 'state', h.state, 'cause', h.cause, 'measure', h.measure, 'threshold', h.threshold, 'released_by', p_actor, 'released_at', v_at,
                            'release_reason', h.release_reason, 'governance_item_id', h.governance_item_id, 'recovery_route_id', v_route);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.release_queue_hold(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.release_queue_hold(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

-- THE READ-ONLY GUARD: while a hold is active, every HUMAN transition on an item of the domain is refused at the item log (acknowledge,
-- suppress, close, delegate, dispose, act, accept a priority); the tick's own events (routing, escalation, re-evaluation, lapses) and a
-- resumed settle (the record of a committed action) pass.
CREATE OR REPLACE FUNCTION executive.attention_queue_hold_guard() RETURNS trigger
SET search_path = executive, pg_catalog, pg_temp AS $$
DECLARE h executive.attention_queue_holds%ROWTYPE;
BEGIN
  IF NEW.event NOT IN ('item.acknowledged', 'item.suppressed', 'item.closed', 'item.delegated', 'item.delegation_ended', 'item.suppression_requested', 'item.suppression_decided',
                       'item.disposition', 'item.priority_accepted', 'item.acted', 'item.act_refused') THEN RETURN NEW; END IF;
  IF NEW.event = 'item.acted' AND coalesce((NEW.details ->> 'resumed')::boolean, false) THEN RETURN NEW; END IF;
  SELECT * INTO h FROM executive.attention_queue_holds x WHERE x.tenant_id = NEW.tenant_id AND x.domain_id = NEW.domain_id AND x.state = 'held';
  IF FOUND THEN
    RAISE EXCEPTION 'queue transition rejected (held): the queue is held (hold %, %) since %; its items are served read-only until the executive releases the hold (executive.attention.queue.release)',
      h.hold_id, h.cause, h.held_at USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER xae_hold_guard BEFORE INSERT ON executive.attention_item_events FOR EACH ROW EXECUTE FUNCTION executive.attention_queue_hold_guard();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §A4 THE RECOVERY ROUTES (o3; UX-44-005)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
/* THE DEGRADED STATES, each detected from the ledgers with what it means, its route and the last run of that route:
     delivery_sink_down — a synthetic channel's delivery abandoned in the last 24 hours (the sink refused every attempt)
     tick_stalled       — an active attention agent whose last tick is older than three cadences (or never ticked)
     policy_invalid     — the active policy does not pass today's validator (or none is active)
     evaluation_stale   — no queue evaluation, or the latest older than the policy's staleness ceiling (168 h when the policy names none)
     hold               — a hold is active */
/* The last run of a state's route (NULL when none). */
CREATE OR REPLACE FUNCTION executive.attention_last_recovery_route(p_tenant uuid, p_domain uuid, p_state text) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = executive, pg_catalog, pg_temp AS $$
  SELECT to_jsonb(r) - 'scope' - 'tenant_id' - 'domain_id' FROM executive.attention_recovery_routes r
   WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.degraded_state = p_state ORDER BY r.run_at DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION executive.attention_last_recovery_route(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.attention_last_recovery_route(uuid, uuid, text) TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION executive.attention_degraded_states(p_tenant uuid, p_domain uuid) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE pol executive.attention_policies%ROWTYPE; v_ab record; v_tick record; v_agent record; v_policy_bad text; v_eval record; v_ceiling numeric; v_hold executive.attention_queue_holds%ROWTYPE;
        v_now timestamptz := clock_timestamp(); v_states jsonb := '[]'::jsonb;
BEGIN
  PERFORM observation.assert_scope(p_tenant, p_domain);
  -- delivery_sink_down
  SELECT count(*) AS n, count(DISTINCT d.channel) AS channels, string_agg(DISTINCT d.channel, ', ') AS names, max(d.attempted_at) AS last_at,
         (array_agg(d.error ORDER BY d.attempted_at DESC))[1] AS last_error, count(*) FILTER (WHERE d.max_attempts >= 5) AS exhausted
    INTO v_ab FROM executive.attention_deliveries d
   WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.state = 'abandoned' AND d.channel <> 'in_app' AND d.attempted_at >= v_now - interval '24 hours'
     AND NOT EXISTS (SELECT 1 FROM executive.attention_deliveries s WHERE s.item_event_id = d.item_event_id AND s.channel = d.channel AND s.recipient_principal_id = d.recipient_principal_id AND s.attempt > d.attempt);
  v_states := v_states || jsonb_build_object('state', 'delivery_sink_down', 'active', v_ab.n > 0, 'route', 're-deliver',
    'meaning', 'a synthetic channel''s sink (email / sms / teams — local sinks; owner decision D6) refused every attempt of a delivery in the last 24 hours: the recipient was not reached on that channel (in-app placement is unaffected)',
    'detail', jsonb_build_object('abandoned', v_ab.n, 'channels', v_ab.names, 'last_attempt_at', v_ab.last_at, 'last_error', v_ab.last_error, 'exhausted', v_ab.exhausted),
    'route_does', 'the abandoned deliveries are re-queued as a further attempt (the ledger admits five; beyond it the recipient is reached in-app) and the next tick drains them',
    'last_route', executive.attention_last_recovery_route(p_tenant, p_domain, 'delivery_sink_down'));
  -- tick_stalled
  SELECT a.agent_id, a.budgets, a.created_at INTO v_agent FROM executive.agents a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.agent_kind = 'attention' AND a.status = 'active' ORDER BY a.created_at DESC LIMIT 1;
  SELECT t.recorded_at, t.cadence_seconds, t.tick_key INTO v_tick FROM executive.attention_ticks t WHERE t.tenant_id = p_tenant AND t.domain_id = p_domain ORDER BY t.recorded_at DESC LIMIT 1;
  v_states := v_states || jsonb_build_object('state', 'tick_stalled',
    'active', v_agent.agent_id IS NOT NULL AND (v_tick.recorded_at IS NULL OR v_tick.recorded_at < v_now - make_interval(secs => 3 * greatest(coalesce(v_tick.cadence_seconds, coalesce((v_agent.budgets ->> 'tick_every_seconds')::int, 60)), 60))),
    'route', 're-tick',
    'meaning', 'the attention timer has not ticked for three cadences: nothing escalates, no delivery is planned or drained, no suppression lapses until it does',
    'detail', jsonb_build_object('agent_id', v_agent.agent_id, 'last_tick_at', v_tick.recorded_at, 'cadence_seconds', coalesce(v_tick.cadence_seconds, (v_agent.budgets ->> 'tick_every_seconds')::int), 'as_of', v_now),
    'route_does', 'one tick is run now under the attention agent''s own session (the timer host''s tickNow), then the schedule is reconciled',
    'last_route', executive.attention_last_recovery_route(p_tenant, p_domain, 'tick_stalled'));
  -- policy_invalid
  SELECT * INTO pol FROM executive.attention_policies a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.state = 'active';
  IF pol.policy_id IS NULL THEN v_policy_bad := 'no active attention policy: every signal abstains (deprioritized, visible)';
  ELSE
    BEGIN PERFORM executive.validate_attention_rules(pol.rules); EXCEPTION WHEN OTHERS THEN v_policy_bad := SQLERRM; END;
  END IF;
  v_states := v_states || jsonb_build_object('state', 'policy_invalid', 'active', v_policy_bad IS NOT NULL, 'route', 're-validate',
    'meaning', 'the active policy version does not pass today''s validator (a role it names no longer exists, a class it names is gone) or none is active: new signals are judged under rules the product no longer accepts',
    'detail', jsonb_build_object('policy_version', pol.version, 'defect', v_policy_bad),
    'route_does', 'the validator is re-run on the active version and its verdict recorded; a defect is corrected by PUBLISHING the next version (the executive) — the route never rewrites a version',
    'last_route', executive.attention_last_recovery_route(p_tenant, p_domain, 'policy_invalid'));
  -- evaluation_stale
  v_ceiling := coalesce((pol.rules #>> '{governance,staleness_ceiling_hours}')::numeric, 168);
  SELECT e.evaluation_id, e.evaluated_at, e.verdict INTO v_eval FROM executive.attention_queue_evaluations e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain ORDER BY e.evaluated_at DESC LIMIT 1;
  v_states := v_states || jsonb_build_object('state', 'evaluation_stale', 'active', v_eval.evaluation_id IS NULL OR v_eval.evaluated_at < v_now - make_interval(hours => v_ceiling::int), 'route', 're-evaluate',
    'meaning', format('the queue has not been evaluated within the staleness ceiling (%s h%s): its precision, recall, fairness and severe-item visibility are unmeasured for the period', v_ceiling, CASE WHEN pol.rules ? 'governance' THEN ', the policy''s' ELSE ', the default' END),
    'detail', jsonb_build_object('last_evaluation_id', v_eval.evaluation_id, 'last_evaluated_at', v_eval.evaluated_at, 'last_verdict', v_eval.verdict, 'ceiling_hours', v_ceiling),
    'route_does', 'the queue is evaluated now by a named human (executive, domain_admin or platform_admin) over the default window; a hold follows when the governance says so',
    'last_route', executive.attention_last_recovery_route(p_tenant, p_domain, 'evaluation_stale'));
  -- hold
  SELECT * INTO v_hold FROM executive.attention_queue_holds h WHERE h.tenant_id = p_tenant AND h.domain_id = p_domain AND h.state = 'held';
  v_states := v_states || jsonb_build_object('state', 'hold', 'active', v_hold.hold_id IS NOT NULL, 'route', 'release',
    'meaning', 'the queue is held by its evaluation (fairness below the floor or staleness above the ceiling): its items are served read-only; the executive holds the governance item',
    'detail', CASE WHEN v_hold.hold_id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('hold_id', v_hold.hold_id, 'cause', v_hold.cause, 'measure', v_hold.measure, 'threshold', v_hold.threshold, 'held_at', v_hold.held_at, 'governance_item_id', v_hold.governance_item_id) END,
    'route_does', 'the executive releases the hold with a reason (executive.attention.queue.release); the items serve their transitions again',
    'last_route', executive.attention_last_recovery_route(p_tenant, p_domain, 'hold'));
  RETURN jsonb_build_object('as_of', v_now, 'states', v_states, 'degraded', (SELECT count(*) FROM jsonb_array_elements(v_states) s WHERE (s ->> 'active')::boolean));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.attention_degraded_states(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.attention_degraded_states(uuid, uuid) TO eye_app, eye_commit;

/* THE AUTHORITY PROBE (executive.attention.queue.recover): the same checks recover_queue makes, callable as the run OPENS — before the route's
   mechanics (a tick under the agent's session, an evaluation under its own action) run for a person the port would refuse. */
CREATE OR REPLACE FUNCTION executive.assert_recovery_authority(p_tenant uuid, p_domain uuid, p_actor uuid) RETURNS void
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.queue.recover']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'queue recovery rejected (actor): run by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['executive', 'executive_operator', 'domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'queue recovery rejected (authority): a recovery route is run by a named human holding executive, executive_operator, domain_admin or platform_admin' USING ERRCODE = '42501';
  END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.assert_recovery_authority(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.assert_recovery_authority(uuid, uuid, uuid) TO eye_commit;

-- THE RECOVERY (executive.attention.queue.recover; human-gated): the executive, the executive operator or an administrator runs a state's
-- route. The database side of re-deliver is here (the abandoned deliveries re-queued); re-tick, re-validate and re-evaluate run their
-- mechanics as their own governed acts BEFORE this record (the tick under the agent's session, the validator, the evaluation) and this port
-- reads the state after; the hold's route is the release (its own action). Every run recorded with before / after / outcome.
CREATE OR REPLACE FUNCTION executive.recover_queue(p_route_id uuid, p_tenant uuid, p_domain uuid, p_state text, p_before jsonb, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_route text; v_after jsonb; v_outcome text; v_states jsonb; v_st jsonb; d record; v_requeued int := 0; v_exhausted int := 0; v_ids jsonb := '[]'::jsonb; v_new uuid; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.queue.recover']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'queue recovery rejected (actor): run by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['executive', 'executive_operator', 'domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'queue recovery rejected (authority): a recovery route is run by a named human holding executive, executive_operator, domain_admin or platform_admin' USING ERRCODE = '42501';
  END IF;
  v_route := CASE p_state WHEN 'delivery_sink_down' THEN 're-deliver' WHEN 'tick_stalled' THEN 're-tick' WHEN 'policy_invalid' THEN 're-validate' WHEN 'evaluation_stale' THEN 're-evaluate' WHEN 'hold' THEN 'release' END;
  IF v_route IS NULL THEN RAISE EXCEPTION 'queue recovery rejected (vocabulary): % is not a degraded state (delivery_sink_down, tick_stalled, policy_invalid, evaluation_stale, hold)', coalesce(p_state, '<none>') USING ERRCODE = '22023'; END IF;
  IF p_state = 'hold' THEN RAISE EXCEPTION 'queue recovery rejected (route): the hold''s route is the executive''s release (executive.attention.queue.release), recorded there' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(p_before) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'queue recovery rejected (before): the state before the route is an object (the degraded state as read before it ran)' USING ERRCODE = '22023'; END IF;
  IF p_state = 'delivery_sink_down' THEN
    FOR d IN
      SELECT x.* FROM executive.attention_deliveries x
       WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'abandoned' AND x.channel <> 'in_app' AND x.attempted_at >= v_at - interval '24 hours'
         AND NOT EXISTS (SELECT 1 FROM executive.attention_deliveries s WHERE s.item_event_id = x.item_event_id AND s.channel = x.channel AND s.recipient_principal_id = x.recipient_principal_id AND s.attempt > x.attempt)
       ORDER BY x.attempted_at, x.delivery_id FOR UPDATE
    LOOP
      IF d.max_attempts >= 5 THEN v_exhausted := v_exhausted + 1; CONTINUE; END IF;
      v_new := gen_random_uuid();
      INSERT INTO executive.attention_deliveries (delivery_id, scope, tenant_id, domain_id, item_id, item_event_id, item_event, channel, recipient_principal_id, attempt, max_attempts, state, next_attempt_at, policy_version, synthetic_state, correlation_id)
      VALUES (v_new, 'DOMAIN', p_tenant, p_domain, d.item_id, d.item_event_id, d.item_event, d.channel, d.recipient_principal_id, d.max_attempts + 1, d.max_attempts + 1, 'queued', v_at, d.policy_version, d.synthetic_state, p_correlation);
      PERFORM executive.attention_delivery_event(v_new, d.item_id, d.item_event_id, p_tenant, p_domain, 'delivery.retry_scheduled', p_actor,
                jsonb_build_object('after', d.delivery_id, 'attempt', d.max_attempts + 1, 'max_attempts', d.max_attempts + 1, 'next_attempt_at', v_at, 'recovery_route_id', p_route_id, 'route', 're-deliver'), p_correlation);
      v_requeued := v_requeued + 1; v_ids := v_ids || to_jsonb(v_new);
    END LOOP;
    v_after := jsonb_build_object('requeued', v_requeued, 'exhausted', v_exhausted, 'delivery_ids', v_ids, 'drained_by', 'the next attention tick (step deliveries)');
    v_outcome := CASE WHEN v_requeued > 0 THEN 'requeued' WHEN v_exhausted > 0 THEN 'exhausted' ELSE 'unchanged' END;
  ELSE
    v_states := executive.attention_degraded_states(p_tenant, p_domain);
    SELECT s INTO v_st FROM jsonb_array_elements(v_states -> 'states') s WHERE s ->> 'state' = p_state;
    v_after := jsonb_build_object('active', (v_st ->> 'active')::boolean, 'detail', v_st -> 'detail', 'as_of', v_states -> 'as_of');
    -- recovered when the state was degraded before the route, or when the LAST run of this state's route left it degraded (a correction
    -- made between the runs — a published policy version — is what the re-run records); unchanged when it was nominal throughout
    v_outcome := CASE WHEN (v_st ->> 'active')::boolean THEN 'still_degraded'
                      WHEN coalesce((p_before ->> 'active')::boolean, false) OR coalesce((executive.attention_last_recovery_route(p_tenant, p_domain, p_state) ->> 'outcome') = 'still_degraded', false) THEN 'recovered'
                      ELSE 'unchanged' END;
  END IF;
  INSERT INTO executive.attention_recovery_routes (route_id, scope, tenant_id, domain_id, degraded_state, route, before_state, after_state, outcome, note, run_by, run_at, correlation_id)
  VALUES (p_route_id, 'DOMAIN', p_tenant, p_domain, p_state, v_route, p_before, v_after, v_outcome, nullif(left(btrim(p_note), 1000), ''), p_actor, v_at, p_correlation);
  RETURN jsonb_build_object('route_id', p_route_id, 'degraded_state', p_state, 'route', v_route, 'before', p_before, 'after', v_after, 'outcome', v_outcome, 'run_by', p_actor, 'run_at', v_at);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.recover_queue(uuid,uuid,uuid,text,jsonb,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.recover_queue(uuid,uuid,uuid,text,jsonb,text,uuid,uuid) TO eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §A5 THE CONTEXT ON THE QUEUE (o4; UX-44-002)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION executive.horizon_hours(p text) RETURNS numeric
LANGUAGE sql IMMUTABLE AS $$ SELECT CASE p WHEN '30d' THEN 720 WHEN '90d' THEN 2160 WHEN '12m' THEN 8760 WHEN '36m' THEN 26280 END::numeric $$;
GRANT EXECUTE ON FUNCTION executive.horizon_hours(text) TO eye_app, eye_commit;

/* AN ITEM'S OBJECTIVES — the strategy objectives its subject rests on, read from what the records say: objective ids the item's details or
   dimensions carry; an exposure's objectives (prediction.exposure_objectives); a package's named objectives; a strategy object itself and
   what it depends on; the queue's governance item serves every objective. Empty = UNKNOWN linkage (the item is served and says so). */
CREATE OR REPLACE FUNCTION executive.attention_item_objectives(x executive.attention_items) RETURNS uuid[]
STABLE SECURITY DEFINER SET search_path = executive, prediction, decision, graph, pg_catalog, pg_temp AS $$
  SELECT coalesce(array_agg(DISTINCT o) FILTER (WHERE o IS NOT NULL), '{}'::uuid[]) FROM (
    SELECT (e #>> '{}')::uuid AS o FROM jsonb_array_elements(CASE WHEN jsonb_typeof(x.details -> 'objective_ids') = 'array' THEN x.details -> 'objective_ids' ELSE '[]'::jsonb END) e WHERE (e #>> '{}') ~ '^[0-9a-f-]{36}$'
    UNION ALL
    SELECT (e #>> '{}')::uuid FROM jsonb_array_elements(CASE WHEN jsonb_typeof(x.evaluation #> '{dimensions,objective_ids}') = 'array' THEN x.evaluation #> '{dimensions,objective_ids}' ELSE '[]'::jsonb END) e WHERE (e #>> '{}') ~ '^[0-9a-f-]{36}$'
    UNION ALL
    SELECT unnest(prediction.exposure_objectives(x.subject_id)) WHERE x.subject_kind = 'exposure'
    UNION ALL
    SELECT (e #>> '{}')::uuid FROM decision.package_versions v, jsonb_array_elements(v.objectives) e
     WHERE x.subject_kind = 'package' AND v.package_id = x.subject_id AND v.version = (SELECT max(w.version) FROM decision.package_versions w WHERE w.package_id = x.subject_id) AND jsonb_typeof(e) = 'string' AND (e #>> '{}') ~ '^[0-9a-f-]{36}$'
    UNION ALL
    SELECT s.strategy_object_id FROM graph.strategy_current s WHERE x.subject_kind = 'strategy_object' AND s.strategy_object_id = x.subject_id AND s.object_type = 'OBJ'
    UNION ALL
    SELECT g.depends_on_id FROM graph.dependencies g WHERE x.subject_kind = 'strategy_object' AND g.dependent_object_id = x.subject_id AND g.depends_on_kind = 'strategy' AND g.state = 'active'
  ) q
$$ LANGUAGE sql;
REVOKE ALL ON FUNCTION executive.attention_item_objectives(executive.attention_items) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.attention_item_objectives(executive.attention_items) TO eye_app, eye_commit;

/* THE CONTEXT ON THE QUEUE: the principal's executive context (§0 executive.current_context) or the reader's default (the whole domain,
   horizon 90d, effective now), the policy in force (version, digest, governance) and the active hold. */
CREATE OR REPLACE FUNCTION executive.queue_context(p_principal uuid, p_tenant uuid, p_domain uuid) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c jsonb; pol executive.attention_policies%ROWTYPE; h executive.attention_queue_holds%ROWTYPE;
BEGIN
  PERFORM observation.assert_scope(p_tenant, p_domain);
  c := executive.current_context(p_principal);
  IF c IS NULL THEN
    c := jsonb_build_object('context_id', NULL, 'objective_id', NULL, 'horizon', '90d', 'scenario_id', NULL, 'classification', NULL, 'effective_at', NULL, 'digest', NULL, 'set_at', NULL,
                            'source', 'default', 'note', 'no executive context is set for this principal: the whole domain, horizon 90d, the reader''s own classification ceiling, effective now');
  ELSE
    c := c || jsonb_build_object('source', 'executive.contexts', 'principal_id', p_principal);
  END IF;
  SELECT * INTO pol FROM executive.attention_policies a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.state = 'active';
  SELECT * INTO h FROM executive.attention_queue_holds x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'held';
  RETURN jsonb_build_object(
    'context', c,
    'policy', CASE WHEN pol.policy_id IS NULL THEN jsonb_build_object('policy_id', NULL, 'version', NULL, 'digest', NULL, 'governance', NULL, 'note', 'no active attention policy')
                   ELSE jsonb_build_object('policy_id', pol.policy_id, 'version', pol.version, 'digest', pol.rules_digest, 'governance', pol.rules -> 'governance', 'effective_at', pol.effective_at) END,
    'hold', CASE WHEN h.hold_id IS NULL THEN NULL ELSE jsonb_build_object('hold_id', h.hold_id, 'cause', h.cause, 'measure', h.measure, 'threshold', h.threshold, 'held_at', h.held_at, 'held_by', h.held_by, 'governance_item_id', h.governance_item_id, 'read_only', true) END,
    'as_of', clock_timestamp());
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.queue_context(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.queue_context(uuid, uuid, uuid) TO eye_app, eye_commit;

/* THE QUEUE UNDER A CONTEXT: every item but the closed, ranked by executive.attention_rank_key over the dimensions it was judged on; an item
   outside the context's objective (its linkage known and not naming it), beyond the horizon (its hours to the window past the horizon's) or
   after the effective instant (created later) is FILTERED and COUNTED by reason — never silently dropped; an item whose objective linkage
   is unknown is served and marked so. The ranking names the context digest it ran under. */
CREATE OR REPLACE FUNCTION executive.attention_queue_under(p_tenant uuid, p_domain uuid, p_context jsonb, p_limit int) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_obj uuid := nullif(p_context ->> 'objective_id', '')::uuid; v_hz numeric := executive.horizon_hours(coalesce(p_context ->> 'horizon', '90d'));
        v_eff timestamptz := nullif(p_context ->> 'effective_at', '')::timestamptz; v_limit int := least(greatest(coalesce(p_limit, 200), 1), 500); v_out jsonb;
BEGIN
  PERFORM observation.assert_scope(p_tenant, p_domain);
  WITH b AS (
    SELECT i.item_id,
           jsonb_build_object('item_id', i.item_id, 'signal_class', i.signal_class, 'subject_kind', i.subject_kind, 'subject_id', i.subject_id, 'title', i.title, 'outcome', i.outcome, 'state', i.state,
                              'owner_principal_id', i.owner_principal_id, 'route_roles', to_jsonb(i.route_roles), 'policy_version', i.policy_version, 'evaluation', i.evaluation, 'details', i.details,
                              'due_at', i.due_at, 'escalations', i.escalations, 'suppressed_until', i.suppressed_until, 'acknowledged_at', i.acknowledged_at, 'acknowledged_by', i.acknowledged_by,
                              'created_at', i.created_at, 'updated_at', i.updated_at, 'objectives', to_jsonb(o.ids),
                              'priority_accepted', (SELECT jsonb_build_object('acceptance_id', q.acceptance_id, 'accepted_by', q.accepted_by, 'accepted_at', q.accepted_at, 'evaluation_digest', q.evaluation_digest)
                                                      FROM executive.attention_priority_acceptances q WHERE q.item_id = i.item_id),
                              'act_in_flight', (SELECT jsonb_build_object('act_id', a.act_id, 'state', a.state, 'action_key', a.action_key) FROM executive.attention_item_acts a WHERE a.item_id = i.item_id AND a.state IN ('launched', 'settle_failed') LIMIT 1)) AS row,
           executive.attention_rank_key(coalesce(i.evaluation -> 'dimensions', '{}'::jsonb)) AS k,
           array_remove(ARRAY[
             CASE WHEN v_obj IS NOT NULL AND i.signal_class <> 'queue.governance' AND cardinality(o.ids) > 0 AND NOT (v_obj = ANY (o.ids)) THEN 'objective' END,
             CASE WHEN (i.evaluation #>> '{dimensions,hours_to_window}') IS NOT NULL AND (i.evaluation #>> '{dimensions,hours_to_window}')::numeric > v_hz THEN 'horizon' END,
             CASE WHEN v_eff IS NOT NULL AND i.created_at > v_eff THEN 'effective_at' END], NULL) AS reasons,
           CASE WHEN i.signal_class = 'queue.governance' THEN 'every objective' WHEN cardinality(o.ids) = 0 THEN 'unknown' WHEN v_obj IS NULL THEN 'known' WHEN v_obj = ANY (o.ids) THEN 'in context' ELSE 'outside context' END AS linkage
      FROM executive.attention_items i CROSS JOIN LATERAL (SELECT executive.attention_item_objectives(i) AS ids) o
     WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.state <> 'closed'
  ), served AS (SELECT b.*, row_number() OVER (ORDER BY b.k, b.item_id) AS pos FROM b WHERE cardinality(b.reasons) = 0)
  SELECT jsonb_build_object(
    'items', (SELECT coalesce(jsonb_agg(s.row || jsonb_build_object('rank_position', s.pos, 'linkage', s.linkage) ORDER BY s.pos), '[]'::jsonb) FROM served s WHERE s.pos <= v_limit),
    'filtered', (SELECT coalesce(jsonb_agg(jsonb_build_object('item_id', b.item_id, 'title', b.row ->> 'title', 'signal_class', b.row ->> 'signal_class', 'state', b.row ->> 'state', 'filtered_by', to_jsonb(b.reasons), 'linkage', b.linkage) ORDER BY b.k, b.item_id), '[]'::jsonb)
                   FROM b WHERE cardinality(b.reasons) > 0),
    'counts', jsonb_build_object('total', (SELECT count(*) FROM b), 'served', (SELECT count(*) FROM served), 'filtered', (SELECT count(*) FROM b WHERE cardinality(b.reasons) > 0),
                                 'by', jsonb_build_object('objective', (SELECT count(*) FROM b WHERE 'objective' = ANY (b.reasons)), 'horizon', (SELECT count(*) FROM b WHERE 'horizon' = ANY (b.reasons)),
                                                          'effective_at', (SELECT count(*) FROM b WHERE 'effective_at' = ANY (b.reasons))),
                                 'linkage_unknown', (SELECT count(*) FROM b WHERE b.linkage = 'unknown')),
    'ranking', jsonb_build_object('context_digest', p_context ->> 'digest', 'method', 'executive.attention_rank_key over the dimensions each item was judged on (0086 §M2), under the context named here',
                                  'objective_id', v_obj, 'horizon', coalesce(p_context ->> 'horizon', '90d'), 'horizon_hours', v_hz, 'effective_at', v_eff, 'limit', v_limit))
    INTO v_out;
  RETURN v_out;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.attention_queue_under(uuid, uuid, jsonb, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.attention_queue_under(uuid, uuid, jsonb, int) TO eye_app, eye_commit;

/* THE QUEUE READ (/attention/queue): the context, the policy and the hold beside the items served under the principal's context. */
CREATE OR REPLACE FUNCTION executive.attention_queue_read(p_principal uuid, p_tenant uuid, p_domain uuid, p_limit int) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c jsonb := executive.queue_context(p_principal, p_tenant, p_domain);
BEGIN
  RETURN c || executive.attention_queue_under(p_tenant, p_domain, c -> 'context', p_limit);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.attention_queue_read(uuid, uuid, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.attention_queue_read(uuid, uuid, uuid, int) TO eye_app, eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §A6 FORUMS (o5; V01-T-028) — governance forums over the same memory
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
ALTER TABLE executive.rooms_current ADD COLUMN forum_context jsonb;
ALTER TABLE executive.rooms_current ADD CONSTRAINT xrm_forum_context CHECK ((kind = 'forum') = (forum_context IS NOT NULL) AND (forum_context IS NULL OR jsonb_typeof(forum_context) = 'object'));
COMMENT ON COLUMN executive.rooms_current.forum_context IS 'B36 (0094 §A6): a forum''s context — {objective_id, horizon, scenario_id, classification, period, digest}; the forum reads the SAME attention items under it (no copy)';

-- CONVENE (executive.forum.convene; human-gated): the executive operator (or the executive, an administrator); named active members; a
-- cadence period (weekly | monthly | quarterly → the room's review cadence 7 | 30 | 90 days); the forum's context validated as §0's set_context
-- validates a context (a live objective or none, a scenario of the domain or none, the horizon, the classification).
CREATE OR REPLACE FUNCTION executive.convene_forum(p_room_id uuid, p_tenant uuid, p_domain uuid, p_title text, p_members uuid[], p_period text, p_context jsonb, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, graph, prediction, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_days int; v_next timestamptz; v_obj uuid; v_scn uuid; v_hz text; v_cls text; v_digest text; v_ctx jsonb; m uuid; v_members uuid[] := '{}'; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.forum.convene']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'forum rejected (actor): convened by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'forum rejected (actor): a forum is convened by a named, active member — never an agent' USING ERRCODE = '42501'; END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['executive_operator', 'executive', 'domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'forum rejected (authority): a forum is convened by the executive operator (or the executive, a domain or platform administrator)' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM executive.rooms_current r WHERE r.room_id = p_room_id) THEN RAISE EXCEPTION 'forum rejected (state): room % already exists', p_room_id USING ERRCODE = '22023'; END IF;
  IF coalesce(length(btrim(p_title)), 0) NOT BETWEEN 2 AND 256 THEN RAISE EXCEPTION 'forum rejected (title): a forum has a title of 2 to 256 characters' USING ERRCODE = '22023'; END IF;
  v_days := CASE p_period WHEN 'weekly' THEN 7 WHEN 'monthly' THEN 30 WHEN 'quarterly' THEN 90 END;
  IF v_days IS NULL THEN RAISE EXCEPTION 'forum rejected (period): the cadence period is weekly, monthly or quarterly' USING ERRCODE = '22023'; END IF;
  IF p_members IS NULL OR cardinality(p_members) = 0 THEN RAISE EXCEPTION 'forum rejected (members): a forum names at least one member' USING ERRCODE = '22023'; END IF;
  FOREACH m IN ARRAY p_members LOOP
    IF m IS NULL OR NOT decision.is_active_human(m, p_tenant) THEN RAISE EXCEPTION 'forum rejected (members): member % is not a named, active human of this tenant', m USING ERRCODE = '22023'; END IF;
    IF NOT (m = ANY (v_members)) THEN v_members := v_members || m; END IF;
  END LOOP;
  IF jsonb_typeof(p_context) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'forum rejected (context): the forum''s context is {objective_id?, horizon, scenario_id?, classification}' USING ERRCODE = '22023'; END IF;
  v_hz := p_context ->> 'horizon'; v_cls := coalesce(p_context ->> 'classification', 'internal');
  IF v_hz IS NULL OR v_hz NOT IN ('30d', '90d', '12m', '36m') THEN RAISE EXCEPTION 'forum rejected (context): horizon is 30d, 90d, 12m or 36m' USING ERRCODE = '22023'; END IF;
  IF v_cls NOT IN ('public', 'internal', 'confidential', 'restricted') THEN RAISE EXCEPTION 'forum rejected (context): classification is public, internal, confidential or restricted' USING ERRCODE = '22023'; END IF;
  v_obj := nullif(p_context ->> 'objective_id', '')::uuid; v_scn := nullif(p_context ->> 'scenario_id', '')::uuid;
  IF v_obj IS NOT NULL AND NOT EXISTS (SELECT 1 FROM graph.strategy_current s WHERE s.strategy_object_id = v_obj AND s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.status NOT IN ('retired', 'withdrawn')) THEN
    RAISE EXCEPTION 'forum rejected (context): objective % is not a live strategy object of this domain', v_obj USING ERRCODE = '22023';
  END IF;
  IF v_scn IS NOT NULL AND NOT EXISTS (SELECT 1 FROM prediction.scenarios_current x WHERE x.scenario_id = v_scn AND x.tenant_id = p_tenant AND x.domain_id = p_domain) THEN
    RAISE EXCEPTION 'forum rejected (context): scenario % is not a scenario of this domain', v_scn USING ERRCODE = '22023';
  END IF;
  v_digest := encode(digest(concat_ws('|', p_tenant::text, p_domain::text, coalesce(v_obj::text, ''), v_hz, coalesce(v_scn::text, ''), v_cls, ''), 'sha256'), 'hex');
  v_ctx := jsonb_build_object('objective_id', v_obj, 'horizon', v_hz, 'scenario_id', v_scn, 'classification', v_cls, 'effective_at', NULL, 'period', p_period, 'digest', v_digest, 'source', 'forum');
  v_next := v_at + make_interval(days => v_days);
  INSERT INTO executive.rooms_current (room_id, scope, tenant_id, domain_id, package_id, title, owner_principal_id, review_every_days, next_review_at, opened_by, correlation_id, kind, subject_id, deadline, forum_context)
  VALUES (p_room_id, 'DOMAIN', p_tenant, p_domain, NULL, btrim(p_title), p_actor, v_days, v_next, p_actor, p_correlation, 'forum', v_obj, NULL, v_ctx);
  INSERT INTO executive.room_members (room_id, principal_id, scope, tenant_id, domain_id, role, added_by) VALUES (p_room_id, p_actor, 'DOMAIN', p_tenant, p_domain, 'owner', p_actor);
  FOREACH m IN ARRAY v_members LOOP
    IF m <> p_actor THEN INSERT INTO executive.room_members (room_id, principal_id, scope, tenant_id, domain_id, role, added_by) VALUES (p_room_id, m, 'DOMAIN', p_tenant, p_domain, 'observer', p_actor); END IF;
  END LOOP;
  INSERT INTO executive.room_events (event_id, scope, tenant_id, domain_id, room_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_room_id, 'room.opened', p_actor,
          jsonb_build_object('kind', 'forum', 'title', btrim(p_title), 'period', p_period, 'review_every_days', v_days, 'next_review_at', v_next, 'members', to_jsonb(v_members), 'forum_context', v_ctx,
                             'memory', 'the forum reads the domain''s attention items under its context — no copy'), p_correlation);
  RETURN jsonb_build_object('room_id', p_room_id, 'kind', 'forum', 'title', btrim(p_title), 'period', p_period, 'review_every_days', v_days, 'next_review_at', v_next, 'owner', p_actor,
                            'members', to_jsonb(v_members), 'forum_context', v_ctx, 'opened_at', v_at);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.convene_forum(uuid,uuid,uuid,text,uuid[],text,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.convene_forum(uuid,uuid,uuid,text,uuid[],text,jsonb,uuid,uuid,uuid) TO eye_commit;

/* THE FORUM'S QUEUE: a member reads the SAME items under the forum's context (the queue read with the forum's context in place of the
   principal's) — one item, one acceptance, whichever forum looks. */
CREATE OR REPLACE FUNCTION executive.forum_queue(p_room_id uuid, p_tenant uuid, p_domain uuid, p_principal uuid, p_limit int) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r executive.rooms_current%ROWTYPE; c jsonb;
BEGIN
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO r FROM executive.rooms_current x WHERE x.room_id = p_room_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.kind = 'forum';
  IF NOT FOUND THEN RAISE EXCEPTION 'forum rejected (unknown_forum): room % is not a forum of this domain', p_room_id USING ERRCODE = '23503'; END IF;
  IF NOT EXISTS (SELECT 1 FROM executive.room_members m WHERE m.room_id = p_room_id AND m.principal_id = p_principal AND m.removed_at IS NULL) THEN
    RAISE EXCEPTION 'forum rejected (membership): the acting principal is not a member of forum %', p_room_id USING ERRCODE = '42501';
  END IF;
  c := executive.queue_context(p_principal, p_tenant, p_domain);
  RETURN jsonb_build_object('forum', jsonb_build_object('room_id', r.room_id, 'title', r.title, 'period', r.forum_context ->> 'period', 'review_every_days', r.review_every_days, 'next_review_at', r.next_review_at, 'owner', r.owner_principal_id,
                                                        'members', (SELECT coalesce(jsonb_agg(jsonb_build_object('principal_id', m.principal_id, 'role', m.role) ORDER BY m.added_at), '[]'::jsonb) FROM executive.room_members m WHERE m.room_id = r.room_id AND m.removed_at IS NULL)),
                            'context', r.forum_context, 'policy', c -> 'policy', 'hold', c -> 'hold', 'as_of', c -> 'as_of')
         || executive.attention_queue_under(p_tenant, p_domain, r.forum_context, p_limit);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.forum_queue(uuid, uuid, uuid, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.forum_queue(uuid, uuid, uuid, uuid, int) TO eye_app, eye_commit;

-- RLS and grants for this section's tables (the 0081 loop idiom; the ports write).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['attention_act_resumptions', 'attention_priority_acceptances', 'attention_queue_holds', 'attention_recovery_routes'] LOOP
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

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- section `briefing` (§B) — the part-local file 0094_b36_x_briefing.sql, combined here at integration in the apply order every fresh-database run used
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- section `briefing`
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0094 §B — CP-6 B36 part `briefing` (2026-09-30): THE LIVE BRIEFING STUDIO v2 COMPLETED — BRF@v3 (F-P6-12 completes).
--
-- What this section declares, and nothing else (MAP.md §B; the §0 prelude USED, never re-declared):
--   §B.1  executive.briefing_audience_ok(jsonb) — the AUDIENCE CONTRACT's shape (roles, locale, accessibility, channels, an optional
--         exclusion of the disputed / indicator sections); the v3 columns on executive.briefings: audience, purpose, expires_at,
--         omissions, suppressed, disputed, policy_version; schema_version admits 'v3'; the CHECK binding v3 to its contract and the
--         attention section to v2 AND v3 (0084's xbr_attention_v2 re-declared); every v1 / v2 edition reads as before.
--   §B.2  executive.briefing_policies — the UNSAFE-PRODUCT SUPPRESSION RULE ("prefer silence over false certainty"): per item class a
--         minimum of independent sources, a maximum staleness, a minimum confidence; executive.briefing_policy_rules_ok, the port
--         executive.set_briefing_policy (bound action briefing.policy.set; a named human), the read executive.briefing_policy_at.
--   §B.3  executive.briefing_events.event widened (+ briefing.suppressed, briefing.omission_declared, briefing.expired,
--         briefing.disputed_item) — MAP.md §0 lists this among the prelude's widenings; the prelude as written (0094 §0.7) widens
--         decision.package_events and the attention vocabularies only, so it is done here (the integrator may move it to §0).
--   §B.4  the BRF@v3 schema row (0084 §5's v2 row, plus the fields v3 requires: each item's `uncertainty`, and audience, purpose,
--         expires_at, omissions, suppressed, disputed, indicators at the payload's top level).
--   §B.5  executive.compose_briefing RE-DECLARED from 0084 §5 (apps/api/migrations/0084_b23_interfaces_and_briefing_v2.sql lines
--         356–431 — the ONLY re-declaration of this section; the previous signature dropped) with the v3 columns, the v3 refusals as the
--         family `briefing rejected (<class>): …`, and the three ledger events written in the same transaction.
--   §B.6  executive.expire_briefings — the attention tick's step `briefing-expiry` (order 60; bound action executive.attention.tick):
--         a v3 edition past its expires_at gains the event briefing.expired once; the read renders it expired. (The tick, not the read,
--         writes the event: a read is a read — B.md b3.)
--   §B.7  RLS and grants (the 0081 loop idiom) for the section's table.
-- Forward-only; 0084 and the §0 prelude untouched. Every figure the harness seeds is SYNTHETIC.

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §B.1 THE AUDIENCE CONTRACT and the v3 columns
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
/* The audience contract's SHAPE (structural; the roles are role codes, never resolved here — the read compares the reader's bindings):
     { roles: [<role code>, …] (non-empty), locale: 'en' | 'de-DE' | …, accessibility: { plain_language: bool, screen_reader: bool },
       channels: ['in-app' | 'demo-mailbox' | 'email' | 'sms' | 'teams', …] (non-empty; the B24/B34 delivery channels),
       exclude?: ['disputed' | 'indicator', …] } */
CREATE OR REPLACE FUNCTION executive.briefing_audience_ok(p jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE r jsonb; a jsonb; x text;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN RETURN false; END IF;
  IF jsonb_typeof(p -> 'roles') <> 'array' OR jsonb_array_length(p -> 'roles') = 0 THEN RETURN false; END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(p -> 'roles') LOOP
    IF jsonb_typeof(r) <> 'string' OR (r #>> '{}') !~ '^[a-z][a-z0-9_]{2,39}$' THEN RETURN false; END IF;
  END LOOP;
  IF jsonb_typeof(p -> 'locale') <> 'string' OR (p ->> 'locale') !~ '^[a-z]{2}(-[A-Z]{2})?$' THEN RETURN false; END IF;
  a := p -> 'accessibility';
  IF a IS NULL OR jsonb_typeof(a) <> 'object' OR jsonb_typeof(a -> 'plain_language') <> 'boolean' OR jsonb_typeof(a -> 'screen_reader') <> 'boolean' THEN RETURN false; END IF;
  IF jsonb_typeof(p -> 'channels') <> 'array' OR jsonb_array_length(p -> 'channels') = 0 THEN RETURN false; END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(p -> 'channels') LOOP
    IF jsonb_typeof(r) <> 'string' OR (r #>> '{}') NOT IN ('in-app', 'demo-mailbox', 'email', 'sms', 'teams') THEN RETURN false; END IF;
  END LOOP;
  IF p ? 'exclude' THEN
    IF jsonb_typeof(p -> 'exclude') <> 'array' THEN RETURN false; END IF;
    FOR r IN SELECT * FROM jsonb_array_elements(p -> 'exclude') LOOP
      IF jsonb_typeof(r) <> 'string' OR (r #>> '{}') NOT IN ('disputed', 'indicator') THEN RETURN false; END IF;
    END LOOP;
  END IF;
  FOR x IN SELECT jsonb_object_keys(p) LOOP
    IF x NOT IN ('roles', 'locale', 'accessibility', 'channels', 'exclude') THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END $$;
GRANT EXECUTE ON FUNCTION executive.briefing_audience_ok(jsonb) TO eye_app, eye_commit;

-- schema_version admits 'v3' (0084's anonymous CHECK re-declared whole); the attention section rides v2 AND v3 (0084's xbr_attention_v2 whole).
ALTER TABLE executive.briefings DROP CONSTRAINT briefings_schema_version_check;
ALTER TABLE executive.briefings ADD CONSTRAINT briefings_schema_version_check CHECK (schema_version IN ('v1', 'v2', 'v3'));
ALTER TABLE executive.briefings DROP CONSTRAINT xbr_attention_v2;
ALTER TABLE executive.briefings ADD CONSTRAINT xbr_attention_v2 CHECK ((schema_version IN ('v2', 'v3')) = (attention IS NOT NULL));
-- The v3 columns (ADD COLUMN rewrites nothing the append-only trigger guards; the defaults fill every earlier edition's ledgers with []).
ALTER TABLE executive.briefings
  ADD COLUMN audience       jsonb CHECK (audience IS NULL OR executive.briefing_audience_ok(audience)),
  ADD COLUMN purpose        text  CHECK (purpose IS NULL OR length(btrim(purpose)) BETWEEN 8 AND 400),
  ADD COLUMN expires_at     timestamptz,
  ADD COLUMN omissions      jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(omissions) = 'array'),
  ADD COLUMN suppressed     jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(suppressed) = 'array'),
  ADD COLUMN disputed       jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(disputed) = 'array'),
  ADD COLUMN policy_version int   CHECK (policy_version IS NULL OR policy_version >= 1);
ALTER TABLE executive.briefings ADD CONSTRAINT xbr_v3_contract CHECK ((schema_version = 'v3') = (audience IS NOT NULL AND purpose IS NOT NULL AND expires_at IS NOT NULL));
ALTER TABLE executive.briefings ADD CONSTRAINT xbr_v3_expiry CHECK (expires_at IS NULL OR expires_at > known_at);
COMMENT ON COLUMN executive.briefings.audience IS 'BRF@v3 (0094 §B): the AUDIENCE CONTRACT — roles, locale, accessibility, channels (and an optional exclusion of the disputed / indicator sections); a reader outside the roles is refused the edition at read time (briefing rejected (audience)). NULL on a v1 / v2 edition.';
COMMENT ON COLUMN executive.briefings.purpose IS 'BRF@v3: what the edition is for, in words (8–400 characters).';
COMMENT ON COLUMN executive.briefings.expires_at IS 'BRF@v3: the instant after which the edition reads as EXPIRED (the tick step briefing-expiry writes briefing.expired once; the read renders expired: true).';
COMMENT ON COLUMN executive.briefings.omissions IS 'BRF@v3: what the edition COULD NOT include and why — each {kind, object|source, reason}: source_degraded, source_blocked, memory_unavailable, below_clearance, suppressed, outage. An edition composed under an unavailable dependency that declares none is refused (briefing rejected (undeclared_omission)).';
COMMENT ON COLUMN executive.briefings.suppressed IS 'BRF@v3: the items the suppression policy withheld — {item_id, kind, rule, measure}; each is also declared as an omission of kind suppressed and recorded as briefing.suppressed. The composer never fills the gap with a weaker conclusion.';
COMMENT ON COLUMN executive.briefings.disputed IS 'BRF@v3: the disputed section — the disputed items (a package under challenge, a standing dissent, a contradiction ref) with their as-of and, for a board audience, the owner''s note.';
COMMENT ON COLUMN executive.briefings.policy_version IS 'BRF@v3: the briefing policy version in force at known_at (NULL when none was published by then — nothing is suppressed).';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §B.2 THE SUPPRESSION POLICY ("prefer silence over false certainty")
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
/* The rules' shape: { default: <rule>, classes?: { <item kind>: <rule>, … } }; a rule is { min_sources: int ≥ 1, max_staleness_hours: int ≥ 1,
   min_confidence: 0..1 | null } — a class rule may give only some of the three (the default fills the rest). The item kinds are the composer's:
   evidence, claim, run, branch, warning, warning-acknowledged, memory, package, dissent, disputed, indicator. */
CREATE OR REPLACE FUNCTION executive.briefing_policy_rule_ok(p jsonb, p_complete boolean) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE k text;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN RETURN false; END IF;
  FOR k IN SELECT jsonb_object_keys(p) LOOP
    IF k NOT IN ('min_sources', 'max_staleness_hours', 'min_confidence') THEN RETURN false; END IF;
  END LOOP;
  IF p_complete AND NOT (p ? 'min_sources' AND p ? 'max_staleness_hours' AND p ? 'min_confidence') THEN RETURN false; END IF;
  IF p ? 'min_sources' AND (jsonb_typeof(p -> 'min_sources') <> 'number' OR (p ->> 'min_sources')::numeric < 1 OR (p ->> 'min_sources')::numeric <> floor((p ->> 'min_sources')::numeric)) THEN RETURN false; END IF;
  IF p ? 'max_staleness_hours' AND (jsonb_typeof(p -> 'max_staleness_hours') <> 'number' OR (p ->> 'max_staleness_hours')::numeric < 1) THEN RETURN false; END IF;
  IF p ? 'min_confidence' AND jsonb_typeof(p -> 'min_confidence') <> 'null' AND (jsonb_typeof(p -> 'min_confidence') <> 'number' OR (p ->> 'min_confidence')::numeric < 0 OR (p ->> 'min_confidence')::numeric > 1) THEN RETURN false; END IF;
  RETURN true;
END $$;
CREATE OR REPLACE FUNCTION executive.briefing_policy_rules_ok(p jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE k text;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN RETURN false; END IF;
  FOR k IN SELECT jsonb_object_keys(p) LOOP
    IF k NOT IN ('default', 'classes') THEN RETURN false; END IF;
  END LOOP;
  IF NOT executive.briefing_policy_rule_ok(p -> 'default', true) THEN RETURN false; END IF;
  IF p ? 'classes' THEN
    IF jsonb_typeof(p -> 'classes') <> 'object' THEN RETURN false; END IF;
    FOR k IN SELECT jsonb_object_keys(p -> 'classes') LOOP
      IF k NOT IN ('evidence', 'claim', 'run', 'branch', 'warning', 'warning-acknowledged', 'memory', 'package', 'dissent', 'disputed', 'indicator') THEN RETURN false; END IF;
      IF NOT executive.briefing_policy_rule_ok(p -> 'classes' -> k, false) THEN RETURN false; END IF;
    END LOOP;
  END IF;
  RETURN true;
END $$;
GRANT EXECUTE ON FUNCTION executive.briefing_policy_rule_ok(jsonb, boolean) TO eye_app, eye_commit;
GRANT EXECUTE ON FUNCTION executive.briefing_policy_rules_ok(jsonb) TO eye_app, eye_commit;

CREATE TABLE executive.briefing_policies (
  policy_id       uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  version         int  NOT NULL CHECK (version >= 1),
  rules           jsonb NOT NULL CHECK (executive.briefing_policy_rules_ok(rules)),
  reason          text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  set_by          uuid NOT NULL,
  effective_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  superseded_at   timestamptz,
  correlation_id  uuid NOT NULL,
  CONSTRAINT xbp_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xbp_version UNIQUE (tenant_id, domain_id, version)
);
CREATE UNIQUE INDEX xbp_one_current ON executive.briefing_policies (tenant_id, domain_id) WHERE superseded_at IS NULL;
COMMENT ON TABLE executive.briefing_policies IS 'B36 §B (0094): the briefing SUPPRESSION policy — per item class the minimum of independent sources, the maximum staleness and the minimum confidence below which an item is not rendered but recorded as suppressed and declared as an omission ("prefer silence over false certainty"). Versioned; one current per domain; the composer reads the version in force at known_at.';
/* A policy row moves one way: current → superseded (the superseded instant set once); nothing else of the row changes (§0.4's idiom). */
CREATE OR REPLACE FUNCTION executive.briefing_policies_forward() RETURNS trigger
SET search_path = executive, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'briefing policies are append-only: DELETE prohibited' USING ERRCODE = '2F002'; END IF;
  IF OLD.superseded_at IS NOT NULL OR NEW.superseded_at IS NULL OR (to_jsonb(NEW) - 'superseded_at') <> (to_jsonb(OLD) - 'superseded_at') THEN
    RAISE EXCEPTION 'briefing policy % is immutable; a new version supersedes it', OLD.policy_id USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER xbp_forward BEFORE UPDATE OR DELETE ON executive.briefing_policies FOR EACH ROW EXECUTE FUNCTION executive.briefing_policies_forward();

/* The port: a NAMED HUMAN publishes the policy (bound action briefing.policy.set; the acting principal recorded); the same rules again are
   refused (nothing to supersede); the prior version is superseded in the same statement. */
CREATE OR REPLACE FUNCTION executive.set_briefing_policy(p_policy_id uuid, p_tenant uuid, p_domain uuid, p_rules jsonb, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE prior record; v_version int;
BEGIN
  PERFORM observation.assert_authority(ARRAY['briefing.policy.set']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'briefing policy rejected (actor): set by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.principals x WHERE x.id = p_actor AND x.kind = 'human' AND x.status = 'active') THEN
    RAISE EXCEPTION 'briefing policy rejected (actor): a policy is set by a named, active human' USING ERRCODE = '42501';
  END IF;
  IF NOT executive.briefing_policy_rules_ok(p_rules) THEN
    RAISE EXCEPTION 'briefing policy rejected (rules): rules are { default: { min_sources ≥ 1, max_staleness_hours ≥ 1, min_confidence 0..1 | null }, classes?: { <item kind>: <partial rule> } }' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'briefing policy rejected (reason): a reason of at least 8 characters says why the policy changes' USING ERRCODE = '22023'; END IF;
  SELECT * INTO prior FROM executive.briefing_policies b WHERE b.tenant_id = p_tenant AND b.domain_id = p_domain AND b.superseded_at IS NULL FOR UPDATE;
  IF FOUND AND prior.rules = p_rules THEN RAISE EXCEPTION 'briefing policy rejected (state): the rules are unchanged from version %', prior.version USING ERRCODE = '22023'; END IF;
  v_version := coalesce((SELECT max(version) FROM executive.briefing_policies b WHERE b.tenant_id = p_tenant AND b.domain_id = p_domain), 0) + 1;
  IF FOUND THEN UPDATE executive.briefing_policies SET superseded_at = clock_timestamp() WHERE policy_id = prior.policy_id; END IF;
  INSERT INTO executive.briefing_policies (policy_id, scope, tenant_id, domain_id, version, rules, reason, set_by, correlation_id)
  VALUES (p_policy_id, 'DOMAIN', p_tenant, p_domain, v_version, p_rules, btrim(p_reason), p_actor, p_correlation);
  RETURN jsonb_build_object('policy_id', p_policy_id, 'version', v_version, 'rules', p_rules, 'reason', btrim(p_reason), 'set_by', p_actor, 'effective_at', clock_timestamp(), 'supersedes', CASE WHEN prior.policy_id IS NULL THEN NULL ELSE prior.version END);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.set_briefing_policy(uuid,uuid,uuid,jsonb,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.set_briefing_policy(uuid,uuid,uuid,jsonb,text,uuid,uuid) TO eye_commit;

/* The read (an invoker under the caller's RLS): the policy in force AT an instant — effective by then, not superseded by then — or NULL. */
CREATE OR REPLACE FUNCTION executive.briefing_policy_at(p_tenant uuid, p_domain uuid, p_at timestamptz) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = executive, pg_catalog, pg_temp AS $$
  SELECT to_jsonb(b) - 'scope' - 'correlation_id'
    FROM executive.briefing_policies b
   WHERE b.tenant_id = p_tenant AND b.domain_id = p_domain AND b.effective_at <= p_at AND (b.superseded_at IS NULL OR b.superseded_at > p_at)
   ORDER BY b.version DESC LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION executive.briefing_policy_at(uuid, uuid, timestamptz) TO eye_app, eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §B.3 executive.briefing_events widened (0065 §8's list whole, plus B36's)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
ALTER TABLE executive.briefing_events DROP CONSTRAINT briefing_events_event_check;
ALTER TABLE executive.briefing_events ADD CONSTRAINT briefing_events_event_check CHECK (event IN (
  'briefing.re_flagged',
  -- B36 (0094 §B): the v3 ledger — an item suppressed under policy, an omission declared, an edition expired, a disputed item carried
  'briefing.suppressed', 'briefing.omission_declared', 'briefing.expired', 'briefing.disputed_item'));

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §B.4 BRF@v3 — 0084 §5's v2 row, plus what v3 requires
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
INSERT INTO objects.schema_registry (object_type, schema_version, json_schema, compatibility) VALUES
('BRF', 'v3', '{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["room_id","package_id","watermark","sources","items","windows","source_states","degraded","attention","audience","purpose","expires_at","omissions","suppressed","disputed","indicators","policy_version","content_digest","narrative","narrative_cites","composed_via"],
  "properties": {
    "room_id": { "type": ["string","null"] },
    "package_id": { "type": ["string","null"] },
    "watermark": { "type": "object", "required": ["prior_briefing_id","prior_composed_at","known_at"] },
    "sources": { "type": "array" },
    "items": { "type": "array", "items": { "type": "object", "required": ["item_id","kind","at","truth_state","source_state","uncertainty"],
               "properties": { "uncertainty": { "type": "object", "required": ["band","basis"], "properties": { "band": { "enum": ["high","medium","low","unknown"] }, "basis": { "type": "object" } } },
                               "retained_from": { "type": ["string","null"] } } } },
    "windows": { "type": "array" },
    "source_states": { "type": "array" },
    "degraded": { "type": "boolean" },
    "attention": {
      "type": "object",
      "additionalProperties": false,
      "required": ["as_of","since","policy_version","items","counts","material_changes_since_prior"],
      "properties": {
        "as_of": { "type": "string" },
        "since": { "type": ["string","null"] },
        "policy_version": { "type": ["integer","null"] },
        "items": { "type": "array", "items": { "type": "object", "required": ["item_id","signal_class","subject_kind","subject_id","state","confidence","confidence_band"],
                   "properties": { "confidence_band": { "enum": ["high","medium","low","unknown"] } } } },
        "counts": { "type": "object" },
        "material_changes_since_prior": { "type": "array", "items": { "type": "object", "required": ["item_id","subject_id","state","confidence","confidence_band"],
                   "properties": { "confidence_band": { "enum": ["high","medium","low","unknown"] } } } }
      }
    },
    "audience": { "type": "object", "required": ["roles","locale","accessibility","channels"],
                  "properties": { "roles": { "type": "array", "minItems": 1 }, "locale": { "type": "string" },
                                  "accessibility": { "type": "object", "required": ["plain_language","screen_reader"] }, "channels": { "type": "array", "minItems": 1 },
                                  "exclude": { "type": "array", "items": { "enum": ["disputed","indicator"] } } } },
    "purpose": { "type": "string", "minLength": 8 },
    "expires_at": { "type": "string" },
    "omissions": { "type": "array", "items": { "type": "object", "required": ["kind","reason"], "properties": { "kind": { "enum": ["source_degraded","source_blocked","memory_unavailable","below_clearance","suppressed","outage"] } } } },
    "suppressed": { "type": "array", "items": { "type": "object", "required": ["item_id","kind","rule","measure"] } },
    "disputed": { "type": "array", "items": { "type": "object", "required": ["item_id","basis","as_of"] } },
    "indicators": { "type": "array", "items": { "type": "object", "required": ["item_id","as_of"] } },
    "policy_version": { "type": ["integer","null"] },
    "content_digest": { "type": "string", "pattern": "^[0-9a-f]{64}$" },
    "narrative": { "type": ["string","null"] },
    "narrative_cites": { "type": "array" },
    "composed_via": { "enum": ["human","agent"] },
    "agent_id": { "type": ["string","null"] }
  }
}'::jsonb, 'backward')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §B.5 executive.compose_briefing — 0084 §5's body (lines 356–431), the v3 contract appended
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- The ONLY re-declaration of this section: 0084 §5's body verbatim (its refusal texts kept — phase6-briefings pins them), then the v3
-- gates in the family `briefing rejected (<class>): …` (actor → 403, unknown_* → 404, state / undeclared_omission → 409, the rest → 422)
-- and the three ledger events; the previous signature dropped.
DROP FUNCTION IF EXISTS executive.compose_briefing(uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,timestamptz,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,boolean,text,jsonb,text,text,jsonb,uuid,uuid,jsonb,text,jsonb);
CREATE OR REPLACE FUNCTION executive.compose_briefing(
  p_briefing_id uuid, p_tenant uuid, p_domain uuid, p_room_id uuid, p_package_id uuid, p_composer uuid, p_via text, p_agent_id uuid, p_known_at timestamptz,
  p_prior uuid, p_watermark jsonb, p_sources jsonb, p_items jsonb, p_windows jsonb, p_source_states jsonb, p_degraded boolean,
  p_narrative text, p_narrative_cites jsonb, p_content_digest text, p_header_digest text, p_controls jsonb, p_event_id uuid, p_correlation uuid,
  p_memory_accesses jsonb, p_schema_version text, p_attention jsonb,
  -- B36 (0094 §B): the v3 contract — NULL / [] on a v1 or v2 edition
  p_audience jsonb, p_purpose text, p_expires_at timestamptz, p_omissions jsonb, p_suppressed jsonb, p_disputed jsonb, p_policy_version int
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r record; pr record; c jsonb; v_ids jsonb; v_unavailable boolean; v_suppressed_omissions int; v_i jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['briefing.compose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_composer IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'briefing rejected: composed by the acting principal' USING ERRCODE = '42501'; END IF;
  -- 0084 (BRF@v2): an edition names its schema version; a v2 edition carries its attention section, a v1 edition none. B36: v3 carries it too.
  IF p_schema_version IS NULL OR p_schema_version NOT IN ('v1', 'v2', 'v3') THEN RAISE EXCEPTION 'briefing rejected: the schema version is v1, v2 or v3' USING ERRCODE = '22023'; END IF;
  IF (p_schema_version IN ('v2', 'v3')) <> (p_attention IS NOT NULL AND jsonb_typeof(p_attention) = 'object') THEN
    RAISE EXCEPTION 'briefing rejected: a BRF@v2 or BRF@v3 edition carries its attention section and a BRF@v1 edition none' USING ERRCODE = '22023';
  END IF;
  IF p_via = 'agent' THEN
    IF NOT EXISTS (SELECT 1 FROM executive.agents a WHERE a.agent_id = p_agent_id AND a.principal_id = p_composer AND a.agent_kind = 'briefing' AND a.status = 'active' AND a.tenant_id = p_tenant AND a.domain_id = p_domain) THEN
      RAISE EXCEPTION 'briefing rejected: the composing principal is not an active briefing agent of this domain' USING ERRCODE = '42501';
    END IF;
  ELSIF p_via <> 'human' THEN
    RAISE EXCEPTION 'briefing rejected: composed_via is human or agent' USING ERRCODE = '22023';
  END IF;
  IF p_room_id IS NOT NULL THEN
    SELECT * INTO r FROM executive.rooms_current x WHERE x.room_id = p_room_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    IF NOT FOUND THEN RAISE EXCEPTION 'briefing rejected: no such room in this domain' USING ERRCODE = '23503'; END IF;
    IF p_via = 'human' AND NOT executive.is_member(p_room_id, p_composer) THEN
      RAISE EXCEPTION 'briefing rejected: a room briefing is composed by a member of the room' USING ERRCODE = '42501';
    END IF;
    IF p_package_id IS DISTINCT FROM r.package_id THEN RAISE EXCEPTION 'briefing rejected: the package is not the room''s' USING ERRCODE = '22023'; END IF;
  END IF;
  IF p_prior IS NOT NULL THEN
    SELECT * INTO pr FROM executive.briefings x WHERE x.briefing_id = p_prior AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
    IF NOT FOUND THEN RAISE EXCEPTION 'briefing rejected: the prior briefing does not exist in this domain' USING ERRCODE = '23503'; END IF;
    IF pr.room_id IS DISTINCT FROM p_room_id THEN RAISE EXCEPTION 'briefing rejected: the prior briefing belongs to another room' USING ERRCODE = '22023'; END IF;
    IF pr.known_at > p_known_at THEN
      RAISE EXCEPTION 'briefing rejected: the prior briefing''s known_at (%) is after this briefing''s known_at (%); a briefing follows a prior that knew no more than it', decision.iso(pr.known_at), decision.iso(p_known_at) USING ERRCODE = '22023';
    END IF;
    IF (p_watermark ->> 'prior_briefing_id') IS DISTINCT FROM p_prior::text THEN RAISE EXCEPTION 'briefing rejected: the watermark does not name the prior it follows' USING ERRCODE = '22023'; END IF;
    IF (p_watermark ->> 'prior_known_at')::timestamptz IS DISTINCT FROM pr.known_at THEN RAISE EXCEPTION 'briefing rejected: the watermark''s prior_known_at is not the prior''s known_at' USING ERRCODE = '22023'; END IF;
  ELSIF (p_watermark ->> 'prior_briefing_id') IS NOT NULL THEN
    RAISE EXCEPTION 'briefing rejected: the watermark names a prior the briefing does not bind' USING ERRCODE = '22023';
  END IF;
  IF (p_watermark ->> 'known_at')::timestamptz IS DISTINCT FROM p_known_at THEN RAISE EXCEPTION 'briefing rejected: the watermark''s known_at is not the briefing''s' USING ERRCODE = '22023'; END IF;
  IF p_narrative IS NOT NULL THEN
    IF length(btrim(p_narrative)) < 8 THEN RAISE EXCEPTION 'briefing rejected: a narrative says something or is absent' USING ERRCODE = '22023'; END IF;
    SELECT coalesce(jsonb_agg(i ->> 'item_id'), '[]'::jsonb) INTO v_ids FROM jsonb_array_elements(p_items) i;
    FOR c IN SELECT * FROM jsonb_array_elements(coalesce(p_narrative_cites, '[]'::jsonb)) LOOP
      IF NOT (v_ids @> jsonb_build_array(c)) THEN RAISE EXCEPTION 'briefing rejected: the narrative cites %, which is not an item of this briefing', c USING ERRCODE = '22023'; END IF;
    END LOOP;
    IF jsonb_array_length(coalesce(p_narrative_cites, '[]'::jsonb)) = 0 THEN RAISE EXCEPTION 'briefing rejected: a narrative cites the items it summarises' USING ERRCODE = '22023'; END IF;
  END IF;
  -- ── B36 (0094 §B): the v3 contract ─────────────────────────────────────────────────────────────────────────────────────────────
  IF p_schema_version = 'v3' THEN
    IF NOT executive.briefing_audience_ok(p_audience) THEN
      -- the class is `contract` (the caller's malformed request, 422); `audience` is the READ's refusal of a reader outside the roles (403)
      RAISE EXCEPTION 'briefing rejected (contract): the audience contract names roles (non-empty), a locale, accessibility { plain_language, screen_reader } and channels (non-empty)' USING ERRCODE = '22023';
    END IF;
    IF p_purpose IS NULL OR length(btrim(p_purpose)) < 8 OR length(btrim(p_purpose)) > 400 THEN RAISE EXCEPTION 'briefing rejected (purpose): a purpose of 8 to 400 characters says what the edition is for' USING ERRCODE = '22023'; END IF;
    IF p_expires_at IS NULL OR p_expires_at <= p_known_at THEN RAISE EXCEPTION 'briefing rejected (expiry): expires_at is an instant after the edition''s known_at' USING ERRCODE = '22023'; END IF;
    IF p_policy_version IS NOT NULL AND NOT EXISTS (SELECT 1 FROM executive.briefing_policies b WHERE b.tenant_id = p_tenant AND b.domain_id = p_domain AND b.version = p_policy_version) THEN
      RAISE EXCEPTION 'briefing rejected (unknown_policy): no briefing policy version % in this domain', p_policy_version USING ERRCODE = '23503';
    END IF;
    IF p_omissions IS NULL OR jsonb_typeof(p_omissions) <> 'array' OR p_suppressed IS NULL OR jsonb_typeof(p_suppressed) <> 'array' OR p_disputed IS NULL OR jsonb_typeof(p_disputed) <> 'array' THEN
      RAISE EXCEPTION 'briefing rejected (ledgers): omissions, suppressed and disputed are arrays' USING ERRCODE = '22023';
    END IF;
    -- every displayed conclusion carries its uncertainty band and basis (computed by the composer; never asserted by a caller)
    FOR v_i IN SELECT * FROM jsonb_array_elements(p_items) LOOP
      IF jsonb_typeof(v_i -> 'uncertainty') <> 'object' OR (v_i -> 'uncertainty' ->> 'band') IS NULL OR (v_i -> 'uncertainty' ->> 'band') NOT IN ('high', 'medium', 'low', 'unknown') OR jsonb_typeof(v_i -> 'uncertainty' -> 'basis') <> 'object' THEN
        RAISE EXCEPTION 'briefing rejected (uncertainty): item % carries no uncertainty band (high | medium | low | unknown) with its basis', v_i ->> 'item_id' USING ERRCODE = '22023';
      END IF;
    END LOOP;
    FOR v_i IN SELECT * FROM jsonb_array_elements(p_omissions) LOOP
      IF (v_i ->> 'kind') IS NULL OR (v_i ->> 'kind') NOT IN ('source_degraded', 'source_blocked', 'memory_unavailable', 'below_clearance', 'suppressed', 'outage') OR (v_i ->> 'reason') IS NULL OR length(btrim(v_i ->> 'reason')) < 8 THEN
        RAISE EXCEPTION 'briefing rejected (omission): an omission names its kind (source_degraded | source_blocked | memory_unavailable | below_clearance | suppressed | outage) and its reason' USING ERRCODE = '22023';
      END IF;
    END LOOP;
    -- an edition whose composition met an UNAVAILABLE DEPENDENCY declares an omission, or is refused: a degraded or blocked source among
    -- the states the composition read, the memory content unavailable (B21's token in the watermark), or an item withheld under policy.
    -- (`degraded` alone is not the test: a withdrawn memory projection served from its log, labelled, omits nothing — B20.)
    v_unavailable := EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(p_source_states, '[]'::jsonb)) s WHERE (s ->> 'state') IN ('degraded', 'blocked'))
      OR (p_watermark -> 'projection' ->> 'memory_content') = 'unavailable'
      OR jsonb_array_length(p_suppressed) > 0;
    IF v_unavailable AND jsonb_array_length(p_omissions) = 0 THEN
      RAISE EXCEPTION 'briefing rejected (undeclared_omission): the composition met an unavailable dependency (a degraded or blocked source, the memory content unavailable, or an item withheld under policy) and declares no omission; an edition names what it could not include' USING ERRCODE = '22023';
    END IF;
    SELECT count(*) INTO v_suppressed_omissions FROM jsonb_array_elements(p_omissions) o WHERE (o ->> 'kind') = 'suppressed';
    IF v_suppressed_omissions < jsonb_array_length(p_suppressed) THEN
      RAISE EXCEPTION 'briefing rejected (undeclared_omission): % item(s) suppressed under policy but % declared as omissions of kind suppressed', jsonb_array_length(p_suppressed), v_suppressed_omissions USING ERRCODE = '22023';
    END IF;
    -- a suppressed item is not rendered: it is not among the items, and the narrative cannot cite it
    FOR v_i IN SELECT * FROM jsonb_array_elements(p_suppressed) LOOP
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_items) x WHERE (x ->> 'item_id') = (v_i ->> 'item_id')) THEN
        RAISE EXCEPTION 'briefing rejected (suppressed): item % is suppressed under policy and rendered at once', v_i ->> 'item_id' USING ERRCODE = '22023';
      END IF;
    END LOOP;
  ELSIF p_audience IS NOT NULL OR p_purpose IS NOT NULL OR p_expires_at IS NOT NULL THEN
    RAISE EXCEPTION 'briefing rejected (schema): the audience contract, purpose and expiry belong to a BRF@v3 edition' USING ERRCODE = '22023';
  END IF;
  INSERT INTO executive.briefings (briefing_id, scope, tenant_id, domain_id, room_id, package_id, composed_by, composed_via, agent_id, known_at, prior_briefing_id, watermark, sources, items, windows, source_states, degraded,
                                   narrative, narrative_cites, content_digest, header_digest, controls, correlation_id, memory_accesses, schema_version, attention,
                                   audience, purpose, expires_at, omissions, suppressed, disputed, policy_version)
  VALUES (p_briefing_id, 'DOMAIN', p_tenant, p_domain, p_room_id, p_package_id, p_composer, p_via, p_agent_id, p_known_at, p_prior, p_watermark, p_sources, p_items, p_windows, coalesce(p_source_states, '[]'::jsonb), coalesce(p_degraded, false),
          p_narrative, CASE WHEN p_narrative IS NULL THEN '[]'::jsonb ELSE coalesce(p_narrative_cites, '[]'::jsonb) END, p_content_digest, p_header_digest, coalesce(p_controls, '{}'::jsonb), p_correlation, coalesce(p_memory_accesses, '[]'::jsonb),
          p_schema_version, p_attention,
          CASE WHEN p_schema_version = 'v3' THEN p_audience END, CASE WHEN p_schema_version = 'v3' THEN btrim(p_purpose) END, CASE WHEN p_schema_version = 'v3' THEN p_expires_at END,
          coalesce(p_omissions, '[]'::jsonb), coalesce(p_suppressed, '[]'::jsonb), coalesce(p_disputed, '[]'::jsonb), CASE WHEN p_schema_version = 'v3' THEN p_policy_version END);
  IF p_room_id IS NOT NULL THEN
    INSERT INTO executive.room_events (event_id, scope, tenant_id, domain_id, room_id, event, actor_principal_id, details, correlation_id)
    VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_room_id, 'briefing.composed', p_composer,
            jsonb_build_object('briefing_id', p_briefing_id, 'prior_briefing_id', p_prior, 'known_at', p_known_at, 'content_digest', p_content_digest, 'items', jsonb_array_length(p_items), 'degraded', coalesce(p_degraded, false), 'via', p_via,
                               'schema_version', p_schema_version), p_correlation);
  END IF;
  -- B36: the v3 ledger — what was withheld, what was declared, what is disputed; one event each, in this transaction, by the composer
  IF p_schema_version = 'v3' THEN
    FOR v_i IN SELECT * FROM jsonb_array_elements(p_suppressed) LOOP
      INSERT INTO executive.briefing_events (event_id, scope, tenant_id, domain_id, briefing_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_briefing_id, 'briefing.suppressed', p_composer, jsonb_build_object('item_id', v_i ->> 'item_id', 'kind', v_i ->> 'kind', 'rule', v_i -> 'rule', 'measure', v_i -> 'measure', 'policy_version', p_policy_version), p_correlation);
    END LOOP;
    FOR v_i IN SELECT * FROM jsonb_array_elements(p_omissions) LOOP
      INSERT INTO executive.briefing_events (event_id, scope, tenant_id, domain_id, briefing_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_briefing_id, 'briefing.omission_declared', p_composer, v_i, p_correlation);
    END LOOP;
    FOR v_i IN SELECT * FROM jsonb_array_elements(p_disputed) LOOP
      INSERT INTO executive.briefing_events (event_id, scope, tenant_id, domain_id, briefing_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_briefing_id, 'briefing.disputed_item', p_composer, v_i, p_correlation);
    END LOOP;
  END IF;
  RETURN jsonb_build_object('briefing_id', p_briefing_id, 'content_digest', p_content_digest, 'schema_version', p_schema_version,
                            'omissions', CASE WHEN p_schema_version = 'v3' THEN jsonb_array_length(p_omissions) ELSE 0 END,
                            'suppressed', CASE WHEN p_schema_version = 'v3' THEN jsonb_array_length(p_suppressed) ELSE 0 END,
                            'disputed', CASE WHEN p_schema_version = 'v3' THEN jsonb_array_length(p_disputed) ELSE 0 END);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.compose_briefing(uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,timestamptz,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,boolean,text,jsonb,text,text,jsonb,uuid,uuid,jsonb,text,jsonb,jsonb,text,timestamptz,jsonb,jsonb,jsonb,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.compose_briefing(uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,timestamptz,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,boolean,text,jsonb,text,text,jsonb,uuid,uuid,jsonb,text,jsonb,jsonb,text,timestamptz,jsonb,jsonb,jsonb,int) TO eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §B.6 EXPIRY — the attention tick's step `briefing-expiry` (order 60)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
/* A v3 edition past its expires_at gains ONE briefing.expired event, written by the tick under the attention agent's principal (the bound
   action executive.attention.tick — the step runs inside the tick's write, 0086 §0's model); the read renders it expired. The row itself is
   immutable: the expiry is a fact of the ledger and the clock, never a rewrite. */
CREATE OR REPLACE FUNCTION executive.expire_briefings(p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE b record; v_ids jsonb := '[]'::jsonb; v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'briefing expiry rejected (actor): run by the acting principal' USING ERRCODE = '42501'; END IF;
  FOR b IN SELECT x.briefing_id, x.expires_at FROM executive.briefings x
            WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.schema_version = 'v3' AND x.expires_at <= v_now
              AND NOT EXISTS (SELECT 1 FROM executive.briefing_events e WHERE e.briefing_id = x.briefing_id AND e.event = 'briefing.expired')
            ORDER BY x.expires_at, x.briefing_id LIMIT 500 LOOP
    INSERT INTO executive.briefing_events (event_id, scope, tenant_id, domain_id, briefing_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, b.briefing_id, 'briefing.expired', p_actor, jsonb_build_object('expires_at', b.expires_at, 'found_at', v_now, 'by', 'tick:briefing-expiry'), p_correlation);
    v_ids := v_ids || to_jsonb(b.briefing_id::text);
  END LOOP;
  RETURN jsonb_build_object('expired', jsonb_array_length(v_ids), 'briefing_ids', v_ids, 'at', v_now);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.expire_briefings(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.expire_briefings(uuid,uuid,uuid,uuid) TO eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §B.7 RLS and grants (the 0081 loop idiom; the ports write)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['briefing_policies'] LOOP
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

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- section `collab` (§C) — the part-local file 0094_b36_x_collab.sql, combined here at integration in the apply order every fresh-database run used
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- section `collab`
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0094 §C — CP-6 B36 part `collab` (2026-09-30): COLLABORATION COMPLETED AND THE CARRIED MECHANISMS — F-P6-14 COMPLETES (STAGES (q)–(t)),
-- F-P6-05 (u) THE ENFORCED ACTIVATION OF A REAL EXECUTION TARGET, F-P4-13 (i)–(j) THE OUTCOME LOOP'S LEARN STEP. V8 PR-46-002 (task
-- dependencies), PER-22 (the external collaborator's bounded surface), the B34 review's condition (t): the invitation token today lives only
-- in the API process — it is DELIVERED to the invitee's SYNTHETIC mailbox as a one-time PICKUP CODE and the token itself is SEALED at rest
-- under that code, written to no table, log line or answer in clear (the pickup answers it ONCE to the addressed person). Built on §0 (the
-- widened decision.package_events: execution.target_activated / execution.target_deactivated are this section's), 0090 §W (the tasks, the
-- workspaces, the grants), 0091 §F1 (the identity path — used, never re-declared), 0090 §C5 (the gateway — ONE port re-declared with ONE
-- addition), 0090 §X5 (the outcome review — used; the learn step is new).
--
--   §C0  the vocabularies: human_task_events (+ task.dependency_declared, task.released), collab_events (+ invitation.picked_up,
--        invitation.pickup_refused, invitation.locked), prediction.exposure_events (+ exposure.learning_recorded)
--   §C1  THE EXTERNAL'S BOUNDED SELF READ (q): executive.collab_grant_surface(principal) — the grants that bound an external collaborator
--        (its workspace, purpose, audience ceiling, expiry, whether live or expired at the DATABASE's instant); nothing of the tenant beyond
--   §C2  TASK DEPENDENCIES (r; PR-46-002): executive.human_task_dependencies (finish_to_start; a cycle refused), the port
--        executive.declare_task_dependency, the read executive.task_dependencies_of, the GUARD on executive.human_tasks (a task with an
--        unmet dependency cannot be completed: `task rejected (dependency)`) and the RELEASE (the prerequisite's closure releases the
--        dependent: task.released on the dependent's log); a workflow definition's transitions may declare `depends_on` (states whose
--        instance tasks must be closed before the transition is admitted — validated at publication, enforced on the transition)
--   §C3  THE LOCAL INVITATION DELIVERY AND PICKUP (t): executive.invitation_deliveries (one per grant: the pickup code's hash, the SEALED
--        acceptance material, the failures, the lock, the pickup), executive.invitation_pickups (append-only: every attempt and its
--        outcome, from where), executive.deliver_invitation (the identity administrator's act after the activation), executive.pickup_invitation
--        (THE ONE PORT WITHOUT A PRINCIPAL — the addressed person is not yet a principal; the mailbox's one-time code IS the authority; every
--        attempt recorded; five failures lock the invitation; a second pickup refused)
--   §C4  THE ENFORCED ACTIVATION OF A REAL EXECUTION TARGET (u; F-P6-05): decision.execution_targets gains activation_state ('synthetic' |
--        'inactive' | 'active') with activated_at / activated_by / authorized_by_decision and the deactivation; decision.register_execution_target
--        (a NON-synthetic target registered `inactive` by the domain administrator — 0090's declare stays synthetic-only, untouched);
--        decision.activate_execution_target (a named human holding execution_authority who is NOT the registrar, with the owner's COMMITTED
--        decision whose payload names the target); decision.deactivate_execution_target (a reason; new handoffs refused at once);
--        decision.issue_execution_handoff re-declared from 0090 §C5 line 2090 with ONE addition: a non-synthetic target that is not active
--        refuses the handoff (`execution handoff rejected (inactive_target)`). NOTHING REAL IS ACTIVATED by any harness or act: a "real"
--        target in the harness is a loopback literal recorded non-synthetic, and the production egress refuses it (the B14 rule).
--   §C5  THE LEARN STEP (j; JRN-09, PR-28-001/-002, CAP-FW-05): prediction.exposure_learnings — after an outcome review, what was EXPECTED
--        (the accepted assessment's bracket), what HAPPENED (the review's outcomes), what CHANGES in the estimate's basis; the port
--        prediction.record_exposure_learning (the owner or the sponsor); exposure.learning_recorded on the lineage
-- Forward-only; 0090, 0091 and §0 untouched. Every figure a harness seeds is SYNTHETIC. The refusal families are `task dependency rejected`,
-- `task rejected (dependency)`, `invitation rejected`, `execution registration rejected`, `execution activation rejected`, `exposure learning
-- rejected` and `workflow rejected (dependency)` — anchored nouns no earlier row reads.

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §C0 THE VOCABULARIES (each list copied whole from its last declaration, plus this section's)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- executive.human_task_events (0090 §0 line 211, whole, plus the dependency events)
ALTER TABLE executive.human_task_events DROP CONSTRAINT human_task_events_event_check;
ALTER TABLE executive.human_task_events ADD CONSTRAINT human_task_events_event_check CHECK (event IN (
  'task.opened', 'task.repeated', 'task.reassigned', 'task.escalated', 'task.escalation_exhausted', 'task.completed', 'task.cancelled', 'task.lapsed', 'task.reminded',
  -- B36 (0094 §C2)
  'task.dependency_declared', 'task.released'));

-- executive.collab_events (0091 §1, whole, plus the invitation delivery and pickup)
ALTER TABLE executive.collab_events DROP CONSTRAINT collab_events_event_check;
ALTER TABLE executive.collab_events ADD CONSTRAINT collab_events_event_check CHECK (event IN ('workspace.opened', 'participant.added', 'participant.removed',
  'thread.opened', 'message.posted', 'artifact.added', 'review.requested', 'review.recorded', 'grant.invited', 'grant.accepted', 'grant.revoked', 'grant.lapsed',
  'access.refused', 'grant.requested', 'grant.provisioning',
  -- B36 (0094 §C3): the pickup's outcomes (the delivery itself is the row of executive.invitation_deliveries — no event on the provisioning path,
  -- whose log the B34-F1 harness pins exactly)
  'invitation.picked_up', 'invitation.pickup_refused', 'invitation.locked'));

-- prediction.exposure_events (0090 §X0, whole, plus the learn step)
ALTER TABLE prediction.exposure_events DROP CONSTRAINT exposure_events_event_check;
ALTER TABLE prediction.exposure_events ADD CONSTRAINT exposure_events_event_check CHECK (event IN (
  'exposure.registered', 'exposure.assessed', 'exposure.estimated', 'exposure.assessment_contested', 'exposure.assessment_accepted',
  'exposure.control_added', 'exposure.residual_computed', 'exposure.appetite_breached', 'exposure.routed', 'exposure.hypothesis_declared',
  'exposure.sponsored', 'exposure.response_opened', 'exposure.correlation_recorded', 'exposure.closed',
  'exposure.scenario_linked', 'exposure.outcome_recorded', 'exposure.owner_reassigned',
  -- B36 (0094 §C5)
  'exposure.learning_recorded'));

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §C1 THE EXTERNAL'S BOUNDED SELF READ (q)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
/* An invoker read under the caller's RLS: the grants that name this principal, newest per workspace first — the workspace's title, the
   purpose, the audience ceiling, the expiry, the state, and whether the grant is LIVE or EXPIRED at the database's instant. It says nothing
   of the tenant beyond: no member, no room, no package. A principal with no grant reads an empty list. */
CREATE OR REPLACE FUNCTION executive.collab_grant_surface(p_principal uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = executive, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'now', clock_timestamp(),
    'grants', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'grant_id', g.grant_id, 'workspace_id', g.workspace_id, 'workspace_title', w.title, 'purpose', g.purpose, 'audience_ceiling', g.audience_ceiling,
        'state', g.state, 'expires_at', g.expires_at, 'invitation_expires_at', g.invitation_expires_at, 'accepted_at', g.accepted_at,
        'live', (g.state = 'accepted' AND g.expires_at > clock_timestamp()),
        'expired', (g.state IN ('accepted', 'invited') AND g.expires_at <= clock_timestamp()) OR g.state = 'lapsed',
        'ended', g.state IN ('revoked', 'lapsed'),
        'reason', CASE WHEN g.state = 'revoked' THEN 'revoked' WHEN g.state = 'lapsed' THEN 'lapsed' WHEN g.expires_at <= clock_timestamp() THEN 'expired'
                       WHEN g.state = 'invited' THEN 'not_accepted' WHEN g.state = 'requested' THEN 'not_provisioned' ELSE NULL END
      ) ORDER BY g.invited_at DESC)
      FROM executive.collab_grants g JOIN executive.collab_workspaces w ON w.workspace_id = g.workspace_id
     WHERE g.principal_id = p_principal AND g.tenant_id = public.eye_tenant()), '[]'::jsonb))
$$;
GRANT EXECUTE ON FUNCTION executive.collab_grant_surface(uuid) TO eye_app, eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §C2 TASK DEPENDENCIES (r; PR-46-002)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE executive.human_task_dependencies (
  dependency_id       uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  task_id             uuid NOT NULL REFERENCES executive.human_tasks (task_id),
  depends_on_task_id  uuid NOT NULL REFERENCES executive.human_tasks (task_id),
  kind                text NOT NULL DEFAULT 'finish_to_start' CHECK (kind = 'finish_to_start'),
  declared_by         uuid NOT NULL,
  declared_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  released_at         timestamptz,
  released_by_state   text CHECK (released_by_state IS NULL OR released_by_state IN ('completed', 'cancelled', 'lapsed')),
  correlation_id      uuid NOT NULL,
  CONSTRAINT xtd_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xtd_not_self CHECK (task_id <> depends_on_task_id),
  CONSTRAINT xtd_released_bound CHECK ((released_at IS NULL) = (released_by_state IS NULL)),
  CONSTRAINT xtd_once UNIQUE (task_id, depends_on_task_id)
);
CREATE INDEX xtd_prerequisite ON executive.human_task_dependencies (depends_on_task_id) WHERE released_at IS NULL;
/* A dependency moves one way: declared → released (the release instant and the prerequisite's closing state set once); nothing else changes. */
CREATE OR REPLACE FUNCTION executive.human_task_dependencies_forward() RETURNS trigger
SET search_path = executive, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'task dependencies are append-only: DELETE prohibited' USING ERRCODE = '2F002'; END IF;
  IF OLD.released_at IS NOT NULL OR NEW.released_at IS NULL OR (to_jsonb(NEW) - 'released_at' - 'released_by_state') <> (to_jsonb(OLD) - 'released_at' - 'released_by_state') THEN
    RAISE EXCEPTION 'task dependency % is immutable but for its release', OLD.dependency_id USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER xtd_forward BEFORE UPDATE OR DELETE ON executive.human_task_dependencies FOR EACH ROW EXECUTE FUNCTION executive.human_task_dependencies_forward();

/* Whether a task has an UNMET dependency: a prerequisite still open or escalated (a completed, cancelled or lapsed prerequisite is met — a
   cancelled one releases with that state on the dependent's log, so the person sees what freed the task). */
CREATE OR REPLACE FUNCTION executive.task_unmet_dependencies(p_task uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = executive, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('task_id', t.task_id, 'title', t.title, 'state', t.state, 'assignee', t.assignee_principal_id, 'deadline_at', t.deadline_at) ORDER BY t.opened_at), '[]'::jsonb)
    FROM executive.human_task_dependencies d JOIN executive.human_tasks t ON t.task_id = d.depends_on_task_id
   WHERE d.task_id = p_task AND d.released_at IS NULL AND t.state IN ('open', 'escalated')
$$;
GRANT EXECUTE ON FUNCTION executive.task_unmet_dependencies(uuid) TO eye_app, eye_commit;

/* The read: what a task waits on (each prerequisite with its state and whether it is met) and what waits on it. */
CREATE OR REPLACE FUNCTION executive.task_dependencies_of(p_task uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = executive, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'waits_on', coalesce((SELECT jsonb_agg(jsonb_build_object('dependency_id', d.dependency_id, 'task_id', t.task_id, 'title', t.title, 'state', t.state, 'kind', d.kind,
                                                         'met', t.state IN ('completed', 'cancelled', 'lapsed'), 'released_at', d.released_at, 'released_by_state', d.released_by_state,
                                                         'declared_by', d.declared_by, 'declared_at', d.declared_at) ORDER BY d.declared_at)
                            FROM executive.human_task_dependencies d JOIN executive.human_tasks t ON t.task_id = d.depends_on_task_id WHERE d.task_id = p_task), '[]'::jsonb),
    'released_by_this', coalesce((SELECT jsonb_agg(jsonb_build_object('dependency_id', d.dependency_id, 'task_id', t.task_id, 'title', t.title, 'state', t.state,
                                                                 'released_at', d.released_at) ORDER BY d.declared_at)
                                    FROM executive.human_task_dependencies d JOIN executive.human_tasks t ON t.task_id = d.task_id WHERE d.depends_on_task_id = p_task), '[]'::jsonb),
    'blocked', (SELECT jsonb_array_length(executive.task_unmet_dependencies(p_task)) > 0))
$$;
GRANT EXECUTE ON FUNCTION executive.task_dependencies_of(uuid) TO eye_app, eye_commit;

/* THE PORT: a named, active member declares that p_task waits on p_depends_on (finish-to-start). Both tasks of this domain; the dependent
   open or escalated; the prerequisite open or escalated (a dependency on a closed task would be met at birth — it is refused as state);
   a self-dependency and a CYCLE refused (the prerequisite's own chain, followed transitively, may not reach the dependent); the declarer
   holds the dependent (its assignee), opened it, or holds the workspace it belongs to (the workspace's owner) — an executive or a domain
   administrator declares anywhere (the PDP's roles). The dependent's log gains task.dependency_declared. */
CREATE OR REPLACE FUNCTION executive.declare_task_dependency(p_dependency_id uuid, p_tenant uuid, p_domain uuid, p_task uuid, p_depends_on uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t executive.human_tasks%ROWTYPE; q executive.human_tasks%ROWTYPE; v_owner uuid; v_admin boolean;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.task.dependency.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'task dependency rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'task dependency rejected (actor): a named, active member declares a dependency' USING ERRCODE = '42501'; END IF;
  IF p_task = p_depends_on THEN RAISE EXCEPTION 'task dependency rejected (cycle): a task cannot wait on itself' USING ERRCODE = '22023'; END IF;
  SELECT * INTO t FROM executive.human_tasks x WHERE x.task_id = p_task AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'task dependency rejected (unknown_task): no task % in this domain', p_task USING ERRCODE = '23503'; END IF;
  SELECT * INTO q FROM executive.human_tasks x WHERE x.task_id = p_depends_on AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'task dependency rejected (unknown_task): no task % in this domain', p_depends_on USING ERRCODE = '23503'; END IF;
  IF t.state NOT IN ('open', 'escalated') THEN RAISE EXCEPTION 'task dependency rejected (state): task % is %; only an open task waits', p_task, t.state USING ERRCODE = '23505'; END IF;
  IF q.state NOT IN ('open', 'escalated') THEN RAISE EXCEPTION 'task dependency rejected (state): task % is % already; a dependency on it would be met at birth', p_depends_on, q.state USING ERRCODE = '23505'; END IF;
  IF t.kind LIKE 'gate.%' OR t.kind LIKE 'commitment.%' THEN
    RAISE EXCEPTION 'task dependency rejected (owning_action): a % task is completed through its owning action; it takes no dependency here', t.kind USING ERRCODE = '22023';
  END IF;
  -- who may declare: the dependent's holder or opener, the owner of the workspace it belongs to, an executive or a domain administrator
  v_admin := executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['executive', 'domain_admin', 'platform_admin']);
  IF t.subject ->> 'kind' = 'workspace' THEN SELECT w.owner_principal_id INTO v_owner FROM executive.collab_workspaces w WHERE w.workspace_id = (t.subject ->> 'id')::uuid; END IF;
  IF NOT v_admin AND p_actor IS DISTINCT FROM t.assignee_principal_id AND p_actor IS DISTINCT FROM t.opened_by AND p_actor IS DISTINCT FROM v_owner THEN
    RAISE EXCEPTION 'task dependency rejected (not_holder): task % is held by another principal; its holder, its opener, the workspace''s owner, an executive or a domain administrator declares what it waits on', p_task USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM executive.human_task_dependencies d WHERE d.task_id = p_task AND d.depends_on_task_id = p_depends_on) THEN
    RAISE EXCEPTION 'task dependency rejected (duplicate): task % already waits on %', p_task, p_depends_on USING ERRCODE = '23505';
  END IF;
  -- THE CYCLE: following what the prerequisite itself waits on (transitively) must never reach the dependent
  IF EXISTS (WITH RECURSIVE chain(task_id) AS (
               SELECT d.depends_on_task_id FROM executive.human_task_dependencies d WHERE d.task_id = p_depends_on
               UNION
               SELECT d.depends_on_task_id FROM executive.human_task_dependencies d JOIN chain c ON c.task_id = d.task_id)
             SELECT 1 FROM chain WHERE task_id = p_task) THEN
    RAISE EXCEPTION 'task dependency rejected (cycle): task % already waits, through its chain, on %; the dependency would close a cycle', p_depends_on, p_task USING ERRCODE = '22023';
  END IF;
  INSERT INTO executive.human_task_dependencies (dependency_id, scope, tenant_id, domain_id, task_id, depends_on_task_id, declared_by, correlation_id)
  VALUES (p_dependency_id, 'DOMAIN', p_tenant, p_domain, p_task, p_depends_on, p_actor, p_correlation);
  INSERT INTO executive.human_task_events (event_id, scope, tenant_id, domain_id, task_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_task, 'task.dependency_declared', p_actor,
          jsonb_build_object('dependency_id', p_dependency_id, 'depends_on', p_depends_on, 'depends_on_title', q.title, 'kind', 'finish_to_start'), p_correlation);
  RETURN jsonb_build_object('dependency_id', p_dependency_id, 'task_id', p_task, 'depends_on', p_depends_on, 'kind', 'finish_to_start', 'declared_by', p_actor,
                            'dependencies', executive.task_dependencies_of(p_task));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.declare_task_dependency(uuid, uuid, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.declare_task_dependency(uuid, uuid, uuid, uuid, uuid, uuid, uuid) TO eye_commit;

/* THE GUARD: a task with an UNMET dependency is not completed — by the route (0090's executive.complete_human_task, untouched) nor by an
   owning port's _resolve_human_tasks. A cancellation or a lapse is not a completion and passes (its own release follows). */
CREATE OR REPLACE FUNCTION executive.human_task_dependency_guard() RETURNS trigger
SET search_path = executive, pg_catalog, pg_temp AS $$
DECLARE v_unmet jsonb;
BEGIN
  IF NEW.state = 'completed' AND OLD.state IN ('open', 'escalated') THEN
    v_unmet := executive.task_unmet_dependencies(NEW.task_id);
    IF jsonb_array_length(v_unmet) > 0 THEN
      RAISE EXCEPTION 'task rejected (dependency): task % waits on % open task(s) (%); it is completed when they are', NEW.task_id, jsonb_array_length(v_unmet),
        (SELECT string_agg(x ->> 'title', '; ') FROM jsonb_array_elements(v_unmet) x) USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER xtd_guard BEFORE UPDATE OF state ON executive.human_tasks FOR EACH ROW EXECUTE FUNCTION executive.human_task_dependency_guard();

/* THE RELEASE: when a prerequisite closes (completed, cancelled or lapsed), every dependency on it is released with that state; a dependent
   whose last unmet dependency is thereby met gains task.released on its log (what freed it, and by whom). */
CREATE OR REPLACE FUNCTION executive.human_task_dependency_release() RETURNS trigger
SET search_path = executive, pg_catalog, pg_temp AS $$
DECLARE d record;
BEGIN
  IF NEW.state IN ('completed', 'cancelled', 'lapsed') AND OLD.state IN ('open', 'escalated') THEN
    FOR d IN SELECT x.dependency_id, x.task_id FROM executive.human_task_dependencies x WHERE x.depends_on_task_id = NEW.task_id AND x.released_at IS NULL ORDER BY x.declared_at LOOP
      UPDATE executive.human_task_dependencies SET released_at = clock_timestamp(), released_by_state = NEW.state WHERE dependency_id = d.dependency_id;
      IF jsonb_array_length(executive.task_unmet_dependencies(d.task_id)) = 0 THEN
        INSERT INTO executive.human_task_events (event_id, scope, tenant_id, domain_id, task_id, event, actor_principal_id, details, correlation_id)
        VALUES (gen_random_uuid(), NEW.scope, NEW.tenant_id, NEW.domain_id, d.task_id, 'task.released', coalesce(NEW.completed_by, NEW.opened_by),
                jsonb_build_object('released_by', NEW.task_id, 'released_by_title', NEW.title, 'released_by_state', NEW.state, 'dependency_id', d.dependency_id), NEW.correlation_id);
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER xtd_release AFTER UPDATE OF state ON executive.human_tasks FOR EACH ROW EXECUTE FUNCTION executive.human_task_dependency_release();

/* THE DEFINITION'S STEP SCHEMA gains `depends_on` on a transition: the states whose INSTANCE tasks (human_tasks.instance_id = the instance,
   step = the state) must all be closed before the transition's event is admitted. Validated at publication (0090's validator admits any
   extra key on a transition object; this guard reads the one this section defines) and enforced on the transition (a guard on
   executive.workflow_transitions: `workflow rejected (dependency)`). 0090's ports are untouched. */
CREATE OR REPLACE FUNCTION executive.workflow_definition_depends_on_guard() RETURNS trigger
SET search_path = executive, pg_catalog, pg_temp AS $$
DECLARE t jsonb; s jsonb; v_states text[];
BEGIN
  SELECT array_agg(x) INTO v_states FROM jsonb_array_elements_text(NEW.spec -> 'states') x;
  FOR t IN SELECT * FROM jsonb_array_elements(coalesce(NEW.spec -> 'transitions', '[]'::jsonb)) LOOP
    IF t ? 'depends_on' THEN
      IF jsonb_typeof(t -> 'depends_on') <> 'array' OR jsonb_array_length(t -> 'depends_on') = 0 THEN
        RAISE EXCEPTION 'workflow definition rejected (depends_on): a transition''s depends_on is a non-empty list of states (%)', t::text USING ERRCODE = '22023';
      END IF;
      FOR s IN SELECT * FROM jsonb_array_elements(t -> 'depends_on') LOOP
        IF jsonb_typeof(s) <> 'string' OR NOT ((s #>> '{}') = ANY (v_states)) THEN
          RAISE EXCEPTION 'workflow definition rejected (depends_on): % is not a state of this definition (%)', s::text, t ->> 'event' USING ERRCODE = '22023';
        END IF;
        IF (s #>> '{}') = (t ->> 'to') THEN
          RAISE EXCEPTION 'workflow definition rejected (depends_on): the transition % cannot wait on the state it enters (%)', t ->> 'event', t ->> 'to' USING ERRCODE = '22023';
        END IF;
      END LOOP;
    END IF;
  END LOOP;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER xtd_definition_depends_on BEFORE INSERT ON executive.workflow_definitions FOR EACH ROW EXECUTE FUNCTION executive.workflow_definition_depends_on_guard();

CREATE OR REPLACE FUNCTION executive.workflow_transition_depends_on_guard() RETURNS trigger
SET search_path = executive, pg_catalog, pg_temp AS $$
DECLARE i executive.workflow_instances%ROWTYPE; d executive.workflow_definitions%ROWTYPE; t jsonb; v_open int; v_steps text[];
BEGIN
  IF NEW.kind = 'start' OR NEW.from_state IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO i FROM executive.workflow_instances x WHERE x.instance_id = NEW.instance_id;
  SELECT * INTO d FROM executive.workflow_definitions x WHERE x.definition_id = i.definition_id AND x.digest = i.def_digest;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT x INTO t FROM jsonb_array_elements(d.spec -> 'transitions') x WHERE x ->> 'from' = NEW.from_state AND x ->> 'event' = NEW.event LIMIT 1;
  IF t IS NULL OR NOT (t ? 'depends_on') THEN RETURN NEW; END IF;
  SELECT array_agg(x) INTO v_steps FROM jsonb_array_elements_text(t -> 'depends_on') x;
  SELECT count(*) INTO v_open FROM executive.human_tasks h WHERE h.instance_id = NEW.instance_id AND h.step = ANY (v_steps) AND h.state IN ('open', 'escalated');
  IF v_open > 0 THEN
    RAISE EXCEPTION 'workflow rejected (dependency): % from % waits on % open task(s) of step(s) %', NEW.event, NEW.from_state, v_open, array_to_string(v_steps, ', ') USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER xtd_transition_depends_on BEFORE INSERT ON executive.workflow_transitions FOR EACH ROW EXECUTE FUNCTION executive.workflow_transition_depends_on_guard();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §C3 THE LOCAL INVITATION DELIVERY AND PICKUP (t)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
/* ONE DELIVERY PER GRANT: the invitation is delivered to the invitee's SYNTHETIC mailbox (0090's executive.collab_invitation_mail keeps the
   subject and the message's digest; the message itself, carrying the PICKUP CODE and never the token, is held in the API process's synthetic
   sink — a real provider is owner decision D6). The CODE is random, hashed at rest (sha256 over grant id and code), and expires with the
   invitation window. The TOKEN — the acceptance material 0091 §F1's port compares — is SEALED under the code (AES-256-GCM, the key derived
   from the code and the grant id in the API process) and stored sealed: no table holds it in clear, and only the person holding the code
   can open it. The pickup answers it ONCE. */
CREATE TABLE executive.invitation_deliveries (
  delivery_id            uuid PRIMARY KEY,
  scope                  text NOT NULL,
  tenant_id              uuid NOT NULL,
  domain_id              uuid NOT NULL,
  grant_id               uuid NOT NULL UNIQUE REFERENCES executive.collab_grants (grant_id),
  message_id             uuid NOT NULL REFERENCES executive.collab_invitation_mail (message_id),
  recipient_principal_id uuid NOT NULL,
  channel                text NOT NULL DEFAULT 'demo-mailbox' CHECK (channel = 'demo-mailbox'),
  code_hash              text NOT NULL CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  sealed_material        text NOT NULL CHECK (sealed_material ~ '^[A-Za-z0-9+/=]+$' AND length(sealed_material) BETWEEN 64 AND 4096),
  code_expires_at        timestamptz NOT NULL,
  failures               int NOT NULL DEFAULT 0 CHECK (failures BETWEEN 0 AND 5),
  locked_at              timestamptz,
  picked_up_at           timestamptz,
  picked_up_from         text CHECK (picked_up_from IS NULL OR length(picked_up_from) BETWEEN 1 AND 200),
  synthetic_state        boolean NOT NULL DEFAULT true CHECK (synthetic_state),
  delivered_by           uuid NOT NULL,
  delivered_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id         uuid NOT NULL,
  CONSTRAINT xid_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xid_picked CHECK ((picked_up_at IS NULL) = (picked_up_from IS NULL)),
  CONSTRAINT xid_locked CHECK (locked_at IS NULL OR failures = 5)
);
/* Forward-only: only the failures (monotonic, at most five), the lock and the pickup ever change; nothing else of the row. */
CREATE OR REPLACE FUNCTION executive.invitation_deliveries_forward() RETURNS trigger
SET search_path = executive, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'invitation deliveries are append-only: DELETE prohibited' USING ERRCODE = '2F002'; END IF;
  IF (to_jsonb(NEW) - 'failures' - 'locked_at' - 'picked_up_at' - 'picked_up_from') <> (to_jsonb(OLD) - 'failures' - 'locked_at' - 'picked_up_at' - 'picked_up_from')
     OR NEW.failures < OLD.failures OR (OLD.locked_at IS NOT NULL AND NEW.locked_at IS DISTINCT FROM OLD.locked_at) OR (OLD.picked_up_at IS NOT NULL AND NEW.picked_up_at IS DISTINCT FROM OLD.picked_up_at) THEN
    RAISE EXCEPTION 'invitation delivery % is immutable but for its failures, its lock and its pickup', OLD.delivery_id USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER xid_forward BEFORE UPDATE OR DELETE ON executive.invitation_deliveries FOR EACH ROW EXECUTE FUNCTION executive.invitation_deliveries_forward();

/* EVERY ATTEMPT, whatever its outcome, from where (the caller's stated address — a loopback in the harness and the demonstration). */
CREATE TABLE executive.invitation_pickups (
  pickup_id       uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  grant_id        uuid NOT NULL REFERENCES executive.collab_grants (grant_id),
  outcome         text NOT NULL CHECK (outcome IN ('picked_up', 'wrong_code', 'locked', 'expired', 'already_picked_up', 'not_delivered', 'grant_not_open')),
  failures_after  int NOT NULL CHECK (failures_after BETWEEN 0 AND 5),
  from_address    text NOT NULL CHECK (length(from_address) BETWEEN 1 AND 200),
  attempted_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT xip_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX xip_grant ON executive.invitation_pickups (grant_id, attempted_at);
CREATE TRIGGER xip_append_only BEFORE UPDATE OR DELETE ON executive.invitation_pickups FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* THE DELIVERY (the identity administrator's act, after 0091's activation committed — the same bound action executive.collab.provision):
   the grant is `invited` and its mailbox record exists; one delivery per grant; the code's hash and the sealed material recorded; the
   delivery's own row is the record (never the code, never the token). */
CREATE OR REPLACE FUNCTION executive.deliver_invitation(p_delivery_id uuid, p_tenant uuid, p_domain uuid, p_grant uuid, p_code_hash text, p_sealed text, p_code_expires_at timestamptz, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE g executive.collab_grants%ROWTYPE; m executive.collab_invitation_mail%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.collab.provision']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'invitation rejected (actor): delivered by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO g FROM executive.collab_grants x WHERE x.grant_id = p_grant AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invitation rejected (unknown_invitation): no grant % in this domain', p_grant USING ERRCODE = '23503'; END IF;
  IF g.provisioned_by IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'invitation rejected (provisioner): the identity administrator who provisioned the invitation delivers it' USING ERRCODE = '42501'; END IF;
  IF g.state <> 'invited' THEN RAISE EXCEPTION 'invitation rejected (state): the grant is %; an invited grant is delivered', g.state USING ERRCODE = '23505'; END IF;
  SELECT * INTO m FROM executive.collab_invitation_mail x WHERE x.grant_id = p_grant;
  IF NOT FOUND THEN RAISE EXCEPTION 'invitation rejected (state): the grant has no mailbox record to deliver' USING ERRCODE = '23505'; END IF;
  IF EXISTS (SELECT 1 FROM executive.invitation_deliveries d WHERE d.grant_id = p_grant) THEN RAISE EXCEPTION 'invitation rejected (duplicate): the invitation of grant % is delivered already', p_grant USING ERRCODE = '23505'; END IF;
  IF coalesce(p_code_hash, '') !~ '^[0-9a-f]{64}$' OR coalesce(p_sealed, '') !~ '^[A-Za-z0-9+/=]+$' OR length(coalesce(p_sealed, '')) NOT BETWEEN 64 AND 4096 THEN
    RAISE EXCEPTION 'invitation rejected (material): a delivery carries the code''s hash and the sealed acceptance material' USING ERRCODE = '22023';
  END IF;
  IF p_code_expires_at IS NULL OR p_code_expires_at <= clock_timestamp() OR p_code_expires_at > g.invitation_expires_at THEN
    RAISE EXCEPTION 'invitation rejected (expiry): the code expires in the future and no later than the invitation window' USING ERRCODE = '22023';
  END IF;
  -- the delivery IS the record (its row; the workspace's event log gains nothing here: the provisioning path's log is pinned by the B34-F1 harness)
  INSERT INTO executive.invitation_deliveries (delivery_id, scope, tenant_id, domain_id, grant_id, message_id, recipient_principal_id, code_hash, sealed_material, code_expires_at, delivered_by, correlation_id)
  VALUES (p_delivery_id, 'DOMAIN', p_tenant, p_domain, p_grant, m.message_id, g.principal_id, p_code_hash, p_sealed, p_code_expires_at, p_actor, p_correlation);
  RETURN jsonb_build_object('delivery_id', p_delivery_id, 'grant_id', p_grant, 'message_id', m.message_id, 'channel', 'demo-mailbox', 'synthetic', true, 'code_expires_at', p_code_expires_at,
                            'recipient', g.principal_id, 'login_name', g.login_name, 'delivered_by', p_actor, 'pickup', 'POST /v1/collab/invitations/pickup {invitationId, code}');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.deliver_invitation(uuid, uuid, uuid, uuid, text, text, timestamptz, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.deliver_invitation(uuid, uuid, uuid, uuid, text, text, timestamptz, uuid, uuid) TO eye_commit;

/* THE PICKUP — the one port of this system reached WITHOUT A PRINCIPAL (the addressed person is not yet a principal): the mailbox's one-time
   code is its authority, so it asserts no bound action and no scope (stated). It NEVER raises: every attempt is a row of
   executive.invitation_pickups whatever its outcome (a refusal that rolled the ledger back would leave the failures uncounted), and the
   caller maps the outcome to its refusal after the commit. Wrong code: counted; the fifth failure LOCKS the invitation (invitation.locked;
   the owner revokes and re-invites). Picked up: once; a second pickup refused (already_picked_up). Expired: the code's expiry, the
   invitation window or the grant. Only the SEALED material leaves — opened in the process by the code the caller holds. */
CREATE OR REPLACE FUNCTION executive.pickup_invitation(p_grant uuid, p_code_hash text, p_from text, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, public, pg_catalog, pg_temp AS $$
DECLARE g executive.collab_grants%ROWTYPE; d executive.invitation_deliveries%ROWTYPE; w executive.collab_workspaces%ROWTYPE; v_outcome text; v_failures int;
BEGIN
  SELECT * INTO g FROM executive.collab_grants x WHERE x.grant_id = p_grant;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'unknown_invitation', 'grant_id', p_grant); END IF;
  SELECT * INTO d FROM executive.invitation_deliveries x WHERE x.grant_id = p_grant FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO executive.invitation_pickups (pickup_id, scope, tenant_id, domain_id, grant_id, outcome, failures_after, from_address, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', g.tenant_id, g.domain_id, p_grant, 'not_delivered', 0, left(coalesce(p_from, 'unstated'), 200), p_correlation);
    RETURN jsonb_build_object('outcome', 'not_delivered', 'grant_id', p_grant);
  END IF;
  v_failures := d.failures;
  IF d.locked_at IS NOT NULL THEN v_outcome := 'locked';
  ELSIF d.picked_up_at IS NOT NULL THEN v_outcome := 'already_picked_up';
  ELSIF g.state <> 'invited' THEN v_outcome := 'grant_not_open';
  ELSIF d.code_expires_at <= clock_timestamp() OR g.invitation_expires_at <= clock_timestamp() OR g.expires_at <= clock_timestamp() THEN v_outcome := 'expired';
  ELSIF coalesce(p_code_hash, '') <> d.code_hash THEN
    v_outcome := 'wrong_code'; v_failures := least(d.failures + 1, 5);
    UPDATE executive.invitation_deliveries SET failures = v_failures, locked_at = CASE WHEN v_failures >= 5 THEN clock_timestamp() ELSE NULL END WHERE delivery_id = d.delivery_id;
    IF v_failures >= 5 THEN
      v_outcome := 'locked';
      PERFORM executive._collab_event(g.workspace_id, g.tenant_id, g.domain_id, 'invitation.locked', g.provisioned_by,
                jsonb_build_object('grant_id', p_grant, 'delivery_id', d.delivery_id, 'failures', v_failures, 'from', left(coalesce(p_from, 'unstated'), 200), 'next', 'the owner revokes and re-invites'), p_correlation);
    ELSE
      PERFORM executive._collab_event(g.workspace_id, g.tenant_id, g.domain_id, 'invitation.pickup_refused', g.provisioned_by,
                jsonb_build_object('grant_id', p_grant, 'delivery_id', d.delivery_id, 'failures', v_failures, 'from', left(coalesce(p_from, 'unstated'), 200)), p_correlation);
    END IF;
  ELSE
    v_outcome := 'picked_up';
    UPDATE executive.invitation_deliveries SET picked_up_at = clock_timestamp(), picked_up_from = left(coalesce(p_from, 'unstated'), 200) WHERE delivery_id = d.delivery_id;
    PERFORM executive._collab_event(g.workspace_id, g.tenant_id, g.domain_id, 'invitation.picked_up', g.principal_id,
              jsonb_build_object('grant_id', p_grant, 'delivery_id', d.delivery_id, 'from', left(coalesce(p_from, 'unstated'), 200), 'next', 'the invitee signs in with the material and accepts (0091 §F1)'), p_correlation);
  END IF;
  INSERT INTO executive.invitation_pickups (pickup_id, scope, tenant_id, domain_id, grant_id, outcome, failures_after, from_address, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', g.tenant_id, g.domain_id, p_grant, v_outcome, v_failures, left(coalesce(p_from, 'unstated'), 200), p_correlation);
  IF v_outcome <> 'picked_up' THEN RETURN jsonb_build_object('outcome', v_outcome, 'grant_id', p_grant, 'failures', v_failures, 'remaining', 5 - v_failures); END IF;
  SELECT * INTO w FROM executive.collab_workspaces x WHERE x.workspace_id = g.workspace_id;
  RETURN jsonb_build_object('outcome', 'picked_up', 'grant_id', p_grant, 'tenant_id', g.tenant_id, 'domain_id', g.domain_id, 'workspace_id', g.workspace_id, 'workspace_title', w.title,
                            'purpose', g.purpose, 'audience_ceiling', g.audience_ceiling, 'expires_at', g.expires_at, 'invitation_expires_at', g.invitation_expires_at,
                            'principal_id', g.principal_id, 'login_name', g.login_name, 'display_name', g.display_name, 'sealed_material', d.sealed_material, 'picked_up_at', clock_timestamp());
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.pickup_invitation(uuid, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.pickup_invitation(uuid, text, text, uuid) TO eye_commit;

/* The delivery as a member reads it (never the hash, never the sealed material): the state of the invitation's pickup. */
CREATE OR REPLACE FUNCTION executive.invitation_delivery_of(p_grant uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = executive, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN d.delivery_id IS NULL THEN NULL ELSE jsonb_build_object('delivery_id', d.delivery_id, 'channel', d.channel, 'synthetic', d.synthetic_state, 'delivered_at', d.delivered_at,
    'code_expires_at', d.code_expires_at, 'failures', d.failures, 'locked_at', d.locked_at, 'picked_up_at', d.picked_up_at, 'picked_up_from', d.picked_up_from,
    'state', CASE WHEN d.locked_at IS NOT NULL THEN 'locked' WHEN d.picked_up_at IS NOT NULL THEN 'picked_up' WHEN d.code_expires_at <= clock_timestamp() THEN 'expired' ELSE 'delivered' END,
    'attempts', (SELECT coalesce(jsonb_agg(jsonb_build_object('outcome', p.outcome, 'from', p.from_address, 'at', p.attempted_at) ORDER BY p.attempted_at), '[]'::jsonb) FROM executive.invitation_pickups p WHERE p.grant_id = p_grant)) END
    FROM (VALUES (1)) n(one) LEFT JOIN executive.invitation_deliveries d ON d.grant_id = p_grant
$$;
GRANT EXECUTE ON FUNCTION executive.invitation_delivery_of(uuid) TO eye_app, eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §C4 THE ENFORCED ACTIVATION OF A REAL EXECUTION TARGET (u; F-P6-05)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
/* A target's ACTIVATION STATE: `synthetic` for a target recorded synthetic (0090's declare — every target until now); `inactive` at
   registration for a NON-synthetic one; `active` only through decision.activate_execution_target. The 0090 CHECK that admitted only
   synthetic rows is replaced by the binding of the flag to the state; 0090's retire-only trigger compares the columns it names, so the
   activation columns move under it without a re-declaration. */
ALTER TABLE decision.execution_targets DROP CONSTRAINT execution_targets_synthetic_check;
ALTER TABLE decision.execution_targets
  ADD COLUMN activation_state       text NOT NULL DEFAULT 'synthetic' CHECK (activation_state IN ('synthetic', 'inactive', 'active')),
  ADD COLUMN activated_at           timestamptz,
  ADD COLUMN activated_by           uuid,
  ADD COLUMN authorized_by_decision uuid,
  ADD COLUMN deactivated_at         timestamptz,
  ADD COLUMN deactivated_by         uuid,
  ADD COLUMN deactivation_reason    text;
ALTER TABLE decision.execution_targets ADD CONSTRAINT det_activation_bound CHECK (
  (synthetic AND activation_state = 'synthetic' AND activated_at IS NULL AND authorized_by_decision IS NULL)
  OR (NOT synthetic AND activation_state IN ('inactive', 'active')
      AND ((activation_state = 'active') = (activated_at IS NOT NULL AND activated_by IS NOT NULL AND authorized_by_decision IS NOT NULL AND deactivated_at IS NULL))));

/* REGISTER a NON-synthetic target `inactive` (the domain administrator; the same shape as 0090's declare — an https endpoint without
   userinfo, a trust anchor, a credential by reference — recorded synthetic = false). Registering is NOT activating: no handoff reaches it
   until a named execution authority activates it with the owner's decision. The harness registers a LOOPBACK LITERAL as its "real" target:
   nothing real is reached, and the production egress refuses it by the B14 rule. */
CREATE OR REPLACE FUNCTION decision.register_execution_target(
  p_target_id uuid, p_tenant uuid, p_domain uuid, p_key text, p_label text, p_endpoint text, p_trust_anchor text, p_credential_ref text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.execution.target.register']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'execution registration rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'execution registration rejected (actor): a named, active member registers a target' USING ERRCODE = '42501'; END IF;
  IF p_key IS NULL OR p_key !~ '^[a-z0-9][a-z0-9-]{1,62}$' THEN RAISE EXCEPTION 'execution registration rejected (key): lower-case letters, digits and dashes, 2 to 63' USING ERRCODE = '22023'; END IF;
  IF coalesce(length(btrim(p_label)), 0) NOT BETWEEN 2 AND 200 THEN RAISE EXCEPTION 'execution registration rejected (label): 2 to 200 characters' USING ERRCODE = '22023'; END IF;
  IF p_endpoint IS NULL OR p_endpoint !~ '^https://[^/@\s]+(/[^\s]*)?$' THEN RAISE EXCEPTION 'execution registration rejected (endpoint): an https:// URL without userinfo' USING ERRCODE = '22023'; END IF;
  IF p_trust_anchor IS NULL OR btrim(p_trust_anchor) = '' THEN RAISE EXCEPTION 'execution registration rejected (trust_anchor): a non-synthetic target declares the trust anchor its TLS identity is verified against' USING ERRCODE = '22023'; END IF;
  IF p_credential_ref IS NOT NULL AND p_credential_ref !~ '^EYE_DST_[A-Z0-9_]{1,64}$' THEN
    RAISE EXCEPTION 'execution registration rejected (credential_ref): the deployment variable EYE_DST_<NAME>' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM decision.execution_targets t WHERE t.tenant_id = p_tenant AND t.domain_id = p_domain AND t.target_key = p_key) THEN
    RAISE EXCEPTION 'execution registration rejected (duplicate): % is declared in this domain; a target is retired, never redeclared', p_key USING ERRCODE = '23505';
  END IF;
  INSERT INTO decision.execution_targets (target_id, scope, tenant_id, domain_id, target_key, label, endpoint, trust_anchor_pem, credential_ref, synthetic, activation_state, declared_by, correlation_id)
  VALUES (p_target_id, 'DOMAIN', p_tenant, p_domain, p_key, btrim(p_label), p_endpoint, p_trust_anchor, p_credential_ref, false, 'inactive', p_actor, p_correlation);
  PERFORM decision._commitment_event(p_tenant, p_domain, NULL, NULL, 'target.declared', p_actor, jsonb_build_object('target_id', p_target_id, 'target_key', p_key, 'endpoint', p_endpoint, 'synthetic', false,
                                     'activation_state', 'inactive', 'trust_anchor', true, 'credential_ref', p_credential_ref, 'next', 'an execution authority activates it with the owner''s committed decision'), p_correlation);
  RETURN (SELECT to_jsonb(t) - 'trust_anchor_pem' || jsonb_build_object('trust_anchor_declared', true) FROM decision.execution_targets t WHERE t.target_id = p_target_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.register_execution_target(uuid, uuid, uuid, text, text, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.register_execution_target(uuid, uuid, uuid, text, text, text, text, text, uuid, uuid) TO eye_commit;

/* ACTIVATE (the owner-authorized, recorded activation): a named, active member holding execution_authority who is NOT the target's registrar
   (two acts, two people), with the OWNER'S DECISION — a decision package of this domain, COMMITTED through the gate, whose committed
   version's payload (the choice, the constraints, the title or the statement) names the target's key. A synthetic target is never
   activated (it has no activation to make); a retired one neither; an active one is not activated twice. Recorded on the target and on
   the authorizing decision's log (execution.target_activated — §0's vocabulary). */
CREATE OR REPLACE FUNCTION decision.activate_execution_target(p_tenant uuid, p_domain uuid, p_key text, p_decision uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t decision.execution_targets%ROWTYPE; p decision.packages_current%ROWTYPE; v decision.package_versions%ROWTYPE; cm decision.commitments%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.execution.target.activate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'execution activation rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) OR NOT decision.holds_role(p_actor, p_tenant, p_domain, 'execution_authority') THEN
    RAISE EXCEPTION 'execution activation rejected (authority): principal % is not an active member holding execution_authority in this domain', p_actor USING ERRCODE = '42501';
  END IF;
  SELECT * INTO t FROM decision.execution_targets x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.target_key = p_key FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'execution activation rejected (unknown_target): no target % in this domain', p_key USING ERRCODE = '23503'; END IF;
  IF t.state <> 'active' THEN RAISE EXCEPTION 'execution activation rejected (retired): target % is retired', p_key USING ERRCODE = '23505'; END IF;
  IF t.synthetic THEN RAISE EXCEPTION 'execution activation rejected (synthetic): target % is recorded synthetic — it has no activation to make; a real target is registered non-synthetic first', p_key USING ERRCODE = '23505'; END IF;
  IF t.activation_state = 'active' THEN RAISE EXCEPTION 'execution activation rejected (state): target % is active already (since %, by decision %)', p_key, t.activated_at, t.authorized_by_decision USING ERRCODE = '23505'; END IF;
  IF p_actor = t.declared_by THEN RAISE EXCEPTION 'execution activation rejected (separation): the registrar of target % never activates it — a second named human does', p_key USING ERRCODE = '42501'; END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_decision AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'execution activation rejected (unknown_decision): no decision package % in this domain', p_decision USING ERRCODE = '23503'; END IF;
  IF p.state NOT IN ('committed', 'monitoring') OR p.committed_version IS NULL THEN
    RAISE EXCEPTION 'execution activation rejected (decision_not_committed): decision % is %; the owner''s decision is COMMITTED through the gate before it authorizes an activation', p_decision, p.state USING ERRCODE = '23505';
  END IF;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_decision AND x.version = p.committed_version;
  SELECT * INTO cm FROM decision.commitments x WHERE x.package_id = p_decision;
  IF position(lower(p_key) IN lower(coalesce(v.choice::text, '') || ' ' || coalesce(v.constraints::text, '') || ' ' || p.title || ' ' || p.statement)) = 0 THEN
    RAISE EXCEPTION 'execution activation rejected (decision_names_no_target): the committed decision % names no target %; the owner''s decision states which target it authorizes', p_decision, p_key USING ERRCODE = '22023';
  END IF;
  UPDATE decision.execution_targets SET activation_state = 'active', activated_at = clock_timestamp(), activated_by = p_actor, authorized_by_decision = p_decision,
                                        deactivated_at = NULL, deactivated_by = NULL, deactivation_reason = NULL WHERE target_id = t.target_id;
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_decision, 'execution.target_activated', p_actor,
          jsonb_build_object('target_id', t.target_id, 'target_key', p_key, 'endpoint', t.endpoint, 'synthetic', false, 'registered_by', t.declared_by, 'activated_by', p_actor,
                             'authorized_by_decision', p_decision, 'committed_version', p.committed_version, 'committed_by', cm.committed_by, 'decision_owner', p.owner_principal_id), p_correlation);
  RETURN (SELECT to_jsonb(x) - 'trust_anchor_pem' || jsonb_build_object('trust_anchor_declared', x.trust_anchor_pem IS NOT NULL, 'decision', jsonb_build_object('package_id', p_decision, 'title', p.title, 'state', p.state,
            'committed_version', p.committed_version, 'owner', p.owner_principal_id, 'committed_by', cm.committed_by))
          FROM decision.execution_targets x WHERE x.target_id = t.target_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.activate_execution_target(uuid, uuid, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.activate_execution_target(uuid, uuid, text, uuid, uuid, uuid) TO eye_commit;

/* DEACTIVATE (an execution authority or a domain administrator, a reason): new handoffs refused at once (the gateway below reads the
   state); what is in flight stays in flight under its own record. Recorded on the target and on the authorizing decision's log. */
CREATE OR REPLACE FUNCTION decision.deactivate_execution_target(p_tenant uuid, p_domain uuid, p_key text, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t decision.execution_targets%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.execution.target.deactivate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'execution activation rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) OR NOT (decision.holds_role(p_actor, p_tenant, p_domain, 'execution_authority') OR decision.holds_role(p_actor, p_tenant, p_domain, 'domain_admin')) THEN
    RAISE EXCEPTION 'execution activation rejected (authority): principal % is not an active member holding execution_authority or domain_admin in this domain', p_actor USING ERRCODE = '42501';
  END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'execution activation rejected (reason): a deactivation states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO t FROM decision.execution_targets x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.target_key = p_key FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'execution activation rejected (unknown_target): no target % in this domain', p_key USING ERRCODE = '23503'; END IF;
  IF t.synthetic THEN RAISE EXCEPTION 'execution activation rejected (synthetic): target % is recorded synthetic — it is retired, never deactivated', p_key USING ERRCODE = '23505'; END IF;
  IF t.activation_state <> 'active' THEN RAISE EXCEPTION 'execution activation rejected (state): target % is %, not active', p_key, t.activation_state USING ERRCODE = '23505'; END IF;
  UPDATE decision.execution_targets SET activation_state = 'inactive', deactivated_at = clock_timestamp(), deactivated_by = p_actor, deactivation_reason = btrim(p_reason),
                                        activated_at = NULL, activated_by = NULL, authorized_by_decision = NULL WHERE target_id = t.target_id;
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, t.authorized_by_decision, 'execution.target_deactivated', p_actor,
          jsonb_build_object('target_id', t.target_id, 'target_key', p_key, 'reason', btrim(p_reason), 'was_active_since', t.activated_at, 'activated_by', t.activated_by, 'authorized_by_decision', t.authorized_by_decision), p_correlation);
  RETURN (SELECT to_jsonb(x) - 'trust_anchor_pem' || jsonb_build_object('trust_anchor_declared', x.trust_anchor_pem IS NOT NULL, 'previously', jsonb_build_object('activated_at', t.activated_at, 'activated_by', t.activated_by, 'authorized_by_decision', t.authorized_by_decision))
          FROM decision.execution_targets x WHERE x.target_id = t.target_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.deactivate_execution_target(uuid, uuid, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.deactivate_execution_target(uuid, uuid, text, text, uuid, uuid) TO eye_commit;

/* THE GATEWAY — decision.issue_execution_handoff re-declared from 0090 §C5 line 2090 WHOLE with ONE addition (marked B36): a NON-synthetic
   target that is not `active` refuses the issue — `execution handoff rejected (inactive_target)`; a synthetic target is unaffected. The
   returned target object also names its activation_state (the same addition: the issuer's answer says what it reached). */
CREATE OR REPLACE FUNCTION decision.issue_execution_handoff(p_tenant uuid, p_domain uuid, p_handoff uuid, p_payload_digest text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE h decision.execution_handoffs%ROWTYPE; t decision.execution_targets%ROWTYPE; cm decision.commitments%ROWTYPE; i decision.commitment_items%ROWTYPE; v_event uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.execution.issue']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF public.eye_op_class() IS DISTINCT FROM 'C3' THEN
    RAISE EXCEPTION 'execution issue rejected (class): decision.execution.issue requires a C3 authority context; this context is %', coalesce(public.eye_op_class(), 'unclassed') USING ERRCODE = '42501';
  END IF;
  IF public.eye_bound_action() IS DISTINCT FROM 'decision.execution.issue' THEN
    RAISE EXCEPTION 'execution issue rejected (bound_action): the context is bound to %, not decision.execution.issue', public.eye_bound_action() USING ERRCODE = '42501';
  END IF;
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'execution issue rejected (actor): issued by the acting principal, never on behalf of another' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) OR NOT decision.holds_role(p_actor, p_tenant, p_domain, 'execution_authority') THEN
    RAISE EXCEPTION 'execution issue rejected (authority): principal % is not an active member holding execution_authority in this domain', p_actor USING ERRCODE = '42501';
  END IF;
  SELECT * INTO h FROM decision.execution_handoffs x WHERE x.handoff_id = p_handoff AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'execution issue rejected (unknown_handoff): no handoff % in this domain', p_handoff USING ERRCODE = '23503'; END IF;
  IF h.state <> 'drafted' THEN RAISE EXCEPTION 'execution issue rejected (state): handoff % is %; a draft is issued once', p_handoff, h.state USING ERRCODE = '22023'; END IF;
  IF p_actor = h.drafted_by THEN RAISE EXCEPTION 'execution issue rejected (separation): the drafter of handoff % never issues it', p_handoff USING ERRCODE = '42501'; END IF;
  SELECT * INTO cm FROM decision.commitments x WHERE x.commitment_id = h.commitment_id;
  IF p_actor = cm.committed_by THEN RAISE EXCEPTION 'execution issue rejected (separation): the decision''s committer never issues its execution' USING ERRCODE = '42501'; END IF;
  IF p_payload_digest IS DISTINCT FROM h.payload_digest THEN
    RAISE EXCEPTION 'execution issue rejected (stale_digest): the digest issued (%) is not the draft''s (%); an issue signs what was read', p_payload_digest, h.payload_digest USING ERRCODE = '22023';
  END IF;
  SELECT * INTO t FROM decision.execution_targets x WHERE x.target_id = h.target_id;
  IF t.state <> 'active' THEN RAISE EXCEPTION 'execution issue rejected (target_retired): target % is retired', t.target_key USING ERRCODE = '22023'; END IF;
  -- B36 (0094 §C4): THE ONE ADDITION — a real (non-synthetic) target carries a handoff only while ACTIVE (an owner-authorized, recorded activation)
  IF NOT t.synthetic AND t.activation_state <> 'active' THEN
    RAISE EXCEPTION 'execution handoff rejected (inactive_target): target % is % — a named execution authority activates it with the owner''s committed decision before any handoff reaches it', t.target_key, t.activation_state USING ERRCODE = '23505';
  END IF;
  -- end B36
  SELECT * INTO i FROM decision.commitment_items x WHERE x.item_id = h.item_id;
  UPDATE decision.execution_handoffs SET state = 'issuing', issued_by = p_actor, issued_at = clock_timestamp(), next_attempt_at = clock_timestamp(), policy_decision_id = public.eye_policy_decision()
   WHERE handoff_id = p_handoff;
  v_event := decision._commitment_event(p_tenant, p_domain, h.commitment_id, h.item_id, 'handoff.issued', p_actor,
                                        jsonb_build_object('handoff_id', p_handoff, 'target_key', t.target_key, 'payload_digest', h.payload_digest, 'op_class', 'C3', 'policy_decision_id', public.eye_policy_decision()), p_correlation);
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, i.package_id, 'execution.handoff_issued', p_actor,
          jsonb_build_object('commitment_id', h.commitment_id, 'item_id', h.item_id, 'handoff_id', p_handoff, 'target_key', t.target_key, 'payload_digest', h.payload_digest, 'role', h.role), p_correlation);
  RETURN jsonb_build_object('handoff_id', p_handoff, 'commitment_id', h.commitment_id, 'item_id', h.item_id, 'state', 'issuing', 'payload', h.payload, 'payload_digest', h.payload_digest,
                            'target', jsonb_build_object('target_key', t.target_key, 'endpoint', t.endpoint, 'trust_anchor_pem', t.trust_anchor_pem, 'credential_ref', t.credential_ref, 'synthetic', t.synthetic,
                                                         'activation_state', t.activation_state),
                            'event_id', v_event, 'attempts', 0);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.issue_execution_handoff(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.issue_execution_handoff(uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §C5 THE LEARN STEP (j; JRN-09, PR-28-001/-002, CAP-FW-05)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
/* After an outcome review (0090 §X5 — the effect, the residual, the lesson), the LEARNING on the exposure's lineage: what was EXPECTED
   (the accepted assessment the response was opened under — its probability bracket or plausibility, its impact range and unit, its
   version), what HAPPENED (the review's outcomes and its effect), and what CHANGES in the estimate's basis (the owner's words: the next
   assessment's basis). One learning per review; the owner or the sponsor records it; append-only. */
CREATE TABLE prediction.exposure_learnings (
  learning_id      uuid PRIMARY KEY,
  scope            text NOT NULL,
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  exposure_id      uuid NOT NULL REFERENCES prediction.exposure_current (exposure_id),
  review_id        uuid NOT NULL UNIQUE REFERENCES prediction.exposure_outcome_reviews (review_id),
  response_id      uuid NOT NULL REFERENCES prediction.exposure_responses (response_id),
  basis_version    int,
  expected         jsonb NOT NULL CHECK (jsonb_typeof(expected) = 'object'),
  observed         jsonb NOT NULL CHECK (jsonb_typeof(observed) = 'object'),
  basis_change     text NOT NULL CHECK (length(btrim(basis_change)) BETWEEN 16 AND 4000),
  recorded_by      uuid NOT NULL,
  recorded_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id   uuid NOT NULL,
  CONSTRAINT pexl_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX pexl_exposure ON prediction.exposure_learnings (exposure_id, recorded_at);
COMMENT ON TABLE prediction.exposure_learnings IS 'B36 (0094 §C5): the learn step of the outcome loop — after an outcome review, what was expected, what happened, what changes in the estimate''s basis (JRN-09, PR-28-001/-002, CAP-FW-05); append-only';
CREATE TRIGGER pexl_append_only BEFORE UPDATE OR DELETE ON prediction.exposure_learnings FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
ALTER TABLE prediction.exposure_learnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction.exposure_learnings FORCE ROW LEVEL SECURITY;
CREATE POLICY prediction_isolation ON prediction.exposure_learnings USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
GRANT SELECT ON prediction.exposure_learnings TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION prediction.record_exposure_learning(p_learning_id uuid, p_exposure uuid, p_tenant uuid, p_domain uuid, p_review uuid, p_expected_note text, p_observed_note text, p_basis_change text,
                                                              p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, decision, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x prediction.exposure_current%ROWTYPE; k prediction.exposure_outcome_reviews%ROWTYPE; v prediction.exposure_versions%ROWTYPE; v_expected jsonb; v_observed jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.exposure.learn']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'exposure learning rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO x FROM prediction.exposure_current e WHERE e.exposure_id = p_exposure AND e.tenant_id = p_tenant AND e.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'exposure learning rejected (unknown_exposure): no exposure % in this domain', p_exposure USING ERRCODE = '23503'; END IF;
  IF (p_actor IS DISTINCT FROM x.owner_principal_id AND p_actor IS DISTINCT FROM x.sponsor_principal_id) OR NOT decision.is_active_human(p_actor, p_tenant) THEN
    RAISE EXCEPTION 'exposure learning rejected (not_owner): a learning is recorded by the exposure''s owner (%) or its sponsor, a named, active member', x.owner_principal_id USING ERRCODE = '42501';
  END IF;
  SELECT * INTO k FROM prediction.exposure_outcome_reviews r WHERE r.review_id = p_review AND r.exposure_id = p_exposure;
  IF NOT FOUND THEN RAISE EXCEPTION 'exposure learning rejected (unknown_review): no outcome review % of exposure %', p_review, p_exposure USING ERRCODE = '23503'; END IF;
  IF EXISTS (SELECT 1 FROM prediction.exposure_learnings l WHERE l.review_id = p_review) THEN
    RAISE EXCEPTION 'exposure learning rejected (duplicate): the outcome review % carries its learning already; a later review learns again', p_review USING ERRCODE = '23505';
  END IF;
  IF coalesce(length(btrim(p_basis_change)), 0) NOT BETWEEN 16 AND 4000 THEN RAISE EXCEPTION 'exposure learning rejected (basis_change): what changes in the estimate''s basis (16..4000 characters)' USING ERRCODE = '22023'; END IF;
  IF coalesce(length(btrim(p_expected_note)), 0) NOT BETWEEN 8 AND 2000 OR coalesce(length(btrim(p_observed_note)), 0) NOT BETWEEN 8 AND 2000 THEN
    RAISE EXCEPTION 'exposure learning rejected (notes): what was expected and what happened, each in words (8..2000 characters)' USING ERRCODE = '22023';
  END IF;
  -- what was EXPECTED: the assessment in force (accepted, else current) — the bracket the response was opened under
  SELECT * INTO v FROM prediction.exposure_versions w WHERE w.exposure_id = p_exposure AND w.version = coalesce(x.accepted_version, NULLIF(x.current_version, 0));
  v_expected := jsonb_build_object('note', btrim(p_expected_note), 'version', v.version, 'version_state', v.state,
                                   'probability', CASE WHEN v.probability_low IS NULL THEN NULL ELSE jsonb_build_object('low', v.probability_low, 'high', v.probability_high) END,
                                   'plausibility', v.plausibility, 'impact', jsonb_build_object('low', v.impact_low, 'high', v.impact_high, 'unit', v.unit), 'horizon', v.horizon,
                                   'residual_before_review', k.residual_before);
  v_observed := jsonb_build_object('note', btrim(p_observed_note), 'outcomes', k.outcomes, 'effect', k.effect, 'residual_verdict', k.residual_verdict, 'residual_after_review', k.residual_after,
                                   'lesson', k.lesson, 'reviewed_at', k.reviewed_at);
  INSERT INTO prediction.exposure_learnings (learning_id, scope, tenant_id, domain_id, exposure_id, review_id, response_id, basis_version, expected, observed, basis_change, recorded_by, correlation_id)
  VALUES (p_learning_id, 'DOMAIN', p_tenant, p_domain, p_exposure, p_review, k.response_id, v.version, v_expected, v_observed, btrim(p_basis_change), p_actor, p_correlation);
  PERFORM prediction.exposure_event(p_exposure, p_tenant, p_domain, 'exposure.learning_recorded', p_actor,
    jsonb_build_object('learning_id', p_learning_id, 'review_id', p_review, 'response_id', k.response_id, 'basis_version', v.version, 'expected', v_expected, 'observed', v_observed,
                       'basis_change', btrim(p_basis_change), 'next', 'the next assessment cites this learning as its basis'), p_correlation);
  RETURN jsonb_build_object('learning_id', p_learning_id, 'exposure_id', p_exposure, 'review_id', p_review, 'response_id', k.response_id, 'basis_version', v.version, 'expected', v_expected,
                            'observed', v_observed, 'basis_change', btrim(p_basis_change), 'recorded_by', p_actor, 'recorded_at', clock_timestamp());
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.record_exposure_learning(uuid,uuid,uuid,uuid,uuid,text,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.record_exposure_learning(uuid,uuid,uuid,uuid,uuid,text,text,text,uuid,uuid) TO eye_commit;

-- RLS and grants for this section's executive tables (the 0081 loop idiom; the ports write).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['human_task_dependencies', 'invitation_deliveries', 'invitation_pickups'] LOOP
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

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- section `gates` (§G) — the part-local file 0094_b36_x_gates.sql, combined here at integration in the apply order every fresh-database run used
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0094 §G — CP-6 B36 part `gates` (2026-09-30): THE HUMAN GATE COMPLETED (F-P6-04 completes; ADR-003; JRN-17 sign, distribute; PER-01).
-- Built on the §0 prelude (0094_b36_strategic_planning_home_briefing_publishing.sql — the roles board_member / executive_operator, the
-- signature executive.signatures / record_signature / signature_of, the uniform gate states executive.gate_states, the widened
-- decision.package_events vocabulary) and on 0090 §G (the ledgers, the typed conditions, the distinct acts, overrides, delegation, the
-- board class, the preview, the controls). Nothing of the prelude is re-declared. What is here:
--   §G0 THE VALIDATED FIELDS — package_versions.missing_information / expected_effects (first-class, validated when set and again at
--       the proposal: version.fields_validated; a malformed field refused naming the field); the port decision.set_version_fields (under
--       decision.package.terms, on a draft) and decision.validate_version_fields_at_propose (under decision.package.propose).
--   §G1 THE LEDGERS — decision.recusals, decision.challenges (a transition with its resolution), decision.pdp_denials (a denial as a
--       versioned object linked to the replay), decision.distributions (the decision record distributed after commitment: recipients,
--       channels, receipts).
--   §G2 THE SIGNATURE beyond the audit chain — decision.signature_subject (the read: what would be signed now), decision.sign_approval and
--       decision.sign_decision (the approval's digest is the approval row's header digest; the decision's is the committed version's header
--       digest; the Ed25519 row is executive.record_signature's, written by SignatureService under the same bound action in the same
--       transaction; the port binds the row to the subject as it stands — a stale digest is refused and the row rolls back with it).
--   §G3 RECUSAL — decision.recuse_approver (the approver's own act; the standing approval voided; the quorum re-evaluated; a package that
--       loses its quorum returns to review); a recused approver's later approval refused by decision.approvals_refuse_recused.
--   §G4 CHALLENGE — decision.challenge_decision (a room member or the tenant's auditor, before or after commitment; the gate state reads
--       `challenged`), decision.resolve_challenge (the owner, never the challenger: upheld → the version superseded through the withdrawal
--       chain's own effects (0078/0090 withdraw_package) before commitment, `reopen_required` recorded after it; dismissed → the state
--       returns); a commitment on a challenged version is HELD by decision.commitments_refuse_challenged.
--   §G5 THE PDP DENIAL OBJECT — decision.record_pdp_denial (called by the pipeline's denial path under the EVIDENCE context bound to the
--       denied decision.* action) and the read decision.pdp_denials_of (the replay lists them beside its content).
--   §G6 DISTRIBUTION — decision.distribute_decision (after commitment; the record digested; the room's members and the named recipients;
--       in_app always, email / sms / teams SYNTHETIC through the B34 local sinks; an external collaborator never a recipient),
--       decision._record_distribution_receipt (internal), decision.distributions_of.
--   §G7 THE UNIFORM GATE STATE (ADR-003) — decision.gate_state_of (a version), observation.source_gate_state_of (a source contract's
--       activation states, 0022), graph.merge_gate_state_of (a resolution's states, 0024) — one vocabulary, executive.gate_states.
--   §G8 THE BOARD — decision.board_surface (the board member's read), decision.board_gate_check (the class and the standing before the
--       board's own acts decision.board.approve / .reject / .defer), the canonical-write registration of the board's approval.
--   §G9 THE RE-DECLARATIONS (this part alone; each copied whole with ONE change) — decision.record_approval (0090:4485) admits the board's
--       bound actions; decision.gate_act (0090:3916) admits decision.board.defer.
-- Refusals are a FAMILY `<noun> rejected (<class>): …` (the challenge's noun is `decision challenge`: `challenge rejected` is B9's review challenge); the classes actor / ownership / authority / separation / class / recused answer 403,
-- unknown_* 404, state / stale_digest 409, the rest 422 (apps/api/src/observation/observation-errors.ts, the B36 gates block).
-- Every figure a harness seeds is SYNTHETIC. Forward-only; 0084–0093 untouched.

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §G0 THE VALIDATED FIELDS OF A VERSION (l3)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
ALTER TABLE decision.package_versions
  ADD COLUMN missing_information jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(missing_information) = 'array'),
  ADD COLUMN expected_effects    jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(expected_effects) = 'array');
COMMENT ON COLUMN decision.package_versions.missing_information IS 'B36 (0094 §G0): what the decision still lacks — [{what, owner, needed_by}], validated by decision.validate_version_fields; set on a draft, re-validated at the proposal (version.fields_validated).';
COMMENT ON COLUMN decision.package_versions.expected_effects IS 'B36 (0094 §G0): the effects the choice is expected to have — [{effect, measure, direction, horizon, basis}], validated by decision.validate_version_fields.';

/* The validator: the two lists normalised, or a refusal NAMING THE FIELD. missing_information: [{what (4..400 chars), owner (a principal
   id), needed_by (a day)}]; expected_effects: [{effect (4..400), measure (2..120: a measure key or id), direction (up | down | flat),
   horizon (30d | 90d | 12m | 36m — the §0 horizon vocabulary), basis (4..1000)}]; at most 20 each. */
CREATE OR REPLACE FUNCTION decision.validate_version_fields(p_missing jsonb, p_effects jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE x jsonb; i int := 0; v_m jsonb := '[]'::jsonb; v_e jsonb := '[]'::jsonb; v_day date;
BEGIN
  IF p_missing IS NULL OR jsonb_typeof(p_missing) <> 'array' OR jsonb_array_length(p_missing) > 20 THEN
    RAISE EXCEPTION 'version fields rejected (missing_information): a list of at most 20 {what, owner, needed_by}' USING ERRCODE = '22023';
  END IF;
  IF p_effects IS NULL OR jsonb_typeof(p_effects) <> 'array' OR jsonb_array_length(p_effects) > 20 THEN
    RAISE EXCEPTION 'version fields rejected (expected_effects): a list of at most 20 {effect, measure, direction, horizon, basis}' USING ERRCODE = '22023';
  END IF;
  FOR x IN SELECT value FROM jsonb_array_elements(p_missing) LOOP
    IF jsonb_typeof(x) <> 'object' THEN RAISE EXCEPTION 'version fields rejected (missing_information[%]): an item is an object {what, owner, needed_by}', i USING ERRCODE = '22023'; END IF;
    IF coalesce(length(btrim(x ->> 'what')), 0) NOT BETWEEN 4 AND 400 THEN RAISE EXCEPTION 'version fields rejected (missing_information[%].what): says what is missing (4 to 400 characters)', i USING ERRCODE = '22023'; END IF;
    IF (x ->> 'owner') IS NULL OR (x ->> 'owner') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'version fields rejected (missing_information[%].owner): names the principal who will supply it', i USING ERRCODE = '22023';
    END IF;
    IF (x ->> 'needed_by') IS NULL OR (x ->> 'needed_by') !~ '^\d{4}-\d{2}-\d{2}' THEN RAISE EXCEPTION 'version fields rejected (missing_information[%].needed_by): names the day it is needed by', i USING ERRCODE = '22023'; END IF;
    BEGIN v_day := left(x ->> 'needed_by', 10)::date; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'version fields rejected (missing_information[%].needed_by): names the day it is needed by', i USING ERRCODE = '22023'; END;
    v_m := v_m || jsonb_build_array(jsonb_build_object('what', btrim(x ->> 'what'), 'owner', x ->> 'owner', 'needed_by', to_char(v_day, 'YYYY-MM-DD')));
    i := i + 1;
  END LOOP;
  i := 0;
  FOR x IN SELECT value FROM jsonb_array_elements(p_effects) LOOP
    IF jsonb_typeof(x) <> 'object' THEN RAISE EXCEPTION 'version fields rejected (expected_effects[%]): an item is an object {effect, measure, direction, horizon, basis}', i USING ERRCODE = '22023'; END IF;
    IF coalesce(length(btrim(x ->> 'effect')), 0) NOT BETWEEN 4 AND 400 THEN RAISE EXCEPTION 'version fields rejected (expected_effects[%].effect): says the effect expected (4 to 400 characters)', i USING ERRCODE = '22023'; END IF;
    IF coalesce(length(btrim(x ->> 'measure')), 0) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'version fields rejected (expected_effects[%].measure): names the measure it shows on (2 to 120 characters)', i USING ERRCODE = '22023'; END IF;
    IF (x ->> 'direction') IS NULL OR (x ->> 'direction') NOT IN ('up', 'down', 'flat') THEN RAISE EXCEPTION 'version fields rejected (expected_effects[%].direction): up, down or flat', i USING ERRCODE = '22023'; END IF;
    IF (x ->> 'horizon') IS NULL OR (x ->> 'horizon') NOT IN ('30d', '90d', '12m', '36m') THEN RAISE EXCEPTION 'version fields rejected (expected_effects[%].horizon): 30d, 90d, 12m or 36m', i USING ERRCODE = '22023'; END IF;
    IF coalesce(length(btrim(x ->> 'basis')), 0) NOT BETWEEN 4 AND 1000 THEN RAISE EXCEPTION 'version fields rejected (expected_effects[%].basis): states the basis of the expectation (4 to 1000 characters)', i USING ERRCODE = '22023'; END IF;
    v_e := v_e || jsonb_build_array(jsonb_build_object('effect', btrim(x ->> 'effect'), 'measure', btrim(x ->> 'measure'), 'direction', x ->> 'direction', 'horizon', x ->> 'horizon', 'basis', btrim(x ->> 'basis')));
    i := i + 1;
  END LOOP;
  RETURN jsonb_build_object('missing_information', v_m, 'expected_effects', v_e);
END $$;
GRANT EXECUTE ON FUNCTION decision.validate_version_fields(jsonb, jsonb) TO eye_app, eye_commit;

/* The fields are set on a DRAFT by the version's author or the package owner, under the terms' own bound action; validated before they are
   stored (a malformed field is never written). */
CREATE OR REPLACE FUNCTION decision.set_version_fields(
  p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_missing jsonb, p_effects jsonb, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p record; v record; v_ok jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.package.terms']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'version fields rejected (actor): set by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'version fields rejected (unknown_package): no such package in this domain' USING ERRCODE = '23503'; END IF;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'version fields rejected (unknown_version): no such version % of package %', p_version, p_package_id USING ERRCODE = '23503'; END IF;
  IF p_actor NOT IN (v.author_principal_id, p.owner_principal_id) THEN RAISE EXCEPTION 'version fields rejected (ownership): the version''s author or the package owner sets its fields' USING ERRCODE = '42501'; END IF;
  IF v.state <> 'draft' THEN RAISE EXCEPTION 'version fields rejected (state): version % is %; the fields of a proposed version are immutable — a change is a new version', p_version, v.state USING ERRCODE = '22023'; END IF;
  v_ok := decision.validate_version_fields(coalesce(p_missing, '[]'::jsonb), coalesce(p_effects, '[]'::jsonb));
  UPDATE decision.package_versions SET missing_information = v_ok -> 'missing_information', expected_effects = v_ok -> 'expected_effects' WHERE package_id = p_package_id AND version = p_version;
  RETURN jsonb_build_object('package_id', p_package_id, 'version', p_version) || v_ok;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.set_version_fields(uuid, uuid, uuid, int, jsonb, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.set_version_fields(uuid, uuid, uuid, int, jsonb, jsonb, uuid, uuid) TO eye_commit;

/* At the PROPOSAL (the propose route calls this before decision.propose_version, under the same bound action): the stored fields are
   validated again and the validation recorded — version.fields_validated with the counts and a digest of the two lists. */
CREATE OR REPLACE FUNCTION decision.validate_version_fields_at_propose(
  p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v record; v_ok jsonb; v_digest text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.package.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'version fields rejected (unknown_version): no such version % of package % in this domain', p_version, p_package_id USING ERRCODE = '23503'; END IF;
  v_ok := decision.validate_version_fields(v.missing_information, v.expected_effects);
  v_digest := encode(sha256(convert_to(v_ok::text, 'UTF8')), 'hex');
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'version.fields_validated', p_actor,
          jsonb_build_object('version', p_version, 'missing_information', jsonb_array_length(v_ok -> 'missing_information'), 'expected_effects', jsonb_array_length(v_ok -> 'expected_effects'), 'fields_digest', v_digest), p_correlation);
  RETURN jsonb_build_object('version', p_version, 'fields_digest', v_digest, 'missing_information', jsonb_array_length(v_ok -> 'missing_information'), 'expected_effects', jsonb_array_length(v_ok -> 'expected_effects'));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.validate_version_fields_at_propose(uuid, uuid, uuid, int, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.validate_version_fields_at_propose(uuid, uuid, uuid, int, uuid, uuid, uuid) TO eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §G1 THE LEDGERS
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- A RECUSAL: the approver's own withdrawal from a version — the reason, the approval it voided, the quorum before and after.
CREATE TABLE decision.recusals (
  recusal_id            uuid PRIMARY KEY,
  scope                 text NOT NULL,
  tenant_id             uuid NOT NULL,
  domain_id             uuid NOT NULL,
  package_id            uuid NOT NULL,
  version               int  NOT NULL,
  approver_principal_id uuid NOT NULL,
  reason                text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  voided_approval_id    uuid,
  quorum                int  NOT NULL,
  live_before           int  NOT NULL,
  live_after            int  NOT NULL,
  state_before          text NOT NULL,
  state_after           text NOT NULL,
  recused_at            timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id        uuid NOT NULL,
  CONSTRAINT drc_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT drc_version FOREIGN KEY (package_id, version) REFERENCES decision.package_versions (package_id, version),
  CONSTRAINT drc_once UNIQUE (package_id, version, approver_principal_id)
);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON decision.recusals FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- A CHALLENGE is a transition with a resolution: raised by a room member or the tenant's auditor, before or after the commitment; the
-- version's gate reads `challenged` while it is open; resolved ONCE by the package owner (upheld | dismissed) — the only change the row admits.
CREATE TABLE decision.challenges (
  challenge_id             uuid PRIMARY KEY,
  scope                    text NOT NULL,
  tenant_id                uuid NOT NULL,
  domain_id                uuid NOT NULL,
  package_id               uuid NOT NULL,
  version                  int  NOT NULL,
  challenger_principal_id  uuid NOT NULL,
  standing                 text NOT NULL CHECK (standing IN ('member', 'auditor')),
  reason                   text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 4000),
  after_commitment         boolean NOT NULL,
  version_state_at_raise   text NOT NULL,
  package_state_at_raise   text NOT NULL,
  raised_at                timestamptz NOT NULL DEFAULT clock_timestamp(),
  resolution               text CHECK (resolution IS NULL OR resolution IN ('upheld', 'dismissed')),
  resolved_by              uuid,
  resolved_at              timestamptz,
  resolution_note          text,
  effect                   jsonb,
  correlation_id           uuid NOT NULL,
  CONSTRAINT dch_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT dch_version FOREIGN KEY (package_id, version) REFERENCES decision.package_versions (package_id, version),
  CONSTRAINT dch_resolved_once CHECK ((resolved_at IS NULL) = (resolved_by IS NULL) AND (resolved_at IS NULL) = (resolution IS NULL) AND (resolved_at IS NULL) = (resolution_note IS NULL) AND (resolved_at IS NULL) = (effect IS NULL))
);
CREATE UNIQUE INDEX dch_one_open ON decision.challenges (package_id, version) WHERE resolved_at IS NULL;
CREATE INDEX dch_version_idx ON decision.challenges (package_id, version, raised_at);
CREATE OR REPLACE FUNCTION decision.challenges_resolve_only() RETURNS trigger
SET search_path = decision, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'challenges are append-only: DELETE prohibited' USING ERRCODE = '2F002'; END IF;
  IF OLD.resolved_at IS NOT NULL THEN RAISE EXCEPTION 'challenge % is resolved and immutable', OLD.challenge_id USING ERRCODE = '2F002'; END IF;
  IF NEW.resolved_at IS NULL OR (to_jsonb(NEW) - 'resolution' - 'resolved_by' - 'resolved_at' - 'resolution_note' - 'effect') <> (to_jsonb(OLD) - 'resolution' - 'resolved_by' - 'resolved_at' - 'resolution_note' - 'effect') THEN
    RAISE EXCEPTION 'challenge % changes only by its resolution, once', OLD.challenge_id USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER dch_resolve_only BEFORE UPDATE OR DELETE ON decision.challenges FOR EACH ROW EXECUTE FUNCTION decision.challenges_resolve_only();

-- A PDP DENIAL as a versioned object: who tried what on which target, the policy decision that refused it (policy.decisions), the reason
-- and the bundle, and the package version at the time when the target names a package — linked to the replay by package and version.
CREATE TABLE decision.pdp_denials (
  denial_id           uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  principal_id        uuid NOT NULL,
  action              text NOT NULL CHECK (action LIKE 'decision.%'),
  object_type         text,
  object_id           uuid,
  package_id          uuid,
  package_version     int,
  policy_decision_id  uuid NOT NULL,
  decision            text NOT NULL CHECK (decision IN ('deny', 'indeterminate')),
  reason              text NOT NULL,
  rule                text NOT NULL,
  denied_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT dpd_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX dpd_package_idx ON decision.pdp_denials (package_id, package_version, denied_at);
CREATE INDEX dpd_principal_idx ON decision.pdp_denials (tenant_id, domain_id, principal_id, denied_at);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON decision.pdp_denials FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- A DISTRIBUTION of the decision record after commitment: one row per recipient on one channel of one distribution act; the record and its
-- digest repeated on every row (what was delivered is what is read back). in_app is placed at once (the record stands on the recipient's
-- decisions surface); email / sms / teams are SYNTHETIC (the B34 local sinks, 0090 §0.5): queued by the port, delivered or failed by the
-- adapter in the same write. A queued row moves ONCE to delivered | failed; nothing else of the row changes.
CREATE TABLE decision.distributions (
  delivery_id            uuid PRIMARY KEY,
  distribution_id        uuid NOT NULL,
  scope                  text NOT NULL,
  tenant_id              uuid NOT NULL,
  domain_id              uuid NOT NULL,
  package_id             uuid NOT NULL,
  version                int  NOT NULL,
  commitment_id          uuid NOT NULL,
  record                 jsonb NOT NULL CHECK (jsonb_typeof(record) = 'object'),
  record_digest          text NOT NULL CHECK (record_digest ~ '^[0-9a-f]{64}$'),
  recipient_principal_id uuid NOT NULL,
  recipient_basis        text NOT NULL CHECK (recipient_basis IN ('room_owner', 'room_member', 'named')),
  channel                text NOT NULL CHECK (channel IN ('in_app', 'email', 'sms', 'teams')),
  state                  text NOT NULL CHECK (state IN ('queued', 'delivered', 'failed')),
  receipt                jsonb,
  provider_ref           text,
  error                  text,
  synthetic_state        boolean NOT NULL,
  distributed_by         uuid NOT NULL,
  distributed_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  attempted_at           timestamptz,
  correlation_id         uuid NOT NULL,
  CONSTRAINT ddi_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT ddi_version FOREIGN KEY (package_id, version) REFERENCES decision.package_versions (package_id, version),
  CONSTRAINT ddi_once UNIQUE (distribution_id, recipient_principal_id, channel),
  CONSTRAINT ddi_synthetic CHECK (synthetic_state = (channel <> 'in_app')),
  CONSTRAINT ddi_placed CHECK (state <> 'delivered' OR jsonb_typeof(receipt) = 'object'),
  CONSTRAINT ddi_failed CHECK (state <> 'failed' OR error IS NOT NULL),
  CONSTRAINT ddi_attempted CHECK ((state = 'queued') = (attempted_at IS NULL))
);
CREATE INDEX ddi_version_idx ON decision.distributions (package_id, version, distributed_at);
CREATE INDEX ddi_recipient_idx ON decision.distributions (tenant_id, domain_id, recipient_principal_id, distributed_at);
CREATE OR REPLACE FUNCTION decision.distributions_transition() RETURNS trigger
SET search_path = decision, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'distributions are append-only: DELETE prohibited' USING ERRCODE = '2F002'; END IF;
  IF OLD.state <> 'queued' THEN RAISE EXCEPTION 'distribution row % is % and immutable', OLD.delivery_id, OLD.state USING ERRCODE = '2F002'; END IF;
  IF NEW.state NOT IN ('delivered', 'failed') OR (to_jsonb(NEW) - 'state' - 'receipt' - 'provider_ref' - 'error' - 'attempted_at') <> (to_jsonb(OLD) - 'state' - 'receipt' - 'provider_ref' - 'error' - 'attempted_at') THEN
    RAISE EXCEPTION 'distribution row % changes only by its attempt, once (queued → delivered | failed)', OLD.delivery_id USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER ddi_transition BEFORE UPDATE OR DELETE ON decision.distributions FOR EACH ROW EXECUTE FUNCTION decision.distributions_transition();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['recusals', 'challenges', 'pdp_denials', 'distributions'] LOOP
    EXECUTE format('REVOKE ALL ON decision.%I FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE decision.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE decision.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY decision_isolation ON decision.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON decision.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §G2 THE SIGNATURE beyond the audit chain (k1)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
/* WHAT WOULD BE SIGNED NOW (an invoker read under the caller's RLS): for kind `approval`, the approval row's header digest (the APR
   canonical header, the approver's own record) — subject {approval_id, 1}; for kind `decision`, the committed version's header digest
   (the DPK canonical header of the version the commitment was made on) — subject {package_id, version}. NULL when the subject is not
   visible, or not in the state that is signed (an approval must stand; a decision must be committed). */
CREATE OR REPLACE FUNCTION decision.signature_subject(p_kind text, p_package_id uuid, p_version int, p_approval_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = decision, executive, pg_catalog, pg_temp AS $$
  SELECT CASE
    WHEN p_kind = 'approval' THEN (
      SELECT jsonb_build_object('kind', 'approval', 'subject_id', a.approval_id, 'subject_version', 1, 'digest', a.header_digest, 'signer_expected', a.approver_principal_id,
                                'standing', a.revoked_at IS NULL AND a.decision = 'approve', 'signatures', executive.signature_of('approval', a.approval_id, 1))
        FROM decision.approvals a WHERE a.approval_id = p_approval_id AND a.package_id = p_package_id AND a.version = p_version)
    WHEN p_kind = 'decision' THEN (
      SELECT jsonb_build_object('kind', 'decision', 'subject_id', v.package_id, 'subject_version', v.version, 'digest', v.header_digest,
                                'committed', v.state = 'committed' AND c.commitment_id IS NOT NULL, 'committed_by', c.committed_by, 'signatures', executive.signature_of('decision', v.package_id, v.version))
        FROM decision.package_versions v LEFT JOIN decision.commitments c ON c.package_id = v.package_id AND c.version = v.version
       WHERE v.package_id = p_package_id AND v.version = p_version)
    ELSE NULL END
$$;
GRANT EXECUTE ON FUNCTION decision.signature_subject(text, uuid, int, uuid) TO eye_app, eye_commit;

/* THE APPROVAL SIGNED by its approver: the Ed25519 row (executive.signatures, written by SignatureService through executive.record_signature
   under THIS bound action, decision.sign.approval, in the same transaction) is bound here to the approval as it stands — its digest must be
   the approval's header digest now (a stale one is refused: the row rolls back with the refusal), the signer the approval's approver, the
   approval standing. Recorded as gate.signed. */
CREATE OR REPLACE FUNCTION decision.sign_approval(
  p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_approval_id uuid, p_signature_id uuid, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a record; s record;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.sign.approval']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'signature rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO a FROM decision.approvals x WHERE x.approval_id = p_approval_id AND x.package_id = p_package_id AND x.version = p_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'signature rejected (unknown_approval): no such approval % on version % of package % in this domain', p_approval_id, p_version, p_package_id USING ERRCODE = '23503'; END IF;
  IF a.approver_principal_id <> p_actor THEN RAISE EXCEPTION 'signature rejected (actor): an approval is signed by its approver, never by another' USING ERRCODE = '42501'; END IF;
  IF a.decision <> 'approve' OR a.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'signature rejected (state): approval % is % — only a standing approval is signed', p_approval_id, CASE WHEN a.revoked_at IS NOT NULL THEN 'revoked' ELSE a.decision END USING ERRCODE = '22023'; END IF;
  IF a.header_digest IS NULL THEN RAISE EXCEPTION 'signature rejected (state): approval % carries no header digest to sign', p_approval_id USING ERRCODE = '22023'; END IF;
  SELECT * INTO s FROM executive.signatures x WHERE x.signature_id = p_signature_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'signature rejected (unknown_signature): no signature % was recorded in this transaction', p_signature_id USING ERRCODE = '23503'; END IF;
  IF s.subject_kind <> 'approval' OR s.subject_id <> p_approval_id OR s.subject_version <> 1 OR s.signer <> p_actor OR s.bound_action <> 'decision.sign.approval' THEN
    RAISE EXCEPTION 'signature rejected (state): signature % is not this approver''s signature over approval %', p_signature_id, p_approval_id USING ERRCODE = '22023';
  END IF;
  IF s.subject_digest IS DISTINCT FROM a.header_digest THEN
    RAISE EXCEPTION 'signature rejected (stale_digest): the digest signed (%) is not the approval''s digest now (%); read it again and sign what stands', s.subject_digest, a.header_digest USING ERRCODE = '22023';
  END IF;
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'gate.signed', p_actor,
          jsonb_build_object('version', p_version, 'kind', 'approval', 'approval_id', p_approval_id, 'signature_id', p_signature_id, 'key_id', s.key_id, 'subject_digest', s.subject_digest, 'signed_at', s.signed_at), p_correlation);
  RETURN jsonb_build_object('kind', 'approval', 'package_id', p_package_id, 'version', p_version, 'approval_id', p_approval_id, 'signature_id', p_signature_id, 'key_id', s.key_id, 'signer', p_actor, 'subject_digest', s.subject_digest, 'signed_at', s.signed_at);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.sign_approval(uuid, uuid, uuid, int, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.sign_approval(uuid, uuid, uuid, int, uuid, uuid, uuid, uuid, uuid) TO eye_commit;

/* THE DECISION SIGNED after its commitment, by the package owner or the committing authority (JRN-17 sign): the row (under
   decision.sign.decision) bound to the committed version's header digest as it stands. Recorded as gate.signed. */
CREATE OR REPLACE FUNCTION decision.sign_decision(
  p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_signature_id uuid, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p record; v record; c record; s record;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.sign.decision']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'signature rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'signature rejected (actor): only a named, active member signs a decision' USING ERRCODE = '42501'; END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'signature rejected (unknown_package): no such package in this domain' USING ERRCODE = '23503'; END IF;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'signature rejected (unknown_version): no such version % of package %', p_version, p_package_id USING ERRCODE = '23503'; END IF;
  SELECT * INTO c FROM decision.commitments x WHERE x.package_id = p_package_id AND x.version = p_version;
  IF v.state <> 'committed' OR NOT FOUND THEN RAISE EXCEPTION 'signature rejected (state): version % is %, not committed; a decision is signed after its commitment', p_version, v.state USING ERRCODE = '22023'; END IF;
  IF p_actor <> p.owner_principal_id AND p_actor <> c.committed_by THEN
    RAISE EXCEPTION 'signature rejected (actor): a decision is signed by the package owner or the authority who committed it' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO s FROM executive.signatures x WHERE x.signature_id = p_signature_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'signature rejected (unknown_signature): no signature % was recorded in this transaction', p_signature_id USING ERRCODE = '23503'; END IF;
  IF s.subject_kind <> 'decision' OR s.subject_id <> p_package_id OR s.subject_version <> p_version OR s.signer <> p_actor OR s.bound_action <> 'decision.sign.decision' THEN
    RAISE EXCEPTION 'signature rejected (state): signature % is not this principal''s signature over version % of package %', p_signature_id, p_version, p_package_id USING ERRCODE = '22023';
  END IF;
  IF s.subject_digest IS DISTINCT FROM v.header_digest THEN
    RAISE EXCEPTION 'signature rejected (stale_digest): the digest signed (%) is not the committed version''s digest (%); read it again and sign what stands', s.subject_digest, v.header_digest USING ERRCODE = '22023';
  END IF;
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'gate.signed', p_actor,
          jsonb_build_object('version', p_version, 'kind', 'decision', 'commitment_id', c.commitment_id, 'signature_id', p_signature_id, 'key_id', s.key_id, 'subject_digest', s.subject_digest, 'signed_at', s.signed_at), p_correlation);
  RETURN jsonb_build_object('kind', 'decision', 'package_id', p_package_id, 'version', p_version, 'commitment_id', c.commitment_id, 'signature_id', p_signature_id, 'key_id', s.key_id, 'signer', p_actor, 'subject_digest', s.subject_digest, 'signed_at', s.signed_at);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.sign_decision(uuid, uuid, uuid, int, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.sign_decision(uuid, uuid, uuid, int, uuid, uuid, uuid, uuid) TO eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §G3 RECUSAL (l1)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
/* The approver's OWN act on an open version: the recusal recorded, the approver's standing approval VOIDED (a revocation on the approval
   row — the one change it admits — with the reason `recused: …`), the quorum re-evaluated: an approved version that loses its quorum
   returns to under_review (the gate state reads review_requested). A recused approver never approves the version again (the trigger below). */
CREATE OR REPLACE FUNCTION decision.recuse_approver(
  p_recusal_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p record; v record; a record; v_quorum int; v_before int; v_after int; v_to text; v_voided uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.recuse']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'recusal rejected (actor): a recusal is the approver''s own act, never on behalf of another' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'recusal rejected (actor): only a named, active member recuses' USING ERRCODE = '42501'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(p_reason) > 2000 THEN RAISE EXCEPTION 'recusal rejected (reason): a recusal states its reason (8 to 2000 characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'recusal rejected (unknown_package): no such package in this domain' USING ERRCODE = '23503'; END IF;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'recusal rejected (unknown_version): no such version % of package %', p_version, p_package_id USING ERRCODE = '23503'; END IF;
  IF v.state NOT IN ('proposed', 'under_review', 'approved', 'deferred', 'information_requested') OR p.state IN ('withdrawn', 'closed') THEN
    RAISE EXCEPTION 'recusal rejected (state): version % is % (the package is %); an approver recuses from a version at the gate, not yet committed', p_version, v.state, p.state USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM decision.recusals r WHERE r.package_id = p_package_id AND r.version = p_version AND r.approver_principal_id = p_actor) THEN
    RAISE EXCEPTION 'recusal rejected (state): principal % is already recused from version %', p_actor, p_version USING ERRCODE = '22023';
  END IF;
  IF decision.approver_eligibility(p_actor, p_tenant, p_domain, v.approver_policy) IS NULL
     AND NOT EXISTS (SELECT 1 FROM decision.approvals a2 WHERE a2.package_id = p_package_id AND a2.version = p_version AND a2.approver_principal_id = p_actor) THEN
    RAISE EXCEPTION 'recusal rejected (authority): principal % is neither an approver the policy admits nor one with a record on version %', p_actor, p_version USING ERRCODE = '42501';
  END IF;
  v_quorum := (v.approver_policy ->> 'quorum')::int;
  SELECT count(*) INTO v_before FROM decision.live_approvals(p_package_id, p_version);
  FOR a IN SELECT * FROM decision.approvals x WHERE x.package_id = p_package_id AND x.version = p_version AND x.approver_principal_id = p_actor AND x.revoked_at IS NULL ORDER BY x.recorded_at LOOP
    UPDATE decision.approvals SET revoked_at = clock_timestamp(), revoked_reason = 'recused: ' || btrim(p_reason) WHERE approval_id = a.approval_id;
    v_voided := a.approval_id;
    INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_package_id, 'approval.revoked', p_actor,
            jsonb_build_object('version', p_version, 'approval_id', a.approval_id, 'reason', 'recused: ' || btrim(p_reason), 'recusal_id', p_recusal_id, 'after_commitment', false), p_correlation);
  END LOOP;
  SELECT count(*) INTO v_after FROM decision.live_approvals(p_package_id, p_version);
  v_to := v.state;
  IF v.state = 'approved' AND v_after < v_quorum THEN
    v_to := 'under_review';
    UPDATE decision.package_versions SET state = v_to WHERE package_id = p_package_id AND version = p_version;
    IF p.current_version = p_version THEN UPDATE decision.packages_current SET state = v_to WHERE package_id = p_package_id; END IF;
  END IF;
  INSERT INTO decision.recusals (recusal_id, scope, tenant_id, domain_id, package_id, version, approver_principal_id, reason, voided_approval_id, quorum, live_before, live_after, state_before, state_after, correlation_id)
  VALUES (p_recusal_id, 'DOMAIN', p_tenant, p_domain, p_package_id, p_version, p_actor, btrim(p_reason), v_voided, v_quorum, v_before, v_after, v.state, v_to, p_correlation);
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'gate.recused', p_actor,
          jsonb_strip_nulls(jsonb_build_object('version', p_version, 'recusal_id', p_recusal_id, 'reason', btrim(p_reason), 'voided_approval_id', v_voided, 'quorum', v_quorum, 'live_before', v_before, 'live_after', v_after,
                             'from_state', v.state, 'to_state', v_to, 'quorum_lost', v.state = 'approved' AND v_to <> 'approved')), p_correlation);
  RETURN jsonb_strip_nulls(jsonb_build_object('recusal_id', p_recusal_id, 'package_id', p_package_id, 'version', p_version, 'voided_approval_id', v_voided, 'quorum', v_quorum, 'live_before', v_before, 'live_after', v_after,
                            'from_state', v.state, 'to_state', v_to, 'quorum_lost', v.state = 'approved' AND v_to <> 'approved'));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.recuse_approver(uuid, uuid, uuid, uuid, int, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.recuse_approver(uuid, uuid, uuid, uuid, int, text, uuid, uuid, uuid) TO eye_commit;

/* A recused approver's later approval on the version is refused at the row — whatever port inserts it (record_approval, re-declared in §G9
   for the board's actions, is not otherwise touched). */
CREATE OR REPLACE FUNCTION decision.approvals_refuse_recused() RETURNS trigger
SET search_path = decision, pg_catalog, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM decision.recusals r WHERE r.package_id = NEW.package_id AND r.version = NEW.version AND r.approver_principal_id = NEW.approver_principal_id) THEN
    RAISE EXCEPTION 'approval rejected (recused): principal % recused from version % of package %; a recused approver does not approve it', NEW.approver_principal_id, NEW.version, NEW.package_id USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER dap_refuse_recused BEFORE INSERT ON decision.approvals FOR EACH ROW EXECUTE FUNCTION decision.approvals_refuse_recused();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §G4 CHALLENGE as an explicit transition (l2)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
/* A room member of the package (executive.is_member: the room's owner or a live member) or the tenant's AUDITOR challenges a version,
   before or after its commitment, with a reason. One challenge is open at a time; while it is open the gate reads `challenged` and a
   commitment is HELD (decision.commitments_refuse_challenged). Recorded as gate.challenged. */
CREATE OR REPLACE FUNCTION decision.challenge_decision(
  p_challenge_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p record; v record; v_room uuid; v_standing text; v_open uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.challenge']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'decision challenge rejected (actor): a challenge is the acting principal''s own' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'decision challenge rejected (actor): only a named, active member challenges a decision' USING ERRCODE = '42501'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(p_reason) > 4000 THEN RAISE EXCEPTION 'decision challenge rejected (reason): a challenge states its reason (8 to 4000 characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'decision challenge rejected (unknown_package): no such package in this domain' USING ERRCODE = '23503'; END IF;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'decision challenge rejected (unknown_version): no such version % of package %', p_version, p_package_id USING ERRCODE = '23503'; END IF;
  SELECT r.room_id INTO v_room FROM executive.rooms_current r WHERE r.package_id = p_package_id;
  IF v_room IS NOT NULL AND executive.is_member(v_room, p_actor) THEN v_standing := 'member';
  ELSIF decision.holds_role(p_actor, p_tenant, p_domain, 'auditor') THEN v_standing := 'auditor';
  ELSE RAISE EXCEPTION 'decision challenge rejected (authority): principal % is neither a member of the package''s room nor the tenant''s auditor', p_actor USING ERRCODE = '42501';
  END IF;
  IF v.state IN ('draft', 'rejected', 'superseded') OR p.state IN ('withdrawn', 'closed') THEN
    RAISE EXCEPTION 'decision challenge rejected (state): version % is % (the package is %); a challenge is raised on a version at the gate or committed', p_version, v.state, p.state USING ERRCODE = '22023';
  END IF;
  SELECT c.challenge_id INTO v_open FROM decision.challenges c WHERE c.package_id = p_package_id AND c.version = p_version AND c.resolved_at IS NULL;
  IF v_open IS NOT NULL THEN RAISE EXCEPTION 'decision challenge rejected (state): challenge % is already open on version %; it is resolved before another is raised', v_open, p_version USING ERRCODE = '22023'; END IF;
  INSERT INTO decision.challenges (challenge_id, scope, tenant_id, domain_id, package_id, version, challenger_principal_id, standing, reason, after_commitment, version_state_at_raise, package_state_at_raise, correlation_id)
  VALUES (p_challenge_id, 'DOMAIN', p_tenant, p_domain, p_package_id, p_version, p_actor, v_standing, btrim(p_reason), v.state = 'committed', v.state, p.state, p_correlation);
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'gate.challenged', p_actor,
          jsonb_build_object('version', p_version, 'challenge_id', p_challenge_id, 'standing', v_standing, 'reason', btrim(p_reason), 'after_commitment', v.state = 'committed', 'version_state', v.state), p_correlation);
  RETURN jsonb_build_object('challenge_id', p_challenge_id, 'package_id', p_package_id, 'version', p_version, 'standing', v_standing, 'after_commitment', v.state = 'committed', 'gate_state', 'challenged');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.challenge_decision(uuid, uuid, uuid, uuid, int, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.challenge_decision(uuid, uuid, uuid, uuid, int, text, uuid, uuid, uuid) TO eye_commit;

/* The PACKAGE OWNER resolves a challenge — never its challenger. UPHELD before the commitment: the version leaves the gate through the
   withdrawal chain's own effects (0078 §…/0090 §G9 withdraw_package: the open versions superseded, their gate tasks cancelled, the package
   withdrawn, package.withdrawn recorded — the chain B18 declared, applied here under the resolution's own action). UPHELD after the
   commitment: the commitment STANDS (D5: a withdrawn package over a standing commitment would be a lie) and the effect recorded is
   `reopen_required` — the owner reopens the package on a recorded cause (decision.package.reopen, 0078). DISMISSED: the state returns. */
CREATE OR REPLACE FUNCTION decision.resolve_challenge(
  p_tenant uuid, p_domain uuid, p_challenge_id uuid, p_resolution text, p_note text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c record; p record; v record; v_effect jsonb; v_sup int; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.challenge.resolve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'challenge resolution rejected (actor): resolved by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_resolution IS NULL OR p_resolution NOT IN ('upheld', 'dismissed') THEN RAISE EXCEPTION 'challenge resolution rejected (resolution): a challenge is upheld or dismissed' USING ERRCODE = '22023'; END IF;
  IF p_note IS NULL OR length(btrim(p_note)) < 8 OR length(p_note) > 4000 THEN RAISE EXCEPTION 'challenge resolution rejected (note): the resolution says why (8 to 4000 characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO c FROM decision.challenges x WHERE x.challenge_id = p_challenge_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'challenge resolution rejected (unknown_challenge): no such challenge in this domain' USING ERRCODE = '23503'; END IF;
  IF c.resolved_at IS NOT NULL THEN RAISE EXCEPTION 'challenge resolution rejected (state): challenge % was % at %', p_challenge_id, c.resolution, c.resolved_at USING ERRCODE = '22023'; END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = c.package_id FOR UPDATE;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = c.package_id AND x.version = c.version FOR UPDATE;
  IF p.owner_principal_id <> p_actor THEN RAISE EXCEPTION 'challenge resolution rejected (ownership): the package owner resolves a challenge on it' USING ERRCODE = '42501'; END IF;
  IF c.challenger_principal_id = p_actor THEN RAISE EXCEPTION 'challenge resolution rejected (separation): the challenger never resolves their own challenge' USING ERRCODE = '42501'; END IF;
  IF p_resolution = 'dismissed' THEN
    v_effect := jsonb_build_object('kind', 'none', 'version_state', v.state, 'package_state', p.state);
  ELSIF v.state = 'committed' OR p.committed_version IS NOT NULL THEN
    v_effect := jsonb_build_object('kind', 'reopen_required', 'version_state', v.state, 'package_state', p.state, 'committed_version', p.committed_version,
                                   'note', 'the commitment stands; the owner reopens the package on a recorded cause (decision.package.reopen)');
  ELSE
    /* the withdrawal chain's effects on an uncommitted package (0090 §G9 withdraw_package, under this action) */
    FOR v_sup IN UPDATE decision.package_versions SET state = 'superseded'
     WHERE package_id = c.package_id AND state IN ('proposed', 'under_review', 'approved', 'deferred', 'information_requested') RETURNING version LOOP
      PERFORM executive._cancel_human_tasks(p_tenant, p_domain, decision.gate_subject(c.package_id, v_sup), ARRAY['gate.approve', 'gate.review', 'gate.ready_review', 'gate.delegated_approval'],
                                            format('challenge %s upheld: version %s withdrawn', p_challenge_id, v_sup), p_actor, p_correlation);
    END LOOP;
    PERFORM executive._cancel_human_tasks(p_tenant, p_domain, jsonb_build_object('id', c.package_id), ARRAY['gate.approve', 'gate.review', 'gate.ready_review', 'gate.delegated_approval'],
                                          format('the package was withdrawn: challenge %s upheld', p_challenge_id), p_actor, p_correlation);
    UPDATE decision.packages_current SET state = 'withdrawn' WHERE package_id = c.package_id;
    INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, c.package_id, 'package.withdrawn', p_actor, jsonb_build_object('reason', 'challenge upheld: ' || btrim(p_note), 'challenge_id', p_challenge_id), p_correlation);
    v_effect := jsonb_build_object('kind', 'withdrawn', 'version_state', 'superseded', 'package_state', 'withdrawn');
  END IF;
  UPDATE decision.challenges SET resolution = p_resolution, resolved_by = p_actor, resolved_at = v_at, resolution_note = btrim(p_note), effect = v_effect WHERE challenge_id = p_challenge_id;
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, c.package_id, 'gate.challenge_resolved', p_actor,
          jsonb_build_object('version', c.version, 'challenge_id', p_challenge_id, 'resolution', p_resolution, 'note', btrim(p_note), 'effect', v_effect, 'challenger', c.challenger_principal_id), p_correlation);
  RETURN jsonb_build_object('challenge_id', p_challenge_id, 'package_id', c.package_id, 'version', c.version, 'resolution', p_resolution, 'resolved_at', v_at, 'effect', v_effect);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.resolve_challenge(uuid, uuid, uuid, text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.resolve_challenge(uuid, uuid, uuid, text, text, uuid, uuid, uuid) TO eye_commit;

/* THE HOLD: a commitment on a version with an open challenge is refused at the row, whatever port writes it (commit_package is not touched). */
CREATE OR REPLACE FUNCTION decision.commitments_refuse_challenged() RETURNS trigger
SET search_path = decision, pg_catalog, pg_temp AS $$
DECLARE v_open uuid;
BEGIN
  SELECT c.challenge_id INTO v_open FROM decision.challenges c WHERE c.package_id = NEW.package_id AND c.version = NEW.version AND c.resolved_at IS NULL;
  IF v_open IS NOT NULL THEN
    RAISE EXCEPTION 'commitment rejected (challenged): challenge % is open on version % of package %; the commitment is held until the owner resolves it', v_open, NEW.version, NEW.package_id USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER dcm_refuse_challenged BEFORE INSERT ON decision.commitments FOR EACH ROW EXECUTE FUNCTION decision.commitments_refuse_challenged();

/* The open challenge of a version (an invoker read; NULL when none). */
CREATE OR REPLACE FUNCTION decision.open_challenge_of(p_package_id uuid, p_version int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = decision, pg_catalog, pg_temp AS $$
  SELECT to_jsonb(c) - 'scope' - 'tenant_id' - 'domain_id' FROM decision.challenges c WHERE c.package_id = p_package_id AND c.version = p_version AND c.resolved_at IS NULL LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION decision.open_challenge_of(uuid, int) TO eye_app, eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §G5 THE PDP DENIAL as a versioned object linked to the replay (l5)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
/* Called by the pipeline's DENIAL path (apps/api/src/pipeline/pipeline.service.ts recordDenial) for a denied or indeterminate decision.*
   action, under the EVIDENCE context ctx.issue_evidence minted for that very request: the context's mode is `evidence`, its bound action
   the denied action, its subject the denied principal — the port reads all three from the context, never from the caller's word. The
   policy decision named is the one policy.commit_decision wrote in the same transaction. When the target names a package (DPK; an APR or
   a CMT resolves to its package where the row exists), the package's current version at the time is kept, and gate.denied is recorded on it when the
   denied act is one of the gate's own. */
CREATE OR REPLACE FUNCTION decision.record_pdp_denial(
  p_denial_id uuid, p_action text, p_object_type text, p_object_id uuid, p_policy_decision_id uuid, p_decision text, p_reason text, p_bundle text, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_tenant uuid := public.eye_tenant(); v_domain uuid := public.eye_domain(); v_principal uuid := public.eye_principal(); v_pkg uuid; v_ver int;
BEGIN
  IF public.eye_ctx_mode() IS DISTINCT FROM 'evidence' THEN RAISE EXCEPTION 'pdp denial rejected (context): a denial is recorded under the evidence context of the refused request (mode %)', coalesce(public.eye_ctx_mode(), '<none>') USING ERRCODE = '42501'; END IF;
  IF public.eye_bound_action() IS DISTINCT FROM p_action THEN RAISE EXCEPTION 'pdp denial rejected (context): the evidence context is bound to %, not %', coalesce(public.eye_bound_action(), '<none>'), p_action USING ERRCODE = '42501'; END IF;
  IF v_principal IS NULL OR v_tenant IS NULL OR v_domain IS NULL THEN RAISE EXCEPTION 'pdp denial rejected (context): the evidence context names no principal, tenant and domain' USING ERRCODE = '42501'; END IF;
  IF p_action IS NULL OR p_action NOT LIKE 'decision.%' THEN RAISE EXCEPTION 'pdp denial rejected (action): % is not a decision.* action', coalesce(p_action, '<none>') USING ERRCODE = '22023'; END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('deny', 'indeterminate') THEN RAISE EXCEPTION 'pdp denial rejected (decision): a denial is deny or indeterminate' USING ERRCODE = '22023'; END IF;
  IF p_object_type = 'DPK' AND p_object_id IS NOT NULL THEN
    SELECT x.package_id, x.current_version INTO v_pkg, v_ver FROM decision.packages_current x WHERE x.package_id = p_object_id AND x.tenant_id = v_tenant AND x.domain_id = v_domain;
  ELSIF p_object_type = 'APR' AND p_object_id IS NOT NULL THEN
    SELECT a.package_id, a.version INTO v_pkg, v_ver FROM decision.approvals a WHERE a.approval_id = p_object_id AND a.tenant_id = v_tenant AND a.domain_id = v_domain;
  ELSIF p_object_type = 'CMT' AND p_object_id IS NOT NULL THEN
    SELECT c.package_id, c.version INTO v_pkg, v_ver FROM decision.commitments c WHERE c.commitment_id = p_object_id AND c.tenant_id = v_tenant AND c.domain_id = v_domain;
  END IF;
  INSERT INTO decision.pdp_denials (denial_id, scope, tenant_id, domain_id, principal_id, action, object_type, object_id, package_id, package_version, policy_decision_id, decision, reason, rule, correlation_id)
  VALUES (p_denial_id, 'DOMAIN', v_tenant, v_domain, v_principal, p_action, p_object_type, p_object_id, v_pkg, v_ver, p_policy_decision_id, p_decision, left(coalesce(p_reason, ''), 2000), coalesce(p_bundle, ''), p_correlation);
  /* the package EVENT gate.denied is the GATE's: the acts at the gate (approve, commit, the gate acts, override, delegation, board, sign, recuse,
     challenge, distribute); a denied drafting act (decision.package.*, decision.read …) is a denial row without a gate event */
  IF v_pkg IS NOT NULL AND (p_action ~ '^decision\.(approve|commit|gate\.|override\.|delegation\.|board\.|sign\.|recuse|challenge|distribute)') THEN
    INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', v_tenant, v_domain, v_pkg, 'gate.denied', v_principal,
            jsonb_strip_nulls(jsonb_build_object('version', v_ver, 'denial_id', p_denial_id, 'action', p_action, 'object_type', p_object_type, 'object_id', p_object_id, 'policy_decision_id', p_policy_decision_id, 'decision', p_decision, 'reason', left(coalesce(p_reason, ''), 400))), p_correlation);
  END IF;
  RETURN jsonb_strip_nulls(jsonb_build_object('denial_id', p_denial_id, 'principal', v_principal, 'action', p_action, 'package_id', v_pkg, 'package_version', v_ver, 'policy_decision_id', p_policy_decision_id));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.record_pdp_denial(uuid, text, text, uuid, uuid, text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.record_pdp_denial(uuid, text, text, uuid, uuid, text, text, text, uuid) TO eye_commit;

/* The denials of a package's versions (an invoker read; the replay lists them beside its content; the panel shows "denied: <who> tried <what> — <rule>"). */
CREATE OR REPLACE FUNCTION decision.pdp_denials_of(p_package_id uuid, p_version int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = decision, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(d) - 'scope' - 'tenant_id' - 'domain_id' ORDER BY d.denied_at, d.denial_id), '[]'::jsonb)
    FROM decision.pdp_denials d WHERE d.package_id = p_package_id AND (p_version IS NULL OR d.package_version = p_version)
$$;
GRANT EXECUTE ON FUNCTION decision.pdp_denials_of(uuid, int) TO eye_app, eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §G6 THE DISTRIBUTION of the decision after commitment (k2; JRN-17 distribute)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
/* The DECISION RECORD: the committed version (its digests, the choice), the commitment, the signatures on the approvals and on the
   decision, the approval conditions in force in monitoring and the controls in force at the decision instant — digested. */
CREATE OR REPLACE FUNCTION decision.decision_record(p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int) RETURNS jsonb
STABLE SECURITY DEFINER SET search_path = decision, executive, pg_catalog, pg_temp AS $$
DECLARE p record; v record; c record; v_rec jsonb;
BEGIN
  IF p_tenant IS DISTINCT FROM public.eye_tenant() OR NOT (public.eye_scope() = 'TENANT' OR p_domain = public.eye_domain()) THEN
    RAISE EXCEPTION 'decision record rejected: outside the caller''s scope' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p_version;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO c FROM decision.commitments x WHERE x.package_id = p_package_id AND x.version = p_version;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_rec := jsonb_build_object(
    'package_id', p_package_id, 'version', p_version, 'title', p.title, 'statement', p.statement, 'decision_object_id', p.decision_object_id, 'decision_class', p.decision_class, 'owner', p.owner_principal_id,
    'version_digest', v.version_digest, 'header_digest', v.header_digest, 'choice', v.choice, 'objectives', v.objectives, 'reversibility', v.reversibility,
    'missing_information', v.missing_information, 'expected_effects', v.expected_effects, 'synthetic_state', v.synthetic_state,
    'commitment', jsonb_build_object('commitment_id', c.commitment_id, 'committed_by', c.committed_by, 'committed_at', c.committed_at, 'op_class', c.op_class, 'bound_action', c.bound_action, 'policy_decision_id', c.policy_decision_id, 'approvals', c.approvals),
    'signatures', jsonb_build_object(
      'approvals', (SELECT coalesce(jsonb_agg(jsonb_build_object('approval_id', x ->> 'approval_id', 'approver', x ->> 'approver', 'signatures', executive.signature_of('approval', (x ->> 'approval_id')::uuid, 1))), '[]'::jsonb) FROM jsonb_array_elements(c.approvals) x),
      'decision', executive.signature_of('decision', p_package_id, p_version)),
    'conditions_in_force', decision.approval_conditions_status(p_tenant, p_domain, p_package_id, p_version, 'monitor') - 'evaluated_at',
    'controls_in_force', decision.control_decisions_as_of(p_tenant, p_domain, c.committed_at));
  RETURN jsonb_build_object('record', v_rec, 'digest', encode(sha256(convert_to(v_rec::text, 'UTF8')), 'hex'));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.decision_record(uuid, uuid, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.decision_record(uuid, uuid, uuid, int) TO eye_app, eye_commit;

/* DISTRIBUTE: by the package owner or the authority who committed it, after the commitment. The recipients are the package's room (its
   owner and live members) and the named ones; every recipient is a named, active MEMBER (decision.is_active_human — an external
   collaborator is never one, named or not). in_app is always a channel: placed at once (the record stands on the recipient's decisions
   surface — decision.distributions_of). email / sms / teams are SYNTHETIC — queued here, carried by the B34 adapters to the LOCAL sinks
   in the same write (DistributionService), their receipts recorded by decision._record_distribution_receipt. Recorded as decision.distributed. */
CREATE OR REPLACE FUNCTION decision.distribute_decision(
  p_distribution_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_channels text[], p_recipients uuid[], p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p record; v record; c record; v_rec jsonb; v_room uuid; v_ch text; v_channels text[]; r record; v_rows jsonb := '[]'::jsonb; v_id uuid; v_n int := 0; v_rcpt uuid;
        v_recipients jsonb := '[]'::jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.distribute']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'distribution rejected (actor): distributed by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'distribution rejected (actor): only a named, active member distributes a decision' USING ERRCODE = '42501'; END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'distribution rejected (unknown_package): no such package in this domain' USING ERRCODE = '23503'; END IF;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'distribution rejected (unknown_version): no such version % of package %', p_version, p_package_id USING ERRCODE = '23503'; END IF;
  SELECT * INTO c FROM decision.commitments x WHERE x.package_id = p_package_id AND x.version = p_version;
  IF v.state <> 'committed' OR NOT FOUND THEN RAISE EXCEPTION 'distribution rejected (state): version % is %, not committed; the decision record is distributed after its commitment', p_version, v.state USING ERRCODE = '22023'; END IF;
  IF p_actor <> p.owner_principal_id AND p_actor <> c.committed_by AND NOT decision.holds_role(p_actor, p_tenant, p_domain, 'decision_authority') THEN
    RAISE EXCEPTION 'distribution rejected (authority): the package owner or a decision authority distributes the decision record' USING ERRCODE = '42501';
  END IF;
  v_channels := ARRAY['in_app'];
  FOREACH v_ch IN ARRAY coalesce(p_channels, ARRAY[]::text[]) LOOP
    IF v_ch NOT IN ('in_app', 'email', 'sms', 'teams') THEN RAISE EXCEPTION 'distribution rejected (channel): % is not a channel (in_app, and the SYNTHETIC email, sms, teams)', v_ch USING ERRCODE = '22023'; END IF;
    IF NOT (v_ch = ANY (v_channels)) THEN v_channels := v_channels || v_ch; END IF;
  END LOOP;
  FOREACH v_rcpt IN ARRAY coalesce(p_recipients, ARRAY[]::uuid[]) LOOP
    IF NOT decision.is_active_human(v_rcpt, p_tenant) THEN
      RAISE EXCEPTION 'distribution rejected (recipient): % is not a named, active member of this tenant (an external collaborator is never a recipient)', v_rcpt USING ERRCODE = '22023';
    END IF;
  END LOOP;
  SELECT r2.room_id INTO v_room FROM executive.rooms_current r2 WHERE r2.package_id = p_package_id;
  v_rec := decision.decision_record(p_tenant, p_domain, p_package_id, p_version);
  FOR r IN
    SELECT q.principal_id, (ARRAY['room_owner', 'room_member', 'named'])[min(q.rank)] AS basis FROM (
      SELECT rm.owner_principal_id AS principal_id, 1 AS rank FROM executive.rooms_current rm WHERE rm.room_id = v_room
      UNION ALL SELECT m.principal_id, 2 FROM executive.room_members m WHERE m.room_id = v_room AND m.removed_at IS NULL
      UNION ALL SELECT x, 3 FROM unnest(coalesce(p_recipients, ARRAY[]::uuid[])) x) q
     WHERE decision.is_active_human(q.principal_id, p_tenant) GROUP BY q.principal_id ORDER BY q.principal_id
  LOOP
    v_recipients := v_recipients || jsonb_build_object('principal_id', r.principal_id, 'basis', r.basis);
    FOREACH v_ch IN ARRAY v_channels LOOP
      v_id := gen_random_uuid();
      INSERT INTO decision.distributions (delivery_id, distribution_id, scope, tenant_id, domain_id, package_id, version, commitment_id, record, record_digest, recipient_principal_id, recipient_basis, channel, state, receipt, synthetic_state, distributed_by, attempted_at, correlation_id)
      VALUES (v_id, p_distribution_id, 'DOMAIN', p_tenant, p_domain, p_package_id, p_version, c.commitment_id, v_rec -> 'record', v_rec ->> 'digest', r.principal_id, r.basis, v_ch,
              CASE WHEN v_ch = 'in_app' THEN 'delivered' ELSE 'queued' END,
              CASE WHEN v_ch = 'in_app' THEN jsonb_build_object('channel', 'in_app', 'proof', 'the decision record stands on the recipient''s decisions surface (decision.distributions_of)', 'placed_at', clock_timestamp()) END,
              v_ch <> 'in_app', p_actor, CASE WHEN v_ch = 'in_app' THEN clock_timestamp() END, p_correlation);
      v_rows := v_rows || jsonb_build_object('delivery_id', v_id, 'recipient', r.principal_id, 'basis', r.basis, 'channel', v_ch, 'state', CASE WHEN v_ch = 'in_app' THEN 'delivered' ELSE 'queued' END, 'synthetic', v_ch <> 'in_app');
      v_n := v_n + 1;
    END LOOP;
  END LOOP;
  IF jsonb_array_length(v_recipients) = 0 THEN RAISE EXCEPTION 'distribution rejected (recipients): no recipient — the package has no room with members and none is named' USING ERRCODE = '22023'; END IF;
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'decision.distributed', p_actor,
          jsonb_build_object('version', p_version, 'distribution_id', p_distribution_id, 'commitment_id', c.commitment_id, 'record_digest', v_rec ->> 'digest', 'recipients', v_recipients, 'channels', to_jsonb(v_channels), 'rows', v_n,
                             'synthetic_channels', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM unnest(v_channels) x WHERE x <> 'in_app')), p_correlation);
  RETURN jsonb_build_object('distribution_id', p_distribution_id, 'package_id', p_package_id, 'version', p_version, 'commitment_id', c.commitment_id, 'record_digest', v_rec ->> 'digest', 'record', v_rec -> 'record',
                            'recipients', v_recipients, 'channels', to_jsonb(v_channels), 'rows', v_rows);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.distribute_decision(uuid, uuid, uuid, uuid, int, text[], uuid[], uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.distribute_decision(uuid, uuid, uuid, uuid, int, text[], uuid[], uuid, uuid, uuid) TO eye_commit;

/* INTERNAL (the same write, the same bound action): a queued synthetic row moves once to delivered (with the adapter's receipt) or failed. */
CREATE OR REPLACE FUNCTION decision._record_distribution_receipt(
  p_delivery_id uuid, p_tenant uuid, p_domain uuid, p_state text, p_receipt jsonb, p_provider_ref text, p_error text
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE d record;
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.distribute']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_state IS NULL OR p_state NOT IN ('delivered', 'failed') THEN RAISE EXCEPTION 'distribution rejected (receipt): an attempt comes to delivered or failed' USING ERRCODE = '22023'; END IF;
  SELECT * INTO d FROM decision.distributions x WHERE x.delivery_id = p_delivery_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'distribution rejected (unknown_delivery): no such distribution row in this domain' USING ERRCODE = '23503'; END IF;
  IF d.state <> 'queued' THEN RAISE EXCEPTION 'distribution rejected (state): row % is % already', p_delivery_id, d.state USING ERRCODE = '22023'; END IF;
  UPDATE decision.distributions SET state = p_state, receipt = CASE WHEN p_state = 'delivered' THEN coalesce(p_receipt, '{}'::jsonb) || jsonb_build_object('synthetic', true) ELSE p_receipt END,
         provider_ref = p_provider_ref, error = CASE WHEN p_state = 'failed' THEN left(coalesce(p_error, 'the channel reported a failure without a reason'), 500) END, attempted_at = clock_timestamp()
   WHERE delivery_id = p_delivery_id;
  RETURN jsonb_build_object('delivery_id', p_delivery_id, 'channel', d.channel, 'recipient', d.recipient_principal_id, 'state', p_state, 'synthetic', true);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision._record_distribution_receipt(uuid, uuid, uuid, text, jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision._record_distribution_receipt(uuid, uuid, uuid, text, jsonb, text, text) TO eye_commit;

/* The distributions of a version — every recipient, channel and receipt (an invoker read; a recipient sees theirs under RLS like anyone of the domain). */
CREATE OR REPLACE FUNCTION decision.distributions_of(p_package_id uuid, p_version int) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = decision, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(d) - 'scope' - 'tenant_id' - 'domain_id' - 'record' ORDER BY d.distributed_at, d.recipient_principal_id, d.channel), '[]'::jsonb)
    FROM decision.distributions d WHERE d.package_id = p_package_id AND d.version = p_version
$$;
GRANT EXECUTE ON FUNCTION decision.distributions_of(uuid, int) TO eye_app, eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §G7 ONE UNIFORM HUMAN-GATE PRODUCT STATE (l6; ADR-003; the vocabulary is §0's executive.gate_states)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
/* A DECISION VERSION's gate state, from its state and its events: withdrawn (the package withdrawn, the version superseded) > challenged (an
   open challenge) > overridden (a live override of this digest) > the version's state — draft → drafted; proposed / under_review →
   review_requested, or `recused` when the last act on the version was a recusal that left it short of its quorum; approved and committed →
   approved; rejected → rejected; deferred; information_requested. `since` and `by` are the latest recorded event on the version. */
CREATE OR REPLACE FUNCTION decision.gate_state_of(p_package_id uuid, p_version int) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = decision, executive, pg_catalog, pg_temp AS $$
DECLARE p record; v record; v_state text; v_basis text; e record; v_last text;
BEGIN
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p_version;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT x.event INTO v_last FROM decision.package_events x WHERE x.package_id = p_package_id AND (x.details ->> 'version') = p_version::text
     AND x.event IN ('gate.recused', 'review.recorded', 'version.approved', 'version.resumed', 'version.proposed') ORDER BY x.occurred_at DESC, x.event_id DESC LIMIT 1;
  IF p.state = 'withdrawn' OR v.state = 'superseded' THEN v_state := 'withdrawn'; v_basis := 'package ' || p.state || ', version ' || v.state;
  ELSIF EXISTS (SELECT 1 FROM decision.challenges c WHERE c.package_id = p_package_id AND c.version = p_version AND c.resolved_at IS NULL) THEN v_state := 'challenged'; v_basis := 'an open challenge';
  ELSIF v.state IN ('proposed', 'under_review', 'approved') AND EXISTS (SELECT 1 FROM decision.gate_overrides o WHERE o.package_id = p_package_id AND o.version = p_version AND o.expires_at > clock_timestamp() AND o.version_digest = v.version_digest) THEN
    v_state := 'overridden'; v_basis := 'a live override';
  ELSE
    v_state := CASE v.state WHEN 'draft' THEN 'drafted' WHEN 'proposed' THEN 'review_requested' WHEN 'under_review' THEN 'review_requested' WHEN 'approved' THEN 'approved' WHEN 'committed' THEN 'approved'
                            WHEN 'rejected' THEN 'rejected' WHEN 'deferred' THEN 'deferred' WHEN 'information_requested' THEN 'information_requested' ELSE 'drafted' END;
    IF v.state IN ('proposed', 'under_review') AND v_last = 'gate.recused' THEN v_state := 'recused'; END IF;
    v_basis := 'version ' || v.state || CASE WHEN v_last IS NOT NULL THEN ', last act ' || v_last ELSE '' END;
  END IF;
  SELECT x.occurred_at AS at, x.actor_principal_id AS actor, x.event INTO e FROM decision.package_events x WHERE x.package_id = p_package_id AND (x.details ->> 'version') = p_version::text
   ORDER BY x.occurred_at DESC, x.event_id DESC LIMIT 1;
  RETURN jsonb_build_object('kind', 'decision', 'id', p_package_id, 'version', p_version, 'state', v_state, 'basis', v_basis,
                            'since', coalesce(e.at, v.proposed_at, v.opened_at), 'by', coalesce(e.actor, v.proposed_by, v.author_principal_id), 'last_event', e.event,
                            'terminal', (SELECT g.terminal FROM executive.gate_states g WHERE g.state = v_state));
END $$;
GRANT EXECUTE ON FUNCTION decision.gate_state_of(uuid, int) TO eye_app, eye_commit;

/* A SOURCE CONTRACT's activation states (0022 observation.source_contracts_current: draft | approved | active | suspended | retired |
   superseded, with rights confirmed | pending | withdrawn) mapped to the same vocabulary: rights withdrawn → rejected; draft with rights
   pending → information_requested; draft → review_requested; approved / active → approved; suspended → deferred; retired / superseded →
   withdrawn. The latest contract version of the source, under the caller's RLS. */
CREATE OR REPLACE FUNCTION observation.source_gate_state_of(p_source_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = observation, executive, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('kind', 'source', 'id', s.source_id, 'version', s.contract_version,
           'state', CASE WHEN s.rights_state = 'withdrawn' THEN 'rejected'
                         WHEN s.lifecycle_state = 'draft' AND s.rights_state = 'pending' THEN 'information_requested'
                         WHEN s.lifecycle_state = 'draft' THEN 'review_requested'
                         WHEN s.lifecycle_state IN ('approved', 'active') THEN 'approved'
                         WHEN s.lifecycle_state = 'suspended' THEN 'deferred'
                         ELSE 'withdrawn' END,
           'basis', 'lifecycle ' || s.lifecycle_state || ', rights ' || s.rights_state, 'since', s.updated_at, 'by', coalesce(s.approver_principal_id, s.registrar_principal_id),
           'terminal', (SELECT g.terminal FROM executive.gate_states g WHERE g.state = CASE WHEN s.rights_state = 'withdrawn' THEN 'rejected' WHEN s.lifecycle_state = 'draft' AND s.rights_state = 'pending' THEN 'information_requested'
                                                                                            WHEN s.lifecycle_state = 'draft' THEN 'review_requested' WHEN s.lifecycle_state IN ('approved', 'active') THEN 'approved'
                                                                                            WHEN s.lifecycle_state = 'suspended' THEN 'deferred' ELSE 'withdrawn' END))
    FROM observation.source_contracts_current s WHERE s.source_id = p_source_id ORDER BY s.contract_version DESC LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION observation.source_gate_state_of(uuid) TO eye_app, eye_commit;

/* A MERGE (an entity resolution, 0024 graph.resolutions_current: proposed | accepted | rejected | superseded) mapped: proposed →
   review_requested; accepted → approved; rejected → rejected; superseded → withdrawn. */
CREATE OR REPLACE FUNCTION graph.merge_gate_state_of(p_resolution_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = graph, executive, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('kind', 'merge', 'id', r.resolution_id, 'version', 1,
           'state', CASE r.state WHEN 'proposed' THEN 'review_requested' WHEN 'accepted' THEN 'approved' WHEN 'rejected' THEN 'rejected' ELSE 'withdrawn' END,
           'basis', 'resolution ' || r.state || ' (' || r.method || ')', 'since', coalesce(r.decided_at, r.proposed_at), 'by', coalesce(r.decided_by, r.proposer_principal_id),
           'terminal', (SELECT g.terminal FROM executive.gate_states g WHERE g.state = CASE r.state WHEN 'proposed' THEN 'review_requested' WHEN 'accepted' THEN 'approved' WHEN 'rejected' THEN 'rejected' ELSE 'withdrawn' END))
    FROM graph.resolutions_current r WHERE r.resolution_id = p_resolution_id
$$;
GRANT EXECUTE ON FUNCTION graph.merge_gate_state_of(uuid) TO eye_app, eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §G8 THE BOARD / GOVERNING BODY (l4; PER-01; the role board_member is §0's)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
/* THE BOARD SURFACE: the board-class packages of the domain (0090 §G6 reserve_board_class) with their current version, the uniform gate
   state, the board's approvals (live, recused), the signatures, the open challenge and the reader's own standing on each. An invoker read
   under the caller's RLS; the route's action decision.board.read is the board member's, the executive's, the authority's and the auditor's. */
CREATE OR REPLACE FUNCTION decision.board_surface(p_tenant uuid, p_domain uuid, p_actor uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = decision, executive, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'package_id', p.package_id, 'title', p.title, 'statement', p.statement, 'state', p.state, 'decision_class', p.decision_class, 'board', p.board,
    'current_version', p.current_version, 'committed_version', p.committed_version, 'decided_at', p.decided_at, 'owner', p.owner_principal_id, 'synthetic_state', p.synthetic_state,
    'gate', decision.gate_state_of(p.package_id, coalesce(p.current_version, 1)),
    'version', (SELECT jsonb_build_object('version', v.version, 'state', v.state, 'version_digest', v.version_digest, 'header_digest', v.header_digest, 'approver_policy', v.approver_policy, 'choice', v.choice,
                                          'missing_information', v.missing_information, 'expected_effects', v.expected_effects, 'proposed_at', v.proposed_at)
                  FROM decision.package_versions v WHERE v.package_id = p.package_id AND v.version = coalesce(p.current_version, 1)),
    'approvals', (SELECT coalesce(jsonb_agg(jsonb_build_object('approval_id', a.approval_id, 'approver', a.approver_principal_id, 'decision', a.decision, 'recorded_at', a.recorded_at, 'revoked_at', a.revoked_at,
                                                             'live', EXISTS (SELECT 1 FROM decision.live_approvals(p.package_id, a.version) la WHERE la.approval_id = a.approval_id),
                                                             'recused', EXISTS (SELECT 1 FROM decision.recusals r WHERE r.package_id = a.package_id AND r.version = a.version AND r.approver_principal_id = a.approver_principal_id),
                                                             'signatures', executive.signature_of('approval', a.approval_id, 1)) ORDER BY a.recorded_at), '[]'::jsonb)
                    FROM decision.approvals a WHERE a.package_id = p.package_id AND a.version = coalesce(p.current_version, 1)),
    'own_approval', (SELECT a.decision FROM decision.approvals a WHERE a.package_id = p.package_id AND a.version = coalesce(p.current_version, 1) AND a.approver_principal_id = p_actor AND a.revoked_at IS NULL ORDER BY a.recorded_at DESC LIMIT 1),
    'own_recusal', EXISTS (SELECT 1 FROM decision.recusals r WHERE r.package_id = p.package_id AND r.version = coalesce(p.current_version, 1) AND r.approver_principal_id = p_actor),
    'decision_signatures', executive.signature_of('decision', p.package_id, coalesce(p.committed_version, p.current_version, 1)),
    'open_challenge', decision.open_challenge_of(p.package_id, coalesce(p.current_version, 1)),
    'quorum', greatest(coalesce((p.board ->> 'quorum')::int, 2), coalesce((SELECT (v.approver_policy ->> 'quorum')::int FROM decision.package_versions v WHERE v.package_id = p.package_id AND v.version = coalesce(p.current_version, 1)), 0)),
    'live_approvals', (SELECT count(*) FROM decision.live_approvals(p.package_id, coalesce(p.current_version, 1)))
  ) ORDER BY p.declared_at DESC), '[]'::jsonb)
  FROM decision.packages_current p WHERE p.tenant_id = p_tenant AND p.domain_id = p_domain AND p.decision_class = 'board'
$$;
GRANT EXECUTE ON FUNCTION decision.board_surface(uuid, uuid, uuid) TO eye_app, eye_commit;

/* THE CLASS AND THE STANDING before a board act: the acting principal holds board_member here, and the package is a BOARD decision — a
   board member decides a standard package NEVER (the PDP admits a board member no standard action; and here the class is judged again).
   Called by the board routes under their own bound actions before the act itself (record_approval / gate_act, re-declared in §G9 to
   admit them). */
CREATE OR REPLACE FUNCTION decision.board_gate_check(p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_act text, p_actor uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p record; v record;
BEGIN
  IF p_act IS NULL OR p_act NOT IN ('approve', 'reject', 'defer') THEN RAISE EXCEPTION 'board decision rejected (act): a board member approves, rejects or defers' USING ERRCODE = '22023'; END IF;
  PERFORM observation.assert_authority(ARRAY['decision.board.' || p_act]);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'board decision rejected (actor): a board act is the acting principal''s own' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) OR NOT decision.holds_role(p_actor, p_tenant, p_domain, 'board_member') THEN
    RAISE EXCEPTION 'board decision rejected (authority): a named, active board member decides a board-class package' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'board decision rejected (unknown_package): no such package in this domain' USING ERRCODE = '23503'; END IF;
  IF p.decision_class <> 'board' THEN
    RAISE EXCEPTION 'board decision rejected (class): package % is a standard decision; a board member decides a board-class package only, through its gate', p_package_id USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'board decision rejected (unknown_version): no such version % of package %', p_version, p_package_id USING ERRCODE = '23503'; END IF;
  RETURN jsonb_build_object('package_id', p_package_id, 'version', p_version, 'act', p_act, 'decision_class', p.decision_class, 'board', p.board, 'version_digest', v.version_digest, 'version_state', v.state);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.board_gate_check(uuid, uuid, uuid, int, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.board_gate_check(uuid, uuid, uuid, int, text, uuid) TO eye_commit;

/* The board's approval and rejection admit an APR canonical record like decision.approve (0042:337). */
INSERT INTO observation.canonical_write_actions (action, object_types, rationale) VALUES
  ('decision.board.approve', ARRAY['APR'], 'B36 (0094 §G8): a board member''s approval of a board-class package admits an approval record and nothing else'),
  ('decision.board.reject',  ARRAY['APR'], 'B36 (0094 §G8): a board member''s rejection of a board-class package admits an approval record (decision reject) and nothing else')
ON CONFLICT (action) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §G9 THE RE-DECLARATIONS (this part alone; each copied WHOLE with ONE change, marked /* B36 (0094) gates */)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- decision.record_approval — 0090 §G9 line 4485, copied whole; the ONE change: the bound actions asserted admit the board's
-- decision.board.approve and decision.board.reject (the board member reaches this port only through decision.board_gate_check).
CREATE OR REPLACE FUNCTION decision.record_approval(
  p_approval_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_approver uuid, p_decision text, p_version_digest text,
  p_rationale text, p_conditions jsonb, p_header_digest text, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v record; p record; v_elig text; v_quorum int; v_live int; v_expires timestamptz; v_state text;
        v_conds jsonb; v_deleg decision.approval_delegations%ROWTYPE; /* B34 (0090) gates */
BEGIN
  PERFORM observation.assert_authority(ARRAY['decision.approve', /* B36 (0094) gates */ 'decision.board.approve', 'decision.board.reject' /* end B36 gates */]);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_approver IS DISTINCT FROM public.eye_principal() THEN
    RAISE EXCEPTION 'approval rejected: an approval is recorded by the approving principal, never on behalf of another' USING ERRCODE = '42501';
  END IF;
  IF NOT decision.is_active_human(p_approver, p_tenant) THEN RAISE EXCEPTION 'approval rejected: only a named, active human principal approves' USING ERRCODE = '42501'; END IF;
  IF p_decision NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'approval rejected: decision is approve or reject' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v FROM decision.package_versions x WHERE x.package_id = p_package_id AND x.version = p_version AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'approval rejected: no such package version in this domain' USING ERRCODE = '23503'; END IF;
  IF v.state NOT IN ('proposed', 'under_review', 'approved') THEN
    RAISE EXCEPTION 'approval rejected: version % is %; only a proposed version is approved', p_version, v.state USING ERRCODE = '22023';
  END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package_id;
  IF p_version_digest IS DISTINCT FROM v.version_digest THEN
    RAISE EXCEPTION 'approval rejected: the digest approved (%) is not the digest of version % (%); an approval signs what was read', p_version_digest, p_version, v.version_digest USING ERRCODE = '22023';
  END IF;
  IF p_approver = v.author_principal_id OR p_approver = v.proposed_by OR p_approver = p.owner_principal_id OR p_approver::text = (v.choice ->> 'action_owner') THEN
    RAISE EXCEPTION 'approval rejected: self-approval is forbidden — the author, proposer, owner and action owner of a version cannot approve it' USING ERRCODE = '42501';
  END IF;
  /* B34 (0090) gates: the TYPED conditions validated (a plain string stays a note); a board decision reserved (PER-01) */
  v_conds := decision.validate_approval_conditions(p_tenant, p_domain, coalesce(p_conditions, '[]'::jsonb));
  v_elig := decision.approver_eligibility(p_approver, p_tenant, p_domain, v.approver_policy);
  /* B34 (0090) gates: the DELEGATE of an eligible approver approves under `delegation:<id>` while the delegation lives (never a board's) */
  IF v_elig IS NULL THEN
    SELECT * INTO v_deleg FROM decision.approval_delegations d
     WHERE d.package_id = p_package_id AND d.delegate_principal_id = p_approver AND d.ended_at IS NULL AND d.starts_at <= clock_timestamp() AND d.expires_at > clock_timestamp()
       AND decision.approver_eligibility(d.delegator_principal_id, p_tenant, p_domain, v.approver_policy) IS NOT NULL
     ORDER BY d.created_at LIMIT 1;
    IF FOUND THEN
      IF p.decision_class = 'board' THEN RAISE EXCEPTION 'approval rejected (board): a board decision''s approval is never delegated' USING ERRCODE = '42501'; END IF;
      IF EXISTS (SELECT 1 FROM decision.approvals a WHERE a.package_id = p_package_id AND a.version = p_version AND a.approver_principal_id = v_deleg.delegator_principal_id AND a.revoked_at IS NULL) THEN
        RAISE EXCEPTION 'approval rejected (delegation): the delegator % already has a live record on version %; one authority signs once', v_deleg.delegator_principal_id, p_version USING ERRCODE = '22023';
      END IF;
      v_elig := 'delegation:' || v_deleg.delegation_id::text;
    END IF;
  ELSIF EXISTS (SELECT 1 FROM decision.approvals a WHERE a.package_id = p_package_id AND a.version = p_version AND a.revoked_at IS NULL AND a.eligible_by LIKE 'delegation:%'
                  AND EXISTS (SELECT 1 FROM decision.approval_delegations d WHERE d.delegation_id = substr(a.eligible_by, 12)::uuid AND d.delegator_principal_id = p_approver)) THEN
    RAISE EXCEPTION 'approval rejected (delegation): your delegate already signed version % on your behalf; one authority signs once', p_version USING ERRCODE = '22023';
  END IF;
  /* end B34 gates */
  IF v_elig IS NULL THEN RAISE EXCEPTION 'approval rejected: principal % is not an eligible approver under this version''s policy', p_approver USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM decision.approvals a WHERE a.package_id = p_package_id AND a.version = p_version AND a.approver_principal_id = p_approver AND a.revoked_at IS NULL) THEN
    RAISE EXCEPTION 'approval rejected: this approver already has a live record on version %; revoke it first', p_version USING ERRCODE = '22023';
  END IF;
  v_expires := clock_timestamp() + make_interval(days => coalesce((v.approver_policy ->> 'expires_after_days')::int, 14));
  INSERT INTO decision.approvals (approval_id, scope, tenant_id, domain_id, package_id, version, approver_principal_id, decision, version_digest, rationale, conditions, eligible_by, expires_at, header_digest, correlation_id)
  VALUES (p_approval_id, 'DOMAIN', p_tenant, p_domain, p_package_id, p_version, p_approver, p_decision, p_version_digest, p_rationale, v_conds, v_elig, v_expires, p_header_digest, p_correlation);
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_package_id, 'review.recorded', p_approver,
          jsonb_build_object('version', p_version, 'approval_id', p_approval_id, 'decision', p_decision, 'version_digest', p_version_digest, 'eligible_by', v_elig, 'expires_at', v_expires), p_correlation);
  v_quorum := (v.approver_policy ->> 'quorum')::int;
  IF p_decision = 'reject' THEN
    UPDATE decision.package_versions SET state = 'rejected' WHERE package_id = p_package_id AND version = p_version;
    UPDATE decision.packages_current SET state = 'rejected' WHERE package_id = p_package_id;
    INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_package_id, 'version.rejected', p_approver, jsonb_build_object('version', p_version, 'approval_id', p_approval_id), p_correlation);
    /* B34 (0090) gates: the version's gate tasks end with it */
    PERFORM executive._cancel_human_tasks(p_tenant, p_domain, decision.gate_subject(p_package_id, p_version), ARRAY['gate.approve', 'gate.review', 'gate.ready_review'],
                                          'the version was rejected by an approver', p_approver, p_correlation);
    RETURN jsonb_build_object('state', 'rejected', 'live_approvals', 0, 'quorum', v_quorum, 'expires_at', v_expires, 'eligible_by', v_elig);
  END IF;
  SELECT count(*) INTO v_live FROM decision.live_approvals(p_package_id, p_version);
  IF v_live >= v_quorum THEN v_state := 'approved'; ELSE v_state := 'under_review'; END IF;
  IF v.state <> v_state THEN
    UPDATE decision.package_versions SET state = v_state WHERE package_id = p_package_id AND version = p_version;
    UPDATE decision.packages_current SET state = v_state WHERE package_id = p_package_id;
    IF v_state = 'approved' THEN
      INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_package_id, 'version.approved', p_approver,
              jsonb_build_object('version', p_version, 'quorum', v_quorum, 'live_approvals', v_live, 'approvals', (SELECT coalesce(jsonb_agg(approval_id), '[]'::jsonb) FROM decision.live_approvals(p_package_id, p_version))), p_correlation);
    END IF;
  END IF;
  /* B34 (0090) gates: the approval resolves the delegate's task; the quorum resolves the version's gate.approve task */
  IF v_elig LIKE 'delegation:%' THEN
    PERFORM executive._resolve_human_tasks(p_tenant, p_domain, jsonb_build_object('delegation_id', substr(v_elig, 12)::uuid), ARRAY['gate.delegated_approval'], 'approved', p_approval_id, p_approver, p_correlation);
  END IF;
  IF v_state = 'approved' THEN
    PERFORM executive._resolve_human_tasks(p_tenant, p_domain, decision.gate_subject(p_package_id, p_version), ARRAY['gate.approve'], 'quorum', p_approval_id, p_approver, p_correlation);
  END IF;
  RETURN jsonb_build_object('state', v_state, 'live_approvals', v_live, 'quorum', v_quorum, 'expires_at', v_expires, 'eligible_by', v_elig);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.record_approval(uuid,uuid,uuid,uuid,int,uuid,text,text,text,jsonb,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.record_approval(uuid,uuid,uuid,uuid,int,uuid,text,text,text,jsonb,text,uuid,uuid) TO eye_commit;
-- decision.gate_act — 0090 §G3 line 3916, copied whole; the ONE change: the bound action asserted admits decision.board.<act> beside
-- decision.gate.<act> (the board member's defer; the port's standing, gate_standing, admits it as an approver the board policy names).
CREATE OR REPLACE FUNCTION decision.gate_act(
  p_action_id uuid, p_tenant uuid, p_domain uuid, p_package_id uuid, p_version int, p_action text, p_rationale text, p_next_review_at timestamptz,
  p_info_request text, p_package_digest text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = decision, executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p record; v record; v_to text; v_standing text; v_ip jsonb; v_task jsonb; v_task_id uuid; v_live int; v_quorum int; v_event text; v_open text[] := ARRAY['proposed', 'under_review', 'approved'];
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
      v_to := CASE p_action WHEN 'defer' THEN 'deferred' ELSE 'information_requested' END;
      v_event := CASE p_action WHEN 'defer' THEN 'version.deferred' ELSE 'version.information_requested' END;
      v_task := executive._open_human_task(gen_random_uuid(), p_tenant, p_domain, 'gate.review', 'gate.review:' || p_action_id::text, decision.gate_subject(p_package_id, p_version),
        format('%s: review %s version %s by %s', CASE p_action WHEN 'defer' THEN 'Deferred' ELSE 'Information requested' END, p.title, p_version, to_char(p_next_review_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')),
        CASE p_action WHEN 'defer' THEN p_actor ELSE p.owner_principal_id END, '{}', jsonb_build_object('gate_action_id', p_action_id), p_next_review_at,
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
  INSERT INTO decision.gate_actions (action_id, scope, tenant_id, domain_id, package_id, version, action, actor_principal_id, rationale, next_review_at, info_request, information_package_digest, from_state, to_state, task_id, correlation_id)
  VALUES (p_action_id, 'DOMAIN', p_tenant, p_domain, p_package_id, p_version, p_action, p_actor, btrim(p_rationale),
          CASE WHEN p_action IN ('defer', 'request_information') THEN p_next_review_at END, CASE WHEN p_action = 'request_information' THEN btrim(p_info_request) END,
          CASE WHEN p_action = 'ready' THEN p_package_digest END, v.state, v_to, v_task_id, p_correlation);
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
                             'information_package_digest', CASE WHEN p_action = 'ready' THEN p_package_digest END, 'standing', v_standing, 'task_id', v_task_id)), p_correlation);
  RETURN jsonb_strip_nulls(jsonb_build_object('action_id', p_action_id, 'package_id', p_package_id, 'version', p_version, 'action', p_action, 'from_state', v.state, 'to_state', v_to,
                            'next_review_at', CASE WHEN p_action IN ('defer', 'request_information') THEN p_next_review_at END, 'task_id', v_task_id, 'standing', v_standing, 'event', v_event));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION decision.gate_act(uuid, uuid, uuid, uuid, int, text, text, timestamptz, text, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decision.gate_act(uuid, uuid, uuid, uuid, int, text, text, timestamptz, text, text, uuid, uuid, uuid) TO eye_commit;

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- section `home` (§H) — the part-local file 0094_b36_x_home.sql, combined here at integration in the apply order every fresh-database run used
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0094 §H — CP-6 B36 part `home` (2026-09-30): THE EXECUTIVE HOME, THE CADENCE AND THE COMMAND VIEWS (F-P6-11; WS-01, JRN-19, PER-03,
-- CAP-EO-01/-02/-04). Built on the §0 prelude (executive.contexts / set_context / current_context, executive.cadences, the room kinds
-- decision | scenario | objective_review | forum on executive.rooms_current — USED here, never re-declared) and on nothing another B36
-- part builds at the SQL level: a sibling's object is read through feature detection (to_regclass / to_regprocedure) or not at all.
--
-- What this section declares, and nothing else (MAP.md §H):
--   §H1  the vocabulary: executive.home_horizon_interval(text), executive.home_section_names()
--   §H2  the room kinds bound (h3): executive.open_subject_room (a scenario room bound to a scenario, an objective review bound to an
--        objective, with a deadline; the SoD: the objective's owner opens no review of it), executive.raise_overdue_rooms (the attention
--        tick's step `room-deadlines`, order 58: an overdue room raises ONE attention item of class review.convened with the overdue
--        marker), and executive.convene_review RE-DECLARED from 0084 §4 (lines 199–279) with ONE change: the objective's owner is
--        neither the chair nor a reviewer of its review (`objective review rejected (separation_of_duties)`)
--   §H3  the cadence (h1, JRN-19): executive.cadence_events (append-only), executive.open_cadence, executive.reset_cadence (the reset
--        CLOSES the cycle with its closing record — reviewed, decided, committed, left open — and OPENS the next; open board-class
--        decisions need the executive's confirmation with a reason), executive.cadence_of
--   §H4  the executive operator's tooling (h5, PER-03): executive.cadence_agenda (+ executive.set_agenda / executive.agenda_of),
--        executive.cadence_escalations (+ executive.escalate_gap: an escalation item to a named executive, on the queue as
--        queue.governance; executive.answer_escalation); executive.delegate_attention_item RE-DECLARED from 0086 §G (lines 1714–1764)
--        and executive.reassign_human_task RE-DECLARED from 0090 §W3 (lines 5779–5812), each with ONE change: the executive operator
--        routes work through them (never a new write path)
--   §H5  the home (h1, WS-01): executive.home(...) — ONE read composing priorities, intelligence, warnings, decisions, commitments,
--        outcomes and the cadence under the reader's context, each section with its as-of, its count and its limitations
--   §H6  the command views (h2, CAP-EO-02/-04): executive.command_views (role × moment, seeded), executive.command_view(...),
--        executive.command_views_for(...); the context switcher's choices executive.context_choices(...)
--   §H7  the search with explanation (h4): executive.search(...) (a read over rooms, briefings v1–v3, packages, commitment items,
--        attention items, warnings, reviews — the audience contract and the reader's RLS respected; every hit explained),
--        executive.search_events (the access ledger, append-only) and executive.record_search (the port that reads and records)
--   §H8  the metrics (h6): executive.metrics(...) — time-to-understanding, decision latency, review completion, computed on read from
--        the ledgers; nothing stored
--   §H9  RLS and the grants (the 0081 loop idiom)
-- Refusal families (mapped in observation-errors.ts inside /* B36 home */): `cadence rejected (<class>)`, `executive room rejected
-- (<class>)`, `objective review rejected (separation_of_duties)`, `agenda rejected (<class>)`, `escalation rejected (<class>)`,
-- `search rejected (<class>)`, `command view rejected (<class>)`, and §0's `context rejected (<class>)` (this part owns its only route).
-- Every figure a harness seeds through these ports is SYNTHETIC. Forward-only; 0084–0093 untouched; the prelude untouched.

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §H1 THE VOCABULARY
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
/* The §0 horizon as a window: 30d, 90d, 12m, 36m. */
CREATE OR REPLACE FUNCTION executive.home_horizon_interval(p text) RETURNS interval
LANGUAGE sql IMMUTABLE AS $$ SELECT CASE p WHEN '30d' THEN interval '30 days' WHEN '12m' THEN interval '12 months' WHEN '36m' THEN interval '36 months' ELSE interval '90 days' END $$;
GRANT EXECUTE ON FUNCTION executive.home_horizon_interval(text) TO eye_app, eye_commit;
/* The seven sections of the home, in the order the page renders them (the cadence closes the loop). */
CREATE OR REPLACE FUNCTION executive.home_section_names() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['priorities', 'intelligence', 'warnings', 'decisions', 'commitments', 'outcomes', 'cadence'] $$;
GRANT EXECUTE ON FUNCTION executive.home_section_names() TO eye_app, eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §H2 THE ROOM KINDS BOUND (h3): a scenario room, an objective review, with a deadline and the SoD
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
/* A room of kind scenario (bound to a scenario of this domain) or objective_review (bound to an active objective — a graph OBJ), with a
   DEADLINE (after now, within a year); the opener is its owner. The separation of duties: the OBJECTIVE's OWNER opens no review of it
   (the review's convening, §H2's convene_review, refuses them as chair or reviewer likewise). A decision room stays 0044's open_room. */
CREATE OR REPLACE FUNCTION executive.open_subject_room(
  p_room_id uuid, p_tenant uuid, p_domain uuid, p_kind text, p_subject_id uuid, p_title text, p_deadline timestamptz, p_review_every_days int,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, prediction, graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_at timestamptz := clock_timestamp(); v_owner uuid; v_subject_title text; v_every int := coalesce(p_review_every_days, 7);
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.room.open']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'executive room rejected (actor): a room is opened by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT decision.is_active_human(p_actor, p_tenant) THEN RAISE EXCEPTION 'executive room rejected (actor): a room is opened by a named, active human' USING ERRCODE = '42501'; END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('scenario', 'objective_review') THEN
    RAISE EXCEPTION 'executive room rejected (kind): a subject room is a scenario room or an objective review (%)', coalesce(p_kind, '<none>') USING ERRCODE = '22023';
  END IF;
  IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 2 AND 256 THEN RAISE EXCEPTION 'executive room rejected (title): a title is 2–256 characters' USING ERRCODE = '22023'; END IF;
  IF p_deadline IS NULL OR p_deadline <= v_at OR p_deadline > v_at + interval '366 days' THEN
    RAISE EXCEPTION 'executive room rejected (deadline): the deadline is after now and within a year' USING ERRCODE = '22023';
  END IF;
  IF v_every < 1 OR v_every > 365 THEN RAISE EXCEPTION 'executive room rejected (cadence): review_every_days is between 1 and 365' USING ERRCODE = '22023'; END IF;
  IF p_kind = 'scenario' THEN
    SELECT s.owner_principal_id, s.title INTO v_owner, v_subject_title FROM prediction.scenarios_current s WHERE s.scenario_id = p_subject_id AND s.tenant_id = p_tenant AND s.domain_id = p_domain;
    IF NOT FOUND THEN RAISE EXCEPTION 'executive room rejected (unknown_subject): no scenario % in this domain', p_subject_id USING ERRCODE = '23503'; END IF;
  ELSE
    SELECT s.owner_principal_id, s.title INTO v_owner, v_subject_title FROM graph.strategy_current s WHERE s.strategy_object_id = p_subject_id AND s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.object_type = 'OBJ';
    IF NOT FOUND THEN RAISE EXCEPTION 'executive room rejected (unknown_subject): no objective % in this domain', p_subject_id USING ERRCODE = '23503'; END IF;
    IF v_owner = p_actor THEN
      RAISE EXCEPTION 'objective review rejected (separation_of_duties): the owner of objective % opens no review of it; another person reviews it', p_subject_id USING ERRCODE = '42501';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM executive.rooms_current r WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.kind = p_kind AND r.subject_id = p_subject_id AND (r.deadline IS NULL OR r.deadline > v_at)) THEN
    RAISE EXCEPTION 'executive room rejected (state): a % room on % is already open with a deadline still ahead', p_kind, p_subject_id USING ERRCODE = '22023';
  END IF;
  INSERT INTO executive.rooms_current (room_id, scope, tenant_id, domain_id, package_id, title, owner_principal_id, review_every_days, next_review_at, opened_by, correlation_id, kind, subject_id, deadline)
  VALUES (p_room_id, 'DOMAIN', p_tenant, p_domain, NULL, btrim(p_title), p_actor, v_every, least(p_deadline, v_at + make_interval(days => v_every)), p_actor, p_correlation, p_kind, p_subject_id, p_deadline);
  INSERT INTO executive.room_members (room_id, principal_id, scope, tenant_id, domain_id, role, added_by)
  VALUES (p_room_id, p_actor, 'DOMAIN', p_tenant, p_domain, 'owner', p_actor);
  INSERT INTO executive.room_events (event_id, scope, tenant_id, domain_id, room_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_room_id, 'room.opened', p_actor,
          jsonb_build_object('kind', p_kind, 'subject_id', p_subject_id, 'subject_title', v_subject_title, 'subject_owner', v_owner, 'title', btrim(p_title), 'deadline', p_deadline, 'review_every_days', v_every), p_correlation);
  RETURN jsonb_build_object('room_id', p_room_id, 'kind', p_kind, 'subject_id', p_subject_id, 'subject_title', v_subject_title, 'title', btrim(p_title), 'deadline', p_deadline, 'owner', p_actor, 'opened_at', v_at);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.open_subject_room(uuid,uuid,uuid,text,uuid,text,timestamptz,int,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.open_subject_room(uuid,uuid,uuid,text,uuid,text,timestamptz,int,uuid,uuid,uuid) TO eye_commit;

/* THE TICK STEP `room-deadlines` (order 58): every scenario room / objective review whose deadline has passed and that carries no
   review.overdue event for that deadline raises ONE attention item of class review.convened (the class exists) with the OVERDUE marker,
   routed to the room's owner under the active policy's rule for the class (0083 §5's routing, as the strategy detections do), and the
   room event review.overdue records it. Bound to executive.attention.tick — the attention agent's action; nobody else runs it. */
CREATE OR REPLACE FUNCTION executive.raise_overdue_rooms(p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_now timestamptz := clock_timestamp(); r record; pol executive.attention_policies%ROWTYPE; v_eval jsonb; v_route jsonb; v_state text; v_owner uuid; v_item uuid; v_event uuid; v_raised jsonb := '[]'::jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO pol FROM executive.attention_policies a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.state = 'active';
  FOR r IN SELECT m.* FROM executive.rooms_current m
            WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain AND m.kind IN ('scenario', 'objective_review') AND m.deadline IS NOT NULL AND m.deadline <= v_now
              AND NOT EXISTS (SELECT 1 FROM executive.room_events e WHERE e.room_id = m.room_id AND e.event = 'review.overdue' AND (e.details ->> 'deadline')::timestamptz = m.deadline)
            ORDER BY m.deadline LOOP
    v_item := gen_random_uuid(); v_event := gen_random_uuid();
    v_owner := CASE WHEN decision.is_active_human(r.owner_principal_id, p_tenant) THEN r.owner_principal_id END;
    v_eval := executive.evaluate_attention(CASE WHEN pol.policy_id IS NULL THEN NULL ELSE pol.rules END, 'review.convened',
                                           jsonb_build_object('consequence', 'C2', 'confidence', 1, 'hours_to_window', 0)) || jsonb_build_object('policy_version', pol.version);
    v_route := executive.attention_route(pol.rules, 'review.convened', v_eval ->> 'outcome', v_owner, p_tenant, p_domain);
    v_state := v_route ->> 'state';
    INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state,
                                           owner_principal_id, route_roles, policy_id, policy_version, evaluation, details, due_at, escalations, correlation_id)
    VALUES (v_item, 'DOMAIN', p_tenant, p_domain, 'review.convened', CASE r.kind WHEN 'scenario' THEN 'scenario' ELSE 'strategy_object' END, r.subject_id, v_event, 'RoomDeadlinePassed',
            left(format('OVERDUE %s: %s (deadline %s)', replace(r.kind, '_', ' '), r.title, r.deadline), 512), v_eval ->> 'outcome', v_state,
            v_owner, ARRAY(SELECT jsonb_array_elements_text(v_route -> 'route_roles')), pol.policy_id, pol.version, v_eval,
            jsonb_build_object('room_id', r.room_id, 'kind', r.kind, 'deadline', r.deadline, 'overdue', true, 'marker', 'overdue', 'raised_at', v_now, 'by', 'the attention tick step room-deadlines'),
            (v_route ->> 'due_at')::timestamptz, (v_route ->> 'escalations')::int, p_correlation);
    PERFORM executive.attention_event(v_item, p_tenant, p_domain,
              CASE v_state WHEN 'open' THEN 'item.routed' WHEN 'escalated' THEN 'item.escalated' WHEN 'unrouted' THEN 'item.unrouted' ELSE 'item.deprioritized' END,
              p_actor, jsonb_build_object('outcome', v_eval ->> 'outcome', 'reasons', v_eval -> 'reasons', 'policy_version', pol.version, 'owner', v_owner, 'route_roles', v_route -> 'route_roles',
                                          'due_at', v_route -> 'due_at', 'cause_event_id', v_event, 'cause_event_type', 'RoomDeadlinePassed', 'unrouted', coalesce((v_route ->> 'unrouted')::boolean, false)), p_correlation);
    INSERT INTO executive.room_events (event_id, scope, tenant_id, domain_id, room_id, event, actor_principal_id, details, correlation_id)
    VALUES (v_event, 'DOMAIN', p_tenant, p_domain, r.room_id, 'review.overdue', p_actor, jsonb_build_object('kind', r.kind, 'deadline', r.deadline, 'item_id', v_item, 'state', v_state, 'routed_to', v_owner), p_correlation);
    v_raised := v_raised || jsonb_build_object('room_id', r.room_id, 'kind', r.kind, 'deadline', r.deadline, 'item_id', v_item, 'state', v_state, 'owner', v_owner);
  END LOOP;
  RETURN jsonb_build_object('raised_at', v_now, 'raised', v_raised, 'count', jsonb_array_length(v_raised), 'policy_version', pol.version);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.raise_overdue_rooms(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.raise_overdue_rooms(uuid, uuid, uuid, uuid) TO eye_commit;

-- (executive.convene_review is re-declared at the end of this section's file — §H2b — copied whole from 0084 with its one change.)

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §H3 THE CADENCE (h1; JRN-19 the loop reset)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE executive.cadence_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  cadence_id         uuid NOT NULL REFERENCES executive.cadences(cadence_id),
  event              text NOT NULL CHECK (event IN ('cadence.opened', 'cadence.reset', 'cadence.reset_confirmed', 'agenda.set', 'gap.escalated', 'escalation.answered')),
  actor_principal_id uuid NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT xcde_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX xcde_cadence ON executive.cadence_events (cadence_id, occurred_at);
CREATE TRIGGER xcde_append_only BEFORE UPDATE OR DELETE ON executive.cadence_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE executive.cadence_events IS 'B36 §H (0094): what happened to a cadence (the executive home''s cycle, §0 executive.cadences) — opened, reset (with the closing record), the agenda set, a gap escalated; append-only.';

/* The roles that open and reset a cadence: the executive and the executive operator (the administrators beside them). The reset over
   open BOARD-class decisions is the EXECUTIVE's confirmation alone (§H3 reset_cadence). */
CREATE OR REPLACE FUNCTION executive.cadence_roles() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['executive', 'executive_operator', 'domain_admin', 'platform_admin'] $$;
GRANT EXECUTE ON FUNCTION executive.cadence_roles() TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION executive.cadence_answer(c executive.cadences) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = executive, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('cadence_id', c.cadence_id, 'period', c.period, 'sequence', c.sequence, 'opened_by', c.opened_by, 'opened_at', c.opened_at,
                            'closed_by', c.closed_by, 'closed_at', c.closed_at, 'closing_record', c.closing_record, 'open', c.closed_at IS NULL)
$$;
REVOKE ALL ON FUNCTION executive.cadence_answer(executive.cadences) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.cadence_answer(executive.cadences) TO eye_app, eye_commit;

/* OPEN a cadence of a period (weekly | monthly | quarterly): one open cadence per period and domain (§0's xcd_one_open); the sequence
   continues the period's count. A named human holding a cadence role. */
CREATE OR REPLACE FUNCTION executive.open_cadence(p_cadence_id uuid, p_tenant uuid, p_domain uuid, p_period text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c executive.cadences%ROWTYPE; v_seq int; v_open uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.cadence.open']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'cadence rejected (actor): opened by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, executive.cadence_roles()) THEN
    RAISE EXCEPTION 'cadence rejected (actor): a cadence is opened by a named human holding %', array_to_string(executive.cadence_roles(), ', ') USING ERRCODE = '42501';
  END IF;
  IF p_period IS NULL OR p_period NOT IN ('weekly', 'monthly', 'quarterly') THEN RAISE EXCEPTION 'cadence rejected (period): a cadence is weekly, monthly or quarterly (%)', coalesce(p_period, '<none>') USING ERRCODE = '22023'; END IF;
  SELECT x.cadence_id INTO v_open FROM executive.cadences x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.period = p_period AND x.closed_at IS NULL FOR UPDATE;
  IF v_open IS NOT NULL THEN RAISE EXCEPTION 'cadence rejected (state): a % cadence is already open (%); reset it to open the next', p_period, v_open USING ERRCODE = '22023'; END IF;
  SELECT coalesce(max(x.sequence), 0) + 1 INTO v_seq FROM executive.cadences x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.period = p_period;
  INSERT INTO executive.cadences (cadence_id, scope, tenant_id, domain_id, period, sequence, opened_by, correlation_id)
  VALUES (p_cadence_id, 'DOMAIN', p_tenant, p_domain, p_period, v_seq, p_actor, p_correlation) RETURNING * INTO c;
  INSERT INTO executive.cadence_events (event_id, scope, tenant_id, domain_id, cadence_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_cadence_id, 'cadence.opened', p_actor, jsonb_build_object('period', p_period, 'sequence', v_seq), p_correlation);
  RETURN executive.cadence_answer(c);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.open_cadence(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.open_cadence(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

/* THE CLOSING RECORD of a cycle — what was reviewed, decided, committed and left open between its opening and the reset — read from the
   ledgers (room reviews and governed reviews, commitments and rejections, commitment items, the open queue, the rooms past their deadline,
   the packages in flight, the board-class decisions still open). */
CREATE OR REPLACE FUNCTION executive.cadence_closing_record(p_tenant uuid, p_domain uuid, p_since timestamptz, p_at timestamptz) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = executive, decision, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'window', jsonb_build_object('from', p_since, 'to', p_at),
    'reviewed', jsonb_build_object(
      'room_reviews', (SELECT count(*) FROM executive.room_events e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.event = 'review.recorded' AND e.occurred_at >= p_since AND e.occurred_at <= p_at),
      'reviews_concluded', (SELECT count(*) FROM executive.reviews v WHERE v.tenant_id = p_tenant AND v.domain_id = p_domain AND v.state = 'concluded' AND v.closed_at >= p_since AND v.closed_at <= p_at),
      'reviews_withdrawn', (SELECT count(*) FROM executive.reviews v WHERE v.tenant_id = p_tenant AND v.domain_id = p_domain AND v.state = 'withdrawn' AND v.closed_at >= p_since AND v.closed_at <= p_at)),
    'decided', jsonb_build_object(
      'committed', (SELECT coalesce(jsonb_agg(jsonb_build_object('package_id', c.package_id, 'version', c.version, 'committed_at', c.committed_at) ORDER BY c.committed_at), '[]'::jsonb)
                      FROM decision.commitments c WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.committed_at >= p_since AND c.committed_at <= p_at),
      'rejected', (SELECT count(*) FROM decision.package_events e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.event IN ('version.rejected', 'version.rejected_by_owner') AND e.occurred_at >= p_since AND e.occurred_at <= p_at),
      'withdrawn', (SELECT count(*) FROM decision.package_events e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.event = 'package.withdrawn' AND e.occurred_at >= p_since AND e.occurred_at <= p_at)),
    'committed', jsonb_build_object(
      'items_opened', (SELECT count(*) FROM decision.commitment_items i WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.created_at >= p_since AND i.created_at <= p_at),
      'items_done', (SELECT count(*) FROM decision.commitment_events e WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.event = 'commitment.closed' AND e.occurred_at >= p_since AND e.occurred_at <= p_at)),
    'left_open', jsonb_build_object(
      'attention_items', (SELECT count(*) FROM executive.attention_items i WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.state IN ('open', 'escalated', 'unrouted')),
      'rooms_overdue', (SELECT count(*) FROM executive.rooms_current r WHERE r.tenant_id = p_tenant AND r.domain_id = p_domain AND r.deadline IS NOT NULL AND r.deadline <= p_at),
      'packages_in_flight', (SELECT count(*) FROM decision.packages_current p WHERE p.tenant_id = p_tenant AND p.domain_id = p_domain AND p.state IN ('proposed', 'under_review', 'approved')),
      'commitment_items_overdue', (SELECT count(*) FROM decision.commitment_items i WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.due_at <= p_at AND i.state IN ('open', 'in_progress', 'exception', 'retask_required')),
      'board_decisions_open', (SELECT coalesce(jsonb_agg(jsonb_build_object('package_id', p.package_id, 'title', p.title, 'state', p.state) ORDER BY p.declared_at), '[]'::jsonb)
                                 FROM decision.packages_current p WHERE p.tenant_id = p_tenant AND p.domain_id = p_domain AND p.decision_class = 'board' AND p.state IN ('proposed', 'under_review', 'approved'))))
$$;
REVOKE ALL ON FUNCTION executive.cadence_closing_record(uuid, uuid, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.cadence_closing_record(uuid, uuid, timestamptz, timestamptz) TO eye_app, eye_commit;

/* RESET the loop (JRN-19): the open cadence of the period is CLOSED with its closing record and the NEXT is opened (sequence + 1) in
   the same write. Open BOARD-class decisions refuse the reset unless the EXECUTIVE confirms it with a reason (an operator cannot). */
CREATE OR REPLACE FUNCTION executive.reset_cadence(p_next_id uuid, p_tenant uuid, p_domain uuid, p_period text, p_confirm_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c executive.cadences%ROWTYPE; n executive.cadences%ROWTYPE; v_at timestamptz := clock_timestamp(); v_record jsonb; v_board int; v_reason text := nullif(btrim(coalesce(p_confirm_reason, '')), '');
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.cadence.reset']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'cadence rejected (actor): reset by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, executive.cadence_roles()) THEN
    RAISE EXCEPTION 'cadence rejected (actor): a cadence is reset by a named human holding %', array_to_string(executive.cadence_roles(), ', ') USING ERRCODE = '42501';
  END IF;
  IF p_period IS NULL OR p_period NOT IN ('weekly', 'monthly', 'quarterly') THEN RAISE EXCEPTION 'cadence rejected (period): a cadence is weekly, monthly or quarterly (%)', coalesce(p_period, '<none>') USING ERRCODE = '22023'; END IF;
  SELECT * INTO c FROM executive.cadences x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.period = p_period AND x.closed_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'cadence rejected (state): no % cadence is open in this domain; open one first', p_period USING ERRCODE = '22023'; END IF;
  v_record := executive.cadence_closing_record(p_tenant, p_domain, c.opened_at, v_at);
  v_board := jsonb_array_length(v_record #> ARRAY['left_open', 'board_decisions_open']);
  IF v_board > 0 THEN
    IF v_reason IS NULL THEN
      RAISE EXCEPTION 'cadence rejected (state): % board-class decision(s) remain open; the executive confirms the reset with a reason', v_board USING ERRCODE = '22023';
    END IF;
    IF length(v_reason) < 8 THEN RAISE EXCEPTION 'cadence rejected (reason): the confirmation states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
    IF NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['executive', 'platform_admin']) THEN
      RAISE EXCEPTION 'cadence rejected (actor): only the executive confirms a reset over % open board-class decision(s); an operator escalates it', v_board USING ERRCODE = '42501';
    END IF;
    v_record := v_record || jsonb_build_object('confirmed', jsonb_build_object('by', p_actor, 'reason', v_reason, 'board_decisions_open', v_board));
  END IF;
  UPDATE executive.cadences SET closed_by = p_actor, closed_at = v_at, closing_record = v_record WHERE cadence_id = c.cadence_id RETURNING * INTO c;
  INSERT INTO executive.cadences (cadence_id, scope, tenant_id, domain_id, period, sequence, opened_by, opened_at, correlation_id)
  VALUES (p_next_id, 'DOMAIN', p_tenant, p_domain, p_period, c.sequence + 1, p_actor, v_at, p_correlation) RETURNING * INTO n;
  INSERT INTO executive.cadence_events (event_id, scope, tenant_id, domain_id, cadence_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, c.cadence_id, CASE WHEN v_board > 0 THEN 'cadence.reset_confirmed' ELSE 'cadence.reset' END, p_actor,
          jsonb_build_object('closing_record', v_record, 'next_cadence_id', p_next_id, 'next_sequence', n.sequence), p_correlation),
         (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_next_id, 'cadence.opened', p_actor, jsonb_build_object('period', p_period, 'sequence', n.sequence, 'after', c.cadence_id), p_correlation);
  RETURN jsonb_build_object('closed', executive.cadence_answer(c), 'opened', executive.cadence_answer(n), 'confirmed', v_board > 0);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.reset_cadence(uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.reset_cadence(uuid,uuid,uuid,text,text,uuid,uuid) TO eye_commit;


-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §H4 THE EXECUTIVE OPERATOR'S TOOLING (h5; PER-03): the agenda, the escalations; the routing through the existing ports
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE executive.cadence_agenda (
  agenda_id      uuid PRIMARY KEY,
  scope          text NOT NULL,
  tenant_id      uuid NOT NULL,
  domain_id      uuid NOT NULL,
  cadence_id     uuid NOT NULL REFERENCES executive.cadences(cadence_id),
  position       int  NOT NULL CHECK (position >= 1),
  object_kind    text NOT NULL CHECK (object_kind IN ('attention_item', 'room', 'package', 'commitment_item', 'review', 'warning', 'briefing')),
  object_id      uuid NOT NULL,
  note           text CHECK (note IS NULL OR length(btrim(note)) BETWEEN 1 AND 400),
  set_by         uuid NOT NULL,
  set_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  removed_by     uuid,
  removed_at     timestamptz,
  correlation_id uuid NOT NULL,
  CONSTRAINT xcag_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xcag_removed CHECK ((removed_at IS NULL) = (removed_by IS NULL))
);
CREATE INDEX xcag_cadence ON executive.cadence_agenda (cadence_id, position) WHERE removed_at IS NULL;
/* An agenda row moves one way: current → removed (the removal set once); nothing else of the row changes. */
CREATE OR REPLACE FUNCTION executive.cadence_agenda_forward() RETURNS trigger
SET search_path = executive, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'cadence agenda rows are append-only: DELETE prohibited' USING ERRCODE = '2F002'; END IF;
  IF OLD.removed_at IS NOT NULL OR NEW.removed_at IS NULL OR (to_jsonb(NEW) - 'removed_at' - 'removed_by') <> (to_jsonb(OLD) - 'removed_at' - 'removed_by') THEN
    RAISE EXCEPTION 'cadence agenda row % is immutable; a new row supersedes it', OLD.agenda_id USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER xcag_forward BEFORE UPDATE OR DELETE ON executive.cadence_agenda FOR EACH ROW EXECUTE FUNCTION executive.cadence_agenda_forward();
COMMENT ON TABLE executive.cadence_agenda IS 'B36 §H (0094; PER-03 CAP-EO-01): the items of a cycle in the order the executive operator set them, each linked to its object; a row is superseded (removed) when the agenda is set again, never edited.';

CREATE TABLE executive.cadence_escalations (
  escalation_id  uuid PRIMARY KEY,
  scope          text NOT NULL,
  tenant_id      uuid NOT NULL,
  domain_id      uuid NOT NULL,
  cadence_id     uuid NOT NULL REFERENCES executive.cadences(cadence_id),
  subject_kind   text NOT NULL CHECK (subject_kind IN ('attention_item', 'room', 'package', 'commitment_item', 'review', 'warning', 'briefing', 'cadence')),
  subject_id     uuid NOT NULL,
  reason         text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  raised_by      uuid NOT NULL,
  raised_to      uuid NOT NULL,
  raised_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  item_id        uuid NOT NULL REFERENCES executive.attention_items(item_id),
  state          text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'answered')),
  answered_by    uuid,
  answered_at    timestamptz,
  answer         text,
  correlation_id uuid NOT NULL,
  CONSTRAINT xces_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xces_answered CHECK ((state = 'answered') = (answered_at IS NOT NULL) AND (answered_at IS NULL) = (answered_by IS NULL) AND (answered_at IS NULL) = (answer IS NULL))
);
CREATE INDEX xces_cadence ON executive.cadence_escalations (cadence_id, raised_at);
CREATE OR REPLACE FUNCTION executive.cadence_escalations_forward() RETURNS trigger
SET search_path = executive, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'cadence escalations are append-only: DELETE prohibited' USING ERRCODE = '2F002'; END IF;
  IF OLD.state <> 'open' OR NEW.state <> 'answered' OR (to_jsonb(NEW) - 'state' - 'answered_by' - 'answered_at' - 'answer') <> (to_jsonb(OLD) - 'state' - 'answered_by' - 'answered_at' - 'answer') THEN
    RAISE EXCEPTION 'cadence escalation % is % and answers once', OLD.escalation_id, OLD.state USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER xces_forward BEFORE UPDATE OR DELETE ON executive.cadence_escalations FOR EACH ROW EXECUTE FUNCTION executive.cadence_escalations_forward();
COMMENT ON TABLE executive.cadence_escalations IS 'B36 §H (0094; PER-03): a GAP the executive operator escalated to a named executive — the subject, the reason, the attention item it placed on the executive''s queue (class queue.governance); answered once by the executive.';

CREATE OR REPLACE FUNCTION executive.agenda_of(p_cadence uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = executive, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('agenda_id', a.agenda_id, 'position', a.position, 'object_kind', a.object_kind, 'object_id', a.object_id, 'note', a.note, 'set_by', a.set_by, 'set_at', a.set_at) ORDER BY a.position), '[]'::jsonb)
    FROM executive.cadence_agenda a WHERE a.cadence_id = p_cadence AND a.removed_at IS NULL
$$;
GRANT EXECUTE ON FUNCTION executive.agenda_of(uuid) TO eye_app, eye_commit;

/* (§H3's read, declared here after the agenda and the escalations it composes.) The cadence read: the open cadence of the period (or the newest of any period when none is named), the last closed one's record, the
   agenda of the open cycle and its open escalations. */
CREATE OR REPLACE FUNCTION executive.cadence_of(p_tenant uuid, p_domain uuid, p_period text) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = executive, pg_catalog, pg_temp AS $$
  WITH o AS (SELECT * FROM executive.cadences c WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.closed_at IS NULL AND (p_period IS NULL OR c.period = p_period)
              ORDER BY CASE c.period WHEN 'weekly' THEN 0 WHEN 'monthly' THEN 1 ELSE 2 END LIMIT 1),
       l AS (SELECT * FROM executive.cadences c WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.closed_at IS NOT NULL AND c.period = coalesce((SELECT period FROM o), p_period, 'weekly')
              ORDER BY c.closed_at DESC LIMIT 1)
  SELECT jsonb_build_object('open', (SELECT executive.cadence_answer(o) FROM o), 'last_closed', (SELECT executive.cadence_answer(l) FROM l),
                            'agenda', coalesce((SELECT executive.agenda_of(o.cadence_id) FROM o), '[]'::jsonb),
                            'escalations', coalesce((SELECT jsonb_agg(jsonb_build_object('escalation_id', x.escalation_id, 'subject_kind', x.subject_kind, 'subject_id', x.subject_id, 'reason', x.reason,
                                                                                        'raised_by', x.raised_by, 'raised_to', x.raised_to, 'raised_at', x.raised_at, 'state', x.state, 'item_id', x.item_id) ORDER BY x.raised_at)
                                                        FROM executive.cadence_escalations x, o WHERE x.cadence_id = o.cadence_id), '[]'::jsonb),
                            'as_of', clock_timestamp())
$$;
GRANT EXECUTE ON FUNCTION executive.cadence_of(uuid, uuid, text) TO eye_app, eye_commit;

/* Does an object of the kind exist in this domain? (the agenda and the escalation link to declared objects only) */
CREATE OR REPLACE FUNCTION executive.home_object_exists(p_tenant uuid, p_domain uuid, p_kind text, p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = executive, decision, prediction, pg_catalog, pg_temp AS $$
  SELECT CASE p_kind
    WHEN 'attention_item' THEN EXISTS (SELECT 1 FROM executive.attention_items x WHERE x.item_id = p_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain)
    WHEN 'room' THEN EXISTS (SELECT 1 FROM executive.rooms_current x WHERE x.room_id = p_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain)
    WHEN 'package' THEN EXISTS (SELECT 1 FROM decision.packages_current x WHERE x.package_id = p_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain)
    WHEN 'commitment_item' THEN EXISTS (SELECT 1 FROM decision.commitment_items x WHERE x.item_id = p_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain)
    WHEN 'review' THEN EXISTS (SELECT 1 FROM executive.reviews x WHERE x.review_id = p_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain)
    WHEN 'warning' THEN EXISTS (SELECT 1 FROM prediction.warnings_current x WHERE x.warning_id = p_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain)
    WHEN 'briefing' THEN EXISTS (SELECT 1 FROM executive.briefings x WHERE x.briefing_id = p_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain)
    WHEN 'cadence' THEN EXISTS (SELECT 1 FROM executive.cadences x WHERE x.cadence_id = p_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain)
    ELSE false END
$$;
REVOKE ALL ON FUNCTION executive.home_object_exists(uuid, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.home_object_exists(uuid, uuid, text, uuid) TO eye_app, eye_commit;

/* SET the agenda of the open cadence: the items in the order given ({kind, id, note?}[], at most 50), each a declared object of this
   domain; the previous agenda rows are superseded (removed) in the same write. The operator's act (executive.agenda.set); the executive
   and the administrators may too. */
CREATE OR REPLACE FUNCTION executive.set_agenda(p_tenant uuid, p_domain uuid, p_cadence_id uuid, p_items jsonb, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c executive.cadences%ROWTYPE; v_at timestamptz := clock_timestamp(); it jsonb; v_pos int := 0; v_kind text; v_id uuid; v_note text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.agenda.set']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'agenda rejected (actor): set by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, executive.cadence_roles()) THEN
    RAISE EXCEPTION 'agenda rejected (actor): the agenda is curated by a named human holding %', array_to_string(executive.cadence_roles(), ', ') USING ERRCODE = '42501';
  END IF;
  SELECT * INTO c FROM executive.cadences x WHERE x.cadence_id = p_cadence_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'agenda rejected (unknown_cadence): no cadence % in this domain', p_cadence_id USING ERRCODE = '23503'; END IF;
  IF c.closed_at IS NOT NULL THEN RAISE EXCEPTION 'agenda rejected (state): cadence % is closed (sequence %); the agenda belongs to the open cycle', p_cadence_id, c.sequence USING ERRCODE = '22023'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) > 50 THEN RAISE EXCEPTION 'agenda rejected (items): the agenda is a list of at most 50 items' USING ERRCODE = '22023'; END IF;
  UPDATE executive.cadence_agenda SET removed_at = v_at, removed_by = p_actor WHERE cadence_id = p_cadence_id AND removed_at IS NULL;
  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pos := v_pos + 1;
    v_kind := it ->> 'kind'; v_note := nullif(btrim(coalesce(it ->> 'note', '')), '');
    IF v_kind IS NULL OR v_kind NOT IN ('attention_item', 'room', 'package', 'commitment_item', 'review', 'warning', 'briefing') THEN
      RAISE EXCEPTION 'agenda rejected (items): item % names a kind among attention_item, room, package, commitment_item, review, warning, briefing (%)', v_pos, coalesce(v_kind, '<none>') USING ERRCODE = '22023';
    END IF;
    BEGIN v_id := (it ->> 'id')::uuid; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'agenda rejected (items): item % names its object by id', v_pos USING ERRCODE = '22023'; END;
    IF v_id IS NULL THEN RAISE EXCEPTION 'agenda rejected (items): item % names its object by id', v_pos USING ERRCODE = '22023'; END IF;
    IF NOT executive.home_object_exists(p_tenant, p_domain, v_kind, v_id) THEN RAISE EXCEPTION 'agenda rejected (unknown_object): item % — no % % in this domain', v_pos, v_kind, v_id USING ERRCODE = '23503'; END IF;
    IF v_note IS NOT NULL AND length(v_note) > 400 THEN RAISE EXCEPTION 'agenda rejected (items): item % — a note is at most 400 characters', v_pos USING ERRCODE = '22023'; END IF;
    INSERT INTO executive.cadence_agenda (agenda_id, scope, tenant_id, domain_id, cadence_id, position, object_kind, object_id, note, set_by, set_at, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_cadence_id, v_pos, v_kind, v_id, v_note, p_actor, v_at, p_correlation);
  END LOOP;
  INSERT INTO executive.cadence_events (event_id, scope, tenant_id, domain_id, cadence_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_cadence_id, 'agenda.set', p_actor, jsonb_build_object('items', v_pos), p_correlation);
  RETURN jsonb_build_object('cadence_id', p_cadence_id, 'set_at', v_at, 'items', executive.agenda_of(p_cadence_id));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.set_agenda(uuid,uuid,uuid,jsonb,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.set_agenda(uuid,uuid,uuid,jsonb,uuid,uuid) TO eye_commit;

/* ESCALATE A GAP (PER-03): the operator names the subject, the reason and the EXECUTIVE it goes to (an active human holding executive
   or decision_authority); the escalation is placed on the executive's queue as an attention item of class queue.governance (subject
   kind queue = the cadence) — routed OPEN to the named person as a human's act, not a signal the policy judges. */
CREATE OR REPLACE FUNCTION executive.escalate_gap(p_escalation_id uuid, p_tenant uuid, p_domain uuid, p_cadence_id uuid, p_subject_kind text, p_subject_id uuid, p_reason text, p_to uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, prediction, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c executive.cadences%ROWTYPE; v_at timestamptz := clock_timestamp(); v_item uuid := gen_random_uuid(); v_reason text := btrim(coalesce(p_reason, ''));
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.escalation.raise']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'escalation rejected (actor): raised by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, executive.cadence_roles()) THEN
    RAISE EXCEPTION 'escalation rejected (actor): a gap is escalated by a named human holding %', array_to_string(executive.cadence_roles(), ', ') USING ERRCODE = '42501';
  END IF;
  SELECT * INTO c FROM executive.cadences x WHERE x.cadence_id = p_cadence_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'escalation rejected (unknown_cadence): no cadence % in this domain', p_cadence_id USING ERRCODE = '23503'; END IF;
  IF c.closed_at IS NOT NULL THEN RAISE EXCEPTION 'escalation rejected (state): cadence % is closed; a gap is escalated in the open cycle', p_cadence_id USING ERRCODE = '22023'; END IF;
  IF p_subject_kind IS NULL OR p_subject_kind NOT IN ('attention_item', 'room', 'package', 'commitment_item', 'review', 'warning', 'briefing', 'cadence') THEN
    RAISE EXCEPTION 'escalation rejected (subject): the subject is an attention_item, room, package, commitment_item, review, warning, briefing or the cadence (%)', coalesce(p_subject_kind, '<none>') USING ERRCODE = '22023';
  END IF;
  IF NOT executive.home_object_exists(p_tenant, p_domain, p_subject_kind, p_subject_id) THEN RAISE EXCEPTION 'escalation rejected (unknown_object): no % % in this domain', p_subject_kind, p_subject_id USING ERRCODE = '23503'; END IF;
  IF length(v_reason) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'escalation rejected (reason): an escalation states the gap in 8–2000 characters' USING ERRCODE = '22023'; END IF;
  IF p_to IS NULL OR p_to = p_actor OR NOT decision.is_active_human(p_to, p_tenant) OR NOT executive.holds_role(p_to, p_tenant, p_domain, ARRAY['executive', 'decision_authority']) THEN
    RAISE EXCEPTION 'escalation rejected (recipient): a gap is escalated to another active human holding executive or decision_authority in this domain' USING ERRCODE = '22023';
  END IF;
  INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state,
                                         owner_principal_id, route_roles, policy_id, policy_version, evaluation, details, due_at, escalations, correlation_id)
  VALUES (v_item, 'DOMAIN', p_tenant, p_domain, 'queue.governance', 'queue', p_cadence_id, p_escalation_id, 'CadenceGapEscalated',
          left(format('ESCALATED GAP (%s %s): %s', replace(p_subject_kind, '_', ' '), p_subject_id, v_reason), 512), 'material', 'open',
          p_to, ARRAY['executive'], NULL, NULL,
          jsonb_build_object('outcome', 'material', 'reasons', jsonb_build_array('an executive operator escalated a gap of the cadence to a named executive (a human''s act; no policy judged it)'), 'dimensions', jsonb_build_object('consequence', 'C2', 'confidence', 1, 'hours_to_window', 48)),
          jsonb_build_object('escalation_id', p_escalation_id, 'cadence_id', p_cadence_id, 'subject_kind', p_subject_kind, 'subject_id', p_subject_id, 'reason', v_reason, 'raised_by', p_actor, 'kind', 'cadence_escalation'),
          v_at + interval '48 hours', 0, p_correlation);
  PERFORM executive.attention_event(v_item, p_tenant, p_domain, 'item.routed', p_actor,
            jsonb_build_object('outcome', 'material', 'owner', p_to, 'route_roles', jsonb_build_array('executive'), 'due_at', v_at + interval '48 hours', 'cause_event_id', p_escalation_id, 'cause_event_type', 'CadenceGapEscalated', 'unrouted', false), p_correlation);
  INSERT INTO executive.cadence_escalations (escalation_id, scope, tenant_id, domain_id, cadence_id, subject_kind, subject_id, reason, raised_by, raised_to, raised_at, item_id, correlation_id)
  VALUES (p_escalation_id, 'DOMAIN', p_tenant, p_domain, p_cadence_id, p_subject_kind, p_subject_id, v_reason, p_actor, p_to, v_at, v_item, p_correlation);
  INSERT INTO executive.cadence_events (event_id, scope, tenant_id, domain_id, cadence_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_cadence_id, 'gap.escalated', p_actor, jsonb_build_object('escalation_id', p_escalation_id, 'subject_kind', p_subject_kind, 'subject_id', p_subject_id, 'to', p_to, 'item_id', v_item), p_correlation);
  RETURN jsonb_build_object('escalation_id', p_escalation_id, 'cadence_id', p_cadence_id, 'subject_kind', p_subject_kind, 'subject_id', p_subject_id, 'reason', v_reason, 'raised_by', p_actor, 'raised_to', p_to, 'raised_at', v_at, 'item_id', v_item, 'state', 'open');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.escalate_gap(uuid,uuid,uuid,uuid,text,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.escalate_gap(uuid,uuid,uuid,uuid,text,uuid,text,uuid,uuid,uuid) TO eye_commit;

/* The executive ANSWERS an escalation (the person it was raised to, or an administrator), once, with a note; the queue item stays the
   executive's to acknowledge or close through the queue's own acts. */
CREATE OR REPLACE FUNCTION executive.answer_escalation(p_escalation_id uuid, p_tenant uuid, p_domain uuid, p_answer text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x executive.cadence_escalations%ROWTYPE; v_at timestamptz := clock_timestamp(); v_answer text := btrim(coalesce(p_answer, ''));
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.escalation.answer']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'escalation rejected (actor): answered by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO x FROM executive.cadence_escalations e WHERE e.escalation_id = p_escalation_id AND e.tenant_id = p_tenant AND e.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'escalation rejected (unknown_escalation): no escalation % in this domain', p_escalation_id USING ERRCODE = '23503'; END IF;
  IF p_actor <> x.raised_to AND NOT executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['domain_admin', 'platform_admin']) THEN
    RAISE EXCEPTION 'escalation rejected (actor): escalation % is answered by the executive it was raised to (%)', p_escalation_id, x.raised_to USING ERRCODE = '42501';
  END IF;
  IF x.state <> 'open' THEN RAISE EXCEPTION 'escalation rejected (state): escalation % is already answered', p_escalation_id USING ERRCODE = '22023'; END IF;
  IF length(v_answer) < 8 THEN RAISE EXCEPTION 'escalation rejected (answer): an answer is at least 8 characters' USING ERRCODE = '22023'; END IF;
  UPDATE executive.cadence_escalations SET state = 'answered', answered_by = p_actor, answered_at = v_at, answer = v_answer WHERE escalation_id = p_escalation_id RETURNING * INTO x;
  INSERT INTO executive.cadence_events (event_id, scope, tenant_id, domain_id, cadence_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, x.cadence_id, 'escalation.answered', p_actor, jsonb_build_object('escalation_id', p_escalation_id, 'answer', v_answer), p_correlation);
  RETURN jsonb_build_object('escalation_id', p_escalation_id, 'state', x.state, 'answered_by', p_actor, 'answered_at', v_at, 'answer', v_answer, 'item_id', x.item_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.answer_escalation(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.answer_escalation(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

-- (executive.delegate_attention_item and executive.reassign_human_task are re-declared at the end of this file — §H4b — copied whole
--  from 0086 / 0090 with their one change each: the executive operator routes work through them.)

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §H5 THE EXECUTIVE HOME (h1; WS-01): ONE read under the reader's context
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
/* THE HOME — a SQL composition (one function, one snapshot, one as-of), invoker-bound (the reader's own RLS), composing the seven
   sections under the reader's §0 context: the objective (a link filter on decisions, commitments and outcomes; a boost on the queue), the
   scenario (a filter on scenario rooms; a boost on the queue), the horizon (the window of commitments due and of outcomes without an open
   cadence), the classification ceiling (the lesser of the context's and the reader's — hides signals above it and SAYS how many), the
   effective instant (the as-of of every section; NULL = now). Each section: as_of, count (the whole population), items (at most p_limit),
   limitations (what was filtered, what is degraded, what is not composed). The context each section was read under is named by its digest.
   A sibling part's read (decision.gate_state_of, executive.attention_queue_holds) is used when present and declared absent otherwise. */
CREATE OR REPLACE FUNCTION executive.home(p_tenant uuid, p_domain uuid, p_principal uuid, p_ceiling text, p_limit int) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = executive, decision, prediction, graph, simulation, observation, pg_catalog, pg_temp AS $$
DECLARE v_ctx jsonb; v_obj uuid; v_scn uuid; v_hz text; v_ceiling text; v_reader_ceiling text := CASE WHEN coalesce(p_ceiling, '') IN ('public', 'internal', 'confidential', 'restricted') THEN p_ceiling ELSE 'internal' END;
        v_at timestamptz; v_span interval; v_limit int := least(greatest(coalesce(p_limit, 10), 1), 50); v_since timestamptz; v_cad jsonb; v_cad_open jsonb;
        v_gate_fn boolean := to_regprocedure('decision.gate_state_of(uuid,int)') IS NOT NULL; v_holds_tbl boolean := to_regclass('executive.attention_queue_holds') IS NOT NULL; v_held int := 0;
        v_pri jsonb; v_pri_n int; v_int jsonb; v_int_n int; v_int_hidden int; v_wrn jsonb; v_wrn_n int; v_dec jsonb := '[]'::jsonb; v_dec_n int := 0; v_dec_dropped int := 0;
        v_cmt jsonb; v_cmt_n int; v_out jsonb; v_out_n int; r record; v_gate jsonb; v_lim jsonb; v_ctx_ref jsonb;
BEGIN
  v_ctx := executive.current_context(p_principal);
  v_obj := (v_ctx ->> 'objective_id')::uuid; v_scn := (v_ctx ->> 'scenario_id')::uuid; v_hz := coalesce(v_ctx ->> 'horizon', '90d');
  v_ceiling := CASE WHEN v_ctx IS NOT NULL AND simulation.classification_rank(v_ctx ->> 'classification') < simulation.classification_rank(v_reader_ceiling) THEN v_ctx ->> 'classification' ELSE v_reader_ceiling END;
  v_at := coalesce((v_ctx ->> 'effective_at')::timestamptz, clock_timestamp());
  v_span := executive.home_horizon_interval(v_hz);
  v_ctx_ref := jsonb_build_object('digest', v_ctx ->> 'digest', 'context_id', v_ctx ->> 'context_id', 'objective_id', v_obj, 'scenario_id', v_scn, 'horizon', v_hz, 'classification', v_ceiling, 'effective_at', v_ctx ->> 'effective_at', 'set', v_ctx IS NOT NULL);
  -- THE CADENCE (the open cycle; the window of "since" for the outcomes and the closing counts)
  v_cad := executive.cadence_of(p_tenant, p_domain, NULL);
  v_cad_open := v_cad -> 'open';
  v_since := coalesce((v_cad_open ->> 'opened_at')::timestamptz, v_at - v_span);
  -- PRIORITIES: the queue's live items, the context's subjects first, then the escalated, then the evaluated rank, the due instant, the newest
  SELECT count(*) INTO v_pri_n FROM executive.attention_items i WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.state IN ('open', 'escalated', 'unrouted', 'acknowledged') AND i.created_at <= v_at;
  SELECT coalesce(jsonb_agg(j ORDER BY ord), '[]'::jsonb) INTO v_pri FROM (
    SELECT jsonb_build_object('item_id', i.item_id, 'signal_class', i.signal_class, 'subject_kind', i.subject_kind, 'subject_id', i.subject_id, 'title', i.title, 'state', i.state, 'owner', i.owner_principal_id,
                              'route_roles', to_jsonb(i.route_roles), 'due_at', i.due_at, 'overdue', (i.due_at IS NOT NULL AND i.due_at <= v_at AND i.state IN ('open', 'escalated')), 'escalations', i.escalations,
                              'created_at', i.created_at, 'in_context', ((v_scn IS NOT NULL AND i.subject_kind = 'scenario' AND i.subject_id = v_scn) OR (v_obj IS NOT NULL AND i.subject_kind = 'strategy_object' AND i.subject_id = v_obj)),
                              'details', i.details - 'by') AS j,
           row_number() OVER (ORDER BY ((v_scn IS NOT NULL AND i.subject_kind = 'scenario' AND i.subject_id = v_scn) OR (v_obj IS NOT NULL AND i.subject_kind = 'strategy_object' AND i.subject_id = v_obj)) DESC,
                                       (i.state = 'escalated') DESC, executive.attention_rank_key(i.evaluation -> 'dimensions'), i.due_at NULLS LAST, i.created_at DESC) AS ord
      FROM executive.attention_items i WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.state IN ('open', 'escalated', 'unrouted', 'acknowledged') AND i.created_at <= v_at) x WHERE ord <= v_limit;
  IF v_holds_tbl THEN
    -- the attention part's table read by name only; a shape this read does not expect is declared, never a failure of the home
    BEGIN
      EXECUTE 'SELECT count(*)::int FROM executive.attention_queue_holds h WHERE h.tenant_id = $1 AND h.domain_id = $2 AND h.released_at IS NULL' INTO v_held USING p_tenant, p_domain;
    EXCEPTION WHEN OTHERS THEN v_held := -1;
    END;
  END IF;
  -- INTELLIGENCE: the newest signals (B28) under the ceiling; the hidden ones counted
  SELECT count(*) FILTER (WHERE simulation.classification_rank(s.classification) <= simulation.classification_rank(v_ceiling)), count(*) FILTER (WHERE simulation.classification_rank(s.classification) > simulation.classification_rank(v_ceiling))
    INTO v_int_n, v_int_hidden FROM prediction.signals_current s WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.maturity <> 'invalid' AND s.created_at <= v_at;
  SELECT coalesce(jsonb_agg(jsonb_build_object('signal_id', s.signal_id, 'title', s.title, 'maturity', s.maturity, 'novelty', s.novelty, 'confidence', s.confidence, 'classification', s.classification, 'disposition', s.disposition,
                                               'independent_sources', s.independent_sources, 'as_of', s.as_of, 'updated_at', s.updated_at, 'synthetic_state', s.synthetic_state) ORDER BY s.updated_at DESC), '[]'::jsonb) INTO v_int
    FROM (SELECT * FROM prediction.signals_current s WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.maturity <> 'invalid' AND s.created_at <= v_at
            AND simulation.classification_rank(s.classification) <= simulation.classification_rank(v_ceiling) ORDER BY s.updated_at DESC LIMIT v_limit) s;
  -- WARNINGS: raised or acknowledged, inside their response window at the as-of
  SELECT count(*) INTO v_wrn_n FROM prediction.warnings_current w WHERE w.tenant_id = p_tenant AND w.domain_id = p_domain AND w.state IN ('raised', 'acknowledged') AND w.response_window_opens_at <= v_at AND w.response_window_closes_at > v_at;
  SELECT coalesce(jsonb_agg(jsonb_build_object('warning_id', w.warning_id, 'title', w.title, 'state', w.state, 'confidence', w.confidence, 'consequence', w.consequence, 'routed_to', w.routed_to,
                                               'opens_at', w.response_window_opens_at, 'closes_at', w.response_window_closes_at, 'raised_at', w.raised_at, 'branch_id', w.branch_id, 'acknowledged_by', w.acknowledged_by) ORDER BY w.response_window_closes_at), '[]'::jsonb) INTO v_wrn
    FROM (SELECT * FROM prediction.warnings_current w WHERE w.tenant_id = p_tenant AND w.domain_id = p_domain AND w.state IN ('raised', 'acknowledged') AND w.response_window_opens_at <= v_at AND w.response_window_closes_at > v_at
           ORDER BY w.response_window_closes_at LIMIT v_limit) w;
  -- DECISIONS: the rooms (every kind) and the packages in flight without a room, each with its gate state when the gates part's read exists
  FOR r IN
    SELECT x.* FROM (
      SELECT m.room_id, m.kind, m.subject_id, m.deadline, m.title, m.owner_principal_id AS owner, m.package_id, m.next_review_at, m.opened_at AS since, p.state AS package_state, p.current_version, p.decision_class,
             (m.deadline IS NOT NULL AND m.deadline <= v_at) AS overdue, (m.next_review_at <= v_at) AS review_overdue,
             (v_obj IS NULL OR (m.kind = 'objective_review' AND m.subject_id = v_obj) OR m.kind = 'scenario'
                OR (m.package_id IS NOT NULL AND EXISTS (SELECT 1 FROM decision.package_versions v WHERE v.package_id = m.package_id AND v.version = coalesce(p.current_version, 1) AND v.objectives ? v_obj::text))) AS obj_ok,
             (v_scn IS NULL OR m.kind <> 'scenario' OR m.subject_id = v_scn) AS scn_ok
        FROM executive.rooms_current m LEFT JOIN decision.packages_current p ON p.package_id = m.package_id
       WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain AND m.opened_at <= v_at
      UNION ALL
      SELECT NULL::uuid, 'decision', NULL::uuid, NULL::timestamptz, p.title, p.owner_principal_id, p.package_id, NULL::timestamptz, p.declared_at, p.state, p.current_version, p.decision_class, false, false,
             (v_obj IS NULL OR EXISTS (SELECT 1 FROM decision.package_versions v WHERE v.package_id = p.package_id AND v.version = coalesce(p.current_version, 1) AND v.objectives ? v_obj::text)), true
        FROM decision.packages_current p
       WHERE p.tenant_id = p_tenant AND p.domain_id = p_domain AND p.state IN ('proposed', 'under_review', 'approved') AND p.declared_at <= v_at
         AND NOT EXISTS (SELECT 1 FROM executive.rooms_current m WHERE m.package_id = p.package_id)) x
    ORDER BY x.overdue DESC, x.review_overdue DESC, x.deadline NULLS LAST, x.since DESC
  LOOP
    IF NOT (r.obj_ok AND r.scn_ok) THEN v_dec_dropped := v_dec_dropped + 1; CONTINUE; END IF;
    v_dec_n := v_dec_n + 1;
    IF v_dec_n > v_limit THEN CONTINUE; END IF;
    v_gate := NULL;
    IF v_gate_fn AND r.package_id IS NOT NULL THEN EXECUTE 'SELECT decision.gate_state_of($1, $2)' INTO v_gate USING r.package_id, coalesce(r.current_version, 1); END IF;
    v_dec := v_dec || jsonb_build_object('room_id', r.room_id, 'kind', r.kind, 'subject_id', r.subject_id, 'deadline', r.deadline, 'overdue', r.overdue, 'title', r.title, 'owner', r.owner, 'package_id', r.package_id,
                                         'package_state', r.package_state, 'current_version', r.current_version, 'decision_class', r.decision_class, 'next_review_at', r.next_review_at, 'review_overdue', r.review_overdue, 'since', r.since,
                                         'gate', v_gate, 'gate_basis', CASE WHEN v_gate IS NOT NULL THEN 'decision.gate_state_of' WHEN r.package_id IS NOT NULL THEN 'the version state (the gates part''s read is absent)' ELSE 'a subject room has no gate' END);
  END LOOP;
  -- COMMITMENTS: the tracker's live items overdue or due inside the horizon (the objective filter on their objectives)
  SELECT count(*) INTO v_cmt_n FROM decision.commitment_tracker(p_tenant, p_domain, v_at) t
   WHERE t.state IN ('open', 'in_progress', 'exception', 'retask_required') AND (t.overdue OR t.due_at <= v_at + v_span) AND (v_obj IS NULL OR v_obj = ANY (t.objectives));
  SELECT coalesce(jsonb_agg(jsonb_build_object('item_id', t.item_id, 'commitment_id', t.commitment_id, 'package_id', t.package_id, 'package_title', t.package_title, 'kind', t.kind, 'title', t.title, 'owner', t.owner, 'reviewer', t.reviewer,
                                               'due_at', t.due_at, 'state', t.state, 'overdue', t.overdue, 'open_exceptions', t.open_exceptions, 'severity', t.severity, 'reasons', to_jsonb(t.reasons), 'objectives', to_jsonb(t.objectives)) ORDER BY t.overdue DESC, t.due_at), '[]'::jsonb) INTO v_cmt
    FROM (SELECT * FROM decision.commitment_tracker(p_tenant, p_domain, v_at) t
           WHERE t.state IN ('open', 'in_progress', 'exception', 'retask_required') AND (t.overdue OR t.due_at <= v_at + v_span) AND (v_obj IS NULL OR v_obj = ANY (t.objectives)) ORDER BY t.overdue DESC, t.due_at LIMIT v_limit) t;
  -- OUTCOMES: recorded since the cycle opened (or inside the horizon when no cycle is open), the objective filter through the version's objectives
  SELECT count(*) INTO v_out_n FROM decision.outcomes o WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.recorded_at > v_since AND o.recorded_at <= v_at
     AND (v_obj IS NULL OR EXISTS (SELECT 1 FROM decision.package_versions v WHERE v.package_id = o.package_id AND v.version = o.version AND v.objectives ? v_obj::text));
  SELECT coalesce(jsonb_agg(jsonb_build_object('outcome_id', o.outcome_id, 'package_id', o.package_id, 'package_title', p.title, 'version', o.version, 'criterion_key', o.criterion_key, 'met', o.met, 'observed_value', o.observed_value,
                                               'target', o.target, 'comparator', o.comparator, 'unit', o.unit, 'recorded_at', o.recorded_at, 'recorded_by', o.recorded_by, 'simulated', o.simulated IS NOT NULL) ORDER BY o.recorded_at DESC), '[]'::jsonb) INTO v_out
    FROM (SELECT * FROM decision.outcomes o WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.recorded_at > v_since AND o.recorded_at <= v_at
            AND (v_obj IS NULL OR EXISTS (SELECT 1 FROM decision.package_versions v WHERE v.package_id = o.package_id AND v.version = o.version AND v.objectives ? v_obj::text)) ORDER BY o.recorded_at DESC LIMIT v_limit) o
    JOIN decision.packages_current p ON p.package_id = o.package_id;
  RETURN jsonb_build_object(
    'read_at', clock_timestamp(), 'as_of', v_at, 'context', v_ctx_ref, 'ceiling', jsonb_build_object('reader', v_reader_ceiling, 'context', v_ctx ->> 'classification', 'effective', v_ceiling), 'limit', v_limit,
    'sections', jsonb_build_object(
      'priorities', jsonb_build_object('as_of', v_at, 'count', v_pri_n, 'items', v_pri, 'context', v_ctx ->> 'digest',
        'limitations', (SELECT jsonb_agg(l) FROM unnest(array_remove(ARRAY[
          'the queue as the reader''s own scope shows it (RLS); ranked by the evaluated dimensions, the context''s subjects first',
          CASE WHEN v_held > 0 THEN format('the queue is HELD (%s hold(s) in force)', v_held) END,
          CASE WHEN NOT v_holds_tbl THEN 'queue holds not read (the attention part''s executive.attention_queue_holds is absent)' END,
          CASE WHEN v_held = -1 THEN 'queue holds not read (executive.attention_queue_holds has another shape than this read expects)' END,
          CASE WHEN v_pri_n > v_limit THEN format('%s of %s shown', v_limit, v_pri_n) END], NULL)) l)),
      'intelligence', jsonb_build_object('as_of', v_at, 'count', v_int_n, 'items', v_int, 'context', v_ctx ->> 'digest',
        'limitations', (SELECT jsonb_agg(l) FROM unnest(array_remove(ARRAY[
          'the weak signals (B28) not invalid at the as-of; claims of the window are the intelligence workspace''s and are not composed here',
          CASE WHEN v_int_hidden > 0 THEN format('%s signal(s) above the %s ceiling hidden', v_int_hidden, v_ceiling) ELSE format('ceiling %s: nothing hidden', v_ceiling) END,
          CASE WHEN v_int_n > v_limit THEN format('%s of %s shown', v_limit, v_int_n) END], NULL)) l)),
      'warnings', jsonb_build_object('as_of', v_at, 'count', v_wrn_n, 'items', v_wrn, 'context', v_ctx ->> 'digest',
        'limitations', (SELECT jsonb_agg(l) FROM unnest(array_remove(ARRAY['warnings raised or acknowledged whose response window is open at the as-of', CASE WHEN v_wrn_n > v_limit THEN format('%s of %s shown', v_limit, v_wrn_n) END], NULL)) l)),
      'decisions', jsonb_build_object('as_of', v_at, 'count', v_dec_n, 'items', v_dec, 'context', v_ctx ->> 'digest',
        'limitations', (SELECT jsonb_agg(l) FROM unnest(array_remove(ARRAY[
          'the rooms of every kind and the packages in flight without a room; the gate state is the gates part''s read when present',
          CASE WHEN NOT v_gate_fn THEN 'gate states not read (decision.gate_state_of is absent): the package version state stands in' END,
          CASE WHEN v_dec_dropped > 0 THEN format('%s room(s)/package(s) outside the context (objective %s, scenario %s) filtered out', v_dec_dropped, coalesce(v_obj::text, 'any'), coalesce(v_scn::text, 'any')) END,
          CASE WHEN v_dec_n > v_limit THEN format('%s of %s shown', v_limit, v_dec_n) END], NULL)) l)),
      'commitments', jsonb_build_object('as_of', v_at, 'count', v_cmt_n, 'items', v_cmt, 'context', v_ctx ->> 'digest',
        'limitations', (SELECT jsonb_agg(l) FROM unnest(array_remove(ARRAY[
          format('the tracker''s live items overdue or due within the horizon %s', v_hz), CASE WHEN v_obj IS NOT NULL THEN format('filtered to the items linked to objective %s', v_obj) END,
          CASE WHEN v_cmt_n > v_limit THEN format('%s of %s shown', v_limit, v_cmt_n) END], NULL)) l)),
      'outcomes', jsonb_build_object('as_of', v_at, 'count', v_out_n, 'items', v_out, 'context', v_ctx ->> 'digest', 'since', v_since,
        'limitations', (SELECT jsonb_agg(l) FROM unnest(array_remove(ARRAY[
          CASE WHEN v_cad_open IS NULL THEN format('no cadence is open: the outcomes of the last %s', v_hz) ELSE format('the outcomes recorded since the open cadence opened (%s)', v_cad_open ->> 'opened_at') END,
          CASE WHEN v_obj IS NOT NULL THEN format('filtered to the versions naming objective %s', v_obj) END,
          CASE WHEN v_out_n > v_limit THEN format('%s of %s shown', v_limit, v_out_n) END], NULL)) l)),
      'cadence', jsonb_build_object('as_of', v_at, 'count', CASE WHEN v_cad_open IS NULL THEN 0 ELSE 1 END, 'open', v_cad_open, 'last_closed', v_cad -> 'last_closed', 'agenda', v_cad -> 'agenda', 'escalations', v_cad -> 'escalations', 'context', v_ctx ->> 'digest',
        'closed_since', CASE WHEN v_cad_open IS NULL THEN NULL ELSE executive.cadence_closing_record(p_tenant, p_domain, (v_cad_open ->> 'opened_at')::timestamptz, v_at) END,
        'limitations', (SELECT jsonb_agg(l) FROM unnest(array_remove(ARRAY[CASE WHEN v_cad_open IS NULL THEN 'no cadence is open; the executive or the operator opens one' END, 'the loop reset closes the cycle with this record and opens the next'], NULL)) l))));
END $$;
GRANT EXECUTE ON FUNCTION executive.home(uuid, uuid, uuid, text, int) TO eye_app, eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §H6 THE COMMAND VIEWS (h2; CAP-EO-02/-04) and the context switcher's choices
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE executive.command_views (
  view_key     text PRIMARY KEY CHECK (view_key ~ '^[a-z_]+/[a-z-]+$'),
  role_code    text NOT NULL REFERENCES identity.roles(code),
  moment       text NOT NULL CHECK (moment ~ '^[a-z-]{3,40}$'),
  title        text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 120),
  description  text NOT NULL CHECK (length(btrim(description)) >= 8),
  sections     text[] NOT NULL CHECK (cardinality(sections) >= 1 AND sections <@ executive.home_section_names()),
  actions      text[] NOT NULL DEFAULT '{}',
  since        text NOT NULL,
  UNIQUE (role_code, moment)
);
CREATE TRIGGER xcvw_append_only BEFORE UPDATE OR DELETE ON executive.command_views FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
REVOKE ALL ON executive.command_views FROM PUBLIC;
GRANT SELECT ON executive.command_views TO eye_app, eye_commit;
COMMENT ON TABLE executive.command_views IS 'B36 §H (0094; CAP-EO-02/-04): the ROLE × MOMENT command views — which sections of the home and which safe actions each shows; a person sees only the views of roles they hold. The actions are the product''s own governed acts (each its own PDP action); a view offers, never authorises.';
INSERT INTO executive.command_views (view_key, role_code, moment, title, description, sections, actions, since) VALUES
  ('executive/morning', 'executive', 'morning', 'The executive''s morning', 'What needs the executive first thing: the ranked queue, the warnings inside their window, the newest signals, the decisions in flight.',
   ARRAY['priorities', 'warnings', 'intelligence', 'decisions'], ARRAY['acknowledge_item', 'open_room', 'set_context'], '0094'),
  ('executive/board-day', 'executive', 'board-day', 'Board day', 'The board-class decisions and their gate, the commitments the board will ask about, the outcomes of the cycle, the cadence to reset after.',
   ARRAY['decisions', 'commitments', 'outcomes', 'cadence'], ARRAY['read_board', 'reset_cadence', 'set_context'], '0094'),
  ('executive_operator/cadence-prep', 'executive_operator', 'cadence-prep', 'Cadence preparation (chief of staff)', 'The operator prepares the cycle: the agenda from the queue, the decisions and the tracker; the gaps escalated; nothing decided here.',
   ARRAY['cadence', 'priorities', 'decisions', 'commitments'], ARRAY['set_agenda', 'route_work', 'escalate_gap'], '0094'),
  ('decision_owner/review', 'decision_owner', 'review', 'The decision owner''s review', 'The owner''s rooms and packages with their gate, the commitments due, the warnings that touch them.',
   ARRAY['decisions', 'commitments', 'warnings'], ARRAY['record_review', 'open_room'], '0094');

/* The views a person may open: those of the roles they hold in this domain (the platform administrator sees every view). */
CREATE OR REPLACE FUNCTION executive.command_views_for(p_tenant uuid, p_domain uuid, p_principal uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = executive, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('view_key', v.view_key, 'role_code', v.role_code, 'moment', v.moment, 'title', v.title, 'description', v.description, 'sections', to_jsonb(v.sections), 'actions', to_jsonb(v.actions)) ORDER BY v.view_key), '[]'::jsonb)
    FROM executive.command_views v WHERE executive.holds_role(p_principal, p_tenant, p_domain, ARRAY[v.role_code, 'platform_admin'])
$$;
GRANT EXECUTE ON FUNCTION executive.command_views_for(uuid, uuid, uuid) TO eye_app, eye_commit;

/* A command view composed from the SAME read as the home: the view's sections of executive.home, the safe actions it offers, the
   context named. Unknown view → 404; a view of a role the reader does not hold → 403 (the platform administrator holds every view). */
CREATE OR REPLACE FUNCTION executive.command_view(p_tenant uuid, p_domain uuid, p_principal uuid, p_ceiling text, p_view_key text, p_limit int) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = executive, pg_catalog, pg_temp AS $$
DECLARE v executive.command_views%ROWTYPE; h jsonb; s text; v_sections jsonb := '{}'::jsonb;
BEGIN
  SELECT * INTO v FROM executive.command_views x WHERE x.view_key = p_view_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'command view rejected (unknown_view): no command view % (the views are role/moment: executive/morning, executive/board-day, executive_operator/cadence-prep, decision_owner/review)', coalesce(p_view_key, '<none>') USING ERRCODE = '23503'; END IF;
  IF NOT executive.holds_role(p_principal, p_tenant, p_domain, ARRAY[v.role_code, 'platform_admin']) THEN
    RAISE EXCEPTION 'command view rejected (role): the view % is the %''s; the reader holds no such role in this domain', p_view_key, v.role_code USING ERRCODE = '42501';
  END IF;
  h := executive.home(p_tenant, p_domain, p_principal, p_ceiling, p_limit);
  FOREACH s IN ARRAY v.sections LOOP v_sections := v_sections || jsonb_build_object(s, h -> 'sections' -> s); END LOOP;
  RETURN jsonb_build_object('view_key', v.view_key, 'role_code', v.role_code, 'moment', v.moment, 'title', v.title, 'description', v.description, 'sections_order', to_jsonb(v.sections), 'actions', to_jsonb(v.actions),
                            'read_at', h -> 'read_at', 'as_of', h -> 'as_of', 'context', h -> 'context', 'ceiling', h -> 'ceiling', 'sections', v_sections);
END $$;
GRANT EXECUTE ON FUNCTION executive.command_view(uuid, uuid, uuid, text, text, int) TO eye_app, eye_commit;

/* THE SWITCHER's choices: the objectives (graph OBJ) and the scenarios of the domain with their staleness (a retired / closed objective, a
   closed scenario is shown stale and cannot be set — §0's set_context refuses a retired or withdrawn objective; the route refuses a closed
   one and a closed scenario before the port is reached, with the same family `context rejected (stale)`). */
CREATE OR REPLACE FUNCTION executive.context_choices(p_tenant uuid, p_domain uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = executive, graph, prediction, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'objectives', coalesce((SELECT jsonb_agg(jsonb_build_object('id', s.strategy_object_id, 'title', s.title, 'status', s.status, 'owner', s.owner_principal_id, 'stale', s.status <> 'active') ORDER BY (s.status <> 'active'), s.title)
                              FROM graph.strategy_current s WHERE s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.object_type = 'OBJ'), '[]'::jsonb),
    'scenarios', coalesce((SELECT jsonb_agg(jsonb_build_object('id', x.scenario_id, 'title', x.title, 'state', x.state, 'owner', x.owner_principal_id, 'stale', x.state <> 'active') ORDER BY (x.state <> 'active'), x.title)
                             FROM prediction.scenarios_current x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain), '[]'::jsonb),
    'horizons', jsonb_build_array('30d', '90d', '12m', '36m'), 'classifications', jsonb_build_array('public', 'internal', 'confidential', 'restricted'), 'as_of', clock_timestamp())
$$;
GRANT EXECUTE ON FUNCTION executive.context_choices(uuid, uuid) TO eye_app, eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §H7 THE EXECUTIVE SEARCH with explanation (h4) and its access ledger
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE executive.search_events (
  search_id      uuid PRIMARY KEY,
  scope          text NOT NULL,
  tenant_id      uuid NOT NULL,
  domain_id      uuid NOT NULL,
  principal_id   uuid NOT NULL,
  query          text NOT NULL CHECK (length(query) BETWEEN 2 AND 200),
  context_digest text CHECK (context_digest IS NULL OR context_digest ~ '^[0-9a-f]{64}$'),
  hits           int  NOT NULL CHECK (hits >= 0),
  kinds          jsonb NOT NULL DEFAULT '{}'::jsonb,
  searched_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id uuid NOT NULL,
  CONSTRAINT xse_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX xse_principal ON executive.search_events (tenant_id, domain_id, principal_id, searched_at);
CREATE TRIGGER xse_append_only BEFORE UPDATE OR DELETE ON executive.search_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE executive.search_events IS 'B36 §H (0094): the executive search''s ACCESS LEDGER — who searched what, when, under which context, how many hits per kind; no result bodies; append-only.';

/* THE SEARCH: pg full text ('simple') over rooms, briefings (v1–v3; a BRF@v3 edition only for a reader inside its audience contract),
   packages, commitment items, attention items, warnings and reviews — under the reader's own RLS (never a hit the reader could not open);
   each hit with its lifecycle / gate state and an EXPLANATION: the field that matched, the terms that matched, the hit's as-of, the
   context filter it was read under (a hit linked to the context's objective sorts first). Invoker-bound, STABLE. */
CREATE OR REPLACE FUNCTION executive.search(p_tenant uuid, p_domain uuid, p_principal uuid, p_q text, p_limit int) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = executive, decision, prediction, graph, observation, pg_catalog, pg_temp AS $$
DECLARE v_q text := btrim(coalesce(p_q, '')); v_ts tsquery; v_terms text[]; v_ctx jsonb; v_obj uuid; v_at timestamptz; v_limit int := least(greatest(coalesce(p_limit, 20), 1), 100);
        v_gate_fn boolean := to_regprocedure('decision.gate_state_of(uuid,int)') IS NOT NULL; r record; v_hits jsonb := '[]'::jsonb; v_n int := 0; v_kinds jsonb := '{}'::jsonb; v_gate jsonb; v_matched text[]; v_field text;
BEGIN
  IF length(v_q) NOT BETWEEN 2 AND 200 THEN RAISE EXCEPTION 'search rejected (query): a query is 2–200 characters' USING ERRCODE = '22023'; END IF;
  v_ts := plainto_tsquery('simple', v_q);
  v_terms := ARRAY(SELECT DISTINCT lower(t) FROM regexp_split_to_table(v_q, '\s+') t WHERE length(t) >= 2);
  v_ctx := executive.current_context(p_principal);
  v_obj := (v_ctx ->> 'objective_id')::uuid;
  v_at := coalesce((v_ctx ->> 'effective_at')::timestamptz, clock_timestamp());
  FOR r IN
    WITH hits AS (
      SELECT 'room'::text AS kind, m.room_id AS id, m.title, m.kind AS lifecycle, m.opened_at AS as_of, m.title AS f_title, ''::text AS f_body, NULL::uuid AS package_id, NULL::int AS version,
             ((m.kind = 'objective_review' AND m.subject_id = v_obj) OR (m.package_id IS NOT NULL AND EXISTS (SELECT 1 FROM decision.package_versions v JOIN decision.packages_current p ON p.package_id = v.package_id WHERE v.package_id = m.package_id AND v.version = coalesce(p.current_version, 1) AND v.objectives ? v_obj::text))) AS linked
        FROM executive.rooms_current m WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain
      UNION ALL
      SELECT 'briefing', b.briefing_id, coalesce(left(b.narrative, 120), 'briefing ' || b.schema_version || ' of ' || b.composed_at::date), CASE WHEN b.expires_at IS NOT NULL AND b.expires_at <= v_at THEN 'expired' ELSE 'current' END, b.composed_at,
             coalesce(b.narrative, ''), coalesce(b.items::text, ''), b.package_id, NULL, false
        FROM executive.briefings b WHERE b.tenant_id = p_tenant AND b.domain_id = p_domain
         AND (b.audience IS NULL OR jsonb_typeof(b.audience -> 'roles') <> 'array' OR jsonb_array_length(b.audience -> 'roles') = 0
              OR executive.holds_role(p_principal, p_tenant, p_domain, ARRAY(SELECT jsonb_array_elements_text(b.audience -> 'roles'))))
      UNION ALL
      SELECT 'package', p.package_id, p.title, p.state, p.declared_at, p.title, p.statement, p.package_id, coalesce(p.current_version, 1),
             EXISTS (SELECT 1 FROM decision.package_versions v WHERE v.package_id = p.package_id AND v.version = coalesce(p.current_version, 1) AND v.objectives ? v_obj::text)
        FROM decision.packages_current p WHERE p.tenant_id = p_tenant AND p.domain_id = p_domain
      UNION ALL
      SELECT 'commitment_item', i.item_id, i.title, i.state, i.created_at, i.title, '', i.package_id, NULL, v_obj = ANY (i.objective_ids)
        FROM decision.commitment_items i WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain
      UNION ALL
      SELECT 'attention_item', a.item_id, a.title, a.state, a.created_at, a.title, coalesce(a.details ->> 'detail', a.details ->> 'reason', ''), NULL, NULL, (a.subject_kind = 'strategy_object' AND a.subject_id = v_obj)
        FROM executive.attention_items a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain
      UNION ALL
      SELECT 'warning', w.warning_id, w.title, w.state, w.raised_at, w.title, w.consequence, NULL, NULL, false
        FROM prediction.warnings_current w WHERE w.tenant_id = p_tenant AND w.domain_id = p_domain
      UNION ALL
      SELECT 'review', v.review_id, coalesce(v.subject_title, left(v.question, 120)), v.state, v.convened_at, v.question, coalesce(v.subject_title, ''), NULL, NULL, (v.subject_kind = 'objective' AND v.subject_id = v_obj)
        FROM executive.reviews v WHERE v.tenant_id = p_tenant AND v.domain_id = p_domain)
    SELECT h.*, (to_tsvector('simple', h.f_title) @@ v_ts OR h.f_title ILIKE '%' || v_q || '%') AS title_hit
      FROM hits h
     WHERE h.as_of <= v_at AND (to_tsvector('simple', h.f_title || ' ' || h.f_body) @@ v_ts OR h.f_title ILIKE '%' || v_q || '%' OR h.f_body ILIKE '%' || v_q || '%')
     ORDER BY (v_obj IS NOT NULL AND h.linked) DESC, h.as_of DESC
  LOOP
    v_n := v_n + 1;
    v_kinds := v_kinds || jsonb_build_object(r.kind, coalesce((v_kinds ->> r.kind)::int, 0) + 1);
    IF v_n > v_limit THEN CONTINUE; END IF;
    v_matched := ARRAY(SELECT t FROM unnest(v_terms) t WHERE lower(r.f_title || ' ' || r.f_body) LIKE '%' || t || '%');
    v_field := CASE WHEN r.title_hit THEN 'title' WHEN r.kind = 'package' THEN 'statement' WHEN r.kind = 'briefing' THEN 'narrative/items' WHEN r.kind = 'review' THEN 'question' WHEN r.kind = 'warning' THEN 'consequence' ELSE 'details' END;
    v_gate := NULL;
    IF v_gate_fn AND r.kind = 'package' THEN EXECUTE 'SELECT decision.gate_state_of($1, $2)' INTO v_gate USING r.package_id, r.version; END IF;
    v_hits := v_hits || jsonb_build_object('kind', r.kind, 'id', r.id, 'title', r.title, 'state', r.lifecycle, 'gate', v_gate, 'as_of', r.as_of, 'package_id', r.package_id,
      'explanation', jsonb_build_object('field', v_field, 'terms', to_jsonb(v_matched), 'query', v_q, 'as_of', r.as_of, 'read_at', v_at,
                                        'context_filter', CASE WHEN v_obj IS NULL THEN 'no objective context: every kind of the domain, newest first'
                                                               WHEN r.linked THEN format('linked to the context''s objective %s (shown first)', v_obj)
                                                               ELSE format('outside the context''s objective %s (shown after the linked hits)', v_obj) END,
                                        'context_digest', v_ctx ->> 'digest', 'why', format('%s matched in %s: %s', array_to_string(v_matched, ', '), v_field, CASE WHEN r.title_hit THEN r.f_title ELSE left(r.f_body, 160) END)));
  END LOOP;
  RETURN jsonb_build_object('query', v_q, 'as_of', v_at, 'context', jsonb_build_object('digest', v_ctx ->> 'digest', 'objective_id', v_obj), 'count', v_n, 'kinds', v_kinds, 'hits', v_hits, 'limit', v_limit,
                            'limitations', jsonb_build_array('under the reader''s own scope (RLS) — never a hit the reader could not open', 'a BRF@v3 edition only inside its audience contract', 'full text (simple) and substring on the title and the body; no external index'));
END $$;
GRANT EXECUTE ON FUNCTION executive.search(uuid, uuid, uuid, text, int) TO eye_app, eye_commit;

/* THE PORT that reads and records: the search runs, then ONE ledger row (who, what, when, the context, the hit counts per kind). The
   acting principal is the reader; a search is a governed act (executive.search) so its access is on the ledger. */
CREATE OR REPLACE FUNCTION executive.record_search(p_search_id uuid, p_tenant uuid, p_domain uuid, p_q text, p_limit int, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, prediction, graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.search']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'search rejected (actor): searched by the acting principal' USING ERRCODE = '42501'; END IF;
  v := executive.search(p_tenant, p_domain, p_actor, p_q, p_limit);
  INSERT INTO executive.search_events (search_id, scope, tenant_id, domain_id, principal_id, query, context_digest, hits, kinds, correlation_id)
  VALUES (p_search_id, 'DOMAIN', p_tenant, p_domain, p_actor, v ->> 'query', v #>> ARRAY['context', 'digest'], (v ->> 'count')::int, v -> 'kinds', p_correlation);
  RETURN v || jsonb_build_object('search_id', p_search_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.record_search(uuid,uuid,uuid,text,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.record_search(uuid,uuid,uuid,text,int,uuid,uuid) TO eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §H8 THE EXECUTIVE METRICS (h6): computed on read from the ledgers; nothing stored
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
/* time_to_understanding: an item's first routing (item.routed / escalated / unrouted) → the first human act on it (acknowledged,
   suppressed, delegated, closed, a suppression requested, or an act launched); median and p90 in seconds over the items routed in the
   window that received an act (the ones without one counted). decision_latency: the version's proposal → its commitment, over the
   commitments of the window. review_completion: the governed reviews convened in the window with a due instant — concluded by it — as a
   ratio; the rooms whose deadline fell in the window and were reviewed before it, likewise. Each metric names its population and its as-of. */
CREATE OR REPLACE FUNCTION executive.metrics(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = executive, decision, pg_catalog, pg_temp AS $$
  WITH routed AS (
    SELECT e.item_id, min(e.occurred_at) AS routed_at FROM executive.attention_item_events e
     WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.event IN ('item.routed', 'item.escalated', 'item.unrouted') AND e.occurred_at >= p_from AND e.occurred_at < p_to GROUP BY e.item_id),
  acted AS (
    SELECT r.item_id, r.routed_at,
           least((SELECT min(x.occurred_at) FROM executive.attention_item_events x WHERE x.item_id = r.item_id AND x.occurred_at > r.routed_at AND x.event IN ('item.acknowledged', 'item.suppressed', 'item.delegated', 'item.closed', 'item.suppression_requested')),
                 (SELECT min(a.launched_at) FROM executive.attention_item_acts a WHERE a.item_id = r.item_id AND a.launched_at > r.routed_at)) AS acted_at
      FROM routed r),
  ttu AS (SELECT count(*) AS n_routed, count(acted_at) AS n_acted,
                 percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM acted_at - routed_at)) AS median_s,
                 percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM acted_at - routed_at)) AS p90_s FROM acted),
  lat AS (SELECT count(*) AS n, percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM c.committed_at - v.proposed_at)) AS median_s, percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM c.committed_at - v.proposed_at)) AS p90_s
            FROM decision.commitments c JOIN decision.package_versions v ON v.package_id = c.package_id AND v.version = c.version
           WHERE c.tenant_id = p_tenant AND c.domain_id = p_domain AND c.committed_at >= p_from AND c.committed_at < p_to AND v.proposed_at IS NOT NULL),
  rev AS (SELECT count(*) AS convened, count(*) FILTER (WHERE v.state = 'concluded' AND v.closed_at <= v.due_at) AS within, count(*) FILTER (WHERE v.state = 'convened' AND v.due_at < p_to) AS overdue_open
            FROM executive.reviews v WHERE v.tenant_id = p_tenant AND v.domain_id = p_domain AND v.convened_at >= p_from AND v.convened_at < p_to AND v.due_at IS NOT NULL),
  rms AS (SELECT count(*) AS with_deadline, count(*) FILTER (WHERE m.last_review_at IS NOT NULL AND m.last_review_at <= m.deadline) AS reviewed_before
            FROM executive.rooms_current m WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain AND m.deadline >= p_from AND m.deadline < p_to)
  SELECT jsonb_build_object(
    'as_of', clock_timestamp(), 'window', jsonb_build_object('from', p_from, 'to', p_to),
    'metrics', jsonb_build_array(
      jsonb_build_object('name', 'time_to_understanding', 'unit', 'seconds', 'population', 'attention items first routed in the window (item.routed / item.escalated / item.unrouted)',
                         'n', (SELECT n_routed FROM ttu), 'n_acted', (SELECT n_acted FROM ttu), 'n_without_act', (SELECT n_routed - n_acted FROM ttu),
                         'median', (SELECT round(median_s::numeric, 3) FROM ttu), 'p90', (SELECT round(p90_s::numeric, 3) FROM ttu),
                         'basis', 'the routing event → the first human act on the item (acknowledged, suppressed, delegated, closed, a suppression requested, an act launched); items without an act are counted, not measured', 'as_of', clock_timestamp()),
      jsonb_build_object('name', 'decision_latency', 'unit', 'seconds', 'population', 'commitments recorded in the window whose version was proposed',
                         'n', (SELECT n FROM lat), 'median', (SELECT round(median_s::numeric, 3) FROM lat), 'p90', (SELECT round(p90_s::numeric, 3) FROM lat),
                         'basis', 'the version''s proposal (package_versions.proposed_at) → its commitment (commitments.committed_at)', 'as_of', clock_timestamp()),
      jsonb_build_object('name', 'review_completion', 'unit', 'ratio', 'population', 'governed reviews convened in the window with a due instant; the rooms whose deadline fell in the window',
                         'n', (SELECT convened FROM rev), 'within_deadline', (SELECT within FROM rev), 'overdue_open', (SELECT overdue_open FROM rev),
                         'ratio', (SELECT CASE WHEN convened = 0 THEN NULL ELSE round(within::numeric / convened, 3) END FROM rev),
                         'rooms', jsonb_build_object('with_deadline', (SELECT with_deadline FROM rms), 'reviewed_before_deadline', (SELECT reviewed_before FROM rms),
                                                     'ratio', (SELECT CASE WHEN with_deadline = 0 THEN NULL ELSE round(reviewed_before::numeric / with_deadline, 3) END FROM rms)),
                         'basis', 'a review concluded at or before its due instant counts as completed; a room reviewed (last_review_at) at or before its deadline likewise', 'as_of', clock_timestamp())),
    'stored', false)
$$;
GRANT EXECUTE ON FUNCTION executive.metrics(uuid, uuid, timestamptz, timestamptz) TO eye_app, eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §H9 RLS AND THE GRANTS (the 0081 loop idiom; the ports write)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cadence_events', 'cadence_agenda', 'cadence_escalations', 'search_events'] LOOP
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

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §H2b executive.convene_review RE-DECLARED — 0084 §4 lines 198–281 copied WHOLE, with ONE change (marked /* B36 (0094 §H2) home */):
--      an objective review keeps its separation of duties — the objective's owner is neither its chair nor a reviewer.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- CONVENE: a named human's act around a declared subject of this domain; idempotent on (convener, convene_key) under the request digest.
CREATE OR REPLACE FUNCTION executive.convene_review(
  p_review_id uuid, p_tenant uuid, p_domain uuid, p_subject_kind text, p_subject_id uuid, p_subject_version int, p_question text,
  p_chair uuid, p_reviewers uuid[], p_due_at timestamptz, p_convene_key text, p_request_digest text, p_cause_item uuid, p_room uuid,
  p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, prediction, graph, objects, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r executive.reviews%ROWTYPE; v_current int; v_title text; v_reviewers uuid[]; x uuid; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.review.convene']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'review convening rejected: convened by the acting principal' USING ERRCODE = '42501'; END IF;
  IF NOT executive.holds_role(p_actor, p_tenant, p_domain, executive.review_convening_roles()) THEN
    RAISE EXCEPTION 'review convening rejected: a review is convened by a named human holding %', array_to_string(executive.review_convening_roles(), ', ') USING ERRCODE = '42501';
  END IF;
  IF p_convene_key IS NULL OR length(btrim(p_convene_key)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'review convening rejected: convene_key (1–200 characters) is the convener''s idempotency key for this review' USING ERRCODE = '22023';
  END IF;
  IF p_request_digest IS NULL OR p_request_digest !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'review convening rejected: the request digest is a SHA-256 hex digest' USING ERRCODE = '22023'; END IF;
  -- Exactly once: the same key with the same review returns the review already recorded; a different review under the key is refused.
  SELECT * INTO r FROM executive.reviews v WHERE v.tenant_id = p_tenant AND v.domain_id = p_domain AND v.convened_by = p_actor AND v.convene_key = btrim(p_convene_key) FOR UPDATE;
  IF FOUND THEN
    IF r.request_digest <> p_request_digest THEN
      RAISE EXCEPTION 'review convening rejected: convene key % was already used by this convener for a different review (digest % recorded, % offered); a new review takes a new key', btrim(p_convene_key), left(r.request_digest, 12), left(p_request_digest, 12) USING ERRCODE = '22023';
    END IF;
    PERFORM executive.review_event(r.review_id, p_tenant, p_domain, 'review.repeated', p_actor, jsonb_build_object('offered_review_id', p_review_id), p_correlation);
    RETURN executive.review_answer(r, true);
  END IF;
  IF p_subject_kind IS NULL OR p_subject_kind NOT IN ('objective', 'decision', 'scenario', 'commitment', 'outcome') THEN
    RAISE EXCEPTION 'review convening rejected: the subject is an objective, decision, scenario, commitment or outcome (%)', coalesce(p_subject_kind, '<none>') USING ERRCODE = '22023';
  END IF;
  IF p_question IS NULL OR length(btrim(p_question)) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'review convening rejected: the question the review answers is 8–2000 characters' USING ERRCODE = '22023'; END IF;
  -- The subject: DECLARED in this domain, at the version it stands at now (a named version must be the current one — stale context refused).
  CASE p_subject_kind
    WHEN 'objective' THEN
      SELECT s.object_version::int, s.title INTO v_current, v_title FROM graph.strategy_current s WHERE s.strategy_object_id = p_subject_id AND s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.object_type = 'OBJ';
    WHEN 'decision' THEN
      SELECT p.current_version, p.title INTO v_current, v_title FROM decision.packages_current p WHERE p.package_id = p_subject_id AND p.tenant_id = p_tenant AND p.domain_id = p_domain;
    WHEN 'scenario' THEN
      SELECT (SELECT max(o.object_version)::int FROM objects.canonical_objects o WHERE o.object_id = s.scenario_id AND o.tenant_id = p_tenant AND o.object_type = 'SCN'), s.title INTO v_current, v_title
        FROM prediction.scenarios_current s WHERE s.scenario_id = p_subject_id AND s.tenant_id = p_tenant AND s.domain_id = p_domain;
    WHEN 'commitment' THEN
      SELECT c.version, 'commitment of ' || p.title || ' at version ' || c.version INTO v_current, v_title
        FROM decision.commitments c JOIN decision.packages_current p ON p.package_id = c.package_id WHERE c.commitment_id = p_subject_id AND c.tenant_id = p_tenant AND c.domain_id = p_domain;
    ELSE
      SELECT o.version, 'outcome ' || o.criterion_key || ' of ' || p.title INTO v_current, v_title
        FROM decision.outcomes o JOIN decision.packages_current p ON p.package_id = o.package_id WHERE o.outcome_id = p_subject_id AND o.tenant_id = p_tenant AND o.domain_id = p_domain;
  END CASE;
  IF NOT FOUND THEN RAISE EXCEPTION 'review convening rejected: no such % % in this domain', p_subject_kind, p_subject_id USING ERRCODE = '23503'; END IF;
  IF p_subject_version IS NOT NULL AND v_current IS DISTINCT FROM p_subject_version THEN
    RAISE EXCEPTION 'review convening rejected (stale_version): % % stands at version %, the review names version %', p_subject_kind, p_subject_id, coalesce(v_current::text, 'none'), p_subject_version USING ERRCODE = '22023';
  END IF;
  -- B36 (0094 §H2) home, the ONE change: an OBJECTIVE review keeps its separation of duties — the objective's owner is neither its chair nor a reviewer.
  IF p_subject_kind = 'objective' AND EXISTS (SELECT 1 FROM graph.strategy_current s WHERE s.strategy_object_id = p_subject_id AND s.tenant_id = p_tenant AND s.domain_id = p_domain
                                                  AND (s.owner_principal_id = p_chair OR s.owner_principal_id = ANY (coalesce(p_reviewers, '{}'::uuid[])))) THEN
    RAISE EXCEPTION 'objective review rejected (separation_of_duties): the owner of objective % is neither its review''s chair nor a reviewer; another person reviews it', p_subject_id USING ERRCODE = '42501';
  END IF;
  -- The chair and the reviewers: named, active humans of this tenant (or the platform).
  IF p_chair IS NULL OR NOT EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = p_chair AND p.kind = 'human' AND p.status = 'active' AND (p.tenant_id = p_tenant OR p.scope = 'PLATFORM')) THEN
    RAISE EXCEPTION 'review convening rejected: the chair % is not an active human of this tenant', coalesce(p_chair::text, '<none>') USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(array_agg(DISTINCT u ORDER BY u), '{}') INTO v_reviewers FROM unnest(coalesce(p_reviewers, '{}'::uuid[])) u WHERE u IS DISTINCT FROM p_chair;
  IF cardinality(v_reviewers) > 20 THEN RAISE EXCEPTION 'review convening rejected: at most 20 reviewers beside the chair' USING ERRCODE = '22023'; END IF;
  FOREACH x IN ARRAY v_reviewers LOOP
    IF NOT EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = x AND p.kind = 'human' AND p.status = 'active' AND (p.tenant_id = p_tenant OR p.scope = 'PLATFORM')) THEN
      RAISE EXCEPTION 'review convening rejected: reviewer % is not an active human of this tenant', x USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF p_due_at IS NOT NULL AND (p_due_at <= v_at OR p_due_at > v_at + interval '366 days') THEN
    RAISE EXCEPTION 'review convening rejected: the review is due after now and within a year' USING ERRCODE = '22023';
  END IF;
  IF p_cause_item IS NOT NULL AND NOT EXISTS (SELECT 1 FROM executive.attention_items i WHERE i.item_id = p_cause_item AND i.tenant_id = p_tenant AND i.domain_id = p_domain) THEN
    RAISE EXCEPTION 'review convening rejected: no such attention item % in this domain', p_cause_item USING ERRCODE = '23503';
  END IF;
  IF p_room IS NOT NULL AND NOT EXISTS (SELECT 1 FROM executive.rooms_current m WHERE m.room_id = p_room AND m.tenant_id = p_tenant AND m.domain_id = p_domain) THEN
    RAISE EXCEPTION 'review convening rejected: no such room % in this domain', p_room USING ERRCODE = '23503';
  END IF;
  INSERT INTO executive.reviews (review_id, scope, tenant_id, domain_id, subject_kind, subject_id, subject_version, subject_title, question, chair_principal_id, reviewers, due_at,
                                 convened_by, convene_key, request_digest, cause_item_id, room_id, convened_at, correlation_id)
  VALUES (p_review_id, 'DOMAIN', p_tenant, p_domain, p_subject_kind, p_subject_id, v_current, left(v_title, 512), btrim(p_question), p_chair, v_reviewers, p_due_at,
          p_actor, btrim(p_convene_key), p_request_digest, p_cause_item, p_room, v_at, p_correlation)
  RETURNING * INTO r;
  PERFORM executive.review_event(p_review_id, p_tenant, p_domain, 'review.convened', p_actor,
            jsonb_build_object('subject_kind', p_subject_kind, 'subject_id', p_subject_id, 'subject_version', v_current, 'chair', p_chair, 'reviewers', to_jsonb(v_reviewers), 'due_at', p_due_at,
                               'cause_item_id', p_cause_item, 'room_id', p_room, 'convene_key', btrim(p_convene_key), 'request_digest', p_request_digest), p_correlation);
  RETURN executive.review_answer(r, false);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.convene_review(uuid,uuid,uuid,text,uuid,int,text,uuid,uuid[],timestamptz,text,text,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.convene_review(uuid,uuid,uuid,text,uuid,int,text,uuid,uuid[],timestamptz,text,text,uuid,uuid,uuid,uuid) TO eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §H4b executive.delegate_attention_item RE-DECLARED — 0086 §G lines 1714–1766 copied WHOLE, with ONE change (marked /* B36 (0094 §H4) home */):
--      the executive operator routes an attention item through the existing delegation port (never a new write path).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION executive.delegate_attention_item(p_delegation_id uuid, p_tenant uuid, p_domain uuid, p_item uuid, p_to uuid, p_reason text, p_until timestamptz,
                                                             p_request_key text, p_request_digest text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x executive.attention_items%ROWTYPE; d executive.attention_delegations%ROWTYPE; v_at timestamptz := clock_timestamp(); v_kind text; v_status text; v_key text := btrim(coalesce(p_request_key, ''));
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.item.delegate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'attention delegation rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF length(v_key) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'attention delegation rejected: request_key (1–200 characters) is the delegator''s idempotency key' USING ERRCODE = '22023'; END IF;
  IF p_request_digest IS NULL OR p_request_digest !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'attention delegation rejected: the request digest is a SHA-256 hex digest' USING ERRCODE = '22023'; END IF;
  -- Exactly once: the same key with the same delegation answers the one recorded; a different delegation under the key is refused.
  SELECT * INTO d FROM executive.attention_delegations g WHERE g.tenant_id = p_tenant AND g.domain_id = p_domain AND g.from_principal_id = p_actor AND g.request_key = v_key FOR UPDATE;
  IF FOUND THEN
    IF d.request_digest <> p_request_digest THEN
      RAISE EXCEPTION 'attention delegation rejected: request key % was already used by this principal for a different delegation (digest % recorded, % offered); a new delegation takes a new key',
        v_key, left(d.request_digest, 12), left(p_request_digest, 12) USING ERRCODE = '23505';
    END IF;
    RETURN executive.attention_delegation_answer(d, true);
  END IF;
  SELECT * INTO x FROM executive.attention_items i WHERE i.item_id = p_item AND i.tenant_id = p_tenant AND i.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'attention delegation rejected: no such item in this domain' USING ERRCODE = '23503'; END IF;
  IF NOT ((x.owner_principal_id IS NOT NULL AND x.owner_principal_id = p_actor) OR executive.holds_role(p_actor, p_tenant, p_domain, x.route_roles || ARRAY['domain_admin', 'platform_admin'])
          OR executive.holds_role(p_actor, p_tenant, p_domain, ARRAY['executive_operator']) /* B36 (0094 §H4) home, the ONE change: the executive operator (PER-03) routes work through this port */) THEN
    RAISE EXCEPTION 'attention delegation rejected: item % is routed to % (owner %); the delegator acts on it in their own right (a delegate does not delegate further)',
      p_item, array_to_string(x.route_roles, ', '), coalesce(x.owner_principal_id::text, 'none') USING ERRCODE = '42501';
  END IF;
  IF x.state NOT IN ('open', 'escalated', 'unrouted', 'acknowledged', 'suppressed') THEN
    RAISE EXCEPTION 'attention delegation rejected: item % is %; only a live item is delegated', p_item, x.state USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'attention delegation rejected: a delegation carries a reason of at least 8 characters' USING ERRCODE = '22023'; END IF;
  IF p_to IS NULL OR p_to = p_actor THEN RAISE EXCEPTION 'attention delegation rejected: the delegate is another person than the delegator' USING ERRCODE = '22023'; END IF;
  SELECT p.kind, p.status INTO v_kind, v_status FROM identity.principals p WHERE p.id = p_to AND (p.tenant_id = p_tenant OR p.scope = 'PLATFORM');
  IF NOT FOUND OR v_kind <> 'human' OR v_status <> 'active' THEN
    RAISE EXCEPTION 'attention delegation rejected: the delegate must be an active human principal of this tenant (an agent is never a delegate)' USING ERRCODE = '22023';
  END IF;
  IF NOT executive.holds_role(p_to, p_tenant, p_domain, executive.attention_acknowledgement_roles()) THEN
    RAISE EXCEPTION 'attention delegation rejected: the delegate holds none of the acknowledgement roles in this domain (%)', array_to_string(executive.attention_acknowledgement_roles(), ', ') USING ERRCODE = '22023';
  END IF;
  IF p_until IS NULL OR p_until <= v_at OR p_until > v_at + interval '720 hours' THEN
    RAISE EXCEPTION 'attention delegation rejected: a delegation ends after now and within 720 hours' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM executive.attention_delegations g WHERE g.item_id = p_item AND g.to_principal_id = p_to AND g.state = 'active' AND g.until_at > v_at) THEN
    RAISE EXCEPTION 'attention delegation rejected: item % is already delegated to %; end that delegation first', p_item, p_to USING ERRCODE = '23505';
  END IF;
  INSERT INTO executive.attention_delegations (delegation_id, scope, tenant_id, domain_id, item_id, from_principal_id, to_principal_id, owner_principal_id, reason, from_at, until_at, request_key, request_digest, correlation_id)
  VALUES (p_delegation_id, 'DOMAIN', p_tenant, p_domain, p_item, p_actor, p_to, x.owner_principal_id, btrim(p_reason), v_at, p_until, v_key, p_request_digest, p_correlation)
  RETURNING * INTO d;
  PERFORM executive.attention_event(p_item, p_tenant, p_domain, 'item.delegated', p_actor,
            jsonb_build_object('delegation_id', p_delegation_id, 'from', p_actor, 'to', p_to, 'until', p_until, 'reason', btrim(p_reason), 'owner', x.owner_principal_id,
                               'owner_stays_accountable', true, 'state', x.state, 'request_key', v_key), p_correlation);
  RETURN executive.attention_delegation_answer(d, false);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.delegate_attention_item(uuid,uuid,uuid,uuid,uuid,text,timestamptz,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.delegate_attention_item(uuid,uuid,uuid,uuid,uuid,text,timestamptz,text,text,uuid,uuid) TO eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §H4c executive.reassign_human_task RE-DECLARED — 0090 §W3 lines 5779–5813 copied WHOLE, with ONE change (marked /* B36 (0094 §H4) home */):
--      the executive operator reassigns a human task through the existing port (the refusal text names the operator too).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION executive.reassign_human_task(p_task uuid, p_tenant uuid, p_domain uuid, p_to uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t executive.human_tasks%ROWTYPE; v_roles text[];
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.task.reassign']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'human task rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'human task rejected (reason): a reassignment states its reason (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO t FROM executive.human_tasks x WHERE x.task_id = p_task AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'human task rejected (unknown_task): no task % in this domain', p_task USING ERRCODE = '23503'; END IF;
  IF t.state NOT IN ('open', 'escalated') THEN RAISE EXCEPTION 'human task rejected (closed): task % is %', p_task, t.state USING ERRCODE = '23505'; END IF;
  IF p_actor IS DISTINCT FROM t.assignee_principal_id AND NOT executive.holds_any_role(p_actor, p_tenant, p_domain, ARRAY['executive', 'domain_admin', 'executive_operator' /* B36 (0094 §H4) home, the ONE change: the executive operator (PER-03) routes work through this port */]) THEN
    RAISE EXCEPTION 'human task rejected (not_assignee): a task is reassigned by its assignee, an executive, an executive operator or a domain administrator' USING ERRCODE = '42501';
  END IF;
  IF p_to IS NULL OR NOT decision.is_active_human(p_to, p_tenant) THEN
    RAISE EXCEPTION 'human task rejected (not_member): % is not an active member of this tenant — reassignment moves work to a member', p_to USING ERRCODE = '22023';
  END IF;
  IF p_to = t.assignee_principal_id THEN RAISE EXCEPTION 'human task rejected (unchanged): % already holds task %', p_to, p_task USING ERRCODE = '22023'; END IF;
  IF t.kind LIKE 'gate.%' THEN
    SELECT ARRAY(SELECT jsonb_array_elements_text(coalesce(t.eligibility -> 'roles', '[]'::jsonb))) INTO v_roles;
    IF (cardinality(v_roles) > 0 AND NOT executive.holds_any_role(p_to, p_tenant, p_domain, v_roles))
       OR coalesce(t.eligibility -> 'exclude', '[]'::jsonb) ? p_to::text THEN
      RAISE EXCEPTION 'human task rejected (not_eligible): % does not meet the stored eligibility of the % task (roles %, exclusions) — reassignment moves work, never authority',
        p_to, t.kind, array_to_string(v_roles, ', ') USING ERRCODE = '22023';
    END IF;
  END IF;
  UPDATE executive.human_tasks SET assignee_principal_id = p_to, updated_at = clock_timestamp() WHERE task_id = p_task;
  INSERT INTO executive.human_task_assignments (assignment_id, scope, tenant_id, domain_id, task_id, from_principal, to_principal, reason, actor_principal_id, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_task, t.assignee_principal_id, p_to, 'reassign', p_actor, p_correlation);
  INSERT INTO executive.human_task_events (event_id, scope, tenant_id, domain_id, task_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_task, 'task.reassigned', p_actor, jsonb_build_object('from', t.assignee_principal_id, 'to', p_to, 'reason', btrim(p_reason)), p_correlation);
  RETURN jsonb_build_object('task_id', p_task, 'from', t.assignee_principal_id, 'to', p_to, 'state', t.state, 'deadline_at', t.deadline_at);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.reassign_human_task(uuid, uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.reassign_human_task(uuid, uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- section `planning` (§P) — the part-local file 0094_b36_x_planning.sql, combined here at integration in the apply order every fresh-database run used
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0094 §P — CP-6 B36 part `planning` (2026-09-30): STRATEGIC PLANNING AND INITIATIVE GOVERNANCE (F-P6-10; V8 PR-45-001..006, CAP-EO-07,
-- AT-45, WS-16; V9 UX-45). Built on the §0 prelude (executive.record_signature / signature_of with kind plan_baseline; the attention
-- class plan.variance and the subject kind plan; the package event initiative.cited) and on 0089's Strategy Graph (graph.strategy_current
-- — an INITIATIVE is the 0089 `INI` object: executive.initiatives BINDS to it by id, one object with two views, never a parallel copy;
-- graph.measures — a plan measure is a graph.measures row bound by id, never a copy). Forward-only; nothing earlier is edited.
--
--   §P1  the role planning_agent (proposes only — never funds, approves, baselines), the canonical object PLN (schema PLN@v1) and the two
--        canonical write actions (executive.plan.baseline admits PLN; executive.initiative.approve admits a new INI version)
--   §P2  the tables: executive.plans (a plan for an objective set and a horizon; the budget with its AUTHORITY CEILING and currency),
--        executive.plan_versions (a BASELINE: a signed version — append-only), executive.initiatives (the INI object's planning view:
--        objective linkage, sponsor, owner, budget share, state), executive.initiative_objectives, executive.initiative_transitions
--        (append-only: propose → align → prioritise → fund → approve → baseline → pause → close; the replay reads them), executive.milestones,
--        executive.initiative_dependencies (finish_to_start | shares_resource; a cycle refused), executive.plan_measures (bound to
--        graph.measures), executive.plan_runs (the scenario runs a plan is read against), executive.plan_variances (append-only),
--        executive.plan_breaches, executive.plan_events (append-only); decision.packages_current.initiative_id (the citation)
--   §P3  the plan ports: declare_plan, set_plan_authority (the CONTINUITY rule: a ceiling lowered below the funded sum is a BREACH, never a
--        silent acceptance), review_plan, baseline_plan (the version whose digest the executive signs; PLN admitted by the service)
--   §P4  the initiative transitions UNDER HUMAN AUTHORITY: propose (the strategy lead or the planning agent), align, prioritise (the lead;
--        an unaligned initiative cannot be prioritised), fund (the executive or the decision authority, within the plan's authority —
--        over it `initiative rejected (budget_authority)`), approve (a second named human: never the proposer), pause / close (the sponsor)
--   §P5  milestones, dependencies (a cycle refused), plan measures, plan runs
--   §P6  the breaches: acknowledge_plan_breach (the executive authorizes a commitment while a breach stands), the commitment HOLD (a
--        commitment on a package citing an initiative of a plan with an OPEN breach is refused before the tracker seeds), cite_initiative
--   §P7  the tick step `plan-variance` (order 55): executive.detect_plan_variance — a milestone's measure (the latest observation once the
--        milestone is due) or an attached run's output at the milestone's date vs the target → a variance, ROUTED as an attention item of
--        class plan.variance to the initiative's owner; the five breach kinds opened once per cause and resolved when the cause is gone
--   §P8  the reads: plan_view (the workspace), plan_as_of (the REPLAY), plan_sensitivity (a run's outputs on the plan's measures)
--   §P9  RLS (the 0081 loop idiom) and grants
-- Every refusal is one family `<noun> rejected (<class>): …` (nouns: plan, initiative, milestone, plan dependency, plan measure, plan run,
-- plan breach, plan commitment, initiative citation; classes actor/not_sponsor/separation/not_owner → 403, unknown_* → 404, state/duplicate/
-- breach_open/closed → 409, the rest → 422), mapped in observation-errors.ts inside the `/* B36 planning */` block.
-- Every figure a harness or a scene seeds here is SYNTHETIC.

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §P1 THE ROLE, THE CANONICAL OBJECT PLN, THE WRITE ACTIONS
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
INSERT INTO identity.roles (code, scope, description) VALUES
  ('planning_agent', 'DOMAIN', 'The Planning Agent (B36 §P): drafts and proposes initiatives into a plan — never aligns, prioritises, funds, approves, baselines, pauses or closes one')
ON CONFLICT (code) DO NOTHING;

INSERT INTO observation.canonical_write_actions (action, object_types, rationale) VALUES
  ('executive.plan.baseline', ARRAY['PLN'], 'Baselining a plan admits the signed plan version as a PLN object and nothing else'),
  ('executive.initiative.approve', ARRAY['INI'], 'Approving an initiative admits the next version of its INI object (the planning approval carried in metrics.planning) and nothing else')
ON CONFLICT (action) DO NOTHING;

INSERT INTO objects.schema_registry (object_type, schema_version, json_schema, compatibility) VALUES
('PLN', 'v1', '{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["plan_id","version","title","horizon","objectives","initiatives","milestones","measures","dependencies","budget","baseline_digest","baselined_by"],
  "properties": {
    "plan_id": { "type": "string" },
    "version": { "type": "integer", "minimum": 1 },
    "title": { "type": "string", "minLength": 2, "maxLength": 256 },
    "statement": { "type": ["string","null"] },
    "horizon": { "enum": ["30d","90d","12m","36m"] },
    "classification": { "enum": ["public","internal","confidential","restricted"] },
    "objectives": { "type": "array", "items": { "type": "string" } },
    "initiatives": { "type": "array", "items": { "type": "object" } },
    "milestones": { "type": "array", "items": { "type": "object" } },
    "measures": { "type": "array", "items": { "type": "object" } },
    "dependencies": { "type": "array", "items": { "type": "object" } },
    "budget": { "type": "object" },
    "baseline_digest": { "type": "string", "pattern": "^[0-9a-f]{64}$" },
    "baselined_by": { "type": "string" },
    "baselined_at": { "type": ["string","null"] },
    "note": { "type": ["string","null"] }
  }
}'::jsonb, 'backward')
ON CONFLICT (object_type, schema_version) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §P2 THE TABLES
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE executive.plans (
  plan_id               uuid PRIMARY KEY,
  scope                 text NOT NULL,
  tenant_id             uuid NOT NULL,
  domain_id             uuid NOT NULL,
  title                 text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 256),
  statement             text NOT NULL CHECK (length(btrim(statement)) BETWEEN 2 AND 4096),
  horizon               text NOT NULL CHECK (horizon IN ('30d', '90d', '12m', '36m')),
  /* the objective set: live OBJ objects of graph.strategy_current (at least one) */
  objective_ids         uuid[] NOT NULL CHECK (cardinality(objective_ids) >= 1),
  owner_principal_id    uuid NOT NULL,
  /* money: ISO-4217 text + numeric(18,2), never a float; the AUTHORITY CEILING is what the funded shares may not exceed */
  budget_currency       text NOT NULL CHECK (budget_currency ~ '^[A-Z]{3}$'),
  budget_total          numeric(18,2) NOT NULL CHECK (budget_total >= 0),
  budget_authority      numeric(18,2) NOT NULL CHECK (budget_authority >= 0),
  classification        text NOT NULL DEFAULT 'internal' CHECK (classification IN ('public', 'internal', 'confidential', 'restricted')),
  review_cadence_days   int  NOT NULL DEFAULT 30 CHECK (review_cadence_days BETWEEN 1 AND 366),
  last_reviewed_at      timestamptz,
  state                 text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'baselined', 'closed')),
  current_version       int  NOT NULL DEFAULT 0 CHECK (current_version >= 0),
  digest                text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  declared_by           uuid NOT NULL,
  declared_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at            timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id        uuid NOT NULL,
  CONSTRAINT xpl_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX xpl_domain ON executive.plans (tenant_id, domain_id, state);
COMMENT ON TABLE executive.plans IS 'B36 §P (0094): a plan for an objective set and a horizon, owned by the strategy lead, with its budget (ISO-4217 + numeric(18,2)) and the AUTHORITY CEILING the funded shares may not exceed; baselined as signed versions (executive.plan_versions).';

CREATE TABLE executive.plan_versions (
  version_id      uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  plan_id         uuid NOT NULL REFERENCES executive.plans (plan_id),
  version         int  NOT NULL CHECK (version >= 1),
  /* the baseline: the initiatives, milestones, measures, dependencies and budget AS OF the baseline, and its digest — what the executive signs */
  snapshot        jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  digest          text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  note            text CHECK (note IS NULL OR length(note) <= 2000),
  baselined_by    uuid NOT NULL,
  baselined_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT xpv_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xpv_once UNIQUE (plan_id, version)
);
CREATE TRIGGER xpv_append_only BEFORE UPDATE OR DELETE ON executive.plan_versions FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE executive.initiatives (
  /* THE INI OBJECT ITSELF (0089 §1: graph.strategy_current object_type INI) — one object, two views */
  initiative_id         uuid PRIMARY KEY REFERENCES graph.strategy_current (strategy_object_id),
  scope                 text NOT NULL,
  tenant_id             uuid NOT NULL,
  domain_id             uuid NOT NULL,
  plan_id               uuid NOT NULL REFERENCES executive.plans (plan_id),
  /* the primary objective (a live OBJ); further objectives in executive.initiative_objectives — at least this one is required */
  objective_id          uuid NOT NULL REFERENCES graph.strategy_current (strategy_object_id),
  /* the planning label as proposed (the Strategy Graph's title is the object's own; this is the view's caption, read by Part S's plan links) */
  title                 text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 256),
  sponsor_principal_id  uuid NOT NULL,
  owner_principal_id    uuid NOT NULL,
  budget_share          numeric(18,2) NOT NULL DEFAULT 0 CHECK (budget_share >= 0),
  funded_amount         numeric(18,2) CHECK (funded_amount IS NULL OR funded_amount >= 0),
  priority              int CHECK (priority IS NULL OR priority >= 1),
  state                 text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'aligned', 'prioritised', 'funded', 'approved', 'paused', 'closed')),
  /* the state before a pause (a pause is undone by the sponsor's close only in this batch; kept for the replay) */
  proposed_by           uuid NOT NULL,
  proposed_by_kind      text NOT NULL CHECK (proposed_by_kind IN ('human', 'agent')),
  proposed_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  approved_by           uuid,
  approved_at           timestamptz,
  approved_object_version bigint,
  pause_reason          text,
  close_reason          text,
  version               int NOT NULL DEFAULT 1 CHECK (version >= 1),
  digest                text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  updated_at            timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id        uuid NOT NULL,
  CONSTRAINT xin_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xin_funded CHECK (state NOT IN ('funded', 'approved') OR funded_amount IS NOT NULL),
  CONSTRAINT xin_approved CHECK ((state <> 'approved' AND approved_at IS NULL) OR (approved_by IS NOT NULL AND approved_at IS NOT NULL) OR state IN ('paused', 'closed'))
);
CREATE INDEX xin_plan ON executive.initiatives (plan_id, state);
CREATE INDEX xin_objective ON executive.initiatives (tenant_id, domain_id, objective_id);
COMMENT ON TABLE executive.initiatives IS 'B36 §P (0094): the planning view of an INI strategy object (bound by id to graph.strategy_current — never a parallel copy): its plan, objective linkage, sponsor, owner, budget share, the funded amount and the governed state.';

CREATE TABLE executive.initiative_objectives (
  initiative_id   uuid NOT NULL REFERENCES executive.initiatives (initiative_id),
  objective_id    uuid NOT NULL REFERENCES graph.strategy_current (strategy_object_id),
  linked_by       uuid NOT NULL,
  linked_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (initiative_id, objective_id)
);

CREATE TABLE executive.initiative_transitions (
  transition_id   uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  initiative_id   uuid NOT NULL REFERENCES executive.initiatives (initiative_id),
  transition      text NOT NULL CHECK (transition IN ('propose', 'align', 'prioritise', 'fund', 'approve', 'baseline', 'pause', 'close')),
  from_state      text,
  to_state        text NOT NULL,
  actor_principal_id uuid NOT NULL,
  actor_kind      text NOT NULL CHECK (actor_kind IN ('human', 'agent')),
  reason          text,
  details         jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT xit_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX xit_initiative ON executive.initiative_transitions (initiative_id, occurred_at);
CREATE TRIGGER xit_append_only BEFORE UPDATE OR DELETE ON executive.initiative_transitions FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE executive.milestones (
  milestone_id    uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  plan_id         uuid NOT NULL REFERENCES executive.plans (plan_id),
  initiative_id   uuid NOT NULL REFERENCES executive.initiatives (initiative_id),
  name            text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 256),
  due_date        date NOT NULL,
  /* the measure that proves it (a graph.measures row of this domain) and the value it must reach by the due date */
  measure_id      uuid NOT NULL REFERENCES graph.measures (measure_id),
  target_value    numeric NOT NULL,
  state           text NOT NULL DEFAULT 'planned' CHECK (state IN ('planned', 'at_risk', 'met', 'missed', 'cancelled')),
  declared_by     uuid NOT NULL,
  declared_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT xms_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX xms_initiative ON executive.milestones (initiative_id, due_date);
CREATE INDEX xms_plan ON executive.milestones (plan_id, due_date);

CREATE TABLE executive.initiative_dependencies (
  dependency_id       uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  plan_id             uuid NOT NULL REFERENCES executive.plans (plan_id),
  from_initiative_id  uuid NOT NULL REFERENCES executive.initiatives (initiative_id),
  to_initiative_id    uuid NOT NULL REFERENCES executive.initiatives (initiative_id),
  kind                text NOT NULL CHECK (kind IN ('finish_to_start', 'shares_resource')),
  rationale           text NOT NULL CHECK (length(btrim(rationale)) BETWEEN 8 AND 2000),
  state               text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'retired')),
  declared_by         uuid NOT NULL,
  declared_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  retired_by          uuid,
  retired_at          timestamptz,
  correlation_id      uuid NOT NULL,
  CONSTRAINT xid_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xid_no_self CHECK (from_initiative_id <> to_initiative_id),
  CONSTRAINT xid_retired CHECK ((state = 'retired') = (retired_at IS NOT NULL) AND (retired_at IS NULL) = (retired_by IS NULL))
);
CREATE UNIQUE INDEX xid_one_active ON executive.initiative_dependencies (from_initiative_id, to_initiative_id, kind) WHERE state = 'active';
CREATE INDEX xid_plan ON executive.initiative_dependencies (plan_id, state);

CREATE TABLE executive.plan_measures (
  plan_id         uuid NOT NULL REFERENCES executive.plans (plan_id),
  measure_id      uuid NOT NULL REFERENCES graph.measures (measure_id),
  /* the key by which a scenario run's OUTPUT QUANTITY (simulation.service.ts outputQuantities: a series column or <balance>.closing) maps onto this measure; NULL = not mapped */
  quantity_key    text CHECK (quantity_key IS NULL OR length(btrim(quantity_key)) BETWEEN 1 AND 128),
  bound_by        uuid NOT NULL,
  bound_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (plan_id, measure_id)
);
COMMENT ON TABLE executive.plan_measures IS 'B36 §P (0094): the Strategy Graph measures a plan reads (graph.measures rows bound by id — never a copy), each with the run output key its scenario sensitivity maps.';

CREATE TABLE executive.plan_runs (
  plan_id         uuid NOT NULL REFERENCES executive.plans (plan_id),
  run_id          uuid NOT NULL REFERENCES simulation.runs_current (run_id),
  attached_by     uuid NOT NULL,
  attached_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (plan_id, run_id)
);

CREATE TABLE executive.plan_variances (
  variance_id     uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  plan_id         uuid NOT NULL REFERENCES executive.plans (plan_id),
  initiative_id   uuid NOT NULL REFERENCES executive.initiatives (initiative_id),
  milestone_id    uuid NOT NULL REFERENCES executive.milestones (milestone_id),
  measure_id      uuid NOT NULL REFERENCES graph.measures (measure_id),
  basis_kind      text NOT NULL CHECK (basis_kind IN ('observation', 'run')),
  basis_id        uuid NOT NULL,
  basis_digest    text,
  basis_date      date,
  observed_value  numeric NOT NULL,
  target_value    numeric NOT NULL,
  direction       text NOT NULL CHECK (direction IN ('higher_better', 'lower_better')),
  /* signed toward the direction: negative = adverse (a higher_better measure below target, a lower_better one above it) */
  variance        numeric NOT NULL,
  adverse         boolean NOT NULL,
  owner_principal_id uuid,
  routed_item_id  uuid,
  routing         jsonb NOT NULL DEFAULT '{}'::jsonb,
  raised_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  raised_by       uuid NOT NULL,
  correlation_id  uuid NOT NULL,
  CONSTRAINT xpvr_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xpvr_once UNIQUE (milestone_id, basis_kind, basis_id)
);
CREATE INDEX xpvr_plan ON executive.plan_variances (plan_id, raised_at DESC);
CREATE TRIGGER xpvr_append_only BEFORE UPDATE OR DELETE ON executive.plan_variances FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

CREATE TABLE executive.plan_breaches (
  breach_id        uuid PRIMARY KEY,
  scope            text NOT NULL,
  tenant_id        uuid NOT NULL,
  domain_id        uuid NOT NULL,
  plan_id          uuid NOT NULL REFERENCES executive.plans (plan_id),
  initiative_id    uuid REFERENCES executive.initiatives (initiative_id),
  kind             text NOT NULL CHECK (kind IN ('lost_linkage', 'infeasible', 'budget_over_authority', 'conflicting_dependencies', 'drift_without_review')),
  cause_key        text NOT NULL,
  detail           text NOT NULL,
  /* what is forecast to be impacted: the initiatives, milestones and amounts the breach bears on */
  forecast_impact  jsonb NOT NULL DEFAULT '{}'::jsonb,
  state            text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'acknowledged', 'resolved')),
  opened_by        uuid NOT NULL,
  opened_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  acknowledged_by  uuid,
  acknowledged_at  timestamptz,
  authorization_note text,
  resolved_at      timestamptz,
  resolved_by      uuid,
  resolution       text,
  correlation_id   uuid NOT NULL,
  CONSTRAINT xpb_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xpb_ack CHECK ((acknowledged_at IS NULL) = (acknowledged_by IS NULL) AND (acknowledged_at IS NULL) = (authorization_note IS NULL)),
  CONSTRAINT xpb_resolved CHECK ((state = 'resolved') = (resolved_at IS NOT NULL) AND (resolved_at IS NULL) = (resolved_by IS NULL))
);
CREATE UNIQUE INDEX xpb_one_open ON executive.plan_breaches (plan_id, kind, cause_key) WHERE state <> 'resolved';
CREATE INDEX xpb_plan ON executive.plan_breaches (plan_id, state);

CREATE TABLE executive.plan_events (
  event_id        uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  plan_id         uuid NOT NULL REFERENCES executive.plans (plan_id),
  subject_kind    text NOT NULL CHECK (subject_kind IN ('plan', 'version', 'initiative', 'milestone', 'dependency', 'measure', 'run', 'variance', 'breach', 'citation')),
  subject_id      uuid NOT NULL,
  event           text NOT NULL CHECK (event IN (
    'plan.declared', 'plan.authority_set', 'plan.reviewed', 'plan.baselined', 'plan.closed',
    'initiative.proposed', 'initiative.aligned', 'initiative.prioritised', 'initiative.funded', 'initiative.approved', 'initiative.paused', 'initiative.closed',
    'milestone.set', 'milestone.state_changed', 'dependency.declared', 'dependency.retired', 'measure.bound', 'run.attached',
    'variance.raised', 'breach.opened', 'breach.acknowledged', 'breach.resolved', 'initiative.cited')),
  actor_principal_id uuid NOT NULL,
  details         jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT xpe_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX xpe_plan ON executive.plan_events (plan_id, occurred_at);
CREATE TRIGGER xpe_append_only BEFORE UPDATE OR DELETE ON executive.plan_events FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

/* The citation: a decision package that cites an initiative (feature-detected by the commitment hold and the seed; NULL = no citation). */
ALTER TABLE decision.packages_current ADD COLUMN initiative_id uuid REFERENCES executive.initiatives (initiative_id);
CREATE INDEX dpk_initiative ON decision.packages_current (initiative_id) WHERE initiative_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- the internal helpers (never granted; called by the ports of this section only)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION executive._plan_event(p_plan uuid, p_tenant uuid, p_domain uuid, p_subject_kind text, p_subject uuid, p_event text, p_actor uuid, p_details jsonb, p_correlation uuid) RETURNS uuid
SECURITY DEFINER SET search_path = executive, pg_catalog, pg_temp AS $$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO executive.plan_events (event_id, scope, tenant_id, domain_id, plan_id, subject_kind, subject_id, event, actor_principal_id, details, correlation_id)
  VALUES (v_id, 'DOMAIN', p_tenant, p_domain, p_plan, p_subject_kind, p_subject, p_event, p_actor, coalesce(p_details, '{}'::jsonb), p_correlation);
  RETURN v_id;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive._plan_event(uuid, uuid, uuid, text, uuid, text, uuid, jsonb, uuid) FROM PUBLIC;

/* The plan row, locked for the caller's write; refuses an unknown plan (404) and a closed one (409) when p_open is set. */
CREATE OR REPLACE FUNCTION executive._plan_locked(p_plan uuid, p_tenant uuid, p_domain uuid, p_open boolean) RETURNS executive.plans
SECURITY DEFINER SET search_path = executive, pg_catalog, pg_temp AS $$
DECLARE pl executive.plans%ROWTYPE;
BEGIN
  SELECT * INTO pl FROM executive.plans p WHERE p.plan_id = p_plan AND p.tenant_id = p_tenant AND p.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan rejected (unknown_plan): % is not a plan of this domain', p_plan USING ERRCODE = '23503'; END IF;
  IF p_open AND pl.state = 'closed' THEN RAISE EXCEPTION 'plan rejected (closed): plan "%" is closed', pl.title USING ERRCODE = '22023'; END IF;
  RETURN pl;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive._plan_locked(uuid, uuid, uuid, boolean) FROM PUBLIC;

/* The initiative row locked, with its plan locked first (one lock order everywhere: plan → initiative). */
CREATE OR REPLACE FUNCTION executive._initiative_locked(p_initiative uuid, p_tenant uuid, p_domain uuid) RETURNS executive.initiatives
SECURITY DEFINER SET search_path = executive, pg_catalog, pg_temp AS $$
DECLARE i executive.initiatives%ROWTYPE; v_plan uuid;
BEGIN
  SELECT plan_id INTO v_plan FROM executive.initiatives x WHERE x.initiative_id = p_initiative AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'initiative rejected (unknown_initiative): % is not an initiative of a plan of this domain', p_initiative USING ERRCODE = '23503'; END IF;
  PERFORM 1 FROM executive.plans p WHERE p.plan_id = v_plan FOR UPDATE;
  SELECT * INTO i FROM executive.initiatives x WHERE x.initiative_id = p_initiative FOR UPDATE;
  RETURN i;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive._initiative_locked(uuid, uuid, uuid) FROM PUBLIC;

/* A live OBJ of this domain. */
CREATE OR REPLACE FUNCTION executive._objective_live(p_objective uuid, p_tenant uuid, p_domain uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = graph, pg_catalog, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM graph.strategy_current s WHERE s.strategy_object_id = p_objective AND s.tenant_id = p_tenant AND s.domain_id = p_domain AND s.object_type = 'OBJ' AND s.status = 'active')
$$;
REVOKE ALL ON FUNCTION executive._objective_live(uuid, uuid, uuid) FROM PUBLIC;

/* The digest of an initiative's planning view (the version the approver reads). */
CREATE OR REPLACE FUNCTION executive._initiative_digest(i executive.initiatives) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public, pg_catalog AS $$
  SELECT encode(digest(concat_ws('|', i.initiative_id::text, i.plan_id::text, i.objective_id::text, i.title, i.sponsor_principal_id::text, i.owner_principal_id::text,
                                       i.budget_share::text, coalesce(i.funded_amount::text, ''), coalesce(i.priority::text, ''), i.state, i.version::text), 'sha256'), 'hex')
$$;
REVOKE ALL ON FUNCTION executive._initiative_digest(executive.initiatives) FROM PUBLIC;

/* The funded sum of a plan's live initiatives (funded or approved; a paused or closed one no longer draws on the authority). */
CREATE OR REPLACE FUNCTION executive._funded_sum(p_plan uuid) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = executive, pg_catalog, pg_temp AS $$
  SELECT coalesce(sum(i.funded_amount), 0)::numeric(18,2) FROM executive.initiatives i WHERE i.plan_id = p_plan AND i.state IN ('funded', 'approved')
$$;
REVOKE ALL ON FUNCTION executive._funded_sum(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive._funded_sum(uuid) TO eye_app, eye_commit;  -- the invoker reads (plan_view, plan_as_of) sum it under the caller

/* Open a breach once per (plan, kind, cause); answers the breach id (the existing one when already open). */
CREATE OR REPLACE FUNCTION executive._open_breach(p_plan uuid, p_tenant uuid, p_domain uuid, p_initiative uuid, p_kind text, p_cause text, p_detail text, p_impact jsonb, p_actor uuid, p_correlation uuid)
RETURNS uuid
SECURITY DEFINER SET search_path = executive, pg_catalog, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  SELECT breach_id INTO v_id FROM executive.plan_breaches b WHERE b.plan_id = p_plan AND b.kind = p_kind AND b.cause_key = p_cause AND b.state <> 'resolved';
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  v_id := gen_random_uuid();
  INSERT INTO executive.plan_breaches (breach_id, scope, tenant_id, domain_id, plan_id, initiative_id, kind, cause_key, detail, forecast_impact, opened_by, correlation_id)
  VALUES (v_id, 'DOMAIN', p_tenant, p_domain, p_plan, p_initiative, p_kind, p_cause, p_detail, coalesce(p_impact, '{}'::jsonb), p_actor, p_correlation);
  PERFORM executive._plan_event(p_plan, p_tenant, p_domain, 'breach', v_id, 'breach.opened', p_actor,
                                jsonb_build_object('kind', p_kind, 'cause_key', p_cause, 'initiative_id', p_initiative, 'detail', p_detail, 'forecast_impact', p_impact), p_correlation);
  RETURN v_id;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive._open_breach(uuid, uuid, uuid, uuid, text, text, text, jsonb, uuid, uuid) FROM PUBLIC;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §P3 THE PLAN PORTS
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION executive.declare_plan(
  p_plan uuid, p_tenant uuid, p_domain uuid, p_title text, p_statement text, p_horizon text, p_objectives uuid[], p_currency text, p_budget_total numeric,
  p_budget_authority numeric, p_classification text, p_review_cadence_days int, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, graph, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE o uuid; v_digest text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.plan.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'plan rejected (actor): declared by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_objectives IS NULL OR cardinality(p_objectives) = 0 THEN RAISE EXCEPTION 'plan rejected (objectives): a plan is for at least one objective' USING ERRCODE = '22023'; END IF;
  FOREACH o IN ARRAY p_objectives LOOP
    IF NOT executive._objective_live(o, p_tenant, p_domain) THEN RAISE EXCEPTION 'plan rejected (unknown_objective): % is not a live objective (OBJ) of this domain', o USING ERRCODE = '23503'; END IF;
  END LOOP;
  IF p_horizon IS NULL OR p_horizon NOT IN ('30d', '90d', '12m', '36m') THEN RAISE EXCEPTION 'plan rejected (horizon): the horizon is one of 30d, 90d, 12m, 36m' USING ERRCODE = '22023'; END IF;
  IF p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'plan rejected (currency): the currency is an ISO-4217 code' USING ERRCODE = '22023'; END IF;
  IF p_budget_total IS NULL OR p_budget_total < 0 OR p_budget_authority IS NULL OR p_budget_authority < 0 THEN RAISE EXCEPTION 'plan rejected (budget): the budget and its authority ceiling are amounts >= 0' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM executive.plans p WHERE p.plan_id = p_plan) THEN RAISE EXCEPTION 'plan rejected (duplicate): % is already a plan', p_plan USING ERRCODE = '22023'; END IF;
  v_digest := encode(digest(concat_ws('|', p_plan::text, p_title, p_horizon, array_to_string(p_objectives, ','), p_currency, p_budget_total::numeric(18,2)::text, p_budget_authority::numeric(18,2)::text, '0'), 'sha256'), 'hex');
  INSERT INTO executive.plans (plan_id, scope, tenant_id, domain_id, title, statement, horizon, objective_ids, owner_principal_id, budget_currency, budget_total, budget_authority, classification,
                               review_cadence_days, digest, declared_by, correlation_id)
  VALUES (p_plan, 'DOMAIN', p_tenant, p_domain, btrim(p_title), btrim(p_statement), p_horizon, p_objectives, p_actor, p_currency, p_budget_total, p_budget_authority,
          coalesce(p_classification, 'internal'), coalesce(p_review_cadence_days, 30), v_digest, p_actor, p_correlation);
  PERFORM executive._plan_event(p_plan, p_tenant, p_domain, 'plan', p_plan, 'plan.declared', p_actor,
                                jsonb_build_object('title', p_title, 'horizon', p_horizon, 'objectives', to_jsonb(p_objectives), 'currency', p_currency, 'budget_total', p_budget_total, 'budget_authority', p_budget_authority), p_correlation);
  RETURN (SELECT to_jsonb(p) - 'scope' FROM executive.plans p WHERE p.plan_id = p_plan);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.declare_plan(uuid,uuid,uuid,text,text,text,uuid[],text,numeric,numeric,text,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.declare_plan(uuid,uuid,uuid,text,text,text,uuid[],text,numeric,numeric,text,int,uuid,uuid) TO eye_commit;

/* THE AUTHORITY CEILING and its CONTINUITY: lowering it below the funded sum is recorded as a budget_over_authority BREACH (with what is
   forecast to be impacted), never silently accepted and never refused — the executive's decision stands, and its consequence is shown. */
CREATE OR REPLACE FUNCTION executive.set_plan_authority(p_plan uuid, p_tenant uuid, p_domain uuid, p_authority numeric, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, graph, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE pl executive.plans%ROWTYPE; v_funded numeric; v_breach uuid; v_prior numeric;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.plan.authority.set']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'plan rejected (actor): the authority is set by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_authority IS NULL OR p_authority < 0 THEN RAISE EXCEPTION 'plan rejected (budget): the authority ceiling is an amount >= 0' USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'plan rejected (reason): a change of authority says why (8 characters or more)' USING ERRCODE = '22023'; END IF;
  pl := executive._plan_locked(p_plan, p_tenant, p_domain, true);
  v_prior := pl.budget_authority;
  UPDATE executive.plans SET budget_authority = p_authority, updated_at = clock_timestamp(),
         digest = encode(digest(concat_ws('|', plan_id::text, title, horizon, array_to_string(objective_ids, ','), budget_currency, budget_total::text, p_authority::numeric(18,2)::text, current_version::text), 'sha256'), 'hex')
   WHERE plan_id = p_plan;
  PERFORM executive._plan_event(p_plan, p_tenant, p_domain, 'plan', p_plan, 'plan.authority_set', p_actor, jsonb_build_object('from', v_prior, 'to', p_authority, 'reason', p_reason), p_correlation);
  v_funded := executive._funded_sum(p_plan);
  IF v_funded > p_authority THEN
    v_breach := executive._open_breach(p_plan, p_tenant, p_domain, NULL, 'budget_over_authority', format('funded %s > authority %s', v_funded::text, p_authority::numeric(18,2)::text),
      format('the funded shares of plan "%s" sum to %s %s, above the authority ceiling of %s %s set at %s (%s)', pl.title, v_funded::text, pl.budget_currency, p_authority::numeric(18,2)::text, pl.budget_currency, clock_timestamp(), p_reason),
      jsonb_build_object('funded', v_funded, 'authority', p_authority, 'over_by', (v_funded - p_authority), 'currency', pl.budget_currency,
                         'initiatives', (SELECT coalesce(jsonb_agg(jsonb_build_object('initiative_id', i.initiative_id, 'title', i.title, 'funded_amount', i.funded_amount, 'state', i.state) ORDER BY i.priority NULLS LAST, i.proposed_at), '[]'::jsonb)
                                           FROM executive.initiatives i WHERE i.plan_id = p_plan AND i.state IN ('funded', 'approved')),
                         'milestones', (SELECT coalesce(jsonb_agg(jsonb_build_object('milestone_id', m.milestone_id, 'name', m.name, 'due_date', m.due_date, 'initiative_id', m.initiative_id) ORDER BY m.due_date), '[]'::jsonb)
                                          FROM executive.milestones m JOIN executive.initiatives i ON i.initiative_id = m.initiative_id WHERE m.plan_id = p_plan AND i.state IN ('funded', 'approved') AND m.state NOT IN ('met', 'cancelled'))),
      p_actor, p_correlation);
  END IF;
  RETURN jsonb_build_object('plan_id', p_plan, 'budget_authority', p_authority, 'prior_authority', v_prior, 'funded', v_funded, 'currency', pl.budget_currency,
                            'breach_id', v_breach, 'continuity', CASE WHEN v_breach IS NULL THEN 'within authority' ELSE 'breach: the funded sum exceeds the new ceiling' END);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.set_plan_authority(uuid,uuid,uuid,numeric,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.set_plan_authority(uuid,uuid,uuid,numeric,text,uuid,uuid) TO eye_commit;

/* A review of the plan by the strategy lead or the executive: the drift window restarts; an open drift breach resolves. */
CREATE OR REPLACE FUNCTION executive.review_plan(p_plan uuid, p_tenant uuid, p_domain uuid, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, graph, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE pl executive.plans%ROWTYPE; v_now timestamptz := clock_timestamp(); v_resolved int := 0;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.plan.review']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'plan rejected (actor): reviewed by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_note IS NULL OR length(btrim(p_note)) < 8 THEN RAISE EXCEPTION 'plan rejected (note): a review records what was reviewed (8 characters or more)' USING ERRCODE = '22023'; END IF;
  pl := executive._plan_locked(p_plan, p_tenant, p_domain, true);
  UPDATE executive.plans SET last_reviewed_at = v_now, updated_at = v_now WHERE plan_id = p_plan;
  PERFORM executive._plan_event(p_plan, p_tenant, p_domain, 'plan', p_plan, 'plan.reviewed', p_actor, jsonb_build_object('note', p_note, 'reviewed_at', v_now), p_correlation);
  WITH r AS (UPDATE executive.plan_breaches SET state = 'resolved', resolved_at = v_now, resolved_by = p_actor, resolution = format('reviewed at %s: %s', v_now, p_note)
              WHERE plan_id = p_plan AND kind = 'drift_without_review' AND state <> 'resolved' RETURNING breach_id)
  SELECT count(*) INTO v_resolved FROM r;
  RETURN jsonb_build_object('plan_id', p_plan, 'reviewed_at', v_now, 'drift_breaches_resolved', v_resolved);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.review_plan(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.review_plan(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

/* THE BASELINE: a signed version. The port writes the version (the initiatives, milestones, measures, dependencies and budget as of now,
   and the digest the executive signs); the service then records the signature (§0 record_signature, kind plan_baseline, under this same
   action) and admits the PLN object. At least one initiative must be APPROVED — a plan of proposals is not a baseline. */
CREATE OR REPLACE FUNCTION executive.baseline_plan(p_version uuid, p_plan uuid, p_tenant uuid, p_domain uuid, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, graph, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE pl executive.plans%ROWTYPE; v_version int; v_snapshot jsonb; v_digest text; v_now timestamptz := clock_timestamp(); i record;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.plan.baseline']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'plan baseline rejected (actor): baselined by the acting principal' USING ERRCODE = '42501'; END IF;
  pl := executive._plan_locked(p_plan, p_tenant, p_domain, true);
  IF NOT EXISTS (SELECT 1 FROM executive.initiatives x WHERE x.plan_id = p_plan AND x.state = 'approved') THEN
    RAISE EXCEPTION 'plan baseline rejected (state): plan "%" has no approved initiative — a baseline binds approved initiatives', pl.title USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM executive.plan_breaches b WHERE b.plan_id = p_plan AND b.state = 'open') THEN
    RAISE EXCEPTION 'plan baseline rejected (breach_open): plan "%" has an open breach; acknowledge or resolve it before a baseline', pl.title USING ERRCODE = '22023';
  END IF;
  v_version := pl.current_version + 1;
  v_snapshot := jsonb_build_object(
    'plan_id', p_plan, 'version', v_version, 'title', pl.title, 'statement', pl.statement, 'horizon', pl.horizon, 'classification', pl.classification,
    'objectives', to_jsonb(pl.objective_ids),
    'initiatives', (SELECT coalesce(jsonb_agg(jsonb_build_object('initiative_id', x.initiative_id, 'title', x.title, 'objective_id', x.objective_id, 'state', x.state, 'sponsor', x.sponsor_principal_id, 'owner', x.owner_principal_id,
                                                                 'budget_share', x.budget_share, 'funded_amount', x.funded_amount, 'priority', x.priority, 'version', x.version, 'digest', x.digest,
                                                                 'objectives', (SELECT coalesce(jsonb_agg(io.objective_id ORDER BY io.objective_id), '[]'::jsonb) FROM executive.initiative_objectives io WHERE io.initiative_id = x.initiative_id))
                                              ORDER BY x.priority NULLS LAST, x.proposed_at), '[]'::jsonb)
                      FROM executive.initiatives x WHERE x.plan_id = p_plan AND x.state <> 'closed'),
    'milestones', (SELECT coalesce(jsonb_agg(jsonb_build_object('milestone_id', m.milestone_id, 'initiative_id', m.initiative_id, 'name', m.name, 'due_date', m.due_date, 'measure_id', m.measure_id, 'target_value', m.target_value, 'state', m.state) ORDER BY m.due_date, m.name), '[]'::jsonb)
                     FROM executive.milestones m WHERE m.plan_id = p_plan AND m.state <> 'cancelled'),
    'measures', (SELECT coalesce(jsonb_agg(jsonb_build_object('measure_id', pm.measure_id, 'quantity_key', pm.quantity_key, 'definition_version', g.definition_version, 'definition_digest', g.definition_digest, 'target_value', g.target_value, 'target_date', g.target_date, 'unit', g.unit, 'direction', g.direction) ORDER BY pm.measure_id), '[]'::jsonb)
                   FROM executive.plan_measures pm JOIN graph.measures g ON g.measure_id = pm.measure_id WHERE pm.plan_id = p_plan),
    'dependencies', (SELECT coalesce(jsonb_agg(jsonb_build_object('dependency_id', d.dependency_id, 'from', d.from_initiative_id, 'to', d.to_initiative_id, 'kind', d.kind) ORDER BY d.declared_at), '[]'::jsonb)
                       FROM executive.initiative_dependencies d WHERE d.plan_id = p_plan AND d.state = 'active'),
    'budget', jsonb_build_object('currency', pl.budget_currency, 'total', pl.budget_total, 'authority', pl.budget_authority, 'funded', executive._funded_sum(p_plan)),
    'baselined_by', p_actor::text, 'baselined_at', v_now, 'note', p_note);
  v_digest := encode(digest(v_snapshot::text, 'sha256'), 'hex');
  v_snapshot := v_snapshot || jsonb_build_object('baseline_digest', v_digest);
  INSERT INTO executive.plan_versions (version_id, scope, tenant_id, domain_id, plan_id, version, snapshot, digest, note, baselined_by, baselined_at, correlation_id)
  VALUES (p_version, 'DOMAIN', p_tenant, p_domain, p_plan, v_version, v_snapshot, v_digest, p_note, p_actor, v_now, p_correlation);
  UPDATE executive.plans SET state = 'baselined', current_version = v_version, last_reviewed_at = coalesce(last_reviewed_at, v_now), updated_at = v_now,
         digest = encode(digest(concat_ws('|', plan_id::text, title, horizon, array_to_string(objective_ids, ','), budget_currency, budget_total::text, budget_authority::text, v_version::text), 'sha256'), 'hex')
   WHERE plan_id = p_plan;
  FOR i IN SELECT x.initiative_id, x.state FROM executive.initiatives x WHERE x.plan_id = p_plan AND x.state = 'approved' LOOP
    INSERT INTO executive.initiative_transitions (transition_id, scope, tenant_id, domain_id, initiative_id, transition, from_state, to_state, actor_principal_id, actor_kind, reason, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, i.initiative_id, 'baseline', i.state, i.state, p_actor, 'human', p_note, jsonb_build_object('plan_version', v_version, 'version_id', p_version, 'digest', v_digest), p_correlation);
  END LOOP;
  PERFORM executive._plan_event(p_plan, p_tenant, p_domain, 'version', p_version, 'plan.baselined', p_actor, jsonb_build_object('version', v_version, 'digest', v_digest, 'note', p_note), p_correlation);
  RETURN jsonb_build_object('version_id', p_version, 'plan_id', p_plan, 'version', v_version, 'digest', v_digest, 'baselined_at', v_now, 'snapshot', v_snapshot);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.baseline_plan(uuid,uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.baseline_plan(uuid,uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §P4 THE INITIATIVE TRANSITIONS UNDER HUMAN AUTHORITY
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
/* PROPOSE: the strategy lead or the Planning Agent (PDP: no human gate on this one act; the port records the proposer's kind). The
   initiative IS the INI object of the Strategy Graph; it must be active and not yet in a plan; the objective a live OBJ; sponsor and owner
   active humans. */
CREATE OR REPLACE FUNCTION executive.propose_initiative(
  p_initiative uuid, p_tenant uuid, p_domain uuid, p_plan uuid, p_objective uuid, p_sponsor uuid, p_owner uuid, p_budget_share numeric, p_rationale text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, graph, decision, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE pl executive.plans%ROWTYPE; s graph.strategy_current%ROWTYPE; v_kind text; i executive.initiatives%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.initiative.propose']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'initiative rejected (actor): proposed by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT p.kind INTO v_kind FROM identity.principals p WHERE p.id = p_actor;
  pl := executive._plan_locked(p_plan, p_tenant, p_domain, true);
  SELECT * INTO s FROM graph.strategy_current x WHERE x.strategy_object_id = p_initiative AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND OR s.object_type <> 'INI' THEN RAISE EXCEPTION 'initiative rejected (unknown_initiative): % is not an initiative (INI) of the Strategy Graph of this domain', p_initiative USING ERRCODE = '23503'; END IF;
  IF s.status <> 'active' THEN RAISE EXCEPTION 'initiative rejected (state): initiative "%" is % in the Strategy Graph', s.title, s.status USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM executive.initiatives x WHERE x.initiative_id = p_initiative) THEN RAISE EXCEPTION 'initiative rejected (duplicate): initiative "%" is already proposed into a plan', s.title USING ERRCODE = '22023'; END IF;
  IF NOT executive._objective_live(p_objective, p_tenant, p_domain) THEN RAISE EXCEPTION 'initiative rejected (unknown_objective): % is not a live objective (OBJ) of this domain', p_objective USING ERRCODE = '23503'; END IF;
  IF NOT (p_objective = ANY (pl.objective_ids)) THEN RAISE EXCEPTION 'initiative rejected (objectives): objective % is not in the objective set of plan "%"', p_objective, pl.title USING ERRCODE = '22023'; END IF;
  IF p_sponsor IS NULL OR NOT decision.is_active_human(p_sponsor, p_tenant) THEN RAISE EXCEPTION 'initiative rejected (sponsor): the sponsor is an active human principal of this tenant' USING ERRCODE = '22023'; END IF;
  IF p_owner IS NULL OR NOT decision.is_active_human(p_owner, p_tenant) THEN RAISE EXCEPTION 'initiative rejected (owner): the owner is an active human principal of this tenant' USING ERRCODE = '22023'; END IF;
  IF p_budget_share IS NULL OR p_budget_share < 0 THEN RAISE EXCEPTION 'initiative rejected (budget): the budget share is an amount >= 0' USING ERRCODE = '22023'; END IF;
  IF p_rationale IS NULL OR length(btrim(p_rationale)) < 8 THEN RAISE EXCEPTION 'initiative rejected (reason): a proposal says why (8 characters or more)' USING ERRCODE = '22023'; END IF;
  INSERT INTO executive.initiatives (initiative_id, scope, tenant_id, domain_id, plan_id, objective_id, title, sponsor_principal_id, owner_principal_id, budget_share, proposed_by, proposed_by_kind, digest, correlation_id)
  VALUES (p_initiative, 'DOMAIN', p_tenant, p_domain, p_plan, p_objective, s.title, p_sponsor, p_owner, p_budget_share, p_actor, CASE WHEN v_kind = 'agent' THEN 'agent' ELSE 'human' END, repeat('0', 64), p_correlation);
  INSERT INTO executive.initiative_objectives (initiative_id, objective_id, linked_by) VALUES (p_initiative, p_objective, p_actor);
  SELECT * INTO i FROM executive.initiatives x WHERE x.initiative_id = p_initiative;
  UPDATE executive.initiatives SET digest = executive._initiative_digest(i) WHERE initiative_id = p_initiative;
  INSERT INTO executive.initiative_transitions (transition_id, scope, tenant_id, domain_id, initiative_id, transition, from_state, to_state, actor_principal_id, actor_kind, reason, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_initiative, 'propose', NULL, 'proposed', p_actor, CASE WHEN v_kind = 'agent' THEN 'agent' ELSE 'human' END, p_rationale,
          jsonb_build_object('plan_id', p_plan, 'objective_id', p_objective, 'sponsor', p_sponsor, 'owner', p_owner, 'budget_share', p_budget_share), p_correlation);
  PERFORM executive._plan_event(p_plan, p_tenant, p_domain, 'initiative', p_initiative, 'initiative.proposed', p_actor, jsonb_build_object('title', s.title, 'objective_id', p_objective, 'proposed_by_kind', CASE WHEN v_kind = 'agent' THEN 'agent' ELSE 'human' END), p_correlation);
  RETURN (SELECT to_jsonb(x) - 'scope' FROM executive.initiatives x WHERE x.initiative_id = p_initiative);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.propose_initiative(uuid,uuid,uuid,uuid,uuid,uuid,uuid,numeric,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.propose_initiative(uuid,uuid,uuid,uuid,uuid,uuid,uuid,numeric,text,uuid,uuid) TO eye_commit;

/* The transition record (internal). */
CREATE OR REPLACE FUNCTION executive._transition(i executive.initiatives, p_transition text, p_to text, p_actor uuid, p_reason text, p_details jsonb, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, pg_catalog, pg_temp AS $$
DECLARE v_id uuid := gen_random_uuid(); x executive.initiatives%ROWTYPE;
BEGIN
  INSERT INTO executive.initiative_transitions (transition_id, scope, tenant_id, domain_id, initiative_id, transition, from_state, to_state, actor_principal_id, actor_kind, reason, details, correlation_id)
  VALUES (v_id, 'DOMAIN', i.tenant_id, i.domain_id, i.initiative_id, p_transition, i.state, p_to, p_actor, 'human', p_reason, coalesce(p_details, '{}'::jsonb), p_correlation);
  SELECT * INTO x FROM executive.initiatives y WHERE y.initiative_id = i.initiative_id;
  UPDATE executive.initiatives SET digest = executive._initiative_digest(x) WHERE initiative_id = i.initiative_id;
  PERFORM executive._plan_event(i.plan_id, i.tenant_id, i.domain_id, 'initiative', i.initiative_id, 'initiative.' || CASE p_transition WHEN 'propose' THEN 'proposed' WHEN 'align' THEN 'aligned' WHEN 'prioritise' THEN 'prioritised' WHEN 'fund' THEN 'funded' WHEN 'approve' THEN 'approved' WHEN 'pause' THEN 'paused' ELSE 'closed' END,
                                p_actor, jsonb_build_object('from', i.state, 'to', p_to, 'reason', p_reason) || coalesce(p_details, '{}'::jsonb), p_correlation);
  RETURN (SELECT to_jsonb(y) - 'scope' || jsonb_build_object('transition_id', v_id) FROM executive.initiatives y WHERE y.initiative_id = i.initiative_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive._transition(executive.initiatives, text, text, uuid, text, jsonb, uuid) FROM PUBLIC;

/* ALIGN: the strategy lead links the objectives (each a live OBJ of the plan's set; the primary kept); proposed → aligned. */
CREATE OR REPLACE FUNCTION executive.align_initiative(p_initiative uuid, p_tenant uuid, p_domain uuid, p_objectives uuid[], p_rationale text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, graph, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i executive.initiatives%ROWTYPE; pl executive.plans%ROWTYPE; o uuid; v_objs uuid[];
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.initiative.align']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'initiative rejected (actor): aligned by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_rationale IS NULL OR length(btrim(p_rationale)) < 8 THEN RAISE EXCEPTION 'initiative rejected (reason): an alignment says why (8 characters or more)' USING ERRCODE = '22023'; END IF;
  i := executive._initiative_locked(p_initiative, p_tenant, p_domain);
  SELECT * INTO pl FROM executive.plans p WHERE p.plan_id = i.plan_id;
  IF i.state NOT IN ('proposed', 'aligned') THEN RAISE EXCEPTION 'initiative rejected (state): initiative "%" is %, not proposed', i.title, i.state USING ERRCODE = '22023'; END IF;
  v_objs := ARRAY[i.objective_id] || coalesce(p_objectives, '{}'::uuid[]);
  FOREACH o IN ARRAY v_objs LOOP
    IF NOT executive._objective_live(o, p_tenant, p_domain) THEN RAISE EXCEPTION 'initiative rejected (unknown_objective): % is not a live objective (OBJ) of this domain', o USING ERRCODE = '23503'; END IF;
    IF NOT (o = ANY (pl.objective_ids)) THEN RAISE EXCEPTION 'initiative rejected (objectives): objective % is not in the objective set of plan "%"', o, pl.title USING ERRCODE = '22023'; END IF;
    INSERT INTO executive.initiative_objectives (initiative_id, objective_id, linked_by) VALUES (p_initiative, o, p_actor) ON CONFLICT DO NOTHING;
  END LOOP;
  UPDATE executive.initiatives SET state = 'aligned', version = version + 1, updated_at = clock_timestamp() WHERE initiative_id = p_initiative;
  RETURN executive._transition(i, 'align', 'aligned', p_actor, p_rationale, jsonb_build_object('objectives', to_jsonb(v_objs)), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.align_initiative(uuid,uuid,uuid,uuid[],text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.align_initiative(uuid,uuid,uuid,uuid[],text,uuid,uuid) TO eye_commit;

/* PRIORITISE: the strategy lead ranks an ALIGNED initiative (an unaligned one is refused); aligned | prioritised → prioritised. */
CREATE OR REPLACE FUNCTION executive.prioritise_initiative(p_initiative uuid, p_tenant uuid, p_domain uuid, p_priority int, p_rationale text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, graph, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i executive.initiatives%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.initiative.prioritise']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'initiative rejected (actor): prioritised by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_priority IS NULL OR p_priority < 1 THEN RAISE EXCEPTION 'initiative rejected (priority): a priority is a rank >= 1' USING ERRCODE = '22023'; END IF;
  IF p_rationale IS NULL OR length(btrim(p_rationale)) < 8 THEN RAISE EXCEPTION 'initiative rejected (reason): a prioritisation says why (8 characters or more)' USING ERRCODE = '22023'; END IF;
  i := executive._initiative_locked(p_initiative, p_tenant, p_domain);
  IF i.state = 'proposed' THEN RAISE EXCEPTION 'initiative rejected (state): initiative "%" is not aligned to an objective yet — align it before it is prioritised', i.title USING ERRCODE = '22023'; END IF;
  IF i.state NOT IN ('aligned', 'prioritised') THEN RAISE EXCEPTION 'initiative rejected (state): initiative "%" is %, not aligned', i.title, i.state USING ERRCODE = '22023'; END IF;
  UPDATE executive.initiatives SET state = 'prioritised', priority = p_priority, version = version + 1, updated_at = clock_timestamp() WHERE initiative_id = p_initiative;
  RETURN executive._transition(i, 'prioritise', 'prioritised', p_actor, p_rationale, jsonb_build_object('priority', p_priority), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.prioritise_initiative(uuid,uuid,uuid,int,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.prioritise_initiative(uuid,uuid,uuid,int,text,uuid,uuid) TO eye_commit;

/* FUND: the executive or the decision authority funds a PRIORITISED initiative WITHIN THE PLAN'S AUTHORITY — the funded sum of the plan's
   live initiatives plus this amount may not exceed the ceiling (`initiative rejected (budget_authority)`). */
CREATE OR REPLACE FUNCTION executive.fund_initiative(p_initiative uuid, p_tenant uuid, p_domain uuid, p_amount numeric, p_rationale text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, graph, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i executive.initiatives%ROWTYPE; pl executive.plans%ROWTYPE; v_funded numeric;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.initiative.fund']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'initiative rejected (actor): funded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_amount IS NULL OR p_amount < 0 THEN RAISE EXCEPTION 'initiative rejected (budget): the funded amount is an amount >= 0' USING ERRCODE = '22023'; END IF;
  IF p_rationale IS NULL OR length(btrim(p_rationale)) < 8 THEN RAISE EXCEPTION 'initiative rejected (reason): a funding says why (8 characters or more)' USING ERRCODE = '22023'; END IF;
  i := executive._initiative_locked(p_initiative, p_tenant, p_domain);
  SELECT * INTO pl FROM executive.plans p WHERE p.plan_id = i.plan_id;
  IF i.state <> 'prioritised' THEN RAISE EXCEPTION 'initiative rejected (state): initiative "%" is %, not prioritised — the lead prioritises before the executive funds', i.title, i.state USING ERRCODE = '22023'; END IF;
  v_funded := executive._funded_sum(i.plan_id);
  IF v_funded + p_amount > pl.budget_authority THEN
    RAISE EXCEPTION 'initiative rejected (budget_authority): funding % % for "%" would bring the funded sum of plan "%" to % %, above its authority ceiling of % %',
      p_amount::numeric(18,2), pl.budget_currency, i.title, pl.title, (v_funded + p_amount)::numeric(18,2), pl.budget_currency, pl.budget_authority, pl.budget_currency USING ERRCODE = '22023';
  END IF;
  UPDATE executive.initiatives SET state = 'funded', funded_amount = p_amount, version = version + 1, updated_at = clock_timestamp() WHERE initiative_id = p_initiative;
  RETURN executive._transition(i, 'fund', 'funded', p_actor, p_rationale, jsonb_build_object('funded_amount', p_amount, 'currency', pl.budget_currency, 'funded_sum_after', v_funded + p_amount, 'authority', pl.budget_authority), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.fund_initiative(uuid,uuid,uuid,numeric,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.fund_initiative(uuid,uuid,uuid,numeric,text,uuid,uuid) TO eye_commit;

/* APPROVE: the human boundary. A second named human (never the proposer) approves a FUNDED initiative; the service then admits the next
   INI version (the approval in metrics.planning) under this action. */
CREATE OR REPLACE FUNCTION executive.approve_initiative(p_initiative uuid, p_tenant uuid, p_domain uuid, p_rationale text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, graph, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i executive.initiatives%ROWTYPE; v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.initiative.approve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'initiative rejected (actor): approved by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_rationale IS NULL OR length(btrim(p_rationale)) < 8 THEN RAISE EXCEPTION 'initiative rejected (reason): an approval says why (8 characters or more)' USING ERRCODE = '22023'; END IF;
  i := executive._initiative_locked(p_initiative, p_tenant, p_domain);
  IF i.proposed_by = p_actor THEN RAISE EXCEPTION 'initiative rejected (separation): initiative "%" is approved by someone other than its proposer', i.title USING ERRCODE = '42501'; END IF;
  IF i.state <> 'funded' THEN RAISE EXCEPTION 'initiative rejected (state): initiative "%" is %, not funded — funding precedes approval', i.title, i.state USING ERRCODE = '22023'; END IF;
  UPDATE executive.initiatives SET state = 'approved', approved_by = p_actor, approved_at = v_now, version = version + 1, updated_at = v_now WHERE initiative_id = p_initiative;
  RETURN executive._transition(i, 'approve', 'approved', p_actor, p_rationale, jsonb_build_object('approved_at', v_now), p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.approve_initiative(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.approve_initiative(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

/* The approved INI version's number, recorded by the service after the admission (the object's planning view names it). */
CREATE OR REPLACE FUNCTION executive.record_initiative_object_version(p_initiative uuid, p_tenant uuid, p_domain uuid, p_version bigint, p_actor uuid) RETURNS void
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.initiative.approve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'initiative rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  UPDATE executive.initiatives SET approved_object_version = p_version WHERE initiative_id = p_initiative AND tenant_id = p_tenant AND domain_id = p_domain AND state = 'approved' AND approved_by = p_actor;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.record_initiative_object_version(uuid,uuid,uuid,bigint,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.record_initiative_object_version(uuid,uuid,uuid,bigint,uuid) TO eye_commit;

/* PAUSE and CLOSE: the SPONSOR's acts, with a reason. A paused or closed initiative no longer draws on the authority. */
CREATE OR REPLACE FUNCTION executive.pause_initiative(p_initiative uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, graph, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i executive.initiatives%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.initiative.pause']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'initiative rejected (actor): paused by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'initiative rejected (reason): a pause says why (8 characters or more)' USING ERRCODE = '22023'; END IF;
  i := executive._initiative_locked(p_initiative, p_tenant, p_domain);
  IF i.sponsor_principal_id <> p_actor THEN RAISE EXCEPTION 'initiative rejected (not_sponsor): initiative "%" is paused by its sponsor', i.title USING ERRCODE = '42501'; END IF;
  IF i.state IN ('paused', 'closed') THEN RAISE EXCEPTION 'initiative rejected (state): initiative "%" is already %', i.title, i.state USING ERRCODE = '22023'; END IF;
  UPDATE executive.initiatives SET state = 'paused', pause_reason = p_reason, version = version + 1, updated_at = clock_timestamp() WHERE initiative_id = p_initiative;
  RETURN executive._transition(i, 'pause', 'paused', p_actor, p_reason, '{}'::jsonb, p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.pause_initiative(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.pause_initiative(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION executive.close_initiative(p_initiative uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, graph, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i executive.initiatives%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.initiative.close']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'initiative rejected (actor): closed by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN RAISE EXCEPTION 'initiative rejected (reason): a close says why (8 characters or more)' USING ERRCODE = '22023'; END IF;
  i := executive._initiative_locked(p_initiative, p_tenant, p_domain);
  IF i.sponsor_principal_id <> p_actor THEN RAISE EXCEPTION 'initiative rejected (not_sponsor): initiative "%" is closed by its sponsor', i.title USING ERRCODE = '42501'; END IF;
  IF i.state = 'closed' THEN RAISE EXCEPTION 'initiative rejected (state): initiative "%" is already closed', i.title USING ERRCODE = '22023'; END IF;
  UPDATE executive.initiatives SET state = 'closed', close_reason = p_reason, version = version + 1, updated_at = clock_timestamp() WHERE initiative_id = p_initiative;
  UPDATE executive.milestones SET state = 'cancelled', updated_at = clock_timestamp() WHERE initiative_id = p_initiative AND state IN ('planned', 'at_risk');
  RETURN executive._transition(i, 'close', 'closed', p_actor, p_reason, '{}'::jsonb, p_correlation);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.close_initiative(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.close_initiative(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §P5 MILESTONES, DEPENDENCIES, PLAN MEASURES, PLAN RUNS (the strategy lead's planning edits)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
/* A milestone: its measure is a graph.measures row of the domain that measures one of the initiative's objectives; the measure is bound
   into the plan's measures when not yet. */
CREATE OR REPLACE FUNCTION executive.set_milestone(p_milestone uuid, p_tenant uuid, p_domain uuid, p_initiative uuid, p_name text, p_due date, p_measure uuid, p_target numeric, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, graph, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE i executive.initiatives%ROWTYPE; g graph.measures%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.plan.milestone.set']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'milestone rejected (actor): set by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_name IS NULL OR length(btrim(p_name)) < 2 THEN RAISE EXCEPTION 'milestone rejected (name): a milestone is named (2 characters or more)' USING ERRCODE = '22023'; END IF;
  IF p_due IS NULL THEN RAISE EXCEPTION 'milestone rejected (due_date): a milestone has a due date' USING ERRCODE = '22023'; END IF;
  IF p_target IS NULL THEN RAISE EXCEPTION 'milestone rejected (target): a milestone names the value its measure must reach' USING ERRCODE = '22023'; END IF;
  i := executive._initiative_locked(p_initiative, p_tenant, p_domain);
  IF i.state = 'closed' THEN RAISE EXCEPTION 'milestone rejected (state): initiative "%" is closed', i.title USING ERRCODE = '22023'; END IF;
  SELECT * INTO g FROM graph.measures m WHERE m.measure_id = p_measure AND m.tenant_id = p_tenant AND m.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'milestone rejected (unknown_measure): % is not a measure (MSR) of this domain', p_measure USING ERRCODE = '23503'; END IF;
  IF NOT EXISTS (SELECT 1 FROM executive.initiative_objectives io WHERE io.initiative_id = p_initiative AND io.objective_id = g.objective_id) THEN
    RAISE EXCEPTION 'milestone rejected (measure_objective): measure % measures objective %, which initiative "%" is not aligned to', p_measure, g.objective_id, i.title USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM executive.milestones m WHERE m.milestone_id = p_milestone) THEN RAISE EXCEPTION 'milestone rejected (duplicate): % is already a milestone', p_milestone USING ERRCODE = '22023'; END IF;
  INSERT INTO executive.milestones (milestone_id, scope, tenant_id, domain_id, plan_id, initiative_id, name, due_date, measure_id, target_value, declared_by, correlation_id)
  VALUES (p_milestone, 'DOMAIN', p_tenant, p_domain, i.plan_id, p_initiative, btrim(p_name), p_due, p_measure, p_target, p_actor, p_correlation);
  INSERT INTO executive.plan_measures (plan_id, measure_id, quantity_key, bound_by) VALUES (i.plan_id, p_measure, NULL, p_actor) ON CONFLICT DO NOTHING;
  PERFORM executive._plan_event(i.plan_id, p_tenant, p_domain, 'milestone', p_milestone, 'milestone.set', p_actor, jsonb_build_object('initiative_id', p_initiative, 'name', p_name, 'due_date', p_due, 'measure_id', p_measure, 'target_value', p_target), p_correlation);
  RETURN (SELECT to_jsonb(m) - 'scope' FROM executive.milestones m WHERE m.milestone_id = p_milestone);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.set_milestone(uuid,uuid,uuid,uuid,text,date,uuid,numeric,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.set_milestone(uuid,uuid,uuid,uuid,text,date,uuid,numeric,uuid,uuid) TO eye_commit;

/* A dependency between two initiatives of the same plan; a finish_to_start CYCLE is refused. */
CREATE OR REPLACE FUNCTION executive.declare_initiative_dependency(p_dependency uuid, p_tenant uuid, p_domain uuid, p_from uuid, p_to uuid, p_kind text, p_rationale text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, graph, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE a executive.initiatives%ROWTYPE; b executive.initiatives%ROWTYPE; v_cycle uuid[];
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.plan.dependency.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'plan dependency rejected (actor): declared by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('finish_to_start', 'shares_resource') THEN RAISE EXCEPTION 'plan dependency rejected (kind): the kind is finish_to_start or shares_resource' USING ERRCODE = '22023'; END IF;
  IF p_rationale IS NULL OR length(btrim(p_rationale)) < 8 THEN RAISE EXCEPTION 'plan dependency rejected (reason): a dependency says why (8 characters or more)' USING ERRCODE = '22023'; END IF;
  IF p_from = p_to THEN RAISE EXCEPTION 'plan dependency rejected (self): an initiative does not depend on itself' USING ERRCODE = '22023'; END IF;
  a := executive._initiative_locked(p_from, p_tenant, p_domain);
  SELECT * INTO b FROM executive.initiatives x WHERE x.initiative_id = p_to AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan dependency rejected (unknown_initiative): % is not an initiative of a plan of this domain', p_to USING ERRCODE = '23503'; END IF;
  IF a.plan_id <> b.plan_id THEN RAISE EXCEPTION 'plan dependency rejected (plan): "%" and "%" are in different plans', a.title, b.title USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM executive.initiative_dependencies d WHERE d.from_initiative_id = p_from AND d.to_initiative_id = p_to AND d.kind = p_kind AND d.state = 'active') THEN
    RAISE EXCEPTION 'plan dependency rejected (duplicate): "%" → "%" (%) is already declared', a.title, b.title, p_kind USING ERRCODE = '22023';
  END IF;
  IF p_kind = 'finish_to_start' THEN
    WITH RECURSIVE walk AS (
      SELECT d.to_initiative_id AS node, ARRAY[p_to, d.to_initiative_id] AS path FROM executive.initiative_dependencies d WHERE d.from_initiative_id = p_to AND d.kind = 'finish_to_start' AND d.state = 'active'
      UNION ALL
      SELECT d.to_initiative_id, w.path || d.to_initiative_id FROM walk w JOIN executive.initiative_dependencies d ON d.from_initiative_id = w.node AND d.kind = 'finish_to_start' AND d.state = 'active'
       WHERE NOT (d.to_initiative_id = ANY (w.path)))
    SELECT path INTO v_cycle FROM walk WHERE node = p_from LIMIT 1;
    IF v_cycle IS NOT NULL THEN
      RAISE EXCEPTION 'plan dependency rejected (cycle): "%" → "%" would close a finish_to_start cycle (%)', a.title, b.title, array_to_string(v_cycle, ' → ') USING ERRCODE = '22023';
    END IF;
  END IF;
  INSERT INTO executive.initiative_dependencies (dependency_id, scope, tenant_id, domain_id, plan_id, from_initiative_id, to_initiative_id, kind, rationale, declared_by, correlation_id)
  VALUES (p_dependency, 'DOMAIN', p_tenant, p_domain, a.plan_id, p_from, p_to, p_kind, btrim(p_rationale), p_actor, p_correlation);
  PERFORM executive._plan_event(a.plan_id, p_tenant, p_domain, 'dependency', p_dependency, 'dependency.declared', p_actor, jsonb_build_object('from', p_from, 'to', p_to, 'kind', p_kind, 'rationale', p_rationale), p_correlation);
  RETURN (SELECT to_jsonb(d) - 'scope' FROM executive.initiative_dependencies d WHERE d.dependency_id = p_dependency);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.declare_initiative_dependency(uuid,uuid,uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.declare_initiative_dependency(uuid,uuid,uuid,uuid,uuid,text,text,uuid,uuid) TO eye_commit;

/* A plan measure: a graph.measures row bound by id (the Strategy Graph's — never a copy), with the run output key its sensitivity maps. */
CREATE OR REPLACE FUNCTION executive.bind_plan_measure(p_plan uuid, p_tenant uuid, p_domain uuid, p_measure uuid, p_quantity_key text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, graph, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE pl executive.plans%ROWTYPE; g graph.measures%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.plan.measure.bind']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'plan measure rejected (actor): bound by the acting principal' USING ERRCODE = '42501'; END IF;
  pl := executive._plan_locked(p_plan, p_tenant, p_domain, true);
  SELECT * INTO g FROM graph.measures m WHERE m.measure_id = p_measure AND m.tenant_id = p_tenant AND m.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan measure rejected (unknown_measure): % is not a measure (MSR) of this domain', p_measure USING ERRCODE = '23503'; END IF;
  IF NOT (g.objective_id = ANY (pl.objective_ids)) THEN RAISE EXCEPTION 'plan measure rejected (objectives): measure % measures objective %, which is not in the objective set of plan "%"', p_measure, g.objective_id, pl.title USING ERRCODE = '22023'; END IF;
  IF p_quantity_key IS NOT NULL AND length(btrim(p_quantity_key)) NOT BETWEEN 1 AND 128 THEN RAISE EXCEPTION 'plan measure rejected (quantity_key): a run output key is 1 to 128 characters' USING ERRCODE = '22023'; END IF;
  INSERT INTO executive.plan_measures (plan_id, measure_id, quantity_key, bound_by) VALUES (p_plan, p_measure, NULLIF(btrim(p_quantity_key), ''), p_actor)
  ON CONFLICT (plan_id, measure_id) DO UPDATE SET quantity_key = EXCLUDED.quantity_key, bound_by = EXCLUDED.bound_by, bound_at = clock_timestamp();
  PERFORM executive._plan_event(p_plan, p_tenant, p_domain, 'measure', p_measure, 'measure.bound', p_actor, jsonb_build_object('quantity_key', p_quantity_key, 'definition_version', g.definition_version), p_correlation);
  RETURN jsonb_build_object('plan_id', p_plan, 'measure_id', p_measure, 'quantity_key', NULLIF(btrim(p_quantity_key), ''), 'objective_id', g.objective_id, 'unit', g.unit, 'direction', g.direction, 'target_value', g.target_value, 'target_date', g.target_date);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.bind_plan_measure(uuid,uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.bind_plan_measure(uuid,uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

/* A scenario run attached to the plan: the runs the variance step reads and the workspace's sensitivity offers. A completed run of this domain. */
CREATE OR REPLACE FUNCTION executive.attach_plan_run(p_plan uuid, p_tenant uuid, p_domain uuid, p_run uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, simulation, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE pl executive.plans%ROWTYPE; r simulation.runs_current%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.plan.run.attach']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'plan run rejected (actor): attached by the acting principal' USING ERRCODE = '42501'; END IF;
  pl := executive._plan_locked(p_plan, p_tenant, p_domain, true);
  SELECT * INTO r FROM simulation.runs_current x WHERE x.run_id = p_run AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan run rejected (unknown_run): % is not a simulation run of this domain', p_run USING ERRCODE = '23503'; END IF;
  IF r.state <> 'completed' OR r.outputs IS NULL THEN RAISE EXCEPTION 'plan run rejected (state): run % is %, not completed with outputs', p_run, r.state USING ERRCODE = '22023'; END IF;
  INSERT INTO executive.plan_runs (plan_id, run_id, attached_by) VALUES (p_plan, p_run, p_actor) ON CONFLICT DO NOTHING;
  PERFORM executive._plan_event(p_plan, p_tenant, p_domain, 'run', p_run, 'run.attached', p_actor, jsonb_build_object('model_ref', r.model_ref, 'outputs_digest', r.outputs_digest, 'scenario_id', r.scenario_id, 'component', r.component), p_correlation);
  RETURN jsonb_build_object('plan_id', p_plan, 'run_id', p_run, 'model_ref', r.model_ref, 'outputs_digest', r.outputs_digest, 'scenario_id', r.scenario_id, 'completed_at', r.completed_at);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.attach_plan_run(uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.attach_plan_run(uuid,uuid,uuid,uuid,uuid,uuid) TO eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §P6 THE BREACHES: the acknowledgement, the commitment HOLD, the citation
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
/* The executive (or the decision authority) ACKNOWLEDGES an open breach with an authorization: the breach stays recorded (shown), and a
   commitment on the plan's initiatives is no longer held by it. */
CREATE OR REPLACE FUNCTION executive.acknowledge_plan_breach(p_breach uuid, p_tenant uuid, p_domain uuid, p_authorization text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE b executive.plan_breaches%ROWTYPE; v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.plan.breach.acknowledge']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'plan breach rejected (actor): acknowledged by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_authorization IS NULL OR length(btrim(p_authorization)) < 8 THEN RAISE EXCEPTION 'plan breach rejected (authorization): an acknowledgement names the authority for the commitments it permits (8 characters or more)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO b FROM executive.plan_breaches x WHERE x.breach_id = p_breach AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan breach rejected (unknown_breach): % is not a breach of a plan of this domain', p_breach USING ERRCODE = '23503'; END IF;
  IF b.state <> 'open' THEN RAISE EXCEPTION 'plan breach rejected (state): breach % is %, not open', p_breach, b.state USING ERRCODE = '22023'; END IF;
  UPDATE executive.plan_breaches SET state = 'acknowledged', acknowledged_by = p_actor, acknowledged_at = v_now, authorization_note = btrim(p_authorization) WHERE breach_id = p_breach;
  PERFORM executive._plan_event(b.plan_id, p_tenant, p_domain, 'breach', p_breach, 'breach.acknowledged', p_actor, jsonb_build_object('kind', b.kind, 'authorization', p_authorization), p_correlation);
  RETURN (SELECT to_jsonb(x) - 'scope' FROM executive.plan_breaches x WHERE x.breach_id = p_breach);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.acknowledge_plan_breach(uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.acknowledge_plan_breach(uuid,uuid,uuid,text,uuid,uuid) TO eye_commit;

/* THE CITATION: a decision package cites the initiative it commits to (the owner's or the lead's act); the package event initiative.cited. */
CREATE OR REPLACE FUNCTION executive.cite_initiative(p_package uuid, p_tenant uuid, p_domain uuid, p_initiative uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p decision.packages_current%ROWTYPE; i executive.initiatives%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.plan.initiative.cite']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'initiative citation rejected (actor): cited by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO p FROM decision.packages_current x WHERE x.package_id = p_package AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'initiative citation rejected (unknown_package): % is not a decision package of this domain', p_package USING ERRCODE = '23503'; END IF;
  IF p.state NOT IN ('draft', 'proposed', 'under_review', 'approved') THEN RAISE EXCEPTION 'initiative citation rejected (state): package "%" is %; a citation is made before commitment', p.title, p.state USING ERRCODE = '22023'; END IF;
  SELECT * INTO i FROM executive.initiatives x WHERE x.initiative_id = p_initiative AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'initiative citation rejected (unknown_initiative): % is not an initiative of a plan of this domain', p_initiative USING ERRCODE = '23503'; END IF;
  IF p.owner_principal_id <> p_actor AND NOT EXISTS (SELECT 1 FROM executive.plans pl WHERE pl.plan_id = i.plan_id AND pl.owner_principal_id = p_actor) THEN
    RAISE EXCEPTION 'initiative citation rejected (not_owner): package "%" is cited by its owner or the plan''s lead', p.title USING ERRCODE = '42501';
  END IF;
  UPDATE decision.packages_current SET initiative_id = p_initiative WHERE package_id = p_package;
  INSERT INTO decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_package, 'initiative.cited', p_actor, jsonb_build_object('initiative_id', p_initiative, 'plan_id', i.plan_id, 'title', i.title), p_correlation);
  PERFORM executive._plan_event(i.plan_id, p_tenant, p_domain, 'citation', p_package, 'initiative.cited', p_actor, jsonb_build_object('package_id', p_package, 'initiative_id', p_initiative, 'package_title', p.title), p_correlation);
  RETURN jsonb_build_object('package_id', p_package, 'initiative_id', p_initiative, 'plan_id', i.plan_id, 'title', i.title);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.cite_initiative(uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.cite_initiative(uuid,uuid,uuid,uuid,uuid,uuid) TO eye_commit;

/* THE COMMITMENT HOLD: BEFORE the tracker seeds (0090 §C2's AFTER INSERT trigger), a commitment on a package that cites an initiative of a
   plan with an OPEN breach is refused — the unauthorized commitment is HELD until the executive acknowledges the breach (the authority
   named) or the breach resolves. The citation is feature-detected on the package (NULL = no citation, nothing held). */
CREATE OR REPLACE FUNCTION executive.hold_commitment_on_breach() RETURNS trigger
SECURITY DEFINER SET search_path = executive, decision, pg_catalog, pg_temp AS $$
DECLARE v_initiative uuid; i executive.initiatives%ROWTYPE; v_breaches text;
BEGIN
  SELECT initiative_id INTO v_initiative FROM decision.packages_current p WHERE p.package_id = NEW.package_id;
  IF v_initiative IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO i FROM executive.initiatives x WHERE x.initiative_id = v_initiative;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT string_agg(format('%s [%s]', b.kind, b.cause_key), '; ' ORDER BY b.opened_at) INTO v_breaches FROM executive.plan_breaches b WHERE b.plan_id = i.plan_id AND b.state = 'open';
  IF v_breaches IS NOT NULL THEN
    RAISE EXCEPTION 'plan commitment rejected (breach_open): package % cites initiative "%" of a plan with open breach(es) — %; the commitment is held until the executive acknowledges the breach or it resolves', NEW.package_id, i.title, v_breaches USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER a_hold_on_plan_breach BEFORE INSERT ON decision.commitments FOR EACH ROW EXECUTE FUNCTION executive.hold_commitment_on_breach();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §P7 THE TICK STEP `plan-variance` (order 55): VARIANCES routed, BREACHES opened and resolved
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
/* The value a run's outputs give a key at a date: the last series row dated on or before p_date (the supply-flow model's `days`, a
   method's `series`); NULL when the run has no such row or the cell is not a number. */
CREATE OR REPLACE FUNCTION executive.run_quantity_at(p_outputs jsonb, p_key text, p_date date) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT (SELECT jsonb_build_object('date', row ->> 'date', 'value', (row ->> p_key)::numeric)
            FROM jsonb_array_elements(coalesce(p_outputs -> 'series', p_outputs -> 'days', '[]'::jsonb)) row
           WHERE (row ->> 'date') ~ '^\d{4}-\d{2}-\d{2}' AND (row ->> 'date')::date <= p_date AND (row ->> p_key) ~ '^-?[0-9]+(\.[0-9]+)?$'
           ORDER BY (row ->> 'date')::date DESC LIMIT 1)
$$;
GRANT EXECUTE ON FUNCTION executive.run_quantity_at(jsonb, text, date) TO eye_app, eye_commit;

CREATE OR REPLACE FUNCTION executive.detect_plan_variance(p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, graph, decision, simulation, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_now timestamptz := clock_timestamp(); v_today date := clock_timestamp()::date; c record; rb record; pol executive.attention_policies%ROWTYPE;
        v_eval jsonb; v_route jsonb; v_state text; v_owner uuid; v_item uuid; v_var uuid; v_variance numeric; v_adverse boolean; v_title text;
        v_raised jsonb := '[]'::jsonb; v_opened jsonb := '[]'::jsonb; v_resolved jsonb := '[]'::jsonb; v_id uuid; v_causes jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO pol FROM executive.attention_policies a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.state = 'active';

  -- ── VARIANCES: a milestone's measure vs its target, from the latest observation (once the milestone is due) or from each attached run ──
  FOR c IN
    SELECT 'observation'::text AS basis_kind, o.observation_id AS basis_id, NULL::text AS basis_digest, o.observed_at::date AS basis_date, o.value AS observed,
           m.milestone_id, m.initiative_id, m.plan_id, m.measure_id, m.target_value, m.name, m.due_date, g.direction, g.unit, i.owner_principal_id AS owner, i.title AS initiative_title
      FROM executive.milestones m
      JOIN executive.initiatives i ON i.initiative_id = m.initiative_id AND i.state NOT IN ('closed', 'paused')
      JOIN executive.plans pl ON pl.plan_id = m.plan_id AND pl.state <> 'closed'
      JOIN graph.measures g ON g.measure_id = m.measure_id
      JOIN LATERAL (SELECT x.observation_id, x.value, x.observed_at FROM graph.measure_observations x WHERE x.measure_id = m.measure_id ORDER BY x.observed_at DESC, x.recorded_at DESC LIMIT 1) o ON true
     WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain AND m.state IN ('planned', 'at_risk') AND m.due_date <= v_today
    UNION ALL
    SELECT 'run', r.run_id, r.outputs_digest, (qq.q ->> 'date')::date, (qq.q ->> 'value')::numeric,
           m.milestone_id, m.initiative_id, m.plan_id, m.measure_id, m.target_value, m.name, m.due_date, g.direction, g.unit, i.owner_principal_id, i.title
      FROM executive.milestones m
      JOIN executive.initiatives i ON i.initiative_id = m.initiative_id AND i.state NOT IN ('closed', 'paused')
      JOIN executive.plans pl ON pl.plan_id = m.plan_id AND pl.state <> 'closed'
      JOIN graph.measures g ON g.measure_id = m.measure_id
      JOIN executive.plan_measures pm ON pm.plan_id = m.plan_id AND pm.measure_id = m.measure_id AND pm.quantity_key IS NOT NULL
      JOIN executive.plan_runs pr ON pr.plan_id = m.plan_id
      JOIN simulation.runs_current r ON r.run_id = pr.run_id AND r.state = 'completed' AND r.outputs IS NOT NULL
      JOIN LATERAL (SELECT executive.run_quantity_at(r.outputs, pm.quantity_key, m.due_date) AS q) qq ON qq.q IS NOT NULL
     WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain AND m.state IN ('planned', 'at_risk')
  LOOP
    IF EXISTS (SELECT 1 FROM executive.plan_variances v WHERE v.milestone_id = c.milestone_id AND v.basis_kind = c.basis_kind AND v.basis_id = c.basis_id) THEN CONTINUE; END IF;
    v_variance := CASE WHEN c.direction = 'higher_better' THEN c.observed - c.target_value ELSE c.target_value - c.observed END;
    v_adverse := v_variance < 0;
    IF NOT v_adverse THEN
      -- a met milestone from an observation on or after its due date is recorded as met; a favourable run reading raises nothing
      IF c.basis_kind = 'observation' THEN
        UPDATE executive.milestones SET state = 'met', updated_at = v_now WHERE milestone_id = c.milestone_id AND state IN ('planned', 'at_risk');
        PERFORM executive._plan_event(c.plan_id, p_tenant, p_domain, 'milestone', c.milestone_id, 'milestone.state_changed', p_actor, jsonb_build_object('state', 'met', 'basis', 'observation', 'observation_id', c.basis_id, 'value', c.observed), p_correlation);
      END IF;
      CONTINUE;
    END IF;
    v_var := gen_random_uuid(); v_item := gen_random_uuid();
    v_title := left(format('plan variance: %s — %s %s vs target %s %s (%s)', c.name, c.observed::text, c.unit, c.target_value::text, c.unit, CASE c.basis_kind WHEN 'run' THEN 'scenario run' ELSE 'observed' END), 512);
    -- THE ROUTING (the queue's rule, 0083 §5 / 0094 §S7's idiom): the initiative's owner when an active human, else the class's roles under the active policy
    v_owner := CASE WHEN c.owner IS NOT NULL AND decision.is_active_human(c.owner, p_tenant) THEN c.owner END;
    v_eval := executive.evaluate_attention(CASE WHEN pol.policy_id IS NULL THEN NULL ELSE pol.rules END, 'plan.variance',
                                           jsonb_build_object('consequence', 'C2', 'confidence', 1, 'hours_to_window', CASE WHEN c.due_date >= v_today THEN (c.due_date - v_today) * 24 ELSE 0 END)) || jsonb_build_object('policy_version', pol.version);
    v_route := executive.attention_route(pol.rules, 'plan.variance', v_eval ->> 'outcome', v_owner, p_tenant, p_domain);
    v_state := v_route ->> 'state';
    INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state,
                                           owner_principal_id, route_roles, policy_id, policy_version, evaluation, details, due_at, escalations, correlation_id)
    VALUES (v_item, 'DOMAIN', p_tenant, p_domain, 'plan.variance', 'plan', c.plan_id, v_var, 'PlanVarianceRaised', v_title, v_eval ->> 'outcome', v_state,
            v_owner, ARRAY(SELECT jsonb_array_elements_text(v_route -> 'route_roles')), pol.policy_id, pol.version, v_eval,
            jsonb_build_object('variance_id', v_var, 'plan_id', c.plan_id, 'initiative_id', c.initiative_id, 'initiative_title', c.initiative_title, 'milestone_id', c.milestone_id, 'milestone', c.name, 'due_date', c.due_date,
                               'measure_id', c.measure_id, 'basis_kind', c.basis_kind, 'basis_id', c.basis_id, 'basis_digest', c.basis_digest, 'basis_date', c.basis_date,
                               'observed_value', c.observed, 'target_value', c.target_value, 'direction', c.direction, 'variance', v_variance, 'unit', c.unit, 'raised_at', v_now, 'by', 'the attention tick step plan-variance'),
            (v_route ->> 'due_at')::timestamptz, (v_route ->> 'escalations')::int, p_correlation);
    PERFORM executive.attention_event(v_item, p_tenant, p_domain,
              CASE v_state WHEN 'open' THEN 'item.routed' WHEN 'escalated' THEN 'item.escalated' WHEN 'unrouted' THEN 'item.unrouted' ELSE 'item.deprioritized' END,
              p_actor, jsonb_build_object('outcome', v_eval ->> 'outcome', 'reasons', v_eval -> 'reasons', 'policy_version', pol.version, 'owner', v_owner, 'route_roles', v_route -> 'route_roles',
                                          'due_at', v_route -> 'due_at', 'cause_event_id', v_var, 'cause_event_type', 'PlanVarianceRaised', 'unrouted', coalesce((v_route ->> 'unrouted')::boolean, false)), p_correlation);
    INSERT INTO executive.plan_variances (variance_id, scope, tenant_id, domain_id, plan_id, initiative_id, milestone_id, measure_id, basis_kind, basis_id, basis_digest, basis_date, observed_value, target_value, direction,
                                          variance, adverse, owner_principal_id, routed_item_id, routing, raised_at, raised_by, correlation_id)
    VALUES (v_var, 'DOMAIN', p_tenant, p_domain, c.plan_id, c.initiative_id, c.milestone_id, c.measure_id, c.basis_kind, c.basis_id, c.basis_digest, c.basis_date, c.observed, c.target_value, c.direction,
            v_variance, true, v_owner, v_item, jsonb_build_object('state', v_state, 'outcome', v_eval ->> 'outcome', 'route_roles', v_route -> 'route_roles', 'policy_version', pol.version, 'due_at', v_route -> 'due_at'), v_now, p_actor, p_correlation);
    UPDATE executive.milestones SET state = CASE WHEN c.basis_kind = 'observation' THEN 'missed' ELSE 'at_risk' END, updated_at = v_now WHERE milestone_id = c.milestone_id AND state IN ('planned', 'at_risk');
    PERFORM executive._plan_event(c.plan_id, p_tenant, p_domain, 'variance', v_var, 'variance.raised', p_actor,
                                  jsonb_build_object('milestone_id', c.milestone_id, 'initiative_id', c.initiative_id, 'basis_kind', c.basis_kind, 'basis_id', c.basis_id, 'variance', v_variance, 'item_id', v_item, 'owner', v_owner, 'state', v_state), p_correlation);
    v_raised := v_raised || jsonb_build_object('variance_id', v_var, 'milestone_id', c.milestone_id, 'initiative_id', c.initiative_id, 'basis_kind', c.basis_kind, 'basis_id', c.basis_id, 'variance', v_variance, 'item_id', v_item, 'state', v_state, 'owner', v_owner);
  END LOOP;

  -- ── BREACHES: each kind once per cause while it holds; resolved when it no longer holds ──
  SELECT coalesce(jsonb_agg(to_jsonb(cz)), '[]'::jsonb) INTO v_causes FROM (
    -- LOST LINKAGE: an initiative (not closed) whose objective is no longer active in the Strategy Graph
    SELECT i.plan_id, i.initiative_id, 'lost_linkage', io.objective_id::text || ':' || i.initiative_id::text,
           format('initiative "%s" is linked to objective "%s", which is %s in the Strategy Graph', i.title, s.title, s.status),
           jsonb_build_object('objective_id', io.objective_id, 'objective_status', s.status, 'initiative_id', i.initiative_id, 'initiative_state', i.state, 'funded_amount', i.funded_amount,
                              'milestones', (SELECT coalesce(jsonb_agg(jsonb_build_object('milestone_id', m.milestone_id, 'name', m.name, 'due_date', m.due_date)), '[]'::jsonb) FROM executive.milestones m WHERE m.initiative_id = i.initiative_id AND m.state IN ('planned', 'at_risk')))
      FROM executive.initiatives i JOIN executive.plans pl ON pl.plan_id = i.plan_id AND pl.state <> 'closed'
      JOIN executive.initiative_objectives io ON io.initiative_id = i.initiative_id
      JOIN graph.strategy_current s ON s.strategy_object_id = io.objective_id
     WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.state <> 'closed' AND s.status <> 'active'
    UNION ALL
    -- INFEASIBLE: a finish_to_start dependency whose predecessor's last milestone is due after the successor's first
    SELECT d.plan_id, d.to_initiative_id, 'infeasible', d.dependency_id::text,
           format('"%s" must finish before "%s" starts, but its last milestone is due %s and the successor''s first %s', a.title, b.title, ma.last_due, mb.first_due),
           jsonb_build_object('dependency_id', d.dependency_id, 'from', d.from_initiative_id, 'to', d.to_initiative_id, 'predecessor_last_due', ma.last_due, 'successor_first_due', mb.first_due, 'slip_days', (ma.last_due - mb.first_due))
      FROM executive.initiative_dependencies d
      JOIN executive.initiatives a ON a.initiative_id = d.from_initiative_id AND a.state <> 'closed'
      JOIN executive.initiatives b ON b.initiative_id = d.to_initiative_id AND b.state <> 'closed'
      JOIN executive.plans pl ON pl.plan_id = d.plan_id AND pl.state <> 'closed'
      JOIN LATERAL (SELECT max(m.due_date) AS last_due FROM executive.milestones m WHERE m.initiative_id = d.from_initiative_id AND m.state <> 'cancelled') ma ON ma.last_due IS NOT NULL
      JOIN LATERAL (SELECT min(m.due_date) AS first_due FROM executive.milestones m WHERE m.initiative_id = d.to_initiative_id AND m.state <> 'cancelled') mb ON mb.first_due IS NOT NULL
     WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.kind = 'finish_to_start' AND d.state = 'active' AND ma.last_due > mb.first_due
    UNION ALL
    -- BUDGET OVER AUTHORITY: the funded sum above the ceiling (the continuity rule's standing check)
    SELECT pl.plan_id, NULL::uuid, 'budget_over_authority', format('funded %s > authority %s', f.funded::text, pl.budget_authority::text),
           format('the funded shares of plan "%s" sum to %s %s, above the authority ceiling of %s %s', pl.title, f.funded::text, pl.budget_currency, pl.budget_authority::text, pl.budget_currency),
           jsonb_build_object('funded', f.funded, 'authority', pl.budget_authority, 'over_by', f.funded - pl.budget_authority, 'currency', pl.budget_currency,
                              'initiatives', (SELECT coalesce(jsonb_agg(jsonb_build_object('initiative_id', i.initiative_id, 'title', i.title, 'funded_amount', i.funded_amount, 'state', i.state) ORDER BY i.priority NULLS LAST), '[]'::jsonb) FROM executive.initiatives i WHERE i.plan_id = pl.plan_id AND i.state IN ('funded', 'approved')))
      FROM executive.plans pl JOIN LATERAL (SELECT executive._funded_sum(pl.plan_id) AS funded) f ON true
     WHERE pl.tenant_id = p_tenant AND pl.domain_id = p_domain AND pl.state <> 'closed' AND f.funded > pl.budget_authority
    UNION ALL
    -- CONFLICTING DEPENDENCIES: two live initiatives of the plan declared in conflict in the Strategy Graph (an active conflicts_with alignment)
    SELECT a.plan_id, a.initiative_id, 'conflicting_dependencies', al.alignment_id::text,
           format('initiatives "%s" and "%s" of the plan are in conflict (alignment %s: %s)', a.title, b.title, al.alignment_id, al.rationale),
           jsonb_build_object('alignment_id', al.alignment_id, 'initiatives', jsonb_build_array(a.initiative_id, b.initiative_id), 'funded', coalesce(a.funded_amount, 0) + coalesce(b.funded_amount, 0))
      FROM graph.alignments al
      JOIN executive.initiatives a ON a.initiative_id = al.from_id AND a.state <> 'closed'
      JOIN executive.initiatives b ON b.initiative_id = al.to_id AND b.state <> 'closed' AND b.plan_id = a.plan_id
      JOIN executive.plans pl ON pl.plan_id = a.plan_id AND pl.state <> 'closed'
     WHERE al.tenant_id = p_tenant AND al.domain_id = p_domain AND al.kind = 'conflicts_with' AND al.state = 'active'
    UNION ALL
    -- DRIFT WITHOUT REVIEW: a baselined plan with no review inside its cadence window
    SELECT pl.plan_id, NULL::uuid, 'drift_without_review', format('since %s', coalesce(pl.last_reviewed_at, pl.updated_at)::text),
           format('plan "%s" was last reviewed %s; its review cadence is %s day(s)', pl.title, coalesce(pl.last_reviewed_at, pl.updated_at), pl.review_cadence_days),
           jsonb_build_object('last_reviewed_at', pl.last_reviewed_at, 'review_cadence_days', pl.review_cadence_days, 'overdue_days', extract(epoch FROM (v_now - coalesce(pl.last_reviewed_at, pl.updated_at))) / 86400 - pl.review_cadence_days)
      FROM executive.plans pl
     WHERE pl.tenant_id = p_tenant AND pl.domain_id = p_domain AND pl.state = 'baselined' AND coalesce(pl.last_reviewed_at, pl.updated_at) < v_now - make_interval(days => pl.review_cadence_days)
  ) cz (plan_id, initiative_id, kind, cause_key, detail, impact);
  -- resolve what no longer holds
  FOR rb IN SELECT x.breach_id, x.plan_id, x.kind, x.cause_key FROM executive.plan_breaches x
            WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state <> 'resolved'
              AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_causes) c2 WHERE (c2 ->> 'plan_id')::uuid = x.plan_id AND c2 ->> 'kind' = x.kind AND c2 ->> 'cause_key' = x.cause_key) LOOP
    UPDATE executive.plan_breaches SET state = 'resolved', resolved_at = v_now, resolved_by = p_actor, resolution = format('the condition no longer held at %s (the attention tick step plan-variance)', v_now) WHERE breach_id = rb.breach_id;
    PERFORM executive._plan_event(rb.plan_id, p_tenant, p_domain, 'breach', rb.breach_id, 'breach.resolved', p_actor, jsonb_build_object('kind', rb.kind, 'cause_key', rb.cause_key), p_correlation);
    v_resolved := v_resolved || jsonb_build_object('breach_id', rb.breach_id, 'kind', rb.kind, 'plan_id', rb.plan_id);
  END LOOP;
  -- open what holds and is not yet open
  FOR rb IN SELECT * FROM jsonb_to_recordset(v_causes) AS z (plan_id uuid, initiative_id uuid, kind text, cause_key text, detail text, impact jsonb) LOOP
    IF EXISTS (SELECT 1 FROM executive.plan_breaches x WHERE x.plan_id = rb.plan_id AND x.kind = rb.kind AND x.cause_key = rb.cause_key AND x.state <> 'resolved') THEN CONTINUE; END IF;
    v_id := executive._open_breach(rb.plan_id, p_tenant, p_domain, rb.initiative_id, rb.kind, rb.cause_key, rb.detail, rb.impact, p_actor, p_correlation);
    v_opened := v_opened || jsonb_build_object('breach_id', v_id, 'kind', rb.kind, 'plan_id', rb.plan_id, 'initiative_id', rb.initiative_id, 'cause_key', rb.cause_key);
  END LOOP;
  RETURN jsonb_build_object('raised_at', v_now, 'variances', v_raised, 'variance_count', jsonb_array_length(v_raised), 'breaches_opened', v_opened, 'breaches_resolved', v_resolved, 'policy_version', pol.version);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.detect_plan_variance(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.detect_plan_variance(uuid, uuid, uuid, uuid) TO eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §P8 THE READS (invokers, under the caller's RLS): the workspace, the REPLAY, the SCENARIO SENSITIVITY
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION executive.plan_view(p_plan uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = executive, graph, simulation, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN pl.plan_id IS NULL THEN NULL ELSE
    (to_jsonb(pl) - 'scope') || jsonb_build_object(
      'at', clock_timestamp(),
      'funded', executive._funded_sum(pl.plan_id),
      'objectives', (SELECT coalesce(jsonb_agg(jsonb_build_object('objective_id', s.strategy_object_id, 'title', s.title, 'status', s.status, 'owner', s.owner_principal_id) ORDER BY s.title), '[]'::jsonb)
                       FROM graph.strategy_current s WHERE s.strategy_object_id = ANY (pl.objective_ids)),
      'initiatives', (SELECT coalesce(jsonb_agg((to_jsonb(i) - 'scope') || jsonb_build_object(
                          'graph_status', s.status, 'graph_version', s.object_version,
                          'objectives', (SELECT coalesce(jsonb_agg(jsonb_build_object('objective_id', io.objective_id, 'title', so.title, 'status', so.status) ORDER BY so.title), '[]'::jsonb)
                                           FROM executive.initiative_objectives io JOIN graph.strategy_current so ON so.strategy_object_id = io.objective_id WHERE io.initiative_id = i.initiative_id),
                          'transitions', (SELECT coalesce(jsonb_agg(jsonb_build_object('transition', t.transition, 'from', t.from_state, 'to', t.to_state, 'actor', t.actor_principal_id, 'actor_kind', t.actor_kind, 'reason', t.reason, 'at', t.occurred_at, 'details', t.details) ORDER BY t.occurred_at), '[]'::jsonb)
                                            FROM executive.initiative_transitions t WHERE t.initiative_id = i.initiative_id),
                          'milestones', (SELECT coalesce(jsonb_agg((to_jsonb(m) - 'scope') || jsonb_build_object('measure_title', sm.title, 'unit', g.unit, 'direction', g.direction) ORDER BY m.due_date, m.name), '[]'::jsonb)
                                           FROM executive.milestones m JOIN graph.measures g ON g.measure_id = m.measure_id JOIN graph.strategy_current sm ON sm.strategy_object_id = m.measure_id WHERE m.initiative_id = i.initiative_id))
                        ORDER BY i.priority NULLS LAST, i.proposed_at), '[]'::jsonb)
                        FROM executive.initiatives i JOIN graph.strategy_current s ON s.strategy_object_id = i.initiative_id WHERE i.plan_id = pl.plan_id),
      'dependencies', (SELECT coalesce(jsonb_agg((to_jsonb(d) - 'scope') || jsonb_build_object('from_title', a.title, 'to_title', b.title) ORDER BY d.declared_at), '[]'::jsonb)
                         FROM executive.initiative_dependencies d JOIN executive.initiatives a ON a.initiative_id = d.from_initiative_id JOIN executive.initiatives b ON b.initiative_id = d.to_initiative_id WHERE d.plan_id = pl.plan_id AND d.state = 'active'),
      'measures', (SELECT coalesce(jsonb_agg(jsonb_build_object('measure_id', pm.measure_id, 'quantity_key', pm.quantity_key, 'title', sm.title, 'objective_id', g.objective_id, 'unit', g.unit, 'direction', g.direction,
                                                                'target_value', g.target_value, 'target_date', g.target_date, 'definition_version', g.definition_version, 'approval_state', g.approval_state,
                                                                'last_value', lo.value, 'last_observed_at', lo.observed_at, 'bound_at', pm.bound_at) ORDER BY sm.title), '[]'::jsonb)
                     FROM executive.plan_measures pm JOIN graph.measures g ON g.measure_id = pm.measure_id JOIN graph.strategy_current sm ON sm.strategy_object_id = pm.measure_id
                     LEFT JOIN LATERAL (SELECT o.value, o.observed_at FROM graph.measure_observations o WHERE o.measure_id = pm.measure_id ORDER BY o.observed_at DESC, o.recorded_at DESC LIMIT 1) lo ON true
                    WHERE pm.plan_id = pl.plan_id),
      'runs', (SELECT coalesce(jsonb_agg(jsonb_build_object('run_id', pr.run_id, 'model_ref', r.model_ref, 'outputs_digest', r.outputs_digest, 'scenario_id', r.scenario_id, 'component', r.component, 'completed_at', r.completed_at, 'attached_at', pr.attached_at) ORDER BY pr.attached_at DESC), '[]'::jsonb)
                 FROM executive.plan_runs pr JOIN simulation.runs_current r ON r.run_id = pr.run_id WHERE pr.plan_id = pl.plan_id),
      'versions', (SELECT coalesce(jsonb_agg(jsonb_build_object('version_id', v.version_id, 'version', v.version, 'digest', v.digest, 'note', v.note, 'baselined_by', v.baselined_by, 'baselined_at', v.baselined_at,
                                                                'signatures', executive.signature_of('plan_baseline', v.plan_id, v.version)) ORDER BY v.version), '[]'::jsonb)
                     FROM executive.plan_versions v WHERE v.plan_id = pl.plan_id),
      'variances', (SELECT coalesce(jsonb_agg((to_jsonb(v) - 'scope') || jsonb_build_object('milestone', m.name, 'initiative_title', i.title) ORDER BY v.raised_at DESC), '[]'::jsonb)
                      FROM executive.plan_variances v JOIN executive.milestones m ON m.milestone_id = v.milestone_id JOIN executive.initiatives i ON i.initiative_id = v.initiative_id WHERE v.plan_id = pl.plan_id),
      'breaches', (SELECT coalesce(jsonb_agg((to_jsonb(b) - 'scope') ORDER BY (b.state = 'resolved'), b.opened_at DESC), '[]'::jsonb) FROM executive.plan_breaches b WHERE b.plan_id = pl.plan_id),
      'events', (SELECT coalesce(jsonb_agg(jsonb_build_object('event', e.event, 'subject_kind', e.subject_kind, 'subject_id', e.subject_id, 'actor', e.actor_principal_id, 'at', e.occurred_at, 'details', e.details) ORDER BY e.occurred_at DESC), '[]'::jsonb)
                   FROM (SELECT * FROM executive.plan_events x WHERE x.plan_id = pl.plan_id ORDER BY x.occurred_at DESC LIMIT 200) e))
  END
  FROM (SELECT p_plan AS id) k LEFT JOIN executive.plans pl ON pl.plan_id = k.id
$$;
GRANT EXECUTE ON FUNCTION executive.plan_view(uuid) TO eye_app, eye_commit;

/* THE REPLAY: the plan as it stood at an instant — the versions baselined by then, each initiative's state from its transitions by then,
   the milestones, measures, dependencies, variances and breaches recorded by then. A plan declared after the instant answers `exists false`. */
CREATE OR REPLACE FUNCTION executive.plan_as_of(p_plan uuid, p_at timestamptz) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = executive, graph, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN pl.plan_id IS NULL THEN NULL WHEN pl.declared_at > p_at THEN jsonb_build_object('plan_id', p_plan, 'as_of', p_at, 'exists', false, 'declared_at', pl.declared_at) ELSE
    jsonb_build_object(
      'plan_id', pl.plan_id, 'as_of', p_at, 'exists', true, 'title', pl.title, 'horizon', pl.horizon, 'objectives', to_jsonb(pl.objective_ids), 'currency', pl.budget_currency, 'budget_total', pl.budget_total,
      'budget_authority', coalesce((SELECT (e.details ->> 'to')::numeric FROM executive.plan_events e WHERE e.plan_id = pl.plan_id AND e.event = 'plan.authority_set' AND e.occurred_at <= p_at ORDER BY e.occurred_at DESC LIMIT 1),
                                   (SELECT (e.details ->> 'budget_authority')::numeric FROM executive.plan_events e WHERE e.plan_id = pl.plan_id AND e.event = 'plan.declared' LIMIT 1), pl.budget_authority),
      'versions', (SELECT coalesce(jsonb_agg(jsonb_build_object('version_id', v.version_id, 'version', v.version, 'digest', v.digest, 'baselined_by', v.baselined_by, 'baselined_at', v.baselined_at, 'snapshot', v.snapshot,
                                                                'signatures', executive.signature_of('plan_baseline', v.plan_id, v.version)) ORDER BY v.version), '[]'::jsonb)
                     FROM executive.plan_versions v WHERE v.plan_id = pl.plan_id AND v.baselined_at <= p_at),
      'current_version', coalesce((SELECT max(v.version) FROM executive.plan_versions v WHERE v.plan_id = pl.plan_id AND v.baselined_at <= p_at), 0),
      'state', CASE WHEN EXISTS (SELECT 1 FROM executive.plan_versions v WHERE v.plan_id = pl.plan_id AND v.baselined_at <= p_at) THEN 'baselined' ELSE 'open' END,
      'initiatives', (SELECT coalesce(jsonb_agg(jsonb_build_object('initiative_id', i.initiative_id, 'title', i.title, 'objective_id', i.objective_id, 'sponsor', i.sponsor_principal_id, 'owner', i.owner_principal_id,
                                                                   'state', t.to_state, 'as_of_transition', t.transition, 'transition_at', t.occurred_at, 'actor', t.actor_principal_id, 'actor_kind', t.actor_kind,
                                                                   'funded_amount', (SELECT (x.details ->> 'funded_amount')::numeric FROM executive.initiative_transitions x WHERE x.initiative_id = i.initiative_id AND x.transition = 'fund' AND x.occurred_at <= p_at ORDER BY x.occurred_at DESC LIMIT 1),
                                                                   'priority', (SELECT (x.details ->> 'priority')::int FROM executive.initiative_transitions x WHERE x.initiative_id = i.initiative_id AND x.transition = 'prioritise' AND x.occurred_at <= p_at ORDER BY x.occurred_at DESC LIMIT 1),
                                                                   'transitions', (SELECT coalesce(jsonb_agg(jsonb_build_object('transition', x.transition, 'from', x.from_state, 'to', x.to_state, 'actor', x.actor_principal_id, 'actor_kind', x.actor_kind, 'reason', x.reason, 'at', x.occurred_at) ORDER BY x.occurred_at), '[]'::jsonb)
                                                                                     FROM executive.initiative_transitions x WHERE x.initiative_id = i.initiative_id AND x.occurred_at <= p_at))
                                                ORDER BY i.proposed_at), '[]'::jsonb)
                        FROM executive.initiatives i
                        JOIN LATERAL (SELECT x.to_state, x.transition, x.occurred_at, x.actor_principal_id, x.actor_kind FROM executive.initiative_transitions x WHERE x.initiative_id = i.initiative_id AND x.occurred_at <= p_at ORDER BY x.occurred_at DESC LIMIT 1) t ON true
                       WHERE i.plan_id = pl.plan_id AND i.proposed_at <= p_at),
      'milestones', (SELECT coalesce(jsonb_agg(jsonb_build_object('milestone_id', m.milestone_id, 'initiative_id', m.initiative_id, 'name', m.name, 'due_date', m.due_date, 'measure_id', m.measure_id, 'target_value', m.target_value,
                                                                  'state', coalesce((SELECT e.details ->> 'state' FROM executive.plan_events e WHERE e.subject_kind = 'milestone' AND e.subject_id = m.milestone_id AND e.event = 'milestone.state_changed' AND e.occurred_at <= p_at ORDER BY e.occurred_at DESC LIMIT 1),
                                                                                    CASE WHEN EXISTS (SELECT 1 FROM executive.plan_variances v WHERE v.milestone_id = m.milestone_id AND v.raised_at <= p_at AND v.basis_kind = 'observation') THEN 'missed'
                                                                                         WHEN EXISTS (SELECT 1 FROM executive.plan_variances v WHERE v.milestone_id = m.milestone_id AND v.raised_at <= p_at) THEN 'at_risk' ELSE 'planned' END)) ORDER BY m.due_date), '[]'::jsonb)
                       FROM executive.milestones m WHERE m.plan_id = pl.plan_id AND m.declared_at <= p_at),
      'measures', (SELECT coalesce(jsonb_agg(jsonb_build_object('measure_id', pm.measure_id, 'quantity_key', pm.quantity_key, 'bound_at', pm.bound_at) ORDER BY pm.bound_at), '[]'::jsonb) FROM executive.plan_measures pm WHERE pm.plan_id = pl.plan_id AND pm.bound_at <= p_at),
      'dependencies', (SELECT coalesce(jsonb_agg(jsonb_build_object('dependency_id', d.dependency_id, 'from', d.from_initiative_id, 'to', d.to_initiative_id, 'kind', d.kind, 'state', CASE WHEN d.retired_at IS NOT NULL AND d.retired_at <= p_at THEN 'retired' ELSE 'active' END) ORDER BY d.declared_at), '[]'::jsonb)
                         FROM executive.initiative_dependencies d WHERE d.plan_id = pl.plan_id AND d.declared_at <= p_at),
      'variances', (SELECT coalesce(jsonb_agg((to_jsonb(v) - 'scope') ORDER BY v.raised_at), '[]'::jsonb) FROM executive.plan_variances v WHERE v.plan_id = pl.plan_id AND v.raised_at <= p_at),
      'breaches', (SELECT coalesce(jsonb_agg(jsonb_build_object('breach_id', b.breach_id, 'kind', b.kind, 'cause_key', b.cause_key, 'detail', b.detail, 'opened_at', b.opened_at,
                                                                'state', CASE WHEN b.resolved_at IS NOT NULL AND b.resolved_at <= p_at THEN 'resolved' WHEN b.acknowledged_at IS NOT NULL AND b.acknowledged_at <= p_at THEN 'acknowledged' ELSE 'open' END) ORDER BY b.opened_at), '[]'::jsonb)
                     FROM executive.plan_breaches b WHERE b.plan_id = pl.plan_id AND b.opened_at <= p_at),
      'events', (SELECT coalesce(jsonb_agg(jsonb_build_object('event', e.event, 'subject_kind', e.subject_kind, 'subject_id', e.subject_id, 'actor', e.actor_principal_id, 'at', e.occurred_at) ORDER BY e.occurred_at), '[]'::jsonb)
                   FROM executive.plan_events e WHERE e.plan_id = pl.plan_id AND e.occurred_at <= p_at))
  END
  FROM (SELECT p_plan AS id) k LEFT JOIN executive.plans pl ON pl.plan_id = k.id
$$;
GRANT EXECUTE ON FUNCTION executive.plan_as_of(uuid, timestamptz) TO eye_app, eye_commit;

/* THE SCENARIO SENSITIVITY: a run's output quantities (its series by the plan measures' keys) applied to the plan's milestones — each at
   risk or on track under that scenario at its due date, the run's outputs digest named. A read; nothing is recorded. */
CREATE OR REPLACE FUNCTION executive.plan_sensitivity(p_plan uuid, p_run uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = executive, graph, simulation, pg_catalog, pg_temp AS $$
  SELECT CASE WHEN pl.plan_id IS NULL THEN jsonb_build_object('available', false, 'reason', 'no such plan in this domain')
              WHEN r.run_id IS NULL THEN jsonb_build_object('available', false, 'reason', 'no such completed run in this domain', 'plan_id', p_plan)
         ELSE jsonb_build_object(
    'available', true, 'plan_id', pl.plan_id, 'plan_title', pl.title, 'run_id', r.run_id, 'model_ref', r.model_ref, 'outputs_digest', r.outputs_digest, 'scenario_id', r.scenario_id, 'component', r.component,
    'run_completed_at', r.completed_at, 'at', clock_timestamp(),
    'attached', EXISTS (SELECT 1 FROM executive.plan_runs pr WHERE pr.plan_id = pl.plan_id AND pr.run_id = r.run_id),
    'milestones', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'milestone_id', m.milestone_id, 'name', m.name, 'initiative_id', m.initiative_id, 'initiative_title', i.title, 'due_date', m.due_date, 'measure_id', m.measure_id, 'measure_title', sm.title,
        'target_value', m.target_value, 'unit', g.unit, 'direction', g.direction, 'quantity_key', pm.quantity_key,
        'value', q.q ->> 'value', 'value_date', q.q ->> 'date',
        'status', CASE WHEN pm.quantity_key IS NULL THEN 'unmapped' WHEN q.q IS NULL THEN 'no_value'
                       WHEN (g.direction = 'higher_better' AND (q.q ->> 'value')::numeric < m.target_value) OR (g.direction = 'lower_better' AND (q.q ->> 'value')::numeric > m.target_value) THEN 'at_risk' ELSE 'on_track' END,
        'variance', CASE WHEN q.q IS NULL THEN NULL WHEN g.direction = 'higher_better' THEN (q.q ->> 'value')::numeric - m.target_value ELSE m.target_value - (q.q ->> 'value')::numeric END)
      ORDER BY m.due_date, m.name), '[]'::jsonb)
      FROM executive.milestones m
      JOIN executive.initiatives i ON i.initiative_id = m.initiative_id
      JOIN graph.measures g ON g.measure_id = m.measure_id
      JOIN graph.strategy_current sm ON sm.strategy_object_id = m.measure_id
      LEFT JOIN executive.plan_measures pm ON pm.plan_id = m.plan_id AND pm.measure_id = m.measure_id
      LEFT JOIN LATERAL (SELECT CASE WHEN pm.quantity_key IS NULL THEN NULL ELSE executive.run_quantity_at(r.outputs, pm.quantity_key, m.due_date) END AS q) q ON true
     WHERE m.plan_id = pl.plan_id AND m.state <> 'cancelled' AND i.state <> 'closed'))
  END
  FROM (SELECT p_plan AS id) k LEFT JOIN executive.plans pl ON pl.plan_id = k.id
  LEFT JOIN simulation.runs_current r ON r.run_id = p_run AND r.tenant_id = pl.tenant_id AND r.domain_id = pl.domain_id AND r.state = 'completed' AND r.outputs IS NOT NULL
$$;
GRANT EXECUTE ON FUNCTION executive.plan_sensitivity(uuid, uuid) TO eye_app, eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §P9 RLS (the 0081 loop idiom) AND GRANTS
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['plans', 'plan_versions', 'initiatives', 'initiative_transitions', 'milestones', 'initiative_dependencies', 'plan_variances', 'plan_breaches', 'plan_events'] LOOP
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
  -- the link tables carry no tenant column: they are reached through their parents' rows (RLS on the parent; the ports write them)
  FOREACH t IN ARRAY ARRAY['initiative_objectives', 'plan_measures', 'plan_runs'] LOOP
    EXECUTE format('REVOKE ALL ON executive.%I FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE executive.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE executive.%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
  CREATE POLICY executive_isolation ON executive.initiative_objectives USING (EXISTS (SELECT 1 FROM executive.initiatives i WHERE i.initiative_id = initiative_objectives.initiative_id));
  CREATE POLICY executive_isolation ON executive.plan_measures USING (EXISTS (SELECT 1 FROM executive.plans p WHERE p.plan_id = plan_measures.plan_id));
  CREATE POLICY executive_isolation ON executive.plan_runs USING (EXISTS (SELECT 1 FROM executive.plans p WHERE p.plan_id = plan_runs.plan_id));
  GRANT SELECT ON executive.initiative_objectives, executive.plan_measures, executive.plan_runs TO eye_app, eye_commit;
END $$;

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- section `publishing` (§D) — the part-local file 0094_b36_x_publishing.sql, combined here at integration in the apply order every fresh-database run used
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
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
  recipient_principal_id uuid,
  external_recipient     text CHECK (external_recipient IS NULL OR external_recipient ~ '^external:(partner|regulator|press|other):.{2,200}$'),
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
  CONSTRAINT xpd_recipient CHECK ((recipient_principal_id IS NULL) <> (external_recipient IS NULL)),
  CONSTRAINT xpd_ack_bound CHECK ((acknowledged_at IS NULL) = (acknowledged_by IS NULL)),
  CONSTRAINT xpd_state_bound CHECK ((state = 'delivered') = (receipt IS NOT NULL) AND (state = 'failed') = (error IS NOT NULL))
);
/* One PLACED delivery per (version, recipient, channel, kind); a failed attempt stays as its own row and may be retried. */
CREATE UNIQUE INDEX xpd_once ON executive.publication_deliveries (publication_id, version, coalesce(recipient_principal_id::text, external_recipient), channel, kind) WHERE state = 'delivered';
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
    IF EXISTS (SELECT 1 FROM executive.publication_deliveries d WHERE d.publication_id = p_publication_id AND d.version = p_version AND d.recipient_principal_id = (r ->> 'principal_id')::uuid AND d.channel = 'in_app' AND d.kind = 'publication' AND d.state = 'delivered') THEN CONTINUE; END IF;
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
                            'external', p.external, 'external_recipient', CASE WHEN p.external IS NULL THEN NULL ELSE 'external:' || (p.external ->> 'kind') || ':' || btrim(p.external ->> 'name') END,
                            'title', p.title, 'bytes_digest', v.bytes_digest, 'format', v.format, 'event_id', v_ev);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.deliver_publication(uuid,uuid,uuid,int,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.deliver_publication(uuid,uuid,uuid,int,uuid,uuid) TO eye_commit;

/* The per-recipient record of a synthetic channel's answer (email / teams to the local sinks — the B34 adapters), for the publication, a
   correction notice or a withdrawal notice; under the delivering, correcting or withdrawing action. Idempotent on the (version, recipient,
   channel, kind) key: a repeated attempt answers the row it made. */
CREATE OR REPLACE FUNCTION executive.record_publication_delivery(
  p_delivery_id uuid, p_tenant uuid, p_domain uuid, p_publication_id uuid, p_version int, p_recipient uuid, p_external text, p_channel text, p_kind text, p_state text,
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
  IF (p_recipient IS NULL) = (p_external IS NULL) THEN RAISE EXCEPTION 'publication rejected (delivery): a delivery names its recipient principal or its external audience' USING ERRCODE = '22023'; END IF;
  SELECT * INTO d FROM executive.publication_deliveries x WHERE x.publication_id = p_publication_id AND x.version = p_version AND x.recipient_principal_id IS NOT DISTINCT FROM p_recipient AND x.external_recipient IS NOT DISTINCT FROM p_external AND x.channel = p_channel AND x.kind = p_kind AND x.state = 'delivered';
  IF FOUND THEN RETURN jsonb_build_object('delivery_id', d.delivery_id, 'repeated', true, 'state', d.state, 'receipt_id', d.receipt_id); END IF;
  INSERT INTO executive.publication_deliveries (delivery_id, scope, tenant_id, domain_id, publication_id, version, recipient_principal_id, external_recipient, channel, kind, state, receipt_id, receipt, provider_ref, error, synthetic_state, delivered_by, correlation_id)
  VALUES (p_delivery_id, 'DOMAIN', p_tenant, p_domain, p_publication_id, p_version, p_recipient, p_external, p_channel, p_kind, p_state, gen_random_uuid(), CASE WHEN p_state = 'delivered' THEN coalesce(p_receipt, '{}'::jsonb) END, p_provider_ref, CASE WHEN p_state = 'failed' THEN coalesce(p_error, 'failed') END, p_synthetic, p_actor, p_correlation);
  PERFORM executive.publication_event(gen_random_uuid(), p_publication_id, p_version, p_tenant, p_domain, CASE WHEN p_state = 'delivered' THEN 'publication.delivered' ELSE 'publication.delivery_failed' END, p_actor,
            jsonb_build_object('delivery_id', p_delivery_id, 'recipient', p_recipient, 'external_recipient', p_external, 'channel', p_channel, 'kind', p_kind, 'provider_ref', p_provider_ref, 'error', p_error, 'synthetic', p_synthetic), p_correlation);
  RETURN jsonb_build_object('delivery_id', p_delivery_id, 'repeated', false, 'state', p_state, 'receipt_id', (SELECT receipt_id FROM executive.publication_deliveries WHERE delivery_id = p_delivery_id));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.record_publication_delivery(uuid,uuid,uuid,uuid,int,uuid,text,text,text,text,jsonb,text,text,boolean,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.record_publication_delivery(uuid,uuid,uuid,uuid,int,uuid,text,text,text,text,jsonb,text,text,boolean,uuid,uuid) TO eye_commit;

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
  IF d.recipient_principal_id IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'publication rejected (not_recipient): a delivery is acknowledged by its recipient (an external audience''s synthetic delivery has none)' USING ERRCODE = '42501'; END IF;
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
  FOR r IN SELECT DISTINCT d.recipient_principal_id FROM executive.publication_deliveries d WHERE d.publication_id = p_publication_id AND d.version = p_version AND d.kind = 'publication' AND d.state = 'delivered' AND d.recipient_principal_id IS NOT NULL ORDER BY 1 LOOP
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
  p_publication_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_source_id uuid, p_source_version int, p_source_digest text, p_bytes_digest text, p_byte_length int, p_vault_ref text, p_render_method text, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, objects, observation, decision, ctx, public, pg_catalog, pg_temp AS $$
DECLARE p executive.publications%ROWTYPE; v executive.publication_versions%ROWTYPE; s jsonb; v_next int; v_changed jsonb; v_ev uuid; v_notified jsonb; v_draft uuid; v_src uuid;
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
  -- the corrected snapshot: a briefing publication may bind a NEW EDITION (another briefing id); a report publication stays on its package (another version of it)
  v_src := coalesce(p_source_id, v.source_id);
  IF v.source_kind = 'report' AND v_src <> v.source_id THEN RAISE EXCEPTION 'publication rejected (source): a report publication corrects to another version of the same package %, not to package %', v.source_id, v_src USING ERRCODE = '22023'; END IF;
  s := executive.publication_source(p_tenant, p_domain, v.source_kind, v_src, p_source_version);
  IF NOT (s ->> 'found')::boolean THEN RAISE EXCEPTION 'publication rejected (unknown_source): %', s ->> 'reason' USING ERRCODE = '23503'; END IF;
  IF (s ->> 'digest') IS DISTINCT FROM p_source_digest THEN RAISE EXCEPTION 'publication rejected (stale_source): the snapshot presented (%) is not the recorded % (%)', left(p_source_digest, 16), s ->> 'object_type', left(s ->> 'digest', 16) USING ERRCODE = '22023'; END IF;
  IF decision.classification_rank(p.classification) < decision.classification_rank(s #>> '{controls,classification}') THEN
    RAISE EXCEPTION 'publication rejected (classification): the corrected snapshot is classified %; the publication is %', s #>> '{controls,classification}', p.classification USING ERRCODE = '22023';
  END IF;
  IF p_bytes_digest IS NULL OR p_bytes_digest !~ '^[0-9a-f]{64}$' OR coalesce(p_byte_length, 0) <= 0 OR p_vault_ref IS NULL OR p_vault_ref !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.bin$' OR split_part(p_vault_ref, '/', 1) <> p_publication_id::text THEN
    RAISE EXCEPTION 'publication rejected (bytes): the rendered bytes are named by their sha256, their length and their vault reference under the publication''s own export directory' USING ERRCODE = '22023';
  END IF;
  IF p_source_digest = v.source_digest THEN RAISE EXCEPTION 'publication rejected (unchanged): the correction binds the same snapshot (%) as version %; a correction binds a new edition or a new package version', left(v.source_digest, 16), v.version USING ERRCODE = '22023'; END IF;
  v_next := v.version + 1;
  v_changed := jsonb_build_object('prior_version', v.version, 'prior_bytes_digest', v.bytes_digest, 'bytes_digest', p_bytes_digest, 'prior_source_digest', v.source_digest, 'source_digest', p_source_digest, 'prior_source_id', v.source_id, 'source_id', v_src,
                                  'prior_source_version', v.source_version, 'source_version', p_source_version, 'bytes_changed', p_bytes_digest <> v.bytes_digest, 'snapshot_changed', true, 'reason', btrim(p_reason));
  INSERT INTO executive.publication_versions (publication_id, version, scope, tenant_id, domain_id, source_kind, source_id, source_version, source_digest, format, bytes_digest, byte_length, vault_ref, render_method, state, drafted_by, correction_of, correction_reason, changed, correlation_id)
  VALUES (p_publication_id, v_next, 'DOMAIN', p_tenant, p_domain, v.source_kind, v_src, p_source_version, p_source_digest, p.format, p_bytes_digest, p_byte_length, p_vault_ref, p_render_method, 'drafted', p_actor, v.version, btrim(p_reason), v_changed, p_correlation);
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
REVOKE ALL ON FUNCTION executive.correct_publication(uuid,uuid,uuid,text,uuid,int,text,text,int,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.correct_publication(uuid,uuid,uuid,text,uuid,int,text,text,int,text,text,uuid,uuid) TO eye_commit;

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
   source carries a residency profile and the publication is addressed OUTSIDE the tenant (its bytes stay where the vault is; an internal
   publication's export to the tenant's own export namespace stays in residency, the profile carried); the class names are the export path's gates. */
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
  -- the RESIDENCY gate: the export namespace is the tenant's own vault, inside the source's residency; an EXTERNAL publication (addressed outside
  -- the tenant) of a residency-bound source would carry the bytes out of it — refused; an internal one is exported with the profile carried
  IF (v_controls #>> '{controls,residency_profile}') IS NOT NULL AND p.external IS NOT NULL THEN
    RAISE EXCEPTION 'publication rejected (residency): the source carries the residency profile % and this publication is addressed outside the tenant (%: %); its bytes stay in the vault''s residency — the archive stands, nothing leaves', v_controls #>> '{controls,residency_profile}', p.external ->> 'kind', p.external ->> 'name' USING ERRCODE = '22023';
  END IF;
  v_ev := executive.publication_event(gen_random_uuid(), p_publication_id, p.current_version, p_tenant, p_domain, 'publication.exported', p_actor, jsonb_build_object('controls', v_controls -> 'controls', 'gates', jsonb_build_object('legal_hold', 'none active on the source''s evidence', 'residency', CASE WHEN (v_controls #>> '{controls,residency_profile}') IS NULL THEN 'no residency profile on the source' ELSE 'the export stays in the vault''s residency (' || (v_controls #>> '{controls,residency_profile}') || '); an external publication would be refused' END, 'classification', p.classification)), p_correlation);
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

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- section `strategy` (§S) — the part-local file 0094_b36_x_strategy.sql, combined here at integration in the apply order every fresh-database run used
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- section `strategy`
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0094 §S — CP-6 B36 part `strategy` (2026-09-30): THE SCORE AND THE STRATEGY GRAPH COMPLETED — F-P6-08 (f)(g)(h) and F-P6-09 (a)–(e).
-- Built on the §0 prelude (executive.record_signature / signature_of with the subject kind `health_snapshot`; executive.current_context;
-- the attention class `strategy.detection` and the subject kind `strategy_object`). Forward-only; 0089–0093 untouched; every
-- re-declaration below names the line it copies and carries ONE change.
--
--   §S1 THE HEALTH INPUT CONTRACT WITH OWNERS (f): executive.health_inputs — one row per component of a definition: the input's OWNER
--       (derived from the input's own object: the measure's MSR owner, the indicator's owner, the exposure's owner, the objective's
--       owner for the four new classes — never assigned by hand), the value the score last read or the owner last stated, its as-of and
--       digest; executive.health_input_edits (append-only: who, when, from → to, reason) written by executive.set_health_input — the
--       OWNER-CORRECTION route (the input's owner only: `health input rejected (ownership)`; a reason required). THE ANTI-GAMING MEASURE:
--       an owner edit inside the definition's policy window (owner_edit_window_days — the new column, set from the model's optional key)
--       BEFORE a favourable change of the component's dimension is FLAGGED on the change (health_score_changes.owner_edit_flag, the edit
--       ids) and counted per owner by executive.owner_edit_analysis (a read; it also feeds §S6's gamed_measure detection).
--   §S2 FOUR MORE SCORE INPUTS (g): the contract's kinds gain capability (the share of an objective's supporting capabilities an active
--       initiative builds), execution (the share of the objective's commitment items delivered by their due instant), outcome (the share
--       of recorded outcomes met on the decisions resting on it) and quality (the share of the objective's measures approved AND fresh);
--       executive.health_measure_inputs re-declared with the four branches unioned (0089 line 4494, ONE change).
--   §S3 EXCEPTIONS AS RECORDED OBJECTS (g): executive.health_exceptions — a component EXCLUDED or its freshness bound RELAXED for a
--       period, REQUESTED by a named human and APPROVED (or refused) by ANOTHER holding the executive's authority, with a reason and an
--       expiry; the score names the exceptions in force at its instant; an unapproved or expired exception has no effect.
--   §S4 THE SNAPSHOT APPROVAL (h): executive.health_snapshot_approvals — the executive's acceptance of a CURRENT snapshot on the digest
--       previewed (executive.preview_health_snapshot_approval: the digest, the consequence, the flags, the exceptions), SIGNED beyond the
--       audit chain (§0 record_signature, kind health_snapshot — the TypeScript signer under the same bound action).
--   §S5 THE COMPUTATION re-declared (0089 line 4266, ONE block): the owner-stated readings joined to the contract rows, the exceptions in
--       force applied to the model, the owner-edit flag on each favourable change, the input register refreshed.
--   §S6 REVOCABLE AUTHORITY ACTS (b): graph.strategy_authority_acts gains revoked_at / revoked_by / revocation_reason (a forward-only
--       trigger replaces the append-only one: the three fields set once, nothing else changes); graph.revoke_authority_act (the act's
--       issuer or a domain administrator; a reason; a lapsed act is not revoked — 409); every read that judges an act "in force" —
--       graph.measure_freshness (line 2853), graph.strategy_detections (line 3010), graph.alignment_gaps (line 3116) — re-declared with
--       ONE change: the revocation predicate beside each `recorded_at <= p_at`; graph.record_strategy_authority_act (line 2883) with ONE
--       change: a revoked act is no duplicate.
--   §S7 THE DETECTIONS RAISED ON A SCHEDULE (c): graph.strategy_detections (the TABLE; the 0089 read of the same name keeps its "as of
--       this read" role) — stale_measure, gamed_measure, lost_linkage, owner_missing, each ONCE per (kind, subject, cause) and ROUTED by
--       the same call as an attention item of class strategy.detection to the object's owner under the active attention policy;
--       graph.raise_strategy_detections is the attention tick's step `strategy-detections` (order 50; executive.attention.tick).
--   §S8 THE PLAN LINKS (d): graph.strategy_plan_links — the initiatives Part P declares against an objective, read only when
--       executive.initiatives exists (to_regclass), never declared here.
--   §S9 RLS and the grants.
-- NOT HERE (stated): GraphChanged on alignment / measure / owner changes is the strategy routes' outbox event (the TypeScript, part
-- `strategy`: the change kinds strategy.alignment_changed / strategy.measure_changed / strategy.owner_changed); no SQL vocabulary lists
-- change kinds (a subscription filters on its own change_kinds list — 0063). Every figure the harness seeds is SYNTHETIC.

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §S1 THE HEALTH INPUT CONTRACT WITH OWNERS
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- executive.health_input_kinds re-declared (0089 line 3503, whole; ONE change: the four new classes)
CREATE OR REPLACE FUNCTION executive.health_input_kinds() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['indicator', 'measure', 'risk', 'opportunity', /* B36 (0094 §S2) */ 'capability', 'execution', 'outcome', 'quality'] $$;
GRANT EXECUTE ON FUNCTION executive.health_input_kinds() TO eye_app, eye_commit;

-- THE POLICY WINDOW of the anti-gaming measure: a parameter of the DEFINITION (the column), taken from the model's optional key
-- owner_edit_window_days at proposal (7 days when the model is silent) — so two people approve it with the rest of the model.
ALTER TABLE executive.health_score_definitions ADD COLUMN owner_edit_window_days numeric NOT NULL DEFAULT 7 CHECK (owner_edit_window_days > 0 AND owner_edit_window_days <= 366);
CREATE OR REPLACE FUNCTION executive.health_definition_window() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF jsonb_typeof(NEW.model -> 'owner_edit_window_days') = 'number' THEN NEW.owner_edit_window_days := (NEW.model ->> 'owner_edit_window_days')::numeric; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER xhsd_window BEFORE INSERT ON executive.health_score_definitions FOR EACH ROW EXECUTE FUNCTION executive.health_definition_window();
-- executive.validate_health_model re-declared (0089 lines 3568–3673, whole; ONE change: the optional top-level key owner_edit_window_days admitted and bounded (0, 366])
CREATE OR REPLACE FUNCTION executive.validate_health_model(p_model jsonb) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path = executive, pg_catalog, pg_temp AS $$
DECLARE d jsonb; c jsonb; b jsonb; k text; v_prev numeric; v_last numeric; v_sum numeric; v_dims text[] := '{}'; v_comps text[] := '{}'; v_inputs text[] := '{}';
        v_bkeys text[]; v_key text; v_n int; v_w numeric; v_worst numeric; v_best numeric;
BEGIN
  IF p_model IS NULL OR jsonb_typeof(p_model) <> 'object' THEN RAISE EXCEPTION 'health definition rejected: the model is an object {dimensions, components, min_coverage, change_points, min_confidence?}' USING ERRCODE = '22023'; END IF;
  FOR k IN SELECT jsonb_object_keys(p_model) LOOP
    IF k NOT IN ('dimensions', 'components', 'min_coverage', 'min_confidence', 'change_points', /* B36 (0094 §S1) */ 'owner_edit_window_days') THEN RAISE EXCEPTION 'health definition rejected: unknown key % (the model carries dimensions, components, min_coverage, change_points and optionally min_confidence and owner_edit_window_days)', k USING ERRCODE = '22023'; END IF;
  END LOOP;
  /* B36 (0094 §S1): the anti-gaming policy window, when the model states it */
  IF p_model ? 'owner_edit_window_days' AND (jsonb_typeof(p_model -> 'owner_edit_window_days') <> 'number' OR (p_model ->> 'owner_edit_window_days')::numeric <= 0 OR (p_model ->> 'owner_edit_window_days')::numeric > 366) THEN
    RAISE EXCEPTION 'health definition rejected: owner_edit_window_days is a number of days in (0, 366] — the window before a favourable change inside which an owner edit is flagged' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_model -> 'min_coverage') IS DISTINCT FROM 'number' OR (p_model ->> 'min_coverage')::numeric <= 0 OR (p_model ->> 'min_coverage')::numeric > 1 THEN
    RAISE EXCEPTION 'health definition rejected: min_coverage is a number in (0, 1] — the included weight below which a dimension is indeterminate' USING ERRCODE = '22023';
  END IF;
  IF p_model ? 'min_confidence' AND jsonb_typeof(p_model -> 'min_confidence') <> 'null'
     AND (jsonb_typeof(p_model -> 'min_confidence') <> 'number' OR (p_model ->> 'min_confidence')::numeric < 0 OR (p_model ->> 'min_confidence')::numeric > 1) THEN
    RAISE EXCEPTION 'health definition rejected: min_confidence is a number in [0, 1] or null' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_model -> 'change_points') IS DISTINCT FROM 'number' OR (p_model ->> 'change_points')::numeric <= 0 OR (p_model ->> 'change_points')::numeric > 100 THEN
    RAISE EXCEPTION 'health definition rejected: change_points is a number in (0, 100] — the move that raises a score change' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_model -> 'dimensions') IS DISTINCT FROM 'array' OR jsonb_array_length(p_model -> 'dimensions') NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'health definition rejected: dimensions is a list of 1 to 12 dimensions' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_model -> 'components') IS DISTINCT FROM 'array' OR jsonb_array_length(p_model -> 'components') NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'health definition rejected: components is a list of 1 to 60 components' USING ERRCODE = '22023';
  END IF;
  v_sum := 0;
  FOR d IN SELECT value FROM jsonb_array_elements(p_model -> 'dimensions') LOOP
    IF jsonb_typeof(d) <> 'object' THEN RAISE EXCEPTION 'health definition rejected: a dimension is an object {key, label, weight, objective_ids, bands}' USING ERRCODE = '22023'; END IF;
    FOR k IN SELECT jsonb_object_keys(d) LOOP
      IF k NOT IN ('key', 'label', 'weight', 'objective_ids', 'bands') THEN RAISE EXCEPTION 'health definition rejected: dimension % carries the unknown key %', coalesce(d ->> 'key', '?'), k USING ERRCODE = '22023'; END IF;
    END LOOP;
    v_key := d ->> 'key';
    IF jsonb_typeof(d -> 'key') IS DISTINCT FROM 'string' OR v_key !~ '^[a-z][a-z0-9_]{1,62}$' THEN RAISE EXCEPTION 'health definition rejected: a dimension key is lower_snake_case (2–63 characters)' USING ERRCODE = '22023'; END IF;
    IF v_key = ANY (v_dims) THEN RAISE EXCEPTION 'health definition rejected: dimension % is declared twice', v_key USING ERRCODE = '22023'; END IF;
    v_dims := v_dims || v_key;
    IF jsonb_typeof(d -> 'label') IS DISTINCT FROM 'string' OR length(btrim(d ->> 'label')) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'health definition rejected: dimension % label is 2–120 characters', v_key USING ERRCODE = '22023'; END IF;
    IF jsonb_typeof(d -> 'weight') IS DISTINCT FROM 'number' OR (d ->> 'weight')::numeric <= 0 OR (d ->> 'weight')::numeric > 1 THEN RAISE EXCEPTION 'health definition rejected: dimension % weight is a number in (0, 1]', v_key USING ERRCODE = '22023'; END IF;
    v_sum := v_sum + (d ->> 'weight')::numeric;
    IF jsonb_typeof(d -> 'objective_ids') IS DISTINCT FROM 'array' OR jsonb_array_length(d -> 'objective_ids') = 0
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(d -> 'objective_ids') o WHERE jsonb_typeof(o) <> 'string' OR (o #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
      RAISE EXCEPTION 'health definition rejected: dimension % objective_ids is a non-empty list of objective ids (every roll-up decomposes to objectives — V03-T-186)', v_key USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(d -> 'bands') IS DISTINCT FROM 'array' OR jsonb_array_length(d -> 'bands') NOT BETWEEN 1 AND 6 THEN RAISE EXCEPTION 'health definition rejected: dimension % bands is a list of 1 to 6 {key, min}, highest first, the last at 0', v_key USING ERRCODE = '22023'; END IF;
    v_prev := NULL; v_bkeys := '{}';
    FOR b IN SELECT value FROM jsonb_array_elements(d -> 'bands') LOOP
      IF jsonb_typeof(b) <> 'object' OR jsonb_typeof(b -> 'key') IS DISTINCT FROM 'string' OR (b ->> 'key') !~ '^[a-z][a-z0-9_]{1,30}$' OR jsonb_typeof(b -> 'min') IS DISTINCT FROM 'number'
         OR (SELECT count(*) FROM jsonb_object_keys(b)) <> 2 THEN
        RAISE EXCEPTION 'health definition rejected: dimension % band is {key, min} (a lower_snake_case key, a number)', v_key USING ERRCODE = '22023';
      END IF;
      IF (b ->> 'key') = ANY (v_bkeys) THEN RAISE EXCEPTION 'health definition rejected: dimension % band % is declared twice', v_key, b ->> 'key' USING ERRCODE = '22023'; END IF;
      v_bkeys := v_bkeys || (b ->> 'key');
      IF (b ->> 'min')::numeric < 0 OR (b ->> 'min')::numeric > 100 OR (v_prev IS NOT NULL AND (b ->> 'min')::numeric >= v_prev) THEN
        RAISE EXCEPTION 'health definition rejected: dimension % bands descend strictly in [0, 100] (highest first)', v_key USING ERRCODE = '22023';
      END IF;
      v_prev := (b ->> 'min')::numeric;
    END LOOP;
    IF v_prev <> 0 THEN RAISE EXCEPTION 'health definition rejected: dimension % last band starts at 0 (every value falls in a band)', v_key USING ERRCODE = '22023'; END IF;
  END LOOP;
  IF abs(v_sum - 1) > 0.0001 THEN RAISE EXCEPTION 'health definition rejected: the dimension weights sum to % — they sum to 1', v_sum USING ERRCODE = '22023'; END IF;
  FOR c IN SELECT value FROM jsonb_array_elements(p_model -> 'components') LOOP
    IF jsonb_typeof(c) <> 'object' THEN RAISE EXCEPTION 'health definition rejected: a component is an object' USING ERRCODE = '22023'; END IF;
    FOR k IN SELECT jsonb_object_keys(c) LOOP
      IF k NOT IN ('key', 'label', 'dimension', 'input_kind', 'input_id', 'weight', 'direction', 'normalisation', 'stale_after_days', 'critical', 'critical_below') THEN
        RAISE EXCEPTION 'health definition rejected: component % carries the unknown key %', coalesce(c ->> 'key', '?'), k USING ERRCODE = '22023';
      END IF;
    END LOOP;
    v_key := c ->> 'key';
    IF jsonb_typeof(c -> 'key') IS DISTINCT FROM 'string' OR v_key !~ '^[a-z][a-z0-9_]{1,62}$' THEN RAISE EXCEPTION 'health definition rejected: a component key is lower_snake_case (2–63 characters)' USING ERRCODE = '22023'; END IF;
    IF v_key = ANY (v_comps) THEN RAISE EXCEPTION 'health definition rejected: component % is declared twice', v_key USING ERRCODE = '22023'; END IF;
    v_comps := v_comps || v_key;
    IF jsonb_typeof(c -> 'label') IS DISTINCT FROM 'string' OR length(btrim(c ->> 'label')) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'health definition rejected: component % label is 2–120 characters', v_key USING ERRCODE = '22023'; END IF;
    IF jsonb_typeof(c -> 'dimension') IS DISTINCT FROM 'string' OR NOT ((c ->> 'dimension') = ANY (v_dims)) THEN RAISE EXCEPTION 'health definition rejected: component % names the dimension %, which the model does not declare', v_key, coalesce(c ->> 'dimension', 'none') USING ERRCODE = '22023'; END IF;
    IF jsonb_typeof(c -> 'input_kind') IS DISTINCT FROM 'string' OR NOT ((c ->> 'input_kind') = ANY (executive.health_input_kinds())) THEN
      RAISE EXCEPTION 'health definition rejected: component % input_kind is one of % (the contract''s kinds)', v_key, array_to_string(executive.health_input_kinds(), ', ') USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(c -> 'input_id') IS DISTINCT FROM 'string' OR (c ->> 'input_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'health definition rejected: component % input_id is the id of the contract input it reads', v_key USING ERRCODE = '22023'; END IF;
    IF (c ->> 'input_kind') || ':' || lower(c ->> 'input_id') = ANY (v_inputs) THEN
      RAISE EXCEPTION 'health definition rejected: component % reads % %, which another component already reads (one component per input — no double counting)', v_key, c ->> 'input_kind', c ->> 'input_id' USING ERRCODE = '22023';
    END IF;
    v_inputs := v_inputs || ((c ->> 'input_kind') || ':' || lower(c ->> 'input_id'));
    IF jsonb_typeof(c -> 'weight') IS DISTINCT FROM 'number' OR (c ->> 'weight')::numeric <= 0 OR (c ->> 'weight')::numeric > 1 THEN RAISE EXCEPTION 'health definition rejected: component % weight is a number in (0, 1]', v_key USING ERRCODE = '22023'; END IF;
    IF coalesce(c ->> 'direction', '') NOT IN ('higher_better', 'lower_better') THEN RAISE EXCEPTION 'health definition rejected: component % direction is higher_better or lower_better', v_key USING ERRCODE = '22023'; END IF;
    IF jsonb_typeof(c -> 'normalisation') IS DISTINCT FROM 'object' OR jsonb_typeof(c #> '{normalisation,worst}') IS DISTINCT FROM 'number' OR jsonb_typeof(c #> '{normalisation,best}') IS DISTINCT FROM 'number'
       OR (SELECT count(*) FROM jsonb_object_keys(c -> 'normalisation')) <> 2 THEN
      RAISE EXCEPTION 'health definition rejected: component % normalisation is {worst, best} — the input values scored 0 and 100', v_key USING ERRCODE = '22023';
    END IF;
    v_worst := (c #>> '{normalisation,worst}')::numeric; v_best := (c #>> '{normalisation,best}')::numeric;
    IF (c ->> 'direction' = 'higher_better' AND v_best <= v_worst) OR (c ->> 'direction' = 'lower_better' AND v_best >= v_worst) THEN
      RAISE EXCEPTION 'health definition rejected: component % normalisation contradicts its direction % (best % against worst %)', v_key, c ->> 'direction', v_best, v_worst USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(c -> 'stale_after_days') IS DISTINCT FROM 'number' OR (c ->> 'stale_after_days')::numeric <= 0 OR (c ->> 'stale_after_days')::numeric > 3650 THEN
      RAISE EXCEPTION 'health definition rejected: component % stale_after_days is a number in (0, 3650] — an input older is stale, excluded and declared', v_key USING ERRCODE = '22023';
    END IF;
    IF c ? 'critical' AND jsonb_typeof(c -> 'critical') <> 'boolean' THEN RAISE EXCEPTION 'health definition rejected: component % critical is a boolean', v_key USING ERRCODE = '22023'; END IF;
    IF c ? 'critical_below' AND jsonb_typeof(c -> 'critical_below') <> 'null' THEN
      IF NOT coalesce((c ->> 'critical')::boolean, false) THEN RAISE EXCEPTION 'health definition rejected: component % critical_below applies to a critical component only', v_key USING ERRCODE = '22023'; END IF;
      IF jsonb_typeof(c -> 'critical_below') <> 'number' OR (c ->> 'critical_below')::numeric < 0 OR (c ->> 'critical_below')::numeric > 100 THEN RAISE EXCEPTION 'health definition rejected: component % critical_below is a normalised value in [0, 100]', v_key USING ERRCODE = '22023'; END IF;
    END IF;
  END LOOP;
  FOR v_key IN SELECT unnest(v_dims) LOOP
    SELECT count(*), coalesce(sum((c2 ->> 'weight')::numeric), 0) INTO v_n, v_w FROM jsonb_array_elements(p_model -> 'components') c2 WHERE c2 ->> 'dimension' = v_key;
    IF v_n = 0 THEN RAISE EXCEPTION 'health definition rejected: dimension % has no component (a dimension decomposes into its measures)', v_key USING ERRCODE = '22023'; END IF;
    IF abs(v_w - 1) > 0.0001 THEN RAISE EXCEPTION 'health definition rejected: the component weights of dimension % sum to % — they sum to 1', v_key, v_w USING ERRCODE = '22023'; END IF;
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION executive.validate_health_model(jsonb) TO eye_app, eye_commit;

-- THE FLAG on a score change (declared here because §S1's owner_edit_analysis reads it; set by §S5's computation at INSERT, never after):
-- whether an owner edit inside the policy window preceded this favourable change, and which edits.
ALTER TABLE executive.health_score_changes
  ADD COLUMN owner_edit_flag boolean NOT NULL DEFAULT false,
  ADD COLUMN owner_edit_ids  uuid[]  NOT NULL DEFAULT '{}';

-- THE REGISTER: one row per component of a definition — the input's OWNER and the value the score last read or the owner last stated.
-- Refreshed by the computation (the owner re-derived, the value as read) and by the owner's own correction; never edited by hand.
CREATE TABLE executive.health_inputs (
  input_id            uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  definition_id       uuid NOT NULL REFERENCES executive.health_score_definitions (definition_id),
  component_key       text NOT NULL,
  input_kind          text NOT NULL,
  input_ref           uuid NOT NULL,
  /* the OWNER of the measured input, derived from the input's own object (NULL when it has no active human owner) and how */
  owner_principal_id  uuid,
  owner_basis         text NOT NULL,
  value               numeric,
  unit                text,
  as_of               timestamptz,
  digest              text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  /* whether the current value is the OWNER's statement (set_health_input) rather than the contract's reading */
  owner_stated        boolean NOT NULL DEFAULT false,
  edits               int NOT NULL DEFAULT 0,
  last_edit_id        uuid,
  refreshed_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id      uuid NOT NULL,
  CONSTRAINT xhi_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xhi_kind CHECK (input_kind = ANY (executive.health_input_kinds())),
  CONSTRAINT xhi_component_once UNIQUE (definition_id, component_key)
);
CREATE INDEX xhi_owner ON executive.health_inputs (tenant_id, domain_id, owner_principal_id);
COMMENT ON TABLE executive.health_inputs IS 'B36 (0094 §S1; F-P6-08 (f)): the health input CONTRACT with owners — per component of a definition the input it reads, its OWNER (derived from the input''s own object, never assigned by hand), the value last read or last stated by the owner, its as-of and digest, the edit count and the last edit.';

-- THE EDIT HISTORY (append-only): who restated which input, from what to what, when and why.
CREATE TABLE executive.health_input_edits (
  edit_id            uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  input_id           uuid NOT NULL REFERENCES executive.health_inputs (input_id),
  definition_id      uuid NOT NULL,
  component_key      text NOT NULL,
  input_kind         text NOT NULL,
  input_ref          uuid NOT NULL,
  editor_principal_id uuid NOT NULL,
  from_value         numeric,
  to_value           numeric NOT NULL,
  reason             text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  edited_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT xhie_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX xhie_input ON executive.health_input_edits (input_id, edited_at DESC);
CREATE INDEX xhie_editor ON executive.health_input_edits (tenant_id, domain_id, editor_principal_id, edited_at DESC);
CREATE TRIGGER xhie_append_only BEFORE UPDATE OR DELETE ON executive.health_input_edits FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();

-- WHO OWNS AN INPUT: the measure's MSR object owner, the indicator's owner, the exposure's owner, the objective's owner for the four
-- computed classes (capability, execution, outcome, quality read an OBJECTIVE) — an active human, or nobody (stated).
CREATE OR REPLACE FUNCTION executive.health_input_owner(p_tenant uuid, p_domain uuid, p_kind text, p_ref uuid)
RETURNS TABLE (owner_principal_id uuid, owner_basis text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = executive, graph, prediction, decision, pg_catalog, pg_temp AS $$
  WITH cand AS (
    SELECT s.owner_principal_id AS o, format('the owner of %s "%s"', s.object_type, s.title) AS basis
      FROM graph.strategy_current s WHERE p_kind IN ('measure', 'capability', 'execution', 'outcome', 'quality') AND s.strategy_object_id = p_ref AND s.tenant_id = p_tenant AND s.domain_id = p_domain
    UNION ALL
    SELECT i.owner_principal_id, format('the owner of indicator %s', i.indicator_id)
      FROM prediction.indicators_current i WHERE p_kind = 'indicator' AND i.indicator_id = p_ref AND i.tenant_id = p_tenant AND i.domain_id = p_domain
    UNION ALL
    SELECT x.owner_principal_id, format('the owner of the %s exposure %s', x.polarity, x.exposure_id)
      FROM prediction.exposure_current x WHERE p_kind IN ('risk', 'opportunity') AND x.exposure_id = p_ref AND x.tenant_id = p_tenant AND x.domain_id = p_domain
  )
  SELECT CASE WHEN decision.is_active_human(c.o, p_tenant) THEN c.o END,
         CASE WHEN decision.is_active_human(c.o, p_tenant) THEN c.basis ELSE c.basis || ' — not an active human; no owner edit is admitted until one is assigned' END
    FROM cand c LIMIT 1;
$$;
REVOKE ALL ON FUNCTION executive.health_input_owner(uuid, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.health_input_owner(uuid, uuid, text, uuid) TO eye_app, eye_commit;

-- The register row of a component, made or refreshed (the owner re-derived; the value as given); answers the row.
CREATE OR REPLACE FUNCTION executive.health_input_upsert(p_tenant uuid, p_domain uuid, p_definition uuid, p_component text, p_kind text, p_ref uuid,
                                                          p_value numeric, p_unit text, p_as_of timestamptz, p_owner_stated boolean, p_edit uuid, p_correlation uuid)
RETURNS executive.health_inputs
SECURITY DEFINER SET search_path = executive, pg_catalog, pg_temp AS $$
DECLARE r executive.health_inputs%ROWTYPE; o record; v_digest text;
BEGIN
  SELECT * INTO o FROM executive.health_input_owner(p_tenant, p_domain, p_kind, p_ref);
  v_digest := encode(sha256(convert_to(concat_ws('|', p_kind, p_ref::text, coalesce(p_value::text, ''), coalesce(p_as_of::text, ''), coalesce(o.owner_principal_id::text, '')), 'UTF8')), 'hex');
  INSERT INTO executive.health_inputs (input_id, scope, tenant_id, domain_id, definition_id, component_key, input_kind, input_ref, owner_principal_id, owner_basis, value, unit, as_of, digest,
                                       owner_stated, edits, last_edit_id, correlation_id)
  VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_definition, p_component, p_kind, p_ref, o.owner_principal_id, coalesce(o.owner_basis, 'no such input object in this domain'),
          p_value, p_unit, p_as_of, v_digest, p_owner_stated, CASE WHEN p_edit IS NULL THEN 0 ELSE 1 END, p_edit, p_correlation)
  ON CONFLICT (definition_id, component_key) DO UPDATE
     SET owner_principal_id = EXCLUDED.owner_principal_id, owner_basis = EXCLUDED.owner_basis, value = EXCLUDED.value, unit = coalesce(EXCLUDED.unit, executive.health_inputs.unit),
         as_of = EXCLUDED.as_of, digest = EXCLUDED.digest, owner_stated = EXCLUDED.owner_stated,
         edits = executive.health_inputs.edits + CASE WHEN p_edit IS NULL THEN 0 ELSE 1 END, last_edit_id = coalesce(p_edit, executive.health_inputs.last_edit_id),
         refreshed_at = clock_timestamp(), correlation_id = EXCLUDED.correlation_id
  RETURNING * INTO r;
  RETURN r;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.health_input_upsert(uuid,uuid,uuid,text,text,uuid,numeric,text,timestamptz,boolean,uuid,uuid) FROM PUBLIC;

-- THE OWNER-CORRECTION ROUTE: the input's OWNER restates its reading with a reason; the edit is ledgered; the score reads the statement
-- from its as-of on (the contract row it supersedes stays in the snapshot's inputs beside it). Anyone else is refused (ownership).
CREATE OR REPLACE FUNCTION executive.set_health_input(p_edit_id uuid, p_tenant uuid, p_domain uuid, p_component text, p_value numeric, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, graph, prediction, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE d executive.health_score_definitions%ROWTYPE; c jsonb; o record; cur executive.health_inputs%ROWTYPE; r executive.health_inputs%ROWTYPE; v_from numeric; v_unit text; v_now timestamptz := clock_timestamp(); i record;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.health.input.set']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'health input rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(p_reason) > 2000 THEN RAISE EXCEPTION 'health input rejected (reason): a reason of 8 to 2000 characters says why the reading is restated' USING ERRCODE = '22023'; END IF;
  IF p_value IS NULL OR p_value <> p_value OR abs(p_value) > 1e12 THEN RAISE EXCEPTION 'health input rejected (value): a finite number' USING ERRCODE = '22023'; END IF;
  SELECT * INTO d FROM executive.health_score_definitions x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'health input rejected (no_definition): no approved definition is active in this domain; an input belongs to a component of the active definition' USING ERRCODE = '22023'; END IF;
  SELECT x INTO c FROM jsonb_array_elements(d.model -> 'components') x WHERE x ->> 'key' = p_component;
  IF c IS NULL THEN RAISE EXCEPTION 'health input rejected (unknown_component): the active definition (version %) has no component %', d.version, coalesce(p_component, '<none>') USING ERRCODE = '23503'; END IF;
  SELECT * INTO o FROM executive.health_input_owner(p_tenant, p_domain, c ->> 'input_kind', (c ->> 'input_id')::uuid);
  IF o.owner_principal_id IS NULL OR o.owner_principal_id <> p_actor THEN
    RAISE EXCEPTION 'health input rejected (ownership): component % is restated by the owner of its input only (%); principal % is not', p_component, coalesce(o.owner_basis, 'no such input object in this domain'), p_actor USING ERRCODE = '42501';
  END IF;
  SELECT * INTO cur FROM executive.health_inputs x WHERE x.definition_id = d.definition_id AND x.component_key = p_component FOR UPDATE;
  IF FOUND THEN v_from := cur.value; v_unit := cur.unit;
  ELSE
    -- the contract's own reading at now, when it has one: what the statement moves FROM
    SELECT x.value, x.unit INTO v_from, v_unit FROM executive.health_measure_inputs(p_tenant, p_domain, v_now) x
     WHERE x.input_kind = c ->> 'input_kind' AND x.input_id = (c ->> 'input_id')::uuid ORDER BY x.observed_at DESC NULLS LAST LIMIT 1;
  END IF;
  r := executive.health_input_upsert(p_tenant, p_domain, d.definition_id, p_component, c ->> 'input_kind', (c ->> 'input_id')::uuid, p_value, v_unit, v_now, true, p_edit_id, p_correlation);
  INSERT INTO executive.health_input_edits (edit_id, scope, tenant_id, domain_id, input_id, definition_id, component_key, input_kind, input_ref, editor_principal_id, from_value, to_value, reason, edited_at, correlation_id)
  VALUES (p_edit_id, 'DOMAIN', p_tenant, p_domain, r.input_id, d.definition_id, p_component, c ->> 'input_kind', (c ->> 'input_id')::uuid, p_actor, v_from, p_value, btrim(p_reason), v_now, p_correlation);
  RETURN jsonb_build_object('edit_id', p_edit_id, 'input_id', r.input_id, 'definition_id', d.definition_id, 'definition_version', d.version, 'component_key', p_component,
                            'input_kind', c ->> 'input_kind', 'input_ref', c ->> 'input_id', 'owner', p_actor, 'owner_basis', o.owner_basis, 'from_value', v_from, 'to_value', p_value,
                            'unit', v_unit, 'as_of', v_now, 'digest', r.digest, 'edits', r.edits, 'reason', btrim(p_reason),
                            'window_days', d.owner_edit_window_days, 'what_follows', 'the score reads this statement from its as-of on; an edit inside the window before a favourable change is flagged on that change and counted against its owner');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.set_health_input(uuid,uuid,uuid,text,numeric,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.set_health_input(uuid,uuid,uuid,text,numeric,text,uuid,uuid) TO eye_commit;

-- THE ANTI-GAMING MEASURE, per owner (a read under the caller's RLS): the edits, the ones flagged on a favourable change, the components
-- and inputs touched, the last edit — for the definition named or the active one.
CREATE OR REPLACE FUNCTION executive.owner_edit_analysis(p_tenant uuid, p_domain uuid, p_definition uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = executive, pg_catalog, pg_temp AS $$
  WITH d AS (
    SELECT x.definition_id, x.version, x.owner_edit_window_days FROM executive.health_score_definitions x
     WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND ((p_definition IS NOT NULL AND x.definition_id = p_definition) OR (p_definition IS NULL AND x.state = 'active'))
  ), flagged AS (
    SELECT DISTINCT unnest(c.owner_edit_ids) AS edit_id, c.change_id, c.subject FROM executive.health_score_changes c JOIN d ON d.definition_id = c.definition_id WHERE c.owner_edit_flag
  ), per_owner AS (
    SELECT e.editor_principal_id AS owner, count(DISTINCT e.edit_id)::int AS edits, count(DISTINCT f.edit_id)::int AS flagged_edits,
           array_agg(DISTINCT e.component_key ORDER BY e.component_key) AS components,
           max(e.edited_at) AS last_edit_at,
           coalesce(jsonb_agg(DISTINCT jsonb_build_object('edit_id', e.edit_id, 'component_key', e.component_key, 'change_id', f.change_id, 'subject', f.subject)) FILTER (WHERE f.edit_id IS NOT NULL), '[]'::jsonb) AS flags
      FROM executive.health_input_edits e JOIN d ON d.definition_id = e.definition_id LEFT JOIN flagged f ON f.edit_id = e.edit_id
     GROUP BY e.editor_principal_id
  )
  SELECT jsonb_build_object(
    'definition_id', (SELECT definition_id FROM d), 'definition_version', (SELECT version FROM d), 'window_days', (SELECT owner_edit_window_days FROM d),
    'rule', 'an owner edit whose as-of lies inside the window before a current snapshot that moved the component''s dimension (or the aggregate) favourably is flagged on that change; the flags are shown and gate nothing; a flagged edit on a measure input raises the gamed_measure detection',
    'owners', coalesce((SELECT jsonb_agg(jsonb_build_object('owner', o.owner, 'edits', o.edits, 'flagged_edits', o.flagged_edits, 'components', to_jsonb(o.components), 'last_edit_at', o.last_edit_at, 'flags', o.flags) ORDER BY o.flagged_edits DESC, o.edits DESC) FROM per_owner o), '[]'::jsonb),
    'totals', jsonb_build_object('edits', coalesce((SELECT sum(edits) FROM per_owner), 0), 'flagged_edits', coalesce((SELECT sum(flagged_edits) FROM per_owner), 0)));
$$;
GRANT EXECUTE ON FUNCTION executive.owner_edit_analysis(uuid, uuid, uuid) TO eye_app, eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §S2 FOUR MORE SCORE INPUTS — capability, execution, outcome, quality (each EXACTLY executive.health_measure_inputs' RETURNS TABLE)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- CAPABILITY: per active objective with at least one active `supports` alignment (declared at or before the instant) to an active
-- capability — the share of those capabilities an active initiative BUILDS (an active `builds` alignment); observed at the latest of
-- the alignments read. The input_id is the OBJECTIVE. No cadence, no confidence input (stated).
CREATE OR REPLACE FUNCTION executive.health_capability_inputs(p_tenant uuid, p_domain uuid, p_at timestamptz)
RETURNS TABLE (input_kind text, input_id uuid, input_version bigint, label text, value numeric, unit text, direction text, observed_at timestamptz,
               expected_every_days numeric, confidence numeric, evidence jsonb, objective_ids uuid[], exposure jsonb, basis text)
LANGUAGE sql STABLE AS $$
  WITH caps AS (
    SELECT o.strategy_object_id AS objective_id, o.title, c.strategy_object_id AS capability_id, a.declared_at,
           EXISTS (SELECT 1 FROM graph.alignments b JOIN graph.strategy_current i ON i.strategy_object_id = b.from_id AND i.status = 'active'
                    WHERE b.kind = 'builds' AND b.to_id = c.strategy_object_id AND b.state = 'active' AND b.declared_at <= p_at AND b.tenant_id = p_tenant AND b.domain_id = p_domain) AS built
      FROM graph.strategy_current o
      JOIN graph.alignments a ON a.kind = 'supports' AND a.from_id = o.strategy_object_id AND a.state = 'active' AND a.declared_at <= p_at AND a.tenant_id = p_tenant AND a.domain_id = p_domain
      JOIN graph.strategy_current c ON c.strategy_object_id = a.to_id AND c.status = 'active'
     WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.object_type = 'OBJ' AND o.status = 'active'
  )
  SELECT 'capability'::text, x.objective_id, NULL::bigint, format('capability coverage of "%s"', x.title), round(100.0 * count(*) FILTER (WHERE x.built) / count(*), 2), 'percent'::text, 'higher_better'::text,
         max(x.declared_at), NULL::numeric, NULL::numeric, '[]'::jsonb, ARRAY[x.objective_id], NULL::jsonb,
         format('%s of %s supporting capabilit%s built by an active initiative at %s (active supports and builds alignments declared at or before the instant); no cadence, no confidence input',
                count(*) FILTER (WHERE x.built), count(*), CASE WHEN count(*) = 1 THEN 'y' ELSE 'ies' END, p_at)
    FROM caps x GROUP BY x.objective_id, x.title;
$$;
REVOKE ALL ON FUNCTION executive.health_capability_inputs(uuid, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.health_capability_inputs(uuid, uuid, timestamptz) TO eye_app, eye_commit;

-- EXECUTION: per active objective with commitment items resting on it that were DUE at or before the instant (waived and cancelled
-- items set aside) — the share delivered (done) by the instant; observed at the latest due instant read.
CREATE OR REPLACE FUNCTION executive.health_execution_inputs(p_tenant uuid, p_domain uuid, p_at timestamptz)
RETURNS TABLE (input_kind text, input_id uuid, input_version bigint, label text, value numeric, unit text, direction text, observed_at timestamptz,
               expected_every_days numeric, confidence numeric, evidence jsonb, objective_ids uuid[], exposure jsonb, basis text)
LANGUAGE sql STABLE AS $$
  WITH due AS (
    SELECT o.strategy_object_id AS objective_id, o.title, i.item_id, i.due_at, (i.state = 'done' AND i.updated_at <= p_at) AS delivered
      FROM graph.strategy_current o
      JOIN decision.commitment_items i ON o.strategy_object_id = ANY (i.objective_ids) AND i.tenant_id = p_tenant AND i.domain_id = p_domain
     WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.object_type = 'OBJ' AND o.status = 'active'
       AND i.due_at <= p_at AND i.created_at <= p_at AND i.state NOT IN ('waived', 'cancelled')
  )
  SELECT 'execution'::text, x.objective_id, NULL::bigint, format('commitments of "%s" delivered on time', x.title), round(100.0 * count(*) FILTER (WHERE x.delivered) / count(*), 2), 'percent'::text, 'higher_better'::text,
         max(x.due_at), NULL::numeric, NULL::numeric, '[]'::jsonb, ARRAY[x.objective_id], NULL::jsonb,
         format('%s of %s commitment item(s) due at or before %s were done by then (decision.commitment_items resting on the objective; waived and cancelled items set aside); no cadence, no confidence input',
                count(*) FILTER (WHERE x.delivered), count(*), p_at)
    FROM due x GROUP BY x.objective_id, x.title;
$$;
REVOKE ALL ON FUNCTION executive.health_execution_inputs(uuid, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.health_execution_inputs(uuid, uuid, timestamptz) TO eye_app, eye_commit;

-- OUTCOME: per active objective — the outcomes RECORDED (decision.outcomes, at or before the instant) on the packages whose decision
-- rests on it (graph.dependencies DEC → strategy, active): the share met; observed at the latest recording read.
CREATE OR REPLACE FUNCTION executive.health_outcome_inputs(p_tenant uuid, p_domain uuid, p_at timestamptz)
RETURNS TABLE (input_kind text, input_id uuid, input_version bigint, label text, value numeric, unit text, direction text, observed_at timestamptz,
               expected_every_days numeric, confidence numeric, evidence jsonb, objective_ids uuid[], exposure jsonb, basis text)
LANGUAGE sql STABLE AS $$
  WITH rec AS (
    SELECT DISTINCT o.strategy_object_id AS objective_id, o.title, u.outcome_id, u.met, u.recorded_at
      FROM graph.strategy_current o
      JOIN graph.dependencies dep ON dep.depends_on_kind = 'strategy' AND dep.depends_on_id = o.strategy_object_id AND dep.dependent_type = 'DEC' AND dep.state = 'active' AND dep.tenant_id = p_tenant AND dep.domain_id = p_domain
      JOIN decision.packages_current p ON p.decision_object_id = dep.dependent_object_id AND p.tenant_id = p_tenant AND p.domain_id = p_domain
      JOIN decision.outcomes u ON u.package_id = p.package_id AND u.recorded_at <= p_at
     WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.object_type = 'OBJ' AND o.status = 'active'
  )
  SELECT 'outcome'::text, x.objective_id, NULL::bigint, format('outcomes recorded against "%s"', x.title), round(100.0 * count(*) FILTER (WHERE x.met) / count(*), 2), 'percent'::text, 'higher_better'::text,
         max(x.recorded_at), NULL::numeric, NULL::numeric, '[]'::jsonb, ARRAY[x.objective_id], NULL::jsonb,
         format('%s of %s recorded outcome(s) met at or before %s (decision.outcomes of the packages whose decision rests on the objective); no cadence, no confidence input',
                count(*) FILTER (WHERE x.met), count(*), p_at)
    FROM rec x GROUP BY x.objective_id, x.title;
$$;
REVOKE ALL ON FUNCTION executive.health_outcome_inputs(uuid, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.health_outcome_inputs(uuid, uuid, timestamptz) TO eye_app, eye_commit;

-- QUALITY: per active objective with at least one active measure — the share of its measures APPROVED at the instant AND FRESH (the
-- freshness and verification of the score's own inputs); a judgement at the instant, so observed at the instant.
CREATE OR REPLACE FUNCTION executive.health_quality_inputs(p_tenant uuid, p_domain uuid, p_at timestamptz)
RETURNS TABLE (input_kind text, input_id uuid, input_version bigint, label text, value numeric, unit text, direction text, observed_at timestamptz,
               expected_every_days numeric, confidence numeric, evidence jsonb, objective_ids uuid[], exposure jsonb, basis text)
LANGUAGE sql STABLE AS $$
  WITH q AS (
    SELECT o.strategy_object_id AS objective_id, o.title, f.measure_id, (f.approved_now AND f.state = 'fresh') AS sound
      FROM graph.strategy_current o
      JOIN graph.measure_freshness(p_tenant, p_domain, p_at) f ON o.strategy_object_id = ANY (f.objective_ids) AND f.status = 'active'
     WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain AND o.object_type = 'OBJ' AND o.status = 'active'
  )
  SELECT 'quality'::text, x.objective_id, NULL::bigint, format('input quality of "%s"', x.title), round(100.0 * count(*) FILTER (WHERE x.sound) / count(*), 2), 'percent'::text, 'higher_better'::text,
         p_at, NULL::numeric, NULL::numeric, '[]'::jsonb, ARRAY[x.objective_id], NULL::jsonb,
         format('%s of %s measure(s) of the objective approved by an unrevoked, unexpired act AND fresh at %s (graph.measure_freshness); a judgement at the instant; no confidence input',
                count(*) FILTER (WHERE x.sound), count(*), p_at)
    FROM q x GROUP BY x.objective_id, x.title;
$$;
REVOKE ALL ON FUNCTION executive.health_quality_inputs(uuid, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.health_quality_inputs(uuid, uuid, timestamptz) TO eye_app, eye_commit;

-- executive.health_measure_inputs re-declared (0089 lines 4494–4514 — the §I union, whole; ONE change: the four branches unioned in)
CREATE OR REPLACE FUNCTION executive.health_measure_inputs(p_tenant uuid, p_domain uuid, p_at timestamptz)
RETURNS TABLE (input_kind text, input_id uuid, input_version bigint, label text, value numeric, unit text, direction text, observed_at timestamptz,
               expected_every_days numeric, confidence numeric, evidence jsonb, objective_ids uuid[], exposure jsonb, basis text)
LANGUAGE sql STABLE AS $$
  SELECT 'indicator'::text, i.indicator_id, NULL::bigint, i.description, ev.value, NULL::text,
         CASE WHEN i.comparator IN ('<', '<=') THEN 'higher_better' ELSE 'lower_better' END,
         ev.observation_at::timestamptz, NULL::numeric, NULL::numeric,
         CASE WHEN ev.evidence_object_id IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('object_id', ev.evidence_object_id, 'version', ev.evidence_version)) END,
         '{}'::uuid[], NULL::jsonb,
         format('indicator %s on series %s, its latest evaluation at or before the instant (no cadence declared on the indicator; no confidence input)', i.indicator_id, i.series_key)
    FROM prediction.indicators_current i
    LEFT JOIN LATERAL (SELECT e.value, e.observation_at, e.evidence_object_id, e.evidence_version FROM prediction.indicator_evaluations e
                        WHERE e.indicator_id = i.indicator_id AND e.known_at <= p_at ORDER BY e.observation_at DESC, e.known_at DESC LIMIT 1) ev ON true
   WHERE i.tenant_id = p_tenant AND i.domain_id = p_domain AND i.state = 'active'
  UNION ALL
  SELECT g.* FROM graph.health_inputs(p_tenant, p_domain, p_at) g
  UNION ALL
  SELECT x.* FROM prediction.health_inputs(p_tenant, p_domain, p_at) x
  /* B36 (0094 §S2): the four further classes */
  UNION ALL SELECT c.* FROM executive.health_capability_inputs(p_tenant, p_domain, p_at) c
  UNION ALL SELECT e.* FROM executive.health_execution_inputs(p_tenant, p_domain, p_at) e
  UNION ALL SELECT o.* FROM executive.health_outcome_inputs(p_tenant, p_domain, p_at) o
  UNION ALL SELECT q.* FROM executive.health_quality_inputs(p_tenant, p_domain, p_at) q;
$$;
REVOKE ALL ON FUNCTION executive.health_measure_inputs(uuid, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.health_measure_inputs(uuid, uuid, timestamptz) TO eye_app, eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §S3 EXCEPTIONS AS RECORDED OBJECTS
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE executive.health_exceptions (
  exception_id             uuid PRIMARY KEY,
  scope                    text NOT NULL,
  tenant_id                uuid NOT NULL,
  domain_id                uuid NOT NULL,
  definition_id            uuid NOT NULL REFERENCES executive.health_score_definitions (definition_id),
  component_key            text NOT NULL,
  kind                     text NOT NULL CHECK (kind IN ('exclude', 'relax_bound')),
  relaxed_stale_after_days numeric CHECK (relaxed_stale_after_days IS NULL OR (relaxed_stale_after_days > 0 AND relaxed_stale_after_days <= 3660)),
  reason                   text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 2000),
  expires_at               timestamptz NOT NULL,
  state                    text NOT NULL DEFAULT 'requested' CHECK (state IN ('requested', 'approved', 'refused')),
  requested_by             uuid NOT NULL,
  requested_at             timestamptz NOT NULL DEFAULT clock_timestamp(),
  approved_by              uuid,
  approved_at              timestamptz,
  approval_note            text,
  refused_by               uuid,
  refused_at               timestamptz,
  refusal_reason           text,
  correlation_id           uuid NOT NULL,
  CONSTRAINT xhx_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xhx_kind CHECK ((kind = 'relax_bound') = (relaxed_stale_after_days IS NOT NULL)),
  CONSTRAINT xhx_expiry CHECK (expires_at > requested_at),
  CONSTRAINT xhx_approved CHECK ((state = 'approved') = (approved_by IS NOT NULL AND approved_at IS NOT NULL AND length(btrim(coalesce(approval_note, ''))) >= 8)),
  CONSTRAINT xhx_refused CHECK ((state = 'refused') = (refused_by IS NOT NULL AND refused_at IS NOT NULL AND length(btrim(coalesce(refusal_reason, ''))) >= 8)),
  -- TWO PEOPLE, in the record itself: the requester never decides their own exception
  CONSTRAINT xhx_separation CHECK ((approved_by IS NULL OR approved_by <> requested_by) AND (refused_by IS NULL OR refused_by <> requested_by))
);
CREATE INDEX xhx_definition ON executive.health_exceptions (definition_id, component_key, state, expires_at);
COMMENT ON TABLE executive.health_exceptions IS 'B36 (0094 §S3; F-P6-08 (g), PR-43-003 "humans approve … exceptions"): a component EXCLUDED from the score or its freshness bound RELAXED for a period — requested by a named human, approved (or refused) by ANOTHER holding the executive''s authority with a note and an expiry; in force from its approval until its expiry; an unapproved or expired exception has no effect.';
-- forward only: requested → approved | refused, once, the decision's own fields; nothing else changes, nothing is deleted
CREATE OR REPLACE FUNCTION executive.health_exception_forward() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_fields text[];
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'health exceptions are never deleted' USING ERRCODE = '55000'; END IF;
  v_fields := CASE WHEN OLD.state = 'requested' AND NEW.state = 'approved' THEN ARRAY['state', 'approved_by', 'approved_at', 'approval_note']
                   WHEN OLD.state = 'requested' AND NEW.state = 'refused' THEN ARRAY['state', 'refused_by', 'refused_at', 'refusal_reason'] END;
  IF v_fields IS NOT NULL AND (to_jsonb(NEW) - v_fields) = (to_jsonb(OLD) - v_fields) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'health exception % is %; an exception is decided once and never rewritten', OLD.exception_id, OLD.state USING ERRCODE = '55000';
END $$;
CREATE TRIGGER xhx_forward BEFORE UPDATE OR DELETE ON executive.health_exceptions FOR EACH ROW EXECUTE FUNCTION executive.health_exception_forward();

CREATE OR REPLACE FUNCTION executive.health_exception_answer(x executive.health_exceptions) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object('exception_id', x.exception_id, 'definition_id', x.definition_id, 'component_key', x.component_key, 'kind', x.kind, 'relaxed_stale_after_days', x.relaxed_stale_after_days,
                            'reason', x.reason, 'expires_at', x.expires_at, 'state', x.state, 'requested_by', x.requested_by, 'requested_at', x.requested_at, 'approved_by', x.approved_by,
                            'approved_at', x.approved_at, 'approval_note', x.approval_note, 'refused_by', x.refused_by, 'refused_at', x.refused_at, 'refusal_reason', x.refusal_reason,
                            'in_force_now', x.state = 'approved' AND x.approved_at <= clock_timestamp() AND x.expires_at > clock_timestamp());
$$;
REVOKE ALL ON FUNCTION executive.health_exception_answer(executive.health_exceptions) FROM PUBLIC;

-- REQUEST: a named human names a component of the ACTIVE definition, the exception's kind, the reason and an expiry (within 366 days).
CREATE OR REPLACE FUNCTION executive.request_health_exception(p_exception_id uuid, p_tenant uuid, p_domain uuid, p_component text, p_kind text, p_relaxed_days numeric, p_reason text, p_expires_at timestamptz, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE d executive.health_score_definitions%ROWTYPE; x executive.health_exceptions%ROWTYPE; v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.health.exception.request']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'health exception rejected (actor): requested by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('exclude', 'relax_bound') THEN RAISE EXCEPTION 'health exception rejected (kind): exclude (the component left out for the period) or relax_bound (its freshness bound relaxed)' USING ERRCODE = '22023'; END IF;
  IF (p_kind = 'relax_bound') <> (p_relaxed_days IS NOT NULL) OR (p_relaxed_days IS NOT NULL AND (p_relaxed_days <= 0 OR p_relaxed_days > 3660)) THEN
    RAISE EXCEPTION 'health exception rejected (bound): relax_bound names the relaxed stale_after_days in (0, 3660]; exclude names none' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(p_reason) > 2000 THEN RAISE EXCEPTION 'health exception rejected (reason): a reason of 8 to 2000 characters says why the component is excepted' USING ERRCODE = '22023'; END IF;
  IF p_expires_at IS NULL OR p_expires_at <= v_now OR p_expires_at > v_now + interval '366 days' THEN RAISE EXCEPTION 'health exception rejected (expiry): an exception expires after now and within 366 days' USING ERRCODE = '22023'; END IF;
  SELECT * INTO d FROM executive.health_score_definitions z WHERE z.tenant_id = p_tenant AND z.domain_id = p_domain AND z.state = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'health exception rejected (no_definition): no approved definition is active in this domain' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(d.model -> 'components') c WHERE c ->> 'key' = p_component) THEN
    RAISE EXCEPTION 'health exception rejected (unknown_component): the active definition (version %) has no component %', d.version, coalesce(p_component, '<none>') USING ERRCODE = '23503';
  END IF;
  -- one undecided request per (component, kind) at a time; a request that lapsed undecided blocks nothing (its record stays)
  IF EXISTS (SELECT 1 FROM executive.health_exceptions z WHERE z.definition_id = d.definition_id AND z.component_key = p_component AND z.kind = p_kind AND z.state = 'requested' AND z.expires_at > v_now) THEN
    RAISE EXCEPTION 'health exception rejected (pending): a % exception for component % awaits a decision', p_kind, p_component USING ERRCODE = '22023';
  END IF;
  INSERT INTO executive.health_exceptions (exception_id, scope, tenant_id, domain_id, definition_id, component_key, kind, relaxed_stale_after_days, reason, expires_at, requested_by, requested_at, correlation_id)
  VALUES (p_exception_id, 'DOMAIN', p_tenant, p_domain, d.definition_id, p_component, p_kind, p_relaxed_days, btrim(p_reason), p_expires_at, p_actor, v_now, p_correlation)
  RETURNING * INTO x;
  RETURN executive.health_exception_answer(x) || jsonb_build_object('definition_version', d.version, 'what_follows', 'no effect until a person holding the executive''s authority — never the requester — approves it; in force from the approval until the expiry');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.request_health_exception(uuid,uuid,uuid,text,text,numeric,text,timestamptz,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.request_health_exception(uuid,uuid,uuid,text,text,numeric,text,timestamptz,uuid,uuid) TO eye_commit;

-- APPROVE (or refuse): ANOTHER named human holding the executive's authority (the PDP names the roles; the port refuses the requester).
CREATE OR REPLACE FUNCTION executive.approve_health_exception(p_exception_id uuid, p_tenant uuid, p_domain uuid, p_decision text, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE x executive.health_exceptions%ROWTYPE; v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.health.exception.approve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'health exception rejected (actor): decided by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('approve', 'refuse') THEN RAISE EXCEPTION 'health exception rejected (decision): approve or refuse' USING ERRCODE = '22023'; END IF;
  IF p_note IS NULL OR length(btrim(p_note)) < 8 OR length(p_note) > 2000 THEN RAISE EXCEPTION 'health exception rejected (note): a note of 8 to 2000 characters records the decision' USING ERRCODE = '22023'; END IF;
  SELECT * INTO x FROM executive.health_exceptions z WHERE z.exception_id = p_exception_id AND z.tenant_id = p_tenant AND z.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'health exception rejected (unknown_exception): no exception % in this domain', p_exception_id USING ERRCODE = '23503'; END IF;
  IF x.requested_by = p_actor THEN RAISE EXCEPTION 'health exception rejected (separation): the requester does not decide their own exception' USING ERRCODE = '42501'; END IF;
  IF x.state <> 'requested' THEN RAISE EXCEPTION 'health exception rejected (state): exception % is %; only a requested exception is decided', p_exception_id, x.state USING ERRCODE = '22023'; END IF;
  IF x.expires_at <= v_now THEN RAISE EXCEPTION 'health exception rejected (expired): exception % expired at % before it was decided', p_exception_id, x.expires_at USING ERRCODE = '22023'; END IF;
  IF p_decision = 'approve' THEN
    UPDATE executive.health_exceptions SET state = 'approved', approved_by = p_actor, approved_at = v_now, approval_note = btrim(p_note) WHERE exception_id = p_exception_id RETURNING * INTO x;
  ELSE
    UPDATE executive.health_exceptions SET state = 'refused', refused_by = p_actor, refused_at = v_now, refusal_reason = btrim(p_note) WHERE exception_id = p_exception_id RETURNING * INTO x;
  END IF;
  RETURN executive.health_exception_answer(x) || jsonb_build_object('what_follows', CASE p_decision WHEN 'approve' THEN 'in force from now until the expiry: the next computation names it and applies it' ELSE 'no effect; the record kept' END);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.approve_health_exception(uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.approve_health_exception(uuid,uuid,uuid,text,text,uuid,uuid) TO eye_commit;

-- IN FORCE at an instant: approved at or before it and not yet expired (a read; the computation and the preview call it).
CREATE OR REPLACE FUNCTION executive.health_exceptions_in_force(p_tenant uuid, p_domain uuid, p_definition uuid, p_at timestamptz) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = executive, pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('exception_id', x.exception_id, 'component_key', x.component_key, 'kind', x.kind, 'relaxed_stale_after_days', x.relaxed_stale_after_days,
                                               'reason', x.reason, 'approved_by', x.approved_by, 'approved_at', x.approved_at, 'expires_at', x.expires_at) ORDER BY x.approved_at), '[]'::jsonb)
    FROM executive.health_exceptions x
   WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.definition_id = p_definition AND x.state = 'approved' AND x.approved_at <= p_at AND x.expires_at > p_at;
$$;
REVOKE ALL ON FUNCTION executive.health_exceptions_in_force(uuid, uuid, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.health_exceptions_in_force(uuid, uuid, uuid, timestamptz) TO eye_app, eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §S4 THE SNAPSHOT APPROVAL — the executive's acceptance of a CURRENT snapshot on its digest, signed beyond the audit chain
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE executive.health_snapshot_approvals (
  approval_id     uuid PRIMARY KEY,
  scope           text NOT NULL,
  tenant_id       uuid NOT NULL,
  domain_id       uuid NOT NULL,
  snapshot_id     uuid NOT NULL REFERENCES executive.health_score_snapshots (snapshot_id),
  result_digest   text NOT NULL CHECK (result_digest ~ '^[0-9a-f]{64}$'),
  note            text NOT NULL CHECK (length(btrim(note)) BETWEEN 8 AND 2000),
  approved_by     uuid NOT NULL,
  approved_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id  uuid NOT NULL,
  CONSTRAINT xhsa_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT xhsa_once UNIQUE (snapshot_id, approved_by)
);
CREATE TRIGGER xhsa_append_only BEFORE UPDATE OR DELETE ON executive.health_snapshot_approvals FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE executive.health_snapshot_approvals IS 'B36 (0094 §S4; F-P6-08 (h)): the executive''s ACCEPTANCE of a current health snapshot on the result digest previewed — a recorded object, signed beyond the audit chain (executive.signatures, kind health_snapshot); it accepts the decomposition as the basis for review and authorizes no action.';

-- THE PREVIEW (a read under the caller's RLS): what the approval binds and what follows — the digest, the score, the flagged changes,
-- the owner-stated inputs, the exceptions in force, the approvals and signatures already recorded.
CREATE OR REPLACE FUNCTION executive.preview_health_snapshot_approval(p_snapshot uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = executive, pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'snapshot_id', s.snapshot_id, 'kind', s.kind, 'at', s.at, 'definition_version', s.definition_version, 'formula_version', s.formula_version,
    'status', s.status, 'aggregate', s.aggregate, 'coverage', s.coverage, 'result_digest', s.result_digest, 'inputs_digest', s.inputs_digest,
    'acceptable', s.kind = 'current',
    'consequence', CASE WHEN s.kind = 'current'
      THEN 'accepting records the executive''s acceptance of this decomposition — its inputs, exclusions, exceptions and flags as recorded — as the basis for review at this instant; it is signed beyond the audit chain with the tenant''s key; it authorizes no action and rewrites nothing'
      ELSE 'an as_of replay is a temporal check, not a score to accept; only a current snapshot is accepted' END,
    'exceptions_in_force', coalesce(s.result -> 'exceptions', '[]'::jsonb),
    'owner_stated_inputs', coalesce((SELECT jsonb_agg(jsonb_build_object('component_key', c ->> 'key', 'owner', c -> 'owner', 'edit_id', c -> 'owner_edit_id', 'as_of', c -> 'observed_at')) FROM jsonb_array_elements(s.result -> 'components') c WHERE (c ->> 'owner_stated')::boolean), '[]'::jsonb),
    'changes', coalesce((SELECT jsonb_agg(jsonb_build_object('change_id', c.change_id, 'subject', c.subject, 'direction', c.direction, 'from_value', c.from_value, 'to_value', c.to_value, 'owner_edit_flag', c.owner_edit_flag, 'owner_edit_ids', to_jsonb(c.owner_edit_ids), 'gaming_flags', c.gaming_flags) ORDER BY c.subject)
                        FROM executive.health_score_changes c WHERE c.snapshot_id = s.snapshot_id), '[]'::jsonb),
    'approvals', coalesce((SELECT jsonb_agg(jsonb_build_object('approval_id', a.approval_id, 'approved_by', a.approved_by, 'approved_at', a.approved_at, 'note', a.note) ORDER BY a.approved_at) FROM executive.health_snapshot_approvals a WHERE a.snapshot_id = s.snapshot_id), '[]'::jsonb),
    'signatures', executive.signature_of('health_snapshot', s.snapshot_id, 1))
    FROM executive.health_score_snapshots s WHERE s.snapshot_id = p_snapshot;
$$;
GRANT EXECUTE ON FUNCTION executive.preview_health_snapshot_approval(uuid) TO eye_app, eye_commit;

-- APPROVE: the executive (the PDP's roles), on the digest previewed; a current snapshot only; once per person. The signature row is the
-- TypeScript signer's, written through §0's record_signature under this same bound action in the same transaction.
CREATE OR REPLACE FUNCTION executive.approve_health_snapshot(p_approval_id uuid, p_tenant uuid, p_domain uuid, p_snapshot uuid, p_digest text, p_note text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s executive.health_score_snapshots%ROWTYPE; v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.health.snapshot.approve']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'health approval rejected (actor): recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_note IS NULL OR length(btrim(p_note)) < 8 OR length(p_note) > 2000 THEN RAISE EXCEPTION 'health approval rejected (note): a note of 8 to 2000 characters records the acceptance' USING ERRCODE = '22023'; END IF;
  IF p_digest IS NULL OR p_digest !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'health approval rejected (digest): the approval names the result digest previewed (64 hex)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO s FROM executive.health_score_snapshots x WHERE x.snapshot_id = p_snapshot AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'health approval rejected (unknown_snapshot): no snapshot % in this domain', p_snapshot USING ERRCODE = '23503'; END IF;
  IF s.kind <> 'current' THEN RAISE EXCEPTION 'health approval rejected (state): snapshot % is an as_of replay; only a current snapshot is accepted', p_snapshot USING ERRCODE = '22023'; END IF;
  IF s.result_digest <> p_digest THEN RAISE EXCEPTION 'health approval rejected (stale_digest): the approver previewed %; snapshot % records %', p_digest, p_snapshot, s.result_digest USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM executive.health_snapshot_approvals a WHERE a.snapshot_id = p_snapshot AND a.approved_by = p_actor) THEN
    RAISE EXCEPTION 'health approval rejected (duplicate): snapshot % is already accepted by this principal', p_snapshot USING ERRCODE = '22023';
  END IF;
  INSERT INTO executive.health_snapshot_approvals (approval_id, scope, tenant_id, domain_id, snapshot_id, result_digest, note, approved_by, approved_at, correlation_id)
  VALUES (p_approval_id, 'DOMAIN', p_tenant, p_domain, p_snapshot, p_digest, btrim(p_note), p_actor, v_now, p_correlation);
  RETURN jsonb_build_object('approval_id', p_approval_id, 'snapshot_id', p_snapshot, 'result_digest', p_digest, 'approved_by', p_actor, 'approved_at', v_now, 'note', btrim(p_note),
                            'authorizes_action', false, 'what_follows', 'the acceptance is signed beyond the audit chain (kind health_snapshot); the decomposition stands as recorded — a later correction is a new snapshot');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.approve_health_snapshot(uuid,uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.approve_health_snapshot(uuid,uuid,uuid,uuid,text,text,uuid,uuid) TO eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §S5 THE COMPUTATION re-declared
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- executive.health_change_answer re-declared (0089 lines 4243–4253, whole; ONE change: the owner-edit flag and its edit ids answered)
CREATE OR REPLACE FUNCTION executive.health_change_answer(c executive.health_score_changes) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object('change_id', c.change_id, 'snapshot_id', c.snapshot_id, 'prior_snapshot_id', c.prior_snapshot_id, 'definition_id', c.definition_id, 'definition_version', c.definition_version,
                            'definition_approved_by', c.definition_approved_by, 'subject', c.subject, 'subject_label', c.subject_label, 'from_value', c.from_value, 'to_value', c.to_value,
                            'delta', c.delta, 'from_band', c.from_band, 'to_band', c.to_band, 'triggers', to_jsonb(c.triggers), 'direction', c.direction, 'gaming_flags', c.gaming_flags,
                            'state', c.state, 'raised_at', c.raised_at, 'acknowledged_by', c.acknowledged_by, 'acknowledged_at', c.acknowledged_at, 'acknowledgement_note', c.acknowledgement_note,
                            'challenge_kind', c.challenge_kind, 'challenge_statement', c.challenge_statement, 'challenged_by', c.challenged_by, 'challenged_at', c.challenged_at,
                            'decided_by', c.decided_by, 'decided_at', c.decided_at, 'decision_note', c.decision_note, 'withdrawn_at', c.withdrawn_at, 'withdrawal_reason', c.withdrawal_reason,
                            'authorizes_action', false,
                            /* B36 (0094 §S1) */ 'owner_edit_flag', c.owner_edit_flag, 'owner_edit_ids', to_jsonb(c.owner_edit_ids));
$$;
REVOKE ALL ON FUNCTION executive.health_change_answer(executive.health_score_changes) FROM PUBLIC;

-- executive.compute_health_score re-declared (0089 lines 4266–4375, whole; ONE addition, the `B36 (0094 §S5)` block in four places that
-- belong together: (1) the owner-stated readings from the edit ledger joined to the contract rows before the digest; (2) the exceptions
-- in force applied to the model handed to the composition, and named on the result; (3) each component's owner-stated marks beside its
-- decision links; (4) the owner-edit flag on a favourable change, and the input register refreshed after a current snapshot).
CREATE OR REPLACE FUNCTION executive.compute_health_score(p_snapshot uuid, p_tenant uuid, p_domain uuid, p_at timestamptz, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = executive, identity, observation, graph, ctx, public, pg_catalog, pg_temp AS $$
DECLARE d executive.health_score_definitions%ROWTYPE; pr executive.health_score_snapshots%ROWTYPE; same executive.health_score_snapshots%ROWTYPE;
        v_now timestamptz := clock_timestamp(); v_at timestamptz; v_inputs jsonb; v_inputs_digest text; v_result jsonb; v_result_digest text; v_latest timestamptz; v_kind text;
        v_dim jsonb; v_comp jsonb; v_links jsonb; v_dims jsonb := '[]'::jsonb; v_comps jsonb := '[]'::jsonb; v_changes jsonb := '[]'::jsonb;
        v_subjects jsonb; s jsonb; v_from numeric; v_to numeric; v_fb text; v_tb text; v_triggers text[]; v_flags jsonb; v_change uuid; v_label text; v_bands jsonb; g jsonb := executive.health_gaming_policy();
        v_ch executive.health_score_changes%ROWTYPE;
        /* B36 (0094 §S5) */ v_model jsonb; v_exc jsonb; v_stated jsonb; v_win jsonb; v_edit_ids uuid[]; v_owner_flag boolean; cx jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.health.compute']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'health score rejected: computed by the acting principal' USING ERRCODE = '42501'; END IF;
  v_at := coalesce(p_at, v_now);
  IF v_at > v_now THEN RAISE EXCEPTION 'health score rejected: the instant % is after now; a score is computed at or before now', v_at USING ERRCODE = '22023'; END IF;
  SELECT * INTO d FROM executive.health_score_definitions x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.state = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'health score rejected (no_definition): no approved definition is active in this domain; one person proposes a definition and another approves it' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('executive.health_score_snapshots:' || d.definition_id::text, 0));
  -- THE ONLY INPUT: the contract rows the model names, at the instant (nothing else is read as a measure)
  SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.input_kind, i.input_id, i.observed_at), '[]'::jsonb) INTO v_inputs
    FROM executive.health_measure_inputs(p_tenant, p_domain, v_at) i
   WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(d.model -> 'components') mc WHERE mc ->> 'input_kind' = i.input_kind AND lower(mc ->> 'input_id') = i.input_id::text);
  /* B36 (0094 §S5) (1): the OWNER-STATED readings — per component, the latest owner edit at or before the instant (the ledger, so an as_of
     replay reads what stood then) — joined to the contract rows as further input rows; the composition takes the newest observation. */
  SELECT coalesce(jsonb_agg(jsonb_build_object('input_kind', e.input_kind, 'input_id', e.input_ref, 'input_version', NULL, 'label', mc ->> 'label', 'value', e.to_value,
                                               'unit', coalesce((SELECT x ->> 'unit' FROM jsonb_array_elements(v_inputs) x WHERE x ->> 'input_kind' = e.input_kind AND lower(x ->> 'input_id') = e.input_ref::text LIMIT 1), hi.unit),
                                               'direction', mc ->> 'direction', 'observed_at', e.edited_at, 'expected_every_days', NULL, 'confidence', NULL, 'evidence', '[]'::jsonb,
                                               'objective_ids', coalesce((SELECT x -> 'objective_ids' FROM jsonb_array_elements(v_inputs) x WHERE x ->> 'input_kind' = e.input_kind AND lower(x ->> 'input_id') = e.input_ref::text LIMIT 1), '[]'::jsonb),
                                               'exposure', NULL, 'basis', format('restated by its owner %s at %s (edit %s: %s → %s, "%s"); the contract''s own reading stands beside it', e.editor_principal_id, e.edited_at, e.edit_id, coalesce(e.from_value::text, 'none'), e.to_value, e.reason),
                                               'owner', e.editor_principal_id, 'owner_edit_id', e.edit_id, 'owner_stated', true)), '[]'::jsonb)
    INTO v_stated
    FROM jsonb_array_elements(d.model -> 'components') mc
    JOIN LATERAL (SELECT z.* FROM executive.health_input_edits z WHERE z.definition_id = d.definition_id AND z.component_key = mc ->> 'key' AND z.edited_at <= v_at ORDER BY z.edited_at DESC LIMIT 1) e ON true
    LEFT JOIN executive.health_inputs hi ON hi.input_id = e.input_id;
  v_inputs := v_inputs || v_stated;
  /* B36 (0094 §S5) (2): the EXCEPTIONS in force at the instant applied to the model the composition reads — an excluded component left
     out (its dimension judged on the rest), a relaxed bound in place of the component's; named on the result. */
  v_exc := executive.health_exceptions_in_force(p_tenant, p_domain, d.definition_id, v_at);
  SELECT d.model || jsonb_build_object('components', coalesce(jsonb_agg(
           CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_exc) x WHERE x ->> 'component_key' = c ->> 'key' AND x ->> 'kind' = 'relax_bound')
                THEN c || jsonb_build_object('stale_after_days', (SELECT (x ->> 'relaxed_stale_after_days')::numeric FROM jsonb_array_elements(v_exc) x WHERE x ->> 'component_key' = c ->> 'key' AND x ->> 'kind' = 'relax_bound' ORDER BY x ->> 'approved_at' DESC LIMIT 1))
                ELSE c END ORDER BY n) FILTER (WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_exc) x WHERE x ->> 'component_key' = c ->> 'key' AND x ->> 'kind' = 'exclude')), '[]'::jsonb))
    INTO v_model FROM jsonb_array_elements(d.model -> 'components') WITH ORDINALITY q(c, n);
  /* end B36 (1)(2) */
  v_inputs_digest := encode(sha256(convert_to(v_inputs::text, 'UTF8')), 'hex');
  SELECT max(x.at) INTO v_latest FROM executive.health_score_snapshots x WHERE x.definition_id = d.definition_id AND x.kind = 'current';
  v_kind := CASE WHEN v_latest IS NULL OR v_at > v_latest THEN 'current' ELSE 'as_of' END;
  SELECT * INTO pr FROM executive.health_score_snapshots x WHERE x.definition_id = d.definition_id AND x.kind = 'current' AND x.at < v_at ORDER BY x.at DESC LIMIT 1;
  v_result := executive.health_compose(v_model, v_inputs, v_at, pr.result)
              /* B36 (0094 §S5) (2) */ || jsonb_build_object('exceptions', v_exc, 'owner_edit_window_days', d.owner_edit_window_days);
  v_result_digest := encode(sha256(convert_to(v_result::text, 'UTF8')), 'hex');
  -- the decisions each dimension and component informs (the lineage read; outside the result digest — the graph moves on its own)
  FOR v_dim IN SELECT value FROM jsonb_array_elements(v_result -> 'dimensions') LOOP
    v_dims := v_dims || (v_dim || jsonb_build_object('decision_links', executive.health_decision_links(p_tenant, p_domain, v_dim -> 'objective_ids')));
  END LOOP;
  FOR v_comp IN SELECT value FROM jsonb_array_elements(v_result -> 'components') LOOP
    v_links := executive.health_decision_links(p_tenant, p_domain,
                 (SELECT x -> 'objective_ids' FROM jsonb_array_elements(v_result -> 'dimensions') x WHERE x ->> 'key' = v_comp ->> 'dimension') || coalesce(v_comp #> '{lineage,objective_ids}', '[]'::jsonb));
    /* B36 (0094 §S5) (3): the input row the component read — whether it is the owner's statement, and whose */
    SELECT x INTO v_win FROM jsonb_array_elements(v_inputs) x WHERE x ->> 'input_kind' = v_comp ->> 'input_kind' AND lower(x ->> 'input_id') = v_comp ->> 'input_id'
     ORDER BY (x ->> 'observed_at')::timestamptz DESC NULLS LAST LIMIT 1;
    v_comps := v_comps || (v_comp || jsonb_build_object('decision_links', v_links,
                 'owner_stated', coalesce((v_win ->> 'owner_stated')::boolean, false), 'owner', v_win -> 'owner', 'owner_edit_id', v_win -> 'owner_edit_id'));
  END LOOP;
  v_result := v_result || jsonb_build_object('dimensions', v_dims, 'components', v_comps);
  IF v_kind = 'as_of' THEN
    SELECT * INTO same FROM executive.health_score_snapshots x WHERE x.definition_id = d.definition_id AND x.at = v_at ORDER BY x.computed_at LIMIT 1;
  END IF;
  INSERT INTO executive.health_score_snapshots (snapshot_id, scope, tenant_id, domain_id, definition_id, definition_version, formula_version, model_digest, at, computed_at, kind,
                                                prior_snapshot_id, replay_of, reproduced, status, aggregate, coverage, result, inputs, inputs_digest, result_digest, computed_by, correlation_id)
  VALUES (p_snapshot, 'DOMAIN', p_tenant, p_domain, d.definition_id, d.version, d.formula_version, d.model_digest, v_at, v_now, v_kind,
          pr.snapshot_id, same.snapshot_id, CASE WHEN same.snapshot_id IS NULL THEN NULL ELSE same.inputs_digest = v_inputs_digest AND same.result_digest = v_result_digest END,
          v_result ->> 'status', (v_result ->> 'aggregate')::numeric, (v_result ->> 'coverage')::numeric, v_result, v_inputs, v_inputs_digest, v_result_digest, p_actor, p_correlation);
  INSERT INTO executive.health_score_components (snapshot_id, component_key, scope, tenant_id, domain_id, dimension_key, label, input_kind, input_id, input_version, value, unit, direction,
                                                 normalised, weight, contribution, evidence, confidence, low_confidence, trend, observed_at, freshness_days, stale_after_days, state, stale, missing,
                                                 reason, critical, critical_failure, sensitivity, decision_links, lineage)
  SELECT p_snapshot, x ->> 'key', 'DOMAIN', p_tenant, p_domain, x ->> 'dimension', x ->> 'label', x ->> 'input_kind', (x ->> 'input_id')::uuid, (x ->> 'input_version')::bigint,
         (x ->> 'value')::numeric, x ->> 'unit', x ->> 'direction', (x ->> 'normalised')::numeric, (x ->> 'weight')::numeric, (x ->> 'contribution')::numeric, x -> 'evidence',
         (x ->> 'confidence')::numeric, (x ->> 'low_confidence')::boolean, (x #>> '{trend,delta}')::numeric, (x ->> 'observed_at')::timestamptz, (x ->> 'freshness_days')::numeric,
         (x ->> 'stale_after_days')::numeric, x ->> 'state', (x ->> 'stale')::boolean, (x ->> 'missing')::boolean, x ->> 'reason', (x ->> 'critical')::boolean, (x ->> 'critical_failure')::boolean,
         x -> 'sensitivity', x -> 'decision_links', x -> 'lineage'
    FROM jsonb_array_elements(v_comps) x;
  /* B36 (0094 §S5) (4a): the input REGISTER refreshed by a current snapshot — every component's owner re-derived, the value as read */
  IF v_kind = 'current' THEN
    FOR cx IN SELECT value FROM jsonb_array_elements(v_comps) LOOP
      PERFORM executive.health_input_upsert(p_tenant, p_domain, d.definition_id, cx ->> 'key', cx ->> 'input_kind', (cx ->> 'input_id')::uuid, (cx ->> 'value')::numeric, cx ->> 'unit',
                                            (cx ->> 'observed_at')::timestamptz, coalesce((cx ->> 'owner_stated')::boolean, false), NULL, p_correlation);
    END LOOP;
  END IF;
  -- THE CHANGES: a CURRENT snapshot against the prior current snapshot of the same definition (an as_of replay raises nothing)
  IF v_kind = 'current' AND pr.snapshot_id IS NOT NULL THEN
    v_subjects := jsonb_build_array(jsonb_build_object('subject', 'aggregate', 'label', 'the aggregate', 'from', pr.result -> 'aggregate', 'to', v_result -> 'aggregate', 'from_band', NULL, 'to_band', NULL, 'bands', '[]'::jsonb))
      || coalesce((SELECT jsonb_agg(jsonb_build_object('subject', 'dimension:' || (n ->> 'key'), 'key', n ->> 'key', 'label', n ->> 'label', 'from', o -> 'value', 'to', n -> 'value',
                                                        'from_band', o -> 'band', 'to_band', n -> 'band', 'bands', n -> 'bands') ORDER BY m)
                     FROM jsonb_array_elements(v_result -> 'dimensions') WITH ORDINALITY y(n, m)
                     JOIN jsonb_array_elements(pr.result -> 'dimensions') o ON o ->> 'key' = n ->> 'key'), '[]'::jsonb);
    FOR s IN SELECT value FROM jsonb_array_elements(v_subjects) LOOP
      v_from := CASE WHEN jsonb_typeof(s -> 'from') = 'number' THEN (s ->> 'from')::numeric END;
      v_to := CASE WHEN jsonb_typeof(s -> 'to') = 'number' THEN (s ->> 'to')::numeric END;
      v_fb := CASE WHEN jsonb_typeof(s -> 'from_band') = 'string' THEN s ->> 'from_band' END;
      v_tb := CASE WHEN jsonb_typeof(s -> 'to_band') = 'string' THEN s ->> 'to_band' END;
      v_triggers := '{}';
      IF (v_from IS NULL) <> (v_to IS NULL) THEN v_triggers := v_triggers || 'determinacy'::text; END IF;
      IF v_fb IS NOT NULL AND v_tb IS NOT NULL AND v_fb <> v_tb THEN v_triggers := v_triggers || 'band_crossing'::text; END IF;
      IF v_from IS NOT NULL AND v_to IS NOT NULL AND abs(v_to - v_from) > (d.model ->> 'change_points')::numeric THEN v_triggers := v_triggers || 'move'::text; END IF;
      IF cardinality(v_triggers) = 0 THEN CONTINUE; END IF;
      -- ANTI-GAMING (shown, gating nothing): an input RESTATED before a favourable change; a value SITTING ON a band's floor
      v_flags := '[]'::jsonb;
      IF v_from IS NOT NULL AND v_to IS NOT NULL AND v_to > v_from THEN
        v_flags := v_flags || coalesce((SELECT jsonb_agg(jsonb_build_object('flag', 'restated_input', 'component', n ->> 'key', 'input_kind', n ->> 'input_kind', 'input_id', n ->> 'input_id',
                                                                          'observed_at', n -> 'observed_at', 'from_value', o -> 'value', 'to_value', n -> 'value',
                                                                          'detail', 'the same observation instant carries another value than at the prior snapshot — the input was restated inside the window before a favourable change'))
                                         FROM jsonb_array_elements(v_result -> 'components') n JOIN jsonb_array_elements(pr.result -> 'components') o ON o ->> 'key' = n ->> 'key'
                                        WHERE (s ->> 'subject' = 'aggregate' OR n ->> 'dimension' = s ->> 'key')
                                          AND n ->> 'observed_at' IS NOT NULL AND (n ->> 'observed_at')::timestamptz = (o ->> 'observed_at')::timestamptz AND (n -> 'value') IS DISTINCT FROM (o -> 'value')), '[]'::jsonb);
      END IF;
      IF v_to IS NOT NULL THEN
        v_flags := v_flags || coalesce((SELECT jsonb_agg(jsonb_build_object('flag', 'on_threshold', 'band', b ->> 'key', 'floor', (b ->> 'min')::numeric, 'value', v_to,
                                                                          'detail', format('the value %s sits within %s point(s) above the floor %s of band %s', v_to, g ->> 'on_threshold_points', b ->> 'min', b ->> 'key')))
                                         FROM jsonb_array_elements(s -> 'bands') b
                                        WHERE (b ->> 'min')::numeric > 0 AND v_to >= (b ->> 'min')::numeric AND v_to - (b ->> 'min')::numeric <= (g ->> 'on_threshold_points')::numeric), '[]'::jsonb);
      END IF;
      /* B36 (0094 §S5) (4b): THE OWNER-EDIT FLAG — an owner edit of a component of this subject inside the definition's window before
         this instant, when the change is FAVOURABLE; the edit ids kept on the change (owner_edit_analysis counts them per owner). */
      v_edit_ids := '{}'; v_owner_flag := false;
      IF v_from IS NOT NULL AND v_to IS NOT NULL AND v_to > v_from THEN
        v_edit_ids := ARRAY(SELECT e.edit_id FROM executive.health_input_edits e
                             WHERE e.definition_id = d.definition_id AND e.edited_at <= v_at AND e.edited_at > v_at - (d.owner_edit_window_days * interval '1 day')
                               AND (s ->> 'subject' = 'aggregate' OR e.component_key IN (SELECT n ->> 'key' FROM jsonb_array_elements(v_result -> 'components') n WHERE n ->> 'dimension' = s ->> 'key'))
                             ORDER BY e.edited_at);
        v_owner_flag := cardinality(v_edit_ids) > 0;
        IF v_owner_flag THEN
          v_flags := v_flags || (SELECT jsonb_agg(jsonb_build_object('flag', 'owner_edit', 'component', e.component_key, 'edit_id', e.edit_id, 'owner', e.editor_principal_id, 'edited_at', e.edited_at,
                                                                     'from_value', e.from_value, 'to_value', e.to_value, 'window_days', d.owner_edit_window_days,
                                                                     'detail', format('the owner of %s restated it %s → %s at %s, inside the %s-day window before this favourable change', e.component_key, coalesce(e.from_value::text, 'none'), e.to_value, e.edited_at, d.owner_edit_window_days)))
                                   FROM executive.health_input_edits e WHERE e.edit_id = ANY (v_edit_ids));
        END IF;
      END IF;
      /* end B36 (4b) */
      v_change := gen_random_uuid();
      INSERT INTO executive.health_score_changes (change_id, scope, tenant_id, domain_id, snapshot_id, prior_snapshot_id, definition_id, definition_version, definition_approved_by, subject, subject_label,
                                                  from_value, to_value, delta, from_band, to_band, triggers, direction, gaming_flags, raised_at, correlation_id,
                                                  /* B36 */ owner_edit_flag, owner_edit_ids)
      VALUES (v_change, 'DOMAIN', p_tenant, p_domain, p_snapshot, pr.snapshot_id, d.definition_id, d.version, d.approved_by, s ->> 'subject', s ->> 'label',
              v_from, v_to, CASE WHEN v_from IS NOT NULL AND v_to IS NOT NULL THEN round(v_to - v_from, 2) END, v_fb, v_tb, v_triggers,
              CASE WHEN v_from IS NULL OR v_to IS NULL THEN 'determinacy' WHEN v_to > v_from THEN 'favourable' ELSE 'unfavourable' END, v_flags, v_now, p_correlation,
              /* B36 */ v_owner_flag, v_edit_ids)
      RETURNING * INTO v_ch;
      INSERT INTO executive.health_score_change_events (event_id, scope, tenant_id, domain_id, change_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, v_change, 'change.raised', p_actor,
              jsonb_build_object('subject', s ->> 'subject', 'from_value', v_from, 'to_value', v_to, 'from_band', v_fb, 'to_band', v_tb, 'triggers', to_jsonb(v_triggers), 'gaming_flags', v_flags,
                                 'snapshot_id', p_snapshot, 'prior_snapshot_id', pr.snapshot_id, /* B36 */ 'owner_edit_flag', v_owner_flag, 'owner_edit_ids', to_jsonb(v_edit_ids)), p_correlation);
      v_changes := v_changes || executive.health_change_answer(v_ch);
    END LOOP;
  END IF;
  RETURN jsonb_build_object('snapshot_id', p_snapshot, 'definition_id', d.definition_id, 'definition_version', d.version, 'formula_version', d.formula_version, 'model_digest', d.model_digest,
                            'at', v_at, 'computed_at', v_now, 'kind', v_kind, 'prior_snapshot_id', pr.snapshot_id, 'replay_of', same.snapshot_id,
                            'reproduced', CASE WHEN same.snapshot_id IS NULL THEN NULL ELSE same.inputs_digest = v_inputs_digest AND same.result_digest = v_result_digest END,
                            'status', v_result ->> 'status', 'aggregate', v_result -> 'aggregate', 'coverage', v_result -> 'coverage', 'inputs_digest', v_inputs_digest, 'result_digest', v_result_digest,
                            'inputs_read', jsonb_array_length(v_inputs), 'result', v_result, 'changes', v_changes,
                            /* B36 */ 'exceptions', v_exc, 'owner_edit_window_days', d.owner_edit_window_days);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION executive.compute_health_score(uuid,uuid,uuid,timestamptz,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION executive.compute_health_score(uuid,uuid,uuid,timestamptz,uuid,uuid) TO eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §S6 REVOCABLE AUTHORITY ACTS
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
ALTER TABLE graph.strategy_authority_acts
  ADD COLUMN revoked_at        timestamptz,
  ADD COLUMN revoked_by        uuid,
  ADD COLUMN revocation_reason text,
  ADD CONSTRAINT gsa_revocation CHECK ((revoked_at IS NULL) = (revoked_by IS NULL) AND (revoked_at IS NULL) = (revocation_reason IS NULL) AND (revoked_at IS NULL OR revoked_at >= recorded_at));
-- an act moves one way: in force → revoked (the three fields set once, from NULL); nothing else of the row changes; nothing is deleted
DROP TRIGGER append_only ON graph.strategy_authority_acts;
CREATE OR REPLACE FUNCTION graph.authority_acts_forward() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'strategy authority acts are append-only: DELETE prohibited' USING ERRCODE = '2F002'; END IF;
  IF OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL OR (to_jsonb(NEW) - ARRAY['revoked_at', 'revoked_by', 'revocation_reason']) <> (to_jsonb(OLD) - ARRAY['revoked_at', 'revoked_by', 'revocation_reason']) THEN
    RAISE EXCEPTION 'strategy authority act % is immutable but for its one revocation', OLD.act_id USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER gsa_forward BEFORE UPDATE OR DELETE ON graph.strategy_authority_acts FOR EACH ROW EXECUTE FUNCTION graph.authority_acts_forward();
COMMENT ON COLUMN graph.strategy_authority_acts.revoked_at IS 'B36 (0094 §S6; F-P6-09 (b)): the act REVOKED by its issuer or a domain administrator, once, with a reason — every read that judges an act in force excludes it from that instant.';

-- the vocabularies the revocation writes (each list copied whole from its declaration in 0089, plus one)
ALTER TABLE graph.measures DROP CONSTRAINT measures_approval_state_check;
ALTER TABLE graph.measures ADD CONSTRAINT measures_approval_state_check CHECK (approval_state IN ('proposed', 'approved', 'rejected', /* B36 */ 'revoked'));
ALTER TABLE graph.measure_events DROP CONSTRAINT measure_events_event_check;
ALTER TABLE graph.measure_events ADD CONSTRAINT measure_events_event_check CHECK (event IN ('measure.defined', 'measure.redefined', 'measure.approved', 'measure.rejected', 'measure.observed', /* B36 */ 'measure.approval_revoked'));
ALTER TABLE graph.alignment_events DROP CONSTRAINT alignment_events_event_check;
ALTER TABLE graph.alignment_events ADD CONSTRAINT alignment_events_event_check CHECK (event IN ('alignment.declared', 'alignment.retired', 'alignment.tradeoff_decided', 'alignment.allocation_decided', /* B36 */ 'alignment.tradeoff_revoked', 'alignment.allocation_revoked'));
ALTER TABLE graph.strategy_events DROP CONSTRAINT strategy_events_event_check;
ALTER TABLE graph.strategy_events ADD CONSTRAINT strategy_events_event_check CHECK (event IN (
  'strategy.declared', 'strategy.linked', 'strategy.unlinked',
  'assumption.verified', 'assumption.unverified', 'assumption.invalidated',
  'strategy.closed', 'strategy.withdrawn',
  -- B32 (0089)
  'strategy.owner_assigned',
  -- B36 (0094 §S6): a set_objective act revoked
  'strategy.objective_unset'));

-- REVOKE: the act's issuer (its approver) or a domain administrator; a reason; a lapsed (expired) or already revoked act is not revoked.
CREATE OR REPLACE FUNCTION graph.revoke_authority_act(p_act uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = graph, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t graph.strategy_authority_acts%ROWTYPE; v_now timestamptz := clock_timestamp(); v_event text; v_object_type text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.strategy.authority.revoke']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM graph.assert_strategy_actor(p_tenant, p_actor, 'strategy revocation rejected');
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(p_reason) > 2000 THEN RAISE EXCEPTION 'strategy revocation rejected (reason): a reason of 8 to 2000 characters says why the act is revoked' USING ERRCODE = '22023'; END IF;
  SELECT * INTO t FROM graph.strategy_authority_acts x WHERE x.act_id = p_act AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'strategy revocation rejected (unknown_act): no authority act % in this domain', p_act USING ERRCODE = '23503'; END IF;
  IF t.approver_principal_id <> p_actor AND NOT decision.holds_role(p_actor, p_tenant, p_domain, 'domain_admin') THEN
    RAISE EXCEPTION 'strategy revocation rejected (not_authority): act % was recorded by %; its issuer or a domain administrator revokes it', p_act, t.approver_principal_id USING ERRCODE = '42501';
  END IF;
  IF t.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'strategy revocation rejected (revoked): act % was revoked at % by %', p_act, t.revoked_at, t.revoked_by USING ERRCODE = '22023'; END IF;
  IF t.expires_at <= v_now THEN RAISE EXCEPTION 'strategy revocation rejected (lapsed): act % expired at %; a lapsed act is not revoked', p_act, t.expires_at USING ERRCODE = '22023'; END IF;
  UPDATE graph.strategy_authority_acts SET revoked_at = v_now, revoked_by = p_actor, revocation_reason = btrim(p_reason) WHERE act_id = p_act;
  IF t.act_kind = 'approve_measure' THEN
    IF t.decision = 'approve' THEN
      UPDATE graph.measures SET approval_state = 'revoked', updated_at = v_now WHERE measure_id = t.subject_id AND approval_act_id = p_act;
    END IF;
    INSERT INTO graph.measure_events (event_id, scope, tenant_id, domain_id, measure_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, t.subject_id, 'measure.approval_revoked', p_actor,
            jsonb_build_object('act_id', p_act, 'decision_revoked', t.decision, 'definition_version', t.subject_version, 'definition_digest', t.subject_digest, 'reason', btrim(p_reason)), p_correlation);
    v_object_type := 'MSR';
  ELSIF t.subject_kind = 'alignment' THEN
    v_event := CASE t.act_kind WHEN 'approve_tradeoff' THEN 'alignment.tradeoff_revoked' ELSE 'alignment.allocation_revoked' END;
    INSERT INTO graph.alignment_events (event_id, scope, tenant_id, domain_id, alignment_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, t.subject_id, v_event, p_actor, jsonb_build_object('act_id', p_act, 'decision_revoked', t.decision, 'reason', btrim(p_reason)), p_correlation);
    v_object_type := 'ALN';
  ELSE
    INSERT INTO graph.strategy_events (event_id, scope, tenant_id, domain_id, strategy_object_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, t.subject_id, 'strategy.objective_unset', p_actor, jsonb_build_object('act_id', p_act, 'decision_revoked', t.decision, 'reason', btrim(p_reason)), p_correlation);
    v_object_type := 'OBJ';
  END IF;
  RETURN jsonb_build_object('act_id', p_act, 'act_kind', t.act_kind, 'subject_kind', t.subject_kind, 'subject_id', t.subject_id, 'subject_version', t.subject_version, 'object_type', v_object_type,
                            'decision_revoked', t.decision, 'approver', t.approver_principal_id, 'revoked_by', p_actor, 'revoked_at', v_now, 'reason', btrim(p_reason),
                            'what_follows', 'every read that judges the act in force — the measure''s approval, the gap view, the detections — sees the revocation from this instant');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.revoke_authority_act(uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.revoke_authority_act(uuid, uuid, uuid, text, uuid, uuid) TO eye_commit;

-- graph.measure_freshness re-declared (0089 lines 2853–2878, whole; ONE change: the revocation predicate beside the act read)
CREATE OR REPLACE FUNCTION graph.measure_freshness(p_tenant uuid, p_domain uuid, p_at timestamptz)
RETURNS TABLE (measure_id uuid, title text, status text, owner_principal_id uuid, objective_ids uuid[], unit text, direction text, target_value numeric, target_date date,
               freshness_days numeric, definition_version int, definition_digest text, approval_state text, approved_now boolean, approval_act_id uuid,
               approval_expires_at timestamptz, last_value numeric, last_observed_at timestamptz, last_source jsonb, observations int, age_days numeric, state text)
LANGUAGE sql STABLE AS $$
  SELECT m.measure_id, s.title, s.status, s.owner_principal_id,
         ARRAY(SELECT a.to_id FROM graph.alignments a WHERE a.kind = 'measures' AND a.from_id = m.measure_id AND a.state = 'active' AND a.tenant_id = m.tenant_id AND a.domain_id = m.domain_id ORDER BY a.declared_at, a.to_id),
         m.unit, m.direction, m.target_value, m.target_date, m.freshness_days, m.definition_version, m.definition_digest, m.approval_state,
         coalesce(act.decision = 'approve' AND act.expires_at > p_at, false), act.act_id, act.expires_at,
         o.value, o.observed_at,
         CASE WHEN o.observation_id IS NULL THEN NULL ELSE jsonb_build_object('kind', o.source_kind, 'id', o.source_id, 'version', o.source_version) END,
         (SELECT count(*)::int FROM graph.measure_observations x WHERE x.measure_id = m.measure_id AND x.observed_at <= p_at AND x.recorded_at <= p_at),
         CASE WHEN o.observation_id IS NULL THEN NULL ELSE round((extract(epoch FROM (p_at - o.observed_at)) / 86400.0)::numeric, 2) END,
         CASE WHEN o.observation_id IS NULL THEN 'no_observation'
              WHEN extract(epoch FROM (p_at - o.observed_at)) > m.freshness_days * 86400 THEN 'stale' ELSE 'fresh' END
    FROM graph.measures m
    JOIN graph.strategy_current s ON s.strategy_object_id = m.measure_id
    LEFT JOIN LATERAL (SELECT x.* FROM graph.measure_observations x WHERE x.measure_id = m.measure_id AND x.observed_at <= p_at AND x.recorded_at <= p_at
                        ORDER BY x.observed_at DESC, x.recorded_at DESC LIMIT 1) o ON true
    LEFT JOIN LATERAL (SELECT t.* FROM graph.strategy_authority_acts t WHERE t.act_kind = 'approve_measure' AND t.subject_id = m.measure_id AND t.subject_digest = m.definition_digest
                          AND t.recorded_at <= p_at AND (t.revoked_at IS NULL OR t.revoked_at > p_at) ORDER BY t.recorded_at DESC LIMIT 1) act ON true
   WHERE m.tenant_id = p_tenant AND m.domain_id = p_domain
   ORDER BY s.title, m.measure_id;
$$;
REVOKE ALL ON FUNCTION graph.measure_freshness(uuid, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.measure_freshness(uuid, uuid, timestamptz) TO eye_app, eye_commit;

-- graph.record_strategy_authority_act re-declared (0089 lines 2883–2963, whole; ONE change: a revoked act is no duplicate)
CREATE OR REPLACE FUNCTION graph.record_strategy_authority_act(
  p_act_id uuid, p_tenant uuid, p_domain uuid, p_act_kind text, p_subject uuid, p_subject_digest text, p_decision text, p_rationale text,
  p_expires_at timestamptz, p_actor uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = graph, objects, decision, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_subject_kind text; st record; v_eligible text; r text; v_prior uuid; v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['graph.strategy.authority.act']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  PERFORM graph.assert_strategy_actor(p_tenant, p_actor, 'strategy authority rejected');
  v_subject_kind := CASE p_act_kind WHEN 'set_objective' THEN 'strategy' WHEN 'approve_measure' THEN 'measure' WHEN 'approve_tradeoff' THEN 'alignment' WHEN 'allocate_resource' THEN 'alignment' END;
  IF v_subject_kind IS NULL THEN
    RAISE EXCEPTION 'strategy authority rejected (act_kind): % is not an authority act (set_objective, approve_measure, approve_tradeoff, allocate_resource)', coalesce(p_act_kind, '<none>') USING ERRCODE = '22023';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'strategy authority rejected (decision): the decision is approve or reject' USING ERRCODE = '22023';
  END IF;
  IF p_rationale IS NULL OR length(btrim(p_rationale)) < 8 OR length(p_rationale) > 4096 THEN
    RAISE EXCEPTION 'strategy authority rejected (rationale): a rationale of 8 to 4096 characters says why' USING ERRCODE = '22023';
  END IF;
  IF p_subject_digest IS NULL OR p_subject_digest !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'strategy authority rejected (digest): the act names the digest of the subject version the approver read (64 hex)' USING ERRCODE = '22023';
  END IF;
  IF p_expires_at IS NULL OR p_expires_at <= v_now OR p_expires_at > v_now + interval '366 days' THEN
    RAISE EXCEPTION 'strategy authority rejected (expiry): an act expires after now and within 366 days' USING ERRCODE = '22023';
  END IF;
  -- ELIGIBILITY: the first planning authority the approver holds in this domain (the PDP admitted the action; the port names the role)
  FOREACH r IN ARRAY ARRAY['executive', 'decision_authority', 'domain_admin', 'strategy_owner'] LOOP
    IF decision.holds_role(p_actor, p_tenant, p_domain, r) THEN v_eligible := 'role:' || r; EXIT; END IF;
  END LOOP;
  IF v_eligible IS NULL THEN
    RAISE EXCEPTION 'strategy authority rejected (not_eligible): principal % holds none of executive, decision_authority, domain_admin, strategy_owner in this domain', p_actor USING ERRCODE = '42501';
  END IF;
  SELECT * INTO st FROM graph.strategy_subject_state(p_tenant, p_domain, v_subject_kind, p_subject);
  IF st.subject_digest IS NULL THEN
    RAISE EXCEPTION 'strategy authority rejected (unknown_subject): no % % in this domain', CASE v_subject_kind WHEN 'measure' THEN 'measure defined for' ELSE v_subject_kind END, p_subject USING ERRCODE = '23503';
  END IF;
  IF (p_act_kind = 'set_objective' AND st.subject_type <> 'OBJ') OR (p_act_kind = 'approve_tradeoff' AND st.subject_type <> 'conflicts_with')
     OR (p_act_kind = 'allocate_resource' AND st.subject_type <> 'resources') THEN
    RAISE EXCEPTION 'strategy authority rejected (subject): % names % (a %); set_objective names an objective, approve_tradeoff a conflicts_with alignment, allocate_resource a resources alignment',
      p_act_kind, p_subject, st.subject_type USING ERRCODE = '22023';
  END IF;
  IF st.subject_status NOT IN ('active') THEN
    RAISE EXCEPTION 'strategy authority rejected (inactive): % is %; an authority act names an active subject', p_subject, st.subject_status USING ERRCODE = '22023';
  END IF;
  IF v_subject_kind IN ('strategy', 'measure') AND NOT decision.is_active_human(st.owner, p_tenant) THEN
    RAISE EXCEPTION 'strategy authority rejected (missing_owner): % has no active human owner; an owner is assigned first (graph.assign_strategy_owner)', p_subject USING ERRCODE = '22023';
  END IF;
  IF st.subject_digest <> p_subject_digest THEN
    RAISE EXCEPTION 'strategy authority rejected (stale_digest): the approver read %; % is now version % (%)', p_subject_digest, p_subject, st.subject_version, st.subject_digest USING ERRCODE = '22023';
  END IF;
  IF st.declarer = p_actor THEN
    RAISE EXCEPTION 'strategy authority rejected (separation): principal % declared %; the declarer never records the authority act on it', p_actor, p_subject USING ERRCODE = '42501';
  END IF;
  SELECT t.act_id INTO v_prior FROM graph.strategy_authority_acts t
   WHERE t.subject_id = p_subject AND t.act_kind = p_act_kind AND t.subject_digest = p_subject_digest AND t.approver_principal_id = p_actor AND t.expires_at > v_now AND t.revoked_at IS NULL
   ORDER BY t.recorded_at DESC LIMIT 1;
  IF v_prior IS NOT NULL THEN
    RAISE EXCEPTION 'strategy authority rejected (duplicate): act % already records this approver''s % on this version', v_prior, p_act_kind USING ERRCODE = '22023';
  END IF;
  INSERT INTO graph.strategy_authority_acts (act_id, scope, tenant_id, domain_id, act_kind, subject_kind, subject_id, subject_version, subject_digest, decision, rationale,
                                             eligible_by, approver_principal_id, declarer_principal_id, expires_at, correlation_id)
  VALUES (p_act_id, 'DOMAIN', p_tenant, p_domain, p_act_kind, v_subject_kind, p_subject, st.subject_version, p_subject_digest, p_decision, p_rationale,
          v_eligible, p_actor, st.declarer, p_expires_at, p_correlation);
  IF p_act_kind = 'approve_measure' THEN
    UPDATE graph.measures SET approval_state = CASE p_decision WHEN 'approve' THEN 'approved' ELSE 'rejected' END, approval_act_id = p_act_id, updated_at = v_now
     WHERE measure_id = p_subject;
    INSERT INTO graph.measure_events (event_id, scope, tenant_id, domain_id, measure_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_subject, CASE p_decision WHEN 'approve' THEN 'measure.approved' ELSE 'measure.rejected' END, p_actor,
            jsonb_build_object('act_id', p_act_id, 'definition_version', st.subject_version, 'definition_digest', p_subject_digest, 'expires_at', p_expires_at, 'eligible_by', v_eligible), p_correlation);
  ELSIF v_subject_kind = 'alignment' THEN
    INSERT INTO graph.alignment_events (event_id, scope, tenant_id, domain_id, alignment_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_subject, CASE p_act_kind WHEN 'approve_tradeoff' THEN 'alignment.tradeoff_decided' ELSE 'alignment.allocation_decided' END, p_actor,
            jsonb_build_object('act_id', p_act_id, 'decision', p_decision, 'expires_at', p_expires_at, 'eligible_by', v_eligible), p_correlation);
  END IF;
  RETURN jsonb_build_object('act_id', p_act_id, 'act_kind', p_act_kind, 'subject_kind', v_subject_kind, 'subject_id', p_subject, 'subject_version', st.subject_version,
                            'subject_digest', p_subject_digest, 'decision', p_decision, 'eligible_by', v_eligible, 'approver', p_actor, 'declarer', st.declarer,
                            'expires_at', p_expires_at, 'recorded_at', v_now);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.record_strategy_authority_act(uuid, uuid, uuid, text, uuid, text, text, text, timestamptz, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.record_strategy_authority_act(uuid, uuid, uuid, text, uuid, text, text, text, timestamptz, uuid, uuid) TO eye_commit;

-- graph.strategy_detections (the 0089 READ, kept as the page's "as of this read" view) re-declared (0089 lines 3010–3111, whole; ONE change: the revocation predicate beside the act read)
CREATE OR REPLACE FUNCTION graph.strategy_detections(p_tenant uuid, p_domain uuid, p_at timestamptz)
RETURNS TABLE (detection_kind text, detection_key text, state text, subject_ids uuid[], subjects jsonb, detail text, continuity text, continuity_detail text,
               affected_ids uuid[], routed_to uuid[], path jsonb, resolved_by uuid)
LANGUAGE sql STABLE AS $$
  WITH RECURSIVE s AS (
    SELECT x.* FROM graph.strategy_current x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain
  ), subj AS (
    SELECT s.strategy_object_id AS id, jsonb_build_object('id', s.strategy_object_id, 'type', s.object_type, 'title', s.title, 'status', s.status,
                                                          'owner', s.owner_principal_id, 'owner_active_human', decision.is_active_human(s.owner_principal_id, p_tenant)) AS j
      FROM s
  ), conflicts AS (
    SELECT a.alignment_id, a.from_id, a.to_id, a.digest,
           (SELECT t.act_id FROM graph.strategy_authority_acts t
             WHERE t.act_kind = 'approve_tradeoff' AND t.subject_id = a.alignment_id AND t.subject_digest = a.digest AND t.recorded_at <= p_at AND (t.revoked_at IS NULL OR t.revoked_at > p_at)
             ORDER BY t.recorded_at DESC LIMIT 1) AS last_act
      FROM graph.alignments a
     WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.kind = 'conflicts_with' AND a.state = 'active'
  ), edges AS (
    SELECT DISTINCT d.dependent_object_id AS a, d.depends_on_id AS b
      FROM graph.dependencies d
      JOIN s sa ON sa.strategy_object_id = d.dependent_object_id AND sa.status = 'active'
      JOIN s sb ON sb.strategy_object_id = d.depends_on_id AND sb.status = 'active'
     WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.state = 'active' AND d.depends_on_kind = 'strategy'
  ), walk(start, node, path, closed) AS (
    SELECT e.a, e.b, ARRAY[e.a, e.b], false FROM edges e
    UNION ALL
    SELECT w.start, e.b, w.path || e.b, e.b = w.start
      FROM walk w JOIN edges e ON e.a = w.node
     WHERE NOT w.closed AND (e.b = w.start OR NOT e.b = ANY (w.path)) AND cardinality(w.path) < 64
  ), cycles AS (
    SELECT DISTINCT w.path FROM walk w
     WHERE w.closed AND w.start::text = (SELECT min(x::text) FROM unnest(w.path) x)
  ), fr AS (
    SELECT f.* FROM graph.measure_freshness(p_tenant, p_domain, p_at) f WHERE f.status = 'active' AND f.state <> 'fresh'
  )
  SELECT q.detection_kind, q.detection_key, q.state, q.subject_ids, q.subjects, q.detail, q.continuity, q.continuity_detail, q.affected_ids, q.routed_to, q.path, q.resolved_by FROM (
    -- CONFLICT: two objectives (or initiatives) declared in conflict; HOLD — no health or alignment claim over either while it stands,
    -- both alternatives preserved; routed to both owners for a trade-off; resolved by an unexpired approve_tradeoff act on its digest.
    SELECT 'conflict'::text, 'conflict:' || c.alignment_id::text,
           CASE WHEN act.decision = 'approve' AND act.expires_at > p_at THEN 'resolved' ELSE 'open' END,
           ARRAY[c.from_id, c.to_id],
           (SELECT jsonb_agg(subj.j ORDER BY subj.id) FROM subj WHERE subj.id IN (c.from_id, c.to_id)),
           format('alignment %s declares %s and %s in conflict%s', c.alignment_id, c.from_id, c.to_id,
                  CASE WHEN act.act_id IS NULL THEN '; no trade-off has been decided'
                       WHEN act.decision = 'approve' AND act.expires_at > p_at THEN format('; trade-off approved by act %s until %s', act.act_id, act.expires_at)
                       WHEN act.decision = 'approve' THEN format('; the trade-off approved by act %s expired at %s', act.act_id, act.expires_at)
                       ELSE format('; the trade-off was rejected by act %s', act.act_id) END),
           'hold'::text,
           'no health or alignment claim is made over either object while the conflict stands; both alternatives are preserved; a human authority decides the trade-off (approve_tradeoff)'::text,
           ARRAY[c.from_id, c.to_id],
           (SELECT coalesce(array_agg(DISTINCT u.r ORDER BY u.r), ARRAY[]::uuid[]) FROM unnest(graph.strategy_review_route(p_tenant, p_domain, c.from_id) || graph.strategy_review_route(p_tenant, p_domain, c.to_id)) AS u(r)),
           NULL::jsonb,
           CASE WHEN act.decision = 'approve' AND act.expires_at > p_at THEN act.act_id END,
           CASE WHEN act.decision = 'approve' AND act.expires_at > p_at THEN 1 ELSE 0 END AS o_state, 1 AS o_cont
      FROM conflicts c LEFT JOIN graph.strategy_authority_acts act ON act.act_id = c.last_act
    UNION ALL
    -- CYCLE: a dependency cycle among active strategy objects (the mirrors included); HOLD — no alignment claim over the objects on it
    -- until a link is removed (retire an alignment); routed to their owners.
    SELECT 'cycle', 'cycle:' || array_to_string(cy.path[1:cardinality(cy.path) - 1], '>'), 'open',
           cy.path[1:cardinality(cy.path) - 1],
           (SELECT jsonb_agg(subj.j ORDER BY subj.id) FROM subj WHERE subj.id = ANY (cy.path)),
           format('a dependency cycle of %s strategy objects: %s', cardinality(cy.path) - 1,
                  (SELECT string_agg(coalesce(s.object_type || ' "' || s.title || '"', n::text), ' rests on ' ORDER BY i) FROM unnest(cy.path) WITH ORDINALITY u(n, i) LEFT JOIN s ON s.strategy_object_id = u.n)),
           'hold',
           'the objects on the cycle are held: no alignment or health claim rests on a circular justification; a person removes a link (retires an alignment or a dependency)',
           cy.path[1:cardinality(cy.path) - 1],
           (SELECT coalesce(array_agg(DISTINCT v.r ORDER BY v.r), ARRAY[]::uuid[]) FROM unnest(cy.path) AS u(n), unnest(graph.strategy_review_route(p_tenant, p_domain, u.n)) AS v(r)),
           (SELECT jsonb_agg(jsonb_build_object('id', u.n, 'type', s.object_type, 'title', s.title) ORDER BY u.i) FROM unnest(cy.path) WITH ORDINALITY u(n, i) LEFT JOIN s ON s.strategy_object_id = u.n),
           NULL::uuid, 0, 1
      FROM cycles cy
    UNION ALL
    -- MISSING OWNER: an active object whose owner is not an active human; ROUTE TO OWNER — the planning review assigns one; authority
    -- acts naming it are refused until then.
    SELECT 'missing_owner', 'missing_owner:' || s.strategy_object_id::text, 'open',
           ARRAY[s.strategy_object_id],
           (SELECT jsonb_agg(subj.j) FROM subj WHERE subj.id = s.strategy_object_id),
           format('%s "%s" is owned by %s, who is not an active human', s.object_type, s.title, s.owner_principal_id),
           'route_to_owner',
           'routed to the accountable planning review (the parent objective''s owner, else the domain''s strategy owners and administrators) to assign an owner; authority acts naming it are refused until one is',
           ARRAY[s.strategy_object_id],
           graph.strategy_review_route(p_tenant, p_domain, s.strategy_object_id),
           NULL::jsonb, NULL::uuid, 0, 2
      FROM s WHERE s.status = 'active' AND NOT decision.is_active_human(s.owner_principal_id, p_tenant)
    UNION ALL
    -- STALE MEASURE: a measure never observed or older than its window; EXPOSE AFFECTED SCOPE — the measured objectives named, the
    -- measure's input declared stale (never current); routed to the measure's owner.
    SELECT 'stale_measure', 'stale_measure:' || f.measure_id::text, 'open',
           ARRAY[f.measure_id],
           (SELECT jsonb_agg(subj.j ORDER BY subj.id) FROM subj WHERE subj.id = f.measure_id OR subj.id = ANY (f.objective_ids)),
           CASE WHEN f.state = 'no_observation' THEN format('measure "%s" has no observation at or before %s (window %s day(s))', f.title, p_at, f.freshness_days)
                ELSE format('measure "%s" was last observed %s day(s) before %s (window %s day(s))', f.title, f.age_days, p_at, f.freshness_days) END,
           'expose_affected_scope',
           'the measured objectives are named as affected; the measure is an input declared stale, never presented as current; the owner refreshes it',
           ARRAY[f.measure_id] || f.objective_ids,
           graph.strategy_review_route(p_tenant, p_domain, f.measure_id),
           NULL::jsonb, NULL::uuid, 0, 3
      FROM fr f
  ) q(detection_kind, detection_key, state, subject_ids, subjects, detail, continuity, continuity_detail, affected_ids, routed_to, path, resolved_by, o_state, o_cont)
  ORDER BY q.o_state, q.o_cont, q.detection_key;
$$;
REVOKE ALL ON FUNCTION graph.strategy_detections(uuid, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.strategy_detections(uuid, uuid, timestamptz) TO eye_app, eye_commit;

-- graph.alignment_gaps re-declared (0089 lines 3116–3231, whole; ONE change: the revocation predicate beside each of the two act reads)
CREATE OR REPLACE FUNCTION graph.alignment_gaps(p_tenant uuid, p_domain uuid, p_objective uuid, p_at timestamptz)
RETURNS TABLE (objective_id uuid, objective_title text, objective_owner uuid, objective_subject jsonb, objective_set jsonb, capability_id uuid, capability_title text,
               alignment_id uuid, strength text, evidence_count int, strongest_truth text, evidence jsonb, initiatives jsonb, initiatives_active int, initiatives_resourced int,
               measures jsonb, criteria jsonb, criteria_met int, criteria_total int, gap_reasons text[], held_by jsonb, alignment_claim text, rule text)
LANGUAGE sql STABLE AS $$
  WITH o AS (
    SELECT x.* FROM graph.strategy_current x
     WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.object_type = 'OBJ' AND x.status = 'active' AND (p_objective IS NULL OR x.strategy_object_id = p_objective)
  ), det AS (
    SELECT d.* FROM graph.strategy_detections(p_tenant, p_domain, p_at) d WHERE d.state = 'open' AND d.continuity = 'hold'
  ), fr AS (
    SELECT f.* FROM graph.measure_freshness(p_tenant, p_domain, p_at) f WHERE f.status = 'active'
  ), pairs AS (
    SELECT o.strategy_object_id AS oid, o.title AS otitle, o.owner_principal_id AS oowner, c.strategy_object_id AS cid, c.title AS ctitle, a.alignment_id, a.strength, a.evidence AS aev
      FROM o
      LEFT JOIN graph.alignments a ON a.kind = 'supports' AND a.from_id = o.strategy_object_id AND a.state = 'active' AND a.tenant_id = p_tenant AND a.domain_id = p_domain
      LEFT JOIN graph.strategy_current c ON c.strategy_object_id = a.to_id AND c.status = 'active'
  ), rows AS (
    SELECT p.*,
           ss.subject_version AS oversion, ss.subject_digest AS odigest,
           setact.act_id AS set_act, setact.decision AS set_decision, setact.expires_at AS set_expires,
           coalesce(ev.refs, '[]'::jsonb) AS refs, coalesce(ev.n, 0) AS ev_n, ev.best AS ev_best,
           coalesce(ini.list, '[]'::jsonb) AS ini_list, coalesce(ini.active, 0) AS ini_active, coalesce(ini.resourced, 0) AS ini_resourced,
           coalesce(ms.list, '[]'::jsonb) AS ms_list, coalesce(ms.n, 0) AS ms_n, coalesce(ms.approved, 0) AS ms_approved, coalesce(ms.current, 0) AS ms_current,
           coalesce(hold.list, '[]'::jsonb) AS hold_list
      FROM pairs p
      LEFT JOIN LATERAL (SELECT * FROM graph.strategy_subject_state(p_tenant, p_domain, 'strategy', p.oid)) ss ON true
      LEFT JOIN LATERAL (SELECT t.* FROM graph.strategy_authority_acts t
                          WHERE t.act_kind = 'set_objective' AND t.subject_id = p.oid AND t.subject_digest = ss.subject_digest AND t.recorded_at <= p_at AND (t.revoked_at IS NULL OR t.revoked_at > p_at)
                          ORDER BY t.recorded_at DESC LIMIT 1) setact ON true
      -- the capability's evidence: what it rests on (claims, evidence) and what the supports alignment cites — each resolved, withdrawn excluded
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object('kind', r.kind, 'id', r.id, 'version', co.object_version, 'truth_state', co.truth_state, 'lifecycle_state', co.lifecycle_state,
                                            'counted', co.object_id IS NOT NULL AND co.lifecycle_state <> 'withdrawn' AND graph.strategy_truth_rank(co.truth_state) > 0) ORDER BY r.kind, r.id) AS refs,
               count(*) FILTER (WHERE co.object_id IS NOT NULL AND co.lifecycle_state <> 'withdrawn' AND graph.strategy_truth_rank(co.truth_state) > 0)::int AS n,
               (array_agg(co.truth_state ORDER BY graph.strategy_truth_rank(co.truth_state) DESC) FILTER (WHERE co.object_id IS NOT NULL AND co.lifecycle_state <> 'withdrawn' AND graph.strategy_truth_rank(co.truth_state) > 0))[1] AS best
          FROM (SELECT DISTINCT d.depends_on_kind AS kind, d.depends_on_id AS id FROM graph.dependencies d
                 WHERE p.cid IS NOT NULL AND d.dependent_object_id = p.cid AND d.state = 'active' AND d.depends_on_kind IN ('claim', 'evidence')
                UNION
                SELECT e ->> 'kind', (e ->> 'id')::uuid FROM jsonb_array_elements(coalesce(p.aev, '[]'::jsonb)) e WHERE p.cid IS NOT NULL) r
          LEFT JOIN LATERAL (SELECT * FROM graph.strategy_cited_object(p_tenant, p_domain, r.kind, r.id)) co ON true
      ) ev ON true
      -- the initiatives building it: active; resourced = an active resources alignment whose allocation a human authority approved (unexpired, on its digest)
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object('initiative_id', i.strategy_object_id, 'title', i.title, 'status', i.status, 'resourced', rs.ok, 'resources', rs.list) ORDER BY i.title) AS list,
               count(*) FILTER (WHERE i.status = 'active')::int AS active,
               count(*) FILTER (WHERE i.status = 'active' AND rs.ok)::int AS resourced
          FROM graph.alignments b
          JOIN graph.strategy_current i ON i.strategy_object_id = b.from_id
          LEFT JOIN LATERAL (
            SELECT coalesce(bool_or(al.ok), false) AS ok,
                   coalesce(jsonb_agg(jsonb_build_object('alignment_id', al.alignment_id, 'resource_id', al.from_id, 'title', al.title, 'allocation_act', al.act_id, 'allocation_approved', al.ok)), '[]'::jsonb) AS list
              FROM (SELECT ra.alignment_id, ra.from_id, rsc.title, act.act_id, coalesce(act.decision = 'approve' AND act.expires_at > p_at, false) AS ok
                      FROM graph.alignments ra
                      JOIN graph.strategy_current rsc ON rsc.strategy_object_id = ra.from_id AND rsc.status = 'active'
                      LEFT JOIN LATERAL (SELECT t.* FROM graph.strategy_authority_acts t WHERE t.act_kind = 'allocate_resource' AND t.subject_id = ra.alignment_id AND t.subject_digest = ra.digest
                                           AND t.recorded_at <= p_at AND (t.revoked_at IS NULL OR t.revoked_at > p_at) ORDER BY t.recorded_at DESC LIMIT 1) act ON true
                     WHERE ra.kind = 'resources' AND ra.to_id = i.strategy_object_id AND ra.state = 'active') al
          ) rs ON true
         WHERE p.cid IS NOT NULL AND b.kind = 'builds' AND b.to_id = p.cid AND b.state = 'active'
      ) ini ON true
      -- the objective's measures: approved at the instant and fresh
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object('measure_id', f.measure_id, 'title', f.title, 'approved', f.approved_now, 'approval_state', f.approval_state, 'state', f.state,
                                            'age_days', f.age_days, 'freshness_days', f.freshness_days, 'last_value', f.last_value, 'unit', f.unit, 'target_value', f.target_value) ORDER BY f.title) AS list,
               count(*)::int AS n, count(*) FILTER (WHERE f.approved_now)::int AS approved, count(*) FILTER (WHERE f.approved_now AND f.state = 'fresh')::int AS current
          FROM fr f WHERE p.oid = ANY (f.objective_ids)
      ) ms ON true
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object('kind', d.detection_kind, 'key', d.detection_key, 'continuity', d.continuity) ORDER BY d.detection_key) AS list
          FROM det d WHERE p.oid = ANY (d.subject_ids) OR (p.cid IS NOT NULL AND p.cid = ANY (d.subject_ids))
      ) hold ON true
  ), judged AS (
    SELECT r.*,
           (r.set_decision = 'approve' AND r.set_expires > p_at) AS c_set,
           (r.cid IS NOT NULL AND r.ev_n >= 2 AND graph.strategy_truth_rank(r.ev_best) >= 4) AS c_evidence,
           (r.ini_active > 0) AS c_ini,
           (r.ini_resourced > 0) AS c_res,
           (r.ms_current > 0) AS c_ms
      FROM rows r
  )
  SELECT j.oid, j.otitle, j.oowner, jsonb_build_object('kind', 'strategy', 'version', j.oversion, 'digest', j.odigest),
         jsonb_build_object('set', coalesce(j.c_set, false), 'act_id', j.set_act, 'decision', j.set_decision, 'expires_at', j.set_expires),
         j.cid, j.ctitle, j.alignment_id, j.strength, j.ev_n, j.ev_best, j.refs, j.ini_list, j.ini_active, j.ini_resourced, j.ms_list,
         jsonb_build_array(
           jsonb_build_object('criterion', 'objective_set', 'met', coalesce(j.c_set, false),
                              'basis', CASE WHEN coalesce(j.c_set, false) THEN format('set by act %s until %s', j.set_act, j.set_expires)
                                            WHEN j.set_act IS NULL THEN 'no human authority has set this objective version'
                                            WHEN j.set_decision = 'reject' THEN format('act %s rejected it', j.set_act) ELSE format('act %s expired at %s', j.set_act, j.set_expires) END),
           jsonb_build_object('criterion', 'capability_evidenced', 'met', j.c_evidence,
                              'basis', CASE WHEN j.cid IS NULL THEN 'no capability supports this objective'
                                            ELSE format('%s counted evidence ref(s), the strongest %s (the rule: at least 2, one observed or extracted)', j.ev_n, coalesce(j.ev_best, 'none')) END),
           jsonb_build_object('criterion', 'initiative_active', 'met', j.c_ini, 'basis', format('%s active initiative(s) build the capability', j.ini_active)),
           jsonb_build_object('criterion', 'initiative_resourced', 'met', j.c_res, 'basis', format('%s initiative(s) with an allocation approved by a human authority', j.ini_resourced)),
           jsonb_build_object('criterion', 'measure_current', 'met', j.c_ms,
                              'basis', format('%s measure(s): %s approved at the instant, %s approved and fresh', j.ms_n, j.ms_approved, j.ms_current))),
         (coalesce(j.c_set, false)::int + j.c_evidence::int + j.c_ini::int + j.c_res::int + j.c_ms::int),
         5,
         array_remove(ARRAY[
           CASE WHEN NOT coalesce(j.c_set, false) THEN 'objective_not_set' END,
           CASE WHEN j.cid IS NULL THEN 'no_capability' WHEN NOT j.c_evidence THEN 'capability_under_evidenced' END,
           CASE WHEN j.cid IS NOT NULL AND NOT j.c_ini THEN 'no_active_initiative' END,
           CASE WHEN j.cid IS NOT NULL AND j.c_ini AND NOT j.c_res THEN 'initiative_unresourced' END,
           CASE WHEN j.ms_n = 0 THEN 'no_measure' WHEN j.ms_approved = 0 THEN 'measure_unapproved' WHEN NOT j.c_ms THEN 'measure_stale' END,
           CASE WHEN jsonb_array_length(j.hold_list) > 0 THEN 'held_by_detection' END], NULL),
         j.hold_list,
         CASE WHEN jsonb_array_length(j.hold_list) > 0 THEN 'held'
              WHEN coalesce(j.c_set, false) AND j.c_evidence AND j.c_ini AND j.c_res AND j.c_ms THEN 'supported' ELSE 'gap' END,
         'alignment_rule@1: set by a human authority; the capability evidenced by at least 2 counted refs, one observed or extracted; an active initiative builds it; an allocation approved by a human authority resources it; an approved measure is fresh — each criterion shown, none averaged'::text
    FROM judged j
   ORDER BY (jsonb_array_length(j.hold_list) > 0) DESC,
            (coalesce(j.c_set, false)::int + j.c_evidence::int + j.c_ini::int + j.c_res::int + j.c_ms::int),
            j.otitle, j.ctitle NULLS FIRST, j.cid;
$$;
REVOKE ALL ON FUNCTION graph.alignment_gaps(uuid, uuid, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.alignment_gaps(uuid, uuid, uuid, timestamptz) TO eye_app, eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §S7 THE DETECTIONS RAISED ON A SCHEDULE AND ROUTED
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- The TABLE graph.strategy_detections (the 0089 READ of the same name keeps its role: "as of this read"; a function and a table share a
-- name without conflict). Each row is raised ONCE per (kind, subject, cause) by the tick and routed in the same call.
CREATE TABLE graph.strategy_detections (
  detection_id       uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  kind               text NOT NULL CHECK (kind IN ('stale_measure', 'gamed_measure', 'lost_linkage', 'owner_missing')),
  subject_id         uuid NOT NULL,
  subject_type       text NOT NULL,
  measure_id         uuid,
  cause_key          text NOT NULL,
  detail             text NOT NULL,
  owner_principal_id uuid,
  routed_item_id     uuid,
  routing            jsonb NOT NULL DEFAULT '{}'::jsonb,
  raised_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  raised_by          uuid NOT NULL,
  correlation_id     uuid NOT NULL,
  CONSTRAINT gsd_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT gsd_once UNIQUE (tenant_id, domain_id, kind, subject_id, cause_key)
);
CREATE INDEX gsd_subject ON graph.strategy_detections (tenant_id, domain_id, subject_id, raised_at DESC);
CREATE TRIGGER gsd_append_only BEFORE UPDATE OR DELETE ON graph.strategy_detections FOR EACH ROW EXECUTE FUNCTION public.raise_append_only();
COMMENT ON TABLE graph.strategy_detections IS 'B36 (0094 §S7; F-P6-09 (c)): the Strategy Graph detections RAISED ON A SCHEDULE by the attention tick (step strategy-detections) — stale_measure, gamed_measure (an owner edit flagged on a favourable score change), lost_linkage (an approved measure measuring no active objective), owner_missing — each once per cause and ROUTED as an attention item of class strategy.detection to the object''s owner; append-only.';

-- THE TICK STEP: what the schedule finds at now that is not yet raised, each recorded and routed under the ACTIVE attention policy
-- (evaluated, routed to the owner and the class's roles, deprioritized when the policy says so — the queue's own rule, 0083 §5).
CREATE OR REPLACE FUNCTION graph.raise_strategy_detections(p_tenant uuid, p_domain uuid, p_actor uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = graph, executive, decision, identity, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_now timestamptz := clock_timestamp(); c record; pol executive.attention_policies%ROWTYPE; v_eval jsonb; v_route jsonb; v_state text; v_owner uuid; v_item uuid; v_det uuid;
        v_raised jsonb := '[]'::jsonb; v_title text;
BEGIN
  PERFORM observation.assert_authority(ARRAY['executive.attention.tick']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO pol FROM executive.attention_policies a WHERE a.tenant_id = p_tenant AND a.domain_id = p_domain AND a.state = 'active';
  FOR c IN
    -- STALE MEASURE: an approved, active measure never observed or older than its window (once per last observation)
    SELECT 'stale_measure'::text AS kind, f.measure_id AS subject_id, 'MSR'::text AS subject_type, f.measure_id, coalesce(f.last_observed_at::text, 'none') AS cause_key, f.owner_principal_id AS owner,
           CASE WHEN f.state = 'no_observation' THEN format('measure "%s" has no observation at %s (window %s day(s))', f.title, v_now, f.freshness_days)
                ELSE format('measure "%s" was last observed %s day(s) before %s (window %s day(s))', f.title, f.age_days, v_now, f.freshness_days) END AS detail,
           f.title
      FROM graph.measure_freshness(p_tenant, p_domain, v_now) f WHERE f.status = 'active' AND f.approved_now AND f.state <> 'fresh'
    UNION ALL
    -- LOST LINKAGE: an approved, active measure that measures no ACTIVE objective any more (its measures alignment retired or the objective closed)
    SELECT 'lost_linkage', f.measure_id, 'MSR', f.measure_id, 'v' || f.definition_version::text, f.owner_principal_id,
           format('measure "%s" (definition v%s) is approved but measures no active objective: its measures alignment is retired or the objective is no longer active', f.title, f.definition_version), f.title
      FROM graph.measure_freshness(p_tenant, p_domain, v_now) f
     WHERE f.status = 'active' AND f.approved_now
       AND NOT EXISTS (SELECT 1 FROM unnest(f.objective_ids) o JOIN graph.strategy_current s ON s.strategy_object_id = o AND s.status = 'active')
    UNION ALL
    -- OWNER MISSING: the 0089 read's missing_owner detection, routed to the planning review's first person
    SELECT 'owner_missing', d.subject_ids[1], (d.subjects -> 0 ->> 'type'), NULL::uuid, coalesce(d.subjects -> 0 ->> 'owner', 'none'), d.routed_to[1], d.detail, (d.subjects -> 0 ->> 'title')
      FROM graph.strategy_detections(p_tenant, p_domain, v_now) d WHERE d.detection_kind = 'missing_owner' AND d.state = 'open'
    UNION ALL
    -- GAMED MEASURE: an owner edit of a MEASURE input flagged on a favourable score change (§S5) — once per edit (the dimension's change
    -- named first, the aggregate's only when no dimension change flags it), routed to the measured objective's owner (accountable above the editor)
    SELECT 'gamed_measure', g.input_ref, 'MSR', g.input_ref, g.edit_id::text,
           (SELECT s.owner_principal_id FROM graph.measures m JOIN graph.strategy_current s ON s.strategy_object_id = m.objective_id WHERE m.measure_id = g.input_ref),
           format('the owner of measure "%s" restated it %s → %s at %s, inside the %s-day window before a favourable change of %s (score change %s)',
                  coalesce((SELECT s.title FROM graph.strategy_current s WHERE s.strategy_object_id = g.input_ref), g.input_ref::text), coalesce(g.from_value::text, 'none'), g.to_value, g.edited_at,
                  (SELECT x.owner_edit_window_days FROM executive.health_score_definitions x WHERE x.definition_id = g.definition_id), g.subject, g.change_id),
           coalesce((SELECT s.title FROM graph.strategy_current s WHERE s.strategy_object_id = g.input_ref), g.input_ref::text)
      FROM (SELECT DISTINCT ON (e.edit_id) e.edit_id, e.input_ref, e.from_value, e.to_value, e.edited_at, e.definition_id, ch.subject, ch.change_id
              FROM executive.health_input_edits e
              JOIN executive.health_score_changes ch ON ch.owner_edit_flag AND e.edit_id = ANY (ch.owner_edit_ids) AND ch.tenant_id = p_tenant AND ch.domain_id = p_domain
             WHERE e.tenant_id = p_tenant AND e.domain_id = p_domain AND e.input_kind = 'measure'
             ORDER BY e.edit_id, (ch.subject = 'aggregate'), ch.raised_at) g
  LOOP
    IF c.subject_id IS NULL THEN CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM graph.strategy_detections x WHERE x.tenant_id = p_tenant AND x.domain_id = p_domain AND x.kind = c.kind AND x.subject_id = c.subject_id AND x.cause_key = c.cause_key) THEN CONTINUE; END IF;
    v_det := gen_random_uuid(); v_item := gen_random_uuid();
    v_title := left(format('%s: %s', replace(c.kind, '_', ' '), c.title), 512);
    -- THE ROUTING (the queue's rule, 0083 §5): the owner when an active human, the class's roles under the active policy
    v_owner := CASE WHEN c.owner IS NOT NULL AND decision.is_active_human(c.owner, p_tenant) THEN c.owner END;
    v_eval := executive.evaluate_attention(CASE WHEN pol.policy_id IS NULL THEN NULL ELSE pol.rules END, 'strategy.detection',
                                           jsonb_build_object('consequence', 'C2', 'confidence', 1, 'hours_to_window', NULL)) || jsonb_build_object('policy_version', pol.version);
    v_route := executive.attention_route(pol.rules, 'strategy.detection', v_eval ->> 'outcome', v_owner, p_tenant, p_domain);
    v_state := v_route ->> 'state';
    INSERT INTO executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state,
                                           owner_principal_id, route_roles, policy_id, policy_version, evaluation, details, due_at, escalations, correlation_id)
    VALUES (v_item, 'DOMAIN', p_tenant, p_domain, 'strategy.detection', 'strategy_object', c.subject_id, v_det, 'StrategyDetectionRaised', v_title, v_eval ->> 'outcome', v_state,
            v_owner, ARRAY(SELECT jsonb_array_elements_text(v_route -> 'route_roles')), pol.policy_id, pol.version, v_eval,
            jsonb_build_object('detection_id', v_det, 'kind', c.kind, 'subject_id', c.subject_id, 'subject_type', c.subject_type, 'measure_id', c.measure_id, 'cause_key', c.cause_key, 'detail', c.detail, 'raised_at', v_now, 'by', 'the attention tick step strategy-detections'),
            (v_route ->> 'due_at')::timestamptz, (v_route ->> 'escalations')::int, p_correlation);
    PERFORM executive.attention_event(v_item, p_tenant, p_domain,
              CASE v_state WHEN 'open' THEN 'item.routed' WHEN 'escalated' THEN 'item.escalated' WHEN 'unrouted' THEN 'item.unrouted' ELSE 'item.deprioritized' END,
              p_actor, jsonb_build_object('outcome', v_eval ->> 'outcome', 'reasons', v_eval -> 'reasons', 'policy_version', pol.version, 'owner', v_owner, 'route_roles', v_route -> 'route_roles',
                                          'due_at', v_route -> 'due_at', 'cause_event_id', v_det, 'cause_event_type', 'StrategyDetectionRaised', 'unrouted', coalesce((v_route ->> 'unrouted')::boolean, false)), p_correlation);
    INSERT INTO graph.strategy_detections (detection_id, scope, tenant_id, domain_id, kind, subject_id, subject_type, measure_id, cause_key, detail, owner_principal_id, routed_item_id, routing, raised_at, raised_by, correlation_id)
    VALUES (v_det, 'DOMAIN', p_tenant, p_domain, c.kind, c.subject_id, c.subject_type, c.measure_id, c.cause_key, c.detail, v_owner, v_item,
            jsonb_build_object('state', v_state, 'outcome', v_eval ->> 'outcome', 'route_roles', v_route -> 'route_roles', 'policy_version', pol.version, 'due_at', v_route -> 'due_at'), v_now, p_actor, p_correlation);
    v_raised := v_raised || jsonb_build_object('detection_id', v_det, 'kind', c.kind, 'subject_id', c.subject_id, 'measure_id', c.measure_id, 'item_id', v_item, 'state', v_state, 'owner', v_owner);
  END LOOP;
  RETURN jsonb_build_object('raised_at', v_now, 'raised', v_raised, 'count', jsonb_array_length(v_raised), 'policy_version', pol.version);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION graph.raise_strategy_detections(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graph.raise_strategy_detections(uuid, uuid, uuid, uuid) TO eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §S8 THE PLAN LINKS — read only when Part P's executive.initiatives exists; declared nowhere here
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION graph.strategy_plan_links(p_tenant uuid, p_domain uuid, p_objective uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = graph, executive, pg_catalog, pg_temp AS $$
DECLARE v jsonb;
BEGIN
  IF to_regclass('executive.initiatives') IS NULL THEN
    RETURN jsonb_build_object('available', false, 'reason', 'no planning objects in this deployment (executive.initiatives is not declared)', 'initiatives', '[]'::jsonb);
  END IF;
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.initiative_id), ''[]''::jsonb) FROM executive.initiatives i WHERE i.tenant_id = $1 AND i.domain_id = $2 AND (%s)',
                 CASE WHEN p_objective IS NULL THEN 'true' ELSE 'i.objective_id = $3' END)
     INTO v USING p_tenant, p_domain, p_objective;
  RETURN jsonb_build_object('available', true, 'initiatives', v);
END $$;
GRANT EXECUTE ON FUNCTION graph.strategy_plan_links(uuid, uuid, uuid) TO eye_app, eye_commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
-- §S9 RLS AND THE GRANTS (the 0081 loop idiom; the ports write)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['health_inputs', 'health_input_edits', 'health_exceptions', 'health_snapshot_approvals'] LOOP
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
  FOREACH t IN ARRAY ARRAY['strategy_detections'] LOOP
    EXECUTE format('REVOKE ALL ON graph.%I FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE graph.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE graph.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY graph_isolation ON graph.%I
        USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()))$f$, t);
    EXECUTE format('GRANT SELECT ON graph.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;
