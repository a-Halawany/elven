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
