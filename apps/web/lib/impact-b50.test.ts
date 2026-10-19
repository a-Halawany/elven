/**
 * B50 §CI — the impact classes' and the triggers' pure contract (lib/impact-b50.ts): the six classes in words (a glyph AND a word), the
 * server's answer parsed (a malformed row dropped and counted, an unknown class shown as the server's word — never guessed), the
 * summary, the grouping, the path in words, the trigger catalogue against the server's (the PDP block and the ports — read from source),
 * the trigger form's unmet conditions and its payload, the walk's outcome in words. Fixtures are SYNTHETIC.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AFFECTED_CLASS_ORDER, AFFECTED_CLASS_WORDS, BUCKET_WORDS, TRIGGERS, TRIGGER_KINDS, bucketWord, classSummary, classWord, groupByBucket, material, parseAffected, pathText,
  summaryLine, triggerFormProblems, triggerPayload, triggerStateText, walkOutcomeText,
} from './impact-b50';

const ROOT = join(__dirname, '..', '..', '..');
const row = (over: Record<string, unknown> = {}) => ({ invalidationId: 'i1', ref: 'DPK:p1@2', objectType: 'DPK', objectId: 'p1', version: 2, bucket: 'decision_packages', class: 'human_review',
  ruleVersion: 'affected-class@1', owner: 'u1', path: ['EVD:e1', 'DPK:p1@2'], title: 'Reroute (SYNTHETIC)', reachedVia: 'version 2\'s option cites the evidence e1 that changed', hop: 1, ...over });

describe('the six classes', () => {
  it('every class has a glyph AND a word, a meaning and the next step; the order puts withdrawn first and current last', () => {
    expect([...AFFECTED_CLASS_ORDER].sort()).toEqual(['challenged', 'current', 'human_review', 'recompute', 'stale', 'withdrawn']);
    expect(AFFECTED_CLASS_ORDER[0]).toBe('withdrawn');
    expect(AFFECTED_CLASS_ORDER[AFFECTED_CLASS_ORDER.length - 1]).toBe('current');
    for (const c of AFFECTED_CLASS_ORDER) {
      const w = AFFECTED_CLASS_WORDS[c];
      expect(w.glyph.length, c).toBeGreaterThan(0);
      expect(w.label.length, c).toBeGreaterThan(3);
      expect(w.meaning.length, c).toBeGreaterThan(10);
      expect(w.next.length, c).toBeGreaterThan(5);
    }
    expect(new Set(AFFECTED_CLASS_ORDER.map((c) => AFFECTED_CLASS_WORDS[c].glyph)).size).toBe(6);
  });
  it('the classes are the seams\' six, and the server\'s rule\'s (0120 §CI.2)', () => {
    const seams = readFileSync(join(ROOT, 'apps/web/lib/b50-seams.ts'), 'utf8');
    for (const c of AFFECTED_CLASS_ORDER) expect(seams).toContain(`'${c}'`);
    const sql = ((t: string) => t.slice(t.indexOf('-- ═══ FOLD §CI '), (i => i < 0 ? undefined : i)(t.indexOf('-- ═══ FOLD ', t.indexOf('-- ═══ FOLD §CI ') + 1))))(readFileSync(join(ROOT, 'apps/api/migrations/0120_b50_knowledge_core.sql'), 'utf8')) /* B50 fold: the part's section of the one 0120 */;
    expect(sql).toContain("CHECK (class IN ('current', 'stale', 'challenged', 'withdrawn', 'recompute', 'human_review'))");
  });
  it('an unknown class is the server\'s word, flagged — never mapped to a known one', () => {
    expect(classWord('recompute')).toMatchObject({ known: true, label: 'Recompute' });
    expect(classWord('fine')).toMatchObject({ known: false, label: 'Not a known class (fine)' });
  });
  it('a recompute never reads as done, a human review never as approved', () => {
    expect(AFFECTED_CLASS_WORDS.recompute.next).toMatch(/re-runs it/);
    expect(AFFECTED_CLASS_WORDS.human_review.next).toMatch(/nothing about it is rewritten/);
  });
});

