/*
 * P5 · the twin and simulation ports' refusals answer as what they are.
 *
 * A port raising `version rejected: branch actual already has an open draft` is
 * the system working, not breaking; it must reach the operator as a 409 with a
 * sentence in the product's words, never as a 500. These checks drive the
 * translation with the exact SQLSTATE + message pairs the migrations raise.
 */
import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';

const pg = (code: string, message: string) => Object.assign(new Error(message), { code });
const answer = (code: string, message: string) => {
  const r = asObservationRefusal(pg(code, message), 'corr');
  return r === null ? null : { status: r.getStatus(), body: r.getResponse() as { code: string; message: string } };
};

describe('P5 · port refusals are translated, not swallowed', () => {
  it('a second draft on a branch is a conflict (409), in the product\'s words, without the port\'s text', () => {
    const a = answer('22023', 'version rejected: branch actual already has an open draft; admit it or ground into it');
    expect(a?.status).toBe(409);
    expect(a?.body.code).toBe('EYE-STA-002');
    expect(a?.body.message).toMatch(/already has an open draft/);
    expect(a?.body.message).not.toMatch(/version rejected/);
  });
  it('grounding into an admitted version, admitting an incomplete version, and an incompatible control are conflicts', () => {
    expect(answer('2F002', 'grounding rejected: version 3 of twin x is not an open draft in this domain')?.status).toBe(409);
    expect(answer('22023', 'admission rejected: required inputs are missing, unreadable or stale: shock.corridor_delay_days')?.status).toBe(409);
    expect(answer('22023', 'run rejected: control run x is not compatible (it must share the twin version, initial state, implementation, assumptions, constraints, shock and component)')?.status).toBe(409);
    expect(answer('2F002', 'completion rejected: run x is already completed')?.status).toBe(409);
    expect(answer('2F002', 'twin version 2 of x is admitted and immutable; only its verification state may change, by event')?.status).toBe(409);
  });
  it('an entity-only material element, a malformed citation, and a control run with a control reference are bad requests (422)', () => {
    expect(answer('22023', 'grounding rejected: inventory.on_hand:SYN-PART-MAG is material for this twin and is substantiated by nothing but an entity — an entity names a subject, it substantiates no value')?.status).toBe(422);
    expect(answer('22023', 'grounding rejected: citations must be an array of {kind, id, version, digest} binding exact objects')?.status).toBe(422);
    expect(answer('22023', 'run rejected: a control run applies `none` and references no control')?.status).toBe(422);
    expect(answer('22023', 'twin rejected: the boundary must name at least one graph entity')?.status).toBe(422);
  });
  it('an absent twin, run or invalidation is 404', () => {
    expect(answer('23503', 'version rejected: no such twin in this domain')?.status).toBe(404);
    expect(answer('23503', 'reproduction rejected: run x is not a completed run in this domain')?.status).toBe(404);
    expect(answer('23503', 'impact rejected: no such invalidation')?.status).toBe(404);
  });
  it('R1/R2: the new-boundary refusals answer as conflicts and bad requests, in the product\'s words', () => {
    // availability of a required input, established at the RUN boundary rather than from stored health
    const a = answer('22023', 'run rejected: required inputs for component SYN-PART-MAG are no longer available: [{"key": "route.inland_days", "problem": "withdrawn"}]');
    expect(a?.status).toBe(409);
    expect(a?.body.message).toMatch(/no longer available|withdrawn/i);
    expect(a?.body.message).not.toMatch(/run rejected/);
    // the scenario, under the run's own record cut-off
    expect(answer('22023', "run rejected: scenario x was recorded after this version's known_at (2026-09-01T12:00:00Z); it was not known at record time")?.status).toBe(422);
    expect(answer('22023', "run rejected: branch b was open at this version's known_at (2026-09-01T12:00:00Z), not flipped")?.status).toBe(422);
    expect(answer('22023', "run rejected: scenario x stood at version 1 at this version's known_at (2026-09-01T12:00:00Z), not 2")?.status).toBe(422);
  });

  it('R2 world clock: a flip observed after the run\'s world cut-off is not an observed shock, and the refusal says so', () => {
    const a = answer('22023', "run rejected: branch b was open under this run's cut-offs (known_at 2026-09-01T12:00:00Z, observations through 2023-11-23; the flip was recorded 2026-08-31 and observed 2023-11-24), not flipped");
    expect(a?.status).toBe(422);
    expect(a?.body.message).toMatch(/record cut-off|world|later information/i);
    expect(a?.body.message).not.toMatch(/run rejected/);
    expect(answer('22023', "run rejected: the shock contradicts the bound branch: branch b was open under this run's cut-offs (a shock without a flipped branch is a hypothetical and names no scenario)")?.status).toBe(422);
  });

  it('a fault that is not a port refusal stays a fault: no SQLSTATE, or a SQLSTATE the ports do not raise, translates to nothing', () => {
    expect(asObservationRefusal(new Error('version rejected: branch actual already has an open draft'), 'corr')).toBeNull();
    expect(asObservationRefusal(pg('XX000', 'version rejected: branch actual already has an open draft'), 'corr')).toBeNull();
    expect(asObservationRefusal(pg('22023', 'something the ports never say'), 'corr')).toBeNull();
    expect(answer('22023', 'version rejected: branch actual already has an open draft')?.body).not.toBeInstanceOf(HttpException);
  });
});

