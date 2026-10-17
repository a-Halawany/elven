/**
 * B80 §TK — the pure logic of the governed customer theme and the library lint (dg-lint-2) with its compatibility gate. The lint runs over the
 * REAL web source (read-only) as well as planted files. SYNTHETIC values.
 */
import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { readRepository } from '../../src/governance/design/design-source.js';
import { FORK_PRINCIPLE, LIBRARY_LINT_VERSION, compatibility, libraryNames, lintLibrary, propsContract } from '../../src/governance/design/themes/library-lint.js';
import { proposalProblem, refuseTheme, themeAction, themeEligibility, themeRefusal } from '../../src/governance/design/themes/themes-logic.js';

describe('dg-lint-2: forks of library components and token values declared outside packages/tokens (UX-05-005)', () => {
  const lib = { path: 'apps/web/components/symbols.tsx', text: 'export function Symbol({ id }: { id: string }) { return null; }\nexport function Legend() { return null; }\nfunction helper() {}\n' };
  it('a local component carrying a library name is a fork; a READ of a token or a ternary choosing one is not a declaration', () => {
    const page = { path: 'apps/web/app/x/page.tsx', text: [
      'function Symbol() { return null; }',
      "const Legend = () => null;",
      "const a = { '--eye-color-accent-default': 'x' };",
      "const t = ok ? '--eye-color-critical' : '--eye-color-success';",
      "const s = { color: 'var(--eye-color-ink-default)' };",
      "el.style.setProperty('--eye-color-canvas', v);",
      '// function Symbol() {} in a comment is not code',
      'export default function Page() { return null; }'].join('\n') };
    const css = { path: 'apps/web/app/x.css', text: '.a { color: var(--eye-color-ink-default); }\n:root { --eye-color-canvas: red; }\n' };
    const r = lintLibrary([lib, page, css]);
    expect(r.rulesVersion).toBe(LIBRARY_LINT_VERSION);
    expect(r.library).toEqual(['Legend', 'Symbol']);
    expect(r.findings.map((f) => [f.rule, f.file, f.line])).toEqual([
      ['token-redefinition', 'apps/web/app/x.css', 2],
      ['library-fork', 'apps/web/app/x/page.tsx', 1], ['library-fork', 'apps/web/app/x/page.tsx', 2],
      ['token-redefinition', 'apps/web/app/x/page.tsx', 3], ['token-redefinition', 'apps/web/app/x/page.tsx', 6]]);
    expect(r.findings.every((f) => f.principle === FORK_PRINCIPLE)).toBe(true);
    expect(r.counts).toEqual({ 'library-fork': 2, 'token-redefinition': 3 });
  });
  it('packages/tokens and test files are not product surfaces; the result is deterministic', () => {
    const r1 = lintLibrary([lib, { path: 'packages/tokens/src/css.ts', text: "const x = { '--eye-a': 1 };" }, { path: 'apps/web/lib/a.test.ts', text: "const y = { '--eye-b': 1 };" }]);
    expect(r1.findings).toEqual([]);
    expect(lintLibrary([lib]).inputDigest).toBe(lintLibrary([lib]).inputDigest);
  });
  it('the REAL web source: no library fork and no token declared outside packages/tokens (the B80 components included)', () => {
    const repo = readRepository();
    expect(repo).not.toBeNull();
    const r = lintLibrary(repo!.files);
    expect(r.library).toEqual(expect.arrayContaining(['Symbol', 'Legend', 'ThemeScope', 'ThemePreview', 'Identifier', 'Digest', 'NumberValue', 'Timestamp', 'Statement', 'GovernedButton', 'TruthBadge']));
    expect(r.findings, JSON.stringify(r.findings.slice(0, 5))).toEqual([]);
    expect(libraryNames(repo!.files)).toEqual(r.library);
  });
});

