/**
 * Business-rule refusals from the observation ports, mapped to honest HTTP answers.
 *
 * WHY THIS EXISTS. Migration 0022's ports enforce the plan's rules in the
 * database: a contract with unconfirmed rights may not be activated, a registrar
 * may not approve their own registration, a quarantine release needs a reason and
 * a second operator, a transition must be one the state machine permits. Those
 * are DELIBERATE REFUSALS, and answering 500 to them would tell the operator the
 * system broke when in fact it worked — which is the difference between a product
 * that can be trusted and one whose errors are noise.
 *
 * The mapping is on the SQLSTATE the port raised and a small set of recognised
 * message shapes. Anything unrecognised keeps its existing 500 behaviour: a
 * mapper that guessed would eventually dress a real fault up as a rule.
 *
 * No database text is ever echoed to the caller. Each case carries a sentence
 * written here, in the product's own words.
 */
import { HttpException } from '@nestjs/common';
import { errorBody } from '@eye/contracts';

interface PgError {
  code?: string;
  message?: string;
}

/** The refusal classes the observation ports can raise, in the product's words. */
const RULES: Array<{
  match: RegExp;
  status: number;
  code: 'EYE_STA_002' | 'EYE_STA_001' | 'EYE_AUT_001' | 'EYE_REQ_001';
  message: string;
}> = [
  {
    match: /activation rejected: rights are .* and this contract acquires LIVE/i,
    status: 409,
    code: 'EYE_STA_002',
    message:
      'this source contract acquires LIVE and its reuse rights are not confirmed, so it cannot be activated. Confirm the rights, or register a replay contract — reading a frozen fixture set exercises no publisher’s reuse terms.',
  },
  {
    match: /activation rejected: rights have been withdrawn/i,
    status: 409,
    code: 'EYE_STA_002',
    message: 'this source contract cannot be activated: its reuse rights have been withdrawn.',
  },
  {
    match: /activation rejected: contract has no approver/i,
    status: 409,
    code: 'EYE_STA_002',
    message: 'this source contract cannot be activated: it has not been approved by a second operator.',
  },
  {
    match: /the registrar of a source contract may never approve it/i,
    status: 403,
    code: 'EYE_AUT_001',
    message:
      'the operator who registered a source contract may never approve it. Separation of duties is enforced on the acting principal, not on the interface.',
  },
  {
    match: /approval requires the collection_manager role/i,
    status: 403,
    code: 'EYE_AUT_001',
    message: 'approving a source contract requires the collection_manager role in this domain.',
  },
  {
    match: /review requires the collection_manager role/i,
    status: 403,
    code: 'EYE_AUT_001',
    message: 'releasing or discarding a quarantined item requires the collection_manager role in this domain.',
  },
  {
    match: /a release or rejection requires a recorded reason/i,
    status: 422,
    code: 'EYE_REQ_001',
    message: 'a quarantine release or rejection must carry a recorded reason.',
  },
  {
    match: /is not a permitted source-contract transition/i,
    status: 409,
    code: 'EYE_STA_002',
    message: 'that source-contract lifecycle transition is not permitted from the contract’s current state.',
  },
  {
    match: /only a draft can be approved/i,
    status: 409,
    code: 'EYE_STA_002',
    message: 'only a draft source contract can be approved.',
  },
  {
    match: /case is already/i,
    status: 409,
    code: 'EYE_STA_002',
    message: 'this quarantine case has already been closed.',
  },
  {
    match: /contract revalidation failed/i,
    status: 409,
    code: 'EYE_STA_002',
    message:
      'the source contract was not active at the moment of admission. Nothing was admitted, and the attempt is recorded.',
  },
  {
    match: /the local profile enforces a 60-second minimum polling interval/i,
    status: 422,
    code: 'EYE_REQ_001',
    message: 'the local profile enforces a 60-second minimum polling interval.',
  },
  {
    match: /agent registration rejected: the accountable owner must be an active human/i,
    status: 422,
    code: 'EYE_REQ_001',
    message: 'an agent’s accountable owner must be an active human principal.',
  },
  {
    match: /duplicate key value violates unique constraint "agent_instance_unique"/i,
    status: 409,
    code: 'EYE_STA_002',
    message:
      'an agent for this source, connector version and code digest is already registered. A new agent version is a new registration; the same one is not registered twice.',
  },
  {
    match: /duplicate key value violates unique constraint "src_key_unique"/i,
    status: 409,
    code: 'EYE_STA_002',
    message: 'a source contract with this key and version is already registered in this domain.',
  },
  {
    match: /duplicate key value violates unique constraint "src_one_active_version"/i,
    status: 409,
    code: 'EYE_STA_002',
    message: 'another version of this source contract is already active. Supersede it before activating this one.',
  },
  {
    match: /dimension .* is recorded not_applicable but the source contract does not approve/i,
    status: 422,
    code: 'EYE_REQ_001',
    message:
      'a coverage dimension may only be recorded not_applicable when the source contract declares that exemption and its reason.',
  },
  {
    match: /no such source contract version|no such case|no such agent|no such manifest/i,
    status: 404,
    code: 'EYE_STA_001',
    message: 'no authorized record matches.',
  },
];

/*
 * PHASE 2. The intelligence ports raise refusals of exactly the same kind — a
 * registrar approving their own method, a decision without a reason, an agent
 * deciding its own output, a state machine transition that is not reachable — and
 * they deserve the same honest answers rather than a 500. They are listed here,
 * beside the Phase 1 rules, because they are the same mechanism: a SQLSTATE the
 * governed port chose, mapped to a sentence written in the product's own words.
 */
const INTELLIGENCE_RULES: typeof RULES = [
  {
    match: /method approval rejected: the registrar may not approve their own method/i,
    status: 403,
    code: 'EYE_AUT_001',
    message:
      'the operator who registered this extraction method may not approve it. Approval is a second person’s judgement about a model, a prompt and a set of thresholds — one person doing both is not review.',
  },
  {
    match: /method approval rejected: method is (\w+), not draft/i,
    status: 409,
    code: 'EYE_STA_002',
    message: 'this extraction method is no longer a draft, so it cannot be approved again.',
  },
  {
    match: /method transition rejected: .* cannot become active/i,
    status: 409,
    code: 'EYE_STA_002',
    message:
      'this extraction method cannot become active from the state it is in. A method is approved before it is activated, and an active method is already active.',
  },
  {
    match: /method transition rejected: .* is not a reachable state/i,
    status: 400,
    code: 'EYE_REQ_001',
    message: 'that is not a state an extraction method can be moved to.',
  },
  {
    match: /method (approval|transition) rejected: no such method/i,
    status: 404,
    code: 'EYE_STA_001',
    message: 'no authorized extraction method matches this identifier.',
  },
  {
    match: /extraction rejected: method is (\w+), not active/i,
    status: 409,
    code: 'EYE_STA_002',
    message:
      'this extraction method is not active, so it cannot run. A method is registered, approved by a second person and activated before it reads any evidence.',
  },
  {
    match: /extraction rejected: no such method/i,
    status: 404,
    code: 'EYE_STA_001',
    message: 'no authorized extraction method matches this identifier.',
  },
  {
    match: /review decision rejected: a decision needs a reason/i,
    status: 400,
    code: 'EYE_REQ_001',
    message:
      'a review decision needs a written reason. The reason is the record of why a person accepted, corrected or rejected what the model produced.',
  },
  {
    match: /review decision rejected: the agent that produced this output may not decide it/i,
    status: 403,
    code: 'EYE_AUT_001',
    message:
      'the extraction agent that produced this output may not decide its review. An agent clearing its own low-confidence work would make the queue decorative.',
  },
  {
    match: /review decision rejected: case is already (\w+)/i,
    status: 409,
    code: 'EYE_STA_002',
    message: 'this review case has already been decided. A reviewer’s judgement is a record, not a toggle.',
  },
  {
    match: /review decision rejected: .* is not a decision/i,
    status: 400,
    code: 'EYE_REQ_001',
    message: "a review decision must be 'approved', 'corrected' or 'rejected'.",
  },
  {
    match: /review decision rejected: no such case/i,
    status: 404,
    code: 'EYE_STA_001',
    message: 'no authorized review case matches this identifier.',
  },
];

/**
 * Translate a port refusal into its governed answer, or return null when the
 * error is not a recognised rule — in which case the caller must let it surface
 * as the internal failure it is.
 */
/*
 * PHASE 5. The twin and simulation ports refuse in the same way: a second draft on
 * a branch that already holds one, grounding into an admitted version, admitting a
 * version whose required inputs are missing, an intervention run naming an
 * incompatible control. Each is the port doing its job, and each is answered as
 * what it is — a conflict with the record, a bad request, or an absent object —
 * never as a crash. The sentences below are the product's, not the port's: the
 * port's exact text stays server-side.
 */
