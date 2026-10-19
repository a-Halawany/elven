/**
 * CP-6 B82 §CF — THE CHART-GRAMMAR LINT dg-lint-4 (UX-ADR-015, REL-17): the two rules over planted sources (a drawing outside the frame, a
 * data bar drawn with boxes; glyphs, comments, tests and the frame itself are not findings), the determinism, and the RATCHET over the REAL
 * web source: today's findings are exactly the committed list (the two div charts §SC replaces in wave 2) — a new finding fails this test
 * (draw through ChartFrame, or record a narrow expiring exception through B107's port; never edit this test). Fixtures are SYNTHETIC.
 */
import { describe, expect, it } from 'vitest';
import { CHART_LINT_VERSION, CHART_PRINCIPLE, CHART_RULES, chartRatchet, hiddenTag, lintCharts, openingTag } from '../../src/governance/design/charts/chart-lint.js';
import { CHART_LINT_RATCHET } from '../../src/governance/design/charts/chart-lint-ratchet.js';
import { readRepository } from '../../src/governance/design/design-source.js';

describe('dg-lint-4 over planted sources', () => {
  it('a role="img" or an unhidden <svg> on a page is a drawing outside the frame; a glyph is not', () => {
    const r = lintCharts([
      { path: 'apps/web/app/a/page.tsx', text: '<div role="img" aria-label="x" />\n<svg viewBox="0 0 640 260">\n<svg aria-hidden="true" viewBox="0 0 9 9" />\n<svg className="g" viewBox="0 0 24 24" />\n' },
    ]);
    expect(r.findings.map((f) => `${f.rule}:${f.line}`)).toEqual(['drawing-outside-frame:1', 'drawing-outside-frame:2']);
    expect(r.rulesVersion).toBe(CHART_LINT_VERSION); expect(r.findings[0]!.principle).toBe(CHART_PRINCIPLE);
  });
  it('a data bar drawn with boxes is a div chart; a fixed percentage is not', () => {
    const r = lintCharts([{ path: 'apps/web/app/b/page.tsx', text: "const a = { inlineSize: `${pct}%` };\nconst b = { width: '50%' };\nconst c = { blockSize: `${v / 2}%` };\n" }]);
    expect(r.findings.map((f) => `${f.rule}:${f.line}`)).toEqual(['div-chart:1', 'div-chart:3']);
  });
  it('a library component that draws an <svg> must render ChartFrame; the frame itself and chart files that compose it are clean', () => {
    const r = lintCharts([
      { path: 'apps/web/components/x.tsx', text: 'export function X() { return <svg viewBox="0 0 10 10" />; }\n' },
      { path: 'apps/web/components/chart.tsx', text: 'export function Y() { return <ChartFrame spec={s} rows={r}><svg viewBox="0 0 10 10" /></ChartFrame>; }\n' },
      { path: 'apps/web/components/chart-frame.tsx', text: '<div role="img" />\n' },
    ]);
    expect(r.findings.map((f) => `${f.file}:${f.line}`)).toEqual(['apps/web/components/x.tsx:1']);
  });
  it('comments, tests and non-web files are not product surfaces', () => {
    const r = lintCharts([
      { path: 'apps/web/app/c/page.tsx', text: '// <div role="img" />\n/* <svg viewBox="0 0 1 1"> */\n' },
      { path: 'apps/web/app/c/page.test.tsx', text: '<div role="img" />\n' },
      { path: 'apps/api/src/x.ts', text: '<div role="img" />\n' },
    ]);
    expect(r.findings).toEqual([]);
  });
  it('the opening tag respects braces; aria-hidden in any spelling hides', () => {
    expect(openingTag('<svg onClick={() => a > b} aria-hidden>', 0)).toBe('<svg onClick={() => a > b} aria-hidden>');
    expect(hiddenTag('<svg aria-hidden="true">')).toBe(true); expect(hiddenTag('<svg aria-hidden>')).toBe(true); expect(hiddenTag('<svg aria-hidden={true}>')).toBe(true);
    expect(hiddenTag('<svg viewBox="0 0 640 260">')).toBe(false);
  });
  it('is deterministic and fingerprints by rule, file and text (not by line)', () => {
    const a = lintCharts([{ path: 'apps/web/app/d/page.tsx', text: '<div role="img" />\n' }]);
    const b = lintCharts([{ path: 'apps/web/app/d/page.tsx', text: '\n\n<div role="img" />\n' }]);
    expect(a.findings[0]!.fingerprint).toBe(b.findings[0]!.fingerprint); expect(a.findings[0]!.line).not.toBe(b.findings[0]!.line);
    expect(lintCharts([{ path: 'apps/web/app/d/page.tsx', text: '<div role="img" />\n' }]).inputDigest).toBe(a.inputDigest);
    expect(CHART_RULES).toEqual(['drawing-outside-frame', 'div-chart']);
  });
  it('the ratchet: a new finding is a regression, a committed one gone is resolved', () => {
    const f = lintCharts([{ path: 'apps/web/app/e/page.tsx', text: '<div role="img" />\n' }]).findings;
    expect(chartRatchet(f, []).holds).toBe(false);
    const committed = f.map((x) => ({ rule: x.rule, file: x.file, excerpt: x.excerpt, fingerprint: x.fingerprint, carrier: 'test' }));
    expect(chartRatchet(f, committed).holds).toBe(true);
    expect(chartRatchet([], committed).resolved).toHaveLength(1);
  });
});

describe('dg-lint-4 over the REAL web source — the ratchet holds', () => {
  const repo = readRepository();
  it('reads the repository', () => { expect(repo).not.toBeNull(); });
  it('today\'s findings are exactly the committed list — empty since §SC replaced the two div charts; nothing new, nothing stale', () => {
    const r = lintCharts(repo!.files);
    const k = chartRatchet(r.findings, CHART_LINT_RATCHET);
    expect(k.regressions.map((x) => `${x.rule} ${x.file}:${x.line} ${x.excerpt}`)).toEqual([]);
    expect(k.resolved.map((x) => `${x.rule} ${x.file}`)).toEqual([]);
    /* B82 sc: the two div charts replaced (SensitivityTornado, HealthDecomposition) — the committed list is EMPTY: dg-lint-4 at zero */
    expect(CHART_LINT_RATCHET).toEqual([]); expect(r.findings).toEqual([]);
  });
  it('the library\'s chart files compose ChartFrame and add no finding', () => {
    const r = lintCharts(repo!.files);
    expect(r.findings.filter((x) => x.file.startsWith('apps/web/components/'))).toEqual([]);
  });
});
