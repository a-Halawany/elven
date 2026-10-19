/**
 * CP-6 B50 §HD (0120 §HD; F-P3-01) — THE SHARED HEADER BUILDER, unit: what a new version carries (declared absences, freshness at write,
 * ontology:none, the quality profile, provenance none:<reason>), the verbatim mode (the import), inheritance, stated time values, the
 * row round trip; and THE RATCHET: no object literal outside header-builder.ts names `owning_component` or `audit_correlation_id`, and
 * none is typed or asserted `CanonicalHeader` — every writer reaches the 43-field header through buildHeader. The allowlist is EMPTY and
 * only shrinks (B81's Field-fork precedent). Every value here is SYNTHETIC.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { CANONICAL_HEADER_FIELDS, HEADER_TIME_PRECISIONS, canonicalHeaderDigest, headerInstantOf, timeValueProblems, validateHeader, type TimeValue } from '@eye/contracts';
import {
  B50_STATED_FIELDS, HEADER_PROFILES, HeaderBuildError, buildHeader, defaultAbsence, freshnessAtWrite, isDeclaredAbsence, knownLimitations, profileRow, qualityProfileOf,
  rebuildHeaderFromRow, timeDeclaration, type HeaderSpec,
} from '../../src/objects/header-builder.js';
import { TIME_PRECISIONS, USE_KINDS } from '../../src/objects/b50-seams.js';

const T = '01900000-0000-7000-8000-000000000001'; const D = '01900000-0000-7000-8000-000000000002';
const base = (over: Partial<HeaderSpec> = {}): HeaderSpec => ({
  objectId: '01900000-0000-7000-8000-0000000000aa', objectType: 'EVD', tenantId: T, domainId: D, scope: 'DOMAIN', objectVersion: 1, lifecycleState: 'admitted',
  owningComponent: 'CP-OBS-01', accountableOwner: 'principal:synthetic', sourceObjectIds: ['OBS:01900000-0000-7000-8000-0000000000bb'],
  eventTime: '2026-08-21T08:00:00.000Z', observationTime: '2026-10-19T10:00:00.000Z', recordedAt: '2026-10-19T10:00:00.000Z',
  truthState: 'observed', syntheticState: true, evidenceRefs: ['blob:x'], methodRef: 'synthetic@1', classification: 'internal', purposeScope: 'observation',
  schemaRef: 'EVD@v1', auditCorrelationId: '01900000-0000-7000-8000-0000000000cc', contentRef: 'vault:evidence/x', ...over,
});

describe('§HD builder · what a new version carries', () => {
  it('a complete, valid 43-field header; no absence-bearing field is a bare null', () => {
    const h = buildHeader(base());
    expect(Object.keys(h).sort()).toEqual([...CANONICAL_HEADER_FIELDS].sort());
    expect(validateHeader(h)).toEqual({ ok: true });
    for (const f of B50_STATED_FIELDS) expect(h[f], f).not.toBeNull();
    expect(h.confidence).toEqual({ state: 'not_applicable', reason: 'an observation records what was received; confidence attaches to the claims extracted from it' });
    expect(isDeclaredAbsence(h.uncertainty)).toBe(true);
    expect(h.quality_state).toMatchObject({ state: 'not_assessed' });
    expect(h.freshness_state).toEqual({ state: 'assessed', method: 'header-age@1', basis: 'event_time', at: '2026-08-21T08:00:00.000Z', as_of: '2026-10-19T10:00:00.000Z', age_seconds: 5104800 });
    expect(h.ontology_ref).toBe('ontology:none');
    expect(h.quality_profile).toBe('quality:EVD@1');
    expect(h.provenance_ref).toMatch(/^none:the provenance of this version is its references/);
  });
  it('the writer\'s values are kept; the control profiles are carried exactly as stated (a null stays null)', () => {
    const h = buildHeader(base({ confidence: { value: 0.7 }, provenanceRef: 'SRC:a@1', rightsProfile: 'internal', residencyProfile: null, qualityState: { validation: 'passed' } }));
    expect(h.confidence).toEqual({ value: 0.7 });
    expect(h.provenance_ref).toBe('SRC:a@1');
    expect(h.rights_profile).toBe('internal');
    expect(h.residency_profile).toBeNull();
    expect(h.retention_profile).toBeNull();
    expect(h.access_policy_ref).toBeNull();
    expect(h.quality_state).toEqual({ validation: 'passed' });
  });
  it('the type profile and the rules name the reason: a forecast, a decision, a synthetic run, a withdrawn version, an unassessed claim', () => {
    expect(buildHeader(base({ objectType: 'FCT', truthState: 'inferred', schemaRef: 'FCT@v2', uncertainty: { q10: 1, q50: 2, q90: 3 } })).confidence)
      .toEqual({ state: 'not_applicable', reason: 'a quantile forecast states its uncertainty (q10 / q50 / q90), not a confidence' });
    expect(defaultAbsence('confidence', { object_type: 'DEC', truth_state: 'decided', owning_component: 'CP-GRA-01' }).state).toBe('not_applicable');
    expect(defaultAbsence('uncertainty', { object_type: 'SIM', truth_state: 'synthetic', owning_component: 'CP-SIM-01' }).state).toBe('not_applicable');
    expect(defaultAbsence('confidence', { object_type: 'CLM', truth_state: 'withdrawn', owning_component: 'CP-INT-01' }).reason).toMatch(/withdrawn version/);
    expect(defaultAbsence('confidence', { object_type: 'CLM', truth_state: 'extracted', owning_component: 'CP-INT-01' }))
      .toEqual({ state: 'not_assessed', reason: 'CP-INT-01 does not assess confidence for CLM' });
  });
  it('the writer\'s own absence reasons win and are checked', () => {
    const h = buildHeader(base({ objectType: 'CLM', truthState: 'extracted', schemaRef: 'CLM@v2' }), { absent: { uncertainty: { state: 'unknown', reason: 'the extraction method states no interval' } } });
    expect(h.uncertainty).toEqual({ state: 'unknown', reason: 'the extraction method states no interval' });
    expect(() => buildHeader(base(), { absent: { confidence: { state: 'not_assessed', reason: 'no' } } })).toThrow(HeaderBuildError);
  });
  it('freshness at write: none without an event or observation time; a future event time states why it has no age', () => {
    expect(freshnessAtWrite({ object_type: 'PLN', event_time: null, observation_time: null, recorded_at: '2026-10-19T10:00:00.000Z' })).toMatchObject({ state: 'not_applicable' });
    expect(freshnessAtWrite({ object_type: 'FCT', event_time: '2027-01-01T00:00:00.000Z', observation_time: null, recorded_at: '2026-10-19T10:00:00.000Z' }))
      .toMatchObject({ state: 'not_applicable', reason: expect.stringMatching(/future time/) });
  });
  it('the trust envelope\'s known limitations ride on a stated quality absence (V00-T-076)', () => {
    const h = buildHeader(base({ sourceClockQuality: 'unknown', timePrecision: 'day' }));
    expect((h.quality_state as Record<string, unknown>)['limitations']).toEqual(['synthetic content — not a real-world record', 'the source clock is unknown', 'its time is stated to day precision']);
    expect(knownLimitations({ synthetic_state: false, source_clock_quality: 'trusted', time_precision: 'exact', event_time: null, truth_state: 'extracted' }))
      .toEqual(['no event time is stated', 'extracted, not reviewed by a person']);
  });
  it('verbatim (the import): every field exactly as given, nulls included', () => {
    const h = buildHeader(base({ confidence: null, ontologyRef: null, provenanceRef: null }), { mode: 'verbatim' });
    expect([h.confidence, h.uncertainty, h.quality_state, h.freshness_state, h.ontology_ref, h.quality_profile, h.provenance_ref]).toEqual([null, null, null, null, null, null, null]);
  });
  it('inheritance (source contract → evidence → parent) fills only what the writer left undefined', () => {
    const spec = base(); delete spec.rightsProfile; delete spec.residencyProfile; delete spec.retentionProfile;
    const h = buildHeader({ ...spec, retentionProfile: null }, { inherit: { sourceContract: { rights_profile: 'licence-a' }, evidence: [{ residency_profile: 'EU' }, { residency_profile: 'DE' }], parent: { retention_profile: '24 months' } } });
    expect(h.rights_profile).toBe('licence-a');
    expect(h.residency_profile).toBe('DE; EU');
    expect(h.retention_profile).toBeNull();   // an explicit null is the writer's statement
    expect(buildHeader(spec, { inherit: { parent: { retention_profile: '24 months' } } }).retention_profile).toBe('24 months');
  });
  it('the digest is the contracts\' rule over the built header (no field added); the row round trip rebuilds it exactly', () => {
    const h = buildHeader(base()); const payload = { x: 1 };
    const row: Record<string, unknown> = { ...h, object_version: 1, recorded_at: new Date(h.recorded_at), event_time: new Date(h.event_time as string) };
    expect(canonicalHeaderDigest(rebuildHeaderFromRow(row), payload)).toBe(canonicalHeaderDigest(h, payload));
  });
});

describe('§HD builder · stated time (ES-26-001/-004)', () => {
  const lateAugust: TimeValue = { kind: 'bounded', earliest: '2026-08-21T00:00:00+02:00', latest: '2026-09-01T00:00:00+02:00', precision: 'part_of_month', zone: 'Europe/Berlin', source: 'publisher text' };
  it('a bounded time places its lower bound and its precision on the header; the declaration carries the value whole', () => {
    const spec = base(); delete spec.eventTime;
    const h = buildHeader(spec, { time: { event: lateAugust } });
    expect(h.event_time).toBe('2026-08-20T22:00:00.000Z');
    expect(h.time_precision).toBe('part_of_month');
    expect(timeDeclaration({ event: lateAugust })).toEqual({ time: [{ axis: 'event', ...lateAugust }] });
  });
  it('a header instant that disagrees with the stated value is refused — never a false instant', () => {
    expect(() => buildHeader(base({ eventTime: '2026-08-25T00:00:00.000Z' }), { time: { event: lateAugust } })).toThrow(/is not the stated value's instant/);
  });
  it('unknown, recurring and conflicting times place no instant', () => {
    const spec = base(); delete spec.eventTime;
    expect(buildHeader(spec, { time: { event: { kind: 'unknown', precision: 'unknown', zone: null, source: 'operator' } } }).event_time).toBeNull();
    expect(headerInstantOf({ kind: 'recurring', rule: 'FREQ=WEEKLY;BYDAY=MO', precision: 'day', zone: 'Europe/Berlin', source: 'publisher text' }).instant).toBeNull();
    expect(headerInstantOf({ kind: 'conflicting', conflicts: [{ ref: 'EVD:a', value: '2026-08-21' }, { ref: 'EVD:b', value: '2026-08-28' }], precision: 'day', zone: null, source: 'two publishers' }).instant).toBeNull();
  });
  it('a malformed time value is refused with its problems', () => {
    expect(timeValueProblems({ kind: 'bounded', earliest: '2026-09-01T00:00:00Z', latest: '2026-08-21T00:00:00Z', precision: 'exact', zone: 'not a zone', source: 'x' }))
      .toEqual(expect.arrayContaining(['zone is an IANA zone name or null', "a bounded time's latest is after its earliest", 'a bounded time is not of exact precision']));
    expect(() => buildHeader(base(), { time: { event: { kind: 'exact', precision: 'exact', zone: null, source: 'operator' } as TimeValue } })).toThrow(HeaderBuildError);
  });
  it('the governed precision vocabulary: the seams\' words plus approximate (the Phase 0 schema\'s); a word outside it is refused', () => {
    expect([...HEADER_TIME_PRECISIONS].sort()).toEqual([...TIME_PRECISIONS, 'approximate'].sort());
    expect(() => buildHeader(base({ timePrecision: 'fortnight' }))).toThrow(/governed vocabulary/);
  });
});

describe('§HD profiles', () => {
  it('one profile per registered type (36 at 0120); its rows name every use and the quality profile', () => {
    expect(Object.keys(HEADER_PROFILES)).toHaveLength(36);
    for (const t of Object.keys(HEADER_PROFILES)) {
      const r = profileRow(t);
      expect(Object.keys(r.mandatory).sort(), t).toEqual([...USE_KINDS].sort());
      expect(r.quality_profile).toBe(qualityProfileOf(t));
      for (const f of r.value_required) expect(CANONICAL_HEADER_FIELDS as readonly string[], `${t}.${f}`).toContain(f);
      for (const u of USE_KINDS) for (const f of r.mandatory[u]) expect(CANONICAL_HEADER_FIELDS as readonly string[], `${t}.${u}.${f}`).toContain(f);
    }
  });
});

/* ───────────────────────────── THE RATCHET ───────────────────────────── */
const SRC = join(__dirname, '../../src');
const BUILDER = 'objects/header-builder.ts';
/** Files allowed a header literal. EMPTY besides the builder: the list only shrinks. */
const ALLOWED: readonly string[] = [];
function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? tsFiles(p) : p.endsWith('.ts') && !p.endsWith('.d.ts') ? [p] : []; });
}
function headerLiterals(file: string): Array<{ line: number; why: string }> { return literalsIn(readFileSync(file, 'utf8'), file); }
function literalsIn(text: string, file: string): Array<{ line: number; why: string }> {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const out: Array<{ line: number; why: string }> = [];
  const at = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const visit = (n: ts.Node): void => {
    if (ts.isObjectLiteralExpression(n)) {
      const keys = n.properties.map((p) => (p.name !== undefined && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : null));
      if (keys.includes('owning_component') || keys.includes('audit_correlation_id')) out.push({ line: at(n), why: 'an object literal naming owning_component / audit_correlation_id' });
      const parent = n.parent;
      if (ts.isAsExpression(parent) && /\bCanonicalHeader\b(?!\[)/.test(parent.type.getText(sf))) out.push({ line: at(n), why: 'an object literal asserted CanonicalHeader' });
      if (ts.isVariableDeclaration(parent) && parent.type !== undefined && /^CanonicalHeader$/.test(parent.type.getText(sf))) out.push({ line: at(n), why: 'an object literal typed CanonicalHeader' });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

describe('§HD ratchet · a writer reaches the header only through buildHeader', () => {
  it('no header literal outside header-builder.ts (the allowlist is empty and only shrinks)', () => {
    const found: string[] = [];
    for (const f of tsFiles(SRC)) {
      const rel = relative(SRC, f);
      if (rel === BUILDER || ALLOWED.includes(rel)) continue;
      for (const x of headerLiterals(f)) found.push(`${rel}:${x.line} — ${x.why}`);
    }
    expect(found).toEqual([]);
  });
  it('the detector is live: it flags a planted literal (keyed, asserted, typed) and passes a builder spec', () => {
    expect(literalsIn(`const h = { owning_component: 'X', object_id: 'y' };`, 'p.ts')).toHaveLength(1);
    expect(literalsIn(`const h = { object_id: 'y' } as CanonicalHeader;`, 'p.ts')).toHaveLength(1);
    expect(literalsIn(`const h: CanonicalHeader = { object_id: 'y' };`, 'p.ts')).toHaveLength(1);
    expect(literalsIn(`const h = { ...x, audit_correlation_id: c };`, 'p.ts')).toHaveLength(1);
    expect(literalsIn(`const h: CanonicalHeader = buildHeader({ owningComponent: 'X', auditCorrelationId: 'c' });`, 'p.ts')).toHaveLength(0);
    expect(literalsIn(`const q = h.source_clock_quality as CanonicalHeader['source_clock_quality'];`, 'p.ts')).toHaveLength(0);
    expect(headerLiterals(join(SRC, BUILDER)).length).toBeGreaterThanOrEqual(1);   // the builder holds the one literal
  });
  it('every writer that admits a canonical object imports the builder (the 32 header-writing files of 0120 §HD)', () => {
    const writers = tsFiles(SRC).filter((f) => /buildHeader\(/.test(readFileSync(f, 'utf8'))).map((f) => relative(SRC, f)).filter((r) => r !== BUILDER);
    expect(writers.length).toBeGreaterThanOrEqual(31);
  });
});