const TWIN_RULES: typeof RULES = [
  {
    match: /version rejected: branch .* already has an open draft/i,
    status: 409,
    code: 'EYE_STA_002',
    message: 'this branch already has an open draft: ground into it or admit it before opening another version.',
  },
  {
    match: /version rejected: (fork|carry-from) source .* is not an admitted version/i,
    status: 409,
    code: 'EYE_STA_002',
    message: 'a version can only fork from, or carry forward, an ADMITTED version of the same twin.',
  },
  {
    match: /version rejected: no such twin/i,
    status: 404,
    code: 'EYE_STA_001',
    message: 'no authorized twin matches.',
  },
  {
    match: /twin rejected: /i,
    status: 422,
    code: 'EYE_REQ_001',
    message: 'a twin needs a boundary of resolved graph entities and a named, active owner in this tenant.',
  },
  {
    match: /grounding rejected: version .* is not (an open )?draft/i,
    status: 409,
    code: 'EYE_STA_002',
    message: 'an admitted version is immutable: open a new version to change it.',
  },
  {
    match: /grounding rejected: .* (names no truth state|carries no validation state)/i,
    status: 422,
    code: 'EYE_REQ_001',
    message: 'a claim-derived element carries the claim\'s truth state, and a predicted element carries its forecast\'s validation state; neither may be absent.',
  },
  {
    match: /grounding rejected: .* substantiated by nothing but an entity/i,
    status: 422,
    code: 'EYE_REQ_001',
    message: 'a material element must cite evidence, a claim, a forecast, an assumption or a run; an entity names a subject and substantiates no value.',
  },
  {
    match: /grounding rejected: /i,
    status: 422,
    code: 'EYE_REQ_001',
    message: 'every citation must bind an exact object: a kind, an id, a version and a digest.',
  },
  {
    match: /admission rejected: required inputs are missing, unreadable or stale/i,
    status: 409,
    code: 'EYE_STA_002',
    message: 'this version is incomplete: required inputs of its behaviour model are missing, unreadable or stale. Ground them, or admit it explicitly as incomplete.',
  },
  {
    match: /admission rejected: the state set changed/i,
    status: 409,
    code: 'EYE_STA_002',
    message: 'the state set changed while it was being admitted; digest it again.',
  },
  {
    match: /admission rejected: /i,
    status: 409,
    code: 'EYE_STA_002',
    message: 'only an open draft of this twin can be admitted.',
  },
  {
    match: /run rejected: control run .* is not compatible/i,
    status: 409,
    code: 'EYE_STA_002',
    message: 'the control run named is not comparable with this intervention: it must share the twin version, initial state, implementation, assumptions, constraints, shock and component.',
  },
  {
    match: /run rejected: (control run .* is not (completed|an authorized run)|.* is not a control run)/i,
    status: 409,
    code: 'EYE_STA_002',
    message: 'an intervention run must reference a COMPLETED control run of this domain.',
  },
  {
    match: /run rejected: version /i,
    status: 404,
    code: 'EYE_STA_001',
    message: 'no authorized admitted twin version matches.',
  },
  {
    match: /run rejected: twin version .* has no world-time cut-off/i,
    status: 409,
    code: 'EYE_STA_002',
    message: 'this twin version names no world-time cut-off (observed_through); a run reads the twin under two cut-offs and cannot use it.',
  },
  {
    match: /run rejected: required inputs for component .* are no longer available/i,
    status: 409,
    code: 'EYE_STA_002',
    message: 'a required input of this twin version rests on a document that is no longer available — withdrawn, deleted, or not readable by this reader. A run establishes that now; the version\'s stored health says only what was true when it was grounded.',
  },
  {
    match: /run rejected: (scenario .* (was recorded after|stood at version)|branch .* was .* (at|under) this)/i,
    status: 422,
    code: 'EYE_REQ_001',
    message: 'the scenario binding is later information than this run\'s cut-offs: a tree admitted after the twin version\'s known_at, a flip recorded after it, or a flip resting on an observation after the version\'s observed_through, was not known to this run and gives its shock no basis. A shock the operator asserts without a scenario is a hypothetical, and says so.',
  },
  {
    match: /run rejected: inputs for component .* are not usable/i,
    status: 409,
    code: 'EYE_STA_002',
    message: 'a required input for the selected component is missing, stale or unreadable in this twin version; a healthy input of another component does not stand in for it.',
  },
  {
    match: /run rejected: scenario .* is not an authorized scenario|run rejected: scenario .* has no authorized/i,
    status: 404,
    code: 'EYE_STA_001',
    message: 'no authorized scenario matches.',
  },
  {
    match: /run rejected: (branch .* is not a branch of|branch .* is .* now|the shock contradicts|a scenario branch was named without|the shock basis offered|scenario .* is at version)/i,
    status: 422,
    code: 'EYE_REQ_001',
    message: 'the scenario binding is not what the authorized tree establishes: the branch must belong to the scenario, the shock must follow the branch\'s state (flipped), and a shock with no scenario is a hypothetical.',
  },
  {
    match: /reconciliation rejected: (units differ|different targets|the observation cites evidence recorded|version .* is a draft)/i,
    status: 422,
    code: 'EYE_REQ_001',
    message: 'a reconciliation compares admitted state in the same unit for the same target against an observation recorded AFTER the simulated or predicted value was established.',
  },
  {
    // 0046: the executive agent-run port's refusals (an agent runs under its own session, for its own kind's tasks) — not the twin run's.
    match: /run rejected: (no active agent|a run is opened by the agent itself|a \w+ agent does not run the task|task is draft, briefing, report or monitor)/i,
    status: 403,
    code: 'EYE_AUT_001',
    message: 'the agent run was refused: the agent is not an active agent of this domain, is not running under its own session, or does not run this task (a decision agent drafts; a briefing agent briefs and monitors; a reporting agent reports).',
  },
  {
    // 0066 §8: a retired scenario's branch is not simulated — a state of the record, said in the port's words.
    match: /run rejected: scenario .* was retired by review/i,
    status: 409,
    code: 'EYE_STA_002',
    message: 'the scenario was retired by review; a retired branch is not simulated — declare a successor scenario and bind the run to it.',
  },
  {
    match: /run rejected: /i,
    status: 422,
    code: 'EYE_REQ_001',
    message: 'a run needs an admitted twin version, a registered behaviour model whose implementation digest matches, and — for a control — no intervention and no control reference.',
  },
  {
    match: /completion rejected: run .* is already/i,
    status: 409,
    code: 'EYE_STA_002',
    message: 'this run has already finished; a run completes or fails exactly once.',
  },
  {
    match: /completion rejected: no such run|no opened run|reproduction rejected: run|unverify rejected: version|impact rejected: no such invalidation|reconciliation rejected: no element/i,
    status: 404,
    code: 'EYE_STA_001',
    message: 'no authorized record matches.',
  },
  {
    match: /reconciliation rejected: /i,
    status: 422,
    code: 'EYE_REQ_001',
    message: 'a reconciliation compares one element across two admitted versions of the same twin.',
  },
  {
    match: /is admitted and immutable|append-only: DELETE prohibited|the experiment contract of run .* is immutable/i,
    status: 409,
    code: 'EYE_STA_002',
    message: 'admitted twin versions and simulation runs are immutable and append-only; only a verification state may change, by event.',
  },
];

/**
 * B9 (0066): the refusals of the memory, retention, contradiction, evaluation, ontology, scenario-review and
 * executive-request ports, and the legal-hold refusal of the tombstone port; B11 (0070) adds the archive port, the export
 * package ports and the export's rights re-check at execution; B13 (0073) the schedule's retirement, the export signing
 * keys, the destinations and the deliveries (`retention delivery rejected`, `export signing key rejected`, `export
 * destination rejected`, and the schedule's own 404/409 forms); B16 (0076) the exchange partner and the governed import
 * (`exchange partner rejected`, `retention import rejected`, and the class-suffixed `retention import rejected
 * (dependency|ontology|identifier|contract_changed|duplicate)` — a class-suffixed text never starts with a phrase the
 * absence rule matches, so an unknown class lands as the caller's own request); B17 (0077) the import's revocation
 * and the importer notice (the revocation ports' `retention import rejected` texts — the item's state, the origin's
 * record, the notice's binding — the notice ports' `import … holds no admitted copy` / `attempt … is not the next`,
 * the withdrawal lineage's class-suffixed absences, and the review gate on an imported claim); B18 (0078) the three
 * lifecycle families — `forecast withdrawal rejected`, `run invalidation rejected`, `reopen rejected` (the standing, the
 * absent forecast/run/package/note/breach/reproduction, the record's state, the caller's request) — the second commitment
 * over a standing one (`commitment rejected: package is already committed at version …`), a withdrawal over a standing
 * commitment (`withdrawal rejected: package … was committed at version …` — the record's state, placed in the 409
 * alternation so the executive's `withdrawal rejected` 422 family does not catch it), and a scenario declared on a withdrawn
 * forecast (`scenario rejected: forecast … was withdrawn`); B19 (0079) the derivation's port texts (`memory item rejected: …` —
 * the block's shape, the statement digest, the kind class of an item (`a derived record is superseded by a re-derivation` — the
 * record's state, in the 409 alternation), the basis withdrawal's arguments) and the mark port `memory.mark_basis_withdrawn`;
 * the derive service's own refusals (404 / 409 / 422 — the basis, the review case, the evidence, the kind rule) are thrown as
 * HttpExceptions and never reach this mapper; B20 (0080) the projection partitions' two ports (`projection withdrawal
 * rejected` / `projection rebuild rejected` — the standing, a name that is not a projection, the rebuild of a SERVING
 * partition (the record's state, in the 409 alternation before the family's 422), the reason and the subscriber's missing
 * check id) and the deletion pause `retention execution rejected (projection_withdrawn)` (the record's state — the class
 * suffix keeps it out of the 403/404 rows; placed in the 409 alternation before the retention 422 family); the route's own
 * 404 for a name outside the six is an HttpException; B21 (0081; C1) the five foresight families — `twin validation
 * rejected`, `forecast assessment rejected`, `coherence check rejected`, `simulation challenge rejected`, `run promotion
 * rejected` (never `challenge rejected`, B9's review challenge) — answered with the port's text through these rows (the standing
 * 403, the absences 404, the record's state 409 — a draft version, a withdrawn or superseded forecast, a retired scenario, a
 * run not completed or invalidated, a challenge not live, a promoted or disputed run, a forecast assessed unfit, the failed
 * coherence check that prohibits promotion — before the families' 422), the upheld-challenge reference of `run invalidation
 * rejected` (404) and its widened context and trigger texts (403 / 422, the B18 rows unchanged), and the FIVE RUN GATES of
 * `simulation.open_run`, which carry a CLASS IN PARENTHESES — `run rejected (unfit_twin|incoherent_scenario|envelope|
 * envelope_ack|challenge): …` — because the named generic `run rejected: ` row above (a fixed sentence, 422) needs the
 * colon+space and would otherwise catch them: the class form (the product's own precedent — `projection_withdrawn`,
 * `stale_authority`) lets B9's ORDER decide with the PORT'S sentence — `envelope_ack` 403, `(challenge): no such` 404,
 * `(unfit_twin)`/`(incoherent_scenario)`/`(challenge): … is not awaiting a re-run` 409, `(envelope)` and `(challenge): …
 * disputes run …` 422 — and NO named row is added (the 422 row's `\((envelope|challenge)\)` needs the closing parenthesis
 * right after the class, so `envelope_ack` never lands there). These ports write their reason for a
 * person (the harness asserts the texts), so the reason is answered as the message; the status says what kind of
 * refusal it is — the caller's own request (422), no such object (404), the caller's standing (403), the record's
 * state (409). Matched after the named rules above, before the generic conflict fallback — in the order 403 → 404 →
 * 409 → 422, so a new refusal is never phrased so that an earlier rule catches it.
 */
