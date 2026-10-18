/**
 * CP-6 B80 §SH — the shell's pure contract (lib/shell-b80.ts) and the NAVIGATION GUARD over the real sources (components/shell.tsx and the
 * seven layouts). Construction evidence; the rendering is proven by the walks (the hosted suites keep their selectors — asserted here as
 * contracts: the rail names, the nav labels they click, "Sign out", the banner).
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WORKSPACE_NAV_NAMES, type WorkspaceKey } from './b80-seams';
import {
  ADMIN_NAV_KEYS, DECISIONS_NAV, DEEP_LINK_KINDS, DEEP_LINK_TARGETS, EMPTY_HISTORY, HISTORY_MAX, LINK_OUTCOME_WORDS, SHELL_ACTION_SET, SHELL_KEYS, WORKSPACE_REGISTRY,
  activeHref, assertNavigationOnly, themeScopeOf, breadcrumbOf, decodeReturnToken, decodeWarningLink, encodeDeepLink, encodeReturnToken, filterPalette, historyBack, historyForward,
  historyVerify, historyVisit, lastVerifiedLocation, linkOutcome, movePaletteIndex, nextTabIndex, paletteEntries, parseHistory, registryEntryFor, safeLocation,
  shellOfPath, shellSpec, shellStateLines, shellStatus, withReturn, withoutShellParams, type HistoryEntry, type HistoryState,
} from './shell-b80';

const WEB = join(__dirname, '..');
const pageExists = (route: string) => existsSync(join(WEB, 'app', ...route.split('/').filter((s) => s !== ''), 'page.tsx'));
const entry = (route: string, verified = false): HistoryEntry => ({ route, title: route, workspace: shellOfPath(route), at: '2026-10-17T10:00:00Z', verified });
const UUID = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';

describe('the workspace registry WS-01…WS-20 (PR-05-001, CAP-AU-06)', () => {
  it('twenty workspaces, in order, each with its identity, purpose, audience, objects and continuity rule (Appendix K)', () => {
    expect(WORKSPACE_REGISTRY.map((w) => w.id)).toEqual(Array.from({ length: 20 }, (_, i) => `WS-${String(i + 1).padStart(2, '0')}`));
    expect(WORKSPACE_REGISTRY.find((w) => w.id === 'WS-02')?.title).toBe('Observation Operations');
    expect(WORKSPACE_REGISTRY.find((w) => w.id === 'WS-20')?.continuity).toBe('Withhold acceptance and preserve prior safe operation');
    for (const w of WORKSPACE_REGISTRY) {
      expect(w.purpose.length, w.id).toBeGreaterThan(10);
      expect(w.audience.length, w.id).toBeGreaterThan(0);
      expect(w.objects.length, w.id).toBeGreaterThan(0);
      expect(w.continuity.length, w.id).toBeGreaterThan(10);
    }
  });
  it('every route a workspace owns is a real page of a shell — and a workspace without a surface (WS-17) offers no link at all', () => {
    for (const w of WORKSPACE_REGISTRY) for (const r of w.routes) {
      expect(pageExists(r), `${w.id} ${r}`).toBe(true);
      expect(safeLocation(r), r).toBe(r);
      expect(shellOfPath(r), r).not.toBeNull();
    }
    expect(WORKSPACE_REGISTRY.find((w) => w.id === 'WS-17')?.routes).toEqual([]);
    expect(paletteEntries().some((e) => e.registry === 'WS-17')).toBe(false);
  });
  it('every queue is a real page; the registry owner of a path is the LONGEST route', () => {
    for (const w of WORKSPACE_REGISTRY) for (const q of w.queues) expect(pageExists(q.href), q.href).toBe(true);
    expect(registryEntryFor('/graph/strategy/planning')?.id).toBe('WS-16');
    expect(registryEntryFor('/graph/memory')?.id).toBe('WS-07');
    expect(registryEntryFor('/graph/search')?.id).toBe('WS-03');
    expect(registryEntryFor('/admin/governance/acceptance')?.id).toBe('WS-20');
    expect(registryEntryFor('/admin/governance/design')?.id).toBe('WS-18');
    expect(registryEntryFor('/login')).toBeNull();
  });
});

describe('the eight shells keep every hosted selector (UX-09-001, CMP-011)', () => {
  it('each rail\'s accessible name is the contract name (never renamed): workspace, Observation Operations, Graph, Decisions, Prediction…', () => {
    for (const k of SHELL_KEYS) expect(shellSpec(k).navName).toBe(WORKSPACE_NAV_NAMES[k]);
    expect(shellSpec('admin').navName).toBe('workspace');
    expect(shellSpec('twins').navName).toBe('Prediction');
    expect(shellSpec('observation').title).toBe('Observation Operations');
  });
  it('every rail item is a real page; every admin label comes from the catalogue (no raw key shown)', () => {
    for (const k of SHELL_KEYS) for (const n of shellSpec(k).nav) expect(pageExists(n.href), `${k} ${n.href}`).toBe(true);
    for (const n of shellSpec('admin').nav) expect(n.label).not.toMatch(/^nav\./);
    expect(ADMIN_NAV_KEYS).toHaveLength(24);   // B80 integration: + themes, tokens, catalogue (§TK, §CL-D)
  });
  it('the labels the suites click are where they were', () => {
    const labels = (k: WorkspaceKey) => shellSpec(k).nav.map((n) => n.label);
    expect(labels('admin')).toEqual(expect.arrayContaining(['Tenants & Domains', 'Audit Ledger', 'Canonical Objects', 'Entitlement', 'Cost ledger', 'Usage & Caps', 'Overview']));
    expect(labels('prediction')).toEqual(expect.arrayContaining(['Ensembles', 'Information sets', 'Forecasting portfolio', 'Domains']));
    expect(labels('twins')).toEqual(expect.arrayContaining(['Explorer', 'Reconciliation', 'Models', 'Fabric experiments', 'Supply network']));
    expect(DECISIONS_NAV[0]).toEqual({ href: '/home', label: 'Home', glyph: '⌂' });
    expect(shellSpec('observation').nav).toHaveLength(12);
    expect(shellSpec('graph').nav).toHaveLength(28);
    expect(shellSpec('prediction').nav).toHaveLength(20);
    expect(shellSpec('twins').nav).toHaveLength(15);
    expect(shellSpec('intelligence').nav).toHaveLength(13);
    expect(DECISIONS_NAV).toHaveLength(22);   // B80 integration: + the new decision-package form (§CL-F);   // the seven rails are the originals item for item (compared against 54d2936 at build)
  });
});

describe('the nav model: one current item, the breadcrumb (UX-11-001, CMP-013)', () => {
  it('the LONGEST matching item is the one current item', () => {
    expect(activeHref(shellSpec('graph').nav, '/graph/strategy/alignment')).toBe('/graph/strategy/alignment');
    expect(activeHref(shellSpec('graph').nav, '/graph/strategy')).toBe('/graph/strategy');
    expect(activeHref(shellSpec('graph').nav, '/graph')).toBe('/graph');
    expect(activeHref(shellSpec('admin').nav, '/admin/commercial/usage')).toBe('/admin/commercial/usage');
    expect(activeHref(shellSpec('admin').nav, '/admin/commercial')).toBe('/admin/commercial');
    expect(activeHref(shellSpec('observation').nav, `/observation/sources/${UUID}`)).toBe('/observation/sources');
    expect(activeHref(shellSpec('intelligence').nav, '/intelligence/claims')).toBe('/intelligence/claims');   // the old shell lit Overview on every page
    expect(activeHref(shellSpec('twins').nav, '/twins/simulations/fabric')).toBe('/twins/simulations/fabric');
    expect(activeHref(shellSpec('observation').nav, '/observationx')).toBeNull();
  });
  it('the breadcrumb: workspace › section › record; the last is current and not a link', () => {
    const c = breadcrumbOf(shellSpec('observation'), `/observation/sources/${UUID}`);
    expect(c.map((x) => x.label)).toEqual(['Observation Operations', 'Sources', 'record 0193a1b2…']);
    expect(c.map((x) => x.href)).toEqual(['/observation', '/observation/sources', null]);
    expect(c[2]!.current).toBe(true);
    expect(breadcrumbOf(shellSpec('observation'), '/observation/sources/new').map((x) => x.label)).toEqual(['Observation Operations', 'Sources', 'New']);
    expect(breadcrumbOf(shellSpec('decisions'), '/home').map((x) => [x.label, x.href])).toEqual([['Decisions', '/decisions'], ['Home', null]]);
    const home = breadcrumbOf(shellSpec('admin'), '/admin');
    expect(home).toHaveLength(1);
    expect(home[0]).toMatchObject({ current: true, href: null });
    expect(breadcrumbOf(shellSpec('prediction'), '/prediction/warnings/as-of').map((x) => x.label)).toEqual(['Prediction', 'Warnings', 'As of']);
  });
});

describe('in-app locations (the SQL route_ok, mirrored) and the shell\'s own parameters', () => {
  it('only absolute in-app paths, with an optional plain query', () => {
    expect(safeLocation('/observation/sources?mode=replay')).toBe('/observation/sources?mode=replay');
    for (const bad of ['https://evil.example/', '//evil.example/x', '/a/../admin', 'observation', '/x?y=<script>', '', '/a b', 42, null]) expect(safeLocation(bad), String(bad)).toBeNull();
  });
  it('the return token is the shell\'s, never part of a page\'s state', () => {
    expect(withoutShellParams('?warning=1&from=abc&at=2')).toBe('?warning=1&at=2');
    expect(withoutShellParams('?from=abc')).toBe('');
  });
});

describe('the history stack (CMP-016, PR-05-005, UX-11-005)', () => {
  it('push, revisit, back and forward moves, the forward branch truncated by a new place', () => {
    let s: HistoryState = EMPTY_HISTORY;
    for (const r of ['/observation', '/observation/sources', '/graph']) s = historyVisit(s, entry(r));
    expect(s.index).toBe(2);
    expect(historyVisit(s, entry('/graph'))).toEqual(s);
    s = historyVisit(s, entry('/observation/sources'));              // the browser's back
    expect([s.index, s.entries.length]).toEqual([1, 3]);
    expect(historyBack(s)?.route).toBe('/observation');
    expect(historyForward(s)?.route).toBe('/graph');
    s = historyVisit(s, entry('/graph'));                             // forward again
    expect(s.index).toBe(2);
    s = historyVisit(historyVisit(s, entry('/observation/sources')), entry('/prediction'));
    expect(s.entries.map((e) => e.route)).toEqual(['/observation', '/observation/sources', '/prediction']);
  });
  it('capped at HISTORY_MAX (the oldest out); the last VERIFIED location is where an unverifiable state restores to', () => {
    let s: HistoryState = EMPTY_HISTORY;
    for (let i = 0; i < HISTORY_MAX + 5; i += 1) s = historyVisit(s, entry(`/graph/p${i}`));
    expect(s.entries).toHaveLength(HISTORY_MAX);
    expect(s.entries[0]!.route).toBe('/graph/p5');
    let v = historyVerify(historyVisit(EMPTY_HISTORY, entry('/observation')));
    v = historyVisit(v, entry('/observation/sources'));
    expect(lastVerifiedLocation(v, '/observation/sources')?.route).toBe('/observation');
    expect(lastVerifiedLocation(historyVisit(EMPTY_HISTORY, entry('/x')))).toBeNull();
  });
  it('a stored stack is read back entry by entry; a foreign or malformed entry is dropped, never followed', () => {
    const raw = JSON.stringify({ index: 2, entries: [entry('/observation', true), { route: 'https://evil.example/', title: 'x' }, entry('/graph')] });
    const s = parseHistory(raw);
    expect(s.entries.map((e) => e.route)).toEqual(['/observation', '/graph']);
    expect(s.index).toBe(1);
    expect(parseHistory('not json')).toEqual(EMPTY_HISTORY);
    expect(parseHistory(null)).toEqual(EMPTY_HISTORY);
  });
});

describe('the return token (PAT-26, UX-11-003): a location and a focus target — never a command', () => {
  it('round trip: the source, its title, its workspace and the focus target', () => {
    const tok = encodeReturnToken({ path: '/observation/sources?mode=replay', title: 'Sources', workspace: 'observation', focus: 'src-row-3' });
    expect(tok).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeReturnToken(tok)).toEqual({ path: '/observation/sources?mode=replay', title: 'Sources', workspace: 'observation', focus: 'src-row-3' });
    expect(withReturn('/prediction/warnings', { path: '/graph', title: 'Graph', workspace: 'graph', focus: null })).toMatch(/^\/prediction\/warnings\?from=[A-Za-z0-9_-]+$/);
    expect(withReturn('/x?a=1', { path: '/graph', title: 'G', workspace: 'graph', focus: null })).toMatch(/^\/x\?a=1&from=/);
  });
  it('a foreign location, an unknown field (a would-be command) or a tampered token is refused — null, never followed', () => {
    expect(encodeReturnToken({ path: 'https://evil.example/', title: 'x', workspace: null, focus: null })).toBeNull();
    const forge = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    expect(decodeReturnToken(forge({ p: '/observation', t: 'ok' }))?.path).toBe('/observation');
    expect(decodeReturnToken(forge({ p: '/observation', t: 'x', cmd: 'observation.source.transition' }))).toBeNull();
    expect(decodeReturnToken(forge({ p: '//evil.example', t: 'x' }))).toBeNull();
    expect(decodeReturnToken(forge({ p: '/a/../b' }))).toBeNull();
    expect(decodeReturnToken(forge({ p: '/observation', f: 'javascript:alert(1)' }))?.focus).toBeNull();
    expect(decodeReturnToken('%%%')).toBeNull();
    expect(decodeReturnToken('')).toBeNull();
  });
});

describe('the deep-link codec (PAT-25, UX-15-001…005)', () => {
  it('a warning link names the object, the version and the as-of instant WITH its zone; the return token travels with it', () => {
    const href = encodeDeepLink({ kind: 'warning', id: UUID, version: 2, asOf: '2026-10-17T09:30:00Z', from: { path: '/graph', title: 'Graph', workspace: 'graph', focus: null } });
    expect(href).toMatch(new RegExp(`^/prediction/warnings/as-of\\?warning=${UUID}&v=2&at=2026-10-17T09%3A30%3A00Z&from=`));
    const back = decodeWarningLink(href!.split('?')[1]!);
    expect('link' in back && back.link).toMatchObject({ kind: 'warning', id: UUID, version: 2, asOf: '2026-10-17T09:30:00Z', from: { path: '/graph' } });
  });
  it('a link that cannot be made, or read back, says why (no zone, not an id, a bad version)', () => {
    expect(encodeDeepLink({ kind: 'warning', id: UUID, version: null, asOf: '2026-10-17 09:30', from: null })).toBeNull();
    expect(encodeDeepLink({ kind: 'warning', id: 'nope', version: null, asOf: null, from: null })).toBeNull();
    expect(decodeWarningLink(`warning=${UUID}&at=2026-10-17T09:30`)).toEqual({ problem: 'instant' });
    expect(decodeWarningLink('warning=x&at=2026-10-17T09:30:00Z')).toEqual({ problem: 'id' });
    expect(decodeWarningLink(`warning=${UUID}&v=0&at=2026-10-17T09:30:00Z`)).toEqual({ problem: 'version' });
  });
  it('every kind names its target and whether its as-of is honoured, immutable or live only (never silently ignored)', () => {
    for (const k of DEEP_LINK_KINDS) {
      const t = DEEP_LINK_TARGETS[k];
      expect(pageExists(t.canonical), k).toBe(true);
      expect(['honoured', 'immutable', 'live_only']).toContain(t.asOf);
      expect(encodeDeepLink({ kind: k, id: UUID, version: null, asOf: null, from: null })).toBe(t.path(UUID) + (k === 'warning' ? `?warning=${UUID}` : ''));
    }
    expect(pageExists('/prediction/warnings/as-of')).toBe(true);
  });
  it('the outcome classes, read from the server\'s own words; unavailable says nothing about existence', () => {
    expect(linkOutcome({ ok: true, status: 200 }, { exact: true })).toBe('exact');
    expect(linkOutcome({ ok: true, status: 200 }, { exact: false })).toBe('drifted');
    expect(linkOutcome({ ok: false, status: 422, error: { message: 'warning as-of rejected (not_replayable): the warning has no recorded state at …' } })).toBe('not_replayable');
    expect(linkOutcome({ ok: false, status: 422, error: { message: 'warning as-of rejected (future): …' } })).toBe('future');
    expect(linkOutcome({ ok: false, status: 404, error: { message: 'warning as-of rejected (unknown_warning): no authorized warning matches this link' } })).toBe('unavailable');
    expect(linkOutcome({ ok: false, status: 403, error: { message: 'EYE-AUT-001' } })).toBe('unavailable');
    expect(linkOutcome({ ok: false, status: 0, error: { message: 'API unreachable' } })).toBe('error');
    expect(LINK_OUTCOME_WORDS.unavailable).not.toMatch(/tenant|domain|another|elsewhere/i);
  });
});

describe('the navigation guard (PR-05-003, UX-09-004, UX-11-004, UX-15-004, CMP-015)', () => {
  it('the palette offers navigations only, to real pages; anything else is refused by the model', () => {
    const all = paletteEntries();
    expect(all.length).toBeGreaterThan(60);
    for (const e of all) { expect(e.kind).toBe('navigate'); expect(pageExists(e.href.split('?')[0]!), e.href).toBe(true); }
    expect(() => assertNavigationOnly(all)).not.toThrow();
    expect(() => assertNavigationOnly([...all, { kind: 'execute' }])).toThrow(/navigation only/);
  });
  it('the palette filters by every word, label first; the active option wraps', () => {
    const hits = filterPalette(paletteEntries(), 'warn');
    expect(hits[0]!.label).toMatch(/Warning/i);
    expect(filterPalette(paletteEntries(), 'supply network')[0]!.href).toBe('/twins/supply');
    expect(filterPalette(paletteEntries(), 'zzzz-nothing')).toEqual([]);
    expect([movePaletteIndex(0, 'ArrowUp', 3), movePaletteIndex(2, 'ArrowDown', 3), movePaletteIndex(1, 'End', 3), movePaletteIndex(1, 'Home', 3), movePaletteIndex(0, 'x', 0)]).toEqual([2, 0, 2, 0, -1]);
  });
  it('THE SOURCES: the shell and the seven layouts issue only the shell\'s reads and the person\'s own save — no business write, no governed control', () => {
    const files = ['components/shell.tsx', 'app/admin/layout.tsx', 'app/decisions/layout.tsx', 'app/graph/layout.tsx', 'app/intelligence/layout.tsx',
      'app/observation/layout.tsx', 'app/prediction/layout.tsx', 'app/twins/layout.tsx', 'app/home/layout.tsx'].map((f) => [f, readFileSync(join(WEB, f), 'utf8')] as const);
    const allowed = new Set(['react', 'next/link', 'next/navigation', '../lib/api', '../lib/observation', '../lib/working-domain', '../lib/i18n', '../lib/b80-seams', '../lib/shell-b80',
      './ui', './working-domain', /* B80 integration: the slot wiring (SHELL_SLOTS) and the library's Dialog — the bar's own governed commit is the bar's, behind its preview and human gate (§CB), never the shell's */ './context-bar', './theme', './layers', '../../lib/observation', '../../lib/b80-seams', '../../lib/shell-b80', '../../components/shell', '../../lib/workflow', '../decisions/layout',
      /* B81 re: the sign-in / deep-link return's pure rule (it builds an href; it calls nothing) */ '../lib/signin-return-b81',
      /* B81 re: the saved table views a place-save carries (pure) */ '../lib/tableview-b81']);
    for (const [f, src] of files) {
      for (const m of src.matchAll(/from '([^']+)'/g)) expect(allowed.has(m[1]!), `${f} imports ${m[1]}`).toBe(true);
      expect(src, f).not.toMatch(/GovernedButton|\bcall\(|fetch\(|method:\s*'POST'/);
    }
    const shell = files[0]![1];
    // the only server calls of the shell: whoAmI (identity.self.read), health (/readyz), readNavigation, saveNavigation — the save only in the person's own act
    expect([...shell.matchAll(/\b(whoAmI|health|readNavigation|saveNavigation|warningAsOf)\(/g)].map((m) => m[1]).sort()).toEqual(['health', 'readNavigation', 'saveNavigation', 'whoAmI']);
    expect(shell).toMatch(/const save = async \(\) =>/);
    const lib = readFileSync(join(WEB, 'lib/shell-b80.ts'), 'utf8');
    const actions = [...lib.matchAll(/env\(s, '([^']+)'/g)].map((m) => m[1]!);
    expect(actions.length).toBe(3);
    for (const a of actions) expect(SHELL_ACTION_SET.has(a), a).toBe(true);
    expect(readFileSync(join(WEB, 'lib/observation.ts'), 'utf8')).toMatch(/action: 'identity\.self\.read'/);
  });
  it('every layout keeps its own useShell() (the 93 callers untouched) and the decisions layout its exported NAV', () => {
    for (const k of ['decisions', 'graph', 'intelligence', 'observation', 'prediction', 'twins']) {
      const src = readFileSync(join(WEB, 'app', k, 'layout.tsx'), 'utf8');
      expect(src, k).toMatch(/export function useShell\(\): ShellContext/);
      expect(src, k).toMatch(new RegExp(`<AppShell workspace="${k}"`));
    }
    expect(readFileSync(join(WEB, 'app/decisions/layout.tsx'), 'utf8')).toMatch(/export const NAV = DECISIONS_NAV/);
    expect(readFileSync(join(WEB, 'app/admin/layout.tsx'), 'utf8')).toMatch(/<AppShell workspace="admin">/);
    const shell = readFileSync(join(WEB, 'components/shell.tsx'), 'utf8');
    for (const contract of ['role="banner"', "'Sign out'", "t('shell.logout'", 'aria-label={spec.navName}', '<WorkingDomainChooser', '<WorkingDomainMark', '<DegradedBanner', 'id="eye-main"']) expect(shell, contract).toContain(contract);
  });
});

