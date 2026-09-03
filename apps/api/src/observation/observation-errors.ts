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

/**
 * Translate a port refusal into its governed answer, or return null when the
 * error is not a recognised rule — in which case the caller must let it surface
 * as the internal failure it is.
 */
export function asObservationRefusal(e: unknown, correlationId: string): HttpException | null {
  if (e instanceof HttpException) return e;
  const err = e as PgError;
  const message = typeof err?.message === 'string' ? err.message : '';
  if (message === '') return null;
  // Only SQLSTATEs the observation ports actually raise are considered: a check
  // violation, a foreign-key/absence, an invalid parameter, a uniqueness clash,
  // or an explicit privilege refusal.
  const code = typeof err.code === 'string' ? err.code : '';
  if (!['23514', '23503', '22023', '23505', '42501'].includes(code)) return null;

  for (const rule of RULES) {
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