const B9_REFUSALS: Array<{ match: RegExp; status: number; code: 'EYE_STA_002' | 'EYE_STA_001' | 'EYE_AUT_001' | 'EYE_REQ_001' }> = [
  // B22 (0083): the attention policy and the queue (`attention policy rejected`, `attention item rejected`), the plan selection and
  // the source-impact ports — first, in the same 403 → 404 → 409 → 422 order; no earlier family starts with these phrases.
  { match: /^attention (policy|item) rejected: (set|acknowledged|suppressed|closed) by the acting principal|^attention policy rejected: a policy is set by a named human|^attention item rejected: item .* is routed to/i, status: 403, code: 'EYE_AUT_001' },
  { match: /^attention item rejected: no such item|^plan selection rejected: evidence .* is not a record of this domain|^reopen rejected: no such policy note/i, status: 404, code: 'EYE_STA_001' },
  { match: /^attention policy rejected: the rules are unchanged|^attention item rejected: (item .* is (already closed|.*; only)|policy version .* does not allow suppressing)/i, status: 409, code: 'EYE_STA_002' },
  { match: /^attention (policy|item) rejected|^plan selection rejected|^source impact rejected/i, status: 422, code: 'EYE_REQ_001' },
  /* B23 (0084) branch */
  // L7-I02 BranchScenario (`branch rejected …`, prediction.branch_scenario and 0061's add_branch) and the opening port's new gate
  // `run rejected (branch_added_later)` (the class form: the generic `run rejected: ` row needs the colon) — before every older family, in
  // the 403 → 404 → 409 → 422 order; no earlier row matches these anchored phrases.
  { match: /^branch rejected: recorded by the acting principal/i, status: 403, code: 'EYE_AUT_001' },
  { match: /^branch rejected: (no such scenario|no active scenario|no such indicator)/i, status: 404, code: 'EYE_STA_001' },
  { match: /^branch rejected \((stale_version|idempotency_conflict|duplicate)\)|^branch rejected: scenario .* is \w+; only an active scenario/i, status: 409, code: 'EYE_STA_002' },
  { match: /^branch rejected|^run rejected \(branch_added_later\)/i, status: 422, code: 'EYE_REQ_001' },
  /* end B23 branch */
  /* B23 (0084) context */
  // L3-I02: the context query's port (memory.retrieve_context) refuses only the caller's own request — an empty purpose, a malformed
  // subject, a scan bound or a partition name out of range (22023 → 422, the port's text as the message); no earlier row starts with it.
  { match: /^memory context rejected: /i, status: 422, code: 'EYE_REQ_001' },
  /* end B23 context */
  /* B23 (0084) revision */
  // B23 (0084, L4-I02): the change-set commit (`graph revision rejected`) — its own family, placed before the older ones in the same
  // 403 → 404 → 409 → 422 order: the standing; a referenced entity, claim, evidence, identifier system or ontology version absent
  // (`(dependency)`); the record's state — the head moved (`(conflict)`), the key used for another change set, a claim withdrawn or not
  // decided in review (`(claim_state)`), an entity not active (`(entity_state)`), an identifier held by another entity (`(identifier)`);
  // everything else the caller's change set (422). No earlier row matches `graph revision rejected`.
  { match: /^graph revision rejected: recorded by the acting principal/i, status: 403, code: 'EYE_AUT_001' },
  { match: /^graph revision rejected \(dependency\)/i, status: 404, code: 'EYE_STA_001' },
  { match: /^graph revision rejected \((conflict|claim_state|entity_state|identifier)\)|^graph revision rejected: idempotency key .* was already used for a different change set/i, status: 409, code: 'EYE_STA_002' },
  { match: /^graph revision rejected/i, status: 422, code: 'EYE_REQ_001' },
  /* end B23 revision */
  // standing
  { match: /^(request|fulfilment|withdrawal|completion) rejected: recorded by the (acting|requesting) principal|^withdrawal rejected: a request is withdrawn by its requester|^completion rejected: a follow-up is completed by its owner|^request rejected \(stale_authority\)|^retention (approval|execution) rejected: (the opener of an action|the approver is the acting|an approver of the action)|^the proposer of an ontology change does not decide it|^archive rejected: recorded by the acting principal|^archive refused: no executing archive action|^export rejected: (recorded by the acting principal|approval .* is not a live approval)|^retention revocation rejected: recorded by the acting principal|^(retention delivery|retention notice|export signing key|export destination|retention schedule) rejected: recorded by the acting principal|^retention import rejected: (recorded by the acting principal|the opener of an import|the approver of an import|no policy decision)|^exchange partner rejected: recorded by the acting principal|^(forecast withdrawal|run invalidation|reopen) rejected: recorded by the acting principal|^reopen rejected: the package owner reopens it|^run invalidation rejected: a reproduction invalidates under|^projection (withdrawal|rebuild) rejected: recorded by the acting principal|^(twin validation|forecast assessment|coherence check|simulation challenge|run promotion) rejected: recorded by the acting principal|^twin validation rejected: the twin's owner does not validate|^simulation challenge rejected: (the decider is the challenge's opener|the decider operated the challenged run|a challenge is withdrawn by its opener)|^run promotion rejected: the reviewer operated run|^run rejected \(envelope_ack\)/i, status: 403, code: 'EYE_AUT_001' },
  // absence
  { match: /^(request|fulfilment|withdrawal|completion) rejected: no (request|follow-up) .* in this domain|^request rejected \(stale_context\): .* is not (a package|a room|a warning|a recorded object)|^request rejected: delegate .* is not an active principal|^no (scenario|ontology proposal) .* in this domain|^branch .* is not a branch of scenario|^retention (action|approval|execution|verification) rejected: .* is not an (action of this domain|evidence action)|^retention action rejected: .* is not open in this domain|^memory item rejected: .* is not recorded|^challenge rejected: no claim|^evaluation rejected: no such method|^tombstone rejected: no such manifest|^contradiction .* is not open in this domain|^archive rejected: no such evidence manifest|^retention revocation rejected: .* has no export package|^retention schedule rejected: .* is not a schedule of this domain|^retention delivery rejected: (.* has no export package|no such destination|no such delivery)|^retention notice rejected: (.* has no export package|no such destination|no such notice|no such import)|^export (signing key|destination) rejected: no such|^retention import rejected: (no such (import|partner|item|manifest)|edge .* is not an edge|entity .* is not an entity)|^retention import rejected \((dependency|identifier)\): (both ends|claim .* is not admitted|no identifier system|claim .* is not a withdrawn version|claim .* has no lineage row to carry)|^exchange partner rejected: no such|^forecast withdrawal rejected: no such forecast|^run invalidation rejected: (no such run|.* is not an unreproducible reproduction)|^reopen rejected: (no such package|no such (note|breach))|^projection (withdrawal|rebuild) rejected: .* is not a projection of this domain|^(twin validation|forecast assessment|coherence check|simulation challenge|run promotion) rejected: no such (twin|version|forecast|scenario|run|challenge)|^run rejected \(challenge\): no such challenge|^run invalidation rejected: .* is not an upheld challenge of run/i, status: 404, code: 'EYE_STA_001' },
  // the record's state
  { match: /^request rejected \(stale_(version|approval)\)|^request rejected: request key .* different request|^request rejected \(stale_context\): warning .* is .*, not open|^request rejected: warning .* is already suppressed|^fulfilment rejected: request .* is .*, not routed|^withdrawal rejected: (request .* is already|request .* was fulfilled by|the follow-up of request .* was completed)|^completion rejected: follow-up .* is |^retention (approval|execution|verification|withdrawal) rejected: .* (is .* — only|is not executing|is not withdrawable)|^retention execution rejected: no live approval|^retention approval rejected: the digest approved|^retention action rejected: .* is .*, its scope is not resolved again|^proposal refused: a breaking change|^proposal .* is .*, not open|^a proposal is already open for this namespace|^scenario .* is retired; a retired scenario is not reviewed again|^branch .* is closed; a closed branch is not promoted|^memory item rejected: .* is (already recorded|.*; a withdrawn item)|^memory item rejected: (the next version of|a later version is recorded under|version 1 is recorded under|a derived record is superseded by a re-derivation)|^challenge rejected: claim .* (is already queued|has no lineage|is imported)|^an adjudicated contradiction is not changed|^extraction rejected: method version is unfit|^method transition rejected: the version is unfit|^tombstone refused: manifest .* is under a legal hold|^floor declaration rejected: (no executing|.* must lie above the floor|partition .* has no row)|^run rejected: scenario .* was retired by review|^archive refused: (manifest .* is tombstoned|the digest verified on the archive copy)|^export rejected: .* is not an executing customer export|^retention revocation rejected: the package of .* was revoked at|^retention execution rejected \((rights_changed|scope_changed|references_changed)\)|^retention schedule rejected: .* is retired|^export signing key rejected: .* is (retired|already declared)|^export destination rejected: .* is retired|^retention delivery rejected: (.* was revoked at|.* expired at|.* is .*, not verified|.* is retired|.* is not delivered|the package carries no key-based signature|the receipt names delivery)|^retention delivery rejected \(rights_changed\)|^retention notice rejected: (the package of .* is not revoked|.* never received the package|.* is not notified|the receipt names notice|the destination's kind|import .* holds no admitted copy|attempt .* is not the next attempt)|^retention import rejected: (import .* is .*, not|the digest approved|.* item\(s\) of import .* are still (staged|pending)|the origin (package of import|of import)|the revocation notice|item .* of import .* (is .*, not admitted|was revoked at|is reused))|^retention import rejected \((duplicate|contract_changed|ontology|identifier)\)|^exchange partner rejected: (.* is retired|.* is already declared|key .* is already declared)|^forecast withdrawal rejected: forecast .* is (withdrawn|superseded|.*, not issued)|^run invalidation rejected: run .* (is already invalidated|is .*, not completed|was invalidated at)|^reopen rejected: (package .* is (reopened|closed|.*, not committed)|the package already has an open draft|no recorded cause)|^commitment rejected: package is already committed at version .* and the commitment stands|^withdrawal rejected: package .* was committed at version|^scenario rejected: forecast .* was withdrawn|^projection rebuild rejected: the .* partition of this domain is serving|^retention execution rejected \(projection_withdrawn\)|^twin validation rejected: version .* is a draft|^forecast assessment rejected: forecast .* is (withdrawn|superseded)|^coherence check rejected: scenario .* is retired|^simulation challenge rejected: (run .* is .*, not completed|run .* is invalidated|challenge .* (of run .* by this opener is live|is .*, not open|is .*; only a live challenge))|^run promotion rejected: (run .* is .*, not completed|run .* is invalidated|run .* was promoted already|challenge .* of run .* is .* — a disputed result)|^scenario rejected: forecast .* was assessed unfit|^a failed coherence check prohibits promotion|^run rejected \((unfit_twin|incoherent_scenario)\)|^run rejected \(challenge\): challenge .* is not awaiting a re-run/i, status: 409, code: 'EYE_STA_002' },
  // the caller's own request
  { match: /^(request|fulfilment|withdrawal|completion) rejected|^retention (action|approval|execution|verification|withdrawal|schedule) rejected|^floor declaration rejected|^memory (item|retrieval) rejected|^challenge rejected|^evaluation rejected|^(a|an) (review outcome|review states|dissent states|challenge states|decision is|decision states|contradiction links|adjudication is|adjudication states|evaluation states|proposal states|ontology version lists|reassessment names|reassessment states)|^promotion to simulation names the branch|^every predicate names itself|^warning rejected: a warning raised since 0061|^archive (rejected|refused)|^export rejected|^retention revocation rejected|^retention delivery rejected|^retention notice rejected|^export signing key rejected|^export destination rejected|^retention import rejected|^exchange partner rejected|^forecast withdrawal rejected|^run invalidation rejected|^reopen rejected|^projection (withdrawal|rebuild) rejected|^(twin validation|forecast assessment|coherence check|simulation challenge|run promotion) rejected|^run rejected \((envelope|challenge)\)/i, status: 422, code: 'EYE_REQ_001' },
  /* B23 (0084) attention: the governed review's ports (`review convening rejected`, `review closure rejected` — anchored, a phrase no
     earlier row matches) in B9's order: the standing 403, the absences 404, the record's state 409 (a key reused for a different
     review, a stale subject version, a review already closed), the caller's own request 422. */
  { match: /^review convening rejected: (convened by the acting principal|a review is convened by a named human)|^review closure rejected: (closed by the acting principal|a review is (concluded by its chair|withdrawn by its convener))/i, status: 403, code: 'EYE_AUT_001' },
  { match: /^review (convening|closure) rejected: no such /i, status: 404, code: 'EYE_STA_001' },
  { match: /^review convening rejected: convene key .* was already used by this convener for a different review|^review convening rejected \(stale_version\)|^review closure rejected: review .* is (concluded|withdrawn); only a convened review/i, status: 409, code: 'EYE_STA_002' },
  { match: /^review (convening|closure) rejected/i, status: 422, code: 'EYE_REQ_001' },
  /* end B23 attention */
  /* B23 (0084) stream — the stream ports' `acquisition stream rejected …` texts, anchored; no row above starts with this phrase.
     The absence 404; the record's state 409 (a closed or not-resumable stream, another contract version or range, a stream not
     driven by the run, a segment out of order, an interrupt of an interrupted stream, the digest conflict of a redelivery that
     is not one — 23505); the caller's own request 422 (the partition, the credit, the range, the cursor, the reason). Appended
     after the families' rows: none of them matches this phrase, so the order that matters is among these three — 404 → 409 → 422. */
  { match: /^acquisition stream rejected: no such stream|^acquisition stream rejected: no source contract/i, status: 404, code: 'EYE_STA_001' },
  { match: /^acquisition stream rejected \((not_resumable|stale_contract|range_mismatch|not_running|out_of_order|not_interruptible|digest_conflict)\)/i, status: 409, code: 'EYE_STA_002' },
  { match: /^acquisition stream rejected/i, status: 422, code: 'EYE_REQ_001' },
  /* end B23 stream */
  /* B24 (0086) markers — F-P6-07: the two GATES carry a CLASS IN PARENTHESES, the B21 run-gate convention (`run rejected (class): …`,
     which the named generic `run rejected: ` row — a fixed sentence, 422 — cannot catch) and the commitment family's class form
     (`commitment rejected (source_impact): …` — B18's 409 text `commitment rejected: package is already committed …` needs the colon):
     both are the RECORD'S STATE (an active marker on what the run or the version rests on), 409, the port's sentence as the message.
     The acknowledgement port's `source impact acknowledgement rejected …` (never B22's `source impact rejected`, which the 422 row above
     anchors on its own phrase): the standing 403 (the acting principal, a named human, decision_authority); the absences 404 (the
     package, the version, `(unknown_marker)`); the record's state 409 (`(version_state)`, `(cleared)`); the caller's own request 422
     (the reason, the list, `(not_bearing)`). Appended after every family: no row above matches these anchored phrases. */
  { match: /^commitment rejected \(source_impact\)|^run rejected \(source_impact\)/i, status: 409, code: 'EYE_STA_002' },
  { match: /^source impact acknowledgement rejected: (recorded by the acting principal|a named, active human|principal .* does not hold decision_authority)/i, status: 403, code: 'EYE_AUT_001' },
  { match: /^source impact acknowledgement rejected: no such (package|version)|^source impact acknowledgement rejected \(unknown_marker\)/i, status: 404, code: 'EYE_STA_001' },
  { match: /^source impact acknowledgement rejected \((version_state|cleared)\)/i, status: 409, code: 'EYE_STA_002' },
  { match: /^source impact acknowledgement rejected/i, status: 422, code: 'EYE_REQ_001' },
  /* end B24 markers */
  /* B24 (0086) plan — the extraction agent's registry (`extraction agent rejected`, `extraction agent revocation rejected`) and the plan
     worker's ledger ports (`plan execution rejected`), anchored; no row above starts with these phrases, and none of the texts carries an
     unanchored earlier phrase (`no such agent`, `case is already`, `run rejected: `). The standing 403; the absences 404; the record's
     state 409 (a second active agent, a principal registered before, an execution not running); the caller's own request 422. */
  { match: /^extraction agent (revocation )?rejected: recorded by the acting principal/i, status: 403, code: 'EYE_AUT_001' },
  { match: /^extraction agent revocation rejected: .* is not an active extraction agent of this domain|^plan execution rejected: (agent .* is not registered in this domain|execution .* is not an execution of this domain)/i, status: 404, code: 'EYE_STA_001' },
  { match: /^extraction agent rejected: (this domain already has an active extraction agent|principal .* was already registered)|^plan execution rejected: execution .* is \w+, not running/i, status: 409, code: 'EYE_STA_002' },
  { match: /^extraction agent (revocation )?rejected|^plan execution rejected/i, status: 422, code: 'EYE_REQ_001' },
  /* end B24 plan */
  /* B24 (0086) timer — the tick's and the delivery port's texts (`attention tick rejected …`, `attention delivery rejected …`), anchored; no
     row above starts with either phrase (the B22 rows read `^attention (policy|item) rejected`). In B9's order: the standing 403 (a tick
     not run by the domain's active attention agent under its own session), the absences 404, the record's state 409 (an attempt of a
     delivery that is no longer queued), the caller's own request 422. */
  { match: /^attention tick rejected: the tick is run by an active attention agent/i, status: 403, code: 'EYE_AUT_001' },
  { match: /^attention (tick|delivery) rejected: no such (agent|delivery)/i, status: 404, code: 'EYE_STA_001' },
  { match: /^attention delivery rejected \(not_queued\)/i, status: 409, code: 'EYE_STA_002' },
  { match: /^attention (tick|delivery) rejected/i, status: 422, code: 'EYE_REQ_001' },
  /* end B24 timer */
  /* B24 (0086) materiality — the rebalance port's `attention rebalance rejected …` texts, anchored (no row above starts with this phrase;
     the B22 rows read `attention (policy|item) rejected`): the standing 403, anything else the caller's own request 422. */
  { match: /^attention rebalance rejected: rebalanced by the acting principal/i, status: 403, code: 'EYE_AUT_001' },
  { match: /^attention rebalance rejected/i, status: 422, code: 'EYE_REQ_001' },
  /* end B24 materiality */
  /* B24 (0086) governance — the queue's governance ports (0086 §G): `attention suppression rejected`, `attention delegation rejected`,
     `attention disposition rejected`, `attention queue evaluation rejected` — anchored phrases no earlier row matches (B22's rows read
     `^attention (policy|item) rejected`; no unanchored earlier rule matches their texts). B9's order: the standing 403 (the acting principal,
     the separation of duties, the approver roles, who may delegate / end / record, the evaluator's roles), the absences 404, the record's
     state 409 (a request not pending, lapsed, a second pending request, an item no longer live, a version that no longer allows suppressing,
     a key reused for a different delegation, a delegation already standing or already ended, `missed` on an item judged material), the
     caller's own request 422. */
  { match: /^attention (suppression|delegation|disposition|queue evaluation) rejected: (decided|recorded|ended) by the acting principal|^attention suppression rejected: (the requester does not decide their own request|the decider holds none of the approver roles)|^attention (delegation|disposition) rejected: item .* is routed to|^attention delegation rejected: a delegation is ended by its delegator|^attention queue evaluation rejected: the queue is evaluated by a named human/i, status: 403, code: 'EYE_AUT_001' },
  { match: /^attention (suppression|delegation|disposition) rejected: no such (suppression request|item|delegation) in this domain/i, status: 404, code: 'EYE_STA_001' },
  { match: /^attention suppression rejected: (request .* is \w+; only a pending request|request .* lapsed at|item .* already has a pending suppression request|item .* is \w+; only a live item|policy version .* no longer allows)|^attention delegation rejected: (request key .* was already used by this principal for a different delegation|item .* is \w+; only a live item|item .* is already delegated to|delegation .* already ended at)|^attention disposition rejected: item .* was judged material when it arrived/i, status: 409, code: 'EYE_STA_002' },
  { match: /^attention (suppression|delegation|disposition|queue evaluation) rejected/i, status: 422, code: 'EYE_REQ_001' },
  /* end B24 governance */
  /* B24 (act-found) — the decision option and choice ports' refusals (0041, 0048, 0049, 0078: `option rejected: …`, `choice rejected: …`)
     had no row and answered 500 through the routes (the B24 act saw it on POST …/versions/:v/options citing a run resting on a withdrawn
     forecast). 0078's header states the answer these texts take: 23503 → 404 for the absent version, the record's state → 409 (an
     immutable version, a version not an open draft), 422 otherwise (a citation the option may not rest on, a malformed choice). No earlier
     row starts with either phrase. */
  { match: /^(option|choice) rejected: no such package version in this domain/i, status: 404, code: 'EYE_STA_001' },
  { match: /^(option|choice) rejected: version .* is .* and immutable|^option rejected: version .* of package .* is not an open draft/i, status: 409, code: 'EYE_STA_002' },
  { match: /^(option|choice) rejected/i, status: 422, code: 'EYE_REQ_001' },
  /* end B24 act-found */
  /* B28 (0088) remediation — the coverage remediation's ports (`coverage remediation rejected …`, 0088 §R), anchored; no row above starts
     with this phrase and none of its texts carries an earlier unanchored phrase. Every refusal carries a CLASS IN PARENTHESES except the
     two standing texts (the acting principal, a named active human). B9's order: the standing 403 (the acting principal, a named human,
     `(not_owner)` — neither the item's / remediation's owner nor a collection_manager — and `(separation)` — the owner accepting their
     own gap, or a second person holding neither collection_manager nor domain_admin); the absences 404 (`(unknown_item)`,
     `(unknown_remediation)`, `(unknown_source)`, `(unknown_run)`); the record's state 409 (`(source_healthy)` — nothing to remediate,
     `(already_open)` — one open per source, `(not_open)`, `(item_closed)`, `(fallback_inactive)`, `(not_recovered)`,
     `(no_accepted_gap)`, `(stale_run)`); the caller's own request 422 (`(not_coverage_loss)`, `(owner)`, `(reason)`, `(step)`,
     `(closure)`). */
  { match: /^coverage remediation rejected: (recorded by the acting principal|a named, active human)|^coverage remediation rejected \((not_owner|separation)\)/i, status: 403, code: 'EYE_AUT_001' },
  { match: /^coverage remediation rejected \(unknown_(item|remediation|source|run)\)/i, status: 404, code: 'EYE_STA_001' },
  { match: /^coverage remediation rejected \((source_healthy|already_open|not_open|item_closed|fallback_inactive|not_recovered|no_accepted_gap|stale_run)\)/i, status: 409, code: 'EYE_STA_002' },
  { match: /^coverage remediation rejected/i, status: 422, code: 'EYE_REQ_001' },
  /* end B28 remediation */
  /* B28 (0088) warnings — the early-warning lifecycle's ports (0088 §W): `warning context rejected`, `warning closure rejected`, `warning feedback
     rejected`, `warning evaluation rejected`, `warning cluster rejected` — anchored phrases no earlier row matches (the older `^warning rejected: `
     row needs the word right after `warning`; no unanchored earlier rule matches their texts — the unit test runs every text through the mapper).
     B9's order: the standing 403 (the acting principal, the owner or a domain administrator, a named human, the evaluator's roles), the absences
     404 (the warning, the objects, objectives, indicators, scenarios, branches and runs a context names, the candidate), the record's state 409
     (a stale context version, a closed warning's context, a warning not open, a falsified closure with no declared condition, a candidate no
     longer pending), the caller's own request 422. */
  { match: /^warning (context|closure|feedback|evaluation) rejected: recorded by the acting principal|^warning context rejected: the context is set by the warning's owner|^warning closure rejected \(not_owner\)|^warning feedback rejected: feedback is a named human's act|^warning evaluation rejected: the warnings are evaluated by a named human/i, status: 403, code: 'EYE_AUT_001' },
  { match: /^warning (context|closure|feedback|cluster) rejected: no such /i, status: 404, code: 'EYE_STA_001' },
  { match: /^warning context rejected \((stale_version|closed)\)|^warning closure rejected \((not_open|no_falsification)\)|^warning cluster rejected \(not_pending\)/i, status: 409, code: 'EYE_STA_002' },
  { match: /^warning (context|closure|feedback|evaluation|cluster) rejected/i, status: 422, code: 'EYE_REQ_001' },
  /* end B28 warnings */
  /* B28 (0088) signals — the weak-signal ports' `signal rejected …` and the indicator registry's `indicator governance rejected …`, anchored;
     no row above starts with either phrase (the earlier indicator rows read `indicator rejected:` and `evaluation rejected:`), and the texts
     carry no phrase an unanchored earlier row matches (the refusal unit test runs every text through the mapper). B9's order: the standing
     403 (the acting principal, a named human, the agent's two authorities, the nominator never disposes); the absences 404 (the signal, an
     evidence object or claim, a subject, a condition's indicator, the indicator); the record's state 409 (a stale version, the maturity
     gate, an invalid signal, withdrawn or duplicate evidence, a retired or expired indicator); the caller's own request 422. */
  { match: /^signal rejected: (recorded by the acting principal|the detectors are run by a named human|an analyst's nomination is a named human's act|.* is a named human's act; the Weak Signal Agent nominates and ranks only|the nominator of signal .* does not dispose of it|the signals are ranked by a named human)|^indicator governance rejected: (recorded by the acting principal|the registry is governed by a named, active human)/i, status: 403, code: 'EYE_AUT_001' },
  { match: /^signal rejected: no such signal|^signal rejected \((evidence|subject|condition)\): no |^indicator governance rejected: no such indicator/i, status: 404, code: 'EYE_STA_001' },
  { match: /^signal rejected \((stale_version|maturity|maturity_gate|evidence_state|duplicate_evidence|duplicate)\)|^signal rejected: a signal is never deleted|^indicator governance rejected \((retired|expired)\)/i, status: 409, code: 'EYE_STA_002' },
  { match: /^signal rejected|^indicator governance rejected/i, status: 422, code: 'EYE_REQ_001' },
  /* end B28 signals */
  /* B28 (0088) streams — the event-time stream ports (F-P4-11): `stream rule rejected`, `stream processor rejected (class)`, `stream input rejected`,
     `stream signal rejected` — anchored phrases no earlier row matches (the B23 stream rows read `^acquisition stream rejected`). B9's order: the
     standing 403 (the acting principal), the absences 404 (the rule, the series, the processor, the source, the signal), the record's state 409 (an
     unchanged definition, an open draft, a rule not a draft or not active, a processor already running, retired, not recoverable or without a
     compatible checkpoint, an event key held with another value, a signal already retracted or itself a retraction), the caller's own request 422. */
  { match: /^stream rule rejected: (defined|activated) by the acting principal|^stream processor rejected \(actor\)|^stream signal rejected: retracted by the acting principal/i, status: 403, code: 'EYE_AUT_001' },
  { match: /^stream rule rejected: (no such rule|no series .* is registered)|^stream processor rejected \((no_rule|no_processor|no_source)\)|^stream input rejected: evidence .* is not an admitted evidence version|^stream signal rejected: no such signal/i, status: 404, code: 'EYE_STA_001' },
  { match: /^stream rule rejected \((unchanged|open_draft|not_draft)\)|^stream processor rejected \((rule_not_active|already_running|retired|not_recoverable|no_compatible_checkpoint)\)|^stream input rejected \(value_conflict\)|^stream signal rejected \((already_retracted|not_an_emission)\)/i, status: 409, code: 'EYE_STA_002' },
  { match: /^stream (rule|processor|input|signal) rejected/i, status: 422, code: 'EYE_REQ_001' },
  /* end B28 streams */
  /* B28 (0088) integrator — the prelude's intake (0088 §0, prediction.submit_warning_candidate): every `warning candidate rejected` text is the
     caller's own malformed candidate (22023) → 422; no earlier row starts with the phrase. */
  { match: /^warning candidate rejected/i, status: 422, code: 'EYE_REQ_001' },
  /* end B28 integrator */
  /* B34 (0090 §I): the assumption verified by a person — `assumption verification rejected` (anchored; no earlier row reads it) */
  { match: /^assumption verification rejected: (recorded by the acting principal|a named, active member)/i, status: 403, code: 'EYE_AUT_001' },
  { match: /^assumption verification rejected/i, status: 422, code: 'EYE_REQ_001' },
  /* end B34 §I */
  /* B32 (0089) graph — the Strategy Graph's alignment, measure, authority and owner ports (0089 §G): `strategy alignment rejected`, `strategy
     measure rejected`, `strategy authority rejected`, `strategy owner rejected` — anchored phrases no earlier row matches, and their texts carry
     no phrase an unanchored earlier row matches (the refusal unit test runs every text through the mapper). Every refusal carries a CLASS IN
     PARENTHESES except the two standing texts (the acting principal, a named active human). B9's order: the standing 403 (those two;
     `(not_eligible)` — no planning authority role; `(separation)` — the subject's declarer; `(not_authority)` — neither the owner nor a strategy
     owner or domain administrator); the absences 404 (`(unknown_object)`, `(unknown_evidence)`, `(unknown_alignment)`, `(unknown_measure)`,
     `(unknown_source)`, `(unknown_subject)`); the record's state 409 (`(inactive)`, `(duplicate)`, `(retired)`, `(value_conflict)`,
     `(source_withdrawn)`, `(missing_owner)`, `(stale_digest)`, `(unchanged)`); the caller's own request 422 (everything else). */
  { match: /^strategy (alignment|measure|authority|owner) rejected: (recorded by the acting principal|a named, active human)|^strategy authority rejected \((not_eligible|separation)\)|^strategy owner rejected \(not_authority\)/i, status: 403, code: 'EYE_AUT_001' },
  { match: /^strategy (alignment|measure|authority|owner) rejected \(unknown_(object|evidence|alignment|measure|source|subject)\)/i, status: 404, code: 'EYE_STA_001' },
  { match: /^strategy (alignment|measure|authority|owner) rejected \((inactive|duplicate|retired|value_conflict|source_withdrawn|missing_owner|stale_digest|unchanged)\)/i, status: 409, code: 'EYE_STA_002' },
  { match: /^strategy (alignment|measure|authority|owner) rejected/i, status: 422, code: 'EYE_REQ_001' },
  /* end B32 graph */
  /* B32 (0089) health — the Strategic Health Score's ports (0089 §H): `health definition rejected`, `health score rejected`, `health change
     rejected` — anchored phrases no earlier row starts with (no earlier row reads `^health`; the texts carry no phrase an unanchored earlier
     row matches — the unit test runs every text through the mapper). B9's order: the standing 403 (the acting principal, the proposer's and
     the approver's roles, `(separation)` — the proposer deciding their own definition, the challenger or the definition's approver deciding
     a challenge —, the change people's roles, the challenger alone withdraws); the absences 404 (the definition, an objective a dimension
     names, the change); the record's state 409 (`(pending)` — one proposal at a time, `(unchanged)`, `(not_proposed)`, `(stale_basis)`,
     `(no_definition)` — nothing active to compute under, `(not_raised)`, `(not_open)`, `(not_challenged)`); the caller's own request 422
     (the model, the reason, the instant, `(gaming_review)` — a flagged proposal approved without the anti-gaming review). */
  { match: /^health (definition|score|change) rejected: (proposed|decided|computed|recorded) by the acting principal|^health definition rejected: a definition is (proposed|approved) by a named human|^health (definition|change) rejected \(separation\)|^health change rejected: (a score change is acknowledged or challenged by a named human|a challenge is withdrawn by its challenger|a challenge is decided by a named human)/i, status: 403, code: 'EYE_AUT_001' },
  { match: /^health definition rejected: no such (definition|objective) |^health change rejected: no such change in this domain/i, status: 404, code: 'EYE_STA_001' },
  { match: /^health definition rejected \((pending|unchanged|not_proposed|stale_basis)\)|^health score rejected \(no_definition\)|^health change rejected \((not_raised|not_open|not_challenged)\)/i, status: 409, code: 'EYE_STA_002' },
  { match: /^health (definition|score|change) rejected/i, status: 422, code: 'EYE_REQ_001' },
  /* end B32 health */
  /* B32 (0089) exposures — the risk and opportunity ports (0089 §R): `exposure rejected`, `exposure (assessment|acceptance|control|routing|hypothesis|
     sponsorship|response|closure|correlation|aggregation|estimate) rejected`, `risk (taxonomy|appetite) rejected` — anchored phrases no earlier row
     matches (no earlier row starts with `exposure` or `risk `; the unanchored TWIN/INTELLIGENCE rows name `run rejected: `, `no such run`, `is admitted
     and immutable` — none of which these texts carry). B9's order: the standing 403 (the acting principal; the owner, the sponsor, a named human; a
     challenge by someone other than the assessor), the absences 404, the record's state 409 (a stale version or digest, a duplicate, a closed or
     superseded record, no taxonomy, an agent's unaccepted estimate, no breach to route, invalid aggregation members), the caller's own request 422. */
  { match: /^(exposure|exposure (assessment|acceptance|control|routing|hypothesis|sponsorship|response|closure|correlation|aggregation|estimate)|risk (taxonomy|appetite)) rejected: recorded by the acting principal|^exposure assessment rejected: (an assessment is a named human's act|the assessor of version .* does not contest it)|^exposure acceptance rejected: the assessment is accepted by the exposure's owner|^exposure sponsorship rejected: an opportunity is sponsored by|^exposure response rejected: a response is opened by|^exposure closure rejected: an exposure is closed by|^exposure correlation rejected: a declared correlation is a named human's act|^exposure estimate rejected: an estimate is made by|^risk taxonomy rejected: a taxonomy is published by|^risk appetite rejected: an appetite is approved by/i, status: 403, code: 'EYE_AUT_001' },
  { match: /^exposure rejected: no (such RSK|category)|^exposure (assessment|acceptance|control|routing|hypothesis|sponsorship|response|closure|correlation|aggregation) rejected: no such (exposure|version|evidence object|capability|objective|decision|package)|^risk appetite rejected: no category/i, status: 404, code: 'EYE_STA_001' },
  { match: /^exposure rejected \((duplicate|not_active|no_taxonomy)\)|^exposure (assessment|acceptance|control|routing|hypothesis|sponsorship|response|closure) rejected \((stale_version|stale_digest|closed|state|already_accepted|superseded|already_sponsored|agent_estimate|no_breach)\)|^exposure assessment rejected: (version .* (is immutable|does not move)|an assessment version is never deleted)|^exposure aggregation rejected \(invalid_members\)|^risk (taxonomy|appetite) rejected \((stale_version|no_taxonomy)\)/i, status: 409, code: 'EYE_STA_002' },
  { match: /^(exposure|exposure (assessment|acceptance|control|routing|hypothesis|sponsorship|response|closure|correlation|aggregation|estimate)|risk (taxonomy|appetite)) rejected/i, status: 422, code: 'EYE_REQ_001' },
  /* end B32 exposures */
  /* B36 collab (0094 §C) — collaboration completed and the carried mechanisms: `task dependency rejected` (§C2's port), `task rejected
     (dependency)` (§C2's guard on the task's completion — raised inside 0090's complete_human_task and the owning ports' _resolve), `workflow
     rejected (dependency)` and `workflow definition rejected (depends_on)` (§C2's transition and definition guards — placed BEFORE the B34
     workflow rows, whose catch-alls would answer 422), `invitation rejected` (§C3's delivery; the pickup maps its own outcomes in the
     service), `execution registration rejected` / `execution activation rejected` (§C4's register / activate / deactivate), `execution handoff
     rejected (inactive_target)` (§C4's one addition to the gateway — placed BEFORE the B34 commitments rows), `exposure learning rejected`
     (§C5). Anchored nouns no earlier row reads (`^task rejected` is not `^human task rejected`; `^invitation` , `^execution registration`,
     `^execution activation` and `^exposure learning` are new); B9's unanchored `activation rejected: rights …` rows read none of these texts.
     The classes: actor / ownership → 403; unknown_* → 404; state → 409; the rest → 422. */
  { match: /^(task dependency|invitation|execution registration|execution activation|exposure learning) rejected \((actor|not_holder|provisioner|authority|separation|not_owner)\)/i, status: 403, code: 'EYE_AUT_001' },
  { match: /^(task dependency|invitation|execution registration|execution activation|exposure learning) rejected \(unknown_[a-z_]+\)/i, status: 404, code: 'EYE_STA_001' },
  { match: /^(task dependency|invitation|execution registration|execution activation|exposure learning) rejected \((state|duplicate|retired|synthetic|decision_not_committed|locked|picked_up|expired|not_delivered|not_in_sink|seal)\)|^task rejected \(dependency\)|^workflow rejected \(dependency\)|^execution handoff rejected \(inactive_target\)/i, status: 409, code: 'EYE_STA_002' },
  { match: /^(task dependency|invitation|execution registration|execution activation|exposure learning) rejected|^workflow definition rejected \(depends_on\)/i, status: 422, code: 'EYE_REQ_001' },
  /* end B36 collab */
  /* B34 (0090) workflow — the durable workflow engine, the human tasks (the prelude's service core included: its `human task rejected (…)` and
     `workflow timer rejected` texts are mapped here too) and collaboration (0090 §W): `workflow definition rejected`, `workflow rejected`,
     `workflow drill rejected`, `workflow timer rejected`, `human task rejected`, `collaboration rejected`, `collaboration grant rejected` —
     anchored phrases no earlier row starts with (no earlier row reads `^workflow`, `^human task` or `^collaboration`; the texts carry no phrase an
     unanchored earlier row matches — the unit test runs every text through the mapper). B9's order: the standing 403 (the acting principal;
     `(not_assignee)`; a collaboration's standing — not a participant, not the owner, an observer, no live grant, the purpose, the invitee, the
     token; a timer or an instance is never deleted); the absences 404 (`(unknown_*)`); the record's state 409 (a lease held, a stale seq, a
     stopped instance, a transition the pinned definition does not permit, a changed pin, an unchanged definition, a timer already fired or
     cancelled or not yet due, a closed task, a task completed through its OWNING action, a closed workspace, a duplicate, a grant's state);
     the caller's own request 422 (everything else). B34-F1 (0091): the provisioning's `(separation)` (the requester provisioning its own
     request) and `(provisioner)` answer 403; `(not_reserved)` and `(identity)` (what the identity authority wrote does not verify) 409. */
  { match: /^(workflow definition|workflow|workflow drill|workflow timer|human task|collaboration|collaboration grant) rejected: recorded by the acting principal|^(workflow|workflow timer) rejected: an? (instance|timer) is never deleted|^human task rejected \(not_assignee\)|^collaboration rejected \((not_participant|not_owner|not_member|observer|no_grant|grant_revoked|grant_lapsed|grant_expired|grant_not_accepted|purpose|not_assignee)\)|^collaboration grant rejected \((not_owner|not_invitee|token|purpose|separation|provisioner)\)/i, status: 403, code: 'EYE_AUT_001' },
  { match: /^(workflow|workflow drill|workflow timer|human task|collaboration|collaboration grant) rejected \(unknown_(instance|definition|timer|task|workspace|thread|artifact|grant)\)/i, status: 404, code: 'EYE_STA_001' },
  { match: /^workflow rejected \((leased|stale_seq|not_running|no_transition|pinned)\)|^workflow definition rejected \(unchanged\)|^workflow timer rejected(: timer \S+ already (fired|cancelled)| \((fired|cancelled|not_due)\))|^human task rejected \((closed|owning_action)\)|^collaboration rejected \((closed|task_closed|duplicate)\)|^collaboration grant rejected \((state|duplicate|not_reserved|identity)\)/i, status: 409, code: 'EYE_STA_002' },
  { match: /^(workflow definition|workflow|workflow drill|workflow timer|human task|collaboration|collaboration grant) rejected/i, status: 422, code: 'EYE_REQ_001' },
  /* end B34 workflow */
  /* B34 (0090) exposures — the remainder's ports: `risk taxonomy activation rejected`, `exposure (scenario link|outcome review|owner
     resolution) rejected` — anchored phrases no earlier row matches (B32's rows need `exposure rejected`, `exposure <one of their nouns>
     rejected` or `risk (taxonomy|appetite) rejected` directly; none of these texts carries them). The B32 ports this part re-declares keep
     B32's phrases: a HELD exposure answers `exposure (acceptance|sponsorship) rejected (state)` (409 by B32's row) and a contradicted
     canonical polarity `exposure rejected (polarity)` (422 by B32's row). B9's order: 403, 404, 409, 422. */
  { match: /^(risk taxonomy activation|exposure (scenario link|outcome review|owner resolution)) rejected: recorded by the acting principal|^risk taxonomy activation rejected: a taxonomy is activated by a named|^risk taxonomy activation rejected \(separation\)|^exposure scenario link rejected: a link is a named|^exposure outcome review rejected: an outcome is reviewed by|^exposure owner resolution rejected: an owner is resolved by/i, status: 403, code: 'EYE_AUT_001' },
  { match: /^risk taxonomy activation rejected: no such taxonomy version|^exposure (scenario link|outcome review|owner resolution) rejected: no such (exposure|scenario|response)/i, status: 404, code: 'EYE_STA_001' },
  { match: /^risk taxonomy activation rejected \((already_active|superseded)\)|^exposure (scenario link|outcome review|owner resolution) rejected \((closed|state|duplicate|no_outcome|already_reviewed|not_needed)\)/i, status: 409, code: 'EYE_STA_002' },
  { match: /^(risk taxonomy activation|exposure (scenario link|outcome review|owner resolution)) rejected/i, status: 422, code: 'EYE_REQ_001' },
  /* end B34 exposures */
  /* B34 (0090) attention — the act transition's ports (0090 §A4): `attention act rejected`, anchored — no earlier row starts with it (B22's rows
     read `^attention (policy|item) rejected`, B24's `^attention (tick|delivery|rebalance|suppression|delegation|disposition|queue evaluation)
     rejected`; the unanchored TWIN/INTELLIGENCE rows name phrases these texts do not carry). B9's order: the standing 403 (the acting
     principal, a member, the item's people, the launcher settles), the absences 404, the record's state 409, the caller's own request 422. */
  { match: /^attention act rejected: (launched|settled) by the acting principal|^attention act rejected: an act is a named, active member|^attention act rejected: item .* is routed to|^attention act rejected: an act is settled by the member who launched it/i, status: 403, code: 'EYE_AUT_001' },
  { match: /^attention act rejected: no such (item|act) in this domain/i, status: 404, code: 'EYE_STA_001' },
  { match: /^attention act rejected \((not_live|in_flight|already_acted|settled|act_id_reused)\)|^attention act rejected: act .* is \w+ and settles once/i, status: 409, code: 'EYE_STA_002' },
  { match: /^attention act rejected/i, status: 422, code: 'EYE_REQ_001' },
  /* end B34 attention */
  /* B36 (0094 §A) attention — the attention completion's ports: `act resumption rejected`, `settle failure rejected`, `priority acceptance
     rejected`, `queue hold rejected`, `queue transition rejected` (the read-only guard of a held queue, raised from any item transition), `queue
     recovery rejected`, `forum rejected` — anchored families no earlier row matches (no earlier row starts with these nouns; B9's `^challenge
     rejected` and the unanchored TWIN/INTELLIGENCE phrases name none of these texts) and every text carries a CLASS IN PARENTHESES. B9's
     order: the standing 403 (actor, accountable, authority, membership), the absences 404 (unknown_*), the record's state 409 (state, held),
     the caller's own request 422. */
  { match: /^(act resumption|settle failure|priority acceptance|queue hold|queue recovery|forum) rejected \((actor|accountable|authority|membership)\)/i, status: 403, code: 'EYE_AUT_001' },
  { match: /^(act resumption|settle failure|priority acceptance|queue hold|queue recovery|forum) rejected \(unknown_\w+\)/i, status: 404, code: 'EYE_STA_001' },
  { match: /^(act resumption|settle failure|priority acceptance|queue hold|forum) rejected \(state\)|^queue transition rejected \(held\)/i, status: 409, code: 'EYE_STA_002' },
  { match: /^(act resumption|settle failure|priority acceptance|queue hold|queue transition|queue recovery|forum) rejected/i, status: 422, code: 'EYE_REQ_001' },
  /* end B36 attention */
  /* B34 (0090) gates — the human gate's ports (0090 §G): `gate rejected`, `override rejected`, `override review rejected`, `delegation (end )?rejected`,
     `board reservation rejected`, `preview rejected`, `control rejected`, the typed conditions of `approval rejected (conditions|condition_ref|delegation|board)`,
     and the commitment's new classes `commitment rejected (conditions_hold|not_ready|no_preview|override_self|board_quorum)` — anchored phrases no earlier
     row matches (B24's `^commitment rejected \(source_impact\)` names its own class; no earlier row starts with these families). B9's order: the standing
     403 (the acting principal, a named member, the authority, the independence, the separation, the board), the absences 404, the record's state 409 (a
     version not open for the act, a stale information package or digest, nothing to override, a reviewed override, a duplicate or ended delegation, a
     reserved board, the held conditions, no fresh decision-ready, no preview), the caller's own request 422. */
  { match: /^(gate|override|override review|delegation|delegation end|board reservation|preview|control) rejected \((authority|independence|separation)\)|^(override|delegation) rejected \(board\)|^(gate|override|override review|delegation|delegation end|board reservation|preview|control) rejected: (a gate act is the acting|only a named, active member|an override is the acting|the review is the acting|a delegation is the delegator|the end is the delegator|only the delegator|the reservation is the acting|a preview is the committing|a control decision is the acting)|^approval rejected \(board\)|^commitment rejected \((override_self|board_quorum)\)|^(approval conditions|information package|gate status|controls) rejected: outside/i, status: 403, code: 'EYE_AUT_001' },
  { match: /^(gate|override|override review|delegation|delegation end|board reservation|preview|control) rejected: no such|^approval rejected \(condition_ref\)/i, status: 404, code: 'EYE_STA_001' },
  { match: /^gate rejected \((state|stale_package)\)|^override rejected \((state|nothing_to_override)\)|^override review rejected \((reviewed|normal)\)|^delegation rejected \((state|duplicate)\)|^delegation end rejected \(ended\)|^board reservation rejected \((reserved|state)\)|^preview rejected \(state\)|^preview rejected: the digest previewed|^commitment rejected \((conditions_hold|not_ready|no_preview)\)|^approval rejected \(delegation\)/i, status: 409, code: 'EYE_STA_002' },
  { match: /^(gate|override|override review|delegation|delegation end|board reservation|preview|control) rejected|^approval rejected \(conditions\)/i, status: 422, code: 'EYE_REQ_001' },
  /* end B34 gates */
  /* B36 (0094) gates — the gate completed (0094 §G): `signature rejected` (the prelude's port and §G2's), `recusal rejected`, `decision challenge rejected` (B9's `^challenge rejected` row is the review challenge's),
     `challenge resolution rejected`, `distribution rejected`, `version fields rejected`, `board decision rejected`, `pdp denial rejected`,
     `decision record rejected`, `gate state rejected` — anchored phrases no earlier row matches (the B34 rows read `gate rejected`, `board reservation
     rejected`, `approval rejected (…)` with their own classes; the two new approval / commitment classes below are named exactly). B9's order:
     the standing 403 (actor, ownership, authority, separation, class, context; a recused approver; the caller's scope), the absences 404
     (unknown_*), the record's state 409 (state, stale_digest, a challenged commitment), the caller's own request 422 (everything else). */
  { match: /^(signature|recusal|decision challenge|challenge resolution|distribution|version fields|board decision|pdp denial) rejected \((actor|ownership|authority|separation|class|context)\)|^approval rejected \(recused\)|^decision record rejected: outside/i, status: 403, code: 'EYE_AUT_001' },
  { match: /^(signature|recusal|decision challenge|challenge resolution|distribution|version fields|board decision|gate state) rejected \(unknown_[a-z_]+\)/i, status: 404, code: 'EYE_STA_001' },
  { match: /^(signature|recusal|decision challenge|challenge resolution|distribution|version fields|board decision) rejected \((state|stale_digest)\)|^commitment rejected \(challenged\)/i, status: 409, code: 'EYE_STA_002' },
  { match: /^(signature|recusal|decision challenge|challenge resolution|distribution|version fields|board decision|pdp denial|gate state) rejected/i, status: 422, code: 'EYE_REQ_001' },
  /* end B36 gates */
  /* B34 (0090) commitments — the tracker's and the execution gateway's ports (0090 §C): `commitment (item|exception|closure) rejected`,
     `execution (target|handoff|issue|attempt|compensation|reconcile) rejected`, `objective revision rejected` and the package closure's
     `closure rejected (commitment_open)` — anchored phrases no earlier row matches (no earlier row starts with `commitment item`,
     `commitment exception`, `commitment closure`, `execution ` or `objective revision`; B24's `^commitment rejected \(source_impact\)` needs
     `commitment rejected`; no earlier row names `closure rejected (`), and every text carries a CLASS IN PARENTHESES. B9's order: the
     standing 403 (the acting principal, not the owner / party / reviewer / compensation owner, a self co-sign, the issuer's authority, class,
     bound action and separation, not the objective's authority), the absences 404 (`unknown_*`), the record's state 409, the caller's own
     request 422 (everything else — the not_synthetic target among them: an owner decision, never an administrator's). */
  { match: /^(commitment (item|exception|closure)|execution (target|handoff|issue|attempt|compensation|reconcile)|objective revision) rejected \((actor|not_owner|not_party|not_reviewer|self_cosign|not_compensation_owner|authority|class|bound_action|separation|not_authority)\)/i, status: 403, code: 'EYE_AUT_001' },
  { match: /^(commitment (item|exception|closure)|execution (target|handoff|issue|attempt|compensation|reconcile)|objective revision) rejected \(unknown_[a-z_]+\)/i, status: 404, code: 'EYE_STA_001' },
  { match: /^(commitment (item|exception|closure)|execution (target|handoff|issue|attempt|compensation|reconcile)|objective revision) rejected \((state|closed|root|duplicate|retired|target_retired|stale_digest|stale_version|open_exception|unreconciled_handoff|residual_undisposed|not_ready|live_compensation|compensation_state|inactive|unchanged|no_reviewer|attempt|canonical|commitment)\)|^closure rejected \(commitment_open\)/i, status: 409, code: 'EYE_STA_002' },
  { match: /^(commitment (item|exception|closure)|execution (target|handoff|issue|attempt|compensation|reconcile)|objective revision) rejected/i, status: 422, code: 'EYE_REQ_001' },
  /* end B34 commitments */
  /* B29 §A (0092) composition — the twin family, contract, link and coupling ports: `twin kind rejected`, `twin contract rejected`, `twin link
     rejected`, `coupling rejected` — anchored phrases no earlier row matches (TWIN_RULES' unanchored `twin rejected: ` needs `twin rejected`,
     which none of these texts carries; no earlier row starts with these families). B9's order: the standing 403 (the acting principal, the
     ownership boundary, a kind outside its tenant and domain), the absences 404, the record's state 409 (a duplicate, a retired link, a
     decided proposal, a draft in the way, an upstream without a contract, a contract that would strand a live link), the caller's own 422. */
  { match: /^(twin kind|twin contract|twin link|coupling) rejected \((actor|ownership|ownership_boundary|scope)\)/i, status: 403, code: 'EYE_AUT_001' },
  { match: /^(twin kind|twin contract|twin link|coupling) rejected: no such /i, status: 404, code: 'EYE_STA_001' },
  { match: /^(twin kind|twin contract|twin link|coupling) rejected \((duplicate|retired|state|link_retired|draft_conflict|uncontracted|live_link)\)/i, status: 409, code: 'EYE_STA_002' },
  { match: /^(twin kind|twin contract|twin link|coupling) rejected/i, status: 422, code: 'EYE_REQ_001' },
  /* end B29 §A */
  /* B29-F1 (0093): the draft withdrawal port — `draft withdrawal rejected (<class>): …` (anchored; the executive's unanchored `withdrawal
     rejected` 422 family is placed after these and never reaches an anchored `draft withdrawal` text). The standing 403 (the acting principal,
     not the owner nor the opener), the absences 404, the record's state 409 (admitted, already withdrawn), the caller's own 422 (the reason). */
  { match: /^draft withdrawal rejected \((actor|ownership)\)/i, status: 403, code: 'EYE_AUT_001' },
  { match: /^draft withdrawal rejected \(unknown_[a-z_]+\)/i, status: 404, code: 'EYE_STA_001' },
  { match: /^draft withdrawal rejected \(state\)/i, status: 409, code: 'EYE_STA_002' },
  { match: /^draft withdrawal rejected/i, status: 422, code: 'EYE_REQ_001' },
  /* B29 §D (0092) constraints — the constraint engine's ports: `constraint set rejected (…)` (declare, version, retire) and `plan check
     rejected (…)` (the check record) — anchored phrases no other row matches (no earlier row starts with `constraint set` or `plan check`;
     §C's `constraint check rejected` is its own port's family, simulation.run_constraint_checks; the unanchored `run rejected: ` /
     `twin rejected: ` rows need those words, which none of these texts carries), each text with its CLASS IN PARENTHESES.
     B9's order: the standing 403 (the acting principal, a steward naming another steward without the domain administrator's role, ANOTHER
     steward versioning or retiring the set), the absences 404 (`unknown_*`), the record's state 409 (a duplicate key — the port's own text
     or the unique index's —, a retired set, a stale expected version, a stale pin), the caller's own request 422 (everything else — a named
     steward without the role among them). A VIOLATED plan is not a port refusal: the plan check route answers it (422 with the violations). */
  { match: /^(constraint set|plan check) rejected \((actor|steward|not_steward)\)/i, status: 403, code: 'EYE_AUT_001' },
  { match: /^(constraint set|plan check) rejected \(unknown_[a-z_]+\)/i, status: 404, code: 'EYE_STA_001' },
  { match: /^(constraint set|plan check) rejected \((duplicate|retired|stale_version|stale_pin)\)/i, status: 409, code: 'EYE_STA_002' },
  { match: /duplicate key value violates unique constraint "cset_key_unique"/i, status: 409, code: 'EYE_STA_002' },
  { match: /^(constraint set|plan check) rejected/i, status: 422, code: 'EYE_REQ_001' },
  /* end B29 §D */
  /* B29 (0092) §C methods — the method fabric: open_run's three new gates in the CLASS form (`run rejected (unbound_method|method_family|
     quarantined)`, which the generic `run rejected: ` row cannot catch) and the ports `method binding rejected`, `adapter fault rejected`,
     `adapter probe rejected`, `adapter reinstatement rejected`, `constraint check rejected` — anchored phrases no earlier row matches (the
     extraction method rows read `method (approval|transition) rejected`). The service's own `run rejected (constraint)` (§D's violated verdict
     at opening, 422) and `run failed (…)` are HttpExceptions and never reach this mapper. B9's order: the standing 403 (not the twin's owner;
     the reinstater who operated the last faulted run), the absences 404 (no twin, model, active binding or run), the record's state 409 (an
     unbound method, a quarantined adapter, a binding already there, an adapter not quarantined, no passing probe since the last fault), the
     caller's own request 422 (everything else — a family outside the twin's approved uses among them). */
  { match: /^method binding rejected \(not_owner\)|^adapter reinstatement rejected \(separation\)/i, status: 403, code: 'EYE_AUT_001' },
  { match: /^method binding rejected: (no twin|no behaviour model|.* is not bound to twin)|^adapter (fault|probe) rejected: (no behaviour model|run .* is not a run of)|^constraint check rejected: no run/i, status: 404, code: 'EYE_STA_001' },
  { match: /^run rejected \((unbound_method|quarantined)\)|^method binding rejected \(already_bound\)|^adapter reinstatement rejected(: the adapter of .* is not quarantined| \(no_probe\))/i, status: 409, code: 'EYE_STA_002' },
  { match: /^run rejected \(method_family\)|^method binding rejected|^adapter (fault|probe|reinstatement) rejected|^constraint check rejected/i, status: 422, code: 'EYE_REQ_001' },
  /* end B29 §C methods */
  /* B29 (0092) §B supply network — the Supply Chain Agent's proposal ports (`twin proposal rejected`) and the agent's write boundary on the
     twin event log (`twin write rejected (agent)`) — anchored phrases no earlier row matches (TWIN_RULES' unanchored `twin rejected: ` needs
     `twin rejected`, which neither carries). B9's order: the standing 403 (the acting principal, not the domain's active Supply Chain Agent,
     not its running scan, not the twin's owner, an agent writing a twin), the absences 404, the record's state 409 (a decided proposal, a
     version that is not admitted on actual), the caller's own 422 (a malformed finding, a twin of another family, a decision without reason). */
  { match: /^twin proposal rejected \((actor|not_agent|run|ownership)\)|^twin write rejected \(agent\)/i, status: 403, code: 'EYE_AUT_001' },
  { match: /^twin proposal rejected: no such /i, status: 404, code: 'EYE_STA_001' },
  { match: /^twin proposal rejected \((state|version)\)/i, status: 409, code: 'EYE_STA_002' },
  { match: /^twin proposal rejected/i, status: 422, code: 'EYE_REQ_001' },
  /* end B29 §B */
  /* B36 (0094 §S) strategy — the score completed and the Strategy Graph completed (0094 §S1–§S7): `health input rejected`, `health exception
     rejected`, `health approval rejected`, `strategy revocation rejected` — anchored FAMILIES no earlier row starts with (B32's health rows read
     `^health (definition|score|change) rejected` and its graph rows `^strategy (alignment|measure|authority|owner) rejected`; neither names these
     nouns; the texts carry no phrase an unanchored earlier row matches — the unit test runs every text through the mapper). B9's order: the standing
     403 (the acting principal; `(ownership)` — not the input's owner; `(separation)` — the requester deciding their own exception; the standing
     human phrase of assert_strategy_actor; `(not_authority)` — neither the act's issuer nor a domain administrator); the absences 404
     (`(unknown_component)`, `(unknown_exception)`, `(unknown_snapshot)`, `(unknown_act)`); the record's state 409 (`(no_definition)`,
     `(pending)`, `(state)`, `(expired)`, `(stale_digest)`, `(duplicate)`, `(revoked)`, `(lapsed)`); the caller's own request 422 (the rest). */
  { match: /^(health input|health exception|health approval) rejected \((actor|ownership|separation)\)|^strategy revocation rejected: (recorded by the acting principal|a named, active human)|^strategy revocation rejected \(not_authority\)/i, status: 403, code: 'EYE_AUT_001' },
  { match: /^(health input|health exception|health approval) rejected \(unknown_(component|exception|snapshot)\)|^strategy revocation rejected \(unknown_act\)/i, status: 404, code: 'EYE_STA_001' },
  { match: /^(health input|health exception|health approval) rejected \((no_definition|pending|state|expired|stale_digest|duplicate)\)|^strategy revocation rejected \((revoked|lapsed)\)/i, status: 409, code: 'EYE_STA_002' },
  { match: /^(health input|health exception|health approval|strategy revocation) rejected/i, status: 422, code: 'EYE_REQ_001' },
  /* end B36 strategy */
  /* B36 briefing (0094 §B) — BRF@v3's ports in the CLASS form `briefing rejected (<class>): …` (the composition's v3 gates), `briefing
     policy rejected (<class>): …` (the suppression policy's publication) and `briefing expiry rejected (actor)` (the tick step's port) —
     anchored phrases no earlier row matches (0044/0084's unclassed `briefing rejected: …` texts stay as they were: the composer's own
     HttpExceptions answer first, and the harness reads the port's text). B9's order: the standing 403 (the acting principal, a policy set
     by a named human, a reader outside the audience), the absences 404 (an unknown policy version), the record's state 409 (an edition that
     met an unavailable dependency and declares no omission; a policy whose rules are unchanged), the caller's own request 422 (the rest:
     a malformed audience CONTRACT at composition (`contract`), purpose, expiry, omission, an item without its band, a suppressed item
     rendered, malformed rules). `audience` is the READ's class alone: a reader outside the contract's roles is standing, 403. */
  { match: /^briefing rejected \((actor|audience)\)|^briefing policy rejected \(actor\)|^briefing expiry rejected \(actor\)/i, status: 403, code: 'EYE_AUT_001' },
  { match: /^briefing rejected \(unknown_(policy|room|prior)\)/i, status: 404, code: 'EYE_STA_001' },
  { match: /^briefing rejected \((state|undeclared_omission|expired)\)|^briefing policy rejected \(state\)|^briefing rejected: the prior briefing belongs to another room/i, status: 409, code: 'EYE_STA_002' },
  { match: /^briefing rejected \(|^briefing policy rejected/i, status: 422, code: 'EYE_REQ_001' },
  /* end B36 briefing */
  /* B36 (0094) publishing — the publishing and distribution center's ports (0094 §D): `publication rejected (<class>)` and `external draft
     rejected (<class>)` — anchored phrases no earlier row matches (no earlier row starts with `publication` or `external draft`; every text
     carries a CLASS IN PARENTHESES). B9's order: the standing 403 (the acting principal, the authority, the separation of the approver or
     reviewer from the drafter, not the recipient, the source's own read refusal), the absences 404 (`unknown_*`), the record's state 409
     (a version not drafted / not approved, a stale digest or snapshot, a withdrawn or archived publication, nothing changed, the external
     review not approved, the export path's gates legal_hold and residency, the signature or the canonical object missing from the write),
     the caller's own request 422 (everything else: the format declared unsupported among them). */
  { match: /^(publication|external draft) rejected \((actor|authority|separation|not_recipient|source_read)\)/i, status: 403, code: 'EYE_AUT_001' },
  { match: /^(publication|external draft) rejected \(unknown_[a-z_]+\)/i, status: 404, code: 'EYE_STA_001' },
  { match: /^(publication|external draft) rejected \((state|stale_digest|stale_source|source_state|withdrawn|archived|unchanged|external_review|legal_hold|residency|signature|object)\)/i, status: 409, code: 'EYE_STA_002' },
  { match: /^(publication|external draft) rejected/i, status: 422, code: 'EYE_REQ_001' },
  /* end B36 publishing */
  /* B36 planning (0094 §P) — the plan and initiative ports (`plan rejected`, `plan baseline rejected`, `initiative rejected`, `milestone
     rejected`, `plan dependency rejected`, `plan measure rejected`, `plan run rejected`, `plan breach rejected`, `initiative citation rejected`)
     and the commitment HOLD (`plan commitment rejected (breach_open)`) — anchored phrases no earlier row matches (B22's `^plan selection
     rejected` and B24's `^plan execution rejected` are other nouns; no earlier row starts with `plan rejected`, `plan baseline`, `initiative`,
     `milestone`, `plan dependency`, `plan measure`, `plan run`, `plan breach` or `plan commitment`), every text carrying a CLASS IN
     PARENTHESES. B9's order: the standing 403 (the acting principal, the sponsor, the separation of proposer and approver, the package's
     owner), the absences 404 (`unknown_*`), the record's state 409 (state, closed, duplicate, an open breach), the caller's own 422 (the
     budget authority among them: funding above the ceiling is the request's fault, not the record's). */
  { match: /^(plan|plan baseline|initiative|milestone|plan dependency|plan measure|plan run|plan breach|initiative citation) rejected \((actor|not_sponsor|separation|not_owner)\)/i, status: 403, code: 'EYE_AUT_001' },
  { match: /^(plan|plan baseline|initiative|milestone|plan dependency|plan measure|plan run|plan breach|initiative citation) rejected \(unknown_[a-z_]+\)/i, status: 404, code: 'EYE_STA_001' },
  { match: /^(plan|plan baseline|initiative|milestone|plan dependency|plan measure|plan run|plan breach|initiative citation) rejected \((state|closed|duplicate|breach_open)\)|^plan commitment rejected \(breach_open\)/i, status: 409, code: 'EYE_STA_002' },
  { match: /^(plan|plan baseline|initiative|milestone|plan dependency|plan measure|plan run|plan breach|initiative citation|plan commitment) rejected/i, status: 422, code: 'EYE_REQ_001' },
  /* end B36 planning */
  /* B90 prelude (0095 §0) — the data product registry's family `data product rejected (<class>)` (the parts' families are their own and
     anchored distinctly: `data product consumer rejected`, `product scorecard rejected`, `event product rejected`, `subscription rejected`,
     `metric rejected`, `metric certification rejected`, `catalog asset rejected`, `catalog rejected`, `glossary term rejected`, `lineage
     rejected`; no earlier row starts with `data product`). B9's order: the standing 403 (the acting principal, the authority, the owner, the
     separation of owner and reviewer), the absences 404 (`unknown_*`), the record's state 409 (state, duplicate, duplicate_authority,
     review, canonical, meaning, consumers, contract_tests), the caller's own 422 (the contract among them: publication denied for what the
     declaration lacks is the request's fault). */
  { match: /^data product rejected \((actor|authority|not_owner|separation)\)/i, status: 403, code: 'EYE_AUT_001' },
  { match: /^data product rejected \(unknown_[a-z_]+\)/i, status: 404, code: 'EYE_STA_001' },
  { match: /^data product rejected \((state|duplicate|duplicate_authority|review|canonical|meaning|consumers|contract_tests)\)/i, status: 409, code: 'EYE_STA_002' },
  { match: /^data product rejected/i, status: 422, code: 'EYE_REQ_001' },
  /* end B90 prelude */
  /* B90 metrics (0095 §M) — the semantic layer's families `metric rejected (<class>)` and `metric certification rejected (<class>)` —
     anchored phrases no earlier row matches (no earlier row starts with `metric`; `data product rejected` is another noun and `metric
     rejected` is no suffix of an unanchored earlier row). B9's order: the standing 403 (the acting principal, the authority — a steward
     certifying, a non-owner declaring), the absences 404 (`unknown_*`: product, metric, version, serving), the record's state 409 (state,
     the executive view's `certification` refusal of an uncertified / withdrawn / expired model, a `conflict` with another certified model,
     `unchanged`, no definition `effective` at the instant, the `signature` or the `canonical` object missing from the write), the caller's
     own request 422 (the rest: a measure outside the whitelist, a grain or dimension the measure does not allow, a filter off the
     dimensions, the aggregation, the unit, the view, the instant, the expiry, the reason). */
  { match: /^(metric|metric certification) rejected \((actor|authority)\)/i, status: 403, code: 'EYE_AUT_001' },
  { match: /^(metric|metric certification) rejected \(unknown_[a-z_]+\)/i, status: 404, code: 'EYE_STA_001' },
  { match: /^(metric|metric certification) rejected \((state|certification|conflict|unchanged|effective|signature|canonical)\)/i, status: 409, code: 'EYE_STA_002' },
  { match: /^(metric|metric certification) rejected/i, status: 422, code: 'EYE_REQ_001' },
  /* end B90 metrics */
  /* B36 home (0094 §H) — the executive home's families in the CLASS form `<noun> rejected (<class>): …`: `cadence rejected`, `executive room
     rejected` (0044's unclassed `room rejected: …` texts are the decision room's and are mapped by no row; the noun here is `executive room`
     and every row is anchored), `objective review rejected` (the SoD of §H2's re-declared convene_review and of open_subject_room — B23's
     `^review convening rejected` rows read another noun), `agenda rejected`, `escalation rejected`, `search rejected`, `command view rejected`
     and §0's `context rejected` (the prelude's port; this part owns its only route — `^memory context rejected` and `^warning context rejected`
     are other nouns, anchored). B9's order: the standing 403 (the acting principal, a role not held, the separation of duties), the absences
     404 (unknown_*), the record's state 409 (state, stale), the caller's own request 422 (the rest). The unit test runs every text through
     the mapper. */
  { match: /^(cadence|executive room|agenda|escalation|search|context) rejected \(actor\)|^objective review rejected \(separation_of_duties\)|^command view rejected \(role\)/i, status: 403, code: 'EYE_AUT_001' },
  { match: /^(cadence|executive room|agenda|escalation|command view) rejected \(unknown_(subject|cadence|object|escalation|view)\)/i, status: 404, code: 'EYE_STA_001' },
  { match: /^(cadence|executive room|agenda|escalation) rejected \(state\)|^context rejected \(stale\)/i, status: 409, code: 'EYE_STA_002' },
  { match: /^(cadence|executive room|agenda|escalation|search|context|command view) rejected \(/i, status: 422, code: 'EYE_REQ_001' },
  /* end B36 home */
];

export function asObservationRefusal(e: unknown, correlationId: string): HttpException | null {
  if (e instanceof HttpException) return e;
  const err = e as PgError;
  const message = typeof err?.message === 'string' ? err.message : '';
  if (message === '') return null;
  // Only SQLSTATEs the observation ports actually raise are considered: a check
  // violation, a foreign-key/absence, an invalid parameter, a uniqueness clash,
  // an explicit privilege refusal, or (twin/simulation ports) an immutability refusal;
  // B9 adds the legal-hold refusal of the tombstone port (P0R01); B11 the digest refusal of the archive port (P0R02).
  const code = typeof err.code === 'string' ? err.code : '';
  if (!['23514', '23503', '22023', '23505', '42501', '2F002', 'P0R01', 'P0R02'].includes(code)) return null;

  for (const rule of [...RULES, ...INTELLIGENCE_RULES, ...TWIN_RULES]) {
    if (rule.match.test(message)) {
      return new HttpException(errorBody(rule.code, correlationId, rule.message), rule.status);
    }
  }
  for (const rule of B9_REFUSALS) {
    if (rule.match.test(message)) return new HttpException(errorBody(rule.code, correlationId, message), rule.status);
  }
  // A refusal we recognise as a rule by its SQLSTATE but not by its text still
  // answers as a conflict rather than as a crash — and says only that.
  if (code === '23514' || code === '23505') {
    return new HttpException(
      errorBody('EYE_STA_002', correlationId, 'the request conflicts with a rule this record enforces.'),
      409,
    );
  }
  return null;
}
