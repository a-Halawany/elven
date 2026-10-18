/**
 * CP-6 B81 §RE — THE SIGN-IN / DEEP-LINK RETURN (F-P7-E-01: UX-11-005, CAP-EO-11's ch11; found by B80's act: login always landed on `/admin`
 * and the shell dropped the URL). Pure functions — the contract the shell (components/shell.tsx, the B81 re block) and the login page
 * (app/login/page.tsx) render; unit-tested in signin-return-b81.test.ts.
 *
 *   · THE SHELL, finding no session (or a session the server no longer accepts), sends the person to `/login?next=<location>` where the
 *     location is the page they asked for — its path AND its query (an as-of deep link keeps its instant and its return token).
 *   · THE LOGIN PAGE honours `next` ONLY when it is a same-origin, absolute in-app path: it starts with exactly one `/`; never `//` (a
 *     protocol-relative host), never a backslash (browsers read `/\host` as `//host`), never a scheme, a control character or white space,
 *     never `..`, never the sign-in page itself (a loop); the characters are the shell's own location rule (lib/shell-b80.ts safeLocation —
 *     the SQL `shell.route_ok` mirrored). Anything else is REFUSED and the landing is as before (`/admin`; the external collaborator's one
 *     surface) — and the page SAYS so, so a walk can assert the outcome either way.
 *   · A return OPENS A PLACE; it never repeats a command and acknowledges nothing (PAT-26): there is no field that could carry one.
 *
 * THREE CLAIMS: construction (this file, its tests, the shell block, the login page); demonstrated operation (the walk
 * e2e/phase6-b81-re.demo.spec.ts on SYNTHETIC personas); real acceptance (H3, through B111's shared recording path) — never claimed here.
 */
import { safeLocation } from './shell-b80';

/** The sign-in page's own route — never a return target (it would loop). */
export const LOGIN_ROUTE = '/login';
/** Where a member lands when there is no (honoured) return. Unchanged from B36/B80 — the hosted phase0 suite asserts it. */
export const DEFAULT_LANDING = '/admin';
/** The external collaborator's one surface (B36 §C1) — its shell is the collaboration surface; a `next` elsewhere is not honoured. */
export const COLLABORATOR_LANDING = '/decisions/workspaces';

export type NextRefusal = 'empty' | 'not_absolute' | 'protocol_relative' | 'backslash' | 'scheme' | 'control' | 'traversal' | 'login_loop' | 'characters' | 'length';
export type NextVerdict = { ok: true; next: string } | { ok: false; refusal: NextRefusal };

/** Words for each refusal — what the login page says when it does not honour a requested return. */
export const NEXT_REFUSAL_WORDS: Readonly<Record<NextRefusal, string>> = {
  empty: 'no return location was requested',
  not_absolute: 'the requested return is not an absolute in-app path',
  protocol_relative: 'the requested return names another host (`//`)',
  backslash: 'the requested return carries a backslash (read by browsers as another host)',
  scheme: 'the requested return carries a scheme (only in-app paths are honoured)',
  control: 'the requested return carries white space or a control character',
  traversal: 'the requested return carries `..`',
  login_loop: 'the requested return is the sign-in page itself',
  characters: 'the requested return carries characters outside an in-app location',
  length: 'the requested return is longer than an in-app location may be',
};

/** THE RULE: may `raw` (the decoded `next` parameter) be honoured as the post-sign-in location? */
export function checkNext(raw: unknown): NextVerdict {
  if (typeof raw !== 'string' || raw.length === 0) return { ok: false, refusal: 'empty' };
  if (raw.length > 600) return { ok: false, refusal: 'length' };
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0020\u007f-\u009f\u2028\u2029]/.test(raw)) return { ok: false, refusal: 'control' };
  if (raw.includes('\\')) return { ok: false, refusal: 'backslash' };
  if (raw.startsWith('//')) return { ok: false, refusal: 'protocol_relative' };
  if (!raw.startsWith('/')) return { ok: false, refusal: /^[A-Za-z][A-Za-z0-9+.-]*:/.test(raw) ? 'scheme' : 'not_absolute' };
  if (raw.includes('//')) return { ok: false, refusal: 'protocol_relative' };
  const path = raw.split(/[?#]/, 1)[0]!;
  if (path.includes(':')) return { ok: false, refusal: 'scheme' };
  if (raw.includes('..')) return { ok: false, refusal: 'traversal' };
  if (path === LOGIN_ROUTE || path.startsWith(`${LOGIN_ROUTE}/`)) return { ok: false, refusal: 'login_loop' };
  if (raw.includes('#') || safeLocation(raw) === null) return { ok: false, refusal: 'characters' };
  return { ok: true, next: raw };
}
/** The honoured return, or null. */
export const safeNext = (raw: unknown): string | null => { const v = checkNext(raw); return v.ok ? v.next : null; };

/**
 * THE SHELL'S HREF: `/login?next=<the place asked for>` from the location the shell is on (`pathname` + `search`). The root and the sign-in
 * page carry no `next`. When the full location (with its query) is not a safe return, the PATH alone is tried — and the login page then
 * opens the page without the query it could not carry (stated by `dropped`), never a different page.
 */
export function loginHref(pathname: string, search = ''): { href: string; next: string | null; dropped: 'none' | 'query' | 'all' } {
  const q = search === '' || search === '?' ? '' : search.startsWith('?') ? search : `?${search}`;
  if (pathname === '' || pathname === '/') return { href: LOGIN_ROUTE, next: null, dropped: 'none' };
  const full = safeNext(`${pathname}${q}`);
  if (full !== null) return { href: `${LOGIN_ROUTE}?next=${encodeURIComponent(full)}`, next: full, dropped: 'none' };
  const bare = safeNext(pathname);
  if (bare !== null) return { href: `${LOGIN_ROUTE}?next=${encodeURIComponent(bare)}`, next: bare, dropped: 'query' };
  return { href: LOGIN_ROUTE, next: null, dropped: 'all' };
}

/** What the login page says about the return BEFORE sign-in (an observable outcome: the walk asserts it). */
export interface ReturnNotice { state: 'none' | 'honoured' | 'refused'; next: string | null; text: string }
export function returnNotice(raw: string | null): ReturnNotice {
  if (raw === null || raw === '') return { state: 'none', next: null, text: '' };
  const v = checkNext(raw);
  if (v.ok) return { state: 'honoured', next: v.next, text: `After you sign in, you return to ${v.next} — it opens the place; it repeats no action.` };
  return { state: 'refused', next: null, text: `The requested return was not honoured: ${NEXT_REFUSAL_WORDS[v.refusal]}. After you sign in, you land on the default page.` };
}

/**
 * WHERE A SUCCESSFUL SIGN-IN LANDS. The external collaborator keeps its one surface (B36 §C1: its shell IS that surface — any other route
 * would refuse it); a member goes to the honoured `next`, else to `/admin` exactly as before.
 */
export function landingAfterSignIn(a: { next: string | null; roles: readonly string[] }): string {
  if (a.roles.length > 0 && a.roles.every((r) => r === 'external_collaborator')) return COLLABORATOR_LANDING;
  return safeNext(a.next) ?? DEFAULT_LANDING;
}
