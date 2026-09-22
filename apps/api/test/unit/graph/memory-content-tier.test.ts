/**
 * The memory CONTENT tier's failure classes at the function boundary (CP-6 B20; design §2.7; D9; N8): `isContentTierFailure`
 * names the STATEMENT-level failures of the canonical read that leave the connection alive — SQLSTATE class 53 (insufficient
 * resources), class 58 (system error), class XX (internal error), and the two exact codes 57014 (query_canceled — a statement
 * timeout) and 55P03 (lock_not_available) — and nothing else: a connection-class failure (08xxx; 57P01–57P03) kills the
 * transaction the metadata was read in and the request fails as before; an injected fault is told apart by its class, not by a
 * code; a port refusal (22023, 23503, 42501) or a plain Error is rethrown. The label the metadata-only answer carries is pinned
 * byte for byte (the harness P6(b) and the memory page read it). No database.
 */
import { describe, expect, it } from 'vitest';
import { InjectedFault } from '../../../src/observation/fault-injection.js';
import { MEMORY_CONTENT_UNAVAILABLE_LABEL, isContentTierFailure } from '../../../src/graph/memory/memory.service.js';

const pgError = (code: string, message = 'a pg error'): Error & { code: string } => Object.assign(new Error(message), { code });

describe('B20 · isContentTierFailure (D9, N8)', () => {
  it('the classes: 53 insufficient_resources, 58 system_error, XX internal_error — every member of each class', () => {
    for (const code of ['53000', '53100', '53200', '53300', '53400', '58000', '58030', '58P01', '58P02', 'XX000', 'XX001', 'XX002']) expect(isContentTierFailure(pgError(code)), code).toBe(true);
  });
  it('the two exact codes: 57014 query_canceled (a statement timeout) and 55P03 lock_not_available', () => {
    expect(isContentTierFailure(pgError('57014'))).toBe(true);
    expect(isContentTierFailure(pgError('55P03'))).toBe(true);
  });
  it('NOT a connection-class failure: 08xxx and 57P01–57P03 kill the transaction the metadata was read in — the request fails as before', () => {
    for (const code of ['08000', '08003', '08006', '08001', '08004', '57P01', '57P02', '57P03']) expect(isContentTierFailure(pgError(code)), code).toBe(false);
  });
  it('NOT the other members of class 55 or 57 (55000 object_not_in_prerequisite_state, 55006 object_in_use, 57000 operator_intervention, 57P04): only the two exact codes count', () => {
    for (const code of ['55000', '55006', '55P02', '55P04', '57000', '57P04', '57P05']) expect(isContentTierFailure(pgError(code)), code).toBe(false);
  });
  it('NOT a port refusal or a constraint (22023, 23503, 23505, 42501, P0B20), nor an error without a code, a plain Error, null, undefined or a string', () => {
    for (const code of ['22023', '23503', '23505', '42501', 'P0B20', '40P01', '40001']) expect(isContentTierFailure(pgError(code)), code).toBe(false);
    expect(isContentTierFailure(new Error('no code'))).toBe(false);
    expect(isContentTierFailure({ code: 53000 })).toBe(false);   // a numeric code is not a SQLSTATE
    expect(isContentTierFailure(null)).toBe(false);
    expect(isContentTierFailure(undefined)).toBe(false);
    expect(isContentTierFailure('53000')).toBe(false);
  });
  it('an injected fault is not a content-tier failure by code (it carries none): the retrieval tells it apart by its class', () => {
    const f = new InjectedFault('b20.memory_content_unavailable');
    expect(isContentTierFailure(f)).toBe(false);
    expect(f.injected).toBe(true);
    expect(f.message).toBe('injected fault at b20.memory_content_unavailable');
  });
  it('the metadata-only label is the design\'s, byte for byte', () => {
    expect(MEMORY_CONTENT_UNAVAILABLE_LABEL).toBe('the content tier did not answer; this is the item\'s metadata (its state, versions and audience) — the statement is not served; retry or contact the operator');
  });
});
