/**
 * CP-6 B36 · part H — the executive home's pure logic (0094 §H): the intakes of the switcher, the cadence, the subject room, the agenda,
 * the escalation, the search and the metrics window (each a 422 naming the field); the switcher's staleness rule in words; the tick
 * step's identity (room-deadlines, order 58); and every refusal text of the §H families run through the observation mapper (the class
 * form: actor / separation_of_duties / role → 403, unknown_* → 404, state / stale → 409, the rest → 422) — no §H text is caught by an
 * earlier unanchored row, and no earlier family's text is caught by a §H row.
 */
import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { HomeService, ROOM_DEADLINES_STEP, staleContextReason, validateAgenda, validateContext, validateEscalate, validatePeriod, validateSearch, validateSubjectRoom, validateWindow } from '../../src/executive/home/home.service.js';
import { AttentionTickRegistry } from '../../src/executive/attention/tick.js';

const ID = '0190b1c2-d3e4-7000-8000-000000000001';
const status = (f: () => unknown): number | string => { try { f(); return 'ok'; } catch (e) { return e instanceof HttpException ? e.getStatus() : String(e); } };
const message = (f: () => unknown): string => { try { f(); return ''; } catch (e) { return e instanceof HttpException ? String((e.getResponse() as { message?: string }).message ?? '') : String(e); } };
const mapped = (text: string, code = '22023') => { const e = asObservationRefusal({ code, message: text }, 'unit'); return e === null ? null : { status: e.getStatus(), message: String((e.getResponse() as { message?: string }).message) }; };

describe('the intakes (422 naming the field; the port decides the rest)', () => {
  it('the context: the horizon and the ceiling from the prelude\'s vocabularies, the ids as ids, the instant as an instant', () => {
    expect(validateContext({ objectiveId: ID, horizon: '30d', scenarioId: null, classification: 'internal', effectiveAt: '2026-09-30T08:00:00Z' }, 'c')).toEqual({ objectiveId: ID, horizon: '30d', scenarioId: null, classification: 'internal', effectiveAt: '2026-09-30T08:00:00.000Z' });
    expect(validateContext({}, 'c')).toEqual({ objectiveId: null, horizon: '90d', scenarioId: null, classification: 'internal', effectiveAt: null });
    expect(status(() => validateContext({ horizon: '7d' }, 'c'))).toBe(422);
    expect(message(() => validateContext({ classification: 'secret' }, 'c'))).toBe('classification is one of public, internal, confidential, restricted');
    expect(message(() => validateContext({ objectiveId: 'not-an-id' }, 'c'))).toBe('objectiveId must be an id');
    expect(message(() => validateContext({ effectiveAt: 'yesterday' }, 'c'))).toBe('effectiveAt must be an instant');
  });
  it('the staleness rule: only an active objective / scenario may be set; an unknown one is left to the port', () => {
    expect(staleContextReason('objective', ID, 'active')).toBeNull();
    expect(staleContextReason('objective', ID, 'closed')).toBe(`context rejected (stale): objective ${ID} is closed; a stale objective cannot be set`);
    expect(staleContextReason('scenario', ID, 'closed')).toBe(`context rejected (stale): scenario ${ID} is closed; a stale scenario cannot be set`);
    expect(staleContextReason('scenario', ID, null)).toBeNull();
  });
  it('the cadence period, the subject room, the agenda, the escalation, the search, the window', () => {
    expect(validatePeriod({}, 'c')).toBe('weekly');
    expect(status(() => validatePeriod({ period: 'daily' }, 'c'))).toBe(422);
    const room = validateSubjectRoom({ kind: 'scenario', subjectId: ID, title: ' Corridor room ', deadline: '2030-01-01T00:00:00Z', reviewEveryDays: 3 }, 'c');
    expect(room).toEqual({ kind: 'scenario', subjectId: ID, title: 'Corridor room', deadline: '2030-01-01T00:00:00.000Z', reviewEveryDays: 3 });
    expect(message(() => validateSubjectRoom({ kind: 'decision', subjectId: ID, title: 'x', deadline: '2030-01-01T00:00:00Z' }, 'c'))).toBe('kind is one of scenario, objective_review');
    expect(message(() => validateSubjectRoom({ kind: 'scenario', subjectId: ID, title: 'ok', deadline: '' }, 'c'))).toBe('deadline is the instant the room must have reviewed by');
    expect(message(() => validateSubjectRoom({ kind: 'scenario', subjectId: ID, title: 'ok', deadline: '2030-01-01T00:00:00Z', reviewEveryDays: 0 }, 'c'))).toBe('reviewEveryDays is an integer between 1 and 365');
    expect(validateAgenda({ cadenceId: ID, items: [{ kind: 'room', id: ID, note: ' first ' }, { kind: 'package', id: ID }] }, 'c')).toEqual({ cadenceId: ID, items: [{ kind: 'room', id: ID, note: 'first' }, { kind: 'package', id: ID, note: null }] });
    expect(message(() => validateAgenda({ cadenceId: ID, items: [{ kind: 'nonsense', id: ID }] }, 'c'))).toBe('items[0].kind is one of attention_item, room, package, commitment_item, review, warning, briefing');
    expect(message(() => validateAgenda({ cadenceId: ID, items: [{ kind: 'room', id: 'x' }] }, 'c'))).toBe("items[0].id is the object's id");
    expect(message(() => validateAgenda({ cadenceId: ID, items: new Array(51).fill({ kind: 'room', id: ID }) }, 'c'))).toBe('items is a list of at most 50 agenda items');
    expect(validateEscalate({ cadenceId: ID, subjectKind: 'cadence', subjectId: ID, reason: ' nobody reviewed it ', to: ID }, 'c')).toEqual({ cadenceId: ID, subjectKind: 'cadence', subjectId: ID, reason: 'nobody reviewed it', to: ID });
    expect(message(() => validateEscalate({ cadenceId: ID, subjectKind: 'room', subjectId: ID, reason: 'short', to: ID }, 'c'))).toBe('reason states the gap (8–2000 characters)');
    expect(validateSearch({ q: '  Regensburg ', limit: 500 }, 'c')).toEqual({ q: 'Regensburg', limit: 100 });
    expect(message(() => validateSearch({ q: 'R' }, 'c'))).toBe('q is 2–200 characters');
    const w = validateWindow({}, '2026-09-30T08:00:00.000Z', 'c');
    expect(w).toEqual({ from: '2026-07-02T08:00:00.000Z', to: '2026-09-30T08:00:00.000Z' });
    expect(message(() => validateWindow({ from: '2026-09-30T09:00:00Z', to: '2026-09-30T08:00:00Z' }, '2026-09-30T08:00:00.000Z', 'c'))).toBe('from is before to');
  });
  it('the tick step registers as room-deadlines at order 58 (after strategy-detections 50 and plan-variance 55, before briefing-expiry 60)', () => {
    const registry = new AttentionTickRegistry();
    const s = new HomeService(registry);
    s.onModuleInit();
    expect(s.name).toBe(ROOM_DEADLINES_STEP); expect(s.order).toBe(58);
    expect(registry.steps().map((x) => x.name)).toEqual(['room-deadlines']);
    expect(() => s.onModuleInit()).toThrow(/registered twice/);
  });
});

