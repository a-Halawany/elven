-- 0081 — CP-6 B21: FITNESS, COHERENCE AND CHALLENGE — ONE fitness vocabulary (none | fit | unfit | indeterminate) on the three
-- foresight objects, set only by a recorded act whose measures the PORT computes; a versioned rule behind every automatic verdict;
-- every state change announced from its write under the register's own name; an unfit or incoherent object refused where it would
-- become decision-active; a dispute that is a person's typed case decided by someone else (separation of duties), resolved by a
-- governed re-run, an invalidation or a dismissal — and, spliced as §C, the custody ledger's sixteenth kind for a retrieval the
-- primary blob root could not serve (B21.2, AU-MEM-0067's vault clause, Class B) (2026-09-24).
--
-- THE GAP. After 0080 no fitness state existed on a twin version, a forecast or a run, and no act set one — the only fitness object
-- was the method's (0066 §6); the operating envelope was declared on the behaviour model (0032:56,74) and enforced nowhere —
-- outside_envelope (0033:85) a perturbation flag nobody reads; a recorded outcome changed nothing (0030:416-480); "coherence"
-- appeared nowhere in the service — the shape refusals of the ports were all there was; nothing made a scenario non-decision-active
-- (FEX-12); the invalidation's trigger vocabulary was closed at operator | reproduction (0078:320); corrects_run_id was a bare
-- pointer (0033:57); the 'challenge' disposition had no producer. AU-TWN-0014/-0015/-0018/-0031, AU-PRD-0012/-0014/-0026/-0029/-0030;
-- L5-I05, L6-I03, L7-I04, L8-I04; V03-T-117/-120/-143/-349; FEX-11/-12; OBJ-29.
--
-- THE MECHANISM.
-- (D1) ONE VOCABULARY: twin_versions.fitness_state and forecasts_current.fitness_state read none | fit | unfit | indeterminate;
--   runs_current.fitness_state none | fit | unfit (a run is promoted fit by a reviewer or made unfit by an invalidation — nothing
--   measures it); scenarios_current.coherence_state unchecked | passed | failed. The method's vocabulary (0066:1558,1573) reused.
-- (D2) VALIDATE TWIN (§1–§2): twin.validate_version — append-only twin.validations, the version row's state and validation id,
--   twin_events version.validated. The ENVELOPE CHECK is the port's (twin.envelope_check, §3 — ONE rule shared with open_run), the
--   CALIBRATION summary from twin.reconciliations since the previous validation, the verdict the person's; the twin's owner is refused
--   (42501 — expert review is a workflow, not an owner-declared status); fit outside the envelope refused; a draft refused. No
--   GraphChanged: a validation changes no fact and no consumer selects by it (the ReviewRequested precedent, 0078:1073).
-- (D3) THE ENVELOPE ENFORCED (§3, §9): simulation.open_run refuses an UNFIT version; the run's OWN contract (horizon_days from the
--   constraints, the other keys from the version's elements) is checked by the same helper, and a run outside the envelope is admitted
--   only under envelope_ack {acknowledge true, reason 8+} by a twin owner, the domain administrator or the platform administrator
--   (twin.envelope_ack_holder over identity.role_bindings) — recorded on the run and in run.opened; the run row carries twin_fitness,
--   envelope_state and envelope_check. The perturbation flag outside_envelope stays what it is: a perturbation left the envelope.
-- (D4) THE ENVELOPE KEY RULE (§3): every key of operating_envelope whose value is a two-element array; a key matches the run
--   parameter of the same name, else the version's first NUMERIC element named K, K:<suffix>, shock.K or shock.K:<suffix> (exact
--   equality first, then the suffixed forms by prefix — never LIKE); no numeric value → unchecked; any outside → outside, else any
--   inside → inside, else unchecked.
-- (D5) FORECAST FITNESS (§4–§5): prediction.assess_forecast_fitness under the SQL constant prediction.forecast_fitness_rule() v1
--   (min_outcomes 10, coverage_floor 0.75 = T1_LOW, drift_factor 1.5, cadence_days daily 1 / weekly 7 / monthly 30 / quarterly 91)
--   over the FAMILY (series_key, horizon_code, method) — its last K outcome_ledger rows: calibration_failure (the q10–q90 coverage
--   below the floor over ≥ K), drift (mean pinball above the factor × the applicable backtest's — no backtest: unchecked, said),
--   data_shift (attention_state assumption_unverified), envelope_breach (an ISSUED forecast past its refresh cadence's expiry with
--   no successor). Any class → unfit naming the first; none and n ≥ K → fit; else indeterminate with n said. The ledger row
--   prediction.forecast_fitness_assessments, the forecast's three columns, forecast_events forecast.fitness_assessed; `changed` says
--   whether the state or the class moved. The series-length breach is a governed evidence read — outside a port, stated.
-- (D6) WHO ASSESSES: the outcome write (prediction.outcome.record — the scored forecast when it is resolved, the issued forecasts of
--   its family), the forecast consumer beside its mark (prediction.forecast.subscription.apply), a person (prediction.forecast.assess,
--   the acting principal recorded). No scheduler exists for prediction.
-- (D7) THE ANNOUNCEMENT is the service's from the port's answer: ForecastFitnessChanged@v1 on every change; GraphChanged/
--   forecast.fitness_changed only on a transition to unfit or a class change while unfit (a fit/indeterminate change marks nothing).
-- (D8) declare_scenario refuses a forecast assessed unfit beside the withdrawn one; nothing is auto-withdrawn (the owner's act).
-- (D9) COHERENCE (§6): prediction.check_scenario_coherence under prediction.scenario_coherence_rule() v1 — the FAIL rules
--   duplicate_branch, assumption_invalid (a basis naming a claim version that is not this domain's, withdrawn/archived/deleted,
--   rejected in review, under an open contradiction, or superseded by a newer version), forecast_relationship, temporal_order,
--   dependency_retired; coverage and an unchecked free-text basis as NOTES; over the OPEN and FLIPPED branches (a closed branch is
--   history). Append-only prediction.scenario_coherence_checks, the scenario's two columns, scenario_events scenario.coherence_checked.
--   Called by the SERVICE at the end of the declaring write (the branches are added after declare_scenario returns — the port cannot
--   check inside it), by review_scenario on continue and promote_to_simulation, by the scenario consumer and by a person. A failed
--   scenario is ADMITTED failed, never refused; `changed` = the state moved or the failing set changed.
-- (D10) THE GATES (§6, §9): open_run refuses a branch of a failed scenario; review_scenario refuses the promotion of one; raise_warning
--   marks a warning raised on a branch of one input_unverified (raised, never suppressed — the flip is a fact). No branch suspension.
-- (D11) THE CHALLENGE (§7–§9): simulation.challenges (assumptions | model | constraints | interpretation; open | rerun_requested |
--   upheld | dismissed | withdrawn; one live challenge per run per opener) with its append-only events; open_challenge (a completed
--   valid run), request_rerun (open → rerun_requested), withdraw_challenge (the opener, while live), decide_challenge (neither the
--   opener nor the run's operator; upheld | dismissed) — the three bound to the RUN in the path and the port (a challenge that is not
--   the run's is refused); the re-run bound at open_run (p_challenge_id: the challenge rerun_requested for p_corrects; rerun_run_id
--   set once). An UPHELD decision changes the challenge; the service then invalidates the run in the same write (the withdrawn SIM
--   version admitted under simulation.challenge.decide — the canonical-write action registered here — then invalidate_run with
--   trigger challenge, its vocabulary widened, the reference checked, the run's fitness unfit).
-- (D12) THE PROMOTION (§7–§8, OBJ-29): simulation.promote_result — a reviewer other than the operator marks a completed, valid,
--   undisputed run fit for a stated use, once; simulation.promotions restates the row's validation and sensitivity, never re-computed;
--   run_events run.promoted; no outbox event (a work-object action outside the catalogue — the state rides the reads).
-- (D13) THE REGISTER (§10): L5-I05, L6-I03, L7-I04, L8-I04 bound → 40 bound / 10 partial / 0 unbound, the ten that stay partial
--   compared as a SET; L9-I05's package-cause clause re-homed from B20 to B22 (0080 bound nothing of it).
-- (§C) THE CUSTODY KIND custody.retrieval_degraded (B21.2): the sixteenth kind, digest_verified NULL by a named CHECK.
--
--   §1  twin — twin_versions.fitness_state, twin.validations, the events CHECK, versions_immutable re-declared (0032 §4).
--   §2  twin.validate_version.
--   §3  twin.envelope_check and twin.envelope_ack_holder — the helpers the validation and open_run share.
--   §4  prediction — forecast fitness: the rule constant, prediction.forecast_fitness_assessments, the forecast columns, the events CHECK.
--   §5  prediction.assess_forecast_fitness.
--   §6  prediction — scenario coherence: the rule constant, prediction.scenario_coherence_checks, the scenario columns, the events
--       CHECK, prediction.check_scenario_coherence; declare_scenario (0078 §1), review_scenario (0067 §4) and raise_warning (0065)
--       re-declared with ONE block each.
--   §7  simulation — the run's fitness and envelope columns, simulation.challenges, simulation.challenge_events, simulation.promotions,
--       the events CHECK, runs_immutable re-declared (0078 §2).
--   §8  simulation.open_challenge, request_rerun, withdraw_challenge, decide_challenge, promote_result; invalidate_run re-declared
--       (0078 §2); the canonical-write action of the upheld decision.
--   §9  simulation.open_run — DROP + CREATE (the signature gains p_envelope_ack, p_challenge_id; 0066 §8's body with five blocks).
--   §C  B21.2's custody kind, spliced from design-p2.md §1.C (order-independent: one table nobody else in 0081 touches).
--   §10 the interface register: the four rows bound, the L9-I05 correction, the guard 40/10/0.
--
-- RESOLUTION AT CALL TIME (stated once): a %ROWTYPE variable and a column reference inside a plpgsql body are resolved when the
-- function RUNS, not when it is created — §2's validate_version reads runs_current.fitness_state before §7 adds it, §8's ports read
-- the §7 columns, §9's open_run reads simulation.challenges; the section order above stands (the 0078 precedent: invalidate_run
-- reads r.validity declared in the same file).
--
-- The refusals (the mapper's families, observation-errors.ts): 'twin validation rejected', 'forecast assessment rejected',
-- 'coherence check rejected', 'simulation challenge rejected' and 'run promotion rejected' answer the PORT's sentence through B9's
-- ordered alternations — 'recorded by the acting principal' and the separation-of-duties texts (42501 → 403), 'no such …' (23503 →
-- 404), the record's state — a draft, withdrawn, superseded, retired, not completed, invalidated, live, promoted already, a disputed
-- result (22023 → 409) — and the caller's request (22023 → 422). The five run gates of open_run carry a CLASS IN PARENTHESES —
-- 'run rejected (unfit_twin): …', '(incoherent_scenario)', '(envelope)', '(envelope_ack)', '(challenge)' — so the named generic
-- 'run rejected: ' row cannot catch them: 409 / 409 / 422 / 403 / 404+409+422 by B9's order, always the port's sentence. 'scenario
-- rejected: forecast … was assessed unfit (…)' and 'a failed coherence check prohibits promotion to simulation: …' are the record's
-- state (409). Every refusal text is a literal the harness regexes; every event name is a literal the CHECKs admit.
--
-- Read-only checks after migrating a fresh database (0001–0081), each verified on eye_verify_b21_mig:
--   \df simulation.open_run                                                                         → ONE row of 35 arguments (the 33-argument form dropped)
--   select conrelid::regclass, conname from pg_constraint where conname in ('twin_events_event_check','forecast_events_event_check',
--     'scenario_events_event_check','run_events_event_check')                                       → five rows before and after (the DROPs by name hold;
--                                                                                                     intelligence.run_events shares the fourth name and is untouched)
--   select prediction.forecast_fitness_rule() ->> 'version', prediction.scenario_coherence_rule() ->> 'version'  → '1', '1'
--   select twin.envelope_check(t.twin_id, v.version, '{"horizon_days": 90}'::jsonb) ->> 'state' from twin.twin_versions v
--     join twin.twins_current t using (twin_id) where v.state = 'admitted'                          → 'inside' for every admitted version of the demonstration copy
--                                                                                                     (the act's scene 1 prints it; an 'outside' row stops the rehearsal); no row on a fresh database
--   select count(*) from simulation.runs_current where envelope_state <> 'unrecorded'               → 0 before any B21 run
--   select binding_state, count(*) from objects.interface_register group by 1                       → bound 40, partial 10
--   select string_agg(interface_id, ',' order by layer, interface_id) from objects.interface_register where binding_state = 'partial'
--                                                                                                    → L1-I02,L1-I03,L1-I04,L2-I02,L3-I02,L4-I02,L7-I02,L10-I02,L10-I03,L10-I05
--   select bound_to like '%(L10-I05, B22)%' from objects.interface_register where interface_id = 'L9-I05'  → true
--   select count(*) from prediction.scenarios_current where coherence_state <> 'unchecked'           → 0 before any B21 check
--   select object_types from observation.canonical_write_actions where action = 'simulation.challenge.decide'  → {SIM}
--   select count(*) from observation.canonical_write_actions where action in ('twin.version.validate','prediction.forecast.assess',
--     'prediction.scenario.check','simulation.challenge.open','simulation.challenge.rerun','simulation.challenge.withdraw',
--     'simulation.result.promote')                                                                   → 0 (no other new act admits a canonical version)
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'custody_events_event_check' → sixteen literals, 0076's fifteen in order, custody.retrieval_degraded last
--   insert into observation.custody_events (…, event, digest_verified, …) values (…, 'custody.retrieval_degraded', true, …) in a
--     rolled-back transaction as superuser                                                           → 23514 custody_retrieval_degraded_unverified
--   select count(*) from observation.custody_events where event = 'custody.retrieval_degraded'      → 0 (on the demonstration before the act)
--   select count(*) from objects.schema_registry                                                     → 37 (36 above the 0022 ceiling — unchanged: no object-type row)
--   select count(*) from identity.roles                                                              → 36 (31 above the ceiling — unchanged: no role)
--   select count(*) from pg_locks where locktype = 'advisory'                                        → 0 (nothing held after the migration)
--   select count(*) from public.schema_migrations                                                    → 81
--   every new port under a commit context bound to ITS action (ctx.issue_commit — the pipeline's own binding) on the API harness's
--     fixture world, and open_run's five blocks through the real run route and the mapper (the scratchpad smoke, 4/4 on
--     eye_verify_b21_smoke): twin.validate_version — 'no such twin' / 'no such version' (23503), the verdict / the reason (22023),
--     'recorded by the acting principal' (42501), the wrong action (42501 'observation write rejected: context is bound to …'), fit on
--     the fixture twin (the envelope inside: horizon_days unchecked, corridor_delay_days ← shock.corridor_delay_days, consumption.weekly
--     ← consumption.weekly:<component>; calibration count 0 with the empty-history note; the four runs named), then unfit and
--     indeterminate (prior_state, calibration.since); prediction.assess_forecast_fitness — 'no such forecast' (23503), the trigger
--     (22023), the acting principal (42501), the fixture forecast over an empty ledger, the second assessment changed false;
--     prediction.check_scenario_coherence — 'no such scenario' (23503), the trigger (22023), the fixture scenario passed with the
--     coverage note (checked by the declaring write), changed false; simulation.open_challenge — 'no such run' (23503), the kind and
--     the statement (22023), 'by this opener is live' (22023), 'is invalidated … nothing to dispute' (22023); request_rerun /
--     withdraw_challenge / decide_challenge — 'no such challenge … of run …' on the WRONG run (23503: the run binding), 'is
--     rerun_requested, not open', 'is withdrawn; only a live challenge is withdrawn / decided', the reason, the decision, the note
--     (22023), 'the decider is the challenge''s opener', 'a challenge is withdrawn by its opener' (42501), a dismissal and an upheld
--     decision by a second person; simulation.invalidate_run — '… is not an upheld challenge of run …' (23503), the widened context
--     rule (42501) and vocabulary (22023), the upheld challenge's invalidation (validity invalidated, fitness unfit, the promotion
--     kept, run.invalidated); simulation.promote_result — 'no such run' (23503), the use (22023), 'a disputed result', 'was promoted
--     already', 'is invalidated' (22023), the control promoted fit with the row's validation restated (twin_fitness, envelope_state);
--     simulation.open_run through the route — the fixture's four runs envelope inside with horizon_days from the run (§9 Block C),
--     'run rejected (challenge): no such challenge …' 404 EYE-STA-001, '… is not awaiting a re-run (state dismissed)' and '(run … is
--     its re-run)' 409 EYE-STA-002, '… disputes run …' 422 EYE-REQ-001, the re-run opened and bound (rerun_run_id, challenge.rerun_opened,
--     the run's challenge_id — Blocks D–E), 'run rejected (incoherent_scenario): … (duplicate_branch)' 409 EYE-STA-002 on a
--     duplicate-branch scenario declared through the route (admitted failed by the declaring write's check) and a version opened after
--     it (Block B; a scenario recorded after the version's known_at is the service's own 422 first); no advisory lock held after.

-- ============================================================
-- §1 twin — the fitness state of an admitted version, set only by a recorded validation (D1, D2)
-- ============================================================
ALTER TABLE twin.twin_versions
  ADD COLUMN fitness_state text NOT NULL DEFAULT 'none' CHECK (fitness_state IN ('none', 'fit', 'unfit', 'indeterminate')),
  ADD COLUMN fitness_validation_id uuid;
ALTER TABLE twin.twin_versions ADD CONSTRAINT twv_fitness_bound CHECK ((fitness_state = 'none') = (fitness_validation_id IS NULL));
COMMENT ON COLUMN twin.twin_versions.fitness_state IS 'B21 (0081): none | fit | unfit | indeterminate — the verdict of the latest twin.validate_version (a person other than the twin''s owner, over the envelope check and the calibration history the port computes); an unfit version opens no run (simulation.open_run). The twin''s validation.status (0032:113) stays the owner''s declaration; this is the product''s state.';
CREATE TABLE twin.validations (
  validation_id     uuid PRIMARY KEY,
  scope             text NOT NULL,
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  twin_id           uuid NOT NULL,
  version           int  NOT NULL,
  verdict           text NOT NULL CHECK (verdict IN ('fit', 'unfit', 'indeterminate')),
  prior_state       text NOT NULL CHECK (prior_state IN ('none', 'fit', 'unfit', 'indeterminate')),
  /* twin.envelope_check(twin, version, '{}'): {state, keys: {<key>: {range, value, source, verdict}}, rule} — computed by the port, never the caller's. */
  envelope_check    jsonb NOT NULL CHECK (jsonb_typeof(envelope_check) = 'object'),
  envelope_state    text NOT NULL CHECK (envelope_state IN ('inside', 'outside', 'unchecked')),
  /* the twin.reconciliations rows recorded since the previous validation of this twin, summarised; count 0 is said. */
  calibration       jsonb NOT NULL CHECK (jsonb_typeof(calibration) = 'object'),
  limitations       text[] NOT NULL DEFAULT ARRAY[]::text[],
  reason            text NOT NULL CHECK (length(btrim(reason)) >= 8),
  validated_by      uuid NOT NULL,
  validated_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id    uuid NOT NULL,
  FOREIGN KEY (twin_id, version) REFERENCES twin.twin_versions (twin_id, version),
  CONSTRAINT tvl_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT tvl_fit_inside CHECK (verdict <> 'fit' OR envelope_state <> 'outside')
);
CREATE INDEX tvl_twin ON twin.validations (twin_id, version, validated_at DESC);
REVOKE ALL ON twin.validations FROM PUBLIC;
ALTER TABLE twin.validations ENABLE ROW LEVEL SECURITY;
ALTER TABLE twin.validations FORCE ROW LEVEL SECURITY;
CREATE POLICY twin_isolation ON twin.validations USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));  -- the 0032:634-639 idiom, verbatim
GRANT SELECT ON twin.validations TO eye_app, eye_commit;
-- append-only: the 0034 reconciliations idiom (no UPDATE/DELETE grant; the definer ports insert)
ALTER TABLE twin.twin_events DROP CONSTRAINT twin_events_event_check;
ALTER TABLE twin.twin_events ADD CONSTRAINT twin_events_event_check
  CHECK (event IN ('twin.declared', 'version.opened', 'element.grounded', 'version.admitted', 'version.unverified', 'version.reverified', 'version.validated'));

-- versions_immutable: 0032 §4's body with ONE string changed — the trigger freezes NAMED columns only, so fitness_state and
-- fitness_validation_id move on an admitted version by event (validate_version) and the message says so.
CREATE OR REPLACE FUNCTION twin.versions_immutable() RETURNS trigger
SET search_path = twin, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'twin versions are append-only: DELETE prohibited' USING ERRCODE = '2F002';
  END IF;
  IF OLD.state = 'admitted' THEN
    IF NEW.state <> 'admitted' OR NEW.state_set_digest IS DISTINCT FROM OLD.state_set_digest
       OR NEW.header_digest IS DISTINCT FROM OLD.header_digest OR NEW.element_count <> OLD.element_count
       OR NEW.completeness <> OLD.completeness OR NEW.missing_keys <> OLD.missing_keys
       OR NEW.known_at <> OLD.known_at OR NEW.observed_through IS DISTINCT FROM OLD.observed_through
       OR NEW.branch_id <> OLD.branch_id OR NEW.forked_from_version IS DISTINCT FROM OLD.forked_from_version
       OR NEW.supersedes IS DISTINCT FROM OLD.supersedes OR NEW.synthetic_state <> OLD.synthetic_state
       OR NEW.controls <> OLD.controls OR NEW.admitted_at IS DISTINCT FROM OLD.admitted_at THEN
      RAISE EXCEPTION 'twin version % of % is admitted and immutable; only its verification and fitness state may change, by event', OLD.version, OLD.twin_id
        USING ERRCODE = '2F002';
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- ============================================================
-- §2 twin.validate_version — the act (D2): the verdict the person's, the envelope check and the calibration history the port's,
--    the twin's owner refused (separation of duties), fit outside the envelope refused, a draft refused; the runs resting on the
--    version NAMED (bounded 200 by the port; the event builder cuts at LIFECYCLE_EVENT_LIST_MAX and says truncated — the answer
--    and the event differ there) and left as they are (a run is immutable; an unfit version refuses NEW runs only).
-- ============================================================
CREATE OR REPLACE FUNCTION twin.validate_version(
  p_validation_id uuid, p_twin_id uuid, p_tenant uuid, p_domain uuid, p_version int,
  p_verdict text, p_reason text, p_limitations text[],
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = twin, simulation, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE t twin.twins_current%ROWTYPE; v twin.twin_versions%ROWTYPE; v_check jsonb; v_outside text; v_prev timestamptz; v_cal jsonb;
        v_at timestamptz := clock_timestamp(); v_runs jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['twin.version.validate']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'twin validation rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_verdict IS NULL OR p_verdict NOT IN ('fit', 'unfit', 'indeterminate') THEN RAISE EXCEPTION 'twin validation rejected: the verdict is fit, unfit or indeterminate' USING ERRCODE = '22023'; END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'twin validation rejected: a validation states its reason (at least 8 characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO t FROM twin.twins_current x WHERE x.twin_id = p_twin_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain;
  IF NOT FOUND THEN RAISE EXCEPTION 'twin validation rejected: no such twin % in this domain', p_twin_id USING ERRCODE = '23503'; END IF;
  -- SoD (AU-TWN-0015: expert review is a workflow, not an owner-declared status; the 0077:823 idiom): the twin's owner never validates it.
  IF t.owner_principal_id = p_actor THEN
    RAISE EXCEPTION 'twin validation rejected: the twin''s owner does not validate their own twin; another twin owner or the domain administrator validates version % of %', p_version, p_twin_id USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v FROM twin.twin_versions x WHERE x.twin_id = p_twin_id AND x.version = p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'twin validation rejected: no such version % of twin %', p_version, p_twin_id USING ERRCODE = '23503'; END IF;
  IF v.state <> 'admitted' THEN RAISE EXCEPTION 'twin validation rejected: version % of twin % is a draft, not admitted; a validation judges admitted state', p_version, p_twin_id USING ERRCODE = '22023'; END IF;
  -- THE ENVELOPE CHECK is the port's (D4): the version's numeric elements against the model's declared ranges; horizon_days is a run parameter (unchecked here).
  v_check := twin.envelope_check(p_twin_id, p_version, '{}'::jsonb);
  IF p_verdict = 'fit' AND (v_check ->> 'state') = 'outside' THEN
    SELECT string_agg(k || ' = ' || (x ->> 'value') || ' outside [' || (x -> 'range' ->> 0) || ', ' || (x -> 'range' ->> 1) || ']', '; ' ORDER BY k) INTO v_outside
      FROM jsonb_each(v_check -> 'keys') AS e(k, x) WHERE (x ->> 'verdict') = 'outside';
    RAISE EXCEPTION 'twin validation rejected: a version outside its operating envelope is not fit (%); validate it indeterminate or unfit, or change the envelope', v_outside USING ERRCODE = '22023';
  END IF;
  -- THE CALIBRATION HISTORY (AU-TWN-0015): the reconciliation ledger since the previous validation of this twin — summarised, never re-derived.
  SELECT max(x.validated_at) INTO v_prev FROM twin.validations x WHERE x.twin_id = p_twin_id;
  SELECT jsonb_build_object('since', v_prev, 'count', count(*), 'keys', coalesce(jsonb_agg(DISTINCT r.key), '[]'::jsonb),
           'numeric', jsonb_build_object('n', count(*) FILTER (WHERE r.difference ? 'numeric'),
                                         'mean_relative', avg((r.difference ->> 'relative')::numeric),
                                         'max_abs_relative', max(abs((r.difference ->> 'relative')::numeric))),
           'latest_observed_recorded_at', max((r.difference ->> 'observed_recorded_at')::timestamptz),
           'note', CASE WHEN count(*) = 0 THEN 'no reconciliation recorded since the previous validation: the calibration history is empty' ELSE NULL END)
    INTO v_cal FROM twin.reconciliations r WHERE r.twin_id = p_twin_id AND (v_prev IS NULL OR r.recorded_at > v_prev);
  INSERT INTO twin.validations (validation_id, scope, tenant_id, domain_id, twin_id, version, verdict, prior_state, envelope_check, envelope_state, calibration, limitations, reason, validated_by, validated_at, correlation_id)
  VALUES (p_validation_id, 'DOMAIN', p_tenant, p_domain, p_twin_id, p_version, p_verdict, v.fitness_state, v_check, v_check ->> 'state', v_cal, coalesce(p_limitations, ARRAY[]::text[]), p_reason, p_actor, v_at, p_correlation);
  UPDATE twin.twin_versions SET fitness_state = p_verdict, fitness_validation_id = p_validation_id WHERE twin_id = p_twin_id AND version = p_version;
  INSERT INTO twin.twin_events (event_id, scope, tenant_id, domain_id, twin_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_twin_id, 'version.validated', p_actor,
          jsonb_build_object('version', p_version, 'validation_id', p_validation_id, 'verdict', p_verdict, 'prior_state', v.fitness_state,
                             'envelope_state', v_check ->> 'state', 'reconciliations', v_cal -> 'count', 'reason', p_reason), p_correlation);
  -- the runs resting on this version, named (a run is immutable; an unfit version refuses NEW runs only — stated)
  SELECT coalesce(jsonb_agg(jsonb_build_object('run_id', r.run_id, 'state', r.state, 'validity', r.validity, 'fitness_state', r.fitness_state) ORDER BY r.opened_at), '[]'::jsonb) INTO v_runs
    FROM (SELECT * FROM simulation.runs_current q WHERE q.twin_id = p_twin_id AND q.twin_version = p_version ORDER BY q.opened_at LIMIT 200) r;
  RETURN jsonb_build_object('validation_id', p_validation_id, 'twin_id', p_twin_id, 'version', p_version, 'verdict', p_verdict, 'prior_state', v.fitness_state,
                            'envelope', v_check, 'calibration', v_cal, 'limitations', to_jsonb(coalesce(p_limitations, ARRAY[]::text[])), 'validated_at', v_at,
                            'branch_id', v.branch_id, 'known_at', v.known_at, 'observed_through', v.observed_through, 'state_set_digest', v.state_set_digest, 'runs', v_runs);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.validate_version(uuid,uuid,uuid,uuid,int,text,text,text[],uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.validate_version(uuid,uuid,uuid,uuid,int,text,text,text[],uuid,uuid,uuid) TO eye_commit;

-- ============================================================
-- §3 twin.envelope_check (D4) and the acknowledgement rule (D3) — the helpers open_run shares; called from the two SECURITY DEFINER
--    ports only (the definer's rows; RLS does not apply). No eye_app grant: the API reads the RECORDED check, never re-computes it.
-- ============================================================
-- ONE rule for the validation and the run: the model's declared ranges against the run's own parameter (p_extra) or the version's numeric element.
CREATE OR REPLACE FUNCTION twin.envelope_check(p_twin_id uuid, p_version int, p_extra jsonb) RETURNS jsonb
SET search_path = twin, pg_catalog, pg_temp AS $$
DECLARE v_env jsonb; v_model text; k text; rng jsonb; lo numeric; hi numeric; val numeric; src text; ek text; ev jsonb;
        keys jsonb := '{}'::jsonb; n_out int := 0; n_in int := 0; verdict text;
BEGIN
  SELECT bm.operating_envelope, bm.method_ref INTO v_env, v_model
    FROM twin.twins_current t JOIN twin.behaviour_models bm ON bm.method_ref = t.behaviour_model_ref WHERE t.twin_id = p_twin_id;
  IF v_env IS NULL THEN RETURN jsonb_build_object('state', 'unchecked', 'model', v_model, 'keys', keys, 'note', 'the behaviour model declares no operating envelope'); END IF;
  FOR k, rng IN SELECT e.key, e.value FROM jsonb_each(v_env) e WHERE jsonb_typeof(e.value) = 'array' AND jsonb_array_length(e.value) = 2 ORDER BY e.key LOOP
    lo := (rng ->> 0)::numeric; hi := (rng ->> 1)::numeric; val := NULL; src := NULL;
    IF jsonb_typeof(coalesce(p_extra, '{}'::jsonb) -> k) = 'number' THEN
      val := (p_extra ->> k)::numeric; src := 'run';
    ELSE
      -- the exact-equality arms first, then the suffixed forms by prefix (never LIKE: an envelope key with '_' must not match any character)
      SELECT e.key, e.value INTO ek, ev FROM twin.state_elements e
       WHERE e.twin_id = p_twin_id AND e.version = p_version AND jsonb_typeof(e.value) = 'number'
         AND (e.key = k OR left(e.key, length(k) + 1) = k || ':' OR e.key = 'shock.' || k OR left(e.key, length(k) + 7) = 'shock.' || k || ':')
       ORDER BY e.key LIMIT 1;
      IF FOUND THEN val := (ev::text)::numeric; src := ek; END IF;
    END IF;
    verdict := CASE WHEN val IS NULL THEN 'unchecked' WHEN val < lo OR val > hi THEN 'outside' ELSE 'inside' END;
    IF verdict = 'outside' THEN n_out := n_out + 1; ELSIF verdict = 'inside' THEN n_in := n_in + 1; END IF;
    keys := keys || jsonb_build_object(k, jsonb_build_object('range', rng, 'value', val, 'source', src, 'verdict', verdict));
  END LOOP;
  RETURN jsonb_build_object('state', CASE WHEN n_out > 0 THEN 'outside' WHEN n_in > 0 THEN 'inside' ELSE 'unchecked' END, 'model', v_model, 'keys', keys,
                            'rule', 'a key matches the run parameter of the same name, else the version''s first numeric element named K, K:<suffix>, shock.K or shock.K:<suffix>; a key with no numeric value is unchecked');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION twin.envelope_check(uuid,int,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.envelope_check(uuid,int,jsonb) TO eye_commit;

-- The "raised threshold" (AU-TWN-0014, V03-T-120): a run outside the envelope is admitted only under the acknowledgement of a twin owner or the domain administrator.
CREATE OR REPLACE FUNCTION twin.envelope_ack_holder(p_actor uuid, p_tenant uuid, p_domain uuid) RETURNS boolean
SET search_path = identity, pg_catalog, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM identity.role_bindings rb WHERE rb.principal_id = p_actor AND rb.revoked_at IS NULL
                   AND ((rb.role_code = 'platform_admin' AND rb.scope = 'PLATFORM')
                        OR (rb.role_code IN ('domain_admin', 'twin_owner') AND rb.scope = 'DOMAIN' AND rb.tenant_id = p_tenant AND rb.domain_id = p_domain)))
$$ LANGUAGE sql STABLE;
REVOKE ALL ON FUNCTION twin.envelope_ack_holder(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION twin.envelope_ack_holder(uuid,uuid,uuid) TO eye_commit;

-- ============================================================
-- §4 prediction — forecast fitness: the versioned rule, the assessment ledger, the state on the forecast (D5–D8)
-- ============================================================
-- THE RULE is a constant of this migration (the 0061 derive_warning_level / 0080 representation_version idiom): a change is a new
-- version in a later migration; every assessment records the version it was judged under. coverage_floor = T1_LOW (models.ts:264);
-- cadence_days = forecast-events.ts CADENCE_DAYS (the expiry rule of ForecastIssued@v2, restated here so the port needs no TS constant).
CREATE OR REPLACE FUNCTION prediction.forecast_fitness_rule() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT '{"version": "1", "min_outcomes": 10, "coverage_floor": 0.75, "drift_factor": 1.5,
           "cadence_days": {"daily": 1, "weekly": 7, "monthly": 30, "quarterly": 91},
           "classes": ["calibration_failure", "drift", "data_shift", "envelope_breach"]}'::jsonb $$;
CREATE TABLE prediction.forecast_fitness_assessments (
  assessment_id     uuid PRIMARY KEY,
  scope             text NOT NULL,
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  forecast_id       uuid NOT NULL,
  series_key        text NOT NULL,
  horizon_code      text NOT NULL,
  method            text NOT NULL,
  rule_version      text NOT NULL,
  trigger           text NOT NULL CHECK (trigger IN ('outcome', 'subscription', 'operator')),
  /* {rule_version, window {series_key, horizon, method, outcomes, required}, coverage {observed, floor, checked}, pinball {observed, backtest, backtest_id, factor, checked}, attention_state, expiry {expires_at, cadence, checked}, classes, note} */
  measures          jsonb NOT NULL CHECK (jsonb_typeof(measures) = 'object'),
  verdict           text NOT NULL CHECK (verdict IN ('fit', 'unfit', 'indeterminate')),
  fitness_class     text CHECK (fitness_class IS NULL OR fitness_class IN ('calibration_failure', 'drift', 'data_shift', 'envelope_breach')),
  classes           jsonb NOT NULL DEFAULT '[]'::jsonb,
  prior_state       text NOT NULL CHECK (prior_state IN ('none', 'fit', 'unfit', 'indeterminate')),
  prior_class       text,
  changed           boolean NOT NULL,
  assessed_by       uuid NOT NULL,
  assessed_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id    uuid NOT NULL,
  CONSTRAINT ffa_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT ffa_unfit_names_class CHECK ((verdict = 'unfit') = (fitness_class IS NOT NULL))
);
CREATE INDEX ffa_forecast ON prediction.forecast_fitness_assessments (forecast_id, assessed_at DESC);
CREATE INDEX ffa_family ON prediction.forecast_fitness_assessments (tenant_id, domain_id, series_key, horizon_code, method, assessed_at DESC);
REVOKE ALL ON prediction.forecast_fitness_assessments FROM PUBLIC;
ALTER TABLE prediction.forecast_fitness_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction.forecast_fitness_assessments FORCE ROW LEVEL SECURITY;
CREATE POLICY prediction_isolation ON prediction.forecast_fitness_assessments USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));  -- 0029:420-425 verbatim
GRANT SELECT ON prediction.forecast_fitness_assessments TO eye_app, eye_commit;
ALTER TABLE prediction.forecasts_current
  ADD COLUMN fitness_state text NOT NULL DEFAULT 'none' CHECK (fitness_state IN ('none', 'fit', 'unfit', 'indeterminate')),
  ADD COLUMN fitness_class text CHECK (fitness_class IS NULL OR fitness_class IN ('calibration_failure', 'drift', 'data_shift', 'envelope_breach')),
  ADD COLUMN fitness_assessment_id uuid;
ALTER TABLE prediction.forecasts_current ADD CONSTRAINT fct_fitness_bound
  CHECK ((fitness_state = 'none') = (fitness_assessment_id IS NULL) AND (fitness_state = 'unfit') = (fitness_class IS NOT NULL));
COMMENT ON COLUMN prediction.forecasts_current.fitness_state IS 'B21 (0081): none | fit | unfit | indeterminate — the latest prediction.assess_forecast_fitness under prediction.forecast_fitness_rule() (the family''s last K outcomes, the backtest, the attention mark, the refresh expiry); unfit names its class in fitness_class; the owner''s withdrawal (0078) stays a separate act.';
ALTER TABLE prediction.forecast_events DROP CONSTRAINT forecast_events_event_check;
ALTER TABLE prediction.forecast_events ADD CONSTRAINT forecast_events_event_check CHECK (event IN (
  'forecast.issued', 'forecast.superseded', 'forecast.resolved', 'forecast.withdrawn', 'forecast.attention', 'forecast.fitness_assessed'));

-- ============================================================
-- §5 prediction.assess_forecast_fitness — the assessment (D5, D6)
-- ============================================================
-- THE ASSESSMENT: the family (series_key, horizon_code, method) judged over its last K scored outcomes (one outcome per forecast — an
-- outcome RESOLVES its forecast, 0030:466; the issued forecasts of the family are the decision-active ones the outcomes judge), the
-- applicable backtest's pinball as the drift baseline, the attention mark as data_shift, the refresh cadence's expiry as envelope_breach.
-- The verdict is the rule's, never the caller's; the ledger row and the forecast's state; the event ledger; `changed` says whether the
-- state or the class moved (the service publishes ForecastFitnessChanged@v1 only then, and GraphChanged/forecast.fitness_changed only
-- on a transition to unfit or a class change while unfit — D7). Callers: the outcome write (trigger outcome — the scored forecast when
-- it is resolved, the issued forecasts of its family; a superseded or withdrawn forecast that is scored is NOT assessed by the write),
-- the forecast consumer (subscription), a person (operator: the acting principal recorded). The family's OTHER forecasts are assessed
-- by the SERVICE, one call each (bounded 200): a port that fanned out would publish nothing for them.
CREATE OR REPLACE FUNCTION prediction.assess_forecast_fitness(
  p_assessment_id uuid, p_forecast_id uuid, p_tenant uuid, p_domain uuid, p_trigger text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE f prediction.forecasts_current%ROWTYPE; r jsonb := prediction.forecast_fitness_rule(); k int; n int; n_cov int; v_cov numeric; v_pin numeric;
        v_bt numeric; v_bt_id uuid; v_days int; v_expires timestamptz; v_classes text[] := ARRAY[]::text[]; v_class text; v_verdict text;
        v_measures jsonb; v_changed boolean; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.forecast.assess', 'prediction.outcome.record', 'prediction.forecast.subscription.apply']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_trigger IS NULL OR p_trigger NOT IN ('outcome', 'subscription', 'operator') THEN RAISE EXCEPTION 'forecast assessment rejected: the trigger is outcome, subscription or operator' USING ERRCODE = '22023'; END IF;
  IF p_trigger = 'operator' AND p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'forecast assessment rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO f FROM prediction.forecasts_current x WHERE x.forecast_id = p_forecast_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'forecast assessment rejected: no such forecast % in this domain', p_forecast_id USING ERRCODE = '23503'; END IF;
  IF f.state = 'withdrawn' THEN RAISE EXCEPTION 'forecast assessment rejected: forecast % is withdrawn (%); a withdrawn forecast is not assessed', p_forecast_id, f.withdrawal ->> 'unfit_class' USING ERRCODE = '22023'; END IF;
  IF f.state = 'superseded' THEN RAISE EXCEPTION 'forecast assessment rejected: forecast % is superseded by %; assess the successor', p_forecast_id, f.superseded_by USING ERRCODE = '22023'; END IF;
  k := (r ->> 'min_outcomes')::int;
  -- the window: the family's last K outcomes by record instant
  SELECT count(*), count(*) FILTER (WHERE o.covered), avg(o.pinball_mean) INTO n, n_cov, v_pin
    FROM (SELECT * FROM prediction.outcome_ledger o WHERE o.tenant_id = p_tenant AND o.domain_id = p_domain
           AND o.series_key = f.series_key AND o.horizon_code = f.horizon_code AND o.method = f.method ORDER BY o.recorded_at DESC LIMIT k) o;
  v_cov := CASE WHEN n = 0 THEN NULL ELSE n_cov::numeric / n END;
  SELECT b.backtest_id, b.pinball_mean INTO v_bt_id, v_bt FROM prediction.backtests b WHERE b.backtest_id = f.backtest_id;
  v_days := (r -> 'cadence_days' ->> f.refresh_cadence)::int;
  v_expires := CASE WHEN v_days IS NULL THEN NULL ELSE f.issued_at + make_interval(days => v_days) END;
  -- THE CLASSES, in the rule's order (the first holds the state's class; all are listed)
  -- (each literal typed: text[] || an untyped literal is parsed as an ARRAY literal — 22P02 "malformed array literal" — reconcile)
  IF n >= k AND v_cov < (r ->> 'coverage_floor')::numeric THEN v_classes := v_classes || 'calibration_failure'::text; END IF;
  IF n >= k AND v_bt IS NOT NULL AND v_bt > 0 AND v_pin > (r ->> 'drift_factor')::numeric * v_bt THEN v_classes := v_classes || 'drift'::text; END IF;
  IF f.attention_state = 'assumption_unverified' THEN v_classes := v_classes || 'data_shift'::text; END IF;
  IF f.state = 'issued' AND v_expires IS NOT NULL AND v_expires < v_at AND f.superseded_by IS NULL THEN v_classes := v_classes || 'envelope_breach'::text; END IF;
  v_class := v_classes[1];
  v_verdict := CASE WHEN v_class IS NOT NULL THEN 'unfit' WHEN n >= k THEN 'fit' ELSE 'indeterminate' END;
  v_measures := jsonb_build_object(
    'rule_version', r ->> 'version',
    'window', jsonb_build_object('series_key', f.series_key, 'horizon', f.horizon_code, 'method', f.method, 'outcomes', n, 'required', k),
    'coverage', jsonb_build_object('observed', v_cov, 'floor', (r ->> 'coverage_floor')::numeric, 'checked', n >= k),
    'pinball', jsonb_build_object('observed', v_pin, 'backtest', v_bt, 'backtest_id', v_bt_id, 'factor', (r ->> 'drift_factor')::numeric, 'checked', n >= k AND v_bt IS NOT NULL),
    'attention_state', f.attention_state,
    'expiry', jsonb_build_object('expires_at', v_expires, 'cadence', f.refresh_cadence, 'checked', v_expires IS NOT NULL),
    'classes', to_jsonb(v_classes),
    'note', CASE WHEN n < k THEN format('%s of %s outcomes in the family''s window: the calibration and drift rules are not applied; the verdict is indeterminate unless another class holds', n, k)
                 WHEN v_bt IS NULL THEN 'no applicable backtest: the drift rule is not applied' ELSE NULL END);
  v_changed := (f.fitness_state IS DISTINCT FROM v_verdict) OR (f.fitness_class IS DISTINCT FROM v_class);
  INSERT INTO prediction.forecast_fitness_assessments (assessment_id, scope, tenant_id, domain_id, forecast_id, series_key, horizon_code, method, rule_version, trigger, measures, verdict, fitness_class, classes, prior_state, prior_class, changed, assessed_by, assessed_at, correlation_id)
  VALUES (p_assessment_id, 'DOMAIN', p_tenant, p_domain, p_forecast_id, f.series_key, f.horizon_code, f.method, r ->> 'version', p_trigger, v_measures, v_verdict, v_class, to_jsonb(v_classes), f.fitness_state, f.fitness_class, v_changed, p_actor, v_at, p_correlation);
  UPDATE prediction.forecasts_current SET fitness_state = v_verdict, fitness_class = v_class, fitness_assessment_id = p_assessment_id, updated_at = v_at WHERE forecast_id = p_forecast_id;
  INSERT INTO prediction.forecast_events (event_id, scope, tenant_id, domain_id, forecast_id, event, occurred_at, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_forecast_id, 'forecast.fitness_assessed', v_at, p_actor,
          jsonb_build_object('assessment_id', p_assessment_id, 'verdict', v_verdict, 'class', v_class, 'classes', to_jsonb(v_classes), 'prior_state', f.fitness_state, 'prior_class', f.fitness_class,
                             'changed', v_changed, 'trigger', p_trigger, 'rule_version', r ->> 'version', 'outcomes', n), p_correlation);
  RETURN jsonb_build_object('assessment_id', p_assessment_id, 'forecast_id', p_forecast_id, 'series_key', f.series_key, 'horizon', f.horizon_code, 'method', f.method,
                            'subject_entity_id', f.subject_entity_id, 'state', f.state, 'verdict', v_verdict, 'class', v_class, 'classes', to_jsonb(v_classes),
                            'prior_state', f.fitness_state, 'prior_class', f.fitness_class, 'changed', v_changed, 'measures', v_measures, 'assessed_at', v_at);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.assess_forecast_fitness(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.assess_forecast_fitness(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid) TO eye_commit;

-- ============================================================
-- §6 prediction — scenario coherence: a versioned check, a state, the gates (D9, D10)
-- ============================================================
CREATE OR REPLACE FUNCTION prediction.scenario_coherence_rule() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT '{"version": "1", "fail": ["duplicate_branch", "assumption_invalid", "forecast_relationship", "temporal_order", "dependency_retired"], "note": ["coverage", "basis_unchecked"]}'::jsonb $$;
CREATE TABLE prediction.scenario_coherence_checks (
  check_id          uuid PRIMARY KEY,
  scope             text NOT NULL,
  tenant_id         uuid NOT NULL,
  domain_id         uuid NOT NULL,
  scenario_id       uuid NOT NULL,
  scenario_version  int,
  rule_version      text NOT NULL,
  trigger           text NOT NULL CHECK (trigger IN ('declare', 'review', 'subscription', 'operator')),
  /* [{rule, severity 'fail' | 'note', branch_id?, other_branch_id?, detail}] in rule order, then branch name order */
  findings          jsonb NOT NULL CHECK (jsonb_typeof(findings) = 'array'),
  outcome           text NOT NULL CHECK (outcome IN ('passed', 'failed')),
  prior_state       text NOT NULL CHECK (prior_state IN ('unchecked', 'passed', 'failed')),
  changed           boolean NOT NULL,
  checked_by        uuid NOT NULL,
  checked_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id    uuid NOT NULL,
  CONSTRAINT scc_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX scc_scenario ON prediction.scenario_coherence_checks (scenario_id, checked_at DESC);
REVOKE ALL ON prediction.scenario_coherence_checks FROM PUBLIC;
ALTER TABLE prediction.scenario_coherence_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction.scenario_coherence_checks FORCE ROW LEVEL SECURITY;
CREATE POLICY prediction_isolation ON prediction.scenario_coherence_checks USING (tenant_id = public.eye_tenant() AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain()));
GRANT SELECT ON prediction.scenario_coherence_checks TO eye_app, eye_commit;
ALTER TABLE prediction.scenarios_current
  ADD COLUMN coherence_state text NOT NULL DEFAULT 'unchecked' CHECK (coherence_state IN ('unchecked', 'passed', 'failed')),
  ADD COLUMN coherence_check_id uuid;
ALTER TABLE prediction.scenarios_current ADD CONSTRAINT scn_coherence_bound CHECK ((coherence_state = 'unchecked') = (coherence_check_id IS NULL));
ALTER TABLE prediction.scenario_events DROP CONSTRAINT scenario_events_event_check;
ALTER TABLE prediction.scenario_events ADD CONSTRAINT scenario_events_event_check CHECK (event IN (
  'scenario.declared', 'branch.added', 'branch.flipped', 'branch.closed', 'scenario.closed', 'scenario.attention', 'scenario.reviewed', 'scenario.retired', 'scenario.coherence_checked'));
-- The scenarios declared before 0081 read unchecked (honest: nothing checked them).

-- THE CHECK (L7-C06; flow 35.4): deterministic SQL over what the product holds, over the OPEN and FLIPPED branches (a closed branch is
-- history). A free-text assumption is not judged (a note says so); only a basis naming a claim (CLM:<uuid>[@v] or the bare uuid) is checked
-- against the claim's lifecycle, its review case, the open contradictions and the current version. `changed` = the state moved, or the set
-- of failing findings changed — the service publishes ScenarioCoherenceFailed@v1 on a failed AND changed check; a pass rides this row.
CREATE OR REPLACE FUNCTION prediction.check_scenario_coherence(
  p_check_id uuid, p_scenario_id uuid, p_tenant uuid, p_domain uuid, p_trigger text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, graph, intelligence, objects, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s prediction.scenarios_current%ROWTYPE; r jsonb := prediction.scenario_coherence_rule(); v_findings jsonb := '[]'::jsonb; b record; a jsonb; m text[];
        v_basis text; v_obj uuid; v_ver bigint; o record; fc record; v_outcome text; v_changed boolean; v_prev jsonb; v_fails jsonb; v_prev_fails jsonb;
        v_at timestamptz := clock_timestamp(); v_version int; v_open int; v_kinds int; v_ctr uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.scenario.check', 'prediction.scenario.declare', 'prediction.scenario.review', 'prediction.scenario.subscription.apply']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_trigger IS NULL OR p_trigger NOT IN ('declare', 'review', 'subscription', 'operator') THEN RAISE EXCEPTION 'coherence check rejected: the trigger is declare, review, subscription or operator' USING ERRCODE = '22023'; END IF;
  IF p_trigger = 'operator' AND p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'coherence check rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO s FROM prediction.scenarios_current x WHERE x.scenario_id = p_scenario_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'coherence check rejected: no such scenario % in this domain', p_scenario_id USING ERRCODE = '23503'; END IF;
  IF s.state = 'retired' THEN RAISE EXCEPTION 'coherence check rejected: scenario % is retired; a retired scenario is not checked (declare a successor)', p_scenario_id USING ERRCODE = '22023'; END IF;
  SELECT max(x.object_version)::int INTO v_version FROM objects.canonical_objects x WHERE x.object_type = 'SCN' AND x.object_id = p_scenario_id;
  -- duplicate_branch: two live non-baseline branches of one kind sharing the indicator, or the same normalised statement (FEX-12; AU-PRD-0026)
  FOR b IN SELECT x.branch_id, x.name, x.kind, y.branch_id AS other_id, y.name AS other_name,
                  CASE WHEN x.indicator_id IS NOT NULL AND x.indicator_id = y.indicator_id THEN 'indicator' ELSE 'statement' END AS via
             FROM prediction.branches_current x JOIN prediction.branches_current y ON y.scenario_id = x.scenario_id AND y.branch_id > x.branch_id
            WHERE x.scenario_id = p_scenario_id AND x.state <> 'closed' AND y.state <> 'closed' AND x.kind <> 'baseline' AND y.kind = x.kind
              AND ((x.indicator_id IS NOT NULL AND x.indicator_id = y.indicator_id) OR lower(btrim(x.statement)) = lower(btrim(y.statement)))
            ORDER BY x.name, y.name LOOP
    v_findings := v_findings || jsonb_build_object('rule', 'duplicate_branch', 'severity', 'fail', 'branch_id', b.branch_id, 'other_branch_id', b.other_id,
      'detail', format('branches "%s" and "%s" are both %s and share the same %s; they do not cover distinct uncertainty', b.name, b.other_name, b.kind, b.via));
  END LOOP;
  -- assumption_invalid / basis_unchecked
  FOR b IN SELECT x.branch_id, x.name, x.assumptions FROM prediction.branches_current x WHERE x.scenario_id = p_scenario_id AND x.state <> 'closed' ORDER BY x.name LOOP
    FOR a IN SELECT * FROM jsonb_array_elements(coalesce(b.assumptions, '[]'::jsonb)) LOOP
      v_basis := btrim(coalesce(a ->> 'basis', ''));
      m := regexp_match(v_basis, '^(?:CLM:)?([0-9a-fA-F-]{36})(?:@(\d+))?$');
      IF m IS NULL THEN
        v_findings := v_findings || jsonb_build_object('rule', 'basis_unchecked', 'severity', 'note', 'branch_id', b.branch_id,
          'detail', format('assumption "%s" of "%s" names no claim version as its basis; it is not judged', left(a ->> 'statement', 120), b.name));
        CONTINUE;
      END IF;
      v_obj := m[1]::uuid; v_ver := NULLIF(m[2], '')::bigint;
      SELECT x.object_version, x.lifecycle_state INTO o FROM objects.canonical_objects x
       WHERE x.object_type = 'CLM' AND x.object_id = v_obj AND x.tenant_id = p_tenant AND x.domain_id = p_domain ORDER BY x.object_version DESC LIMIT 1;
      SELECT c.contradiction_id INTO v_ctr FROM intelligence.contradictions c WHERE c.state = 'open' AND (c.a_object_id = v_obj OR c.b_object_id = v_obj) ORDER BY c.detected_at LIMIT 1;
      -- the latest version of a claim is never superseded (a supersession records a NEWER version; the object_version > v_ver branch judges a stale basis);
      -- withdrawn, archived (gone by retention) and deleted are the canonical vocabulary's gone states (0006:15-16)
      IF o IS NULL THEN
        v_findings := v_findings || jsonb_build_object('rule', 'assumption_invalid', 'severity', 'fail', 'branch_id', b.branch_id, 'detail', format('assumption of "%s": basis %s is not a claim of this domain', b.name, v_basis));
      ELSIF o.lifecycle_state IN ('withdrawn', 'archived', 'deleted') THEN
        v_findings := v_findings || jsonb_build_object('rule', 'assumption_invalid', 'severity', 'fail', 'branch_id', b.branch_id, 'detail', format('assumption of "%s": claim %s is %s at version %s', b.name, v_obj, o.lifecycle_state, o.object_version));
      ELSIF EXISTS (SELECT 1 FROM intelligence.review_current rc WHERE rc.claim_object_id = v_obj AND rc.state = 'rejected' AND (v_ver IS NULL OR rc.claim_version = v_ver)) THEN
        v_findings := v_findings || jsonb_build_object('rule', 'assumption_invalid', 'severity', 'fail', 'branch_id', b.branch_id, 'detail', format('assumption of "%s": claim %s was rejected in review', b.name, v_basis));
      ELSIF v_ctr IS NOT NULL THEN
        v_findings := v_findings || jsonb_build_object('rule', 'assumption_invalid', 'severity', 'fail', 'branch_id', b.branch_id, 'detail', format('assumption of "%s": claim %s is the subject of open contradiction %s', b.name, v_obj, v_ctr));
      ELSIF v_ver IS NOT NULL AND o.object_version > v_ver THEN
        v_findings := v_findings || jsonb_build_object('rule', 'assumption_invalid', 'severity', 'fail', 'branch_id', b.branch_id, 'detail', format('assumption of "%s": basis names version %s of claim %s; the claim stands at version %s (%s) — restate the basis', b.name, v_ver, v_obj, o.object_version, o.lifecycle_state));
      END IF;
    END LOOP;
  END LOOP;
  -- forecast_relationship: the scenario's forecast withdrawn, superseded or assessed unfit (L6-I05 / L6-I03 → L7-I04)
  IF s.forecast_id IS NOT NULL THEN
    SELECT x.state, x.superseded_by, x.fitness_state, x.fitness_class INTO fc FROM prediction.forecasts_current x WHERE x.forecast_id = s.forecast_id;
    IF fc.state = 'withdrawn' THEN v_findings := v_findings || jsonb_build_object('rule', 'forecast_relationship', 'severity', 'fail', 'detail', format('forecast %s was withdrawn as unfit', s.forecast_id));
    ELSIF fc.state = 'superseded' THEN v_findings := v_findings || jsonb_build_object('rule', 'forecast_relationship', 'severity', 'fail', 'detail', format('forecast %s is superseded by %s; the scenario rests on a forecast that is no longer current', s.forecast_id, fc.superseded_by));
    ELSIF fc.fitness_state = 'unfit' THEN v_findings := v_findings || jsonb_build_object('rule', 'forecast_relationship', 'severity', 'fail', 'detail', format('forecast %s was assessed unfit (%s)', s.forecast_id, fc.fitness_class));
    END IF;
  END IF;
  -- temporal_order: a decision due before its indicator can be observed (0059's observes_from)
  FOR b IN SELECT x.branch_id, x.name, x.decision_deadline, i.observes_from FROM prediction.branches_current x JOIN prediction.indicators_current i ON i.indicator_id = x.indicator_id
            WHERE x.scenario_id = p_scenario_id AND x.state <> 'closed' AND x.decision_deadline IS NOT NULL AND i.observes_from IS NOT NULL AND x.decision_deadline::date < i.observes_from ORDER BY x.name LOOP
    v_findings := v_findings || jsonb_build_object('rule', 'temporal_order', 'severity', 'fail', 'branch_id', b.branch_id, 'detail', format('the decision on "%s" is due %s, before its indicator observes anything (from %s)', b.name, b.decision_deadline, b.observes_from));
  END LOOP;
  -- dependency_retired: the subject entity retired
  IF s.subject_entity_id IS NOT NULL AND EXISTS (SELECT 1 FROM graph.entities_current e WHERE e.entity_id = s.subject_entity_id AND e.lifecycle_state = 'retired') THEN
    v_findings := v_findings || jsonb_build_object('rule', 'dependency_retired', 'severity', 'fail', 'detail', format('subject entity %s is retired', s.subject_entity_id));
  END IF;
  -- coverage (a note, never a failure — the portfolio judgement is the review's, L7-I05)
  SELECT count(*), count(DISTINCT x.kind) INTO v_open, v_kinds FROM prediction.branches_current x WHERE x.scenario_id = p_scenario_id AND x.state <> 'closed' AND x.kind <> 'baseline';
  IF v_open < 2 OR v_kinds < 2 THEN
    v_findings := v_findings || jsonb_build_object('rule', 'coverage', 'severity', 'note', 'detail', format('%s live branch(es) of %s kind(s) beside the baseline; the portfolio may not cover the material uncertainty — the review judges it', v_open, v_kinds));
  END IF;
  SELECT coalesce(jsonb_agg(x ORDER BY x), '[]'::jsonb) INTO v_fails FROM jsonb_array_elements(v_findings) x WHERE (x ->> 'severity') = 'fail';
  v_outcome := CASE WHEN jsonb_array_length(v_fails) > 0 THEN 'failed' ELSE 'passed' END;
  SELECT coalesce(jsonb_agg(x ORDER BY x), '[]'::jsonb) INTO v_prev_fails FROM prediction.scenario_coherence_checks c, jsonb_array_elements(c.findings) x WHERE c.check_id = s.coherence_check_id AND (x ->> 'severity') = 'fail';
  v_changed := (s.coherence_state IS DISTINCT FROM v_outcome) OR (v_outcome = 'failed' AND v_fails IS DISTINCT FROM v_prev_fails);
  INSERT INTO prediction.scenario_coherence_checks (check_id, scope, tenant_id, domain_id, scenario_id, scenario_version, rule_version, trigger, findings, outcome, prior_state, changed, checked_by, checked_at, correlation_id)
  VALUES (p_check_id, 'DOMAIN', p_tenant, p_domain, p_scenario_id, v_version, r ->> 'version', p_trigger, v_findings, v_outcome, s.coherence_state, v_changed, p_actor, v_at, p_correlation);
  UPDATE prediction.scenarios_current SET coherence_state = v_outcome, coherence_check_id = p_check_id, updated_at = v_at WHERE scenario_id = p_scenario_id;
  INSERT INTO prediction.scenario_events (event_id, scope, tenant_id, domain_id, scenario_id, branch_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_scenario_id, NULL, 'scenario.coherence_checked', p_actor,
          jsonb_build_object('check_id', p_check_id, 'outcome', v_outcome, 'prior_state', s.coherence_state, 'changed', v_changed, 'trigger', p_trigger,
                             'rule_version', r ->> 'version', 'fail', jsonb_array_length(v_fails), 'findings', jsonb_array_length(v_findings)), p_correlation);
  RETURN jsonb_build_object('check_id', p_check_id, 'scenario_id', p_scenario_id, 'scenario_version', v_version, 'title', s.title, 'owner', s.owner_principal_id, 'forecast_id', s.forecast_id,
                            'outcome', v_outcome, 'prior_state', s.coherence_state, 'changed', v_changed, 'findings', v_findings, 'rule_version', r ->> 'version', 'checked_at', v_at);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.check_scenario_coherence(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.check_scenario_coherence(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid) TO eye_commit;

-- declare_scenario: 0078 §1's body with ONE block — a scenario is not declared on a forecast assessed unfit (D8). The check itself is
-- NOT called here: the branches are added after this port returns (prediction.add_branch per branch), so the SERVICE calls it (D9).
CREATE OR REPLACE FUNCTION prediction.declare_scenario(
  p_scenario_id uuid, p_tenant uuid, p_domain uuid, p_title text, p_statement text,
  p_forecast_id uuid, p_subject uuid, p_owner uuid, p_review_cadence text, p_controls jsonb,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = prediction, graph, observation, ctx, public, pg_catalog, pg_temp AS $$
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.scenario.declare']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_forecast_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM prediction.forecasts_current f WHERE f.forecast_id = p_forecast_id
         AND f.tenant_id = p_tenant AND f.domain_id = p_domain) THEN
    RAISE EXCEPTION 'scenario rejected: no such forecast in this domain' USING ERRCODE = '23503';
  END IF;
  IF p_forecast_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM prediction.forecasts_current f WHERE f.forecast_id = p_forecast_id
         AND f.tenant_id = p_tenant AND f.domain_id = p_domain AND f.state = 'withdrawn') THEN
    RAISE EXCEPTION 'scenario rejected: forecast % was withdrawn as unfit', p_forecast_id USING ERRCODE = '22023';
  END IF;
  -- B21 (0081): a scenario is not declared on a forecast assessed UNFIT (D8; the loop the assessment closes, as the withdrawal's at 0078:182-186).
  IF p_forecast_id IS NOT NULL AND EXISTS (SELECT 1 FROM prediction.forecasts_current f WHERE f.forecast_id = p_forecast_id AND f.tenant_id = p_tenant AND f.domain_id = p_domain AND f.fitness_state = 'unfit') THEN
    RAISE EXCEPTION 'scenario rejected: forecast % was assessed unfit (%)', p_forecast_id, (SELECT f.fitness_class FROM prediction.forecasts_current f WHERE f.forecast_id = p_forecast_id) USING ERRCODE = '22023';
  END IF;
  INSERT INTO prediction.scenarios_current (
    scenario_id, scope, tenant_id, domain_id, title, statement, forecast_id, subject_entity_id,
    owner_principal_id, review_cadence, state, correlation_id, controls
  ) VALUES (
    p_scenario_id, 'DOMAIN', p_tenant, p_domain, p_title, p_statement, p_forecast_id, p_subject,
    p_owner, p_review_cadence, 'active', p_correlation, coalesce(p_controls, '{}'::jsonb));
  INSERT INTO prediction.scenario_events (
    event_id, scope, tenant_id, domain_id, scenario_id, branch_id, event, actor_principal_id, details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_scenario_id, NULL, 'scenario.declared', p_actor,
    jsonb_build_object('title', p_title, 'forecast_id', p_forecast_id, 'owner', p_owner, 'controls', p_controls), p_correlation);
  IF p_forecast_id IS NOT NULL THEN
    INSERT INTO graph.dependencies (
      dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type,
      depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id
    ) VALUES (
      gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_scenario_id, 'SCN', 'forecast', p_forecast_id,
      'the scenario tree is built on this forecast; if the forecast is questioned so is every branch',
      'active', p_actor, p_correlation)
    ON CONFLICT DO NOTHING;
  END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.declare_scenario(uuid,uuid,uuid,text,text,uuid,uuid,uuid,text,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.declare_scenario(uuid,uuid,uuid,text,text,uuid,uuid,uuid,text,jsonb,uuid,uuid,uuid) TO eye_commit;

-- review_scenario: 0067 §4's body with ONE block — continue and promote_to_simulation re-check the scenario under the reviewer's own
-- action (in the check's authority list); a refused promotion rolls its check row back with the transaction (the scenario's state was
-- set by the earlier check that failed it, which the answer names); the answer gains coherence.
CREATE OR REPLACE FUNCTION prediction.review_scenario(p_scenario_id uuid, p_tenant uuid, p_domain uuid, p_branch_id uuid, p_outcome text, p_note text, p_dissent jsonb, p_next_review_by timestamptz, p_actor uuid, p_event_id uuid, p_correlation uuid)
RETURNS jsonb
SECURITY DEFINER SET search_path = prediction, graph, simulation, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE s prediction.scenarios_current%ROWTYPE; b prediction.branches_current%ROWTYPE; ob prediction.branches_current%ROWTYPE; v_next timestamptz; v_closed int := 0; v_ordinal int; v_cadence interval; v_links jsonb; v_check jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.scenario.review']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_outcome NOT IN ('continue', 'dissent', 'retire', 'promote_to_simulation') THEN RAISE EXCEPTION 'a review outcome is continue, dissent, retire or promote_to_simulation' USING ERRCODE = '22023'; END IF;
  IF coalesce(length(btrim(p_note)), 0) < 8 THEN RAISE EXCEPTION 'a review states its note (8+ characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO s FROM prediction.scenarios_current x WHERE x.scenario_id = p_scenario_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no scenario % in this domain', p_scenario_id USING ERRCODE = '23503'; END IF;
  IF s.state = 'retired' THEN RAISE EXCEPTION 'scenario % is retired; a retired scenario is not reviewed again (declare a successor)', p_scenario_id USING ERRCODE = '22023'; END IF;
  IF p_outcome = 'dissent' AND (p_dissent IS NULL OR coalesce(length(btrim(p_dissent ->> 'position')), 0) < 4 OR coalesce(length(btrim(p_dissent ->> 'rationale')), 0) < 8) THEN
    RAISE EXCEPTION 'a dissent states its position and rationale' USING ERRCODE = '22023';
  END IF;
  IF p_branch_id IS NOT NULL THEN
    SELECT * INTO b FROM prediction.branches_current x WHERE x.branch_id = p_branch_id AND x.scenario_id = p_scenario_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'branch % is not a branch of scenario %', p_branch_id, p_scenario_id USING ERRCODE = '22023'; END IF;
  END IF;
  -- B21 (0081, D9 b): a continuation or a promotion RE-CHECKS the scenario first (trigger review — the reviewer's own act); a failed
  -- scenario is never promoted to simulation (V03-T-143, AI-49-004 "prohibit promotion"); a dissent or a retirement checks nothing.
  IF p_outcome IN ('continue', 'promote_to_simulation') THEN
    v_check := prediction.check_scenario_coherence(gen_random_uuid(), p_scenario_id, p_tenant, p_domain, 'review', p_actor, gen_random_uuid(), p_correlation);
    IF p_outcome = 'promote_to_simulation' AND (v_check ->> 'outcome') = 'failed' THEN
      RAISE EXCEPTION 'a failed coherence check prohibits promotion to simulation: scenario % failed check % (%); resolve the findings and review again',
        p_scenario_id, v_check ->> 'check_id', (SELECT string_agg(x ->> 'rule', ', ') FROM jsonb_array_elements(v_check -> 'findings') x WHERE (x ->> 'severity') = 'fail') USING ERRCODE = '22023';
    END IF;
  END IF;
  IF p_outcome = 'promote_to_simulation' THEN
    IF p_branch_id IS NULL THEN RAISE EXCEPTION 'promotion to simulation names the branch' USING ERRCODE = '22023'; END IF;
    IF b.state = 'closed' THEN RAISE EXCEPTION 'branch % is closed; a closed branch is not promoted to simulation', p_branch_id USING ERRCODE = '22023'; END IF;
    UPDATE prediction.branches_current SET simulation_candidate_at = clock_timestamp() WHERE branch_id = p_branch_id;
  END IF;
  -- The cadence names the next review: a named instant wins; otherwise the cadence's interval from now (weekly/monthly/quarterly/daily; other cadences leave it open).
  v_cadence := CASE lower(coalesce(s.review_cadence, '')) WHEN 'daily' THEN interval '1 day' WHEN 'weekly' THEN interval '7 days' WHEN 'monthly' THEN interval '1 month' WHEN 'quarterly' THEN interval '3 months' ELSE NULL END;
  v_next := coalesce(p_next_review_by, CASE WHEN v_cadence IS NULL THEN NULL ELSE clock_timestamp() + v_cadence END);
  v_ordinal := s.reviews + 1;
  IF p_outcome = 'retire' THEN
    -- Open branches close (a flipped branch keeps its state: the flip is history); the scenario leaves the portfolio.
    FOR ob IN SELECT * FROM prediction.branches_current x WHERE x.scenario_id = p_scenario_id AND x.state = 'open' LOOP
      UPDATE prediction.branches_current SET state = 'closed' WHERE branch_id = ob.branch_id;
      INSERT INTO prediction.scenario_events (event_id, scope, tenant_id, domain_id, scenario_id, branch_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_scenario_id, ob.branch_id, 'branch.closed', p_actor, jsonb_build_object('reason', 'the scenario was retired by review', 'review_ordinal', v_ordinal), p_correlation);
      v_closed := v_closed + 1;
    END LOOP;
    UPDATE prediction.scenarios_current SET state = 'retired', retired_at = clock_timestamp(), retirement_reason = p_note, last_reviewed_at = clock_timestamp(), next_review_due_at = NULL, reviews = v_ordinal WHERE scenario_id = p_scenario_id;
    INSERT INTO prediction.scenario_events (event_id, scope, tenant_id, domain_id, scenario_id, branch_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_scenario_id, NULL, 'scenario.retired', p_actor, jsonb_build_object('reason', p_note, 'branches_closed', v_closed, 'review_ordinal', v_ordinal), p_correlation);
  ELSE
    UPDATE prediction.scenarios_current SET last_reviewed_at = clock_timestamp(), next_review_due_at = v_next, reviews = v_ordinal WHERE scenario_id = p_scenario_id;
  END IF;
  INSERT INTO prediction.scenario_events (event_id, scope, tenant_id, domain_id, scenario_id, branch_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_scenario_id, p_branch_id, 'scenario.reviewed', p_actor,
          jsonb_build_object('outcome', p_outcome, 'note', p_note, 'dissent', p_dissent, 'review_ordinal', v_ordinal, 'next_review_due_at', v_next, 'overdue_before', s.next_review_due_at IS NOT NULL AND s.next_review_due_at < clock_timestamp()), p_correlation);
  v_links := jsonb_build_object(
    'forecast_id', s.forecast_id,
    'decision_objects', (SELECT coalesce(jsonb_agg(DISTINCT d.dependent_object_id), '[]'::jsonb) FROM graph.dependencies d WHERE d.depends_on_kind = 'strategy' AND d.depends_on_id = p_scenario_id AND d.state = 'active'),
    'dependents', (SELECT coalesce(jsonb_agg(jsonb_build_object('type', d.dependent_type, 'id', d.dependent_object_id)), '[]'::jsonb) FROM graph.dependencies d WHERE d.dependent_type = 'SCN' AND d.dependent_object_id = p_scenario_id AND d.state = 'active'),
    'simulation_runs', (SELECT coalesce(jsonb_agg(r.run_id), '[]'::jsonb) FROM simulation.runs_current r WHERE r.scenario_id = p_scenario_id));
  RETURN jsonb_build_object('scenario_id', p_scenario_id, 'outcome', p_outcome, 'review_ordinal', v_ordinal, 'state_after', CASE WHEN p_outcome = 'retire' THEN 'retired' ELSE s.state END,
                            'branch', CASE WHEN p_branch_id IS NULL THEN NULL ELSE jsonb_build_object('branch_id', p_branch_id, 'kind', b.kind, 'state_after', CASE WHEN p_outcome = 'retire' AND b.state = 'open' THEN 'closed' ELSE b.state END) END,
                            'next_review_due_at', CASE WHEN p_outcome = 'retire' THEN NULL ELSE v_next END, 'branches_closed', v_closed, 'cadence', s.review_cadence, 'links', v_links, 'coherence', v_check);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.review_scenario(uuid,uuid,uuid,uuid,text,text,jsonb,timestamptz,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.review_scenario(uuid,uuid,uuid,uuid,text,text,jsonb,timestamptz,uuid,uuid,uuid) TO eye_commit;

-- raise_warning: 0065's body (the 29-parameter signature unchanged) with ONE block — a warning raised on a branch of a failed
-- scenario is marked input_unverified with the reason (warning.attention, via coherence); the grant re-issued to leave it explicit.
CREATE OR REPLACE FUNCTION prediction.raise_warning(
  p_warning_id uuid, p_tenant uuid, p_domain uuid, p_branch_id uuid, p_indicator_id uuid, p_forecast_id uuid,
  p_title text, p_evidence jsonb, p_consequence text, p_confidence numeric,
  p_opens_at timestamptz, p_closes_at timestamptz, p_routed_to uuid,
  p_flip_event_id uuid, p_raised_as_of timestamptz, p_timing_mode text, p_decision_deadline timestamptz,
  p_timely boolean, p_decision_missed boolean, p_controls jsonb,
  p_consequence_class text, p_consequence_class_source text, p_level text, p_level_version int, p_urgency text, p_op_class text,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS void
SECURITY DEFINER SET search_path = prediction, graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE v_declared text; v_found boolean; v_class text; v_source text; d record; v_op text; v_coh text; v_coh_check uuid; v_scn uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['prediction.warning.raise']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF NOT EXISTS (SELECT 1 FROM identity.principals p WHERE p.id = p_routed_to AND p.status = 'active'
                   AND p.tenant_id = p_tenant) THEN
    RAISE EXCEPTION 'warning rejected: it must route to a named, active principal in this tenant' USING ERRCODE = '23503';
  END IF;
  -- The deadline and the timeliness must agree: raised at or after the deadline is a missed decision, never timely.
  IF p_decision_deadline IS NOT NULL AND p_raised_as_of >= p_decision_deadline AND (p_timely IS DISTINCT FROM false OR p_decision_missed IS DISTINCT FROM true) THEN
    RAISE EXCEPTION 'warning rejected: raised at or after its decision deadline but not recorded as a missed decision' USING ERRCODE = '22023';
  END IF;
  IF p_decision_deadline IS NOT NULL AND p_raised_as_of < p_decision_deadline AND p_timely IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'warning rejected: raised before its decision deadline but not recorded as timely' USING ERRCODE = '22023';
  END IF;
  -- THE CLASS IS THE BRANCH'S DECLARATION, OR ASSUMED BY THE VERSION'S RULE — never the caller's choice.
  IF p_branch_id IS NOT NULL THEN
    SELECT b.consequence_class, true INTO v_declared, v_found FROM prediction.branches_current b
     WHERE b.branch_id = p_branch_id AND b.tenant_id = p_tenant AND b.domain_id = p_domain;
    IF v_found IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'warning rejected: no such branch in this domain' USING ERRCODE = '23503';
    END IF;
    v_class := coalesce(v_declared, 'C2');
    v_source := CASE WHEN v_declared IS NULL THEN 'assumed' ELSE 'declared' END;
  ELSE
    IF p_consequence_class IS NULL THEN
      RAISE EXCEPTION 'warning rejected: a warning that rests on no branch must declare its consequence class' USING ERRCODE = '22023';
    END IF;
    v_class := p_consequence_class; v_source := 'declared';
  END IF;
  IF p_consequence_class IS DISTINCT FROM v_class OR p_consequence_class_source IS DISTINCT FROM v_source THEN
    RAISE EXCEPTION 'warning rejected: consequence class %/% disagrees with the branch''s declaration (% %)',
      coalesce(p_consequence_class, '<null>'), coalesce(p_consequence_class_source, '<null>'), v_class, v_source USING ERRCODE = '22023';
  END IF;
  -- THE LEVEL IS DERIVED HERE; what the caller wrote into the canonical object must agree, or nothing is admitted.
  SELECT * INTO d FROM prediction.derive_warning_level(v_class, NULL);
  IF p_level IS DISTINCT FROM d.out_level OR p_level_version IS DISTINCT FROM d.out_version OR p_urgency IS DISTINCT FROM d.out_urgency THEN
    RAISE EXCEPTION 'warning rejected: level % (v%) urgency % disagrees with derivation v% for class %: level %, urgency %',
      coalesce(p_level, '<null>'), coalesce(p_level_version::text, '<null>'), coalesce(p_urgency, '<null>'), d.out_version, v_class, d.out_level, d.out_urgency USING ERRCODE = '22023';
  END IF;
  -- THE AUTHORITY CLASS IS THE CONTEXT'S, recorded beside the label (0042/0043 precedent); the label is not consulted.
  v_op := public.eye_op_class();
  IF v_op IS NULL OR v_op NOT IN ('C0','C1','C2','C3','C4') THEN
    RAISE EXCEPTION 'warning rejected: raised outside a classed authority context (%)', coalesce(v_op, 'none') USING ERRCODE = '42501';
  END IF;
  IF p_op_class IS DISTINCT FROM v_op THEN
    RAISE EXCEPTION 'warning rejected: the recorded authority class % is not the context''s %', coalesce(p_op_class, '<null>'), v_op USING ERRCODE = '22023';
  END IF;
  -- ONE WARNING PER FLIP. A second raise for the same flip is refused by the unique index.
  INSERT INTO prediction.warnings_current (
    warning_id, scope, tenant_id, domain_id, branch_id, indicator_id, forecast_id, title, evidence,
    consequence, confidence, response_window_opens_at, response_window_closes_at, routed_to,
    raised_by, state, correlation_id, flip_event_id, raised_as_of, timing_mode, decision_deadline, timely,
    decision_missed, controls, consequence_class, consequence_class_source, level, level_version, urgency, op_class
  ) VALUES (
    p_warning_id, 'DOMAIN', p_tenant, p_domain, p_branch_id, p_indicator_id, p_forecast_id, p_title,
    p_evidence, p_consequence, p_confidence, p_opens_at, p_closes_at, p_routed_to, p_actor, 'raised',
    p_correlation, p_flip_event_id, coalesce(p_raised_as_of, clock_timestamp()), coalesce(p_timing_mode, 'live'),
    p_decision_deadline, p_timely, coalesce(p_decision_missed, false), coalesce(p_controls, '{}'::jsonb),
    v_class, v_source, d.out_level, d.out_version, d.out_urgency, v_op);
  INSERT INTO prediction.warning_events (
    event_id, scope, tenant_id, domain_id, warning_id, event, actor_principal_id, details, correlation_id
  ) VALUES (
    p_event_id, 'DOMAIN', p_tenant, p_domain, p_warning_id, 'warning.raised', p_actor,
    jsonb_build_object('routed_to', p_routed_to, 'closes_at', p_closes_at, 'branch_id', p_branch_id,
                       'confidence', p_confidence, 'title', p_title, 'flip_event_id', p_flip_event_id,
                       'raised_as_of', p_raised_as_of, 'timing_mode', p_timing_mode,
                       'decision_deadline', p_decision_deadline, 'timely', p_timely,
                       'decision_missed', coalesce(p_decision_missed, false),
                       'consequence_class', v_class, 'consequence_class_source', v_source,
                       'level', d.out_level, 'level_version', d.out_version, 'urgency', d.out_urgency, 'response', d.out_response,
                       'op_class', v_op),
    p_correlation);
  -- B21 (0081, D10): a warning raised on a branch of a scenario whose coherence check FAILED is RAISED (the flip is a fact, the
  -- obligation discharged) and MARKED for attention: not decision-active until the review resolves the scenario (FEX-12).
  IF p_branch_id IS NOT NULL THEN
    SELECT s.coherence_state, s.coherence_check_id, s.scenario_id INTO v_coh, v_coh_check, v_scn
      FROM prediction.branches_current b JOIN prediction.scenarios_current s USING (scenario_id) WHERE b.branch_id = p_branch_id;
    IF v_coh = 'failed' THEN
      UPDATE prediction.warnings_current SET attention_state = 'input_unverified',
             attention_reason = format('scenario %s failed its coherence check %s (rule v%s); the warning stands on an incoherent scenario and is not decision-active until the review resolves it', v_scn, v_coh_check, prediction.scenario_coherence_rule() ->> 'version')
       WHERE warning_id = p_warning_id;
      INSERT INTO prediction.warning_events (event_id, scope, tenant_id, domain_id, warning_id, event, actor_principal_id, details, correlation_id)
      VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_warning_id, 'warning.attention', p_actor,
              jsonb_build_object('scenario_id', v_scn, 'coherence_check_id', v_coh_check, 'via', 'coherence', 'reason', 'the scenario failed its coherence check'), p_correlation);
    END IF;
  END IF;
  -- B8 §8 (AU-MEM-0031): the warning RESTS on the forecast it names and on the evidence that flipped its branch — recorded
  -- as dependencies, so a correction of that evidence (or a change to that forecast) reaches the warning through the walk.
  IF p_forecast_id IS NOT NULL THEN
    INSERT INTO graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_warning_id, 'WRN', 'forecast', p_forecast_id, 'the warning was raised on this forecast''s scenario', 'active', p_actor, p_correlation)
    ON CONFLICT DO NOTHING;
  END IF;
  FOR d IN SELECT DISTINCT (e ->> 'evidence_object_id')::uuid AS evd FROM jsonb_array_elements(coalesce(p_evidence, '[]'::jsonb)) e WHERE (e ->> 'evidence_object_id') ~* '^[0-9a-f-]{36}$' LOOP
    INSERT INTO graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_warning_id, 'WRN', 'evidence', d.evd, 'the observation that flipped the branch was read from this evidence', 'active', p_actor, p_correlation)
    ON CONFLICT DO NOTHING;
  END LOOP;
  IF p_branch_id IS NOT NULL THEN
    UPDATE prediction.branches_current SET warning_state = 'raised' WHERE branch_id = p_branch_id;
    INSERT INTO graph.dependencies (
      dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type,
      depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id
    ) VALUES (
      gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_warning_id, 'WRN', 'strategy',
      (SELECT s.scenario_id FROM prediction.branches_current b JOIN prediction.scenarios_current s USING (scenario_id)
        WHERE b.branch_id = p_branch_id),
      'the warning was raised because this scenario''s branch flipped', 'active', p_actor, p_correlation)
    ON CONFLICT DO NOTHING;
  END IF;
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prediction.raise_warning(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,text,numeric,timestamptz,timestamptz,uuid,uuid,timestamptz,text,timestamptz,boolean,boolean,jsonb,text,text,text,int,text,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION prediction.raise_warning(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,text,numeric,timestamptz,timestamptz,uuid,uuid,timestamptz,text,timestamptz,boolean,boolean,jsonb,text,text,text,int,text,text,uuid,uuid,uuid) TO eye_commit;

-- ============================================================
-- §7 simulation — the run's fitness and envelope state; the challenge (dispute) and the promotion (D3, D11, D12)
-- ============================================================
ALTER TABLE simulation.runs_current
  ADD COLUMN fitness_state  text NOT NULL DEFAULT 'none' CHECK (fitness_state IN ('none', 'fit', 'unfit')),
  ADD COLUMN promoted_for   text,
  ADD COLUMN promotion_id   uuid,
  /* the twin version's fitness_state at opening (a copy: the run's contract names the version it used) */
  ADD COLUMN twin_fitness   text NOT NULL DEFAULT 'none' CHECK (twin_fitness IN ('none', 'fit', 'unfit', 'indeterminate')),
  /* the run's own contract against the envelope (twin.envelope_check with horizon_days); 'unrecorded' = opened before 0081 (the 0035 shock_basis idiom) */
  ADD COLUMN envelope_state text NOT NULL DEFAULT 'unrecorded' CHECK (envelope_state IN ('inside', 'outside', 'unchecked', 'unrecorded')),
  ADD COLUMN envelope_check jsonb CHECK (envelope_check IS NULL OR jsonb_typeof(envelope_check) = 'object'),
  ADD COLUMN envelope_ack   jsonb CHECK (envelope_ack IS NULL OR jsonb_typeof(envelope_ack) = 'object'),
  /* the challenge this run is the re-run of (bound at opening; the challenge's rerun_run_id points back) */
  ADD COLUMN challenge_id   uuid;
ALTER TABLE simulation.runs_current ADD CONSTRAINT sim_promotion_bound CHECK ((promotion_id IS NULL) = (promoted_for IS NULL) AND (fitness_state <> 'fit' OR promotion_id IS NOT NULL));
ALTER TABLE simulation.runs_current ADD CONSTRAINT sim_envelope_ack_bound CHECK (envelope_state <> 'outside' OR envelope_ack IS NOT NULL);
COMMENT ON COLUMN simulation.runs_current.fitness_state IS 'B21 (0081): none | fit (simulation.promote_result — a reviewer other than the operator marks the result fit for a stated use, OBJ-29) | unfit (the invalidation — the operator''s, a reproduction''s or an upheld challenge''s act). Never measured: a run has no outcome ledger.';
COMMENT ON COLUMN simulation.runs_current.envelope_state IS 'B21 (0081): the run''s OWN contract against the behaviour model''s operating envelope (twin.envelope_check: horizon_days from the constraints, the other keys from the version''s elements); outside is admitted only under envelope_ack (a twin owner''s or the domain administrator''s acknowledgement). The perturbation flag outside_envelope (0033:85) is a different fact: a perturbation left the envelope.';
CREATE TABLE simulation.challenges (
  challenge_id        uuid PRIMARY KEY,
  scope               text NOT NULL,
  tenant_id           uuid NOT NULL,
  domain_id           uuid NOT NULL,
  run_id              uuid NOT NULL REFERENCES simulation.runs_current (run_id),
  kind                text NOT NULL CHECK (kind IN ('assumptions', 'model', 'constraints', 'interpretation')),
  statement           text NOT NULL CHECK (length(btrim(statement)) >= 8),
  /* the element keys, parameters or interpretation the opener names — strings, as typed */
  disputed            jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(disputed) = 'array'),
  state               text NOT NULL CHECK (state IN ('open', 'rerun_requested', 'upheld', 'dismissed', 'withdrawn')),
  opened_by           uuid NOT NULL,
  opened_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  rerun_requested_by  uuid,
  rerun_requested_at  timestamptz,
  rerun_run_id        uuid REFERENCES simulation.runs_current (run_id),
  decided_by          uuid,
  decided_at          timestamptz,
  decision_note       text,
  withdrawn_at        timestamptz,
  withdrawal_reason   text,
  correlation_id      uuid NOT NULL,
  CONSTRAINT sch_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id)),
  CONSTRAINT sch_decided CHECK ((state IN ('upheld', 'dismissed')) = (decided_by IS NOT NULL AND decided_at IS NOT NULL AND decision_note IS NOT NULL)),
  CONSTRAINT sch_withdrawn CHECK ((state = 'withdrawn') = (withdrawn_at IS NOT NULL)),
  CONSTRAINT sch_rerun_after_request CHECK (rerun_run_id IS NULL OR rerun_requested_at IS NOT NULL),
  CONSTRAINT sch_not_own_rerun CHECK (rerun_run_id IS NULL OR rerun_run_id <> run_id)
);
CREATE UNIQUE INDEX sch_one_live_per_opener ON simulation.challenges (run_id, opened_by) WHERE state IN ('open', 'rerun_requested');
CREATE INDEX sch_run ON simulation.challenges (run_id, opened_at);
CREATE TABLE simulation.challenge_events (
  event_id           uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  challenge_id       uuid NOT NULL,
  run_id             uuid NOT NULL,
  event              text NOT NULL CHECK (event IN ('challenge.opened', 'challenge.rerun_requested', 'challenge.rerun_opened', 'challenge.upheld', 'challenge.dismissed', 'challenge.withdrawn')),
  actor_principal_id uuid NOT NULL,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT sce_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE INDEX sce_challenge ON simulation.challenge_events (challenge_id, occurred_at);
CREATE TABLE simulation.promotions (
  promotion_id       uuid PRIMARY KEY,
  scope              text NOT NULL,
  tenant_id          uuid NOT NULL,
  domain_id          uuid NOT NULL,
  run_id             uuid NOT NULL REFERENCES simulation.runs_current (run_id),
  promoted_for       text NOT NULL CHECK (length(btrim(promoted_for)) >= 8),
  /* RESTATED from the row at promotion, never re-computed: {validation_status, twin_fitness, envelope_state, outside_envelope_perturbation, inherited_validation} and the row's sensitivity */
  validation         jsonb NOT NULL CHECK (jsonb_typeof(validation) = 'object'),
  sensitivity        jsonb NOT NULL,
  limitations        text[] NOT NULL DEFAULT ARRAY[]::text[],
  note               text NOT NULL CHECK (length(btrim(note)) >= 8),
  promoted_by        uuid NOT NULL,
  promoted_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  correlation_id     uuid NOT NULL,
  CONSTRAINT spr_scope CHECK (observation.scope_ok(scope, tenant_id, domain_id))
);
CREATE UNIQUE INDEX spr_one_per_run ON simulation.promotions (run_id);
-- RLS and grants: the 0033:383-388 loop idiom on the three tables (policy simulation_isolation; GRANT SELECT TO eye_app, eye_commit); append-only (no UPDATE/DELETE grant).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['challenges', 'challenge_events', 'promotions'] LOOP
    EXECUTE format('REVOKE ALL ON simulation.%I FROM PUBLIC', t);
    EXECUTE format('ALTER TABLE simulation.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE simulation.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY simulation_isolation ON simulation.%I
        USING (
          tenant_id = public.eye_tenant()
          AND (public.eye_scope() = 'TENANT' OR domain_id = public.eye_domain())
        )$f$, t);
    EXECUTE format('GRANT SELECT ON simulation.%I TO eye_app, eye_commit', t);
  END LOOP;
END $$;
ALTER TABLE simulation.run_events DROP CONSTRAINT run_events_event_check;
ALTER TABLE simulation.run_events ADD CONSTRAINT run_events_event_check CHECK (event IN ('run.opened', 'run.completed', 'run.failed', 'run.reproduced', 'run.unverified', 'run.invalidated', 'run.promoted'));

-- runs_immutable: 0078 §2's body with three changes — a completed or failed run may also change its fitness_state, promoted_for and
-- promotion_id by event (the promotion, once; the invalidation); the contract bound at opening gains the five B21 columns.
CREATE OR REPLACE FUNCTION simulation.runs_immutable() RETURNS trigger
SET search_path = simulation, pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'simulation runs are append-only: DELETE prohibited' USING ERRCODE = '2F002'; END IF;
  IF OLD.state IN ('completed', 'failed') THEN
    IF NEW.state <> OLD.state OR (to_jsonb(NEW) - ARRAY['validity', 'invalidated_at', 'invalidated_by', 'invalidation', 'fitness_state', 'promoted_for', 'promotion_id']) <> (to_jsonb(OLD) - ARRAY['validity', 'invalidated_at', 'invalidated_by', 'invalidation', 'fitness_state', 'promoted_for', 'promotion_id']) THEN
      RAISE EXCEPTION 'simulation run % is % and immutable; a correction is a new run that names it — only its validity (once) and its fitness change, by event (0078, 0081)', OLD.run_id, OLD.state USING ERRCODE = '2F002';
    END IF;
    IF OLD.validity = 'invalidated' AND (NEW.validity <> 'invalidated' OR NEW.invalidated_at IS DISTINCT FROM OLD.invalidated_at OR NEW.invalidated_by IS DISTINCT FROM OLD.invalidated_by OR NEW.invalidation IS DISTINCT FROM OLD.invalidation) THEN
      RAISE EXCEPTION 'simulation run % was invalidated at %; an invalidation is recorded once', OLD.run_id, OLD.invalidated_at USING ERRCODE = '2F002';
    END IF;
    IF OLD.promotion_id IS NOT NULL AND (NEW.promotion_id IS DISTINCT FROM OLD.promotion_id OR NEW.promoted_for IS DISTINCT FROM OLD.promoted_for) THEN
      RAISE EXCEPTION 'simulation run % was promoted at %; a promotion is recorded once (an upheld challenge changes the fitness, never the promotion)', OLD.run_id, OLD.promotion_id USING ERRCODE = '2F002';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.validity <> 'valid' THEN RAISE EXCEPTION 'simulation run % is %, not completed; only a completed result is invalidated', OLD.run_id, OLD.state USING ERRCODE = '2F002'; END IF;
  IF NEW.run_id <> OLD.run_id OR NEW.twin_id <> OLD.twin_id OR NEW.twin_version <> OLD.twin_version OR NEW.initial_state <> OLD.initial_state
     OR NEW.initial_state_digest <> OLD.initial_state_digest OR NEW.inputs_digest <> OLD.inputs_digest OR NEW.interventions <> OLD.interventions
     OR NEW.constraints <> OLD.constraints OR NEW.assumptions <> OLD.assumptions OR NEW.implementation_digest <> OLD.implementation_digest
     OR NEW.environment_digest <> OLD.environment_digest OR NEW.stochastic_mode <> OLD.stochastic_mode OR NEW.seed IS DISTINCT FROM OLD.seed
     OR NEW.samples IS DISTINCT FROM OLD.samples OR NEW.control_run_id IS DISTINCT FROM OLD.control_run_id OR NEW.run_kind <> OLD.run_kind
     OR NEW.scenario_id IS DISTINCT FROM OLD.scenario_id OR NEW.scenario_branch_id IS DISTINCT FROM OLD.scenario_branch_id
     OR NEW.scenario_version IS DISTINCT FROM OLD.scenario_version OR NEW.scenario_branch_state IS DISTINCT FROM OLD.scenario_branch_state
     OR NEW.shock <> OLD.shock OR NEW.shock_basis <> OLD.shock_basis OR NEW.controls <> OLD.controls
     OR NEW.twin_fitness <> OLD.twin_fitness OR NEW.envelope_state <> OLD.envelope_state OR NEW.envelope_check IS DISTINCT FROM OLD.envelope_check OR NEW.envelope_ack IS DISTINCT FROM OLD.envelope_ack OR NEW.challenge_id IS DISTINCT FROM OLD.challenge_id THEN
    RAISE EXCEPTION 'the experiment contract of run % is bound at opening and cannot change', OLD.run_id USING ERRCODE = '2F002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;


-- ============================================================
-- §8 the challenge ports, the promotion, invalidate_run re-declared (D11, D12). The refusal family is 'simulation challenge rejected'
--    / 'run promotion rejected'. The rerun, withdraw and decide ports are bound to the RUN: p_run_id is the route's bound target and a
--    challenge that is not the run's is refused (the pipeline binds the capability to the run; the upheld write admits the run's
--    withdrawn SIM version under that binding).
-- ============================================================
CREATE OR REPLACE FUNCTION simulation.open_challenge(
  p_challenge_id uuid, p_run_id uuid, p_tenant uuid, p_domain uuid, p_kind text, p_statement text, p_disputed jsonb, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, twin, decision, graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r simulation.runs_current%ROWTYPE; v_at timestamptz := clock_timestamp(); v_live uuid;
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.challenge.open']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'simulation challenge rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('assumptions', 'model', 'constraints', 'interpretation') THEN RAISE EXCEPTION 'simulation challenge rejected: a challenge disputes assumptions, model, constraints or interpretation' USING ERRCODE = '22023'; END IF;
  IF coalesce(length(btrim(p_statement)), 0) < 8 THEN RAISE EXCEPTION 'simulation challenge rejected: a challenge states its case (at least 8 characters)' USING ERRCODE = '22023'; END IF;
  IF p_disputed IS NOT NULL AND (jsonb_typeof(p_disputed) <> 'array' OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_disputed) x WHERE jsonb_typeof(x) <> 'string')) THEN RAISE EXCEPTION 'simulation challenge rejected: disputed is a list of the keys, parameters or interpretation disputed' USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM simulation.runs_current x WHERE x.run_id = p_run_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'simulation challenge rejected: no such run % in this domain', p_run_id USING ERRCODE = '23503'; END IF;
  IF r.state <> 'completed' THEN RAISE EXCEPTION 'simulation challenge rejected: run % is %, not completed — there is no result to dispute', p_run_id, r.state USING ERRCODE = '22023'; END IF;
  IF r.validity = 'invalidated' THEN RAISE EXCEPTION 'simulation challenge rejected: run % is invalidated (at %, trigger %) — nothing to dispute', p_run_id, r.invalidated_at, r.invalidation ->> 'trigger' USING ERRCODE = '22023'; END IF;
  SELECT c.challenge_id INTO v_live FROM simulation.challenges c WHERE c.run_id = p_run_id AND c.opened_by = p_actor AND c.state IN ('open', 'rerun_requested');
  IF v_live IS NOT NULL THEN RAISE EXCEPTION 'simulation challenge rejected: challenge % of run % by this opener is live; it is decided or withdrawn before another is opened', v_live, p_run_id USING ERRCODE = '22023'; END IF;
  INSERT INTO simulation.challenges (challenge_id, scope, tenant_id, domain_id, run_id, kind, statement, disputed, state, opened_by, opened_at, correlation_id)
  VALUES (p_challenge_id, 'DOMAIN', p_tenant, p_domain, p_run_id, p_kind, p_statement, coalesce(p_disputed, '[]'::jsonb), 'open', p_actor, v_at, p_correlation);
  INSERT INTO simulation.challenge_events (event_id, scope, tenant_id, domain_id, challenge_id, run_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_challenge_id, p_run_id, 'challenge.opened', p_actor, jsonb_build_object('kind', p_kind, 'statement', p_statement, 'disputed', coalesce(p_disputed, '[]'::jsonb)), p_correlation);
  RETURN jsonb_build_object('challenge_id', p_challenge_id, 'run_id', p_run_id, 'kind', p_kind, 'state', 'open', 'statement', p_statement, 'disputed', coalesce(p_disputed, '[]'::jsonb), 'opened_by', p_actor, 'opened_at', v_at,
                            'run', jsonb_build_object('twin_id', r.twin_id, 'twin_version', r.twin_version, 'run_kind', r.run_kind, 'control_run_id', r.control_run_id, 'corrects_run_id', r.corrects_run_id, 'operator_principal_id', r.operator_principal_id, 'validity', r.validity, 'fitness_state', r.fitness_state, 'promoted_for', r.promoted_for, 'outputs_digest', r.outputs_digest));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.open_challenge(uuid,uuid,uuid,uuid,text,text,jsonb,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.open_challenge(uuid,uuid,uuid,uuid,text,text,jsonb,uuid,uuid,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION simulation.request_rerun(p_challenge_id uuid, p_run_id uuid, p_tenant uuid, p_domain uuid, p_note text, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, twin, decision, graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c simulation.challenges%ROWTYPE; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.challenge.rerun']); PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'simulation challenge rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  SELECT * INTO c FROM simulation.challenges x WHERE x.challenge_id = p_challenge_id AND x.run_id = p_run_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'simulation challenge rejected: no such challenge % of run % in this domain', p_challenge_id, p_run_id USING ERRCODE = '23503'; END IF;
  IF c.state <> 'open' THEN RAISE EXCEPTION 'simulation challenge rejected: challenge % is %, not open; a re-run is requested on an open challenge', p_challenge_id, c.state USING ERRCODE = '22023'; END IF;
  UPDATE simulation.challenges SET state = 'rerun_requested', rerun_requested_by = p_actor, rerun_requested_at = v_at WHERE challenge_id = p_challenge_id;
  INSERT INTO simulation.challenge_events (event_id, scope, tenant_id, domain_id, challenge_id, run_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_challenge_id, c.run_id, 'challenge.rerun_requested', p_actor, jsonb_build_object('note', p_note), p_correlation);
  RETURN jsonb_build_object('challenge_id', p_challenge_id, 'run_id', c.run_id, 'state', 'rerun_requested', 'rerun_requested_at', v_at, 'kind', c.kind, 'opened_by', c.opened_by,
                            'how', 'open a governed run (POST …/twins/simulations/run) with correctsRunId = the challenged run and challengeId = this challenge; the compare route judges it on the common control');
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.request_rerun(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.request_rerun(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION simulation.withdraw_challenge(p_challenge_id uuid, p_run_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, twin, decision, graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c simulation.challenges%ROWTYPE; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.challenge.withdraw']); PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'simulation challenge rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'simulation challenge rejected: a withdrawal states its reason (at least 8 characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO c FROM simulation.challenges x WHERE x.challenge_id = p_challenge_id AND x.run_id = p_run_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'simulation challenge rejected: no such challenge % of run % in this domain', p_challenge_id, p_run_id USING ERRCODE = '23503'; END IF;
  -- the opener's act alone (the decider's answer to a challenge is a decision, never a withdrawal)
  IF c.opened_by <> p_actor THEN RAISE EXCEPTION 'simulation challenge rejected: a challenge is withdrawn by its opener; the acting principal did not open challenge %', p_challenge_id USING ERRCODE = '42501'; END IF;
  IF c.state NOT IN ('open', 'rerun_requested') THEN RAISE EXCEPTION 'simulation challenge rejected: challenge % is %; only a live challenge is withdrawn', p_challenge_id, c.state USING ERRCODE = '22023'; END IF;
  UPDATE simulation.challenges SET state = 'withdrawn', withdrawn_at = v_at, withdrawal_reason = p_reason WHERE challenge_id = p_challenge_id;
  INSERT INTO simulation.challenge_events (event_id, scope, tenant_id, domain_id, challenge_id, run_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_challenge_id, c.run_id, 'challenge.withdrawn', p_actor, jsonb_build_object('reason', p_reason, 'prior_state', c.state, 'rerun_run_id', c.rerun_run_id), p_correlation);
  RETURN jsonb_build_object('challenge_id', p_challenge_id, 'run_id', c.run_id, 'state', 'withdrawn', 'withdrawn_at', v_at, 'reason', p_reason, 'rerun_run_id', c.rerun_run_id, 'kind', c.kind, 'opened_by', c.opened_by);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.withdraw_challenge(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.withdraw_challenge(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid) TO eye_commit;

CREATE OR REPLACE FUNCTION simulation.decide_challenge(p_challenge_id uuid, p_run_id uuid, p_tenant uuid, p_domain uuid, p_decision text, p_note text, p_actor uuid, p_event_id uuid, p_correlation uuid) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, twin, decision, graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE c simulation.challenges%ROWTYPE; r simulation.runs_current%ROWTYPE; v_at timestamptz := clock_timestamp();
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.challenge.decide']); PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'simulation challenge rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('upheld', 'dismissed') THEN RAISE EXCEPTION 'simulation challenge rejected: a decision upholds or dismisses the challenge' USING ERRCODE = '22023'; END IF;
  IF coalesce(length(btrim(p_note)), 0) < 8 THEN RAISE EXCEPTION 'simulation challenge rejected: a decision states its note (at least 8 characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO c FROM simulation.challenges x WHERE x.challenge_id = p_challenge_id AND x.run_id = p_run_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'simulation challenge rejected: no such challenge % of run % in this domain', p_challenge_id, p_run_id USING ERRCODE = '23503'; END IF;
  IF c.state NOT IN ('open', 'rerun_requested') THEN RAISE EXCEPTION 'simulation challenge rejected: challenge % is %; only a live challenge is decided', p_challenge_id, c.state USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM simulation.runs_current x WHERE x.run_id = c.run_id FOR UPDATE;
  -- SEPARATION OF DUTIES (the 0077:823 idiom; V00-T-062): neither the opener nor the operator of the disputed run decides it.
  IF c.opened_by = p_actor THEN RAISE EXCEPTION 'simulation challenge rejected: the decider is the challenge''s opener; someone else decides challenge %', p_challenge_id USING ERRCODE = '42501'; END IF;
  IF r.operator_principal_id = p_actor THEN RAISE EXCEPTION 'simulation challenge rejected: the decider operated the challenged run %; someone else decides challenge %', c.run_id, p_challenge_id USING ERRCODE = '42501'; END IF;
  UPDATE simulation.challenges SET state = p_decision, decided_by = p_actor, decided_at = v_at, decision_note = p_note WHERE challenge_id = p_challenge_id;
  INSERT INTO simulation.challenge_events (event_id, scope, tenant_id, domain_id, challenge_id, run_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_challenge_id, c.run_id, 'challenge.' || p_decision, p_actor,
          jsonb_build_object('note', p_note, 'rerun_run_id', c.rerun_run_id, 'prior_state', c.state, 'run_validity', r.validity), p_correlation);
  RETURN jsonb_build_object('challenge_id', p_challenge_id, 'run_id', c.run_id, 'state', p_decision, 'decided_by', p_actor, 'decided_at', v_at, 'note', p_note, 'kind', c.kind,
                            'opened_by', c.opened_by, 'rerun_run_id', c.rerun_run_id, 'run', jsonb_build_object('validity', r.validity, 'fitness_state', r.fitness_state, 'operator_principal_id', r.operator_principal_id, 'promoted_for', r.promoted_for));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.decide_challenge(uuid,uuid,uuid,uuid,text,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.decide_challenge(uuid,uuid,uuid,uuid,text,text,uuid,uuid,uuid) TO eye_commit;
-- An UPHELD decision changes the challenge only; the SERVICE then invalidates the run in the same write (the withdrawn SIM version
-- admitted from TypeScript under simulation.challenge.decide, then simulation.invalidate_run with trigger challenge); a run already
-- invalidated meanwhile is upheld WITHOUT a second invalidation, the answer saying so (invalidation_withheld: already_invalidated).

CREATE OR REPLACE FUNCTION simulation.promote_result(
  p_promotion_id uuid, p_run_id uuid, p_tenant uuid, p_domain uuid, p_promoted_for text, p_limitations text[], p_note text, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, twin, decision, graph, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r simulation.runs_current%ROWTYPE; v_at timestamptz := clock_timestamp(); v_live record; v_validation jsonb;
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.result.promote']); PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'run promotion rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF coalesce(length(btrim(p_promoted_for)), 0) < 8 THEN RAISE EXCEPTION 'run promotion rejected: a promotion states the use the result is fit for (at least 8 characters)' USING ERRCODE = '22023'; END IF;
  IF coalesce(length(btrim(p_note)), 0) < 8 THEN RAISE EXCEPTION 'run promotion rejected: a promotion states its note (at least 8 characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM simulation.runs_current x WHERE x.run_id = p_run_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'run promotion rejected: no such run % in this domain', p_run_id USING ERRCODE = '23503'; END IF;
  IF r.operator_principal_id = p_actor THEN RAISE EXCEPTION 'run promotion rejected: the reviewer operated run %; a result is promoted by someone else (OBJ-29)', p_run_id USING ERRCODE = '42501'; END IF;
  IF r.state <> 'completed' THEN RAISE EXCEPTION 'run promotion rejected: run % is %, not completed', p_run_id, r.state USING ERRCODE = '22023'; END IF;
  IF r.validity = 'invalidated' THEN RAISE EXCEPTION 'run promotion rejected: run % is invalidated (at %, trigger %); an invalidated result is not promoted', p_run_id, r.invalidated_at, r.invalidation ->> 'trigger' USING ERRCODE = '22023'; END IF;
  IF r.promotion_id IS NOT NULL THEN RAISE EXCEPTION 'run promotion rejected: run % was promoted already (promotion %, for "%"); a promotion is recorded once', p_run_id, r.promotion_id, r.promoted_for USING ERRCODE = '22023'; END IF;
  SELECT c.challenge_id, c.state INTO v_live FROM simulation.challenges c WHERE c.run_id = p_run_id AND c.state IN ('open', 'rerun_requested') ORDER BY c.opened_at LIMIT 1;
  IF v_live.challenge_id IS NOT NULL THEN RAISE EXCEPTION 'run promotion rejected: challenge % of run % is % — a disputed result is not promoted until the challenge is decided or withdrawn', v_live.challenge_id, p_run_id, v_live.state USING ERRCODE = '22023'; END IF;
  v_validation := jsonb_build_object('validation_status', r.validation_status, 'twin_fitness', r.twin_fitness, 'envelope_state', r.envelope_state, 'outside_envelope_perturbation', r.outside_envelope,
                                     'inherited_validation', (SELECT coalesce(jsonb_agg(jsonb_build_object('key', e ->> 'key', 'state', e ->> 'inherited_validation')), '[]'::jsonb) FROM jsonb_array_elements(r.initial_state) e WHERE (e ->> 'inherited_validation') IS NOT NULL));
  INSERT INTO simulation.promotions (promotion_id, scope, tenant_id, domain_id, run_id, promoted_for, validation, sensitivity, limitations, note, promoted_by, promoted_at, correlation_id)
  VALUES (p_promotion_id, 'DOMAIN', p_tenant, p_domain, p_run_id, p_promoted_for, v_validation, coalesce(r.sensitivity, 'null'::jsonb), coalesce(p_limitations, ARRAY[]::text[]), p_note, p_actor, v_at, p_correlation);
  UPDATE simulation.runs_current SET fitness_state = 'fit', promoted_for = p_promoted_for, promotion_id = p_promotion_id WHERE run_id = p_run_id;
  INSERT INTO simulation.run_events (event_id, scope, tenant_id, domain_id, run_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_run_id, 'run.promoted', p_actor, jsonb_build_object('promotion_id', p_promotion_id, 'promoted_for', p_promoted_for, 'limitations', to_jsonb(coalesce(p_limitations, ARRAY[]::text[])), 'note', p_note, 'validation', v_validation), p_correlation);
  RETURN jsonb_build_object('promotion_id', p_promotion_id, 'run_id', p_run_id, 'fitness_state', 'fit', 'promoted_for', p_promoted_for, 'validation', v_validation, 'sensitivity', r.sensitivity, 'limitations', to_jsonb(coalesce(p_limitations, ARRAY[]::text[])), 'promoted_by', p_actor, 'promoted_at', v_at, 'operator_principal_id', r.operator_principal_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.promote_result(uuid,uuid,uuid,uuid,text,text[],text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.promote_result(uuid,uuid,uuid,uuid,text,text[],text,uuid,uuid,uuid) TO eye_commit;

-- invalidate_run: 0078 §2's body with FIVE changes — the authority list and the trigger vocabulary gain the upheld challenge
-- (simulation.challenge.decide ↔ challenge), the acting-principal check applies to a person's and a decider's act, the reference is
-- checked (an upheld challenge of this run), the run's fitness_state becomes unfit and the answer names it. Everything else byte for byte.
CREATE OR REPLACE FUNCTION simulation.invalidate_run(
  p_run_id uuid, p_tenant uuid, p_domain uuid, p_reason text, p_trigger text, p_trigger_ref uuid, p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, decision, graph, twin, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE r simulation.runs_current%ROWTYPE; v_action text; v_at timestamptz := clock_timestamp(); v_packages jsonb; v_commitments jsonb; v_decisions jsonb; v_twins jsonb; v_runs jsonb; v_dependants jsonb;
BEGIN
  v_action := observation.assert_authority(ARRAY['simulation.run.invalidate', 'simulation.reproduce', 'simulation.challenge.decide']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  IF p_trigger IS NULL OR p_trigger NOT IN ('operator', 'reproduction', 'challenge') THEN RAISE EXCEPTION 'run invalidation rejected: the trigger is operator (a person''s act), reproduction (an unreproducible verdict) or challenge (an upheld challenge)' USING ERRCODE = '22023'; END IF;
  IF (CASE p_trigger WHEN 'reproduction' THEN v_action <> 'simulation.reproduce' WHEN 'challenge' THEN v_action <> 'simulation.challenge.decide' ELSE v_action <> 'simulation.run.invalidate' END) THEN
    RAISE EXCEPTION 'run invalidation rejected: a reproduction invalidates under simulation.reproduce with trigger reproduction; an upheld challenge under simulation.challenge.decide with trigger challenge; a person under simulation.run.invalidate with trigger operator (context %, trigger %)', v_action, p_trigger USING ERRCODE = '42501';
  END IF;
  IF p_trigger IN ('operator', 'challenge') AND p_actor IS DISTINCT FROM public.eye_principal() THEN RAISE EXCEPTION 'run invalidation rejected: recorded by the acting principal' USING ERRCODE = '42501'; END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN RAISE EXCEPTION 'run invalidation rejected: an invalidation states its reason (at least 8 characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM simulation.runs_current x WHERE x.run_id = p_run_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'run invalidation rejected: no such run % in this domain', p_run_id USING ERRCODE = '23503'; END IF;
  IF r.validity = 'invalidated' THEN RAISE EXCEPTION 'run invalidation rejected: run % is already invalidated (at %, trigger %)', p_run_id, r.invalidated_at, r.invalidation ->> 'trigger' USING ERRCODE = '22023'; END IF;
  IF r.state <> 'completed' THEN RAISE EXCEPTION 'run invalidation rejected: run % is %, not completed — only a completed result is invalidated (an opened run has no result; a failed one none to withdraw)', p_run_id, r.state USING ERRCODE = '22023'; END IF;
  IF p_trigger = 'reproduction' AND NOT EXISTS (SELECT 1 FROM simulation.reproductions q WHERE q.reproduction_id = p_trigger_ref AND q.run_id = p_run_id AND q.verdict = 'unreproducible') THEN
    RAISE EXCEPTION 'run invalidation rejected: % is not an unreproducible reproduction of run %', p_trigger_ref, p_run_id USING ERRCODE = '23503';
  END IF;
  IF p_trigger = 'challenge' AND NOT EXISTS (SELECT 1 FROM simulation.challenges c WHERE c.challenge_id = p_trigger_ref AND c.run_id = p_run_id AND c.state = 'upheld') THEN
    RAISE EXCEPTION 'run invalidation rejected: % is not an upheld challenge of run %', p_trigger_ref, p_run_id USING ERRCODE = '23503';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('package_id', p.package_id, 'version', p.current_version, 'state', p.state, 'committed', p.committed_version IS NOT NULL, 'option_keys', to_jsonb(p.keys)) ORDER BY p.declared_at), '[]'::jsonb) INTO v_packages
    FROM (SELECT pk.package_id, pk.current_version, pk.state, pk.committed_version, pk.declared_at, array_agg(DISTINCT o.key ORDER BY o.key) AS keys
            FROM decision.packages_current pk JOIN decision.options o ON o.package_id = pk.package_id AND o.version = pk.current_version
           WHERE pk.tenant_id = p_tenant AND pk.domain_id = p_domain AND pk.state NOT IN ('closed', 'rejected', 'withdrawn')
             AND EXISTS (SELECT 1 FROM jsonb_array_elements(o.consequences) c WHERE (c ->> 'kind') = 'run' AND (c ->> 'id') = p_run_id::text)
           GROUP BY pk.package_id, pk.current_version, pk.state, pk.committed_version, pk.declared_at ORDER BY pk.declared_at LIMIT 200) p;
  SELECT coalesce(jsonb_agg(d.dependent_object_id ORDER BY d.created_at), '[]'::jsonb) INTO v_commitments
    FROM (SELECT * FROM graph.dependencies d WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.state = 'active' AND d.depends_on_kind = 'run' AND d.depends_on_id = p_run_id AND d.dependent_type = 'CMT' ORDER BY d.created_at LIMIT 200) d;
  SELECT coalesce(jsonb_agg(d.dependent_object_id ORDER BY d.created_at), '[]'::jsonb) INTO v_decisions
    FROM (SELECT * FROM graph.dependencies d WHERE d.tenant_id = p_tenant AND d.domain_id = p_domain AND d.state = 'active' AND d.depends_on_kind = 'run' AND d.depends_on_id = p_run_id AND d.dependent_type = 'DEC' ORDER BY d.created_at LIMIT 200) d;
  SELECT coalesce(jsonb_agg(jsonb_build_object('twin_id', t.twin_id, 'version', t.version, 'verification_state', t.verification_state) ORDER BY t.twin_id, t.version), '[]'::jsonb) INTO v_twins
    FROM (SELECT DISTINCT v.twin_id, v.version, v.verification_state FROM twin.twin_versions v JOIN twin.state_elements e ON e.twin_id = v.twin_id AND e.version = v.version
           WHERE v.tenant_id = p_tenant AND v.domain_id = p_domain AND v.state = 'admitted'
             AND EXISTS (SELECT 1 FROM jsonb_array_elements(e.citations) c WHERE (c ->> 'kind') = 'run' AND (c ->> 'id') = p_run_id::text) LIMIT 200) t;
  SELECT coalesce(jsonb_agg(jsonb_build_object('run_id', x.run_id, 'via', x.via, 'state', x.state, 'validity', x.validity) ORDER BY x.opened_at), '[]'::jsonb) INTO v_runs
    FROM (SELECT q.run_id, q.state, q.validity, q.opened_at, CASE WHEN q.control_run_id = p_run_id THEN 'control' ELSE 'citation' END AS via FROM simulation.runs_current q
           WHERE q.tenant_id = p_tenant AND q.domain_id = p_domain AND q.run_id <> p_run_id
             AND (q.control_run_id = p_run_id OR EXISTS (SELECT 1 FROM jsonb_array_elements(q.initial_state) el, jsonb_array_elements(coalesce(el -> 'citations', '[]'::jsonb)) c WHERE (c ->> 'kind') = 'run' AND (c ->> 'id') = p_run_id::text))
           ORDER BY q.opened_at LIMIT 200) x;
  v_dependants := jsonb_build_object('packages', v_packages, 'commitments', v_commitments, 'decisions', v_decisions, 'twins', v_twins, 'simulations', v_runs);
  UPDATE simulation.runs_current SET validity = 'invalidated', fitness_state = 'unfit', invalidated_at = v_at, invalidated_by = p_actor,
         invalidation = jsonb_build_object('reason', p_reason, 'trigger', p_trigger, 'trigger_ref', p_trigger_ref, 'dependants', v_dependants) WHERE run_id = p_run_id;
  INSERT INTO simulation.run_events (event_id, scope, tenant_id, domain_id, run_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_run_id, 'run.invalidated', p_actor,
          jsonb_build_object('reason', p_reason, 'trigger', p_trigger, 'trigger_ref', p_trigger_ref, 'invalidated_at', v_at, 'dependants', v_dependants, 'outputs_digest', r.outputs_digest), p_correlation);
  RETURN jsonb_build_object('run_id', p_run_id, 'invalidated_at', v_at, 'trigger', p_trigger, 'trigger_ref', p_trigger_ref, 'dependants', v_dependants,
                            'run', jsonb_build_object('twin_id', r.twin_id, 'twin_version', r.twin_version, 'branch_id', r.branch_id, 'run_kind', r.run_kind, 'control_run_id', r.control_run_id, 'scenario_id', r.scenario_id, 'scenario_version', r.scenario_version,
                                                      'outputs_digest', r.outputs_digest, 'inputs_digest', r.inputs_digest, 'header_digest', r.header_digest, 'completed_at', r.completed_at, 'operator_principal_id', r.operator_principal_id, 'validation_status', r.validation_status, 'fitness_state', r.fitness_state, 'promoted_for', r.promoted_for));
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.invalidate_run(uuid,uuid,uuid,text,text,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.invalidate_run(uuid,uuid,uuid,text,text,uuid,uuid,uuid,uuid) TO eye_commit;

-- The canonical-write action of the upheld decision (the 0078 invalidate idiom): objects.admit_version admits, under
-- simulation.challenge.decide, the withdrawn SIM version and nothing else. No other new act admits a canonical version — validate,
-- assess, check, open, rerun, withdraw and promote write ledger rows only.
INSERT INTO observation.canonical_write_actions (action, object_types, rationale) VALUES
  ('simulation.challenge.decide', ARRAY['SIM'], 'An UPHELD challenge invalidates the disputed run in the deciding write: it admits the withdrawn SIM version and nothing else (B21, 0081 — the 0078 invalidate idiom)')
ON CONFLICT (action) DO NOTHING;


-- ============================================================
-- §9 simulation.open_run — DROP + CREATE (the signature gains p_envelope_ack jsonb, p_challenge_id uuid after p_controls, before
--    p_actor — the 0035:272-273 idiom); 0066 §8's body with the five B21 blocks: the unfit refusal (D3 a), the incoherent-scenario
--    refusal (D10), the run's own envelope check and the acknowledgement (D3 b), the re-run's binding to its challenge (D11) and the
--    challenge's rerun_run_id set once; the row, run.opened and the answer carry twin_fitness, the envelope and the challenge.
-- ============================================================
DROP FUNCTION simulation.open_run(uuid,uuid,uuid,uuid,int,text,uuid,uuid,uuid,uuid,int,text,boolean,text,text,text,text,text,jsonb,text,text,bigint,int,jsonb,jsonb,jsonb,jsonb,text,text,jsonb,uuid,uuid,uuid);
CREATE OR REPLACE FUNCTION simulation.open_run(
  p_run_id uuid, p_tenant uuid, p_domain uuid, p_twin_id uuid, p_twin_version int, p_run_kind text, p_control_run_id uuid, p_corrects uuid,
  p_scenario_id uuid, p_scenario_branch_id uuid, p_scenario_version int, p_scenario_branch_state text, p_shock boolean, p_shock_basis text, p_component text,
  p_model_ref text, p_implementation_digest text, p_environment_digest text, p_environment jsonb,
  p_stochastic_mode text, p_rng text, p_seed bigint, p_samples int, p_jitter jsonb,
  p_interventions jsonb, p_constraints jsonb, p_assumptions jsonb, p_inputs_digest text, p_validation_status text, p_controls jsonb, p_envelope_ack jsonb, p_challenge_id uuid,
  p_actor uuid, p_event_id uuid, p_correlation uuid
) RETURNS jsonb
SECURITY DEFINER SET search_path = simulation, twin, prediction, observation, ctx, public, pg_catalog, pg_temp AS $$
DECLARE
  v twin.twin_versions%ROWTYPE; v_state jsonb; v_digest text; c simulation.runs_current%ROWTYPE; v_pinned text; v_controls jsonb; v_synthetic boolean;
  v_unusable jsonb; v_unavailable jsonb; b prediction.branches_current%ROWTYPE; v_scn_version int; v_branch_state text; v_expected_basis text; v_flip uuid;
  v_flip_observed date; v_envelope jsonb; v_outside text; v_ack jsonb; ch simulation.challenges%ROWTYPE;
BEGIN
  PERFORM observation.assert_authority(ARRAY['simulation.run']);
  PERFORM observation.assert_scope(p_tenant, p_domain);
  SELECT * INTO v FROM twin.twin_versions WHERE twin_id = p_twin_id AND version = p_twin_version AND tenant_id = p_tenant AND domain_id = p_domain;
  IF NOT FOUND OR v.state <> 'admitted' THEN
    RAISE EXCEPTION 'run rejected: version % of twin % is not an admitted version in this domain', p_twin_version, p_twin_id USING ERRCODE = '23503';
  END IF;
  IF v.completeness <> 'complete' THEN
    RAISE EXCEPTION 'run rejected: twin version % is incomplete (missing %); a run cannot use inputs the twin does not hold', p_twin_version, v.missing_keys::text USING ERRCODE = '22023';
  END IF;
  IF v.observed_through IS NULL THEN
    RAISE EXCEPTION 'run rejected: twin version % has no world-time cut-off (observed_through); a run reads the twin under two cut-offs', p_twin_version USING ERRCODE = '22023';
  END IF;
  -- B21 (0081, D3 a; AU-TWN-0014, V03-T-120): an UNFIT version opens no run — its behaviours are disabled until a later validation finds otherwise.
  IF v.fitness_state = 'unfit' THEN
    RAISE EXCEPTION 'run rejected (unfit_twin): twin version % of twin % is unfit (validation %); behaviours are disabled until a later validation finds it fit or indeterminate', p_twin_version, p_twin_id, v.fitness_validation_id USING ERRCODE = '22023';
  END IF;
  v_unusable := twin.unusable_inputs(p_twin_id, p_twin_version, p_component);
  IF jsonb_array_length(v_unusable) > 0 THEN
    RAISE EXCEPTION 'run rejected: inputs for component % are not usable: %', p_component, v_unusable::text USING ERRCODE = '22023';
  END IF;
  v_unavailable := twin.unavailable_inputs(p_twin_id, p_twin_version, p_component);
  IF jsonb_array_length(v_unavailable) > 0 THEN
    RAISE EXCEPTION 'run rejected: required inputs for component % are no longer available: %', p_component, v_unavailable::text USING ERRCODE = '22023';
  END IF;
  SELECT implementation_digest INTO v_pinned FROM twin.behaviour_models WHERE method_ref = p_model_ref;
  IF v_pinned IS NULL THEN
    RAISE EXCEPTION 'run rejected: behaviour model % has no pinned implementation', p_model_ref USING ERRCODE = '22023';
  END IF;
  IF v_pinned <> p_implementation_digest THEN
    RAISE EXCEPTION 'run rejected: the implementation offered (%) is not the pinned implementation of % (%)', p_implementation_digest, p_model_ref, v_pinned USING ERRCODE = '22023';
  END IF;
  IF p_run_kind = 'control' AND (p_control_run_id IS NOT NULL OR p_interventions <> '[{"type": "none"}]'::jsonb) THEN
    RAISE EXCEPTION 'run rejected: a control run applies `none` and references no control' USING ERRCODE = '22023';
  END IF;
  IF p_scenario_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM prediction.scenarios_current s WHERE s.scenario_id = p_scenario_id AND s.tenant_id = p_tenant AND s.domain_id = p_domain) THEN
      RAISE EXCEPTION 'run rejected: scenario % is not an authorized scenario in this domain', p_scenario_id USING ERRCODE = '23503';
    END IF;
    -- 0066 §8 (V04-T-032): a RETIRED scenario's branches do not enter simulation; its history stays for replay.
    IF EXISTS (SELECT 1 FROM prediction.scenarios_current s WHERE s.scenario_id = p_scenario_id AND s.state = 'retired') THEN
      RAISE EXCEPTION 'run rejected: scenario % was retired by review; a retired branch is not simulated (declare a successor scenario)', p_scenario_id USING ERRCODE = '22023';
    END IF;
    -- B21 (0081, D10; FEX-12, V03-T-143, AI-49-004): an incoherent scenario's branches do not enter simulation.
    IF EXISTS (SELECT 1 FROM prediction.scenarios_current s WHERE s.scenario_id = p_scenario_id AND s.coherence_state = 'failed') THEN
      RAISE EXCEPTION 'run rejected (incoherent_scenario): scenario % failed its coherence check % (%); a branch of an incoherent scenario is not simulated until a review resolves it', p_scenario_id,
        (SELECT s.coherence_check_id FROM prediction.scenarios_current s WHERE s.scenario_id = p_scenario_id),
        (SELECT string_agg(DISTINCT x ->> 'rule', ', ') FROM prediction.scenarios_current s JOIN prediction.scenario_coherence_checks k ON k.check_id = s.coherence_check_id, jsonb_array_elements(k.findings) x WHERE s.scenario_id = p_scenario_id AND (x ->> 'severity') = 'fail')
        USING ERRCODE = '22023';
    END IF;
    SELECT * INTO b FROM prediction.branches_current WHERE branch_id = p_scenario_branch_id AND scenario_id = p_scenario_id AND tenant_id = p_tenant AND domain_id = p_domain;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'run rejected: branch % is not a branch of scenario %', p_scenario_branch_id, p_scenario_id USING ERRCODE = '22023';
    END IF;
    v_scn_version := prediction.scenario_version_as_of(p_scenario_id, v.known_at);
    IF v_scn_version IS NULL THEN
      RAISE EXCEPTION 'run rejected: scenario % was recorded after this version''s known_at (%); it was not known at record time', p_scenario_id, v.known_at USING ERRCODE = '22023';
    END IF;
    IF v_scn_version IS DISTINCT FROM p_scenario_version THEN
      RAISE EXCEPTION 'run rejected: scenario % stood at version % at this version''s known_at (%), not %', p_scenario_id, v_scn_version, v.known_at, p_scenario_version USING ERRCODE = '22023';
    END IF;
    /* BOTH CLOCKS: written by this run's record cut-off, and observed within its world. */
    v_branch_state := prediction.branch_state_as_of(p_scenario_branch_id, v.known_at, v.observed_through);
    v_flip_observed := prediction.branch_flip_observed_at(p_scenario_branch_id);
    IF v_branch_state IS DISTINCT FROM p_scenario_branch_state THEN
      RAISE EXCEPTION 'run rejected: branch % was % under this run''s cut-offs (known_at %, observations through %; the flip was recorded % and observed %), not %',
        p_scenario_branch_id, v_branch_state, v.known_at, v.observed_through, b.flipped_at, v_flip_observed, p_scenario_branch_state USING ERRCODE = '22023';
    END IF;
    IF p_shock <> (v_branch_state = 'flipped') THEN
      RAISE EXCEPTION 'run rejected: the shock contradicts the bound branch: branch % was % under this run''s cut-offs (a shock without a flipped branch is a hypothetical and names no scenario)', p_scenario_branch_id, v_branch_state USING ERRCODE = '22023';
    END IF;
    v_flip := CASE WHEN v_branch_state = 'flipped' THEN b.flip_event_id ELSE NULL END;
    v_expected_basis := CASE WHEN p_shock THEN 'scenario-branch-flipped' ELSE 'none' END;
  ELSE
    IF p_scenario_branch_id IS NOT NULL THEN
      RAISE EXCEPTION 'run rejected: a scenario branch was named without its scenario' USING ERRCODE = '22023';
    END IF;
    v_expected_basis := CASE WHEN p_shock THEN 'hypothetical' ELSE 'none' END;
  END IF;
  IF p_shock_basis IS DISTINCT FROM v_expected_basis THEN
    RAISE EXCEPTION 'run rejected: the shock basis offered (%) is not what the binding establishes (%)', p_shock_basis, v_expected_basis USING ERRCODE = '22023';
  END IF;
  v_controls := coalesce(p_controls, v.controls);
  IF simulation.classification_rank(v_controls ->> 'classification') < simulation.classification_rank(v.controls ->> 'classification')
     OR (coalesce((v.controls ->> 'synthetic_state')::boolean, false) AND NOT coalesce((v_controls ->> 'synthetic_state')::boolean, false)) THEN
    RAISE EXCEPTION 'run rejected: the controls offered are less restricted than the twin version''s' USING ERRCODE = '22023';
  END IF;
  -- B21 (0081, D3 b): THE RUN'S OWN CONTRACT against the envelope — one rule with the validation (twin.envelope_check); outside needs the acknowledgement.
  v_envelope := twin.envelope_check(p_twin_id, p_twin_version, jsonb_build_object('horizon_days', (p_constraints ->> 'horizon_days')::numeric));
  v_ack := NULL;
  IF (v_envelope ->> 'state') = 'outside' THEN
    SELECT string_agg(k || ' = ' || (x ->> 'value') || ' outside [' || (x -> 'range' ->> 0) || ', ' || (x -> 'range' ->> 1) || ']', '; ' ORDER BY k) INTO v_outside FROM jsonb_each(v_envelope -> 'keys') e(k, x) WHERE (x ->> 'verdict') = 'outside';
    -- the acknowledgement is read as TEXT, never cast: a non-boolean, "yes", 1 or a missing key all read as "not acknowledged" (no 22P02)
    IF p_envelope_ack IS NULL OR (p_envelope_ack ->> 'acknowledge') IS DISTINCT FROM 'true' OR coalesce(length(btrim(p_envelope_ack ->> 'reason')), 0) < 8 THEN
      RAISE EXCEPTION 'run rejected (envelope): outside the operating envelope of % (%); a run outside the envelope needs a twin owner''s or the domain administrator''s acknowledgement (envelope.acknowledge true with a reason of 8+ characters)', p_model_ref, v_outside USING ERRCODE = '22023';
    END IF;
    IF NOT twin.envelope_ack_holder(p_actor, p_tenant, p_domain) THEN
      RAISE EXCEPTION 'run rejected (envelope_ack): the acknowledgement of an envelope breach is a twin owner''s or the domain administrator''s; the acting principal holds neither role in this domain (%)', v_outside USING ERRCODE = '42501';
    END IF;
    v_ack := jsonb_build_object('acknowledged_by', p_actor, 'acknowledged_at', clock_timestamp(), 'reason', p_envelope_ack ->> 'reason', 'keys', v_outside);
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('key', e.key, 'kind', e.kind, 'basis_truth_state', e.basis_truth_state, 'value', e.value, 'unit', e.unit,
                                               'material', e.material, 'citations', e.citations, 'health', e.health, 'valid_from', e.valid_from,
                                               'valid_to', e.valid_to, 'confidence', e.confidence, 'synthetic_state', e.synthetic_state, 'controls', e.controls,
                                               'inherited_validation', e.inherited_validation)
                            ORDER BY e.key), '[]'::jsonb)
    INTO v_state FROM twin.state_elements e WHERE e.twin_id = p_twin_id AND e.version = p_twin_version;
  v_digest := encode(sha256(convert_to(v_state::text, 'UTF8')), 'hex');
  IF p_run_kind = 'intervention' THEN
    SELECT * INTO c FROM simulation.runs_current WHERE run_id = p_control_run_id AND tenant_id = p_tenant AND domain_id = p_domain;
    IF NOT FOUND THEN RAISE EXCEPTION 'run rejected: control run % is not an authorized run in this domain', p_control_run_id USING ERRCODE = '23503'; END IF;
    IF c.run_kind <> 'control' THEN RAISE EXCEPTION 'run rejected: % is not a control run', p_control_run_id USING ERRCODE = '22023'; END IF;
    IF c.state <> 'completed' THEN RAISE EXCEPTION 'run rejected: control run % is not completed', p_control_run_id USING ERRCODE = '22023'; END IF;
    IF c.twin_id <> p_twin_id OR c.twin_version <> p_twin_version OR c.initial_state_digest <> v_digest OR c.implementation_digest <> p_implementation_digest
       OR c.assumptions <> p_assumptions OR c.constraints <> p_constraints OR c.shock <> p_shock OR c.component <> p_component
       OR c.scenario_id IS DISTINCT FROM p_scenario_id OR c.scenario_branch_id IS DISTINCT FROM p_scenario_branch_id
       OR c.scenario_version IS DISTINCT FROM p_scenario_version OR c.shock_basis <> p_shock_basis THEN
      RAISE EXCEPTION 'run rejected: control run % is not compatible (it must share the twin version, initial state, implementation, assumptions, constraints, scenario binding, shock and component)', p_control_run_id
        USING ERRCODE = '22023';
    END IF;
  END IF;
  -- B21 (0081, D11): a RE-RUN answering a challenge names it; the challenge must await a re-run of the run this run corrects; one re-run per challenge.
  -- (the aliases here and in the incoherent-scenario block avoid `c`: this body declares c simulation.runs_current%ROWTYPE, and §7 gave that row a challenge_id)
  IF p_challenge_id IS NOT NULL THEN
    SELECT * INTO ch FROM simulation.challenges x WHERE x.challenge_id = p_challenge_id AND x.tenant_id = p_tenant AND x.domain_id = p_domain FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'run rejected (challenge): no such challenge % in this domain', p_challenge_id USING ERRCODE = '23503'; END IF;
    IF p_corrects IS DISTINCT FROM ch.run_id THEN RAISE EXCEPTION 'run rejected (challenge): challenge % disputes run %; a re-run names it as the run it corrects (correctsRunId)', p_challenge_id, ch.run_id USING ERRCODE = '22023'; END IF;
    IF ch.state <> 'rerun_requested' THEN RAISE EXCEPTION 'run rejected (challenge): challenge % is not awaiting a re-run (state %)', p_challenge_id, ch.state USING ERRCODE = '22023'; END IF;
    IF ch.rerun_run_id IS NOT NULL THEN RAISE EXCEPTION 'run rejected (challenge): challenge % is not awaiting a re-run (run % is its re-run)', p_challenge_id, ch.rerun_run_id USING ERRCODE = '22023'; END IF;
  END IF;
  v_synthetic := coalesce((v_controls ->> 'synthetic_state')::boolean, v.synthetic_state);
  INSERT INTO simulation.runs_current (
    run_id, scope, tenant_id, domain_id, twin_id, twin_version, branch_id, run_kind, control_run_id, corrects_run_id,
    scenario_id, scenario_branch_id, scenario_version, scenario_branch_state, scenario_flip_event, shock, shock_basis, component,
    known_at, observed_through, initial_state, initial_state_digest, model_ref, implementation_digest, environment_digest, environment,
    stochastic_mode, rng, seed, samples, jitter, interventions, constraints, assumptions, inputs_digest, validation_status, state, controls,
    operator_principal_id, correlation_id, twin_fitness, envelope_state, envelope_check, envelope_ack, challenge_id
  ) VALUES (
    p_run_id, 'DOMAIN', p_tenant, p_domain, p_twin_id, p_twin_version, v.branch_id, p_run_kind, p_control_run_id, p_corrects,
    p_scenario_id, p_scenario_branch_id, p_scenario_version, p_scenario_branch_state, v_flip, p_shock, p_shock_basis, p_component,
    v.known_at, v.observed_through, v_state, v_digest, p_model_ref, p_implementation_digest, p_environment_digest, p_environment,
    p_stochastic_mode, p_rng, p_seed, p_samples, p_jitter, p_interventions, p_constraints, p_assumptions, p_inputs_digest,
    p_validation_status || CASE WHEN v.verification_state = 'unverified' THEN '; twin version UNVERIFIED (a cited input was corrected)' ELSE '' END,
    'opened', v_controls, p_actor, p_correlation, v.fitness_state, v_envelope ->> 'state', v_envelope, v_ack, p_challenge_id);
  INSERT INTO simulation.run_events (event_id, scope, tenant_id, domain_id, run_id, event, actor_principal_id, details, correlation_id)
  VALUES (p_event_id, 'DOMAIN', p_tenant, p_domain, p_run_id, 'run.opened', p_actor,
          jsonb_build_object('twin_id', p_twin_id, 'twin_version', p_twin_version, 'run_kind', p_run_kind, 'control_run_id', p_control_run_id,
                             'initial_state_digest', v_digest, 'inputs_digest', p_inputs_digest, 'stochastic_mode', p_stochastic_mode,
                             'scenario_id', p_scenario_id, 'scenario_version', p_scenario_version, 'scenario_branch_id', p_scenario_branch_id,
                             'scenario_branch_state', p_scenario_branch_state, 'shock_basis', p_shock_basis,
                             'flip_recorded_at', b.flipped_at, 'flip_observed_at', v_flip_observed,
                             'twin_fitness', v.fitness_state, 'envelope_state', v_envelope ->> 'state', 'envelope_ack', v_ack, 'challenge_id', p_challenge_id), p_correlation);
  IF p_challenge_id IS NOT NULL THEN
    UPDATE simulation.challenges SET rerun_run_id = p_run_id WHERE challenge_id = p_challenge_id;
    INSERT INTO simulation.challenge_events (event_id, scope, tenant_id, domain_id, challenge_id, run_id, event, actor_principal_id, details, correlation_id)
    VALUES (gen_random_uuid(), 'DOMAIN', p_tenant, p_domain, p_challenge_id, ch.run_id, 'challenge.rerun_opened', p_actor, jsonb_build_object('rerun_run_id', p_run_id, 'corrects_run_id', p_corrects), p_correlation);
  END IF;
  RETURN jsonb_build_object('initial_state', v_state, 'initial_state_digest', v_digest, 'known_at', v.known_at, 'observed_through', v.observed_through,
                            'branch_id', v.branch_id, 'synthetic_state', v_synthetic, 'controls', v_controls, 'verification_state', v.verification_state,
                            'scenario_flip_event', v_flip, 'flip_observed_at', v_flip_observed,
                            'twin_fitness', v.fitness_state, 'envelope', v_envelope, 'envelope_ack', v_ack, 'challenge_id', p_challenge_id);
END $$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION simulation.open_run(uuid,uuid,uuid,uuid,int,text,uuid,uuid,uuid,uuid,int,text,boolean,text,text,text,text,text,jsonb,text,text,bigint,int,jsonb,jsonb,jsonb,jsonb,text,text,jsonb,jsonb,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION simulation.open_run(uuid,uuid,uuid,uuid,int,text,uuid,uuid,uuid,uuid,int,text,boolean,text,text,text,text,text,jsonb,text,text,bigint,int,jsonb,jsonb,jsonb,jsonb,text,text,jsonb,jsonb,uuid,uuid,uuid,uuid) TO eye_commit;

-- ============================================================
-- §1.C  THE CUSTODY LEDGER'S SIXTEENTH KIND (B21.2; AU-MEM-0067's vault clause, Class B): custody.retrieval_degraded — a retrieval that
--       was NOT ATTEMPTED because the PRIMARY blob root the tier ledger names could not be reached (its B18 marker .eye-vault-root
--       unreadable, vault.service.ts rootReachable), answered 200 metadata-only under observation.evidence.retrieve. The row's
--       digest_verified is NULL (0022:439 admits it; 0077 writes NULL for custody.tombstoned): the bytes were neither verified nor
--       refuted. A failure of an ATTEMPTED read keeps custody.integrity_failed (A7; digest_verified false). The fifteen kinds of
--       0076 §5 are copied verbatim. Untouched: custody_scope (0022:442), the append_only trigger (0022:446), the indexes,
--       observation.append_custody (0022:1336-1361 — its authority list already names observation.evidence.retrieve, the one
--       action that writes this kind). No port, no schema_registry row, no role, no PDP row.
-- ============================================================
ALTER TABLE observation.custody_events DROP CONSTRAINT custody_events_event_check;
ALTER TABLE observation.custody_events ADD CONSTRAINT custody_events_event_check CHECK (event IN (
  'custody.acquired', 'custody.quarantined', 'custody.verified', 'custody.candidate_verified', 'custody.admitted', 'custody.finalized',
  'custody.retrieved', 'custody.tombstoned', 'custody.integrity_failed', 'custody.archived', 'custody.exported', 'custody.restored', 'custody.delivered', 'custody.revocation_notified', 'custody.imported',
  'custody.retrieval_degraded'));
-- A degraded retrieval can never claim a verification: the kind carries NULL, not true and not false (the chain's reading of the row is
-- "unverified", distinct from integrity_failed's "refuted"). Named, additive, checked on insert only (the ledger is append-only).
ALTER TABLE observation.custody_events ADD CONSTRAINT custody_retrieval_degraded_unverified
  CHECK (event <> 'custody.retrieval_degraded' OR digest_verified IS NULL);
-- The closing assertion (the 0080 idiom): the re-declared constraint admits the kind and the named one exists.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname = 'custody_events_event_check'
                   AND c.conrelid = 'observation.custody_events'::regclass
                   AND pg_get_constraintdef(c.oid) LIKE '%custody.retrieval_degraded%') THEN
    RAISE EXCEPTION 'B21 §1.C: custody_events_event_check does not admit custody.retrieval_degraded';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname = 'custody_retrieval_degraded_unverified'
                   AND c.conrelid = 'observation.custody_events'::regclass) THEN
    RAISE EXCEPTION 'B21 §1.C: custody_retrieval_degraded_unverified is missing';
  END IF;
END $$;


-- ============================================================
-- §10 the interface register: the four foresight rows bound (the 0078 §4 idiom); the ten that stay partial: L1-I02, L1-I03, L1-I04, L2-I02, L3-I02, L4-I02, L7-I02, L10-I02, L10-I03, L10-I05
-- ============================================================
UPDATE objects.interface_register SET binding_state = 'bound', schema_version = 'v1', bound_at = clock_timestamp(), bound_in = '0081',
  bound_to = 'ValidateTwin@v1 from POST …/twins/:twinId/versions/:version/validate (twin.version.validate, human-gated → twin.validate_version): the person''s verdict fit | unfit | indeterminate over the ENVELOPE CHECK the port computes (twin.envelope_check: the version''s numeric elements against the behaviour model''s operating_envelope, by key; horizon_days a run parameter checked at open_run) and the CALIBRATION HISTORY (twin.reconciliations since the previous validation); the twin''s owner refused (separation of duties); fit refused outside the envelope; the state on twin_versions.fitness_state; ENFORCED by simulation.open_run — an unfit version opens no run, a run whose own contract lies outside the envelope is admitted only under a twin owner''s or the domain administrator''s acknowledgement (envelope_ack, recorded); no consumer — the version''s runs are named, never altered'
  WHERE interface_id = 'L5-I05';
UPDATE objects.interface_register SET binding_state = 'bound', schema_version = 'v1', bound_at = clock_timestamp(), bound_in = '0081',
  bound_to = 'ForecastFitnessChanged@v1 from prediction.assess_forecast_fitness under prediction.forecast_fitness_rule() v1 (the family''s last K = 10 outcomes: calibration_failure below the 0.75 coverage floor, drift above 1.5 × the applicable backtest''s pinball, data_shift from the attention mark, envelope_breach from the refresh cadence''s expiry; fewer than K → indeterminate, said) — assessed by the outcome write (prediction.outcome.record: the scored forecast and the issued forecasts of its family), by the forecast consumer beside its attention mark (prediction.forecast.subscription.apply) and by POST …/prediction/forecasts/:id/assess (prediction.forecast.assess); published when the state or the class moves; beside GraphChanged/forecast.fitness_changed (objects.forecasts) on a transition to unfit: the scenario consumer marks input_unverified and re-checks coherence, the decisions consumer notes the packages citing it with material_change (assessed unfit, not withdrawn — the owner decides), the twin consumer marks citing versions unverified; declare_scenario refuses an unfit forecast; the withdrawal (L6-I05) stays the owner''s act; no scheduler re-issues'
  WHERE interface_id = 'L6-I03';
UPDATE objects.interface_register SET binding_state = 'bound', schema_version = 'v1', bound_at = clock_timestamp(), bound_in = '0081',
  bound_to = 'ScenarioCoherenceFailed@v1 from prediction.check_scenario_coherence under prediction.scenario_coherence_rule() v1 (duplicate_branch, assumption_invalid — a basis naming a withdrawn, rejected, contradicted or superseded claim version —, forecast_relationship, temporal_order, dependency_retired; coverage and an unchecked free-text basis as notes) — run at the end of the declaring write (prediction.scenario.declare: a failed scenario is ADMITTED failed, never refused), before a continuation or a promotion in review (prediction.scenario.review: a failed scenario is not promoted), by the scenario consumer beside its mark (prediction.scenario.subscription.apply) and by POST …/prediction/scenarios/:id/check-coherence (prediction.scenario.check); published on a failed and changed check with routed_to the review roles; the state on scenarios_current.coherence_state; THE GATE: simulation.open_run refuses a branch of a failed scenario, prediction.raise_warning marks a warning on one input_unverified; no consumer — the accountable reviewer reads the scenarios page'
  WHERE interface_id = 'L7-I04';
UPDATE objects.interface_register SET binding_state = 'bound', schema_version = 'v1', bound_at = clock_timestamp(), bound_in = '0081',
  bound_to = 'ChallengeSimulation@v1 (one name, five states: opened | rerun_requested | upheld | dismissed | withdrawn) from POST …/twins/simulations/:runId/challenge (simulation.challenge.open → simulation.open_challenge: a typed dispute of assumptions, model, constraints or interpretation on a completed valid run; one live challenge per run per opener), …/simulations/:runId/challenges/:id/rerun (simulation.challenge.rerun → request_rerun: the re-run is an ordinary governed run naming correctsRunId and challengeId, bound by open_run and compared on the common control), …/simulations/:runId/challenges/:id/withdraw (the opener), …/simulations/:runId/challenges/:id/decide (simulation.challenge.decide, human-gated → decide_challenge: neither the opener nor the run''s operator decides; the three bound to the run — a challenge that is not the run''s is refused; UPHELD invalidates the run in the same write — simulation.invalidate_run with trigger challenge, SimulationInvalidated@v1 beside GraphChanged/simulation.invalidated, the run''s fitness unfit); the reviewer''s promotion (OBJ-29) POST …/twins/simulations/:runId/promote (simulation.result.promote, human-gated → promote_result: fit for a stated use with the validation, sensitivity and limitations restated; refused while a challenge is live; no outbox event — a work-object action outside the catalogue); no consumer of the challenge''s event'
  WHERE interface_id = 'L8-I04';
-- 0078:1092 assigned L10-I05's package-cause clause to B20; 0080 bound nothing of it (0080:1228-1233): the clause belongs to the attention-policy batch.
UPDATE objects.interface_register SET bound_to = replace(bound_to, '(L10-I05, B20)', '(L10-I05, B22)') WHERE interface_id = 'L9-I05' AND bound_to LIKE '%(L10-I05, B20)%';
DO $$
DECLARE v_bound int; v_partial int; v_unbound int; v_ok boolean; v_names text;
BEGIN
  SELECT count(*) FILTER (WHERE binding_state = 'bound'), count(*) FILTER (WHERE binding_state = 'partial'), count(*) FILTER (WHERE binding_state = 'unbound')
    INTO v_bound, v_partial, v_unbound FROM objects.interface_register;
  -- the ten that stay partial, compared as a SET (an ordered string would depend on the collation: 'L10-I02' sorts before 'L2-I02' everywhere)
  SELECT count(*) = 10 AND bool_and(interface_id = ANY (ARRAY['L1-I02','L1-I03','L1-I04','L2-I02','L3-I02','L4-I02','L7-I02','L10-I02','L10-I03','L10-I05']))
    INTO v_ok FROM objects.interface_register WHERE binding_state = 'partial';
  SELECT string_agg(interface_id, ',' ORDER BY layer, interface_id) INTO v_names FROM objects.interface_register WHERE binding_state = 'partial';
  IF (v_bound, v_partial, v_unbound) <> (40, 10, 0) OR v_ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'B21 (0081): the interface register reads %/%/% (bound/partial/unbound; partial: %); 40/10/0 with the ten named rows expected', v_bound, v_partial, v_unbound, v_names;
  END IF;
END $$;
