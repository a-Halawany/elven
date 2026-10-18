/**
 * CP-6 B81 §RE — THE TABLE VIEW SAVED PER PERSON (F-P7-E-05: UX-22-002) through B80's `shell.navigation_states` (0118 §SH; no new SQL).
 *
 *   · WHERE IT LIVES: a person's navigation state per workspace carries a location whose `filters` are named short values (≤ 20 names, each
 *     ≤ 200 characters — shell.location_problem). A table's view is ONE named value `table.<key>` (lib/table-b80.ts viewStateKey, the dot
 *     form the filter-name rule admits) — so saving a view NEVER moves the person's saved place (route, query, title, return path, recent,
 *     favourites are carried exactly as read), and saving their place keeps their views (the shell's History panel carries the `table.*`
 *     values — components/shell.tsx, B81 re).
 *   · VERSIONED: each save is a NEW version of the state (append-only; the port refuses `(stale)` when the save read an older version —
 *     the page shows the refusal in the server's words and reads again; nothing is overwritten).
 *   · RECONCILED BY NAME: a stored view is decoded against TODAY's columns (lib/table-b80.ts decodeView): an unknown column, sort key or
 *     grouping is DROPPED AND NAMED — a restored view never pretends to be what was saved.
 *   · A VIEW IS PRESENTATION: columns, sort, filter text, grouping, density. The SELECTION is never saved (a selection is the moment's;
 *     restoring one could look like a prepared action) and nothing in a view can carry a command.
 *
 * THREE CLAIMS: construction (here, tableview-b81.test.ts, the sources register's block); demonstrated operation (the act / walk on
 * SYNTHETIC personas); real acceptance (H3) — never claimed.
 */
import { decodeView, defaultView, VIEW_VERSION, type Reconciled, type TableView } from './table-b80';
import type { NavigationRead, NavigationVersion, SaveIntake, SavedLocation } from './shell-b80';
import type { WorkspaceKey } from './b80-seams';

export const VIEW_FILTER_PREFIX = 'table.';
const NAME_RE = /^[A-Za-z][A-Za-z0-9_.-]{0,60}$/;
const KEY_RE = /^[A-Za-z0-9_-]{1,40}$/;
export const VIEW_VALUE_MAX = 200;

/** The filter name a table's view is stored under. */
export function viewFilterName(tableKey: string): string {
  const n = `${VIEW_FILTER_PREFIX}${tableKey}`;
  if (!KEY_RE.test(tableKey) || !NAME_RE.test(n)) throw new Error(`a table key is 1–40 letters, digits, _ or - (${tableKey})`);
  return n;
}

export type Encoded = { ok: true; value: string } | { ok: false; reason: string };
/** `v1;c=a,b;s=k:asc|k2:desc;g=key;d=compact;f=<filter text>` — the filter text last (it may carry any character). */
export function encodeTableView(view: TableView): Encoded {
  const bad = [...view.columns, ...view.sort.map((s) => s.key), ...(view.groupBy === null ? [] : [view.groupBy])].find((k) => !KEY_RE.test(k));
  if (bad !== undefined) return { ok: false, reason: `the column key ${bad} cannot be stored in a view` };
  const parts = [`v${VIEW_VERSION}`];
  if (view.columns.length > 0) parts.push(`c=${view.columns.join(',')}`);
  if (view.sort.length > 0) parts.push(`s=${view.sort.map((s) => `${s.key}:${s.dir}`).join('|')}`);
  if (view.groupBy !== null) parts.push(`g=${view.groupBy}`);
  if (view.density !== 'comfortable') parts.push(`d=${view.density}`);
  if (view.filter !== '') parts.push(`f=${view.filter}`);
  const value = parts.join(';');
  if (value.length > VIEW_VALUE_MAX) return { ok: false, reason: `this view is ${value.length} characters; a saved view is at most ${VIEW_VALUE_MAX} — shorten the filter text` };
  return { ok: true, value };
}
/** The stored value back as a raw view record (what decodeView reconciles) — null when it is not one. */
export function parseTableView(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string') return null;
  const m = /^v(\d+)(?:;|$)/.exec(value);
  if (m === null) return null;
  const out: Record<string, unknown> = { v: Number(m[1]), columns: [], sort: [], filter: '', groupBy: null, density: 'comfortable', selection: [] };
  let rest = value.slice(m[0].length);
  while (rest.length > 0) {
    const k = rest.slice(0, 2);
    if (k === 'f=') { out['filter'] = rest.slice(2); break; }
    const end = rest.indexOf(';');
    const seg = end < 0 ? rest : rest.slice(0, end);
    rest = end < 0 ? '' : rest.slice(end + 1);
    const v = seg.slice(2);
    if (k === 'c=') out['columns'] = v.split(',').filter((x) => x !== '');
    else if (k === 's=') out['sort'] = v.split('|').filter((x) => x !== '').map((x) => { const [key, dir] = x.split(':'); return { key, dir }; });
    else if (k === 'g=') out['groupBy'] = v;
    else if (k === 'd=') out['density'] = v;
    else return null;
  }
  return out;
}

