/**
 * B107 §DR — the pure logic of data governance and ownership (ownership-logic.ts): the SLA and reviewers by consequence, the escalation's
 * consequence, the review rule, the transfer checklist, distinguishability, the owned-contract lint, the CSV reader and the DAT reader (over
 * the real audit/requirements/v07.csv, READ only — its bytes are checked unchanged). Construction evidence only (SYNTHETIC values).
 */
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CASE_KINDS, DAT_GROUPS, DAT_REALIZATIONS, SLA_DAYS, TRANSFER_ITEMS, checklistProblems, dueAt, escalatedConsequence, lintOwnedRoutes, normalisePath, parseCsv, parseDatRows,
  reviewRule, reviewersRequired, sharedConcerns } from '../../src/governance/ownership/ownership-logic.js';

describe('B107 §DR · the SLA, the reviewers and the escalation by consequence', () => {
  it('the higher the consequence, the shorter the window and (C3, C4) two distinct reviewers', () => {
    expect(SLA_DAYS).toEqual({ C0: 30, C1: 14, C2: 5, C3: 2, C4: 1 });
    expect(['C0', 'C1', 'C2', 'C3', 'C4'].map((c) => reviewersRequired(c as never))).toEqual([1, 1, 1, 2, 2]);
    expect(dueAt('2026-10-15T00:00:00.000Z', 'C3')).toBe('2026-10-17T00:00:00.000Z');
  });
  it('an escalation raises the consequence one level per escalation, capped at C4', () => {
    expect(escalatedConsequence('C1', 0)).toBe('C1');
    expect(escalatedConsequence('C1', 2)).toBe('C3');
    expect(escalatedConsequence('C3', 5)).toBe('C4');
    expect(escalatedConsequence('C2', -1)).toBe('C2');
  });
  it('the review rule: the privacy officer reviews access and classification; the owner is excluded from access and exception cases', () => {
    expect(CASE_KINDS).toHaveLength(8);
    expect(reviewRule('access')).toEqual({ roles: ['data_steward', 'domain_admin', 'privacy_officer'], ownerExcluded: true });
    expect(reviewRule('classification')).toEqual({ roles: ['data_steward', 'domain_admin', 'privacy_officer'], ownerExcluded: false });
    expect(reviewRule('data_exception')).toEqual({ roles: ['data_steward', 'domain_admin'], ownerExcluded: true });
    expect(reviewRule('quality')).toEqual({ roles: ['data_steward', 'domain_admin'], ownerExcluded: false });
  });
});

describe('B107 §DR · the transfer checklist (ES-11-005) and distinguishability (ES-04-002)', () => {
  const full = () => Object.fromEntries(TRANSFER_ITEMS.map((k) => [k, { ref: `handover/${k}.md` }]));
  it('all nine items with a reference: no problem; each missing, unreferenced or unknown item named', () => {
    expect(TRANSFER_ITEMS).toEqual(['code', 'state', 'contracts', 'dashboards', 'alerts', 'runbooks', 'risks', 'exceptions', 'incidents']);
    expect(checklistProblems(full())).toEqual([]);
    const c: Record<string, unknown> = full(); delete c['incidents']; c['risks'] = { ref: 'x' }; c['slides'] = { ref: 'deck.pdf' };
    expect(checklistProblems(c)).toEqual(['risks: no reference', 'incidents: missing', 'slides: not a checklist item']);
    expect(checklistProblems([])).toEqual(['the checklist is an object of the nine items']);
  });
  const shape = (over: Record<string, unknown> = {}) => ({ component: 'A', units: ['apps/api'], contracts: ['/v1/a'], stateStores: ['s.a'], policyDecisions: ['a.read'], telemetryNamespace: 'eye.a', failureDomain: 'fd-a', ...over });
  it('no shared unit: nothing to distinguish; a shared unit with distinct concerns: distinguishable; overlaps named', () => {
    expect(sharedConcerns(shape(), shape({ units: ['apps/web'], telemetryNamespace: 'eye.a' }))).toEqual([]);
    expect(sharedConcerns(shape(), shape({ component: 'B', contracts: ['/v1/b'], stateStores: ['s.b'], policyDecisions: [], telemetryNamespace: 'eye.b', failureDomain: 'fd-b' }))).toEqual([]);
    expect(sharedConcerns(shape(), shape({ component: 'B', contracts: ['/v1/a'], stateStores: ['s.a', 's.b'] })))
      .toEqual(['state stores s.a', 'contracts /v1/a', 'policy decisions a.read', 'the telemetry namespace eye.a', 'the failure domain fd-a']);
  });
});