describe('the compatibility gate: the props contract (UX-05-003)', () => {
  const v1 = propsContract('Symbol', 'export function Symbol({ id, text, size }: { id: string; text?: string; size?: number }) { return null; }');
  it('the contract names each prop, required or optional; its digest is stable', () => {
    expect(v1.props).toEqual([{ name: 'id', required: true }, { name: 'size', required: false }, { name: 'text', required: false }]);
    expect(v1.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(propsContract('Symbol', 'export function Symbol({ id, text, size }: { id: string; text?: string; size?: number }) {}').digest).toBe(v1.digest);
    expect(propsContract('Plain', 'export function Plain() { return null; }').props).toEqual([]);
  });
  it('a removed or newly required prop is BREAKING; a new optional prop is additive', () => {
    const add = propsContract('Symbol', 'export function Symbol({ id, text, size, locale }: { id: string; text?: string; size?: number; locale?: string }) {}');
    expect(compatibility(v1, add)).toEqual({ compatible: true, identical: false, breaking: [], additive: ['Symbol.locale added (optional)'] });
    const req = propsContract('Symbol', 'export function Symbol({ id, text, size }: { id: string; text: string; size?: number }) {}');
    expect(compatibility(v1, req).breaking).toEqual(['Symbol.text became required']);
    const rm = propsContract('Symbol', 'export function Symbol({ id }: { id: string }) {}');
    expect(compatibility(v1, rm)).toMatchObject({ compatible: false, breaking: ['Symbol.size removed', 'Symbol.text removed'] });
    expect(compatibility(v1, v1)).toMatchObject({ compatible: true, identical: true });
  });
});

describe('the theme acts in words, the request shape, the class-form refusals', () => {
  it('who may take each act (the port decides — this explains)', () => {
    const base = { kind: 'human', holdsBrand: true, holdsDsa: false, principal: 'p', proposer: 'p', state: 'proposed' };
    expect(themeEligibility({ ...base, act: 'certify' })).toEqual(['you do not hold design_system_authority', 'you proposed it — no self-certification']);
    expect(themeEligibility({ ...base, act: 'certify', holdsDsa: true, proposer: 'q' })).toEqual([]);
    expect(themeEligibility({ ...base, act: 'certify', holdsDsa: true, proposer: 'q', kind: 'agent' })[0]).toMatch(/a named human/);
    expect(themeEligibility({ ...base, act: 'activate' })).toEqual(['it is proposed, not certified — only a certified theme is activated']);
    expect(themeEligibility({ ...base, act: 'activate', state: 'certified', inForce: true })).toEqual(['it is already the theme in force']);
    expect(themeEligibility({ ...base, act: 'retire', state: 'certified', inForce: true })).toEqual(['it is the theme in force — roll it back first']);
    expect(themeEligibility({ ...base, act: 'rollback', holdsBrand: false })).toEqual(['you do not hold branding_authority for this tenant']);
    expect(themeAction('certify')).toBe('governance.design.theme.certify');
  });
  it('the proposal shape is refused early; the port re-checks the whitelist', () => {
    expect(proposalProblem({ key: 'nordwerk-corporate', title: 'NORDWERK', mapping: {} })).toBeNull();
    expect(proposalProblem({ key: 'N', title: 'NORDWERK', mapping: {} })).toMatch(/theme key/);
    expect(proposalProblem({ key: 'nordwerk', title: 'x', mapping: {} })).toMatch(/title/);
    expect(proposalProblem({ key: 'nordwerk', title: 'NORDWERK', mapping: [] })).toMatch(/mapping/);
    expect(proposalProblem({ key: 'nordwerk', title: 'NORDWERK', mapping: {}, expectedVersion: -1 })).toMatch(/expectedVersion/);
  });
  it('a port\'s `design theme rejected (<class>)` is answered in the class form', () => {
    const st = (m: string) => themeRefusal(new Error(m), 'c')?.getStatus() ?? null;
    expect(st('design theme rejected (separation_of_duties): x')).toBe(403);
    expect(st('design theme rejected (actor): x')).toBe(403);
    expect(st('design theme rejected (access): x')).toBe(403);
    expect(st('design theme rejected (unknown_theme): x')).toBe(404);
    expect(st('design theme rejected (stale): x')).toBe(409);
    expect(st('design theme rejected (contrast): x')).toBe(409);
    expect(st('design theme rejected (semantic): x')).toBe(422);
    expect(st('design baseline rejected (state): x')).toBeNull();
    expect(themeRefusal(new HttpException('x', 400), 'c')).toBeNull();
    const e = refuseTheme('request', 'the theme key is …', 'c');
    expect(e.getStatus()).toBe(422);
    expect((e.getResponse() as { message: string }).message).toBe('design theme rejected (request): the theme key is …');
  });
});