export interface SavedView { state: 'none' | 'saved' | 'unreadable'; version: number | null; savedAt: string | null; reconciled: Reconciled; words: string }
/** The person's saved view of a table, from THEIR navigation read — reconciled against today's columns. */
export function savedViewOf(read: NavigationRead | null, workspace: WorkspaceKey, tableKey: string, columnKeys: readonly string[]): SavedView {
  const none: SavedView = { state: 'none', version: null, savedAt: null, reconciled: { view: defaultView(), dropped: [] }, words: 'no saved view of this table — the default view is shown' };
  const mine = read?.workspaces.find((w) => w.workspace === workspace) ?? null;
  const raw = mine?.current.location.filters?.[viewFilterName(tableKey)];
  if (mine === null || raw === undefined) return none;
  const parsed = parseTableView(raw);
  if (parsed === null) return { ...none, state: 'unreadable', version: mine.current.version, savedAt: mine.current.saved_at, words: 'your saved view of this table could not be read by this release — the default view is shown' };
  const reconciled = decodeView(parsed, columnKeys);
  const dropped = reconciled.dropped.length === 0 ? '' : ` — not restored (no longer in this table): ${reconciled.dropped.join(', ')}`;
  return { state: 'saved', version: mine.current.version, savedAt: mine.current.saved_at, reconciled, words: `your saved view (navigation state version ${mine.current.version}, saved ${mine.current.saved_at})${dropped}` };
}

/**
 * THE SAVE INTAKE for `shell.navigation.save`: the person's current state CARRIED EXACTLY (their saved place, return path, focus, recent
 * places, favourites and every other named value), with this table's view set under its name. With no state yet, the place is the table's
 * own page. The version read is the version expected — a concurrent save is refused `(stale)` by the port.
 */
export function viewSaveIntake(a: { current: NavigationVersion | null; workspace: WorkspaceKey; route: string; title: string; tableKey: string; view: TableView }):
  { ok: true; intake: SaveIntake } | { ok: false; reason: string } {
  const enc = encodeTableView(a.view);
  if (!enc.ok) return enc;
  const name = viewFilterName(a.tableKey);
  const c = a.current;
  const base: SavedLocation = c === null ? { route: a.route, title: a.title.slice(0, 160) } : { ...c.location };
  const filters = { ...(base.filters ?? {}), [name]: enc.value };
  if (Object.keys(filters).length > 20) return { ok: false, reason: 'your navigation state already carries 20 named values; a view cannot be added' };
  const location: SavedLocation = { ...base, filters, ...(base.route === a.route ? { view: `table:${a.tableKey}` } : {}) };
  return { ok: true, intake: {
    workspace: a.workspace, expectedVersion: c?.version ?? 0, location, returnPath: c?.return_path ?? null, focus: c?.focus_target ?? null,
    recent: c?.recent ?? [], favorites: c?.favorites ?? [],
  } };
}

/** The `table.*` values a place-save must carry so that saving a place never drops the person's table views. */
export function carriedViews(current: NavigationVersion | null | undefined): Record<string, string> {
  const f = current?.location.filters ?? {};
  return Object.fromEntries(Object.entries(f).filter(([k]) => k.startsWith(VIEW_FILTER_PREFIX)));
}

/** Is the view on screen the one saved? (a client-side comparison; the stored version is the authority.) */
export function viewMatches(saved: SavedView, view: TableView): boolean {
  const a = encodeTableView({ ...view, selection: [] }); const b = encodeTableView({ ...saved.reconciled.view, selection: [] });
  return saved.state === 'saved' && a.ok && b.ok && a.value === b.value;
}