describe('B9 (0066) — the refusals of the memory, retention, contradiction, evaluation, ontology, scenario-review and executive-request ports answer with the port\'s reason and a status, never as a 500', () => {
  const mapped = (code: string, message: string) => {
    const r = asObservationRefusal(pg(code, message), 'corr');
    if (r === null) return null;
    const body = r.getResponse() as { message?: string };
    return { status: r.getStatus(), message: body.message };
  };
  it('standing → 403, absence → 404, the record\'s state → 409, the caller\'s request → 422 — the message the port wrote', () => {
    expect(mapped('42501', 'request rejected (stale_authority): only a member of room 01a0 lends their standing in it')).toMatchObject({ status: 403 });
    expect(mapped('42501', 'the proposer of an ontology change does not decide it')).toMatchObject({ status: 403 });
    expect(mapped('42501', 'retention approval rejected: the opener of an action does not approve it')).toMatchObject({ status: 403 });
    expect(mapped('23503', 'withdrawal rejected: no request 01a0 in this domain')).toMatchObject({ status: 404 });
    expect(mapped('23503', 'no scenario 01a0 in this domain')).toMatchObject({ status: 404 });
    expect(mapped('22023', 'request rejected: request key brief-1 was already used by this requester for a different request (digest ab recorded, cd offered); a new request takes a new key')).toMatchObject({ status: 409, message: expect.stringMatching(/request key brief-1/) });
    expect(mapped('22023', 'request rejected (stale_version): subject DPK:01a0 stands at version 2, the request names version 9')).toMatchObject({ status: 409 });
    expect(mapped('22023', 'proposal refused: a breaking change with 3 asserted edge(s) still on the predicates it removes is not approved until they are migrated')).toMatchObject({ status: 409 });
    expect(mapped('22023', 'scenario 01a0 is retired; a retired scenario is not reviewed again (declare a successor)')).toMatchObject({ status: 409 });
    expect(mapped('22023', 'run rejected: scenario 01a0 was retired by review; a retired branch is not simulated (declare a successor scenario)')).toMatchObject({ status: 409 });
    expect(mapped('P0R01', 'tombstone refused: manifest 01a0 is under a legal hold (hold 01a1); the hold takes precedence over retention')).toMatchObject({ status: 409 });
    expect(mapped('22023', 'retention approval rejected: the digest approved (ab) is not the resolved scope (cd)')).toMatchObject({ status: 409 });
    expect(mapped('22023', 'a dissent states its position and rationale')).toMatchObject({ status: 422 });
    expect(mapped('22023', 'request rejected: a delegation names the delegate')).toMatchObject({ status: 422 });
    expect(mapped('22023', 'memory item rejected: a retention profile is declared at record time')).toMatchObject({ status: 422 });
    expect(mapped('23514', 'warning rejected: a warning raised since 0061 carries its derived level (level, level_version, urgency, consequence_class, op_class)')).toMatchObject({ status: 422 });
    // an unknown text under a known code still answers as a conflict (the fallback), and an unknown code stays internal
    expect(mapped('23514', 'something the ports never say')).toMatchObject({ status: 409 });
    expect(mapped('XX000', 'request rejected: a delegation names the delegate')).toBeNull();
  });
});