describe('the refusal families of 0094 §H through the observation mapper', () => {
  const cases: Array<[string, number]> = [
    ['cadence rejected (actor): opened by the acting principal', 403], ['cadence rejected (state): a weekly cadence is already open (x); reset it to open the next', 409],
    ['cadence rejected (period): a cadence is weekly, monthly or quarterly (daily)', 422], ['cadence rejected (reason): the confirmation states its reason (8+ characters)', 422],
    ['executive room rejected (actor): a room is opened by the acting principal', 403], ['executive room rejected (kind): a subject room is a scenario room or an objective review (x)', 422],
    ['executive room rejected (deadline): the deadline is after now and within a year', 422], ['executive room rejected (unknown_subject): no scenario x in this domain', 404],
    ['executive room rejected (state): a scenario room on x is already open with a deadline still ahead', 409],
    ['objective review rejected (separation_of_duties): the owner of objective x opens no review of it; another person reviews it', 403],
    ['agenda rejected (actor): set by the acting principal', 403], ['agenda rejected (unknown_cadence): no cadence x in this domain', 404], ['agenda rejected (unknown_object): item 1 — no room x in this domain', 404],
    ['agenda rejected (state): cadence x is closed (sequence 1); the agenda belongs to the open cycle', 409], ['agenda rejected (items): the agenda is a list of at most 50 items', 422],
    ['escalation rejected (actor): raised by the acting principal', 403], ['escalation rejected (unknown_escalation): no escalation x in this domain', 404], ['escalation rejected (state): escalation x is already answered', 409],
    ['escalation rejected (recipient): a gap is escalated to another active human holding executive or decision_authority in this domain', 422], ['escalation rejected (reason): an escalation states the gap in 8–2000 characters', 422],
    ['search rejected (actor): searched by the acting principal', 403], ['search rejected (query): a query is 2–200 characters', 422],
    ['command view rejected (role): the view executive/morning is the executive\'s; the reader holds no such role in this domain', 403], ['command view rejected (unknown_view): no command view x', 404],
    ['context rejected (actor): set by the acting principal', 403], ['context rejected (stale): objective x is not a live strategy object of this domain', 409],
  ];
  it.each(cases)('%s → %i, the text passed through', (text, expected) => {
    const m = mapped(text, expected === 403 ? '42501' : expected === 404 ? '23503' : '22023');
    expect(m, text).not.toBeNull();
    expect(m!.status, text).toBe(expected);
    expect(m!.message).toBe(text);
  });
  it('an earlier family is not caught by the §H rows: the decision room\'s unclassed text, the memory and warning contexts, B23\'s review convening', () => {
    expect(mapped('room rejected: no such package in this domain', '23503')?.message ?? 'unmapped').not.toMatch(/^executive room/);
    expect(mapped('memory context rejected: x')?.status).toBe(422);
    expect(mapped('warning context rejected (stale_version): x')?.status).toBe(409);
    expect(mapped('review convening rejected (stale_version): x')?.status).toBe(409);
    expect(mapped('review convening rejected: convened by the acting principal', '42501')?.status).toBe(403);
  });
});