describe('B107 §DR · the owned-contract lint (ES-11-002)', () => {
  const routes = [{ method: 'post', path: '/v1/governance/ownership/read' }, { method: 'POST', path: 'v1/governance/ownership/transfers/:id/decide/' },
    { method: 'GET', path: '/health' }, { method: 'POST', path: '/v1/governance/ownershipx' }, { method: 'POST', path: '/v1/shared/x' }];
  it('covered, unowned (a convenience endpoint outside every owner\'s contract) and ambiguous routes; interface ids name no route; deterministic', () => {
    const r = lintOwnedRoutes(routes, [{ component: 'C04', contracts: ['/v1/governance/ownership', 'IF-GOV-01'] }, { component: 'C09', contracts: ['/v1/shared'] }, { component: 'C10', contracts: ['/v1/shared/'] }]);
    expect(r.routes).toBe(5); expect(r.prefixes).toBe(3);
    expect(r.covered).toEqual([{ method: 'POST', path: '/v1/governance/ownership/read', component: 'C04' }, { method: 'POST', path: '/v1/governance/ownership/transfers/:id/decide', component: 'C04' }]);
    expect(r.unowned).toEqual([{ method: 'GET', path: '/health' }, { method: 'POST', path: '/v1/governance/ownershipx' }]);
    expect(r.ambiguous).toEqual([{ method: 'POST', path: '/v1/shared/x', components: ['C09', 'C10'] }]);
    expect(lintOwnedRoutes([...routes].reverse(), [{ component: 'C04', contracts: ['/v1/governance/ownership'] }])).toEqual(lintOwnedRoutes(routes, [{ component: 'C04', contracts: ['/v1/governance/ownership'] }]));
  });
  it('the path normalisation', () => {
    expect(normalisePath('//v1//a/')).toBe('/v1/a');
    expect(normalisePath('')).toBe('/');
  });
});

describe('B107 §DR · the readers (read only)', () => {
  it('RFC 4180: quoted fields, doubled quotes, embedded commas and newlines, CRLF', () => {
    expect(parseCsv('a,b\r\n"x, y","he said ""hi"""\n"multi\nline",z')).toEqual([['a', 'b'], ['x, y', 'he said "hi"'], ['multi\nline', 'z']]);
    expect(parseCsv('a,b\n')).toEqual([['a', 'b']]);
  });
  it('the DAT rows: split by their group\'s class and layer; an unknown group kept whole', () => {
    const csv = 'id,volume,clause,impl_status\nDAT-GV-04,V7,"Authority and Governance Data ownership service Registry / control Governance domain Resolve owner, steward, and escalation state.",missing\n'
      + 'DAT-ZZ-01,V7,Something else entirely,partial\nPR-01-001,V8,not a DAT row,missing\n';
    expect(parseDatRows(csv)).toEqual([
      { key: 'DAT-GV-04', group: 'Authority and Governance', name: 'Data ownership service', authorityClass: 'Registry / control', layer: 'Governance domain', purpose: 'Resolve owner, steward, and escalation state.', status: 'missing', row: 2 },
      { key: 'DAT-ZZ-01', group: 'unknown', name: 'Something else entirely', authorityClass: 'unknown', layer: 'unknown', purpose: '', status: 'partial', row: 3 },
    ]);
    expect(() => parseDatRows('a,b\n1,2\n')).toThrow(/no id or clause column/);
  });
  it('the real v07.csv: 104 DAT rows across the nine groups, every one split; the file\'s bytes unchanged by the read', () => {
    let dir = process.cwd(); let file = '';
    for (let i = 0; i < 6 && file === ''; i++) { const f = join(dir, 'audit', 'requirements', 'v07.csv'); if (existsSync(f)) file = f; else dir = join(dir, '..'); }
    expect(file).not.toBe('');
    const before = createHash('sha256').update(readFileSync(file)).digest('hex');
    const rows = parseDatRows(readFileSync(file, 'utf8'));
    expect(rows).toHaveLength(104);
    expect(new Set(rows.map((r) => r.key.slice(4, 6)))).toEqual(new Set(Object.keys(DAT_GROUPS)));
    expect(rows.every((r) => r.group !== 'unknown' && r.purpose.length > 0 && r.name.length > 2)).toBe(true);
    expect(rows.find((r) => r.key === 'DAT-GV-01')).toMatchObject({ name: 'Data authority registry', layer: 'Governance domain', authorityClass: 'Registry / control' });
    for (const k of Object.keys(DAT_REALIZATIONS)) expect(rows.some((r) => r.key === k)).toBe(true);
    expect(createHash('sha256').update(readFileSync(file)).digest('hex')).toBe(before);
  });
});
