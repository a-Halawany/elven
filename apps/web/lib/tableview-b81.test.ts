/**
 * CP-6 B81 §RE — the table view saved per person (UX-22-002) through B80's navigation states: encoded as ONE named value, versioned by the
 * port, reconciled by name, the person's place carried exactly; the shell's place-save keeps the views. Pure — plus the real sources.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { carriedViews, encodeTableView, parseTableView, savedViewOf, viewFilterName, viewMatches, viewSaveIntake } from './tableview-b81';
import { defaultView, type TableView } from './table-b80';
import type { NavigationRead, NavigationVersion } from './shell-b80';

const COLS = ['source', 'authority', 'connector', 'mode', 'status', 'run', 'automatic', 'evidence', 'health', 'rights'];
const VIEW: TableView = { v: 1, columns: ['source', 'status', 'rights'], sort: [{ key: 'run', dir: 'desc' }, { key: 'source', dir: 'asc' }], filter: 'Red Sea; a;b=c', groupBy: 'mode', density: 'compact', selection: ['x-1'] };
const state = (over: Partial<NavigationVersion> = {}): NavigationVersion => ({
  state_id: 's-3', version: 3, supersedes: 's-2', location: { route: '/observation/evidence', query: 'source=abc', title: 'Evidence' }, return_path: '/observation',
  focus_target: null, recent: [{ route: '/observation' }], favorites: [{ route: '/observation/quarantine', title: 'Quarantine' }], digest: 'd'.repeat(64), saved_at: '2026-10-18T19:00:00Z', ...over,
});
const readOf = (cur: NavigationVersion | null): NavigationRead => ({ principal_id: 'p', scope: 'DOMAIN', read_at: '2026-10-18T19:01:00Z', claim: 'own',
  workspaces: cur === null ? [] : [{ workspace: 'observation', current: cur, versions: cur.version, history: [] }] });

describe('the encoding: one named value, ≤ 200 characters, never the selection', () => {
  it('round-trips every presentation field (the filter text may carry any character); the selection is not stored', () => {
    const e = encodeTableView(VIEW);
    expect(e).toEqual({ ok: true, value: 'v1;c=source,status,rights;s=run:desc|source:asc;g=mode;d=compact;f=Red Sea; a;b=c' });
    const back = parseTableView(e.ok ? e.value : '');
    expect(back).toEqual({ v: 1, columns: ['source', 'status', 'rights'], sort: [{ key: 'run', dir: 'desc' }, { key: 'source', dir: 'asc' }], filter: 'Red Sea; a;b=c', groupBy: 'mode', density: 'compact', selection: [] });
    expect(encodeTableView(defaultView())).toEqual({ ok: true, value: 'v1' });
    expect(parseTableView('v1')).toMatchObject({ columns: [], sort: [], filter: '', groupBy: null, density: 'comfortable' });
  });
  it('refuses what cannot be stored, with the reason; garbage is unreadable, not guessed', () => {
    expect(encodeTableView({ ...VIEW, filter: 'x'.repeat(200) })).toMatchObject({ ok: false, reason: expect.stringMatching(/at most 200 — shorten the filter text/) });
    expect(encodeTableView({ ...VIEW, columns: ['a;b'] })).toMatchObject({ ok: false });
    expect(parseTableView('hello')).toBeNull();
    expect(parseTableView('v1;z=1')).toBeNull();
    expect(viewFilterName('sources')).toBe('table.sources');
    expect(() => viewFilterName('a b')).toThrow();
  });
});

describe('the save carries the person\'s state exactly; the read reconciles by name', () => {
  it('saving a view keeps the saved place, return path, recent places and favourites — only the named value is set; the version read is expected', () => {
    const cur = state({ location: { route: '/observation/evidence', query: 'source=abc', title: 'Evidence', filters: { 'table.other': 'v1', kind: 'pdf' } } });
    const r = viewSaveIntake({ current: cur, workspace: 'observation', route: '/observation/sources', title: 'Registered sources', tableKey: 'sources', view: VIEW });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.intake).toEqual({
      workspace: 'observation', expectedVersion: 3, returnPath: '/observation', focus: null, recent: cur.recent, favorites: cur.favorites,
      location: { route: '/observation/evidence', query: 'source=abc', title: 'Evidence', filters: { 'table.other': 'v1', kind: 'pdf', 'table.sources': 'v1;c=source,status,rights;s=run:desc|source:asc;g=mode;d=compact;f=Red Sea; a;b=c' } },
    });
  });
  it('with no state yet, the place is the table\'s own page (version 0 expected) and its active view is named', () => {
    const r = viewSaveIntake({ current: null, workspace: 'observation', route: '/observation/sources', title: 'Registered sources', tableKey: 'sources', view: defaultView() });
    expect(r).toEqual({ ok: true, intake: { workspace: 'observation', expectedVersion: 0, returnPath: null, focus: null, recent: [], favorites: [],
      location: { route: '/observation/sources', title: 'Registered sources', filters: { 'table.sources': 'v1' }, view: 'table:sources' } } });
  });
  it('the read: none / saved (reconciled — an unknown column or sort NAMED and dropped) / unreadable; the on-screen comparison', () => {
    expect(savedViewOf(readOf(null), 'observation', 'sources', COLS).state).toBe('none');
    expect(savedViewOf(readOf(state()), 'observation', 'sources', COLS).state).toBe('none');
    const cur = state({ version: 7, location: { route: '/observation/sources', filters: { 'table.sources': 'v1;c=source,retired;s=gone:asc|run:desc;d=compact' } } });
    const s = savedViewOf(readOf(cur), 'observation', 'sources', COLS);
    expect(s).toMatchObject({ state: 'saved', version: 7 });
    expect(s.reconciled.view).toMatchObject({ columns: ['source'], sort: [{ key: 'run', dir: 'desc' }], density: 'compact', selection: [] });
    expect(s.reconciled.dropped).toEqual(['column retired', 'sort gone']);
    expect(s.words).toMatch(/version 7.*not restored \(no longer in this table\): column retired, sort gone/);
    expect(viewMatches(s, s.reconciled.view)).toBe(true);
    expect(viewMatches(s, { ...s.reconciled.view, filter: 'x' })).toBe(false);
    expect(savedViewOf(readOf(state({ location: { route: '/observation', filters: { 'table.sources': 'v9;c=a' } } })), 'observation', 'sources', COLS).reconciled.dropped)
      .toEqual(['view version 9 is not readable by this release (expects 1)']);
    expect(savedViewOf(readOf(state({ location: { route: '/observation', filters: { 'table.sources': '{}' } } })), 'observation', 'sources', COLS).state).toBe('unreadable');
  });
  it('a place-save carries the table.* values (and nothing else of the filters)', () => {
    expect(carriedViews(state({ location: { route: '/observation', filters: { 'table.sources': 'v1', kind: 'pdf' } } }))).toEqual({ 'table.sources': 'v1' });
    expect(carriedViews(null)).toEqual({});
  });
});

describe('the real sources', () => {
  const WEB = join(__dirname, '..');
  it('the shell\'s History save carries the views; the register renders the control (the person\'s own read and save — no other port)', () => {
    expect(readFileSync(join(WEB, 'components/shell.tsx'), 'utf8')).toMatch(/\{ filters: carriedViews\(mine\?\.current\) \}/);
    const c = readFileSync(join(WEB, 'app/observation/sources/saved-view-b81.tsx'), 'utf8');
    expect([...c.matchAll(/\b(readNavigation|saveNavigation|call|fetch)\(/g)].map((m) => m[1]).sort()).toEqual(['readNavigation', 'saveNavigation']);
    expect(readFileSync(join(WEB, 'app/observation/sources/page.tsx'), 'utf8')).toMatch(/<SavedViewControl scope=\{scope\} workspace="observation" route="\/observation\/sources"/);
  });
});