describe('B11 (0070) — the refusals of the archive port, the export package ports and the export\'s rights re-check at execution answer with the port\'s reason and a status, never as a 500', () => {
  const mapped = (code: string, message: string) => {
    const r = asObservationRefusal(pg(code, message), 'corr');
    if (r === null) return null;
    const body = r.getResponse() as { message?: string };
    return { status: r.getStatus(), message: body.message };
  };
  it('standing → 403', () => {
    expect(mapped('42501', 'archive rejected: recorded by the acting principal')).toMatchObject({ status: 403, message: expect.stringMatching(/^archive rejected/) });
    expect(mapped('42501', 'archive refused: no executing archive action names manifest 01a0 as an executable item')).toMatchObject({ status: 403 });
    expect(mapped('42501', 'export rejected: recorded by the acting principal')).toMatchObject({ status: 403 });
    expect(mapped('42501', 'export rejected: approval 01a1 is not a live approval on the resolved scope of 01a0')).toMatchObject({ status: 403 });
    expect(mapped('42501', 'retention revocation rejected: recorded by the acting principal')).toMatchObject({ status: 403 });
  });
  it('absence → 404', () => {
    expect(mapped('23503', 'archive rejected: no such evidence manifest in this domain')).toMatchObject({ status: 404 });
    expect(mapped('23503', 'retention revocation rejected: 01a0 has no export package in this domain')).toMatchObject({ status: 404 });
  });
  it('the record\'s state → 409 (the archive port\'s digest refusal under its own SQLSTATE P0R02)', () => {
    expect(mapped('22023', 'archive refused: manifest 01a0 is tombstoned; there are no bytes to move')).toMatchObject({ status: 409 });
    expect(mapped('P0R02', 'archive refused: the digest verified on the archive copy (ab) is not the manifest\'s (cd)')).toMatchObject({ status: 409, message: expect.stringMatching(/the digest verified on the archive copy/) });
    expect(mapped('22023', 'export rejected: 01a0 is not an executing customer export')).toMatchObject({ status: 409 });
    expect(mapped('22023', 'retention revocation rejected: the package of 01a0 was revoked at 2026-09-13 12:00:00+00')).toMatchObject({ status: 409 });
    expect(mapped('22023', 'retention execution rejected (rights_changed): the rights of a source in the approved scope are no longer confirmed — 01a2@1 (withdrawn); the scope is resolved again')).toMatchObject({ status: 409, message: expect.stringMatching(/rights_changed/) });
    // The adversarial review's corrections: a tombstone since the approval (an archive or an export) and a reference created inside a deletion's approval window refuse at begin_execution with their own class.
    expect(mapped('22023', 'retention execution rejected (scope_changed): manifest(s) in the approved scope were tombstoned since the approval — 01a3; the scope is resolved again')).toMatchObject({ status: 409, message: expect.stringMatching(/scope_changed/) });
    expect(mapped('22023', 'retention execution rejected (references_changed): a live reference was created on the approved scope since it was resolved — manifest 01a3 ← review_case:01a4; the scope is resolved again')).toMatchObject({ status: 409, message: expect.stringMatching(/references_changed/) });
  });
  it('a schedule that could only open unresolvable actions is refused at declaration → 422', () => {
    expect(mapped('22023', 'retention schedule rejected: a customer_export schedule names its classification_ceiling (public, internal, confidential, restricted)')).toMatchObject({ status: 422 });
    expect(mapped('22023', 'retention schedule rejected: a schedule selects by retention profile and source; a chosen object set (manifest_ids) or a single manifest is an action\'s selector')).toMatchObject({ status: 422 });
  });
  it('the caller\'s request → 422', () => {
    expect(mapped('22023', 'export rejected: the manifest and package digests are sha-256 hex')).toMatchObject({ status: 422 });
    expect(mapped('22023', 'export rejected: the signature block binds the package digest to this action, its resolved scope and the live approval')).toMatchObject({ status: 422 });
    expect(mapped('22023', 'export rejected: the package lists 3 object(s); the approved scope executes 2')).toMatchObject({ status: 422 });
    expect(mapped('22023', 'retention revocation rejected: a reason of 8+ characters')).toMatchObject({ status: 422 });
    expect(mapped('22023', 'retention action rejected: a chosen object set (manifest_ids) is an archive\'s or a customer export\'s selector')).toMatchObject({ status: 422 });
    expect(mapped('22023', 'retention action rejected: a customer export names its classification ceiling (public, internal, confidential, restricted)')).toMatchObject({ status: 422 });
  });
});
