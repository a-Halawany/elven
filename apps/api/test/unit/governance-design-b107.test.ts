/**
 * CP-6 B107 §DG (0115_b107_x_dg) — the PURE logic of design governance: the lint (raw colours, optimistic paths, a surface defining the product
 * as chat / dashboard / BI / copilot / report — UX-ADR-002/-010/-017), the repository inventory (components, patterns, the token set, their
 * consumers), the contribution steps, the baseline comparison, the eligibility explanation, the request shapes and evidence ages. The lint also
 * runs over the REAL web source here: the product's surfaces must stay conformant (a finding fails this test — the remediation is a fix or a
 * narrow, expiring design exception recorded through the governed port, never an edit of this test). Fixtures are SYNTHETIC.
 */
import { describe, expect, it } from 'vitest';
import { definesSurface, inputDigest, lintDesign, stripComments, surfacesOf } from '../../src/governance/design/design-lint.js';
import { exportedComponents, inventoryFrom, readRepository, repoRoot, routeOf } from '../../src/governance/design/design-source.js';
import { ageDays, compareBaselines, eligibility, evidenceProblem, nextSteps, stepAction, tupleProblem, HUMAN_STEPS } from '../../src/governance/design/design-logic.js';

describe('the lint (pure)', () => {
  it('raw colours in product code are found; packages/tokens and comments are not', () => {
    const r = lintDesign([
      { path: 'apps/web/app/a/page.tsx', text: "const a = { color: '#0B6674' };\nconst b = `rgba(1, 2, 3, 0.5)`;\n/* '#123456' in a comment */\n// hsl(1, 2%, 3%)\nconst c = 'issue #12';\n" },
      { path: 'packages/tokens/src/registry.ts', text: "export const X = '#F4F7FA';\n" },
      { path: 'apps/web/app/globals.css', text: 'body { background: var(--eye-color-canvas); }\n.x { color: #fff; }\n' },
    ]);
    expect(r.findings.map((f) => `${f.rule}:${f.file}:${f.line}`)).toEqual(['raw-colour:apps/web/app/a/page.tsx:1', 'raw-colour:apps/web/app/a/page.tsx:2', 'raw-colour:apps/web/app/globals.css:2']);
  });
  it('optimistic paths are found; a comment saying there is none is not one', () => {
    const r = lintDesign([{ path: 'apps/web/components/b.tsx', text: "// there is no optimistic path\nconst [s, add] = useOptimistic(x);\nconst y = { optimistic: true };\nconst z = optimisticSet(1);\nconst ok = 'optimistic: true';\n" }]);
    expect(r.findings.map((f) => f.line)).toEqual([2, 3, 4, 5]);
    expect(r.counts['optimistic-path']).toBe(4);
  });
  it('surfaces: an <h1>, the metadata title and the nav/app/title messages — the product never defined as chat, dashboard, BI, copilot or report', () => {
    expect(definesSurface('Executive dashboard')).toBe(true);
    expect(definesSurface('BI workspace')).toBe(true);
    expect(definesSurface('Observation operations')).toBe(false);
    expect(definesSurface('Reported warnings')).toBe(false);
    expect(definesSurface('combine')).toBe(false);
    expect(surfacesOf({ path: 'apps/web/app/layout.tsx', text: "export const metadata = {\n  title: 'The Eye — Copilot',\n};\n" })).toEqual([{ line: 2, text: 'The Eye — Copilot' }]);
    const json = surfacesOf({ path: 'apps/web/messages/en.json', text: '{\n  "nav.x": "Reports",\n  "body.y": "a dashboard of nothing",\n  "z.title": "Chat"\n}\n' });
    expect(json).toEqual([{ line: 2, text: 'Reports' }, { line: 4, text: 'Chat' }]);
    const r = lintDesign([{ path: 'apps/web/app/p/page.tsx', text: "export default function P() { return <h1>Design governance</h1>; }\nconst t = <h1 style={{}}>Analytics dashboard</h1>;\n" }]);
    expect(r.findings).toEqual([{ rule: 'surface-definition', file: 'apps/web/app/p/page.tsx', line: 2, excerpt: 'Analytics dashboard' }]);
  });
  it('comments are blanked without moving lines; an apostrophe in JSX text does not swallow the rest of the file', () => {
    const s = stripComments("a /* x\ny */ b\n<p>It's fine</p>\n// gone\nc");
    expect(s.split('\n').length).toBe(5);
    expect(s).toContain("<p>It's fine</p>");
    expect(s).not.toContain('gone');
    expect(stripComments("const u = 'http://x'; // c")).toBe("const u = 'http://x';     ");
  });
  it('deterministic: the same files in any order give the same findings and input digest; a changed file changes the digest', () => {
    const f = [{ path: 'apps/web/app/a.tsx', text: "const a = '#abcdef';" }, { path: 'apps/web/app/b.tsx', text: 'const b = 1;' }];
    expect(lintDesign(f)).toEqual(lintDesign([...f].reverse()));
    expect(inputDigest(f)).not.toBe(inputDigest([f[0]!, { ...f[1]!, text: 'const b = 2;' }]));
    expect(lintDesign(f).rulesVersion).toBe('dg-lint-1');
  });
  it('THE REAL WEB SOURCE is conformant: no raw colour, no optimistic path, no surface defining the product as chat / dashboard / BI / copilot / report', () => {
    const repo = readRepository(repoRoot());
    expect(repo).not.toBeNull();
    const r = lintDesign(repo!.files);
    expect(r.files).toBeGreaterThan(50);
    expect(r.findings, JSON.stringify(r.findings.slice(0, 10))).toEqual([]);
  });
});

