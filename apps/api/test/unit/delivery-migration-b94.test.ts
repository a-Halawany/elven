/**
 * B94 §MG — the PURE half of governed migration: the legacy CSV read (RFC 4180, the closed transforms, formula-risk cells recorded and never
 * evaluated, the row reasons), the CSV-only refusal of a workbook, automation's suggestions (never approved), the mapping's validation, the
 * replay of a wave from its ledger, and the viewer's advisory eligibility. Every row is SYNTHETIC.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { LegacyFormatError, applyTransforms, detectWorkbook, isFormulaRisk, parseCsv, parseLegacy, specProblems, suggestMapping, type MappingSpec } from '../../src/delivery/migration/legacy.js';
import { replayWave } from '../../src/delivery/migration/replay.js';
import { viewerEligibility } from '../../src/delivery/migration/migration.service.js';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';

const FIX = resolve(__dirname, '../../../../fixtures/phase7');
const SPEC: MappingSpec = { key_column: 'Supplier No', columns: [
  { column: 'Supplier No', field: 'legacy_id', transforms: ['trim', 'upper'], ignore: false },
  { column: 'Supplier Name', field: 'name', transforms: ['trim', 'collapse_spaces'], ignore: false },
  { column: 'Country', field: 'country', transforms: ['iso_country'], ignore: false },
  { column: 'Risk Rating', field: 'risk_rating', transforms: ['rating_scale'], ignore: false },
  { column: 'Category', field: 'risk_category', transforms: ['trim', 'lower', 'null_if_blank'], ignore: false },
  { column: 'Annual Spend (EUR)', field: 'annual_spend_eur', transforms: ['null_if_blank', 'decimal'], ignore: false },
  { column: 'Last Review', field: 'last_review_on', transforms: ['null_if_blank', 'date_iso'], ignore: false },
] };

describe('the CSV read (RFC 4180)', () => {
  it('quoted fields, doubled quotes, CRLF and LF, a quoted line break, a BOM, a trailing blank line', () => {
    const r = parseCsv('﻿a,b\r\n"x, y","say ""hi"""\n"multi\nline",2\n\n');
    expect(r).toEqual([{ line: 1, cells: ['a', 'b'] }, { line: 2, cells: ['x, y', 'say "hi"'] }, { line: 3, cells: ['multi\nline', '2'] }]);
    expect(() => parseCsv('a,"open')).toThrow(LegacyFormatError);
  });
  it('the intake\'s formula rule: =, +, -, @ — but not a signed number', () => {
    expect(isFormulaRisk('=HYPERLINK("x","y")')).toBe(true);
    expect(isFormulaRisk('@SUM(A1)')).toBe(true);
    expect(isFormulaRisk('-5')).toBe(false); expect(isFormulaRisk('+49 30 123')).toBe(false); expect(isFormulaRisk('plain')).toBe(false);
  });
});

describe('the closed transforms', () => {
  it('each transforms deterministically, or answers bad_value by name', () => {
    expect(applyTransforms('  a  b ', ['collapse_spaces'])).toEqual({ ok: true, value: 'a b' });
    expect(applyTransforms(' pl ', ['iso_country'])).toEqual({ ok: true, value: 'PL' });
    expect(applyTransforms('Poland', ['iso_country'])).toEqual({ ok: false, transform: 'iso_country' });
    expect(applyTransforms('hoch', ['rating_scale'])).toEqual({ ok: true, value: 'high' });
    expect(applyTransforms('4', ['rating_scale'])).toEqual({ ok: true, value: 'critical' });
    expect(applyTransforms('severe', ['rating_scale'])).toEqual({ ok: false, transform: 'rating_scale' });
    expect(applyTransforms('1,250,000.50', ['decimal'])).toEqual({ ok: true, value: '1250000.50' });
    expect(applyTransforms('12k', ['decimal'])).toEqual({ ok: false, transform: 'decimal' });
    expect(applyTransforms('12.03.2026', ['date_iso'])).toEqual({ ok: true, value: '2026-03-12' });
    expect(applyTransforms('31.02.2026', ['date_iso'])).toEqual({ ok: false, transform: 'date_iso' });
    expect(applyTransforms('   ', ['null_if_blank', 'decimal'])).toEqual({ ok: true, value: null });
    expect(applyTransforms('x', ['geocode'])).toEqual({ ok: false, transform: 'geocode' });
  });
});

describe('the SYNTHETIC NORDWERK Polska register under mapping v1', () => {
  const legacy = readFileSync(join(FIX, 'nordwerk-polska-supplier-risk-legacy.csv'));
  const corrected = readFileSync(join(FIX, 'nordwerk-polska-supplier-risk-legacy-corrected.csv'));
  it('48 rows; the missing key and the formula cell are reasons; the formula cell is recorded (rNcM), never evaluated', () => {
    const p = parseLegacy(legacy, SPEC);
    expect(p.columns).toEqual(['Supplier No', 'Supplier Name', 'Country', 'Risk Rating', 'Category', 'Annual Spend (EUR)', 'Last Review', 'Buyer Note']);
    expect(p.rows).toHaveLength(48);
    const missing = p.rows.filter((r) => r.reasons.some((x) => x.startsWith('missing_key')));
    const formula = p.rows.filter((r) => r.reasons.some((x) => x.startsWith('formula_cell')));
    expect(missing).toHaveLength(1); expect(formula).toHaveLength(1);
    expect(formula[0]?.values['name']).toBeNull();
    expect(formula[0]?.formula_cells[0]).toMatch(/^r\d+c2$/);
    expect(p.formulaCellsRecorded.length).toBeGreaterThanOrEqual(1);
    expect(p.rows.filter((r) => r.reasons.length === 0)).toHaveLength(46);
    expect(p.rows.filter((r) => r.legacy_id === 'NWP-S-0700')).toHaveLength(2);   // the duplicate: the database classifies it ambiguous
    const row = p.rows.find((r) => r.legacy_id === 'NWP-S-1004');
    expect(row?.values).toEqual({ legacy_id: 'NWP-S-1004', name: 'Hydraulika Slask Sp. z o.o. (SYNTHETIC)', country: 'DE', risk_rating: 'critical', risk_category: 'hydraulics',
      annual_spend_eur: '172813.21', last_review_on: '2026-04-04' });
  });
  it('the corrected file: 48 rows, no reason, 48 distinct keys', () => {
    const p = parseLegacy(corrected, SPEC);
    expect(p.rows.every((r) => r.reasons.length === 0)).toBe(true);
    expect(new Set(p.rows.map((r) => r.legacy_id)).size).toBe(48);
  });
  it('the same bytes and mapping → the same parse (deterministic)', () => {
    expect(JSON.stringify(parseLegacy(legacy, SPEC))).toBe(JSON.stringify(parseLegacy(Buffer.from(legacy), SPEC)));
  });
});

describe('CSV only (Q5): a workbook or non-UTF-8 bytes are refused with the residual', () => {
  it('an xlsx (zip) or xls (OLE) container, or a spreadsheet media type', () => {
    expect(detectWorkbook(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]), null)).toBe('xlsx');
    expect(detectWorkbook(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), null)).toBe('xls');
    expect(detectWorkbook(Buffer.from('a,b'), 'application/vnd.ms-excel')).toBe('xls');
    expect(detectWorkbook(Buffer.from('a,b'), 'text/csv')).toBeNull();
    expect(() => parseLegacy(Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2]), SPEC)).toThrow(/xlsx workbook: B94 migrates CSV only .*residual: xlsx intake/);
    expect(() => parseLegacy(Buffer.from([0x61, 0xff, 0xfe, 0x2c]), SPEC)).toThrow(/not UTF-8/);
  });
});

describe('UX-66-004: suggestions are suggested, never approved', () => {
  it('the register\'s headers read as the canonical fields; the note column has no confident field', () => {
    const s = suggestMapping(['Supplier No', 'Supplier Name', 'Country', 'Risk Rating', 'Category', 'Annual Spend (EUR)', 'Last Review', 'Buyer Note']);
    expect(s.map((x) => x.field)).toEqual(['legacy_id', 'name', 'country', 'risk_rating', 'risk_category', 'annual_spend_eur', 'last_review_on', null]);
    expect(s.every((x) => x.suggested && !x.approved)).toBe(true);
    expect(suggestMapping(['Lieferanten-Nr', 'Land', 'Risikostufe']).map((x) => x.field)).toEqual(['legacy_id', 'country', 'risk_rating']);
  });
  it('the mapping validation mirrors the port\'s closed lists', () => {
    expect(specProblems(SPEC)).toEqual([]);
    expect(specProblems({ ...SPEC, key_column: 'Country' })).toContain('key_column is the column mapped to legacy_id');
    expect(specProblems({ ...SPEC, columns: [...SPEC.columns, { column: 'Buyer Note', field: 'name', transforms: [], ignore: false }] })).toContain('name is mapped from two columns');
    expect(specProblems({ ...SPEC, columns: [...SPEC.columns, { column: 'X', field: null, transforms: [], ignore: false }] })).toContain('column "X" maps to a field or is ignored');
  });
});

describe('the replay of a wave from its ledger alone', () => {
  const ev = (event: string, subject: string, version: number | null, details: Record<string, unknown> = {}) => ({ event, subject_id: subject, version, details });
  it('held by a failed reconciliation and an owner gap; released; approved, executed, verified, activated, accepted', () => {
    const r = replayWave([
      ev('wave.opened', 'w', 1), ev('mapping.proposed', 'w', 1), ev('mapping.approved', 'w', 1),
      ev('reconciliation.failed', 'r1', 1, { seq: 1, blocking: 5, mapping_state: 'approved', plan_digest: 'p1' }),
      ev('cutover.held', 'c1', 1, { wave_id: 'w' }),
    ]);
    expect(r).toMatchObject({ wave_state: 'rehearsing', wave_held: true, approved_mapping: 1, cutovers: { c1: { state: 'requested', held: true } } });
    const done = replayWave([
      ev('wave.opened', 'w', 1), ev('mapping.proposed', 'w', 1), ev('mapping.approved', 'w', 1),
      ev('reconciliation.failed', 'r1', 1, { seq: 1, blocking: 5 }), ev('cutover.held', 'c1', 1), ev('mapping.proposed', 'w', 2),
      ev('rehearsal.reconciled', 'r2', 2, { seq: 2, mapping_state: 'proposed' }), ev('cutover.superseded', 'c1', 1), ev('mapping.approved', 'w', 2),
      ev('rehearsal.reconciled', 'r3', 3, { seq: 3, mapping_state: 'approved' }), ev('cutover.held', 'c2', 1), ev('cutover.released', 'c2', 1),
      ev('cutover.approved', 'c2', 1), ev('cutover.executed', 'c2', 1), ev('cutover.reconciled', 'c2', 1), ev('domain.activated', 'd', null, { cutover_id: 'c2' }),
      ev('acceptance.withheld', 'a1', 1), ev('acceptance.recorded', 'a2', 1),
    ]);
    expect(done).toMatchObject({ wave_state: 'accepted', wave_held: false, approved_mapping: 2, mappings: { 1: 'superseded', 2: 'approved' }, domain_activated: true, acceptance: 'accepted',
      cutovers: { c1: { state: 'superseded', held: false }, c2: { state: 'activated', held: false } } });
    expect(done.rehearsals.map((x) => x.reconciled)).toEqual([false, true, true]);
  });
  it('a rollback reverts the activation', () => {
    const r = replayWave([ev('wave.opened', 'w', 1), ev('cutover.approved', 'c', 1), ev('cutover.executed', 'c', 1), ev('cutover.reconciled', 'c', 1),
      ev('domain.activated', 'd', null, { cutover_id: 'c' }), ev('rollback.rehearsed', 'b1', 1), ev('rollback.executed', 'b2', 1, { cutover_id: 'c', domain_reverted: true })]);
    expect(r).toMatchObject({ wave_state: 'rolled_back', domain_activated: false, cutovers: { c: { state: 'rolled_back' } } });
  });
});

describe('the advisory eligibility the workspace renders (the port re-checks)', () => {
  const p = (kind: 'human' | 'agent', roles: string[], id = 'me') => ({ principalId: id, kind, bindings: roles.map((roleCode) => ({ roleCode, scope: 'TENANT', tenantId: 't', domainId: null })) }) as unknown as AuthenticatedPrincipal;
  it('an authority may approve — not its own proposal; a lead never; an agent never', () => {
    expect(viewerEligibility(p('human', ['onboarding_authority']), { mapping: 'other', cutover: null, rollback: null, executor: null }).approve_mapping.eligible).toBe(true);
    expect(viewerEligibility(p('human', ['onboarding_authority']), { mapping: 'me', cutover: null, rollback: null, executor: null }).approve_mapping.reason).toMatch(/never approved by its proposer/);
    expect(viewerEligibility(p('human', ['onboarding_authority', 'implementation_lead']), { mapping: 'x', cutover: null, rollback: null, executor: null }).approve_mapping.reason).toMatch(/implementation lead never approves/);
    expect(viewerEligibility(p('agent', ['onboarding_authority']), { mapping: 'x', cutover: null, rollback: null, executor: null }).approve_cutover.reason).toMatch(/agent never approves/);
    expect(viewerEligibility(p('human', ['implementation_lead']), { mapping: null, cutover: null, rollback: null, executor: null }).operate.eligible).toBe(true);
  });
});