describe('the server\'s answer', () => {
  it('parse: well-formed rows kept, a malformed row dropped and counted (never repaired)', () => {
    const p = parseAffected([row(), { ...row(), class: undefined }, null, row({ objectId: 'p2', ref: 'DPK:p2@1', version: 1, class: 'current' })]);
    expect(p.dropped).toBe(2);
    expect(p.products.map((x) => x.objectId)).toEqual(['p1', 'p2']);
    expect(p.products[0]).toMatchObject({ version: 2, owner: 'u1', path: ['EVD:e1', 'DPK:p1@2'], hop: 1 });
    expect(parseAffected('nope')).toEqual({ products: [], dropped: 0 });
    expect(parseAffected([row({ owner: null, version: null })]).products[0]).toMatchObject({ owner: null, version: null });
  });
  it('the summary counts in class order; material is everything but current; the line in words', () => {
    const ps = [row({ class: 'current' }), row({ class: 'recompute' }), row({ class: 'withdrawn' }), row({ class: 'recompute' }), row({ class: 'odd' })];
    expect(classSummary(ps)).toEqual([{ cls: 'withdrawn', n: 1 }, { cls: 'recompute', n: 2 }, { cls: 'current', n: 1 }, { cls: 'odd', n: 1 }]);
    expect(material(ps).length).toBe(4);
    expect(summaryLine(ps)).toBe('5 product(s) — 1 withdrawn, 2 recompute, 1 current, 1 not a known class (odd).');
    expect(summaryLine([])).toMatch(/Nothing classed/);
  });
  it('grouped by bucket in the walk\'s order, each group by class order, then hop, then ref', () => {
    const ps = [row({ bucket: 'publications', ref: 'PUB:b', class: 'stale' }), row({ bucket: 'forecasts', ref: 'FCT:z', class: 'current', hop: 1 }), row({ bucket: 'forecasts', ref: 'FCT:a', class: 'recompute', hop: 2 }),
                row({ bucket: 'zzz_new', ref: 'X:1' })];
    const g = groupByBucket(ps);
    expect(g.map((x) => x.bucket)).toEqual(['forecasts', 'publications', 'zzz_new']);
    expect(g[0]!.rows.map((x) => x.ref)).toEqual(['FCT:a', 'FCT:z']);
    expect(g[2]!.label).toBe('zzz new');
    expect(bucketWord('decision_packages')).toBe('Decision packages');
    expect(Object.keys(BUCKET_WORDS)).toEqual(expect.arrayContaining(['decision_packages', 'publications', 'export_packages', 'evaluation_datasets', 'lessons', 'graph_state']));
  });
  it('a path in words', () => {
    expect(pathText(['EVD:01a084f5-77e2-732f-ab8c-8a8d4a2c3257', 'DPK:01a1aaaa-0000-7000-8000-000000000001@2', 'lesson:x'])).toBe('EVD 01a084f5… → DPK 01a1aaaa… v2 → lesson x…');
    expect(pathText([])).toBe('no path recorded');
  });
});