describe('the inventory (pure over files)', () => {
  const files = [
    { path: 'packages/tokens/src/registry.ts', text: "export const COLOR_TOKENS = [];\n" },
    { path: 'apps/web/components/ui.tsx', text: "export function TruthBadge() { return null; }\nexport const inputStyle = {};\nexport function Panel() { return null; }\nexport function fmt() { return 1; }\n" },
    { path: 'apps/web/components/observation.tsx', text: "export function GovernedButton() { return null; }\n" },
    { path: 'apps/web/app/admin/governance/design/page.tsx', text: "<Panel><TruthBadge state='x' /></Panel>" },
    { path: 'apps/web/app/page.tsx', text: '<Panel />' },
  ];
  it('the token set, every exported component (kebab keys), the known patterns, each with the pages that render it', () => {
    const inv = inventoryFrom(files, { tokens: '0.0.1', web: '0.0.2' });
    expect(inv.map((a) => `${a.kind}:${a.key}`)).toEqual(['pattern:pattern.governed-action', 'pattern:pattern.truth-state', 'design_asset:tokens.semantic',
      'design_component:web.observation.governed-button', 'design_component:web.ui.panel', 'design_component:web.ui.truth-badge']);
    const panel = inv.find((a) => a.key === 'web.ui.panel')!;
    expect(panel.consumers).toEqual(['/', '/admin/governance/design']);
    expect(panel.packageVersion).toBe('0.0.2');
    expect(panel.sourceDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(inv.every((a) => /^[a-z][a-z0-9_.-]{2,120}$/.test(a.key))).toBe(true);
  });
  it('a component\'s digest moves with its own source only', () => {
    const a = inventoryFrom(files, { tokens: '0.0.1', web: '0.0.1' });
    const b = inventoryFrom(files.map((f) => (f.path.endsWith('ui.tsx') ? { ...f, text: f.text.replace('export function Panel() { return null; }', 'export function Panel() { return 1; }') } : f)), { tokens: '0.0.1', web: '0.0.1' });
    const d = (x: typeof a, k: string) => x.find((y) => y.key === k)!.sourceDigest;
    expect(d(a, 'web.ui.panel')).not.toBe(d(b, 'web.ui.panel'));
    expect(d(a, 'web.ui.truth-badge')).toBe(d(b, 'web.ui.truth-badge'));
  });
  it('helpers: exported components, routes; the real repository inventories deterministically', () => {
    expect(exportedComponents('export function A() {}\nexport const b = 1;\nexport function c() {}\n').map((c) => c.name)).toEqual(['A']);
    expect(routeOf('apps/web/app/admin/governance/design/page.tsx')).toBe('/admin/governance/design');
    const repo = readRepository(repoRoot())!;
    const one = inventoryFrom(repo.files, repo.versions); const two = inventoryFrom([...repo.files].reverse(), repo.versions);
    expect(one).toEqual(two);
    expect(one.length).toBeGreaterThan(20);
  });
});

describe('the contribution steps, the comparison, eligibility, shapes, ages', () => {
  it('steps by stage and kind; the human steps; the action of a step', () => {
    expect(nextSteps('new_component', 'proposed')).toEqual(['review', 'reject']);
    expect(nextSteps('new_component', 'accepted')).toEqual(['publish', 'reject']);
    expect(nextSteps('deprecation', 'accepted')).toEqual(['deprecate', 'reject']);
    expect(nextSteps('deprecation', 'migrating')).toEqual(['migrate', 'retire']);
    expect(nextSteps('x', 'closed')).toEqual([]);
    expect(HUMAN_STEPS).toEqual(['review', 'accept', 'reject', 'publish', 'deprecate', 'retire', 'close']);
    expect(stepAction('accept')).toBe('governance.design.contribution.accept');
  });
  it('compare: members added, removed and re-versioned; principles; exceptions; scope; identical', () => {
    const m = (k: string, v: number, d = 'd') => ({ asset_id: k, key: k, version: v, digest: `${d}${v}` });
    const a = { version: 1, digest: 'a', design_system_version: '1', members: [m('x', 1), m('y', 1)], principles: [{ key: 'p', version: 1, digest: 'p1' }], exceptions: [{ exception_id: 'e1' }], conformance_scope: { locales: ['en'] } };
    const b = { version: 2, digest: 'b', design_system_version: '2', members: [m('x', 2), m('z', 1)], principles: [{ key: 'p', version: 2, digest: 'p2' }], exceptions: [{ exception_id: 'e2' }], conformance_scope: { locales: ['de', 'en'] } };
    const c = compareBaselines(a, b);
    expect(c.members).toEqual({ added: [{ key: 'z', version: 1 }], removed: [{ key: 'y', version: 1 }], changed: [{ key: 'x', from: 1, to: 2 }] });
    expect(c.principles).toEqual([{ key: 'p', from: 1, to: 2 }]);
    expect(c.exceptions).toEqual({ added: ['e2'], dropped: ['e1'] });
    expect(c.scope).toEqual([{ dimension: 'locales', from: ['en'], to: ['de', 'en'] }]);
    expect(c.design_system_version).toEqual({ from: '1', to: '2' });
    expect(compareBaselines(a, a).identical).toBe(true);
  });
  it('eligibility in words: an agent, the role, the proposer, a builder, the owner (ES-02-004), the state, one person one obligation', () => {
    const base = { kind: 'human', principal: 'u1', holds: true, role: 'design_system_authority', proposer: 'u2', builders: [] as string[], state: 'proposed', expectedState: 'proposed' };
    expect(eligibility(base)).toEqual([]);
    expect(eligibility({ ...base, kind: 'agent' })[0]).toMatch(/named human/);
    expect(eligibility({ ...base, holds: false })).toEqual(['you do not hold design_system_authority']);
    expect(eligibility({ ...base, proposer: 'u1' })).toEqual(['you proposed it — no self-acceptance']);
    expect(eligibility({ ...base, builders: ['u1'] })).toEqual(['you built or amended it — independence']);
    expect(eligibility({ ...base, owner: 'u1' })[0]).toMatch(/ES-02-004/);
    expect(eligibility({ ...base, state: 'attested' })).toEqual(['it is attested, not proposed']);
    expect(eligibility({ ...base, already: true })[0]).toMatch(/one person, one obligation/);
  });
  it('the design tuple and evidence shapes; ages on a given clock', () => {
    const t = { capability: 'CAP-AU-01', journey: 'JRN-24', persona: 'p1', role: 'r1', deployment_profile: 'local-dev', theme: 'light', locale: 'en', device: 'desktop' };
    expect(tupleProblem(t)).toBeNull();
    expect(tupleProblem({ ...t, device: '' })).toMatch(/device/);
    expect(tupleProblem({ ...t, colour: 'x' })).toMatch(/not a dimension/);
    expect(tupleProblem({ ...t, deployment_profile: 'mars' })).toMatch(/not a deployment profile/);
    expect(tupleProblem({ ...t, configuration_digest: 'abc' })).toMatch(/64 hex/);
    const now = '2026-10-15T12:00:00.000Z';
    const ok = { kind: 'walk', ref: 'e2e', digest: 'a'.repeat(64), capturedAt: '2026-10-14T12:00:00.000Z', validUntil: '2026-11-14T12:00:00.000Z' };
    expect(evidenceProblem([ok], now)).toBeNull();
    expect(evidenceProblem([], now)).toMatch(/1–50/);
    expect(evidenceProblem([{ ...ok, digest: 'x' }], now)).toMatch(/digest/);
    expect(evidenceProblem([{ ...ok, validUntil: ok.capturedAt }], now)).toMatch(/valid for no time/);
    expect(ageDays('2026-10-14T00:00:00.000Z', now)).toBe(1.5);
    expect(ageDays(null, now)).toBeNull();
  });
});