describe('tabs (CMP-014): roving focus, RTL mirrored, disabled skipped', () => {
  it('arrows, Home/End, the RTL mirror and the vertical list', () => {
    const none = [false, false, false];
    expect(nextTabIndex(0, 'ArrowRight', none)).toBe(1);
    expect(nextTabIndex(0, 'ArrowLeft', none)).toBe(2);
    expect(nextTabIndex(0, 'ArrowRight', none, { rtl: true })).toBe(2);
    expect(nextTabIndex(1, 'End', none)).toBe(2);
    expect(nextTabIndex(2, 'Home', none)).toBe(0);
    expect(nextTabIndex(0, 'ArrowRight', [false, true, false])).toBe(2);
    expect(nextTabIndex(0, 'ArrowDown', none, { orientation: 'vertical' })).toBe(1);
    expect(nextTabIndex(0, 'ArrowDown', none)).toBe(0);
    expect(nextTabIndex(0, 'Home', [true, false, false])).toBe(1);
  });
});

describe('the shell status (UX-09-005) and the explicit shell state (UX-09-002)', () => {
  it('unverified and verifying FREEZE (nothing of a workspace renders); degraded is declared, not frozen; ready is ready', () => {
    expect(shellStatus({ session: false, verified: null, problem: null, health: null })).toMatchObject({ phase: 'signed_out', frozen: true });
    expect(shellStatus({ session: true, verified: null, problem: null, health: 'ok' })).toMatchObject({ phase: 'verifying', frozen: true });
    const u = shellStatus({ session: true, verified: null, problem: 'EYE-AUT-001', health: 'ok' });
    expect(u).toMatchObject({ phase: 'unverified', frozen: true });
    expect(u.regions).toEqual(['identity', 'scope', 'workspace']);
    expect(shellStatus({ session: true, verified: true, problem: null, health: 'degraded' })).toMatchObject({ phase: 'degraded', frozen: false });
    expect(shellStatus({ session: true, verified: true, problem: null, health: 'ok' })).toMatchObject({ phase: 'ready', frozen: false, regions: [] });
  });
  it('the banner\'s dimensions: workspace, tenant, domain (the working one marked), roles, service', () => {
    const lines = shellStateLines({ workspace: 'observation', tenantId: UUID, domainId: UUID, roles: ['collection_manager'], working: true, status: shellStatus({ session: true, verified: true, problem: null, health: 'ok' }) });
    expect(lines.map((l) => [l.label, l.value])).toEqual([['workspace', 'Observation Operations'], ['tenant', '0193a1b2…'], ['domain', '0193a1b2… (working domain)'], ['roles', 'collection_manager'], ['service', 'ready']]);
    expect(shellStateLines({ workspace: 'admin', tenantId: null, domainId: null, roles: [], working: false, status: shellStatus({ session: true, verified: true, problem: null, health: 'ok' }) })[1]!.value).toBe('PLATFORM');
  });
});

describe('the ThemeScope slot reads the theme in force where the principal is bound (found in the B80 act rehearsal)', () => {
  it('a domain workspace hands the slot its tenant AND its working domain; the PLATFORM workspace hands none', () => {
    expect(themeScopeOf({ tenantId: 't-1', domainId: 'd-1' })).toEqual({ tenantId: 't-1', domainId: 'd-1' });
    expect(themeScopeOf(null)).toEqual({ tenantId: null, domainId: null });
  });
  it('the shell renders its ThemeScope with themeScopeOf(scope) — never the tenant alone (a domain-bound principal holds no TENANT binding)', () => {
    const src = readFileSync(join(__dirname, '..', 'components', 'shell.tsx'), 'utf8');
    expect(src).toMatch(/<Theme \{\.\.\.themeScopeOf\(scope\)\}>/);
    expect(src).not.toMatch(/<Theme tenantId=/);
  });
});