describe('the seven triggers', () => {
  it('the catalogue is the server\'s: the kinds, the roles of each PDP rule, the object types and basis fields of each port', () => {
    const pdp = readFileSync(join(ROOT, 'apps/api/src/policy/pdp.service.ts'), 'utf8');
    const block = pdp.slice(pdp.indexOf('/* B50 ci */'), pdp.indexOf('/* end B50 ci */'));
    const sql = ((t: string) => t.slice(t.indexOf('-- ═══ FOLD §CI '), (i => i < 0 ? undefined : i)(t.indexOf('-- ═══ FOLD ', t.indexOf('-- ═══ FOLD §CI ') + 1))))(readFileSync(join(ROOT, 'apps/api/migrations/0120_b50_knowledge_core.sql'), 'utf8')) /* B50 fold: the part's section of the one 0120 */;
    expect([...TRIGGER_KINDS].sort()).toEqual(['data_quality_finding', 'human_challenge', 'integrity_failure', 'legal_request', 'model_incident', 'ontology_correction', 'rights_change']);
    for (const k of TRIGGER_KINDS) {
      const spec = TRIGGERS[k];
      const m = block.match(new RegExp(`\\['${k}', \\[([^\\]]*)\\]\\]`));
      expect(m, k).not.toBeNull();
      expect([...m![1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]), k).toEqual([...spec.roles]);
      const port = sql.slice(sql.indexOf(`FUNCTION graph.seed_${k}(`), sql.indexOf('END $$ LANGUAGE plpgsql;', sql.indexOf(`FUNCTION graph.seed_${k}(`)));
      const types = port.match(/ARRAY\[([^\]]*)\], p_tenant, p_domain, p_object_type/);
      expect(types, k).not.toBeNull();
      expect([...types![1]!.matchAll(/'([A-Z]{3})'/g)].map((x) => x[1]), k).toEqual([...spec.types]);
      for (const b of spec.basis) expect(port, `${k}.${b.key}`).toContain(`'${b.key}'`);
    }
  });
  it('the form\'s unmet conditions, each in words; a complete form has none', () => {
    const ok = { kind: 'data_quality_finding', objectType: 'EVD', objectId: '01a084f5-77e2-732f-ab8c-8a8d4a2c3257', reason: 'two days double-counted (SYNTHETIC)', basis: { dimension: 'accuracy', finding: 'double-counted' } };
    expect(triggerFormProblems(ok)).toEqual([]);
    expect(triggerFormProblems({ ...ok, kind: 'x' })).toEqual(['choose what happened (a trigger kind)']);
    expect(triggerFormProblems({ ...ok, objectType: 'FCT' })).toEqual(['a data-quality finding names a EVD, CLM']);
    expect(triggerFormProblems({ ...ok, objectId: 'abc', reason: 'short' })).toEqual(['give the id of the object the trigger names', 'state the reason (at least 8 characters)']);
    expect(triggerFormProblems({ ...ok, basis: { dimension: 'vibes' } })).toEqual(['the quality dimension is one of completeness, accuracy, timeliness, consistency, validity, uniqueness', 'give the finding']);
  });
  it('the payload carries the kind\'s own basis fields, trimmed — nothing else', () => {
    expect(triggerPayload({ kind: 'legal_request', objectType: 'EVD', objectId: ' 01A084F5-77E2-732F-AB8C-8A8D4A2C3257 ', reason: '  an erasure request  ', basis: { request_ref: ' LR-1 ', legal_basis: 'art. 17', extra: 'x' } }))
      .toEqual({ objectType: 'EVD', objectId: '01a084f5-77e2-732f-ab8c-8a8d4a2c3257', reason: 'an erasure request', basis: { request_ref: 'LR-1', legal_basis: 'art. 17' } });
  });
  it('the walk and the trigger state in words — the server\'s reason as it says it', () => {
    expect(walkOutcomeText({ state: 'walked', invalidationId: '01a1bbbb-0000', reason: null })).toBe('Walked by the domain\'s propagation agent: assessment 01a1bbbb…');
    expect(walkOutcomeText({ state: 'failed', invalidationId: null, reason: 'no active propagation agent is registered in this domain' })).toMatch(/^Recorded; the agent's walk failed: no active propagation agent/);
    expect(walkOutcomeText({ state: 'skipped', invalidationId: null, reason: 'already walked' })).toMatch(/nothing was walked twice/);
    expect(walkOutcomeText(null)).toMatch(/not reported/);
    expect(triggerStateText({ state: 'failed', last_error: 'x' })).toBe('walk failed: x');
    expect(triggerStateText({ state: 'walked', trigger_kind: 'human_challenge', closed_at: null })).toBe('walked by the agent; challenge open');
  });
});
