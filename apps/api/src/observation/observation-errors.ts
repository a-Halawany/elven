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

export function asObservationRefusal(e: unknown, correlationId: string): HttpException | null {
  if (e instanceof HttpException) return e;
  const err = e as PgError;
  const message = typeof err?.message === 'string' ? err.message : '';
  if (message === '') return null;
  // Only SQLSTATEs the observation ports actually raise are considered: a check
  // violation, a foreign-key/absence, an invalid parameter, a uniqueness clash,
  // an explicit privilege refusal, or (twin/simulation ports) an immutability refusal.
  const code = typeof err.code === 'string' ? err.code : '';
  if (!['23514', '23503', '22023', '23505', '42501', '2F002'].includes(code)) return null;

  for (const rule of [...RULES, ...INTELLIGENCE_RULES, ...TWIN_RULES]) {
    if (rule.match.test(message)) {
      return new HttpException(errorBody(rule.code, correlationId, rule.message), rule.status);
    }
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
